const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = Number(process.env.PORT || process.argv[2] || 5173);
const ROOT = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const ENV_FILE = path.join(ROOT, ".env");

loadEnv();

const AI_PROVIDER = (process.env.AI_PROVIDER || "local").toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function loadEnv() {
  try {
    const raw = require("fs").readFileSync(ENV_FILE, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) return;
      const splitAt = clean.indexOf("=");
      if (splitAt === -1) return;
      const key = clean.slice(0, splitAt).trim();
      const value = clean.slice(splitAt + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
  } catch {
    // .env is optional; local analyzer remains the fallback.
  }
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    const seed = await fs.readFile(SEED_FILE, "utf8");
    await fs.writeFile(STORE_FILE, seed);
  }
}

async function readStore() {
  await ensureStore();
  return JSON.parse(await fs.readFile(STORE_FILE, "utf8"));
}

async function writeStore(store) {
  await fs.writeFile(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function getCommunity(store, communityId) {
  return store.communities.find((community) => community.id === communityId);
}

function normalizeStore(store) {
  store.communities.forEach((community) => {
    if (!Array.isArray(community.channels)) {
      community.channels = [
        {
          id: "general",
          name: "general",
          type: "public",
          posting: "all",
          topic: "Main conversation and daily coordination",
        },
      ];
    }

    community.messages.forEach((message) => {
      if (!message.channelId) message.channelId = community.channels[0].id;
    });

    if (!Array.isArray(community.members)) {
      const authors = [...new Set(community.messages.map((message) => message.author))];
      community.members = authors.map((name, index) => ({
        id: `${community.id}-member-${index + 1}`,
        name,
        role: index === 0 ? "Owner" : "Member",
        status: "Active",
      }));
    }

    if (!Array.isArray(community.invites)) {
      community.invites = [];
    }
  });

  return store;
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function tagMessage(text) {
  const lower = text.toLowerCase();
  const tags = [];
  if (lower.includes("?")) tags.push("question");
  if (/(decided|decision|final|approved|scope|committing|locked)/.test(lower)) tags.push("decision");
  if (/(due|deadline|by |today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d:\d\d)/.test(lower)) tags.push("deadline");
  if (/(need|owner|volunteer|update|handle|take photos|prepare|bring)/.test(lower)) tags.push("task");
  if (/(block|risk|stuck|rate limit|flood|problem|missing|confusing)/.test(lower)) tags.push("risk");
  if (/(drive|http|www|\.com|\.png|\.pdf|link)/.test(lower)) tags.push("link");
  if (/(new member|onboarding|for new|first time)/.test(lower)) tags.push("onboarding");
  return [...new Set(tags)];
}

function isImportant(message) {
  return message.tags.some((tag) => ["decision", "deadline", "task", "risk", "link", "onboarding"].includes(tag));
}

function isNoiseMessage(message) {
  return /\b(porn|nsfw|spam)\b/i.test(message.text || "");
}

function normalizeMessage(raw, fallbackAuthor = "Member") {
  const tags = tagMessage(raw.text);
  return {
    id: raw.id || randomUUID(),
    channelId: raw.channelId || "general",
    author: raw.author || fallbackAuthor,
    time: raw.time || nowLabel(),
    text: raw.text.trim(),
    tags,
    important: tags.length > 0,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function metricCounts(messages) {
  return {
    messages: messages.length,
    deadlines: messages.filter((message) => message.tags.includes("deadline")).length,
    decisions: messages.filter((message) => message.tags.includes("decision")).length,
    risks: messages.filter((message) => message.tags.includes("risk")).length,
    signal: Math.min(96, 62 + messages.filter(isImportant).length * 3),
  };
}

function aiStatus() {
  return {
    provider: AI_PROVIDER === "groq" && GROQ_API_KEY ? "groq" : "local",
    model: AI_PROVIDER === "groq" && GROQ_API_KEY ? GROQ_MODEL : "rule-based analyzer",
    configured: AI_PROVIDER === "groq" ? Boolean(GROQ_API_KEY) : true,
  };
}

function messagesForScope(community, scope = "channel", channelId = null) {
  if (scope === "community" || !channelId) return community.messages;
  return community.messages.filter((message) => message.channelId === channelId);
}

function compactMessages(messages) {
  return messages
    .slice(-80)
    .map((message) => `[${message.id}] ${message.time} ${message.author}: ${message.text}`)
    .join("\n");
}

function sentenceCase(text) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function titleFromMessage(message) {
  const text = message.text.replace(/^(reminder|decision log|budget update|deadline check):\s*/i, "");
  const first = text.split(/[.!?]/)[0] || text;
  return sentenceCase(first.length > 78 ? `${first.slice(0, 75)}...` : first);
}

function makeSummary(type, color, message, bodyPrefix) {
  return {
    type,
    color,
    title: titleFromMessage(message),
    body: `${bodyPrefix} ${message.text}`,
    sources: [message.id],
  };
}

function analyzeCommunity(community, channelId = null) {
  const scopedMessages = channelId
    ? community.messages.filter((message) => message.channelId === channelId)
    : community.messages;

  const messages = scopedMessages
    .filter((message) => !isNoiseMessage(message))
    .map((message) => ({
      ...message,
      tags: message.tags && message.tags.length ? message.tags : tagMessage(message.text),
    }));

  const decisions = messages.filter((message) => message.tags.includes("decision"));
  const deadlines = messages.filter((message) => message.tags.includes("deadline"));
  const risks = messages.filter((message) => message.tags.includes("risk"));
  const links = messages.filter((message) => message.tags.includes("link"));
  const onboarding = messages.filter((message) => message.tags.includes("onboarding"));
  const important = messages.filter(isImportant);

  const summaries = [
    ...decisions.slice(-2).map((message) => makeSummary("Decision", "#0f766e", message, "The community settled on this:")),
    ...deadlines.slice(-2).map((message) => makeSummary("Deadline", "#b7791f", message, "A time-sensitive update was found:")),
    ...risks.slice(-2).map((message) => makeSummary("Risk", "#b4234f", message, "This may need attention:")),
    ...links.slice(-1).map((message) => makeSummary("Link", "#2563eb", message, "A resource was shared:")),
  ].slice(0, 6);

  if (summaries.length === 0 && messages.length) {
    summaries.push(makeSummary("Update", "#2563eb", messages[messages.length - 1], "Recent activity:"));
  }

  const actions = messages
    .filter((message) => message.tags.includes("task") || message.tags.includes("risk"))
    .slice(-6)
    .map((message) => ({
      title: titleFromMessage(message),
      owner: inferOwner(message),
      due: inferDue(message),
      priority: message.tags.includes("risk") ? "high" : message.tags.includes("deadline") ? "medium" : "low",
      detail: message.text,
      sourceId: message.id,
    }));

  const briefBullets = [
    ...decisions.slice(-2).map((message) => titleFromMessage(message)),
    ...deadlines.slice(-2).map((message) => titleFromMessage(message)),
    ...risks.slice(-1).map((message) => titleFromMessage(message)),
    ...onboarding.slice(-1).map((message) => titleFromMessage(message)),
  ].slice(0, 5);

  return {
    summaries,
    actions,
    onboarding: {
      title: `${community.name} latest brief`,
      body: important.length
        ? "Clamor found the most useful context for someone catching up or joining today."
        : "There is not much structured activity yet. Add messages or import a chat log to build memory.",
      bullets: briefBullets.length ? briefBullets : ["No major decisions or deadlines detected yet."],
    },
    sourceTrail: important.slice(-6).reverse().map((message) => message.id),
    metrics: metricCounts(messages),
  };
}

function inferOwner(message) {
  const match = message.text.match(/\b(I|[A-Z][a-z]+)\s+(can|will|am|is)\b/);
  if (!match) return "Unassigned";
  return match[1] === "I" ? message.author : match[1];
}

function inferDue(message) {
  const text = message.text;
  const day = text.match(/\b(today|tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
  const time = text.match(/\b\d{1,2}:\d{2}\s?(AM|PM)?\b/i);
  if (day && time) return `${day[0]}, ${time[0]}`;
  if (time) return time[0];
  if (day) return day[0];
  return "No due date found";
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "did",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "into",
  "is",
  "me",
  "need",
  "of",
  "on",
  "our",
  "should",
  "that",
  "the",
  "their",
  "there",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function detectQuestionIntent(questionText) {
  const lower = String(questionText || "").toLowerCase();
  const intents = [];
  if (/(decid|approved|final|choice|settled|funding|budget|scope)/.test(lower)) intents.push("decision");
  if (/(when|date|time|deadline|due|meeting|schedule|prepare|bring)/.test(lower)) intents.push("deadline");
  if (/(task|todo|action|owner|responsib|who|assigned|volunteer|prepare|bring)/.test(lower)) intents.push("task");
  if (/(block|risk|stuck|issue|problem|missing|confus|limit)/.test(lower)) intents.push("risk");
  if (/(link|doc|drive|file|resource|shared|url|website)/.test(lower)) intents.push("link");
  if (/(new|join|onboard|catch up|missed|what changed|recap|summary|latest)/.test(lower)) intents.push("onboarding");
  return intents.length ? [...new Set(intents)] : ["important"];
}

function expandQuestionTokens(questionText) {
  const lower = String(questionText || "").toLowerCase();
  const tokens = tokenize(questionText);
  const expansions = [];
  if (/(funding|budget|money|cost|approved|asi)/.test(lower)) expansions.push("budget", "approved", "asi", "funding", "money", "$");
  if (/(meeting|event|prepare|bring|when)/.test(lower)) expansions.push("meeting", "panel", "prep", "prepare", "bring", "starts", "doors");
  if (/(link|doc|drive|file|resource)/.test(lower)) expansions.push("drive", "link", "http", "file", "resource");
  if (/(block|risk|stuck|issue)/.test(lower)) expansions.push("risk", "stuck", "missing", "need", "limit", "problem");
  return [...new Set([...tokens, ...expansions])];
}

function messageTimeValue(message) {
  const parsed = Date.parse(message.createdAt || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function channelNameForMessage(community, message) {
  const channel = community.channels.find((item) => item.id === message.channelId);
  if (!channel) return "unknown";
  return `${channel.type === "private" ? "@" : "#"}${channel.name}`;
}

function scoreMessageForQuestion(message, tokens, intents, index) {
  const text = message.text.toLowerCase();
  const tagSet = new Set(message.tags || []);
  const tokenScore = tokens.reduce((sum, token) => {
    if (text.includes(token)) return sum + (token.length > 5 ? 4 : 3);
    return sum;
  }, 0);
  const intentScore = intents.reduce((sum, intent) => {
    if (intent === "important") return sum + (isImportant(message) ? 2 : 0);
    return sum + (tagSet.has(intent) ? 7 : 0);
  }, 0);
  const questionBonus = tagSet.has("question") && intents.includes("task") ? 2 : 0;
  const recencyBonus = Math.min(4, Math.max(0, index / 20));
  return tokenScore + intentScore + questionBonus + (message.important ? 1 : 0) + recencyBonus;
}

function pickEvidence(messages, questionText) {
  const tokens = expandQuestionTokens(questionText);
  const intents = detectQuestionIntent(questionText);
  const scored = messages
    .map((message, index) => ({
      message,
      score: scoreMessageForQuestion(message, tokens, intents, index),
    }))
    .filter((item) => item.score > 1)
    .sort((a, b) => b.score - a.score || messageTimeValue(b.message) - messageTimeValue(a.message));

  const evidence = [];
  const seen = new Set();
  for (const item of scored) {
    if (seen.has(item.message.id)) continue;
    evidence.push(item.message);
    seen.add(item.message.id);
    if (evidence.length === 5) break;
  }

  if (!evidence.length) {
    return messages
      .filter(isImportant)
      .sort((a, b) => messageTimeValue(b) - messageTimeValue(a))
      .slice(0, 4);
  }

  return evidence;
}

function cleanMessageText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function formatSourceLine(community, message) {
  return `${message.author} in ${channelNameForMessage(community, message)}: ${cleanMessageText(message.text)}`;
}

function synthesizeLocalAnswer(community, questionText, evidence) {
  if (!evidence.length) {
    return "I could not find enough saved message history to answer that yet. Import or post more chat context first.";
  }

  const intents = detectQuestionIntent(questionText);
  const questionLower = String(questionText || "").toLowerCase();
  const sorted = [...evidence];
  const decisions = sorted.filter((message) => message.tags.includes("decision"));
  const deadlines = sorted.filter((message) => message.tags.includes("deadline"));
  const tasks = sorted.filter((message) => message.tags.includes("task") || message.tags.includes("risk"));
  const links = sorted.filter((message) => message.tags.includes("link"));
  const risks = sorted.filter((message) => message.tags.includes("risk"));

  if (intents.includes("onboarding")) {
    return `Here is the latest useful context: ${sorted.slice(0, 4).map((message) => formatSourceLine(community, message)).join(" ")}`;
  }

  if (intents.includes("link") && links.length) {
    return `I found ${links.length} shared resource${links.length === 1 ? "" : "s"}: ${links.map((message) => formatSourceLine(community, message)).join(" ")}`;
  }

  if (intents.includes("risk") && intents.includes("task") && tasks.length) {
    return `The main blockers and action items I found: ${tasks.slice(0, 3).map((message) => {
      const owner = inferOwner(message);
      const due = inferDue(message);
      return `${formatSourceLine(community, message)}${owner !== "Unassigned" ? ` Owner: ${owner}.` : ""}${due !== "No due date found" ? ` Due: ${due}.` : ""}`;
    }).join(" ")}`;
  }

  if (intents.includes("risk") && risks.length) {
    return `The main blocker${risks.length === 1 ? " is" : "s are"}: ${risks.map((message) => formatSourceLine(community, message)).join(" ")}`;
  }

  if (intents.includes("decision") && decisions.length) {
    return `The clearest decision I found: ${decisions.map((message) => formatSourceLine(community, message)).join(" ")}`;
  }

  if (intents.includes("deadline") && intents.includes("task") && (deadlines.length || tasks.length)) {
    const meetingTiming = /(meeting|panel|doors|starts|call time|baker|thursday|tonight)/i;
    const prepContext = /(bring|prepare|prep|laptop|resume|new members|feedback)/i;
    const timingSource = questionLower.includes("meeting")
      ? deadlines.filter((message) => meetingTiming.test(message.text))
      : deadlines;
    const prepSource = /(prepare|bring)/.test(questionLower)
      ? tasks.filter((message) => prepContext.test(message.text))
      : tasks;
    const timing = (timingSource.length ? timingSource : deadlines).slice(0, 3).map((message) => formatSourceLine(community, message));
    const preparation = (prepSource.length ? prepSource : tasks).slice(0, 3).map((message) => formatSourceLine(community, message));
    return [
      timing.length ? `Timing: ${timing.join(" ")}` : "",
      preparation.length ? `Preparation/action items: ${preparation.join(" ")}` : "",
    ].filter(Boolean).join(" ");
  }

  if (intents.includes("task") && tasks.length) {
    return `The active work I found: ${tasks.slice(0, 3).map((message) => {
      const owner = inferOwner(message);
      const due = inferDue(message);
      return `${formatSourceLine(community, message)}${owner !== "Unassigned" ? ` Owner: ${owner}.` : ""}${due !== "No due date found" ? ` Due: ${due}.` : ""}`;
    }).join(" ")}`;
  }

  if (intents.includes("deadline") && deadlines.length) {
    return `The timing details I found: ${deadlines.map((message) => formatSourceLine(community, message)).join(" ")}`;
  }

  const headline = sorted[0];
  const supporting = sorted.slice(1, 3);
  return `Best answer from saved memory: ${formatSourceLine(community, headline)}${
    supporting.length ? ` Related context: ${supporting.map((message) => formatSourceLine(community, message)).join(" ")}` : ""
  }`;
}

function narrowEvidenceToIntent(evidence, questionText) {
  const intents = detectQuestionIntent(questionText).filter((intent) => intent !== "important");
  const lower = String(questionText || "").toLowerCase();
  if (!intents.length) return evidence;
  let narrowed = evidence.filter((message) => intents.some((intent) => message.tags.includes(intent)));
  if ((intents.includes("risk") || intents.includes("task")) && !/(new|join|onboard|prepare|bring|catch up|missed)/.test(lower)) {
    const withoutOnboarding = narrowed.filter((message) => !message.tags.includes("onboarding"));
    if (withoutOnboarding.length) narrowed = withoutOnboarding;
  }
  return narrowed.length ? narrowed : evidence;
}

function answerQuestion(community, question) {
  const channelId = question.channelId || null;
  const questionText = typeof question === "string" ? question : question.text;
  const messages = messagesForScope(community, question.scope || "channel", channelId)
    .filter((message) => !isNoiseMessage(message))
    .map((message) => ({
      ...message,
      tags: message.tags && message.tags.length ? message.tags : tagMessage(message.text),
    }))
    .sort((a, b) => messageTimeValue(a) - messageTimeValue(b));
  const evidence = pickEvidence(messages, questionText);
  let focusedEvidence = narrowEvidenceToIntent(evidence, questionText).slice(0, 4);
  const intents = detectQuestionIntent(questionText);
  if (intents.includes("deadline") && intents.includes("task") && /meeting|prepare|bring/i.test(questionText)) {
    const focusedMeetingEvidence = focusedEvidence.filter((message) =>
      /(meeting|panel|doors|starts|call time|baker|thursday|tonight|bring laptop|prepare|prep session|new members|feedback)/i.test(message.text),
    );
    if (focusedMeetingEvidence.length) focusedEvidence = focusedMeetingEvidence;
  }
  const answer = synthesizeLocalAnswer(community, questionText, focusedEvidence);

  return {
    question: questionText,
    answer,
    sources: focusedEvidence.map((message) => message.id),
    provider: "local",
    confidence: focusedEvidence.length ? `${focusedEvidence.length} source${focusedEvidence.length === 1 ? "" : "s"}` : "No source match",
  };
}

async function callGroq(messages, questionText, scopeLabel) {
  if (AI_PROVIDER !== "groq" || !GROQ_API_KEY) return null;
  const focusedMessages = pickEvidence(
    messages.map((message) => ({
      ...message,
      tags: message.tags && message.tags.length ? message.tags : tagMessage(message.text),
    })),
    questionText,
  );
  const promptMessages = focusedMessages.length ? focusedMessages : messages.slice(-20);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You answer questions about community chat history. Use only the provided messages. Return strict JSON with keys: answer string, sources array of message ids, confidence string. Be specific, cite the message ids you used, and say when the evidence is incomplete.",
        },
        {
          role: "user",
          content: `Scope: ${scopeLabel}\nQuestion: ${questionText}\nRelevant messages:\n${compactMessages(promptMessages)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${text.slice(0, 160)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    question: questionText,
    answer: parsed.answer || "I could not find enough context to answer that.",
    sources: Array.isArray(parsed.sources) && parsed.sources.length
      ? parsed.sources.slice(0, 5)
      : promptMessages.slice(0, 4).map((message) => message.id),
    provider: `groq:${GROQ_MODEL}`,
    confidence: parsed.confidence || "AI generated",
  };
}

async function answerWithProvider(community, body) {
  const scope = body.scope || (body.channelId ? "channel" : "community");
  const messages = messagesForScope(community, scope, body.channelId);
  const channel = body.channelId ? getChannel(community, body.channelId) : null;
  const scopeLabel = scope === "community" ? community.name : `${community.name} / ${channel?.name || "channel"}`;

  try {
    const aiAnswer = await callGroq(messages, body.question, scopeLabel);
    if (aiAnswer) return aiAnswer;
  } catch (error) {
    return {
      ...answerQuestion(community, { text: body.question, channelId: body.channelId, scope }),
      provider: "local fallback",
      confidence: "Groq unavailable",
      warning: error.message,
    };
  }

  return answerQuestion(community, { text: body.question, channelId: body.channelId, scope });
}

function colorForType(type) {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("decision")) return "#0f766e";
  if (lower.includes("deadline")) return "#b7791f";
  if (lower.includes("risk") || lower.includes("block")) return "#b4234f";
  if (lower.includes("link") || lower.includes("resource")) return "#2563eb";
  return "#2563eb";
}

function cleanOverviewShape(raw, fallback) {
  return {
    summaries: Array.isArray(raw.summaries) && raw.summaries.length
      ? raw.summaries.slice(0, 6).map((item) => ({
          type: item.type || "Update",
          color: item.color || colorForType(item.type),
          title: item.title || "Important update",
          body: item.body || "",
          sources: Array.isArray(item.sources) ? item.sources.slice(0, 4) : [],
        }))
      : fallback.summaries,
    actions: Array.isArray(raw.actions)
      ? raw.actions.slice(0, 8).map((item) => ({
          title: item.title || "Follow up",
          owner: item.owner || "Unassigned",
          due: item.due || "No due date found",
          priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
          detail: item.detail || item.title || "Action item from community memory.",
          sourceId: item.sourceId || item.sources?.[0] || "",
        }))
      : fallback.actions,
    onboarding: {
      title: raw.onboarding?.title || fallback.onboarding.title,
      body: raw.onboarding?.body || fallback.onboarding.body,
      bullets: Array.isArray(raw.onboarding?.bullets) && raw.onboarding.bullets.length
        ? raw.onboarding.bullets.slice(0, 6)
        : fallback.onboarding.bullets,
    },
    sourceTrail: Array.isArray(raw.sourceTrail) && raw.sourceTrail.length ? raw.sourceTrail.slice(0, 8) : fallback.sourceTrail,
    metrics: fallback.metrics,
  };
}

async function overviewWithProvider(community, body) {
  const scope = body.scope || (body.channelId ? "channel" : "community");
  const channelId = scope === "channel" ? body.channelId : null;
  const messages = messagesForScope(community, scope, channelId);
  const fallback = analyzeCommunity(community, channelId);
  const channel = channelId ? getChannel(community, channelId) : null;
  const scopeLabel = scope === "community" ? community.name : `${community.name} / ${channel?.name || "channel"}`;

  if (AI_PROVIDER !== "groq" || !GROQ_API_KEY) {
    return { memory: fallback, provider: "local", scope };
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You analyze community chat history. Return strict JSON with keys: summaries array, actions array, onboarding object, sourceTrail array. Use only provided message ids for sources/sourceTrail. Keep it concise and presentation-ready.",
          },
          {
            role: "user",
            content:
              `Scope: ${scopeLabel}\n` +
              "Each summary needs type,title,body,sources. Each action needs title,owner,due,priority,detail,sourceId. Onboarding needs title,body,bullets.\n" +
              `Messages:\n${compactMessages(messages)}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Groq overview failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return {
      memory: cleanOverviewShape(parsed, fallback),
      provider: `groq:${GROQ_MODEL}`,
      scope,
    };
  } catch (error) {
    return {
      memory: fallback,
      provider: "local fallback",
      scope,
      warning: error.message,
    };
  }
}

function createInvite(community, email, role) {
  const invite = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    role: role || "Member",
    status: "Pending",
    inviteCode: `${community.id}-${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };

  community.invites.push(invite);
  return invite;
}

function parseImportedMessages(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(?:\[(.*?)\]\s*)?([^:]{1,40}):\s*(.+)$/);
      if (!match) return normalizeMessage({ author: "Imported", text: line });
      return normalizeMessage({
        time: match[1] || nowLabel(),
        author: match[2].trim(),
        text: match[3].trim(),
      });
    });
}

function publicState(store) {
  normalizeStore(store);

  return {
    communities: store.communities.map((community) => ({
      ...community,
      channels: community.channels.map((channel) => ({
        ...channel,
        memory: analyzeCommunity(community, channel.id),
        messageCount: community.messages.filter((message) => message.channelId === channel.id).length,
      })),
      memory: analyzeCommunity(community),
    })),
  };
}

function getChannel(community, channelId) {
  return community.channels.find((channel) => channel.id === channelId) || community.channels[0];
}

function canPostInChannel(community, channel, author) {
  if (channel.posting === "all") return true;
  const member = community.members.find((item) => item.name.toLowerCase() === author.toLowerCase());
  return ["Owner", "Moderator"].includes(member?.role);
}

function slugifyChannelName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function buildPresenterReport(community) {
  const memory = analyzeCommunity(community);
  const lines = [
    `# ${community.name} Clamor Report`,
    "",
    `Type: ${community.platform}`,
    `Members: ${community.members.length}`,
    `Channels: ${community.channels.length}`,
    `Messages: ${community.messages.length}`,
    `Signal score: ${memory.metrics.signal}`,
    "",
    "## Channel Activity",
    ...community.channels.map((channel) => `- ${channel.type === "private" ? "@" : "#"}${channel.name}: ${community.messages.filter((message) => message.channelId === channel.id).length} messages, posting: ${channel.posting}`),
    "",
    "## What Matters",
    ...memory.summaries.map((summary) => `- ${summary.type}: ${summary.title} - ${summary.body}`),
    "",
    "## Open Actions",
    ...(memory.actions.length ? memory.actions.map((action) => `- [${action.priority}] ${action.title} | owner: ${action.owner} | due: ${action.due}`) : ["- No open actions detected."]),
    "",
    "## Presenter Notes",
    "- Show channel-specific memory first.",
    "- Switch to Whole Community to show leadership-level intelligence.",
    "- Ask a question and point to source-backed answers.",
  ];

  return `${lines.join("\n")}\n`;
}

function buildDailyDigest(community, body = {}) {
  const scope = body.scope || (body.channelId ? "channel" : "community");
  const channelId = scope === "channel" ? body.channelId : null;
  const messages = messagesForScope(community, scope, channelId)
    .filter((message) => !isNoiseMessage(message))
    .map((message) => ({
      ...message,
      tags: message.tags && message.tags.length ? message.tags : tagMessage(message.text),
    }));
  const memory = analyzeCommunity(community, channelId);
  const decisions = messages.filter((message) => message.tags.includes("decision")).slice(-3).reverse();
  const deadlines = messages.filter((message) => message.tags.includes("deadline")).slice(-3).reverse();
  const risks = messages.filter((message) => message.tags.includes("risk")).slice(-3).reverse();
  const links = messages.filter((message) => message.tags.includes("link")).slice(-3).reverse();
  const actions = memory.actions.slice(0, 4);
  const timeline = messages.filter(isImportant).slice(-6).reverse();
  const rawMessages = messages.length;
  const uniqueSources = new Set([
    ...decisions.map((message) => message.id),
    ...deadlines.map((message) => message.id),
    ...risks.map((message) => message.id),
    ...links.map((message) => message.id),
    ...actions.map((action) => action.sourceId).filter(Boolean),
  ]);
  const reducedItems = Math.min(rawMessages || 1, Math.max(uniqueSources.size, 1));
  const savedMinutes = Math.max(8, rawMessages * 3 + actions.length * 4);
  const scopeLabel = scope === "community"
    ? community.name
    : `${community.name} / ${getChannel(community, channelId)?.name || "channel"}`;

  return {
    headline: `${scopeLabel} reduced ${rawMessages} messages into ${Math.max(reducedItems, 1)} useful items.`,
    summary: "Clamor grouped the day into decisions, timing, blockers, resources, and owners so a member can catch up without reading every message.",
    metrics: {
      rawMessages,
      reducedItems: Math.max(reducedItems, 1),
      savedMinutes,
      signalRate: rawMessages ? Math.round((messages.filter(isImportant).length / rawMessages) * 100) : 0,
    },
    sections: [
      { title: "Decisions", items: decisions.map((message) => message.text), sources: decisions.map((message) => message.id) },
      { title: "Deadlines", items: deadlines.map((message) => message.text), sources: deadlines.map((message) => message.id) },
      { title: "Blockers", items: risks.map((message) => message.text), sources: risks.map((message) => message.id) },
      { title: "Action Items", items: actions.map((action) => `${action.title} | owner: ${action.owner} | due: ${action.due}`), sources: actions.map((action) => action.sourceId) },
      { title: "Resources", items: links.map((message) => message.text), sources: links.map((message) => message.id) },
    ],
    timeline,
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return jsonResponse(res, 200, { ok: true, name: "Clamor", ai: aiStatus() });
  }

  const store = normalizeStore(await readStore());

  if (req.method === "GET" && url.pathname === "/api/state") {
    return jsonResponse(res, 200, { ...publicState(store), ai: aiStatus() });
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community || !body.text?.trim()) return jsonResponse(res, 400, { error: "Missing community or text." });
    const channel = getChannel(community, body.channelId);
    const author = body.author || "You";
    if (!canPostInChannel(community, channel, author)) {
      return jsonResponse(res, 403, { error: "Only moderators can post in this channel." });
    }
    community.messages.push(normalizeMessage({ channelId: channel.id, author, text: body.text }));
    await writeStore(store);
    return jsonResponse(res, 201, publicState(store));
  }

  if (req.method === "POST" && url.pathname === "/api/invites") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community || !body.email?.trim()) return jsonResponse(res, 400, { error: "Missing community or email." });
    const invite = createInvite(community, body.email, body.role);
    await writeStore(store);
    return jsonResponse(res, 201, { invite, ...publicState(store) });
  }

  if (req.method === "POST" && url.pathname === "/api/channels") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    const id = slugifyChannelName(body.name || "");
    if (!community || !id) return jsonResponse(res, 400, { error: "Missing community or channel name." });
    if (community.channels.some((channel) => channel.id === id)) {
      return jsonResponse(res, 409, { error: "A channel with that name already exists." });
    }
    const channel = {
      id,
      name: id,
      type: body.type === "private" ? "private" : "public",
      posting: body.posting === "moderators" ? "moderators" : "all",
      topic: body.type === "private" ? "Private working space" : "Community discussion space",
    };
    community.channels.push(channel);
    await writeStore(store);
    return jsonResponse(res, 201, { channel, ...publicState(store) });
  }

  if (req.method === "POST" && url.pathname === "/api/members/role") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    const member = community?.members.find((item) => item.id === body.memberId);
    if (!community || !member || !["Member", "Moderator", "Owner"].includes(body.role)) {
      return jsonResponse(res, 400, { error: "Missing member or valid role." });
    }
    member.role = body.role;
    await writeStore(store);
    return jsonResponse(res, 200, publicState(store));
  }

  if (req.method === "POST" && url.pathname === "/api/report") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community) return jsonResponse(res, 400, { error: "Missing community." });
    return jsonResponse(res, 200, { markdown: buildPresenterReport(community) });
  }

  if (req.method === "POST" && url.pathname === "/api/digest") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community) return jsonResponse(res, 400, { error: "Missing community." });
    return jsonResponse(res, 200, { digest: buildDailyDigest(community, body), provider: "local" });
  }

  if (req.method === "POST" && url.pathname === "/api/import") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community || !body.rawText?.trim()) return jsonResponse(res, 400, { error: "Missing community or import text." });
    const channel = getChannel(community, body.channelId);
    const imported = parseImportedMessages(body.rawText).map((message) => ({ ...message, channelId: channel.id }));
    community.messages.push(...imported);
    await writeStore(store);
    return jsonResponse(res, 201, { imported: imported.length, ...publicState(store) });
  }

  if (req.method === "POST" && url.pathname === "/api/ask") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community || !body.question?.trim()) return jsonResponse(res, 400, { error: "Missing community or question." });
    return jsonResponse(res, 200, await answerWithProvider(community, body));
  }

  if (req.method === "POST" && url.pathname === "/api/overview") {
    const body = await readJsonBody(req);
    const community = getCommunity(store, body.communityId);
    if (!community) return jsonResponse(res, 400, { error: "Missing community." });
    return jsonResponse(res, 200, await overviewWithProvider(community, body));
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const seed = await fs.readFile(SEED_FILE, "utf8");
    await fs.writeFile(STORE_FILE, seed);
    return jsonResponse(res, 200, publicState(JSON.parse(seed)));
  }

  return jsonResponse(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(ROOT, decodeURIComponent(requestPath).replace(/^\/+/, ""));
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
});

if (require.main === module) {
  ensureStore().then(() => {
    server.listen(PORT, () => {
      console.log(`Clamor running at http://localhost:${PORT}`);
    });
  });
}

module.exports = {
  analyzeCommunity,
  answerQuestion,
  buildDailyDigest,
  metricCounts,
  parseImportedMessages,
  server,
  tagMessage,
};

let communities = [];
let activeCommunityId = "product";
let activeChannelByCommunity = {};
let activeFilter = "all";
let memoryScope = "community";
let aiStatus = { provider: "local", model: "rule-based analyzer" };
let memoryOverrides = {};
let messageSearch = "";
let watchedKeywords = readLocalArray("clamorWatchedKeywords");
let notifications = readLocalArray("clamorNotifications");
let keywordToastTimer = null;

const communityList = document.getElementById("communityList");
const channelList = document.getElementById("channelList");
const messageList = document.getElementById("messageList");
const summaryList = document.getElementById("summaryList");
const sourceTrail = document.getElementById("sourceTrail");
const actionList = document.getElementById("actionList");
const onboardingBrief = document.getElementById("onboardingBrief");
const answerBox = document.getElementById("answerBox");
const statusLine = document.getElementById("statusLine");
const messageSearchInput = document.getElementById("messageSearch");
const clearSearchButton = document.getElementById("clearSearchButton");
const composeForm = document.getElementById("composeForm");
const channelForm = document.getElementById("channelForm");
const importForm = document.getElementById("importForm");
const inviteForm = document.getElementById("inviteForm");
const memberGrid = document.getElementById("memberGrid");
const inviteList = document.getElementById("inviteList");
const healthGrid = document.getElementById("healthGrid");
const impactGrid = document.getElementById("impactGrid");
const channelActivity = document.getElementById("channelActivity");
const presenterChecklist = document.getElementById("presenterChecklist");
const exportReportButton = document.getElementById("exportReportButton");
const dailyDigestButton = document.getElementById("dailyDigestButton");
const digestHero = document.getElementById("digestHero");
const digestGrid = document.getElementById("digestGrid");
const timelineList = document.getElementById("timelineList");
const presenterModeButton = document.getElementById("presenterModeButton");
const presenterPanel = document.getElementById("presenterPanel");
const closePresenterButton = document.getElementById("closePresenterButton");
const presenterMetrics = document.getElementById("presenterMetrics");
const sidebarToggle = document.getElementById("sidebarToggle");
const memoryCollapseButton = document.getElementById("memoryCollapseButton");
const memoryActiveLabel = document.getElementById("memoryActiveLabel");
const moreMenuButton = document.getElementById("moreMenuButton");
const topbarMorePanel = document.getElementById("topbarMorePanel");
const topbarMenu = document.querySelector(".topbar-menu");
const authorSelect = document.getElementById("authorSelect");
const permissionNote = document.getElementById("permissionNote");
const aiProviderChip = document.getElementById("aiProviderChip");
const keywordToast = document.getElementById("keywordToast");
const keywordToastText = document.getElementById("keywordToastText");
const keywordForm = document.getElementById("keywordForm");
const keywordInput = document.getElementById("keywordInput");
const keywordWatchList = document.getElementById("keywordWatchList");
const keywordMatchList = document.getElementById("keywordMatchList");
const notificationButton = document.getElementById("notificationButton");
const notificationBadge = document.getElementById("notificationBadge");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const clearNotificationsButton = document.getElementById("clearNotificationsButton");
let moreMenuCloseTimer = null;
let suppressMoreFocusUntil = 0;

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function activeCommunity() {
  return communities.find((community) => community.id === activeCommunityId) || communities[0];
}

function activeChannel() {
  const community = activeCommunity();
  if (!community) return null;
  const channelId = activeChannelByCommunity[community.id] || community.channels[0]?.id;
  return community.channels.find((channel) => channel.id === channelId) || community.channels[0];
}

function activeMemory() {
  const override = memoryOverrides[memoryKey()];
  if (override) return override;
  if (memoryScope === "community") return activeCommunity()?.memory;
  return activeChannel()?.memory || activeCommunity()?.memory;
}

function memoryKey() {
  const community = activeCommunity();
  const channel = activeChannel();
  return `${community?.id || "none"}:${memoryScope}:${memoryScope === "channel" ? channel?.id || "none" : "all"}`;
}

function activeScopeLabel() {
  if (memoryScope === "community") return "Whole community";
  const channel = activeChannel();
  if (!channel) return "This channel";
  return `${channel.type === "private" ? "@" : "#"}${channel.name}`;
}

function isModerator(member) {
  return ["Owner", "Moderator"].includes(member?.role);
}

function selectedMember() {
  const community = activeCommunity();
  const selectedName = authorSelect?.value;
  return community?.members.find((member) => member.name === selectedName) || community?.members[0];
}

function canSelectedMemberPost() {
  const channel = activeChannel();
  if (!channel) return true;
  if (channel.posting === "all") return true;
  return isModerator(selectedMember());
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand community sidebar" : "Collapse community sidebar");
  sidebarToggle.querySelector(".toggle-text").textContent = collapsed ? "Expand" : "Collapse";
  sidebarToggle.querySelector(".toggle-icon").textContent = collapsed ? ">" : "<";
  localStorage.setItem("clamorSidebarCollapsed", String(collapsed));
}

function setMemoryCollapsed(collapsed) {
  document.body.classList.toggle("memory-collapsed", collapsed);
  memoryCollapseButton.textContent = collapsed ? "Show" : "Hide";
  memoryCollapseButton.setAttribute("aria-expanded", String(!collapsed));
  memoryCollapseButton.setAttribute("aria-label", collapsed ? "Show intelligence panel" : "Hide intelligence panel");
  localStorage.setItem("clamorMemoryCollapsed", String(collapsed));
}

function setMoreMenuOpen(open) {
  clearTimeout(moreMenuCloseTimer);
  const menu = topbarMenu || moreMenuButton.closest(".topbar-menu");
  topbarMorePanel.hidden = !open;
  menu?.classList.toggle("is-open", open);
  moreMenuButton.setAttribute("aria-expanded", String(open));
}

function scheduleMoreMenuClose() {
  clearTimeout(moreMenuCloseTimer);
  moreMenuCloseTimer = setTimeout(() => setMoreMenuOpen(false), 180);
}

function setStatus(message) {
  if (statusLine) statusLine.textContent = message;
}

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordPattern(keyword) {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
}

function keywordMentionsInText(value) {
  return watchedKeywords.filter((keyword) => keywordPattern(keyword).test(String(value || "")));
}

function highlightWatchedKeywords(text) {
  if (!watchedKeywords.length) return escapeHtml(text);
  const pattern = new RegExp(`\\b(${watchedKeywords.map(escapeRegExp).join("|")})\\b`, "gi");
  return String(text)
    .split(pattern)
    .map((part) => {
      const normalized = normalizeKeyword(part);
      if (watchedKeywords.includes(normalized)) return `<mark>${escapeHtml(part)}</mark>`;
      return escapeHtml(part);
    })
    .join("");
}

function providerLabel(status = aiStatus) {
  if (status.provider === "groq") return `Clamor Intelligence: ${status.model || "Groq"}`;
  return "Clamor Intelligence: Local";
}

function keywordMatchesForCommunity(community = activeCommunity()) {
  if (!community) return [];
  return community.messages
    .map((message) => ({
      message,
      keywords: keywordMentionsInText(message.text),
    }))
    .filter((match) => match.keywords.length);
}

function persistWatchedKeywords() {
  localStorage.setItem("clamorWatchedKeywords", JSON.stringify(watchedKeywords));
}

function persistNotifications() {
  localStorage.setItem("clamorNotifications", JSON.stringify(notifications.slice(0, 25)));
}

function addNotification(title, body) {
  notifications = [
    {
      id: Date.now().toString(36),
      title,
      body,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      read: false,
    },
    ...notifications,
  ].slice(0, 25);
  persistNotifications();
  renderNotifications();
}

function renderNotifications() {
  if (!notificationBadge || !notificationList) return;
  const unread = notifications.filter((item) => !item.read).length;
  notificationBadge.textContent = unread;
  notificationBadge.hidden = unread === 0;
  notificationList.innerHTML = notifications.length
    ? notifications
      .map(
        (item) => `
          <article class="notification-item ${item.read ? "" : "unread"}">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.time)}</span>
            </div>
            <p>${escapeHtml(item.body)}</p>
          </article>
        `,
      )
      .join("")
    : `<article class="empty-state">No alerts yet. Add watched keywords and Clamor will collect matches here.</article>`;
}

function markNotificationsRead() {
  notifications = notifications.map((item) => ({ ...item, read: true }));
  persistNotifications();
  renderNotifications();
}

function renderKeywordWatch() {
  if (!keywordWatchList || !keywordMatchList) return;
  const matches = keywordMatchesForCommunity();
  keywordWatchList.innerHTML = watchedKeywords.length
    ? watchedKeywords
      .map(
        (keyword) => `
          <div class="watch-chip">
            <button type="button" data-watch-keyword="${escapeHtml(keyword)}">
              <span>${escapeHtml(keyword)}</span>
              <small>${matches.filter((match) => match.keywords.includes(keyword)).length}</small>
            </button>
            <button class="watch-remove" type="button" data-remove-keyword="${escapeHtml(keyword)}">Remove</button>
          </div>
        `,
      )
      .join("")
    : `<article class="empty-state">Add a keyword to monitor important mentions across the community.</article>`;

  keywordMatchList.innerHTML = matches.length
    ? matches
      .slice(0, 8)
      .map(
        ({ message, keywords }) => `
          <article class="watch-match">
            <div>
              <strong>${escapeHtml(keywords.join(", "))}</strong>
              <span>${escapeHtml(message.author)} | ${escapeHtml(message.time)}</span>
            </div>
            <p>${escapeHtml(message.text)}</p>
          </article>
        `,
      )
      .join("")
    : `<article class="empty-state">No watched keywords found in the saved messages yet.</article>`;
}

function notifyKeywordMention(source, text) {
  const mentions = keywordMentionsInText(text);
  if (!mentions.length || !keywordToast || !keywordToastText) return false;
  keywordToastText.textContent = `${source} mentioned: ${mentions.join(", ")}.`;
  addNotification("Keyword match", `${source} mentioned ${mentions.join(", ")}.`);
  keywordToast.hidden = false;
  keywordToast.classList.add("show");
  setStatus(`Keyword alert: ${mentions.join(", ")} was mentioned.`);
  clearTimeout(keywordToastTimer);
  keywordToastTimer = setTimeout(() => {
    keywordToast.classList.remove("show");
    keywordToast.hidden = true;
  }, 5200);
  return true;
}

function setBusy(button, busy, labelWhenBusy = "Working...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = labelWhenBusy;
    button.disabled = true;
    button.classList.add("is-busy");
    return;
  }
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  button.classList.remove("is-busy");
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function findMessage(id) {
  return activeCommunity()?.messages.find((message) => message.id === id);
}

function channelLabelForMessage(message) {
  const community = activeCommunity();
  const channel = community?.channels.find((item) => item.id === message?.channelId);
  if (!channel) return "Unknown channel";
  return `${channel.type === "private" ? "@" : "#"}${channel.name}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function loadState(message = "Ready") {
  try {
    const state = await api("/api/state");
    communities = state.communities;
    aiStatus = state.ai || aiStatus;
    if (!activeCommunity()) activeCommunityId = communities[0]?.id;
    renderAll();
    setStatus(message);
  } catch (error) {
    setStatus("Start the backend with: node server.js");
    console.error(error);
  }
}

function renderCommunities() {
  communityList.innerHTML = communities
    .map((community) => {
      const metrics = community.memory.metrics;
      return `
        <button class="community-button ${community.id === activeCommunityId ? "active" : ""}" data-community="${community.id}">
          <span class="avatar" style="background:${community.accent}">${initials(community.name)}</span>
          <span>
            <strong>${community.name}</strong>
            <span>${community.members.length} members | ${metrics.messages} messages</span>
          </span>
          <span class="badge">${community.members.length}</span>
        </button>
      `;
    })
    .join("");
}

function renderHeader() {
  const community = activeCommunity();
  const channel = activeChannel();
  const memory = activeMemory();
  if (!community) return;

  document.getElementById("platformLabel").textContent = "";
  document.getElementById("communityTitle").textContent = community.name;
  document.getElementById("channelTitle").textContent = `${channel.type === "private" ? "@" : "#"} ${channel.name}`;
  document.getElementById("timeWindow").textContent = channel.topic;
  document.getElementById("channelCount").textContent = community.channels.length;
  document.getElementById("channelMemberCount").textContent = `${community.members.length} members`;
  document.getElementById("actionCount").textContent = memory.actions.length;
  document.getElementById("messageCount").textContent = memory.metrics.messages;
  document.getElementById("deadlineCount").textContent = memory.metrics.deadlines;
  document.getElementById("decisionCount").textContent = memory.metrics.decisions;
  document.getElementById("riskCount").textContent = memory.metrics.risks;
  document.getElementById("signalScore").textContent = memory.metrics.signal;
  document.getElementById("summaryUpdated").textContent = activeScopeLabel();
  aiProviderChip.textContent = providerLabel(aiStatus);
  aiProviderChip.title = aiStatus.model || "";
}

function renderChannels() {
  const community = activeCommunity();
  const selected = activeChannel();
  if (!community || !selected) return;

  const groups = [
    ["Public", community.channels.filter((channel) => channel.type !== "private")],
    ["Private", community.channels.filter((channel) => channel.type === "private")],
  ];

  channelList.innerHTML = groups
    .filter(([, channels]) => channels.length)
    .map(
      ([label, channels]) => `
        <div class="channel-group">
          <div class="channel-group-label">${label}</div>
          ${channels
            .map(
              (channel) => `
                <button class="channel-button ${channel.id === selected.id ? "active" : ""}" data-channel="${channel.id}">
                  <span class="channel-symbol">${channel.type === "private" ? "@" : "#"}</span>
                  <span class="channel-name">${channel.name}</span>
                  ${channel.posting === "moderators" ? `<span class="channel-pill">mod</span>` : ""}
                  <span class="channel-count">${channel.messageCount}</span>
                </button>
              `,
            )
            .join("")}
        </div>
      `,
    )
    .join("");
}

function renderMessages() {
  const community = activeCommunity();
  const channel = activeChannel();
  if (!community) return;

  const messages = community.messages
    .filter((message) => message.channelId === channel.id)
    .filter((message) => {
      if (activeFilter === "important") return message.important;
      if (activeFilter === "questions") return message.text.includes("?") || message.tags.includes("question");
      return true;
    })
    .filter((message) => {
      if (!messageSearch) return true;
      const haystack = `${message.author} ${message.text} ${message.tags.join(" ")}`.toLowerCase();
      return haystack.includes(messageSearch.toLowerCase());
    });

  messageList.innerHTML = messages.length
    ? messages
    .map(
      (message, index) => `
        <article class="message ${message.important ? "important" : ""}">
          <div class="avatar" style="background:${community.accent}; opacity:${0.95 - (index % 4) * 0.08}">
            ${initials(message.author)}
          </div>
          <div class="message-body">
            <div class="message-meta">
              <strong>${message.author}</strong>
              <span>${message.time}</span>
            </div>
            <p>${highlightWatchedKeywords(message.text)}</p>
            <div class="tag-row">
              ${message.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
          </div>
        </article>
      `,
    )
    .join("")
    : `<article class="empty-state">No messages match the current filter or search.</article>`;

  messageList.scrollTop = messageList.scrollHeight;
}

function renderSummary() {
  const community = activeCommunity();
  const memory = activeMemory();
  if (!community) return;

  summaryList.innerHTML = memory.summaries.length
    ? memory.summaries
    .map(
      (summary) => `
        <article class="summary-card">
          <div class="summary-icon" style="background:${summary.color}">${summary.type[0]}</div>
          <div>
            <h4>${escapeHtml(summary.title)}</h4>
            <p>${escapeHtml(summary.body)}</p>
          </div>
        </article>
      `,
    )
    .join("")
    : `<article class="empty-state">No high-signal memory in this channel yet. Add messages or import context to build the brief.</article>`;

  sourceTrail.innerHTML = memory.sourceTrail
    .map((id) => {
      const message = findMessage(id);
      if (!message) return "";
      return `
        <div class="source-item">
          <span><strong>${escapeHtml(message.author)}</strong>: ${escapeHtml(message.text)}</span>
          <span>${message.time}</span>
        </div>
      `;
    })
    .join("");
}

function renderActions() {
  const community = activeCommunity();
  const memory = activeMemory();
  if (!community) return;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const sortedActions = memory.actions
    .slice()
    .sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3));

  actionList.innerHTML = memory.actions.length
    ? sortedActions
        .map(
          (action) => `
          <article class="action-card">
            <div>
              <h4>${escapeHtml(action.title)}</h4>
              <p>${escapeHtml(action.detail)}</p>
              <div class="tag-row">
                <span class="tag">${escapeHtml(action.owner)}</span>
                <span class="tag">${escapeHtml(action.due)}</span>
              </div>
            </div>
            <span class="priority ${action.priority}">${action.priority}</span>
          </article>
        `,
        )
        .join("")
    : `<article class="empty-state">No action items detected yet. Post or import messages with tasks, owners, or blockers.</article>`;
}

function renderOnboarding() {
  const community = activeCommunity();
  const memory = activeMemory();
  if (!community) return;

  const brief = memory.onboarding;
  onboardingBrief.innerHTML = `
    <h4>${escapeHtml(brief.title)}</h4>
    <p>${escapeHtml(brief.body)}</p>
    <ul>
      ${brief.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
    </ul>
  `;
}

function renderMembers() {
  const community = activeCommunity();
  if (!community) return;

  memberGrid.innerHTML = community.members
    .map(
      (member) => `
        <article class="member-card">
          <div class="avatar" style="background:${community.accent}">${initials(member.name)}</div>
          <div>
            <h4>${escapeHtml(member.name)}</h4>
            <p>${escapeHtml(member.status)}</p>
            <select class="role-select" data-member="${escapeHtml(member.id)}" aria-label="Role for ${escapeHtml(member.name)}">
              <option ${member.role === "Member" ? "selected" : ""}>Member</option>
              <option ${member.role === "Moderator" ? "selected" : ""}>Moderator</option>
              <option ${member.role === "Owner" ? "selected" : ""}>Owner</option>
            </select>
          </div>
        </article>
      `,
    )
    .join("");

  inviteList.innerHTML = community.invites.length
    ? community.invites
        .slice()
        .reverse()
        .map(
          (invite) => `
            <div class="source-item">
              <span><strong>${escapeHtml(invite.email)}</strong> | ${escapeHtml(invite.role)} | ${escapeHtml(invite.inviteCode || "pending")}</span>
              <span>${escapeHtml(invite.status)}</span>
            </div>
          `,
        )
        .join("")
    : `<div class="source-item"><span>No pending invites yet.</span><span>Ready</span></div>`;
}

function renderDashboard() {
  const community = activeCommunity();
  if (!community) return;

  const memory = community.memory;
  const openOwners = memory.actions.filter((action) => action.owner !== "Unassigned").length;
  const unassigned = memory.actions.filter((action) => action.owner === "Unassigned").length;
  const privateChannels = community.channels.filter((channel) => channel.type === "private").length;

  healthGrid.innerHTML = [
    ["Signal", memory.metrics.signal, "Higher means more useful information was detected."],
    ["Open actions", memory.actions.length, `${openOwners} assigned, ${unassigned} unassigned.`],
    ["Private spaces", privateChannels, "Sensitive planning channels with role controls."],
    ["Pending invites", community.invites.length, "Participants waiting to join."],
  ]
    .map(
      ([label, value, detail]) => `
        <article class="health-card">
          <span>${escapeHtml(value)}</span>
          <h4>${escapeHtml(label)}</h4>
          <p>${escapeHtml(detail)}</p>
        </article>
      `,
    )
    .join("");

  const importantMessages = community.messages.filter((message) => message.important).length;
  const signalRate = community.messages.length ? Math.round((importantMessages / community.messages.length) * 100) : 0;
  const estimatedMinutesSaved = Math.max(8, memory.metrics.messages * 3 + memory.actions.length * 4);
  const monitoredTerms = watchedKeywords.length;
  const compressed = community.messages.length
    ? Math.max(1, Math.round(community.messages.length / Math.max(memory.summaries.length + memory.actions.length, 1)))
    : 0;

  impactGrid.innerHTML = [
    [`${estimatedMinutesSaved}m`, "Estimated catch-up saved", "Based on messages summarized, open loops detected, and source-backed answers."],
    [`${signalRate}%`, "Signal rate", "Share of saved messages that became decisions, tasks, risks, links, or onboarding context."],
    [`${monitoredTerms}`, "Watched terms", "Live keywords Clamor can use to notify members when important topics appear."],
    [`${compressed}:1`, "Compression ratio", "How much raw chatter is reduced into summaries, actions, and source trails."],
    ["$0", "Default AI cost", "Local intelligence runs without Groq or OpenAI until deeper model answers are enabled."],
    ["2 clicks", "Judge demo path", "Digest plus Ask Clamor shows the core value fast."],
  ]
    .map(
      ([value, label, detail]) => `
        <article class="impact-card">
          <span>${escapeHtml(value)}</span>
          <div>
            <h4>${escapeHtml(label)}</h4>
            <p>${escapeHtml(detail)}</p>
          </div>
        </article>
      `,
    )
    .join("");

  const maxMessages = Math.max(...community.channels.map((channel) => channel.messageCount), 1);
  channelActivity.innerHTML = community.channels
    .map(
      (channel) => `
        <div class="activity-row">
          <span>${channel.type === "private" ? "@" : "#"}${escapeHtml(channel.name)}</span>
          <strong>${channel.messageCount}</strong>
          <div class="activity-bar"><i style="width:${Math.max(8, (channel.messageCount / maxMessages) * 100)}%"></i></div>
        </div>
      `,
    )
    .join("");

  presenterChecklist.innerHTML = [
    "Say: Clamor turns buried group chat into operational memory.",
    "Frame the product as a memory layer, not a Slack clone",
    "Show messy chat first so the pain is obvious",
    "Ask the funding question and show source cards",
    "Open Daily Digest for the before/after moment",
    "Open Dashboard for saved time, signal rate, and low AI cost",
  ]
    .map((item) => `<div class="check-item"><span></span>${escapeHtml(item)}</div>`)
    .join("");
}

function renderDigest(payload = null) {
  const community = activeCommunity();
  if (!community) return;

  const memory = activeMemory();
  const digest = payload?.digest || {
    headline: `${community.name} is ready for a daily digest.`,
    summary: "Click Daily digest to generate a source-backed brief for the current community scope.",
    metrics: {
      rawMessages: memory.metrics.messages,
      reducedItems: memory.summaries.length + memory.actions.length,
      savedMinutes: Math.max(8, memory.metrics.messages * 3 + memory.actions.length * 4),
    },
    sections: [
      { title: "Decisions", items: memory.summaries.filter((item) => item.type === "Decision").map((item) => item.body).slice(0, 3) },
      { title: "Actions", items: memory.actions.map((item) => `${item.title} - ${item.owner}`).slice(0, 3) },
    ],
    timeline: memory.sourceTrail.map(findMessage).filter(Boolean).slice(0, 4),
  };

  digestHero.innerHTML = `
    <article>
      <span>${escapeHtml(String(digest.metrics.rawMessages || 0))} messages scanned</span>
      <h4>${escapeHtml(digest.headline)}</h4>
      <p>${escapeHtml(digest.summary)}</p>
      <div class="digest-stat-row">
        <span>${escapeHtml(String(digest.metrics.reducedItems || 0))} key items</span>
        <span>${escapeHtml(String(digest.metrics.savedMinutes || 0))}m saved</span>
      </div>
    </article>
  `;

  digestGrid.innerHTML = (digest.sections || [])
    .map(
      (section) => `
        <article class="digest-card">
          <h4>${escapeHtml(section.title)}</h4>
          ${
            section.items?.length
              ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : `<p>No ${escapeHtml(section.title.toLowerCase())} detected yet.</p>`
          }
        </article>
      `,
    )
    .join("");

  timelineList.innerHTML = (digest.timeline || [])
    .map((message) => {
      const source = typeof message === "string" ? findMessage(message) : message;
      if (!source) return "";
      return `
        <div class="source-item">
          <span><strong>${escapeHtml(source.author)}</strong> ${escapeHtml(channelLabelForMessage(source))}: ${escapeHtml(source.text)}</span>
          <span>${escapeHtml(source.time)}</span>
        </div>
      `;
    })
    .join("");
}

function renderPresenterMode() {
  const community = activeCommunity();
  if (!community) return;
  const memory = community.memory;
  const importantMessages = community.messages.filter((message) => message.important).length;
  const signalRate = community.messages.length ? Math.round((importantMessages / community.messages.length) * 100) : 0;
  const savedMinutes = Math.max(8, memory.metrics.messages * 3 + memory.actions.length * 4);
  const compression = community.messages.length
    ? Math.max(1, Math.round(community.messages.length / Math.max(memory.summaries.length + memory.actions.length, 1)))
    : 0;

  presenterMetrics.innerHTML = [
    [`${community.messages.length}`, "raw messages"],
    [`${memory.actions.length}`, "actions found"],
    [`${memory.metrics.decisions}`, "decisions"],
    [`${signalRate}%`, "signal rate"],
    [`${savedMinutes}m`, "catch-up saved"],
    [`${compression}:1`, "GroupMe-to-memory compression"],
  ]
    .map(
      ([value, label]) => `
        <article>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `,
    )
    .join("");
}

function renderAnswer(payload) {
  const community = activeCommunity();
  const memory = activeMemory();
  if (!community) return;

  const question = payload?.question || document.getElementById("questionInput").value;
  const answer = payload?.answer || "Ask a question about this community's saved messages.";
  const sources = payload?.sources || memory.sourceTrail.slice(0, 2);
  const provider = payload?.provider ? `<span class="tag">${escapeHtml(payload.provider)}</span>` : "";
  const confidence = payload?.confidence ? `<span class="tag">${escapeHtml(payload.confidence)}</span>` : "";
  const sourceCards = sources
    .map(findMessage)
    .filter(Boolean)
    .map(
      (message) => `
        <div class="answer-source">
          <div>
            <strong>${escapeHtml(message.author)}</strong>
            <span>${escapeHtml(channelLabelForMessage(message))} - ${escapeHtml(message.time)}</span>
          </div>
          <p>${escapeHtml(message.text)}</p>
        </div>
      `,
    )
    .join("");

  answerBox.innerHTML = `
    <h4>${escapeHtml(question)}</h4>
    <p>${escapeHtml(answer)}</p>
    <div class="tag-row">
      ${provider}
      ${confidence}
    </div>
    ${sourceCards ? `<div class="answer-sources">${sourceCards}</div>` : ""}
  `;
}

function renderAll() {
  renderCommunities();
  renderChannels();
  renderHeader();
  renderComposer();
  renderMessages();
  renderSummary();
  renderActions();
  renderOnboarding();
  renderMembers();
  renderDashboard();
  renderDigest();
  renderAnswer();
  renderKeywordWatch();
  renderNotifications();
}

function renderComposer() {
  const community = activeCommunity();
  const channel = activeChannel();
  if (!community || !channel) return;

  const priorValue = authorSelect.value;
  authorSelect.innerHTML = community.members
    .map((member) => `<option value="${escapeHtml(member.name)}">${escapeHtml(member.name)} (${escapeHtml(member.role)})</option>`)
    .join("");
  if (priorValue && community.members.some((member) => member.name === priorValue)) {
    authorSelect.value = priorValue;
  }

  const allowed = canSelectedMemberPost();
  const input = composeForm.elements.messageText;
  const button = composeForm.querySelector("button");
  input.disabled = !allowed;
  button.disabled = !allowed;
  input.placeholder = allowed
    ? `Post in ${channel.type === "private" ? "@" : "#"}${channel.name}...`
    : "Only moderators can post in this channel";
  permissionNote.textContent = channel.posting === "moderators"
    ? allowed
      ? "Presenter preview: this role has permission to post in moderator-only channels."
      : "Presenter preview: choose an Owner or Moderator to demonstrate posting permissions."
    : channel.type === "private"
      ? "Private channel preview. In production, access would be enforced by authentication."
      : "";
  permissionNote.hidden = !permissionNote.textContent;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

communityList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-community]");
  if (!button) return;
  activeCommunityId = button.dataset.community;
  const community = activeCommunity();
  activeChannelByCommunity[activeCommunityId] ||= community.channels[0]?.id;
  renderAll();
});

channelList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-channel]");
  if (!button) return;
  activeChannelByCommunity[activeCommunityId] = button.dataset.channel;
  renderAll();
});

messageSearchInput.addEventListener("input", (event) => {
  messageSearch = event.target.value.trim();
  renderMessages();
});

clearSearchButton.addEventListener("click", () => {
  messageSearch = "";
  messageSearchInput.value = "";
  renderMessages();
});

keywordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const keyword = normalizeKeyword(keywordInput.value);
  if (!keyword) return;
  if (!watchedKeywords.includes(keyword)) {
    watchedKeywords = [...watchedKeywords, keyword];
    persistWatchedKeywords();
    addNotification("Watchlist updated", `Clamor is now watching for "${keyword}".`);
  }
  keywordInput.value = "";
  renderMessages();
  renderKeywordWatch();
  renderDashboard();
  setStatus(`Watching keyword: ${keyword}`);
});

document.querySelectorAll("[data-watch-suggestion]").forEach((button) => {
  button.addEventListener("click", () => {
    keywordInput.value = button.dataset.watchSuggestion;
    keywordForm.requestSubmit();
  });
});

keywordWatchList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-keyword]");
  if (removeButton) {
    watchedKeywords = watchedKeywords.filter((keyword) => keyword !== removeButton.dataset.removeKeyword);
    persistWatchedKeywords();
    renderMessages();
    renderKeywordWatch();
    renderDashboard();
    setStatus("Keyword removed from watchlist");
    return;
  }

  const button = event.target.closest("[data-watch-keyword]");
  if (!button) return;
  const keyword = button.dataset.watchKeyword;
  messageSearch = keyword;
  messageSearchInput.value = keyword;
  document.querySelector('[data-view="catchup"]').click();
  renderMessages();
  setStatus(`Showing messages that mention "${keyword}" in the current channel.`);
});

notificationButton.addEventListener("click", () => {
  const open = notificationPanel.hidden;
  notificationPanel.hidden = !open;
  notificationButton.setAttribute("aria-expanded", String(open));
  if (open) markNotificationsRead();
});

clearNotificationsButton.addEventListener("click", () => {
  notifications = [];
  persistNotifications();
  renderNotifications();
  notificationPanel.hidden = true;
  notificationButton.setAttribute("aria-expanded", "false");
});

presenterModeButton.addEventListener("click", () => {
  renderPresenterMode();
  presenterPanel.hidden = false;
  document.body.classList.add("presenter-open");
});

closePresenterButton.addEventListener("click", () => {
  presenterPanel.hidden = true;
  document.body.classList.remove("presenter-open");
});

presenterPanel.addEventListener("click", (event) => {
  if (event.target !== presenterPanel) return;
  presenterPanel.hidden = true;
  document.body.classList.remove("presenter-open");
});

moreMenuButton.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") suppressMoreFocusUntil = Date.now() + 500;
});

moreMenuButton.addEventListener("click", (event) => {
  event.preventDefault();
});

topbarMorePanel.addEventListener("click", (event) => {
  if (!event.target.closest("button, a")) return;
  setMoreMenuOpen(false);
});

topbarMenu.addEventListener("pointerenter", (event) => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  setMoreMenuOpen(true);
});

topbarMenu.addEventListener("pointerleave", () => {
  scheduleMoreMenuClose();
});

topbarMorePanel.addEventListener("pointerenter", (event) => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  setMoreMenuOpen(true);
});

topbarMorePanel.addEventListener("pointerleave", () => {
  scheduleMoreMenuClose();
});

topbarMenu.addEventListener("focusin", () => {
  if (Date.now() < suppressMoreFocusUntil) return;
  setMoreMenuOpen(true);
});

topbarMenu.addEventListener("focusout", (event) => {
  if (topbarMenu.contains(event.relatedTarget)) return;
  scheduleMoreMenuClose();
});

document.addEventListener("click", (event) => {
  if (topbarMorePanel.hidden) return;
  if (event.target.closest(".topbar-menu")) return;
  setMoreMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !topbarMorePanel.hidden) {
    setMoreMenuOpen(false);
    moreMenuButton.focus();
  }
});

channelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(channelForm);
  const name = form.get("channelName").trim();
  if (!name) return;

  setStatus("Creating channel...");
  const state = await api("/api/channels", {
    method: "POST",
    body: JSON.stringify({
      communityId: activeCommunityId,
      name,
      type: form.get("channelType"),
      posting: form.get("posting"),
    }),
  });
  communities = state.communities;
  activeChannelByCommunity[activeCommunityId] = state.channel.id;
  channelForm.reset();
  renderAll();
  setStatus(`Created ${state.channel.type === "private" ? "private" : "public"} channel ${state.channel.name}`);
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderMessages();
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".memory-view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    const matchingTab = document.querySelector(`.memory-tabs [data-view="${button.dataset.view}"], .memory-utility-tabs [data-view="${button.dataset.view}"]`);
    if (matchingTab) matchingTab.classList.add("active");
    document.getElementById(`${button.dataset.view}View`).classList.add("active");
    memoryActiveLabel.textContent = matchingTab?.textContent.trim() || button.textContent.trim();
    if (document.body.classList.contains("memory-collapsed")) setMemoryCollapsed(false);
  });
});

document.querySelectorAll("[data-scope]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-scope]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    memoryScope = button.dataset.scope;
    renderAll();
    setStatus(memoryScope === "community" ? "AI scope set to whole community" : "AI scope set to this channel");
  });
});

composeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(composeForm);
  const text = form.get("messageText").trim();
  const author = form.get("author").trim() || activeCommunity().members[0]?.name || "You";
  if (!text) return;
  if (!canSelectedMemberPost()) {
    setStatus("Only moderators can post in this channel");
    return;
  }

  setStatus("Posting message...");
  const state = await api("/api/messages", {
    method: "POST",
    body: JSON.stringify({ communityId: activeCommunityId, channelId: activeChannel().id, author, text }),
  });
  communities = state.communities;
  composeForm.elements.messageText.value = "";
  composeForm.elements.author.value = author;
  renderAll();
  const alerted = notifyKeywordMention("New message", text);
  if (!alerted) setStatus("Message posted and memory refreshed");
});

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawText = new FormData(importForm).get("rawText").trim();
  if (!rawText) return;

  setStatus("Importing chat log...");
  const state = await api("/api/import", {
    method: "POST",
    body: JSON.stringify({ communityId: activeCommunityId, channelId: activeChannel().id, rawText }),
  });
  communities = state.communities;
  importForm.reset();
  renderAll();
  const alerted = notifyKeywordMention("Imported chat log", rawText);
  if (!alerted) setStatus(`Imported ${state.imported} messages and refreshed memory`);
});

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(inviteForm);
  const email = form.get("email").trim();
  const role = form.get("role");
  if (!email) return;

  setStatus("Creating participant invite...");
  const state = await api("/api/invites", {
    method: "POST",
    body: JSON.stringify({ communityId: activeCommunityId, email, role }),
  });
  communities = state.communities;
  inviteForm.reset();
  renderAll();
  setStatus(`Invite created for ${email}`);
});

memberGrid.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-member]");
  if (!select) return;
  setStatus("Updating member role...");
  const state = await api("/api/members/role", {
    method: "POST",
    body: JSON.stringify({ communityId: activeCommunityId, memberId: select.dataset.member, role: select.value }),
  });
  communities = state.communities;
  renderAll();
  setStatus("Member role updated");
});

document.getElementById("askButton").addEventListener("click", async () => {
  const question = document.getElementById("questionInput").value.trim();
  if (!question) return;
  const button = document.getElementById("askButton");
  setBusy(button, true, "Asking...");
  setStatus("Searching Clamor intelligence...");
  try {
    notifyKeywordMention("Question", question);
    const answer = await api("/api/ask", {
      method: "POST",
      body: JSON.stringify({
        communityId: activeCommunityId,
        channelId: memoryScope === "channel" ? activeChannel().id : null,
        scope: memoryScope,
        question,
        requesterName: selectedMember()?.name,
      }),
    });
    renderAnswer(answer);
    setStatus(answer.warning ? `Answer used fallback: ${answer.warning}` : `Answer generated with ${answer.provider || "local memory"}`);
  } catch (error) {
    setStatus(`Ask failed: ${error.message}`);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById("questionInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("askButton").click();
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById("questionInput").value = button.dataset.question;
    document.getElementById("askButton").click();
  });
});

document.getElementById("catchUpButton").addEventListener("click", () => {
  const button = document.getElementById("catchUpButton");
  document.querySelector('[data-view="catchup"]').click();
  setBusy(button, true, "Generating...");
  setStatus(`Generating catch-up for ${activeScopeLabel()}...`);
  api("/api/overview", {
    method: "POST",
    body: JSON.stringify({
      communityId: activeCommunityId,
      channelId: memoryScope === "channel" ? activeChannel().id : null,
      scope: memoryScope,
    }),
  })
    .then((result) => {
      memoryOverrides[memoryKey()] = result.memory;
      renderAll();
      setStatus(result.warning ? `Catch-up used fallback: ${result.warning}` : `Catch-up generated with ${result.provider}`);
    })
    .catch((error) => {
      setStatus(`Catch-up failed: ${error.message}`);
    })
    .finally(() => {
      setBusy(button, false);
    });
});

dailyDigestButton.addEventListener("click", async () => {
  document.querySelector('[data-view="digest"]').click();
  setBusy(dailyDigestButton, true, "Building...");
  setStatus(`Building daily digest for ${activeScopeLabel()}...`);
  try {
    const result = await api("/api/digest", {
      method: "POST",
      body: JSON.stringify({
        communityId: activeCommunityId,
        channelId: memoryScope === "channel" ? activeChannel().id : null,
        scope: memoryScope,
      }),
    });
    renderDigest(result);
    setStatus("Daily digest generated");
  } catch (error) {
    setStatus(`Digest failed: ${error.message}`);
  } finally {
    setBusy(dailyDigestButton, false);
    setMoreMenuOpen(false);
  }
});

exportReportButton.addEventListener("click", async () => {
  setStatus("Exporting presenter report...");
  try {
    const report = await api("/api/report", {
      method: "POST",
      body: JSON.stringify({ communityId: activeCommunityId }),
    });
    const blob = new Blob([report.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeCommunity().name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.md`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Presenter report exported");
  } catch (error) {
    setStatus(`Export failed: ${error.message}`);
  }
});

document.getElementById("refreshButton").addEventListener("click", () => loadState("Memory refreshed"));
authorSelect.addEventListener("change", renderComposer);

document.getElementById("resetButton").addEventListener("click", async () => {
  setStatus("Resetting starter data...");
  const state = await api("/api/reset", { method: "POST", body: "{}" });
  communities = state.communities;
  activeCommunityId = "product";
  renderAll();
  setStatus("Starter data reset");
});

sidebarToggle.addEventListener("click", () => {
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
});

memoryCollapseButton.addEventListener("click", () => {
  setMemoryCollapsed(!document.body.classList.contains("memory-collapsed"));
});

setSidebarCollapsed(localStorage.getItem("clamorSidebarCollapsed") === "true");
if (localStorage.getItem("clamorJudgeReadyLayoutApplied") !== "true") {
  localStorage.setItem("clamorMemoryCollapsed", "false");
  localStorage.setItem("clamorJudgeReadyLayoutApplied", "true");
}
setMemoryCollapsed(localStorage.getItem("clamorMemoryCollapsed") === "true");
loadState();

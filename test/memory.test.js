const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeCommunity,
  answerQuestion,
  buildDailyDigest,
  parseImportedMessages,
  server,
  tagMessage,
} = require("../server.js");
const { runEvaluationSuite } = require("../evaluation.js");
const { can, visibleMessages, workspaceModel } = require("../workspace.js");
const trustBaseline = require("../evals/datasets/trust-baseline.json");

const community = {
  id: "builders",
  name: "Builders Club",
  channels: [{ id: "general", name: "general" }],
  messages: [
    { id: "m1", channelId: "general", author: "Maya", time: "9:10 AM", text: "Final decision: the sponsor budget is approved.", tags: ["decision"] },
    { id: "m2", channelId: "general", author: "Leo", time: "9:20 AM", text: "Slides are due Friday at 5:00.", tags: ["deadline", "task"] },
    { id: "m3", channelId: "general", author: "Nia", time: "9:30 AM", text: "The room booking is blocked.", tags: ["risk"] },
  ],
};

test("tags operational signals in messages", () => {
  assert.deepEqual(tagMessage("Final decision approved; slides due Friday"), ["decision", "deadline"]);
});

test("imports common chat transcript formats", () => {
  const imported = parseImportedMessages("Maya: Budget approved\nLeo: Slides due Friday");
  assert.equal(imported.length, 2);
  assert.equal(imported[0].author, "Maya");
  assert.ok(imported[1].tags.includes("deadline"));
});

test("builds a digest with decisions, deadlines, and risks", () => {
  const digest = buildDailyDigest(community);
  const serialized = JSON.stringify(digest);
  assert.match(serialized, /sponsor budget/i);
  assert.match(serialized, /Friday/i);
  assert.match(serialized, /room booking/i);
});

test("answers questions with source-backed evidence", () => {
  const answer = answerQuestion(community, "What decision was made about the budget?");
  assert.ok(answer.sources.length > 0);
  assert.match(answer.answer, /budget/i);
});

test("analyzes a community into actionable memory", () => {
  const analysis = analyzeCommunity(community);
  assert.ok(analysis.summaries.length > 0);
  assert.ok(analysis.metrics.decisions >= 1);
});

test("abstains when saved history does not support an answer", () => {
  const answer = answerQuestion(community, "What is on the cafeteria menu tomorrow?");
  assert.deepEqual(answer.sources, []);
  assert.match(answer.answer, /could not find enough/i);
});

test("evaluates citation quality and unsupported answers", () => {
  const report = runEvaluationSuite(trustBaseline, answerQuestion);
  assert.equal(report.cases, 3);
  assert.equal(report.unsupportedAnswerRate, 0);
  assert.equal(report.passRate, 1);
});

test("models workspace roles and protects private-channel messages", () => {
  const privateCommunity = {
    ...community,
    channels: [...community.channels, { id: "leadership", name: "leadership", type: "private" }],
    members: [{ id: "owner", name: "Maya", role: "Owner", status: "Active" }, { id: "member", name: "Leo", role: "Member", status: "Active" }],
    messages: [...community.messages, { id: "private-1", channelId: "leadership", author: "Maya", text: "Private budget", tags: ["decision"] }],
  };
  assert.equal(workspaceModel(privateCommunity).memberships.length, 2);
  assert.equal(can(privateCommunity.members[1], "messages.read_private"), false);
  assert.equal(visibleMessages(privateCommunity, privateCommunity.members[1]).some((message) => message.id === "private-1"), false);
  assert.equal(visibleMessages(privateCommunity, privateCommunity.members[0]).some((message) => message.id === "private-1"), true);
});

test("serves a healthy API over HTTP", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.ok, true);
    const evaluationResponse = await fetch(`http://127.0.0.1:${address.port}/api/evaluation`);
    assert.equal(evaluationResponse.status, 200);
    const evaluation = await evaluationResponse.json();
    assert.equal(evaluation.passRate, 1);
    assert.equal(evaluation.unsupportedAnswerRate, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

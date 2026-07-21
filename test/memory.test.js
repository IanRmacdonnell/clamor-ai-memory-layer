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

test("serves a healthy API over HTTP", async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

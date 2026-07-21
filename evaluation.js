const fs = require("fs");
const path = require("path");

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : 1;
}

function evaluateCase(testCase, result) {
  const expected = new Set(testCase.expectedSourceIds || []);
  const actual = new Set(result.sources || []);
  const overlap = [...actual].filter((id) => expected.has(id)).length;
  const requiredTerms = testCase.requiredTerms || [];
  const answerText = String(result.answer || "").toLowerCase();
  const abstained = actual.size === 0;
  return {
    id: testCase.id,
    citationPrecision: ratio(overlap, actual.size),
    citationRecall: ratio(overlap, expected.size),
    requiredTermCoverage: ratio(requiredTerms.filter((term) => answerText.includes(term.toLowerCase())).length, requiredTerms.length),
    abstentionCorrect: Boolean(testCase.shouldAbstain) === abstained,
    unsupportedAnswer: Boolean(testCase.shouldAbstain) && !abstained,
    sources: [...actual],
  };
}

function runEvaluationSuite(suite, answerer) {
  const results = suite.cases.map((testCase) => evaluateCase(testCase, answerer(suite.community, {
    text: testCase.question,
    scope: testCase.scope || "community",
    requesterName: testCase.requesterName || null,
  })));
  const average = (key) => Number((results.reduce((sum, item) => sum + Number(item[key]), 0) / Math.max(1, results.length)).toFixed(3));
  const passed = results.filter((item) => item.citationRecall === 1 && item.requiredTermCoverage === 1 && item.abstentionCorrect).length;
  return {
    suite: suite.name,
    cases: results.length,
    passed,
    passRate: ratio(passed, results.length),
    citationPrecision: average("citationPrecision"),
    citationRecall: average("citationRecall"),
    requiredTermCoverage: average("requiredTermCoverage"),
    abstentionAccuracy: average("abstentionCorrect"),
    unsupportedAnswerRate: ratio(results.filter((item) => item.unsupportedAnswer).length, results.length),
    results,
  };
}

if (require.main === module) {
  const { answerQuestion } = require("./server.js");
  const suitePath = path.join(__dirname, "evals", "datasets", "trust-baseline.json");
  const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
  console.log(JSON.stringify(runEvaluationSuite(suite, answerQuestion), null, 2));
}

module.exports = { evaluateCase, runEvaluationSuite };

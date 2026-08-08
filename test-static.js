/**
 * test-static.js
 * --------------
 * Quick sanity check for the browser-independent parts (staticChecks + score).
 * The full pipeline (axeCheck.js, agentTask.js) needs a real Chromium instance
 * via Playwright — run those with `node src/audit.js <url>` in an environment
 * that can download browser binaries (this sandbox's egress is locked down).
 *
 * Run: node test-static.js
 */

const fs = require('fs');
const assert = require('assert');
const { checkProductStructuredData, checkSemanticLandmarks } = require('./src/checks/staticChecks');
const { computeScore } = require('./src/score');

function loadFixture(name) {
  return fs.readFileSync(`./fixtures/${name}`, 'utf-8');
}

console.log('--- Fixture: good-pdp.html ---');
const goodHtml = loadFixture('good-pdp.html');
const goodSchema = checkProductStructuredData(goodHtml);
const goodLandmarks = checkSemanticLandmarks(goodHtml);
console.log(goodSchema);
console.log(goodLandmarks);
assert.strictEqual(goodSchema.passed, true, 'good-pdp deveria passar no check de schema');
assert.strictEqual(goodLandmarks.passed, true, 'good-pdp deveria passar no check de landmarks');

console.log('\n--- Fixture: bad-pdp.html ---');
const badHtml = loadFixture('bad-pdp.html');
const badSchema = checkProductStructuredData(badHtml);
const badLandmarks = checkSemanticLandmarks(badHtml);
console.log(badSchema);
console.log(badLandmarks);
assert.strictEqual(badSchema.passed, false, 'bad-pdp NÃO deveria ter schema válido');
assert.strictEqual(badLandmarks.passed, false, 'bad-pdp NÃO deveria ter landmarks válidos');

console.log('\n--- Score engine: mock de axe + agent task ---');

// Mock "before fix" scenario — mirrors the real Obramax findings shape
const axeBefore = {
  weight: 30,
  violations: [
    { id: 'aria-prohibited-attr', blocksAgent: true },
    { id: 'aria-prohibited-attr', blocksAgent: true },
    { id: 'button-name', blocksAgent: true },
    { id: 'color-contrast', blocksAgent: false },
  ],
};
const taskBefore = {
  totalSteps: 4,
  stepsAttempted: 1,
  log: [{ step: 'Localizar campo de busca', success: false }],
};
const scoreBefore = computeScore({
  staticResults: [badSchema, badLandmarks],
  axeResult: axeBefore,
  taskResult: taskBefore,
});
console.log('ANTES do fix:', scoreBefore.total, `(nota ${scoreBefore.grade})`);
console.log(JSON.stringify(scoreBefore.breakdown, null, 2));

// Mock "after fix" scenario
const axeAfter = { weight: 30, violations: [] };
const taskAfter = {
  totalSteps: 4,
  stepsAttempted: 4,
  log: [
    { step: 'Localizar campo de busca', success: true },
    { step: 'Confirmar a busca', success: true },
    { step: 'Abrir o primeiro produto', success: true },
    { step: 'Adicionar ao carrinho', success: true },
  ],
};
const scoreAfter = computeScore({
  staticResults: [goodSchema, goodLandmarks],
  axeResult: axeAfter,
  taskResult: taskAfter,
});
console.log('\nDEPOIS do fix:', scoreAfter.total, `(nota ${scoreAfter.grade})`);
console.log(JSON.stringify(scoreAfter.breakdown, null, 2));

assert.ok(scoreAfter.total > scoreBefore.total, 'Score depois do fix deveria ser maior que antes');

console.log('\n✅ Todos os testes passaram. O "antes/depois" para a demo funciona como esperado.');

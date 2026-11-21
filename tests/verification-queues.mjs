import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verificationPassed } from '../scripts/verification-gate.mjs';

const states = ['success', 'failure', 'cancelled', 'skipped', undefined];
let cases = 0;
for (const full of [false, true]) {
  for (const staticResult of states) for (const criticalResult of states) for (const fullResult of states) {
    assert.equal(verificationPassed({ full, staticResult, criticalResult, fullResult }),
      staticResult === 'success' && (full ? fullResult : criticalResult) === 'success');
    cases++;
  }
}
const workflow = readFileSync(new URL('../.github/workflows/verification.yml', import.meta.url), 'utf8');
assert.match(workflow, /project: \[main, serial-sensitive\]/);
assert.match(workflow, /fail-fast: false/);
assert.match(workflow, /test:browser:ci -- --project=\$\{\{ matrix.project \}\} --workers=1/);
assert.match(workflow, /needs: \[static, critical, full\]/);
assert.match(workflow, /run: npm run test:browser\n/);
assert.match(workflow, /playwright-traces-\$\{\{ matrix.project \}\}/);
assert.match(workflow, /playwright-traces-full/);
assert.match(workflow, /contents: read/);
console.log(`Verification queues: ${cases} gate cases and workflow contracts passed.`);

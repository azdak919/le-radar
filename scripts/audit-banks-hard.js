#!/usr/bin/env node
/**
 * LE RADAR — CLI audit HARD offline des banques fonds
 *
 *   node scripts/audit-banks-hard.js
 *   node scripts/audit-banks-hard.js --json
 *   npm run audit:banks:hard
 *
 * Exit 1 si une entrée HARD reste en banque (anti-régression CI).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { BANK_SPECS, auditBankHard } = require('./bank-hard-audit-lib');

const ROOT = path.join(__dirname, '..');
const asJson = process.argv.includes('--json');

function main() {
  const report = { ok: true, banks: {}, failures: 0, scanned: 0 };

  for (const spec of BANK_SPECS) {
    const jsonPath = path.join(ROOT, spec.jsonRel);
    if (!fs.existsSync(jsonPath)) {
      report.ok = false;
      report.banks[spec.id] = { ok: false, error: 'missing_json' };
      continue;
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const result = auditBankHard(data, spec);
    report.scanned += result.total;
    report.banks[spec.id] = {
      ok: result.ok,
      total: result.total,
      failures: result.failures,
    };
    if (!result.ok) {
      report.ok = false;
      report.failures += result.failures.length;
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('LE RADAR — audit HARD offline (0 réseau)\n');
    for (const spec of BANK_SPECS) {
      const b = report.banks[spec.id];
      if (!b) continue;
      if (b.error) {
        console.log(`  ✗ ${spec.id}: ${b.error}`);
        continue;
      }
      if (b.ok) {
        console.log(`  ✓ ${spec.id}: ${b.total} photos, aucun HARD`);
      } else {
        console.log(`  ✗ ${spec.id}: ${b.failures.length}/${b.total} HARD`);
        for (const f of b.failures.slice(0, 12)) {
          console.log(
            `      · [${f.reasons.join(', ')}] ${f.title || f.url}`
          );
        }
        if (b.failures.length > 12) {
          console.log(`      … +${b.failures.length - 12} autres`);
        }
      }
    }
    console.log(
      `\n${report.ok ? 'OK' : 'ÉCHEC'} — ${report.scanned} photos scannées, ` +
        `${report.failures} HARD`
    );
  }

  process.exit(report.ok ? 0 : 1);
}

main();

#!/usr/bin/env node
/**
 * Ledger AGENTS.md — list / propose dettes volontaires (offline, 0 réseau).
 *
 * Usage:
 *   node scripts/agents-ledger.mjs           # tableau open|ready
 *   node scripts/agents-ledger.mjs --propose # 1 suggestion + texte « notification » agent
 *   node scripts/agents-ledger.mjs --json    # machine-readable
 *
 * Les agents doivent lancer --propose en fin de session (si ticket OK)
 * et coller la proposition à l'humain — ne pas exécuter sans OK.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');

const EFFORT_RANK = {
  S: 1,
  'S–M': 2,
  'S-M': 2,
  M: 3,
  'M–L': 4,
  'M-L': 4,
  L: 5,
};

function parseLedger(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes('| ID | Dette |'));
  if (start < 0) throw new Error('Tableau ledger introuvable dans AGENTS.md (§3)');

  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    if (/^\|\s*:?-{2,}/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 6) continue;
    const [id, debt, why, signals, effort, status] = cells;
    if (!/^D\d+/i.test(id)) continue;
    rows.push({
      id: id.replace(/\*\*/g, '').trim(),
      debt: debt.replace(/\*\*/g, '').trim(),
      why: why.trim(),
      signals: signals.trim(),
      effort: effort.trim(),
      status: status.replace(/\*\*/g, '').trim().toLowerCase(),
    });
  }
  return rows;
}

function actionable(rows) {
  return rows.filter((r) => r.status === 'open' || r.status === 'ready');
}

function rankEffort(e) {
  return EFFORT_RANK[e] ?? 9;
}

function propose(rows) {
  const pool = actionable(rows)
    .slice()
    .sort((a, b) => {
      // ready before open, then smaller effort
      if (a.status !== b.status) return a.status === 'ready' ? -1 : 1;
      return rankEffort(a.effort) - rankEffort(b.effort);
    });
  return pool[0] || null;
}

function printTable(rows) {
  if (!rows.length) {
    console.log('Aucune dette open/ready.');
    return;
  }
  console.log('ID   Effort  Statut  Dette');
  console.log('─'.repeat(72));
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(4)} ${r.effort.padEnd(7)} ${r.status.padEnd(7)} ${r.debt}`,
    );
  }
}

function printPropose(item) {
  if (!item) {
    console.log('LEDGER: aucune dette actionnable (open/ready). Rien à proposer.');
    return;
  }
  // Bloc copiable par l’agent vers le chat utilisateur
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 PROPOSITION DETTE (ledger AGENTS.md) — attendre OK humain');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`ID      : ${item.id}`);
  console.log(`Statut  : ${item.status}`);
  console.log(`Effort  : ${item.effort}`);
  console.log(`Dette   : ${item.debt}`);
  console.log(`Pourquoi: ${item.why}`);
  console.log(`Signaux : ${item.signals}`);
  console.log('');
  console.log('Message suggéré à l’utilisateur :');
  console.log('---');
  console.log(
    `Ticket principal terminé. Le ledger propose ensuite **${item.id}** ` +
      `(effort ${item.effort}, ${item.status}) : ${item.debt}. ` +
      `On la solde maintenant (un seul bloc), ou on s’arrête ici ?`,
  );
  console.log('---');
  console.log('');
  console.log('Règle : NE PAS commencer cette dette sans accord explicite.');
  console.log('Si OK → faire le bloc, mettre à jour AGENTS.md §3/§4, check, commit.');
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    console.log(`Usage:
  npm run agents:ledger          # liste open|ready
  npm run agents:propose         # 1 suggestion + texte chat
  node scripts/agents-ledger.mjs --json
`);
    process.exit(0);
  }

  const md = fs.readFileSync(AGENTS_PATH, 'utf8');
  const all = parseLedger(md);
  const open = actionable(all);

  if (args.has('--json')) {
    const out = {
      source: 'AGENTS.md',
      generatedAt: new Date().toISOString(),
      actionable: open,
      propose: propose(all),
      all,
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (args.has('--propose')) {
    printTable(open);
    printPropose(propose(all));
    return;
  }

  console.log(`Ledger AGENTS.md — ${open.length} actionnable(s) / ${all.length} total\n`);
  printTable(open);
  const p = propose(all);
  if (p) {
    console.log(`\nProchaine candidate : ${p.id} (${p.effort}, ${p.status})`);
    console.log('Fin de session agent → npm run agents:propose');
  }
}

main();

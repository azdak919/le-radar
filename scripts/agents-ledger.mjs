#!/usr/bin/env node
/**
 * Ledger AGENTS.md — list / propose dettes volontaires (offline, 0 réseau).
 *
 * Usage:
 *   node scripts/agents-ledger.mjs              # tableau open|ready
 *   node scripts/agents-ledger.mjs --propose    # 1 suggestion OU balise STOP
 *   node scripts/agents-ledger.mjs --record-sold D5
 *   node scripts/agents-ledger.mjs --reset-session
 *   node scripts/agents-ledger.mjs --json
 *
 * Quota anti-glouton (.agents-session.json) :
 *   max 1 dette / session de chat, max 2 / jour calendaire.
 *   Après une dette soldée → STOP (pas d’enchaînement même si l’humain dit « continue »).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const SESSION_PATH = path.join(ROOT, '.agents-session.json');

const EFFORT_RANK = {
  S: 1,
  'S–M': 2,
  'S-M': 2,
  M: 3,
  'M–L': 4,
  'M-L': 4,
  L: 5,
};

const DEFAULT_SESSION = {
  maxDebtPerChatSession: 1,
  maxDebtPerCalendarDay: 2,
  targetDebtPerMaintenanceSession: 1,
  debtsSoldToday: 0,
  debtsSoldThisSession: 0,
  lastDebtId: null,
  lastDebtSoldAt: null,
  calendarDay: null,
  note: 'Quota anti-glouton — voir AGENTS.md § balises',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadSession() {
  let s = { ...DEFAULT_SESSION };
  try {
    if (fs.existsSync(SESSION_PATH)) {
      s = { ...s, ...JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')) };
    }
  } catch {
    /* ignore */
  }
  const day = todayIso();
  if (s.calendarDay !== day) {
    s.calendarDay = day;
    s.debtsSoldToday = 0;
    // Nouvelle journée calendaire : reset aussi le compteur session
    s.debtsSoldThisSession = 0;
  }
  return s;
}

function saveSession(s) {
  fs.writeFileSync(SESSION_PATH, `${JSON.stringify(s, null, 2)}\n`, 'utf8');
}

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

function quotaBlocked(session) {
  if (session.debtsSoldThisSession >= session.maxDebtPerChatSession) {
    return {
      code: 'SESSION_QUOTA',
      message:
        `Balise STOP : déjà ${session.debtsSoldThisSession} dette(s) soldée(s) ` +
        `cette session (max ${session.maxDebtPerChatSession}). ` +
        `Ne pas proposer ni enchaîner — même si l’humain dit « continue ».`,
    };
  }
  if (session.debtsSoldToday >= session.maxDebtPerCalendarDay) {
    return {
      code: 'DAY_QUOTA',
      message:
        `Balise STOP : déjà ${session.debtsSoldToday} dette(s) aujourd’hui ` +
        `(max ${session.maxDebtPerCalendarDay}/jour). Reprendre demain ou ticket métier seulement.`,
    };
  }
  return null;
}

function hasWorkingTreeChanges() {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

function reviewSession(item, session) {
  const target = session.targetDebtPerMaintenanceSession || 1;
  if (session.debtsSoldThisSession >= target) {
    console.log(`Session ledger complète : ${session.debtsSoldThisSession}/${target} dette soldée. STOP.`);
    return;
  }
  if (hasWorkingTreeChanges()) {
    console.log('Pas encore le moment : WIP détecté. Finir, vérifier et committer le ticket avant une dette ledger.');
    return;
  }
  if (quotaBlocked(session)) {
    console.log('Pas de dette additionnelle : quota atteint.');
    return;
  }
  if (!item) {
    console.log('Aucune dette mûre : ne rien inventer pour remplir le quota de session.');
    return;
  }
  console.log(`Bon moment pour une dette : ticket terminé et worktree propre. Candidate : ${item.id} (${item.effort}) — ${item.debt}`);
}

function printPropose(item, session) {
  const block = quotaBlocked(session);
  if (block) {
    console.log('');
    console.log('🛑 ══════════════════════════════════════════════════════════');
    console.log('   BALISE STOP DETTE — ne pas proposer, ne pas enchaîner');
    console.log('🛑 ══════════════════════════════════════════════════════════');
    console.log(block.message);
    console.log(`Dernière dette : ${session.lastDebtId || '—'} @ ${session.lastDebtSoldAt || '—'}`);
    console.log('');
    console.log('Message suggéré à l’utilisateur :');
    console.log('---');
    console.log(
      'Quota dette atteint pour cette session (anti « oui à tout »). ' +
        'On s’arrête sur le ledger. Nouveau ticket métier bienvenu ; ' +
        'nouvelle dette ledger seulement dans une **nouvelle** session ' +
        'ou demain (max 2/jour).',
    );
    console.log('---');
    return;
  }

  if (!item) {
    console.log('LEDGER: aucune dette actionnable (open/ready). Rien à proposer.');
    return;
  }

  const effortWarn =
    rankEffort(item.effort) >= 4
      ? '\n⚠ Effort L : demander **deux** OK explicites avant de commencer.'
      : '';

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 PROPOSITION DETTE (ledger AGENTS.md) — 1 seule si OK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`ID      : ${item.id}`);
  console.log(`Statut  : ${item.status}`);
  console.log(`Effort  : ${item.effort}`);
  console.log(`Dette   : ${item.debt}`);
  console.log(`Pourquoi: ${item.why}`);
  console.log(`Signaux : ${item.signals}`);
  console.log(
    `Quota   : session ${session.debtsSoldThisSession}/${session.maxDebtPerChatSession}` +
      ` · jour ${session.debtsSoldToday}/${session.maxDebtPerCalendarDay}`,
  );
  console.log('');
  console.log('Message suggéré à l’utilisateur :');
  console.log('---');
  console.log(
    `Ticket principal terminé. Proposition **unique** de session : **${item.id}** ` +
      `(effort ${item.effort}) — ${item.debt}. ` +
      `Oui = on fait **ce bloc seulement** puis STOP ledger. Non = fin.${effortWarn}`,
  );
  console.log('---');
  console.log('');
  console.log('Après soldée : npm run agents:record-sold -- ' + item.id);
  console.log('(ou : node scripts/agents-ledger.mjs --record-sold ' + item.id + ')');
}

function recordSold(id) {
  const session = loadSession();
  session.debtsSoldThisSession = (session.debtsSoldThisSession || 0) + 1;
  session.debtsSoldToday = (session.debtsSoldToday || 0) + 1;
  session.lastDebtId = id || session.lastDebtId;
  session.lastDebtSoldAt = new Date().toISOString();
  session.calendarDay = todayIso();
  saveSession(session);
  console.log(
    `Enregistré : ${id} soldée. Session ${session.debtsSoldThisSession}/` +
      `${session.maxDebtPerChatSession}, jour ${session.debtsSoldToday}/` +
      `${session.maxDebtPerCalendarDay}. Prochain --propose → STOP.`,
  );
}

function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);

  if (args.has('--help') || args.has('-h')) {
    console.log(`Usage:
  npm run agents:ledger
  npm run agents:propose
  node scripts/agents-ledger.mjs --record-sold D5
  node scripts/agents-ledger.mjs --review-session
  node scripts/agents-ledger.mjs --reset-session
  node scripts/agents-ledger.mjs --json
`);
    process.exit(0);
  }

  if (args.has('--reset-session')) {
    const s = loadSession();
    s.debtsSoldThisSession = 0;
    saveSession(s);
    console.log('Compteur session remis à 0 (jour inchangé).');
    return;
  }

  const recordIdx = argv.indexOf('--record-sold');
  if (recordIdx >= 0) {
    const id = argv[recordIdx + 1] || 'UNKNOWN';
    recordSold(id);
    return;
  }

  const md = fs.readFileSync(AGENTS_PATH, 'utf8');
  const all = parseLedger(md);
  const open = actionable(all);
  const session = loadSession();
  // Persister calendar rollover
  saveSession(session);

  if (args.has('--json')) {
    console.log(
      JSON.stringify(
        {
          source: 'AGENTS.md',
          generatedAt: new Date().toISOString(),
          session,
          quotaBlocked: quotaBlocked(session),
          actionable: open,
          propose: propose(all),
          all,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.has('--propose')) {
    printTable(open);
    printPropose(propose(all), session);
    return;
  }

  if (args.has('--review-session')) {
    reviewSession(propose(all), session);
    return;
  }

  console.log(`Ledger AGENTS.md — ${open.length} actionnable(s) / ${all.length} total\n`);
  printTable(open);
  console.log(
    `\nQuota : session ${session.debtsSoldThisSession}/${session.maxDebtPerChatSession}` +
      ` · jour ${session.debtsSoldToday}/${session.maxDebtPerCalendarDay}`,
  );
  const p = propose(all);
  if (p) {
    console.log(`\nProchaine candidate : ${p.id} (${p.effort}, ${p.status})`);
    console.log('Fin de session agent → npm run agents:propose');
  }
}

main();

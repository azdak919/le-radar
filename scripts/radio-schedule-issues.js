#!/usr/bin/env node
'use strict';
/**
 * Une issue GitHub par station, mise à jour (jamais dupliquée), quand :
 *   - sa grille a été refaite (radio-schedule-drift.json : overhaul) ;
 *   - elle n'a pas été vérifiée depuis 7 jours (radio-schedules.json).
 * Fermée d'elle-même quand la station redevient à jour.
 *
 * Usage : node scripts/radio-schedule-issues.js            (plan seul)
 *         node scripts/radio-schedule-issues.js --apply    (gh CLI, GH_TOKEN)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STALE_MS = 7 * 24 * 3600 * 1000;
const titleFor = (id) => `Radio : grille à vérifier — ${String(id).toUpperCase()}`;

/** Plan pur : [{ id, title, open: bool, reasons: [] , body }]. */
function planRadioIssues({ drift = {}, schedules = {}, now = Date.now() } = {}) {
  const stations = schedules.stations || {};
  const driftById = new Map((drift.stations || []).map((s) => [s.id, s]));
  const ids = new Set([...Object.keys(stations), ...driftById.keys()]);
  const plan = [];
  for (const id of [...ids].sort()) {
    const st = stations[id] || {};
    const d = driftById.get(id) || {};
    const reasons = [];
    if (d.status === 'overhaul') {
      reasons.push(`Grille refaite sur le site officiel (${(d.added || []).length} ajout(s), ${(d.removed || []).length} retrait(s), écart ${d.ratio}).`);
    }
    const last = Date.parse(st.verifiedAt || st.checkedAt || '');
    if (st.unverified || (Number.isFinite(last) && now - last > STALE_MS)) {
      const days = Number.isFinite(last) ? Math.floor((now - last) / 86400000) : '?';
      reasons.push(`Grille non vérifiée depuis ${days} jour(s)${st.unverified ? ' (site officiel injoignable)' : ''}.`);
    }
    const body = reasons.length
      ? [
        `Station : **${st.name || id}** (\`${id}\`)`,
        '',
        ...reasons.map((r) => `- ${r}`),
        '',
        `Dernière vérification : ${st.checkedAt || 'inconnue'} · semaine ${st.verifiedWeekOf || '?'}`,
        `Contrôle d'écart : ${drift.checkedAt || 'inconnu'}`,
        '',
        'Action : relancer `update-radio-schedules.yml` (avec `--force` si la refonte est réelle), puis vérifier la grille en prod.',
        '',
        '_Issue tenue à jour automatiquement par `scripts/radio-schedule-issues.js`._',
      ].join('\n')
      : '';
    plan.push({ id, title: titleFor(id), open: reasons.length > 0, reasons, body });
  }
  return plan;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function applyPlan(plan) {
  const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--search', 'in:title "Radio : grille à vérifier"', '--limit', '100', '--json', 'number,title,body']));
  for (const p of plan) {
    const found = open.find((i) => i.title === p.title);
    if (p.open && found) {
      if (found.body.trim() !== p.body.trim()) { gh(['issue', 'edit', String(found.number), '--body', p.body]); console.log(`↻ #${found.number} ${p.title}`); }
    } else if (p.open) {
      console.log(gh(['issue', 'create', '--title', p.title, '--body', p.body]).trim());
    } else if (found) {
      gh(['issue', 'close', String(found.number), '--comment', 'Grille de nouveau vérifiée et stable : fermeture automatique.']);
      console.log(`✓ #${found.number} fermée`);
    }
  }
}

if (require.main === module) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return {}; } };
  const plan = planRadioIssues({ drift: read('radio-schedule-drift.json'), schedules: read('radio-schedules.json') });
  for (const p of plan.filter((x) => x.open)) console.log(`⚑ ${p.id} : ${p.reasons.join(' ')}`);
  if (process.argv.includes('--apply')) applyPlan(plan);
}

module.exports = { planRadioIssues, titleFor, STALE_MS };

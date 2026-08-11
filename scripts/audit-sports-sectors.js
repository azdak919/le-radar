#!/usr/bin/env node
/**
 * Audit sports.json + sports-teams.json — collisions secteur / acronymes.
 *
 * Échoue (exit 1) si :
 *  - SHE (cégep) résolu ou libellé comme UdeS / Université de Sherbrooke
 *  - USHE (univ) résolu comme Cégep
 *  - noms cryptiques Ch.-* / Témisc. encore en banque
 *  - re-apply registre flip cégep↔univ
 *  - resolve « Sherbrooke » + secteur incorrect
 *
 * Usage : node scripts/audit-sports-sectors.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadSportsTeamsRegistry,
  resolveSportsTeam,
  applyRegistryToTeam,
  applyRegistryToGameSide,
} = require('./sports-teams-lib.js');

const ROOT = path.join(__dirname, '..');
const issues = [];
const fail = (kind, msg, extra = {}) => {
  issues.push({ kind, msg, ...extra });
};

const reg = loadSportsTeamsRegistry();
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports.json'), 'utf8'));
const teams = Object.values(data.teams || {});

// ── Resolve smoke ─────────────────────────────────────────────────
const resolveCases = [
  { q: { name: 'Sherbrooke', sector: 'collegial' }, code: 'SHE', fullRe: /Cégep/i },
  { q: { name: 'Sherbrooke', sector: 'universitaire' }, code: 'USHE', fullRe: /Université/i },
  { q: { name: 'Sherbrooke', fullName: 'Cégep de Sherbrooke' }, code: 'SHE' },
  { q: { name: 'Sherbrooke', fullName: 'Université de Sherbrooke' }, code: 'USHE' },
  { q: { code: 'SHE', sector: 'collegial' }, code: 'SHE' },
  { q: { code: 'USHE', sector: 'universitaire' }, code: 'USHE' },
  { q: { name: 'Laval', sector: 'universitaire' }, code: 'LAV' },
  { q: { name: 'Laflèche', sector: 'collegial' }, code: 'LAF' },
  { q: { name: 'Notre-Dame Bleu', sector: 'collegial' }, code: 'NDFB' },
];
for (const c of resolveCases) {
  const r = resolveSportsTeam(reg, c.q);
  if (c.code && r.code !== c.code) {
    fail('resolve', `expected ${c.code} got ${r.code}`, { q: c.q, got: r });
  }
  if (c.fullRe && !c.fullRe.test(r.fullName || '')) {
    fail('resolve', `fullName mismatch ${r.fullName}`, { q: c.q });
  }
}

// ── Banque ────────────────────────────────────────────────────────
const crypticRe = /Ch\.-|^Ch\.|Témisc\.|Cégep de Ch\./;
for (const t of teams) {
  if (crypticRe.test(t.name || '') || crypticRe.test(t.fullName || '')) {
    fail('cryptic', `${t.code} ${t.name} / ${t.fullName}`);
  }
  if (t.code === 'SHE') {
    if (t.sector !== 'collegial') fail('she-sector', String(t.sector));
    if (/Universit/i.test(t.fullName || '')) fail('she-as-uni', t.fullName);
    if (/^UdeS$/i.test(t.name || '')) fail('she-name-udes', t.name);
  }
  if (t.code === 'USHE') {
    if (t.sector !== 'universitaire') fail('ushe-sector', String(t.sector));
    if (/C[eé]gep/i.test(t.fullName || '')) fail('ushe-as-cegep', t.fullName);
  }
  if ((t.code === 'NDFB' || t.code === 'NDFJ') && !/Bleu|Jaune/i.test(t.name || '')) {
    fail('ndf-color', `${t.code} ${t.name}`);
  }
  if ((t.code === 'NDFB' || t.code === 'NDFJ')
    && !/Notre-Dame-de-Foy|Campus Notre-Dame/i.test(t.fullName || '')) {
    fail('ndf-full', `${t.code} ${t.fullName}`);
  }

  for (const g of [t.lastGame, t.nextGame, ...(t.nextGames || [])].filter(Boolean)) {
    const oFull = g.opponentFullName || '';
    const oCode = String(g.opponentCode || '').toUpperCase();
    const oName = g.opponent || '';
    if (crypticRe.test(oName) || crypticRe.test(oFull)) {
      fail('cryptic-opp', `${t.code} vs ${oName} / ${oFull}`, { date: g.date });
    }
    if (oCode === 'SHE' && /Universit/i.test(oFull)) {
      fail('opp-she-uni', `${t.code} → ${oName} | ${oFull}`, { date: g.date, sport: t.sport });
    }
    if (oCode === 'USHE' && /C[eé]gep/i.test(oFull)) {
      fail('opp-ushe-cegep', `${t.code} → ${oName} | ${oFull}`, { date: g.date });
    }
    if (oCode === 'SHE' && /^UdeS$/i.test(oName)) {
      fail('opp-she-udes-label', `${t.code} → ${oName}`, { date: g.date });
    }
  }
}

// ── Re-apply stable ───────────────────────────────────────────────
let flips = 0;
for (const t of teams) {
  const clone = JSON.parse(JSON.stringify(t));
  applyRegistryToTeam(clone, reg);
  if (Array.isArray(clone.nextGames)) {
    for (const g of clone.nextGames) applyRegistryToGameSide(g, reg, clone.sector);
  }
  if (t.code === 'SHE' && clone.code === 'USHE') {
    fail('reapply-flip', 'SHE→USHE on reapply', { id: t.id });
    flips += 1;
  }
  if (t.code === 'USHE' && clone.code === 'SHE') {
    fail('reapply-flip', 'USHE→SHE on reapply', { id: t.id });
    flips += 1;
  }
  for (const key of ['nextGame', 'lastGame']) {
    const a = t[key];
    const b = clone[key];
    if (!a || !b) continue;
    if (a.opponentCode === 'SHE' && b.opponentCode === 'USHE') {
      fail('reapply-opp-flip', `${t.code} SHE→USHE`, { date: a.date, from: a.opponentFullName, to: b.opponentFullName });
      flips += 1;
    }
    if (a.opponentCode === 'USHE' && b.opponentCode === 'SHE') {
      fail('reapply-opp-flip', `${t.code} USHE→SHE`, { date: a.date });
      flips += 1;
    }
  }
}

// ── Report ────────────────────────────────────────────────────────
if (!issues.length) {
  console.log('OK audit-sports-sectors — 0 issue (%d teams, %d registry)', teams.length, reg.teams.length);
  process.exit(0);
}

console.error('FAIL audit-sports-sectors — %d issue(s)\n', issues.length);
const byKind = {};
for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
console.error('by kind:', byKind);
for (const i of issues.slice(0, 50)) {
  console.error(`- [${i.kind}] ${i.msg}`, i.date || '', i.sport || '');
}
if (issues.length > 50) console.error(`… +${issues.length - 50} more`);
process.exit(1);

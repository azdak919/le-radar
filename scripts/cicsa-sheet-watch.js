#!/usr/bin/env node
'use strict';
/** Bascule auto des chiffriers CICSA (sports-sailing.json) ; alerte dans cicsa.sheetAlert. */
const fs = require('fs');
const path = require('path');
const lib = require('./cicsa-sheet-watch-lib');
const { resolveSeason } = require('./cicsa-sailing-lib');

const FILE = path.join(__dirname, '..', 'sports-sailing.json');
const UA = { 'user-agent': 'LE-RADAR-SportsBot/1.0 (+https://le-radar.ca/)' };
const get = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };

(async () => {
  const cfgAll = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const cfg = cfgAll.cicsa || {};
  const ids = new Set();
  let pagesOk = 0;
  for (const u of [cfg.resultsUrl, cfg.scheduleUrl].filter(Boolean)) {
    try { const html = await get(u); pagesOk += 1; for (const m of html.matchAll(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/g)) ids.add(m[1]); } catch (e) { console.log(`page CICSA illisible : ${e.message}`); }
  }
  const pageIds = [...ids];
  for (const id of [cfg.scoresSheetId, cfg.scheduleSheetId]) if (id) ids.add(id);
  const sheets = [];
  for (const id of ids) {
    try { const t = await get(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`); if (!/^\s*</.test(t)) sheets.push({ id, head: t.slice(0, 400) }); } catch { /* feuille privée ou morte */ }
  }
  const d = lib.decide({ cfg, seasonStartYear: resolveSeason(cfg).seasonStartYear, listedIds: pagesOk === 2 ? pageIds : [], sheets });
  // Une feuille actuelle illisible compte aussi comme alerte.
  for (const id of [d.scoresSheetId, d.scheduleSheetId]) if (!sheets.some((s) => s.id === id)) d.alerts.push(`feuille ${id} illisible (privée ou supprimée)`);
  console.log(JSON.stringify(d, null, 2));
  const next = { ...cfg, scoresSheetId: d.scoresSheetId, scheduleSheetId: d.scheduleSheetId };
  if (d.alerts.length) next.sheetAlert = d.alerts.join(' ; '); else delete next.sheetAlert;
  if (JSON.stringify(next) !== JSON.stringify(cfg) && process.argv.includes('--update')) {
    cfgAll.cicsa = next;
    fs.writeFileSync(FILE, `${JSON.stringify(cfgAll, null, 2)}\n`);
  }
})().catch((e) => { console.log(`veille CICSA : ${e.message}`); });

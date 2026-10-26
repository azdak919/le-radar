'use strict';
/**
 * Stockage mensuel du catalogue historique (lot E, 26 oct. 2026).
 *
 * Le catalogue n'est plus un seul news-archive.json de ~13 Mo réécrit à
 * chaque collecte : il est découpé en data/archives/AAAA-MM.json (mois de
 * publication), plus data/archives/index.json (métadonnées + liste des mois).
 * Un mois inchangé n'est jamais réécrit, donc les commits du bot ne touchent
 * que les mois réellement modifiés.
 *
 * Lecture : readArchive() recompose { schemaVersion, updated, records } comme
 * avant. Transition : si l'index n'existe pas, on lit l'ancien
 * news-archive.json. Écriture : seul Update Student News (fetch-news.js)
 * appelle writeArchive() en CI ; elle supprime l'ancien fichier monolithique.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UNDATED = '0000-00';

function dirs(root = ROOT) {
  return {
    dir: path.join(root, 'data', 'archives'),
    index: path.join(root, 'data', 'archives', 'index.json'),
    legacy: path.join(root, 'news-archive.json'),
  };
}

function monthOf(record) {
  const t = Date.parse(record?.publishedAt || '');
  if (!Number.isFinite(t)) return UNDATED;
  return new Date(t).toISOString().slice(0, 7);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sortRecords(records) {
  return records.sort((a, b) => (Date.parse(b.publishedAt || 0) || 0) - (Date.parse(a.publishedAt || 0) || 0));
}

/** Catalogue complet { schemaVersion, updated, records }. Lève si rien n'existe et pas de fallback. */
function readArchive(root = ROOT, fallback) {
  const p = dirs(root);
  if (fs.existsSync(p.index)) {
    const index = readJson(p.index);
    const records = [];
    for (const m of index.months || []) {
      const data = readJson(path.join(p.dir, `${m.month}.json`));
      records.push(...(data.records || []));
    }
    return { schemaVersion: index.schemaVersion || 1, updated: index.updated, records: sortRecords(records) };
  }
  if (fs.existsSync(p.legacy)) return readJson(p.legacy);
  if (fallback !== undefined) return fallback;
  throw new Error('catalogue historique introuvable (data/archives/index.json ou news-archive.json)');
}

function monthText(month, records, schemaVersion) {
  const body = records.map((r) => JSON.stringify(r)).join(',\n');
  return `{"schemaVersion":${schemaVersion},"month":"${month}","records":[\n${body}\n]}\n`;
}

/**
 * Écrit le catalogue en fichiers mensuels. Ne réécrit que les mois changés,
 * supprime les mois vidés et l'ancien news-archive.json.
 * @returns {{written:string[], removed:string[], months:number, bytes:number}}
 */
function writeArchive(catalog, root = ROOT) {
  const p = dirs(root);
  fs.mkdirSync(p.dir, { recursive: true });
  const schemaVersion = Number(catalog?.schemaVersion) || 1;
  const groups = new Map();
  for (const r of catalog?.records || []) {
    const m = monthOf(r);
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(r);
  }
  const months = [...groups.keys()].sort().reverse();
  const written = [];
  const removed = [];
  const meta = [];
  let bytes = 0;
  for (const m of months) {
    const file = path.join(p.dir, `${m}.json`);
    const text = monthText(m, sortRecords(groups.get(m)), schemaVersion);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (prev !== text) { fs.writeFileSync(file, text); written.push(m); }
    const size = Buffer.byteLength(text);
    bytes += size;
    meta.push({ month: m, count: groups.get(m).length, bytes: size });
  }
  for (const f of fs.readdirSync(p.dir)) {
    const m = /^(\d{4}-\d{2})\.json$/.exec(f);
    if (m && !groups.has(m[1])) { fs.unlinkSync(path.join(p.dir, f)); removed.push(m[1]); }
  }
  const index = {
    schemaVersion,
    updated: catalog?.updated || null,
    total: meta.reduce((n, x) => n + x.count, 0),
    months: meta,
  };
  fs.writeFileSync(p.index, `${JSON.stringify(index, null, 1)}\n`);
  if (fs.existsSync(p.legacy)) fs.unlinkSync(p.legacy);
  return { written, removed, months: months.length, bytes };
}

module.exports = { readArchive, writeArchive, monthOf, UNDATED, archivePaths: dirs };

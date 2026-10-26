'use strict';
/**
 * Boîtes d'envoi du catalogue historique (lot D, 26 oct. 2026).
 *
 * Update Student News (fetch-news.js) est le SEUL écrivain de
 * news-archive.json. Les autres bots (rétro-crawl, contrôle des liens
 * historiques) n'y touchent plus : ils déposent leurs fiches modifiées dans
 * data/archive-inbox/<bot>.json, que fetch-news fusionne au passage suivant.
 * fetch-news note ce qu'il a fusionné dans data/archive-inbox-applied.json
 * (son fichier) ; chaque bot purge ensuite ses lots déjà fusionnés (le sien).
 * Ainsi deux bots n'écrivent jamais le même fichier : plus de conflit de rebase.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INBOX_DIR = path.join(ROOT, 'data', 'archive-inbox');
const APPLIED_PATH = path.join(ROOT, 'data', 'archive-inbox-applied.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readApplied(root = ROOT) {
  const file = root === ROOT ? APPLIED_PATH : path.join(root, 'data', 'archive-inbox-applied.json');
  const data = readJson(file, null);
  return data && typeof data === 'object' && data.bots ? data : { schemaVersion: 1, bots: {} };
}

function inboxPath(bot, root = ROOT) {
  if (!/^[a-z0-9-]+$/.test(bot)) throw new Error(`nom de bot invalide : ${bot}`);
  return path.join(root, 'data', 'archive-inbox', `${bot}.json`);
}

function readInbox(bot, root = ROOT) {
  const data = readJson(inboxPath(bot, root), null);
  return data && Array.isArray(data.batches) ? data : { schemaVersion: 1, bot, batches: [] };
}

function listInboxes(root = ROOT) {
  const dir = path.join(root, 'data', 'archive-inbox');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

function sortRecords(records) {
  return records.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
}

/** Lots pas encore fusionnés par fetch-news, tous bots confondus. */
function pendingBatches(root = ROOT) {
  const applied = readApplied(root).bots;
  const out = [];
  for (const bot of listInboxes(root)) {
    const seen = Number(applied[bot]) || 0;
    for (const batch of readInbox(bot, root).batches) {
      if ((Number(batch.seq) || 0) > seen) out.push({ bot, ...batch });
    }
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/**
 * Applique des lots à un catalogue (sans écrire). Retourne le catalogue et,
 * par bot, le plus haut seq appliqué.
 */
function applyBatches(catalog, batches) {
  const records = Array.isArray(catalog?.records) ? catalog.records : [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const applied = {};
  let upserts = 0;
  let removals = 0;
  for (const batch of batches) {
    for (const rec of batch.records || []) {
      if (!rec || !rec.id) continue;
      byId.set(rec.id, rec);
      upserts += 1;
    }
    for (const id of batch.removeIds || []) {
      if (byId.delete(id)) removals += 1;
    }
    applied[batch.bot] = Math.max(applied[batch.bot] || 0, Number(batch.seq) || 0);
  }
  if (!batches.length) return { catalog, applied, upserts, removals };
  return {
    catalog: { ...catalog, records: sortRecords([...byId.values()]) },
    applied,
    upserts,
    removals,
  };
}

/** Le catalogue tel qu'il sera après la prochaine fusion de fetch-news. */
function withPendingInboxes(catalog, root = ROOT) {
  return applyBatches(catalog, pendingBatches(root)).catalog;
}

function diffCatalogs(before, after) {
  const prev = new Map((before?.records || []).map((r) => [r.id, JSON.stringify(r)]));
  const nextIds = new Set();
  const records = [];
  for (const r of after?.records || []) {
    if (!r?.id) continue;
    nextIds.add(r.id);
    if (prev.get(r.id) !== JSON.stringify(r)) records.push(r);
  }
  const removeIds = [...prev.keys()].filter((id) => !nextIds.has(id));
  return { records, removeIds };
}

/**
 * Dépose dans la boîte du bot les fiches qui diffèrent entre `before` et
 * `after`, et purge ses lots déjà fusionnés. Retourne le nombre de fiches.
 */
function queueArchiveChanges(bot, before, after, root = ROOT) {
  const { records, removeIds } = diffCatalogs(before, after);
  const seen = Number(readApplied(root).bots[bot]) || 0;
  const inbox = readInbox(bot, root);
  const kept = inbox.batches.filter((b) => (Number(b.seq) || 0) > seen);
  const changedInbox = kept.length !== inbox.batches.length;
  if (!records.length && !removeIds.length && !changedInbox) return 0;
  const lastSeq = Math.max(seen, ...inbox.batches.map((b) => Number(b.seq) || 0));
  if (records.length || removeIds.length) {
    kept.push({ seq: lastSeq + 1, at: new Date().toISOString(), records, ...(removeIds.length ? { removeIds } : {}) });
  }
  const file = inboxPath(bot, root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, bot, batches: kept })}\n`, 'utf8');
  return records.length + removeIds.length;
}

function writeApplied(applied, root = ROOT) {
  const cur = readApplied(root);
  let changed = false;
  for (const [bot, seq] of Object.entries(applied)) {
    if ((Number(cur.bots[bot]) || 0) < seq) { cur.bots[bot] = seq; changed = true; }
  }
  if (!changed) return false;
  const file = root === ROOT ? APPLIED_PATH : path.join(root, 'data', 'archive-inbox-applied.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cur, null, 2)}\n`, 'utf8');
  return true;
}

module.exports = {
  INBOX_DIR,
  APPLIED_PATH,
  readApplied,
  readInbox,
  pendingBatches,
  applyBatches,
  withPendingInboxes,
  diffCatalogs,
  queueArchiveChanges,
  writeApplied,
};

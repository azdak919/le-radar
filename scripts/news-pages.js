#!/usr/bin/env node
/**
 * Fil public par pages : le site ne télécharge plus ~1 000 articles d'un coup.
 *
 *   news-latest.json   → 1re page (une, En bref, 10 premières cartes de la
 *                        Suite du fil + réserve d'équilibre des colonnes),
 *                        avec le total et la liste complète des sources.
 *   news-page-2.json … → pages suivantes, chargées au défilement ou au
 *                        bouton « Charger plus », ou toutes d'un coup pour
 *                        la recherche / un filtre de source.
 *
 * news.json reste le fichier canonique complet (scripts du dépôt, appli
 * Android, Worker, affiches, fiches article, consommateurs externes) : schéma
 * et champ count inchangés.
 *
 * Les pages publiques sont minifiées et sans les marques internes des files
 * de vérification (article-check-queue-lib) : le client ne les lit jamais.
 *
 * Taille des pages (mesurée le 17 nov. 2026, ~1 000 articles, ~1,1 ko par
 * article minifié, ~0,3 ko compressé) : 60 articles en 1re page. Cette
 * page réserve d’abord le dernier article de chaque source des 14 jours
 * (repère : news.updated), puis complète avec les plus récents, pour que
 * l’accueil puisse asseoir ces sources sans attendre les pages suivantes.
 * Puis 30 par page (≈ 9 ko compressés, un écran et demi de cartes).
 *
 *   node scripts/news-pages.js --update
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_PATH = path.join(ROOT, 'news.json');
const LATEST = 'news-latest.json';
const PAGE_PREFIX = 'news-page-';
const FIRST_PAGE_SIZE = 60;
const PAGE_SIZE = 30;

/** Marques internes (files de vérification, cache) jamais lues par le client. */
const INTERNAL_FIELDS = [
  'authorCheckedAt', 'authorAttemptAt',
  'imageHealthKey', 'imageHealthAt',
  'leadImageCheckedKey', 'leadImageCheckedAt',
  'sourceImageCreditTriedAt', 'sourceImageCreditRev', 'sourceImageCreditImageKey', 'sourceImageCreditHintRev',
  'imageLocalKey', 'imageDead',
  '_retainedFromCache', '_pageAuthor', '_campusBank',
];

function publicItem(item = {}) {
  const out = { ...item };
  for (const k of INTERNAL_FIELDS) delete out[k];
  return out;
}

function pageFile(n) {
  return `${PAGE_PREFIX}${n}.json`;
}

/** Découpe pure (testée) : { latest, pages: [{ file, data }] }. */
function buildNewsPages(news = {}, { firstSize = FIRST_PAGE_SIZE, pageSize = PAGE_SIZE } = {}) {
  const items = (news.items || [])
    .slice()
    .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0))
    .map(publicItem);
  const total = items.length;
  const diversity = require('./homepage-diversity-lib.js');
  const referenceDate = news.updated ? new Date(news.updated) : new Date();
  const firstPage = diversity.reserveFirstPage(
    items,
    firstSize,
    referenceDate,
    diversity.DIVERSITY_HORIZON_DAYS,
  );
  const firstKeys = new Set(firstPage.map((item) => item.link || `${item.source}::${item.date}::${item.title}`));
  const rest = items.filter((item) => !firstKeys.has(item.link || `${item.source}::${item.date}::${item.title}`));
  const pages = [];
  for (let i = 0; i < rest.length; i += pageSize) {
    const n = pages.length + 2;
    pages.push({ file: pageFile(n), data: { page: n, items: rest.slice(i, i + pageSize) } });
  }
  // Toutes les sources du fil (pastilles de filtre, couleurs) sans charger
  // les pages : nom + établissement + type, le reste vient de news-sources.json.
  const seen = new Map();
  for (const it of items) {
    if (it.source && !seen.has(it.source)) {
      seen.set(it.source, { source: it.source, institution: it.institution || '', type: it.type || '' });
    }
  }
  const latest = {
    updated: news.updated,
    ...(news.updatedSlot ? { updatedSlot: news.updatedSlot } : {}),
    count: total,
    total,
    pageSize,
    pages: pages.map((p) => p.file),
    sourceList: [...seen.values()],
    items: firstPage,
  };
  if (news.freshnessSessions) latest.freshnessSessions = news.freshnessSessions;
  return { latest, pages };
}

function main() {
  const news = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  const { latest, pages } = buildNewsPages(news);
  if (!process.argv.includes('--update')) {
    console.log(`news-pages (dry-run) : ${latest.items.length} + ${pages.length} page(s) de ${PAGE_SIZE}`);
    return;
  }
  for (const p of pages) {
    p.data.updated = latest.updated;
    fs.writeFileSync(path.join(ROOT, p.file), JSON.stringify(p.data));
  }
  fs.writeFileSync(path.join(ROOT, LATEST), JSON.stringify(latest));
  // Pages devenues inutiles (fil plus court) : retirées.
  const keep = new Set(pages.map((p) => p.file));
  for (const name of fs.readdirSync(ROOT)) {
    if (name.startsWith(PAGE_PREFIX) && name.endsWith('.json') && !keep.has(name)) fs.unlinkSync(path.join(ROOT, name));
  }
  const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0);
  console.log(`news-pages : ${LATEST} ${latest.items.length} article(s) (${kb(LATEST)} ko), ${pages.length} page(s) de ${PAGE_SIZE}, total ${latest.total}`);
}

module.exports = { buildNewsPages, publicItem, INTERNAL_FIELDS, FIRST_PAGE_SIZE, PAGE_SIZE };

if (require.main === module) main();

#!/usr/bin/env node
// Envoi ponctuel Instagram des trois unes B (20 nov. soir, 21 nov. matin, 21 nov. soir).
// Ne touche ni policy.json (rampe), ni une-state.json (créneaux du 22 nov. intacts),
// ni instagram-state.json (pas d’arrêt « halted », pas de compte dans le plafond du 22).
// Légendes : texts.instagram figés dans une-state.json. Clé : BUFFER_INSTAGRAM_API_KEY (jamais affichée).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOTS, byline, checkUneText } from './une-lib.mjs';
import { renderImages } from './une-render.mjs';
import { hostImages } from './une-run.mjs';
import { createInstagramBuffer, INSTAGRAM_METADATA, scrub } from './instagram.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRY = process.env.DRY_RUN !== 'false';
const GAP_MS = Number(process.env.CATCHUP_GAP_MS || 180000);
const SLOTS_SPEC = [
  { key: '2026-11-20:soir', day: '2026-11-20', id: 'soir' },
  { key: '2026-11-21:matin', day: '2026-11-21', id: 'matin' },
  { key: '2026-11-21:soir', day: '2026-11-21', id: 'soir' },
];

function rd(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function montreal(iso) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)) + ' (America/Toronto, Montréal)';
}

function enrich(id, official, pages, revueCredit) {
  const a = pages[id] || {};
  const source = official?.source || a.source || '';
  const author = a.author || '';
  const credit = a.credit || revueCredit[id] || '';
  const image = a.image || '';
  return {
    id, title: official?.title || a.title || '', source,
    byline: official?.byline || byline({ author, source, authors: author }) || [author, source].filter(Boolean).join(' · '),
    credit, images: image ? [image] : [], siteImage: image || '',
    pageUrl: `https://le-radar.ca/article/${id}/`,
  };
}

function officialItems(text) {
  const items = [];
  const re = /^\s*(\d+)\.\s+(.+?)\n✍️\s+(.+)$/gm;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const by = m[3].trim();
    items.push({ title: m[2].trim(), byline: by, source: by.includes(' · ') ? by.split(' · ').slice(-1)[0].trim() : '' });
  }
  return items;
}

const state = rd('data/social/une-state.json');
const pages = rd('data/article-pages.json').articles;
const revueCredit = {};
for (const f of ['2026-11-20-soir', '2026-11-21-matin', '2026-11-21-soir']) {
  try {
    for (const it of rd(`data/revue/reviews/${f}.json`).items || []) {
      if (it.id) revueCredit[it.id] = it.credit || it.sourceImageCredit || '';
    }
  } catch {}
}

const jobs = [];
for (const [i, s] of SLOTS_SPEC.entries()) {
  const entry = state[s.key];
  if (!entry) throw new Error(`créneau absent de une-state : ${s.key}`);
  const text = entry.texts?.instagram;
  if (!text) throw new Error(`légende Instagram absente : ${s.key}`);
  const problems = checkUneText(text, 'instagram', {
    items: officialItems(text),
    slot: { ...SLOTS[s.id], day: s.day, key: s.key },
    credit: '',
  });
  if (problems.length) throw new Error(`${s.key} : légende refusée : ${problems.join(', ')}`);
  const items = (entry.ids || []).map((id, j) => enrich(id, officialItems(text)[j], pages, revueCredit));
  const slot = { ...SLOTS[s.id], day: s.day, key: s.key };
  const model = { slot, items, sports: { results: [], next: [] }, radio: [] };
  const outDir = path.join(ROOT, 'une-preview', 'catchup', s.key.replace(':', '-'));
  console.log(`Rendu ${s.key}…`);
  const images = await renderImages(model, { outDir, prefix: 'une', formats: ['grille'], port: 4400 + i });
  if (!images.grille?.file) throw new Error(`${s.key} : image grille manquante`);
  const urls = await hostImages({ grille: images.grille }, s.key);
  if (!urls.grille) throw new Error(`${s.key} : hébergement de la grille impossible`);
  jobs.push({ key: s.key, text, alt: entry.alt || '', image: urls.grille, file: images.grille.file });
  console.log(`Image ${s.key} : ${urls.grille}`);
}

if (DRY) {
  console.log('DRY_RUN : aucun envoi Buffer.');
  for (const j of jobs) console.log(`— ${j.key}\n${j.image}\n${j.text.slice(0, 120)}…\n`);
  process.exit(0);
}

const ch = createInstagramBuffer(process.env);
if (!ch) throw new Error('client Instagram indisponible (clé absente ou confondue avec le compte principal)');

const results = [];
for (const [i, j] of jobs.entries()) {
  if (i) {
    console.log(`Pause ${Math.round(GAP_MS / 1000)} s avant ${j.key}…`);
    await sleep(GAP_MS);
  }
  const at = new Date().toISOString();
  try {
    const post = await ch.add({ text: j.text, image: j.image, alt: j.alt, now: true, metadata: INSTAGRAM_METADATA });
    const row = { key: j.key, action: 'sent', id: post?.id || '', status: post?.status || '', at, montreal: montreal(at), image: j.image };
    if (!row.id) throw new Error('Buffer createPost sans identifiant');
    results.push(row);
    console.log(`→ Instagram ${j.key} : id=${row.id} status=${row.status || '(vide)'} ${row.montreal}`);
  } catch (e) {
    const row = { key: j.key, action: 'error', id: '', status: '', at, montreal: montreal(at), error: scrub(e?.message || e) };
    results.push(row);
    console.log(`::error::Instagram ${j.key} : ${row.error}`);
    fs.writeFileSync(path.join(ROOT, 'une-preview', 'catchup-results.json'), JSON.stringify(results, null, 2));
    process.exit(1);
  }
}

const out = path.join(ROOT, 'une-preview', 'catchup-results.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['## Envoi Instagram ponctuel (trois unes B)', '',
    '| Créneau | id Buffer | statut | heure (Montréal) |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.key} | ${r.id} | ${r.status || '—'} | ${r.montreal} |`),
    '',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
console.log('Terminé, sans modification de la rampe ni des créneaux du 22 novembre.');

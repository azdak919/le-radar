#!/usr/bin/env node
// « La revue du matin » (≈ 7 h) et « La revue du soir » (≈ 19 h 15), heure de Montréal : articles originaux du Radar.
//  - Sélection, sport, radio et garde-fou : scripts/revue/revue-lib.mjs ; résumés IA : revue-ai.mjs ; rendu : revue-render.js.
//  - Publication RÉELLE seulement si data/revue/config.json `publish` vaut true (défaut : false). Sinon, rien n'est écrit dans
//    le dépôt ; `--sample --out dossier` produit un exemple complet (pages, flux, sitemaps) hors du dépôt.
//  - Rien de neuf (aucun article depuis la revue précédente) : édition sautée, comme La une du soir.
//  - IA indisponible ou texte refusé : gabarit déterministe (extraits d'origine). Revue vide ou donnée non vérifiable : rien ne sort.
// Usage :
//   node scripts/revue/revue-run.mjs --gate                       # porte du workflow (due=true|false)
//   node scripts/revue/revue-run.mjs [--edition auto|matin|soir] [--now ISO|news] [--refresh]
//   node scripts/revue/revue-run.mjs --sample --edition matin --day 2026-11-17 --at 07:00 --out /tmp/revue
//   node scripts/revue/revue-run.mjs --rebuild                     # re-rend pages, index, flux et sitemaps depuis data/revue
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as L from './revue-lib.mjs';
import { aiReview, aiEnabled } from './revue-ai.mjs';
import { fetchWeather } from './revue-weather.mjs';

const require = createRequire(import.meta.url);
const R = require('./revue-render.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = n => process.argv.includes('--' + n);
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')); } catch (e) { if (d !== undefined) return d; throw e; } };
const tz = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' }) + ' (heure de Montréal)';
const summary = s => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n'); };

export const loadConfig = (root = ROOT) => L.mergeConfig(rd(path.join(root, 'data/revue/config.json'), {}));

/** Porte du workflow : rien sans publish = true ; sinon édition due (pas encore publiée ni sautée) ou mise à jour tardive. */
export function gate({ now = Date.now(), cfg = loadConfig(), index = [], state = {}, forced = '' } = {}) {
  if (!cfg.publish) return { due: false, edition: '', mode: '', why: 'publication désactivée (data/revue/config.json publish = false)' };
  if (forced && forced !== 'auto') return { due: true, edition: forced, mode: 'publier', why: 'édition forcée (déclenchement manuel)' };
  const e = L.editionAt(now, cfg);
  if (e) {
    if (index.some(r => r.id === e.key)) return { due: false, edition: e.id, mode: '', why: `${e.key} déjà publiée` };
    if (state[e.key]?.skipped) return { due: false, edition: e.id, mode: '', why: `${e.key} déjà sautée (${state[e.key].why})` };
    return { due: true, edition: e.id, mode: 'publier', why: `${e.key} due` };
  }
  const r = L.refreshAt(now, cfg);
  if (r && index.some(x => x.id === r.key)) return { due: true, edition: 'soir', mode: 'rafraichir', why: `${r.key} : mise à jour tardive des résultats` };
  return { due: false, edition: '', mode: '', why: `hors des fenêtres : ${tz(now)}` };
}

/** Taille de l'image (enclosure RSS) : HEAD, 0 si inconnue. */
async function imageLength(url) {
  try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); return r.ok ? Number(r.headers.get('content-length') || 0) : 0; } catch { return 0; }
}
const indexEntry = m => ({
  id: m.id, edition: m.edition.id, day: m.edition.day, path: m.path, url: m.url, headline: m.headline, description: m.description,
  datePublished: m.datePublished, dateModified: m.dateModified, periodEnd: new Date(m.period.end).toISOString(),
  articleIds: m.articleIds, sportKeys: m.sportKeys, counts: { articles: m.items.length, results: m.sports.results.length, next: m.sports.next.length, radio: m.radio.reduce((n, s) => n + s.shows.length, 0) },
  image: m.image?.url || '', generator: m.generator, lead: L.highlights(m.items, 1)[0]?.title || '',
});

/**
 * Génère une revue. Retourne { status: 'publiée'|'sautée'|'refusée'|'inchangée', model?, problems?, why }.
 * `io` : { news, masthead, schedules, index, reviews, cfg, env, fetchImpl, refresh }.
 */
/** « 19:15 » (heure de Montréal) d'un instant : heure de publication pour les matchs du soir même. */
const atOf = t => { const p = L.mtl(typeof t === 'number' ? t : Date.parse(t)); return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`; };
export async function generate(editionId, now, io) {
  const { cfg, index = [], reviews = {}, env = process.env } = io;
  const edition = editionId && editionId !== 'auto' ? L.editionFor(editionId, now, cfg) : L.editionAt(now, cfg);
  if (!edition) return { status: 'sautée', why: `hors des fenêtres de publication (${tz(now)})` };
  const data = { news: io.news, masthead: io.masthead, schedules: io.schedules };
  const doubts = [];
  const updated = Date.parse(io.news?.updated || '');
  if (!Number.isFinite(updated) || (now - updated) / 3600e3 > 6) doubts.push(`news.json trop ancien ou sans date (${Number.isFinite(updated) ? Math.round((now - updated) / 3600e3) + ' h' : 'inconnu'})`);

  // Mise à jour tardive : seulement les nouveaux résultats du jour, rien d'autre ne change.
  if (io.refresh) {
    const prev = reviews[edition.key];
    if (!prev) return { status: 'sautée', why: `${edition.key} : aucune revue du soir à mettre à jour` };
    const cov = L.covered(index, edition.key, reviews);
    const fresh = L.periodSports(io.masthead, edition, { coveredKeys: cov.sports, cfg, at: atOf(prev.datePublished) });
    const known = new Set(prev.sports.results.map(r => r.key));
    const added = fresh.results.filter(r => !known.has(r.key));
    if (!added.length) return { status: 'inchangée', why: `${edition.key} : aucun nouveau résultat` };
    const model = { ...prev, sports: { results: fresh.results, next: fresh.next }, dateModified: new Date(now).toISOString(), refreshedAt: new Date(now).toISOString() };
    model.sportKeys = model.sports.results.map(r => r.key);
    model.intro = L.ledeOf(model);
    model.description = L.descriptionOf(model);
    const problems = L.validateReview(model, data);
    if (problems.length) return { status: 'refusée', problems, why: 'garde-fou' };
    return { status: 'publiée', model, why: `${added.length} nouveau(x) résultat(s)`, refreshed: true };
  }

  const period = L.periodOf(edition, now, index, cfg);
  const cov = L.covered(index, edition.key, reviews);
  const items = L.selectArticles(io.news, period, { coveredIds: cov.ids, max: cfg.maxArticles });
  if (!items.length && cfg.skipWithoutArticles) return { status: 'sautée', why: `aucun nouvel article entre ${tz(period.start)} et ${tz(period.end)} : édition sautée` };
  const sports = L.periodSports(io.masthead, edition, { coveredKeys: cov.sports, cfg, at: atOf(reviews[edition.key]?.datePublished || now) });
  const radio = L.periodRadio(io.schedules, edition, cfg);
  const ai = cfg.ai?.enabled === false ? null : await aiReview(items, { env, fetchImpl: io.fetchImpl || fetch, batchSize: cfg.ai?.batchSize, maxCalls: cfg.ai?.maxCallsPerRun, edition: edition.id });
  for (const l of ai?.log || []) console.log(l);
  const prevEntry = index.filter(r => r.id !== edition.key && Date.parse(r.datePublished) < now).sort((a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished))[0];
  let model = L.buildModel({ edition, period, items, sports, radio, now, ai, published: reviews[edition.key]?.datePublished || null, previous: prevEntry ? { id: prevEntry.id, path: prevEntry.path, headline: prevEntry.headline } : null });
  let problems = L.validateReview(model, data);
  // Un texte d'IA refusé au contrôle final : on retombe sur le gabarit pour TOUTE la revue plutôt que de publier un doute.
  if (problems.some(p => /^(résumé|chapeau) refusé/.test(p))) {
    console.log(`::warning::garde-fou final : ${problems.filter(p => /refusé/.test(p)).join(' ; ')} → gabarit déterministe.`);
    model = L.buildModel({ edition, period, items, sports, radio, now, ai: null, published: model.datePublished, previous: model.previous });
    problems = L.validateReview(model, data);
  }
  // Météo ECCC, lue à l'horloge réelle (le Datamart vit sous /today/) ; un --day/--at ne doit pas relire la veille. Échec → pas de bloc, jamais un refus.
  let weather = null;
  try { weather = io.fetchWeather ? await io.fetchWeather() : null; } catch { weather = null; }
  if (weather?.cities?.length) model = { ...model, weather };
  if (doubts.length) problems.push(...doubts.map(d => `DOUTE : ${d}`));
  if (problems.length) return { status: 'refusée', problems, model, why: 'garde-fou : rien ne sort' };
  return { status: 'publiée', model, why: `${items.length} article(s), ${sports.results.length} résultat(s), ${sports.next.length} match(s) à venir, ${radio.length} station(s)` };
}

/** Écrit la revue et tout ce qui en dépend sous `root` (le dépôt en publication réelle, un dossier d'exemple sinon). */
export function writeOutputs(root, { model, index, reviews, publish, now = Date.now(), cfg }) {
  const w = (rel, s) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  if (model) {
    reviews[model.id] = model;
    const html = R.renderReviewPage(model);
    const foreign = L.foreignLinks(R.articleBody(model), model);
    if (foreign.length) throw new Error(`liens hors données dans la page : ${foreign.slice(0, 3).join(', ')}`);
    w(path.join(model.path, 'index.html'), html);
    w(`data/revue/reviews/${model.id}.json`, JSON.stringify(model, null, 1) + '\n');
    const i = index.findIndex(r => r.id === model.id);
    if (i >= 0) index[i] = indexEntry(model); else index.push(indexEntry(model));
  }
  index.sort((a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished));
  w('data/revue/index.json', JSON.stringify(index, null, 1) + '\n');
  w('revue/index.html', R.renderIndexPage(index));
  const models = index.slice(0, cfg.feedItems || 10).map(r => reviews[r.id] || rd(path.join(root, `data/revue/reviews/${r.id}.json`), null)).filter(Boolean);
  w('revue/feed.xml', R.revueFeedXml(models, { now }));
  w(R.NEWS_SITEMAP, R.newsSitemap(index, { now, hours: cfg.newsSitemapHours || 48 }));
  if (publish) {
    const robots = path.join(root, 'robots.txt');
    const before = fs.readFileSync(robots, 'utf8'), after = R.robotsWithNewsSitemap(before, true);
    if (after !== before) fs.writeFileSync(robots, after);
  }
}

async function main() {
  const cfg = loadConfig();
  const sample = has('sample');
  const out = sample ? path.resolve(arg('out', 'revue-sample')) : ROOT;
  const dataRoot = sample && fs.existsSync(path.join(out, 'data/revue/index.json')) ? out : ROOT;
  const index = rd(path.join(dataRoot, 'data/revue/index.json'), []);
  const statePath = path.join(ROOT, 'data/revue/state.json');
  const state = rd(statePath, {});
  const newsFile = arg('news', 'news.json');
  // --day AAAA-MM-JJ --at HH:MM : instant en heure de Montréal (exemples) ; --now ISO|news ; sinon maintenant.
  const now = arg('day') ? L.mtlInstant(arg('day'), arg('at', '12:00')) : arg('now') === 'news' ? Date.parse(rd(newsFile).updated) : arg('now') ? Date.parse(arg('now')) : Date.now();
  const forced = arg('edition', process.env.REVUE_EDITION || 'auto');

  if (has('gate')) {
    const g = gate({ now, cfg, index, state, forced });
    console.log(`Porte : ${g.why}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${g.due}\nedition=${g.edition}\nmode=${g.mode}\n`);
    return;
  }
  if (has('rebuild')) {
    if (!cfg.publish) { console.log('Publication désactivée : rien à reconstruire dans le dépôt.'); return; }
    const reviews = Object.fromEntries(index.map(r => [r.id, rd(path.join(ROOT, `data/revue/reviews/${r.id}.json`), null)]).filter(([, m]) => m));
    for (const m of Object.values(reviews)) fs.writeFileSync(path.join(ROOT, m.path, 'index.html'), R.renderReviewPage(m));
    writeOutputs(ROOT, { model: null, index, reviews, publish: true, now, cfg });
    console.log(`Reconstruit : ${Object.keys(reviews).length} revue(s).`);
    return;
  }
  if (!sample && !cfg.publish) { summary('Revue : publication désactivée (data/revue/config.json publish = false) ; rien n’est écrit. Utiliser --sample --out pour un exemple.'); return; }

  const reviews = Object.fromEntries(index.slice(0, 12).map(r => [r.id, rd(path.join(dataRoot, `data/revue/reviews/${r.id}.json`), null)]).filter(([, m]) => m));
  const io = { cfg, index, reviews, news: rd(newsFile), masthead: rd(arg('sports', 'sports-masthead.json'), { teams: {} }), schedules: rd(arg('radio', 'radio-schedules.json'), { stations: {} }), refresh: has('refresh') || process.env.REVUE_MODE === 'rafraichir', fetchWeather: has('sans-meteo') || process.env.REVUE_WEATHER === '0' ? null : () => fetchWeather() };
  console.log(`IA : ${aiEnabled() ? 'active (Workers AI)' : 'désactivée → gabarit déterministe'}`);
  const r = await generate(io.refresh ? 'soir' : forced, now, io);
  summary(`Revue (${sample ? 'EXEMPLE hors dépôt' : 'publication réelle'}) : ${r.status} — ${r.why}`);
  if (r.problems?.length) { for (const p of r.problems) console.log(`::error::${p}`); process.exitCode = sample ? 1 : 0; return; }
  if (r.status === 'sautée') {
    const e = forced !== 'auto' ? L.editionFor(forced, now, cfg) : L.editionAt(now, cfg);
    if (!sample && e && !io.refresh) { state[e.key] = { skipped: true, why: r.why, at: new Date(now).toISOString() }; for (const k of Object.keys(state)) if (k < L.addDays(L.mtl(now).ymd, -14)) delete state[k]; fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n'); }
    return;
  }
  if (r.status !== 'publiée') return;
  if (r.model.image && !r.model.image.length) r.model.image.length = await imageLength(r.model.image.url);
  writeOutputs(out, { model: r.model, index, reviews, publish: !sample && cfg.publish, now, cfg });
  summary(`→ ${sample ? path.join(out, r.model.path, 'index.html') : r.model.url} (${r.model.generator})`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

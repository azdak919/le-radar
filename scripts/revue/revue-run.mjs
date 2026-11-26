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
//   node scripts/revue/revue-run.mjs --edition matin --day 2026-11-20
//       # rattrapage réel : édition du 20 à 7 h (soir : 19 h 15), heure de Montréal
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

/** AAAA-MM-JJ calendaire (rejette 2026-11-31). */
export function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return false;
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Horloge d’un --day. Sans --at, le matin est à 7 h et le soir à 19 h 15 (heure de Montréal).
 * `pastDate` : la date civile est avant aujourd’hui (la météo du jour ne se relit pas).
 * `nominal` : l’instant demandé est déjà passé — fenêtre de l’édition (7 h / 19 h 15), sans reculer
 * dans le créneau voisin. Un --at encore dans le futur (exemple lancé avant 7 h) garde le recul habituel.
 */
export function resolveEditionClock({ day = '', at = '', edition = 'auto', cfg = loadConfig(), wall = Date.now() } = {}) {
  const backfill = !!day;
  let hhmm = at;
  if (day && !hhmm && (edition === 'matin' || edition === 'soir')) hhmm = cfg.editions[edition]?.target || '';
  const now = day ? L.mtlInstant(day, hhmm || '12:00') : wall;
  const pastDate = !!(day && L.mtl(now).ymd < L.mtl(wall).ymd);
  const nominal = !!(day && now <= wall + 60_000);
  return { now, at: hhmm, backfill, pastDate, nominal };
}

/** Un passage « publier » doit laisser une page, ou un saut noté (aucun article). Sinon le run échoue. */
export function publicationGuard({ mode = '', produced = false, skipped = false } = {}) {
  if (mode !== 'publier') return { ok: true, why: 'pas une publication due' };
  if (produced) return { ok: true, why: 'édition écrite' };
  if (skipped) return { ok: true, why: 'saut enregistré (aucun article)' };
  return { ok: false, why: 'édition due, aucune page et aucun saut' };
}

/** Porte du workflow : rien sans publish = true ; sinon édition due (fenêtre ouverte ou créneau manqué
 *  encore dans maxLookbackHours), ou mise à jour tardive. `backfill` (--day) : matin ou soir à l’horloge
 *  fournie, même hors fenêtre du jour. Une édition déjà dans l’index ne repart pas. */
export function gate({ now = Date.now(), cfg = loadConfig(), index = [], state = {}, forced = '', backfill = false, wall = Date.now() } = {}) {
  const withId = (g) => {
    const id = g.edition === 'matin' || g.edition === 'soir' ? L.editionFor(g.edition, now, cfg).key : '';
    return { ...g, id: g.id || id, day: g.day || '' };
  };
  if (!cfg.publish) return withId({ due: false, edition: '', mode: '', id: '', day: '', why: 'publication désactivée (data/revue/config.json publish = false)' });
  if (backfill) {
    if (forced !== 'matin' && forced !== 'soir') return { due: false, edition: '', mode: '', id: '', day: '', why: 'rattrapage : préciser l’édition matin ou soir' };
    const id = L.editionFor(forced, now, cfg).key;
    if (index.some(r => r.id === id)) return { due: false, edition: forced, mode: '', id, day: '', why: `${id} déjà publiée` };
    if (now > wall + 60_000) return { due: false, edition: forced, mode: '', id, day: '', why: `${id} : la date est dans le futur` };
    return { due: true, edition: forced, mode: 'publier', id, day: L.mtl(now).ymd, why: `${id} rattrapage à l’heure normale` };
  }
  if (forced && forced !== 'auto') return withId({ due: true, edition: forced, mode: 'publier', day: '', why: 'édition forcée (déclenchement manuel)' });
  const owed = L.owedEditions(now, cfg, index, state);
  if (owed.length) {
    const slot = owed[0];
    return {
      due: true, edition: slot.id, mode: 'publier', id: slot.key, day: slot.catchup ? slot.day : '',
      why: slot.catchup ? `${slot.key} due (fenêtre manquée)` : `${slot.key} due`,
    };
  }
  const r = L.refreshAt(now, cfg);
  if (r && index.some(x => x.id === r.key)) return { due: true, edition: 'soir', mode: 'rafraichir', id: r.key, day: '', why: `${r.key} : mise à jour tardive des résultats` };
  return { due: false, edition: '', mode: '', id: '', day: '', why: `hors des fenêtres : ${tz(now)}` };
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
  if (!io.refresh && index.some(r => r.id === edition.key)) return { status: 'inchangée', why: `${edition.key} déjà publiée` };
  const data = { news: io.news, masthead: io.masthead, schedules: io.schedules };
  const doubts = [];
  const updated = Date.parse(io.news?.updated || '');
  // Si --day/--at est dans le futur (exemple de PR à 7 h lancé avant 7 h), on juge
  // la fraîcheur à l'horloge réelle : une collecte de la nuit ne doit pas être
  // traitée comme périmée. En rattrapage (now dans le passé), on la juge à l'heure de l'édition.
  const freshAt = Math.min(now, Number.isFinite(io.wallClock) ? io.wallClock : Date.now());
  if (!Number.isFinite(updated) || (freshAt - updated) / 3600e3 > 6) doubts.push(`news.json trop ancien ou sans date (${Number.isFinite(updated) ? Math.round((freshAt - updated) / 3600e3) + ' h' : 'inconnu'})`);

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

  const period = L.periodOf(edition, now, index, cfg, { nominal: !!io.nominal });
  const cov = L.covered(index, edition.key, reviews);
  const items = L.selectArticles(io.news, period, { coveredIds: cov.ids, max: cfg.maxArticles });
  // Sport de la date demandée : `edition.day` suit `now` (--day / --at), pas l’horloge réelle.
  const sports = L.periodSports(io.masthead, edition, { coveredKeys: cov.sports, cfg, at: atOf(reviews[edition.key]?.datePublished || now) });
  const radio = L.periodRadio(io.schedules, edition, cfg);
  // Aucun nouvel article : l'édition sort quand même avec le sport et la radio (photo campus en couverture),
  // sauf si `publishWithoutArticles` est false ou qu'il n'y a ni match, ni résultat, ni émission.
  const filler = sports.results.length || sports.next.length || radio.some(s => s.shows.length);
  if (!items.length && cfg.skipWithoutArticles && !(cfg.publishWithoutArticles !== false && filler)) return { status: 'sautée', why: `aucun nouvel article entre ${tz(period.start)} et ${tz(period.end)} : édition sautée` };
  const ai = !items.length || cfg.ai?.enabled === false ? null : await aiReview(items, { env, fetchImpl: io.fetchImpl || fetch, batchSize: cfg.ai?.batchSize, maxCalls: cfg.ai?.maxCallsPerRun, edition: edition.id });
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
  // Météo ECCC du moment (Datamart sous /today/). Une date civile passée n’est pas relue :
  // le bloc est omis, et un échec de lecture ne refuse jamais la revue.
  const wall = Number.isFinite(io.wallClock) ? io.wallClock : Date.now();
  const pastDate = L.mtl(now).ymd < L.mtl(wall).ymd;
  let weather = null;
  if (!pastDate) {
    try { weather = io.fetchWeather ? await io.fetchWeather() : null; } catch { weather = null; }
  }
  if (weather?.cities?.length) model = { ...model, weather };
  if (doubts.length) problems.push(...doubts.map(d => `DOUTE : ${d}`));
  if (problems.length) return { status: 'refusée', problems, model, why: 'garde-fou : rien ne sort' };
  return { status: 'publiée', model, why: `${items.length ? '' : 'sans nouvel article (sport et radio) : '}${items.length} article(s), ${sports.results.length} résultat(s), ${sports.next.length} match(s) à venir, ${radio.length} station(s)` };
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
  // Plus récent d’abord, y compris un rattrapage daté de son heure d’édition (pas de l’horloge du rattrapage).
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
  const editionArg = arg('edition', process.env.REVUE_EDITION || 'auto');
  const dayArg = arg('day').trim();
  if (dayArg && !validDay(dayArg)) {
    console.error(`--day attend une date AAAA-MM-JJ (reçu : ${dayArg})`);
    process.exit(1);
  }
  // --day AAAA-MM-JJ : rattrapage réel ou exemple. Sans --at, 7 h (matin) ou 19 h 15 (soir).
  // --now ISO|news, sinon l’horloge réelle. --at explicite (exemples) l’emporte sur l’heure normale.
  const wall = Date.now();
  const clock = resolveEditionClock({ day: dayArg, at: arg('at', ''), edition: editionArg, cfg, wall });
  const now = dayArg ? clock.now : arg('now') === 'news' ? Date.parse(rd(newsFile).updated) : arg('now') ? Date.parse(arg('now')) : wall;

  if (has('gate')) {
    const g = gate({ now, cfg, index, state, forced: editionArg, backfill: clock.backfill, wall });
    console.log(`Porte : ${g.why}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${g.due}\nedition=${g.edition}\nmode=${g.mode}\nid=${g.id}\nday=${g.day || ''}\n`);
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
  const io = {
    cfg, index, reviews, news: rd(newsFile), masthead: rd(arg('sports', 'sports-masthead.json'), { teams: {} }), schedules: rd(arg('radio', 'radio-schedules.json'), { stations: {} }),
    refresh: has('refresh') || process.env.REVUE_MODE === 'rafraichir', wallClock: wall, nominal: clock.nominal,
    // Date civile passée : ne pas interroger le Datamart (il ne sert que /today/). Jamais un échec.
    fetchWeather: has('sans-meteo') || process.env.REVUE_WEATHER === '0' || clock.pastDate ? null : () => fetchWeather(),
  };
  console.log(`IA : ${aiEnabled() ? 'active (Workers AI)' : 'désactivée → gabarit déterministe'}`);
  if (has('drain')) {
    const slots = L.owedEditions(now, cfg, index, state);
    let produced = false;
    let skipped = false;
    for (const slot of slots) {
      const r = await generate(slot.id, slot.now, { ...io, refresh: false, nominal: slot.catchup });
      summary(`Revue (publication réelle) : ${slot.key} ${r.status} — ${r.why}`);
      if (r.status === 'refusée' || r.problems?.length) {
        for (const p of r.problems || [`${slot.key} refusée`]) console.log(`::error::${p}`);
        process.exit(1);
      }
      if (r.status === 'sautée') {
        state[slot.key] = { skipped: true, why: r.why, at: new Date(wall).toISOString() };
        skipped = true;
        continue;
      }
      if (r.status !== 'publiée' || !r.model) {
        console.error(`::error::${slot.key} : statut ${r.status || 'inconnu'}, rien n’est publié`);
        process.exit(1);
      }
      if (r.model.image && !r.model.image.length) r.model.image.length = await imageLength(r.model.image.url);
      writeOutputs(out, { model: r.model, index, reviews, publish: cfg.publish, now: slot.now, cfg });
      summary(`→ ${r.model.url} (${r.model.generator})`);
      if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `REVUE_PUBLISHED_ID=${r.model.id}\n`);
      produced = true;
      break;
    }
    if (skipped) {
      for (const k of Object.keys(state)) if (k < L.addDays(L.mtl(wall).ymd, -14)) delete state[k];
      fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');
    }
    const guard = publicationGuard({ mode: 'publier', produced, skipped });
    if (!guard.ok) { console.error(`::error::${guard.why}`); process.exit(1); }
    if (!produced) summary('Revue : créneaux dus sans article, sauts enregistrés.');
    return;
  }
  const r = await generate(io.refresh ? 'soir' : editionArg, now, io);
  summary(`Revue (${sample ? 'EXEMPLE hors dépôt' : 'publication réelle'}) : ${r.status} — ${r.why}`);
  if (r.problems?.length || r.status === 'refusée') {
    for (const p of r.problems || ['revue refusée']) console.log(`::error::${p}`);
    process.exit(1);
  }
  if (r.status === 'sautée') {
    const e = editionArg !== 'auto' ? L.editionFor(editionArg, now, cfg) : L.editionAt(now, cfg);
    if (!sample && e && !io.refresh) { state[e.key] = { skipped: true, why: r.why, at: new Date(now).toISOString() }; for (const k of Object.keys(state)) if (k < L.addDays(L.mtl(now).ymd, -14)) delete state[k]; fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n'); }
    return;
  }
  if (r.status !== 'publiée') return;
  if (r.model.image && !r.model.image.length) r.model.image.length = await imageLength(r.model.image.url);
  writeOutputs(out, { model: r.model, index, reviews, publish: !sample && cfg.publish, now, cfg });
  summary(`→ ${sample ? path.join(out, r.model.path, 'index.html') : r.model.url} (${r.model.generator})`);
  if (!sample && process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `REVUE_PUBLISHED_ID=${r.model.id}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

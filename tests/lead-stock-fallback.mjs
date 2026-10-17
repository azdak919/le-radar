/**
 * Une qui ne cadre pas → photo libre thématique AVANT le campus — 0 réseau.
 *   · sujets sensibles (violences sexuelles) : sensibilisation seulement
 *   · destination étrangère au titre, rugby, repas gratuits, archives
 *   · licences, cache disque des banques, quota Openverse
 *   · fillClearedLead : campus retiré avant la banque libre
 *   · mapPool : parallèle borné + budget temps (étape CI 6 min)
 * Run: node tests/lead-stock-fallback.mjs
 */
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'lr-stock-'));
const cachePath = join(dir, 'stock-search-cache.json');
process.env.LE_RADAR_STOCK_CACHE = cachePath;
process.env.LE_RADAR_OPENVERSE_MAX = '0';
delete process.env.PEXELS_API_KEY;

const require = createRequire(import.meta.url);
const L = require('../scripts/stock-photo-lib.js');
const { fillClearedLead, mapPool } = require('../scripts/ensure-lead-images.js');

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed += 1; } else console.log('ok:', msg);
}
const score = (item, hit) => L.scoreCandidate(
  { width: 1600, height: 1067, provider: 'wikimedia', license: 'CC BY 4.0', creator: 'Jane Photographer', ...hit },
  L.buildMatchTokens(item),
  L.detectEditorialContext(item),
);

// ── Le Collectif, 16 oct. 2026 : semaine de prévention FEUS ─────────────
const feus = {
  title: 'Une semaine pour sensibiliser aux violences sexuelles à l’UdeS',
  source: 'Le Collectif',
  institution: 'Université de Sherbrooke',
  lang: 'fr',
  excerpt: 'Du 12 au 18 octobre, la Fédération étudiante de l’Université de Sherbrooke (FEUS) tient une semaine de sensibilisation et de prévention des violences sexuelles.',
};
assert(L.hasNamedVisualSubject(feus), 'FEUS : sujet visuel nommé (branche sensibilisation)');
assert(L.detectEditorialContext(feus).sensitiveTopic, 'FEUS : sujet sensible détecté');
assert(L.extractSearchQueries(feus).some((q) => /take back the night|teal ribbon/i.test(q)), 'FEUS : requêtes de sensibilisation (ruban, marche)');
assert(score(feus, { title: 'Take Back the Night march, Montpelier May 2024', url: 'https://upload.wikimedia.org/x/Take_Back_the_Night_march.jpg' }) >= L.STOCK_MIN_RETAIN_SCORE,
  'FEUS : marche Take Back the Night retenue');
assert(score(feus, { title: 'Sexual Assault Awareness 5k Race 120425-M-MT445-065', url: 'https://upload.wikimedia.org/x/a.jpg' }) < 0,
  'FEUS : photo militaire (DoD) refusée');
assert(score(feus, { title: 'Sexual assault victim crying awareness', url: 'https://upload.wikimedia.org/x/b.jpg' }) < 0,
  'FEUS : jamais de victime');
assert(score(feus, { title: 'Ribbon Run for Sexual Assault Awareness', creator: 'U.S. Marine Corps photo by Cpl. X', url: 'https://upload.wikimedia.org/x/c.jpg' }) < 0,
  'FEUS : crédit militaire refusé aussi');
assert(score(feus, { title: 'File:Langar.jpg', url: 'https://upload.wikimedia.org/c/cd/Langar.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo' }) < 0,
  'utm_campaign de Commons ne compte pas comme « campagne »');

// ── Polyscope : « Un polytechnicien en Espagne » ──────────────────────
const spain = {
  title: 'Un polytechnicien en Espagne', source: 'Le Polyscope', institution: 'Polytechnique Montréal', lang: 'fr',
  excerpt: 'Le polytechnicien commun réside principalement dans les alentours du Mont Royal. Habitué malgré lui au froid hivernal du Québec, il prend l’habitude de sacrer.',
};
const spainCtx = L.detectEditorialContext(spain);
assert(!spainCtx.winterTopic, 'Espagne : le « froid hivernal » du corps n’impose pas l’hiver');
assert(L.extractSearchQueries(spain).some((q) => /Madrid|Barcelona|Seville/.test(q)), 'Espagne : requêtes Madrid/Barcelone');
assert(score(spain, { title: 'File:The Royal Palace, Madrid, Spain VII.JPG', url: 'https://upload.wikimedia.org/x/Royal_Palace_Madrid.jpg' }) >= L.STOCK_MIN_RETAIN_SCORE,
  'Espagne : Madrid n’est plus pénalisé comme lieu étranger');

// ── The Link : rugby féminin, brunch solidaire ────────────────────────
const rugby = {
  title: 'The Stingers win the Kelly-Anne Drummond Cup', source: 'The Link', institution: 'Concordia University', lang: 'en',
  excerpt: 'The Concordia University Stingers women’s rugby team defeated the Bishop\'s University Gaiters 76-5 on Oct. 4 at Concordia Stadium.',
};
assert(L.extractSearchQueries(rugby).some((q) => /rugby/i.test(q)), 'rugby : requête rugby');
assert(score(rugby, { title: "File:Canada vs Scotland Women's Rugby World Cup Pool B match.jpg" }) >= L.STOCK_MIN_RETAIN_SCORE, 'rugby : match de rugby féminin retenu');
assert(score(rugby, { title: 'File:Ice hockey team photo.jpg' }) < 0, 'rugby : une photo de hockey est refusée');
const brunch = {
  title: 'Concordia’s Solidarity Brunch goes monthly', source: 'The Link', institution: 'Concordia University', lang: 'en',
  excerpt: 'The demand for free campus meals is growing, but the Concordia Food Coalition says brunches alone won’t fix food insecurity.',
};
assert(L.extractSearchQueries(brunch).some((q) => /breakfast|meal|food/i.test(q)), 'brunch : requêtes repas gratuits');

// ── Garde-fous génériques ─────────────────────────────────────────────
const ql = {
  title: 'La politique commence ici', source: 'Quartier Libre', institution: 'Université de Montréal', lang: 'fr',
  excerpt: 'On entend souvent que les jeunes ne s’intéressent pas à la politique. Notre génération avance avec ambition.',
};
assert(score(ql, { title: 'Heather Smith, Rock the Vote', tags: 'election vote' }) < 0, 'portrait d’une personne nommée absente de l’article refusé');
assert(score(ql, { title: 'Day 36: Baracking the Uber-Youth Vote', tags: 'barackobama election youth vote' }) < 0, 'photo partisane étrangère refusée');
assert(score(ql, { title: 'File:2025 Canadian Election - Student Vote Results.png' }) < 0, 'graphique / carte de résultats refusé');
const covid = { title: 'Reading the static: long COVID and the brain', lang: 'en', excerpt: 'People infected with COVID-19 develop long COVID.' };
assert(!L.topicBranchQueries(covid).some((q) => /cyclist/i.test(q)), '« develop » ne déclenche plus la branche vélo');
const ads = { title: 'Women and Sports Advertisements', lang: 'en', excerpt: 'How brands sell sports to women athletes in advertisements.' };
assert(score(ads, { title: "File:Protecting Women's Sports Event, Richmond.jpg", tags: 'rally protest' }) < 0, 'rassemblement politique refusé hors sujet mobilisation');

// ── Licences ─────────────────────────────────────────────────────────
for (const lic of ['CC0', 'CC BY 4.0', 'CC BY-SA 3.0 es', 'Public domain', 'by', 'by-sa', 'pdm']) {
  assert(L.stockLicenseAllowed({ license: lic, provider: 'wikimedia' }), `licence acceptée : ${lic}`);
}
for (const lic of ['GODL-India', 'CC BY-NC 2.0', 'CC BY-ND 4.0', 'GFDL', '']) {
  assert(!L.stockLicenseAllowed({ license: lic, provider: 'wikimedia' }), `licence refusée : ${lic || '(vide)'}`);
}
assert(L.stockLicenseAllowed({ license: 'Pexels License', provider: 'pexels' }), 'licence Pexels acceptée pour Pexels');
assert(L.formatAttribution({ provider: 'pexels', creator: 'Ana Ruiz', license: 'Pexels License' }) === 'Photo : Ana Ruiz / Licence Pexels · Pexels', 'crédit Pexels');

// ── findStockPhoto hors ligne (cache disque) ──────────────────────────
const queries = L.extractSearchQueries(feus);
const cache = {};
const now = new Date().toISOString();
for (const q of queries) {
  cache[`wikimedia|${q}`] = { at: now, hits: [] };
  cache[`openverse|${q}`] = { at: now, hits: [] };
}
cache['openverse|Take Back the Night march'] = {
  at: now,
  hits: [
    { url: 'https://example.org/teal-ribbon-poster.jpg', width: 1280, height: 1707, creator: 'A', license: 'by', title: 'Teal ribbon sexual assault awareness poster', tags: '', provider: 'openverse', foreignLandingUrl: 'https://example.org/p' },
    { url: 'https://example.org/tbtn.jpg', width: 3600, height: 2400, creator: 'Kenneth C. Zirkel', license: 'by', title: 'Take Back the Night march, Montpelier May 2024', tags: '', provider: 'openverse', foreignLandingUrl: 'https://example.org/tbtn' },
  ],
};
writeFileSync(cachePath, JSON.stringify(cache));
L.resetStockNetworkState();
const found = await L.findStockPhoto(feus);
assert(found?.stockImage === 'https://example.org/tbtn.jpg', 'findStockPhoto : la marche (paysage) gagne, l’affiche en hauteur est écartée');
assert(found?.imageCredit === 'Photo : Kenneth C. Zirkel / CC BY · Openverse', 'findStockPhoto : crédit photographe + licence');
assert(found?.imageLicense === 'by' && found?.imageProvider === 'openverse' && found?.imageSourceUrl === 'https://example.org/tbtn', 'findStockPhoto : licence, banque, source conservées');
assert(L.stockNetworkStats().openverseCalls === 0, 'cache : aucune requête Openverse');

// Quota Openverse épuisé : pas de réseau, pas d'attente.
const t0 = Date.now();
const none = await L.searchOpenverse('query never cached zzz', L.buildMatchTokens(feus));
assert(Array.isArray(none) && none.length === 0 && Date.now() - t0 < 200, 'quota Openverse à 0 : réponse vide immédiate');

// ── fillClearedLead : campus retiré avant la banque libre ──────────────
const item = { title: 'x', image: '', stockImage: 'https://campus/a.jpg', imageProvider: 'campus-bank', imageCredit: 'c' };
const avoid = new Set(['https://campus/a.jpg']);
let sawCampusWhenApplying = null;
const via = await fillClearedLead(item, new Map(), {
  avoidCampusUrls: avoid,
  apply: async (it) => {
    sawCampusWhenApplying = it.stockImage || null;
    Object.assign(it, { stockImage: 'https://stock/tbtn.jpg', imageProvider: 'openverse', imageCredit: 'Photo : K / CC BY · Openverse', imageLicense: 'by', imageSourceUrl: 'https://stock/p' });
    return true;
  },
});
assert(sawCampusWhenApplying === null, 'fillClearedLead : le campus est retiré avant la banque libre');
assert(via === 'stock' && item.imageProvider === 'openverse' && item.imageCredit, 'fillClearedLead : photo libre + crédit posés');
assert(!avoid.has('https://campus/a.jpg'), 'fillClearedLead : photo campus libérée pour un autre article');
const campusOnly = { title: 'y', image: '' };
assert(await fillClearedLead(campusOnly, new Map(), {
  apply: async (it) => { Object.assign(it, { stockImage: 'https://campus/b.jpg', imageProvider: 'campus-bank' }); return true; },
}) === 'campus', 'fillClearedLead : campus seulement à défaut');

// ── mapPool : parallèle borné + budget ─────────────────────────────────
let active = 0; let peak = 0; let done = 0;
await mapPool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
  active += 1; peak = Math.max(peak, active);
  await new Promise((r) => setTimeout(r, 5));
  active -= 1; done += 1;
}, { budget: null });
assert(peak === 4 && done === 20, `mapPool : 4 en parallèle, 20 traités (pic ${peak})`);
let calls = 0;
await mapPool(Array.from({ length: 10 }, (_, i) => i), 2, async () => { calls += 1; }, { budget: () => calls >= 3 });
assert(calls <= 4, `mapPool : arrêt au budget (${calls} appels)`);

// ── Workflow : cache restauré + budget sous le plafond ─────────────────
const wf = readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
assert(/data\/stock-search-cache\.json/.test(wf), 'workflow : cache des banques libres restauré/sauvé');
const step = wf.split('- name: Ensure lead images')[1] || '';
const limit = Number((step.match(/timeout-minutes:\s*(\d+)/) || [])[1]);
assert(limit >= 5, `workflow : plafond CI ${limit} min ≥ budget interne 4 min + marge`);

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nlead-stock-fallback : tout est vert');

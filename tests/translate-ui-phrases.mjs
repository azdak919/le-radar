#!/usr/bin/env node
/**
 * D22 — glossaire chrome sports/radio. Fixtures sans réseau.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'translate.js'), 'utf8');
const cta = readFileSync(join(root, 'radar-sports-cta.js'), 'utf8');
const menuCss = readFileSync(join(root, 'translate-menu.css'), 'utf8');
const feedCss = readFileSync(join(root, 'style-feed.css'), 'utf8');

assert.match(src, /radar-translate-cache-v11/, 'cache v11 (invalide poison DISTINCT LANGUAGES)');
assert.match(src, /radar-translate-cache-v10/, 'v10 listé en LEGACY_KEYS (purge poison)');
assert.match(src, /PLEASE SELECT TWO DISTINCT LANGUAGES/, 'poubelle MyMemory sl===tl');
assert.match(src, /function sameMtLang/, 'ne pas appeler gtx/MyMemory sl===tl');
assert.match(src, /!sameMtLang\('fr', mm\)/, 'MyMemory : skip fr|fr');
assert.match(src, /function pruneTranslationCache/, 'purge cache hors fil frais');
assert.match(src, /function rememberNewsCorpus/, 'corpus news pour garder seulement le fil vivant');
assert.match(src, /CACHE_MAX = 4000/, 'plafond cache 4000 (filet quota)');
assert.match(src, /const CONCURRENCY = 6/, 'CONCURRENCY reste 6 (plafond gtx par hôte)');
assert.match(src, /const MAX_CHUNK = 450/, 'MAX_CHUNK reste 450 (ordre IU)');
assert.match(src, /chromeOnly/, 'passage chrome avant le fil');
assert.match(src, /CHROME_SELECTOR/, 'sélecteur chrome');
assert.match(src, /UI_LOCK_NO_MT/, 'filet anti-MT sur match / reçoit');
assert.doesNotMatch(src, /UI_LOCK_NO_MT[\s\S]{0,220}'ce PM'/, 'ce PM n’est plus locké (IU / EN this PM)');
assert.match(src, /const inflight = new Map/, 'dédup requêtes en vol');
assert.match(src, /function cacheGet/, 'LRU cacheGet');
assert.match(src, /translate-progress/, 'overlay de progression des articles');
assert.doesNotMatch(
  src,
  /querySelector\?\.?\(['"]\.translate-control['"]\)\s*\)\s*continue/,
  'overlay : sélecteur de langue sous le voile (inerte)',
);
assert.match(src, /SHOW_DELAY_MS:\s*350/, 'overlay : délai 350 ms (cache hit silencieux)');
assert.match(
  src,
  /startArticlesOverlaySession\(gen\)[\s\S]{0,800}chromeOnly:\s*true/,
  'overlay : timer dès le lancement, pas après le chrome',
);
assert.match(src, /function translateOverlayCopyFirst/, 'libellés overlay traduits en premier');
assert.match(src, /HOLD_AT_100_MS/, 'overlay : tenir 100 % avant le fondu');
assert.match(src, /band:\s*\[80,\s*94\]/, '2e passage articles : 80–94 %, pas de plateau');
assert.match(
  src,
  /await translateOverlayCopyFirst\(target, gen\)[\s\S]{0,500}chromeOnly:\s*true/,
  'skip / paliers overlay avant le chrome et les articles',
);
assert.match(src, /Afficher les articles dans leur langue originale/, 'lien skip : ramène à Original');
assert.match(src, /skipArticlesOverlay\(\) \{\s*applyMode\(DEFAULT_MODE/, 'skip overlay → mode Original');
assert.match(src, /timeoutMs:\s*6000/, 'MT : timeout 6 s (persan ne doit pas pendre)');
assert.match(src, /function isJunkMt/, 'MT : refuser Sorry / quota MyMemory');
assert.match(src, /clients5\.google\.com\/translate_a\/t\?client=dict-chrome-ex/, 'MT : repli dict-chrome-ex');
assert.match(src, /le-radar-translate\.azdak\.workers\.dev/, 'MT : worker cache partagé (modèle météo)');
assert.doesNotMatch(src, /OVERLAY_BEATS_FR/, 'overlay : plus de beats intercalaires');
assert.doesNotMatch(src, /translate-progress__spark/, 'overlay : plus d’étoile Claude-style');
assert.doesNotMatch(
  menuCss,
  /data-translate-busy[\s\S]{0,80}pointer-events:\s*none/,
  'menu : toggle cliquable pendant busy',
);
assert.doesNotMatch(
  feedCss,
  /data-translate-busy[\s\S]{0,80}pointer-events:\s*none/,
  'fil : toggle cliquable pendant busy',
);
assert.match(src, /langpair=fr\|/, 'MyMemory : fr|cible, pas auto|');
assert.match(src, /sources = \['fr', 'auto', 'en'\]/, 'gtx : fr puis auto puis en (sonde IU)');
assert.match(src, /fa: 'آماده‌سازی زبان…'/, 'overlay persan : préparation');
assert.match(src, /fa: 'نمایش مقاله‌ها به زبان اصلی'/, 'overlay persan : skip (langue originale)');
assert.match(src, /function gtxTargetCodes/, 'alias gtx pour tout le menu, pas seulement fa');
assert.match(src, /function mymemoryLang/, 'MyMemory : iw→he, fa-IR→fa');
assert.match(src, /fa: \['fa', 'fa-IR'\]/, 'gtx persan : fa puis fa-IR');
assert.match(src, /iw: \['iw', 'he'\]/, 'gtx hébreu : iw puis he');
assert.match(src, /'zh-CN': \['zh-CN', 'zh'\]/, 'gtx chinois simplifié');
assert.match(src, /tl: \['tl', 'fil'\]/, 'gtx tagalog / filipino');
assert.match(src, /preferredUiPhrase\(OVERLAY_COPY_FR\[key\], 'en'\)/, 'overlay : EN seulement après échec MT');
assert.match(src, /ike-Latn/, 'gtx IU latin : ike-Latn');
assert.doesNotMatch(
  src,
  /cacheSet\(key, joined\);\s*return joined/,
  'textes longs : ne pas cacher un écho FR',
);
assert.doesNotMatch(src, /\.showModal\s*\(/, 'pas de dialog.showModal (tuner inert)');
assert.doesNotMatch(
  src,
  /body\.style\.position\s*=\s*['"]fixed['"]/,
  'pas de position:fixed sur body',
);

const phrases = [
  'Prochains match',
  'Prochain match',
  'En direct',
  'En cours',
  'Demain',
  'Dernière heure',
  'cet AM',
  'ce PM',
  'AM',
  'PM',
  'Hier',
  'Avant-hier',
  "Rien de programmé pour aujourd'hui",
  'reçoit',
  'chez',
];
for (const phrase of phrases) {
  assert(
    src.includes(`'${phrase}'`) || src.includes(`"${phrase}"`) || src.includes(`${phrase}:`),
    `glossaire UI : ${phrase}`,
  );
}
assert.match(src, /\bmatch:\s*\{/, 'glossaire : nœud isolé « match »');
assert.match(src, /en: 'Next games'/, 'Prochains match → Next games (pas correspondre)');
assert.match(src, /en: 'Breaking news'/, 'Dernière heure → Breaking news');
assert.match(src, /en: 'game'/, 'match → game, pas verbe to match');
assert.match(src, /en: 'hosts'/, 'reçoit → hosts');
assert.match(src, /en: 'at'/, 'chez → at');
assert.match(
  src,
  /en: 'Nothing scheduled for today'/,
  'creux UP NEXT → Nothing scheduled for today',
);
assert.doesNotMatch(
  src,
  /en:\s*'correspondre'|fr:\s*'correspondre'/,
  'aucune traduction glossaire vers correspondre',
);

assert.match(cta, /function fillSportsCtaTagCopy/, 'pastille CTA');
assert.match(cta, /markNoTranslate\(tag\)/, 'pastille toujours notranslate');
assert.doesNotMatch(
  cta,
  /tag\.classList\.remove\('sports-chip__cta-tag--brand', 'notranslate'\)/,
  'ne plus retirer notranslate hors idle',
);
assert.match(cta, /data-vs-orig/, 'verbe reçoit/chez : original FR pour le glossaire');
assert.match(cta, /radar:translate-mode/, 'rejouer le chrome à la langue');

console.log('OK translate-ui-phrases (D22 glossaire + pastille + chrome-first)');

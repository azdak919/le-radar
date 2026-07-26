#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);

const root = new URL('../', import.meta.url).pathname;
const htmlFiles = [];

// Les traces Playwright sont du HTML : sans cette exclusion, un run de tests
// interrompu laisse des artefacts qui font échouer `npm run check` alors que
// le site est intact (ces dossiers sont déjà dans .gitignore).
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);

function collectHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(fullPath);
    else if (entry.name.endsWith('.html')) htmlFiles.push(fullPath);
  }
}

function isLocalReference(value) {
  return value
    && !value.startsWith('#')
    && !value.startsWith('//')
    && !value.includes('${')
    && !/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|about:)/i.test(value);
}

collectHtml(root);

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  assert(/<html\b[^>]*\blang=/i.test(html), `${relative(root, file)}: attribut lang requis`);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    const raw = match[1].split(/[?#]/, 1)[0];
    if (!isLocalReference(raw) || raw === '/') continue;
    const target = resolve(dirname(file), raw);
    assert(existsSync(target), `${relative(root, file)}: ressource locale introuvable ${raw}`);
  }
}

function assertServiceWorkerAssets(file, arrayName) {
  const source = readFileSync(file, 'utf8');
  const array = source.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\n\\];`));
  assert(array, `${relative(root, file)}: tableau ${arrayName} introuvable`);
  for (const match of array[1].matchAll(/["'](\.\.?\/[^"']+)["']/g)) {
    const target = resolve(dirname(file), match[1]);
    assert(existsSync(target), `${relative(root, file)}: asset SW introuvable ${match[1]}`);
  }
}

assertServiceWorkerAssets(join(root, 'sw.js'), 'APP_SHELL');
assertServiceWorkerAssets(join(root, 'pomo/sw.js'), 'SHELL_ASSETS');
assertServiceWorkerAssets(join(root, 'solitaire/sw.js'), 'SHELL_ASSETS');

const rootSw = readFileSync(join(root, 'sw.js'), 'utf8');
const pomoSw = readFileSync(join(root, 'pomo/sw.js'), 'utf8');
const solitaireSw = readFileSync(join(root, 'solitaire/sw.js'), 'utf8');
assert(rootSw.includes('const CACHE_PREFIX = "radar-"'), 'préfixe cache racine isolé requis');
assert(pomoSw.includes("const CACHE_PREFIX = 'pomo-'"), 'préfixe cache Pomodoro isolé requis');
assert(solitaireSw.includes("const CACHE_PREFIX = 'solitaire-'"), 'préfixe cache Solitaire isolé requis');

const backgroundsData = readFileSync(join(root, 'pomo/js/backgrounds-data.js'), 'utf8');
for (const title of ['Palm Sunset', 'Tropical Beach', 'Tropical Waterfall', 'Tropical Paradise', 'Seaside Cliffs', 'Snowy Branch']) {
  assert(!backgroundsData.includes(`title: "${title}"`), `fond hors ligne éditoriale interdit: ${title}`);
}

// QC plein écran (pomo + solitaire) — macros / Snowy Branch hard-ban
const fsQc = readFileSync(join(root, 'fullscreen-wallpaper-qc.js'), 'utf8');
assert(fsQc.includes('FullscreenWallpaperQc'), 'module QC wallpapers plein écran requis');
assert(fsQc.includes('1457269449834-928af64c684d'), 'hard-ban Snowy Branch (Aaron Burden) requis');

// Fonds campus : Casault ULaval hard-ban + détection religieuse multi-tours
const bgBlacklist = require('../scripts/quebec-backgrounds-blacklist.js');
assert(
  bgBlacklist.matchHardBanned({ id: 'd80fc225abc1' })?.reason === 'reads_as_church_casault',
  'hard-ban Casault id d80fc225abc1 requis',
);
assert(
  bgBlacklist.allFragments().some((f) => /casault|Canada_3/i.test(f)),
  'fragments hard-ban Casault / Canada_3 requis',
);
const bgJsRelig = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJsRelig.includes('casault'), 'mât RELIGIOUS_SUBJECT_RE : casault');
assert(bgJsRelig.includes('solidStone'), 'détecteur visuel pierre grise (Casault)');
assert(bgJsRelig.includes('multiPeaks'), 'détecteur multi-tours / flèches');
const uniData = readFileSync(join(root, 'quebec-university-backgrounds-data.js'), 'utf8');
assert(!/Quebec_Canada_3\.jpg/i.test(uniData), 'banque universities sans Casault Canada_3');
assert(
  /Park_in_Universit|Ferdinand-Vandry/i.test(uniData),
  'banque universities : remplacement ULaval (parc ou Vandry)',
);
const solitaireHtml = readFileSync(join(root, 'solitaire/index.html'), 'utf8');
assert(!solitaireHtml.includes('title: "Snowy Branch"'), 'solitaire: Snowy Branch retiré du pool');
assert(solitaireHtml.includes('fullscreen-wallpaper-qc.js'), 'solitaire charge le QC plein écran');
const pomoHtml = readFileSync(join(root, 'pomo/index.html'), 'utf8');
assert(pomoHtml.includes('fullscreen-wallpaper-qc.js'), 'pomo charge le QC plein écran');
assert(pomoSw.includes('fullscreen-wallpaper-qc.js'), 'pomo SW pré-cache le QC plein écran');
assert(solitaireSw.includes('fullscreen-wallpaper-qc.js'), 'solitaire SW pré-cache le QC plein écran');

// Crédits Commons : pas de gabarit « machine-readable author » en banque
const commonsCredit = require('../scripts/commons-credit-lib.js');
assert(commonsCredit?.sanitizeCommonsCredit, 'commons-credit-lib requis');
assert(
  commonsCredit.sanitizeCommonsCredit(
    'No machine-readable author provided. Miguel Andrade assumed (based on copyright claims).'
  ) === 'Miguel Andrade',
  'sanitize Commons credit → nom court'
);
for (const rel of [
  'quebec-backgrounds-data.js',
  'quebec-nations-backgrounds-data.js',
  'quebec-university-backgrounds-data.js',
  'quebec-pomo-backgrounds-data.js',
]) {
  const txt = readFileSync(join(root, rel), 'utf8');
  assert(
    !/No machine-readable author provided/i.test(txt),
    `${rel}: crédit Commons machine-readable interdit`
  );
}
const bgJs = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJs.includes('sanitizeBgCredit'), 'mât : sanitize crédit runtime requis');

for (const app of ['pomo', 'solitaire']) {
  const html = readFileSync(join(root, app, 'index.html'), 'utf8');
  assert(/id=["']radar-embed["']/.test(html), `${app}: iframe Le Radar requis`);
  assert(/src=["']\.\.\/tuner-embed\.html["']/.test(html), `${app}: source iframe Le Radar invalide`);
  assert(/allow=["'][^"']*autoplay/.test(html), `${app}: permission autoplay iframe requise`);
}

const embedScript = readFileSync(join(root, 'embed.js'), 'utf8');
assert(embedScript.includes("type: 'radar-embed'"), 'contrat postMessage radar-embed requis');
assert(embedScript.includes("type: 'ataraxia-radar-embed'"), 'contrat postMessage historique requis');

// ── Référencement (moteurs + assistants IA) ────────────────────────────────
// Ces acquis sont invisibles à l'œil : sans test, une refonte du <head> ou de
// #news-list peut les supprimer sans que personne ne le remarque pendant des
// mois. Voir scripts/generate-seo.js.
for (const rel of ['robots.txt', 'sitemap.xml', 'llms.txt', 'assets/og-cover.png']) {
  assert(existsSync(join(root, rel)), `${rel} requis pour le référencement`);
}

const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
assert(/^Sitemap:\s*https:\/\/le-radar\.ca\/sitemap\.xml$/m.test(robots), 'robots.txt : directive Sitemap requise');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
  assert(new RegExp(`^User-agent:\\s*${bot}$`, 'm').test(robots), `robots.txt : ${bot} doit être listé`);
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
for (const marker of [
  '<!-- RADAR:SEO:JSONLD:START -->', '<!-- RADAR:SEO:JSONLD:END -->',
  '<!-- RADAR:SEO:FEED:START -->', '<!-- RADAR:SEO:FEED:END -->',
]) {
  assert(indexHtml.includes(marker), `index.html : marqueur ${marker} requis (generate-seo.js)`);
}
// Le prérendu est la seule chose que voient les robots qui n'exécutent pas JS.
assert(
  /RADAR:SEO:FEED:START -->[\s\S]*?<h3 class="article-title">[\s\S]*?<!-- RADAR:SEO:FEED:END/.test(indexHtml),
  'index.html : le fil prérendu est vide — lancer `npm run seo:update`'
);

// Une seule <h1> par page, et un canonical sur les pages publiques.
for (const rel of ['index.html', 'feeds.html', 'pomo/index.html', 'solitaire/index.html']) {
  const html = readFileSync(join(root, rel), 'utf8');
  // Hors commentaires : un commentaire qui mentionne <h1> n'est pas une <h1>.
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  const h1Count = (markup.match(/<h1\b/gi) || []).length;
  assert(h1Count <= 1, `${rel}: une seule <h1> autorisée (trouvé ${h1Count})`);
  assert(/<link rel="canonical"/i.test(html), `${rel}: <link rel="canonical"> requis`);
  // Titre « effectif » pour les moteurs : og:title s'il existe, sinon <title>.
  // Pomo garde volontairement un <title> court (libellé de favori réimposé en
  // JS) et porte son intitulé descriptif dans og:title.
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const title = html.match(/<title>([^<]*)<\/title>/i);
  const effective = (ogTitle?.[1] || title?.[1] || '').trim();
  assert(effective.length >= 15, `${rel}: titre trop court pour le référencement ("${effective}")`);
}
assert(/<h1 class="wordmark-mark">/.test(indexHtml), 'index.html : la <h1> du mât est requise');

// Nomenclature de marque dans les surfaces vues par les moteurs et les IA.
// Seul « le-radar.ca » est un domaine acquis : « leradar.ca » ne l'est pas, donc
// la forme sans trait d'union ne doit jamais être ce qu'un moteur indexe.
// Sensible à la casse, volontairement : seules les formes capitalisées
// « LE RADAR » et « Le Radar » sont des usages de marque. CISM diffuse une
// émission intitulée « Le radar » — c'est du contenu légitime venu de la
// grille horaire de la station, pas une faute de nomenclature.
const BARE_BRAND = /\b(?:LE RADAR|Le Radar)\b/;
for (const rel of ['index.html', 'feeds.html', 'pomo/index.html', 'solitaire/index.html']) {
  const html = readFileSync(join(root, rel), 'utf8');
  const surfaces = [
    ...[...html.matchAll(/<title>([^<]*)<\/title>/gi)].map((m) => [`<title>`, m[1]]),
    ...[...html.matchAll(/<meta\s+(?:property|name)=["'](og:title|og:site_name|og:image:alt|og:description|twitter:title|twitter:description|description)["']\s+content=["']([^"']*)["']/gi)]
      .map((m) => [m[1], m[2]]),
  ];
  for (const [where, value] of surfaces) {
    assert(
      !BARE_BRAND.test(value),
      `${rel} → ${where} : écrire « LE-RADAR.ca » (avec trait d'union), pas « ${value.match(BARE_BRAND)?.[0]} »`
    );
  }
}
for (const rel of ['robots.txt', 'llms.txt']) {
  const txt = readFileSync(join(root, rel), 'utf8');
  assert(!BARE_BRAND.test(txt), `${rel} : écrire « LE-RADAR.ca », jamais la forme sans trait d'union`);
}

// ── Pages d'entités générées (scripts/seo-pages.js) ────────────────────────
const GENERATED_ROOTS = ['radios', 'journaux', 'etablissements', 'medias', 'horaires', 'en'];
const generatedPages = htmlFiles.filter((f) => {
  const rel = relative(root, f);
  return GENERATED_ROOTS.some((dir) => rel === `${dir}/index.html` || rel.startsWith(`${dir}/`));
});

assert(generatedPages.length >= 40, `pages d'entités absentes ou incomplètes (${generatedPages.length}) — lancer \`npm run seo:update\``);

const seenCanonicals = new Set();
for (const file of generatedPages) {
  const rel = relative(root, file);
  const html = readFileSync(file, 'utf8');
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');

  assert((markup.match(/<h1\b/gi) || []).length === 1, `${rel}: exactement une <h1> attendue`);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i);
  assert(canonical, `${rel}: <link rel="canonical"> requis`);
  // Deux pages qui se déclarent canoniques sur la même URL se cannibalisent.
  assert(!seenCanonicals.has(canonical[1]), `${rel}: canonical en double → ${canonical[1]}`);
  seenCanonicals.add(canonical[1]);

  // hreflang réciproques : fr-CA, en-CA et x-default sur chaque page.
  for (const tag of ['fr-CA', 'en-CA', 'x-default']) {
    assert(
      new RegExp(`<link rel="alternate" hreflang="${tag}"`, 'i').test(html),
      `${rel}: hreflang ${tag} requis`
    );
  }
  // x-default doit pointer vers le français, jamais vers /en/.
  const xdef = html.match(/<link rel="alternate" hreflang="x-default" href="([^"]+)"/i);
  assert(xdef && !xdef[1].includes('/en/'), `${rel}: x-default doit pointer vers la version française`);

  assert(/application\/ld\+json/.test(html), `${rel}: données structurées requises`);
  assert(!BARE_BRAND.test(markup), `${rel}: écrire « LE-RADAR.ca », pas la forme sans trait d'union`);
  // Contraction française : « de Université » trahit un frOf() oublié.
  assert(
    !/\bde Université|\bde Cégep|\bà Université/i.test(markup),
    `${rel}: contraction française manquante (« de l’Université », « du Cégep »)`
  );
}
/*
 * Hub des horaires : les grilles complètes ne servent à rien si rien n'y mène.
 * Une page générée sans lien entrant est mal explorée, quoi qu'en dise le
 * sitemap — d'où le lien de pied de page, testé ici comme les autres.
 */
for (const hub of ['horaires/index.html', 'en/schedules/index.html']) {
  assert(existsSync(join(root, hub)), `${hub} manquant — lancer \`npm run seo:update\``);
}
assert(
  /<a href="horaires\/">/.test(indexHtml),
  'index.html : lien de pied de page vers /horaires/ requis (page autrement orpheline)'
);

// Les fiches station portent l'ancre visée par « À l'antenne » (app.js).
const ckutPage = readFileSync(join(root, 'radios/ckut/index.html'), 'utf8');
assert(
  /<section class="seo-section" id="horaire">/.test(ckutPage),
  'radios/ckut/index.html : ancre #horaire requise (cible de nowAirSchedulePath)'
);
// La grille n'est plus tronquée : CKUT compte une centaine de créneaux.
assert(
  (ckutPage.match(/<li><time|<li[^>]*><time/g) || []).length >= 60,
  'radios/ckut/index.html : grille hebdomadaire tronquée — scheduleTable ne doit plus couper à 8 créneaux/jour'
);
// Ordre lundi → dimanche : sur cinq colonnes, la semaine occupe la première
// rangée et le week-end la seconde. L'ordre 0-6 des données couperait samedi
// et dimanche de part et d'autre du retour à la ligne.
const ckutDays = [...ckutPage.matchAll(/<div class="seo-day[^"]*">\s*<h3>([^<]+)<\/h3>/g)]
  .map((m) => m[1]);
assert.deepEqual(
  ckutDays,
  ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
  `radios/ckut/index.html : ordre des jours attendu lundi→dimanche, obtenu ${ckutDays.join(', ')}`
);

// La <h1> hérite sinon de la marge par défaut du navigateur → mât décadré.
const styleCss = readFileSync(join(root, 'style.css'), 'utf8');
assert(
  /\.wordmark-mark \{[^}]*margin: 0;/.test(styleCss),
  'style.css : .wordmark-mark doit neutraliser la marge (<h1>)'
);

console.log(`OK intégrité statique (${htmlFiles.length} pages HTML)`);

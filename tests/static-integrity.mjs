#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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

  // Le footer partagé doit rester identique à la référence visuelle : pas de
  // lien GitHub ajouté par erreur, ni de pictogramme courriel emoji.
  // D18 : structure minimale commune (logo, contact, signature) sur toute
  // page publique hors pomo/solitaire.
  if (html.includes('class="site-foot"')) {
    const rel = relative(root, file);
    assert(!html.includes('Code source (GitHub)'), `${rel}: lien GitHub absent du footer requis`);
    assert(!html.includes('>✉️</a>'), `${rel}: emoji courriel interdit dans le footer`);
    assert(!html.includes('site-foot__author-mail'), `${rel}: icône courriel interdite dans le footer`);
    assert(/class="site-foot__logo"/.test(html), `${rel}: logo footer requis`);
    assert(/class="site-foot__contact"/.test(html), `${rel}: ligne de contact footer requise`);
    assert(/data-contact-channel="email"/.test(html), `${rel}: point d’entrée contact requis`);
    assert(!html.includes('>azdak-qc@proton.me</a>'), `${rel}: adresse courriel non affichée requise`);
    assert(/LE-RADAR/.test(html), `${rel}: marque LE-RADAR requise dans le chrome partagé`);
    // Structure générée par renderSiteFooter (seo-pages-lib)
    assert(
      /site-foot__inner|site-foot__brand|site-foot__logo/.test(html),
      `${rel}: structure footer partagée (inner/brand/logo) requise`,
    );
  }
}

// Crédit photo du mât : jamais de safe-area sur son `bottom`. Il est en
// position absolue DANS le mât, dont le bas tombe au milieu du document — pas
// contre le bord de l'écran. Avec l'inset, un iPhone à barre d'accueil le
// remontait de ~34 px dans le slogan, et il se déplaçait au défilement quand
// la barre d'adresse se repliait. L'inset droit reste légitime : le mât est
// pleine largeur.
{
  const mastheadCss = readFileSync(join(root, 'style-masthead.css'), 'utf8');
  for (const block of mastheadCss.match(/\.bg-photo-credit\s*\{[^}]*\}/g) || []) {
    const bottom = block.match(/(^|[;{])\s*bottom\s*:([^;}]*)/);
    if (!bottom) continue;
    assert(
      !/env\(\s*safe-area-inset-bottom/.test(bottom[2]),
      'style-masthead : `bottom` du crédit photo sans safe-area (il est ancré au mât, pas à l’écran)',
    );
  }
  // Météo dockée (≤1023.98 px) : hors de .masthead, le lavis --weather-tone
  // doit rester (sinon cartes grises neutres sans teinte soleil/pluie).
  const mastFlat = mastheadCss.replace(/\s+/g, ' ');
  assert(
    /\.masthead-weather--docked \.masthead-weather__city\s*\{[^}]*--weather-tone/.test(mastFlat)
      && /data-weather-tone="sun"/.test(mastheadCss)
      && /\.masthead-weather__city\s*\{[^}]*--weather-tone/.test(mastFlat),
    'style-masthead : lavis --weather-tone sur cartes base + dockées (pas seulement mât photo)',
  );
}

// « Lire la suite » : même position dans toute la colonne. La suite du fil le
// posait en ligne à gauche là où « En bref » et les vedettes le mettent en
// bas-droite ; l'écart sautait aux yeux d'une carte à l'autre.
{
  // `styleCss` n'est lu que plus bas dans ce fichier : on relit ici.
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const tailRules = css.match(/\.news-tail[^{]*\.article-more\s*\{[^}]*\}/g) || [];
  assert(tailRules.length > 0, 'style : règle « Lire la suite » de la suite du fil introuvable');
  for (const rule of tailRules) {
    if (rule.includes(':hover') || rule.includes(':focus')) continue;
    assert(
      !/text-align\s*:\s*start/.test(rule),
      'style : « Lire la suite » de la suite du fil aligné à droite comme « En bref »',
    );
  }
}

// Menu de sections de l'accueil : Accueil en tête, puis mêmes cibles que le
// pied (archives exceptées). Listes issues de `SECTIONS` dans seo-pages-lib.
{
  const home = readFileSync(join(root, 'index.html'), 'utf8');
  const navBlock = home.slice(
    home.indexOf('<!-- RADAR:CHROME:SECTIONS:START -->'),
    home.indexOf('<!-- RADAR:CHROME:SECTIONS:END -->'),
  );
  assert(navBlock.includes('class="site-sections"'), 'index.html : menu de sections requis sous la barre des scores');

  const hrefsIn = (block) => [...block.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  const navHrefs = hrefsIn(navBlock);
  assert.deepEqual(
    navHrefs,
    ['./', 'medias/', 'medias/#journaux', 'horaires/', 'sports/'],
    'index.html : sections = Accueil, Médias, Journaux, Radios, Sports (sans Archives)',
  );
  assert(
    /data-home-nav[^>]*>Accueil</.test(navBlock) || /data-home-nav[\s\S]*?>Accueil</.test(navBlock),
    'index.html : lien Accueil avec data-home-nav (scroll + refresh soft)',
  );
  assert(navBlock.includes('>Accueil</a>'), 'index.html : libellé Accueil dans le menu de sections');

  const footBlock = home.slice(
    home.indexOf('<!-- RADAR:FOOTER:START -->'),
    home.indexOf('<!-- RADAR:FOOTER:END -->'),
  );
  // Accueil (./) est aussi dans le pied : même liste que le menu de sections
  // (sauf archives, footerOnly). Les bots seo:update réinjectent ce pied —
  // le générateur doit donc garder Accueil, sinon le prepush des agrégats casse.
  for (const href of navHrefs) {
    assert(
      footBlock.includes(`href="${href}"`),
      `index.html : « ${href} » est dans le menu de sections mais absent du pied de page`,
    );
  }
  // Accueil en tête du pied de page, avant Médias.
  const footAccueil = footBlock.indexOf('>Accueil<');
  const footMedias = footBlock.indexOf('>Médias<');
  assert(footAccueil !== -1 && footMedias !== -1 && footAccueil < footMedias,
    'index.html : Accueil à gauche de Médias dans le pied de page');
  assert(
    footBlock.includes('data-home-nav'),
    'index.html : pied de page Accueil avec data-home-nav',
  );
  // Les archives restent au pied de page seul (catalogue expérimental, D19).
  assert(footBlock.includes('href="archives/"'), 'index.html : archives requises au pied de page');
  assert(!navBlock.includes('archives/'), 'index.html : archives hors du menu de sections');
}

// Accueil : pas de reload plein écran (préserve la radio) — refresh soft.
{
  const appJs = readFileSync(join(root, 'app.js'), 'utf8');
  assert(
    appJs.includes('function initHomeNavRefresh')
      && appJs.includes('data-home-nav')
      && appJs.includes("loadNews({ silent: true })"),
    'app.js : Accueil → scroll + loadNews silent (sans couper la radio)',
  );
  assert(
    appJs.includes('initHomeNavRefresh()'),
    'app.js : initHomeNavRefresh branché au démarrage',
  );
}

// offline.html ne charge pas style.css — c'est voulu : la page doit s'afficher
// quand le réseau est tombé. Elle redéclare donc les règles du pied de page
// partagé en ligne. Cette copie assumée avait déjà dérivé : `.site-foot__logo`
// y manquait, et le logo s'affichait à 24 px sans marge, seul cas du site.
// Ce contrôle exige que toute classe `site-foot__*` posée par le générateur
// dans offline.html soit effectivement stylée sur place.
{
  const offlineHtml = readFileSync(join(root, 'offline.html'), 'utf8');
  const footerMarkup = offlineHtml.slice(
    offlineHtml.indexOf('<!-- RADAR:FOOTER:START -->'),
    offlineHtml.indexOf('<!-- RADAR:FOOTER:END -->'),
  );
  // Ces deux-là n'ont de règle nulle part sur le site : ils héritent de
  // `.site-foot a`. Les exiger ici serait plus strict que la référence.
  const INHERITED = new Set(['site-foot__heart', 'site-foot__author-link']);
  const used = new Set();
  for (const attr of footerMarkup.matchAll(/class="([^"]+)"/g)) {
    for (const cls of attr[1].split(/\s+/)) {
      if (cls.startsWith('site-foot__') && !INHERITED.has(cls)) used.add(cls);
    }
  }
  const inlineCss = offlineHtml.slice(0, offlineHtml.indexOf('<!-- RADAR:FOOTER:START -->'));
  for (const cls of used) {
    assert(
      inlineCss.includes(`.${cls}`),
      `offline.html : « .${cls} » posée par le pied de page partagé mais non stylée sur place`,
    );
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

// Fonds campus : Casault / pavillons = exception au détecteur d’église
const facadeLib = require('../scripts/religious-facade-lib.js');
assert(
  !facadeLib.RELIGIOUS_SUBJECT_RE.test('Pavillon Louis-Jacques-Casault'),
  'Casault n’est pas un mot de culte',
);
assert(
  facadeLib.isCampusBuildingException({
    title: 'Pavillon Louis-Jacques-Casault Université Laval',
    campus: true,
  }),
  'Casault campus excepté',
);
const bgJsRelig = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJsRelig.includes('isCampusBuildingException'), 'mât : exception pavillons campus');
assert(bgJsRelig.includes('CAMPUS_BUILDING_EXCEPTION_RE'), 'mât : regex pavillons campus');
assert(bgJsRelig.includes('solidStone'), 'détecteur visuel pierre grise (clochers inconnus)');
assert(bgJsRelig.includes('multiPeaks'), 'détecteur multi-tours / flèches');
const uniData = readFileSync(join(root, 'quebec-university-backgrounds-data.js'), 'utf8');
const photoBankJson = readFileSync(join(root, 'data/photo-bank.json'), 'utf8');
assert(
  /Pavillon_Louis-Jacques-Casault_3/i.test(photoBankJson),
  'banque unique : Pavillon Casault',
);
assert(
  !/Pavillon_Adrien-Pouliot_0[789]\.jpg/i.test(photoBankJson),
  'Pouliot 07/08/09 restent les rejets labo',
);
assert(
  /Park_in_Universit|Ferdinand-Vandry/i.test(uniData),
  'banque universities : remplacement ULaval (parc ou Vandry)',
);
const solitaireHtml = readFileSync(join(root, 'solitaire/index.html'), 'utf8');
const solitaireBg = readFileSync(join(root, 'solitaire/js/backgrounds-data.js'), 'utf8');
assert(!solitaireHtml.includes('title: "Snowy Branch"'), 'solitaire: Snowy Branch retiré du pool');
assert(!solitaireBg.includes('title: "Snowy Branch"'), 'solitaire stock: Snowy Branch retiré');
assert(solitaireHtml.includes('js/backgrounds-data.js'), 'solitaire charge le stock extrait');
assert(solitaireHtml.includes('quebec-favorites-backgrounds-data.js'), 'solitaire peut fusionner les favorites');
assert(solitaireHtml.includes('fullscreen-wallpaper-qc.js'), 'solitaire charge le QC plein écran');
const pomoHtml = readFileSync(join(root, 'pomo/index.html'), 'utf8');
assert(pomoHtml.includes('fullscreen-wallpaper-qc.js'), 'pomo charge le QC plein écran');
assert(pomoSw.includes('fullscreen-wallpaper-qc.js'), 'pomo SW pré-cache le QC plein écran');
assert(solitaireSw.includes('fullscreen-wallpaper-qc.js'), 'solitaire SW pré-cache le QC plein écran');

// Crédits Commons : pas de gabarit « machine-readable author » en banque
const commonsCredit = require('../scripts/commons-credit-lib.js');
assert(commonsCredit?.sanitizeCommonsCredit, 'commons-credit-lib requis');
const sc = commonsCredit.sanitizeCommonsCredit;
assert(
  sc(
    'No machine-readable author provided. Miguel Andrade assumed (based on copyright claims).'
  ) === 'Miguel Andrade',
  'sanitize Commons credit → nom court'
);
assert(
  commonsCredit.sanitizeCommonsCredit('Andrea Schaffer from Sydney, Australia') === 'Andrea Schaffer',
  'sanitize : retirer l’origine de l’auteur (from Sydney…)',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Andrea Schaffer from Sydney, Australia',
    title: 'Cap Bon-Ami, Forillon National Park (7612987688)',
  }).label === 'Andrea Schaffer — Forillon',
  'crédit mât : nom + lieu de la photo',
);
assert(
  commonsCredit.sanitizeCommonsCredit(
    'MontrealNasa.jpg : NASA derivative work: MTLskyline',
  ) === 'NASA',
  'sanitize : fichier Commons + derivative work → NASA',
);
assert(
  commonsCredit.sanitizeCommonsCredit('NASA / Denis Sarrazin') ===
    'NASA / Denis Sarrazin',
  'sanitize : ne pas écraser NASA / photographe',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Ed7789',
    title: 'Île-Perrot train station (exo)',
  }).label === 'Ed7789 — Île-Perrot',
  'crédit mât : Île-Perrot (sans \\b ASCII)',
);
assert(sc('Sam311 ( talk ) ( Uploads )') === 'Sam311', 'strip ( talk ) ( Uploads )');
assert(sc('DannysFlamand') === 'Dannys Flamand', 'camelCase collé');
assert(sc('Jeangagnon') === 'Jean Gagnon', 'alias Jeangagnon');
assert(sc('Danielhbordeleau') === 'Daniel H. Bordeleau', 'alias Danielhbordeleau');
assert(
  sc('You may select the license of your choice.') === 'Wikimedia Commons',
  'placeholder licence → Commons'
);
assert(
  sc('Blanchardb- Me • MyEars • MyMouth -timed') === 'Blanchardb',
  'signature spam → tête'
);
for (const rel of [
  'data/quebec-backgrounds.json',
  'data/quebec-favorites-backgrounds.json',
  'data/quebec-university-backgrounds.json',
  'data/quebec-pomo-backgrounds.json',
  'data/quebec-nations-backgrounds.json',
]) {
  const bank = JSON.parse(readFileSync(join(root, rel), 'utf8'));
  for (const photo of bank.photos || []) {
    assert(
      !/\bfrom\s+[A-Z]/i.test(photo.credit || ''),
      `${rel}: origine auteur interdite dans le crédit (${photo.title})`,
    );
    const formatted = commonsCredit.formatMastheadCredit(photo);
    assert(
      !/\bfrom\s+[A-Z]/i.test(formatted.label),
      `${rel}: label crédit contient encore from… (${photo.title})`,
    );
    if (photo.place) {
      assert(
        !/panorama|skyline|landscape|cropped|f[ée]erie|kayaking|sunrise over/i.test(photo.place),
        `${rel}: place ressemble à un titre (${photo.title} → ${photo.place})`,
      );
    }
  }
}
assert(
  commonsCredit.sanitizeCommonsCredit('Nichole Ouellette/ouellette001.com') ===
    'Nichole Ouellette',
  'sanitize : domaine collé au nom',
);
assert(
  commonsCredit.sanitizeCommonsCredit('Livernois, Jules-Ernest, 1851-1933') ===
    'Jules-Ernest Livernois',
  'sanitize : Last, First, années',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Wilfredor',
    title: 'Cityscapes of Quebec City (skyline 2)',
    description: 'Quebec city skyline',
  }).label === 'Wilfredor — Québec',
  'crédit mât : Quebec City → Québec',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Quentin Schulz',
    title: 'Sunrise Over Montréal (250731329)',
  }).label === 'Quentin Schulz — Montréal',
  'crédit mât : Sunrise Over Montréal → Montréal',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Gaetan Lebret',
    title: 'Kayaking with Whales',
    description: 'There is so much whales around the archipelago during summer',
    place: 'Kayaking with Whales',
  }).label === 'Gaetan Lebret',
  'crédit mât : ne pas prendre un titre descriptif pour un lieu',
);
assert(
  commonsCredit.formatMastheadCredit({
    credit: 'Stéphane Groleau',
    title: 'Hôtel du Parlement — Assemblée nationale du Québec',
    season: 'ete',
  }).label === 'Stéphane Groleau — Assemblée nationale',
  'crédit mât : Assemblée nationale, sans saison',
);
assert(
  commonsCredit.isCopyleftLicense('CC BY-SA 4.0') === true,
  'copyleft : CC BY-SA',
);
assert(
  commonsCredit.isCopyleftLicense('') === false,
  'copyleft : licence vide = copyright, pas de marque',
);
assert(
  commonsCredit.isCopyleftLicense('CC BY 4.0') === false,
  'copyleft : CC BY n’est pas copyleft',
);
assert(
  commonsCredit.isCopyrightMarkLicense('') === true,
  'copyright : license vide → marque ©',
);
assert(
  commonsCredit.isCopyrightMarkLicense('CC BY-SA 4.0') === false,
  'copyright : pas de © droit sur du copyleft',
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
  assert(!/\(\s*talk\s*\)/i.test(txt), `${rel}: ( talk ) interdit en crédit stocké`);
  assert(!/\(\s*Uploads\s*\)/i.test(txt), `${rel}: ( Uploads ) interdit en crédit stocké`);
}
const bgJs = readFileSync(join(root, 'quebec-backgrounds.js'), 'utf8');
assert(bgJs.includes('sanitizeBgCredit'), 'mât : sanitize crédit runtime requis');
assert(/talk\|discussion\|uploads/i.test(bgJs), 'mât : strip talk/uploads runtime requis');

for (const app of ['pomo', 'solitaire']) {
  const html = readFileSync(join(root, app, 'index.html'), 'utf8');
  assert(/id=["']radar-embed["']/.test(html), `${app}: iframe Le Radar requis`);
  assert(/src=["']\.\.\/tuner-embed\.html["']/.test(html), `${app}: source iframe Le Radar invalide`);
  assert(/allow=["'][^"']*autoplay/.test(html), `${app}: permission autoplay iframe requise`);
}

const radiosRegistry = JSON.parse(readFileSync(join(root, 'radios.json'), 'utf8'));
// D16 : chaque station a une provenance de slogan vérifiable (source, extrait, date, confiance).
for (const radio of radiosRegistry) {
  assert(radio.slogan, `radio ${radio.id} : slogan requis`);
  assert(radio._sloganSource, `radio ${radio.id} : _sloganSource requis`);
  assert(radio._sloganEvidence, `radio ${radio.id} : _sloganEvidence requis`);
  assert(radio._sloganChecked, `radio ${radio.id} : _sloganChecked requis`);
  assert(
    ['high', 'medium', 'low'].includes(radio._sloganConfidence),
    `radio ${radio.id} : _sloganConfidence high|medium|low requis`,
  );
}
const chyzPage = readFileSync(join(root, 'radios/chyz/index.html'), 'utf8');
const chyzSource = radiosRegistry.find((radio) => radio.id === 'chyz');
assert(chyzSource?.slogan && chyzSource?._sloganSource && chyzSource?._sloganEvidence, 'radio CHYZ : provenance du slogan requise');
assert(chyzPage.includes(`<h1 class="seo-title">CHYZ 94,3 FM — ${chyzSource.slogan}</h1>`), 'radio CHYZ : nom, fréquence et slogan sourcé requis en titre');
assert(chyzPage.includes('href="../../horaires/">Choisir une autre radio</a>'), 'radio CHYZ : retour aux autres horaires requis');
assert(chyzPage.includes('MAJ le'), 'radio CHYZ : date de mise à jour requise');
assert(!chyzPage.includes('Dernière collecte réussie'), 'radio CHYZ : libellé collecte interne interdit');
{
  const { quebecWeekStartDate } = require('../scripts/seo-pages-lib.js');
  const week = quebecWeekStartDate();
  const weekLabel = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  }).format(week);
  assert(chyzPage.includes(`Semaine du ${weekLabel}`), `radio CHYZ : semaine courante requise (${weekLabel})`);
}
assert(chyzPage.includes('id="tuner" class="tuner"'), 'radio CHYZ : lecteur natif requis');
assert(!chyzPage.includes('id="radar-embed"'), 'radio CHYZ : iframe tuner interdit');
assert(chyzPage.includes('id="theme-toggle"'), 'radio CHYZ : bascule clair/sombre requise');
assert(chyzPage.includes('href="https://www.ville.quebec.qc.ca/?lang=fr"'), 'radio CHYZ : ville officielle liée requise');
assert(chyzPage.includes('href="https://www.quebec-cite.com/fr"'), 'radio CHYZ : tourisme régional lié requis');
// Localisation des établissements : le français adapte les noms anglais,
// tandis que le volet anglais conserve leurs formes officielles.
const cjloFrPage = readFileSync(join(root, 'radios/cjlo/index.html'), 'utf8');
const cjloEnPage = readFileSync(join(root, 'en/radios/cjlo/index.html'), 'utf8');
assert(cjloFrPage.includes('>Université Concordia</a>'), 'radio CJLO FR : établissement francisé requis');
assert(!cjloFrPage.includes('>Concordia University</a>'), 'radio CJLO FR : nom anglais interdit dans la fiche');
assert(cjloEnPage.includes('>Concordia University</a>'), 'radio CJLO EN : nom officiel anglais requis');
const ckutFrPage = readFileSync(join(root, 'radios/ckut/index.html'), 'utf8');
const ckutEnPage = readFileSync(join(root, 'en/radios/ckut/index.html'), 'utf8');
assert(ckutFrPage.includes('>Université McGill</a>'), 'radio CKUT FR : établissement francisé requis');
assert(ckutEnPage.includes('>McGill University</a>'), 'radio CKUT EN : nom officiel anglais requis');
const cjloPage = readFileSync(join(root, 'radios/cjlo/index.html'), 'utf8');
assert(cjloPage.includes('data-current-day="true"'), 'radio CJLO : le jour courant doit rester repérable même si la collecte est ancienne');
assert(/seo-slot--(?:live|upcoming)/.test(cjloPage), 'radio CJLO : émission en cours ou à venir doit être repérée');
assert(cjloPage.includes('data-schedule-day="'), 'radio CJLO : jour de grille recalculable côté navigateur requis');
const jonquierePage = readFileSync(join(root, 'etablissements/cegep-de-jonquiere/index.html'), 'utf8');
assert(jonquierePage.includes('href="https://www.saguenaylacsaintjean.ca/"'), 'établissement Jonquière : tourisme régional lié requis');
const laPigePage = readFileSync(join(root, 'journaux/la-pige/index.html'), 'utf8');
assert(laPigePage.includes('Dernier article : '), 'journal : fraîcheur des articles requise');
assert(!laPigePage.includes('Chaque titre renvoie à l’article original'), 'journal : note redondante retirée');
assert(laPigePage.includes('class="seo-headline__by">Par '), 'journal : byline préfixée requise');
assert(laPigePage.includes('class="seo-headline__brief"'), 'journal : bref article requis');
assert(laPigePage.includes('class="seo-headline__more"'), 'journal : lien lire la suite requis');
assert(
  /<time datetime="\d{4}-\d{2}-\d{2}T[^"]+"/.test(laPigePage),
  'journal : heure de publication machine requise',
);
assert(laPigePage.includes(' · '), 'journal : heure de publication visible requise');
assert(!/Crédit photo\s*:/i.test(laPigePage), 'journal : crédits photo absents des extraits SEO requis');
assert(!/Cégep de Jonquière \(Saguenay/u.test(laPigePage), 'journal : région redondante dans le chapeau interdite');
assert(laPigePage.includes('?source=La%20Pige#news-list'), 'journal : retour filtré vers tous les articles requis');
assert(laPigePage.includes('Voir les articles les plus récents'), 'journal : CTA récents requis');
assert(laPigePage.includes('Voir les archives'), 'journal : CTA archives requis');
assert(laPigePage.includes('seo-source-actions'), 'journal : rangée d’actions récents + archives requise');
assert(laPigePage.includes('href="../../archives/">Archives</a>'), 'footer : lien Archives partagé requis');
{
  const kit = readFileSync(join(root, 'kit-media/index.html'), 'utf8');
  assert(kit.includes('Kit média'), 'kit-media : titre Kit média requis');
  assert(kit.includes('assets/icon.svg'), 'kit-media : pictogramme téléchargeable requis');
  assert(kit.includes('wordmark-on-dark.svg'), 'kit-media : mot-symbole sombre requis');
  assert(kit.includes('wordmark-on-light.svg'), 'kit-media : mot-symbole clair requis');
  assert(kit.includes('wordmark-on-dark.jpg'), 'kit-media : JPG mot-symbole sombre');
  assert(kit.includes('wordmark-on-light.jpg'), 'kit-media : JPG mot-symbole clair');
  assert(kit.includes('banner-web.jpg'), 'kit-media : JPG bannière web');
  assert(kit.includes('banner-square.jpg'), 'kit-media : JPG carré réseaux');
  assert(kit.includes('icon-512.jpg'), 'kit-media : JPG pictogramme');
  assert(kit.includes('src="../assets/kit/wordmark-on-dark.jpg"'), 'kit-media : preview = fichier sombre');
  assert(kit.includes('src="../assets/kit/banner-square.jpg"'), 'kit-media : preview = carré réseaux');
  for (const asset of ['wordmark-on-dark.svg', 'wordmark-on-light.svg', 'banner-web.svg', 'banner-square.svg', 'affiche-11x17.svg']) {
    const svg = readFileSync(join(root, 'assets/kit', asset), 'utf8');
    assert(svg.includes('data:image/svg+xml;base64,'), `kit-media : ${asset} doit être autonome après téléchargement`);
    assert(!svg.includes('href="../icon.svg"'), `kit-media : ${asset} ne doit pas dépendre d'un chemin local`);
    assert(svg.includes("font-family:'LR Serif'"), `kit-media : ${asset} embarque Source Serif 4`);
    assert(!/font-family="Georgia, serif"/.test(svg), `kit-media : ${asset} n’utilise plus Georgia pour LE-RADAR.ca`);
  }
  const mediaKitCheck = spawnSync(process.execPath, [join(root, 'scripts/generate-media-kit-assets.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(mediaKitCheck.status, 0, mediaKitCheck.stderr || 'kit-media : fichiers générés désynchronisés');
  assert(kit.includes('../affiches/'), 'kit-media : lien vers l’atelier d’affiches');
  assert(
    kit.indexOf('id="affiches"') < kit.indexOf('id="logos"'),
    'kit-media : section Affiches en premier',
  );
  assert(kit.includes('Pour les babillards'), 'kit-media : phrase affiches claire');
  assert(kit.includes('id="kit-poster-grid"'), 'kit-media : grille d’exemples d’affiches');
  assert(kit.includes('kit-poster-examples.js'), 'kit-media : tirage aléatoire d’exemples');
  assert(kit.includes('kit-card--feature'), 'kit-media : affiche générique en carte vedette');
  assert(kit.includes('download="le-radar-affiche-11x17.pdf"'), 'kit-media : nom de fichier PDF 11 × 17');
  assert(kit.includes('type="application/pdf"'), 'kit-media : type PDF explicite pour iOS');
  {
    const examplesJs = readFileSync(join(root, 'kit-media/kit-poster-examples.js'), 'utf8');
    assert(examplesJs.includes('function isAppleTouch'), 'kit-media : détection iPad/iOS');
    assert(examplesJs.includes('function saveKitFile'), 'kit-media : enregistrement iOS (partage / nouvel onglet)');
    assert(examplesJs.includes('featureSpan'), 'kit-media : la vedette compte pour deux colonnes');
    assert(examplesJs.includes('minmax(280px') || examplesJs.includes('const min = 280'), 'kit-media : cartes plus larges sur tablette');
  }
  assert(existsSync(join(root, 'assets/kit/affiches/examples.json')), 'kit-media : catalogue d’exemples');
  {
    const catalog = JSON.parse(readFileSync(join(root, 'assets/kit/affiches/examples.json'), 'utf8'));
    for (const ex of catalog.examples || []) {
      const prev = join(root, 'assets/kit/affiches', `affiche-ex-${ex.id}-preview.jpg`);
      assert(existsSync(prev), `kit-media : aperçu local ${ex.id}`);
    }
  }
  assert(!kit.includes('à imprimer à 100'), 'kit-media : plus de consigne dpi/100 % dans le lead');
  assert(kit.includes('?campus=laval'), 'kit-media : raccourci campus Laval');
  assert(!kit.includes('affiche-laval.jpg'), 'kit-media : plus de JPEG campus figés');
  assert(!/Rentrée 2026/.test(kit), 'kit-media : plus de Rentrée 2026');
  for (const name of [
    'affiche-generique-11x17-600dpi.pdf',
    'affiche-generique-lettre-600dpi.pdf',
    'affiche-generique-legal-600dpi.pdf',
    'affiche-generique-preview.jpg',
  ]) {
    assert(existsSync(join(root, 'assets/kit/affiches', name)), `kit-media : ${name} requis`);
    assert(kit.includes(name), `kit-media : lien ${name}`);
  }
  assert(!kit.includes('affiche-generique-11x17-600dpi.jpg'), 'kit-media : téléchargements génériques en PDF');
  assert(kit.includes('>11 × 17<') || kit.includes('11 × 17</a>'), 'kit-media : téléchargement 11 × 17');
  assert(kit.includes('>Lettre<') || kit.includes('Lettre</a>'), 'kit-media : téléchargement lettre');
  assert(kit.includes('>Légal<') || kit.includes('Légal</a>'), 'kit-media : téléchargement légal');
  const mediaKitEn = readFileSync(join(root, 'en/media-kit/index.html'), 'utf8');
  assert(mediaKitEn.includes('../../affiches/'), 'media-kit EN : lien vers l’atelier');
  assert(mediaKitEn.includes('kit-card--feature'), 'media-kit EN : affiche générique en carte vedette');
  assert(!mediaKitEn.includes('affiche-laval.jpg'), 'media-kit EN : plus de JPEG campus figés');
  const posterScript = readFileSync(join(root, 'scripts/generate-campus-posters.py'), 'utf8');
  assert(posterScript.includes('TITLE = "LE-RADAR.ca"'), 'affiches campus : mot-symbole LE-RADAR.ca');
  assert(posterScript.includes('draw_footer_wordmark'), 'affiches campus : petit logo PWA au footer seulement');
  assert(!/Rentrée 2026/.test(posterScript), 'affiches campus : pas de Rentrée 2026');
  assert(posterScript.includes('SLOGAN = "Journaux, radios et sports étudiants du Québec, réunis au même endroit"'), 'affiches campus : slogan sur une ligne');
  assert(posterScript.includes('Université McGill'), 'affiches campus : nom français OQLF pour McGill');
  assert(posterScript.includes('netement prédominant') || posterScript.includes('nettement prédominant'), 'affiches campus : bilingue OQLF (français prédominant)');
  assert(!posterScript.includes('Votre journal'), 'affiches campus : plus de liste journaux');
  assert(!posterScript.includes('Votre radio'), 'affiches campus : plus de liste radios');
  assert(/draw\.rectangle\(\(0, 0, W, BAR_H\)/.test(posterScript), 'affiches campus : barre pourpre en haut');
  assert(!posterScript.includes('paint_chip'), 'affiches campus : plus de pastilles autour du texte');
  assert(posterScript.includes('raster_qr'), 'affiches campus : QR officiel collé, pas un carré vide');
  assert(posterScript.includes('Student newspapers, radio and sports from Quebec'), 'affiches campus : slogan EN = traduction du français');
  const builder = readFileSync(join(root, 'affiches/index.html'), 'utf8');
  const builderJs = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
  assert(builderJs.includes('fillCentered(ctx, NAME_FULL, cy, SOFT)'), 'pied d’affiche : nom développé discret comme le site');
  assert(builderJs.includes('fillUniLockup'), 'générateur public : nom d’établissement plus grand / gras');
  assert(builderJs.includes('uniLockupParts'), 'générateur public : même lockup pour tous les campus');
  assert(builderJs.includes("core: 'Laval'"), 'générateur public : Laval en gras comme McGill');
  assert(builderJs.includes("kind === 'bilingue' && campus.bilingual"), 'University seulement si bilingue anglophone');
  assert(builderJs.includes('campus.line || campus.core'), 'francophone : nom entier en gras');
  assert(builderJs.includes('GREETINGS_EN'), 'générateur public : messages manuscrits bilingues OQLF');
  assert(posterScript.includes('non officiel et sans affiliation'), 'affiches campus : « et » plutôt qu’un tiret');
  assert(posterScript.includes('Les contenus appartiennent à leurs publications'), 'affiches campus : contenus d’origine');
  assert(!posterScript.includes('Azdak'), 'affiches campus : pas de mention Azdak');
  assert(!/GPL-2/.test(posterScript), 'affiches campus : pas de GPL au pied');
  assert(posterScript.includes('Le Réseau Académique de Découverte'), 'affiches campus : nom complet au footer');
  assert(existsSync(join(root, 'assets/kit/qr-le-radar.svg')), 'affiches campus : QR vectoriel officiel requis');
  assert(builder.includes('Imprimer une affiche'), 'générateur public : titre');
  assert(
    builder.indexOf('<legend>Code QR</legend>') < builder.indexOf('<legend>Photo</legend>'),
    'affiches : paramètres avant la grille photo',
  );
  assert(!builder.includes('n’apparaît qu’en local'), 'affiches : pas de mention labo dans le texte public');
  assert(!builder.includes('barre de tailles'), 'affiches : pas de notice Format dans le lead');
  assert(builder.includes('class="masthead"'), 'affiches : mât SEO comme les autres pages');
  assert(builder.includes('class="site-foot"'), 'affiches : pied SEO comme les autres pages');
  assert(builder.includes('seo-page-theme.js'), 'affiches : thème clair/sombre du site');
  assert(!builder.includes('lab-photo-link'), 'affiches : pas de lien Labo photo (labo = /dev/)');
  assert(builder.includes('midwidth-preview.js'), 'générateur public : barre Format du labo local');
  const hubHtml = readFileSync(join(root, 'dev/index.html'), 'utf8');
  assert(hubHtml.includes('Tableau de bord'), 'hub local : titre Tableau de bord');
  assert(readFileSync(join(root, 'dev/midwidth-preview.js'), 'utf8').includes("textContent = 'Tableau'"), 'barre Format : retour Tableau de bord');
  assert(builder.includes('Lettre 8,5 × 11'), 'générateur public : format lettre');
  assert(builder.includes('Légal 8,5 × 14'), 'générateur public : format légal');
  assert(builderJs.includes('function applyQuery'), 'générateur public : ?campus= depuis le kit média');
  assert(builderJs.includes('function isAppleTouch'), 'générateur public : iPadOS desktop-UA');
  assert(builderJs.includes('function mustTile'), 'générateur public : tuilage forcé sous le plafond iOS');
  assert(builderJs.includes('function rasterTiles'), 'générateur public : PDF 600 dpi en tuiles sur iPad');
  assert(builderJs.includes('function jpegTilesToPdfBlob'), 'générateur public : assemblage PDF tuilé');
  assert(builderJs.includes('clipX'), 'générateur public : composition par clip');
  assert(builderJs.includes('function saveBlob'), 'générateur public : partage iOS / lien différé');
  assert(builderJs.includes('setTimeout(() => URL.revokeObjectURL'), 'générateur public : ne pas révoquer le blob tout de suite');
  assert(builderJs.includes('16_777_216') || builderJs.includes('16777216'), 'générateur public : plafond 16 Mpx iOS');
  assert(builderJs.includes('photo-bank.json'), 'générateur public : banque unique du labo photo');
  assert(builderJs.includes('quebec-backgrounds-rejected.json'), 'générateur public : exclusions du labo');
  assert(builderJs.includes('wIn: 8.5') && builderJs.includes('hIn: 11'), 'générateur public : lettre 8,5×11');
  assert(builderJs.includes('REF_DPI = 300'), 'générateur public : 300 dpi de référence');
  assert(builderJs.includes('PREVIEW_DPI'), 'générateur public : aperçu plus léger que le JPEG');
  assert(builderJs.includes('DPI_PUBLIC'), 'générateur public : 300 et 600 dpi en prod');
  assert(builderJs.includes('DPI_LAB'), 'générateur public : 1200 dpi réservé au labo local');
  assert(builderJs.includes('DEFAULT_DPI = 600'), 'générateur public : 600 dpi par défaut');
  assert(builder.includes('name="dpi"'), 'générateur public : choix de résolution');
  assert(builder.includes('name="langs" value="oui" checked'), 'affiche générique : langues du site par défaut');
  assert(builderJs.includes('syncGenericLangs'), 'affiche générique : langues rétablies sur Générique');
  assert(builder.includes('id="dpi-1200-choice" hidden'), '1200 dpi masqué hors labo local');
  assert(builder.includes('value="600" checked'), 'générateur public : 600 dpi coché');
  assert(builderJs.includes('jpegToPdfBlob'), 'générateur public : PDF dans le navigateur');
  assert(builderJs.includes('previewFit'), 'générateur public : aperçu dimensionné à la zone');
  assert(builderJs.includes('view.style.width'), 'générateur public : canvas d’aperçu pas 300×150 par défaut');
  assert(builder.includes('PDF 600 dpi'), 'générateur public : bouton PDF 600 dpi');
  assert(builder.includes('id="dl-jpg"'), 'générateur public : JPEG en second');
  assert(builderJs.includes("downloadPrint(kind = 'pdf')") || builderJs.includes('downloadPrint(kind = "pdf")') || builderJs.includes("kind = 'pdf'"), 'générateur public : PDF par défaut');
  assert(builderJs.includes('TITLE = \'LE-RADAR.ca\''), 'générateur public : mot-symbole');
  assert(builderJs.includes('printUrl'), 'générateur public : photos Wikimedia CORS pour l’aperçu');
  assert(builderJs.includes('function drawRadar(ctx, w, h, cx, cy)'), 'fond radar centré sur le gros logo');
  assert(builderJs.includes('816 * fit'), 'identité d’affiche figée : le pied ne rapetisse pas le logo');
  assert(builderJs.includes('3680 * fit'), 'QR figé un peu plus haut : langues entières sous le pied');
  assert(builderJs.includes('opts.langs) ? qrTop + qrSide : qrTop'), 'sans QR ni langues : pied serré, pas étiré');
  assert(builderJs.includes('footCap'), 'pied d’affiche : corps agrandi sans dépasser le haut');
  assert(builderJs.includes('(h - cy - creditH) / 2'), 'crédit photo : milieu entre langues et bas de page');
  assert(builderJs.includes('photo-angle'), 'générateur public : angle de photo');
  assert(builder.includes('solid--radar') || builderJs.includes('solid--radar'), 'générateur public : pastille fond radar');
  assert(builderJs.includes('syncLangChoice'), 'générateur public : bilingue réservé aux campus anglophones');
  assert(builderJs.includes('non officiel et sans affiliation'), 'générateur public : « et » plutôt qu’un tiret');
  assert(builderJs.includes('TRANSLATE_LANGS'), 'générateur public : langues du module de traduction');
  assert(existsSync(join(root, 'assets/kit/translate-mark.svg')), 'icône de traduction pour le pied d’affiche');
  assert(
    !/stroke-width/.test(readFileSync(join(root, 'assets/kit/translate-mark.svg'), 'utf8')),
    'icône traduction : pas de stroke (plus en gras)',
  );
  assert(builderJs.includes('Bonne rentrée'), 'générateur public : message manuscrit rentrée');
  assert(builderJs.includes('Pas de publicité'), 'générateur public : phrase manuscrite sans pub');
  assert(builderJs.includes("greeting: 'none'"), 'affiche générique : pas de message manuscrit par défaut');
  assert(builder.includes('value="none" selected'), 'affiche générique : Aucun coché');
  assert(!builder.includes('value="nopub" selected'), 'affiche générique : Pas de publicité n’est plus le défaut');
  assert(!kit.includes('Pas de publicité ·'), 'kit-media : métadonnée générique sans phrase manuscrite');
  assert(!mediaKitEn.includes('No ads ·'), 'media-kit EN : métadonnée générique sans phrase manuscrite');
  assert(builderJs.includes('Code libre GPL 2.0'), 'générateur public : phrase manuscrite GPL');
  assert(builderJs.includes('Gratuit, pour toujours'), 'générateur public : phrase manuscrite gratuit');
  assert(builder.includes('optgroup label="Le projet"'), 'générateur public : groupe de phrases projet');
  assert(builderJs.includes('LR Script'), 'générateur public : fonte signature');
  assert(existsSync(join(root, 'assets/kit/fonts/Caveat-Bold.ttf')), 'fonte Caveat pour signature manuscrite');
  assert(builderJs.includes("slug: 'mcgill'") && builderJs.includes('bilingual: true'), 'générateur public : McGill bilingue');
  assert(
    /slug: 'laval', line: 'Université Laval', prefix: 'Université ', core: 'Laval', bilingual: false/.test(builderJs),
    'générateur public : Laval français seulement',
  );
  const postersCheck = spawnSync('python3', [join(root, 'scripts/generate-campus-posters.py'), '--check'], { encoding: 'utf8' });
  assert.equal(postersCheck.status, 0, postersCheck.stderr || postersCheck.stdout || 'affiches campus : JPEG 11×17 manquants');
}
const traitPage = readFileSync(join(root, 'journaux/le-trait-dunion/index.html'), 'utf8');
assert(traitPage.includes('>Derniers articles<'), 'journal sans fil frais : même H2 que les autres fiches');
assert(traitPage.includes('fenêtre de fraîcheur'), 'journal sans fil frais : message de fraîcheur (sessions) requis');
assert(traitPage.includes('Voir les archives'), 'journal sans fil frais : CTA archives requis');
assert(!traitPage.includes('>Articles historiques<'), 'journal sans fil frais : plus de H2 « historiques »');
assert(!traitPage.includes('Voir les articles les plus récents'), 'journal sans fil frais : CTA du fil vivant interdit');
assert(traitPage.includes('href="../../archives/le-trait-dunion/"'), 'journal sans fil frais : lien direct vers les archives unifiées requis');
const traitArchivePage = readFileSync(join(root, 'archives/le-trait-dunion/index.html'), 'utf8');
assert(traitArchivePage.includes('>Lire la suite →</a>'), 'archive historique : action éditoriale cohérente requise');
assert(!traitArchivePage.includes('Lien original redirigé et vérifié'), 'archive historique : statut technique caché requis');
const seoPagesCss = readFileSync(join(root, 'seo-pages.css'), 'utf8');
// Liens hors site (ville, région, site officiel, articles) → nouvel onglet.
assert(
  readFileSync(join(root, 'scripts/seo-pages-lib.js'), 'utf8').includes('EXTERNAL_LINK_ATTRS'),
  'SEO : attributs target=_blank partagés pour les liens externes requis',
);
assert(
  /target="_blank" rel="noopener noreferrer"/.test(readFileSync(join(root, 'radios/cfak/index.html'), 'utf8')),
  'radio CFAK : liens externes (région, site…) doivent ouvrir un nouvel onglet',
);
assert(seoPagesCss.includes('var(--status-live)'), 'horaire : créneau actif = rouge EN ONDES requis');
assert(seoPagesCss.includes('var(--status-live-soft)'), 'horaire : coral bandeau sombre requis');
assert(seoPagesCss.includes('var(--status-upcoming-soft)'), 'horaire : ambre « À venir » requis');
assert(seoPagesCss.includes('.seo-slot--playing'), 'horaire : état de lecture réelle requis');
assert(seoPagesCss.includes('animation: seo-live-pulse'), 'horaire : pulsation live requise');
assert(seoPagesCss.includes('animation: seo-upcoming-pulse'), 'horaire : pulsation du prochain créneau requise');
assert(seoPagesCss.includes('.seo-slot--pulse'), 'horaire : un seul créneau pulse à la fois');
assert(seoPagesCss.includes('prefers-reduced-motion'), 'horaire : réduction des animations requise');
const appJs = readFileSync(join(root, 'app.js'), 'utf8');
assert(appJs.includes('syncSeoSchedulePlayback()'), 'horaire : synchronisation avec la lecture réelle requise');
assert(appJs.includes("slot.classList.toggle('seo-slot--playing'"), 'horaire : classe de lecture réelle requise');
assert(appJs.includes('seo-slot--pulse'), 'horaire : classe pulse unique requise');
assert(appJs.includes('#horaire-avenir'), 'horaire : ancre à venir requise');
assert(appJs.includes('function ensureMastheadBoards'), 'mât : météo + sports posés hors accueil');
assert(
  readFileSync(join(root, 'scripts/seo-pages-lib.js'), 'utf8').includes('renderMastheadBoards'),
  'SEO : gabarit météo + sports partagé requis',
);
assert(readFileSync(join(root, 'feeds.html'), 'utf8').includes('id="masthead-weather"'), 'feeds : bandeau météo requis');
assert(readFileSync(join(root, 'feeds.html'), 'utf8').includes('id="masthead-sports-strip"'), 'feeds : bandeau sports requis');
assert(readFileSync(join(root, 'sports/index.html'), 'utf8').includes('id="masthead-weather"'), 'sports : bandeau météo requis');
const scheduleSeed = readFileSync(join(root, 'radio-schedules.seed.json'), 'utf8');
assert(scheduleSeed.includes('"type": "cjlo"'), 'horaire CJLO : source conservée malgré une panne temporaire');
const offlineHtml = readFileSync(join(root, 'offline.html'), 'utf8');
assert(offlineHtml.includes("params.has('maintenance')"), 'offline.html : mode maintenance durable requis');
assert(!offlineHtml.includes('id="tuner" class="tuner"'), 'offline.html : barre radio interdite en maintenance');
assert(offlineHtml.includes('id="lang-scroll-prev"'), 'offline.html : bouton langues gauche requis');
assert(offlineHtml.includes('id="lang-scroll-next"'), 'offline.html : bouton langues droite requis');
assert(offlineHtml.includes("chipsEl.addEventListener('wheel'"), 'offline.html : défilement souris des langues requis');
assert(offlineHtml.includes("chipsEl.addEventListener('pointerdown'"), 'offline.html : glisser souris des langues requis');
assert(offlineHtml.includes('LANGUAGE_MANUAL_PAUSE_MS = 10 * 60 * 1000'), 'offline.html : pause manuelle des langues de dix minutes requise');
assert(offlineHtml.includes('site-foot--maintenance'), 'offline.html : variante de footer compact requise');
assert(offlineHtml.includes('<summary>À propos de LE-RADAR.ca</summary>'), 'offline.html : détails du footer maintenance requis');
assert(appJs.includes('initTunerPresentationLifecycle()'), 'app.js : cycle de vie du synthétiseur requis');
{
  // Voie wide E : paintWideDial écrit L1/L2 puis return — si is-dial-ready
  // n'est jamais posé, le CSS laisse le carré du synthétiseur vide partout.
  const wideStart = appJs.indexOf('// Wide E : dual');
  assert(wideStart > 0, 'app.js : commentaire voie wide E requis');
  const wideReturn = appJs.indexOf('\n    return;', wideStart);
  assert(wideReturn > wideStart, 'app.js : return voie wide E requis');
  const wideSlice = appJs.slice(wideStart, wideReturn);
  assert(
    wideSlice.includes('paintWideDial(radio)') && wideSlice.includes('markTunerDialReady()'),
    'app.js : voie wide E doit révéler le carré (is-dial-ready)',
  );
  assert(
    /function paintWideDial\([\s\S]*?markTunerDialReady\(\);[\s\S]*?return true;/.test(appJs),
    'app.js : paintWideDial doit poser is-dial-ready après L1/L2',
  );
}
assert(appJs.includes("refreshNowPlayingCache({ render: false })"), 'app.js : actualisation avant reprise du synthétiseur requise');
assert(appJs.includes('syncSeoScheduleNow()'), 'app.js : repère quotidien des grilles SEO requis');
const maintenanceDoc = readFileSync(join(root, 'docs/maintenance.md'), 'utf8');
assert(maintenanceDoc.includes('Le DNS de `le-radar.ca` reste chez **WHC**'), 'documentation maintenance : hébergement WHC requis');
assert(maintenanceDoc.includes('npm run maintenance:status'), 'documentation maintenance : commande de statut requise');
const feedsHtml = readFileSync(join(root, 'feeds.html'), 'utf8');
assert(feedsHtml.includes('src="native-tuner.js"'), 'feeds.html : lecteur natif requis');
assert(feedsHtml.includes('src="nav-shell.js"'), 'feeds.html : navigation persistante requise');
assert(readFileSync(join(root, 'index.html'), 'utf8').includes('src="seo-page-theme.js"'), 'index.html : amorçage de thème avant paint requis');
assert(feedsHtml.includes('src="seo-page-theme.js"'), 'feeds.html : amorçage de thème avant paint requis');
{
  const themeJs = readFileSync(join(root, 'seo-page-theme.js'), 'utf8');
  const midJs = readFileSync(join(root, 'dev/midwidth-preview.js'), 'utf8');
  const wideJs = readFileSync(join(root, 'dev/wide-desktop-preview.js'), 'utf8');
  assert(
    themeJs.includes('function applyWideLayoutFromViewport')
      && themeJs.includes("get('wide')")
      && /return 'e'/.test(midJs)
      && /return 'e'/.test(wideJs)
      && /if \(id === 'off' \|\| id === 'a'\) return false/.test(appJs),
    'layout : E auto dès 1281 px sans ?wide= (prod / main)',
  );
  assert(
    !midJs.includes("searchParams.get(WIDE_PARAM) || 'off'")
      && !wideJs.includes("searchParams.get(WIDE_PARAM) || 'off'"),
    'layout : le défaut URL n’est plus off (sinon prod reste à 1180)',
  );
}
assert(feedsHtml.includes('class="wordmark-logo"'), 'feeds.html : logo de marque courant requis');
assert(!feedsHtml.includes('wordmark-emoji'), 'feeds.html : ancien titre à emojis interdit');
assert(feedsHtml.includes('id="today-time"'), 'feeds.html : heure du mât requise');
const schedulesHub = readFileSync(join(root, 'horaires/index.html'), 'utf8');
assert(schedulesHub.includes('Les grilles viennent des sites des stations'), 'hub horaires : note au pluriel requise');
assert(schedulesHub.includes('class="seo-radio-cards"'), 'hub horaires : cartes radio dédiées requises');
assert(schedulesHub.includes('data-schedule-air'), 'hub horaires : émission en cours ou à venir requise');
assert(schedulesHub.includes('MAJ le'), 'hub horaires : date de mise à jour requise');
assert(!schedulesHub.includes('colligé le'), 'hub horaires : date ISO colligée interdite');
assert(!schedulesHub.includes('créneaux'), 'hub horaires : décompte de créneaux interdit');

const embedScript = readFileSync(join(root, 'embed.js'), 'utf8');
assert(embedScript.includes("type: 'radar-embed'"), 'contrat postMessage radar-embed requis');
assert(embedScript.includes("type: 'ataraxia-radar-embed'"), 'contrat postMessage historique requis');
assert(embedScript.includes("surface === 'kiosque-v1'"), 'surface kiosque-v1 requise');
assert(embedScript.includes("available: false"), 'repli indisponible kiosque requis');
assert(embedScript.includes('protocol: 1'), 'version du contrat embed requise');
const embedCss = readFileSync(join(root, 'embed.css'), 'utf8');
assert(embedCss.includes('[data-surface="kiosque-v1"]'), 'surface sombre kiosque-v1 requise');
assert(
  embedCss.includes('[data-surface="kiosque-v1"] .tuner-vol-labels'),
  'kiosque-v1 : labels volume 0/100/200 % réaffichés',
);
assert(
  embedCss.includes('--tuner-upcoming: var(--status-upcoming-soft')
    || embedCss.includes('--tuner-upcoming: var(--status-upcoming-soft,'),
  'embed : ambre « À venir » aligné sur --status-upcoming-soft (#e8c07a)',
);
assert(
  !embedCss.includes('#f0c14e'),
  'embed : plus d’or vif #f0c14e pour « À venir » (utiliser #e8c07a)',
);
assert(
  embedCss.includes('[data-surface="kiosque-v1"] .tuner-vol-fill--base'),
  'kiosque-v1 : remplissage volume (bleu radio-bright) comme le bureau',
);
assert(
  /* Lecture : `.is-playing:not(.is-buffering)` pour ne pas chevaucher le tampon. */
  (embedCss.includes('[data-surface="kiosque-v1"] .tuner.is-playing .tuner-eq span')
    || embedCss.includes('[data-surface="kiosque-v1"] .tuner.is-playing:not(.is-buffering) .tuner-eq span'))
    && embedCss.includes('[data-surface="kiosque-v1"] .tuner.is-buffering .tuner-eq span')
    && embedCss.includes('eq-buffer')
    && !embedCss.includes('embedEq')
    && /is-buffering \.tuner-eq span \{[^}]*var\(--live/.test(embedCss.replace(/\s+/g, ' ')),
  'kiosque-v1 : EQ lecture + buffering en rouge live (pas d’animation maison)',
);
assert(
  embedCss.includes('[data-surface="kiosque-v1"] .tuner-cast--bar'),
  'kiosque-v1 : cast en barre sur largeur bureau',
);
assert(
  embedScript.includes("surface === 'kiosque-v1' ? 68 : 62"),
  'kiosque-v1 : hauteur embed 68 px pour les labels',
);
assert(
  embedCss.includes('--tuner-session-base') && embedCss.includes('data-uni-session="automne"'),
  'kiosque-v1 : fond de session univ. comme le bureau',
);
const tunerEmbedHtml = readFileSync(join(root, 'tuner-embed.html'), 'utf8');
assert(
  tunerEmbedHtml.includes('session-freshness-lib.js'),
  'tuner-embed charge session-freshness pour le thème kiosque-v1',
);
const appScript = readFileSync(join(root, 'app.js'), 'utf8');
assert(appScript.includes("get('station')"), 'station demandée par l’embed requise');

// ── Référencement (moteurs + assistants IA) ────────────────────────────────
// Ces acquis sont invisibles à l'œil : sans test, une refonte du <head> ou de
// #news-list peut les supprimer sans que personne ne le remarque pendant des
// mois. Voir scripts/generate-seo.js.
for (const rel of ['robots.txt', 'sitemap.xml', 'llms.txt', 'assets/og-cover.png']) {
  assert(existsSync(join(root, rel)), `${rel} requis pour le référencement`);
}
const ogScript = readFileSync(join(root, 'scripts/generate-og-image.py'), 'utf8');
assert(
  /Les journaux, radios et sports étudiants du Québec/.test(ogScript)
    && /Cégeps et universités/.test(ogScript)
    && /sports/.test(ogScript)
    && !/Les journaux et les radios étudiantes du Québec/.test(ogScript),
  'og-cover : slogan au rythme ancien + triade + cégeps et universités',
);
assert(
  /\(W - lockup_w\)/.test(ogScript) && /\(W - tag_w\)/.test(ogScript),
  'og-cover : lockup et accroches centrés',
);
assert(
  /SourceSerif4Display/.test(ogScript)
    && /LE-RADAR\.ca/.test(ogScript)
    && !/draw\.text\([^)]*\.ca[^)]*PURPLE/.test(ogScript),
  'og-cover : mot-symbole = Source Serif 4 Display, .ca de la même couleur que LE-RADAR',
);

const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
assert(/^Sitemap:\s*https:\/\/le-radar\.ca\/sitemap\.xml$/m.test(robots), 'robots.txt : directive Sitemap requise');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
  assert(new RegExp(`^User-agent:\\s*${bot}$`, 'm').test(robots), `robots.txt : ${bot} doit être listé`);
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
assert(
  /og-cover\.png\?v=3/.test(indexHtml)
    && /og-cover\.png\?v=3/.test(readFileSync(join(root, 'scripts/seo-pages-lib.js'), 'utf8')),
  'og:image : ?v=3 requis pour casser le cache des aperçus de lien',
);
const engagePrompt = readFileSync(join(root, 'engage-prompt.js'), 'utf8');
assert(!/coque hors-ligne/i.test(engagePrompt), 'invitation PWA : jargon « coque » interdit');
assert(engagePrompt.includes('LE-RADAR au démarrage ?'), 'invitation accueil : titre orienté résultat requis (focus-group engage-copy B)');
// Focus-group le-radar-engage-home-guide (C) : copier + 2 steps, pas de mur de flèches.
assert(
  engagePrompt.includes('Copier l’adresse')
    && engagePrompt.includes('Copy address')
    && engagePrompt.includes('copySiteUrl')
    && engagePrompt.includes('le-radar-engage-home-guide')
    && engagePrompt.includes('Réglage navigateur uniquement')
    && !/Astuce : glissez cet onglet/i.test(engagePrompt)
    && !/Tip: drag this tab/i.test(engagePrompt),
  'invitation accueil : guide C (copier + 2 steps, sans tip glisser)',
);
assert(engagePrompt.includes('Sur l’écran d’accueil'), 'invitation install : titre spatial focus-group B');
assert(
  engagePrompt.includes('notAPhoneViewport')
    && engagePrompt.includes('Installer l’application')
    && /notAPhoneViewport && !ios && !android/.test(engagePrompt),
  'invitation install : tactile grand écran ≠ téléphone (PWA bureau Edge)',
);
assert(
  engagePrompt.includes('Journaux, radios et sports étudiants du Québec — en un geste.'),
  'invitation install : body triade marque (journaux + radios + sports)',
);
assert(
  engagePrompt.includes('Québec student newspapers, radio and sports — one tap away.'),
  'invitation install EN : body triade marque',
);
assert(
  /sports étudiants/i.test(engagePrompt) && /journaux/i.test(engagePrompt) && /radios/i.test(engagePrompt),
  'invitation install radar : ne pas omettre un volet de la triade',
);
// Guide manuel (non-natif) doit aussi porter la triade via installBodyCopy — pas un
// corps générique « En un geste. Sur cet appareil » qui omettait les sports.
assert(
  engagePrompt.includes('installBodyCopy(lang, appId)')
    || (engagePrompt.includes('function installBodyCopy')
      && engagePrompt.includes('const benefit = installBodyCopy')),
  'invitation install : body manuel = installBodyCopy (triade)',
);
assert(!/accès hors ligne inclus/i.test(engagePrompt), 'invitation PWA : promesse offline gonflée interdite');
assert(!/magasin d[’']apps/i.test(engagePrompt), 'invitation PWA : jargon magasin d’apps interdit');
assert(engagePrompt.includes("event.key === 'Escape'"), 'invitation : fermeture Échap requise');
const TUNER_FRAME_ORIGINS = [
  "'self'",
  'https://chyz.ca',
  'https://cism893.ca',
  'https://ckut.ca',
  'https://www.cjlo.com',
  'https://www.cfak.ca',
  'https://www.choq.ca',
];
/** connect-src inventorié (D14) — pas de https: générique. */
const CONNECT_ORIGINS = [
  "'self'",
  'blob:',
  'https://le-radar-weather.azdak.workers.dev',
  'https://le-radar-nowplaying.azdak.workers.dev',
  'https://le-radar-bg-rotation.azdak.workers.dev',
  'https://cloud.umami.is',
  'https://gateway.umami.is',
  'https://translate.googleapis.com',
  'https://api.mymemory.translated.net',
];
for (const rel of ['index.html', 'tuner-embed.html', 'feeds.html']) {
  const html = readFileSync(join(root, rel), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
  const frameSrc = csp.match(/(?:^|;\s*)frame-src\s+([^;]+)/i)?.[1] || '';
  assert(frameSrc, `${rel}: directive frame-src CSP requise`);
  assert(!/(^|\s)https:(?:\s|$)/.test(frameSrc), `${rel}: frame-src ne doit pas autoriser tout https:`);
  for (const origin of TUNER_FRAME_ORIGINS) {
    assert(frameSrc.includes(origin), `${rel}: frame-src doit autoriser ${origin}`);
  }
  const connectSrc = csp.match(/(?:^|;\s*)connect-src\s+([^;]+)/i)?.[1] || '';
  assert(connectSrc, `${rel}: directive connect-src CSP requise`);
  assert(!/(^|\s)https:(?:\s|$)/.test(connectSrc), `${rel}: connect-src ne doit pas autoriser tout https:`);
  assert(!/(^|\s)wss:(?:\s|$)/.test(connectSrc), `${rel}: connect-src ne doit pas autoriser tout wss:`);
  for (const origin of CONNECT_ORIGINS) {
    assert(connectSrc.includes(origin), `${rel}: connect-src doit autoriser ${origin}`);
  }
}
// Pages avec lecteur natif : sans media-src https:, les flux radio sont bloqués
// par default-src 'self' (silence au play sur SEO / feeds).
for (const rel of ['index.html', 'feeds.html', 'radios/chyz/index.html', 'scripts/seo-pages-lib.js']) {
  const text = readFileSync(join(root, rel), 'utf8');
  assert(
    /media-src[^;\n]*https:/.test(text) || /media-src[\s\S]{0,80}https:/.test(text),
    `${rel}: media-src https: requis pour les flux radio`,
  );
}
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

// Hub sports « Sports Étudiants » : scores RSEQ + filtres, lien de pied de page.
// « Sports » seul en section (menu, pied, infobulle du mât), « Sports Étudiants »
// en titre visuel et nom d'app — plus de capitales criées.
for (const hub of ['sports/index.html', 'en/sports/index.html']) {
  assert(existsSync(join(root, hub)), `${hub} manquant — lancer \`npm run seo:update\``);
}
assert(
  /<a href="sports\/" data-sports-reset[^>]*>Sports<\/a>/.test(indexHtml),
  'index.html : footer /sports/ libellé « Sports » (focus-group footer, pas le nom long)'
);
assert(
  /href="sports\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(indexHtml)
    || /href="sports\/"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/.test(indexHtml),
  'index.html : lien Sports en nouvel onglet (préserve la radio)'
);
assert(
  /<h1 class="seo-title"[^>]*>[\s\S]*?Sports collégiaux et universitaires du Québec/.test(readFileSync(join(root, 'sports/index.html'), 'utf8')),
  'sports/index.html : H1 = « Sports collégiaux et universitaires du Québec »'
);
assert(
  !/<p class="seo-lead">/.test(readFileSync(join(root, 'sports/index.html'), 'utf8')),
  'sports/index.html : pas de seo-lead'
);
assert(
  /class="site-sections"[\s\S]*?<a href="\.\/"[^>]*>Accueil<\/a>/.test(indexHtml),
  'index.html : menu de sections commence par Accueil'
);
const sportsHub = readFileSync(join(root, 'sports/index.html'), 'utf8');
assert(sportsHub.includes('data-sports-board'), 'sports : racine filtrable requise');
assert(sportsHub.includes('data-filter-sport="football"'), 'sports : filtre football requis');
assert(sportsHub.includes('data-filter-period="live"'), 'sports : filtre En cours requis');
assert(sportsHub.includes('class="sports-panel"'), 'sports : panneaux d’équipes requis');
assert(sportsHub.includes('sports-board.js'), 'sports : script de filtres requis');
assert(sportsHub.includes('À venir'), 'sports : lignes prochain match requises');
assert(
  /sports-board-meta[\s\S]*?<time[^>]+datetime="\d{4}-\d{2}-\d{2}T/.test(sportsHub),
  'sports : horodatage exact (date + heure) requis dans la méta',
);
assert(
  !/colligés à partir des calendriers officiels/.test(sportsHub),
  'sports : note sources longue retirée (inutile)',
);
assert(sportsHub.includes('data-sports-tools'), 'sports : outils flottants (haut + loupe) requis');
assert(sportsHub.includes('id="sports-scroll-top"'), 'sports : flèche haut de page requise');
assert(sportsHub.includes('id="sports-search-toggle"'), 'sports : loupe de recherche requise');
assert(sportsHub.includes('data-search='), 'sports : index data-search sur les panneaux requis');
// Sigles d'équipes (THE, SL, OUT, LAF…) : codes RSEQ, pas des mots. Sans garde,
// la traduction (translate.js ou celle du navigateur) rend « THE » par « LE ».
for (const hub of ['sports/index.html', 'en/sports/index.html']) {
  const markup = readFileSync(join(root, hub), 'utf8');
  const codes = [...markup.matchAll(/<span class="sports-panel__code([^"]*)"([^>]*)>/g)];
  assert(codes.length > 0, `${hub} : sigles d'équipe requis`);
  for (const [, classes, attrs] of codes) {
    assert(
      /\bnotranslate\b/.test(classes) && /\btranslate="no"/.test(attrs),
      `${hub} : sigle d'équipe à protéger de la traduction (notranslate + translate="no")`
    );
  }
}
// Puces sports du mât (app.js) : même garde sur le sigle et l'adversaire.
const appSource = readFileSync(join(root, 'app.js'), 'utf8');
for (const chip of appSource.match(/<span class="sports-chip__code[^>]*>/g) || []) {
  assert(
    /\bnotranslate\b/.test(chip) && /\btranslate="no"/.test(chip),
    'app.js : sigle de puce sports à protéger de la traduction (notranslate + translate="no")'
  );
}

// Les fiches station portent l'ancre visée par « À l'antenne » (app.js).
const ckutPage = readFileSync(join(root, 'radios/ckut/index.html'), 'utf8');
assert(
  /<section class="seo-section" id="horaire"[^>]*data-schedule-station="ckut"/.test(ckutPage),
  'radios/ckut/index.html : ancre #horaire et identifiant de station requis (cible de nowAirSchedulePath)'
);
// La grille n'est plus tronquée : CKUT compte une centaine de créneaux.
assert(
  (ckutPage.match(/<li><time|<li[^>]*><time/g) || []).length >= 60,
  'radios/ckut/index.html : grille hebdomadaire tronquée — scheduleTable ne doit plus couper à 8 créneaux/jour'
);
// Ordre lundi → dimanche : sur cinq colonnes, la semaine occupe la première
// rangée et le week-end la seconde. L'ordre 0-6 des données couperait samedi
// et dimanche de part et d'autre du retour à la ligne.
const ckutDays = [...ckutPage.matchAll(/<div class="seo-day[^"]*"[^>]*>\s*<h3>([^<]+)<\/h3>/g)]
  .map((m) => m[1]);
assert.deepEqual(
  ckutDays,
  ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
  `radios/ckut/index.html : ordre des jours attendu lundi→dimanche, obtenu ${ckutDays.join(', ')}`
);

// Annuaire /medias/ : compartiments stables, fraîcheur auto, liens utiles.
const mediasHub = join(root, 'medias/index.html');
if (existsSync(mediasHub)) {
  const mediasHtml = readFileSync(mediasHub, 'utf8');
  assert(mediasHtml.includes('class="seo-toc"'), 'medias : sommaire interne requis');
  assert(mediasHtml.includes('id="journaux"'), 'medias : ancre journaux requise');
  assert(mediasHtml.includes('id="radios"'), 'medias : ancre radios requise');
  assert(mediasHtml.includes('id="etablissements"'), 'medias : ancre établissements requise');
  assert(mediasHtml.includes('id="archives"'), 'medias : ancre archives requise');
  assert(mediasHtml.includes('>Français</h3>'), 'medias : sous-section journaux français requise');
  assert(mediasHtml.includes('>Anglais</h3>'), 'medias : sous-section journaux anglais requise');
  assert(mediasHtml.includes('>Universités</h3>'), 'medias : sous-section universités requise');
  assert(mediasHtml.includes('>Cégeps et collèges</h3>'), 'medias : sous-section cégeps requise');
  assert(mediasHtml.includes('Dernier article : '), 'medias : date du dernier article requise');
  assert(mediasHtml.includes('href="../horaires/"'), 'medias : lien vers les horaires requis');
  assert(mediasHtml.includes('href="../archives/"'), 'medias : lien vers les archives requis');
  // Fraîcheur : Le Collectif ou The Tribune avant un titre alphabétique type Exil.
  const frBlock = mediasHtml.match(/id="journaux"[\s\S]*?<h3>Français<\/h3>([\s\S]*?)(?:<h3>Anglais<\/h3>|<\/section>)/);
  assert(frBlock, 'medias : bloc journaux français requis');
  if (frBlock[1].includes('>Le Collectif</span>') && frBlock[1].includes('>Exil</span>')) {
    assert(
      frBlock[1].indexOf('>Le Collectif</span>') < frBlock[1].indexOf('>Exil</span>'),
      'medias : journaux FR triés par fraîcheur (Collectif avant Exil)',
    );
  }
}

// Catalogue historique : sitemap séparé, canonique local et aucune
// réattribution de la paternité des articles externes à LE-RADAR.ca.
const archiveSitemap = readFileSync(join(root, 'sitemap-archives.xml'), 'utf8');
const archiveRobots = readFileSync(join(root, 'robots.txt'), 'utf8');
assert(archiveRobots.includes('Sitemap: https://le-radar.ca/sitemap-archives.xml'), 'robots.txt : sitemap historique explicite requis');
assert(archiveSitemap.includes('<urlset'), 'sitemap-archives.xml : urlset requis');
const archiveHub = join(root, 'archives/index.html');
if (existsSync(archiveHub)) {
  const archiveHtml = readFileSync(archiveHub, 'utf8');
  assert(archiveHtml.includes('<meta name="robots" content="index,follow"'), 'archives : indexation explicite requise');
  assert(archiveHtml.includes('"@type":"CollectionPage"'), 'archives : CollectionPage requis');
  assert(archiveHtml.includes('"@type":"CreativeWork"'), 'archives : attribution externe factuelle requise');
  assert(!archiveHtml.includes('"@type":"NewsArticle"'), 'archives : LE-RADAR.ca ne doit pas devenir l’éditeur d’un article externe');
  assert(!archiveHtml.includes('<img class="seo-archive'), 'archives : image externe sans licence non republiée');
  assert(archiveHtml.includes('>Le Trait d\'Union</a>'), 'archives : Le Trait d’Union doit figurer dans l’annuaire');
  assert(!archiveHtml.includes('Catalogue expérimental'), 'archives : libellé interne superflu interdit');
  assert(!archiveHtml.includes('article vérifié'), 'archives : compteurs techniques superflus interdits');
  assert(!archiveHtml.includes('Consulter les autres archives par publication'), 'archives : catégories internes superflues interdites');
  assert(archiveHtml.includes('aria-current="page">Archives</span>'), 'archives : fil d’Ariane « Archives » (sans « historiques ») requis');
  assert(!archiveHtml.includes('Archives historiques'), 'archives : libellé « Archives historiques » superflu interdit');
  assert(archiveHtml.includes('Dernier article : '), 'archives : date du dernier article par publication requise');
  // L’annuaire suit la fraîcheur éditoriale, pas l’ordre alphabétique.
  const pubBlock = archiveHtml.match(/<ul class="seo-archive-sources">([\s\S]*?)<\/ul>/);
  assert(pubBlock, 'archives : liste des publications requise');
  if (pubBlock[1].includes('>Exil</a>') && pubBlock[1].includes('>The Tribune</a>')) {
    assert(
      pubBlock[1].indexOf('>The Tribune</a>') < pubBlock[1].indexOf('>Exil</a>'),
      'archives : The Tribune (plus récent) avant Exil requis',
    );
  }
  const laGifleArchive = join(root, 'archives/la-gifle/index.html');
  if (existsSync(laGifleArchive)) {
    const gifleHtml = readFileSync(laGifleArchive, 'utf8');
    assert(gifleHtml.includes('Collège Lionel-Groulx'), 'archives La Gifle : établissement requis');
    assert(gifleHtml.includes('<dt>Langue</dt>'), 'archives La Gifle : fiche langue requise');
    assert(gifleHtml.includes('>Français<'), 'archives La Gifle : langue Française requise');
    assert(!gifleHtml.includes('Une sélection d’articles de La Gifle, avec leur date'), 'archives La Gifle : chapeau générique superflu interdit');
    assert(gifleHtml.includes('Archives</a>'), 'archives La Gifle : fil d’Ariane parent « Archives » requis');
  }
}

// La <h1> hérite sinon de la marge par défaut du navigateur → mât décadré.
const styleCss = readFileSync(join(root, 'style.css'), 'utf8');
assert(
  /\.wordmark-mark \{[^}]*margin: 0;/.test(styleCss),
  'style.css : .wordmark-mark doit neutraliser la marge (<h1>)'
);
assert(styleCss.includes('--status-live-soft: #ff7d6e'), 'style : coral EN ONDES partagé requis');
assert(styleCss.includes('--status-upcoming-soft: #e8c07a'), 'style : ambre À venir partagé requis');
assert(
  styleCss.includes('@keyframes eq-buffer')
    && styleCss.includes('.tuner.is-buffering .tuner-eq span')
    && /is-buffering \.tuner-eq span \{[^}]*var\(--live/.test(styleCss.replace(/\s+/g, ' ')),
  'style : EQ rouge live en buffering bureau (animation eq-buffer)',
);
// Mobile : ne pas forcer l’EQ en buffering (parité kiosque — spinner play suffit).
assert(
  !/\.tuner\.is-buffering \.tuner-eq\s*\{\s*display:\s*flex/.test(styleCss.replace(/\s+/g, ' ')),
  'style : .tuner.is-buffering ne doit pas forcer display:flex sur .tuner-eq (mobile)',
);
// Invitation PWA : carte au-dessus des FABs bas (loupe + flèche), pas collée à bottom:0.
assert(
  /\.engage-prompt\s*\{[^}]*top:\s*max\(12px/.test(styleCss.replace(/\s+/g, ' ')),
  'style : .engage-prompt ancré en haut (focus-group engage-position A)',
);
assert(
  appJs.includes('initPullToRefresh') && styleCss.includes('radar-pull-refresh'),
  'pull-to-refresh PWA soft news requis',
);
assert(styleCss.includes('sports-chip-rim-glow'), 'contour accent puces scores requis');
// CTA au repos : même famille visuelle que les scores (plus d’ardoise grise orpheline).
assert(
  styleCss.includes('.sports-chip--cta:not([data-cta-state="live"])'),
  'style : pulse rim-glow aussi sur la CTA hors direct',
);
assert(
  appJs.includes('function sportsCtaTone'),
  'app.js : teinte CTA = sport du match (pas ardoise fixe hors idle)',
);
assert(
  /\.engage-prompt\s*\{[^}]*z-index:\s*200/.test(styleCss.replace(/\s+/g, ' ')),
  'style : .engage-prompt z-index au-dessus de .page-tools (180)',
);
// « Plus de sources » : parité kiosque .nav-toggle (padding 8px 12px).
assert(
  /\.filters-toggle,\s*\.filters-compact\s*\{[^}]*padding:\s*8px 12px/.test(styleCss.replace(/\s+/g, ' ')),
  'style : .filters-toggle padding 8px 12px (parité kiosque rubriques)',
);
assert(
  /\.news-tail-toggle\s*\{[^}]*padding:\s*8px 12px/.test(styleCss.replace(/\s+/g, ' ')),
  'style : .news-tail-toggle padding 8px 12px (parité Plus de sources)',
);
// CTA mât — focus-group le-radar-sports-first-glance / -cta-sports-motion /
// -cta-sports-rhythm / -cta-sports-badge. Registre d'alerte réservé au direct,
// roulement vertical, rotation seulement là où on peut l'arrêter.
const appFlat = appJs.replace(/\s+/g, ' ');
const cssFlat = styleCss.replace(/\s+/g, ' ');

assert(
  /const RADAR_BRAND_SHORT\s*=\s*['"]LE-RADAR\.ca['"]/.test(appJs)
    && appJs.includes('RADAR_BRAND_LONG')
    && appJs.includes('sports-chip__cta-tag--brand'),
  'app.js : CTA creux = logo PWA + LE-RADAR.ca + nom long',
);
assert(
  /site-foot__signature notranslate/.test(readFileSync(join(root, 'scripts/seo-pages-lib.js'), 'utf8'))
    && /site-foot__signature notranslate/.test(readFileSync(join(root, 'index.html'), 'utf8')),
  'nom long LE-RADAR : notranslate (pied + gabarit)',
);
assert(
  /const SPORTS_CTA_TAG_LIVE\s*=\s*['"]En cours['"]/.test(appJs)
    && appJs.includes('function sportsCtaTagLabel'),
  'app.js : pastille CTA = En cours / Hier / Aujourd’hui / Sports',
);
// Voyant CTA : CSS persistant (pas un span JS, pas lié à la radio).
assert(
  !/dot\.className = 'sports-chip__cta-live'/.test(appJs),
  'app.js : plus de point live JS — le voyant est le ::before CSS',
);
assert(
  !/chev\.className = 'sports-chip__cta-chev'/.test(appJs)
    && !/chev\.textContent = '→'/.test(appJs),
  'app.js : plus de flèche → sur la CTA sports (place au texte)',
);
assert(
  !/data-radar-playing="1"[^{]*sports-chip__cta-tag::before/.test(cssFlat)
    && !/tuner\.is-playing\s*~[^{]*sports-chip__cta-tag::before/.test(cssFlat)
    && /\.sports-chip__cta-tag::before/.test(cssFlat)
    && /onairPulse/.test(styleCss)
    && /sports-cta-dot-upcoming/.test(styleCss)
    && /sports-cta-dot-past/.test(styleCss)
    && /data-cta-lamp="past"/.test(styleCss)
    && appJs.includes('function sportsCtaLamp'),
  'style : voyant CTA ambre Prochain, rouge Aujourd’hui, vert passé',
);
assert(
  /data-cta-lamp="past"[^{]*\{[^}]*background:\s*#3d9a6a/.test(cssFlat)
    && /data-cta-lamp="today"[^{]*\{[^}]*background:\s*#c8102e/.test(cssFlat)
    && /data-cta-lamp="next"[^{]*\{[^}]*background:\s*#f5d000/.test(cssFlat)
    && /cta-tag:not\(\.sports-chip__cta-tag--brand\)[^{]*\{[^}]*width:\s*max-content/.test(cssFlat)
    && !/cta-tag:not\(\.sports-chip__cta-tag--brand\)[^{]*\{[^}]*min-width:\s*8rem/.test(cssFlat)
    && /sports-chip__cta-tag-lines[^{]*\{[^}]*flex-direction:\s*column/.test(cssFlat)
    && /grid-template-columns:\s*auto minmax\(4\.25rem, 1fr\)/.test(cssFlat)
    && /\[data-cta-state="live"\][^{]*\.sports-chip__cta-tag[^{]*\{[^}]*background:\s*#c8102e/.test(cssFlat),
  'style : pastilles collées au libellé (pas de rail 8 rem) ; Prochain match 2 lignes ; glyphe 390 pas coupé',
);
{
  const wideCss = readFileSync(join(root, 'dev/wide-desktop-preview.css'), 'utf8');
  assert(
    appJs.includes('function liveCopyFromPhases')
      && appJs.includes('function composedAirPhases')
      && /tuner-wide-slot__title[\s\S]*?white-space:\s*nowrap/.test(wideCss)
      && /tuner-wide-slot__title[\s\S]*?text-overflow:\s*clip/.test(wideCss)
      && /hideLive:\s*!hasLive/.test(appJs)
      && /min-width:\s*8rem/.test(wideCss)
      && !/tuner-wide-slot--next[\s\S]{0,80}max-width:\s*20rem/.test(wideCss),
    'antenne : 2 lignes, titre entier en wide (pas d’ellipse, pas de wrap)',
  );
  const expandedStack = (wideCss.match(
    /\.wide-rail-stack:has\(\.filters-panel\.is-expanded\)\s*\{[^}]+\}/,
  ) || [''])[0];
  assert(
    /height:\s*calc\(100dvh - var\(--wide-stack-from-top/.test(expandedStack)
      && !/height:\s*auto/.test(expandedStack),
    'wide E : rail ouvert en hauteur réelle (pas height:auto → trou sous Réduire)',
  );
  const expandedFilters = (wideCss.match(
    /\.filters-panel\.is-expanded \.filters\s*\{[^}]+\}/,
  ) || [''])[0];
  assert(
    /max-height:\s*none\s*!important/.test(expandedFilters),
    'wide E : liste ouverte sans plafond --filters-rail-avail (flex jusqu’en bas)',
  );
  assert(
    /const keepWideOpen = !!\(filtersExpanded && isWideRailFiltersActive\(\)\)/.test(appJs)
      && /has-overflow',\s*overflow \|\| keepWideOpen/.test(appJs),
    'wide E : Réduire reste si le rail était ouvert (scroll ne referme pas)',
  );
  assert(
    appJs.includes('function clearWideRailFiltersFit')
      && appJs.includes("removeProperty('--filters-collapsed-h')")
      && appJs.includes("removeProperty('--filters-peek')")
      && /FILTERS_TOGGLE\.style\.removeProperty\('align-self'\)/.test(appJs)
      && /if \(isWideRailFiltersActive\(\)\) \{\s*return syncWideRailFiltersFit/.test(appJs.replace(/\s+/g, ' ')),
    'wide E → bureau : retirer hauteur rail et largeur pilule (sinon toutes les sources restent visibles)',
  );
}
assert(
  styleCss.includes('.news-list:not([data-ready]) > .article')
    && appJs.includes("NEWS_LIST.dataset.ready = '1'")
    && indexHtml.includes('.news-list:not([data-ready]) > .article'),
  'fil : prerendu SEO masqué jusqu’au magazine (squelette + noscript)',
);
assert(
  appJs.includes('function markUiReady')
    && styleCss.includes('.masthead-weather:not([data-ready])')
    && styleCss.includes('.filters-panel:not([data-ready])')
    && styleCss.includes('.masthead-sports-strip[hidden]:not(.is-empty)'),
  'chrome : météo / sports / sources réservés puis révélés (anti-CLS)',
);
assert(
  /--ui-reveal-ms:\s*280ms/.test(styleCss)
    && /transition:\s*opacity var\(--ui-reveal-ms\)/.test(styleCss),
  'chrome : fondu d’apparition court (pas de délai réseau)',
);
{
  const photoCss = readFileSync(join(root, 'style-masthead.css'), 'utf8');
  assert(
    /\[aria-current="page"\]:not\(\.masthead-home\)/.test(styleCss)
      && !/\.masthead-home\.is-active\s*,/.test(styleCss)
      && !photoCss.includes('.masthead-home[aria-current="page"]')
      && /masthead-home:active/.test(styleCss)
      && /masthead-home:active/.test(photoCss),
    'mât : Accueil sans fond mauve au repos ; mauve seulement au pressé',
  );
}
assert(
  appJs.includes('function sportsGameIsLive')
    && appJs.includes('function sportsCtaState')
    && appJs.includes('SPORTS_LIVE_VISUAL_LEAD_MS')
    && appJs.includes('SPORTS_LIVE_VISUAL_TAIL_MS')
    && appJs.includes('function sportsGameHasScore')
    && appJs.includes('function sportsCtaLiveSources')
    && appJs.includes('function sportsCtaHoldOnLive')
    && /const lives = sportsCtaLiveSources\(now\)/.test(appJs)
    && appJs.includes('function pollLiveSportsJson')
    && /const SPORTS_LIVE_POLL_MS\s*=\s*15000/.test(appJs)
    && appJs.includes("if (state === 'live')"),
  'app.js : direct = pastille En cours + score collé + sondage sports.json aux 15 s',
);
assert(
  /const lives = sportsCtaLiveSources\(now\);\s*if \(lives\.length\)/.test(appFlat)
    && appJs.includes('sportsCtaHoldOnLive(sportsVisible[slot])')
    && appJs.includes('sportsCtaHoldOnLive(slide)'),
  'app.js : CTA live exclusive — pool = directs ; 1 figé / plusieurs en cycle ; sinon cycle normal',
);
assert(
  !/state === 'live'[\s\S]{0,200}sportsRelativeAge/.test(appFlat)
    && !/state === 'live'[\s\S]{0,200}sportsRelativeWhen/.test(appFlat)
    && appJs.includes('sportsLivePeriodLabel')
    && appJs.includes('function sportsKickoffClock'),
  'app.js : sous-ligne live = période / compétition (pas « il y a 2 min »)',
);
assert(
  /\[data-cta-state="live"\][^{]*\{[^}]*sports-cta-ring-pulse/.test(cssFlat),
  'style : le halo de la CTA ne pulse que pendant un match en cours',
);
assert(
  /\[data-cta-state="live"\][^{]*\.sports-chip__cta-tag[^{]*\{[^}]*sports-cta-tag-pulse/.test(cssFlat),
  'style : la pastille ne pulse que pendant un match en cours',
);
assert(
  /sports-cta-ring-pulse/.test(styleCss) && /sports-cta-tag-pulse/.test(styleCss),
  'style : halo et badge de la CTA sports gardent leur pulsation (en direct)',
);
// Le fondu croisé superposait deux textes de longueurs différentes à mi-opacité :
// illisible pendant ~250 ms. Le roulement ne montre jamais qu'une accroche.
assert(
  !appJs.includes('crossfadeSportsCtaLabel') && !appJs.includes('SPORTS_CTA_CROSSFADE_MS'),
  'app.js : plus de fondu croisé sur l\'accroche CTA (verdict le-radar-cta-sports-motion)',
);
assert(
  appJs.includes('function sportsCtaMayRotate')
    && appJs.includes('SPORTS_CTA_ROTATE_MEDIA')
    && /const SPORTS_CTA_DWELL_MS\s*=\s*12000/.test(appJs)
    && appJs.includes('sportsCtaPaused'),
  'app.js : rotation CTA (~12 s), au pointeur fin seulement, en pause au survol',
);
// Régression 2026-08-11 : SPORTS_CTA_ROTATE_MEDIA était déclaré *après* le
// matchMedia(…) top-level → TDZ avalée par try/catch → mq null → CTA figée.
{
  const rotMediaIdx = appJs.indexOf("const SPORTS_CTA_ROTATE_MEDIA");
  const mqInitIdx = appJs.indexOf('matchMedia(SPORTS_CTA_ROTATE_MEDIA)');
  assert(
    rotMediaIdx >= 0
      && mqInitIdx >= 0
      && rotMediaIdx < mqInitIdx,
    'app.js : SPORTS_CTA_ROTATE_MEDIA déclaré avant matchMedia (pas de TDZ → CTA figée)',
  );
}
// Le marqueur temporel et la fraîcheur sont rendus dans la carte : title seul
// est invisible au doigt (garde-fous marqueur-non-tronque et fraicheur-visible).
assert(
  appJs.includes('sports-chip__cta-eyebrow')
    && appJs.includes('sports-chip__cta-sub')
    && appJs.includes('function sportsUpdatedShort')
    && appJs.includes('function sportsRelativeWhen')
    && appJs.includes('function sportsResultBadgeEl')
    && appJs.includes('function sportsPlaceOrdinal')
    && appJs.includes('function sportsPlaceScoreText')
    && /sports-chip__badge--place/.test(styleCss)
    && appJs.includes('function sportsWhenWord'),
  'app.js : CTA sous-ligne relatif + V/D/N match + médaille podium + mot de temps puces',
);
assert(
  appJs.includes('function sportsCtaResultIsTodayOrYesterday')
    && !appJs.includes('function sportsCtaResultIsRecent')
    && appJs.includes('function sportsCivilDayShift')
    && appJs.includes('SPORTS_RECENT_RESULT_MS')
    && !/SPORTS_CTA_FRESH_RESULT_MS\s*=\s*48/.test(appJs),
  'app.js : CTA résultats = aujourd’hui/hier seulement (7 j = puces scores)',
);
assert(
  /function sportsCtaEyebrow/.test(appJs)
    && /function sportsCtaTagLabel/.test(appJs)
    && appJs.includes('function sportsCtaResultTag')
    && appJs.includes("return 'Hier'")
    && appJs.includes("SPORTS_CTA_TAG_NEXT")
    && appJs.includes("SPORTS_CTA_TAG_SOON")
    && appJs.includes("SPORTS_CTA_TAG_TOMORROW")
    && appJs.includes('function sportsCtaGameIsToday')
    && appJs.includes('function sportsCtaGameIsTomorrow')
    && /data-cta-lamp="soon"[^{]*\{[^}]*sports-cta-ring-pulse/.test(cssFlat)
    && appJs.includes('function fillSportsCtaTagCopy')
    && appJs.includes("return 'Aujourd’hui'")
    && appJs.includes("return 'Avant-hier'")
    && !/return 'Reprise'/.test(appJs)
    && !appJs.includes('function sportsHasAnyResult'),
  'app.js : pastille Prochain match (2 lignes)/Hier/Aujourd’hui/date — plus de SPORTS+eyebrow',
);
// CTA pool = aujourd’hui/hier + (en saison jour lead | hors saison 1er match × 7 j).
assert(
  appJs.includes('function sportsCtaLeadDayKey')
    && appJs.includes('function sportsSlideDayKey')
    && /const SPORTS_CTA_MAX_POOL\s*=\s*16/.test(appJs)
    && /const SPORTS_CTA_OFFSEASON_LEAD_DAYS\s*=\s*7/.test(appJs)
    && appJs.includes('firstByDay')
    && appJs.includes('le-radar-cta-sports-window'),
  'app.js : CTA = today/yesterday + hors saison 7 j (1er match/jour)',
);
assert(
  !appJs.includes('upcomingLater'),
  'app.js : plus de filet multi-jours upcomingLater dans le pool CTA',
);

// Fraîcheur des articles : jour civil québécois, pas une fenêtre de minutes.
// Le fil publie par à-coups ; une fenêtre de 2 h laissait la quasi-totalité des
// parutions du jour en gris, ce qu'elle était censée signaler.
assert(
  /const fresh = d \? torontoDayKey\(d\) === torontoDayKey\(\) : false;/.test(appJs),
  'app.js : la date rouge couvre toute la journée civile (torontoDayKey), pas 120 min',
);
// La pastille pulse ne doit pas être masquée sur En bref / vedettes / mobile :
// seules les dates non-fraîches perdent le point gris (::before).
assert(
  styleCss.includes('.article-time.is-fresh::before')
    && /display:\s*inline-block/.test(
      (styleCss.match(/\.article-time\.is-fresh::before\s*\{[^}]+\}/) || [''])[0],
    )
    && styleCss.includes('.article-time:not(.is-fresh)::before')
    && !/\.article-time::before\s*\{\s*display:\s*none/.test(styleCss)
    && !/\.article--compact \.article-time::before\s*\{\s*display:\s*none/.test(styleCss),
  'style : pastille rouge is-fresh visible partout ; display:none seulement sur :not(.is-fresh)',
);

assert(
  appJs.includes('sports-chip__cta-stack')
    && appJs.includes('sportsDedupeMatchSlides')
    && appJs.includes('sportsMatchDedupeKey')
    && appJs.includes('sportsSoftSportDiversity')
    && !/CTA : carte stable — roulement/.test(appJs)
    && /if \(animate && !sportsReducedMotion\) a\.classList\.add\('is-arriving'\)/.test(appJs),
  'app.js : CTA = dédup matchs + même leave/arrive carte entière que les scores',
);
assert(
  styleCss.includes('sports-chip__cta-stack')
    && styleCss.includes('@keyframes sports-chip-leave')
    && styleCss.includes('@keyframes sports-chip-arrive')
    && /\.sports-chip--cta\.is-leaving/.test(cssFlat)
    && /\.sports-chip--cta\.is-arriving/.test(cssFlat),
  'style : CTA rejoue sports-chip-leave / sports-chip-arrive (carte entière)',
);
// Roulement et marquee vivent sur deux nœuds : translateY sur la couche,
// translateX sur le texte. Sur le même nœud, ils se marchaient dessus.
assert(
  /\.sports-chip__cta-label\.is-front:not\(\.is-rolling-out\) \.sports-chip__cta-text/.test(cssFlat),
  'style : le marquee CTA porte sur le texte, pas sur la couche qui roule',
);
// Sous-ligne CTA (date · compétition · MAJ) : viewport + texte, marquee si overflow.
// Ancien bug : white-space:nowrap sur toute la .cta-label → une ligne ellipsée
// figée sans is-overflowing dès que le titre tenait.
assert(
  appJs.includes('sports-chip__cta-sub-text')
    && appJs.includes('is-sub-overflowing')
    && appJs.includes('--sports-scroll-sub')
    && styleCss.includes('sports-chip__cta-sub-text')
    && styleCss.includes('@keyframes sports-chip-scroll-sub')
    && styleCss.includes('is-sub-overflowing')
    && !/\.sports-chip--cta:not\(\.is-overflowing\)[^{]*\.sports-chip__cta-label\s*\{[^}]*white-space:\s*nowrap/.test(cssFlat),
  'CTA : sous-ligne marqueable ; pas d’ellipse nowrap sur toute la couche label',
);
// Règle dure le-radar : jamais text-overflow:ellipsis sur les textes qui
// défilent (scores, titre CTA, sous-ligne). Overflow → marquee L→R, sinon clip.
// (On ignore les commentaires CSS : un « Interdit : ellipsis » ne doit pas
// faire rougir l’assert.)
{
  const stripCssComments = (block) => block
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const sportsTextBlocks = [
    ...styleCss.matchAll(/\.sports-chip__line-inner\s*\{[^}]*\}/g),
    ...styleCss.matchAll(/\.sports-chip__sub-text\s*\{[^}]*\}/g),
    ...styleCss.matchAll(/\.sports-chip__cta-text\s*\{[^}]*\}/g),
    ...styleCss.matchAll(/\.sports-chip__cta-sub-text\s*\{[^}]*\}/g),
  ].map((m) => stripCssComments(m[0]));
  assert(
    sportsTextBlocks.length >= 3
      && sportsTextBlocks.every((block) => !/text-overflow\s*:\s*ellipsis/.test(block)),
    'style : aucun text-overflow:ellipsis sur line-inner / sub-text / cta-text / cta-sub-text',
  );
}
// Puces scores 2 lignes : noms + date·compétition ; focus-group A :
// jamais marquee scores (fit −1 puce) ; CTA garde marquee ; 0 ellipsis.
assert(
  appJs.includes('sports-chip--match')
    && appJs.includes('sports-chip__body')
    && appJs.includes('sports-chip__sub-text')
    && appJs.includes('sportsPlainTeamName')
    && appJs.includes('sportsChipTeamShort')
    && appJs.includes('sportsPlaceEventShort')
    && appJs.includes('function sportsMatchVerb')
    && appJs.includes('function sportsMatchSubLine')
    && appJs.includes('function sportsCompetitionLabel')
    && appJs.includes('function sportsCollegialCityDisambig')
    && appJs.includes('SPORTS_COLLEGIAL_CITY_DISAMBIG')
    && appJs.includes('Cégep Trois-Rivières')
    && appJs.includes('Cégep Rimouski')
    && appJs.includes("'reçoit'")
    && appJs.includes("'chez'")
    && appJs.includes('sportsDisplaySideName')
    && appJs.includes('sportsChipOpponentLabel')
    && appJs.includes('sportsLookupInstitutionAcronym')
    && appJs.includes('SPORTS_UNI_CODE_ACRONYM')
    && appJs.includes('preferAcronym')
    && appJs.includes('SPORTS_TEAM_COLOR_SUFFIX_RE')
    && styleCss.includes('.sports-chip__vs')
    && styleCss.includes('.sports-chip--cta .sports-chip__cta-text .sports-chip__vs')
    && /\.sports-chip__vs\s*\{[^}]*font-weight:\s*500/.test(cssFlat)
    && /\.sports-chip--cta \.sports-chip__cta-text \.sports-chip__vs\s*\{[^}]*rgba\(255,\s*255,\s*255,\s*0\.52\)/.test(cssFlat)
    && styleCss.includes('.sports-chip__cta-glyph')
    && appJs.includes('sports-chip__cta-glyph')
    && appJs.includes('function sportsMatchChipTextOverflows')
    && appJs.includes('le-radar-sports-weather-fit')
    && indexHtml.includes('institution-acronyms-data.js')
    && /SPORTS_RECENT_RESULT_MS\s*=\s*7 \* 24 \* 3600 \* 1000/.test(appJs)
    && appJs.includes('recentResults')
    && appJs.includes('le-radar-sports-left-pool')
    && appJs.includes('function sportsTeamIsQuebecFocus')
    && appJs.includes('SPORTS_OUT_OF_PROVINCE_CODES')
    && appJs.includes("'OTT'")
    && styleCss.includes('sports-chip--match')
    && styleCss.includes('sports-chip__body')
    && styleCss.includes('.sports-chip--match .sports-chip__sub')
    // Plus de marquee CSS sur scores (seul CTA anime is-overflowing).
    && !/:not\(\.sports-chip--cta\)\.is-overflowing \.sports-chip__line-inner/.test(cssFlat)
    && !/:not\(\.sports-chip--cta\)\.is-sub-overflowing \.sports-chip__sub-text/.test(cssFlat)
    && styleCss.includes('@keyframes sports-chip-scroll')
    && styleCss.includes('@keyframes sports-chip-scroll-sub'),
  'puces scores : 2 lignes ; anti-marquee scores (FG A) ; CTA marquee ; 0 ellipsis',
);
// Jambages (j, g, y, p, q) : line-height ≥ 1.35 sous overflow:hidden
// (régression « Collège » / « jeu. » / « collégial » — même leçon que Original).
assert(
  /\.sports-chip--match \.sports-chip__line-inner\s*\{[^}]*line-height:\s*1\.35/.test(cssFlat)
    && /\.sports-chip--match \.sports-chip__sub\s*\{[^}]*line-height:\s*1\.35/.test(cssFlat)
    && /\.sports-chip__cta-eyebrow\s*\{[^}]*line-height:\s*1\.35/.test(cssFlat)
    && /\.sports-chip__cta-text\s*\{[^}]*line-height:\s*1\.35/.test(cssFlat)
    && /\.sports-chip__cta-sub\s*\{[^}]*line-height:\s*1\.35/.test(cssFlat)
    && /\.sports-chip__cta-stack\s*\{[^}]*height:\s*3\.15em/.test(cssFlat),
  'style sports : line-height 1.35 (jambages) + stack CTA 3.15em sous overflow:hidden',
);
// Puces scores : indépendantes + dwell lecture + marquee aller-retour complet.
assert(
  appJs.includes('scheduleSportsSlot')
    && appJs.includes('sportsSlotDwellMs')
    && appJs.includes('sportsLabelReadingMs')
    && appJs.includes('sportsChipNeedsMarquee')
    && /SPORTS_READ_MIN_MS\s*=\s*9000/.test(appJs)
    && /SPORTS_READ_MAX_MS\s*=\s*14000/.test(appJs)
    && /SPORTS_SCROLL_ONE_WAY_MS\s*=\s*5500/.test(appJs)
    && appJs.includes('SPORTS_SCROLL_ROUND_TRIP_MS')
    && appJs.includes('SPORTS_SCROLL_READ_DELAY_MS')
    && appJs.includes('MARQUEE_READ_DELAY_MS')
    && appJs.includes('function weatherBoardDwellMs')
    && appJs.includes('function scheduleWeatherCascade')
    && appJs.includes('function weatherCascadeSlots')
    && appJs.includes('function poolHasUncoveredSource')
    && appJs.includes('function pickBriefSidebar')
    && appJs.includes('function sportsBoardHoldMs')
    && /WEATHER_CASCADE_STEP_MS\s*=\s*440/.test(appJs)
    && /SPORTS_CASCADE_STEP_MS\s*=\s*520/.test(appJs)
    && appJs.includes('SPORTS_CHIP_LEAVE_MS')
    && /if \(!weatherCascadeSlots\(\)\.length\) return/.test(appJs)
    && !/Hors wide : une carte à la fois/.test(appJs),
  'app.js : cascade météo/sports tous écrans + marquee 1 cycle',
);
// Marquee site : alternate both + delay — jamais infinite. 2 = 1 aller-retour ;
// CTA : 4 aller-retour (noms longs), delay 0.7s ; strip 1.6s pour le dial.
assert(
  !/sports-chip-scroll[^;]*infinite/.test(cssFlat)
    && !/sports-chip-scroll-sub[^;]*infinite/.test(cssFlat)
    && !/sports-cta-scroll[^;]*infinite/.test(cssFlat)
    && /sports-cta-scroll[^;]*alternate\s+both/.test(cssFlat)
    && /--sports-scroll-delay:\s*1\.6s/.test(cssFlat)
    && /tunerMarquee[^;]*alternate\s+both/.test(cssFlat)
    && /MARQUEE_ROUND_TRIPS\s*=\s*2/.test(appJs)
    && appJs.includes('function marqueeAlternateCount'),
  'CSS/JS : marquees sports + dial = alternate both, delay 1.6s, pas infinite',
);
// Magazine mid : CSS 2 col dès 768 (iPad portrait). Le JS d'équilibre /
// graine En bref / extraits mid doit partager ce seuil — à 900 px les
// iPad 768/820/834 semaient ~10 brèves bureau sans trim (vide sous vedettes).
assert(
  /MAGAZINE_MID_MIN_PX\s*=\s*768/.test(appJs)
    && /MAGAZINE_MID_MAX_PX\s*=\s*1099\.98/.test(appJs)
    && appJs.includes('function canBalanceMagazineColumns')
    && appJs.includes('function isMidwidthMagazinePreview')
    && /@media \(min-width: 768px\) and \(max-width: 1099\.98px\)/.test(styleCss)
    && !/matchMedia\('\(min-width: 900px\) and \(max-width: 1099\.98px\)'\)/.test(appJs),
  'magazine mid : CSS + JS partagent le seuil 768 (iPad portrait, pas 900)',
);
// Focus-group le-radar-sports-weather-fit A : météo ⊥ sports ; fit largeur + overflow.
assert(
  !appJs.includes('function sportsWeatherCardCount')
    && !appJs.includes('function queueSportsWeatherParitySync')
    && appJs.includes('function sportsMatchChipTextOverflows')
    && appJs.includes('function fitSportsStripAfterPaint')
    && appJs.includes('function sportsStripCramped')
    && appJs.includes('scheduleMastheadWeatherLayout')
    && appJs.includes('function weatherRibbonOverlapsChrome')
    && appJs.includes('function weatherRibbonNeedsDrop')
    && appJs.includes('function weatherRibbonOverflowsDock')
    && appJs.includes('function shrinkWeatherSlotsToClearChrome')
    && appJs.includes('function bindMastheadWeatherLayoutWatchers')
    && appJs.includes('function clearWeatherSlotInlineStyles')
    && appJs.includes('le-radar-sports-weather-fit'),
  'app.js : FG A — sports indépendants météo ; fit overflow −1 puce ; date re-fit météo',
);
// Lab local : météo ne doit pas rester absente (CORS Worker / offline).
assert(
  appJs.includes('function isLocalWeatherLabHost')
    && appJs.includes('function weatherLabFixtureEntries')
    && appJs.includes('le-radar-weather.azdak.workers.dev'),
  'app.js : météo lab local (fixture) + Worker weather-cache',
);
// Toponymes météo : ville centre Vaudreuil-Dorion ; Manawan ≠ slug MM manawan (SK).
assert(
  appJs.includes("id: 'vaudreuil-dorion'")
    && appJs.includes("name: 'Vaudreuil-Dorion'")
    && !appJs.includes("id: 'vaudreuil-soulanges'")
    && appJs.includes("name: 'Manawan'")
    && appJs.includes("manouane/actuelle")
    && !/weatherUrl:[^,\n]*manawan\/actuelle/.test(appJs)
    && appJs.includes("name: 'Kahnawà:ke'")
    && appJs.includes('kahnawake-14/actuelle')
    && appJs.includes("nation: 'Anishinabeg'")
    && appJs.includes("nation: 'Huron-Wendat'")
    && appJs.includes("nation: 'Wolastoqiyik Wahsipekuk'"),
  'app.js : météo — Vaudreuil-Dorion + noms/liens nations (Manawan→manouane)',
);
// Worker weather — contrats prod + lab (évite panne publique).
//
// Historique 2026-08-12 : `if (cached) return cached` renvoyait le CORS d’un
// hit lab (127.0.0.1:PORT) à tout le monde → navigateurs sur le-radar.ca
// bloqués, #masthead-weather resté .hidden. Garde-fous :
//  1) CORS réappliqué par requête (corsHeaders(request) après cache.match)
//  2) jamais `return cached` nu
//  3) prod le-radar.ca dans ALLOWED_ORIGINS
//  4) lab loopback (port variable) via isLabDevOrigin / 127.0.0.1
//  5) CDN-Cache-Control: no-store (pas de cache edge origin-bound)
{
  const wxWorker = existsSync(join(root, 'workers/weather-cache/src/index.js'))
    ? readFileSync(join(root, 'workers/weather-cache/src/index.js'), 'utf8')
    : '';
  assert(wxWorker.length > 200, 'workers/weather-cache/src/index.js manquant');
  assert(
    wxWorker.includes("'https://le-radar.ca'")
      && wxWorker.includes("'https://www.le-radar.ca'"),
    'workers/weather-cache : origines prod le-radar.ca (+ www) autorisées',
  );
  assert(
    wxWorker.includes('function corsHeaders')
      && wxWorker.includes('Access-Control-Allow-Origin'),
    'workers/weather-cache : CORS explicite',
  );
  assert(
    wxWorker.includes('isLabDevOrigin')
      || wxWorker.includes('localhost|127\\.0\\.0\\.1')
      || wxWorker.includes("h === '127.0.0.1'"),
    'workers/weather-cache : lab local (localhost / 127.0.0.1, port libre)',
  );
  // Régression critique : ne jamais renvoyer la Response cache telle quelle.
  assert(
    !/\bif\s*\(\s*cached\s*\)\s*return\s+cached\s*;/.test(wxWorker),
    'workers/weather-cache : interdit « return cached » nu (poison CORS prod)',
  );
  assert(
    wxWorker.includes('cache.match')
      && /corsHeaders\s*\(\s*request\s*\)/.test(wxWorker)
      && wxWorker.includes('headers.set'),
    'workers/weather-cache : réapplique corsHeaders(request) après cache HIT',
  );
  assert(
    /CDN-Cache-Control['"]?\s*:\s*['"]no-store['"]/.test(wxWorker)
      || wxWorker.includes("'CDN-Cache-Control', 'no-store'")
      || wxWorker.includes('"CDN-Cache-Control", "no-store"')
      || wxWorker.includes("headers.set('CDN-Cache-Control', 'no-store')")
      || wxWorker.includes('CDN-Cache-Control') && wxWorker.includes('no-store'),
    'workers/weather-cache : CDN-Cache-Control no-store (pas de cache edge CORS-bound)',
  );
}
// CSP prod : connect-src doit inclure le worker météo (sinon fetch bloqué).
assert(
  indexHtml.includes('le-radar-weather.azdak.workers.dev')
    || /connect-src[^"]*le-radar-weather/.test(indexHtml),
  'index.html CSP : connect-src autorise le-radar-weather worker',
);
// Fixture lab : uniquement si host local — jamais en prod publique.
assert(
  appJs.includes('isLocalWeatherLabHost()')
    && /if\s*\(\s*!cached\s*&&\s*isLocalWeatherLabHost\s*\(\s*\)\s*\)/.test(appJs),
  'app.js : fixture météo lab seulement si isLocalWeatherLabHost (pas en prod)',
);
assert(
  styleCss.includes('--sports-scroll-duration: 5.5s')
    || styleCss.includes('--sports-scroll-duration:5.5s'),
  'style : durée marquee sports alignée sur SPORTS_SCROLL_ONE_WAY_MS (5.5s)',
);

// ── /sports/ : app installable à part entière ────────────────────────────────
//
// Le dossier est le seul dossier généré qui contient aussi des fichiers écrits
// à la main. Ces contrôles verrouillent les trois façons de casser
// l'installation sans que rien d'autre ne bronche : un manifeste incohérent,
// une icône déclarée mais absente, ou le worker racine qui reprend la portée.
{
  const manifestPath = join(root, 'sports', 'site.webmanifest');
  assert(existsSync(manifestPath), 'sports/site.webmanifest requis (app installable)');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert(manifest.id === '/sports/', 'sports : id du manifeste doit être « /sports/ »');
  assert(manifest.scope === './', 'sports : scope du manifeste doit rester relatif');
  assert(manifest.start_url === './', 'sports : start_url du manifeste doit rester relatif');
  assert(manifest.display === 'standalone', 'sports : display « standalone » requis pour installer');

  for (const icon of manifest.icons || []) {
    const iconPath = join(root, 'sports', icon.src);
    assert(existsSync(iconPath), `sports : icône déclarée introuvable — ${icon.src}`);
  }
  for (const purpose of ['any', 'maskable']) {
    assert(
      (manifest.icons || []).some((i) => (i.purpose || '').split(/\s+/).includes(purpose)),
      `sports : icône « ${purpose} » requise`,
    );
  }

  assert(existsSync(join(root, 'sports', 'sw.js')), 'sports/sw.js requis (hors ligne)');
  assert(
    existsSync(join(root, 'assets', 'emoji', 'trophy.png')),
    'assets/emoji/trophy.png requis (pastille sports + icônes PWA)',
  );

  // Sans cette exclusion, sw.js racine et sports/sw.js se disputent /sports/.
  const rootSw = readFileSync(join(root, 'sw.js'), 'utf8');
  const isolated = rootSw.match(/const ISOLATED_PATH_RE = ([^;]+);/);
  assert(isolated, 'sw.js : ISOLATED_PATH_RE introuvable');
  assert(
    /\bsports\b/.test(isolated[1]),
    'sw.js : /sports/ doit être exclu du worker racine (il a le sien)',
  );

  // Le générateur efface les dossiers qu'il reconstruit : si « sports » y
  // revenait, le manifeste, le worker et les douze icônes disparaîtraient au
  // prochain `seo:update`.
  const generator = readFileSync(join(root, 'scripts', 'generate-seo.js'), 'utf8');
  const dirs = generator.match(/const GENERATED_DIRS = \[([^\]]+)\]/);
  assert(dirs, 'generate-seo.js : GENERATED_DIRS introuvable');
  assert(
    !/'sports'/.test(dirs[1]),
    'generate-seo.js : « sports » ne doit pas être effacé (fichiers PWA écrits à la main)',
  );

  const sportsHtml = readFileSync(join(root, 'sports', 'index.html'), 'utf8');
  assert(
    /<link rel="manifest" href="site\.webmanifest"/.test(sportsHtml),
    'sports/index.html : doit déclarer son propre manifeste',
  );
  assert(
    /app-sw-register\.js/.test(sportsHtml),
    'sports/index.html : enregistrement du service worker requis',
  );
}

// ── Chrome partagé : la rangée d'actions est-elle bien la même partout ? ──────
//
// D18 : le pied de page avait déjà divergé entre pages écrites à la main et
// pages générées. La rangée d'actions passe maintenant par la même source ;
// ces contrôles empêchent qu'on la recopie de nouveau à la main.
{
  for (const rel of ['index.html', 'feeds.html']) {
    const html = readFileSync(join(root, rel), 'utf8');
    assert(
      html.includes('<!-- RADAR:CHROME:ACTIONS:START -->'),
      `${rel}: marqueurs RADAR:CHROME:ACTIONS requis (rangée d'actions partagée)`,
    );
  }
  // Date et heure du mât hors du moteur de traduction : ce sont des données,
  // formatées par Intl dans la langue active. Traduites mot à mot, elles
  // revenaient en « THURSDAY AUGUST 6, 20 » — casse fautive et longueur que
  // personne n'avait mesurée, d'où le chevauchement des pastilles d'actions.
  const withMasthead = htmlFiles.filter((f) => readFileSync(f, 'utf8').includes('id="today-date"'));
  assert(withMasthead.length > 0, 'aucune page ne porte la date du mât');
  for (const file of withMasthead) {
    const html = readFileSync(file, 'utf8');
    assert(
      /class="masthead-date[^"]*notranslate[^"]*"[^>]*translate="no"/.test(html),
      `${relative(root, file)} : la date du mât doit rester hors traduction (notranslate + translate="no")`,
    );
  }

  // Les quatre apps installables, sur toute page portant le menu.
  const withMenu = htmlFiles.filter((f) => readFileSync(f, 'utf8').includes('data-install-menu'));
  assert(withMenu.length > 0, 'aucune page ne porte le menu d’installation');
  for (const file of withMenu) {
    const rel = relative(root, file);
    const html = readFileSync(file, 'utf8');
    // Titre du panneau — focus-group le-radar-install-title (verdict B).
    // Quatre noms d'apps alignés ne disaient pas qu'on installait ; et le
    // titre porte le nom accessible du panneau, d'où aria-labelledby.
    assert(
      /<div class="install-menu__title" id="[^"]+">(Installer une app|Install an app)<\/div>/.test(html),
      `${rel} : titre « Installer une app » requis dans le panneau d’installation`,
    );
    assert(
      /data-install-panel[^>]*aria-labelledby="[^"]+-title"/.test(html),
      `${rel} : le panneau doit tirer son nom du titre visible (aria-labelledby)`,
    );
    for (const app of ['radar', 'pomo', 'solitaire', 'sports']) {
      assert(
        html.includes(`data-install-app="${app}"`),
        `${rel}: le menu d’installation doit proposer « ${app} »`,
      );
    }
    // role="menu" sans tabindex = un menu que le clavier ne peut pas parcourir.
    const items = html.match(/class="install-menu__item"[^>]*/g) || [];
    for (const item of items) {
      assert(
        /tabindex="-1"/.test(item),
        `${rel}: chaque item du menu doit porter tabindex="-1" (roving tabindex)`,
      );
    }
  }
}

console.log(`OK intégrité statique (${htmlFiles.length} pages HTML)`);

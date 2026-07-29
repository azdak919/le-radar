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

  // Le footer partagé doit rester identique à la référence visuelle : pas de
  // lien GitHub ajouté par erreur, ni de pictogramme courriel emoji.
  if (html.includes('class="site-foot"')) {
    const rel = relative(root, file);
    assert(!html.includes('Code source (GitHub)'), `${rel}: lien GitHub absent du footer requis`);
    assert(!html.includes('>✉️</a>'), `${rel}: emoji courriel interdit dans le footer`);
    assert(!html.includes('site-foot__author-mail'), `${rel}: icône courriel interdite dans le footer`);
    assert(/class="site-foot__logo"/.test(html), `${rel}: logo footer requis`);
    assert(/class="site-foot__contact"/.test(html), `${rel}: ligne de contact footer requise`);
    assert(/data-contact-channel="email"/.test(html), `${rel}: point d’entrée contact requis`);
    assert(!html.includes('>azdak-qc@proton.me</a>'), `${rel}: adresse courriel non affichée requise`);
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

const chyzPage = readFileSync(join(root, 'radios/chyz/index.html'), 'utf8');
const chyzSource = JSON.parse(readFileSync(join(root, 'radios.json'), 'utf8')).find((radio) => radio.id === 'chyz');
assert(chyzSource?.slogan && chyzSource?._sloganSource && chyzSource?._sloganEvidence, 'radio CHYZ : provenance du slogan requise');
assert(chyzPage.includes(`<h1 class="seo-title">CHYZ 94,3 FM — ${chyzSource.slogan}</h1>`), 'radio CHYZ : nom, fréquence et slogan sourcé requis en titre');
assert(chyzPage.includes('href="../../horaires/">Choisir une autre radio</a>'), 'radio CHYZ : retour aux autres horaires requis');
assert(chyzPage.includes('Dernière collecte réussie le'), 'radio CHYZ : date de collecte requise');
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
assert(/datetime="2026-05-20T/.test(laPigePage), 'journal : heure de publication machine requise');
assert(laPigePage.includes(' · '), 'journal : heure de publication visible requise');
assert(!/Crédit photo\s*:/i.test(laPigePage), 'journal : crédits photo absents des extraits SEO requis');
assert(!/Cégep de Jonquière \(Saguenay/u.test(laPigePage), 'journal : région redondante dans le chapeau interdite');
assert(laPigePage.includes('?source=La%20Pige#news-list'), 'journal : retour filtré vers tous les articles requis');
assert(laPigePage.includes('Voir les articles les plus récents'), 'journal : CTA récents requis');
assert(laPigePage.includes('Voir les archives'), 'journal : CTA archives requis');
assert(laPigePage.includes('seo-source-actions'), 'journal : rangée d’actions récents + archives requise');
assert(laPigePage.includes('href="../../archives/">Archives</a>'), 'footer : lien Archives partagé requis');
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
assert(seoPagesCss.includes('prefers-reduced-motion'), 'horaire : réduction des animations requise');
const appJs = readFileSync(join(root, 'app.js'), 'utf8');
assert(appJs.includes('syncSeoSchedulePlayback()'), 'horaire : synchronisation avec la lecture réelle requise');
assert(appJs.includes("slot.classList.toggle('seo-slot--playing'"), 'horaire : classe de lecture réelle requise');
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
assert(feedsHtml.includes('class="wordmark-logo"'), 'feeds.html : logo de marque courant requis');
assert(!feedsHtml.includes('wordmark-emoji'), 'feeds.html : ancien titre à emojis interdit');
assert(feedsHtml.includes('id="today-time"'), 'feeds.html : heure du mât requise');
const schedulesHub = readFileSync(join(root, 'horaires/index.html'), 'utf8');
assert(schedulesHub.includes('Grilles colligées automatiquement'), 'hub horaires : note au pluriel requise');

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

const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
assert(/^Sitemap:\s*https:\/\/le-radar\.ca\/sitemap\.xml$/m.test(robots), 'robots.txt : directive Sitemap requise');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
  assert(new RegExp(`^User-agent:\\s*${bot}$`, 'm').test(robots), `robots.txt : ${bot} doit être listé`);
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const engagePrompt = readFileSync(join(root, 'engage-prompt.js'), 'utf8');
assert(!/coque hors-ligne/i.test(engagePrompt), 'invitation PWA : jargon « coque » interdit');
assert(engagePrompt.includes("Ouvrir LE-RADAR.ca au démarrage ?"), 'invitation accueil : titre orienté résultat requis');
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
for (const rel of ['index.html', 'tuner-embed.html']) {
  const html = readFileSync(join(root, rel), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
  const frameSrc = csp.match(/(?:^|;\s*)frame-src\s+([^;]+)/i)?.[1] || '';
  assert(frameSrc, `${rel}: directive frame-src CSP requise`);
  assert(!/(^|\s)https:(?:\s|$)/.test(frameSrc), `${rel}: frame-src ne doit pas autoriser tout https:`);
  for (const origin of TUNER_FRAME_ORIGINS) {
    assert(frameSrc.includes(origin), `${rel}: frame-src doit autoriser ${origin}`);
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

console.log(`OK intégrité statique (${htmlFiles.length} pages HTML)`);

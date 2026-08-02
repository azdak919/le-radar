/**
 * Pertinence du visuel « à la une » — 0 réseau.
 *   · lettrine WP recollée sans souder « À cette fin » (html-entities-lib)
 *   · étiquette de genre (« Review: ») exclue des ancres thématiques
 *   · motifs `demotePathPatterns` : dernier recours, jamais disqualifiants
 * Run: node tests/lead-photo-fit.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { fixDropCapSpacing } = require('../scripts/html-entities-lib.js');
const {
  buildMatchTokens,
  detectEditorialContext,
  extractSearchQueries,
  hasNamedVisualSubject,
  matchesRequestedScene,
  scoreCandidate,
  STOCK_MIN_RETAIN_SCORE,
} = require('../scripts/stock-photo-lib.js');
const {
  imageFromArticleHtml,
  imageOptionsFromHints,
  imageRejectPatternsFromHints,
  isPathDemoted,
} = require('../scripts/article-image-lib.js');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

// ── Lettrine WP ──────────────────────────────────────────────
assert(
  fixDropCapSpacing('À cette fin, Tourisme Cantons-de-l’Est suggère')
    === 'À cette fin, Tourisme Cantons-de-l’Est suggère',
  '« À cette fin » garde son espace (majuscule = mot complet)',
);
assert(fixDropCapSpacing('L e 18 juin dernier') === 'Le 18 juin dernier', 'lettrine « L e 18 » recollée');
assert(fixDropCapSpacing("L 'identité") === "L'identité", 'lettrine + apostrophe recollée');
assert(fixDropCapSpacing('D ans la salle') === 'Dans la salle', 'lettrine « D ans » recollée');
assert(fixDropCapSpacing('A student walks') === 'A student walks', '« A student » (anglais) intact');
assert(fixDropCapSpacing('I would like') === 'I would like', '« I would » (anglais) intact');

// ── Ancrage thématique de la photo libre ─────────────────────
const recital = {
  title: 'Review: Sullivan Fortner Solo at Gesú Concert Hall',
  source: 'The McGill Daily',
  institution: 'McGill University',
  region: 'Montréal',
  lang: 'en',
  leadExcerpt: 'Seated at a Kawai grand piano, he began with a crowd favourite, '
    + '“Don’t You Worry ’Bout a Thing” by Stevie Wonder — an interpretation long-time Fortner fans knew.',
  excerpt: 'Solo jazz piano is notoriously difficult. Without a rhythm section of bass and drums, '
    + 'the pianist lacks rhythmic support or harmonic grounding.',
};
const recitalTokens = buildMatchTokens(recital);
const recitalContext = detectEditorialContext(recital);

assert(
  !recitalTokens.title.includes('review'),
  '« Review » (étiquette de genre) hors des tokens de titre',
);
assert(
  extractSearchQueries(recital).some((q) => /piano|concert hall|musician/i.test(q)),
  'requêtes visuelles musique (piano / salle de concert)',
);

const wonderWoman = scoreCandidate(
  {
    url: 'https://live.staticflickr.com/4199/34273881353_56632433e1_b.jpg',
    width: 1024,
    height: 768,
    title: 'Wonder Woman Review!',
    tags: 'wonder woman review toy figure',
    creator: 'AntMan3001',
    license: 'by-sa',
    provider: 'openverse',
  },
  recitalTokens,
  recitalContext,
);
assert(
  wonderWoman < STOCK_MIN_RETAIN_SCORE,
  `« Wonder Woman Review! » rejetée pour un récital de piano (score ${wonderWoman})`,
);

const grandPiano = scoreCandidate(
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/grand_piano_concert.jpg',
    width: 1600,
    height: 1067,
    title: 'Pianist at a grand piano during a concert',
    tags: 'piano concert pianist stage music',
    creator: 'Photographe',
    license: 'by-sa',
    provider: 'wikimedia',
  },
  recitalTokens,
  recitalContext,
);
assert(
  grandPiano >= STOCK_MIN_RETAIN_SCORE,
  `photo de piano en concert retenue (score ${grandPiano})`,
);

// Un seul mot en commun avec un titre riche = coïncidence, pas un sujet.
const singleWordFluke = scoreCandidate(
  {
    url: 'https://live.staticflickr.com/x/3138666295_e4df45785d_b.jpg',
    width: 1600,
    height: 1067,
    title: 'Raekwon . Wu-Tang Clan @ Starland Ballroom',
    tags: 'ballroom rap hip hop concert singer stage',
    creator: 'Photographe',
    license: 'by-sa',
    provider: 'openverse',
  },
  recitalTokens,
  recitalContext,
);
assert(
  singleWordFluke < STOCK_MIN_RETAIN_SCORE,
  `un seul mot en commun (« concert ») ne suffit pas (score ${singleWordFluke})`,
);

// ── Sujet visuel nommé : sinon banque campus, pas de pêche libre ──
assert(
  hasNamedVisualSubject(recital),
  'récital de piano : sujet visuel nommé (branche musique)',
);

const personalEssay = {
  title: 'Step outside… and change your life',
  source: 'The Campus',
  institution: 'Bishop’s University',
  region: 'Estrie',
  lang: 'en',
  leadExcerpt: 'I had spent months indoors, and the day I finally walked out of my '
    + 'apartment something in me shifted. The air was different, and so was I.',
};
assert(
  !hasNamedVisualSubject(personalEssay),
  'essai personnel sans sujet visuel : pas de recherche libre (repli campus)',
);

const politics = {
  title: '« La politique, c’est un sport extrême » : François Legault se confie',
  source: 'Le Délit',
  institution: 'Université McGill',
  region: 'Montréal',
  lang: 'fr',
  leadExcerpt: 'Le premier ministre du Québec revient sur ses années à la tête du '
    + 'gouvernement et sur les compromis du pouvoir.',
};
assert(
  hasNamedVisualSubject(politics),
  'personnalité politique nommée : sujet visuel (branche François Legault)',
);
assert(
  matchesRequestedScene(politics, {
    title: 'Dr Daniel Borsuk and Prime Minister François Legault',
    tags: 'quebec politics',
    url: 'https://commons.wikimedia.org/x/legault.jpg',
  }),
  'portrait de la personne : répond à la scène demandée',
);

// Écho du titre ≠ réponse à la scène demandée.
const secondClass = {
  title: 'Second-Class Citizens',
  source: 'The McGill Daily',
  institution: 'McGill University',
  region: 'Montréal',
  lang: 'en',
  leadExcerpt: 'The fight for women’s rights at McGill did not end with the first '
    + 'women graduates: every march since has been met with the same indignation.',
};
assert(
  !matchesRequestedScene(secondClass, {
    title: 'Sgt. 1st Class Lindlay Johnson (left), and Sgt. Chuck Hunter',
    tags: 'us army soldiers',
    url: 'https://commons.wikimedia.org/x/sgt.jpg',
  }),
  '« Sgt. 1st Class » ne répond pas à la scène « women rights demonstration »',
);

// ── Motifs « demote » : dernier recours, pas un rejet ─────────
const hints = {
  preferFirstContentImage: true,
  rejectPathPatterns: ['Daily\\.png'],
  demotePathPatterns: ['Screenshot-\\d{4}-\\d{2}-\\d{2}'],
};
const reject = imageRejectPatternsFromHints(hints);
const options = imageOptionsFromHints(hints);

assert(
  isPathDemoted('https://exemple.org/uploads/2026/07/Screenshot-2026-07-29-145939.png', options.demotePathPatterns),
  'motif demote reconnu sur le nom de fichier',
);
assert(
  !isPathDemoted('https://exemple.org/uploads/2026/07/concert.jpg', options.demotePathPatterns),
  'photo normale non demote',
);

const onlyScreenshot = `<article><div class="entry-content"><p>Texte de l'article assez long pour
  dépasser le seuil de contenu utile du parseur, avec un paragraphe complet.</p>
  <img width="1240" height="826" src="https://exemple.org/uploads/2026/07/Screenshot-2026-07-29-145939.png" />
  </div></article>`;
const picked = imageFromArticleHtml(onlyScreenshot, reject, options, 'https://exemple.org/a/');
assert(
  /Screenshot-2026-07-29-145939\.png$/.test(picked.url),
  'seule photo de l’article : le motif demote ne la disqualifie pas',
);

const bothImages = `<article><div class="entry-content"><p>Texte de l'article assez long pour
  dépasser le seuil de contenu utile du parseur, avec un paragraphe complet.</p>
  <img width="1240" height="826" src="https://exemple.org/uploads/2026/07/Screenshot-2026-07-29-145939.png" />
  <img width="1104" height="767" src="https://exemple.org/uploads/2026/07/image.jpeg" />
  </div></article>`;
const preferred = imageFromArticleHtml(bothImages, reject, options, 'https://exemple.org/a/');
assert(
  /image\.jpeg$/.test(preferred.url),
  'photo non demote préférée quand l’article en a une',
);

const rejected = imageFromArticleHtml(
  `<article><div class="entry-content"><p>Texte de l'article assez long pour dépasser le seuil de
   contenu utile du parseur, avec un paragraphe complet.</p>
   <img width="1240" height="826" src="https://exemple.org/uploads/2026/07/Daily.png" /></div></article>`,
  reject,
  options,
  'https://exemple.org/a/',
);
assert(!rejected.url, 'motif reject (logo Daily.png) toujours disqualifiant');

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll lead-photo-fit checks passed.');

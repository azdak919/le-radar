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
  isBannerLikeRatio,
  cardFitBonus,
  captionLooksLikeCampaignGraphic,
  compareLeadCandidates,
  stripStyleAndScript,
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

// ── Bandeau campagne vs 2e photo (Collectif / Fondation UdeS) ──
assert(isBannerLikeRatio(1139, 500), '1139×500 (campagne UdeS) = bandeau');
assert(!isBannerLikeRatio(1280, 720), '1280×720 (16:9) n’est pas un bandeau');
assert(!isBannerLikeRatio(1200, 630), '1200×630 (og:image classique) n’est pas un bandeau');
assert(cardFitBonus(1280, 720) > cardFitBonus(1139, 500), '16:9 cadre mieux que 2.28:1');
assert(
  captionLooksLikeCampaignGraphic(
    'Le slogan « Choisir de changer l’avenir » fait référence à la dernière campagne de financement',
  ),
  'légende « slogan / campagne de financement » = visuel de campagne',
);
assert(
  !captionLooksLikeCampaignGraphic(
    'Des projets comme les espaces dédiés au bien-être de toute la communauté en génie',
  ),
  'légende de photo de projet : pas un visuel de campagne',
);

const BANNER_PNG = 'https://lecollectif.ca/wp-content/uploads/2026/08/FondationUdeS_Source_UdeS.png';
const BANNER_HTML = 'https://lecollectif.ca/wp-content/uploads/2026/08/FondationUdeS_Source_UdeS-1024x450.png';
const PHOTO2 = 'https://lecollectif.ca/wp-content/uploads/2026/08/GUIDERENTREE2026_FondationUdeSphoto-2Source-Site-internet-de-lUdeS-1024x576.png';

function collectifLikeHtml({ padCss = 0, withSecond = true } = {}) {
  const css = padCss > 0 ? `<style>${'x'.repeat(padCss)}</style>` : '';
  const second = withSecond
    ? `<figure class="wp-block-image size-large">
        <img width="1024" height="576" src="${PHOTO2}" />
        <figcaption>Des projets comme les « espaces dédiés au bien-être de toute la communauté en génie » sont prévus dans les années à venir.</figcaption>
      </figure>`
    : '';
  return `<!doctype html><html><head>${css}
    <meta property="og:image" content="${BANNER_PNG}" />
    <meta property="og:image:width" content="1139" />
    <meta property="og:image:height" content="500" />
    </head><body><main><article>
    <div class="entry-content clear" data-ast-blocks-layout="true" itemprop="text">
    <p>${'Paragraphe de contenu éditorial assez long pour le parseur. '.repeat(6)}</p>
    <figure class="wp-block-image aligncenter size-large">
      <img width="1024" height="450" src="${BANNER_HTML}" />
      <figcaption>Le slogan « Choisir de changer l’avenir » fait référence à la dernière campagne de financement, visant à soutenir un total de 150 projets.</figcaption>
    </figure>
    <p>${'Autre paragraphe du corps de l’article, toujours assez long. '.repeat(6)}</p>
    ${second}
    </div></article></main></body></html>`;
}

const collectifPicked = imageFromArticleHtml(
  collectifLikeHtml(),
  [],
  {},
  'https://lecollectif.ca/campus/la-fondation-de-ludes/',
);
assert(
  /FondationUdeSphoto-2/i.test(collectifPicked.url),
  `2e photo 16:9 retenue plutôt que le bandeau campagne (got ${collectifPicked.url})`,
);

const padded = collectifLikeHtml({ padCss: 160_000 });
assert(padded.length > 160_000, 'fixture CSS > 160k (repro du plafond de parse)');
assert(
  !padded.slice(0, 150_000).includes('FondationUdeSphoto-2'),
  'sans strip, la 2e photo est au-delà de 150k',
);
const stripped = stripStyleAndScript(padded);
assert(
  stripped.includes('FondationUdeSphoto-2') && stripped.length < 20_000,
  'strip CSS/JS fait réapparaître la 2e photo sous le plafond',
);
const paddedPicked = imageFromArticleHtml(
  padded,
  [],
  {},
  'https://lecollectif.ca/campus/la-fondation-de-ludes/',
);
assert(
  /FondationUdeSphoto-2/i.test(paddedPicked.url),
  `même choix après 160k de CSS inline (got ${paddedPicked.url})`,
);

const bannerOnly = imageFromArticleHtml(
  collectifLikeHtml({ withSecond: false }),
  [],
  {},
  'https://lecollectif.ca/campus/la-fondation-de-ludes/',
);
assert(
  /FondationUdeS_Source_UdeS/i.test(bannerOnly.url),
  'seule photo = bandeau : on le garde (pas de rejet dur)',
);

const sixteenNineOg = `<!doctype html><html><head>
  <meta property="og:image" content="https://exemple.org/uploads/2026/08/concert.jpg" />
  <meta property="og:image:width" content="1600" />
  <meta property="og:image:height" content="900" />
  </head><body><article><div class="entry-content">
  <p>${'Texte de l’article assez long pour dépasser le seuil de contenu utile. '.repeat(4)}</p>
  <figure class="wp-block-image"><img width="1600" height="900" src="https://exemple.org/uploads/2026/08/concert.jpg" />
  <figcaption>Le pianiste en concert à la salle Gesú, samedi soir dernier.</figcaption></figure>
  <figure class="wp-block-image"><img width="1024" height="576" src="https://exemple.org/uploads/2026/08/coulisses.jpg" />
  <figcaption>En coulisses après le récital, les musiciens discutent.</figcaption></figure>
  </div></article></body></html>`;
const concertPick = imageFromArticleHtml(sixteenNineOg, [], {}, 'https://exemple.org/a/');
assert(
  /concert\.jpg$/.test(concertPick.url),
  `og:image 16:9 reste prioritaire s’il cadre bien (got ${concertPick.url})`,
);

assert(
  compareLeadCandidates(
    { url: 'banner', w: 1139, h: 500, score: 200, campaignGraphic: true },
    { url: 'photo', w: 1024, h: 576, score: 80 },
  ) > 0,
  'score og élevé ne bat pas une photo mieux cadrée',
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll lead-photo-fit checks passed.');

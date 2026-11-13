/**
 * Pertinence du visuel « à la une » — 0 réseau.
 *   · lettrine WP recollée sans souder « À cette fin » (html-entities-lib)
 *   · étiquette de genre (« Review: ») exclue des ancres thématiques
 *   · motifs `demotePathPatterns` : dernier recours, jamais disqualifiants
 * Run: node tests/lead-photo-fit.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
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
  isCandidateImageUrl,
  listArticleImageCandidates,
  meetsArticleKeepSize,
  meetsLeadDisplaySize,
  cardFitBonus,
  captionLooksLikeCampaignGraphic,
  compareLeadCandidates,
  stripStyleAndScript,
  needsImageEnrichment,
  imageUrlLooksBannerLike,
  clearMirroredLead,
  articleImageIsValidOnPage,
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
assert(
  meetsLeadDisplaySize(8064, 1850),
  'Georges-Cabana 8064×1850 (crop 3:2) reste une photo de une',
);
assert(
  !meetsLeadDisplaySize(9600, 1800),
  'ratio ≈ 5,33 : le crop ne garde plus la façade',
);
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
assert(
  imageUrlLooksBannerLike(BANNER_HTML),
  'URL WordPress -1024x450 reconnue bandeau sans probe',
);
assert(
  !imageUrlLooksBannerLike(PHOTO2),
  'URL WordPress -1024x576 (16:9) n’est pas un bandeau',
);
assert(
  needsImageEnrichment({ link: 'https://lecollectif.ca/campus/la-fondation-de-ludes/', image: BANNER_HTML }),
  'bandeau déjà en cache → re-scraper le corps',
);
assert(
  needsImageEnrichment({
    link: 'https://lecollectif.ca/campus/la-fondation-de-ludes/',
    image: BANNER_PNG,
    leadImageReady: false,
  }),
  'leadImageReady false (bandeau full-size) → re-scraper',
);
{
  const sticky = {
    image: BANNER_PNG,
    imageLocal: 'assets/news-images/fab5440fb7fab137.png',
    imageLocalKey: 'fab5440fb7fab137',
  };
  clearMirroredLead(sticky);
  assert(!sticky.imageLocal, 'changer d’URL source vide le miroir local du bandeau');
}
{
  const ensureSrc = readFileSync(new URL('../scripts/ensure-lead-images.js', import.meta.url), 'utf8');
  assert(
    ensureSrc.includes('bannerHeroes') && ensureSrc.includes('clearMirroredLead'),
    'ensure-lead-images : unes bandeau avant la file « sans photo »',
  );
}

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

// ── Pub in-article (Le Collectif / Antidote) vs photo éditoriale courte ──
const ANTIDOTE = 'https://lecollectif.ca/wp-content/uploads/2026/09/antidote-banniere-JLC-1920x1005_2026@2x-scaled.jpg';
const AGENDA = 'https://lecollectif.ca/wp-content/uploads/2026/09/pub_agenda_lecollectif.png';
const DSM = 'https://lecollectif.ca/wp-content/uploads/2026/09/SOCIETE_DSM_SourceJessicaWeinkle.jpg';
const collectifAdHtml = `<!doctype html><html><head>
  <meta property="og:image" content="${DSM}" />
  <meta property="og:image:width" content="540" />
  <meta property="og:image:height" content="438" />
  </head><body><main><article><div class="entry-content">
  <p>${'Les manuels du DSM servent à classer et décrire les troubles. '.repeat(4)}</p>
  <figure class="wp-block-image"><img width="540" height="438" src="${DSM}" alt="Flacon" />
  <figcaption>Photo : Jessica Weinkle</figcaption></figure>
  <div id="jlc-ad-rotation">
    <div class="jlc-ad"><a href="https://usherbrooke.coop/fr/boutique/categories/logiciels-7981">
      <img src="${ANTIDOTE}" alt="Antidote"></a></div>
    <div class="jlc-ad"><a href="https://www.facebook.com/Archives.LeCollectif">
      <img src="${AGENDA}" alt="Le Collectif"></a></div>
  </div>
  </div></article></main></body></html>`;
const adPick = imageFromArticleHtml(collectifAdHtml, [], {}, 'https://lecollectif.ca/societe/le-dsm-6/');
assert(/JessicaWeinkle/i.test(adPick.url), `photo DSM retenue, pas la pub (got ${adPick.url})`);
assert(
  !listArticleImageCandidates(collectifAdHtml, [], {}, 'https://lecollectif.ca/societe/le-dsm-6/')
    .some((c) => /antidote|pub_agenda/i.test(c.url)),
  'les créas Antidote / agenda ne sont pas candidates',
);
assert(!isCandidateImageUrl(ANTIDOTE), 'URL Antidote rejetée');
assert(!isCandidateImageUrl(AGENDA), 'URL pub_agenda rejetée');
assert(
  needsImageEnrichment({ link: 'https://lecollectif.ca/societe/le-dsm-6/', image: ANTIDOTE, leadImageReady: true }),
  'une une déjà collée sur la pub est re-scrapée',
);
assert(meetsArticleKeepSize(540, 438), '540×438 (og Collectif) reste une photo d’article');
assert(!meetsArticleKeepSize(1139, 500), 'bandeau 1139×500 n’est pas gardé comme photo courte');


// Une portrait (affiche FEUS 819×1024, Le Collectif 16 oct. 2026) : jamais
// affichée en bandes ni rognée — autre photo paysage, sinon repli normal.
{
  const { replacePortraitLead } = require('../scripts/ensure-lead-images.js');
  const { isPortraitLeadRatio, imageUrlLooksPortrait } = require('../scripts/article-image-lib.js');
  const check = (ok, msg) => { if (ok) console.log(`  ✓ ${msg}`); else { failed += 1; console.error(`  ✗ ${msg}`); } };
  check(isPortraitLeadRatio(1080, 1350) && !isPortraitLeadRatio(1200, 800), 'ratio portrait détecté');
  check(imageUrlLooksPortrait('https://x/wp-content/uploads/a_CreditFEUS-819x1024.jpg'), 'suffixe WP 819x1024 = portrait');
  const base = () => ({
    link: 'https://lecollectif.ca/a', image: 'https://x/wp-content/uploads/a_CreditFEUS-819x1024.jpg',
    imageLocal: 'assets/news-images/x.jpg', imageLocalKey: 'x',
    sourceImageCredit: 'Photo : FEUS', sourceImageCreator: 'FEUS', sourceImageCreditRev: 11,
  });
  const a = base();
  const r1 = await replacePortraitLead(a, { resolve: async () => ({ url: 'https://x/b-1200x800.jpg', width: 1200, height: 800, leadReady: true }) });
  check(r1 === 'replaced' && a.image === 'https://x/b-1200x800.jpg' && !a.imageLocal && !a.sourceImageCredit, 'portrait → autre photo paysage de l’article, crédit FEUS retiré');
  const b = base();
  const r2 = await replacePortraitLead(b, { resolve: async () => null });
  check(r2 === 'cleared' && !b.image && !b.imageLocal && !b.sourceImageCredit && !b.sourceImageCreator && b.leadImageReady === false, 'sans autre photo → image retirée (repli campus)');
  const c = { link: 'https://x/c', image: 'https://x/c-1200x800.jpg' };
  check(await replacePortraitLead(c, { probe: async () => null }) === null && c.image, 'photo paysage conservée');
  const radar = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8');
  check(!/is-poster/.test(radar + css), 'plus de une en bandes (is-poster / contain)');
}

// Portrait recadrable (Quartier Libre, « Les jeunes voteront-ils le 5 octobre ? »,
// 18 oct. 2026) : le dessin de l'article (724×1024, « Dessin: Wendy Kim Pires »)
// était écarté par la règle portrait < 0,95 puis remplacé par un stock / le
// campus UdeM. Une photo ou un dessin crédité à une personne se centre en 3:2 ;
// une affiche (FEUS), une story 9:16, un sigle ou un organisme, non.
{
  const { isCropSafePortrait } = require('../scripts/article-image-lib.js');
  const { replacePortraitLead, hasCropSafeImage, fillsLeadWhenCropped } = require('../scripts/ensure-lead-images.js');
  const check = (ok, msg) => { if (ok) console.log(`  ✓ ${msg}`); else { failed += 1; console.error(`  ✗ ${msg}`); } };
  const QL_URL = 'https://quartierlibre.ca/wp-content/uploads/2026/10/8-9_Illu-jeune-vote-724x1024.jpg';
  const QL_ALT = 'Environ 54 % des jeunes de 18 à 24 ans avaient voté aux élections provinciales de 2022, pour un taux de 66 %. Dessin: Wendy Kim Pires';
  check(isCropSafePortrait(724, 1024, { alt: QL_ALT, url: QL_URL }), 'dessin Quartier Libre 724×1024 crédité → recadré au centre');
  check(isCropSafePortrait(800, 1000, { caption: 'Crédit photo : Jean-Philippe Roy', url: 'https://x/manif-800x1000.jpg' }), 'photo portrait 4:5 créditée → recadrée');
  check(!isCropSafePortrait(819, 1024, { alt: 'Photo : FEUS', url: 'https://x/wp-content/uploads/a_CreditFEUS-819x1024.jpg' }), 'affiche FEUS (sigle) toujours écartée');
  check(!isCropSafePortrait(800, 1000, { alt: 'Photo : Courtoisie Université Laval' }), 'crédit d’organisme → écartée');
  check(!isCropSafePortrait(1080, 1920, { alt: 'Photo : Marie Tremblay' }), 'story 9:16 → écartée (trop haute)');
  check(isCropSafePortrait(800, 1000, { caption: 'Graphic by Zelda Dover // The Concordian' }), 'illustration « Graphic by » (Concordian) → recadrée');
  check(isCropSafePortrait(800, 1000, { caption: 'Illustration by Zelda Dover // The Concordian' }), 'illustration « Illustration by » → recadrée');
  check(!isCropSafePortrait(800, 1000, { alt: 'Affiche du spectacle. Graphic by Zelda Dover' }), 'affiche + Graphic by → toujours écartée');
  check(!isCropSafePortrait(800, 1000, { alt: 'Affiche du spectacle. Photo : Marie Tremblay' }), 'mot « affiche » → écartée');
  check(!isCropSafePortrait(800, 1000, { alt: 'Photo : Marie Tremblay', url: 'https://x/infographie-budget-800x1000.jpg' }), 'fichier « infographie » → écarté');
  check(!isCropSafePortrait(800, 1000, {}), 'portrait sans crédit → règle inchangée (écarté)');
  check(!isCropSafePortrait(400, 560, { alt: QL_ALT }), 'trop petit pour une une recadrée');
  check(isCropSafePortrait(900, 1200, { url: 'https://thelinknewspaper.ca/images/articles/_resized/IMG_0067.jpg' }), 'fichier d’appareil IMG_0067 (The Link) → photo recadrée');
  check(isCropSafePortrait(900, 1178, { url: 'https://thelinknewspaper.ca/images/made/images/articles/_resized/_U2A7376_900_1178_90.jpg' }), 'fichier d’appareil _U2A7376 → photo recadrée');
  check(isCropSafePortrait(800, 1100, { url: 'https://thelinknewspaper.ca/images/made/images/articles/_resized/05_SPORTS_NBA_Flopping_Dia_Diekmann_900_1200_90.jpg' }), 'fichier The Link au nom du crédit (Dia Diekmann) → recadré');
  check(isCropSafePortrait(800, 1100, { caption: 'The council did not reach quorum. Graphic Naya Hachwa', url: 'https://thelinknewspaper.ca/article-art.jpg' }), 'légende « Graphic Prénom Nom » sans by → recadrée');
  check(!isCropSafePortrait(800, 1100, { caption: 'Graphic design is not a person', url: 'https://x/a.jpg' }), '« graphic design » sans nom → écarté');
  check(!isCropSafePortrait(819, 1024, { url: 'https://x/FEUS2026-819x1024.jpg' }), 'sigle + année ≠ fichier d’appareil');
  check(!isCropSafePortrait(964, 1024, { alt: 'image couverture magazine Quartier Libre volume 33 n.1', url: 'https://x/AC7688E9-8982-4425-804C-B4DD9D09D6B6_1_201_a-964x1024.jpeg' }), 'couverture de magazine (texte) → écartée');
  check(fillsLeadWhenCropped(724, 1024) && !fillsLeadWhenCropped(540, 1024), 'recadrage 3:2 remplit la une');

  const html = `<html><head><meta property="og:image" content="${QL_URL}" />
    <meta property="og:image:width" content="724" /><meta property="og:image:height" content="1024" />
    <meta property="og:image:alt" content="${QL_ALT}" /></head><body><article>
    <figure><img width="724" height="1024" src="${QL_URL}" class="attachment-large size-large wp-image-32367" alt="${QL_ALT}" /></figure>
    ${'<p>Texte de l’article sur la participation électorale des jeunes.</p>'.repeat(8)}</article></body></html>`;
  const top = listArticleImageCandidates(html, [], {}, 'https://quartierlibre.ca/les-jeunes-voteront-ils/')[0];
  check(top?.url === QL_URL && /Wendy Kim Pires/.test(top.alt || ''), 'candidat og:image porte son alt (crédit du dessin)');
  check(isCropSafePortrait(top.w, top.h, { ...top }), 'photo de l’article retenue pour la une (recadrage centré)');

  const it = { link: 'https://quartierlibre.ca/x', image: QL_URL, stockImage: 'https://upload.wikimedia.org/a.jpg', imageProvider: 'campus-bank' };
  const r = await replacePortraitLead(it, { resolve: async () => ({ url: QL_URL, width: 724, height: 1024, leadReady: true, cropSafe: true }) });
  check(r === 'cropped' && it.image === QL_URL && !it.stockImage && hasCropSafeImage(it), 'passe portrait : photo d’article gardée, campus retiré');
  check(await replacePortraitLead(it, { probe: async () => { throw new Error('ne doit pas sonder'); } }) === null && it.image === QL_URL, 'déjà recadrable : plus jamais retirée aux passes suivantes');
  const credit = require('../scripts/article-photo-credit-lib.js').resolveSourcePhotoCredit(
    { link: 'https://quartierlibre.ca/les-jeunes-voteront-ils/', image: QL_URL, source: 'Quartier Libre', lang: 'fr' }, html);
  check(credit?.creditLine === 'Dessin : Wendy Kim Pires', 'crédit « Dessin : Wendy Kim Pires » (pas « Crédit photo : Quartier Libre »)');
  const radar = readFileSync(new URL('../radar-news.js', import.meta.url), 'utf8');
  check(/is-portrait-crop/.test(radar) && /is-portrait-crop[\s\S]{0,40}object-position: 50% 30%/.test(readFileSync(new URL('../style-feed.css', import.meta.url), 'utf8')), 'portrait recadré (cover, tiers haut), jamais en bandes');
  check(/kind === 'stock' && item\.imageProvider !== 'campus-bank'\) return;/.test(radar), 'client : délai dépassé ne remplace pas une photo thématique par le campus');
  check(/commons\/thumb\/\$\{orig\[1\]\}/.test(radar), 'client : vignette Commons directe (sans redirections FilePath)');
}


// ── Illustration éditoriale Concordian (« Graphic by », lazy-load Csco) ──
// 10 nov. 2026 : « What does rejecting AI actually look like? » — vedette
// 1920×1080, data-pk-src, légende sœur hors <figure>, alt og « AI ».
{
  const img = 'https://theconcordian.com/wp-content/uploads/2026/11/IMG_0251.png';
  const link = 'https://theconcordian.com/2026/11/what-does-rejecting-ai-look-like/';
  const html = `<html><head>
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1920" />
    <meta property="og:image:height" content="1080" />
    <meta property="og:image:alt" content="AI" />
    <meta name="twitter:image" content="${img}" />
  </head><body class="postid-92473">
  <main><article class="post-92473">
    <div class="cs-entry__header">
      <h1 class="cs-entry__title"><span>What does rejecting AI actually look like?</span></h1>
      <figure class="cs-entry__post-media post-media">
        <img width="800" height="450"
          src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII="
          class="attachment-csco-medium-uncropped size-csco-medium-uncropped pk-lazyload wp-post-image" alt=""
          data-pk-src="https://theconcordian.com/wp-content/uploads/2026/11/IMG_0251-800x450.png"
          data-pk-srcset="${img} 1920w, https://theconcordian.com/wp-content/uploads/2026/11/IMG_0251-800x450.png 800w" />
      </figure>
      <figcaption class="cs-entry__caption-text wp-caption-text">
        Graphic by Zelda Dover // The Concordian
      </figcaption>
    </div>
    <div class="entry-content"><p>${'As the use of artificial intelligence becomes common at Concordia. '}</p></div>
  </article></main></body></html>`;
  const found = imageFromArticleHtml(html, [], {}, link);
  assert(found.url === img, 'Concordian Graphic by : og:image / vedette lazy-load retenue');
  assert(found.w === 1920 && found.h === 1080, 'Concordian Graphic by : dimensions 1920×1080');
  assert(meetsLeadDisplaySize(found.w, found.h), 'Concordian Graphic by : format paysage prêt pour la une');
  const top = listArticleImageCandidates(html, [], {}, link)[0];
  assert(top?.url === img, 'Concordian Graphic by : premier candidat = illustration');
  assert(/Graphic by Zelda Dover/i.test(top.caption || ''), 'Concordian Graphic by : légende sœur rattachée');
  assert(!top.campaignGraphic, 'Concordian Graphic by : pas un visuel de campagne');
  assert(articleImageIsValidOnPage(html, img, [], {}, link), 'Concordian Graphic by : validée sur la page (data-pk-src + og:image)');
  const credit = require('../scripts/article-photo-credit-lib.js').resolveSourcePhotoCredit(
    { link, image: img, source: 'The Concordian', lang: 'en' }, html);
  assert(credit && /Zelda Dover/i.test(credit.creditLine || credit.creator || ''), 'Concordian Graphic by : crédit Zelda Dover');
  const puzzle = require('../scripts/non-article-filter.js').nonArticleReason({
    title: 'What does rejecting AI actually look like?',
    link,
    excerpt: 'As the use of artificial intelligence (AI) becomes increasingly common at Concordia, some students are raising concerns about its role in their academics.',
  });
  assert(!puzzle, 'filtre PR384 : l’article sur l’IA n’est pas un mot croisé / une promo');
}

// The Link, 10 nov. 2026 : les graphiques et photos sont dans l'article
// (crop CE Image 300×200, ou fichier au nom du crédit). Le robot les jetait
// et collait le pavillon Hall. Le graphique abeille CSU réutilisé reste rejeté.
{
  const {
    promoteImageUrl,
    isWeakImageUrl,
    isCandidateImageUrl: candidate,
    imageFromArticleHtml: fromHtml,
  } = require('../scripts/article-image-lib.js');
  const crop = 'https://thelinknewspaper.ca/images/made/images/articles/_resized/05_SPORTS_NBA_Flopping_Dia_Diekmann_300_200_90_s_c1.jpg';
  const png = 'https://thelinknewspaper.ca/images/made/images/articles/_resized/05_NEWS_Canada_in_Erasmus_Plus_Aia_Segal_300_200_s_c1.PNG';
  const kept = 'https://thelinknewspaper.ca/images/made/images/articles/_resized/05_NEWS_Quebec_data_centres_Halle_Keays_1_900_675.png';
  const bee = 'https://thelinknewspaper.ca/images/made/images/articles/_resized/00.graphics.CSU.Naya_Hachwa_900_674_90.jpeg';
  assert(isWeakImageUrl(crop), 'crop CE Image 300×200 est une vignette');
  assert(!isWeakImageUrl(kept), 'graphique déjà en 900×675 n’est pas une vignette');
  assert(promoteImageUrl(crop).endsWith('05_SPORTS_NBA_Flopping_Dia_Diekmann_900_600_90.jpg'), 'crop jpg promu en 900×600');
  const pngLead = promoteImageUrl(png);
  assert(/Aia_Segal_900_675\.PNG$/.test(pngLead), 'crop png promu en 900×675');
  const { leadImageProbeUrls } = require('../scripts/article-image-lib.js');
  const pngProbes = leadImageProbeUrls(pngLead);
  assert(pngProbes[0] === pngLead, 'le probe commence par le graphique 900×675');
  assert(pngProbes.some((u) => /Aia_Segal_900_600_90\.PNG$/.test(u)), 'repli probe 900×600 si le 900×675 manque');
  assert(promoteImageUrl(kept) === kept, 'fichier déjà grand inchangé');
  assert(!candidate(bee), 'graphique CSU réutilisé (Naya Hachwa) toujours rejeté');
  const html = `<html><head>
    <meta property="og:image" content="https://thelinknewspaper.ca/images/made/images/articles/_resized/05_OPS_Bioblitz_Anne_Zhao_900_600_90.jpg" />
  </head><body><article>
    <img width="300" height="200" src="${crop}" alt="Diving in the NBA needs to come to an end. Graphic by Dia Diekmann" />
    <p>${'The NBA’s best players are resorting to acting instead of simply playing the game. '.repeat(4)}</p>
  </article></body></html>`;
  const found = fromHtml(html, [], { preferSizeFull: true, preferFirstContentImage: true }, 'https://thelinknewspaper.ca/article/16553');
  assert(/Dia_Diekmann_900_600_90\.jpg$/.test(found.url), 'The Link preferFirst : le crop du corps est promu, pas jeté');
}

// The Link, 11 nov. 2026 : les portraits d'article (graphique 900×1582,
// photo JVC26 / NST26, fichier aicha.online) partaient au campus. Le src
// relatif ne rattachait pas la légende, et un 429 effaçait le portrait.
{
  const {
    isCropSafePortrait,
    listArticleImageCandidates: listCandidates,
    imageDimensionsFromUrl,
  } = require('../scripts/article-image-lib.js');
  const { replacePortraitLead, hasCropSafeImage } = require('../scripts/ensure-lead-images.js');
  const check = (ok, msg) => { if (ok) console.log(`  ✓ ${msg}`); else { failed += 1; console.error(`  ✗ ${msg}`); } };
  const made = (file) => `https://thelinknewspaper.ca/images/made/images/articles/_resized/${file}`;
  const jvc = made('JVC26_1105_Phensy_0266_900_1259_90.jpg');
  const aicha = made('05.fringe.dear_america.aicha.online_900_1174_90.jpeg');
  const nst = made('NST26_Concordia_5754_900_1350_90.jpg');
  const archives = made('05_FRINGE_Archives_Gaies_Halle_Keays_900_1582.png');
  const poster = made('affiche_soiree_900_1400.jpg');
  check(isCropSafePortrait(900, 1259, { url: jvc }), 'JVC26 900×1259 sous /images/articles/ → gardé');
  check(isCropSafePortrait(900, 1174, { url: aicha }), 'aicha.online 900×1174 → gardé');
  check(isCropSafePortrait(900, 1350, { url: nst }), 'NST26 900×1350 → gardé');
  check(isCropSafePortrait(900, 1582, { url: archives }), 'Archives Halle Keays 900×1582 (0,57) → gardé');
  check(!isCropSafePortrait(900, 1582, { caption: 'Graphic Halle Keays', url: 'https://example.org/archives.png' }), 'même ratio hors /images/articles/ : plancher 0,66 inchangé');
  check(!isCropSafePortrait(1080, 1920, { alt: 'Photo : Marie Tremblay' }), 'story 9:16 hors The Link → toujours écartée');
  check(!isCropSafePortrait(900, 2000, { url: archives.replace('1582', '2000') }), 'sous 0,55 même dans /images/articles/ → écarté');
  check(!isCropSafePortrait(900, 1400, { url: poster }), 'affiche dans /images/articles/ → écartée');
  check(!isCropSafePortrait(800, 1100, {}), 'portrait sans crédit ni chemin éditorial → écarté');
  check(isCropSafePortrait(900, 1259, { caption: 'Technologist Christina Phensy. Photo Jade-S. Vachon-Côté', url: 'https://example.org/photo.jpg' }), '« Photo Jade-S. Vachon-Côté » sans deux-points → crédit');
  check(!isCropSafePortrait(800, 1000, { alt: 'Photo : FEUS', url: 'https://x/wp-content/uploads/a_CreditFEUS-819x1024.jpg' }), 'sigle FEUS toujours écarté');
  const dims = imageDimensionsFromUrl(made('05_SPORTS_NBA_Flopping_Dia_Diekmann_900_1273_90.jpg'));
  check(dims && dims.width === 900 && dims.height === 1273, 'taille CE Image _900_1273 lue dans l’URL');
  const html = `<html><body><article class="content-inner"><figure class="entry-images">
    <a href="${jvc}"><img src="/images/made/images/articles/_resized/JVC26_1105_Phensy_0266_900_1259_90.jpg" alt=""></a>
    <figcaption>Technologist Christina Phensy wants to help people connect. Photo Jade-S. Vachon-Côté</figcaption>
    </figure><p>${'The name plays on the French phrase presque vu. '.repeat(6)}</p></article></body></html>`;
  const top = listCandidates(html, [], { preferFirstContentImage: true }, 'https://thelinknewspaper.ca/article/16543')[0];
  check(top && /Jade-S\. Vachon-Côté/.test(top.caption || ''), 'src relatif : la figcaption se rattache');
  const it = {
    link: 'https://thelinknewspaper.ca/article/16553',
    image: made('05_SPORTS_NBA_Flopping_Dia_Diekmann_900_1273_90.jpg'),
    stockImage: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Henry_F._Hall_Building_07.JPG',
    imageProvider: 'campus-bank',
  };
  const r = await replacePortraitLead(it, { resolve: async () => { throw new Error('429'); }, probe: async () => { throw new Error('pas de probe'); } });
  check(r === 'cropped' && hasCropSafeImage(it) && !it.stockImage, '429 : portrait éditorial gardé, campus retiré');
  const bare = { link: 'https://example.com/a', image: 'https://example.com/portrait-800x1100.jpg' };
  const cleared = await replacePortraitLead(bare, { resolve: async () => null, probe: async () => { throw new Error('pas de probe'); } });
  check(cleared === 'cleared' && !bare.image, 'portrait sans crédit : toujours retiré');
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll lead-photo-fit checks passed.');

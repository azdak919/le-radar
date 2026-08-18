/**
 * LE RADAR — audit HARD offline des banques fonds QC
 *
 * Zéro réseau : JSON local + règles texte/méta + blacklist.
 * Aligné sur maintain-quebec-backgrounds (textGate) **sans** rejets saisonniers
 * (hiver/neige sont gérés par season-lib / rotation, pas un HARD ban).
 *
 * Utilisé par :
 *   - scripts/audit-banks-hard.js (CLI)
 *   - tests/bank-hard-audit.mjs (CI / npm test)
 *   - éventuellement bank:check
 */

'use strict';

const { matchHardBanned } = require('./quebec-backgrounds-blacklist');
const {
  RELIGIOUS_SUBJECT_RE: RELIGIOUS_RE,
  TOWN_HALL_FACADE_RE,
  looksReligiousSubject,
  looksTownHallFacade,
} = require('./religious-facade-lib');
const {
  looksSpeciesMacro,
  looksPeopleScene,
  looksVernacularBuilding,
  looksFaceDetected,
} = require('./wallpaper-subject-lib');

const MIN_WIDTH = 1400;
const MIN_HEIGHT = 700;
const MIN_PIXELS = 1_200_000;
const MIN_ASPECT = 1.25;
const MIN_ASPECT_NATIONS = 1.15;

const PEOPLE_RE =
  /(?:\bportrait\b|\bpeople\b|\bperson\b|\bpersons\b|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|\bchild\b|\bchildren\b|\bfamily\b|\bfamille\b|\bhomme\b|\bfemme\b|\benfant\b|\bcrowd\b|\bfoule\b|\bselfie\b|\binscription on reverse\b|\bchef\b|\bchief\b|\bleder\b|\bleader\b|\bmaire\b|\bmayor\b|\bface\b|\bvisage\b|\bgroup\b|\bgroupe\b|\bmeeting\b|\br[eé]union\b)/i;

const NON_IMAGE_RE =
  /\.(?:wav|mp3|ogg|flac|webm|mp4|pdf|svg|djvu|stl|obj)(?:\?|$)/i;

/**
 * Scènes indésirables en wallpaper — **sans** hiver/neige/toundra
 * (rotation saisonnière).
 */
const BAD_SCENE_RE =
  /(?:\bnight\b|\bnuit\b|\bdark\b|\bmacro\b|\bclose[\s-]?up\b|\bgros[\s-]?plan\b|\binterior\b|\bintérieur\b|\binterieur\b|\bindoor\b|\bmuseo\b|\bmuseum\b|\bmusée\b|\bmusee\b|\boeuvre\b|\bœuvre\b|\bpainting\b|\bgravure\b|\bengraving\b|\bmicroform\b|\bletrero\b|\bsignage\b|\bboulangerie\b|\btruck\b|\bcami[oó]n\b|\bcrépuscule\b|\bcrepuscule\b|\bdawn or dusk\b|\btwilight\b|\bafter[\s-]?dark\b|\bciels? invers|\bcanot\b|\bcanoe\b|\bkayak\b|\bpaddle\b|\bpagaie\b|\bexhibit\b|\bexhibition\b|\bgallery\b|\bgalerie\b|\bartifact\b|\bart[eé]fact\b|\bdisplay\b|\bmashteuiatsh[\s_-]?0*\d{2,}\b|\bultramafic\b|\bwasteland\b|\brocky plain\b|\bquarry\b|\bcarri[eè]re\b|\bmudflat\b|\bbatture\b|\bmar[eé]e basse\b|\blow[\s-]?tide\b|\bunderside\b|\bunderneath\b|\bunderpass\b|\bunder[\s-]?the[\s-]?bridge\b|\bbridge[\s-]?underside\b|\bdessous de pont\b|\bsous le pont\b|\bsous[\s-]pont\b|\bsoffit\b|\bconcrete beams?\b|\bchain[\s-]?link\b|\bbarbed[\s-]?wire\b|\bbarbel[eé]\b|\bcl[oô]ture grillag|\bprison\b|\bp[eé]nitenc|\bjail\b|\bd[eé]tention\b|\bairport\b|\ba[eé]roport\b|\bairfield\b|\bhangar\b|\bwarehouse\b|\bentrep[oô]t\b|\bindustrial\b|\bzone industrielle\b|\bfactory\b|\brailway[\s_-]?track\b|\bparking[\s_-]?lot\b|\bstationnement\b|\b[eé]puration\b|\bsewage\b|\bwaste[\s-]?water\b|\bwater[\s-]?treatment\b|\btreatment[\s-]?plant\b|\bstop[\s-]?sign\b|\bstopsign\b|\bpanneau\s+d['’]?arr[eê]t\b|\bdiagram\b|\blocation\s+diagram\b|\bmap\s+of\b|\bwelcome[\s_-]?signs?|\bentrance[\s_-]?signs?|\broad[\s_-]?signs?|\broadside[\s_-]?signs?|\bcity[\s_-]?limit[\s_-]?signs?|\bmunicipal[\s_-]?signs?|\bcommunity[\s_-]?signs?|\bbillboard|\benseigne|\bpanneau|StopSign|WelcomeSign|\bplace[\s_-]?name[\s_-]?signs?|\bname[\s_-]?signs?|\bwelcome[\s_-]?board\b|\bentry[\s_-]?signs?|\bboundary[\s_-]?signs?|[_-]signs?\.(?:jpe?g|png|webp)\b)/i;

const BANK_SPECS = [
  { id: 'masthead', jsonRel: 'data/quebec-backgrounds.json', landscape: true },
  { id: 'pomo', jsonRel: 'data/quebec-pomo-backgrounds.json', landscape: true },
  {
    id: 'universities',
    jsonRel: 'data/quebec-university-backgrounds.json',
    landscape: false,
  },
  {
    id: 'nations',
    jsonRel: 'data/quebec-nations-backgrounds.json',
    landscape: false,
    nations: true,
  },
  {
    id: 'favorites',
    jsonRel: 'data/quebec-favorites-backgrounds.json',
    landscape: true,
  },
];

function hay(entry, fields) {
  return fields
    .map((f) => entry && entry[f])
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {object} photo
 * @param {{ id: string, landscape?: boolean, nations?: boolean }} profile
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function auditPhotoHard(photo, profile = {}) {
  const reasons = [];
  if (!photo || typeof photo !== 'object') {
    return { ok: false, reasons: ['invalid_photo'] };
  }

  const ban = matchHardBanned(photo);
  if (ban) reasons.push(`hard_banned:${ban.reason}`);

  const full = hay(photo, [
    'title',
    'url',
    'link',
    'credit',
    'description',
    'categories',
  ]);
  const short = hay(photo, ['title', 'url', 'link']);

  if (NON_IMAGE_RE.test(full) || (photo.mime && !String(photo.mime).startsWith('image/'))) {
    reasons.push('not_image');
  }
  if (looksReligiousSubject(photo)) reasons.push('religious_subject');
  if (profile.landscape && looksTownHallFacade(photo)) {
    reasons.push('town_hall_facade');
  }
  if (PEOPLE_RE.test(short)) reasons.push('people_subject');
  // Description / catégories : motif restreint (wallpaper-subject-lib), sans les
  // mots qui collident avec le français descriptif d'un paysage.
  if (looksPeopleScene(photo)) reasons.push('people_scene');
  if (looksFaceDetected(photo)) reasons.push('face_subject');
  if (looksSpeciesMacro(photo)) reasons.push('macro_closeup');
  if (looksVernacularBuilding(photo)) reasons.push('vernacular_building');
  // bad_scene : titre/URL seulement — les descriptions Commons citent souvent
  // « museum » / « interior » pour des extérieurs (ex. Fort Listuguj).
  if (BAD_SCENE_RE.test(short)) reasons.push('bad_scene_title');

  const w = Number(photo.width) || 0;
  const h = Number(photo.height) || 0;
  if (w && h) {
    if (w < MIN_WIDTH) reasons.push('low_resolution_width');
    if (h < MIN_HEIGHT) reasons.push('low_resolution_height');
    if (w * h < MIN_PIXELS) reasons.push('low_resolution_pixels');
    const ar = w / h;
    const minAr = profile.nations ? MIN_ASPECT_NATIONS : MIN_ASPECT;
    if (ar < minAr) reasons.push('portrait_or_narrow');
  }

  if (!photo.url || typeof photo.url !== 'string') reasons.push('missing_url');
  else if (
    !/^https:\/\//i.test(photo.url) &&
    !/^\/assets\/masthead\/[^?\s]+\.(?:jpe?g|png|webp)$/i.test(photo.url)
  ) {
    reasons.push('url_not_https');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * @param {object} bankData  { photos: [] }
 * @param {object} profile
 * @returns {{ ok: boolean, failures: Array<{ index, title, url, reasons }> }}
 */
function auditBankHard(bankData, profile) {
  const photos = Array.isArray(bankData?.photos) ? bankData.photos : [];
  const failures = [];
  photos.forEach((photo, index) => {
    const r = auditPhotoHard(photo, profile);
    if (!r.ok) {
      failures.push({
        index,
        title: photo.title || photo.id || '',
        url: photo.url || '',
        reasons: r.reasons,
      });
    }
  });
  return { ok: failures.length === 0, failures, total: photos.length };
}

module.exports = {
  BANK_SPECS,
  MIN_WIDTH,
  MIN_HEIGHT,
  MIN_PIXELS,
  MIN_ASPECT,
  auditPhotoHard,
  auditBankHard,
  RELIGIOUS_RE,
  TOWN_HALL_FACADE_RE,
  BAD_SCENE_RE,
};

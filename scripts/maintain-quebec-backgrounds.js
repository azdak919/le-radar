#!/usr/bin/env node
/**
 * LE RADAR — bot de banques wallpaper (compartimentées)
 *
 * Profils indépendants (mêmes règles, plafond large, cadence session univ.) :
 *
 *   masthead (défaut ; alias : landscape)
 *     data/quebec-backgrounds.json → QUEBEC_BACKGROUNDS
 *     → mât seulement
 *
 *   universities
 *     data/quebec-university-backgrounds.json → QUEBEC_UNIVERSITY_BACKGROUNDS
 *     → mât seulement
 *
 *   pomo
 *     data/quebec-pomo-backgrounds.json → QUEBEC_POMO_BACKGROUNDS
 *     → pomo seulement
 *
 *   nations  (**partagée** mât + pomo)
 *     data/quebec-nations-backgrounds.json → QUEBEC_NATIONS_BACKGROUNDS
 *     → Premières Nations & Inuit du Québec / Nunavik
 *     → mât ET pomo (seule banque explicitement partagée)
 *
 * Politique commune :
 *   - plafond MAX_BANK (défaut 200, override --max-bank=N) — plus de « 50 max »
 *   - ménage complet **une fois par session universitaire QC**
 *   - revalidation (aspect, religieux institutionnel, licence, résolution)
 *   - pas de personnes reconnaissables ; spiritualité autochtone OK
 *   - découverte Commons (+ graines File: + Openverse si nations manquent)
 *
 * Usage :
 *   node scripts/maintain-quebec-backgrounds.js [--profile masthead|universities|pomo|nations]
 *   node scripts/maintain-quebec-backgrounds.js --update --profile nations
 *   node scripts/maintain-quebec-backgrounds.js --update --force --max-bank=200
 *
 * Blacklist durable (URL-first) : scripts/quebec-backgrounds-blacklist.js
 * Sync offline JSON→JS (sans Commons) : scripts/sync-quebec-backgrounds.js
 * Doc agent : docs/agent-playbook.md
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const {
  getCurrentUniversitySessionId,
  getCurrentUniversitySessionStart,
} = require('./session-freshness-lib');
const nationsTaxonomy = require('./quebec-nations-taxonomy');
const { matchHardBanned } = require('./quebec-backgrounds-blacklist');
const { sanitizeCommonsCredit } = require('./commons-credit-lib');
const {
  looksReligiousSubject,
  looksTownHallFacade: looksTownHallFacadeShared,
} = require('./religious-facade-lib');
const { enrichPhotoSeasons, getCurrentSeason4 } = require('./season-lib');

const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const doUpdate = args.includes('--update');
const forceSession = args.includes('--force');

/** Plafond large : les saisons ont besoin de profondeur, pas d’un cap 50. */
function readMaxBankArg() {
  const eq = args.find((a) => a.startsWith('--max-bank='));
  if (eq) {
    const n = parseInt(eq.split('=')[1], 10);
    if (Number.isFinite(n) && n >= 20) return Math.min(n, 500);
  }
  const i = args.indexOf('--max-bank');
  if (i >= 0 && args[i + 1]) {
    const n = parseInt(args[i + 1], 10);
    if (Number.isFinite(n) && n >= 20) return Math.min(n, 500);
  }
  return 200;
}
const MAX_BANK = readMaxBankArg();
const MIN_ASPECT = 1.25;
/** Banque favorites manuelle — URLs jamais purgées par ce bot. */
const FAVORITES_JSON = path.join(ROOT, 'data', 'quebec-favorites-backgrounds.json');
/**
 * Résolution native mini — mât / pomo plein écran retina.
 * Sous ~1.2 Mpx / 1400 px de large, le cover upscale montre du grain.
 */
const MIN_WIDTH = 1400;
const MIN_HEIGHT = 700;
const MIN_PIXELS = 1_200_000;
const UA = 'LeRadar-bg-maintain/1.2 (https://le-radar.ca; compartmented wallpaper banks)';

function readProfileArg() {
  const eq = args.find((a) => a.startsWith('--profile='));
  if (eq) return eq.slice('--profile='.length).trim().toLowerCase();
  const i = args.indexOf('--profile');
  if (i >= 0 && args[i + 1]) return String(args[i + 1]).trim().toLowerCase();
  return 'masthead';
}

/** Titre/URL doit évoquer un campus universitaire QC (profil universities). */
const CAMPUS_SUBJECT_RE =
  /(?:universit|campus|mcgill|concordia|laval|sherbrooke|bishop|uqam|uqtr|uqac|uqar|uqo|uqat|polytechnique|\b[eé]ts\b|hec\s*montr|enap|inrs|t[eé]luq|pavillon|facult[eé]|arts building|hall building|roger-?gaudry|judith-?jasmin|loyola)/i;

/**
 * Titre/URL doit évoquer Premières Nations / Inuit / territoires du Québec
 * (profil nations). Spiritualité autochtone volontairement hors RELIGIOUS_RE.
 */
const NATIONS_SUBJECT_RE =
  /(?:premi[eè]res?\s*nations|first\s*nations|indigenous|autochtone|inuit|innu|ilnu|naskapi|atikamekw|wabanaki|w8banaki|mi['’]?g?maq|micmac|huronne|wendat|mohawk|kanien|ab[eé]nakis?|mal[eé]cite|wolastoq|anishinaab|algonquin|eeyou|eenou|iyiyiu|\bcri\b|\bcree\b|nunavik|nunavut|inukjuak|mashteuiatsh|odanak|w[oô]linak|pessamit|betsiamites|kuujjuaq|kangirsuk|pingualuit|kuujjuarapik|puvirnituq|salluit|ivujivik|kangiqsualujjuaq|kangiqsujuaq|quaqtaq|akulivik|aupaluk|tasiujaq|umiujaq|whapmagoostui|chisasibi|mistissini|waswanipi|nemaska|eastmain|wemindji|waskaganish|ouj[eé]-?bougoumou|wendake|kahnaw[aà]ke|kanehsat[aà]ke|akwesasne|listuguj|gesgapegiag|gespeg|opitciwan|manawan|wemotaci|essipit|nutashkuan|unamen|pakua|matimekosh|ekuanitshit|uteinam|kitigan|lac[\s-]?simon|winneway|timiskaming|eagle village|kebaowek|wolf lake|kitcisakik|pakuashipi|natashquan|mingan|kawawachikamach|eeyou istchee|baie[\s-]?james|james bay cree|côte[\s-]?nord inn|wahsipekuk|cacouna|whitworth|r[eé]serve\s+(?:indienne|autochtone)|territoir(?:e|ial)\s+(?:cri|innu|naskapi))/i;

function landscapeDiscoveryQueries(sessionId) {
  const core = [
    'Québec paysage filetype:bitmap',
    'Montreal skyline landscape -interior -night',
    'Montreal skyline panorama -night',
    'Québec city skyline -night',
    'Panorama of Quebec City',
    'Lac des Deux-Montagnes',
    'Hudson Québec Lac Deux-Montagnes',
    'Rigaud Québec rivière',
    'Vaudreuil-Soulanges',
    // Pas de seed « Vaudreuil-sur-le-Lac » : seule photo libre Commons
    // (…_QC.JPG) se lit chapelle/clocher — hard-ban dans blacklist.js.
    'Les Cèdres Québec paysage -airport -aéroport -hangar',
    'Les Cedres QC',
    'Île-Perrot',
    'Pont Île-aux-Tourtes',
    'Deux-Montagnes parc',
    'Canal de Soulanges',
    'Coteau-du-Lac fleuve',
    'Pointe-Calumet baie',
    'Saguenay river Quebec',
    'Gaspésie paysage',
    'Rocher Percé',
    'Chute Montmorency',
    "Île d'Orléans paysage",
    'Lac Saint-Jean paysage',
    'Odanak vue aérienne',
    'Pessamit Quebec aerial',
    'Mashteuiatsh',
    'Nunavik landscape -portrait',
    'Kangirsuk',
    'Pingualuit',
    'Kuujjuaq landscape',
    'fleuve Saint-Laurent paysage',
  ];
  const bySession = {
    automne: [
      'érable automne Québec',
      'automne Québec paysage',
      'maple autumn Quebec landscape',
      'feuilles d\'automne Laurentides',
      'forêt automnale Québec',
      'Charlevoix automne paysage',
      'Parc national Mauricie automne',
      'Cantons-de-l\'Est automne',
    ],
    hiver: [
      'Québec hiver paysage jour',
      'Montreal winter landscape day',
      'Gaspésie hiver paysage',
      'Laurentides hiver neige paysage',
      'Charlevoix hiver paysage',
    ],
    ete: [
      'Québec été lac paysage',
      'rivière Québec été',
      'Charlevoix paysage été',
      'lac Québec été vert',
      'Parc national de la Mauricie été',
      'Gaspésie été littoral',
      'Îles-de-la-Madeleine paysage été',
      'Bas-Saint-Laurent été',
      'Outaouais lac été',
      'Estrie lac été paysage',
      'Mont-Tremblant été paysage -ski',
      'Saguenay été paysage -glace -frozen',
      'lac Memphrémagog été',
      'Parc national du Bic été',
      'Tadoussac été paysage',
      'Parc national Jacques-Cartier été',
      'Forillon national park summer',
      'Mingan archipelago summer',
      'lac Saint-Jean été plage',
      'Abitibi lac été paysage',
      'Gatineau park summer landscape',
      'Mont Orford été',
      'Mont Saint-Hilaire été',
      'Parc de la Gatineau été',
      'rivière Magog été',
      'baie des Chaleurs été',
      'Percé village été -hiver',
      'Cap-Bon-Ami Forillon',
      'Sept-Îles paysage été',
      'Baie-Comeau paysage',
    ],
    // 4e saison météo (session univ. n’a que 3 ids)
    printemps: [
      'Québec printemps paysage',
      'dégel rivière Québec',
      'printemps Gaspésie paysage',
      'printemps érable Québec',
      'bourgeons forêt Québec',
      'printemps Laurentides paysage',
      'printemps Charlevoix',
      'fleuve Saint-Laurent printemps',
    ],
  };
  // Toutes les saisons en banque (rotation année) + priorité saison météo courante.
  const season4 = getCurrentSeason4();
  const current = bySession[season4] || bySession[sessionId] || bySession.ete;
  const rest = ['ete', 'printemps', 'automne', 'hiver']
    .filter((s) => s !== season4)
    .flatMap((s) => bySession[s] || []);
  return [...core, ...current, ...rest];
}

function universityDiscoveryQueries(sessionId) {
  const core = [
    'McGill University campus exterior -interior -night -portrait -people',
    'McGill University Arts Building exterior -winter',
    'Roddick Gates McGill',
    'Université de Montréal campus exterior -interior -night',
    'Pavillon Roger-Gaudry Université de Montréal',
    'Concordia University campus exterior Montreal -interior',
    'Henry F Hall Building Concordia exterior',
    'Loyola Campus Concordia University exterior',
    'Université Laval campus Québec exterior -interior -night',
    'Université de Sherbrooke campus exterior -interior',
    "Bishop's University campus exterior -interior",
    'UQAM campus exterior Montreal -interior',
    'Pavillon Judith-Jasmin UQAM',
    'UQTR campus exterior Trois-Rivières',
    'UQAC campus Chicoutimi exterior',
    'UQAR campus Rimouski exterior',
    'UQO campus Gatineau exterior',
    'UQAT campus exterior',
    'Polytechnique Montréal campus exterior',
    'École de technologie supérieure campus exterior Montréal',
    'HEC Montréal campus exterior',
    'INRS campus Québec exterior',
    'ENAP Québec campus exterior',
  ];
  const bySession = {
    automne: [
      'McGill University campus autumn exterior',
      'Université Laval campus automne exterior',
      'campus universitaire Québec automne',
    ],
    hiver: [
      // Même politique « pas d’hiver » côté filtre ; on cherche plutôt des vues jour claires
      'McGill University campus exterior summer day',
      'Université de Montréal campus day exterior',
    ],
    ete: [
      'campus universitaire Québec été exterior',
      'McGill University campus summer exterior',
      'Université Laval campus summer exterior',
      'Université de Montréal campus summer day exterior',
      'Concordia University campus summer exterior',
      'Université de Sherbrooke campus summer exterior',
      'UQAM campus summer exterior Montreal',
      'Bishop\'s University campus summer exterior',
    ],
    printemps: [
      'McGill University campus spring exterior',
      'Université Laval campus printemps exterior',
      'campus universitaire Québec printemps exterior',
    ],
  };
  const season4 = getCurrentSeason4();
  const current = bySession[season4] || bySession[sessionId] || bySession.ete;
  const rest = ['ete', 'printemps', 'automne', 'hiver']
    .filter((s) => s !== season4)
    .flatMap((s) => bySession[s] || []);
  return [...core, ...current, ...rest];
}

/** Requêtes par les 11 nations (priorité aux nations absentes de la banque). */
function nationsDiscoveryQueries(sessionId, photos = []) {
  return nationsTaxonomy.buildDiscoveryQueries(sessionId, photos);
}

const PROFILES = {
  masthead: {
    id: 'masthead',
    label: 'paysages QC — mât',
    jsonPath: path.join(ROOT, 'data', 'quebec-backgrounds.json'),
    jsPath: path.join(ROOT, 'quebec-backgrounds-data.js'),
    globalName: 'QUEBEC_BACKGROUNDS',
    consumers: 'mât page d’accueil seulement — jamais le pomo',
    requireCampusSubject: false,
    requireNationsSubject: false,
    discoveryQueries: landscapeDiscoveryQueries,
  },
  universities: {
    id: 'universities',
    label: 'campus universitaires QC — mât',
    jsonPath: path.join(ROOT, 'data', 'quebec-university-backgrounds.json'),
    jsPath: path.join(ROOT, 'quebec-university-backgrounds-data.js'),
    globalName: 'QUEBEC_UNIVERSITY_BACKGROUNDS',
    consumers: 'mât page d’accueil seulement — jamais le pomo',
    requireCampusSubject: true,
    requireNationsSubject: false,
    discoveryQueries: universityDiscoveryQueries,
  },
  pomo: {
    id: 'pomo',
    label: 'paysages QC — pomo',
    jsonPath: path.join(ROOT, 'data', 'quebec-pomo-backgrounds.json'),
    jsPath: path.join(ROOT, 'quebec-pomo-backgrounds-data.js'),
    globalName: 'QUEBEC_POMO_BACKGROUNDS',
    consumers: 'pomo uniquement — jamais le mât de la page principale',
    requireCampusSubject: false,
    requireNationsSubject: false,
    discoveryQueries: landscapeDiscoveryQueries,
  },
  nations: {
    id: 'nations',
    label: 'Premières Nations & Inuit — mât + pomo',
    jsonPath: path.join(ROOT, 'data', 'quebec-nations-backgrounds.json'),
    jsPath: path.join(ROOT, 'quebec-nations-backgrounds-data.js'),
    globalName: 'QUEBEC_NATIONS_BACKGROUNDS',
    consumers: 'mât page d’accueil ET pomo (banque partagée thématique)',
    requireCampusSubject: false,
    requireNationsSubject: true,
    discoveryQueries: (sessionId, photos) =>
      nationsDiscoveryQueries(sessionId, photos),
  },
};
// Alias rétrocompat
PROFILES.landscape = PROFILES.masthead;
PROFILES.indigenous = PROFILES.nations;
PROFILES.nation = PROFILES.nations;

const profileKey = readProfileArg();
const PROFILE =
  PROFILES[profileKey] ||
  PROFILES[profileKey.replace(/s$/, '')] ||
  null;
if (!PROFILE) {
  console.error(
    `Profil inconnu « ${profileKey} ». Utiliser : masthead | universities | pomo | nations`
  );
  process.exit(2);
}

const JSON_PATH = PROFILE.jsonPath;
const JS_PATH = PROFILE.jsPath;
const LEGACY_JS = JS_PATH;

// ── Filtres texte (règles stables — RELIGIOUS / TOWN_HALL via religious-facade-lib) ──

const PEOPLE_RE =
  /(?:\bportrait\b|\bpeople\b|\bperson\b|\bpersons\b|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|\bchild\b|\bchildren\b|\bfamily\b|\bfamille\b|\bhomme\b|\bfemme\b|\benfant\b|\bdancer\b|\bdancers\b|\bpow[\s-]?wow\b|\bcrowd\b|\bfoule\b|\bselfie\b|\binscription on reverse\b|\bchef\b|\bchief\b|\bleder\b|\bleader\b|\bmaire\b|\bmayor\b|\bface\b|\bvisage\b|\bgroup\b|\bgroupe\b|\bmeeting\b|\br[eé]union\b|\bmanifestation\b|\bauditeurs?\b|\bprotest\b|\bgr[eè]ve\b|\bdemo(?:nstration)?\b)/i;

/** Fichiers non-image (Commons renvoie parfois audio/PDF). */
const NON_IMAGE_RE = /\.(?:wav|mp3|ogg|flac|webm|mp4|pdf|svg|djvu|stl|obj)(?:\?|$)/i;

// Hiver/neige/toundra : PAS de rejet dur (rotation saisonnière). Aligné bank-hard-audit-lib.
const BAD_SCENE_RE =
  /(?:\bnight\b|\bnuit\b|\bdark\b|\bmacro\b|\bclose[\s-]?up\b|\bgros[\s-]?plan\b|\binterior\b|\bintérieur\b|\binterieur\b|\bindoor\b|\bmuseo\b|\bmuseum\b|\bmusée\b|\bmusee\b|\boeuvre\b|\bœuvre\b|\bpainting\b|\bgravure\b|\bengraving\b|\bmicroform\b|\bletrero\b|\bsignage\b|\bboulangerie\b|\btruck\b|\bcami[oó]n\b|\bcrépuscule\b|\bcrepuscule\b|\bdawn or dusk\b|\btwilight\b|\bafter[\s-]?dark\b|\bvers\s+1[789]\d{2}\b|\b1[789]\d{2}\b|\bA\d{4,}\b|\.pp\b|\bciels? invers|\bcoulombe\b|\bcanot\b|\bcanoe\b|\bkayak\b|\bpaddle\b|\bpagaie\b|\bexhibit\b|\bexhibition\b|\bgallery\b|\bgalerie\b|\bartifact\b|\bart[eé]fact\b|\bdisplay\b|\bmashteuiatsh[\s_-]?0*\d{2,}\b|\bultramafic\b|\bwasteland\b|\brocky plain\b|\bquarry\b|\bcarri[eè]re\b|\bmudflat\b|\bbatture\b|\bmar[eé]e basse\b|\blow[\s-]?tide\b|\bunderside\b|\bunderneath\b|\bunderpass\b|\bunder[\s-]?the[\s-]?bridge\b|\bbridge[\s-]?underside\b|\bdessous de pont\b|\bsous le pont\b|\bsous[\s-]pont\b|\bsoffit\b|\bconcrete beams?\b|\bchain[\s-]?link\b|\bbarbed[\s-]?wire\b|\bbarbel[eé]\b|\bcl[oô]ture grillag|\bprison\b|\bp[eé]nitenc|\bjail\b|\bd[eé]tention\b|\bairport\b|\ba[eé]roport\b|\bairfield\b|\bhangar\b|\bwarehouse\b|\bentrep[oô]t\b|\bindustrial\b|\bzone industrielle\b|\bfactory\b|\brailway[\s_-]?track\b|\bparking[\s_-]?lot\b|\bstationnement\b|\b[eé]puration\b|\bsewage\b|\bwaste[\s-]?water\b|\bwater[\s-]?treatment\b|\btreatment[\s-]?plant\b|\bstop[\s-]?sign\b|\bstopsign\b|\bpanneau\s+d['’]?arr[eê]t\b|\bdiagram\b|\blocation\s+diagram\b|\bmap\s+of\b|\bwelcome[\s_-]?signs?|\bentrance[\s_-]?signs?|\broad[\s_-]?signs?|\broadside[\s_-]?signs?|\bcity[\s_-]?limit[\s_-]?signs?|\bmunicipal[\s_-]?signs?|\bcommunity[\s_-]?signs?|\bbillboard|\benseigne|\bpanneau|StopSign|WelcomeSign|\bplace[\s_-]?name[\s_-]?signs?|\bname[\s_-]?signs?|\bwelcome[\s_-]?board\b|\bentry[\s_-]?signs?|\bboundary[\s_-]?signs?|[_-]signs?\.(?:jpe?g|png|webp)\b)/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function stripHtml(s = '') {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function photoIdFromUrl(url) {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

function sessionStartKey(date = new Date()) {
  const start = getCurrentUniversitySessionStart(date);
  return start.toISOString().slice(0, 10);
}

function emptyBank() {
  return {
    version: 1,
    profile: PROFILE.id,
    maxBank: MAX_BANK,
    lastSessionCleanup: null,
    lastSessionId: null,
    updated: null,
    photos: [],
  };
}

function parseLegacyJsBank(jsPath) {
  if (!fs.existsSync(jsPath)) return [];
  const text = fs.readFileSync(jsPath, 'utf8');
  const entries = [];
  const re =
    /\{\s*url:\s*"([^"]+)"\s*,\s*credit:\s*"([^"]*)"\s*,\s*link:\s*"([^"]+)"\s*,\s*license:\s*"([^"]*)"\s*,\s*title:\s*"([^"]*)"\s*,?\s*\}/g;
  let m;
  while ((m = re.exec(text))) {
    entries.push({
      url: m[1],
      credit: m[2],
      link: m[3],
      license: m[4],
      title: m[5],
    });
  }
  return entries;
}

function loadBank() {
  if (fs.existsSync(JSON_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
      if (data && Array.isArray(data.photos)) {
        data.maxBank = MAX_BANK;
        return data;
      }
    } catch (e) {
      console.warn('JSON banque illisible, migration depuis JS…', e.message);
    }
  }
  const legacy = parseLegacyJsBank(LEGACY_JS);
  const now = new Date().toISOString();
  const sessionId = getCurrentUniversitySessionId();
  const bank = emptyBank();
  bank.photos = legacy.map((p, i) => ({
    id: photoIdFromUrl(p.url),
    ...p,
    addedAt: new Date(Date.now() - (legacy.length - i) * 86400000).toISOString(),
    sessionId,
    width: null,
    height: null,
    aspect: null,
  }));
  bank.updated = now;
  return bank;
}

function looksReligious(entry) {
  return looksReligiousSubject(entry);
}

function looksHardBanned(entry) {
  return matchHardBanned(entry) != null;
}

function hardBanReason(entry) {
  const hit = matchHardBanned(entry);
  return hit ? hit.reason : 'hard_banned';
}

/** Façades mairie / town hall — paysage mât/pomo uniquement. */
function looksTownHallFacade(entry) {
  return looksTownHallFacadeShared(entry);
}

function looksPeopleHeavy(entry) {
  const hay = [entry.title, entry.url, entry.link].join(' ');
  return PEOPLE_RE.test(hay);
}

function looksBadSceneTitle(entry) {
  const hay = [entry.title, entry.url, entry.link, entry.description, entry.categories]
    .filter(Boolean)
    .join(' ');
  return BAD_SCENE_RE.test(hay);
}

function looksNonImage(entry) {
  const hay = [entry.url, entry.title, entry.mime, entry.link].join(' ');
  if (NON_IMAGE_RE.test(hay)) return true;
  const mime = String(entry.mime || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return true;
  return false;
}

function isAllowedLicense(license = '') {
  const l = license.toLowerCase();
  if (!l) return true;
  if (/public domain|cc0|cc-zero|pd-/.test(l)) return true;
  if (/cc by|cc-by|creative commons/.test(l)) return true;
  if (/gfdl/.test(l)) return true;
  if (/all rights reserved|copyright|fair use|noncommercial|nc-/.test(l)) return false;
  return true;
}

function looksCampusSubject(entry) {
  const hay = [entry.title, entry.url, entry.link, entry.credit].join(' ');
  return CAMPUS_SUBJECT_RE.test(hay);
}

function looksNationsSubject(entry) {
  // description/categories Commons : « near Odanak » sans Odanak dans le filename
  const hay = [
    entry.title,
    entry.url,
    entry.link,
    entry.credit,
    entry.description,
    entry.categories,
    entry.nation,
    entry.nationId,
  ]
    .filter(Boolean)
    .join(' ');
  return NATIONS_SUBJECT_RE.test(hay);
}

function textGate(
  entry,
  { requireCampus = false, requireNations = false } = {}
) {
  if (looksNonImage(entry)) return { ok: false, reason: 'not_image' };
  if (looksHardBanned(entry)) {
    return { ok: false, reason: hardBanReason(entry) };
  }
  if (looksReligious(entry)) return { ok: false, reason: 'religious_subject' };
  // Masthead / pomo paysage : pas de façades mairie (clocher → chapelle)
  if (
    (PROFILE.id === 'masthead' || PROFILE.id === 'pomo') &&
    looksTownHallFacade(entry)
  ) {
    return { ok: false, reason: 'town_hall_facade' };
  }
  if (looksPeopleHeavy(entry)) return { ok: false, reason: 'people_subject' };
  if (looksBadSceneTitle(entry)) return { ok: false, reason: 'bad_scene_title' };
  if (!isAllowedLicense(entry.license || '')) return { ok: false, reason: 'license' };
  if (requireCampus && !looksCampusSubject(entry)) {
    return { ok: false, reason: 'not_campus_subject' };
  }
  if (requireNations && !looksNationsSubject(entry)) {
    return { ok: false, reason: 'not_nations_subject' };
  }
  return { ok: true };
}

function dimensionGate(entry) {
  const w = Number(entry.width) || 0;
  const h = Number(entry.height) || 0;
  if (w && h) {
    if (w < MIN_WIDTH) return { ok: false, reason: 'low_resolution_width' };
    if (h < MIN_HEIGHT) return { ok: false, reason: 'low_resolution_height' };
    if (w * h < MIN_PIXELS) return { ok: false, reason: 'low_resolution_pixels' };
    const ar = w / h;
    // Nations : orthophotos aériennes parfois ~1.2:1 (ex. Oujé-Bougoumou)
    const minAr = PROFILE.id === 'nations' ? 1.2 : MIN_ASPECT;
    if (ar < minAr) return { ok: false, reason: 'portrait_or_narrow' };
    entry.aspect = Math.round(ar * 1000) / 1000;
  }
  return { ok: true };
}

async function enrichFromCommons(entry) {
  const fileTitle = entry.link?.includes('File:')
    ? entry.link.split('/wiki/').pop()
    : entry.url?.match(/\/([^/]+\.(?:jpe?g|png|webp))$/i)
      ? `File:${decodeURIComponent(entry.url.match(/\/([^/]+\.(?:jpe?g|png|webp))$/i)[1])}`
      : null;
  if (!fileTitle) return entry;

  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|size|extmetadata|mime' +
    `&titles=${encodeURIComponent(fileTitle.replace(/_/g, ' '))}`;

  try {
    const data = await fetchJson(api);
    const page = Object.values(data?.query?.pages || {})[0];
    const ii = page?.imageinfo?.[0];
    if (!ii) return entry;
    const em = ii.extmetadata || {};
    const artist = sanitizeCommonsCredit(
      stripHtml(em.Artist?.value || entry.credit || '')
    );
    const license = stripHtml(em.LicenseShortName?.value || entry.license || '');
    const desc = stripHtml(em.ImageDescription?.value || entry.title || '');
    const categories = stripHtml(em.Categories?.value || '').slice(0, 400);
    return {
      ...entry,
      url: ii.url || entry.url,
      width: ii.width || entry.width,
      height: ii.height || entry.height,
      aspect: ii.width && ii.height ? Math.round((ii.width / ii.height) * 1000) / 1000 : entry.aspect,
      credit: artist || sanitizeCommonsCredit(entry.credit) || entry.credit,
      license: license || entry.license,
      title: entry.title || desc.slice(0, 80),
      description: desc.slice(0, 400) || entry.description,
      categories: categories || entry.categories,
      mime: ii.mime || entry.mime,
    };
  } catch (e) {
    console.warn('  enrich fail', entry.title || entry.url, e.message);
    return entry;
  }
}

function mapCommonsPage(p) {
  const ii = p?.imageinfo?.[0];
  if (!ii?.url) return null;
  const mime = String(ii.mime || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return null;
  if (NON_IMAGE_RE.test(ii.url) || NON_IMAGE_RE.test(p.title || '')) return null;
  if (mime === 'image/svg+xml') return null;
  const em = ii.extmetadata || {};
  const title = (p.title || '').replace(/^File:/, '').replace(/_/g, ' ');
  const license = stripHtml(em.LicenseShortName?.value || '');
  const artist = sanitizeCommonsCredit(
    stripHtml(em.Artist?.value || 'Wikimedia Commons')
  );
  const description = stripHtml(em.ImageDescription?.value || '').slice(0, 400);
  const categories = stripHtml(em.Categories?.value || '').slice(0, 400);
  return {
    id: photoIdFromUrl(ii.url),
    url: ii.url,
    link: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title).replace(/%3A/g, ':')}`,
    title: title.replace(/\.(jpe?g|png|webp)$/i, '').slice(0, 90),
    credit: artist.slice(0, 120) || 'Wikimedia Commons',
    license,
    description,
    categories,
    width: ii.width,
    height: ii.height,
    aspect: ii.width && ii.height ? Math.round((ii.width / ii.height) * 1000) / 1000 : null,
    mime: ii.mime,
  };
}

async function searchCommons(query, limit = 8) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6' +
    `&gsrlimit=${limit}` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    '&prop=imageinfo&iiprop=url|size|extmetadata|mime';
  try {
    const data = await fetchJson(api);
    const pages = Object.values(data?.query?.pages || {});
    return pages.map(mapCommonsPage).filter(Boolean);
  } catch (e) {
    console.warn('  search fail', query, e.message);
    return [];
  }
}

/** Charge un fichier Commons exact (graine File:… curatée). */
async function fetchCommonsFile(fileTitle) {
  const title = String(fileTitle || '').startsWith('File:')
    ? fileTitle
    : `File:${fileTitle}`;
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|size|extmetadata|mime' +
    `&titles=${encodeURIComponent(title.replace(/_/g, ' '))}`;
  try {
    const data = await fetchJson(api);
    const page = Object.values(data?.query?.pages || {})[0];
    if (!page || page.missing != null) return null;
    return mapCommonsPage(page);
  } catch (e) {
    console.warn('  fetch file fail', fileTitle, e.message);
    return null;
  }
}

/**
 * Openverse (Commons + Flickr + …) — source secondaire pour nations absentes.
 * API publique : https://api.openverse.org/v1/
 */
async function searchOpenverse(query, limit = 8) {
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(limit, 20)),
    license_type: 'commercial,modification',
    // wallpaper paysage
    aspect_ratio: 'wide',
    size: 'large',
  });
  const url = `https://api.openverse.org/v1/images/?${params}`;
  try {
    const data = await fetchJson(url);
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map((r) => {
        const imgUrl = r.url || r.thumbnail;
        if (!imgUrl || !/^https:\/\//i.test(imgUrl)) return null;
        // Préférer l’original Commons si présent
        const foreign =
          r.foreign_landing_url || r.foreign_landing_url || r.detail_url || '';
        const w = Number(r.width) || 0;
        const h = Number(r.height) || 0;
        const license = String(r.license || r.license_url || '')
          .replace(/^by/i, 'CC BY')
          .slice(0, 40);
        const credit = sanitizeCommonsCredit(
          stripHtml(r.creator || r.creator_name || 'Openverse')
        );
        return {
          id: photoIdFromUrl(imgUrl),
          url: imgUrl,
          link: foreign || imgUrl,
          title: String(r.title || query).replace(/\.(jpe?g|png|webp)$/i, '').slice(0, 90),
          credit: credit.slice(0, 120) || 'Openverse',
          license: license || 'CC',
          description: stripHtml(r.description || '').slice(0, 400),
          categories: '',
          width: w || null,
          height: h || null,
          aspect: w && h ? Math.round((w / h) * 1000) / 1000 : null,
          mime: r.filetype ? `image/${r.filetype}` : 'image/jpeg',
          source: 'openverse',
        };
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('  openverse fail', query, e.message);
    return [];
  }
}

function sortByAge(photos) {
  return [...photos].sort((a, b) => {
    const ta = new Date(a.addedAt || 0).getTime();
    const tb = new Date(b.addedAt || 0).getTime();
    return ta - tb; // oldest first
  });
}

/** Photos favorites / permanent: true — hors plafond et hors ménage. */
function loadFavoriteUrlSet() {
  try {
    if (!fs.existsSync(FAVORITES_JSON)) return new Set();
    const bank = JSON.parse(fs.readFileSync(FAVORITES_JSON, 'utf8'));
    return new Set(
      (bank.photos || []).map((p) => p.url).filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function isPermanentPhoto(entry, favoriteUrls = null) {
  if (!entry) return false;
  if (entry.permanent === true) return true;
  const favs = favoriteUrls || loadFavoriteUrlSet();
  return !!(entry.url && favs.has(entry.url));
}

function purgeOldest(photos, max) {
  if (photos.length <= max) return { photos, removed: [] };
  const favs = loadFavoriteUrlSet();
  const permanent = photos.filter((p) => isPermanentPhoto(p, favs));
  const mutable = photos.filter((p) => !isPermanentPhoto(p, favs));
  // Les permanentes ne comptent pas dans le plafond (ou y tiennent toujours).
  const room = Math.max(0, max - permanent.length);
  if (mutable.length <= room) {
    return { photos: [...permanent, ...mutable], removed: [] };
  }
  const sorted = sortByAge(mutable);
  const removed = sorted.slice(0, mutable.length - room);
  const keepIds = new Set(sorted.slice(mutable.length - room).map((p) => p.id));
  return {
    photos: [
      ...permanent,
      ...mutable.filter((p) => keepIds.has(p.id)),
    ],
    removed,
  };
}

/**
 * Purge en préservant au moins 1 photo par nation quand c’est possible.
 * On retire d’abord les plus anciennes des nations sur-représentées.
 */
function purgeOldestPreferNationCoverage(photos, max) {
  if (photos.length <= max) return { photos, removed: [] };
  const favs = loadFavoriteUrlSet();
  let list = photos.map((p) => nationsTaxonomy.tagPhotoNation({ ...p }));
  const removed = [];
  while (list.length > max) {
    const counts = nationsTaxonomy.coverageCounts(list);
    // Candidats : nations avec count >= 2, sinon toutes — jamais les permanentes
    const over = list.filter(
      (p) => !isPermanentPhoto(p, favs) && (counts[p.nationId] || 0) >= 2
    );
    const pool = over.length
      ? over
      : list.filter((p) => !isPermanentPhoto(p, favs));
    if (!pool.length) break;
    const oldest = sortByAge(pool)[0];
    if (!oldest) break;
    list = list.filter((p) => p.id !== oldest.id);
    removed.push(oldest);
  }
  return { photos: list, removed };
}

/** Retire une photo d’une nation déjà bien couverte (pour laisser place aux manques). */
function sacrificeOverrepresented(photos) {
  const favs = loadFavoriteUrlSet();
  const tagged = photos.map((p) => nationsTaxonomy.tagPhotoNation({ ...p }));
  const counts = nationsTaxonomy.coverageCounts(tagged);
  const over = tagged.filter(
    (p) =>
      !isPermanentPhoto(p, favs) &&
      p.nationId &&
      (counts[p.nationId] || 0) >= 2
  );
  if (!over.length) return null;
  return sortByAge(over)[0] || null;
}

function writeJsExport(photos) {
  const header = `/* LE RADAR — banque de photos de fond (généré)
 * Profil : ${PROFILE.id} (${PROFILE.label})
 * Source de vérité : ${path.relative(ROOT, JSON_PATH)}
 * Régénéré par : node scripts/maintain-quebec-backgrounds.js --update --profile ${PROFILE.id}
 * (ou : node scripts/sync-quebec-backgrounds.js)
 * Ne pas éditer à la main — le bot de session / bank:sync écrase ce fichier.
 *
 * Consommateurs : ${PROFILE.consumers}
 *
 * Politique : pas de religieux institutionnel ; nations du Québec OK ;
 * pas de personnes reconnaissables ; plafond ${MAX_BANK} ; ménage 1×/session univ.
 * Résolution mini ~1400×700 / 1.2 Mpx (anti-grain upscale).
 * focalY optionnel (0=haut, 1=bas) pour cover crop.
 * Hard-ban : scripts/quebec-backgrounds-blacklist.js
 */
`;
  const body = photos
    .map((p) => {
      const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const lines = [
        `    url: "${esc(p.url)}"`,
        `    credit: "${esc(p.credit)}"`,
        `    link: "${esc(p.link)}"`,
        `    license: "${esc(p.license)}"`,
        `    title: "${esc(p.title)}"`,
      ];
      if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
        lines.push(`    focalY: ${p.focalY}`);
      }
      if (typeof p.position === 'string' && p.position.trim()) {
        lines.push(`    position: "${esc(p.position.trim())}"`);
      }
      // Marqueur pour le bot de focale mât (computeBestFocalY mode campus).
      if (PROFILE.id === 'universities') {
        lines.push('    campus: true');
      }
      if (PROFILE.id === 'nations') {
        if (p.nationId) lines.push(`    nationId: "${esc(p.nationId)}"`);
        if (p.nation) lines.push(`    nation: "${esc(p.nation)}"`);
      }
      return `  {\n${lines.join(',\n')},\n  }`;
    })
    .join(',\n');
  const out = `${header}const ${PROFILE.globalName} = [\n${body}\n];\n`;
  fs.writeFileSync(JS_PATH, out, 'utf8');
}

function writeJsonBank(bank) {
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  bank.updated = new Date().toISOString();
  bank.maxBank = MAX_BANK;
  bank.profile = PROFILE.id;
  fs.writeFileSync(JSON_PATH, JSON.stringify(bank, null, 2) + '\n', 'utf8');
}

async function main() {
  console.log(`LE RADAR — maintain backgrounds [${PROFILE.id}] ${PROFILE.label}`);
  console.log(
    `Mode: ${doUpdate ? 'UPDATE' : 'dry-run'}${forceSession ? ' --force' : ''} · profil ${PROFILE.id}\n`
  );

  const sessionId = getCurrentUniversitySessionId();
  const sessionKey = sessionStartKey();
  const bank = loadBank();
  const subjectGate = {
    requireCampus: !!PROFILE.requireCampusSubject,
    requireNations: !!PROFILE.requireNationsSubject,
  };

  console.log(`Session univ. : ${sessionId} (début ${sessionKey})`);
  console.log(`Banque actuelle : ${bank.photos.length} / ${MAX_BANK}`);
  console.log(`Dernier ménage session : ${bank.lastSessionCleanup || 'jamais'}\n`);

  const needSessionCleanup =
    forceSession || !bank.lastSessionCleanup || bank.lastSessionCleanup !== sessionKey;

  let photos = [...bank.photos];
  const report = {
    profile: PROFILE.id,
    sessionId,
    sessionKey,
    sessionCleanup: needSessionCleanup,
    removed: [],
    added: [],
    kept: 0,
  };

  // ── 1. Revalidation / ménage de session ─────────────────────────
  if (needSessionCleanup) {
    console.log('▸ Ménage de session (revalidation + purge + découverte)');
    const kept = [];
    for (const raw of photos) {
      let entry = { ...raw };
      if (!entry.id) entry.id = photoIdFromUrl(entry.url);
      await sleep(350);
      entry = await enrichFromCommons(entry);
      const tg = textGate(entry, subjectGate);
      const dg = dimensionGate(entry);
      if (!tg.ok || !dg.ok) {
        const reason = tg.reason || dg.reason;
        // Favorites / permanent : ne jamais drop au ménage (sauf licence illégale)
        if (isPermanentPhoto(entry) && reason !== 'license' && reason !== 'not_image') {
          console.log(`  · keep permanent ${entry.title || entry.id} (skip ${reason})`);
          if (PROFILE.id === 'nations') entry = nationsTaxonomy.tagPhotoNation(entry);
          kept.push(entry);
          continue;
        }
        console.log(`  − drop ${entry.title || entry.id} (${reason})`);
        report.removed.push({ title: entry.title, reason });
        continue;
      }
      if (PROFILE.id === 'nations') entry = nationsTaxonomy.tagPhotoNation(entry);
      kept.push(entry);
    }
    photos = kept;
  } else {
    console.log('▸ Pas de ménage de session (déjà fait cette session) — purge plafond seulement');
  }

  // Étiqueter nations même hors ménage complet
  if (PROFILE.id === 'nations') {
    photos = photos.map((p) => nationsTaxonomy.tagPhotoNation(p));
  }

  // Hard-ban toujours actif (même hors ménage de session) — voir blacklist.js
  {
    const next = [];
    for (const p of photos) {
      const ban = matchHardBanned(p);
      if (ban) {
        console.log(`  − hard-ban ${p.title || p.id} (${ban.reason})`);
        report.removed.push({ title: p.title, reason: ban.reason });
        continue;
      }
      next.push(p);
    }
    photos = next;
  }

  // ── 2. Plafond : purge des plus anciennes si au-dessus de MAX_BANK ─
  {
    const before = photos.length;
    const { photos: next, removed } =
      PROFILE.id === 'nations'
        ? purgeOldestPreferNationCoverage(photos, MAX_BANK)
        : purgeOldest(photos, MAX_BANK);
    photos = next;
    for (const r of removed) {
      console.log(`  − purge oldest ${r.title || r.id}`);
      report.removed.push({ title: r.title, reason: 'oldest_over_cap' });
    }
    if (before !== photos.length) {
      console.log(`  plafond : ${before} → ${photos.length}`);
    }
  }

  // ── 3. Découverte si ménage de session ou banque sous-remplie ───
  // Nations : toujours tenter de combler les nations manquantes
  const coverageBefore =
    PROFILE.id === 'nations' ? nationsTaxonomy.coverageReport(photos) : null;
  // Remplir tant qu’on n’est pas au plafond (user : pas de « 50 max » serré).
  // Force session OU banque sous-remplie OU nations à couvrir.
  const shouldDiscover =
    needSessionCleanup ||
    photos.length < MAX_BANK ||
    (PROFILE.id === 'nations' &&
      coverageBefore &&
      coverageBefore.missing.length > 0);
  if (shouldDiscover) {
    console.log('▸ Découverte images (Commons + graines + Openverse si besoin)…');
    if (coverageBefore && coverageBefore.missing.length) {
      console.log(
        `  nations absentes : ${coverageBefore.missing.join(' · ')}`
      );
    }
    const existing = new Set(photos.map((p) => p.url));
    const existingIds = new Set(photos.map((p) => p.id));
    const queries =
      PROFILE.id === 'nations'
        ? PROFILE.discoveryQueries(sessionId, photos)
        : PROFILE.discoveryQueries(sessionId);
    const nowIso = new Date().toISOString();
    const subjectGate = {
      requireCampus: !!PROFILE.requireCampusSubject,
      requireNations: !!PROFILE.requireNationsSubject,
    };

    function tryFreeSlotForCoverage() {
      if (PROFILE.id !== 'nations') return false;
      if (photos.length < MAX_BANK) return true;
      const cov = nationsTaxonomy.coverageReport(photos);
      if (!cov.missing.length) return false;
      const sacrificed = sacrificeOverrepresented(photos);
      if (!sacrificed) return false;
      existing.delete(sacrificed.url);
      existingIds.delete(sacrificed.id);
      photos = photos.filter((p) => p.id !== sacrificed.id);
      report.removed.push({
        title: sacrificed.title,
        reason: 'rebalance_for_coverage',
      });
      console.log(`  ± libère ${sacrificed.title} (rééquilibrage)`);
      return true;
    }

    function acceptHit(hit, opts = {}) {
      if (!hit || !hit.url) return false;
      if (photos.length >= MAX_BANK && !tryFreeSlotForCoverage()) return false;
      if (existing.has(hit.url) || existingIds.has(hit.id)) return false;
      const tg = textGate(hit, subjectGate);
      const dg = dimensionGate(hit);
      if (!tg.ok || !dg.ok) return false;
      let entry = {
        ...hit,
        addedAt: nowIso,
        sessionId,
        bank: PROFILE.id,
      };
      if (opts.forceTitle) entry.title = opts.forceTitle;
      if (opts.forceNationId) {
        entry.nationId = opts.forceNationId;
      }
      if (PROFILE.id === 'nations') {
        entry = nationsTaxonomy.tagPhotoNation(entry);
      }
      photos.push(entry);
      existing.add(entry.url);
      existingIds.add(entry.id);
      report.added.push(entry.title);
      const tag = entry.nationId ? ` [${entry.nationId}]` : '';
      const src = entry.source === 'openverse' ? ' openverse' : '';
      console.log(`  + ${entry.title}${tag}${src}`);
      return true;
    }

    // ── 3a. Graines File: Commons (nations absentes, ex. Abénaquis) ──
    if (PROFILE.id === 'nations') {
      const seeds = nationsTaxonomy.curatedSeedsForMissing(photos);
      for (const seed of seeds) {
        if ((nationsTaxonomy.coverageCounts(photos)[seed.nationId] || 0) > 0) {
          continue;
        }
        await sleep(400);
        const hit = await fetchCommonsFile(seed.fileTitle);
        if (!hit) {
          console.log(`  ⚠ graine introuvable ${seed.fileTitle}`);
          continue;
        }
        // Forcer le sujet nation même si le filename n’a pas « Odanak »
        if (seed.nationId) {
          hit.nationId = seed.nationId;
          const def = nationsTaxonomy.QUEBEC_NATIONS.find(
            (n) => n.id === seed.nationId
          );
          if (def) hit.nation = def.label;
        }
        acceptHit(hit, {
          forceTitle: seed.title,
          forceNationId: seed.nationId,
        });
      }
    }

    // ── 3b. Recherche Commons plein texte ──
    for (const q of queries) {
      if (photos.length >= MAX_BANK && !tryFreeSlotForCoverage()) {
        if (PROFILE.id === 'nations') {
          const cov = nationsTaxonomy.coverageReport(photos);
          if (!cov.missing.length) break;
        } else break;
      }
      await sleep(450);
      const hits = await searchCommons(q, 8);
      for (const hit of hits) {
        if (photos.length >= MAX_BANK && !tryFreeSlotForCoverage()) break;
        acceptHit(hit);
      }
    }

    // ── 3c. Openverse (source secondaire) si nations encore absentes ──
    if (PROFILE.id === 'nations') {
      const ovJobs = nationsTaxonomy.openverseQueriesForMissing(photos);
      if (ovJobs.length) {
        console.log(`  ▸ Openverse (${ovJobs.length} requête(s) nations manquantes)…`);
      }
      for (const job of ovJobs) {
        if ((nationsTaxonomy.coverageCounts(photos)[job.nationId] || 0) > 0) {
          continue;
        }
        await sleep(500);
        const hits = await searchOpenverse(job.query, 8);
        for (const hit of hits) {
          if ((nationsTaxonomy.coverageCounts(photos)[job.nationId] || 0) > 0) {
            break;
          }
          hit.nationId = job.nationId;
          const def = nationsTaxonomy.QUEBEC_NATIONS.find(
            (n) => n.id === job.nationId
          );
          if (def) hit.nation = def.label;
          // Injecter le nom de communauté dans description pour le gate nations
          hit.description = `${hit.description || ''} ${def ? def.label : ''} ${
            (def && def.communities && def.communities[0]) || job.nationId
          }`.trim();
          acceptHit(hit, { forceNationId: job.nationId });
        }
      }
    }
  }

  // Re-cap après découverte
  {
    const { photos: next, removed } =
      PROFILE.id === 'nations'
        ? purgeOldestPreferNationCoverage(photos, MAX_BANK)
        : purgeOldest(photos, MAX_BANK);
    photos = next;
    for (const r of removed) {
      report.removed.push({ title: r.title, reason: 'oldest_over_cap' });
    }
  }

  if (PROFILE.id === 'nations') {
    photos = photos.map((p) => nationsTaxonomy.tagPhotoNation(p));
  }

  report.kept = photos.length;
  // Trier pour export stable : plus récentes d’abord (fraîcheur perçue)
  photos = [...photos].sort(
    (a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
  );

  bank.photos = photos;
  if (PROFILE.id === 'nations') {
    bank.nationCoverage = nationsTaxonomy.coverageReport(photos);
  }
  if (needSessionCleanup) {
    bank.lastSessionCleanup = sessionKey;
    bank.lastSessionId = sessionId;
  }

  console.log(`\nRésultat : ${photos.length} photos (retirées ${report.removed.length}, ajoutées ${report.added.length})`);
  if (PROFILE.id === 'nations') {
    const cov = nationsTaxonomy.coverageReport(photos);
    console.log('\n▸ Couverture des 11 nations autochtones du Québec :');
    for (const row of cov.rows) {
      const mark = row.count > 0 ? '✓' : '✗';
      console.log(`  ${mark} ${row.label}: ${row.count}`);
    }
    if (cov.missing.length) {
      console.log(
        `\n  ⚠ Encore absentes (${cov.missing.length}/${cov.totalNations}) : ${cov.missing.join(' · ')}`
      );
    } else {
      console.log('\n  ✓ Toutes les nations sont représentées.');
    }
  }

  if (!doUpdate) {
    console.log('\nDry-run — aucune écriture. Relancer avec --update pour persister.');
    return;
  }

  writeJsonBank(bank);
  writeJsExport(photos);
  console.log(`✅ ${path.relative(ROOT, JSON_PATH)}`);
  console.log(`✅ ${path.relative(ROOT, JS_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
const { createPhotoWebSources } = require('./photo-web-sources');
const { sanitizeCommonsCredit } = require('./commons-credit-lib');
const {
  looksReligiousSubject,
  looksTownHallFacade: looksTownHallFacadeShared,
} = require('./religious-facade-lib');
const {
  looksSpeciesMacro,
  looksPeopleScene,
  looksVernacularBuilding,
  looksFaceDetected,
} = require('./wallpaper-subject-lib');
const {
  enrichPhotoSeasons,
  getCurrentSeason4,
  resolveItemSeason4,
  resolveItemSeason6,
  seasonTagTrusted,
  SEASON4,
  SEASON6,
  season4ToSeason6,
  season6ToSeason4,
} = require('./season-lib');

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
/**
 * Inventaire multi-saisons **permanent** (JSON git + *-data.js shell = « serveur »).
 * Le runtime ne re-découvre jamais : il tire dans cette banque.
 * Le bot maintain ne fait que combler les trous sous le plancher / purger le surplus.
 * Clés = saison 4 (nations : mappées en season6 à l’acceptation).
 */
const SEASON_MIN_BY_PROFILE = {
  masthead: { printemps: 22, ete: 30, automne: 22, hiver: 22 },
  pomo: { printemps: 18, ete: 24, automne: 18, hiver: 18 },
  universities: { printemps: 8, ete: 12, automne: 8, hiver: 8 },
  nations: { printemps: 4, ete: 6, automne: 4, hiver: 6 },
};
/** Planchers PNI — 6 saisons Nunavik (éducatif). */
const SEASON6_MIN_NATIONS = {
  ukiuq: 6,
  upingaksaaq: 4,
  upingaaq: 4,
  aujaq: 6,
  ukiaqsaaq: 4,
  ukiaq: 4,
};
/** Banque favorites manuelle — URLs jamais purgées par ce bot. */
const FAVORITES_JSON = path.join(ROOT, 'data', 'quebec-favorites-backgrounds.json');
/**
 * Résolution native mini — mât / pomo plein écran retina.
 * Sous ~1.2 Mpx / 1400 px de large, le cover upscale montre du grain.
 */
const MIN_WIDTH = 1400;
const MIN_HEIGHT = 700;
const MIN_PIXELS = 1_200_000;
const UA = 'LeRadar-bg-maintain/1.3 (https://le-radar.ca; multi-season permanent inventory)';

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
      'incategory:"McGill University" printemps OR spring OR May',
      'incategory:"Université Laval" printemps OR mai',
      'intitle:Pavillon Laval -neige -hiver -winter',
      'intitle:"Pavillon Adrien-Pouliot"',
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
  /(?:\bportrait\b|\bpeople\b|\bperson\b|\bpersons\b|\bman\b|\bwoman\b|\bmen\b|\bwomen\b|\bchild\b|\bchildren\b|\bfamily\b|\bfamille\b|\bhomme\b|\bfemme\b|\benfant\b|\bcrowd\b|\bfoule\b|\bselfie\b|\binscription on reverse\b|\bchef\b|\bchief\b|\bleder\b|\bleader\b|\bmaire\b|\bmayor\b|\bface\b|\bvisage\b|\bgroup\b|\bgroupe\b|\bmeeting\b|\br[eé]union\b|\bmanifestation\b|\bauditeurs?\b|\bprotest\b|\bgr[eè]ve\b|\bdemo(?:nstration)?\b)/i;

/** Fichiers non-image (Commons renvoie parfois audio/PDF). */
const NON_IMAGE_RE = /\.(?:wav|mp3|ogg|flac|webm|mp4|pdf|svg|djvu|stl|obj)(?:\?|$)/i;

// Hiver/neige/toundra : PAS de rejet dur (rotation saisonnière). Aligné bank-hard-audit-lib.
const BAD_SCENE_RE =
  /(?:\bnight\b|\bnuit\b|\bdark\b|\bmacro\b|\bclose[\s-]?up\b|\bgros[\s-]?plan\b|\binterior\b|\bintérieur\b|\binterieur\b|\bindoor\b|\bmuseo\b|\bmuseum\b|\bmusée\b|\bmusee\b|\boeuvre\b|\bœuvre\b|\bpainting\b|\bgravure\b|\bengraving\b|\bmicroform\b|\bletrero\b|\bsignage\b|\bboulangerie\b|\btruck\b|\bcami[oó]n\b|\bcrépuscule\b|\bcrepuscule\b|\bdawn or dusk\b|\btwilight\b|\bafter[\s-]?dark\b|\bvers\s+1[789]\d{2}\b|\b1[789]\d{2}\b|\bA\d{4,}\b|\.pp\b|\bciels? invers|\bcoulombe\b|\bcanot\b|\bcanoe\b|\bkayak\b|\bpaddle\b|\bpagaie\b|\bexhibit\b|\bexhibition\b|\bgallery\b|\bgalerie\b|\bartifact\b|\bart[eé]fact\b|\bdisplay\b|\bjourn[ée]e contributive\b|\bcontribution day\b|\bwikiphys\b|\b1870s\b|\bkilburn brothers\b|\bmashteuiatsh[\s_-]?0*\d{2,}\b|\bultramafic\b|\bwasteland\b|\brocky plain\b|\bquarry\b|\bcarri[eè]re\b|\bmudflat\b|\bbatture\b|\bmar[eé]e basse\b|\blow[\s-]?tide\b|\bunderside\b|\bunderneath\b|\bunderpass\b|\bunder[\s-]?the[\s-]?bridge\b|\bbridge[\s-]?underside\b|\bdessous de pont\b|\bsous le pont\b|\bsous[\s-]pont\b|\bsoffit\b|\bconcrete beams?\b|\bchain[\s-]?link\b|\bbarbed[\s-]?wire\b|\bbarbel[eé]\b|\bcl[oô]ture grillag|\bprison\b|\bp[eé]nitenc|\bjail\b|\bd[eé]tention\b|\bairport\b|\ba[eé]roport\b|\bairfield\b|\bhangar\b|\bwarehouse\b|\bentrep[oô]t\b|\bindustrial\b|\bzone industrielle\b|\bfactory\b|\brailway[\s_-]?track\b|\bparking[\s_-]?lot\b|\bstationnement\b|\b[eé]puration\b|\bsewage\b|\bwaste[\s-]?water\b|\bwater[\s-]?treatment\b|\btreatment[\s-]?plant\b|\bstop[\s-]?sign\b|\bstopsign\b|\bpanneau\s+d['’]?arr[eê]t\b|\bdiagram\b|\blocation\s+diagram\b|\bmap\s+of\b|\bwelcome[\s_-]?signs?|\bentrance[\s_-]?signs?|\broad[\s_-]?signs?|\broadside[\s_-]?signs?|\bcity[\s_-]?limit[\s_-]?signs?|\bmunicipal[\s_-]?signs?|\bcommunity[\s_-]?signs?|\bbillboard|\benseigne|\bpanneau|StopSign|WelcomeSign|\bplace[\s_-]?name[\s_-]?signs?|\bname[\s_-]?signs?|\bwelcome[\s_-]?board\b|\bentry[\s_-]?signs?|\bboundary[\s_-]?signs?|[_-]signs?\.(?:jpe?g|png|webp)\b)/i;

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

function isAllowedLicense(_license = '') {
  // Crédit à l’écran ; retrait sur demande (courriel du pied de page).
  // Ne plus rejeter ARR / NC / inconnue — ça écartait surtout nations / favorites.
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

/**
 * Ancrage Québec / territoires (évite Bourgogne, Ontario, Italie injectés via forceNationId).
 * Testé sur titre + URL + lien d’origine — pas sur la description injectée.
 */
const QUEBEC_PLACE_RE =
  /\b(qu[eé]bec|qu[eé]becois|montr[eé]al|gasp[eé]|mauricie|laurentid|outaouais|saguenay|lac[\s-]?saint[\s-]?jean|nunavik|nunavut|odanak|w[oô]linak|pierreville|manawan|wemotaci|opitciwan|kitigan|lac[\s-]?simon|mistissini|chisasibi|waswanipi|kuujjuaq|kangirsuk|pingualuit|mashteuiatsh|pessamit|listuguj|gesgapegiag|kahnaw|kanehsat|wendake|akwesasne|charlevoix|abitibi|c[oô]te[\s-]?nord|estrie|cantons|perc[eé]|forillon|gatineau|temiscaming|t[eé]miscaming|baie[\s-]?james|james[\s-]?bay|eeyou|eenou|nitassinan|atikamekw|innu|ilnu|mi['’]?g?maq|mohawk|wendat|naskapi|ab[eé]naki|w8banaki|anishinaab|mal[eé]cite|wolastoq|inuit|inuk)\b/i;

function looksQuebecPlace(entry) {
  const hay = [entry.title, entry.url, entry.link, entry.categories]
    .filter(Boolean)
    .join(' ');
  return QUEBEC_PLACE_RE.test(hay);
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
  // Personnes décrites hors du titre : PEOPLE_RE ne lit que titre/URL/lien, et
  // un toponyme numéroté (« Havre St Pierre 006 ») ne dit rien de la scène.
  if (looksPeopleScene(entry)) return { ok: false, reason: 'people_scene' };
  // Visage mesuré au pixel (detect-photo-faces) — muet si la passe n'a pas tourné.
  if (looksFaceDetected(entry)) return { ok: false, reason: 'face_subject' };
  // Photo de spécimen : catégorie taxon / binôme latin = plan rapproché.
  if (looksSpeciesMacro(entry)) return { ok: false, reason: 'macro_closeup' };
  if (looksVernacularBuilding(entry)) {
    return { ok: false, reason: 'vernacular_building' };
  }
  if (looksBadSceneTitle(entry)) return { ok: false, reason: 'bad_scene_title' };
  if (!isAllowedLicense(entry.license || '')) return { ok: false, reason: 'license' };
  if (requireCampus && !looksCampusSubject(entry)) {
    return { ok: false, reason: 'not_campus_subject' };
  }
  if (requireNations && !looksNationsSubject(entry)) {
    return { ok: false, reason: 'not_nations_subject' };
  }
  // Banque nations : toujours un ancrage QC / territoire (anti faux positifs Europe).
  if (requireNations && !looksQuebecPlace(entry)) {
    return { ok: false, reason: 'not_quebec_place' };
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

/** Membres d’une catégorie Commons (source élargie, hors fulltext). */
async function searchCommonsCategory(category, limit = 12) {
  const cat = String(category || '').replace(/^Category:/i, '');
  if (!cat) return [];
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=categorymembers&gcmnamespace=6' +
    `&gcmtitle=${encodeURIComponent(`Category:${cat}`)}` +
    `&gcmlimit=${Math.min(limit, 20)}` +
    '&prop=imageinfo&iiprop=url|size|extmetadata|mime';
  try {
    const data = await fetchJson(api);
    const pages = Object.values(data?.query?.pages || {});
    return pages
      .map(mapCommonsPage)
      .filter(Boolean)
      .map((p) => ({ ...p, source: p.source || 'commons-cat' }));
  } catch (e) {
    console.warn('  category fail', cat, e.message);
    return [];
  }
}

/**
 * Openverse multi-sources (Wikimedia, Flickr, Rawpixel, …).
 * @param {string} query
 * @param {number} [limit]
 * @param {{ source?: string }} [opts] — ex. source=flickr|wikimedia
 */
async function searchOpenverseMulti(query, limit = 10, opts = {}) {
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(limit, 20)),
    aspect_ratio: 'wide',
    size: 'large',
  });
  if (opts.source) params.set('source', opts.source);
  const url = `https://api.openverse.org/v1/images/?${params}`;
  try {
    const data = await fetchJson(url);
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map((r) => {
        const imgUrl = r.url || r.thumbnail;
        if (!imgUrl || !/^https:\/\//i.test(imgUrl)) return null;
        const foreign = r.foreign_landing_url || r.detail_url || '';
        const w = Number(r.width) || 0;
        const h = Number(r.height) || 0;
        const license = String(r.license || r.license_url || '')
          .replace(/^by-sa/i, 'CC BY-SA')
          .replace(/^by/i, 'CC BY')
          .replace(/^cc0/i, 'CC0')
          .slice(0, 40);
        const credit = sanitizeCommonsCredit(
          stripHtml(r.creator || r.creator_name || r.source || 'Openverse')
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
    console.warn('  openverse multi fail', query, e.message);
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
    // wallpaper paysage — plus de filtre licence Openverse (NC admis ; crédit + retrait)
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
    const urls = [];
    if (fs.existsSync(FAVORITES_JSON)) {
      const bank = JSON.parse(fs.readFileSync(FAVORITES_JSON, 'utf8'));
      urls.push(...(bank.photos || []).map((p) => p.url).filter(Boolean));
    }
    const unifiedPath = path.join(ROOT, 'data', 'photo-bank.json');
    if (fs.existsSync(unifiedPath)) {
      const uni = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));
      for (const p of uni.photos || []) {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        if (p.permanent || p.campus || tags.includes('favori') || tags.includes('campus')) {
          if (p.url) urls.push(p.url);
        }
      }
    }
    return new Set(urls);
  } catch {
    return new Set();
  }
}

function isPermanentPhoto(entry, favoriteUrls = null) {
  if (!entry) return false;
  if (entry.permanent === true || entry.campus === true) return true;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (tags.includes('favori') || tags.includes('campus')) return true;
  const favs = favoriteUrls || loadFavoriteUrlSet();
  return !!(entry.url && favs.has(entry.url));
}

/** Compte photos par saison 4 (enrichit à la volée si tag manquant). */
function countSeasons4(photos, profileId = 'masthead') {
  const counts = { printemps: 0, ete: 0, automne: 0, hiver: 0, untagged: 0 };
  for (const p of photos || []) {
    enrichPhotoSeasons(p, profileId);
    const s = resolveItemSeason4(p);
    if (s && counts[s] != null) counts[s] += 1;
    else counts.untagged += 1;
  }
  return counts;
}

function seasonFloorsForProfile(profileId) {
  if (profileId === 'nations') return { ...SEASON6_MIN_NATIONS };
  return SEASON_MIN_BY_PROFILE[profileId] || SEASON_MIN_BY_PROFILE.masthead;
}

function countSeasonsForProfile(photos, profileId = 'masthead') {
  if (profileId === 'nations') {
    const counts = { untagged: 0 };
    for (const id of SEASON6) counts[id] = 0;
    for (const p of photos || []) {
      enrichPhotoSeasons(p, profileId);
      const s = resolveItemSeason6(p);
      if (s && counts[s] != null) counts[s] += 1;
      else counts.untagged += 1;
    }
    return counts;
  }
  return countSeasons4(photos, profileId);
}

/** Saisons sous le plancher (inventaire permanent incomplet). */
function seasonGaps(photos, profileId) {
  const floors = seasonFloorsForProfile(profileId);
  const counts = countSeasonsForProfile(photos, profileId);
  const keys = profileId === 'nations' ? SEASON6 : SEASON4;
  return keys.filter((s) => (counts[s] || 0) < (floors[s] || 0)).map((s) => ({
    season: s,
    have: counts[s] || 0,
    need: floors[s] || 0,
    deficit: (floors[s] || 0) - (counts[s] || 0),
  }));
}

/**
 * Requêtes Commons dédiées à combler une saison (une fois → stock permanent).
 * Pas de redécouverte au runtime : seulement le bot maintain.
 */
function seasonGapQueries(season) {
  const table = {
    printemps: [
      'Québec printemps paysage -neige -snow -hiver',
      'printemps Laurentides paysage',
      'printemps Charlevoix paysage',
      'printemps Gaspésie',
      'dégel rivière Québec',
      'printemps érable Québec',
      'bourgeons forêt Québec',
      'fleuve Saint-Laurent printemps',
      'spring landscape Quebec -winter -snow',
      'Mauricie spring landscape',
      'Estrie printemps paysage',
      'Outaouais printemps lac',
      'Bas-Saint-Laurent printemps',
      'Québec city spring landscape -snow',
      'Montreal spring park landscape -snow',
      'Saguenay printemps paysage -glace',
    ],
    ete: [
      'Québec été lac paysage -neige -snow',
      'Charlevoix été paysage',
      'Parc national de la Mauricie été',
      'Gaspésie été littoral -hiver',
      'Îles-de-la-Madeleine été',
      'Forillon national park summer',
      'Gatineau park summer landscape',
      'Mont-Tremblant été -ski -snow',
      'lac Memphrémagog été',
      'Parc national du Bic été',
      'Saguenay été paysage -frozen -glace',
      'Percé été -hiver',
      'Cap Bon-Ami Forillon summer',
      'Abitibi lac été',
      'lac Saint-Jean été',
      'campus Québec été exterior -winter',
    ],
    automne: [
      'érable automne Québec',
      'maple autumn Quebec landscape',
      'forêt automnale Québec',
      'Charlevoix automne',
      'Laurentides automne feuilles',
      'Parc national Mauricie automne',
      'Cantons-de-l\'Est automne',
      'Québec city autumn foliage',
      'fall colors Quebec landscape',
      'Outaouais automne paysage',
    ],
    hiver: [
      'Québec hiver paysage jour neige',
      'Montreal winter landscape day snow',
      'Laurentides hiver neige paysage',
      'Charlevoix hiver paysage',
      'Gaspésie hiver paysage',
      'Québec city winter skyline day',
    ],
    ukiuq: [
      'Nunavik winter landscape snow December January',
      'Kuujjuaq winter landscape -people',
      'Pingualuit winter snow -people',
    ],
    upingaksaaq: [
      'Nunavik March melt ice landscape',
      'Nunavik late winter thaw -people',
      'Kuujjuarapik March landscape -people',
    ],
    upingaaq: [
      'Nunavik spring May landscape -snow -people',
      'Kangirsuk spring landscape -people',
      'Nunavik June tundra -people',
    ],
    aujaq: [
      'Nunavik July tundra green landscape -people',
      'Pingualuit summer landscape -people',
      'Salluit summer landscape -people',
    ],
    ukiaqsaaq: [
      'Nunavik August landscape tundra -people',
      'Nunavik September landscape -people',
      'Kangiqsujuaq late summer -people',
    ],
    ukiaq: [
      'Nunavik October landscape autumn -people',
      'Nunavik November tundra -people',
      'Kuujjuaq autumn landscape -people',
    ],
  };
  return table[season] || [];
}

/**
 * Purge plafond en protégeant le plancher saisonnier :
 * on retire d’abord le surplus des saisons au-dessus du plancher (plus anciennes).
 * Jamais de saison sous le plancher pour « faire de la place » — inventaire permanent.
 */
function purgeOldest(photos, max, profileId = 'masthead') {
  if (photos.length <= max) return { photos, removed: [] };
  const favs = loadFavoriteUrlSet();
  const floors = seasonFloorsForProfile(profileId);
  const permanent = photos.filter((p) => isPermanentPhoto(p, favs));
  let mutable = photos.filter((p) => !isPermanentPhoto(p, favs));
  const room = Math.max(0, max - permanent.length);
  if (mutable.length <= room) {
    return { photos: [...permanent, ...mutable], removed: [] };
  }

  const removed = [];
  // Annoter saisons
  for (const p of mutable) enrichPhotoSeasons(p, profileId);

  while (mutable.length > room) {
    const counts = countSeasons4([...permanent, ...mutable], profileId);
    // Candidats = saisons strictement au-dessus du plancher
    const over = mutable.filter((p) => {
      const s = resolveItemSeason4(p);
      if (!s) return true; // untagged d’abord si besoin de place
      return (counts[s] || 0) > (floors[s] || 0);
    });
    const pool = over.length ? over : mutable;
    const oldest = sortByAge(pool)[0];
    if (!oldest) break;
    mutable = mutable.filter((p) => p.id !== oldest.id);
    removed.push(oldest);
  }

  return { photos: [...permanent, ...mutable], removed };
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
 * Inventaire multi-saisons permanent (planchers SEASON_MIN) — pas de re-discovery runtime.
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
      // Même contrat que sync-quebec-backgrounds.js : seulement les tags fiables.
      if (seasonTagTrusted(p)) {
        if (p.season) lines.push(`    season: "${esc(p.season)}"`);
        if (p.season6) lines.push(`    season6: "${esc(p.season6)}"`);
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

  const extraSources = createPhotoWebSources({
    fetchJson,
    mapCommonsPage,
    fetchCommonsFile,
  });

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
        // Favorites / permanent : ne jamais drop au ménage (sauf non-image)
        if (isPermanentPhoto(entry) && reason !== 'not_image') {
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

  // Étiqueter saisons (inventaire permanent en JSON)
  photos = photos.map((p) => enrichPhotoSeasons({ ...p }, PROFILE.id));

  // ── 2. Plafond : purge surplus seulement (protège planchers saisonniers) ─
  {
    const before = photos.length;
    const { photos: next, removed } =
      PROFILE.id === 'nations'
        ? purgeOldestPreferNationCoverage(photos, MAX_BANK)
        : purgeOldest(photos, MAX_BANK, PROFILE.id);
    photos = next;
    for (const r of removed) {
      console.log(`  − purge oldest ${r.title || r.id}`);
      report.removed.push({ title: r.title, reason: 'oldest_over_cap' });
    }
    if (before !== photos.length) {
      console.log(`  plafond : ${before} → ${photos.length}`);
    }
  }

  // ── 3. Découverte : session / sous-remplissage / trous de saison / nations ──
  const coverageBefore =
    PROFILE.id === 'nations' ? nationsTaxonomy.coverageReport(photos) : null;
  const gapsBefore = seasonGaps(photos, PROFILE.id);
  // Remplir tant qu’on n’est pas au plafond ou qu’une saison est sous plancher.
  // Pas de re-discovery au runtime : seulement ici, et seulement les manques.
  const shouldDiscover =
    needSessionCleanup ||
    photos.length < MAX_BANK ||
    gapsBefore.length > 0 ||
    (PROFILE.id === 'nations' &&
      coverageBefore &&
      coverageBefore.missing.length > 0);

  const existing = new Set(photos.map((p) => p.url));
  const existingIds = new Set(photos.map((p) => p.id));
  const nowIso = new Date().toISOString();

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

  /** Libère une place en retirant le surplus d’une saison au-dessus du plancher. */
  function tryFreeSlotForSeasonGap() {
    if (photos.length < MAX_BANK) return true;
    const floors = seasonFloorsForProfile(PROFILE.id);
    const favs = loadFavoriteUrlSet();
    const counts = countSeasons4(photos, PROFILE.id);
    const over = photos.filter((p) => {
      if (isPermanentPhoto(p, favs)) return false;
      const s = resolveItemSeason4(p);
      if (!s) return true;
      return (counts[s] || 0) > (floors[s] || 0);
    });
    if (!over.length) return false;
    const oldest = sortByAge(over)[0];
    if (!oldest) return false;
    existing.delete(oldest.url);
    existingIds.delete(oldest.id);
    photos = photos.filter((p) => p.id !== oldest.id);
    report.removed.push({ title: oldest.title, reason: 'make_room_season_floor' });
    console.log(`  ± libère ${oldest.title} (place pour plancher saison)`);
    return true;
  }

  function acceptHit(hit, opts = {}) {
    if (!hit || !hit.url) return false;
    if (photos.length >= MAX_BANK) {
      if (opts.forSeason) {
        if (!tryFreeSlotForSeasonGap()) return false;
      } else if (!tryFreeSlotForCoverage()) {
        return false;
      }
    }
    if (existing.has(hit.url) || existingIds.has(hit.id)) return false;

    let entry = {
      ...hit,
      addedAt: nowIso,
      sessionId,
      bank: PROFILE.id,
    };
    if (opts.forceTitle) entry.title = opts.forceTitle;
    // Ancrage QC sur le hit *d’origine* (avant injection nation en description).
    if (PROFILE.id === 'nations' && !looksQuebecPlace(entry)) {
      return false;
    }
    if (opts.forceNationId) {
      entry.nationId = opts.forceNationId;
      const def = nationsTaxonomy.QUEBEC_NATIONS.find((n) => n.id === opts.forceNationId);
      if (def) {
        entry.nation = def.label;
        // Territoire / communauté dans description → gate nations (sources élargies)
        entry.description = [
          entry.description || '',
          def.label,
          ...(def.communities || []).slice(0, 2),
          ...(def.aliases || []).slice(0, 2),
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
      }
    }
    if (PROFILE.id === 'nations') {
      entry = nationsTaxonomy.tagPhotoNation(entry);
    }

    const tg = textGate(entry, subjectGate);
    const dg = dimensionGate(entry);
    if (!tg.ok || !dg.ok) return false;

    enrichPhotoSeasons(entry, PROFILE.id);
    // Cible saison : rejeter si autre saison détectée ; sinon assigner (requête dédiée).
    if (opts.forSeason) {
      const want6 = SEASON6.includes(opts.forSeason);
      if (want6) {
        const got = resolveItemSeason6(entry);
        if (got && got !== opts.forSeason) return false;
        if (!got) {
          entry.season6 = opts.forSeason;
          entry.season = season6ToSeason4(opts.forSeason) || entry.season;
          entry.seasonSource = 'balance-query';
          entry.seasonConfidence = 0.55;
        }
      } else {
        const got = resolveItemSeason4(entry);
        if (got && got !== opts.forSeason) return false;
        if (!got) {
          entry.season = opts.forSeason;
          entry.seasonSource = 'balance-query';
          entry.seasonConfidence = 0.55;
          if (PROFILE.id === 'nations') {
            entry.season6 = season4ToSeason6(opts.forSeason);
          }
        }
      }
    }
    photos.push(entry);
    existing.add(entry.url);
    existingIds.add(entry.id);
    report.added.push(entry.title);
    const tag = entry.nationId ? ` [${entry.nationId}]` : '';
    const src = entry.source === 'openverse' ? ' openverse' : entry.source === 'commons-cat' ? ' cat' : '';
    const sTag = entry.season ? ` · ${entry.season}` : '';
    console.log(`  + ${entry.title}${tag}${src}${sTag}`);
    return true;
  }

  if (shouldDiscover) {
    console.log('▸ Découverte images (Commons + graines + Openverse si besoin)…');
    if (coverageBefore && coverageBefore.missing.length) {
      console.log(
        `  nations absentes : ${coverageBefore.missing.join(' · ')}`
      );
    }
    if (gapsBefore.length) {
      console.log(
        `  saisons sous plancher : ${gapsBefore
          .map((g) => `${g.season} ${g.have}/${g.need}`)
          .join(' · ')}`
      );
    }
    const queries =
      PROFILE.id === 'nations'
        ? PROFILE.discoveryQueries(sessionId, photos)
        : PROFILE.discoveryQueries(sessionId);

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

  // ── 3d. Inventaire permanent : combler UNIQUEMENT les saisons sous plancher ──
  // Sources élargies : Commons fulltext + catégories + Openverse (Flickr/Wikimedia…).
  // Jamais d’image générée — uniquement médias réels librement licenciés.
  // Une fois le plancher atteint, les runs suivants ne re-découvrent plus.
  {
    const gaps = seasonGaps(photos, PROFILE.id);
    if (gaps.length) {
      console.log(
        `▸ Comblement inventaire saisons (plancher permanent) : ${gaps
          .map((g) => `${g.season} ${g.have}→${g.need}`)
          .join(' · ')}`
      );
      const ordered = [...gaps].sort((a, b) => b.deficit - a.deficit);

      /** @type {Record<string, string[]>} */
      const seasonCats = {
        automne: [
          'Autumn in Quebec',
          'Fall foliage in Canada',
          'La Mauricie National Park',
          'Parc national de la Gaspésie',
        ],
        printemps: [
          'Spring in Quebec',
          'Rivers of Quebec',
          'Gatineau Park',
        ],
        ete: [
          'Summer in Quebec',
          'La Mauricie National Park',
          'Percé',
          'Forillon National Park',
        ],
        hiver: ['Winter in Quebec', 'Snow in Quebec'],
        ukiuq: ['Winter in Nunavik', 'Snow in Nunavik'],
        upingaksaaq: ['Nunavik'],
        upingaaq: ['Nunavik'],
        aujaq: ['Nunavik'],
        ukiaqsaaq: ['Nunavik'],
        ukiaq: ['Autumn in Quebec', 'Nunavik'],
      };

      /**
       * Nations : requêtes territoire + nation (gate requireNations).
       * Paysages de territoires traditionnels, pas de portraits.
       */
      function nationsSeasonJobs(season) {
        const seasonWord =
          season === 'upingaksaaq'
            ? 'February OR March OR melt OR dégel OR breakup OR thaw'
            : season === 'upingaaq' || season === 'printemps'
              ? 'spring OR printemps OR May OR avril'
              : season === 'ukiaqsaaq'
                ? 'August OR September OR "late summer" OR "fin d\'été"'
              : season === 'ukiaq' || season === 'automne'
                ? 'autumn OR fall OR automne OR foliage OR érable OR maple'
                : season === 'aujaq' || season === 'ete'
                  ? 'summer OR été OR green landscape OR July OR June'
                  : 'winter OR hiver OR snow OR neige OR December OR January';
        const jobs = [];
        for (const def of nationsTaxonomy.QUEBEC_NATIONS) {
          const place = (def.communities && def.communities[0]) || def.label;
          jobs.push({
            nationId: def.id,
            queries: [
              `${place} Quebec landscape ${seasonWord} -people -portrait -church -map`,
              `${def.label} Quebec ${seasonWord} landscape -people -portrait`,
              ...(def.queries || [])
                .slice(0, 2)
                .map((q) => `${q} ${season === 'automne' ? 'autumn OR automne' : season === 'printemps' ? 'spring OR printemps' : season === 'ete' ? 'summer OR été' : 'winter OR hiver'}`),
            ],
          });
        }
        // Territoires élargis (parcs / régions liés aux nations)
        const territory = {
          automne: [
            { nationId: 'atikamekw', q: 'La Mauricie National Park autumn fall foliage -people' },
            { nationId: 'atikamekw', q: 'Mauricie automne forêt -people -portrait' },
            { nationId: 'algonquin', q: 'Gatineau Park autumn foliage -people' },
            { nationId: 'algonquin', q: 'Outaouais automne paysage -people' },
            { nationId: 'migmaq', q: 'Gaspésie automne paysage -people' },
            { nationId: 'migmaq', q: 'Percé autumn landscape -people' },
            { nationId: 'innu', q: 'Saguenay autumn landscape -people' },
            { nationId: 'innu', q: 'Côte-Nord automne paysage -people' },
            { nationId: 'cree', q: 'James Bay Quebec landscape autumn -people' },
            { nationId: 'abenaki', q: 'Saint-François River autumn landscape -people' },
          ],
          printemps: [
            { nationId: 'atikamekw', q: 'Mauricie spring landscape river -people -snow' },
            { nationId: 'algonquin', q: 'Gatineau Park spring landscape -people' },
            { nationId: 'migmaq', q: 'Gaspésie printemps paysage -people -neige' },
            { nationId: 'innu', q: 'Saguenay spring landscape -people' },
            { nationId: 'abenaki', q: 'Rivière Saint-François printemps -people' },
            { nationId: 'maliseet', q: 'Bas-Saint-Laurent printemps paysage -people' },
          ],
          ete: [
            { nationId: 'inuit', q: 'Nunavik summer landscape tundra green -people -portrait' },
            { nationId: 'cree', q: 'Mistissini landscape summer -people' },
            { nationId: 'atikamekw', q: 'Manawan Quebec landscape summer -people' },
            { nationId: 'migmaq', q: 'Listuguj OR Gaspésie summer coastline -people' },
          ],
          hiver: [
            { nationId: 'inuit', q: 'Nunavik winter landscape snow -people -portrait' },
            { nationId: 'atikamekw', q: 'Manawan winter landscape -people' },
          ],
          ukiuq: [
            { nationId: 'inuit', q: 'Nunavik winter December January snow landscape -people' },
            { nationId: 'inuit', q: 'Kuujjuaq winter landscape snow -people -portrait' },
          ],
          upingaksaaq: [
            { nationId: 'inuit', q: 'Nunavik March melt ice breakup landscape -people' },
            { nationId: 'inuit', q: 'Nunavik late winter thaw landscape -people' },
            { nationId: 'atikamekw', q: 'Mauricie March snow melt landscape -people' },
          ],
          upingaaq: [
            { nationId: 'inuit', q: 'Nunavik spring May landscape -people -snow' },
            { nationId: 'atikamekw', q: 'Mauricie spring landscape river -people' },
            { nationId: 'algonquin', q: 'Gatineau Park spring landscape -people' },
          ],
          aujaq: [
            { nationId: 'inuit', q: 'Nunavik July tundra green landscape -people' },
            { nationId: 'cree', q: 'Mistissini landscape summer -people' },
            { nationId: 'atikamekw', q: 'Manawan Quebec landscape summer -people' },
          ],
          ukiaqsaaq: [
            { nationId: 'inuit', q: 'Nunavik August September tundra landscape -people' },
            { nationId: 'inuit', q: 'Pingualuit August landscape -people' },
            { nationId: 'migmaq', q: 'Gaspésie late summer landscape -people' },
          ],
          ukiaq: [
            { nationId: 'atikamekw', q: 'Mauricie autumn foliage -people' },
            { nationId: 'innu', q: 'Saguenay autumn landscape -people' },
            { nationId: 'algonquin', q: 'Gatineau Park autumn foliage -people' },
          ],
        };
        for (const row of territory[season] || []) {
          jobs.push({ nationId: row.nationId, queries: [row.q] });
        }
        return jobs;
      }

      async function ingestHits(hits, season, forceNationId) {
        for (const hit of hits) {
          const c = countSeasonsForProfile(photos, PROFILE.id);
          if ((c[season] || 0) >= (seasonFloorsForProfile(PROFILE.id)[season] || 0)) {
            return true; // filled
          }
          acceptHit(hit, { forSeason: season, forceNationId });
        }
        return false;
      }

      for (const g of ordered) {
        const need = g.need;
        // A) Catégories Commons
        for (const cat of seasonCats[g.season] || []) {
          if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
          await sleep(500);
          const hits = await searchCommonsCategory(cat, 14);
          const filled = await ingestHits(hits, g.season, null);
          if (filled) break;
        }

        // B) Fulltext Commons (générique)
        for (const q of seasonGapQueries(g.season)) {
          if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
          await sleep(500);
          const hits = await searchCommons(q, 12);
          await ingestHits(hits, g.season, null);
        }

        // C) Openverse multi-sources (Wikimedia + Flickr + …)
        const ovQueries = [
          ...seasonGapQueries(g.season),
          g.season === 'automne'
            ? 'Quebec autumn forest landscape fall foliage'
            : g.season === 'printemps'
              ? 'Quebec spring forest landscape river'
              : g.season === 'ete'
                ? 'Quebec summer lake landscape green'
                : 'Quebec winter snow landscape day',
        ];
        for (const q of ovQueries) {
          if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
          await sleep(600);
          let hits = await searchOpenverseMulti(q, 12);
          await ingestHits(hits, g.season, null);
          await sleep(400);
          hits = await searchOpenverseMulti(q, 10, { source: 'flickr' });
          await ingestHits(hits, g.season, null);
          await sleep(400);
          hits = await searchOpenverseMulti(q, 10, { source: 'wikimedia' });
          await ingestHits(hits, g.season, null);
        }

        // D) Nations : territoire × nation (sources élargies + forceNationId)
        if (PROFILE.id === 'nations') {
          for (const job of nationsSeasonJobs(g.season)) {
            if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
            for (const q of job.queries) {
              if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
              await sleep(550);
              let hits = await searchCommons(q, 10);
              await ingestHits(hits, g.season, job.nationId);
              await sleep(500);
              hits = await searchOpenverseMulti(q, 10);
              await ingestHits(hits, g.season, job.nationId);
              await sleep(400);
              hits = await searchOpenverseMulti(q, 8, { source: 'flickr' });
              await ingestHits(hits, g.season, job.nationId);
            }
          }
        }

        // E) Géoloc Commons + Wikidata P18 + catégories campus
        //    (le plein-texte « spring/June » part en Europe / églises).
        if (PROFILE.id === 'universities') {
          console.log('  · sources extra : géoloc campus + Wikidata P18 + catégories');
          const p18 = await extraSources.searchWikidataCampusP18();
          await ingestHits(p18, g.season, null);
          for (const cat of extraSources.CAMPUS_CATEGORIES) {
            if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
            await sleep(400);
            const hits = await searchCommonsCategory(cat, 16);
            await ingestHits(hits, g.season, null);
          }
          for (const geo of extraSources.CAMPUS_GEO) {
            if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
            await sleep(450);
            const hits = await extraSources.searchCommonsGeo(
              geo.lat,
              geo.lon,
              geo.radius,
              18
            );
            await ingestHits(hits, g.season, null);
          }
        }
        if (PROFILE.id === 'nations') {
          console.log('  · sources extra : géoloc communautés PNI');
          for (const geo of extraSources.NATION_GEO) {
            if ((countSeasonsForProfile(photos, PROFILE.id)[g.season] || 0) >= need) break;
            await sleep(450);
            const hits = await extraSources.searchCommonsGeo(
              geo.lat,
              geo.lon,
              geo.radius,
              16
            );
            await ingestHits(hits, g.season, geo.nationId);
          }
        }
      }
    } else {
      console.log('▸ Inventaire saisons : planchers OK (pas de re-discovery)');
    }
  }

  // Re-cap après découverte (purge protège encore les planchers)
  {
    const { photos: next, removed } =
      PROFILE.id === 'nations'
        ? purgeOldestPreferNationCoverage(photos, MAX_BANK)
        : purgeOldest(photos, MAX_BANK, PROFILE.id);
    photos = next;
    for (const r of removed) {
      report.removed.push({ title: r.title, reason: 'oldest_over_cap' });
    }
  }

  if (PROFILE.id === 'nations') {
    photos = photos.map((p) => nationsTaxonomy.tagPhotoNation(p));
  }
  photos = photos.map((p) => enrichPhotoSeasons({ ...p }, PROFILE.id));

  report.kept = photos.length;
  // Trier pour export stable : plus récentes d’abord (fraîcheur perçue)
  photos = [...photos].sort(
    (a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
  );

  bank.photos = photos;
  bank.maxBank = MAX_BANK;
  // Snapshot inventaire multi-saisons (permanent en JSON — « cache serveur »)
  bank.seasonInventory = {
    floors: seasonFloorsForProfile(PROFILE.id),
    counts: countSeasonsForProfile(photos, PROFILE.id),
    gaps: seasonGaps(photos, PROFILE.id).map((g) => g.season),
    updated: new Date().toISOString(),
  };
  if (PROFILE.id === 'nations') {
    bank.nationCoverage = nationsTaxonomy.coverageReport(photos);
  }
  if (needSessionCleanup) {
    bank.lastSessionCleanup = sessionKey;
    bank.lastSessionId = sessionId;
  }

  const inv = bank.seasonInventory.counts;
  console.log(
    `\nRésultat : ${photos.length} photos (retirées ${report.removed.length}, ajoutées ${report.added.length})`
  );
  console.log(
    `  saisons : printemps ${inv.printemps} · été ${inv.ete} · automne ${inv.automne} · hiver ${inv.hiver}` +
      (inv.untagged ? ` · ?${inv.untagged}` : '') +
      (bank.seasonInventory.gaps.length
        ? ` · manques: ${bank.seasonInventory.gaps.join(',')}`
        : ' · planchers OK')
  );
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

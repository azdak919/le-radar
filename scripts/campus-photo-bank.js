/**
 * Banque de photos campus / pavillons (établissements québécois).
 *
 * Dernier recours honnête quand :
 *   - la page source n'a pas de photo éditoriale,
 *   - la recherche libre (Openverse / Commons) ne trouve rien de fiable
 *     pour le sujet de l'article.
 *
 * Sources : Wikimedia Commons (licences libres). Préférence aux vues
 * extérieures distinctives, hors hiver/neige quand c'est possible.
 */

const crypto = require('crypto');

function normalizeKey(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Entrée : { url, title, creator, license, sourceUrl, tags? } */
const BANK = {
  'mcgill university': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/e/e8/Roddick_Gates_%28McGill_University%29_2005-09-02.jpg',
      title: 'Roddick Gates, McGill University',
      creator: 'Acarpentier',
      license: 'CC BY 2.5',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Roddick_Gates_(McGill_University)_2005-09-02.jpg',
      tags: 'exterior summer autumn gates campus montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/2d/McGill_University_Montr%C3%A9al.jpeg',
      title: 'McGill University, Montréal',
      creator: 'Thomas1313',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:McGill_University_Montr%C3%A9al.jpeg',
      tags: 'exterior arts building campus montreal green lawn',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Roddick_Gates_closed%2C_McGill_University%2C_July_17%2C_2024.jpg',
      title: 'Roddick Gates closed, McGill University, July 17, 2024',
      creator: 'Gen. Quon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Roddick_Gates_closed,_McGill_University,_July_17,_2024.jpg',
      tags: 'exterior summer july gates campus montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/McGill_University_downtown_campus_31.JPG',
      title: 'McGill University downtown campus 31',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:McGill_University_downtown_campus_31.JPG',
      tags: 'exterior downtown campus montreal buildings green',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/View_from_McGill_University_downtown_campus_01.JPG',
      title: 'View from McGill University downtown campus 01',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:View_from_McGill_University_downtown_campus_01.JPG',
      tags: 'exterior downtown campus montreal skyline view',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Wilson_Hall%2C_McGill_University.jpg',
      title: 'Wilson Hall, McGill University',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Wilson_Hall,_McGill_University.jpg',
      tags: 'exterior wilson hall building campus montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/4_McGill_University%2C_Montreal%2CQuebec_2009.jpg',
      title: 'McGill University, Montreal, Quebec 2009',
      creator: 'Taxiarchos228',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:4_McGill_University,_Montreal,Quebec_2009.jpg',
      tags: 'exterior campus montreal autumn green paths',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Arts_Building%2C_McGill_University.jpg',
      title: 'Arts Building, McGill University',
      creator: 'Abdallahh',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Arts_Building,_McGill_University.jpg',
      tags: 'exterior arts building columns campus montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8b/McGill_University%2C_Winter.jpg',
      title: 'McGill University, Winter',
      creator: 'Abdallahh',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:McGill_University,_Winter.jpg',
      tags: 'exterior winter snow campus montreal',
    },
  ],
  'universite mcgill': [
    // alias → same as mcgill (resolved via alias map)
  ],
  'universite de montreal': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Universit%C3%A9_de_Montr%C3%A9al%2C_Pavillon_Roger-Gaudry.JPG',
      title: 'Université de Montréal, Pavillon Roger-Gaudry',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Universit%C3%A9_de_Montr%C3%A9al,_Pavillon_Roger-Gaudry.JPG',
      tags: 'exterior tower campus montreal building',
    },
  ],
  udem: [],
  uqam: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/UQAM-Judith-Jasmin.jpg',
      title: 'UQAM — Pavillon Judith-Jasmin',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:UQAM-Judith-Jasmin.jpg',
      tags: 'exterior campus montreal judith jasmin',
    },
  ],
  'universite du quebec a montreal': [],
  'concordia university': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/16/CJ_Building%2C_Loyola_Campus%2C_Communication_Studies%2C_Concordia_University.jpg',
      title: 'CJ Building, Loyola Campus, Concordia University',
      creator: 'Gen. Quon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:CJ_Building,_Loyola_Campus,_Communication_Studies,_Concordia_University.jpg',
      tags: 'exterior loyola campus montreal building',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Henry_F._Hall_Building_07.JPG',
      title: 'Henry F. Hall Building, Concordia University',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Henry_F._Hall_Building_07.JPG',
      tags: 'exterior hall building downtown campus montreal modern',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Henry_F._Hall_Building_01.JPG',
      title: 'Henry F. Hall Building 01, Concordia University',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Henry_F._Hall_Building_01.JPG',
      tags: 'exterior hall building downtown campus montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Henry_F._Hall_Building_10.jpg',
      title: 'Henry F. Hall Building 10, Concordia University',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Henry_F._Hall_Building_10.jpg',
      tags: 'exterior hall building downtown campus montreal summer',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Loyola_College_Building_15.JPG',
      title: 'Loyola College Building, Concordia University',
      creator: 'Thomas1313',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Loyola_College_Building_15.JPG',
      tags: 'exterior loyola college campus montreal brick',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/15/2135-2149_Mackay_Street%2C_Montreal.JPG',
      title: 'Mackay Street near Concordia University, Montreal',
      creator: 'Thomas1313',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:2135-2149_Mackay_Street,_Montreal.JPG',
      tags: 'exterior mackay street downtown campus montreal',
    },
  ],
  'universite laval': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Universit%C3%A9_Laval%2C_Quebec_Canada_3.jpg',
      title: 'Université Laval, Quebec Canada',
      creator: 'Dxlinh',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Universit%C3%A9_Laval,_Quebec_Canada_3.jpg',
      tags: 'exterior campus quebec city modern',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Universit%C3%A9_Laval%2C_Quebec%2C_Canada_02.jpg',
      title: 'Université Laval, Quebec, Canada 02',
      creator: 'Dxlinh',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Universit%C3%A9_Laval,_Quebec,_Canada_02.jpg',
      tags: 'exterior campus quebec city',
    },
  ],
  'universite de sherbrooke': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Campus_de_Longueuil_-_Universite_de_Sherbrooke_09.jpg',
      title: 'Campus de Longueuil — Université de Sherbrooke',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Campus_de_Longueuil_-_Universite_de_Sherbrooke_09.jpg',
      tags: 'exterior campus longueuil sherbrooke modern',
    },
  ],
  "bishop's university": [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Bishop%27s_University_campus_2011.jpg',
      title: "Bishop's University campus 2011",
      creator: 'Balcer',
      license: 'CC BY 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bishop%27s_University_campus_2011.jpg',
      tags: 'exterior campus lennoxville green summer',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Bishop%27s_University_McGreer_Hall.jpg',
      title: "Bishop's University McGreer Hall",
      creator: 'Balcer',
      license: 'CC BY 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bishop%27s_University_McGreer_Hall.jpg',
      tags: 'exterior campus lennoxville building',
    },
  ],
  'universite du quebec a trois rivieres': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Pavillon_Pierre-Boucher_UQTR.jpg',
      title: 'Pavillon Pierre-Boucher, UQTR',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pavillon_Pierre-Boucher_UQTR.jpg',
      tags: 'exterior campus trois-rivieres building',
    },
  ],
  'cegep du vieux montreal': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/C%C3%A9gep_du_Vieux_Montr%C3%A9al01.JPG',
      title: 'Cégep du Vieux Montréal',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:C%C3%A9gep_du_Vieux_Montr%C3%A9al01.JPG',
      tags: 'exterior cegep montreal',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/C%C3%A9gep_du_Vieux_Montr%C3%A9al%2C_Nov_03_2022.jpg',
      title: 'Cégep du Vieux Montréal, Nov 03 2022',
      creator: 'Gen. Quon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:C%C3%A9gep_du_Vieux_Montr%C3%A9al,_Nov_03_2022.jpg',
      tags: 'exterior cegep montreal autumn',
    },
  ],
  'cegep de jonquiere': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Pavillon_principal_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
      title: 'Pavillon principal du Cégep de Jonquière',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pavillon_principal_du_C%C3%A9gep_de_Jonqui%C3%A8re.jpg',
      tags: 'exterior cegep jonquiere saguenay',
    },
  ],
  'dawson college': [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/Dawson_College_1.jpg',
      title: 'Dawson College, Montréal',
      creator: 'Hayden Soloviev',
      license: 'CC BY 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_1.jpg',
      tags: 'exterior campus montreal westmount summer facade',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/d/d5/Dawson_College_6.jpg',
      title: 'Dawson College 6, Montréal',
      creator: 'Hayden Soloviev',
      license: 'CC BY 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_6.jpg',
      tags: 'exterior campus montreal building summer',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/7/71/Dawson_College_05.jpg',
      title: 'Dawson College 05',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_05.jpg',
      tags: 'exterior campus montreal courtyard green',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/Dawson_College_06.jpg',
      title: 'Dawson College 06',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_06.jpg',
      tags: 'exterior campus montreal building',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Dawson_College_04.jpg',
      title: 'Dawson College 04',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_04.jpg',
      tags: 'exterior campus montreal wing building',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Dawson_College_11.JPG',
      title: 'Dawson College 11',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_11.JPG',
      tags: 'exterior campus montreal facade',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Dawson_College_10.JPG',
      title: 'Dawson College 10',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_10.JPG',
      tags: 'exterior campus montreal architecture',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Dawson_College_09.JPG',
      title: 'Dawson College 09',
      creator: 'Jeangagnon',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dawson_College_09.JPG',
      tags: 'exterior campus montreal detail',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Coll%C3%A8ge_Dawson.JPG',
      title: 'Collège Dawson, Montréal',
      creator: 'Colocho',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Coll%C3%A8ge_Dawson.JPG',
      tags: 'exterior campus montreal college facade',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Coll%C3%A8ge_Dawson%2C_fa%C3%A7ade_sur_Sherbrooke_O%2C_Montr%C3%A9al_2005-11-10.JPG',
      title: 'Collège Dawson, façade sur Sherbrooke Ouest, Montréal',
      creator: 'Gene.arboit',
      license: 'CC BY-SA 3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Coll%C3%A8ge_Dawson,_fa%C3%A7ade_sur_Sherbrooke_O,_Montr%C3%A9al_2005-11-10.JPG',
      tags: 'exterior campus montreal sherbrooke facade autumn',
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/16/Metro-level_entrance%2C_Dawson_College%2C_Apr_06_2022.jpg',
      title: 'Metro-level entrance, Dawson College, Apr 06 2022',
      creator: 'D. Benjamin Miller',
      license: 'CC0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Metro-level_entrance,_Dawson_College,_Apr_06_2022.jpg',
      tags: 'exterior campus montreal metro entrance spring',
    },
  ],
};

const ALIASES = {
  'universite mcgill': 'mcgill university',
  mcgill: 'mcgill university',
  'universite de montreal': 'universite de montreal',
  udem: 'universite de montreal',
  'u de m': 'universite de montreal',
  'universite du quebec a montreal': 'uqam',
  'universite du quebec a montreal uqam': 'uqam',
  concordia: 'concordia university',
  ulaval: 'universite laval',
  laval: 'universite laval',
  sherbrooke: 'universite de sherbrooke',
  'u de s': 'universite de sherbrooke',
  bishops: "bishop's university",
  "bishop s university": "bishop's university",
  uqtr: 'universite du quebec a trois rivieres',
  'universite du quebec a trois-rivieres': 'universite du quebec a trois rivieres',
  'vieux montreal': 'cegep du vieux montreal',
  'cegep du vieux montreal': 'cegep du vieux montreal',
  jonquiere: 'cegep de jonquiere',
  'cegep de jonquiere atm journalisme': 'cegep de jonquiere',
  'cegep de jonquiere (atm journalisme)': 'cegep de jonquiere',
  dawson: 'dawson college',
  'college dawson': 'dawson college',
  'college dawson montreal': 'dawson college',
  'dawson college montreal': 'dawson college',
};

// Résoudre alias → liste (y compris listes vides qui pointent vers une clé peuplée)
function resolveBankKey(institution = '') {
  const raw = normalizeKey(institution).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  if (BANK[raw]?.length) return raw;
  if (ALIASES[raw] && BANK[ALIASES[raw]]?.length) return ALIASES[raw];

  // Correspondance partielle (ex. « Cégep de Jonquière (ATM – journalisme) »)
  for (const key of Object.keys(BANK)) {
    if (!BANK[key]?.length) continue;
    if (raw.includes(key) || key.includes(raw)) return key;
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if ((raw.includes(alias) || alias.includes(raw)) && BANK[target]?.length) return target;
  }
  return null;
}

function bankEntriesFor(institution = '') {
  const key = resolveBankKey(institution);
  if (!key) return [];
  return BANK[key] || [];
}

const WINTER_RE = /\b(snow|neige|winter|hiver|glacial|blizzard|ice rink|patinoire)\b/i;
const SUMMER_RE = /\b(summer|ete|été|july|juillet|june|juin|august|aout|août|terrasse|warm|chaud)\b/i;

function entryToStockFields(pick) {
  return {
    stockImage: pick.url,
    imageTitle: pick.title || '',
    imageCredit: `Photo : ${pick.creator || 'Auteur·e inconnu·e'} / ${pick.license || 'CC'} · Wikimedia Commons`,
    imageCreator: pick.creator || '',
    imageLicense: pick.license || '',
    imageProvider: 'campus-bank',
    imageSourceUrl: pick.sourceUrl || pick.url,
    _campusBank: true,
  };
}

/**
 * Choisit une photo campus pour l'article.
 * @param {{ institution?: string, link?: string, title?: string, excerpt?: string }} item
 * @param {{ preferSeason?: 'summer'|'winter'|'any', avoidUrls?: string[]|Set<string> }} [opts]
 */
function pickCampusPhoto(item = {}, opts = {}) {
  const entries = bankEntriesFor(item.institution || '');
  if (!entries.length) return null;

  const hayArticle = `${item.title || ''} ${item.excerpt || ''} ${item.leadExcerpt || ''}`;
  let pool = entries.slice();

  const prefer = opts.preferSeason
    || (SUMMER_RE.test(hayArticle) ? 'summer'
      : (WINTER_RE.test(hayArticle) ? 'winter' : 'any'));

  // Filtre saisonnier souple : on ne réduit le pool que s'il reste ≥2 options,
  // sinon toutes les vues campus restent disponibles (évite 3 articles = même portail).
  if (prefer === 'summer') {
    const noWinter = pool.filter((e) => !WINTER_RE.test(`${e.title} ${e.tags || ''}`));
    if (noWinter.length >= 2) pool = noWinter;
  } else if (prefer === 'winter') {
    const winterish = pool.filter((e) => WINTER_RE.test(`${e.title} ${e.tags || ''}`));
    if (winterish.length >= 1) pool = winterish;
  }

  const avoid = new Set(
    [...(opts.avoidUrls || [])]
      .map((u) => String(u || '').trim())
      .filter(Boolean),
  );
  const unused = pool.filter((e) => !avoid.has(e.url));
  if (unused.length) pool = unused;

  // Variété stable par article (hash) sur le pool restant.
  const seed = String(item.link || item.title || item.institution || 'x');
  const hash = crypto.createHash('sha1').update(seed).digest();
  const idx = hash[0] % pool.length;
  const pick = pool[idx];

  return entryToStockFields(pick);
}

/**
 * Réattribue les photos campus-bank d'un lot pour maximiser la variété
 * (évite la même photo Roddick Gates sur À la une + En bref McGill).
 */
function diversifyCampusBankItems(items = []) {
  if (!Array.isArray(items) || items.length < 2) return 0;
  let changed = 0;

  // Par établissement : articles qui utilisent déjà (ou n'ont que) la banque campus.
  const byInst = new Map();
  for (const item of items) {
    if (!item || item.imageProvider !== 'campus-bank' || !item.stockImage) continue;
    // Ne pas toucher s'il y a une vraie photo source.
    if (item.image && String(item.image).trim()) continue;
    const key = resolveBankKey(item.institution || '') || normalizeKey(item.institution || '');
    if (!key) continue;
    if (!byInst.has(key)) byInst.set(key, []);
    byInst.get(key).push(item);
  }

  for (const [, group] of byInst) {
    if (group.length < 2) continue;
    const entries = bankEntriesFor(group[0].institution || '');
    if (entries.length < 2) continue;

    // Trier par date (récent d'abord) pour que la une prenne la 1re variante.
    group.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

    const used = new Set();
    for (let i = 0; i < group.length; i += 1) {
      const item = group[i];
      const hay = `${item.title || ''} ${item.excerpt || ''}`;
      let pool = entries.slice();
      if (SUMMER_RE.test(hay)) {
        const noWinter = pool.filter((e) => !WINTER_RE.test(`${e.title} ${e.tags || ''}`));
        if (noWinter.length >= 2) pool = noWinter;
      } else if (WINTER_RE.test(hay)) {
        const winterish = pool.filter((e) => WINTER_RE.test(`${e.title} ${e.tags || ''}`));
        if (winterish.length) pool = winterish;
      }

      // Préférer une URL pas encore utilisée dans ce lot.
      let candidates = pool.filter((e) => !used.has(e.url));
      if (!candidates.length) candidates = pool.slice();

      // Rotation déterministe : décalage par rang dans le groupe.
      const seed = String(item.link || item.title || i);
      const hash = crypto.createHash('sha1').update(`${seed}|${i}`).digest();
      const pick = candidates[hash[0] % candidates.length];
      used.add(pick.url);

      if (item.stockImage !== pick.url) {
        Object.assign(item, entryToStockFields(pick));
        item.leadImageReady = false;
        changed += 1;
      } else {
        used.add(item.stockImage);
      }
    }
  }

  return changed;
}

function hasCampusBank(institution = '') {
  return bankEntriesFor(institution).length > 0;
}

module.exports = {
  BANK,
  ALIASES,
  normalizeKey,
  resolveBankKey,
  bankEntriesFor,
  pickCampusPhoto,
  diversifyCampusBankItems,
  hasCampusBank,
};

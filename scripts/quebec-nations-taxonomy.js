/**
 * Les 11 nations autochtones reconnues au Québec (gouvernement du Québec) :
 * 10 Premières Nations + Inuit.
 *
 * Utilisé par maintain-quebec-backgrounds.js (profil nations) pour :
 *   - requêtes Commons par nation / communauté
 *   - étiquetage nationId sur chaque photo
 *   - rapport de couverture (toutes les nations représentées)
 *
 * Sources : quebec.ca (profil des nations), communautés connues.
 */

'use strict';

/**
 * @typedef {{ id: string, label: string, aliases: string[], communities: string[], queries: string[] }} NationDef
 */

/** @type {NationDef[]} */
const QUEBEC_NATIONS = [
  {
    id: 'abenaki',
    label: 'Abénaquis (W8banaki)',
    aliases: ['abénaqui', 'abenaki', 'w8banaki', 'wabanaki', 'abenakis'],
    communities: ['Odanak', 'Wôlinak', 'Wolinak', 'Pierreville'],
    /**
     * Graines Commons (File:…) quand la recherche plein texte rate :
     * Odanak Vue aérienne 2025 est hard-ban (clocher) — rivière adjacente OK.
     */
    curatedSeeds: [
      {
        fileTitle: 'File:Rivière Saint-François 2025.jpg',
        title: "Rivière Saint-François près d'Odanak",
        nationId: 'abenaki',
      },
      {
        fileTitle: 'File:Archipel Saint-François-du-Lac 02.jpg',
        title: 'Archipel Saint-François près d’Odanak',
        nationId: 'abenaki',
      },
    ],
    queries: [
      // -church/-chapelle : éviter clochers catholiques (ex. Wôlinak.jpg, Odanak aérien village)
      'Odanak Quebec aerial landscape -people -portrait -church -église -chapel -chapelle -steeple -clocher',
      'Odanak Québec paysage rivière -people -church -église -clocher',
      'intitle:Odanak -église -eglise -church -chapelle -clocher -steeple -diagram -carte',
      'incategory:Odanak filetype:bitmap -église -church -chapelle',
      'Rivière Saint-François Odanak -people -église -church',
      'Rivière Saint-François-du-Lac aerial -people -church -église',
      'Archipel Saint-François-du-Lac -people -church',
      'Wolinak Quebec landscape -people -church -église -chapel -chapelle -cross -croix -clocher',
      'Wôlinak paysage -people -église -chapelle -church -clocher',
      'intitle:Wôlinak -chapelle -église -church -diagram',
      'Abénaquis Québec paysage -people -portrait -église -church -barrage -hydro',
      'Abenaki Quebec landscape river -people -church -chapel -hotel',
      'W8banaki OR Wabanaki Odanak landscape -people -church',
      'Saint-François River near Odanak aerial -church -people',
      'Gabriel Picard Odanak OR "Saint-François" aerial -église -church -rue',
    ],
    // Requêtes Openverse (Commons + Flickr + …) si toujours 0 photo
    openverseQueries: [
      'Odanak Quebec landscape river',
      'Odanak Québec rivière',
      'Wôlinak Quebec',
      'Abenaki Odanak Quebec nature',
    ],
  },
  {
    id: 'algonquin',
    label: 'Algonquins (Anishinaabeg)',
    aliases: ['algonquin', 'anishinaabe', 'anishinaabeg', 'anishnabe'],
    communities: [
      'Kitigan Zibi',
      'Lac-Simon',
      'Kitcisakik',
      'Winneway',
      'Kebaowek',
      'Timiskaming',
      'Eagle Village',
      'Barriere Lake',
      'Wolf Lake',
    ],
    queries: [
      'Kitigan Zibi landscape Quebec -people -portrait',
      'Kitigan Zibi Maniwaki landscape -people',
      'Lac-Simon Quebec landscape -people',
      'Kitcisakik landscape -people',
      'Algonquin Quebec landscape -people -portrait',
      'Anishinaabe Quebec landscape -people',
      'Timiskaming First Nation landscape -people',
      'Kebaowek landscape -people',
    ],
  },
  {
    id: 'atikamekw',
    label: 'Atikamekw',
    aliases: ['atikamekw', 'attikamek', 'nehirowisiw'],
    communities: ['Manawan', 'Wemotaci', 'Opitciwan', 'Opticiwan'],
    queries: [
      'Manawan Quebec landscape -people -portrait',
      'Manawan paysage -people',
      'Wemotaci landscape Quebec -people',
      'Opitciwan landscape -people',
      'Atikamekw Quebec landscape -people -portrait',
      'Notcimik landscape Quebec -people',
    ],
  },
  {
    id: 'cree',
    label: 'Cris (Eeyou / Eenou)',
    aliases: ['cri', 'cris', 'cree', 'eeyou', 'eenou', 'iyiyiu', 'eeyou istchee'],
    communities: [
      'Mistissini',
      'Chisasibi',
      'Waskaganish',
      'Waswanipi',
      'Nemaska',
      'Eastmain',
      'Wemindji',
      'Whapmagoostui',
      'Oujé-Bougoumou',
      'Ouje-Bougoumou',
    ],
    queries: [
      'Mistissini landscape Quebec -people -portrait',
      'Chisasibi landscape -people -portrait',
      'Waskaganish landscape -people',
      'Waswanipi landscape -people',
      'Nemaska landscape -people',
      'Eastmain Quebec landscape -people',
      'Wemindji landscape -people',
      'Whapmagoostui landscape -people',
      'Ouje-Bougoumou landscape -people',
      'Eeyou Istchee landscape -people -portrait',
      'Baie-James territoire cri paysage -people',
      'James Bay Cree landscape Quebec -people',
    ],
  },
  {
    id: 'wendat',
    label: 'Hurons-Wendat',
    aliases: ['wendat', 'huron', 'huronne', 'huron-wendat', 'hurons-wendat'],
    communities: ['Wendake'],
    queries: [
      'Wendake Quebec landscape -people -portrait -interior',
      'Wendake Québec paysage -people',
      'Huron Wendat Wendake landscape -people',
      'Village-des-Hurons landscape -people',
    ],
  },
  {
    id: 'innu',
    label: 'Innus (Ilnu / Innu)',
    aliases: [
      'innu',
      'innus',
      'ilnu',
      'montagnais',
      'pekuakamiulnuatsh',
      'innu-aimun',
    ],
    communities: [
      'Pessamit',
      'Betsiamites',
      'Mashteuiatsh',
      'Uashat',
      'Maliotenam',
      'Essipit',
      'Nutashkuan',
      'Unamen Shipu',
      'La Romaine',
      'Pakua Shipi',
      'Saint-Augustin',
      'Matimekosh',
      'Lac-John',
      'Ekuanitshit',
      'Mingan',
      'Natashquan',
    ],
    queries: [
      'Pessamit Quebec aerial landscape -people',
      'Pessamit paysage -people',
      'Mashteuiatsh landscape Quebec -people -portrait -interior',
      'Mashteuiatsh paysage -people',
      'Uashat Maliotenam landscape -people',
      'Sept-Îles Innu landscape -people',
      'Essipit Quebec landscape -people',
      'Nutashkuan landscape -people',
      'Unamen Shipu landscape -people',
      'Pakua Shipi landscape -people',
      'Matimekosh landscape -people',
      'Ekuanitshit landscape -people',
      'Natashquan Innu landscape -people',
      'Côte-Nord Innu paysage -people',
      'Innu Quebec landscape -people -portrait',
    ],
  },
  {
    id: 'maliseet',
    label: 'Malécites (Wolastoqiyik)',
    aliases: ['malécite', 'malecite', 'maliseet', 'wolastoqiyik', 'wolastoq'],
    communities: ['Cacouna', 'Whitworth', 'Première Nation Wolastoqiyik Wahsipekuk'],
    queries: [
      'Malécite Québec paysage -people',
      'Maliseet Quebec landscape -people',
      'Wolastoqiyik Quebec landscape -people',
      'Wahsipekuk landscape -people',
      'Cacouna Première Nation landscape -people',
      'Whitworth Quebec landscape -people',
    ],
  },
  {
    id: 'migmaq',
    label: "Mi'gmaq",
    aliases: ['mi gmaq', "mi'gmaq", 'micmac', 'mi’gmaq', 'migmaq', 'miigmaq'],
    communities: ['Listuguj', 'Gesgapegiag', 'Gespeg', 'Gaspé'],
    queries: [
      'Listuguj landscape Quebec -people -portrait',
      'Listuguj Gaspésie paysage -people',
      'Gesgapegiag landscape -people',
      'Gespeg landscape Quebec -people',
      "Mi'gmaq Quebec landscape -people",
      'Micmac Gaspésie paysage -people',
    ],
  },
  {
    id: 'mohawk',
    label: "Mohawks (Kanien'kehá:ka)",
    aliases: ['mohawk', 'mohawks', 'kanien', 'kanienkeha', "kanien'keha"],
    communities: ['Kahnawake', 'Kanehsatake', 'Kanesatake', 'Akwesasne'],
    queries: [
      'Kahnawake landscape -people -portrait',
      'Kahnawake Quebec aerial -people',
      'Kanehsatake landscape -people',
      'Kanesatake landscape Quebec -people',
      'Akwesasne landscape Quebec -people',
      'Mohawk Quebec landscape -people -portrait',
    ],
  },
  {
    id: 'naskapi',
    label: 'Naskapis',
    aliases: ['naskapi', 'naskapis', 'iyuw'],
    communities: ['Kawawachikamach', 'Naskapi Nation of Kawawachikamach'],
    queries: [
      'Kawawachikamach landscape -people -portrait',
      'Naskapi Kawawachikamach landscape -people',
      'Naskapi Quebec landscape -people',
      'Schefferville Naskapi landscape -people',
    ],
  },
  {
    id: 'inuit',
    label: 'Inuit (Nunavik)',
    aliases: ['inuit', 'inuk', 'nunavik', 'nunavummiut', 'inuktitut'],
    communities: [
      'Kuujjuaq',
      'Kuujjuarapik',
      'Kangirsuk',
      'Kangiqsualujjuaq',
      'Kangiqsujuaq',
      'Puvirnituq',
      'Salluit',
      'Ivujivik',
      'Inukjuak',
      'Akulivik',
      'Aupaluk',
      'Tasiujaq',
      'Quaqtaq',
      'Umiujaq',
      'Pingualuit',
      'Kangiqsujuaq',
    ],
    queries: [
      'Nunavik landscape -portrait -people -interior -night',
      'Nunavik aerial landscape -people',
      'Pingualuit crater Quebec landscape',
      'Kuujjuaq landscape -portrait -people',
      'Kuujjuarapik landscape -people',
      'Kangirsuk Quebec landscape -portrait',
      'Kangiqsualujjuaq landscape -people',
      'Kangiqsujuaq landscape -people',
      'Puvirnituq landscape -people',
      'Salluit landscape -portrait -people',
      'Ivujivik landscape -people',
      'Inukjuak landscape Quebec -people',
      'Akulivik landscape -people',
      'Aupaluk landscape -people',
      'Tasiujaq landscape -people',
      'Quaqtaq landscape -people',
      'Umiujaq landscape -people',
      'Inuit Quebec Nunavik paysage -portrait -people',
    ],
  },
];

function normalizeHay(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/**
 * Déduit nationId à partir du titre / URL / crédit.
 * @returns {string|null}
 */
function detectNationId(entry) {
  const hay = normalizeHay(
    [
      entry.title,
      entry.url,
      entry.link,
      entry.credit,
      entry.nation,
      entry.nationId,
      entry.description,
      entry.categories,
    ]
      .filter(Boolean)
      .join(' ')
  );
  // Pass 1 : communautés (plus spécifiques)
  for (const nation of QUEBEC_NATIONS) {
    for (const c of nation.communities) {
      if (hay.includes(normalizeHay(c))) return nation.id;
    }
  }
  // Pass 2 : alias de nation
  for (const nation of QUEBEC_NATIONS) {
    for (const a of nation.aliases) {
      if (hay.includes(normalizeHay(a))) return nation.id;
    }
  }
  return null;
}

/** Requêtes Commons ordonnées : d’abord nations sous-représentées. */
function buildDiscoveryQueries(sessionId, photos = []) {
  const counts = coverageCounts(photos);
  // Trier nations par couverture croissante (0 d’abord)
  const ordered = [...QUEBEC_NATIONS].sort(
    (a, b) => (counts[a.id] || 0) - (counts[b.id] || 0)
  );
  const queries = [];
  for (const nation of ordered) {
    for (const q of nation.queries) queries.push(q);
  }
  // Saison légère
  if (sessionId === 'automne') {
    queries.push(
      'Mashteuiatsh automne paysage -people',
      'Manawan automne paysage -people',
      'Nunavik autumn landscape -people'
    );
  } else if (sessionId === 'ete') {
    queries.push(
      // Pas « Odanak vue aérienne » seule : ramène le village+clocher hard-ban
      'Rivière Saint-François Odanak été -people -église -church',
      'Pessamit été paysage -people',
      'Mistissini été paysage -people',
      'Nunavik summer landscape -people -portrait'
    );
  } else {
    queries.push(
      'Pingualuit crater landscape day',
      'Kuujjuaq aerial landscape -people'
    );
  }
  return queries;
}

function coverageCounts(photos) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const n of QUEBEC_NATIONS) counts[n.id] = 0;
  for (const p of photos || []) {
    const id = p.nationId || detectNationId(p);
    if (id && counts[id] != null) counts[id] += 1;
  }
  return counts;
}

function coverageReport(photos) {
  const counts = coverageCounts(photos);
  const rows = QUEBEC_NATIONS.map((n) => ({
    id: n.id,
    label: n.label,
    count: counts[n.id] || 0,
  }));
  const missing = rows.filter((r) => r.count === 0).map((r) => r.label);
  return { rows, missing, totalNations: QUEBEC_NATIONS.length };
}

function tagPhotoNation(entry) {
  const nationId = entry.nationId || detectNationId(entry);
  if (!nationId) return entry;
  const def = QUEBEC_NATIONS.find((n) => n.id === nationId);
  return {
    ...entry,
    nationId,
    nation: def ? def.label : nationId,
  };
}

/** Graines File: Commons pour nations encore à 0 (après ban clocher, etc.). */
function curatedSeedsForMissing(photos = []) {
  const counts = coverageCounts(photos);
  /** @type {{ fileTitle: string, title?: string, nationId: string }[]} */
  const seeds = [];
  for (const nation of QUEBEC_NATIONS) {
    if ((counts[nation.id] || 0) > 0) continue;
    for (const s of nation.curatedSeeds || []) {
      if (!s || !s.fileTitle) continue;
      seeds.push({
        fileTitle: s.fileTitle,
        title: s.title,
        nationId: s.nationId || nation.id,
      });
    }
  }
  return seeds;
}

/** Requêtes Openverse pour nations absentes (source secondaire). */
function openverseQueriesForMissing(photos = []) {
  const counts = coverageCounts(photos);
  const queries = [];
  for (const nation of QUEBEC_NATIONS) {
    if ((counts[nation.id] || 0) > 0) continue;
    for (const q of nation.openverseQueries || []) {
      queries.push({ query: q, nationId: nation.id });
    }
  }
  return queries;
}

module.exports = {
  QUEBEC_NATIONS,
  detectNationId,
  buildDiscoveryQueries,
  coverageCounts,
  coverageReport,
  tagPhotoNation,
  curatedSeedsForMissing,
  openverseQueriesForMissing,
};

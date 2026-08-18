/**
 * Sources web hors plein-texte Commons (souvent hors sujet).
 * Qualité / licence / visages : toujours via textGate + dimensionGate.
 *
 *  - géoloc Commons autour des campus et communautés
 *  - catégories Commons officielles (universités QC)
 *  - Wikidata P18 (image principale d’un établissement)
 */
'use strict';

/** Campus QC — WGS84, rayon mètres. */
const CAMPUS_GEO = [
  { id: 'mcgill', label: 'McGill', lat: 45.5048, lon: -73.5772, radius: 1800 },
  { id: 'udem', label: 'UdeM', lat: 45.5031, lon: -73.6146, radius: 1800 },
  { id: 'uqam', label: 'UQAM', lat: 45.5136, lon: -73.5606, radius: 1200 },
  { id: 'concordia', label: 'Concordia', lat: 45.4972, lon: -73.5789, radius: 1200 },
  { id: 'laval', label: 'Laval', lat: 46.7785, lon: -71.275, radius: 2500 },
  { id: 'sherbrooke', label: 'Sherbrooke', lat: 45.3793, lon: -71.9293, radius: 2000 },
  { id: 'bishops', label: "Bishop's", lat: 45.367, lon: -71.845, radius: 1500 },
  { id: 'uqtr', label: 'UQTR', lat: 46.348, lon: -72.577, radius: 1500 },
  { id: 'uqac', label: 'UQAC', lat: 48.42, lon: -71.052, radius: 1500 },
];

/** Communautés PNI — rayon plus large (territoire). */
const NATION_GEO = [
  { nationId: 'abenaki', label: 'Odanak', lat: 46.069, lon: -72.834, radius: 5000 },
  { nationId: 'atikamekw', label: 'Manawan', lat: 47.223, lon: -74.393, radius: 8000 },
  { nationId: 'atikamekw', label: 'Mashteuiatsh', lat: 48.577, lon: -72.23, radius: 6000 },
  { nationId: 'inuit', label: 'Kuujjuaq', lat: 58.105, lon: -68.395, radius: 10000 },
  { nationId: 'inuit', label: 'Kuujjuarapik', lat: 55.28, lon: -77.755, radius: 8000 },
  { nationId: 'inuit', label: 'Pingualuit', lat: 61.277, lon: -73.66, radius: 12000 },
  { nationId: 'inuit', label: 'Salluit', lat: 62.2, lon: -75.65, radius: 8000 },
  { nationId: 'inuit', label: 'Kangiqsujuaq', lat: 61.6, lon: -71.96, radius: 8000 },
  { nationId: 'cree', label: 'Mistissini', lat: 50.418, lon: -73.868, radius: 8000 },
  { nationId: 'cree', label: 'Chisasibi', lat: 53.786, lon: -78.897, radius: 8000 },
  { nationId: 'innu', label: 'Pessamit', lat: 48.93, lon: -68.65, radius: 6000 },
  { nationId: 'migmaq', label: 'Listuguj', lat: 48.02, lon: -66.7, radius: 5000 },
  { nationId: 'mohawk', label: 'Kahnawake', lat: 45.41, lon: -73.68, radius: 4000 },
  { nationId: 'wendat', label: 'Wendake', lat: 46.86, lon: -71.355, radius: 2500 },
  { nationId: 'algonquin', label: 'Kitigan Zibi', lat: 46.37, lon: -76.04, radius: 8000 },
  { nationId: 'naskapi', label: 'Kawawachikamach', lat: 54.866, lon: -66.765, radius: 8000 },
];

const CAMPUS_CATEGORIES = [
  'McGill University',
  'Université de Montréal',
  'Université Laval',
  'Université du Québec à Montréal',
  'Concordia University',
  'Université de Sherbrooke',
  "Bishop's University",
  'Université du Québec à Trois-Rivières',
  'Pavillons de l\'Université Laval',
];

/** Q-ids Wikidata des univ. QC (P18 = image principale). */
const CAMPUS_WIKIDATA = [
  'Q201492',
  'Q392189',
  'Q1067935',
  'Q1634522',
  'Q326342',
  'Q2579532',
  'Q4916644',
  'Q256594',
  'Q256595',
];

function commonsGeoUrl(lat, lon, radius, limit = 16) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(Math.min(10000, Math.max(100, radius))),
    ggsnamespace: '6',
    ggslimit: String(Math.min(50, limit)),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

function wikidataCampusSparql() {
  const values = CAMPUS_WIKIDATA.map((id) => `wd:${id}`).join(' ');
  return `SELECT ?img WHERE { VALUES ?item { ${values} } ?item wdt:P18 ?img . }`;
}

/**
 * @param {{ fetchJson: Function, mapCommonsPage: Function, fetchCommonsFile: Function }} deps
 */
function createPhotoWebSources(deps) {
  const { fetchJson, mapCommonsPage, fetchCommonsFile } = deps;

  async function searchCommonsGeo(lat, lon, radius = 2000, limit = 16) {
    try {
      const data = await fetchJson(commonsGeoUrl(lat, lon, radius, limit));
      const pages = Object.values(data?.query?.pages || {});
      return pages.map(mapCommonsPage).filter(Boolean).map((p) => ({
        ...p,
        source: 'commons-geo',
      }));
    } catch (e) {
      console.warn('  geo fail', lat, lon, e.message);
      return [];
    }
  }

  async function searchWikidataCampusP18() {
    const query = wikidataCampusSparql();
    const url =
      'https://query.wikidata.org/sparql?format=json&query=' +
      encodeURIComponent(query);
    try {
      const data = await fetchJson(url);
      const bindings = data?.results?.bindings || [];
      const out = [];
      for (const row of bindings) {
        const img = row.img?.value || '';
        const m = img.match(/Special:FilePath\/([^?]+)/);
        if (!m) continue;
        const fileTitle = `File:${decodeURIComponent(m[1]).replace(/_/g, ' ')}`;
        const hit = await fetchCommonsFile(fileTitle);
        if (hit) out.push({ ...hit, source: 'wikidata-p18' });
      }
      return out;
    } catch (e) {
      console.warn('  wikidata fail', e.message);
      return [];
    }
  }

  return {
    searchCommonsGeo,
    searchWikidataCampusP18,
    CAMPUS_GEO,
    NATION_GEO,
    CAMPUS_CATEGORIES,
  };
}

module.exports = {
  createPhotoWebSources,
  commonsGeoUrl,
  wikidataCampusSparql,
  CAMPUS_GEO,
  NATION_GEO,
  CAMPUS_CATEGORIES,
  CAMPUS_WIKIDATA,
};

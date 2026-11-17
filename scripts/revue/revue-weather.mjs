/**
 * Météo de la revue : prévisions publiques d'Environnement et Changement climatique Canada (ECCC), fichiers
 * « citypage » XML du Datamart MSC (https://dd.weather.gc.ca/today/citypage_weather/), lus AU MOMENT de produire
 * l'édition. Licence : Licence du gouvernement ouvert / conditions ECCC (LICENCE_GENERAL), attribution obligatoire.
 *
 * La petite ligne de la manchette n'affiche que Québec et Montréal. Le grand bloc imprimé ajoute les autres villes
 * universitaires, les 14 villages du Nunavik et Waskaganish (Eeyou Istchee), sous leur nom officiel ECCC.
 *
 * Codes de site vérifiés dans la liste officielle ECCC (site_list_fr.csv, 17 nov. 2026) ET, à chaque lecture, dans la
 * balise <name code="…"> du fichier : un code qui ne correspond pas est ignoré. Pas de Lennoxville, Wendake,
 * Kahnawake, Mashteuiatsh, Uashat mak Mani-utenam, ni des autres communautés d'Eeyou Istchee (Chisasibi, Wemindji,
 * Eastmain, Nemaska, Waswanipi, Mistissini, Oujé-Bougoumou, Whapmagoostui) : ECCC ne publie pas de prévision
 * « citypage » sous ces noms (pas de substitution par une ville voisine). Tout échoue proprement : aucune donnée →
 * pas de météo (null).
 */
const BASE = 'https://dd.weather.gc.ca/today/citypage_weather/QC';

/** Ordre d'affichage. Communautés autochtones : nom officiel déjà publié par ECCC (inuktitut ou cri). */
export const WEATHER_SITES = [
  { code: 's0000620', name: 'Québec', group: 'campus' },
  { code: 's0000635', name: 'Montréal', group: 'campus' },
  { code: 's0000681', name: 'Sherbrooke', group: 'campus' },
  { code: 's0000346', name: 'Trois-Rivières', group: 'campus' },
  { code: 's0000393', name: 'Rimouski', group: 'campus' },
  { code: 's0000211', name: 'Saguenay', group: 'campus' },
  { code: 's0000611', name: 'Gatineau', group: 'campus' },
  { code: 's0000353', name: 'Rouyn-Noranda', group: 'campus' },
  // Nunavik, côte de l'Ungava puis le détroit d'Hudson puis la baie d'Hudson (14 villages).
  { code: 's0000591', name: 'Kangiqsualujjuaq', group: 'nunavik' },
  { code: 's0000719', name: 'Kuujjuaq', group: 'nunavik' },
  { code: 's0000699', name: 'Tasiujaq', group: 'nunavik' },
  { code: 's0000586', name: 'Aupaluk', group: 'nunavik' },
  { code: 's0000480', name: 'Kangirsuk', group: 'nunavik' },
  { code: 's0000544', name: 'Quaqtaq', group: 'nunavik' },
  { code: 's0000574', name: 'Kangiqsujuaq', group: 'nunavik' },
  { code: 's0000793', name: 'Salluit', group: 'nunavik' },
  { code: 's0000563', name: 'Ivujivik', group: 'nunavik' },
  { code: 's0000578', name: 'Akulivik', group: 'nunavik' },
  { code: 's0000711', name: 'Puvirnituq', group: 'nunavik' },
  { code: 's0000627', name: 'Inukjuak', group: 'nunavik' },
  { code: 's0000599', name: 'Umiujaq', group: 'nunavik' },
  { code: 's0000542', name: 'Kuujjuarapik', group: 'nunavik' },
  { code: 's0000579', name: 'Waskaganish', group: 'eeyou' },
];

const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&apos;/g, '’').replace(/'/g, '’')
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (xml, re) => { const m = re.exec(xml); return m ? unxml(m[1]) : ''; };

/** Une période de prévision : nom, résumé abrégé, température (max/min), icône ECCC, probabilité de précipitations. */
function period(block) {
  const name = tag(block, /<period[^>]*textForecastName="([^"]*)"/);
  const sky = tag(block, /<abbreviatedForecast>[\s\S]*?<textSummary>([\s\S]*?)<\/textSummary>/);
  const t = /<temperature[^>]*class="(high|low)"[^>]*>\s*(-?\d+)\s*</.exec(block);
  const icon = tag(block, /<iconCode[^>]*>(\d+)<\/iconCode>/);
  const pop = tag(block, /<pop[^>]*>(\d+)<\/pop>/);
  if (!name || !sky || !t) return null;
  return { name, sky, kind: t[1], temp: Number(t[2]), icon: icon ? Number(icon) : null, pop: pop ? Number(pop) : null };
}

/** Lit un fichier citypage : null si le code ne correspond pas ou si rien d'utilisable. */
export function parseCitypage(xml, site) {
  const code = (/<location>[\s\S]*?<name code="([^"]+)"/.exec(String(xml || '')) || [])[1];
  if (code !== site.code) return null;
  const group = (/<forecastGroup>([\s\S]*?)<\/forecastGroup>/.exec(xml) || [])[1] || '';
  const periods = [...group.matchAll(/<forecast>([\s\S]*?)<\/forecast>/g)].map(m => period(m[1])).filter(Boolean).slice(0, 2);
  if (!periods.length) return null;
  const issued = tag(group, /<dateTime name="forecastIssue" zone="UTC"[\s\S]*?<timeStamp>(\d{14})<\/timeStamp>/);
  return { code: site.code, name: site.name, group: site.group, issued, periods };
}

function withTimeout(p, ms) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('délai')), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

/**
 * Prévisions de toutes les villes, au moment de produire l'édition. Échec global (réseau, Datamart) → null.
 * Le Datamart range les fichiers par heure UTC (QC/HH/<horodatage>_MSC_CitypageWeather_<code>_fr.xml) :
 * on prend le plus récent de l'heure courante ou des deux précédentes.
 * `now` est l'horloge du Datamart (`/today/`) : toujours l'heure réelle, pas l'horodatage simulé d'un --day/--at.
 */
export async function fetchWeather({ fetchImpl = fetch, now = Date.now(), timeoutMs = 8000, minCities = 1 } = {}) {
  const get = async (url) => {
    const r = await withTimeout(fetchImpl(url, { headers: { 'User-Agent': 'le-radar.ca revue (contact azdak-qc@proton.me)' } }), timeoutMs);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };
  try {
    const latest = {};
    for (let h = 0; h < 3; h++) {
      const hh = String(new Date(now - h * 3600e3).getUTCHours()).padStart(2, '0');
      let html = '';
      try { html = await get(`${BASE}/${hh}/`); } catch { continue; }
      for (const m of html.matchAll(/href="((\d{8}T\d{6}(?:\.\d+)?Z)_MSC_CitypageWeather_(s\d{7})_fr\.xml)"/g)) {
        const [, file, stamp, code] = m;
        if (!latest[code] || stamp > latest[code].stamp) latest[code] = { stamp, url: `${BASE}/${hh}/${file}` };
      }
      if (WEATHER_SITES.every(s => latest[s.code])) break;
    }
    const cities = (await Promise.all(WEATHER_SITES.map(async (s) => {
      if (!latest[s.code]) return null;
      try { return parseCitypage(await get(latest[s.code].url), s); } catch { return null; }
    }))).filter(Boolean);
    if (cities.length < minCities) return null;
    return { source: 'Environnement et Changement climatique Canada', fetchedAt: new Date(now).toISOString(), cities };
  } catch {
    return null;
  }
}

/**
 * Petite météo de la manchette (imprimé et en ligne) : prévisions publiques d'Environnement et Changement climatique
 * Canada (ECCC), fichiers « citypage » XML du Datamart MSC (https://dd.weather.gc.ca/today/citypage_weather/), lus AU
 * MOMENT de produire l'édition (Licence du gouvernement ouvert / conditions ECCC, attribution obligatoire).
 * Québec et Montréal seulement pour l'instant. Codes vérifiés dans site_list_fr.csv ET dans la balise <name code="…">
 * de chaque fichier. Tout échoue proprement : aucune donnée → null → pas de ligne météo.
 */
const BASE = 'https://dd.weather.gc.ca/today/citypage_weather/QC';

export const WEATHER_SITES = [
  { code: 's0000620', name: 'Québec' },
  { code: 's0000635', name: 'Montréal' },
];

const unxml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&apos;/g, '’').replace(/'/g, '’')
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (xml, re) => { const m = re.exec(xml); return m ? unxml(m[1]) : ''; };

/** Une période de prévision : nom, résumé abrégé, température (max/min), probabilité de précipitations. */
function period(block) {
  const name = tag(block, /<period[^>]*textForecastName="([^"]*)"/);
  const sky = tag(block, /<abbreviatedForecast>[\s\S]*?<textSummary>([\s\S]*?)<\/textSummary>/);
  const t = /<temperature[^>]*class="(high|low)"[^>]*>\s*(-?\d+)\s*</.exec(block);
  const icon = tag(block, /<iconCode[^>]*>(\d+)<\/iconCode>/);
  if (!name || !sky || !t) return null;
  return { name, sky, kind: t[1], temp: Number(t[2]), icon: icon ? Number(icon) : null };
}

/** Lit un fichier citypage : null si le code ne correspond pas ou si rien d'utilisable. */
export function parseCitypage(xml, site) {
  const code = (/<location>[\s\S]*?<name code="([^"]+)"/.exec(String(xml || '')) || [])[1];
  if (code !== site.code) return null;
  const group = (/<forecastGroup>([\s\S]*?)<\/forecastGroup>/.exec(xml) || [])[1] || '';
  const periods = [...group.matchAll(/<forecast>([\s\S]*?)<\/forecast>/g)].map(m => period(m[1])).filter(Boolean).slice(0, 1);
  if (!periods.length) return null;
  const issued = tag(group, /<dateTime name="forecastIssue" zone="UTC"[\s\S]*?<timeStamp>(\d{14})<\/timeStamp>/);
  return { code: site.code, name: site.name, issued, periods };
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

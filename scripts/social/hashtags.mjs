// Hashtags et étiquettes déterministes (testés dans tests/social-hashtags.mjs).
// Sujet et lieu déduits UNIQUEMENT du titre, de l'extrait, des catégories et de la source : jamais inventés.
// 10 nov. 2026 : plafonds par réseau, institution/sport/ville avant le sujet générique, pas de #Actualités
// ni de #PresseÉtudiante. Mot déjà dans le texte : on n'ajoute pas le hashtag de lieu ou de sujet.
// Accents conservés (Mastodon et Bluesky les gèrent ; X, Facebook et LinkedIn aussi).
import { POLICY } from './policy.mjs';

const wordRe = src => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`, 'iu');
const TOPICS = [
  ['Politique', 'politique', wordRe('élection\\w*|électoral\\w*|vote\\w*|gouvernement\\w*|ministre\\w*|député\\w*|caq|legault|parti|politi\\w*|election\\w*|government|minister\\w*')],
  ['Sport', 'sport', wordRe('hockey|football|soccer|basket\\w*|volley\\w*|rugby|natation|swimming|athlétisme|track and field|dek hockey|gridiron|vanier cup|coupe vanier|carabins|stingers|rouge et or|gaiters|redbirds|martlets')],
  ['Culture', 'culture', wordRe('film|cinéma|cinema|musique|music|théâtre|theatre|théâtral|festival|exposition|album|livre|roman|art|arts|concert|documentaire|documentary|poé\\w*|poet\\w*|littérair\\w*|literary|jazz')],
  ['Environnement', 'environnement', wordRe('climat\\w*|climate|environnement\\w*|environment\\w*|écolog\\w*|chaleur|heat|pollution|biodiversit\\w*')],
  ['Santé', 'santé', wordRe('santé|health|cancer|médecin\\w*|hôpital\\w*|hospital|mental')],
  ['Éducation', 'éducation', wordRe('frais de scolarité|tuition|rémunération des stages|grève étudiante|enseignant\\w*|enseign\\w*')],
  ['Société', 'société', wordRe('logement|housing|itinéran\\w*|unhoused|aide alimentaire|food bank|pauvreté|poverty|immigra\\w*|femmes|women')],
  ['International', 'international', wordRe('brésil|brazil|lula|ukraine|gaza|israël|états-unis|trump|chine|china|international')],
];
// Lieu (ville / université) des sources connues.
export const PLACES = {
  'The Link': ['Montréal', 'Concordia'], 'The Concordian': ['Montréal', 'Concordia'], 'The McGill Daily': ['Montréal', 'McGill'],
  'The McGill Tribune': ['Montréal', 'McGill'], 'Le Délit': ['Montréal', 'McGill'], 'Quartier Libre': ['Montréal', 'Université de Montréal'],
  'Montréal Campus': ['Montréal', 'UQAM'], 'Impact Campus': ['Québec', 'Université Laval'], "L'Exemplaire": ['Québec', 'Université Laval'],
  'Zone Campus': ['Trois-Rivières', 'UQTR'], 'La Pige': ['Saguenay', 'Cégep de Jonquière'], 'The Plant': ['Montréal', 'Dawson'],
  'Le Collectif': ['Sherbrooke', 'Université de Sherbrooke'], 'The Campus': ['Sherbrooke', "Bishop's"], 'La Rotonde': ['Ottawa', "Université d'Ottawa"],
};
const camel = s => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const blob = it => [it.bare || it.title, it.desc, ...(it.categories || [])].join(' ');
/** Sujet { tag Bluesky/Mastodon, étiquette Tumblr } ou null. */
export function topicOf(it) { const b = blob(it); const t = TOPICS.find(([, , re]) => re.test(b)); return t ? { tag: t[0], label: t[1] } : null; }
export const placeOf = it => PLACES[(it.source || '').trim()] || [];
// Institution de la source (étiquette courte, celle que le public utilise).
export const INSTITUTION_TAGS = { 'Concordia': '#Concordia', 'McGill': '#McGill', 'Université de Montréal': '#UdeM', 'UQAM': '#UQAM', 'Université Laval': '#ULaval', 'UQTR': '#UQTR', 'Cégep de Jonquière': '#CégepDeJonquière', 'Dawson': '#DawsonCollege', 'Université de Sherbrooke': '#UdeS', "Bishop's": '#BishopsU', "Université d'Ottawa": '#uOttawa' };
export const CITY_TAGS = { 'Montréal': '#Montréal', 'Québec': '#Québec', 'Ottawa': '#Ottawa', 'Saguenay': '#Saguenay', 'Trois-Rivières': '#TroisRivières', 'Sherbrooke': '#Sherbrooke' };
// Institutions citées dans le texte (prioritaires sur l'institution de la source).
const INSTITUTION_IN_TEXT = [
  ['#UQAC', 'UQAC|Université du Québec à Chicoutimi'],
  ['#ULaval', 'Université Laval|ULaval|U-Laval'],
  ['#McGill', 'McGill'],
  ['#Concordia', 'Concordia'],
  ['#UdeM', "Université de Montréal|UdeM"],
  ['#UQAM', 'UQAM|Université du Québec à Montréal'],
  ['#UQTR', 'UQTR|Université du Québec à Trois[\\s-]Rivières'],
  ['#UdeS', 'Université de Sherbrooke|UdeS'],
  ['#BishopsU', "Bishop['’]s"],
  ['#uOttawa', "Université d['’]Ottawa|uOttawa|University of Ottawa"],
  ['#DawsonCollege', 'Dawson College|Dawson'],
  ['#CégepDeJonquière', 'Cégep de Jonquière|Cegep de Jonquiere'],
];
export const institutionTagsFromText = it => INSTITUTION_IN_TEXT.filter(([, src]) => wordRe(src).test(blob(it))).map(([tag]) => tag);
/** Ville réelle de la source, ou rien si elle est inconnue (jamais inventée). */
export function placeTag(it) { return CITY_TAGS[placeOf(it)[0]] || ''; }
export const institutionTag = it => institutionTagsFromText(it)[0] || INSTITUTION_TAGS[placeOf(it)[1]] || '';
// Sport précis (équipes, ligues, institutions) : étiquette du sport, plus parlante que #Sport.
export const SPORT_TAGS = [
  ['#Football', wordRe('football|rouge et or|gridiron|vanier cup|coupe vanier')], ['#Hockey', wordRe('hockey|dek hockey|lnh|nhl')], ['#Basketball', wordRe('basket\\w*')],
  ['#Volleyball', wordRe('volley\\w*')], ['#Soccer', wordRe('soccer')], ['#Rugby', wordRe('rugby')], ['#Natation', wordRe('natation|swimming')], ['#Athlétisme', wordRe('athlétisme|track and field')],
];
export const sportTagOf = text => (SPORT_TAGS.find(([, re]) => re.test(text)) || [])[0] || '';

const strip = s => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const SKIP_IF_IN_TEXT = new Set(['#Québec', '#Montréal', '#Ottawa', '#Saguenay', '#Sherbrooke', '#TroisRivières', '#Éducation', '#Culture', '#Société', '#Politique', '#International', '#Santé', '#Environnement', '#Sport', '#Actualités']);
/** Le mot du hashtag figure déjà dans le texte (casse et accents ignorés, CamelCase découpé). */
export function tagAlreadyInText(tag, text) {
  if (!tag || !text) return false;
  if (new RegExp(`#${tag.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu').test(text)) return true;
  const parts = tag.replace(/^#/, '').replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2').split(/\s+/).filter(Boolean);
  const body = parts.map(p => strip(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-\'’]*');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'iu').test(strip(String(text)));
}

/** Hashtags d'un article (ordre : institution, sport précis, ville, sujet), au plus `max`, sans doublon ni remplissage générique. */
export function articleTags(it, max = 3) {
  if (!(max > 0)) return [];
  const b = blob(it), mentioned = institutionTagsFromText(it);
  const insts = mentioned.length ? mentioned : [INSTITUTION_TAGS[placeOf(it)[1]] || ''].filter(Boolean);
  const t = topicOf(it);
  const sport = t?.tag === 'Sport' ? sportTagOf(b) : '';
  const topic = t && t.tag !== 'Sport' ? '#' + t.tag : '';
  const hay = [b, it.source].filter(Boolean).join(' ');
  const hashOnly = tag => new RegExp(`#${tag.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu').test(hay);
  const out = [];
  for (const tag of [...insts, sport, placeTag(it), topic].filter(Boolean)) {
    if (out.includes(tag) || out.length >= max) continue;
    if (SKIP_IF_IN_TEXT.has(tag) ? tagAlreadyInText(tag, hay) : hashOnly(tag)) continue;
    out.push(tag);
  }
  return out.slice(0, max);
}
export const maxTags = network => POLICY.hashtags?.maxByNetwork?.[network] ?? 0;
/** Ligne de hashtags d'un réseau ('' si aucun). */
export const tagLine = (it, network) => articleTags(it, maxTags(network)).join(' ');
export const bskyTags = it => articleTags(it, maxTags('bluesky'));
// Tumblr : tout en minuscules, étiquettes les plus suivies d'abord (les 5 premières comptent en recherche),
// forme sans accent ajoutée là où on la cherche, langue de l'article, 10 à 15 étiquettes dédupliquées.
const TOPIC_TAGS = {
  'Politique': ['politique', 'politics'], 'Sport': ['sport', 'sports'], 'Culture': ['culture', 'culture'],
  'Environnement': ['environnement', 'environment'], 'Santé': ['santé', 'health'], 'Éducation': ['éducation', 'education'],
  'Société': ['société', 'society'], 'International': ['international', 'world news'], 'Science': ['science', 'science'],
  'Économie': ['économie', 'economy'],
};
const GENERIC = /^(à la une|a la une|une|news|nouvelles|actualités?|actualites?|uncategori[sz]ed|non classé|non classe|general|général|générale|featured|home|accueil|blog|articles?|top stories|latest|misc|divers|autres?|other)$/i;
export function tumblrTags(it, lang = 'fr') {
  const low = s => String(s || '').normalize('NFC').toLowerCase().replace(/[#,;:!?"“”«»()\[\]{}|/\\]/g, ' ').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const en = lang === 'en';
  const [city, uni] = placeOf(it).map(low);
  const ai = it.aiTopic && TOPIC_TAGS[it.aiTopic] ? it.aiTopic : null;
  const rx = topicOf(it)?.tag;
  const topic = TOPIC_TAGS[ai || rx]?.[en ? 1 : 0];
  const cat = low((it.categories || [])[0]);
  const catOk = cat && cat.length <= 30 && cat.split(' ').length <= 3 && !GENERIC.test(cat) && !/^\d+$/.test(cat);
  const withPlain = s => s ? [s, strip(s)] : [];
  const out = en
    ? ['student journalism', 'student newspaper', 'news', ...withPlain(city), 'canada', topic, 'quebec', uni && strip(uni), low(it.source), catOk && cat, 'student press', 'university']
    : ['québec', 'quebec', 'actualités', 'presse étudiante', ...withPlain(city), topic, 'journalisme étudiant', uni, low(it.source), catOk && cat, 'actualites', 'université'];
  const seen = new Set(), res = [];
  for (const x of out) { const v = low(x).slice(0, 60); if (v && !seen.has(v)) { seen.add(v); res.push(v); } }
  return res.slice(0, 15);
}
export { camel };

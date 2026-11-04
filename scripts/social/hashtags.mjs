// Hashtags et étiquettes déterministes (testés dans tests/social-hashtags.mjs).
// Sujet et lieu déduits UNIQUEMENT du titre, de l'extrait, des catégories et de la source : jamais inventés.
// X, Facebook, LinkedIn : aucun hashtag. Bluesky : #Québec #PresseÉtudiante + 1 sujet. Tumblr : 10 à 15 étiquettes en minuscules.
const TOPICS = [
  ['Politique', 'politique', /\b(élection|électoral|vote|gouvernement|ministre|député|caq|legault|parti|politi|election|government|minister)/i],
  ['Sport', 'sport', /\b(hockey|football|soccer|basket|volley|rugby|match|saison|sport|carabins|stingers|rouge et or|gaiters|redbirds|martlets|game|season)/i],
  ['Culture', 'culture', /\b(film|cinéma|cinema|musique|music|théâtre|theatre|théâtral|festival|exposition|album|livre|roman|art |arts|concert|documentaire|documentary)/i],
  ['Environnement', 'environnement', /\b(climat|climate|environnement|environment|écolog|chaleur|heat|pollution|biodiversit)/i],
  ['Santé', 'santé', /\b(santé|health|cancer|médecin|hôpital|hospital|mental)/i],
  ['Éducation', 'éducation', /\b(université|university|cégep|étudiant|student|frais de scolarité|tuition|enseign|campus)/i],
  ['Société', 'société', /\b(logement|housing|itinéran|unhoused|aide alimentaire|food bank|pauvreté|poverty|immigra|femmes|women)/i],
  ['International', 'international', /\b(brésil|brazil|lula|ukraine|gaza|israël|états-unis|trump|chine|china|international)/i],
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
/** Hashtags Bluesky (cliquables par facettes) : toujours #Québec #PresseÉtudiante, + sujet si détecté. */
export function bskyTags(it) { const t = topicOf(it); return ['Québec', 'PresseÉtudiante', ...(t ? [t.tag] : [])].map(x => '#' + x); }
// Tumblr : tout en minuscules, étiquettes les plus suivies d'abord (les 5 premières comptent en recherche),
// forme sans accent ajoutée là où on la cherche, langue de l'article, 10 à 15 étiquettes dédupliquées.
const TOPIC_TAGS = {
  'Politique': ['politique', 'politics'], 'Sport': ['sport', 'sports'], 'Culture': ['culture', 'culture'],
  'Environnement': ['environnement', 'environment'], 'Santé': ['santé', 'health'], 'Éducation': ['éducation', 'education'],
  'Société': ['société', 'society'], 'International': ['international', 'world news'], 'Science': ['science', 'science'],
  'Économie': ['économie', 'economy'],
};
const GENERIC = /^(à la une|a la une|une|news|nouvelles|actualités?|actualites?|uncategori[sz]ed|non classé|non classe|general|général|générale|featured|home|accueil|blog|articles?|top stories|latest|misc|divers|autres?|other)$/i;
const strip = s => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
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

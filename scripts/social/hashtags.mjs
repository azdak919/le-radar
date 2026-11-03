// Hashtags et étiquettes déterministes (testés dans tests/social-hashtags.mjs).
// Sujet et lieu déduits UNIQUEMENT du titre, de l'extrait, des catégories et de la source : jamais inventés.
// X, Facebook, LinkedIn : aucun hashtag. Bluesky : #Québec #PresseÉtudiante + 1 sujet. Tumblr : ≈ 8 étiquettes natives.
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
/** Étiquettes Tumblr natives (≤ 8, sans # ni virgule). */
export function tumblrTags(it, lang = 'fr') {
  const clean = s => String(s || '').replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const t = topicOf(it), [city, uni] = placeOf(it);
  const out = [it.source, uni, city, t?.label, ...(it.categories || []).slice(0, 1), 'presse étudiante', 'journalisme étudiant', 'Québec', 'actualités', ...(lang === 'en' ? ['student press'] : [])];
  const seen = new Set(), res = [];
  for (const x of out.map(clean).filter(Boolean)) { const k = x.toLowerCase(); if (!seen.has(k)) { seen.add(k); res.push(x); } }
  return res.slice(0, 8);
}
export { camel };

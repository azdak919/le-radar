// Journal commun de portée organique (tous les réseaux du pipeline).
// Chaque publication réelle ajoute une ligne. Le relevé des likes n'utilise que des API
// déjà gratuites (Bluesky et Mastodon publics). X, Facebook et LinkedIn passent par Buffer,
// qui ne donne pas les vues : on ne branche aucune API payante.
import fs from 'node:fs';
import path from 'node:path';

export const LOG_REL = 'data/social/reach-log.json';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const KEEP_MS = 90 * 864e5;

export function blankLog() {
  return {
    _doc: 'Journal de portée organique. Une ligne par publication réelle. `npm run` n’existe pas pour ce fichier : `node scripts/social/reach-log.mjs` résume, `--pull` interroge les API publiques, `--write` enregistre le relevé. Vues X/Facebook/LinkedIn : non disponibles sans API payante.',
    posts: [],
  };
}

export function makeEntry(p = {}) {
  const lang = p.lang === 'en' ? 'en' : 'fr';
  const type = p.type === 'une' || p.type === 'sport' ? p.type : 'article';
  if (!p.network) throw new Error('réseau manquant');
  return {
    id: String(p.id || p.postId || p.url || ''),
    at: p.at || new Date().toISOString(),
    network: p.network,
    type,
    lang,
    image: !!p.image,
    postId: p.postId || '',
    url: p.url || '',
  };
}

export function appendEntry(log, entry) {
  const posts = Array.isArray(log?.posts) ? log.posts : [];
  if (entry.id && posts.some(x => x.network === entry.network && x.id === entry.id)) return { ...log, posts };
  const cutoff = Date.now() - KEEP_MS;
  return { ...log, posts: [...posts.filter(x => Date.parse(x.at) >= cutoff), entry] };
}

export function summarize(log, { from = 0, to = Infinity } = {}) {
  const posts = (log?.posts || []).filter(p => { const t = Date.parse(p.at); return t >= from && t < to; });
  const by = {};
  for (const p of posts) {
    const row = by[p.network] ||= { posts: 0, image: 0, fr: 0, en: 0, likes: 0, measured: 0 };
    row.posts++;
    if (p.image) row.image++;
    if (p.lang === 'en') row.en++; else row.fr++;
    if (p.metrics && Number.isFinite(p.metrics.likes)) { row.likes += p.metrics.likes; row.measured++; }
  }
  return { posts: posts.length, by };
}

/** Écrit le journal seulement hors essai. Affiche toujours la ligne. */
export function noteReach(entry, { dry = false, file = path.join(ROOT, LOG_REL) } = {}) {
  const e = makeEntry(entry);
  console.log(`${dry ? 'ESSAI ' : ''}Journal ${e.network} ${e.type} ${e.lang} image=${e.image ? 'oui' : 'non'} ${e.id || '(sans id)'}`);
  if (dry) return e;
  let log = blankLog();
  try { log = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(appendEntry(log, e), null, 1) + '\n');
  return e;
}

async function pullBluesky(entry, fetchImpl) {
  const uri = String(entry.postId || '').startsWith('at://') ? entry.postId : '';
  if (!uri) return { metrics: null, metricsNote: 'URI Bluesky absente : likes non relevés.' };
  const r = await fetchImpl(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
  if (!r.ok) return { metrics: null, metricsNote: `Bluesky HTTP ${r.status}` };
  const p = (await r.json())?.posts?.[0];
  if (!p) return { metrics: null, metricsNote: 'post Bluesky introuvable' };
  return { metrics: { likes: p.likeCount || 0, reposts: p.repostCount || 0, replies: p.replyCount || 0, views: null }, metricsNote: 'vues non exposées par l’API publique Bluesky' };
}

async function pullMastodon(entry, fetchImpl) {
  const m = String(entry.url || '').match(/^(https:\/\/[^/]+)\/@[^/]+\/(\d+)/);
  if (!m) return { metrics: null, metricsNote: 'URL Mastodon absente : likes non relevés.' };
  const r = await fetchImpl(`${m[1]}/api/v1/statuses/${m[2]}`);
  if (!r.ok) return { metrics: null, metricsNote: `Mastodon HTTP ${r.status}` };
  const s = await r.json();
  return { metrics: { likes: s.favourites_count || 0, reposts: s.reblogs_count || 0, replies: s.replies_count || 0, views: null }, metricsNote: 'vues non exposées par l’API publique Mastodon' };
}

/** Relève likes/repartages/réponses si une API déjà gratuite le permet. Jamais d'accès payant. */
export async function pullEntry(entry, { fetchImpl = fetch } = {}) {
  try {
    if (entry.network === 'bluesky') return { ...entry, ...(await pullBluesky(entry, fetchImpl)) };
    if (entry.network === 'mastodon') return { ...entry, ...(await pullMastodon(entry, fetchImpl)) };
  } catch (e) {
    return { ...entry, metrics: null, metricsNote: `relevé impossible (${e?.name || 'erreur'})` };
  }
  const viaBuffer = entry.network === 'x' || entry.network === 'facebook' || entry.network === 'linkedin';
  return {
    ...entry,
    metrics: null,
    metricsNote: viaBuffer
      ? 'statistiques non disponibles via l’API gratuite déjà utilisée (Buffer) ; aucun accès payant ajouté'
      : 'statistiques non relevées pour ce réseau sans clé supplémentaire',
  };
}

function printSummary(log) {
  const s = summarize(log);
  console.log(`Journal : ${s.posts} publication(s).`);
  for (const [net, row] of Object.entries(s.by)) console.log(`  ${net} : ${row.posts} (fr ${row.fr}, en ${row.en}, image ${row.image}, likes relevés ${row.measured ? row.likes : '—'})`);
  if (!s.posts) console.log('Aucune ligne. Les publications réelles s’ajoutent toutes seules.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const file = path.join(ROOT, LOG_REL);
  let log = blankLog();
  try { log = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (process.argv.includes('--pull')) {
    const next = [];
    for (const p of log.posts || []) next.push(await pullEntry(p));
    log = { ...log, posts: next, pulledAt: new Date().toISOString() };
    for (const p of next) console.log(`${p.network} ${p.id} : ${p.metrics ? `${p.metrics.likes} j'aime` : 'sans chiffre'} — ${p.metricsNote}`);
    if (process.argv.includes('--write')) fs.writeFileSync(file, JSON.stringify(log, null, 1) + '\n');
    else console.log('Essai : rien n’est écrit (ajouter --write pour enregistrer le relevé).');
  }
  printSummary(log);
}

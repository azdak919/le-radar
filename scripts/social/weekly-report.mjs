#!/usr/bin/env node
// Bilan hebdomadaire des interactions par réseau (7 jours), comptes internes exclus.
// Écrit data/social/weekly/AAAA-MM-JJ.md (+ résumé du job) : aucun courriel, aucune publication.
// Mesuré : Bluesky (API publique), Mastodon (API publique), Tumblr (clé d'API). X, Facebook, LinkedIn : publications envoyées
// seulement (le dépôt n'a pas accès aux statistiques de ces réseaux ; les « réactions » de Buffer ne sont pas vérifiables).
// Usage : node scripts/social/weekly-report.mjs [--days 7] [--now ISO] [--out dossier] [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { torontoDay } from './policy.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rd = (f, d = null) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };
const lc = s => String(s || '').toLowerCase().replace(/^@/, '');
const UA = { 'user-agent': 'LE-RADAR-report/1.0 (+https://le-radar.ca/)' };

export const isInternal = (id, list = []) => list.map(lc).includes(lc(id));
/** Interactions externes d'un post : { likes, reposts, replies, quotes } (acteurs internes retirés). */
export function externalCounts({ likes = [], reposts = [], replies = [], quotes = [] }, internal = []) {
  const ext = a => a.filter(x => !isInternal(x, internal));
  const r = { likes: ext(likes).length, reposts: ext(reposts).length, replies: ext(replies).length, quotes: ext(quotes).length };
  return { ...r, total: r.likes + r.reposts + r.replies + r.quotes, internalExcluded: likes.length + reposts.length + replies.length + quotes.length - r.likes - r.reposts - r.replies - r.quotes };
}
/** Agrège des posts { url, text, ext } en synthèse. */
export function summarizePosts(posts) {
  const sum = posts.reduce((a, p) => ({ likes: a.likes + p.ext.likes, reposts: a.reposts + p.ext.reposts, replies: a.replies + p.ext.replies, quotes: a.quotes + p.ext.quotes, internal: a.internal + p.ext.internalExcluded }), { likes: 0, reposts: 0, replies: 0, quotes: 0, internal: 0 });
  const total = sum.likes + sum.reposts + sum.replies + sum.quotes;
  const top = [...posts].sort((a, b) => b.ext.total - a.ext.total).filter(p => p.ext.total > 0).slice(0, 3);
  return { posts: posts.length, ...sum, total, perPost: posts.length ? +(total / posts.length).toFixed(2) : 0, top, zero: posts.filter(p => p.ext.total === 0).length };
}
export const delta = (now, before, date) => (before == null ? 'première mesure' : `${now - before >= 0 ? '+' : ''}${now - before} depuis le ${date}`);

async function j(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url.split('?')[0].split('/').slice(-2).join('/')} ${r.status}`);
  return r.json();
}
const BSKY = 'https://public.api.bsky.app/xrpc';
async function bluesky({ since, internal }) {
  const actor = process.env.BLUESKY_HANDLE || 'le-radar.ca'; // en CI la variable peut être un DID : on retombe toujours sur le @handle du profil
  const prof = await j(`${BSKY}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
  const handle = prof.handle || actor;
  const all = []; let cur = '';
  for (let page = 0; page < 6; page++) { // pagination : toute la période, 600 posts au plus
    const feed = await j(`${BSKY}/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=100&filter=posts_no_replies${cur ? '&cursor=' + cur : ''}`);
    all.push(...(feed.feed || []).map(f => f.post)); cur = feed.cursor || '';
    if (!cur || all.length === 0 || Date.parse(all.at(-1).indexedAt) < since) break;
  }
  const mine = all.filter(p => p.author?.handle === handle && Date.parse(p.indexedAt) >= since);
  const posts = [];
  for (const p of mine) {
    const g = async (nsid, key, extra = '') => { try { return ((await j(`${BSKY}/${nsid}?${extra}limit=100`))[key] || []); } catch { return null; } };
    const likes = await g('app.bsky.feed.getLikes', 'likes', `uri=${encodeURIComponent(p.uri)}&`), reposts = await g('app.bsky.feed.getRepostedBy', 'repostedBy', `uri=${encodeURIComponent(p.uri)}&`);
    const quotes = await g('app.bsky.feed.getQuotes', 'posts', `uri=${encodeURIComponent(p.uri)}&`);
    let replies = []; try { replies = ((await j(`${BSKY}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(p.uri)}&depth=1`)).thread?.replies || []).map(r => r.post?.author?.handle).filter(Boolean); } catch {}
    const names = a => (a || []).map(x => x.actor?.handle || x.handle || x.author?.handle).filter(Boolean);
    posts.push({ url: `https://bsky.app/profile/${handle}/post/${p.uri.split('/').pop()}`, text: (p.record?.text || '').split('\n')[0].slice(0, 80), ext: externalCounts({ likes: names(likes), reposts: names(reposts), replies, quotes: names(quotes) }, internal) });
  }
  let intFollowers = 0, cursor, seen = 0;
  try { do { const b = await j(`${BSKY}/app.bsky.graph.getFollowers?actor=${handle}&limit=100${cursor ? '&cursor=' + cursor : ''}`); for (const f of b.followers) { seen++; if (isInternal(f.handle, internal)) intFollowers++; } cursor = b.cursor; } while (cursor && seen < 1000); } catch {}
  return { followers: prof.followersCount - intFollowers, followersRaw: prof.followersCount, internalFollowers: intFollowers, follows: prof.followsCount, posts: summarizePosts(posts) };
}
async function mastodon({ since, internal }) {
  const base = (process.env.MASTODON_INSTANCE || 'https://piaille.fr').replace(/\/+$/, ''), acct = process.env.MASTODON_ACCT || 'leradar';
  const a = await j(`${base}/api/v1/accounts/lookup?acct=${acct}`);
  const all = []; let maxId = '';
  for (let page = 0; page < 6; page++) {
    const part = await j(`${base}/api/v1/accounts/${a.id}/statuses?limit=40&exclude_replies=true&exclude_reblogs=true${maxId ? '&max_id=' + maxId : ''}`);
    all.push(...part); if (!part.length || Date.parse(part.at(-1).created_at) < since) break; maxId = part.at(-1).id;
  }
  const sts = all.filter(s => Date.parse(s.created_at) >= since);
  const posts = [];
  for (const s of sts) {
    const who = async kind => { try { return (await j(`${base}/api/v1/statuses/${s.id}/${kind}?limit=80`)).map(x => x.acct); } catch { return null; } };
    let likes = await who('favourited_by'), reposts = await who('reblogged_by'), filtered = !!(likes && reposts);
    if (!likes) likes = new Array(s.favourites_count).fill('?'); if (!reposts) reposts = new Array(s.reblogs_count).fill('?');
    const ext = externalCounts({ likes, reposts, replies: new Array(s.replies_count || 0).fill('?') }, internal);
    posts.push({ url: s.url, text: String(s.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80), ext, filtered });
  }
  const unfiltered = posts.filter(p => !p.filtered).length;
  return { followers: a.followers_count, follows: a.following_count, posts: summarizePosts(posts), note: unfiltered ? `${unfiltered} post(s) : liste des comptes indisponible, comptes internes non identifiables (compte brut).` : '' };
}
async function tumblr({ since, internal }) {
  const ck = process.env.TUMBLR_CONSUMER_KEY; if (!ck) return { skipped: 'clé d’API Tumblr absente (secret non fourni à ce job).' };
  const blog = process.env.TUMBLR_BLOG || 'le-radar-ca.tumblr.com';
  const r = await j(`https://api.tumblr.com/v2/blog/${blog}/posts?api_key=${ck}&notes_info=true&limit=50`);
  const posts = (r.response?.posts || []).filter(p => p.timestamp * 1000 >= since).map(p => {
    const notes = p.notes || [], pick = t => notes.filter(n => n.type === t).map(n => n.blog_name);
    return { url: p.post_url, text: (p.summary || '').slice(0, 80), ext: externalCounts({ likes: pick('like'), reposts: pick('reblog'), replies: pick('reply') }, internal) };
  });
  return { followers: null, posts: summarizePosts(posts), note: 'abonnés Tumblr non publics (non mesurés).' };
}
const buffered = (state, since, key = 'sent') => Object.values((key ? state?.[key] : state) || {}).filter(s => s?.at && Date.parse(s.at) >= since && (s.postId || s.uri || s.url)).length;

export function render({ now, days, nets, sentCounts, internal, prev }) {
  const L = [`# Bilan hebdomadaire des interactions — semaine se terminant le ${torontoDay(now)}`, '', `Période : ${days} jours. Mesure automatique, comptes internes exclus (${Object.entries(internal).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k} : ${v.join(', ')}`).join(' ; ')}). Aucun courriel envoyé, rien publié.`, ''];
  for (const [name, r] of Object.entries(nets)) {
    L.push(`## ${name}`, '');
    if (r.error) { L.push(`Mesure impossible ce passage : ${r.error}`, ''); continue; }
    if (r.skipped) { L.push(r.skipped, ''); continue; }
    const p = r.posts;
    L.push(`Publications de la semaine : ${p.posts}. Interactions externes : ${p.total} (${p.likes} j'aime, ${p.reposts} partages, ${p.replies} réponses, ${p.quotes} citations), soit ${p.perPost} par publication ; ${p.zero} publication(s) sans aucune interaction externe. Interactions internes écartées : ${p.internal}.`);
    if (r.followers != null) L.push(`Abonnés externes : ${r.followers}${r.internalFollowers ? ` (compte brut ${r.followersRaw}, ${r.internalFollowers} interne(s) retiré(s))` : ''} — ${delta(r.followers, prev?.followers?.[name.toLowerCase()], prev?.date)}.${r.follows != null ? ` Abonnements du compte : ${r.follows}.` : ''}`);
    if (p.top.length) L.push('', 'Les plus engageantes :', ...p.top.map(t => `- ${t.text} — ${t.ext.total} (${t.url})`));
    if (r.note) L.push('', `Note : ${r.note}`);
    L.push('');
  }
  L.push('## X, Facebook, LinkedIn (via Buffer)', '', `Publications envoyées cette semaine : X ${sentCounts.x}, Facebook ${sentCounts.facebook}, LinkedIn ${sentCounts.linkedin}. Les interactions de ces réseaux ne sont pas mesurées par le dépôt (aucun accès API aux statistiques ; les « réactions » affichées par Buffer ne sont pas vérifiables et ne sont pas comptées).`, '');
  return L.join('\n');
}

async function main() {
  const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const now = arg('now') ? Date.parse(arg('now')) : Date.now(), days = +arg('days', 7), since = now - days * 864e5;
  const internal = rd('data/social/internal-accounts.json', {}), out = path.resolve(ROOT, arg('out', 'data/social/weekly'));
  fs.mkdirSync(out, { recursive: true });
  const snap = rd('data/social/weekly/snapshot.json', { history: [] }), prev = snap.history.filter(h => now - Date.parse(h.date) >= 5 * 864e5).at(-1);
  const nets = {};
  if (!process.argv.includes('--offline')) for (const [name, fn, key] of [['Bluesky', bluesky, 'bluesky'], ['Mastodon', mastodon, 'mastodon'], ['Tumblr', tumblr, 'tumblr']]) {
    try { nets[name] = await fn({ since, internal: internal[key] || [] }); } catch (e) { nets[name] = { error: String(e.message).slice(0, 200) }; }
  }
  const sentCounts = { x: buffered(rd('data/buffer-sent.json'), since), facebook: buffered(rd('data/buffer-pages-sent.json', {}), since, 'facebook'), linkedin: buffered(rd('data/buffer-pages-sent.json', {}), since, 'linkedin') };
  const text = render({ now, days, nets, sentCounts, internal, prev });
  fs.writeFileSync(path.join(out, `${torontoDay(now)}.md`), text + '\n');
  const followers = Object.fromEntries(Object.entries(nets).filter(([, r]) => r.followers != null).map(([k, r]) => [k.toLowerCase(), r.followers]));
  snap.history = [...snap.history.filter(h => h.date !== torontoDay(now)), { date: torontoDay(now), followers }].slice(-26);
  fs.writeFileSync(path.join(out, 'snapshot.json'), JSON.stringify(snap, null, 1) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  console.log(text);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) await main();

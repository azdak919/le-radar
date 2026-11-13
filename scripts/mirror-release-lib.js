'use strict';
/**
 * Stockage des images miroir hors historique git : fichiers d'une Release
 * GitHub dédiée (tag `mirror-images`, jamais android-v*). Les URL publiques ne
 * changent pas : pages-deploy.yml recopie ces fichiers dans
 * _site/assets/news-images/ (même domaine, même cache PWA, même app Android).
 *
 * plan() est pur : quoi téléverser, quoi supprimer.
 *  - upload : fichier local non suivi par git, absent de la Release,
 *    ou déjà publié sous le même nom mais avec une taille différente
 *    (JPEG Canva réécrit sur place). `sizes` est optionnel : sans taille,
 *    on ne republie pas un fichier déjà nommé.
 *  - delete : fichier de la Release absent du dossier local et absent de
 *    `keep` (images encore citées par les fiches d'article récentes, file
 *    Buffer) depuis plus de graceDays. Le délai part de la date de mise en
 *    ligne dans la Release ; 10 jours couvrent la fenêtre sociale (72 h de
 *    sélection + file d'un jour ou deux). Sans ça, une image mise en ligne
 *    il y a plus de 2 jours disparaissait dès qu'elle sortait du fil, et
 *    Buffer publiait une URL 404 (« media URL to be publicly accessible »).
 */
const TAG = 'mirror-images';
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;
/** Fenêtre de conservation des images encore utiles aux fiches et à Buffer. */
const SOCIAL_KEEP_DAYS = 10;
const NEWS_IMAGE_RE = /\/assets\/news-images\/([^/?#]+)$/i;

/** Noms de fichiers miroir encore cités par des fiches d'article récentes. */
function keepNamesFromPages(pages, { now = Date.now(), keepDays = SOCIAL_KEEP_DAYS } = {}) {
  const arts = (pages && (pages.articles || pages)) || {};
  const cutoff = now - keepDays * 86400000;
  const names = new Set();
  for (const pg of Object.values(arts)) {
    const m = String(pg?.image || '').match(NEWS_IMAGE_RE);
    if (!m) continue;
    const ts = Date.parse(pg.date || pg.firstSeen || 0);
    if (Number.isFinite(ts) && ts >= cutoff) names.add(m[1]);
  }
  return [...names].sort();
}

/**
 * Noms miroir cités par des publications sociales récentes ou à venir (data/buffer-sent.json,
 * data/buffer-pages-sent.json : champ `image`). Buffer ne télécharge l'image qu'à l'heure prévue,
 * parfois 36 h après l'ajout ; si l'article change de photo ou sort du fil entre-temps, son ancienne
 * image ne doit pas disparaître (cause des échecs X du 10 nov. 2026 : « media URL … publicly accessible »).
 */
function keepNamesFromSocial(states, { now = Date.now(), keepDays = SOCIAL_KEEP_DAYS } = {}) {
  const cutoff = now - keepDays * 86400000; const names = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.image === 'string') {
      const m = o.image.match(NEWS_IMAGE_RE); const ts = Math.max(Date.parse(o.dueAt || 0) || 0, Date.parse(o.at || 0) || 0);
      if (m && ts >= cutoff) names.add(m[1]);
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  for (const st of [].concat(states || [])) walk(st);
  return [...names].sort();
}

function plan({ local = [], tracked = [], remote = [], sizes = {}, now = Date.now(), graceDays = SOCIAL_KEEP_DAYS, keep = [] }) {
  const loc = new Set(local.filter((n) => IMG.test(n)));
  const held = new Set([...keep, ...loc]);
  const trk = new Set(tracked);
  const rem = new Map(remote.map((r) => [r.name, r]));
  const upload = [...loc].filter((n) => {
    if (trk.has(n)) return false;
    const published = rem.get(n);
    if (!published) return true;
    const localSize = sizes[n];
    const remoteSize = Number(published.size);
    return Number.isFinite(localSize) && Number.isFinite(remoteSize) && localSize !== remoteSize;
  }).sort();
  const cutoff = now - graceDays * 86400000;
  const del = remote
    .filter((r) => IMG.test(r.name) && !held.has(r.name) && Date.parse(r.createdAt || r.created_at || 0) < cutoff)
    .map((r) => r.name).sort();
  return { upload, delete: del };
}

// Erreurs passagères de l'API GitHub (HTTP 5xx, coupure réseau) : on réessaie ;
// les autres (404, droits, release absente) remontent tout de suite.
const TRANSIENT = /HTTP 5\d\d|HTTP 429|timed? ?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|connection reset|unexpected EOF|stream error/i;
function isTransient(text) { return TRANSIENT.test(String(text || '')); }

module.exports = { TAG, IMG, SOCIAL_KEEP_DAYS, keepNamesFromPages, keepNamesFromSocial, plan, isTransient };

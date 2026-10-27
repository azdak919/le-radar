'use strict';
/**
 * Stockage des images miroir hors historique git : fichiers d'une Release
 * GitHub dédiée (tag `mirror-images`, jamais android-v*). Les URL publiques ne
 * changent pas : pages-deploy.yml recopie ces fichiers dans
 * _site/assets/news-images/ (même domaine, même cache PWA, même app Android).
 *
 * plan() est pur : quoi téléverser, quoi supprimer.
 *  - upload : fichier local absent de la Release et non suivi par git ;
 *  - delete : fichier de la Release absent du dossier local (purgé par le
 *    miroir, comme aujourd'hui) depuis plus de graceDays (un article
 *    publié juste avant ne perd jamais son image).
 */
const TAG = 'mirror-images';
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i;

function plan({ local = [], tracked = [], remote = [], now = Date.now(), graceDays = 2 }) {
  const loc = new Set(local.filter((n) => IMG.test(n)));
  const trk = new Set(tracked);
  const rem = new Map(remote.map((r) => [r.name, r]));
  const upload = [...loc].filter((n) => !rem.has(n) && !trk.has(n)).sort();
  const cutoff = now - graceDays * 86400000;
  const del = remote
    .filter((r) => IMG.test(r.name) && !loc.has(r.name) && Date.parse(r.createdAt || r.created_at || 0) < cutoff)
    .map((r) => r.name).sort();
  return { upload, delete: del };
}

module.exports = { TAG, IMG, plan };

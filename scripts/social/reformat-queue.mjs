#!/usr/bin/env node
// Remet au format actuel (formateur partagé buildText : titre, extrait, « Média (@x) · Auteur »,
// lien de la fiche le-radar.ca, 📸 crédit) les publications X déjà en file Buffer, via editPost
// (même id, même image, même heure). L'article est retrouvé dans le flux par l'état buffer-sent.json.
// Ignore toute publication due dans moins de 10 min ou absente du flux. DRY_RUN=true : lecture seule.
import fs from 'node:fs';
import { buildText, formatOk, parseFeed, stripUtm, xlen, LIMITS } from './lib.mjs';
import { bankCredit } from './image-resolve.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';

/** Texte attendu pour un post en file (pur, testable). */
export function reformatText(it, accounts, { credit = '', img = '' } = {}) {
  return buildText(it, accounts, LIMITS.x, { credit, photo: !!img });
}

async function main() {
  const ACCOUNTS = JSON.parse(fs.readFileSync(new URL('../../data/social/x-accounts.json', import.meta.url))).accounts;
  const state = JSON.parse(fs.readFileSync(new URL('../../data/buffer-sent.json', import.meta.url))).sent || {};
  const byPost = new Map(Object.entries(state).filter(([, s]) => s.postId).map(([k, s]) => [s.postId, { ...s, key: k }]));
  const key = process.env.BUFFER_API_KEY || '';
  if (!key) { console.log('BUFFER_API_KEY absent : rien à faire.'); return; }
  const dry = process.env.DRY_RUN === 'true';
  const ch = createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined });
  const items = parseFeed(await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text());
  const find = s => s && items.find(i => i.link === stripUtm(s.key) || i.id === s.key || i.link === s.link);
  const fmt = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' });
  try {
    const q = (await ch.queued()).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    console.log(`File : ${q.length} publication(s)`);
    let n = 0;
    for (const p of q) {
      const s = byPost.get(p.id), it = find(s);
      if (!it) { console.log(`! ${p.id} ${fmt(p.dueAt)} article introuvable (état/flux), intact`); continue; }
      const img = p.assets?.[0]?.source || '';
      const credit = s.credit && s.credit !== it.source ? s.credit : (it.credit || (img && bankCredit(img)) || '');
      const text = reformatText(it, ACCOUNTS, { credit, img });
      if (!text) { console.log(`! ${p.id} texte vide (garde), intact`); continue; }
      if (xlen(text) > LIMITS.x) { console.log(`! ${p.id} ${fmt(p.dueAt)} dépasserait ${LIMITS.x} car., intact`); continue; }
      if (text === p.text) { console.log(`= ${p.id} ${fmt(p.dueAt)} déjà au bon format`); continue; }
      if (Date.parse(p.dueAt) - Date.now() < 10 * 60e3) { console.log(`! ${p.id} ${fmt(p.dueAt)} trop proche, intact`); continue; }
      if (dry) { console.log(`~ ${p.id} ${fmt(p.dueAt)} serait corrigé :\n${text}`); continue; }
      const r = await ch.editText(p.id, text); n++;
      console.log(`✓ ${r.id} ${fmt(r.dueAt)} corrigé`);
    }
    const after = await ch.queued();
    const stale = after.filter(p => { const it = find(byPost.get(p.id)); return it && !formatOk(p.text, it, byPost.get(p.id)?.credit); }).length;
    console.log(`${dry ? 'ESSAI' : 'RÉEL'} : ${n} corrigée(s) · file après : ${after.length} · hors format : ${stale}`);
  } catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }
}
if (import.meta.url === `file://${process.argv[1]}`) await main();

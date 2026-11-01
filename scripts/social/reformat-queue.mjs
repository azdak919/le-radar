#!/usr/bin/env node
// Remet au format « Média • Auteur • Titre : extrait » + lien des publications déjà en file Buffer, via editPost
// (même id, même image, même heure). Ignore toute publication due dans moins de 10 min. DRY_RUN=true : lecture seule.
import fs from 'node:fs';
import { joinHead, bulletHead, namedHead, isEnglish, xlen, LIMITS, photoLine } from './lib.mjs';
import { bankCredit } from './image-resolve.mjs';
const ACCOUNTS = JSON.parse(fs.readFileSync(new URL('../../data/social/x-accounts.json', import.meta.url))).accounts;
const state = JSON.parse(fs.readFileSync(new URL('../../data/buffer-sent.json', import.meta.url))).sent;
const byPost = new Map(Object.values(state).filter(s => s.postId).map(s => [s.postId, s]));
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
const key = process.env.BUFFER_API_KEY || '';
if (!key) { console.log('BUFFER_API_KEY absent : rien à faire.'); process.exit(0); }
const dry = process.env.DRY_RUN === 'true';
const ch = createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined });
// ancien format : ligne vide / extrait séparé (hors lien et 📸), ou @ en tête
const oldFormat = p => p.text.startsWith('@') || p.text.split('\n').filter(l => l.trim() && !l.startsWith('📸') && !/^https?:\/\//.test(l)).length > 1 || /\n\s*\n/.test(p.text);
const fmt = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' });
try {
  const q = (await ch.queued()).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  console.log(`File : ${q.length} publication(s)`);
  let n = 0;
  for (const p of q) {
    // « titre\n\nextrait\nlien » → « titre : extrait\nlien »
    const lines = p.text.split('\n').filter(l => l.trim() && !l.startsWith('📸'));
    const li = lines.findIndex(l => /^https?:\/\//.test(l));
    const link = li >= 0 ? lines.splice(li, 1)[0] : null;
    const src = byPost.get(p.id)?.source || '';
    const h0 = namedHead(bulletHead(lines[0] || ''), ACCOUNTS, src);
    const head = lines.length > 1 ? joinHead(h0, lines.slice(1).join(' '), isEnglish(lines[0])) : h0;
    const img = p.assets?.[0]?.source || '';
    const credit = byPost.get(p.id)?.credit || (img && bankCredit(img)) || src;
    console.log(`  image : ${img || 'aucune'} · crédit : ${credit}`);
    let text = head + (link ? '\n' + link : '') + (img ? '\n' + photoLine(credit, src) : '');
    // raccourcir l'extrait au mot entier si le crédit fait dépasser
    while (xlen(text) > LIMITS.x && / \S+…?$/.test(text.split('\n')[0])) {
      const [h, ...rest] = text.split('\n');
      text = [h.replace(/[\s,;:.–-]*\s\S+…?$/, '…'), ...rest].join('\n');
    }
    if (xlen(text) > LIMITS.x) { console.log(`! ${p.id} ${fmt(p.dueAt)} dépasserait ${LIMITS.x} car., intact`); continue; }
    if (text === p.text) { console.log(`= ${p.id} ${fmt(p.dueAt)} déjà au bon format`); continue; }
    if (Date.parse(p.dueAt) - Date.now() < 10 * 60e3) { console.log(`! ${p.id} ${fmt(p.dueAt)} trop proche, intact`); continue; }
    if (dry) { console.log(`~ ${p.id} ${fmt(p.dueAt)} serait corrigé`); continue; }
    const r = await ch.editText(p.id, text); n++;
    console.log(`✓ ${r.id} ${fmt(r.dueAt)} corrigé`);
  }
  const after = await ch.queued();
  console.log(`${dry ? 'ESSAI' : 'RÉEL'} : ${n} corrigée(s) · file après : ${after.length} · ancien format restant : ${after.filter(oldFormat).length}`);
  for (const p of after) console.log(`  ${fmt(p.dueAt)} · ${xlen(p.text)} car. · ${p.text.split('\n')[0]}`);
} catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }

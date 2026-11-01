#!/usr/bin/env node
// Remet au format « Média • Auteur • Titre : extrait » + lien des publications déjà en file Buffer, via editPost
// (même id, même image, même heure). Ignore toute publication due dans moins de 10 min. DRY_RUN=true : lecture seule.
import { joinHead, bulletHead, isEnglish } from './lib.mjs';
import { createXBuffer, AuthError } from './channels/x-buffer.mjs';
const key = process.env.BUFFER_API_KEY || '';
if (!key) { console.log('BUFFER_API_KEY absent : rien à faire.'); process.exit(0); }
const dry = process.env.DRY_RUN === 'true';
const ch = createXBuffer({ key, fallbackId: process.env.BUFFER_CHANNEL_ID || undefined });
const fmt = t => new Date(t).toLocaleString('fr-CA', { timeZone: 'America/Toronto' });
try {
  const q = (await ch.queued()).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  console.log(`File : ${q.length} publication(s)`);
  let n = 0;
  for (const p of q) {
    // « titre\n\nextrait\nlien » → « titre : extrait\nlien »
    const lines = p.text.split('\n').filter(l => l.trim());
    const link = /^https?:\/\//.test(lines.at(-1)) ? lines.pop() : null;
    const text = lines.length > 1 ? joinHead(bulletHead(lines[0]), lines.slice(1).join(' '), isEnglish(lines[0])) + (link ? '\n' + link : '') : p.text;
    if (text === p.text) { console.log(`= ${p.id} ${fmt(p.dueAt)} déjà au bon format`); continue; }
    if (Date.parse(p.dueAt) - Date.now() < 10 * 60e3) { console.log(`! ${p.id} ${fmt(p.dueAt)} trop proche, intact`); continue; }
    if (dry) { console.log(`~ ${p.id} ${fmt(p.dueAt)} serait corrigé`); continue; }
    const r = await ch.editText(p.id, text); n++;
    console.log(`✓ ${r.id} ${fmt(r.dueAt)} corrigé`);
  }
  const after = await ch.queued();
  console.log(`${dry ? 'ESSAI' : 'RÉEL'} : ${n} corrigée(s) · file après : ${after.length} · ancien format restant : ${after.filter(p => p.text.split('\n').length > 2).length}`);
} catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }

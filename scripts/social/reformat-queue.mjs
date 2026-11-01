#!/usr/bin/env node
// Retire la ligne vide (titre / extrait / lien) des publications déjà en file Buffer, via editPost
// (même id, même image, même heure). Ignore toute publication due dans moins de 10 min. DRY_RUN=true : lecture seule.
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
    const text = p.text.replace(/\n{2,}/g, '\n');
    if (text === p.text) { console.log(`= ${p.id} ${fmt(p.dueAt)} déjà au bon format`); continue; }
    if (Date.parse(p.dueAt) - Date.now() < 10 * 60e3) { console.log(`! ${p.id} ${fmt(p.dueAt)} trop proche, intact`); continue; }
    if (dry) { console.log(`~ ${p.id} ${fmt(p.dueAt)} serait corrigé`); continue; }
    const r = await ch.editText(p.id, text); n++;
    console.log(`✓ ${r.id} ${fmt(r.dueAt)} corrigé`);
  }
  const after = await ch.queued();
  console.log(`${dry ? 'ESSAI' : 'RÉEL'} : ${n} corrigée(s) · file après : ${after.length} · lignes vides restantes : ${after.filter(p => /\n\n/.test(p.text)).length}`);
} catch (e) { if (e instanceof AuthError) { console.error(`::error::${e.message}`); process.exit(1); } throw e; }

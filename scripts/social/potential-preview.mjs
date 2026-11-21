#!/usr/bin/env node
// Aperçu du potentiel encore éteint. Lit le fil local. N'appelle pas Buffer et ne publie rien.
// Usage : node scripts/social/potential-preview.mjs [--out docs/social-potential-apercu.md]
import fs from 'node:fs';
import path from 'node:path';
import { buildXText, siteLink } from './lib.mjs';
import { articleAlt, galleryFrom, potentialFlags, xThread } from './potential.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };

/** Articles déjà en mémoire → texte d'aperçu. `items` ont title, source, link, desc, image. */
export function renderPreview(items, { updated = '', flags = potentialFlags() } = {}) {
  const ready = (items || []).filter(it => it && it.title && (it.image || it.url));
  const lines = [];
  lines.push('# Aperçu du potentiel social');
  lines.push('');
  lines.push(`Fil lu : ${updated || 'fourni'}. Aucun appel Buffer. Rien n’est publié.`);
  lines.push('');
  lines.push(`Drapeaux dans \`policy.json\` : fil X ${flags.xThread ? 'oui' : 'non'}, plusieurs images Facebook ${flags.facebookImages || 'non'}, LinkedIn ${flags.linkedinImages || 'non'}, utm ${flags.utm ? 'oui' : 'non'}.`);
  lines.push('');
  const accounts = [];
  for (const it of ready.slice(0, 3)) {
    const row = { ...it, bare: it.bare || it.title, image: it.image || it.url };
    const text = buildXText(row, accounts, { credit: row.credit || '', photo: true });
    const thread = xThread(row, accounts, { credit: row.credit || '', photo: true });
    lines.push(`## ${row.title}`);
    lines.push('');
    lines.push(`Média : ${row.source || '—'}${row.author ? ` · ${row.author}` : ''}`);
    lines.push('');
    lines.push(`Lien : ${siteLink(row)}`);
    lines.push('');
    lines.push('Texte X actuel :');
    lines.push('');
    lines.push('```text');
    lines.push(text || '(vide)');
    lines.push('```');
    lines.push('');
    lines.push('Texte alternatif :');
    lines.push('');
    lines.push(`- X, Facebook, Instagram : ${articleAlt(row, 'x', { credit: row.credit || '' })}`);
    lines.push(`- LinkedIn (300) : ${articleAlt(row, 'linkedin', { credit: row.credit || '' })}`);
    lines.push('');
    if (thread) {
      lines.push('Fil X qui partira seulement si `potential.xThread` est vrai, et s’il reste une place de fil :');
      lines.push('');
      thread.forEach((t, i) => {
        lines.push(`### Post ${i + 1}`);
        lines.push('');
        lines.push('```text');
        lines.push(t.text);
        lines.push('```');
        lines.push('');
      });
    } else lines.push('Fil X : rien à ajouter, l’extrait tient déjà dans le post.');
    lines.push('');
  }
  const galItems = ready.slice(0, 4).map(it => ({ ...it, bare: it.bare || it.title, image: it.image || it.url }));
  for (const network of ['facebook', 'linkedin']) {
    const gal = galleryFrom(galItems, { network, limit: network === 'linkedin' ? 2000 : 1500, max: 4 });
    lines.push(`## Plusieurs images ${network === 'facebook' ? 'Facebook' : 'LinkedIn'} (drapeau éteint)`);
    lines.push('');
    if (!gal) { lines.push('Pas assez d’images réelles.'); lines.push(''); continue; }
    lines.push(`${gal.count} images. Envoi seulement si le drapeau est vrai.`);
    lines.push('');
    lines.push('```text');
    lines.push(gal.text);
    lines.push('```');
    lines.push('');
    for (const a of gal.assets) lines.push(`- ${a.url}`);
    lines.push('');
    lines.push('Textes alternatifs :');
    lines.push('');
    for (const a of gal.assets) lines.push(`- ${a.alt}`);
    lines.push('');
  }
  return lines.join('\n');
}

function fromNews(raw) {
  return (raw.items || []).filter(it => it && it.title && it.image && /^https:\/\//.test(it.image) && (it.leadExcerpt || it.excerpt)).slice(0, 4).map(it => ({
    title: it.title,
    bare: it.title,
    source: it.source,
    author: it.author || '',
    link: it.link,
    desc: it.leadExcerpt || it.excerpt,
    credit: String(it.sourceImageCreator || it.sourceImageCredit || '').replace(/^photo\s*:\s*/i, ''),
    image: it.image,
  }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8'));
  const md = renderPreview(fromNews(raw), { updated: raw.updated || '' });
  const out = arg('--out') || path.join(ROOT, 'docs/social-potential-apercu.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md);
  console.log(`Aperçu écrit : ${out}`);
}

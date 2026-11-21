#!/usr/bin/env node
// Aperçus seulement. N'envoie rien. La photo est celle de l'article.
import fs from 'node:fs';
import path from 'node:path';
import { renderPanorama } from './panorama.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'panorama-preview');
const file = path.join(root, 'assets/news-images/57a3b905ae46486e.jpg');
const news = JSON.parse(fs.readFileSync(path.join(root, 'news.json'), 'utf8'));
const item = (news.items || []).find(a => a.imageLocal === 'assets/news-images/57a3b905ae46486e.jpg');
fs.mkdirSync(out, { recursive: true });
const note = [
  item?.title || '',
  item?.source || '',
  item?.sourceImageCredit || item?.sourceImageCreator || '',
].filter(Boolean).join('\n');
fs.writeFileSync(path.join(out, 'source.txt'), note + '\n');
for (const network of ['instagram', 'x']) {
  const dir = path.join(out, network);
  const rendered = renderPanorama(file, dir, network);
  if (!rendered) throw new Error(`pas de panorama ${network}`);
  console.log(network, rendered.n, rendered.files.map(f => path.basename(f)).join(' '));
}

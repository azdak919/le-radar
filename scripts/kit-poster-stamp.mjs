/**
 * Empreinte du contenu des affiches du kit (/kit-media/).
 * Tout ce qui s’imprime sur une affiche (titre, slogans, URL, mentions, établissements,
 * formats, vœux) est extrait du studio (affiches/poster-builder.js), avec le catalogue
 * des exemples. Si l’empreinte change, les aperçus et PDF du kit sont périmés :
 *   npm run kit:generic-posters && npm run kit:example-posters
 * Les deux scripts d’export réécrivent assets/kit/affiches/stamp.json.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function posterContentFingerprint(root) {
  const src = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
  const parts = [];
  // Constantes de texte (TITLE, SLOGAN, NAME_FULL, INDEP_*, URL…) et blocs FORMATS / CAMPUSES / GREETINGS.
  for (const m of src.matchAll(/^const [A-Z][A-Z0-9_]* = (?:'[^\n]*'|"[^\n]*"|`[^\n]*`);$/gm)) parts.push(m[0]);
  for (const name of ['FORMATS', 'CAMPUSES', 'GREETINGS']) {
    const start = src.indexOf(`const ${name} = `);
    if (start < 0) continue;
    const ends = [src.indexOf('\n};', start), src.indexOf('\n];', start)].filter((i) => i > start);
    const end = ends.length ? Math.min(...ends) : src.indexOf('\n', start);
    parts.push(src.slice(start, end));
  }
  parts.push(readFileSync(join(root, 'assets/kit/affiches/examples.json'), 'utf8'));
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

export function writeStamp(root) {
  const stamp = { fingerprint: posterContentFingerprint(root), note: 'npm run kit:generic-posters && npm run kit:example-posters' };
  writeFileSync(join(root, 'assets/kit/affiches/stamp.json'), `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

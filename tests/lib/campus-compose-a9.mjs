/**
 * Gabarit campus a9e8f52 : extraire, normaliser et substituer function compose()
 * pour les tests de source et de rendu pixel.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'compose-campus-a9e8f52.js');

export function extractFn(source, name) {
  const needle = `\nfunction ${name}(`;
  let start = source.indexOf(needle);
  if (start >= 0) start += 1;
  else {
    start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`function ${name} introuvable`);
  }
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} non terminée`);
}

function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; ) {
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (src.startsWith('//', i) && (i === 0 || src[i - 1] !== ':')) {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

function stripInstrumentation(src) {
  const token = "if (typeof window !== 'undefined')";
  let s = src;
  for (;;) {
    const i = s.indexOf(token);
    if (i < 0) break;
    const brace = s.indexOf('{', i);
    let depth = 0;
    let k = brace;
    for (; k < s.length; k += 1) {
      if (s[k] === '{') depth += 1;
      else if (s[k] === '}') {
        depth -= 1;
        if (depth === 0) {
          k += 1;
          break;
        }
      }
    }
    s = s.slice(0, i) + s.slice(k);
  }
  return s;
}

/** Dessin de compose(), sans commentaires ni hooks de régression. */
export function normalizeCompose(src) {
  return stripInstrumentation(stripComments(src)).replace(/\s+/g, ' ').trim();
}

export function fixtureCompose() {
  return extractFn(readFileSync(FIXTURE, 'utf8'), 'compose');
}

/** poster-builder.js actuel où compose() est remplacée par la référence a9e8f52. */
export function swappedPosterBuilder(currentSrc) {
  const current = extractFn(currentSrc, 'compose');
  const start = currentSrc.indexOf(current);
  if (start < 0) throw new Error('compose() introuvable pour substitution');
  return currentSrc.slice(0, start) + fixtureCompose() + currentSrc.slice(start + current.length);
}

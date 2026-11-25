/**
 * Aucun fragment de balise orphelin après un lien fermé.
 *
 * Le 21 nov. 2026 (PR #503), le bouton café du mât a été mal retiré :
 * il restait `</a>nk" rel="noopener noreferrer"><svg …>` dans le gabarit
 * et dans toutes les pages générées, affichant du code brut sur le-radar.ca.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'android', 'mobile']);
// Texte d'attribut collé juste après une fermeture de lien : signe d'un lien tronqué.
const ORPHAN = /<\/a>[A-Za-z_-]*"\s+(?:rel|target|class|href|title|aria-[a-z]+)=/;

const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(html|js|mjs)$/.test(name) && !p.includes(`${join('tests', '')}`)) {
      const text = readFileSync(p, 'utf8');
      if (ORPHAN.test(text)) bad.push(relative(root, p));
    }
  }
}
walk(root);
assert.deepEqual(bad, [], `Fragment de lien orphelin dans : ${bad.join(', ')}`);
console.log('no-broken-anchor-fragments: OK');

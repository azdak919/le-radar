// Pied de page : « Installer LE-RADAR.ca » est un <button> ; aligné à gauche
// comme les liens voisins, même quand il passe sur deux lignes.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const css = readFileSync(new URL('../style-chrome.css', import.meta.url), 'utf8');
const rule = css.slice(css.indexOf('.site-foot__link-btn {'), css.indexOf('}', css.indexOf('.site-foot__link-btn {')));
assert.match(rule, /text-align:\s*start/, '.site-foot__link-btn aligné au début');
console.log('footer-install-align OK');

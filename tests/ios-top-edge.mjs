// Bande floue iOS / iPadOS 26+ sous la barre d'état (bug iPad, 2026-11-19).
// Le flou venait du système (scroll edge effect), pas de la page : on garde la
// barre d'état au système (pas de « black-translucent ») et on lui donne une
// couleur par un élément fixe qui ne peint rien. Aucun flou permis sur ce qui
// colle en haut : barre radio, sa coiffe, ce bandeau, la barre radio embarquée.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const html = read('index.html');
assert.doesNotMatch(
  html.replace(/<!--[\s\S]*?-->/g, ''),
  /apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
  'index.html : black-translucent rend la bande floue système impossible à retirer',
);
assert.match(html, /<body>\s*<div class="ios-top-edge" aria-hidden="true"><\/div>/, 'bandeau .ios-top-edge en tête de body');
assert.match(read('radar-state.js'), /className = 'ios-top-edge'/, 'radar-state.js injecte le bandeau sur les autres pages');

const chrome = stripComments(read('style-chrome.css'));
const block = chrome.match(/@supports \(-webkit-touch-callout: none\) \{\s*\.ios-top-edge \{([^}]*)\}/);
assert.ok(block, 'règle .ios-top-edge sous @supports (-webkit-touch-callout: none)');
const decl = block[1];
for (const re of [/position:\s*fixed/, /top:\s*0/, /left:\s*0/, /right:\s*0/, /pointer-events:\s*none/, /(?<!-webkit-)background-clip:\s*text/, /-webkit-background-clip:\s*text/, /background-color:/]) {
  assert.match(decl, re, `.ios-top-edge : ${re}`);
}
const h = Number(decl.match(/height:\s*(\d+)px/)?.[1]);
assert.ok(h > 10 && h <= 24, `.ios-top-edge : hauteur > 10 px (seuil WebKit) et courte (${h})`);
assert.doesNotMatch(decl, /(?:backdrop-filter|filter):(?!\s*none)/, '.ios-top-edge sans flou');

// Aucun flou ni filtre sur les éléments collés en haut, dans aucune feuille du site.
const sheets = ['style.css', 'style-chrome.css', 'style-tuner.css', 'style-masthead.css', 'style-masthead-chrome.css', 'radio-barre.css'];
const sticky = /(^|[\s,>])(\.tuner|\.tuner-safe-cap|\.ios-top-edge|#tuner|\.bar)(?![\w-])(?![^{]*\s[.#\w])/;
for (const file of sheets) {
  const css = stripComments(read(file));
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.some((s) => sticky.test(` ${s}`))) continue;
    assert.doesNotMatch(
      m[2],
      /(?:^|;|\s)(?:-webkit-)?backdrop-filter:(?!\s*none)|(?:^|;|\s)filter:\s*blur/,
      `${file} : flou interdit sur ${m[1].trim()}`,
    );
  }
}
console.log('ios-top-edge: ok');

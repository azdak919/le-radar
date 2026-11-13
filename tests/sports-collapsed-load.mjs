// Page sports : sections fermées au chargement + overlay du même principe que la langue.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const generator = read('scripts/seo-pages.js');
assert.match(
  generator,
  /id="sport-\$\{escapeHtml\(sport\)\}">\\n/,
  'générateur : les sections sports naissent fermées',
);
assert.ok(
  !generator.includes('id="sport-${escapeHtml(sport)}" open>'),
  'générateur : plus de <details open> sur une section sport',
);
assert.match(generator, /blockingScripts: \['sports-load\.js'\]/);
assert.match(generator, /extraStyles: \['style-translate-overlay\.css'\]/);
assert.match(generator, /name="sports-panel-total" content="\$\{teams\.length\}"/);

const load = read('sports-load.js');
assert.match(load, /SHOW_DELAY_MS: 350/);
assert.match(load, /SKIP_AFTER_MS: 9000/);
assert.match(load, /HOLD_AT_100_MS: 280/);
assert.match(load, /assets\/emoji\/trophy\.png/);
assert.match(load, /Préparation du tableau…/);
assert.match(load, /Chargement des matchs…/);
assert.match(load, /Mise en page…/);
assert.match(load, /Afficher le tableau/);
assert.match(load, /Preparing the board…/);
assert.match(load, /translate-progress--sports/);
assert.match(load, /getElementsByClassName\('sports-panel'\)/);
assert.ok(!/document\.write\s*\(/.test(load), 'sports-load : pas de document.write');

assert.match(read('seo-pages.css'), /\.translate-progress--sports \.translate-progress__logo/);
assert.match(read('sw.js'), /\.\/sports-load\.js/);
assert.match(read('sports/sw.js'), /\.\.\/sports-load\.js/);
assert.match(read('sports/sw.js'), /\.\.\/style-translate-overlay\.css/);

for (const rel of ['sports/index.html', 'en/sports/index.html']) {
  const html = read(rel);
  const up = rel.startsWith('en/') ? '../..' : '..';
  assert.ok(
    !/class="sports-sport-block"[^>]*\sopen[\s>]/.test(html),
    `${rel} : aucune section sport ouverte au chargement`,
  );
  assert.ok(
    (html.match(/class="sports-sport-block"/g) || []).length >= 1,
    `${rel} : sections repliables présentes`,
  );
  assert.match(html, new RegExp(`<meta name="sports-panel-total" content="(\\d+)" />`));
  const total = Number(html.match(/name="sports-panel-total" content="(\d+)"/)[1]);
  const panels = (html.match(/class="sports-panel[\s"]/g) || []).length;
  assert.equal(total, panels, `${rel} : le total annoncé égale les fiches`);
  assert.ok(html.includes(`href="${up}/style-translate-overlay.css"`), `${rel} : feuille de l’overlay`);
  assert.ok(html.includes(`src="${up}/sports-load.js"`), `${rel} : script de chargement`);
  assert.ok(!html.includes(`src="${up}/sports-load.js" defer`), `${rel} : le script part avant le corps`);
}

const board = read('sports-board.js');
assert.match(board, /periodKey !== 'all'/);
assert.match(board, /Boolean\(school\.raw\)/);
assert.match(board, /n’ouvre que les sections qui ont encore des fiches/);

const shell = read('nav-shell.js');
assert.match(shell, /display-mode: standalone/);
assert.match(shell, /function blankLeavesApp/);
assert.match(shell, /location\.assign\(url\.href\)/);
assert.match(shell, /Pomo \/ Solitaire/);

const appHtml = read('mobile/app/index.html');
const appJs = read('mobile/app/js/app.js');
assert.match(appHtml, /<a href="#\/sports" class="masthead-icon masthead-sports"/);
assert.ok(!/masthead-sports"[^>]*data-action="external"/.test(appHtml), 'APK : le trophée ne sort pas de l’app');
assert.match(appHtml, /<a href="#\/sports">Sports<\/a>/);
assert.match(appJs, /function openSportsInApp/);
assert.ok(!appJs.includes('Ouvrir la page Sports complète'), 'APK : plus de lien vers la page du site');

console.log('sports-collapsed-load : OK');

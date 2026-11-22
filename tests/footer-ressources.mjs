// Pied de page : section Ressources (Le Kiosque, Le Socle).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderSiteFooter } = require('../scripts/seo-pages-lib.js');

const fr = renderSiteFooter({ lang: 'fr', up: './' });
const en = renderSiteFooter({ lang: 'en', up: '../' });
const offline = renderSiteFooter({ lang: 'fr', up: './', variant: 'maintenance' });

assert.match(fr, /class="site-foot__ressources"/);
assert.equal([...fr.matchAll(/class="site-foot__ressources-title"/g)].length, 1);
assert.match(fr, />Ressources</);
assert.doesNotMatch(fr, /Resources/);
assert.match(fr, /href="https:\/\/kiosque\.le-radar\.ca\/"/);
assert.match(fr, /href="https:\/\/socle\.le-radar\.ca\/"/);
assert.match(fr, />Le Kiosque</);
assert.match(fr, />Le Socle</);
assert.match(fr, /Plateforme libre pour les journaux étudiants\./);
assert.match(fr, /Espace de rédaction des journaux étudiants\./);
assert.match(fr, /src="\.\/assets\/ressources\/kiosque\/icone-clair\.svg"/);
assert.match(fr, /src="\.\/assets\/ressources\/kiosque\/icone-sombre\.svg"/);
assert.match(fr, /src="\.\/assets\/ressources\/socle\/icone-clair\.svg"/);
assert.match(fr, /src="\.\/assets\/ressources\/socle\/icone-sombre\.svg"/);
assert.doesNotMatch(fr, /projet\s+frère|projets\s+frères/i);
assert.equal([...fr.matchAll(/class="site-foot__ressource-link"/g)].length, 2);

assert.match(en, />Resources</);
assert.doesNotMatch(en, />Ressources</);
assert.match(en, /src="\.\.\/assets\/ressources\/kiosque\/icone-clair\.svg"/);
assert.match(en, /Free platform for student newspapers\./);
assert.match(en, /Editorial workspace for student newspapers\./);
assert.doesNotMatch(en, /projet\s+frère|sister project/i);

assert.doesNotMatch(offline, /site-foot__ressources/);
assert.doesNotMatch(offline, /kiosque\.le-radar\.ca/);

const root = new URL('../', import.meta.url);
for (const rel of [
  'assets/ressources/kiosque/icone-clair.svg',
  'assets/ressources/kiosque/icone-sombre.svg',
  'assets/ressources/socle/icone-clair.svg',
  'assets/ressources/socle/icone-sombre.svg',
]) {
  assert.ok(fs.existsSync(new URL(rel, root)), rel);
}
const sources = fs.readFileSync(new URL('assets/ressources/SOURCES.txt', root), 'utf8');
assert.match(sources, /azdak919\/le-kiosque/);
assert.match(sources, /azdak919\/le-socle/);
assert.doesNotMatch(sources, /tison/i);

const chrome = fs.readFileSync(new URL('style-chrome.css', root), 'utf8');
assert.match(chrome, /\.site-foot__ressources\b/);
assert.match(chrome, /\[data-theme="dark"\] \.site-foot__ressource-logo-img--dark/);

const shell = fs.readFileSync(new URL('nav-shell.js', root), 'utf8');
assert.match(shell, /site-foot__ressources/);

const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
assert.match(sw, /assets\/ressources\/kiosque\/icone-clair\.svg/);
assert.match(sw, /assets\/ressources\/socle\/icone-sombre\.svg/);

assert.doesNotMatch(fr, /tison/i);
assert.doesNotMatch(en, /tison/i);
console.log('footer-ressources: OK');

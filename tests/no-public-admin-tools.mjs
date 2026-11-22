/**
 * Aucun outil d’administration sur le site public.
 *
 * Le 17 nov. 2026 (PR #443), une page « Mise à jour » du Socle (version en
 * place, bouton « Mettre à jour ») a été ajoutée à la racine du Radar et
 * liée dans tous les pieds de page. Elle était publique sur le-radar.ca.
 * Ce test échoue si un lien ou une page de ce genre revient : gabarit du
 * pied de page, pages HTML versionnées, dossier publié ou exclusion Jekyll.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lien local vers un outil de mise à jour ou d’administration (relatif ou
// absolu sur le domaine). Les URL d’articles externes ne sont pas visées.
const LOCAL_ADMIN_HREF = /href="(?:https?:\/\/(?:www\.)?le-radar\.ca)?(?:\.{1,2}\/|\/)*(?:admin\/)?mise-a-jour\/?(?:[?#"])/;
const UPDATE_BUTTON = />\s*Mettre à jour\s*</;

// 1. Pas de dossier publié.
for (const dir of ['mise-a-jour', 'admin/mise-a-jour']) {
  assert.equal(existsSync(join(root, dir)), false, `dossier public interdit : ${dir}/`);
}

// 2. Jekyll l’exclut même s’il revenait.
const config = readFileSync(join(root, '_config.yml'), 'utf8');
assert.match(config, /^\s*-\s*mise-a-jour\/\s*$/m, '_config.yml doit exclure mise-a-jour/');

// 3. Le gabarit du pied de page ne le produit pas.
const { renderSiteFooter } = require('../scripts/seo-pages-lib.js');
for (const lang of ['fr', 'en']) {
  for (const up of ['./', '../', '../../']) {
    const html = renderSiteFooter({ lang, up, home: up === './', altPath: lang === 'fr' ? 'en/' : '', updated: '', indent: '' });
    assert.doesNotMatch(html, /mise-a-jour/, `pied de page ${lang} ${up}`);
    assert.doesNotMatch(html, />\s*(?:Mise à jour|Update)\s*</, `libellé dans le pied de page ${lang} ${up}`);
  }
}

// 4. Aucune page HTML versionnée n’y renvoie.
const SKIP = new Set(['.git', 'node_modules', 'android', 'ios', 'tests', 'docs', 'vendor', '_site']);
const offenders = [];
let scanned = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.html')) continue;
    scanned += 1;
    const s = readFileSync(p, 'utf8');
    if (LOCAL_ADMIN_HREF.test(s) || (UPDATE_BUTTON.test(s) && /Version en place/.test(s))) offenders.push(relative(root, p));
  }
})(root);
assert.ok(scanned > 50, `trop peu de pages lues (${scanned})`);
assert.deepEqual(offenders, [], `outil d’administration lié publiquement : ${offenders.join(', ')}`);

console.log(`OK no-public-admin-tools (${scanned} pages)`);

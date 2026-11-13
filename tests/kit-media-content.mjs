// /kit-media/ (refonte t991u) : contenu cohérent avec le studio et les règles de Charles.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'kit-media/index.html'), 'utf8');
const builder = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

// Sections attendues, sommaire qui pointe vers elles.
for (const id of ['une', 'affiches', 'identite', 'logos', 'bannieres', 'regles']) {
  assert.ok(html.includes(`id="${id}"`), `section #${id} manquante`);
  assert.ok(html.includes(`href="#${id}"`), `sommaire : lien #${id} manquant`);
}
// La une : formats et un lien par établissement du studio (mêmes slugs que le générateur).
const slugs = [...builder.matchAll(/slug: '([a-z]+)'/g)].map((m) => m[1]).filter((s) => s !== 'generique');
const uneSlugs = [...html.matchAll(/href="\.\.\/affiches\/\?modele=une&amp;uni=([a-z]+)"/g)].map((m) => m[1]);
assert.deepEqual([...new Set(uneSlugs)].sort(), [...new Set(slugs)].sort(), 'la une : un lien par établissement du studio');
for (const fmt of ['letter', 'tabloid', 'ecran-paysage', 'ecran-portrait']) {
  assert.ok(html.includes(`?modele=une&amp;format=${fmt}"`), `la une : lien de format ${fmt}`);
  assert.ok(builder.includes(`'${fmt}'`) || builder.includes(`${fmt}:`), `format ${fmt} inconnu du studio`);
}
// Règles : nom complet, pas de logo d’université, sport étudiant, bilingue limité, indépendance.
assert.ok(text.includes('Le Réseau Académique de Découverte et d’Agrégation de Ressources'), 'nom complet du Radar');
assert.match(text, /Aucun logo d’université/);
assert.match(text, /Sport étudiant seulement/);
assert.match(text, /aucun sport professionnel/);
assert.match(text, /Concordia, McGill et Bishop’s/);
assert.match(text, /indépendant/);
// Mot-symbole : fichiers officiels (SVG en LR Serif avec l’icône), aucune image d’université.
for (const f of ['wordmark-on-dark.svg', 'wordmark-on-light.svg']) {
  const svg = readFileSync(join(root, 'assets/kit', f), 'utf8');
  assert.ok(svg.includes("font-family:'LR Serif'") || svg.includes('LR Serif'), `${f} : mot-symbole en LR Serif`);
}
const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
for (const src of imgs) {
  assert.ok(/^\.\.\/assets\/(icon|kit|emoji)/.test(src), `image hors kit (logo d’université ?) : ${src}`);
  assert.ok(existsSync(join(root, src.replace(/^\.\.\//, '').replace(/\?.*$/, ''))), `image manquante : ${src}`);
}
// Téléchargements : fichiers présents.
for (const m of html.matchAll(/href="\.\.\/(assets\/[^"#?]+)"[^>]*download/g)) {
  assert.ok(existsSync(join(root, m[1])), `téléchargement manquant : ${m[1]}`);
}
// Français propre : pas de « week-end », plus de rangée de langues, plus d’anglicismes repérés.
assert.ok(!/week-?end/i.test(text), '« fin de semaine », jamais « week-end »');
assert.ok(!/\b(?:novembre|décembre|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre)\s+20\d\d/i.test(html),
  'pas de date figée dans le HTML du kit : la légende de la une suit le contenu généré (gallery-meta.json)');
const charte = html.includes('class="kit-charte"') || html.includes("class='kit-charte'");
assert.ok(charte, 'charte repliée (details.kit-charte) manquante');
assert.ok(!html.includes('<details class="kit-charte" open') && !html.includes('<details open class="kit-charte"'),
  'la charte doit être repliée par défaut');

assert.ok(!/·\s*langues/.test(text), 'mention de la rangée de langues retirée');
const examples = JSON.parse(readFileSync(join(root, 'assets/kit/affiches/examples.json'), 'utf8')).examples;
assert.ok(examples.every((e) => !('langs' in e) && !/langues|languages/.test(e.metaFr + e.metaEn)), 'exemples sans rangée de langues');
console.log('kit-media-content OK');

// Affiches du kit (/kit-media/) : rien ne manque, rien n’est périmé.
// - chaque exemple de examples.json a son aperçu net (660 × 1020) et un campus connu du studio ;
// - les PDF génériques liés existent, sont des PDF et pèsent assez lourd pour être à 600 dpi ;
// - la liste « Choisir un campus » couvre tous les établissements du studio ;
// - l’empreinte du contenu imprimé (stamp.json) correspond au studio actuel ;
// - un établissement sans affiche d’exemple est signalé (avertissement).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { posterContentFingerprint } from '../scripts/kit-poster-stamp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets/kit/affiches');
const html = readFileSync(join(root, 'kit-media/index.html'), 'utf8');
const builder = readFileSync(join(root, 'affiches/poster-builder.js'), 'utf8');
const { examples } = JSON.parse(readFileSync(join(dir, 'examples.json'), 'utf8'));

function jpegSize(file) {
  const b = readFileSync(file);
  assert.equal(b.readUInt16BE(0), 0xffd8, `${file} n’est pas un JPEG`);
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error(`taille JPEG introuvable : ${file}`);
}

const slugs = [...builder.matchAll(/slug: '([a-z]+)'/g)].map((m) => m[1]);
assert.ok(slugs.length > 5, 'établissements du studio introuvables');
const campuses = slugs.filter((s) => s !== 'generique');

// Aperçus : entiers (rapport 11 × 17), assez nets pour un écran 2×.
const previews = [['generique', join(dir, 'affiche-generique-preview.jpg')],
  ...examples.map((ex) => [ex.id, join(dir, `affiche-ex-${ex.id}-preview.jpg`)])];
const ids = new Set();
for (const ex of examples) {
  assert.ok(!ids.has(ex.id), `exemple en double : ${ex.id}`);
  ids.add(ex.id);
  assert.ok(slugs.includes(ex.campus), `exemple ${ex.id} : campus inconnu du studio (${ex.campus})`);
  for (const k of ['labelFr', 'labelEn', 'metaFr', 'metaEn']) assert.ok(ex[k], `exemple ${ex.id} : ${k} manquant`);
}
for (const [id, file] of previews) {
  assert.ok(existsSync(file), `aperçu manquant pour ${id} : ${file}`);
  const { w, h } = jpegSize(file);
  assert.ok(w >= 660, `aperçu ${id} trop petit (${w} px de large, 660 attendus) : relancer npm run kit:example-posters`);
  assert.ok(Math.abs(w / h - 11 / 17) < 0.01, `aperçu ${id} pas au format 11 × 17 (${w} × ${h})`);
}

// PDF et fichiers liés depuis la page.
const links = [...html.matchAll(/(?:href|src)="\.\.\/(assets\/kit\/affiches\/[^"]+)"/g)].map((m) => m[1]);
assert.ok(links.some((l) => l.endsWith('.pdf')), 'aucun PDF lié sur la page du kit');
for (const rel of new Set(links)) {
  const file = join(root, rel);
  assert.ok(existsSync(file), `lien mort (404) sur /kit-media/ : ${rel}`);
  if (rel.endsWith('.pdf')) {
    assert.equal(readFileSync(file).subarray(0, 5).toString(), '%PDF-', `${rel} n’est pas un PDF`);
    assert.ok(statSync(file).size > 300_000, `${rel} trop léger pour du 600 dpi`);
  }
}
for (const fmt of ['11x17', 'lettre', 'legal']) {
  assert.ok(links.includes(`assets/kit/affiches/affiche-generique-${fmt}-600dpi.pdf`), `PDF générique ${fmt} non lié`);
}

// Liste des campus : tout établissement du studio doit y figurer.
const navSlugs = [...html.matchAll(/href="\.\.\/affiches\/\?campus=([a-z]+)"/g)].map((m) => m[1]);
const missingNav = campuses.filter((s) => !navSlugs.includes(s));
assert.deepEqual(missingNav, [], `établissements absents de « Choisir un campus » : ${missingNav.join(', ')}`);
const unknownNav = navSlugs.filter((s) => !slugs.includes(s));
assert.deepEqual(unknownNav, [], `liens de campus inconnus du studio : ${unknownNav.join(', ')}`);

// Contenu imprimé : l’empreinte doit correspondre aux aperçus et PDF publiés.
const stamp = JSON.parse(readFileSync(join(dir, 'stamp.json'), 'utf8'));
assert.equal(stamp.fingerprint, posterContentFingerprint(root),
  'affiches du kit périmées : le texte, les établissements ou les exemples ont changé. Relancer npm run kit:generic-posters && npm run kit:example-posters');

// Ni nom privé ni domaine personnel sur les affiches.
assert.ok(!/tison/i.test(builder + html + JSON.stringify(examples)), 'mention privée interdite dans les affiches');

const withoutExample = campuses.filter((s) => !examples.some((ex) => ex.campus === s));
if (withoutExample.length) {
  console.warn(`kit-posters: ${withoutExample.length} établissements sans affiche d’exemple (composables dans le studio) : ${withoutExample.join(', ')}`);
}
console.log(`kit-posters: OK (${examples.length} exemples, ${campuses.length} établissements, PDF génériques présents)`);

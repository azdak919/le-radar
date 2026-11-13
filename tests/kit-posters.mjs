// Affiches du kit (/kit-media/) : rien ne manque, rien n’est périmé.
// Galerie mixte : affiches campus (gabarit a9e8f52) et La une dans plusieurs
// formats. Chaque aperçu a le même rapport que le fichier téléchargeable.
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

const PREVIEW = {
  tabloid: [660, 1020],
  letter: [660, 854],
  legal: [660, 1087],
  'ecran-paysage': [960, 540],
  'ecran-portrait': [540, 960],
};

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

function isScreen(ex) {
  return ex.format === 'ecran-paysage' || ex.format === 'ecran-portrait';
}

const slugs = [...builder.matchAll(/slug: '([a-z]+)'/g)].map((m) => m[1]);
assert.ok(slugs.length > 5, 'établissements du studio introuvables');
const campuses = slugs.filter((s) => s !== 'generique');

const kinds = { campus: 0, une: 0 };
const formats = new Set();
const ids = new Set();
for (const ex of examples) {
  assert.ok(!ids.has(ex.id), `exemple en double : ${ex.id}`);
  ids.add(ex.id);
  const inst = ex.campus || ex.uni;
  assert.ok(slugs.includes(inst), `exemple ${ex.id} : établissement inconnu du studio (${inst})`);
  for (const k of ['labelFr', 'labelEn', 'metaFr', 'metaEn']) assert.ok(ex[k], `exemple ${ex.id} : ${k} manquant`);
  const kind = ex.kind || 'campus';
  assert.ok(kind === 'campus' || kind === 'une', `exemple ${ex.id} : kind invalide (${kind})`);
  kinds[kind] += 1;
  const fmt = ex.format || 'tabloid';
  assert.ok(PREVIEW[fmt], `exemple ${ex.id} : format inconnu (${fmt})`);
  formats.add(fmt);
  if (kind === 'campus') assert.ok(ex.campus, `exemple ${ex.id} : campus manquant`);
  if (kind === 'une') assert.ok(ex.uni, `exemple ${ex.id} : uni manquant`);
}
assert.ok(kinds.campus >= 3, `trop peu d’affiches campus (${kinds.campus})`);
assert.ok(kinds.une >= 5, `trop peu d’exemples de une (${kinds.une})`);
assert.ok(formats.has('letter') && formats.has('legal') && formats.has('tabloid'), 'formats Lettre, Légal et Tabloïd manquants');
assert.ok(formats.has('ecran-paysage') && formats.has('ecran-portrait'), 'formats écran 16:9 et 9:16 manquants');

const previews = [['generique', join(dir, 'affiche-generique-preview.jpg'), 'tabloid'],
  ...examples.map((ex) => [ex.id, join(dir, `affiche-ex-${ex.id}-preview.jpg`), ex.format || 'tabloid'])];
for (const [id, file, fmt] of previews) {
  assert.ok(existsSync(file), `aperçu manquant pour ${id} : ${file}`);
  const { w, h } = jpegSize(file);
  const [ew, eh] = PREVIEW[fmt];
  assert.equal(w, ew, `aperçu ${id} largeur ${w}, ${ew} attendus pour ${fmt}`);
  assert.equal(h, eh, `aperçu ${id} hauteur ${h}, ${eh} attendus pour ${fmt}`);
}

for (const ex of examples) {
  const file = isScreen(ex)
    ? join(dir, `affiche-ex-${ex.id}.png`)
    : join(dir, `affiche-ex-${ex.id}-600dpi.pdf`);
  assert.ok(existsSync(file), `fichier téléchargeable manquant pour ${ex.id} : ${file}`);
  if (!isScreen(ex)) {
    assert.equal(readFileSync(file).subarray(0, 5).toString(), '%PDF-', `${file} n’est pas un PDF`);
    assert.ok(statSync(file).size > 300_000, `${ex.id} trop léger pour du 600 dpi`);
  } else {
    assert.equal(readFileSync(file).subarray(0, 8).toString('latin1'), '\x89PNG\r\n\x1a\n', `${file} n’est pas un PNG`);
    assert.ok(statSync(file).size > 20_000, `${ex.id} PNG trop léger`);
  }
}

const links = [...html.matchAll(/(?:href|src)="\.\.\/(assets\/kit\/affiches\/[^"]+)"/g)].map((m) => m[1].replace(/[?#].*$/, ''));
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

const navSlugs = [...html.matchAll(/href="\.\.\/affiches\/\?campus=([a-z]+)"/g)].map((m) => m[1]);
const missingNav = campuses.filter((s) => !navSlugs.includes(s));
assert.deepEqual(missingNav, [], `établissements absents de la liste studio : ${missingNav.join(', ')}`);
const unknownNav = navSlugs.filter((s) => !slugs.includes(s));
assert.deepEqual(unknownNav, [], `liens de campus inconnus du studio : ${unknownNav.join(', ')}`);

const stamp = JSON.parse(readFileSync(join(dir, 'stamp.json'), 'utf8'));
assert.equal(stamp.fingerprint, posterContentFingerprint(root),
  'affiches du kit périmées : le texte, les établissements ou les exemples ont changé. Relancer npm run kit:generic-posters && npm run kit:example-posters');

assert.ok(!/tison/i.test(builder + html + JSON.stringify(examples)), 'mention privée interdite dans les affiches');

const withoutCampusEx = campuses.filter((s) => !examples.some((ex) => (ex.kind || 'campus') === 'campus' && ex.campus === s));
if (withoutCampusEx.length) {
  console.warn(`kit-posters: ${withoutCampusEx.length} établissements sans affiche campus d’exemple (composables dans le studio) : ${withoutCampusEx.join(', ')}`);
}
console.log(`kit-posters: OK (${kinds.campus} campus, ${kinds.une} unes, formats ${[...formats].join(', ')}, ${campuses.length} établissements, PDF génériques présents)`);

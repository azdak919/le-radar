import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'radar-news.js'), 'utf8');
const start = src.indexOf('function stripInstitutionTypePrefix');
const end = src.indexOf('function sourceInfo');
assert.ok(start >= 0 && end > start, 'bloc shortInstitution introuvable dans radar-news.js');
const ctx = {
  resolveInstitutionAcronym(name = '') {
    const table = {
      'Université de Montréal': 'UdeM',
      UQAM: 'UQAM',
      'McGill University': 'McGill',
    };
    return table[name] || '';
  },
  formatInstitutionDisplay(s = '') { return s; },
  isQuebecUniversity(name = '') {
    return /université|university|^mcgill|^concordia$/i.test(name) || name === 'UQAM';
  },
};
vm.createContext(ctx);
vm.runInContext(`${src.slice(start, end)}; this.shortInstitution = shortInstitution;`, ctx);
const short = ctx.shortInstitution;

assert.equal(short("Cégep de l'Outaouais", 'cegep'), "Cégep de l'Outaouais");
assert.notEqual(short("Cégep de l'Outaouais", 'cegep'), "l'Outaouais");
assert.equal(short("Cégep de l'Abitibi-Témiscamingue", 'cegep'), "Cégep de l'Abitibi-Témiscamingue");
assert.equal(short('Cégep de la Gaspésie et des Îles', 'cegep'), 'Cégep de la Gaspésie et des Îles');
assert.equal(
  short('Cégep de la Gaspésie et des Îles — campus Carleton-sur-Mer', 'cegep'),
  'Cégep de la Gaspésie et des Îles',
);
assert.equal(short('Cégep de La Pocatière', 'cegep'), 'La Pocatière');
assert.equal(short('Cégep de Jonquière', 'cegep'), 'Jonquière');
assert.equal(short('Cégep du Vieux Montréal', 'cegep'), 'Cégep Vieux-Montréal');
assert.equal(short('Université de Montréal'), 'UdeM');

const article = /^(l'|l’|le |la |les |du |des |d')/;
for (const name of [
  "Cégep de l'Outaouais",
  "Cégep de l'Abitibi-Témiscamingue",
  'Cégep de la Gaspésie et des Îles',
  'Cégep de la Gaspésie et des Îles — campus Îles-de-la-Madeleine',
  'Cégep de La Pocatière',
  'Cégep de Jonquière',
  'Cégep du Vieux Montréal',
  'Cégep de Lanaudière à L\'Assomption',
]) {
  const label = short(name, 'cegep');
  assert.ok(!article.test(label), `sigle interdit (article) : ${name} → ${label}`);
}

console.log('OK short-institution');

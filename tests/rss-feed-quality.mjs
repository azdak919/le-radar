// Qualité du flux RSS : validité XML, doublons d'items et de phrases, troncatures, typographie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const g = require('../scripts/generate-feed.js');

// Unités
assert.equal(g.stripInvalidXml('énormi\u0002té'), 'énormité');
assert.equal(g.fixPunctuation('cliquer ici . Puis ( RCLALQ ) , oui', 'fr'), 'cliquer ici. Puis (RCLALQ), oui');
assert.equal(g.fixPunctuation('Vraiment ?', 'fr'), 'Vraiment\u202F?');
assert.equal(g.fixPunctuation('Really ?', 'en'), 'Really ?');
assert.equal(g.cleanBrief('Une phrase complète. Puis une autre coupée au mil', 900), 'Une phrase complète.');
assert.ok(!/\s\S{1,2}…$/.test(g.cleanBrief('mot '.repeat(300), 100)));
assert.equal(g.dedupeSentences('Titre. Une phrase répétée ici. Une phrase répétée ici.', 'Titre'), 'Une phrase répétée ici.');

// Flux publié
const xml = readFileSync(new URL('../feed.xml', import.meta.url), 'utf8');
assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml), 'caractère interdit en XML');
for (const tag of ['<language>fr-CA</language>', 'rel="self"', '<ttl>', '<image>']) assert.ok(xml.includes(tag), `canal : ${tag}`);
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
assert.ok(items.length > 0 && items.length <= 50, 'nombre d’items');
const pick = (s, t) => (s.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1] || '';
const seen = { guid: new Set(), link: new Set(), title: new Set() };
for (const it of items) {
  const guid = pick(it, 'guid'); const link = pick(it, 'link'); const title = pick(it, 'title');
  for (const [k, v] of [['guid', guid], ['link', link], ['title', `${pick(it, 'source')}|${title.toLowerCase()}`]]) {
    assert.ok(!seen[k].has(v), `doublon ${k} : ${v}`); seen[k].add(v);
  }
  assert.match(pick(it, 'pubDate'), /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
  assert.ok(!/&amp;(amp|lt|gt|quot|#\d+);/.test(it), `entité doublée : ${title}`);
  const body = pick(it, 'description').split('\n\n').slice(1).join(' ').trim();
  if (body) {
    assert.match(body, /[.!?…»"”)]$/u, `brève tronquée : ${title} → ${body.slice(-30)}`);
    assert.ok(!/\s[.,](?!\d)/.test(body), `espace avant ponctuation : ${title}`);
    const sents = body.split(/(?<=[.!?…])\s+/u).filter((x) => x.length > 20);
    assert.equal(new Set(sents).size, sents.length, `phrase répétée : ${title}`);
  }
  for (const u of it.matchAll(/(?:src|url|href)="([^"]+)"/g)) assert.match(u[1], /^https?:\/\//, `URL relative : ${u[1]}`);
}
console.log(`rss-feed-quality: ${items.length} items OK`);

// Format des titres : « Média – Auteur : Titre »
assert.equal(g.itemDisplayTitle({ source: 'Le Délit', author: 'Héloïse Durning', title: 'Le 17 octobre' }), 'Le Délit – Héloïse Durning\u00A0: Le 17 octobre');
assert.equal(g.itemDisplayTitle({ source: 'Le Délit', author: 'Le Délit', title: 'Le Délit : Édito' }), 'Le Délit\u00A0: Édito');
assert.equal(g.itemDisplayTitle({ source: 'The Link', title: 'News', lang: 'en' }), 'The Link: News');
for (const it of items) {
  const title = pick(it, 'title').replace(/&amp;/g, '&');
  const src = pick(it, 'source').replace(/&amp;/g, '&');
  if (!src) continue;
  assert.ok(title.startsWith(src), `titre sans média en tête : ${title}`);
  assert.ok(!title.slice(src.length).toLowerCase().includes(`: ${src.toLowerCase()}`), `média en double : ${title}`);
  assert.ok(!/ – (\u00A0)?:|– –|:\s*$/.test(title), `séparateur vide : ${title}`);
  assert.match(title, /^[^:]+?( – [^:]+)?(\u00A0: |: )\S/u, `format : ${title}`);
}

// Pas de répétition média/auteur entre le titre et la ligne de méta de la description.
for (const it of items) {
  const src = pick(it, 'source').replace(/&amp;/g, '&');
  const meta = pick(it, 'description').split('\n\n')[0];
  if (src) assert.ok(!meta.includes(src), `média répété dans la description : ${meta}`);
}

#!/usr/bin/env node
// Régression « CDATA visible » (9 nov. 2026) : The McGill Daily publiait « <![CDATA[McGill University… »
// parce que le collecteur coupait content:encoded à 8 000 car. AVANT le ]]> de fermeture, puis ne déballait
// que les CDATA fermés. On vérifie : le collecteur, la bibliothèque, les fils, le HTML et les données publiées.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { stripCdata, hasCdata, scrubDeep } = require('../scripts/cdata-lib.js');
const { decodeHtmlEntities, decodeEntities, stripHtml } = require('../scripts/html-entities-lib.js');
const card = require('../scripts/article-card-lib.js');
const worker = require('../scripts/fetch-source-worker.js');

// 1. Bibliothèque : tous les cas.
const CASES = [
  ['<![CDATA[Warning: spoilers ahead!', 'Warning: spoilers ahead!'],            // tronqué, sans ]]>
  ['a <![CDATA[x]]> b', 'a x b'],                                                // normal
  ['&lt;![CDATA[x]]&gt;', 'x'],                                                  // échappé en entités
  ['&amp;lt;![CDATA[x]]&amp;gt;', 'x'],                                          // double échappement
  ['&#60;![CDATA[x]]&#62;', 'x'],                                                // entités numériques
  ['<![CDATA[A<![CDATA[B]]>', 'AB'],                                             // imbriqué
  ['<![cdata[x]]>', 'x'],                                                        // casse
  ['x ]]> y', 'x  y'],                                                           // ]]> orphelin
  ['<![CDATA[x]', 'x'],                                                          // fermeture elle-même tronquée
  ['avant <![CDA', 'avant '],                                                    // ouvrant coupé en deux
  ['Le mot CDATA seul reste', 'Le mot CDATA seul reste'],                         // texte normal intact
];
for (const [input, want] of CASES) {
  assert.equal(stripCdata(input), want, `stripCdata(${JSON.stringify(input)})`);
  assert.equal(hasCdata(stripCdata(input)), false, `marqueur résiduel : ${JSON.stringify(input)}`);
  assert.equal(hasCdata(decodeHtmlEntities(input)), false, `decodeHtmlEntities laisse un marqueur : ${JSON.stringify(input)}`);
  assert.equal(hasCdata(decodeEntities(input)), false);
  assert.equal(hasCdata(stripHtml(input)), false);
  assert.equal(hasCdata(card.decodeHtmlEntities(input)), false, `article-card-lib laisse un marqueur : ${JSON.stringify(input)}`);
  assert.equal(hasCdata(card.stripCdata(input)), false);
}
const deep = scrubDeep({ a: ['<![CDATA[x', { b: 'ok' }], c: 3 });
assert.deepEqual(deep.value, { a: ['x', { b: 'ok' }], c: 3 });
assert.equal(deep.changed, 1);

// 2. Collecteur : content:encoded > 8 000 car., sans <p>, CDATA fermé APRÈS la coupe (cas McGill Daily).
const longBody = 'McGill University encourages its students to think critically, question authority, and engage with the political issues that shape the world around them. '.repeat(120);
assert.ok(longBody.length > 9000);
const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>The McGill Daily</title>
<item><title>When Neutrality Becomes Silence</title><link>https://www.mcgilldaily.com/2026/11/x/</link>
<dc:creator><![CDATA[Lisa Banti]]></dc:creator><pubDate>Mon, 09 Nov 2026 18:05:01 +0000</pubDate>
<description><![CDATA[<p>Teaser</p>
<p>The post <a href="https://www.mcgilldaily.com/">X</a> appeared first on <a href="https://www.mcgilldaily.com">The McGill Daily</a>.</p>
]]></description>
<content:encoded><![CDATA[${longBody}]]></content:encoded></item></channel></rss>`;
const items = worker.parseFeed(xml, 'en');
assert.equal(items.length, 1);
for (const k of ['title', 'excerpt', 'author', 'link']) {
  assert.equal(hasCdata(items[0][k]), false, `parseFeed : ${k} contient un marqueur CDATA → ${items[0][k]}`);
}
assert.match(items[0].excerpt, /^McGill University encourages/);
assert.equal(items[0].author, 'Lisa Banti');
// Même chose pour du texte brut sans <p>, et pour du CDATA échappé en entités dans la description.
const xml2 = xml.replace(/<description>[\s\S]*?<\/description>/, '<description>&lt;![CDATA[Un résumé échappé en entités qui dépasse largement quarante caractères.]]&gt;</description>').replace(/<content:encoded>[\s\S]*?<\/content:encoded>/, '');
const it2 = worker.parseFeed(xml2, 'en')[0];
assert.equal(hasCdata(it2.excerpt), false);
assert.match(it2.excerpt, /^Un résumé échappé/);

// 2b. Publications sociales : le texte et l'extrait ne portent jamais de marqueur, même si le fil en contient un.
{
  const social = await import('../scripts/social/lib.mjs');
  const dirty = '<rss><channel><item><title>Le titre - McGill</title><link>https://www.mcgilldaily.com/a/</link><guid>g1</guid><dc:creator>Lisa Banti</dc:creator><pubDate>Mon, 09 Nov 2026 18:05:01 +0000</pubDate><description><![CDATA[<img src="https://x.test/y.jpg" />\n\n<![CDATA[McGill University encourages its students to think critically, question authority.]]></description></item><item><title>Autre</title><link>https://www.mcgilldaily.com/b/</link><guid>g2</guid><pubDate>Mon, 09 Nov 2026 18:05:01 +0000</pubDate><description>&lt;![CDATA[Un résumé échappé qui dépasse quarante caractères sans fermeture</description></item></channel></rss>';
  for (const it of social.parseFeed(dirty)) {
    assert.equal(social.hasCdata(it.desc), false, `parseFeed.desc : ${it.desc}`);
    assert.equal(social.hasCdata(social.buildText(it, [], 500)), false);
    assert.equal(social.hasCdata(social.excerpt(it)), false);
  }
  assert.match(social.parseFeed(dirty).find(i => i.link.endsWith('/a/')).desc, /^McGill University encourages/);
}

// 3. Fils : le générateur ne laisse jamais un marqueur CDATA imbriqué ou orphelin.
{
  const feed = fs.readFileSync(path.join(root, 'feed.xml'), 'utf8');
  const unwrapped = feed.replace(/<!\[CDATA\[((?:(?!\]\]>)[\s\S])*)\]\]>/g, '$1');
  assert.equal(hasCdata(unwrapped), false, 'feed.xml : CDATA imbriqué, tronqué ou orphelin');
}

// 4. Données publiées : aucun marqueur dans le JSON ni dans le HTML des pages.
const files = ['news.json', 'data/article-pages.json', 'social-feed.json', 'index.html', 'journaux', 'en/newspapers', 'feeds.html'];
const bad = [];
const scan = (rel) => {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p)) scan(path.join(rel, f)); return; }
  if (!/\.(json|html|xml|js)$/.test(p)) return;
  if (rel.endsWith('feed.xml')) return;
  const text = fs.readFileSync(p, 'utf8');
  if (hasCdata(rel.endsWith('.html') ? text.replace(/<script[\s\S]*?<\/script>/gi, '') : text)) bad.push(rel);
};
files.forEach(scan);
fs.readdirSync(path.join(root, 'data/archives')).forEach((f) => scan(path.join('data/archives', f)));
assert.deepEqual(bad, [], `marqueur CDATA dans des données publiées : ${bad.join(', ')}`);

console.log('OK cdata-regression');

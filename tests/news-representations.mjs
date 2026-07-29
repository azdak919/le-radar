#!/usr/bin/env node

/*
 * Le fil existe sous quatre formes produites par trois scripts distincts :
 * news.json, le RSS, le prérendu HTML et l'ItemList JSON-LD. Les bots les
 * régénèrent à des moments différents; cette vérification empêche qu'ils
 * affichent des têtes de fil différentes sans alerte.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeHtmlEntities } = require('../scripts/html-entities-lib.js');

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const normalize = (value = '') => decodeHtmlEntities(String(value))
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const TOP_ITEMS = 10;

const news = JSON.parse(read('news.json'));
const canonical = (news.items || [])
  .filter((item) => item?.title && item?.link)
  .slice()
  .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  .slice(0, TOP_ITEMS)
  .map((item) => normalize(item.title));
assert.equal(canonical.length, TOP_ITEMS, 'news.json doit contenir au moins dix manchettes valides');

const index = read('index.html');
const jsonLdBlock = index.match(/<!-- RADAR:SEO:JSONLD:START -->\s*<script[^>]*>([\s\S]*?)<\/script>\s*<!-- RADAR:SEO:JSONLD:END -->/);
assert(jsonLdBlock, 'index.html : bloc JSON-LD du fil introuvable');
const jsonLdTitles = JSON.parse(jsonLdBlock[1]).itemListElement
  .slice(0, TOP_ITEMS)
  .map((entry) => normalize(entry.item?.headline));

const htmlBlock = index.match(/<!-- RADAR:SEO:FEED:START -->([\s\S]*?)<!-- RADAR:SEO:FEED:END -->/);
assert(htmlBlock, 'index.html : bloc de fil prérendu introuvable');
const htmlTitles = [...htmlBlock[1].matchAll(/<h3 class="article-title">([\s\S]*?)<\/h3>/g)]
  .slice(0, TOP_ITEMS)
  .map((match) => normalize(match[1]));

const rss = read('feed.xml');
const rssTitles = [...rss.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)]
  .slice(0, TOP_ITEMS)
  .map((match) => normalize(match[1]));

for (const [name, titles] of [
  ['index.html JSON-LD', jsonLdTitles],
  ['index.html prérendu', htmlTitles],
  ['feed.xml', rssTitles],
]) {
  assert.deepEqual(titles, canonical, `${name} : les ${TOP_ITEMS} premières manchettes divergent de news.json`);
}

console.log(`✓ Les ${TOP_ITEMS} premières manchettes concordent (JSON, RSS, HTML, JSON-LD).`);

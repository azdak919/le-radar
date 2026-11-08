#!/usr/bin/env node
'use strict';
/**
 * Fiches d'article statiques : https://le-radar.ca/article/<id>/ (id = articleId de l'appli).
 *
 * Pourquoi statique : les robots de X, Facebook, LinkedIn, Bluesky et Tumblr n'exécutent pas
 * de JavaScript ; la carte de lien (photo, titre, crédit) doit être dans le HTML servi.
 *
 *   --update        fusionne news.json dans data/article-pages.json (jamais de retrait :
 *                   un lien partagé sur les réseaux ne meurt pas quand l'article sort du fil).
 *   --render <dir>  écrit <dir>/article/<id>/index.html pour toutes les fiches connues
 *                   (registre + news.json courant), habillage complet du site (gabarit
 *                   horaires/index.html : masthead, barre radio, pied de page, thèmes).
 *
 * Crédit photo : photoCreditLine() de generate-feed.js, la même source que la figcaption du
 * flux RSS lue par les bots sociaux (feedCredit) — une seule vérité.
 */
const fs = require('fs');
const path = require('path');
const { photoCreditLine, isLogoImageUrl } = require('./generate-feed');
const { articleId } = require('../mobile/app/js/core.js');

const ROOT = path.resolve(__dirname, '..');
const STORE = path.join(ROOT, 'data/article-pages.json');
const SITE = 'https://le-radar.ca';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Espaces insécables typographiques (fr) : jamais « ? » ou « : » seul en début de ligne. */
function frenchNbsp(s = '') {
  return String(s)
    .replace(/[ \u00a0\u202f]+([?!;»])/g, '\u202f$1')
    .replace(/[ \u00a0\u202f]+:/g, '\u00a0:')
    .replace(/«[ \u00a0\u202f]+/g, '«\u202f');
}
const clean = (s = '') => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** « Photo: X » → « X » ; « Illustration : X » gardé. Même règle que feedCredit (lib sociale). */
function creditOf(item) {
  let c = clean(photoCreditLine(item) || '');
  while (/^photo\s*:\s*/i.test(c)) c = c.replace(/^photo\s*:\s*/i, '');
  return c.replace(/^illustration\s*:\s*/i, 'Illustration : ');
}

function imageOf(item) {
  if (item._feedNoImage) return '';
  const local = String(item.imageLocal || '').trim();
  if (/^assets\/news-images\//i.test(local)) return `${SITE}/${local}`;
  const url = String(item.image || item.stockImage || '').trim();
  return /^https:\/\//i.test(url) && !isLogoImageUrl(url) ? url : '';
}

/** Extrait : 2 phrases au plus, ~320 car. (description de carte lisible). */
function shortExcerpt(text = '', max = 320) {
  const s = clean(text); if (!s) return '';
  const parts = s.split(/(?<=[.!?…])\s+(?=[«"“A-ZÀ-ÝŒ0-9])/);
  let out = '';
  for (const p of parts.slice(0, 2)) { if ((out + ' ' + p).trim().length > max) break; out = (out + ' ' + p).trim(); }
  if (!out) out = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}

function recordOf(item) {
  const link = String(item.link || '').trim();
  const id = articleId(link);
  if (!id || !item.title) return null;
  const author = clean(item.author || '');
  return {
    id,
    title: clean(item.title),
    source: clean(item.source || ''),
    institution: clean(item.institution || ''),
    author: author && author !== clean(item.source || '') ? author : '',
    date: item.date || '',
    lang: item.lang === 'en' ? 'en' : 'fr',
    link,
    excerpt: shortExcerpt(item.leadExcerpt || item.excerpt || ''),
    image: imageOf(item),
    credit: creditOf(item),
    ...(item.imageCropSafe === item.image && imageOf(item) === item.image
      && Number.isFinite(item.imageCropFocalY) && item.imageCropFocalY >= 0 && item.imageCropFocalY <= 1
      ? { imageCropFocalY: item.imageCropFocalY } : {}),
  };
}

function readStore() {
  try { const s = JSON.parse(fs.readFileSync(STORE, 'utf8')); if (s && s.articles) return s; } catch {}
  return { schemaVersion: 1, articles: {} };
}

function writeStore(store) {
  // Une ligne par fiche : diffs de bot lisibles, fichier compact.
  const ids = Object.keys(store.articles).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(store.articles[id])}`).join(',\n');
  fs.writeFileSync(STORE, `{\n "schemaVersion": 1,\n "_doc": "Fiches /article/<id>/ (scripts/article-pages.js). Jamais de retrait : les liens partagés restent valides.",\n "articles": {\n${body}\n }\n}\n`);
}

function newsItems() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'news.json'), 'utf8')).items || []; } catch { return []; }
}

/** Fusionne les articles courants ; un article déjà connu garde son firstSeen, le reste est rafraîchi. */
function merge(store, items, now = new Date().toISOString()) {
  let added = 0;
  for (const item of items) {
    const r = recordOf(item); if (!r) continue;
    const old = store.articles[r.id];
    if (!old) added += 1;
    // Champ vide dans le flux du jour (photo purgée, crédit perdu) : on garde l'ancienne valeur.
    const keep = {};
    if (old) for (const k of ['image', 'credit', 'excerpt', 'author']) if (!r[k] && old[k]) keep[k] = old[k];
    store.articles[r.id] = { ...r, ...keep, firstSeen: (old && old.firstSeen) || now };
  }
  return added;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function frDate(iso) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(t).map((x) => [x.type, x.value]));
  return `${Number(p.day) === 1 ? '1er' : Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

function articleMain(a) {
  const url = `${SITE}/article/${a.id}/`;
  const meta = [a.date ? `<time datetime="${esc(a.date)}">${esc(frDate(a.date))}</time>` : '', a.author ? `<span>${esc(a.author)}</span>` : '']
    .filter(Boolean).join('<span class="seo-article__sep" aria-hidden="true"> · </span>');
  const fig = a.image ? `
      <figure class="seo-article__figure">
        <img src="${esc(a.image)}" alt="${esc(a.title)}" width="1200" height="800"${Number.isFinite(a.imageCropFocalY) && a.imageCropFocalY >= 0 && a.imageCropFocalY <= 1 ? ` style="object-position:50% ${a.imageCropFocalY * 100}%;aspect-ratio:3/2"` : ''} decoding="async" fetchpriority="high" referrerpolicy="no-referrer">
        ${a.credit ? `<figcaption class="seo-article__credit">📸 ${esc(a.credit)}</figcaption>` : ''}
      </figure>` : '';
  return `<main class="wire seo-wire seo-article" data-article-id="${esc(a.id)}">
      <nav class="seo-crumbs" aria-label="Fil d’Ariane"><a href="../../">Accueil</a><span class="seo-crumbs__sep" aria-hidden="true">›</span><span aria-current="page">${esc(a.source || 'Article')}</span></nav>
      <p class="seo-eyebrow">${esc([a.source, a.institution].filter(Boolean).join(' · '))}</p>
      <h1 class="seo-title" lang="${a.lang === 'en' ? 'en-CA' : 'fr-CA'}">${esc(frenchNbsp(a.title))}</h1>
      ${meta ? `<p class="seo-article__meta">${meta}</p>` : ''}${fig}
      ${a.excerpt ? `<p class="seo-lead seo-article__excerpt" lang="${a.lang === 'en' ? 'en-CA' : 'fr-CA'}">${esc(a.excerpt)}</p>` : ''}
      <div class="seo-source-actions">
        <p class="seo-cta seo-cta--source"><a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">Lire l’article chez ${esc(a.source || 'le média')} ↗</a></p>
        <p class="seo-article__back"><a href="../../">← Tout le fil de LE-RADAR.ca</a></p>
      </div>
      <p class="seo-note">Article publié par ${esc(a.source || 'son média étudiant')}. LE-RADAR.ca le signale et renvoie vers la publication d’origine ; le texte complet reste chez le média.</p>
      <link rel="alternate" type="application/rss+xml" title="LE-RADAR.ca" href="${SITE}/feed.xml">
      <meta itemprop="url" content="${url}">
    </main>`;
}

/** Gabarit : horaires/index.html (page du site à habillage complet), chemins relevés d'un niveau. */
function loadTemplate() {
  const html = fs.readFileSync(path.join(ROOT, 'horaires/index.html'), 'utf8');
  if (!/<main[\s>]/.test(html) || !/<\/main>/.test(html)) throw new Error('gabarit horaires/index.html sans <main>');
  return html.replace(/(["'(])\.\.\//g, '$1../../');
}

function renderPage(tpl, a) {
  const url = `${SITE}/article/${a.id}/`;
  const title = `${a.title} — ${a.source || 'LE-RADAR.ca'} | LE-RADAR.ca`;
  const desc = [a.excerpt, a.credit ? `📸 ${a.credit}` : ''].filter(Boolean).join(' ') || `Article de ${a.source} signalé par LE-RADAR.ca.`;
  const img = a.image || `${SITE}/assets/og-cover.png?v=3`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title.slice(0, 110), url, mainEntityOfPage: url, isBasedOn: a.link, inLanguage: a.lang === 'en' ? 'en-CA' : 'fr-CA',
    ...(a.date ? { datePublished: a.date } : {}), ...(a.author ? { author: { '@type': 'Person', name: a.author } } : {}),
    publisher: { '@type': 'Organization', name: a.source || 'LE-RADAR.ca' },
    ...(a.image ? { image: { '@type': 'ImageObject', url: a.image, ...(a.credit ? { creditText: a.credit } : {}) } } : {}) };
  const og = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="LE-RADAR.ca" />`,
    `<meta property="og:locale" content="${a.lang === 'en' ? 'en_CA' : 'fr_CA'}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(a.title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:image:alt" content="${esc(a.credit ? `${a.title} (📸 ${a.credit})` : a.title)}" />`,
    a.date ? `<meta property="article:published_time" content="${esc(a.date)}" />` : '',
    a.author ? `<meta property="article:author" content="${esc(a.author)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@le_radar_ca" />`,
    `<meta name="twitter:title" content="${esc(a.title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    `<meta name="twitter:image:alt" content="${esc(a.credit ? `📸 ${a.credit}` : a.title)}" />`,
  ].filter(Boolean).join('\n    ');
  let h = tpl
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow" />')
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/\s*<link rel="alternate" hreflang[^>]*>/g, '')
    .replace(/\s*<!-- x-default[^>]*-->/, '')
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`)
    .replace(/<main[\s\S]*<\/main>/, articleMain(a))
    .replace(/href="\.\.\/\.\.\/en\/schedules\/"/, 'href="../../en/"');
  h = h.replace(/(<link rel="canonical"[^>]*>)/, `$1\n    ${og}`);
  if (/tison/i.test(h)) throw new Error(`nom interdit dans la fiche ${a.id}`);
  return h;
}

function render(outDir) {
  const store = readStore();
  merge(store, newsItems());
  const tpl = loadTemplate();
  let n = 0;
  for (const a of Object.values(store.articles)) {
    const dir = path.join(outDir, 'article', a.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderPage(tpl, a));
    n += 1;
  }
  return n;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--update')) {
    const store = readStore(); const added = merge(store, newsItems()); writeStore(store);
    console.log(`article-pages : ${added} nouvelle(s) fiche(s), ${Object.keys(store.articles).length} au registre.`);
  }
  const i = args.indexOf('--render');
  if (i >= 0) { const out = path.resolve(args[i + 1] || '_site'); console.log(`article-pages : ${render(out)} fiche(s) écrite(s) dans ${out}/article/.`); }
  if (!args.includes('--update') && i < 0) { console.error('Usage : node scripts/article-pages.js --update | --render <dir>'); process.exit(2); }
}

module.exports = {
  frenchNbsp, imageOf, recordOf, merge, renderPage, loadTemplate, creditOf, shortExcerpt, frDate, render };

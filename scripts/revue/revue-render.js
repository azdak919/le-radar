/**
 * LE-RADAR.ca — Rendu de « La revue du matin » et « La revue du soir » (page d'article, index des archives, JSON-LD
 * NewsArticle, sitemap Google News, flux RSS). Tout part du modèle stocké dans data/revue/reviews/<id>.json
 * (scripts/revue/revue-lib.mjs buildModel) : la page, le flux et les sitemaps disent exactement la même chose.
 *
 * Exposition publique (sitemap.xml, sitemap-news.xml, robots.txt, feed.xml) : SEULEMENT si data/revue/config.json
 * `publish` vaut true (loadPublished). Tests : tests/revue.mjs.
 */
const fs = require('fs');
const path = require('path');
const { renderPage, escapeHtml } = require('../seo-pages-lib');

const ROOT = path.join(__dirname, '..', '..');
const SITE = (process.env.RADAR_SITE_URL || 'https://le-radar.ca').replace(/\/$/, '');
const PUBLISHER = 'Le Radar';
const CONFIG_PATH = path.join(ROOT, 'data/revue/config.json');
const INDEX_PATH = path.join(ROOT, 'data/revue/index.json');
const REVIEWS_DIR = path.join(ROOT, 'data/revue/reviews');
const NEWS_SITEMAP = 'sitemap-news.xml';
const EXT = ' target="_blank" rel="noopener noreferrer"';

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const esc = (s) => escapeHtml(String(s == null ? '' : s));
const escXml = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
/** JSON sûr dans un <script> (</script>, U+2028/9). */
const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// ── Dates (heure de Montréal) ────────────────────────────────────────────────
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const D3 = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const M3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function mtlParts(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const off = String(p.timeZoneName || 'GMT-05:00').replace('GMT', '') || '+00:00';
  return { ymd: `${p.year}-${p.month}-${p.day}`, hh: +p.hour, mm: +p.minute, off: off === '' ? '+00:00' : off };
}
const ymdParts = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() }; };
/** « lundi 16 novembre 2026 ». */
function frDayYear(ymd) { const { y, m, d, wd } = ymdParts(ymd); return `${DAYS[wd]} ${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`; }
/** « lun. 16 nov. ». */
function frShort(ymd) { const { m, d, wd } = ymdParts(ymd); return `${D3[wd]} ${d === 1 ? '1er' : d} ${M3[m - 1]}`; }
/** « 19 h 15 ». */
function frClock(ts) { const p = mtlParts(ts); return `${p.hh} h${p.mm ? ' ' + String(p.mm).padStart(2, '0') : ''}`; }
/** ISO 8601 avec le décalage de Montréal (« 2026-11-16T19:15:00-05:00 ») : Google News et schema.org. */
function isoMtl(ts) { const p = mtlParts(ts); return `${p.ymd}T${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}:00${p.off}`; }
/** « le lundi 16 novembre 2026 à 19 h 15 (heure de Montréal) » (pied de page). */
const stamp = (ts) => `le ${frDayYear(mtlParts(ts).ymd)} à ${frClock(ts)} (heure de Montréal)`;
const rfc822 = (ts) => new Date(ts).toUTCString().replace('GMT', '+0000');
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

// ── Fragments ───────────────────────────────────────────────────────────────
const THEME_EMOJI = { 'Vie de campus': '🏫', Politique: '🏛️', Éducation: '🎓', Société: '👥', Culture: '🎭', Sport: '🏟️', Environnement: '🌱', Santé: '🩺', Science: '🔬', Économie: '💼', International: '🌍' };
const THEME_ORDER = ['Vie de campus', 'Politique', 'Éducation', 'Société', 'Culture', 'Sport', 'Environnement', 'Santé', 'Science', 'Économie', 'International'];
function groupByTheme(items) {
  const m = new Map();
  for (const x of items) { const k = THEME_ORDER.includes(x.theme) ? x.theme : 'Vie de campus'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].map(([theme, list]) => ({ theme, emoji: THEME_EMOJI[theme] || '📰', items: list }))
    .sort((a, b) => (a.theme === 'Vie de campus') - (b.theme === 'Vie de campus') || b.items.length - a.items.length || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme));
}
const slug = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function authorsLine(a = []) { return a.length ? (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`) : ''; }
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

function itemHtml(x) {
  const lang = x.lang === 'en' ? ' lang="en"' : '';
  const when = `${frShort(mtlParts(x.date).ymd)} · ${frClock(x.date)}`;
  const authors = authorsLine(x.authors || []);
  const text = x.resume
    ? `<p class="revue-item__resume" data-texte="ia">${esc(x.resume)}</p>`
    : (x.excerpt ? `<blockquote class="revue-item__excerpt" data-texte="extrait"${lang} cite="${esc(x.link)}"><p>« ${esc(x.excerpt)} »</p></blockquote>` : '');
  return [
    `          <li class="revue-item" id="a-${esc(x.id)}">`,
    `            <p class="revue-item__media"><span class="notranslate" translate="no">${esc(x.source)}</span>${x.institution ? ` · ${esc(x.institution)}` : ''}</p>`,
    `            <h4 class="revue-item__title"><a href="${esc(x.link)}"${EXT}${lang}>${x.sport ? `${esc(x.sport)} ` : ''}${esc(x.title)}</a></h4>`,
    `            <p class="revue-item__byline">${authors ? `Par <span class="notranslate" translate="no">${esc(authors)}</span> · ` : ''}<time datetime="${esc(isoMtl(x.date))}">${esc(when)}</time></p>`,
    text ? `            ${text}` : '',
    `            <p class="revue-item__more"><a href="${esc(x.link)}"${EXT}>Lire l’article sur <span class="notranslate" translate="no">${esc(x.source)}</span> <span aria-hidden="true">↗</span></a></p>`,
    '          </li>',
  ].filter(Boolean).join('\n');
}
function presseHtml(model) {
  const groups = groupByTheme(model.items);
  return [
    '      <section class="seo-section revue-section" id="presse" aria-labelledby="presse-titre">',
    `        <h2 id="presse-titre">📰 Revue de presse</h2>`,
    ...groups.map((g) => [
      `        <h3 class="revue-theme" id="theme-${slug(g.theme)}">${g.emoji} ${esc(g.theme)}</h3>`,
      '        <ol class="revue-items">',
      ...g.items.map(itemHtml),
      '        </ol>',
    ].join('\n')),
    '      </section>',
  ].join('\n');
}
function radioHtml(model) {
  const rows = model.radio || [];
  const window = model.edition.id === 'soir' ? 'en soirée' : 'pendant la journée';
  return [
    '      <section class="seo-section revue-section" id="radio" aria-labelledby="radio-titre">',
    '        <h2 id="radio-titre">📻 À l’écoute sur les radios étudiantes</h2>',
    rows.length
      ? `        <p class="seo-section__lead">Émissions originales prévues ${window} le ${esc(frDayYear(model.edition.day))}, selon les grilles publiées par les stations (heure de Montréal).</p>`
      : `        <p class="seo-section__lead">Aucune émission originale n’est inscrite aux grilles des radios étudiantes pour cette période. <a href="${SITE}/horaires/">Voir toutes les grilles</a>.</p>`,
    ...rows.map((st) => [
      `        <h3 class="revue-station"><a href="${esc(st.page)}" class="notranslate" translate="no">${esc(st.station)}</a></h3>`,
      '        <ul class="revue-shows">',
      ...st.shows.map((s) => `          <li><time>${esc(s.when)}</time> <span class="revue-show">${s.url ? `<a href="${esc(s.url)}"${EXT}>${esc(s.title)}</a>` : esc(s.title)}</span></li>`),
      '        </ul>',
    ].join('\n')),
    '      </section>',
  ].join('\n');
}
function sportHtml(model) {
  const { results = [], next = [] } = model.sports || {};
  const groups = new Map();
  for (const r of results) { const k = `${r.uni ? 'u' : 'c'}|${r.emoji} ${r.sport}`; if (!groups.has(k)) groups.set(k, { label: `${r.emoji} ${r.sport}`, uni: r.uni, items: [] }); groups.get(k).items.push(r); }
  const days = new Map();
  for (const r of next) { if (!days.has(r.date)) days.set(r.date, []); days.get(r.date).push(r); }
  const refreshed = model.refreshedAt ? ` Résultats mis à jour le ${esc(frDayYear(mtlParts(model.refreshedAt).ymd))} à ${esc(frClock(model.refreshedAt))}.` : '';
  const out = [
    '      <section class="seo-section revue-section" id="sport" aria-labelledby="sport-titre">',
    '        <h2 id="sport-titre">🏟️ Sport étudiant</h2>',
    '        <h3 class="revue-sub">Résultats</h3>',
  ];
  if (!results.length) out.push(`        <p class="revue-empty">Aucun nouveau résultat sportif étudiant pour cette période.${refreshed}</p>`);
  else {
    out.push(`        <p class="seo-section__lead">Tous les résultats connus du sport étudiant (RSEQ, U SPORTS et ligues étudiantes), universitaire d’abord.${refreshed}</p>`);
    for (const g of groups.values()) {
      out.push(`        <h4 class="revue-sport">${esc(g.label)} <span class="revue-level">${g.uni ? 'universitaire' : 'collégial'}</span></h4>`, '        <ul class="revue-results">');
      for (const r of g.items) out.push(`          <li><span class="revue-score notranslate" translate="no">${esc(r.text)}</span> <span class="revue-league">${esc([r.league, r.when].filter(Boolean).join(' · '))}</span></li>`);
      out.push('        </ul>');
    }
  }
  out.push('        <h3 class="revue-sub">Prochains matchs</h3>');
  if (!next.length) out.push('        <p class="revue-empty">Aucun match étudiant inscrit au calendrier pour les prochains jours.</p>');
  for (const [d, list] of days) {
    out.push(`        <h4 class="revue-day">${esc(cap(frDayYear(d)))}</h4>`, '        <ul class="revue-next">');
    for (const r of list) out.push(`          <li>${r.time ? `<time>${esc(r.time.replace(/^0/, '').replace(':00', ' h').replace(':', ' h '))}</time> ` : ''}<span class="revue-sportname">${esc(`${r.emoji} ${r.sport}`)}</span> · <span class="notranslate" translate="no">${esc(r.text)}</span>${r.league ? ` <span class="revue-league">${esc(r.league)}</span>` : ''}</li>`);
    out.push('        </ul>');
  }
  out.push(`        <p class="revue-more"><a href="${SITE}/sports/">Tableau complet du sport étudiant</a></p>`, '      </section>');
  return out.join('\n');
}
function sourcesHtml(model) {
  const media = [...new Set(model.items.map((x) => x.source))].sort((a, b) => a.localeCompare(b, 'fr'));
  const ai = String(model.generator || '').startsWith('ia:');
  return [
    '      <section class="seo-section revue-section revue-sources" id="sources" aria-labelledby="sources-titre">',
    '        <h2 id="sources-titre">Sources et méthode</h2>',
    `        <p>Médias cités : <span class="notranslate" translate="no">${esc(media.join(', '))}</span>. Chaque article appartient à son média et à ses auteurs ; les titres sont ceux des articles originaux, dans leur langue.</p>`,
    `        <p>${ai ? `Les résumés d’une phrase sont rédigés par une IA ouverte (${esc(String(model.generator).slice(3))}, Cloudflare Workers AI) à partir du titre et de l’extrait de chaque article, puis vérifiés automatiquement : un résumé qui contient un chiffre, un nom ou une date absents de la source est remplacé par un court extrait de l’article.` : 'Cette édition reprend un court extrait de chaque article, sans résumé rédigé par IA.'} Les liens, les auteurs, les grilles de radio et les résultats sportifs viennent directement des données du Radar et sont contrôlés avant publication.</p>`,
    `        <p class="revue-nav">${model.previous ? `<a href="${esc(SITE + '/' + model.previous.path)}" rel="prev">← ${esc(model.previous.headline)}</a> · ` : ''}<a href="${SITE}/revue/">Toutes les revues</a> · <a href="${SITE}/revue/feed.xml">Flux RSS des revues</a></p>`,
    '      </section>',
  ].join('\n');
}
/** « Photo : Jane Doe · Le Délit, « Titre » » ; le média n'est pas répété si le crédit le nomme déjà. */
function coverCaption(img) {
  const credit = String(img.credit || '').trim();
  const src = credit && credit.toLowerCase().includes(String(img.source).toLowerCase()) ? '' : img.source;
  return `${credit}${credit && src ? ' · ' : ''}${src}${credit || src ? ', ' : ''}« ${img.title} »`;
}
/** Corps de l'article (aussi repris tel quel, sans la chrome, dans le flux RSS). */
/** Mention de transparence, discrète, en pied d'article (une seule phrase). */
const DISCLOSURE = 'Revue préparée automatiquement par Le Radar à partir des sources citées ; chaque texte, titre et photo appartient à son média et à ses auteurs.';
function articleBody(model) {
  const pub = model.datePublished, mod = model.dateModified;
  const modified = mod && Date.parse(mod) - Date.parse(pub) > 60e3;
  const img = model.image;
  return [
    `      <article class="revue revue--${esc(model.edition.id)}" data-revue="${esc(model.id)}">`,
    `      <p class="revue-meta">Par <strong>${PUBLISHER}</strong> · Publiée le <time datetime="${esc(isoMtl(pub))}">${esc(frDayYear(mtlParts(pub).ymd))} à ${esc(frClock(pub))}</time>${modified ? ` · Mise à jour à <time datetime="${esc(isoMtl(mod))}">${esc(frClock(mod))}</time>` : ''} (heure de Montréal)</p>`,
    img ? `      <figure class="revue-cover"><img src="${esc(img.url)}" alt="${esc(img.title)}" loading="eager" decoding="async" /><figcaption>${esc(coverCaption(img))}</figcaption></figure>` : '',
    `      <p class="seo-lead revue-lede">${esc(model.intro)}</p>`,
    '      <nav class="revue-toc" aria-label="Sommaire"><a href="#presse">📰 Revue de presse</a><a href="#radio">📻 Radio étudiante</a><a href="#sport">🏟️ Sport étudiant</a><a href="#sources">Sources</a></nav>',
    presseHtml(model), radioHtml(model), sportHtml(model), sourcesHtml(model),
    `      <p class="revue-disclosure">${DISCLOSURE}</p>`,
    '      </article>',
  ].filter(Boolean).join('\n');
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────
const publisherLd = () => ({ '@type': 'NewsMediaOrganization', name: PUBLISHER, alternateName: 'LE-RADAR.ca', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon-512.png`, width: 512, height: 512 } });
function reviewJsonLd(model) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: model.headline.slice(0, 110),
    description: model.description,
    url: model.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': model.url },
    datePublished: isoMtl(model.datePublished),
    dateModified: isoMtl(model.dateModified || model.datePublished),
    inLanguage: 'fr-CA',
    isAccessibleForFree: true,
    articleSection: 'Revue de presse',
    keywords: model.categories.join(', '),
    image: [model.image?.url || `${SITE}/assets/og-cover.png`],
    author: { '@type': 'Organization', name: PUBLISHER, url: `${SITE}/` },
    publisher: publisherLd(),
    citation: model.items.map((x) => ({
      '@type': 'NewsArticle', headline: x.title, url: x.link, datePublished: x.date, inLanguage: x.lang === 'en' ? 'en' : 'fr',
      author: (x.authors || []).filter((a) => a !== 'la rédaction').length ? x.authors.filter((a) => a !== 'la rédaction').map((name) => ({ '@type': 'Person', name })) : { '@type': 'Organization', name: x.source },
      publisher: { '@type': 'NewsMediaOrganization', name: x.source },
    })),
  };
}

// ── Pages ────────────────────────────────────────────────────────────────────
function renderReviewPage(model, { robots = 'index,follow,max-image-preview:large' } = {}) {
  const title = `${model.headline} | LE-RADAR.ca`;
  const head = [
    `    <meta property="article:published_time" content="${esc(isoMtl(model.datePublished))}" />`,
    `    <meta property="article:modified_time" content="${esc(isoMtl(model.dateModified || model.datePublished))}" />`,
    `    <meta property="article:author" content="${PUBLISHER}" />`,
    '    <meta property="article:section" content="Revue de presse" />',
    ...model.categories.map((c) => `    <meta property="article:tag" content="${esc(c)}" />`),
    `    <meta name="twitter:title" content="${esc(model.headline)}" />`,
    `    <meta name="twitter:description" content="${esc(model.description)}" />`,
    `    <meta name="author" content="${PUBLISHER}" />`,
    `    <link rel="alternate" type="application/rss+xml" title="Les revues du Radar" href="${SITE}/revue/feed.xml" />`,
    '',
  ].join('\n');
  return renderPage({
    lang: 'fr', path: model.path, altPath: model.path, title, description: model.description,
    h1: `${model.edition.emoji} ${model.headline}`, eyebrow: 'Revue de presse étudiante',
    crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Revues', href: '../' }, { label: model.headline }],
    bodyHtml: articleBody(model), jsonLd: jsonForScript(reviewJsonLd(model)), siteBase: SITE, updated: stamp(model.dateModified),
    robots, alternate: false, extraHead: head, extraStyles: ['revue.css'], wireClass: 'revue-wire', ogType: 'article', ogImage: model.image?.url || null,
  });
}
function renderIndexPage(index = []) {
  const byDay = new Map();
  for (const r of index) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
  const rows = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => [
    `        <li class="revue-archive__day"><h3>${esc(cap(frDayYear(day)))}</h3><ul>`,
    ...list.sort((a, b) => (a.edition === 'matin' ? 0 : 1) - (b.edition === 'matin' ? 0 : 1)).map((r) => `          <li><a href="../${esc(r.path.replace(/^revue\//, ''))}">${r.edition === 'soir' ? '🌙' : '☀️'} ${esc(r.edition === 'soir' ? 'La revue du soir' : 'La revue du matin')}</a> ${r.lead ? `<span class="revue-archive__meta">En tête : « ${esc(String(r.lead).replace(/[.]+$/, ''))} »</span>` : ''}</li>`),
    '        </ul></li>',
  ].join('\n'));
  const path_ = 'revue/';
  const title = 'Les revues de presse étudiante du Radar | LE-RADAR.ca';
  const description = 'La revue du matin et la revue du soir : revue de presse des médias étudiants du Québec, radio étudiante et résultats du sport étudiant, avec liens vers les articles originaux.';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Les revues du Radar', url: `${SITE}/${path_}`, inLanguage: 'fr-CA', publisher: publisherLd(),
    mainEntity: { '@type': 'ItemList', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: index.length, itemListElement: index.slice(0, 60).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: r.url, name: r.headline })) } };
  return renderPage({
    lang: 'fr', path: path_, altPath: path_, title, description, h1: 'Les revues du Radar', eyebrow: 'Revue de presse étudiante',
    crumbs: [{ label: 'Accueil', href: '../' }, { label: 'Revues' }],
    bodyHtml: [
      '      <p class="seo-lead">Deux fois par jour, La revue du matin et La revue du soir rassemblent les articles des médias étudiants du Québec, les émissions des radios étudiantes et les résultats du sport étudiant.</p>',
      `      <p class="revue-more"><a href="${SITE}/revue/feed.xml">Flux RSS des revues</a></p>`,
      '      <section class="seo-section revue-section"><h2>Archives</h2>',
      index.length ? `      <ul class="revue-archive">\n${rows.join('\n')}\n      </ul>` : '      <p class="revue-empty">Aucune revue publiée pour le moment.</p>',
      '      </section>',
      '      <p class="revue-disclosure">Revues préparées automatiquement par Le Radar à partir des sources citées ; chaque article renvoie à son média d’origine et nomme tous ses auteurs.</p>',
    ].join('\n'),
    jsonLd: jsonForScript(ld), siteBase: SITE, updated: index[0] ? stamp(index[0].dateModified || index[0].datePublished) : null, alternate: false,
    extraHead: `    <link rel="alternate" type="application/rss+xml" title="Les revues du Radar" href="${SITE}/revue/feed.xml" />\n`, extraStyles: ['revue.css'], wireClass: 'revue-wire',
  });
}

// ── Sitemaps ─────────────────────────────────────────────────────────────────
/** Sitemap Google News : revues publiées dans les `hours` dernières heures seulement. */
function newsSitemap(index = [], { now = Date.now(), hours = 48 } = {}) {
  const fresh = index.filter((r) => now - Date.parse(r.datePublished) <= hours * 3600e3 && Date.parse(r.datePublished) <= now);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Généré par scripts/revue/revue-run.mjs : revues des 48 dernières heures (Google News). -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...fresh.map((r) => [
      '  <url>',
      `    <loc>${escXml(r.url)}</loc>`,
      '    <news:news>',
      `      <news:publication><news:name>${PUBLISHER}</news:name><news:language>fr</news:language></news:publication>`,
      `      <news:publication_date>${escXml(isoMtl(r.datePublished))}</news:publication_date>`,
      `      <news:title>${escXml(r.headline)}</news:title>`,
      '    </news:news>',
      '  </url>',
    ].join('\n')),
    '</urlset>',
    '',
  ].join('\n');
}
/** Entrées du sitemap principal (generate-seo.js) : l'index et chaque revue. */
function sitemapEntries(index = []) {
  if (!index.length) return [];
  return [
    { loc: '/revue/', changefreq: 'daily', priority: '0.6', lastmod: String(index[0].dateModified || index[0].datePublished).slice(0, 10) },
    ...index.map((r) => ({ loc: `/${r.path}`, changefreq: 'weekly', priority: '0.5', lastmod: String(r.dateModified || r.datePublished).slice(0, 10) })),
  ];
}

// ── RSS ──────────────────────────────────────────────────────────────────────
/** Contenu complet pour content:encoded : le corps de l'article, styles en ligne simples (lecteurs RSS). */
function feedContentHtml(model) {
  const p = (s) => `<p>${s}</p>`;
  const out = [];
  if (model.image) out.push(`<figure><img src="${esc(model.image.url)}" alt="${esc(model.image.title)}" style="max-width:100%;height:auto" /><figcaption>${esc(coverCaption(model.image))}</figcaption></figure>`);
  out.push(p(`<strong>${esc(model.intro)}</strong>`));
  out.push('<h2>📰 Revue de presse</h2>');
  for (const g of groupByTheme(model.items)) {
    out.push(`<h3>${g.emoji} ${esc(g.theme)}</h3><ul>`);
    for (const x of g.items) {
      const a = authorsLine(x.authors || []);
      out.push(`<li><a href="${esc(x.link)}">${esc(x.title)}</a> — ${esc(x.source)}${a ? `, par ${esc(a)}` : ''}${x.resume ? `<br />${esc(x.resume)}` : x.excerpt ? `<br />« ${esc(x.excerpt)} »` : ''}</li>`);
    }
    out.push('</ul>');
  }
  if ((model.radio || []).length) {
    out.push('<h2>📻 Radio étudiante</h2><ul>');
    for (const st of model.radio) out.push(`<li><strong>${esc(st.station)}</strong> : ${st.shows.map((s) => `${esc(s.when)} ${esc(s.title)}`).join(' ; ')}</li>`);
    out.push('</ul>');
  }
  const { results = [], next = [] } = model.sports || {};
  out.push('<h2>🏟️ Sport étudiant</h2>');
  out.push(results.length ? `<h3>Résultats</h3><ul>${results.map((r) => `<li>${esc(`${r.emoji} ${r.sport} · ${r.text}`)} <small>${esc([r.league, r.when].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : p('Aucun nouveau résultat sportif étudiant pour cette période.'));
  if (next.length) out.push(`<h3>Prochains matchs</h3><ul>${next.map((r) => `<li>${esc(`${frShort(r.date)}${r.time ? ` · ${r.time.replace(':', ' h ').replace(' h 00', ' h')}` : ''} · ${r.emoji} ${r.sport} · ${r.text}`)}</li>`).join('')}</ul>`);
  out.push(p(`<a href="${esc(model.url)}">Lire la revue sur le-radar.ca</a>`));
  out.push(p(`<small>${DISCLOSURE}</small>`));
  return out.join('\n');
}
function feedItemXml(model) {
  const img = model.image;
  return [
    '    <item>',
    `      <title>${escXml(model.headline)}</title>`,
    `      <link>${escXml(model.url)}</link>`,
    `      <guid isPermaLink="true">${escXml(model.url)}</guid>`,
    `      <pubDate>${escXml(rfc822(model.datePublished))}</pubDate>`,
    `      <dc:creator>${PUBLISHER}</dc:creator>`,
    ...model.categories.map((c) => `      <category>${escXml(c)}</category>`),
    `      <description>${cdata(esc(model.description))}</description>`,
    `      <content:encoded>${cdata(feedContentHtml(model))}</content:encoded>`,
    img ? `      <enclosure url="${escXml(img.url)}" length="${Number(img.length) > 0 ? Number(img.length) : 0}" type="${/\.png(\?|$)/i.test(img.url) ? 'image/png' : /\.webp(\?|$)/i.test(img.url) ? 'image/webp' : 'image/jpeg'}" />` : '',
    img ? `      <media:content url="${escXml(img.url)}" medium="image" />` : '',
    '    </item>',
  ].filter(Boolean).join('\n');
}
/** Flux dédié /revue/feed.xml. */
function revueFeedXml(models = [], { now = Date.now() } = {}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    '    <title>Les revues du Radar</title>',
    `    <link>${SITE}/revue/</link>`,
    '    <description>La revue du matin et La revue du soir : revue de presse des médias étudiants du Québec, radio étudiante et sport étudiant. Générées automatiquement à partir des sources citées.</description>',
    '    <language>fr-CA</language>',
    `    <lastBuildDate>${rfc822(models[0]?.dateModified || now)}</lastBuildDate>`,
    `    <atom:link href="${SITE}/revue/feed.xml" rel="self" type="application/rss+xml" />`,
    `    <image><url>${SITE}/assets/icon-192.png</url><title>Les revues du Radar</title><link>${SITE}/revue/</link></image>`,
    ...models.map(feedItemXml),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// ── Données publiées (seulement si publish = true) ──────────────────────────
function loadConfig(root = ROOT) { return readJson(path.join(root, 'data/revue/config.json'), { publish: false }); }
/** { enabled, index, models } : vide tant que `publish` n'est pas true dans data/revue/config.json. */
function loadPublished(root = ROOT, { limit = 10 } = {}) {
  const cfg = loadConfig(root);
  if (cfg.publish !== true) return { enabled: false, index: [], models: [] };
  const index = readJson(path.join(root, 'data/revue/index.json'), []);
  const models = index.slice(0, limit).map((r) => readJson(path.join(root, 'data/revue/reviews', `${r.id}.json`), null)).filter(Boolean);
  return { enabled: true, index, models };
}
/** Ligne Sitemap du sitemap Google News dans robots.txt : présente si et seulement si la revue est publiée. */
function robotsWithNewsSitemap(text, enabled) {
  const line = `Sitemap: ${SITE}/${NEWS_SITEMAP}`;
  const lines = String(text).replace(/\n+$/, '').split('\n').filter((l) => l.trim() !== line);
  if (enabled) lines.push(line);
  return lines.join('\n') + '\n';
}

module.exports = {
  SITE, PUBLISHER, NEWS_SITEMAP, CONFIG_PATH, INDEX_PATH, REVIEWS_DIR,
  frDayYear, frShort, frClock, isoMtl, rfc822, groupByTheme,
  articleBody, reviewJsonLd, renderReviewPage, renderIndexPage, newsSitemap, sitemapEntries,
  feedContentHtml, feedItemXml, revueFeedXml, loadConfig, loadPublished, robotsWithNewsSitemap, jsonForScript,
};

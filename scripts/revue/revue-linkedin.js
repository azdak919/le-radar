/**
 * Carrousel LinkedIn d'une revue (document PDF, pages 4:5 de 1080 × 1350 px).
 * LinkedIn affiche un PDF joint comme un carrousel qu'on fait glisser ; c'est le format le plus
 * engageant pour une Page (recherche du 25 nov. 2026). Construit à partir de
 * data/revue/reviews/<id>.json, imprimé par scripts/revue/revue-pdfs.mjs → revue/<id>/linkedin.pdf.
 *
 * Pages : couverture (édition, date, article en tête) · une page par article (jusqu'à MAX_ARTICLES)
 * · page finale (sport étudiant, radios, lien vers la revue). Polices et logo du site.
 */
'use strict';

const MAX_ARTICLES = 5;
const W = 1080, H = 1350;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frDate = (day) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '';
};
const authorsOf = (it) => (Array.isArray(it.authors) ? it.authors : [it.authors]).filter(Boolean).join(', ');
const clip = (s, n) => { const t = String(s || '').trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

function articlePage(it, i, total, model) {
  const img = it.image ? `<div class="li-photo"><img src="${esc(it.image)}" alt="" />${it.credit ? `<span class="li-credit">${esc(it.credit)}</span>` : ''}</div>` : '';
  const kicker = [it.theme, it.source, it.institution].filter(Boolean).map(esc).join(' · ');
  const text = it.resume || it.excerpt || '';
  return `<section class="li-page li-article${img ? '' : ' li-article--noimg'}">
  <header class="li-top"><span class="li-brand-sm">LE-RADAR.ca</span><span class="li-count">${i + 1} / ${total}</span></header>
  ${img}
  <div class="li-body">
    <p class="li-kicker">${kicker}</p>
    <h2 class="li-title">${esc(clip(it.title, 140))}</h2>
    <p class="li-byline">${authorsOf(it) ? `Par ${esc(authorsOf(it))} · ` : ''}${esc(it.source || '')}</p>
    ${text ? `<p class="li-text">${esc(clip(text, 230))}</p>` : ''}
  </div>
  <footer class="li-foot">${esc(model.edition?.label || 'La revue')} · ${esc(frDate(model.edition?.day))}</footer>
</section>`;
}

function renderLinkedInCarousel(model = {}) {
  const items = (model.items || []).slice(0, MAX_ARTICLES);
  const lead = items[0] || {};
  const cover = model.image?.url || lead.image || '';
  const sports = [...(model.sports?.results || []).slice(0, 3), ...(model.sports?.next || []).slice(0, 4)];
  const shows = (model.radio || []).flatMap((r) => (r.shows || []).slice(0, 1).map((s) => ({ station: r.station, ...s }))).slice(0, 4);
  const sportLine = (g) => {
    const t = g.teams || [];
    const vs = t.length === 2 ? `${t[0].name}${t[0].inst ? ` (${t[0].inst})` : ''} ${g.kind === 'avenir' ? 'c.' : '–'} ${t[1].name}${t[1].inst ? ` (${t[1].inst})` : ''}` : (g.title || '');
    return `${g.emoji || ''} ${g.sport || ''} · ${vs}${g.when ? ` · ${g.when}` : ''}`;
  };
  const total = items.length;
  const url = model.url || `https://le-radar.ca/${model.path || 'revue/'}`;
  const pages = [
    `<section class="li-page li-cover">
  ${cover ? `<img class="li-cover__img" src="${esc(cover)}" alt="" />` : ''}
  <div class="li-cover__shade"></div>
  <div class="li-cover__content">
    <div class="li-brand"><img src="/assets/icon-512.png" alt="" /><span>LE-RADAR.ca</span></div>
    <p class="li-edition">${esc(model.edition?.emoji || '')} ${esc(model.edition?.label || 'La revue')}</p>
    <p class="li-date">${esc(frDate(model.edition?.day))}</p>
    ${lead.title ? `<p class="li-lead-k">À la une · ${esc(lead.source || '')}</p><h1 class="li-lead">${esc(clip(lead.title, 120))}</h1>` : ''}
    <p class="li-swipe">${total} article${total > 1 ? 's' : ''} des médias étudiants du Québec · glissez →</p>
  </div>
  ${model.image?.credit ? `<span class="li-credit li-credit--cover">${esc(model.image.credit)}</span>` : ''}
</section>`,
    ...items.map((it, i) => articlePage(it, i, total, model)),
    `<section class="li-page li-end">
  <header class="li-top"><span class="li-brand-sm">LE-RADAR.ca</span><span class="li-count">Et aussi</span></header>
  ${sports.length ? `<h2 class="li-h">🏟️ Sport étudiant</h2><ul class="li-list">${sports.map((g) => `<li>${esc(sportLine(g))}</li>`).join('')}</ul>` : ''}
  ${shows.length ? `<h2 class="li-h">📻 Radios étudiantes</h2><ul class="li-list">${shows.map((s) => `<li><b>${esc(s.station)}</b> · ${esc(s.title)} · ${esc(s.when || '')}</li>`).join('')}</ul>` : ''}
  <div class="li-cta"><p>Toute la revue, avec les liens vers chaque média :</p><p class="li-url">${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p></div>
  <footer class="li-foot">Journaux, radios et sports étudiants du Québec, réunis au même endroit</footer>
</section>`,
  ];
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><title>${esc(model.headline || 'La revue du Radar')} — carrousel LinkedIn</title>
<style>
@font-face { font-family: 'Source Serif 4'; src: url(/mobile/app/fonts/source-serif-4-700.woff2) format('woff2'); font-weight: 700; }
@font-face { font-family: 'Source Serif 4'; src: url(/mobile/app/fonts/source-serif-4-600.woff2) format('woff2'); font-weight: 600; }
@font-face { font-family: 'Inter'; src: url(/mobile/app/fonts/inter-400.woff2) format('woff2'); font-weight: 400; }
@font-face { font-family: 'Inter'; src: url(/mobile/app/fonts/inter-600.woff2) format('woff2'); font-weight: 600; }
@font-face { font-family: 'Inter'; src: url(/mobile/app/fonts/inter-700.woff2) format('woff2'); font-weight: 700; }
@page { size: ${W}px ${H}px; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #111; }
:root { --serif: 'Source Serif 4', Georgia, serif; --sans: 'Inter', system-ui, sans-serif; --accent: #b3478f; --ink: #111; --paper: #faf8f4; }
.li-page { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; break-after: page; background: var(--paper); color: var(--ink); font-family: var(--sans); }
.li-page:last-child { break-after: auto; }
.li-top { position: absolute; top: 44px; left: 64px; right: 64px; display: flex; justify-content: space-between; font: 700 26px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: #555; z-index: 2; }
.li-foot { position: absolute; left: 64px; right: 64px; bottom: 44px; font: 600 24px/1.3 var(--sans); color: #666; border-top: 3px solid var(--ink); padding-top: 18px; }
.li-credit { position: absolute; right: 16px; bottom: 12px; font: 400 18px/1.2 var(--sans); color: #fff; background: rgba(0,0,0,.55); padding: 4px 10px; border-radius: 6px; }
/* Couverture */
.li-cover { background: #111; color: #fff; }
.li-cover__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.li-cover__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 35%, rgba(0,0,0,.85) 72%); }
.li-cover__content { position: absolute; inset: 64px 64px 96px; display: flex; flex-direction: column; }
.li-brand { display: flex; align-items: center; gap: 22px; font: 700 66px/1 var(--serif); }
.li-brand img { width: 92px; height: 92px; border-radius: 20px; }
.li-edition { margin-top: 40px; font: 700 58px/1.1 var(--serif); }
.li-date { margin-top: 10px; font: 600 34px/1.2 var(--sans); color: #ddd; }
.li-lead-k { margin-top: auto; font: 700 28px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: #f3c1e3; }
.li-lead { margin-top: 18px; font: 700 64px/1.08 var(--serif); }
.li-swipe { margin-top: 30px; font: 600 30px/1.3 var(--sans); color: #eee; }
.li-credit--cover { bottom: 24px; right: 24px; }
/* Articles */
.li-photo { position: absolute; top: 100px; left: 64px; right: 64px; height: 640px; border-radius: 18px; overflow: hidden; background: #ddd; }
.li-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.li-body { position: absolute; top: 776px; left: 64px; right: 64px; bottom: 120px; display: flex; flex-direction: column; }
.li-article--noimg .li-body { top: 150px; }
.li-kicker { font: 700 26px/1.2 var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.li-title { margin-top: 14px; font: 700 50px/1.1 var(--serif); }
.li-article--noimg .li-title { font-size: 72px; }
.li-byline { margin-top: 16px; font: 600 26px/1.3 var(--sans); color: #444; }
.li-text { margin-top: 18px; font: 400 30px/1.4 var(--sans); color: #222; }
/* Page finale */
.li-end .li-h { margin: 150px 64px 0; font: 700 46px/1.1 var(--serif); }
.li-end .li-h + .li-list + .li-h { margin-top: 48px; }
.li-list { list-style: none; margin: 20px 64px 0; }
.li-list li { font: 400 28px/1.35 var(--sans); padding: 12px 0; border-bottom: 2px dotted #bbb; }
.li-cta { position: absolute; left: 64px; right: 64px; bottom: 150px; background: var(--ink); color: #fff; border-radius: 18px; padding: 34px 38px; }
.li-cta p { font: 600 30px/1.35 var(--sans); }
.li-cta .li-url { margin-top: 10px; font: 700 46px/1.1 var(--serif); color: #f3c1e3; }
</style></head>
<body>
${pages.join('\n')}
</body></html>`;
}

module.exports = { renderLinkedInCarousel, MAX_ARTICLES, W, H };

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

// Choix et ordre des articles : scripts/revue/revue-social-pick.mjs (note sociale), avant ce rendu.
const MAX_ARTICLES = 8;
const W = 1080, H = 1350;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frDate = (day) => {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : '';
};
const authorsOf = (it) => (Array.isArray(it.authors) ? it.authors : [it.authors]).filter(Boolean).join(', ');
// Pied de crédits, comme les images des réseaux sociaux (affiches/social-une.js → layoutCredit) : contenus crédités,
// indépendance, licence de la mise en page. Copyleft dessiné par un « © » retourné (🄯 absent des polices du rendu sans tête).
const COPYLEFT = '<span class="li-cl" aria-label="copyleft">©</span>';
const CREDITS = `Articles et photos crédités à leurs auteurs et à leurs médias d’origine. Projet indépendant, sans affiliation. Mise en page ${COPYLEFT}\u00A0Azdak CC BY 4.0.`;
const creditsLine = (cls = '') => `<p class="li-credits${cls ? ' ' + cls : ''}">${CREDITS}</p>`;
// Marque des pages intérieures : même logo et même nom en serif que la couverture, en plus petit (jamais en texte simple).
const BRAND_SM = '<span class="li-brand-sm"><img src="/assets/icon-512.png" alt="" /><span>LE\u2011RADAR.ca</span></span>';
// « CHYZ 94,3 » → « CHYZ 94,3 FM » ; « CJLO 1690AM » inchangé. Même règle que La une (scripts/social/une-lib.mjs → fmLabel).
const fmLabel = (name) => { const n = String(name || '').trim(); return /\d{2,3},\d$/.test(n) ? `${n} FM` : n; };
const REVUES_URL = 'https://le-radar.ca/revues/';
const clip = (s, n) => { const t = String(s || '').trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

function articlePage(it, i, total, model) {
  const img = it.image ? `<div class="li-photo"><img src="${esc(it.image)}" alt="" />${it.credit ? `<span class="li-credit">${esc(it.credit)}</span>` : ''}</div>` : '';
  const kicker = [it.theme, it.source, it.institution].filter(Boolean).map(esc).join(' · ');
  const text = it.resume || it.excerpt || '';
  return `<section class="li-page li-article${img ? '' : ' li-article--noimg'}">
  <header class="li-top">${BRAND_SM}<span class="li-count">${i + 1} / ${total}</span></header>
  ${img}
  <div class="li-body">
    <p class="li-kicker">${kicker}</p>
    <h2 class="li-title">${esc(clip(it.title, 140))}</h2>
    <p class="li-byline">${authorsOf(it) ? `Par ${esc(authorsOf(it))} · ` : ''}${esc(it.source || '')}</p>
    ${text ? `<p class="li-text">${esc(clip(text, 230))}</p>` : ''}
  </div>
  <footer class="li-foot"><p>${esc(model.edition?.label || 'La revue')} · ${esc(frDate(model.edition?.day))}</p>${creditsLine()}</footer>
</section>`;
}

function renderLinkedInCarousel(model = {}) {
  const items = (model.items || []).slice(0, MAX_ARTICLES);
  const lead = items[0] || {};
  const cover = model.image?.url || lead.image || '';
  // Ordre déjà décidé par scripts/revue/revue-social-pick.mjs (popularité). Voile : toujours montrée, hors plafond.
  const isSail = (g) => g?.sportKey === 'sailing' || /^voile\b/i.test(String(g?.sport || '')) || String(g?.kind || '').startsWith('regatta');
  const allSports = [...(model.sports?.results || []).slice(0, 2), ...(model.sports?.next || [])];
  const sports = [...allSports.filter(isSail), ...allSports.filter((g) => !isSail(g)).slice(0, 5)];
  const shows = (model.radio || []).flatMap((r) => (r.shows || []).slice(0, 1).map((s) => ({ station: r.station, ...s }))).slice(0, 4);
  // Deux lignes : sport et équipes, puis date, heure et lieu (salle RSEQ, sinon « Chez les … » comme la story Jour de match).
  const sportLine = (g) => {
    const t = g.teams || [];
    const who = (x) => `${x.name}${x.inst ? ` (${x.inst})` : ''}`;
    const scored = t.length === 2 && t[0].score != null && t[1].score != null;
    const vs = t.length === 2 ? (scored ? `${who(t[0])} ${t[0].score}-${t[1].score} ${who(t[1])}` : `${who(t[0])} vs ${who(t[1])}`) : (g.title || g.text || '');
    // « A reçoit B » : A à domicile ; « A visite B » : B à domicile. Toujours « Chez les … », puis la salle si connue.
    const home = t.length === 2 ? (g.verb === 'visite' ? t[1] : t[0]) : null;
    const where = [home ? `Chez les ${home.name}` : '', g.venue || ''].filter(Boolean).join(' · ');
    return `<span class="li-l1">${esc(`${g.emoji || ''} ${g.sport || ''} · ${vs}`.trim())}</span><span class="li-l2">${esc([g.when, where].filter(Boolean).join(' · '))}</span>`;
  };
  const total = items.length;
  const pages = [
    `<section class="li-page li-cover">
  ${cover ? `<img class="li-cover__img" src="${esc(cover)}" alt="" />` : ''}
  <div class="li-cover__shade"></div>
  <div class="li-cover__content">
    <div class="li-brand"><img src="/assets/icon-512.png" alt="" /><span>LE\u2011RADAR.ca</span></div>
    <p class="li-edition">${esc(model.edition?.emoji || '')} ${esc(model.edition?.label || 'La revue')}</p>
    <p class="li-date">${esc(frDate(model.edition?.day))}</p>
    ${lead.title ? `<p class="li-lead-k">À la une · ${esc(lead.source || '')}</p><h1 class="li-lead">${esc(clip(lead.title, 120))}</h1>` : ''}
    <p class="li-swipe">${model.totalItems > total ? `${total} articles choisis parmi les ${model.totalItems} de la revue` : `${total} article${total > 1 ? 's' : ''} des médias étudiants du Québec`} · glissez →</p>
  </div>
  ${model.image?.credit ? `<span class="li-credit li-credit--cover">${esc(model.image.credit)}</span>` : ''}
  ${creditsLine('li-credits--cover')}
</section>`,
    ...items.map((it, i) => articlePage(it, i, total, model)),
    `<section class="li-page li-end">
  <header class="li-top">${BRAND_SM}<span class="li-count">Et aussi</span></header>
  <div class="li-end__body">
  ${sports.length ? `<h2 class="li-h">🏟️ Sport étudiant</h2><ul class="li-list li-list--2l">${sports.map((g) => `<li${isSail(g) ? ' data-keep="1"' : ''}>${sportLine(g)}</li>`).join('')}</ul>` : ''}
  ${shows.length ? `<h2 class="li-h">📻 Radios étudiantes</h2><ul class="li-list">${shows.map((s) => `<li><b>${esc(fmLabel(s.station))}</b> · ${esc(s.title)} · ${esc(s.when || '')}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="li-cta"><p>Toutes les revues, avec les liens vers chaque média :</p><p class="li-url">${esc(REVUES_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</p></div>
  <footer class="li-foot"><p>Journaux, radios et sports étudiants du Québec, réunis au même endroit</p>${sports.length ? `<p class="li-datasrc">${sports.some((g) => g.venue) ? 'Calendrier et salles' : 'Calendrier'} : RSEQ. Horaires : stations de radio étudiantes.</p>` : ''}${creditsLine()}</footer>
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
.li-top { position: absolute; top: 44px; left: 64px; right: 64px; display: flex; align-items: center; justify-content: space-between; font: 700 26px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: #555; z-index: 2; }
.li-brand-sm { display: flex; align-items: center; gap: 12px; font: 700 34px/1 var(--serif); letter-spacing: -0.02em; text-transform: none; color: var(--ink); }
.li-brand-sm img { width: 44px; height: 44px; border-radius: 10px; }
.li-foot { position: absolute; left: 64px; right: 64px; bottom: 36px; font: 600 24px/1.3 var(--sans); color: #666; border-top: 3px solid var(--ink); padding-top: 16px; }
.li-credits, .li-datasrc { margin-top: 8px; font: 400 17px/1.35 var(--sans); color: #777; }
.li-credits--cover { position: absolute; left: 64px; right: 300px; bottom: 26px; margin: 0; color: rgba(255,255,255,.75); z-index: 2; }
.li-cl { display: inline-block; transform: scaleX(-1); }
.li-credit { position: absolute; right: 16px; bottom: 12px; font: 400 18px/1.2 var(--sans); color: #fff; background: rgba(0,0,0,.55); padding: 4px 10px; border-radius: 6px; }
/* Couverture */
.li-cover { background: #111; color: #fff; }
.li-cover__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.li-cover__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 35%, rgba(0,0,0,.85) 72%); }
.li-cover__content { position: absolute; inset: 64px 64px 120px; display: flex; flex-direction: column; }
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
.li-body { position: absolute; top: 776px; left: 64px; right: 64px; bottom: 150px; display: flex; flex-direction: column; }
.li-article--noimg .li-body { top: 150px; }
.li-kicker { font: 700 26px/1.2 var(--sans); letter-spacing: .06em; text-transform: uppercase; color: var(--accent); }
.li-title { margin-top: 14px; font: 700 50px/1.1 var(--serif); }
.li-article--noimg .li-title { font-size: 72px; }
.li-byline { margin-top: 16px; font: 600 26px/1.3 var(--sans); color: #444; }
.li-text { margin-top: 18px; font: 400 30px/1.4 var(--sans); color: #222; }
/* Page finale */
.li-end__body { position: absolute; top: 118px; left: 0; right: 0; bottom: 400px; overflow: hidden; }
.li-end .li-h { margin: 30px 64px 0; font: 700 46px/1.1 var(--serif); }
.li-end .li-h + .li-list + .li-h { margin-top: 40px; }
.li-list { list-style: none; margin: 20px 64px 0; }
.li-list li { font: 400 28px/1.35 var(--sans); padding: 12px 0; border-bottom: 2px dotted #bbb; }
.li-list--2l li { padding: 10px 0; }
.li-l1, .li-l2 { display: block; }
.li-l1 { font: 600 28px/1.3 var(--sans); }
.li-l2 { margin-top: 2px; font: 400 24px/1.3 var(--sans); color: #555; }
.li-cta { position: absolute; left: 64px; right: 64px; bottom: 190px; background: var(--ink); color: #fff; border-radius: 18px; padding: 34px 38px; }
.li-cta p { font: 600 30px/1.35 var(--sans); }
.li-cta .li-url { margin-top: 10px; font: 700 46px/1.1 var(--serif); color: #f3c1e3; }
</style></head>
<body>
${pages.join('\n')}
</body></html>`;
}

/**
 * Textes alternatifs des pages, dans l'ordre du carrousel (couverture, articles, page finale). Servent aux images
 * du carrousel Facebook et Instagram (revue/<id>/carrousel-<n>.jpg), qui reprennent ces mêmes pages.
 */
function carouselAlts(model = {}) {
  const items = (model.items || []).slice(0, MAX_ARTICLES);
  const ed = `${model.edition?.label || 'La revue'} du Radar, ${frDate(model.edition?.day)}`;
  const lead = items[0];
  return [
    `Couverture : ${ed}.${lead?.title ? ` À la une : ${lead.title} (${lead.source || ''}).` : ''} ${items.length} article${items.length > 1 ? 's' : ''} des médias étudiants du Québec.`,
    ...items.map((it, i) => `Article ${i + 1} sur ${items.length} : ${it.title}. ${authorsOf(it) ? `Par ${authorsOf(it)}, ` : ''}${it.source || ''}.${it.resume || it.excerpt ? ' ' + clip(it.resume || it.excerpt, 230) : ''}`),
    `Et aussi : sport étudiant et radios étudiantes. Toutes les revues sur ${REVUES_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}.`,
  ].map((s) => s.replace(/\s+/g, ' ').trim());
}

module.exports = { renderLinkedInCarousel, carouselAlts, MAX_ARTICLES, W, H, REVUES_URL };

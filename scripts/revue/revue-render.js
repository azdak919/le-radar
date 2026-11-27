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
const { renderPage, escapeHtml, T: SITE_T, BRAND_SIGNATURE, CONTACT_MAIL } = require('../seo-pages-lib');
// Nayuki QR Code generator (licence MIT, compatible AGPLv3), déjà vendu dans le dépôt pour les affiches.
const qrcodegen = require('../vendor/qrcodegen-v1.8.0.js');
const IC = require('../institution-color-lib.js');
const { gamesFor } = require('./revue-games.js');

const ROOT = path.join(__dirname, '..', '..');
const SITE = (process.env.RADAR_SITE_URL || 'https://le-radar.ca').replace(/\/$/, '');
const PUBLISHER = 'Le Radar';
const CONFIG_PATH = path.join(ROOT, 'data/revue/config.json');
const INDEX_PATH = path.join(ROOT, 'data/revue/index.json');
const REVIEWS_DIR = path.join(ROOT, 'data/revue/reviews');
const NEWS_SITEMAP = 'sitemap-news.xml';
const EXT = ' target="_blank" rel="noopener noreferrer"';

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const BRAND = readJson(path.join(ROOT, 'brand-colors.json'), {}).institutions || {};
/**
 * Couleur d'établissement du nom du média, comme dans La une : couleur de brand-colors.json (mêmes alias), foncée
 * au besoin jusqu'à 4,6:1 sur papier blanc (lisible à l'écran comme à l'impression). Inconnue → couleur normale.
 */
function mediaColor(inst) {
  const raw = String(inst || '').trim();
  const c = raw && (IC.institutionColor(raw, BRAND) || IC.institutionColor(raw.replace(/\s*\([^)]*\)\s*$/, ''), BRAND));
  return c ? IC.aaColor(c, ['#ffffff']) : '';
}
const RADIOS = (() => { const r = readJson(path.join(ROOT, 'radios.json'), []); return Array.isArray(r) ? r : (r.stations || Object.values(r)); })();
/** Couleur d'établissement d'une station (radios.json → brand-colors.json), comme les noms de médias. */
function stationStyle(id, name) {
  const st = RADIOS.find(x => x && (x.id === id || (name && x.name === name)));
  const c = st ? mediaColor(st.institution) : '';
  return c ? ` style="--inst:${c}"` : '';
}
/**
 * Ligne de station : « CFAK 88,3 FM » (indicatif + fréquence de radios.json) puis la ville en petit (la zone de
 * couverture n'est pas vérifiée dans les données). Sans fréquence hertzienne (ex. « Web ») → le nom seul.
 */
function stationLabel(id, name) {
  const st = RADIOS.find(x => x && (x.id === id || (name && x.name === name)));
  const f = String(st?.frequency || '').trim();
  if (!/^\d[\d,]*\s*(FM|AM)$/i.test(f)) return { name: String(name || ''), city: '' };
  const call = String(name || st.name || '').trim().split(/\s+/)[0];
  return { name: `${call} ${f}`, city: String(st.city || '').trim() };
}
function mediaName(source, inst, cls = 'notranslate') {
  const c = mediaColor(inst);
  return `<span class="${cls}${c ? ' revue-inst-c' : ''}" translate="no"${c ? ` style="--inst:${c}"` : ''}>${esc(source)}</span>`;
}
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
/** Dans un thème : un titre par média (le plus récent), puis les suivants par date. */
function themePassOrder(list) {
  const sorted = [...list].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const seen = new Set();
  const first = [];
  const rest = [];
  for (const x of sorted) {
    const src = String(x.source || '').trim();
    if (seen.has(src)) rest.push(x);
    else { seen.add(src); first.push(x); }
  }
  return [...first, ...rest];
}
function groupByTheme(items) {
  const m = new Map();
  for (const x of items) { const k = THEME_ORDER.includes(x.theme) ? x.theme : 'Vie de campus'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].map(([theme, list]) => ({ theme, emoji: THEME_EMOJI[theme] || '📰', items: themePassOrder(list) }))
    .sort((a, b) => (a.theme === 'Vie de campus') - (b.theme === 'Vie de campus') || b.items.length - a.items.length || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme));
}
const slug = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function authorsLine(a = []) { return a.length ? (a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} et ${a.at(-1)}`) : ''; }
/** « Université de Sherbrooke (UdeS) » (revues générées avant le sigle seul) → « UdeS » ; sinon inchangé. */
const instShort = (s) => { const m = String(s || '').match(/^.+\(([^()]+)\)\s*$/); return (m ? m[1] : String(s || '')).trim(); };
/** Émoji décoratif : visible à l'écran, retiré à l'impression (un journal imprimé n'en met pas). */
const emo = (e) => (e ? `<span class="revue-emoji" aria-hidden="true">${e}</span> ` : '');
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Photo de l'article (miroir du Radar seulement : même politique d'images que le site) ; '' sinon. */
function itemPhoto(x) {
  const u = String(x.image || '').trim();
  if (/^assets\//.test(u)) return `${SITE}/${u}`;
  return u.startsWith(`${SITE}/assets/`) ? u : '';
}
/** Vignette comme sur l'accueil : photo entière (jamais rognée), crédit discret. */
function itemFig(src, credit, rank, big = false) {
  return `            <figure class="revue-item__fig${big ? ' revue-item__fig--big' : ''}" data-photo="${rank}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" />${credit ? `<figcaption>${esc(credit)}</figcaption>` : ''}</figure>`;
}
function itemHtml(x, leadId = '', photo = null) {
  const lang = x.lang === 'en' ? ' lang="en"' : '';
  const when = `${frShort(mtlParts(x.date).ymd)} · ${frClock(x.date)}`;
  const authors = authorsLine(x.authors || []);
  const text = x.resume
    ? `<p class="revue-item__resume" data-texte="ia">${esc(x.resume)}</p>`
    : (x.excerpt ? `<blockquote class="revue-item__excerpt" data-texte="extrait"${lang} cite="${esc(x.link)}"><p>« ${esc(x.excerpt)} »</p></blockquote>` : '');
  return [
    `          <li class="revue-item${photo ? ' revue-item--photo' : ''}" id="a-${esc(x.id)}"${x.id === leadId ? ' data-une="1"' : ''}>`,
    photo ? itemFig(photo.src, String(x.credit || '').trim(), photo.rank, photo.big) : '',
    `            <p class="revue-item__media">${mediaName(x.source, x.institution)}${x.institution ? ` · <span class="revue-item__inst">${esc(instShort(x.institution))}</span>` : ''}</p>`,
    `            <h4 class="revue-item__title"><a href="${esc(x.link)}"${EXT}${lang}>${x.sport ? emo(esc(x.sport)) : ''}${esc(x.title)}</a></h4>`,
    `            <p class="revue-item__byline">${authors ? `Par <span class="notranslate" translate="no">${esc(authors)}</span> · ` : ''}<time datetime="${esc(isoMtl(x.date))}">${esc(when)}</time></p>`,
    text ? `            ${text}` : '',
    `            <p class="revue-item__more"><a href="${esc(x.link)}"${EXT}>Lire l’article sur <span class="notranslate" translate="no">${esc(x.source)}</span> <span aria-hidden="true">↗</span></a></p>`,
    '          </li>',
  ].filter(Boolean).join('\n');
}
function presseHtml(model) {
  const groups = groupByTheme(model.items);
  const leadId = leadOf(model)?.id || '';
  // Une photo n'apparaît qu'une fois (la photo de la une, puis chaque image dans l'ordre de lecture) ; rang = data-photo.
  const seen = new Set([model.image?.url].filter(Boolean)), photos = new Map();
  for (const g of groups) {
    let first = true;
    for (const x of g.items) {
      const src = itemPhoto(x);
      if (x.id === leadId || !src || seen.has(src)) continue;
      seen.add(src); photos.set(x.id, { src, rank: photos.size + 1, big: first }); first = false;
    }
  }
  return [
    '      <section class="seo-section revue-section" id="presse" aria-labelledby="presse-titre">',
    `        <h2 id="presse-titre">${emo('📰')}Revue de presse</h2>`,
    ...groups.map((g) => [
      // Thème qui ne contient que l'article à la une : à l'impression, l'article est déjà en tête de page.
      `        <h3 class="revue-theme" id="theme-${slug(g.theme)}"${g.items.every((x) => x.id === leadId) ? ' data-une="1"' : ''}>${emo(g.emoji)}${esc(g.theme)}</h3>`,
      '        <ol class="revue-items">',
      ...g.items.map((x) => itemHtml(x, leadId, photos.get(x.id))),
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
    `        <h2 id="radio-titre">${emo('📻')}À l’écoute sur les radios étudiantes</h2>`,
    rows.length
      ? `        <p class="seo-section__lead">Émissions originales prévues ${window} le ${esc(frDayYear(model.edition.day))}, selon les grilles publiées par les stations (heure de Montréal).</p>`
      : `        <p class="seo-section__lead">Aucune émission originale n’est inscrite aux grilles des radios étudiantes pour cette période. <a href="${SITE}/horaires/">Voir toutes les grilles</a>.</p>`,
    ...rows.map((st) => [
      `        <h3 class="revue-station"><a href="${esc(st.page)}" class="notranslate${stationStyle(st.id, st.station) ? ' revue-inst-c' : ''}" translate="no"${stationStyle(st.id, st.station)}>${esc(stationLabel(st.id, st.station).name)}</a>${stationLabel(st.id, st.station).city ? ` <span class="revue-station__city">· ${esc(stationLabel(st.id, st.station).city)}</span>` : ''}</h3>`,
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
  for (const r of results) { const k = `${r.uni ? 'u' : 'c'}|${r.emoji} ${r.sport}`; if (!groups.has(k)) groups.set(k, { emoji: r.emoji, label: r.sport, uni: r.uni, items: [] }); groups.get(k).items.push(r); }
  const days = new Map();
  for (const r of next) { if (!days.has(r.date)) days.set(r.date, []); days.get(r.date).push(r); }
  const NEXT_LIMIT = 12;
  const flat = [];
  for (const [d, list] of days) for (const r of list) flat.push({ d, r });
  const shown = flat.slice(0, NEXT_LIMIT);
  const rest = Math.max(0, flat.length - shown.length);
  const nextBlock = () => {
    const o = ['        <h3 class="revue-sub">Prochains matchs</h3>'];
    if (!next.length) o.push('        <p class="revue-empty">Aucun match étudiant inscrit au calendrier pour les prochains jours.</p>');
    const byDay = new Map();
    for (const { d, r } of shown) { if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }
    for (const [d, list] of byDay) {
      o.push(`        <h4 class="revue-day">${esc(cap(frDayYear(d)))}</h4>`, '        <ul class="revue-next">');
      for (const r of list) o.push(`          <li>${r.time ? `<time>${esc(r.time.replace(/^0/, '').replace(':00', ' h').replace(':', ' h '))}</time> ` : ''}<span class="revue-sportname">${emo(esc(r.emoji))}${esc(r.sport)}</span> · <span class="notranslate" translate="no">${esc(r.text)}</span></li>`);
      o.push('        </ul>');
    }
    return o;
  };
  const refreshed = model.refreshedAt ? ` Résultats mis à jour le ${esc(frDayYear(mtlParts(model.refreshedAt).ymd))} à ${esc(frClock(model.refreshedAt))}.` : '';
  const out = [
    '      <section class="seo-section revue-section" id="sport" aria-labelledby="sport-titre">',
    `        <h2 id="sport-titre">${emo('🏟️')}Sport étudiant</h2>`,
  ];
  out.push('        <h3 class="revue-sub">Résultats</h3>');
  if (!results.length) out.push(`        <p class="revue-empty">Aucun nouveau résultat sportif étudiant pour cette période.${refreshed}</p>`);
  else {
    out.push(`        <p class="seo-section__lead">Tous les résultats connus du sport étudiant (RSEQ, U SPORTS et ligues étudiantes), universitaire d’abord.${refreshed}</p>`);
    for (const g of groups.values()) {
      out.push(`        <h4 class="revue-sport">${emo(esc(g.emoji))}${esc(g.label)} <span class="revue-level">${g.uni ? 'universitaire' : 'collégial'}</span></h4>`, '        <ul class="revue-results">');
      for (const r of g.items) out.push(`          <li><span class="revue-score notranslate" translate="no">${esc(r.text)}</span> <span class="revue-league">${esc([r.league, r.when].filter(Boolean).join(' · '))}</span></li>`);
      out.push('        </ul>');
    }
  }
  out.push(...nextBlock());
  out.push(rest
    ? `        <p class="revue-more">${rest} autres matchs au calendrier : <a href="${SITE}/sports/">le-radar.ca/sports</a></p>`
    : `        <p class="revue-more"><a href="${SITE}/sports/">Tableau complet du sport étudiant</a></p>`, '      </section>');
  return out.join('\n');
}
function sourcesHtml(model) {
  const media = [...new Set(model.items.map((x) => x.source))].sort((a, b) => a.localeCompare(b, 'fr'));
  const ai = String(model.generator || '').startsWith('ia:');
  return [
    '      <section class="seo-section revue-section revue-sources" id="sources" aria-labelledby="sources-titre">',
    '        <h2 id="sources-titre">Sources et méthode</h2>',
    media.length
      ? `        <p>Médias cités : <span class="notranslate" translate="no">${esc(media.join(', '))}</span>. Chaque article appartient à son média et à ses auteurs ; les titres sont ceux des articles originaux, dans leur langue.</p>`
      : `        <p>Aucun nouvel article des médias étudiants pour cette période : cette édition reprend les grilles des radios étudiantes et le calendrier du sport étudiant. La photo de couverture est une photo libre de campus (Wikimedia Commons).</p>`,
    !media.length ? '' : `        <p>${ai ? `Les résumés d’une phrase sont rédigés par une IA ouverte (${esc(String(model.generator).slice(3))}, Cloudflare Workers AI) à partir du titre et de l’extrait de chaque article, puis vérifiés automatiquement : un résumé qui contient un chiffre, un nom ou une date absents de la source est remplacé par un court extrait de l’article.` : 'Cette édition reprend un court extrait de chaque article, sans résumé rédigé par IA.'} Les liens, les auteurs, les grilles de radio et les résultats sportifs viennent directement des données du Radar et sont contrôlés avant publication.</p>`,
    `        <p class="revue-nav">${model.previous ? `<a href="${esc(SITE + '/' + model.previous.path)}" rel="prev">← ${esc(model.previous.headline)}</a> · ` : ''}<a href="${SITE}/revues/">Toutes les revues</a> · <a href="${SITE}/revues/feed.xml">Flux RSS des revues</a></p>`,
    '      </section>',
  ].filter(Boolean).join('\n');
}
/** « Photo : Jane Doe · Le Délit, « Titre » » ; le média n'est pas répété si le crédit le nomme déjà. */
function coverCaption(img) {
  if (img.campus) return `${String(img.credit || '').trim()}, « ${img.title} »`;
  const credit = String(img.credit || '').trim();
  const src = credit && credit.toLowerCase().includes(String(img.source).toLowerCase()) ? '' : img.source;
  return `${credit}${credit && src ? ' · ' : ''}${src}${credit || src ? ', ' : ''}« ${img.title} »`;
}
/** Corps de l'article (aussi repris tel quel, sans la chrome, dans le flux RSS). */
/** Mention de transparence, discrète, en pied d'article (une seule phrase). */
const DISCLOSURE = 'Revue préparée automatiquement par Le Radar à partir des sources citées ; chaque texte, titre et photo appartient à son média et à ses auteurs.';
/** Article à la une : le plus récent de la fenêtre (premier de la liste plate, classée par date). */
function leadOf(model) { return (model.items || [])[0] || null; }
const hhmm = (t) => String(t || '').replace(/^0/, '').replace(':00', ' h').replace(':', ' h ');
/**
 * Manchette imprimée (cachée à l'écran, où le mât du site et le titre h1 font ce travail) : logo du Radar à gauche du
 * mot-symbole, puis la ligne de folio (édition, date, heure de publication). Vide de tout lien et de tout contrôle.
 */
function flagHtml(model) {
  const pub = model.datePublished;
  const ed = model.edition.id === 'soir' ? 'La revue du soir' : 'La revue du matin';
  return [
    '      <header class="revue-flag" aria-hidden="true">',
    '        <p class="revue-flag__ears"><span>Revue de presse <em class="revue-flag__etudiante">étudiante</em></span><span>Gratuit · le-radar.ca/revue</span></p>',
    '        <p class="revue-flag__brand"><img class="revue-flag__logo" src="../../assets/icon.svg" width="44" height="44" alt="" /><span class="revue-flag__name notranslate" translate="no">LE-RADAR.ca</span></p>',
    '        <p class="revue-flag__devise">Médias, radios et sport étudiants du Québec</p>',
    `        <p class="revue-flag__folio"><span class="revue-flag__ed">${ed}</span><span class="revue-flag__date">${esc(cap(frDayYear(model.edition.day)))}</span><span class="revue-flag__time">Publiée à ${esc(frClock(pub))}, heure de Montréal${weatherLine(model, 'revue-wx--flag')}</span></p>`,
    '      </header>',
  ].filter(Boolean).join('\n');
}
/** Bloc « À la une » imprimé : surtitre, grand titre, signature (tous les auteurs) ; le texte suit la photo. */
function uneHead(x) {
  if (!x) return '';
  const lang = x.lang === 'en' ? ' lang="en"' : '';
  const authors = authorsLine(x.authors || []);
  return [
    '        <div class="revue-une" aria-hidden="true">',
    `          <p class="revue-une__kicker">À la une · ${mediaName(x.source, x.institution)}${x.institution ? ` · ${esc(instShort(x.institution))}` : ''}</p>`,
    `          <p class="revue-une__title"${lang}><a href="${esc(x.link)}" tabindex="-1"${EXT}>${x.sport ? `${emo(esc(x.sport))}` : ''}${esc(x.title)}</a></p>`,
    `          <p class="revue-une__byline">${authors ? `Par <span class="notranslate" translate="no">${esc(authors)}</span> · ` : ''}${esc(frShort(mtlParts(x.date).ymd))}, ${esc(frClock(x.date))}</p>`,
    '        </div>',
  ].join('\n');
}
function uneText(x) {
  if (!x) return '';
  const lang = x.lang === 'en' && !x.resume ? ' lang="en"' : '';
  const t = x.resume || (x.excerpt ? `« ${x.excerpt} »` : '');
  return t ? `        <p class="revue-une__text" aria-hidden="true"${lang}>${esc(t)}</p>` : '';
}
/** Encadré des grands formats (Legal, Tabloïd, A3) : sport (une régate si l'édition en a une) et radio en bref. */
function encadreHtml(model) {
  const { results = [], next = [] } = model.sports || {};
  const sailing = (r) => r.kind === 'classement' || /^(sailing|voile)$/i.test(String(r.sportKey || ''));
  const res = results.slice(0, 4);
  const sail = results.find(sailing);
  if (sail && !res.includes(sail)) res.splice(res.length - 1, 1, sail);
  const sport = res.length
    ? res.map((r) => `            <li><b>${emo(esc(r.emoji))}${esc(r.sport)}</b> <span class="notranslate" translate="no">${esc(r.text)}</span></li>`)
    : next.slice(0, 4).map((r) => `            <li><b>${esc(frShort(r.date))}${r.time ? `, ${esc(hhmm(r.time))}` : ''}</b> ${emo(esc(r.emoji))}${esc(r.sport)} · <span class="notranslate" translate="no">${esc(r.text)}</span></li>`);
  const shows = (model.radio || []).flatMap((st) => st.shows.map((s) => ({ ...s, station: st.station, stationId: st.id })))
    .sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, 4);
  if (!sport.length && !shows.length) return '';
  return [
    '        <aside class="revue-encadre" aria-hidden="true">',
    '          <p class="revue-encadre__head">En bref</p>',
    sport.length ? `          <p class="revue-encadre__sub">${res.length ? 'Sport étudiant : résultats' : 'Sport étudiant : prochains matchs'}</p>\n          <ul>\n${sport.join('\n')}\n          </ul>` : '',
    shows.length ? `          <p class="revue-encadre__sub">À l’antenne, ${esc(frShort(model.edition.day))}</p>\n          <ul>\n${shows.map((s) => `            <li><b>${esc(hhmm(s.start))}</b> <span class="notranslate${stationStyle(s.stationId, s.station) ? ' revue-inst-c' : ''}" translate="no"${stationStyle(s.stationId, s.station)}>${esc(s.station)}</span> · ${esc(s.title)}</li>`).join('\n')}\n          </ul>` : '',
    '          <p class="revue-encadre__more">Tous les résultats et les grilles, plus loin dans cette édition.</p>',
    '        </aside>',
  ].filter(Boolean).join('\n');
}
/** Code QR en SVG (modules noirs, marge de 2 modules), sans script ni image externe. */
function qrSvg(text) {
  const qr = qrcodegen.QrCode.encodeText(String(text), qrcodegen.QrCode.Ecc.MEDIUM);
  const n = qr.size, b = 2, d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.getModule(x, y)) d.push(`M${x + b},${y + b}h1v1h-1z`);
  return `<svg class="revue-colophon__qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * b} ${n + 2 * b}" shape-rendering="crispEdges" role="img" aria-label="Code QR"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${d.join('')}"/></svg>`;
}
function qrLinkHtml(model, cls = 'revue-top__qr', svgClass = 'revue-top__qrcode') {
  if (!model.url) return '';
  return `        <a class="${cls}" href="${esc(model.url)}" tabindex="-1">${qrSvg(model.url).replace('revue-colophon__qr', svgClass)}<span>Lire en ligne</span></a>`;
}
function pdfDownloadName(id, file) {
  const stem = String(file).replace(/\.pdf$/i, '');
  return `le-radar-revue-${id}-${stem}.pdf`;
}
const REPO = 'github.com/azdak919/le-radar';
/**
 * Colophon imprimé (caché à l'écran, où le pied du site fait ce travail) : à la fin de l'édition seulement, dans le
 * flux des colonnes, il comble la fin de la dernière page. Tout est écrit en clair (un lien ne se clique pas sur papier).
 */
/* Petite météo de la manchette (ECCC, lue à la production de l'édition) : Québec et Montréal seulement.
 * Le grand bloc (villes universitaires, Nunavik, Eeyou Istchee) est rendu par meteoHtml, plus bas. Sans données → rien. */
function wxEmoji(icon) {
  const n = Number(icon);
  if ([19, 39, 46, 47, 48].includes(n)) return '⛈️';
  if ([23, 24, 44, 45].includes(n)) return '🌫️';
  if ([7, 8, 14, 15, 16, 17, 18, 25, 26, 27, 37, 38, 40, 41].includes(n)) return '🌨️';
  if ([6, 9, 11, 12, 13, 28, 36].includes(n)) return '🌧️';
  if ([10].includes(n)) return '☁️';
  if ([2, 3, 4, 5, 22, 32, 33, 34, 35].includes(n)) return '⛅';
  if ([30, 31].includes(n)) return '🌙';
  if ([0, 1, 20, 21].includes(n)) return '☀️';
  return '';
}
function weatherLine(model, cls) {
  const cities = (model.weather?.cities || []).filter(c => c && (c.name === 'Québec' || c.name === 'Montréal') && c.periods?.[0] && Number.isFinite(c.periods[0].temp)).slice(0, 2);
  if (!cities.length) return '';
  const bits = cities.map((c) => {
    const p = c.periods[0];
    const e = wxEmoji(p.icon);
    return `<span class="revue-wx__city" title="${esc(p.name)} : ${esc(p.sky)}">${e ? emo(e) : ''}${esc(String(p.temp).replace('-', '−'))}°&#8239;${esc(c.name)}</span>`;
  });
  return `<span class="revue-wx ${cls}">${bits.join(' · ')}</span>`;
}

const minus = (n) => String(n).replace('-', '−');
function meteoCell(p, head) {
  if (!p) return '<td></td>';
  const label = p.name === head ? '' : `<span class="revue-meteo__when">${esc(p.name)}</span> `;
  return `<td>${label}<b>${p.kind === 'low' ? 'min' : 'max'} ${esc(minus(p.temp))}°</b> ${esc(p.sky)}${p.pop ? ` · ${p.pop} %` : ''}</td>`;
}
/** Grand bloc météo ECCC (imprimé seulement). Sans données → rien. Les groupes sans ville sont omis. */
function meteoHtml(model) {
  const w = model.weather;
  const cities = Array.isArray(w?.cities) ? w.cities.filter(c => c && c.name && Array.isArray(c.periods) && c.periods.length) : [];
  if (!cities.length) return '';
  const [h1 = '', h2 = ''] = (cities[0].periods || []).map(p => p.name);
  const rows = (group) => cities.filter(c => c.group === group)
    .map(c => `              <tr><th scope="row">${esc(c.name)}</th>${meteoCell(c.periods[0], h1)}${meteoCell(c.periods[1], h2)}</tr>`).join('\n');
  const table = (group, title) => {
    const r = rows(group);
    return r ? [
      '          <table class="revue-meteo__table">',
      `            <thead><tr class="revue-meteo__group"><th>${esc(title)}</th><th>${esc(h1)}</th><th>${esc(h2)}</th></tr></thead>`,
      `            <tbody>\n${r}\n            </tbody>`,
      '          </table>',
    ].join('\n') : '';
  };
  const campus = table('campus', 'Villes universitaires');
  const north = [table('nunavik', 'Nunavik'), table('eeyou', 'Eeyou Istchee')].filter(Boolean).join('\n');
  return [
    '        <section class="seo-section revue-section revue-meteo" id="meteo">',
    `          <h2>${emo('☀️')}Météo</h2>`,
    '          <div class="revue-meteo__grid">',
    campus,
    north ? `          <div class="revue-meteo__north">\n${north}\n          </div>` : '',
    '          </div>',
    `          <p class="revue-meteo__src">Prévisions publiques d’${esc(w.source || 'Environnement et Changement climatique Canada')}, lues à la production de cette édition.</p>`,
    '        </section>',
  ].filter(Boolean).join('\n');
}
const sudokuTable = (cells, cls) => `<table class="${cls}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(r => `<tr>${cells.slice(r * 9, r * 9 + 9).map(v => `<td>${v || ''}</td>`).join('')}</tr>`).join('')}</table>`;
const lettersTable = (grid, cls) => `<table class="${cls}">${grid.map(row => `<tr>${row.map(ch => `<td>${ch || ''}</td>`).join('')}</tr>`).join('')}</table>`;
/** Sudoku et mots cachés de l'édition (déterministes), solutions à la fin, en petit et à l'envers. */
function jeuxHtml(model) {
  let g;
  try { g = gamesFor(model); } catch { return { jeux: '', solutions: '' }; }
  const parts = [];
  if (g.words) parts.push([
    '          <div class="revue-jeu revue-jeu--mots">',
    '            <h4 class="revue-jeu__title">Mots cachés</h4>',
    '            <p class="revue-jeu__rule">Tous tirés des titres de cette édition, dans tous les sens.</p>',
    `            ${lettersTable(g.words.grid, 'revue-mots')}`,
    `            <p class="revue-mots__list">${g.words.words.map(esc).join(' · ')}</p>`,
    '          </div>',
  ].join('\n'));
  if (g.sudoku) parts.push([
    '          <div class="revue-jeu revue-jeu--sudoku">',
    '            <h4 class="revue-jeu__title">Sudoku</h4>',
    '            <p class="revue-jeu__rule">Chaque ligne, colonne et carré de 3 × 3 contient les chiffres de 1 à 9.</p>',
    `            ${sudokuTable(g.sudoku.puzzle, 'revue-sudoku')}`,
    '          </div>',
  ].join('\n'));
  if (!parts.length) return { jeux: '', solutions: '' };
  const jeux = ['        <section class="seo-section revue-section revue-jeux" id="jeux">', `          <h2>${emo('🧩')}Jeux</h2>`, ...parts, '        </section>'].join('\n');
  const solutions = [
    '        <section class="revue-solutions" aria-hidden="true">',
    '          <div class="revue-solutions__flip">',
    '            <p class="revue-solutions__title">Solutions</p>',
    g.words ? `            ${lettersTable(g.words.answer, 'revue-mots revue-mots--sol')}` : '',
    g.sudoku ? `            ${sudokuTable(g.sudoku.solution, 'revue-sudoku revue-sudoku--sol')}` : '',
    '          </div>',
    '        </section>',
  ].filter(Boolean).join('\n');
  return { jeux, solutions };
}

function colophonHtml(model) {
  const url = String(model.url || '');
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return [
    '        <aside class="revue-colophon" aria-hidden="true">',
    '          <p class="revue-colophon__brand"><img class="revue-colophon__logo" src="../../assets/icon.svg" width="28" height="28" alt="" /><span class="notranslate" translate="no">LE-RADAR.ca</span></p>',
    `          <p class="revue-colophon__devise">${esc(BRAND_SIGNATURE)}</p>`,
    `          <p class="revue-colophon__text">${esc(SITE_T.fr.unofficial)}</p>`,
    `          <p class="revue-colophon__line"><b>Nous joindre</b> ${esc(CONTACT_MAIL)}</p>`,
    `          <p class="revue-colophon__line"><b>Code libre</b> licence GNU AGPLv3 · ${REPO}</p>`,
    url ? `          <div class="revue-colophon__online"><p><b>Cette édition en ligne</b><br /><a href="${esc(url)}" tabindex="-1">${esc(shortUrl)}</a><br />Toutes les revues : <a href="${SITE}/revues/" tabindex="-1">le-radar.ca/revues</a></p></div>` : `          <p class="revue-colophon__line"><b>En ligne</b> <a href="${SITE}/revues/" tabindex="-1">le-radar.ca/revues</a></p>`,
    `          <p class="revue-colophon__ia">${DISCLOSURE}</p>`,
    '          <p class="revue-colophon__credit">Conçu avec ♡ par Azdak en 2026</p>',
    '        </aside>',
  ].filter(Boolean).join('\n');
}
/**
 * Retire du HTML les liens PDF dont le fichier n'a pas été produit.
 * Une impression ratée ne doit pas laisser un href mort : static-integrity
 * échouerait à chaque poussée.
 */
function syncEditionPdfLinks(dir) {
  const fs = require('fs');
  const path = require('path');
  const htmlPath = path.join(dir, 'index.html');
  if (!fs.existsSync(htmlPath)) return false;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const files = ['lettre.pdf', 'legal.pdf', 'tabloid.pdf', 'a4.pdf', 'a3.pdf'];
  let present = 0;
  for (const file of files) {
    if (fs.existsSync(path.join(dir, file))) { present += 1; continue; }
    html = html.replace(new RegExp(`\\s*<li><a href="${file}"[\\s\\S]*?</a></li>`), '');
  }
  if (!present) html = html.replace(/\s*<div class="revue-pdf">[\s\S]*?<\/div>/, '');
  fs.writeFileSync(htmlPath, html);
  return present;
}

function pdfBarHtml(model = {}) {
  const formats = [
    ['lettre.pdf', 'Lettre'],
    ['legal.pdf', 'Légal'],
    ['tabloid.pdf', 'Tabloïd'],
    ['a4.pdf', 'A4'],
    ['a3.pdf', 'A3'],
  ];
  const items = formats.map(([file, label]) => `        <li><a href="${file}" download="${pdfDownloadName(model.id, file)}">${label}</a></li>`).join('\n');
  return [
    '      <div class="revue-pdf">',
    '        <details class="revue-pdf__box">',
    '          <summary class="revue-pdf__btn">Télécharger le PDF</summary>',
    `          <ul class="revue-pdf__list">\n${items}`,
    '          </ul>',
    '        </details>',
    '      </div>',
  ].join('\n');
}

function articleBody(model) {
  const games = jeuxHtml(model);
  const pub = model.datePublished, mod = model.dateModified;
  const modified = mod && Date.parse(mod) - Date.parse(pub) > 60e3;
  const img = model.image;
  const lead = leadOf(model);
  const quiet = !(model.items || []).length;
  // Sans article : le sport ouvre l'édition s'il a des résultats ou des matchs, sinon la radio.
  const quietSportFirst = !!((model.sports?.results || []).length || (model.sports?.next || []).length);
  // Les enveloppes .revue-top, .revue-top__main, .revue-top__side et .revue-cols sont transparentes à l'écran
  // (display: contents) : elles ne servent qu'à la mise en page du journal imprimé (revue.css, @media print).
  return [
    `      <article class="revue revue--${esc(model.edition.id)}" data-revue="${esc(model.id)}">`,
    flagHtml(model),
    `      <p class="revue-meta">Par <strong>${PUBLISHER}</strong> · Publiée le <time datetime="${esc(isoMtl(pub))}">${esc(frDayYear(mtlParts(pub).ymd))} à ${esc(frClock(pub))}</time>${modified ? ` · Mise à jour à <time datetime="${esc(isoMtl(mod))}">${esc(frClock(mod))}</time>` : ''} (heure de Montréal)${weatherLine(model, 'revue-wx--meta') ? `<br />${weatherLine(model, 'revue-wx--meta')} <span class="revue-wx__src">Environnement Canada</span>` : ''}</p>`,
    pdfBarHtml(model),
    '      <div class="revue-top">',
    '      <div class="revue-top__main">',
    uneHead(lead),
    img ? `      <figure class="revue-cover"${img.stock ? ' data-stock="1"' : ''}><img src="${esc(img.url)}" alt="${esc(img.title)}" loading="eager" decoding="async" /><figcaption>${esc(coverCaption(img))}</figcaption></figure>` : '',
    uneText(lead),
    '      </div>',
    '      <div class="revue-top__side">',
    qrLinkHtml(model),
    `      <p class="seo-lead revue-lede">${esc(model.intro)}</p>`,
    encadreHtml(model),
    '      </div>',
    '      </div>',
    quiet
      ? `      <nav class="revue-toc" aria-label="Sommaire">${quietSportFirst ? '<a href="#sport">🏟️ Sport étudiant</a><a href="#radio">📻 Radio étudiante</a>' : '<a href="#radio">📻 Radio étudiante</a><a href="#sport">🏟️ Sport étudiant</a>'}<a href="#meteo">☀️ Météo</a><a href="#jeux">🧩 Jeux</a><a href="#sources">Sources</a></nav>`
      : '      <nav class="revue-toc" aria-label="Sommaire"><a href="#presse">📰 Revue de presse</a><a href="#radio">📻 Radio étudiante</a><a href="#sport">🏟️ Sport étudiant</a><a href="#meteo">☀️ Météo</a><a href="#jeux">🧩 Jeux</a><a href="#sources">Sources</a></nav>',
    '      <div class="revue-cols">',
    // Sans article : pas de section presse vide ; le sport (matchs à venir d'abord) puis la radio ouvrent l'édition.
    ...(quiet ? (quietSportFirst ? [sportHtml(model), radioHtml(model)] : [radioHtml(model), sportHtml(model)]) : [presseHtml(model), radioHtml(model), sportHtml(model)]), sourcesHtml(model), meteoHtml(model), games.jeux, games.solutions, colophonHtml(model),
    '      </div>',
    `      <p class="revue-disclosure">${DISCLOSURE}</p>`,
    '      </article>',
  ].filter(Boolean).join('\n');
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────
const publisherLd = () => ({
  '@type': 'NewsMediaOrganization', name: PUBLISHER, alternateName: 'LE-RADAR.ca', url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon-512.png`, width: 512, height: 512 },
  sameAs: [
    'https://www.instagram.com/le.radar.ca/', 'https://www.tiktok.com/@leradar.ca',
    'https://www.facebook.com/profile.php?id=61596092762097', 'https://www.threads.com/@le.radar.ca',
    'https://www.linkedin.com/company/le-radar-ca/', 'https://x.com/le_radar_ca',
    'https://bsky.app/profile/le-radar.ca', 'https://qlub.social/@leradar', `${SITE}/feed.xml`,
  ],
});
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
    `    <link rel="alternate" type="application/rss+xml" title="Les revues du Radar" href="${SITE}/revues/feed.xml" />`,
    '',
  ].join('\n');
  return renderPage({
    lang: 'fr', path: model.path, altPath: model.path, title, description: model.description,
    h1: `${model.edition.emoji} ${model.headline}`, eyebrow: 'Revue de presse étudiante',
    crumbs: [{ label: 'Accueil', href: '../../' }, { label: 'Revues', href: '../' }, { label: model.headline }],
    bodyHtml: articleBody(model), jsonLd: jsonForScript(reviewJsonLd(model)), siteBase: SITE, updated: stamp(model.dateModified),
    robots, alternate: false, extraHead: head, extraStyles: ['revue.css'], extraScripts: ['revue-web.js'], wireClass: 'revue-wire', ogType: 'article', ogImage: model.image?.url || null,
  });
}
/** Ordre de publication : la plus récente d'abord (le soir avant le matin d'un même jour). */
const byPublishedDesc = (a, b) => (Date.parse(b.datePublished || 0) - Date.parse(a.datePublished || 0)) || ((b.edition === 'soir' ? 1 : 0) - (a.edition === 'soir' ? 1 : 0));
const editionLabel = (r) => `${r.edition === 'soir' ? '🌙' : '☀️'} ${r.edition === 'soir' ? 'La revue du soir' : 'La revue du matin'}`;
const leadText = (r) => String(r.lead || '').replace(/[.]+$/, '');
const torontoTime = (iso) => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value])); return `${Number(p.hour)} h ${p.minute}`; };
/** Page de redirection d'une ancienne adresse /revue/… vers /revues/… (canonique + refresh + JS, non indexée). */
function legacyRedirectPage(url) {
  const u = esc(url);
  return `<!doctype html>
<html lang="fr-CA"><head><meta charset="utf-8" />
<title>Les revues du Radar</title>
<meta name="robots" content="noindex" />
<link rel="canonical" href="${u}" />
<meta http-equiv="refresh" content="0; url=${u}" />
<script>location.replace(${JSON.stringify(url)} + location.hash);</script>
</head><body><p>Les revues ont déménagé : <a href="${u}">${u}</a></p></body></html>
`;
}

function renderIndexPage(index = []) {
  const byDay = new Map();
  for (const r of index) { if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  // Les revues du jour le plus récent sont mises en évidence en haut ; les archives commencent au jour d'avant.
  const latestDay = days[0];
  const latest = latestDay ? [...byDay.get(latestDay)].sort(byPublishedDesc) : [];
  const featured = latest.length ? [
    `      <section class="seo-section revue-section revue-latest" aria-labelledby="revue-latest-h"><h2 id="revue-latest-h">Les revues du jour · ${esc(frDayYear(latestDay))}</h2>`,
    '        <ul class="revue-latest__list">',
    ...latest.map((r) => `          <li class="revue-latest__item"><a class="revue-latest__link" href="./${esc(r.path.replace(/^revues?\//, ''))}">${editionLabel(r)}</a>${torontoTime(r.datePublished) ? ` <span class="revue-latest__time">publiée à ${esc(torontoTime(r.datePublished))}</span>` : ''}${r.lead ? `<p class="revue-latest__lead">En tête : « ${esc(leadText(r))} »</p>` : ''}</li>`),
    '        </ul>',
    '      </section>',
  ].join('\n') : '';
  const rows = days.slice(1).map((day) => [
    `        <li class="revue-archive__day"><h3>${esc(cap(frDayYear(day)))}</h3><ul>`,
    ...[...byDay.get(day)].sort(byPublishedDesc).map((r) => `          <li><a href="./${esc(r.path.replace(/^revues?\//, ''))}">${editionLabel(r)}</a> ${r.lead ? `<span class="revue-archive__meta">En tête : « ${esc(leadText(r))} »</span>` : ''}</li>`),
    '        </ul></li>',
  ].join('\n'));
  const path_ = 'revues/';
  const title = 'Les revues de presse étudiante du Radar | LE-RADAR.ca';
  const description = 'La revue du matin et la revue du soir : revue de presse des médias étudiants du Québec, radio étudiante et résultats du sport étudiant, avec liens vers les articles originaux.';
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Les revues du Radar', url: `${SITE}/${path_}`, inLanguage: 'fr-CA', publisher: publisherLd(),
    mainEntity: { '@type': 'ItemList', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: index.length, itemListElement: index.slice(0, 60).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: r.url, name: r.headline })) } };
  return renderPage({
    lang: 'fr', path: path_, altPath: path_, title, description, h1: 'Les revues du Radar', eyebrow: 'Revue de presse étudiante',
    crumbs: [{ label: 'Accueil', href: '../' }, { label: 'Revues' }],
    bodyHtml: [
      '      <p class="seo-lead">Deux fois par jour, La revue du matin et La revue du soir rassemblent les articles des médias étudiants du Québec, les émissions des radios étudiantes et les résultats du sport étudiant.</p>',
      featured,
      `      <p class="revue-more"><a href="${SITE}/revues/feed.xml">Flux RSS des revues</a></p>`,
      rows.length ? `      <section class="seo-section revue-section"><h2>Archives</h2>\n      <ul class="revue-archive">\n${rows.join('\n')}\n      </ul>\n      </section>` : '',
      index.length ? '' : '      <p class="revue-empty">Aucune revue publiée pour le moment.</p>',
      '      <p class="revue-disclosure">Revues préparées automatiquement par Le Radar à partir des sources citées ; chaque article renvoie à son média d’origine et nomme tous ses auteurs.</p>',
    ].filter(Boolean).join('\n'),
    jsonLd: jsonForScript(ld), siteBase: SITE, updated: index[0] ? stamp(index[0].dateModified || index[0].datePublished) : null, alternate: false,
    extraHead: `    <link rel="alternate" type="application/rss+xml" title="Les revues du Radar" href="${SITE}/revues/feed.xml" />\n`, extraStyles: ['revue.css'], wireClass: 'revue-wire',
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
    { loc: '/revues/', changefreq: 'daily', priority: '0.6', lastmod: String(index[0].dateModified || index[0].datePublished).slice(0, 10) },
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
function feedItemXml(model, { attachments = true } = {}) {
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
    attachments && img ? `      <enclosure url="${escXml(img.url)}" length="${Number(img.length) > 0 ? Number(img.length) : 0}" type="${/\.png(\?|$)/i.test(img.url) ? 'image/png' : /\.webp(\?|$)/i.test(img.url) ? 'image/webp' : 'image/jpeg'}" />` : '',
    attachments && img ? `      <media:content url="${escXml(img.url)}" medium="image" />` : '',
    '    </item>',
  ].filter(Boolean).join('\n');
}
/** Flux dédié /revues/feed.xml (copie à l'ancienne adresse /revue/feed.xml). */
function revueFeedXml(models = [], { now = Date.now() } = {}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    '    <title>Les revues du Radar</title>',
    `    <link>${SITE}/revues/</link>`,
    '    <description>La revue du matin et La revue du soir : revue de presse des médias étudiants du Québec, radio étudiante et sport étudiant. Générées automatiquement à partir des sources citées.</description>',
    '    <language>fr-CA</language>',
    `    <lastBuildDate>${rfc822(models[0]?.dateModified || now)}</lastBuildDate>`,
    `    <atom:link href="${SITE}/revues/feed.xml" rel="self" type="application/rss+xml" />`,
    `    <image><url>${SITE}/assets/icon-192.png</url><title>Les revues du Radar</title><link>${SITE}/revues/</link></image>`,
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
  articleBody, reviewJsonLd, renderReviewPage, renderIndexPage, legacyRedirectPage, SITE, newsSitemap, sitemapEntries,
  pdfDownloadName, pdfBarHtml, syncEditionPdfLinks, qrLinkHtml, sportHtml,
  feedContentHtml, feedItemXml, revueFeedXml, loadConfig, loadPublished, robotsWithNewsSitemap, jsonForScript,
};

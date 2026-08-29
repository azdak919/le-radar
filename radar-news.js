// LE-RADAR — fil, recherche, cartes article
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

// ═══════════════════════════════════════════════════════════════════════════
//  NEWS WIRE
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {{ silent?: boolean }} [opts] silent : garder le fil affiché pendant
 *   la requête, au lieu de le remplacer par des squelettes. Sert au
 *   rafraîchissement de retour d'arrière-plan, où un clignotement de la liste
 *   déjà lisible serait un pur inconvénient.
 */
async function loadNews({ silent = false } = {}) {
  if (!NEWS_LIST) return;
  const firstPaint = NEWS_LIST.dataset.ready !== '1';
  if ((!silent || !news.length) && !firstPaint) {
    NEWS_LIST.innerHTML = newsSkeleton(6);
  }
  try {
    const res = await fetch(appAsset('news.json'), { cache: 'no-cache' });
    const data = await res.json();
    news = Array.isArray(data) ? data : (data.items || []);
    news.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    assignSourceColors();
    // Les fiches SEO de journaux ramènent ici avec ?source=… : on valide
    // d'abord contre les données réellement chargées, plutôt que d'afficher
    // un filtre inexistant après une URL ancienne ou bricolée.
    const requestedSource = new URLSearchParams(window.location.search).get('source');
    if (requestedSource && news.some((item) => item.source === requestedSource)) {
      newsSourceFilter = requestedSource;
    }
    if (data.updated) {
      // Heure réelle de la dernière écriture de news.json.
      // updatedSlot (passe planifiée) n'est utilisé que s'il est proche de l'heure
      // réelle — sinon on affichait encore « 12 h 00 » à 15 h 48 après un filet
      // ou une passe manuelle plus récente.
      const actual = new Date(data.updated);
      const slot = data.updatedSlot ? new Date(data.updatedSlot) : null;
      const slotOk = slot
        && !Number.isNaN(slot.getTime())
        && actual - slot >= 0
        && actual - slot <= 45 * 60 * 1000;
      const d = slotOk ? slot : actual;
      NEWS_UPDATED.textContent = `mis à jour ${formatStamp(d)}`;
    }
  } catch (e) {
    console.error('Failed to load news.json', e);
    news = [];
  }
  renderNewsFilters();
  renderNews();
}

function normInstitutionKey(name = '') {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function institutionBrandColor(institution = '') {
  if (!institution) return null;
  const table = brandColors.institutions || {};
  if (table[institution]?.color) return table[institution].color;

  const norm = normInstitutionKey(institution);
  for (const [key, entry] of Object.entries(table)) {
    if (key.startsWith('_')) continue;
    if (normInstitutionKey(key) === norm) return entry.color;
  }
  return null;
}

/** Couleur d'accent d'un article : marque de l'établissement (pastilles, « Lire la suite »). */
function sourceAccentColor(item = {}) {
  const raw = institutionBrandColor(item.institution || '')
    || sourceColors[item.source || '']
    || null;
  return safeCssColor(raw);
}

/** Popularité des filtres UI : lue depuis news-sources.json (champ popularity). */
function sourcePopularityRank(name = '') {
  const fromRegistry = newsSourcesByName[name]?.popularity;
  if (typeof fromRegistry === 'number') return fromRegistry;
  return 100;
}

/** FR d'abord, puis EN, puis le reste (lang depuis news-sources.json). */
function sourceLangRank(name = '') {
  const lang = String(newsSourcesByName[name]?.lang || '').toLowerCase();
  if (lang === 'fr') return 0;
  if (lang === 'en') return 1;
  return 2;
}

/**
 * Tri pastilles sources :
 *  1. Français, puis anglais, puis autres
 *  2. Popularité croissante (1 = plus haut) — y compris The Link
 */
function sortSourcesByPopularity(sources) {
  return [...sources].sort((a, b) => {
    const langDiff = sourceLangRank(a) - sourceLangRank(b);
    if (langDiff !== 0) return langDiff;
    const diff = sourcePopularityRank(a) - sourcePopularityRank(b);
    return diff !== 0 ? diff : a.localeCompare(b, 'fr');
  });
}

function filterInstitutionKey(sourceName = '') {
  const { institution } = sourceInfo(sourceName);
  if (!institution) return sourceName;
  const acronym = resolveInstitutionAcronym(institution);
  if (acronym) return acronym.toLowerCase();
  return normInstitutionKey(institution);
}

/**
 * Tri filtres sources : FR par popularité, puis EN par popularité
 * (The Link inclus normalement selon son rang popularity).
 */
function sortSourcesForFilters(sources) {
  return sortSourcesByPopularity(sources);
}

function assignSourceColors() {
  const palette = brandColors.fallback_palette || ['#003DA5', '#6C2163', '#047857'];
  const sources = sortSourcesByPopularity([...new Set(news.map(n => n.source))]);
  sourceColors = {};

  sources.forEach((src, i) => {
    const item = news.find(n => n.source === src);
    sourceColors[src] = safeCssColor(
      institutionBrandColor(item?.institution || '') || palette[i % palette.length],
    ) || '#003DA5';
  });
}

function newsSkeleton(n) {
  return Array.from({ length: n }).map(() => `
    <div class="article skeleton">
      <div class="sk sk-meta"></div>
      <div class="sk sk-title"></div>
      <div class="sk sk-title2"></div>
      <div class="sk sk-brief"></div>
      <div class="sk sk-brief2"></div>
    </div>`).join('');
}

// D10 : acronymes générés depuis institutions.json
// (institution-acronyms-data.js via scripts/sync-institution-labels.js).
// Repli minimal si le script data n’est pas encore chargé.
const INSTITUTION_ACRONYMS = {
  ...(typeof window !== 'undefined' && window.RadarInstitutionAcronyms
    ? window.RadarInstitutionAcronyms
    : {
        'Université de Montréal': 'UdeM',
        UQAM: 'UQAM',
        'Université du Québec à Montréal': 'UQAM',
        'Université McGill': 'McGill',
        'McGill University': 'McGill',
        'Concordia University': 'Concordia',
        'Université Laval': 'ULaval',
        'Université de Sherbrooke': 'UdeS',
        'Polytechnique Montréal': 'Poly Montréal',
      }),
};

const INSTITUTION_FULL_BY_ACRONYM = {
  ...(typeof window !== 'undefined' && window.RadarInstitutionFullByAcronym
    ? window.RadarInstitutionFullByAcronym
    : {}),
};
if (!Object.keys(INSTITUTION_FULL_BY_ACRONYM).length) {
  for (const [full, acr] of Object.entries(INSTITUTION_ACRONYMS)) {
    const clean = full.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const prev = INSTITUTION_FULL_BY_ACRONYM[acr];
    if (!prev || (clean.includes(' ') && clean.length > prev.length)) {
      INSTITUTION_FULL_BY_ACRONYM[acr] = clean;
    }
  }
}

/**
 * Capitalisation affichage des types d'établissement.
 * Institutions : original en Original/FR/EN ; localisées hors de ces modes
 * (translate.js). Ce filet corrige aussi une casse abîmée (gtx).
 */
function formatInstitutionDisplay(name = '') {
  if (!name) return '';
  // Lookarounds ASCII : `\b` après `é` échoue en JS (é ≠ word char).
  return String(name)
    .replace(/(?<![A-Za-z])université(?![A-Za-z])/giu, 'Université')
    .replace(/(?<![A-Za-z])universite(?![A-Za-z])/giu, 'Université')
    .replace(/(?<![A-Za-z])university(?![A-Za-z])/giu, 'University')
    .replace(/(?<![A-Za-z])universidad(?![A-Za-z])/giu, 'Universidad')
    .replace(/(?<![A-Za-z])universidade(?![A-Za-z])/giu, 'Universidade')
    .replace(/(?<![A-Za-z])universität(?![A-Za-z])/giu, 'Universität')
    .replace(/(?<![A-Za-z])università(?![A-Za-z])/giu, 'Università')
    .replace(/(?<![A-Za-z])cégep(?![A-Za-z])/giu, 'Cégep')
    .replace(/(?<![A-Za-z])cegep(?![A-Za-z])/giu, 'Cégep')
    .replace(/(?<![A-Za-z])college(?![A-Za-z])/giu, 'College')
    .replace(/(?<![A-Za-z])collège(?![A-Za-z])/giu, 'Collège')
    .replace(/(?<![A-Za-z])colegio(?![A-Za-z])/giu, 'Colegio')
    .replace(/(?<![A-Za-z])colégio(?![A-Za-z])/giu, 'Colégio')
    // Noms propres fréquents laissés en minuscules par gtx (Laval, Montréal…)
    .replace(/(?<![A-Za-z])laval(?![A-Za-z])/giu, 'Laval')
    .replace(/(?<![A-Za-z])montr[eé]al(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Montréal' : 'Montreal'))
    .replace(/(?<![A-Za-z])sherbrooke(?![A-Za-z])/giu, 'Sherbrooke')
    .replace(/(?<![A-Za-z])mcgill(?![A-Za-z])/giu, 'McGill')
    .replace(/(?<![A-Za-z])concordia(?![A-Za-z])/giu, 'Concordia')
    .replace(/(?<![A-Za-z])dawson(?![A-Za-z])/giu, 'Dawson')
    .replace(/(?<![A-Za-z])qu[eé]bec(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Québec' : 'Quebec'));
}

/** Libellé institution sur les pastilles sources (nom complet, sans suffixe Univ./Cégep). */
function filterSourceInstitutionLabel(institution = '', _type = '', sourceName = '') {
  if (!institution) return '';
  if (sourceName === 'Le Délit') return 'Université McGill';
  return tunerInstitutionLabel(institution);
}

/** Nom d'institution au complet pour le sous-titre du syntoniseur. */
function tunerInstitutionLabel(name = '') {
  if (!name) return '';
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  let label;
  if (/^université|^university|^mcgill|^concordia|^cégep|^collège/i.test(stripped)) {
    label = stripped;
  } else {
    label = INSTITUTION_FULL_BY_ACRONYM[name] || INSTITUTION_FULL_BY_ACRONYM[stripped] || stripped;
  }
  return formatInstitutionDisplay(label);
}

function resolveInstitutionAcronym(name = '') {
  if (!name) return '';
  if (INSTITUTION_ACRONYMS[name]) return INSTITUTION_ACRONYMS[name];

  const norm = normInstitutionKey(name);
  for (const [key, acronym] of Object.entries(INSTITUTION_ACRONYMS)) {
    if (normInstitutionKey(key) === norm) return acronym;
  }

  const paren = name.match(/\((UQ[A-Z]{1,4}|UdeM|ULaval|UdeS|McGill)\)/i);
  if (paren) return paren[1];

  return '';
}

function isQuebecUniversity(name = '', type = '') {
  return type === 'universite'
    || /^université|^university|^mcgill|^concordia$/i.test(name)
    || name === 'UQAM';
}

function stripInstitutionTypePrefix(name = '') {
  return String(name)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^Cégep (de |du |d'|des )?/i, '')
    .replace(/^Collège (de |du |d'|des )?/i, '')
    .trim();
}

function isCegepInstitution(name = '', type = '') {
  return type === 'cegep' || /^cégep|^collège/i.test(name);
}

/**
 * Développe un acronyme stocké en base (ex. « UQAM ») vers le nom complet
 * (« Université du Québec à Montréal »). Si le nom est déjà long, le garde.
 */
function expandInstitutionFullName(name = '') {
  if (!name) return '';
  // Réutilise la même logique que le syntoniseur (filtre + cartes).
  return tunerInstitutionLabel(name);
}

/**
 * Libellé institution sur les cartes article.
 * @param {'short'|'full'} form
 *   short — acronyme (ULaval, UdeM, McGill…) pour En bref + Suite du fil
 *   full  — nom complet (À la une + vedettes, tablette+)
 */
function articleInstitutionLabel(name = '', type = '', form = 'short') {
  if (!name) return '';
  if (form === 'full') {
    return expandInstitutionFullName(name);
  }
  // Court : acronyme institutionnel, sinon libellé compact (cégeps, collèges).
  return shortInstitution(name, type)
    || formatInstitutionDisplay(String(name).replace(/\s*\([^)]*\)\s*$/, '').trim());
}

/** HTML meta institution : complet + acronyme pour bascule responsive CSS. */
function articleInstitutionMetaHtml(name = '', type = '', role = 'standard') {
  if (!name) return '';
  const short = articleInstitutionLabel(name, type, 'short');
  const full = articleInstitutionLabel(name, type, 'full');
  // Une + vedettes + En bref + suite du fil : nom complet (dual full/short responsive).
  const spacious = role === 'lead' || role === 'feature' || role === 'standard' || role === 'compact';
  // Pas de notranslate : hors Original/FR/EN, translate.js localise (ES/PT…).
  // En Original / FR / EN : libellés d’origine intacts.
  if (spacious && full && full !== short) {
    return `<span class="article-inst">`
      + `<span class="article-inst__full">${escapeHtml(full)}</span>`
      + `<span class="article-inst__short">${escapeHtml(short)}</span>`
      + `</span>`;
  }
  // Spacious mais full === short (ex. cégep sans acronyme) : afficher full
  if (spacious && full) {
    return `<span class="article-inst">${escapeHtml(full)}</span>`;
  }
  return `<span class="article-inst">${escapeHtml(short || full)}</span>`;
}

function shortInstitution(name = '', type = '') {
  const acronym = resolveInstitutionAcronym(name);
  if (acronym) return acronym;

  const CEGEP_SHORT = {
    'Cégep du Vieux Montréal': 'Cégep Vieux-Montréal',
    'Cégep de Jonquière (ATM – journalisme)': 'Jonquière',
    'Cégep de Jonquière': 'Jonquière',
    'Dawson College': 'Dawson',
    'Collège Dawson': 'Dawson',
  };
  if (CEGEP_SHORT[name]) return CEGEP_SHORT[name];
  const strippedName = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (CEGEP_SHORT[strippedName]) return CEGEP_SHORT[strippedName];

  if (isCegepInstitution(name, type)) {
    const stripped = stripInstitutionTypePrefix(name);
    if (stripped) return stripped.length > 24 ? `${stripped.slice(0, 22)}…` : stripped;
  }

  const paren = name.match(/\(([^)]+)\)/);
  if (paren) {
    const inner = paren[1].split(/[–-]/)[0].trim();
    if (inner.length <= 14) return inner;
  }
  if (isQuebecUniversity(name, type)) return formatInstitutionDisplay(name);
  const trimmed = name.length > 24 ? `${name.slice(0, 22)}…` : name;
  return formatInstitutionDisplay(trimmed);
}

function sourceInfo(src) {
  const item = news.find(n => n.source === src);
  const registry = newsSourcesByName[src];
  return {
    institution: item?.institution || registry?.institution || '',
    type: item?.type || registry?.type || '',
    color: sourceColors[src] || 'var(--accent)',
  };
}

function filtersColumnCount() {
  const wideCols = (typeof window.__radarWidePreview?.filtersColumnCount === 'function')
    ? window.__radarWidePreview.filtersColumnCount()
    : null;
  if (typeof wideCols === 'number' && wideCols > 0) return wideCols;
  if (!NEWS_FILTERS) {
    return FILTERS_MOBILE.matches ? FILTERS_ROW_CAPACITY : FILTERS_DESKTOP_DEFAULT_COLS;
  }
  const w = NEWS_FILTERS.clientWidth;
  if (FILTERS_MOBILE.matches) {
    return w < FILTERS_COLS_NARROW ? 2 : 3;
  }
  // Demi-laptop / tablette étroite : 3 colonnes de pastilles (pas le mode compact téléphone).
  if (w < 720) return 3;
  if (w < FILTERS_DESKTOP_WIDE_MIN) return 3;
  return FILTERS_DESKTOP_MAX_COLS;
}

/** Aligné sur style.css --filters-collapsed-rows (1 rangée partout).
 *  Lab grand écran : __radarWidePreview peut forcer 2 rangées (C/D) ou rail (E). */
function filtersCollapsedRows() {
  const wideRows = (typeof window.__radarWidePreview?.filtersCollapsedRows === 'function')
    ? window.__radarWidePreview.filtersCollapsedRows()
    : null;
  if (typeof wideRows === 'number' && wideRows > 0) return wideRows;
  return FILTERS_COMPACT_MQ.matches
    ? FILTERS_COLLAPSED_ROWS_COMPACT
    : FILTERS_COLLAPSED_ROWS_DESKTOP;
}

function syncFiltersColumns() {
  if (!FILTERS_PANEL) return;
  const cols = filtersColumnCount();
  const rows = filtersCollapsedRows();
  FILTERS_PANEL.style.setProperty('--filters-cols', String(cols));
  FILTERS_PANEL.style.setProperty('--filters-collapsed-rows', String(rows));
}

function isWideRailFiltersActive() {
  return typeof isWideNoMarqueeMode === 'function'
    && isWideNoMarqueeMode()
    && !!document.getElementById('wide-rail-stack');
}

/** Hors rail E : la hauteur / peek / largeur inline sinon survivent au resize. */
function clearWideRailFiltersFit() {
  if (FILTERS_PANEL) {
    FILTERS_PANEL.style.removeProperty('--filters-collapsed-h');
    FILTERS_PANEL.style.removeProperty('--filters-peek');
    FILTERS_PANEL.style.removeProperty('--filters-title-h');
    FILTERS_PANEL.style.removeProperty('--filters-rail-avail');
  }
  if (FILTERS_TOGGLE) {
    FILTERS_TOGGLE.style.removeProperty('width');
    FILTERS_TOGGLE.style.removeProperty('max-width');
    FILTERS_TOGGLE.style.removeProperty('align-self');
  }
}

/**
 * Rail wide E : calcule combien de pastilles tiennent sous le titre,
 * pour afficher « Plus de sources » plutôt que de scroller tout le rail.
 * @returns {boolean} true s’il y a débordement
 */
function wideStickyTopPx() {
  try {
    const n = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--wide-sticky-top'),
    );
    if (Number.isFinite(n) && n > 0) return n;
  } catch { /* ignore */ }
  return 76;
}

function setCssVar(el, name, value) {
  if (!el || el.style.getPropertyValue(name) === value) return;
  el.style.setProperty(name, value);
}

function syncWideRailFiltersFit() {
  if (!FILTERS_PANEL || !NEWS_FILTERS) return false;
  if (!isWideRailFiltersActive()) {
    clearWideRailFiltersFit();
    return false;
  }
  const stack = document.getElementById('wide-rail-stack');
  if (!stack) {
    clearWideRailFiltersFit();
    return false;
  }
  const sections = stack.querySelector('.site-sections');
  const head = stack.querySelector('.wire-head');
  const stickyTop = wideStickyTopPx();
  const rawTop = stack.getBoundingClientRect().top;
  /* Plancher = offset sticky. En haut de page rawTop > sticky (sous le mât).
     Collé : rawTop ≈ sticky. En bas de page le rail se décolle et rawTop
     chute — s’en servir pour la hauteur fait grandir le rail, le recoller,
     puis redescendre : jitter ~60 fps (Philips 1920, scroll au fond). */
  const stackTop = Math.max(stickyTop, Math.round(rawTop));
  /* Flèche overlay bas-droite (comme la loupe) : plus de réserve 72 px dans le rail. */
  const bottomSafe = 16;
  setCssVar(stack, '--wide-rail-bottom', `${bottomSafe}px`);
  setCssVar(stack, '--wide-stack-from-top', `${stackTop}px`);
  const visibleH = Math.max(160, (window.innerHeight || 800) - stackTop - bottomSafe);
  const chrome = (sections?.offsetHeight || 0) + (head?.offsetHeight || 0) + 8;
  const toggleH = 46;
  const btn = NEWS_FILTERS.querySelector('.filter-btn');
  const rowH = Math.max(42, Math.ceil((btn?.getBoundingClientRect().height || 44) + 6));
  /* Nom de la source suivante, sans bande smeared trop haute. */
  const instFade = Math.max(20, Math.round(rowH * 0.48));
  const avail = Math.max(120, visibleH - chrome - toggleH - instFade);
  let rows = Math.max(3, Math.floor(avail / rowH));
  if (avail - rows * rowH >= rowH * 0.7) rows += 1;
  const countBtns = NEWS_FILTERS.querySelectorAll('.filter-btn').length;
  rows = Math.min(Math.max(3, rows), Math.max(3, countBtns));
  /* Rangées pleines + peek à part : ne pas rogner la dernière puce visible. */
  const collapsedH = Math.max(rowH, rows * rowH - 6);
  setCssVar(FILTERS_PANEL, '--filters-cols', '1');
  setCssVar(FILTERS_PANEL, '--filters-collapsed-rows', String(rows));
  setCssVar(FILTERS_PANEL, '--filters-collapsed-h', `${collapsedH}px`);
  setCssVar(FILTERS_PANEL, '--filters-peek', `${instFade}px`);
  setCssVar(FILTERS_PANEL, '--filters-title-h', '0px');
  setCssVar(FILTERS_PANEL, '--filters-rail-avail', `${Math.max(120, visibleH - chrome - toggleH)}px`);
  syncWideFiltersToggleWidth();
  return countBtns > rows;
}

/** Plus de sources / Réduire : même largeur et même axe que les pastilles. */
function syncWideFiltersToggleWidth() {
  if (!FILTERS_TOGGLE || !NEWS_FILTERS) return;
  if (!isWideRailFiltersActive()) {
    FILTERS_TOGGLE.style.removeProperty('width');
    FILTERS_TOGGLE.style.removeProperty('max-width');
    FILTERS_TOGGLE.style.removeProperty('align-self');
    return;
  }
  const pill = NEWS_FILTERS.querySelector('.filter-btn');
  if (!pill) return;
  const w = Math.round(pill.getBoundingClientRect().width);
  if (w < 40) return;
  FILTERS_TOGGLE.style.width = `${w}px`;
  FILTERS_TOGGLE.style.maxWidth = `${w}px`;
  FILTERS_TOGGLE.style.alignSelf = 'flex-start';
}

function filtersOverflow() {
  if (!NEWS_FILTERS) return false;
  if (isWideRailFiltersActive()) {
    return syncWideRailFiltersFit();
  }
  clearWideRailFiltersFit();
  const count = NEWS_FILTERS.querySelectorAll('.filter-btn').length;
  return count > filtersCollapsedRows() * filtersColumnCount();
}

function updateFiltersCompactBar() {
  if (!FILTERS_COMPACT) return;
  const dot = FILTERS_COMPACT.querySelector('.filters-compact__dot');
  const text = FILTERS_COMPACT.querySelector('.filters-compact__text');
  if (newsSourceFilter === 'all') return;

  const { institution, type, color } = sourceInfo(newsSourceFilter);
  const instLabel = filterSourceInstitutionLabel(institution, type, newsSourceFilter);
  FILTERS_COMPACT.style.setProperty('--c', color);
  if (dot) dot.style.setProperty('--c', color);
  if (text) {
    // Média protégé ; établissement traduisible (comme les pastilles sources).
    text.classList.remove('notranslate');
    text.removeAttribute('translate');
    text.replaceChildren();
    const nameSpan = document.createElement('span');
    nameSpan.className = 'notranslate';
    nameSpan.setAttribute('translate', 'no');
    nameSpan.textContent = newsSourceFilter;
    text.appendChild(nameSpan);
    if (instLabel) {
      text.appendChild(document.createTextNode(' · '));
      const instSpan = document.createElement('span');
      instSpan.className = 'filters-compact__inst';
      instSpan.textContent = adaptRadarInstitutionLabel(instLabel);
      text.appendChild(instSpan);
    }
  }
}

function syncFiltersPanel() {
  if (!FILTERS_PANEL) return;
  syncFiltersColumns();

  const isSourceView = newsSourceFilter !== 'all';
  const overflow = filtersOverflow();

  if (FILTERS_MOBILE.matches && isSourceView) {
    FILTERS_PANEL.classList.toggle('has-overflow', true);
    if (filtersExpanded) {
      FILTERS_PANEL.classList.remove('is-compact');
      FILTERS_PANEL.classList.add('is-expanded');
      FILTERS_COMPACT?.setAttribute('hidden', '');
      FILTERS_TOGGLE?.removeAttribute('hidden');
      const label = FILTERS_TOGGLE?.querySelector('.filters-toggle__label');
      if (label) label.textContent = adaptRadarUiText('Réduire');
      FILTERS_TOGGLE?.setAttribute('aria-expanded', 'true');
      FILTERS_COMPACT?.setAttribute('aria-expanded', 'true');
    } else {
      FILTERS_PANEL.classList.add('is-compact');
      FILTERS_PANEL.classList.remove('is-expanded');
      updateFiltersCompactBar();
      FILTERS_COMPACT?.removeAttribute('hidden');
      FILTERS_TOGGLE?.setAttribute('hidden', '');
      FILTERS_COMPACT?.setAttribute('aria-expanded', 'false');
    }
    scheduleFilterMarqueeRefresh();
    return;
  }

  FILTERS_PANEL.classList.remove('is-compact');
  FILTERS_COMPACT?.setAttribute('hidden', '');
  /* Un rail déjà ouvert reste « en débordement » pour garder Réduire,
     même si un scroll agrandit l’espace et que tout tiendrait. */
  const keepWideOpen = !!(filtersExpanded && isWideRailFiltersActive());
  FILTERS_PANEL.classList.toggle('has-overflow', overflow || keepWideOpen);

  if (overflow || keepWideOpen) {
    FILTERS_TOGGLE?.removeAttribute('hidden');
    FILTERS_PANEL.classList.toggle('is-expanded', filtersExpanded);
    const label = FILTERS_TOGGLE?.querySelector('.filters-toggle__label');
    if (label) {
      label.textContent = adaptRadarUiText(filtersExpanded ? 'Réduire' : 'Plus de sources');
    }
    FILTERS_TOGGLE?.setAttribute('aria-expanded', filtersExpanded ? 'true' : 'false');
  } else {
    /* Tout tient et l’utilisateur n’a pas ouvert : pas de bouton. */
    FILTERS_PANEL.classList.remove('is-expanded');
    FILTERS_TOGGLE?.setAttribute('hidden', '');
  }

  scheduleFilterMarqueeRefresh();
  if (isWideRailFiltersActive()) {
    window.requestAnimationFrame(() => syncWideFiltersToggleWidth());
  }
}

/** Après changement de langue : reposer les libellés sources / boutons. */
function onRadarTranslateModeChange() {
  applyFilterInstMarquees();
  syncFiltersPanel();
  scheduleFilterMarqueeRefresh();
  // Reposer l’institution du syntoniseur dans la langue active
  if (currentStation) {
    const radio = currentStation;
    const external = isExternalListen(radio);
    if (isDialCompactLayout()) {
      setTunerNameText(compactDialTitleLine(radio));
      tunerSubMeta = dialCompactMetaLineForRadio(radio);
      // Reposer la phase courante traduite dans le créneau visible seulement.
      // Pas de renderTunerNowAir() ici : un rendu complet relance les marquees
      // et l'observateur de taille, ce qui reflue tout le mât au moment même
      // où l'on change de langue.
      const lines = dialPhaseLinesForRadio(radio);
      const line = lines[airPhaseIndex % Math.max(1, lines.length)] || tunerSubMeta;
      TUNER_SUB?.parentElement?.classList.toggle('is-empty', !line);
      applyMarquee(dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB, line);
    } else {
      setTunerNameText(tunerDesktopTitleLine(radio));
      setTunerSubText(tunerDesktopSubLine(radio, { external }));
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('radar:translate-mode', onRadarTranslateModeChange);
}

let lastMagazineViewportKey = '';
let magazineRelayoutTimer = 0;

/** Clé des seuils qui changent le DOM magazine (unes / vedettes / En bref). */
function magazineViewportKey() {
  return [
    wideHeroLeadCount(),
    wideHeroFeatureCount(),
    briefWideColumnCount(),
    isMidwidthMagazineLayout() ? 'm' : 'd',
  ].join(':');
}

/**
 * Resize demi-écran → 1920 : reposer le fil, sinon data-leads et le nombre
 * d’unes restent ceux du viewport étroit (1 une) jusqu’au refresh.
 * setTimeout(0) : le resize peut partir *avant* que innerWidth soit le
 * nouveau (tuile GNOME / setViewportSize) — relire après coup.
 */
function scheduleMagazineViewportRelayout() {
  if (magazineRelayoutTimer) clearTimeout(magazineRelayoutTimer);
  const run = () => {
    magazineRelayoutTimer = 0;
    if (!NEWS_LIST) return;
    if (NEWS_LIST.dataset.mode === 'search') {
      lastMagazineViewportKey = magazineViewportKey();
      return;
    }
    const key = magazineViewportKey();
    const wantLeads = wideHeroLeadCount();
    const haveLeads = NEWS_LIST.querySelectorAll('.news-hero .article--lead').length;
    if (key === lastMagazineViewportKey && haveLeads === wantLeads) return;
    if (NEWS_LIST.dataset.ready !== '1' && haveLeads === 0) return;
    renderNews();
  };
  magazineRelayoutTimer = window.setTimeout(run, 0);
  /* Trailing pass : tuile GNOME / setViewportSize finissent après le 1er tick. */
  window.setTimeout(run, 80);
}

function bindMagazineViewportRelayout() {
  if (bindMagazineViewportRelayout._bound) return;
  bindMagazineViewportRelayout._bound = true;
  if (typeof window !== 'undefined') {
    window.__radarMagazineRelayout = scheduleMagazineViewportRelayout;
    window.__radarMagazineDebug = () => ({
      key: magazineViewportKey(),
      last: lastMagazineViewportKey,
      want: wideHeroLeadCount(),
      dual: isWideDualLeadViewport(),
      bound: true,
    });
  }
  window.addEventListener('resize', scheduleMagazineViewportRelayout, { passive: true });
  window.addEventListener('radar-wide-preview-change', scheduleMagazineViewportRelayout);
  for (const q of [
    '(min-width: 768px)',
    '(min-width: 1100px)',
    '(min-width: 1281px)',
    '(min-width: 1920px)',
    '(min-width: 3440px)',
    '(min-width: 3840px)',
  ]) {
    try {
      onMediaQueryChange(window.matchMedia(q), scheduleMagazineViewportRelayout);
    } catch { /* ignore */ }
  }
}

function bindFiltersPanel() {
  let filtersUserCollapsed = false;
  let filtersUserPinned = false;
  FILTERS_TOGGLE?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    filtersExpanded = !filtersExpanded;
    /* Clic = intention : ne plus ouvrir/fermer tout seul au scroll. */
    filtersUserPinned = filtersExpanded;
    filtersUserCollapsed = !filtersExpanded;
    syncFiltersPanel();
    if ((window.scrollY || document.documentElement.scrollTop || 0) !== y) {
      window.scrollTo({ top: y, left: 0, behavior: 'auto' });
    }
  });

  // Molette sur le rail : défiler les sources sans bouger le magazine.
  document.addEventListener('wheel', (event) => {
    if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return;
    const stack = document.getElementById('wide-rail-stack');
    if (!stack || !stack.contains(event.target)) return;
    if (!FILTERS_PANEL?.classList.contains('has-overflow')) return;
    const list = NEWS_FILTERS;
    if (!list) return;
    if (!filtersExpanded) {
      filtersExpanded = true;
      filtersUserPinned = (window.scrollY || 0) < 80;
      filtersUserCollapsed = false;
      syncFiltersPanel();
    }
    const max = list.scrollHeight - list.clientHeight;
    if (max <= 1) return;
    const atStart = list.scrollTop <= 0 && event.deltaY < 0;
    const atEnd = list.scrollTop >= max - 1 && event.deltaY > 0;
    if (atStart || atEnd) return;
    event.preventDefault();
    list.scrollTop = Math.min(max, Math.max(0, list.scrollTop + event.deltaY));
  }, { passive: false, capture: true });

  FILTERS_COMPACT?.addEventListener('click', () => {
    filtersExpanded = true;
    filtersUserCollapsed = false;
    filtersUserPinned = (window.scrollY || 0) < 80;
    syncFiltersPanel();
  });

  let filtersScrollTick = false;
  window.addEventListener('scroll', () => {
    if (filtersScrollTick) return;
    filtersScrollTick = true;
    window.requestAnimationFrame(() => {
      filtersScrollTick = false;
      if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return;
      if (!document.getElementById('wide-rail-stack')) return;
      /* Recalcule seulement l’espace dispo (sticky vs haut de page).
         Plus de sources / Réduire ne change que sur clic. */
      syncWideRailFiltersFit();
    });
  }, { passive: true });

  const onFiltersLayoutChange = () => {
    syncFiltersPanel();
    scheduleFilterMarqueeRefresh();
    scheduleMagazineViewportRelayout();
  };
  window.addEventListener('resize', onFiltersLayoutChange);
  onMediaQueryChange(FILTERS_MOBILE, onFiltersLayoutChange);
  onMediaQueryChange(FILTERS_COMPACT_MQ, onFiltersLayoutChange);

  if (NEWS_FILTERS && typeof ResizeObserver !== 'undefined') {
    const filtersResize = new ResizeObserver(() => {
      syncFiltersPanel();
      scheduleFilterMarqueeRefresh();
    });
    filtersResize.observe(NEWS_FILTERS);
  }

  // Lab grand écran : bascule ?wide= sans reload → re-sync colonnes / rangées,
  // coupe les marquees, recalcule météo (plus de cartes en wide).
  window.addEventListener('radar-wide-preview-change', () => {
    syncFiltersPanel();
    // Purger classes marquee immédiatement (CSS + prochains mesures).
    document.querySelectorAll('.is-marquee').forEach((el) => {
      el.classList.remove('is-marquee');
      el.style.removeProperty('--marquee-shift');
      el.style.removeProperty('--marquee-duration');
      el.style.removeProperty('--marquee-delay');
    });
    document.querySelectorAll('.is-overflowing, .is-sub-overflowing').forEach((el) => {
      el.classList.remove('is-overflowing', 'is-sub-overflowing');
      el.style.removeProperty('--weather-scroll');
      el.style.removeProperty('--sports-scroll');
      el.style.removeProperty('--sports-scroll-sub');
    });
    mastheadWeatherFitCount = null;
    scheduleMastheadWeatherLayout();
    scheduleFilterMarqueeRefresh();
    try {
      sportsFitCount = null;
      sportsFitDepth = 0;
      if (MASTHEAD_SPORTS_STRIP && !MASTHEAD_SPORTS_STRIP.hidden) {
        renderSportsStrip();
        scheduleSportsRotate();
        window.requestAnimationFrame(() => refreshSportsChipScroll());
      }
    } catch { /* ignore */ }
    // Synthé : wrappers wide + largeur inline (sinon barre cassée jusqu’au refresh).
    try {
      syncTunerShellLayout();
    } catch { /* ignore */ }
    try {
      syncWideStickyTop();
      requestAnimationFrame(() => syncWideStickyTop());
    } catch { /* ignore */ }
    try {
      scheduleMagazineViewportRelayout();
    } catch { /* ignore */ }
  });
  window.addEventListener('resize', () => {
    if (isWideTunerLayout()) {
      syncWideStickyTop();
      fitWideDialWidth({ force: true });
    } else {
      clearWideDialInlineSize();
    }
  }, { passive: true });
  bindMagazineViewportRelayout();
}

function selectNewsSource(source) {
  newsSourceFilter = source;
  NEWS_FILTERS?.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.source === source));
  // Choisir une source (y compris « Le Radar ») referme le panneau déplié —
  // plus besoin de le laisser ouvert une fois la sélection faite.
  filtersExpanded = false;
  syncFiltersPanel();
  renderNews();
}

// ─── Recherche locale (loupe) ─────────────────────────────────────────────────
/** Normalise pour comparaison insensible aux accents / casse. */
function normalizeSearchText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Apostrophes typographiques (Bishop’s) → espace / lettre adjacente
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jetons de requête (ET) — chaîne vide → aucun filtre. */
function searchTokens(query = '') {
  const q = normalizeSearchText(query);
  if (!q) return [];
  return q.split(' ').filter((t) => t.length >= 1);
}

/**
 * Variantes légères d'un jeton (pluriel EN/FR simple) pour coller
 * « dancer » ↔ « dancers », « danseur » ↔ « danseurs ».
 */
function searchTokenVariants(token = '') {
  const t = String(token || '');
  if (t.length < 3) return [t];
  const out = new Set([t]);
  if (t.endsWith('ies') && t.length > 4) out.add(`${t.slice(0, -3)}y`);
  if (t.endsWith('y') && t.length > 3) out.add(`${t.slice(0, -1)}ies`);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) out.add(t.slice(0, -1));
  else if (!t.endsWith('s')) out.add(`${t}s`);
  // FR : -eur / -eurs, -euse / -euses (approximation)
  if (t.endsWith('eurs') && t.length > 5) out.add(t.slice(0, -1));
  if (t.endsWith('eur') && t.length > 4) out.add(`${t}s`);
  if (t.endsWith('euses') && t.length > 6) out.add(t.slice(0, -1));
  if (t.endsWith('euse') && t.length > 5) out.add(`${t}s`);
  return [...out];
}

function haystackIncludesToken(hay = '', token = '') {
  if (!token) return true;
  if (hay.includes(token)) return true;
  return searchTokenVariants(token).some((v) => v !== token && hay.includes(v));
}

/**
 * Champs locaux indexés pour la recherche (aucun fetch distant) :
 * titre, auteur, source, établissement, région, extraits, crédits photo.
 */
function articleSearchFields(item = {}) {
  const { author: bylineAuthor, body } = splitByline(item);
  const author = resolveDisplayAuthor(item, bylineAuthor) || item.author || bylineAuthor || '';
  return {
    title: normalizeSearchText(cleanTitle(item.title || '')),
    author: normalizeSearchText(author),
    meta: normalizeSearchText([
      item.source || '',
      item.institution || '',
      item.region || '',
      item.type || '',
    ].join(' ')),
    body: normalizeSearchText([
      item.excerpt || '',
      item.leadExcerpt || '',
      body || '',
    ].join(' ')),
    credits: normalizeSearchText([
      item.imageCreator || '',
      item.sourceImageCreator || '',
      item.imageCredit || '',
      item.sourceImageCredit || '',
      item.imageTitle || '',
    ].join(' ')),
  };
}

function articleSearchHaystack(item = {}) {
  const f = articleSearchFields(item);
  return [f.title, f.author, f.meta, f.body, f.credits].filter(Boolean).join(' ');
}

function articleMatchesSearch(item, tokens) {
  if (!tokens.length) return true;
  const hay = articleSearchHaystack(item);
  return tokens.every((t) => haystackIncludesToken(hay, t));
}

/**
 * Score de pertinence : titre > auteur > source/inst. > extrait > crédits.
 * Utilisé pour classer les résultats (puis date décroissante en filet).
 */
function articleSearchScore(item, tokens) {
  if (!tokens.length) return 0;
  const f = articleSearchFields(item);
  let score = 0;
  for (const t of tokens) {
    if (haystackIncludesToken(f.title, t)) score += 100;
    else if (haystackIncludesToken(f.author, t)) score += 60;
    else if (haystackIncludesToken(f.meta, t)) score += 40;
    else if (haystackIncludesToken(f.body, t)) score += 20;
    else if (haystackIncludesToken(f.credits, t)) score += 10;
    else return 0;
  }
  const ts = Date.parse(item.date || '') || 0;
  // Bonus de fraîcheur très faible pour départager à score égal.
  score += Math.min(ts / 1e15, 0.99);
  return score;
}

function sortSearchResults(items, tokens) {
  return [...items].sort((a, b) => {
    const sb = articleSearchScore(b, tokens);
    const sa = articleSearchScore(a, tokens);
    if (sb !== sa) return sb - sa;
    return (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0);
  });
}

function getNewsSearchQuery() {
  return newsSearchQuery;
}

/*
 * Clavier virtuel : les outils fixed bas de page restent derrière le clavier
 * quand seul le viewport visuel rétrécit. On remonte d'autant (--vk-inset).
 */
function pageToolsRoot() {
  return document.getElementById('page-tools') || NEWS_SEARCH;
}

function updateNewsSearchKeyboardInset() {
  const root = pageToolsRoot();
  if (!root) return;
  const vv = window.visualViewport;
  if (!vv || !newsSearchOpen) {
    root.style.removeProperty('--vk-inset');
    return;
  }
  const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  if (occluded > 1) {
    root.style.setProperty('--vk-inset', `${Math.round(occluded)}px`);
  } else {
    root.style.removeProperty('--vk-inset');
  }
}

/** Flèche « haut de page » (overlay bas-droite, avec la loupe) — parité page sports. */
function initPageScrollTop() {
  const btn = document.getElementById('page-scroll-top');
  if (!btn) return;
  const SHOW_PX = 360;
  const sync = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const show = y > SHOW_PX;
    btn.hidden = !show;
    btn.setAttribute('aria-hidden', show ? 'false' : 'true');
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  });
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

/**
 * Liens Accueil (`data-home-nav`) : si on est déjà sur la page cible, scroll
 * en haut + refresh soft du fil (`loadNews` silent) — jamais de reload plein
 * écran, pour ne pas couper la radio en lecture. Sinon, navigation normale.
 */
function initHomeNavRefresh() {
  if (IS_TUNER_EMBED) return;

  const sameDocumentPath = (a, b) => {
    const norm = (p) => {
      let s = String(p || '/');
      if (s.endsWith('/index.html')) s = s.slice(0, -10) || '/';
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s || '/';
    };
    return norm(a) === norm(b);
  };

  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[data-home-nav]');
    if (!a || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    let target;
    try {
      target = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (target.origin !== location.origin) return;
    if (!sameDocumentPath(target.pathname, location.pathname)) return;

    // Déjà sur l'accueil : pas de navigation → audio intact.
    e.preventDefault();
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
    // Refresh soft : reprend news.json sans squelettes clignotants.
    loadNews({ silent: true }).catch(() => { /* fil affiché reste valable */ });
  });
}

function setNewsSearchOpen(open) {
  newsSearchOpen = !!open;
  if (!NEWS_SEARCH || !NEWS_SEARCH_TOGGLE || !NEWS_SEARCH_PANEL) return;

  NEWS_SEARCH.classList.toggle('is-open', newsSearchOpen);
  NEWS_SEARCH_TOGGLE.setAttribute('aria-expanded', newsSearchOpen ? 'true' : 'false');
  NEWS_SEARCH_PANEL.hidden = !newsSearchOpen;
  NEWS_SEARCH_PANEL.setAttribute('aria-hidden', newsSearchOpen ? 'false' : 'true');

  const loupe = NEWS_SEARCH_TOGGLE.querySelector('.news-search__fab-loupe');
  const close = NEWS_SEARCH_TOGGLE.querySelector('.news-search__fab-close');
  loupe?.classList.toggle('hidden', newsSearchOpen);
  close?.classList.toggle('hidden', !newsSearchOpen);

  if (newsSearchOpen) {
    // Focus après paint pour clavier mobile / lecteurs d'écran.
    requestAnimationFrame(() => {
      NEWS_SEARCH_INPUT?.focus({ preventScroll: true });
      NEWS_SEARCH_INPUT?.select?.();
    });
  }
  updateNewsSearchKeyboardInset();
}

function syncNewsSearchChrome() {
  const hasQuery = !!newsSearchQuery;
  NEWS_SEARCH?.classList.toggle('has-query', hasQuery);
  NEWS_SEARCH_CLEAR?.classList.toggle('hidden', !hasQuery);
  NEWS_SEARCH_TOGGLE?.classList.toggle('is-active', hasQuery);
  if (NEWS_SEARCH_HINT) {
    NEWS_SEARCH_HINT.textContent = hasQuery
      ? 'Filtre actif : titres, auteurs, sources, extraits et crédits (données déjà chargées).'
      : 'Recherche locale : titres, auteurs, sources, établissements, extraits et crédits photo.';
  }
}

function setNewsSearchQuery(raw, { render = true } = {}) {
  const next = String(raw || '').trim();
  if (next === newsSearchQuery) {
    syncNewsSearchChrome();
    return;
  }
  newsSearchQuery = next;
  syncNewsSearchChrome();
  if (render) renderNews();
}

/**
 * Efface la requête et restaure le fil complet (sans recharger la page).
 * — Bouton × du champ
 * — Icône X de la loupe quand une recherche est active
 * — Escape
 */
function clearNewsSearch({ keepOpen = true } = {}) {
  // Annuler un debounce encore en vol (sinon l'ancienne requête reviendrait).
  clearTimeout(newsSearchDebounce);
  newsSearchDebounce = null;
  if (NEWS_SEARCH_INPUT) NEWS_SEARCH_INPUT.value = '';
  const hadQuery = !!newsSearchQuery;
  newsSearchQuery = '';
  syncNewsSearchChrome();
  // Toujours re-rendre si on sort d'une recherche (layout une / en bref / suite).
  if (hadQuery) renderNews();
  if (keepOpen) {
    NEWS_SEARCH_INPUT?.focus({ preventScroll: true });
  } else {
    setNewsSearchOpen(false);
  }
}

function bindNewsSearch() {
  if (!NEWS_SEARCH_TOGGLE || !NEWS_SEARCH_INPUT) return;

  NEWS_SEARCH_TOGGLE.addEventListener('click', (e) => {
    e.stopPropagation();
    if (newsSearchOpen) {
      // X de la loupe : effacer la requête (= fin de recherche) + fermer le panneau.
      const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT.value || '').trim());
      if (hasQuery) clearNewsSearch({ keepOpen: false });
      else setNewsSearchOpen(false);
    } else {
      setNewsSearchOpen(true);
    }
  });

  NEWS_SEARCH_INPUT.addEventListener('input', () => {
    const value = NEWS_SEARCH_INPUT.value;
    // Chrome immédiat (bouton ×) ; re-rendu filtré avec léger debounce.
    const trimmed = String(value || '').trim();
    NEWS_SEARCH_CLEAR?.classList.toggle('hidden', !trimmed);
    NEWS_SEARCH?.classList.toggle('has-query', !!trimmed);
    NEWS_SEARCH_TOGGLE?.classList.toggle('is-active', !!trimmed);
    clearTimeout(newsSearchDebounce);
    // Champ vidé à la main (ou via × natif type=search) → clear immédiat.
    if (!trimmed) {
      newsSearchDebounce = null;
      if (newsSearchQuery) {
        newsSearchQuery = '';
        syncNewsSearchChrome();
        renderNews();
      }
      return;
    }
    newsSearchDebounce = setTimeout(() => {
      setNewsSearchQuery(value, { render: true });
    }, 120);
  });

  NEWS_SEARCH_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (newsSearchQuery || String(NEWS_SEARCH_INPUT.value || '').trim()) {
        clearNewsSearch({ keepOpen: true });
      } else {
        setNewsSearchOpen(false);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Appliquer tout de suite (sans attendre le debounce).
      clearTimeout(newsSearchDebounce);
      setNewsSearchQuery(NEWS_SEARCH_INPUT.value, { render: true });
      NEWS_SEARCH_INPUT.blur();
    }
  });

  // × dans le champ : effacer la requête, fil complet, panneau reste ouvert.
  NEWS_SEARCH_CLEAR?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearNewsSearch({ keepOpen: true });
  });

  // Clic extérieur : ferme le panneau loupe.
  // Important : un clic sur un résultat (dans #news-list) ne doit PAS effacer la
  // recherche au pointerdown — sinon le nœud <a.article> est détruit avant le click
  // et l'utilisateur n'atteint jamais l'article source.
  document.addEventListener('pointerdown', (e) => {
    if (!newsSearchOpen) return;
    if (NEWS_SEARCH?.contains(e.target)) return;
    // Résultat du fil : laisser le lien s'ouvrir ; on referme seulement le panneau.
    if (NEWS_LIST?.contains(e.target)) {
      setNewsSearchOpen(false);
      return;
    }
    const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT?.value || '').trim());
    if (hasQuery) clearNewsSearch({ keepOpen: false });
    else setNewsSearchOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !newsSearchOpen) return;
    if (e.target === NEWS_SEARCH_INPUT) return; // géré sur l'input
    const hasQuery = !!(newsSearchQuery || String(NEWS_SEARCH_INPUT?.value || '').trim());
    if (hasQuery) clearNewsSearch({ keepOpen: false });
    else setNewsSearchOpen(false);
  });

  // Suivre l'apparition/disparition du clavier virtuel (mobile).
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateNewsSearchKeyboardInset);
    window.visualViewport.addEventListener('scroll', updateNewsSearchKeyboardInset);
  }

  // Raccourci « / » (comme beaucoup de docs) — hors champs de saisie.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    if (!NEWS_LIST) return; // page sans fil
    e.preventDefault();
    setNewsSearchOpen(true);
  });

  syncNewsSearchChrome();
}

function renderNewsFilters() {
  if (!NEWS_FILTERS) return;
  const sources = sortSourcesForFilters([...new Set(news.map(n => n.source))]);
  [...NEWS_FILTERS.querySelectorAll('[data-source]:not([data-source="all"])')].forEach(b => b.remove());

  sources.forEach(src => {
    const btn = document.createElement('button');
    const { institution, type, color } = sourceInfo(src);
    const instLabel = filterSourceInstitutionLabel(institution, type, src);

    btn.className = 'filter-btn';
    btn.dataset.source = src;
    btn.style.setProperty('--c', color);
    btn.title = institution ? `${src} — ${instLabel || formatInstitutionDisplay(institution)}` : src;
    btn.innerHTML = `
      <span class="filter-btn__row">
        <span class="filter-btn__dot" aria-hidden="true"></span>
        <span class="filter-btn__name notranslate" translate="no">${escapeHtml(src)}</span>
      </span>
      ${instLabel ? '<span class="filter-btn__inst"></span>' : ''}
    `;
    NEWS_FILTERS.appendChild(btn);
  });

  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => selectNewsSource(btn.dataset.source);
  });

  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.source === newsSourceFilter));

  syncFiltersPanel();
  registerFilterMarqueeObservers();
  applyFilterInstMarquees();
  scheduleFilterMarqueeRefresh();
  markUiReady(FILTERS_PANEL);
}

function renderNews() {
  if (!NEWS_LIST) return;
  const isSourceView = newsSourceFilter !== 'all';
  const tokens = searchTokens(newsSearchQuery);
  const isSearchView = tokens.length > 0;

  let items = isSourceView
    ? news.filter(n => n.source === newsSourceFilter)
    : news;
  if (isSearchView) {
    items = items.filter((n) => articleMatchesSearch(n, tokens));
  }

  NEWS_EMPTY.classList.toggle('hidden', items.length > 0);
  if (NEWS_EMPTY) {
    const emptyP = NEWS_EMPTY.querySelector('p');
    if (emptyP) {
      if (isSearchView && !items.length) {
        emptyP.textContent = `Aucun résultat pour « ${newsSearchQuery} ».`;
      } else {
        emptyP.textContent = 'Aucun article pour le moment.';
      }
    }
  }

  const countLabel = isSearchView
    ? `${items.length} résultat${items.length !== 1 ? 's' : ''}`
    : `${items.length} article${items.length !== 1 ? 's' : ''}`;
  NEWS_COUNT.textContent = countLabel;

  NEWS_LIST.innerHTML = '';
  if (isSearchView) {
    NEWS_LIST.dataset.mode = 'search';
  } else if (isSourceView) {
    NEWS_LIST.dataset.mode = 'source';
  } else {
    NEWS_LIST.removeAttribute('data-mode');
  }

  // Mode recherche (loupe) : liste plate, tous les résultats visibles.
  // Pas de suite du fil ni de « Plus d'articles » — le repli ne s'applique pas.
  if (isSearchView) {
    NEWS_LIST.removeAttribute('data-contingency');
    NEWS_LIST.removeAttribute('data-autumn-grace');
    NEWS_LIST.removeAttribute('data-brief-count');
    NEWS_LIST.removeAttribute('data-hero');
    newsTailExpanded = false;

    if (items.length) {
      const section = document.createElement('div');
      section.className = 'news-search-results';
      const qEsc = escapeHtml(newsSearchQuery);
      section.innerHTML = `<h3 class="news-search-results__title">Résultats pour « ${qEsc} »</h3>`;
      sortSearchResults(items, tokens).forEach((item) => {
        const article = safeCreateArticle(item, 'standard');
        if (article) section.appendChild(article);
      });
      NEWS_LIST.appendChild(section);
    }
    NEWS_LIST.dataset.ready = '1';
    return;
  }

  const hero = document.createElement('div');
  hero.className = 'news-hero';
  const compacts = [];
  const tail = [];

  const partition = isSourceView
    ? partitionSourceFeed(items)
    : partitionNewsFeed(items);
  const { heroItems, briefItems, tailItems, contingencyBand } = partition;

  if (contingencyBand > 0) {
    NEWS_LIST.dataset.contingency = String(contingencyBand);
  } else {
    NEWS_LIST.removeAttribute('data-contingency');
  }
  if (!isSourceView && isAutumnGracePeriod()) {
    NEWS_LIST.dataset.autumnGrace = '1';
  } else {
    NEWS_LIST.removeAttribute('data-autumn-grace');
  }

  // Wide E : 2 unes dès 1920, 3 à 3840 — même gabarit fil général et vue source.
  const wideDualLead = isWideDualLeadViewport();
  const leadCount = wideDualLead ? Math.min(wideHeroLeadCount(), heroItems.length) : 1;
  if (wideDualLead) hero.dataset.leads = String(leadCount);
  else hero.removeAttribute('data-leads');
  heroItems.forEach((item, i) => {
    const role = i < leadCount ? 'lead' : 'feature';
    const article = safeCreateArticle(item, role);
    if (article) hero.appendChild(article);
  });

  briefItems.forEach((item) => {
    const article = safeCreateArticle(item, 'compact');
    if (article) compacts.push(article);
  });

  tailItems.forEach((item) => {
    const article = safeCreateArticle(item, 'standard');
    if (article) tail.push(article);
  });

  if (hero.childElementCount) {
    NEWS_LIST.appendChild(hero);
  }
  if (compacts.length) {
    const briefRail = document.createElement('div');
    briefRail.className = 'brief-rail';
    briefRail.innerHTML = '<h3 class="brief-rail-title">En bref</h3>';
    compacts.forEach((article) => briefRail.appendChild(article));
    NEWS_LIST.appendChild(briefRail);
  }

  if (tail.length) {
    const section = document.createElement('div');
    section.className = 'news-tail';
    section.innerHTML = '<h3 class="news-tail-title">Suite du fil</h3><div class="news-tail-body"></div>';
    const body = section.querySelector('.news-tail-body');
    tail.forEach((article) => body.appendChild(article));
    NEWS_LIST.appendChild(section);
  }

  const briefCount = compacts.length;
  if (briefCount) NEWS_LIST.dataset.briefCount = String(briefCount);
  else NEWS_LIST.removeAttribute('data-brief-count');

  // Nouveau rendu : replier la suite sauf si l'utilisateur l'avait déjà ouverte
  // (conservé via newsTailExpanded entre rebalances, reset sur filtre/recherche).
  syncNewsTailCollapse({ preserveExpanded: false });

  updateNewsLayout();
  // Équilibre magazine : combler le vide sous vedettes et/ou sous En bref.
  scheduleMagazineColumnBalance();
  NEWS_LIST.dataset.ready = '1';
  lastMagazineViewportKey = magazineViewportKey();
}

/** Aperçu de la rangée suivante (titres lisibles), comme --filters-peek. */
const NEWS_TAIL_PEEK_PX = 34;

function ensureNewsTailBody(tail) {
  if (!tail) return null;
  let body = tail.querySelector('.news-tail-body');
  if (body) return body;
  body = document.createElement('div');
  body.className = 'news-tail-body';
  const title = tail.querySelector('.news-tail-title');
  const toggle = tail.querySelector('.news-tail-toggle');
  const loose = [...tail.querySelectorAll(':scope > .article, :scope > a.article')];
  loose.forEach((el) => body.appendChild(el));
  if (toggle) tail.insertBefore(body, toggle);
  else if (title) title.insertAdjacentElement('afterend', body);
  else tail.appendChild(body);
  return body;
}

function getNewsTailCards(tail) {
  const body = ensureNewsTailBody(tail);
  if (!body) return [];
  return [...body.querySelectorAll(':scope > .article, :scope > a.article')];
}

/**
 * Hauteur repliée = bas du 10e article + peek (titres de la rangée d’après).
 */
function measureNewsTailCollapsedHeight(body, cards, visibleCount, peekPx) {
  if (!body || !cards.length) return 0;
  const lastIdx = Math.min(visibleCount, cards.length) - 1;
  const last = cards[lastIdx];
  if (!last) return 0;
  const bodyTop = body.getBoundingClientRect().top;
  const lastBottom = last.getBoundingClientRect().bottom;
  const h = lastBottom - bodyTop + peekPx;
  return Math.max(0, Math.ceil(h));
}

function applyNewsTailCollapsedHeight(tail) {
  const body = tail?.querySelector('.news-tail-body');
  if (!body || !tail.classList.contains('has-overflow') || tail.classList.contains('is-expanded')) {
    body?.style.removeProperty('--news-tail-collapsed-h');
    body?.style.removeProperty('max-height');
    return;
  }
  const cards = getNewsTailCards(tail);
  // Mesure avec tous les articles en layout (pas display:none)
  const h = measureNewsTailCollapsedHeight(body, cards, NEWS_TAIL_VISIBLE, NEWS_TAIL_PEEK_PX);
  if (h > 0) {
    body.style.setProperty('--news-tail-collapsed-h', `${h}px`);
    body.style.maxHeight = `${h}px`;
  }
}

/**
 * Replie la Suite du fil après NEWS_TAIL_VISIBLE articles (comme « Plus de sources »).
 * Aperçu des titres de la rangée suivante + fondu, puis bouton.
 * Ne s'applique jamais à la recherche (liste plate, pas de .news-tail).
 */
function syncNewsTailCollapse({ preserveExpanded = true } = {}) {
  // Recherche loupe : résultats plats, aucun repli.
  if (NEWS_LIST?.dataset.mode === 'search') return;

  const tail = NEWS_LIST?.querySelector('.news-tail');
  if (!tail) return;

  const body = ensureNewsTailBody(tail);
  const cards = getNewsTailCards(tail);
  const overflow = cards.length > NEWS_TAIL_VISIBLE;

  // Overflow : pas de display:none (peek des titres). Marque pour le module
  // de traduction : ne pas MT les cartes *entièrement* hors écran, mais
  // traduire la rangée peek (titres partiels visibles sous le fondu).
  cards.forEach((el, i) => {
    el.classList.remove('news-tail-article--overflow');
    const pastFull = overflow && !newsTailExpanded && i >= NEWS_TAIL_VISIBLE;
    const pastPeek = overflow && !newsTailExpanded
      && i >= NEWS_TAIL_VISIBLE + NEWS_TAIL_PEEK_TRANSLATE;
    el.classList.toggle('is-tail-overflow', pastFull);
    // data-translate-skip = hors zone visible + peek uniquement
    if (pastPeek) el.setAttribute('data-translate-skip', '1');
    else el.removeAttribute('data-translate-skip');
  });

  let toggle = tail.querySelector('.news-tail-toggle');
  if (overflow) {
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'news-tail-toggle';
      toggle.innerHTML = '<span class="news-tail-toggle__label">Plus d\'articles</span>';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const willExpand = !newsTailExpanded;
        // Mémoriser la position du bouton : à l’ouverture le body s’allonge
        // *au-dessus* du bouton et le navigateur scrolle pour le garder focusé
        // → bas de page. On fige le scroll viewport.
        const yBefore = window.scrollY || window.pageYOffset || 0;
        const toggleTopBefore = toggle.getBoundingClientRect().top;

        newsTailExpanded = willExpand;
        syncNewsTailCollapse({ preserveExpanded: true });

        // Traduire les cartes nouvellement visibles seulement au dépliage
        // (évite de MT toute la suite du fil au choix de langue).
        if (willExpand && typeof window.RadarTranslate?.onNewsTailExpand === 'function') {
          window.setTimeout(() => window.RadarTranslate.onNewsTailExpand(), 0);
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (willExpand) {
              // Contenu s’ouvre vers le bas : rester où on était (ne pas suivre le bouton)
              window.scrollTo({ top: yBefore, left: 0, behavior: 'auto' });
            } else {
              // Repli : garder le bouton à la même place à l’écran
              const delta = toggle.getBoundingClientRect().top - toggleTopBefore;
              if (Math.abs(delta) > 1) {
                window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
              }
            }
          });
        });
      });
      tail.appendChild(toggle);
    }
    tail.classList.add('has-overflow');
    if (!preserveExpanded) newsTailExpanded = false;
    tail.classList.toggle('is-expanded', newsTailExpanded);
    tail.dataset.tailVisible = String(NEWS_TAIL_VISIBLE);
    tail.dataset.tailPeekTranslate = String(NEWS_TAIL_PEEK_TRANSLATE);
    const label = toggle.querySelector('.news-tail-toggle__label');
    const hidden = cards.length - NEWS_TAIL_VISIBLE;
    if (label) {
      label.textContent = newsTailExpanded
        ? 'Réduire'
        : `Plus d'articles (${hidden})`;
    }
    toggle.setAttribute('aria-expanded', newsTailExpanded ? 'true' : 'false');

    // max-height après paint (grille 1 ou 2 colonnes)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (newsTailExpanded) {
          body.style.maxHeight = 'none';
          body.style.removeProperty('--news-tail-collapsed-h');
        } else {
          applyNewsTailCollapsedHeight(tail);
        }
      });
    });
  } else {
    tail.classList.remove('has-overflow', 'is-expanded');
    body.style.maxHeight = 'none';
    body.style.removeProperty('--news-tail-collapsed-h');
    toggle?.remove();
    if (!preserveExpanded) newsTailExpanded = false;
  }
}

function updateNewsLayout() {
  const lead = NEWS_LIST.querySelector('.article--lead');
  if (!lead) {
    NEWS_LIST.removeAttribute('data-hero');
    return;
  }
  NEWS_LIST.dataset.hero = lead.classList.contains('has-image') ? 'image' : 'text';
}

/*
 * Partition magazine — fraîcheur d’abord, aucun article perdu :
 *
 *  A) SNAPSHOT :
 *     - Une + vedettes = les N plus frais (tranche contiguë)
 *     - En bref = 1) une source / établissement, 2) sources sœurs encore
 *       absentes, 3) 2ᵉ titre seulement quand toutes les sources du reste
 *       sont représentées (une ∪ En bref). Suite = tout le reste (rien d’omis).
 *
 *  B) ÉQUILIBRE (magazine 2 col, dès 768 px) — *seulement* En bref :
 *     1) TRIM si trop haute (→ suite)
 *     2) FILL si trop basse (même ordre de priorité, depuis la réserve)
 *     iPad portrait 768–834 : même rail CSS que mid ; sans cet équilibre
 *     la graine bureau (≈10 brèves) laisse un vide sous les vedettes.
 */
const HERO_FEATURE_MIN = 4; /* 4 vedettes + 1 une = 5 (prod) */
const HERO_FEATURE_MAX = 4;
const HERO_SPOTLIGHT_MAX = 1 + HERO_FEATURE_MIN; /* 5 au total prod */
/* Wide E : 2 unes dès 1920 ; 3 unes + 6 vedettes (3 col) à 3840. */
const HERO_WIDE_LEAD_COUNT = 2;
const HERO_WIDE_FEATURE_MIN = 4;
const HERO_UHD_LEAD_COUNT = 3;
const HERO_UHD_FEATURE_MIN = 6;

function isWideDualLeadViewport() {
  try {
    return typeof isWideNoMarqueeMode === 'function'
      && isWideNoMarqueeMode()
      && window.matchMedia('(min-width: 1920px)').matches;
  } catch {
    return false;
  }
}

function wideHeroLeadCount() {
  if (!isWideDualLeadViewport()) return 1;
  try {
    return window.matchMedia('(min-width: 3840px)').matches
      ? HERO_UHD_LEAD_COUNT
      : HERO_WIDE_LEAD_COUNT;
  } catch {
    return HERO_WIDE_LEAD_COUNT;
  }
}

function wideHeroFeatureCount() {
  if (!isWideDualLeadViewport()) return HERO_FEATURE_MIN;
  try {
    return window.matchMedia('(min-width: 3840px)').matches
      ? HERO_UHD_FEATURE_MIN
      : HERO_WIDE_FEATURE_MIN;
  } catch {
    return HERO_WIDE_FEATURE_MIN;
  }
}

function wideHeroSpotlightMax() {
  return isWideDualLeadViewport()
    ? wideHeroLeadCount() + wideHeroFeatureCount()
    : HERO_SPOTLIGHT_MAX;
}
const BRIEF_SIDEBAR_SEED_MIN = 4;
const BRIEF_SIDEBAR_SEED_MAX = 12;
const BRIEF_SIDEBAR_MAX = 18;
const BRIEF_SIDEBAR_HARD_MIN = 2; /* plancher trim — au-dessous on accepte le vide */
const BRIEF_SIDEBAR_MIN = BRIEF_SIDEBAR_SEED_MIN;
const AVG_LEAD_CARD_H = 400;
const AVG_FEATURE_CARD_H = 148;
const AVG_BRIEF_CARD_H = 108;
const AVG_BRIEF_TITLE_H = 42;
/*
 * Tolérance d’équité colonnes (hero vs En bref).
 * Doit rester nettement sous une carte En bref (~108 px) : à 96 px, une fiche
 * de trop restait visible sous les vedettes. 40 px = petit spacer OK, 1 carte non.
 */
const COLUMN_HEIGHT_TOL = 40;
/* Vue source hors wide dual : 1 une + jusqu’à 2 vedettes (fraîcheur).
 * Wide E (≥1920) : même N que le fil général (2 unes + vedettes, 3 à 3840). */
const SOURCE_FEATURE_MAX = 2;
const SOURCE_HERO_SPOTLIGHT_MAX = 1 + SOURCE_FEATURE_MAX;

function sourceHeroSpotlightMax() {
  return isWideDualLeadViewport() ? wideHeroSpotlightMax() : SOURCE_HERO_SPOTLIGHT_MAX;
}

function estimateHeroSeedHeight(heroCount) {
  if (heroCount <= 0) return 0;
  const wideDual = isWideDualLeadViewport() && heroCount >= 2;
  if (wideDual) {
    const leads = Math.min(wideHeroLeadCount(), heroCount);
    const feats = Math.max(0, heroCount - leads);
    const leadH = Math.round(AVG_LEAD_CARD_H * (leads >= 3 ? 1.02 : 1.15));
    const featCols = (window.innerWidth || 0) >= 3840 ? 3 : 2;
    const featRows = Math.ceil(feats / featCols);
    return leadH + featRows * AVG_FEATURE_CARD_H;
  }
  return Math.round(AVG_LEAD_CARD_H * 1.2) + Math.max(0, heroCount - 1) * AVG_FEATURE_CARD_H;
}

/** Nombre de colonnes CSS En bref (wide E). */
function briefWideColumnCount() {
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return 1;
  try {
    /* 2 col seulement quand la piste ≈ 2× la largeur En bref de 1920. */
    if ((window.innerWidth || 0) >= 3440) return 2;
  } catch { /* ignore */ }
  return 1;
}

/**
 * Graine En bref ≈ hauteur hero estimée.
 * @param {number} heroCount
 * @param {{ sourceMode?: boolean }} [opts] — vue source : une image + vedettes
 *   sous-estiment souvent la hauteur réelle → graine un peu plus haute.
 */
function briefSeedCountForHero(heroCount, opts = {}) {
  const sourceMode = !!opts.sourceMode;
  const mid = !sourceMode && isMidwidthMagazinePreview();
  const wideE = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  // Mid : rail 240–280 px → chaque carte En bref est plus haute (titres wrap).
  // Wide multi-col : graine = lignes × colonnes (pas hauteur/cardH qui sous-estime).
  let cardH = mid ? Math.round(AVG_BRIEF_CARD_H * 1.35) : AVG_BRIEF_CARD_H;
  let cols = 1;
  if (wideE) {
    cols = briefWideColumnCount();
    // Hauteur de ligne réelle compact (souvent 160–220 avec image) — graine large.
    cardH = Math.max(140, AVG_BRIEF_CARD_H + 40);
  }
  const target = Math.max(0, estimateHeroSeedHeight(heroCount) - AVG_BRIEF_TITLE_H);
  // Source : un peu au-dessus de l’estimé (images), sans graine trop haute
  // (sinon 1 carte de trop en En bref après paint).
  const mult = sourceMode ? 1.45 : (mid ? 0.85 : (wideE ? 1.35 : 1));
  let n = Math.round((target * mult) / cardH);
  if (wideE && cols > 1) {
    // Remplir des rangées complètes : rows × cols
    const rows = Math.max(3, Math.ceil(n / cols));
    n = rows * cols;
  }
  const min = sourceMode && !wideE
    ? Math.max(BRIEF_SIDEBAR_SEED_MIN, 5)
    : (mid ? 3 : (wideE ? Math.max(BRIEF_SIDEBAR_SEED_MIN, cols * (cols > 1 ? 5 : 3)) : BRIEF_SIDEBAR_SEED_MIN));
  const max = sourceMode && !wideE
    ? Math.min(BRIEF_SIDEBAR_MAX, BRIEF_SIDEBAR_SEED_MAX + 2)
    : (mid ? Math.min(8, BRIEF_SIDEBAR_SEED_MAX)
      : (wideE ? briefSidebarMaxSlots() : BRIEF_SIDEBAR_SEED_MAX));
  return Math.min(max, Math.max(min, n));
}

/** Réserve = suite du fil (date desc) pour le fill B uniquement. */
let magazineReserve = [];
let magazineBalanceTimer = 0;
let magazineBalanceBusy = false;
/** True si un rebalance a été demandé pendant qu'un fill tournait. */
let magazineBalanceQueued = false;
const magazineMeta = {
  heroKeys: new Set(),
  heroSources: new Set(),
  heroInsts: new Set(),
  briefKeys: new Set(),
  briefSources: new Set(),
  briefInsts: new Set(),
};
/**
 * Fraîcheur universelle : scripts/session-freshness-lib.js
 * (même règle bots + UI — automne/hiver/été + grâce septembre).
 */
const _SF = (typeof RadarSessionFreshness !== 'undefined') ? RadarSessionFreshness : null;
const FRESHNESS_SESSION_COUNT = _SF?.FRESHNESS_SESSION_COUNT ?? 3;
const CONTINGENCY_MAX_SESSIONS_BACK = _SF?.CONTINGENCY_MAX_SESSIONS_BACK
  ?? (FRESHNESS_SESSION_COUNT - 1);
/* Stack 1 col / hors magazine : budgets larges (parité Kiosque). */
const BRIEF_LIMITS = { lead: 960, feature: 960, compact: 420, standard: 300 };
/**
 * Magazine 2 colonnes — extraits bornés pour l’équilibre, sans affamer En bref.
 * (compact trop bas → chapôs ridicules + « Lire la suite » trop tôt.)
 */
const BRIEF_LIMITS_DESKTOP_MAG = { lead: 780, feature: 680, compact: 340, standard: 280 };
const BRIEF_LIMITS_MID = { lead: 700, feature: 580, compact: 300, standard: 260 };
const LEAD_BRIEF_MIN_CHARS = 160;
const BRIEF_COMPACT_MIN_CHARS = 150;
const FEATURE_BRIEF_MIN_CHARS = LEAD_BRIEF_MIN_CHARS;
const LEAD_BRIEF_MIN_CHARS_MAG = 120;
const BRIEF_COMPACT_MIN_CHARS_MAG = 130;
const FEATURE_BRIEF_MIN_CHARS_MAG = 110;
const LEAD_BRIEF_MIN_CHARS_MID = 110;
const BRIEF_COMPACT_MIN_CHARS_MID = 120;
const FEATURE_BRIEF_MIN_CHARS_MID = 100;

/** Bureau magazine ≥1100 (hors mid 768–1099). */
function isDesktopMagazineLayout() {
  if (isMidwidthMagazineLayout()) return false;
  try {
    return window.matchMedia('(min-width: 1100px)').matches;
  } catch {
    return false;
  }
}

/** Budgets d’extrait : mid C → desktop mag → stack large. */
function briefLimitForRole(role = 'standard') {
  let table = BRIEF_LIMITS;
  if (isMidwidthMagazinePreview()) table = BRIEF_LIMITS_MID;
  else if (isDesktopMagazineLayout()) table = BRIEF_LIMITS_DESKTOP_MAG;
  return table[role] ?? 170;
}

function briefMinCharsForRole(role = 'standard') {
  if (isMidwidthMagazinePreview()) {
    if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS_MID;
    if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS_MID;
    if (role === 'lead') return LEAD_BRIEF_MIN_CHARS_MID;
  }
  if (isDesktopMagazineLayout()) {
    if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS_MAG;
    if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS_MAG;
    if (role === 'lead') return LEAD_BRIEF_MIN_CHARS_MAG;
  }
  if (role === 'compact') return BRIEF_COMPACT_MIN_CHARS;
  if (role === 'feature') return FEATURE_BRIEF_MIN_CHARS;
  return LEAD_BRIEF_MIN_CHARS;
}

function articleKey(item) {
  return item.link || `${item.source}::${item.date}::${item.title}`;
}

function institutionKey(item) {
  return item.institution || item.source;
}

function sourceKey(item) {
  return item.source;
}

function latestPerKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    const cur = map.get(k);
    if (!cur || new Date(item.date || 0) > new Date(cur.date || 0)) {
      map.set(k, item);
    }
  }
  return map;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

/* --- Calendrier / fraîcheur : délégué à session-freshness-lib (universel) --- */
function getCurrentUniversitySessionStart(referenceDate = new Date()) {
  return _SF
    ? _SF.getCurrentUniversitySessionStart(referenceDate)
    : (() => {
      const y = referenceDate.getFullYear();
      const m = referenceDate.getMonth();
      if (m >= 8) return new Date(y, 8, 1);
      if (m >= 4) return new Date(y, 4, 1);
      return new Date(y, 0, 1);
    })();
}

function getUniversitySessionStart(referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.getUniversitySessionStart(referenceDate, sessionsBack)
    : getCurrentUniversitySessionStart(referenceDate);
}

function getUniversitySessionBand(referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.getUniversitySessionBand(referenceDate, sessionsBack)
    : { start: getCurrentUniversitySessionStart(referenceDate), end: referenceDate };
}

function isWithinUniversitySessionBand(item, referenceDate = new Date(), sessionsBack = 0) {
  return _SF
    ? _SF.isWithinUniversitySessionBand(item, referenceDate, sessionsBack)
    : false;
}

function sessionBandPool(items, referenceDate = new Date(), sessionsBack = 0) {
  return sortByDateDesc(
    items.filter((i) => isWithinUniversitySessionBand(i, referenceDate, sessionsBack)),
  );
}

function isAutumnGracePeriod(referenceDate = new Date()) {
  return _SF
    ? _SF.isAutumnGracePeriod(referenceDate)
    : referenceDate.getMonth() === 8;
}

function freshnessMaxSessionsBack(referenceDate = new Date()) {
  return _SF
    ? _SF.freshnessMaxSessionsBack(referenceDate)
    : CONTINGENCY_MAX_SESSIONS_BACK + (isAutumnGracePeriod(referenceDate) ? 1 : 0);
}

function isWithinFreshnessWindow(item, referenceDate = new Date()) {
  return _SF
    ? _SF.isWithinFreshnessWindow(item, referenceDate)
    : false;
}

function isPublishedOnOrBefore(item, referenceDate = new Date()) {
  return _SF
    ? _SF.isPublishedOnOrBefore(item, referenceDate)
    : (() => {
      const published = new Date(item.date || 0);
      return Number.isFinite(published.getTime()) && published.getTime() <= referenceDate.getTime();
    })();
}

function filterFreshItems(items, referenceDate = new Date()) {
  return _SF
    ? _SF.filterFreshItems(items, referenceDate)
    : items.filter(
      (item) => isPublishedOnOrBefore(item, referenceDate) && isWithinFreshnessWindow(item, referenceDate),
    );
}

function itemHasThumbPhoto(item) {
  return hasUsablePhoto(item, 'feature') || hasStockPhoto(item, 'feature');
}

function isArticlePicked(item, picks) {
  const key = articleKey(item);
  return picks.some((pick) => articleKey(pick) === key);
}

/**
 * À la une + vedettes — **strictement par date** sur le pool déjà filtré frais.
 * (filterFreshItems a déjà appliqué la fenêtre 3 sessions ; pas de bande
 * intermédiaire qui re-trierait autrement.)
 * - Une = sorted[0] (le plus récent de tout le fil)
 * - Vedettes = sorted[1..n] (même source OK)
 * Ainsi on n'aura jamais un 12 mai en une/vedette tant qu'un 10 juil. reste
 * dans la suite du fil.
 */
function pickHeroSpotlight(items, _referenceDate = new Date()) {
  const sorted = sortByDateDesc(items);
  if (!sorted.length) {
    return { items: [], contingencyBand: 0 };
  }
  const wideDual = isWideDualLeadViewport();
  const maxN = wideDual ? wideHeroSpotlightMax() : HERO_SPOTLIGHT_MAX;
  const n = Math.min(maxN, sorted.length);
  // Tranche contiguë des n plus frais. Wide dual : les 2 unes = les 2 plus frais
  // (même institution OK — pas de glissement pour « diversifier »).
  const picked = sorted.slice(0, n);
  return {
    items: picked,
    contingencyBand: 0,
  };
}

/** Sources déjà montrées (une / vedettes / En bref). */
function magazineRepresentedSources(heroItems = [], briefItems = []) {
  const out = new Set();
  for (const item of heroItems) {
    const s = sourceKey(item);
    if (s) out.add(s);
  }
  for (const item of briefItems) {
    const s = sourceKey(item);
    if (s) out.add(s);
  }
  return out;
}

/** Il reste dans `pool` un article d’une source encore absente de `usedSources`. */
function poolHasUncoveredSource(pool, usedSources, skipKeys) {
  for (const item of pool) {
    if (skipKeys.has(articleKey(item))) continue;
    const src = sourceKey(item);
    if (src && !usedSources.has(src)) return true;
  }
  return false;
}

/**
 * En bref, dans l’ordre (toujours date desc à l’intérieur d’une passe) :
 *  1) 1er titre d’un établissement pas encore à la une ni en En bref
 *     (et d’une source pas déjà à la une) — représentativité campus
 *  2) sources sœurs encore absentes (autre journal du même campus)
 *  3) 2ᵉ titre d’une source / institution **seulement** s’il ne reste
 *     aucune source non représentée dans le reste du fil
 *
 * Tout le reste va dans la suite : aucun article n’est omis.
 * @param {number} [maxSlots]
 */
function pickBriefSidebar(allItems, heroItems = [], _referenceDate = new Date(), maxSlots = null) {
  const heroKeys = new Set(heroItems.map(articleKey));
  const heroSources = new Set(heroItems.map(sourceKey).filter(Boolean));
  const heroInsts = new Set(heroItems.map(institutionKey).filter(Boolean));
  const remaining = sortByDateDesc(allItems).filter((item) => !heroKeys.has(articleKey(item)));
  const limit = Math.max(
    1,
    maxSlots == null ? briefSeedCountForHero(heroItems.length) : maxSlots,
  );

  const picks = [];
  const pickedKeys = new Set();
  const briefSources = new Set();
  const briefInsts = new Set();

  const usedSources = () => {
    const s = new Set(heroSources);
    for (const x of briefSources) s.add(x);
    return s;
  };

  const take = (item) => {
    picks.push(item);
    pickedKeys.add(articleKey(item));
    const src = sourceKey(item);
    const inst = institutionKey(item);
    if (src) briefSources.add(src);
    if (inst) briefInsts.add(inst);
  };

  // Passe 1 — un établissement, une source, fraîcheur.
  for (const item of remaining) {
    if (picks.length >= limit) break;
    const src = sourceKey(item);
    const inst = institutionKey(item);
    if (!src) continue;
    if (heroSources.has(src) || briefSources.has(src)) continue;
    if (inst && (heroInsts.has(inst) || briefInsts.has(inst))) continue;
    take(item);
  }

  // Passe 2 — sources encore absentes (journal sœur), toujours fraîcheur.
  if (picks.length < limit) {
    for (const item of remaining) {
      if (picks.length >= limit) break;
      if (pickedKeys.has(articleKey(item))) continue;
      const src = sourceKey(item);
      if (!src || heroSources.has(src) || briefSources.has(src)) continue;
      take(item);
    }
  }

  // Passe 3 — 2ᵉ titre seulement si toutes les sources du reste sont là.
  if (picks.length < limit && !poolHasUncoveredSource(remaining, usedSources(), pickedKeys)) {
    const perSrc = new Map();
    for (const item of [...heroItems, ...picks]) {
      const src = sourceKey(item);
      if (src) perSrc.set(src, (perSrc.get(src) || 0) + 1);
    }
    for (const item of remaining) {
      if (picks.length >= limit) break;
      if (pickedKeys.has(articleKey(item))) continue;
      const src = sourceKey(item);
      if ((perSrc.get(src) || 0) >= 2) continue;
      take(item);
      if (src) perSrc.set(src, (perSrc.get(src) || 0) + 1);
    }
  }

  return {
    items: sortByDateDesc(picks),
    contingencyBand: 0,
  };
}

/**
 * Filet d'invariants après partition / fill :
 * - la une = article le plus frais du pool global
 * - aucune vedette plus ancienne qu'un article encore en suite du fil
 *   qui pourrait la remplacer dans le top-N hero
 * (réordonne hero en tranche contiguë des |hero| plus frais du pool).
 */
function enforceHeroDateOrder(heroItems, allSorted) {
  if (!heroItems?.length || !allSorted?.length) return heroItems || [];
  const wideDual = isWideDualLeadViewport();
  const floor = wideDual ? wideHeroSpotlightMax() : HERO_SPOTLIGHT_MAX;
  const n = Math.min(Math.max(heroItems.length, floor), allSorted.length);
  // Filet : n plus frais, dans l’ordre. Dual une = les 2 dates les plus récentes.
  return allSorted.slice(0, n);
}

function resetMagazineMeta(heroItems = [], briefItems = []) {
  magazineMeta.heroKeys = new Set(heroItems.map(articleKey));
  magazineMeta.heroSources = new Set(heroItems.map(sourceKey));
  magazineMeta.heroInsts = new Set(heroItems.map(institutionKey));
  magazineMeta.briefKeys = new Set(briefItems.map(articleKey));
  magazineMeta.briefSources = new Set(briefItems.map(sourceKey));
  magazineMeta.briefInsts = new Set(briefItems.map(institutionKey));
}

function partitionNewsFeed(items, referenceDate = new Date()) {
  // Pool unique, date desc — seule source de vérité pour l'ordre de fraîcheur.
  const sorted = sortByDateDesc(filterFreshItems(items, referenceDate));
  const { items: rawHero, contingencyBand: heroBand } = pickHeroSpotlight(sorted, referenceDate);
  // Filet : une + vedettes = toujours les |n| plus frais du pool.
  const heroItems = enforceHeroDateOrder(
    ensureHeroLeadHasImage(rawHero, sorted),
    sorted,
  );
  // Graine En bref ≈ hauteur estimée du hero ; le fill ne touche qu'à En bref.
  const briefSeed = briefSeedCountForHero(heroItems.length);
  const { items: briefItems, contingencyBand: briefBand } = pickBriefSidebar(
    sorted,
    heroItems,
    referenceDate,
    briefSeed,
  );
  const heroKeys = new Set(heroItems.map(articleKey));
  const briefClean = briefItems.filter((i) => !heroKeys.has(articleKey(i)));
  const briefKeysClean = new Set(briefClean.map(articleKey));
  const tailItems = sorted.filter(
    (i) => !heroKeys.has(articleKey(i)) && !briefKeysClean.has(articleKey(i)),
  );
  // Réserve pour le fill magazine (phase B)
  magazineReserve = tailItems.slice();
  resetMagazineMeta(heroItems, briefClean);
  const contingencyBand = Math.max(heroBand, briefBand);
  return { heroItems, briefItems: briefClean, tailItems, contingencyBand };
}

/**
 * Magazine 2 col dès 768 px (CSS mid + iPad portrait).
 * · 768–1099 : magazine mid (rail étroit) — iPad mini/Air/Pro 11 portrait
 * · ≥1100 : magazine bureau
 * Le CSS a baissé le seuil de 900 → 768 pour les iPad portrait ; le JS
 * d’équilibre / graine / extraits mid doit suivre, sinon En bref sème
 * trop de cartes (graine bureau) et laisse un vide sous les vedettes.
 * Recherche = liste plate — pas d’équilibre colonnes.
 */
const MAGAZINE_MID_MIN_PX = 768;
const MAGAZINE_MID_MAX_PX = 1099.98;

function canBalanceMagazineColumns() {
  if (!NEWS_LIST) return false;
  if (NEWS_LIST.dataset.mode === 'search') return false;
  const minPx = (typeof window.__radarMidwidthPreview?.magazineMinPx === 'function')
    ? window.__radarMidwidthPreview.magazineMinPx()
    : MAGAZINE_MID_MIN_PX;
  return window.matchMedia(`(min-width: ${minPx}px)`).matches;
}

/**
 * Magazine mid 768–1099 (prod) — même plage que le CSS 2 col étroit.
 * Rail étroit → cartes En bref plus hautes ; budgets d’extrait MID.
 */
function isMidwidthMagazinePreview() {
  try {
    return window.matchMedia(
      `(min-width: ${MAGAZINE_MID_MIN_PX}px) and (max-width: ${MAGAZINE_MID_MAX_PX}px)`,
    ).matches;
  } catch {
    return false;
  }
}

/** Alias sémantique prod (même plage que isMidwidthMagazinePreview). */
function isMidwidthMagazineLayout() {
  return isMidwidthMagazinePreview();
}

function removeTailArticleForItem(item) {
  const tail = NEWS_LIST?.querySelector('.news-tail');
  if (!tail || !item) return;
  const link = safeHttpUrl(item.link);
  const title = cleanTitle(item.title || '');
  const body = ensureNewsTailBody(tail);
  const nodes = body
    ? [...body.querySelectorAll('.article')]
    : [...tail.querySelectorAll('.article')];
  for (const node of nodes) {
    const href = node.getAttribute?.('href') || node.href || '';
    const nodeTitle = node.querySelector('.article-title')?.textContent?.trim() || '';
    if ((link && href === link) || (title && nodeTitle === title)) {
      node.remove();
      break;
    }
  }
  const remaining = (body || tail).querySelectorAll('.article');
  if (!remaining.length) {
    tail.remove();
  } else {
    syncNewsTailCollapse({ preserveExpanded: true });
  }
}

/**
 * Prochain En bref depuis la réserve (date desc) :
 *  1) nouvelle institution + source pas encore à la une
 *  2) source encore absente (journal sœur)
 *  3) 2ᵉ titre (allowExtra) seulement s’il ne reste aucune source découverte
 * Vue source : `allowHeroInstitution` autorise le média filtré à se répéter.
 */
function takeNextBriefFromReserve({ allowExtra = false, allowHeroInstitution = false } = {}) {
  if (!magazineReserve.length) return null;

  const tryPick = (pred) => {
    const idx = magazineReserve.findIndex((item) => {
      const key = articleKey(item);
      if (magazineMeta.heroKeys.has(key) || magazineMeta.briefKeys.has(key)) return false;
      return pred(item);
    });
    if (idx < 0) return null;
    return magazineReserve.splice(idx, 1)[0];
  };

  const srcUsed = (item) => {
    const src = sourceKey(item);
    return src && (magazineMeta.heroSources.has(src) || magazineMeta.briefSources.has(src));
  };
  const instUsed = (item) => {
    const inst = institutionKey(item);
    if (!inst) return false;
    if (magazineMeta.briefInsts.has(inst)) return true;
    if (!allowHeroInstitution && magazineMeta.heroInsts.has(inst)) return true;
    return false;
  };

  const uncovered = poolHasUncoveredSource(
    magazineReserve,
    new Set([...magazineMeta.heroSources, ...magazineMeta.briefSources]),
    new Set([...magazineMeta.heroKeys, ...magazineMeta.briefKeys]),
  );

  // 1) Nouveau campus (source pas déjà à la une)
  const freshInst = tryPick((item) => !srcUsed(item) && !instUsed(item));
  if (freshInst) return freshInst;

  // 2) Source sœur encore absente — avant tout 2ᵉ titre d’un campus déjà là
  const sister = tryPick((item) => !srcUsed(item));
  if (sister) return sister;

  // 3) Extra seulement si toutes les sources du reste sont représentées
  if (allowExtra && !uncovered) {
    return tryPick(() => true);
  }
  return null;
}

/**
 * Prochain vedette : le plus frais de la réserve (même source OK).
 * La réserve est triée date desc → index 0 = plus frais restant.
 */
function takeNextFeatureFromReserve() {
  if (!magazineReserve.length) return null;
  // Toujours le plus frais restant (tête de file).
  while (magazineReserve.length) {
    const item = magazineReserve.shift();
    const key = articleKey(item);
    if (magazineMeta.heroKeys.has(key) || magazineMeta.briefKeys.has(key)) continue;
    return item;
  }
  return null;
}

function markPromotedToHero(item) {
  magazineMeta.heroKeys.add(articleKey(item));
  magazineMeta.heroSources.add(sourceKey(item));
  magazineMeta.heroInsts.add(institutionKey(item));
}

function markPromotedToBrief(item) {
  magazineMeta.briefKeys.add(articleKey(item));
  magazineMeta.briefSources.add(sourceKey(item));
  magazineMeta.briefInsts.add(institutionKey(item));
}

function rebuildBriefMetaFromDom(brief) {
  magazineMeta.briefKeys = new Set();
  magazineMeta.briefSources = new Set();
  magazineMeta.briefInsts = new Set();
  brief?.querySelectorAll('.article--compact').forEach((el) => {
    const item = el.__radarItem;
    if (!item) return;
    magazineMeta.briefKeys.add(articleKey(item));
    magazineMeta.briefSources.add(sourceKey(item));
    magazineMeta.briefInsts.add(institutionKey(item));
  });
}

/** Resync institutions une/vedettes depuis le DOM (évite meta désync après fill). */
function rebuildHeroMetaFromDom(hero) {
  magazineMeta.heroKeys = new Set();
  magazineMeta.heroSources = new Set();
  magazineMeta.heroInsts = new Set();
  hero?.querySelectorAll('.article--lead, .article--feature').forEach((el) => {
    const item = el.__radarItem;
    if (!item) return;
    magazineMeta.heroKeys.add(articleKey(item));
    magazineMeta.heroSources.add(sourceKey(item));
    magazineMeta.heroInsts.add(institutionKey(item));
  });
}

/**
 * Filet : un 2ᵉ titre de la *même source* que la une n’occupe pas En bref
 * tant qu’une source du reste n’a pas eu sa place. Les journaux sœurs
 * (même campus, autre source) restent.
 */
function purgeBriefCardsFromHeroInstitutions(brief) {
  if (!brief || NEWS_LIST?.dataset.mode === 'source') return 0;
  const uncovered = poolHasUncoveredSource(
    magazineReserve,
    new Set([...magazineMeta.heroSources, ...magazineMeta.briefSources]),
    new Set([...magazineMeta.heroKeys, ...magazineMeta.briefKeys]),
  );
  if (!uncovered) return 0;
  let removed = 0;
  const cards = [...brief.querySelectorAll('.article--compact')];
  for (const card of cards) {
    const item = resolveItemFromCard(card);
    if (!item) continue;
    const src = sourceKey(item);
    if (!src || !magazineMeta.heroSources.has(src)) continue;
    if (demoteBriefCardToTail(brief, card)) removed += 1;
  }
  return removed;
}

function clearMagazineSpacers(root) {
  root?.querySelectorAll('.news-hero-spacer, .brief-rail-spacer').forEach((n) => n.remove());
}

function ensureMagazineColumnSpacers(hero, brief) {
  clearMagazineSpacers(hero);
  clearMagazineSpacers(brief);
  const hs = document.createElement('div');
  hs.className = 'news-hero-spacer';
  hs.setAttribute('aria-hidden', 'true');
  hero.appendChild(hs);
  const bs = document.createElement('div');
  bs.className = 'brief-rail-spacer';
  bs.setAttribute('aria-hidden', 'true');
  brief.appendChild(bs);
}

function appendBeforeMagazineSpacer(column, el) {
  if (!column || !el) return;
  const spacer = column.querySelector('.news-hero-spacer, .brief-rail-spacer');
  if (spacer) column.insertBefore(el, spacer);
  else column.appendChild(el);
}

/**
 * Hauteur du *contenu* (hors spacer). Pas offsetHeight de la cellule stretchée.
 * Utilise le bas réel du dernier enfant (max offsetTop+height) pour les grilles
 * multi-colonnes d’En bref : sommer les hauteurs comptait 2–3× le visuel et
 * forçait un trim excessif (vide en bas).
 */
function magazineColumnContentHeight(col) {
  if (!col) return 0;
  let maxBottom = 0;
  let sumFallback = 0;
  for (const child of col.children) {
    if (
      child.classList?.contains('news-hero-spacer')
      || child.classList?.contains('brief-rail-spacer')
    ) {
      continue;
    }
    const style = getComputedStyle(child);
    const mt = parseFloat(style.marginTop) || 0;
    const mb = parseFloat(style.marginBottom) || 0;
    const h = child.offsetHeight + mt + mb;
    sumFallback += h;
    // offsetTop est relatif au padding edge de l’offsetParent (souvent la col).
    const bottom = child.offsetTop + child.offsetHeight + mb;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const cs = getComputedStyle(col);
  const padB = parseFloat(cs.paddingBottom) || 0;
  // maxBottom déjà depuis le haut du contenu ; + pad bas si besoin
  if (maxBottom > 0) return maxBottom + padB;
  return sumFallback + (parseFloat(cs.paddingTop) || 0) + padB;
}

/** Plafond En bref : plus haut en wide E (2/média + multi-col) pour coller le bas. */
function briefSidebarMaxSlots() {
  if (typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode()) {
    try {
      const w = window.innerWidth || 0;
      if (w >= 3440) return 32; // 2 col En bref
      if (w >= 1920) return 26; // 1 col, une 2-col
      return 26; // 1440–1600 1 col
    } catch { /* ignore */ }
    return 26;
  }
  return BRIEF_SIDEBAR_MAX;
}

/** Retrouve un item news depuis une carte DOM (href / titre). */
function resolveItemFromCard(cardEl) {
  if (!cardEl) return null;
  if (cardEl.__radarItem) return cardEl.__radarItem;
  const href = cardEl.getAttribute?.('href') || cardEl.href || '';
  const title = cardEl.querySelector?.('.article-title')?.textContent?.trim() || '';
  const match = (it) => {
    const link = safeHttpUrl(it.link) || it.link || '';
    return (href && link && href === link)
      || (title && cleanTitle(it.title || '') === title);
  };
  const fromReserve = magazineReserve.find(match);
  if (fromReserve) return fromReserve;
  if (Array.isArray(news)) {
    const fromNews = news.find(match);
    if (fromNews) return fromNews;
  }
  return null;
}

/**
 * Insère une carte dans la suite du fil en respectant l’ordre date desc.
 * (Ne jamais prepend : un trim En bref d’un vieux billet UQTR/mai se
 * retrouvait sinon en tête de suite, au-dessus de juillet.)
 */
function insertTailArticleByDate(body, el, item) {
  if (!body || !el) return;
  const itemTs = Date.parse(item?.date || '') || 0;
  const cards = [...body.querySelectorAll(':scope > .article, :scope > a.article')];
  for (const card of cards) {
    const other = card.__radarItem;
    const otherTs = Date.parse(other?.date || '') || 0;
    if (itemTs > otherTs) {
      body.insertBefore(el, card);
      return;
    }
  }
  body.appendChild(el);
}

/** Réordonne le corps de la suite du fil (date desc) — filet anti-dérive. */
function sortNewsTailBodyByDate(tail) {
  const body = ensureNewsTailBody(tail);
  if (!body) return;
  const cards = [...body.querySelectorAll(':scope > .article, :scope > a.article')];
  if (cards.length < 2) return;
  cards.sort((a, b) => {
    const da = Date.parse(a.__radarItem?.date || '') || 0;
    const db = Date.parse(b.__radarItem?.date || '') || 0;
    if (db !== da) return db - da;
    // Stable-ish : titre en filet
    const ta = a.querySelector?.('.article-title')?.textContent || '';
    const tb = b.querySelector?.('.article-title')?.textContent || '';
    return ta.localeCompare(tb, 'fr');
  });
  cards.forEach((c) => body.appendChild(c));
}

/**
 * Remet un article En bref dans la suite du fil + réserve.
 */
function demoteBriefCardToTail(brief, cardEl) {
  if (!cardEl || !brief) return false;
  const item = resolveItemFromCard(cardEl);
  if (!item) return false;

  cardEl.remove();
  magazineMeta.briefKeys.delete(articleKey(item));
  rebuildBriefMetaFromDom(brief);
  magazineReserve.push(item);
  magazineReserve = sortByDateDesc(magazineReserve);

  let tail = NEWS_LIST.querySelector('.news-tail');
  // La promotion précédente peut avoir vidé « Suite du fil ». Dans ce cas,
  // `removeTailArticleForItem()` détache le conteneur; il ne faut jamais y
  // ajouter ensuite une carte hors DOM, sinon l'article disparaît de la vue
  // source. On recrée/attache le conteneur *après* toute déduplication.
  if (tail) removeTailArticleForItem(item);
  if (!tail || !tail.isConnected) {
    tail = document.createElement('div');
    tail.className = 'news-tail';
    tail.innerHTML = '<h3 class="news-tail-title">Suite du fil</h3>';
    NEWS_LIST.appendChild(tail);
  }
  const el = safeCreateArticle(item, 'standard');
  if (el) {
    const body = ensureNewsTailBody(tail);
    insertTailArticleByDate(body, el, item);
  }
  sortNewsTailBodyByDate(tail);
  syncNewsTailCollapse({ preserveExpanded: true });
  return true;
}

/**
 * Équilibre magazine — uniquement En bref (hero figé snapshot).
 * Ordre strict : TRIM d’abord, puis FILL. Jamais les deux en boucle croisée.
 * Vue source : fill agressif (même institution) pour coller à la une+vedettes.
 */
function balanceMagazineColumns() {
  if (!canBalanceMagazineColumns()) return;
  if (magazineBalanceBusy) {
    magazineBalanceQueued = true;
    return;
  }

  const hero = NEWS_LIST.querySelector('.news-hero');
  const brief = NEWS_LIST.querySelector('.brief-rail');
  if (!hero || !brief) return;

  magazineBalanceBusy = true;
  magazineBalanceQueued = false;
  const isSourceMode = NEWS_LIST.dataset.mode === 'source';
  const mid = !isSourceMode && isMidwidthMagazinePreview();
  const wideE = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  // Tolérance : un petit spacer est acceptable dans le fil général. En vue
  // d'un seul média hors wide, « En bref » ne doit pas dépasser la une.
  // Wide multi-col : même logique que le fil général (une rangée de plus
  // vaut mieux qu’un vide sous les vedettes).
  const tol = (isSourceMode && !wideE) ? 0 : (mid ? 16 : COLUMN_HEIGHT_TOL);
  const hardMin = isSourceMode ? 2 : (mid ? 1 : BRIEF_SIDEBAR_HARD_MIN);
  // Ne pas « améliorer » un équilibre déjà dans la tolérance produit (~1 carte
  // compacte). Les passes image tardives re-trimaient 6→4 cartes et laissaient
  // un trou de ~110 px alors que l’état antérieur était déjà bon (gap ~40).
  const GOOD_GAP_MAX = mid ? Math.round(AVG_BRIEF_CARD_H * 0.75) : AVG_BRIEF_CARD_H;

  // Toujours resync hero meta avant trim/fill (institutions une/vedettes).
  rebuildHeroMetaFromDom(hero);
  // Filet : pas de 2ᵉ titre de la même source que la une tant qu’une
  // source du reste n’a pas eu sa place.
  purgeBriefCardsFromHeroInstitutions(brief);

  // Multi-col : une carte de trop (nouvelle rangée) vaut mieux qu’un grand vide.
  // Overshoot toléré ≈ hauteur réelle d’une rangée (cartes compactes ~180–230).
  const sampleBriefH = (() => {
    const c = brief.querySelector('.article--compact');
    const h = c?.getBoundingClientRect?.().height;
    return Number.isFinite(h) && h > 40 ? h : AVG_BRIEF_CARD_H + 60;
  })();
  const briefCols = wideE ? briefWideColumnCount() : 1;
  const tightBrief = wideE && briefCols === 1;
  // Multi-col : 20 px, pas ~1 carte. Une rangée de trop (3440/3840)
  // dépassait le hero ; à 3840 il fallait au contraire finir la rangée.
  const wideOvershootTol = tightBrief ? 8 : (wideE ? Math.max(tol, 20) : tol);

  const trimBriefOrphanRow = () => {
    if (briefCols < 2) return;
    const cards = [...brief.querySelectorAll('.article--compact')];
    if (cards.length < hardMin + 1) return;
    if (cards.length % briefCols === 0) return;
    const hH = magazineColumnContentHeight(hero);
    const bH = magazineColumnContentHeight(brief);
    // Rangée incomplète plus haute que le hero → retirer. Sinon on la complète.
    if (bH <= hH + wideOvershootTol) return;
    demoteBriefCardToTail(brief, cards[cards.length - 1]);
  };

  /** Rangée déjà payée en hauteur : remplir les trous (ex. 13/16 à 3840). */
  const completeLastBriefRow = () => {
    if (briefCols < 2) return;
    let guard = 0;
    while (guard < briefCols) {
      guard += 1;
      const cards = brief.querySelectorAll('.article--compact');
      if (cards.length % briefCols === 0) return;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      if (bH > hH + wideOvershootTol) return;
      if (!magazineReserve.length || cards.length >= briefSidebarMaxSlots()) return;
      const item = takeNextBriefFromReserve({
        allowExtra: true,
        allowHeroInstitution: isSourceMode,
      });
      if (!item) return;
      const el = safeCreateArticle(item, 'compact');
      if (!el) return;
      appendBeforeMagazineSpacer(brief, el);
      markPromotedToBrief(item);
      removeTailArticleForItem(item);
    }
  };

  const trimBriefIfTaller = () => {
    let guard = 0;
    while (guard < 28) {
      guard += 1;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      // Wide : tolérer un léger dépassement (évite re-trim qui recrée le vide).
      if (bH <= hH + (wideE ? wideOvershootTol : tol)) break;
      // Vue source : si retirer une carte laisserait un trou > GOOD_GAP_MAX
      // alors que le dépassement actuel est plus petit, s’arrêter (granularité
      // d’une fiche). Impossible de satisfaire brief≤hero et gap≤96 autrement
      // quand la prochaine carte fait ~200 px.
      if (isSourceMode) {
        const cards = brief.querySelectorAll('.article--compact');
        const last = cards[cards.length - 1];
        if (last && cards.length > hardMin) {
          const lastH = last.getBoundingClientRect().height || AVG_BRIEF_CARD_H;
          const overshoot = bH - hH;
          const gapIfRemoved = hH - (bH - lastH);
          if (overshoot > 0 && overshoot <= GOOD_GAP_MAX && gapIfRemoved > GOOD_GAP_MAX) {
            break;
          }
        }
      }
      const cards = brief.querySelectorAll('.article--compact');
      if (cards.length <= hardMin) break;
      if (!demoteBriefCardToTail(brief, cards[cards.length - 1])) break;
    }
  };

  /** Fill En bref jusqu’à coller le bas du hero (multi-col wide inclus). */
  const fillBriefToHero = (maxSteps, overshootMax) => {
    let fillGuard = 0;
    while (fillGuard < maxSteps) {
      fillGuard += 1;
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      const gap = hH - bH;
      if (gap <= tol) break;

      const briefCount = brief.querySelectorAll('.article--compact').length;
      const briefCap = briefSidebarMaxSlots();
      if (briefCount >= briefCap || !magazineReserve.length) break;

      const reserveOptions = {
        allowExtra: isSourceMode || wideE,
        allowHeroInstitution: isSourceMode,
      };
      let item = takeNextBriefFromReserve(reserveOptions);
      if (!item) item = takeNextBriefFromReserve({ ...reserveOptions, allowExtra: true });
      if (!item) break;

      const el = safeCreateArticle(item, 'compact');
      if (!el) break;
      appendBeforeMagazineSpacer(brief, el);

      const afterBrief = magazineColumnContentHeight(brief);
      const afterHero = magazineColumnContentHeight(hero);
      const overshoot = afterBrief - afterHero;

      if (overshoot > overshootMax) {
        // Nouvelle rangée plus haute que le hero : seulement si le vide
        // restant était plus grand que le dépassement (net gain).
        if (gap > overshoot) {
          markPromotedToBrief(item);
          removeTailArticleForItem(item);
        } else {
          demoteBriefCardToTail(brief, el);
        }
        break;
      }
      markPromotedToBrief(item);
      removeTailArticleForItem(item);
    }
  };

  try {
    clearMagazineSpacers(hero);
    clearMagazineSpacers(brief);

    // Déjà bien collé : ne pas re-fill/re-trim destructif (passes image).
    // Wide : n’accepter « déjà bon » que si le trou est vraiment petit.
    {
      const hH = magazineColumnContentHeight(hero);
      const bH = magazineColumnContentHeight(brief);
      const goodMax = tightBrief ? 24 : (wideE ? Math.min(GOOD_GAP_MAX, 56) : GOOD_GAP_MAX);
      if (bH <= hH + tol && (hH - bH) <= goodMax && brief.querySelectorAll('.article--compact').length >= hardMin) {
        ensureMagazineColumnSpacers(hero, brief);
        return;
      }
    }

    // --- 1) TRIM : En bref trop haute → retirer la dernière carte ---
    trimBriefIfTaller();

    // --- 2) FILL : En bref trop basse → ajouter (sans trop dépasser) ---
    const maxFill = isSourceMode ? 40 : (wideE ? 48 : 24);
    fillBriefToHero(maxFill, wideE ? wideOvershootTol : tol);

    // --- 3) TRIM final (images / fill ont pu dépasser d’une carte) ---
    trimBriefIfTaller();
    if (purgeBriefCardsFromHeroInstitutions(brief)) trimBriefIfTaller();
    trimBriefOrphanRow();
    completeLastBriefRow();

    // --- 4) Midwidth : priorité = zéro grand vide sous les vedettes.
    // (Le spacer flex sous le hero est très visible en rail étroit.)
    if (mid) {
      const equalizeMid = () => {
        // Trim d’abord : En bref ne doit pas dépasser le hero (+tol).
        let guard = 0;
        while (guard < 16) {
          guard += 1;
          const hH = magazineColumnContentHeight(hero);
          const bH = magazineColumnContentHeight(brief);
          if (bH <= hH + tol) break;
          const cards = brief.querySelectorAll('.article--compact');
          if (cards.length <= hardMin) break;
          if (!demoteBriefCardToTail(brief, cards[cards.length - 1])) break;
        }
        // Fill prudent : trou sous En bref > ½ carte. Overshoot sous vedettes
        // plafonné à COLUMN_HEIGHT_TOL (petit spacer OK, pas de grand vide).
        const fillOvershootMax = COLUMN_HEIGHT_TOL;
        guard = 0;
        while (guard < 8) {
          guard += 1;
          const hH = magazineColumnContentHeight(hero);
          const bH = magazineColumnContentHeight(brief);
          const voidUnderBrief = hH - bH;
          if (voidUnderBrief <= GOOD_GAP_MAX) break;
          if (!magazineReserve.length) break;
          if (brief.querySelectorAll('.article--compact').length >= briefSidebarMaxSlots()) break;
          // Fil général : sources d’abord, 2ᵉ titre ensuite (fraîcheur).
          const item = takeNextBriefFromReserve({
            allowExtra: true,
            allowHeroInstitution: false,
          });
          if (!item) break;
          const el = safeCreateArticle(item, 'compact');
          if (!el) break;
          appendBeforeMagazineSpacer(brief, el);
          const overshoot = magazineColumnContentHeight(brief) - magazineColumnContentHeight(hero);
          if (overshoot > fillOvershootMax) {
            demoteBriefCardToTail(brief, el);
            break;
          }
          markPromotedToBrief(item);
          removeTailArticleForItem(item);
        }
        purgeBriefCardsFromHeroInstitutions(brief);
      };
      equalizeMid();
      ensureMagazineColumnSpacers(hero, brief);
      // Spacer mesuré : si encore un trou sous le hero, re-trim + reposer.
      const hSp = hero.querySelector('.news-hero-spacer')?.offsetHeight || 0;
      if (hSp > tol) {
        clearMagazineSpacers(hero);
        clearMagazineSpacers(brief);
        equalizeMid();
        ensureMagazineColumnSpacers(hero, brief);
      }
    } else {
      // Wide E : 2e passe sur le *contenu* (pas le spacer flex) — multi-col
      // laissait souvent 100–200 px de vide sous la dernière rangée.
      if (wideE) {
        clearMagazineSpacers(hero);
        clearMagazineSpacers(brief);
        const gap2 = magazineColumnContentHeight(hero) - magazineColumnContentHeight(brief);
        if (tightBrief) {
          trimBriefIfTaller();
        } else if (gap2 > Math.max(32, Math.round(sampleBriefH * 0.55)) && magazineReserve.length) {
          fillBriefToHero(36, wideOvershootTol);
          trimBriefIfTaller();
        }
        trimBriefOrphanRow();
        completeLastBriefRow();
      }
      ensureMagazineColumnSpacers(hero, brief);
      if (wideE && tightBrief) {
        const hSp = hero.querySelector('.news-hero-spacer')?.offsetHeight || 0;
        if (hSp > 24) {
          clearMagazineSpacers(hero);
          clearMagazineSpacers(brief);
          trimBriefIfTaller();
          ensureMagazineColumnSpacers(hero, brief);
        }
      }
    }
  } finally {
    window.setTimeout(() => {
      magazineBalanceBusy = false;
      if (magazineBalanceQueued) {
        magazineBalanceQueued = false;
        balanceMagazineColumns();
      }
    }, 120);
  }

  const briefCount = brief.querySelectorAll('.article--compact').length;
  if (briefCount) NEWS_LIST.dataset.briefCount = String(briefCount);
  else NEWS_LIST.removeAttribute('data-brief-count');
  // Filet : après trim/fill, la suite doit rester en date décroissante.
  const tail = NEWS_LIST.querySelector('.news-tail');
  if (tail) sortNewsTailBodyByDate(tail);
  syncNewsTailCollapse({ preserveExpanded: true });
  updateNewsLayout();
  bindMagazineImageBalanceOnce();
}

/** Compteur de passes post-rendu (évite rebalance infini). */
let magazineBalancePasses = 0;
const MAGAZINE_BALANCE_PASS_CAP = 4;

function scheduleMagazineColumnBalance() {
  clearTimeout(magazineBalanceTimer);
  magazineBalancePasses = 0;
  const mid = isMidwidthMagazinePreview();
  magazineBalanceTimer = window.setTimeout(() => {
    magazineBalancePasses = 1;
    balanceMagazineColumns();
    // Passes retardées : layout puis images (vue source = colonnes à coller).
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 2);
      balanceMagazineColumns();
    }, 450);
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 3);
      balanceMagazineColumns();
    }, 1100);
    // 4e passe tardive : images une/vedettes souvent lentes en vue source.
    window.setTimeout(() => {
      magazineBalancePasses = Math.max(magazineBalancePasses, 4);
      balanceMagazineColumns();
    }, 2200);
    // Midwidth : passes tardives (images + wrap titres En bref en rail étroit).
    if (mid) {
      window.setTimeout(() => {
        magazineBalancePasses = Math.max(magazineBalancePasses, 5);
        balanceMagazineColumns();
      }, 3600);
      window.setTimeout(() => {
        magazineBalancePasses = Math.max(magazineBalancePasses, 6);
        balanceMagazineColumns();
      }, 5200);
    }
  }, 80);
}

function bindMagazineImageBalanceOnce() {
  if (!NEWS_LIST) return;
  NEWS_LIST.querySelectorAll('.news-hero img, .brief-rail img').forEach((img) => {
    if (img.dataset.magazineBalanceBound) return;
    img.dataset.magazineBalanceBound = '1';
    if (img.complete) return;
    const once = () => {
      img.removeEventListener('load', once);
      img.removeEventListener('error', once);
      // Une image distante peut finir bien après les quatre passes initiales
      // (connexion lente, onglet revenu à l'avant-plan). Même si ce plafond
      // est atteint, sa hauteur définitive doit rééquilibrer les colonnes.
      // L'écouteur est à usage unique par image, donc cela ne crée pas de
      // boucle de rebalance.
      clearTimeout(magazineBalanceTimer);
      magazineBalanceTimer = window.setTimeout(() => {
        balanceMagazineColumns();
      }, 180);
    };
    img.addEventListener('load', once);
    img.addEventListener('error', once);
  });
}

/**
 * Pool d'un seul média : le filtre source est explicitement une vue « tous les
 * articles ». Il ne doit donc jamais réappliquer la fenêtre de fraîcheur du
 * fil général, sinon une fiche SEO peut promettre un article que son bouton de
 * retour rend introuvable. Le tri reste chronologique et les futurs articles
 * sont toujours exclus.
 */
function sortSourcePool(items) {
  return sortByDateDesc(items);
}

function collectSourcePool(items, referenceDate = new Date()) {
  const pool = sortSourcePool(items.filter((item) => isPublishedOnOrBefore(item, referenceDate)));
  return { items: pool, contingencyBand: 0 };
}

function leadBriefCharCount(item) {
  const lead = sanitizeBriefBody(String(item.leadExcerpt || ''));
  if (lead.length >= LEAD_BRIEF_MIN_CHARS) return lead.length;
  const excerpt = sanitizeBriefBody(String(item.excerpt || ''));
  if (excerpt.length >= LEAD_BRIEF_MIN_CHARS) return excerpt.length;
  const { body } = splitByline(item);
  return Math.max(lead.length, excerpt.length, sanitizeBriefBody(body).length);
}

function hasSubstantialLeadBrief(item) {
  return leadBriefCharCount(item) >= LEAD_BRIEF_MIN_CHARS;
}

function pickSourceLead(pool) {
  return pool[0] || null;
}

/**
 * Vue d'un seul média (filtre source).
 *
 * Ordre de fraîcheur strict dans chaque section (pool déjà date desc) :
 *  - Une + vedettes = tranche contiguë des plus frais
 *    · hors wide dual : 1 une + ≤2 vedettes (évite le « double look » vs En bref
 *      sur mobile)
 *    · wide E (≥1920) : même N que le fil général (2 unes + vedettes)
 *  - En bref = suite chronologique (graine ≈ hauteur hero)
 *  - Suite du fil = le reste
 */
function partitionSourceFeed(items, referenceDate = new Date()) {
  const sorted = sortByDateDesc(items);
  const { items: pool, contingencyBand } = collectSourcePool(sorted, referenceDate);
  // Tranche contiguë des plus frais → une(s) = pool[0..leads), vedettes = suite
  const heroN = Math.min(sourceHeroSpotlightMax(), pool.length);
  const heroItems = pool.slice(0, heroN);
  const heroKeys = new Set(heroItems.map(articleKey));
  const rest = pool.filter((item) => !heroKeys.has(articleKey(item)));
  // Graine En bref calée sur la hauteur hero (une+vedettes), un peu plus
  // généreuse en vue source pour coller dès le snapshot.
  const briefSeed = briefSeedCountForHero(Math.max(1, heroItems.length), {
    sourceMode: true,
  });
  const briefItems = rest.slice(0, briefSeed);
  const briefKeys = new Set(briefItems.map(articleKey));
  const tailItems = rest.filter((item) => !briefKeys.has(articleKey(item)));
  // Réserve + meta pour le fill/trim En bref (balanceMagazineColumns).
  magazineReserve = tailItems.slice();
  resetMagazineMeta(heroItems, briefItems);
  const lead = heroItems[0] || null;
  const leadHasImage = !!(lead && hasDisplayImage(lead));
  return { heroItems, briefItems, tailItems, contingencyBand, leadHasImage };
}

function safeCreateArticle(item, role = 'standard') {
  try {
    return createArticle(item, role);
  } catch (err) {
    console.error('Le Radar: échec rendu article', item?.source, item?.title, err);
    return null;
  }
}

function createArticle(item, role = 'standard') {
  const link = safeHttpUrl(item.link);
  const a = document.createElement(link ? 'a' : 'div');
  a.className = `article article--${role}`;
  // Référence pour promote/demote magazine (fill / trim En bref)
  a.__radarItem = item;
  if (link) {
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  const color = safeCssColor(sourceAccentColor(item)) || 'var(--accent)';
  a.style.setProperty('--c', color);

  const d = item.date ? new Date(item.date) : null;
  const time = d
    ? formatStampCompact(d, item.lang === 'en' ? 'en' : 'fr')
    : '';
  /* Le rouge « frais » couvre toute la journée civile québécoise, et non les
     120 dernières minutes : le fil des journaux étudiants publie par à-coups,
     souvent quelques articles par jour. Une fenêtre de 2 h laissait donc la
     quasi-totalité des parutions du jour en gris, ce que la fenêtre était
     justement censée signaler. */
  const fresh = d ? torontoDayKey(d) === torontoDayKey() : false;
  const { author: rawAuthor, body } = splitByline(item);
  const displayAuthor = resolveDisplayAuthor(item, rawAuthor);
  /* Vedettes : même règles de contenu que la une (leadExcerpt, longueur, minimum). */
  const isLeadLikeBrief = role === 'lead' || role === 'feature';
  const leadBody = isLeadLikeBrief
    ? (item.leadExcerpt || body || item.excerpt || '')
    : body;
  let { text: brief, truncated: briefTruncated } = resolveBrief(item, leadBody, role);
  if (isLeadLikeBrief && !brief) {
    ({ text: brief, truncated: briefTruncated } = resolveBrief(item, item.excerpt || body, role));
  }
  if (isLeadLikeBrief && brief) {
    ({ text: brief, truncated: briefTruncated } = ensureLeadBriefMinLines(
      brief,
      briefTruncated,
      item,
      role === 'feature' ? 'feature' : 'lead',
    ));
    const fullSource = sanitizeBriefBody(leadBody);
    if (fullSource.length > brief.length + 12 || (brief.length >= 100 && item.link)) {
      briefTruncated = true;
    }
  }
  if (role === 'compact' && brief) {
    ({ text: brief, truncated: briefTruncated } = ensureCompactBriefMinLines(brief, briefTruncated, item));
  }
  if (rawAuthor && brief) {
    brief = stripLeadingByline(brief, rawAuthor);
  }
  if (item.link) {
    briefTruncated = true;
  }
  const readMore = item.lang === 'en' ? 'Read more →' : 'Lire la suite →';
  const byLabel = item.lang === 'en' ? 'By' : 'Par';
  /* Vignette : une, vedettes, En bref ET suite du fil. Le SVG de repli
     reste illisible en petit format — photo source ou campus seulement. */
  const isThumbRole = role !== 'lead';
  const canUseImage = true;
  /* Vignettes : seuils assouplis (forThumb) — beaucoup d’URL WP ~300–500 px
     étaient rejetées alors qu’elles passent bien en object-fit. */
  /* Campus seulement s’il n’y a pas de photo d’article. Le pré-charger
     ici faisait basculer les unes Collectif (carte, portrait) vers le
     Centre sportif dès qu’un timeout 6 s tirait alternateDisplayImage. */
  if (!hasUsablePhoto(item, role)) ensureCampusStock(item);
  const hasImageCandidate = role === 'lead'
    || (hasUsablePhoto(item, role) || hasStockPhoto(item, role));
  if (!hasImageCandidate && canUseImage) a.classList.add('article--text');
  if (isThumbRole && hasImageCandidate) a.classList.add('article--thumb');
  const timeHtml = time
    ? `<time class="article-time${fresh ? ' is-fresh' : ''}" datetime="${escapeHtml(item.date)}">${time}</time>`
    : '';
  const instHtml = item.institution
    ? articleInstitutionMetaHtml(item.institution, item.type, role)
    : '';
  const metaLead = (item.source || item.institution)
    ? `<span class="article-meta__lead">
        ${item.source ? `<span class="article-source notranslate" translate="no">${escapeHtml(item.source)}</span>` : ''}
        ${instHtml}
      </span>`
    : '';
  const metaHtml = (metaLead || timeHtml)
    ? `<div class="article-meta">${metaLead}${timeHtml}</div>`
    : '';
  // Espace insécable + classe : évite « meLire la suite » (margin seule insuffisante
  // quand le chapô est en inline à côté d’une vignette flottante).
  const briefHtml = item.link || brief
    ? `<p class="article-brief${briefTruncated ? ' is-truncated' : ''}"><span class="article-brief-text">${escapeHtml(brief || '')}</span>${briefTruncated ? `<span class="article-more" style="color: ${color}">\u00a0${escapeHtml(readMore)}</span>` : ''}</p>`
    : '';
  // « Par »/« By » se traduit (UI) ; le nom d’auteur reste en original (notranslate).
  // Espace garanti en CSS (.article-author) : la trad du libellé mange l’espace final.
  const bylineHtml = `<p class="article-byline"><span class="article-byline__label">${escapeHtml(byLabel)}</span><strong class="article-author notranslate" translate="no">${escapeHtml(displayAuthor)}</strong></p>`;
  const titleHtml = `<h3 class="article-title">${escapeHtml(cleanTitle(item.title))}</h3>`;
  const mediaHtml = hasImageCandidate ? '<figure class="article-media"></figure>' : '';
  if (role === 'lead') {
    // À la une : l'auteur suit directement le titre, avant la photo.
    a.innerHTML = `
      <span class="article-eyebrow">À la une</span>
      ${metaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${mediaHtml}
      ${briefHtml}
    `;
  } else if (role === 'feature' || (role === 'compact' && hasImageCandidate)) {
    // Vedettes + En bref avec photo : titre + byline puis media (float wrap).
    a.innerHTML = `
      ${metaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${mediaHtml}
      ${briefHtml}
    `;
  } else {
    // Suite du fil / En bref sans photo : media d’abord si présent.
    a.innerHTML = `
      ${metaHtml}
      ${mediaHtml}
      ${titleHtml}
      ${bylineHtml}
      ${briefHtml}
    `;
  }

  if (hasImageCandidate) {
    /* Vignettes (vedettes + En bref) aussi sur mobile, avec crédit photo —
       le CSS adapte la largeur pour éviter l'écrasement du texte. */
    attachArticleImage(a, item, role);
  }

  // Filet : garantir titre avant photo même si un attach restructure le DOM.
  if (role === 'lead' || role === 'feature' || role === 'compact') {
    ensureLeadTitleAboveMedia(a);
  }

  return a;
}

/** Place .article-title juste avant .article-media (une uniquement). */
function ensureLeadTitleAboveMedia(article) {
  if (!article) return;
  const title = article.querySelector(':scope > .article-title');
  const media = article.querySelector(':scope > .article-media');
  if (!title || !media) return;
  // Si le media précède le titre dans le DOM, on remonte le titre.
  if (
    title.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_PRECEDING
  ) {
    media.parentNode.insertBefore(title, media);
  }
}

/** Aligné sur scripts/article-image-lib.js isWeakImageUrl :
 *  ne rejette que les petites vignettes WP (-150x150), pas -930x620. */
const WEAK_IMAGE_PATH = /article-tile|size-article-tile/;

/** Aligné sur scripts/article-image-lib.js GLOBAL_IMAGE_REJECT_RE */
const GLOBAL_IMAGE_REJECT_RE = /(?:logo|avatar|icon|placeholder|default|blank|spacer|profile|author|favicon|gravatar|emoji|smiley|lapige_web|(?:^|\/)article-2\.|campus-logo|campusgraphic|article-tile|size-article-tile|thumbnail|thumb_|recent-posts|wp-block-query|widget|sponsor|banner|social-share|-150x\d+\.|cropped-logo|logoexile|121330814_121456603062023_8783413434532337259_n|(?:^|\/)daily\.png$|editorial[_-]|(?:^|\/)editorial(?:s)?(?:[_./-]|$)|画板|%e7%94%bb%e6%9d%bf|_optimized_optimized_optimized|00\.graphics\.csu\.naya_hachwa)/i;

function isFallbackImageUrl(raw = '') {
  const src = String(raw).trim();
  if (!src) return false;
  if (src.startsWith('data:image/svg')) return true;
  return src.startsWith('./assets/lead-fallbacks/') && src.endsWith('.svg');
}

function resizeFromImageQuery(raw = '') {
  try {
    const u = new URL(raw);
    const resize = u.searchParams.get('resize');
    if (resize) {
      const parts = resize.split(/[,%]/).map((n) => parseInt(n, 10));
      return { width: parts[0] || 0, height: parts[1] || 0 };
    }
    const w = parseInt(u.searchParams.get('w'), 10) || 0;
    const h = parseInt(u.searchParams.get('h'), 10) || 0;
    if (w || h) return { width: w, height: h };
    // Transformations dans le chemin (substackcdn/Cloudinary : « ,w_256,c_limit,… »)
    const pw = u.pathname.match(/[,/]w_(\d+)\b/);
    const ph = u.pathname.match(/[,/]h_(\d+)\b/);
    if (pw || ph) {
      return { width: pw ? parseInt(pw[1], 10) : 0, height: ph ? parseInt(ph[1], 10) : 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isWeakImagePath(path = '', { forThumb = false } = {}) {
  const p = String(path).toLowerCase();
  // Suffixe WP « -{w}x{h}. » : rejeter les vraies miniatures, garder les
  // formats vedette (ex. Campus2-930x620.jpg sur Le Délit).
  // Vignettes feature / En bref : seuils bas (object-fit ~100–180 px).
  const sized = p.match(/-(\d{2,4})x(\d{2,4})(?=\.[a-z]+$)/);
  if (sized) {
    const w = parseInt(sized[1], 10);
    const h = parseInt(sized[2], 10);
    if (w > 0 && h > 0) {
      if (forThumb) {
        if (Math.max(w, h) < 80 || w * h < 8000) return true;
      } else {
        if (Math.max(w, h) < 400) return true;
        if (w < 640 || h < 360 || w * h < 200000) return true;
      }
    }
  }
  return WEAK_IMAGE_PATH.test(p);
}

/**
 * Hôtes dont les médias sont souvent injoignables (site journal down).
 * Wayback / Photon = repli après l’URL d’origine, jamais l’essai primaire :
 * web.archive.org met ~7 s sur un HEAD, au-delà du timeout 4 s → campus
 * alors que l’origine L’Exemplaire répond en < 200 ms (ex. illustration
 * « Sans fin(s) », 2048×1152, dessin éditorial sur fond blanc).
 */
const IMAGE_ARCHIVE_FALLBACK_HOSTS = new Set([
  'exemplaire.com.ulaval.ca',
  'www.exemplaire.com.ulaval.ca',
]);

function hostOfHref(href = '') {
  try {
    return new URL(
      String(href || '').trim(),
      typeof location !== 'undefined' ? location.href : 'https://le-radar.ca/',
    ).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Réécrit une URL image vers Internet Archive si l’hôte est en repli. */
function withArchiveImageFallback(href = '') {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, typeof location !== 'undefined' ? location.href : 'https://le-radar.ca/');
    if (u.hostname.toLowerCase().includes('web.archive.org')) return u.href;
    if (!IMAGE_ARCHIVE_FALLBACK_HOSTS.has(u.hostname.toLowerCase())) return u.href;
    // 2id_ → dernière capture utile, contenu original (pas la barre Wayback).
    return `https://web.archive.org/web/2id_/${u.href}`;
  } catch {
    return raw;
  }
}

/**
 * CDN Jetpack (i0.wp.com) — plus petit et CORS, cache indépendant de l’origine.
 * Uniquement hôtes fragiles WP : un site sans Photon 404.
 */
function withPhotonImageUrl(href = '') {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, typeof location !== 'undefined' ? location.href : 'https://le-radar.ca/');
    const host = u.hostname.toLowerCase();
    if (host === 'i0.wp.com' || host.endsWith('.wp.com')) return u.href;
    if (!IMAGE_ARCHIVE_FALLBACK_HOSTS.has(host)) return '';
    if (!/\/wp-content\/uploads\//i.test(u.pathname)) return '';
    return `https://i0.wp.com/${host}${u.pathname}?ssl=1`;
  } catch {
    return '';
  }
}

/**
 * @param {string} src
 * @param {{ forThumb?: boolean }} [opts] — seuils assouplis pour feature / En bref
 */
function getCandidateImage(src = '', { forThumb = false } = {}) {
  const raw = String(src).trim();
  if (!raw) return '';

  if (isFallbackImageUrl(raw)) {
    try {
      return new URL(raw, location.href).href;
    } catch {
      return '';
    }
  }

  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return '';
  }

  if (!['http:', 'https:'].includes(url.protocol)) return '';
  const path = decodeURIComponent(url.pathname).toLowerCase();
  if (GLOBAL_IMAGE_REJECT_RE.test(path)) return '';
  if (/(?:^|\/)(?:1x1|pixel)\b/.test(path)) return '';
  const minW = forThumb ? 120 : 640;
  const minH = forThumb ? 100 : 360;
  const minPx = forThumb ? 12_000 : 240_000;
  const resize = resizeFromImageQuery(raw);
  if (resize) {
    const { width = 0, height = 0 } = resize;
    if ((width > 0 && width < minW) || (height > 0 && height < minH)) return '';
    if (width > 0 && height > 0 && width * height < minPx) return '';
  }
  if (isWeakImagePath(path, { forThumb })) return '';
  // Origine telle quelle. Wayback / Photon : photoDisplayRungs, pas ici.
  return url.href;
}

/**
 * Redimensionne les énormes originaux Wikimedia (8K…) pour l'affichage —
 * surtout les vignettes En bref, qui chargeaient l'original et tombaient
 * dans le timeout 2,5 s → plus de photo.
 */
function displaySizedImageUrl(raw = '', role = 'lead') {
  const src = getCandidateImage(raw) || String(raw || '').trim();
  if (!src || isFallbackImageUrl(src)) return src;
  try {
    const u = new URL(src, location.href);
    const host = u.hostname.toLowerCase();
    const isThumb = isThumbRoleName(role);
    const maxW = role === 'lead' ? 1400 : (isThumb ? 480 : 960);

    // Déjà un dérivé dimensionné (thumb Wikimedia ou ?width=).
    if (/\/commons\/thumb\//i.test(u.pathname) || u.searchParams.has('width')) {
      return src;
    }

    if (host === 'upload.wikimedia.org' || host.endsWith('.wikimedia.org')) {
      const fileMatch = u.pathname.match(/\/([^/]+\.(?:jpe?g|png|webp|gif))$/i);
      if (fileMatch) {
        const file = decodeURIComponent(fileMatch[1]);
        // Special:FilePath redirige vers un JPEG redimensionné (fiable avec accents).
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${maxW}`;
      }
    }
  } catch {
    /* keep original */
  }
  return src;
}

/** Photo mirroirée sur GitHub Pages (assets/news-images/…). */
function hasLocalPhoto(item) {
  const p = String(item?.imageLocal || '').trim();
  return /^assets\/news-images\/[a-z0-9]+\.(?:jpe?g|png|webp|gif)$/i.test(p);
}

function resolveLocalPhotoUrl(item) {
  if (!hasLocalPhoto(item)) return '';
  try {
    return new URL(String(item.imageLocal).trim(), location.href).href;
  } catch {
    return '';
  }
}

function isThumbRoleName(role = '') {
  return role === 'feature' || role === 'compact' || role === 'standard';
}

function hasUsablePhoto(item, role = 'lead') {
  if (hasLocalPhoto(item)) return true;
  const forThumb = isThumbRoleName(role);
  return !!getCandidateImage(item?.image, { forThumb });
}

function hasStockPhoto(item, role = 'lead') {
  const forThumb = isThumbRoleName(role);
  return !!getCandidateImage(item?.stockImage, { forThumb });
}

function hasDisplayImage(item, role = 'lead') {
  return hasUsablePhoto(item, role) || hasStockPhoto(item, role) || isFallbackImageUrl(item?.fallbackImage);
}

/**
 * Repli campus côté client — scripts/campus-fallback-lib.js (CampusFallback).
 * Banque mât universities + cégeps curatés.
 */
function pickClientCampusPhoto(item = {}) {
  const lib = typeof CampusFallback === 'object' ? CampusFallback : null;
  if (!lib || typeof lib.pickCampusFallback !== 'function') return null;
  const uni = (typeof QUEBEC_UNIVERSITY_BACKGROUNDS !== 'undefined'
    && Array.isArray(QUEBEC_UNIVERSITY_BACKGROUNDS))
    ? QUEBEC_UNIVERSITY_BACKGROUNDS
    : [];
  return lib.pickCampusFallback(item, { universityPhotos: uni });
}

function isThematicStock(item, role = 'lead') {
  return hasStockPhoto(item, role) && item.imageProvider !== 'campus-bank';
}

function ensureCampusStock(item, { replace = false } = {}) {
  if (!item || typeof item !== 'object') return null;
  if (!replace && item.stockImage && getCandidateImage(item.stockImage, { forThumb: true })) {
    return item;
  }
  const pick = pickClientCampusPhoto(item);
  if (!pick?.url && !pick?.stockImage) return null;
  const url = pick.stockImage || pick.url;
  const credit = pick.credit || pick.imageCreator || '';
  const license = pick.license || pick.imageLicense || 'CC';
  const link = pick.link || pick.imageSourceUrl || url;
  item.stockImage = url;
  item.imageTitle = pick.title || pick.imageTitle || '';
  item.imageCredit = pick.imageCredit
    || `Photo : ${credit || 'Auteur·e inconnu·e'} / ${license} · Wikimedia Commons`;
  item.imageCreator = credit;
  item.imageLicense = license;
  item.imageProvider = 'campus-bank';
  item.imageSourceUrl = link;
  return item;
}

function darkenHex(hex, amount = 0.32) {
  const h = String(hex || '#003DA5').replace('#', '');
  if (h.length !== 6) return '#003DA5';
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function wrapTitleLines(text = '', max = 36, lines = 4) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
    if (out.length >= lines) break;
  }
  if (line && out.length < lines) out.push(line);
  return out.slice(0, lines);
}

function buildClientFallbackDataUrl(item) {
  const color = safeCssColor(
    institutionBrandColor(item.institution || '') || sourceColors[item.source],
  ) || '#003DA5';
  const dark = darkenHex(color);
  const title = cleanTitle(item.title || 'Article');
  const source = item.source || 'Le Radar';
  const inst = item.institution ? formatInstitutionDisplay(item.institution) : '';
  const lines = wrapTitleLines(title, 36, 4);
  const tspans = lines.map((ln, i) =>
    `<tspan x="64" dy="${i === 0 ? 0 : 36}">${escapeHtml(ln)}</tspan>`,
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" role="img" aria-label="${escapeHtml(title)}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${dark}"/></linearGradient></defs>
  <rect width="1280" height="800" fill="url(#bg)"/>
  <text x="64" y="72" fill="rgba(255,255,255,0.92)" font-family="system-ui,sans-serif" font-size="28" font-weight="700">${escapeHtml(source.toUpperCase())}</text>
  ${inst ? `<text x="64" y="108" fill="rgba(255,255,255,0.72)" font-family="system-ui,sans-serif" font-size="20">${escapeHtml(inst)}</text>` : ''}
  <text x="64" y="${inst ? 220 : 200}" fill="#fff" font-family="Georgia,serif" font-size="44" font-weight="700">${tspans}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shouldPreferStockPhoto(item, role = 'lead') {
  // Photo d’article d’abord — y compris hôte fragile (timeout court au load).
  if (hasUsablePhoto(item, role)) return false;
  if (hasStockPhoto(item, role)) return true;
  return false;
}

function resolveDisplayImage(item, { preferPhoto = true, role = 'lead' } = {}) {
  const forThumb = isThumbRoleName(role);
  if (shouldPreferStockPhoto(item, role)) preferPhoto = false;

  // 1) Photo d’article : miroir local, puis URL source (hôte fragile inclus).
  if (preferPhoto && hasLocalPhoto(item)) {
    return { src: resolveLocalPhotoUrl(item), kind: 'photo' };
  }
  if (preferPhoto && getCandidateImage(item?.image, { forThumb })) {
    return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
  }
  // 2) Photo thématique (Openverse / Commons) — jamais la banque campus ici.
  if (isThematicStock(item, role)) {
    return { src: getCandidateImage(item.stockImage, { forThumb }), kind: 'stock' };
  }
  // 3) Campus de l’établissement. Pas de SVG tant que la banque a une photo.
  ensureCampusStock(item);
  if (hasStockPhoto(item, role)) {
    return { src: getCandidateImage(item.stockImage, { forThumb }), kind: 'stock' };
  }
  if (isFallbackImageUrl(item?.fallbackImage)) {
    return { src: getCandidateImage(item.fallbackImage), kind: 'fallback' };
  }
  if (!preferPhoto) {
    const local = resolveLocalPhotoUrl(item);
    if (local) return { src: local, kind: 'photo' };
    if (getCandidateImage(item?.image, { forThumb })) {
      return { src: getCandidateImage(item.image, { forThumb }), kind: 'photo' };
    }
  }
  if (role === 'lead') {
    const svg = buildClientFallbackDataUrl(item);
    if (svg) return { src: svg, kind: 'fallback' };
  }
  return { src: '', kind: 'none' };
}

/**
 * Chaîne photo d’article, toujours vers l’avant :
 *   local → origine → Photon (hôte fragile WP) → Wayback.
 * Une illustration éditoriale (fond blanc, dessin) reste une photo d’article.
 */
function photoDisplayRungs(item = {}, { forThumb = false } = {}) {
  const rungs = [];
  const seen = new Set();
  const push = (src, rung) => {
    const href = String(src || '').trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    rungs.push({ src: href, kind: 'photo', rung });
  };
  const local = resolveLocalPhotoUrl(item);
  if (local) push(local, 'local');
  const remote = getCandidateImage(item?.image, { forThumb });
  if (remote) push(remote, 'origin');
  const photon = withPhotonImageUrl(item?.image || remote || '');
  if (photon) push(photon, 'photon');
  const archived = withArchiveImageFallback(String(item?.image || remote || '').trim());
  const failedIsArchive = hostOfHref(archived).includes('web.archive.org');
  if (failedIsArchive) push(archived, 'archive');
  return rungs;
}

/** Return the other usable source after an image request failed.
 * A stale Openverse URL must never cause us to retry itself and then discard
 * an otherwise valid image supplied by the publication. */
function alternateDisplayImage(item, failedKind, role = 'lead', failedSrc = '') {
  const forThumb = isThumbRoleName(role);
  const failed = String(failedSrc || '').trim();
  const different = (url) => {
    const src = String(url || '').trim();
    return Boolean(src) && src !== failed;
  };

  if (failedKind === 'photo') {
    const rungs = photoDisplayRungs(item, { forThumb });
    const failedIdx = rungs.findIndex((r) => r.src === failed);
    const start = failedIdx >= 0 ? failedIdx + 1 : 0;
    for (let i = start; i < rungs.length; i += 1) {
      if (different(rungs[i].src)) return rungs[i];
    }
    if (isThematicStock(item, role)) {
      const stock = getCandidateImage(item.stockImage, { forThumb });
      if (different(stock)) return { src: stock, kind: 'stock' };
    }
  }
  if (failedKind === 'stock') {
    const local = resolveLocalPhotoUrl(item);
    if (different(local)) return { src: local, kind: 'photo' };
    const remote = getCandidateImage(item?.image, { forThumb });
    if (different(remote)) return { src: remote, kind: 'photo' };
  }
  // Thématique morte → campus (on remplace le stock Openverse 404).
  const replaceThematic = failedKind === 'stock' && item.imageProvider !== 'campus-bank';
  ensureCampusStock(item, { replace: replaceThematic });
  if (hasStockPhoto(item, role)) {
    const stock = getCandidateImage(item.stockImage, { forThumb });
    if (different(stock)) return { src: stock, kind: 'stock' };
  }
  return { src: '', kind: 'none' };
}

/**
 * La une reste l'article le plus récent. Ne jamais l'échanger contre un plus
 * ancien pour une photo ou un extrait — attachArticleImage génère un repli SVG
 * côté client si besoin. On s'assure seulement que les features ne dupliquent pas la une.
 */
function ensureHeroLeadHasImage(heroItems, allItems) {
  if (!heroItems.length) return heroItems;
  const lead = heroItems[0];
  const leadKey = articleKey(lead);
  const features = heroItems.slice(1).filter((item) => articleKey(item) !== leadKey);
  return [lead, ...features];
}

function cleanCreatorDisplay(raw = '') {
  let s = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const attrIdx = s.search(/\s*(?:["'])\s*(?:width|height|srcset|class|style)\s*=/i);
  if (attrIdx > 0) s = s.slice(0, attrIdx);
  const bareAttr = s.search(/\s+(?:width|height|srcset)\s*=\s*["']/i);
  if (bareAttr > 0) s = s.slice(0, bareAttr);
  s = s.replace(/\\+"/g, '"').replace(/\)\s*["']\s*$/g, ')').replace(/["']\s*$/g, '').trim();
  s = s.replace(/\.mw-parser-output[\s\S]*/i, '').trim();
  // Champ dédoublé à la source (« Unknown authorUnknown author ») :
  // ne garder qu'une occurrence.
  s = s.replace(/^(.{3,}?)\s*\1$/u, '$1').trim();
  if (s.length > 72) {
    const cut = s.slice(0, 72);
    const lastSpace = cut.lastIndexOf(' ');
    s = `${(lastSpace > 36 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return s;
}

function parseImageCreditLine(credit = '') {
  const m = String(credit).match(/^Photo\s*:\s*(.+?)\s*\/\s*(.+?)\s*·\s*(.+)$/i);
  if (!m) return null;
  return {
    creator: cleanCreatorDisplay(m[1].trim()),
    license: m[2].trim(),
    via: m[3].trim(),
  };
}

function creditLink(href, label, className = '') {
  const safe = safeHttpUrl(href, { allowHttp: true });
  if (!safe) {
    const span = document.createElement('span');
    span.textContent = label;
    if (className) span.className = className;
    return span;
  }
  const a = document.createElement('a');
  a.href = safe;
  a.target = '_blank';
  a.rel = 'noopener noreferrer license';
  a.textContent = label;
  if (className) a.className = className;
  a.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(safe, '_blank', 'noopener,noreferrer');
  });
  return a;
}

function buildSourcePhotoCreditElement(item = {}) {
  const credit = String(item.sourceImageCredit || '').trim();
  if (!credit) return null;

  const cap = document.createElement('figcaption');
  // Crédit photo entier en original (photographe + libellé) — pas de MT.
  cap.className = 'article-media-credit notranslate';
  cap.setAttribute('translate', 'no');
  const url = String(item.sourceImageCreditUrl || item.link || '').trim();
  const en = item.lang === 'en';
  const fromMedia = item.sourceImageCreditFrom === 'media';

  if (fromMedia) {
    // « Crédit photo : The Plant » — média + crédit restent en langue d’origine.
    const mediaName = String(item.source || '').trim();
    const prefixMatch = credit.match(/^(Photo credit|Crédit photo|Photo)\s*:\s*(.+)$/i);
    const name = (prefixMatch ? prefixMatch[2] : credit).trim() || mediaName || credit;
    const prefix = prefixMatch
      ? `${prefixMatch[1].replace(/:$/, '')}: `
      : (en ? 'Photo credit: ' : 'Crédit photo : ');
    cap.appendChild(document.createTextNode(prefix));
    if (url) {
      const a = creditLink(url, name, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = name;
      cap.appendChild(span);
    }
    return cap;
  }

  const creator = cleanCreatorDisplay(item.sourceImageCreator || '');
  const parsed = parseImageCreditLine(credit);
  if (parsed && creator) {
    cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
    if (url) {
      const a = creditLink(url, creator, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'article-media-credit__creator notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = creator;
      cap.appendChild(span);
    }
    if (parsed.license) cap.appendChild(document.createTextNode(` / ${parsed.license}`));
    if (parsed.via) {
      cap.appendChild(document.createTextNode(' · '));
      cap.appendChild(document.createTextNode(parsed.via));
    }
    return cap;
  }

  const inline = credit.match(/^Photo\s*:\s*(.+)$/i);
  if (inline) {
    cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
    const label = cleanCreatorDisplay(inline[1].trim());
    if (url && label) {
      const a = creditLink(url, label, 'article-media-credit__creator notranslate');
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'article-media-credit__creator notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = label;
      cap.appendChild(span);
    }
    return cap;
  }

  if (url) {
    const a = creditLink(url, credit, 'article-media-credit__creator notranslate');
    a.setAttribute('translate', 'no');
    cap.appendChild(a);
  } else {
    cap.textContent = credit;
  }
  return cap;
}

function buildMediaCreditElement(item = {}) {
  const sourceUrl = String(item.imageSourceUrl || '').trim();
  const credit = String(item.imageCredit || '').trim();
  if (!credit && !sourceUrl) return null;

  const cap = document.createElement('figcaption');
  // Crédit banque libre / Openverse : photographe + licence en original.
  cap.className = 'article-media-credit notranslate';
  cap.setAttribute('translate', 'no');
  const en = item.lang === 'en';
  const parsed = credit ? parseImageCreditLine(credit) : null;
  const creator = cleanCreatorDisplay(item.imageCreator || parsed?.creator || '')
    || (en ? 'Unknown photographer' : 'Photographe inconnu');

  if (!parsed) {
    if (sourceUrl) {
      const a = creditLink(
        sourceUrl,
        credit || (en ? 'Photo source' : 'Source de la photo'),
        'article-media-credit__creator notranslate',
      );
      a.setAttribute('translate', 'no');
      cap.appendChild(a);
    } else {
      cap.textContent = credit;
    }
    return cap;
  }

  cap.appendChild(document.createTextNode(en ? 'Photo: ' : 'Photo : '));
  if (sourceUrl) {
    const a = creditLink(sourceUrl, creator, 'article-media-credit__creator notranslate');
    a.setAttribute('translate', 'no');
    cap.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.className = 'article-media-credit__creator notranslate';
    span.setAttribute('translate', 'no');
    span.textContent = creator;
    cap.appendChild(span);
  }
  if (parsed.license) {
    cap.appendChild(document.createTextNode(` / ${parsed.license}`));
  }
  if (parsed.via) {
    cap.appendChild(document.createTextNode(' · '));
    if (sourceUrl) {
      cap.appendChild(creditLink(sourceUrl, parsed.via, 'article-media-credit__source'));
    } else {
      cap.appendChild(document.createTextNode(parsed.via));
    }
  }
  return cap;
}

function showArticleImage(article, media, img, kind, item) {
  media.replaceChildren(img);
  let cap = null;
  if (kind === 'photo') {
    if (item?.sourceImageCredit) {
      cap = buildSourcePhotoCreditElement(item);
    } else if (item?.source) {
      // Photo source sans crédit scrapé (ex. La Pige en En bref) :
      // afficher au moins « Crédit photo : [média] » en attendant le bot.
      const en = item.lang === 'en';
      const mediaName = String(item.source).trim();
      cap = buildSourcePhotoCreditElement({
        ...item,
        sourceImageCredit: en ? `Photo credit: ${mediaName}` : `Crédit photo : ${mediaName}`,
        sourceImageCreditFrom: 'media',
        sourceImageCreditUrl: item.link || item.sourceImageCreditUrl || '',
      });
    }
  } else if ((kind === 'stock' || kind === 'fallback') && (item?.imageCredit || item?.imageSourceUrl)) {
    cap = buildMediaCreditElement(item);
  }
  if (cap) {
    media.appendChild(cap);
    media.removeAttribute('aria-hidden');
  }
  article.classList.add('has-image');
  article.classList.remove('article--text');
  if (kind === 'stock') article.classList.add('article--stock-image');
  else if (kind !== 'photo') article.classList.add('article--fallback-image');
  updateNewsLayout();
}

function dropArticleImage(article, media, role, item) {
  if (item) {
    ensureCampusStock(item);
    const alt = resolveDisplayImage(item, { preferPhoto: false, role });
    if (alt.src && (alt.kind === 'stock' || (alt.kind === 'fallback' && role === 'lead'))) {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      img.onload = () => showArticleImage(article, media, img, alt.kind, item);
      img.onerror = () => {
        media.remove();
        article.classList.add('article--text');
        updateNewsLayout();
      };
      img.src = displaySizedImageUrl(alt.src, role);
      return;
    }
  }
  media.remove();
  article.classList.add('article--text');
  updateNewsLayout();
}

function attachArticleImage(article, item, role) {
  const media = article.querySelector('.article-media');
  if (!media) return;
  article.__radarItem = item;

  const failToText = () => dropArticleImage(article, media, role, item);
  const allowFallback = role === 'lead';
  const isThumb = isThumbRoleName(role);

  const loadImage = (src, kind, allowRetry = true, { forceRaw = false } = {}) => {
    if (!src || (kind === 'fallback' && !allowFallback)) {
      failToText();
      return;
    }

    const displaySrc = forceRaw ? src : displaySizedImageUrl(src, role);
    const img = new Image();
    img.decoding = 'async';
    /* Hotlink WP : sans referrer, les origines qui bloquent le-radar.ca passent. */
    img.referrerPolicy = 'no-referrer';
    /* Pas de loading="lazy" ici : une Image() hors du DOM en lazy ne se
       charge jamais — le délai trop court la faisait basculer en mode texte. */
    if (role === 'lead') img.fetchPriority = 'high';
    img.alt = '';
    let settled = false;

    const settleShow = () => {
      if (settled) return;
      settled = true;
      showArticleImage(article, media, img, kind, item);
      if (role === 'lead') ensureLeadTitleAboveMedia(article);
    };

    img.onload = () => {
      if (kind === 'photo' && !isUsableArticleImage(img, role)) {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        // Photo d’article déjà décodée : on la garde. Le campus n’est pas
        // un upgrade de qualité — carte 463×378, portrait 800×800 Collectif.
        if (w >= 120 && h >= 100) {
          settleShow();
          return;
        }
        if (allowRetry) {
          const alt = alternateDisplayImage(item, kind, role, src);
          if (alt.src && alt.src !== src && alt.kind !== 'photo') {
            settled = true;
            loadImage(alt.src, alt.kind, false);
          } else {
            failToText();
          }
        } else {
          failToText();
        }
        return;
      }
      // Stock / campus / photo OK
      settleShow();
    };

    img.onerror = () => {
      if (settled) return;
      // Si l'URL redimensionnée échoue, retenter l'original une fois.
      if (!forceRaw && displaySrc !== src) {
        settled = true;
        loadImage(src, kind, allowRetry, { forceRaw: true });
        return;
      }
      // Origine → Photon → Wayback → thématique/campus (photoDisplayRungs).
      if (allowRetry && (kind === 'photo' || kind === 'stock')) {
        const alt = alternateDisplayImage(item, kind, role, src);
        if (alt.src && alt.src !== src) {
          settled = true;
          loadImage(alt.src, alt.kind, alt.kind === 'photo');
        } else {
          failToText();
        }
      } else {
        failToText();
      }
    };

    img.src = displaySrc;

    // Timeout : une photo d’article lente (origine saine) reste à l’écran
    // jusqu’à onload/onerror — pas de bascule campus. Wayback ~7 s HEAD →
    // 15 s. Origine fragile : 4 s puis Photon, pas le pavillon.
    const srcHost = hostOfHref(src);
    const fromArchive = srcHost.includes('web.archive.org');
    const fromPhoton = srcHost.endsWith('.wp.com');
    const fragileRemote = IMAGE_ARCHIVE_FALLBACK_HOSTS.has(hostOfHref(item?.image || src));
    const timeoutMs = fromArchive ? 15000
      : fromPhoton ? 8000
      : (fragileRemote ? 4000 : (isThumb ? 10000 : 6000));
    window.setTimeout(() => {
      if (settled || article.classList.contains('has-image') || !media.isConnected) return;
      if (kind === 'photo' && !fragileRemote && !fromArchive && !fromPhoton) return;
      const alt = alternateDisplayImage(item, kind, role, src);
      if (alt.src && alt.src !== src && (allowRetry || alt.kind !== kind)) {
        settled = true;
        loadImage(alt.src, alt.kind, alt.kind === 'photo');
      }
    }, timeoutMs);
  };

  const primary = resolveDisplayImage(item, { preferPhoto: true, role });
  loadImage(primary.src, primary.kind);
}

const LEAD_IMAGE_MIN = { width: 720, height: 405, pixels: 320000 };
const FEATURE_IMAGE_MIN = { width: 640, height: 360, pixels: 240000 };
/* Vignettes (vedettes + En bref) : affichées en ~100 px, on accepte des photos
   plus petites et des cadrages portrait — object-fit recadre de toute façon. */
const THUMB_IMAGE_MIN = { width: 200, height: 150, pixels: 40000 };

function isUsableArticleImage(img, role) {
  const width = img.naturalWidth || 0;
  const height = img.naturalHeight || 0;
  const ratio = width / Math.max(height, 1);
  const isThumb = role === 'feature' || role === 'compact';
  const min = role === 'lead' ? LEAD_IMAGE_MIN : (isThumb ? THUMB_IMAGE_MIN : FEATURE_IMAGE_MIN);
  // Dimensions seulement : un dessin éditorial (fond blanc, peu de traits) reste
  // une image d’article. Pas de QC « wallpaper » ici.
  // Vignettes : très tolérant (object-fit). Stock/campus passent sans ce filtre.
  const [ratioMin, ratioMax] = isThumb ? [0.4, 4.0] : [0.95, 2.6];
  return (
    width >= min.width
    && height >= min.height
    && width * height >= min.pixels
    && ratio >= ratioMin
    && ratio <= ratioMax
  );
}

const BYLINE_ARTICLE_STARTERS = /^(Le|La|Les|L'|L'|Un|Une|The|An|À|A)$/iu;

function editorialFallback(lang = 'fr') {
  return lang === 'en' ? 'The editorial team' : 'La rédaction';
}

function canonicalizeEditorialAuthor(name = '') {
  const a = String(name).replace(/^(?:Par|By)\s+/i, '').replace(/\s+/g, ' ').trim();
  if (/^(?:la\s+|l')\s*rédaction$/i.test(a) || /^redaction$/i.test(a)) return 'La rédaction';
  if (/^editorial\s+(?:team|staff|board)$/i.test(a) || /^the\s+editorial\s+team$/i.test(a)) {
    return 'The editorial team';
  }
  if (/^staff\s+writers?$/i.test(a)) return 'The editorial team';
  return '';
}

function resolveDisplayAuthor(item, rawAuthor = '') {
  return normalizeAuthor(rawAuthor || item.author || '')
    || editorialFallback(item.lang === 'en' ? 'en' : 'fr');
}

const CONTRIBUTOR_BYLINE_RE = /^([\p{Lu}][\p{L}'’.\-]+(?:\s+[\p{Lu}][\p{L}'’.\-]+){0,3})\s*[–—-]\s*(?:Contributor|Staff Writer)\b/iu;

function isJunkAuthorName(name = '') {
  const a = String(name).replace(/\s+/g, ' ').trim();
  if (!a || a.length < 2 || a.length > 80) return true;
  if (/^[,;:.]/.test(a) || /[,;]{2,}/.test(a)) return true;
  if (/\bfunction\s*\(/.test(a) || /[{}\[\]]/.test(a)) return true;
  if (/https?:\/\//i.test(a) || /\.(?:php|js|css)\b/i.test(a)) return true;
  if (/\b(?:wp-content|wp-admin|wp-block|prefetch|selector_matches|splide)\b/i.test(a)) return true;
  if (/\b(?:Recent Posts|Skip to content|Written by|Read more|Lire la suite)\b/i.test(a)) return true;
  if (a.split(/\s+/).length > 6) return true;
  return false;
}

function extractBylineFromExcerpt(excerpt = '') {
  const ex = String(excerpt).trim();
  if (/^(?:Par|By)\s+(?:(?:La|L')\s*)?[Rr]édaction\b/i.test(ex)) {
    return {
      author: 'La rédaction',
      body: ex.replace(/^(?:Par|By)\s+(?:(?:La|L')\s*)?[Rr]édaction\.?\s*/i, '').trim(),
    };
  }
  if (/^(?:Par|By)\s+Editorial\s+(?:team|staff|board)\b/i.test(ex)) {
    return {
      author: 'The editorial team',
      body: ex.replace(/^(?:Par|By)\s+Editorial\s+(?:team|staff|board)\.?\s*/i, '').trim(),
    };
  }

  const contributor = ex.match(CONTRIBUTOR_BYLINE_RE);
  if (contributor) {
    const author = normalizeAuthor(contributor[1]);
    const body = ex.slice(contributor[0].length).trim();
    if (author && body.length >= 8) return { author, body };
  }

  if (!/^(?:Par|By)\s+/i.test(ex)) return { author: '', body: ex };

  const tokens = ex.replace(/^\s*(?:Par|By)\s+/i, '').split(/\s+/);
  const nameParts = [];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (nameParts.length >= 1 && BYLINE_ARTICLE_STARTERS.test(token)) break;
    if (nameParts.length >= 2) break;
    if (/^[\p{Lu}][\p{L}'’.\-]+$/u.test(token)) nameParts.push(token);
    else break;
  }

  return {
    author: normalizeAuthor(nameParts.join(' ')),
    body: tokens.slice(i).join(' ').trim(),
  };
}

function extractFirstPersonAuthor(excerpt = '') {
  const plain = String(excerpt).trim();
  const m = plain.match(/^(?:Salut,?\s+)?moi,?\s+c['']est\s+([\p{Lu}][\p{L}'’.\-]+)/iu)
    || plain.match(/^je\s+m['']appelle\s+([\p{Lu}][\p{L}'’.\-]+)/iu);
  return m ? normalizeAuthor(m[1]) : '';
}

function splitByline(item) {
  const ex = String(item.excerpt || '');
  const fromExcerpt = extractBylineFromExcerpt(ex);
  let author = normalizeAuthor(item.author);
  let body = ex;

  if (fromExcerpt.author && (CONTRIBUTOR_BYLINE_RE.test(ex) || /^(?:Par|By)\s+/i.test(ex))) {
    author = fromExcerpt.author;
    body = fromExcerpt.body || body;
    return { author, body };
  }

  if (!author) {
    const firstPerson = extractFirstPersonAuthor(ex);
    if (firstPerson) author = firstPerson;
  }

  if (author) {
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const extended = new RegExp(
      `^\\s*(?:Par|By)\\s+${escaped}(?:\\s+[\\p{Lu}][\\p{L}'’.\\-]+)?(?=\\s+(?:Le|La|Les|L'|L’|Un|Une|À|A|The|An)\\s)`,
      'iu',
    );
    const known = new RegExp(`^\\s*(?:Par|By)\\s+${escaped}\\s*`, 'iu');
    if (extended.test(ex)) body = ex.replace(extended, '').trim();
    else if (known.test(ex)) body = ex.replace(known, '').trim();
  }

  return { author, body };
}

function normalizeAuthor(name = '') {
  let a = String(name).replace(/\s+/g, ' ').trim();
  a = a.replace(/^(?:Par|By)\s+/i, '').trim();
  const editorial = canonicalizeEditorialAuthor(a);
  if (editorial) return editorial;
  if (!a || GENERIC_AUTHORS.test(a) || /@/.test(a) || isJunkAuthorName(a)) return '';
  return a;
}

// ─── Date / time formatting (Québec) ────────────────────────────────────────────
function formatTime(d, lang = 'fr') {
  if (isNaN(d)) return '';
  if (lang === 'en') {
    return d.toLocaleTimeString('en-CA', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('hour')} h ${part('minute')}`;
}

function formatCompactCalendarDate(d, lang = 'fr') {
  if (isNaN(d)) return '';
  if (lang === 'en') {
    return d.toLocaleDateString('en-CA', {
      timeZone: 'America/Toronto',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatStamp(d) {
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;

  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const time = formatTime(d);

  if (sameDay) return `aujourd'hui, ${time}`;
  if (isYesterday) return `hier, ${time}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString('fr-CA', {
    day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${dateStr}, ${time}`;
}

/** Date courte pour cartes compactes (En bref, Suite du fil). */
function formatStampCompact(d, lang = 'fr') {
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMin = Math.round((now - d) / 60000);
  const l = lang === 'en' ? 'en' : 'fr';

  if (diffMin < 1) return l === 'en' ? 'just now' : "à l'instant";
  if (diffMin < 60) return l === 'en' ? `${diffMin} min ago` : `il y a ${diffMin} min`;

  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  const clock = formatTime(d, l);

  if (sameDay) {
    if (l === 'en') return clock ? `Today, ${clock}` : 'Today';
    return clock ? `aujourd'hui, ${clock}` : "aujourd'hui";
  }
  if (isYesterday) {
    if (l === 'en') return clock ? `Yesterday, ${clock}` : 'Yesterday';
    return clock ? `hier, ${clock}` : 'hier';
  }

  const date = formatCompactCalendarDate(d, l);
  return [date, clock].filter(Boolean).join(' · ');
}

// ─── Title / brief cleanup ───────────────────────────────────────────────────────
const MC_CATEGORY_PREFIX = /^(?:Photoreportage|Marché aux puces|Cobaye|Incursion|Reportage|Opinion|Entrevue|Critique|Chronique)/;

function stripEmbeddedCss(title = '') {
  let t = String(title).trim();
  if (!/^\.[\w-]+\s*\{/.test(t) && !/@media/i.test(t)) return t;
  const start = t.indexOf('{');
  if (start === -1) return t;
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    if (t[i] === '{') depth += 1;
    else if (t[i] === '}') {
      depth -= 1;
      if (depth === 0) return t.slice(i + 1).trim();
    }
  }
  return t;
}

/** Retire puces / symboles en tête, mais garde chiffres et lettres (« 14 bourses… »). */
function stripLeadingNonLetters(title = '') {
  return String(title).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** Aligné sur scripts/html-entities-lib.js — inclut &eacute;, &ccedil;, etc. */
const NAMED_HTML_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00A0', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C',
  laquo: '«', raquo: '»',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ', oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ', Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  oelig: 'œ', OElig: 'Œ',
};

function decodeNamedHtmlEntities(str = '') {
  return String(str).replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(NAMED_HTML_ENTITIES, name)
      ? NAMED_HTML_ENTITIES[name]
      : match
  ));
}

/** fromCodePoint sûr : couvre les caractères astraux (émojis) sans lever sur un code invalide. */
function safeFromCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(str = '') {
  let s = String(str);
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = s;
    s = s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#(\d+);/g, (m, n) => safeFromCodePoint(parseInt(n, 10), m))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => safeFromCodePoint(parseInt(n, 16), m))
      .replace(/&#0?39;/gi, '’');
    s = decodeNamedHtmlEntities(s)
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    if (s === prev) break;
  }
  return s;
}

/**
 * Aligné sur scripts/html-entities-lib.js (fixDropCapSpacing).
 * Recolle la lettrine WP détachée par le strip HTML (« L e 18… » → « Le 18… »),
 * sauf quand la majuscule isolée est un mot complet (« À cette fin… ») — sinon
 * on fabriquait « Àcette ».
 */
const STANDALONE_CAPITAL_WORD_RE = /^[AÀÂIÎOÔY]$/u;

function fixDropCapSpacing(text = '') {
  return String(text)
    .replace(/^([\p{Lu}])\s+(['’])/u, '$1$2')
    .replace(/^([\p{Lu}])\s+([\p{Ll}])/u, (match, cap, next) => (
      STANDALONE_CAPITAL_WORD_RE.test(cap) ? match : `${cap}${next}`
    ));
}

function cleanTitle(title = '') {
  let t = decodeHtmlEntities(stripEmbeddedCss(title));
  t = t.replace(/\s+/g, ' ').trim();
  // Suffixes SEO collés aux og:title (Rank Math) — déjà stripés côté bot, mais
  // on nettoie aussi les news.json déjà en cache.
  t = t.replace(/\s*[–—|-]\s*Montréal\s+Campus\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Quartier\s+Libre\s*$/i, '').trim();
  t = t.replace(/\s*[–—|-]\s*Le\s+D[eé]lit\s*$/i, '').trim();
  t = t.replace(/\bUde\s+M\b/g, 'UdeM').replace(/\bUde\s+S\b/g, 'UdeS');
  t = t.replace(/\bMc\s+Gill\b/g, 'McGill');
  const prefix = t.match(MC_CATEGORY_PREFIX);
  if (prefix) t = t.slice(prefix[0].length).trim();
  t = stripLeadingNonLetters(t);
  // Titres doubles sans ponctuation (ex. « Magazines à potins En papier… »)
  return t.replace(
    /([\p{Ll}àâäéèêëïîôùûüç'’])\s+(En|Le|La|Les|L'|L'|Un|Une|The|A|An)\s+/gu,
    '$1 — $2 ',
  );
}

function stripLeadingByline(text = '', author = '') {
  if (!text || !author) return text;
  const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(`^(?:Par|By)\\s+${escaped}\\s*`, 'iu'), '').trim();
}

function leadBriefSource(item) {
  const { author, body } = splitByline(item);
  const raw = String(item.leadExcerpt || '').trim()
    || body
    || String(item.excerpt || '');
  return stripLeadingByline(sanitizeBriefBody(raw), author);
}

function compactBriefSource(item) {
  const { author, body } = splitByline(item);
  return stripLeadingByline(sanitizeBriefBody(body || item.excerpt || ''), author);
}

function featureBriefSource(item) {
  /* Aligné sur la une : leadExcerpt en priorité. */
  return leadBriefSource(item);
}

function ensureFeatureBriefMinLines(brief, truncated, item) {
  return ensureLeadBriefMinLines(brief, truncated, item, 'feature');
}

function ensureCompactBriefMinLines(brief, truncated, item) {
  const { author } = splitByline(item);
  brief = stripLeadingByline(brief, author);
  const minChars = briefMinCharsForRole('compact');

  if (brief.length >= minChars) {
    const full = compactBriefSource(item);
    if (full.length > brief.length + 12) truncated = true;
    return { text: brief, truncated };
  }

  const fallback = compactBriefSource(item);
  if (fallback.length > brief.length) {
    const extended = prepareBrief(fallback, 'compact');
    if (extended.text.length > brief.length) {
      brief = stripLeadingByline(extended.text, author);
      truncated = extended.truncated;
    }
  }
  if (fallback.length > brief.length + 12) truncated = true;
  return { text: brief, truncated };
}

function ensureLeadBriefMinLines(brief, truncated, item, role = 'lead') {
  const { author } = splitByline(item);
  brief = stripLeadingByline(brief, author);
  const minChars = briefMinCharsForRole(role === 'feature' ? 'feature' : 'lead');
  const prepRole = role === 'feature' ? 'feature' : 'lead';

  if (brief.length >= minChars) {
    return { text: brief, truncated };
  }

  const fallback = leadBriefSource(item);
  if (fallback.length > brief.length) {
    const extended = prepareBrief(fallback, prepRole);
    if (extended.text.length > brief.length) {
      brief = stripLeadingByline(extended.text, author);
      truncated = extended.truncated;
    }
  }
  if (brief.length >= minChars) {
    return { text: brief, truncated };
  }

  const title = cleanTitle(item.title);
  const pieces = [];
  if (title.length > 8) pieces.push(title);
  if (fallback && !pieces.some((part) => part.includes(fallback.slice(0, 24)))) pieces.push(fallback);
  const inst = articleInstitutionLabel(item.institution, item.type);
  if (item.source) {
    const ctx = item.lang === 'en'
      ? `From ${item.source}${inst ? ` (${inst})` : ''}.`
      : `Dans ${item.source}${inst ? ` (${inst})` : ''}.`;
    pieces.push(ctx);
  }
  const combined = prepareBrief(pieces.join(' '), prepRole);
  if (combined.text.length > brief.length) {
    return {
      text: stripLeadingByline(combined.text, author),
      truncated: combined.truncated,
    };
  }
  return { text: brief, truncated };
}

function sanitizeBriefBody(raw = '') {
  let s = decodeHtmlEntities(String(raw));
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\]\]>/g, '');
  s = s.replace(/\s*L['’]article\b[\s\S]*?est apparu en premier sur[\s\S]*$/i, '');
  s = s.replace(/\s*The\s+post\b[\s\S]*?appeared first on[\s\S]*$/i, '');
  const li = s.search(/\sL['’]article\s/);
  if (li > 30) s = s.slice(0, li);
  s = s.replace(/\[[^\]]*(?:read more|lire la suite|continue reading)[^\]]*\]/gi, '');
  s = s.replace(/\b(?:read more|lire la suite|continue reading)\b\.?\s*$/i, '');
  s = s.replace(/^(?:Dear Tribune|Dear Editor),?\s*/i, '');
  // Crédits photo collés au chapô RSS (ex. « …Pierre. (Photo : Léa Morin-Letort) L’heure »)
  // — le crédit reste sous la vignette (.article-media-credit), pas dans le corps.
  s = s.replace(/\s*\(\s*(?:Photo(?:\s*credit)?|Crédit(?:\s*photo)?|Credit|Image|Illustration)\s*:\s*[^)]+\)\.?\s*/gi, ' ');
  s = s.replace(/(?:^|[.\s])(?:Photo(?:\s*credit)?|Crédit(?:\s*photo)?|Credit|Image|Illustration)\s*:\s*[^.!?\n(]{2,80}\.?\s*/gi, ' ');
  // Orphelin après une phrase complète (début de phrase suivante coupé par le scrape).
  s = s.replace(/([.!?»"')\]])\s+[\p{L}'’]{1,18}\s*$/u, '$1');
  s = s.replace(/(?:…|\.{3,}|\[…\]|\[\.\.\.\]|\[&hellip;\])/gi, '');
  s = s.replace(/\.\s*\./g, '.');
  s = s.replace(/\s+/g, ' ').trim();
  // WP has-drop-cap dans le flux : « L e 18… » / « L 'identité »
  s = fixDropCapSpacing(s);
  return s;
}

function endsCompleteSentence(text = '') {
  return /[.!?»"')\]]\s*$/.test(String(text).trim());
}

function resolveBrief(item, body, role) {
  for (const raw of [body, String(item.excerpt || '')]) {
    const result = prepareBrief(raw, role);
    if (result.text) {
      if (role === 'compact') {
        const full = sanitizeBriefBody(raw);
        if (full.length > 95 || full.length > result.text.length + 12) {
          result.truncated = true;
        }
      }
      return result;
    }
  }
  return prepareBrief(cleanTitle(item.title), role);
}

function prepareBrief(raw = '', role = 'standard') {
  const limit = briefLimitForRole(role);
  let s = sanitizeBriefBody(raw);
  if (!s || limit === 0 || s.length < 8) return { text: '', truncated: false };

  const minTruncMark = role === 'compact' ? 48 : 80;

  if (s.length <= limit) {
    const truncated = !endsCompleteSentence(s) && s.length >= minTruncMark;
    const text = s.replace(/[,;:\s]+$/u, '').trimEnd() || s;
    return { text, truncated };
  }

  let cut = s.slice(0, limit);
  // Magazine 2 col : ne pas laisser la fin de phrase allonger l’extrait
  // (sinon les cartes varient trop et l’équilibre une|En bref casse).
  const sentenceSlack = isMidwidthMagazinePreview()
    ? 36
    : (isDesktopMagazineLayout() ? 48 : 100);
  const sentenceEnd = s.slice(limit).search(/[.!?»"')\]](?:\s|$)/);
  if (sentenceEnd >= 0 && sentenceEnd < sentenceSlack) {
    cut = s.slice(0, limit + sentenceEnd + 1);
  } else {
    // Préférer une coupure sur ponctuation faible, sinon dernier mot complet
    // (éviter « si je me » + Lire la suite collé).
    const soft = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf(', '),
      cut.lastIndexOf('; '),
      cut.lastIndexOf(' : '),
      cut.lastIndexOf(' — '),
      cut.lastIndexOf(' – '),
    );
    if (soft > limit * 0.55) {
      cut = cut.slice(0, soft + 1);
    } else {
      const lastSpace = cut.lastIndexOf(' ');
      if (lastSpace > limit * 0.5) cut = cut.slice(0, lastSpace);
    }
  }
  cut = cut.replace(/[,;:\s]+$/u, '').trimEnd();
  if (!cut) return { text: '', truncated: false };

  // Points de suspension si la phrase n’est pas terminée (sépare du « Lire la suite »).
  if (!endsCompleteSentence(cut) && !/[…]\s*$/.test(cut)) {
    cut = `${cut}…`;
  }

  return { text: cut, truncated: true };
}


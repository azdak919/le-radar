/**
 * LE-RADAR — page « Au tableau » (/sports/).
 * Progressive enhancement : sans ce script, toute la grille reste visible.
 * Filtres : sport · catégorie (féminin/masculin) · secteur · ?team=
 * + loupe de recherche locale (équipe, institution, sport…)
 * + flèche « haut de page » (bas-gauche, suit le défilement)
 */
(function () {
  'use strict';

  const root = document.querySelector('[data-sports-board]');
  if (!root) return;

  const panels = Array.from(root.querySelectorAll('.sports-panel'));
  const blocks = Array.from(root.querySelectorAll('.sports-sport-block'));
  const sexGroups = Array.from(root.querySelectorAll('.sports-sex-group'));
  const statusEl = root.querySelector('[data-sports-status]');
  const sportButtons = Array.from(root.querySelectorAll('[data-filter-sport]'));
  const sectorButtons = Array.from(root.querySelectorAll('[data-filter-sector]'));
  const sexButtons = Array.from(root.querySelectorAll('[data-filter-sex]'));
  // Compter seulement les formations avec scores (pas les cartes « liens »).
  const scoredPanels = panels.filter((p) => !p.classList.contains('sports-panel--external'));

  const tools = document.querySelector('[data-sports-tools]');
  const scrollTopBtn = document.getElementById('sports-scroll-top');
  const searchRoot = document.getElementById('sports-search');
  const searchToggle = document.getElementById('sports-search-toggle');
  const searchPanel = document.getElementById('sports-search-panel');
  const searchInput = document.getElementById('sports-search-input');
  const searchClear = document.getElementById('sports-search-clear');
  const searchHint = document.getElementById('sports-search-hint');

  const labels = {
    fr: {
      status: (n, total) => (n === total
        ? `${n} formation${n > 1 ? 's' : ''}`
        : `${n} formation${n > 1 ? 's' : ''} sur ${total}`),
      boardsOnly: 'Tableaux officiels (liens)',
      empty: 'Aucune formation pour ce filtre.',
      searchEmpty: 'Aucune formation ne correspond à cette recherche.',
      searchStatus: (n, q) => (n === 0
        ? `Aucun résultat pour « ${q} »`
        : `${n} formation${n > 1 ? 's' : ''} pour « ${q} »`),
    },
    en: {
      status: (n, total) => (n === total
        ? `${n} team${n > 1 ? 's' : ''}`
        : `${n} of ${total} team${total > 1 ? 's' : ''}`),
      boardsOnly: 'Official boards (links)',
      empty: 'No teams match this filter.',
      searchEmpty: 'No teams match this search.',
      searchStatus: (n, q) => (n === 0
        ? `No results for “${q}”`
        : `${n} team${n > 1 ? 's' : ''} for “${q}”`),
    },
  };
  const lang = (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  const t = labels[lang];

  let searchOpen = false;
  let searchQuery = '';
  let searchTimer = 0;

  function normalizeSearchText(str = '') {
    return String(str)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function searchTokens(query = '') {
    const q = normalizeSearchText(query);
    if (!q) return [];
    return q.split(' ').filter((tok) => tok.length >= 1);
  }

  function panelHaystack(panel) {
    const attr = panel.getAttribute('data-search') || '';
    if (attr) return normalizeSearchText(attr);
    return normalizeSearchText(panel.textContent || '');
  }

  // Cache des haystacks (772 panels) — une seule normalisation.
  const hayByPanel = new Map();
  panels.forEach((p) => hayByPanel.set(p, panelHaystack(p)));

  function panelMatchesSearch(panel, tokens) {
    if (!tokens.length) return true;
    const hay = hayByPanel.get(panel) || '';
    return tokens.every((tok) => hay.includes(tok));
  }

  function readQuery() {
    try {
      const q = new URLSearchParams(window.location.search);
      return {
        sport: (q.get('sport') || 'all').toLowerCase(),
        sector: (q.get('sector') || 'all').toLowerCase(),
        sex: (q.get('sex') || 'all').toLowerCase(),
        team: (q.get('team') || '').trim(),
        q: (q.get('q') || '').trim(),
      };
    } catch {
      return { sport: 'all', sector: 'all', sex: 'all', team: '', q: '' };
    }
  }

  function writeQuery(sport, sector, sex, team, q) {
    try {
      const url = new URL(window.location.href);
      if (!sport || sport === 'all') url.searchParams.delete('sport');
      else url.searchParams.set('sport', sport);
      if (!sector || sector === 'all') url.searchParams.delete('sector');
      else url.searchParams.set('sector', sector);
      if (!sex || sex === 'all') url.searchParams.delete('sex');
      else url.searchParams.set('sex', sex);
      if (!team) url.searchParams.delete('team');
      else url.searchParams.set('team', team);
      if (!q) url.searchParams.delete('q');
      else url.searchParams.set('q', q);
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch { /* ignore */ }
  }

  function setPressed(buttons, value, attr) {
    buttons.forEach((btn) => {
      const v = (btn.getAttribute(attr) || '').toLowerCase();
      const on = v === value;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
    });
  }

  function clearTeamSpotlight() {
    panels.forEach((p) => p.classList.remove('is-spotlight'));
  }

  /**
   * Deep-link ?team=… : comme la sélection d’une station — la carte formation
   * cible est visible, ouverte dans sa section, surbrillée et amenée au centre.
   */
  function focusTeam(teamId) {
    clearTeamSpotlight();
    if (!teamId) return null;
    const panel = panels.find((p) => (p.getAttribute('data-team') || '') === teamId);
    if (!panel) return null;
    panel.hidden = false;
    const block = panel.closest('.sports-sport-block');
    if (block) {
      block.hidden = false;
      if ('open' in block) block.open = true;
    }
    // Afficher le sous-groupe sexe parent.
    let el = panel.previousElementSibling;
    while (el) {
      if (el.classList && el.classList.contains('sports-sex-group')) {
        el.hidden = false;
        break;
      }
      if (el.classList && el.classList.contains('sports-panel')) break;
      el = el.previousElementSibling;
    }
    panel.classList.add('is-spotlight');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch { /* ignore */ }
      });
    });
    return panel;
  }

  function focusFirstVisible() {
    const first = panels.find((p) => !p.hidden && !p.classList.contains('sports-panel--external'));
    if (!first) return;
    const block = first.closest('.sports-sport-block');
    if (block && 'open' in block) block.open = true;
    try {
      first.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
  }

  function apply(sport, sector, sex, team, query) {
    const sportKey = sport || 'all';
    const sectorKey = sector || 'all';
    const sexKey = (sex || 'all').toLowerCase();
    const teamId = (team || '').trim();
    const qRaw = query !== undefined ? String(query || '') : searchQuery;
    searchQuery = qRaw;
    const tokens = searchTokens(qRaw);
    let visible = 0;

    // Si une équipe est ciblée, dériver sport/sexe du panneau.
    let effectiveSport = sportKey;
    let effectiveSex = sexKey;
    if (teamId && !tokens.length) {
      const target = panels.find((p) => (p.getAttribute('data-team') || '') === teamId);
      const tSport = (target?.getAttribute('data-sport') || '').toLowerCase();
      const tSex = (target?.getAttribute('data-sex') || '').toLowerCase();
      if (tSport) effectiveSport = tSport;
      if (tSex) effectiveSex = tSex;
    }

    // Recherche texte : élargir sport/sexe (sinon les chips bloquent le scan).
    if (tokens.length) {
      effectiveSport = 'all';
      effectiveSex = 'all';
    }

    let externalVisible = 0;
    panels.forEach((panel) => {
      const pSport = (panel.getAttribute('data-sport') || '').toLowerCase();
      const pSector = (panel.getAttribute('data-sector') || '').toLowerCase();
      const pSex = (panel.getAttribute('data-sex') || '').toLowerCase();
      const isExternal = panel.classList.contains('sports-panel--external');
      const okSport = effectiveSport === 'all' || pSport === effectiveSport;
      const okSector = isExternal || sectorKey === 'all' || !pSector || pSector === sectorKey;
      // External boards : toujours ok pour le filtre sexe (pas de catégorie).
      const okSex = isExternal || effectiveSex === 'all' || !pSex || pSex === effectiveSex;
      const okSearch = panelMatchesSearch(panel, tokens);
      const show = okSport && okSector && okSex && okSearch;
      panel.hidden = !show;
      if (show && !isExternal) visible += 1;
      if (show && isExternal) externalVisible += 1;
    });

    // Sous-titres Féminin/Masculin (legacy) : masquer si plus de panneaux.
    sexGroups.forEach((heading) => {
      const gSex = (heading.getAttribute('data-sex-group') || '').toLowerCase();
      const board = heading.parentElement;
      if (!board) {
        heading.hidden = true;
        return;
      }
      const any = Array.from(board.querySelectorAll('.sports-panel')).some((p) => {
        if (p.hidden) return false;
        const pSex = (p.getAttribute('data-sex') || '').toLowerCase();
        if (gSex === 'x' || gSex === '') return !pSex;
        return pSex === gSex;
      });
      heading.hidden = !any;
    });

    // Re-trier chaque grille : prochain match le plus proche en premier (H/F indifférent).
    root.querySelectorAll('[data-sports-schedule-sort]').forEach((board) => {
      const kids = Array.from(board.querySelectorAll(':scope > .sports-panel'));
      if (kids.length < 2) return;
      kids.sort((a, b) => {
        const ta = parseFloat(a.getAttribute('data-next-ts') || '');
        const tb = parseFloat(b.getAttribute('data-next-ts') || '');
        const aOk = Number.isFinite(ta);
        const bOk = Number.isFinite(tb);
        if (aOk && bOk && ta !== tb) return ta - tb;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        const na = (a.querySelector('.sports-panel__name-text')?.textContent || '').trim();
        const nb = (b.querySelector('.sports-panel__name-text')?.textContent || '').trim();
        return na.localeCompare(nb, 'fr');
      });
      kids.forEach((el) => board.appendChild(el));
    });

    blocks.forEach((block) => {
      const bSport = (block.getAttribute('data-sport') || '').toLowerCase();
      const any = panels.some((p) => (
        !p.hidden
        && (p.getAttribute('data-sport') || '').toLowerCase() === bSport
      ));
      const sportOk = effectiveSport === 'all' || bSport === effectiveSport;
      block.hidden = !(any && sportOk);
      if ((effectiveSport !== 'all' || tokens.length) && any && 'open' in block) {
        if (bSport === effectiveSport || tokens.length) block.open = true;
      }
    });

    setPressed(sportButtons, tokens.length ? 'all' : effectiveSport, 'data-filter-sport');
    setPressed(sectorButtons, sectorKey, 'data-filter-sector');
    setPressed(sexButtons, tokens.length ? 'all' : effectiveSex, 'data-filter-sex');

    if (statusEl) {
      if (tokens.length) {
        statusEl.textContent = t.searchStatus(visible, qRaw.trim());
      } else if (visible) {
        statusEl.textContent = t.status(visible, scoredPanels.length);
      } else if (externalVisible) {
        statusEl.textContent = t.boardsOnly;
      } else {
        statusEl.textContent = t.empty;
      }
    }
    writeQuery(
      tokens.length ? 'all' : effectiveSport,
      sectorKey,
      tokens.length ? 'all' : effectiveSex,
      teamId,
      qRaw.trim(),
    );

    if (searchRoot) {
      searchRoot.classList.toggle('has-query', tokens.length > 0);
    }
    if (searchClear) {
      searchClear.classList.toggle('hidden', !qRaw.trim());
    }
    if (searchToggle) {
      searchToggle.classList.toggle('is-active', tokens.length > 0);
    }

    if (teamId && !tokens.length) {
      focusTeam(teamId);
    } else if (tokens.length && visible) {
      // Ne pas auto-scroller à chaque frappe — seulement si un seul match.
      if (visible === 1) focusFirstVisible();
    } else {
      clearTeamSpotlight();
    }
  }

  function currentFilters() {
    const sport = sportButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sport') || 'all';
    const sector = sectorButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sector') || 'all';
    const sex = sexButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sex') || 'all';
    return { sport, sector, sex };
  }

  function onFilterClick(e) {
    const btn = e.target.closest('[data-filter-sport], [data-filter-sector], [data-filter-sex]');
    if (!btn || !root.contains(btn)) return;
    const sport = btn.hasAttribute('data-filter-sport')
      ? btn.getAttribute('data-filter-sport')
      : (sportButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sport') || 'all');
    const sector = btn.hasAttribute('data-filter-sector')
      ? btn.getAttribute('data-filter-sector')
      : (sectorButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sector') || 'all');
    const sex = btn.hasAttribute('data-filter-sex')
      ? btn.getAttribute('data-filter-sex')
      : (sexButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-sex') || 'all');
    // Nouveau filtre chips : on efface la requête texte pour éviter le conflit.
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    apply(sport, sector, sex, '', '');
  }

  root.addEventListener('click', onFilterClick);

  /**
   * Clic « Au tableau » (titre, fil d’Ariane, pied) : recharge la page sans
   * filtres (sport / secteur / catégorie / équipe / hash).
   */
  function resetSportsBoard(e) {
    const link = e.target.closest('[data-sports-reset]');
    if (!link) return;
    e.preventDefault();
    try {
      const url = new URL(link.getAttribute('href') || './', window.location.href);
      // URL propre du tableau (pas de query ni de hash section).
      const cleanPath = url.pathname.replace(/\/?$/, '/');
      const here = window.location.pathname.replace(/\/?$/, '/');
      if (here === cleanPath && !window.location.search && !window.location.hash) {
        window.location.reload();
      } else {
        window.location.assign(cleanPath);
      }
    } catch {
      window.location.assign('./');
    }
  }
  document.addEventListener('click', resetSportsBoard);

  function openHashSport() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash.startsWith('sport-')) return;
    const el = document.getElementById(hash);
    if (!el || !el.classList.contains('sports-sport-block')) return;
    if ('open' in el) el.open = true;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ }
  }

  // ── Loupe de recherche ───────────────────────────────────────────────────
  function setSearchOpen(open) {
    searchOpen = !!open;
    if (!searchPanel || !searchToggle) return;
    if (searchOpen) {
      searchPanel.hidden = false;
      searchPanel.setAttribute('aria-hidden', 'false');
      searchToggle.setAttribute('aria-expanded', 'true');
      window.requestAnimationFrame(() => {
        try { searchInput?.focus({ preventScroll: true }); } catch { searchInput?.focus(); }
      });
    } else {
      searchPanel.hidden = true;
      searchPanel.setAttribute('aria-hidden', 'true');
      searchToggle.setAttribute('aria-expanded', 'false');
    }
    const loupe = searchToggle.querySelector('.sports-search__fab-loupe');
    const close = searchToggle.querySelector('.sports-search__fab-close');
    loupe?.classList.toggle('hidden', searchOpen);
    close?.classList.toggle('hidden', !searchOpen);
  }

  function scheduleSearchApply() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const { sport, sector, sex } = currentFilters();
      apply(sport, sector, sex, '', searchInput?.value || '');
    }, 120);
  }

  if (searchToggle && searchPanel) {
    searchToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Si requête active et panneau fermé + clic X (is-active) : effacer.
      if (!searchOpen && searchQuery.trim()) {
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        const { sport, sector, sex } = currentFilters();
        apply(sport, sector, sex, '', '');
        setSearchOpen(false);
        return;
      }
      setSearchOpen(!searchOpen);
    });

    searchInput?.addEventListener('input', scheduleSearchApply);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (searchInput.value) {
          searchInput.value = '';
          scheduleSearchApply();
        } else {
          setSearchOpen(false);
        }
      }
    });

    searchClear?.addEventListener('click', (e) => {
      e.preventDefault();
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      const { sport, sector, sex } = currentFilters();
      apply(sport, sector, sex, '', '');
      try { searchInput?.focus({ preventScroll: true }); } catch { searchInput?.focus(); }
    });

    document.addEventListener('click', (e) => {
      if (!searchOpen) return;
      if (searchRoot && searchRoot.contains(e.target)) return;
      setSearchOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    });
  }

  // ── Flèche haut de page (bas-gauche, suit le scroll) ─────────────────────
  const SCROLL_TOP_SHOW_PX = 360;

  function syncScrollTopBtn() {
    if (!scrollTopBtn) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const show = y > SCROLL_TOP_SHOW_PX;
    if (show) {
      scrollTopBtn.hidden = false;
      scrollTopBtn.setAttribute('aria-hidden', 'false');
    } else {
      scrollTopBtn.hidden = true;
      scrollTopBtn.setAttribute('aria-hidden', 'true');
    }
  }

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, 0);
      }
    });
    window.addEventListener('scroll', syncScrollTopBtn, { passive: true });
    syncScrollTopBtn();
  }

  // Safe-area clavier (visualViewport) — même idée que la loupe articles.
  function syncVkInset() {
    if (!tools || !window.visualViewport) return;
    const vv = window.visualViewport;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    tools.style.setProperty('--vk-inset', `${Math.round(inset)}px`);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVkInset);
    window.visualViewport.addEventListener('scroll', syncVkInset);
    syncVkInset();
  }

  const initial = readQuery();
  const knownSports = new Set([
    ...panels.map((p) => (p.getAttribute('data-sport') || '').toLowerCase()),
    ...blocks.map((b) => (b.getAttribute('data-sport') || '').toLowerCase()),
  ].filter(Boolean));
  const knownSectors = new Set(panels.map((p) => (p.getAttribute('data-sector') || '').toLowerCase()).filter(Boolean));
  const knownSexes = new Set(['f', 'm', 'all']);
  const knownTeams = new Set(panels.map((p) => p.getAttribute('data-team') || '').filter(Boolean));
  // Alias w → f (anglais women's).
  let sexInit = initial.sex === 'w' ? 'f' : initial.sex;
  if (sexInit === 'women' || sexInit === 'feminin' || sexInit === 'féminin') sexInit = 'f';
  if (sexInit === 'men' || sexInit === 'masculin') sexInit = 'm';
  const sport = knownSports.has(initial.sport) || initial.sport === 'all' ? initial.sport : 'all';
  const sector = knownSectors.has(initial.sector) || initial.sector === 'all' ? initial.sector : 'all';
  const sex = knownSexes.has(sexInit) ? sexInit : 'all';
  const team = knownTeams.has(initial.team) ? initial.team : '';
  if (searchInput && initial.q) {
    searchInput.value = initial.q;
    searchQuery = initial.q;
  }
  apply(sport, sector, sex, team, initial.q || '');
  if (initial.q) setSearchOpen(true);
  if (!team && !initial.q) openHashSport();
  window.addEventListener('hashchange', openHashSport);
})();

/**
 * LE-RADAR — filtres de la page « Au tableau » (/sports/).
 * Progressive enhancement : sans ce script, toute la grille reste visible.
 * Filtres : sport · catégorie (féminin/masculin) · secteur · ?team=
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

  const labels = {
    fr: {
      status: (n, total) => (n === total
        ? `${n} formation${n > 1 ? 's' : ''}`
        : `${n} formation${n > 1 ? 's' : ''} sur ${total}`),
      boardsOnly: 'Tableaux officiels (liens)',
      empty: 'Aucune formation pour ce filtre.',
    },
    en: {
      status: (n, total) => (n === total
        ? `${n} team${n > 1 ? 's' : ''}`
        : `${n} of ${total} team${total > 1 ? 's' : ''}`),
      boardsOnly: 'Official boards (links)',
      empty: 'No teams match this filter.',
    },
  };
  const lang = (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  const t = labels[lang];

  function readQuery() {
    try {
      const q = new URLSearchParams(window.location.search);
      return {
        sport: (q.get('sport') || 'all').toLowerCase(),
        sector: (q.get('sector') || 'all').toLowerCase(),
        sex: (q.get('sex') || 'all').toLowerCase(),
        team: (q.get('team') || '').trim(),
      };
    } catch {
      return { sport: 'all', sector: 'all', sex: 'all', team: '' };
    }
  }

  function writeQuery(sport, sector, sex, team) {
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

  function apply(sport, sector, sex, team) {
    const sportKey = sport || 'all';
    const sectorKey = sector || 'all';
    const sexKey = (sex || 'all').toLowerCase();
    const teamId = (team || '').trim();
    let visible = 0;

    // Si une équipe est ciblée, dériver sport/sexe du panneau.
    let effectiveSport = sportKey;
    let effectiveSex = sexKey;
    if (teamId) {
      const target = panels.find((p) => (p.getAttribute('data-team') || '') === teamId);
      const tSport = (target?.getAttribute('data-sport') || '').toLowerCase();
      const tSex = (target?.getAttribute('data-sex') || '').toLowerCase();
      if (tSport) effectiveSport = tSport;
      if (tSex) effectiveSex = tSex;
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
      const show = okSport && okSector && okSex;
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
      if (effectiveSport !== 'all' && bSport === effectiveSport && any && 'open' in block) {
        block.open = true;
      }
    });

    setPressed(sportButtons, effectiveSport, 'data-filter-sport');
    setPressed(sectorButtons, sectorKey, 'data-filter-sector');
    setPressed(sexButtons, effectiveSex, 'data-filter-sex');

    if (statusEl) {
      if (visible) {
        statusEl.textContent = t.status(visible, scoredPanels.length);
      } else if (externalVisible) {
        statusEl.textContent = t.boardsOnly;
      } else {
        statusEl.textContent = t.empty;
      }
    }
    writeQuery(effectiveSport, sectorKey, effectiveSex, teamId);
    focusTeam(teamId);
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
    apply(sport, sector, sex, '');
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
  apply(sport, sector, sex, team);
  if (!team) openHashSport();
  window.addEventListener('hashchange', openHashSport);
})();

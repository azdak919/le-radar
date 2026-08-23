/**
 * LE-RADAR SAT — widget sports formats IAB.
 * Flip LCD (style gadget) entre résultats, prochains, et promo marque.
 */
(function () {
  'use strict';

  const FORMATS = new Set(['300x250', '336x280', '728x90', '320x50', '300x600', '160x600']);
  const SKINS = new Set(['amber', 'violet', 'eink']);
  const TZ = 'America/Toronto';
  const BRAND_EVERY = 4;
  const FLIP_MS = 180;
  const DWELL_MS = 4800;
  const HOME = 'https://le-radar.ca/';
  const SPORTS = 'https://le-radar.ca/sports/';

  const GLYPH = [
    [/basket/i, '🏀'],
    [/hockey/i, '🏒'],
    [/voile|sail/i, '⛵'],
    [/badminton/i, '🏸'],
    [/baseball|base-ball/i, '⚾'],
    [/ultimate|frisbee/i, '🥏'],
    [/rugby/i, '🏉'],
    [/volley/i, '🏐'],
    [/futsal|soccer|interieur|intérieur/i, '⚽'],
    [/flag/i, '🚩'],
    [/football/i, '🏈'],
    [/natat|swim/i, '🏊'],
    [/golf/i, '⛳'],
    [/cross|athlet/i, '🏃'],
    [/cheer/i, '📣'],
  ];

  const params = new URLSearchParams(location.search);
  const html = document.documentElement;

  function applyChrome() {
    const fmt = FORMATS.has(params.get('fmt')) ? params.get('fmt') : '300x250';
    let skin = SKINS.has(params.get('skin')) ? params.get('skin') : 'amber';
    let theme = params.get('theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = html.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    if (skin === 'eink') theme = 'light';
    html.dataset.fmt = fmt;
    html.dataset.skin = skin;
    html.dataset.theme = theme;
    html.style.width = fmt.split('x')[0] + 'px';
    html.style.height = fmt.split('x')[1] + 'px';
    const [w, h] = fmt.split('x').map(Number);
    try {
      parent.postMessage({ type: 'radar-sports-ad', protocol: 1, width: w, height: h, fmt, ready: true }, '*');
    } catch (_) { /* ignore */ }
  }

  applyChrome();

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'radar-sports-ad-theme' && (data.theme === 'light' || data.theme === 'dark')) {
      html.dataset.theme = data.theme;
      if (data.theme === 'light' && html.dataset.skin === 'amber') {
        /* eink phosphor on light hosts — still amber-capable if skin=violet */
      }
    }
    if (data.type === 'radar-sports-ad-skin' && SKINS.has(data.skin)) {
      html.dataset.skin = data.skin;
      if (data.skin === 'eink') html.dataset.theme = 'light';
    }
  });

  function ymdToronto(date = new Date()) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function clockToronto() {
    try {
      return new Intl.DateTimeFormat('fr-CA', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date()).replace('h', ':');
    } catch {
      return '';
    }
  }

  function glyph(sport) {
    const s = String(sport || '');
    for (const [re, g] of GLYPH) if (re.test(s)) return g;
    return '🏅';
  }

  function shortOf(team, game, us) {
    if (us) {
      return String(team.code || team.name || 'ÉQ').slice(0, 8);
    }
    return String(game.opponentCode || game.opponent || 'ADV').slice(0, 8);
  }

  function collect(data) {
    const today = ymdToronto();
    const yest = ymdToronto(new Date(Date.now() - 86400000));
    const teams = Object.values(data.teams || {});
    const results = [];
    const nexts = [];
    const seen = new Set();
    const keyOf = (g, t) => g.gameId || `${t.id}:${g.date}:${g.opponentCode || g.opponent}`;

    for (const team of teams) {
      const last = team.lastGame;
      if (last && (last.date === today || last.date === yest) && last.scoreFor != null) {
        const k = keyOf(last, team);
        if (!seen.has(k)) {
          seen.add(k);
          results.push({ kind: 'result', team, game: last });
        }
      }
      const nxt = team.nextGame || (Array.isArray(team.nextGames) ? team.nextGames[0] : null);
      if (nxt && nxt.date && nxt.date >= today) {
        const k = keyOf(nxt, team);
        if (!seen.has(k)) {
          seen.add(k);
          nexts.push({ kind: 'next', team, game: nxt });
        }
      }
    }

    results.sort((a, b) => String(b.game.date).localeCompare(String(a.game.date)));
    nexts.sort((a, b) => {
      const da = `${a.game.date}T${a.game.time || '99:99'}`;
      const db = `${b.game.date}T${b.game.time || '99:99'}`;
      return da.localeCompare(db);
    });

    function diverse(list, limit) {
      const out = [];
      const seen = new Set();
      for (const s of list) {
        const sp = String(s.game.sport || s.team.sport || '');
        if (seen.has(sp)) continue;
        seen.add(sp);
        out.push(s);
        if (out.length >= limit) return out;
      }
      for (const s of list) {
        if (out.includes(s)) continue;
        out.push(s);
        if (out.length >= limit) break;
      }
      return out;
    }
    const mix = diverse(results, 6).concat(diverse(nexts, 6)).slice(0, 10);

    const out = [];
    let n = 0;
    for (const s of mix) {
      out.push(s);
      n += 1;
      if (n % BRAND_EVERY === 0) out.push({ kind: 'brand' });
    }
    if (!out.length) out.push({ kind: 'brand' });
    else if (!out.some((s) => s.kind === 'brand')) out.push({ kind: 'brand' });
    return out;
  }

  function faceHtml(slide) {
    if (!slide || slide.kind === 'brand') {
      return `<span class="face face--brand">
        <span class="face-kicker">SAT · QC</span>
        <span class="face-board">
          <span class="face-title">LE-RADAR.ca</span>
        </span>
        <span class="face-sub">journaux · radios · sports</span>
      </span>`;
    }
    const g = slide.game || {};
    const t = slide.team || {};
    const us = shortOf(t, g, true);
    const them = shortOf(t, g, false);
    const home = g.home ? us : them;
    const away = g.home ? them : us;
    const gph = glyph(g.sport || t.sport);
    const comp = String(g.competition || t.leagueLabel || t.sportLabel || '').slice(0, 42);
    if (slide.kind === 'result') {
      const left = g.home ? g.scoreFor : g.scoreAgainst;
      const right = g.home ? g.scoreAgainst : g.scoreFor;
      const tag = g.date === ymdToronto() ? 'Aujourd’hui' : 'Hier';
      const res = g.result === 'W' || g.result === 'L' ? g.result : 'D';
      return `<span class="face face--result" data-res="${res}">
        <span class="face-kicker">${gph} ${tag}</span>
        <span class="face-board">
          <span class="face-hero">${esc(home)}</span>
          <span class="face-mid face-score">${left}–${right}</span>
          <span class="face-hero">${esc(away)}</span>
        </span>
        <span class="face-sub">${esc(comp)}</span>
      </span>`;
    }
    const when = g.time ? String(g.time).replace(':', ' h ') : '';
    const day = g.date === ymdToronto() ? 'Aujourd’hui' : (g.date || '');
    return `<span class="face face--next">
      <span class="face-kicker">${gph} Prochain</span>
      <span class="face-board">
        <span class="face-hero">${esc(home)}</span>
        <span class="face-mid face-verb">${g.home ? 'reçoit' : 'à'}</span>
        <span class="face-hero">${esc(away)}</span>
      </span>
      <span class="face-sub">${esc([day, when, comp].filter(Boolean).join(' · '))}</span>
    </span>`;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hrefFor(slide) {
    if (!slide || slide.kind === 'brand') return HOME;
    const sport = String(slide.game?.sport || slide.team?.sport || '').toLowerCase();
    const id = String(slide.team?.id || '').trim();
    const q = new URLSearchParams();
    if (sport) q.set('sport', sport);
    if (id) q.set('team', id);
    const qs = q.toString();
    return qs ? `${SPORTS}?${qs}` : SPORTS;
  }

  const front = document.getElementById('sat-front');
  const back = document.getElementById('sat-back');
  const flipEl = document.getElementById('sat-flip');
  const root = document.getElementById('sat');
  const clockEl = document.getElementById('sat-clock');

  let slides = [{ kind: 'brand' }];
  let idx = 0;
  let flipping = false;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function paint(el, slide) {
    el.innerHTML = faceHtml(slide);
  }

  function show(i) {
    idx = ((i % slides.length) + slides.length) % slides.length;
    const slide = slides[idx];
    paint(front, slide);
    root.href = hrefFor(slide);
    root.title = slide.kind === 'brand'
      ? 'LE-RADAR.ca — journaux, radios et sports étudiants du Québec'
      : 'Sports étudiants — LE-RADAR.ca';
  }

  function tickClock() {
    if (clockEl) clockEl.textContent = clockToronto();
  }

  function flipTo(next) {
    if (flipping || slides.length < 2) {
      show(next);
      return;
    }
    if (reduced) {
      show(next);
      return;
    }
    flipping = true;
    const lcd = document.querySelector('.sat-lcd');
    lcd?.classList.add('is-wipe');
    window.setTimeout(() => {
      show(next);
      lcd?.classList.remove('is-wipe');
      flipping = false;
    }, FLIP_MS);
  }

  function boot() {
    tickClock();
    window.setInterval(tickClock, 15000);
    show(0);
    if (slides.length > 1) {
      window.setInterval(() => flipTo(idx + 1), DWELL_MS);
    }
  }

  async function load() {
    try {
      const res = await fetch('sports.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      let data = await res.json();
      if (typeof RadarSportsFreshness !== 'undefined'
          && typeof RadarSportsFreshness.pruneSportsPayload === 'function') {
        data = RadarSportsFreshness.pruneSportsPayload(data);
      }
      slides = collect(data);
    } catch (_) {
      slides = [{ kind: 'brand' }];
    }
    boot();
  }

  load();
})();

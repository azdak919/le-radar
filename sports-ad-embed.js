/**
 * LE-RADAR — carte sports IAB (identité du site : pourpre, Inter, Source Serif).
 */
(function () {
  'use strict';

  const FORMATS = new Set(['300x250', '336x280', '728x90', '320x50', '300x600', '160x600']);
  const TZ = 'America/Toronto';
  const BRAND_EVERY = 4;
  const ROLL_MS = 280;
  const DWELL_MS = 5200;
  const LIVE_LEAD_MS = 15 * 60 * 1000;
  const LIVE_TAIL_MS = 3 * 3600 * 1000;
  const HOME = new URL('./', location.href).href;
  const SPORTS = new URL('sports/', location.href).href;
  const SLOGAN = 'Journaux, radios et sports étudiants du Québec';
  const BRAND_LONG = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';
  const ACCENT_TONE = '#6c2163';

  const TONES = {
    football: '#c45c2a',
    basketball: '#d88a0a',
    soccer: '#3d9a6a',
    'soccer-interieur': '#15803d',
    futsal: '#166534',
    volleyball: '#3b82c4',
    hockey: '#5498bb',
    sailing: '#0e7490',
    rugby: '#7c2d12',
    badminton: '#0f766e',
    baseball: '#9a3412',
    'flag-football': '#854d0e',
    athletisme: '#b45309',
    'cross-country': '#92400e',
    natation: '#0369a1',
    golf: '#15803d',
    cheerleading: '#be185d',
    ultimate: '#7c3aed',
    default: '#66839e',
  };

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
  const fmt = FORMATS.has(params.get('fmt')) ? params.get('fmt') : '300x250';

  function applyChrome() {
    let theme = params.get('theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = html.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    html.dataset.fmt = fmt;
    html.dataset.theme = theme;
    html.style.width = fmt.split('x')[0] + 'px';
    html.style.height = fmt.split('x')[1] + 'px';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#ffffff' : '#0e0f12';
    const [w, h] = fmt.split('x').map(Number);
    try {
      parent.postMessage({ type: 'radar-sports-ad', protocol: 1, width: w, height: h, fmt, ready: true }, '*');
    } catch (_) { /* ignore */ }
  }
  applyChrome();

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.type === 'radar-sports-ad-theme' && (data.theme === 'light' || data.theme === 'dark')) {
      html.dataset.theme = data.theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = data.theme === 'light' ? '#ffffff' : '#0e0f12';
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

  function glyph(sport) {
    const s = String(sport || '');
    for (const [re, g] of GLYPH) if (re.test(s)) return g;
    return '🏅';
  }

  function sportTone(sport) {
    const s = String(sport || '').toLowerCase();
    if (s.includes('basket')) return TONES.basketball;
    if (s.includes('hockey')) return TONES.hockey;
    if (s.includes('sail') || s.includes('voile')) return TONES.sailing;
    if (s.includes('badminton')) return TONES.badminton;
    if (s.includes('baseball') || s.includes('base-ball')) return TONES.baseball;
    if (s.includes('ultimate')) return TONES.ultimate;
    if (s.includes('rugby')) return TONES.rugby;
    if (s.includes('volley')) return TONES.volleyball;
    if (s.includes('futsal')) return TONES.futsal;
    if (s.includes('interieur') || s.includes('intérieur')) return TONES['soccer-interieur'];
    if (s.includes('soccer')) return TONES.soccer;
    if (s.includes('flag')) return TONES['flag-football'];
    if (s.includes('football')) return TONES.football;
    if (s.includes('natat') || s.includes('swim')) return TONES.natation;
    if (s.includes('golf')) return TONES.golf;
    if (s.includes('cheer')) return TONES.cheerleading;
    if (s.includes('cross')) return TONES['cross-country'];
    if (s.includes('athlet')) return TONES.athletisme;
    return TONES.default;
  }

  function resultTone(result) {
    if (result === 'W') return '#3d9a6a';
    if (result === 'L') return '#c45c5c';
    if (result === 'D' || result === 'T') return '#8fa3b0';
    return TONES.default;
  }

  function slideTone(slide) {
    if (!slide || slide.kind === 'brand') return ACCENT_TONE;
    if (slide.kind === 'live') return '#c8102e';
    if (slide.kind === 'result' && slide.game?.result) return resultTone(slide.game.result);
    return sportTone(slide.game?.sport || slide.team?.sport);
  }

  function badgeSpec(result) {
    if (result === 'W') return { letter: 'V', mod: 'w' };
    if (result === 'L') return { letter: 'D', mod: 'l' };
    if (result === 'D' || result === 'T') return { letter: 'N', mod: 'd' };
    return { letter: 'N', mod: 'd' };
  }

  function labelOf(team, game, us) {
    const compact = fmt === '320x50';
    if (us) {
      const n = String(team.name || team.code || 'Équipe');
      return compact ? String(team.code || n).slice(0, 10) : n;
    }
    const opp = String(game.opponent || game.opponentCode || 'Adversaire');
    return compact ? String(game.opponentCode || opp).slice(0, 10) : opp;
  }

  function gameMs(game) {
    if (!game?.date) return NaN;
    const raw = String(game.time || '12:00').trim();
    const m = raw.match(/(\d{1,2}):(\d{2})/);
    const hh = m ? String(m[1]).padStart(2, '0') : '12';
    const mm = m ? m[2] : '00';
    const t = Date.parse(`${game.date}T${hh}:${mm}:00`);
    return Number.isFinite(t) ? t : NaN;
  }

  function isLiveVisual(game) {
    const t = gameMs(game);
    if (!Number.isFinite(t)) return false;
    const now = Date.now();
    return t <= now + LIVE_LEAD_MS && t >= now - LIVE_TAIL_MS;
  }

  function collect(data) {
    const today = ymdToronto();
    const yest = ymdToronto(new Date(Date.now() - 86400000));
    const teams = Object.values(data.teams || {});
    const results = [];
    const nexts = [];
    const lives = [];
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
        if (seen.has(k)) continue;
        seen.add(k);
        if (isLiveVisual(nxt) && last?.date !== today) {
          lives.push({ kind: 'live', team, game: nxt });
        } else {
          nexts.push({ kind: 'next', team, game: nxt });
        }
      }
    }
    results.sort((a, b) => String(b.game.date).localeCompare(String(a.game.date)));
    nexts.sort((a, b) => `${a.game.date}T${a.game.time || '99'}`.localeCompare(`${b.game.date}T${b.game.time || '99'}`));

    function diverse(list, limit) {
      const out = [];
      const had = new Set();
      for (const s of list) {
        const sp = String(s.game.sport || s.team.sport || '');
        if (had.has(sp)) continue;
        had.add(sp);
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
    const raw = diverse(lives, 4).concat(diverse(results, 5), diverse(nexts, 6));
    const mix = [];
    const mixSeen = new Set();
    for (const s of raw) {
      const k = keyOf(s.game, s.team);
      if (mixSeen.has(k)) continue;
      mixSeen.add(k);
      mix.push(s);
      if (mix.length >= 10) break;
    }
    const out = [];
    let n = 0;
    for (const s of mix) {
      out.push(s);
      n += 1;
      if (n % BRAND_EVERY === 0) out.push({ kind: 'brand' });
    }
    if (!out.length) out.push({ kind: 'brand' });
    return out;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function meta(slide) {
    if (!slide || slide.kind === 'brand') {
      return { tag: 'Sports', lamp: 'next', state: 'idle', res: '', foot: '' };
    }
    const g = slide.game || {};
    const today = ymdToronto();
    if (slide.kind === 'live') {
      return { tag: 'En cours', lamp: 'live', state: 'live', res: '', foot: '' };
    }
    if (slide.kind === 'result') {
      const tag = g.date === today ? 'Aujourd’hui' : 'Hier';
      return {
        tag,
        lamp: g.date === today ? 'today' : 'past',
        state: 'result',
        res: g.result === 'W' || g.result === 'L' ? g.result : 'D',
        foot: '',
      };
    }
    return { tag: 'Prochain', lamp: 'next', state: 'next', res: '', foot: '' };
  }

  function faceHtml(slide) {
    if (!slide || slide.kind === 'brand') {
      return `<span class="ad-brand-lockup notranslate" translate="no">
          <img class="ad-logo" src="assets/icon.svg" width="28" height="28" alt="" decoding="async">
          <span class="ad-word">LE-RADAR.ca</span>
        </span>
        <span class="ad-brand-long">${esc(BRAND_LONG)}</span>
        <span class="ad-sub">${esc(SLOGAN)}</span>`;
    }
    const g = slide.game || {};
    const t = slide.team || {};
    const home = labelOf(t, g, g.home);
    const away = labelOf(t, g, !g.home);
    const gph = glyph(g.sport || t.sport);
    const comp = String(g.competition || t.leagueLabel || t.sportLabel || '');
    if (slide.kind === 'result') {
      const left = g.home ? g.scoreFor : g.scoreAgainst;
      const right = g.home ? g.scoreAgainst : g.scoreFor;
      const b = badgeSpec(g.result);
      return `<span class="ad-kicker">${gph}</span>
        <span class="ad-board">
          <span class="ad-hero">${esc(home)}</span>
          <span class="ad-score">${left}–${right}<span class="ad-badge ad-badge--${b.mod}">${b.letter}</span></span>
          <span class="ad-hero">${esc(away)}</span>
        </span>
        <span class="ad-sub">${esc(comp)}</span>`;
    }
    const when = g.time ? String(g.time).replace(':', ' h ') : '';
    const day = (() => {
      const iso = g.date || '';
      const today = ymdToronto();
      if (iso === today) return 'Aujourd’hui';
      if (iso === ymdToronto(new Date(Date.now() - 86400000))) return 'Hier';
      try {
        return new Intl.DateTimeFormat('fr-CA', {
          weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ,
        }).format(new Date(`${iso}T12:00:00`));
      } catch {
        return iso;
      }
    })();
    const verb = slide.kind === 'live' ? 'contre' : (g.home ? 'reçoit' : 'à');
    return `<span class="ad-kicker">${gph}</span>
      <span class="ad-board">
        <span class="ad-hero">${esc(home)}</span>
        <span class="ad-verb">${verb}</span>
        <span class="ad-hero">${esc(away)}</span>
      </span>
      <span class="ad-sub">${esc([day, when, comp].filter(Boolean).join(' · '))}</span>`;
  }

  function gameIdOf(game) {
    if (!game) return '';
    const id = String(game.gameId || '').trim();
    if (id) return id;
    const m = String(game.url || '').match(/GameId=([0-9a-f-]{8,})/i);
    return m ? m[1] : '';
  }

  function hrefFor(slide) {
    if (!slide || slide.kind === 'brand') return HOME;
    const sport = String(slide.game?.sport || slide.team?.sport || '').toLowerCase();
    const id = String(slide.team?.id || '').trim();
    const gid = gameIdOf(slide.game);
    const url = new URL(SPORTS, location.href);
    if (sport) url.searchParams.set('sport', sport);
    if (id) url.searchParams.set('team', id);
    if (gid) url.searchParams.set('game', gid);
    if (sport) url.hash = `sport-${sport}`;
    return url.href;
  }

  const stage = document.getElementById('ad-stage');
  const tagEl = document.getElementById('ad-tag');
  const footEl = document.getElementById('ad-foot');
  const root = document.getElementById('ad');
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let slides = [];
  let idx = 0;
  let swapping = false;
  let paused = false;

  function paintChrome(slide) {
    const m = meta(slide);
    if (tagEl) {
      tagEl.dataset.lamp = m.lamp;
      tagEl.textContent = m.tag;
    }
    if (footEl) {
      footEl.textContent = m.foot;
      footEl.hidden = !m.foot;
    }
    root.dataset.state = m.state;
    if (m.res) root.dataset.res = m.res;
    else root.removeAttribute('data-res');
    root.style.setProperty('--sports-tone', slideTone(slide));
    root.href = hrefFor(slide);
    root.title = slide.kind === 'brand'
      ? 'LE-RADAR.ca — journaux, radios et sports étudiants du Québec'
      : 'Sports étudiants — LE-RADAR.ca';
  }

  function paintFace(el, slide) {
    el.innerHTML = faceHtml(slide);
  }

  function frontEl() {
    return document.getElementById('ad-front') || stage.querySelector('.ad-face.is-front');
  }

  function show(i) {
    idx = ((i % slides.length) + slides.length) % slides.length;
    const slide = slides[idx];
    let front = frontEl();
    if (!front) {
      front = document.createElement('span');
      front.id = 'ad-front';
      front.className = 'ad-face is-front';
      stage.append(front);
    }
    paintFace(front, slide);
    paintChrome(slide);
  }

  function flipTo(next) {
    if (swapping || slides.length < 2 || reduced) {
      show(next);
      return;
    }
    swapping = true;
    const nextIdx = ((next % slides.length) + slides.length) % slides.length;
    const front = frontEl();
    const back = document.createElement('span');
    back.className = 'ad-face is-rolling-in';
    back.id = 'ad-front';
    if (front) front.removeAttribute('id');
    paintFace(back, slides[nextIdx]);
    paintChrome(slides[nextIdx]);
    stage.append(back);
    void back.offsetWidth;
    if (front) {
      front.classList.add('is-rolling-out');
      front.classList.remove('is-front');
    }
    back.classList.add('is-front');
    idx = nextIdx;
    window.setTimeout(() => {
      if (front && front.isConnected) front.remove();
      back.classList.remove('is-rolling-in');
      swapping = false;
    }, ROLL_MS);
  }

  function boot() {
    if (!slides.length) return;
    show(0);
    if (slides.length > 1) {
      window.setInterval(() => {
        if (!paused && !swapping) flipTo(idx + 1);
      }, DWELL_MS);
    }
  }

  root.addEventListener('pointerenter', () => { paused = true; }, { passive: true });
  root.addEventListener('pointerleave', () => { paused = false; }, { passive: true });
  root.addEventListener('focusin', () => { paused = true; });
  root.addEventListener('focusout', () => { paused = false; });

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
      if (params.get('face') === 'brand') slides = [{ kind: 'brand' }];
    } catch (_) {
      slides = [{ kind: 'brand' }];
    }
    boot();
  }

  load();
})();

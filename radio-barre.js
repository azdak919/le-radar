/* LE-RADAR — barre radio à intégrer en une ligne.
 *
 *   <script src="https://le-radar.ca/radio-barre.js" data-station="chyz" async></script>
 *
 * La barre se pose à la place du script. Les stations, le code et le style
 * viennent de LE-RADAR : un changement ici arrive chez tous les sites qui
 * l'appellent, sans mise à jour de leur côté.
 *
 * Elle reprend la barre de le-radar.ca, mêmes informations, mêmes contrôles :
 *  - le logo à gauche mène seulement à https://le-radar.ca/ (sans chemin) ;
 *  - ordinateur : logo, « En ondes », poste précédent / suivant, cadran
 *    (établissement, poste et slogan, liste des postes), lecture / arrêt,
 *    diffusion sur un appareil (grisée si le navigateur ne le permet pas), égaliseur,
 *    couper le son, volume 0 à 200 %, « À l'antenne » et « À venir » ;
 *  - mobile : logo, précédent / suivant, cadran (poste · sigle, puis
 *    « À l'antenne · émission »), lecture / arrêt, bouton volume qui ouvre
 *    couper le son, le volume 0 à 200 % et la diffusion.
 *
 * - `data-station` : la station de départ. Le cadran garde tous les postes.
 * - Si radios.json ne répond pas, ou si la station n'a pas de flux https,
 *   rien n'est affiché. Le parent du script reçoit `data-radar-radio="off"`,
 *   ou `"ready"` quand la barre est là, pour qu'il puisse se replier.
 * - Le style vit dans un Shadow DOM : il ne fuit pas dans la page, et la
 *   page ne le casse pas.
 */
(function () {
  'use strict';

  const script = document.currentScript;
  if (!script || script.dataset.radarRadioDone) return;
  script.dataset.radarRadioDone = '1';

  const base = new URL('.', script.src || location.href);
  const fixed = (script.dataset.station || '').trim().toLowerCase();
  const slot = script.parentElement;
  const KEY_STATION = 'radar-radio-station';
  const KEY_VOLUME = 'radar-radio-volume';
  const KEY_MUTED = 'radar-radio-muted';
  const REFRESH_MS = 120000;
  const MAX_GAIN = 2; // 200 %, comme le-radar.ca
  // Comme radar-state.js : CHYZ (Centova) se lit en natif seulement.
  const NO_BOOST = new Set(['chyz']);
  // Sigles, comme le syntoniseur de le-radar.ca (radar-news.js).
  const ACRONYMS = {
    'Université Laval': 'ULaval', 'Université de Montréal': 'UdeM', 'McGill University': 'McGill',
    'Université McGill': 'McGill', 'Concordia University': 'Concordia', 'Université Concordia': 'Concordia',
    'Université de Sherbrooke': 'UdeS', 'Université du Québec à Montréal': 'UQAM',
  };

  const read = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* stockage bloqué */ } };
  const mark = (state) => { if (slot) slot.dataset.radarRadio = state; };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" fill="currentColor"/></svg>',
    cast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>',
  };

  function playable(station) {
    return station && typeof station.stream === 'string' && station.stream.startsWith('https://');
  }
  const acronym = (station) => ACRONYMS[station.institution] || station.institution || '';
  /** « CISM 89,3 FM » : la bande vient de la fréquence si le nom ne l'a pas. */
  function onAirName(station) {
    const name = String(station.name || '');
    if (/\b(FM|AM)\b/i.test(name)) return name;
    const band = /\b(FM|AM)\b/i.exec(String(station.frequency || ''))?.[1];
    return band ? `${name} ${band.toUpperCase()}` : (station.fullName || name);
  }

  async function json(path) {
    const response = await fetch(new URL(path, base), { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    return response.json();
  }

  async function start() {
    let stations;
    try {
      const list = await json('radios.json');
      stations = (Array.isArray(list) ? list : []).filter(playable);
    } catch (error) {
      mark('off');
      console.info('LE-RADAR : barre radio indisponible', error?.message || error);
      return;
    }
    if (!stations.length || (fixed && !stations.some((item) => item.id === fixed))) { mark('off'); return; }

    const host = document.createElement('div');
    host.className = 'radar-radio';
    host.hidden = true;
    script.after(host);
    const root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('radio-barre.css', base).href;
    const loaded = new Promise((resolve) => { css.onload = () => resolve(true); css.onerror = () => resolve(false); });
    root.append(css);

    let station = (fixed && stations.find((item) => item.id === fixed))
      || stations.find((item) => item.id === read(KEY_STATION)) || stations[0];
    const castable = 'remote' in HTMLMediaElement.prototype;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Radio étudiante — LE-RADAR');
    bar.dataset.state = 'idle';
    const castButton = (where) => `<button type="button" class="cast cast--${where}" aria-label="Diffuser sur un appareil" title="Diffuser sur un appareil">${ICON.cast}</button>`;
    bar.innerHTML = `
      <a class="brand" href="https://le-radar.ca/" target="_blank" rel="noopener" title="LE-RADAR"><img src="${new URL('assets/icon.svg', base).href}" alt="LE-RADAR" width="28" height="28"></a>
      <span class="onair">En ondes</span>
      <button type="button" class="step" data-step="-1" title="Poste précédent" aria-label="Poste précédent">${ICON.prev}</button>
      <label class="dial"><span class="sr">Choisir un poste</span><select>${stations.map((item) => `<option value="${esc(item.id)}">${esc(onAirName(item))} · ${esc(acronym(item))}</option>`).join('')}</select><span class="now" aria-hidden="true"><span class="line1"></span><span class="line2"></span></span></label>
      <button type="button" class="step" data-step="1" title="Poste suivant" aria-label="Poste suivant">${ICON.next}</button>
      <button type="button" class="play" aria-pressed="false"></button>
      ${castButton('bar')}
      <span class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
      <div class="vol">
        <button type="button" class="vol-toggle" aria-expanded="false" aria-label="Réglages du volume" title="Réglages du volume">${ICON.vol}</button>
        <div class="vol-slot">
          <button type="button" class="mute" aria-pressed="false" aria-label="Couper le son" title="Couper le son">${ICON.vol}</button>
          <span class="track"><input type="range" min="0" max="${MAX_GAIN}" step="0.02" aria-label="Volume — 0 % à gauche, 100 % au centre, 200 % à droite"><span class="labels" aria-hidden="true"><span>0 %</span><span>100 %</span><span>200 %</span></span></span>
          ${castButton('pop')}
        </div>
      </div>
      <div class="airs">
        <a class="air air--now is-empty" target="_blank" rel="noopener" aria-hidden="true"><span class="air-label">À l’antenne</span><span class="air-body"><span class="air-title"></span><span class="air-time"></span></span></a>
        <a class="air air--next is-empty" target="_blank" rel="noopener" aria-hidden="true"><span class="air-label">À venir</span><span class="air-body"><span class="air-title"></span><span class="air-time"></span></span></a>
      </div>`;
    root.append(bar);

    const $ = (selector) => bar.querySelector(selector);
    const play = $('.play');
    const select = $('select');
    const line1 = $('.line1');
    const line2 = $('.line2');
    const volume = $('.vol input');
    const mute = $('.mute');
    const toggle = $('.vol-toggle');
    const nowAir = $('.air--now');
    const nextAir = $('.air--next');
    let info = null;
    // Même palier que la feuille : la largeur de la barre, pas de l'écran.
    const narrow = () => host.getBoundingClientRect().width < 680;

    // ── Audio : natif jusqu'à 100 %, gain Web Audio au-delà (si le flux le permet).
    let audio = new Audio();
    audio.preload = 'none';
    let graph = null;
    const boostBroken = new Set();
    const boostable = () => !NO_BOOST.has(station.id) && !boostBroken.has(station.id) && 'AudioContext' in window;
    const storedVolume = Number.parseFloat(read(KEY_VOLUME) ?? '');
    let level = Number.isFinite(storedVolume) ? Math.min(MAX_GAIN, Math.max(0, storedVolume)) : 1;
    let muted = read(KEY_MUTED) === '1';

    function applyVolume() {
      const effective = muted ? 0 : level;
      if (graph) { audio.volume = 1; graph.gain.gain.value = effective; } else audio.volume = Math.min(1, effective);
      volume.value = String(level);
      const pct = Math.round(level * 100);
      volume.style.setProperty('--fill', `${(level / MAX_GAIN) * 100}%`);
      volume.setAttribute('aria-valuetext', `${pct} %`);
      for (const node of [mute, toggle]) node.innerHTML = muted || level === 0 ? ICON.muted : ICON.vol;
      mute.setAttribute('aria-pressed', String(muted));
      mute.setAttribute('aria-label', muted ? 'Remettre le son' : 'Couper le son');
      bar.classList.toggle('is-boost', level > 1);
    }
    function ensureGraph() {
      if (graph || level <= 1 || !boostable()) return;
      try {
        const context = new AudioContext();
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        source.connect(gain).connect(context.destination);
        graph = { context, gain };
      } catch (_) { boostBroken.add(station.id); }
    }

    function setState(state) {
      bar.dataset.state = state;
      const on = state === 'playing' || state === 'loading';
      play.innerHTML = on ? ICON.stop : ICON.play;
      play.setAttribute('aria-pressed', String(on));
      play.setAttribute('aria-label', `${on ? 'Arrêter' : 'Écouter'} ${station.name}`);
      describe();
    }

    const slotTime = (item) => (item?.start && item?.end ? `${item.start} – ${item.end}` : (item?.start || ''));
    // Mêmes constantes que le syntoniseur de le-radar.ca (radar-state.js).
    const MARQUEE_READ_DELAY_MS = 1600;
    const MARQUEE_ROUND_TRIPS = 2;
    const REDUCE_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    function measureMarquee(el) {
      if (!el || REDUCE_MOTION?.matches) return;
      const span = el.querySelector('.tuner-now-sub-text');
      if (!span) return;
      const style = getComputedStyle(el);
      const available = Math.max(0, el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
      if (!available) return;
      const overflow = span.scrollWidth - available;
      if (overflow <= 2) {
        el.classList.remove('is-marquee');
        el.style.removeProperty('--marquee-shift');
        el.style.removeProperty('--marquee-duration');
        el.style.removeProperty('--marquee-delay');
        el.style.removeProperty('--marquee-trips');
        return;
      }
      const distance = Math.round(overflow + 12);
      const duration = Math.max(7, distance / 16);
      el.style.setProperty('--marquee-shift', `-${distance}px`);
      el.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
      el.style.setProperty('--marquee-delay', `${(MARQUEE_READ_DELAY_MS / 1000).toFixed(1)}s`);
      el.style.setProperty('--marquee-trips', String(MARQUEE_ROUND_TRIPS));
      el.classList.add('is-marquee');
    }
    function applyMarquee(el, text) {
      if (!el) return;
      const value = String(text ?? '').trim();
      el.classList.remove('is-marquee');
      el.style.removeProperty('--marquee-shift');
      el.style.removeProperty('--marquee-duration');
      el.style.removeProperty('--marquee-delay');
      el.style.removeProperty('--marquee-trips');
      if (!value) { el.replaceChildren(); return; }
      if (REDUCE_MOTION?.matches) { el.textContent = value; return; }
      const span = document.createElement('span');
      span.className = 'tuner-now-sub-text';
      span.textContent = value;
      el.replaceChildren(span);
      requestAnimationFrame(() => requestAnimationFrame(() => measureMarquee(el)));
    }
    function refreshMarquees() {
      for (const el of [line1, line2, nowAir.querySelector('.air-title'), nextAir.querySelector('.air-title')]) {
        if (el?.querySelector('.tuner-now-sub-text')) measureMarquee(el);
      }
    }

    // Place des panneaux toujours réservée (comme le syntoniseur) : on n'utilise
    // pas [hidden], qui ferait sauter toute la barre au changement de poste.
    function fill(node, item) {
      const title = item?.title || '';
      const empty = !title;
      node.classList.toggle('is-empty', empty);
      node.setAttribute('aria-hidden', String(empty));
      if (empty) {
        applyMarquee(node.querySelector('.air-title'), '');
        node.querySelector('.air-time').textContent = '';
        node.removeAttribute('href');
        return;
      }
      applyMarquee(node.querySelector('.air-title'), title);
      node.querySelector('.air-time').textContent = slotTime(item);
      if (/^https:\/\//.test(item.url || '')) node.href = item.url; else node.removeAttribute('href');
    }
    function syncLines() {
      const isNarrow = narrow();
      for (const node of [line1, line2]) applyMarquee(node, isNarrow ? node.dataset.narrow : node.dataset.wide);
    }
    function describe() {
      select.value = station.id;
      const current = info?.current?.title || info?.track || info?.showTitle || '';
      // Ordinateur : établissement, puis « poste FM · slogan ». Mobile : « poste FM · sigle »,
      // puis l'émission en ondes (la feuille choisit, comme le-radar.ca).
      line1.dataset.wide = station.institution || station.name;
      line1.dataset.narrow = `${onAirName(station)} · ${acronym(station)}`;
      line2.dataset.wide = [onAirName(station), station.slogan].filter(Boolean).join(' · ');
      line2.dataset.narrow = bar.dataset.state === 'error'
        ? 'Flux muet pour le moment. Réessayez plus tard.'
        : current ? `À l’antenne · ${current}` : info?.next?.title ? `À venir · ${info.next.title}` : (station.slogan || station.frequency || '');
      syncLines();
      fill(nowAir, info?.current?.title ? info.current : (info?.track ? { title: info.track } : null));
      fill(nextAir, info?.next);
    }
    let wasNarrow = narrow();
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        const isNarrow = narrow();
        if (isNarrow !== wasNarrow) { wasNarrow = isNarrow; syncLines(); }
        else refreshMarquees();
      }).observe(host);
    }

    let nowTimer = 0;
    async function nowPlaying() {
      window.clearTimeout(nowTimer);
      try {
        const data = await json('radio-nowplaying.json');
        info = data?.stations?.[station.id] || null;
        describe();
      } catch (_) { /* l'émission en cours est un bonus */ }
      nowTimer = window.setTimeout(nowPlaying, REFRESH_MS);
    }

    function stop() {
      audio.pause();
      // Un direct « en pause » continue de télécharger : on coupe vraiment.
      audio.removeAttribute('src');
      audio.load();
      setState('idle');
    }
    function fresh() {
      // createMediaElementSource est à usage unique : nouvel élément au changement de poste.
      if (graph) { graph.context.close().catch(() => {}); graph = null; }
      const next = new Audio();
      next.preload = 'none';
      next.addEventListener('error', () => { if (next.getAttribute('src')) setState('error'); });
      next.addEventListener('playing', () => setState('playing'));
      next.addEventListener('waiting', () => { if (bar.dataset.state === 'playing') setState('loading'); });
      audio = next;
    }
    async function listen() {
      fresh();
      if (level > 1 && boostable()) audio.crossOrigin = 'anonymous';
      setState('loading');
      audio.src = station.stream;
      ensureGraph();
      applyVolume();
      try {
        await audio.play();
        setState('playing');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: station.institution || 'Radio étudiante', album: 'LE-RADAR' });
        }
      } catch (_) {
        if (audio.crossOrigin) { boostBroken.add(station.id); level = Math.min(level, 1); return listen(); }
        setState('error');
      }
    }
    play.addEventListener('click', () => (bar.dataset.state === 'playing' || bar.dataset.state === 'loading' ? stop() : listen()));

    function tune(id) {
      const next = stations.find((item) => item.id === id);
      if (!next || next.id === station.id) return;
      const wasOn = bar.dataset.state === 'playing' || bar.dataset.state === 'loading';
      if (wasOn) stop();
      station = next;
      info = null;
      write(KEY_STATION, station.id);
      setState('idle');
      nowPlaying();
      if (wasOn) listen();
    }
    select.addEventListener('change', () => tune(select.value));
    for (const step of bar.querySelectorAll('[data-step]')) {
      step.addEventListener('click', () => {
        const at = stations.findIndex((item) => item.id === station.id);
        tune(stations[(at + Number(step.dataset.step) + stations.length) % stations.length].id);
      });
    }

    volume.addEventListener('input', () => {
      level = Number(volume.value);
      if (level > 1 && !boostable()) level = 1;
      muted = false;
      write(KEY_VOLUME, String(level));
      write(KEY_MUTED, '0');
      // Passer au-delà de 100 % en écoute : on relance le flux avec le gain.
      if (level > 1 && !graph && boostable() && bar.dataset.state === 'playing') listen();
      applyVolume();
    });
    mute.addEventListener('click', () => { muted = !muted; write(KEY_MUTED, muted ? '1' : '0'); applyVolume(); });
    // Mobile : le bouton volume ouvre le réglage ; ordinateur : il coupe le son.
    toggle.addEventListener('click', () => {
      if (!narrow()) { mute.click(); return; }
      const open = bar.classList.toggle('vol-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && bar.classList.contains('vol-open')) { bar.classList.remove('vol-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
    document.addEventListener('click', (event) => { if (!event.composedPath().includes(host)) { bar.classList.remove('vol-open'); toggle.setAttribute('aria-expanded', 'false'); } });

    // Diffusion, comme le-radar.ca : bouton toujours là. Chrome / Edge : Remote
    // Playback (Chromecast) ; Safari : AirPlay. Sans API (Firefox) : grisé.
    function wireCast() { /* l'état se lit au clic : rien à suivre */ }
    const castApi = () => (typeof audio.webkitShowPlaybackTargetPicker === 'function' ? 'airplay' : castable ? 'remote' : '');
    for (const node of bar.querySelectorAll('.cast')) {
      if (!castApi()) { node.disabled = true; node.title = 'Diffusion non prise en charge par ce navigateur'; }
      node.addEventListener('click', async () => {
        if (bar.dataset.state === 'idle' || bar.dataset.state === 'error') await listen();
        if (castApi() === 'airplay') { try { audio.webkitShowPlaybackTargetPicker(); } catch (_) { /* annulé */ } }
        else if (castApi() === 'remote') audio.remote.prompt().catch(() => {});
      });
    }

    fresh();
    applyVolume();
    setState('idle');
    nowPlaying();
    // La barre ne s'affiche qu'avec son style : jamais de boutons nus.
    if (!(await loaded)) { host.remove(); mark('off'); return; }
    host.hidden = false;
    mark('ready');
    wasNarrow = narrow();
    requestAnimationFrame(() => requestAnimationFrame(() => { syncLines(); refreshMarquees(); }));
  }

  start();
})();

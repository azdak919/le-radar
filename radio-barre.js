/* LE-RADAR — barre radio à intégrer en une ligne.
 *
 *   <script src="https://le-radar.ca/radio-barre.js" data-station="chyz" async></script>
 *
 * La barre se pose à la place du script. Les stations, le code et le style
 * viennent de LE-RADAR : un changement ici arrive chez tous les sites qui
 * l'appellent, sans mise à jour de leur côté.
 *
 * - `data-station` : une station fixe (id de radios.json). Sans cet
 *   attribut, la barre propose toutes les stations (Pomodoro, Solitaire).
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
  const REFRESH_MS = 120000;

  const read = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* stockage bloqué */ } };
  const mark = (state) => { if (slot) slot.dataset.radarRadio = state; };

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function playable(station) {
    return station && typeof station.stream === 'string' && station.stream.startsWith('https://');
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
    if (fixed) stations = stations.filter((item) => item.id === fixed);
    if (!stations.length) { mark('off'); return; }

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

    const remembered = read(KEY_STATION);
    let station = stations.find((item) => item.id === remembered) || stations[0];
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Radio étudiante — LE-RADAR');
    bar.dataset.state = 'idle';
    bar.innerHTML = `
      <a class="brand" href="${new URL('radios/', base).href}" target="_blank" rel="noopener" title="LE-RADAR — radios étudiantes du Québec"><img src="${new URL('assets/icon.svg', base).href}" alt="LE-RADAR" width="24" height="24"></a>
      <button type="button" class="play" aria-pressed="false"></button>
      <div class="meta"><span class="name"></span><span class="show" aria-live="polite"></span></div>
      <span class="live" aria-hidden="true">En direct</span>
      ${fixed || stations.length < 2 ? '' : `<label class="pick"><span class="sr">Station</span><select>${stations.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label>`}
      <label class="volume"><span class="sr">Volume</span><input type="range" min="0" max="1" step="0.05"></label>`;
    root.append(bar);
    const audio = new Audio();
    audio.preload = 'none';
    const button = bar.querySelector('.play');
    const name = bar.querySelector('.name');
    const show = bar.querySelector('.show');
    const select = bar.querySelector('select');
    const volume = bar.querySelector('.volume input');

    const stored = Number.parseFloat(read(KEY_VOLUME) ?? '');
    audio.volume = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.8;
    volume.value = String(audio.volume);
    volume.addEventListener('input', () => { audio.volume = Number(volume.value); write(KEY_VOLUME, volume.value); });

    function setState(state) {
      bar.dataset.state = state;
      const playing = state === 'playing' || state === 'loading';
      button.innerHTML = playing ? ICON_STOP : ICON_PLAY;
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', `${playing ? 'Arrêter' : 'Écouter'} ${station.name}`);
      if (state === 'error') show.textContent = 'Flux muet pour le moment. Réessayez plus tard.';
    }

    function describe() {
      name.textContent = station.name;
      name.title = [station.institution, station.city].filter(Boolean).join(' · ');
      if (select) select.value = station.id;
      show.textContent = station.institution || '';
      setState(bar.dataset.state === 'playing' ? 'playing' : 'idle');
      nowPlaying();
    }

    let nowTimer = 0;
    async function nowPlaying() {
      window.clearTimeout(nowTimer);
      try {
        const data = await json('radio-nowplaying.json');
        const info = data?.stations?.[station.id];
        const current = info?.track || info?.current?.title || info?.showTitle;
        const next = info?.next;
        if (bar.dataset.state !== 'error') {
          if (current) show.textContent = `En ondes : ${current}`;
          else if (next?.title) show.textContent = `À ${next.start || 'venir'} : ${next.title}`;
          else show.textContent = station.institution || '';
        }
      } catch (_) { /* l'émission en cours est un bonus */ }
      nowTimer = window.setTimeout(nowPlaying, REFRESH_MS);
    }

    function stop() {
      audio.pause();
      // Un direct « en pause » continue de télécharger : on coupe vraiment.
      audio.removeAttribute('src');
      audio.load();
      setState('idle');
      describe();
    }

    async function play() {
      setState('loading');
      audio.src = station.stream;
      try {
        await audio.play();
        setState('playing');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: station.institution || 'Radio étudiante', album: 'LE-RADAR' });
        }
      } catch (_) {
        setState('error');
      }
    }

    button.addEventListener('click', () => (audio.src && bar.dataset.state !== 'error' && bar.dataset.state !== 'idle' ? stop() : play()));
    audio.addEventListener('error', () => { if (audio.getAttribute('src')) setState('error'); });
    audio.addEventListener('playing', () => setState('playing'));
    select?.addEventListener('change', () => {
      const next = stations.find((item) => item.id === select.value);
      if (!next) return;
      const wasPlaying = bar.dataset.state === 'playing' || bar.dataset.state === 'loading';
      if (wasPlaying) stop();
      station = next;
      write(KEY_STATION, station.id);
      describe();
      if (wasPlaying) play();
    });

    describe();
    // La barre ne s'affiche qu'avec son style : jamais de boutons nus.
    if (!(await loaded)) { host.remove(); mark('off'); return; }
    host.hidden = false;
    mark('ready');
  }

  start();
})();

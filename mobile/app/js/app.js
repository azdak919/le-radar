/**
 * Interface téléphone de LE-RADAR.
 * L’accueil reprend le mât mobile du site (photo, syntoniseur, météo,
 * sports). Le fil, les onglets et la barre radio restent ceux de l’app.
 *
 * Radio : barre #player dans la coquille, hors de #screen (jamais
 * re-rendue). Sur le web / iOS : un seul <audio>. Sur Android natif :
 * Media3 ExoPlayer via le plugin RadioPlayback (service de premier plan,
 * notification et session média) ; la barre JS reste la source de vérité
 * UI et se synchronise sur les événements natifs.
 */
'use strict';

(function initApp() {
  const core = () => window.RadarMobile;
  const state = {
    items: [],
    sources: [],
    radios: [],
    brand: {},
    updated: '',
    feedOrigin: 'empty',
    online: true,
    visible: 40,
    query: '',
    sourceQuery: '',
    confirm: '',
    recorded: '',
    routeKey: '',
    tunedId: '',
    homeCountLabel: '',
  };

  // status : idle (barre cachée) · loading · playing · paused · error
  const player = {
    id: '',
    status: 'idle',
    now: '',
    nowPayload: null,
    nowFetchedAt: 0,
    nowPending: null,
    sessionKey: '',
    nativeBound: false,
    nativeSync: false,
  };

  // Défilement des postes au repos (voir tunerTickerActive).
  const TUNER_TICKER_DWELL_MS = 8000; // NOW_AIR_PREVIEW_DWELL_MS du site
  const TUNER_TICKER_FADE_MS = 700; // NOW_AIR_CROSSFADE_MS du site
  const REDUCED_MOTION = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const tickerState = { radio: null, lastId: '', timer: 0 };
  const NOW_PLAYING_TTL_MS = 90 * 1000;

  function esc(value) {
    return core().escapeHtml(value == null ? '' : value);
  }

  function storage() {
    try {
      const probe = '__radar_mobile_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch {
      if (!storage.memory) storage.memory = new Map();
      return {
        getItem(key) { return storage.memory.has(key) ? storage.memory.get(key) : null; },
        setItem(key, value) { storage.memory.set(key, String(value)); },
        removeItem(key) { storage.memory.delete(key); },
      };
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = storage().getItem(key);
      if (!raw) return fallback();
      return JSON.parse(raw);
    } catch {
      return fallback();
    }
  }

  function writeJson(key, value) {
    try { storage().setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }

  function loadLibrary() {
    return core().normalizeLibrary(readJson(core().LIBRARY_KEY, core().emptyLibrary));
  }

  function saveLibrary(library) {
    writeJson(core().LIBRARY_KEY, core().normalizeLibrary(library));
  }

  function loadPrefs() {
    return core().normalizePrefs(readJson(core().PREFS_KEY, core().emptyPrefs));
  }

  function savePrefs(prefs) {
    writeJson(core().PREFS_KEY, core().normalizePrefs(prefs));
  }

  function loadSnapshot() {
    const snap = readJson(core().SNAPSHOT_KEY, () => null);
    if (!snap || !Array.isArray(snap.items)) return null;
    return snap;
  }

  function saveSnapshot(snapshot) {
    writeJson(core().SNAPSHOT_KEY, snapshot);
  }

  function followIds() {
    const store = window.MediaFollowStore;
    return store && typeof store.list === 'function' ? store.list() : [];
  }

  function isNative() {
    try {
      return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch {
      return false;
    }
  }

  function plugin(name) {
    const cap = window.Capacitor;
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
    if (typeof cap.registerPlugin === 'function') {
      try { return cap.registerPlugin(name); } catch { return null; }
    }
    return null;
  }

  function nativePlatform() {
    try {
      const cap = window.Capacitor;
      return cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    } catch {
      return '';
    }
  }

  /** Android : lecture native Media3. iOS / web : <audio> dans la barre. */
  function useNativeRadio() {
    return isNative() && nativePlatform() === 'android' && Boolean(plugin('RadioPlayback'));
  }

  function radioNative() {
    return useNativeRadio() ? plugin('RadioPlayback') : null;
  }

  function haptic() {
    const haptics = plugin('Haptics');
    try {
      if (haptics && haptics.impact) haptics.impact({ style: 'LIGHT' });
    } catch { /* appareil sans retour haptique */ }
  }

  function uiText(fr) {
    const raw = String(fr ?? '');
    try {
      const api = window.RadarTranslate;
      if (api && typeof api.displayUiText === 'function') return api.displayUiText(raw);
    } catch { /* module pas prêt */ }
    return raw;
  }

  function announce(message) {
    const node = document.getElementById('status');
    if (node) node.textContent = uiText(message || '');
  }

  async function openExternal(url) {
    const safe = core().safeHttpUrl(url);
    if (!safe) return;
    const browser = plugin('Browser');
    try {
      if (isNative() && browser && browser.open) {
        await browser.open({ url: safe, presentationStyle: 'popover' });
        return;
      }
    } catch { /* repli navigateur */ }
    window.open(safe, '_blank', 'noopener,noreferrer');
  }

  async function share(payload) {
    if (!payload || !payload.url) return;
    const sharePlugin = plugin('Share');
    try {
      if (isNative() && sharePlugin && sharePlugin.share) {
        await sharePlugin.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
          dialogTitle: payload.dialogTitle,
        });
        return;
      }
    } catch (error) {
      const message = error && error.message ? error.message : '';
      if (/cancel|abort/i.test(message)) return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
        return;
      } catch (error) {
        const message = error && error.message ? error.message : '';
        if (/cancel|abort/i.test(message)) return;
      }
    }
    try {
      await navigator.clipboard.writeText(payload.url);
      announce('Lien copié dans le presse-papiers.');
    } catch {
      announce(payload.url);
    }
  }

  async function fetchJson(urls) {
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) continue;
        const data = await response.json();
        return { url, data };
      } catch { /* essai suivant */ }
    }
    return null;
  }

  function dataUrls(name) {
    if (isNative()) return [`https://le-radar.ca/${name}`, `./data/${name}`];
    return [`../../${name}`, `./data/${name}`];
  }

  async function loadData() {
    state.online = navigator.onLine;
    const newsResult = await fetchJson(dataUrls('news.json'));
    const networkItems = newsResult && newsResult.url.indexOf('le-radar.ca') !== -1
      ? newsResult.data.items
      : (newsResult && newsResult.url.indexOf('news.json') !== -1 && !isNative() ? newsResult.data.items : null);
    const bundled = newsResult && String(newsResult.url).indexOf('./data/') === 0 ? newsResult.data.items : null;
    let bundledItems = bundled;
    if (!bundledItems && isNative()) {
      const local = await fetchJson(['./data/news.json']);
      bundledItems = local && local.data.items;
    }
    if (!bundledItems && newsResult && String(newsResult.url).indexOf('./data/') === 0) {
      bundledItems = newsResult.data.items;
    }
    const snapshot = loadSnapshot();
    const picked = core().pickFeed({
      online: state.online && Boolean(networkItems && networkItems.length),
      networkItems: networkItems || [],
      snapshotItems: snapshot && snapshot.items,
      bundledItems: bundledItems || [],
    });
    state.items = picked.items || [];
    state.feedOrigin = picked.origin;
    state.updated = (newsResult && newsResult.data && newsResult.data.updated)
      || (snapshot && snapshot.updated)
      || '';
    if (picked.origin === 'network' && newsResult && newsResult.data) {
      saveSnapshot(core().buildSnapshot(newsResult.data));
    }

    const sourcesResult = await fetchJson(dataUrls('news-sources.json'));
    const radiosResult = await fetchJson(dataUrls('radios.json'));
    const brandResult = await fetchJson(dataUrls('brand-colors.json'));
    state.sources = core().sourceCatalog(sourcesResult && sourcesResult.data, state.items);
    state.radios = core().radioCatalog(radiosResult && radiosResult.data);
    pushNativeStations();
    try { syncPlayer(); } catch { /* DOM pas prêt */ }
    state.brand = (brandResult && brandResult.data) || {};
  }

  function findArticle(id) {
    const snapshot = loadSnapshot();
    const library = loadLibrary();
    const pools = [state.items, snapshot && snapshot.items, library.favorites, library.history];
    for (const pool of pools) {
      const found = core().findById(pool, id);
      if (found) return found;
    }
    return null;
  }

  /** Date du fil comme sur le site (« aujourd'hui, 15 h 23 », « hier, 17 h 00 »).
   *  Toujours en français, quelle que soit la langue de l'article, de
   *  l'interface ou du téléphone (WebView en anglais compris). */
  function stampDate(iso) {
    const lib = cardLib();
    const time = Date.parse(iso || '');
    if (!lib || !lib.formatStampCompact || Number.isNaN(time)) return formatDate(iso);
    return lib.formatStampCompact(new Date(time), 'fr');
  }

  function formatDate(iso) {
    const time = Date.parse(iso || '');
    if (Number.isNaN(time)) return '';
    try {
      return new Intl.DateTimeFormat('fr-CA', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Toronto',
      }).format(time);
    } catch {
      return '';
    }
  }

  function swatch(institution) {
    const color = core().institutionColor(state.brand, institution);
    if (!color) return '<span class="swatch swatch-brand" aria-hidden="true"></span>';
    return `<span class="swatch" style="background:${color}" aria-hidden="true"></span>`;
  }

  function imageHtml(meta) {
    if (!meta.image && !meta.imageLocal) return '';
    const src = meta.imageLocal ? `https://le-radar.ca/${meta.imageLocal}` : meta.image;
    return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }

  /* Crédit photo sous la vignette, comme sur le site (.article-media-credit). */
  function creditHtml(meta) {
    if (!meta.imageCreator) return '';
    return `<figcaption class="article-media-credit notranslate" translate="no">Photo : <span class="article-media-credit__creator">${esc(meta.imageCreator)}</span></figcaption>`;
  }

  /* Cartes : mêmes règles que le site (scripts/article-card-lib.js) —
     titre nettoyé, chapô sans « Par Auteur », ordre des blocs par rôle. */
  function cardLib() {
    return window.RadarArticleCard || null;
  }

  function displayTitle(title) {
    const lib = cardLib();
    return lib ? lib.cleanTitle(title) : String(title || '');
  }

  function displayExcerpt(meta) {
    const lib = cardLib();
    const text = String(meta.excerpt || '');
    return lib && meta.author ? lib.stripLeadingByline(text, meta.author) : text;
  }

  function isFresh(iso) {
    const lib = cardLib();
    return lib ? (lib.isFreshRecent || lib.isFreshToday)(iso) : false;
  }

  function cardSlots(role, hasMedia) {
    const lib = cardLib();
    if (lib) return lib.cardSlots(role, hasMedia);
    return ['meta', 'title', 'byline', 'media', 'brief'];
  }

  /** Rôle façon site : une, vedettes, En bref, puis suite du fil. */
  function cardRole(index, layout) {
    if (!layout) return 'standard';
    if (index === 0) return 'lead';
    if (index <= 4) return 'feature';
    if (index <= 14) return 'compact';
    return 'standard';
  }

  function cardHtml(item, role = 'standard') {
    const meta = core().articleMeta(item);
    if (!meta) return '';
    const saved = core().isFavorite(loadLibrary(), meta.id);
    const en = meta.lang === 'en';
    const lang = en ? '<span class="lang notranslate" translate="no">EN</span>' : '';
    const color = core().institutionColor(state.brand, meta.institution) || 'var(--accent)';
    const hasMedia = Boolean(meta.image || meta.imageLocal);
    const excerpt = displayExcerpt(meta);
    const readMore = en ? 'Read more →' : 'Lire la suite →';
    const byLabel = en ? 'By' : 'Par';
    const time = meta.date
      ? `<time class="article-time notranslate${isFresh(meta.date) ? ' is-fresh' : ''}" datetime="${esc(meta.date)}">${esc(stampDate(meta.date))}</time>`
      : '';
    const lib = cardLib();
    const short = lib && lib.institutionShort ? lib.institutionShort(meta.institution) : '';
    const full = meta.institution.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const inst = !meta.institution ? ''
      : (short && short !== full
        ? `<span class="article-inst"><span class="article-inst__full">${esc(full)}</span><span class="article-inst__short">${esc(short)}</span></span>`
        : `<span class="article-inst">${esc(full)}</span>`);
    const slotHtml = {
      eyebrow: '<span class="article-eyebrow">À la une</span>',
      meta: `<div class="article-meta"><span class="article-meta__lead"><span class="article-source notranslate" translate="no">${esc(meta.source || 'Source')}</span>${lang}${inst}</span>${time}</div>`,
      title: `<h3 class="article-title">${esc(displayTitle(meta.title))}</h3>`,
      byline: meta.author
        ? `<p class="article-byline"><span class="article-byline__label">${byLabel}</span><strong class="article-author notranslate" translate="no">${esc(meta.author)}</strong></p>`
        : '',
      media: hasMedia ? `<figure class="article-media">${imageHtml(meta)}${creditHtml(meta)}</figure>` : '',
      brief: `<p class="article-brief is-truncated"><span class="article-brief-text">${esc(excerpt)}</span><span class="article-more" style="color:${esc(color)}">\u00a0${readMore}</span></p>`,
    };
    const classes = ['article', `article--${role}`, 'card-open'];
    if (hasMedia) classes.push('has-image');
    else classes.push('article--text');
    if (hasMedia && role !== 'lead') classes.push('article--thumb');
    return `<article class="card card-site card--${role}${role === 'lead' ? ' card-lead' : ''}">
      <a class="${classes.join(' ')}" href="#/article/${meta.id}" style="--c:${esc(color)}">
        ${cardSlots(role, hasMedia).map((slot) => slotHtml[slot]).join('\n        ')}
      </a>
    </article>`;
  }

  function cardsHtml(items, empty, layout) {
    if (!items.length) return `<p class="empty">${empty}</p>`;
    if (!layout) return `<div class="cards">${items.map((item) => cardHtml(item, 'standard')).join('')}</div>`;
    /* Même découpage que le fil du site : une + vedettes (.news-hero),
       En bref (.brief-rail), puis suite du fil (.news-tail-body). */
    const html = items.map((item, index) => cardHtml(item, cardRole(index, layout)));
    const group = (cls, part) => (part.length ? `<div class="${cls}">${part.join('')}</div>` : '');
    return `<div class="cards cards--wire news-list" data-ready>${group('news-hero', html.slice(0, 5))}${group('brief-rail', html.slice(5, 15))}${html.length > 15 ? `<div class="news-tail">${group('news-tail-body', html.slice(15))}</div>` : ''}</div>`;
  }

  function chip(href, label, current) {
    const aria = current ? ' aria-current="page"' : '';
    return `<a href="${href}"${aria}>${label}</a>`;
  }

  function viewHome(route) {
    const follows = followIds();
    const prefs = loadPrefs();
    const mode = core().homeMode(route.filter, follows);
    const modeName = mode === 'suivis' ? 'follows' : 'all';
    const filtered = core().filterFeed(state.items, {
      mode: modeName,
      follows,
      hidden: prefs.hidden,
    });
    const shown = filtered.slice(0, state.visible);
    const empty = {
      tout: 'Aucun article dans le fil pour le moment.',
      suivis: 'Vous ne suivez encore aucun média, ou leurs articles sont masqués. <a href="#/explorer">Choisir des médias</a>.',
    }[mode];
    const more = shown.length < filtered.length
      ? `<button type="button" class="wide" data-action="more">Afficher la suite (${filtered.length - shown.length})</button>`
      : '';
    state.homeCountLabel = `${filtered.length} ${filtered.length === 1 ? 'article' : 'articles'}`;
    return `
      <nav class="chips" aria-label="Filtre du fil">
        ${chip('#/accueil?filtre=tout', 'Tout', mode === 'tout')}
        ${chip('#/accueil?filtre=suivis', 'Suivis', mode === 'suivis')}
      </nav>
      ${cardsHtml(shown, empty, mode === 'tout')}
      ${more}`;
  }

  function viewExplorer(route) {
    const section = route.section === 'radios' ? 'radios' : 'sources';
    const prefs = loadPrefs();
    const query = core().fold(state.sourceQuery);
    const institution = route.institution || '';
    let body = '';
    if (section === 'radios') {
      body = `<ul class="plain">${state.radios.map((radio) => `<li class="source-row">
        <a href="#/radio/${esc(radio.id)}"><span class="source-name notranslate">${esc(radio.name)}</span>${radio.offline ? '<span class="badge-offline">Hors ligne</span>' : ''}<span class="source-meta article-inst">${esc(radio.institution)}</span></a>
        ${radio.stream ? radioToggleHtml(radio, 'Écouter', 'Pause') : ''}
      </li>`).join('')}</ul>`;
    } else {
      const rows = state.sources.filter((source) => {
        if (institution && source.institutionId !== institution) return false;
        if (!query) return true;
        return core().fold(`${source.name} ${source.institution} ${source.region}`).includes(query);
      });
      body = `<label class="field" for="source-q">Filtrer les médias</label>
        <input id="source-q" type="search" enterkeyhint="search" value="${esc(state.sourceQuery)}" autocomplete="off">
        ${rows.length ? `<ul class="plain">${rows.map((source) => {
          const on = followIds().includes(source.id);
          const hidden = prefs.hidden.includes(source.id);
          return `<li class="source-row${hidden ? ' is-hidden' : ''}">
            <a href="#/explorer/source/${esc(source.id)}">
              <span class="source-name">${swatch(source.institution)}<span class="article-source">${esc(source.name)}</span></span>
              <span class="source-meta"><span class="article-inst">${esc(source.institution)}</span>${source.region ? ` · <span class="notranslate">${esc(source.region)}</span>` : ''}${hidden ? ' · <span>masqué</span>' : ''}</span>
            </a>
            <button type="button" data-action="follow" data-name="${esc(source.name)}" aria-pressed="${on ? 'true' : 'false'}">${on ? 'Suivi' : 'Suivre'}</button>
          </li>`;
        }).join('')}</ul>` : '<p class="empty">Aucun média ne correspond.</p>'}`;
    }
    return `<h1>Explorer</h1>
      <p class="lede">Suivez un journal, une région ou une radio. Le texte intégral reste chez la publication.</p>
      <nav class="chips" aria-label="Explorer">
        ${chip('#/explorer?section=sources', 'Médias', section === 'sources')}
        ${chip('#/explorer?section=radios', 'Radios', section === 'radios')}
      </nav>
      ${body}`;
  }

  function viewJournal(route) {
    const source = state.sources.find((item) => item.id === route.slug);
    const name = source ? source.name : route.slug;
    const articles = core().filterFeed(state.items, { mode: 'follows', follows: [route.slug], hidden: [] });
    const followed = followIds().includes(route.slug);
    const hidden = core().isHidden(loadPrefs(), route.slug);
    const site = source && source.site
      ? `<a class="wide link" data-action="external" href="${esc(source.site)}" target="_blank" rel="noopener noreferrer">Site de <span class="article-source">${esc(name)}</span></a>`
      : '';
    const fiche = `<a class="wide link" data-action="external" href="https://le-radar.ca/journaux/${esc(route.slug)}/" target="_blank" rel="noopener noreferrer">Fiche sur le-radar.ca</a>`;
    const title = source
      ? `<h1><span class="notranslate">${esc(source.name)}</span></h1>`
      : '<h1>Média</h1>';
    const lede = source
      ? `<p class="lede"><span class="article-inst">${esc(source.institution)}</span>${source.region ? ` · <span class="notranslate">${esc(source.region)}</span>` : ''}</p>`
      : '<p class="lede">Ce média n’est pas dans le registre chargé.</p>';
    return `<p class="back"><a href="#/explorer">Retour à Explorer</a></p>
      ${title}
      ${lede}
      <div class="row-actions">
        <button type="button" data-action="follow" data-name="${esc(name)}" aria-pressed="${followed ? 'true' : 'false'}">${followed ? 'Suivi' : 'Suivre'}</button>
        <button type="button" data-action="hide" data-id="${esc(route.slug)}" aria-pressed="${hidden ? 'true' : 'false'}">${hidden ? 'Réafficher' : 'Masquer'}</button>
      </div>
      ${site}
      ${fiche}
      <h2 class="section">Dans le fil</h2>
      ${cardsHtml(articles, 'Aucun article de ce média dans le fil chargé.')}`;
  }

  function viewRadio(route) {
    const radio = state.radios.find((item) => item.id === route.slug);
    if (!radio) {
      return `<p class="back"><a href="#/explorer?section=radios">Retour aux radios</a></p><h1>Radio introuvable</h1>`;
    }
    ensureNowPlaying();
    const now = core().nowPlayingLabel(player.nowPayload, radio.id);
    const audio = radio.stream
      ? `<p class="now-line" data-now-for="${esc(radio.id)}"${now ? '' : ' hidden'}>En ondes : <span class="notranslate">${esc(now)}</span></p>
         ${radioToggleHtml(radio, 'Écouter en direct', 'Mettre en pause', 'wide primary')}
         <p class="note">La radio reste dans la barre du haut pendant que vous parcourez l’application, et dans la notification du téléphone, à l’écran verrouillé et dans la voiture.</p>`
      : '<p class="note">Pas de flux HTTPS validé. La station s’écoute sur son site.</p>';
    const site = radio.website
      ? `<a class="wide link" data-action="external" href="${esc(radio.website)}" target="_blank" rel="noopener noreferrer">Ouvrir le site de <span class="notranslate">${esc(radio.name)}</span></a>`
      : '';
    const ledeMain = radio.slogan
      ? esc(radio.slogan)
      : `<span class="article-inst">${esc(radio.institution)}</span>`;
    return `<p class="back"><a href="#/explorer?section=radios">Retour aux radios</a></p>
      <h1 class="notranslate">${esc(radio.name)}</h1>
      <p class="lede">${ledeMain}${radio.frequency ? ` · <span class="notranslate">${esc(radio.frequency)}</span>` : ''}</p>
      ${audio}
      ${site}`;
  }

  function radioById(id) {
    return state.radios.find((item) => item.id === id) || null;
  }

  function playerBusy() {
    return player.status === 'playing' || player.status === 'loading';
  }

  function radioToggleHtml(radio, offLabel, onLabel, extraClass) {
    const on = player.id === radio.id && playerBusy();
    const classes = ['notranslate', extraClass].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-action="radio-toggle" data-id="${esc(radio.id)}" data-label-off="${esc(offLabel)}" data-label-on="${esc(onLabel)}" aria-pressed="${on ? 'true' : 'false'}">${esc(uiText(on ? onLabel : offLabel))}</button>`;
  }

  function playerAudio() {
    return document.getElementById('player-audio');
  }

  function nowPlayingUrls() {
    if (isNative()) return ['https://le-radar.ca/radio-nowplaying.json'];
    return ['../../radio-nowplaying.json'];
  }

  function ensureNowPlaying(force) {
    if (player.nowPending) return player.nowPending;
    if (!force && Date.now() - player.nowFetchedAt < NOW_PLAYING_TTL_MS) return Promise.resolve();
    player.nowFetchedAt = Date.now();
    player.nowPending = fetchJson(nowPlayingUrls()).then((result) => {
      if (result && result.data && typeof result.data === 'object') player.nowPayload = result.data;
    }).catch(() => {}).then(() => {
      player.nowPending = null;
      syncPlayer();
    });
    return player.nowPending;
  }

  function syncMediaSession(radio) {
    const session = navigator.mediaSession;
    if (!session) return;
    if (useNativeRadio()) {
      // Android : seule la MediaSession native (Media3) parle à la notification,
      // à l'écran verrouillé et à l'autoradio. On vide celle du WebView pour
      // qu'elle ne publie jamais de métadonnées vides par-dessus.
      try {
        session.metadata = null;
        session.playbackState = 'none';
        for (const action of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto']) {
          try { session.setActionHandler(action, null); } catch { /* action inconnue */ }
        }
      } catch { /* WebView sans Media Session */ }
      return;
    }
    try {
      if (!radio) {
        session.metadata = null;
        session.playbackState = 'none';
        player.sessionKey = '';
        return;
      }
      const artist = player.now || radio.institution || 'Radio étudiante';
      const key = `${radio.id}|${artist}`;
      if (key !== player.sessionKey && typeof window.MediaMetadata === 'function') {
        session.metadata = new window.MediaMetadata({
          title: radio.name,
          artist,
          album: 'LE-RADAR',
          artwork: [
            { src: new URL('./icons/icon-192.png', location.href).href, sizes: '192x192', type: 'image/png' },
            { src: new URL('./icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' },
          ],
        });
        player.sessionKey = key;
      }
      session.playbackState = playerBusy() ? 'playing' : 'paused';
    } catch { /* Media Session partielle dans certaines WebView */ }
  }

  /*
   * Barre radio persistante de l'app : toujours affichée, même au repos.
   * Au repos, elle propose la station choisie, sinon la dernière écoutée
   * (mémorisée), sinon une station suivie, sinon la première de la liste.
   */
  const LAST_STATION_KEY = 'radar.mobile.lastStation';

  function rememberStation(id) {
    if (!id) return;
    try { storage().setItem(LAST_STATION_KEY, id); } catch { /* plein */ }
  }

  function idleStationId() {
    const usable = (id) => id && radioById(id);
    if (usable(state.tunedId)) return state.tunedId;
    let last = '';
    try { last = storage().getItem(LAST_STATION_KEY) || ''; } catch { last = ''; }
    if (usable(last)) return last;
    try {
      const followed = followIds().find((id) => usable(id));
      if (followed) return followed;
    } catch { /* aucune suivie */ }
    const first = state.radios.find((radio) => radio && radio.id && radio.stream && !radio.offline)
      || state.radios.find((radio) => radio && radio.id);
    return first ? first.id : '';
  }

  function barStationId() {
    return player.id || idleStationId();
  }

  function syncPlayer() {
    const root = document.getElementById('player');
    const activeRadio = player.id ? radioById(player.id) : null;
    const radio = activeRadio || (barStationId() ? radioById(barStationId()) : null);
    const visible = Boolean(radio);
    document.body.classList.toggle('has-player', visible);
    if (root) {
      root.hidden = !visible;
      root.dataset.state = activeRadio ? player.status : 'idle';
    }
    player.now = radio ? core().nowPlayingLabel(player.nowPayload, radio.id) : '';
    if (radio) {
      const name = document.getElementById('player-name');
      const now = document.getElementById('player-now');
      const info = document.getElementById('player-info');
      const toggle = document.getElementById('player-toggle');
      if (name) name.textContent = radio.name;
      if (now) {
        let line = player.now || radio.institution || '';
        if (!activeRadio) line = uiText(player.now ? `Prête à écouter · ${player.now}` : 'Prête à écouter');
        else if (player.status === 'loading') line = uiText('Connexion au direct…');
        else if (player.status === 'error') line = uiText('Flux indisponible. Touchez lecture pour réessayer.');
        now.textContent = line;
      }
      if (info) {
        info.setAttribute('href', '#/explorer?section=radios');
        info.setAttribute('aria-label', uiText(`${radio.name} : choisir une autre station`));
      }
      if (toggle) {
        toggle.setAttribute('aria-label', uiText(playerBusy() ? `Mettre ${radio.name} en pause` : `Écouter ${radio.name}`));
        if (player.status === 'loading') toggle.setAttribute('aria-busy', 'true');
        else toggle.removeAttribute('aria-busy');
      }
    }
    for (const button of document.querySelectorAll('[data-action="radio-toggle"]')) {
      const on = button.dataset.id === player.id && playerBusy();
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = on ? button.dataset.labelOn : button.dataset.labelOff;
      const shown = uiText(label);
      if (label && button.textContent !== shown) button.textContent = shown;
    }
    for (const line of document.querySelectorAll('[data-now-for]')) {
      const text = core().nowPlayingLabel(player.nowPayload, line.dataset.nowFor);
      const span = line.querySelector('span');
      if (span) span.textContent = text;
      line.hidden = !text;
    }
    if (root) root.classList.toggle('is-idle', !activeRadio);
    syncMediaSession(activeRadio);
    if (activeRadio && useNativeRadio() && !player.nativeSync) pushNativeMetadata(radio);
    syncTuner();
  }

  function syncTuner() {
    const tuner = document.getElementById('tuner');
    const select = document.getElementById('tuner-select');
    const name = document.getElementById('tuner-now-name');
    const sub = document.getElementById('tuner-now-sub');
    const play = document.getElementById('tuner-play');
    if (!tuner || !select) return;
    if (select.dataset.filled !== '1' && state.radios.length) {
      for (const station of state.radios) {
        const option = document.createElement('option');
        option.value = station.id;
        option.textContent = station.offline ? `${station.name} — Hors ligne` : station.name;
        option.classList.add('notranslate');
        if (station.offline) option.classList.add('is-offline');
        option.setAttribute('translate', 'no');
        select.append(option);
      }
      select.dataset.filled = '1';
      tuner.classList.add('is-dial-ready');
    }
    const active = player.id || state.tunedId || '';
    if (active && [...select.options].some((option) => option.value === active) && select.value !== active) {
      select.value = active;
    }
    const ticking = tunerTickerActive();
    if (ticking && !tickerState.radio) pickTickerRadio();
    if (ticking && tickerState.radio && select.value !== tickerState.radio.id) select.value = tickerState.radio.id;
    const radio = (ticking && tickerState.radio)
      || (select.value && radioById(select.value)) || (active ? radioById(active) : null);
    if (ticking) scheduleTunerTicker();
    else stopTunerTicker();
    if (name) name.textContent = radio ? (radio.offline ? `${radio.name} · ${uiText('Hors ligne')}` : radio.name) : uiText('Syntoniser un poste');
    tuner.classList.toggle('is-station-offline', !!(radio && radio.offline));
    if (sub) {
      if (radio && radio.offline && player.offlineNotice && player.offlineNotice.id === radio.id
        && Date.now() < player.offlineNotice.until) sub.textContent = OFFLINE_NOTICE;
      else if (radio && player.now && player.id === radio.id) sub.textContent = player.now;
      else if (radio && radio.institution) sub.textContent = radio.institution;
      else sub.textContent = uiText('Radios étudiantes en direct');
    }
    const on = Boolean(radio) && player.id === radio.id && playerBusy();
    tuner.classList.toggle('is-playing', on);
    if (play) {
      play.classList.toggle('is-buffering', player.status === 'loading' && player.id === (radio && radio.id));
      const playIcon = play.querySelector('.ico-play');
      const pauseIcon = play.querySelector('.ico-pause');
      if (playIcon) playIcon.classList.toggle('hidden', on);
      if (pauseIcon) pauseIcon.classList.toggle('hidden', !on);
      play.setAttribute('aria-label', uiText(on ? 'Pause du syntoniseur' : 'Lecture du syntoniseur'));
    }
  }

  /*
   * Défilement des postes au repos — même comportement que le site
   * (radar-tuner.js : isNowAirPanelPreviewMode / scheduleNowAirPreviewTick) :
   * tant que rien ne joue et qu'aucun poste n'a été choisi, un poste au hasard
   * (jamais deux fois de suite) toutes les 8 s, en fondu 700 ms. Verrouillé dès
   * la lecture, la pause ou un choix explicite ; coupé si prefers-reduced-motion.
   */

  function tunerTickerActive() {
    return !(REDUCED_MOTION && REDUCED_MOTION.matches)
      && state.radios.length > 0
      && !player.id
      && !state.tunedId
      && !document.hidden;
  }

  function pickTickerRadio() {
    const pool = state.radios.filter((radio) => radio && radio.id && radio.stream);
    const list = pool.length ? pool : state.radios.filter((radio) => radio && radio.id);
    if (!list.length) { tickerState.radio = null; return null; }
    let pick = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && pick.id === tickerState.lastId) {
      const others = list.filter((radio) => radio.id !== tickerState.lastId);
      pick = others[Math.floor(Math.random() * others.length)];
    }
    tickerState.radio = pick;
    tickerState.lastId = pick.id;
    return pick;
  }

  function stopTunerTicker() {
    if (tickerState.timer) clearTimeout(tickerState.timer);
    tickerState.timer = 0;
    tickerState.radio = null;
    for (const el of document.querySelectorAll('#tuner-now-name, #tuner-now-sub')) el.classList.remove('is-crossfading');
  }

  function scheduleTunerTicker() {
    if (tickerState.timer) return;
    tickerState.timer = setTimeout(() => {
      tickerState.timer = 0;
      if (!tunerTickerActive()) { syncTuner(); return; }
      const fading = [...document.querySelectorAll('#tuner-now-name, #tuner-now-sub')];
      for (const el of fading) el.classList.add('is-crossfading');
      setTimeout(() => {
        if (tunerTickerActive()) pickTickerRadio();
        syncTuner();
        requestAnimationFrame(() => { for (const el of fading) el.classList.remove('is-crossfading'); });
      }, TUNER_TICKER_FADE_MS);
    }, TUNER_TICKER_DWELL_MS);
  }

  if (REDUCED_MOTION && REDUCED_MOTION.addEventListener) REDUCED_MOTION.addEventListener('change', () => syncTuner());
  document.addEventListener('visibilitychange', () => syncTuner());

  function stepTuner(direction) {
    const list = state.radios.filter((radio) => radio && radio.id);
    if (!list.length) return;
    const select = document.getElementById('tuner-select');
    const current = player.id || (select && select.value) || state.tunedId || barStationId();
    let index = list.findIndex((radio) => radio.id === current);
    if (index < 0) index = direction > 0 ? -1 : 0;
    const next = list[(index + direction + list.length) % list.length];
    state.tunedId = next.id;
    if (select) select.value = next.id;
    if (player.id && playerBusy()) playRadio(next.id);
    else syncPlayer();
  }

  const OFFLINE_NOTICE = 'Station hors ligne pour le moment';
  const OFFLINE_NOTICE_MS = 4000;

  function playRadio(id) {
    const radio = radioById(id);
    if (!radio || !radio.stream) return;
    rememberStation(id);
    state.tunedId = id;
    if (radio.offline) {
      // On tente quand même la lecture, mais le message reste visible
      // OFFLINE_NOTICE_MS avant que le titre en ondes puisse le remplacer.
      player.offlineNotice = { id, until: Date.now() + OFFLINE_NOTICE_MS };
      clearTimeout(player.offlineNoticeTimer);
      player.offlineNoticeTimer = setTimeout(() => { player.offlineNotice = null; syncTuner(); }, OFFLINE_NOTICE_MS);
      const sub = document.getElementById('tuner-now-sub');
      if (sub) sub.textContent = OFFLINE_NOTICE;
    }
    const native = radioNative();
    if (native) {
      // Couper tout <audio> résiduel : une seule source de son.
      releaseStream();
      player.id = id;
      player.status = 'loading';
      syncPlayer();
      ensureNowPlaying();
      const artist = player.now || radio.institution || '';
      Promise.resolve(native.play({
        url: radio.stream,
        title: radio.name,
        artist,
        stationId: id,
        now: player.now || '',
      })).catch((error) => {
        if (player.id !== id || player.status !== 'loading') return;
        player.status = 'error';
        syncPlayer();
        console.warn('RadioPlayback.play', error);
      });
      return;
    }
    const audio = playerAudio();
    if (!audio) return;
    // Flux en direct : on (re)branche la source à chaque lecture pour
    // repartir du direct, pas d’un tampon vieux de plusieurs minutes.
    if (player.id !== id || !audio.getAttribute('src')) audio.src = radio.stream;
    player.id = id;
    player.status = 'loading';
    syncPlayer();
    ensureNowPlaying();
    let attempt;
    try {
      attempt = audio.play();
    } catch (error) {
      attempt = Promise.reject(error);
    }
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch((error) => {
        if (player.id !== id || player.status !== 'loading') return;
        player.status = error && error.name === 'NotAllowedError' ? 'paused' : 'error';
        syncPlayer();
      });
    }
  }

  function releaseStream() {
    const audio = playerAudio();
    if (!audio) return;
    audio.pause();
    // Couper la connexion : pas de données consommées en pause, et la
    // reprise retombe sur le direct.
    if (audio.getAttribute('src')) {
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* élément déjà vide */ }
    }
  }

  function pauseRadio() {
    if (!player.id) return;
    player.status = 'paused';
    const native = radioNative();
    if (native) {
      Promise.resolve(native.pause()).catch(() => {});
      syncPlayer();
      return;
    }
    releaseStream();
    syncPlayer();
  }

  function stopRadio() {
    player.status = 'idle';
    player.id = '';
    const native = radioNative();
    if (native) {
      Promise.resolve(native.stop()).catch(() => {});
      releaseStream();
      syncPlayer();
      return;
    }
    releaseStream();
    syncPlayer();
  }

  function toggleRadio(id) {
    const target = id || player.id || barStationId();
    if (!target) return;
    if (target === player.id && playerBusy()) pauseRadio();
    else playRadio(target);
  }

  function applyNativeState(payload) {
    if (!payload || typeof payload !== 'object') return;
    const status = payload.status || 'idle';
    const stationId = payload.stationId || '';
    player.nativeSync = true;
    try {
      if (status === 'idle') {
        player.status = 'idle';
        player.id = '';
      } else {
        if (stationId) player.id = stationId;
        if (status === 'playing' || status === 'loading' || status === 'paused' || status === 'error') {
          player.status = status;
        }
      }
      syncPlayer();
    } finally {
      player.nativeSync = false;
    }
  }

  function bindNativeRadio() {
    const native = radioNative();
    if (!native || player.nativeBound) return;
    player.nativeBound = true;
    try {
      if (typeof native.addListener === 'function') {
        native.addListener('state', (payload) => applyNativeState(payload));
      }
    } catch { /* plugin sans événements */ }
  }

  function pushNativeMetadata(radio) {
    const native = radioNative();
    if (!native || !radio || !playerBusy()) return;
    const artist = player.now || radio.institution || '';
    const now = player.now || '';
    // N'envoyer que les changements : la voiture relit tout à chaque envoi.
    const key = `${radio.id}|${now}`;
    if (player.nativeMetaKey === key) return;
    player.nativeMetaKey = key;
    Promise.resolve(native.updateMetadata({
      title: radio.name,
      artist,
      stationId: radio.id,
      now,
    })).catch(() => {});
  }

  /** Stations pour la notification, le volant et Android Auto. */
  function pushNativeStations() {
    const native = radioNative();
    if (!native || typeof native.setStations !== 'function') return;
    const stations = state.radios.filter((radio) => radio && radio.id && radio.stream).map((radio) => ({
      id: radio.id,
      name: radio.name,
      fullName: radio.fullName || radio.name,
      institution: radio.institution || '',
      city: radio.city || '',
      stream: radio.stream,
      artwork: radio.logo ? new URL(radio.logo, 'https://le-radar.ca/').href : '',
    }));
    if (!stations.length) return;
    const key = JSON.stringify(stations);
    if (player.nativeStationsKey === key) return;
    player.nativeStationsKey = key;
    let favorites = [];
    try { const ids = new Set(stations.map((s) => s.id)); favorites = followIds().filter((id) => ids.has(id)); } catch { favorites = []; }
    Promise.resolve(native.setStations({ stations, favorites })).catch(() => {});
  }

  function bindPlayer() {
    bindNativeRadio();
    const audio = playerAudio();
    if (!audio) return;
    audio.addEventListener('playing', () => {
      if (useNativeRadio()) return;
      if (!player.id || !audio.getAttribute('src')) return;
      player.status = 'playing';
      syncPlayer();
    });
    for (const type of ['waiting', 'stalled']) {
      audio.addEventListener(type, () => {
        if (useNativeRadio()) return;
        if (player.status !== 'playing') return;
        player.status = 'loading';
        syncPlayer();
      });
    }
    audio.addEventListener('pause', () => {
      if (useNativeRadio()) return;
      // Pause imposée par le système (focus audio, casque débranché).
      // Changer de station relance play() aussitôt : ignorer cette pause-là.
      if (!player.id || !playerBusy() || !audio.getAttribute('src') || !audio.paused) return;
      player.status = 'paused';
      syncPlayer();
    });
    for (const type of ['error', 'ended']) {
      audio.addEventListener(type, () => {
        if (useNativeRadio()) return;
        if (!player.id || !audio.getAttribute('src')) return;
        player.status = 'error';
        releaseStream();
        syncPlayer();
      });
    }
    const session = navigator.mediaSession;
    if (session && typeof session.setActionHandler === 'function') {
      const handlers = {
        play: () => toggleRadio(player.id),
        pause: () => pauseRadio(),
        stop: () => stopRadio(),
      };
      for (const [name, handler] of Object.entries(handlers)) {
        try { session.setActionHandler(name, handler); } catch { /* action non prise en charge */ }
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !player.id) return;
      // Retour au premier plan : si le système a gelé l’écoute HTML, l’afficher.
      if (!useNativeRadio() && playerBusy() && audio.paused) player.status = 'paused';
      if (playerBusy()) ensureNowPlaying();
      syncPlayer();
    });
    setInterval(() => {
      if (player.id && playerBusy() && document.visibilityState === 'visible') ensureNowPlaying();
    }, NOW_PLAYING_TTL_MS);
  }

  function viewSearch(route) {
    if (route.q && state.query === '' && !state.queryEdited) state.query = route.q;
    const prefs = loadPrefs();
    const results = core().searchFeed(state.items, state.query, prefs.hidden);
    const body = core().fold(state.query).trim().length < 2
      ? '<p class="empty">Saisissez au moins deux lettres. La recherche couvre le fil chargé : titres, sources, auteurices et extraits.</p>'
      : cardsHtml(results.slice(0, 40), 'Aucun résultat dans le fil chargé.');
    return `<h1>Recherche</h1>
      <form id="search-form" role="search">
        <label class="field" for="q">Rechercher dans le fil</label>
        <input id="q" name="q" type="search" enterkeyhint="search" value="${esc(state.query)}" autocomplete="off">
      </form>
      ${body}`;
  }

  function savedList(items, empty) {
    return cardsHtml(items, empty);
  }

  function viewSaved(route) {
    const tab = route.tab === 'historique' ? 'historique' : 'favoris';
    const library = loadLibrary();
    const list = tab === 'historique' ? library.history : library.favorites;
    const confirm = state.confirm === tab
      ? `<button type="button" class="danger" data-action="confirm-clear" data-target="${tab}">Confirmer l’effacement</button>`
      : `<button type="button" data-action="ask-clear" data-target="${tab}">Effacer ${tab === 'historique' ? 'l’historique' : 'les favoris'}</button>`;
    return `<h1>Enregistrés</h1>
      <p class="lede">Les favoris et l’historique restent sur cet appareil. Le texte intégral n’est pas téléchargé.</p>
      <nav class="chips" aria-label="Enregistrés">
        ${chip('#/enregistres?onglet=favoris', 'Favoris', tab === 'favoris')}
        ${chip('#/enregistres?onglet=historique', 'Historique', tab === 'historique')}
      </nav>
      ${savedList(list, tab === 'historique' ? 'Aucun article consulté récemment.' : 'Aucun favori pour le moment.')}
      <div class="row-actions">${confirm}</div>`;
  }

  /* Onglet Sports : cartes natives (même look que le-radar.ca/sports/),
     lues dans sports-masthead.json (en ligne sur l’APK, copie embarquée en secours). */
  const SPORTS_LIVE_URL = 'https://le-radar.ca/sports-masthead.json';
  const SPORTS_GLYPHS = [['basket', '🏀'], ['hockey', '🏒'], ['soccer', '⚽'], ['football', '🏈'], ['volley', '🏐'], ['rugby', '🏉'], ['voile', '⛵'], ['sail', '⛵'], ['badminton', '🏸'], ['cross', '🏃'], ['athl', '🏃'], ['natation', '🏊'], ['golf', '⛳'], ['baseball', '⚾'], ['curling', '🥌']];
  const SPORTS_FILTERS_KEY = 'radar-app-sports-filters-v2';
  const SPORTS_PERIODS = [['all', 'Toutes'], ['live', 'En cours'], ['7d', '7 jours'], ['week', 'Cette semaine'], ['next-week', 'Semaine prochaine'], ['month', 'Ce mois-ci'], ['session', 'Cette session']];
  const SPORTS_PAGE = 30;
  const SPORTS_SITE_SPORTS = [['hockey', 'Hockey'], ['football', 'Football'], ['soccer', 'Soccer'], ['basketball', 'Basketball'], ['volleyball', 'Volleyball'], ['rugby', 'Rugby'], ['flag-football', 'Flag-football'], ['soccer-interieur', 'Soccer intérieur'], ['futsal', 'Futsal'], ['baseball', 'Baseball'], ['badminton', 'Badminton'], ['natation', 'Natation'], ['athletisme', 'Athlétisme'], ['cross-country', 'Cross-country'], ['golf', 'Golf'], ['cheerleading', 'Cheerleading'], ['ultimate', 'Ultimate'], ['sailing', 'Voile']];
  /* « En direct » : coup d’envoi entre 15 min à venir et 3 h passées (sports-board.js). */
  const SPORTS_LIVE_LEAD_MS = 15 * 60 * 1000;
  const SPORTS_LIVE_TAIL_MS = 3 * 3600 * 1000;
  const sportsState = { data: null, loading: false, error: false, limit: SPORTS_PAGE, ...loadSportsFilters() };

  /* Même jeu de filtres que le-radar.ca/sports/ (sport, secteur, catégorie, période, recherche),
     gardé sur l’appareil. Par défaut : toutes les périodes, comme le site, 30 équipes par page (« 7 jours » en option). */
  function loadSportsFilters() {
    const base = { tab: 'resultats', sport: 'all', sector: 'all', sex: 'all', period: 'all', q: '' };
    try {
      const saved = JSON.parse(localStorage.getItem(SPORTS_FILTERS_KEY) || '{}');
      for (const key of Object.keys(base)) if (typeof saved[key] === 'string') base[key] = saved[key];
    } catch { /* défauts */ }
    if (!SPORTS_PERIODS.some(([k]) => k === base.period)) base.period = 'all';
    return base;
  }

  function saveSportsFilters() {
    const { tab, sport, sector, sex, period, q } = sportsState;
    try { localStorage.setItem(SPORTS_FILTERS_KEY, JSON.stringify({ tab, sport, sector, sex, period, q })); } catch { /* plein */ }
  }

  function sportsYmd(ms) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  }

  function sportsAddDays(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  /** Plage [start, end] inclusive, mêmes règles que sports-board.js du site. */
  function sportsPeriodRange(key) {
    const today = sportsYmd(Date.now());
    const [y, m] = today.split('-').map(Number);
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = sportsAddDays(today, wd === 0 ? -6 : 1 - wd);
    if (key === '7d') return sportsState.tab === 'avenir' ? { start: today, end: sportsAddDays(today, 7) } : { start: sportsAddDays(today, -7), end: today };
    if (key === 'live') return { start: today, end: today };
    if (key === 'week') return { start: monday, end: sportsAddDays(monday, 6) };
    if (key === 'next-week') return { start: sportsAddDays(monday, 7), end: sportsAddDays(monday, 13) };
    if (key === 'month') {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return { start, end: sportsAddDays(nextFirst, -1) };
    }
    if (key === 'session') {
      if (m >= 9) return { start: `${y}-09-01`, end: `${y}-12-31` };
      if (m >= 5) return { start: `${y}-05-01`, end: `${y}-08-31` };
      return { start: `${y}-01-01`, end: `${y}-04-30` };
    }
    return null;
  }

  function sportsFold(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function sportsTeamMatches(team) {
    const f = sportsState;
    if (f.sport !== 'all' && team.sport !== f.sport) return false;
    if (f.sector !== 'all' && team.sector !== f.sector) return false;
    if (f.sex !== 'all' && String(team.sex || '').toLowerCase() !== f.sex) return false;
    const q = sportsFold(f.q).trim();
    if (q) {
      const sectorLabel = team.sector === 'universitaire' ? 'universitaire' : team.sector === 'collegial' ? 'collegial' : '';
      const sexLabel = { F: 'feminin', M: 'masculin', X: 'mixte' }[String(team.sex || '').toUpperCase()] || '';
      const hay = sportsFold([team.name, team.code, team.fullName, team.sport, team.sportLabel, team.leagueLabel, team.division, sectorLabel, sexLabel].join(' '));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function sportsFilterButton(kind, value, label, current) {
    const on = value === current;
    return `<button type="button" class="sports-filter${on ? ' is-active' : ''}" data-sports-filter="${kind}" data-value="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
  }

  function sportsFilterRow(label, kind, options, current) {
    return `<div class="sports-filters__row"><span class="sports-filters__label">${esc(label)}</span>${options.map(([v, l]) => sportsFilterButton(kind, v, l, current)).join('')}</div>`;
  }

  function sportsFiltersHtml() {
    const f = sportsState;
    const counts = new Map();
    for (const team of Object.values((f.data && f.data.teams) || {})) {
      if (!team.sport) continue;
      const row = counts.get(team.sport) || { label: team.sportLabel || team.sport, n: 0 };
      row.n += 1;
      counts.set(team.sport, row);
    }
    /* Même liste et même ordre que le-radar.ca/sports/ ; un sport absent de la liste du site s’ajoute à la fin. */
    const sports = [['all', 'Tous'], ...SPORTS_SITE_SPORTS];
    for (const [k, v] of counts) if (!sports.some(([key]) => key === k)) sports.push([k, v.label]);
    const active = ['sport', 'sector', 'sex'].filter((k) => f[k] !== 'all').length + (f.q ? 1 : 0) + (f.period !== 'all' ? 1 : 0);
    return `<div class="sports-filters sports-native-filters" role="group" aria-label="Filtres sports">
      <label class="sports-native-search"><span class="sr-only">Chercher une école ou une équipe</span>
        <input type="search" data-sports-search placeholder="Équipe, institution, sport, code…" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search"></label>
      ${sportsFilterRow('Sport', 'sport', sports, f.sport)}
      ${sportsFilterRow('Catégorie', 'sex', [['all', 'Tous'], ['f', 'Féminin'], ['m', 'Masculin'], ['x', 'Mixte']], f.sex)}
      ${sportsFilterRow('Secteur', 'sector', [['all', 'Tous'], ['collegial', 'Collégial'], ['universitaire', 'Universitaire']], f.sector)}
      ${sportsFilterRow('Période', 'period', SPORTS_PERIODS, f.period)}
      ${active ? '<button type="button" class="sports-native-reset" data-sports-reset>Réinitialiser les filtres</button>' : ''}
    </div>`;
  }

  function sportsGlyphFor(sport) {
    const s = String(sport || '').toLowerCase();
    const hit = SPORTS_GLYPHS.find(([key]) => s.includes(key));
    return hit ? hit[1] : '🏅';
  }

  function sportsDataUrls() {
    const inSource = /\/mobile\/app\/?/.test(location.pathname);
    const local = inSource ? '../../sports-masthead.json' : './site/sports-masthead.json';
    const native = window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
    return native ? [SPORTS_LIVE_URL, local] : [local, SPORTS_LIVE_URL];
  }

  async function loadSportsData() {
    if (sportsState.loading) return;
    sportsState.loading = true;
    for (const url of sportsDataUrls()) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.teams) { sportsState.data = data; sportsState.error = false; break; }
      } catch { /* source suivante */ }
    }
    if (!sportsState.data) sportsState.error = true;
    sportsState.loading = false;
    const screen = document.getElementById('screen');
    if (screen && location.hash.startsWith('#/sports')) {
      const holder = screen.querySelector('[data-sports-board]');
      if (holder) holder.outerHTML = sportsBoard();
      const wrap = screen.querySelector('[data-sports-filters-wrap]');
      if (wrap) wrap.innerHTML = sportsFiltersHtml();
    }
  }

  function sportsGameMsOf(game) {
    const t = Date.parse(`${game.date}T${game.time && /^\d\d:\d\d/.test(game.time) ? game.time : '12:00'}:00-04:00`);
    return Number.isNaN(t) ? 0 : t;
  }

  function sportsDayLabel(game) {
    const key = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const today = key(Date.now());
    const day = String(game.date || '');
    if (day === today) return "Aujourd’hui";
    if (day === key(Date.now() + 864e5)) return 'Demain';
    if (day === key(Date.now() - 864e5)) return 'Hier';
    const t = Date.parse(`${day}T12:00:00-04:00`);
    return Number.isNaN(t) ? day : new Date(t).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Toronto' });
  }

  function sportsClock(game) {
    const m = /^(\d\d):(\d\d)/.exec(game.time || '');
    return m ? `${Number(m[1])} h ${m[2]}` : '';
  }

  function sportsGameRow(game, next) {
    const hasScore = Number.isFinite(game.scoreFor) && Number.isFinite(game.scoreAgainst);
    const result = String(game.result || '').toUpperCase();
    const cls = next ? 'sports-result--next' : (['W', 'L', 'D', 'T'].includes(result) ? `sports-result--${result}` : '');
    const score = next
      ? '<span class="sports-result__score sports-result__score--next" aria-label="À venir">À venir</span>'
      : `<span class="sports-result__score">${hasScore ? `${esc(game.scoreFor)}–${esc(game.scoreAgainst)}` : (game.place ? esc(`${game.place}e`) : 'Résultat à venir')}</span>`;
    const badge = next ? '→' : ({ W: 'V', L: 'D', D: 'N', T: 'N' }[result] || '');
    const opp = game.opponent || game.event || '';
    return `<li class="sports-result ${cls}">
      <time class="sports-result__time" datetime="${esc(game.date || '')}"><span class="sports-result__day">${esc(sportsDayLabel(game))}</span><span class="sports-result__clock">${esc(sportsClock(game))}</span></time>
      ${score}
      <span class="sports-result__title">${opp ? `<span class="sports-result__vs">vs</span> <span class="sports-result__opp">${esc(opp)}</span>` : ''}${game.opponentFullName ? `<span class="sports-result__opp-full">${esc(game.opponentFullName)}</span>` : ''}${opp && typeof game.home === 'boolean' ? `<span class="sports-result__venue">${game.home ? 'domicile' : 'extérieur'}</span>` : ''}</span>
      <span class="sports-result__badge${next ? ' sports-result__badge--next' : ''}">${esc(badge)}</span>
    </li>`;
  }

  function sportsPanel(team, games, next) {
    const color = core().institutionColor(state.brand, team.fullName) || core().institutionColor(state.brand, team.name) || '';
    const sex = String(team.sex || '').toUpperCase();
    const sexHtml = sex === 'F' ? '<span class="sports-panel__sex sports-panel__sex--f">Féminin</span>'
      : sex === 'M' ? '<span class="sports-panel__sex sports-panel__sex--m">Masculin</span>' : '';
    const sector = team.sector === 'universitaire' ? 'Universitaire' : team.sector === 'collegial' ? 'Collégial' : '';
    const meta = [team.sportLabel || team.sport, team.division, sector].filter(Boolean).join(' · ');
    return `<section class="sports-panel"${color ? ` style="--sports-panel-c:${esc(color)}"` : ''}>
      <header class="sports-panel__head">
        <span class="sports-panel__glyph" aria-hidden="true">${sportsGlyphFor(team.sport)}</span>
        <div class="sports-panel__identity">
          <h3 class="sports-panel__name"><span class="sports-panel__brand">${esc(team.name || team.code || '')}</span> ${sexHtml}</h3>
          ${team.fullName && team.fullName !== team.name ? `<p class="sports-panel__school">${esc(team.fullName)}</p>` : ''}
          <p class="sports-panel__meta">${esc(meta)}</p>
        </div>
      </header>
      <ul class="sports-panel__list">${games.map((g) => sportsGameRow(g, next)).join('')}</ul>
    </section>`;
  }

  function sportsBoard() {
    if (!sportsState.data) {
      return `<div data-sports-board class="sports-native-empty">${sportsState.error ? 'Sports indisponibles pour le moment.' : 'Chargement des sports…'}</div>`;
    }
    const now = Date.now();
    const live = sportsState.period === 'live';
    const next = live || sportsState.tab === 'avenir';
    const range = live ? null : sportsPeriodRange(sportsState.period);
    const panels = [];
    const seen = new Set();
    for (const team of Object.values(sportsState.data.teams || {})) {
      if (!sportsTeamMatches(team)) continue;
      const pool = next ? (team.nextGames || []) : (team.results || []);
      const games = pool.filter((g) => {
        if (g.priorSeason) return false;
        const ms = sportsGameMsOf(g);
        if (live) return ms <= now + SPORTS_LIVE_LEAD_MS && ms >= now - SPORTS_LIVE_TAIL_MS;
        if (next ? ms < now - 3 * 36e5 : ms > now) return false;
        return !range || (g.date >= range.start && g.date <= range.end);
      }).sort((x, y) => next ? sportsGameMsOf(x) - sportsGameMsOf(y) : sportsGameMsOf(y) - sportsGameMsOf(x)).slice(0, 3);
      if (!games.length) continue;
      const stamp = `${team.name}|${team.sport}|${team.sex}|${games[0].date}|${games[0].opponent}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      panels.push({ team, games, ms: sportsGameMsOf(games[0]) });
    }
    panels.sort((x, y) => next ? x.ms - y.ms : y.ms - x.ms);
    const list = panels.slice(0, sportsState.limit);
    const count = `<p class="sports-native-count">${panels.length} équipe${panels.length > 1 ? 's' : ''}</p>`;
    const more = panels.length > list.length
      ? `<button type="button" class="wide" data-sports-more>Afficher plus (${panels.length - list.length})</button>` : '';
    const body = list.length
      ? count + list.map((p) => sportsPanel(p.team, p.games, next)).join('') + more
      : `<p class="sports-native-empty">${live ? 'Aucun match en cours.' : next ? 'Aucun match à venir pour ces filtres.' : 'Aucun résultat pour ces filtres.'}</p>`;
    return `<div data-sports-board class="sports-native">${body}</div>`;
  }

  function viewSports() {
    if (!sportsState.data && !sportsState.loading) loadSportsData();
    const tab = sportsState.tab;
    return `<h1 class="sports-native-title">Sports collégiaux et universitaires du Québec</h1>
      <nav class="chips" aria-label="Sports">
        <button type="button" data-action="sports-tab" data-tab="resultats" aria-pressed="${tab === 'resultats'}">Résultats</button>
        <button type="button" data-action="sports-tab" data-tab="avenir" aria-pressed="${tab === 'avenir'}">À venir</button>
      </nav>
      <div data-sports-filters-wrap>${sportsFiltersHtml()}</div>
      ${sportsBoard()}
      <a class="wide link" data-action="external" href="https://le-radar.ca/sports/" target="_blank" rel="noopener noreferrer">Ouvrir la page Sports complète dans le navigateur</a>`;
  }

  function viewSettings() {
    const prefs = loadPrefs();
    const theme = prefs.theme;
    const hidden = state.sources.filter((source) => prefs.hidden.includes(source.id));
    const confirmAll = state.confirm === 'all'
      ? '<button type="button" class="danger" data-action="confirm-clear" data-target="all">Confirmer l’effacement de tout</button>'
      : '<button type="button" data-action="ask-clear" data-target="all">Effacer toutes les données de l’application</button>';
    return `<h1>Réglages</h1>
      <section>
        <h2 class="section">Mes articles</h2>
        <a class="wide link" href="#/enregistres">Articles enregistrés et historique</a>
      </section>
      <section>
        <h2 class="section">Thème</h2>
        <div class="row-actions" role="group" aria-label="Thème">
          ${['system', 'light', 'dark'].map((value) => {
            const label = { system: 'Système', light: 'Clair', dark: 'Sombre' }[value];
            return `<button type="button" data-action="theme" data-value="${value}" aria-pressed="${theme === value ? 'true' : 'false'}">${label}</button>`;
          }).join('')}
        </div>
      </section>
      <section>
        <h2 class="section">Sources masquées</h2>
        ${hidden.length ? `<ul class="plain">${hidden.map((source) => `<li class="source-row"><span class="article-source">${esc(source.name)}</span><button type="button" data-action="hide" data-id="${esc(source.id)}">Réafficher</button></li>`).join('')}</ul>` : '<p class="note">Aucune source masquée.</p>'}
      </section>
      <section id="news-alerts"><h2 class="section">Notifications</h2></section>
      <section>
        <h2 class="section">Vie privée</h2>
        <p class="note">Pas de compte, pas de publicité, pas de mesure d’audience dans l’application. Favoris, suivis et historique restent dans ce navigateur ou cette application. Charger le fil contacte le-radar.ca. Les images et les articles originaux sont demandés aux publications, qui voient alors une requête HTTPS ordinaire.</p>
        <a class="wide link" data-action="external" href="https://le-radar.ca/" target="_blank" rel="noopener noreferrer">Ouvrir le-radar.ca</a>
        <a class="wide link" data-action="external" href="https://github.com/azdak919/le-radar" target="_blank" rel="noopener noreferrer">Code source</a>
        <a class="wide link" data-action="external" href="https://keepandroidopen.org/fr/" target="_blank" rel="noopener noreferrer">Garder Android ouvert</a>
        <p class="note">Campagne contre la vérification obligatoire des développeurs Google, soutenue par F-Droid.</p>
      </section>
      <section>
        <h2 class="section">Données locales</h2>
        ${confirmAll}
      </section>
      <p class="note"><span>Version </span><span class="notranslate">${esc(core().APP_VERSION)}</span><span> · application de découverte, distincte du site.</span></p>`;
  }

  function viewArticle(route) {
    const meta = findArticle(route.id);
    if (!meta) {
      return `<p class="back"><a href="#/accueil">Retour au fil</a></p>
        <h1>Fiche introuvable</h1>
        <p class="empty">Cet article n’est plus dans le fil chargé, ni dans les favoris.</p>`;
    }
    const action = core().publisherAction(meta);
    const saved = core().isFavorite(loadLibrary(), meta.id);
    const followed = meta.source ? followIds().includes(core().slugify(meta.source)) : false;
    return `<p class="back"><a href="#/accueil">Retour au fil</a></p>
      <article class="fiche">
        <p class="card-source">${swatch(meta.institution)}<span class="${meta.source ? 'article-source' : ''}">${esc(meta.source || 'Publication')}</span></p>
        <h1>${esc(displayTitle(meta.title))}</h1>
        <p class="card-meta"><time class="notranslate" datetime="${esc(meta.date)}">${esc(formatDate(meta.date))}</time>${meta.author ? ` · <span class="article-author">${esc(meta.author)}</span>` : ''}</p>
        ${imageHtml(meta)}
        ${displayExcerpt(meta) ? `<p class="excerpt">${esc(displayExcerpt(meta))}</p>` : ''}
        <p class="attribution"><span>Cet article est publié par </span><span class="${meta.source ? 'article-source' : ''}">${esc(meta.source || 'la publication d’origine')}</span><span>. </span><span>LE-RADAR ne le reproduit pas et n’en est pas l’auteur.</span></p>
        <a class="wide primary" data-action="read" data-id="${meta.id}" href="${esc(action.url)}" target="_blank" rel="noopener noreferrer">${esc(action.label)}</a>
        <div class="row-actions">
          <button type="button" data-action="save" data-id="${meta.id}" aria-pressed="${saved ? 'true' : 'false'}">${saved ? 'Enregistré' : 'Enregistrer'}</button>
          <button type="button" data-action="share-original" data-id="${meta.id}">Partager l’original</button>
          <button type="button" data-action="share-discovery" data-id="${meta.id}">Partager la fiche</button>
          ${meta.source ? `<button type="button" data-action="follow" data-name="${esc(meta.source)}" aria-pressed="${followed ? 'true' : 'false'}">${followed ? 'Suivi' : 'Suivre'}</button>` : ''}
        </div>
      </article>`;
  }

  function tabId(route) {
    if (route.kind === 'home' || route.kind === 'article') return 'accueil';
    if (route.kind === 'search') return 'recherche';
    if (route.kind === 'saved') return 'enregistres';
    if (route.kind === 'settings') return 'reglages';
    if (route.kind === 'sports') return 'sports';
    return 'explorer';
  }

  function routeKey(route) {
    return [route.kind, route.id || '', route.slug || '', route.tab || '', route.filter || '', route.institution || '', route.section || ''].join('|');
  }

  function syncTabs(route) {
    const current = tabId(route);
    for (const link of document.querySelectorAll('#tabs a')) {
      if (link.dataset.tab === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  const MASTHEAD_DATE_FORMATS = [
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' },
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' },
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Toronto' },
    { dateStyle: 'short', timeZone: 'America/Toronto' },
    { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Toronto' },
    { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'America/Toronto' },
    { month: 'numeric', day: 'numeric', timeZone: 'America/Toronto' },
  ];
  let mastheadDateLabelKey = '';

  function mastheadLocale() {
    let tag = null;
    try {
      const mode = window.RadarTranslate && window.RadarTranslate.getMode && window.RadarTranslate.getMode();
      if (mode && mode !== 'original') tag = mode === 'fr' ? 'fr-CA' : mode === 'en' ? 'en-CA' : mode;
    } catch { /* module pas prêt */ }
    if (!tag) {
      tag = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en-CA' : 'fr-CA';
    }
    try {
      if (!Intl.DateTimeFormat.supportedLocalesOf(tag).length) return 'fr-CA';
    } catch { return 'fr-CA'; }
    return tag;
  }

  function mastheadDateChipFits(dateEl) {
    if (!dateEl) return true;
    if (dateEl.scrollWidth > dateEl.clientWidth + 1) return false;
    const host = dateEl.closest('.masthead-date');
    if (!host) return true;
    const hostBox = host.getBoundingClientRect();
    if (hostBox.width < 1) return false;
    const actions = document.querySelector('.masthead-actions');
    if (actions) {
      const actionsBox = actions.getBoundingClientRect();
      const sameRow = actionsBox.top < hostBox.bottom - 1 && actionsBox.bottom > hostBox.top + 1;
      if (actionsBox.width > 0 && sameRow && hostBox.right > actionsBox.left + 1) return false;
    }
    const timeEl = document.getElementById('today-time');
    if (timeEl) {
      const timeBox = timeEl.getBoundingClientRect();
      if (timeBox.width > 1 && timeBox.right > hostBox.right + 1) return false;
      if (timeEl.scrollWidth > timeEl.clientWidth + 1) return false;
    }
    return true;
  }

  function renderTodayDate() {
    const dateEl = document.getElementById('today-date');
    const timeEl = document.getElementById('today-time');
    if (!dateEl && !timeEl) return;
    const now = new Date();
    const locale = mastheadLocale();
    const isEnglish = locale.toLowerCase().startsWith('en');
    if (timeEl) {
      const rawClock = now.toLocaleTimeString(isEnglish ? 'en-CA' : 'fr-CA', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'America/Toronto',
      });
      timeEl.dateTime = now.toLocaleTimeString('en-CA', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Toronto',
      });
      if (isEnglish) {
        timeEl.textContent = rawClock.replace(/\s*h\s*/iu, ':').replace(/(\d{1,2})\s*[:.]\s*(\d{2})/, '$1:$2').trim();
      } else {
        timeEl.textContent = rawClock
          .replace(/(\d{1,2})\s*[:.]\s*(\d{2})/, '$1 h $2')
          .replace(/\s*h\s*/iu, ' h ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    if (dateEl) {
      const host = dateEl.closest('.masthead-date');
      if (host) host.style.minWidth = '';
      for (const options of MASTHEAD_DATE_FORMATS) {
        dateEl.textContent = now.toLocaleDateString(locale, options);
        void dateEl.offsetWidth;
        if (mastheadDateChipFits(dateEl)) break;
      }
    }
    const dateKey = (dateEl && dateEl.textContent) || '';
    const dateChanged = dateKey !== mastheadDateLabelKey;
    mastheadDateLabelKey = dateKey;
    if (dateChanged && typeof scheduleMastheadWeatherLayout === 'function') {
      window.setTimeout(() => scheduleMastheadWeatherLayout(), 0);
    }
  }

  function sloganLineWidth(pill) {
    const parts = [...pill.querySelectorAll('.wordmark-full__lead, .wordmark-full__tag')];
    const style = getComputedStyle(pill);
    if (style.flexDirection === 'row' && parts.length) {
      const gap = parseFloat(style.gap) || 0;
      return parts.reduce((sum, el) => sum + el.scrollWidth, 0) + gap * Math.max(0, parts.length - 1);
    }
    let widest = 0;
    for (const el of parts) widest = Math.max(widest, el.scrollWidth);
    return Math.max(widest, pill.scrollWidth);
  }

  function fitMastheadSlogan() {
    const pill = document.querySelector('.wordmark-full');
    if (!pill || !pill.getClientRects().length) return;
    pill.style.fontSize = '';
    pill.style.letterSpacing = '';
    void pill.offsetWidth;
    const style = getComputedStyle(pill);
    const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const parentW = (pill.parentElement && pill.parentElement.getBoundingClientRect().width) || window.innerWidth;
    let maxW = parseFloat(style.maxWidth);
    if (!Number.isFinite(maxW) || style.maxWidth === 'none') maxW = parentW;
    const cap = Math.max(48, Math.min(maxW, parentW) - pad - border);
    let size = parseFloat(style.fontSize) || 11;
    let tracking = parseFloat(style.letterSpacing);
    if (!Number.isFinite(tracking)) tracking = 0;
    let guard = 48;
    while (sloganLineWidth(pill) > cap + 1 && guard--) {
      if (tracking > 0.2) {
        tracking = Math.max(0, tracking - 0.3);
        pill.style.letterSpacing = `${tracking}px`;
      } else if (size > 8) {
        size = Math.max(8, size - 0.25);
        pill.style.fontSize = `${size}px`;
      } else break;
      void pill.offsetWidth;
    }
  }

  window.renderTodayDate = renderTodayDate;
  window.fitMastheadSlogan = fitMastheadSlogan;

  function syncChromeAria() {
    const stop = document.querySelector('[data-action="player-stop"]');
    if (stop) stop.setAttribute('aria-label', uiText('Arrêter la radio'));
    const bar = document.getElementById('player');
    if (bar) bar.setAttribute('aria-label', uiText('Radio'));
    const tabs = document.getElementById('tabs');
    if (tabs) tabs.setAttribute('aria-label', uiText('Sections de l’application'));
    const skip = document.querySelector('a.skip');
    if (skip) skip.textContent = uiText('Aller au contenu');
    renderTodayDate();
    const route = core().parseDeepLink(location.href);
    const onHome = route.kind === 'home';
    const homeIcon = document.querySelector('.masthead-home');
    if (homeIcon) {
      if (onHome) homeIcon.setAttribute('aria-current', 'page');
      else homeIcon.removeAttribute('aria-current');
    }
    const sectionHref = onHome
      ? '#/accueil'
      : (route.kind === 'explorer' && route.section === 'radios' ? '#/explorer?section=radios' : '');
    for (const link of document.querySelectorAll('.site-sections a')) {
      if (sectionHref && link.getAttribute('href') === sectionHref) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const theme = loadPrefs().theme;
    const themeButton = document.getElementById('theme-toggle');
    if (themeButton) {
      const full = { system: 'Thème : système', light: 'Thème : clair', dark: 'Thème : sombre' }[theme] || 'Thème : système';
      const short = { system: 'Système', light: 'Clair', dark: 'Sombre' }[theme] || 'Système';
      const label = uiText(full);
      themeButton.setAttribute('aria-label', label);
      themeButton.setAttribute('title', label);
      const text = themeButton.querySelector('.theme-toggle__label');
      if (text) text.textContent = uiText(short);
    }
  }

  function applyTheme() {
    const theme = loadPrefs().theme;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (
      theme === 'system'
      && window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    const sun = document.querySelector('#theme-toggle .ico-sun');
    const moon = document.querySelector('#theme-toggle .ico-moon');
    if (sun) sun.classList.toggle('hidden', !dark);
    if (moon) moon.classList.toggle('hidden', dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e0f12' : '#ffffff');
    const status = plugin('StatusBar');
    if (isNative() && status && status.setStyle) {
      status.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
      if (status.setBackgroundColor) {
        status.setBackgroundColor({ color: dark ? '#0e0f12' : '#ffffff' }).catch(() => {});
      }
    }
  }

  function noteView(route) {
    if (route.kind !== 'article') {
      state.recorded = '';
      return;
    }
    if (state.recorded === route.id) return;
    const article = findArticle(route.id);
    if (!article) return;
    saveLibrary(core().recordView(loadLibrary(), article));
    state.recorded = route.id;
  }

  function render() {
    const route = core().parseDeepLink(location.href);
    if (route.kind !== 'settings' && route.kind !== 'saved') state.confirm = '';
    noteView(route);
    const screen = document.getElementById('screen');
    const net = document.getElementById('net');
    const key = routeKey(route);
    const same = key === state.routeKey;
    if (!same) state.visible = 40;
    const y = window.scrollY;
    let html = '';
    if (route.kind === 'explorer' || route.kind === 'institution') {
      html = viewExplorer(route.kind === 'institution' ? { section: 'sources', institution: route.slug } : route);
    } else if (route.kind === 'journal') html = viewJournal(route);
    else if (route.kind === 'radio') html = viewRadio(route);
    else if (route.kind === 'search') html = viewSearch(route);
    else if (route.kind === 'saved') html = viewSaved(route);
    else if (route.kind === 'settings') html = viewSettings();
    else if (route.kind === 'sports') html = viewSports();
    else if (route.kind === 'article') html = viewArticle(route);
    else html = viewHome(route);
    if (screen) screen.innerHTML = html;
    if (route.kind === 'settings' && window.RadarNewsAlerts && window.RadarNewsAlerts.mount) window.RadarNewsAlerts.mount();
    syncPlayer();
    if (net) {
      const offline = !state.online || state.feedOrigin === 'snapshot' || state.feedOrigin === 'bundle' || state.feedOrigin === 'empty';
      net.textContent = offline
        ? (state.feedOrigin === 'empty'
          ? 'Aucun fil disponible hors ligne.'
          : 'Copie locale du fil. Les articles originaux demandent une connexion.')
        : '';
    }
    document.body.classList.toggle('is-home', route.kind === 'home');
    const homeWire = document.getElementById('home-wire');
    if (homeWire) homeWire.hidden = route.kind !== 'home';
    const homeCount = document.getElementById('home-count');
    if (homeCount && route.kind === 'home') homeCount.textContent = state.homeCountLabel || '';
    syncTabs(route);
    syncChromeAria();
    applyTheme();
    fitMastheadSlogan();
    if (!same) {
      state.routeKey = key;
      window.scrollTo(0, 0);
      const title = route.kind === 'home'
        ? document.getElementById('wire-title')
        : screen && screen.querySelector('h1');
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    } else {
      window.scrollTo(0, y);
    }
  }

  function closeInstallMenu() {
    const menu = document.querySelector('[data-install-menu]');
    const panel = document.getElementById('install-menu-panel');
    const toggle = document.querySelector('[data-install-toggle]');
    if (menu) menu.classList.remove('is-open');
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function siteUrl(href) {
    if (!href) return '';
    if (/^https?:/i.test(href)) return href;
    if (href.startsWith('/')) return `https://le-radar.ca${href}`;
    return '';
  }

  /* Fond « verre » : recopie la photo du mât affichée (#bg-photo-layer)
     dès qu’elle est chargée ; suit ses changements, sans seconde rotation. */
  function bindGlassBackground() {
    const glass = document.getElementById('app-glass-bg');
    if (!glass || typeof MutationObserver !== 'function') return;
    let layer = null;
    const sync = () => {
      if (!layer || !layer.classList.contains('loaded')) return;
      const url = layer.style.backgroundImage || getComputedStyle(layer).backgroundImage;
      if (!url || url === 'none') return;
      glass.style.setProperty('--glass-photo', url);
      glass.classList.add('is-ready');
      document.body.classList.add('has-glass');
    };
    const attach = () => {
      layer = document.getElementById('bg-photo-layer');
      if (!layer) return false;
      new MutationObserver(sync).observe(layer, { attributes: true, attributeFilter: ['class', 'style'] });
      sync();
      return true;
    };
    if (!attach()) {
      const wait = new MutationObserver(() => { if (attach()) wait.disconnect(); });
      wait.observe(document.body, { childList: true, subtree: true });
    }
  }

  function bindEvents() {
    document.addEventListener('input', (event) => {
      const box = event.target.closest && event.target.closest('[data-sports-search]');
      if (!box) return;
      sportsState.q = box.value.slice(0, 80);
      sportsState.limit = SPORTS_PAGE;
      saveSportsFilters();
      const holder = document.querySelector('[data-sports-board]');
      if (holder) holder.outerHTML = sportsBoard();
    });
    document.addEventListener('click', async (event) => {
      const sportsTab = event.target.closest('[data-action="sports-tab"]');
      if (sportsTab) {
        event.preventDefault();
        sportsState.tab = sportsTab.getAttribute('data-tab') === 'avenir' ? 'avenir' : 'resultats';
        sportsState.limit = SPORTS_PAGE;
        saveSportsFilters();
        render();
        return;
      }
      const sportsFilter = event.target.closest('[data-sports-filter]');
      if (sportsFilter) {
        event.preventDefault();
        sportsState[sportsFilter.getAttribute('data-sports-filter')] = sportsFilter.getAttribute('data-value') || 'all';
        sportsState.limit = SPORTS_PAGE;
        saveSportsFilters();
        render();
        return;
      }
      if (event.target.closest('[data-sports-reset]')) {
        event.preventDefault();
        Object.assign(sportsState, { sport: 'all', sector: 'all', sex: 'all', period: 'all', q: '', limit: SPORTS_PAGE });
        saveSportsFilters();
        render();
        return;
      }
      if (event.target.closest('[data-sports-more]')) {
        event.preventDefault();
        sportsState.limit += SPORTS_PAGE;
        const holder = document.querySelector('[data-sports-board]');
        if (holder) holder.outerHTML = sportsBoard();
        return;
      }
      const installItem = event.target.closest('[data-install-app]');
      if (installItem) {
        event.preventDefault();
        closeInstallMenu();
        const urls = {
          pomo: 'https://le-radar.ca/pomo/',
          solitaire: 'https://le-radar.ca/solitaire/',
          sports: 'https://le-radar.ca/sports/',
        };
        const url = urls[installItem.getAttribute('data-install-app')];
        if (url) await openExternal(url);
        return;
      }
      const installToggle = event.target.closest('[data-install-toggle]');
      if (installToggle) {
        event.preventDefault();
        const panel = document.getElementById('install-menu-panel');
        const menu = installToggle.closest('[data-install-menu]');
        const open = panel ? panel.hidden : false;
        closeInstallMenu();
        if (open && panel && menu) {
          panel.hidden = false;
          menu.classList.add('is-open');
          installToggle.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      if (!event.target.closest('[data-install-menu]')) closeInstallMenu();

      const blank = event.target.closest('a[target="_blank"]');
      if (blank && !blank.dataset.action) {
        const url = siteUrl(blank.getAttribute('href'));
        if (url) {
          event.preventDefault();
          await openExternal(url);
          return;
        }
      }

      const el = event.target.closest('[data-action], a[href^="#/"]');
      if (!el) return;
      const action = el.dataset.action || '';
      if (action === 'external' || action === 'read') {
        event.preventDefault();
        if (action === 'read') {
          const article = findArticle(el.dataset.id);
          const info = article && core().publisherAction(article);
          if (info) await openExternal(info.url);
          return;
        }
        await openExternal(el.getAttribute('href'));
        return;
      }
      if (action === 'tuner-play') {
        event.preventDefault();
        const select = document.getElementById('tuner-select');
        const id = (select && select.value) || state.tunedId || (state.radios[0] && state.radios[0].id);
        if (!id) return;
        state.tunedId = id;
        toggleRadio(id);
        haptic();
        return;
      }
      if (action === 'tuner-step') {
        event.preventDefault();
        stepTuner(el.dataset.dir === 'prev' ? -1 : 1);
        haptic();
        return;
      }
      if (action === 'radio-toggle' || action === 'player-toggle') {
        event.preventDefault();
        toggleRadio(action === 'radio-toggle' ? el.dataset.id : barStationId());
        haptic();
        return;
      }
      if (action === 'player-stop') {
        event.preventDefault();
        stopRadio();
        announce('Radio arrêtée.');
        return;
      }
      if (action === 'save') {
        const article = findArticle(el.dataset.id);
        if (!article) return;
        const library = loadLibrary();
        saveLibrary(core().isFavorite(library, article.id)
          ? core().removeFavorite(library, article.id)
          : core().addFavorite(library, article));
        haptic();
        announce(core().isFavorite(loadLibrary(), article.id) ? 'Ajouté aux favoris.' : 'Retiré des favoris.');
        render();
        return;
      }
      if (action === 'share-original' || action === 'share-discovery') {
        const article = findArticle(el.dataset.id);
        const payload = action === 'share-discovery'
          ? core().shareDiscovery(article)
          : core().shareOriginal(article);
        haptic();
        await share(payload);
        return;
      }
      if (action === 'follow') {
        const store = window.MediaFollowStore;
        if (store && store.toggle) store.toggle(el.dataset.name || '');
        haptic();
        render();
        return;
      }
      if (action === 'hide') {
        const prefs = loadPrefs();
        const id = el.dataset.id;
        savePrefs(core().setHidden(prefs, id, !core().isHidden(prefs, id)));
        render();
        return;
      }
      if (action === 'more') {
        state.visible += 40;
        render();
        return;
      }
      if (action === 'theme' || action === 'theme-cycle') {
        const order = ['system', 'light', 'dark'];
        const current = loadPrefs().theme;
        const next = action === 'theme'
          ? el.dataset.value
          : order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
        savePrefs(core().setTheme(loadPrefs(), next));
        render();
        return;
      }
      if (action === 'ask-clear') {
        state.confirm = el.dataset.target || '';
        render();
        return;
      }
      if (action === 'confirm-clear') {
        const target = el.dataset.target;
        if (target === 'favoris') saveLibrary(core().clearFavorites(loadLibrary()));
        else if (target === 'historique') saveLibrary(core().clearHistory(loadLibrary()));
        else if (target === 'all') {
          storage().removeItem(core().LIBRARY_KEY);
          storage().removeItem(core().PREFS_KEY);
          storage().removeItem(core().SNAPSHOT_KEY);
          if (window.MediaFollowStore && window.MediaFollowStore.list) {
            for (const id of followIds()) {
              if (window.MediaFollowStore.toggle) window.MediaFollowStore.toggle(id);
            }
          }
        }
        state.confirm = '';
        announce('Données effacées sur cet appareil.');
        render();
      }
    });

    document.addEventListener('input', (event) => {
      if (event.target.id === 'q') {
        state.query = event.target.value;
        state.queryEdited = true;
        const start = event.target.selectionStart;
        render();
        const again = document.getElementById('q');
        if (again) {
          again.focus();
          if (typeof start === 'number') again.setSelectionRange(start, start);
        }
      }
      if (event.target.id === 'source-q') {
        state.sourceQuery = event.target.value;
        const start = event.target.selectionStart;
        render();
        const again = document.getElementById('source-q');
        if (again) {
          again.focus();
          if (typeof start === 'number') again.setSelectionRange(start, start);
        }
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target.id === 'tuner-select') {
        state.tunedId = event.target.value;
        if (player.id && playerBusy() && event.target.value) playRadio(event.target.value);
        else syncPlayer();
        return;
      }
      if (event.target.dataset.action !== 'note') return;
      const key = event.target.dataset.key;
      savePrefs(core().updateNotifications(loadPrefs(), { [key]: event.target.checked }));
      announce('Choix enregistré sur cet appareil. Aucun envoi n’est actif.');
    });

    document.addEventListener('error', (event) => {
      const img = event.target;
      if (!img || img.tagName !== 'IMG') return;
      // Photo d’article cassée : on retire le cadre entier (jamais de case vide
      // ni de letterbox), la carte reprend la mise en page texte du site.
      const figure = img.closest('.article-media');
      const card = img.closest('.article');
      if (figure && card) {
        figure.remove();
        card.classList.remove('has-image', 'article--thumb');
        card.classList.add('article--text');
        return;
      }
      img.remove();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeInstallMenu();
    });
  }

  async function consumeUrl(url) {
    const route = core().parseDeepLink(url);
    if (route.kind === 'external') {
      if (route.url) await openExternal(route.url);
      return;
    }
    const hash = core().hashForRoute(route);
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  async function bindNative() {
    if (!isNative()) return;
    const app = plugin('App');
    const splash = plugin('SplashScreen');
    const network = plugin('Network');
    const keyboard = plugin('Keyboard');
    try {
      if (splash && splash.hide) await splash.hide();
    } catch { /* déjà masqué */ }
    try {
      const status = plugin('StatusBar');
      if (status && status.setOverlaysWebView) await status.setOverlaysWebView({ overlay: true });
    } catch { /* barre système par défaut */ }
    applyTheme();
    if (keyboard && keyboard.setResizeMode) {
      try { await keyboard.setResizeMode({ mode: 'body' }); } catch { /* ignore */ }
    }
    if (network && network.addListener) {
      network.addListener('networkStatusChange', (info) => {
        state.online = Boolean(info && info.connected);
        if (state.online) loadData().then(render);
        else render();
      });
    }
    if (app && app.addListener) {
      app.addListener('backButton', () => {
        const route = core().parseDeepLink(location.href);
        if (route.kind === 'home' && !route.filter) {
          // Comme une app de musique : quitter l’accueil pendant l’écoute
          // met l’app en arrière-plan au lieu de couper la radio.
          if (playerBusy() && app.minimizeApp) {
            app.minimizeApp().catch(() => {});
            return;
          }
          if (app.exitApp) app.exitApp();
          return;
        }
        history.back();
      });
      app.addListener('appUrlOpen', (event) => {
        if (event && event.url) consumeUrl(event.url);
      });
    }
    try {
      if (app && app.getLaunchUrl) {
        const launch = await app.getLaunchUrl();
        if (launch && launch.url) await consumeUrl(launch.url);
      }
    } catch { /* pas d’URL d’ouverture */ }
  }

  async function start() {
    if (window.__radarMobileStarted) return;
    window.__radarMobileStarted = true;
    const screen = document.getElementById('screen');
    if (screen) screen.innerHTML = '<p class="loading">Chargement du fil…</p>';
    bindEvents();
    bindGlassBackground();
    bindPlayer();
    const here = document.querySelector('[data-install-app="radar"]');
    if (here) here.classList.add('is-current');
    await loadData();
    window.addEventListener('hashchange', render);
    window.addEventListener('online', () => { state.online = true; loadData().then(render); });
    window.addEventListener('offline', () => { state.online = false; render(); });
    if (window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => applyTheme();
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }
    if (!location.hash) location.replace('#/accueil');
    else render();
    window.setInterval(renderTodayDate, 30000);
    // Rouge « frais » 12 h : fenêtre glissante, page restée ouverte.
    window.setInterval(() => { const lib = cardLib(); if (lib && lib.refreshFreshMarks) lib.refreshFreshMarks(document); }, 60000);
    window.addEventListener('resize', () => {
      renderTodayDate();
      fitMastheadSlogan();
    });
    const photo = document.getElementById('bg-photo-layer');
    if (photo && typeof MutationObserver === 'function') {
      const watch = new MutationObserver(() => fitMastheadSlogan());
      watch.observe(photo, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitMastheadSlogan()).catch(() => {});
    }
    bindNative();
  }

  let translateRefresh = 0;
  window.addEventListener('radar:translate-mode', () => {
    if (!window.__radarMobileStarted) return;
    window.clearTimeout(translateRefresh);
    translateRefresh = window.setTimeout(() => {
      render();
    }, 80);
  });

  window.__radarBoot.then(start).catch((error) => {
    console.error(error);
    const screen = document.getElementById('screen');
    if (screen) screen.textContent = 'Impossible de démarrer l’application.';
  });
}());

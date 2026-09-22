/**
 * Interface téléphone de LE-RADAR.
 * Le site le-radar.ca reste une autre surface : ici, fil personnel,
 * fiches, enregistrements et radios — pas le mât du site.
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
  };

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
    const prefs = core().normalizePrefs(readJson(core().PREFS_KEY, core().emptyPrefs));
    if (!prefs.seenAt) {
      const stamped = core().markSeen(prefs, new Date().toISOString());
      writeJson(core().PREFS_KEY, stamped);
      return stamped;
    }
    return prefs;
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

  function haptic() {
    const haptics = plugin('Haptics');
    try {
      if (haptics && haptics.impact) haptics.impact({ style: 'LIGHT' });
    } catch { /* appareil sans retour haptique */ }
  }

  function announce(message) {
    const node = document.getElementById('status');
    if (node) node.textContent = message || '';
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
    if (!meta.image) return '';
    const alt = meta.source ? `Illustration publiée par ${meta.source}` : 'Illustration de l’article original';
    return `<img class="card-photo" src="${esc(meta.image)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="640" height="427">`;
  }

  function cardHtml(item) {
    const meta = core().articleMeta(item);
    if (!meta) return '';
    const saved = core().isFavorite(loadLibrary(), meta.id);
    const lang = meta.lang === 'en' ? '<span class="lang">EN</span>' : '';
    const author = meta.author ? ` · ${esc(meta.author)}` : '';
    return `<article class="card">
      <a class="card-open" href="#/article/${meta.id}">
        ${imageHtml(meta)}
        <p class="card-source">${swatch(meta.institution)}<span>${esc(meta.source || 'Source')}</span>${lang}</p>
        <h2 class="card-title">${esc(meta.title)}</h2>
        ${meta.excerpt ? `<p class="card-excerpt">${esc(meta.excerpt)}</p>` : ''}
        <p class="card-meta"><time datetime="${esc(meta.date)}">${esc(formatDate(meta.date))}</time>${author}</p>
      </a>
      <div class="card-actions">
        <button type="button" data-action="save" data-id="${meta.id}" aria-pressed="${saved ? 'true' : 'false'}">${saved ? 'Enregistré' : 'Enregistrer'}</button>
        <button type="button" data-action="share-original" data-id="${meta.id}">Partager</button>
      </div>
    </article>`;
  }

  function cardsHtml(items, empty) {
    if (!items.length) return `<p class="empty">${empty}</p>`;
    return `<div class="cards">${items.map(cardHtml).join('')}</div>`;
  }

  function chip(href, label, current) {
    const aria = current ? ' aria-current="page"' : '';
    return `<a href="${href}"${aria}>${label}</a>`;
  }

  function viewHome(route) {
    const follows = followIds();
    const prefs = loadPrefs();
    const mode = core().homeMode(route.filter, follows);
    const modeName = { tout: 'all', suivis: 'follows', mots: 'keywords', regions: 'regions' }[mode] || 'all';
    const filtered = core().filterFeed(state.items, {
      mode: modeName,
      follows,
      hidden: prefs.hidden,
      regions: prefs.regions,
      keywords: prefs.keywords,
    });
    const shown = filtered.slice(0, state.visible);
    const fresh = prefs.seenAt ? core().countFreshFollows(state.items, follows, prefs.seenAt) : 0;
    const freshHtml = fresh
      ? `<p class="banner">${fresh > 1 ? `${fresh} articles` : '1 article'} de vos suivis depuis votre dernière visite. <button type="button" data-action="seen">Marquer comme vu</button></p>`
      : '';
    const empty = {
      tout: 'Aucun article dans le fil pour le moment.',
      suivis: 'Vous ne suivez encore aucun média, ou leurs articles sont masqués. <a href="#/explorer">Choisir des médias</a>.',
      mots: 'Aucun article ne contient vos mots-clés. <a href="#/reglages">Modifier les mots-clés</a>.',
      regions: 'Aucune région suivie, ou aucun article correspondant. <a href="#/explorer?section=regions">Choisir des régions</a>.',
    }[mode];
    const more = shown.length < filtered.length
      ? `<button type="button" class="wide" data-action="more">Afficher la suite (${filtered.length - shown.length})</button>`
      : '';
    return `<h1>Accueil</h1>
      <p class="lede">Journaux, radios et sports étudiants du Québec, réunis au même endroit.</p>
      ${freshHtml}
      <nav class="chips" aria-label="Filtre du fil">
        ${chip('#/accueil?filtre=tout', 'Tout', mode === 'tout')}
        ${chip('#/accueil?filtre=suivis', 'Suivis', mode === 'suivis')}
        ${chip('#/accueil?filtre=regions', 'Régions', mode === 'regions')}
        ${chip('#/accueil?filtre=mots', 'Mots-clés', mode === 'mots')}
      </nav>
      ${cardsHtml(shown, empty)}
      ${more}`;
  }

  function viewExplorer(route) {
    const section = route.section === 'radios' || route.section === 'regions' ? route.section : 'sources';
    const prefs = loadPrefs();
    const query = core().fold(state.sourceQuery);
    const institution = route.institution || '';
    let body = '';
    if (section === 'regions') {
      const regions = [];
      const seen = new Set();
      for (const source of state.sources) {
        if (!source.regionId || seen.has(source.regionId)) continue;
        seen.add(source.regionId);
        regions.push(source);
      }
      regions.sort((a, b) => a.region.localeCompare(b.region, 'fr'));
      body = `<ul class="plain">${regions.map((source) => {
        const on = prefs.regions.includes(source.regionId);
        return `<li class="source-row">
          <span><span class="source-name">${esc(source.region)}</span></span>
          <button type="button" data-action="region" data-id="${esc(source.regionId)}" aria-pressed="${on ? 'true' : 'false'}">${on ? 'Suivie' : 'Suivre'}</button>
        </li>`;
      }).join('')}</ul>`;
    } else if (section === 'radios') {
      body = `<ul class="plain">${state.radios.map((radio) => `<li class="source-row">
        <a href="#/radio/${esc(radio.id)}"><span class="source-name">${esc(radio.name)}</span><span class="source-meta">${esc(radio.institution)}</span></a>
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
              <span class="source-name">${swatch(source.institution)}${esc(source.name)}</span>
              <span class="source-meta">${esc(source.institution)}${source.region ? ` · ${esc(source.region)}` : ''}${hidden ? ' · masqué' : ''}</span>
            </a>
            <button type="button" data-action="follow" data-name="${esc(source.name)}" aria-pressed="${on ? 'true' : 'false'}">${on ? 'Suivi' : 'Suivre'}</button>
          </li>`;
        }).join('')}</ul>` : '<p class="empty">Aucun média ne correspond.</p>'}`;
    }
    return `<h1>Explorer</h1>
      <p class="lede">Suivez un journal, une région ou une radio. Le texte intégral reste chez la publication.</p>
      <nav class="chips" aria-label="Explorer">
        ${chip('#/explorer?section=sources', 'Médias', section === 'sources')}
        ${chip('#/explorer?section=regions', 'Régions', section === 'regions')}
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
      ? `<a class="wide link" data-action="external" href="${esc(source.site)}" target="_blank" rel="noopener noreferrer">Site de ${esc(name)}</a>`
      : '';
    const fiche = `<a class="wide link" data-action="external" href="https://le-radar.ca/journaux/${esc(route.slug)}/" target="_blank" rel="noopener noreferrer">Fiche sur le-radar.ca</a>`;
    return `<p class="back"><a href="#/explorer">Retour à Explorer</a></p>
      <h1>${esc(source ? source.name : 'Média')}</h1>
      <p class="lede">${esc(source ? source.institution : 'Ce média n’est pas dans le registre chargé.')}${source && source.region ? ` · ${esc(source.region)}` : ''}</p>
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
    const audio = radio.stream
      ? `<audio controls preload="none" src="${esc(radio.stream)}">Lecture audio non disponible.</audio>
         <p class="note">La lecture s’arrête quand vous quittez cette fiche. Ce n’est pas une écoute en arrière-plan.</p>`
      : '<p class="note">Pas de flux HTTPS validé. La station s’écoute sur son site.</p>';
    const site = radio.website
      ? `<a class="wide link" data-action="external" href="${esc(radio.website)}" target="_blank" rel="noopener noreferrer">Ouvrir le site de ${esc(radio.name)}</a>`
      : '';
    return `<p class="back"><a href="#/explorer?section=radios">Retour aux radios</a></p>
      <h1>${esc(radio.name)}</h1>
      <p class="lede">${esc(radio.slogan || radio.institution)}${radio.frequency ? ` · ${esc(radio.frequency)}` : ''}</p>
      ${audio}
      ${site}`;
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

  function viewSettings() {
    const prefs = loadPrefs();
    const theme = prefs.theme;
    const hidden = state.sources.filter((source) => prefs.hidden.includes(source.id));
    const notes = prefs.notifications;
    const confirmAll = state.confirm === 'all'
      ? '<button type="button" class="danger" data-action="confirm-clear" data-target="all">Confirmer l’effacement de tout</button>'
      : '<button type="button" data-action="ask-clear" data-target="all">Effacer toutes les données de l’application</button>';
    return `<h1>Réglages</h1>
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
        <h2 class="section">Mots-clés</h2>
        <p class="note">Un mot-clé filtre le fil « Mots-clés ». Il reste sur l’appareil.</p>
        <form id="keyword-form">
          <label class="field" for="keyword">Ajouter un mot-clé</label>
          <div class="row-actions">
            <input id="keyword" name="keyword" type="text" maxlength="40" autocomplete="off">
            <button type="submit">Ajouter</button>
          </div>
        </form>
        <ul class="plain">${prefs.keywords.map((word) => `<li class="source-row"><span>${esc(word)}</span><button type="button" data-action="unkeyword" data-word="${esc(word)}">Retirer</button></li>`).join('')}</ul>
      </section>
      <section>
        <h2 class="section">Sources masquées</h2>
        ${hidden.length ? `<ul class="plain">${hidden.map((source) => `<li class="source-row"><span>${esc(source.name)}</span><button type="button" data-action="hide" data-id="${esc(source.id)}">Réafficher</button></li>`).join('')}</ul>` : '<p class="note">Aucune source masquée.</p>'}
      </section>
      <section>
        <h2 class="section">Notifications</h2>
        <p class="note">Aucun envoi système n’est branché. Ces cases mémorisent un choix sur l’appareil et ne transmettent rien. Le rappel des nouveaux articles de vos suivis s’affiche dans l’accueil.</p>
        ${['follows', 'digest', 'newMedia'].map((key) => {
          const label = {
            follows: 'Nouveautés des médias suivis',
            digest: 'Résumé quotidien',
            newMedia: 'Nouveau média ajouté à LE-RADAR',
          }[key];
          return `<label class="check"><input type="checkbox" data-action="note" data-key="${key}" ${notes[key] ? 'checked' : ''}> ${label}</label>`;
        }).join('')}
        <label class="check"><input type="checkbox" data-action="note" data-key="enabled" ${notes.enabled ? 'checked' : ''}> Autoriser un futur envoi (reste inactif)</label>
      </section>
      <section>
        <h2 class="section">Vie privée</h2>
        <p class="note">Pas de compte, pas de publicité, pas de mesure d’audience dans l’application. Favoris, suivis, historique et mots-clés restent dans ce navigateur ou cette application. Charger le fil contacte le-radar.ca. Les images et les articles originaux sont demandés aux publications, qui voient alors une requête HTTPS ordinaire.</p>
        <a class="wide link" data-action="external" href="https://le-radar.ca/" target="_blank" rel="noopener noreferrer">Ouvrir le-radar.ca</a>
        <a class="wide link" data-action="external" href="https://github.com/azdak919/le-radar" target="_blank" rel="noopener noreferrer">Code source</a>
      </section>
      <section>
        <h2 class="section">Données locales</h2>
        ${confirmAll}
      </section>
      <p class="note">Version ${esc(core().APP_VERSION)} · application de découverte, distincte du site.</p>`;
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
        <p class="card-source">${swatch(meta.institution)}<span>${esc(meta.source || 'Publication')}</span></p>
        <h1>${esc(meta.title)}</h1>
        <p class="card-meta"><time datetime="${esc(meta.date)}">${esc(formatDate(meta.date))}</time>${meta.author ? ` · ${esc(meta.author)}` : ''}</p>
        ${imageHtml(meta)}
        ${meta.excerpt ? `<p class="excerpt">${esc(meta.excerpt)}</p>` : ''}
        <p class="attribution">Cet article est publié par ${esc(meta.source || 'la publication d’origine')}. LE-RADAR ne le reproduit pas et n’en est pas l’auteur.</p>
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

  function applyTheme() {
    const theme = loadPrefs().theme;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (
      theme === 'system'
      && window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
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
    else if (route.kind === 'article') html = viewArticle(route);
    else html = viewHome(route);
    if (screen) screen.innerHTML = html;
    if (net) {
      const offline = !state.online || state.feedOrigin === 'snapshot' || state.feedOrigin === 'bundle' || state.feedOrigin === 'empty';
      net.textContent = offline
        ? (state.feedOrigin === 'empty'
          ? 'Aucun fil disponible hors ligne.'
          : 'Copie locale du fil. Les articles originaux demandent une connexion.')
        : '';
    }
    syncTabs(route);
    applyTheme();
    if (!same) {
      state.routeKey = key;
      window.scrollTo(0, 0);
      const title = screen && screen.querySelector('h1');
      if (title) {
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
      }
    } else {
      window.scrollTo(0, y);
    }
  }

  function bindEvents() {
    document.addEventListener('click', async (event) => {
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
      if (action === 'region') {
        const prefs = loadPrefs();
        const id = el.dataset.id;
        const on = prefs.regions.includes(id);
        savePrefs(core().setRegionFollow(prefs, id, !on));
        haptic();
        render();
        return;
      }
      if (action === 'more') {
        state.visible += 40;
        render();
        return;
      }
      if (action === 'seen') {
        savePrefs(core().markSeen(loadPrefs(), new Date().toISOString()));
        render();
        return;
      }
      if (action === 'theme') {
        savePrefs(core().setTheme(loadPrefs(), el.dataset.value));
        render();
        return;
      }
      if (action === 'unkeyword') {
        savePrefs(core().removeKeyword(loadPrefs(), el.dataset.word || ''));
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

    document.addEventListener('submit', (event) => {
      if (event.target.id !== 'keyword-form') return;
      event.preventDefault();
      const input = event.target.querySelector('input');
      savePrefs(core().addKeyword(loadPrefs(), input && input.value));
      if (input) input.value = '';
      render();
    });

    document.addEventListener('change', (event) => {
      if (event.target.dataset.action !== 'note') return;
      const key = event.target.dataset.key;
      savePrefs(core().updateNotifications(loadPrefs(), { [key]: event.target.checked }));
      announce('Choix enregistré sur cet appareil. Aucun envoi n’est actif.');
    });

    document.addEventListener('error', (event) => {
      if (event.target && event.target.tagName === 'IMG') event.target.remove();
    }, true);
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
    bindNative();
  }

  window.__radarBoot.then(start).catch((error) => {
    console.error(error);
    const screen = document.getElementById('screen');
    if (screen) screen.textContent = 'Impossible de démarrer l’application.';
  });
}());

/**
 * Réglages des notifications de nouveaux articles (Android natif seulement).
 * Le sondage tourne dans l'app (WorkManager, plugin NewsAlerts) : pas de push,
 * pas de compte, aucun service Google. Rien ne quitte l'appareil sauf un GET
 * de https://le-radar.ca/news.json.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarNewsAlerts = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = [['universite', 'Universités'], ['cegep', 'Cégeps']];
  const INTERVALS = [1, 2, 4];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Régions distinctes du fil et des sources, triées (fr). */
  function regionsFrom(items) {
    const set = new Set();
    for (const it of items || []) if (it && typeof it.region === 'string' && it.region.trim()) set.add(it.region.trim());
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function toggle(list, value, on) {
    const next = (list || []).filter((v) => v !== value);
    if (on) next.push(value);
    return next;
  }

  function html(s, regions) {
    if (!s) {
      return '<h2 class="section">Notifications</h2><p class="note">Les notifications de nouveaux articles sont offertes dans l’application Android.</p>';
    }
    const dis = s.enabled ? '' : ' disabled';
    const denied = s.enabled && s.permission !== 'granted'
      ? '<p class="note">Android bloque les notifications de LE-RADAR. <button type="button" data-alerts="permission">Autoriser</button></p>' : '';
    return `<h2 class="section">Notifications</h2>
      <p class="note">L’application vérifie le fil de le-radar.ca à intervalle régulier et vous avertit des nouveaux articles. Pas de compte ni de service Google. Sans case cochée dans une section, tout est inclus.</p>
      <label class="check"><input type="checkbox" data-alerts="enabled" ${s.enabled ? 'checked' : ''}> Avertir des nouveaux articles</label>
      ${denied}
      <div class="row-actions" role="group" aria-label="Fréquence">
        ${INTERVALS.map((h) => `<button type="button" data-alerts="interval" data-value="${h}" aria-pressed="${s.intervalHours === h ? 'true' : 'false'}"${dis}>Aux ${h} h</button>`).join('')}
      </div>
      <label class="check"><input type="checkbox" data-alerts="quiet" ${s.quiet ? 'checked' : ''}${dis}> Silence de ${s.quietStart} h à ${s.quietEnd} h</label>
      <h3 class="section">Types de médias</h3>
      ${TYPES.map(([id, label]) => `<label class="check"><input type="checkbox" data-alerts="type" data-value="${id}" ${s.types.includes(id) ? 'checked' : ''}${dis}> ${label}</label>`).join('')}
      <h3 class="section">Régions</h3>
      ${regions.map((r) => `<label class="check"><input type="checkbox" data-alerts="region" data-value="${esc(r)}" ${s.regions.includes(r) ? 'checked' : ''}${dis}> ${esc(r)}</label>`).join('')}
      <p class="note">Le délai dépend d’Android : comptez jusqu’à l’intervalle choisi, parfois plus en mode économie d’énergie.</p>`;
  }

  const api = { TYPES, INTERVALS, regionsFrom, toggle, html };
  if (typeof window === 'undefined') return api;

  function plugin() {
    const cap = window.Capacitor;
    try {
      if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || cap.getPlatform() !== 'android') return null;
      return (cap.Plugins && cap.Plugins.NewsAlerts) || (cap.registerPlugin ? cap.registerPlugin('NewsAlerts') : null);
    } catch { return null; }
  }

  let settings = null;
  let regions = [];

  async function loadRegions() {
    if (regions.length) return regions;
    const lists = [];
    for (const url of ['./data/news.json', './data/news-sources.json']) {
      try {
        const data = await (await fetch(url)).json();
        lists.push(...(data.items || []), ...(data.active || []));
      } catch { /* copie locale absente */ }
    }
    regions = regionsFrom(lists);
    return regions;
  }

  async function mount() {
    const box = document.getElementById('news-alerts');
    if (!box) return;
    const p = plugin();
    if (p && !settings) {
      try { settings = await p.getSettings(); } catch { settings = null; }
    }
    await loadRegions();
    const target = document.getElementById('news-alerts');
    if (target) target.innerHTML = html(p ? settings : null, regions);
  }

  async function update(patch) {
    const p = plugin();
    if (!p || !settings) return;
    try { settings = await p.setSettings({ ...settings, ...patch }); } catch { /* garde l'état */ }
    mount();
  }

  async function onEnable(on) {
    const p = plugin();
    if (!p) return;
    if (on) {
      try { settings = await p.requestPermission(); } catch { /* refus */ }
    }
    await update({ enabled: on });
  }

  function openLink(link) {
    if (!link) return;
    const core = window.RadarMobile;
    const id = core && core.articleId ? core.articleId(link) : '';
    location.hash = id ? `#/article/${id}` : '#/accueil';
  }

  async function consume() {
    const p = plugin();
    if (!p) return;
    try { openLink((await p.consumeLaunchLink()).link); } catch { /* rien */ }
  }

  document.addEventListener('change', (event) => {
    const el = event.target;
    const kind = el && el.dataset ? el.dataset.alerts : '';
    if (!kind || !settings) return;
    if (kind === 'enabled') onEnable(el.checked);
    else if (kind === 'quiet') update({ quiet: el.checked });
    else if (kind === 'type') update({ types: toggle(settings.types, el.dataset.value, el.checked) });
    else if (kind === 'region') update({ regions: toggle(settings.regions, el.dataset.value, el.checked) });
  });
  document.addEventListener('click', (event) => {
    const el = event.target && event.target.closest ? event.target.closest('button[data-alerts]') : null;
    if (!el) return;
    if (el.dataset.alerts === 'interval') update({ intervalHours: Number(el.dataset.value) });
    else if (el.dataset.alerts === 'permission') onEnable(true);
  });

  const p = plugin();
  if (p && p.addListener) p.addListener('open', () => { consume(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) consume(); });
  window.addEventListener('load', () => setTimeout(consume, 400));

  return { ...api, mount };
}));

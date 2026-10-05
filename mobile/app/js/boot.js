/**
 * Charge Capacitor et le magasin de suivis, puis démarre l’interface.
 * Les deux scripts sont facultatifs : le site web n’a pas capacitor.js,
 * l’application native n’a pas le chemin ../../scripts/.
 */
'use strict';

(function initBoot() {
  function loadScript(src, timeout) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeout);
      script.src = src;
      script.onload = () => {
        clearTimeout(timer);
        finish(true);
      };
      script.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      document.head.appendChild(script);
    });
  }

  function installFollowFallback() {
    if (window.MediaFollowStore) return;
    const key = 'radar-media-follows-v1';
    const slugify = window.RadarMobile.slugify;
    const read = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{"v":1,"ids":[]}');
        return Array.isArray(parsed.ids) ? parsed.ids : [];
      } catch {
        return [];
      }
    };
    const write = (ids) => {
      try { localStorage.setItem(key, JSON.stringify({ v: 1, ids })); } catch { /* quota */ }
    };
    window.MediaFollowStore = {
      STORAGE_KEY: key,
      list() { return read().slice(); },
      isFollowed(id) { return read().includes(slugify(id)); },
      toggle(id) {
        const slug = slugify(id);
        if (!slug) return false;
        const ids = read();
        const has = ids.includes(slug);
        write(has ? ids.filter((item) => item !== slug) : [...ids, slug]);
        return !has;
      },
    };
  }

  window.__radarBoot = (async function boot() {
    await loadScript('./capacitor.js', 2500);
    const bundled = await loadScript('./vendor/media-follow-store.js', 2500);
    if (!window.MediaFollowStore && !bundled) {
      await loadScript('../../scripts/media-follow-store.js', 2500);
    }
    if (!window.MediaFollowStore) installFollowFallback();
  }());
}());

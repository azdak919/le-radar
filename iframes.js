/**
 * Page /iframes/ : copier les snippets, synchro thème clair/sombre.
 */
(function () {
  'use strict';

  function pageTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const idle = btn.getAttribute('data-idle') || btn.textContent.trim() || 'Copier';
    btn.setAttribute('data-idle', idle);
    btn.addEventListener('click', async () => {
      const sel = btn.getAttribute('data-copy');
      const source = sel ? document.querySelector(sel) : null;
      const text = (source?.textContent || '').replace(/^\n+|\n+$/g, '');
      if (!text) return;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.append(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        } catch { /* ignore */ }
      }
      btn.textContent = ok ? (btn.getAttribute('data-copied') || 'Copié') : idle;
      window.setTimeout(() => { btn.textContent = idle; }, 1600);
    });
  });

  function originOf(iframe) {
    try {
      return new URL(iframe.src, location.href).origin;
    } catch {
      return location.origin;
    }
  }

  function syncRadio(iframe) {
    const theme = pageTheme();
    try {
      iframe.contentWindow?.postMessage({ type: 'radar-embed-theme', theme }, originOf(iframe));
    } catch (_) { /* ignore */ }
  }

  function syncSportsAd(iframe) {
    const theme = pageTheme();
    try {
      iframe.contentWindow?.postMessage({ type: 'radar-sports-ad-theme', theme }, originOf(iframe));
    } catch (_) { /* ignore */ }
  }

  function syncAll() {
    document.querySelectorAll('iframe[data-embed-kind="radio"]').forEach(syncRadio);
    document.querySelectorAll('iframe[data-embed-kind="sports-ad"]').forEach(syncSportsAd);
  }

  document.querySelectorAll('iframe[data-embed-kind="radio"], iframe[data-embed-kind="sports-ad"]').forEach((iframe) => {
    try {
      const u = new URL(iframe.getAttribute('src') || iframe.src, location.href);
      u.searchParams.set('theme', pageTheme());
      const cur = iframe.getAttribute('src') || '';
      if (!cur.includes('theme=')) iframe.setAttribute('src', u.pathname + u.search);
    } catch (_) { /* ignore */ }
  });

  document.querySelectorAll('iframe').forEach((iframe) => {
    iframe.addEventListener('load', () => {
      if (iframe.dataset.embedKind === 'radio') syncRadio(iframe);
      if (iframe.dataset.embedKind === 'sports-ad') syncSportsAd(iframe);
    });
  });

  new MutationObserver(syncAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
})();

/**
 * Page /iframes/ : copier le snippet + hauteur auto des aperçus.
 */
(function () {
  'use strict';

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
      window.setTimeout(() => {
        btn.textContent = idle;
      }, 1600);
    });
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data.height !== 'number' || data.height < 40) return;
    const kind = data.type === 'radar-sports-embed'
      ? 'sports'
      : data.type === 'radar-embed'
        ? 'radio'
        : '';
    if (!kind) return;
    document.querySelectorAll(`iframe[data-embed-kind="${kind}"]`).forEach((frame) => {
      if (frame.contentWindow !== event.source) return;
      frame.style.height = `${Math.ceil(data.height)}px`;
    });
  });
})();

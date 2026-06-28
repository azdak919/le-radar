// Hauteur dynamique de l'iframe embed (popover volume, etc.)
(function () {
  if (document.documentElement.dataset.embed !== 'tuner') return;

  function postHeight() {
    const tuner = document.getElementById('tuner');
    if (!tuner) return;

    let height = Math.ceil(tuner.getBoundingClientRect().height);
    const vol = document.getElementById('tuner-vol');
    const slot = document.getElementById('tuner-vol-slot');

    if (vol?.classList.contains('is-open') && slot) {
      const tunerRect = tuner.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      height = Math.ceil(tunerRect.bottom - Math.min(tunerRect.top, slotRect.top) + 8);
    }

    parent.postMessage({ type: 'ataraxia-radar-embed', height }, '*');
  }

  function schedule() {
    requestAnimationFrame(() => requestAnimationFrame(postHeight));
  }

  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);

  const tuner = document.getElementById('tuner');
  if (tuner && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(schedule).observe(tuner);
  }

  const vol = document.getElementById('tuner-vol');
  if (vol && typeof MutationObserver !== 'undefined') {
    new MutationObserver(schedule).observe(vol, { attributes: true, attributeFilter: ['class'] });
  }
})();
/**
 * LE RADAR — QC wallpapers plein écran (pomo + solitaire uniquement)
 *
 * Le mât (quebec-backgrounds.js) a ses propres rejets (horizon, campus, etc.).
 * Ici l’enjeu est différent : fond derrière cartes / timer / citation.
 * On évite les macros (branche givrée, flocon, goutte, gros plan fleur…)
 * qui rendent l’UI illisible (contraste chaotique, « neige » visuelle).
 *
 * API globale : window.FullscreenWallpaperQc
 *   - isBadFullscreenWallpaper(bg) → { ok, reason?, ... }
 *   - filterPool(list) → array filtrée
 *   - scrubArrayInPlace(arr) → nombre d’entrées retirées
 *   - isHardBannedUrl(url) → boolean
 */
(function (root) {
  'use strict';

  /**
   * IDs Unsplash (segment photo-…) hard-bannis pour pomo/solitaire.
   * Ajouter ici dès qu’une photo est signalée comme mauvaise en plein écran.
   */
  const HARD_BAN_UNSPLASH_IDS = new Set([
    // « Snowy Branch » · Aaron Burden — macro glace sur branche
    '1457269449834-928af64c684d',
  ]);

  /** Fragments d’URL (case-insensitive) — filet si l’id Unsplash change de format. */
  const HARD_BAN_URL_FRAGMENTS = [
    'photo-1457269449834-928af64c684d',
  ];

  /**
   * Sujets « texture / macro / gros plan » — mauvais fond pour cartes & UI.
   * Intentionnellement étroit : ne touche pas Winter Forest, Snowy Trees,
   * Frosty Forest, Frozen Lake, Snow Peaks (paysages).
   */
  const BAD_FULLSCREEN_SUBJECT_RE = new RegExp(
    [
      '\\b(?:macro|close[\\s-]?up|gros[\\s-]?plan|bokeh)\\b',
      '\\b(?:snowflake|ice[\\s-]?crystal|frost[\\s-]?crystal|cristal(?:\\s+de)?\\s+glace)\\b',
      '\\b(?:dewdrop|dew[\\s-]?drop|raindrop|water[\\s-]?drop|droplet|goutte(?:\\s+d[e\'’]eau)?)\\b',
      // Branche / brindille givrée — le cas « Snowy Branch »
      '\\b(?:snowy|frosted|frosty|icy|frozen|glazed|rime)\\s+(?:branch|twig|bud|needle|leaf|petal)s?\\b',
      '\\b(?:branch|twig)(?:es)?\\s+(?:with\\s+)?(?:ice|frost|snow|rime)\\b',
      '\\b(?:ice|frost|snow|rime)\\s+on\\s+(?:a\\s+)?(?:branch|twig|leaf|needle)s?\\b',
      // Titre quasi-uniquement « Branch » / « Twig » (pas un paysage)
      '^(?:a\\s+)?(?:snowy\\s+|frosted\\s+|icy\\s+)?(?:branch|twig)(?:es)?$',
      '\\b(?:single|isolated)\\s+(?:flower|leaf|rose|petal|bloom|branch|twig)\\b',
      '\\b(?:petal|stamen|pollen|nectar)\\b',
      '\\b(?:flower|bloom)\\s+macro\\b',
      '\\bmacro\\s+(?:flower|leaf|ice|frost|snow)\\b',
    ].join('|'),
    'i'
  );

  function unsplashIdFromUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url, 'https://example.invalid');
      const m = u.pathname.match(/photo-([a-zA-Z0-9_-]+)/i);
      return m ? m[1] : '';
    } catch {
      const m = String(url).match(/photo-([a-zA-Z0-9_-]+)/i);
      return m ? m[1] : '';
    }
  }

  function isHardBannedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const id = unsplashIdFromUrl(url);
    if (id && HARD_BAN_UNSPLASH_IDS.has(id)) return true;
    const low = url.toLowerCase();
    for (let i = 0; i < HARD_BAN_URL_FRAGMENTS.length; i++) {
      if (low.includes(HARD_BAN_URL_FRAGMENTS[i].toLowerCase())) return true;
    }
    return false;
  }

  /**
   * @param {{ url?: string, title?: string, credit?: string, source?: string } | null} bg
   * @returns {{ ok: true } | { ok: false, reason: string, title?: string, id?: string }}
   */
  function isBadFullscreenWallpaper(bg) {
    if (!bg) return { ok: false, reason: 'empty' };

    const url = String(bg.url || '');
    if (isHardBannedUrl(url)) {
      return {
        ok: false,
        reason: 'hard_ban_fullscreen',
        id: unsplashIdFromUrl(url) || undefined,
        title: bg.title || undefined,
      };
    }

    // Sujet = titre en priorité (crédits = photographe, pas le sujet)
    const title = String(bg.title || '').trim();
    const subject = title || String(bg.credit || '').trim();
    if (!subject) return { ok: true };

    if (BAD_FULLSCREEN_SUBJECT_RE.test(subject)) {
      return { ok: false, reason: 'macro_or_busy_subject', title: title || subject };
    }
    return { ok: true };
  }

  /**
   * @template T
   * @param {T[]} list
   * @returns {T[]}
   */
  function filterPool(list) {
    if (!Array.isArray(list)) return [];
    const kept = [];
    for (let i = 0; i < list.length; i++) {
      const bg = list[i];
      const v = isBadFullscreenWallpaper(bg);
      if (v.ok) kept.push(bg);
    }
    return kept;
  }

  /**
   * Filtre destructif d’un tableau global (BACKGROUNDS).
   * @param {object[]} arr
   * @returns {number} nombre retiré
   */
  function scrubArrayInPlace(arr) {
    if (!Array.isArray(arr)) return 0;
    const before = arr.length;
    const kept = filterPool(arr);
    arr.length = 0;
    for (let i = 0; i < kept.length; i++) arr.push(kept[i]);
    const dropped = before - arr.length;
    if (dropped > 0 && typeof console !== 'undefined' && console.info) {
      console.info(
        `[fullscreen-wallpaper-qc] retiré ${dropped} fond(s) macro/busy (reste ${arr.length})`
      );
    }
    return dropped;
  }

  /**
   * Si l’URL partagée pomo↔solitaire est bannie, la purger du localStorage.
   * @param {string} [storageKey='ataraxia_bg_url']
   */
  function scrubPersistedBgUrl(storageKey) {
    const key = storageKey || 'ataraxia_bg_url';
    try {
      if (typeof localStorage === 'undefined') return false;
      const url = localStorage.getItem(key);
      if (!url) return false;
      if (isHardBannedUrl(url) || !isBadFullscreenWallpaper({ url }).ok) {
        localStorage.removeItem(key);
        return true;
      }
    } catch (_) {}
    return false;
  }

  root.FullscreenWallpaperQc = {
    isBadFullscreenWallpaper,
    filterPool,
    scrubArrayInPlace,
    isHardBannedUrl,
    scrubPersistedBgUrl,
    HARD_BAN_UNSPLASH_IDS,
  };
})(typeof window !== 'undefined' ? window : globalThis);

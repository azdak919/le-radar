/* Ataraxia — background loader & smart random selection
 * Depends: backgrounds-data.js, storage.js
 * Optional:
 *   ../quebec-pomo-backgrounds-data.js    → QUEBEC_POMO_BACKGROUNDS (pomo only)
 *   ../quebec-nations-backgrounds-data.js → QUEBEC_NATIONS_BACKGROUNDS
 *     (Premières Nations & Inuit — partagée avec le mât)
 * Exports: loadBackground, nextBackground, getRandomBgIndex, recordBgSeen
 *
 * Randomness:
 *   • crypto-quality picks (crypto.getRandomValues)
 *   • long recent window + session "shuffle bag" (no reuse until bag empties)
 *   • diversify mood / source / photographer vs the last few shown
 *
 * Quality:
 *   • Unsplash: auto=format&fit=max&q=90, responsive w up to 2560
 *   • Pexels: tinysrgb + responsive w
 *   • Wikimedia: promote low-res thumbs to 1920px when possible
 */
let currentBgIdx = 0;
let recentBgs = [];
const BG_CROSSFADE_MS = 900;

/** Rotator partagé (CSPRNG + anti-répétition URL + diversité banque). */
const _pomoRotator =
  typeof BgRotation !== 'undefined' && BgRotation.createRotator
    ? BgRotation.createRotator({
        surface: 'pomo',
        storageKey: 'ataraxia_bg_rot_pomo_v1',
        maxRecent: MAX_RECENT_BGS || 48,
        moodFn: (bg) => _bgMood(bg),
      })
    : null;

/**
 * Fusionne une banque QC dans BACKGROUNDS (dédoublonnage URL).
 * @param {object[]} source
 * @param {string} cultureTag  ex. 'quebec' | 'quebec-nations'
 * @param {string} flagKey     propriété sur BACKGROUNDS pour l’idempotence
 * @param {string} logLabel
 */
function _mergeQuebecSourceBank(source, cultureTag, flagKey, logLabel) {
  if (typeof BACKGROUNDS === 'undefined' || !Array.isArray(BACKGROUNDS)) return;
  if (!source || !Array.isArray(source) || !source.length) return;
  if (BACKGROUNDS[flagKey]) return;
  const seen = new Set(BACKGROUNDS.map((b) => b && b.url).filter(Boolean));
  let added = 0;
  for (const p of source) {
    if (!p || !p.url) continue;
    if (seen.has(p.url)) {
      const existing = BACKGROUNDS.find((b) => b && b.url === p.url);
      if (existing) {
        if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) existing.focalY = p.focalY;
        if (typeof p.position === 'string' && p.position.trim()) existing.position = p.position.trim();
        if (p.season) existing.season = p.season;
        if (p.season6) existing.season6 = p.season6;
        if (p.place) existing.place = p.place;
        if (p.credit) existing.credit = p.credit;
      }
      continue;
    }
    if (Array.isArray(p.surfaces)) {
      if (!p.surfaces.length) continue;
      if (!p.surfaces.includes('pomo') && !p.surfaces.includes('*')) continue;
    }
    // Même QC plein écran que le stock Unsplash (macros / branches givrées)
    if (
      typeof FullscreenWallpaperQc !== 'undefined' &&
      FullscreenWallpaperQc.isBadFullscreenWallpaper &&
      !FullscreenWallpaperQc.isBadFullscreenWallpaper(p).ok
    ) {
      continue;
    }
    seen.add(p.url);
    const license = String(p.license || '').trim();
    const entry = {
      url: p.url,
      credit: p.credit || p.title || 'Québec',
      link: p.link || '',
      source: license
        ? `Wikimedia Commons · ${license}`
        : 'Wikimedia Commons · Le Radar Québec',
      title: p.title || '',
      culture: cultureTag,
      bank: cultureTag === 'quebec-nations' ? 'nations' : (p.bank || cultureTag),
    };
    if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
      entry.focalY = p.focalY;
    }
    if (typeof p.position === 'string' && p.position.trim()) {
      entry.position = p.position.trim();
    }
    if (p.season) entry.season = p.season;
    if (p.season6) entry.season6 = p.season6;
    if (p.nationId) entry.nationId = p.nationId;
    if (p.nation) entry.nation = p.nation;
    BACKGROUNDS.push(entry);
    added += 1;
  }
  BACKGROUNDS[flagKey] = true;
  if (added && typeof console !== 'undefined' && console.info) {
    console.info(`[pomo-bg] ${logLabel} : +${added} (total ${BACKGROUNDS.length})`);
  }
}

function _mergeQuebecPomoBanks() {
  if (typeof PHOTO_BANK !== 'undefined' && Array.isArray(PHOTO_BANK) && PHOTO_BANK.length) {
    const pomo = PHOTO_BANK.filter((p) => {
      if (!p || !p.url) return false;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.includes('pomo');
    });
    _mergeQuebecSourceBank(pomo, 'quebec', '_quebecPhotosMerged', 'banque unique (tag pomo)');
    return;
  }
  // Pomo-only landscapes
  if (typeof QUEBEC_POMO_BACKGROUNDS !== 'undefined') {
    _mergeQuebecSourceBank(
      QUEBEC_POMO_BACKGROUNDS,
      'quebec',
      '_quebecPomoMerged',
      'banque QC pomo'
    );
  }
  // Shared First Nations / Inuit (also on masthead)
  if (typeof QUEBEC_NATIONS_BACKGROUNDS !== 'undefined') {
    _mergeQuebecSourceBank(
      QUEBEC_NATIONS_BACKGROUNDS,
      'quebec-nations',
      '_quebecNationsMerged',
      'banque nations / Inuit'
    );
  }
  // Favorites manuelles (permanent) si surfaces inclut pomo
  if (typeof QUEBEC_FAVORITES_BACKGROUNDS !== 'undefined') {
    const favs = QUEBEC_FAVORITES_BACKGROUNDS.filter((p) => {
      if (!p || !p.url) return false;
      const surfaces = Array.isArray(p.surfaces) ? p.surfaces : ['masthead', 'pomo'];
      return surfaces.includes('pomo') || surfaces.includes('*');
    });
    if (favs.length) {
      _mergeQuebecSourceBank(favs, 'quebec-favorites', '_quebecFavoritesMerged', 'banque favorites');
    }
  }
}

_mergeQuebecPomoBanks();

if (typeof BACKGROUNDS !== 'undefined' && Array.isArray(BACKGROUNDS)) {
  const kept = BACKGROUNDS.filter((p) => {
    if (!p || !Array.isArray(p.surfaces)) return true;
    if (!p.surfaces.length) return false;
    return p.surfaces.includes('pomo') || p.surfaces.includes('*');
  });
  if (kept.length !== BACKGROUNDS.length) {
    BACKGROUNDS.length = 0;
    BACKGROUNDS.push(...kept);
  }
}

// QC plein écran pomo/solitaire (pas le mât) — retire macros / hard-bans
if (typeof FullscreenWallpaperQc !== 'undefined') {
  if (FullscreenWallpaperQc.scrubArrayInPlace) {
    FullscreenWallpaperQc.scrubArrayInPlace(BACKGROUNDS);
  }
  if (FullscreenWallpaperQc.scrubPersistedBgUrl) {
    FullscreenWallpaperQc.scrubPersistedBgUrl('ataraxia_bg_url');
  }
}

/** CSS background-position depuis override banque ou focalY (0–1). */
function _bgPositionCss(bg) {
  if (bg && typeof bg.position === 'string' && bg.position.trim()) {
    return bg.position.trim();
  }
  if (bg && typeof bg.focalY === 'number' && !Number.isNaN(bg.focalY)) {
    const pct = Math.round(Math.min(1, Math.max(0, bg.focalY)) * 1000) / 10;
    return `50% ${pct}%`;
  }
  return 'center center';
}

/** Session bag of remaining indices (reshuffled when empty). */
let _bgBag = [];
/** Last few mood tags shown (for diversity). */
let _recentMoods = [];
/** Indices that failed to load this session (skip). */
const _failedBg = new Set();

function safeHttpsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Commons « machine-readable author… » → nom court (voir scripts/commons-credit-lib.js). */
function _sanitizeCommonsCredit(raw) {
  if (raw == null) return '';
  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let m = s.match(
    /no machine-readable author provided\.?\s*(.+?)\s+assumed\s*\(\s*based on copyright claims\s*\)\.?/i
  );
  if (m) return m[1].replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim().slice(0, 80);
  m = s.match(
    /aucun auteur lisible par machine n['’]est fourni[.,]?\s*(.+?)\s+l['’]a\s+suppos[ée]/i
  );
  if (m) return m[1].replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim().slice(0, 80);
  if (/^no machine-readable author provided\.?$/i.test(s)) return 'Wikimedia Commons';
  if (/^aucun auteur lisible par machine/i.test(s)) return 'Wikimedia Commons';
  s = s.replace(/\s+from\s+[A-ZÀ-Ÿ][\wÀ-ÿ.'’\-]*(?:,?\s+[A-ZÀ-Ÿ][\wÀ-ÿ.'’\-]*){0,5}\s*$/u, '').trim();
  s = s.replace(/^[\w.\-]+\.(?:jpe?g|png|gif|webp)\s*:\s*/i, '');
  s = s.replace(/\s*derivative work:\s*\S+/ig, '').trim();
  s = s.replace(/\/[a-z0-9._-]+\.[a-z]{2,}(?:\/\S*)?$/i, '').trim();
  if (/ville de montr[ée]al/i.test(s)) s = 'Ville de Montréal';
  s = s.replace(/\s*[-–—]\s*Me\s*[•·].*$/i, '').trim();
  if (/^nasa\b/i.test(s)) {
    const courtesy = s.match(/courtesy of\s+(.+?)\.?$/i);
    if (courtesy) s = `NASA / ${courtesy[1].replace(/\.$/, '').trim()}`;
    else if (/^nasa\.?\s*$/i.test(s)) s = 'NASA';
  }
  if (/^jeangagnon$/i.test(s)) return 'Jean Gagnon';
  if (s.length > 72) {
    const head = s.split(/\s*[—–|]\s*|\s*\(/)[0].trim();
    if (head.length >= 2 && head.length <= 60) return head;
    return `${s.slice(0, 60).trim()}…`;
  }
  return s;
}

/** Uniform integer in [0, n) using crypto when available. */
function _randInt(n) {
  if (n <= 1) return 0;
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      // Rejection sampling avoids modulo bias for small n
      const max = 0x100000000;
      const limit = max - (max % n);
      let x;
      do {
        crypto.getRandomValues(buf);
        x = buf[0];
      } while (x >= limit);
      return x % n;
    }
  } catch (_) {}
  return Math.floor(Math.random() * n);
}

function _shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = _randInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// Return an appropriate image width for the current viewport + device pixel ratio.
// Allows sharp wallpapers on large desktops (up to 2560) while staying light on phones.
function _responsiveImgWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = (window.innerWidth || screen.width || 1280) * dpr;
  if (vw <= 720)  return 800;
  if (vw <= 1100) return 1280;
  if (vw <= 1700) return 1920;
  if (vw <= 2400) return 2560;
  return 2560;
}

/**
 * Rewrite CDN URLs for sharper delivery without blowing phone bandwidth.
 * Base data uses w=1920 placeholders; we adapt at load time.
 */
function _optimizeBgUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  let url = rawUrl;
  const w = _responsiveImgWidth();

  if (url.includes('images.unsplash.com')) {
    try {
      const u = new URL(url);
      u.searchParams.set('w', String(w));
      u.searchParams.set('q', '90');
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'max');
      // Prefer modern formats when supported; Unsplash imgix honors auto=format
      url = u.href;
    } catch (_) {
      url = url
        .replace(/([?&])w=\d+/g, `$1w=${w}`)
        .replace(/([?&])q=\d+/g, '$1q=90');
      if (!/[?&]auto=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'auto=format&fit=max';
    }
  } else if (url.includes('images.pexels.com')) {
    try {
      const u = new URL(url);
      u.searchParams.set('auto', 'compress');
      u.searchParams.set('cs', 'tinysrgb');
      u.searchParams.set('w', String(w));
      u.searchParams.delete('dpr'); // we bake DPR into w already
      url = u.href;
    } catch (_) {
      url = url.replace(/([?&])w=\d+/g, `$1w=${w}`);
      if (!/[?&]cs=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'cs=tinysrgb';
    }
  } else if (url.includes('upload.wikimedia.org')) {
    // Promote 800/1024 thumbs to 1920 for wallpapers (full-res originals are huge).
    url = url.replace(/\/(800|1024|1280)px-/g, '/1920px-');
  }

  return url;
}

/** Coarse mood from title/credit for diversity (not culture tags). */
function _bgMood(bg) {
  if (!bg) return 'other';
  // Québec : sous-mood par sujet (pas un seul bucket « c:quebec ») pour
  // diversifier entre Percé, skylines, lacs, fleuve, nations, etc.
  const t = `${bg.title || ''} ${bg.credit || ''}`.toLowerCase();
  if (bg.culture === 'quebec-nations' || bg.bank === 'nations' || bg.nationId) {
    // Diversité fine par nation (11 nations QC)
    if (bg.nationId) return `nation:${bg.nationId}`;
    if (/nunavik|inuit|kuujj|kangi|pingualuit|salluit|puvirnituq|inukjuak|akulivik|umiujaq|tasiujaq|aupaluk/.test(t)) {
      return 'nation:inuit';
    }
    if (/cri|eeyou|mistissini|chisasibi|whapmagoostui|waswanipi|nemaska|waskaganish|wemindji|ouj[eé]/.test(t)) {
      return 'nation:cree';
    }
    if (/innu|ilnu|pessamit|mashteuiatsh|essipit|uashat|natashquan|nutashkuan|matimekosh|ekuanitshit/.test(t)) {
      return 'nation:innu';
    }
    if (/atikamekw|manawan|wemotaci|opitciwan|notcimik/.test(t)) return 'nation:atikamekw';
    if (/wendat|wendake|huron/.test(t)) return 'nation:wendat';
    if (/mohawk|kahnaw|kanesat|akwesasne|kanien/.test(t)) return 'nation:mohawk';
    if (/mi.?g?maq|micmac|listuguj|gesgapegiag|gespeg/.test(t)) return 'nation:migmaq';
    if (/algonquin|anishinaab|kitigan|lac-simon|kitcisakik/.test(t)) return 'nation:algonquin';
    if (/ab[eé]naki|odanak|w[oô]linak|w8banaki/.test(t)) return 'nation:abenaki';
    if (/naskapi|kawawachikamach/.test(t)) return 'nation:naskapi';
    if (/mal[eé]cite|wolastoq|wahsipekuk|cacouna/.test(t)) return 'nation:maliseet';
    return 'qc-nations';
  }
  if (bg.culture === 'quebec' || bg.region === 'quebec') {
    if (/skyline|panorama|montr[eé]al|qu[eé]bec\s*city|centre-ville|downtown/.test(t)) return 'qc-city';
    if (/perc[eé]|gasp|rocher|falaise|cliff|c[oô]te|baie|fleuve|saint-laurent|lac|rivi[eè]re|canal|voile|marina/.test(t)) return 'qc-water';
    if (/for[eê]t|forest|automn|autumn|[eé]rable|montagne|mountain|parc|nation|inuit|nunavik/.test(t)) return 'qc-land';
    return 'qc-scene';
  }
  if (bg.culture) return `c:${bg.culture}`;
  if (/aurora|milky|star|night|galaxy|space|nocturne/.test(t)) return 'night';
  if (/ocean|sea|coast|beach|wave|shore|cliff|fleuve|c[oô]te|baie/.test(t)) return 'ocean';
  if (/desert|dune|sand|canyon|arid/.test(t)) return 'desert';
  if (/snow|winter|ice|frost|glacier|alpine snow|neige|hiver/.test(t)) return 'winter';
  if (/forest|tree|wood|pine|canopy|redwood|birch|for[eê]t|[eé]rable/.test(t)) return 'forest';
  if (/mountain|peak|summit|alps|himalaya|ridge|montagne/.test(t)) return 'mountain';
  if (/lake|river|waterfall|stream|pond|rivi[eè]re|lac|chute/.test(t)) return 'water';
  if (/sunset|sunrise|dawn|dusk|golden|lavender|meadow|field|lever|coucher/.test(t)) return 'golden';
  if (/fog|mist|cloud|haze|overcast|brume|brouillard/.test(t)) return 'mist';
  if (bg.source && /wikimedia|public domain/i.test(bg.source)) return 'art';
  return 'nature';
}

function _photographerKey(bg) {
  if (!bg) return '';
  // Prefer Unsplash/Pexels handle from link; else credit text
  try {
    if (bg.link) {
      const path = new URL(bg.link).pathname.replace(/\/+$/, '');
      const handle = path.split('/').filter(Boolean).pop();
      if (handle) return handle.toLowerCase();
    }
  } catch (_) {}
  return String(bg.credit || '').split('—')[0].trim().toLowerCase().slice(0, 40);
}

function showCreditsBar() {
  const bar = document.querySelector('.bottom-badges');
  if (!bar || bar.classList.contains('visible')) return;
  const pageStart = window._ataraxiaPageStart ?? 0;
  const minAt = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-delay-credits')
  ) * 1000 || 540;
  const wait = Math.max(0, minAt - (performance.now() - pageStart));
  setTimeout(() => {
    bar.classList.add('visible');
    requestAnimationFrame(() => window.AtaraxiaLayout?.updateChromeInsets?.());
  }, wait);
}

function loadBackground(index) {
  const bg = BACKGROUNDS[index];
  if (!bg) {
    _nextFromPool();
    return;
  }
  // Filet runtime : ne jamais afficher un fond plein écran rejeté
  if (
    typeof FullscreenWallpaperQc !== 'undefined' &&
    FullscreenWallpaperQc.isBadFullscreenWallpaper &&
    !FullscreenWallpaperQc.isBadFullscreenWallpaper(bg).ok
  ) {
    _failedBg.add(index);
    _nextFromPool();
    return;
  }
  const url = _optimizeBgUrl(bg.url);
  _applyBackground(url, bg.credit, bg.link, bg.source || 'Unsplash', bg.title || '', bg);
}

// Cleanup function for any in-progress background crossfade transition.
let _bgCrossfadeCleanup = null;
let _bgFadeTimer = null;

function _applyBackground(url, creditText, linkUrl, source, title = '', bgMeta = null) {
  const layerCurrent = document.getElementById('bg-layer');
  const layerNext    = document.getElementById('bg-layer-next');
  const credit       = document.getElementById('img-credit');
  const posCss       = _bgPositionCss(bgMeta);

  const img = new Image();
  // Hint decoder for large wallpapers
  try { img.decoding = 'async'; } catch (_) {}
  img.onload = () => {
    // If a previous crossfade is still in progress, finalize it immediately so
    // layerCurrent is up-to-date before we start the next transition.
    if (_bgCrossfadeCleanup) {
      _bgCrossfadeCleanup();
      _bgCrossfadeCleanup = null;
    }

    // Snap the incoming layer to opacity 0 (bypass the CSS transition) and
    // load the new image onto it, then re-enable the transition and fade in.
    layerNext.style.transition = 'none';
    layerNext.classList.remove('loaded');
    layerNext.style.backgroundImage = `url(${url})`;
    layerNext.style.backgroundPosition = posCss;
    layerNext.offsetHeight; // read layout to force reflow and commit opacity:0 before re-enabling the transition
    layerNext.style.transition = '';
    layerNext.classList.add('is-fading');
    requestAnimationFrame(() => { layerNext.classList.add('loaded'); });

    // Persist current background URL so /solitaire/ can share it
    try { localStorage.setItem('ataraxia_bg_url', url); } catch(e) {}

    // Safer DOM construction (was innerHTML). Prevents any future XSS risk and is more explicit.
    credit.textContent = '';
    const safeLink = safeHttpsUrl(linkUrl);
    // Commons boilerplate → nom court (aligné mât / commons-credit-lib)
    const place = bgMeta && bgMeta.place ? String(bgMeta.place).trim() : '';
    let creditLabel = _sanitizeCommonsCredit(creditText);
    if (creditLabel && place && creditLabel.toLowerCase().indexOf(place.toLowerCase()) < 0
        && place.length <= 36 && !/panorama|skyline|landscape|cropped/i.test(place)) {
      creditLabel = `${creditLabel} — ${place}`;
    }
    if (source === 'Unsplash' || source === 'Pexels') {
      const titlePart = title ? `«${title}» · ` : '';
      credit.appendChild(document.createTextNode(`Photo: ${titlePart}`));
      if (safeLink) {
        const a = document.createElement('a');
        a.href = safeLink;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = creditLabel;
        credit.appendChild(a);
      } else {
        credit.appendChild(document.createTextNode(creditLabel));
      }
      credit.appendChild(document.createTextNode(` · ${source}`));
    } else if (safeLink) {
      // Wikimedia / banque Québec : titre optionnel + auteur lié + source/licence
      if (title) {
        credit.appendChild(document.createTextNode(`«${title}» · `));
      }
      const a = document.createElement('a');
      a.href = safeLink;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = creditLabel;
      credit.appendChild(a);
      credit.appendChild(document.createTextNode(` · ${source}`));
    } else {
      const label = title ? `«${title}» · ${creditLabel}` : creditLabel;
      credit.appendChild(document.createTextNode(`${label} · ${source}`));
    }
    showCreditsBar();

    function finalizeCrossfade() {
      if (_bgFadeTimer) {
        clearTimeout(_bgFadeTimer);
        _bgFadeTimer = null;
      }
      layerNext.removeEventListener('transitionend', onTransitionEnd);
      _bgCrossfadeCleanup = null;
      layerCurrent.style.backgroundImage = `url(${url})`;
      layerCurrent.style.backgroundPosition = posCss;
      layerNext.style.transition = 'none';
      layerNext.classList.remove('loaded', 'is-fading');
      layerNext.style.backgroundImage = '';
      layerNext.style.backgroundPosition = '';
      requestAnimationFrame(() => { layerNext.style.transition = ''; });
    }

    function onTransitionEnd(e) {
      if (e.propertyName !== 'opacity' || e.target !== layerNext) return;
      finalizeCrossfade();
    }
    layerNext.addEventListener('transitionend', onTransitionEnd);
    _bgFadeTimer = setTimeout(finalizeCrossfade, BG_CROSSFADE_MS + 80);

    _bgCrossfadeCleanup = () => {
      finalizeCrossfade();
    };
  };
  img.onerror = () => {
    _failedBg.add(currentBgIdx);
    // Fallback to a randomly chosen pool entry to avoid always landing on the
    // same images when several consecutive entries in the list fail to load
    // (e.g. due to CDN hotlinking restrictions).
    _nextFromPool();
  };
  img.src = url;
}

function _nextFromPool() {
  const idx = getRandomBgIndex(null); // full pool, no culture preference
  currentBgIdx = idx;
  recordBgSeen(idx);
  loadBackground(idx);
}

function nextBackground() {
  _nextFromPool();
}

function recordBgSeen(idx) {
  recentBgs = recentBgs.filter(i => i !== idx);
  recentBgs.push(idx);
  if (recentBgs.length > MAX_RECENT_BGS) recentBgs.shift();
  try { localStorage.setItem(RECENT_BGS_KEY, JSON.stringify(recentBgs)); } catch(e) {}

  const bg = BACKGROUNDS[idx];
  if (_pomoRotator && bg) {
    _pomoRotator.record({
      ...bg,
      bank: bg.bank || bg.culture || 'stock',
    });
  }

  const mood = _bgMood(bg);
  _recentMoods.push(mood);
  if (_recentMoods.length > 6) _recentMoods.shift();

  // Remove from session bag so we don't reshuffle into it mid-cycle
  _bgBag = _bgBag.filter(i => i !== idx);
}

/**
 * Refill the session bag with a Fisher–Yates shuffle of the pool,
 * preferring indices not in the long-term recent list when possible.
 */
function _refillBgBag(pool) {
  const avoid = new Set(recentBgs.slice(-MAX_RECENT_BGS));
  const fresh = pool.filter(i => !avoid.has(i) && !_failedBg.has(i));
  const base = fresh.length >= Math.min(12, pool.length)
    ? fresh
    : pool.filter(i => !_failedBg.has(i));
  const bag = base.length ? base.slice() : pool.slice();
  _shuffleInPlace(bag);
  _bgBag = bag;
}

/**
 * Score candidate: higher = better (less similar to recent history).
 */
function _scoreCandidate(idx) {
  const bg = BACKGROUNDS[idx];
  let score = 10 + _randInt(5); // small jitter

  const mood = _bgMood(bg);
  // Soft fog/cloud stock is less engaging as a wallpaper — deprioritize.
  if (mood === 'mist') score -= 5;
  // Penalize moods seen in the last few picks
  for (let k = 0; k < _recentMoods.length; k++) {
    if (_recentMoods[_recentMoods.length - 1 - k] === mood) {
      score -= (6 - k); // more recent match → heavier penalty
    }
  }

  // Avoid same photographer twice in a row
  if (recentBgs.length) {
    const last = BACKGROUNDS[recentBgs[recentBgs.length - 1]];
    if (_photographerKey(bg) && _photographerKey(bg) === _photographerKey(last)) {
      score -= 8;
    }
  }

  // Light source diversity: don't chain Wikimedia art only, or only Pexels
  if (recentBgs.length >= 2) {
    const lastSrc = (BACKGROUNDS[recentBgs[recentBgs.length - 1]]?.source || '').split('·')[0].trim();
    const src = (bg.source || '').split('·')[0].trim();
    if (lastSrc && src && lastSrc === src) score -= 2;
  }

  // Prefer never-seen-in-recent slightly
  if (!recentBgs.includes(idx)) score += 3;

  return score;
}

function getRandomBgIndex(culture = null) {
  let pool = Array.from({ length: BACKGROUNDS.length }, (_, i) => i)
    .filter(i => !_failedBg.has(i));

  // Saison courante : 4 saisons astronomiques QC / 6 saisons nations–Inuit
  if (typeof RadarSeason !== 'undefined' && RadarSeason.filterPoolByCurrentSeason) {
    const items = pool.map((i) => ({ ...BACKGROUNDS[i], _idx: i }));
    // minStrict élevé : sinon en été le pool se réduit à ~5 photos taguées
    // (les inconnues / pierre grise restent éligibles ; opposé certain exclu)
    // et le plein écran peut rester vide après rejets.
    const r = RadarSeason.filterPoolByCurrentSeason(items, {
      minStrict: 12,
      minAdjacent: 16,
    });
    if (r.items && r.items.length) {
      // permanent = collection hors purge, pas affichage hors saison
      pool = r.items.map((it) => it._idx).filter((i) => i != null);
      if (typeof console !== 'undefined' && console.info) {
        const nPerm = pool.filter((i) => BACKGROUNDS[i] && BACKGROUNDS[i].permanent).length;
        console.info(
          `[pomo-bg] saison 4=${r.season4} · 6=${r.season6} · tier=${r.tier}` +
            ` · ${pool.length}/${BACKGROUNDS.length}` +
            (nPerm ? ` · perm in-season ${nPerm}` : '')
        );
      }
    }
  }

  if (culture) {
    // Respect cultural preference (same logic as before, but on full pool first)
    const fallbacks = { 'east-asian': 'japanese', 'modern': null };
    const resolved = fallbacks[culture] !== undefined ? (fallbacks[culture] || culture) : culture;

    let cultPool = pool.filter(i => BACKGROUNDS[i].culture === resolved);
    if (cultPool.length === 0 && resolved !== culture) {
      cultPool = pool.filter(i => BACKGROUNDS[i].culture === culture);
    }
    if (cultPool.length === 0) {
      cultPool = pool.filter(i => !BACKGROUNDS[i].culture); // untagged nature
    }
    if (cultPool.length > 0) pool = cultPool;
  }

  if (!pool.length) {
    pool = Array.from({ length: BACKGROUNDS.length }, (_, i) => i);
  }

  // Prefer shared rotator (stable URL identity + multi-bank diversity)
  if (_pomoRotator && !culture) {
    const items = pool.map((i) => ({
      ...BACKGROUNDS[i],
      _idx: i,
      bank: BACKGROUNDS[i].bank || BACKGROUNDS[i].culture || 'stock',
    }));
    const excludeUrl =
      currentBgIdx >= 0 && BACKGROUNDS[currentBgIdx]
        ? BACKGROUNDS[currentBgIdx].url
        : null;
    const failedIds = new Set();
    for (const i of _failedBg) {
      if (BACKGROUNDS[i] && BACKGROUNDS[i].url) {
        failedIds.add(_pomoRotator.photoId(BACKGROUNDS[i]));
      }
    }
    const chosen = _pomoRotator.pick(items, {
      failedIds,
      excludeId: excludeUrl ? _pomoRotator.photoId({ url: excludeUrl }) : null,
    });
    if (chosen && typeof chosen._idx === 'number') return chosen._idx;
    // Map back by URL if _idx lost
    if (chosen && chosen.url) {
      const hit = pool.find((i) => BACKGROUNDS[i] && BACKGROUNDS[i].url === chosen.url);
      if (hit != null) return hit;
    }
  }

  // Culture-scoped picks don't use the global bag (small pool)
  if (culture) {
    const avoid = new Set(recentBgs.slice(-Math.min(MAX_RECENT_BGS, Math.max(3, pool.length - 1))));
    let candidates = pool.filter(i => !avoid.has(i) && i !== currentBgIdx);
    if (candidates.length < 2) candidates = pool.filter(i => i !== currentBgIdx);
    if (!candidates.length) candidates = pool.slice();
    // Weighted pick by diversity score
    let best = candidates[0];
    let bestScore = -Infinity;
    // Sample up to 12 candidates for quality without scanning huge pools
    const sample = candidates.length <= 12
      ? candidates
      : _shuffleInPlace(candidates.slice()).slice(0, 12);
    for (const i of sample) {
      const s = _scoreCandidate(i);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  // Fallback path: session bag + scored pick among bag head
  _bgBag = _bgBag.filter(i => pool.includes(i) && i !== currentBgIdx && !_failedBg.has(i));
  if (_bgBag.length < 3) {
    _refillBgBag(pool);
    _bgBag = _bgBag.filter(i => i !== currentBgIdx);
    if (!_bgBag.length) _refillBgBag(pool);
  }

  // Take a window from the bag and pick the highest-scoring (diverse) index
  const windowSize = Math.min(10, _bgBag.length);
  const window = _bgBag.slice(0, windowSize);
  let best = window[0];
  let bestScore = -Infinity;
  for (const i of window) {
    const s = _scoreCandidate(i);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }

  // Remove chosen from bag
  _bgBag = _bgBag.filter(i => i !== best);

  if (best === currentBgIdx && pool.length > 1) {
    const alt = pool.find(i => i !== currentBgIdx) ?? best;
    return alt;
  }
  return best;
}

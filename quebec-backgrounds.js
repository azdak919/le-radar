/* LE RADAR — fond photographique (banque du Québec)
 * Depends: quebec-backgrounds-data.js
 * Une seule image par chargement de page (pas de rotation en boucle — le
 * fond ne doit pas distraire de la lecture) ; évite les répétitions
 * récentes via localStorage, comme la rotation météo du mât.
 */
(function () {
  const RECENT_KEY = "lr_bg_recent";
  const MAX_RECENT = 6;

  function safeHttpsUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }

  function _randInt(n) {
    if (n <= 1) return 0;
    try {
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const buf = new Uint32Array(1);
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

  function _recentList() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function _recordRecent(idx) {
    let recent = _recentList().filter((i) => i !== idx);
    recent.push(idx);
    if (recent.length > MAX_RECENT) recent.shift();
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (_) {}
  }

  function pickIndex(pool) {
    const recent = new Set(_recentList());
    let candidates = pool.filter((i) => !recent.has(i));
    if (!candidates.length) candidates = pool.slice();
    return candidates[_randInt(candidates.length)];
  }

  // Passe par Special:FilePath (redirige vers un thumb JPEG dimensionné) —
  // même mécanisme que displaySizedImageUrl() dans app.js pour les vignettes
  // d'articles ; l'accès direct au chemin /commons/thumb/.../NNNpx- est
  // bloqué par ORB dans certains contextes cross-origin.
  function _wikimediaThumb(rawUrl, width) {
    const m = rawUrl.match(/\/([^/]+\.(?:jpe?g|png|webp|gif))$/i);
    if (!m) return rawUrl;
    const filename = decodeURIComponent(m[1]);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
  }

  function _responsiveWidth() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = (window.innerWidth || screen.width || 1280) * dpr;
    if (vw <= 900) return 1024;
    if (vw <= 1600) return 1600;
    if (vw <= 2200) return 2000;
    return 2560;
  }

  function _optimizedUrl(bg) {
    return _wikimediaThumb(bg.url, _responsiveWidth());
  }

  function _renderCredit(bg) {
    const el = document.getElementById("bg-photo-credit");
    if (!el) return;
    el.textContent = "";
    const link = safeHttpsUrl(bg.link);
    const label = document.createTextNode(`${bg.title} — `);
    el.appendChild(label);
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = bg.credit;
      el.appendChild(a);
    } else {
      el.appendChild(document.createTextNode(bg.credit));
    }
    el.appendChild(document.createTextNode(` (${bg.license})`));
  }

  function _applyBackground(idx, pool) {
    const bg = QUEBEC_BACKGROUNDS[idx];
    if (!bg) return;
    const layer = document.getElementById("bg-photo-layer");
    if (!layer) return;
    const url = _optimizedUrl(bg);
    const img = new Image();
    try {
      img.decoding = "async";
    } catch (_) {}
    img.onload = () => {
      layer.style.backgroundImage = `url("${url}")`;
      requestAnimationFrame(() => layer.classList.add("loaded"));
      _renderCredit(bg);
      _recordRecent(idx);
    };
    img.onerror = () => {
      const remaining = pool.filter((i) => i !== idx);
      if (remaining.length) _applyBackground(pickIndex(remaining), remaining);
    };
    img.src = url;
  }

  function init() {
    if (typeof QUEBEC_BACKGROUNDS === "undefined" || !QUEBEC_BACKGROUNDS.length) return;
    if (!document.getElementById("bg-photo-layer")) return;
    const pool = QUEBEC_BACKGROUNDS.map((_, i) => i);
    _applyBackground(pickIndex(pool), pool);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

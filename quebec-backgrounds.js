/* LE RADAR — fond photographique du mât (page principale)
 * Depends :
 *   quebec-backgrounds-data.js            → QUEBEC_BACKGROUNDS (paysages mât)
 *   quebec-university-backgrounds-data.js → QUEBEC_UNIVERSITY_BACKGROUNDS (campus)
 *   quebec-nations-backgrounds-data.js    → QUEBEC_NATIONS_BACKGROUNDS
 *     (Premières Nations & Inuit — aussi chargée par le pomo)
 *   quebec-favorites-backgrounds-data.js  → QUEBEC_FAVORITES_BACKGROUNDS
 *     (favorites manuelles permanentes — jamais purgées par les bots)
 *
 * Compartimentation :
 *   - QUEBEC_POMO_BACKGROUNDS : pomo seulement (jamais ici)
 *   - QUEBEC_NATIONS_BACKGROUNDS : partagée mât + pomo
 *   - QUEBEC_FAVORITES_BACKGROUNDS : mât (+ pomo si surfaces inclut pomo)
 *
 * Une seule image par chargement de page (pas de rotation en boucle — le
 * fond ne doit pas distraire de la lecture) ; évite les répétitions
 * récentes via localStorage, comme la rotation météo du mât.
 *
 * Filtre wallpaper mât (scoreMastheadPhoto) — aligné sur
 * scripts/audit-quebec-backgrounds.py :
 *   portrait, near_black, night_flat, low_resolution, excessive_grain,
 *   dead_sky_monochrome, centered_object_voids, near_greyscale_flat,
 *   competing_logo_zone (enseigne UQAM/etc. sous le wordmark LE RADAR),
 *   busy_low_chroma_facade (façade beige texturée, ex. Roger-Gaudry crop)
 */
(function () {
  const RECENT_KEY = "lr_bg_recent"; // legacy indices (migré → rotator URL ids)
  const MAX_RECENT = 6;
  const _failedIds = new Set();

  /**
   * Pool mât = paysages mât + campus + nations (Inuit / PN) + favorites.
   * N’inclut jamais QUEBEC_POMO_BACKGROUNDS.
   * Chaque entrée reçoit `.bank` pour la diversité multi-banques.
   * Favorites : surfaces masthead (défaut) ou liste explicite.
   */
  function _mastheadPool() {
    const out = [];
    const seen = new Set();
    function pushAll(arr, bank) {
      if (!arr || !Array.isArray(arr)) return;
      for (const p of arr) {
        if (!p || !p.url) continue;
        if (seen.has(p.url)) continue;
        seen.add(p.url);
        out.push({ ...p, bank: p.bank || bank });
      }
    }
    // Favorites d’abord (poids égal au pick, mais toujours dans le pool)
    if (typeof QUEBEC_FAVORITES_BACKGROUNDS !== "undefined") {
      const favs = QUEBEC_FAVORITES_BACKGROUNDS.filter((p) => {
        if (!p || !p.url) return false;
        const surfaces = Array.isArray(p.surfaces) ? p.surfaces : ["masthead", "pomo"];
        return surfaces.includes("masthead") || surfaces.includes("*");
      });
      pushAll(favs, "favorites");
    }
    pushAll(
      typeof QUEBEC_BACKGROUNDS !== "undefined" ? QUEBEC_BACKGROUNDS : null,
      "masthead"
    );
    pushAll(
      typeof QUEBEC_UNIVERSITY_BACKGROUNDS !== "undefined"
        ? QUEBEC_UNIVERSITY_BACKGROUNDS
        : null,
      "universities"
    );
    pushAll(
      typeof QUEBEC_NATIONS_BACKGROUNDS !== "undefined"
        ? QUEBEC_NATIONS_BACKGROUNDS
        : null,
      "nations"
    );
    return out;
  }

  function _mastheadMood(bg) {
    if (!bg) return "other";
    if (bg.nationId) return `nation:${bg.nationId}`;
    if (bg.bank === "nations" || bg.culture === "quebec-nations") return "nations";
    if (bg.bank === "universities") return "campus";
    const t = `${bg.title || ""} ${bg.credit || ""}`.toLowerCase();
    if (/skyline|panorama|montr[eé]al|frontenac|qu[eé]bec/.test(t)) return "city";
    if (/perc[eé]|gasp|fleuve|lac|rivi[eè]re|baie|rocher/.test(t)) return "water";
    if (/for[eê]t|[eé]rable|automn|montagne|parc/.test(t)) return "land";
    return "scene";
  }

  const _rotator =
    typeof BgRotation !== "undefined" && BgRotation.createRotator
      ? BgRotation.createRotator({
          surface: "masthead",
          storageKey: "lr_bg_rot_masthead_v1",
          maxRecent: 36,
          moodFn: _mastheadMood,
        })
      : null;
  /** Ratio largeur/hauteur minimal (paysage). Sous ce seuil → rejet dur. */
  const MIN_ASPECT = 1.25;
  /**
   * Résolution native mini — un mât ~1600–2560 CSS px (retina) doit rester net.
   * Sous ces seuils le cover upscale → « grain » / pixels / JPEG blocks visibles
   * (ex. L'Île-Perrot 982×566).
   */
  const MIN_NATIVE_W = 1400;
  const MIN_NATIVE_H = 700;
  const MIN_NATIVE_PX = 1_200_000; // ~1.2 Mpx
  /** Ratio du bandeau mât (cover crop simulé pour l’échantillonnage). */
  const MASTHEAD_AR = 3.8;
  /** Luminance moyenne mini sur le crop (0–1, sRGB linéaire approx.). */
  const MIN_MEAN_L = 0.09;
  /**
   * Grain excessif dans les zones plates (ciel) : résidu haute fréquence
   * moyen (luma 0–1). Au-delà → JPEG bruit / upscale grossier.
   */
  const MAX_FLAT_GRAIN = 0.028;
  /**
   * Façade / texture dense + saturation basse (bandeau mât) :
   * le wordmark blanc se perd dans le « grain » architectural beige.
   * Réf. mauvaise : Pavillon Roger-Gaudry (Jeangagnon) — edge haut, sat ~0.18.
   * Les skylines dorées (sat haute) et paysages (edge plus bas) passent.
   */
  const BUSY_LOW_CHROMA = { edge: 0.03, satMax: 0.24, meanLMin: 0.2, meanLMax: 0.58 };
  /** Combo nuit plate : sombre + désaturé + peu de structure. */
  const NIGHT_FLAT = { meanL: 0.14, sat: 0.1, edge: 0.012 };
  /** Falaise / hiver quasi noir — skylines sombres (~0.75) restent acceptés. */
  const EXCESSIVE_DARK = 0.82;
  /** Neige + roche monochrome (ex. chute Montmorency hiver). */
  const WINTER_GREY = { sat: 0.12, grey: 0.5, cold: 0.7 };
  /**
   * Sujets religieux institutionnels (titre / URL / description Commons).
   * Ne cible pas les toponymes « Saint-… » ni la spiritualité autochtone
   * (tipi, inuksuk, pow-wow…) — seulement l’architecture cultuelle classique.
   */
  const RELIGIOUS_SUBJECT_RE =
    /(?:église|eglise|church|cathedral|cathédrale|basilique|basilica|chapelle|chapel|crucifix|\bcroix\b|crosses?\b|mosquée|mosquee|mosque|synagogue|monastère|monastere|monastery|couvent|convent|calvaire|cimetière|cimetiere|cemetery|minaret|clocher|steeple|bell[\s-]?tower|paroisse|parish|presbyt[eè]re|presbytery|lieu de culte|place of worship|\bjésus\b|\bjesus\b|\bchrist\b|crucifi|temple\s+(?:bouddh|hindou|sikh)|tabernacle)/i;

  /** Intérieurs / objets musée (canot, expo…) — pas un paysage de bandeau. */
  const INDOOR_OBJECT_RE =
    /(?:\bcanot\b|\bcanoe\b|\bkayak\b|\bpaddle\b|\bpagaie\b|\bmuseum\b|\bmuseo\b|\bmusée\b|\bmusee\b|\binterior\b|\bintérieur\b|\binterieur\b|\bindoor\b|\bexhibit\b|\bexhibition\b|\bgallery\b|\bgalerie\b|\bmashteuiatsh[\s_-]?0*\d{2,}\b)/i;

  /** Rocaille / toundra grise sans intérêt (ex. Ultramafic landscape). */
  const BARREN_SCENE_RE =
    /(?:\bultramafic\b|\bbarren\b|\btundra\b|\bwasteland\b|\brocky plain\b|\bquarry\b|\bcarri[eè]re\b)/i;

  /** Dessous de pont / viaduc / parking béton — pas un paysage de bandeau. */
  const UNDERBRIDGE_SCENE_RE =
    /(?:\bunderside\b|\bunderneath\b|\bunderpass\b|\bunder[\s-]?the[\s-]?bridge\b|\bbridge[\s-]?underside\b|\bdessous de pont\b|\bsous le pont\b|\bsous[\s-]pont\b|\bviaduc\b.*\b(dessous|sous)\b|\bconcrete beams?\b|\bpiliers? de b[eé]ton\b|\bsoffit\b)/i;

  /**
   * Scène industrielle / aéroport / hangar — gris, sans intérêt « lieu ».
   * Ex. Montréal–Les Cèdres Airport from railway track.
   */
  const INDUSTRIAL_SCENE_RE =
    /(?:\bairport\b|\ba[eé]roport\b|\bairfield\b|\bhangar\b|\bwarehouse\b|\bentrep[oô]t\b|\bindustrial\b|\bzone industrielle\b|\bfactory\b|\busine\b|\bscrapyard\b|\bjunkyard\b|\brailway[\s_-]?track\b|\bparking[\s_-]?lot\b|\bstationnement\b|\bpower[\s_-]?plant\b|\bcentrale[\s_-]?[eé]lectrique\b)/i;

  /** Nuit urbaine — wordmark blanc illisible sur les lumières. */
  const NIGHT_SCENE_RE =
    /(?:\bnight\b|\bnuit\b|\btwilight\b|\bcrépuscule\b|\bcrepuscule\b|\bafter[\s-]?dark\b)/i;

  function isReligiousSubject(bg) {
    if (!bg) return false;
    const hay = [
      bg.title,
      bg.url,
      bg.link,
      bg.credit,
      bg.description,
      bg.categories,
    ]
      .filter(Boolean)
      .join(" ");
    return RELIGIOUS_SUBJECT_RE.test(hay);
  }

  function isIndoorObjectSubject(bg) {
    if (!bg) return false;
    const hay = [bg.title, bg.url, bg.link, bg.credit].filter(Boolean).join(" ");
    return INDOOR_OBJECT_RE.test(hay);
  }

  function isBarrenSceneSubject(bg) {
    if (!bg) return false;
    const hay = [bg.title, bg.url, bg.link].filter(Boolean).join(" ");
    return BARREN_SCENE_RE.test(hay);
  }

  function isUnderbridgeSceneSubject(bg) {
    if (!bg) return false;
    const hay = [bg.title, bg.url, bg.link, bg.description, bg.categories]
      .filter(Boolean)
      .join(" ");
    return UNDERBRIDGE_SCENE_RE.test(hay);
  }

  function isIndustrialSceneSubject(bg) {
    if (!bg) return false;
    const hay = [bg.title, bg.url, bg.link, bg.description, bg.categories, bg.credit]
      .filter(Boolean)
      .join(" ");
    return INDUSTRIAL_SCENE_RE.test(hay);
  }

  function isNightSceneSubject(bg) {
    if (!bg) return false;
    const hay = [bg.title, bg.url, bg.link].filter(Boolean).join(" ");
    return NIGHT_SCENE_RE.test(hay);
  }

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

  /** @deprecated indices — conservé pour migration douce */
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

  /** Tirage multi-banques (CSPRNG + anti-répétition URL + diversité). */
  function pickBackground(items, excludeUrl) {
    if (_rotator) {
      const excludeId = excludeUrl
        ? _rotator.photoId({ url: excludeUrl })
        : null;
      return _rotator.pick(items, {
        failedIds: _failedIds,
        excludeId,
      });
    }
    // Fallback sans lib
    const pool = items.map((_, i) => i);
    return items[pickIndex(pool)] || items[0] || null;
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

  function _srgbToLin(c) {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }

  function _relLuma(r, g, b) {
    return 0.2126 * _srgbToLin(r) + 0.7152 * _srgbToLin(g) + 0.0722 * _srgbToLin(b);
  }

  /**
   * Ratio largeur/hauteur réel du mât (fallback ~ bandeau large).
   */
  function _mastheadAspect() {
    const mast = document.querySelector(".masthead");
    if (mast && mast.clientWidth > 40 && mast.clientHeight > 20) {
      return Math.max(2.5, mast.clientWidth / mast.clientHeight);
    }
    return MASTHEAD_AR;
  }

  /**
   * Convertit le haut d’une fenêtre cover [y0, y0+win) (coords échantillon)
   * en focalY CSS pour background-position: 50% {focalY*100}%.
   *
   * Spec CSS : le point à Y% de l’image est placé à Y% du conteneur.
   * topFrac = (1 − visibleFrac) · focalY  ⇒  focalY = topFrac / (1 − visibleFrac).
   * (L’ancienne formule « centre de fenêtre / H » était fausse et décalait
   * le crop vers le bas — skyline montagnes perdu sur bandeau large.)
   */
  function _windowToFocalY(y0, sampleH, win) {
    if (sampleH <= 0 || win <= 0) return 0.5;
    const visibleFrac = Math.min(1, win / sampleH);
    if (visibleFrac >= 0.98) return 0.5;
    const topFrac = Math.max(0, Math.min(1, y0 / sampleH));
    const denom = 1 - visibleFrac;
    if (denom < 1e-6) return 0.5;
    return Math.min(1, Math.max(0, topFrac / denom));
  }

  /**
   * Photo de campus universitaire (banque universities ou titre/URL).
   * Mode focale distinct : ancrer la masse du pavillon, pas l’horizon paysage.
   */
  const CAMPUS_SUBJECT_RE =
    /(?:uqam|mcgill|concordia|laval|sherbrooke|bishop|universit|campus|pavillon|polytechnique|uqtr|uqac|uqar|uqo|uqat|\b[eé]ts\b|hec\s*montr|judith-?jasmin|roger-?gaudry|roddick|wilson\s*hall|loyola|longueuil)/i;

  function isCampusBackground(bg) {
    if (!bg) return false;
    if (bg.bank === "universities" || bg.campus === true || bg.profile === "universities") {
      return true;
    }
    const hay = [bg.title, bg.url, bg.link].filter(Boolean).join(" ");
    return CAMPUS_SUBJECT_RE.test(hay);
  }

  /**
   * Choisit le meilleur ancrage vertical pour background-size:cover.
   * Retourne focalY ∈ [0,1] (0 = haut de l’image, 1 = bas) pour
   * background-position: 50% {focalY*100}%.
   *
   * Heuristique :
   *  - maximiser structure + contraste dans la fenêtre cover ;
   *  - détecter l’horizon / skyline (fort gradient vertical de luminance)
   *    et le placer dans le tiers supérieur du bandeau — crucial en
   *    desktop où le mât est très large (visibleFrac ~0.2–0.35) ;
   *  - mode campus : ancrer la masse du pavillon (brique / béton / vitrage)
   *    au milieu du bandeau — pas le ciel ni la chaussée seule
   *    (ex. Judith-Jasmin UQAM : voir le volume UQAM, pas les cimes d’arbres) ;
   *  - détecter les « arches / trous » (Rocher Percé…) et les garder
   *    dans le crop, idéalement près du milieu vertical ;
   *  - éviter les crops « vase / batture » (bas texturé sans ciel) ;
   *  - un peu de ciel en haut de bande ; wordmark pas saturé de texture
   *    sauf si un landmark (arche) y est présent.
   *
   * @param {HTMLImageElement} img
   * @param {number} mastheadAr
   * @param {{ campus?: boolean }} [opts]
   */
  function computeBestFocalY(img, mastheadAr, opts) {
    const campusMode = !!(opts && opts.campus);
    const w = img.naturalWidth || 0;
    const h = img.naturalHeight || 0;
    if (w < 32 || h < 32) return 0.5;

    const ar = w / h;
    // Hauteur de la fenêtre source visible après cover (en fraction de h).
    // cover scale = max(mw/W, mh/H) ; sourceVisibleH/H = min(1, ar / mastheadAr)
    // quand l’image est moins large que le mât (cas typique).
    let visibleFrac = ar / Math.max(mastheadAr, 1.5);
    if (visibleFrac >= 0.98) return 0.5; // presque tout visible, centre ok
    visibleFrac = Math.min(0.95, Math.max(0.12, visibleFrac));

    // Échantillon réduit pour scorer des bandes horizontales.
    const sampleW = 160;
    const sampleH = Math.max(48, Math.round(sampleW / ar));
    const canvas = document.createElement("canvas");
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0.5;
    try {
      ctx.drawImage(img, 0, 0, sampleW, sampleH);
    } catch (_) {
      return 0.5;
    }
    let data;
    try {
      data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    } catch (_) {
      return 0.5;
    }

    const L = new Float32Array(sampleW * sampleH);
    const sat = new Float32Array(sampleW * sampleH);
    const Rch = new Uint8Array(sampleW * sampleH);
    const Gch = new Uint8Array(sampleW * sampleH);
    const Bch = new Uint8Array(sampleW * sampleH);
    for (let i = 0, p = 0; i < L.length; i++, p += 4) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      L[i] = _relLuma(r, g, b);
      const mx = Math.max(r, g, b) / 255;
      const mn = Math.min(r, g, b) / 255;
      sat[i] = (mx - mn) / (mx + 1e-6);
      Rch[i] = r;
      Gch[i] = g;
      Bch[i] = b;
    }

    // Score par ligne : edge, sat, mean + densité d’« arche » (trou).
    // Arche = pixel sombre ou poche de ciel, avec flancs plus clairs
    // (idéalement roche chaude) à gauche et à droite — signature du
    // Rocher Percé, d’une arche côtière, d’un passage entre piles, etc.
    const rowEdge = new Float32Array(sampleH);
    const rowSat = new Float32Array(sampleH);
    const rowMean = new Float32Array(sampleH);
    const rowArch = new Float32Array(sampleH);
    // Sable / vase beige (batture) — utile pour pénaliser un crop bas.
    const rowSand = new Float32Array(sampleH);
    // Ciel approximatif (bleu-gris clair).
    const rowSky = new Float32Array(sampleH);
    // Masse bâtie (brique chaude / béton gris / vitrage structurée) — campus.
    const rowBuild = new Float32Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let e = 0;
      let s = 0;
      let m = 0;
      let arch = 0;
      let sand = 0;
      let sky = 0;
      let build = 0;
      const rowBase = y * sampleW;
      for (let x = 0; x < sampleW; x++) {
        const i = rowBase + x;
        s += sat[i];
        m += L[i];
        if (x < sampleW - 1) {
          e += Math.abs(L[i] - L[i + 1]);
        }
        const r = Rch[i];
        const g = Gch[i];
        const b = Bch[i];
        const lv = L[i];
        // Beige / vase : R≈G > B, mi-tons.
        if (
          r >= g - 12 &&
          g > b + 12 &&
          lv > 0.12 &&
          lv < 0.55 &&
          sat[i] < 0.45
        ) {
          sand += 1;
        }
        // Ciel : plus bleu ou gris clair haut.
        if (
          (b > r + 6 && b > g - 10 && lv > 0.28) ||
          (lv > 0.45 && sat[i] < 0.18 && b >= g - 8)
        ) {
          sky += 1;
        }
        // Pavillon : brique (R chaud), béton gris, ou vitrage sombre en façade.
        if (lv > 0.06 && lv < 0.62) {
          const brick = r > b + 10 && r >= g - 10 && sat[i] > 0.07;
          const concrete =
            sat[i] < 0.16 && Math.abs(r - g) < 20 && Math.abs(g - b) < 22;
          const glassBand =
            lv < 0.35 &&
            Math.abs(r - g) < 25 &&
            b >= r - 15 &&
            sat[i] < 0.28;
          if (brick || concrete || glassBand) build += 1;
        }
        if (x >= 5 && x < sampleW - 5) {
          const isDark = lv < 0.18;
          const isSkyPocket =
            b > r + 12 && b > g - 8 && b > 90 && lv > 0.12;
          if (isDark || isSkyPocket) {
            const left = Math.max(L[i - 4], L[i - 5]);
            const right = Math.max(L[i + 4], L[i + 5]);
            if (left > lv + 0.07 && right > lv + 0.07) {
              // Flancs « roche » (R ≥ G, R > B) ou trou sombre encaissé.
              let flankRock = false;
              for (const dx of [-5, 5]) {
                const j = i + dx;
                if (Rch[j] >= Gch[j] && Rch[j] > Bch[j] - 10) {
                  flankRock = true;
                  break;
                }
              }
              if (flankRock || isDark) arch += 1;
            }
          }
        }
      }
      rowEdge[y] = e / Math.max(1, sampleW - 1);
      rowSat[y] = s / sampleW;
      rowMean[y] = m / sampleW;
      rowArch[y] = arch / sampleW;
      rowSand[y] = sand / sampleW;
      rowSky[y] = sky / sampleW;
      rowBuild[y] = build / sampleW;
    }

    // Masse structurée du pavillon (bâtiment × edges) — centre de masse.
    let buildMass = 0;
    let buildCOM = sampleH * 0.5;
    let buildWeighted = 0;
    for (let y = 0; y < sampleH; y++) {
      const wBuild = rowBuild[y] * (0.35 + Math.min(0.65, rowEdge[y] * 12));
      buildWeighted += wBuild;
      buildMass += wBuild * y;
    }
    if (buildWeighted > 1e-4) buildCOM = buildMass / buildWeighted;
    const buildFrac = (() => {
      let s = 0;
      for (let y = 0; y < sampleH; y++) s += rowBuild[y];
      return s / sampleH;
    })();
    // Campus uniquement si demandé (banque universities / titre).
    // Ne pas auto-détecter via buildFrac : grève/vase beige matche la
    // brique et basculerait les paysages lacustres en mode pavillon.
    const campusScene = campusMode;

    // Lissage 5-lignes pour stabiliser le pic d’arche (anti-bruit).
    const archSmooth = new Float32Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      const a0 = Math.max(0, y - 2);
      const a1 = Math.min(sampleH, y + 3);
      let sum = 0;
      for (let yy = a0; yy < a1; yy++) sum += rowArch[yy];
      archSmooth[y] = sum / (a1 - a0);
    }
    let archPeakY = 0;
    let archPeakScore = 0;
    for (let y = 0; y < sampleH; y++) {
      if (archSmooth[y] > archPeakScore) {
        archPeakScore = archSmooth[y];
        archPeakY = y;
      }
    }
    const hasStrongArch = archPeakScore > 0.015;

    // Horizon / skyline : plus fort gradient vertical de luminance dans
    // la moitié haute–médiane (évite le rivage bas). Ex. Lac des Deux-
    // Montagnes : chute ciel→montagnes/eau ~ y 0.22–0.28.
    let horizonY = -1;
    let horizonStrength = 0;
    const hLo = Math.max(2, Math.floor(sampleH * 0.04));
    const hHi = Math.min(sampleH - 3, Math.floor(sampleH * 0.72));
    for (let y = hLo; y <= hHi; y++) {
      // Gradient lissé 3 lignes (anti-nuages isolés).
      const g0 = Math.abs(rowMean[y] - rowMean[y - 1]);
      const g1 = Math.abs(rowMean[y + 1] - rowMean[y]);
      const g = 0.5 * g0 + 0.5 * g1;
      // Préférer une transition clair→sombre (ciel → massif / eau).
      const drop = rowMean[y - 1] - rowMean[Math.min(sampleH - 1, y + 1)];
      const scoreH = g + Math.max(0, drop) * 0.6;
      if (scoreH > horizonStrength) {
        horizonStrength = scoreH;
        horizonY = y;
      }
    }
    const hasHorizon = horizonY >= 0 && horizonStrength > 0.035;

    const win = Math.max(3, Math.round(sampleH * visibleFrac));
    const maxY0 = Math.max(0, sampleH - win);
    let bestScore = -Infinity;
    let bestY0 = Math.round(maxY0 / 2);

    // Bandeau très large (desktop) : l’horizon doit dominer le score,
    // sinon on colle en haut (ciel seul) ou au centre (vase seule).
    const thinBanner = visibleFrac < 0.42;

    for (let y0 = 0; y0 <= maxY0; y0++) {
      let edgeSum = 0;
      let satSum = 0;
      let meanSum = 0;
      let vGrad = 0;
      let archIn = 0;
      let archMid = 0;
      let sandSum = 0;
      let skySum = 0;
      let buildSum = 0;
      for (let y = y0; y < y0 + win; y++) {
        edgeSum += rowEdge[y];
        satSum += rowSat[y];
        meanSum += rowMean[y];
        sandSum += rowSand[y];
        skySum += rowSky[y];
        buildSum += rowBuild[y];
        if (y > y0) vGrad += Math.abs(rowMean[y] - rowMean[y - 1]);
        const a = archSmooth[y];
        if (a > archIn) archIn = a;
        const rel = (y - y0) / win;
        // Prefer landmark in the middle band of the crop (readable).
        if (rel >= 0.22 && rel <= 0.78 && a > archMid) archMid = a;
      }
      const edgeAvg = edgeSum / win;
      const satAvg = satSum / win;
      const meanAvg = meanSum / win;
      const vGradAvg = vGrad / Math.max(1, win - 1);
      const sandAvg = sandSum / win;
      const skyAvg = skySum / win;
      const buildAvg = buildSum / win;

      // Ciel en haut de la bande (lignes claires approximées par mean élevé)
      const topN = Math.max(1, Math.floor(win * 0.28));
      let topMean = 0;
      let topSky = 0;
      for (let y = y0; y < y0 + topN; y++) {
        topMean += rowMean[y];
        topSky += rowSky[y];
      }
      topMean /= topN;
      topSky /= topN;
      // En mode campus : moins de bonus ciel (évite crop sur cimes + ciel).
      const skyBonus = campusScene
        ? (topSky > 0.55 && buildAvg < 0.1 ? -0.25 : 0) +
          (topMean > 0.35 && topMean > meanAvg ? 0.06 : 0)
        : (topMean > 0.28 && topMean > meanAvg ? 0.18 : 0) +
          (topSky > 0.2 ? 0.12 : 0);

      // Zone wordmark : éviter texture ultra dense SAUF landmark (arche)
      const mid0 = y0 + Math.floor(win * 0.3);
      const mid1 = y0 + Math.floor(win * 0.7);
      let midEdge = 0;
      let midN = 0;
      for (let y = mid0; y < mid1; y++) {
        midEdge += rowEdge[y];
        midN++;
      }
      midEdge /= Math.max(1, midN);
      const wordmarkPenalty =
        archMid > 0.01
          ? 0
          : midEdge > 0.06
            ? (midEdge - 0.06) * 2.5
            : 0;

      // Pénalité herbe/monotone : sat moyenne basse + edge bas
      const flatPenalty = edgeAvg < 0.012 && satAvg < 0.2 ? 0.4 : 0;

      // Batture / vase dominante sans ciel → crop raté (ex. marée basse
      // Lac des Deux-Montagnes centré sur la grève).
      const mudflatPenalty =
        sandAvg > 0.28 && skyAvg < 0.1
          ? 0.55 + (sandAvg - 0.28) * 1.2
          : sandAvg > 0.4 && topSky < 0.08
            ? 0.35
            : 0;

      // Léger biais haut (discret) — campus : neutre (ne pas monter au ciel).
      const topBias = campusScene
        ? 0
        : (1 - y0 / Math.max(1, maxY0)) * 0.03;

      // Bonus arche : densité max dans la fenêtre + pic dans la zone centrale
      // + couverture du pic global (Rocher Percé, arches côtières…)
      const peakCovered =
        hasStrongArch && archPeakY >= y0 && archPeakY < y0 + win ? 0.55 : 0;
      const archBonus = archMid * 14 + archIn * 4 + peakCovered;

      // Horizon / skyline dans le bandeau, idéalement ~22–45 % du haut.
      // Campus : fortement amorti — un « horizon » urbain (toit / ciel)
      // ne doit pas coller le crop en haut (perd le pavillon UQAM).
      let horizonBonus = 0;
      if (hasHorizon && horizonY >= y0 && horizonY < y0 + win) {
        const relH = (horizonY - y0) / win;
        const ideal = 0.32;
        const dist = Math.abs(relH - ideal);
        horizonBonus = 0.85 * Math.max(0, 1 - dist / 0.45);
        if (thinBanner) horizonBonus *= 1.55;
        if (campusScene) horizonBonus *= 0.2;
      } else if (hasHorizon && !campusScene) {
        horizonBonus = thinBanner ? -0.7 : -0.35;
      }

      // Campus : densite du pavillon + COM de la masse dans le bandeau.
      let campusBonus = 0;
      if (campusScene) {
        campusBonus += buildAvg * 1.6;
        if (buildCOM >= y0 && buildCOM < y0 + win) {
          const relB = (buildCOM - y0) / win;
          // Façade lisible un peu sous le milieu (enseignes / étages).
          campusBonus += 1.1 * Math.max(0, 1 - Math.abs(relB - 0.52) / 0.42);
        } else {
          campusBonus -= 0.55;
        }
        // Trop de chaussée / bas sans masse bâtie.
        const botN = Math.max(1, Math.floor(win * 0.3));
        let botBuild = 0;
        for (let y = y0 + win - botN; y < y0 + win; y++) botBuild += rowBuild[y];
        botBuild /= botN;
        if (botBuild < 0.06 && buildAvg < 0.1) campusBonus -= 0.35;
        // Bandeau fin : surpondérer la masse (sinon edges des arbres gagnent).
        if (thinBanner) campusBonus *= 1.35;
      }

      const score =
        edgeAvg * (campusScene ? 1.1 : 1.6) +
        satAvg * 0.55 +
        vGradAvg * (campusScene ? 1.4 : 2.2) +
        skyBonus +
        topBias +
        archBonus +
        horizonBonus +
        campusBonus -
        wordmarkPenalty -
        flatPenalty -
        mudflatPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestY0 = y0;
      }
    }

    // Ancrage final :
    //  - campus : masse du pavillon au milieu du bandeau (voir le volume UQAM) ;
    //  - paysage + bandeau fin : horizon / skyline dans le tiers haut ;
    //  - arche forte : landmark centré.
    if (campusScene && buildWeighted > 0.02) {
      // ~0.5 = façade centrale ; un peu plus bas si COM déjà bas (rue).
      const idealRel = buildCOM / sampleH > 0.62 ? 0.48 : 0.52;
      const anchored = Math.round(buildCOM - idealRel * win);
      bestY0 = Math.max(0, Math.min(maxY0, anchored));
    } else if (hasHorizon && thinBanner && !hasStrongArch) {
      const idealRel = 0.3;
      const anchored = Math.round(horizonY - idealRel * win);
      bestY0 = Math.max(0, Math.min(maxY0, anchored));
    } else if (hasStrongArch) {
      const idealRel = 0.5;
      const anchored = Math.round(archPeakY - idealRel * win);
      bestY0 = Math.round(0.4 * bestY0 + 0.6 * Math.max(0, Math.min(maxY0, anchored)));
      bestY0 = Math.max(0, Math.min(maxY0, bestY0));
    }

    let focalY = _windowToFocalY(bestY0, sampleH, win);

    // Clamp doux : 0 et 1 sont valides (haut/bas alignés) ; on évite
    // seulement les collages accidentels hors [0,1].
    focalY = Math.min(1, Math.max(0, focalY));
    return focalY;
  }

  /**
   * position CSS pour cover : override banque > calcul auto > centre.
   * @returns {{ position: string, focalY: number }}
   */
  function resolveBackgroundPosition(img, bg) {
    if (bg && typeof bg.position === "string" && bg.position.trim()) {
      return { position: bg.position.trim(), focalY: null };
    }
    let focalY = 0.5;
    if (bg && typeof bg.focalY === "number" && !Number.isNaN(bg.focalY)) {
      focalY = Math.min(1, Math.max(0, bg.focalY));
    } else if (img) {
      try {
        focalY = computeBestFocalY(img, _mastheadAspect(), {
          campus: isCampusBackground(bg),
        });
      } catch (_) {
        focalY = 0.5;
      }
    }
    const pct = Math.round(focalY * 1000) / 10; // 1 décimale
    return { position: `50% ${pct}%`, focalY };
  }

  /**
   * Score d’aptitude wallpaper mât (cover crop simulé).
   * Aligné sur scripts/audit-quebec-backgrounds.py.
   * @returns {{ ok: boolean, reason?: string, metrics?: object }}
   */
  /**
   * Croix / flèche d’église au sommet d’un clocher blanc contre le ciel.
   * Échantillonne le haut du crop cover : lettrage croix sombre + sous-bassement
   * blanc uni (peinture, faible variance) + ciel au-dessus.
   * Évite les façades de campus (fenêtres = variance haute).
   */
  function _religiousSpireMetrics(L, sampleW, sampleH) {
    const bandH = Math.max(12, Math.floor(sampleH * 0.3));
    // Ré-échantillonner mentalement dans le haut du sample (déjà petit).
    const bw = sampleW;
    const bh = bandH;
    const hits = [];
    const yMax = Math.max(3, Math.floor(bh * 0.55));
    for (let y = 2; y < yMax; y++) {
      for (let x = 4; x < bw - 4; x++) {
        const i = y * sampleW + x;
        if (L[i] > 0.3) continue;
        let sky = 0;
        for (const [dx, dy] of [
          [-4, 0],
          [4, 0],
          [0, -3],
          [0, 3],
          [-3, -2],
          [3, -2],
          [-3, 2],
          [3, 2],
        ]) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < sampleH && xx >= 0 && xx < sampleW && L[yy * sampleW + xx] > 0.55) {
            sky++;
          }
        }
        if (sky < 4) continue;
        let vu = 0;
        let vd = 0;
        let hu = 0;
        let hd = 0;
        for (let k = 1; k < 12; k++) {
          if (y - k >= 0 && L[(y - k) * sampleW + x] < 0.34) vu++;
          else break;
        }
        for (let k = 1; k < 12; k++) {
          if (y + k < sampleH && L[(y + k) * sampleW + x] < 0.34) vd++;
          else break;
        }
        for (let k = 1; k < 9; k++) {
          if (x - k >= 0 && L[y * sampleW + x - k] < 0.34) hu++;
          else break;
        }
        for (let k = 1; k < 9; k++) {
          if (x + k < sampleW && L[y * sampleW + x + k] < 0.34) hd++;
          else break;
        }
        const vlen = vu + vd + 1;
        const hlen = hu + hd + 1;
        if (
          vlen >= 3 &&
          hlen >= 3 &&
          vlen <= 14 &&
          hlen <= 11 &&
          Math.min(hu, hd) >= 1 &&
          vu >= 1
        ) {
          hits.push({ x, y });
        }
      }
    }
    if (hits.length < 4) {
      return { hitCount: hits.length, dense: 0, solidWhite: false, skyAbove: 0, reject: false };
    }
    const xs = hits.map((h) => h.x);
    const win = Math.max(6, Math.floor(sampleW * 0.1));
    let best = 0;
    let bestX = xs[0];
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    for (let x0 = xMin; x0 <= xMax; x0++) {
      let c = 0;
      for (const x of xs) if (x >= x0 && x < x0 + win) c++;
      if (c > best) {
        best = c;
        bestX = x0;
      }
    }
    const cluster = hits.filter((h) => h.x >= bestX && h.x < bestX + win);
    if (best < 4 || !cluster.length) {
      return { hitCount: hits.length, dense: best, solidWhite: false, skyAbove: 0, reject: false };
    }
    const cy = Math.max(...cluster.map((h) => h.y));
    const cx =
      cluster.reduce((s, h) => s + h.x, 0) / cluster.length;
    const vals = [];
    for (let y = Math.min(sampleH - 1, cy + 2); y < Math.min(sampleH, cy + 22); y++) {
      for (let x = Math.max(0, Math.floor(cx) - 5); x < Math.min(sampleW, Math.floor(cx) + 6); x++) {
        vals.push(L[y * sampleW + x]);
      }
    }
    let mean = 0;
    for (const v of vals) mean += v;
    mean = vals.length ? mean / vals.length : 0;
    let varAcc = 0;
    for (const v of vals) varAcc += (v - mean) * (v - mean);
    const variance = vals.length > 1 ? Math.sqrt(varAcc / vals.length) : 0;
    let whiteN = 0;
    for (const v of vals) if (v > 0.55) whiteN++;
    const whiteFrac = vals.length ? whiteN / vals.length : 0;
    const solidWhite = mean >= 0.55 && variance <= 0.18 && whiteFrac >= 0.5;
    const ay = Math.max(0, Math.min(...cluster.map((h) => h.y)) - 1);
    let skyA = 0;
    let na = 0;
    for (let y = 0; y <= ay; y++) {
      for (let x = Math.max(0, Math.floor(cx) - 7); x < Math.min(sampleW, Math.floor(cx) + 8); x++) {
        if (L[y * sampleW + x] > 0.55) skyA++;
        na++;
      }
    }
    const skyAbove = na ? skyA / na : 0;
    const notGrid = hits.length <= best * 3.5;
    const reject = best >= 4 && solidWhite && skyAbove >= 0.55 && notGrid;
    return {
      hitCount: hits.length,
      dense: best,
      solidWhite,
      skyAbove: +skyAbove.toFixed(3),
      whiteFrac: +whiteFrac.toFixed(3),
      variance: +variance.toFixed(3),
      reject,
    };
  }

  /**
   * Enseigne institutionnelle (lettres UQAM, etc.) dans la zone wordmark :
   * densité de « traits » type lettrage + contraste local élevé + pixels clairs
   * (métal / PVC). Les façades sans logo restent sous les seuils.
   */
  function _competingLogoMetrics(L, sampleW, sampleH) {
    const x0 = Math.floor(sampleW * 0.22);
    const x1 = Math.floor(sampleW * 0.78);
    const y0 = Math.floor(sampleH * 0.28);
    const y1 = Math.floor(sampleH * 0.72);
    let bright = 0;
    let n = 0;
    let hiLocal = 0;
    let edgeSum = 0;
    let edgeN = 0;
    let strokeRows = 0;
    for (let y = y0; y < y1; y++) {
      let peaks = 0;
      for (let x = x0; x < x1; x++) {
        const i = y * sampleW + x;
        n++;
        if (L[i] > 0.55) bright++;
        if (x < x1 - 1) {
          const d = Math.abs(L[i] - L[i + 1]);
          edgeSum += d;
          edgeN++;
          if (d > 0.08) hiLocal++;
        }
        if (y < y1 - 1) {
          const d = Math.abs(L[i] - L[(y + 1) * sampleW + x]);
          edgeSum += d;
          edgeN++;
          if (d > 0.08) hiLocal++;
        }
        if (x > x0 + 1 && x < x1 - 2) {
          const g =
            Math.abs(L[i] - L[i - 1]) + Math.abs(L[i] - L[i + 1]);
          if (g > 0.12) peaks++;
        }
      }
      if (peaks >= 4) strokeRows++;
    }
    const rowCount = Math.max(1, y1 - y0);
    return {
      strokeFrac: strokeRows / rowCount,
      hiLocalFrac: n ? hiLocal / n : 0,
      brightFrac: n ? bright / n : 0,
      wmEdge: edgeN ? edgeSum / edgeN : 0,
    };
  }

  function scoreMastheadPhoto(img, bg) {
    const w = img.naturalWidth || 0;
    const h = img.naturalHeight || 0;
    if (w < 32 || h < 32) {
      return { ok: false, reason: "too_small" };
    }
    const aspect = w / h;
    if (aspect < MIN_ASPECT) {
      return {
        ok: false,
        reason: "portrait_or_narrow",
        metrics: { aspect: +aspect.toFixed(3), width: w, height: h },
      };
    }
    // Trop petit pour un bandeau large : upscale → grain / flou blocky
    const pixels = w * h;
    if (w < MIN_NATIVE_W || h < MIN_NATIVE_H || pixels < MIN_NATIVE_PX) {
      return {
        ok: false,
        reason: "low_resolution",
        metrics: {
          aspect: +aspect.toFixed(3),
          width: w,
          height: h,
          megapixels: +(pixels / 1e6).toFixed(2),
        },
      };
    }

    // Analyse canvas (CORS). Si tainted → aspect seul (la banque reste le filtre principal).
    // Crop = même logique que le paint (focalY auto / campus / banque).
    try {
      const sampleW = 240;
      const sampleH = Math.max(36, Math.round(sampleW / MASTHEAD_AR));
      let sx = 0;
      let sy = 0;
      let sw = w;
      let sh = h;
      if (aspect > MASTHEAD_AR) {
        sw = Math.round(h * MASTHEAD_AR);
        sx = Math.floor((w - sw) / 2);
      } else {
        sh = Math.round(w / MASTHEAD_AR);
        // topFrac = (1 − visibleFrac) · focalY  (visibleFrac = sh/h)
        let focalY = 0.5;
        if (bg && typeof bg.focalY === "number" && !Number.isNaN(bg.focalY)) {
          focalY = Math.min(1, Math.max(0, bg.focalY));
        } else {
          try {
            focalY = computeBestFocalY(img, MASTHEAD_AR, {
              campus: isCampusBackground(bg),
            });
          } catch (_) {
            focalY = 0.5;
          }
        }
        const topFrac = (1 - sh / h) * Math.min(1, Math.max(0, focalY));
        sy = Math.floor(h * topFrac);
        sy = Math.max(0, Math.min(h - sh, sy));
      }
      const canvas = document.createElement("canvas");
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { ok: true, reason: "no_canvas", metrics: { aspect } };
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
      const n = sampleW * sampleH;
      const L = new Float32Array(n);
      const S = new Float32Array(n);
      let sumL = 0;
      let sumSat = 0;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const luma = _relLuma(r, g, b);
        L[i] = luma;
        sumL += luma;
        const mx = Math.max(r, g, b) / 255;
        const mn = Math.min(r, g, b) / 255;
        const satP = (mx - mn) / (mx + 1e-6);
        S[i] = satP;
        sumSat += satP;
      }
      const meanL = sumL / n;
      const sat = sumSat / n;

      // Fraction de pixels « plats » (voisinage quasi constant) — route/canopée.
      let flatCount = 0;
      let flatN = 0;
      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const v = L[y * sampleW + x];
          const d = Math.max(
            Math.abs(v - L[y * sampleW + x - 1]),
            Math.abs(v - L[y * sampleW + x + 1]),
            Math.abs(v - L[(y - 1) * sampleW + x]),
            Math.abs(v - L[(y + 1) * sampleW + x])
          );
          if (d < 0.018) flatCount++;
          flatN++;
        }
      }
      const flatFrac = flatN ? flatCount / flatN : 0;

      let darkCount = 0;
      let greyCount = 0;
      let coldCount = 0;
      let warmCount = 0;
      let skyCount = 0;
      let warmSkyCount = 0;
      let sandCount = 0;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        if (L[i] < 0.12) darkCount++;
        if (S[i] < 0.15) greyCount++;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        if (b + 8 >= r && b + 8 >= g) coldCount++;
        if (r > g + 8 && r > b + 12) warmCount++;
        // Ciel bleu classique
        if (b >= r - 5 && b >= g - 10 && b / 255 > 0.28 && L[i] > 0.25) skyCount++;
        // Ciel doré / lever-coucher (ex. Sunrise Over Montréal) — pas bleu
        if (
          r > g + 5 &&
          r > b + 8 &&
          L[i] > 0.22 &&
          S[i] > 0.18 &&
          L[i] < 0.92
        ) {
          warmSkyCount++;
        }
        // Vase / grève beige-gris
        if (L[i] > 0.12 && L[i] < 0.48 && S[i] < 0.3 && Math.abs(r - g) < 38) {
          sandCount++;
        }
      }
      const darkFrac = darkCount / n;
      const greyFrac = greyCount / n;
      const coldFrac = coldCount / n;
      const warmFrac = warmCount / n;
      const skyFrac = skyCount / n;
      const warmSkyFrac = warmSkyCount / n;
      const sandFrac = sandCount / n;

      let te = 0;
      let ce = 0;
      let edgeN = 0;
      const third = Math.floor(sampleW / 3);
      for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW - 1; x++) {
          const d = Math.abs(L[y * sampleW + x] - L[y * sampleW + x + 1]);
          te += d;
          edgeN++;
          if (x >= third && x < third * 2) ce += d;
        }
      }
      for (let y = 0; y < sampleH - 1; y++) {
        for (let x = 0; x < sampleW; x++) {
          const d = Math.abs(L[y * sampleW + x] - L[(y + 1) * sampleW + x]);
          te += d;
          edgeN++;
          if (x >= third && x < third * 2) ce += d;
        }
      }
      const edgeMean = edgeN ? te / edgeN : 0;
      const centerEdgeFrac = te > 0 ? ce / te : 0;

      // Moitié haute (ciel après cover)
      const topH = Math.max(1, Math.floor(sampleH / 2));
      let topEdge = 0;
      let topEn = 0;
      let topSatAcc = 0;
      let topN = 0;
      for (let y = 0; y < topH; y++) {
        for (let x = 0; x < sampleW; x++) {
          topSatAcc += S[y * sampleW + x];
          topN++;
          if (x < sampleW - 1) {
            topEdge += Math.abs(L[y * sampleW + x] - L[y * sampleW + x + 1]);
            topEn++;
          }
        }
      }
      topEdge = topEn ? topEdge / topEn : 0;
      const topSat = topN ? topSatAcc / topN : 0;

      // Variété horizontale (écart-type des moyennes de colonnes)
      let colVar = 0;
      {
        const colMeans = new Float32Array(sampleW);
        for (let x = 0; x < sampleW; x++) {
          let s = 0;
          for (let y = 0; y < sampleH; y++) s += L[y * sampleW + x];
          colMeans[x] = s / sampleH;
        }
        let mean = 0;
        for (let x = 0; x < sampleW; x++) mean += colMeans[x];
        mean /= sampleW;
        let v = 0;
        for (let x = 0; x < sampleW; x++) {
          const d = colMeans[x] - mean;
          v += d * d;
        }
        colVar = Math.sqrt(v / sampleW);
      }

      // Bandes verticales : ciel (haut) vs silhouettes (milieu) — sweet spot bandeau
      const bandH = Math.max(1, Math.floor(sampleH / 3));
      let topMean = 0;
      let midMean = 0;
      let botMean = 0;
      let topBandN = 0;
      let midBandN = 0;
      let botBandN = 0;
      for (let y = 0; y < sampleH; y++) {
        let row = 0;
        for (let x = 0; x < sampleW; x++) row += L[y * sampleW + x];
        row /= sampleW;
        if (y < bandH) {
          topMean += row;
          topBandN++;
        } else if (y < bandH * 2) {
          midMean += row;
          midBandN++;
        } else {
          botMean += row;
          botBandN++;
        }
      }
      topMean = topBandN ? topMean / topBandN : 0;
      midMean = midBandN ? midMean / midBandN : 0;
      botMean = botBandN ? botMean / botBandN : 0;
      const horizonContrast = topMean - midMean;
      /**
       * Heure dorée + skyline en silhouette (réf. Sunrise Over Montréal) :
       * ciel chaud lumineux en haut, masses sombres au milieu, sat élevée,
       * variété horizontale (tours, pont). ≠ nuit urbaine (pas de bande claire chaude).
       */
      const goldenSilhouette =
        warmFrac > 0.35 &&
        sat > 0.28 &&
        topMean > 0.18 &&
        horizonContrast > 0.08 &&
        colVar > 0.04;

      // Côtés plats
      let sideFlat = 0;
      let sideN = 0;
      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          if (x >= third && x < third * 2) continue;
          const v = L[y * sampleW + x];
          if (
            Math.max(
              Math.abs(v - L[y * sampleW + x - 1]),
              Math.abs(v - L[y * sampleW + x + 1])
            ) < 0.015
          ) {
            sideFlat++;
          }
          sideN++;
        }
      }
      const sideFlatFrac = sideN ? sideFlat / sideN : 0;

      // Grain / bruit JPEG dans zones « plates » (ciel, brume) :
      // résidu vs voisinage — fort sur petites images upscalées ou files bruyants.
      let grainAcc = 0;
      let grainN = 0;
      for (let y = 1; y < sampleH - 1; y++) {
        for (let x = 1; x < sampleW - 1; x++) {
          const i = y * sampleW + x;
          const v = L[i];
          const neigh =
            (L[i - 1] + L[i + 1] + L[i - sampleW] + L[i + sampleW]) / 4;
          const localEdge = Math.max(
            Math.abs(v - L[i - 1]),
            Math.abs(v - L[i + 1]),
            Math.abs(v - L[i - sampleW]),
            Math.abs(v - L[i + sampleW])
          );
          // Uniquement dans les plages lisses (pas sur les vrais bords)
          if (localEdge < 0.04 && v > 0.22) {
            grainAcc += Math.abs(v - neigh);
            grainN++;
          }
        }
      }
      const flatGrain = grainN ? grainAcc / grainN : 0;

      const metrics = {
        aspect: +aspect.toFixed(3),
        width: w,
        height: h,
        megapixels: +(pixels / 1e6).toFixed(2),
        meanL: +meanL.toFixed(3),
        sat: +sat.toFixed(3),
        edge: +edgeMean.toFixed(4),
        flatFrac: +flatFrac.toFixed(3),
        flatGrain: +flatGrain.toFixed(4),
        darkFrac: +darkFrac.toFixed(3),
        greyFrac: +greyFrac.toFixed(3),
        coldFrac: +coldFrac.toFixed(3),
        warmFrac: +warmFrac.toFixed(3),
        skyFrac: +skyFrac.toFixed(3),
        warmSkyFrac: +warmSkyFrac.toFixed(3),
        sandFrac: +sandFrac.toFixed(3),
        topEdge: +topEdge.toFixed(4),
        topSat: +topSat.toFixed(3),
        topMean: +topMean.toFixed(3),
        midMean: +midMean.toFixed(3),
        horizonContrast: +horizonContrast.toFixed(3),
        goldenSilhouette,
        colVar: +colVar.toFixed(3),
        centerEdgeFrac: +centerEdgeFrac.toFixed(3),
        sideFlatFrac: +sideFlatFrac.toFixed(3),
      };

      if (meanL < MIN_MEAN_L) {
        return { ok: false, reason: "near_black", metrics };
      }
      // Silhouette skyline : darkFrac élevé OK si ciel doré lumineux (pas falaise noire)
      if (darkFrac > EXCESSIVE_DARK && !goldenSilhouette) {
        return { ok: false, reason: "excessive_dark", metrics };
      }
      if (
        sat < WINTER_GREY.sat &&
        greyFrac > WINTER_GREY.grey &&
        coldFrac > WINTER_GREY.cold
      ) {
        return { ok: false, reason: "winter_grey_wash", metrics };
      }
      if (
        meanL < NIGHT_FLAT.meanL &&
        sat < NIGHT_FLAT.sat &&
        edgeMean < NIGHT_FLAT.edge
      ) {
        return { ok: false, reason: "night_flat", metrics };
      }
      // Gros plan d’objet monochrome + ciel mort (ex. inuksuk)
      if (topEdge < 0.011 && topSat < 0.11 && sat < 0.16 && colVar < 0.055) {
        return { ok: false, reason: "dead_sky_monochrome", metrics };
      }
      if (
        sideFlatFrac > 0.58 &&
        sat < 0.15 &&
        colVar < 0.05 &&
        centerEdgeFrac > 0.35
      ) {
        return { ok: false, reason: "centered_object_voids", metrics };
      }
      if (sat < 0.1 && colVar < 0.06) {
        return { ok: false, reason: "near_greyscale_flat", metrics };
      }
      // Route / canopée / texture plate (ex. Wemotaci)
      if ((flatFrac > 0.72 && meanL < 0.28) || flatFrac > 0.78) {
        return { ok: false, reason: "washed_flat_scene", metrics };
      }
      // Canot / musée : pas de ciel (bleu ni doré), bois chaud
      // Exempte heure dorée skyline (réf. Sunrise Over Montréal).
      if (
        !goldenSilhouette &&
        skyFrac < 0.03 &&
        warmSkyFrac < 0.08 &&
        warmFrac > 0.55 &&
        coldFrac < 0.28 &&
        sat < 0.65
      ) {
        return { ok: false, reason: "indoor_warm_object", metrics };
      }
      // Toundra / rocaille grise (ultramafic) : sat basse, gris dominant, peu de chaleur
      if (sat < 0.18 && greyFrac > 0.5 && warmFrac < 0.18) {
        return { ok: false, reason: "barren_desaturated", metrics };
      }
      // Nuit urbaine (lumières) ≠ lever de soleil : pas de bande de ciel chaude lumineuse
      if (
        meanL < 0.15 &&
        sat > 0.32 &&
        !goldenSilhouette &&
        topMean < 0.2
      ) {
        return { ok: false, reason: "night_city_lights", metrics };
      }
      // Zone wordmark trop « piquetée » (fenêtres allumées sous le logo)
      // Approximée par l’ensemble du crop cover (bandeau déjà centré).
      // Heure dorée : texture de skyline OK (pas des pixels de fenêtres).
      if (
        !goldenSilhouette &&
        meanL < 0.18 &&
        sat > 0.28 &&
        edgeMean > 0.035
      ) {
        return { ok: false, reason: "busy_wordmark_zone", metrics };
      }
      // Façade / toits texturés désaturés (beige, béton, brique pâle) :
      // structure dense + peu de couleur → LE RADAR illisible.
      // Réf. : UdeM Roger-Gaudry crop mât (edge ~0.04, sat ~0.18, meanL ~0.37).
      if (
        !goldenSilhouette &&
        edgeMean >= BUSY_LOW_CHROMA.edge &&
        sat <= BUSY_LOW_CHROMA.satMax &&
        meanL >= BUSY_LOW_CHROMA.meanLMin &&
        meanL <= BUSY_LOW_CHROMA.meanLMax
      ) {
        return { ok: false, reason: "busy_low_chroma_facade", metrics };
      }
      // Enseigne concurrente (lettres UQAM, logo façade…) pile sous LE RADAR.
      // Image plus haute que large : cover = pleine largeur → impossible de
      // décaler en X ; on rejette plutôt que de laisser deux marques se superposer.
      const logoM = _competingLogoMetrics(L, sampleW, sampleH);
      metrics.logoStrokeFrac = +logoM.strokeFrac.toFixed(3);
      metrics.logoHiLocalFrac = +logoM.hiLocalFrac.toFixed(3);
      metrics.logoBrightFrac = +logoM.brightFrac.toFixed(3);
      metrics.logoWmEdge = +logoM.wmEdge.toFixed(4);
      if (
        !goldenSilhouette &&
        logoM.strokeFrac >= 0.75 &&
        logoM.hiLocalFrac >= 0.25 &&
        (logoM.brightFrac >= 0.08 || logoM.wmEdge >= 0.045)
      ) {
        return { ok: false, reason: "competing_logo_zone", metrics };
      }
      // Chapelle / église : croix sombre au-dessus d’un clocher blanc uni
      // (ex. Wôlinak titré sans « église » — filtre texte insuffisant).
      const spireM = _religiousSpireMetrics(L, sampleW, sampleH);
      metrics.spireHits = spireM.hitCount;
      metrics.spireDense = spireM.dense;
      metrics.spireSolidWhite = spireM.solidWhite;
      metrics.spireSkyAbove = spireM.skyAbove;
      if (!goldenSilhouette && spireM.reject) {
        return { ok: false, reason: "religious_architecture", metrics };
      }
      // Batture / vase : grève dominante, quasi pas de ciel
      if (
        sandFrac > 0.48 &&
        skyFrac < 0.08 &&
        warmSkyFrac < 0.08 &&
        !goldenSilhouette
      ) {
        return { ok: false, reason: "mudflat_barren", metrics };
      }
      // Grain trop gros (JPEG / upscale / bruit) dans les zones plates
      if (flatGrain > MAX_FLAT_GRAIN && grainN > 80) {
        return { ok: false, reason: "excessive_grain", metrics };
      }
      // Dessous de pont / dalle béton : ombres denses, quasi pas de ciel, gris.
      // Ex. Pont de l'Île-aux-Tourtes_02 (vue sous le tablier).
      if (
        !goldenSilhouette &&
        skyFrac < 0.12 &&
        darkFrac > 0.32 &&
        meanL > 0.12 &&
        meanL < 0.42 &&
        sat < 0.32 &&
        edgeMean > 0.016
      ) {
        return { ok: false, reason: "underbridge_concrete", metrics };
      }
      // Ciel bas gris + scène désaturée (aéroport / hangar / friche).
      // Ex. Les Cèdres Airport from railway track (topSat ~0.09, grey ~0.45).
      if (
        !goldenSilhouette &&
        topSat < 0.11 &&
        topMean > 0.28 &&
        topMean < 0.62 &&
        greyFrac > 0.35 &&
        sat < 0.26 &&
        meanL < 0.4
      ) {
        return { ok: false, reason: "drab_industrial_sky", metrics };
      }
      // Marqueur soft pour logs / futurs scores (réf. sweet-spot bandeau)
      if (goldenSilhouette) {
        metrics.sweetSpot = "golden_silhouette";
      }
      return { ok: true, metrics };
    } catch (_) {
      return { ok: true, reason: "cors_skip", metrics: { aspect: +aspect.toFixed(3) } };
    }
  }

  function _renderCredit(bg) {
    const el = document.getElementById("bg-photo-credit");
    if (!el) return;
    el.textContent = "";
    el.removeAttribute("hidden");
    const link = safeHttpsUrl(bg.link);
    const title = String(bg.title || "").trim();
    const credit = String(bg.credit || "").trim();
    const license = String(bg.license || "").trim();

    // Bureau : titre — auteur (licence)
    const full = document.createElement("span");
    full.className = "bg-photo-credit__full";
    if (title) full.appendChild(document.createTextNode(`${title} — `));
    if (link && credit) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = credit;
      full.appendChild(a);
    } else if (credit) {
      full.appendChild(document.createTextNode(credit));
    }
    if (license) full.appendChild(document.createTextNode(` (${license})`));

    // Mobile : ligne minimale — auteur · licence (lien si possible)
    const short = document.createElement("span");
    short.className = "bg-photo-credit__short";
    const shortLabel = credit || title || "Photo";
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = shortLabel;
      short.appendChild(a);
    } else {
      short.appendChild(document.createTextNode(shortLabel));
    }
    if (license) {
      short.appendChild(document.createTextNode(` · ${license}`));
    }
    short.title = [title, credit, license].filter(Boolean).join(" — ");

    el.appendChild(full);
    el.appendChild(short);
  }

  function _rejectAndRetry(bg, items, verdict) {
    if (typeof console !== "undefined" && console.info) {
      console.info("[bg] rejected", bg && bg.title, verdict.reason, verdict.metrics || "");
    }
    if (bg && bg.url) {
      const id =
        _rotator && _rotator.photoId
          ? _rotator.photoId(bg)
          : String(bg.url);
      _failedIds.add(id);
    }
    const next = pickBackground(items, bg && bg.url);
    if (next) _applyBackground(next, items);
  }

  function _paintBackground(bg, url, img) {
    const layer = document.getElementById("bg-photo-layer");
    if (!layer) return;
    const { position, focalY } = resolveBackgroundPosition(img || null, bg);
    layer.style.backgroundImage = `url("${url}")`;
    layer.style.backgroundSize = "cover";
    layer.style.backgroundRepeat = "no-repeat";
    layer.style.backgroundPosition = position;
    if (typeof console !== "undefined" && console.info) {
      console.info(
        "[bg] paint",
        bg.bank || "?",
        bg.title,
        position,
        focalY != null ? `focalY=${focalY}` : ""
      );
    }
    requestAnimationFrame(() => layer.classList.add("loaded"));
    _renderCredit(bg);
    if (_rotator) _rotator.record(bg);
    else _recordRecent(0);
  }

  function _applyBackground(bg, items) {
    if (!bg) return;
    if (!document.getElementById("bg-photo-layer")) return;
    const pool = items || _mastheadPool();

    // Curation textuelle : pas de religieux institutionnel ni objet d’intérieur.
    if (isReligiousSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "religious_subject" });
      return;
    }
    if (isIndoorObjectSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "indoor_object_subject" });
      return;
    }
    if (isBarrenSceneSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "barren_scene_subject" });
      return;
    }
    if (isUnderbridgeSceneSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "underbridge_scene_subject" });
      return;
    }
    if (isIndustrialSceneSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "industrial_scene_subject" });
      return;
    }
    if (isNightSceneSubject(bg)) {
      _rejectAndRetry(bg, pool, { ok: false, reason: "night_scene_subject" });
      return;
    }

    const url = _optimizedUrl(bg);

    // 1) Tentative CORS pour score canvas (luminance / nuit plate).
    // 2) Si CORS échoue → rechargement sans crossOrigin (aspect seul).
    const img = new Image();
    try {
      img.decoding = "async";
      img.crossOrigin = "anonymous";
    } catch (_) {}
    img.onload = () => {
      const verdict = scoreMastheadPhoto(img, bg);
      if (!verdict.ok) {
        _rejectAndRetry(bg, pool, verdict);
        return;
      }
      _paintBackground(bg, url, img);
    };
    img.onerror = () => {
      const fallback = new Image();
      try {
        fallback.decoding = "async";
      } catch (_) {}
      fallback.onload = () => {
        // Sans CORS : pas d’échantillonnage canvas — filtre aspect / résolution + position banque.
        const w = fallback.naturalWidth || 0;
        const h = fallback.naturalHeight || 0;
        const aspect = h ? w / h : 0;
        if (aspect < MIN_ASPECT) {
          _rejectAndRetry(bg, pool, {
            ok: false,
            reason: "portrait_or_narrow",
            metrics: { aspect: +aspect.toFixed(3), width: w, height: h },
          });
          return;
        }
        if (w < MIN_NATIVE_W || h < MIN_NATIVE_H || w * h < MIN_NATIVE_PX) {
          _rejectAndRetry(bg, pool, {
            ok: false,
            reason: "low_resolution",
            metrics: {
              aspect: +aspect.toFixed(3),
              width: w,
              height: h,
              megapixels: +((w * h) / 1e6).toFixed(2),
            },
          });
          return;
        }
        _paintBackground(bg, url, null);
      };
      fallback.onerror = () => {
        _rejectAndRetry(bg, pool, { ok: false, reason: "load_error" });
      };
      fallback.src = url;
    };
    img.src = url;
  }

  function init() {
    const all = _mastheadPool();
    if (!all.length) return;
    if (!document.getElementById("bg-photo-layer")) return;
    if (typeof console !== "undefined" && console.info) {
      const nL =
        typeof QUEBEC_BACKGROUNDS !== "undefined" ? QUEBEC_BACKGROUNDS.length : 0;
      const nU =
        typeof QUEBEC_UNIVERSITY_BACKGROUNDS !== "undefined"
          ? QUEBEC_UNIVERSITY_BACKGROUNDS.length
          : 0;
      const nN =
        typeof QUEBEC_NATIONS_BACKGROUNDS !== "undefined"
          ? QUEBEC_NATIONS_BACKGROUNDS.length
          : 0;
      const nF =
        typeof QUEBEC_FAVORITES_BACKGROUNDS !== "undefined"
          ? QUEBEC_FAVORITES_BACKGROUNDS.length
          : 0;
      console.info(
        `[bg] pool mât : ${all.length} (paysages ${nL} + campus ${nU} + nations ${nN} + favorites ${nF})` +
          (_rotator ? " · rotator CSPRNG" : " · fallback")
      );
    }
    const chosen = pickBackground(all);
    if (chosen) _applyBackground(chosen, all);
  }

  // Exposé pour tests / audit manuel en console.
  window.__lrScoreMastheadPhoto = scoreMastheadPhoto;
  window.__lrComputeBestFocalY = computeBestFocalY;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

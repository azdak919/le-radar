#!/usr/bin/env python3
"""
Audit sweet-spot des fonds de mât (module wallpaper page d’accueil).

Contexte d’affichage
--------------------
Chaque photo est peinte en `background-size: cover` dans un bandeau large
(~3.5–4:1) sous le wordmark LE RADAR + scrim. Ce n’est **pas** une galerie :
il faut un lieu / un paysage / une texture décorative lisible à cette échelle.

Hard rejects (runtime + curation)
---------------------------------
  HARD:religious_subject    titre/URL/description d’édifice religieux
                            institutionnel (église, croix, mosquée…).
                            Spiritualité autochtone / lieux des nations OK.
  HARD:religious_architecture  croix + clocher blanc détectés dans le crop
                            (titre lieu seul, ex. Wôlinak chapelle)
  HARD:portrait_or_narrow   aspect < 1.25
  HARD:near_black           luminance moyenne cover < 0.07
  HARD:night_flat           sombre + désaturé + peu de structure
  HARD:dead_sky_monochrome  ciel/haut plat gris + image quasi monochrome +
                            peu de variété horizontale (ex. gros plan d’inuksuk)
  HARD:centered_object_voids  sujet centré, côtés vides, désaturé, peu de
                            variété (objet isolé dans un bandeau)
  HARD:washed_flat_scene    cover crop trop uniforme (flat_frac élevé) —
                            route/canopée sombre sans intérêt en bandeau
  HARD:indoor_warm_object   intérieur / objet (canot musée…) : pas de ciel,
                            tons bois chauds, sat modérée (≠ feuillage d’automne)
  HARD:barren_desaturated   toundra / rocaille grise sans intérêt couleur
                            (ex. ultramafic panoramio)
  HARD:night_city_lights    skyline / scène sombre à lumières colorées —
                            le wordmark blanc devient illisible
                            (≠ golden_silhouette / lever de soleil)
  HARD:mudflat_barren       batture / vase / grève dénudée sans horizon
                            (ex. rive Lac des Deux-Montagnes à marée basse)
  HARD:competing_logo_zone  enseigne / lettrage institutionnel (ex. UQAM)
                            sous la zone wordmark LE RADAR — double marque
  HARD:busy_low_chroma_facade  façade/toits texturés désaturés (beige, béton)
                            edge haut + sat basse — wordmark illisible
                            (réf. Pavillon Roger-Gaudry crop mât)
  HARD:underbridge_concrete dessous de pont / dalle béton (ombres denses,
                            quasi pas de ciel) — ex. Île-aux-Tourtes_02
  HARD:drab_industrial_sky  ciel bas gris + scène désaturée (aéroport /
                            hangar / friche) — ex. Les Cèdres Airport
  HARD:low_resolution       native < ~1400×700 ou < 1.2 Mpx — upscale
                            grainy / blocky sur mât retina
  HARD:excessive_grain      bruit haute fréquence dans zones plates (ciel)

Sweet-spot (marqueur positif, pas un rejet)
------------------------------------------
  golden_silhouette         heure dorée + skyline (réf. Sunrise Over Montréal)

Soft (pénalités, rejet si score < 50)
-------------------------------------
  low_landscape, darkish, washed_out, few_midtones, greyish_wash, etc.

Usage
-----
  python3 scripts/audit-quebec-backgrounds.py
  python3 scripts/audit-quebec-backgrounds.py --json
  python3 scripts/audit-quebec-backgrounds.py --width 1000

Dépendance : Pillow.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow requis : pip install Pillow", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

MASTHEAD_AR = 3.8
MIN_ASPECT = 1.25
MIN_MEAN_L = 0.09  # bannières quasi noires (ex. chute Montmorency hiver)
MIN_NATIVE_W = 1400
MIN_NATIVE_H = 700
MIN_NATIVE_PX = 1_200_000
MAX_FLAT_GRAIN = 0.028
NIGHT_FLAT = {"mean_l": 0.14, "sat": 0.10, "edge": 0.012}
# Quasi toute la surface sous L=0.12 (falaise/hiver) — skylines sombres ~0.75 OK
EXCESSIVE_DARK = 0.82
# Gris froid monochrome (neige + roche, sat très basse)
WINTER_GREY = {"sat": 0.12, "grey": 0.50, "cold": 0.70}
UA = "LeRadar-bg-audit/1.3 (https://le-radar.ca; homepage wallpaper QA)"

# Sujets religieux institutionnels (titre / URL / crédit). Ne pas élargir aux
# toponymes « Saint-… » ni aux cultures autochtones.
RELIGIOUS_SUBJECT_RE = re.compile(
    r"(?i)"
    r"(?:"
    r"[\séè]glise|eglise|church|cathedral|cath[eé]drale?|"
    r"basilique|basilica|chapelle|chapel|coll[eé]giale|collegiale|"
    r"crucifix|\bcroix\b|crosses?\b|"
    r"mosqu[eé]e?|mosque|synagogue|"
    r"monast[eè]re|monastery|couvent|convent|"
    r"calvaire|cimetière|cemetery|minaret|clocher|"
    r"steeple|bell[\s-]?tower|paroisse|parish|"
    r"presbyt[eè]re|presbytery|lieu de culte|place of worship|"
    r"\bj[eé]sus\b|\bchrist\b|crucifi|"
    r"temple\s+(?:bouddh|hindou|sikh)|"
    r"tabernacle"
    r")"
)

# Pavillons campus (Casault, etc.) : tours / pierre grise ≠ lieu de culte.
CAMPUS_BUILDING_EXCEPTION_RE = re.compile(
    r"(?i)"
    r"(?:"
    r"casault|casseault|louis[\s_-]?jacques[\s_-]?casault|"
    r"pavillon|palasis|bonenfant|adrien[\s_-]?pouliot|"
    r"ferdinand[\s_-]?vandry|de[\s_-]?koninck|\bdkn\b|"
    r"alphonse[\s_-]?marie[\s_-]?parent|biermans|ernest[\s_-]?lemieux|"
    r"roger[\s_-]?gaudry|judith[\s_-]?jasmin|mcgreer|"
    r"arts[\s_-]?building|henry[\s_.-]?f[.\s_-]?hall|loyola"
    r")"
)

# Aligné maintain paysage (masthead/pomo) : façades mairie type clocher.
# L’audit mât est paysage — town hall n’est pas un wallpaper de bandeau.
TOWN_HALL_FACADE_RE = re.compile(
    r"(?i)(?:town[\s-]?hall|h[oô]tel[\s-]?de[\s-]?ville|city[\s-]?hall|\bmairie\b)"
)


def _entry_hay(entry: dict) -> str:
    return " ".join(
        str(entry.get(k) or "")
        for k in (
            "title",
            "url",
            "link",
            "credit",
            "license",
            "description",
            "categories",
        )
    )


def is_campus_building_exception(entry: dict | None) -> bool:
    if not entry:
        return False
    hay = _entry_hay(entry) + " " + str(entry.get("place") or "")
    if RELIGIOUS_SUBJECT_RE.search(hay):
        return False
    tags = entry.get("tags") or []
    if entry.get("campus") is True or entry.get("bank") == "universities" or (
        isinstance(tags, list) and "campus" in tags
    ):
        return True
    return bool(CAMPUS_BUILDING_EXCEPTION_RE.search(hay))


def looks_religious_subject(entry: dict) -> bool:
    if is_campus_building_exception(entry):
        return False
    return bool(RELIGIOUS_SUBJECT_RE.search(_entry_hay(entry)))


def looks_town_hall_facade(entry: dict) -> bool:
    return bool(TOWN_HALL_FACADE_RE.search(_entry_hay(entry)))


def parse_bank(path: Path) -> list[dict]:
    """Lit une banque depuis sa source de vérité JSON.

    Historique : cette fonction analysait le miroir généré
    `quebec-backgrounds-data.js` avec une expression régulière exigeant
    `{ url, credit, link, license, title }` et un `}` juste après `title`.
    L'ajout de `width` / `height` après `title` a fait que la regex ne
    correspondait plus à rien : le script s'arrêtait alors sur « Aucune entrée
    trouvée » et personne ne s'en apercevait — un audit muet passe pour un audit
    propre. On lit désormais le JSON, qui est la source déclarée en tête des
    miroirs, et dont le format ne dépend pas d'un ordre de champs.
    """
    if not path.exists():
        raise SystemExit(f"Banque introuvable : {path}")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Banque illisible ({path.name}) : {exc}") from exc

    if isinstance(raw, list):
        entries = raw
    elif isinstance(raw, dict):
        entries = next((v for v in raw.values() if isinstance(v, list)), [])
    else:
        entries = []

    entries = [e for e in entries if isinstance(e, dict) and e.get("url")]
    if not entries:
        # Bruyant et fatal, jamais silencieux : une banque vide est soit une
        # régression de format, soit une purge accidentelle. Les deux doivent
        # se voir.
        raise SystemExit(f"Aucune entrée exploitable dans {path.name}")
    return entries


def discover_banks() -> list[tuple[str, Path]]:
    """Toutes les banques du mât et du pomo, pas seulement les paysages.

    L'audit ne portait historiquement que sur `quebec-backgrounds-data.js` :
    campus, nations et favoris n'étaient jamais examinés, alors qu'ils
    alimentent eux aussi le mât.
    """
    banks = []
    for path in sorted(DATA_DIR.glob("quebec-*-backgrounds.json")):
        banks.append((path.stem.replace("quebec-", "").replace("-backgrounds", ""), path))
    landscapes = DATA_DIR / "quebec-backgrounds.json"
    if landscapes.exists():
        banks.insert(0, ("paysages", landscapes))
    if not banks:
        raise SystemExit(f"Aucune banque trouvée dans {DATA_DIR}")
    return banks


def thumb_url(raw_url: str, width: int) -> str:
    m = re.search(r"/([^/]+\.(?:jpe?g|png|webp|gif))$", raw_url, re.I)
    if not m:
        return raw_url
    filename = urllib.parse.unquote(m.group(1))
    return (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        f"{urllib.parse.quote(filename)}?width={width}"
    )


def fetch_image(url: str, retries: int = 3) -> Image.Image:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as resp:
                return Image.open(resp).convert("RGB")
        except urllib.error.HTTPError as exc:
            last_err = exc
            if exc.code in (429, 503) and attempt < retries - 1:
                time.sleep(2.5 * (attempt + 1))
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            if attempt < retries - 1:
                time.sleep(1.5)
                continue
            raise
    raise last_err or RuntimeError("fetch failed")


def cover_crop(im: Image.Image, ar: float = MASTHEAD_AR) -> Image.Image:
    w, h = im.size
    if w / h > ar:
        nw = int(h * ar)
        x0 = (w - nw) // 2
        return im.crop((x0, 0, x0 + nw, h))
    nh = int(w / ar)
    y0 = (h - nh) // 2
    return im.crop((0, y0, w, y0 + nh))


def lin(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def analyze(im: Image.Image) -> dict:
    """Métriques sur le cover-crop bandeau (pas sur l’image native entière)."""
    w, h = im.size
    aspect = w / h
    crop = cover_crop(im)
    sample = crop.resize((280, max(36, int(280 / MASTHEAD_AR))), Image.Resampling.BILINEAR)
    cw, ch = sample.size
    raw = list(sample.get_flattened_data()) if hasattr(sample, "get_flattened_data") else list(sample.getdata())
    pixels = (
        list(zip(raw[0::3], raw[1::3], raw[2::3]))
        if raw and not isinstance(raw[0], (tuple, list))
        else raw
    )
    n = len(pixels)

    L: list[float] = []
    sats: list[float] = []
    for r, g, b in pixels:
        L.append(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b))
        mx, mn = max(r, g, b) / 255.0, min(r, g, b) / 255.0
        sats.append((mx - mn) / (mx + 1e-6))

    mean_l = sum(L) / n
    sat = sum(sats) / n
    dark_frac = sum(1 for x in L if x < 0.12) / n
    mid_frac = sum(1 for x in L if 0.10 <= x <= 0.72) / n
    grey_frac = sum(1 for s in sats if s < 0.15) / n
    # Biais froid (B ≥ R et B ≥ G) — neige / ombre d’hiver
    cold_frac = 0.0
    warm_frac = 0.0
    sky_frac = 0.0
    warm_sky_frac = 0.0
    sand_frac = 0.0
    for r, g, b in pixels:
        if b + 8 >= r and b + 8 >= g:
            cold_frac += 1
        if r > g + 8 and r > b + 12:
            warm_frac += 1
    cold_frac /= n
    warm_frac /= n
    # Ciel bleu + ciel doré (lever/coucher — réf. Sunrise Over Montréal)
    idx = 0
    for r, g, b in pixels:
        luma = L[idx]
        s = sats[idx]
        idx += 1
        if b >= r - 5 and b >= g - 10 and (b / 255.0) > 0.28 and luma > 0.25:
            sky_frac += 1
        if r > g + 5 and r > b + 8 and luma > 0.22 and s > 0.18 and luma < 0.92:
            warm_sky_frac += 1
        # Vase / grève : mi-tons, faible sat, R≈G (beige-gris)
        if 0.12 < luma < 0.48 and s < 0.30 and abs(r - g) < 38:
            sand_frac += 1
    sky_frac /= n
    warm_sky_frac /= n
    sand_frac /= n

    t = cw // 3

    # Edges: total + fraction dans le tiers central (objet centré)
    te = 0.0
    ce = 0.0
    edge_n = 0
    for y in range(ch):
        for x in range(cw - 1):
            d = abs(L[y * cw + x] - L[y * cw + x + 1])
            te += d
            edge_n += 1
            if t <= x < 2 * t:
                ce += d
    for y in range(ch - 1):
        for x in range(cw):
            d = abs(L[y * cw + x] - L[(y + 1) * cw + x])
            te += d
            edge_n += 1
            if t <= x < 2 * t:
                ce += d
    edge = te / max(1, edge_n)
    center_edge_frac = ce / (te + 1e-9)

    # Zones plates (ciel / sol uniforme)
    flat = 0
    for y in range(1, ch - 1):
        for x in range(1, cw - 1):
            v = L[y * cw + x]
            if (
                max(
                    abs(v - L[y * cw + x - 1]),
                    abs(v - L[y * cw + x + 1]),
                    abs(v - L[(y - 1) * cw + x]),
                    abs(v - L[(y + 1) * cw + x]),
                )
                < 0.018
            ):
                flat += 1
    flat_frac = flat / max(1, (ch - 2) * (cw - 2))

    # Moitié haute (souvent le ciel après cover)
    top_h = max(1, ch // 2)
    top_edge = 0.0
    top_en = 0
    top_sat_acc = 0.0
    top_n = 0
    for y in range(top_h):
        for x in range(cw):
            top_sat_acc += sats[y * cw + x]
            top_n += 1
            if x < cw - 1:
                top_edge += abs(L[y * cw + x] - L[y * cw + x + 1])
                top_en += 1
    top_edge /= max(1, top_en)
    top_sat = top_sat_acc / max(1, top_n)

    # Variété horizontale (paysage = colonnes différentes)
    col_means = [sum(L[y * cw + x] for y in range(ch)) / ch for x in range(cw)]
    col_var = statistics.pstdev(col_means)

    left_m = sum(L[y * cw + x] for y in range(ch) for x in range(t)) / (ch * t)
    mid_m = sum(L[y * cw + x] for y in range(ch) for x in range(t, 2 * t)) / (ch * t)
    right_m = sum(L[y * cw + x] for y in range(ch) for x in range(2 * t, cw)) / (
        ch * (cw - 2 * t)
    )
    center_delta = abs(mid_m - (left_m + right_m) / 2)

    # Côtés « vides » (peu de structure)
    side_flat = 0
    sn = 0
    for y in range(1, ch - 1):
        for x in list(range(1, t)) + list(range(2 * t, cw - 1)):
            v = L[y * cw + x]
            if max(abs(v - L[y * cw + x - 1]), abs(v - L[y * cw + x + 1])) < 0.015:
                side_flat += 1
            sn += 1
    side_flat_frac = side_flat / max(1, sn)

    # Grain / bruit JPEG dans zones plates (ciel) — résidu vs voisinage
    grain_acc = 0.0
    grain_n = 0
    for y in range(1, ch - 1):
        for x in range(1, cw - 1):
            i = y * cw + x
            v = L[i]
            neigh = (L[i - 1] + L[i + 1] + L[i - cw] + L[i + cw]) / 4.0
            local_edge = max(
                abs(v - L[i - 1]),
                abs(v - L[i + 1]),
                abs(v - L[i - cw]),
                abs(v - L[i + cw]),
            )
            if local_edge < 0.04 and v > 0.22:
                grain_acc += abs(v - neigh)
                grain_n += 1
    flat_grain = grain_acc / grain_n if grain_n else 0.0

    # Zone wordmark
    wm = [
        L[y * cw + x]
        for y in range(int(ch * 0.25), int(ch * 0.75))
        for x in range(int(cw * 0.2), int(cw * 0.8))
    ]
    wm_mean = sum(wm) / len(wm)
    wm_std = statistics.pstdev(wm)

    # Enseigne concurrente (lettrage UQAM etc.) dans la zone wordmark
    lx0, lx1 = int(cw * 0.22), int(cw * 0.78)
    ly0, ly1 = int(ch * 0.28), int(ch * 0.72)
    bright = 0
    n_logo = 0
    hi_local = 0
    edge_sum = 0.0
    edge_n = 0
    stroke_rows = 0
    for y in range(ly0, ly1):
        peaks = 0
        for x in range(lx0, lx1):
            i = y * cw + x
            n_logo += 1
            if L[i] > 0.55:
                bright += 1
            if x < lx1 - 1:
                d = abs(L[i] - L[i + 1])
                edge_sum += d
                edge_n += 1
                if d > 0.08:
                    hi_local += 1
            if y < ly1 - 1:
                d = abs(L[i] - L[(y + 1) * cw + x])
                edge_sum += d
                edge_n += 1
                if d > 0.08:
                    hi_local += 1
            if lx0 + 1 < x < lx1 - 2:
                g = abs(L[i] - L[i - 1]) + abs(L[i] - L[i + 1])
                if g > 0.12:
                    peaks += 1
        if peaks >= 4:
            stroke_rows += 1
    row_count = max(1, ly1 - ly0)
    logo_stroke_frac = stroke_rows / row_count
    logo_hi_local_frac = hi_local / max(1, n_logo)
    logo_bright_frac = bright / max(1, n_logo)
    logo_wm_edge = edge_sum / max(1, edge_n)

    # Croix + clocher blanc / multi-tours pierre grise (religious_architecture)
    # SYNC-ID: religious-spire-v1 — miroir scripts/religious-facade-lib.js SPIRE_THRESHOLDS
    # et quebec-backgrounds.js _religiousSpireMetrics (ne pas diverger les seuils).
    sky_l = 0.5  # SPIRE_THRESHOLDS.skyL
    spire_hits: list[tuple[int, int]] = []
    y_max = max(3, int(ch * 0.3 * 0.55))
    for y in range(2, y_max):
        for x in range(4, cw - 4):
            i = y * cw + x
            if L[i] > 0.32:
                continue
            sky = 0
            for dx, dy in (
                (-4, 0),
                (4, 0),
                (0, -3),
                (0, 3),
                (-3, -2),
                (3, -2),
                (-3, 2),
                (3, 2),
            ):
                yy, xx = y + dy, x + dx
                if 0 <= yy < ch and 0 <= xx < cw and L[yy * cw + xx] > sky_l:
                    sky += 1
            if sky < 4:
                continue
            vu = vd = hu = hd = 0
            for k in range(1, 12):
                if y - k >= 0 and L[(y - k) * cw + x] < 0.36:
                    vu += 1
                else:
                    break
            for k in range(1, 12):
                if y + k < ch and L[(y + k) * cw + x] < 0.36:
                    vd += 1
                else:
                    break
            for k in range(1, 9):
                if x - k >= 0 and L[y * cw + x - k] < 0.36:
                    hu += 1
                else:
                    break
            for k in range(1, 9):
                if x + k < cw and L[y * cw + x + k] < 0.36:
                    hd += 1
                else:
                    break
            vlen, hlen = vu + vd + 1, hu + hd + 1
            if (
                vlen >= 3
                and hlen >= 3
                and vlen <= 14
                and hlen <= 11
                and min(hu, hd) >= 1
                and vu >= 1
            ):
                spire_hits.append((x, y))

    # Silhouette multi-tours / flèches (Casault)
    peak_xs: list[tuple[int, int, float]] = []
    band_h_sp = max(12, int(ch * 0.3))
    peak_y_max = max(4, int(band_h_sp * 0.65))
    for x in range(6, cw - 6, 2):
        best_peak = None
        for y in range(2, peak_y_max):
            i = y * cw + x
            if L[i] > 0.42:
                continue
            sky_n = 0
            for dx in range(-3, 4):
                if y - 2 >= 0 and L[(y - 2) * cw + x + dx] > sky_l:
                    sky_n += 1
                xx = min(cw - 1, max(0, x + dx))
                if L[y * cw + xx] > sky_l:
                    sky_n += 1
            if sky_n < 5:
                continue
            down = 0
            for k in range(1, 14):
                if y + k < ch and L[(y + k) * cw + x] < 0.48:
                    down += 1
                else:
                    break
            if down < 4:
                continue
            if best_peak is None or L[i] < best_peak[2]:
                best_peak = (x, y, L[i])
        if best_peak:
            peak_xs.append(best_peak)
    multi_peaks = 0
    if peak_xs:
        peak_xs.sort(key=lambda t: t[0])
        sep = max(10, int(cw * 0.12))
        last_x = -999
        for px, _py, _pl in peak_xs:
            if px - last_x >= sep:
                multi_peaks += 1
                last_x = px

    spire_dense = 0
    spire_reject = False
    solid_white = False
    solid_stone = False
    sky_a = 0.0
    pts = spire_hits if spire_hits else [(t[0], t[1]) for t in peak_xs]
    if len(pts) >= 1 and (len(spire_hits) >= 3 or multi_peaks >= 2):
        xs = [t[0] for t in pts]
        win = max(6, int(cw * 0.1))
        best_x = xs[0]
        for x0 in range(min(xs), max(xs) + 1):
            c = sum(1 for x in xs if x0 <= x < x0 + win)
            if c > spire_dense:
                spire_dense = c
                best_x = x0
        cluster = [t for t in pts if best_x <= t[0] < best_x + win]
        if cluster:
            cy = max(t[1] for t in cluster)
            cx = sum(t[0] for t in cluster) / len(cluster)
            vals = [
                L[y * cw + x]
                for y in range(min(ch - 1, cy + 2), min(ch, cy + 24))
                for x in range(max(0, int(cx) - 6), min(cw, int(cx) + 7))
            ]
            if vals:
                mean_v = sum(vals) / len(vals)
                var_v = statistics.pstdev(vals) if len(vals) > 1 else 0.0
                white_f = sum(1 for v in vals if v > 0.55) / len(vals)
                light_f = sum(1 for v in vals if v > 0.38) / len(vals)
                solid_white = mean_v >= 0.55 and var_v <= 0.18 and white_f >= 0.5
                solid_stone = (
                    0.36 <= mean_v <= 0.78
                    and var_v <= 0.2
                    and light_f >= 0.42
                    and white_f < 0.92
                )
                solid_base = solid_white or solid_stone
                ay = max(0, min(t[1] for t in cluster) - 1)
                sky_vals = [
                    L[y * cw + x]
                    for y in range(0, ay + 1)
                    for x in range(max(0, int(cx) - 7), min(cw, int(cx) + 8))
                ]
                sky_a = (
                    sum(1 for v in sky_vals if v > sky_l) / len(sky_vals)
                    if sky_vals
                    else 0.0
                )
                hit_n = max(len(spire_hits), len(peak_xs))
                not_grid = hit_n <= max(spire_dense, 1) * 4.2
                reject_white = (
                    spire_dense >= 4 and solid_white and sky_a >= 0.55 and not_grid
                )
                reject_stone = (
                    spire_dense >= 3
                    and solid_stone
                    and sky_a >= 0.42
                    and not_grid
                    and len(spire_hits) >= 3
                )
                reject_multi = (
                    multi_peaks >= 2
                    and solid_base
                    and sky_a >= 0.4
                    and (len(spire_hits) >= 2 or multi_peaks >= 3)
                    and not_grid
                )
                spire_reject = reject_white or reject_stone or reject_multi

    # Bandes haut/milieu pour silhouette skyline (heure dorée)
    band_h = max(1, ch // 3)
    top_mean = sum(L[y * cw + x] for y in range(band_h) for x in range(cw)) / (
        band_h * cw
    )
    mid_rows = max(1, min(band_h, ch - band_h))
    mid_mean = sum(
        L[y * cw + x]
        for y in range(band_h, band_h + mid_rows)
        for x in range(cw)
    ) / (mid_rows * cw)
    horizon_contrast = top_mean - mid_mean
    golden_silhouette = (
        warm_frac > 0.35
        and sat > 0.28
        and top_mean > 0.18
        and horizon_contrast > 0.08
        and col_var > 0.04
    )

    return {
        "native": f"{w}x{h}",
        "native_w": w,
        "native_h": h,
        "aspect": round(aspect, 3),
        "portrait": h > w,
        "mean_l": round(mean_l, 3),
        "sat": round(sat, 3),
        "dark_frac": round(dark_frac, 3),
        "mid_frac": round(mid_frac, 3),
        "grey_frac": round(grey_frac, 3),
        "cold_frac": round(cold_frac, 3),
        "warm_frac": round(warm_frac, 3),
        "sky_frac": round(sky_frac, 3),
        "warm_sky_frac": round(warm_sky_frac, 3),
        "sand_frac": round(sand_frac, 3),
        "edge": round(edge, 4),
        "flat_frac": round(flat_frac, 3),
        "flat_grain": round(flat_grain, 4),
        "flat_grain_n": grain_n,
        "center_edge_frac": round(center_edge_frac, 3),
        "center_delta": round(center_delta, 3),
        "col_var": round(col_var, 3),
        "top_edge": round(top_edge, 4),
        "top_sat": round(top_sat, 3),
        "top_mean": round(top_mean, 3),
        "mid_mean": round(mid_mean, 3),
        "horizon_contrast": round(horizon_contrast, 3),
        "golden_silhouette": golden_silhouette,
        "side_flat_frac": round(side_flat_frac, 3),
        "wm_mean": round(wm_mean, 3),
        "wm_std": round(wm_std, 3),
        "logo_stroke_frac": round(logo_stroke_frac, 3),
        "logo_hi_local_frac": round(logo_hi_local_frac, 3),
        "logo_bright_frac": round(logo_bright_frac, 3),
        "logo_wm_edge": round(logo_wm_edge, 4),
        "spire_reject": bool(spire_reject),
        "spire_dense": int(spire_dense),
        "spire_solid_white": bool(solid_white),
        "spire_solid_stone": bool(solid_stone),
        "spire_multi_peaks": int(multi_peaks),
        "spire_sky_above": round(sky_a, 3),
        "left": round(left_m, 3),
        "mid": round(mid_m, 3),
        "right": round(right_m, 3),
        "balance": round(max(left_m, mid_m, right_m) / (min(left_m, mid_m, right_m) + 1e-4), 2),
    }


def score(metrics: dict, entry: dict | None = None) -> dict:
    reasons: list[str] = []
    hard = False
    s = 100.0

    # ── Hard rejects ──────────────────────────────────────────────
    if entry and looks_religious_subject(entry):
        hard = True
        reasons.append("HARD:religious_subject")
    if entry and looks_town_hall_facade(entry):
        hard = True
        reasons.append("HARD:town_hall_facade")
    if metrics["portrait"] or metrics["aspect"] < MIN_ASPECT:
        hard = True
        reasons.append("HARD:portrait_or_narrow")
    # Résolution native (anti-grain upscale mât / pomo).
    #
    # `metrics.native_*` décrit la VIGNETTE téléchargée (--width, 1000 px par
    # défaut), jamais l'original : s'en servir ici rejetait les 127 photos en
    # « low_resolution », y compris des images 3648×2736. Un audit qui rejette
    # tout ne dit plus rien, et c'est probablement pourquoi ses sorties
    # n'étaient pas suivies. On lit donc les dimensions natives stockées en
    # banque, et on ne retombe sur la vignette que si elles manquent.
    nw = int((entry or {}).get("width") or 0)
    nh = int((entry or {}).get("height") or 0)
    if not (nw and nh):
        nw = int(metrics.get("native_w") or 0)
        nh = int(metrics.get("native_h") or 0)
        # Vignette seule : on ne peut pas conclure sur la résolution native.
        # Le signaler comme lacune de données plutôt que comme rejet.
        if nw and nh:
            reasons.append("SOFT:native_size_unknown")
            nw = nh = 0
    if nw and nh:
        if nw < MIN_NATIVE_W or nh < MIN_NATIVE_H or nw * nh < MIN_NATIVE_PX:
            hard = True
            reasons.append("HARD:low_resolution")
    if metrics.get("flat_grain", 0) > MAX_FLAT_GRAIN and metrics.get("flat_grain_n", 0) > 80:
        hard = True
        reasons.append("HARD:excessive_grain")
    if metrics["mean_l"] < MIN_MEAN_L:
        hard = True
        reasons.append("HARD:near_black")
    golden = bool(metrics.get("golden_silhouette"))
    if metrics.get("dark_frac", 0) > EXCESSIVE_DARK and not golden:
        hard = True
        reasons.append("HARD:excessive_dark")
    if (
        metrics["sat"] < WINTER_GREY["sat"]
        and metrics.get("grey_frac", 0) > WINTER_GREY["grey"]
        and metrics.get("cold_frac", 0) > WINTER_GREY["cold"]
    ):
        hard = True
        reasons.append("HARD:winter_grey_wash")
    if (
        metrics["mean_l"] < NIGHT_FLAT["mean_l"]
        and metrics["sat"] < NIGHT_FLAT["sat"]
        and metrics["edge"] < NIGHT_FLAT["edge"]
    ):
        hard = True
        reasons.append("HARD:night_flat")

    # Gros plan d’objet (inuksuk, monument) : ciel mort + monochrome + bandeau plat
    if (
        metrics["top_edge"] < 0.011
        and metrics["top_sat"] < 0.11
        and metrics["sat"] < 0.16
        and metrics["col_var"] < 0.055
    ):
        hard = True
        reasons.append("HARD:dead_sky_monochrome")

    # Sujet centré, côtés vides, peu de couleur / de variété horizontale
    if (
        metrics["side_flat_frac"] > 0.58
        and metrics["sat"] < 0.15
        and metrics["col_var"] < 0.05
        and metrics["center_edge_frac"] > 0.35
    ):
        hard = True
        reasons.append("HARD:centered_object_voids")

    # Quasi monochrome + très peu de structure horizontale
    if metrics["sat"] < 0.10 and metrics["col_var"] < 0.06:
        hard = True
        reasons.append("HARD:near_greyscale_flat")

    # Scène lavée / canopée / route : trop de zones plates (ex. Wemotaci)
    if metrics["flat_frac"] > 0.72 and metrics["mean_l"] < 0.28:
        hard = True
        reasons.append("HARD:washed_flat_scene")
    elif metrics["flat_frac"] > 0.78:
        hard = True
        reasons.append("HARD:washed_flat_scene")

    # Intérieur / objet musée (canot) : pas de ciel bleu ni doré, bois chaud
    # Exempte heure dorée skyline (réf. Sunrise Over Montréal).
    if (
        not golden
        and metrics.get("sky_frac", 1) < 0.03
        and metrics.get("warm_sky_frac", 0) < 0.08
        and metrics.get("warm_frac", 0) > 0.55
        and metrics.get("cold_frac", 1) < 0.28
        and metrics["sat"] < 0.65
    ):
        hard = True
        reasons.append("HARD:indoor_warm_object")

    # Rocaille / toundra grise (ultramafic) : sat basse, très gris, peu de chaleur
    if (
        metrics["sat"] < 0.18
        and metrics.get("grey_frac", 0) > 0.50
        and metrics.get("warm_frac", 1) < 0.18
    ):
        hard = True
        reasons.append("HARD:barren_desaturated")

    # Nuit urbaine ≠ lever de soleil (bande de ciel chaude lumineuse)
    if (
        metrics["mean_l"] < 0.15
        and metrics["sat"] > 0.32
        and not golden
        and metrics.get("top_mean", 0) < 0.2
    ):
        hard = True
        reasons.append("HARD:night_city_lights")
    # Zone wordmark trop contrastée / piquetée de lumières
    if (
        metrics.get("wm_mean", 1) < 0.18
        and metrics.get("wm_std", 0) > 0.09
        and metrics["sat"] > 0.28
    ):
        hard = True
        reasons.append("HARD:busy_wordmark_zone")
    # Façade texturée désaturée (réf. Roger-Gaudry crop mât)
    if (
        not metrics.get("golden_silhouette")
        and metrics.get("edge", 0) >= 0.03
        and metrics.get("sat", 1) <= 0.24
        and 0.2 <= metrics.get("mean_l", 0) <= 0.58
    ):
        hard = True
        reasons.append("HARD:busy_low_chroma_facade")

    # Enseigne institutionnelle (lettres UQAM…) sous LE RADAR
    if (
        not golden
        and metrics.get("logo_stroke_frac", 0) >= 0.75
        and metrics.get("logo_hi_local_frac", 0) >= 0.25
        and (
            metrics.get("logo_bright_frac", 0) >= 0.08
            or metrics.get("logo_wm_edge", 0) >= 0.045
        )
    ):
        hard = True
        reasons.append("HARD:competing_logo_zone")

    # Croix + clocher blanc (architecture religieuse sans mot « église » au titre).
    # Casault / pavillons campus : exception (tours ≠ lieu de culte).
    if (
        not golden
        and metrics.get("spire_reject")
        and not is_campus_building_exception(entry)
    ):
        hard = True
        reasons.append("HARD:religious_architecture")

    # Dessous de pont / béton (ex. Île-aux-Tourtes vue sous le tablier)
    if (
        not golden
        and metrics.get("sky_frac", 1) < 0.12
        and metrics.get("dark_frac", 0) > 0.32
        and 0.12 < metrics.get("mean_l", 0) < 0.42
        and metrics.get("sat", 1) < 0.32
        and metrics.get("edge", 0) > 0.016
    ):
        hard = True
        reasons.append("HARD:underbridge_concrete")

    # Ciel bas gris + scène désaturée (aéroport / hangar / friche)
    if (
        not golden
        and metrics.get("top_sat", 1) < 0.11
        and 0.28 < metrics.get("top_mean", 0) < 0.62
        and metrics.get("grey_frac", 0) > 0.35
        and metrics.get("sat", 1) < 0.26
        and metrics.get("mean_l", 1) < 0.4
    ):
        hard = True
        reasons.append("HARD:drab_industrial_sky")

    # Batture / vase : beaucoup de sable-beige, quasi pas de ciel
    if metrics.get("sand_frac", 0) > 0.48 and metrics.get("sky_frac", 1) < 0.08:
        hard = True
        reasons.append("HARD:mudflat_barren")

    # ── Soft penalties ────────────────────────────────────────────
    if metrics["aspect"] < 1.35:
        s -= 10
        reasons.append("low_landscape")
    if metrics["mean_l"] < 0.12:
        s -= 12
        reasons.append("darkish")
    if metrics["mean_l"] > 0.82:
        s -= 15
        reasons.append("washed_out")
    if metrics["mid_frac"] < 0.25:
        s -= 10
        reasons.append("few_midtones")
    if metrics["wm_std"] < 0.03 and metrics["wm_mean"] < 0.12:
        s -= 12
        reasons.append("flat_wordmark_zone")
    if metrics["edge"] < 0.008:
        s -= 12
        reasons.append("no_structure")
    if metrics["balance"] > 8:
        s -= 8
        reasons.append("unbalanced")
    if metrics["sat"] < 0.14 and metrics["flat_frac"] > 0.40:
        s -= 14
        reasons.append("greyish_wash")
    if metrics["col_var"] < 0.05 and metrics["sat"] < 0.18:
        s -= 12
        reasons.append("low_horizontal_variety")
    if metrics["top_edge"] < 0.012 and metrics["top_sat"] < 0.12 and metrics["sat"] < 0.18:
        s -= 10
        reasons.append("dead_top")

    # Bonus
    if 1.45 <= metrics["aspect"] <= 3.8:
        s += 5
    if 0.18 <= metrics["mean_l"] <= 0.55:
        s += 8
    if metrics["mid_frac"] >= 0.45:
        s += 5
    if metrics["sat"] >= 0.12:
        s += 3
    if metrics["col_var"] >= 0.07:
        s += 4

    if hard:
        s = min(s, 28)
    score_i = int(max(0, min(100, s)))
    return {
        "score": score_i,
        "reject": hard or score_i < 50,
        "reasons": reasons,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--width", type=int, default=1000, help="Largeur du thumb Commons")
    ap.add_argument("--json", action="store_true", help="Sortie JSON")
    ap.add_argument("--delay", type=float, default=0.8, help="Pause entre fetch (anti-429)")
    ap.add_argument("--bank", default=None, help="Limiter à une banque (paysages, university, nations…)")
    ap.add_argument("--limit", type=int, default=0, help="Plafond d'entrées (0 = toutes)")
    args = ap.parse_args()

    banks = discover_banks()
    if args.bank:
        banks = [(n, p) for n, p in banks if args.bank.lower() in n.lower()]
        if not banks:
            raise SystemExit(f"Aucune banque ne correspond à « {args.bank} »")

    bank = []
    for name, path in banks:
        for idx, entry in enumerate(parse_bank(path)):
            bank.append({**entry, "bank": name, "bankIndex": idx})
    if args.limit:
        bank = bank[: args.limit]

    rows = []
    for i, entry in enumerate(bank):
        if i and args.delay:
            time.sleep(args.delay)
        url = thumb_url(entry["url"], args.width)
        try:
            # Rejet religieux même sans téléchargement (curation textuelle).
            if looks_religious_subject(entry):
                rows.append(
                    {
                        **entry,
                        "fetch": "skipped",
                        "score": 0,
                        "reject": True,
                        "reasons": ["HARD:religious_subject"],
                    }
                )
                continue
            im = fetch_image(url)
            metrics = analyze(im)
            verdict = score(metrics, entry)
            rows.append({**entry, **metrics, **verdict, "fetch": "ok"})
        except Exception as exc:  # noqa: BLE001
            rows.append(
                {
                    **entry,
                    "fetch": f"error: {exc}",
                    "score": 0,
                    "reject": True,
                    "reasons": ["HARD:fetch_failed"],
                }
            )

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print(
            f"{'sc':>3} {'':6} {'title':34} ar   L    sat  flat cEd  colV topE reasons"
        )
        for r in sorted(rows, key=lambda x: (-(not x["reject"]), -x.get("score", 0))):
            flag = "REJ" if r["reject"] else "OK"
            print(
                f"{r['score']:3d} {flag:6} {r['title'][:34]:34} "
                f"{r.get('aspect', 0):4.2f} {r.get('mean_l', 0):.2f} {r.get('sat', 0):.2f} "
                f"{r.get('flat_frac', 0):.2f} {r.get('center_edge_frac', 0):.2f} "
                f"{r.get('col_var', 0):.3f} {r.get('top_edge', 0):.3f} "
                f"{','.join(r.get('reasons') or [])}"
            )
        rejected = [r for r in rows if r["reject"]]
        print(f"\n{len(rows)} photos — {len(rejected)} rejet(s)")
        if rejected:
            print("À retirer / remplacer :")
            for r in rejected:
                print(f"  - {r['title']}: {', '.join(r['reasons'])}")

    return 1 if any(r["reject"] for r in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())

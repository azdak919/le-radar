#!/usr/bin/env python3
"""
LE RADAR — signal saisonnier VISUEL (thumb) pour le bot detect-photo-seasons.

Lit des lignes JSON sur stdin : {"id","url"}
Écrit des lignes JSON sur stdout : {"id","season","season6","confidence","metrics"}

Heuristiques couleur (bandeau paysage, pas classification ML) :
  - hiver : forte fraction de pixels très clairs / froids (neige)
  - automne : oranges / rouges feuillage
  - ete : verts saturés
  - printemps : verts plus doux + luminosité moyenne

Dépendance : Pillow. Échec soft → ligne {"id","error"} (le bot Node ignore).
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("Pillow requis", file=sys.stderr)
    sys.exit(2)

UA = "LeRadar-season-detect/1.0 (https://le-radar.ca; wallpaper season bot)"
THUMB_W = 480


def thumb_url(raw: str) -> str:
    m = re.search(r"/([^/]+\.(?:jpe?g|png|webp|gif))$", raw, re.I)
    if not m:
        return raw
    name = urllib.parse.unquote(m.group(1))
    return (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        + urllib.parse.quote(name)
        + f"?width={THUMB_W}"
    )


def fetch_image(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as res:
        data = res.read()
    im = Image.open(BytesIO(data)).convert("RGB")
    return im


def analyze(im: Image.Image) -> dict:
    # Downsample further for speed
    im = im.copy()
    im.thumbnail((320, 200))
    w, h = im.size
    px = list(im.getdata())
    n = max(1, len(px))

    snow_white = 0
    snow_lower = 0
    masonry = 0
    warm_leaf = 0
    green_leaf = 0
    dark = 0
    mean_l = 0.0
    lower_n = 0

    for i, (r, g, b) in enumerate(px):
        y = i // w
        in_lower = y > h * 0.35
        if in_lower:
            lower_n += 1
        # luminance approx
        l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        mean_l += l
        if l < 0.12:
            dark += 1
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0.0 if mx == 0 else (mx - mn) / mx
        # Neige : presque blanc, très peu saturé, légèrement froid.
        # La pierre / le béton (l ~ 0.4–0.8) ne doit PAS compter.
        is_snow = l > 0.86 and sat < 0.09 and b + 4 >= r
        if is_snow:
            snow_white += 1
            if in_lower:
                snow_lower += 1
        if 0.28 <= l <= 0.80 and sat < 0.16:
            masonry += 1
        # autumn leaf: orange/red
        if r > 90 and r > g * 1.15 and r > b * 1.25 and l > 0.2 and l < 0.85:
            warm_leaf += 1
        # green summer
        if g > r * 1.08 and g > b * 1.05 and g > 50 and l > 0.18 and l < 0.8:
            green_leaf += 1

    mean_l /= n
    snow_f = snow_white / n
    snow_lo = snow_lower / max(1, lower_n)
    masonry_f = masonry / n
    warm_f = warm_leaf / n
    green_f = green_leaf / n
    dark_f = dark / n
    # Alias historique pour les métriques / callers
    cold_f = snow_f

    winter_score = 0.0
    # Pierre grise dominante + peu de vrai blanc → pas l'hiver.
    if masonry_f > 0.22 and snow_f < 0.16:
        winter_score = 0.0
    elif snow_lo >= 0.14 and snow_f >= 0.10:
        winter_score = snow_f * 2.6 + snow_lo * 0.8
    else:
        winter_score = 0.0

    scores = {
        "hiver": winter_score,
        "automne": warm_f * 2.5,
        "ete": green_f * 2.2 + (0.1 if green_f > 0.12 and mean_l > 0.35 else 0),
        "printemps": green_f * 1.4 + (0.12 if 0.08 < green_f < 0.22 and mean_l > 0.4 else 0),
    }
    # night-ish: no season claim
    if dark_f > 0.55 and mean_l < 0.28:
        return {
            "season": None,
            "season6": None,
            "confidence": 0.0,
            "metrics": {
                "mean_l": round(mean_l, 3),
                "cold_f": round(cold_f, 3),
                "snow_f": round(snow_f, 3),
                "masonry_f": round(masonry_f, 3),
                "warm_f": round(warm_f, 3),
                "green_f": round(green_f, 3),
                "dark_f": round(dark_f, 3),
                "skip": "too_dark",
            },
        }

    best = max(scores, key=scores.get)
    raw = scores[best]
    conf = min(0.82, max(0.0, raw))
    if conf < 0.28:
        return {
            "season": None,
            "season6": None,
            "confidence": round(conf, 3),
            "metrics": {
                "mean_l": round(mean_l, 3),
                "cold_f": round(cold_f, 3),
                "snow_f": round(snow_f, 3),
                "masonry_f": round(masonry_f, 3),
                "warm_f": round(warm_f, 3),
                "green_f": round(green_f, 3),
                "scores": {k: round(v, 3) for k, v in scores.items()},
            },
        }

    s6 = {
        "hiver": "ukiuq",
        "printemps": "upingaaq",
        "ete": "aujaq",
        "automne": "ukiaq",
    }.get(best)

    return {
        "season": best,
        "season6": s6,
        "confidence": round(min(0.8, conf + 0.15), 3),
        "metrics": {
            "mean_l": round(mean_l, 3),
            "cold_f": round(cold_f, 3),
            "snow_f": round(snow_f, 3),
            "masonry_f": round(masonry_f, 3),
            "warm_f": round(warm_f, 3),
            "green_f": round(green_f, 3),
            "scores": {k: round(v, 3) for k, v in scores.items()},
        },
    }


def _selftest() -> int:
    """Contrôles hors-réseau : pierre grise ≠ hiver, neige et feuillage OK."""
    grey = Image.new("RGB", (320, 200), (152, 154, 158))
    snow = Image.new("RGB", (320, 200), (70, 120, 190))
    for y in range(80, 200):
        for x in range(320):
            snow.putpixel((x, y), (244, 246, 248))
    green = Image.new("RGB", (320, 200), (42, 138, 58))
    g = analyze(grey)
    s = analyze(snow)
    e = analyze(green)
    ok = True
    if g.get("season") == "hiver":
        print("FAIL grey stone tagged hiver", g, file=sys.stderr)
        ok = False
    if s.get("season") != "hiver":
        print("FAIL snow not tagged hiver", s, file=sys.stderr)
        ok = False
    if e.get("season") != "ete":
        print("FAIL green not tagged ete", e, file=sys.stderr)
        ok = False
    if not ok:
        return 1
    print("ok detect-photo-seasons-visual selftest")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        pid = row.get("id") or row.get("url") or ""
        url = row.get("url") or ""
        if not url:
            print(json.dumps({"id": pid, "error": "no_url"}, ensure_ascii=False))
            continue
        try:
            im = fetch_image(thumb_url(url))
            out = analyze(im)
            out["id"] = pid
            out["url"] = url
            print(json.dumps(out, ensure_ascii=False), flush=True)
        except Exception as e:  # noqa: BLE001
            print(
                json.dumps({"id": pid, "url": url, "error": str(e)[:160]}, ensure_ascii=False),
                flush=True,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

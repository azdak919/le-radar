#!/usr/bin/env python3
"""
LE RADAR — détection de visages sur les fonds photo (pour detect-photo-faces.js).

Lit des lignes JSON sur stdin  : {"id","url"}
Écrit des lignes JSON sur stdout : {"id","faces","faceRatio","metrics"}
Échec par photo → {"id","error"} (le bot Node ignore la ligne).

Pourquoi : la politique de banque interdit les personnes reconnaissables, mais
les seules barrières étaient lexicales (PEOPLE_RE sur titre/URL). Une photo au
titre neutre — « Havre St Pierre 006 » — passait avec un visage bien lisible au
premier plan. Aucun mot-clé ne peut couvrir ce cas : il faut regarder l'image.

Heuristique, pas de reconnaissance : cascades de Haar (frontale alt2 + profil)
sur la vignette Commons, puis filtre de carnation. On ne conserve que le nombre
de visages et la surface du plus grand (rapport à l'image), jamais de gabarit ni
d'identité.

Deux réglages viennent d'une mesure sur les 113 photos du mât, pas d'un choix
a priori. La cascade « default » sortait trois faux positifs (neige du Mont
Tremblant, escarpement du Saguenay, pignon de maison) tous PLUS gros que le vrai
visage de Havre-Saint-Pierre — un simple seuil de surface classait donc à
l'envers. La cascade alt2 ne voit aucun des trois et garde le vrai. Le filtre de
carnation (YCrCb) tranche le reste : 70 % de pixels chair sur le vrai visage,
0 à 34 % sur la roche et la neige.

Le recadrage du mât (~3,8:1 centré) est appliqué avant détection : un visage
hors bandeau ne sera jamais affiché, inutile de rejeter la photo pour lui.

Dépendances :  pip install "opencv-python-headless<5" Pillow
La borne majeure n'est pas cosmétique : OpenCV 5 a sorti les cascades de Haar
du paquet (ni cv2.CascadeClassifier, ni XML dans cv2.data). Absente ou trop
récente → exit 2, le bot Node n'écrit rien (la porte face_subject reste muette,
elle ne bloque pas une banque non annotée).
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError:
    print("opencv-python-headless + Pillow requis", file=sys.stderr)
    sys.exit(2)

UA = "LeRadar-face-detect/1.0 (https://le-radar.ca; wallpaper QC bot)"
THUMB_W = 800
# Bandeau du mât : bande centrale ~3,8:1. Au-delà, le pixel n'est jamais peint.
BANNER_ASPECT = 3.8
MIN_FACE_PX = 24
# Fraction minimale de pixels « carnation » (YCrCb) dans la boîte détectée.
MIN_SKIN_FRACTION = 0.35


def thumb_url(raw: str) -> str:
    """Vignette Commons (même contrat que detect-photo-seasons-visual)."""
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
    return Image.open(BytesIO(data)).convert("RGB")


def banner_crop(im: Image.Image) -> Image.Image:
    """Bande centrale au ratio du mât — le reste n'est jamais visible."""
    w, h = im.size
    target_h = int(round(w / BANNER_ASPECT))
    if target_h >= h:
        return im
    top = (h - target_h) // 2
    return im.crop((0, top, w, top + target_h))


def load_cascade(name: str):
    # OpenCV 5 : plus de CascadeClassifier ni de XML embarqués (voir en-tête).
    if not hasattr(cv2, "CascadeClassifier") or not hasattr(cv2, "data"):
        return None
    path = getattr(cv2.data, "haarcascades", "") + name
    if not os.path.exists(path):
        return None
    cascade = cv2.CascadeClassifier(path)
    return None if cascade.empty() else cascade


CASCADES = [
    c
    for c in (
        load_cascade("haarcascade_frontalface_alt2.xml"),
        load_cascade("haarcascade_profileface.xml"),
    )
    if c is not None
]


def skin_fraction(rgb_box: "np.ndarray") -> float:
    """Pixels dans la plage de carnation YCrCb (toutes carnations confondues)."""
    if rgb_box.size == 0:
        return 0.0
    ycrcb = cv2.cvtColor(rgb_box, cv2.COLOR_RGB2YCrCb)
    y = ycrcb[:, :, 0].astype(int)
    cr = ycrcb[:, :, 1].astype(int)
    cb = ycrcb[:, :, 2].astype(int)
    mask = (y > 60) & (cr >= 133) & (cr <= 180) & (cb >= 77) & (cb <= 127)
    return float(mask.mean())


def detect(im: Image.Image) -> dict:
    crop = banner_crop(im)
    rgb = np.array(crop)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.equalizeHist(gray)
    area = float(gray.shape[0] * gray.shape[1]) or 1.0

    boxes = []
    for cascade in CASCADES:
        found = cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=6,
            minSize=(MIN_FACE_PX, MIN_FACE_PX),
        )
        for (x, y, w, h) in found:
            if skin_fraction(rgb[y : y + h, x : x + w]) < MIN_SKIN_FRACTION:
                continue
            boxes.append((int(x), int(y), int(w), int(h)))

    # Fusion grossière : les deux cascades voient souvent le même visage.
    kept = []
    for box in sorted(boxes, key=lambda b: b[2] * b[3], reverse=True):
        x, y, w, h = box
        cx, cy = x + w / 2, y + h / 2
        if any(
            abs(cx - (kx + kw / 2)) < kw * 0.6 and abs(cy - (ky + kh / 2)) < kh * 0.6
            for kx, ky, kw, kh in kept
        ):
            continue
        kept.append(box)

    largest = max((w * h for _, _, w, h in kept), default=0)
    return {
        "faces": len(kept),
        "faceRatio": round(largest / area, 5),
        "metrics": {
            "cropW": gray.shape[1],
            "cropH": gray.shape[0],
            "cascades": len(CASCADES),
        },
    }


def main() -> int:
    if not CASCADES:
        print("cascades Haar introuvables dans cv2.data", file=sys.stderr)
        return 2
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        pid = row.get("id") or row.get("url")
        url = row.get("url")
        if not url:
            continue
        try:
            im = fetch_image(thumb_url(url))
            out = detect(im)
            out["id"] = pid
        except (urllib.error.URLError, OSError, ValueError) as err:
            out = {"id": pid, "error": str(err)[:200]}
        print(json.dumps(out, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

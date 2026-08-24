#!/usr/bin/env python3
"""Affiches campus 11×17 (3300×5100 @ 300 dpi).

Barre pourpre #6C2163. Grand pictogramme + wordmark [logo | LE-RADAR.ca].
Fonds : uni #0E0F12 ou photo d’été + overlay. QR officiel collé (pas un carré vide).

    python3 scripts/generate-campus-posters.py --ground nophoto --only generique,laval,mcgill,udem
    python3 scripts/generate-campus-posters.py --check
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = Path(__file__).resolve().parent / "og-fonts"
OUT_DIR = ASSETS / "kit" / "affiches"
CACHE = Path(__file__).resolve().parent / "poster-cache"
ICON_SVG = ASSETS / "icon.svg"
ICON_PNG = ASSETS / "icon-512.png"
QR_SVG = ASSETS / "kit" / "qr-le-radar.svg"
BANK = ROOT / "data" / "quebec-university-backgrounds.json"

UA = "LE-RADAR/1.0 (https://le-radar.ca; mailto:azdak-qc@proton.me) campus-posters"

W, H = 3300, 5100
PREVIEW_W, PREVIEW_H = 792, 1224
DPI = 300
BLEED = 38
SAFE = 150
PRINT_W, PRINT_H = W + 2 * BLEED, H + 2 * BLEED

INK = (241, 242, 244, 255)
SOFT = (194, 198, 205, 255)
MUTED = (136, 141, 150, 255)
BG = (14, 15, 18)
WHITE = (255, 255, 255, 255)
PURPLE = (108, 33, 99, 255)  # #6C2163
BAR_H = 42
QR_PAD = 28

TRACK = -0.02
SERIF = FONTS / "SourceSerif4Display-Bold.ttf"
SANS = FONTS / "Inter-Regular.ttf"
SANS_SEMI = FONTS / "Inter-SemiBold.ttf"

QR_PX = int(2.25 * DPI)
VARIANTS = ("standard", "minimal", "bilingue", "standard-qr", "minimal-qr", "bilingue-qr")

TITLE = "LE-RADAR.ca"
SLOGAN = "Journaux, radios et sports étudiants du Québec, réunis au même endroit"
NAME_FULL = "Le Réseau Académique de Découverte et d’Agrégation de Ressources"
SLOGAN_EN = "Student media on your radar"
INDEP_1 = "LE-RADAR.ca est un projet indépendant et non officiel."
INDEP_2 = "Il n’est affilié à aucun des médias ni des établissements recensés."
META = "le-radar.ca  ·  Conçu avec ♡ par Azdak · 2026  ·  GPL-2.0"

CAMPUSES = [
    {
        "slug": "generique",
        "name": None,
        "line": None,
        "papers": [],
        "radio": None,
        "grounds": [{"key": "nophoto", "photo_id": None, "label": "Fond uni"}],
    },
    {
        "slug": "laval",
        "name": "Université Laval",
        "line": "Université Laval",
        "papers": ["L’Exemplaire"],
        "radio": {"name": "CHYZ 94,3", "slogan": "La radio des étudiants de l’Université Laval"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "pouliot", "photo_id": "68ae0e12a3ec", "label": "Pavillon Adrien-Pouliot", "focal": (0.50, 0.40), "crop_scale": 0.90, "desaturate": 0.52, "overlay": 0.58},
            {"key": "parc", "photo_id": "0733bf6bce32", "label": "Campus central", "focal": (0.48, 0.45), "crop_scale": 0.88, "desaturate": 0.58, "overlay": 0.55},
            {"key": "dkn", "photo_id": "e3a38d175a72", "label": "Pavillon Charles-De Koninck", "focal": (0.68, 0.36), "crop_scale": 0.85, "desaturate": 0.52, "overlay": 0.58},
        ],
    },
    {
        "slug": "mcgill",
        "name": "McGill University",
        "line": "McGill University",
        "bilingual": True,
        "papers": ["The McGill Daily", "The Tribune", "Le Délit"],
        "radio": {"name": "CKUT 90,3", "slogan": "McGill campus-community radio"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "arts", "photo_id": "52c687b5d843", "label": "Arts Building", "focal": (0.50, 0.36), "crop_scale": 0.88, "desaturate": 0.50, "overlay": 0.58},
            {"key": "pelouse", "url": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Lawn_-_McGill_University_-_Montreal%2C_Canada_-_DSC08283.jpg", "credit": "Daderot", "license": "CC0", "title": "McGill University lawn", "focal": (0.50, 0.58), "crop_scale": 0.92, "desaturate": 0.58, "overlay": 0.52},
            {"key": "roddick", "url": "https://upload.wikimedia.org/wikipedia/commons/f/fe/Portail_Roddick_01.jpg", "credit": "Jean Gagnon", "license": "CC BY-SA 3.0", "title": "Portail Roddick", "focal": (0.50, 0.38), "crop_scale": 0.90, "desaturate": 0.55, "overlay": 0.55},
            {"key": "downtown", "photo_id": "f2745be093ce", "label": "Campus downtown", "focal": (0.50, 0.42), "crop_scale": 0.90, "desaturate": 0.55, "overlay": 0.55},
        ],
    },
    {
        "slug": "udem",
        "name": "Université de Montréal",
        "line": "Université de Montréal",
        "papers": ["Quartier Libre"],
        "radio": {"name": "CISM 89,3", "slogan": "La Marge"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "gaudry", "photo_id": "a7697051c0fc", "label": "Pavillon Roger-Gaudry", "focal": (0.50, 0.32), "crop_scale": 0.95, "desaturate": 0.55, "overlay": 0.52},
            {"key": "facade", "url": "https://upload.wikimedia.org/wikipedia/commons/d/db/UdeM_Roger_Gaudry.jpg", "credit": "Armanidesu", "license": "CC BY-SA 4.0", "title": "Pavillon Roger-Gaudry, façade", "focal": (0.50, 0.38), "crop_scale": 0.92, "desaturate": 0.55, "overlay": 0.52},
        ],
    },
    {
        "slug": "uqam",
        "name": "Université du Québec à Montréal",
        "line": "Université du Québec à Montréal",
        "papers": ["Montréal Campus"],
        "radio": {"name": "CHOQ.ca", "slogan": "La radio numérique des étudiants de l’UQAM"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "jasmin", "photo_id": "a5acbe3af178", "label": "Pavillon Judith-Jasmin", "focal": (0.48, 0.40), "crop_scale": 0.88, "desaturate": 0.52, "overlay": 0.58},
            {"key": "agora", "photo_id": "017b41d9ba0d", "label": "Agora Judith-Jasmin", "focal": (0.50, 0.36), "crop_scale": 0.88, "desaturate": 0.52, "overlay": 0.58},
        ],
    },
    {
        "slug": "concordia",
        "name": "Concordia University",
        "line": "Concordia University",
        "bilingual": True,
        "papers": ["The Link"],
        "radio": {"name": "CJLO 1690AM", "slogan": "Concordia’s only radio"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "hall", "photo_id": "582ef31c6453", "label": "Henry F. Hall Building", "focal": (0.52, 0.36), "crop_scale": 0.90, "desaturate": 0.48, "overlay": 0.60},
            {"key": "loyola", "url": "https://upload.wikimedia.org/wikipedia/commons/3/37/Loyola_College_Building_9.JPG", "credit": "Jean Gagnon", "license": "CC BY-SA 3.0", "title": "Loyola College Building", "focal": (0.50, 0.48), "crop_scale": 0.90, "desaturate": 0.55, "overlay": 0.55},
            {"key": "sgw", "photo_id": "4242d9aea59f", "label": "Campus Sir George Williams", "focal": (0.50, 0.28), "crop_scale": 0.90, "desaturate": 0.48, "overlay": 0.60},
        ],
    },
    {
        "slug": "sherbrooke",
        "name": "Université de Sherbrooke",
        "line": "Université de Sherbrooke",
        "papers": ["Le Collectif"],
        "radio": {"name": "CFAK 88,3", "slogan": "Ça part ici"},
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "longueuil", "photo_id": "912fa583aa5b", "label": "Campus de Longueuil", "focal": (0.42, 0.42), "crop_scale": 0.88, "desaturate": 0.50, "overlay": 0.58},
            {"key": "cabana", "url": "https://upload.wikimedia.org/wikipedia/commons/7/72/Universit%C3%A9_de_Sherbrooke_-_Pavillon_Georges-Cabana.jpg", "credit": "Uncivil Fire", "license": "CC BY-SA 3.0", "title": "Pavillon Georges-Cabana", "focal": (0.50, 0.38), "crop_scale": 0.95, "desaturate": 0.52, "overlay": 0.58},
        ],
    },
    {
        "slug": "bishops",
        "name": "Bishop’s University",
        "line": "Bishop’s University",
        "bilingual": True,
        "papers": ["The Campus"],
        "radio": None,
        "grounds": [
            {"key": "nophoto", "photo_id": None, "label": "Fond uni"},
            {"key": "brick", "photo_id": "186769a5aeb5", "label": "Bâtiment principal", "focal": (0.45, 0.42), "crop_scale": 0.92, "desaturate": 0.55, "overlay": 0.58},
            {"key": "quad", "photo_id": "ebea372c0dd2", "label": "Campus Lennoxville", "focal": (0.50, 0.45), "crop_scale": 0.90, "desaturate": 0.52, "overlay": 0.58},
            {"key": "mcgreer", "url": "https://upload.wikimedia.org/wikipedia/commons/e/ea/Bishop%27s_University_McGreer_Hall.jpg", "credit": "Jason Paris", "license": "CC BY 2.0", "title": "McGreer Hall", "focal": (0.52, 0.40), "crop_scale": 0.90, "desaturate": 0.55, "overlay": 0.52},
            {"key": "chapelle", "photo_id": "95c4ae37ec2f", "label": "Chapelle du campus", "focal": (0.42, 0.40), "crop_scale": 0.90, "desaturate": 0.55, "overlay": 0.55},
        ],
    },
]


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit(f"affiche: fonte manquante {path}")
    return ImageFont.truetype(str(path), size)


def text_size(draw, s, fnt):
    l, t, r, b = draw.textbbox((0, 0), s, font=fnt)
    return int(r - l), int(b - t)


def tracked_width(text, fnt, tracking_em=TRACK):
    extra = fnt.size * tracking_em
    width = 0.0
    for i, ch in enumerate(text):
        width += fnt.getlength(ch)
        if i < len(text) - 1:
            width += extra
    return int(round(width))


def draw_tracked(draw, xy, text, fnt, fill):
    x, y = xy
    extra = fnt.size * TRACK
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + extra
    return int(x)


def load_bank():
    data = json.loads(BANK.read_text(encoding="utf-8"))
    return {p["id"]: p for p in data.get("photos", [])}


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 50_000:
        return
    req = urllib.request.Request(url.split("?")[0], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as res, dest.open("wb") as out:
        shutil.copyfileobj(res, out)


def cover_crop(im, tw, th, fx, fy, scale):
    sw, sh = im.size
    ratio = tw / th
    if sw / sh > ratio:
        ch = sh * scale
        cw = ch * ratio
    else:
        cw = sw * scale
        ch = cw / ratio
    cw = max(1, min(int(round(cw)), sw))
    ch = max(1, min(int(round(ch)), sh))
    if cw / ch > ratio:
        cw = max(1, min(int(round(ch * ratio)), sw))
    else:
        ch = max(1, min(int(round(cw / ratio)), sh))
    left = max(0, min(int(round(fx * sw - cw / 2)), sw - cw))
    top = max(0, min(int(round(fy * sh - ch / 2)), sh - ch))
    return im.crop((left, top, left + cw, top + ch)).resize((tw, th), Image.Resampling.LANCZOS)


def raster_logo(size: int) -> Image.Image:
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"logo-{size}.png"
    if not dest.is_file():
        magick = shutil.which("magick") or shutil.which("convert")
        if magick and ICON_SVG.is_file():
            subprocess.run(
                [magick, "-background", "none", str(ICON_SVG), "-resize", f"{size}x{size}", str(dest)],
                check=True,
            )
        else:
            Image.open(ICON_PNG).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS).save(dest)
    return Image.open(dest).convert("RGBA")


def raster_qr(inner: int) -> Image.Image:
    """QR officiel le-radar.ca, quiet zone blanche."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"qr-{inner}.png"
    if not dest.is_file():
        if not QR_SVG.is_file():
            raise SystemExit(f"affiche: QR manquant {QR_SVG}")
        magick = shutil.which("magick") or shutil.which("convert")
        if not magick:
            raise SystemExit("affiche: magick requis pour le QR")
        subprocess.run(
            [
                magick, "-density", "300", "-background", "white", str(QR_SVG),
                "-resize", f"{inner}x{inner}", "-background", "white",
                "-alpha", "remove", "-alpha", "off", "-colorspace", "sRGB",
                f"PNG24:{dest}",
            ],
            check=True,
        )
    qr = Image.open(dest).convert("RGB")
    side = inner + 2 * QR_PAD
    card = Image.new("RGB", (side, side), (255, 255, 255))
    card.paste(qr, (QR_PAD, QR_PAD))
    return card


def grade_photo(im, desaturate, overlay):
    rgb = ImageEnhance.Color(im.convert("RGB")).enhance(desaturate)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    return Image.blend(rgb, Image.new("RGB", rgb.size, BG), overlay)


def join_fr(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} et {names[1]}"
    return f"{', '.join(names[:-1])} et {names[-1]}"


def join_en(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])} and {names[-1]}"


def papers_line_fr(names: list[str]) -> str:
    if len(names) == 1:
        return f"Votre journal {names[0]} s’y trouve"
    return f"Vos journaux {join_fr(names)} s’y trouvent"


def papers_line_en(names: list[str]) -> str:
    if len(names) == 1:
        return f"Your paper {names[0]} is here"
    return f"Your papers {join_en(names)} are here"


def wrap_text(text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    if fnt.getlength(text) <= max_w:
        return [text]
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if fnt.getlength(t) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


def variant_kind(name: str) -> tuple[str, bool]:
    qr = name.endswith("-qr")
    base = name[:-3] if qr else name
    if base not in ("standard", "minimal", "bilingue"):
        raise SystemExit(f"variante inconnue: {name}")
    return base, qr


def draw_radar_motif(canvas: Image.Image) -> None:
    """Anneaux + croix très discrets, fond uni seulement."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = W // 2, int(H * 0.34)
    ring = (241, 242, 244, 16)
    for r in (280, 520, 820, 1180, 1600, 2100):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=ring, width=2)
    d.line((cx, cy - 2200, cx, cy + 2200), fill=(241, 242, 244, 12), width=1)
    d.line((cx - 2200, cy, cx + 2200, cy), fill=(241, 242, 244, 12), width=1)
    canvas.alpha_composite(layer)


def draw_footer_wordmark(canvas, draw, f_mark, y_top, small):
    """Petit logo PWA à gauche de LE-RADAR.ca — footer seulement."""
    gap = 16
    title_w = tracked_width(TITLE, f_mark)
    box = draw.textbbox((0, 0), TITLE, font=f_mark)
    title_h = box[3] - box[1]
    total_w = small.width + gap + title_w
    x = (W - total_w) // 2
    row_h = max(small.height, title_h)
    canvas.alpha_composite(small, (x, y_top + (row_h - small.height) // 2))
    text_y = y_top + (row_h - title_h) // 2 - box[1]
    draw_tracked(draw, (x + small.width + gap, text_y), TITLE, f_mark, INK)
    return y_top + row_h


def compose(campus, ground, photo_meta, photo, variant: str) -> Image.Image:
    kind, with_qr = variant_kind(variant)
    if photo is not None:
        fx, fy = ground.get("focal", (0.5, 0.42))
        bg = cover_crop(photo, W, H, fx, fy, ground.get("crop_scale", 0.9))
        bg = grade_photo(bg, ground.get("desaturate", 0.5), ground.get("overlay", 0.62))
        canvas = bg.convert("RGBA")
    else:
        canvas = Image.new("RGBA", (W, H), BG + (255,))
        draw_radar_motif(canvas)

    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, BAR_H), fill=PURPLE)

    # Première cuvée : logo haut, grand air, texte au milieu (échelle 792→3300).
    scale = W / 792
    big = int(round((220 if kind == "minimal" else 200) * scale))
    foot_logo = 72
    logo_big = raster_logo(big)
    logo_foot = raster_logo(foot_logo)

    f_title = font(SERIF, int(round(56 * scale)))
    f_en = font(SANS, int(round(17 * scale)))
    f_uni = font(SANS, int(round(18 * scale)))
    f_media = font(SANS, int(round(16 * scale)))
    f_name = font(SANS, 32)
    f_mark = font(SERIF, 40)
    f_body = font(SANS, 36)
    f_meta = font(SANS_SEMI, 32)
    f_credit = font(SANS, 26)

    logo_y = int(round(236 * scale))
    canvas.alpha_composite(logo_big, ((W - big) // 2, logo_y))

    box = draw.textbbox((0, 0), TITLE, font=f_title)
    title_w = tracked_width(TITLE, f_title)
    title_y = int(round(560 * scale)) - box[1]
    draw_tracked(draw, ((W - title_w) // 2, title_y), TITLE, f_title, INK)
    y = title_y + (box[3] - box[1]) + int(round(36 * scale))

    def line(text, fnt, fill, dy=12):
        nonlocal y
        tw, th = text_size(draw, text, fnt)
        draw.text(((W - tw) // 2, y), text, font=fnt, fill=fill)
        y += th + dy

    def block(text, fnt, fill, dy, max_w):
        nonlocal y
        for part in wrap_text(text, fnt, max_w):
            line(part, fnt, fill, 8)
        y += dy - 8

    max_w = W - 2 * SAFE - 80
    slogan_size = int(round(18 * scale))
    f_slogan = font(SANS, slogan_size)
    while f_slogan.getlength(SLOGAN) > max_w and slogan_size > 30:
        slogan_size -= 2
        f_slogan = font(SANS, slogan_size)
    gap_s = int(round(22 * scale))
    gap_m = int(round(18 * scale))
    if kind != "minimal":
        line(SLOGAN, f_slogan, SOFT, gap_s)
        if kind == "bilingue":
            line(SLOGAN_EN, f_en, MUTED, gap_s)
    if campus.get("line"):
        line(campus["line"], f_uni, SOFT, gap_m + 8)
    papers = campus.get("papers") or []
    if papers:
        block(papers_line_fr(papers), f_media, SOFT, gap_m, max_w)
        if kind == "bilingue":
            block(papers_line_en(papers), f_en, MUTED, gap_m, max_w)
    radio = campus.get("radio")
    if radio:
        block(f"Votre radio {radio['name']} s’y trouve", f_media, SOFT, 6, max_w)
        if radio.get("slogan"):
            block(radio["slogan"], f_en, MUTED, gap_m, max_w)

    # Footer from the bottom — never leaves the 0.5 in safety.
    credit = ""
    if photo_meta:
        who = photo_meta.get("credit") or "Wikimedia Commons"
        lic = photo_meta.get("license") or ""
        credit = f"Photo : {who}" + (f" · {lic}" if lic else "")
    cy = H - SAFE
    if credit:
        tw, th = text_size(draw, credit, f_credit)
        cy -= th
        draw.text(((W - tw) // 2, cy), credit, font=f_credit, fill=MUTED)
        cy -= 18
    tw, th = text_size(draw, META, f_meta)
    cy -= th
    draw.text(((W - tw) // 2, cy), META, font=f_meta, fill=MUTED)
    cy -= 14
    tw, th = text_size(draw, INDEP_2, f_body)
    cy -= th
    draw.text(((W - tw) // 2, cy), INDEP_2, font=f_body, fill=MUTED)
    cy -= 6
    tw, th = text_size(draw, INDEP_1, f_body)
    cy -= th
    draw.text(((W - tw) // 2, cy), INDEP_1, font=f_body, fill=MUTED)
    cy -= 10
    tw, th = text_size(draw, NAME_FULL, f_name)
    cy -= th
    draw.text(((W - tw) // 2, cy), NAME_FULL, font=f_name, fill=MUTED)
    cy -= 16
    mark_h = max(foot_logo, text_size(draw, TITLE, f_mark)[1])
    cy -= mark_h
    draw_footer_wordmark(canvas, draw, f_mark, cy, logo_foot)

    if with_qr:
        qr = raster_qr(QR_PX - 2 * QR_PAD)
        qw, qh = qr.size
        cy -= 28
        qr_y = cy - qh
        canvas.paste(qr, ((W - qw) // 2, qr_y))

    return canvas.convert("RGB")


def add_bleed(trim: Image.Image) -> Image.Image:
    print_im = Image.new("RGB", (PRINT_W, PRINT_H), BG)
    print_im.paste(trim, (BLEED, BLEED))
    print_im.paste(trim.crop((0, 0, W, 1)).resize((W, BLEED), Image.Resampling.NEAREST), (BLEED, 0))
    print_im.paste(trim.crop((0, H - 1, W, H)).resize((W, BLEED), Image.Resampling.NEAREST), (BLEED, BLEED + H))
    print_im.paste(trim.crop((0, 0, 1, H)).resize((BLEED, H), Image.Resampling.NEAREST), (0, BLEED))
    print_im.paste(trim.crop((W - 1, 0, W, H)).resize((BLEED, H), Image.Resampling.NEAREST), (BLEED + W, BLEED))
    return print_im


def stem(campus, ground, variant) -> str:
    if variant == "standard" and ground["key"] != "nophoto" and campus["slug"] != "generique":
        # Alias kit-média : première photo « standard » aussi sous affiche-{slug}.jpg
        pass
    return f"affiche-{campus['slug']}-{ground['key']}-{variant}"


def generate_one(campus, ground, bank, formats, variants, kit_alias=False):
    meta = None
    photo = None
    CACHE.mkdir(parents=True, exist_ok=True)
    if ground.get("photo_id"):
        meta = bank.get(ground["photo_id"])
        if not meta:
            raise SystemExit(f"affiche: photo {ground['photo_id']} absente")
        raw = CACHE / f"{campus['slug']}-{ground['key']}-{ground['photo_id']}.jpg"
        download(meta["url"], raw)
        photo = Image.open(raw)
    elif ground.get("url"):
        meta = {
            "url": ground["url"],
            "credit": ground.get("credit"),
            "license": ground.get("license"),
            "title": ground.get("title"),
        }
        raw = CACHE / f"ext-{campus['slug']}-{ground['key']}.jpg"
        download(ground["url"], raw)
        photo = Image.open(raw)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for variant in variants:
        img = compose(campus, ground, meta, photo, variant)
        if img.size != (W, H) or img.size[0] * 17 != img.size[1] * 11:
            raise SystemExit(f"affiche: {campus['slug']} {ground['key']} {variant} {img.size}")
        name = stem(campus, ground, variant)
        jpg = OUT_DIR / f"{name}.jpg"
        preview = OUT_DIR / f"{name}-preview.jpg"
        img.save(jpg, "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0, optimize=True)
        img.resize((PREVIEW_W, PREVIEW_H), Image.Resampling.LANCZOS).save(preview, "JPEG", quality=86, optimize=True)
        alias_kind = "bilingue" if campus.get("bilingual") else "standard"
        if kit_alias and variant == alias_kind and ground["key"] != "nophoto":
            img.save(OUT_DIR / f"affiche-{campus['slug']}.jpg", "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0, optimize=True)
            img.resize((PREVIEW_W, PREVIEW_H), Image.Resampling.LANCZOS).save(
                OUT_DIR / f"affiche-{campus['slug']}-preview.jpg", "JPEG", quality=86, optimize=True
            )
        if "print" in formats:
            add_bleed(img).save(OUT_DIR / f"{name}-print.jpg", "JPEG", quality=95, dpi=(DPI, DPI), optimize=True)
        print(f"✅ {name}: {W}×{H}")


def iter_jobs(only, ground_filter):
    only_set = {s.strip() for s in only.split(",")} if only else None
    for campus in CAMPUSES:
        if only_set and campus["slug"] not in only_set:
            continue
        grounds = campus["grounds"]
        if ground_filter:
            grounds = [g for g in grounds if g["key"] in ground_filter]
        primary = next((g for g in grounds if g.get("photo_id")), None)
        for g in grounds:
            yield campus, g, (g is primary)


def check_outputs():
    missing = []
    # Kit + nouvelles épreuves sans photo (priorité 1).
    for slug in ("laval", "mcgill", "udem", "uqam", "concordia", "sherbrooke", "bishops"):
        for name in (f"affiche-{slug}.jpg", f"affiche-{slug}-preview.jpg"):
            if not (OUT_DIR / name).is_file():
                missing.append(name)
    for slug in ("generique", "laval", "mcgill", "udem"):
        p = OUT_DIR / f"affiche-{slug}-nophoto-standard-preview.jpg"
        if not p.is_file():
            missing.append(p.name)
    if missing:
        raise SystemExit("check: manquants:\n  " + "\n  ".join(missing))
    print("OK affiches campus 11×17")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="slugs séparés par des virgules")
    parser.add_argument("--ground", help="nophoto,pouliot,… (virgules)")
    parser.add_argument("--variant", action="append", dest="variants")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--formats", default="jpg,preview")
    args = parser.parse_args()
    formats = {x.strip() for x in args.formats.split(",") if x.strip()}
    variants = tuple(args.variants) if args.variants else VARIANTS
    for v in variants:
        variant_kind(v)
    if args.check:
        check_outputs()
        return
    for path in (SERIF, SANS, SANS_SEMI, ICON_SVG, QR_SVG, BANK):
        if not path.is_file():
            raise SystemExit(f"affiche: manquant {path}")
    bank = load_bank()
    grounds = {g.strip() for g in args.ground.split(",")} if args.ground else None
    for campus, ground, alias in iter_jobs(args.only, grounds):
        generate_one(campus, ground, bank, formats, variants, kit_alias=alias)


if __name__ == "__main__":
    main()

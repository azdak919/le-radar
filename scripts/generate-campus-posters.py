#!/usr/bin/env python3
"""Affiches campus 11×17 po (3300×5100 px @ 300 dpi).

Photo Wikimedia authentique + overlay #0E0F12 + typographie officielle
(Source Serif 4 Display Bold / Inter) + pictogramme PWA.

    python3 scripts/generate-campus-posters.py
    python3 scripts/generate-campus-posters.py --only laval
    python3 scripts/generate-campus-posters.py --check
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
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
BANK = ROOT / "data" / "quebec-university-backgrounds.json"

UA = "LE-RADAR/1.0 (https://le-radar.ca; mailto:azdak-qc@proton.me) campus-posters"

# 11 × 17 po à 300 dpi — ratio exact 11:17
W, H = 3300, 5100
PREVIEW_W, PREVIEW_H = 792, 1224
DPI = 300

PURPLE = (108, 33, 99, 255)  # #6C2163
INK = (241, 242, 244, 255)  # #F1F2F4
SOFT = (194, 198, 205, 255)  # #C2C6CD
MUTED = (136, 141, 150, 255)  # #888D96
BG = (14, 15, 18)  # #0E0F12

BAR_H = 42  # ~10 px sur l’affiche SVG 72 dpi
TRACK = -0.02
SERIF = FONTS / "SourceSerif4Display-Bold.ttf"
SANS = FONTS / "Inter-Regular.ttf"
SANS_SEMI = FONTS / "Inter-SemiBold.ttf"

# Rythme de assets/kit/affiche-11x17.svg, mis à l’échelle 3300/792.
SCALE = W / 792

POSTERS = [
    {
        "slug": "laval",
        "name": "Université Laval",
        "line": "Université Laval · Rentrée 2026",
        "photo_id": "68ae0e12a3ec",
        "focal": (0.50, 0.40),
        "crop_scale": 0.90,
        "desaturate": 0.50,
        "overlay": 0.62,
    },
    {
        "slug": "mcgill",
        "name": "Université McGill",
        "line": "Université McGill · Rentrée 2026",
        "photo_id": "52c687b5d843",
        "focal": (0.50, 0.36),
        "crop_scale": 0.88,
        "desaturate": 0.48,
        "overlay": 0.64,
    },
    {
        "slug": "udem",
        "name": "Université de Montréal",
        "line": "Université de Montréal · Rentrée 2026",
        "photo_id": "a7697051c0fc",
        "focal": (0.50, 0.32),
        "crop_scale": 0.95,
        "desaturate": 0.52,
        "overlay": 0.56,
    },
    {
        "slug": "uqam",
        "name": "UQAM",
        "line": "UQAM · Rentrée 2026",
        "photo_id": "1247733e67f7",
        "focal": (0.50, 0.42),
        "crop_scale": 0.90,
        "desaturate": 0.50,
        "overlay": 0.64,
    },
    {
        "slug": "concordia",
        "name": "Concordia University",
        "line": "Concordia University · Rentrée 2026",
        "photo_id": "582ef31c6453",
        "focal": (0.52, 0.36),
        "crop_scale": 0.90,
        "desaturate": 0.45,
        "overlay": 0.62,
    },
    {
        "slug": "sherbrooke",
        "name": "Université de Sherbrooke",
        "line": "Université de Sherbrooke · Rentrée 2026",
        "photo_id": "912fa583aa5b",
        "focal": (0.42, 0.46),
        "crop_scale": 0.90,
        "desaturate": 0.48,
        "overlay": 0.62,
    },
    {
        "slug": "bishops",
        "name": "Bishop’s University",
        "line": "Bishop’s University · Rentrée 2026",
        "photo_id": "186769a5aeb5",
        "focal": (0.45, 0.42),
        "crop_scale": 0.92,
        "desaturate": 0.55,
        "overlay": 0.58,
    },
]

TITLE = "LE-RADAR.ca"
SUB_1 = "Journaux, radios et sports étudiants"
SUB_2 = "du Québec, réunis au même endroit"
URL = "le-radar.ca"
FOOT = "Projet indépendant · GPL"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit(f"affiche: fonte manquante {path}")
    return ImageFont.truetype(str(path), size)


def text_size(draw: ImageDraw.ImageDraw, s: str, fnt: ImageFont.FreeTypeFont) -> tuple[int, int]:
    l, t, r, b = draw.textbbox((0, 0), s, font=fnt)
    return int(r - l), int(b - t)


def tracked_width(text: str, fnt: ImageFont.FreeTypeFont, tracking_em: float) -> int:
    extra = fnt.size * tracking_em
    width = 0.0
    for i, ch in enumerate(text):
        width += fnt.getlength(ch)
        if i < len(text) - 1:
            width += extra
    return int(round(width))


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    tracking_em: float,
) -> int:
    x, y = xy
    extra = fnt.size * tracking_em
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + extra
    return int(x)


def load_bank() -> dict[str, dict]:
    data = json.loads(BANK.read_text(encoding="utf-8"))
    return {p["id"]: p for p in data.get("photos", [])}


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 50_000:
        return
    clean = url.split("?")[0]
    req = urllib.request.Request(clean, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as res, dest.open("wb") as out:
        shutil.copyfileobj(res, out)


def cover_crop(
    im: Image.Image,
    tw: int,
    th: int,
    fx: float,
    fy: float,
    scale: float,
) -> Image.Image:
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
    left = int(round(fx * sw - cw / 2))
    top = int(round(fy * sh - ch / 2))
    left = max(0, min(left, sw - cw))
    top = max(0, min(top, sh - ch))
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
            raw = Image.open(ICON_PNG).convert("RGBA")
            raw.resize((size, size), Image.Resampling.LANCZOS).save(dest)
    return Image.open(dest).convert("RGBA")


def grade_photo(im: Image.Image, desaturate: float, overlay: float) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(desaturate)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    veil = Image.new("RGB", rgb.size, BG)
    return Image.blend(rgb, veil, overlay)


def compose(poster: dict, photo_meta: dict, photo: Image.Image) -> Image.Image:
    fx, fy = poster["focal"]
    bg = cover_crop(photo, W, H, fx, fy, poster["crop_scale"])
    bg = grade_photo(bg, poster["desaturate"], poster["overlay"])
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, BAR_H), fill=PURPLE)

    # Pictogramme officiel, plus aéré que l’affiche unie 300/1224.
    logo_size = int(round(200 * SCALE))
    logo = raster_logo(logo_size)
    logo_x = (W - logo_size) // 2
    logo_y = int(round(236 * SCALE))
    canvas.alpha_composite(logo, (logo_x, logo_y))

    f_title = font(SERIF, int(round(56 * SCALE)))
    f_sub = font(SANS, int(round(20 * SCALE)))
    f_uni = font(SANS, int(round(17 * SCALE)))
    f_url = font(SANS_SEMI, int(round(16 * SCALE)))
    f_foot = font(SANS, int(round(14 * SCALE)))
    f_credit = font(SANS, int(round(11 * SCALE)))

    title_w = tracked_width(TITLE, f_title, TRACK)
    title_box = draw.textbbox((0, 0), TITLE, font=f_title)
    title_x = (W - title_w) // 2
    title_y = int(round(560 * SCALE)) - title_box[1]
    draw_tracked(draw, (title_x, title_y), TITLE, f_title, INK, TRACK)

    sub1_w, _ = text_size(draw, SUB_1, f_sub)
    sub2_w, sub_h = text_size(draw, SUB_2, f_sub)
    sub1_y = int(round(628 * SCALE))
    sub2_y = int(round(660 * SCALE))
    draw.text(((W - sub1_w) // 2, sub1_y), SUB_1, font=f_sub, fill=SOFT)
    draw.text(((W - sub2_w) // 2, sub2_y), SUB_2, font=f_sub, fill=SOFT)

    uni = poster["line"]
    uni_w, _ = text_size(draw, uni, f_uni)
    uni_y = sub2_y + sub_h + int(round(28 * SCALE))
    draw.text(((W - uni_w) // 2, uni_y), uni, font=f_uni, fill=SOFT)

    url_w, url_h = text_size(draw, URL, f_url)
    url_y = int(round(1096 * SCALE))
    draw.text(((W - url_w) // 2, url_y), URL, font=f_url, fill=MUTED)

    foot_w, _ = text_size(draw, FOOT, f_foot)
    foot_y = url_y + url_h + int(round(10 * SCALE))
    draw.text(((W - foot_w) // 2, foot_y), FOOT, font=f_foot, fill=MUTED)

    credit_name = photo_meta.get("credit") or "Wikimedia Commons"
    license_ = photo_meta.get("license") or ""
    credit = f"Photo : {credit_name}"
    if license_:
        credit = f"{credit} · {license_}"
    cr_w, cr_h = text_size(draw, credit, f_credit)
    cr_y = H - 90 - cr_h
    draw.text(((W - cr_w) // 2, cr_y), credit, font=f_credit, fill=(136, 141, 150, 170))

    return canvas.convert("RGB")


def write_pdf(png_path: Path, pdf_path: Path) -> None:
    magick = shutil.which("magick") or shutil.which("convert")
    if not magick:
        return
    subprocess.run(
        [
            magick,
            str(png_path),
            "-units",
            "PixelsPerInch",
            "-density",
            str(DPI),
            str(pdf_path),
        ],
        check=True,
    )


def generate_one(poster: dict, bank: dict[str, dict], formats: set[str]) -> dict:
    meta = bank.get(poster["photo_id"])
    if not meta:
        raise SystemExit(f"affiche: photo {poster['photo_id']} absente de la banque")
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = CACHE / f"{poster['slug']}-{poster['photo_id']}.jpg"
    download(meta["url"], raw_path)
    photo = Image.open(raw_path)
    img = compose(poster, meta, photo)

    if img.size != (W, H):
        raise SystemExit(f"affiche: {poster['slug']} {img.size} ≠ {W}×{H}")
    if img.size[0] * 17 != img.size[1] * 11:
        raise SystemExit(f"affiche: {poster['slug']} ratio ≠ 11:17")

    png_path = OUT_DIR / f"affiche-{poster['slug']}.png"
    jpg_path = OUT_DIR / f"affiche-{poster['slug']}.jpg"
    preview_path = OUT_DIR / f"affiche-{poster['slug']}-preview.jpg"
    pdf_path = OUT_DIR / f"affiche-{poster['slug']}.pdf"

    if "png" in formats:
        img.save(png_path, "PNG", compress_level=9)
    img.save(jpg_path, "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0, optimize=True)
    img.resize((PREVIEW_W, PREVIEW_H), Image.Resampling.LANCZOS).save(
        preview_path, "JPEG", quality=86, optimize=True
    )
    if "pdf" in formats:
        write_pdf(jpg_path, pdf_path)

    return {
        "slug": poster["slug"],
        "png": png_path if png_path.is_file() else None,
        "jpg": jpg_path,
        "preview": preview_path,
        "pdf": pdf_path if pdf_path.is_file() else None,
        "bytes_png": png_path.stat().st_size if png_path.is_file() else 0,
        "bytes_jpg": jpg_path.stat().st_size,
    }


def check_outputs(slugs: list[str]) -> None:
    missing = []
    for slug in slugs:
        jpg = OUT_DIR / f"affiche-{slug}.jpg"
        preview = OUT_DIR / f"affiche-{slug}-preview.jpg"
        for path in (jpg, preview):
            if not path.is_file():
                missing.append(str(path.relative_to(ROOT)))
        if jpg.is_file():
            with Image.open(jpg) as im:
                if im.size != (W, H):
                    raise SystemExit(f"check: {jpg.name} {im.size} ≠ {W}×{H}")
                if im.size[0] * 17 != im.size[1] * 11:
                    raise SystemExit(f"check: {jpg.name} ratio ≠ 11:17")
    if missing:
        raise SystemExit("check: fichiers manquants:\n  " + "\n  ".join(missing))
    print("OK affiches campus 11×17")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="slug unique (laval, mcgill, …)")
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--formats",
        default="jpg,preview,png,pdf",
        help="Formats à écrire: jpg,preview,png,pdf",
    )
    args = parser.parse_args()
    formats = {part.strip() for part in args.formats.split(",") if part.strip()}

    posters = POSTERS
    if args.only:
        posters = [p for p in POSTERS if p["slug"] == args.only]
        if not posters:
            raise SystemExit(f"slug inconnu: {args.only}")

    slugs = [p["slug"] for p in posters]
    if args.check:
        check_outputs(slugs)
        return

    for path in (SERIF, SANS, SANS_SEMI, ICON_SVG, BANK):
        if not path.is_file():
            raise SystemExit(f"affiche: fichier manquant {path}")

    bank = load_bank()
    for poster in posters:
        info = generate_one(poster, bank, formats)
        jpg_mb = info["bytes_jpg"] / 1_048_576
        extra = f" · png {info['bytes_png'] / 1_048_576:.1f} Mo" if info["bytes_png"] else ""
        print(f"✅ {info['slug']}: {W}×{H} jpg {jpg_mb:.1f} Mo{extra}")


if __name__ == "__main__":
    main()

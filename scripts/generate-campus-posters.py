#!/usr/bin/env python3
"""Affiches campus 11×17 po (3300×5100 px @ 300 dpi, zone sûre 0,5 po).

Variantes : standard, minimal, bilingue, chacune avec ou sans QR officiel
(assets/kit/qr-le-radar.svg → https://le-radar.ca).

    python3 scripts/generate-campus-posters.py --only laval
    python3 scripts/generate-campus-posters.py --check
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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

# Trim 11 × 17 po @ 300 dpi. Bleed 0,125 po ; sécurité 0,5 po depuis la coupe.
W, H = 3300, 5100
PREVIEW_W, PREVIEW_H = 792, 1224
DPI = 300
BLEED = 38  # 0.125 in
SAFE = 150  # 0.5 in from trim
PRINT_W, PRINT_H = W + 2 * BLEED, H + 2 * BLEED

PURPLE = (108, 33, 99, 255)  # #6C2163
INK = (241, 242, 244, 255)  # #F1F2F4
SOFT = (194, 198, 205, 255)  # #C2C6CD
MUTED = (136, 141, 150, 255)  # #888D96
BG = (14, 15, 18)  # #0E0F12
WHITE = (255, 255, 255, 255)

BAR_H = 42
TRACK = -0.02
SERIF = FONTS / "SourceSerif4Display-Bold.ttf"
SANS = FONTS / "Inter-Regular.ttf"
SANS_SEMI = FONTS / "Inter-SemiBold.ttf"
SCALE = W / 792

# QR 2,25 po y compris quiet zone blanche.
QR_IN = 2.25
QR_PX = int(round(QR_IN * DPI))
QR_PAD = 36

VARIANTS = (
    "standard",
    "minimal",
    "bilingue",
    "standard-qr",
    "minimal-qr",
    "bilingue-qr",
)

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
SLOGAN_EN = "Student media on your radar"
URL = "le-radar.ca"
FOOT = "Projet indépendant"
QR_LABEL = "Scannez pour découvrir"
QR_LABEL_BI = "Scannez pour découvrir · Scan to open"


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


def draw_tracked(draw, xy, text, fnt, fill, tracking_em) -> int:
    x, y = xy
    extra = fnt.size * tracking_em
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + extra
    return int(x)


def centered(draw, y, text, fnt, fill, tracking=0.0):
    if tracking:
        w = tracked_width(text, fnt, tracking)
        draw_tracked(draw, ((W - w) // 2, y), text, fnt, fill, tracking)
        box = draw.textbbox((0, 0), text, font=fnt)
        return y + (box[3] - box[1])
    w, h = text_size(draw, text, fnt)
    draw.text(((W - w) // 2, y), text, font=fnt, fill=fill)
    return y + h


def load_bank() -> dict[str, dict]:
    data = json.loads(BANK.read_text(encoding="utf-8"))
    return {p["id"]: p for p in data.get("photos", [])}


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > 50_000:
        return
    import urllib.request

    clean = url.split("?")[0]
    req = urllib.request.Request(clean, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as res, dest.open("wb") as out:
        shutil.copyfileobj(res, out)


def cover_crop(im, tw, th, fx, fy, scale) -> Image.Image:
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
            Image.open(ICON_PNG).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS).save(dest)
    return Image.open(dest).convert("RGBA")


def raster_qr(inner: int) -> Image.Image:
    """QR officiel, quiet zone blanche comprise."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / f"qr-{inner}.png"
    if not dest.is_file():
        if not QR_SVG.is_file():
            raise SystemExit(f"affiche: QR manquant {QR_SVG}")
        magick = shutil.which("magick") or shutil.which("convert")
        if not magick:
            raise SystemExit("affiche: magick requis pour rasteriser le QR vectoriel")
        subprocess.run(
            [
                magick,
                "-density",
                "300",
                "-background",
                "white",
                str(QR_SVG),
                "-resize",
                f"{inner}x{inner}",
                "-background",
                "white",
                "-alpha",
                "remove",
                "-alpha",
                "off",
                "-colorspace",
                "sRGB",
                f"PNG24:{dest}",
            ],
            check=True,
        )
    qr = Image.open(dest).convert("RGB")
    side = inner + 2 * QR_PAD
    card = Image.new("RGB", (side, side), (255, 255, 255))
    card.paste(qr, (QR_PAD, QR_PAD))
    return card


def grade_photo(im: Image.Image, desaturate: float, overlay: float) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(desaturate)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.04)
    veil = Image.new("RGB", rgb.size, BG)
    return Image.blend(rgb, veil, overlay)


def variant_kind(name: str) -> tuple[str, bool]:
    qr = name.endswith("-qr")
    base = name[: -3] if qr else name
    if base not in ("standard", "minimal", "bilingue"):
        raise SystemExit(f"variante inconnue: {name}")
    return base, qr


def add_bleed(trim: Image.Image) -> Image.Image:
    """Étend la photo de 0,125 po de chaque côté (bleed impression)."""
    print_im = Image.new("RGB", (PRINT_W, PRINT_H), BG)
    # Edge-extend : coller le trim au centre, puis étirer les bandes.
    print_im.paste(trim, (BLEED, BLEED))
    top = trim.crop((0, 0, W, 1)).resize((W, BLEED), Image.Resampling.NEAREST)
    bot = trim.crop((0, H - 1, W, H)).resize((W, BLEED), Image.Resampling.NEAREST)
    left = trim.crop((0, 0, 1, H)).resize((BLEED, H), Image.Resampling.NEAREST)
    right = trim.crop((W - 1, 0, W, H)).resize((BLEED, H), Image.Resampling.NEAREST)
    print_im.paste(top, (BLEED, 0))
    print_im.paste(bot, (BLEED, BLEED + H))
    print_im.paste(left, (0, BLEED))
    print_im.paste(right, (BLEED + W, BLEED))
    # Coins
    print_im.paste(Image.new("RGB", (BLEED, BLEED), trim.getpixel((0, 0))), (0, 0))
    print_im.paste(Image.new("RGB", (BLEED, BLEED), trim.getpixel((W - 1, 0))), (BLEED + W, 0))
    print_im.paste(Image.new("RGB", (BLEED, BLEED), trim.getpixel((0, H - 1))), (0, BLEED + H))
    print_im.paste(Image.new("RGB", (BLEED, BLEED), trim.getpixel((W - 1, H - 1))), (BLEED + W, BLEED + H))
    # La barre pourpre continue dans le bleed haut.
    draw = ImageDraw.Draw(print_im)
    draw.rectangle((0, 0, PRINT_W, BLEED + BAR_H), fill=PURPLE[:3])
    return print_im


def compose(poster: dict, photo_meta: dict, photo: Image.Image, variant: str) -> Image.Image:
    kind, with_qr = variant_kind(variant)
    fx, fy = poster["focal"]
    bg = cover_crop(photo, W, H, fx, fy, poster["crop_scale"])
    bg = grade_photo(bg, poster["desaturate"], poster["overlay"])
    canvas = bg.convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, BAR_H), fill=PURPLE)

    logo_size = int(round(200 * SCALE))
    logo = raster_logo(logo_size)
    logo_x = (W - logo_size) // 2
    logo_y = max(SAFE, int(round(236 * SCALE)))
    canvas.alpha_composite(logo, (logo_x, logo_y))

    f_title = font(SERIF, int(round(56 * SCALE)))
    f_sub = font(SANS, int(round(20 * SCALE)))
    f_en = font(SANS, int(round(16 * SCALE)))
    f_uni = font(SANS, int(round(17 * SCALE)))
    f_url = font(SANS_SEMI, int(round(16 * SCALE)))
    f_foot = font(SANS, int(round(14 * SCALE)))
    f_credit = font(SANS, int(round(11 * SCALE)))
    f_qr = font(SANS, int(round(13 * SCALE)))

    title_box = draw.textbbox((0, 0), TITLE, font=f_title)
    title_y = int(round((520 if kind == "minimal" else 560) * SCALE)) - title_box[1]
    title_y = max(logo_y + logo_size + int(round(28 * SCALE)), title_y)
    draw_tracked(draw, ((W - tracked_width(TITLE, f_title, TRACK)) // 2, title_y), TITLE, f_title, INK, TRACK)
    y = title_y + (title_box[3] - title_box[1]) + int(round(28 * SCALE))

    if kind != "minimal":
        y = centered(draw, int(round(628 * SCALE)) if y < int(round(628 * SCALE)) else y, SUB_1, f_sub, SOFT)
        y = centered(draw, y + int(round(8 * SCALE)), SUB_2, f_sub, SOFT)
        y += int(round(18 * SCALE))
        if kind == "bilingue":
            y = centered(draw, y, SLOGAN_EN, f_en, MUTED)
            y += int(round(18 * SCALE))
        else:
            y += int(round(10 * SCALE))

    y = centered(draw, y if kind == "minimal" else max(y, int(round(700 * SCALE))), poster["line"], f_uni, SOFT)

    credit_name = photo_meta.get("credit") or "Wikimedia Commons"
    license_ = photo_meta.get("license") or ""
    credit = f"Photo : {credit_name}"
    if license_:
        credit = f"{credit} · {license_}"
    _cw, credit_h = text_size(draw, credit, f_credit)
    credit_y = H - SAFE - credit_h

    if with_qr:
        qr = raster_qr(QR_PX - 2 * QR_PAD)
        qw, qh = qr.size
        label = QR_LABEL_BI if kind == "bilingue" else QR_LABEL
        lw, lh = text_size(draw, label, f_qr)
        uw, uh = text_size(draw, URL, f_url)
        gap = int(round(10 * SCALE))
        stack_h = uh + gap + qh + gap + lh
        qr_top = credit_y - int(round(18 * SCALE)) - stack_h + uh + gap
        # URL au-dessus du QR
        url_y = qr_top - gap - uh
        if url_y < y + int(round(40 * SCALE)):
            url_y = y + int(round(40 * SCALE))
            qr_top = url_y + uh + gap
        draw.text(((W - uw) // 2, url_y), URL, font=f_url, fill=MUTED)
        canvas.paste(qr, ((W - qw) // 2, qr_top))
        lab_y = qr_top + qh + gap
        draw.text(((W - lw) // 2, lab_y), label, font=f_qr, fill=MUTED)
    else:
        url_y = max(int(round(1096 * SCALE)), y + int(round(80 * SCALE)))
        url_y = min(url_y, credit_y - int(round(70 * SCALE)))
        uw, uh = text_size(draw, URL, f_url)
        draw.text(((W - uw) // 2, url_y), URL, font=f_url, fill=MUTED)
        if kind != "minimal":
            fw, _ = text_size(draw, FOOT, f_foot)
            draw.text(((W - fw) // 2, url_y + uh + int(round(10 * SCALE))), FOOT, font=f_foot, fill=MUTED)

    draw.text(((W - text_size(draw, credit, f_credit)[0]) // 2, credit_y), credit, font=f_credit, fill=(136, 141, 150, 170))
    return canvas.convert("RGB")


def write_pdf(img_path: Path, pdf_path: Path, page_px: tuple[int, int]) -> None:
    magick = shutil.which("magick") or shutil.which("convert")
    if not magick:
        return
    pw, ph = page_px
    subprocess.run(
        [
            magick,
            str(img_path),
            "-units",
            "PixelsPerInch",
            "-density",
            str(DPI),
            "-page",
            f"{pw}x{ph}",
            str(pdf_path),
        ],
        check=True,
    )


def generate_one(poster: dict, bank: dict, formats: set[str], variants: tuple[str, ...]) -> None:
    meta = bank.get(poster["photo_id"])
    if not meta:
        raise SystemExit(f"affiche: photo {poster['photo_id']} absente de la banque")
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = CACHE / f"{poster['slug']}-{poster['photo_id']}.jpg"
    download(meta["url"], raw_path)
    photo = Image.open(raw_path)

    for variant in variants:
        img = compose(poster, meta, photo, variant)
        if img.size != (W, H):
            raise SystemExit(f"affiche: {poster['slug']} {variant} {img.size} ≠ {W}×{H}")
        if img.size[0] * 17 != img.size[1] * 11:
            raise SystemExit(f"affiche: {poster['slug']} {variant} ratio ≠ 11:17")

        stem = f"affiche-{poster['slug']}" if variant == "standard" else f"affiche-{poster['slug']}-{variant}"
        jpg_path = OUT_DIR / f"{stem}.jpg"
        preview_path = OUT_DIR / f"{stem}-preview.jpg"
        png_path = OUT_DIR / f"{stem}.png"
        pdf_path = OUT_DIR / f"{stem}.pdf"
        print_path = OUT_DIR / f"{stem}-print.jpg"

        img.save(jpg_path, "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0, optimize=True)
        img.resize((PREVIEW_W, PREVIEW_H), Image.Resampling.LANCZOS).save(
            preview_path, "JPEG", quality=86, optimize=True
        )
        if "png" in formats:
            img.save(png_path, "PNG", compress_level=9)
        if "pdf" in formats:
            write_pdf(jpg_path, pdf_path, (W, H))
        if "print" in formats:
            bled = add_bleed(img)
            bled.save(print_path, "JPEG", quality=95, dpi=(DPI, DPI), subsampling=0, optimize=True)
            if "pdf" in formats:
                write_pdf(print_path, OUT_DIR / f"{stem}-print.pdf", (PRINT_W, PRINT_H))

        jpg_mb = jpg_path.stat().st_size / 1_048_576
        print(f"✅ {poster['slug']}/{variant}: {W}×{H} jpg {jpg_mb:.1f} Mo")


def check_outputs(slugs: list[str], variants: tuple[str, ...]) -> None:
    missing = []
    for slug in slugs:
        for variant in variants:
            stem = f"affiche-{slug}" if variant == "standard" else f"affiche-{slug}-{variant}"
            preview = OUT_DIR / f"{stem}-preview.jpg"
            jpg = OUT_DIR / f"{stem}.jpg"
            if not preview.is_file():
                missing.append(str(preview.relative_to(ROOT)))
            # JPEG trim 11×17 : obligatoire pour le standard (kit média).
            if variant == "standard":
                if not jpg.is_file():
                    missing.append(str(jpg.relative_to(ROOT)))
                else:
                    with Image.open(jpg) as im:
                        if im.size != (W, H):
                            raise SystemExit(f"check: {jpg.name} {im.size} ≠ {W}×{H}")
                        if im.size[0] * 17 != im.size[1] * 11:
                            raise SystemExit(f"check: {jpg.name} ratio ≠ 11:17")
            elif jpg.is_file():
                with Image.open(jpg) as im:
                    if im.size != (W, H) or im.size[0] * 17 != im.size[1] * 11:
                        raise SystemExit(f"check: {jpg.name} hors format 11×17")
    if missing:
        raise SystemExit("check: fichiers manquants:\n  " + "\n  ".join(missing))
    if not QR_SVG.is_file():
        raise SystemExit("check: QR officiel manquant")
    print("OK affiches campus 11×17")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="slug unique (laval, mcgill, …)")
    parser.add_argument("--variant", action="append", dest="variants", help="standard|minimal|bilingue|*-qr")
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--formats",
        default="jpg,preview",
        help="jpg,preview,png,pdf,print",
    )
    args = parser.parse_args()
    formats = {part.strip() for part in args.formats.split(",") if part.strip()}
    variants = tuple(args.variants) if args.variants else VARIANTS
    for v in variants:
        variant_kind(v)

    posters = POSTERS
    if args.only:
        posters = [p for p in POSTERS if p["slug"] == args.only]
        if not posters:
            raise SystemExit(f"slug inconnu: {args.only}")

    slugs = [p["slug"] for p in posters]
    if args.check:
        check_outputs(slugs, variants)
        return

    for path in (SERIF, SANS, SANS_SEMI, ICON_SVG, BANK, QR_SVG):
        if not path.is_file():
            raise SystemExit(f"affiche: fichier manquant {path}")

    bank = load_bank()
    for poster in posters:
        generate_one(poster, bank, formats, variants)


if __name__ == "__main__":
    main()

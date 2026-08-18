#!/usr/bin/env python3
"""Génère assets/og-cover.png (1200×630) — carte de partage social.

Aligné sur le mât : Source Serif 4 Display + Inter, mot-symbole
« LE-RADAR.ca » d’une seule couleur (pas de .ca pourpre).
Lockup centré, accroche au rythme de l’ancienne carte
(« Les journaux… ») avec la triade + cégeps et universités.
Voir docs/identite-visuelle.md.

    python3 scripts/generate-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = Path(__file__).resolve().parent / "og-fonts"
OUT = ASSETS / "og-cover.png"
LOGO = ASSETS / "icon-512.png"

W, H = 1200, 630
INK = (10, 10, 11, 255)
PURPLE = (108, 33, 99, 255)
# --ink du thème sombre (style.css), pas un blanc pur
BRAND = (241, 242, 244, 255)
WHITE = (255, 255, 255, 255)
# --ink-soft sombre : la sous-ligne doit rester lisible en aperçu iMessage
SOFT = (194, 198, 205, 255)

SERIF_DISPLAY = FONTS / "SourceSerif4Display-Bold.ttf"
SANS = FONTS / "Inter-Regular.ttf"
SANS_SEMI = FONTS / "Inter-SemiBold.ttf"

BAR_H = 10
SIDE = 72
TRACK = -0.02


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit(f"og-cover: fonte manquante {path}")
    return ImageFont.truetype(str(path), size)


def text_width(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> int:
    return int(draw.textbbox((0, 0), s, font=f)[2])


def text_size(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> tuple[int, int]:
    l, t, r, b = draw.textbbox((0, 0), s, font=f)
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
    """Dessine `text` avec un tracking en em (le mât : -0.02em)."""
    x, y = xy
    extra = fnt.size * tracking_em
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += fnt.getlength(ch) + extra
    return int(x)


def trim_mark(im: Image.Image, bg: tuple[int, int, int, int] = INK, thresh: int = 28) -> Image.Image:
    """Retire le cadre sombre de l’icône pour coller le radar au mot-symbole."""
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    limit = thresh * 3
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < limit:
                continue
            found = True
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
    if not found:
        return im
    pad = 6
    return im.crop(
        (
            max(0, min_x - pad),
            max(0, min_y - pad),
            min(w, max_x + 1 + pad),
            min(h, max_y + 1 + pad),
        )
    )


def content_offset_x(img: Image.Image) -> int:
    """Écart (px) entre le centre du contenu et le centre du canevas."""
    px = img.load()
    min_x, max_x = W, 0
    for y in range(BAR_H + 4, H):
        for x in range(W):
            r, g, b = px[x, y][:3]
            if abs(r - INK[0]) + abs(g - INK[1]) + abs(b - INK[2]) > 36:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
    if max_x <= min_x:
        return 0
    return ((min_x + max_x) // 2) - (W // 2)


def main() -> None:
    img = Image.new("RGBA", (W, H), INK)
    draw = ImageDraw.Draw(img)

    # Filet pourpre en haut — rappel de la marque, pas une deuxième couleur
    # dans le mot-symbole.
    draw.rectangle((0, 0, W, BAR_H), fill=PURPLE)

    brand = "LE-RADAR.ca"
    # Rythme de l’ancienne carte (« Les journaux… ») + triade officielle.
    tag = "Les journaux, radios et sports étudiants du Québec"
    sub = "Cégeps et universités · fil étudiant et écoute en direct"

    f_brand = font(SERIF_DISPLAY, 116)
    f_tag = font(SANS_SEMI, 36)
    f_sub = font(SANS_SEMI, 30)

    max_text_w = W - 2 * SIDE
    if (
        text_width(draw, tag, f_tag) > max_text_w
        or text_width(draw, sub, f_sub) > max_text_w
        or tracked_width(brand, f_brand, TRACK) > max_text_w
    ):
        raise SystemExit("og-cover: accroche trop large — raccourcir le copy ou la fonte")

    logo_h = 140
    logo = None
    logo_w = 0
    if LOGO.exists():
        raw = trim_mark(Image.open(LOGO).convert("RGBA"))
        scale = logo_h / raw.height
        logo_w = max(1, int(round(raw.width * scale)))
        logo = raw.resize((logo_w, logo_h), Image.LANCZOS)

    brand_w, brand_h = tracked_width(brand, f_brand, TRACK), text_size(draw, brand, f_brand)[1]
    gap = 28
    lockup_w = (logo_w + gap + brand_w) if logo is not None else brand_w
    lockup_h = max(logo_h, brand_h)

    tag_w, tag_h = text_size(draw, tag, f_tag)
    sub_w, sub_h = text_size(draw, sub, f_sub)
    after_lockup = 44
    after_tag = 16
    stack_h = lockup_h + after_lockup + tag_h + after_tag + sub_h

    top = BAR_H + max(0, (H - BAR_H - stack_h) // 2)
    lockup_x = (W - lockup_w) // 2

    if logo is not None:
        logo_y = top + (lockup_h - logo_h) // 2
        img.alpha_composite(logo, (lockup_x, logo_y))
        brand_x = lockup_x + logo_w + gap
    else:
        brand_x = lockup_x

    brand_box = draw.textbbox((0, 0), brand, font=f_brand)
    brand_y = top + (lockup_h - brand_h) // 2 - brand_box[1]
    draw_tracked(draw, (brand_x, brand_y), brand, f_brand, BRAND, TRACK)

    tag_y = top + lockup_h + after_lockup
    sub_y = tag_y + tag_h + after_tag
    draw.text(((W - tag_w) // 2, tag_y), tag, font=f_tag, fill=WHITE)
    draw.text(((W - sub_w) // 2, sub_y), sub, font=f_sub, fill=SOFT)

    rgb = img.convert("RGB")
    shift = content_offset_x(rgb)
    if abs(shift) > 14:
        raise SystemExit(f"og-cover: lockup hors centre ({shift:+d} px)")
    rgb.save(OUT, "PNG", optimize=True)
    print(f"✅ {OUT.relative_to(ROOT)} ({W}×{H}, centre {shift:+d} px)")


if __name__ == "__main__":
    main()

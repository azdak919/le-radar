#!/usr/bin/env python3
"""Génère assets/og-cover.png (1200×630) — carte de partage social.

Aligné sur le mât : Source Serif 4 Display + Inter, mot-symbole
« LE-RADAR.ca » d’une seule couleur (pas de .ca pourpre).
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
MUTED = (168, 168, 176, 255)

SERIF_DISPLAY = FONTS / "SourceSerif4Display-Bold.ttf"
SANS = FONTS / "Inter-Regular.ttf"
SANS_SEMI = FONTS / "Inter-SemiBold.ttf"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise SystemExit(f"og-cover: fonte manquante {path}")
    return ImageFont.truetype(str(path), size)


def text_width(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> int:
    return int(draw.textbbox((0, 0), s, font=f)[2])


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


def main() -> None:
    img = Image.new("RGBA", (W, H), INK)
    draw = ImageDraw.Draw(img)

    # Filet pourpre en haut — rappel de la marque, pas une deuxième couleur
    # dans le mot-symbole.
    draw.rectangle((0, 0, W, 10), fill=PURPLE)

    logo_size = 132
    logo_y = 214
    logo_x = 96
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA").resize(
            (logo_size, logo_size), Image.LANCZOS
        )
        img.alpha_composite(logo, (logo_x, logo_y))

    # Mot-symbole = le titrage du mât : une fonte, une couleur, .ca inclus.
    f_brand = font(SERIF_DISPLAY, 92)
    brand = "LE-RADAR.ca"
    brand_x = logo_x + logo_size + 22
    brand_y = logo_y + 18
    draw_tracked(draw, (brand_x, brand_y), brand, f_brand, BRAND, -0.02)

    f_tag = font(SANS_SEMI, 30)
    tag = "Journaux, radios et sports étudiants du Québec"
    f_sub = font(SANS, 24)
    sub = "Fil étudiant, écoute en direct et résultats sportifs"
    max_text_w = W - logo_x - 48
    if text_width(draw, tag, f_tag) > max_text_w or text_width(draw, sub, f_sub) > max_text_w:
        raise SystemExit("og-cover: accroche trop large — raccourcir le copy ou la fonte")
    draw.text((logo_x, logo_y + logo_size + 46), tag, font=f_tag, fill=WHITE)
    draw.text((logo_x, logo_y + logo_size + 92), sub, font=f_sub, fill=MUTED)

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"✅ {OUT.relative_to(ROOT)} ({W}×{H})")


if __name__ == "__main__":
    main()

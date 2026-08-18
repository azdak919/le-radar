#!/usr/bin/env python3
"""Génère assets/og-cover.png (1200×630) — carte de partage social.

Charte : pourpre #6C2163 (marque), fond encre #0A0A0B (tuile du logo).
Voir docs/identite-visuelle.md.

    python3 scripts/generate-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ASSETS / "og-cover.png"
LOGO = ASSETS / "icon-512.png"

W, H = 1200, 630
INK = (10, 10, 11, 255)
PURPLE = (108, 33, 99, 255)
WHITE = (255, 255, 255, 255)
MUTED = (168, 168, 176, 255)

SERIF_BOLD = "/usr/share/fonts/dejavu-serif-fonts/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


def text_width(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> int:
    return int(draw.textbbox((0, 0), s, font=f)[2])


def main() -> None:
    img = Image.new("RGBA", (W, H), INK)
    draw = ImageDraw.Draw(img)

    # Filet pourpre en haut — rappel de la marque.
    draw.rectangle((0, 0, W, 10), fill=PURPLE)

    # Logo (tuile pourpre existante), à gauche du mot-symbole.
    logo_size = 132
    logo_y = 214
    logo_x = 96
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA").resize(
            (logo_size, logo_size), Image.LANCZOS
        )
        img.alpha_composite(logo, (logo_x, logo_y))

    # Mot-symbole.
    f_brand = font(SERIF_BOLD, 104)
    brand_x = logo_x + logo_size + 30
    draw.text((brand_x, logo_y + 4), "LE-RADAR", font=f_brand, fill=WHITE)
    brand_w = text_width(draw, "LE-RADAR", f_brand)
    f_tld = font(SERIF_BOLD, 104)
    draw.text((brand_x + brand_w, logo_y + 4), ".ca", font=f_tld, fill=PURPLE)

    # Accroche — slogan officiel (docs/identite-visuelle.md) : la triade
    # journaux + radios + sports doit rester visible dans l'aperçu de lien.
    f_tag = font(SANS_BOLD, 32)
    tag = "Journaux, radios et sports étudiants du Québec"
    f_sub = font(SANS, 26)
    sub = "Cégeps et universités · fil étudiant, écoute en direct et scores"
    max_text_w = W - logo_x - 48
    if text_width(draw, tag, f_tag) > max_text_w or text_width(draw, sub, f_sub) > max_text_w:
        raise SystemExit("og-cover: accroche trop large — raccourcir le copy ou la fonte")
    draw.text((logo_x, logo_y + logo_size + 46), tag, font=f_tag, fill=WHITE)
    draw.text((logo_x, logo_y + logo_size + 94), sub, font=f_sub, fill=MUTED)

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"✅ {OUT.relative_to(ROOT)} ({W}×{H})")


if __name__ == "__main__":
    main()

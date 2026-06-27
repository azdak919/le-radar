#!/usr/bin/env python3
"""Génère les PNG PWA (192 / 512) — journal 📰 à gauche, micro 🎙️ à droite."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONT = Path("/usr/share/fonts/google-noto-color-emoji-fonts/Noto-COLRv1.ttf")
EMOJI_NEWS = "📰"
EMOJI_RADIO = "🎙️"
BG = (10, 10, 11, 255)
NEWS_BG = (108, 33, 99, 255)
RADIO_BG = (0, 61, 165, 255)
SIZES = (192, 512)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_emoji(draw, emoji: str, font, cx: float, cy: float) -> None:
    bbox = draw.textbbox((0, 0), emoji, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = cx - tw / 2 - bbox[0]
    y = cy - th / 2 - bbox[1]
    draw.text((x, y), emoji, font=font, embedded_color=True)


def render_icon(size: int) -> Image.Image:
    radius = max(12, round(size * 0.227))
    pad = max(4, round(size * 0.055))
    gap = max(3, round(size * 0.03))
    tile_w = (size - pad * 2 - gap) // 2
    tile_h = size - pad * 2
    tile_radius = max(10, round(size * 0.094))

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base = Image.new("RGBA", (size, size), BG)
    base.putalpha(rounded_mask(size, radius))
    canvas.alpha_composite(base)

    draw = ImageDraw.Draw(canvas)
    left_box = (pad, pad, pad + tile_w - 1, pad + tile_h - 1)
    right_box = (pad + tile_w + gap, pad, size - pad - 1, pad + tile_h - 1)
    draw.rounded_rectangle(left_box, radius=tile_radius, fill=NEWS_BG)
    draw.rounded_rectangle(right_box, radius=tile_radius, fill=RADIO_BG)

    font = ImageFont.truetype(str(FONT), int(size * 0.34))
    draw_emoji(draw, EMOJI_NEWS, font, pad + tile_w / 2, size / 2)
    draw_emoji(draw, EMOJI_RADIO, font, pad + tile_w + gap + tile_w / 2, size / 2)
    return canvas


def main() -> None:
    if not FONT.exists():
        raise SystemExit(f"Emoji font not found: {FONT}")

    for size in SIZES:
        out = ASSETS / f"icon-{size}.png"
        render_icon(size).save(out, format="PNG", optimize=True)
        print(f"✓ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
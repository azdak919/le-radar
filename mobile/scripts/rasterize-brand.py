#!/usr/bin/env python3
"""Recopie l’icône PWA existante vers les tailles Android et iOS.

Source : assets/icon-512.png (marque déjà publiée). La version 1024
est un agrandissement de ce fichier, pas un nouveau dessin.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "icon-512.png"
BG = (14, 15, 18, 255)

ANDROID_LAUNCHER = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
ANDROID_FOREGROUND = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def cover(size):
    icon = Image.open(SOURCE).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BG)
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon)
    return canvas.convert("RGB")


def splash(width, height):
    canvas = Image.new("RGB", (width, height), BG[:3])
    icon = cover(int(min(width, height) * 0.34))
    canvas.paste(icon, ((width - icon.width) // 2, (height - icon.height) // 2))
    return canvas


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def main():
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    for folder, size in ANDROID_LAUNCHER.items():
        image = cover(size)
        save(image, res / folder / "ic_launcher.png")
        save(image, res / folder / "ic_launcher_round.png")
    for folder, size in ANDROID_FOREGROUND.items():
        save(cover(size), res / folder / "ic_launcher_foreground.png")
    for path in res.glob("drawable*/splash.png"):
        with Image.open(path) as current:
            save(splash(*current.size), path)
    ios = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
    save(cover(1024), ios / "AppIcon.appiconset" / "AppIcon-512@2x.png")
    splash_dir = ios / "Splash.imageset"
    for path in splash_dir.glob("*.png"):
        save(splash(2732, 2732), path)
    print("icônes recopiées depuis assets/icon-512.png")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Sous-ensemble de Noto Color Emoji limité aux emojis de sport du studio d'affiches.

Lit SPORT_EMOJI_ALL dans scripts/magazine-front-page-lib.js et écrit
assets/kit/fonts/emoji/noto-color-emoji-sports.woff2 (bitmaps couleur CBDT).
Relancer seulement si la table SPORT_EMOJI change. --check vérifie coverage.json sans fontTools (CI).
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "scripts" / "magazine-front-page-lib.js"
OUT = ROOT / "assets" / "kit" / "fonts" / "emoji"
FONT = OUT / "noto-color-emoji-sports.woff2"
COVERAGE = OUT / "coverage.json"
SRC_URL = "https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf"
LOCAL = Path("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf")


def wanted() -> list[str]:
    src = LIB.read_text(encoding="utf8")
    block = src[src.index("const SPORT_EMOJI_FALLBACK"):src.index("function sportEmoji")]
    return sorted(set(re.findall(r"'([^'\x00-\x7f]+)'", block)))


def main() -> int:
    emojis = wanted()
    if "--check" in sys.argv:
        cov = json.loads(COVERAGE.read_text(encoding="utf8"))
        missing = [e for e in emojis if e not in cov["emojis"]]
        if missing or not FONT.exists():
            print("police emoji périmée :", " ".join(missing) or "fichier absent", file=sys.stderr)
            return 1
        return 0
    from fontTools import subset  # noqa: PLC0415
    from fontTools.ttLib import TTFont  # noqa: PLC0415
    src = LOCAL
    if not src.exists():
        src = Path(tempfile.gettempdir()) / "NotoColorEmoji.ttf"
        if not src.exists():
            urllib.request.urlretrieve(SRC_URL, src)
    cps = sorted({ord(c) for e in emojis for c in e} | {0xFE0F})
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(FONT)
    cmap = font.getBestCmap()
    missing = [e for e in emojis if any(ord(c) not in cmap for c in e if ord(c) != 0xFE0F)]
    if missing:
        print("glyphes absents :", " ".join(missing), file=sys.stderr)
        return 1
    COVERAGE.write_text(json.dumps({"emojis": emojis}, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(FONT.relative_to(ROOT), FONT.stat().st_size, "octets,", len(emojis), "emojis")
    return 0


if __name__ == "__main__":
    sys.exit(main())

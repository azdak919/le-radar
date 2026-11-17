#!/usr/bin/env python3
"""Sous-ensemble de Noto Color Emoji (licence OFL 1.1) pour l'impression de la revue (revue.css, @media print).

Rubriques, radio, sport (voile comprise) : assets/revue/noto-color-emoji-revue.woff2 (bitmaps couleur CBDT), pour que
les émojis s'impriment pareil partout, même sans police d'émojis installée sur l'ordinateur.
Relancer si scripts/revue/revue-render.js (THEME_EMOJI) ou la table des sports (scripts/social/une-lib.mjs) change.
--check : vérifie coverage.json sans fontTools (CI).
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "revue"
FONT = OUT / "noto-color-emoji-revue.woff2"
COVERAGE = OUT / "emoji-coverage.json"
SRC_URL = "https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf"
LOCAL = Path("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf")
EXTRA = {"🏅", "📰", "🌙", "☀️"}  # repli des sports et des thèmes, éditions
EMOJI_RE = re.compile(r"'([^'\x00-\x7f]+)'")


def wanted() -> list[str]:
    render = (ROOT / "scripts" / "revue" / "revue-render.js").read_text(encoding="utf8")
    une = (ROOT / "scripts" / "social" / "une-lib.mjs").read_text(encoding="utf8")
    found = set(EMOJI_RE.findall(render[render.index("const THEME_EMOJI"):render.index("const THEME_ORDER")]))
    found |= set(re.findall(r"emo\('([^']+)'\)", render))
    for start, end in (("const SPORT_EMOJI", "\n"), ("const CODE_EMOJI", "\n")):
        i = une.index(start)
        found |= set(EMOJI_RE.findall(une[i:une.index(end, i)]))
    found |= EXTRA
    return sorted(e for e in found if any(ord(c) > 0x2000 for c in e))


def main() -> int:
    emojis = wanted()
    if "--check" in sys.argv:
        cov = json.loads(COVERAGE.read_text(encoding="utf8"))
        missing = [e for e in emojis if e not in cov["emojis"]]
        if missing or not FONT.exists():
            print("police émoji de la revue périmée :", " ".join(missing) or "fichier absent", file=sys.stderr)
            return 1
        print("police émoji de la revue : OK")
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
    OUT.mkdir(parents=True, exist_ok=True)
    font.save(FONT)
    cmap = font.getBestCmap()
    missing = [e for e in emojis if any(ord(c) not in cmap for c in e if ord(c) != 0xFE0F)]
    if missing:
        print("glyphes absents :", " ".join(missing), file=sys.stderr)
        return 1
    COVERAGE.write_text(json.dumps({"emojis": emojis}, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(FONT.relative_to(ROOT), FONT.stat().st_size, "octets,", len(emojis), "émojis")
    return 0


if __name__ == "__main__":
    sys.exit(main())

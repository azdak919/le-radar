#!/usr/bin/env python3
"""Télécharge les Noto Sans Regular et n’en garde que les glyphes des endonymes du studio d’affiches.

Les fichiers produits vont dans assets/kit/fonts/langs/. Relancer ce script
seulement si la liste TRANSLATE_LANGS change ou si une fonte source est mise à jour.
"""
from __future__ import annotations

import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools.subset import Options, Subsetter, load_font, save_font
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "affiches" / "poster-builder.js"
OUT = ROOT / "assets" / "kit" / "fonts" / "langs"
CACHE = Path(tempfile.gettempdir()) / "le-radar-noto-src"

NOTO_BASE = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts"
CJK_BASE = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF"
OFL_URL = "https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt"

# family CSS, fichier woff2, URL source
FONTS = [
    ("Noto Sans", "noto-sans.woff2", f"{NOTO_BASE}/NotoSans/hinted/ttf/NotoSans-Regular.ttf"),
    ("Noto Sans Canadian Aboriginal", "noto-sans-canadian-aboriginal.woff2", f"{NOTO_BASE}/NotoSansCanadianAboriginal/hinted/ttf/NotoSansCanadianAboriginal-Regular.ttf"),
    ("Noto Sans Ethiopic", "noto-sans-ethiopic.woff2", f"{NOTO_BASE}/NotoSansEthiopic/hinted/ttf/NotoSansEthiopic-Regular.ttf"),
    ("Noto Sans Arabic", "noto-sans-arabic.woff2", f"{NOTO_BASE}/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf"),
    ("Noto Sans Bengali", "noto-sans-bengali.woff2", f"{NOTO_BASE}/NotoSansBengali/hinted/ttf/NotoSansBengali-Regular.ttf"),
    ("Noto Sans Gujarati", "noto-sans-gujarati.woff2", f"{NOTO_BASE}/NotoSansGujarati/hinted/ttf/NotoSansGujarati-Regular.ttf"),
    ("Noto Sans Hebrew", "noto-sans-hebrew.woff2", f"{NOTO_BASE}/NotoSansHebrew/hinted/ttf/NotoSansHebrew-Regular.ttf"),
    ("Noto Sans Devanagari", "noto-sans-devanagari.woff2", f"{NOTO_BASE}/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf"),
    ("Noto Sans Kannada", "noto-sans-kannada.woff2", f"{NOTO_BASE}/NotoSansKannada/hinted/ttf/NotoSansKannada-Regular.ttf"),
    ("Noto Sans Malayalam", "noto-sans-malayalam.woff2", f"{NOTO_BASE}/NotoSansMalayalam/hinted/ttf/NotoSansMalayalam-Regular.ttf"),
    ("Noto Sans Gurmukhi", "noto-sans-gurmukhi.woff2", f"{NOTO_BASE}/NotoSansGurmukhi/hinted/ttf/NotoSansGurmukhi-Regular.ttf"),
    ("Noto Sans Tamil", "noto-sans-tamil.woff2", f"{NOTO_BASE}/NotoSansTamil/hinted/ttf/NotoSansTamil-Regular.ttf"),
    ("Noto Sans Telugu", "noto-sans-telugu.woff2", f"{NOTO_BASE}/NotoSansTelugu/hinted/ttf/NotoSansTelugu-Regular.ttf"),
    ("Noto Sans Thai", "noto-sans-thai.woff2", f"{NOTO_BASE}/NotoSansThai/hinted/ttf/NotoSansThai-Regular.ttf"),
    ("Noto Sans JP", "noto-sans-jp.woff2", f"{CJK_BASE}/JP/NotoSansJP-Regular.otf"),
    ("Noto Sans KR", "noto-sans-kr.woff2", f"{CJK_BASE}/KR/NotoSansKR-Regular.otf"),
    ("Noto Sans SC", "noto-sans-sc.woff2", f"{CJK_BASE}/SC/NotoSansSC-Regular.otf"),
    ("Noto Sans TC", "noto-sans-tc.woff2", f"{CJK_BASE}/TC/NotoSansTC-Regular.otf"),
]


def translate_text() -> str:
    src = BUILDER.read_text(encoding="utf-8")
    match = re.search(r"const TRANSLATE_LANGS = \[([\s\S]*?)\];", src)
    if not match:
        raise SystemExit("TRANSLATE_LANGS introuvable dans poster-builder.js")
    names = re.findall(r"'([^']*)'", match.group(1))
    if len(names) < 10:
        raise SystemExit(f"liste d’endonymes trop courte ({len(names)})")
    # Séparateur du pied d’affiche, plus espaces et tirets éventuels.
    return "  ·  ".join(names) + " -–—'"


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    print(f"téléchargement {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "le-radar-font-subset"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())
    if dest.stat().st_size < 1000:
        dest.unlink(missing_ok=True)
        raise SystemExit(f"téléchargement trop petit : {url}")
    return dest


def subset(src: Path, dest: Path, text: str) -> None:
    options = Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.legacy_cmap = True
    options.symbol_cmap = True
    options.glyph_names = True
    options.drop_tables = ["DSIG"]
    font = load_font(str(src), options)
    subsetter = Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    save_font(font, str(dest), options)
    font.close()


def cmap_of(path: Path) -> set[str]:
    font = TTFont(path)
    chars: set[str] = set()
    for table in font["cmap"].tables:
        for cp in table.cmap:
            chars.add(chr(cp))
    font.close()
    return chars


def verify_coverage(text: str) -> None:
    needed = {ch for ch in text if ch != "\u0000"}
    coverage: set[str] = set()
    missing_files = []
    for _family, filename, _url in FONTS:
        dest = OUT / filename
        if not dest.is_file():
            missing_files.append(filename)
            continue
        coverage |= {ch for ch in cmap_of(dest) if ch in needed}
    if missing_files:
        raise SystemExit(f"fontes manquantes dans {OUT} : {', '.join(missing_files)}")
    if not (OUT / "OFL.txt").is_file():
        raise SystemExit(f"licence OFL manquante dans {OUT}")
    missing = sorted(ch for ch in needed if ch not in coverage)
    if missing:
        shown = " ".join(f"U+{ord(ch):04X} {ch}" for ch in missing)
        raise SystemExit(f"glyphes manquants dans langs/*.woff2 : {shown}")


def main() -> int:
    text = translate_text()
    if "--check" in sys.argv:
        verify_coverage(text)
        print("OK poster-lang-fonts")
        return 0
    needed = set(text)
    OUT.mkdir(parents=True, exist_ok=True)
    coverage: set[str] = set()
    for _family, filename, url in FONTS:
        ext = Path(url).suffix
        src = download(url, CACHE / f"{Path(filename).stem}{ext}")
        dest = OUT / filename
        subset(src, dest, text)
        found = cmap_of(dest)
        useful = {ch for ch in found if ch in needed and ch != "\u0000"}
        coverage |= useful
        print(f"  {filename:42} {dest.stat().st_size:6} o  {len(useful):3} glyphes utiles")
    ofl = download(OFL_URL, OUT / "OFL.txt")
    print(f"  OFL.txt copié ({ofl.stat().st_size} o)")
    verify_coverage(text)
    print("couverture complète")
    return 0


if __name__ == "__main__":
    sys.exit(main())

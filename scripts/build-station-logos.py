#!/usr/bin/env python3
"""Adapte les logos OFFICIELS des stations (assets/logos/originals/) en tuiles carrées.

Aucune génération ni retouche : on recadre l'original et on ajoute des marges
de la couleur de fond d'origine (ou d'une couleur unie tirée du logo).
Sorties : assets/logos/stations/<id>-512.png et <id>-192.png, plus
android/app/src/main/res/drawable-nodpi/station_<id>.png (artwork natif Media3).
Provenance : data/station-logos-sources.json.  Usage : python3 scripts/build-station-logos.py
"""
import io, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = json.load(open(os.path.join(ROOT, 'data/station-logos-sources.json'), encoding='utf-8'))

def load(path):
    if path.endswith('.svg'):
        import cairosvg
        return Image.open(io.BytesIO(cairosvg.svg2png(url=path, output_width=1600))).convert('RGBA')
    return Image.open(path).convert('RGBA')

for st in SRC['stations']:
    a = st.get('adapt') or {}
    im = load(os.path.join(ROOT, st['original']))
    if a.get('crop'):
        im = im.crop(tuple(a['crop']))
    bbox = im.getchannel('A').getbbox()
    if bbox and a.get('trim', True):
        im = im.crop(bbox)
    bg = a.get('background', '#ffffff')
    fill = float(a.get('fill', 0.8))
    for size, out in ((512, 'assets/logos/stations/%s-512.png'), (192, 'assets/logos/stations/%s-192.png')):
        tile = Image.new('RGBA', (size, size), bg)
        logo = im.copy()
        s = min(size * fill / logo.width, size * fill / logo.height)
        logo = logo.resize((max(1, round(logo.width * s)), max(1, round(logo.height * s))), Image.LANCZOS)
        tile.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
        tile.convert('RGB').save(os.path.join(ROOT, out % st['id']), optimize=True)
    nat = os.path.join(ROOT, 'android/app/src/main/res/drawable-nodpi')
    os.makedirs(nat, exist_ok=True)
    Image.open(os.path.join(ROOT, 'assets/logos/stations/%s-512.png' % st['id'])).save(
        os.path.join(nat, 'station_%s.png' % st['id']), optimize=True)
    print('ok', st['id'])

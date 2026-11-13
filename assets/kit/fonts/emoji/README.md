# Noto Color Emoji — emojis de sport d'affiche

Sous-ensemble (bitmaps couleur CBDT) de [Noto Color Emoji](https://github.com/googlefonts/noto-emoji),
licence SIL OFL 1.1 (`OFL.txt`), limité aux emojis de `SPORT_EMOJI` dans
`scripts/magazine-front-page-lib.js` (bande sports, bilan, formats écran du studio).

Ne pas éditer le `.woff2` à la main. Si la table change :

```
python3 scripts/subset-poster-emoji-font.py
```

`python3 scripts/subset-poster-emoji-font.py --check` vérifie `coverage.json` sans fontTools (CI).

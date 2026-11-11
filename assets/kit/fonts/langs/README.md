# Noto Sans Regular — endonymes d’affiche

Sous-ensemble (graisse 400 seulement) des Noto Sans nécessaires aux noms de langues
du studio d’affiches (`TRANSLATE_LANGS` dans `affiches/poster-builder.js`).

Sources : [notofonts.github.io](https://github.com/notofonts/notofonts.github.io)
et [noto-cjk](https://github.com/notofonts/noto-cjk), licence SIL OFL 1.1 (`OFL.txt`).

Ne pas éditer les `.woff2` à la main. Si la liste des langues change :

```
python3 scripts/subset-poster-lang-fonts.py
```

# Affiches campus 11 × 17

Trim **3300 × 5100 px** (11 × 17 po @ 300 dpi). Pas de barre colorée.
Grand pictogramme satellite + wordmark **[logo PWA | LE-RADAR.ca]**.

- Sans photo : fond `#0E0F12` + motif radar très léger
- Avec photo : overlay `#0E0F12` 55–70 %
- Zone QR : carré blanc 2,25 po (quiet zone pour coller le SVG `assets/kit/qr-le-radar.svg`)

```
python3 scripts/generate-campus-posters.py --ground nophoto --only generique,laval,mcgill,udem
python3 scripts/generate-campus-posters.py
```

Labo : http://127.0.0.1:8777/dev/affiche-lab.html

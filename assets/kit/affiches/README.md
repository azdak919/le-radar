# Affiches campus 11 × 17

Trim **3300 × 5100 px** (11 × 17 po à 300 dpi), ratio exact 11:17.
Zone de sécurité 0,5 po. Bleed 0,125 po : `python3 scripts/generate-campus-posters.py --formats print`.

QR vectoriel officiel : `assets/kit/qr-le-radar.svg` (le-radar.ca).

## Variantes

| Clé | Contenu |
|---|---|
| `standard` | Slogan FR + université + URL |
| `minimal` | Logo, mot-symbole, université, URL |
| `bilingue` | Standard + « Student media on your radar » |
| `*-qr` | Les trois + QR 2,25 po, quiet zone blanche |

```
python3 scripts/generate-campus-posters.py --only laval
python3 scripts/generate-campus-posters.py --variant standard-qr
```

Labo local : `http://127.0.0.1:8777/dev/affiche-lab.html`

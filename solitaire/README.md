# Solitaire — Klondike (Le Radar)

Solitaire Klondike avec embed radio Le Radar. Mini-app **isolée** hébergée sous Le Radar.

**URL :** [le-radar.ca/solitaire/](https://le-radar.ca/solitaire/)

## PWA

- Manifest : `site.webmanifest` (`scope` / `start_url` = `./`)
- Service worker : `sw.js` (préfixe de cache `solitaire-*` uniquement)
- Icônes : joker 🃏 (Twemoji) / carreau rouge sur carreau sombre

Régénérer les PNG :

```bash
python3 scripts/generate-icons.py
```

## Isolation

Cette app ne partage **ni** service worker **ni** cache avec le shell Le Radar ni avec Pomodoro.  
Embed tuner : `../tuner-embed.html` (même origine).

## Dev local

```bash
# depuis la racine le-radar
python -m http.server 8080
# → http://localhost:8080/solitaire/
```

## Licence

GNU GPL v2 (voir le dépôt Le Radar)

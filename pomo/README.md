# Pomodoro — minuteur focus (Le Radar)

Minuteur Pomodoro, citations et fonds d’écran. Mini-app **isolée** hébergée sous Le Radar.

**URL :** [le-radar.ca/pomo/](https://le-radar.ca/pomo/)

## PWA

- Manifest : `site.webmanifest` (`scope` / `start_url` = `./`)
- Service worker : `sw.js` (préfixe de cache `pomo-*` uniquement)
- Icônes : tomate 🍅 (Twemoji) sur carreau sombre

## Isolation

Cette app ne partage **ni** service worker **ni** cache avec le shell Le Radar ni avec Solitaire.  
Les données `localStorage` restent sur l’origine `le-radar.ca` (clés historiques `ataraxia_*`).

## Dev local

```bash
# depuis la racine le-radar
python -m http.server 8080
# → http://localhost:8080/pomo/
```

## Licence

[GNU GPL v2](LICENSE)

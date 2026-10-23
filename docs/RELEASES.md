# Suivi des versions — Web, PWA et Android

Ce fichier suit l'état des trois canaux de diffusion du Radar. À mettre à jour à chaque
déploiement notable, changement de cache du service worker ou étiquette Android.

_Dernière mise à jour : 23 octobre 2026._

## 1. Web (GitHub Pages, le-radar.ca)

| Élément | Valeur |
|---|---|
| Dernier commit `main` déployé | `5fce3112c` — fix(pwa): plus de rechargement automatique au changement de service worker |
| Déploiement GitHub Pages | ✅ réussi (`pages-build-deployment`, run 39900114253) |
| Date du déploiement | 23 octobre 2026, 0 h 24 (HAE) |

Le site se déploie automatiquement à chaque poussée sur `main`. Vérifier avec
`gh run list -w pages-build-deployment -L 1`.

## 2. PWA (service workers)

| Service worker | Cache actuel en ligne |
|---|---|
| `sw.js` (site) | `radar-shell-v918` (+ `radar-offline-v22`) |
| `sports/sw.js` (Sports) | `sports-shell-v285` |

### Historique récent des correctifs PWA

- **2026-10-23 — `5fce3112c`** : retrait du rechargement automatique sur `controllerchange`.
  L'app se rechargeait seule après chaque nouvelle version (et au retour après plus d'une
  heure), ce qui obligeait à rafraîchir une à trois fois avant d'être utilisable.
- 2026-10-21 — `94ab25143` : cartes article comme le site + fond « verre » du mât.
- 2026-10-18 — `e6b1f2fd6` : mât Sports compacté (payload 15 % → 7 %).
- 2026-10-17 — `bb36ab5e2` : pointages RSEQ en direct dans le navigateur.

## 3. Android (Capacitor, F-Droid)

| Étiquette | Date de l'étiquette | Statut F-Droid |
|---|---|---|
| `android-v1.0.0` | 2026-09-21 | — (antérieure à F-Droid) |
| `android-v1.0.1` | 2026-10-05 | — (antérieure à F-Droid) |
| `android-v1.1.0` | 2026-10-07 | ✅ publiée (MR fdroiddata 49671 fusionnée le 2026-10-15) |
| `android-v1.1.1` | 2026-10-21 | ⏳ dans la recette fdroiddata, pas encore construite ni publiée |

F-Droid construit par lots ; compter quelques jours à une semaine après l'étiquette.
L'APK embarque son propre code (pas de `server.url`) ; seules les données viennent de
le-radar.ca en direct.

### Changements web pas encore dans l'APK (après `android-v1.1.1`)

- `5fce3112c` — retrait du rechargement automatique du service worker (sans effet sur l'APK,
  qui n'utilise pas le service worker).
- `ca4c1bfce` — image de signature courriel (`assets/signature.png`), web seulement.
- `94ab25143` — cartes article comme le site + fond « verre » du mât (inclure dans la
  prochaine version Android).

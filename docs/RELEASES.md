# Suivi des versions — Web, PWA et Android

Ce fichier suit l'état des trois canaux de diffusion du Radar. À mettre à jour à chaque
déploiement notable, changement de cache du service worker ou étiquette Android.

_Dernière mise à jour : 23 octobre 2026._

## 1. Web (GitHub Pages, le-radar.ca)

| Élément | Valeur |
|---|---|
| Dernier commit `main` déployé | `324deea06` — bot : mise à jour du fil (auto), 23 oct. 2026, 9 h 29 (HAE) |
| Dernier changement de code déployé | `0e56639e4` — fix(news) : n'afficher que la session en cours ou ≤ 45 jours |
| Déploiement GitHub Pages | ✅ réussi (`pages-build-deployment`, run 39961702958) |
| Date du déploiement | 23 octobre 2026, 9 h 30 (HAE) |
| le-radar.ca | ✅ HTTP 200 (vérifié le 23 oct. 2026, 9 h 35 HAE) |

Le site se déploie automatiquement à chaque poussée sur `main`. Vérifier avec
`gh run list -w pages-build-deployment -L 1`.

## 2. PWA (service workers)

| Service worker | Cache actuel en ligne |
|---|---|
| `sw.js` (site) | `radar-shell-v924` (+ `radar-offline-v22`) — introduit par `0e56639e4` |
| `sports/sw.js` (Sports) | `sports-shell-v291` — introduit par `0e56639e4` |

Le `sw.js` servi en ligne correspond à celui de `main` (pas de version périmée).

### Historique récent des correctifs PWA

- 2026-10-23 — `0e56639e4` : fraîcheur des nouvelles (session en cours ou ≤ 45 jours);
  `news.json` élagué, caches montés à v924 / v291.
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
| `android-v1.1.1` | 2026-10-21 | ⏳ recette fdroiddata mise à jour le 2026-10-22 (`bba9c08a`, CurrentVersion 1.1.1 / 4), pas encore construite ni publiée |
| `android-v1.2.0` | 2026-10-23 | ⏳ étiquetée (versionCode 5) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.1` | 2026-10-23 | ⏳ étiquetée (versionCode 6) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.2` | 2026-10-23 | ⏳ étiquetée (versionCode 7) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.3` | 2026-10-23 | ⏳ étiquetée (versionCode 8) ; en attente de la détection F-Droid (`^android-v`) |

Version publiée par F-Droid (API `packages/ca.leradar.app`, vérifiée le 2026-10-23) :
**1.1.0 (versionCode 3)**. `main` est à **1.2.3 (versionCode 8)**.

F-Droid construit par lots ; compter quelques jours à une semaine après l'étiquette.
L'APK embarque son propre code (pas de `server.url`) ; seules les données viennent de
le-radar.ca en direct.

### Changements web pas encore dans l'APK (après `android-v1.2.3`)

Aucun pour l'instant.

### Préparée, non étiquetée : `1.2.4` (versionCode 9)

Barre radio de l'app en haut (le syntoniseur du site, en double, est masqué dans l'app
seulement). Lecteur Media3 réparé : session ajoutée au service et filtres d'intention
`MediaLibraryService`/`MediaSessionService`/`MediaBrowserService` (la notification et
l'écran verrouillé n'apparaissaient pas), pause sans perdre la notification. Liste de
lecture des stations : suivante/précédente au volant, métadonnées AVRCP (station,
émission, « Le Radar », logo). Android Auto : `MediaLibraryService` + `automotive_app_desc`
(stations suivies, toutes, par ville). Aucune bibliothèque Google.

### Contenu de `android-v1.2.3` (versionCode 8)

Radios muettes affichées « Hors ligne » (`578dd4f80`, `664adde04`) : pastille dans la liste,
barre radio grisée, message « Station hors ligne pour le moment » 4 s quand on lance la
lecture (la lecture est quand même tentée, `dfac0668c`). Guillemet ouvrant « conservé dans
les titres (`9dc2a26bd`). Chargement de `session-freshness-lib` avant `sports-freshness-lib`
dans le mât (`dfac0668c`). Déjà côté serveur : fraîcheur des nouvelles (`0e56639e4`).

### Contenu de `android-v1.2.2` (versionCode 7)

Filtres de l'onglet Sports identiques à le-radar.ca/sports/ (`46f80b571`, `1ff84d491`) :
sport (18), catégorie, secteur, période (Toutes par défaut, + « 7 jours »), recherche,
choix gardés sur l'appareil, 30 équipes par page. Mât compact hors accueil, fond plein,
barre radio alignée.

### Contenu de `android-v1.2.1` (versionCode 6)

Onglet Sports natif (`8301a549d`) : cartes résultats / à venir rendues dans l'app depuis
`sports-masthead.json`, au lieu de la page le-radar.ca/sports/ en cadre (en-tête et barre
radio du site en double). Bouton pour ouvrir la page complète dans le navigateur.

### Contenu de `android-v1.2.0` (versionCode 5)

Barre radio persistante en haut avec défilement des postes au repos, onglet Sports
(remplace Enregistrés, désormais dans Réglages), icône d'engrenage, notifications des
nouveaux articles, cartes article comme le site, bouton lecture 48 px.

### Changements web d'après `android-v1.1.1` — inclus dans 1.2.0

- `5fce3112c` — retrait du rechargement automatique du service worker (sans effet sur l'APK,
  qui n'utilise pas le service worker).
- `ca4c1bfce` — image de signature courriel (`assets/signature.png`), web seulement.
- `94ab25143` — cartes article comme le site + fond « verre » du mât (inclure dans la
  prochaine version Android).

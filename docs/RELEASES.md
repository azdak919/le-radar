# Suivi des versions — Web, PWA et Android

Ce fichier suit l'état des trois canaux de diffusion du Radar. À mettre à jour à chaque
déploiement notable, changement de cache du service worker ou étiquette Android.

_Dernière mise à jour : 28 octobre 2026._

## 1. Web (GitHub Pages, le-radar.ca)

| Élément | Valeur |
|---|---|
| Dernier commit `main` déployé | `ccce99a8f` — bot : retro-crawl historical metadata (auto), 28 oct. 2026, 9 h 32 (HAE) |
| Dernier changement de code déployé | `aa88c84e6` — Dependabot : `actions/configure-pages` 5 → 6 (#236), après `63292254a` `actions/checkout` 4 → 7 (#237) (28 oct., 8 h 27 HAE) ; dernier changement du site : `495d9e93f` (26 oct.) |
| Déploiement GitHub Pages | ✅ réussi (`pages-deploy.yml`, déploiement par artefact, sur `ccce99a8f`) |
| Date du déploiement | 28 octobre 2026, 9 h 34 (HAE) |
| le-radar.ca | ✅ HTTP 200 (vérifié le 28 oct. 2026, 9 h 37 HAE) |

Le site se déploie automatiquement à chaque poussée sur `main`, par artefact depuis le 26 oct.
(21 h 43 HAE, `41dc6e9bf`; retour arrière : `build_type=legacy`). Vérifier avec
`gh run list -w pages-deploy.yml -L 1`.

## 2. PWA (service workers)

| Service worker | Cache actuel en ligne |
|---|---|
| `sw.js` (site) | `radar-shell-v976` (+ `radar-offline-v22`) — introduit par `6ce6d91a0` |
| `sports/sw.js` (Sports) | `sports-shell-v335` — introduit par `6ce6d91a0` |

Le `sw.js` servi en ligne correspond à celui de `main` (pas de version périmée).

### Historique récent des correctifs PWA

- 2026-10-26 — `daf1b3834`, `6ce6d91a0` : un poste qui joue n'affiche plus « Hors ligne »
  (CHOQ), ni dans la barre ni dans la liste (v976 / v335).
- 2026-10-26 — `16b517d38` : carte citation du Pomo compacte sur téléphone (v973 / v333).
- 2026-10-26 — `c69af7581` : barre radio du Pomo et du Solitaire identique au Radar.
- 2026-10-26 — `3dacbb807` : fin de période du Pomo fiable en arrière-plan (notification).
- 2026-10-26 — `b301e5265`, `ec64eaf4d` : régates sur plusieurs jours (vraie plage de dates),
  voile compacte dans le bandeau.
- 2026-10-25 — `7ad018a8d`, `f530b23d8` : contours radio, Pomo/Solitaire retouchés.
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
| `android-v1.1.1` | 2026-10-21 | ✅ publiée (recette `bba9c08a` du 2026-10-22 ; APK sur f-droid.org le 2026-10-25, 9 h 08 HAE) |
| `android-v1.2.0` | 2026-10-23 | ⏳ étiquetée (versionCode 5) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.1` | 2026-10-23 | ⏳ étiquetée (versionCode 6) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.2` | 2026-10-23 | ⏳ étiquetée (versionCode 7) ; en attente de la détection F-Droid (`^android-v`) |
| `android-v1.2.3` | 2026-10-23 | ✅ publiée (recette `fa454f12` du 2026-10-24 ; vue sur f-droid.org le 2026-10-28, entre le 27 oct. 9 h 40 et le 28 oct. 9 h 37 HAE) |
| `android-v1.2.4` | 2026-10-25 | ⏳ recette mise à jour le 2026-10-26 (MR 54228 fusionnée, `4ee66bdb`, saveur `fdroid`) ; CurrentVersion 1.2.4 / 9 ; pas encore publiée |

Version publiée par F-Droid (API `packages/ca.leradar.app`, vérifiée le 2026-10-28) :
**1.2.3 (versionCode 8)** (suggérée ; 1.1.1 / 4 et 1.1.0 / 3 encore listées). Recette fdroiddata : CurrentVersion **1.2.4 (9)**. `main` est à **1.2.4 (versionCode 9)**.

F-Droid construit par lots ; compter quelques jours à une semaine après l'étiquette.
L'APK embarque son propre code (pas de `server.url`) ; seules les données viennent de
le-radar.ca en direct.

### Changements web pas encore dans l'APK (après `android-v1.2.4`)

Aucun changement dans `mobile/` ni `android/` depuis l'étiquette : les changements suivants
touchent le site seulement (Pomo, Solitaire, page Sports, radios du site).

- `daf1b3834`, `6ce6d91a0` — un poste qui joue n'affiche plus « Hors ligne » (CHOQ).
- `16b517d38` — carte citation du Pomo compacte sur téléphone.
- `c69af7581` — barre radio du Pomo et du Solitaire identique au Radar.
- `3dacbb807` — fin de période du Pomo fiable en arrière-plan.
- `ec64eaf4d`, `b301e5265` — régates de voile : plages de dates, bandeau compact, résultats 24 h.
- `7ad018a8d` — contours radio plus visibles, minuterie Pomo agrandie sur téléphone.

### Contenu de `android-v1.2.4` (versionCode 9)

Deux saveurs : `fdroid` (par défaut, aucune bibliothèque Google, 0 classe `com.google.android.gms`)
et `full` (Cast natif : `play-services-cast-framework` 22.1.0 + `androidx.mediarouter` 1.8.1,
CastContext créé au premier appui seulement, rappels protégés). Barre radio en verre dépoli
(carte flottante, coins arrondis, flou d'arrière-plan, repli opaque), collée sous le mât puis
sous la barre d'état. Logos officiels des stations (notification, écran verrouillé, AVRCP,
Android Auto). Rapport de plantage local (ContentProvider `initOrder` max → fichier ; page
« Rapport de plantage » avec Copier/Partager ; rien n'est envoyé). Bouton masqué = vraiment
masqué (`.player [hidden]`). Lecteur Media3, notification, Android Auto (préparés pour 1.2.4).
Bouton principal ■ Arrêt pendant la lecture (plus de ×) ; la pause native (notification, Auto)
coupe le flux. Ligne « en ondes » : émission en cours, sinon « À venir · … » (défilement si trop
long), poussée à la MediaSession. Petite icône `ic_stat_radar` (antenne du logo, monochrome).
Articles du fil en cartes arrondies ; plus de vue article interne : toucher une carte ouvre
l'original (Custom Tab via `@capacitor/browser`), bouton « Enregistrer » sur la carte. Zone
sûre sous la barre d'état partout (mât, barre radio collée, coiffe). Logo du mât +20 % (site
et app).
La recette F-Droid construit `gradle: [fdroid]` →
`build/outputs/apk/fdroid/release/app-fdroid-release-unsigned.apk`.

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

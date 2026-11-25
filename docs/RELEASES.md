# Suivi des versions — Web, PWA et Android

Ce fichier suit l'état des trois canaux de diffusion du Radar. À mettre à jour à chaque
déploiement notable, changement de cache du service worker ou étiquette Android.

_Dernière mise à jour : 23 novembre 2026._

## 1. Web (GitHub Pages, le-radar.ca)

| Élément | Valeur |
|---|---|
| Dernier commit `main` déployé | `7a0f4e153` — mise à jour des résultats RSEQ, 23 nov. 2026, 9 h 42 (HNE) |
| Dernier changement de code déployé | `554d5d026` — 12 px entre la météo et le logo, #542, 22 nov. 2026, 19 h 32 (HNE) |
| Déploiement GitHub Pages | ✅ réussi (`pages-deploy.yml`, déploiement par artefact, sur `7a0f4e153`) |
| Date du déploiement | 23 novembre 2026, 9 h 43 (HNE) |
| le-radar.ca | ✅ HTTP 200 (vérifié le 23 nov. 2026, 9 h 45 HNE) |

Le site se déploie automatiquement à chaque poussée sur `main`, par artefact depuis le 26 oct.
(21 h 43 HAE, `41dc6e9bf`; retour arrière : `build_type=legacy`). Vérifier avec
`gh run list -w pages-deploy.yml -L 1`.

## 2. PWA (service workers)

| Service worker | Cache actuel en ligne |
|---|---|
| `sw.js` (site) | `radar-shell-v1079` (+ `radar-offline-v23`) — introduit par `554d5d026` (22 nov., 19 h 32 HNE) |
| `sports/sw.js` (Sports) | `sports-shell-v452` — introduit par `554d5d026` |

Le `sw.js` et le `sports/sw.js` servis en ligne correspondent à ceux de `main` (pas de version périmée).
Le cache hors ligne `radar-offline-v23` a été introduit par `330568e9e` (21 nov., 20 h 01 HNE).

### Historique récent des correctifs PWA

- 2026-11-22 — `554d5d026`, `9a5ba7c64` : 12 px entre la météo et le logo (#542)
  (v1079 / v452).
- 2026-11-22 — `8166d64f7`, `b47338ec4` : « Résultat à venir » en jaune, lettres noires
  (#541).
- 2026-11-22 — `fefe1a091` : le texte « projet indépendant » remplit sa colonne.
- 2026-11-22 — `883f8f9e4`, `ba5b38945` : espaces du mât (réseaux et barre radio).
- 2026-11-22 — `77a11d021`, `2666bf482` : barre Suivre au-dessus du fil ; marge au pouce
  dans le rail des sources.
- 2026-11-22 — `a1119225f` : grilles d'horaires de stations lisibles.
- 2026-11-22 — `d78188305` : rail des sources dès 1280, 3 cartes sports, météo
  Montréal/Québec, pied mobile.
- 2026-11-22 — `825735a5a` : défilement du dial et des pastilles sources en boucle.
- 2026-11-22 — `432e801d8` : licence du code passée à AGPL-3.0-or-later.
- 2026-11-21 — `4cefc190e` : section Ressources (Le Kiosque et Le Socle).
- 2026-11-21 — `88625e752`, `6acbf07d9` : réseaux du mât en rangée sous la devise.
- 2026-11-21 — `330568e9e` : retrait de la page Mise à jour (`radar-offline-v23`).
- 2026-11-21 — `69229c39f` : illustration des « Cinq nouvelles de la semaine » conservée.
- 2026-11-20 — `92717c310` : début de session à Montréal et retrait des doublons du fil.
- 2026-11-19 — `d8166674d` : l'image du billet est gardée partout, une comprise.
- 2026-11-18 — `70c2d9f69` : retrait de la bande floue système sous la barre d'état (iPad).
- 2026-11-18 — `d96a8fa3f`, `ea2673bb8` : sigles sans article initial ; photos autres que
  la une (#464, #465).
- 2026-11-17 — `0e207587b`, `cc41158a3` : fil par pages (60 puis 30) et « Charger plus »
  au clic (#445, #460).
- 2026-11-17 — `664dbdf18`, `4d4f32f0c`, `98d665a4c` : revue du matin et du soir,
  publication activée, PDF (#438, #450, #458).
- 2026-11-14 — `ba76890c5`, `1206abf34` : le fil reste visible si la lib de
  fraîcheur est absente du cache (#423) (v1030 / v408).
- 2026-11-13 — `8b806d161`, `7ab59b7d3` : polices en réseau d'abord
  (auto-réparation), Inter et Source Serif 4 auto-hébergées ; une police du
  studio qui ne répond pas n'empêche plus l'aperçu (#421) (v1029 / v407).
- 2026-11-13 — `247270482`, `88f476c96` : sigles officiels, régates en
  français et émoji de voile ⛵ sur La une (#419) (sports-shell-v406).
- 2026-11-13 — `aacfbd42f` : bump du shell après le chrome d'impression
  (v1028 / v405).
- 2026-11-13 — `9f761c81d`, `58f3af6e4` : défilement des cartes sport,
  aller-retour sur le titre et boucle sur la ligne du bas (#404, #408)
  (v1027 / v404).
- 2026-11-11 — `ee4ebf066` : ne plus afficher le tableau Sports depuis un
  cache périmé (#400).
- 2026-11-11 — `60d47b2b7`, `2b776b8d8` : tableau fermé au chargement ; dans
  la PWA et l'APK, le lien Sports reste dans l'app (#395).
- 2026-11-08 — `4d0c95dd2`, `0fb0c7847` : bandeau sportif, autres cartes
  conservées et directs prioritaires (#366) (v1013 / v387).
- 2026-11-07 — `6d4984312` : historique sportif complet et liens vers les
  résultats officiels (#356).
- 2026-11-02 — `027d29b78` : coiffe de zone sûre à la teinte du synthé sur
  iPad (v987).
- 2026-11-01 — `67ca60b02`, `b0b161ffc` : espaces insécables dans les titres (après
  l'échappement), fiche article bornée à 1360 px (v986 / v347).
- 2026-11-01 — `50620a653`, `300ee47e0` : pied de page v2 unifié avec icônes des réseaux,
  fiches d'article grands écrans.
- 2026-11-01 — `94e27f3ef`, `40c96e03c` : fiches article statiques `/article/`, impression soignée.
- 2026-10-31 — `ae9f19a9c`, `decbaf856` : impression (page de journal figée, mots longs coupés).
- 2026-10-31 — `984052214`, `5499b97dd` : page des flux (campus réels, seulement les journaux actifs).
- 2026-10-30 — `24f4a0d8f` : barre radio, contours autour de chaque bouton.
- 2026-10-29 — `6cf44caba` : bump du shell pour la barre allégée.
- 2026-10-26 — `daf1b3834`, `6ce6d91a0` : un poste qui joue n'affiche plus « Hors ligne »
  (CHOQ), ni dans la barre ni dans la liste (v976 / v335).
- 2026-10-26 — `16b517d38`, `c69af7581`, `3dacbb807` : Pomo (citation compacte, barre radio,
  fin de période en arrière-plan).
- 2026-10-23 — `0e56639e4` : fraîcheur des nouvelles (session en cours ou ≤ 45 jours).
- **2026-10-23 — `5fce3112c`** : retrait du rechargement automatique sur `controllerchange`.
  L'app se rechargeait seule après chaque nouvelle version (et au retour après plus d'une
  heure), ce qui obligeait à rafraîchir une à trois fois avant d'être utilisable.
- 2026-10-21 — `94ab25143` : cartes article comme le site + fond « verre » du mât.

## 3. Android (Capacitor, F-Droid)

| Étiquette | Date de l'étiquette | Statut F-Droid |
|---|---|---|
| `android-v1.0.0` | 2026-09-21 | — (antérieure à F-Droid) |
| `android-v1.0.1` | 2026-10-05 | — (antérieure à F-Droid) |
| `android-v1.1.0` | 2026-10-07 | ✅ publiée (MR fdroiddata 49671 fusionnée le 2026-10-15) |
| `android-v1.1.1` | 2026-10-21 | ✅ publiée (recette `bba9c08a` du 2026-10-22 ; APK sur f-droid.org le 2026-10-25) |
| `android-v1.2.0` | 2026-10-23 | ⏭️ jamais construite par F-Droid (dépassée par 1.2.3) |
| `android-v1.2.1` | 2026-10-23 | ⏭️ jamais construite par F-Droid (dépassée par 1.2.3) |
| `android-v1.2.2` | 2026-10-23 | ⏭️ jamais construite par F-Droid (dépassée par 1.2.3) |
| `android-v1.2.3` | 2026-10-23 | ✅ publiée (recette `fa454f12` du 2026-10-24 ; vue sur f-droid.org le 2026-10-28) |
| `android-v1.2.4` | 2026-10-25 | ✅ publiée (recette MR 54228 du 2026-10-26, saveur `fdroid` ; vue sur f-droid.org le 2026-11-02, après le 29 oct.) |
| `android-v1.2.5` | 2026-11-01 (9 h 54 HNE, `82c39961e`) | ✅ publiée (recette `ef7a9107` du 2026-11-02, 1 h 33 HNE ; APK sur f-droid.org le 2026-11-04) |
| `android-v1.2.6` | 2026-11-22 (14 h 27 HNE, `d57831334`) | ⏳ recette `99fc6322` du 2026-11-23, 4 h 08 HNE (MR fdroiddata 58786) ; pas encore sur f-droid.org (vérifié le 2026-11-23). Recette aussi ajustée le 2026-11-23, 5 h 22 HNE (`c478f391`, licence AGPL-3.0-or-later). |

Version publiée par F-Droid (API `packages/ca.leradar.app`, vérifiée le 2026-11-23) :
**1.2.5 (versionCode 10)** (suggérée ; 1.2.4 / 9 et 1.2.3 / 8 encore listées). Recette fdroiddata : CurrentVersion **1.2.6 (11)**. `main` est à **1.2.6 (versionCode 11)**.

F-Droid construit par lots ; compter quelques jours à une semaine après l'étiquette.
L'APK embarque son propre code (pas de `server.url`) ; seules les données viennent de
le-radar.ca en direct.

### Changements pas encore dans l'APK (après `android-v1.2.6`)

Aucun nouveau changement dans `mobile/` ni `android/` depuis l'étiquette. Côté site seulement :

- `554d5d026`, `9a5ba7c64` — 12 px entre la météo et le logo (#542).
- `8166d64f7`, `b47338ec4` — « Résultat à venir » en jaune, lettres noires (#541).
- `539fb070f` — plafond du bandeau partagé entre résultats et matchs à venir.
- `fefe1a091` — le texte « projet indépendant » remplit sa colonne.
- `883f8f9e4`, `ba5b38945` — espaces du mât (réseaux et barre radio).
- `a9ebaf770` — refaire le max/min météo quand une puce s'élargit.
- `c309ce7b5` — la source choisie se place à droite de Le Radar.
- `47eca8ad6` — aligner « Installer LE-RADAR.ca » à gauche.
- `61c75dce6` — infobulle redondante des sources retirée.
- `77a11d021` — barre Suivre au-dessus du fil ; En bref non étiré.
- `2666bf482` — marge au pouce des barres superposées dans le rail.
- `a1119225f` — grilles d'horaires de stations lisibles.
- Kit média, studio `/affiches/` et publications sociales (Bluesky, Tumblr, Buffer, Mastodon) : hors application.

### Contenu de `android-v1.2.6` (versionCode 11)

Reprend les changements du site et de `mobile/` faits depuis 1.2.5 jusqu'à `d57831334`
(PR #529). Notamment : dans l'APK, le trophée, la section et les puces ouvrent l'onglet
`#/sports` plutôt que le site (`60d47b2b7`, #395) ; déballage complet du CDATA dans les
extraits (`934e31d19`, #372) ; revue du matin et du soir (`4d4f32f0c`, `664dbdf18`) ;
section Ressources pour Le Kiosque et Le Socle (`4cefc190e`) ; réseaux du mât en rangée
sous la devise (`88625e752`) ; retrait de la page Mise à jour (`330568e9e`) ; rail des
sources dès 1280, 3 cartes sports, météo Montréal/Québec et pied mobile (`d78188305`) ;
dial et pastilles sources en boucle (`825735a5a`) ; source Le Club-École (`210a333c9`) ;
fil par pages et « Charger plus » au clic ; image du billet gardée ; licence
AGPL-3.0-or-later (`432e801d8`) ; ainsi que les correctifs web déjà notés après 1.2.5
(fil visible sans la lib de fraîcheur, polices auto-hébergées, sigles officiels, bandeau
sportif, etc.). Caches embarqués : `radar-shell-v1070`, `sports-shell-v443`,
`radar-offline-v23`.

### Contenu de `android-v1.2.5` (versionCode 10)

Reprend les changements du site faits depuis 1.2.4 jusqu'à `82c39961e` : poste qui joue sans
« Hors ligne » (CHOQ), barre radio et Pomo retouchés, régates de voile, impression
(`40c96e03c`).

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

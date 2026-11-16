# Suivi des versions — Web, PWA et Android

Ce fichier suit l'état des trois canaux de diffusion du Radar. À mettre à jour à chaque
déploiement notable, changement de cache du service worker ou étiquette Android.

_Dernière mise à jour : 16 novembre 2026._

## 1. Web (GitHub Pages, le-radar.ca)

| Élément | Valeur |
|---|---|
| Dernier commit `main` déployé | `d30006994` — mise à jour automatique du fil, des extraits, des images, des crédits photo, du RSS et des réseaux, 16 nov. 2026, 8 h 42 (HNE) |
| Dernier changement de code déployé | `ba76890c5` — ne plus vider le fil quand la lib de fraîcheur manque, #423, 14 nov. 2026, 1 h 16 (HNE) |
| Déploiement GitHub Pages | ✅ réussi (`pages-deploy.yml`, déploiement par artefact, sur `d30006994`) |
| Date du déploiement | 16 novembre 2026, 8 h 45 (HNE) |
| le-radar.ca | ✅ HTTP 200 (vérifié le 16 nov. 2026, 9 h 27 HNE) |

Le site se déploie automatiquement à chaque poussée sur `main`, par artefact depuis le 26 oct.
(21 h 43 HAE, `41dc6e9bf`; retour arrière : `build_type=legacy`). Vérifier avec
`gh run list -w pages-deploy.yml -L 1`.

## 2. PWA (service workers)

| Service worker | Cache actuel en ligne |
|---|---|
| `sw.js` (site) | `radar-shell-v1030` (+ `radar-offline-v22`) — introduit par `ba76890c5` (14 nov., 1 h 16 HNE) |
| `sports/sw.js` (Sports) | `sports-shell-v408` — introduit par `ba76890c5` |

Le `sw.js` et le `sports/sw.js` servis en ligne correspondent à ceux de `main` (pas de version périmée).

### Historique récent des correctifs PWA

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

Version publiée par F-Droid (API `packages/ca.leradar.app`, vérifiée le 2026-11-16) :
**1.2.5 (versionCode 10)** (suggérée ; 1.2.4 / 9 et 1.2.3 / 8 encore listées). Recette fdroiddata : CurrentVersion **1.2.5 (10)**. `main` est à **1.2.5 (versionCode 10)**.

F-Droid construit par lots ; compter quelques jours à une semaine après l'étiquette.
L'APK embarque son propre code (pas de `server.url`) ; seules les données viennent de
le-radar.ca en direct.

### Changements pas encore dans l'APK (après `android-v1.2.5`)

Déjà dans `mobile/` depuis l'étiquette (entreront dans la prochaine version Android) :

- `60d47b2b7` — dans l'APK, le trophée, la section et les puces ouvrent l'onglet `#/sports` plutôt que le site (#395).
- `934e31d19` — déballage complet du CDATA dans les extraits, filet partout (#372).

Côté site seulement :

- `ba76890c5` — le fil reste visible si la lib de fraîcheur est absente (#423).
- `8b806d161` — polices en réseau d'abord, Inter et Source Serif 4 auto-hébergées (#421).
- `247270482` — sigles officiels, régates en français et émoji de voile ⛵ (#419).
- `58f3af6e4`, `9f761c81d` — défilement des cartes sport (#408, #404).
- `ee4ebf066` — ne plus afficher le tableau Sports depuis un cache périmé (#400).
- `2b776b8d8`, `7bd822e1e` — tableau fermé au chargement ; un filtre n'ouvre que les sections peuplées (#395).
- `fa277eeb4` — portraits de The Link conservés, barre des sources dégagée (#397).
- `13ee37671` — point focal conservé quand l'image d'une fiche est un miroir local (#368).
- `c0e7f0deb` — couvertures portrait déclarées par la source, recadrables, point focal haut (#367).
- `0fb0c7847`, `4d0c95dd2` — bandeau sportif : autres cartes conservées, directs
  prioritaires sans être exclusifs (#366).
- `bb356b771` — un seul prochain match visible par défaut, les autres derrière
  « Voir les autres matchs à venir » (#360).
- `6d4984312` — historique sportif des trois sessions récentes et liens
  « Consulter les résultats sur le site officiel » (#356).
- `0d498e35f` — identités officielles, filtre Aujourd'hui et fuseau fiable (#354).
- `ec409ad48`, `dfa7fbb9f`, `9819eb37b` — palettes institutionnelles, grilles
  radio officielles et lecteur sans clipping (#353, #350, #349).
- `6b6208a68` — santé TLS/audio des radios, récupération à partir des flux officiels (#361).
- `7dc532d1e` — Mastodon au pied de page (#342).
- `027d29b78` — coiffe de zone sûre à la teinte du synthé sur iPad.
- `870470192` — bannières de rubrique écartées des images d'article (#311).
- `67ca60b02`, `b0b161ffc` — espaces insécables dans les titres, fiche bornée à 1360 px.
- `50620a653`, `300ee47e0` — pied de page v2 et icônes des réseaux.
- `94e27f3ef` — fiches article statiques `/article/`.
- `ba6dd537d` — l'extrait ne reprend plus le titre d'une carte voisine (#279).
- Kit média, studio `/affiches/` et publications sociales (Bluesky, Tumblr, Buffer, Mastodon) : hors application.

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

# Journal des modifications

Ce projet suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et respecte le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- La ligne d’antenne défile désormais sur une **liste de phases** — émission en cours → à venir → piste → slogan — au lieu d’alterner entre deux seules lignes. « À venir » était jusqu’ici inaccessible dès qu’une émission était en ondes ; le slogan revenait une fois sur deux.
- Libellé « À l’antenne · » sur la ligne compacte du poste syntonisé, là où le panneau latéral est masqué.
- Au repos, la ligne d’aperçu suit un ordre explicite — **poste + bande de diffusion (FM, AM ou Web) → à l’antenne / à venir → émission → horaire → établissement en acronyme**.
- L’émission en ondes reste affichée deux fois plus longtemps que la piste, le « à venir » ou le slogan.
- Règle générale : **un texte qui défile n’est jamais remplacé avant la fin de son aller-retour**. Elle ne s’appliquait qu’au dial sous 1100 px ; elle vaut maintenant à toute largeur et sur le panneau « À l’antenne », qui tournait à 8 s fixes.
- Rapport de couverture des grilles (`fetch-radio-schedules.js`) et planchers par station dans `data-integrity`.
- Garde-fou anti-effondrement : une grille qui perd plus de 40 % de ses créneaux est refusée au profit de la précédente (`--force` pour outrepasser).
- Page `/horaires/` (et `/en/schedules/`) réunissant les grilles horaires de toutes les stations, liée depuis le pied de page et depuis le fil d’Ariane des fiches radio.
- Les fiches radio affichent désormais la grille hebdomadaire **complète** avec les plages `début – fin` ; « À l’antenne » y renvoie directement via l’ancre `#horaire`.

- Détection des **émissions spéciales / hors programmation** : l’adaptateur `chyz-horaire` lit le marqueur « en direct » de `chyz.ca/horaire` aux 30 min et le publie en `api-live`, avec la grille du jour telle qu’elle est à l’instant. Un bloc absent de la grille colligée est marqué `"special": true` dans `radio-nowplaying.json`.

### Corrigé

- Le site annonçait « À venir · Capitales de Québec · 18:50 » alors que CHYZ diffusait ce match depuis 16:50 : la station réécrit sa page le jour du match (heure décalée, émission régulière évincée) tandis que la grille colligée, elle, a jusqu’à deux semaines. Une émission en ondes qui fait autorité écarte désormais tout « à venir » qu’elle recouvre — rien ne peut commencer avant la fin de ce qui joue —, côté bot comme côté site entre deux passes.
- Ligne du bas du syntoniseur sur mobile : l’alternance slogan ↔ antenne et la bascule des phases CHOQ tournaient sur deux horloges concurrentes (14–18 s contre 8 s fixes), ce qui faisait changer le texte en cours de lecture. Une seule horloge pilote maintenant les deux.
- Le titre de l’émission n’est plus répété entre les deux phases CHOQ ni entre le titre et le sous-titre d’une même ligne.
- Les entités HTML servies par les APIs des stations sont décodées (« Utopia&#039;s Paradise » → « Utopia's Paradise »).
- Les métadonnées techniques de l’automate (« Offline », « Off Air », « Airtime! »…) ne sont plus diffusées comme une piste en cours — visible sur CKUT (McGill).
- « À venir » s’affichait sans heure : la sonde navigateur ignorait le champ `datetime` (horodatage Unix) de l’API de CISM et écrasait l’heure calculée par le bot.
- Au repos, le panneau « À l’antenne » et le dial changeaient à 0,4 s d’intervalle et nommaient donc deux stations différentes ; ils basculent maintenant ensemble. Le panneau ne fait plus un fondu toutes les 8 s sur un contenu identique.
- Défilement horizontal moins flou : décalage arrondi au pixel entier et suppression des promotions de couche GPU redondantes (`translateZ(0)`, `backface-visibility`) qui figeaient la rastérisation du texte.
- Grille horaire ordonnée lundi → dimanche : la semaine occupe la première rangée, le week-end la seconde.
- La CI publie enfin le dossier `horaires/` (absent des six workflows).
- Quality Gate : 7 tests dépassaient les 30 s sur `page.goto('/', { waitUntil: 'load' })`. Mesuré — `domcontentloaded` à 412 ms, `load` à 1 404 ms, avec **35 requêtes externes** bloquantes (Google Fonts, umami, la photo Wikimedia du mât). Les tests qui n'ont besoin d'aucune de ces ressources attendent désormais `domcontentloaded` ; le serveur de test passe en `ThreadingHTTPServer`.
- Les consignes internes des stations (« Desi Beats (must be .mp3!!) ») étaient filtrées dans la grille hebdomadaire mais pas dans le flux en direct, d'où leur retour dans « À venir ».

## [1.0.0] — 2026-07-23

### Ajouté

- Agrégation des journaux et radios étudiantes des cégeps et universités du Québec, avec consultation des articles et accès aux publications originales.
- Syntoniseur radio avec lecture des flux, commandes de volume, Media Session, données « à l’antenne » et synchronisation de la lecture entre les contrôles du site.
- Flux RSS du Radar et registre éditable des sources.
- Application web progressive installable, service worker et fonctionnement hors ligne du shell de l’application.
- Bandeau météo régional, thèmes clair et sombre, ainsi qu’une interface traduite en français et en anglais.
- Workflows GitHub Actions pour l’agrégation, la vérification et l’entretien automatisés des contenus, des sources, des flux et des horaires.
- Suite de validation comprenant des tests Playwright, des contrôles de données et d’intégrité des ressources.
- Worker Cloudflare facultatif pour le classement partagé de Solitaire.
- Mini-applications Pomodoro et Solitaire, chacune disponible comme PWA isolée.

[1.0.0]: https://github.com/azdak919/le-radar/releases/tag/v1.0.0

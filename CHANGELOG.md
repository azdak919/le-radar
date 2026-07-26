# Journal des modifications

Ce projet suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et respecte le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- La ligne d’antenne défile désormais sur une **liste de phases** — émission en cours → à venir → piste → slogan — au lieu d’alterner entre deux seules lignes. « À venir » était jusqu’ici inaccessible dès qu’une émission était en ondes ; le slogan revenait une fois sur deux.
- Libellé « À l’antenne · » sur la ligne compacte du poste syntonisé, là où le panneau latéral est masqué.
- Rapport de couverture des grilles (`fetch-radio-schedules.js`) et planchers par station dans `data-integrity`.
- Garde-fou anti-effondrement : une grille qui perd plus de 40 % de ses créneaux est refusée au profit de la précédente (`--force` pour outrepasser).

- Page `/horaires/` (et `/en/schedules/`) réunissant les grilles horaires de toutes les stations, liée depuis le pied de page et depuis le fil d’Ariane des fiches radio.
- Les fiches radio affichent désormais la grille hebdomadaire **complète** avec les plages `début – fin` ; « À l’antenne » y renvoie directement via l’ancre `#horaire`.

### Corrigé

- Ligne du bas du syntoniseur sur mobile : l’alternance slogan ↔ antenne et la bascule des phases CHOQ tournaient sur deux horloges concurrentes (14–18 s contre 8 s fixes), ce qui faisait changer le texte en cours de lecture. Une seule horloge pilote maintenant les deux.
- Le titre de l’émission n’est plus répété entre les deux phases CHOQ ni entre le titre et le sous-titre d’une même ligne.
- Les entités HTML servies par les APIs des stations sont décodées (« Utopia&#039;s Paradise » → « Utopia's Paradise »).
- Les métadonnées techniques de l’automate (« Offline », « Off Air », « Airtime! »…) ne sont plus diffusées comme une piste en cours — visible sur CKUT (McGill).
- « À venir » s’affichait sans heure : la sonde navigateur ignorait le champ `datetime` (horodatage Unix) de l’API de CISM et écrasait l’heure calculée par le bot.
- Au repos, le panneau « À l’antenne » et le dial changeaient à 0,4 s d’intervalle et nommaient donc deux stations différentes ; ils basculent maintenant ensemble. Le panneau ne fait plus un fondu toutes les 8 s sur un contenu identique.
- Défilement horizontal moins flou : décalage arrondi au pixel entier et suppression des promotions de couche GPU redondantes (`translateZ(0)`, `backface-visibility`) qui figeaient la rastérisation du texte.
- Grille horaire ordonnée lundi → dimanche : la semaine occupe la première rangée, le week-end la seconde.
- La CI publie enfin le dossier `horaires/` (absent des six workflows).

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

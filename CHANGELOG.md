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
- Détection des **émissions spéciales / hors programmation**, générique à toutes les stations. L’adaptateur `schedule-live` relit la page horaire de tout poste sans API live (CHYZ, CJLO, CFAK — et tout poste à venir, sans code dédié) à chaque passe du bot, aux 30 min. Quand la station désigne elle-même le bloc à l’antenne — CHYZ marque « en direct » — sa réponse passe en `api-live` ; sinon la résolution horaire sur la grille du jour sort en `schedule-live`, un rang au-dessus de l’instantané colligé. Un bloc absent de la grille publiée est marqué `"special": true` dans `radio-nowplaying.json`.
- Bot `detect-schedule-drift.js` (quotidien) : compare la grille publiée à la page relue à l’instant et écrit `radio-schedule-drift.json`. Il distingue le **hors-programmation** d’un soir de la **grille refaite** à la rentrée, en exigeant deux signaux (≥ 40 % de la grille **et** ≥ 8 créneaux) — une proportion seule ment sur les petites grilles, où un unique match pèse déjà plus de 40 %. Les écarts remontent dans `bot-status.json`.

- Une PWA installée rafraîchit son contenu **au retour**. Elle n'est jamais « rechargée » au sens d'un onglet : on la quitte, on y revient, et le même document reprend — des jours plus tard sur iOS —, si bien que le fil affiché restait celui de la dernière ouverture alors que le bot publie sept fois par jour. Sous 5 minutes d'absence : rien, basculer d'app deux secondes ne doit rien coûter. Au-delà : le fil est rechargé **sur place**, sans clignotement ni perte de position, et le service worker revérifié. Au-delà d'une heure : rechargement franc, tout le document étant périmé (météo, sports, fond du mât, horaires) — sauf si la radio joue, auquel cas seul le fil se met à jour.
- Scores **en direct** sur la carte CTA : un match dans la fenêtre (coup d’envoi −15 min / +3 h) reste « En cours », affiche le score dès que RSEQ le colle, et n’est plus recouvert par un résultat d’hier. Tant qu’un ou plusieurs matchs sont en cours, le cycle de la CTA ne montre **que** ces directs (un → carte figée ; plusieurs → rotation entre eux). Le cycle normal (aujourd’hui/hier, prochains) reprend dès qu’il n’y a plus de live. Le bot relit `GetGameDiffusion` et un cron `--live` toutes les 15 min pendant les plages de match ; le mât ressonde `sports.json` tant qu’un direct est à l’écran.

### Corrigé

- Sous-ligne « En cours » : plus d’âge relatif du coup d’envoi (« il y a 2 min », « dans 15 min », « à l’instant ») — ça se lisait comme un match déjà joué. Période si l’API la donne, sinon la compétition. Prochain du jour : heure (19 h 00), compte à rebours seulement dans l’heure qui précède. Résultat : compétition (la pastille dit déjà Aujourd’hui / Hier).
- Verbe « reçoit / à » de la CTA : plus pâle que les noms (poids 500, blanc ~50 %) — 650/800 tombaient tous deux sur Inter 700, d’où un « reçoit » aussi blanc que Saint-Hyacinthe.
- Un 0-0 encore dans la fenêtre n’est plus classé résultat fini. Le jour civil des prochains matchs est celui de Québec, pas UTC (un crawl à 20 h EDT ne fait plus disparaître le match du jour).
- Panneau latéral du navigateur (Firefox, Chrome, Edge, Arc, Vivaldi…) : le shell large restait actif alors que la rangée du mât n’avait plus la place. Les cartes météo passaient sous les icônes ; les puces sports pouvaient sortir du bandeau. Valable à **toutes** les largeurs (téléphone docké → 1280 → 1920 → QHD/UW) : on mesure le reliquat réel, on rétrécit les slots, et on ne remonte le nombre de cartes que si la fenêtre s’élargit.
- Edge (et tout Chromium) sur un bureau tactile — ex. IdeaPad Flex 5 + Philips 1920 : `pointer: coarse` classait la session comme un téléphone. La carte proposait « Sur l’écran d’accueil » au lieu d’installer la PWA fenêtre. Un viewport ≥ 1024 px hors iOS/Android est du bureau ; le titre spatial mobile (focus-group B) reste pour les vrais téléphones.
- Grand écran (shell E, ≥ 1281 px) : le carré du synthétiseur restait un rectangle vide — le texte (institution, poste, slogan) était bien écrit, mais le CSS le masquait tant que `is-dial-ready` n’était pas posé. La voie wide retournait avant cet appel. Visible sur l’accueil, le kit média et les autres pages.
- La carte de partage (`og-cover.png`) était calée à gauche et la sous-ligne trop pâle : lockup centré, slogan au rythme de l’ancienne carte (« Les journaux, radios et sports étudiants du Québec ») et retour de « Cégeps et universités » sur une ligne lisible. Cache `?v=3`.
- L’image de partage (`og-cover.png`) disait encore « journaux et radios » sans les sports : l’aperçu de lien (Messages, Telegram, etc.) restait sur l’ancienne accroche alors que le site porte la triade. Mot-symbole aligné sur le mât (Source Serif 4 Display, « LE-RADAR.ca » d’une seule couleur). Sous-ligne : « résultats sportifs ». Cache `?v=2` pour forcer le rechargement chez les robots.
- iPad portrait (768–834 px) : le magazine deux colonnes s’affichait sans équilibrer **En bref**. La graine bureau (~10 brèves) dépassait les vedettes et laissait un vide sous la colonne de gauche. L’équilibre (trim + extraits mid) suit maintenant le même seuil 768 px que le CSS.

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

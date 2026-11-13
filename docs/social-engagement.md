# Réseaux sociaux : engagement, volume et formats

Tout vit dans le dépôt (aucune routine externe). La source de vérité est `data/social/policy.json`.

## Politique (`data/social/policy.json`)

- **Volume réduit** : 3 à 5 publications par jour et par réseau (LinkedIn 3), jusqu’au `volume.until` (2026-11-23, inclus). Passé cette date, les limites de base reprennent d’elles-mêmes. Pour prolonger ou modifier : changer `until` ou `perDay`.
- **Qualité** : une seule publication par source et par jour, les articles avec image d’abord ; sans image (hors Tumblr, où elle reste obligatoire) seulement après 17 h et sous le minimum de 3.
- **Mentions** : le média source est nommé dans le format natif de chaque réseau. Seuls les comptes vérifiés (`data/social/*-accounts.json`) sont mentionnés ; sur X, au plus un média par jour.
- **Hashtags** : institution, sport précis et ville d’abord (ex. #ULaval, #Hockey, #Saguenay), jamais #PresseÉtudiante ni #Actualités. Plafonds : Mastodon 2 à 4, Bluesky 1 à 2, X 1 à 2, Facebook 0 à 1, LinkedIn 2 à 3 (`hashtags.maxByNetwork`). Un hashtag de lieu ou de sujet déjà écrit dans le texte n’est pas répété. Accents conservés (CamelCase).
- **Abonnements automatiques** : `automation.x_follow` et `facebook_follow` à faux (aucun mécanisme n’existe). L’abonnement Bluesky ne grossit plus (`max_total`).

## Formats natifs

- `scripts/social/formats-run.mjs` construit « Résultats de la fin de semaine » (U SPORTS ; le collégial RSEQ reste en aperçu) et « À écouter ce soir » (`radio-schedules.json`). Les résultats n’ont aucune mention @ : hashtags dynamiques selon les ligues, sports (#FootballU, #HockeyU, etc.) et équipes présentes, plus #SportÉtudiant et #Québec (au plus 8 ; on retire d’abord les hashtags d’équipes si le texte dépasse la limite X).
- Workflow `social-formats.yml` : essai à blanc par défaut (aperçu en artefact et résumé du job). Publication réelle seulement si `formats.<format>.publish` est vrai, dans la fenêtre prévue, données fraîches et cohérentes, au plus une fois par fin de semaine et par réseau (`data/social/formats-state.json`). Au moindre doute, rien n’est publié.
- `listen_tonight.publish` est faux : aucun envoi.

## Bilan hebdomadaire

`social-weekly-report.yml` (lundi) écrit `data/social/weekly/AAAA-MM-JJ.md` et le résumé du job : abonnés, interactions externes par réseau (comptes internes de `internal-accounts.json` exclus). Lecture seule : ni courriel ni publication.

## La une du matin et du soir

Deux rendez-vous par jour, en plus des publications existantes : « La une du matin » vers 7 h 45 et « La une du soir » vers 19 h 30, heure de Montréal, sur Bluesky, Mastodon, Tumblr, X, Facebook et LinkedIn (`.github/workflows/social-une.yml`, `scripts/social/une-run.mjs`).

- Contenu : la une réelle du jour (même sélection que l’accueil et l’affiche « Aujourd’hui », sport professionnel exclu), titres, tous les auteurs (sinon le média), émoji du sport étudiant s’il y a lieu, liens le-radar.ca et hashtags, sans mention @. Le soir ne reprend aucun article du matin et saute la publication s’il n’y a rien de nouveau.
- Français seulement (visuels et textes de tous les réseaux) : titres et résumés anglais traduits par le module du site, `translate.js` (`RadarTranslate.translateText`, chargé dans le navigateur sans tête). Noms d’auteurs et de médias inchangés ; établissements nommés en français (Université Concordia, Université McGill, Université Bishop’s). Si la traduction échoue, renvoie l’original ou reste en anglais, l’article est exclu ; « week-end » devient « fin de semaine ».
- Image : `affiches/social-une.html` rendu sans tête. Gabarit « Verre » avec photo de la une dégagée en haut (retour de Charles du 12 nov. 2026 : mélange des pistes A et B), une en carte de verre dépoli, « Aussi à la une » avec vignettes, auteurs « Par … · média » sous chaque titre, puis un bloc « Sport étudiant » en deux colonnes : à gauche « Résultats » (vrais résultats récents ≤ 2 jours de `sports-masthead.json`, scores identiques à l'API officielle RSEQ, une rencontre par gameId, gagnant d'abord et en gras, « Final · jeu. 12 nov. »), à droite « Prochains matchs » (date et heure absolues, « reçoit » / « visite » en pâle comme sur le site ; matin : du jour au +3 j ; soir : à partir du lendemain). Règles des affiches : « 🏀 Basketball (H) », « Stingers (Concordia) », jamais « aujourd'hui » ni « hier ». Une colonne vide laisse l'autre prendre toute la largeur ; sans aucune rencontre, pas de bloc. Jusqu'à 6 rencontres en 4:5 et story, 4 en paysage, où les deux listes sont empilées (résultats d'abord, la largeur ne permet pas deux colonnes de noms complets). Les noms ne sont jamais tronqués : la police rétrécit, puis la ligne passe sur deux lignes. Nom d'établissement (surtitre des articles et parenthèses du sport) dans la couleur de l'établissement (`brand-colors.json`, comme les pastilles du site), éclaircie ou foncée jusqu'à 4,5:1 sur les cartes du thème ; couleur inconnue : accent du thème. Ligne d'auteur comme sur le site (`.article-byline`) : « Par » et le média en `--muted` (500), l'auteur en `--ink` (600). À droite de « Aussi à la une » (sous la liste en paysage) : « À l'écoute · radio étudiante », jusqu'à 4 émissions à venir (3 en paysage) de `radio-schedules.json` (matin : du jour après 7 h 45 ; soir : du lendemain ; 7 h à 23 h, sans reprise), tirage reproductible par date, une par station, ex. « 📻 Punk-o-rama · CHYZ 94,3 · ven. 13 nov. · 11 h » ; sans grille, pas de bloc. Ce qui a été retiré pour tenir revient si la place le permet. Cas limites (sans résultats, sans prochains matchs, sans radio, sans photo, noms très longs, couleur inconnue, un seul article) testés dans les 3 formats et les 2 thèmes (`tests/social-une-render.spec.mjs`). Matin en thème clair (couleurs de `style.css`) ; soir « Marine » (choix de Charles le 12 nov. 2026, variante 3 « pied A ») : cadre et cartes bleu marine #15213b, texte clair, pastille ambre ; verre opaque à 92 % pour rester AA même sur une photo claire (contraste minimal du soir 6,4:1). La photo de la une est toujours dans sa carte, en haut, comme les vignettes des autres articles. Polices officielles du site (Source Serif 4, Inter), marque « LE‑RADAR.ca ». Pied conforme aux affiches, centré : icône + « LE‑RADAR.ca » (serif), nom complet en serif juste au-dessus de la ligne d'indépendance « Projet indépendant, non officiel et sans affiliation aux médias ni aux établissements. ». Typographie française (apostrophes courbes, espaces fines avant ; ! ?), aucun logo d'université, aucun code QR.
- Formats (revue du 12 nov. 2026) :

  | Réseau | Format | Raison | Source |
  |---|---|---|---|
  | X | 4:5 1080×1350 | image seule affichée sans recadrage dans l'appli mobile, deux fois plus haute qu'un 16:9 | annonce de l'affichage non recadré (mai 2021) |
  | Bluesky | 4:5 1080×1350 (≤ 976 Ko, aspectRatio envoyé) | le fil ne recadre qu'au-delà de 1:2 | bluesky-social/social-app, `AutoSizedImage.tsx` |
  | Mastodon (piaille.fr 4.7) | 4:5 1080×1350 | image seule au ratio natif, hauteur plafonnée sans recadrage | mastodon/mastodon PR 26132 ; `--max-media-height-*` |
  | LinkedIn (Buffer) | 4:5 1080×1350 | portrait plein écran sur mobile | guides de formats 2026 |
  | Facebook (Buffer) | 4:5 1080×1350 | format portrait du fil mobile | guides de formats 2026 |
  | Tumblr | 4:5 1080×1350 | ratio natif dans le tableau de bord | API NPF |
  | Instagram (préparé, désactivé) | publication 4:5 1080×1350, story 9:16 1080×1920 | l'API refuse le 3:4 (plage 4:5 à 1,91:1, JPEG ≤ 8 Mo) ; story avec bandeau et pied sous l'interface | Meta, IG User Media et Content Publishing |

  Le paysage 16:9 1200×675 reste rendu en aperçu (repli), sans réseau attitré. Instagram : légende sans lien cliquable (« lien en bio »), jusqu'à 5 hashtags ; `formats.une.prepared.instagram.enabled = false` dans `data/social/policy.json`, rien n'est envoyé tant que le compte et l'accès ne sont pas configurés.
- Fenêtres d’envoi : matin 7 h 30 à 10 h 30, soir 19 h 15 à 22 h 30 (`data/social/policy.json`, `formats.une`). Crons pour l’heure d’été et l’heure d’hiver, plus un passage après chaque « Social — Mastodon ». `data/social/une-state.json` garantit une seule publication par réseau et par créneau ; un réseau en échec est réessayé seul (3 essais au plus).
- Essai sans envoi : déclenchement manuel avec `dry_run` coché (défaut), ou le workflow d’aperçu des PR (`social-une-preview.yml`).

### Images envoyées à Buffer (échecs des 9, 10 et 12 nov. 2026)

Buffer ne télécharge l'image qu'à l'heure prévue, parfois 36 h après l'ajout. Chaque URL est donc vérifiée par réseau juste avant l'ajout (`mediaForNetwork`, `scripts/social/image-resolve.mjs`) : 200, `image/*`, HTTPS, poids et pixels admis (X 5 Mo ; Facebook 4 Mo et JPEG sans ICC/XMP ; LinkedIn 5 Mo ; ≤ 20 Mpx), sinon vignette Wikimedia, puis relais réencodé, sinon l'article est sauté sur ce réseau (jamais d'URL morte). L'URL envoyée est mémorisée (`image` dans `data/buffer-sent.json` et `data/buffer-pages-sent.json`) et `mirror-release.js` garde ces images 10 jours, même si l'article a changé de photo ou est sorti du fil.

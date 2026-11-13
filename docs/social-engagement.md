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
- Image : `affiches/social-une.html` rendu sans tête. Gabarit « Verre » avec photo de la une dégagée en haut (retour de Charles du 12 nov. 2026 : mélange des pistes A et B), une en carte de verre dépoli, « Aussi à la une » avec vignettes, auteurs « Par … · média » sous chaque titre, puis un bloc « Sport étudiant · résultats » : vrais résultats récents (≤ 2 jours, `sports-masthead.json`, une rencontre par ligue d'abord, émoji du sport). Sans résultat récent : rencontres du jour, sinon aucun bloc (la photo s'agrandit, aucun vide). Matin en thème clair (couleurs de `style.css`) ; soir « Crépuscule » (focus-group du 12 nov. 2026 : le noir était pénible) : cadre violet nuit #2b1b35, cartes de verre claires à texte foncé, pastille ambre, contraste AA même sur la photo. Polices officielles du site (Source Serif 4, Inter), marque « LE‑RADAR.ca ». Pied conforme aux affiches, centré : icône + « LE‑RADAR.ca » (serif), nom complet en serif juste au-dessus de la ligne d'indépendance « Projet indépendant, non officiel et sans affiliation aux médias ni aux établissements. ». Typographie française (apostrophes courbes, espaces fines avant ; ! ?), aucun logo d'université, aucun code QR.
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

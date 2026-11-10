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

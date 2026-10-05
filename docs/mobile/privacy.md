# Confidentialité de l’application

L’application ne crée pas de compte, n’affiche pas de publicité, ne charge pas Umami, et ne demande pas l’identifiant publicitaire.

## Sur l’appareil

| Donnée | Où | Effacement |
|---|---|---|
| Médias suivis | `localStorage`, clé `radar-media-follows-v1` | Réglages → effacer toutes les données |
| Sources masquées, régions, mots-clés, thème, choix de notification | `radar-mobile-prefs-v1` | idem |
| Favoris et historique (titre, source, extrait, lien, image, date) | `radar-mobile-library-v1` | Effacer les favoris, l’historique, ou tout |
| Dernier fil (mêmes champs, pas le corps) | `radar-mobile-snapshot-v1` | effacement total |

L’historique est plafonné à 80 fiches, les favoris à 200. Aucun champ `content` ou `body` n’est conservé.

Les cases de notification ne déclenchent aucun envoi et aucune permission. Voir [architecture.md](architecture.md).

## Ce qui quitte l’appareil

- Le chargement du fil, des sources, des radios et des couleurs contacte `https://le-radar.ca/`. L’hébergeur (GitHub Pages) peut journaliser l’adresse IP comme pour une visite du site. L’application n’ajoute pas d’identifiant.
- « Lire chez {publication} » ouvre le site du média dans le navigateur du système. Ce site voit une visite normale.
- Les images vedette sont demandées à leur URL HTTPS d’origine. Elles ne sont pas réenregistrées par LE-RADAR.
- Le partage remet l’URL à l’application choisie par la personne.

## Déclaration magasin

Réponse prévue au questionnaire Apple et à la section Data safety de Play : **données non collectées** par le développeur de l’application, pas de suivi, pas de publicité.

Ce n’est pas une décision d’Apple ou de Google. La personne qui soumet la fiche doit reprendre ce texte et le corriger si le comportement change. Si un service de notification est ajouté plus tard, la déclaration devra être refaite avant l’envoi.

Texte court pour les fiches : `store/apple/privacy.md` et `store/google/privacy.md`.

# Composants tiers

Le code du projet est sous GNU AGPLv3 (`AGPL-3.0-or-later`). Ce fichier crédite les pièces copiées dans le dépôt. Le recensement complet est dans [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Icône Instagram du pied de page

- Fichier : `assets/social-icons/instagram.svg` (copie : `mobile/app/assets/social-icons/instagram.svg`), tracé aussi dans `nav-shell.js`.
- Source : [Simple Icons](https://github.com/simple-icons/simple-icons) v16.36.0, icône Instagram.
- Licence : **CC0 1.0** (domaine public). Compatible avec une distribution AGPL-3.0-or-later.
- La marque Instagram reste à son titulaire. L’icône est affichée en monochrome, sans modification de la forme.

Les autres icônes du pied (X, Bluesky, Facebook, Tumblr, Mastodon, RSS, Buy Me a Coffee) viennent de la même version de Simple Icons (CC0). LinkedIn vient de Bootstrap Icons v1.13.2 (MIT). Détail : `assets/social-icons/LICENSE.md`.

## Similarité des résumés

`scripts/vendor/dice-coefficient.js` — coefficient de Sørensen–Dice sur les bigrammes, d’après **dice-coefficient 2.1.1**, Titus Wormer, licence **MIT** (compatible AGPL-3.0-or-later). Le copyright et le texte MIT sont en tête du fichier. Sert à refuser un résumé de revue trop proche du titre (`scripts/revue/revue-quality.mjs`).

# Composants tiers

Le code du projet est sous GNU AGPLv3 (`AGPL-3.0-or-later`). Ce fichier crédite les pièces copiées dans le dépôt. Le recensement complet est dans [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Icône Instagram du pied de page

- Fichier : `assets/social-icons/instagram.svg` (copie : `mobile/app/assets/social-icons/instagram.svg`), tracé aussi dans `nav-shell.js`.
- Source : [Simple Icons](https://github.com/simple-icons/simple-icons) v16.36.0, icône Instagram.
- Licence : **CC0 1.0** (domaine public). Compatible avec une distribution AGPL-3.0-or-later.
- La marque Instagram reste à son titulaire. L’icône est affichée en monochrome, sans modification de la forme.

Les autres icônes du pied (X, Bluesky, Facebook, Threads, Tumblr, Mastodon, RSS, Buy Me a Coffee) viennent de la même version de Simple Icons (CC0). LinkedIn vient de Bootstrap Icons v1.13.2 (MIT). Détail : `assets/social-icons/LICENSE.md`.

Les autres icônes du pied (X, Bluesky, Facebook, Threads, Tumblr, Mastodon, RSS, Buy Me a Coffee) viennent de la même version de Simple Icons (CC0). LinkedIn vient de Bootstrap Icons v1.13.2 (MIT). Détail : `assets/social-icons/LICENSE.md`.

## Similarité des résumés

`scripts/vendor/dice-coefficient.js` — coefficient de Sørensen–Dice sur les bigrammes, d’après **dice-coefficient 2.1.1**, Titus Wormer, licence **MIT** (compatible AGPL-3.0-or-later). Le copyright et le texte MIT sont en tête du fichier. Sert à refuser un résumé de revue trop proche du titre (`scripts/revue/revue-quality.mjs`).

## Photos du doodle de fin novembre 2026 (mât)

Les deux photographies sont des adaptations CC BY-SA 3.0 (redimensionnement, recadrage et **couleurs modifiées** : même étalonnage inspiré d’un coucher de soleil GTA VI, cuit dans les JPEG, sans grain ni vignette ajoutés). Elles restent sous CC BY-SA 3.0 (share-alike) et ne sont pas relicenciées en GPL. Le code du projet reste GPL-2.0-only. Aucune dépendance Apache-2.0. Licences confirmées sur les pages Wikimedia. https://creativecommons.org/licenses/by-sa/3.0/

### Montréal

- Fichier : `assets/doodle/montreal-skyline-stefan-fussan.jpg` (2 880 × 1 236)
- Œuvre originale : *Montreal - Skyline - 0100* (*Skyline of Montreal at sunset* / *Sunset in Montreal*), 14 août 2017
- Auteur : Stefan Fussan
- Source : [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Montreal_-_Skyline_-_0100.jpg)
- Traitement : couleurs modifiées (même étalonnage que la photo de Québec, coucher de soleil rose-corail), à partir de l’original Commons (5 160 × 2 214). Le fichier du dépôt est un redimensionnement de qualité à 2 880 px de large.
- Crédit affiché sur le mât : « Stefan Fussan — Montréal ».

### Québec

- Fichier : `assets/doodle/quebec-skyline-martin-st-amant.jpg` (2 880 × 685)
- Œuvre originale : *79 - Québec - Juin 2009* (ville de Québec vue de Lévis, au crépuscule), 13 juin 2009
- Auteur : Martin St-Amant (S23678)
- Source : [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:79_-_Qu%C3%A9bec_-_Juin_2009.jpg)
- Traitement : couleurs modifiées (même étalonnage que la photo de Montréal, coucher de soleil rose-corail), à partir de l’original Commons (15 262 × 3 628), et non d’une vignette. L’original n’est pas dans le dépôt ; le fichier du dépôt est un redimensionnement de qualité à 2 880 px de large.
- Demande de l’auteur, à faire figurer près de l’image : **Martin St-Amant - Wikipedia - CC-BY-SA-3.0**.
- Crédit court affiché sur le mât : « Martin St-Amant — Québec ».

Le titre Pricedown du doodle (`assets/doodle/le-radar-pricedown.svg`) est une image vectorielle fixe, sans fichier de police ni glyphe redistribués. Voir `assets/doodle/README.md`.

## Police Kaushan Script (nom de ville du doodle)

- Fichiers : `assets/doodle/kaushan-script/KaushanScript-Regular.ttf`, licence : `assets/doodle/kaushan-script/OFL.txt`.
- Auteur : Pablo Impallari, avec le crénage d’Igino Marini.
- Licence : **SIL Open Font License 1.1**, avec nom de police réservé « Kaushan Script ». Compatible avec une distribution GPL-2.0-only : la police reste sous OFL, elle n’est pas relicenciée en GPL. Aucune dépendance Apache-2.0.
- Usage : lettrage du nom de la ville affichée (« Ville de Montréal, QC » ou « Ville de Québec, QC ») sur le mât et les publications, en écriture script inclinée, rose à léger halo. Ce n’est pas la police propriétaire de Grand Theft Auto, et elle n’en est pas une copie. Yellowtail avait été envisagée pour la lisibilité du Q, mais elle est publiée sous Apache 2.0 (incompatible avec la règle du dépôt : aucune dépendance Apache-2.0) ; Kaushan Script, déjà sur la liste des polices OFL candidates, a un Q lisible.
- Source : [Google Fonts / Kaushan Script](https://fonts.google.com/specimen/Kaushan+Script).


# Composants tiers

Le code de LE-RADAR.ca est sous GPL-2.0-only. Ce fichier crédite le code libre réutilisé dans le dépôt. L’inventaire complet (fontes, QR, dépendances) est dans [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Aucun composant Apache-2.0 n’est embarqué dans le site. Les outils de développement sous Apache-2.0 (Playwright, outillage Capacitor) restent hors du code livré ; voir `THIRD_PARTY_NOTICES.md`.

## Similarité des résumés

`scripts/vendor/dice-coefficient.js` — coefficient de Sørensen–Dice sur les bigrammes, d’après **dice-coefficient 2.1.1**, Titus Wormer, licence **MIT** (compatible GPL-2.0-only). Le copyright et le texte MIT sont en tête du fichier. Sert à refuser un résumé de revue trop proche du titre (`scripts/revue/revue-quality.mjs`).

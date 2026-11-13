# Session — Studio /affiches/ (re-panel v2 : compact, aperçu, zoom)

- **Date :** 2026-11-13
- **Projet cible :** le-radar
- **Type :** synthétique (pas de vrai panel) — `synthetic: true`
- **Méthode :** lecture solo structurée. Re-panel (cadre cassé) : la décision `le-radar-affiches-studio` (option B, « quoi avant comment ») ne couvrait pas la densité des commandes, l’usage de l’espace d’aperçu, ni le zoom/pan.
- **Question :** Comment configurer une affiche (campus ou une) sans barre latérale indigeste, en gardant l’aperçu en direct à côté, aussi grand que possible, inspectable avant impression, et utilisable au téléphone ?

## Faits de cadre injectés

- Conserver le gabarit campus pixel-identique à a9e8f52 ; La une inchangée (déjà approuvée).
- L’aperçu reste **à côté** des réglages (pas un assistant qui le reporte à la fin — option C du panel du matin, recalée).
- Flux : modèle → établissement → média → période → fond → format. Libellés clairs, défauts raisonnables, commandes compactes.
- Pas de longue barre de texte à faire défiler. Boutons d’export évidents.
- L’aperçu **remplit** largeur et hauteur restantes (pas de zones mortes, pas un cadre à 72 vh). Zoom/pan : boutons, molette avec Ctrl, pincement, Ajuster, 100 %.
- Mobile : aperçu en haut, ou bascule aperçu / réglages. Thèmes clair/sombre et FR/EN conservés.
- Retours déjà acquis du panel B (contraste AA, URL, bilingue limité, pas de troncature) restent en vigueur.
- Mainteneur : « L’interface est aussi de la merde pour configurer les affiches. »

## Options

1. **D — Atelier compact côte à côte.** Rail étroit à étapes (valeurs visibles, hints en infobulle), export collé en tête du rail, aperçu qui occupe tout le reste du viewport sous le bandeau, barre de zoom/pan sur l’aperçu. Mobile : aperçu en haut + bascule.
2. **E — Bandeau d’étapes + aperçu plein cadre.** Pills horizontales en haut, réglages de l’étape courante dans une bande mince, aperçu sous cette bande (presque tout l’écran). Export flottant. Mobile : même pile.
3. **B′ — Studio actuel** (« quoi avant comment », inchangé). Témoin.

## Personas

| Persona | Priorité |
|---------|----------|
| Direction d’un journal étudiant (ex. Quartier Libre) | Isoler son média, vérifier un détail typo avant d’imprimer |
| Responsable comm. d’association | Une affiche campus vite, sans lire un mode d’emploi |
| Utilisateur mobile | Tout faire au téléphone, aperçu lisible |
| Relecture typo / a11y | Libellés clairs, contraste AA, rien de coupé |

## Débat (synthèse)

- **B′** recalé : l’ordre des champs est juste, mais la barre défile (19 pastilles de campus, paragraphes d’aide), l’atelier est coincé à 72 vh, l’affiche est centrée dans un vide, on ne peut pas zoomer. C’est exactement le grief du mainteneur.
- **E** séduit par l’aperçu immense, mais le bandeau horizontal recouvre le « à côté » demandé ; une seule étape visible à la fois cache média/période/fond et force des allers-retours. Au téléphone, la bande mange la hauteur.
- **D** retenu : l’aperçu reste à droite (dessous au téléphone), tous les pas du flux restent visibles mais **compacts** (listes déroulantes, pas 19 pastilles ; aides en infobulle), l’export ne disparaît jamais, le canevas prend tout le reste, zoom/pan pour relire un auteur ou un QR. On conserve les IDs et l’URL du studio actuel.

## Évaluation — notes sur 5 (simulées)

| Critère | Direction | Comm. | Mobile | Typo | Moy. |
|---------|-----------|-------|--------|------|------|
| Clarté (B′ actuel) | 3 | 3 | 2 | 3 | 2,8 |
| Compacité (B′) | 2 | 2 | 2 | 3 | 2,3 |
| Aperçu + zoom (B′) | 2 | 2 | 2 | 2 | 2,0 |
| Clarté (E) | 4 | 4 | 3 | 4 | 3,8 |
| Compacité (E) | 4 | 3 | 3 | 4 | 3,5 |
| Aperçu + zoom (E) | 5 | 5 | 4 | 4 | 4,5 |
| Clarté (D) | 5 | 5 | 5 | 5 | 5,0 |
| Compacité (D) | 5 | 5 | 5 | 4 | 4,8 |
| Aperçu + zoom (D) | 5 | 5 | 5 | 5 | 5,0 |
| Export (D) | 5 | 5 | 5 | 5 | 5,0 |
| Identité / AA (D) | 5 | 5 | 4 | 5 | 4,8 |

Moyenne D : **4,9**. Aucun critère sous 4. **Note de session : A.**

E plafonne à ~3,9 (moyenne des trois critères-clés) : pas un A, le « à côté » et le flux toujours visible manquent.

## Comparaison avant / après

| Critère | Avant (B′) | Après (D) |
|---------|------------|-----------|
| Clarté | 2,8 | 5,0 |
| Compacité | 2,3 | 4,8 |
| Aperçu + zoom | 2,0 | 5,0 |

Le flux « quoi avant comment » est conservé ; on en retire le bruit et on donne à l’aperçu le rectangle qu’il aurait dû avoir.

## Verdict

- **Choix :** **D — Atelier compact côte à côte**, note de session **A**.
- **Confiance :** haute (synthétique).
- **Motif en une phrase :** on règle l’affiche par étapes compactes, l’aperçu occupe tout le reste et s’inspecte (zoom/pan), au bureau comme au téléphone.
- **Si désaccord mainteneur :** préférence (ex. bandeau E, ou bascule mobile par défaut sur « Réglages ») → `overrides` ; nouvelle contrainte sur le gabarit imprimé → re-panel, ne pas toucher à compose().
- **Points ouverts pour le mainteneur :** voir le payload `openQuestions`.

## Suite

- Décision JSON : `decisions/le-radar-affiches-studio-v2.json` (remplace `le-radar-affiches-studio`)
- Fichiers : `affiches/index.html`, `affiches/poster-builder.css`, `affiches/poster-builder.js` (chrome seulement, pas `compose()` / `composeFrontPage()`)

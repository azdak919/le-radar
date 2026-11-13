# Session — Page /kit-media/ (re-panel v2 : directeurs de médias)

- **Date :** 2026-11-13
- **Projet cible :** le-radar
- **Type :** synthétique (pas de vrai panel) — `synthetic: true`
- **Méthode :** lecture solo structurée. Re-panel : la décision du matin (`le-radar-kit-media`, option B) laissait ouvert l’exemple visuel de La une ; le mainteneur demande une page entièrement repensée pour les directions de médias étudiants, avec regroupement clair et vignettes identiques aux PDF.
- **Question :** Quelle architecture de /kit-media/ sert une direction de média étudiant (ex. Quartier Libre) : comprendre l’offre, voir La une, prendre une affiche de son établissement, sans encombrement ?

## Faits de cadre injectés

- Public prioritaire : directions de médias étudiants, puis comm. d’association.
- Deux produits : La une (avec **un exemple visuel** daté, pas seulement des liens) et affiche campus.
- Vignettes identiques aux PDF réels (gabarit campus a9e8f52 déjà régénéré).
- Regroupement net par établissement et par format. Pas de fouillis.
- Thèmes clair/sombre, FR et EN (`en/media-kit/`), mobile.
- Ne pas changer les gabarits d’affiche. Charte (couleurs, logos, bannières, règles) reste accessible.
- Point ouvert du matin : une une datée vieillit — la légende doit dater l’exemple explicitement.

## Options

1. **D — Kit directeur.** Entrée claire (« pour les directions de médias étudiants »), deux cartes produit (La une avec aperçu + Campus), galerie d’affiches groupée par établissement, charte (identité, logos, bannières, règles) en bloc secondaire repliable, CTA vers le studio.
2. **E — Catalogue éditorial.** Mise en page type magazine, grande ouverture typographique, produits mêlés au fil du texte.
3. **B′ — Page actuelle** (refonte du matin, sans exemple visuel de une, galerie filtrée à plat, listes et charte aussi visibles que les affiches).

## Personas

| Persona | Priorité |
|---------|----------|
| Direction d’un journal étudiant | Voir La une, prendre le PDF de son campus, comprendre les règles sans les chercher |
| Responsable comm. d’association | Affiche de son établissement, tout de suite |
| Utilisateur mobile | Page courte, pouces, deux colonnes d’aperçus |
| Relecture marque | Mot-symbole, nom complet, pas de logo d’université |

## Débat (synthèse)

- **B′** insuffisant : La une n’a pas d’image ; la galerie est un tapis plat (filtre, pas de groupes) ; identité/logos/bannières/règles pèsent autant que les affiches. Verdict B du matin, et le point ouvert n’est pas tranché.
- **E** trop « revue » : joli, mais une direction veut un PDF et une règle, pas un long feuillet. Risque de fouillis et de vignettes rognées.
- **D** retenu : l’exemple de une (légende datée, ex. « Université de Montréal, dernier mois — novembre 2026 ») rend enfin le produit visible ; les affiches campus sont groupées par établissement, formats sous chaque carte ; la charte reste là, en secondaire. Mobile : deux colonnes, CTA évidents.

## Évaluation — notes sur 5 (simulées)

| Critère | Direction | Comm. | Mobile | Marque | Moy. |
|---------|-----------|-------|--------|--------|------|
| Clarté de l’offre (B′) | 3 | 3 | 3 | 4 | 3,3 |
| Exemple La une (B′) | 2 | 2 | 2 | 2 | 2,0 |
| Regroupement (B′) | 3 | 3 | 3 | 3 | 3,0 |
| Clarté (E) | 3 | 3 | 2 | 4 | 3,0 |
| Clarté (D) | 5 | 5 | 5 | 5 | 5,0 |
| Exemple La une (D) | 5 | 5 | 5 | 4 | 4,8 |
| Regroupement (D) | 5 | 5 | 5 | 5 | 5,0 |
| Densité / pas de fouillis (D) | 5 | 4 | 5 | 4 | 4,5 |
| Identité (D) | 5 | 4 | 4 | 5 | 4,5 |

Moyenne D : **4,8**. Aucun critère sous 4. **Note de session : A.**

## Comparaison avant / après

| Critère | Avant (B′) | Après (D) |
|---------|------------|-----------|
| Clarté de l’offre | 3,3 | 5,0 |
| Exemple La une | 2,0 | 4,8 |
| Regroupement | 3,0 | 5,0 |

## Verdict

- **Choix :** **D — Kit directeur**, note de session **A**.
- **Confiance :** haute (synthétique).
- **Motif en une phrase :** une direction voit tout de suite La une (exemple daté) et les affiches de son établissement, la charte reste à portée sans envahir la page.
- **Si désaccord mainteneur :** préférence de densité (charte plus ou moins visible) → override ; demande d’exemple de une régénéré automatiquement à chaque déploiement → nouvelle option, pas un changement de gabarit.

## Suite

- Décision JSON : `decisions/le-radar-kit-media-v2.json`
- Fichiers : `kit-media/index.html`, `kit-media.css`, `kit-media/kit-poster-examples.js`, `en/media-kit/index.html`, aperçu une dans `assets/kit/affiches/`

# Session — Galerie /kit-media/ (espace, densité, simplicité)

- **Date :** 2026-11-13
- **Projet cible :** le-radar
- **Type :** synthétique (pas de vrai panel) — `synthetic: true`
- **Méthode :** lecture solo structurée, 5 personas du workflow `focus-group.rhai`.
- **Surface :** `/kit-media/` (galerie d’exemples) et, le cas échéant, le studio `/affiches/`.
- **Question :** Comment utiliser toute la largeur de la page (dès 1024 px), agrandir les vignettes utiles, raccourcir le défilement, et simplifier la page, sans changer les gabarits d’affiche ?

## Faits de cadre

- Charles (capture desktop large, ~1024 px et plus) : la galerie groupée par format (Lettre, puis Légal…) ne montre que 3 petites cartes par rangée, avec un grand vide à droite. Légendes trop longues, 2 boutons empilés, beaucoup de défilement pour 15 affiches. « Tu peux faire mieux pour utiliser l’espace de cette page. » « Simplifie aussi. »
- Contraintes : garder les filtres ; ne pas changer les gabarits (campus = a9e8f52, sauf la ligne de licence GNU GPL v2 demandée par ailleurs) ; La une inchangée hors cette ligne ; Story désactivée ; thèmes clair/sombre, FR et EN, tactile.

## Options

1. **C — Groupé par format (actuel).** Sous-grilles Lettre / Légal / Tabloïd / écrans. `auto-fill` ouvre 4–5 colonnes, mais un groupe de 3 cartes laisse une colonne vide. Légendes en phrase, deux actions l’une sous l’autre. Page longue (intro, deux blocs produit, charte).
2. **F — Grille unique auto-fill + puces.** Une seule grille `repeat(auto-fill, minmax(…, 1fr))` qui remplit la largeur à chaque viewport. Filtres conservés (type, format, établissement). Métadonnées en pastilles courtes. Actions sur une rangée (Télécharger, Studio), toujours visibles (tactile). Page simplifiée : leads d’une phrase, légende de une en pastilles, charte toujours repliée. Vignettes plus larges dès 1024 / 1440 / 1920.
3. **G — Maçonnerie / rangées justifiées, cartes presque muettes.** Encore plus dense : texte seulement au survol. Risque d’accessibilité sur tactile, et de rangées « orphelines » pour les formats rares (1 légal = carte énorme).

## Personas

| Persona | Priorité |
|---------|----------|
| Direction d’un journal étudiant | Trouver vite le PDF de son format, sans scroller trois écrans |
| Responsable comm. d’association | Voir toutes les affiches d’un coup, télécharger ou ouvrir le studio |
| Utilisateur mobile | Pouces, 2 colonnes, actions visibles sans survol |
| Relecture marque | Peu de texte, typo presse, pas de chrome admin |
| Accessibilité | Cibles ≥ 32–44 px, contraste, focus visible, pas d’action seulement au hover |

## Débat

- **C** échoue le diagnostic de Charles : le vide à droite est structurel (groupes trop petits pour le nombre de colonnes). Les phrases sous les vignettes et les boutons empilés allongent chaque carte. Rejeté.
- **G** séduit pour la densité, mais les actions au seul survol trahissent le tactile, et une carte Légal unique s’étirerait sur toute la ligne. La simplicité de lecture (pastilles toujours visibles) passe après. Non retenu.
- **F** répond aux deux demandes : la grille unique remplit la largeur (4+ colonnes dès 1024, 5–7 à 1920), les filtres de format remplacent les titres de section, les pastilles remplacent les phrases, une rangée d’actions reste accessible, la page perd le texte redondant. Le studio `/affiches/` est déjà compact côte à côte ; pas de vide comparable à corriger là, hors de cette passe.

## Évaluation — notes sur 5 (simulées)

| Critère | C | F | G |
|---------|---|---|---|
| Largeur utilisée / pas de vide à droite | 1,6 | 5,0 | 4,4 |
| Taille utile des vignettes | 2,4 | 4,8 | 4,6 |
| Défilement / densité | 2,0 | 4,7 | 4,8 |
| Filtres conservés et clairs | 4,0 | 4,8 | 4,2 |
| Métadonnées et actions compactes | 2,2 | 4,8 | 3,6 |
| Simplicité (moins de texte et de sections) | 2,4 | 4,7 | 4,2 |
| Accessibilité tactile | 4,2 | 4,6 | 2,8 |

Moyenne C : **2,7**. Moyenne G : **4,1** (accessibilité sous 3). Moyenne F : **4,8**. Aucun critère de F sous 4. **Note de session : A** (option F).

## CSS / HTML à appliquer

- `#kit-poster-grid` : une grille, `repeat(auto-fill, minmax(min(100%, 180–260px selon le viewport), 1fr))`, `align-items: start`, largeur 100 %.
- Plus de `.kit-gallery-group` / sous-titres de format.
- Pastilles `.kit-tags` à la place des phrases `.kit-card__meta`.
- `.kit-dl` en une rangée (`flex-wrap: nowrap`).
- Filtres : Toutes, La une, Campus, formats, établissements.
- Leads et légende de une raccourcis ; charte inchangée (repliée).

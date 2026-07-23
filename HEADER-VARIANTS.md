# Header — variantes visuelles

La démo statique est disponible à [`/dev/header-lab.html`](dev/header-lab.html). Elle ne charge ni ne modifie le bandeau météo du site : celui-ci est seulement représenté dans chaque carte pour vérifier la cohabitation visuelle.

## Actifs et cohérence

L'actuel `assets/icon.svg` est le logo déjà utilisé par la PWA et le favicon : c'est l'actif à employer dans la variante recommandée. `assets/logo-mark.svg` contient le mot-symbole historique avec ses emojis.

Les deux emojis de la variante de référence restent volontairement natifs afin de montrer leur variation Apple / Google / Microsoft. Les autres ornements sont des SVG inline; ils ont tous `aria-hidden="true"` car le nom du site suffit au lecteur d'écran.

| Variante | Atouts | Limites | Sous 480 px |
| --- | --- | --- | --- |
| 1. Baseline | Continuité avec l'existant | Emojis non homogènes; redondance avec le sous-titre | Ornements masqués |
| 2. Logo dual | Logo PWA très mémorable, robuste en petit format | Symétrie plus institutionnelle | Parabole droite masquée |
| 3. Logo + icône | Asymétrie moderne; radar devient le signe distinctif | Demande de choisir l'icône secondaire | Radar conservé, icône droite masquée |
| 4. Alternance | Une seule information décorative; adaptable à la section | Ne pas choisir au hasard: préférer le contexte | Une petite icône conservée |
| 5. Épuré | Très lisible, particulièrement mobile | Identité portée uniquement par la typographie | Titre et sous-titre compactés |

## Recommandation

Retenir la variante **2 — Logo dual**, avec le logo PWA fixe à gauche et le même logo retourné horizontalement à droite. Elle crée un cadre de marque sans emoji concurrent. La variante 5 est la meilleure règle de repli sur les très petits écrans.

La mise en production réutilise directement l'asset PWA/favicon, sans toucher au composant du bandeau météo. Aucune collecte ou démarche auprès des associations n'est prévue dans ce livrable.

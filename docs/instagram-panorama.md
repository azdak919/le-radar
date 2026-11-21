# Panorama — aperçu, drapeau éteint

Rien de ceci n’est publié. `formats.une.panorama.enabled` est `false`, et ni `une-run.mjs` ni `buffer-post.mjs` n’appellent le module. Charles regarde les images avant un oui.

## Instagram

Chaque diapo fait 1080×1440, le 3:4 déjà retenu pour le fil ([Buffer, tailles d’image](https://buffer.com/resources/social-media-image-sizes/) : vertical Instagram 1080×1440). Deux, trois ou quatre diapos sont des bandes voisines d’**une seule** photo. Le bord droit de l’une est le bord gauche de la suivante, donc le raccord tombe juste en glissant.

On ne le fait que si la photo de l’article est assez large et assez nette pour remplir chaque diapo **sans agrandir**. Sinon, le format normal reste. Quatre diapos demandent une bande trois fois plus large que haute ; trois, 2,25 fois ; deux, 1,5 fois.

Buffer accepte jusqu’à 20 images dans un carrousel Instagram, compositeur et API ([Attaching images](https://support.buffer.com/articles/attaching-images-videos-and-other-media-to-your-posts-eudySt0TnS), mis à jour le 12 novembre 2026).

## X

Le même article Buffer indique **4 images au plus** pour X, dans le compositeur et dans l’API. Au-delà, l’appel est refusé tout de suite. Le guide des tailles donne le carré X à 1080×1080.

La grille de X n’est pas un carrousel :

- deux images : côte à côte. Deux carrés coupés dans la même photo se rejoignent au milieu ;
- quatre images : grille 2×2. Quatre carrés, les raccords sont horizontaux et verticaux ;
- trois images : une grande et deux empilées. Un panorama horizontal ne s’y raccorde pas. On n’en fait pas.

Le crédit photo reste dans la légende, avec 📸. Il n’est pas incrusté : une ligne de texte casserait le raccord.

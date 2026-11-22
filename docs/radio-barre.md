# Barre radio partagée

Un site affiche la radio étudiante de LE-RADAR en une ligne :

```html
<script src="https://le-radar.ca/radio-barre.js" data-station="chyz" async></script>
```

- La barre se pose à la place du script, sur toute la largeur de son parent.
- `data-station` choisit la station de départ (un `id` de `radios.json`). Le cadran garde toutes les stations. Sans cet attribut, la barre retient le dernier choix (Pomodoro, Solitaire).
- Stations, code et style viennent de LE-RADAR. Un site qui appelle le module reçoit les changements sans mise à jour.
- Le style vit dans un Shadow DOM : il ne fuit pas dans la page.
- Si `radios.json` ne répond pas, si la station n'a pas de flux https, ou si la feuille ne se charge pas, rien n'est affiché. Le parent du script reçoit `data-radar-radio="off"` (sinon `"ready"`), pour se replier.
- Un site qui ne veut pas de radio ne met pas la ligne : aucune requête vers le-radar.ca.
- La barre reprend celle de le-radar.ca, mêmes informations, mêmes contrôles, mêmes couleurs. Seul ajout : le petit logo à gauche, qui mène seulement à https://le-radar.ca/ (sans chemin ni paramètre). Les noms de postes et les textes trop longs défilent comme sur le syntoniseur, y compris à l’arrêt. Les panneaux « À l’antenne » et « À venir » gardent leur place une fois vides, pour que la barre ne saute pas au changement de poste.
- Les paliers suivent la largeur de la barre, pas celle de l’écran. Large (680 px et plus) : 68 px de haut, centrée dans son parent (1326 px au plus) ; « À l’antenne » et « À venir » côte à côte dès 1060 px (en dessous, un seul : celle en ondes, sinon celle à venir), « En ondes » et ces panneaux dès 860 px.
- Étroite (moins de 680 px, téléphone) : 58 px de haut ; le bouton volume ouvre un petit panneau.
- Volume de 0 à 200 %, comme le-radar.ca. Au-delà de 100 %, le son passe par Web Audio si le flux le permet. CHYZ reste à 100 % au plus, comme sur le-radar.ca. Le volume et le son coupé sont retenus.

## Licence

`radio-barre.js` et `radio-barre.css` sont sous licence **MIT** (`SPDX-License-Identifier: MIT` en tête de fichier), comme les scripts d’intégration `embed.js` et `embed.css`. Les médias et les associations étudiantes peuvent les appeler, les copier ou les adapter librement. Le reste du code de LE-RADAR est sous GNU AGPLv3. Les flux, les noms et les logos des stations restent à leurs titulaires.

## Inventaire de la barre native

| Élément de le-radar.ca | Ordinateur | Mobile | Dans le module |
|---|---|---|---|
| « En ondes » (gris au repos, corail et point rouge qui pulse en lecture) | oui | non | ✓ |
| Poste précédent | oui | oui | ✓ |
| Cadran, ligne 1 : établissement (ordinateur), « poste FM · sigle » (mobile) | oui | oui | ✓ |
| Cadran, ligne 2 : « poste FM · slogan » (ordinateur), « À l'antenne · émission » (mobile) | oui | oui | ✓ |
| Liste des postes au clic sur le cadran | oui | oui | ✓ |
| Poste suivant | oui | oui | ✓ |
| Lecture / arrêt (bouton rouge, attente pendant le chargement) | oui | oui | ✓ |
| Diffusion sur un appareil (Chromecast, AirPlay ; grisée sinon) | oui | dans le panneau volume | ✓ |
| Égaliseur rouge (animé en lecture) | oui | non | ✓ |
| Couper le son | bouton volume | dans le panneau volume | ✓ |
| Volume 0 à 200 %, repères 0 %, 100 %, 200 % | oui | dans le panneau volume | ✓ |
| « À l'antenne » : émission, heures, lien vers l'émission | oui (barre large) | dans la ligne 2 | ✓ |
| « À venir » : émission, heures, lien | oui (barre large) | dans la ligne 2 si rien n'est en ondes | ✓ |
| Logo LE-RADAR cliquable vers https://le-radar.ca/ seulement | non | non | ajout voulu |

Différences connues : la diffusion passe par l'API du navigateur (Remote Playback, AirPlay) plutôt que par le kit Cast de Google, pour ne rien charger de Google chez les sites qui appellent la barre. Le carrousel de postes au repos du site n'est pas repris : la barre montre la station choisie.
- Le site qui l'appelle doit permettre `script-src`, `style-src`, `img-src` et `connect-src` vers le-radar.ca, et `media-src https:` pour les flux.

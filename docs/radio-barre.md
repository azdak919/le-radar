# Barre radio partagée

Un site affiche la radio étudiante de LE-RADAR en une ligne :

```html
<script src="https://le-radar.ca/radio-barre.js" data-station="chyz" async></script>
```

- La barre se pose à la place du script, sur toute la largeur de son parent.
- `data-station` fixe la station (un `id` de `radios.json`). Sans cet attribut, la barre propose toutes les stations et retient le choix (Pomodoro, Solitaire).
- Stations, code et style viennent de LE-RADAR. Un site qui appelle le module reçoit les changements sans mise à jour.
- Le style vit dans un Shadow DOM : il ne fuit pas dans la page.
- Si `radios.json` ne répond pas, si la station n'a pas de flux https, ou si la feuille ne se charge pas, rien n'est affiché. Le parent du script reçoit `data-radar-radio="off"` (sinon `"ready"`), pour se replier.
- Un site qui ne veut pas de radio ne met pas la ligne : aucune requête vers le-radar.ca.
- Hauteur fixe de 48 px, bureau comme mobile. Sur mobile, le volume se règle sur l'appareil.
- Le site qui l'appelle doit permettre `script-src`, `style-src`, `img-src` et `connect-src` vers le-radar.ca, et `media-src https:` pour les flux.

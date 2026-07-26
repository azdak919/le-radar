# Assets — page offline / maintenance

| Fichier | Source | Licence |
|---------|--------|---------|
| `coin.png` | [16x16 Coin Animated](https://opengameart.org/content/16x16-coin-animated) · blaze_xcvi · OpenGameArt | **CC0** |
| `sounds/*.wav` | Synthèse originale (Python) pour LE RADAR — bips jump / coin / hit | **domaine public** (créés pour ce projet) |
| `elevator-loop.{opus,mp3}` | Boucle d'ambiance de 30 s, encodée depuis la piste déjà utilisée | Même licence que la piste source |

- Pièces : spritesheet 320×16 = 20 frames × 16×16 (style plateforme, **pas** assets Nintendo).
- Joueur : logo PWA `../icon-192.png` / `../icon.svg`.
- Sons : fichiers courts mono 22 kHz, zéro dépendance réseau.
- Musique : Opus est servi en priorité avec MP3 en repli ; les deux sont précachés afin que la page hors ligne reste autonome.

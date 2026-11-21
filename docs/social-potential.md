# Potentiel des réseaux — forfaits gratuits

Relevé du 21 novembre 2026. Chaque ligne dit ce que Buffer ou le réseau permet, ce que le Radar envoie déjà, et ce que cette branche ajoute. Les drapeaux de `data/social/policy.json` (`potential`) sont **faux** : rien de nouveau ne part tant qu’ils ne sont pas passés à vrai.

Comptes Buffer : un compte gratuit plein (X, Facebook, LinkedIn, clé `BUFFER_API_KEY`) et un second compte gratuit pour Instagram seulement (clé `BUFFER_INSTAGRAM_API_KEY`). Le forfait gratuit connecte 3 canaux et 1 clé d’API par organisation.

## Ce que le forfait gratuit permet

Sources :

- [Buffer pricing](https://buffer.com/pricing) et [Buffer pricing and features](https://support.buffer.com/en-us/articles/buffer-pricing-and-features-6pJrOPuzIt) — 3 canaux, 10 publications en file par canal, 1 clé d’API, 150 requêtes / 15 min, 600 / 24 h, 1 000 par canal sur 30 jours (plafond 3 000). Fils : la page des prix indique **1** fil en file ; l’aide X précise « un fil X programmé à la fois ».
- [Rate limits](https://developers.buffer.com/guides/api-limits.html) — mêmes plafonds d’API. Les limites de publication du jour se lisent avec `dailyPostingLimits`, ce n’est pas la même chose.
- [Scheduling posts](https://support.buffer.com/en-us/articles/scheduling-posts-4Qdld7giAZ) — images, PDF LinkedIn (1, 100 Mo, 300 pages), pas de raccourcisseur au forfait gratuit (liens complets). Le premier commentaire est réservé aux forfaits payants.
- [Attaching images](https://support.buffer.com/en-us/articles/attaching-images-videos-and-other-media-to-your-posts-eudySt0TnS) — Facebook 10 images, Instagram 20, X 4, LinkedIn 20, Mastodon 4, Bluesky 10. Vidéo : 1.
- [Adding alt text](https://support.buffer.com/en-us/articles/adding-alt-text-to-your-images-Oqn4WJGS1j) — X, Facebook, Instagram, Mastodon : 1 000 caractères ; LinkedIn : 300 ; Bluesky : 2 000.
- [Character limits](https://support.buffer.com/en-us/articles/character-limits-for-each-social-network-mNDqsEV9Nf) — X gratuit 280, Facebook 5 000, Instagram 2 200, LinkedIn 3 000, Bluesky 300.
- [Daily posting limits](https://support.buffer.com/en-us/articles/daily-posting-limits-kJ0JtpsdvD) — Facebook 35 / 24 h, Instagram 50, X non vérifié 50, LinkedIn 50, Mastodon 100, Bluesky 100.
- [Using X/Twitter](https://support.buffer.com/articles/using-xtwitter-with-buffer-nA84XnWtuU) — fils jusqu’à 25 posts, texte alternatif, mentions par le @ exact. **Les sondages X ne sont pas pris en charge.**
- [Using LinkedIn](https://support.buffer.com/en-us/articles/using-linkedin-with-buffer-K7tRkGD3mH) — document PDF gratuit, premier commentaire payant, mentions de page gratuites (il faut l’identifiant LinkedIn).
- [CreatePostInput](https://developers.buffer.com/types/CreatePostInput.html) — une image et une carte de lien ne vont pas ensemble. `schedulingType: notification` demanderait une publication à la main : le Radar reste sur `automatic`.
- [PostInputMetaData](https://developers.buffer.com/types/PostInputMetaData.md) — fil sur `twitter`, `mastodon`, `bluesky`, `threads`. Pas de champ fil sur Facebook ni LinkedIn. Pas de champ sondage.

| Réseau | Possible au gratuit | Déjà utilisé | Ajouté ici (éteint) |
| --- | --- | --- | --- |
| X | 1 image (jusqu’à 4), 280 car., fil (1 en file, 25 posts), alt 1 000, @ si le compte est connu, 10 en file, 50 / 24 h si non vérifié | 1 image, 280, 2 mots-clics, @ vérifiés (1 / média / jour), file de 10, créneaux, volume réduit jusqu’au 23 nov. | Fil de 2 posts si l’extrait réel ne tient pas (`xThread`). Pas de 2e à 4e image : carrousel X réservé à l’autre chantier. |
| Facebook | 10 images, 5 000 car., story et reel, alt 1 000, mention de page, 10 en file, 35 / 24 h. Premier commentaire : payant. | 1 image, type `post`, 1 500 car., 1 mot-clic, lien fiche, file de 10, fenêtres | Jusqu’à 4 images réelles dans une publication (`facebookImages`). Pas de story, pas de reel (pas de vidéo d’article). |
| LinkedIn | 20 images ou 1 PDF, 3 000 car., alt 300, mention de page, 10 en file, 50 / 24 h. Premier commentaire : payant. | 1 image, 2 000 car., 3 mots-clics, lien fiche, file de 10, fenêtres | Jusqu’à 4 images réelles (`linkedinImages`). Pas de PDF : ça fabriquerait un fichier. Alt coupé à 300 si on en envoie un. |
| Instagram | Fil, carrousel 20, story, reel, alt 1 000, 10 en file, 50 / 24 h. Premier commentaire : payant. Compte séparé (3 canaux déjà pris). | Fil `post`, image 1080×1440, crédit `📸`, alt, 3 à 5 mots-clics, lien en bio, montée depuis le 22 nov. | Rien. Le carrousel et l’activation sont l’autre chantier. |
| Bluesky | 300 car., 10 images, fil et alt via Buffer **si** le canal est connecté. Le Radar publie en direct (mot de passe d’application), alt sur La une. | Texte, 1 image 4:5, alt, 2 mots-clics | Rien : connecter Bluesky à Buffer serait une nouvelle connexion. |
| Mastodon | Fil et alt via Buffer **si** connecté. Le Radar publie sur piaille.fr (500 car.). | Texte, 1 image, alt, jusqu’à 4 mots-clics | Rien : même raison. |
| Tumblr | Pas un canal Buffer dans ce dépôt. | Texte, image, étiquettes, alt | Rien. |

Heures : `data/social/posting-windows.json` (X, Facebook, LinkedIn, Bluesky, Mastodon, Tumblr), sources déjà notées dans le fichier. Les heures « recommandées » de Buffer sont calculées sur des comptes américains ([aide](https://support.buffer.com/en-us/articles/setting-up-your-timezones-and-posting-schedules-P4iSag90Fl)) : elles ne remplacent pas ces fenêtres. Instagram garde les heures de sa montée.

Mentions : X seulement, comptes de `data/social/x-accounts.json`. Facebook et LinkedIn savent mentionner une page, mais il faut un identifiant que le dépôt n’a pas. On n’en invente pas.

Texte alternatif des articles : la PR 491 le prépare (repli : titre, média, crédit). Ici, l’envoi Buffer coupe LinkedIn à 300 caractères et les autres canaux Buffer à 1 000, pour ne pas dépasser l’aide Buffer.

## Drapeaux

Dans `data/social/policy.json`, objet `potential` :

- `xThread` — fil X. Le second post reprend les phrases réelles de l’extrait qui ne tiennent pas dans les 280. Au plus un fil en file : l’API `scheduledThreadsPerChannel` est lue avant l’envoi. Si la place manque ou si la lecture échoue, le post simple part quand même.
- `facebookImages` / `linkedinImages` — `{ "enabled": false, "max": 4 }`. Une publication, plusieurs photos d’articles, titres et liens réels. `max` ne dépasse pas 10 (Facebook) ni 20 (LinkedIn).
- `utm` — `utm_source`, `utm_medium=social`, `utm_campaign=le-radar` sur le lien le-radar.ca. Pas de lien raccourci.

Aperçu local, sans clé et sans envoi : `node scripts/social/potential-preview.mjs`. Le fichier relu pour cette branche est `docs/social-potential-apercu.md`.

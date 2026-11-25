# Canaux sociaux

Chaque canal expose `{ name, context(), queued(), add({ text, image }) }`.

- `x-buffer.mjs` — **actif** : X @le_radar_ca via l'API GraphQL gratuite de Buffer (secret `BUFFER_API_KEY`, variable facultative `BUFFER_CHANNEL_ID`). Le même module sert aux Pages Facebook et LinkedIn « LE-RADAR.ca » (`createXBuffer({ service: 'facebook' | 'linkedin', channelName: 'LE-RADAR.ca' })`, canal découvert par service + nom ; repli facultatif `BUFFER_FACEBOOK_CHANNEL_ID` / `BUFFER_LINKEDIN_CHANNEL_ID`), voir `../buffer-pages-post.mjs` et `data/social/buffer-pages.json`.
- Bluesky (AT Protocol, mot de passe d'application) et Mastodon (jeton d'application) : à ajouter ici avec la même interface, **non activés**.

Le texte (`lib.mjs#buildText`) prend une limite en paramètre (Bluesky 300, Mastodon 500).

## Gabarit « un module par réseau » (Tumblr d'abord)

Tumblr n'a plus de fichier ici : **tout** vit dans [`../tumblr.mjs`](../tumblr.mjs), seul point d'appel à l'API Tumblr
(publication, file, likes, bilan, suppressions). Trois sections, à reproduire pour chaque réseau :

1. **Réglages + interrupteur** — `TUMBLR_ENABLED=false` (variable de dépôt, `false` par défaut dans les workflows) : aucun appel API.
2. **Client** — délai 3–5 s entre appels, erreur typée avec le code HTTP, 429/401/403 = arrêt du passage, post en file native (`state: "queue"`), `created` seulement sur 201.
3. **Format** — NPF en texte brut (`npfFromText`, `npfBody`), étiquettes, liens pour l'idempotence.

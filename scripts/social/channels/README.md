# Canaux sociaux

Chaque canal expose `{ name, context(), queued(), add({ text, image }) }`.

- `x-buffer.mjs` — **actif** : X @LeRadar_ca via l'API GraphQL gratuite de Buffer (secret `BUFFER_API_KEY`, variable facultative `BUFFER_CHANNEL_ID`).
- Bluesky (AT Protocol, mot de passe d'application) et Mastodon (jeton d'application) : à ajouter ici avec la même interface, **non activés**.

Le texte (`lib.mjs#buildText`) prend une limite en paramètre (Bluesky 300, Mastodon 500).

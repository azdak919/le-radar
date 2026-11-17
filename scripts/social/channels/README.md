# Canaux sociaux

Chaque canal expose `{ name, context(), queued(), add({ text, image }) }`.

- `x-buffer.mjs` — **actif** : X @le_radar_ca via l'API GraphQL gratuite de Buffer (secret `BUFFER_API_KEY`, variable facultative `BUFFER_CHANNEL_ID`). Le même module sert aux Pages Facebook et LinkedIn « LE-RADAR.ca » (`createXBuffer({ service: 'facebook' | 'linkedin', channelName: 'LE-RADAR.ca' })`, canal découvert par service + nom ; repli facultatif `BUFFER_FACEBOOK_CHANNEL_ID` / `BUFFER_LINKEDIN_CHANNEL_ID`), voir `../buffer-pages-post.mjs` et `data/social/buffer-pages.json`.
- Bluesky (AT Protocol, mot de passe d'application) et Mastodon (jeton d'application) : à ajouter ici avec la même interface, **non activés**.
- `instagram.mjs` — **désactivé** : publication d’image via l’API Graph d’un compte professionnel. Aucun identifiant dans le dépôt. À activer quand le compte existera (`formats.une.prepared.instagram.enabled` dans `data/social/policy.json`, plus les secrets `INSTAGRAM_ACCESS_TOKEN` et `INSTAGRAM_USER_ID`). Tant que ce n’est pas fait, `createInstagram` refuse de publier.

Le texte (`lib.mjs#buildText`) prend une limite en paramètre (Bluesky 300, Mastodon 500).

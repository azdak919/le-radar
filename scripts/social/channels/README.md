# Canaux sociaux

Chaque canal expose `{ name, context(), queued(), add({ text, image }) }`.

- `x-buffer.mjs` — **actif** : X @le_radar_ca via l'API GraphQL gratuite de Buffer (secret `BUFFER_API_KEY`, variable facultative `BUFFER_CHANNEL_ID`). Le même module sert aux Pages Facebook et LinkedIn « LE-RADAR.ca » (`createXBuffer({ service: 'facebook' | 'linkedin', channelName: 'LE-RADAR.ca' })`, canal découvert par service + nom ; repli facultatif `BUFFER_FACEBOOK_CHANNEL_ID` / `BUFFER_LINKEDIN_CHANNEL_ID`), voir `../buffer-pages-post.mjs` et `data/social/buffer-pages.json`.
- Bluesky (AT Protocol, mot de passe d'application) et Mastodon (jeton d'application) : à ajouter ici avec la même interface, **non activés**.
- Facebook — **en pause** : le code (texte, image, premier commentaire) reste dans `buffer-pages-post.mjs`, `une-run.mjs` et `formats-run.mjs`, mais n’est plus appelé tant que `formats.une.prepared.facebook.enabled` est faux. La file Buffer n’est pas modifiée.
- `instagram.mjs` — **désactivé**, même interrupteur voisin (`formats.une.prepared.instagram.enabled`). Facebook et Instagram se réactivent ensemble. Compte professionnel requis (`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`), aucun identifiant dans le dépôt. `createInstagram` refuse de publier tant que ce n’est pas fait.

Le texte (`lib.mjs#buildText`) prend une limite en paramètre (Bluesky 300, Mastodon 500).

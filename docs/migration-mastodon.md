# Mastodon : déménagement de piaille.fr vers Mastodon Québec

**État (28 nov. 2026) :** compte « Mastodon Québec » demandé par Charles, **en attente d'approbation**.
Domaine exact à confirmer. Le bot publie toujours sur `@leradar@piaille.fr`.

Mastodon Québec est une instance Mastodon : même API, même client
(`scripts/social/channels/mastodon.mjs`), mêmes workflows. Seuls changent l'instance, le jeton et
les liens publics.

## Déjà en place

- Un seul défaut dans le code : `MASTODON_HOME` / `mastodonInstance(env)` dans
  `scripts/social/channels/mastodon.mjs` (actuellement `https://piaille.fr`). Tous les scripts
  sociaux (publication, une, revue, formats, résultats du week-end, purge, suppression,
  engagement, bilan hebdo) passent par là.
- La variable de dépôt `MASTODON_INSTANCE` l'emporte toujours.

## Reste à faire au basculement (une PR)

1. `MASTODON_HOME` → domaine de Mastodon Québec.
2. Workflows : `vars.MASTODON_INSTANCE || 'https://piaille.fr'` → nouveau domaine. Renommer
   **ensemble** le workflow `Social — Mastodon (@leradar@piaille.fr)` et le déclencheur
   `workflow_run` de `social-une.yml` qui le cite par son nom.
3. Liens publics → `https://<domaine>/@leradar` : `index.html` (lien + JSON-LD `sameAs`),
   `nav-shell.js` (puis `npm run sw:bump`), `scripts/revue/revue-render.js`,
   `tests/footer-social.mjs`, `README.md`.
4. Commentaires « règles de piaille.fr » (`rate-limit.mjs`, `mastodon-post.mjs`, `engage.mjs`,
   `accroche-en.mjs`) : remplacer par les règles de la nouvelle instance. En attendant, garder
   5/h, 50/jour et **aucun texte IA**.

## Étapes humaines (dans l'ordre)

1. Compte approuvé : profil `@leradar`, cocher **« compte robot »**. Autre nom → variable
   `MASTODON_ACCT`.
2. Lire les règles de l'instance (robots, médias, IA, plafonds) et les noter ici.
3. Préférences → Développement → Nouvelle application, droits **`write:statuses` et
   `write:media` seulement**.
4. Compte → « Déménager depuis un autre compte » : alias `@leradar@piaille.fr`.
5. Le même jour : remplacer le secret GitHub `MASTODON_TOKEN`, puis fusionner la PR de
   basculement. **Jamais la PR sans le jeton** (401 sur toutes les publications Mastodon).
6. « Social — Mastodon » en `workflow_dispatch`, `dry_run` = true, puis un passage réel.
7. piaille.fr → « Déménager vers un autre compte » : les abonnés suivent seuls (30 jours avant
   un autre déménagement).
8. Facultatif : workflow « Mastodon — mettre à jour bannière et avatar ».

## Limites connues

- Les anciennes publications restent sur piaille.fr ; leurs id dans `data/` ne seront plus
  supprimables par les workflows (jeton de la nouvelle instance). À la main sur piaille.
- Les revues déjà générées gardent le lien piaille (renvoi automatique après le déménagement).

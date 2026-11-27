# Mastodon : déménagement de piaille.fr vers qlub.social

**État :** code prêt sur la branche, **à ne pas fusionner** avant que les étapes 1 à 4 soient faites.
Sinon, le bot enverrait le jeton de piaille.fr à Qlub, et toutes les publications Mastodon
échoueraient (401).

Qlub (qlub.social) est un réseau social québécois construit sur Mastodon : l'API, le client
`scripts/social/channels/mastodon.mjs` et les workflows restent les mêmes. Seuls changent
l'instance par défaut, le jeton et les liens publics.

## Ce que fait le code

- Un seul défaut : `MASTODON_HOME = 'https://qlub.social'` et `mastodonInstance(env)` dans
  `scripts/social/channels/mastodon.mjs`. Tous les scripts (publication, une, revue, formats,
  résultats du week-end, purge, suppression, engagement, bilan hebdo) passent par là.
- Workflows : `vars.MASTODON_INSTANCE || 'https://qlub.social'`. La variable de dépôt
  `MASTODON_INSTANCE` l'emporte toujours : la mettre à `https://piaille.fr` = retour en arrière
  sans code.
- Liens publics : mât (`index.html`, JSON-LD `sameAs`), pied (`nav-shell.js`), revues
  (`scripts/revue/revue-render.js`) → `https://qlub.social/@leradar`. SW bumpé.
- Gardé tel quel, par prudence, tant que les règles de Qlub ne sont pas lues : plafonds de
  piaille.fr (`rate-limit.mjs` : 5/h, 50/jour ; le plafond réel est 3/jour dans `policy.json`)
  et **aucun texte généré par IA** sur Mastodon.

## Étapes humaines (dans l'ordre)

1. Créer `@leradar` sur qlub.social. Profil : cocher **« compte robot »**. Si le nom n'est pas
   libre, mettre le nom choisi dans la variable de dépôt `MASTODON_ACCT` (défaut `leradar`).
2. Lire les règles de Qlub (robots, médias, IA, plafonds) et les noter ici. Ajuster
   `rate-limit.mjs` si elles sont plus strictes.
3. Qlub → Préférences → Développement → Nouvelle application, droits **`write:statuses` et
   `write:media` seulement**. Copier le jeton.
4. Qlub → Compte → « Déménager depuis un autre compte » : ajouter `@leradar@piaille.fr` comme alias.
5. Fusionner la PR, puis remplacer le secret GitHub `MASTODON_TOKEN` par le jeton Qlub
   (les deux gestes le même jour ; idéalement le secret juste avant la fusion).
6. Lancer « Social — Mastodon » en `workflow_dispatch` avec `dry_run` = true : l'essai doit
   trouver le compte. Puis attendre un passage réel.
7. piaille.fr → Compte → « Déménager vers un autre compte » → `@leradar@qlub.social`.
   Les abonnés suivent seuls ; le profil piaille affiche un renvoi. Délai de 30 jours avant
   un autre déménagement.
8. Facultatif : lancer « Mastodon — mettre à jour bannière et avatar » pour le nouveau profil.

## Limites connues

- Les anciennes publications restent sur piaille.fr. Leurs id dans `data/social/*-state.json`
  et `data/mastodon-sent.json` ne sont plus supprimables par les workflows (jeton Qlub) :
  `delete-post` / `replace-weekend-results` échoueront pour un vieux post piaille. Le
  supprimer à la main sur piaille au besoin.
- Les pages de revue déjà générées (`revues/AAAA-MM-JJ-*`) gardent le lien piaille (renvoi
  automatique après le déménagement) ; les nouvelles revues ont le lien Qlub.
- Pas encore vérifié depuis le dépôt : la version de Mastodon de Qlub (version modifiée) et sa
  limite d'image (8 Mo supposés). L'essai de l'étape 6 le confirme.

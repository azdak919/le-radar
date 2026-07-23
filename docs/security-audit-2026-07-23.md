# Audit de sécurité — 23 juillet 2026

Portée : dépôt public Le Radar, PWA statique, scripts de collecte et Worker
Cloudflare du classement Solitaire.

## Contrôles effectués

| Contrôle | Résultat |
| --- | --- |
| Fichiers suivis à la recherche de secrets, clés privées et fichiers `.env` | Aucun secret versionné détecté |
| Dépendances de production (`npm audit --omit=dev`) | 0 vulnérabilité connue |
| Syntaxe, intégrité des assets et non-régression du jeu | Succès via `npm run check` |
| CSP des trois applications | Politique présente; scripts locaux, analytics et services de traduction explicitement listés |
| URL publique temporaire du Worker | Désactivée (`workers.dev` retourne 404) |

## Mesures appliquées

- Les secrets restent exclus par `.gitignore`; `RATE_LIMIT_SALT` vit uniquement
  dans les secrets Cloudflare, jamais dans GitHub.
- Le Worker valide les initiales, le temps et le nombre de coups, limite les
  soumissions et refuse les écritures provenant d'une origine web non autorisée.
- Les empreintes anti-spam sont hachées avec un sel secret et supprimées après
  sept jours. Aucune adresse IP brute, aucun compte et aucune adresse courriel
  ne sont stockés.
- Les URL de prévisualisation du Worker sont désactivées et l'URL `workers.dev`
  liée au sous-domaine personnel est coupée.
- Le point d'entrée du classement reste vide tant que le domaine neutre
  `scores.le-radar.ca` n'est pas en place.

## Limite assumée du classement

Un jeu entièrement client ne peut pas prouver qu'un score a été joué sans
envoyer l'état complet de la partie à un serveur. Le classement est donc un
**tableau d'honneur**, pas un classement compétitif certifié : une personne
motivée peut fabriquer une requête dans les outils de son navigateur.

Pour durcir davantage un jour : Cloudflare Turnstile sur les soumissions et,
si l'enjeu le justifie, vérification côté serveur d'un journal de coups. Ces
mesures ne sont pas nécessaires pour un classement convivial et augmenteraient
la complexité ou la collecte de données.

## Action restante

La migration DNS est documentée dans
[`cloudflare-dns-migration.md`](cloudflare-dns-migration.md). Une fois
`scores.le-radar.ca` disponible, il faut le raccorder au Worker, activer cet
endpoint dans `solitaire/scores-api.js` et déployer sans `workers.dev`.

# Audit de sécurité — 23 juillet 2026

Portée : dépôt public Le Radar, PWA statique, scripts de collecte et Workers
Cloudflare (météo, rotation fonds).

## Contrôles effectués

| Contrôle | Résultat |
| --- | --- |
| Fichiers suivis à la recherche de secrets, clés privées et fichiers `.env` | Aucun secret versionné détecté |
| Dépendances de production (`npm audit --omit=dev`) | 0 vulnérabilité connue |
| Syntaxe, intégrité des assets et non-régression | Succès via `npm run check` |
| CSP des applications | Politique présente; scripts locaux, analytics et services de traduction explicitement listés |

## Mesures appliquées

- Les secrets restent exclus par `.gitignore` (jamais versionnés dans le dépôt)
- Workers météo / bg-rotation : CORS limité aux origines Le Radar, pas d’état
  utilisateur stocké pour la rotation
- Pas de proxy de flux radio sur Workers free (risque bande passante / coût)

## Classement Solitaire partagé

**Retiré** (worker D1 + endpoint scores). Le solitaire reste 100 % local hors ligne.

## DNS

Voir [`cloudflare-dns-migration.md`](cloudflare-dns-migration.md) pour l’état
des Workers `*.azdak.workers.dev` et une éventuelle migration vers `*.le-radar.ca`.

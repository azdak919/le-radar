# Background rotation entropy — Cloudflare Worker (free)

Worker **sans état** (pas de KV/D1) : entropie CSPRNG sur l’edge Cloudflare
(+ code colo). Le client (`bg-rotation-lib.js`) mélange ce signal au tirage
local pour mât + pomo.

## Pourquoi Cloudflare

- `crypto.getRandomValues` sur l’edge (qualité production)
- Métadonnée `cf.colo` (data center) comme sel géographique
- Free tier Workers : ~100 000 req/jour, largement assez pour le-radar
- **0 maintenance** de base de données (contrairement à un deck global en KV)

Le fameux mur d’entropie Cloudflare (lava lamps) alimente l’infra CF en
amont ; côté Worker on consomme le CSPRNG plateforme — c’est le bon outil
low-cost pour randomiser sans héberger de catalogue.

## Endpoints

| Route | Rôle |
|-------|------|
| `GET /v1/entropy?surface=masthead\|pomo` | 32 octets d’entropie + `day` + `colo` |
| `GET /v1/pick?ids=a,b,c&recent=a` | Choix CSPRNG parmi des ids fournis par le client |
| `GET /health` | Santé |

## Déploiement

```bash
cd workers/bg-rotation
npx wrangler login
npx wrangler deploy
```

URL typique : `https://le-radar-bg-rotation.<compte>.workers.dev`

Le client utilise déjà cette URL par défaut sur `le-radar.ca`
(`bg-rotation-lib.js` → `DEFAULT_ENTROPY_URL`). Ajuste le sous-domaine si
ton compte CF diffère.

## Coût / maintenance

| Élément | Coût |
|---------|------|
| Worker free | 0 $ (quota généreux) |
| KV / D1 | non utilisé |
| Cron bot | non requis |
| MàJ code | rare (logique figée) |

Les catalogues d’images restent dans le dépôt GitHub Pages ; le Worker
ne fait **que** randomiser, pas stocker les photos.

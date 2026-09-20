# Cache HTML hockey Spordle — Cloudflare Worker

Fetch `collegial.rseqhockey.com` / `universitaire.rseqhockey.com` depuis
l’edge Cloudflare. Le bot Node/Python lit le JSON `{ html }` ; le challenge
managed qui bloque GitHub Actions ne part souvent pas des IP CF.

## Endpoints

| Route | Rôle |
|-------|------|
| `GET /v1/html?site=collegial` | HTML scoreboard collégial |
| `GET /v1/html?site=universitaire` | HTML scoreboard universitaire |
| `GET /health` | Santé |

## Déploiement

```bash
cd workers/hockey-cache
npx wrangler deploy
```

URL typique : `https://le-radar-hockey.azdak.workers.dev`

Le bot lit `HOCKEY_CACHE_URL` (défaut ci-dessus).

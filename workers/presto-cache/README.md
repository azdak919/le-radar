# Relais PrestoSports — Cloudflare Worker

Le WAF CloudFront d’en.usports.ca renvoie un captcha (HTTP 405) aux IP
GitHub Actions. Ce Worker lit la page composite depuis l’edge Cloudflare.
Le bot (`scripts/sports-presto-live-lib.js`) l’utilise en repli quand la
lecture directe échoue. Pas un proxy ouvert.

| Route | Rôle |
|-------|------|
| `GET /v1/presto?d=YYYY-MM-DD[&site=usports\|rseqdirect]` | `{ ok, html }` |
| `GET /health` | Santé |

Déploiement : `cd workers/presto-cache && npx wrangler deploy`
URL : `https://le-radar-presto.azdak.workers.dev` (surcharge : `PRESTO_CACHE_URL`).

## Cron (toutes les 5 min)

Lit `https://le-radar.ca/sports-live-window.json` (coups d’envoi, écrit par
`scripts/fetch-sports.js`). Si un match commence dans ≤ 75 min ou est en
cours (≤ 3 h) et qu’aucun run `update-sports-live.yml` n’est en cours ou en
file, déclenche `workflow_dispatch`. Secret : `RADAR_GH_ACTIONS_TOKEN`
(fine-grained, le-radar, Actions read/write) via `wrangler secret put`.

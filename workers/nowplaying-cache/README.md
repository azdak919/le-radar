# Now-playing metadata cache — Cloudflare Worker (free)

Proxy **métadonnées uniquement** (JSON/XML, &lt; 256 Ko) pour le re-poll
navigateur (`clientPoll` dans `radio-nowplaying.json`).

**Ce n’est pas un proxy de flux audio.**

## Pourquoi

- Certaines APIs (ex. Triton Now Playing) sont bloquées CORS ou fragiles
- Sans cache, chaque visiteur frappe l’origine → risque 429 / échecs
- Cache edge ~60 s → 1 fetch origine / mount / minute pour tout le site

## Endpoints

| Route | Rôle |
|-------|------|
| `GET /v1/fetch?url=<https…>` | Proxy + cache de l’URL métadonnées |
| `GET /health` | Santé |

Hosts autorisés : `tritondigital.com`, `streamtheworld.com`, APIs radios
étudiantes connues (CISM, CHOQ, …). Chemins type `/stream`, `.mp3` refusés.

## Déploiement

```bash
cd workers/nowplaying-cache
npx wrangler deploy
```

URL : `https://le-radar-nowplaying.azdak.workers.dev`

## Client

`app.js` :

```js
const NOWPLAYING_API_BASE = 'https://le-radar-nowplaying.azdak.workers.dev';
```

`fetchClientLivePoll` préfixe `clientPoll.url` via ce Worker.

## Coût

Négligeable sur free tier (réponses minuscules, TTL 60 s).

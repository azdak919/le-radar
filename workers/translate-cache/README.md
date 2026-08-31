# Traduction partagée — cache seulement

Même rôle que `workers/weather-cache` : **un cache de bord**, pas un proxy
d’API tierce. Les IP Cloudflare sont souvent bloquées par `clients5` / gtx
(403/429). Le navigateur traduit (IP résidentielle) ; le Worker mémorise.

1. `POST /v1/lookup` — HIT/MISS pour un lot de chaînes (une aller-retour) ;
2. le navigateur appelle `clients5` (puis gtx, MyMemory) sur les MISS ;
3. `POST /v1/store` — écrit les traductions déjà filtrées (poubelle refusée,
   écho source refusé) ;
4. `GET /v1/translate?tl=&q=` — lookup d’une chaîne (compat / curl).
   HIT = 200 `{t}` ; MISS = **404** `{error:"miss"}` (jamais 503 : l’ancien
   client prenait ça pour « réessayer gtx »).

TTL ~7 jours (Cache API). CORS réappliqué à la sortie (poison CORS 2026-08-12).

## Déploiement

```bash
cd workers/translate-cache
npx wrangler login
npx wrangler deploy
```

URL : `https://le-radar-translate.azdak.workers.dev`

Le site appelle lookup **en premier**. 404 / 403 / timeout → `clients5`
direct, sans cascade de 6 s.

## API

```
POST /v1/lookup
{ "tl": "en", "q": ["Bonjour", "Merci"] }
→ { "hits": { "Bonjour": "Hello" }, "missed": ["Merci"] }

POST /v1/store
{ "tl": "en", "items": [{ "q": "Merci", "t": "Thank you" }] }
→ { "ok": true, "stored": 1 }

GET /v1/translate?sl=fr&tl=en&q=Bonjour
→ {"t":"Hello"}   # HIT
→ 404 {"error":"miss"}

GET /health
```

`q` ≤ 450 caractères (même plafond que `MAX_CHUNK`). Lot ≤ 80.

## Vérification

```bash
curl -fsS "https://le-radar-translate.azdak.workers.dev/health"

curl -sS -X POST "https://le-radar-translate.azdak.workers.dev/v1/lookup" \
  -H 'content-type: application/json' \
  -H 'Origin: https://le-radar.ca' \
  -d '{"tl":"en","q":["Bonjour"]}'
```

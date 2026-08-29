# Traduction partagée — cache + repli

Même logique que `workers/weather-cache` : chaque visiteur n’appelle plus
seul les API MT. Chrome UI (« En direct », « Mise en page… ») et les titres
du fil sont les **mêmes chaînes** pour tout le monde ; sans cache partagé,
Google `client=gtx` répond **429 Sorry** et MyMemory épuise son quota
journalier — la page reste en français.

Ce Worker :

1. cache la paire `(langue, texte)` ~6 h (Cache API, CORS réappliqué à la sortie) ;
2. traduit via `clients5.google.com` (`dict-chrome-ex`, encore ouvert) ;
3. repli `translate.googleapis.com` `client=gtx`, puis MyMemory ;
4. refuse les réponses poubelle (`Sorry…`, `MYMEMORY WARNING…`,
   `PLEASE SELECT TWO DISTINCT LANGUAGES` — MyMemory sl===tl) ;
5. refuse les paires sl===tl (pas d’appel MyMemory `fr|fr`).

## Déploiement

```bash
cd workers/translate-cache
npx wrangler login
npx wrangler deploy
```

URL : `https://le-radar-translate.azdak.workers.dev`  
(`workers_dev = true`, parité météo / now-playing.)

Le site appelle ce Worker **en premier**. S’il n’est pas encore déployé
(404), le navigateur bascule tout de suite sur `clients5` — la prod ne
dépend pas du deploy Worker.

## API

```
GET /v1/translate?sl=fr&tl=en&q=Bonjour
→ {"t":"Hello"}
GET /health
```

`q` ≤ 450 caractères (même plafond que `MAX_CHUNK` côté page).

## CORS

Parité weather-cache : prod `le-radar.ca` / `www` / Pages GH + lab
`localhost` / `127.0.0.1` (port libre). **Jamais** `return cached` nu —
réappliquer `corsHeaders(request)` (poison CORS 2026-08-12).

## Vérification

```bash
curl -fsS "https://le-radar-translate.azdak.workers.dev/v1/translate?sl=fr&tl=en&q=Bonjour"
# {"t":"Hello"}

curl -sSI -H "Origin: https://le-radar.ca" \
  "https://le-radar-translate.azdak.workers.dev/v1/translate?sl=fr&tl=en&q=Bonjour" \
  | grep -i access-control-allow-origin
```

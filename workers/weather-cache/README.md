# Météo partagée — cache + repli

Chaque visiteur appelait Open-Meteo directement depuis son navigateur pour la
météo du masthead et du Pomo. À l'échelle du site, ça épuise le quota gratuit
et anonyme d'Open-Meteo (`429 — Daily API request limit exceeded`), et la
météo disparaît partout en même temps, pour tout le monde.

Ce Worker sert de cache partagé devant Open-Meteo (~15 min, comme le cache
`localStorage` déjà côté client) : l'API d'origine n'est donc appelée qu'une
fois par fenêtre de cache pour tout le site, pas une fois par visiteur. Si
Open-Meteo échoue quand même, le Worker bascule sur MET Norway
(`api.met.no`), gratuite, sans clé, et sans quota comparable.

## Déploiement initial

Depuis ce dossier, après avoir créé un compte Cloudflare gratuit :

```bash
npx wrangler login
npx wrangler deploy
```

**Pas de domaine personnalisé ici** : `le-radar.ca` reste hébergé chez WHC
(DNS jamais migré vers Cloudflare malgré
[`../../docs/cloudflare-dns-migration.md`](../../docs/cloudflare-dns-migration.md)),
donc pas de zone Cloudflare pour attacher `weather.le-radar.ca`. Le Worker
tourne à la place sur le sous-domaine `workers.dev` du compte
(`workers_dev = true`) : `https://le-radar-weather.azdak.workers.dev`.

`app.js` et `pomo/js/weather.js` pointent déjà vers cette URL — rien d'autre à
changer côté site. Si `le-radar.ca` est un jour vraiment migré vers
Cloudflare, on pourra repasser à un domaine personnalisé (`workers_dev = false`
+ Add Domain) et mettre à jour ces deux fichiers.

## API

- `GET /v1/forecast?latitude=..,..&longitude=..,..&current=temperature_2m,weather_code,is_day&temperature_unit=celsius&timezone=America/Toronto`
  — même forme de requête et de réponse qu'Open-Meteo (un tableau
  `{ current: { temperature_2m, weather_code, is_day } }`, un élément par
  coordonnée, dans le même ordre). Les deux vitrines (masthead + Pomo)
  envoient toujours la même liste de 47 villes, donc la même clé de cache.

## CORS

Origines acceptées (parité `nowplaying-cache` / `bg-rotation`) :

- `https://le-radar.ca`, `https://www.le-radar.ca`
- `https://azdak919.github.io`
- lab local : `http://localhost:PORT` et `http://127.0.0.1:PORT`

Sans localhost, le navigateur bloque le fetch en preview → bandeau météo
resté `hidden`, impossible de juger les triggers météo ∥ sports.

## Vérification

```bash
curl -fsS "https://le-radar-weather.azdak.workers.dev/v1/forecast?latitude=45.5,46.8&longitude=-73.6,-71.2&current=temperature_2m,weather_code,is_day"
```

La réponse doit être un tableau de deux objets `{"current":{...}}` avec des
températures plausibles.

CORS lab **et** prod (les deux doivent coller à l’`Origin` de la requête — le
cache partagé ne doit **pas** renvoyer le CORS d’un autre hôte **ni d’un autre
port** lab) :

```bash
# Port lab variable (8765, 8766, 5173…) — chacun doit coller
curl -sSI -H "Origin: http://127.0.0.1:8765" \
  "https://le-radar-weather.azdak.workers.dev/v1/forecast?latitude=45.5&longitude=-73.6&current=temperature_2m" \
  | grep -i access-control-allow-origin
# → Access-Control-Allow-Origin: http://127.0.0.1:8765

curl -sSI -H "Origin: http://localhost:5173" \
  "https://le-radar-weather.azdak.workers.dev/v1/forecast?latitude=45.5&longitude=-73.6&current=temperature_2m" \
  | grep -i access-control-allow-origin
# → Access-Control-Allow-Origin: http://localhost:5173

curl -sSI -H "Origin: https://le-radar.ca" \
  "https://le-radar-weather.azdak.workers.dev/v1/forecast?latitude=45.5&longitude=-73.6&current=temperature_2m" \
  | grep -i access-control-allow-origin
# → Access-Control-Allow-Origin: https://le-radar.ca
```

> **Piège (corr. 2026-08-12)** : stocker la `Response` Cache API *avec* ses
> en-têtes CORS, puis la renvoyer telle quelle, empoisonne la prod : un hit lab
> (`127.0.0.1:PORT`) fait bloquer le navigateur sur `le-radar.ca` (ou un autre
> port lab). Toujours réappliquer CORS à la sortie (parité `nowplaying-cache`).
> Lab accepté : `localhost` / `127.0.0.1` / `::1` / `0.0.0.0`, **tout port**.

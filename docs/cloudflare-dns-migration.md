# Migration DNS Cloudflare (optionnel)

Objectif : conserver GitHub Pages pour le site et éventuellement attacher des
Workers sous `*.le-radar.ca` (au lieu de `*.azdak.workers.dev`).

## État actuel

- **Site** : GitHub Pages + DNS chez le registrar (WHC) — pas de zone CF requise
- **Workers live** (sous-domaine compte) :
  - `https://le-radar-weather.azdak.workers.dev` — météo
  - `https://le-radar-bg-rotation.azdak.workers.dev` — entropie rotation fonds

Les Workers tournent en `workers_dev = true` tant que le DNS de `le-radar.ca`
n’est pas sur Cloudflare.

## Si un jour le DNS passe sur Cloudflare

1. Ajouter la zone `le-radar.ca` dans Cloudflare (DNS only ou full proxy selon besoin)
2. Workers & Pages → worker concerné → **Add Domain**
   - ex. `weather.le-radar.ca`, `bg.le-radar.ca`
3. Mettre à jour les URL côté client (`app.js` `WEATHER_API_BASE`,
   `bg-rotation-lib.js` `DEFAULT_ENTROPY_URL`)
4. Redéployer avec `workers_dev = false` si tu n’as plus besoin de `workers.dev`

## Ce qui n’est plus prévu

- Classement Solitaire partagé (`scores.le-radar.ca` / D1) — **retiré**
- Proxy de flux radio sur Workers free — **évité** (bande passante)

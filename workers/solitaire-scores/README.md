# Classement partagé — Solitaire

Ce dossier est le petit backend gratuit du classement universel. GitHub Pages
continue d'héberger le jeu; Cloudflare Workers + D1 héberge uniquement les dix
meilleurs scores.

## Déploiement initial

Depuis ce dossier, après avoir créé un compte Cloudflare gratuit :

```bash
npx wrangler login
npx wrangler d1 create le-radar-scores
```

Copie l'identifiant affiché dans `wrangler.toml` à la place de
`REPLACE_WITH_D1_DATABASE_ID`, puis :

```bash
npx wrangler d1 execute le-radar-scores --remote --file=./schema.sql
npx wrangler secret put RATE_LIMIT_SALT
npx wrangler deploy
```

`RATE_LIMIT_SALT` est une longue valeur aléatoire privée : elle sert seulement
à produire l'empreinte non réversible utilisée pour limiter les envois.
En production, utiliser le domaine neutre `https://scores.le-radar.ca/v1/scores`
plutôt qu'une URL `workers.dev`; voir
[`../../docs/cloudflare-dns-migration.md`](../../docs/cloudflare-dns-migration.md).

## API

- `GET /v1/scores` — les 10 meilleurs scores, triés par temps puis coups.
- `POST /v1/scores` — `{ "name": "AZD", "timeMs": 123456, "moves": 98 }`.

Le classement est un tableau d'honneur : le navigateur calcule les scores. Le
Worker valide les bornes, ne conserve aucun compte ni adresse IP brute, déduplique
les entrées identiques et limite une soumission par appareil à chaque 30 secondes.

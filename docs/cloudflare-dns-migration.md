# Migration DNS vers Cloudflare — le-radar.ca

Objectif : conserver GitHub Pages pour le site et exposer le Worker de scores
sous `https://scores.le-radar.ca`, sans URL portant un nom personnel.

## Avant le basculement

Les enregistrements actifs vérifiés le 23 juillet 2026 sont :

| Hôte | Type | Valeur |
| --- | --- | --- |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |
| `www` | CNAME | `azdak919.github.io` |

Ces cinq entrées doivent être présentes dans Cloudflare avant de remplacer les
serveurs de noms chez WHC. Elles maintiennent GitHub Pages et le `CNAME` du
dépôt reste `le-radar.ca`.

## Basculement

1. Dans Cloudflare : **Add a domain** → `le-radar.ca` → plan **Free**.
2. Reproduire le tableau ci-dessus dans **DNS**. Les A et le CNAME `www`
   restent en **DNS only** (nuage gris) : GitHub Pages ne doit pas être proxyfié.
3. Chez WHC, remplacer les serveurs de noms par les deux noms fournis par
   Cloudflare. Ne modifie aucun autre réglage du domaine.
4. Attendre que Cloudflare confirme la zone active, puis vérifier
   `https://le-radar.ca` et `https://www.le-radar.ca`.
5. Dans **Workers & Pages → le-radar-scores → Domains**, choisir
   **Add Domain** et saisir `scores.le-radar.ca`. Cloudflare crée la route
   sécurisée du Worker; ne crée pas de CNAME manuel vers `workers.dev`.

Quand le domaine répond, renseigner son endpoint (`https://scores.le-radar.ca/v1/scores`)
dans `solitaire/scores-api.js`, ajouter ce même hôte à `connect-src` dans
`solitaire/index.html`, puis déployer le Worker avec `workers_dev = false`.

## Vérification

```bash
curl -fsS https://scores.le-radar.ca/v1/scores
```

La réponse initiale doit être `[]`. Le Worker n'accepte les écritures du
navigateur que depuis `le-radar.ca`, `www.le-radar.ca` ou le domaine GitHub
Pages historique; il ne conserve qu'une empreinte anti-spam temporaire.

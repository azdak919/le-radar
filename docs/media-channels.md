# Médias, canaux de distribution et suivi

LE-RADAR agrège. Il n’est pas l’éditeur original des articles.

```
MediaSource (journal ou radio)
  └── DistributionChannel (site, RSS, Google Actualités, Instagram…)
```

Le **média** est l’entrée éditoriale (`news-sources.json` / `radios.json`).
Les **canaux** sont les endroits où on peut le lire ou le suivre.
Ils appartiennent au média, pas à chaque article.

## MediaSource

Une ligne de `news-sources.json` (`active`) ou de `radios.json`.

- Journal : identifiant public = `slugify(name)` (même slug que `/journaux/<slug>/`).
- Radio : identifiant = `id` (`chyz`, `cism`…).
- `name` reste la clé de jointure avec `news.json.source`.

Les candidats (`news-sources.json.candidates`) peuvent porter les mêmes
champs de canaux. Ils ne sont pas suivables tant qu’ils ne sont pas `active`.

## DistributionChannel

Normalisés par `scripts/media-channels-lib.js` :

| `type` | Origine typique | Libellé FR |
|---|---|---|
| `website` | `site` / `website` | Site officiel |
| `rss` | `url` si c’est un flux | RSS |
| `google-news` | `googleNews.url` | Google Actualités |
| `instagram` `youtube` `facebook` `x` `tiktok` `podcast` | champs du registre, sinon `social-feed.json` filtré | identiques |

Chaque canal a :

- `url`
- `status` : `unknown` | `detected` | `verified` | `unavailable`
- `origin` : `registry` (saisi) ou `social-feed` (récolte)

L’interface n’affiche pas ces statuts. Une URL récoltée n’est jamais
présentée comme vérifiée. Une URL absente ou `unavailable` n’apparaît pas.

`social-feed.json` est un cache de découverte. Les profils génériques
(WordPress.com, `profile.php`, comptes d’établissement au lieu du journal)
sont rejetés.

## Google Actualités

Champ optionnel sur la source :

```json
"googleNews": {
  "url": "https://news.google.com/publications/…",
  "status": "verified"
}
```

Règles :

- Seulement une page `/publications/…` sur `news.google.com` ou `news.google.ca`.
- Jamais une recherche `?q=`.
- Jamais une URL inventée. Pas d’URL = pas de bouton.
- `discoverGoogleNewsChannel()` est un crochet futur : il lit éventuellement
  le **site du média** (schema.org / sameAs). Il ne scrape pas Google.

## Suivi dans LE-RADAR

`scripts/media-follow-store.js` — pas d’appels `localStorage` dans les
composants.

- Clé : `radar-media-follows-v1`
- Format : `{ "v": 1, "ids": ["lexemplaire", "quartier-libre"] }`
- API : `list`, `isFollowed`, `follow`, `unfollow`, `toggle`, `subscribe`,
  `filterItemsByFollowed`
- Hors navigateur / mode privé : état mémoire de session, pas d’exception

Le bouton **Suivre** / **Suivi** vit sur la fiche du journal. Le fil a un
filtre **Suivis** dès qu’au moins un média est suivi, et un bandeau discret
en vue source. Les cartes d’article restent un lien vers l’original
(pas de bouton imbriqué dans le `<a>`).

Un fil « Mon fil » dédié n’est pas une page séparée pour l’instant : le
filtre **Suivis** est le même pipeline (`tous les articles → médias suivis`).

## Statistiques du répertoire

`channelCoverage(sources)` compte, par type, les médias qui ont un canal
visible. L’annuaire `/medias/` en affiche une ligne (RSS, Instagram, etc.)
lorsque le total n’est pas zéro.

## JSON-LD

- Fiche journal : `NewsMediaOrganization` au nom du média, `url` = site
  original, `sameAs` = canaux (sauf RSS).
- Fil d’accueil : `ItemList` d’articles dont `publisher` est le **média
  étudiant**, jamais LE-RADAR.
- LE-RADAR lui-même : `WebSite` + `Organization` (agrégateur).

## Ajouter un canal

1. Éditer la source dans `news-sources.json` (ou `radios.json`).
2. Pour Google Actualités : coller l’URL `/publications/…` réellement
   vérifiée, `status: "verified"`.
3. `npm run seo:update` pour régénérer les fiches.
4. Ne pas copier `social-feed.json` tel quel dans le registre.

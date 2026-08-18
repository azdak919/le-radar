# Référencement — moteurs de recherche et assistants IA

> Cible : les personnes étudiantes des cégeps et universités du **Québec**, y
> compris les **étudiantes et étudiants internationaux déjà sur un campus
> québécois**. Ce document décrit ce qui est en place, pourquoi, et ce qui reste
> à faire à la main.

---

## 1. Le problème d'origine (mesuré le 2026-07-25)

Le site est entièrement rendu côté client : `app.js` charge `news.json` et
construit le fil. Un navigateur voit tout, un robot qui n'exécute pas
JavaScript ne voit rien.

| Mesure sur `/` | Humain (JS actif) | Robot sans JS |
|---|---|---|
| Texte de la page | 68 329 car. | **694 car.** |
| Titres d'articles | 187 | **0** |
| Contenu du fil | 185 articles | *« Aucun article pour le moment. »* |

GPTBot, ClaudeBot et PerplexityBot **n'exécutent pas JavaScript**. C'est donc la
page vide qu'ils indexaient. Google, lui, rend le JS, mais partait avec un
`<title>` réduit à `LE-RADAR.ca`, aucune `<h1>`, aucun `canonical`, aucune
donnée structurée, et ni `robots.txt` ni `sitemap.xml`.

**Après** : 8 519 caractères pour un robot sans JS, une `<h1>`, un titre
descriptif, les 20 dernières manchettes lisibles dans le HTML source — et le
site est passé de **4 à 71 URL indexables** (voir §2).

---

## 2. Ce qui est automatisé

### `scripts/generate-seo.js`

Un seul script, appelé par les workflows qui écrivent déjà les données. Il
produit :

| Sortie | Rôle |
|---|---|
| `sitemap.xml` | Toutes les pages indexables (71 URL) |
| `sitemap-archives.xml` | Échantillon public, borné et vérifié du catalogue historique — séparé du sitemap principal pour pouvoir mesurer, réduire ou désactiver l’expérience |
| `llms.txt` | Fiche de contexte pour assistants IA : ce qu'est LE-RADAR.ca, les journaux, radios et établissements **nommés avec l'URL de leur page**, et les données brutes |
| `index.html` | Prérendu des 20 dernières manchettes + JSON-LD `ItemList` |
| `radios/` `journaux/` `etablissements/` `medias/` `en/` | **67 pages d'entités** statiques, FR + EN (`scripts/seo-pages.js`) |

```bash
npm run seo          # dry-run, n'écrit rien
npm run seo:update   # écrit
```

### Pages d'entités

Le site est passé de **4 à 71 URL indexables**. Une page par radio (6), par
journal (14) et par établissement (12), plus un annuaire — le tout en double,
français et anglais.

Elles répondent aux requêtes que la cible formule vraiment : « radio étudiante
Université Laval », « journal étudiant UQAM », « McGill student newspaper ».
Chacune est lisible **sans JavaScript**, porte ses données structurées
(`RadioStation`, `NewsMediaOrganization`, `CollegeOrUniversity`,
`CollectionPage`) et renvoie vers le média d'origine — aucun article n'est
republié.

Deux pièges traités, à ne pas réintroduire :

- **Noms d'établissements incohérents** entre registres (« UQAM » / « Université
  du Québec à Montréal », « Université McGill » / « McGill University »). La
  table `INSTITUTIONS` de `seo-pages-lib.js` les regroupe : sans elle, on génère
  deux pages concurrentes pour le même établissement, soit exactement le contenu
  dupliqué qu'on cherche à éviter.
- **Grammaire française** : `frOf()` / `frAt()` produisent « de l'Université
  Laval » et « du Cégep du Vieux Montréal », pas « de Université ». `plural()`
  existe parce que « journal » fait « journaux », pas « journalux ». Un test
  bloque le retour de ces fautes.

Les dossiers générés sont **purgés puis réécrits** à chaque passe : un journal
retiré du registre ne laisse pas de page orpheline indexée derrière lui.

### Catalogue historique expérimental

`news.json` reste le **fil vivant** : la règle de fraîcheur y retire les
articles qui ne doivent plus occuper l’accueil. En parallèle,
`news-archive.json` conserve les métadonnées des articles réellement découverts
par les bots, avant ce filtrage. Il peut aussi être enrichi par un
**rétro-crawl lent, séquentiel et reprenable** des listes publiques paginées.
Ce passage ne consulte jamais une page d’article une à une et sa projection
WordPress exclut explicitement `content.rendered` : il ne conserve donc que le
titre, l’extrait, l’auteur disponible, la date originale et l’URL. Les entrées
historiques déjà présentes dans le cache portent `importedAt`; celles du
rétro-crawl reçoivent `firstDiscoveredAt` et `ingestedAt` au moment réel de la
collecte, sans se faire passer pour nouvelles.

Le modèle distingue explicitement `publishedAt`, `firstDiscoveredAt`,
`importedAt`, `lastSeenAt`, `lastVerifiedAt`, URL originale/canonique, état du
lien, empreinte, statut d’image et décision d’indexation. Une panne de flux ne
fait donc ni disparaître une métadonnée connue ni passer un cache réutilisé pour
une nouvelle découverte.

Le réglage versionné [`historical-catalog.config.json`](../historical-catalog.config.json)
offre trois modes :

- `off` : aucune page publique;
- `partial` : défaut public actuel, représentatif mais plafonné;
- `full` : réservé à une décision humaine ultérieure, jamais activé par un bot.

En `partial`, une entrée doit avoir un titre, un extrait assez informatif et un
lien original récemment vérifié. Les pages `/archives/` et `/archives/<source>/`
ne conservent qu’un court extrait factuel, les métadonnées et un lien évident
vers le média. Elles ne copient ni corps intégral ni image externe à licence
inconnue. Leur canonique est leur URL d’agrégation, car la page apporte une
valeur propre (attribution, date de collecte et état du lien); la publication
d’origine reste clairement identifiée comme éditrice dans le HTML et le JSON-LD.
Le balisage emploie `CollectionPage` / `ItemList` / `CreativeWork`, **pas** un
`NewsArticle` attribué à LE-RADAR.ca.

### Fenêtre d’âge et rétro-crawl

La date qui compte est toujours `publishedAt`, jamais la date d’ingestion :
collecter aujourd’hui un article de 2018 ne le rend pas récent. La politique
versionnée est volontairement en trois bandes :

- **0 à 12 mois** : indexables si le lien est vérifié et que l’extrait est utile;
- **plus de 12 mois à 3 ans** : consultables dans `/archives/conservation/`, avec
  `noindex,follow` et hors sitemap;
- **plus de 3 ans** : consultables dans `/archives/reference/`, avec
  `noindex,follow` et hors sitemap.

Le premier seuil offre une archive utile sans faire croire qu’un volume de
courts extraits externes est du contenu original. Les deux autres bandes
protègent la continuité documentaire sans gonfler artificiellement l’index. Le
rétro-crawl ne lit donc lui-même que la fenêtre de trois ans; lorsqu’un flux
d’une source nouvellement recensée fournit des articles plus anciens, leurs
métadonnées peuvent néanmoins rejoindre les archives de référence après
vérification du lien.

```bash
# lecture réseau, sans écriture
node scripts/retro-crawl-historical.js

# trois sources, quatre pages de listes publiques chacune (défaut prudent)
node scripts/retro-crawl-historical.js --update

# pilote ciblé / reprise de la seule source demandée
node scripts/retro-crawl-historical.js --update --source="La Pige" --pages-per-source=1
```

L’avancement versionné de chaque source est dans
`historical-crawl-state.json`. Une source indisponible est reportée avec une
date de reprise; elle n’échoue pas le Vérification. `--restart` réinitialise
l’avancement d’une source (ou de toutes si aucun `--source` n’est précisé) : à
réserver à une revue humaine, puisqu’il relit les listes déjà parcourues.
Pour un domaine personnalisé hébergé par WordPress.com, le registre de source
peut déclarer `historyWordpressComSite`; le même crawl minimal utilise alors
l’API publique WordPress.com plutôt que d’inventer une extraction HTML.

Pour vérifier expressément les liens d’une source promue, sans attendre la
rotation hebdomadaire :

```bash
node scripts/verify-historical-links.js --update --source="La Gifle" --limit=20
```

`scripts/verify-historical-links.js --update --limit=20` vérifie une URL à la
fois, en répartissant la passe entre les publications. Un 404/410 devient
`missing`, une panne devient `unreachable`; les deux sont exclus de l’échantillon
public. Le workflow hebdomadaire `verify-historical-links.yml` est borné et
tolérant aux incidents réseau pour ne pas transformer une source indisponible en
bruit de Vérification.

Quand un flux expose un compte technique à la place de la signature éditoriale,
une passe distincte peut vérifier uniquement la byline visible, sans sauvegarder
le corps de l’article :

```bash
node scripts/verify-historical-authors.js --update --source="Le Trait d'Union" --limit=20
```

Une signature absente reste absente : le catalogue ne remplace jamais une
attribution inconnue par le nom d’un compte WordPress.

Ce catalogue est **expérimental** : suivre impressions, indexation, erreurs de
canonique et clics pendant 4 à 6 semaines avant d’augmenter les plafonds ou de
soumettre son sitemap à Search Console. Les contenus historiques n’ont aucune
voie de retour vers le fil principal.

### Pourquoi le prérendu ne casse rien

Le bloc prérendu (marqueurs `RADAR:SEO:FEED`) reste dans le HTML pour les
robots sans JS. Visuellement il est masqué dès le premier paint (squelette
magazine) jusqu’à `#news-list[data-ready]`, posé par `renderNews()`. Un
`<noscript>` lève le masque si JavaScript est absent.

Vérifié au banc d'essai : géométrie identique au pixel (mêmes positions, mêmes
dimensions, hauteur de document identique à 3867 px en bureau et 6929 px en
mobile), avant et après.

Effet secondaire **positif** mesuré sur 3G lente : à 5 s de chargement, la
version d'origine affichait un fil vide ; la version prérendue affiche 20
manchettes lisibles et cliquables, dans le design natif (le prérendu réutilise
les classes CSS réelles : `.article`, `.article-title`, `.article-meta`).

### Placement dans les workflows

Le script est appelé **après** l'étape « Check for changes » de
`update-news.yml` et `maintain.yml`, et jamais avant. Sinon `index.html`
changerait à chaque passe et forcerait un commit à chaque heure, ce que la
logique anti-bruit existante évite délibérément. Il est aussi en
`continue-on-error` : un échec du référencement ne doit jamais bloquer la
publication éditoriale.

### Garde-fous

`tests/static-integrity.mjs` vérifie désormais : présence de `robots.txt`,
`sitemap.xml`, `llms.txt`, `assets/og-cover.png` ; présence des quatre
marqueurs ; **fil prérendu non vide** ; une seule `<h1>` par page ; `canonical`
partout ; titre effectif d'au moins 15 caractères ; et `margin: 0` sur
`.wordmark-mark` (sans quoi la `<h1>` hériterait de la marge par défaut du
navigateur et décadrerait le mât).

---

## 3. Cas particuliers à connaître

- **`/pomo/`** réimpose `document.title = 'Pomo'` en JavaScript
  (`pomo/js/pomo.js`, `pomo/js/translate.js`) : c'est voulu, le libellé des
  favoris et des onglets doit rester stable. Son référencement passe donc par
  `og:title` et la description, pas par `<title>`.
- **Pas de page par article.** LE-RADAR.ca est un agrégateur : les liens pointent
  vers l'article original. Créer des pages d'articles produirait du contenu
  dupliqué et une friction inutile avec les journaux sources.
- **`/pomo/` et `/solitaire/`** portent des titres rattachés à la marque plutôt
  que génériques (« Solitaire gratuit en ligne » attirerait un public non
  étudiant qui diluerait la cohérence thématique du domaine).

---

## 4. Ce qui reste à faire à la main

> Deux documents accompagnent cette section :
> **[`referencement-suivi.md`](referencement-suivi.md)** — quoi mesurer, quand, et
> comment repérer qu'on attire le mauvais public.
> **[`wikidata.md`](wikidata.md)** — la fiche à créer, identifiants vérifiés.

Ces actions ne sont pas automatisables, et ce sont les plus rentables.

### 4.1 Déclarer le site

1. **Google Search Console** — ajouter `le-radar.ca`, soumettre
   `https://le-radar.ca/sitemap.xml`.
2. **Bing Webmaster Tools** — même chose (alimente aussi ChatGPT Search).
3. **IndexNow** — activable en un clic depuis le tableau de bord Cloudflare.
   Utile vu le rythme de mise à jour du fil.

Le sitemap historique reste volontairement séparé : ne le soumettre qu’après
une première lecture des rapports du sitemap principal et de l’échantillon
public. Cela préserve un vrai groupe de contrôle pour l’expérience.

### 4.2 Vérifier que la cible est la bonne

Dans Search Console, le rapport **Performances → Pays** est la mesure de
contrôle : le trafic doit être massivement canadien. S'il ne l'est pas, c'est
que le site attire le mauvais public.

### 4.3 Vocabulaire — ce qu'il faut viser, et ce qu'il faut fuir

**Viser** le vocabulaire réel de la cible : *cégep*, *asso étudiante*, *session
d'automne*, *radio de campus*, et surtout les **noms propres** — « radio
étudiante Université Laval », « journal étudiant UQAM », « écouter CISM en
direct », « Le Délit McGill ».

**Éviter** *« étudier au Québec »*, *« permis d'études »*, *« immigration
étudiante »*. Ces requêtes attirent des candidats **à l'étranger**, qui ne sont
pas la clientèle : la cible, ce sont les personnes **déjà inscrites sur un
campus**. Ce trafic gonflerait les statistiques sans usage réel et brouillerait
le sujet du domaine aux yeux de Google comme des IA.

### 4.4 Liens entrants — le levier le plus fort

Un lien depuis un domaine universitaire québécois (`.ca`, `.qc.ca`) est le
signal géographique **et** thématique le plus puissant qui existe pour ce
projet. Cibles naturelles : les 14 journaux et 6 radios recensés, et les
associations étudiantes. C'est un travail de courriel, pas de code — et il met
plusieurs semaines à porter, donc à démarrer tôt.

### 4.5 Wikidata

Créer un élément Wikidata pour LE-RADAR.ca, relié aux établissements et aux médias
recensés. Les assistants IA s'appuient massivement sur Wikidata pour la
désambiguïsation d'entités : c'est ce qui fait la différence entre « un site »
et « la référence sur les médias étudiants québécois ».

---

## 5. Volet anglais

Pour les personnes étudiantes internationales **déjà inscrites au Québec**.

- `hreflang` réciproques `fr-CA` / `en-CA`, avec **`x-default` → français**.
- `en-CA` et non `en-US`, délibérément : on vise les anglophones **au Canada**,
  pas un trafic américain sans usage.
- **Aucune redirection, aucune détection de langue.** Les règles d'activation de
  `translate.js` (navigateur `fr`/`en` → original, autre langue → auto,
  `localStorage` prioritaire) gardent le contrôle total de l'expérience. Un test
  navigateur vérifie qu'on n'est jamais envoyé vers `/en/` malgré soi.
- Découvrabilité **minimale mais légitime** : un lien `English` en pied de page,
  plus le sitemap. Une page sans lien entrant est mal explorée quoi qu'en dise
  le sitemap ; c'est pourquoi le pied de page porte aussi le lien vers
  l'annuaire. Ce sont les deux seuls changements visibles de tout ce chantier
  (une ligne de 29 px en pied de page).
- Les **articles ne sont jamais traduits** : un clic mène au média source, dans
  sa langue d'origine. Le volet anglais ne couvre que les pages de présentation.

---

## 6. Archivage — pérennité, pas référencement

`scripts/archive-articles.js` soumet les articles agrégés et les pages du site
à la **Wayback Machine** (`npm run archive` en dry-run, `archive:update` pour
soumettre). Le workflow `archive-articles.yml` tourne quatre fois par jour.

**Ce n'est pas du référencement.** Les liens `web.archive.org` ne transmettent
aucune autorité et ne comptent pas comme signal de classement. Ce n'est pas non
plus ce qui alimente les corpus d'entraînement des modèles : c'est **Common
Crawl**, un organisme distinct, dont le robot `CCBot` est déjà autorisé dans
`robots.txt`. Confondre les deux est l'erreur la plus courante sur le sujet.

**Ce que ça fait vraiment** : les publications étudiantes disparaissent, et pas
toutes au même rythme. Couverture mesurée le 2026-07-26 (pages d'index CDX) :

| Pages | Source | Établissement |
|---|---|---|
| **1** | Exil | Cégep du Vieux Montréal |
| **3** | The Plant | Dawson College |
| **4** | The Campus | Bishop's University |
| **8** | La Pige | Cégep de Jonquière |
| 9 → 38 | L'Exemplaire, Zone Campus, Le Collectif, Le Polyscope, The Tribune, Montréal Campus, Quartier Libre | — |
| 128–129 | The Link, Le Délit | Concordia, McGill |
| **229** | The McGill Daily | McGill |

Écart de **229×**, et les quatre plus menacés sont des cégeps ou de petits
collèges — le profil de rédaction qui s'éteint quand l'équipe finit son DEC.

> Une mesure antérieure laissait croire à un partage binaire « gros = sûr,
> petit = fragile ». Elle était plafonnée par sa propre requête (`limit=20000`)
> et renvoyait la même valeur pour plusieurs sources. Le classement était bon,
> les chiffres non.

**Cas Exil, disparition en cours** : le registre déclare `exilecvm.ca` (3 pages)
alors que les liens d'articles pointent encore vers `exilecvm.wordpress.com`
(1 page). C'est ce dernier domaine que le bot mesure et archive — celui qui
porte le fonds historique sur la plateforme la moins pérenne.

**Ordre de passage** : piloté par la fragilité, pas par la date
(`scripts/archive-priority-lib.js`). 75 % du lot va aux sources les moins
archivées, **25 % sont réservés aux articles les plus récents** toutes sources
confondues — un article publié aujourd'hui est vulnérable avant qu'un passage
spontané ne l'attrape, même chez un journal bien couvert. La réserve est
insérée *dans* le lot et non à sa suite : avec ~190 candidats pour 20 places,
la concaténer en fin de liste l'aurait rendue inatteignable.

**Une mesure en échec n'est jamais de la fragilité.** `montrealcampus.ca` a
d'abord renvoyé une erreur — simple délai dépassé, la source compte 36 pages.
Le bot conserve alors la dernière valeur connue et marque la source
« périmée » ; une source jamais mesurée reste neutre, ni prioritaire ni
pénalisée. Sans cette règle, une panne réseau ferait remonter un journal solide
en tête de file au détriment des vrais fragiles.

Amorçage : `node scripts/archive-articles.js --measure 14` mesure toutes les
sources d'un coup. Sans lui, il faut cinq passes avant que la priorisation ait
de quoi travailler.

**Contraintes mesurées, qui expliquent la conception** : une capture prend ~18 s
et l'API est limitée en débit. D'où un plafond par passe (20), une pause entre
les requêtes, un arrêt net au premier 429, un rafraîchissement de fragilité
limité à 3 sources par passe (TTL 7 jours), et un état persistant
(`archive-status.json`) qui évite de resoumettre pendant 180 jours. Mieux vaut
archiver lentement pour toujours que vite une seule fois.

---

## 7. Suites possibles (non faites)

- **Pages par région** (`/regions/montreal/`, `/regions/estrie/`…) si les
  requêtes géographiques apparaissent dans Search Console.
- **Ouvrir l'annuaire aux établissements sans média recensé** (67 des 79 de
  `institutions.json`) — à ne faire que s'il y a du contenu réel à y mettre,
  sinon ce sont des pages vides qui diluent le domaine.
- **Grille horaire complète** : les 6 stations en ont une (de 20 à 123 créneaux),
  mais `scheduleTable()` en affiche au plus 8 par jour pour rester lisible.
  CJLO et CISM sont donc tronquées. Une page horaire dédiée par station serait
  la bonne réponse si le besoin se confirme.

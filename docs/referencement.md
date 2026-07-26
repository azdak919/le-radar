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

### Pourquoi le prérendu ne casse rien

`loadNews()` (`app.js`) fait `NEWS_LIST.innerHTML = newsSkeleton(6)` **avant**
de charger `news.json`. Le bloc prérendu, placé dans `#news-list` entre les
marqueurs `RADAR:SEO:FEED`, est donc écrasé par le code existant dès que le JS
tourne. **Aucune modification d'`app.js` n'a été nécessaire.**

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

**Ce que ça fait vraiment** : les publications étudiantes disparaissent. Mesuré
le 2026-07-25 — Quartier Libre et Le Collectif dépassent 20 000 captures, mais
Exil (Cégep du Vieux Montréal), tenu sur un blogue gratuit, n'en a que 985.
C'est exactement le profil de journal qui s'éteint quand l'équipe finit son DEC.
Le Radar connaît l'URL de chaque article : les soumettre coûte une requête et
rend ce travail consultable au-delà de la vie de son site.

**Contraintes mesurées, qui expliquent la conception** : une capture prend ~18 s
et l'API est limitée en débit. D'où un plafond par passe (20), une pause entre
les requêtes, un arrêt net au premier 429, et un état persistant
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

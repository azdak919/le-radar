# La revue du matin et La revue du soir

Deux articles originaux par jour, générés à partir des données du site : `news.json` (fil des médias étudiants),
`radio-schedules.json` (grilles des radios étudiantes) et `sports-masthead.json` (résultats et matchs étudiants).
Une revue n’est **pas** une réécriture : des extraits courts, un lien vers chaque original, le média et **tous** les
auteurs crédités. Sport étudiant et médias étudiants seulement, jamais de sport professionnel.

> **Publication publique : désactivée par défaut.** Tant que `data/revue/config.json` contient `"publish": false`,
> le flux de travail ne génère que des exemples (artéfacts) et n’écrit rien sur le site : pas de page `/revue/`,
> rien dans `sitemap.xml`, `feed.xml`, `robots.txt` ni `llms.txt`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `data/revue/config.json` | Interrupteur `publish`, heures des éditions, fenêtres, limites (articles, radio, sport, IA). |
| `scripts/revue/revue-lib.mjs` | Fenêtres horaires (heure de Montréal, DST), sélection des articles, thèmes, radio, sport, garde anti-hallucination, validation. |
| `scripts/revue/revue-ai.mjs` | Résumés d’une phrase et amorce éditoriale par Workers AI (même modèle et mêmes secrets que l’accroche IA de La une). |
| `scripts/revue/revue-render.js` | Page (chrome du site), index des archives, JSON-LD `NewsArticle`, sitemap Google News, entrées RSS. |
| `scripts/revue/revue-run.mjs` | CLI : `--gate`, `--edition`, `--sample --out`, `--refresh`, `--rebuild`. |
| `scripts/revue/revue-sample.sh`, `revue-screenshots.mjs` | Exemples matin + soir, captures (mobile 390 px, ordinateur 1280 px, clair/sombre) et PDF d’impression Letter, Legal, Tabloid, A4, A3 (`captures/impression/`). |
| `revue.css` | Styles de la page (variables du site, mode sombre). Hors coquille du service worker. |
| `.github/workflows/revue.yml` | Cron (7 h et 20 h, heure de Montréal, rafraîchissement à 23 h 35) + lancement manuel. |
| `.github/workflows/revue-preview.yml` | Sur PR : exemple réel avec les données en ligne et l’IA, artéfact `exemple-revue`. |
| `tests/revue.mjs`, `tests/revue-render.spec.mjs` | Génération, garde, JSON-LD, sitemaps, RSS, crons, rendu navigateur. |
| `tests/revue-une-isolation.mjs` | La revue n’entre jamais dans La une ni dans les publications sociales par article. |
| `tests/print-formats.spec.mjs` | Impression Letter, Legal, Tabloid, A4, A3 (portrait) : revue, accueil, fiches d’article. |

## Éditions

- **Matin** (cible 7 h, fenêtre 6 h 45 – 10 h 30) : couvre depuis la revue du soir de la veille (20 h) ;
  résultats de la veille et du jour ; matchs du jour aux trois jours suivants ; émissions de radio 7 h – 17 h.
- **Soir** (cible 20 h, fenêtre 19 h 45 – 22 h 30) : couvre la journée depuis 7 h ; résultats du jour ; matchs du
  soir même qui commencent à 20 h ou plus tard (datés en absolu), puis des trois jours suivants ; émissions 20 h – minuit.
- **Rafraîchissement** (23 h – 23 h 59, cron 23 h 35) : la revue du soir reçoit seulement les nouveaux résultats du
  jour (`dateModified` mis à jour, rien d’autre ne change).
- Les crons GitHub tournent en UTC et peuvent être en retard : plusieurs déclenchements couvrent l’heure normale et
  l’heure avancée ; le `--gate` décide s’il y a une édition due, et une édition déjà publiée n’est jamais refaite.
- **Rien de neuf, rien de publié** : sans nouvel article dans la période (`skipWithoutArticles`), l’édition est
  sautée et notée dans `data/revue/state.json`. `news.json` vieux de plus de 6 h : refus.

## Heures de publication (7 h et 20 h, heure de Montréal)

Choisies d’après les données du site (novembre 2026) et les habitudes de lecture des 18–25 ans :

- **Articles** (`news.json` et archives depuis sept. 2025, 4 494 articles à l’heure fiable ; les horodatages à minuit
  ou à l’heure pile sont exclus) : 24 % sont publiés avant 7 h, avec un pic à 6 h (16 %) porté par The Tribune
  (92 % avant 7 h), Le Collectif (36 %) et Le Délit (23 %). Reculer à 7 h 30 ou 8 h n’ajouterait que 3 à 6 %. Le soir,
  88,8 % des articles du jour sont en ligne à 18 h, 91,5 % à 19 h et 93,5 % à 20 h ; seuls 6,5 % arrivent après 20 h
  (The Campus, Impact Campus, The Link), repris le lendemain matin. La collecte tourne chaque heure à :20 : les
  articles de 6 h sont là à 7 h. Les jours de semaine dominent (lundi 1 116, mardi 1 368 … dimanche 126).
- **Sport** : 92 des 93 matchs de semaine commencent à 18 h ou plus tard (79 à 19 h ou plus tard, 27 à 20 h ou plus
  tard). À 20 h, la revue du soir annonce les matchs de la soirée ; les résultats arrivent vers 21 h – 22 h 30, d’où
  le rafraîchissement à 23 h 35 ; le lendemain, la revue du matin les reprend.
- **Radio** : 15 % des émissions de semaine (52) commencent entre 20 h et minuit ; la revue du soir les liste.
- **Lecture** : chez les 16–24 ans, pics au réveil et en soirée (Reuters Digital News Report ; Pew, nouvelles sur
  téléphone le matin et en fin de journée ; suivi suisse des 18–25 ans, dont 69 % d’étudiants : 18 h – 21 h aussi
  fort que le midi, baisse après 21 h).
- **La une** (réseaux sociaux) part à 7 h 45 et 19 h 30 : pas de collision, et la revue n’y figure jamais (ci-dessous).

Crons (UTC, heure normale et heure avancée) : `2 11,12 * * *` (matin 7 h 02), `37 13,14 * * *` (secours),
`2 0,1 * * *` (soir 20 h 02), `37 1,2 * * *` (secours), `35 3,4 * * *` (rafraîchissement 23 h 35). Le `--gate` choisit
l’édition due ; `tests/revue.mjs` vérifie que crons, `config.json` et fenêtres concordent en janvier et en juillet.

## La revue n’entre jamais dans La une

Les publications sociales « La une » (images du matin et du soir, `scripts/social/une-run.mjs`) lisent `news.json`,
`sports-masthead.json` et `radio-schedules.json`, jamais les fichiers de la revue. Par sécurité, `selectUne` écarte
tout lien `le-radar.ca/revue/…` et `parseFeed` (publications par article : Bluesky, Mastodon, Tumblr, Buffer) retire
les revues de `feed.xml`. `tests/revue-une-isolation.mjs` le garantit (textes, liens, textes alternatifs de tous les
réseaux, flux de travail).

## Lecture et impression

- L’article s’ouvre sur une **amorce** de deux ou trois phrases (articles marquants, puis sport ou radio), sans aucun
  décompte. IA vérifiée (`ledeReject` : médias nommés, aucune formule générique, aucun chiffre ni nom inventé) ou repli
  déterministe rédigé.
- La mention « Revue préparée automatiquement par Le Radar à partir des sources citées… » est une phrase discrète en
  pied d’article.
- Établissement : **sigle seul**, comme dans La une (« UdeS », « ULaval », « Concordia », « Bishop’s ») ; nom français
  seulement s’il n’a pas de sigle (« Cégep de Jonquière »). Jamais « Nom complet (SIGLE) » (`institutionDisplay`, et
  au rendu pour les revues déjà générées).
- Impression de la revue : **un vrai journal**. Manchette (logo du Radar à gauche de LE‑RADAR.ca, devise, filet
  double, ligne de folio : édition, date, heure de publication), article **à la une** (surtitre, grand titre, tous les
  auteurs, photo, résumé) avec l’amorce « Dans cette édition », puis les rubriques en **colonnes séparées par des
  filets** : 2 colonnes en Lettre et A4 (photo à gauche, texte à droite), 3 en Légal, 4 en Tabloïd et A3, où la une
  gagne un **encadré « En bref »** (résultats ou prochains matchs, une régate si l’édition en a une, émissions de
  radio). Texte à empattements justifié avec césure française, grilles de radio en agate, aucun émoji, aucun lien
  « Lire… », aucun élément d’interface ; page nommée `@page revue`, mises en page choisies par `@media print` selon la
  largeur et la hauteur de la page (`revue.css`). La mention automatique reste une phrase discrète en pied.
- Impression (revue, accueil, fiches d’article) : LE‑RADAR.ca et son logo au pied de chaque feuille, intertitres jamais
  seuls en bas de page ou de colonne, cartes et lignes jamais coupées, images bornées dans la page.
  `tests/print-formats.spec.mjs` produit un PDF par format et le vérifie (débordement, pages presque vides, intertitres
  orphelins, pied de page, titres présents, lus colonne par colonne).

## Garde-fous (jamais de revue vide ni inventée)

1. Chaque lien, titre, média et auteur vient des données ; `validateReview` refuse la revue sinon (auteurs égaux à
   ceux du fil, extraits présents dans la source, émissions présentes dans la grille, résultats recalculés depuis le
   bandeau sportif).
2. Texte IA (résumé, chapeau) : rejeté s’il contient un lien, des guillemets, une date relative (« demain »,
   « week-end »…), un chiffre ou un nom propre absent de la source, ou s’il n’est pas en français. Repli : extrait
   court de l’article et amorce déterministe rédigée.
3. IA indisponible (secrets absents, erreur, `REVUE_AI=off`) : gabarit déterministe complet.
4. Avant écriture : tout lien de la page qui ne vient pas du modèle fait échouer l’écriture.

## Activer la publication (décision de Charles)

1. PR qui passe `"publish": true` dans `data/revue/config.json` (CI verte, puis fusion).
2. Le prochain créneau du flux « Revue — matin et soir » écrit `revue/AAAA-MM-JJ-matin|soir/`, l’index
   `revue/`, `sitemap-news.xml`, ajoute la ligne `Sitemap: …/sitemap-news.xml` à `robots.txt`, et les revues entrent
   dans `sitemap.xml`, `feed.xml` (contenu complet, image, catégories) et `llms.txt`. Pages se redéploie seul
   (`pages-deploy.yml` écoute ce flux). Lancement manuel possible : *Actions → Revue — matin et soir → Run workflow*.
3. Vérifier la première page publiée (Rich Results Test pour le JSON-LD, validateur RSS).
4. **Google Search Console** (propriété `le-radar.ca`) : *Sitemaps* → soumettre `https://le-radar.ca/sitemap-news.xml`
   (le `sitemap.xml` est déjà connu) ; *Inspection d’URL* sur une revue pour demander l’indexation si souhaité.
5. **Google News / Publisher Center** : il n’est plus possible d’ajouter une source manuellement ; l’inclusion
   dans Google News est algorithmique (contenu original, dates claires, auteurs, page de politique éditoriale,
   coordonnées). Publisher Center reste facultatif pour gérer l’apparence de la publication (nom, logo, sections) une
   fois que Google la reconnaît. Respecter les règles de contenu de Google News : la mention « préparée
   automatiquement par Le Radar à partir des sources citées » figure en pied de chaque revue.

Désactiver : repasser `"publish": false`. Les pages déjà publiées restent ; `sitemap-news.xml` se vide (48 h).

## Commandes utiles

```bash
node scripts/revue/revue-run.mjs --gate --now 2026-11-17T07:02:00-05:00   # édition due ? (« désactivée » tant que publish = false)
bash scripts/revue/revue-sample.sh /tmp/exemple-revue                       # exemples + captures (sans IA en local)
node scripts/revue/revue-run.mjs --sample --edition soir --day 2026-11-16 --at 20:00 --out /tmp/x
npm run test:revue && npx playwright test tests/revue-render.spec.mjs tests/print-formats.spec.mjs --project=main
PRINT_OUT=/tmp/impression npx playwright test tests/print-formats.spec.mjs --project=main   # garde les PDF
```

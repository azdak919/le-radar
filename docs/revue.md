# La revue du matin et La revue du soir

Deux articles originaux par jour, générés à partir des données du site : `news.json` (fil des médias étudiants),
`radio-schedules.json` (grilles des radios étudiantes) et `sports-masthead.json` (résultats et matchs étudiants).
Une revue n’est **pas** une réécriture : des extraits courts, un lien vers chaque original, le média et **tous** les
auteurs crédités. Sport étudiant et médias étudiants seulement, jamais de sport professionnel.

> **Publication publique : activée le 17 novembre 2026** (décision de Charles). Éditions à 7 h et 19 h 15
> (heure de Montréal), avant La une (7 h 45 et 19 h 30). La revue n’est jamais une carte ni une image de La une, ni une story. Le texte de La une (matin et soir) peut porter, en 2e ligne, le lien daté vers l’édition du jour (`https://le-radar.ca/revue/AAAA-MM-JJ-soir/`) si la page existe déjà.
> Pour désactiver : `"publish": false` dans `data/revue/config.json` (les pages déjà publiées restent).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `data/revue/config.json` | Interrupteur `publish`, heures des éditions, fenêtres, limites (articles, radio, sport, IA). |
| `scripts/revue/revue-lib.mjs` | Fenêtres horaires (heure de Montréal, DST), sélection des articles, thèmes, radio, sport, garde anti-hallucination, validation. |
| `scripts/revue/revue-ai.mjs` | Résumés d’une phrase et amorce éditoriale par Workers AI (même modèle et mêmes secrets que l’accroche IA de La une). |
| `scripts/revue/revue-render.js` | Page (chrome du site), index des archives, JSON-LD `NewsArticle`, sitemap Google News, entrées RSS. |
| `scripts/revue/revue-weather.mjs` | Prévisions ECCC (Datamart MSC, fichiers citypage XML) lues à la production de l’édition. |
| `scripts/revue/revue-games.js` | Sudoku et mots cachés déterministes (graine = date + édition), avec solutions. |
| `scripts/revue/revue-run.mjs` | CLI : `--gate`, `--edition`, `--day`, `--sample --out`, `--refresh`, `--rebuild`, `--sans-meteo`. |
| `scripts/revue/revue-sample.sh`, `revue-screenshots.mjs` | Exemples matin + soir, captures (mobile 390 px, ordinateur 1280 px, clair/sombre) et PDF d’impression Letter, Legal, Tabloid, A4, A3 (`captures/impression/`). |
| `revue.css` | Styles de la page (variables du site, mode sombre). Hors coquille du service worker. |
| `.github/workflows/revue.yml` | Cron (7 h et 19 h 15, heure de Montréal, rafraîchissement à 23 h 35) + lancement manuel. |
| `.github/workflows/revue-preview.yml` | Sur PR : exemple réel avec les données en ligne et l’IA, artéfact `exemple-revue`. |
| `tests/revue.mjs`, `tests/revue-render.spec.mjs` | Génération, garde, JSON-LD, sitemaps, RSS, crons, rendu navigateur. |
| `tests/revue-une-isolation.mjs` | La revue n’est pas un item de La une ni une publication sociale par article ; le lien texte en 2e ligne n’apparaît que si l’édition existe. |
| `tests/print-formats.spec.mjs` | Impression Letter, Legal, Tabloid, A4, A3 (portrait) : revue, accueil, fiches d’article. |

## Éditions

- **Matin** (cible 7 h, fenêtre 6 h 45 – 10 h 30) : couvre depuis la revue du soir de la veille (19 h 15) ;
  résultats de la veille et du jour ; matchs du jour aux trois jours suivants ; émissions de radio 7 h – 17 h.
- **Soir** (cible 19 h 15, fenêtre 19 h – 22 h 30) : couvre la journée depuis 7 h ; résultats du jour ; matchs du
  soir même qui commencent à 19 h 15 ou plus tard (datés en absolu), puis des trois jours suivants ; émissions 19 h 15 – minuit.
- **Rafraîchissement** (23 h – 23 h 59, cron 23 h 35) : la revue du soir reçoit seulement les nouveaux résultats du
  jour (`dateModified` mis à jour, rien d’autre ne change).
- Les crons GitHub tournent en UTC et peuvent être en retard : plusieurs déclenchements couvrent l’heure normale et
  l’heure avancée ; le `--gate` décide s’il y a une édition due, et une édition déjà publiée n’est jamais refaite.
- Les PDF d’impression se génèrent avec l’identifiant complet (`AAAA-MM-JJ-matin|soir`). Un `--id matin` seul faisait
  échouer le job après la génération des pages (18 nov. 2026) et rien n’était commité ; un échec PDF ne bloque plus la publication des pages.
- **Rien de neuf, rien de publié** : sans nouvel article dans la période (`skipWithoutArticles`), l’édition est
  sautée et notée dans `data/revue/state.json`. `news.json` vieux de plus de 6 h : refus.
- **Rattrapage** : lancement manuel avec une date `AAAA-MM-JJ` et l’édition `matin` ou `soir` (exemple décoché).
  L’horloge est celle de l’édition, 7 h ou 19 h 15 (heure de Montréal), même hors de la fenêtre du jour.
  Les articles sont ceux de cette fenêtre (le soir commence à 7 h, il ne reprend pas la nuit du matin).
  L’index `data/revue/index.json` reste trié par date de publication. Le PDF reçoit l’identifiant
  `AAAA-MM-JJ-matin|soir`. Une édition déjà présente n’est pas réécrite (sauf `--refresh`, mise à jour sportive).
  La météo d’une date antérieure à aujourd’hui est omise : le Datamart ne garde que le jour courant, et ce n’est jamais un échec.
  Les crons et le filet après la collecte ignorent cette date.

## Heures de publication (7 h et 19 h 15, heure de Montréal)

Choisies d’après les données du site (novembre 2026) et les habitudes de lecture des 18–25 ans :

- **Articles** (`news.json` et archives depuis sept. 2025, 4 494 articles à l’heure fiable ; les horodatages à minuit
  ou à l’heure pile sont exclus) : 24 % sont publiés avant 7 h, avec un pic à 6 h (16 %) porté par The Tribune
  (92 % avant 7 h), Le Collectif (36 %) et Le Délit (23 %). Reculer à 7 h 30 ou 8 h n’ajouterait que 3 à 6 %. Le soir,
  88,8 % des articles du jour sont en ligne à 18 h, 91,5 % à 19 h et 93,5 % à 20 h ; seuls 6,5 % arrivent après 20 h
  (The Campus, Impact Campus, The Link), repris le lendemain matin. La collecte tourne chaque heure à :20 : les
  articles de 6 h sont là à 7 h. Les jours de semaine dominent (lundi 1 116, mardi 1 368 … dimanche 126).
- **Sport** : 92 des 93 matchs de semaine commencent à 18 h ou plus tard (79 à 19 h ou plus tard, 27 à 20 h ou plus
  tard). À 19 h 15, la revue du soir annonce les matchs qui commencent à cette heure ou plus tard ; les résultats
  arrivent vers 21 h – 22 h 30, d’où le rafraîchissement à 23 h 35 ; le lendemain, la revue du matin les reprend.
- **Radio** : les émissions de semaine à partir de 19 h 15 jusqu’à minuit figurent dans la revue du soir.
- **Lecture** : chez les 16–24 ans, pics au réveil et en soirée (Reuters Digital News Report ; Pew, nouvelles sur
  téléphone le matin et en fin de journée ; suivi suisse des 18–25 ans, dont 69 % d’étudiants : 18 h – 21 h aussi
  fort que le midi, baisse après 21 h).
- **La une** (réseaux sociaux) part à 7 h 45 et 19 h 30. La revue est produite **avant** : matin à 7 h (45 min d’avance, suffisantes pour la génération et le déploiement Pages), soir à 19 h 15 (cron 19 h 02, pour laisser au déploiement le temps d’aboutir avant le cron de La une à 19 h 23). Le lien texte en 2e ligne de La une n’est ajouté que si la page de l’édition est déjà en ligne ; sinon, la ligne reste omise. L’URL est l’adresse longue datée (`https://le-radar.ca/revue/AAAA-MM-JJ-matin|soir/`).

Crons (UTC, heure normale et heure avancée) : `2 11,12 * * *` (matin 7 h 02), `17,32 11,12 * * *` (secours 7 h 17 et 7 h 32),
`37 13,14 * * *` (secours tardif), `2,17,32,47 23,0 * * *` (soir 19 h 02, 17, 32 et 47), `17 1 * * *` et `37 1,2 * * *`
(secours 20 h 17 / 21 h 37), `35 3,4 * * *` (rafraîchissement 23 h 35). Filet : à la fin de la collecte
(« Update Student News »), dont le passage :20 UTC à 19 h 20 heure de Montréal, avant La une (19 h 23).
Les crons GitHub peuvent partir en retard de plusieurs heures ou ne pas aboutir (17 nov. 2026 : 20 h 02 et 20 h 37 n’ont pas eu lieu).
Le `--gate` choisit l’édition due ; `tests/revue.mjs` vérifie que crons, `config.json` et fenêtres concordent en janvier et en juillet.

## La revue n’est pas un item de La une

Les publications sociales « La une » (images du matin et du soir, `scripts/social/une-run.mjs`) lisent `news.json`,
`sports-masthead.json` et `radio-schedules.json`, jamais les fichiers internes de la revue. `selectUne` écarte tout
lien `le-radar.ca/revue/…` (la revue n’est jamais une carte, une image ou un item de La une) et `parseFeed`
(publications par article : Bluesky, Mastodon, Tumblr, Buffer) retire les revues de `feed.xml`.

En revanche, **dans le texte seulement**, si la page publique de l’édition du même créneau existe déjà
(`revue/AAAA-MM-JJ-matin|soir/index.html`), une 2e ligne s’ajoute sous l’accroche, sans couper celle-ci ni les
mentions d’auteurs :

> Consultez notre revue du soir, à imprimer avec sudoku et mots cachés : https://le-radar.ca/revue/AAAA-MM-JJ-soir/

(« du matin » pour le créneau de 7 h 45). Si la page n’existe pas, rien n’est ajouté. Instagram (légende sans lien
cliquable, encore désactivé) n’a pas cette ligne. Si le texte dépasse encore la limite du réseau après les autres
réductions, on retire la ligne plutôt que de couper l’accroche ou les auteurs. Les stories restent désactivées
(`formats.une.story.publish`). `tests/revue-une-isolation.mjs` et `tests/social-une.mjs` le garantissent.

## Lecture et impression

- À l’**écran**, la revue se lit en colonne d’environ 70 caractères. Les photos sont bornées (16:9, hauteur max. 360 px) ; une image de banque n’apparaît qu’en vignette, ou pas du tout. Météo et jeux sont visibles. En tête, un bouton « Télécharger le PDF » propose Lettre, Légal, Tabloïd, A4 et A3 (`lettre.pdf` … et le nom parlant `le-radar-revue-AAAA-MM-JJ-soir-tabloid.pdf`, via l’attribut `download` ; les anciennes URL restent. Générés à la publication par `scripts/revue/revue-pdfs.mjs`). Le bouton se traduit (« Download PDF »). Ces règles d’écran ne changent pas le CSS d’impression ni les PDF déjà produits.
- L’article s’ouvre sur une **amorce** de deux ou trois phrases (articles marquants, puis sport ou radio), sans aucun
  décompte. IA vérifiée (`ledeReject` : médias nommés, aucune formule générique, aucun chiffre ni nom inventé) ou repli
  déterministe rédigé.
- La mention « Revue préparée automatiquement par Le Radar à partir des sources citées… » est une phrase discrète en
  pied d’article.
- Établissement : **sigle seul**, comme dans La une (« UdeS », « ULaval », « Concordia », « Bishop’s ») ; nom français
  seulement s’il n’a pas de sigle (« Cégep de Jonquière »). Jamais « Nom complet (SIGLE) » (`institutionDisplay`, et
  au rendu pour les revues déjà générées). Le **nom du média** prend la couleur de l’établissement (`brand-colors.json`,
  `institution-color-lib.js`, foncée jusqu’à 4,6:1 sur blanc pour rester lisible imprimée) ; le sigle reste en couleur
  normale. Même règle sur les cartes de l’accueil (forme courte : « Université Bishop’s » → « Bishop’s »).
- Impression de la revue : **un vrai journal**. Manchette (logo du Radar à gauche de LE‑RADAR.ca, devise, filet
  double, ligne de folio : édition, date, heure de publication ; dans l’oreille gauche, accent typographique sur « Étudiante »), article **à la une** (surtitre, grand titre, tous les
  auteurs, photo, résumé) avec l’amorce « Dans cette édition », puis les rubriques en **colonnes séparées par des
  filets** : 2 colonnes en Lettre et A4 (photo à gauche, texte à droite), 3 en Légal, 4 en Tabloïd et A3, où la une
  gagne un **encadré « En bref »** (résultats ou prochains matchs, une régate si l’édition en a une, émissions de
  radio). Texte à empattements justifié avec césure française, grilles de radio en agate, aucun lien « Lire… », aucun
  élément d’interface ; page nommée `@page revue`, mises en page choisies par `@media print` selon la
  largeur et la hauteur de la page (`revue.css`). La mention automatique reste une phrase discrète en pied.
- Imprimé seulement, en plus :
  - **émojis en couleur** (rubriques, sports dont ⛵, radio) avec un sous-ensemble de Noto Color Emoji (OFL,
    `assets/revue/noto-color-emoji-revue.woff2`, `NOTO-EMOJI-OFL.txt`), régénéré par
    `scripts/revue/subset-revue-emoji-font.py` (`--check` vérifie que chaque émoji utilisé est couvert) ;
  - **vignettes** des autres articles, comme à l’accueil : photo entière (jamais rognée), crédit discret, images du
    Radar seulement ; petites à droite en Lettre et A4, plus grandes en Légal, Tabloïd et A3 (première photo de chaque
    rubrique pleine colonne) ;
  - **titres cliquables** dans le PDF (vrais `<a href>` vers l’article d’origine, URL jamais affichée) ;
  - **météo** : prévisions publiques d’Environnement et Changement climatique Canada (Datamart MSC, fichiers
    « citypage » XML), lues **au moment de produire l’édition** (`scripts/revue/revue-weather.mjs`, stockées dans le
    modèle `weather`). Petite ligne dans la manchette (Québec et Montréal). Grand bloc en fin d’édition : villes
    universitaires (Québec, Montréal, Sherbrooke, Trois-Rivières, Rimouski, Saguenay, Gatineau, Rouyn-Noranda),
    les 14 villages du Nunavik (Kangiqsualujjuaq, Kuujjuaq, Tasiujaq, Aupaluk, Kangirsuk, Quaqtaq, Kangiqsujuaq,
    Salluit, Ivujivik, Akulivik, Puvirnituq, Inukjuak, Umiujaq, Kuujjuarapik) et Waskaganish (Eeyou Istchee), sous
    leur nom officiel. Codes de site vérifiés dans `site_list_fr.csv` et contrôlés dans chaque fichier. ECCC ne
    publie rien sous Lennoxville, Wendake, Kahnawake, Mashteuiatsh, Uashat mak Mani-utenam, ni sous les autres
    communautés d’Eeyou Istchee (Chisasibi, Wemindji, Eastmain, Nemaska, Waswanipi, Mistissini, Oujé-Bougoumou,
    Whapmagoostui) : absentes plutôt que remplacées par une ville voisine. Aucune donnée → aucun bloc
    (`--sans-meteo` ou `REVUE_WEATHER=0` pour s’en passer) ;
  - **jeux** : sudoku (solution unique) et mots cachés tirés des titres de l’édition, générés de façon déterministe à
    partir de la date et de l’édition (`scripts/revue/revue-games.js`), solutions en petit et à l’envers à la fin ;
  - **colophon** sobre, une seule fois à la fin : logo, « Le Réseau Académique de Découverte et d’Agrégation de
    Ressources », mention d’indépendance, nous joindre (azdak-qc@proton.me), code libre sous GNU GPL v2, lien
    cliquable et **code QR** vers l’édition (Nayuki QR Code generator, MIT, compatible GPL v2, déjà dans
    `scripts/vendor/`), le-radar.ca/revue, phrase sur la préparation automatique, « Conçu avec ♡ par Azdak en 2026 ».
  - Remplissage : météo, jeux, solutions et colophon ferment le flux des colonnes et occupent la fin de la dernière
    page. Le format de papier est choisi à l’impression, donc aucune bibliothèque de pagination ne peut garantir une
    dernière page pleine : elle dépend de la quantité de contenu de l’édition.
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

1. `"publish": true` est en vigueur depuis le 17 novembre 2026. Le menu du site (Accueil, Revue, Médias, …)
   pointe vers `/revue/` en français et « Review » en anglais.
2. Le flux « Revue — matin et soir » écrit `revue/AAAA-MM-JJ-matin|soir/`, l’index
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
node scripts/revue/revue-run.mjs --gate --now 2026-11-17T07:02:00-05:00   # édition due ?
bash scripts/revue/revue-sample.sh /tmp/exemple-revue                       # exemples + captures (sans IA en local)
node scripts/revue/revue-run.mjs --sample --edition soir --day 2026-11-16 --at 19:15 --out /tmp/x
# Rattrapage réel (ne pas lancer sans décision) : matin d’abord, puis le soir.
# gh workflow run revue.yml --ref main -f edition=matin -f sample=false -f day=2026-11-20
# gh workflow run revue.yml --ref main -f edition=soir -f sample=false -f day=2026-11-20
npm run test:revue && npx playwright test tests/revue-render.spec.mjs tests/print-formats.spec.mjs --project=main
PRINT_OUT=/tmp/impression npx playwright test tests/print-formats.spec.mjs --project=main   # garde les PDF
```

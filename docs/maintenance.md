# LE-RADAR — Maintenance automatisée à long terme

**LE-RADAR** — Le Réseau Académique de Découverte et d'Agrégation de Ressources.

Ce document décrit comment le projet se maintient **sans intervention humaine**
dans l'idéal, et ce qui reste volontairement manuel.

> **Agents / sessions courtes** : commencer par [`agent-playbook.md`](agent-playbook.md)
> (banques photo, `bank:sync`, blacklist, non-casse Android/SW, checklist ship).

---

## Philosophie

1. **Données en JSON, pas de base de données** — tout est versionné dans Git.
2. **Bots idempotents** — un run raté ne corrompt rien ; le prochain reprend.
3. **Découverte progressive** — les nouveaux médias passent par `candidates` avant d'être promus.
4. **Rapport de santé** — `bot-status.json` résume l'état après chaque maintenance hebdomadaire.
5. **Alerte humaine rare** — une issue GitHub s'ouvre seulement si le pipeline échoue ou que plusieurs flux meurent.

---

## Publication directe et fenêtre de maintenance

Le flux habituel est le **push direct contrôlé** : les petites corrections ne
mettent pas le site hors ligne. Avant chaque publication, rebaser sur `main`,
vérifier localement les URLs touchées, exécuter `npm run check`, puis pousser
sans jamais utiliser `git push --force` sur `main`. Les bots peuvent committer
entre deux sessions; un push refusé se résout par `git fetch origin && git
rebase origin/main`, jamais par l'écrasement de leur commit.

La maintenance publique est réservée aux changements de risque élevé : service
worker, lecteur, navigation globale, gabarits générés ou migration de données.

### Prérequis d’hébergement

Le DNS de `le-radar.ca` reste chez **WHC**. Les Workers Cloudflare existants,
sur `*.workers.dev`, ne peuvent donc pas intercepter le domaine et ne sont pas
un interrupteur de maintenance. Ne pas documenter ni utiliser une règle
Cloudflare comme si elle protégeait ce site.

Avant la première fenêtre publique, identifier dans WHC l’option de
redirection/maintenance pour le domaine. Elle doit rediriger les routes
publiques vers `https://le-radar.ca/offline.html?maintenance=1` tout en
excluant `/offline.html`, `/assets/offline/*`, `/assets/icon.svg`,
`/assets/icon-32.png`, `/assets/icon-192.png` et `/indigenous-mt.json`. Ces
exclusions évitent une boucle et gardent la page jouable. Si WHC ne fournit pas
cette fonction, **ne pas simuler une maintenance par commit ou JavaScript** :
publier normalement après validation locale et garder cette amélioration pour
une éventuelle migration DNS ultérieure.

### Commandes de contrôle

```bash
npm run maintenance:status
npm run maintenance:release-check

# Après avoir confirmé la redirection publique :
npm run maintenance:bots:pause -- --confirm

# Après Vérification, Pages et retour public vérifiés :
npm run maintenance:bots:resume -- --confirm
```

`maintenance:status` contrôle l’URL publique et l’état des neuf workflows qui
écrivent dans `main`. Il affiche aussi **Vérification** et **Pages**, qui ne
doivent jamais être désactivés. Les commandes de pause/reprise exigent
`--confirm` afin qu’un copier-coller ne coupe pas les bots accidentellement.

### Séquence d’une fenêtre sensible

1. Activer le basculement WHC et exécuter
   `npm run maintenance:status -- --expect maintenance`. Ne suspendre les bots
   qu’après cette preuve publique.
2. Exécuter `npm run maintenance:bots:pause -- --confirm`.
3. Travailler localement; avant le commit, exécuter
   `npm run maintenance:release-check -- --maintenance`, les tests ciblés et
   ouvrir les liens locaux convenus.
4. Rebaser, publier un seul commit, puis attendre Vérification et Pages.
5. Désactiver le basculement WHC, vérifier l’accueil public, puis exécuter
   `npm run maintenance:bots:resume -- --confirm`.

La page de maintenance reste utilisable hors ligne via le cache PWA; elle ne
porte jamais la barre radio.

---

## Fichiers sources de vérité

| Fichier | Rôle | Qui le met à jour |
|---|---|---|
| `institutions.json` | Catalogue cégeps + universités (Wikidata + liste curée) | `update-institutions.js` |
| `news-sources.json` | Registre des journaux (`active` + `candidates`) | `discover-news-sources.js`, `scan-media.js` |
| `news.json` | Fil d'articles agrégé (lu par le site) | `fetch-news.js` |
| `sports.json` | Résultats RSEQ collégial + universitaire QC | `fetch-sports.js` |
| `sports-leagues.json` | Catalogue des ligues (LeagueId S1) | manuel |
| `radios.json` | Radios listées dans le syntoniseur | humain + `discover-streams.js` |
| `radios-candidates.json` | Radios à tester avant promotion | `scan-media.js`, `discover-streams.js` |
| `radio-schedules.seed.json` | Config sources + grilles manuelles | humain + `discover-schedule-sources.js` |
| `radio-schedules.json` | Grilles colligées « à l'antenne » (lu par le site) | `fetch-radio-schedules.js` |
| `radio-nowplaying.json` | En cours + à venir (API live / grille / ICY) | `fetch-radio-nowplaying.js` (+ re-poll navigateur si `clientPoll`) |
| `radio-schedule-drift.json` | Écart grille publiée ↔ page relue à l'instant | `detect-schedule-drift.js` |
| Photos vedette | Source → scrape page → banque libre thématique (+ QC visuelle soft mât) → **campus curaté** (+ merge banque universities) | `ensure-lead-images.js` + `stock-photo-lib.js` + `photo-visual-qc-lib.js` + `campus-photo-bank.js` |
| `data/quebec-backgrounds.json` | Banque **mât** paysages QC (max 50) — jamais le pomo | `maintain-quebec-backgrounds.js --profile masthead` |
| `quebec-backgrounds-data.js` | Export mât paysages (`QUEBEC_BACKGROUNDS`) | idem |
| `data/quebec-university-backgrounds.json` | Banque **mât** campus univ. QC (max 50) — jamais le pomo | `maintain-quebec-backgrounds.js --profile universities` |
| `quebec-university-backgrounds-data.js` | Export mât campus (`QUEBEC_UNIVERSITY_BACKGROUNDS`) | idem |
| `data/quebec-pomo-backgrounds.json` | Banque **pomo** paysages QC (max 50) — jamais le mât | `maintain-quebec-backgrounds.js --profile pomo` |
| `quebec-pomo-backgrounds-data.js` | Export pomo (`QUEBEC_POMO_BACKGROUNDS`) | idem |
| `data/quebec-nations-backgrounds.json` | Banque **Premières Nations & Inuit** (max 50) — **mât + pomo** ; **11 nations QC** | `maintain-quebec-backgrounds.js --profile nations` |
| `quebec-nations-backgrounds-data.js` | Export nations (`QUEBEC_NATIONS_BACKGROUNDS`, champs `nationId` / `nation`) | idem |
| `scripts/quebec-nations-taxonomy.js` | Taxonomie des 11 nations + détection / couverture | bot nations |
| `data/quebec-favorites-backgrounds.json` | **Favorites manuelles** (permanentes = hors purge bots ; l’affichage reste filtré par saison) | signalement manuel / `pin-background.js` |
| `quebec-favorites-backgrounds-data.js` | Export favorites (`QUEBEC_FAVORITES_BACKGROUNDS`) | idem |
| `scripts/quebec-backgrounds-blacklist.js` | **Hard-ban durable** (URL/File/id) — anti-réintroduction | curation manuelle |
| `data/quebec-backgrounds-rejected.json` | Rejets du **labo photo local** (fusionnés à la blacklist) | `npm run lab:photos` |
| `scripts/sync-quebec-backgrounds.js` | Sync offline JSON → JS + purge ban (`npm run bank:sync`) | agent / CI locale |
| `bot-status.json` | Tableau de bord santé des bots | `maintain.js` |

---

## Pipeline (ordre d'exécution)

```
institutions  →  scan-media  →  news-sources  →  streams  →  news  →  bot-status
```

| Étape | Script | Fréquence |
|---|---|---|
| Institutions | `update-institutions.js` | 3×/an (jan/mai/sep) + hebdo |
| Scanner de lacunes | `scan-media.js` | Hebdo |
| Santé + promotion journaux | `discover-news-sources.js` | Hebdo + quotidien via news |
| Flux radio + promotion candidats | `discover-streams.js` | Quotidien + hebdo |
| Agrégation articles | `fetch-news.js` | 7×/jour |
| Résultats sportifs RSEQ | `fetch-sports.js` | **6×/jour + sam/dim 14 h** (`update-sports.yml`) — heures de consultation QC (matin, midi, fin de cours, soirée matchs, post-match, rattrapage) ; source en panne → snapshot précédent conservé |
| Scores **en direct** RSEQ | `fetch-sports.js --live` | **Toutes les 5 min** 12 h–minuit Québec (`update-sports-live.yml`) — ligues avec un match dans la fenêtre seulement ; le mât relit `sports.json` aux 15 s |
| Extrait « à la une » | `enrich-lead-excerpts.js` | 7×/jour (après `fetch-news`) |
| En cours + à venir (API / grille / ICY) | `fetch-radio-nowplaying.js` | Aux 30 min |
| Dérive des grilles (rapport) | `detect-schedule-drift.js` | **Quotidien** (23:10 UTC ≈ 19:10 HAE) |
| Découverte sources horaires | `discover-schedule-sources.js` | **Aux 2 semaines** (avant les horaires) |
| Horaires « à l'antenne » | `fetch-radio-schedules.js` | **Aux 2 semaines** |
| Wallpaper mât paysages | `maintain-quebec-backgrounds.js --profile masthead` | Hebdo ; plafond 50 ; **mât seulement** |
| Wallpaper mât campus univ. | `maintain-quebec-backgrounds.js --profile universities` | Hebdo ; plafond 50 ; **mât seulement** |
| Wallpaper pomo paysages QC | `maintain-quebec-backgrounds.js --profile pomo` | Hebdo ; plafond 50 ; **pomo seulement** |
| Wallpaper nations / Inuit | `maintain-quebec-backgrounds.js --profile nations` | Hebdo ; plafond 50 ; **mât + pomo** (partagée) |
| Rotation / random fonds | `bg-rotation-lib.js` + Worker `workers/bg-rotation` | Client CSPRNG ; entropie edge CF free |
| Nowplaying (re-poll) | `app.js` `clientPoll` + Worker `workers/nowplaying-cache` | Cache JSON/XML ~60 s ; **pas** d’audio |
| **Orchestrateur** | `maintain.js` | **Hebdo (lundi)** |

### Workflows GitHub Actions

- `maintain.yml` — pipeline complet + `bot-status.json` + issue si besoin
- `update-news.yml` — articles frais (8 passes/jour **affichées** toutes les 2 h, 7 h–21 h Québec, calées sur les heures de publication du fil). Le cron part **35 min plus tôt** (retard GitHub 20–40 min + fetch ~10 min). Filet horaire **:20** si la dernière mise à jour a > 75 min. Si le gate `bot-prepush-check` casse (test HTML figé), `news.json` est quand même poussé pour que le fil JS reste à jour. Timeouts durs par source (90 s) et par étape ; concurrency `cancel-in-progress` pour ne pas empiler un job coincé 40 min.
- `update-sports.yml` — scores RSEQ/Spordle/voile : **matin · midi · fin de cours · 20 h · 22 h 30 · minuit+** (UTC mappé sur Amérique/Toronto ±1 h EST/EDT) + **week-end après-midi**. Abort si chute >50 % d’équipes ou majorité de ligues en panne ; sinon préserve le snapshot précédent par ligue. Push avec retry comme les autres bots. `sports.json` est en `paths-ignore` du Vérification (pas de Chromium à chaque refresh).
- `update-streams.yml` — validation des flux (quotidien)
- **Bots SEO/HTML** (news, streams, institutions, schedules, discover, maintain, archives) : étape **`bot-prepush-check.sh`** (`npm run check`) **avant** le commit pour éviter un mail Vérification après coup.
- Playwright CI : **2 retries** + specs mât (météo/sports) en projet serial.
- `update-radio-nowplaying.yml` — titre en ondes via API station / ICY (aux 30 min)
- `update-radio-schedules.yml` — horaires colligés « à l'antenne » (aux 2 semaines)
- `detect-schedule-drift.yml` — écart grille publiée ↔ page du jour (quotidien, en soirée QC)
- `discover-news-sources.yml` — santé des flux RSS (hebdo)
- `update-institutions.yml` — catalogue établissements (3×/an)

Les workflows quotidiens restent pour la fraîcheur ; `maintain.yml` fait la passe
« long terme » (découverte de nouveaux médias, couverture, rapport).

---

## Découverte automatique

### Journaux étudiants

1. `scan-media.js` parcourt les établissements **sans source** dans `institutions.json`.
2. Il cherche des liens « journal / média étudiant » et sonde les flux RSS (`/feed/`, etc.).
3. Les trouvailles vont dans `news-sources.json` → `candidates`.
4. `discover-news-sources.js` promeut les candidats avec un flux **frais** (< 1 an) vers `active`.
5. `fetch-news.js` agrège les `active` vers `news.json`.

### Radios

1. `scan-media.js` repère des liens « radio / FM / écoute » sur les sites d'établissements.
2. Les candidats vont dans `radios-candidates.json`.
3. `discover-streams.js` teste chaque candidat (Icecast, Airtime, scraping).
4. Si un flux **HTTPS valide** est trouvé → promotion automatique vers `radios.json`.

La promotion radio est conservative : pas de flux = le candidat reste en file d'attente.

---

## Protocole : ajouter un journal au fil de LE-RADAR

**Guide détaillé (humains et bots)** : [`docs/adding-news-source.md`](adding-news-source.md)
— éligibilité, découverte RSS vs `html-list`, champs du registre, checklist complète.

Un établissement peut avoir **plusieurs journaux indépendants** (ex. Concordia :
**The Link** et **The Concordian** — deux rédactions, deux flux, deux filtres).
Seuls les **médias étudiants** sont éligibles (pas les portails institutionnels).

### Checklist d'intégration

| Étape | Fichier / commande | Obligatoire |
|-------|-------------------|-------------|
| 1. Registre | `news-sources.json` → `active` : `name`, `institution`, `region`, `type`, `lang`, `url`, `popularity` | oui |
| 2. Site public | champ `site` (réseaux sociaux, découverte) | recommandé |
| 3. Vérification | `node scripts/verify-news-sources.js --name "<journal>"` | oui |
| 4. Agrégation | `node scripts/fetch-news.js --update` | oui |
| 5. Extrait vedette | `node scripts/enrich-lead-excerpts.js --update` | oui (articles `featured` + récents) |
| 6. Images vedette | `node scripts/ensure-lead-images.js --update` | oui (crédits source vérifiés sur la page) |
| 7. Réseaux sociaux | `node scripts/fetch-social.js --update` | optionnel |
| 8. Cache PWA | incrémenter `CACHE_NAME` dans `sw.js` | oui si `app.js` touché |
| 9. Déploiement | `git commit` + `git push` | oui |

### Raccourci script

```bash
node scripts/add-news-source.js \
  --name "The Concordian" \
  --institution "Concordia University" \
  --region "Montréal" --type universite --lang en \
  --url "https://theconcordian.substack.com/feed" \
  --site "https://theconcordian.com/" \
  --popularity 7 \
  --note "Journal indépendant, distinct de The Link" \
  --promote --update
```

### Ce qui est automatique (rien à coder)

- **Filtres UI** : générés depuis `news.json` + métadonnées `news-sources.json`
- **Couleurs** : `brand-colors.json` par **institution** (deux journaux Concordia → même palette)
- **Vue source** : filtre par `name` (chaque journal a sa propre vue magazine)
- **Bots CI** : `discover-news-sources`, `fetch-news`, `enrich-lead-excerpts`, `ensure-lead-images` lisent le registre
- **Texte à la une** : `leadExcerpt` = paragraphe jugé adapté (score : longueur, phrases complètes, ton journalistique ; rejette chapôs, meta éditoriale, navigation). Pas l'extrait RSS tronqué.
- **Auteurs persistants** : l'auteur résolu par `verify-authors` (byline page) est
  reporté d'un run à l'autre (`mergePriorAuthor`) — un re-fetch RSS ne fait plus
  retomber l'article sur « La rédaction ». Chaque page consultée est marquée
  (`authorCheckedAt`) et n'est re-scrapée qu'après 24 h, ce qui laisse le budget
  CI aux nouveaux articles (y compris pour les sources `forcePageAuthor`).
- **Crédits photo** : extraits de la page source ET du `content:encoded` RSS
  (légendes « © Nom » Quartier Libre, « (photo/illustration : X) » L'Exemplaire
  et La Pige, photographe dans le nom de fichier `…photo_Prénom_Nom.jpg` pour
  Le Polyscope). Un crédit trouvé au fetch évite un scrape de page. En dernier
  recours : « Crédit photo : [média] ».

### Cas particuliers

- **Site derrière Cloudflare** (ex. The Concordian) : mettre l’URL officielle dans `url`
  (`https://theconcordian.com/feed/`) et un repli dans `urlFallback` si le bot reçoit HTTP 403.
  Le repli Substack alimente le fil mais ce sont surtout newsletters/podcasts — pas l’équivalent
  complet du site. Si Concordia whitelist le bot, le flux principal prendra le relais automatiquement.
- **Auteur générique** : ajouter le nom du journal dans `GENERIC_AUTHORS` (`fetch-news.js`) si le RSS signe « The Concordian » au lieu d'un humain
- **WordPress vedettes** : champ optionnel `wpFeaturedCategories` (ex. Le Délit → `slider`)
- **Sans flux RSS** (média étudiant) : `fetchMode: "html-list"` + `url` = page de liste.
  Voir `scripts/html-list-fetcher.js`.

---

## Ce qui reste manuel (volontairement)

- **Logos et identité** des nouvelles radios promues automatiquement
- **Proxy Cloudflare** (`PROXY_BASE` dans `app.js`) pour les flux HTTP
- **Candidats de qualité** : ajouter un `site` connu dans `news-sources.json` accélère la découverte
- **Faux positifs** : retirer une entrée `candidates` si le bot se trompe

---

## Commandes utiles

```bash
# Pipeline complet (dry-run)
node scripts/maintain.js

# Pipeline complet + écriture
node scripts/maintain.js --update

# Sans rafraîchir institutions (plus rapide)
node scripts/maintain.js --update --skip-institutions

# Banques fonds QC (offline)
npm run bank:check          # JSON↔JS + hard-ban
npm run bank:sync           # régénère les *-data.js depuis data/*.json
npm run maintain:masthead   # + Commons si ménage de session
npm run maintain:pomo
npm run maintain:universities
npm run maintain:nations

# Étape individuelle
node scripts/scan-media.js --update
node scripts/discover-news-sources.js --update
node scripts/discover-streams.js --update
node scripts/fetch-news.js --update
node scripts/enrich-lead-excerpts.js --update
```

### Garde-fou qualité

Après `npm install` et `npx playwright install chromium`, exécuter :

```bash
npm test
```

Le workflow `verification.yml` applique la même suite aux changements de code. Les
commits limités à des timestamps de fraîcheur sont regroupés : un heartbeat est
conservé au plus toutes les six heures, sans retarder un changement réel de
contenu ou de contrôle qualité.

### Banques photo : deux contrôles, pas un

| Contrôle | Ce qu'il voit | Quand |
|---|---|---|
| `maintain-quebec-backgrounds.js` | **titre**, résolution, ratio | à chaque passe hebdomadaire |
| `audit-quebec-backgrounds.py` | **les pixels** : clochers, objet centré, enseignes concurrentes, ciel, variété horizontale | rapport hebdomadaire, non bloquant |

La distinction est essentielle : le premier ne lit que des métadonnées. **Une
photo d'église intitulée « Vieux-Québec en hiver » lui échappe entièrement.**
Seul l'audit pixel peut l'attraper.

**Panne silencieuse de 2026 (à ne pas reproduire).** L'audit pixel lisait le
miroir généré `quebec-backgrounds-data.js` avec une expression régulière
exigeant `title` immédiatement suivi de `}`. L'ajout de `width` / `height` après
`title` a fait qu'il ne trouvait plus **aucune** entrée : il sortait sur
« Aucune entrée trouvée » et passait pour un contrôle réussi. Il lit désormais
`data/quebec-*.json`, la source de vérité, et **échoue bruyamment** si une
banque est vide. Un test (`tests/bank-hard-audit.mjs`) verrouille les deux
points.

Il n'auditait par ailleurs qu'**une banque sur cinq** ; campus, nations et
favoris n'étaient jamais examinés alors qu'ils alimentent aussi le mât.

**Rapport, pas verdict.** Les seuils sur-déclenchent : mesuré le 2026-07-26,
54 % des paysages, 60 % des nations et 79 % du campus sont rejetés, sur des
banques pourtant curées. Exemple de faux positif : « Bishop's University campus
2011 » est signalé `religious_architecture` pour un clocheton de toit sur un
pavillon académique de 1891. L'étape est donc en `|| true` dans
`scripts/maintain.js` : elle informe, elle ne purge pas. Le calibrage est
consigné en dette **D15**.

**Retirer une photo** passe toujours par `scripts/quebec-backgrounds-blacklist.js`
puis `npm run bank:sync` — jamais par une édition du miroir `*-data.js`, qui est
régénéré. Si `nations`, `pomo` ou `favorites` changent, bumper aussi
`pomo/sw.js`.

**Ce que l'audit ne fait pas** : il ne détecte pas les **visages**. La règle
« pas de personnes reconnaissables », inscrite en tête de chaque banque, reste
une revue humaine.

### Photo vedette d'article : la photo de l'article d'abord

Signalement humain du 2026-08-01 : une critique de récital de piano solo
(The McGill Daily) affichait une photo de **Wonder Woman**. Deux défauts
distincts, corrigés ensemble.

**1. La vraie photo était là et a été rejetée.** Le motif
`Screenshot-\d{4}-\d{2}-\d{2}` de `rejectPathPatterns` visait un doute sur le
nom de fichier, mais chez ce journal c'est le nom d'export de leurs photos de
concert. Les motifs de ce genre passent désormais en `demotePathPatterns`
(`botHints.images`) : la photo est classée **après** toutes les autres de
l'article, jamais disqualifiée. Un rejet dur n'aboutit pas à « pas de photo »,
il aboutit à « photo de banque hors-sujet ».

**2. « Review » servait d'ancrage.** Le scoring de `stock-photo-lib.js` a trois
règles de plus :

- les **étiquettes de genre** (`Review:`, `Opinion –`, `Critique :`…) sont
  retirées du titre et des faux-amis : elles décrivent le format, pas le sujet ;
- les majuscules de **début de phrase** ne comptent plus comme noms propres —
  elles saturaient la liste des mots importants (« Seated », « Throughout »)
  et y faisaient entrer « Wonder » (Stevie Wonder) pendant que « piano » en
  était chassé ;
- sur un titre riche (≥ 3 mots de sujet), il faut **deux mots d'ancrage
  distincts**, pas un seul : un mot en commun est une coïncidence de
  vocabulaire.

**3. Le recoupement de mots ne suffit jamais à lui seul.** Première passe après
correctif : 21 photos libres retenues → 8. Mais les 8 contenaient encore trois
collisions de vocabulaire pures — « Step outside… and change your life » → un
parc de Virginie nommé « Step outside Grayson Highlands » ; « How can I show
you I'm doing better » → « Better Together campaign tent at the Unst Show » ;
« Second-Class Citizens » → « Sgt. 1st **Class** Lindlay Johnson ». Deux mots
d'ancrage n'y changent rien : ce sont deux coïncidences.

Trois pistes ont été mesurées avant d'en retenir une :

| Piste | Verdict |
|---|---|
| Rareté lexicale calculée sur notre propre corpus | **Non** — 185 articles, aucune séparation : `piano` et `step` ont tous deux df=1 |
| Exiger un nom propre dans l'article | **Non** — la casse des titres anglais fait de « Gothic Cinema Rises » trois noms propres |
| Exiger une **branche thématique** + une photo qui répond à la scène demandée | **Oui** — sépare proprement sur tout l'échantillon |

D'où les deux garde-fous en place :

- `hasNamedVisualSubject` — sans branche reconnue (musique, cyclisme, climat,
  Assemblée nationale, sport, mobilisation, personnalité nommée…), **on
  n'interroge pas la banque libre du tout**. Un essai personnel reçoit la photo
  de campus curatée, qui est faite pour ça.
- `matchesRequestedScene` — la photo retenue doit partager un mot avec la
  **scène demandée** (« jazz pianist grand piano », « women rights
  demonstration »), pas seulement avec le titre. C'est ce qui distingue une
  réponse d'un écho.

Résultat sur le même fil : **7 photos libres, toutes sur le sujet** (diagramme
El Niño, scène de festival, Hôtel du Parlement, Masters de golf, hockey
universitaire, atelier Wikipédia au Cégep du Vieux-Montréal, portrait de
François Legault).

**Pour donner droit à la banque libre à un nouveau sujet, on lui écrit une
branche** : une scène décrite (`topicBranchQueries`), pas des mots-clés
recyclés. C'est un geste éditorial, relisible en revue.

**Pertes assumées**, toutes rattrapées par la banque campus : « Calamine en
concert » et « Katseye at Wango Tango » (le seul mot commun était le nom de
l'artiste, sans branche pour le porter) et « Purple circle » (titre et photo
identiques, mais aucune scène demandée).

---

## Horaires « à l'antenne »

Le bandeau **À l'antenne** affiche l'émission en cours selon l'heure (fuseau
`America/Toronto`), en complément du titre ICY live. La grille est colligée de
deux façons, fusionnées par `fetch-radio-schedules.js` :

1. **Sources dynamiques** déclarées dans `radio-schedules.seed.json`
   (`sources`), via les adaptateurs de `radio-schedule-lib.js` :

   | `type` | Source | Postes |
   |---|---|---|
   | `airtime` | API Airtime/LibreTime `/api/week-info` | CKUT |
   | `chyz` | HTML `chyz.ca/horaire` (thème maison, marqueur « en direct ») | CHYZ |
   | `cfak` | HTML `cfak.ca/programmation` (cartes par jour) | CFAK |
   | `jsonld` | Données structurées schema.org (`BroadcastEvent`/`Event`) | générique |
   | `spinitron` | API Spinitron `/api/shows` (jeton requis) | générique |

   Pour brancher un nouveau poste : ajouter un adaptateur (ou réutiliser
   `jsonld`/`spinitron`), puis le déclarer dans `ADAPTERS`.
2. **Grilles manuelles** : remplir le tableau `grid` du poste dans le seed.

### Découverte automatique des sources

`discover-schedule-sources.js` automatise la recherche et l'entretien des
sources. Pour chaque poste, il :

- **revalide** les sources déjà déclarées (et retire celles qui ne répondent plus) ;
- **sonde** des sources potentielles : Airtime déduit du flux, JSON-LD et
  adaptateur dédié testés sur les chemins d'horaire usuels (`/horaire/`,
  `/grille-horaire/`, `/programmation/`, `/schedule/`, …) ;
- **détecte** les plateformes connues (Spinitron) à brancher manuellement ;
- **rapporte** la santé : sources trouvées, perdues, postes sans horaire.

Avec `--update`, il réécrit les `sources` du seed (grilles manuelles et notes
préservées). Il tourne en CI juste **avant** `fetch-radio-schedules.js`.

```jsonc
// radio-schedules.seed.json
"chyz": {
  "sources": [],
  "grid": [
    { "day": 1, "start": "07:00", "end": "09:00", "title": "Le Réveil", "host": "…" }
  ]
}
```

- `day` : 0 = dimanche … 6 = samedi.
- `start`/`end` : `"HH:MM"` 24 h ; une fin ≤ au début traverse minuit.
- Si toutes les sources sont injoignables un cycle, la dernière grille connue
  de `radio-schedules.json` est conservée.

Régénérer : `node scripts/fetch-radio-schedules.js --update`. En CI, le workflow
`update-radio-schedules.yml` tourne **aux 2 semaines** (les horaires bougent
rarement, inutile de solliciter les sources plus souvent).

### Émissions spéciales / hors programmation

Une grille hebdomadaire ne peut pas décrire un soir de match. CHYZ réécrit sa
page **le jour même** : les *Capitales de Québec* passent de 18:50 à 16:50 et
l'émission régulière du créneau disparaît. Une collecte vieille de quinze jours
annonçait donc « À venir · Capitales de Québec · 18:50 » pendant que le match
jouait depuis 16:50.

#### Corriger — adaptateur `schedule-live` (aux 30 min)

Tout poste **sans API live** relit sa page horaire à chaque passe du bot
now-playing et en tire l'antenne du moment. Aucun code par station : le poste
en bénéficie dès qu'il a une source dans le seed, **ceux à venir compris**.
Aujourd'hui : CHYZ, CJLO, CFAK.

Deux qualités de réponse, distinguées par leur `source` :

| `source` | Ce que c'est | Rang |
|---|---|---|
| `api-live` | la station **désigne** le bloc à l'antenne (CHYZ marque « en direct ») | 4 |
| `schedule-live` | résolution horaire sur la grille **du jour** | 3 |
| `schedule` | notre instantané colligé, jusqu'à deux semaines d'âge | 2 |
| `stream` | métadonnées ICY (souvent le morceau) | 1 |

Le marqueur `en direct` n'est suivi que s'il couvre encore l'instant présent
(la page peut sortir d'un cache). Un bloc absent de la grille publiée ressort
`"special": true` dans `radio-nowplaying.json`.

Le marqueur `live` traverse `normalizeSlot` — le now-playing en a besoin — mais
`stripTransientFlags` l'ôte avant écriture dans `radio-schedules.json` : publié
dans un fichier relu pendant deux semaines, il désignerait une émission finie
depuis longtemps comme étant à l'antenne.

**Veto du direct** : rien ne peut commencer avant la fin de ce qui joue. Un
`current` de rang ≥ 3 écarte tout « à venir » qu'il recouvre, côté bot
(`mergeOnAirResults`) comme côté site (`authoritativeAirLeftMin` dans `app.js`,
qui tient entre deux passes du bot). La grille embarquée n'obtient jamais ce
veto — elle ne peut pas se corriger elle-même ; la même page relue à l'instant,
si.

#### Surveiller — `detect-schedule-drift.js` (quotidien)

Compare la grille publiée à la grille relue à l'instant, pour chaque poste du
seed, et écrit `radio-schedule-drift.json`. Il **ne corrige rien** — l'affichage
est déjà rattrapé par `schedule-live` — il rend le phénomène visible : sans lui,
une station qui sort de sa grille reste un angle mort, et c'est exactement ainsi
que le cas CHYZ a été découvert, sur une capture d'écran.

| Statut | Sens | Geste |
|---|---|---|
| `stable` | grille identique | — |
| `drift` | quelques créneaux bougent → hors programmation | rien, `schedule-live` rattrape |
| `overhaul` | grille refaite (rentrée) | `fetch-radio-schedules.js --update` |
| `unreachable` | source muette | vérifier le parseur / le site |

Le partage `drift` / `overhaul` exige **deux** signaux : au moins 40 % de la
grille **et** au moins 8 créneaux. La proportion seule ment sur les petites
grilles — CHYZ publie 25 créneaux, CHOQ 22, et un seul soir de match y pèse
déjà plus de 40 %. Les écarts remontent dans `bot-status.json`
(`schedule_drift` info, `schedule_overhaul` et `schedule_source_down` warn).

Une grille fraîche **vide** n'est jamais lue comme « la station a tout
changé » : c'est `unreachable`, et rien n'est imputé à la station.

---

## Reprise après une longue pause

Si personne ne touche au repo pendant des mois :

1. Les **Actions planifiées** reprennent au prochain cron (gratuit sur GitHub public).
2. Les flux `dead` sont **conservés** (rentrée scolaire) mais ignorés par l'agrégateur.
3. `scan-media.js` rattrape les **établissements non couverts** par lots de 8/semaine.
4. `bot-status.json` indique les lacunes et alertes.

Aucune dépendance externe payante. Node 20 + `https` natif seulement.

---

## Règle d'or

> **Les humains curatent la qualité ; les bots curatent la fraîcheur et la couverture.**

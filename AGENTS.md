# AGENTS — lire avant de vibe-coder

> **Avertissement pour tout agent IA (Grok, Claude, Cursor, etc.)**  
> Ce dépôt a une **dette technique volontaire** et un **backlog d’amélioration**.  
> Ce n’est pas du travail oublié : c’est un **ledger** qu’on solde **à un rythme raisonnable**,  
> surtout quand les modèles et outils auront **suffisamment progressé**.  
> Traiter ce fichier comme une **vérification périodique** (comme une validation de chaîne) :  
> on ne rejoue pas tout l’historique à chaque commit, on **ajoute un bloc** de progrès sûr.

| Doc | Rôle |
|-----|------|
| **`AGENTS.md`** (ici) | Dettes, rythme, économie de tokens long terme |
| [`docs/agent-playbook.md`](docs/agent-playbook.md) | Architecture, banques photo, commandes, non-casse |
| [`docs/maintenance.md`](docs/maintenance.md) | Bots, CI, pipeline éditorial |

---


## ⛔ RÈGLE DURE — branche + tests avant `main`

Voir la source de vérité multi-outils :
[`../GIT-AND-TEST-SAFETY.md`](../GIT-AND-TEST-SAFETY.md) (depuis un dépôt sous `VisualCode/`)
ou `VisualCode/GIT-AND-TEST-SAFETY.md`.

**Interdit** : commit/push non testé sur `main`.  
**Obligatoire** :
1. Baseline locale sur `main` **avant** de créer la branche (repro / smoke).
2. Branche → **vérif locale** (tests + preview UI) verts → push → **PR**.
3. **Lien PR cliquable** dans la réponse (l’humain regarde, puis dit **merge and delete**).
4. Merger **seulement** sur cet ordre, après checks CI verts + `--delete-branch`.

**Push ≠ livré.** Ne pas merger tout seul.  
**LE-RADAR UI/CSS** : `npm run check` + Playwright (au minimum mât/smoke) avant push.

## 1. Économie composée de tokens (long terme)

Chaque session qui **re-explore** monolithes et règles déjà documentées **brûle des tokens sans intérêt**.

Chaque session qui :

1. lit **ce fichier + le playbook** (capital fixe, bas coût),
2. fait **un seul maillon** du backlog (ou le ticket demandé),
3. **met à jour le ledger** (statut / date / note),

…produit un **intérêt composé** : la prochaine session part plus haut, avec moins de cartographie.

```
Session n     : lire ledger + playbook  →  petit progrès sûr  →  noter
Session n+1   : lire ledger à jour      →  suite logique      →  noter
…
Session n+k   : dette résolue           →  moins de re-travail éternel
```

**Anti-pattern :** « tant qu’on y est, refondons `app.js` + re-seed 50 photos + CI lourde ».  
→ Ça casse l’UX, brûle le budget, et **détruit** l’intérêt composé.

---

## 2. Vérification type « blockchain » (rythme)

Pas une blockchain réelle — une **discipline** :

| Règle | Détail |
|-------|--------|
| **Un bloc à la fois** | 1 dette (ou 1 slice clairement bornée) par session « backlog » |
| **Preuve de travail légère** | `npm run check` / `bank:check` / tests ciblés avant commit |
| **Chaîne append-only** | Dettes résolues → §4 ; ne pas effacer l’historique |
| **Consensus humain** | Toujours attendre OK avant de commencer une dette |
| **Validité du bloc** | Commit lisible seul ; pas de régression volontaire |

### 2b. Balises anti-glouton (lis-moi si tu dis « oui » à tout)

L’humain a tendance à dire **oui** à chaque proposition. Les agents **doivent** appliquer ces freins :

| Balise | Règle dure |
|--------|------------|
| **MAX 1 dette / session de chat** | Après une dette **soldée**, `npm run agents:propose` → **STOP**. Ne pas enchaîner D5 puis D3 puis D1. |
| **Objectif : 1 dette / session de maintenance** | Une fois le ticket métier livré et le worktree propre, choisir **une** dette mûre, la solder puis STOP. Ce n’est pas exigible pour une question, une urgence, un WIP ou une dette sans précondition satisfaite. |
| **MAX 2 dettes / jour calendaire** | Même sur plusieurs sessions le même jour. |
| **« Continue » ≠ carte blanche** | = finir le **ticket en cours** ou la **dette déjà acceptée**, pas « tout le ledger ». |
| **Effort L** | Deux OK explicites séparés avant de commencer. |
| **Ticket métier d’abord** | Si l’humain a un bug/feature, **zéro** dette ledger tant que ce n’est pas livré. |
| **Ajouter une ligne au ledger** | Seulement si le même problème revient **2×** dans des sessions distinctes, ou l’humain le demande. **Jamais** inventer une dette pour prolonger la session. |
| **Auto-nourriture magique** | **Non** (pas de lecture du chat). |
| **Récolte vibe (git)** | **Oui** : `npm run agents:harvest` détecte un vibe intense via commits + fichiers touchés → **candidats** §3c (pas des D# tant que non promus). |

Commandes :

```bash
npm run agents:harvest           # détecte vibe intense (git) → candidats
npm run agents:harvest:write     # écrit §3c dans AGENTS.md
npm run agents:propose           # propose 1 dette D# OU STOP quota
npm run agents:review-session    # dit si c'est le bon moment de proposer une dette
npm run agents:record-sold -- D5 # après avoir soldé D5
npm run agents:reset-session     # nouveau chat (pas pour contourner le jour)
```

**Chaîne fin de session intensive :**

```text
ticket OK → agents:harvest[:write] → montrer candidats → (option promote 1 D#)
         → agents:propose → OK? → 1 dette max → record-sold → STOP
```

**Moment d’intégration :** ne pas ouvrir une dette au démarrage ni au milieu d’un
WIP. À la fin d’un ticket de maintenance, après les checks et un worktree propre,
exécuter `npm run agents:review-session`. Le script attend si le WIP existe,
confirme si la dette unique de la session est déjà soldée, sinon propose le plus
petit bloc `ready`, puis le plus petit effort. Si aucun bloc ne satisfait ses
préconditions, noter le report plutôt que créer une dette artificielle.

---

## 2c. WIP non commité (reprise après coupure de session)

> Section **vide** tant qu’aucun ticket n’est en cours hors Git.
> Quand un travail est interrompu : lister ici fichiers + reste à faire, puis **retirer** dès commit ou abandon.

*(Aucun WIP hors ledger — 2026-07-30. L’ancien WIP « SFX offline.html » est livré sur main : `assets/offline/sounds/*`, `loadSfx`/`playSfx` dans `offline.html`.)*

---

## 3. Ledger — dettes ouvertes (volontaires)

Mettre à jour ce tableau quand tu touches une ligne.  
Statuts : `open` · `ready` (tech/tests OK pour tenter) · `blocked` · `wontfix` (décision).

| ID | Dette | Pourquoi c’est volontaire | Signaux « tech assez mûre » | Effort | Statut |
|----|--------|---------------------------|------------------------------|--------|--------|
| D1 | **CI lourde** sur `scripts/audit-quebec-backgrounds.py` (téléchargement images) | Réseau flaky, rate-limit Commons, lourd pour chaque PR | Job **manuel/hebdo** + cache ; pas sur chaque push | M | resolved |
| D2 | **Découpe** `app.js` / `style.css` en modules | Risque régression UX (tuner, mât, thèmes) ; gain surtout agent | Scripts `radar-*` + feuilles par surface, sans bundler ; smoke Playwright | L | resolved |
| D3 | **Re-seed bulk** Commons pour trous de banques | 429, qualité inégale, risque de réintroduire religieux/façades | Seeds **ciblés** 1–3 lieux + `bank:check` + audit offline d’abord | M | open |
| D4 | **Skills Grok hors repo** (`~/.grok/skills/`) | Double source d’obsolescence ; le playbook **est** le skill du dépôt | Seulement si multi-projets perso — **ne pas** dupliquer les règles LE-RADAR | S | wontfix |
| D5 | **Durcir audit clocher / façades** (aligner Python ↔ JS runtime) | Déjà blacklist + town hall paysage ; le reste est peaufinage | Cas réels en banque ou faux négatifs documentés | S–M | resolved |
| D6 | **CI audit HARD offline-only** sur banques (sans fetch) | Éviter de re-découvrir en prod sans taxer chaque PR | `bank:check` + tests unit déjà là — étendre si gaps | S | resolved |
| D7 | **Banque photo mât mobile dédiée** (option 3) | Coût double (JSON+JS+maintain+saisons+HARD) ; le fix 2026-07 (dims banque + thumb) peut suffire | Mât encore noir / crops illisibles **après** fix mobile ; flags `surfaces` (opt. 2) déjà essayés ou insuffisants | L | open |
| D8 | **Détection d’arche/silhouette dans `computeBestFocalY`** (crop mât) | Le détecteur actuel vise le « trou » (Rocher Percé) ; élargir touche **tous** les crops auto — override `focalY` en banque suffit au cas par cas | 2–3 photos réelles où l’ancre arche rate, avec focalY auto vs override notés ; harnais de rendu multi-AR pour non-régression | S–M | resolved |
| D9 | **Tests navigateur instables** (`player-continuity`, attentes réseau) | Le syntoniseur garde des connexions ouvertes en permanence et l’audio headless n’est pas déterministe : rendre ces tests fiables demande de réécrire les attentes, pas de rallonger les délais | Un run vert 10× d’affilée en local **et** en CI après passage à des attentes sur l’état observable ; aucun flake sur 2 semaines | S–M | open (avancée 2026-07-30 : projet `serial-sensitive`, `data-radar-buffering`, équilibre magazine stable — reste preuve 10×/2 sem. CI) |
| D10 | **Connaissance des établissements éclatée en 4 tables** | Chaque copie répond à un besoin distinct (affichage court, libellés RSS, localisation, pages d’entités) ; les unifier touche 4 zones d’un coup, dont le monolithe `app.js` | Une divergence réelle qui casse quelque chose — le doublon « College » du 2026-07-25 en est une ; commencer par la table de traduction, la plus autonome | M | resolved |
| D11 | **Déclaration du site aux consoles de recherche** (Search Console, Bing, IndexNow) | Aucun agent ne peut le faire : ça demande les comptes Google / Microsoft / Cloudflare de l’humain. Le travail technique est livré et en ligne ; il ne reste que les clics | Rien à attendre — à faire dès que possible : sans soumission du sitemap, les 71 URL neuves mettent bien plus longtemps à être découvertes | S | blocked |
| D12 | **Cohérence fil ↔ RSS ↔ JSON-LD non garantie** | Trois générateurs écrits pour des besoins distincts ; les coupler figerait des formats encore mouvants | Test des dix premières manchettes des quatre sorties dans `npm run test:unit` | S | resolved |
| D13 | **Contraste `--muted` en thème clair + focus invisible du menu de langue** | `--muted` est un jeton global : l’assombrir touche tout le site clair d’un coup et impose une relecture visuelle complète | Captures avant/après sur accueil, fiche journal et annuaire, en clair **et** en sombre ; le thème sombre est déjà conforme et ne doit pas régresser | S–M | resolved |
| D14 | **CSP trop large** sur `frame-src` et `connect-src` | Le site consomme des tiers énumérables mais nombreux (YouTube, umami, workers, météo, moteurs de traduction) ; resserrer d’un coup casse en production, pas en test | Resserrer **une directive à la fois**, en commençant par `frame-src`, avec vérification du syntoniseur et de l’intégration YouTube | S par étape | resolved |
| D15 | **Calibrage des seuils de l’audit pixel** (banques photo) | Les seuils ont été réglés sur un autre corpus ; les rebaisser à l’aveugle laisserait passer ce qu’on cherche justement à bloquer | Un lot de photos **étiquetées à la main** (garder / rejeter) servant de référence, pour régler les seuils sur des cas jugés plutôt que sur une intuition | M | open |
| D16 | **Provenance des slogans et descriptions des radios** | Les champs éditoriaux de `radios.json` mélangent slogan officiel, description et formulations historiques ; une page peut donc être exacte sur le fond mais erronée comme citation de marque | Registre par station : URL officielle, extrait, date de vérification, niveau de confiance ; toute formulation non confirmée devient une description neutre | S | resolved |
| D17 | **Contrat du lecteur natif sur toutes les routes publiques** | Le lecteur est maintenant natif sur les fiches SEO et le RSS, mais l’intégration mêle génération HTML, scripts dynamiques et shell de continuité ; une route peut afficher le bandeau sans initialiser le lecteur, ou inversement | Matrice testée accueil/RSS/SEO/annuaire/maintenance/Pomo/Solitaire, en navigation avec lecture ; zéro iframe hors exceptions explicites et zéro erreur console | M | resolved |
| D18 | **Régression visuelle du chrome partagé** (footer, thème, grilles) | Les tests structurels ont laissé passer des écarts visibles : footer non conforme, note collée à une carte, slogan mal placé. Le rendu partagé a besoin d’une preuve visuelle, pas seulement de présence HTML | Captures de référence clair/sombre pour accueil, RSS, fiche radio, fiche journal et maintenance ; test visuel ciblé ou revue humaine consignée avant toute propagation globale | M | resolved |
| D19 | **Mesure de l’échantillon SEO historique** | Le catalogue `/archives/` est public mais expérimental : augmenter son volume sans impressions, clics et anomalies de canonique créerait des pages de faible valeur | 4–6 semaines de Search Console/Bing : couverture, canonicals, impressions/clics et absence de pages exclues inattendues ; revue humaine avant tout passage à `full` | S | ready |
| D20 | **Rétro-crawl historique à mesurer avant élargissement** | La collecte est désormais bornée (3 sources × 4 pages, fenêtre de 3 ans), sans corps ni images, mais les API publiques et la valeur réelle des archives varient selon les médias | Après 4–6 semaines : taux de liens vérifiés, erreurs API, indexation 0–12 mois, clics et absence de réintégration au fil ; seulement alors augmenter les plafonds ou activer de nouvelles stratégies de liste | S | ready |
| D21 | **Solitaire hors ligne** : intercept `SHARED_PATHS` des assets racine déjà précachés | `solitaire/sw.js` met en cache `photo-bank-data.js`, fonds QC, `install-chrome.css`, `fullscreen-wallpaper-qc.js`, mais le `fetch` n’écoute que `/solitaire/` + le menu de langue — hors ligne ces URLs vont au réseau (même trou que Pomo avant le correctif catalogue météo) | Copier le `SHARED_PATHS` de `pomo/sw.js` ; test d’intégrité ; bump `solitaire-shell-vN` | S | ready |
| D22 | **Module de traduction** : plus rapide, moins d’hallucinations chrome | `translate.js` = gtx sans clé + MyMemory ; un nœud isolé « match » (pastille CTA en 2 lignes) devient « correspondre » ; ouvrir CONCURRENCY / MAX_CHUNK sans mesure casse l’ordre et les langues autochtones | Glossaire + `notranslate` ciblé sur le chrome sport/radio (cas collé : **PROCHAIN CORRESPONDRE**) ; fixtures de libellés UI ; mesurer cache/temps avant de toucher les quotas ; pas de nouveau moteur sans bake-off | M | open |

**D21 — Solitaire, même trou que Pomo (2026-08-26).**

Le précache ne sert pas si le worker ne répond pas aux requêtes hors `/solitaire/`. Pomo a le motif (`SHARED_PATHS` dérivé des `../` de `SHELL_ASSETS`). Solitaire est encore sur `sharedTranslationAsset` (menu de langue seulement). Ne pas en profiter pour gonfler le shell (analytics, tuner-embed, emojis) : intercept de ce qui est **déjà** dans `SHELL_ASSETS`.

**D22 — « PROCHAIN CORRESPONDRE » (capture 2026-08-26).**

- Pastille CTA jaune, deux lignes : `fillSportsCtaTagCopy` écrit « Prochain » + « match » ; `text-transform: uppercase`.
- `applySportsCtaState` **retire** `notranslate` hors état idle (le logo LE-RADAR reste protégé, pas le chrome sport).
- gtx traduit *match* comme le verbe *to match* → *correspondre*. Le glossaire radio (`EN ONDES` / `À l'antenne`, cache-v8) n’a pas d’entrée sport.
- Ne pas solder en marquant toute la carte CTA `notranslate` : les accroches « reçoit / chez » doivent rester traduisibles. Cibler la pastille, le glossaire « match » (sport), et les codes équipe (déjà protégés).
- Vitesse : `CONCURRENCY = 6`, `MAX_CHUNK = 450`, observer de mutations. Mesurer le temps jusqu’au chrome traduit **avant** d’ouvrir le robinet.

**D7 — précisions (option 3, pas 1 ni 2) :**

- **Option 1** (préférée) : une banque + pipeline d’affichage — déjà en cours.
- **Option 2** (intermédiaire) : flags par photo (`surfaces` / `mobilePrefer`) dans la **même** banque.
- **Option 3 = D7** : vraie banque séparée `data/quebec-mobile-backgrounds.json` (+ JS, profil maintain, pick viewport mobile).
- **Règles obligatoires** si on ouvre D7 : mêmes HARD (blacklist, religieux, town hall, dims, scènes), mêmes saisons 4/6, `bank:sync` / `audit:banks:hard`, pas de contournement.
- Ne pas démarrer D7 tant que le mât mobile n’a pas été revalidé post-fix « low_resolution / thumb ».

**D8 — diagnostic (cas Mercier, 2026-07-25) :**

- Symptôme : `Mercier Bridge, Lasalle side` (banque `nations`), crop auto **0.26–0.28** sur bandeau large
  → l’arche du pont est coupée en bureau, alors qu’elle passe en mobile (bande visible ~62 % de l’image).
- `computeBestFocalY()` a **déjà** une ancre arche (`hasStrongArch` / `archPeakY`, `idealRel = 0.5`,
  `quebec-backgrounds.js:1060`) — elle n’a pas mordu ici.
- Cause probable : `rowArch` (`quebec-backgrounds.js:543`) cherche un **trou** — flancs sombres encadrant
  un centre clair — taillé pour le Rocher Percé et les arches côtières. Ici l’arche est un treillis d’acier
  ajouré et lointain sur ciel clair : le pic de `archSmooth` part vraisemblablement sur la trouée d’eau
  entre les deux tabliers, plus bas dans le cadre, et le seuil `archPeakScore > 0.015` ne qualifie pas
  la vraie arche.
- Piste : ajouter un critère de **silhouette** (arc convexe sombre contre ciel homogène) **en plus** du
  critère de trou — ne pas remplacer, sous peine de casser les crops Percé/côtiers.
- Contournement en place (pas une dette bloquante) : override `focalY: 0.19` + `note` sur l’entrée
  `data/quebec-nations-backgrounds.json`. Le même mécanisme sert déjà pour le tipi Gesgapegiag (0.28).
- **Avant de solder** : rendre la photo à AR 14 / 10.7 / 7.57 / 3.8 / 2.16 avant/après, et vérifier
  qu’aucun crop existant à override ne régresse (`rowArch` sert aussi au bonus de score, pas qu’à l’ancre).

**D9 — avancée du 2026-07-30 (suite 2026-07-26).**

- `document.documentElement.dataset.radarBuffering` publié dans `updatePlayUI` ;
  tests player-continuity attendent aria-label + `data-radar-buffering`, pas
  seulement la classe CSS.
- `playwright.config.mjs` : projet `serial-sensitive` (player-continuity,
  masthead-weather, seo-pages) hors du lot parallèle `main`.
- `player-continuity` : `test.describe.configure({ mode: 'serial' })` +
  `afterEach` qui purge les clés `radar-*` du localStorage.
- Équilibre magazine vue source : early-exit si gap déjà ≤ `AVG_BRIEF_CARD_H` ;
  trim ne détruit plus un bon collège pour un overshoot plus petit que le trou
  créé ; photo une plafonnée (`max-height: min(42vh, 320px)` 16:9) ; crédit
  n’annule plus le cadre 16:9 de l’image.
- Preuve locale : suite Playwright **81/81** verts (un run complet). Critère
  de sortie inchangé (10× + 2 sem. CI) — **non soldée**.

**D9 — avancée du 2026-07-26 (attentes réécrites, dette non soldée).**

`Vérification` échouait sur chaque push. Deux attentes ont été réécrites vers l’état observable,
conformément à la consigne de la dette — **aucun délai n’a été rallongé** :

- `player-continuity.spec.mjs` : `tuner.locator('html').evaluate(...)` puis
  `document.querySelector('#radar-player')` renvoyait `null`. L’iframe `#radar-embed` démarre sur
  `about:blank` et `pomo/js/app.js` ne pose son `src` que dans un
  `requestIdleCallback(loadTuner, { timeout: 900 })` ; `locator('html')` se résolvait donc aussitôt
  sur `about:blank`, où l’audio n’existe pas. Remplacé par `tuner.locator('#radar-player')`, qui
  attend le vrai document. Appliqué aux **deux** occurrences — la seconde n’échappait au problème
  que grâce au `selectOption` qui la précède.
- `browser-smoke.spec.mjs` : `waitForURL` attendait l’événement `load` de l’accueil (son défaut),
  donc tout le fil étudiant et ses images en 4 s. Seule la redirection est testée → `domcontentloaded`.

**Statut inchangé — et une mesure qui le confirme.** Trois `npm test` d’affilée le 2026-07-26, même
code, machine chargée : **2 échecs, puis 1, puis 0**. Le test qui lâche est
`player-continuity.spec.mjs:52` (« le bouton annule une connexion audio en attente »), qui passe
systématiquement en isolation (`--repeat-each=3` vert) et échoue en suite complète. Le correctif
ci-dessus a donc supprimé une course **déterministe** (`#radar-player` absent d’`about:blank`) sans
toucher au flake **sous charge** : entre le `dispatchEvent('waiting')` et l’assertion
`toHaveClass(/is-buffering/)`, l’état peut être écrasé quand le `webServer` mono-thread sature.

Le critère de sortie — 10 runs verts d’affilée en local *et* en CI, aucun flake sur deux semaines —
est donc loin d’être atteint. Prochaine piste, cohérente avec la consigne de la dette : ne pas
allonger les délais, mais rendre l’assertion indépendante du timing (attendre l’état de bufferisation
publié par le lecteur plutôt que la classe CSS qui en découle).

**Signal distinct à recouper — ne pas confondre avec l’attente réseau.** Le rouge de 05:08 UTC
portait sur `bookmark-metadata` et `institution-labels`, avec des dépassements du timeout **global**
de 30 s, pendant que six autres workflows tournaient. `masthead-weather` mesure déjà 26 s en local ;
`playwright.config.mjs` fixe `timeout: 30_000` et `workers: 2` en CI. La marge est donc mince sous
contention du runner. Un `npm test` sur clone propre à ce même commit passe 40/40, et le run suivant
est repassé vert sans changement de code. **Ne pas rallonger le timeout** — c’est précisément ce que
cette dette interdit ; si le cas se reproduit, chercher du côté du parallélisme (le `webServer`
`python3 -m http.server` est mono-thread et sert deux workers) plutôt que des délais.

**Cause mesurée, et traitée (2026-07-26, run 30219804595).** Le cas s’est reproduit : 7 tests
rouges, tous en dépassement de 30 s sur `page.goto('/', { waitUntil: 'load' })`, suite passée de
1 m 35 s à 4 m 42 s. Ce n’était **pas** un ralentissement du code (app.js +3 %, news.json inchangé).
Mesure sur l’accueil : `domcontentloaded` à **412 ms**, `load` à **1 404 ms**, et surtout
**35 requêtes externes** qui bloquent `load` — Google Fonts (CSS + woff2), `cloud.umami.is`,
la photo Wikimedia du mât, `gstatic.com/cv/js/sender`. Aucune n’est sous notre contrôle : sous un
runner chargé ou une réponse lente de Commons, `load` dépasse trivialement les 30 s.

Correctif conforme à la consigne de la dette — réécrire les attentes, pas rallonger les délais :
les tests qui n’ont besoin ni de la photo ni des polices attendent désormais `domcontentloaded`
(`bookmark-metadata`, `institution-labels`, les trois `goto('/')` de `seo-pages`). Les fiches
statiques `/radios/…` gardent `load`, elles ne chargent rien d’externe. En complément, le
`webServer` passe à `ThreadingHTTPServer` : le mono-thread servant deux workers restait un
goulot réel, même s’il n’est pas la cause mesurée ici (aucun écart local : 55 s contre 55 s).

**Reste à faire avant de solder** : le critère de sortie est inchangé — 10 runs verts d’affilée en
local *et* en CI, aucun flake sur deux semaines. `masthead-weather` échoue encore ~1 fois sur 5,
**identiquement sur le code d’avant cette session** (5 runs de chaque côté) : c’est une assertion
d’égalité au pixel près (`expect(widthAfterRotation).toBe(widthBeforeRotation)`) sur une largeur
qui bouge de ~3 px quand une ville plus large entre dans le bandeau. À réécrire vers l’état
observable, pas à tolérancer à l’aveugle.

**D15 — pourquoi l’audit pixel informe sans purger (2026-07-26).**

Signalement humain : des églises et des images hors standard passaient encore
dans le mât. L’audit a montré que le contrôle pixel était **cassé**, pas
seulement absent — voir `docs/maintenance.md` § « Banques photo ». Réparé,
étendu aux 5 banques et branché en hebdomadaire.

Reste le calibrage. Taux de rejet mesuré sur des banques curées :

| Banque | Rejets |
|--------|--------|
| paysages | 19 / 35 (54 %) |
| nations | 15 / 25 (60 %) |
| campus | 22 / 28 (79 %) |

- Un contrôle qui rejette 4 photos sur 5 ne discrimine plus rien, et c’est
  probablement pourquoi ses sorties n’étaient pas suivies même avant la panne.
- **Faux positif documenté** : « Bishop's University campus 2011 » signalée
  `religious_architecture` à cause d’un clocheton de toit sur un pavillon
  académique de 1891 — décision humaine : conservée.
- Deuxième bug corrigé au passage : `score()` prenait les dimensions de la
  **vignette téléchargée** pour la résolution native, ce qui rejetait les 127
  photos en `low_resolution`, y compris des images 3648×2736. Il lit désormais
  `width` / `height` de la banque, et signale `SOFT:native_size_unknown` quand
  ils manquent.
- **Ne pas solder en baissant les seuils au jugé.** La bonne voie est un lot de
  photos étiquetées à la main, servant de référence pour régler chaque seuil.
- Rappel : la détection de **visages** n’existe pas et n’est pas au programme —
  « pas de personnes reconnaissables » reste une revue humaine.

**D12 à D14 — origine et mesures (2026-07-26, audit externe Perplexity).**

Cinq recommandations reçues, **vérifiées sur le dépôt avant inscription** : deux
décrivent des défauts réels, deux étaient déjà satisfaites, une n’est
qu’à moitié applicable. Les mesures sont consignées ici pour que la prochaine
session parte du constat et non de l’audit.

**D12 — cohérence des quatre représentations du fil (résolue le 2026-07-29)**

- Quatre sorties, trois générateurs : `fetch-news.js` → `news.json`,
  `generate-feed.js` → `feed.xml`, `generate-seo.js` → prérendu HTML **et**
  `ItemList` JSON-LD.
- Vérifié le 2026-07-26 : les quatre affichent la **même tête de fil**. Il n’y a
  donc rien à réparer — le risque est qu’elles divergent sans que rien ne le
  signale, et qu’un lecteur RSS, un humain et un moteur voient trois fils
  différents.
- Le test `tests/news-representations.mjs` compare les dix premières manchettes
  des quatre sorties dans `npm run test:unit`, après normalisation des entités
  HTML (`&#8217;` vs `’`).

**D13 — soldée 2026-07-30**

| Jeton | Contexte | Ratio | Seuil AA |
|-------|----------|-------|----------|
| `--muted` `#5f646c` | sur `--bg` blanc | **≈ 5,96** | 4,5 |
| `--muted` `#5f646c` | sur `--bg-soft` | **≈ 5,50** | 4,5 |
| `--muted` `#888d96` | thème **sombre** (inchangé) | 5,75 | conforme |

- Thème clair seulement : `#80858c` → `#5f646c`.
- `.translate-menu__opt:focus-visible` : outline `2px solid var(--accent)` +
  offset 2px (distinct du survol qui ne change que le fond).
- **Déjà bon, ne pas re-auditer** : les 8 contrôles du tuner sont de vrais
  `<button>` / `<select>`, il n’y a aucun `div onclick` dans `index.html`.

**D14 — ce qui est resserrable, et ce qui ne l’est pas**

- `img-src https:` **ne peut pas** être resserré de façon réaliste : les images
  d’articles viennent des 14 domaines de journaux, de Wikimedia et des banques
  photo — imprévisibles par nature. C’est une **décision assumée**, pas une
  dette : ne pas la rouvrir à chaque audit.
- `style-src 'unsafe-inline'` reste nécessaire tant que le bloc de style critique
  du synthé est inline dans `index.html`.
- `frame-src` et `connect-src` sont, eux, énumérables → seuls ceux-là sont visés.

**Soldée 2026-07-30 — `frame-src` (2026-07-29) + `connect-src`.**

- `frame-src` : même site + six radios (`radios.json`).
- `connect-src` inventorié depuis le code client : workers météo / nowplaying /
  bg-rotation, umami (+ gateway), Google gtx, MyMemory, `blob:` ; **plus** de
  `https:` ni `wss:` génériques. `img-src https:` et `media-src https:` restent
  des décisions assumées (images multi-sources, flux radio).
- Surfaces : `index.html`, `feeds.html`, `tuner-embed.html`, gabarit
  `seo-pages-lib.js` et pages SEO régénérées ; pomo/solitaire avaient déjà une
  liste serrée.
- `tests/static-integrity.mjs` interdit le retour de `connect-src https:`.

**Écarté volontairement** : la partie « hiérarchie typographique et
breakpoints » de l’audit est un examen stylistique sans défaut mesuré ; elle
relève de **D2** (découpe `style.css`). Pas de dette décorative — cf. §2b.

**D11 — le chemin exact (2026-07-25) :**

Bloquée sur les comptes de l’humain, pas sur du code. Statut `blocked` et non
`open` : aucun agent ne peut la solder.

1. **Google Search Console** — [search.google.com/search-console](https://search.google.com/search-console)
   → *Ajouter une propriété* → type **Domaine** (et non « Préfixe d’URL » : le
   type Domaine couvre https, http et tous les sous-domaines d’un coup) →
   `le-radar.ca`. Google demande un enregistrement **TXT** : l’ajouter dans
   Cloudflare (DNS → Add record → TXT). Puis *Sitemaps* → soumettre
   `sitemap.xml`.
2. **Bing Webmaster Tools** — [bing.com/webmasters](https://www.bing.com/webmasters)
   → *Import from GSC* une fois l’étape 1 faite. Pas redondant : Bing alimente
   aussi ChatGPT Search.
3. **IndexNow** — tableau de bord Cloudflare → `le-radar.ca` →
   **Caching → Configuration → Crawler Hints** → activer. Utile vu que les bots
   publient plusieurs fois par jour.

Ensuite : ne rien attendre avant **4 à 6 semaines**. 71 URL neuves sur un
domaine sans historique, ça prend ce temps-là. Quoi mesurer et comment repérer
qu’on attire le mauvais public : [`docs/referencement-suivi.md`](docs/referencement-suivi.md).

**D9 — mécanisme identifié (2026-07-25, fin de session) : la parallélisation.**

- `npx playwright test` → 2 échecs (`player-continuity`, `browser-smoke` easter egg).
- `npx playwright test --workers=1` → **39 / 39 verts**, systématiquement.
- Donc ce ne sont pas des tests fragiles isolément : ils se **marchent dessus**.
  `playwright.config.mjs` a `fullyParallel: true` et, en local, autant de workers
  que de cœurs. Les suspects sont les ressources partagées par origine :
  enregistrement du service worker, caches, `localStorage`, et le périphérique
  audio unique.
- Piste de solde (ne pas rallonger les délais) : `test.describe.configure({
  mode: 'serial' })` sur les fichiers qui touchent le SW et l'audio, ou les
  isoler dans un projet Playwright à un seul worker — plutôt que de sérialiser
  toute la suite, qui passe de 44 s à 1 min 6 s.
- Coût actuel du contournement : lancer `--workers=1` avant de conclure à une
  régression.

**Correction (2026-07-26, plus tard) — la sérialisation ne suffit pas.**

- Observé depuis : `--workers=1` sur la suite complète laisse encore 1 à 2
  rouges (`player-continuity`, parfois `browser-smoke`), alors que
  `player-continuity` seul passe **3 fois sur 3**.
- Donc le problème n'est pas seulement la concurrence : c'est l'**accumulation
  d'état entre tests** sur la même origine — service worker enregistré, caches,
  `localStorage`, périphérique audio — qui persiste d'un fichier à l'autre même
  en série.
- Conséquence pratique : un rouge sur ces deux fichiers ne prouve rien. Le
  vérifier en lançant **le fichier seul** avant de suspecter une régression.
- Piste révisée : ne pas se contenter de sérialiser. Nettoyer l'état entre
  fichiers (désenregistrer le SW, vider caches et `localStorage` en
  `afterEach`), ou isoler ces tests dans un projet Playwright distinct.

**D9 — diagnostic (2026-07-25, session référencement) :**

- `tests/player-continuity.spec.mjs:56` (« une page suiveuse n’affiche pas un buffering tardif
  après navigation ») échoue **par intermittence** : rouge une fois, vert au run suivant, sans
  changement de code.
- **Vérifié non-régression** : le même test échoue à l’identique sur `HEAD` **non modifié** —
  copie propre extraite par `git archive HEAD` puis servie sur un port séparé. Ce n’est donc
  pas causé par une modification récente.
- `tests/bookmark-metadata.spec.mjs` utilisait `waitUntil: 'networkidle'` → timeouts de 30 s sur
  `/` et `/solitaire/` : avec le syntoniseur et la météo, le réseau n’est **jamais** « idle ».
  Corrigé en `load` le 2026-07-25 ; c’était le dernier `networkidle` du dossier `tests/`.
- **Ne pas** solder en augmentant les timeouts ni en ajoutant des `waitForTimeout` : remplacer
  par des attentes sur l’état observable (`expect.poll` sur l’état du lecteur). Rallonger les
  délais ne fait que déplacer le flake et ralentir la CI.
- Piste : l’audio headless (pas de périphérique de sortie) rend `readyState` / événements de
  buffering non déterministes — envisager un test qui n’exige pas de lecture réelle.

**D10 — diagnostic (2026-07-25, session référencement) :**

Quatre tables décrivent les mêmes établissements, chacune avec ses propres
variantes de noms :

| Fichier | Table | Sert à |
|---------|-------|--------|
| `app.js` | `INSTITUTION_ACRONYMS` | Formes courtes d’affichage (UdeM, UQAM…) |
| `scripts/generate-feed.js` | `INSTITUTION_LABELS` | Libellés dans le RSS sortant |
| `translate.js` | `INSTITUTION_LABELS` + `QC_COLLEGE_PLACE_RE` | Localisation des noms et des types |
| `scripts/seo-pages-lib.js` | `INSTITUTIONS` | Regroupement canonique + URL des pages d’entités |

- **Cause racine mesurée** : `institutions.json` porte déjà un champ `type` pour
  **60 cégeps**, mais `translate.js` redevine ce type à partir d’une liste de
  toponymes écrite à la main (`QC_COLLEGE_PLACE_RE`). Le registre sait déjà ce
  que le code réinvente.
- **Symptôme concret** (corrigé le 2026-07-25) : `formatCollegeLabel()` ne
  retirait le mot-type qu’en préfixe puis le rajoutait en suffixe →
  « Vanier College College » en de/it/pl, « Colegio de Vanier College » en es.
  Trois établissements réels touchés (Vanier, John Abbott, Champlain Regional).
  Le correctif rend la fonction idempotente ; il ne supprime pas la duplication
  des tables, qui reste la dette.
- Les registres n’écrivent pas les noms pareil : « UQAM » / « Université du
  Québec à Montréal », « Université McGill » / « McGill University ». Chaque
  table gère ça de son côté, avec des couvertures différentes.
- **Ne pas solder en ajoutant une 5ᵉ table.** La cible : `institutions.json`
  devient la source de vérité (nom canonique, aliases, type, région, site) et
  les quatre consommateurs en dérivent. `app.js` en dernier (monolithe, cf. D2).
- Filet en place en attendant : `tests/institution-labels.spec.mjs` verrouille
  l’absence de doublon **et** l’idempotence sur les cas réels.

> Les IDs restent stables. N’ajoute une ligne que si la dette est **réelle et récurrente**, pas un wish-list décoratif.

---

## 3c. Candidats auto (récolte vibe-code) — pas encore des dettes

> Généré par `npm run agents:harvest -- --write`. **Pas des D# ouvertes.**
> L’humain (ou l’agent avec OK) promeut une ligne en §3 si pertinent.
> Dernière récolte : 2026-08-09T03:33:39.220Z · intensité **heavy** (score 1011.6) · fenêtre `36h`

| Zone | Chaleur | Effort | Suggestion | Fichiers chauds |
|------|---------|--------|------------|-----------------|
| bots-ci | 188.4 | M | Bots / CI / scripts de maintenance | `scripts/radio-nowplaying-lib.js`, `scripts/radio-schedule-lib.js`, `tests/radio-nowplaying.mjs`, `tests/masthead-sports-fit.spec.mjs`, `tests/static-integrity.mjs`, `scripts/fetch-radio-nowplaying.js` |
| pwa-sw | 76 | S | PWA / service worker / install | `assets/news-images/manifest.json`, `sports/sw.js`, `sw.js`, `engage-prompt.js`, `manifest.json`, `offline.html` |
| pomo | 61.5 | S | Isolation / qualité mini-app Pomo | `pomo/LICENSE`, `pomo/README.md`, `pomo/apple-touch-icon-120x120.png`, `pomo/apple-touch-icon-152x152.png`, `pomo/apple-touch-icon-180x180.png`, `pomo/apple-touch-icon.png` |
| banks-photo | 42 | M | Pipeline banques photo (QC / saisons / audit) | `data/quebec-backgrounds.json`, `data/quebec-favorites-backgrounds.json`, `data/quebec-nations-backgrounds.json`, `data/quebec-pomo-backgrounds.json`, `data/quebec-university-backgrounds.json`, `quebec-backgrounds-data.js` |
| radio-mobile | 37.5 | M | Radio mobile / Media Session / reprise | `scripts/radio-nowplaying-lib.js`, `tests/radio-nowplaying.mjs`, `scripts/fetch-radio-nowplaying.js`, `.github/workflows/update-radio-nowplaying.yml`, `cast.js`, `mobile-playback.js` |
| monolith-app | 21 | L | Découper / modulariser app.js (tranche) | `app.js`, `pomo/js/app.js` |

Pour promouvoir : ajouter une ligne D# en §3 avec effort + pourquoi, après OK humain.
## 4. Dettes résolues (historique)

| ID | Résolu | Note |
|----|--------|------|
| — | 2026-07 | Pipeline banques : JSON source, `bank:sync` / `bank:check`, blacklist durable (`quebec-backgrounds-blacklist.js`), playbook agent, purge chapelle-like Vaudreuil-sur-le-Lac |
| — | 2026-07-25 | Protocole fin de session : `npm run agents:propose` + points d’entrée multi-outils (`CLAUDE.md`, `.cursor/rules/`, copilot-instructions) |
| — | 2026-07-25 | Bot `detect-photo-seasons` (tags season/season6 + confidence) + filtre client 4/6 saisons |
| D6 | 2026-07-25 | `audit:banks:hard` + `tests/bank-hard-audit.mjs` dans `npm test` (0 réseau) |
| D5 | 2026-07-25 | `religious-facade-lib.js` partagé (RE + SPIRE_THRESHOLDS v1) maintain/bank-hard/photo-qc + SYNC Python/JS |
| D12 | 2026-07-29 | `tests/news-outputs.mjs` compare les dix premières manchettes de `news.json`, du RSS, du prérendu HTML et du JSON-LD |
| D13 | 2026-07-30 | Thème clair : `--muted` `#80858c` → `#5f646c` (≥ 4,5:1 sur `--bg` et `--bg-soft`) ; `.translate-menu__opt:focus-visible` outline accent 2px (indicateur ≥ 3:1) ; thème sombre inchangé |
| D14 | 2026-07-30 | `connect-src` resserré (plus de `https:` / `wss:` génériques) : self, blob, 3 workers LE-RADAR, umami, gateway.umami, translate.googleapis, mymemory — index/feeds/tuner-embed + gabarit SEO + pages générées ; `tests/static-integrity.mjs` verrouille |
| D16 | 2026-07-30 | Les 6 radios ont `_sloganSource` / `_sloganEvidence` / `_sloganChecked` / `_sloganConfidence` ; `static-integrity` exige la provenance pour chaque station |
| D17 | 2026-07-30 | Contrat lecteur : `tests/native-player-contract.mjs` (109 natives, 2 iframes) + `tests/player-routes.spec.mjs` matrice navigateur |
| D2 | 2026-07-30 | Tranche CSS mât → `style-masthead.css` @import ; SW APP_SHELL mis à jour |
| D2 | 2026-08-25 | Découpe réelle : `radar-*.js` + `weather-cities-data.js`, CSS par surface (`style-sports-strip` / `style-tuner` / `style-feed` / `style-chrome` / chrome mât), `<link>` jamais `@import`. La ligne 2026-07-30 n’était que la tranche mât. |
| D8 | 2026-07-30 | Silhouette d’arche (ciel→structure + convexité) en renfort du trou Percé ; override Mercier conservé |
| D18 | 2026-07-30 | `tests/shared-chrome.spec.mjs` clair/sombre + static-integrity footer structure |
| D1 | 2026-07-30 | Audit lourd absents du Vérification (push/PR) ; bank:check offline dans npm test ; maintain hebdo |
| D10 | 2026-07-30 | SoT institutions.json via institution-labels-lib + institution-acronyms-data.js ; feed/SEO/app unifiés ; QC_COLLEGE_PLACE_PARTS via sync-college-places |
| — | 2026-07-29 | Catalogue SEO historique expérimental : `news-archive.json` distinct du fil frais, échantillon public borné et liens originaux vérifiés, `sitemap-archives.xml`, robots explicite et workflow hebdomadaire à faible volume; aucune republication intégrale |
| — | 2026-07-29 | Rétro-crawl historique contrôlé : `retro-crawl-historical.js` lit seulement des listes publiques paginées, exclut explicitement les corps WordPress et les médias, reprend dans `historical-crawl-state.json`; 0–12 mois indexables après vérification, 12 mois–3 ans dans les archives de conservation et au-delà dans les archives de référence, toutes deux en `noindex,follow` |
| — | 2026-07-25 | Balises anti-glouton + `.agents-session.json` (1 dette/session, 2/jour) |
| — | 2026-07-29 | Identité unifiée sur **LE-RADAR** (jamais « RADAR » seul) : 9 workflows, 8 User-Agent, 6 clés `localStorage` `req-*` → `radar-*` (sans repli), titre de l'issue de maintenance |
| — | 2026-07-29 | Acronyme officiel « Le Réseau Académique de Découverte et d'Agrégation de Ressources » — README + `docs/{identite-visuelle,agent-playbook,maintenance,politique-editoriale}.md`, une fois par document |
| — | 2026-07-29 | Pied de page unique : `renderSiteFooter()` (`seo-pages-lib.js`) + marqueurs `RADAR:FOOTER` pour `index`/`feeds`/`offline` — 4 copies divergentes supprimées, lien GitHub ajouté, signature institutionnelle, contraste AA. `/pomo/` et `/solitaire/` hors périmètre |

*(Ajouter une ligne ici quand une dette §3 passe à résolu — ne pas supprimer le passé.)*

---

## 5. Protocole session agent (vibe code)

### Au démarrage (obligatoire, court)

1. Lire **`AGENTS.md`** (ce fichier).
2. Lire **`docs/agent-playbook.md`** pour le domaine du ticket.
3. Faire **le ticket de l’humain** en priorité — rien d’autre tant qu’il n’est pas OK.

### Fin de session (vibe normal ou intense)

Quand le ticket est **terminé** et le diff **propre** :

```bash
npm run agents:harvest -- --write   # 1) détecte si on a beaucoup vibé (git)
npm run agents:propose              # 2) dette D# existante (quota)
```

1. **Harvest** : si intensité moderate/intense/heavy → coller les **candidats** (zones chaudes).  
   Demander : « promouvoir **une** zone en D# ? » — sinon ignorer.  
   **Ne pas** créer 5 dettes d’un coup.
2. **Propose** : si **🛑 STOP** quota → fin ledger.  
   Sinon une dette D# open → attendre OK → un bloc → `agents:record-sold` → STOP.
3. Les candidats harvest **ne sont pas** des dettes tant qu’ils ne sont pas en §3 avec un ID D#.

Exceptions : question pure, « ticket only », quota plein.

### Auto-entretien du ledger

| Qui | Quoi |
|-----|------|
| **Harvest (git)** | Détecte vibe intense + zones chaudes → §3c candidats |
| **Agent** | Montre harvest + propose ; promeut D# seulement avec OK ; MAJ §3/§4 |
| **Humain** | Valide promote / dette / ignore |
| **Scripts** | `agents:harvest`, `agents:propose`, `agents:record-sold` |

Pas de daemon qui lit le chat : la « détection pendant le vibe » = **observation git en fin de session** (et WIP non commité).

### Interdit sans demande explicite

- Bulk Commons, refonte monolithe complète, nouveau Worker audio, « cleanup général »
- Ignorer blacklist / `bank:sync` pour patcher seulement le JS miroir
- **Commencer** une dette ledger sans OK après `agents:propose`
- Inventer des dettes pour justifier un gros chantier

---

## 6. Rappel non-casse (copié pour les impatients)

- **Radio Android** : un seul `<audio>`, pas de 2ᵉ son, pas de proxy audio Worker.
- **Banques** : mât ≠ pomo ≠ uni ; nations partagée ; favorites hors purge bots.
- **SW** : bump `radar-shell-vN` / `pomo-shell-vN` si le shell cache change. Plus besoin d’y penser : `npm run check` refuse un `.css`/`.js` de shell modifié sans bump, et `npm run sw:bump` bumpe + resynchronise `sw-shell-lock.json`.
- **UX** : en cas de doute, ne pas toucher — documenter dans §3.

---

*Dernière intention : ce fichier n’est pas une todo infinie. C’est un **contrat de rythme** entre humains et agents, pour que le temps (et les tokens) travaillent **pour** le projet, pas contre.*

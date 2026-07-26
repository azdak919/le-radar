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
npm run agents:record-sold -- D5 # après avoir soldé D5
npm run agents:reset-session     # nouveau chat (pas pour contourner le jour)
```

**Chaîne fin de session intensive :**

```text
ticket OK → agents:harvest[:write] → montrer candidats → (option promote 1 D#)
         → agents:propose → OK? → 1 dette max → record-sold → STOP
```

---

## 2c. WIP non commité (reprise après coupure de session)

> Détecté par observation `git status`/`git diff` — pas soldé, pas testé, **rien commité**.
> À retirer de cette section dès que le ticket est terminé (commité) ou explicitement abandonné.

**Priorité : HAUTE** — humain a demandé de committer/pousser tel quel (2026-07-25 09:45). `npm run check` **OK** (syntaxe + unit, 0 réseau) avant commit ; le test à l'oreille (jump/coin/hit) et le test hors-ligne réel (couper le réseau, recharger, jouer) **restent à faire manuellement** post-déploiement — ce n'est pas une vérification automatisable ici.

**2026-07-25 09:31 — session Grok coupée (tokens épuisés), 2 derniers prompts non finis.**

Feature en cours : **SFX pour le mini-jeu `offline.html`** (bips jump/coin/hit, synthèse Python, domaine public) + petit nettoyage de la barre de jeu.

| Fichier | État | Détail |
|---------|------|--------|
| `assets/offline/sounds/{jump,coin,hit}.wav` | **non suivi (untracked)** | 3 WAV mono 22 kHz synthétisés pour le projet |
| `offline.html` | modifié | `sfx`/`loadSfx`/`playSfx`/`unlockAudio` (déverrouillage audio mobile au premier geste) câblés sur `jump()` et la collision ; barre de jeu : nom de langue autochtone retiré (affichait `ᐃᓄᒃᑎᑐᑦ` hors contexte, lisait comme un bug) → texte fixe FR ; `notranslate` / `google notranslate` ajoutés pour bloquer Google Translate sur cette page |
| `sw.js` | modifié | cache bumpé `radar-shell-v503→v504`, `radar-offline-v6→v7` ; 3 wav ajoutés à `OFFLINE_ASSETS` et `APP_SHELL` |
| `assets/offline/README.md` | modifié | licence des sons documentée (domaine public, créés pour LE RADAR) |
| `data/quebec-*-backgrounds.json` (5 fichiers) | modifié | uniquement le timestamp `updated` — effet de bord probable d'un `bank:sync`/`bank:check` lancé pendant la session, **pas** lié au SFX |

**Reste à faire avant commit :**
- Vérifier à l'oreille (jump/coin/hit) + test offline réel (couper le réseau, recharger, jouer).
- `npm run check` (le bump de cache SW doit être validé — non-casse §6).
- Confirmer que le retrait du nom de langue dans la barre de jeu est voulu définitivement (pas juste un test) avant de committer.
- Si tout est bon : un seul commit couvrant `offline.html` + `sw.js` + `assets/offline/`. Les 5 JSON de banques (timestamp seul) peuvent être laissés de côté ou re-générés proprement via `bank:sync`, pas committés tels quels sans revue.

---

## 3. Ledger — dettes ouvertes (volontaires)

Mettre à jour ce tableau quand tu touches une ligne.  
Statuts : `open` · `ready` (tech/tests OK pour tenter) · `blocked` · `wontfix` (décision).

| ID | Dette | Pourquoi c’est volontaire | Signaux « tech assez mûre » | Effort | Statut |
|----|--------|---------------------------|------------------------------|--------|--------|
| D1 | **CI lourde** sur `scripts/audit-quebec-backgrounds.py` (téléchargement images) | Réseau flaky, rate-limit Commons, lourd pour chaque PR | Job **manuel/hebdo** + cache ; pas sur chaque push | M | open |
| D2 | **Découpe** `app.js` / `style.css` en modules | Risque régression UX (tuner, mât, thèmes) ; gain surtout agent | Tranche unique (ex. CSS mât photo seul) + smoke manuel/playwright | L | open |
| D3 | **Re-seed bulk** Commons pour trous de banques | 429, qualité inégale, risque de réintroduire religieux/façades | Seeds **ciblés** 1–3 lieux + `bank:check` + audit offline d’abord | M | open |
| D4 | **Skills Grok hors repo** (`~/.grok/skills/`) | Double source d’obsolescence ; le playbook **est** le skill du dépôt | Seulement si multi-projets perso — **ne pas** dupliquer les règles LE-RADAR | S | wontfix |
| D5 | **Durcir audit clocher / façades** (aligner Python ↔ JS runtime) | Déjà blacklist + town hall paysage ; le reste est peaufinage | Cas réels en banque ou faux négatifs documentés | S–M | resolved |
| D6 | **CI audit HARD offline-only** sur banques (sans fetch) | Éviter de re-découvrir en prod sans taxer chaque PR | `bank:check` + tests unit déjà là — étendre si gaps | S | resolved |
| D7 | **Banque photo mât mobile dédiée** (option 3) | Coût double (JSON+JS+maintain+saisons+HARD) ; le fix 2026-07 (dims banque + thumb) peut suffire | Mât encore noir / crops illisibles **après** fix mobile ; flags `surfaces` (opt. 2) déjà essayés ou insuffisants | L | open |
| D8 | **Détection d’arche/silhouette dans `computeBestFocalY`** (crop mât) | Le détecteur actuel vise le « trou » (Rocher Percé) ; élargir touche **tous** les crops auto — override `focalY` en banque suffit au cas par cas | 2–3 photos réelles où l’ancre arche rate, avec focalY auto vs override notés ; harnais de rendu multi-AR pour non-régression | S–M | open |
| D9 | **Tests navigateur instables** (`player-continuity`, attentes réseau) | Le syntoniseur garde des connexions ouvertes en permanence et l’audio headless n’est pas déterministe : rendre ces tests fiables demande de réécrire les attentes, pas de rallonger les délais | Un run vert 10× d’affilée en local **et** en CI après passage à des attentes sur l’état observable ; aucun flake sur 2 semaines | S–M | open |
| D10 | **Connaissance des établissements éclatée en 4 tables** | Chaque copie répond à un besoin distinct (affichage court, libellés RSS, localisation, pages d’entités) ; les unifier touche 4 zones d’un coup, dont le monolithe `app.js` | Une divergence réelle qui casse quelque chose — le doublon « College » du 2026-07-25 en est une ; commencer par la table de traduction, la plus autonome | M | open |
| D11 | **Déclaration du site aux consoles de recherche** (Search Console, Bing, IndexNow) | Aucun agent ne peut le faire : ça demande les comptes Google / Microsoft / Cloudflare de l’humain. Le travail technique est livré et en ligne ; il ne reste que les clics | Rien à attendre — à faire dès que possible : sans soumission du sitemap, les 71 URL neuves mettent bien plus longtemps à être découvertes | S | blocked |

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
> Dernière récolte : 2026-07-25T10:58:31.400Z · intensité **heavy** (score 454.4) · fenêtre `36h`

| Zone | Chaleur | Effort | Suggestion | Fichiers chauds |
|------|---------|--------|------------|-----------------|
| banks-photo | 268 | M | Pipeline banques photo (QC / saisons / audit) | `scripts/maintain-quebec-backgrounds.js`, `quebec-backgrounds.js`, `data/quebec-nations-backgrounds.json`, `data/quebec-university-backgrounds.json`, `quebec-nations-backgrounds-data.js`, `data/quebec-backgrounds.json` |
| pwa-sw | 178 | S | PWA / service worker / install | `sw.js`, `pomo/sw.js`, `offline.html`, `solitaire/sw.js`, `engage-prompt.js` |
| pomo | 97.5 | S | Isolation / qualité mini-app Pomo | `pomo/sw.js`, `pomo/index.html`, `pomo/styles/base.css`, `pomo/js/weather.js`, `pomo/js/backgrounds.js`, `pomo/js/app.js` |
| bots-ci | 93.6 | M | Bots / CI / scripts de maintenance | `scripts/maintain-quebec-backgrounds.js`, `scripts/quebec-backgrounds-blacklist.js`, `scripts/audit-quebec-backgrounds.py`, `tests/masthead-weather.spec.mjs`, `scripts/sync-quebec-backgrounds.js`, `tests/static-integrity.mjs` |
| monolith-app | 93 | L | Découper / modulariser app.js (tranche) | `app.js`, `pomo/js/app.js` |
| monolith-css | 55 | M | Extraire CSS mât / thème (tranche style.css) | `style.css` |

Pour promouvoir : ajouter une ligne D# en §3 avec effort + pourquoi, après OK humain.
## 4. Dettes résolues (historique)

| ID | Résolu | Note |
|----|--------|------|
| — | 2026-07 | Pipeline banques : JSON source, `bank:sync` / `bank:check`, blacklist durable (`quebec-backgrounds-blacklist.js`), playbook agent, purge chapelle-like Vaudreuil-sur-le-Lac |
| — | 2026-07-25 | Protocole fin de session : `npm run agents:propose` + points d’entrée multi-outils (`CLAUDE.md`, `.cursor/rules/`, copilot-instructions) |
| — | 2026-07-25 | Bot `detect-photo-seasons` (tags season/season6 + confidence) + filtre client 4/6 saisons |
| D6 | 2026-07-25 | `audit:banks:hard` + `tests/bank-hard-audit.mjs` dans `npm test` (0 réseau) |
| D5 | 2026-07-25 | `religious-facade-lib.js` partagé (RE + SPIRE_THRESHOLDS v1) maintain/bank-hard/photo-qc + SYNC Python/JS |
| — | 2026-07-25 | Balises anti-glouton + `.agents-session.json` (1 dette/session, 2/jour) |

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
- **SW** : bump `radar-shell-vN` / `pomo-shell-vN` si le shell cache change.
- **UX** : en cas de doute, ne pas toucher — documenter dans §3.

---

*Dernière intention : ce fichier n’est pas une todo infinie. C’est un **contrat de rythme** entre humains et agents, pour que le temps (et les tokens) travaillent **pour** le projet, pas contre.*

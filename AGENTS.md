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

**D7 — précisions (option 3, pas 1 ni 2) :**

- **Option 1** (préférée) : une banque + pipeline d’affichage — déjà en cours.
- **Option 2** (intermédiaire) : flags par photo (`surfaces` / `mobilePrefer`) dans la **même** banque.
- **Option 3 = D7** : vraie banque séparée `data/quebec-mobile-backgrounds.json` (+ JS, profil maintain, pick viewport mobile).
- **Règles obligatoires** si on ouvre D7 : mêmes HARD (blacklist, religieux, town hall, dims, scènes), mêmes saisons 4/6, `bank:sync` / `audit:banks:hard`, pas de contournement.
- Ne pas démarrer D7 tant que le mât mobile n’a pas été revalidé post-fix « low_resolution / thumb ».

> Les IDs restent stables. N’ajoute une ligne que si la dette est **réelle et récurrente**, pas un wish-list décoratif.

---


## 3c. Candidats auto (récolte vibe-code) — pas encore des dettes

> Généré par `npm run agents:harvest -- --write`. **Pas des D# ouvertes.**
> L’humain (ou l’agent avec OK) promeut une ligne en §3 si pertinent.
> Dernière récolte : 2026-07-25T08:32:56.361Z · intensité **heavy** (score 768) · fenêtre `48h`

| Zone | Chaleur | Effort | Suggestion | Fichiers chauds |
|------|---------|--------|------------|-----------------|
| pwa-sw | 410 | S | PWA / service worker / install | `sw.js`, `pomo/sw.js`, `solitaire/sw.js`, `offline.html`, `engage-prompt.js` |
| pomo | 277.5 | S | Isolation / qualité mini-app Pomo | `pomo/sw.js`, `pomo/index.html`, `pomo/styles/base.css`, `pomo/styles/layout.css`, `pomo/js/translate.js`, `pomo/js/backgrounds.js` |
| monolith-app | 234 | L | Découper / modulariser app.js (tranche) | `app.js`, `pomo/js/app.js` |
| banks-photo | 230 | M | Pipeline banques photo (QC / saisons / audit) | `scripts/maintain-quebec-backgrounds.js`, `quebec-backgrounds.js`, `data/quebec-favorites-backgrounds.json`, `data/quebec-nations-backgrounds.json`, `quebec-favorites-backgrounds-data.js`, `data/quebec-backgrounds.json` |
| bots-ci | 148.8 | M | Bots / CI / scripts de maintenance | `tests/masthead-weather.spec.mjs`, `scripts/maintain-quebec-backgrounds.js`, `tests/player-continuity.spec.mjs`, `tests/static-integrity.mjs`, `tests/translation-menu.spec.mjs`, `scripts/audit-quebec-backgrounds.py` |
| monolith-css | 132.5 | M | Extraire CSS mât / thème (tranche style.css) | `style.css` |

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

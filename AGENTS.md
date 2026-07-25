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
| **Auto-nourriture** | **Non magique.** Le ledger ne se détecte pas tout seul : l’agent lit/écrit le fichier + `.agents-session.json` (quota). Pas de daemon. |

Commandes quota :

```bash
npm run agents:propose           # propose OU affiche STOP si quota
npm run agents:record-sold -- D5 # après avoir soldé D5
npm run agents:reset-session     # nouveau chat seulement (pas pour contourner le jour)
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

> Les IDs restent stables. N’ajoute une ligne que si la dette est **réelle et récurrente**, pas un wish-list décoratif.

---

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

### Fin de session — « notification » dette

Quand le ticket est **terminé** et le diff **propre** :

```bash
npm run agents:propose
```

1. Si sortie **🛑 BALISE STOP** → **ne rien proposer**, fin ledger.
2. Sinon coller la proposition **unique** et **attendre OK**.
3. Non / ignore → stop.
4. Oui → **un** bloc → `npm run agents:record-sold -- <ID>` → MAJ §3/§4 → check.  
   **Puis STOP** (pas de 2ᵉ propose).

Exceptions (pas de propose) : question pure, « ticket only », quota déjà plein.

### Auto-entretien du ledger

| Qui | Quoi |
|-----|------|
| **Agent** | Met à jour §3/§4 quand une dette avance ou est soldée ; n’efface pas l’historique |
| **Script** | `npm run agents:ledger` / `agents:propose` **lit** le tableau (ne l’écrit pas) |
| **Humain** | Peut marquer `ready` / `blocked` / `wontfix` à la main |

Il n’y a **pas** de daemon magique : l’entretien = **discipline de fin de session** + points d’entrée multi-outils (`CLAUDE.md`, `.cursor/rules/`, `copilot-instructions.md`).

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

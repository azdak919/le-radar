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
| **Un bloc à la fois** | 1 dette (ou 1 slice clairement bornée) par session « backlog », sauf ordre explicite de l’humain |
| **Preuve de travail légère** | `npm run check` / `bank:check` / tests ciblés avant commit — pas un audit réseau à chaque push |
| **Chaîne append-only** | Mettre à jour le tableau §3 (statut, date ISO, note) ; ne pas effacer l’historique des dettes résolues — les déplacer en §4 |
| **Consensus humain** | Si le risque UX est non trivial (radio, mât, PWA, thème), **demander** ou s’arrêter |
| **Validité du bloc** | Le commit doit pouvoir se lire seul : message clair, pas de régression volontaire |

**Quand solider une dette « tech améliorée » ?**

- Le modèle / l’outil rend la tâche **fiable** (moins d’hallucinations sur gros fichiers, meilleurs refactors guidés par tests).
- Il existe déjà des **tests ou scripts** qui catchent une casse.
- L’humain n’a pas demandé un fix urgent concurrent.
- Tu peux finir le bloc **dans une session** sans laisser le repo à moitié migré.

Sinon : **noter**, ne pas entamer.

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
| D5 | **Durcir audit clocher / façades** (aligner Python ↔ JS runtime) | Déjà blacklist + town hall paysage ; le reste est peaufinage | Cas réels en banque ou faux négatifs documentés | S–M | open |
| D6 | **CI audit HARD offline-only** sur banques (sans fetch) | Éviter de re-découvrir en prod sans taxer chaque PR | `bank:check` + tests unit déjà là — étendre si gaps | S | open |

> Les IDs restent stables. N’ajoute une ligne que si la dette est **réelle et récurrente**, pas un wish-list décoratif.

---

## 4. Dettes résolues (historique)

| ID | Résolu | Note |
|----|--------|------|
| — | 2026-07 | Pipeline banques : JSON source, `bank:sync` / `bank:check`, blacklist durable (`quebec-backgrounds-blacklist.js`), playbook agent, purge chapelle-like Vaudreuil-sur-le-Lac |

*(Ajouter une ligne ici quand une dette §3 passe à résolu — ne pas supprimer le passé.)*

---

## 5. Protocole session agent (vibe code)

**Au démarrage (obligatoire, court) :**

1. Lire **`AGENTS.md`** (ce fichier) — y a-t-il une dette **prête** et pertinente pour le ticket ?
2. Lire **`docs/agent-playbook.md`** pour le ticket (banques, SW, radio, etc.).
3. Faire **le ticket de l’humain** en priorité.
4. **Seulement si** le ticket est fini, le diff est propre, et il reste du budget raisonnable :
   - soit **un** item `open`/`ready` du ledger (le plus petit utile),
   - soit **mettre à jour** le ledger (note, statut) sans code.

**Interdit sans demande explicite :**

- Bulk Commons, refonte monolithe complète, nouveau Worker audio, « cleanup général » du dépôt.
- Ignorer blacklist / `bank:sync` pour « juste patcher le JS miroir ».
- Inventer des dettes pour justifier un gros chantier.

**En fin de session :**

- Si tu as soldé ou avancé une dette → mettre à jour §3 / §4.
- Commit messages en phrases claires ; push seulement si le flux du projet et les checks le permettent.

---

## 6. Rappel non-casse (copié pour les impatients)

- **Radio Android** : un seul `<audio>`, pas de 2ᵉ son, pas de proxy audio Worker.
- **Banques** : mât ≠ pomo ≠ uni ; nations partagée ; favorites hors purge bots.
- **SW** : bump `radar-shell-vN` / `pomo-shell-vN` si le shell cache change.
- **UX** : en cas de doute, ne pas toucher — documenter dans §3.

---

*Dernière intention : ce fichier n’est pas une todo infinie. C’est un **contrat de rythme** entre humains et agents, pour que le temps (et les tokens) travaillent **pour** le projet, pas contre.*

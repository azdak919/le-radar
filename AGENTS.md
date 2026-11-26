# AGENTS — lire avant de coder

| Doc | Rôle |
|-----|------|
| **`AGENTS.md`** (ici) | Règles dures : branche et tests, interdits, non-casse |
| [`docs/agent-playbook.md`](docs/agent-playbook.md) | Architecture, banques photo, commandes, non-casse |
| [`docs/maintenance.md`](docs/maintenance.md) | Bots, CI, pipeline éditorial |

**Priorité : le ticket de l’humain.** Ne pas refondre pour le plaisir, ne pas ouvrir de chantier qui n’a pas été demandé.

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
4. Merger **seulement** sur cet ordre, **par la PR sur GitHub** (auto-merge activé :
   GitHub fusionne quand les checks CI sont verts). Le dépôt supprime la branche
   tout seul (« Automatically delete head branches »). **Pas** de merge local ni de
   `git push origin main` par un agent (les sessions cloud n’ont d’ailleurs pas le
   droit de supprimer une branche distante : HTTP 403).
   Identité : commits **Azdak** / `azdak-qc@proton.me` ; le commit de fusion
   GitHub porte `Azdak <242694614+azdak919@users.noreply.github.com>` — accepté
   (adresse noreply déjà publique dans l’historique).

**Push ≠ livré.** Ne pas merger tout seul.  
**LE-RADAR UI/CSS** : `npm run check` + Playwright (au minimum mât/smoke) avant push.

---

## Interdit sans demande explicite

- Bulk Commons, refonte monolithe complète, nouveau Worker audio, « cleanup général »
- Ignorer blacklist / `bank:sync` pour patcher seulement le JS miroir

---

## Rappel non-casse

- **Radio Android** : un seul `<audio>`, pas de 2ᵉ son, pas de proxy audio Worker.
- **Banques** : mât ≠ pomo ≠ uni ; nations partagée ; favorites hors purge bots.
- **SW** : bump `radar-shell-vN` / `pomo-shell-vN` si le shell cache change. Plus besoin d’y penser : `npm run check` refuse un `.css`/`.js` de shell modifié sans bump, et `npm run sw:bump` bumpe + resynchronise `sw-shell-lock.json`.
- **Barre radio partagée** : `radio-barre.js` + `radio-barre.css` (Shadow DOM). Pomodoro, Solitaire et les journaux du Kiosque l'appellent en une ligne (`<script src="…/radio-barre.js" async>`). Ne pas copier ses stations, son code ou son style ailleurs : un changement ici doit arriver partout sans mise à jour des sites. Sans `radios.json`, rien ne s'affiche et le parent reçoit `data-radar-radio="off"`. Elle doit garder les mêmes informations et contrôles que la barre native (inventaire coché dans `docs/radio-barre.md`) : tout changement de la barre native se reporte dans le module. Contrat : `docs/radio-barre.md`.
- **UX** : en cas de doute, ne pas toucher — demander à l’humain.

---

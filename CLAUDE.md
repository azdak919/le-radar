# LE RADAR — instructions Claude Code / agents

1. **Avant de coder** : lire [`AGENTS.md`](AGENTS.md) (dettes, rythme) puis [`docs/agent-playbook.md`](docs/agent-playbook.md).
2. **Priorité** : le ticket humain. Ne pas refondre pour le plaisir.
3. **Fin de session** (ticket OK, diff propre) :
   ```bash
   npm run agents:propose
   ```
   Coller la **proposition dette** dans le chat et **attendre l’OK** avant d’y toucher.
   Si une dette est soldée → mettre à jour le ledger dans `AGENTS.md` (§3 → §4).
4. **Interdit sans demande** : bulk Commons, découpe totale `app.js`/`style.css`, Worker audio, ignorer `bank:sync` / blacklist.
5. **Checks** : `npm run check` / `npm run bank:check` selon le diff.

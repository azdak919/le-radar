# LE RADAR — instructions Claude Code / agents

1. **Avant de coder** : lire [`AGENTS.md`](AGENTS.md) (dettes, rythme) puis [`docs/agent-playbook.md`](docs/agent-playbook.md).
2. **Priorité** : le ticket humain. Ne pas refondre pour le plaisir.
3. **Fin de session** (ticket OK, diff propre) :
   ```bash
   npm run agents:harvest -- --write   # vibe intense ? candidats §3c
   npm run agents:propose              # dette D# ou STOP quota
   ```
   Si harvest **intense** → montrer candidats, demander promote **1** zone max.  
   Si **🛑 STOP** quota → ne pas enchaîner de dette.  
   Soldée → `npm run agents:record-sold -- D#` + MAJ `AGENTS.md`.
4. **Interdit sans demande** : bulk Commons, découpe totale `app.js`/`style.css`, Worker audio, ignorer `bank:sync` / blacklist.
5. **Checks** : `npm run check` / `npm run bank:check` selon le diff.

## Git safety (mandatory)

Read and obey `../GIT-AND-TEST-SAFETY.md` (and `AGENTS.md`). No untested pushes to `main`. Branch → test → push branch.


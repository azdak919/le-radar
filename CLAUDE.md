# LE RADAR — instructions Claude Code / agents

1. **Avant de coder** : lire [`AGENTS.md`](AGENTS.md) (dettes, rythme) puis [`docs/agent-playbook.md`](docs/agent-playbook.md).
2. **Priorité** : le ticket humain. Ne pas refondre pour le plaisir.
3. **Fin de session** (ticket OK, diff propre) :
   ```bash
   npm run agents:propose
   ```
   Si **🛑 STOP** (quota 1/session ou 2/jour) → ne pas proposer.  
   Sinon coller **une** proposition et attendre OK.  
   Soldée → `npm run agents:record-sold -- D#` + MAJ `AGENTS.md`. **Pas de 2ᵉ dette.**
4. **Interdit sans demande** : bulk Commons, découpe totale `app.js`/`style.css`, Worker audio, ignorer `bank:sync` / blacklist.
5. **Checks** : `npm run check` / `npm run bank:check` selon le diff.

# LE RADAR — instructions Claude Code / agents

1. **Avant de coder** : lire [`AGENTS.md`](AGENTS.md) (règles dures) puis [`docs/agent-playbook.md`](docs/agent-playbook.md).
2. **Priorité** : le ticket humain. Ne pas refondre pour le plaisir.
3. **Interdit sans demande** : bulk Commons, découpe totale `app.js`/`style.css`, Worker audio, ignorer `bank:sync` / blacklist.
4. **Checks** : `npm run check` / `npm run bank:check` selon le diff.

## Git safety (mandatory)

Read and obey `../GIT-AND-TEST-SAFETY.md` (and `AGENTS.md`). No untested pushes to `main`. Branch → test → push branch.

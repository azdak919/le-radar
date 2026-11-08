# Files de vérification

La vérification utilise des runners séparés :

- `static` : syntaxe, données et tests unitaires, sans Chromium.
- `critical (main)` : sentinelles ordinaires, un worker.
- `critical (serial-sensitive)` : sentinelles sensibles, un worker sur un autre runner.
- `full` : suite manuelle complète, y compris PWA et service workers, inchangée.
- `test` : contrôle requis final ; seuls les succès de tous les jobs du mode choisi sont acceptés. Une annulation ou un job attendu sauté bloque ce contrôle.

Les deux files critiques ne s’annulent pas mutuellement (`fail-fast: false`). Une nouvelle révision annule toujours le workflow périmé pour la même branche. Les artefacts portent des noms distincts. Les listes de tests et le filtre `@ci-critical` restent inchangés ; à l’introduction, 154 + 8 = 162 cas critiques et 529 cas complets.

La collecte et Pages gardent leurs workflows indépendants et leurs verrous d’écriture existants. La file S1 reste bornée à trois requêtes ; hockey et voile ne sont pas remis en attente derrière elle. Cette modification ne promet pas de délai chiffré : la répartition des tests demeure déséquilibrée.

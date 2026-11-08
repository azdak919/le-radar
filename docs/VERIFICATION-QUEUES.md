# Files de vérification

La vérification utilise des runners séparés :

- `static` : syntaxe, données et tests unitaires, sans Chromium.
- `critical (main)` : sentinelles ordinaires, un worker.
- `critical (serial-sensitive)` : sentinelles sensibles, un worker sur un autre runner.
- `full` : suite manuelle complète, y compris PWA et service workers, inchangée.
- `test` : contrôle requis final ; seuls les succès de tous les jobs du mode choisi sont acceptés. Une annulation ou un job attendu sauté bloque ce contrôle.

Les deux files critiques ne s’annulent pas mutuellement (`fail-fast: false`). Une nouvelle révision annule toujours le workflow périmé pour la même branche. Les artefacts portent des noms distincts. Les listes de tests et le filtre `@ci-critical` restent inchangés ; à l’introduction, 154 + 8 = 162 cas critiques et 529 cas complets.

La collecte et Pages gardent leurs workflows indépendants et leurs verrous d’écriture existants. La file S1 reste bornée à trois requêtes ; hockey et voile ne sont pas remis en attente derrière elle. Cette modification ne promet pas de délai chiffré : la répartition des tests demeure déséquilibrée.

Avec l’historique sportif complet et ses nouvelles régressions, le budget de la suite critique est de 30 minutes (35 minutes pour le job avec installation et artefacts). Le précédent lot de 162 tests nécessitait déjà 18 min 25 s. Les scénarios gardent leur délai de 30 secondes et toutes leurs assertions ; les captures utilisent le budget de teardown distinct prévu par Playwright.

### Traces des grandes pages sportives

Les scénarios `sports-identities` et `sports-embed` conservent les traces d’actions, timings et sources en cas d’échec, mais désactivent les instantanés DOM et captures automatiques à chaque action. Le DOM complet de plus de 100 000 éléments reste inchangé; toutes les assertions, les délais de 30 secondes et les captures manuelles obligatoires sont conservés. Sur une comparaison ciblée identique (embed + géométrie 1440), le temps total mesuré passe de 58,06 à 32,34 secondes. Ce résultat ne prouve pas que toute la lenteur produit est résolue : le reset reste autour de 6 secondes dans cette mesure. Les autres fichiers gardent les traces DOM habituelles.

### Pages sportives générées pendant le build

Pour une correction de code, ne pas inclure les deux instantanés HTML sportifs dans le diff : les collecteurs continuent de les actualiser sur main. Les jobs static/critical/full régénèrent seulement ces deux pages avant les contrôles, et Pages les régénère avant Jekyll. Le contrôle du site assemblé exige le marqueur `data-sports-history="complete"` dans les deux langues avant upload. Localement, exécuter `node scripts/generate-seo.js --update --sports-only` avant les tests, sans commiter ces deux sorties dans la PR de code. Les empreintes du service worker excluent HTML/JSON : aucun bump automatique en CI ne doit masquer un verrou périmé.

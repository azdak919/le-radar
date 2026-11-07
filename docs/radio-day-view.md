# Comparaison journalière des radios

`/horaires/#journee` (anglais : `/en/schedules/#journee`) complète le hub en cours/à venir. Les liens de chaque station conservent les semaines existantes.

- Le modèle pur `scripts/radio-day-lib.js` découpe les créneaux publiés aux frontières de minuit et de la semaine, sans muter le JSON. Les chevauchements restent dans des couloirs parallèles ; aucune alternance n’est supprimée.
- Axe civil du Québec : 1 minute = 1,6 px, soit 96 px/h, sur 00:00–24:00. L’heure locale répétée au changement d’heure partage sa position ; on ne déduit pas une durée UTC d’une grille qui ne fournit pas d’offset.
- Une fin absente, estimée ou identique au début ne crée pas de bloc arbitraire. Le départ reste accessible dans « Voir aussi en liste » et les détails. Les blancs ne signifient pas que le flux audio est hors ligne.
- Une semaine collectée ancienne conserve ses dates et ne reçoit pas de repère « aujourd’hui ». Si seule une station conserve une semaine plus ancienne, son entête et ses détails gardent cette date, sans la présenter en direct. La date vérifiée reste aussi dans les détails existants du hub.
- Six colonnes, axe et entêtes collants dans un défilement local. Sur petit écran, sélection de station et défilement horizontal sans débordement de la page.
- Chaque bloc ouvre un dialogue clavier (Échap/retour au déclencheur) : titre complet, plage, source, et écoute **en direct de la station**, jamais une fausse reprise de l’émission. L’appel unique à `selectStation` réutilise le lecteur et sa synchronisation multi-onglets.
- Chargement progressif avec les données publiques `radio-schedules.json`, sans service ni collecte supplémentaire. Les semaines statiques restent utilisables sans JavaScript. Les trois nouveaux assets ne sont chargés que sur les deux hubs.

Vérification : `npm run check` ; `npx playwright test tests/radio-day-view.spec.mjs tests/radio-schedule-quality.spec.mjs --workers=1`. Les nouveaux tests figurent aussi dans `test:browser:ci` : échelle, chevauchements, titres courts/longs, semaine/minuit/Toronto, DST, clavier, petit écran et intégration au lecteur. Captures sans données fictives : tests « actual weekly source visual comparison ».

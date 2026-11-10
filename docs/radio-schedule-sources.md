# Horaires radio : sources vérifiables et mise à jour

Audit du 7 novembre 2026 (America/Toronto). La date de chaque collecte effective
est enregistrée dans radio-schedules.json.
Les pourcentages mesurent uniquement les minutes munies de bornes publiées,
pas la disponibilité audio ni une garantie d’exactitude.

| Station | Source officielle utilisée | Plages relues | Temps publié |
| --- | --- | ---: | ---: |
| CHYZ | https://chyz.ca/horaire/ | 46 | 36 % |
| CISM | https://cism893.ca/grille-horaire/ (données Nuxt publiques / SSR) | 110 | 100 % |
| CKUT | https://ckut.airtime.pro/api/week-info | 100 | 100 % |
| CJLO | https://www.cjlo.com/schedule/ | 123 | 100 % |
| CFAK | https://www.cfak.ca/programmation/ + payload statique explicitement lié | 36 | 50 % |
| CHOQ | https://www.choq.ca/api/graphql (requête publique existante, occurrences datées) | 27 | 16 % |

## CFAK : les fins étaient accessibles, l’ancien collecteur ne les lisait pas

La page publie un lien `/_nuxt/static/<build>/programmation/payload.js`.
Le build est extrait de la page à chaque passe, jamais codé en dur. L’actif
observé est https://www.cfak.ca/_nuxt/static/1793725584/programmation/payload.js.
Les pages HTTPS courantes avec et sans `www` ont été relues : même build du
3 novembre 2026 à 12 h 06 HNE et mêmes 36 débuts/titres. Les 36 cartes visibles
correspondent toutes au payload; aucun autre balado historique n’est ajouté.
Son objet `horaires` donne les sept jours (lundi d’abord), `emission`, `hdeb`
et `hfin`; `balados` fournit les titres et liens. Le décodeur lit exclusivement
des littéraux/références liées : aucun JavaScript distant n’est exécuté.

Les **36 fins sont maintenant sourcées**, contre 34 estimées et deux inconnues
avant cette correction. Les 36 fins reprennent maintenant les bornes exactes
publiées, dont 13 corrections de durée significatives (11 plages étirées vers
la suivante et les deux fins de semaine auparavant inconnues). Exemples :

- samedi/dimanche Les nuits CFAK : `hdeb: 0`, `hfin: 459`, soit 00:00–04:59;
- lundi Solénoïde : `1300`–`1359`, soit 13:00–13:59, pas jusqu’à 18:00;
- mardi Mix Franco : `2200`–`2359`, soit 22:00–23:59.

Le client public de la station (https://www.cfak.ca/_nuxt/1683c69.js, lu lors
de l’audit) utilise exactement `n.hdeb <= r && n.hfin > r`. `hfin` est donc
conservé comme **borne exclusive sans ajout de minute**, y compris 04:59 et
23:59. La valeur publiée reste aussi dans `sourceEnd`. Une première hypothèse
« dernière minute incluse » a été invalidée par cette vérification avant fusion.
Le lundi commence à 00:01 selon la source, ce n’est pas complété arbitrairement
à 00:00. Les 50 % réels remplacent les anciens 71/80 % gonflés par les fins
inférées. Le plancher 45 % est recalibré sur ces bornes publiées, pas sur une
disparition d’émissions.
Le repli HTML ne fournit que les débuts; il ne peut remplacer une grille dont
les fins publiées ont déjà été obtenues. Une panne conserve cette grille et
sa vraie date de lecture, avec une tentative distincte.

## CHYZ et CHOQ : chercher au-delà de la première page sans importer une archive

- CHYZ : les 46 cartes `article-horaire` de la grille produisent toutes une
  plage (46/46, aucune carte perdue). Football est bien samedi 14:30–18:30.
  La rubrique https://chyz.ca/emission/ et une trentaine de fiches absentes
  de la grille ont aussi été vérifiées : beaucoup donnent des horaires de
  saisons anciennes (archives 2023–été 2026). Exemples : Nocturne et Entre deux
  silences s’arrêtent en avril 2026; Jamono en décembre 2025. La fiche
  https://chyz.ca/emission/un-monde-de-couleurs-et-de-son/ a des épisodes récents,
  mais le catalogue dit seulement « un samedi sur deux à midi », sans fin ni
  phase d’alternance; la grille affiche déjà Un samedi d’ici 12:00–13:00.
  Ajouter une plage hebdomadaire ou une fin arbitraire serait une invention.
- CHOQ : https://www.choq.ca/horaire publie une image officielle
  https://www.choq.ca/assets/reportage/31-marsCETTE-SEMAINE-SUR-CHOQ.CA.png,
  **lue visuellement**. Elle décrit une semaine de mars, pas la saison courante
  de novembre. Aucun gabarit récurrent n’est reconstruit à partir de celle-ci.
  https://www.choq.ca/balados et les fiches publiques ne publient pas une autre
  grille antenne 24 h vérifiable. Le collecteur garde les 27 occurrences datées
  possédant un début ET une fin dans le schéma public existant; les épisodes
  sans intervalle ne deviennent pas des émissions en direct. Leurs liens
  pointent désormais vers `/balados/<slug>`, et non `/emissions/<slug>`.

Ces recherches ne justifient **aucune plage supplémentaire** CHYZ/CHOQ pour
cette semaine. Les lacunes ne sont pas remplies par des podcasts anciens ni par
une « musique nocturne » fictive. Il n’y a pas de blocage d’image dynamique
nécessitant une session navigateur connectée.

## Autres vérifications

- CJLO : 123 intervalles valides, aucune pile des 256 placeholders
  `Midnight - 0:30 AM`. Les vraies alternances restent admises. L’ancienne note
  « HTTP seulement » était périmée : HTTPS fonctionne et devient prioritaire.
- CISM : 110 plages via les données Nuxt publiques. Si `_payload.json` renvoie
  le HTML SSR, celui-ci peut être lu directement au lieu de faire une requête
  redondante; sinon la page publique reste le repli.
- CKUT : 100 plages; samedi Soca Sessions 02:00–04:00 et The Mash Time Show
  04:00–06:00 correspondent à l’API publique. Les titres techniques restent
  filtrés, sans inventer une émission pour boucher un trou.

## Chaîne existante, pas un nouveau service

`update-radio-schedules.yml` exécute deux passes quotidiennes (04 h / 13 h HNE;
05 h / 14 h HAE), ainsi que `workflow_dispatch` :

1. fixtures de régression des collecteurs;
2. revalidation des sources publiques connues; découverte élargie si elles
   échouent (`--discover-all` reste disponible pour un audit complet);
3. récupération, normalisation et contrôles (horaires impossibles, piles,
   effondrement de nombre/couverture, perte des fins publiées);
4. conservation de la dernière grille fiable en cas d’échec, **sans rajeunir
   `checkedAt`**; `attemptedAt` indique seulement la tentative;
5. génération HTML FR/EN puis gate d’intégrité avant publication.

Une erreur de génération HTML fait échouer la passe, elle n’est plus ignorée.
Les sources et dates restent consultables dans une seule rubrique repliée
« Sources et mises à jour » : pas de paragraphes répétés sur chaque carte.
Les tests couvrent aussi minuit, semaine et changements d’heure de Toronto,
l’hydratation, les fins exclusives et la barre radio (320/390/1024/1280/1440 px,
titres longs et sans espaces). Les titres de programmes du mode bureau passent
à la ligne plutôt que déborder sur les commandes ou hors écran.

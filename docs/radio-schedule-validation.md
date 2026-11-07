# Validation des horaires radio — 7 novembre 2026

Périmètre : collecte et affichage des grilles, sans changement du lecteur audio.

## Constats et corrections

- **CHYZ** : la page officielle https://chyz.ca/horaire/ annonce le football du
  samedi **14:30–18:30**. Le JSON précédent portait **13:30–17:30**. Le parseur
  reprend correctement les heures affichées : actualisation des données, sans
  décalage de fuseau ajouté ni horaire codé en dur.
- **CJLO** : https://www.cjlo.com/schedule/ émet des émissions non programmées
  avec `Midnight - 0:30 AM`, toutes dans la colonne du lundi. L'heure zéro est
  invalide dans une horloge AM/PM. Le parseur refuse ces blocs, mais conserve
  `Midnight - 12:30 AM` et les vraies alternances. Un contrôle supplémentaire
  refuse plus de huit titres distincts pour un même intervalle. Une ancienne
  grille invraisemblable ne peut pas bloquer sa propre réparation par le simple
  garde-fou du nombre de lignes.
- **CFAK** : https://www.cfak.ca/programmation/ ne fournit que les débuts. Les
  fins dérivées sont signalées comme estimées. Un jour contenant un seul début
  a une fin **inconnue**, pas une fin inventée à 07:00 ni une durée de 24 h.
  Le plancher passe de 80 à 70 % : les deux anciens `00:00–07:00` du week-end
  ajoutaient artificiellement 14 h. La couverture bornée des cinq jours de
  semaine est d'environ 71 %. Ce changement ne remplit aucun trou de source.
- **Fraîcheur** : une collecte rejetée ou indisponible conserve la date de
  vérification précédente ; `attemptedAt` trace seulement la tentative et
  `unverified` reste visible. Une journée CHOQ en erreur invalide la collecte
  de la semaine plutôt que de présenter une semaine partielle comme vérifiée.
- **Minuit** : la couverture reporte les minutes au jour suivant ; le hub et
  la grille privilégient un créneau commencé aujourd'hui plutôt qu'un ancien
  créneau de la veille qui chevauche minuit.

## Vérification et limites

`tests/radio-schedule-quality.mjs` : extraits officiels CHYZ/CJLO, AM/PM,
alternances, plausibilité, rétention, CFAK sans fin, minuit/semaine, Toronto
(aux deux changements d'heure), repli SSR CISM et erreur CHOQ.

`tests/radio-schedule-quality.spec.mjs` : hydratation du hub à 02:12 HNE,
grille CJLO mobile, priorité après minuit et captures réelles Chromium.

La couverture mesure du temps décrit, **pas** l'exactitude éditoriale ni la
santé du flux audio. Les trous CHOQ/CHYZ et les fins non publiées de CFAK restent
tributaires des stations ; le site les indique au lieu de les inventer.

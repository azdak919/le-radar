# Sports — identités, affichage et collecte (7 novembre 2026)

## Périmètre prouvé

- 93 fiches du registre, pas 93 institutions juridiques. Chaque fiche a une date de vérification et des liens primaires (institution, athlétisme ou RSEQ).
- 853 formations RSEQ observées, avec noms/codes/TeamId/InstitutionId et contexte de ligue, sport et genre; 5 clubs de voile documentés séparément. Ce n’est pas une certification de toutes les variantes historiques ou futures.
- Inventaire lisible : [93 fiches](sports-identities-inventory-2026-11-07.md). Preuves détaillées : [sources](../data/sports-identities.sources.json). Les éventuelles limites restent associées à chaque fiche.
- Un nom générique de ville ne choisit jamais une université par priorité éditoriale. TeamId officiel d’abord; institution explicite ou code exact dans son contexte ensuite. Alias ambigus conservés sans fusion d’établissements. Adversaires extérieurs explicitement nommés conservés.
- Distinctions : trois Champlain; Beauce-Appalaches/Sainte-Marie/Saint-Georges selon source; Alma Blanc/Bleu; sous-équipes colorées; universités/cégeps de Montréal et Sherbrooke; CMR Saint-Jean/Remparts et non Kingston/Paladins. Les variantes féminines sont attestées, jamais créées par féminisation grammaticale.
- McGill : Martlets/Redbirds selon contexte vérifié; sinon institution. PolyVoile est un club, pas un surnom tous sports. Le répertoire institutionnel confirme CVUL comme association; il ne suffit pas à remplacer l’identité sportive ULaVoile : conservée, distinction documentée, recherche par alias possible.
- Deux adversaires restent des cases de tableau officielles (« Gagnant QF reclassé », « Gagnant SF01 »), pas des institutions inventées.

## Collision Beauce

`BAPSG` et `BAPSM` avaient été tronqués en `BAPS`, et le TeamId Saint-Georges rattaché à Sainte-Marie. Les deux TeamId sont désormais distincts. Les [60 GameId officiels](../data/sports-match-identities.json) réparent les identités des adversaires sans changer scores, heures, URLs ou identifiants. La migration est idempotente et vérifie explicitement les invariants non identitaires.

## Laval absent / faux direct à 19 h

La rencontre Laval–Concordia du 7 novembre à 15 h, GameId `64003e15-91d7-4714-ba63-be18b75f27e6`, était bien dans `PostSeasonGames` et dans le JSON. Le générateur utilisait `Date.parse(date + 'T' + heure)` dans le fuseau de la machine CI (UTC), décalant de cinq heures les attributs repris par le navigateur : Laval paraissait expiré et le 19 h collégial paraissait déjà commencé. Les calculs sont explicitement America/Toronto; jamais de direct avant l’heure prévue. Aucun match ajouté manuellement.

Le badge distingue l’estimation selon horaire du direct confirmé par une source récente. Une absence de pointage n’est pas 0–0. Le tableau réutilise le payload et le sondage existants du mât pour les changements de score/état, sans nouvelle requête par formation et sans rechargement de page. Le payload compact inclut tous les matchs du jour/prochaines 24 heures : le plafond historique ne peut plus évincer un direct derrière des rencontres en attente.

## UI

Aujourd’hui/Today est une période civile Toronto, tous statuts. Les matchs du jour sont présents dans les cartes; les lignes hors période sélectionnée sont masquées. Un champ Établissement/Institution recherchable, placé avant les nombreuses puces sport, regroupe les fiches selon l’identité stable et distingue les campus connus; il se combine aux autres filtres et à la recherche, conserve l’URL, et dispose d’un reset explicite et d’un statut annoncé. Aucun annuaire ajouté. Les pastilles de catégorie et de direct sont mesurées à au moins 4,5:1 en clair/sombre; les contrastes insuffisants révélés par les captures ont été corrigés.

## Fiabilité de collecte

L’audit initial trouvait 112 ligues S1 réussies, zéro échec S1. Deux erreurs 403/Cloudflare sont distinctement présentes pour Spordle collégial et universitaire : ces sources ne sont pas déclarées saines. Les formations hockey sans calendrier/résultat portent un avertissement explicite; les autres résultats S1/campus restent utilisables. Les erreurs des sources non interrogées sont conservées lors d’une passe live, pas effacées artificiellement. Par ailleurs, les annulations de boucle live n’étaient pas qualifiées de panne. Aucune cadence ni routine ajoutée. Changements ciblés :

- file S1 finie, trois requêtes simultanées maximum; priorité aux ligues avec un direct connu, FIFO à priorité égale;
- deux tentatives maximum, timeout par requête, échéance globale de récolte; retries seulement sur panne transitoire/429/5xx, backoff/jitter, Retry-After respecté;
- coalescence par URL pendant une récolte; pas de répétition concurrente d’un même travail;
- hockey/voile isolés de S1; hockey borné à deux secteurs; le mode live S1 ne relance plus inutilement Spordle;
- conservation des bonnes données précédentes en panne partielle (même une panne majoritaire S1 n’interdit pas de publier les autres sources si le bon snapshot S1 est conservé), notamment un seul secteur hockey; tri déterministe;
- `queuedAt`, `lastAttemptAt`, `lastSuccessAt` distincts par ligue S1. Une donnée conservée ne devient pas artificiellement un nouveau succès.

Les tests hors réseau couvrent concurrence, coalescence, panne isolée, délai, retry, cooldown, échéance et nouvelle récolte. Les résultats de CI et des vérifications publiques doivent être ajoutés à la livraison : ce document n’affirme pas un déploiement qui n’a pas encore eu lieu.

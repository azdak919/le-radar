# Surveillance des flux radio, sans agent de chat

`Update Radio Streams` utilise GitHub Actions, Node 24 et ffmpeg déjà présents dans le projet. Aucun modèle IA, service payant, abonnement ou nouvelle clé. Les quotas Actions du compte n'ont pas été vérifiés : le budget ci-dessous borne le travail, pas la facture du compte.

## Cadence / budget

- Toutes les 6 heures : chaque station est réellement revalidée, même précédemment `working`. HTTPS natif strict, SNI et chaîne TLS, échéances feuille/intermédiaires, redirections HTTPS seulement (au plus cinq sauts interrogés), rejet des IP locales/privées/réservées et de toute réponse DNS contenant une telle IP ; adresse publique validée épinglée à la connexion, à chaque redirection, HTTP 200, MIME audio/octet-stream et rejet HTML.
- Échantillon léger de 2 Ko ; audio décodé de nouveau normalement chaque jour (seuil de relance 20 h, preuve valable 26 h), ou dès incident / changement de flux. Pour ce contrôle : maximum 128 Ko et 6 s par requête, décodage PCM ffmpeg de 2 s, délai processus 8 s. Le silence est décodable mais signalé ; ce n'est pas une preuve d'émission correcte. Absence de ffmpeg / échantillon vide / timeout => **unknown**, jamais working.
- Réparation : au plus deux pages officielles configurées, quatre alternatives. URL littéralement publiée dans un lecteur live principal identifié pour la station : attributs explicites `data-station` + `data-live`, ou adaptateur documenté CISM `header .element-audio-player-live audio` sur cism893.ca. Aucun lien générique « écouter/stream », publicité ni lecteur partenaire. Une API doit être référencée par ce lecteur et renvoyer exactement le même `stationId` + `audio_stream_uri` ; une playlist doit elle aussi être référencée par ce lecteur (pas de segments HLS). Cette couverture conservatrice peut ne proposer aucun repli pour certains sites ; aucun domaine/port/chemin deviné, aucun HTTP ni certificat désactivé. Alternative acceptée seulement après son propre contrôle TLS + vrai décodage. Provenance conservée. Les normalisations CDN RadioMast/StreamTheWorld déjà documentées par le projet restent permises et sont revalidées elles-mêmes ; les mounts techniques/ICY de tests restent refusés. Une échéance à 2 j peut déclencher une recherche, sans remplacer par une autre échéance aussi courte.
- Candidatures : au plus quatre par semaine, lundi, par la même voie officielle stricte ; les autres restent en registre. Une station validée mais sans grille/métadonnées reste candidate : elle ne doit pas bloquer le gate du catalogue existant. La découverte exploratoire historique reste disponible manuellement, mais ses URLs conjecturales ne sont plus publiées par le workflow.

Une sonde légère n'est pas un décodeur de 20 s par station/heure. Le workflow reste borné à 30 minutes, dans la file `data-writers-site`, et réutilise le gate d'intégrité / bot-push existants. Les coûts dépendent des quotas du dépôt.

## États, journal et lecture

`data/radio-health.json` contient dernière vérification, URL/redirections, échéances TLS, MIME, preuve audio, erreur, dernier succès, échecs consécutifs, provenance et 12 transitions maximum par station. La preuve audio est liée à l'URL exacte : tout changement d'endpoint force le décodage, sans réutiliser la preuve de l'ancien flux. Chaque migration garde une preuve durable `adoption` (identité de station, sélecteur/champ officiel, TLS et audio valides au moment du changement). L'intégrité de cette adoption ne dépend pas de la disponibilité future : une panne ultérieure, une exception ou un rapport vieilli peuvent publier `broken`/`unknown` et le diagnostic sans bloquer le gate ; l'état courant et les alertes restent contrôlés séparément. Un incident d'une station n'empêche pas les autres contrôles. Le rapport est créé par la première exécution après déploiement.

- `working` : HTTPS/TLS valide et audio décodé récent ; alertes d'échéance à 14/7/2 j.
- `broken` : TLS refusé/expiré, downgrade, HTML ou audio non décodable. L'URL est conservée pour retester et diagnostiquer mais **le lecteur ne l'utilise pas**. Pas de remplacement sans preuve officielle.
- `unknown` : réseau, outils ou preuve incomplets ; jamais réétiqueté working par simple conservation de l'ancienne URL.

Pour reproduire sans modifier : `node scripts/check-radio-health.js`. Pour écrire le rapport/catalogue : `node scripts/check-radio-health.js --update`. Tests sans réseau : `node tests/radio-health.mjs` (aussi dans npm check). Un vrai WAV est décodé si ffmpeg est installé ; son absence est testée comme unknown.

## Alertes existantes, sans nouveau canal

À la fin du workflow radio, `Platform Health` réutilise **la même issue** « Santé de la plateforme (bot) » et ses permissions existantes. Empreinte des problèmes/paliers indépendante de l'horodatage : pas d'édition/notification répétée si rien ne change. Rétablissement => fermeture si aucun autre problème plateforme. Rapport absent, invalide ou vieux de plus de 14 h => alerte de surveillance périmée ; le contrôle quotidien plateforme reste un filet si la radio ne tourne plus.

Nous ne pouvons pas renouveler les certificats d'un tiers, garantir qu'une station publiera une alternative, détecter instantanément une panne entre deux sondes ou promettre zéro panne. Consulter le rapport et les logs Actions ; si aucun repli officiel valide n'existe, la station doit réparer sa diffusion.

# Surveillance des flux radio, sans agent de chat

`Update Radio Streams` utilise GitHub Actions, Node 24 et ffmpeg déjà présents dans le projet. Aucun modèle IA, service payant, abonnement ou nouvelle clé. Les quotas Actions du compte n'ont pas été vérifiés : le budget ci-dessous borne le travail, pas la facture du compte.

## Cadence / budget

- Toutes les 6 heures : chaque station est réellement revalidée, même précédemment `working`. HTTPS natif strict, SNI et chaîne TLS, échéances feuille/intermédiaires, redirections HTTPS seulement (5 maximum), HTTP 200, MIME audio/octet-stream et rejet HTML.
- Échantillon léger de 2 Ko ; audio décodé de nouveau au plus tard après 26 h, ou dès incident / changement de flux. Pour ce contrôle : maximum 128 Ko et 6 s par requête, décodage PCM ffmpeg de 2 s, délai processus 8 s. Le silence est décodable mais signalé ; ce n'est pas une preuve d'émission correcte. Absence de ffmpeg / échantillon vide / timeout => **unknown**, jamais working.
- Réparation : au plus deux pages officielles configurées, quatre alternatives. URL littéralement publiée dans lecteur/page/API ou playlist officielle ; aucun domaine/port/chemin deviné, aucun HTTP ni certificat désactivé. Alternative acceptée seulement après son propre contrôle TLS + vrai décodage. Provenance conservée. Une échéance à 2 j peut déclencher une recherche, sans remplacer par une autre échéance aussi courte.
- Candidatures : au plus quatre par semaine, lundi, par la même voie officielle stricte ; les autres restent en registre. La découverte exploratoire historique reste disponible manuellement, mais ses URLs conjecturales ne sont plus publiées par le workflow.

Une sonde légère n'est pas un décodeur de 20 s par station/heure. Le workflow reste borné à 30 minutes, dans la file `data-writers-site`, et réutilise le gate d'intégrité / bot-push existants. Les coûts dépendent des quotas du dépôt.

## États, journal et lecture

`data/radio-health.json` contient dernière vérification, URL/redirections, échéances TLS, MIME, preuve audio, erreur, dernier succès, échecs consécutifs, provenance et 12 transitions maximum par station. Un incident d'une station n'empêche pas les autres contrôles. Le rapport est créé par la première exécution après déploiement.

- `working` : HTTPS/TLS valide et audio décodé récent ; alertes d'échéance à 14/7/2 j.
- `broken` : TLS refusé/expiré, downgrade, HTML ou audio non décodable. L'URL est conservée pour retester et diagnostiquer mais **le lecteur ne l'utilise pas**. Pas de remplacement sans preuve officielle.
- `unknown` : réseau, outils ou preuve incomplets ; jamais réétiqueté working par simple conservation de l'ancienne URL.

Pour reproduire sans modifier : `node scripts/check-radio-health.js`. Pour écrire le rapport/catalogue : `node scripts/check-radio-health.js --update`. Tests sans réseau : `node tests/radio-health.mjs` (aussi dans npm check). Un vrai WAV est décodé si ffmpeg est installé ; son absence est testée comme unknown.

## Alertes existantes, sans nouveau canal

À la fin du workflow radio, `Platform Health` réutilise **la même issue** « Santé de la plateforme (bot) » et ses permissions existantes. Empreinte des problèmes/paliers indépendante de l'horodatage : pas d'édition/notification répétée si rien ne change. Rétablissement => fermeture si aucun autre problème plateforme. Rapport absent, invalide ou vieux de plus de 14 h => alerte de surveillance périmée ; le contrôle hebdomadaire plateforme reste un filet si la radio ne tourne plus.

Nous ne pouvons pas renouveler les certificats d'un tiers, garantir qu'une station publiera une alternative, détecter instantanément une panne entre deux sondes ou promettre zéro panne. Consulter le rapport et les logs Actions ; si aucun repli officiel valide n'existe, la station doit réparer sa diffusion.

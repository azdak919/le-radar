# Compteur sportif — laissé de côté

Décision du 17 novembre 2026 : le mécanisme reste dans le dépôt. On ne l’allume pas.

Deux pièces sont déjà écrites. Les deux sont au repos.

Le **compteur** est dans `radar-audience.js`. L’interrupteur est faux et l’adresse est vide. Un clic sur une carte de match n’envoie rien. Le jour où on l’allume, le message ne contient que le nom `sport` et un contexte court (le sport et la page, accueil ou sports). La voile part sous le nom `sailing`. Pas d’adresse, pas de navigateur, pas de personne. Le script Umami déjà présent sur d’autres pages reste.

Le **poids** est le départage dans `sportsCompareOpenOrder`, via `sportsAudienceTie`. Il ne peut bouger deux cartes que si elles sont dans le même groupe et à la même heure. Encore faut-il que la porte soit ouverte : compteur allumé, quatre à huit semaines, un seuil fourni, des moyennes déjà lissées. Cette porte est fermée. L’ordre affiché est celui d’aujourd’hui.

La page Mise à jour n’a que la ligne Socle. Aucune version n’est proposée.

Un « go » plus tard allume le compteur. Il n’ouvre pas la porte, et il ne change pas l’ordre des cartes. Avant ce « go », il faut une machine du Radar qui reçoit les clics, et la phrase prévue dans la politique. Cette phrase n’est pas publiée tant que l’envoi n’existe pas.

Pull requests : [443](https://github.com/azdak919/le-radar/pull/443), [452](https://github.com/azdak919/le-radar/pull/452).

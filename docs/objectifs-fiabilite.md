# Objectifs internes de fiabilité

Ces objectifs servent à détecter les régressions et à prioriser la maintenance.
Ils ne constituent pas une garantie de service.

## Indicateurs

| Domaine | Objectif | Signal d'alerte |
|---|---:|---:|
| Fil d'actualités | dernière passe réussie depuis moins de 90 min | plus de 3 h |
| Métadonnées radio | dernière collecte depuis moins de 90 min | plus de 3 h |
| Sources actives | au moins 90 % joignables sur 24 h | moins de 80 % |
| Radios listées | 100 % avec une méthode d'écoute valide | une radio inutilisable |
| Intégrité articles | 0 doublon, lien invalide ou champ essentiel manquant | toute occurrence |
| Une éditoriale | auteur/extrait/crédit contrôlés | crédit manquant ou erreur signalée |
| Interface | 0 erreur JavaScript et 0 débordement horizontal sur les routes testées | toute régression CI |

Pendant les creux du calendrier étudiant, une source sans nouvel article n'est
pas automatiquement considérée en panne. La fraîcheur du contenu et la santé
technique du flux sont mesurées séparément.

## Niveaux d'incident

- **Critique** — page principale indisponible, données illisibles, flux malveillant
  ou attribution gravement erronée : intervention dès que possible.
- **Dégradé** — plusieurs sources ou radios simultanément indisponibles, fil figé
  plus de trois heures : investigation lors de la prochaine fenêtre disponible.
- **Mineur** — une source, une image ou une grille défaillante avec repli valide :
  correction planifiée ou automatique.

## Contrôles avant intégration

La commande `npm test` doit réussir pour tout changement de code. Elle couvre :

- la syntaxe de tous les fichiers JavaScript;
- les invariants du Solitaire;
- la validité et les relations des fichiers JSON;
- les liens locaux et les assets mis en cache par les trois PWA;
- le contrat de l'iframe radio dans Pomodoro et Solitaire;
- l'ouverture de l'accueil, des flux RSS et des deux mini-apps en bureau et
  mobile, sans erreur JavaScript ni débordement horizontal;
- la conservation du document qui porte l'audio pendant la navigation et le
  transfert du rôle de lecteur principal entre deux pages.

Les données générées par les bots conservent leurs contrôles spécialisés. Un
changement éditorial est publié immédiatement; un rafraîchissement limité aux
timestamps ne produit au plus qu'un heartbeat Git toutes les six heures.

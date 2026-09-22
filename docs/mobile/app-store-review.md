# Revue App Store et Play

Ce texte ne promet pas une approbation. Il décrit le produit tel qu’il est, pour que la fiche et les notes de revue ne disent pas autre chose.

Sources lues le 21 septembre 2026 :

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), sections 4.2, 4.2.2 et 5.2.1
- [Play target API level](https://developer.android.com/google/play/requirements/target-sdk)

## Ce qu’est LE-RADAR

LE-RADAR agrège des titres, des extraits et des liens vers des journaux, radios et pages d’établissements étudiants du Québec. La publication d’origine reste la destination du texte. Le projet est libre (GPL-2.0). Le site [le-radar.ca](https://le-radar.ca/) continue d’exister sans l’application.

## Pourquoi une application

L’application n’affiche pas le site dans une WebView. Elle a sa propre navigation et des fonctions qui n’existent pas comme produit sur le site :

- suivre des médias, des régions et des mots-clés, et masquer une source, sur l’appareil ;
- enregistrer des articles et revoir les fiches récemment ouvertes ;
- relire le dernier fil chargé sans réseau ;
- partager l’URL originale, ou la fiche LE-RADAR, avec la feuille de partage du système ;
- ouvrir l’original dans le navigateur du système, avec le nom de la publication sur le bouton ;
- ouvrir un lien `le-radar.ca` déjà connu (journal, radio, établissement, fiche) dans l’écran correspondant.

Le mât, les sports, Pomodoro et Solitaire restent sur le Web.

## Risque 4.2 et 4.2.2

La ligne 4.2 demande une application utile au-delà d’un site reconditionné. La ligne 4.2.2 dit qu’en dehors des catalogues, une application ne devrait pas être surtout un agrégateur ou une collection de liens.

LE-RADAR est un annuaire. Ce risque est réel. La mitigation n’est pas de le cacher :

- on ne republie pas les articles ;
- la valeur ajoutée est le classeur personnel (suivis, masques, favoris, hors ligne, recherche dans le fil) ;
- chaque fiche dit qui a publié le texte et envoie vers cette publication ;
- l’application n’intercepte pas tout le domaine.

Un refus reste possible. Dans ce cas, le site et la PWA demeurent le produit. Il ne faut pas contourner une remarque de revue en déguisant le même site.

Play a la même attente pour une WebView sans fonction propre. Le même découpage s’applique. La cible API 36 est en place pour l’échéance du 31 août 2026.

## 5.2.1 — matériel des autres

Les marques, logos et textes appartiennent aux médias et aux établissements. L’application reprend les champs déjà publics du fil (titre, extrait, image vedette, lien) et nomme la source. Elle n’ajoute pas de scraping. L’icône de lancement est celle déjà utilisée par la PWA LE-RADAR, pas le logo d’un média.

## Notes proposées pour App Review

```text
LE-RADAR is a free, open-source discovery app for Québec student newspapers,
campus radio and campus pages. It is not a publisher and not a wrapped copy
of https://le-radar.ca/.

No account is required. Follows, hides, keywords, favorites and reading
history stay on the device. The app does not include analytics, ads or tracking.

Open Accueil to read the current feed. Open an article card to see the
discovery sheet: source, excerpt, and “Lire chez {publication}”, which opens
the original article in the system browser. Enregistrés stores favorites.
Explorer follows or hides a publication. Réglages explains that system
notifications are not sent.

Sample links once the app is installed:
https://le-radar.ca/journaux/la-pige/
https://le-radar.ca/article/?id=  (any id shown by sharing “Partager la fiche”)

The website keeps working if the app is not installed. Associated domains
cover only /article, /journaux, /radios and /etablissements.
```

## Play — notes internes

Même description. Indiquer que l’application n’est pas un client WebView du site, qu’elle ne demande qu’Internet, et que la politique de confidentialité est celle de `store/google/privacy.md`.

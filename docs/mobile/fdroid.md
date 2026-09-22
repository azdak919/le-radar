# F-Droid

Décision du 2026-09-21 : **F-Droid est le canal de distribution voulu** pour l’application Android. Play et l’App Store restent différés. L’humain n’a pas le temps de créer les comptes ni de remplir les fiches. Ne pas relancer cette inscription tant qu’il ne le demande pas.

## Pourquoi F-Droid

L’application est GPL-2.0, sans compte, sans publicité, sans Firebase et sans les services Google Play. Elle se construit avec Gradle à partir de ce dépôt. C’est le magasin qui correspond au projet.

## Fiche

Les textes lus par le client F-Droid sont dans `fastlane/metadata/android/` (`en-US` obligatoire, `fr-CA` en plus). L’icône est `fastlane/metadata/android/en-US/images/icon.png`.

Version publiée : `versionName` 1.0.0, `versionCode` 1. L’étiquette `v1.0.0` existe déjà pour le site (juillet 2026). Le build F-Droid est donc épinglé au commit qui contient l’application, pas à cette étiquette. Une prochaine version de l’application devra avoir un numéro plus haut, par exemple `1.0.1`, et une étiquette `v1.0.1`.

Le build de publication n’a pas de clé dans le dépôt. Sans `android/keystore.properties`, `assembleRelease` produit un APK non signé. F-Droid le signe.

## Recette

La copie de la recette est [ca.leradar.app.yml](ca.leradar.app.yml). Dans le dépôt F-Droid elle s’appelle `metadata/ca.leradar.app.yml`. Elle prévoit :

- dépôt `https://github.com/azdak919/le-radar`
- `commit: 81774e4ab824c8c8a03afa106e81459c661c7d1a`
- `subdir: android/app` (modèle F-Droid React Native, adapté à Capacitor : pas d’Expo ni de stub Firebase)
- `npm` de Debian forky (Node 22 exigé par Capacitor ; trixie est en Node 20), puis `npm ci` et `npm run mobile:sync`
- `gradle: yes`
- APK : `build/outputs/apk/release/app-release-unsigned.apk`

F-Droid signe lui-même. La clé d’envoi Play ne sert pas.

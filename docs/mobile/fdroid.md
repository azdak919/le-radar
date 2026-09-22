# F-Droid

Décision du 2026-09-21 : **F-Droid est le canal de distribution voulu** pour l’application Android. Play et l’App Store restent différés. L’humain n’a pas le temps de créer les comptes ni de remplir les fiches. Ne pas relancer cette inscription tant qu’il ne le demande pas.

## Pourquoi F-Droid

L’application est GPL-2.0, sans compte, sans publicité, sans Firebase et sans les services Google Play. Elle se construit avec Gradle à partir de ce dépôt. C’est le magasin qui correspond au projet.

## Fiche

Les textes lus par le client F-Droid sont dans `fastlane/metadata/android/` (`en-US` obligatoire, `fr-CA` en plus). L’icône est `fastlane/metadata/android/en-US/images/icon.png`.

Version publiée : `versionName` 1.0.0, `versionCode` 1, étiquette git `v1.0.0`.

Le build de publication n’a pas de clé dans le dépôt. Sans `android/keystore.properties`, `assembleRelease` produit un APK non signé. F-Droid le signe.

## Recette

La copie de la recette est [ca.leradar.app.yml](ca.leradar.app.yml). Dans le dépôt F-Droid elle s’appelle `metadata/ca.leradar.app.yml`. Elle prévoit :

- dépôt `https://github.com/azdak919/le-radar`
- `commit: v1.0.0`
- `subdir: android`
- Node 20 officiel, puis `npm ci` et `npm run mobile:sync`
- `gradle: yes`
- APK : `app/build/outputs/apk/release/app-release-unsigned.apk`

F-Droid signe lui-même. La clé d’envoi Play ne sert pas.

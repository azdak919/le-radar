# F-Droid

Décision du 2026-09-21 : **F-Droid est le canal de distribution voulu** pour l’application Android. Play et l’App Store restent différés. L’humain n’a pas le temps de créer les comptes ni de remplir les fiches. Ne pas relancer cette inscription tant qu’il ne le demande pas.

## Pourquoi F-Droid

L’application est GPL-2.0, sans compte, sans publicité, sans Firebase et sans les services Google Play. Elle se construit avec Gradle à partir de ce dépôt. C’est le magasin qui correspond au projet.

## Fiche

Les textes lus par le client F-Droid sont dans `fastlane/metadata/android/` (`en-US` obligatoire, `fr-CA` en plus). L’icône est `fastlane/metadata/android/en-US/images/icon.png`.

Version courante dans le dépôt : `versionName` 1.0.1, `versionCode` 2 (R8 / `minifyEnabled true`).
Première candidature F-Droid (MR) : `versionName` 1.0.0, `versionCode` 1, étiquette `android-v1.0.0` (commit `81774e4a`).
Pour la revue R8 : utiliser `versionName` 1.0.1 / `versionCode` 2 au commit `21a3e0b222df6dd76c5769de0fa404f91ea0d34a` (puis étiquette `android-v1.0.1` sur ce commit quand la publication est prête).

## Étiquettes

- `android-vX.Y.Z` : versions de l’application Android (F-Droid). Seule convention pour l’application.
- `v*` : versions du site. L’étiquette `v1.0.0` (juillet 2026) est celle du site et ne contient pas l’application.

La recette F-Droid ne lit que les étiquettes `android-v` (`UpdateCheckMode: Tags ^android-v`). F-Droid construit le commit de l’étiquette trouvée (`AutoUpdateMode: Version`).

Pour publier une nouvelle version, par exemple 1.0.1 :

1. Dans `android/app/build.gradle`, monter `versionName` (`1.0.1`) et `versionCode` (toujours plus haut : `2`).
2. Ajouter `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, et `fr-CA` si possible.
3. Fusionner sur `main`, puis étiqueter ce commit `android-v1.0.1` et pousser l’étiquette.

Ne pas déplacer une étiquette `android-v*` déjà poussée. F-Droid l’a peut-être déjà construite.

Le build de publication n’a pas de clé dans le dépôt. Sans `android/keystore.properties`, `assembleRelease` produit un APK non signé. F-Droid le signe.

## Recette

La copie de la recette est [ca.leradar.app.yml](ca.leradar.app.yml). Dans le dépôt F-Droid elle s’appelle `metadata/ca.leradar.app.yml`. Elle prévoit :

- dépôt `https://github.com/azdak919/le-radar`
- `commit: 81774e4ab824c8c8a03afa106e81459c661c7d1a`
- `subdir: android/app` (modèle F-Droid React Native, adapté à Capacitor : pas d’Expo ni de stub Firebase)
- `nodejs` et `npm` de Debian forky, installés ensemble (Node 24). `@capacitor/cli` 8.5.2 exige Node >= 22, trixie livre Node 20, et le paquet `npm` de forky dépend de `nodejs:any` : l’installer seul peut laisser Node 20. Ensuite `npm ci` et `npm run mobile:sync`
- `gradle: yes`
- APK : `build/outputs/apk/release/app-release-unsigned.apk`
- mises à jour : `AutoUpdateMode: Version` et `UpdateCheckMode: Tags ^android-v`

F-Droid signe lui-même. La clé d’envoi Play ne sert pas.

## Keep Android Open

F-Droid (site et clients) affiche un bandeau pour la campagne [Keep Android Open](https://keepandroidopen.org/fr/) contre la vérification obligatoire des développeurs Google (2027). LE-RADAR n’embarque pas le script distant `banner.js` (réseau tiers / NonFreeNet) : une ligne discrète dans le pied de page du site et dans Réglages de l’application pointe vers la page française. Aucun compte à rebours, aucun script tiers.


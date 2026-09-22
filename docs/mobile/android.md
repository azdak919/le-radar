# Android

Capacitor 8. Cible vérifiée dans `android/variables.gradle` : `compileSdkVersion` et `targetSdkVersion` **36**, `minSdkVersion` **24**.

Cela correspond à l’exigence Play en vigueur au 31 août 2026 : les nouvelles applications et les mises à jour visent Android 16 / API 36. Source : [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk). API 24 couvre Android 7 et la base documentée par Capacitor.

## Machine Linux

1. JDK **21** (Temurin ou équivalent). Le JDK 25 de la machine de développement n’est pas celui du build CI.
2. Android SDK : platform 36, build-tools correspondants, platform-tools.
3. `ANDROID_HOME` pointé vers ce SDK.

```bash
npm ci
npm run android:debug
```

Le APK de debug est dans `android/app/build/outputs/apk/debug/`. `npm run mobile:android` ouvre Android Studio.

`npm run mobile:sync` régénère `mobile/www` et le copie dans le projet natif. Ces copies sont gitignorées.

## App Bundle

`npm run android:bundle` produit un AAB seulement si `android/keystore.properties` existe :

```properties
storeFile=upload-key.keystore
storePassword=…
keyAlias=…
keyPassword=…
```

`storeFile` est relatif à `android/app/`. Le trousseau et `keystore.properties` restent hors git.

Play App Signing est le mode à utiliser : la clé du dépôt est une clé d’envoi, pas la clé de signature finale. L’empreinte SHA-256 à mettre dans `.well-known/assetlinks.json` est celle du certificat **App Signing** affichée dans Play Console, pas forcément celle de la clé d’envoi.

Le workflow `Mobile` construit un AAB avec une clé jetable, pour prouver que Gradle passe. Cette clé ne doit pas être envoyée à Play.

## App Links

`AndroidManifest.xml` revendique seulement :

- `https://le-radar.ca/article`
- `https://le-radar.ca/journaux`
- `https://le-radar.ca/radios`
- `https://le-radar.ca/etablissements`

et les mêmes chemins sur `www.le-radar.ca`. `android:autoVerify="true"`. Le site entier n’est pas intercepté.

Permission déclarée : `INTERNET`. `usesCleartextTraffic` est faux. Pas de localisation, caméra, micro, notifications, ni identifiant publicitaire.

Le gabarit Capacitor cherche `google-services.json` et n’applique le plugin que si ce fichier existe. Ne pas l’ajouter : l’application n’utilise pas Firebase.

## Bord à bord

`capacitor.config.json` laisse `adjustMarginsForEdgeToEdge` sur `auto`. Le CSS utilise `viewport-fit=cover` et `env(safe-area-inset-*)`. Le retour système est géré dans l’application (pile de navigation, puis sortie depuis l’accueil).

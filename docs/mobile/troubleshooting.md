# Dépannage

## L’interface web est vide

Servir la racine du dépôt, pas seulement `mobile/app/`. Le fil est `../../news.json`.

```bash
python3 -m http.server 8080
```

Ouvrir `http://127.0.0.1:8080/mobile/app/`.

## `android:debug` ne trouve pas le SDK

`ANDROID_HOME` doit contenir la plateforme 36. Le JDK du build est 21. Avec le JDK 25 du système, Gradle 8.14 s’arrête sur `Unsupported class file major version 69`. Pointer `JAVA_HOME` vers un JDK 21.

Après un clone : `npm run mobile:sync` avant d’ouvrir Android Studio. Les assets web et `capacitor-cordova-android-plugins` ne sont pas dans git.

## L’AAB n’est pas signé

`android/keystore.properties` manque. Le voir dans [publishing.md](publishing.md). Le workflow `Mobile` utilise une clé jetable uniquement dans le runner.

## iOS ne se compile pas sous Linux

C’est attendu. Utiliser le workflow `Mobile` ou un Mac. `CODE_SIGNING_ALLOWED=NO` suffit pour la compile de vérification. L’archive App Store a besoin des secrets de l’environnement `app-store`.

## Le lien le-radar.ca n’ouvre pas l’application

1. `TEAMID` est encore le texte du modèle dans `apple-app-site-association`.
2. L’empreinte Play dans `assetlinks.json` est encore `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`.
3. Le chemin n’est pas `/article`, `/journaux`, `/radios` ou `/etablissements`. L’accueil du site ne doit pas être capturé.
4. GitHub Pages sert le fichier Apple avec un mauvais type MIME. Voir [ios.md](ios.md).

## Le service worker du site montre une vieille page

L’application Capacitor n’enregistre pas le service worker du site. Un problème de cache sur le-radar.ca se règle comme avant (`npm run sw:bump` si un asset du shell web a changé). Ne pas bumper le shell pour des fichiers qui sont seulement sous `mobile/`.

## Tests

```bash
node tests/mobile-core.mjs
npx playwright test tests/mobile-shell.spec.mjs --grep @ci-critical
```

La suite `npm run check` inclut `tests/mobile-core.mjs`. Elle ne lance pas Gradle.

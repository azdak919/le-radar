# iOS

Le projet Xcode est `ios/App/App.xcodeproj`. Identifiant : `ca.leradar.app`. Nom affiché : LE-RADAR. Déploiement : iOS 15, comme le gabarit Capacitor 8. iPhone en portrait ; iPad dans les quatre orientations.

Ce dépôt peut être cloné et modifié sous Linux. La compilation iOS demande macOS et Xcode. Le workflow `Mobile` lance un `xcodebuild` **sans signature** sur `macos-latest` pour vérifier que le projet se compile.

## Ouvrir le projet

Sur un Mac :

```bash
npm ci
npm run mobile:sync
npm run mobile:ios
```

Capacitor 8 demande Android Studio 2025.2.1 côté Android ; côté iOS, utiliser une version de Xcode encore acceptée par App Store Connect au moment de la soumission. Ne pas figer ici un numéro qui aura changé : la page [Submitting](https://developer.apple.com/news/upcoming-requirements/) d’Apple fait foi.

## Signature

Aucune identité de signature n’est dans le dépôt. `CODE_SIGN_STYLE` est Automatic.

L’archive de publication est le workflow `Mobile release`, environnement GitHub `app-store`. Secrets :

| Secret | Rôle |
|---|---|
| `APPLE_TEAM_ID` | équipe à dix caractères |
| `APPLE_APP_STORE_CONNECT_KEY_ID` | identifiant de la clé API |
| `APPLE_APP_STORE_CONNECT_ISSUER_ID` | émetteur App Store Connect |
| `APPLE_APP_STORE_CONNECT_API_KEY_BASE64` | contenu du fichier `.p8`, encodé en base64 |

La clé API sert à `-allowProvisioningUpdates`. Il faut aussi qu’un certificat de distribution et un profil existent pour `ca.leradar.app`, ou que la clé ait le droit de les créer. Le workflow ne contient pas de certificat.

## Universal Links

`ios/App/App/App.entitlements` déclare `applinks:le-radar.ca` et `applinks:www.le-radar.ca`.

Le fichier associé sur le site est `.well-known/apple-app-site-association`. Remplacer `TEAMID` par l’équipe Apple avant de compter sur les liens. GitHub Pages sert souvent ce fichier en `application/octet-stream`. `_headers` fixe le type pour les miroirs Netlify et Cloudflare. Si Apple refuse le fichier, le placer derrière un hôte qui envoie `application/json`, sans redirection.

Les chemins revendiqués sont `/article/*`, `/journaux/*`, `/radios/*`, `/etablissements/*`.

## Confidentialité Apple

`ios/App/App/PrivacyInfo.xcprivacy` déclare : pas de suivi, pas de données collectées, pas d’API à motif requis appelée par l’application elle-même.

Le SDK Capacitor iOS embarque son propre manifeste (`PrivacyInfo.xcprivacy` dans le paquet `@capacitor/ios`). Il ne déclare pas de suivi. Ne pas ajouter `NSUserTrackingUsageDescription`. Il n’y a pas de caméra, de photos, ni de position.

`ITSAppUsesNonExemptEncryption` est faux : seule la navigation HTTPS standard est utilisée.

## Icône

`AppIcon-512@2x.png` (1024 px) est un agrandissement de `assets/icon-512.png`, régénéré par `python3 mobile/scripts/rasterize-brand.py`. Avant la soumission, remplacer ce fichier par un master dessiné en 1024. Apple refuse les icônes floues et les captures qui ne montrent pas l’application.

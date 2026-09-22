# LE-RADAR mobile

Application iOS et Android de découverte des médias étudiants. Elle lit le même fil que [le-radar.ca](https://le-radar.ca/) (`news.json`, `news-sources.json`, `radios.json`) et ne remplace pas le site.

Le site reste le produit web : mât, sports, syntoniseur complet, pages SEO, PWA. L’application est une autre surface, dans le même dépôt, avec Capacitor 8.

| Document | Contenu |
|---|---|
| [architecture.md](architecture.md) | Pourquoi ce découpage, données partagées, liens, hors ligne, notifications |
| [android.md](android.md) | SDK 36, build Linux, App Links |
| [ios.md](ios.md) | Xcode, Universal Links, manifeste de confidentialité |
| [fdroid.md](fdroid.md) | Canal voulu : F-Droid. Play et App Store plus tard |
| [publishing.md](publishing.md) | Signatures, CI, TestFlight, Play, captures |
| [app-store-review.md](app-store-review.md) | Risque 4.2 / 4.2.2 et notes pour la revue |
| [privacy.md](privacy.md) | Ce que l’application fait vraiment |
| [troubleshooting.md](troubleshooting.md) | Pannes fréquentes |

## Prérequis

- Node 20 ou plus (`npm ci` à la racine)
- Android : JDK 21, Android SDK, compile/target **API 36**. Android Studio 2025.2.1 ou plus récent si vous ouvrez le projet.
- iOS : macOS et Xcode à jour. Fedora ne compile pas iOS. Le workflow `Mobile` le fait sur un runner macOS.

Aucun compte Apple ou Google n’est nécessaire pour travailler sur l’interface.

## Commandes

```bash
npm test                      # site + tests mobiles unitaires
npm run mobile:sync           # mobile/www, puis projets natifs
npm run android:debug         # APK de debug
npm run android:bundle        # AAB ; exige android/keystore.properties
npm run mobile:android        # Android Studio
npm run mobile:ios            # Xcode (macOS)
```

Interface dans le navigateur, sans SDK :

```bash
python3 -m http.server 8080
# http://127.0.0.1:8080/mobile/app/
```

La fiche web d’un article, valide sans l’application : `/article/?id=<16 hex>`. Elle est en `noindex`.

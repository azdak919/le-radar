# Publication

Rien n’est envoyé aux magasins depuis un commit. Deux workflows :

| Workflow | Quand | Résultat |
|---|---|---|
| `Mobile` | pull request qui touche l’app, ou lancement manuel | APK debug, AAB signé par une clé jetable, compile iOS sans signature |
| `Mobile release` | lancement manuel, environnements `play-store` et `app-store` | AAB avec la vraie clé d’envoi ; archive Xcode si les secrets Apple sont là |

`upload: true` sur `Mobile release` n’envoie pas le binaire. Il rappelle où le déposer. L’envoi reste un geste humain.

## Secrets à créer

Android, environnement `play-store` :

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Créer la clé d’envoi une fois, hors git :

```bash
keytool -genkeypair -v -keystore upload-key.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload-key.keystore
```

Après la première mise en ligne, copier l’empreinte SHA-256 **Play App Signing** dans `.well-known/assetlinks.json` à la place de `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`.

Apple, environnement `app-store` : voir [ios.md](ios.md). Remplacer aussi `TEAMID` dans `apple-app-site-association`.

## Play Console

1. Créer l’application `ca.leradar.app`, gratuite, sans publicité.
2. Activer Play App Signing.
3. Test interne : téléverser l’AAB de l’artefact `le-radar-release-aab`.
4. Questionnaire contenu, classification IARC, politique de confidentialité : [privacy.md](privacy.md) et `store/google/privacy.md`.
5. Captures téléphone : au moins deux, montrant l’accueil, une fiche et Enregistrés. Pas le seul écran de démarrage.
6. Déclaration des autorisations : Internet seulement. Pas d’identifiant publicitaire.

Cible API : 36. Voir [android.md](android.md).

## App Store Connect

1. Fiche `ca.leradar.app`, prix gratuit, pas d’achat intégré.
2. URL d’assistance : `https://le-radar.ca/`.
3. Politique de confidentialité : URL publique qui reprend `store/apple/privacy.md` (la page markdown du dépôt n’est pas une page HTML de politique ; publier le texte sur une URL stable avant la revue).
4. Notes de revue : le texte proposé dans [app-store-review.md](app-store-review.md).
5. TestFlight d’abord. La revue App Store n’est pas garantie.
6. Captures 6,7 po et 6,1 po exigées par la fiche en cours. Les prendre sur simulateur ou appareil, en français, avec de vrais articles du fil.
7. Icône 1024 sans transparence, à partir d’un master net. Le PNG actuel est un agrandissement du 512.

Catégorie suggérée : Magazines et journaux, ou Référence. Ne pas choisir Enfants. Le fil étudiant n’est pas filtré pour un jeune public.

## Captures et promo

Le dépôt ne contient pas de fausses captures. À produire :

| Magasin | Format |
|---|---|
| App Store iPhone 6,7 po | 1290 × 2796 |
| App Store iPhone 6,1 po | 1179 × 2556 |
| iPad si la fiche l’exige | 2064 × 2752 |
| Play | téléphone, 9:16, au moins 2 |

Montrer : fil, fiche avec « Lire chez », Explorer, Enregistrés. Le slogan affiché est celui du site : « Journaux, radios et sports étudiants du Québec, réunis au même endroit. »

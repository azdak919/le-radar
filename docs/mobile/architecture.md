# Architecture

## Constat

LE-RADAR est un site statique. GitHub Pages sert le HTML, les JSON et les service workers. Il n’y a pas de bundler, pas de compte lecteur, pas d’API privée. Le fil est `news.json` (titre, source, auteur, date, extrait, image, lien). Le corps des articles n’est pas stocké.

Envelopper `index.html` dans une WebView aurait publié le mât, les sports, Umami et le service worker du site dans une coquille. Ce n’est pas une application, et c’est le cas que les lignes 4.2 et 4.2.2 d’Apple visent.

## Découpage

```text
news.json + news-sources.json + radios.json + brand-colors.json
        │
        ├── site (index.html, radar-*.js, pages SEO, PWA)
        │
        └── mobile/app  →  mobile/www  →  Capacitor
                              ├── Android (android/)
                              └── iOS (ios/)
```

`mobile/app/js/core.js` est du JavaScript sans DOM : identifiant d’article, filtres, favoris, liens profonds, partage. Le site n’est pas obligé de le charger, sauf la fiche `/article/`, qui réutilise le même identifiant.

Le suivi des journaux réutilise `scripts/media-follow-store.js` et la clé `radar-media-follows-v1`. Les favoris, régions, mots-clés et sources masquées ont leurs propres clés (`radar-mobile-*`) pour ne pas élargir le format du site.

## Ce que l’application ajoute

- Navigation téléphone : Accueil, Explorer, Recherche, Enregistrés, Réglages.
- Fil « Suivis », « Régions », « Mots-clés », et masquage d’une source.
- Fiche de découverte : attribution visible, extrait déjà publié, bouton « Lire chez {publication} ».
- Favoris et historique locaux, effaçables. Pas de corps d’article.
- Dernière copie du fil sur l’appareil si le réseau manque.
- Partage natif (feuille iOS / Android) avec repli Web Share ou presse-papiers.
- Ouverture de l’original dans le navigateur système (Custom Tabs / SFSafariViewController), pas dans la WebView.
- Radio : barre persistante en bas de l’écran (au-dessus des onglets), comme la barre du site. Web/iOS : un `<audio>` dans la coquille ; Android : Media3 via plugin local. Voir « Radio » plus bas.
- Retour Android, zone sûre, thème clair/sombre/système, haptique légère sur suivre / enregistrer.
- Sélecteur de langue : le module du site (`translate.js`). Le slogan d’en-tête est celui du site. Les noms de médias et d’auteurices ne sont pas traduits.

Pomodoro, Solitaire, le mât météo et le bandeau sports restent sur le site. Réglages contient un lien « Ouvrir le-radar.ca ».

## Liens

| URL | Sans application | Avec application |
|---|---|---|
| `https://le-radar.ca/article/?id=` | Fiche `noindex` | Ouvre la fiche dans l’app |
| `https://le-radar.ca/journaux/{slug}/` | Page SEO existante | Explorer → ce média |
| `https://le-radar.ca/radios/{slug}/` | Page SEO existante | Fiche radio |
| `https://le-radar.ca/etablissements/{slug}/` | Page SEO existante | Explorer filtré |
| Reste du site, y compris `/`, `/pomo/`, `/sports/` | Inchangé | Non revendiqué |

L’identifiant est un FNV-1a 64 bits de l’URL canonique (paramètres `utm_*` retirés). Il n’existe pas de page par article : GitHub Pages ne réécrit pas les chemins.

Les fichiers d’association sont `.well-known/apple-app-site-association` et `.well-known/assetlinks.json`. Ils contiennent des emplacements `TEAMID` et `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`. Tant qu’ils ne sont pas remplacés, le système ne vérifie pas l’association. `_config.yml` demande à Jekyll de publier `.well-known` et de ne pas publier `android/` ni `ios/`.

## Radio

Le site garde l’écoute entre les pages avec `nav-shell.js` (iframe plein écran pendant la lecture) et `player-sync.js` (BroadcastChannel + `localStorage`). L’application n’en a pas besoin : c’est une seule page routée par hash. Les écrans sont re-rendus dans `#screen` par `innerHTML` ; la barre `#player` et son `<audio id="player-audio">` sont hors de `#screen`, dans `index.html`, et ne sont jamais re-rendus.

- « Écouter » sur la fiche radio ou dans Explorer → Radios lance le flux dans la barre. La barre montre la station, l’émission en ondes (`radio-nowplaying.json` de le-radar.ca, ignoré au-delà de 3 h) et lecture/pause/arrêt. Toucher le nom ouvre la fiche.
- Pause = la connexion au flux est coupée (`src` retiré) : pas de données en pause, et la reprise repart du direct.
- Retour Android sur l’accueil pendant l’écoute : l’app passe en arrière-plan (`App.minimizeApp`) au lieu de quitter.
- Avant 2026-10 (1.0.1), le seul `<audio>` était dans la fiche : quitter la fiche le détruisait. Ce n’était pas une contrainte de magasin, seulement le périmètre de la première version.

### Arrière-plan et écran verrouillé (1.1.0)

**Choix : Media3 ExoPlayer natif dans un service de premier plan**, bridgé à la barre JS par un petit plugin Capacitor local (`RadioPlayback`, classes sous `android/.../radio/`). Pourquoi pas « WebView audio + service vide » : Android peut geler la WebView hors premier plan ; le flux mourrait malgré la notification. ExoPlayer vit dans le service, indépendamment de la WebView. AndroidX Media3 est Apache-2.0, sans Play Services — acceptable pour F-Droid.

| Plateforme | Mécanisme |
|---|---|
| Android | `RadioPlaybackService` (`foregroundServiceType=mediaPlayback`) + ExoPlayer + `MediaSession` (notification et écran verrouillé : lecture / pause / arrêt, nom de station, émission). Focus audio et `becoming-noisy` (casque débranché → pause). `WAKE_LOCK` via `WAKE_MODE_NETWORK`. |
| iOS | `UIBackgroundModes` = `audio` + `AVAudioSession` catégorie `playback` ; le `<audio>` de la barre continue en arrière-plan. |

La barre JS reste la source de vérité UI : un événement `state` du plugin met à jour play/pause/arrêt (y compris depuis la notification). Permissions Android : `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS` (runtime, Android 13+, refus gracieux), `WAKE_LOCK`, plus `INTERNET`.

## Hors ligne

Au lancement, l’application tente `https://le-radar.ca/news.json` (HTTP natif de Capacitor, donc sans CORS), puis la copie embarquée par `npm run mobile:sync`, puis la dernière copie locale. Les images distantes ne sont pas mises en cache : un éditeur peut les retirer, et plusieurs hôtes refusent le cache cross-origin. Hors ligne, la fiche garde le titre, la source, l’extrait et le lien.

`news-archive.json` n’est pas embarqué.

## Notifications

Il n’y a pas de serveur d’envoi, pas de Firebase. La permission de notification Android (13+) ne sert qu’à la notification média de la radio, pas à des messages push.

Aujourd’hui, l’accueil peut afficher combien d’articles des médias suivis sont plus récents que la dernière visite. Ce compte est local.

Les cases dans Réglages enregistrent un choix (suivis, résumé, nouveau média, autorisation future). `systemNotificationsActive()` reste `false`. Rien n’est transmis.

Un futur envoi devra :

1. rester opt-in, cases décochées par défaut ;
2. comparer le fil public, pas scraper les articles ;
3. viser un canal portable (APNs pour iOS, un service que l’on opère pour Android) ;
4. ne pas ajouter de SDK publicitaire.

Tant que ce service n’existe pas, ne pas déclarer les notifications comme une fonction livrée.

## Mesure d’audience

Le site charge Umami. L’application ne le charge pas.

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
- Radio : barre persistante en bas de l’écran (au-dessus des onglets), comme la barre du site. Un seul `<audio>`, dans la coquille. Voir « Radio » plus bas.
- Retour Android, zone sûre, thème clair/sombre/système, haptique légère sur suivre / enregistrer.

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
- Media Session renseignée quand la WebView l’expose. Sur Android, la WebView n’en fait pas une notification système.
- Retour Android sur l’accueil pendant l’écoute : l’app passe en arrière-plan (`App.minimizeApp`) au lieu de quitter.
- Avant 2026-10 (1.0.1), le seul `<audio>` était dans la fiche : quitter la fiche le détruisait. Ce n’était pas une contrainte de magasin, seulement le périmètre de la première version.

Arrière-plan et écran verrouillé : non garantis. Capacitor ne met pas la WebView en pause, donc le son continue quand l’app passe derrière, mais sans service de premier plan Android peut geler le processus. Pour une vraie écoute écran verrouillé avec contrôles système, il faudrait du natif : un service `mediaPlayback` (permissions `FOREGROUND_SERVICE` et `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, notification média) et une session média native (AndroidX Media3, Apache-2.0, acceptable pour F-Droid) ; sur iOS, `UIBackgroundModes` `audio`. C’est un ticket séparé : nouvelles permissions, déclarations magasin et `privacy.md` à refaire.

## Hors ligne

Au lancement, l’application tente `https://le-radar.ca/news.json` (HTTP natif de Capacitor, donc sans CORS), puis la copie embarquée par `npm run mobile:sync`, puis la dernière copie locale. Les images distantes ne sont pas mises en cache : un éditeur peut les retirer, et plusieurs hôtes refusent le cache cross-origin. Hors ligne, la fiche garde le titre, la source, l’extrait et le lien.

`news-archive.json` n’est pas embarqué.

## Notifications

Il n’y a pas de serveur d’envoi, pas de Firebase, pas de permission de notification.

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

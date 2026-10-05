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
- Radio : un seul `<audio>` sur la fiche, qui s’arrête en quittant la fiche. Pas d’écoute en arrière-plan.
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

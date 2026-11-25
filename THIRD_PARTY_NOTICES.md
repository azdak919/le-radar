# Notices des composants tiers

Le **code de LE-RADAR.ca** est distribué sous [GNU AGPLv3](LICENSE) (SPDX : `AGPL-3.0-or-later`), avec une permission additionnelle pour les boutiques d’applications ([`LICENSE-EXCEPTIONS.md`](LICENSE-EXCEPTIONS.md)). Ce fichier ne relicence rien : il recense les fontes, bibliothèques et dépendances incluses ou utilisées pour construire le projet, d’après les fichiers de licence déjà présents dans le dépôt et les champs `license` du `package-lock.json` / du registre npm.

Les **articles, photos, logos et marques** des médias et des établissements ne sont pas sous AGPL ni sous la licence des gabarits d’affiches. Ils restent à leurs titulaires.

## Fontes (SIL Open Font License 1.1)

Toutes ces fontes sont sous OFL 1.1. Les textes de licence correspondants sont dans le dépôt :

| Famille (usage) | Fichiers | Notice |
| --- | --- | --- |
| Source Serif 4 Display Bold (`LR Serif`, mot-symbole et titres) | `scripts/og-fonts/SourceSerif4Display-Bold.ttf` | `scripts/og-fonts/SOURCE-SERIF-LICENSE.md` (Adobe) |
| Inter Regular / SemiBold (`LR Sans` / `LR Sans Semi`, texte courant, mention d’indépendance, pied d’affiche) | `scripts/og-fonts/Inter-Regular.ttf`, `Inter-SemiBold.ttf` | `scripts/og-fonts/INTER-LICENSE.txt` (The Inter Project Authors) |
| Caveat Bold (`LR Script`, messages manuscrits) | `assets/kit/fonts/Caveat-Bold.ttf` | `assets/kit/fonts/CAVEAT-OFL.txt` |
| Noto Sans (endonymes du pied, plusieurs écritures) | `assets/kit/fonts/langs/*.woff2` (sous-ensembles) | `assets/kit/fonts/langs/OFL.txt` |
| Noto Color Emoji (emojis de sport, sous-ensemble) | `assets/kit/fonts/emoji/noto-color-emoji-sports.woff2` | `assets/kit/fonts/emoji/OFL.txt` |
| Noto Sans Symbols, graisse 400, glyphe U+1F12F uniquement (`LR Copyleft`, police chargée par le générateur d’affiches ; le pied d’affiche utilise désormais ©) | `assets/kit/fonts/noto-sans-symbols-copyleft.woff2` | `assets/kit/fonts/langs/OFL.txt` (même licence OFL 1.1 Noto) |

Les gabarits d’affiches eux-mêmes (mise en page réalisée par Azdak) sont sous [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([`affiches/LICENSE`](affiches/LICENSE)), distincte de l’OFL des fontes et de l’AGPL du code. Les affiches diffusées avant ce changement restent aussi disponibles sous CC BY-SA 4.0.

## Icônes des réseaux (pied de page)

Fichiers dans `assets/social-icons/` (copie mobile : `mobile/app/assets/social-icons/`). Tracés aussi en ligne dans `nav-shell.js`.

- Simple Icons v16.36.0, **CC0 1.0** (compatible AGPL-3.0-or-later) : X, Bluesky, Facebook, Instagram, Tumblr, Mastodon, RSS, Buy Me a Coffee. Instagram : `instagram.svg`, compte https://www.instagram.com/le.radar.ca/. Buy Me a Coffee : `buymeacoffee.svg`, page https://www.buymeacoffee.com/azdak (soutien, pas un profil).
- Bootstrap Icons v1.13.2, **MIT** : LinkedIn (retiré de Simple Icons à la demande de la marque).

Les marques restent à leurs titulaires. Affichage monochrome, formes non altérées. Détail : `assets/social-icons/LICENSE.md`.
## Réessai des sources externes

`scripts/vendor/retry/` — bibliothèque **retry 0.13.1**, copyright 2011 Tim Koschützki et Felix Geisendörfer, **MIT** (`scripts/vendor/retry/LICENSE`). `scripts/external-source-lib.js` s’en sert pour le délai croissant des récoltes (RSEQ, radios, liens, rétro-crawl, fil). Le cache de la dernière réponse valide et le signalement par une seule issue sont du code du dépôt (AGPL-3.0-or-later). Aucun paquet Apache-2.0 n’est ajouté aux dépendances distribuées.

## Bibliothèque QR

`scripts/vendor/qrcodegen-v1.8.0.js` — QR Code generator, Project Nayuki, **MIT**. Le copyright et l’autorisation MIT sont conservés en tête du fichier. Compatible avec une distribution AGPLv3 du code qui l’utilise.

## Dépendances npm (d’après `package-lock.json`)

Dépendances de production (`dependencies`) : paquets **@capacitor/\*** déclarés **MIT** (registre npm et lockfile).

Dépendances de développement (`devDependencies` et transitives observées dans le lockfile) :

- Majoritairement **MIT** ou **ISC**.
- **BlueOak-1.0.0** (licences permissives, paquets transitifs tels que `glob`, `minipass`, etc.).
- **0BSD** (`tslib`), **Unlicense** (`big-integer`, `stream-buffers`).
- **Apache-2.0** : `@playwright/test`, `playwright`, `playwright-core` (tests) ; `xcode` (transitif de `@capacitor/cli`) ; `elementtree` (transitif de `native-run`, lui-même utilisé par `@capacitor/cli`).

Ces paquets Apache-2.0 sont des **outils de développement ou de la CLI mobile**. Ils ne sont pas embarqués dans le site ni dans l’application livrée. L’Apache 2.0 est de toute façon compatible avec l’AGPLv3 : la FSF ne la juge incompatible qu’avec la GPL v2.

Un champ `license` du lockfile est parfois absent pour la racine du projet ; la licence du projet est déclarée dans `package.json` (`AGPL-3.0-or-later`) et dans `LICENSE`.

## Application mobile (Android et iOS)

- Android (`android/app/build.gradle`) : AndroidX `appcompat`, `coordinatorlayout`, `core-splashscreen`, `work-runtime` et **Media3** (`media3-exoplayer`, `media3-session`), tous sous **Apache-2.0**. L’Apache 2.0 est compatible avec l’AGPLv3 : l’application peut les embarquer. C’était la raison principale de quitter la GPL v2.
- Capacitor (`@capacitor/*`, `capacitor-swift-pm` dans `ios/App/CapApp-SPM/Package.swift`) : **MIT**.
- Distribution par l’App Store et Google Play : permission additionnelle de l’article 7 de l’AGPLv3, dans [`LICENSE-EXCEPTIONS.md`](LICENSE-EXCEPTIONS.md).

## Workers et proxy

`workers/`, `cloudflare/` et `proxy/` n’importent aucun paquet externe. Ils sont sous AGPL-3.0-or-later comme le reste du code ; l’article 13 de l’AGPLv3 couvre leur usage en réseau.

## Photos utilisées sur les affiches

Les crédits sont composés par `posterCredit()` dans `affiches/poster-builder.js` : nom complet → « Photo : Nom · licence » ; sinon « crédit (source, licence) ». La licence affichée vient du champ `license` de la banque de photos, ou, s’il est vide, de la mention « Public domain » / « domaine public » déjà présente dans `source`. Les photos restent à leurs auteurs ; une mention CC sur une photo Wikimedia ne couvre pas le gabarit de l’affiche.

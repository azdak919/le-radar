# Notices des composants tiers

Le **code de LE-RADAR.ca** est distribué sous [GNU GPL v2](LICENSE) (SPDX : `GPL-2.0-only`). Ce fichier ne relicence rien : il recense les fontes, bibliothèques et dépendances incluses ou utilisées pour construire le projet, d’après les fichiers de licence déjà présents dans le dépôt et les champs `license` du `package-lock.json` / du registre npm.

Les **articles, photos, logos et marques** des médias et des établissements ne sont pas sous GPL ni sous la licence des gabarits d’affiches. Ils restent à leurs titulaires.

## Fontes (SIL Open Font License 1.1)

Toutes ces fontes sont sous OFL 1.1. Les textes de licence correspondants sont dans le dépôt :

| Famille (usage) | Fichiers | Notice |
| --- | --- | --- |
| Source Serif 4 Display Bold (`LR Serif`, mot-symbole et titres) | `scripts/og-fonts/SourceSerif4Display-Bold.ttf` | `scripts/og-fonts/SOURCE-SERIF-LICENSE.md` (Adobe) |
| Inter Regular / SemiBold (`LR Sans` / `LR Sans Semi`, texte courant, mention d’indépendance, pied d’affiche) | `scripts/og-fonts/Inter-Regular.ttf`, `Inter-SemiBold.ttf` | `scripts/og-fonts/INTER-LICENSE.txt` (The Inter Project Authors) |
| Caveat Bold (`LR Script`, messages manuscrits) | `assets/kit/fonts/Caveat-Bold.ttf` | `assets/kit/fonts/CAVEAT-OFL.txt` |
| Noto Sans (endonymes du pied, plusieurs écritures) | `assets/kit/fonts/langs/*.woff2` (sous-ensembles) | `assets/kit/fonts/langs/OFL.txt` |
| Noto Color Emoji (emojis de sport, sous-ensemble) | `assets/kit/fonts/emoji/noto-color-emoji-sports.woff2` | `assets/kit/fonts/emoji/OFL.txt` |
| Noto Sans Symbols, graisse 400, glyphe U+1F12F uniquement (`LR Copyleft`, symbole copyleft du pied d’affiche) | `assets/kit/fonts/noto-sans-symbols-copyleft.woff2` | `assets/kit/fonts/langs/OFL.txt` (même licence OFL 1.1 Noto) |

Les gabarits d’affiches eux-mêmes (mise en page réalisée par Azdak) sont sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), distincte de l’OFL des fontes et de la GPL du code.

## Bibliothèque QR

`scripts/vendor/qrcodegen-v1.8.0.js` — QR Code generator, Project Nayuki, **MIT**. Le copyright et l’autorisation MIT sont conservés en tête du fichier. Compatible avec une distribution GPL v2 du code qui l’utilise.

## Dépendances npm (d’après `package-lock.json`)

Dépendances de production (`dependencies`) : paquets **@capacitor/\*** déclarés **MIT** (registre npm et lockfile).

Dépendances de développement (`devDependencies` et transitives observées dans le lockfile) :

- Majoritairement **MIT** ou **ISC**.
- **BlueOak-1.0.0** (licences permissives, paquets transitifs tels que `glob`, `minipass`, etc.).
- **0BSD** (`tslib`), **Unlicense** (`big-integer`, `stream-buffers`).
- **Apache-2.0** : `@playwright/test`, `playwright`, `playwright-core` (tests) ; `xcode` (transitif de `@capacitor/cli`) ; `elementtree` (transitif de `native-run`, lui-même utilisé par `@capacitor/cli`).

Ces paquets Apache-2.0 sont des **outils de développement ou de la CLI mobile**. Ils ne sont pas embarqués dans le site ni dans l’application livrée. La FSF considère l’Apache 2.0 incompatible avec la GPL v2 si les codes sont combinés et distribués comme une seule œuvre ; ce n’est pas le cas ici pour ces outils, qui restent à part. Aucun paquet Apache-2.0 n’apparaît dans `dependencies`.

Un champ `license` du lockfile est parfois absent pour la racine du projet ; le licence du projet est déclarée dans `package.json` (`GPL-2.0-only`) et dans `LICENSE`.

## Photos utilisées sur les affiches

Les crédits sont composés par `posterCredit()` dans `affiches/poster-builder.js` : nom complet → « Photo : Nom · licence » ; sinon « crédit (source, licence) ». La licence affichée vient du champ `license` de la banque de photos, ou, s’il est vide, de la mention « Public domain » / « domaine public » déjà présente dans `source`. Les photos restent à leurs auteurs ; une mention CC sur une photo Wikimedia ne couvre pas le gabarit de l’affiche.

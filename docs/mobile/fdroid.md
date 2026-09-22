# F-Droid

Décision du 2026-09-21 : **F-Droid est le canal de distribution voulu** pour l’application Android. Play et l’App Store restent différés. L’humain n’a pas le temps de créer les comptes ni de remplir les fiches. Ne pas relancer cette inscription tant qu’il ne le demande pas.

## Pourquoi F-Droid

L’application est GPL-2.0, sans compte, sans publicité, sans Firebase et sans les services Google Play. Elle se construit avec Gradle à partir de ce dépôt. C’est le magasin qui correspond au projet.

## Ce qui n’est pas fait

F-Droid n’a pas encore la fiche. L’inclusion se fait par une demande dans le dépôt `fdroiddata`, après que cette branche est sur `main`. F-Droid signe lui-même l’application. La clé d’envoi Play ne sert pas.

La compile Android de la PR peut être rouge à cause de l’action `setup-android` (paquet `tools` retiré). Le binaire local, JDK 21 et SDK 36, se construit. Ce n’est pas un bloqueur F-Droid.

## Prochaine étape, quand on s’y met

1. Merger cette branche.
2. Taguer une version.
3. Rédiger la recette `fdroiddata` : clone, `npm ci`, `npm run mobile:sync`, `./gradlew assembleRelease`, sans clé du dépôt.
4. Textes déjà prêts : `store/google/short-description-fr-CA.txt` et `store/google/full-description-fr-CA.md`.

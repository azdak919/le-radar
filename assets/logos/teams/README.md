# Logos d'équipes (story « Jour de match »)

Utilisés seulement par l'affiche story 9:16 (`scripts/social/match-story-run.mjs`, format `match-story`).
Sans fichier pour une équipe : l'affiche reste typographique. Rien n'est téléchargé automatiquement.

| Fichier | Sert à |
|---------|--------|
| `<registryId>.png\|svg\|webp` | Équipe d'excellence de l'établissement (`sports-masthead.json` → `registryId` / `opponentRegistryId`), ex. `mcgill.png` |
| `<registryId>-voile.png` | Club de voile (CICSA) — jamais remplacé par le logo de l'équipe d'excellence |
| `usports.svg` | Mention U SPORTS des matchs universitaires |

**Provenance et licence de chaque fichier : `sources.json`** (domaine public Commons, « fair use » Wikipédia,
logos publiés par la CICSA, fanion ULaVoile autorisé par le CA du club). Marques de leurs titulaires ;
le pied de l'affiche l'indique dès qu'un logo est affiché. Fond transparent, ≤ 600 px.

Manquants au 26 nov. 2026 : UdeM (Carabins, limite de débit Wikimedia), ÉTS (Piranhas), équipes collégiales
(ex. Couguars de Chicoutimi, Gaillards de Jonquière).

Ajout : workflow manuel « Social — Logo d'équipe depuis Commons » (`social-team-logo.yml`, script
`scripts/social/team-logo-fetch.mjs`) — un logo à la fois ; sans fichier, il liste les candidats ; avec le fichier,
il télécharge le rendu PNG 600 px et note licence, auteur et source dans `sources.json`.

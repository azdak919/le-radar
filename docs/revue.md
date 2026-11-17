# La revue du matin et La revue du soir

Deux articles originaux par jour, générés à partir des données du site : `news.json` (fil des médias étudiants),
`radio-schedules.json` (grilles des radios étudiantes) et `sports-masthead.json` (résultats et matchs étudiants).
Une revue n’est **pas** une réécriture : des extraits courts, un lien vers chaque original, le média et **tous** les
auteurs crédités. Sport étudiant et médias étudiants seulement, jamais de sport professionnel.

> **Publication publique : désactivée par défaut.** Tant que `data/revue/config.json` contient `"publish": false`,
> le flux de travail ne génère que des exemples (artéfacts) et n’écrit rien sur le site : pas de page `/revue/`,
> rien dans `sitemap.xml`, `feed.xml`, `robots.txt` ni `llms.txt`.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `data/revue/config.json` | Interrupteur `publish`, heures des éditions, fenêtres, limites (articles, radio, sport, IA). |
| `scripts/revue/revue-lib.mjs` | Fenêtres horaires (heure de Montréal, DST), sélection des articles, thèmes, radio, sport, garde anti-hallucination, validation. |
| `scripts/revue/revue-ai.mjs` | Résumés d’une phrase et chapeau par Workers AI (même modèle et mêmes secrets que l’accroche IA de La une). |
| `scripts/revue/revue-render.js` | Page (chrome du site), index des archives, JSON-LD `NewsArticle`, sitemap Google News, entrées RSS. |
| `scripts/revue/revue-run.mjs` | CLI : `--gate`, `--edition`, `--sample --out`, `--refresh`, `--rebuild`. |
| `scripts/revue/revue-sample.sh`, `revue-screenshots.mjs` | Exemples matin + soir et captures (mobile 390 px, ordinateur 1280 px, clair/sombre, PDF). |
| `revue.css` | Styles de la page (variables du site, mode sombre). Hors coquille du service worker. |
| `.github/workflows/revue.yml` | Cron (≈ 7 h 30 et 19 h 15, rafraîchissement du soir) + lancement manuel. |
| `.github/workflows/revue-preview.yml` | Sur PR : exemple réel avec les données en ligne et l’IA, artéfact `exemple-revue`. |
| `tests/revue.mjs`, `tests/revue-render.spec.mjs` | Génération, garde, JSON-LD, sitemaps, RSS, rendu navigateur. |

## Éditions

- **Matin** (cible 7 h 30, fenêtre 7 h 15 – 10 h 30) : couvre depuis la revue du soir de la veille (19 h 15) ;
  résultats de la veille et du jour ; matchs du jour aux trois jours suivants ; émissions de radio 7 h 30 – 17 h.
- **Soir** (cible 19 h 15, fenêtre 19 h – 22 h) : couvre la journée depuis 7 h 30 ; résultats du jour ; matchs des
  trois jours suivants ; émissions 19 h 15 – minuit.
- **Rafraîchissement** (22 h 45 – 23 h 59) : la revue du soir reçoit seulement les nouveaux résultats du jour
  (`dateModified` mis à jour, rien d’autre ne change).
- Les crons GitHub tournent en UTC et peuvent être en retard : plusieurs déclenchements couvrent l’heure normale et
  l’heure avancée ; le `--gate` décide s’il y a une édition due, et une édition déjà publiée n’est jamais refaite.
- **Rien de neuf, rien de publié** : sans nouvel article dans la période (`skipWithoutArticles`), l’édition est
  sautée et notée dans `data/revue/state.json`. `news.json` vieux de plus de 6 h : refus.

## Garde-fous (jamais de revue vide ni inventée)

1. Chaque lien, titre, média et auteur vient des données ; `validateReview` refuse la revue sinon (auteurs égaux à
   ceux du fil, extraits présents dans la source, émissions présentes dans la grille, résultats recalculés depuis le
   bandeau sportif).
2. Texte IA (résumé, chapeau) : rejeté s’il contient un lien, des guillemets, une date relative (« demain »,
   « week-end »…), un chiffre ou un nom propre absent de la source, ou s’il n’est pas en français. Repli : extrait
   court de l’article et introduction factuelle déterministe.
3. IA indisponible (secrets absents, erreur, `REVUE_AI=off`) : gabarit déterministe complet.
4. Avant écriture : tout lien de la page qui ne vient pas du modèle fait échouer l’écriture.

## Activer la publication (décision de Charles)

1. PR qui passe `"publish": true` dans `data/revue/config.json` (CI verte, puis fusion).
2. Le prochain créneau du flux « Revue — matin et soir » écrit `revue/AAAA-MM-JJ-matin|soir/`, l’index
   `revue/`, `sitemap-news.xml`, ajoute la ligne `Sitemap: …/sitemap-news.xml` à `robots.txt`, et les revues entrent
   dans `sitemap.xml`, `feed.xml` (contenu complet, image, catégories) et `llms.txt`. Pages se redéploie seul
   (`pages-deploy.yml` écoute ce flux). Lancement manuel possible : *Actions → Revue — matin et soir → Run workflow*.
3. Vérifier la première page publiée (Rich Results Test pour le JSON-LD, validateur RSS).
4. **Google Search Console** (propriété `le-radar.ca`) : *Sitemaps* → soumettre `https://le-radar.ca/sitemap-news.xml`
   (le `sitemap.xml` est déjà connu) ; *Inspection d’URL* sur une revue pour demander l’indexation si souhaité.
5. **Google News / Publisher Center** : il n’est plus possible d’ajouter une source manuellement ; l’inclusion
   dans Google News est algorithmique (contenu original, dates claires, auteurs, page de politique éditoriale,
   coordonnées). Publisher Center reste facultatif pour gérer l’apparence de la publication (nom, logo, sections) une
   fois que Google la reconnaît. Respecter les règles de contenu de Google News : la note « générée
   automatiquement à partir des sources citées » est affichée sur chaque revue.

Désactiver : repasser `"publish": false`. Les pages déjà publiées restent ; `sitemap-news.xml` se vide (48 h).

## Commandes utiles

```bash
node scripts/revue/revue-run.mjs --gate --now 2026-11-17T07:31:00-05:00   # édition due ? (« désactivée » tant que publish = false)
bash scripts/revue/revue-sample.sh /tmp/exemple-revue                       # exemples + captures (sans IA en local)
node scripts/revue/revue-run.mjs --sample --edition soir --day 2026-11-16 --at 19:15 --out /tmp/x
node tests/revue.mjs && npx playwright test tests/revue-render.spec.mjs
```

# Ajouter une source au fil RADAR

Guide pour intégrer un journal étudiant, un média campus ou un portail
institutionnel au fil **Le fil étudiant**. Destiné aux humains et aux bots
(`discover-news-sources.js`, agents CI).

Voir aussi `docs/maintenance.md` pour le pipeline global.

---

## 1. Éligibilité

| Critère | Attendu |
|---------|---------|
| Périmètre | Québec — universités, cégeps, médias étudiants ou portails campus |
| Langue | `fr` ou `en` (filtre UI) |
| Fraîcheur | Publications récentes (le fil global plafonne à ~3 sessions universitaires) |
| Indépendance | Plusieurs journaux par établissement sont acceptés s'ils sont distincts (ex. The Link + The Concordian) |

**Exemple ULaval** : `L'Exemplaire` (journal étudiant indépendant) et `ULaval nouvelles`
(communications institutionnelles) coexistent — même institution, noms et URLs différents.

---

## 2. Découvrir le flux

### 2.1 RSS / Atom (cas le plus courant)

Tester dans l'ordre :

```
/feed/
/feed
/rss/
/rss
/atom.xml
?feed=rss2
```

Le bot `discover-news-sources.js` essaie ces chemins automatiquement sur les
`candidates` qui ont un champ `site`.

### 2.2 Pas de RSS (SvelteKit, headless CMS, etc.)

Si aucun flux n'existe (ex. `nouvelles.ulaval.ca`), utiliser **`fetchMode: "html-list"`** :

1. Trouver une **page de liste** avec articles récents en HTML SSR
   (souvent `/toutes-les-nouvelles`, `/nouvelles`, `/blog`, page d'accueil).
2. Vérifier que le HTML contient des liens datés (`/2026/06/26/slug-uuid`) ou des
   blocs `<article>` avec titre, extrait, image.
3. Mettre l'URL de cette page dans `url` (pas le site racine seul).

Parser partagé : `scripts/html-list-fetcher.js` (SvelteKit `HTML_TAG_START`, liens
datés en repli).

### 2.3 Cloudflare / site bloqué

Comme **The Concordian** : `url` = flux WordPress officiel, `urlFallback` = repli
(Substack, autre). Documenter la limite du repli dans `_note`.

---

## 3. Registre `news-sources.json`

### Champs obligatoires (`active`)

| Champ | Description |
|-------|-------------|
| `name` | Nom affiché dans les filtres UI (unique) |
| `institution` | Doit correspondre à `institutions.json` |
| `region` | Région administrative |
| `type` | `universite` ou `cegep` |
| `lang` | `fr` ou `en` |
| `url` | Flux RSS **ou** page liste HTML si `fetchMode: html-list` |
| `popularity` | Ordre des filtres (1 = en tête) |

### Champs recommandés

| Champ | Description |
|-------|-------------|
| `site` | Site public (réseaux sociaux, découverte par bots) |
| `_note` | Contexte interne (distinction d'autres journaux, limites du repli) |
| `urlFallback` | URL de repli si le principal échoue |
| `fetchMode` | `rss` (défaut) ou `html-list` |
| `wpFeaturedCategories` | Catégories WordPress pour vedettes hors flux (ex. Le Délit → `slider`) |

### Champs bots (automatiques)

`_status`, `_lastItemDate`, `_lastChecked`, `_failCount` — mis à jour par
`discover-news-sources.js`.

### Candidats (`candidates`)

Entrée minimale quand le flux n'est pas encore trouvé :

```json
{
  "name": "Nom du journal",
  "institution": "Université X",
  "region": "Montréal",
  "type": "universite",
  "lang": "fr",
  "site": "https://exemple.ca/"
}
```

Le bot sonde `site` + chemins RSS ; promotion auto si flux frais (< 1 an).

---

## 4. Commande rapide

```bash
cd radios-etudiantes-qc

# Cas RSS classique
node scripts/add-news-source.js \
  --name "The Concordian" \
  --institution "Concordia University" \
  --region "Montréal" --type universite --lang en \
  --url "https://theconcordian.com/feed/" \
  --site "https://theconcordian.com/" \
  --popularity 7 \
  --note "Journal indépendant, distinct de The Link" \
  --update

# Cas sans RSS (page liste HTML)
node scripts/add-news-source.js \
  --name "ULaval nouvelles" \
  --institution "Université Laval" \
  --region "Capitale-Nationale" --type universite --lang fr \
  --url "https://nouvelles.ulaval.ca/toutes-les-nouvelles" \
  --site "https://nouvelles.ulaval.ca/" \
  --fetchMode html-list \
  --popularity 4 \
  --note "Portail institutionnel ULaval, distinct de L'Exemplaire" \
  --update
```

---

## 5. Pipeline après ajout

| # | Commande | Rôle |
|---|----------|------|
| 1 | `node scripts/verify-news-sources.js --name "<journal>"` | Champs, flux/liste, articles dans `news.json` |
| 2 | `node scripts/fetch-news.js --update` | Reconstruit `news.json` |
| 3 | `node scripts/verify-authors.js --update` | QC auteurs (optionnel mais recommandé) |
| 4 | `node scripts/ensure-lead-images.js --update` | Images vedette |
| 5 | `node scripts/fetch-social.js --update` | Réseaux sociaux (si `site` renseigné) |
| 6 | Incrémenter `CACHE_NAME` dans `sw.js` | Si `app.js` / assets modifiés |
| 7 | `git commit` + `git push` | Déploiement GitHub Pages |

Raccourci : `node scripts/maintain.js --update`

---

## 6. Ajustements manuels possibles

| Problème | Fichier / action |
|----------|------------------|
| Auteur générique (« The Concordian », « ULaval nouvelles ») | `GENERIC_AUTHORS` dans `scripts/fetch-news.js` |
| Vedettes WordPress absentes du RSS | `wpFeaturedCategories` dans `news-sources.json` |
| Auteurs incorrects en masse | `scripts/verify-authors.js`, `scripts/author-lib.js` |
| Images vedette faibles | `scripts/stock-photo-lib.js`, `ensure-lead-images.js` |
| Nouveau parseur HTML (autre CMS) | Étendre `scripts/html-list-fetcher.js` ou ajouter un `fetchMode` |

---

## 7. Checklist bot (découverte automatique)

Quand un bot trouve un candidat :

1. Confirmer l'établissement dans `institutions.json`
2. Vérifier qu'aucune source active ne porte déjà le même `name` ou `url`
3. Sonder RSS sur `site` ; sinon chercher page liste HTML datée
4. Si RSS frais → promouvoir via `discover-news-sources.js --update`
5. Si HTML seulement → ajouter manuellement avec `fetchMode: html-list` (promotion auto RSS uniquement aujourd'hui)
6. Lancer le pipeline §5
7. Documenter le cas particulier dans `_note` si repli ou contenu partiel

---

## 8. Fichiers touchés (référence)

```
news-sources.json      # registre
news.json              # agrégat (généré)
institutions.json      # établissements
brand-colors.json      # couleurs par institution
social-feed.json       # réseaux (généré)
scripts/
  add-news-source.js       # CLI d'ajout
  verify-news-sources.js   # QC intégration
  fetch-news.js            # agrégation RSS + html-list
  html-list-fetcher.js     # parseur pages liste
  discover-news-sources.js # santé + promotion candidates
  maintain.js              # orchestrateur
```
# Migration d'identité RÉQ → LE-RADAR — 29 juillet 2026

**LE-RADAR** — Le Réseau Académique de Découverte et d'Agrégation de Ressources.

Portée : migration complète de l'ancienne identité **RÉQ / REQ**, adoption du développement
officiel de l'acronyme, et unification du pied de page. Aucune refonte d'architecture.

---

## Résumé

| | |
|---|---|
| Fichiers versionnés analysés | 425 |
| Pages HTML | 83 (69 générées, 14 écrites à la main) |
| Workflows GitHub | 10 |
| Scripts (bots + bibliothèques) | 58 |
| Suites de tests | 18 |
| Documents `docs/` | 12 |
| **Références à l'ancienne identité remplacées** | **23** |
| **Références conservées volontairement** | **3 familles** (voir §4) |
| **Références RÉQ / REQ restantes** | **0** |
| Commits | 7, atomiques |
| Fichiers modifiés hors pages générées | 41 |

---

## 1. Cartographie de l'ancienne identité

L'ancienne identité ne survivait **que** dans des chaînes d'affichage et de stockage : aucune
variable exportée, aucun `require`, aucun prompt, aucune URL, aucun nom de composant. La
documentation (`README`, `CHANGELOG`, `llms.txt`, `robots.txt`) était déjà propre.

| Surface | Occ. | Risque | Traitement |
|---|---|---|---|
| Nom d'auteur de commit `RÉQ … Bot` (5 workflows) | 5 | Sans risque | → `LE-RADAR … Bot` |
| Nom d'auteur de commit `RADAR … Bot` (4 workflows) | 4 | Sans risque | → `LE-RADAR … Bot` |
| User-Agent HTTP `REQ-…` | 8 | Faible | → `LE-RADAR-…` |
| Clés `localStorage` `req-*` | 6 clés / 20 sites | Moyen | → `radar-*`, sans repli |
| Titre + recherche de l'issue de maintenance `RADAR …` | 2 | Faible | → `LE-RADAR …` |

### Ce que la première passe avait manqué

Une migration antérieure avait déjà converti une partie du dépôt, mais **vers `RADAR` seul**.
Quatre workflows portaient donc une identité fautive (`RADAR Archive Bot`,
`RADAR Maintenance Bot`, `RADAR Now Playing Bot`, `RADAR Schedule Bot`) qu'une recherche sur
« RÉQ » ou « REQ » ne pouvait pas révéler. La règle **« jamais RADAR seul »** les a fait apparaître.

### Le cas des User-Agent

`REQ-NewsBot/1.0` n'était pas un nom à inventer un remplaçant : `firebase-list-fetcher.js` et
`stock-photo-lib.js` interrogeaient **déjà les mêmes sources** sous `LE-RADAR-NewsBot/1.0`. Le
même bot avait deux identités. Le renommage converge vers une chaîne éprouvée en production ;
le préfixe `Mozilla/5.0 (compatible; …)` est conservé partout où il existait, car c'est lui qui
évite les blocages naïfs côté sources.

### Le couplage qui aurait cassé

`.github/workflows/maintain.yml` **crée** une issue titrée « RADAR maintenance alert » et la
**recherche** par ce même titre pour éviter les doublons. Renommer le titre sans la recherche
aurait rouvert une issue à chaque passe du bot. Les deux lignes ont été changées ensemble, après
vérification qu'aucune issue ouverte ne portait l'ancien titre.

---

## 2. Clés `localStorage` — le point sensible

Six clés portaient l'ancien préfixe. `req-theme` était lue par **six fichiers sans aucun module
commun** : `app.js`, `feeds-page.js`, `seo-page-theme.js`, `pomo/index.html`, `pomo/js/app.js`,
`solitaire/index.html`. En oublier un désynchronisait le thème entre le site, les mini-apps et
les 69 pages d'entités.

Cible : préfixe **`radar-`**, déjà la convention du projet (`radar-translate-mode`,
`radar-engage-v2`, `CACHE_PREFIX = "radar-"`).

Les **trois** shells de service worker ont été bumpés (`radar-shell-v543`, `pomo-shell-v80`,
`solitaire-shell-v46`) : sans cela, un `app.js` resté en cache aurait écrit l'ancienne clé face à
un `index.html` neuf lisant la nouvelle — exactement la désynchronisation à éviter.

**Aucun repli sur les anciennes clés** (choix explicite) : le thème et le volume enregistrés avant
cette version repartent une fois de leur valeur par défaut.

---

## 3. Pied de page partagé

### Avant

Quatre définitions divergentes : `index.html`, `feeds.html`, `offline.html` (trois textes
différents, `offline.html` avec sa propre copie du CSS) et le gabarit des 69 pages d'entités.
Corriger une mention légale demandait quatre modifications.

### Après

`renderSiteFooter()` dans `scripts/seo-pages-lib.js` est la **seule** définition :

- les 69 pages générées la reçoivent par `renderPage()` ;
- `index.html`, `feeds.html` et `offline.html` par les marqueurs `RADAR:FOOTER`, le mécanisme
  d'injection que `generate-seo.js` utilisait déjà pour le prérendu et le JSON-LD.

Aucun rendu JavaScript : la garantie « lisible sans JS » des pages d'entités vaut aussi pour le
pied de page. Il n'existe ni bundler ni générateur de site à ajouter.

Contenu : marque **LE-RADAR** dominante, signature institutionnelle en typographie discrète,
mention « projet non officiel », liens utiles, **lien GitHub** (absent partout jusqu'ici),
licence GPL v2, crédit d'auteur avec easter egg préservé, mentions légales, note d'agrégation
automatisée.

### Deux défauts trouvés en chemin

- Le pied de page était un **enfant** de `<main class="seo-wire">`, donc capturé par
  `.seo-wire p` : 15 px au lieu de 13, et marque et signature à la même taille. Il devient
  **frère** de `<main>` — plus correct sémantiquement, et cela active enfin
  `.seo-wire + .site-foot` (`seo-pages.css`), écrit pour ce cas mais qui n'avait jamais matché.
- La signature en `--muted` donnait **3,72:1**, sous le seuil AA. Elle passe en `--ink-soft`
  (**9,32:1**). La palette n'est pas touchée.

### Vérifications

Aucun débordement horizontal à 360 / 768 / 1280 px sur `/`, `/feeds.html`, `/offline.html`,
`/medias/`, `/en/`, `/radios/cism/`. Hiérarchie marque > signature sur toutes les familles de
pages. Les 9 liens atteints au clavier. `<footer>` sémantique, `<nav aria-label>`, séparateurs
`aria-hidden`, `rel="noopener noreferrer"` sur les liens externes. Thèmes clair et sombre.

---

## 4. Références conservées volontairement

| Famille | Pourquoi |
|---|---|
| `radar-` interne — `CACHE_PREFIX`, `radar-shell-vN`, `radar-theme`, `radar-translate-mode`, `radar-engage-v2` | Identifiants techniques jamais affichés. La consigne « ne pas renommer namespaces / variables » s'applique ; en changer le préfixe créerait une quatrième convention concurrente. |
| Marqueurs `RADAR:SEO:JSONLD`, `RADAR:SEO:FEED`, `RADAR:FOOTER` | Commentaires HTML de génération, invisibles, contrat interne de `generate-seo.js`. |
| `ataraxia_*` / `stoicflow_*` (Pomodoro, Solitaire) | Héritage d'identité **distinct** de RÉQ, avec gestion `_LEGACY` explicite. Hors périmètre. |

---

## 5. Audit — constats non appliqués

Aucune de ces modifications n'a été appliquée : elles sortent du périmètre de la passe ou
présentent un risque non nul. Elles sont listées pour décision.

### 5.1 Barre radio non persistante — écart fonctionnel réel

La barre radio n'existe nativement que sur `index.html`, et sous forme embarquable dans
`tuner-embed.html` (utilisée par `/pomo/`, `/solitaire/` et le projet `le-kiosque`).

Elle est **absente** de `feeds.html`, `offline.html` et des **69 pages générées**
(`medias/`, `horaires/`, `radios/*`, `journaux/*`, `etablissements/*`, `en/*`).

`nav-shell.js` maintient la lecture en cours, mais son allowlist `isShellPath()` ne couvre que
`/`, `/feeds.html`, `/pomo/*`, `/solitaire/*` — et seulement **pendant** une lecture active
(`shouldUseShell() === isLocallyPlaying()`). Naviguer de l'accueil vers une page d'entité
**coupe le son**, y compris par les liens du pied de page.

Deux obstacles à lever avant de généraliser la barre :
- les pages d'entités garantissent une lecture **sans JavaScript** ; la barre est en JS ;
- les 69 pages sont **régénérées et purgées** à chaque passe : l'intégration doit passer par
  `seo-pages-lib.js`, pas par une édition de page.

### 5.2 Cast dans l'iframe — la cause n'est pas le code

Les contrôles cast sont **identiques** entre `index.html` et `tuner-embed.html` : mêmes trois
boutons (`tuner-cast`, `tuner-cast-mob`, `tuner-cast-pop`), même `cast.js`, même autorisation
`https://www.gstatic.com` dans la CSP, même injection du SDK vérifiée au navigateur. La seule
différence structurelle est la petite signature `le-radar.ca` (`.tuner-embed-credit`), propre à
l'embed — conforme à l'intention.

Le blocage est la **politique de permissions de l'iframe embarquante** :

| Intégration | Origine | `allow` déclaré |
|---|---|---|
| `/pomo/`, `/solitaire/` | même origine | `autoplay; encrypted-media` |
| `le-kiosque` (`packages/theme-radar/assets/kiosque.js:215`) | **inter-origine** | `autoplay` |

Pour un iframe **inter-origine**, les fonctionnalités non déléguées retombent sur `self`,
c'est-à-dire l'origine de l'embarqueur : le document `le-radar.ca` embarqué n'obtient donc ni
`cast` ni `remote-playback`. Le correctif se situe **dans `le-kiosque`**, pas ici — élargir
`frame.allow`. À confirmer sur matériel Chromecast / AirPlay réel : non testable ici.

### 5.3 Autres constats

- **Variante `LE RADAR` (avec espace)** — encore présente dans ~40 fichiers, surtout des
  commentaires et des `console.log` de bots. `tests/static-integrity.mjs` interdit déjà cette
  forme dans le HTML publié. Une passe globale est **déconseillée en l'état** : `translate.js`
  contient une **expression régulière** qui matche littéralement `— LE RADAR`, et
  `tests/static-integrity.mjs` fait des assertions sur ce texte. À faire fichier par fichier.
- **Préfixes de stockage divergents** — `radar-`, `lr_offline_*`, `lr_bg_recent`,
  `le_radar_masthead_weather_v2`, `ataraxia_*`. Constat, pas de renommage.
- **Classes CSS sans règle** — `.site-foot__heart`, `.site-foot__author-link` héritent de
  `.site-foot a`. Volontaire, mais non documenté jusqu'ici.
- **Faux orphelins** — une recherche naïve de `scripts/foo.js` donne 6 orphelins apparents
  (`article-photo-credit-lib`, `html-entities-lib`, `lead-excerpt-lib`, `lead-fallback-lib`,
  `radio-nowplaying-lib`, `url-security-lib`). Ils sont tous requis **sans l'extension**.
  **Aucun fichier mort confirmé, aucune suppression.**

---

## 6. Validation

`npm run check` (syntaxe + 8 suites unitaires) : **vert** avant et après chaque commit.

Suite navigateur (Playwright) : **44 réussites / 9 échecs**, liste **identique** à la référence
mesurée sur l'arbre d'avant la passe. **Zéro régression introduite.**

Les 9 échecs sont **préexistants et environnementaux** : le dépôt épingle `@playwright/test`
`^1.61.1` (build Chromium 1228) alors que l'environnement de cette session fournit le build 1194.
Ils touchent `player-continuity`, `translation-menu`, `browser-smoke:51` et `seo-pages:20/45`.
**À rejouer en CI**, où la version du navigateur correspond.

Une régression a été introduite puis corrigée avant commit : le libellé du lien d'annuaire du
pied de page était passé de « Tous les médias étudiants du Québec » à « Les médias étudiants »,
ce que `tests/seo-pages.spec.mjs` a détecté.

### Contrôles d'identité — tous vides

```bash
grep -rniE "\b(RÉQ|réq)\b" . --exclude-dir=.git
grep -rnoE "\bREQ[-_]" . --exclude-dir=.git
grep -rn "req-theme\|req-player" . --exclude-dir=.git
grep -rnE '(user\.name|User-Agent).*[^E-]\bRADAR\b' .github scripts workers
```

---

## 7. Risques résiduels

| Risque | Portée | Atténuation |
|---|---|---|
| Thème et volume réinitialisés une fois pour les visiteurs actuels | Cosmétique, une seule fois | Choix explicite : pas de repli sur `req-*` |
| Sources filtrant sur l'ancien User-Agent | Faible | La nouvelle chaîne servait déjà les mêmes sources |
| Suite navigateur non rejouée sur la bonne version de Chromium | Inconnu | Rejouer en CI (`Quality Gate`) |
| Barre radio absente de 71 pages | Fonctionnel, préexistant | §5.1 — non traité, décision requise |
| Cast inopérant depuis `le-kiosque` | Fonctionnel, hors dépôt | §5.2 — correctif dans `le-kiosque` |

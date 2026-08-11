# AUDIT-GROK — contre-expertise de `docs/focus-group-mat-sports.md`

**Branche auditée :** `review/grok-audit-focus-group` @ `ea9445f`  
**Baseline document (à l’audit) :** `main` à `9e8af0e`  
**Plage PR citée :** `0a44de0..9e8af0e`  
**Suite (à l’audit) :** `npm run check` — **vert** (exit 0)  
**Périmètre :** vérifier les affirmations contre le code ; ne pas les appliquer.

> **Note d’archivage (2026-08-11).** Ce fichier est conservé avec le doc et le labo pour ne pas
> perdre la contre-expertise. Le markdown des verdicts a reçu un **bandeau + correctifs M7 / §0
> identité** à l’import sur `main` ; le détail A→N ci-dessous reste la trace de l’audit sur
> `ea9445f`. Ne pas traiter les 21 verdicts comme une file d’implémentation automatique.

---

## 1. Verdict d’ensemble

Le document est **globalement fiable** sur le CSS/JS des surfaces sports (puce, marquees, P3, accélération du rythme) et sur la plupart des 74 citations `fichier:ligne`.  
La **plus grosse erreur** est **M7 / Accueil** : le document affirme que le pied de page n’a plus de lien Accueil et qu’il ne reste que deux occurrences — or `index.html` porte encore **trois** `data-home-nav` (mât, menu de sections, **pied L548**), malgré `navOnly: true` dans `SECTIONS`.  
Deuxième erreur structurante : **§0 identité 482 / 323** (somme 805 ≠ 813) ; le réel est **490 / 323**.  
Sur WCAG 2.2.2 appliqué au halo pourpre, le raisonnement est une **lecture extensive**, pas un cas clair — ne pas défaire du code expédié sur cette seule base.

---

## 2. Tableau A→N

| Point | Verdict | Preuve en une phrase |
|---|---|---|
| **A** Références de ligne | **IMPRÉCIS** | 74 cites existent et ~95 % ciblent le bon bloc ; 3–4 décalages / mésattributions (dont `index.html:170-173`, `style.css:406`→413). |
| **B** Repli mort 8,5 s | **CONFIRMÉ** | `style.css:296` fixe `--sports-scroll-duration: 5.5s` ; L568 utilise `var(..., 8.5s)` → fallback mort ; holds 32/68 vs 18/82 ; test commente encore « 8,5 s ≈ 2,7 s ». |
| **C** Grille qui ment | **CONFIRMÉ** | `seo-pages.css:1455` `grid-template-rows: auto auto` + L1461 `grid-row: 3` sur `__title`. |
| **D** Inventaire mouvements | **IMPRÉCIS** | Les 7 + point live et les deltas 7800→4800 / 42→36 / 11000→8000 / 2200→1200 / 8,5s→5,5s sont exacts ; manquent leave/arrive ; « simultanées » est une borne haute conditionnelle. |
| **E** Analyse WCAG | **IMPRÉCIS** | 2.5.8/2.5.5 sur puces 32 px : OK ; crédit photo 2.5.8 : exception texte possible ; **halo ≠ cas clair de 2.2.2**. |
| **F** Delta P3 | **CONFIRMÉ** | Expédié = 3 rangées (time+badge / score / title) vs reco 2 ; aggrave l’écart carte vide vs remplie sous 340 px (lien P6 logique). |
| **G** Parité rompue B1 | **CONFIRMÉ** | Avant `rgba(54,59,68,.78)` ; après `.92` + liseré accent ; météo no-photo `rgba(54,59,68,.68)` ; `.92` n’est pas un token. |
| **H** Trois systèmes chromatiques | **CONFIRMÉ** | Lavis `--sports-tone` 34 % · pastille W/L/D · liseré `--accent` décoratif — inventaire exact. |
| **I** M7 Accueil | **FAUX** | `navOnly: true` oui (`seo-pages-lib.js:734`) ; mais pied **a encore** Accueil (`index.html:548`) → **3** `data-home-nav`, pas 2. |
| **J** B7 code mort info | **CONFIRMÉ** | Commentaire L2455-2458 exact ; `sportsInfoSlide` **n’a aucun appelant** ; left pool refuse `mode === 'info'`. |
| **K** Mesures de données | **IMPRÉCIS** | 813 / 1 résultat / 531 next / 281 vides / 532×1 ligne / 531+1 / 527 opp-full OK ; **482→490** ; fenêtre page OK, JSON nextGames jusqu’au **11 déc.** |
| **L** Périmètre annoncé | **CONFIRMÉ** | `index.html` + `style-masthead.css` absents du diff `0a44de0..9e8af0e` ; pull-refresh / engage hors surface des verdicts M/B/P. |
| **M** Labo | **IMPRÉCIS** | Puce/halo/5,5 s/parité B1 alignés ; spécimen P3 **ne reproduit pas** `grid-row: 3` / `grid-template-rows: auto auto` de prod. |
| **N** Cohérence interne | **IMPRÉCIS** | 21 verdicts cohérents ; 4 arbitrages listés OK ; M7 « d’un tiers résolu » contredit le HTML ; statut « un verdict appliqué » OK (P3). |

---

## 3. Détail des points non confirmés

### A — Références de ligne (IMPRÉCIS)

**Méthode :** extraction des 74 `` `fichier:NNN` `` / `` `fichier:NNN-MMM` `` ; lecture du bloc réel.

**OK (majorité) :** blocs mât (`style-masthead` voile/ombres/heure/météo 138 px), puce (`style.css:164-190`), marquees, rim-glow, constantes dwell, `sportsMeasureOverflow` / `sportsApplyScrollState`, P3 `@container`, etc.

**Corrections à apporter dans le document :**

1. **L91** — « Motivé en commentaire (`scripts/seo-pages.js:1270-1274`, `index.html:170-173`) »  
   - `seo-pages.js:1270-1274` : OK (codes d’équipe).  
   - `index.html:170-173` : commentaire sur **date/heure** (`mastheadLocale`), **pas** les sigles.  
   - **Remplacer** la parenthèse groupée par deux motivations distinctes, ou retirer `index.html:170-173` de la phrase sur les sigles.

2. **B5 / L519** — « `.sports-chip__badge` et `.sports-chip__cta-tag` : `3px` (`style.css:252`, `406`) »  
   - `252` : OK (`border-radius: 3px` sur badge).  
   - `406` : début du sélecteur CTA-tag ; **`border-radius: 3px` est à 413**.  
   - **Remplacer** `` `style.css:252`, `406` `` par `` `style.css:252`, `413` ``.

3. **B4 / L456** — plage `` `style.css:536-556` `` pour le roulement 280 ms : les règles `is-rolling-*` sont **537-543** ; les keyframes débordent un peu après 556. Décalage mineur (1 ligne + fin de keyframes).

4. Le reste des 74 cites : **pas de « ligne fantôme »** ; les plages englobent bien les déclarations annoncées (y compris `app.js:3371` = `urgency?.tier`, `app.js:3462` = `--sports-tone`).

---

### B — Repli mort 8,5 s (CONFIRMÉ — détail de preuve)

```
style.css:296  --sports-scroll-duration: 5.5s;   /* sur .masthead-sports-strip */
style.css:304  animation: … var(--sports-scroll-duration, 5.5s) …   /* scores */
style.css:561  animation: … var(--sports-scroll-duration, 5.5s) …   /* titre CTA */
style.css:568  animation: … var(--sports-scroll-duration, 8.5s) …   /* sous-ligne */
```

Héritage CSS : la custom property est définie sur l’ancêtre strip → **le fallback 8.5s ne s’applique jamais**.  
Keyframes titre : holds **18 % / 82 %** ; sous-ligne : **32 % / 68 %** — intention de rythme distincte, durée réelle identique.  
`tests/masthead-sports-fit.spec.mjs` ≈ L199 : « hold initial ~32 % de **8,5 s ≈ 2,7 s** » — faux ; 32 % de 5,5 s ≈ **1,76 s** ; le test attend 3200 ms et passe quand même.

---

### D — Inventaire des mouvements (IMPRÉCIS)

| # | Affirmation doc | Code |
|---|---|---|
| 1–3 | Marquees 5,5 s (scores, titre, sous-ligne) | `style.css:299-310`, `559-564`, `566-574` |
| 4 | Roulement CTA 280 ms / 24 s | `537-543` + logique JS rotation |
| 5–6 | Halo CTA + pastille live 2,6 s | `403`, `428` sous `[data-cta-state="live"]` |
| 7 | `sports-chip-rim-glow` 3,2 s non-CTA | `186-188`, `203-212` |
| + | Point live 1,4 s | `438`, `623-627` |

**Avant `0a44de0` vs maintenant :**

| Constante | `git show 0a44de0:app.js` | HEAD audit |
|---|---|---|
| `SPORTS_READ_MIN_MS` | 7800 | 4800 |
| `SPORTS_READ_PER_CHAR_MS` | 42 | 36 |
| `SPORTS_READ_MAX_MS` | 11000 | 8000 |
| `SPORTS_SCROLL_POST_PAUSE_MS` | 2200 | 1200 |
| `--sports-scroll-duration` | 8.5s | 5.5s |

**Corrections / nuances pour le document :**

- **Manque :** `sports-chip-leave` (0,42 s) et `sports-chip-arrive` (0,64 s) à chaque rotation de puce score (`style.css:217-221`).  
- **Ne coexistent pas tous en permanence :** 5–6 + point live seulement en `live` ; marquees seulement si overflow / sub-overflow ; roll ~280 ms toutes les 24 s. Le « peuvent tourner en même temps » est une **borne haute**, pas l’état stable inter-saison (plutôt : rim-glow permanent + 0–3 marquees).  
- **Conflit CSS non mentionné :** `animation` sur `.sports-chip` pour le rim-glow est **remplacé** par leave/arrive pendant la transition (même propriété) — le halo n’est pas vraiment « permanent sans interruption ».

---

### E — WCAG (IMPRÉCIS) — avis franc

**1. Halo `sports-chip-rim-glow` et 2.2.2**

- **Fait exact :** animation infinie 3,2 s, auto, pas de contrôle pause utilisateur ; coupée sous `prefers-reduced-motion` (`style.css:237`) — le document a raison sur ce point technique.  
- **Qualification 2.2.2 :** le critère vise le contenu *en mouvement, clignotant, défilant* ou *auto-updating* qui démarre tout seul et dure plus de 5 s. Un **marquee de texte** (déjà dans la bande) est un cas d’école. Un **halo de bordure** qui module `border-color` / `box-shadow` est une animation décorative d’état de chrome.  
- **Avis :** c’est une **lecture extensive** de 2.2.2, pas une violation nette du type carrousel/marquee. Les Understanding docs rapprochent « blinking » d’un basculement on/off de contenu ; un pulse de lueur est plus proche des animations décoratives (souvent traitées via 2.3.3 / bonnes pratiques / `prefers-reduced-motion`, déjà en place).  
- **Conséquence décisionnelle :** **ne pas défaire le code expédié sur le seul argument 2.2.2**. L’argument *design* du document (décor sans signal, concurrence avec le live rouge, même raisonnement que le chevron non-pulsé) est **plus solide** que l’étiquette WCAG.

**2. Puces 32 px et 2.5.8 / 2.5.5**

- `min-height: 32px`, `gap: 6px` (`style.css:164-166`) — **conforme 2.5.8 (24×24 AA)** en hauteur ; largeur des puces flex ≫ 24 en usage normal.  
- **Sous 2.5.5 AAA (44×44)** : non conforme — exact.  
- Nuance mineure : la largeur d’une puce très compressée n’est pas prouvée ici ; le doc ne l’affirme pas non plus.

**3. Crédit photo ~9 px et 2.5.8**

- Taille texte ~9–9,5 px + `pointer-events` seulement sur le `<a>` : **constat de taille exact**.  
- « Sans exception d’espacement possible » : **trop catégorique**. 2.5.8 excepte les cibles **dans une phrase ou un bloc de texte**. Un crédit photo de type légende/lien Commons peut plaider cette exception. Même sans elle, le correctif padding proposé reste bon sens — mais ce n’est pas un « viol 2.5.8 sans appel ».

---

### I — M7 Accueil (FAUX)

| Affirmation document | Réalité @ `ea9445f` |
|---|---|
| PR #51 a mis `home` en `navOnly: true` | **Vrai** — `scripts/seo-pages-lib.js:734` |
| `sectionLinks` ne sert home au nav qu’avec `includeNavOnly` | **Vrai** — L756-761, L781 |
| « le pied de page n’a plus de lien Accueil » | **Faux** — `index.html:548` : `<a href="./" data-home-nav aria-current="page">Accueil</a>` |
| « il en reste donc deux » (icône + menu) | **Faux** — **3** `data-home-nav` (L183, L335, L548) |
| `static-integrity` exclut `./` du contrôle nav⊂pied | **Vrai** — filtre `navHrefs.filter((h) => h !== './')` + commentaire L131 |
| (sous-entendu) assertions cohérentes avec « plus d’Accueil au pied » | **Faux** — le même fichier **exige encore** `>Accueil<` et `data-home-nav` dans le pied (L138-145) |

**Corrections document (formulation) :**

- L285-290 / L311-316 / L920-922 : ne pas écrire que le pied a perdu Accueil ni que le problème a été réduit d’un tiers **sur la home livrée**.  
- Remplacer par : *le générateur marque `navOnly: true` (les pages régénérées perdent Accueil au pied), mais `index.html` home conserve encore le lien pied ; l’arbre est en tension avec les tests qui exigent ce lien — dette confirmée ensuite par le fix `96c00771` / PR #56 (hors baseline `9e8af0e`).*  
- Table L296-298 : ajouter la ligne pied, ou indiquer explicitement l’écart générateur vs HTML commité.

---

### K — Mesures de données (IMPRÉCIS)

Recompte sur `sports.json` (`updated: 2026-08-11T05:30:38Z`, `teams` = objet **813** clés) et `sports/index.html` (813 `<section class="sports-panel">`).

| Mesure | Document | Recompte | |
|---|---|---|---|
| Formations | 813 | 813 | OK |
| Avec résultat en banque | 1 | 1 (`lastGame` voile McGill, pas `results[]`) | OK |
| Avec matchs à venir | 531 | 531 | OK |
| Fenêtre à venir | 19 août → **22 nov.** 2026 | **Page** (datetimes `--next`) : 2026-08-19 → 2026-11-22 | OK pour la page |
| | | **JSON** `nextGames` : jusqu’au **2026-12-11** | Doc silencieux sur l’écart |
| Cartes vides | **281** (35 %) | **281** (34,6 %) | OK |
| Exactement une ligne | 532, jamais plus | dist `{0:281, 1:532}` | OK |
| Lignes `--next` / W·L·D | 531 / 1 | 531 next + 1 `--L` | OK |
| Cartes `.sports-result__opp-full` | **527** (65 %) | 527 (64,8 %) | OK |
| Identité 2 lignes / 3 lignes | **482 / 323** | **490 / 323** | **FAUX** |
| Somme identité | (impl. 805) | 813 | Doc **482+323=805 ≠ 813** |

**Correction document L111 :**

- Remplacer « 482 / 323 » par « **490 / 323** » (non-branded = name+meta ; branded = name+program+meta via `sports-panel__name--branded` / `__program`).

---

### M — Labo (IMPRÉCIS)

| Spécimen | Aligné prod ? |
|---|---|
| `.s-chip--now` fond `rgba(42,46,54,.92)` + lavis 34 % + border 1,5 px accent | Oui |
| `s-rim-glow` 3,2 s | Oui (+ variante soft 6 s pour la reco — volontaire) |
| Marquees 5,5 s + note repli 8,5 s mort | Oui |
| Note parité B1 météo vs puce | Oui |
| **P3 « expédié »** | **Non** : lab `@container (max-width: 340px)` + score/title en `grid-column: 1 / -1` **sans** `grid-template-rows: auto auto` ni `grid-row: 3` ; la note textuelle L1723 affirme le bug de déclaration prod, mais le CSS lab ne le reproduit pas |

**Correction lab (hors scope d’édition ici) :** pour parité visuelle/technique avec `seo-pages.css:1450-1463`, le bloc `.s-panel--p3` devrait reprendre la même grille nommée `sports-panel` et les mêmes `grid-row`.

---

### N — Cohérence interne (IMPRÉCIS)

- **21 verdicts** M1–M7, B1–B7, P1–P7 : cohérent avec l’annonce.  
- **Un APPLIQUÉ** : P3 — cohérent avec le bandeau d’intro.  
- **« Quatre arbitrages »** (B4, B1, M1, M7) : le nombre match la liste.  
- **Contradiction :** intro + M7 + §5 disent que la redondance Accueil est passée de 3→2 / « d’un tiers résolu » — **contredit par `index.html`**.  
- **Votes :** M7 « 3/5 » avec dissidence « 2 voix » — arithmétiquement cohérent ; la *motivation* de la dissidence (« déjà réduit d’un tiers ») repose sur le fait faux ci-dessus.  
- **B3** « traversent intacts » (intro passe 3) alors que B3 n’est pas dans la liste des intacts L34 — L34 liste `B3, B7, P2…` : B3 y est ; OK.  
- Commentaires **périmés dans le code** (pas le doc) que le doc n’exploite pas : `style.css` commente encore « Durée 7 s » ; `app.js` commente encore « ~7,8–11 s » au-dessus des constantes 4800–8000.

---

## 4. Ce qui a été manqué

*(Changements dans `0a44de0..9e8af0e` ou faits de code qui affectent un verdict sans être capturés proprement.)*

1. **`index.html` pied Accueil vs `navOnly` (critique pour M7)**  
   Le document calibre le verdict sur le générateur (`navOnly: true`) et ignore l’HTML commité + les assertions qui **exigent encore** Accueil au pied. C’est l’écart le plus trompeur pour un lecteur qui ouvre la home.

2. **Animations leave/arrive**  
   Hors inventaire B4 alors qu’elles partagent la propriété `animation` avec le rim-glow et interrompent le halo à chaque rotation.

3. **CTA au repos reste sur l’ancienne ardoise**  
   `.sports-chip--cta` (hors live) utilise encore `rgba(54, 59, 68, 0.9)` (`style.css` ~382/398) pendant que les puces score sont en `42,46,54,.92` + liseré pourpre. B1 parle météo↔score ; la **troisième** surface grise de la même bande (CTA repos) n’est pas nommée.

4. **Météo avec photo** n’est pas `rgba(54,59,68,.68)`  
   Sur photo : fond ~`rgba(22,24,30,.82)` (sombre) ; le `.68` est le cas clair / sans photo. Le diagnostic de parité vaut pour un sous-ensemble d’états — le doc le circonscrit en partie, mais la distance « 8 px » météo-bandeau dépend aussi du dock mobile / tuner.

5. **Commentaires de synchro non mis à jour** (`style.css` « 7 s », `app.js` « 7,8–11 s »)  
   Renforcent le bug du test 8,5 s : la base de code raconte trois durées à la fois (commentaire / variable / fallback).

6. **Titres / chrome page Sports (PR #51)**  
   H1 long, `sportsMeta` vidé, libellés footer « Sports » — touchent la page `/sports/` (P*) au-delà de P3. Le document les mentionne peu ; ils changent le poids typographique du hub que P1/P7/P2 lisent.

7. **`initPullToRefresh` + copie engage (#55)**  
   Correctement hors périmètre design des 21 verdicts ; toutefois engage install cite maintenant la triade sports — surface marketing adjacente au bandeau, pas un verdict manqué mais un voisinage non cartographié.

8. **Post-baseline (signal, hors plage demandée)**  
   `96c00771` / PR #56 retire `navOnly` pour débloquer les bots — **invalide rétroactivement** le récit M7 du document dès que l’on lit `main` d’après `9e8af0e`. Utile pour l’humain : le doc est déjà périmé sur M7 **même avant** ce fix (HTML home), et **davantage** après.

9. **Lab P3 ≠ CSS prod**  
   Voir M — un lecteur du lab croit voir la déclaration menteuse ; il voit une autre grille.

10. **`sportsInfoSlide` plus mort que dit**  
    Pas seulement « hors voie gauche » : **zéro call site**. Le rendu `mode === 'info'` dans `paintSportsChip` est une branche zombie.

---

## 5. Surinterprétations

| Lieu | Constat factuel | Saut non garanti |
|---|---|---|
| **B4 / WCAG 2.2.2** | Halo infini > 5 s, sans pause UI | ⇒ « cas visé par 2.2.2 » / obligation de retirer pour conformité — **surqualification juridique** ; le fond design (décor permanent) se suffit |
| **B1** | Puce et météo (un état) divergeaient après #51 | ⇒ « sans que rien ne le décide » — en pratique une **autre** décision focus-group (`le-radar-sports-chip-look C`) a décidé la puce ; l’absence de décision est sur **la paire**, pas sur la puce seule |
| **B2** | Liseré accent plus visible que le lavis | ⇒ « la seule couleur qu’on remarque… ne porte aucune information » — plausible mais **perceptif**, non mesuré ; le glyphe sport reste un canal non chromatique fort |
| **B4 « sept simultanées »** | Sept animations *peuvent* coexister | Lu comme état permanent de la bande — **exagère** la charge en inter-saison hors live / hors overflow |
| **F / P3→P6** | 3 rangées vs 2 sous 340 px | « aggrave la dent de scie » — vrai pour cartes **à une ligne** ; **281 cartes vides** restent plates : l’aggravation touche ~65 % des cartes, pas toute la grille |
| **M7** | `navOnly` dans le générateur | « problème réduit d’un tiers » / dissidence renforcée — **enchaînement rhétorique** sur un HTML qui n’a pas perdu la 3ᵉ occurrence |
| **M6** | Lien crédit ~9 px | « viole 2.5.8 sans exception possible » — ignore l’exception texte en bloc |
| **B7** | Code info non servi en usage normal | « troisième registre chromatique dans la bande » comme problème *utilisateur* — le doc le rétrograde lui-même ; le ton reste celui d’un défaut visible |

---

## 6. Annexes de preuve (extraits)

### Accueil ×3 (`index.html`)

```
183:  masthead-home … data-home-nav … title="Accueil"
335:  <a href="./" data-home-nav aria-current="page">Accueil</a>   <!-- site-sections -->
548:  <a href="./" data-home-nav aria-current="page">Accueil</a>   <!-- site-foot -->
```

### `navOnly` (`scripts/seo-pages-lib.js:734`)

```js
{ id: 'home', key: 'home', path: { fr: '', en: 'en/' }, attrs: ' data-home-nav', navOnly: true },
```

### P3 (`seo-pages.css:1450-1461`)

```css
/* Focus-group P3 : noms longs — repli 2 lignes sous ~340px de carte */
@container sports-panel (max-width: 340px) {
  …
  grid-template-rows: auto auto;
  …
  .sports-result__title { … grid-row: 3; … }
}
```

### Identité 490 / 323

```
sports-panel__name--branded + __program : 323  → 3 lignes d’identité
sports-panel__name (sans branded)       : 490  → 2 lignes
490 + 323 = 813
```

---

## 7. Ce qui n’a pas été fait (volontairement)

- Aucune modification de `docs/focus-group-mat-sports.md`, `dev/mat-sports-lab.html`, CSS/JS de prod.  
- Pas de commit / push / PR.  
- Pas de `npm run seo:update` ni `bank:sync`.  
- Playwright ciblé non relancé séparément : couvert par `npm run check` vert.  
- Labo non ouvert dans un navigateur (parité lue dans le HTML/CSS du fichier).

---

*Fin de l’audit. Fichier unique livrable : `AUDIT-GROK.md`.*

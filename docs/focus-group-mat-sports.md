# Focus group — mât, bandeau sports et page `/sports/`

> **Statut : archive de recommandations (ne pas appliquer en bloc).**  
> Un verdict est déjà en prod (`P3`) ; les autres restent **ouverts** et n’ont de force qu’après
> feu vert humain explicite, un numéro à la fois.  
> Labo : [`dev/mat-sports-lab.html`](../dev/mat-sports-lab.html)  
> (`python3 -m http.server 4173` → `http://127.0.0.1:4173/dev/mat-sports-lab.html`).  
> **Contre-expertise :** [`AUDIT-GROK.md`](../AUDIT-GROK.md) (2026-08-11) — lire avant d’agir.
>
> **Révision du 11 août 2026, en trois passes** (baseline rédaction `9e8af0e`), puis **passe audit**
> (faits corrigés ci-dessous et dans l’AUDIT ; `main` a aussi absorbé PR #56 depuis).
>
> *Passe 1 — données.* Le document a été confronté à ce que la page affiche réellement (§0). Quatre
> verdicts en ressortent modifiés : `P6` récrit — sa prémisse était fausse — et `B2`, `B6`, `P2`
> complétés d'une règle « hors saison » sans laquelle ils rendraient le bandeau **plus** gris, pas
> moins. `P3` monte en priorité, `P4` et `B7` descendent.
>
> *Passe 2 — PR #49, #50, #52, #53.* Deux touchent le mât : le plancher de la colonne météo primaire
> passe de `110 px` à **`138 px`**, et l'accueil devient un **rafraîchissement doux**
> (`data-home-nav`). `M2` est reformulé, `M3` voit son risque monter, un verdict `M7` est ajouté.
> Rien ne change côté bandeau ni côté page.
>
> *Passe 3 — PR #51, #54, #55. Cette fois le code a bougé, et sur les surfaces du document.*
> Trois conséquences, dans l'ordre d'importance :
>
> 1. **`P3` a été expédié** (`seo-pages.css:1451`, commentaire `/* Focus-group P3 */`) — le verdict
>    passe en `APPLIQUÉ`, avec le delta entre l'expédié et le recommandé.
> 2. **La puce a été repeinte** par un focus group parallèle (`le-radar-sports-chip-look (C)`) :
>    liseré pourpre `--accent`, fond plus dense, et un **halo permanent** sur chaque puce. `B1` est
>    rejugé contre cette nouvelle base, `B2` se renforce, et `B4` — l'inventaire des mouvements —
>    passe de **cinq à sept animations simultanées**.
> 3. **`M7` (Accueil)** : la PR #51 a tenté `navOnly` ; l’HTML home et la PR #56 **gardent Accueil
>    au pied**. Il reste **trois** `data-home-nav` — le récit « réduit d’un tiers » de la passe 3
>    est **incorrect** (détail § M7 + AUDIT point I).
>
> `B3`, `B7`, `P2`, `P4`, `P5`, `P7` traversent intacts sur le fond. Les **numéros de ligne** ont
> pu glisser depuis `9e8af0e` — l’AUDIT et le labo priment en cas de doute.
>
> **Hygiène repérée (sans arbitrage design)** : repli `8.5s` mort sur la sous-ligne CTA
> (`style.css`) ; `grid-template-rows: auto auto` vs `grid-row: 3` (P3). À traiter en fix dédié
> si besoin — pas dans ce document.

---

## §0 — Méthode et grille de lecture

### Le panel

Les mêmes cinq personas que [`.grok/workflows/focus-group.rhai`](../.grok/workflows/focus-group.rhai) (l. 50-56) :
`reader` (lecteur campus, scan rapide) · `editor` (rédac chef de pupitre sport) · `a11y` ·
`designer` (presse numérique) · `dev` (front pragmatique). Sortie au même format :
consensus → règles CSS/HTML → dissidence.

Nouveauté de cette passe : le panel a été élargi à **trois surfaces** qui n'avaient jamais été
soumises. Les quatre verdicts déjà rendus ne portaient que sur **une pièce** — la carte CTA du
bandeau (`le-radar-sports-first-glance`, `-motion`, `-rhythm`, `-badge`, commit `58789c9`).

### La grille « cartes » (Zander Whitehurst)

Dix principes retenus comme grille de lecture. Ils sont ici des **outils de diagnostic**, pas une
autorité : quand ils entrent en conflit avec un garde-fou maison, le garde-fou gagne (voir plus bas).

| # | Principe | Traduction opérationnelle |
|---|---|---|
| W1 | L'espacement porte la hiérarchie | Serré entre éléments liés, aéré entre groupes. La proximité remplace les filets. |
| W2 | Padding horizontal ≥ vertical | Une carte respire plus large que haut. |
| W3 | Rayons imbriqués | `r_interne = r_externe − padding`. |
| W4 | Un seul point focal par carte | Ce que le lecteur est venu chercher, une seule fois. |
| W5 | Max 3 tailles, 2 graisses | Au-delà, la hiérarchie devient du bruit. |
| W6 | Hiérarchie par taille + graisse + couleur | Jamais par la couleur seule. |
| W7 | Supprimer les filets quand l'air suffit | Un délimiteur par carte, pas quatre. |
| W8 | Alignement à gauche | Pas de centrage de contenu de longueur variable. |
| W9 | Cible ≥ 44 px, carte entière cliquable | Sauf carte multi-destination (voir P5). |
| W10 | Contenu réel | Nom de 42 caractères, score à deux chiffres, liste vide. |

### Les garde-fous maison — ils priment

1. **Règle d'or couleur** ([`docs/identite-visuelle.md`](identite-visuelle.md) §6) :
   pourpre = qui nous sommes, rouge = c'est en direct, bleu = c'est la radio.
   **Aucune quatrième couleur sémantique « sport » n'est inventée dans ce document.**
   *Depuis la PR #51*, le pourpre `--accent` est entré dans la bande comme **décor** — liseré de
   chaque puce, sans rien signifier. La règle n'est pas violée (c'est bien la couleur de marque),
   mais elle est diluée : une couleur qui dit « qui nous sommes » posée sur chaque objet ne dit plus
   rien. C'est un argument de `B1` et de `B2`, pas un verdict séparé.
2. **Verdicts déjà rendus, à ne pas défaire** : registre d'alerte réservé au direct réel
   (`sportsGameIsLive()`), rotation seulement sous `(hover: hover) and (pointer: fine)` à 24 s avec
   pause (WCAG 2.2.2), `prefers-reduced-motion` fige tout, chevron dans le cluster de gauche.
3. **`tests/masthead-sports-fit.spec.mjs`** : 3 à 4 puces à 1440 px, CTA toujours en dernier,
   `data-cta-pinned="1"`, puces score ≤ cartes météo actives, `min-height: 60px` sur la bande.
   **Depuis la PR #54, un cas de plus** : la sous-ligne CTA qui déborde doit porter
   `is-sub-overflowing` et animer `sports-chip-scroll-sub`, avec `text-overflow: clip` — plus jamais
   d'ellipse figée. Tout verdict qui touche la sous-ligne doit repasser ce test.
4. **Sentinelles de génération** `<!-- RADAR:CHROME:ACTIONS:START/END -->` et `:SECTIONS:` —
   réécrites par `scripts/seo-pages-lib.js` sur toutes les sous-pages.
5. **`notranslate` / `translate="no"`** sur les sigles d'équipe et la date. Motivé en commentaire
   (`scripts/seo-pages.js:1270-1274`, `index.html:170-173`).
6. Le mot-symbole reste **LE-RADAR**, d'un seul tenant.

### L'état des données au moment de la rédaction

Un verdict sur une interface de scores ne vaut rien sans savoir ce qu'elle affichait ce jour-là.
Mesures reprises sur l'arbre fusionné (`main` à `9e8af0e`), `sports.json`
(`updated: 2026-08-11T05:30:38Z`) et `sports/index.html` généré. **Aucun chiffre structurant n'a
bougé depuis la passe précédente** — seule la fenêtre des matchs s'est resserrée :

| Mesure | Valeur |
|---|---|
| Formations au catalogue | 813 |
| Formations avec un résultat en banque | **1** |
| Formations avec des matchs à venir | 531 |
| Fenêtre des matchs à venir | 19 août → 22 novembre 2026 |
| Cartes de la page sans aucune ligne (`.sports-panel__empty`) | **281** (35 %) |
| Cartes avec exactement une ligne | 532 — **jamais plus** |
| Lignes `--next` / lignes `--W`·`--L`·`--D` | **531 / 1** |
| Cartes déclenchant le repli des noms longs (`.sports-result__opp-full`) | **527** (65 %) |
| Bloc identité : cartes à 2 lignes / à 3 lignes | **490** / 323 (audit : pas 482 ; 490+323=813) |

**Conséquence directe.** On est en inter-saison : le bandeau tourne en mode `next`
(`app.js:3496-3505`), chaque puce affiche `CODE vs OPP · date` — **sans pastille et sans score** —
et la page ne montre qu'une seule ligne de résultat sur 813 cartes. La saison reprend le 19 août :
l'interface bascule donc régulièrement entre deux états très différents. **Tout verdict qui suppose
un score doit dire ce qu'il fait quand il n'y en a pas.** Trois d'entre eux (`B2`, `B6`, `P2`) ont
été récrits pour cette raison, et un quatrième (`P6`) retiré.

### Une correction factuelle avant de commencer

Le bandeau sports **n'est pas dans le mât**. Ordre réel du DOM :

```
header.masthead          index.html:157-225   ← le mât
#tuner                   index.html:228-320   ← la barre radio (sticky)
#masthead-weather-dock   index.html:324       ← repli mobile de la météo
#masthead-sports-strip   index.html:328       ← le bandeau sports
nav.site-sections        index.html:334       ← « Accueil » en tête depuis la PR #52
main.wire                index.html:347
```

Ce voisinage n'est pas un détail : c'est lui qui explique le gris (voir **B1**).

---

## §1 — Le mât

### M1 · `voile-unique` — cinq mécanismes pour un seul problème

**Constat.** La lisibilité du texte sur la photo de fond est traitée par **cinq** dispositifs
empilés : `.bg-photo-scrim` (dégradé global, `style-masthead.css:43-58`), un halo radial
`.wordmark::before` (`style-masthead.css:249-265`), et trois piles de `text-shadow` à **quatre
couches chacune** sur `.masthead-date` (225-236), `.wordmark-mark` (274-286) et `.wordmark-full`
(302-314) — chacune redoublée en thème sombre.

**Verdict (4 voix / 5, `dev` dissident).** C'est le contraire de W7 : cinq délimiteurs de
lisibilité, et aucun n'est réglable seul. Surtout, le résultat reste **dépendant de la photo** —
sur une image de neige c'est la pile d'ombres qui sauve la mise, pas le voile.

**Reco.** Un seul dispositif porteur : muscler `.bg-photo-scrim` en deux bandes (haut ≈ rangée
date/actions, bas ≈ wordmark + slogan) à une alpha qui garantit le contraste indépendamment de la
photo, puis ramener chaque `text-shadow` à **une couche** `0 1px 2px rgba(0,0,0,.5)` et supprimer
le halo `::before`.

**Dissidence (`dev`).** Le voile en deux bandes assombrit la photo, ce que le commentaire
`style-masthead.css:38-42` refuse explicitement (« pas de film sombre derrière LE RADAR »). Contre-
proposition : garder le voile actuel, ne toucher qu'aux piles d'ombres (4 couches → 2). Moins de
gain, zéro risque sur les photos claires. **Le labo montre les deux.**

`[CSS seul]` · risque : moyen, à valider en labo sur photo claire (neige) **et** photo sombre.

---

### M2 · `groupes-par-proximite` — huit icônes, aucune hiérarchie

**Constat.** `.masthead-actions` aligne huit cibles identiques (28 px, rond, `gap: 8px`,
`style.css:657-681`) : accueil, RSS, Pomodoro, Solitaire, Sports, café, installer, thème.
Elles ont le même poids visuel alors qu'elles n'ont ni la même fréquence ni le même registre.

**Verdict (5 / 5).** W1 : la proximité n'est pas utilisée. Un `gap` uniforme dit « ces huit choses
sont équivalentes », ce qui est faux.

**Reformulé après la PR #52.** L'icône accueil a reçu `data-home-nav`
(`scripts/seo-pages-lib.js:795`) : sur l'accueil, elle ne navigue plus, elle **rafraîchit le fil en
douceur sans couper la radio**. Ce n'est donc plus un bouton de navigation mais une action sur la
page courante — la grappe proposée en tient compte.

**Reco.** Trois grappes, sans rien ajouter ni retirer : `gap: 6px` **dans** une grappe, `14px`
**entre** les grappes.

| Grappe | Contenu | Registre |
|---|---|---|
| Page courante | accueil (`data-home-nav`) · RSS | agir sur ce qu'on lit |
| Applications | Pomodoro · Solitaire · Sports | quitter pour une autre app |
| Réglages | café · installer · thème | paramétrer le site |

`[CSS seul]` · risque : faible. La largeur totale de la grappe est conservée à 2 px près — ce qui
compte plus qu'avant, la colonne météo primaire ayant gagné 26 px de plancher (voir `M3`).
**Attention** — le bloc est entre les sentinelles `RADAR:CHROME:ACTIONS`, régénérées par
`renderMastheadActions()` (`scripts/seo-pages-lib.js:783-804`), fonction modifiée par la PR #52. Si
la grappe demande un `<span>` de regroupement, il faut passer par là ; sinon la règle CSS suffit
(sélecteurs de position).

---

### M3 · `heure-dans-le-flux` — l'heure est en absolu sous la date

**Constat.** `.masthead-time { position: absolute; top: 2em; left: 0 }`
(`style-masthead.css:619-633`, redit à `style.css:735-745`). L'heure sort du flux, passe sous le
`border-bottom` de la rangée, et le mobile compense par un `transform: translateY(-3px)` sur la date
(`style.css:714`).

**Verdict (4 / 5, `dev` réservé).** Une compensation en `translateY` de 3 px est la signature d'une
hauteur de rangée malhonnête.

**Reco.** Remettre l'heure dans le flux : `.masthead-date { display: grid; row-gap: 2px }`, l'heure
devient la seconde ligne, et le `translateY(-3px)` disparaît.

**Dissidence (`dev`, forte).** La cellule date est le point d'entrée de la cascade de formats
`MASTHEAD_DATE_FORMATS` (`app.js`), qui mesure `scrollWidth` contre `clientWidth`. Le commentaire
`style-masthead.css:741-749` documente un piège déjà tombé une fois. Passer la cellule en grille
change la boîte mesurée. **À ne tenter que si `tests/masthead-weather.spec.mjs` et la cascade de
date sont vérifiés en même temps.**

**Le risque a monté avec la PR #49.** Deux changements resserrent la rangée :

- le plancher de la colonne météo primaire passe de `110 px` / `112 px` à **`138 px`**
  (`style-masthead.css:657-663`), pour afficher « MONTRÉAL » et « QUÉBEC » en entier. La colonne
  date, qui est celle qui se comprime en premier par construction, perd donc ~26 px ;
- `tests/masthead-weather.spec.mjs` a gagné trois assertions qui verrouillent cette géométrie : la
  carte primaire ne doit **pas** être `.is-compact` sur bureau large, sa largeur doit rester
  `≥ 120 px`, et aucune carte ne doit descendre sous `90 px`.

Toucher la boîte de la cellule date fait maintenant courir un risque direct à ces trois assertions.
Le verdict reste le dernier de la file.

`[CSS seul]` · risque : **élevé**, couvert par `tests/masthead-weather.spec.mjs` (assertions
renforcées).

---

### M4 · `slogan-lisible-mobile` — la baseline sous 600 px

**Constat.** `.wordmark-full` : `clamp(10px, 2.6vw, 11.5px)`, `letter-spacing: .12em`,
`text-transform: uppercase`, `font-weight: 600` (`style.css:872-887`). À 360 px, c'est du 10 px
capitale interlettré sur trois lignes — le texte le moins lisible de la page.

**Verdict (4 / 5, `designer` dissident).** Le `letter-spacing` de `.12em` est calibré pour un
libellé court en capitales, pas pour une phrase de 68 caractères.

**Reco.** Sous 600 px : `letter-spacing: .06em`, `font-size: 10.5px` fixe, et **deux lignes
maximum**. Ne pas masquer le slogan : c'est la seule réponse à « c'est quoi, ce site ? » à la
première visite.

**Dissidence (`designer`).** Retirer les capitales plutôt que réduire l'interlettrage : une phrase
en bas de casse à 11 px est plus lisible qu'une phrase en capitales à 10,5 px, quel que soit le
tracking. Coût identique. **Le labo montre les deux.**

`[CSS seul]` · risque : faible.

---

### M5 · `echelle-typo-intacte` — ne pas y toucher

**Verdict unanime : aucun changement.** L'échelle `--radar-wordmark-size` >
`--radar-lead-title-size` > `.wire-title` (`style.css:827-831`) tient à tous les paliers, y compris
pour les scripts longs (`style.css:905-915`). Ce verdict est consigné **pour empêcher une
« amélioration » future** : c'est la seule échelle typographique documentée du dépôt.

---

### M6 · `credit-photo-cible` — le crédit est en `pointer-events: none`

**Constat.** `.bg-photo-credit` est à `9,5 px` (9 px sous 720 px), `rgba(255,255,255,.68)`,
`pointer-events: none` sur le conteneur et `auto` seulement sur le `<a>`
(`style-masthead.css:83-127`). Le lien de licence Commons fait donc environ **9 px de haut**.

**Verdict (`a11y`, 5 / 5).** Sous les 24 × 24 px du minimum WCAG 2.5.8, sans exception d'espacement
possible : c'est un lien isolé en bas d'une photo.

**Reco.** Garder la taille du texte, donner au `<a>` un `padding: 6px 4px` avec
`margin: -6px -4px` (la cible grandit, la mise en page ne bouge pas) et remonter la couleur à
`rgba(255,255,255,.82)`.

`[CSS seul]` · risque : faible. Attribution obligatoire côté licences Commons — on améliore la
conformité, on ne la dégrade pas.

---

### M7 · `accueil-en-double` — le même contrôle, plusieurs fois

**Verdict ajouté après la PR #52. Corrigé par l’audit 2026-08-11 (et PR #56).**

**Historique factuel (ne pas re-lire l’ancienne passe 3 au pied de la lettre).** La PR #51 a un
temps marqué `home` en `navOnly: true` dans `SECTIONS`. Sur l’arbre audité, le **pied de la home
conservait encore** un lien Accueil ; la PR #56 a ensuite **retiré `navOnly`** pour que les bots
`seo:update` / prepush restent verts. Bilan : **Accueil n’a pas été « réduit d’un tiers » de façon
stable.**

**Constat, à jour (home).** Trois commandes `data-home-nav` (rafraîchissement doux du fil, radio
préservée) :

| Où | Rôle |
|---|---|
| Icône ronde du mât `.masthead-home` | commande + `aria-current` |
| Premier lien de `nav.site-sections` | commande + `aria-current` |
| Pied de page | commande + `aria-current` (exigé par `tests/static-integrity.mjs`) |

**Verdict (panel d’origine 3 / 5, à re-peser).** Redondance de **commande** plus que de navigation.
W4 : un contrôle, un endroit — surtout pour les deux « vous êtes ici » dans le viewport haut
(mât + menu sections).

**Reco (inchangée dans l’esprit).** Sur l’accueil **uniquement**, alléger plutôt que tout couper :
garder une commande rapide (souvent l’icône mât sur mobile), n’enlever qu’un `aria-current` en
trop, et **ne pas** rejouer `navOnly` sans mettre à jour les tests bots.

**Dissidence (`dev` + `reader`).** Deux commandes haut de page ne gênent personne ; le pied
Accueil est utile hors home et pour les agrégats. Contre-proposition la plus économique :
**ne rien retirer structurellement** tant qu’on n’a pas un symptôme utilisateur clair.

`[markup]` — régions régénérées par `renderMastheadActions()` / `renderSectionNav()` /
footer `SECTIONS` · **`tests/static-integrity.mjs`** fige l’ordre des sections et la présence
d’Accueil au pied. Toute retouche doit les repasser.

---

## §2 — Le bandeau sports (toute la bande, pas seulement la carte CTA)

### B1 · `parite-ardoise` — le gris n'est pas un accident, c'est un système

**C'est le verdict central de ce document.** « Un peu poche gris » décrit un vrai symptôme, mais la
cause n'est pas dans le bandeau sports.

> **Rejugé après la PR #51.** Un focus group parallèle a repeint la puce sans passer par les options
> ci-dessous (`/* Focus-group le-radar-sports-chip-look (C) */`, `style.css:169`). Le constat a donc
> été refait sur l'expédié. **Le diagnostic, lui, survit intact** — et l'argument de parité s'est
> même renforcé.

**Constat, à jour.** La puce sports est `rgba(42, 46, 54, .92)` + un ton `--sports-tone` (défaut
`#66839e`) lavé à **34 %** sur 55 % de la largeur, sous un liseré **`1,5 px` de pourpre `--accent`**
à 58 % et un anneau `0 0 0 1px --accent 22%` (`style.css:164-190`). Or **la carte météo du mât n'a
pas bougé** : `rgba(54, 59, 68, .68)`, y compris **en thème clair et sans photo**
(`style-masthead.css:409-424`). Le ton `#66839e` du défaut sports reste littéralement le
`--weather-tone` de « nuageux » (`style-masthead.css:733`).

**Ce que la PR #51 a changé au problème.** Avant, la bande sports et la carte météo étaient la même
ardoise à 10 points d'alpha près — une parité involontaire mais réelle. Maintenant la puce est plus
sombre, plus dense et cerclée de pourpre, la météo est restée où elle était : **les deux surfaces,
séparées de 8 px, ont divergé sans que rien ne le décide.** Le problème n'a pas été résolu, il a
changé de sens — on est passé d'une parité subie à un écart subi.

Et le diagnostic central tient mot pour mot : `rgba(42,46,54,.92)` **ne correspond toujours à aucun
token**. Le fond a été assombri à la main, il reste flottant.

**Trois options, rendues dans le labo :**

| | Option | Ce qu'on gagne | Ce qu'on paie |
|---|---|---|---|
| **A** | **Ardoise assumée, enrichie** — fond aligné sur `--tuner-bg` (`#111317` / `#1A1C21`) au lieu d'un gris flottant, ton porteur d'information (voir B2), contraste texte remonté à AA sur toute la bande | Cohérence tuner → météo → sports enfin explicite ; une seule ligne de fond à maintenir ; **ratifie la direction déjà prise par la PR #51** au lieu de la laisser à une valeur arbitraire | Reste sombre. Si « poche » voulait dire « je veux du clair », l'option ne répond pas |
| **B** | **Registre clair éditorial** — puces sur `--bg` / `--bg-soft`, filet `--rule`, typo `--ink` | Rupture nette d'avec le tuner ; cohérence avec les cartes `/sports/` ; le bandeau devient du contenu et non du chrome | **Doit être appliqué à la météo en même temps**, sinon deux registres à 8 px d'écart. Chantier ×2 — et défait la PR #51 |
| **C** | **Ton par établissement** — `--sports-tone` piloté par `brand-colors.json` | Chaque puce devient reconnaissable au coup d'œil | 9 couleurs d'école dans une bande de 60 px : arlequin. Et rouge McGill `#ED1B2F` / rouge Laval `#E30513` entrent en collision avec `--live` — **viole la règle d'or** |

**Consensus (4 voix / 5, renforcé) : option A.** La PR #51 a montré qu'on veut bien de l'ardoise —
elle l'a simplement posée sur une valeur écrite à la main. L'option A fait la même chose en
l'ancrant sur `--tuner-bg`, et ajoute ce que la PR n'a pas fait : rendre le ton porteur
d'information (`B2`) et remonter le contraste à AA. **Elle absorbe l'expédié au lieu de le défaire.**

**Dissidence (`designer`, 1 voix).** L'option B reste la seule qui réponde littéralement à la
demande initiale. Elle coûte maintenant plus cher qu'avant — il faudrait défaire la PR #51 en plus
de repeindre la météo. `reader` a rejoint le consensus : le liseré pourpre a suffi à lever son
impression de bande morte.

**L'option C est écartée** (voir §4). À ne pas confondre avec le « (C) » du commentaire
`style.css:169`, qui désigne la troisième variante d'un **autre** focus group.

`[CSS seul]` pour A · `[CSS seul, deux surfaces]` pour B · risque : moyen (couverture par
`tests/masthead-sports-fit.spec.mjs` + `masthead-weather.spec.mjs`).

---

### B2 · `ton-un-seul-sens` — `--sports-tone` ne veut rien dire

**Constat, à jour — le verdict s'est renforcé.** Il n'y a plus deux systèmes chromatiques dans la
puce, il y en a **trois** :

| Ce qui colore | Ce que ça encode | Où |
|---|---|---|
| Lavis `--sports-tone`, `90deg`, **34 %** sur 55 % | le **sport** | `style.css:170-172` |
| Pastille `.sports-chip__badge` — vert `#2f8f5b` / `--l` `#b84848` / `--d` `#6b7c8c` | le **résultat** | `style.css:244-259` |
| Liseré `--accent` 1,5 px + anneau 1 px (**nouveau, PR #51**) | **rien** — c'est du décor de marque | `style.css:167, 182-184` |

**Verdict (5 / 5, aggravé).** W6 : trois couleurs dans un objet de 32 px, dont deux qui disent des
choses différentes et une qui ne dit rien. Le lavis, poussé de 28 % à 34 %, n'est toujours décodable
par personne — et il est maintenant en concurrence avec un liseré pourpre nettement plus visible que
lui. **La seule couleur qu'on remarque dans la puce est la seule qui ne porte aucune information.**

**Reco.** Le ton porte **une** chose, et il l'exprime par un **filet gauche de 3 px** plutôt que par
un lavis — exactement le motif déjà en place sur la page `/sports/`
(`.sports-result--W/--L/--D` et `--next`, `seo-pages.css:1064-1070` et `1167-1190`). Le sport reste
porté par le glyphe `.sports-chip__glyph`, qui est déjà là et déjà lisible. Bénéfice secondaire : le
bandeau et la page partagent enfin une grammaire.

**Et le liseré pourpre reste** — mais comme cadre neutre de la puce, pas comme concurrent : le filet
gauche informatif est ce qu'on doit voir en premier. En pratique, garder `--accent` sur les trois
autres côtés et laisser le bord gauche au ton du résultat / de l'imminence.

**Deux états, parce que la puce en a deux.** Une puce de score et une puce à venir ne portent pas la
même nouvelle. Le ton doit être défini pour les deux, sans quoi le mode `next` — le seul visible
aujourd'hui — se retrouve sans couleur du tout, ce qui rendrait la bande **plus** grise, pas moins :

| Mode de la puce | Ce que porte le filet | Couleur |
|---|---|---|
| `result` | le résultat | vert `#3d9a6a` · rouge `#c45c5c` · ardoise `#8fa3b0` — les teintes déjà utilisées par la page |
| `next` | l'**imminence** | aujourd'hui `--status-upcoming-mid` `#bd8a18` · cette semaine à 55 % de ce ton · plus tard, ardoise neutre |
| `info` | rien à annoncer | ardoise neutre (voir `B7`) |

L'imminence est déjà calculée côté JS — `slide.urgency.tier` (`app.js:3371`) sert au libellé
« En cours » de l'infobulle. Le verdict la réutilise, il n'introduit pas de nouveau calcul.

`[CSS seul]` + une ligne dans `app.js` (poser le ton depuis le résultat ou l'imminence plutôt que
depuis le sport, cf. `app.js:3462`) · risque : faible.

---

### B3 · `cible-24-avec-espacement` — 32 px de haut, et c'est acceptable

**Constat.** `.sports-chip` : `min-height: 32px`, `gap: 6px` (`style.css:164-166`).

**Verdict (`a11y`, nuancé — et c'est un « oui, mais » et non un « non »).** 32 px est sous les 44 px
de WCAG 2.5.5 (AAA), mais **conforme** à WCAG 2.5.8 (AA, 24 × 24) : les puces font 32 px de haut et
sont séparées, donc l'exception d'espacement n'a même pas à jouer. La bande est un ruban, pas une
barre d'outils : la forcer à 44 px ferait passer `min-height` de 60 à 72 px et pousserait le fil
d'un cran sur tous les écrans.

**Reco.** Conserver 32 px, **passer le `gap` de 6 à 8 px** pour que la conformité 2.5.8 soit
inattaquable, et consigner le raisonnement en commentaire — c'est un choix, pas un oubli.

`[CSS seul]` · risque : faible, mais **le `gap` entre dans le calcul de la cascade de fit** :
`tests/masthead-sports-fit.spec.mjs` doit repasser (3-4 puces à 1440 px).

---

### B4 · `un-mouvement-a-la-fois` — de cinq à **sept** animations simultanées

> **C'est le verdict le plus dégradé par les PR #51 et #54.** Il en comptait cinq. Il y en a
> maintenant sept, et le rythme d'ensemble a été accéléré. Ce verdict devient le plus urgent de §2.

**Constat, à jour.** Dans une bande de 60 px peuvent tourner en même temps :

| # | Mouvement | Durée | Où |
|---|---|---|---|
| 1 | Marquee des puces score | **5,5 s** × `alternate` (était 8,5 s) | `style.css:299-310` |
| 2 | Marquee du titre CTA | **5,5 s** | `style.css:559-564` |
| 3 | **Marquee de la sous-ligne CTA** — *nouveau (PR #54)* | 5,5 s | `style.css:566-574` |
| 4 | Roulement vertical de l'accroche CTA | 280 ms toutes les 24 s | `style.css:536-556` |
| 5 | Halo de la carte CTA en direct | 2,6 s en boucle | `style.css:403`, `595-612` |
| 6 | Pastille « En cours » qui pulse | 2,6 s en boucle | `style.css:428`, `613-621` |
| 7 | **Halo pourpre `sports-chip-rim-glow`** — *nouveau (PR #51)* | **3,2 s en boucle, sur chaque puce non-CTA** | `style.css:186-188`, `203-212` |

plus le point live à 1,4 s (`style.css:438`, `623-627`).

**Et le rythme a été accéléré partout** (`app.js:1852-1863`) : `SPORTS_READ_MIN_MS` 7 800 → **4 800**,
`SPORTS_READ_PER_CHAR_MS` 42 → **36**, `SPORTS_READ_MAX_MS` 11 000 → **8 000**,
`SPORTS_SCROLL_POST_PAUSE_MS` 2 200 → **1 200**. Chaque puce reste donc moins longtemps à l'écran, et
la pause de relecture après l'aller-retour a été coupée de moitié.

**Verdict (5 / 5, aggravé).** Le verdict `le-radar-cta-sports-rhythm` a réglé la **fréquence** de la
rotation, pas la **simultanéité** — et la simultanéité a doublé depuis. Deux points nouveaux :

- **Le halo pourpre tourne en permanence sur chaque puce, sans condition.** Ce n'est pas un signal :
  il ne dit rien, ne réagit à rien, et ne s'arrête jamais. C'est exactement le raisonnement qui a
  déjà fait retirer la pulsation du chevron (`style.css:586-590` : « un chevron qui clignote à côté
  d'un texte stable se lit comme un défaut d'affichage »). Il est aujourd'hui appliqué à toute la
  bande au lieu d'un seul élément.
- **Deux pulsations de couleurs différentes coexistent** : pourpre à 3,2 s sur les puces score, rouge
  à 2,6 s sur la CTA en direct. Déphasées, jamais alignées — le battement qui en résulte est ce qui
  fait « défaut d'affichage » plutôt que « interface vivante ».

**Point WCAG (`a11y`).** `prefers-reduced-motion` coupe bien le halo (`style.css:237`) — c'est
correct et ça doit rester. Mais pour tous les autres, le halo est un mouvement décoratif
**automatique, en boucle, de plus de cinq secondes, sans mécanisme de pause** : c'est le cas visé
par WCAG 2.2.2. Le garde-fou maison n° 2 impose déjà `(hover: hover) and (pointer: fine)` + pause à
la rotation CTA pour cette raison précise ; le halo a été ajouté sans cette protection.

**Reco, en trois temps :**

- **Retirer `sports-chip-rim-glow`.** Le liseré pourpre statique suffit — c'est lui qui a levé
  l'impression de bande grise, pas son clignotement. Si le halo doit rester, le réserver à
  `:hover` sous `(hover: hover) and (pointer: fine)`, comme la rotation CTA.
- pendant le roulement de la CTA (280 ms), suspendre les marquees des puces score — une classe
  `is-rolling` sur `#masthead-sports-strip`, une règle `animation-play-state: paused` ;
- en direct, **choisir entre le halo CTA et la pastille qui pulse**. Le panel recommande de garder le
  **halo** (il porte sur toute la carte) et de figer la pastille en rouge plein, sans pulsation. Le
  point live, lui, reste : c'est le signal non chromatique de « en cours ».

**Dissidence (`designer`, 1 voix).** Le halo pourpre vient d'un focus group approuvé et expédié ; le
retirer, c'est défaire une décision prise. Contre-proposition : le ralentir à 6 s et baisser son
amplitude de moitié plutôt que le supprimer. **Le labo montre les deux.**

`[JS léger + CSS]` · risque : faible. Ne défait aucun verdict antérieur du registre d'alerte, mais
**touche à un choix expédié** — c'est le seul verdict du document dans ce cas, et la décision
t'appartient.

**Bug annexe repéré en passant (indépendant du verdict).** La sous-ligne CTA déclare
`animation: sports-chip-scroll-sub var(--sports-scroll-duration, 8.5s)` (`style.css:568`) et ses
propres holds à 32 % / 68 %, là où le titre est à 18 % / 82 % — l'intention était clairement de lui
donner un rythme plus lent que le titre. Mais `--sports-scroll-duration` est défini à `5.5s` sur
`.masthead-sports-strip` (`style.css:296`) et hérite jusqu'à la sous-ligne : **le repli `8.5s` est
mort, les deux marquees tournent à la même vitesse.** Le commentaire du nouveau test dit d'ailleurs
« hold initial ~32 % de 8,5 s ≈ 2,7 s » — en réalité 32 % de 5,5 s ≈ 1,8 s. Le test passe quand même
(il attend 3,2 s), mais sur un raisonnement faux. Correctif : une variable dédiée
`--sports-scroll-duration-sub`, ou assumer la vitesse unique et retirer le repli trompeur.

---

### B5 · `rayons-imbriques` — 6 px dehors, 3 px dedans, 4 px de padding

**Constat.** `.sports-chip` : `border-radius: 6px`, `padding: 4px 10px 4px 7px` (`style.css:166-168`).
`.sports-chip__badge` et `.sports-chip__cta-tag` : `3px` (`style.css:252`, `406`).

**Verdict (`designer` + `dev`, 5 / 5).** W3 donne `6 − 4 = 2 px`. À 3 px, l'imbrication est
légèrement fausse — invisible isolément, mais c'est ce qui donne l'air « barre d'état système »
plutôt que « carte ».

**Inchangé par la PR #51**, qui a touché la couleur de la bordure mais pas sa géométrie — le rayon
est toujours à 6 px et le padding n'a pas bougé. Un seul détail nouveau : **la bordure est passée de
1 à 1,5 px**, ce qui rend l'imbrication fausse un peu plus visible, le liseré épaissi appelant
davantage l'œil sur le coin.

**Reco.** Monter la puce à `8px` et les éléments internes à `4px` (`8 − 4 = 4`). Le gain perçu est
supérieur à la correction inverse (badges à 2 px), parce qu'un rayon plus généreux éloigne la puce
du registre « tray ».

`[CSS seul]` · risque : nul.

---

### B6 · `deux-graisses` — quatre graisses entre 650 et 800

**Constat.** Dans une puce score : sigle `800` (`style.css:330`), score `800` (331-336), adversaire
`700` (héritée de 175), « vs » `650` (342-347), heure `650` (348-352), badge `800` (254),
méta saison `600` (353-360).

**Verdict (5 / 5).** W5 : quatre graisses dans un objet de 32 px, c'est zéro hiérarchie. Tout est
gras, donc rien ne l'est — et le **score**, qui est l'information, n'a aucun privilège.

**Reco.** Deux graisses, un point focal — et **le point focal change avec le mode de la puce**. Dans
une puce `result`, la nouvelle est le score. Dans une puce `next`, il n'y a pas de score : la
nouvelle est **la date**. Or c'est aujourd'hui l'élément le plus faible de la puce (`650`, opacité
`.88`), alors que c'est la seule information qu'elle transporte.

| Élément | Aujourd'hui | Puce `result` | Puce `next` |
|---|---|---|---|
| Score | 800 | **800**, `+1 px`, `#fff` — point focal | absent |
| Date / heure (`__when`) | 650, opacité .88 | 600, opacité .8 | **800**, opacité `1` — point focal |
| Sigle équipe | 800 | 600 | 600 |
| Adversaire | 700 | 600 | 600 |
| « vs » | 650 | 600, opacité `.72` (inchangée) | 600, opacité `.72` |
| Badge W/L/D | 800 | 700 | absent |

`[CSS seul]` · risque : faible. Attention à la mesure du marquee : réduire les graisses raccourcit
le texte, donc `--sports-scroll` et le seuil `is-overflowing` se recalculent — ils sont déjà
dynamiques, mais à revérifier en labo avec un nom long.

**Depuis la PR #54, la mesure s'est dédoublée.** `refreshSportsChipScroll()` mesure désormais le
titre CTA **et** la sous-ligne séparément, via deux helpers réutilisables — `sportsMeasureOverflow()`
(`app.js:3182-3188`) et `sportsApplyScrollState()` (`app.js:3194-3214`) — qui posent
`--sports-scroll` / `is-overflowing` d'un côté et `--sports-scroll-sub` / `is-sub-overflowing` de
l'autre. Toute reco qui change une graisse **de la sous-ligne** doit donc repasser le nouveau test
CTA (garde-fou n° 3). La durée de séjour de la puce dépend maintenant elle aussi de la sous-ligne :
`sportsSlotDwellMs()` concatène titre et sous-ligne avant de mesurer le temps de lecture
(`app.js:3785-3797`).

---

### B7 · `hors-saison-meme-registre` — la seule puce centrée

**Constat.** `.sports-chip--info` a son propre dégradé vertical (`#6a7580` → `#4a545e`,
`style.css:261-269`), sa propre bordure, et `justify-content: center` — c'est la seule puce de la
bande dont le texte est centré.

**Portée réelle — plus étroite encore que ce que le panel croyait.** Vérification faite dans le
code, `sportsInfoSlide()` (`app.js:2459-2470`) porte ce commentaire : « Accroche info —
**désactivée dans la voie de gauche** (conservée pour tests / repli extrême si un appel force encore
mode info). Les messages creux vivent uniquement sur la CTA rouge. » Ce n'est donc même pas un repli
rare : c'est du code de secours qui ne s'affiche pas en usage normal. Avec 531 formations qui ont
des matchs à venir, l'inter-saison actuelle est rendue par des puces `next`.

**Le verdict reste consigné, mais il descend au dernier rang de §2** — il documente une incohérence
réelle, pas un problème que quelqu'un voit. Ce sont `B2`, `B4` et `B6` qui portent l'état
réellement visible.

**Verdict (5 / 5).** W8 : centrer un libellé de longueur variable dans une puce qui s'étire en
`flex: 1 1 0` produit un alignement différent à chaque largeur. Et le dégradé vertical est un
troisième registre chromatique dans la même bande (à côté de l'ardoise et du rouge live).

**Reco.** Même fond que les autres puces, texte à gauche, et un eyebrow `HORS SAISON` en 9 px
capitales devant le libellé — soit exactement la structure `eyebrow + accroche` que le verdict
`le-radar-cta-sports-badge` a déjà validée sur la CTA.

`[CSS seul]` (+ un `<span>` dans `app.js` pour l'eyebrow) · risque : faible.

---

## §3 — La page `/sports/`

> Rappel de coût : `sports/index.html` fait 1,4 Mo et est **généré**
> (`scripts/generate-seo.js` → `scripts/seo-pages.js`). Tout verdict marqué `[markup + regen]`
> implique de modifier le générateur puis de relancer `npm run seo:update` — le diff du fichier
> généré sera énorme. Les verdicts `[CSS seul]` ne touchent que `seo-pages.css`.
>
> **L'en-tête de la page a changé depuis la rédaction (PR #51).** Un autre focus group
> (`le-radar-sports-page-title`) a récrit le haut de `/sports/` : le H1 passe de « Sports Étudiants »
> à **« Sports collégiaux et universitaires du Québec »**, et `sportsLead` comme `sportsMeta` ont été
> **vidés** (`scripts/seo-pages-lib.js:295-304`) — la page n'a donc plus ni chapô ni ligne de
> contexte, seulement « Mise à jour … ». `static-integrity` verrouille les deux
> (`pas de seo-lead`, H1 exact). **Aucun verdict de §3 ne portait sur ces éléments** : `P1` à `P7`
> traversent ce changement sans être touchés. C'est signalé ici pour qu'on ne lise pas la suite
> comme écrite contre l'ancienne page.

### P1 · `une-seule-delimitation` — quatre délimiteurs pour une carte

**Constat.** `.sports-panel` (`seo-pages.css:835-847`) cumule : `border: 1px solid var(--rule)`,
`border-top: 3px solid var(--sports-panel-c)`, `background: var(--bg-soft)`, et
`box-shadow: 0 1px 3px rgba(0,0,0,.04)`.

**Verdict (5 / 5).** W7 : quatre signaux pour dire « ceci est une carte ». L'ombre à 4 % d'alpha est
en dessous du seuil de perception et ne fait que coûter une couche de composition.

**Inchangé par la PR #51**, qui a ajouté `container-type: inline-size` / `container-name` au même
bloc (pour `P3`) sans toucher aux quatre délimiteurs. Un point de vigilance en découle : la carte est
maintenant un **conteneur de requête**, donc supprimer sa bordure change sa largeur interne de 2 px
et déplace légèrement le seuil de bascule à 340 px. Sans conséquence pratique — le seuil n'est pas
calibré au pixel — mais à appliquer avant `P6` plutôt qu'après.

**Reco.** Garder **deux** choses : le fond `--bg-soft` (il détache la carte du fond de page) et le
filet supérieur coloré (il porte le sport, c'est de l'information). Supprimer la bordure 1 px et
l'ombre. Compenser par du padding (voir P7).

`[CSS seul]` · risque : nul.

---

### P2 · `point-focal-la-nouvelle` — la carte met en avant le nom, pas la nouvelle

**Constat.** Le point focal typographique est le **surnom** : `.sports-panel__name`, serif,
`1.22 rem`, `700` (`seo-pages.css:916-927`). La ligne de match, elle, plafonne à `13 px`
(`.sports-result__score`, `seo-pages.css:1091-1096`) — deux fois plus petit.

**Et surtout : la colonne forte est occupée par un mot de remplissage.** Sur les 532 cartes qui ont
une ligne, **531 sont des lignes `--next`**. Or dans une ligne `--next`, la colonne « score » ne
contient pas un score : elle contient le **mot « À venir »** (`.sports-result__score--next`,
`seo-pages.css:1097-1105`), pendant que la vraie information — la date et l'heure — est reléguée
dans la colonne temps à `12 px`. Le libellé le moins informatif de la carte occupe sa place la plus
forte, sur 65 % de la page.

**Verdict (4 / 5, `editor` dissident).** Sur une page qui s'appelle « Au tableau », le lecteur vient
pour la nouvelle — le dernier résultat en saison, le prochain match hors saison. La carte est
construite comme une **fiche d'annuaire**. C'est d'ailleurs exactement la correction que le
focus-group a déjà appliquée à la carte CTA du bandeau (`le-radar-sports-first-glance` : le lead est
piloté par la fraîcheur). La page n'a pas suivi.

**Reco, dans cet ordre de priorité.**

1. **Libérer la colonne forte** — la date et l'heure existent déjà, elles sont simplement empilées
   dans la colonne temps. Les répartir : **la date reste à gauche, l'heure passe dans la colonne
   forte** au traitement du score, et le mot « À venir » disparaît — le filet jaune et le badge `→`
   le disent déjà. Aucune donnée à inventer, aucune colonne à ajouter. C'est le correctif qui touche
   65 % de la page.
2. **Rééquilibrer les tailles**, sans changer l'ordre du DOM — le surnom reste le `<h3>`, donc le
   plan du document et le référencement ne bougent pas : `.sports-panel__name` de `1.22 rem` à
   `1.05 rem` / `600`, et la ligne de tête (résultat en saison, prochain match hors saison) à
   `1.15 rem` / `800` avec l'adversaire à `13 px` / `600`.

Le lecteur voit d'abord ce qui se passe, puis à qui.

**Dissidence (`editor`).** Le surnom est l'identité du club et la page sert aussi d'annuaire de 813
formations ; le rétrograder appauvrit la moitié non-sportive de l'usage. Contre-proposition :
garder le surnom à `1.22 rem` et ne remonter que la ligne de match, en acceptant deux éléments forts
par carte. **Le labo montre les deux.** Noter que la dissidence ne porte que sur le point 2 : le
point 1 (libérer la colonne forte) fait l'unanimité.

`[CSS seul]` pour le rééquilibrage des tailles · `[markup + regen]` pour le point 1, qui déplace du
contenu entre deux colonnes dans `sportsResultRows()` (`scripts/seo-pages.js:1155-1168`) ·
risque : faible.

---

### P3 · `noms-longs-deux-lignes` — ✅ **APPLIQUÉ** (PR #51)

> **Ce verdict est en production.** `seo-pages.css:1450-1463`, sous le commentaire
> `/* Focus-group P3 : noms longs — repli 2 lignes sous ~340px de carte */`, avec le
> `container-type: inline-size` sur `.sports-panel` (l. 836-837) que la reco demandait.
> Il est conservé ici comme trace, avec l'écart entre l'expédié et le recommandé.

**Constat d'origine.** `.sports-panel__list` est une grille `4.5rem 4.25rem minmax(0,1fr) 1.25rem`
(`seo-pages.css:1026-1034`), en subgrid. Soit ≈ 156 px de colonnes fixes dans une carte dont la
piste minimale est de **288 px** (`seo-pages.css:801`) : il restait ~110 px pour le nom d'adversaire.
Le générateur avait déjà dû sortir l'établissement sur sa propre ligne pour survivre
(`.sports-result__opp-full`, `seo-pages.css:1140-1148`).

**Verdict (5 / 5).** W10. Le symptôme était déjà visible dans le code : quand une mise en page a
besoin d'un correctif « et l'établissement va sur sa propre ligne », c'est la grille qui est trop
étroite. **La mesure était sans appel : `527 cartes sur 813`, soit 65 %, déclenchaient déjà ce
repli** — « Cégep de Saint-Jean-sur-Richelieu », « Collège François-Xavier-Garneau » sont la matière
ordinaire du réseau collégial québécois.

**Reco d'origine.** Sous ~340 px de largeur de carte, replier la ligne de résultat en **deux
rangées** : `date + badge` sur la première, `score + adversaire` sur la seconde, en pleine largeur.

**Ce qui a été expédié — trois rangées, pas deux.**

| | Recommandé | Expédié |
|---|---|---|
| Rangée 1 | date + badge | `__time` + `__badge` ✅ identique |
| Rangée 2 | **score + adversaire** | `__score` **seul** |
| Rangée 3 | — | `__title` (l'adversaire) en pleine largeur |

L'expédié sépare le score de l'adversaire au lieu de les apparier. Chaque ligne de résultat fait donc
**trois rangées de haut** sous 340 px là où la reco en visait deux, ce qui coûte une hauteur de
ligne par résultat sur les écrans les plus étroits — précisément ceux où la place manque.

**Deux notes pour qui reprendra ce bloc :**

- `grid-template-rows: auto auto` déclare **deux** rangées alors que `.sports-result__title` est posé
  sur `grid-row: 3`. La troisième rangée est créée implicitement — le rendu est correct, mais la
  déclaration ment sur ses propres intentions. Une ligne à corriger si le bloc est retouché.
- **Interaction avec `P6`** : en portant la ligne de résultat de une à trois rangées sous 340 px,
  l'expédié **creuse** la dent de scie que `P6` cherche à réduire — l'écart entre une carte vide et
  une carte remplie passe de une à trois hauteurs de ligne. Les deux verdicts doivent être appliqués
  ensemble, `P6` après `P3`, sinon le second aggrave ce que le premier corrige.

`[CSS seul]` · **appliqué**, aucun coût restant. Reste ouvert : le regroupement score + adversaire
et la déclaration `grid-template-rows` — deux retouches d'une ligne chacune.

---

### P4 · `etat-lisible-sans-couleur` — presque conforme, sauf le maillon utile

**Constat.** W/L/D sont signalés par un filet gauche coloré **et** une lettre
(`.sports-result__badge`). Le canal non chromatique existe donc — bon point, à conserver. Mais ce
badge est en `11 px`, `var(--muted)` (`seo-pages.css:1160-1166`) : l'élément qui porte le sens est
le plus faible de la ligne.

**Verdict (5 / 5).** W6 respecté sur le principe, contredit par les valeurs.

**Reco.** Badge à `12 px`, couleur `--ink-soft` en neutre et la couleur d'état seulement en
W / L (déjà le cas : `#2f7a54` / `#a04545`, l. 1172 et 1180) ; en contrepartie, descendre le fond
teinté de la ligne de 9 % à 6 % — le filet gauche suffit.

**Verdict de saison, pas d'aujourd'hui.** À la date de rédaction, **une seule carte sur 813** porte
une ligne `--W`/`--L`/`--D` : le système chromatique de résultat est à peu près invisible en
inter-saison. Le badge réellement à l'écran est le `→` des lignes `--next`, dont le
`.sports-result__badge--next` en `--status-upcoming` (l. 1189-1191) souffre du même défaut de
faiblesse — le corriger dans le même geste. Le verdict reste juste, il faut simplement savoir qu'il
ne se verra qu'à la reprise.

`[CSS seul]` · risque : nul.

---

### P5 · `pas-de-carte-cliquable-multi-cible` — verdict négatif, assumé

**Constat.** W9 demande la carte entière cliquable. `.sports-panel` ne l'est pas : seuls les titres
de match le sont (`.sports-result__title a`).

**Verdict (5 / 5) : ne pas appliquer W9 ici.** Une carte de formation contient N liens de match et
n'a **pas** de destination unique. La rendre cliquable obligerait soit à inventer une page équipe
qui n'existe pas, soit à imbriquer des liens dans un lien — invalide, et un piège au clavier.

Ce verdict est consigné pour que le principe ne soit pas appliqué mécaniquement à la prochaine
passe. Le deep-link `?team=` et le `is-spotlight` (`seo-pages.css:853-860`) couvrent déjà le besoin
« pointer une carte ».

`[aucun changement]`

---

### P6 · `hauteur-convergente` — la grille en dents de scie, pour la bonne raison

> **Ce verdict a été récrit.** La première version affirmait que le nombre de lignes de résultat
> n'était pas plafonné — « une carte à un match et une carte à douze cohabitent » — et recommandait
> un `<details>` « + 9 autres matchs ». **C'est faux.** `sportsResultRows()`
> (`scripts/seo-pages.js:1094-1178`) pousse **au plus deux lignes** : un `team.lastGame`, un
> `team.nextGame`. Il n'existe pas de troisième. La mesure sur la page générée le confirme : 0 ou 1
> ligne par carte, jamais plus. La recommandation aurait fait construire un dépliant sur des données
> qui n'existent pas. Elle est retirée.

**Le vrai constat.** `.sports-board` est en `auto-fill minmax(288px, 1fr)` avec `align-items: start`
(`seo-pages.css:795-805`), et la hauteur des cartes varie bel et bien. Mais pour deux causes
mesurées, aucune n'étant le nombre de matchs :

| Cause | Ampleur |
|---|---|
| Cartes rendant un paragraphe `.sports-panel__empty` au lieu d'une ligne de match | **281 sur 813** (35 %) |
| Bloc identité à 2 lignes contre 3 (selon que l'équipe a un surnom distinct de son nom court) | 490 contre 323 |

Une carte vide est nettement plus courte qu'une carte remplie, et les deux sont mélangées dans la
grille — d'où la dent de scie.

**Une troisième cause depuis la PR #51.** Le `P3` expédié replie la ligne de résultat en **trois
rangées** sous 340 px de carte (voir `P3`). Sous ce seuil, l'écart entre une carte vide et une carte
remplie n'est donc plus d'une hauteur de ligne mais de **trois** : le `P3` en production a creusé la
dent de scie exactement là où elle était déjà la plus visible — en une seule colonne, sur mobile.

**Verdict (5 / 5, plus de dissidence — et devenu plus urgent).** Les trois écarts se corrigent par de
la mise en page, sans toucher au contenu.

**Reco.**

- Donner à `.sports-panel__empty` (`seo-pages.css:1035-1041`) l'empreinte verticale d'une ligne de
  match : `min-height` équivalente, même `padding` que `.sports-result`, même filet supérieur.
  **Cette `min-height` doit être définie dans les deux régimes** — la ligne normale et le repli
  `@container` à trois rangées — sinon la correction ne vaut que au-dessus de 340 px, c'est-à-dire
  là où le problème est le moins grave.
- Réserver au bloc `.sports-panel__identity` une hauteur minimale de trois lignes, pour que la
  présence ou l'absence d'un surnom ne décale plus la liste.

Le verdict passe de `[markup + regen]` / risque moyen / **contenu indexé** à `[CSS seul]` / risque
nul, et sort de la liste des arbitrages. La dissidence `editor` + `dev` — « ne rien replier, une
page SEO ne cache pas son contenu » — devient sans objet : plus rien n'est replié.

`[CSS seul]` · risque : nul. **À appliquer après `P3`** — et si le regroupement score + adversaire de
`P3` est repris (repassant la ligne à deux rangées), refaire la mesure avant de figer les
`min-height`.

---

### P7 · `echelle-4-8` — des valeurs hors échelle

**Constat.** `.sports-panel` : `padding: 14px 14px 12px`. `.sports-board` : `gap: 14px`.
`.sports-panel__head` : `margin-bottom: 10px`. `.sports-panel__name` : `margin: 0 0 3px`.
`.sports-result` : `padding: 8px 0`.

**Verdict (5 / 5).** W1 + W2. Les 14 / 12 / 10 / 3 ne relèvent d'aucune échelle ; et le padding est
**horizontalement égal** au vertical, alors que W2 demande l'inverse. Le reste du dépôt tient
pourtant un rythme de 8 px explicite (`style.css:118-126`, `style-masthead.css:779-781`).

**Reco.**

| Propriété | Aujourd'hui | Proposé |
|---|---|---|
| `.sports-panel` padding | `14px 14px 12px` | `16px 16px 12px` (horizontal > vertical bas) |
| `.sports-board` gap | `14px` | `16px` |
| `.sports-panel__head` margin-bottom | `10px` | `12px` |
| `.sports-panel__name` margin-bottom | `3px` | `4px` |
| `.sports-result` padding | `8px 0` | `8px 0` (déjà juste) |

Combiné à **P1** (deux délimiteurs de moins), c'est le changement qui rapproche le plus la carte de
la grille Whitehurst, pour le risque le plus faible du document.

`[CSS seul]` · risque : nul.

---

## §4 — Ce que le panel ne recommande **pas**

| Écarté | Pourquoi |
|---|---|
| **B1 option C** — couleur d'établissement dans le bandeau | Neuf couleurs d'école dans 60 px ; et le rouge McGill `#ED1B2F` / Laval `#E30513` entre en collision avec `--live` `#C8102E`. **Viole la règle d'or.** La couleur d'établissement garde son rôle actuel : les pastilles d'article. *(À ne pas confondre avec le « (C) » de `style.css:169`, qui est la variante d'un autre focus group.)* |
| Une couleur sémantique « sport » | Il y en a déjà trois (pourpre / rouge / bleu) et une par établissement. Une quatrième famille rendrait la règle d'or inapplicable. |
| Rejouer les verdicts rendus | Registre d'alerte, rythme de rotation, position du chevron, pastille « Sports » : tranchés, encodés, testés. Non rouverts. |
| Passer les puces du bandeau à 44 px | `min-height` de la bande passerait de 60 à 72 px et pousserait le fil sur tous les écrans, pour un gain nul en conformité AA (voir B3). |
| Rendre `.sports-panel` cliquable | Carte multi-destination (voir P5). |
| **Replier les résultats derrière un `<details>`** (ancienne version de `P6`) | Prémisse fausse : `sportsResultRows()` plafonne à deux lignes par carte, et la mesure en donne 0 ou 1. Il n'y a rien à replier. Verdict récrit — voir `P6`. |
| Découper `app.js` ou `style.css` au passage | Interdit sans demande explicite (`CLAUDE.md` §4). |
| Toute reco qui change le nombre de puces à 1440 px | `tests/masthead-sports-fit.spec.mjs` exige 3 à 4. |

---

## §5 — Coût, risque, ordre d'application

À approuver **ligne par ligne**. L'ordre proposé va du risque nul au risque élevé.

La colonne **Visible aujourd'hui** dit si le verdict se constate à l'écran en inter-saison (voir §0)
ou seulement à la reprise du 19 août — utile pour décider par quoi commencer.

| # | Verdict | Coût | Risque | Visible aujourd'hui | Test de couverture |
|---|---|---|---|---|---|
| ~~**P3**~~ | ~~`noms-longs-deux-lignes`~~ | — | — | — | ✅ **appliqué PR #51** — reste 2 retouches d'une ligne |
| **B4** | `un-mouvement-a-la-fois` — **le plus dégradé, monte en tête** | CSS + JS | faible | **oui — halo pourpre sur chaque puce** | `masthead-sports-fit` |
| **P7** | `echelle-4-8` | CSS seul | nul | oui | revue visuelle |
| **P1** | `une-seule-delimitation` | CSS seul | nul | oui | revue visuelle |
| **P6** | `hauteur-convergente` — **après `P3`** | CSS seul | nul | **oui — 35 % de cartes vides, aggravé sous 340 px** | revue visuelle |
| **B5** | `rayons-imbriques` | CSS seul | nul | oui | `masthead-sports-fit` |
| **M5** | `echelle-typo-intacte` | — | — | — | (verdict « ne rien faire ») |
| **P5** | `pas-de-carte-cliquable-multi-cible` | — | — | — | (verdict « ne rien faire ») |
| **M6** | `credit-photo-cible` | CSS seul | faible | oui | revue visuelle |
| **M2** | `groupes-par-proximite` | CSS seul | faible | oui | `shared-chrome` |
| **M4** | `slogan-lisible-mobile` | CSS seul | faible | oui | revue visuelle |
| **P2** | `point-focal-la-nouvelle` | markup + regen (pt 1) · CSS (pt 2) | faible | **oui — « À venir » occupe la colonne forte** | `seo-pages` |
| **B6** | `deux-graisses` | CSS seul | faible | oui, via la puce `next` | `masthead-sports-fit` (titre + sous-ligne) |
| **B2** | `ton-un-seul-sens` — **renforcé : 3 systèmes** | CSS + 1 ligne JS | faible | oui, via l'imminence | `masthead-sports-fit` |
| **B3** | `cible-24-avec-espacement` | CSS seul | faible | oui | `masthead-sports-fit` (fit) |
| **M7** | `accueil-en-double` — **choisir reco ou dissidence** (dissidence renforcée) | markup | faible | oui | `static-integrity` (assertions revues PR #51) |
| **P4** | `etat-lisible-sans-couleur` | CSS seul | nul | **non — 1 carte sur 813** | revue visuelle |
| **B7** | `hors-saison-meme-registre` | CSS + JS | faible | **non — code de secours, jamais servi** | `masthead-sports-fit` |
| **B1** | `parite-ardoise` — **choisir A ou B** (rejugé sur la base PR #51) | CSS (B = deux surfaces) | moyen | oui | `masthead-sports-fit` + `masthead-weather` |
| **M1** | `voile-unique` — **choisir reco ou dissidence** | CSS seul | moyen | oui | revue labo, photo claire **et** sombre |
| **M3** | `heure-dans-le-flux` | CSS seul | **élevé** | oui | `masthead-weather` + cascade de date |

**Ce que la PR #51 a déplacé dans ce tableau.** `B4` passe du milieu à la tête : c'est le seul verdict
dont le problème a **empiré** depuis la rédaction, et il est maintenant visible en permanence.
`P3` sort — appliqué. `P6` gagne une dépendance d'ordre. `M7` reste ouvert (triple Accueil
confirmé par audit + PR #56). `B7` descend au dernier rang utile.

### Quatre arbitrages qui t'appartiennent

1. **B4 — le halo pourpre** *(nouveau, et le plus pressant)*. Le retirer (recommandation du panel :
   c'est un mouvement permanent, décoratif, non pausable, sur chaque puce — WCAG 2.2.2), le réserver
   à `:hover`, ou le ralentir à 6 s en baissant l'amplitude (dissidence `designer`). **C'est le seul
   arbitrage du document qui porte sur un choix déjà expédié** : il vient du focus group
   `le-radar-sports-chip-look (C)`, approuvé et en production. Le panel rend son avis, la décision
   de défaire ou non t'appartient entièrement.
2. **B1** — option **A** (ardoise ancrée et enrichie, recommandation du panel, qui **absorbe** la
   PR #51 au lieu de la défaire) ou option **B** (registre clair, météo comprise, chantier ×2 —
   réponse littérale à « poche gris », mais qui défait la PR #51).
3. **M1** — voile en deux bandes (recommandation) ou simple allègement des piles d'ombres
   (dissidence `dev`, risque nul sur les photos claires).
4. **M7** — désarmer l'icône du mât sur l'accueil (recommandation) ou garder les deux commandes et
   ne retirer qu'un `aria-current` (dissidence `dev` + `reader`, **renforcée** : la PR #51 ayant déjà
   retiré l'occurrence du pied de page, l'argument du panel a perdu un tiers de sa force).

Les quatre sont rendus dans le labo. **`P6` n'en fait plus partie** : sa première version reposait
sur une prémisse fausse, et le verdict récrit est unanime, `[CSS seul]` et sans risque.

Reste une dissidence de moindre portée, également rendue dans le labo : sur **`P2`**, l'`editor`
accepte le point 1 mais refuse de rétrograder le surnom (point 2).

### Deux corrections sans arbitrage, à faire au passage

Repérées pendant le recalage, indépendantes des verdicts et sans coût :

- **Le repli `8.5s` mort de la sous-ligne CTA** (`style.css:568`) — `--sports-scroll-duration` vaut
  `5.5s` et hérite, donc la sous-ligne ne tourne pas au rythme plus lent qui était visiblement voulu.
  Voir la note de `B4`.
- **`grid-template-rows: auto auto` face à `grid-row: 3`** dans le `@container` de `P3`
  (`seo-pages.css:1454-1460`) — la troisième rangée est implicite, le rendu est bon, la déclaration
  est trompeuse.

### Après approbation

Les verdicts approuvés sont appliqués **par lots de risque croissant**, chaque lot avec son commit,
son slug en commentaire de code (comme `le-radar-sports-first-glance` aujourd'hui) et sa passe de
tests :

```bash
npm run check
npx playwright test tests/masthead-sports-fit.spec.mjs \
                    tests/masthead-weather.spec.mjs \
                    tests/masthead-css-load.spec.mjs \
                    tests/shared-chrome.spec.mjs
# si un verdict [markup + regen] est retenu :
npm run seo:update && npx playwright test tests/seo-pages.spec.mjs
npm run sw:bump   # le shell change → pousser la MAJ aux apps installées
```

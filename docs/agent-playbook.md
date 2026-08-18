# LE-RADAR — Playbook agent (lire en premier)

**LE-RADAR** — Le Réseau Académique de Découverte et d'Agrégation de Ressources.

Doc courte pour agents et humains pressés. **Point d’entrée technique** avant de rouvrir les monolithes.

**Avant tout vibe-code :** lire aussi [`AGENTS.md`](../AGENTS.md) à la racine — dettes volontaires, rythme « un bloc à la fois », économie de tokens long terme. Ne pas ignorer le ledger.

**Fin de session (ticket OK) :** `npm run agents:propose` → afficher la proposition à l’humain → **attendre OK** avant de solder une dette → mettre à jour le ledger si besoin.

Pour la maintenance bots/CI longue : [`maintenance.md`](maintenance.md).  
Pour ajouter un journal : [`adding-news-source.md`](adding-news-source.md).

---

## 1. Architecture en 10 lignes

| Zone | Rôle | Fichiers pivots |
|------|------|-----------------|
| **Mât** | Header photo + météo + slogan | `index.html`, `quebec-backgrounds.js`, banques `QUEBEC_*` |
| **Tuner radio** | Un lecteur, grilles, nowplaying | `app.js` (gros), `mobile-playback.js`, `radios.json` |
| **News** | Fil RSS agrégé | `news.json`, `news-sources.json`, `scripts/fetch-news.js` |
| **Pomo** | Mini-app isolée `/pomo/` | `pomo/`, `quebec-pomo-backgrounds-data.js`, `pomo/sw.js` |
| **Solitaire** | Mini-app isolée `/solitaire/` | `solitaire/`, SW propre |
| **Workers CF** | Edge (nowplaying cache, bg entropy) | `workers/` — **pas d’audio** |
| **SW shell** | Cache offline app shell | `sw.js` (`radar-shell-vN`), `pomo/sw.js` (`pomo-shell-vN`) |

Compartiments **non fusionnables** : mât ≠ pomo ≠ uni ≠ nations (sauf nations **partagée** mât+pomo). Favorites manuelles = hors purge bots.

---

## 2. Banques photo (fonds wallpaper)

### Chemins

| Profil | JSON (source de vérité) | JS miroir (shell) | Consommateurs |
|--------|-------------------------|-------------------|---------------|
| **masthead** | `data/quebec-backgrounds.json` | `quebec-backgrounds-data.js` | mât seulement |
| **universities** | `data/quebec-university-backgrounds.json` | `quebec-university-backgrounds-data.js` | mât seulement |
| **pomo** | `data/quebec-pomo-backgrounds.json` | `quebec-pomo-backgrounds-data.js` | pomo seulement |
| **nations** | `data/quebec-nations-backgrounds.json` | `quebec-nations-backgrounds-data.js` | mât **+** pomo |
| **favorites** | `data/quebec-favorites-backgrounds.json` | `quebec-favorites-backgrounds-data.js` | mât (+ pomo si `surfaces`) |

Runtime mât : `quebec-backgrounds.js` (filtres client). Runtime pomo : `pomo/js/backgrounds.js`.

### Pipeline

```
éditer JSON  →  npm run bank:sync     →  JS miroirs à jour (+ purge hard-ban)
maintain     →  revalidate + Commons  →  JSON + JS (1×/session univ. plein ménage)
blacklist    →  scripts/quebec-backgrounds-blacklist.js  (ne revient jamais)
```

- **Purge** = retirer une mauvaise entrée + blacklister. **Pas de re-seed hasardeux** (mieux un trou). Licence inconnue / ARR / NC : **ne plus drop** — crédit + retrait sur demande.
- **Hard-ban** : URL / File Commons / id en priorité ; raison snake_case loggable.
- Règles paysage mât/pomo (pas universities/nations) : religieux ; **town hall / hôtel de ville / mairie** ; scènes bad (nuit, underbridge, clôture, aéroport/hangar/industriel…, **panneaux / enseignes / welcome signs**).
- **Panneau toponyme** (titre = seul le lieu, image = enseigne) : hard-ban **fichier Commons exact** — ne pas bannir le lieu entier (ex. `Gesgapegiag.jpg` ban, `Gesgapegiag4` tipi OK).
- Nations : spiritualité autochtone **OK** (hors filtre religieux institutionnel).
- **Saisons** (`scripts/season-lib.js` + bot `detect-photo-seasons`)
  - mât / pomo / campus → **4 saisons** météo (`season`: printemps|ete|automne|hiver)
  - nations / Inuit → **6 saisons** Nunavik éducatif (`season6`: ukiuq…ukiaq)
  - **Bot** (source de vérité tags) :
    ```bash
    npm run detect:seasons              # dry-run
    npm run detect:seasons:update       # JSON + bank:sync (texte, offline)
    npm run detect:seasons:visual       # + thumbs Commons / Pillow (réseau)
    ```
    Champs : `season`, `season6`, `seasonConfidence`, `seasonSource` (`text`|`date`|`topo`|`visual`|`manual`).
    `seasonSource: manual` n’est **jamais** écrasé.
  - **Client** : filtre saison en cours (fallback adjacent) — ne remplace pas le bot.
  - Neige arctique en juillet = hors saison — ne pas forcer le pool complet.
  - **Pierre grise ≠ hiver.** Un tag visuel (béton, calcaire, rocher) n’est
    pas une preuve. On ne retire une photo d’une saison que si on est *sûr*
    qu’elle n’y est pas (neige / mot-clé / date / manuel). Garder la photo
    pour les saisons où elle va ; l’hiver réel reste l’hiver.
  - `seasonSource: sessionId-fallback` = **jamais analysée** (saison de la session
    de moisson). Traitée comme saison inconnue et **non exportée** vers les
    `*-data.js` : sans ce garde-fou une scène enneigée entrait dans le tier strict
    de juillet. La re-taguer via le bot visuel ou à la main, pas en la bannissant.
- **Visages** (`scripts/detect-photo-faces.js` + `.py`) — la politique interdit les
  personnes reconnaissables, mais `PEOPLE_RE` ne lit que titre/URL/lien : un
  toponyme numéroté passait avec un visage au premier plan.
  ```bash
  pip install "opencv-python-headless<5" Pillow   # OpenCV 5 n’a plus les cascades Haar
  npm run detect:faces                            # dry-run (réseau, thumbs Commons)
  npm run detect:faces:update                     # écrit faces/faceRatio + bank:sync
  ```
  Champs persistés : `faces`, `faceRatio`, `faceDetectedAt`. La **porte** est en
  Node (`wallpaper-subject-lib` → `textGate` / `auditPhotoHard`) et lit ces champs,
  donc elle tient en CI, qui n’a pas Python. Banque non annotée → porte muette.
  Un signalement se solde par une entrée de blacklist après revue humaine.

### Blacklist — ajouter une entrée

Éditer `scripts/quebec-backgrounds-blacklist.js` → `HARD_BANNED[]` :

```js
{
  fragments: ['NomFichier_Commons_exact', 'eb86432b9561'],
  reason: 'reads_as_chapel_clocher',
  note: 'pourquoi en une ligne',
}
```

Puis : `npm run bank:sync` → vérifier `npm run bank:check` → si `*-data.js` shell changent, **bump SW**.

---

## 3. Commandes npm à retenir

```bash
npm run check                 # syntaxe + unit (dont intégrité banques)
npm run bank:check            # JSON↔JS + aucun hard-ban résiduel (offline)
npm run bank:sync             # régénère les JS depuis les JSON + purge ban
npm run audit:banks:hard      # HARD offline (religieux, ban, dims, scènes) — 0 réseau
npm run detect:seasons        # bot saison (dry-run)
npm run detect:seasons:update # bot saison → JSON + JS

npm run maintain:masthead     # paysages mât (réseau Commons si ménage)
npm run maintain:pomo
npm run maintain:universities
npm run maintain:nations
npm run maintain:backgrounds:all   # les 4 profils maintain

npm run audit:backgrounds     # audit visuel Python mât (optionnel, réseau images)
npm run pin-background -- --from-bank masthead --match "Percé"
```

Alias historiques : `maintain:backgrounds` = masthead ; `…:pomo` etc. inchangés.

---

## 4. Règles de non-casse (ne pas « améliorer »)

| Zone | Règle |
|------|--------|
| **Android radio** | Un seul `HTMLMediaElement` ; pas de 2ᵉ son ; **pas** de proxy audio dans un Worker CF |
| **SW** | Bump `radar-shell-vN` si assets shell mât changent ; **aussi** `pomo-shell-vN` si pomo/nations/favorites data JS changent |
| **Engage / PWA** | Promo déjà douce — ne pas renaguer ni spammer |
| **Retour dans l'app** | < 5 min rien · ≥ 5 min fil rechargé sur place · ≥ 1 h rechargement dur — **jamais pendant une écoute** (`returnRefreshAction`, `app.js`) |
| **Thèmes** | dark/light + overlays texte lisibles sur photo mât (cartes météo) |
| **Banques** | Ne jamais coller `QUEBEC_POMO_*` dans le mât, ni l’inverse |
| **Favorites** | `permanent: true` — immunisées purge maintain (sauf non-image). Licence CC **non exigée** : crédit « Nom — lieu » (jamais la saison). © droit si copyright ; copyleft inversé si CC BY-SA. URL locale `/assets/masthead/…` OK. `?bg=` force une photo. **Ne force pas l’affichage hors saison**. |
| **Shuffle mât** | Clic = exclusion dure des 15 dernières + tout le sac (pas une fenêtre de 12). Le worker CF ne choisit pas la photo. |

---

## 5. Où **ne pas** commencer

| Éviter en premier (monolithes) | Préférer |
|--------------------------------|----------|
| `app.js` (~7k lignes) | `mobile-playback.js`, `player-sync.js`, `docs/*` |
| `style.css` (~5k) | règles ciblées + `docs/identite-visuelle.md` |
| Re-scan Commons bulk | blacklist + `bank:sync` + maintain ciblé |
| Refonte UX radio/météo/PWA | hors scope sauf bug bloquant |

---

## 6. Checklist ship (fonds / bots / docs)

1. `node --check` sur scripts JS touchés (ou `npm run check:syntax`)
2. `npm run bank:check` — URL purgée absente des banques (sauf blacklist)
3. `npm run test:unit` si possible (data-integrity inclut les banques)
4. SW bump **seulement** si shell réellement impacté (mât et/ou pomo)
5. Diff final : chaque hunk = pipeline / purge / blacklist / doc / scripts — pas d’UX gratuite
6. Commit message orienté résultat ; push `main` si checks OK

### Message type

```
Pipeline banques QC : sync JSON, blacklist durable, playbook agent
```

---

## Dettes assumées (ne pas ouvrir sans besoin)

- Pas de CI obligatoire sur `audit-quebec-backgrounds.py` (lourd réseau/images)
- Découpe `app.js` / `style.css` — seulement si un extrait doc le justifie
- Skills Grok externes hors repo — ce playbook **est** le skill unique du dépôt
- Re-seed bulk Commons — volontairement hors pipeline quotidien

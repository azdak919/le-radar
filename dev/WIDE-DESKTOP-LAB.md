# Layouts viewport — grand écran

**Prod / main :** E s’active tout seul dès **1281 px**. Aucun `?wide=e`.
Les densités 1440 / 1600 / 1920 / 2560 / 3440 / 3840 suivent le viewport.
Téléphone, mid et bureau compact (≤1280) restent les layouts existants.

Lab local seulement : barre Format (Base + Grand). E s’applique tout seul.

## Lancer (lab)

```bash
cd VisualCode/le-radar
python3 -m http.server 8766 --bind 127.0.0.1
# → http://127.0.0.1:8766/          (Auto = E dès 1281)
# → http://127.0.0.1:8766/?wide=off (ancien shell ~1180)
```

Sur **localhost**, la barre flottante en bas propose :

| Rangée | Rôle |
|--------|------|
| **Base** | Plein / 390 / 430 / 768 / 900 / 1280 |
| **Grand** | 1440 / 1600 / 1920 / 2560 / 3440 / 3840 |

## Options

| Id | Idée |
|----|------|
| **Off / A** | Prod actuelle (`--maxw` 1180, magazine 2 pistes) |
| **B** | Shell ~1480, magazine inchangé |
| **C** | Shell ~1560, sources 2 rangées, suite 3 col |
| **D** | Shell ~1680, une 2 col, en bref 2 col, suite 4 col |
| **E** | **Direction retenue** — voir ci-dessous |

### E — layout retenu (raffiné)

| Zone | Wide ≥1400 | Super-wide ≥1680 |
|------|------------|------------------|
| Shell | ~1760 | ~1840 |
| Sources | Rail gauche sticky, pastilles pleine largeur, **Le Radar** en tête | idem, rail un peu plus large |
| En-tête fil | **Le fil étudiant** + traduction + compteur / MAJ au-dessus du magazine | idem |
| À la une | Magazine (inchangé dans l’esprit) | 2 unes dès 1920 ; 3 à 3840 |
| En bref | **1 colonne** jusqu’à 3439 (même rapport une/bref qu’à 1920) | **2 col dès 3440** |
| Suite du fil | **3 colonnes** | **4 colonnes** |
| Footer / crédits | Pleine largeur sous le rail (plus de clipping) | idem |
| Radio | Gelée 1180 | Gelée 1180 |

Autres pages (sports, médias, horaires, archives, journaux, établissements, radios, en/…) : lab chargé, shell via `--maxw`. **Exclus** : solitaire, pomo.

## Fichiers

- `dev/midwidth-preview.js` — barre Format + Wide
- `dev/wide-desktop-preview.css` — layouts A–E + super-wide
- `dev/wide-desktop-preview.js` — dataset / resync filtres
- hooks `app.js` pour colonnes / rangées sources

## Suite

1. Valider E en local (Plein 1920 + éventuellement Format 1600).
2. **Focus-group** formaliser E (+ super-wide) vs status quo.
3. **Gate humain** → branche feat + PR (pas de merge direct).

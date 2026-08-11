# Lab local — grand écran (pré-focus-group)

Branche d’expérimentation : `exp/wide-desktop-lab`.

Compare les options **A–E** pour les viewports **≥ ~1280–1920** **avant** un panel focus-group.
**Pas pour la prod** tant que le gate humain n’a pas levé le verdict.

## Lancer

```bash
cd VisualCode/le-radar
python3 -m http.server 8765
# → http://localhost:8765/?wide=c
```

Sur **localhost**, la barre flottante en bas propose :

| Rangée | Rôle |
|--------|------|
| **Format** | 390 / 430 / 768 / 900 / 1280 / **1600** / **1920** / Plein |
| **Wide** | Off / A / B / C / D / E |

Combinaisons utiles :

- `?wide=c` — option C en fenêtre réelle (ton 1920 full)
- `?lab=1920&wide=d` — iframe 1920 + option D
- `?lab=1280&wide=c` — réf. compacte vs même option

## Options

| Id | Idée |
|----|------|
| **Off / A** | Prod actuelle (`--maxw` 1180, magazine 2 pistes) |
| **B** | Shell ~1480, magazine inchangé |
| **C** | Shell ~1560, sources 2 rangées, suite 3 col, magazine un peu plus large |
| **D** | Shell ~1680, une (lead + vedettes 2 col), en bref 2 col, suite 4 col |
| **E** | Shell ~1760, sources en **rail gauche sticky**, fil à droite, suite 3 col |

**Radio (tuner)** : gelée à **1180 px** pour B–E (volontaire).

## Fichiers

- `dev/wide-desktop-preview.js` — `?wide=`, barre, `window.__radarWidePreview`
- `dev/wide-desktop-preview.css` — layouts A–E
- hooks légers dans `app.js` (rangées / colonnes de filtres sources)

## Suite

1. Comparer en local, noter préférences / irritants.
2. Lancer le **focus-group** avec options calibrées (éventuellement retirer E ou fusionner B/C).
3. **Gate humain** → seulement ensuite branche feat + PR.

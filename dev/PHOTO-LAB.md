# Labo photo

Curation des fonds (mât / pomo / solitaire). Distinct du **Labo** viewport (`dev/LAB.md`). Tableau de bord : http://127.0.0.1:8777/dev/

Banque unique : `data/photo-bank.json` (`PHOTO_BANK` dans `photo-bank-data.js`).

Revue de **toutes** les photos (mât, pomo, solitaire, campus / affiches) : rejeter, saisons, crédits, focale, collection permanente. Le générateur public `/affiches/` lit la même banque (`data/photo-bank.json`, tag campus) et ignore les rejets du labo.

```bash
cd VisualCode/le-radar
npm run lab:photos
# → http://127.0.0.1:8777/dev/photo-lab/
```

Les images vivent dans `dev/photo-lab/cache/` (**gitignoré**, trop lourd pour git).

On ne contourne pas les 429 en saturant Commons : on télécharge **une fois** (Special:FilePath, 1 requête à la fois, pause si 429), puis on sert un **miroir GitHub Release**.

```bash
npm run lab:photos:fetch      # complète le cache local (poli)
npm run lab:photos:publish    # envoie le tar sur GitHub (tag photo-lab-cache)
npm run lab:photos:hydrate    # machine neuve : tar GitHub → disque
```

Release : https://github.com/azdak919/le-radar/releases/tag/photo-lab-cache

Un cache local **vide** s’hydrate tout seul depuis cette release au `npm run lab:photos`.

Bind **127.0.0.1** seulement. Pas de lien prod, pas de service worker.

**Grille** d’abord, clic pour la fiche. **← →** dans la barre du haut. **Grille** (ou `g` / Échap) pour revenir.

## Actions

| Bouton / touche | Effet |
|---|---|
| Enregistrer tout (`s`) | Y + crédit + lieu + saison + tags (mât / pomo / solitaire / campus / favori / nations) |
| Marquer favori (`p`) | Coche **favori** (hors moisson) + enregistre |
| Retirer (`r`) | Sortie de `photo-bank` + sidecar reject |
| Saisons (`1–4`) | `seasonSource: manual` |
| Cadrage Y | Glisser la photo ou le curseur |
| Campus | Hors moisson, et ajoute le tag mât |
| Annuler (`z`) | Dernière écriture |

Campus et favori ne sont **jamais** purgés à la prochaine moisson.

**Oui, ça s’enregistre** — sur le **disque local** (`data/photo-bank.json` + miroirs `*-data.js`). Ça n’est **pas** le-radar.ca. Un « Enregistrer tout » ne déploie pas. Cocher une saison sans `s` / Enregistrer (ou sans passer à la photo suivante) ne l’écrit pas. Pour le site public : `npm run bank:check` puis PR (bump SW si les `*-data.js` du shell ont changé — sinon le navigateur ressert l’ancienne banque). Hard-refresh (Ctrl+Shift+R) sur un aperçu local pour vider l’ancien service worker.

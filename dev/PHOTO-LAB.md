# Labo photo local

Revue de **toutes** les photos (mât, pomo, solitaire) : rejeter, saisons, crédits, focale, collection permanente.

```bash
cd VisualCode/le-radar
npm run lab:photos
# → http://127.0.0.1:8777/dev/photo-lab/
```

Bind **127.0.0.1** seulement. Pas de lien prod, pas de service worker.

Revue **une photo à la fois**. Compteur `12 / 345` en haut. **Suivante →** (ou `→` / Espace) / **← Précédente**.

## Actions

| Bouton / touche | Effet |
|---|---|
| Rejeter (`r`) | Sortie de toutes les banques + sidecar `data/quebec-backgrounds-rejected.json` (hard-ban, ne revient pas au `maintain`) |
| Saisons (`1–4`) | `seasonSource: manual` — les bots n’écrasent pas |
| Crédit / lieu | Format affiché `Nom — lieu` |
| Focale | `focalY` 0 = haut, 1 = bas. Bandes **bureau** (plein) et **mobile** (pointillés) = ce que le mât recadrera. Mini-mâts + aperçus plein écran pomo/solitaire. |
| Permanente (`p`) | Copie favorites (`permanent: true`) + cases mât / pomo / solitaire |
| Annuler (`z`) | Dernière écriture |

Solitaire lit les favorites dont `surfaces` contient `solitaire`.

Après une session de revue destinée à la prod : `npm run bank:check` puis PR (bump SW si les `*-data.js` du shell ont changé).

# Labo photo

Curation des fonds (mât / pomo / solitaire). Distinct du **Labo** viewport (`dev/LAB.md`, port 8766).

Banque unique : `data/photo-bank.json` (`PHOTO_BANK` dans `photo-bank-data.js`).

Revue de **toutes** les photos (mât, pomo, solitaire) : rejeter, saisons, crédits, focale, collection permanente.

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

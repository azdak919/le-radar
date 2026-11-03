# Chantiers ouverts — le-radar

Fichier de passation entre IA (Claude Code, Codex, Cursor, OpenCode…). Détails dans les issues étiquetées `chantier`.

## Index
- [Mastodon @leradar@piaille.fr : activation après approbation](https://github.com/azdak919/le-radar/issues/301)
- [Abonnements lents X, Facebook, Bluesky et LinkedIn](https://github.com/azdak919/le-radar/issues/302)
- [Radio Android 1.2.4 : doublon, notification, Android Auto](https://github.com/azdak919/le-radar/issues/303)
- [Audit d'autonomie complète du Radar](https://github.com/azdak919/le-radar/issues/304)
- [Clé API Buffer : renouvellement annuel et alerte d'expiration](https://github.com/azdak919/le-radar/issues/305)
- [CI : marge de temps des sentinelles navigateur (#300)](https://github.com/azdak919/le-radar/issues/306)
- [Vérifier le nouveau format des publications sociales](https://github.com/azdak919/le-radar/issues/307)
- [Instagram et Threads : en attente du propriétaire](https://github.com/azdak919/le-radar/issues/308)

## Règles de travail (obligatoires pour toute IA)
- Commits signés `Azdak <azdak-qc@proton.me>` avec `git commit -s`.
- Ajouter les fichiers un par un ; jamais `git add -A` ni `git add .`.
- Aucun force-push, aucune réécriture d'historique.
- Ne jamais fusionner si la CI est rouge.
- Ne jamais désactiver un workflow.
- Captures d'aperçu avant de fusionner une refonte visuelle.
- Contenu juridique : sources officielles uniquement, jamais inventé.
- Secrets uniquement dans les secrets GitHub, jamais dans le code.
- Aucun dépôt rendu public sans l'accord du propriétaire.
- Ne pas toucher aux branches ou PR d'un autre agent en cours de travail.
- Le Radar est publié sous le pseudonyme **Azdak** ; le nom légal du propriétaire ne doit jamais apparaître.

## Tenir à jour
Quand un chantier avance ou se termine : cocher la liste de l'issue, fermer l'issue, et mettre à jour cet index dans le même PR.

## PWA iPad : coiffe de zone sûre (2 nov. 2026) — corrigé
- Symptôme : app installée sur iPad, une bande grise sous la barre d'état iPadOS au-dessus de la barre radio épinglée.
- Cause : `.tuner-safe-cap` gardait `--tuner-bg` alors qu'à ≥720px le synthé prend `#101816` ; l'inset haut n'est pas nul sur iPad.
- Correctif : teinte de la coiffe alignée à ≥720px (style-chrome.css), test iPad 1024×768 dans tests/tuner-safe-area.spec.mjs, shell radar v987 / sports v348.
## Photo imposée en double (2 nov. 2026) — corrigé
- `dedupeCardImages` regroupe aussi par `stockImage` ; le billet épinglé garde la photo imposée, l'autre prend une autre photo (ou l'image par défaut). Test : tests/pinned-photo-dedupe.mjs. news.json corrigé (Tribune « gutted motion »).

## Buffer X : passe du soir (2 nov. 2026) — fait
- Cron `7 2 * * *` (≈ 21 h 07 HNE, 22 h 07 HAE) avec EVENING=true : remplit dès la veille les 10 créneaux du lendemain (8 h 30 → 21 h), pool = articles du jour. Mêmes règles (≤ 2 par source, sans doublon, photos d'article, 📸, format). Passes de nuit en secours (freeSlots : aucun doublon). Test : tests/social-buffer.mjs.

## Bluesky et Tumblr : tout publier, étalé (2 nov. 2026) — fait
- `NETWORKS.*.spread` : plus d'exclusion « ≤ 2/source » ; tourniquet entre sources, excédent en attente (hold), seul le quasi-doublon (titleKey) est sauté.
- Cadence `paceSpread` : part w(maintenant)/Σw(passages avant échéance) par article → volume aux pointes (posting-windows.json), rien aux heures calmes ; article qui expirerait avant le prochain passage non calme = en tête.
- Plafonds : Bluesky 12/h, 150/j, 4/passage ; Tumblr 8/h, 120/j, 3/passage (< 250/j officiel).
- Entrées `skipped: cap` fraîches retirées (Bluesky 33, Tumblr 23). Test : tests/social-bluesky-spread.mjs.

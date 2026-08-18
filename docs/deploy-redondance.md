# Redondance de déploiement

Objectif : qu'un incident GitHub ne puisse plus empêcher le code fusionné
d'atteindre un site en ligne. Complément de [`objectifs-fiabilite.md`](objectifs-fiabilite.md).

## 1. Pourquoi

Incident du 6 août 2026 (« Incident with Actions », GitHub, 15 h 22 UTC,
sévérité critique). Ce qui a réellement échoué :

| Couche | État | Conséquence |
|---|---|---|
| Diffusion (CDN Pages) | **tenue** | le site est resté en ligne, HTTP 200 |
| Déploiement (build Pages) | **échec** | deux fusions dans `main` jamais publiées |
| Calcul (workflows bots) | **échec** | fil d'actualités figé |
| Git + API GitHub | tenus | — |

Erreur constatée sur tous les jobs, avant la moindre ligne de code du dépôt :

```
Failed to resolve action download info. Error: Service Unavailable
```

Deux enseignements. D'abord, **GitHub Pages ne tombe pas quand le déploiement
échoue** : il continue de servir le dernier build valide. Le risque réel n'est
pas l'indisponibilité mais la péremption silencieuse. Ensuite, **le déploiement
et le calcul sont deux pannes distinctes** : le premier bloque le code, le
second bloque le contenu.

Ce document ne traite que le **déploiement**. La redondance du calcul (bots)
reste ouverte.

## 2. Ce qui rend la redondance simple ici

Le site n'a **aucune étape de build** : `index.html`, `app.js` et `style.css`
sont servis tels quels depuis la racine du dépôt. N'importe quel hébergeur
statique peut donc servir le dépôt sans pipeline à reproduire.

```
main ──┬──> GitHub Pages     ──> le-radar.ca        (origine, inchangée)
       ├──> Cloudflare Pages ──> *.pages.dev        (miroir)
       └──> Netlify          ──> *.netlify.app      (miroir)
```

Les deux miroirs se branchent sur le dépôt Git et construisent sur **leur
propre infrastructure** : ils ne dépendent pas de GitHub Actions. Le 6 août,
ils auraient publié les deux fusions bloquées.

## 3. Fichiers du dépôt

| Fichier | Rôle |
|---|---|
| `netlify.toml` | config Netlify : publie la racine, aucun build |
| `_headers` | en-têtes communs — format lu par Netlify **et** Cloudflare Pages |

`_headers` commence par `_` : Jekyll l'ignore, donc GitHub Pages ne le publie
même pas. **La mise en place des miroirs ne modifie en rien l'origine
actuelle** — c'est voulu, on n'a pas touché au chemin qui fonctionne.

## 4. Mise en place

Rien de tout cela n'est faisable depuis le dépôt : les deux hébergeurs se
configurent dans leur tableau de bord, une seule fois.

### Cloudflare Pages

Le compte existe déjà (voir [`cloudflare-dns-migration.md`](cloudflare-dns-migration.md) —
Workers sous `azdak.workers.dev`).

1. Workers & Pages → Create → Pages → Connect to Git → dépôt `azdak919/le-radar`
2. Production branch : `main`
3. Framework preset : **None**
4. Build command : **laisser vide**
5. Build output directory : `/`

Laisser la commande de build vide est important : Cloudflare Pages n'exécute
alors aucun `npm install` et se contente de téléverser le dépôt.

### Netlify

1. Add new site → Import an existing project → `azdak919/le-radar`
2. Branch : `main`
3. Le reste est lu depuis `netlify.toml` — ne rien saisir à la main.

**À vérifier au premier déploiement** : que `node_modules/` ne se retrouve pas
dans le site publié. `NPM_FLAGS = "--version"` dans `netlify.toml` doit sauter
l'installation des dépendances. Si le déploiement gonfle malgré tout à
plusieurs milliers de fichiers, c'est ce point qu'il faut corriger.

## 5. Bascule en cas de panne GitHub Pages

Le miroir sert de site de secours. La bascule est **manuelle** et se fait chez
le registrar.

1. Vérifier que le miroir est à jour (§6)
2. WHC → DNS de `le-radar.ca` → remplacer les quatre enregistrements A
   (`185.199.108-111.153`) par un CNAME vers l'URL du miroir
3. Attendre la propagation
4. Revenir aux quatre A une fois GitHub Pages rétabli

### Le point dur : le TTL

```
le-radar.ca  NS  → parking1.whc.ca, parking2.whc.ca
le-radar.ca  A   → 185.199.108-111.153   TTL 14400 (4 h)
```

**Une bascule DNS prendra jusqu'à quatre heures.** Le miroir protège donc le
*déploiement*, pas la *disponibilité* : si le CDN de GitHub Pages tombait pour
de bon, le domaine resterait pointé dessus pendant des heures.

Ramener ce TTL à ~60 s est le seul vrai correctif, et il suppose de déplacer la
zone chez Cloudflare — étape déjà décrite dans
[`cloudflare-dns-migration.md`](cloudflare-dns-migration.md), volontairement
hors périmètre ici.

## 6. Vérification

Comparer le commit servi par chaque origine :

```bash
curl -sI https://le-radar.ca/            | grep -i last-modified
curl -sI https://<miroir>.pages.dev/     | grep -i last-modified
curl -sI https://<miroir>.netlify.app/   | grep -i last-modified
```

Un miroir en retard sur `main` alors que GitHub est en bonne santé signale une
intégration Git décrochée, à reconnecter dans le tableau de bord concerné.

## 7. Limites connues

- **Aucun filet de test.** Les miroirs publient sur poussée dans `main`, sans
  attendre le Vérification. C'est le comportement actuel de GitHub Pages : la
  redondance n'ajoute pas de risque, mais ne corrige pas non plus ce trou.
- **Le contenu reste dépendant de GitHub Actions.** Les bots (fil, radio,
  sports, archives) tournent en Actions et écrivent dans `main`. Pendant une
  panne Actions, les miroirs publieront fidèlement un contenu figé. C'est la
  panne du 6 août qui a le plus pesé, et elle n'est pas traitée ici.
- **Bascule manuelle**, plafonnée par le TTL de 4 h (§5).

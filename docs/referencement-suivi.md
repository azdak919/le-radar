# Suivi des retombées — référencement

> À rouvrir **4 à 6 semaines** après la soumission du sitemap. Avant ça, il n'y
> a rien à lire : l'indexation de 71 URL neuves sur un domaine sans historique
> prend des semaines, et les liens entrants encore davantage.
>
> Point de départ : mise en ligne du chantier le **2026-07-25**.

---

## 1. La seule mesure qui compte vraiment

**Search Console → Performances → onglet Pays.**

L'objectif de ce projet n'est pas d'avoir du trafic, c'est d'avoir **le bon**.
La cible, ce sont les personnes déjà inscrites sur un campus québécois.

| Signal | Lecture |
|---|---|
| Majorité **Canada** | ✅ on touche la bonne clientèle |
| Part notable **France** | ⚠️ le vocabulaire attire des francophones hors cible |
| Part notable **Inde, Nigéria, Maroc…** | 🛑 on attire des **candidats à l'étranger**, pas des étudiants d'ici |

Le troisième cas est le vrai risque : il signifierait que le site s'est mis à
répondre à « étudier au Québec » plutôt qu'à « journal étudiant UQAM ». Si ça
arrive, la correction est éditoriale — retirer le vocabulaire d'immigration —
pas technique. Voir `referencement.md` §4.3.

## 2. Requêtes à surveiller

Elles sortent des registres, pas d'une intuition : chaque page d'entité a été
créée pour répondre à l'une d'elles.

### Radios — la requête la plus probable est « écouter … en direct »

| Requête | Page qui doit sortir |
|---|---|
| écouter CHYZ 94,3 en direct | `/radios/chyz/` |
| écouter CISM 89,3 en direct | `/radios/cism/` |
| écouter CKUT 90,3 en direct | `/radios/ckut/` |
| écouter CJLO 1690AM en direct | `/radios/cjlo/` |
| écouter CFAK 88,3 en direct | `/radios/cfak/` |
| écouter CHOQ.ca en direct | `/radios/choq/` |

### Journaux — nom du média + acronyme de l'établissement

| Requête | Page |
|---|---|
| Quartier Libre UdeM | `/journaux/quartier-libre/` |
| Montréal Campus UQAM | `/journaux/montreal-campus/` |
| Le Délit McGill | `/journaux/le-delit/` |
| The Link Concordia | `/journaux/the-link/` |
| Zone Campus UQTR | `/journaux/zone-campus/` |
| L'Exemplaire Université Laval | `/journaux/lexemplaire/` |

### Génériques et anglophones

- « médias étudiants Québec », « radios étudiantes Québec », « journaux étudiants cégeps »
- « radio étudiante Université Laval », « journal étudiant UQAM »
- **EN** : « Quebec student media », « McGill student newspaper », « Montreal campus radio »

Les requêtes anglaises visent `/en/…` et les personnes étudiantes
internationales déjà au Québec — d'où `hreflang="en-CA"` et non `en-US`.

## 3. Santé technique

Dans Search Console → **Pages** :

| À vérifier | Attendu |
|---|---|
| Pages indexées | monte vers 71 ; un plateau bas très en dessous = problème |
| « Détectée, actuellement non indexée » | normal les premières semaines |
| « Page en double sans URL canonique » | **doit rester à zéro** — sinon la table canonique des établissements a laissé passer un doublon |
| Sitemap | 71 URL lues, 0 erreur |

Le troisième point est le plus révélateur : c'est exactement ce que la table
`INSTITUTIONS` de `scripts/seo-pages-lib.js` sert à empêcher.

## 4. Visibilité auprès des assistants IA

Aucune console ne la mesure. Le test, c'est de poser la question et de lire la
réponse :

> « Quelles sont les radios étudiantes des universités du Québec ? »
> « Quel est le journal étudiant de l'UQAM ? »
> « Where can I read McGill's student newspaper? »

À faire dans ChatGPT, Claude et Perplexity, en notant la date et si
`le-radar.ca` est **cité en source**. Le premier relevé sert de point zéro —
avant indexation, l'absence est normale.

Rappel : `robots.txt` autorise explicitement GPTBot, ClaudeBot et
PerplexityBot, et `llms.txt` leur donne la liste nommée des médias avec l'URL
de chaque page.

## 5. Liens entrants

Le levier le plus fort, et le plus lent. Cibles : les 14 journaux, les 6 radios
et les associations étudiantes. Un lien depuis un domaine universitaire
québécois (`.ca`, `.qc.ca`) est le signal géographique **et** thématique le plus
puissant qui existe pour ce projet.

Tenir un décompte simple ici — média contacté, date, réponse, lien obtenu — pour
savoir ce qui marche avant d'écrire trente courriels.

## 6. Journal des relevés

| Date | Pages indexées | Clics / 28 j | Pays dominant | Cité par une IA ? | Note |
|---|---|---|---|---|---|
| 2026-07-25 | 0 | 0 | — | — | mise en ligne, sitemap non encore soumis |

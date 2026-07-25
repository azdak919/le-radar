# Fiche Wikidata de LE-RADAR.ca — à créer

> **Pourquoi.** Les assistants IA s'appuient massivement sur Wikidata pour
> désambiguïser une entité. Sans fiche, « Le Radar » reste une chaîne de
> caractères parmi d'autres ; avec une fiche reliée aux établissements, le site
> devient une **entité connue**, rattachée aux universités et cégeps du Québec.
> C'est ce qui fait la différence entre « un site » et « la référence sur les
> médias étudiants québécois ».
>
> **Création** : [wikidata.org](https://www.wikidata.org) → compte requis →
> *Créer un nouvel élément*. Compter 15 minutes.

---

## 1. Libellés et description

| Champ | Français | English |
|---|---|---|
| **Libellé** | LE-RADAR.ca | LE-RADAR.ca |
| **Alias** | Le Radar, le-radar.ca | Le Radar, le-radar.ca |
| **Description** | agrégateur des journaux et des radios étudiantes des cégeps et universités du Québec | aggregator of student newspapers and campus radio stations of Québec CEGEPs and universities |

La description ne doit **pas** commencer par « site web qui… » : Wikidata
attend une phrase nominale courte, sans article ni majuscule initiale.

## 2. Déclarations

Tous les identifiants ci-dessous ont été **vérifiés par requête à l'API
Wikidata** le 2026-07-25, pas recopiés de mémoire.

| Propriété | Valeur | Identifiant |
|---|---|---|
| nature de l'élément (P31) | site web | `Q35127` |
| — second (facultatif) | portail web | `Q186165` |
| site officiel (P856) | `https://le-radar.ca/` | — |
| pays (P17) | Canada | `Q16` |
| situé dans l'entité territoriale (P131) | Québec *(province)* | `Q176` |
| langue de l'œuvre (P407) | français | `Q150` |
| langue de l'œuvre (P407) | anglais | `Q1860` |
| date de fondation (P571) | 2026 | — |
| thème principal (P921) | journal étudiant | `Q738377` |

**Piège évité** : une recherche sur « Québec » renvoie d'abord `Q2145`, qui est
la **ville**. C'est `Q176`, la province, qu'il faut.

**Ne pas utiliser** `Q498267` (« agrégateur ») : Wikidata le définit comme un
*logiciel* qui tresse des fils de syndication, pas comme un site. La notion
d'agrégation appartient à la description, pas au type.

## 3. Rattachement aux établissements

Ces liens sont le vrai gain : ils ancrent le site dans le graphe des
universités québécoises. À ajouter en P921 (thème principal), ou depuis la
fiche de chaque média étudiant s'il en possède une.

| Établissement | QID |
|---|---|
| Université de Montréal | `Q392189` |
| Université du Québec à Montréal | `Q1634522` |
| McGill University | `Q201492` |
| Concordia University | `Q326342` |
| Université du Québec à Trois-Rivières | `Q919256` |
| Université Laval | `Q1067935` |
| Université de Sherbrooke | `Q2579532` |
| Cégep du Vieux Montréal | `Q3010022` |
| Cégep de Jonquière | `Q430417` |
| Polytechnique Montréal | `Q273619` |
| Bishop's University | `Q3551383` |
| Dawson College | `Q2983587` |

Un seul de ces QID (`Q3010022`) figure aujourd'hui dans `institutions.json` :
les entrées curées manuellement n'en ont pas, contrairement à celles importées
de Wikidata. Les reporter dans le registre serait un gain net — et relève de la
dette **D10** (faire de `institutions.json` la source de vérité).

## 4. Après création

- Ajouter l'URL de la fiche dans `llms.txt` (section « Citation ») : c'est
  exactement le genre de référence croisée qu'un assistant suit.
- Ne **pas** créer de fiches pour les journaux étudiants eux-mêmes sans qu'ils
  satisfassent les critères de notoriété de Wikidata : une fiche supprimée est
  pire que pas de fiche.

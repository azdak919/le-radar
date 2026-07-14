# Scan Québec — médias étudiants par région

> Rapport généré le **2026-07-14 03:40:50 UTC** par `scripts/scan-qc-report.js`.
> Périmètre : journaux étudiants (cégeps + universités). **Exclus** : portails institutionnels.

## Synthèse

| Indicateur | Valeur |
|------------|--------|
| Établissements catalogue | 79 |
| Sources **actives** (live) | 14 |
| Candidats **staged** | 6 |
| **Prêts à promouvoir** (flux frais, pas encore live) | 0 |
| Graines dormantes / URL morts | 37 |
| Flux institutionnels rejetés | 258 |
| Établissements sans couverture news | 37 |
| Radios natives (réf.) | 6 |

## 1. Prêts à examiner / promouvoir

_Aucun nouveau flux frais détecté hors sources déjà actives._

## 2. Candidats déjà staged (pourquoi pas live)

| Journal | Établissement | Région | Fail | Flux | Note |
|---------|---------------|--------|------|------|------|
| Le Griffonnier | Université du Québec à Chicoutimi | Saguenay–Lac-Saint-Jean | 6 | — | Staged — ceuc.ca annonce un /feed/ mais renvoie 404 ; pas de flux RSS exploitable (2026-07). |
| L'Oisif | Cégep de Chicoutimi | Saguenay–Lac-Saint-Jean | 6 | stale · 2019-08-23 | Staged — flux catégorie WP existe mais articles de 2019 seulement (hors fenêtre 365 j). Journal apparemment inactif. |
| Le Trait d'Union | Collège de Maisonneuve | Montréal | 6 | stale · 2021-04-18 | Staged — flux RSS présent mais dernier item 2021-04 (hors fenêtre 365 j). Site quasi-vide. |
| La Gifle | Collège Lionel-Groulx | Laurentides | 6 | stale · 2018-05-19 | Staged — flux WordPress présent mais articles de 2018 seulement (hors fenêtre 365 j). |
| Le Brise-Glace | Cégep de Rimouski | Bas-Saint-Laurent | 6 | — | Staged — site lebrise-glace.com injoignable (timeout/DNS) au dernier sondage. |
| The Concordian | Concordia University | Montréal | 2 | — | Retiré du fil actif (2026-07) — Cloudflare / Substack peu fiable. The Link reste pour Concordia. |

## 3. Sources actives (référence)

| Journal | Établissement | Région | Status |
|---------|---------------|--------|--------|
| Quartier Libre | Université de Montréal | Montréal | stale |
| Montréal Campus | UQAM | Montréal | ok |
| Le Délit | Université McGill | Montréal | ok |
| The McGill Daily | McGill University | Montréal | ok |
| The Link | Concordia University | Montréal | ok |
| Zone Campus | Université du Québec à Trois-Rivières | Mauricie | stale |
| L'Exemplaire | Université Laval | Capitale-Nationale | ok |
| Le Collectif | Université de Sherbrooke | Estrie | stale |
| Exil | Cégep du Vieux Montréal | Montréal | ok |
| La Pige | Cégep de Jonquière (ATM – journalisme) | Saguenay–Lac-Saint-Jean | stale |
| Le Polyscope | Polytechnique Montréal | Montréal | ok |
| The Tribune | McGill University | Montréal | ok |
| The Campus | Bishop's University | Estrie | ok |
| The Plant | Dawson College | Montréal | ok |

## 4. Rapport par région

### Montréal

Établissements : **19** · Sources live : **9** · Gaps : **5** · Promote-ready : **0**

**Live**
- ✅ **Quartier Libre** — Université de Montréal (`stale`)
- ✅ **Montréal Campus** — UQAM (`ok`)
- ✅ **Le Délit** — Université McGill (`ok`)
- ✅ **The McGill Daily** — McGill University (`ok`)
- ✅ **The Link** — Concordia University (`ok`)
- ✅ **Exil** — Cégep du Vieux Montréal (`ok`)
- ✅ **Le Polyscope** — Polytechnique Montréal (`ok`)
- ✅ **The Tribune** — McGill University (`ok`)
- ✅ **The Plant** — Dawson College (`ok`)

**Candidats staged**
- ⏳ Le Trait d'Union — Collège de Maisonneuve — _Staged — flux RSS présent mais dernier item 2021-04 (hors fenêtre 365 j). Site quasi-vide._
- ⏳ The Concordian — Concordia University — _Retiré du fil actif (2026-07) — Cloudflare / Substack peu fiable. The Link reste pour Concordia._

**Graines testées, pas de flux frais**
- 💤 L'Heuristique — site unreachable / wrong URL · https://lheuris.ca/
- 💤 L'Unité — site up, no RSS/Atom found · https://lunite.org/
- 💤 L'Attribut — site unreachable / wrong URL · https://lattribut.com/
- 💤 L'IntégrAL — site unreachable / wrong URL · https://lintegral.ca/
- 💤 L'Infomane — site unreachable / wrong URL · https://linfomane.com/
- 💤 Pastiche — site unreachable / wrong URL · https://pastichesl.com/
- 💤 Le Graffitti — site unreachable / wrong URL · https://legraffitti.com/
- 💤 Le Point G — site unreachable / wrong URL · https://lepointg.ca/
- 💤 The Papercut — site up, no RSS/Atom found · https://thepapercut.com/
- 💤 The Free Press — site unreachable / wrong URL · https://jacfreepress.com/
- 💤 The Bull & Bear — site up, no RSS/Atom found · https://bullandbearmcgill.com/
- 💤 L’Organe — site unreachable / wrong URL · https://lorgane.ca/
- 💤 L'Artichaut — site unreachable / wrong URL · https://lartichaut.ca/
- 💤 Mosaïk — site up, no RSS/Atom found · https://stanislas96.wixsite.com/mosaik
- 💤 L'Inter — site up, no RSS/Atom found · https://linter.ca/

**Établissements sans journal au registre**
- ○ HEC Montréal (universite) — https://www.hec.ca/
- ○ Cégep Gérald-Godin (cegep) — https://www.cgodin.qc.ca/
- ○ Cégep Marie-Victorin (cegep) — https://www.collegemv.qc.ca/
- ○ Collège de Rosemont (cegep) — https://www.crosemont.qc.ca/
- ○ Vanier College (cegep) — https://www.vaniercollege.qc.ca/

### Estrie

Établissements : **4** · Sources live : **2** · Gaps : **1** · Promote-ready : **0**

**Live**
- ✅ **Le Collectif** — Université de Sherbrooke (`stale`)
- ✅ **The Campus** — Bishop's University (`ok`)

**Graines testées, pas de flux frais**
- 💤 Le Matricule Zéro — site unreachable / wrong URL · https://matriculezero.ca/
- 💤 L'Obiter — site unreachable / wrong URL · https://lobiter.com/

**Établissements sans journal au registre**
- ○ Champlain Regional College (cegep) (site KO) — https://www.champlaincollege.qc.ca/

### Mauricie

Établissements : **3** · Sources live : **1** · Gaps : **1** · Promote-ready : **0**

**Live**
- ✅ **Zone Campus** — Université du Québec à Trois-Rivières (`stale`)

**Graines testées, pas de flux frais**
- 💤 Le Réservoir — site unreachable / wrong URL · https://lereservoir.ca/
- 💤 La Forge — site unreachable / wrong URL · https://laforge.cegeptr.qc.ca/

**Établissements sans journal au registre**
- ○ Cégep de Shawinigan (cegep) — https://www.cegepshawinigan.ca/

### Saguenay–Lac-Saint-Jean

Établissements : **5** · Sources live : **1** · Gaps : **2** · Promote-ready : **0**

**Live**
- ✅ **La Pige** — Cégep de Jonquière (ATM – journalisme) (`stale`)

**Candidats staged**
- ⏳ Le Griffonnier — Université du Québec à Chicoutimi — _Staged — ceuc.ca annonce un /feed/ mais renvoie 404 ; pas de flux RSS exploitable (2026-07)._
- ⏳ L'Oisif — Cégep de Chicoutimi — _Staged — flux catégorie WP existe mais articles de 2019 seulement (hors fenêtre 365 j). Journal appa_

**Établissements sans journal au registre**
- ○ Cégep d'Alma (cegep) — https://www.cegepalma.ca/
- ○ Cégep de Saint-Félicien (cegep) — https://cegepstfe.ca/

### Capitale-Nationale

Établissements : **8** · Sources live : **1** · Gaps : **3** · Promote-ready : **0**

**Live**
- ✅ **L'Exemplaire** — Université Laval (`ok`)

**Graines testées, pas de flux frais**
- 💤 Impact Campus — site up, no RSS/Atom found · https://impactcampus.ca/
- 💤 Le Phoque — site unreachable / wrong URL · https://lephoque.ca/
- 💤 L'Éclosion — site unreachable / wrong URL · https://leclosion.ca/
- 💤 Entre-Guillemets — site up, no RSS/Atom found · https://entreguillemets.com/

**Établissements sans journal au registre**
- ○ École nationale d'administration publique (ENAP) (universite) — https://enap.ca/
- ○ Institut national de la recherche scientifique (INRS) (universite) — https://inrs.ca/
- ○ Université TÉLUQ (universite) — https://www.teluq.ca/

### Abitibi-Témiscamingue

Établissements : **2** · Sources live : **0** · Gaps : **0** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 Perspectives — site unreachable / wrong URL · https://perspectivesuqat.ca/
- 💤 Le Carcajou — site unreachable / wrong URL · https://lecarcajou.ca/

### Gaspésie–Îles-de-la-Madeleine

Établissements : **1** · Sources live : **0** · Gaps : **0** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 Le Phare — site unreachable / wrong URL · https://lepharegim.com/

### Laval

Établissements : **1** · Sources live : **0** · Gaps : **0** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 Le Typographe — site unreachable / wrong URL · https://letypographe.ca/
- 💤 Le Lunatique — site unreachable / wrong URL · https://lelunatique.ca/

### Côte-Nord

Établissements : **2** · Sources live : **0** · Gaps : **1** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 Le Visionnaire — site unreachable / wrong URL · https://levisionnaire.ca/

**Établissements sans journal au registre**
- ○ Cégep de Sept-Îles (cegep) (site KO) — https://www.cegepsept-iles.ca/

### Lanaudière

Établissements : **1** · Sources live : **0** · Gaps : **1** · Promote-ready : **0**

**Établissements sans journal au registre**
- ○ Cégep régional de Lanaudière (cegep) — https://www.cegep-lanaudiere.qc.ca/

### Laurentides

Établissements : **2** · Sources live : **0** · Gaps : **1** · Promote-ready : **0**

**Candidats staged**
- ⏳ La Gifle — Collège Lionel-Groulx — _Staged — flux WordPress présent mais articles de 2018 seulement (hors fenêtre 365 j)._

**Établissements sans journal au registre**
- ○ Cégep de Saint-Jérôme (cegep) — https://www.cstj.qc.ca/

### Outaouais

Établissements : **3** · Sources live : **0** · Gaps : **1** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 L'Agora — site unreachable / wrong URL · https://lagora.ca/

**Établissements sans journal au registre**
- ○ Collège Heritage (cegep) — https://www.cegep-heritage.qc.ca/

### Bas-Saint-Laurent

Établissements : **5** · Sources live : **0** · Gaps : **2** · Promote-ready : **0**

**Candidats staged**
- ⏳ Le Brise-Glace — Cégep de Rimouski — _Staged — site lebrise-glace.com injoignable (timeout/DNS) au dernier sondage._

**Graines testées, pas de flux frais**
- 💤 Météorites — site unreachable / wrong URL · https://meteorites.ca/
- 💤 Le Soufflet — site unreachable / wrong URL · https://lesoufflet.ca/

**Établissements sans journal au registre**
- ○ Cégep de Matane (cegep) — https://www.cegep-matane.qc.ca/
- ○ Cégep de Rivière-du-Loup (cegep) — https://www.cegeprdl.ca/

### Centre-du-Québec

Établissements : **2** · Sources live : **0** · Gaps : **2** · Promote-ready : **0**

**Établissements sans journal au registre**
- ○ Cégep de Drummondville (cegep) — https://www.cegepdrummond.ca/
- ○ Cégep de Victoriaville (cegep) — https://www.cegepvicto.ca/

### Chaudière-Appalaches

Établissements : **3** · Sources live : **0** · Gaps : **3** · Promote-ready : **0**

**Établissements sans journal au registre**
- ○ Cégep Beauce-Appalaches (cegep) — https://www.cegepba.qc.ca/
- ○ Cégep de Lévis (cegep) — https://www.cegeplevis.ca/
- ○ Cégep de Thetford (cegep) — https://www.cegepthetford.ca/

### Montérégie

Établissements : **6** · Sources live : **0** · Gaps : **4** · Promote-ready : **0**

**Graines testées, pas de flux frais**
- 💤 Le MotDit — site unreachable / wrong URL · https://lemotdit.com/
- 💤 Le Dogme — site unreachable / wrong URL · https://ledogme.ca/
- 💤 The Chronos — site up, no RSS/Atom found · https://thechronos.com/

**Établissements sans journal au registre**
- ○ Cégep de Granby (cegep) — https://cegepgranby.qc.ca/
- ○ Cégep de Sorel-Tracy (cegep) — https://www.cegepst.qc.ca/
- ○ Cégep de Valleyfield (cegep) (site KO) — https://www.colval.qc.ca/
- ○ Cégep Saint-Jean-sur-Richelieu (cegep) — https://www.cstjean.qc.ca/

### (sans région)

Établissements : **12** · Sources live : **0** · Gaps : **10** · Promote-ready : **0**

**Établissements sans journal au registre**
- ○ Cégep à distance (cegep) — https://cegepadistance.ca
- ○ cégep Champlain campus Saint-Lambert (cegep) — http://champlainonline.com
- ○ cégep Champlain campus Saint-Lawrence (cegep) — http://www.slc.qc.ca/
- ○ cégep régional de Lanaudière à Joliette (cegep) — https://cegep-lanaudiere.qc.ca/joliette/
- ○ cégep régional de Lanaudière à L'Assomption (cegep) (site KO)
- ○ Cégep régional de Lanaudière à Terrebonne (cegep) (site KO) — http://www.cegep-lanaudiere.qc.ca/college-terrebonne
- ○ collège Champlain campus de Lennoxville (cegep) — http://www.crc-lennox.qc.ca
- ○ collège régional Champlain de Saint-Lambert (cegep) — http://admin.crc-sher.qc.ca/
- ○ Institut maritime du Québec (cegep) (site KO)
- ○ Institution Kiuna (cegep) — https://kiuna-college.com

## 5. Méthode & limites

- Scan des pages d’accueil `institutions.json` + liste de graines (journaux connus / plausibles).
- Un flux sur le **même hôte** que le site institutionnel est **rejeté** (leçon INRS / UQAR).
- « Frais » = dernier item ≤ **18 mois** (fenêtre découverte ; la promo auto reste à 365 j).
- Beaucoup de journaux collégiaux sont **inactifs**, en PDF, Instagram-only, ou sans RSS.
- Les URL graines sont **hypothèses** : un site down ne prouve pas l’absence de journal.
- Ce script est **lecture seule** : il n’écrit pas `news-sources.json` (sauf ce rapport).

## 6. Prochaines actions recommandées

1. Aucun promote-ready automatique — prioriser des recherches manuelles sur les gaps régionaux (Outaouais, Abitibi, Côte-Nord, Gaspésie).
3. Laisser les candidats staged dormants jusqu’à reprise éditoriale (souvent septembre).
4. Relancer : `node scripts/scan-qc-report.js`.

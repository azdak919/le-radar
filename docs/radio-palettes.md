# Radio affiliation palettes and clearer live UI

Verified 7 November 2026. These accents identify the **associated campus**, not the independent radio’s own brand. Existing station names/logos remain unmodified; no university logo is added and no endorsement or ownership is implied. In particular CISM and CKUT are independent campus/community organisations.

## Primary sources and mapping

Primary hex values are read from the existing `brand-colors.json`, never from a station’s array position. `scripts/radio-palette-lib.js` is shared by the hub, daily comparison and station weeks; it adds only documented companions/variants. The global institution/news palette is untouched.

| Radio / affiliation proof | Institution | Existing official primary | Companion / distinguishing variant | Primary colour source |
| --- | --- | --- | --- | --- |
| [CFAK](https://www.cfak.ca/) | Université de Sherbrooke | `#00A759` Fierté | `#018849` **Fierté Accessible**, a published accessibility variant | [UdeS colour](https://www.usherbrooke.ca/communications/telechargement/logo/couleur-et-police-de-caracteres), [official contrast chart](https://www.usherbrooke.ca/communications/fileadmin/sites/communications/uploads/CharteCouleurs_Contrastes_UdeS.pdf) |
| [CHOQ](https://www.choq.ca/a-propos) | UQAM | `#0079BE` | Primary blue, no fabricated second hue | [Réseau UQ official chart, UQAM Pantone 2935](https://reseau.uquebec.ca/fr/system/files/documents/divers/couleurs-etablissements.pdf), [UQAM guide entry](https://services.uqam.ca/services-offerts/guide-normes-logo-uqam/) |
| [CHYZ](https://chyz.ca/historique/) | Université Laval | `#E30513` | Official gold `#FFC103`; red/gold 80/20 header band distinguishes Laval from McGill | [ULaval visual identity, palette and web banner](https://www.ulaval.ca/notre-universite/identite-visuelle) |
| [CISM](https://cism893.ca/campus-udem) | Université de Montréal | `#0057AC` | Official dark blue `#0B113A`, distinguishing it from UQAM cyan-blue | [UdeM brand guide, digital signature and palette](https://marque.umontreal.ca/) |
| [CJLO](https://www.concordia.ca/alumni-friends/giving-to-concordia/areas-to-support/CJLO.html) | Concordia | `#912338` Burgundy | Published web-palette gold `#CBB576` | [Concordia web colour palette](https://www.concordia.ca/web/design/web-colour-palette.html) |
| [CKUT](https://ckut.ca/about/) | McGill-associated campus/community radio | `#ED1B2F` McGill Red | `#9E0918`, a **suggested secondary dark red**, not a second official primary | [McGill Visual Identity Guide, primary and suggested secondary palettes](https://www.mcgill.ca/visual-identity/visual-identity-guide) |

## UI adaptations (not additional official brand colours)

- Header bands retain the exact official primaries/companions. Text is not placed on the low-contrast gold stripe. The university colours are accents, not altered logo artwork.
- Accessible foreground/border accent = 85% variant + 15% black on light, 30% variant + 70% white on dark. Pale block/card/week backgrounds = a small mix into the site background. These are explicitly **Le Radar interface adaptations**, not claimed as official hex swatches.
- Names and campus labels remain visible. Live/current slots use a neutral high-contrast text badge and outline; next programmes use a labelled arrow and dashed edge. The red global live tint no longer replaces each institution’s identity. Keyboard focus is neutral and high-contrast, independent of branding.
- The hub is explicitly headed “En ce moment à la radio” / “On the radio right now”, immediately qualified “À l’antenne et prochaines émissions”. Every card says either “À l’antenne” or “Prochaine émission”, preserving the weekday for a different-day next slot. No empty timetable is called offline. Existing timed hydration still updates without refreshing.
- Week badges are actual DOM text (with existing accessible row labels), updated along with live/next classes. The daily current badge supplements, rather than replaces, the Toronto time marker.

## Player spacing correction

The supplied screenshot’s large middle gap came from `repeat(2, minmax(0, 1fr))` combined with `flex: 1 1 0; width: 100%` in the wide player: two short labels each occupied half the remaining space. Content-sized bounded grid tracks and `flex: 0 1 auto` now hug short titles while retaining zero minimums and full wrapping for long titles. A missing live/next column does not reserve a half-width gap. Controls and the bar itself are not hidden or artificially fixed-height. This targeted shared CSS change is expressly part of the follow-up spacing request.

## Verification

`tests/radio-palettes.mjs` validates all six actual affiliations and reuse of existing primary tokens. Browser regressions calculate WCAG relative luminance from actual computed sRGB colours, requiring 4.5:1 for text/badges and 3:1 for the visible neutral focus outline (including an already-current programme); light/dark, 320/390/1024/1440, all six weekly pages, honest bilingual status labels, clock transition, and short/long/absent player states. Existing radio geometry/minute/midnight/player regressions remain in the full gate. Captures use real grids separately from synthetic stress cases. No collectors, schedule/news data, social workflow, logos, memory or routines are modified. Existing service-worker fetch behavior remains network-first for JS/CSS. The required shell freshness gate bumps only the root and sports cache versions plus their hash lock because both shells include the changed shared assets; no sports data or workflow changes. Narrow layouts retain their existing compact ticker instead of instantiating desktop-only columns.

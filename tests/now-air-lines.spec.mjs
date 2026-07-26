import { expect, test } from '@playwright/test';

/**
 * Ligne « à l'antenne » du syntoniseur — liste de phases.
 *
 * Régressions couvertes :
 *  - 2026-07-26, hésitation : deux horloges concurrentes faisaient changer la
 *    ligne pendant qu'on la lisait, et la phase « piste » portait le titre de
 *    l'émission en sous-titre alors que ce titre était déjà l'autre phase.
 *  - 2026-07-26, « À venir » invisible : la prochaine émission n'était
 *    atteignable que si aucune émission n'était en ondes — donc presque
 *    jamais. La rotation était binaire par construction (slogan ↔ antenne),
 *    ce qui expliquait aussi le retour du slogan une fois sur deux.
 *
 * Ces fonctions sont pures : on les évalue via `window.RadarAir._pure` avec
 * des postes fabriqués, plutôt que d'attendre qu'une station diffuse le bon
 * cas de figure — sinon le test dépend de la programmation du jour.
 */

async function pure(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure);
  return page;
}

/**
 * Segments d'une ligne rendue (le séparateur d'affichage est « · »), sans le
 * libellé de tête : « À l'antenne » et « À venir » sont justement là pour
 * différencier les phases, les comparer entre elles n'aurait aucun sens.
 */
const PHASE_LABEL_RE = /^(à l['’]antenne|à venir)$/i;

function segments(line) {
  return String(line)
    .split('·')
    .map((s) => s.replace(/^♪\s*/, '').trim())
    .filter((s) => s && !PHASE_LABEL_RE.test(s))
    .map((s) => s.toLowerCase());
}

test('« À venir » reste visible pendant qu’une émission est en ondes', async ({ page }) => {
  await pure(page);

  // Cas réels du site : chaque station a une émission en cours ET une suivante.
  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({
      id: r.id,
      mobile: P.dialPhaseLinesForRadio(r),
      desktop: P.airRotationPhases(r, { withSlogan: false }).map((p) => p.kind),
      // Une piste est aussi de type « live » : seule une émission mérite le
      // libellé « À l'antenne ».
      hasLiveShow: P.airRotationPhases(r, { withSlogan: false })
        .some((p) => p.kind === 'live' && !p.title.startsWith('♪')),
    }));
  });

  expect(perStation.length).toBeGreaterThan(0);

  for (const st of perStation) {
    if (!st.hasLiveShow) continue; // hors créneau : « à venir » est déjà en tête
    expect(
      st.desktop,
      `${st.id} : « À venir » absent alors qu’une émission est en ondes — ${JSON.stringify(st.mobile)}`,
    ).toContain('upcoming');
    expect(
      st.mobile.some((l) => l.startsWith('À venir')),
      `${st.id} : la ligne mobile n’annonce jamais la suite — ${JSON.stringify(st.mobile)}`,
    ).toBe(true);
    // Sous 1100 px le panneau latéral est masqué : sans libellé, « en ondes »
    // et « ensuite » se confondent.
    expect(
      st.mobile.some((l) => l.startsWith('À l’antenne') || l.startsWith("À l'antenne")),
      `${st.id} : l’émission en cours n’est pas étiquetée — ${JSON.stringify(st.mobile)}`,
    ).toBe(true);
  }
});

test('l’émission à venir annonce toujours son heure', async ({ page }) => {
  await pure(page);

  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({
      id: r.id,
      upcoming: P.airRotationPhases(r, { withSlogan: false })
        .filter((p) => p.kind === 'upcoming')
        .map((p) => ({ title: p.title, sub: p.sub })),
    }));
  });

  for (const st of perStation) {
    for (const up of st.upcoming) {
      // Régression : CISM n'expose qu'un horodatage Unix (`datetime`), que la
      // sonde navigateur ignorait — « À venir · Le char de marge », sans heure.
      expect(
        up.sub,
        `${st.id} : « ${up.title} » annoncé sans heure (voir airClockFromStamp)`,
      ).toMatch(/\d{1,2}:\d{2}/);
    }
  }
});

test('le slogan ferme le cycle sur mobile et n’apparaît jamais sur bureau', async ({ page }) => {
  await pure(page);

  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({
      id: r.id,
      slogan: r.slogan || '',
      mobile: P.dialPhaseLinesForRadio(r),
      desktop: P.airRotationPhases(r, { withSlogan: false }).map((p) => p.title),
    }));
  });

  for (const st of perStation) {
    if (!st.slogan) continue;
    const inMobile = st.mobile.filter((l) => l === st.slogan);
    // Exactement une fois, et en dernier : c'est ce qui le fait passer d'une
    // fois sur deux à une fois par cycle complet.
    expect(inMobile.length, `${st.id} : slogan répété — ${JSON.stringify(st.mobile)}`).toBe(1);
    expect(st.mobile[st.mobile.length - 1], `${st.id} : le slogan doit fermer le cycle`)
      .toBe(st.slogan);
    // Sur bureau il occupe déjà la ligne 2 du syntoniseur.
    expect(st.desktop, `${st.id} : slogan en double sur bureau`).not.toContain(st.slogan);
  }
});

test('deux phases consécutives ne redisent jamais la même chose', async ({ page }) => {
  await pure(page);

  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({ id: r.id, mobile: P.dialPhaseLinesForRadio(r) }));
  });

  for (const st of perStation) {
    for (let i = 0; i < st.mobile.length; i += 1) {
      const cur = segments(st.mobile[i]);
      const next = segments(st.mobile[(i + 1) % st.mobile.length]);
      if (st.mobile.length > 1) {
        expect(
          next,
          `${st.id} : « ${st.mobile[i]} » ↔ « ${st.mobile[(i + 1) % st.mobile.length]} » se répètent`,
        ).not.toContain(cur[0]);
      }
      // Et aucune phase ne se répète elle-même (« ♪ Rotten · Rotten »).
      expect(new Set(cur).size, `${st.id} : phase redondante (${st.mobile[i]})`).toBe(cur.length);
    }
  }
});

test('une ligne d’antenne qui ne dit que le slogan ne déclenche pas d’alternance', async ({ page }) => {
  await pure(page);

  const verdicts = await page.evaluate(() => {
    const { isRedundantAirLine } = window.RadarAir._pure;
    const slogan = 'La radio de l’UQAM';
    return {
      identique: isRedundantAirLine(slogan, slogan),
      vide: isRedundantAirLine('', slogan),
      avecEmission: isRedundantAirLine(`Mutations · ${slogan}`, slogan),
      avecHoraire: isRedundantAirLine('Mutations · 17:00 – 18:00', slogan),
      sansMeta: isRedundantAirLine('Mutations', ''),
    };
  });

  expect(verdicts.identique, 'ligne identique au slogan → pas d’alternance').toBe(true);
  expect(verdicts.vide, 'ligne vide → pas d’alternance').toBe(true);
  expect(verdicts.avecEmission, 'émission + slogan → alternance utile').toBe(false);
  expect(verdicts.avecHoraire, 'émission + horaire → alternance utile').toBe(false);
  expect(verdicts.sansMeta, 'pas de slogan → alternance utile').toBe(false);
});

test('la ligne d’aperçu suit l’ordre poste → libellé → émission → heure → établissement', async ({ page }) => {
  await pure(page);

  const lines = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({
      id: r.id,
      name: r.name,
      inst: r.institution,
      line: P.previewDialLine(r),
      banded: P.stationBandedName(r),
    }));
  });

  const ACRONYMS = /^(ULaval|UdeM|UdeS|UQAM|McGill|Concordia)$/;

  for (const st of lines) {
    const parts = st.line.split('·').map((s) => s.trim());

    // 1. Le poste ouvre la ligne, avec sa bande de diffusion.
    expect(
      st.line.startsWith(st.banded),
      `${st.id} : la ligne doit commencer par « ${st.banded} » — ${st.line}`,
    ).toBe(true);
    expect(parts[0], `${st.id} : le nom du poste ouvre la ligne`).toContain(st.name);
    expect(st.banded, `${st.id} : bande de diffusion (FM, AM ou Web) requise`)
      .toMatch(/(?:\b|\d)(?:FM|AM)\b|·\s*Web$/);
    // « CHOQ.ca · Web » occupe deux segments ; « CJLO 1690AM » un seul.
    const bandOffset = st.banded.includes('·') ? 1 : 0;

    // 2. Le libellé vient juste après le poste.
    expect(
      parts[1 + bandOffset],
      `${st.id} : libellé attendu en 2ᵉ position — ${st.line}`,
    ).toMatch(/^(À l['’]antenne|À venir)$/);

    // 3. L'établissement ferme la ligne, en acronyme (jamais la forme longue).
    const last = parts[parts.length - 1];
    expect(last, `${st.id} : acronyme d’établissement attendu en fin de ligne — ${st.line}`)
      .toMatch(ACRONYMS);
    expect(st.line, `${st.id} : forme longue d’établissement interdite sur mobile`)
      .not.toContain(st.inst);

    // Régression : « CJLO 1690AM · 1690 AM » — la bande était doublée parce
    // que `\bAM\b` ne mord pas dans « 1690AM ».
    expect(st.banded, `${st.id} : bande dupliquée — ${st.banded}`)
      .not.toMatch(/(FM|AM).*·.*(FM|AM)/i);
  }
});

test('l’émission en ondes reste affichée plus longtemps que les autres phases', async ({ page }) => {
  await pure(page);

  const dwell = await page.evaluate(() => {
    const { airPhaseDwellMs } = window.RadarAir._pure;
    const base = 8000;
    return {
      live: airPhaseDwellMs({ kind: 'live', title: 'Bhum Bhum Time' }, base),
      track: airPhaseDwellMs({ kind: 'live', title: '♪ Artiste — Titre' }, base),
      upcoming: airPhaseDwellMs({ kind: 'upcoming', title: 'Desi Beats' }, base),
      slogan: airPhaseDwellMs({ kind: 'idle', title: 'La radio de l’UQAM' }, base),
      base,
    };
  });

  expect(dwell.live, 'l’émission en ondes doit durer plus que la base').toBeGreaterThan(dwell.base);
  expect(dwell.live, 'plus longtemps que le « à venir »').toBeGreaterThan(dwell.upcoming);
  // Une piste est de type « live » mais n'est pas une émission.
  expect(dwell.track, 'une piste garde la durée de base').toBe(dwell.base);
  expect(dwell.upcoming, 'le « à venir » garde la durée de base').toBe(dwell.base);
  expect(dwell.slogan, 'le slogan garde la durée de base').toBe(dwell.base);
});

test('les métadonnées techniques ne sont jamais affichées comme une piste', async ({ page }) => {
  await pure(page);

  const results = await page.evaluate(() => {
    const { trackForAirDisplay } = window.RadarAir._pure;
    const ckut = { id: 'ckut', name: 'CKUT 90,3', slogan: 'McGill’s campus-community radio' };
    const rejected = ['Offline', 'off air', 'Dead Air', 'Airtime!', 'Station ID', 'CKUT 90,3']
      .map((t) => [t, trackForAirDisplay(ckut, t)]);
    return {
      rejected,
      // Une vraie piste passe, et l'entité HTML est décodée au passage.
      accepted: trackForAirDisplay(ckut, 'The Magic Roundabout'),
      decoded: trackForAirDisplay(ckut, 'Utopia&#039;s Paradise'),
    };
  });

  for (const [input, out] of results.rejected) {
    expect(out, `« ${input} » ne doit pas s’afficher comme une piste`).toBe('');
  }
  expect(results.accepted).toBe('The Magic Roundabout');
  expect(results.decoded, 'entité HTML non décodée à l’affichage').not.toContain('&#');
});

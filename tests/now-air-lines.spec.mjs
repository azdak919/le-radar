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
  // Les phases antenne lisent radio-nowplaying / grilles déjà hydratées.
  // Sans ça, un worker chargé retombe sur le slogan (ex. CHYZ « Université Laval »).
  await page.waitForFunction(() => document.getElementById('tuner')?.classList.contains('is-dial-ready'));
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

test('« À venir » : grille la plus tôt + pas de current recyclé (toutes stations)', async ({ page }) => {
  await pure(page);

  const report = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    if (!Array.isArray(radios) || !radios.length) {
      return { ok: false, reason: 'radios.json vide', stations: [] };
    }

    const stations = radios.map((r) => {
      const live = P.botCurrentShow(r) || P.scheduleCurrentSlot(r);
      // Référence : la première suite que l'émission en ondes ne recouvre pas.
      // Un soir de match, CHYZ diffuse hors programmation et la grille
      // colligée annonce encore des créneaux déjà évincés — les comparer au
      // « à venir » réel n'aurait aucun sens.
      const airLeft = P.authoritativeAirLeftMin(r) || 0;
      const rawBotNext = P.botNextShow(r);
      const botNext = rawBotNext && P.showUpcomingDeltaMin(r, rawBotNext) < airLeft
        ? null
        : rawBotNext;
      const schedNext = P.scheduleNextSlot(r, airLeft);
      const resolved = P.resolveUpcomingShow(r);
      const phases = P.airRotationPhases(r, { withSlogan: false });
      const upcomingPhases = phases.filter((p) => p.kind === 'upcoming');
      const upcomingTitles = upcomingPhases.map((p) => p.title);

      // resolveUpcoming ne doit pas être plus lointain que la grille.
      let alignedWithSchedule = true;
      if (schedNext?.title && resolved?.title) {
        const dRes = P.showUpcomingDeltaMin(r, resolved);
        const dSched = P.showUpcomingDeltaMin(r, {
          title: schedNext.title,
          start: schedNext.start,
          end: schedNext.end,
          day: schedNext.day,
        });
        // Tolérance 1 min (arrondis HH:MM).
        alignedWithSchedule = dRes <= dSched + 1;
      }

      // Si une émission live est affichée, « à venir » ≠ ce live.
      const upcomingIsLiveTitle = Boolean(
        live?.title
        && upcomingTitles.some((t) => t && P.showUpcomingDeltaMin
          && String(t).toLowerCase() === String(live.title).toLowerCase()),
      );

      // CISM : régression Mix anglo 22:00–00:00 recyclé après minuit — quand
      // l'émission est DÉJÀ passée. Le samedi de 20 h à 22 h, en revanche,
      // Mix anglo est bel et bien la suite au programme : l'annoncer est le
      // comportement attendu, pas la régression. On ne se plaint donc que si
      // la grille désigne une autre émission comme prochaine.
      const mixAngloWhileOtherLive = Boolean(
        r.id === 'cism'
        && live?.title
        && !/mix anglo/i.test(String(live.title))
        && upcomingTitles.some((t) => /mix anglo/i.test(String(t || '')))
        && !/mix anglo/i.test(String(schedNext?.title || '')),
      );

      // Phases : si live show, upcoming présent (sauf grille vide + bot vide,
      // ou suite identique à l'émission en ondes — voir nextRepeatsLive).
      const hasLiveShow = phases.some((p) => p.kind === 'live' && !p.title.startsWith('♪'));
      const hasUpcomingPhase = upcomingPhases.length > 0;
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const nextTitles = [schedNext?.title, botNext?.title, resolved?.title]
        .filter(Boolean)
        .map(norm);
      // CFAK le samedi : la grille n'a qu'une émission (« Les nuits CFAK »),
      // donc la suivante est la même, 20 h plus tard. L'annoncer en « à venir »
      // sous l'émission en ondes serait absurde — et interdit deux lignes plus
      // bas par upcomingIsLiveTitle. Les deux invariants ne peuvent pas tenir
      // ensemble : celui-ci cède.
      const nextRepeatsLive = Boolean(live?.title)
        && nextTitles.length > 0
        && nextTitles.every((t) => t === norm(live.title));
      const missingUpcomingWhileLive = hasLiveShow
        && nextTitles.length > 0
        && !nextRepeatsLive
        && !hasUpcomingPhase;

      // À venir avec heure quand start/end connus.
      const upcomingWithoutTime = upcomingPhases.filter((p) => {
        if (!p.sub) return true;
        return !/\d{1,2}:\d{2}/.test(p.sub);
      });

      return {
        id: r.id,
        live: live?.title || null,
        botNext: botNext?.title || null,
        schedNext: schedNext?.title || null,
        resolved: resolved?.title || null,
        resolvedStart: resolved?.start || null,
        phases: phases.map((p) => `${p.kind}:${p.title}`),
        alignedWithSchedule,
        upcomingIsLiveTitle,
        mixAngloWhileOtherLive,
        missingUpcomingWhileLive,
        upcomingWithoutTime: upcomingWithoutTime.map((p) => p.title),
      };
    });

    return { ok: true, stations };
  });

  expect(report.ok, report.reason || 'ok').toBe(true);
  expect(report.stations.length).toBeGreaterThanOrEqual(4);

  const ids = report.stations.map((s) => s.id);
  // Stations du réseau attendues (au moins le noyau).
  for (const need of ['cism', 'choq', 'chyz', 'ckut']) {
    expect(ids, `station manquante : ${need}`).toContain(need);
  }

  for (const st of report.stations) {
    expect(
      st.alignedWithSchedule,
      `${st.id} : à venir plus lointain que la grille `
        + `(resolved=${st.resolved}, sched=${st.schedNext}, phases=${JSON.stringify(st.phases)})`,
    ).toBe(true);

    expect(
      st.upcomingIsLiveTitle,
      `${st.id} : l’émission en ondes (« ${st.live} ») est aussi annoncée en à-venir`,
    ).toBe(false);

    expect(
      st.mixAngloWhileOtherLive,
      `${st.id} : Mix anglo recyclé en à-venir pendant « ${st.live} »`,
    ).toBe(false);

    expect(
      st.missingUpcomingWhileLive,
      `${st.id} : émission live sans phase « À venir » alors qu’un next existe `
        + `(sched=${st.schedNext}, bot=${st.botNext})`,
    ).toBe(false);

    // Si l’heure est connue (start), le sous-titre doit l’afficher.
    if (st.resolvedStart && st.resolved) {
      expect(
        st.upcomingWithoutTime,
        `${st.id} : « ${st.resolved} » annoncé sans heure (start=${st.resolvedStart})`,
      ).not.toContain(st.resolved);
    }
  }
});

test('« À venir » reste visible pendant qu’une émission est en ondes', async ({ page }) => {
  await pure(page);

  // Cas réels du site : chaque station a une émission en cours ET une suivante.
  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return radios.map((r) => {
      const live = P.botCurrentShow(r) || P.scheduleCurrentSlot(r);
      const airLeft = P.authoritativeAirLeftMin(r) || 0;
      const nextTitles = [
        P.scheduleNextSlot(r, airLeft)?.title,
        P.botNextShow(r)?.title,
        P.resolveUpcomingShow(r)?.title,
      ]
        .filter(Boolean)
        .map(norm);
      return {
        id: r.id,
        mobile: P.dialPhaseLinesForRadio(r),
        desktop: P.airRotationPhases(r, { withSlogan: false }).map((p) => p.kind),
        // Une piste est aussi de type « live » : seule une émission mérite le
        // libellé « À l'antenne ».
        hasLiveShow: P.airRotationPhases(r, { withSlogan: false })
          .some((p) => p.kind === 'live' && !p.title.startsWith('♪')),
        // Grille d'une seule émission dans la journée (CFAK le samedi) : la
        // suite est la même émission, on ne l'annonce pas sous elle-même.
        nextRepeatsLive: Boolean(live?.title)
          && nextTitles.length > 0
          && nextTitles.every((t) => t === norm(live.title)),
      };
    });
  });

  expect(perStation.length).toBeGreaterThan(0);

  for (const st of perStation) {
    if (!st.hasLiveShow) continue; // hors créneau : « à venir » est déjà en tête
    if (st.nextRepeatsLive) continue; // la suite est l'émission en ondes
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

test('en écoute (E) le slogan n’entre pas dans le filet L2 du dial compact', async ({ page }) => {
  await pure(page);

  // focus-group le-radar-tuner-dial-info-900 : filet = piste → à venir → horaire,
  // pas de slogan en cycle (reste méta bureau / hors L2 compact).
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
    expect(
      st.mobile,
      `${st.id} : slogan indésirable dans le filet dial — ${JSON.stringify(st.mobile)}`,
    ).not.toContain(st.slogan);
    // Sur bureau le slogan n’est pas une phase antenne non plus (withSlogan false).
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

test('hors écoute (B) : L1 identité poste, L2 une seule face antenne (pas de soupe)', async ({ page }) => {
  // Téléphone : acronyme + L2 sans horaire (mid 768/900 a sa propre règle).
  await page.setViewportSize({ width: 390, height: 844 });
  await pure(page);

  // focus-group le-radar-tuner-dial-info-900 — B idle :
  //  L1 = poste · acronyme (compactDialTitleLine)
  //  L2 = préfixe + titre seul (idleDialStoryLine) — jamais poste+horaire+campus collés
  const lines = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => ({
      id: r.id,
      name: r.name,
      inst: r.institution,
      l1: P.compactDialTitleLine(r),
      l2: P.idleDialStoryLine(r),
      banded: P.stationBandedName(r),
    }));
  });

  const ACRONYMS = /^(ULaval|UdeM|UdeS|UQAM|McGill|Concordia)$/;

  for (const st of lines) {
    // L1 : identité
    expect(st.l1, `${st.id} : L1 doit nommer le poste`).toContain(st.name);
    expect(st.banded, `${st.id} : bande FM/AM/Web`).toMatch(/(?:\b|\d)(?:FM|AM)\b|·\s*Web$/);
    expect(st.banded, `${st.id} : bande dupliquée — ${st.banded}`)
      .not.toMatch(/(FM|AM).*·.*(FM|AM)/i);
    expect(st.l1, `${st.id} : pas de forme longue d’établissement en L1`).not.toContain(st.inst);
    const l1Tail = st.l1.split('·').map((s) => s.trim()).pop();
    if (l1Tail && l1Tail !== st.l1.trim()) {
      expect(l1Tail, `${st.id} : acronyme en L1 — ${st.l1}`).toMatch(ACRONYMS);
    }

    // L2 : une face, pas de soupe
    if (!st.l2) continue;
    expect(st.l2, `${st.id} : L2 ne redis pas le poste — ${st.l2}`).not.toContain(st.banded);
    expect(st.l2, `${st.id} : L2 sans forme longue d’établissement`).not.toContain(st.inst);
    // Au plus un séparateur · (préfixe · titre) — pas 4–5 champs
    const middots = (st.l2.match(/·/g) || []).length;
    expect(middots, `${st.id} : L2 trop de middots — ${st.l2}`).toBeLessThanOrEqual(1);
    // Si ce n'est pas une piste, un libellé de statut ouvre souvent la ligne
    if (!st.l2.startsWith('♪')) {
      const head = st.l2.split('·')[0].trim();
      // Soit préfixe statut, soit titre seul (repli idle)
      expect(head.length, `${st.id} : L2 vide`).toBeGreaterThan(0);
    }
  }
});

test('en écoute (E) : ordre primaire émission → piste → à venir (filet, pas soupe)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pure(page);

  const perStation = await page.evaluate(async () => {
    const P = window.RadarAir._pure;
    const radios = await fetch('./radios.json').then((r) => r.json());
    return radios.map((r) => {
      const phases = P.dialPhasesForRadio(r);
      const kinds = phases.map((p) => {
        const t = String(p.title || '');
        if (t.startsWith('♪')) return 'track';
        if (p.kind === 'upcoming') return 'upcoming';
        if (p.kind === 'live') return 'live';
        if (/^\d{1,2}:\d{2}/.test(t)) return 'time';
        return p.kind || 'other';
      });
      return { id: r.id, kinds, lines: phases.map((p) => p.line) };
    });
  });

  for (const st of perStation) {
    const liveIdx = st.kinds.indexOf('live');
    const trackIdx = st.kinds.indexOf('track');
    const upIdx = st.kinds.indexOf('upcoming');
    if (liveIdx >= 0 && trackIdx >= 0) {
      expect(liveIdx, `${st.id} : émission avant piste — ${JSON.stringify(st.kinds)}`)
        .toBeLessThan(trackIdx);
    }
    if (liveIdx >= 0 && upIdx >= 0) {
      expect(liveIdx, `${st.id} : émission avant à venir — ${JSON.stringify(st.kinds)}`)
        .toBeLessThan(upIdx);
    }
    // Primaire live (téléphone) : pas d’horaire collé dans la même ligne que le titre
    if (liveIdx >= 0) {
      const liveLine = st.lines[liveIdx];
      expect(
        liveLine,
        `${st.id} : horaire collé à l’émission — ${liveLine}`,
      ).not.toMatch(/À l['’]antenne · .+ · \d{1,2}:\d{2}/);
    }
  }
});

test('mid 768/900 : institution complète + heures pour combler le vide', async ({ page }) => {
  // Formats midwidth-preview 768 et 900 uniquement (pas 390, pas ≥1100).
  for (const width of [768, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await pure(page);

    const report = await page.evaluate(async () => {
      const P = window.RadarAir._pure;
      const mid = P.isTunerDialMidLayout();
      const radios = await fetch('./radios.json').then((r) => r.json());
      return {
        mid,
        rows: radios.map((r) => {
          const phases = P.airRotationPhases(r, { withSlogan: false });
          const live = phases.find((p) => p.kind === 'live' && !String(p.title || '').startsWith('♪'));
          const time = live ? String(live.sub || '').trim() : '';
          const hasTime = /^\d{1,2}:\d{2}/.test(time);
          const l1 = P.compactDialTitleLine(r);
          const l2 = P.idleDialStoryLine(r);
          const liveLine = P.dialPhaseLinesForRadio(r).find((line) =>
            /À l['’]antenne/.test(line));
          return {
            id: r.id,
            inst: r.institution,
            l1,
            l2,
            liveLine: liveLine || '',
            hasTime,
            time,
          };
        }),
      };
    });

    expect(report.mid, `isTunerDialMidLayout @ ${width}`).toBe(true);

    for (const st of report.rows) {
      if (st.inst) {
        // L1 porte le nom complet (ou une forme longue), pas seulement l’acronyme court.
        const acrOnly = /^(ULaval|UdeM|UdeS|UQAM|McGill|Concordia)$/;
        const tail = st.l1.split('·').map((s) => s.trim()).pop();
        expect(
          tail && !acrOnly.test(tail),
          `${st.id} @ ${width} : institution complète attendue en L1 — ${st.l1}`,
        ).toBeTruthy();
        // Le nom source (souvent déjà long) doit apparaître ou une forme élargie.
        const instNorm = String(st.inst).toLowerCase();
        const l1Norm = st.l1.toLowerCase();
        const looksFull = l1Norm.includes(instNorm)
          || /université|university|cégep|college|collège|polytechnique/.test(l1Norm);
        expect(looksFull, `${st.id} @ ${width} : L1 pas assez long — ${st.l1}`).toBe(true);
      }
      if (st.hasTime) {
        expect(
          st.l2,
          `${st.id} @ ${width} : horaire manquant en L2 idle — ${st.l2}`,
        ).toMatch(/\d{1,2}:\d{2}/);
        if (st.liveLine) {
          expect(
            st.liveLine,
            `${st.id} @ ${width} : horaire manquant en face live — ${st.liveLine}`,
          ).toMatch(/\d{1,2}:\d{2}/);
        }
      }
    }
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

test('À l’antenne : émission d’abord, piste seulement s’il n’y a pas d’émission', async ({ page }) => {
  await pure(page);

  const copy = await page.evaluate(() => {
    const { liveCopyFromPhases, composedAirPhases } = window.RadarAir._pure;
    const both = liveCopyFromPhases([
      { kind: 'live', title: '10 sur 10 : un podcast 100% rap', sub: '20:30 – 22:30' },
      { kind: 'upcoming', title: 'Les rois de l’arène', sub: 'Demain · 05:00 – 07:00' },
      { kind: 'live', title: '♪ Lido Pimienta - No Me Quiero Ir', sub: '' },
    ]);
    const trackOnly = liveCopyFromPhases([
      { kind: 'upcoming', title: 'Faire avec', sub: '17:00 – 18:00' },
      { kind: 'live', title: '♪ Lido Pimienta - No Me Quiero Ir', sub: '' },
    ]);
    const composed = composedAirPhases(null);
    return { both, trackOnly, composedEmpty: composed };
  });

  expect(copy.both.liveTitle).toBe('10 sur 10 : un podcast 100% rap');
  expect(copy.both.liveSub).toMatch(/Lido Pimienta/);
  expect(copy.trackOnly.liveTitle).toBe('Lido Pimienta - No Me Quiero Ir');
  expect(copy.trackOnly.liveSub).toBe('');
});

test('CHOQ : piste longue scindée au tiret cadratin, les autres postes inchangés', async ({ page }) => {
  await pure(page);

  const report = await page.evaluate(() => {
    const { splitChoqSongLines, applyChoqLiveSongLines } = window.RadarAir._pure;
    const long = 'Earth Mother Fucker / Pound Land — Earth Mother Fucker - Happy Shopper';
    const phasesTrack = [
      { kind: 'live', title: `♪ ${long}`, sub: '' },
      { kind: 'upcoming', title: "Les rois de l'arène", sub: '05:00 – 07:00' },
    ];
    const phasesShow = [
      { kind: 'live', title: 'Intervenir ensemble', sub: '11:00 – 12:00' },
      { kind: 'live', title: `♪ ${long}`, sub: '' },
    ];
    return {
      split: splitChoqSongLines(long),
      note: splitChoqSongLines('♪ Downtown Boys — Albuterol'),
      hyphenOnly: splitChoqSongLines('Downtown Boys - Albuterol'),
      choqTrack: applyChoqLiveSongLines({ id: 'choq' }, long, '', phasesTrack),
      choqShow: applyChoqLiveSongLines({ id: 'choq' }, 'Intervenir ensemble', `♪ ${long}`, phasesShow),
      cism: applyChoqLiveSongLines({ id: 'cism' }, long, '', phasesTrack),
    };
  });

  expect(report.split.title).toBe('Earth Mother Fucker / Pound Land');
  expect(report.split.sub).toBe('Earth Mother Fucker - Happy Shopper');
  expect(report.note).toEqual({ title: 'Downtown Boys', sub: 'Albuterol' });
  expect(report.hyphenOnly, 'sans cadratin on ne invente pas de coupe').toEqual({
    title: 'Downtown Boys - Albuterol',
    sub: '',
  });
  expect(report.choqTrack.songSplit).toBe(true);
  expect(report.choqTrack.liveTitle).toBe('Earth Mother Fucker / Pound Land');
  expect(report.choqTrack.liveSub).toBe('Earth Mother Fucker - Happy Shopper');
  expect(report.choqShow.songSplit, 'émission en cours : on ne touche pas à la piste').toBe(false);
  expect(report.choqShow.liveTitle).toBe('Intervenir ensemble');
  expect(report.cism.songSplit, 'les autres postes gardent la ligne unique').toBe(false);
  expect(report.cism.liveTitle).toBe('Earth Mother Fucker / Pound Land — Earth Mother Fucker - Happy Shopper');
});

test('wide CHOQ : la piste scindée ne déborde pas sur À venir', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure && document.getElementById('tuner-nowair-wide'));

  const geo = await page.evaluate(() => {
    const { applyChoqLiveSongLines } = window.RadarAir._pure;
    const long = 'Earth Mother Fucker / Pound Land — Earth Mother Fucker - Happy Shopper';
    const copy = applyChoqLiveSongLines({ id: 'choq' }, long, '', [
      { kind: 'live', title: `♪ ${long}`, sub: '' },
      { kind: 'upcoming', title: "Les rois de l'arène", sub: '05:00 – 07:00' },
    ]);
    const liveT = document.querySelector('[data-wide-live-title]');
    const liveS = document.querySelector('[data-wide-live-sub]');
    const nextT = document.querySelector('[data-wide-next-title]');
    const liveSlot = document.querySelector('.tuner-wide-slot--live');
    const nextSlot = document.querySelector('.tuner-wide-slot--next');
    liveT.textContent = copy.liveTitle;
    liveS.textContent = copy.liveSub;
    liveS.hidden = !copy.liveSub;
    nextT.textContent = "Les rois de l'arène";
    liveSlot.classList.add('tuner-wide-slot--song-split');
    liveSlot.hidden = false;
    liveSlot.classList.remove('is-wide-absent');
    const lr = liveT.getBoundingClientRect();
    const nr = nextSlot.getBoundingClientRect();
    return {
      title: liveT.textContent,
      sub: liveS.textContent,
      titleHasEm: liveT.textContent.includes('—'),
      liveRight: lr.right,
      nextLeft: nr.left,
      titleH: lr.height,
      subH: liveS.getBoundingClientRect().height,
    };
  });

  expect(geo.title).toBe('Earth Mother Fucker / Pound Land');
  expect(geo.sub).toBe('Earth Mother Fucker - Happy Shopper');
  expect(geo.titleHasEm, 'plus de cadratin dans le titre').toBe(false);
  expect(geo.titleH, 'titre = 1 ligne').toBeLessThan(22);
  expect(geo.subH, 'sous-ligne = 1 ligne').toBeGreaterThan(8);
  expect(geo.liveRight, 'le titre live ne recouvre pas À venir').toBeLessThan(geo.nextLeft - 4);
});

test('wide : sans émission, masquer À l’antenne (pas « Rien à l’antenne »)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure && document.getElementById('tuner-nowair-wide'));

  const report = await page.evaluate(() => {
    const copy = window.RadarAir._pure.wideNowAirLiveCopy({ id: 'x' });
    const liveSlot = document.querySelector('.tuner-wide-slot--live');
    const wrap = document.getElementById('tuner-nowair-wide');
    liveSlot.hidden = !!copy.hideLive;
    liveSlot.classList.toggle('is-wide-absent', !!copy.hideLive);
    wrap.classList.toggle('is-live-absent', !!copy.hideLive);
    const cs = getComputedStyle(liveSlot);
    return {
      hideLive: copy.hideLive,
      liveTitle: copy.liveTitle,
      display: cs.display,
    };
  });

  expect(report.hideLive).toBe(true);
  expect(report.liveTitle).toBe('');
  expect(report.display, 'le slot live doit disparaître').toBe('none');
});

test('wide : deux slots, deux lignes, jamais de titre écrasé', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure && document.getElementById('tuner-nowair-wide'));

  const geo = await page.evaluate(() => {
    const liveT = document.querySelector('[data-wide-live-title]');
    const nextT = document.querySelector('[data-wide-next-title]');
    const liveSlot = document.querySelector('.tuner-wide-slot--live');
    const nextSlot = document.querySelector('.tuner-wide-slot--next');
    if (liveT) liveT.textContent = 'Toute est dans toute (reprise) et encore plus long pour tester';
    if (nextT) nextT.textContent = 'Toute est dans toute (reprise)';
    const liveSub = document.querySelector('[data-wide-live-sub]');
    const nextSub = document.querySelector('[data-wide-next-sub]');
    if (liveSub) {
      liveSub.textContent = '20:00 – 21:00';
      liveSub.hidden = false;
    }
    if (nextSub) {
      nextSub.textContent = '21:00 – 22:00';
      nextSub.hidden = false;
    }
    liveSlot.hidden = false;
    liveSlot.classList.remove('is-wide-absent');
    const lt = getComputedStyle(liveT);
    const nt = getComputedStyle(nextT);
    return {
      liveH: liveT.getBoundingClientRect().height,
      nextH: nextT.getBoundingClientRect().height,
      liveW: liveSlot.getBoundingClientRect().width,
      nextW: nextSlot.getBoundingClientRect().width,
      liveHidden: liveSlot.hidden || liveSlot.classList.contains('is-wide-absent'),
      liveWrap: lt.whiteSpace,
      nextWrap: nt.whiteSpace,
      liveClamp: lt.webkitLineClamp,
      empty: window.RadarAir._pure.wideNowAirLiveCopy({ id: 'x' }),
    };
  });

  expect(geo.liveHidden, 'slot live forcé visible pour la géométrie').toBe(false);
  expect(geo.liveWrap).toBe('nowrap');
  expect(geo.nextWrap).toBe('nowrap');
  expect(geo.liveH, 'titre live = 1 ligne').toBeLessThan(22);
  expect(geo.nextH, 'titre à venir = 1 ligne').toBeLessThan(22);
  expect(geo.liveW, 'slot live pas écrasé').toBeGreaterThan(120);
  expect(geo.nextW, 'slot à venir pas écrasé').toBeGreaterThan(120);
  expect(geo.empty.hideLive, 'sans émission : masquer À l’antenne').toBe(true);
  expect(geo.empty.liveTitle, 'pas de « Rien à l’antenne »').toBe('');

  const full = await page.evaluate(() => {
    const nextT = document.querySelector('[data-wide-next-title]');
    nextT.textContent = 'Toute est dans toute (reprise)';
    return {
      text: nextT.textContent,
      sw: nextT.scrollWidth,
      cw: nextT.clientWidth,
      overflow: getComputedStyle(nextT).textOverflow,
    };
  });
  expect(full.overflow, 'pas d’ellipse sur le titre wide').not.toBe('ellipsis');
  expect(full.sw, 'titre à venir entier').toBeLessThanOrEqual(full.cw + 1);
});

test('wide E : le carré du synthétiseur n’est pas vide (accueil + kit média)', async ({ page }) => {
  for (const path of ['/', '/kit-media/', '/medias/']) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const tuner = page.locator('#tuner');
    await expect(tuner, `${path}: #tuner`).toBeVisible({ timeout: 15_000 });
    await expect(tuner, `${path}: is-dial-ready`).toHaveClass(/is-dial-ready/, { timeout: 15_000 });
    const name = page.locator('#tuner-now-name');
    await expect(name, `${path}: L1 dans le DOM`).toBeVisible();
    const snapshot = await name.evaluate((el) => ({
      text: (el.textContent || '').trim(),
      opacity: Number(getComputedStyle(el).opacity),
    }));
    expect(snapshot.text.length, `${path}: L1 vide`).toBeGreaterThan(0);
    expect(snapshot.opacity, `${path}: L1 opacity 0`).toBeGreaterThan(0.5);
  }
});

test('compact : le carré du synthétiseur reste lisible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#tuner');
  await expect(tuner).toHaveClass(/is-dial-ready/, { timeout: 15_000 });
  const snapshot = await page.locator('#tuner-now-name').evaluate((el) => ({
    text: (el.textContent || '').trim(),
    opacity: Number(getComputedStyle(el).opacity),
  }));
  expect(snapshot.text.length).toBeGreaterThan(0);
  expect(snapshot.opacity).toBeGreaterThan(0.5);
});

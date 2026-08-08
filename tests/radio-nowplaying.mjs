import assert from 'node:assert/strict';
import nowPlaying from '../scripts/radio-nowplaying-lib.js';
import scheduleLib from '../scripts/radio-schedule-lib.js';
import schedules from '../radio-schedules.json' with { type: 'json' };
import radios from '../radios.json' with { type: 'json' };

const {
  isCismLiveWindowCurrent,
  timestampMs,
  mergeOnAirResults,
  scheduleToHit,
  slotCoversDate,
  scheduleHasSlot,
  liveEndDeltaMin,
} = nowPlaying;
const { parseChyzGrid, normalizeSlot, stripTransientFlags } = scheduleLib;

// ── Utilitaires ─────────────────────────────────────────────────────────────

/** Jeudi 30 juil. 2026 00:06 HAE (America/Toronto). */
const TORONTO_THU_0006 = new Date('2026-07-30T04:06:00.000Z');
/** Mercredi 29 juil. 2026 23:30 HAE — encore dans Mix anglo CISM 22:00–00:00. */
const TORONTO_WED_2330 = new Date('2026-07-30T03:30:00.000Z');
/** Jeudi 30 juil. 2026 11:15 HAE. */
const TORONTO_THU_1115 = new Date('2026-07-30T15:15:00.000Z');

function radioMeta(id) {
  const r = Array.isArray(radios) ? radios.find((x) => x.id === id) : null;
  return { id, name: r?.name || id };
}

function mergeCase({ id, hits, scheduleHit, now, expectNext, expectCurrent, label }) {
  const merged = mergeOnAirResults(
    hits,
    scheduleHit ?? scheduleToHit(schedules, id, 'America/Toronto'),
    radioMeta(id),
    { timeZone: 'America/Toronto', now },
  );
  if (expectNext !== undefined) {
    assert.equal(
      merged.next?.title || null,
      expectNext,
      `${label || id} : next attendu « ${expectNext} », reçu « ${merged.next?.title || '∅'} »`,
    );
  }
  if (expectCurrent !== undefined) {
    assert.equal(
      merged.current?.title || null,
      expectCurrent,
      `${label || id} : current attendu « ${expectCurrent} », reçu « ${merged.current?.title || '∅'} »`,
    );
  }
  return merged;
}

// ── Fraîcheur CISM (timestamps API) ─────────────────────────────────────────

assert.equal(timestampMs(1_785_308_400), 1_785_308_400_000, 'timestamp CISM en secondes');
assert.equal(timestampMs('2026-07-29T07:00:00.000Z'), 1_785_308_400_000, 'timestamp ISO');

const cismPayload = {
  current: { title: 'Mix Franco', datetime: 1_785_304_800 },
  upcoming: { title: 'Fréquence 440', datetime: 1_785_308_400 },
};

assert.equal(
  isCismLiveWindowCurrent(cismPayload, 1_785_305_800_000),
  true,
  'la fenêtre live reste valide avant le prochain créneau',
);
assert.equal(
  isCismLiveWindowCurrent(cismPayload, 1_785_309_000_000),
  false,
  'une fenêtre CISM expirée ne peut pas écraser la grille',
);
assert.equal(
  isCismLiveWindowCurrent({ current: { title: 'Sans borne' } }, 1_785_309_000_000),
  true,
  'une réponse sans borne est conservée plutôt que rejetée arbitrairement',
);

console.log('OK radio-nowplaying (fraîcheur CISM)');

// ── Merge « next le plus tôt » — cas multi-stations ─────────────────────────

// CHOQ : GraphQL saute un créneau du jour → grille 11:00 bat API 11:30.
mergeCase({
  id: 'choq',
  label: 'CHOQ (API saute un créneau)',
  now: TORONTO_THU_0006,
  scheduleHit: {
    current: null,
    next: {
      title: 'Intervenir ensemble',
      start: '11:00',
      end: '12:00',
      source: 'schedule',
    },
  },
  hits: [{
    current: null,
    next: {
      title: 'Opération beurre de cinoche',
      start: '11:30',
      end: '12:30',
      source: 'api-live',
    },
    track: '',
  }],
  expectNext: 'Intervenir ensemble',
});

// CISM minuit : current Mix anglo 22:00–00:00 périmé ; next ludothèque 00:00
// (la grille à 00:06 a déjà La grande ludothèque en current).
{
  const sched = scheduleToHit(schedules, 'cism', 'America/Toronto');
  // Forcer un hit API périmé (Mix anglo encore annoncé après minuit).
  mergeCase({
    id: 'cism',
    label: 'CISM (Mix anglo périmé après minuit)',
    now: TORONTO_THU_0006,
    scheduleHit: sched,
    hits: [{
      current: {
        title: 'Mix anglo',
        start: '22:00',
        end: '00:00',
        source: 'api-live',
      },
      next: {
        title: 'La grande ludothèque (reprise)',
        start: '00:00',
        end: '02:00',
        source: 'api-live',
      },
      track: '',
    }],
    // current : grille ou API — l’important est que next ne soit pas Mix anglo.
  });
  const merged = mergeOnAirResults(
    [{
      current: {
        title: 'Mix anglo',
        start: '22:00',
        end: '00:00',
        source: 'api-live',
      },
      next: {
        title: 'La grande ludothèque (reprise)',
        start: '00:00',
        end: '02:00',
        source: 'api-live',
      },
      track: '',
    }],
    scheduleToHit(schedules, 'cism', 'America/Toronto'),
    radioMeta('cism'),
    { timeZone: 'America/Toronto', now: TORONTO_THU_0006 },
  );
  assert.notEqual(
    merged.next?.title,
    'Mix anglo',
    'CISM : Mix anglo ne doit pas rester le next après minuit',
  );
}

// CHYZ : API annonce un next lointain (22:00), grille a un créneau plus tôt.
{
  const grid = schedules.stations?.chyz?.grid || [];
  // Trouver le premier créneau du jeudi (day 4) après 00:06.
  const thu = grid
    .filter((s) => s.day === 4 && s.start && s.title)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const firstThu = thu.find((s) => {
    const [h, m] = String(s.start).split(':').map(Number);
    return h * 60 + m > 6;
  }) || thu[0];
  if (firstThu) {
    mergeCase({
      id: 'chyz',
      label: 'CHYZ (API next trop tardif)',
      now: TORONTO_THU_0006,
      scheduleHit: {
        current: null,
        next: {
          title: firstThu.title,
          start: firstThu.start,
          end: firstThu.end,
          source: 'schedule',
        },
      },
      hits: [{
        current: null,
        next: {
          title: 'Émission fantôme du soir',
          start: '22:00',
          end: '23:00',
          source: 'api-live',
        },
        track: '',
      }],
      expectNext: firstThu.title,
    });
  }
}

// CKUT : même heure → l’API gagne (enrichissement), pas la grille.
mergeCase({
  id: 'ckut',
  label: 'CKUT (même heure : api-live conserve le next)',
  now: TORONTO_THU_1115,
  scheduleHit: {
    current: null,
    next: {
      title: 'Off The Hook',
      start: '12:00',
      end: '14:00',
      source: 'schedule',
    },
  },
  hits: [{
    current: {
      title: 'Lo Signal',
      start: '10:00',
      end: '12:00',
      source: 'api-live',
    },
    next: {
      title: 'Off The Hook',
      start: '12:00',
      end: '14:00',
      source: 'api-live',
    },
    track: '',
  }],
  expectNext: 'Off The Hook',
});

// CJLO : grille plus tôt que l’API (même pattern CHOQ).
mergeCase({
  id: 'cjlo',
  label: 'CJLO (grille avant API)',
  now: TORONTO_THU_0006,
  scheduleHit: {
    current: null,
    next: {
      title: 'Morning Brew',
      start: '08:00',
      end: '10:00',
      source: 'schedule',
    },
  },
  hits: [{
    current: null,
    next: {
      title: 'Alternative Mega Mix',
      start: '14:00',
      end: '16:00',
      source: 'api-live',
    },
    track: '',
  }],
  expectNext: 'Morning Brew',
});

// CFAK : API plus tôt que la grille → API gagne.
mergeCase({
  id: 'cfak',
  label: 'CFAK (API plus tôt que la grille)',
  now: TORONTO_THU_0006,
  scheduleHit: {
    current: null,
    next: {
      title: 'Les nuits CFAK',
      start: '22:00',
      end: '00:00',
      source: 'schedule',
    },
  },
  hits: [{
    current: null,
    next: {
      title: 'Le popcorn de l\'infini',
      start: '09:00',
      end: '11:00',
      source: 'api-live',
    },
    track: '',
  }],
  expectNext: 'Le popcorn de l\'infini',
});

// Sans grille : l’API seule suffit (repli).
mergeCase({
  id: 'ckut',
  label: 'Sans grille (API seule)',
  now: TORONTO_THU_1115,
  scheduleHit: null,
  hits: [{
    current: { title: 'Show A', start: '10:00', end: '12:00', source: 'api-live' },
    next: { title: 'Show B', start: '12:00', end: '14:00', source: 'api-live' },
    track: '',
  }],
  expectNext: 'Show B',
  expectCurrent: 'Show A',
});

// Toutes les stations avec grille : scheduleToHit produit un next cohérent.
{
  const withGrid = (Array.isArray(radios) ? radios : [])
    .map((r) => r.id)
    .filter((id) => Array.isArray(schedules.stations?.[id]?.grid)
      && schedules.stations[id].grid.length > 0);
  assert.ok(withGrid.length >= 4, `au moins 4 grilles (reçu ${withGrid.length})`);
  for (const id of withGrid) {
    const hit = scheduleToHit(schedules, id, 'America/Toronto');
    assert.ok(hit, `${id} : scheduleToHit doit renvoyer un hit`);
    // Au moins current ou next doit exister pour une grille non vide
    // (sauf trou total improbable).
    const hasSignal = Boolean(hit.current?.title || hit.next?.title);
    assert.ok(
      hasSignal,
      `${id} : grille non vide sans current ni next — ${JSON.stringify(hit)}`,
    );
  }
  console.log(`OK scheduleToHit (${withGrid.join(', ')})`);
}

console.log('OK radio-nowplaying (next plus tôt multi-stations)');

// ── Émissions spéciales / hors programmation (CHYZ, soirs de match) ─────────
//
// CHYZ réécrit sa page horaire le jour même : les Capitales de Québec passent
// de 18:50 à 16:50 et l'émission régulière du créneau disparaît. La grille
// colligée, elle, a jusqu'à deux semaines — d'où « À venir · Capitales de
// Québec · 18:50 » affiché pendant que le match jouait déjà.
{
  /** Vendredi 7 août 2026, 18:00 HAE — match en ondes depuis 16:50. */
  const TORONTO_FRI_1800 = new Date('2026-08-07T22:00:00.000Z');

  // 1. Le parseur retient le marqueur « en direct » de la page.
  const html = `
    <a href="https://chyz.ca/emission/les-arshitechs-du-son/" class="article-horaire flex" data-jour-slug="vendredi">
      <div class="container-heure flex"><p class="font-size-32"> 17:30 - 18:30 </p></div>
      <div><h3 class="font-size-40">Les Arshitechs du Son</h3></div>
    </a>
    <a href="https://chyz.ca/emission/capitales-de-quebec/" class="article-horaire flex" data-jour-slug="vendredi">
      <div class="container-heure flex">
        <span class="font-size-18">en direct</span><p class="font-size-32"> 16:50 - 23:00 </p>
      </div>
      <div><h3 class="font-size-40">Capitales de Québec</h3></div>
    </a>`;
  const parsed = parseChyzGrid(html);
  const live = parsed.filter((s) => s.live);
  assert.equal(live.length, 1, 'un seul bloc CHYZ marqué « en direct »');
  assert.equal(live[0].title, 'Capitales de Québec', 'le bloc en direct est le match');
  assert.equal(live[0].start, '16:50', 'heure du bloc en direct lue sur la page');
  assert.ok(
    normalizeSlot(live[0]).live,
    'le marqueur traverse la normalisation (le now-playing en a besoin)',
  );
  assert.ok(
    !stripTransientFlags([normalizeSlot(live[0])])[0].live,
    'mais il est ôté avant publication : dans un fichier relu deux semaines, '
    + 'il désignerait une émission finie comme étant à l’antenne',
  );

  // 2. Le marqueur n'est suivi que s'il décrit bien l'instant présent
  //    (la page peut être servie de cache).
  assert.equal(
    slotCoversDate(live[0], TORONTO_FRI_1800, 'America/Toronto', 20),
    true,
    'bloc en direct : couvre 18:00 vendredi',
  );
  assert.equal(
    slotCoversDate(live[0], new Date('2026-08-07T18:00:00.000Z'), 'America/Toronto', 20),
    false,
    'bloc en direct : ne couvre pas 14:00 vendredi (page périmée)',
  );

  // 3. Hors programmation : le bloc n'existe pas tel quel dans la grille publiée.
  assert.equal(
    scheduleHasSlot(schedules, 'chyz', { day: 5, start: '16:50', title: 'Capitales de Québec' }),
    false,
    'le match de 16:50 est absent de la grille colligée → spécial',
  );
  assert.equal(
    scheduleHasSlot(schedules, 'chyz', { day: 5, start: '10:00', title: 'Palmarès CHYZ' }),
    true,
    'un créneau régulier reste dans la grille colligée',
  );

  // 4. Le veto : rien ne commence avant la fin de ce qui joue.
  const capitales = {
    title: 'Capitales de Québec',
    start: '16:50',
    end: '23:00',
    source: 'api-live',
    special: true,
  };
  assert.equal(liveEndDeltaMin(capitales, 18 * 60), 300, 'minutes restantes du match à 18:00');
  assert.equal(
    liveEndDeltaMin(capitales, 23 * 60 + 30),
    null,
    'après 23:00 le match ne barre plus rien',
  );

  const merged = mergeCase({
    id: 'chyz',
    label: 'CHYZ (match en ondes, grille périmée)',
    now: TORONTO_FRI_1800,
    scheduleHit: {
      current: null,
      // Ce que la grille colligée croit encore : le match commence à 18:50.
      next: { title: 'Capitales de Québec', start: '18:50', end: '23:00', source: 'schedule' },
    },
    hits: [{
      current: capitales,
      next: { title: 'Palmarès CHYZ', start: '10:00', end: '10:30', source: 'api-live' },
      track: '',
    }],
    expectCurrent: 'Capitales de Québec',
    expectNext: 'Palmarès CHYZ',
  });
  assert.equal(merged.current.special, true, 'le spécial reste marqué jusque dans le JSON publié');

  // 5. Une émission régulière évincée ne doit pas non plus être annoncée.
  mergeCase({
    id: 'chyz',
    label: 'CHYZ (créneau régulier évincé par le match)',
    now: TORONTO_FRI_1800,
    scheduleHit: {
      current: null,
      next: { title: 'Les Arshitechs du Son', start: '20:00', end: '21:00', source: 'schedule' },
    },
    hits: [{ current: capitales, next: null, track: '' }],
    expectNext: null,
  });

  // 6. Le veto vaut aussi pour une grille relue à l'instant : c'est ce qui
  //    protège les postes sans API live (CJLO, CFAK et tout poste à venir).
  mergeCase({
    id: 'cfak',
    label: 'poste sans API live (grille du jour vs grille publiée)',
    now: TORONTO_FRI_1800,
    scheduleHit: {
      current: { title: 'Émission régulière', start: '17:00', end: '18:00', source: 'schedule' },
      next: { title: 'Créneau évincé', start: '18:00', end: '19:00', source: 'schedule' },
    },
    hits: [{
      current: {
        title: 'Spécial élections',
        start: '17:00',
        end: '21:00',
        source: 'schedule-live',
        special: true,
      },
      next: { title: 'Nuit', start: '21:00', end: '00:00', source: 'schedule-live' },
      track: '',
    }],
    expectCurrent: 'Spécial élections',
    expectNext: 'Nuit',
  });

  console.log('OK radio-nowplaying (émissions spéciales / hors programmation)');
}

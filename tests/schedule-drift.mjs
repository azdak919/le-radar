import assert from 'node:assert/strict';
import drift from '../scripts/schedule-drift-lib.js';

const {
  diffGrids, classifyDrift, summarizeDrift, slotLabel,
  OVERHAUL_RATIO, OVERHAUL_MIN_SLOTS,
} = drift;

/** Grille CHYZ telle que publiée le 6 août 2026 (extrait vendredi). */
const PUBLISHED = [
  { day: 5, start: '08:00', end: '10:00', title: 'Vendredi Nostalgie' },
  { day: 5, start: '10:00', end: '10:30', title: 'Palmarès CHYZ' },
  { day: 5, start: '17:30', end: '18:30', title: 'Les Arshitechs du Son' },
  { day: 5, start: '18:50', end: '23:00', title: 'Capitales de Québec' },
  { day: 6, start: '10:00', end: '10:30', title: 'Palmarès CHYZ' },
];

/** La même page, relue le 7 août au soir : le match a tout décalé. */
const FRESH_MATCH = [
  { day: 5, start: '08:00', end: '10:00', title: 'Vendredi Nostalgie' },
  { day: 5, start: '10:00', end: '10:30', title: 'Palmarès CHYZ' },
  { day: 5, start: '16:50', end: '23:00', title: 'Capitales de Québec' },
  { day: 6, start: '10:00', end: '10:30', title: 'Palmarès CHYZ' },
];

// ── Diff ────────────────────────────────────────────────────────────────────

{
  const { added, removed } = diffGrids(PUBLISHED, FRESH_MATCH);
  assert.deepEqual(
    added.map(slotLabel),
    ['ven 16:50–23:00 Capitales de Québec'],
    'le match à sa vraie heure est le seul ajout',
  );
  assert.deepEqual(
    removed.map(slotLabel),
    [
      'ven 17:30–18:30 Les Arshitechs du Son',
      'ven 18:50–23:00 Capitales de Québec',
    ],
    'l’émission évincée et le créneau fantôme sont les seuls retraits',
  );
}

// Une URL qui change ne fait pas une dérive : seuls jour, bornes et titre comptent.
{
  const withUrls = PUBLISHED.map((s) => ({ ...s, url: `https://chyz.ca/${s.title}` }));
  const { added, removed } = diffGrids(PUBLISHED, withUrls);
  assert.equal(added.length + removed.length, 0, 'l’URL n’entre pas dans l’identité d’un créneau');
}

// Le titre est comparé sans sensibilité à la casse ni aux espaces multiples.
{
  const noisy = PUBLISHED.map((s) => ({ ...s, title: `  ${s.title.toUpperCase()}  ` }));
  assert.equal(diffGrids(PUBLISHED, noisy).added.length, 0, 'casse et espaces ignorés');
}

// ── Classement ──────────────────────────────────────────────────────────────

{
  const st = classifyDrift('chyz', PUBLISHED, FRESH_MATCH);
  assert.equal(st.status, 'drift', 'un soir de match reste du hors-programmation');
  assert.equal(st.changed, 3);
  // Piège des petites grilles : sur cet extrait de 5 créneaux, 3 changements
  // pèsent 60 % — au-dessus du seuil de refonte. Seul le plancher absolu évite
  // d'annoncer « grille refaite » (et donc une recollecte) pour un match.
  assert.ok(st.ratio >= OVERHAUL_RATIO, 'la proportion seule crierait à la refonte');
  assert.ok(st.changed < OVERHAUL_MIN_SLOTS, 'trop peu de créneaux pour une refonte');
}

assert.equal(
  classifyDrift('cism', PUBLISHED, PUBLISHED).status,
  'stable',
  'grille identique : stable',
);

// Refonte : au-delà du seuil, ce n'est plus une spéciale mais une rentrée.
{
  const rentree = [
    { day: 1, start: '09:00', end: '10:00', title: 'Nouvelle émission A' },
    { day: 2, start: '09:00', end: '10:00', title: 'Nouvelle émission B' },
    { day: 3, start: '09:00', end: '10:00', title: 'Nouvelle émission C' },
  ];
  const st = classifyDrift('chyz', PUBLISHED, rentree);
  assert.equal(st.status, 'overhaul', 'grille entièrement remplacée : refonte');
}

// Source muette : un silence ne doit jamais se lire comme « tout a changé ».
{
  const st = classifyDrift('cfak', PUBLISHED, []);
  assert.equal(st.status, 'unreachable', 'grille fraîche vide = source injoignable');
  assert.equal(st.removed.length, 0, 'aucun retrait imputé à une source muette');
  assert.equal(st.changed, 0);
}

// Première collecte (rien de publié) : il n'y a pas de dérive à mesurer, il y a
// une grille à collecter — même geste qu'une refonte.
{
  const st = classifyDrift('nouvelle', [], FRESH_MATCH);
  assert.equal(st.status, 'overhaul', 'poste sans grille publiée : à collecter');
  assert.equal(st.published, 0);
  assert.equal(st.removed.length, 0, 'aucun retrait à imputer sans grille publiée');
}

// La grille réelle de CHYZ (25 créneaux) : le même soir de match reste une
// dérive par les deux critères — c'est le cas mesuré le 7 août 2026.
{
  const filler = Array.from({ length: 20 }, (_, i) => ({
    day: i % 5, start: '12:00', end: '13:00', title: `Émission ${i}`,
  }));
  const st = classifyDrift('chyz', [...PUBLISHED, ...filler], [...FRESH_MATCH, ...filler]);
  assert.equal(st.status, 'drift');
  assert.ok(st.ratio < OVERHAUL_RATIO, '3 créneaux sur 25 : 12 %');
}

// ── Résumé ──────────────────────────────────────────────────────────────────

{
  const summary = summarizeDrift([
    classifyDrift('chyz', PUBLISHED, FRESH_MATCH),
    classifyDrift('cism', PUBLISHED, PUBLISHED),
    classifyDrift('cfak', PUBLISHED, []),
  ]);
  assert.equal(summary.checked, 3);
  assert.equal(summary.stable, 1);
  assert.deepEqual(summary.drift, ['chyz']);
  assert.deepEqual(summary.unreachable, ['cfak']);
  assert.deepEqual(summary.overhaul, []);
}

console.log('OK schedule-drift (hors programmation, refonte, source muette)');

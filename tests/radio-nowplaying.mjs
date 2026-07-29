import assert from 'node:assert/strict';
import nowPlaying from '../scripts/radio-nowplaying-lib.js';

const { isCismLiveWindowCurrent, timestampMs } = nowPlaying;

// La borne « upcoming » est en secondes Unix dans l'API CISM.
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

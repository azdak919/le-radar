import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../scripts/cicsa-sheet-watch-lib.js');
assert.equal(lib.scheduleSeason(',CICSA 2026-27 Draft Schedule - 6/16/2026,'), 2026);
assert.equal(lib.scheduleSeason(',CICSA 2025 Schedule,'), 2025);
assert.equal(lib.scoresUpdated(',Updated March 9 2026,'), Date.UTC(2026, 2, 9));
assert.equal(lib.scoresUpdated(',Updated November 2nd,'), null); // sans année : pas fiable
const sheets = [
  { id: 'S25', head: ',CICSA 2025 Schedule,' }, { id: 'S26', head: ',CICSA 2026-27 Draft Schedule,' },
  { id: 'R_old', head: ',Updated November 2nd,' }, { id: 'R26', head: ',Updated March 9 2026,' },
];
// État réel du 2026-10-26 : rien ne bouge.
let d = lib.decide({ cfg: { scoresSheetId: 'R26', scheduleSheetId: 'S26' }, seasonStartYear: 2026, listedIds: ['S25', 'S26', 'R_old', 'R26'], sheets });
assert.deepEqual([d.scoresSheetId, d.scheduleSheetId, d.changes.length, d.alerts.length], ['R26', 'S26', 0, 0]);
// Saison suivante publiée : bascule auto.
d = lib.decide({ cfg: { scoresSheetId: 'R26', scheduleSheetId: 'S26' }, seasonStartYear: 2027, listedIds: ['S27', 'R27'], sheets: [...sheets, { id: 'S27', head: ',CICSA 2027-28 Schedule,' }, { id: 'R27', head: ',Updated October 3 2027,' }] });
assert.deepEqual([d.scoresSheetId, d.scheduleSheetId], ['R27', 'S27']);
// Ambigu : deux calendriers 2027 → alerte, pas de bascule.
d = lib.decide({ cfg: { scoresSheetId: 'R26', scheduleSheetId: 'S26' }, seasonStartYear: 2027, listedIds: ['S27', 'S27b', 'R26', 'S26'], sheets: [...sheets, { id: 'S27', head: ',CICSA 2027-28 Schedule,' }, { id: 'S27b', head: ',CICSA 2027 Schedule,' }] });
assert.equal(d.scheduleSheetId, 'S26'); assert.ok(d.alerts.length >= 1);
console.log('cicsa-sheet-watch ok');

#!/usr/bin/env node

import assert from 'node:assert/strict';
import { WRITER_WORKFLOWS, classifyOperatingState, classifyPublicMaintenance } from '../scripts/maintenance-window.mjs';

assert.equal(WRITER_WORKFLOWS.length, 9, 'neuf workflows écrivains requis');
assert.equal(classifyPublicMaintenance({ status: 302, location: 'https://le-radar.ca/offline.html?maintenance=1' }), true);
assert.equal(classifyPublicMaintenance({ status: 200, body: '<title>Maintenance en cours — LE RADAR</title>' }), true);
assert.equal(classifyPublicMaintenance({ status: 200, body: '<title>LE-RADAR.ca</title>' }), false);
assert.equal(classifyOperatingState({ publicMaintenance: true, writerStates: Array(9).fill('disabled_manually') }), 'maintenance cohérente');
assert.equal(classifyOperatingState({ publicMaintenance: false, writerStates: Array(9).fill('active') }), 'normal cohérent');
assert.equal(classifyOperatingState({ publicMaintenance: false, writerStates: Array(9).fill('disabled_manually') }), 'INCOHÉRENT');

console.log('OK maintenance-window');

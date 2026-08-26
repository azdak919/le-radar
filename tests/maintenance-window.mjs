#!/usr/bin/env node

import assert from 'node:assert/strict';
import { WRITER_WORKFLOWS, classifyOperatingState, classifyPublicMaintenance } from '../scripts/maintenance-window.mjs';

const writerCount = WRITER_WORKFLOWS.length;
assert.equal(writerCount, 14, 'quatorze workflows écrivains requis (news, radio, sports, archives)');
assert.equal(classifyPublicMaintenance({ status: 302, location: 'https://le-radar.ca/offline.html?maintenance=1' }), true);
assert.equal(classifyPublicMaintenance({ status: 200, body: '<title>Maintenance en cours — LE RADAR</title>' }), true);
assert.equal(classifyPublicMaintenance({ status: 200, body: '<title>LE-RADAR.ca</title>' }), false);
assert.equal(classifyOperatingState({ publicMaintenance: true, writerStates: Array(writerCount).fill('disabled_manually') }), 'maintenance cohérente');
assert.equal(classifyOperatingState({ publicMaintenance: false, writerStates: Array(writerCount).fill('active') }), 'normal cohérent');
assert.equal(classifyOperatingState({ publicMaintenance: false, writerStates: Array(writerCount).fill('disabled_manually') }), 'INCOHÉRENT');

console.log('OK maintenance-window');

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildSportsMastheadPayload } = require('./sports-masthead-lib');

const ROOT = path.join(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'sports.json'), 'utf8'));
const payload = buildSportsMastheadPayload(source);
const output = `${JSON.stringify(payload, null, 2)}\n`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(ROOT, 'sports-masthead.json'), output, 'utf8');
}

console.log(`sports masthead: ${payload.teamCount} équipes, ${Buffer.byteLength(output)} octets`);

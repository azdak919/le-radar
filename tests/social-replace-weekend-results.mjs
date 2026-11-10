#!/usr/bin/env node
import assert from 'node:assert/strict';
import { hasOldWording } from '../scripts/social/replace-weekend-results.mjs';
assert.equal(hasOldWording('🏆 Résultats du week-end (6-8 nov.)'), true);
assert.equal(hasOldWording('🏆 Résultats de la fin de semaine (6-8 nov.)'), false);
assert.equal(hasOldWording(''), false);
console.log('social-replace-weekend-results : OK');

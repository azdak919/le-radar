#!/usr/bin/env node
// Lit un interrupteur de data/social/policy.json (automation.<clé>).
// true seulement si la valeur du dépôt est exactement true. Aucun secret.
import fs from 'node:fs';
const key = process.argv[2];
const policy = JSON.parse(fs.readFileSync(new URL('../../data/social/policy.json', import.meta.url), 'utf8'));
process.stdout.write(policy.automation?.[key] === true ? 'true' : 'false');

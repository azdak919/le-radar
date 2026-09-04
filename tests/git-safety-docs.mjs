#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const agents = read('AGENTS.md');
assert(agents.includes('GIT-AND-TEST-SAFETY.md'), 'AGENTS.md : source de vérité git requise');
assert(/merge and delete/i.test(agents), 'AGENTS.md : merge and delete requis');
assert(/Lien PR cliquable/.test(agents), 'AGENTS.md : lien PR requis');
assert(
  agents.includes('azdak-qc@proton.me') && /Pas.*`gh pr merge`/.test(agents),
  'AGENTS.md : merge local Azdak/proton, pas gh pr merge',
);

const playbook = read('docs/agent-playbook.md');
assert(
  !/push `main` si checks OK/.test(playbook),
  'playbook : plus de push main humain après checks',
);
assert(
  playbook.includes('merge and delete') && playbook.includes('jamais `git push origin main`'),
  'playbook : flux PR / merge and delete requis',
);

const maintenance = read('docs/maintenance.md');
assert(!/push direct contrôlé/.test(maintenance), 'maintenance.md : plus de push direct humain');
assert(/git push --force/.test(maintenance), 'maintenance.md : force-push sur main toujours interdit');
assert(
  maintenance.includes('guard-harvest-freshness.yml'),
  'maintenance.md : gardien de récolte déclaré',
);

const adding = read('docs/adding-news-source.md');
assert(
  !/\|\s*7\s*\|\s*`git commit` \+ `git push`\s*\|\s*Déploiement GitHub Pages/.test(adding),
  'adding-news-source.md : déploiement = PR, pas push main',
);

const windowSrc = read('scripts/maintenance-window.mjs');
assert(
  !windowSrc.includes("console.log('  git push origin main')"),
  'maintenance-window.mjs : ne plus imprimer git push origin main',
);
assert(
  /git push origin HEAD/.test(windowSrc) || /gh pr create/.test(windowSrc),
  'maintenance-window.mjs : push de branche / PR',
);

const readme = read('README.md');
assert(
  !/pousse les changements validés sur `main`/.test(readme),
  'README : plus de publication = push main humain',
);

console.log('OK git-safety-docs');

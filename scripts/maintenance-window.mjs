#!/usr/bin/env node
/**
 * Garde-fou de publication LE-RADAR.
 *
 * Le domaine reste servi via GitHub Pages et son DNS est chez WHC : ce script
 * ne prétend pas activer une page de maintenance au niveau réseau. Il vérifie
 * le résultat public et pilote seulement les workflows GitHub qui écrivent
 * dans main. Les commandes mutantes exigent donc --confirm.
 *
 * Usage:
 *   node scripts/maintenance-window.mjs status [--expect normal|maintenance]
 *   node scripts/maintenance-window.mjs bots pause|resume --confirm
 *   node scripts/maintenance-window.mjs release-check [--maintenance]
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WRITER_WORKFLOWS = [
  '.github/workflows/archive-articles.yml',
  '.github/workflows/discover-news-sources.yml',
  '.github/workflows/maintain.yml',
  '.github/workflows/probe-indigenous-mt.yml',
  '.github/workflows/update-institutions.yml',
  '.github/workflows/update-news.yml',
  '.github/workflows/update-radio-nowplaying.yml',
  '.github/workflows/update-radio-schedules.yml',
  '.github/workflows/update-streams.yml',
];

const PROTECTED_WORKFLOWS = [
  '.github/workflows/quality.yml',
  'dynamic/pages/pages-build-deployment',
];
const SITE_URL = process.env.LE_RADAR_SITE_URL || 'https://le-radar.ca/';

export function classifyPublicMaintenance({ status, location = '', body = '' }) {
  const target = String(location).toLowerCase();
  const html = String(body).toLowerCase();
  return target.includes('offline.html?maintenance=1')
    || /<title>maintenance en cours\s*[—-]\s*le radar<\/title>/.test(html)
    || html.includes('maintenance active — le site reviendra bientôt');
}

export function classifyOperatingState({ publicMaintenance, writerStates }) {
  const allPaused = writerStates.length > 0 && writerStates.every((state) => state === 'disabled_manually');
  const allActive = writerStates.length > 0 && writerStates.every((state) => state === 'active');
  if (publicMaintenance && allPaused) return 'maintenance cohérente';
  if (!publicMaintenance && allActive) return 'normal cohérent';
  return 'INCOHÉRENT';
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function git(args) {
  return run('git', args).trim();
}

function githubWorkflows() {
  try {
    return JSON.parse(run('gh', ['workflow', 'list', '--all', '--json', 'name,state,path,id']));
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Impossible de lire GitHub Actions avec gh : ${detail}`);
  }
}

async function publicState() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${SITE_URL}${SITE_URL.includes('?') ? '&' : '?'}maintenance-check=${Date.now()}`, {
      redirect: 'manual', signal: controller.signal, headers: { 'cache-control': 'no-cache' },
    });
    const location = response.headers.get('location') || '';
    const body = response.status >= 300 && response.status < 400 ? '' : await response.text();
    return { reachable: true, status: response.status, location, maintenance: classifyPublicMaintenance({ status: response.status, location, body }) };
  } catch (error) {
    return { reachable: false, error: error.name === 'AbortError' ? 'délai dépassé' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

function writerState(workflows) {
  const byPath = new Map(workflows.map((workflow) => [workflow.path, workflow]));
  return WRITER_WORKFLOWS.map((path) => ({ path, ...(byPath.get(path) || { state: 'missing', name: path }) }));
}

function printStatus(publicResult, workflows) {
  console.log(`Site public : ${SITE_URL}`);
  if (!publicResult.reachable) {
    console.log(`  inaccessible (${publicResult.error})`);
  } else {
    console.log(`  HTTP ${publicResult.status} — ${publicResult.maintenance ? 'MAINTENANCE ACTIVE' : 'site normal'}`);
    if (publicResult.location) console.log(`  redirection : ${publicResult.location}`);
  }

  const writers = writerState(workflows);
  console.log('\nWorkflows écrivains :');
  for (const workflow of writers) console.log(`  ${workflow.state.padEnd(18)} ${workflow.name}`);
  console.log('\nWorkflows protégés :');
  for (const path of PROTECTED_WORKFLOWS) {
    const workflow = workflows.find((item) => item.path === path);
    console.log(`  ${(workflow?.state || 'missing').padEnd(18)} ${workflow?.name || path}`);
  }
  const operating = publicResult.reachable
    ? classifyOperatingState({ publicMaintenance: publicResult.maintenance, writerStates: writers.map((workflow) => workflow.state) })
    : 'INCONNU';
  console.log(`\nÉtat d’exploitation : ${operating}`);
  return operating;
}

async function status(expected) {
  const [publicResult, workflows] = await Promise.all([publicState(), Promise.resolve(githubWorkflows())]);
  const operating = printStatus(publicResult, workflows);
  if (expected && (!publicResult.reachable || (publicResult.maintenance ? 'maintenance' : 'normal') !== expected)) {
    console.error(`\nÉtat public invalide : attendu « ${expected} ».`);
    process.exitCode = 2;
  }
  if (operating === 'INCOHÉRENT') {
    console.error('\nAction requise : harmoniser la visibilité publique et l’état des bots avant de considérer la publication terminée.');
    process.exitCode = 2;
  }
}

function setBots(action, confirmed) {
  if (!confirmed) throw new Error('Commande refusée : ajoutez --confirm après avoir vérifié le basculement public.');
  const verb = action === 'pause' ? 'disable' : 'enable';
  for (const path of WRITER_WORKFLOWS) {
    console.log(`${verb === 'disable' ? 'Suspension' : 'Réactivation'} : ${path}`);
    run('gh', ['workflow', verb, path]);
  }
  console.log('\nTerminé. Lancez `npm run maintenance:status` pour confirmer l’état complet.');
}

async function releaseCheck(maintenanceExpected) {
  const dirty = git(['status', '--porcelain']);
  const branch = git(['branch', '--show-current']);
  let divergence = 'amont indisponible';
  try { divergence = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']); } catch { /* branche sans amont */ }
  console.log(`Branche : ${branch}`);
  console.log(`Arbre : ${dirty ? 'modifications non commitées' : 'propre'}`);
  console.log(`Divergence amont (behind ahead) : ${divergence}`);
  console.log('\nÀ exécuter avant le push :');
  console.log('  git fetch origin && git rebase origin/main');
  console.log('  npm run check');
  console.log('  # ouvrir les URLs locales touchées et les vérifier');
  console.log('  git push origin HEAD');
  console.log('  gh pr create');
  console.log('\nAprès la PR : Vérification + Pages verts, puis « merge and delete ». `npm run maintenance:status`.');
  await status(maintenanceExpected ? 'maintenance' : undefined);
  if (dirty) process.exitCode = 2;
}

async function main() {
  const [command = 'status', subcommand] = process.argv.slice(2);
  const confirmed = process.argv.includes('--confirm');
  if (command === 'status') {
    const expectedIndex = process.argv.indexOf('--expect');
    const expected = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
    if (expected && !['normal', 'maintenance'].includes(expected)) throw new Error('Valeur de --expect : normal ou maintenance.');
    await status(expected);
    return;
  }
  if (command === 'bots' && ['pause', 'resume'].includes(subcommand)) {
    setBots(subcommand, confirmed);
    return;
  }
  if (command === 'release-check') {
    await releaseCheck(process.argv.includes('--maintenance'));
    return;
  }
  throw new Error('Usage : status | bots pause|resume --confirm | release-check [--maintenance]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Erreur maintenance : ${error.message}`);
    process.exitCode = 1;
  });
}

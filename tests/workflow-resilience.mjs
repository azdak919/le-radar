/**
 * Un workflow planifié sans concurrence, sans timeout ou qui appelle
 * une récolte sans le module de résilience ne peut pas entrer dans le dépôt.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url);
const dir = new URL('.github/workflows/', root);
const EXTERNAL = new Set([
  'fetch-sports.js',
  'fetch-radio-schedules.js',
  'fetch-radio-nowplaying.js',
  'check-radio-health.js',
  'verify-live-links.js',
  'verify-historical-links.js',
  'retro-crawl-historical.js',
  'fetch-news.js',
  'update-institutions.js',
  'discover-sports.js',
  'detect-schedule-drift.js',
  'mirror-release.js',
]);

function read(rel) {
  return readFileSync(new URL(rel, root), 'utf8');
}

function usesResilience(script) {
  const rel = `scripts/${script}`;
  if (!existsSync(new URL(rel, root))) return false;
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file) || !existsSync(new URL(file, root))) return false;
    seen.add(file);
    const src = read(file);
    if (src.includes('external-source-lib')) return true;
    return [...src.matchAll(/require\('\.\/([^']+)'\)/g)].some((match) => walk(`scripts/${match[1]}.js`) || walk(`scripts/${match[1]}`));
  };
  return walk(rel);
}

function jobsOf(yml) {
  const lines = yml.split('\n');
  const jobs = [];
  let inJobs = false;
  let current = null;
  for (const line of lines) {
    if (line.startsWith('jobs:')) { inJobs = true; continue; }
    if (!inJobs) continue;
    if (/^[A-Za-z]/.test(line)) break;
    const job = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (job) {
      current = { name: job[1], body: '' };
      jobs.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  return jobs;
}

for (const file of readdirSync(dir)) {
  if (!file.endsWith('.yml')) continue;
  const yml = read(`.github/workflows/${file}`);
  if (!/^ {2}schedule:/m.test(yml) && !yml.includes('\nschedule:')) continue;
  assert.match(yml, /concurrency:/, `${file} : schedule sans concurrency`);
  const jobs = jobsOf(yml);
  assert.ok(jobs.length, `${file} : aucun job`);
  for (const job of jobs) {
    assert.match(job.body, /timeout-minutes:\s*\d+/, `${file} job ${job.name} : timeout-minutes manquant`);
  }
  const scripts = [...yml.matchAll(/node scripts\/([A-Za-z0-9_.-]+\.js)/g)].map((m) => m[1]);
  for (const script of scripts) {
    if (!EXTERNAL.has(script)) continue;
    assert.equal(usesResilience(script), true, `${file} lance ${script} sans external-source-lib`);
  }
}

assert.equal(usesResilience('fetch-sports.js'), true);
assert.equal(usesResilience('mirror-release.js'), true);
assert.match(read('scripts/bot-prepush-check.sh'), /source-incident\.js/);
assert.match(read('.github/workflows/pages-deploy.yml'), /cancel-in-progress:\s*true/);
assert.match(read('.github/workflows/revue.yml'), /cancel-in-progress:\s*true/);
assert.match(read('.github/workflows/revue.yml'), /group: data-writers-[a-z-]+\n\s*cancel-in-progress: false/);

console.log('workflow-resilience ok');

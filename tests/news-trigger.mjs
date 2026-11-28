import assert from 'node:assert/strict';
import { backupDue, backupStale, decide, newestFeedDate, socialWorkflows } from '../cloudflare/news-trigger/src/lib.js';
import { runBackup, runSocial } from '../cloudflare/news-trigger/src/index.js';
import fs from 'node:fs';
const now = Date.parse('2026-10-27T00:00:00Z');
const upd = now - 20 * 60000;
assert.equal(newestFeedDate('<item><pubDate>Mon, 26 Oct 2026 23:50:00 GMT</pubDate></item>'), Date.parse('2026-10-26T23:50:00Z'));
assert.equal(decide({ now, newsUpdated: upd, active: 1, feedDates: [now] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [upd - 1] }).dispatch, false);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now - 60000] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: now - 61 * 60000, active: 0, feedDates: [] }).dispatch, true);
assert.equal(decide({ now, newsUpdated: upd, active: 0, feedDates: [now + 86400000] }).dispatch, false); // date future ignorée
assert.deepEqual(socialWorkflows('social-bluesky.yml, social-tumblr.yml,'), ['social-bluesky.yml', 'social-tumblr.yml']);
assert.deepEqual(socialWorkflows('social-bluesky.yml'), ['social-bluesky.yml']);
assert.match(fs.readFileSync(new URL('../cloudflare/news-trigger/wrangler.toml', import.meta.url), 'utf8'), /SOCIAL_WORKFLOW = "social-bluesky\.yml,social-tumblr\.yml,social-mastodon\.yml"/);
// runSocial : un dispatch par workflow, « busy » si une passe est en cours
const calls = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => { calls.push([init.method || 'GET', u, init.body]);
  if (/runs\?/.test(u)) return new Response(JSON.stringify({ workflow_runs: [{ status: /tumblr/.test(u) ? 'in_progress' : 'completed' }] }));
  return new Response(null, { status: 204 }); };
const slot = Date.parse('2026-11-01T17:05:00Z'); // 12:05 Toronto
const rs = await runSocial({ REPO: 'o/r', GH_TOKEN: 'x', SOCIAL_WORKFLOW: 'social-bluesky.yml,social-tumblr.yml' }, slot);
assert.deepEqual(rs, { social: 'dispatch', 'social-bluesky.yml': 204, 'social-tumblr.yml': 'busy' });
assert.equal(calls.filter(c => c[0] === 'POST').length, 1);
calls.length = 0;
assert.deepEqual(await runSocial({ REPO: 'o/r', GH_TOKEN: 'x', SOCIAL_WORKFLOW: 'social-mastodon.yml' }, slot), { social: 'dispatch', 'social-mastodon.yml': 204 });
assert.deepEqual(JSON.parse(calls.find(c => c[0] === 'POST')[2]), { ref: 'main', inputs: { dry_run: 'false' } }, 'Mastodon : passe réelle, pas l’essai par défaut');
assert.deepEqual(await runSocial({ SOCIAL_WORKFLOW: 'a.yml' }, Date.parse('2026-11-02T08:05:00Z')), { social: 'idle' }, '3 h à Toronto : calme');
// 19 h 23 HNE : La une est due si la dernière passe a plus de 45 min. Buffer est hors fenêtre.
const soir = Date.parse('2026-11-23T00:23:00Z');
assert.equal(backupDue(soir, 'une'), true);
assert.equal(backupDue(soir, 'buffer'), false);
assert.equal(backupDue(Date.parse('2026-11-22T17:00:00Z'), 'une'), false, 'midi : hors fenêtre');
assert.equal(backupStale({ lastStatus: 'in_progress', now: soir, maxAgeMin: 45 }), false);
calls.length = 0;
const old = new Date(soir - 90 * 60000).toISOString();
globalThis.fetch = async (u, init = {}) => { calls.push([init.method || 'GET', u, init.body]);
  if (/runs\?/.test(u)) return new Response(JSON.stringify({ workflow_runs: [{ status: 'completed', created_at: /revue/.test(u) ? new Date(soir).toISOString() : old }] }));
  return new Response(null, { status: 204 }); };
const bk = await runBackup({ REPO: 'o/r', GH_TOKEN: 'x' }, soir);
assert.equal(bk['social-une.yml'], 204);
assert.equal(bk['revue.yml'], 'recent');
assert.equal(bk['social-buffer.yml'], 'hors-fenetre');
assert.deepEqual(JSON.parse(calls.find(c => c[0] === 'POST')[2]), { ref: 'main', inputs: { dry_run: 'false', slot: 'auto' } });
globalThis.fetch = realFetch;
console.log('news-trigger ok');
// Secours des stories sport et de la revue sur les réseaux (28 nov. 2026).
{
  const { BACKUP } = await import('../cloudflare/news-trigger/src/index.js');
  assert.ok(BACKUP.some((b) => b.file === 'social-match-story.yml' && b.inputs.dry_run === 'false'));
  assert.ok(BACKUP.some((b) => b.file === 'social-revue.yml' && b.inputs.dry_run === 'false'));
  const at = (iso) => Date.parse(iso);
  assert.equal(backupDue(at('2026-11-28T12:05:00Z'), 'story'), true, '7 h 05 HNE : stories à préparer');
  assert.equal(backupDue(at('2026-11-28T11:35:00Z'), 'story'), false, '6 h 35 : trop tôt');
  assert.equal(backupDue(at('2026-11-28T17:05:00Z'), 'revue-social'), true, '12 h 05 : revue du matin');
  assert.equal(backupDue(at('2026-11-28T20:05:00Z'), 'revue-social'), false, '15 h 05 : hors fenêtre');
  assert.equal(backupDue(at('2026-11-29T00:35:00Z'), 'revue-social'), true, '19 h 35 : revue du soir');
  const src = fs.readFileSync(new URL('../cloudflare/news-trigger/src/index.js', import.meta.url), 'utf8');
  assert.match(src, /\.slice\(0, 20\)/, '20 flux au plus (50 sous-requêtes par passage, forfait gratuit)');
  assert.equal((fs.readFileSync(new URL('../cloudflare/news-trigger/wrangler.toml', import.meta.url), 'utf8').match(/crons = \[([^\]]*)\]/)[1].match(/"/g) || []).length / 2, 2, 'toujours 2 crons Cloudflare (5 au plus par compte)');
}

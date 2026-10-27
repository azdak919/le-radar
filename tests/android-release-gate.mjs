import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const G = createRequire(import.meta.url)('../scripts/android-release-gate-lib.js');
assert.deepEqual(G.appChanges(['news.json', 'sports.json', 'assets/news-images/a.jpg', 'data/x.json']), []);
assert.deepEqual(G.appChanges(['android/app/src/main/java/A.java', 'news.json']), ['android/app/src/main/java/A.java']);
assert.equal(G.nextVersion('1.2.4'), '1.2.5');
assert.equal(G.nextVersion('1.2.4', 'minor'), '1.3.0');
assert.ok(G.bumpOk('1.2.4', '1.2.5', 9, 10));
assert.ok(G.bumpOk('1.2.4', '1.3.0', 9, 10));
assert.ok(!G.bumpOk('1.2.4', '2.0.0', 9, 10), 'jamais majeure');
assert.ok(!G.bumpOk('1.2.4', '1.2.5', 9, 9), 'versionCode doit augmenter');
assert.ok(!G.bumpOk('1.2.4', '1.2.7', 9, 10), 'pas de saut');
assert.ok(!G.monthlyOk('2026-10-25T00:00:00Z', new Date('2026-10-27T00:00:00Z')));
assert.ok(G.monthlyOk('2026-10-25T00:00:00Z', new Date('2026-11-01T08:00:00Z')));
const ok = { changes: ['android/x'], bump: { prev: '1.2.4', next: '1.2.5', prevCode: 9, nextCode: 10 }, lastTagIso: '2026-10-25T00:00:00Z', now: new Date('2026-11-01T08:00:00Z'), verification: 'success', mobile: 'success', gmsClasses: 0 };
assert.equal(G.decide(ok).release, true);
for (const [k, v] of [['changes', []], ['verification', 'failure'], ['mobile', 'failure'], ['gmsClasses', 3], ['gmsClasses', null], ['now', new Date('2026-10-30T00:00:00Z')]]) {
  const d = G.decide({ ...ok, [k]: v });
  assert.equal(d.release, false, k); assert.ok(d.fails.length >= 1);
}
console.log('android-release-gate ok');

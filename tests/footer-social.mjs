// Pied de page : liens des réseaux sociaux de LE-RADAR.ca (nav-shell.js).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../nav-shell.js', import.meta.url), 'utf8');
const m = src.match(/const SOCIAL_LINKS = (\[[\s\S]*?\n  \]);/);
assert.ok(m, 'SOCIAL_LINKS introuvable dans nav-shell.js');
const links = vm.runInNewContext(m[1]);
const expected = {
  x: 'https://x.com/LeRadar_ca',
  bluesky: 'https://bsky.app/profile/le-radar.bsky.social',
  facebook: 'https://www.facebook.com/profile.php?id=61596092762097',
  linkedin: 'https://www.linkedin.com/company/le-radar-ca/',
  tumblr: 'https://leradar-ca.tumblr.com',
  rss: 'https://le-radar.ca/feed.xml',
};
const on = links.filter((l) => l.enabled);
assert.deepEqual([...on.map((l) => l.id)], Object.keys(expected), 'réseaux actifs / ordre');
for (const l of on) {
  assert.equal(l.href, expected[l.id], `lien ${l.id}`);
  assert.match(l.label, /LE-RADAR\.ca/, `aria-label ${l.id}`);
  assert.ok(l.path.length > 20 && /^0 0 \d+ \d+$/.test(l.viewBox), `icône ${l.id}`);
}
const masto = links.find((l) => l.id === 'mastodon');
assert.ok(masto && masto.enabled === false, 'Mastodon prêt mais désactivé');
assert.match(src, /a\.rel = 'me noopener'/);
assert.doesNotMatch(src, /tison/i);
assert.ok(fs.existsSync(new URL('../assets/social-icons/LICENSE.md', import.meta.url)));
console.log('footer-social: OK');

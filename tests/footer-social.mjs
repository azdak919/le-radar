// Pied de page : liens des réseaux sociaux de LE-RADAR.ca (nav-shell.js).
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../nav-shell.js', import.meta.url), 'utf8');
const m = src.match(/const SOCIAL_LINKS = (\[[\s\S]*?\n  \]);/);
assert.ok(m, 'SOCIAL_LINKS introuvable dans nav-shell.js');
const links = vm.runInNewContext(m[1]);
const expected = {
  x: 'https://x.com/le_radar_ca',
  bluesky: 'https://bsky.app/profile/le-radar.ca',
  facebook: 'https://www.facebook.com/profile.php?id=61596092762097',
  linkedin: 'https://www.linkedin.com/company/le-radar-ca/',
  tumblr: 'https://le-radar-ca.tumblr.com',
  mastodon: 'https://piaille.fr/@leradar',
  instagram: 'https://www.instagram.com/le.radar.ca/',
  rss: 'https://le-radar.ca/feed.xml',
};
const on = links.filter((l) => l.enabled);
assert.deepEqual([...on.map((l) => l.id)], Object.keys(expected), 'réseaux actifs / ordre');
for (const l of on) {
  assert.equal(l.href, expected[l.id], `lien ${l.id}`);
  assert.match(l.label, /LE-RADAR\.ca/, `aria-label ${l.id}`);
  assert.ok(l.path.length > 20 && /^0 0 \d+ \d+$/.test(l.viewBox), `icône ${l.id}`);
}
assert.match(src, /a\.rel = 'me noopener'/);
const ig = on.find((l) => l.id === 'instagram');
const svg = fs.readFileSync(new URL('../assets/social-icons/instagram.svg', import.meta.url), 'utf8');
assert.ok(svg.includes(ig.path.slice(0, 40)), 'le SVG Instagram est le tracé du pied');
assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /https:\/\/www\.instagram\.com\/le\.radar\.ca\//);
assert.match(fs.readFileSync(new URL('../scripts/revue/revue-render.js', import.meta.url), 'utf8'), /instagram\.com\/le\.radar\.ca/);
assert.match(fs.readFileSync(new URL('../THIRD_PARTY.md', import.meta.url), 'utf8'), /CC0/);
assert.doesNotMatch(src, /tison/i);
assert.ok(fs.existsSync(new URL('../assets/social-icons/LICENSE.md', import.meta.url)));
console.log('footer-social: OK');

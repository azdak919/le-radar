// Pied de page : liens des réseaux sociaux de LE-RADAR.ca (nav-shell.js).
import privacyGuard from '../scripts/privacy-guard.js';
const hasForbidden = (t) => privacyGuard.containsForbiddenName(t, ['dupont']);
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../nav-shell.js', import.meta.url), 'utf8');
const m = src.match(/const SOCIAL_LINKS = (\[[\s\S]*?\n  \]);/);
assert.ok(m, 'SOCIAL_LINKS introuvable dans nav-shell.js');
const links = vm.runInNewContext(m[1]);
const expected = {
  buymeacoffee: 'https://www.buymeacoffee.com/azdak',
  instagram: 'https://www.instagram.com/le.radar.ca/',
  facebook: 'https://www.facebook.com/profile.php?id=61596092762097',
  linkedin: 'https://www.linkedin.com/company/le-radar-ca/',
  x: 'https://x.com/le_radar_ca',
  bluesky: 'https://bsky.app/profile/le-radar.ca',
  mastodon: 'https://piaille.fr/@leradar',
  tumblr: 'https://le-radar-ca.tumblr.com',
  rss: 'https://le-radar.ca/feed.xml',
};
const on = links.filter((l) => l.enabled);
assert.deepEqual([...on.map((l) => l.id)], Object.keys(expected), 'réseaux actifs / ordre');
for (const l of on) {
  assert.equal(l.href, expected[l.id], `lien ${l.id}`);
  assert.match(l.label, /LE-RADAR\.ca/, `aria-label ${l.id}`);
  assert.ok(l.path.length > 20 && /^0 0 \d+ \d+$/.test(l.viewBox), `icône ${l.id}`);
}
assert.match(src, /a\.rel = s\.rel \|\| 'me noopener'/);
const ig = on.find((l) => l.id === 'instagram');
const svg = fs.readFileSync(new URL('../assets/social-icons/instagram.svg', import.meta.url), 'utf8');
assert.ok(svg.includes(ig.path.slice(0, 40)), 'le SVG Instagram est le tracé du pied');
const bmc = on.find((l) => l.id === 'buymeacoffee');
const bmcSvg = fs.readFileSync(new URL('../assets/social-icons/buymeacoffee.svg', import.meta.url), 'utf8');
assert.ok(bmcSvg.includes(bmc.path.slice(0, 40)), 'le SVG Buy Me a Coffee est le tracé du pied');
assert.equal(bmc.rel, 'noopener noreferrer');
assert.match(src, /www\.buymeacoffee\.com\/azdak/);
const sameAsOrder = [
  'https://www.instagram.com/le.radar.ca/',
  'https://www.facebook.com/profile.php?id=61596092762097',
  'https://www.linkedin.com/company/le-radar-ca/',
  'https://x.com/le_radar_ca',
  'https://bsky.app/profile/le-radar.ca',
  'https://piaille.fr/@leradar',
  'https://le-radar-ca.tumblr.com',
  'https://le-radar.ca/feed.xml',
];
const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const revueSrc = fs.readFileSync(new URL('../scripts/revue/revue-render.js', import.meta.url), 'utf8');
const orgBlock = indexHtml.slice(indexHtml.indexOf('"sameAs"'), indexHtml.indexOf('<!-- RADAR:SEO:JSONLD:START -->'));
assert.deepEqual([...orgBlock.matchAll(/https:\/\/[^\"]+/g)].map((m) => m[0]), sameAsOrder, 'sameAs accueil');
assert.doesNotMatch(orgBlock, /buymeacoffee/i);
const revueBlock = revueSrc.slice(revueSrc.indexOf('sameAs:'), revueSrc.indexOf('function reviewJsonLd'));
assert.doesNotMatch(revueBlock, /buymeacoffee/i);
const revueUrls = [...revueBlock.matchAll(/'([^']+)'|`\$\{SITE\}\/feed\.xml`/g)].map((m) => m[1] || 'https://le-radar.ca/feed.xml');
assert.deepEqual(revueUrls, sameAsOrder, 'sameAs revue');
assert.match(src, /injectMastheadSocial/);
assert.match(src, /s\.id !== 'rss'/);
assert.doesNotMatch(indexHtml, /masthead-rss/);

assert.match(fs.readFileSync(new URL('../THIRD_PARTY.md', import.meta.url), 'utf8'), /CC0/);
assert.ok(!hasForbidden(src));
assert.ok(fs.existsSync(new URL('../assets/social-icons/LICENSE.md', import.meta.url)));
console.log('footer-social: OK');

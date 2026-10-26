// Lot D : seul fetch-news écrit news-archive.json ; les autres bots passent
// par data/archive-inbox/<bot>.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../scripts/archive-inbox-lib.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'));
const base = { schemaVersion: 1, records: [
  { id: 'a', publishedAt: '2026-10-01T00:00:00Z', link: { status: 'unknown' } },
  { id: 'b', publishedAt: '2026-09-01T00:00:00Z' },
] };
const after = JSON.parse(JSON.stringify(base));
after.records[1].link = { status: 'available' };
after.records.push({ id: 'c', publishedAt: '2026-09-15T00:00:00Z' });
assert.equal(lib.queueArchiveChanges('retro-crawl', base, after, root), 2);
let pending = lib.pendingBatches(root);
assert.equal(pending.length, 1);
const merged = lib.applyBatches(base, pending);
assert.deepEqual(merged.catalog.records.map((r) => r.id), ['a', 'c', 'b'], 'tri publishedAt desc');
assert.equal(merged.catalog.records[2].link.status, 'available');
assert.deepEqual(merged.applied, { 'retro-crawl': 1 });
assert.equal(lib.withPendingInboxes(base, root).records.length, 3);
lib.writeApplied(merged.applied, root);
assert.equal(lib.pendingBatches(root).length, 0, 'lot fusionné = plus en attente');
// Le bot purge ses lots fusionnés à son passage suivant.
lib.queueArchiveChanges('retro-crawl', merged.catalog, merged.catalog, root);
assert.equal(lib.readInbox('retro-crawl', root).batches.length, 0);

// Aucun autre workflow ne publie l'archive, le fil, le RSS ni le SEO.
const W = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.github', 'workflows');
for (const f of ['guard-harvest-freshness.yml', 'discover-news-sources.yml', 'verify-live-links.yml', 'retro-crawl-historical.yml', 'verify-historical-links.yml', 'maintain.yml']) {
  const y = fs.readFileSync(path.join(W, f), 'utf8');
  const adds = [...y.matchAll(/git add[^\n]*(?:\\\n[^\n]*)*/g)].map((m) => m[0]).join('\n');
  for (const owned of ['news.json', 'news-archive.json', 'feed.xml', 'sitemap.xml', 'llms.txt']) {
    assert.ok(!new RegExp(`(^|[\\s/])${owned.replace('.', '\\.')}`).test(adds), `${f} ne publie pas ${owned}`);
  }
  assert.doesNotMatch(y, /fetch-news\.js|generate-feed\.js/, `${f} ne récolte pas les nouvelles`);
}
// Update Student News : un fichier de données absent ne doit pas faire
// sauter tout le `git add` (news.json resterait hors du commit).
{
  const y = fs.readFileSync(path.join(W, 'update-news.yml'), 'utf8');
  assert.doesNotMatch(y, /git add "\$\{DATA_FILES\[@\]\}"/, 'update-news.yml ajoute DATA_FILES un par un (chemins existants seulement)');
  assert.match(y, /for f in "\$\{DATA_FILES\[@\]\}"; do\s*if \[ -e "\$f" \]; then git add -- "\$f"; fi/, 'boucle git add sur les chemins existants');
}
console.log('OK archive-inbox');

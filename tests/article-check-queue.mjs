#!/usr/bin/env node

/**
 * File de vérification par article (article-check-queue-lib) : le neuf
 * d'abord, puis l'arriéré le plus anciennement vérifié, lot fixe par passe.
 *
 * Contexte : PR 431 garde toute la session (~1 000 articles). Les étapes qui
 * revisitaient chaque article à chaque passe faisaient annuler le job à
 * 25 min (17 nov. 2026). Logique pure, aucun réseau.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildCheckQueue, createDeadline } = require('../scripts/article-check-queue-lib.js');
const { buildImageQueue, imageHealthSig } = require('../scripts/check-news-images.js');
const { buildLeadQueue, leadImageSig } = require('../scripts/ensure-lead-images.js');
const { buildAuthorQueue } = require('../scripts/verify-authors.js');

const D = (n) => new Date(Date.UTC(2026, 10, n)).toISOString();

// ── 1. Neufs d'abord (récents en tête), puis arriéré le plus ancien ─────────
{
  const items = [
    { id: 'old-checked', date: D(1), checked: D(10) },
    { id: 'new-a', date: D(5) },
    { id: 'oldest-checked', date: D(2), checked: D(3) },
    { id: 'new-b', date: D(9) },
  ];
  const q = buildCheckQueue({ items, isNew: (i) => !i.checked, checkedAt: (i) => i.checked, reserveBacklog: 0 });
  assert.deepEqual(q.batch.map((i) => i.id), ['new-b', 'new-a', 'oldest-checked', 'old-checked']);
  assert.equal(q.fresh, 2);
  assert.equal(q.backlog, 2);
  assert.equal(q.deferred, 0);
}

// ── 2. Lot fixe : ~1 000 articles neufs → la passe en prend N, le reste attend
{
  const items = Array.from({ length: 1000 }, (_, k) => ({ id: k, date: D(1 + (k % 28)) }));
  const q = buildCheckQueue({ items, isNew: () => true, size: 80 });
  assert.equal(q.batch.length, 80);
  assert.equal(q.deferred, 920);
}

// ── 3. Réserve d'arriéré : une rafale de neufs n'affame pas les anciens ─────
{
  const fresh = Array.from({ length: 500 }, (_, k) => ({ id: `n${k}`, date: D(10) }));
  const old = Array.from({ length: 50 }, (_, k) => ({ id: `o${k}`, date: D(1), checked: D(2) }));
  const q = buildCheckQueue({ items: [...fresh, ...old], isNew: (i) => !i.checked, checkedAt: (i) => i.checked, size: 100 });
  assert.equal(q.batch.length, 100);
  assert.equal(q.batch.filter((i) => i.checked).length, 25, '25 % réservés à l\'arriéré');
  // Peu de neufs : l'arriéré remplit la place libre.
  const q2 = buildCheckQueue({ items: [...fresh.slice(0, 10), ...old], isNew: (i) => !i.checked, checkedAt: (i) => i.checked, size: 40 });
  assert.equal(q2.batch.length, 40);
  assert.equal(q2.batch.filter((i) => !i.checked).length, 10);
}

// ── 4. Pas encore dû : hors file ─────────────────────────────────────────────
{
  const q = buildCheckQueue({ items: [{ checked: D(16) }], isNew: () => false, isDue: () => false });
  assert.equal(q.batch.length, 0);
  assert.equal(q.deferred, 0);
}

// ── 5. Chrono de passe ───────────────────────────────────────────────────────
{
  let t = 0;
  const d = createDeadline(1000, () => t);
  assert.equal(d.over(), false);
  t = 999; assert.equal(d.left(), 1);
  t = 1000; assert.equal(d.over(), true);
}

// ── 6. Vignettes : carte sondée et inchangée = hors file pendant 24 h ───────
{
  const now = Date.parse(D(17));
  const fresh = { image: 'https://x.ca/a.jpg', date: D(16) };
  const done = { image: 'https://x.ca/b.jpg', date: D(15), imageHealthAt: new Date(now - 3600e3).toISOString() };
  done.imageHealthKey = imageHealthSig(done);
  const changed = { ...done, image: 'https://x.ca/c.jpg' };
  const stale = { image: 'https://x.ca/d.jpg', date: D(1), imageHealthAt: D(14) };
  stale.imageHealthKey = imageHealthSig(stale);
  const q = buildImageQueue([fresh, done, changed, stale, { date: D(16) }], { now });
  assert.ok(q.batch.includes(fresh));
  assert.ok(q.batch.includes(changed), 'image changée → revérifiée');
  assert.ok(q.batch.includes(stale), 'sondée il y a > 24 h → arriéré');
  assert.ok(!q.batch.includes(done), 'sondée il y a 1 h, inchangée → sautée');
  assert.equal(q.batch.length, 3);
}

// ── 7. Photos de une : même règle, lot plafonné ─────────────────────────────
{
  const now = Date.parse(D(17));
  const items = Array.from({ length: 1000 }, (_, k) => ({ image: `https://x.ca/${k}.jpg`, date: D(1 + (k % 16)) }));
  for (const it of items.slice(0, 600)) { it.leadImageCheckedKey = leadImageSig(it); it.leadImageCheckedAt = new Date(now - 3600e3).toISOString(); }
  const q = buildLeadQueue(items, { now, size: 120 });
  assert.equal(q.fresh, 400);
  assert.equal(q.backlog, 0);
  assert.equal(q.batch.length, 120);
  assert.ok(q.batch.every((it) => !it.leadImageCheckedKey));
}

// ── 8. Auteurs : page jamais consultée d'abord, tentative ratée en fin ───────
{
  const never = { link: 'https://x.ca/never/', author: '', date: D(10) };
  const failed = { link: 'https://x.ca/failed/', author: '', date: D(16), authorAttemptAt: D(16) };
  const recent = { link: 'https://x.ca/recent/', author: '', date: D(16), authorCheckedAt: new Date().toISOString() };
  const q = buildAuthorQueue([failed, never, recent], new Map(), new Map(), { size: 10 });
  assert.deepEqual(q.batch, [never, failed]);
  assert.ok(!q.batch.includes(recent), 'consultée < 24 h : pas de nouveau scrape');
}

console.log('article-check-queue: OK');

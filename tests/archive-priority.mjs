#!/usr/bin/env node

/**
 * Ordre d'archivage : la fragilité d'abord, sans affamer la fraîcheur.
 *
 * Logique pure, aucun réseau — les chiffres de fragilité sont ceux mesurés le
 * 2026-07-26 sur l'index CDX, pour que le test décrive la réalité du corpus et
 * pas un cas d'école.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { orderCandidates, fragilityScore, fragilityRanking } = require('../scripts/archive-priority-lib.js');

// Fragilité réelle mesurée (pages d'index CDX).
const FRAGILITY = {
  Exil: { host: 'exilecvm.wordpress.com', pages: 1 },
  'The Plant': { host: 'theplantnews.com', pages: 3 },
  'La Pige': { host: 'lapige.atmjonquiere.com', pages: 8 },
  'Quartier Libre': { host: 'quartierlibre.ca', pages: 38 },
  'The McGill Daily': { host: 'www.mcgilldaily.com', pages: 229 },
  // Volontairement sans mesure : source neuve ou mesure en échec.
  'Nouveau Journal': { host: 'exemple.test' },
};

const D = (n) => new Date(Date.UTC(2026, 6, n)).toISOString();

// ── 1. À date égale, la source fragile passe devant ────────────────────────
{
  const items = [
    { url: 'https://mcgilldaily/a', source: 'The McGill Daily', date: D(20) },
    { url: 'https://exil/a', source: 'Exil', date: D(20) },
    { url: 'https://quartierlibre/a', source: 'Quartier Libre', date: D(20) },
  ];
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0 });
  assert.deepEqual(
    out.map((i) => i.source),
    ['Exil', 'Quartier Libre', 'The McGill Daily'],
    'à date égale, l’ordre doit suivre la fragilité croissante',
  );
}

// ── 2. Une source non mesurée est neutre, jamais prioritaire ───────────────
{
  const items = [
    { url: 'https://nouveau/a', source: 'Nouveau Journal', date: D(20) },
    { url: 'https://exil/a', source: 'Exil', date: D(20) },
    { url: 'https://mcgilldaily/a', source: 'The McGill Daily', date: D(20) },
  ];
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0 });
  assert.equal(out[0].source, 'Exil', 'la fragilité mesurée passe avant l’inconnu');
  assert.equal(
    out.at(-1).source, 'Nouveau Journal',
    'une source sans mesure ne doit pas être promue en tête de file',
  );
  assert.equal(fragilityScore('Nouveau Journal', FRAGILITY), Number.POSITIVE_INFINITY);
  assert.equal(fragilityScore('Inexistante', FRAGILITY), Number.POSITIVE_INFINITY);
}

// ── 3. La réserve de fraîcheur protège les articles récents ────────────────
{
  const items = [
    // Le plus récent vient de la source la MIEUX archivée : sans réserve, il
    // serait relégué derrière tout le rattrapage des sources fragiles.
    { url: 'https://mcgilldaily/frais', source: 'The McGill Daily', date: D(26) },
    { url: 'https://exil/vieux1', source: 'Exil', date: D(1) },
    { url: 'https://exil/vieux2', source: 'Exil', date: D(2) },
    { url: 'https://exil/vieux3', source: 'Exil', date: D(3) },
  ];
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0.25, size: 4 });
  assert.equal(out.length, 4);
  assert.ok(
    out.some((i) => i.url === 'https://mcgilldaily/frais'),
    'l’article le plus récent doit rester dans le lot',
  );
  assert.equal(out[0].source, 'Exil', 'le gros du lot reste piloté par la fragilité');
}

// ── 3bis. Vivier bien plus grand que le lot : le cas réel ──────────────────
// En production ~190 articles pour un lot de 20. Si la réserve était
// concaténée après la file de fragilité, elle ne serait jamais atteinte et la
// protection de la fraîcheur ne servirait à rien.
{
  const items = [];
  for (let i = 0; i < 100; i += 1) {
    items.push({ url: `https://exil/v${i}`, source: 'Exil', date: D(1) });
  }
  items.push({ url: 'https://mcgilldaily/frais', source: 'The McGill Daily', date: D(28) });

  const size = 20;
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0.25, size });
  const lot = out.slice(0, size);

  assert.ok(
    lot.some((i) => i.url === 'https://mcgilldaily/frais'),
    'la réserve de fraîcheur doit tenir DANS le lot, pas après lui',
  );
  const nbExil = lot.filter((i) => i.source === 'Exil').length;
  assert.ok(nbExil >= size * 0.7, `le gros du lot reste sur la source fragile (${nbExil}/${size})`);
}

// ── 4. Sans réserve, la fraîcheur ne prime jamais sur la fragilité ─────────
{
  const items = [
    { url: 'https://mcgilldaily/frais', source: 'The McGill Daily', date: D(26) },
    { url: 'https://exil/vieux', source: 'Exil', date: D(1) },
  ];
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0 });
  assert.equal(out[0].url, 'https://exil/vieux');
}

// ── 5. Pas de doublon d'URL, quel que soit le partage ─────────────────────
{
  const items = [
    { url: 'https://exil/a', source: 'Exil', date: D(10) },
    { url: 'https://exil/a', source: 'Exil', date: D(10) },
    { url: 'https://plant/a', source: 'The Plant', date: D(26) },
  ];
  const out = orderCandidates({ items, fragility: FRAGILITY, reserveRecent: 0.5, size: 3 });
  assert.equal(new Set(out.map((i) => i.url)).size, out.length, 'aucune URL ne doit sortir deux fois');
}

// ── 6. Cas dégénérés ───────────────────────────────────────────────────────
{
  assert.deepEqual(orderCandidates({ items: [] }), []);
  assert.deepEqual(orderCandidates({}), []);
  const sansSource = [{ url: 'https://x/a', date: D(5) }];
  assert.equal(orderCandidates({ items: sansSource, fragility: FRAGILITY }).length, 1);
  // Une entrée sans url est ignorée plutôt que de faire échouer la passe.
  assert.equal(orderCandidates({ items: [{ source: 'Exil' }], fragility: FRAGILITY }).length, 0);
}

// ── 7. Classement lisible : du plus menacé au mieux couvert ────────────────
{
  const rank = fragilityRanking(FRAGILITY);
  assert.equal(rank[0].source, 'Exil');
  assert.equal(rank[0].pages, 1);
  assert.equal(
    rank.at(-1).source, 'Nouveau Journal',
    'les sources non mesurées sont reléguées en fin de classement',
  );
  const mesurees = rank.filter((r) => r.pages !== null).map((r) => r.pages);
  assert.deepEqual(mesurees, [...mesurees].sort((a, b) => a - b), 'classement croissant');
}

console.log(`OK priorité d'archivage (${Object.keys(FRAGILITY).length} sources, réserve fraîcheur)`);

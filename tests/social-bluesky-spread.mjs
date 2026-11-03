// Bluesky et Tumblr : aucun article frais sauté pour « variété » ; une même source est étalée
// (tourniquet), l'excédent attend ; volume placé aux pointes ; un article proche de 24 h passe en tête.
import assert from 'node:assert/strict';
import { plan, NETWORKS } from '../scripts/social/rate-limit.mjs';
import { weightAt } from '../scripts/social/schedule.mjs';

const it = (id, source, hAgo, now) => ({ id, source, title: `${source} article ${id}`, link: `https://ex.org/${id}`, date: now - hAgo * 3600e3 });
const live = '2026-10-01T00:00:00Z'; // rodage terminé

for (const network of ['bluesky', 'tumblr']) {
  assert.ok(NETWORKS[network].spread, `${network} : étalement`);
  assert.ok(NETWORKS[network].perDay >= 50, `${network} : plafond ≥ volume réel du flux`);
  if (network === 'tumblr') assert.ok(NETWORKS.tumblr.perDay < 250, 'Tumblr : sous 250/jour');

  // Simulation sur 24 h, passages toutes les 30 min : 10 articles de A + 2 de B, moissonnés à 7 h HNE.
  const t0 = Date.parse('2026-11-03T12:00:00Z'); // mardi 7 h HNE
  const items = [...Array.from({ length: 10 }, (_, i) => it('a' + i, 'A', 0.1 * i, t0)), it('b0', 'B', 0.05, t0), it('b1', 'B', 0.15, t0)];
  const sent = {}, order = [], when = [];
  for (let t = t0 + 60e3; t < t0 + 864e5; t += 30 * 60e3) {
    const p = plan(items, sent, { network, liveSince: live, now: t });
    assert.equal(p.skip.length, 0, `${network} : aucun saut`);
    if (weightAt(network, t) === 0) assert.equal(p.now.length, 0, 'heures calmes : rien');
    for (const x of p.now) { assert.ok(!sent[x.id], 'jamais deux fois'); sent[x.id] = { at: new Date(t).toISOString(), source: x.source, uri: 'at://' + x.id }; order.push(x.source); when.push(t); }
  }
  assert.equal(order.length, 12, `${network} : tout est parti avant 24 h`);
  assert.ok(order.slice(0, 4).includes('B'), `${network} : B intercalé tôt (tourniquet)`);
  const first = plan(items, {}, { network, liveSince: live, now: t0 + 60e3 });
  assert.ok(first.now.length < 12 && first.hold.length > 0, `${network} : pas tout dès la moisson`);

  // Urgence : article de 23 h 50 à 23 h 50 HNE (heures calmes ensuite) → part maintenant.
  const late = Date.parse('2026-11-04T04:50:00Z'); // mardi 23 h 50 HNE
  const old = it('old', 'C', 23.9, late), fresh = it('new', 'D', 0.1, late);
  const pu = plan([fresh, old], {}, { network, liveSince: live, now: late });
  assert.equal(pu.now[0]?.id, 'old', `${network} : article sur le point d'expirer en tête`);
}
console.log('social-bluesky-spread: OK');

// Tumblr sans rodage : 5 publiés en 24 h au lieu de tout le frais (3 nov. 2026).
{
  const { effectiveLimits } = await import('../scripts/social/schedule.mjs');
  const { NETWORKS: LIMITS } = await import('../scripts/social/rate-limit.mjs');
  const t = Date.parse('2026-11-03T18:30:00Z');
  const lim = effectiveLimits(LIMITS.tumblr, { network: 'tumblr', liveSince: '2026-11-03T00:00:00Z', now: t });
  if (lim.ramp !== 1) throw new Error('Tumblr : pas de rodage');
}

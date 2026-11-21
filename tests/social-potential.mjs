#!/usr/bin/env node
// Potentiel gratuit : drapeaux éteints, fil X, plusieurs images, texte alternatif borné.
// Aucun appel réseau : le faux fetch ne quitte pas le processus.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POLICY } from '../scripts/social/policy.mjs';
import { buildXText, xlen, siteLink } from '../scripts/social/lib.mjs';
import { ALT_MAX, articleAlt, capAlt, clipChars, galleryFrom, potentialFlags, withUtm, xThread, X_THREAD_MAX } from '../scripts/social/potential.mjs';
import { createXBuffer } from '../scripts/social/channels/x-buffer.mjs';
import { renderPreview } from '../scripts/social/potential-preview.mjs';

const flags = potentialFlags();
assert.equal(flags.xThread, false);
assert.equal(flags.utm, false);
assert.equal(flags.facebookImages, 0);
assert.equal(flags.linkedinImages, 0);
assert.equal(POLICY.potential.xThread, false);
assert.equal(POLICY.potential.facebookImages.enabled, false);
assert.equal(POLICY.potential.linkedinImages.enabled, false);
assert.equal(potentialFlags({ potential: { facebookImages: { enabled: true, max: 99 } } }).facebookImages, 10);
assert.equal(potentialFlags({ potential: { linkedinImages: { enabled: true, max: 4 } } }).linkedinImages, 4);
assert.equal(potentialFlags({ potential: { xThread: 'oui' } }).xThread, false);

const it = {
  title: 'La vie lors d’une régate d’aviron',
  bare: 'La vie lors d’une régate d’aviron',
  source: 'Quartier Libre',
  author: 'Charles-David Desrochers',
  link: 'https://quartierlibre.ca/la-vie-lors-dune-regate-aviron/',
  desc: 'Des rameurs ont effectué une course de cinq kilomètres sur la rivière Rideau. Les bateaux ont été inspectés avant le départ. La journée s’est terminée au retour des équipages.',
  credit: 'Quartier Libre',
};
const alt = articleAlt(it, 'linkedin', { credit: it.credit });
assert.ok(alt.includes('La vie lors d’une régate d’aviron'));
assert.ok(alt.includes('Quartier Libre'));
assert.ok(alt.includes('Charles-David Desrochers'));
assert.ok(alt.includes('Photo : Quartier Libre'));
assert.ok([...alt].length <= ALT_MAX.linkedin);
assert.equal(articleAlt({ title: 'Seul titre' }, 'x'), '« Seul titre ».');
assert.ok([...capAlt('é'.repeat(500), 'linkedin')].length <= 300);
assert.ok([...clipChars('a'.repeat(50), 10)].length <= 10);

const long = {
  ...it,
  source: 'Le Délit',
  desc: 'Première phrase complète qui ajoute un fait absent du titre sur la rivière et les bateaux. Deuxième phrase décrit le retour des équipages après la course. Troisième phrase précise que les rameurs ont remis le matériel avant de quitter le site.',
};
const thread = xThread(long, [], { credit: 'Marie Tremblay', photo: true });
assert.ok(thread, 'extrait trop long : un fil de deux posts');
assert.equal(thread.length, 2);
assert.equal(thread[0].text, buildXText(long, [], { credit: 'Marie Tremblay', photo: true }));
assert.ok(xlen(thread[0].text) <= 280 && xlen(thread[1].text) <= 280);
assert.ok(!thread[0].text.includes(long.desc));
assert.ok(thread[1].text.includes('Extrait · Le Délit'));
assert.equal(xThread({ ...long, desc: 'Court et déjà dans le titre presque.' }, []), null);
const nov = xThread({ ...long, source: 'The Link', desc: 'The meeting happened on Nov. 16, where citizens spoke. Thousands of students marched that morning.' }, [], { photo: true });
if (nov) assert.doesNotMatch(nov[1].text, /on Nov\.\s*$/m);
assert.ok(X_THREAD_MAX === 25);

const rows = [it, { ...long, image: 'https://img.example/b.jpg', title: 'Deuxième titre réel', bare: 'Deuxième titre réel' }, { ...it, image: 'https://img.example/c.jpg', title: 'Troisième', bare: 'Troisième' }];
rows[0] = { ...it, image: 'https://img.example/a.jpg' };
assert.equal(galleryFrom(rows, { network: 'x', max: 4 }), null);
assert.equal(galleryFrom(rows, { network: 'instagram', max: 4 }), null);
const gal = galleryFrom(rows, { network: 'facebook', limit: 1500, max: 2 });
assert.equal(gal.count, 2);
assert.equal(gal.assets.length, 2);
assert.ok(gal.text.includes('La vie lors d’une régate d’aviron'));
assert.ok(gal.text.includes('Deuxième titre réel'));
assert.ok(!gal.text.includes('Troisième'));
assert.ok(gal.text.includes(siteLink(it)));
assert.ok(!/(^|[\s(])@\w/.test(gal.text));
assert.ok([...gal.assets[0].alt].length <= 1000);
const li = galleryFrom(rows, { network: 'linkedin', limit: 2000, max: 4 });
assert.equal(li.count, 3);
assert.ok(li.assets.every(a => [...a.alt].length <= 300));
assert.equal(galleryFrom([rows[0]], { network: 'facebook', max: 4 }), null);

assert.equal(withUtm('https://le-radar.ca/article/abc/', 'x', false), 'https://le-radar.ca/article/abc/');
const u = new URL(withUtm('https://le-radar.ca/article/abc/', 'linkedin', true));
assert.equal(u.searchParams.get('utm_source'), 'linkedin');
assert.equal(u.searchParams.get('utm_medium'), 'social');
assert.equal(u.searchParams.get('utm_campaign'), 'le-radar');
assert.equal(withUtm('https://le-radar.ca/a/?utm_source=deja', 'x', true), 'https://le-radar.ca/a/?utm_source=deja');

const preview = renderPreview([
  { ...it, image: 'https://img.example/a.jpg' },
  { ...long, image: 'https://img.example/b.jpg', title: 'Deuxième titre réel', bare: 'Deuxième titre réel' },
], { updated: '2026-11-21T00:00:00Z' });
assert.match(preview, /Drapeaux/);
assert.match(preview, /aucun appel Buffer/i);
assert.match(preview, /La vie lors d’une régate d’aviron/);
assert.doesNotMatch(fs.readFileSync(new URL('../scripts/social/potential-preview.mjs', import.meta.url), 'utf8'), /api\.buffer\.com|BUFFER_API_KEY/);

function fakeFetch(script) {
  const calls = [];
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const q = body.query;
    let data = script(q, body.variables) || {};
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { fetchImpl, calls };
}
const posted = q => q.includes('createPost');
const base = q => {
  if (q.includes('scheduledThreadsPerChannel')) return { account: { organizations: [{ id: 'org1', limits: { scheduledThreadsPerChannel: 1 } }] } };
  if (q.includes('threadCount')) return { posts: { edges: [] } };
  if (q.includes('channels(input')) return { channels: [{ id: 'ch1', name: 'le_radar_ca', service: 'twitter' }] };
  if (q.includes('organizations')) return { account: { organizations: [{ id: 'org1', name: 'Radar' }] } };
  if (posted(q)) return { createPost: { post: { id: 'p1', dueAt: '2026-11-22T17:00:00Z' } } };
};

{ const { fetchImpl, calls } = fakeFetch(base);
  const ch = createXBuffer({ key: 'test-not-a-secret', fetchImpl, fallbackId: null });
  const post = await ch.add({ text: 'Bonjour', image: 'https://img.example/a.jpg' });
  assert.equal(post.id, 'p1');
  assert.equal(calls.filter(c => posted(c.query)).length, 1);
  assert.ok(!calls.some(c => c.query.includes('scheduledThreadsPerChannel')));
  const input = calls.find(c => posted(c.query)).variables.i;
  assert.equal(input.mode, 'addToQueue');
  assert.equal(input.schedulingType, 'automatic');
  assert.deepEqual(input.assets, [{ image: { url: 'https://img.example/a.jpg' } }]);
  assert.equal(input.metadata, undefined);
}

{ const { fetchImpl, calls } = fakeFetch(q => {
    if (q.includes('channels(input')) return { channels: [{ id: 'li', name: 'le-radar-ca', service: 'linkedin' }] };
    if (q.includes('organizations')) return { account: { organizations: [{ id: 'org1', name: 'Radar' }] } };
    if (posted(q)) return { createPost: { post: { id: 'p2', dueAt: null } } };
  });
  const ch = createXBuffer({ key: 'test-not-a-secret', fetchImpl, service: 'linkedin', channelName: 'le-radar-ca', fallbackId: null });
  await ch.add({ text: 'Page', images: [{ url: 'https://img.example/a.jpg', alt: 'é'.repeat(400) }, { url: 'https://img.example/b.jpg', alt: 'Photo réelle' }] });
  const input = calls.find(c => posted(c.query)).variables.i;
  assert.equal(input.assets.length, 2);
  assert.ok([...input.assets[0].image.metadata.altText].length <= 300);
  assert.equal(input.assets[1].image.metadata.altText, 'Photo réelle');
  assert.equal(input.metadata, undefined);
}

{ const { fetchImpl, calls } = fakeFetch(q => {
    if (q.includes('scheduledThreadsPerChannel')) return { account: { organizations: [{ id: 'org1', limits: { scheduledThreadsPerChannel: 0 } }] } };
    return base(q);
  });
  const ch = createXBuffer({ key: 'test-not-a-secret', fetchImpl, fallbackId: null });
  const post = await ch.add({ text: thread[0].text, image: 'https://img.example/a.jpg', thread });
  assert.match(post.threadSkipped, /aucun fil/);
  const input = calls.find(c => posted(c.query)).variables.i;
  assert.equal(input.metadata, undefined);
  assert.equal(input.text, thread[0].text);
}

{ const { fetchImpl, calls } = fakeFetch(base);
  const ch = createXBuffer({ key: 'test-not-a-secret', fetchImpl, fallbackId: null });
  const post = await ch.add({ text: thread[0].text, thread });
  assert.equal(post.threadSkipped, undefined);
  const input = calls.find(c => posted(c.query)).variables.i;
  assert.equal(input.text, thread[0].text);
  assert.deepEqual(input.metadata.twitter.thread.map(t => t.text), thread.map(t => t.text));
  assert.ok(calls.some(c => c.query.includes('scheduledThreadsPerChannel')));
}

console.log('social-potential : ok');

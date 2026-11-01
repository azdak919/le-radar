#!/usr/bin/env node
// Pages Facebook / LinkedIn via Buffer : fenêtres, rodage, places libres, écart, format sans @, lien.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planDues, dayCap, buildPageText, pageLink, selectForPage, isRejection } from '../scripts/social/buffer-pages.mjs';
import { weightAt, localParts } from '../scripts/social/schedule.mjs';
import { matchChannel } from '../scripts/social/channels/x-buffer.mjs';
const CFG = JSON.parse(fs.readFileSync(new URL('../data/social/buffer-pages.json', import.meta.url)));
const T = s => Date.parse(s);
// 2026-11-01 = dimanche ; Toronto = UTC-5
assert.equal(weightAt('facebook', T('2026-11-03T15:00:00Z')), 1, 'mardi 10 h : pointe Facebook');
assert.equal(weightAt('facebook', T('2026-11-04T00:30:00Z')), 0.9, 'mardi 19 h 30 : soirée Facebook');
assert.equal(weightAt('linkedin', T('2026-11-03T14:00:00Z')), 1, 'mardi 9 h : pointe LinkedIn');
assert.equal(weightAt('linkedin', T('2026-11-03T23:00:00Z')), 0, 'mardi 18 h : rien sur LinkedIn');
for (const n of ['facebook', 'linkedin']) for (const h of [0, 3, 6.5]) assert.equal(weightAt(n, T('2026-11-03T05:00:00Z') + h * 3600e3), 0, `${n} ${h} h calme`);
assert.equal(weightAt('facebook', T('2026-11-07T12:30:00Z')), 0, 'samedi 7 h 30 calme');
// plafonds : pleine vitesse FB 6 en semaine, LinkedIn 3 en semaine, 1 la fin de semaine ; rodage ×0,4 / ×0,7
const full = c => ({ ...c, liveSince: '2026-01-01T00:00:00Z' });
assert.equal(dayCap(full(CFG.facebook), 'facebook', T('2026-11-10T16:00:00Z')), 6);
assert.equal(dayCap(full(CFG.linkedin), 'linkedin', T('2026-11-10T16:00:00Z')), 3);
assert.equal(dayCap(full(CFG.linkedin), 'linkedin', T('2026-11-14T16:00:00Z')), 1);
assert.equal(dayCap(CFG.facebook, 'facebook', T('2026-11-02T16:00:00Z')), 2, 'FB rodage jour 1');
assert.equal(dayCap(CFG.facebook, 'facebook', T('2026-11-05T16:00:00Z')), 4, 'FB rodage jour 4');
assert.equal(dayCap(CFG.linkedin, 'linkedin', T('2026-11-02T16:00:00Z')), 1, 'LinkedIn rodage jour 1');
assert(CFG.facebook.perDay <= 6 && CFG.linkedin.perDay <= 3);
// créneaux : dans les pointes, écart minimal, jamais au-delà des places libres, du plafond ou dans le passé
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (const [net, now] of [['facebook', T('2026-11-10T08:00:00Z')], ['linkedin', T('2026-11-10T08:00:00Z')], ['facebook', T('2026-11-07T08:00:00Z')]]) {
  const cfg = full(CFG[net]);
  const d = planDues({ network: net, cfg, now, free: 10, rnd }).map(Date.parse);
  assert(d.length > 0 && d.length <= 10, net);
  for (let i = 0; i < d.length; i++) {
    assert(d[i] > now + 19 * 60e3);
    assert(weightAt(net, d[i]) >= 0.5, `${net} ${new Date(d[i]).toISOString()} hors pointe`);
    if (i) assert(d[i] - d[i - 1] >= cfg.minGapMin * 60e3, 'pas de rafale');
  }
  const perDay = new Map(); for (const t of d) { const k = new Date(t - 5 * 3600e3).toISOString().slice(0, 10); perDay.set(k, (perDay.get(k) || 0) + 1); }
  for (const [k, c] of perDay) assert(c <= dayCap(cfg, net, T(k + 'T17:00:00Z')), `${net} ${k} plafond`);
  assert.equal(planDues({ network: net, cfg, now, free: 2, rnd }).length <= 2, true, 'places libres');
  assert.equal(planDues({ network: net, cfg, now, free: 0, rnd }).length, 0);
}
// file déjà pleine pour la journée : rien de plus ce jour-là
const busy = ['2026-11-10T14:30:00Z', '2026-11-10T17:00:00Z', '2026-11-10T18:30:00Z'];
const li = planDues({ network: 'linkedin', cfg: full(CFG.linkedin), now: T('2026-11-10T08:00:00Z'), taken: busy, free: 10, horizonDays: 1, rnd });
assert.equal(li.length, 0, 'plafond LinkedIn atteint par la file');
// format : pas de @, lien configurable, crédit 📸, jamais de nom personnel
const it = { id: 'g1', source: 'Le Délit', author: 'Jeanne Roy', title: 'Le Délit – Jeanne Roy : Grève au campus', bare: 'Grève au campus', link: 'https://www.delitfrancais.com/2026/11/01/greve/', desc: 'Les associations étudiantes votent une grève de deux jours pour le climat.', date: new Date(T('2026-11-01T15:00:00Z')) };
const fb = buildPageText(it, CFG.facebook, { credit: 'Marie Tremblay' });
assert.equal(fb, 'Le Délit • Jeanne Roy • Grève au campus : Les associations étudiantes votent une grève de deux jours pour le climat.\n' + pageLink(it, 'le-radar') + '\n📸 Marie Tremblay');
assert.match(pageLink(it, 'le-radar'), /^https:\/\/le-radar\.ca\/article\/\?id=[0-9a-f]{16}$/);
const ln = buildPageText(it, CFG.linkedin, {});
assert(ln.includes('\nhttps://www.delitfrancais.com/2026/11/01/greve/\n📸 Le Délit'));
const at = buildPageText({ ...it, source: 'The Link', author: '@sana' }, CFG.facebook);
assert(!/(^|\s)@\w/.test(at), 'aucun @');
assert(!/tison/i.test(JSON.stringify(CFG)) && !/tison/i.test(fb));
// sélection : quasi-doublon (même titre, autre source) et déjà en file écartés
const dup = { ...it, id: 'g2', source: 'Impact Campus', link: 'https://impactcampus.ca/greve' };
const other = { ...it, id: 'g3', source: 'Montréal Campus', bare: 'Autre sujet', title: 'Autre sujet', link: 'https://montrealcampus.ca/x' };
const now = T('2026-11-01T18:00:00Z');
assert.deepEqual(selectForPage([it, dup, other], { slots: 5, now }).map(x => x.id).sort(), ['g1', 'g3']);
assert.deepEqual(selectForPage([it, other], { slots: 5, now, sent: { g1: { k: 'x' } } }).map(x => x.id), ['g3']);
assert.deepEqual(selectForPage([it, other], { slots: 5, now, queuedTexts: ['… ' + pageLink(it) + ' …'] }).map(x => x.id), ['g3']);
assert.equal(selectForPage([it, other], { slots: 1, now }).length, 1);
// canaux Buffer et refus
assert(matchChannel({ service: 'facebook', name: 'LE-RADAR.ca' }, 'facebook', 'LE-RADAR.ca'));
assert(matchChannel({ service: 'linkedin', name: 'le-radar-ca' }, 'linkedin', CFG.linkedin.name), 'nom Buffer de la page LinkedIn');
assert(!matchChannel({ service: 'linkedin', name: 'Charles' }, 'linkedin', 'LE-RADAR.ca'));
assert(matchChannel({ service: 'twitter', name: '@LeRadar_ca' }, 'x', 'LeRadar_ca'));
assert(isRejection('People in Canada can’t see news content') && isRejection('Link blocked by Facebook') && !isRejection('timeout'));
assert.equal(localParts(T('2026-11-01T17:00:00Z')).weekend, true);
console.log('social-buffer-pages : OK');

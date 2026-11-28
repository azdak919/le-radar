#!/usr/bin/env node
// Pages Facebook / LinkedIn via Buffer : fenêtres, rodage, places libres, écart, format sans @, lien.
import privacyGuard from '../scripts/privacy-guard.js';
const hasForbidden = (t) => privacyGuard.containsForbiddenName(t, ['dupont']);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planDues, dayCap, buildPageText, pageLink, selectForPage, isRejection, postMetadata } from '../scripts/social/buffer-pages.mjs';
import { weightAt, localParts } from '../scripts/social/schedule.mjs';
import { matchChannel } from '../scripts/social/channels/x-buffer.mjs';
import { pageConfig, NETWORKS } from '../scripts/social/networks/index.mjs';
const JSONCFG = JSON.parse(fs.readFileSync(new URL('../data/social/buffer-pages.json', import.meta.url)));
// Règles du module (scripts/social/networks/) + opérationnel du JSON.
const CFG = Object.fromEntries(['facebook', 'linkedin', 'threads'].map(n => [n, pageConfig(n, JSONCFG)]));
for (const n of ['facebook', 'linkedin']) for (const k of ['perDay', 'minGapMin', 'limit']) assert.equal(JSONCFG[n][k], undefined, `${n}.${k} vit dans le module, pas dans le JSON`);
const T = s => Date.parse(s);
// 2026-11-01 = dimanche ; Toronto = UTC-5
assert.equal(weightAt('facebook', T('2026-11-03T15:00:00Z')), 1, 'mardi 10 h : pointe Facebook');
assert.equal(weightAt('facebook', T('2026-11-04T00:30:00Z')), 0.9, 'mardi 19 h 30 : soirée Facebook');
assert.equal(weightAt('linkedin', T('2026-11-03T14:00:00Z')), 1, 'mardi 9 h : pointe LinkedIn');
assert.equal(weightAt('linkedin', T('2026-11-03T23:00:00Z')), 0, 'mardi 18 h : rien sur LinkedIn');
assert.equal(weightAt('linkedin', T('2026-11-03T21:30:00Z')), 1, 'mardi 16 h 30 : pointe de fin de journée LinkedIn');
for (const n of ['facebook', 'linkedin']) for (const h of [0, 3, 6.5]) assert.equal(weightAt(n, T('2026-11-03T05:00:00Z') + h * 3600e3), 0, `${n} ${h} h calme`);
assert.equal(weightAt('facebook', T('2026-11-07T12:30:00Z')), 0, 'samedi 7 h 30 calme');
// plafonds (modules du 25 nov. 2026) : FB 3 par jour, LinkedIn 2 en semaine, 1 la fin de semaine ; rodage ×0,4 / ×0,7
const full = c => ({ ...c, liveSince: '2026-01-01T00:00:00Z' });
// Mécanisme vérifié sur les plafonds du 25 nov. (FB 3, LinkedIn 2) ; plafonds en vigueur (26 nov., Charles) :
// plus d'articles un à un sur Facebook ni LinkedIn (27 nov.) — la une et la revue les remplacent.
assert.equal(CFG.facebook.perDay, 0, 'Facebook : plus d’articles un à un');
assert.equal(NETWORKS.threads.perDay, 0, 'Threads : plus d’articles un à un');
assert.equal(CFG.linkedin.perDay, 0, 'LinkedIn : plus d’articles un à un');
assert.equal(dayCap(full(CFG.linkedin), 'linkedin', T('2026-11-10T16:00:00Z')), 0, 'LinkedIn : aucune place');
const M = { facebook: { ...CFG.facebook, perDay: 3 }, linkedin: { ...CFG.linkedin, perDay: 2 } };
assert.equal(dayCap(full(M.facebook), 'facebook', T('2026-11-10T16:00:00Z')), 3, 'volume réduit (5/jour) au-dessus du plafond du module : 3');
assert.equal(dayCap(full(M.facebook), 'facebook', T('2026-11-24T16:00:00Z')), 3, 'plafond du module');
assert.equal(dayCap(full(M.linkedin), 'linkedin', T('2026-11-10T16:00:00Z')), 2);
assert.equal(dayCap(full(M.linkedin), 'linkedin', T('2026-11-14T16:00:00Z')), 1);
assert.equal(dayCap({ ...M.facebook, liveSince: '2026-11-01T04:00:00Z' }, 'facebook', T('2026-11-02T16:00:00Z')), 1, 'FB rodage jour 1');
assert.equal(dayCap({ ...M.facebook, liveSince: '2026-11-01T04:00:00Z' }, 'facebook', T('2026-11-05T16:00:00Z')), 2, 'FB rodage jour 4');
assert.equal(dayCap({ ...M.linkedin, liveSince: '2026-11-01T04:00:00Z' }, 'linkedin', T('2026-11-02T16:00:00Z')), 1, 'LinkedIn rodage jour 1');
assert(CFG.facebook.perDay <= 3 && CFG.linkedin.perDay <= 2 && NETWORKS.x.dailySlots.length <= 5, 'moins mais mieux (bilan du 23 nov.)');
// créneaux : dans les pointes, écart minimal, jamais au-delà des places libres, du plafond ou dans le passé
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (const [net, now] of [['facebook', T('2026-11-10T08:00:00Z')], ['linkedin', T('2026-11-10T08:00:00Z')], ['facebook', T('2026-11-07T08:00:00Z')]]) {
  const cfg = full(M[net]);
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
assert.equal(fb, 'Grève au campus\n\nLes associations étudiantes votent une grève de deux jours pour le climat.\n\n📰 Le Délit · Jeanne Roy\n' + pageLink(it, 'le-radar') + '\n📸 Marie Tremblay\n#McGill');
assert.match(pageLink(it, 'le-radar'), /^https:\/\/le-radar\.ca\/article\/[0-9a-f]{16}\/$/);
for (const n of ['facebook', 'linkedin']) assert.equal(CFG[n].link, 'le-radar', `${n} : lien vers la fiche le-radar.ca`);
const ln = buildPageText(it, CFG.linkedin, {});
assert(ln.endsWith('\n📰 Le Délit · Jeanne Roy\n' + pageLink(it) + '\n#McGill'), 'sans crédit : pas de ligne 📸 ; LinkedIn : 1 hashtag en dernier (module)');
assert(fb.endsWith('\n#McGill'), 'Facebook : un hashtag spécifique en dernier');
const at = buildPageText({ ...it, source: 'The Link', author: '@sana' }, CFG.facebook);
assert(!/(^|\s)@\w/.test(at), 'aucun @');
assert(!hasForbidden(JSON.stringify(CFG)) && !hasForbidden(fb));
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
assert(matchChannel({ service: 'twitter', name: '@le_radar_ca' }, 'x', 'le_radar_ca'));
assert(isRejection('People in Canada can’t see news content') && isRejection('Link blocked by Facebook') && !isRejection('timeout'));
assert.equal(localParts(T('2026-11-01T17:00:00Z')).weekend, true);
assert.deepEqual(postMetadata('facebook'), { facebook: { type: 'post' } }, 'Facebook : type post exigé par Buffer');
assert.equal(postMetadata('linkedin'), undefined);
// Places de la file : les publications en échec comptent dans la limite gratuite (cas du 25 nov. 2026 : 7 + 41 → 0).
{
  const { freePlaces, blockedMessage } = await import('../scripts/social/lib.mjs');
  assert.equal(freePlaces(7, 0), 3);
  assert.equal(freePlaces(7, 41), 0, 'Facebook bloqué par 41 échecs');
  assert.equal(freePlaces(4, 3), 3, 'LinkedIn : 3 échecs prennent 3 places');
  assert.equal(blockedMessage('facebook', 7, 0), '');
  assert.match(blockedMessage('facebook', 7, 41), /FILE BLOQUÉE/);
  assert.doesNotMatch(blockedMessage('linkedin', 4, 3), /BLOQUÉE/);
}
// Réconciliation : publications à venir supprimées dans Buffer (files vidées le 25 nov. 2026) → oubliées.
{
  const { reconcileSent } = await import('../scripts/social/lib.mjs');
  const now = T('2026-11-26T04:00:00Z');
  const sent = {
    a: { postId: 'p1', dueAt: '2026-11-26T14:39:00Z' }, // à venir, supprimée → oubliée
    b: { postId: 'p2', dueAt: '2026-11-26T16:28:00Z' }, // à venir, encore en file → gardée
    c: { postId: 'p3', dueAt: '2026-11-25T14:00:00Z' }, // déjà partie → gardée
    d: { postId: 'p4', dueAt: '2026-11-26T04:05:00Z' }, // dans 5 min → gardée (peut être en cours d'envoi)
    e: { at: '2026-11-25T10:00:00Z' },                    // sans postId → gardée
  };
  assert.deepEqual(reconcileSent(sent, ['p2'], now), ['a']);
  assert.deepEqual(Object.keys(sent).sort(), ['b', 'c', 'd', 'e']);
}
// Plafond à 0 (27 nov. 2026) : un article un à un programmé avant le changement est parti quand même.
// La purge ne vise que les publications de CE robot (postId dans l'état), encore à venir.
{
  const { purgeablePosts } = await import('../scripts/social/lib.mjs');
  const now = T('2026-11-27T20:00:00Z');
  const sent = { stage: { postId: 'p1', dueAt: '2026-11-28T01:36:00Z' }, bientot: { postId: 'p2', dueAt: '2026-11-27T20:05:00Z' }, vieux: { at: '2026-11-20T10:00:00Z' } };
  const queued = [
    { id: 'p1', dueAt: '2026-11-28T01:36:00Z' },   // article de ce robot, à venir → retiré
    { id: 'p2', dueAt: '2026-11-27T20:05:00Z' },   // dans 5 min → laissé (envoi possiblement en cours)
    { id: 'une', dueAt: '2026-11-28T14:00:00Z' },  // la une / la revue (autre état) → jamais touchée
    { id: 'main', dueAt: '2026-11-28T15:00:00Z' }, // ajoutée à la main → jamais touchée
  ];
  assert.deepEqual(purgeablePosts(sent, queued, now), [{ postId: 'p1', articleId: 'stage', dueAt: '2026-11-28T01:36:00Z' }]);
  assert.deepEqual(purgeablePosts({}, queued, now), [], 'état vide : rien');
  const src = fs.readFileSync(new URL('../scripts/social/buffer-pages-post.mjs', import.meta.url), 'utf8');
  assert.match(src, /Number\(cfg\.perDay\) === 0/, 'purge réservée aux réseaux à 0 par jour');
  assert.match(src, /if \(!dry\) for \(const x of purge\)/, 'essai : rien retiré');
}
console.log('social-buffer-pages : OK');

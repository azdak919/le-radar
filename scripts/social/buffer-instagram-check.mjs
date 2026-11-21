#!/usr/bin/env node
// Contrôle à blanc des deux comptes Buffer. Lecture seule : aucune écriture, aucun brouillon.
// N'écrit jamais la clé, ni un fragment, ni les en-têtes HTTP.
// Usage : node scripts/social/buffer-instagram-check.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.buffer.com';
const INSTAGRAM_CHANNEL_ID = '6b012936ece6dfde5f3f554d';
const INSTAGRAM_CHANNEL_NAME = 'le.radar.ca';
const MAIN_BUFFER = {
  organizationId: '6ae6c44f8e9f8c0a55ccd241',
  channels: {
    linkedin: '6ae77e7de29c69a1712aa496',
    facebook: '6ae77e08e29c69a1712a8d8d',
    x: '6ae6c47be29c69a171203706',
  },
};
const QUERY_ACCOUNT = 'query { account { organizations { id } } }';
const QUERY_CHANNELS = `query($o: OrganizationId!) {
  channels(input: { organizationId: $o }) { id name service isDisconnected isLocked organizationId }
}`;

export const EXPECTED_MAIN = {
  organizationId: MAIN_BUFFER.organizationId,
  channels: [
    { id: MAIN_BUFFER.channels.linkedin, service: /^linkedin/i, label: 'linkedin' },
    { id: MAIN_BUFFER.channels.facebook, service: /^facebook/i, label: 'facebook' },
    { id: MAIN_BUFFER.channels.x, service: /twitter|^x$/i, label: 'x' },
  ],
};

/** Retire les clés connues et tout jeton Bearer. Ne découpe jamais une clé pour l'afficher. */
export function scrub(text, secrets = []) {
  let out = String(text ?? '');
  const keys = secrets.map(s => String(s || '')).filter(s => s.length >= 8);
  for (const key of keys) out = out.split(key).join('[secret]');
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [secret]');
  out = out.replace(/authorization\s*[:=]\s*\S+/gi, 'authorization=[secret]');
  out = out.replace(/BUFFER_(?:INSTAGRAM_)?API_KEY\s*[=:]\s*\S+/gi, 'BUFFER_API_KEY=[secret]');
  return out.replace(/\s+/g, ' ').trim().slice(0, 400);
}

function assertQuery(query) {
  if (/\bmutation\b/i.test(query) || /createPost|editPost|createIdea|createDraft/i.test(query)) {
    throw new Error('requête refusée : ce contrôle est en lecture seule');
  }
}

/** Appel GraphQL. Ne lit pas les en-têtes de la réponse. */
export async function bufferQuery(key, query, variables = {}, fetchImpl = fetch) {
  assertQuery(query);
  const res = await fetchImpl(API, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status >= 300 && res.status < 400) throw new Error(`redirection refusée (HTTP ${res.status})`);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  const errs = body?.errors || [];
  const msg = errs.map(e => [e?.extensions?.code, e?.message].filter(Boolean).join(' ')).join(' | ');
  if (res.status === 401 || res.status === 403 || errs.some(e => /UNAUTHORIZED|UNAUTHENTICATED/i.test(e?.extensions?.code || ''))) {
    throw new Error(scrub(`clé refusée (HTTP ${res.status}) ${msg}`, [key]));
  }
  if (res.status < 200 || res.status >= 300 || errs.length) throw new Error(scrub(`Buffer API HTTP ${res.status} ${msg || 'réponse illisible'}`, [key]));
  return body.data;
}

export async function readAccount(key, fetchImpl = fetch) {
  const account = await bufferQuery(key, QUERY_ACCOUNT, {}, fetchImpl);
  const orgs = account?.account?.organizations || [];
  if (!orgs.length) throw new Error('aucune organisation accessible');
  const channels = [];
  for (const org of orgs) {
    const data = await bufferQuery(key, QUERY_CHANNELS, { o: org.id }, fetchImpl);
    for (const ch of data?.channels || []) channels.push(ch);
  }
  return { orgIds: orgs.map(o => o.id), channels };
}

const normName = s => String(s || '').replace(/^@/, '').trim().toLowerCase();
const connected = ch => ch && ch.isDisconnected === false;
const serviceOk = (ch, re) => re.test(String(ch?.service || ''));

/** Compte Instagram : clé valide, une organisation, le canal attendu visible et connecté. */
export function assessInstagram(inv) {
  const lines = [];
  if (!inv?.orgIds?.length) return { ok: false, lines: ['aucune organisation accessible'] };
  lines.push('organisation accessible');
  const ch = (inv.channels || []).find(c => c.id === INSTAGRAM_CHANNEL_ID);
  if (!ch) return { ok: false, lines: [...lines, `canal ${INSTAGRAM_CHANNEL_ID} invisible`] };
  const nameOk = normName(ch.name) === INSTAGRAM_CHANNEL_NAME;
  const svcOk = /^instagram/i.test(String(ch.service || ''));
  const linkOk = connected(ch);
  const locked = ch.isLocked === true;
  const orgOk = inv.orgIds.includes(ch.organizationId);
  lines.push(`canal ${ch.id} · ${normName(ch.name) || '(sans nom)'} · ${ch.service || '(service inconnu)'} · ${linkOk ? 'connecté' : 'déconnecté'} · ${locked ? 'verrouillé' : 'non verrouillé'}`);
  const ok = nameOk && svcOk && linkOk && !locked && orgOk;
  if (!nameOk) lines.push(`nom attendu : ${INSTAGRAM_CHANNEL_NAME}`);
  if (!svcOk) lines.push('service attendu : instagram');
  if (!linkOk) lines.push('le canal n’est pas connecté (isDisconnected)');
  if (locked) lines.push('le canal est verrouillé (isLocked)');
  if (!orgOk) lines.push('le canal n’appartient pas à une organisation accessible avec cette clé');
  return { ok, lines };
}

/** Compte principal : LinkedIn, Facebook et X dans l'organisation connue. Instagram absent. */
export function assessMain(inv) {
  const lines = [];
  const problems = [];
  if (!inv?.orgIds?.includes(EXPECTED_MAIN.organizationId)) problems.push('organisation principale inaccessible');
  else lines.push(`organisation ${EXPECTED_MAIN.organizationId} accessible`);
  for (const want of EXPECTED_MAIN.channels) {
    const ch = (inv.channels || []).find(c => c.id === want.id);
    if (!ch) { problems.push(`${want.label} ${want.id} invisible`); continue; }
    if (ch.organizationId !== EXPECTED_MAIN.organizationId) problems.push(`${want.label} hors de l’organisation principale`);
    if (!serviceOk(ch, want.service)) problems.push(`${want.label} : service inattendu ${ch.service || '?'}`);
    if (!connected(ch)) problems.push(`${want.label} déconnecté`);
    lines.push(`${want.label} ${ch.id} · ${ch.service} · ${connected(ch) ? 'connecté' : 'déconnecté'}`);
  }
  const ig = (inv.channels || []).filter(c => c.id === INSTAGRAM_CHANNEL_ID || /^instagram/i.test(String(c.service || '')));
  if (ig.length) problems.push(`Instagram visible sur le compte principal (${ig.map(c => c.id).join(', ')})`);
  else lines.push('Instagram absent de ce compte');
  return { ok: problems.length === 0, lines, problems };
}

function report(title, result) {
  console.log(`${title} : ${result.ok ? 'OK' : 'ERREUR'}`);
  for (const line of result.lines || []) console.log(`  ${line}`);
  for (const line of result.problems || []) console.log(`  ${line}`);
}

export async function main(env = process.env, fetchImpl = fetch) {
  const igKey = String(env.BUFFER_INSTAGRAM_API_KEY || '').trim();
  const mainKey = String(env.BUFFER_API_KEY || '').trim();
  const secrets = [igKey, mainKey];
  if (!igKey) { console.log('Instagram : ERREUR'); console.log('  BUFFER_INSTAGRAM_API_KEY absent'); return 1; }
  if (!mainKey) { console.log('Compte principal : ERREUR'); console.log('  BUFFER_API_KEY absent'); return 1; }
  if (igKey === mainKey) { console.log('Instagram : ERREUR'); console.log('  la clé Instagram est la même que la clé principale'); return 1; }
  let code = 0;
  try {
    const ig = assessInstagram(await readAccount(igKey, fetchImpl));
    report('Instagram', ig);
    if (!ig.ok) code = 1;
  } catch (e) {
    console.log('Instagram : ERREUR');
    console.log(`  ${scrub(e?.message || e, secrets)}`);
    code = 1;
  }
  try {
    const mainResult = assessMain(await readAccount(mainKey, fetchImpl));
    report('Compte principal', mainResult);
    if (!mainResult.ok) code = 1;
  } catch (e) {
    console.log('Compte principal : ERREUR');
    console.log(`  ${scrub(e?.message || e, secrets)}`);
    code = 1;
  }
  return code;
}

const self = path.resolve(fileURLToPath(import.meta.url));
const argv = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (argv === self) process.exit(await main());

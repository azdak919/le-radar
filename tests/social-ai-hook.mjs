// Crochet IA : actif sur X/Pages/Bluesky/Tumblr, JAMAIS sur Mastodon (piaille.fr interdit le texte IA).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { articleLang, aiHook, withHook, validHook, aiEnabled } from '../scripts/social/ai-hook.mjs';
import { buildText } from '../scripts/social/lib.mjs';
import { buildBskyText } from '../scripts/social/bluesky.mjs';
import { buildTumblrText } from '../scripts/social/tumblr.mjs';

const it = { id: 'x1', source: 'Impact Campus', title: 'La bibliothèque prolonge ses heures', bare: 'La bibliothèque prolonge ses heures', desc: 'Les étudiants pourront étudier plus tard pendant la session.', link: 'https://example.org/a', date: Date.now() };
const HOOK = 'Les étudiants pourront étudier plus tard cette session';
const env = { CLOUDFLARE_AI_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' };
const ok = async () => ({ ok: true, json: async () => ({ result: { response: JSON.stringify({ hook: HOOK, topic: 'Éducation' }) } }) });

assert.equal(aiEnabled({}), false);
assert.equal(aiEnabled({ ...env, SOCIAL_AI: 'off' }), false);
assert.equal(validHook('Le ministre Tremblay annonce 300 millions pour les étudiants', it), false, 'garde-fou chiffre/nom');
assert.equal(await aiHook(it, { env, fetchImpl: async () => ({ ok: false }) }), null, 'repli sur échec');
assert.equal(await aiHook(it, { env, fetchImpl: async () => { throw new Error('x'); } }), null);
const a = { ...it }; await withHook(a, { env, fetchImpl: ok });
assert.equal(a.aiHook, HOOK);
const bad = { ...it, id: 'x2' }; await withHook(bad, { env, fetchImpl: async () => ({ ok: true, json: async () => ({ result: { response: '{"hook":"Le recteur Dupont promet 42 cours","topic":"Éducation"}' } }) }) });
assert.equal(bad.aiHook, undefined, 'accroche inventée rejetée → repli');

for (const t of [buildBskyText(a, [], { photo: true }), buildTumblrText(a, [], { photo: true }), buildText(a, [], undefined, { ai: true })]) assert.ok(t.includes(HOOK), 'IA utilisée');
assert.ok(!buildText(a).includes(HOOK), 'défaut : déterministe');
// Mastodon : jamais l'accroche IA, même si l'article en porte une.
// (mastodon-post.mjs est un script à effets : on vérifie son appel buildText et le comportement équivalent.)
const m = buildText(a, [], 480, { photo: true, link: true, ai: false });
assert.ok(!m.includes(HOOK), 'Mastodon ne doit jamais contenir de texte IA');
assert.equal(m, buildText({ ...it }, [], 480, { photo: true, link: true, ai: false }));
const src = readFileSync(new URL('../scripts/social/mastodon-post.mjs', import.meta.url), 'utf8') + readFileSync(new URL('../.github/workflows/social-mastodon.yml', import.meta.url), 'utf8');
assert.ok(/ai: false/.test(src), 'buildMastoText force ai: false');
assert.ok(!/ai-hook|withHook|aiHook|CLOUDFLARE_AI/.test(src), 'Mastodon ne charge ni le crochet ni les secrets IA');
// Langue : l'accroche suit la langue de chaque article (champ, sinon titre/extrait), le repli aussi.
const en = { id: 'e1', source: 'The Link', title: 'The library extends its hours for the exam period', desc: 'Students will be able to study later during the exam period.', link: 'https://example.org/e', date: Date.now() };
assert.equal(articleLang(en), 'en'); assert.equal(articleLang(it), 'fr'); assert.equal(articleLang({ ...it, lang: 'en-CA' }), 'en');
let prompt = ''; const cap = h => async (u, o) => { prompt = JSON.parse(o.body).messages[0].content; return { ok: true, json: async () => ({ result: { response: JSON.stringify({ hook: h, topic: 'Éducation' }) } }) }; };
const e1 = { ...en }; await withHook(e1, { env, fetchImpl: cap('Students will be able to study later during the exam period') });
assert.match(prompt, /anglais \(English\)/); assert.ok(e1.aiHook?.startsWith('Students'));
const e2 = { ...en, id: 'e2' }; await withHook(e2, { env, fetchImpl: cap(HOOK) });
assert.equal(e2.aiHook, undefined, 'accroche française refusée sur un article anglais');
assert.ok(!buildText(e2, [], undefined, { ai: true }).includes(HOOK) && buildText(e2, [], undefined, { ai: true }).includes('Students'), 'repli en anglais');
const f1 = { ...it, id: 'f1' }; await withHook(f1, { env, fetchImpl: cap(HOOK) });
assert.match(prompt, /en français/); assert.equal(f1.aiHook, HOOK);
for (const x of [e1, f1]) { const t = buildBskyText(x, [], { photo: true }); assert.ok(t.includes('#Québec') && t.includes('#PresseÉtudiante'), 'hashtags fixes'); }
console.log('social-ai-hook : OK');

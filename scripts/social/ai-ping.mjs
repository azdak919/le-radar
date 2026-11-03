// Un seul appel de test à Workers AI (jeton jamais affiché). Sortie : statut, modèle, accroche validée ou non.
import { aiHook, aiEnabled, MODEL } from './ai-hook.mjs';
if (!aiEnabled()) { console.log('::error::Secrets Workers AI absents.'); process.exit(1); }
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'Réponds seulement : OK' }], max_tokens: 5 }), signal: AbortSignal.timeout(15000) });
const j = await r.json().catch(() => ({}));
console.log(`HTTP ${r.status} · success=${j.success} · modèle ${MODEL} · réponse « ${String(j.result?.response || '').slice(0, 20)} »${j.errors?.length ? ' · erreurs ' + JSON.stringify(j.errors.map(e => e.code)) : ''}`);
if (!r.ok || !j.success) process.exit(1);

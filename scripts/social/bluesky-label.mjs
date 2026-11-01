#!/usr/bin/env node
// Ajoute l'auto-étiquette « bot » (com.atproto.label.defs#selfLabels) au profil Bluesky, comme le
// recommande docs.bsky.app/docs/starter-templates/bots. Tous les autres champs (displayName,
// description, avatar, banner, autres étiquettes) sont conservés tels quels. DRY_RUN=true : essai.
import { createBluesky } from './channels/bluesky.mjs';

/** Profil avec l'étiquette « bot » ajoutée ; null si déjà présente. Pur, testé. */
export function withBotLabel(profile = {}) {
  const vals = profile.labels?.$type === 'com.atproto.label.defs#selfLabels' ? profile.labels.values || [] : [];
  if (vals.some(v => v.val === 'bot')) return null;
  return { ...profile, $type: 'app.bsky.actor.profile', labels: { $type: 'com.atproto.label.defs#selfLabels', values: [...vals, { val: 'bot' }] } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const handle = process.env.BLUESKY_HANDLE || 'le-radar.bsky.social', password = process.env.BLUESKY_APP_PASSWORD || '';
  if (!password) { console.log('BLUESKY_APP_PASSWORD absent : rien à faire.'); process.exit(0); }
  const dry = process.env.DRY_RUN === 'true';
  const bs = createBluesky({ handle, password }); await bs.login();
  const { value, cid } = await bs.getProfile();
  let next = withBotLabel(value);
  const keys = ['displayName', 'description', 'avatar', 'banner'].filter(k => value[k]);
  if (process.env.SET_BIO === 'true') {
    // Bio approuvée : data/social/bluesky-bio.txt (limite Bluesky 256 graphèmes).
    const { readFileSync } = await import('node:fs');
    const bio = readFileSync(new URL('../../data/social/bluesky-bio.txt', import.meta.url), 'utf8').replace(/\n+$/, '');
    const n = [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(bio)].length;
    if (n > 256) throw new Error(`bio trop longue : ${n} graphèmes`);
    keys.splice(keys.indexOf('description'), 1);
    if (value.description === bio && !next) { console.log('Bio déjà à jour : inchangé.'); process.exit(0); }
    next = { ...(next || { ...value, $type: 'app.bsky.actor.profile' }), description: bio };
    console.log(`Bio (${n} graphèmes) à appliquer.`);
  }
  console.log(`Profil ${handle} : champs présents ${keys.join(', ')} ; étiquettes ${JSON.stringify((value.labels?.values || []).map(v => v.val))}`);
  if (!next) { console.log('Étiquette « bot » déjà présente : inchangé.'); process.exit(0); }
  for (const k of keys) if (JSON.stringify(next[k]) !== JSON.stringify(value[k])) throw new Error(`champ ${k} modifié`);
  if (dry) { console.log('ESSAI : écrirait le profil (bio/étiquette), autres champs conservés.'); process.exit(0); }
  await bs.putProfile(next, cid);
  const after = (await bs.getProfile()).value;
  for (const k of keys) if (JSON.stringify(after[k]) !== JSON.stringify(value[k])) throw new Error(`champ ${k} perdu après écriture`);
  if (!(after.labels?.values || []).some(v => v.val === 'bot')) throw new Error('étiquette bot perdue');
  console.log(`Profil écrit ; ${keys.join(', ')} et étiquette « bot » conservés.`);
}

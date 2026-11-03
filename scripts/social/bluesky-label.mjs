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
  const handle = process.env.BLUESKY_HANDLE || 'le-radar.ca', password = process.env.BLUESKY_APP_PASSWORD || '';
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
    const name = readFileSync(new URL('../../data/social/bluesky-display-name.txt', import.meta.url), 'utf8').trim();
    if ([...name].length > 64) throw new Error('nom affiché trop long');
    for (const k of ['description', 'displayName']) if (keys.includes(k)) keys.splice(keys.indexOf(k), 1);
    if (value.description === bio && value.displayName === name && !next) { console.log('Bio et nom déjà à jour : inchangé.'); process.exit(0); }
    next = { ...(next || { ...value, $type: 'app.bsky.actor.profile' }), description: bio, displayName: name };
    console.log(`Bio (${n} graphèmes) et nom affiché « ${name} » à appliquer.`);
  }
  if (process.env.SET_IMAGES === 'true') {
    // Images HD approuvées : data/social/bluesky-avatar.png (2048²) et bluesky-banner.jpg (3000×1000), < 1 Mo chacune.
    const { readFileSync } = await import('node:fs');
    const imgs = { avatar: ['bluesky-avatar.png', 'image/png'], banner: ['bluesky-banner.jpg', 'image/jpeg'] };
    next = { ...(next || { ...value, $type: 'app.bsky.actor.profile' }) };
    for (const [k, [f, type]] of Object.entries(imgs)) {
      const buf = readFileSync(new URL(`../../data/social/${f}`, import.meta.url));
      if (buf.length > 1_000_000) throw new Error(`${f} dépasse 1 Mo`);
      if (keys.includes(k)) keys.splice(keys.indexOf(k), 1);
      if (dry) { console.log(`ESSAI : ${k} ← ${f} (${buf.length} octets)`); continue; }
      const blob = await bs.uploadImage(`data:${type};base64,${buf.toString('base64')}`);
      if (!blob) throw new Error(`téléversement ${f} échoué`);
      next[k] = blob; console.log(`${k} ← ${f} (${buf.length} octets)`);
    }
  }
  console.log(`Profil ${handle} : champs présents ${keys.join(', ')} ; étiquettes ${JSON.stringify((value.labels?.values || []).map(v => v.val))}`);
  if (!next) { console.log('Étiquette « bot » déjà présente : inchangé.'); process.exit(0); }
  for (const k of keys) if (JSON.stringify(next[k]) !== JSON.stringify(value[k])) throw new Error(`champ ${k} modifié`);
  if (dry) { console.log('ESSAI : écrirait le profil (bio/étiquette), autres champs conservés.'); process.exit(0); }
  // Relecture juste avant l'écriture : une bannière/avatar téléversé entre-temps n'est pas écrasé.
  const fresh = await bs.getProfile();
  if (fresh.cid !== cid) { console.log('Profil modifié entre-temps : relancer.'); process.exit(1); }
  await bs.putProfile(next, cid);
  const after = (await bs.getProfile()).value;
  for (const k of keys) if (JSON.stringify(after[k]) !== JSON.stringify(value[k])) throw new Error(`champ ${k} perdu après écriture`);
  if (!(after.labels?.values || []).some(v => v.val === 'bot')) throw new Error('étiquette bot perdue');
  console.log(`Profil écrit ; ${keys.join(', ')} et étiquette « bot » conservés.`);
}

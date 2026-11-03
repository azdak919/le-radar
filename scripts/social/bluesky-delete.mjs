// Supprime UNE publication Bluesky du Radar (rkey donné), rien d'autre. Aucun secret journalisé.
import { createBluesky } from './channels/bluesky.mjs';
const rkey = (process.env.RKEY || '').trim();
if (!/^[a-z0-9]{10,20}$/.test(rkey)) throw new Error('rkey invalide');
const bs = createBluesky({ handle: process.env.BLUESKY_HANDLE || 'le-radar.ca', password: process.env.BLUESKY_APP_PASSWORD });
await bs.login();
const did = await bs.resolve((process.env.BLUESKY_HANDLE || 'le-radar.ca').replace(/^@/, ''));
if (!did) throw new Error('DID introuvable');
const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
if (process.env.DRY_RUN === 'true') { console.log(`Essai : supprimerait ${uri}`); process.exit(0); }
await bs.deletePost(uri);
console.log(`Supprimé : ${uri}`);

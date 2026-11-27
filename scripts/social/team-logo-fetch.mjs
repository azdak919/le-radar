#!/usr/bin/env node
// UN logo d'équipe depuis Wikimedia Commons → assets/logos/teams/<id>.png (story « Jour de match »).
// Lancé à la main (workflow « Social — Logo d'équipe depuis Commons ») : jamais en lot, jamais automatique.
//
//   TEAM_ID=udem QUERY="Carabins logo" node scripts/social/team-logo-fetch.mjs          → liste les candidats (rien n'est écrit)
//   TEAM_ID=udem COMMONS_FILE="File:X.svg" OWNER=UdeM DRY_RUN=false node scripts/...   → télécharge et note la provenance
//
// Commons n'héberge que du contenu libre : la licence (LicenseShortName) et l'auteur sont copiés tels quels dans sources.json.
// Image : rendu PNG de Commons, 600 px de large au plus (README du dossier).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'assets/logos/teams');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'LE-RADAR-logos/1.0 (+https://le-radar.ca; un logo à la fois, lancement manuel)';
const MAX_W = 600;

export const teamId = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
export const fileTitle = (s) => { const t = String(s || '').trim().replace(/^https?:\/\/[^/]+\/wiki\//, '').replace(/_/g, ' '); return t ? (/^(File|Fichier):/i.test(t) ? t.replace(/^Fichier:/i, 'File:') : `File:${t}`) : ''; };
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function get(params, tries = 4) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    if (r.status !== 429 || i >= tries - 1) throw new Error(`Commons ${r.status} : ${(await r.text()).slice(0, 160)}`);
    const wait = Number(r.headers.get('retry-after')) || 15 * (i + 1);
    console.log(`Commons limite le débit (429), nouvel essai dans ${wait} s.`);
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
}

const info = (p) => { const ii = p.imageinfo?.[0] || {}, m = ii.extmetadata || {};
  return { title: p.title, url: ii.descriptionurl, thumb: ii.thumburl || ii.url, mime: ii.mime, width: ii.width, height: ii.height,
    license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value), credit: strip(m.Credit?.value) }; };
const iiParams = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(MAX_W), iiextmetadatafilter: 'LicenseShortName|Artist|Credit' };

export async function search(query, limit = 10) {
  const j = await get({ action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: query, gsrlimit: String(limit), ...iiParams });
  return (j.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).map(info);
}

export function isImage(buf) {
  return buf.length > 8 && (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // PNG
    || (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP'));
}

async function main() {
  const id = teamId(process.env.TEAM_ID), file = fileTitle(process.env.COMMONS_FILE), dry = process.env.DRY_RUN !== 'false';
  const out = process.env.GITHUB_STEP_SUMMARY ? (s) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n') : () => {};
  if (!id) throw new Error('TEAM_ID requis (registryId de sports-masthead.json, ex. udem, ets ; club de voile : udem-voile)');
  if (!file) {
    const q = process.env.QUERY || `${id} logo`;
    const list = await search(q);
    console.log(`Candidats Commons pour « ${q} » (relancer avec COMMONS_FILE) :`);
    out(`### Candidats Commons pour « ${q} »\n\n| Fichier | Licence | Taille |\n|---|---|---|`);
    for (const c of list) { console.log(`- ${c.title} · ${c.license || '?'} · ${c.width}×${c.height} · ${c.url}`); out(`| [${c.title}](${c.url}) | ${c.license || '?'} | ${c.width}×${c.height} |`); }
    if (!list.length) console.log('(aucun)');
    return;
  }
  const j = await get({ action: 'query', titles: file, ...iiParams });
  const page = j.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo) throw new Error(`Fichier introuvable sur Commons : ${file}`);
  const c = info(page);
  if (!c.license) throw new Error(`Licence absente de la fiche Commons : ${c.url}`);
  const r = await fetch(c.thumb, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Téléchargement ${r.status} : ${c.thumb}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!isImage(buf)) throw new Error(`Rendu Commons ni PNG ni WebP (${c.mime}) : ${c.thumb}`);
  const ext = buf[0] === 0x89 ? 'png' : 'webp', name = `${id}.${ext}`;
  const entry = { file: name, source: c.url, license: c.license, ...(c.artist ? { author: c.artist } : {}), owner: process.env.OWNER || id };
  console.log(`${c.title} → ${name} (${buf.length} octets) · ${c.license}${c.artist ? ' · ' + c.artist : ''}`);
  out(`### ${name}\n\n[${c.title}](${c.url}) · ${c.license}${c.artist ? ' · ' + c.artist : ''} · ${buf.length} octets${dry ? ' · **essai, rien écrit**' : ''}`);
  if (process.env.PREVIEW_DIR) { fs.mkdirSync(process.env.PREVIEW_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.PREVIEW_DIR, name), buf); }
  if (dry) { console.log('Essai (DRY_RUN) : rien écrit dans le dépôt.'); return; }
  for (const e of ['png', 'svg', 'webp']) { const p = path.join(DIR, `${id}.${e}`); if (e !== ext && fs.existsSync(p)) fs.rmSync(p); }
  fs.writeFileSync(path.join(DIR, name), buf);
  const srcPath = path.join(DIR, 'sources.json'), sources = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  sources[id] = entry;
  fs.writeFileSync(srcPath, JSON.stringify(sources, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });

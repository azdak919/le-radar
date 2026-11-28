#!/usr/bin/env node
// UN logo d'équipe depuis Wikimedia Commons ou le site officiel de l'équipe → assets/logos/teams/<id>.png|svg (story « Jour de match »).
//   PAGE_URL=https://… (site officiel) → liste les images qui ressemblent à un logo ; + IMAGE_URL=https://… → télécharge celle-là.
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
// Auteur Commons : « Unknown author » (souvent répété par le gabarit) = pas d'auteur noté.
export const author = (h) => { const t = String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return /^(unknown author|auteur inconnu)/i.test(t) ? '' : t; };
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
    license: strip(m.LicenseShortName?.value), artist: author(m.Artist?.value), credit: strip(m.Credit?.value) }; };
const iiParams = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(MAX_W), iiextmetadatafilter: 'LicenseShortName|Artist|Credit' };

export async function search(query, limit = 10) {
  const j = await get({ action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: query, gsrlimit: String(limit), ...iiParams });
  return (j.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).map(info);
}

export function isImage(buf) {
  return buf.length > 8 && (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // PNG
    || (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
    || (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)); // JPEG (logos publiés en JPEG sur Commons)
}
const rasterExt = (buf) => buf[0] === 0x89 ? 'png' : buf[0] === 0xff ? 'jpg' : 'webp';

/** Type d'image accepté : png, webp ou svg sans script ni gestionnaire d'événement ; sinon ''. */
export function imageExt(buf) {
  if (isImage(buf)) return rasterExt(buf);
  const t = buf.subarray(0, 4096).toString('utf8');
  if (/<svg[\s>]/i.test(t) && !/<script|\son\w+\s*=|javascript:/i.test(buf.toString('utf8'))) return 'svg';
  return '';
}

/** Images d'une page web qui ressemblent à un logo (src, srcset, alt, class ou id contenant logo, crest, team, écusson…). */
export function logoCandidates(html, base) {
  const out = new Map();
  const abs = (u) => { const v = String(u || '').trim().split(/\s+/)[0]; if (!v) return ''; try { return new URL(v, base).href; } catch { return ''; } };
  for (const m of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0], attr = (n) => (tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
    const srcs = [attr('src'), attr('data-src'), ...attr('srcset').split(',')].map(abs).filter((u) => /^https:/.test(u));
    const hint = `${attr('alt')} ${attr('class')} ${attr('id')} ${srcs.join(' ')}`;
    if (!/logo|crest|ecusson|écusson|team|equipe|équipe|emblem/i.test(hint)) continue;
    for (const u of srcs) if (!out.has(u)) out.set(u, attr('alt'));
  }
  for (const m of String(html).matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*>/gi)) { const u = abs((m[0].match(/content=["']([^"']+)/i) || [])[1] || ''); if (u && !out.has(u)) out.set(u, 'og:image'); }
  return [...out].map(([url, alt]) => ({ url, alt }));
}

function save({ id, buf, ext, entry, dry, out, label }) {
  const name = `${id}.${ext}`; entry.file = name;
  console.log(`${label} → ${name} (${buf.length} octets) · ${entry.license}${entry.author ? ' · ' + entry.author : ''}`);
  out(`### ${name}\n\n${label} · ${entry.license}${entry.author ? ' · ' + entry.author : ''} · ${buf.length} octets${dry ? ' · **essai, rien écrit**' : ''}`);
  if (buf.length > 1.5e6) throw new Error(`Image trop lourde (${buf.length} octets) : en choisir une plus petite`);
  if (process.env.PREVIEW_DIR) { fs.mkdirSync(process.env.PREVIEW_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.PREVIEW_DIR, name), buf); }
  if (dry) { console.log('Essai (DRY_RUN) : rien écrit dans le dépôt.'); return; }
  for (const e of ['png', 'svg', 'webp', 'jpg']) { const p = path.join(DIR, `${id}.${e}`); if (e !== ext && fs.existsSync(p)) fs.rmSync(p); }
  fs.writeFileSync(path.join(DIR, name), buf);
  const srcPath = path.join(DIR, 'sources.json'), sources = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  sources[id] = entry;
  fs.writeFileSync(srcPath, JSON.stringify(sources, null, 1));
}

/** Site officiel (28 nov. 2026, Charles : logo des Carabins sur carabins.umontreal.ca) : page → candidats, ou image choisie. */
async function fromSite({ id, page, image, dry, out }) {
  const H = { 'User-Agent': UA };
  if (!image) {
    const r = await fetch(page, { headers: H, redirect: 'follow' });
    if (!r.ok) throw new Error(`Page ${r.status} : ${page}`);
    const list = logoCandidates(await r.text(), r.url || page);
    console.log(`Logos trouvés sur ${page} (relancer avec IMAGE_URL) :`);
    out(`### Logos trouvés sur ${page}\n\n| Image | Texte alternatif |\n|---|---|`);
    for (const c of list) { console.log(`- ${c.url}${c.alt ? ' · ' + c.alt : ''}`); out(`| ${c.url} | ${c.alt || ''} |`); }
    if (!list.length) console.log('(aucun)');
    return;
  }
  if (!/^https:\/\//i.test(image)) throw new Error(`IMAGE_URL doit être en https : ${image}`);
  const r = await fetch(image, { headers: H, redirect: 'follow' });
  if (!r.ok) throw new Error(`Téléchargement ${r.status} : ${image}`);
  const buf = Buffer.from(await r.arrayBuffer()), ext = imageExt(buf);
  if (!ext) throw new Error(`Ni PNG, ni WebP, ni SVG sûr : ${image}`);
  const host = new URL(page || image).hostname;
  save({ id, buf, ext, dry, out, label: image,
    entry: { file: '', source: page || image, image, license: `Logo officiel publié sur ${host} (marque de son titulaire)`, owner: process.env.OWNER || id } });
}

async function fromCommons({ id, file, owner, dry, out }) {
  const j = await get({ action: 'query', titles: file, ...iiParams });
  const pg = j.query?.pages?.[0];
  if (!pg || pg.missing || !pg.imageinfo) throw new Error(`Fichier introuvable sur Commons : ${file}`);
  const c = info(pg);
  if (!c.license) throw new Error(`Licence absente de la fiche Commons : ${c.url}`);
  const r = await fetch(c.thumb, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Téléchargement ${r.status} : ${c.thumb}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!isImage(buf)) throw new Error(`Rendu Commons ni PNG, ni JPEG, ni WebP (${c.mime}) : ${c.thumb}`);
  save({ id, buf, ext: rasterExt(buf), dry, out, label: `[${c.title}](${c.url})`,
    entry: { file: '', source: c.url, license: c.license, ...(c.artist ? { author: c.artist } : {}), owner } });
}

/** Lot (28 nov. 2026, Charles : logos ÉTS et cégeps) : « id|valeur;id|valeur;… », une requête Commons à la fois, 1,5 s d'écart. */
export const parseBatch = (s) => String(s || '').split(/[;\n]/).map((l) => l.split('|').map((x) => x.trim())).filter((p) => teamId(p[0]) && p[1]).map(([id, v, owner]) => ({ id: teamId(id), v, owner: owner || '' }));
const pause = () => new Promise((r) => setTimeout(r, 1500));
async function batchList(items, out) {
  out('### Candidats Commons (lot)\n\n| Équipe | Recherche | Fichier | Licence | Taille |\n|---|---|---|---|---|');
  for (const { id, v } of items) {
    let list = []; try { list = await search(v, 5); } catch (e) { console.log(`${id} : ${e.message}`); }
    console.log(`\n${id} · « ${v} » : ${list.length ? '' : '(aucun)'}`);
    for (const c of list) { console.log(`  - ${c.title} · ${c.license || '?'} · ${c.width}×${c.height}`); out(`| ${id} | ${v} | [${c.title}](${c.url}) | ${c.license || '?'} | ${c.width}×${c.height} |`); }
    if (!list.length) out(`| ${id} | ${v} | — | | |`);
    await pause();
  }
}
async function batchFetch(items, dry, out) {
  let ok = 0; const failed = [];
  for (const { id, v, owner } of items) {
    try { await fromCommons({ id, file: fileTitle(v), owner: owner || id, dry, out }); ok++; } catch (e) { failed.push(id); console.log(`::warning::${id} : ${e.message}`); }
    await pause();
  }
  console.log(`\nLot : ${ok} logo(s)${dry ? ' vérifiés (essai)' : ' ajoutés'}${failed.length ? ` ; échecs : ${failed.join(', ')}` : ''}.`);
  if (!ok && failed.length) throw new Error('aucun logo du lot');
}

async function main() {
  const id = teamId(process.env.TEAM_ID), file = fileTitle(process.env.COMMONS_FILE), dry = process.env.DRY_RUN !== 'false';
  const out = process.env.GITHUB_STEP_SUMMARY ? (s) => fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n') : () => {};
  if (process.env.BATCH_LIST) return batchList(parseBatch(process.env.BATCH_LIST), out);
  if (process.env.BATCH_FETCH) return batchFetch(parseBatch(process.env.BATCH_FETCH), dry, out);
  if (!id) throw new Error('TEAM_ID requis (registryId de sports-masthead.json, ex. udem, ets ; club de voile : udem-voile)');
  const page = (process.env.PAGE_URL || '').trim(), image = (process.env.IMAGE_URL || '').trim();
  if (page || image) return fromSite({ id, page, image, dry, out });
  if (!file) {
    const q = process.env.QUERY || `${id} logo`;
    const list = await search(q);
    console.log(`Candidats Commons pour « ${q} » (relancer avec COMMONS_FILE) :`);
    out(`### Candidats Commons pour « ${q} »\n\n| Fichier | Licence | Taille |\n|---|---|---|`);
    for (const c of list) { console.log(`- ${c.title} · ${c.license || '?'} · ${c.width}×${c.height} · ${c.url}`); out(`| [${c.title}](${c.url}) | ${c.license || '?'} | ${c.width}×${c.height} |`); }
    if (!list.length) console.log('(aucun)');
    return;
  }
  return fromCommons({ id, file, owner: process.env.OWNER || id, dry, out });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });

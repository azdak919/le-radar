#!/usr/bin/env node
/**
 * Saison des photos de repli campus (banque curée + extras du mât) d'après
 * Wikimedia Commons : catégories, titre, description, date de prise.
 * Écrit data/campus-photo-seasons.json : stockKey → { snow: true|false|null, why }.
 *   snow true  : neige / hiver (catégorie, titre) ou prise de décembre à mars ;
 *   snow false : prise d'avril à octobre, ou catégorie d'été / d'automne / de printemps ;
 *   snow null  : inconnu (évité hors hiver s'il reste mieux).
 * Usage : node scripts/tag-campus-seasons.js [--update]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { BANK, stockKey } = require('./campus-photo-bank');

const OUT = path.join(__dirname, '..', 'data', 'campus-photo-seasons.json');
const SNOW_RE = /\b(snow|snowy|snowfall|neige|enneig\w*|winter|hiver|hivernal|blizzard|ice storm|verglas|frost|givre)\b/i;
const NOSNOW_RE = /\b(summer|été|ete|spring|printemps|autumn|fall foliage|automne|in (?:april|may|june|july|august|september|october))\b/i;
const MONTH_CAT_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december) (?:\d{4})\b/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function classify({ title = '', cats = '', desc = '', date = '' }) {
  const text = `${title} ${cats} ${desc}`.replace(/_/g, ' ');
  if (SNOW_RE.test(text)) return { snow: true, why: `texte : ${text.match(SNOW_RE)[0]}` };
  const m = String(date).match(/(\d{4})[-:](\d{2})/);
  let month = m ? Number(m[2]) : 0;
  let why = m ? `prise ${m[1]}-${m[2]}` : '';
  if (!month) { const c = text.match(MONTH_CAT_RE); if (c) { month = MONTHS.indexOf(c[1].toLowerCase()) + 1; why = `catégorie ${c[0]}`; } }
  if (month === 12 || (month >= 1 && month <= 3)) return { snow: true, why };
  if (month >= 4 && month <= 10) return { snow: false, why };
  if (NOSNOW_RE.test(text)) return { snow: false, why: `texte : ${text.match(NOSNOW_RE)[0]}` };
  return { snow: null, why: month === 11 ? `${why} (novembre : incertain)` : 'inconnu' };
}

function fileTitle(e) {
  const u = String(e.sourceUrl || e.link || '');
  const m = u.match(/\/wiki\/(File:[^?#]+)/);
  if (m) return decodeURIComponent(m[1]).replace(/_/g, ' ');
  const f = String(e.url || '').split('/').pop();
  return f ? 'File:' + decodeURIComponent(f).replace(/_/g, ' ') : '';
}

async function commonsMeta(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata'
      + '&iiextmetadatafilter=DateTimeOriginal|Categories|ImageDescription|ObjectName&titles=' + encodeURIComponent(batch.join('|'));
    const res = await fetch(url, { headers: { 'User-Agent': 'le-radar-bot (saisons des photos de repli)' } });
    const j = await res.json();
    const norm = new Map((j.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of Object.values(j.query.pages || {})) {
      const md = (p.imageinfo && p.imageinfo[0] && p.imageinfo[0].extmetadata) || {};
      const v = (k) => String((md[k] && md[k].value) || '').replace(/<[^>]+>/g, ' ');
      out.set(norm.get(p.title) || p.title, { cats: v('Categories'), desc: v('ImageDescription') + ' ' + v('ObjectName'), date: v('DateTimeOriginal') });
    }
  }
  return out;
}

async function main() {
  const entries = [];
  for (const list of Object.values(BANK)) for (const e of list || []) entries.push(e);
  try {
    const wp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'quebec-university-backgrounds.json'), 'utf8')).photos || [];
    for (const p of wp) entries.push({ url: p.url, title: p.title, sourceUrl: p.link, season: p.season, cats: p.categories, date: p.dateTaken || p.date });
  } catch { /* banque du mât absente */ }
  const titles = [...new Set(entries.map(fileTitle).filter(Boolean))];
  const meta = await commonsMeta(titles);
  const seasons = {};
  for (const e of entries) {
    const m = meta.get(fileTitle(e)) || {};
    let r = classify({ title: `${e.title || ''} ${e.tags || ''}`, cats: `${e.cats || ''} ${m.cats || ''}`, desc: m.desc || '', date: m.date || e.date || '' });
    // Saison posée à la main dans la banque du mât : hiver = neige, sinon sans neige.
    if (r.snow === null && e.season) r = { snow: e.season === 'hiver', why: `banque du mât : ${e.season}` };
    if (e.season === 'hiver') r = { snow: true, why: 'banque du mât : hiver' };
    seasons[stockKey(e.url)] = r;
  }
  const n = Object.values(seasons);
  console.log(`${n.length} photos : neige ${n.filter((x) => x.snow === true).length}, sans neige ${n.filter((x) => x.snow === false).length}, inconnu ${n.filter((x) => x.snow === null).length}`);
  if (process.argv.includes('--update')) fs.writeFileSync(OUT, JSON.stringify({ _note: 'Saison des photos de repli campus (scripts/tag-campus-seasons.js) — snow true/false/null.', photos: seasons }, null, 1) + '\n');
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { classify };

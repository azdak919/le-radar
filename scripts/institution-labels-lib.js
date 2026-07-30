/**
 * D10 — libellés d’établissements dérivés de institutions.json (+ alias connus).
 * Une seule SoT pour generate-feed, seo-pages et le script de sync navigateur.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INST_PATH = path.join(ROOT, 'institutions.json');

/** Formes courtes d’affichage — complètent le registre (pas de doublon de noms). */
const WELL_KNOWN_SHORT = {
  'Université de Montréal': 'UdeM',
  'Université du Québec à Montréal': 'UQAM',
  'McGill University': 'McGill',
  'Université McGill': 'McGill',
  'Concordia University': 'Concordia',
  'Université Concordia': 'Concordia',
  'Université Laval': 'ULaval',
  'Université de Sherbrooke': 'UdeS',
  'Université du Québec à Trois-Rivières': 'UQTR',
  'Université du Québec à Chicoutimi': 'UQAC',
  'Université du Québec à Rimouski': 'UQAR',
  'Université du Québec en Outaouais': 'UQO',
  'Université du Québec en Abitibi-Témiscamingue': 'UQAT',
  'Polytechnique Montréal': 'Poly Montréal',
  "Bishop's University": "Bishop's",
  "Université Bishop's": "Bishop's",
  'Dawson College': 'Dawson',
  'Collège Dawson': 'Dawson',
  'Cégep du Vieux Montréal': 'Cégep Vieux-Montréal',
  'Cégep de Jonquière': 'Cégep de Jonquière',
  'École de technologie supérieure (ÉTS)': 'ÉTS',
  'École de technologie supérieure': 'ÉTS',
  'HEC Montréal': 'HEC',
};

/** Alias → nom canonique (forme longue privilégiée pour les inverses). */
const WELL_KNOWN_ALIASES = {
  UQAM: 'Université du Québec à Montréal',
  UdeM: 'Université de Montréal',
  ULaval: 'Université Laval',
  UdeS: 'Université de Sherbrooke',
  UQTR: 'Université du Québec à Trois-Rivières',
  UQAC: 'Université du Québec à Chicoutimi',
  UQAR: 'Université du Québec à Rimouski',
  UQO: 'Université du Québec en Outaouais',
  UQAT: 'Université du Québec en Abitibi-Témiscamingue',
  McGill: 'McGill University',
  Concordia: 'Concordia University',
  'Université McGill': 'McGill University',
  'Université Concordia': 'Concordia University',
  "Université Bishop's": "Bishop's University",
  'Collège Dawson': 'Dawson College',
  ÉTS: 'École de technologie supérieure (ÉTS)',
  HEC: 'HEC Montréal',
};

function loadInstitutions() {
  const raw = JSON.parse(fs.readFileSync(INST_PATH, 'utf8'));
  return raw.institutions || [];
}

function stripParen(name = '') {
  return String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function slugify(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Mappe nom complet / alias → forme courte (acronyme d’affichage).
 * Inclut les variantes entre parenthèses du registre.
 */
function buildAcronymMap(institutions = loadInstitutions()) {
  const map = { ...WELL_KNOWN_SHORT };
  for (const inst of institutions) {
    const name = inst.name;
    const short =
      WELL_KNOWN_SHORT[name]
      || WELL_KNOWN_SHORT[stripParen(name)]
      || null;
    if (short) {
      map[name] = short;
      map[stripParen(name)] = short;
    }
    // « Foo (BAR) » → BAR si présent
    const m = String(name).match(/\(([A-ZÉÈÀÂÊÎÔÛÜ]{2,8})\)\s*$/);
    if (m) {
      map[name] = map[name] || m[1];
      map[m[1]] = m[1];
    }
  }
  // Acronymes seuls pointent vers eux-mêmes pour résolution inverse
  for (const [alias, full] of Object.entries(WELL_KNOWN_ALIASES)) {
    if (map[full]) map[alias] = map[full];
  }
  return map;
}

/**
 * Entrées SEO : slug + name + short + aliases.
 * Couvre d’abord le jeu historique SEO, puis tout établissement du registre
 * ayant un short connu.
 */
function buildSeoInstitutions(institutions = loadInstitutions()) {
  const acronyms = buildAcronymMap(institutions);
  const bySlug = new Map();

  const seed = [
    { slug: 'universite-de-montreal', name: 'Université de Montréal', short: 'UdeM' },
    {
      slug: 'universite-du-quebec-a-montreal',
      name: 'Université du Québec à Montréal',
      short: 'UQAM',
      aliases: ['UQAM'],
    },
    {
      slug: 'mcgill-university',
      name: 'McGill University',
      nameFr: 'Université McGill',
      short: 'McGill',
      aliases: ['Université McGill'],
    },
    {
      slug: 'concordia-university',
      name: 'Concordia University',
      nameFr: 'Université Concordia',
      short: 'Concordia',
    },
    {
      slug: 'universite-du-quebec-a-trois-rivieres',
      name: 'Université du Québec à Trois-Rivières',
      short: 'UQTR',
    },
    { slug: 'universite-laval', name: 'Université Laval', short: 'ULaval' },
    { slug: 'universite-de-sherbrooke', name: 'Université de Sherbrooke', short: 'UdeS' },
    {
      slug: 'cegep-du-vieux-montreal',
      name: 'Cégep du Vieux Montréal',
      short: 'Cégep Vieux-Montréal',
    },
    { slug: 'cegep-de-jonquiere', name: 'Cégep de Jonquière', short: 'Cégep de Jonquière' },
    { slug: 'polytechnique-montreal', name: 'Polytechnique Montréal', short: 'Polytechnique' },
    {
      slug: 'bishops-university',
      name: "Bishop's University",
      nameFr: "Université Bishop's",
      short: "Bishop's",
    },
    {
      slug: 'dawson-college',
      name: 'Dawson College',
      nameFr: 'Collège Dawson',
      short: 'Dawson',
    },
  ];

  for (const e of seed) bySlug.set(e.slug, { ...e });

  for (const inst of institutions) {
    const name = inst.name;
    const short = acronyms[name] || acronyms[stripParen(name)];
    if (!short) continue;
    const slug = slugify(stripParen(name));
    if (bySlug.has(slug)) continue;
    const entry = { slug, name: stripParen(name), short };
    if (name !== stripParen(name)) {
      entry.aliases = [name];
    }
    bySlug.set(slug, entry);
  }

  return [...bySlug.values()];
}

function buildFullByAcronym(acronymMap = buildAcronymMap()) {
  const out = {};
  for (const [full, acr] of Object.entries(acronymMap)) {
    if (full === acr) continue;
    const clean = stripParen(full);
    if (!clean.includes(' ')) continue;
    const prev = out[acr];
    if (!prev || clean.length > prev.length) out[acr] = clean;
  }
  for (const [alias, full] of Object.entries(WELL_KNOWN_ALIASES)) {
    if (!out[alias] && full) out[alias] = stripParen(full);
  }
  return out;
}

module.exports = {
  INST_PATH,
  WELL_KNOWN_SHORT,
  WELL_KNOWN_ALIASES,
  loadInstitutions,
  buildAcronymMap,
  buildSeoInstitutions,
  buildFullByAcronym,
  stripParen,
  slugify,
};

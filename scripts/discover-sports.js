#!/usr/bin/env node
/**
 * LE-RADAR — bot de découvrabilité sports
 *
 * 1. Redécouvre les ligues RSEQ collégial+universitaire (GetLeagueList region=14)
 *    → écrit sports-leagues.json
 * 2. Sonde ICSA pour les écoles QC (sports-sailing.json schools + watchlist)
 *    → promeut watchlist → schools si une page ICSA apparaît
 * 3. Synchronise sports-teams.json :
 *    - ajoute « sailing » aux registryId QC actifs
 *    - fusionne les sports observés dans sports.json (si présent)
 *
 * Usage:
 *   node scripts/discover-sports.js           # dry-run résumé
 *   node scripts/discover-sports.js --update  # écrit les fichiers
 *   node scripts/discover-sports.js --update --fetch  # + npm run sports:update
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LEAGUES_PATH = path.join(ROOT, 'sports-leagues.json');
const SAILING_PATH = path.join(ROOT, 'sports-sailing.json');
const TEAMS_PATH = path.join(ROOT, 'sports-teams.json');
const SPORTS_JSON_PATH = path.join(ROOT, 'sports.json');

const update = process.argv.includes('--update');
const doFetch = process.argv.includes('--fetch');

const SPORT_SLUG = {
  Athlétisme: 'athletisme',
  Badminton: 'badminton',
  Baseball: 'baseball',
  Basketball: 'basketball',
  Cheerleading: 'cheerleading',
  'Cross-country': 'cross-country',
  'Flag football': 'flag-football',
  Football: 'football',
  Futsal: 'futsal',
  Golf: 'golf',
  Hockey: 'hockey',
  Natation: 'natation',
  Rugby: 'rugby',
  Soccer: 'soccer',
  'Soccer intérieur': 'soccer-interieur',
  Ultimate: 'ultimate',
  Volleyball: 'volleyball',
};

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'le-radar.ca sports-discover/1.0 (+https://le-radar.ca)',
        },
        timeout: 25000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          getJson(res.headers.location).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
}

function fetchHead(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; LE-RADAR-SportsDiscover/1.0)',
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          fetchHead(next).then(resolve);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode || 0,
            ok: res.statusCode === 200 && !/404:\s*Page not found/i.test(html.slice(0, 800)),
            hasTable: /<tr/i.test(html),
            len: html.length,
          });
        });
      },
    );
    req.on('error', () => resolve({ status: 0, ok: false, hasTable: false, len: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, ok: false, hasTable: false, len: 0 });
    });
  });
}

function slugifySport(name) {
  if (SPORT_SLUG[name]) return SPORT_SLUG[name];
  return String(name || 'sport')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sport';
}

function sexCode(s) {
  const t = String(s || '').toLowerCase();
  if (t.startsWith('f')) return 'F';
  if (t.startsWith('m') && !t.includes('ix')) return 'M';
  if (t.includes('mix')) return 'X';
  return null;
}

function sectorCode(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('coll')) return 'collegial';
  if (t.includes('univ')) return 'universitaire';
  return null;
}

async function discoverRseqLeagues() {
  const year = await getJson('https://s1.rseq.ca/api/SchoolYearApi/GetCurrentSchoolYear');
  const yearId = year.SchoolYearId;
  const sample = await getJson(
    'https://s1.rseq.ca/api/LeagueApi/GetLeagueDiffusion/?leagueId=357ee497-0d4f-4152-a7a4-b3a6a2c3cf8f',
  );
  const sports = sample.Sports || [];
  const leagues = [];
  const seen = new Set();

  for (const sp of sports) {
    const sportId = sp.DropDownItemId;
    const sportName = sp.DropDownItemName;
    const list = await getJson(
      `https://s1.rseq.ca/api/LeagueApi/GetLeagueList/?schoolYearId=${yearId}&region=14&sport=${sportId}`,
    );
    const rows = Array.isArray(list) ? list : [];
    process.stderr.write(`discover: ${sportName} → ${rows.length} ligues\n`);
    for (const L of rows) {
      const id = L.LeagueId;
      if (!id || seen.has(id)) continue;
      const sector = sectorCode(L.Sector);
      if (!sector) continue;
      seen.add(id);
      const sex = sexCode(L.SexType);
      const sport = slugifySport(sportName);
      const div = (L.Division || '').replace(/^Division\s*/i, 'D').trim() || null;
      const labelParts = [
        sportName,
        sector === 'collegial' ? 'collégial' : 'universitaire',
      ];
      if (sex === 'F') labelParts.push('féminin');
      if (sex === 'M') labelParts.push('masculin');
      if (sex === 'X') labelParts.push('mixte');
      if (div) labelParts.push(div);
      leagues.push({
        id,
        sector,
        sport,
        sportLabel: sportName,
        division: div,
        sex,
        label: labelParts.join(' '),
        usports: sector === 'universitaire',
        s1SportId: sportId,
      });
    }
  }

  leagues.sort((a, b) =>
    String(a.sport).localeCompare(String(b.sport))
    || String(a.sector).localeCompare(String(b.sector))
    || String(a.sex || '').localeCompare(String(b.sex || '')),
  );

  const bySport = {};
  for (const L of leagues) bySport[L.sport] = (bySport[L.sport] || 0) + 1;

  return {
    catalog: {
      description:
        'Ligues RSEQ collégial + universitaire (province). Découvert via GetLeagueList (region=14). Hockey scores via Spordle. Voile QC via sports-sailing.json.',
      source: 'https://s1.rseq.ca/api/LeagueApi/GetLeagueList/',
      schoolYearId: yearId,
      schoolYear: year.SchoolYear,
      generated: new Date().toISOString(),
      leagueCount: leagues.length,
      leagues,
    },
    bySport,
  };
}

async function discoverSailingQc(sailingCfg) {
  const schools = Array.isArray(sailingCfg.schools) ? [...sailingCfg.schools] : [];
  const watchlist = Array.isArray(sailingCfg.watchlist) ? [...sailingCfg.watchlist] : [];
  const promoted = [];
  const stillWatch = [];
  const activeSlugs = new Set(schools.map((s) => s.slug).filter(Boolean));

  // Revalider les écoles actives ICSA
  for (const school of schools) {
    if (school.province && school.province !== 'QC') {
      process.stderr.write(`discover: voile ignore hors-QC ${school.slug}\n`);
      continue;
    }
    const url = `https://scores.collegesailing.org/schools/${school.slug}/`;
    const head = await fetchHead(url);
    process.stderr.write(
      `discover: voile ICSA ${school.slug} → ${head.ok ? 'ok' : 'absent'} (HTTP ${head.status})\n`,
    );
    if (head.ok) {
      school.status = 'icsa';
      school.lastSeen = new Date().toISOString();
      promoted.push(school);
    } else {
      // rétrograde en watchlist si plus de page
      stillWatch.push({
        registryId: school.registryId,
        name: school.name,
        shortName: school.shortName,
        code: school.code,
        sector: school.sector || 'universitaire',
        status: 'club',
        province: 'QC',
        note: 'Ancienne page ICSA introuvable — à revérifier.',
        icsaSlugCandidates: [school.slug],
      });
    }
  }

  // Watchlist : tenter chaque slug candidat
  for (const club of watchlist) {
    if (club.province && club.province !== 'QC') continue;
    const candidates = club.icsaSlugCandidates || [];
    let found = null;
    for (const slug of candidates) {
      if (activeSlugs.has(slug)) continue;
      const head = await fetchHead(`https://scores.collegesailing.org/schools/${slug}/`);
      process.stderr.write(
        `discover: voile watch ${club.shortName || club.registryId} slug=${slug} → ${head.ok ? 'ICSA!' : '—'}\n`,
      );
      if (head.ok) {
        found = slug;
        break;
      }
    }
    if (found) {
      const school = {
        slug: found,
        registryId: club.registryId,
        name: club.name,
        shortName: club.shortName,
        code: club.code,
        sector: club.sector || 'universitaire',
        conference: club.conference || 'ICSA',
        status: 'icsa',
        province: 'QC',
        lastSeen: new Date().toISOString(),
        promotedFrom: 'watchlist',
      };
      promoted.push(school);
      activeSlugs.add(found);
    } else {
      stillWatch.push({ ...club, province: 'QC', lastChecked: new Date().toISOString() });
    }
  }

  // Dédupliquer promoted par slug
  const bySlug = new Map();
  for (const s of promoted) {
    if (s.province === 'QC' && s.slug) bySlug.set(s.slug, s);
  }

  return {
    schools: [...bySlug.values()],
    watchlist: stillWatch,
    promotedCount: promoted.filter((p) => p.promotedFrom === 'watchlist').length,
  };
}

function slugRegistryId(name, sector) {
  const base = String(name || 'equipe')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'equipe';
  // Préfixe collégial si collision possible avec un univ. homonyme.
  if (sector === 'collegial' && !base.startsWith('cegep-') && !base.startsWith('college-')) {
    return base;
  }
  return base;
}

function guessFullName(shortName, sector) {
  const n = String(shortName || '').trim();
  if (!n) return null;
  if (/^(cégep|cegep|collège|college|université|universite|école|ecole|bishop|vanier|dawson|séminaire|seminaire)/i.test(n)) {
    return n;
  }
  if (sector === 'universitaire') {
    if (/^uq/i.test(n) || /^(ets|éts)$/i.test(n)) return n;
    if (/^carleton$/i.test(n)) return 'Carleton University';
    if (/^ottawa$/i.test(n)) return 'University of Ottawa';
    if (/militaire royal|cmr/i.test(n)) return 'Collège militaire royal du Canada';
    if (/^mcgill$/i.test(n)) return 'Université McGill';
    if (/^concordia$/i.test(n)) return 'Université Concordia';
    if (/^bishop/i.test(n)) return "Bishop's University";
    return n.startsWith('Université') || n.startsWith('University') ? n : `Université ${n}`;
  }
  if (sector === 'collegial') {
    if (/^(vanier|dawson|marianopolis|heritage|héritage)/i.test(n)) return `${n} College`;
    return `Cégep ${n.startsWith('de ') || n.startsWith("d'") ? n : `de ${n}`}`.replace('Cégep de de ', 'Cégep de ');
  }
  return n;
}

/**
 * Surnoms bien établis seulement (ne remplace jamais un nickname déjà saisi).
 * Mieux vaut null que d’inventer un mascotte.
 */
const CURATED_NICKNAMES = {
  'edouard-montpetit': 'Cougars',
  'trois-rivieres': 'Diablos',
  'sainte-foy': 'Géants',
  dawson: 'Blues',
  'john-abbott': 'Islanders',
  montmorency: 'Nomades',
  'saint-laurent': 'Cavaliers',
  limoilou: 'Titans',
  garneau: 'Boomerang',
  vanier: 'Cheetahs',
  ulaval: 'Rouge et Or',
  mcgill: 'Redbirds',
  concordia: 'Stingers',
  udem: 'Carabins',
  uqam: 'Citadins',
  usherbrooke: 'Vert & Or',
  bishops: 'Gaiters',
  uqtr: 'Patriotes',
  carleton: 'Ravens',
  ottawa: 'Gee-Gees',
  'andre-laurendeau': 'Boomerang',
};

function syncSportsTeamsRegistry(sailingResult) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(TEAMS_PATH, 'utf8'));
  } catch {
    raw = { teams: [] };
  }
  const teams = Array.isArray(raw.teams) ? raw.teams : [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  const byCodeSector = new Map();
  for (const t of teams) {
    const code = String(t.code || '').toUpperCase();
    const sector = t.sector || '';
    if (code && sector) byCodeSector.set(`${sector}:${code}`, t);
  }

  // Sports + ids RSEQ observés dans sports.json (avec ou sans registryId).
  const observed = new Map(); // registryId → Set(sport)
  const observedByCode = new Map(); // sector:code → { sports, rseqIds, name, fullName, nickname }
  if (fs.existsSync(SPORTS_JSON_PATH)) {
    try {
      const payload = JSON.parse(fs.readFileSync(SPORTS_JSON_PATH, 'utf8'));
      for (const team of Object.values(payload.teams || {})) {
        const rid = team.registryId;
        if (rid && team.sport) {
          if (!observed.has(rid)) observed.set(rid, new Set());
          observed.get(rid).add(team.sport);
        }
        const code = String(team.code || '').toUpperCase();
        const sector = team.sector || '';
        if (!code || !sector) continue;
        const key = `${sector}:${code}`;
        if (!observedByCode.has(key)) {
          observedByCode.set(key, {
            sports: new Set(),
            rseqIds: new Set(),
            name: team.name,
            fullName: team.fullName || null,
            nickname: team.nickname || null,
            sector,
            code,
          });
        }
        const bucket = observedByCode.get(key);
        if (team.sport) bucket.sports.add(team.sport);
        if (team.rseqTeamId) bucket.rseqIds.add(String(team.rseqTeamId));
        if (team.name) bucket.name = team.name;
        if (team.fullName) bucket.fullName = team.fullName;
        if (team.nickname) bucket.nickname = team.nickname;
      }
    } catch {
      /* ignore */
    }
  }

  // Voile QC : actives + watchlist
  const sailingIds = new Set();
  for (const s of sailingResult.schools || []) {
    if (s.registryId) sailingIds.add(s.registryId);
  }
  for (const w of sailingResult.watchlist || []) {
    if (w.registryId) sailingIds.add(w.registryId);
  }

  let sportsAdded = 0;
  let sailingTagged = 0;
  let teamsAdded = 0;
  let rseqIdsAdded = 0;

  // Fusion sports / rseqIds sur les entrées existantes.
  for (const team of teams) {
    if (!team.sports) team.sports = [];
    if (!team.rseqTeamIds) team.rseqTeamIds = [];
    if (!team.aliases) team.aliases = [];
    const set = new Set(team.sports);
    const rseqSet = new Set(team.rseqTeamIds.map(String));
    const before = set.size;
    const beforeRseq = rseqSet.size;

    const obs = observed.get(team.id);
    if (obs) {
      for (const sp of obs) set.add(sp);
    }
    const codeKey = `${team.sector || ''}:${String(team.code || '').toUpperCase()}`;
    const byCode = observedByCode.get(codeKey);
    if (byCode) {
      for (const sp of byCode.sports) set.add(sp);
      for (const rid of byCode.rseqIds) rseqSet.add(rid);
      if (!team.nickname && byCode.nickname) team.nickname = byCode.nickname;
      if (!team.fullName && byCode.fullName) team.fullName = byCode.fullName;
    }
    if (sailingIds.has(team.id)) {
      if (!set.has('sailing')) {
        set.add('sailing');
        sailingTagged += 1;
      }
    }
    if (!team.nickname && CURATED_NICKNAMES[team.id]) {
      team.nickname = CURATED_NICKNAMES[team.id];
    }

    team.sports = [...set].sort();
    team.rseqTeamIds = [...rseqSet];
    if (team.sports.length > before) sportsAdded += team.sports.length - before;
    if (team.rseqTeamIds.length > beforeRseq) rseqIdsAdded += team.rseqTeamIds.length - beforeRseq;
  }

  // Nouvelles formations observées dans sports.json mais absentes du registre.
  for (const [key, bucket] of observedByCode) {
    if (byCodeSector.has(key)) continue;
    const shortName = String(bucket.name || bucket.code || 'Équipe').trim();
    let id = slugRegistryId(shortName, bucket.sector);
    if (byId.has(id)) {
      id = `${id}-${String(bucket.code || 'x').toLowerCase()}`;
    }
    if (byId.has(id)) continue;
    const entry = {
      id,
      code: bucket.code,
      sector: bucket.sector,
      shortName,
      fullName: bucket.fullName || guessFullName(shortName, bucket.sector),
      nickname: bucket.nickname || CURATED_NICKNAMES[id] || null,
      aliases: [shortName, bucket.code].filter(Boolean),
      priority: 80,
      sports: [...bucket.sports].sort(),
      rseqTeamIds: [...bucket.rseqIds],
    };
    teams.push(entry);
    byId.set(id, entry);
    byCodeSector.set(key, entry);
    teamsAdded += 1;
    sportsAdded += entry.sports.length;
    rseqIdsAdded += entry.rseqTeamIds.length;
  }

  // S’assurer que McGill / UdeM / Sherbrooke / Laval existent
  const ensure = [
    { id: 'mcgill', code: 'MCG', shortName: 'McGill', fullName: 'Université McGill', nickname: 'Redbirds', priority: 2 },
    { id: 'udem', code: 'MTL', shortName: 'Montréal', fullName: 'Université de Montréal', nickname: 'Carabins', priority: 4 },
    { id: 'usherbrooke', code: 'USHE', shortName: 'Sherbrooke', fullName: 'Université de Sherbrooke', nickname: 'Vert & Or', priority: 6 },
    { id: 'ulaval', code: 'LAV', shortName: 'Laval', fullName: 'Université Laval', nickname: 'Rouge et Or', priority: 1 },
  ];
  for (const e of ensure) {
    if (byId.has(e.id)) continue;
    teams.push({
      ...e,
      sector: 'universitaire',
      aliases: [e.shortName, e.fullName, e.code],
      sports: sailingIds.has(e.id) ? ['sailing'] : [],
      rseqTeamIds: [],
    });
    sailingTagged += sailingIds.has(e.id) ? 1 : 0;
  }

  teams.sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? a.priority : 99;
    const pb = Number.isFinite(b.priority) ? b.priority : 99;
    if (pa !== pb) return pa - pb;
    return String(a.shortName || '').localeCompare(String(b.shortName || ''), 'fr');
  });

  return {
    payload: {
      ...raw,
      description:
        raw.description
        || 'Registre des formations sportives RSEQ (collégial + universitaire QC) pour LE-RADAR. shortName = libellé ; fullName = établissement ; nickname = identité d’équipe.',
      source: raw.source || 'curated + sports.json',
      updated: new Date().toISOString(),
      teamCount: teams.length,
      teams,
    },
    sportsAdded,
    sailingTagged,
    teamsAdded,
    rseqIdsAdded,
  };
}

async function main() {
  process.stderr.write('discover-sports: catalogue RSEQ…\n');
  const { catalog, bySport } = await discoverRseqLeagues();

  let sailingCfg = { schools: [], watchlist: [] };
  try {
    sailingCfg = JSON.parse(fs.readFileSync(SAILING_PATH, 'utf8'));
  } catch {
    /* defaults empty */
  }

  process.stderr.write('discover-sports: voile QC (ICSA + watchlist)…\n');
  const sailingResult = await discoverSailingQc(sailingCfg);
  const sailingOut = {
    ...sailingCfg,
    description:
      'Voile campus — Québec seulement. ICSA = scores réels. watchlist = clubs QC sans feed ICSA (ou à venir).',
    region: 'QC',
    updated: new Date().toISOString(),
    schools: sailingResult.schools,
    watchlist: sailingResult.watchlist,
  };

  const regSync = syncSportsTeamsRegistry(sailingResult);

  const summary = {
    update,
    rseqLeagues: catalog.leagueCount,
    rseqSports: Object.keys(bySport).length,
    bySport,
    sailingIsca: sailingResult.schools.map((s) => s.slug),
    sailingWatchlist: sailingResult.watchlist.map((w) => w.registryId || w.shortName),
    sailingPromoted: sailingResult.promotedCount,
    registrySportsAdded: regSync.sportsAdded,
    registrySailingTagged: regSync.sailingTagged,
    registryTeamsAdded: regSync.teamsAdded || 0,
    registryRseqIdsAdded: regSync.rseqIdsAdded || 0,
    registryTeamCount: regSync.payload?.teamCount || 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (update) {
    fs.writeFileSync(LEAGUES_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    fs.writeFileSync(SAILING_PATH, `${JSON.stringify(sailingOut, null, 2)}\n`, 'utf8');
    fs.writeFileSync(TEAMS_PATH, `${JSON.stringify(regSync.payload, null, 2)}\n`, 'utf8');
    process.stderr.write(
      `discover-sports: écrit ${path.relative(ROOT, LEAGUES_PATH)}, ${path.relative(ROOT, SAILING_PATH)}, ${path.relative(ROOT, TEAMS_PATH)}\n`,
    );
  } else {
    process.stderr.write('discover-sports: dry-run (passe --update pour écrire)\n');
  }

  if (doFetch && update) {
    process.stderr.write('discover-sports: lance sports:update…\n');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'fetch-sports.js'), '--update'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (r.status) process.exit(r.status || 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

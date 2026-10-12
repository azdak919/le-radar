/**
 * CICSA — résultats de saison des clubs de voile du Québec.
 *
 * Source publique : https://cicsailing.ca/season-results
 * (feuille de scores + calendrier Google, liés depuis cette page).
 * Hors Québec (Ontario, Atlantique, Ouest) n’entre pas dans le payload.
 *
 * Une régate n’est pas un match : place / taille du tableau, comme l’ICSA.
 * Les lignes « Rank » sans nom d’équipe sont le barème vide, pas un résultat.
 */
'use strict';

const QC_CODE = {
  mcg: 'mcgill',
  mcgill: 'mcgill',
  con: 'concordia',
  concordia: 'concordia',
  poly: 'polytechnique',
  mdes: 'usherbrooke',
  udes: 'usherbrooke',
  lvl: 'ulaval',
  laval: 'ulaval',
  ulaval: 'ulaval',
};

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const EVENT_RE = /^(.+?)\s*\(((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*(?:[A-Za-z]+\s+)?\d{1,2})?)\)\s*$/i;

const EVENT_FR = [
  [/quebec regional/, 'Régionale Québec'],
  [/women/, 'Épreuve féminine'],
  [/keelboat/, 'Nationaux quillards'],
  [/team race/, 'Nationaux team race'],
  [/match race/, 'Nationaux match race'],
  [/fleet race/, 'Nationaux fleet race'],
  [/single hand/, 'Solitaire'],
  [/can\s*\/?\s*am/, 'CAN/AMs'],
  [/western canada/, "Coupe de l'Ouest"],
  [/ontario regional|uoft invite/, 'Régionale Ontario'],
  [/^musc$/, 'MUSC'],
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function torontoYmd(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date instanceof Date ? date : new Date(date));
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function qcBoat(raw) {
  const compact = String(raw || '').trim().replace(/\s+/g, '');
  const m = compact.match(/^([A-Za-z]+?)(\d+)?$/);
  if (!m) return null;
  const registryId = QC_CODE[m[1].toLowerCase()];
  if (!registryId) return null;
  const boat = m[2] ? String(Number(m[2])) : '';
  return { registryId, boat: boat === '1' ? '' : boat };
}

function eventFr(name) {
  const key = fold(name);
  for (const [re, label] of EVENT_FR) {
    if (re.test(key)) return label;
  }
  return String(name || '').trim();
}

function parseLooseRange(label, seasonStartYear) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  const m = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*[-–]\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2}))?$/);
  if (!m) return null;
  const month1 = MONTHS[m[1].toLowerCase()];
  if (!month1) return null;
  const day1 = Number(m[2]);
  const month2 = m[3] ? MONTHS[m[3].toLowerCase()] : month1;
  const day2 = m[4] ? Number(m[4]) : day1;
  if (!month2 || !day1 || !day2) return null;
  const yearFor = (month, after) => {
    if (after && month < after.month) return after.year + 1;
    return month >= 8 ? seasonStartYear : seasonStartYear + 1;
  };
  const y1 = yearFor(month1, null);
  const y2 = yearFor(month2, { month: month1, year: y1 });
  const iso = (year, month, day) => (
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );
  return { start: iso(y1, month1, day1), end: iso(y2, month2, day2) };
}

function num(value) {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : null;
}

function int(value) {
  const n = num(value);
  return n != null && Number.isInteger(n) ? n : (n != null && Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : null);
}

function cell(row, index) {
  if (index == null || index < 0) return '';
  return String((row && row[index]) || '').trim();
}

function findCell(rows, pred) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let c = 0; c < row.length; c += 1) {
      if (pred(row, c, r)) return { r, c, row };
    }
  }
  return null;
}

function headerSlice(row, start) {
  const map = {};
  for (let i = start; i < row.length; i += 1) {
    const label = fold(row[i]);
    if (!label) break;
    map[label] = i;
  }
  return map;
}

function colOf(map, prefixes) {
  for (const prefix of prefixes) {
    if (map[prefix] != null) return map[prefix];
  }
  const keys = Object.keys(map);
  for (const prefix of prefixes) {
    const hit = keys.find((key) => key.startsWith(prefix));
    if (hit) return map[hit];
  }
  return -1;
}

function assertCsv(text, label) {
  const head = String(text || '').slice(0, 800);
  if (!head.trim()) throw new Error(`${label} vide`);
  if (/<!doctype html|<html/i.test(head)) {
    throw new Error(`${label} n’est pas un CSV (page HTML)`);
  }
}

function parseSeasonTables(rows) {
  const byId = {};
  const regionHead = findCell(rows, (row, c) => (
    fold(row[c]) === 'team' && fold(row[c + 1]) === 'region'
  ));
  if (regionHead) {
    const labels = regionHead.row.map((value) => fold(value));
    const regionScoreCol = labels.findIndex((label) => label.startsWith('current region'));
    const seasonScoreCol = labels.findIndex((label) => label.startsWith('season score'));
    for (let r = regionHead.r + 1; r < rows.length; r += 1) {
      const teamRaw = cell(rows[r], regionHead.c);
      if (!teamRaw) break;
      const boat = qcBoat(teamRaw);
      if (!boat || boat.boat) continue;
      const region = cell(rows[r], regionHead.c + 1);
      if (fold(region) !== 'quebec') continue;
      byId[boat.registryId] = {
        registryId: boat.registryId,
        region: 'Québec',
        regionScore: regionScoreCol >= 0 ? num(cell(rows[r], regionScoreCol)) : null,
        score: seasonScoreCol >= 0 ? num(cell(rows[r], seasonScoreCol)) : null,
        rank: null,
        field: null,
      };
    }
  }

  const rankHead = findCell(rows, (row, c) => (
    fold(row[c]) === 'rank'
    && fold(row[c + 1]) === 'team'
    && fold(row[c + 2]).startsWith('season')
  ));
  const ranked = [];
  if (rankHead) {
    for (let r = rankHead.r + 1; r < rows.length; r += 1) {
      const rank = int(cell(rows[r], rankHead.c));
      const teamRaw = cell(rows[r], rankHead.c + 1);
      if (rank == null || !teamRaw) break;
      const boat = qcBoat(teamRaw);
      const score = num(cell(rows[r], rankHead.c + 2));
      ranked.push({ rank, boat, score });
    }
    const field = ranked.length;
    for (const row of ranked) {
      if (!row.boat || row.boat.boat) continue;
      const prev = byId[row.boat.registryId] || {
        registryId: row.boat.registryId,
        region: 'Québec',
        regionScore: null,
        score: row.score,
        rank: null,
        field: null,
      };
      prev.rank = row.rank;
      prev.field = field;
      if (row.score != null) prev.score = row.score;
      byId[row.boat.registryId] = prev;
    }
  }
  return byId;
}

function parseScoreEvents(rows, seasonStartYear) {
  const events = [];
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const m = String(value || '').trim().match(EVENT_RE);
      if (!m) return;
      const range = parseLooseRange(m[2], seasonStartYear);
      if (!range) return;
      let header = null;
      for (let i = r + 1; i < Math.min(rows.length, r + 4); i += 1) {
        if (fold(rows[i][c]) === 'team') {
          header = i;
          break;
        }
      }
      if (header == null) return;
      const map = headerSlice(rows[header], c);
      const teamCol = colOf(map, ['team']);
      const rankCol = colOf(map, ['rank']);
      const notesCol = colOf(map, ['notes']);
      const resultCol = colOf(map, ['result (r)', 'result']);
      const fleetCol = colOf(map, ['fleet size (f)', 'fleet size', 'fleet']);
      const athleteCol = colOf(map, ['athlete']);
      const boats = [];
      for (let i = header + 1; i < rows.length; i += 1) {
        const teamRaw = cell(rows[i], teamCol);
        if (!teamRaw) break;
        if (EVENT_RE.test(teamRaw)) break;
        const notes = notesCol >= 0 ? cell(rows[i], notesCol) : '';
        const boat = qcBoat(teamRaw);
        boats.push({
          teamRaw,
          boat,
          rank: rankCol >= 0 ? int(cell(rows[i], rankCol)) : null,
          result: resultCol >= 0 ? int(cell(rows[i], resultCol)) : null,
          fleet: fleetCol >= 0 ? int(cell(rows[i], fleetCol)) : null,
          athlete: athleteCol >= 0 ? cell(rows[i], athleteCol) : '',
          noShow: /no show/i.test(notes),
          notScored: /not scored/i.test(notes),
        });
      }
      const field = boats.filter((boat) => boat.rank != null || boat.result != null).length;
      events.push({
        name: m[1].trim(),
        start: range.start,
        end: range.end,
        boats,
        field,
      });
    });
  });
  return events;
}

function parseSchedule(rows, seasonStartYear) {
  const head = findCell(rows, (row, c) => fold(row[c]) === 'date' && row.some((value) => /events/i.test(String(value || ''))));
  if (!head) return [];
  const labels = head.row.map((value) => fold(value));
  const dateCol = labels.findIndex((label) => label === 'date');
  const eventCol = labels.findIndex((label) => label.includes('event'));
  const hostCol = labels.findIndex((label) => label === 'host');
  const venueCol = labels.findIndex((label) => label === 'venue');
  const tierCol = labels.findIndex((label) => label === 'tier');
  let teamHeader = null;
  for (let r = head.r; r < Math.min(rows.length, head.r + 3); r += 1) {
    const idx = rows[r].findIndex((value) => /^host\s*\(/i.test(String(value || '').trim()));
    if (idx >= 0) {
      teamHeader = { r, c: idx };
      break;
    }
  }
  const teamCols = [];
  let notesCol = -1;
  if (teamHeader) {
    for (let c = teamHeader.c; c < rows[teamHeader.r].length; c += 1) {
      const label = fold(rows[teamHeader.r][c]);
      if (!label) continue;
      if (label === 'notes') {
        notesCol = c;
        break;
      }
      if (label === 'teams' || label === 'entries') break;
      teamCols.push(c);
    }
  }
  const events = [];
  for (let r = (teamHeader ? teamHeader.r : head.r) + 1; r < rows.length; r += 1) {
    const row = rows[r];
    const name = cell(row, eventCol);
    const when = parseLooseRange(cell(row, dateCol), seasonStartYear);
    if (!name || !when) continue;
    const tier = cell(row, tierCol);
    if (/clinic/i.test(tier) || /clinic/i.test(name)) continue;
    const tokens = [];
    if (hostCol >= 0) tokens.push(cell(row, hostCol));
    for (const c of teamCols) tokens.push(cell(row, c));
    if (notesCol >= 0) {
      for (const part of cell(row, notesCol).split(/[,;/]+/)) tokens.push(part);
    }
    const qc = [];
    const seen = new Set();
    for (const token of tokens) {
      const boat = qcBoat(token);
      if (!boat) continue;
      const key = `${boat.registryId}:${boat.boat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      qc.push(boat);
    }
    if (!qc.length) continue;
    events.push({
      name,
      start: when.start,
      end: when.end,
      host: cell(row, hostCol),
      venue: cell(row, venueCol),
      tier,
      qc,
    });
  }
  return events;
}

function resultEntry(event, boatRow, club, urls) {
  const place = boatRow.fleet && boatRow.result ? boatRow.result : boatRow.rank;
  const field = boatRow.fleet && boatRow.result ? boatRow.fleet : event.field;
  if (place == null || !field) return null;
  const fr = eventFr(event.name);
  const boatLabel = boatRow.boat ? ` · équipage ${boatRow.boat}` : '';
  const boatEn = boatRow.boat ? ` · crew ${boatRow.boat}` : '';
  const athlete = boatRow.athlete ? ` · ${boatRow.athlete}` : '';
  const venue = event.venue ? ` · ${event.venue}` : '';
  const entry = {
    date: event.end || event.start,
    time: '',
    opponent: `${fr}${boatLabel}`,
    opponentEn: `${event.name}${boatEn}`,
    opponentFullName: `${event.name}${athlete}${venue}`,
    opponentCode: 'CICS',
    home: null,
    sport: 'sailing',
    scoreKind: 'place',
    competition: `CICSA · ${fr}${boatLabel}`,
    url: urls.results,
    gameId: `cicsa:${event.end || event.start}:${fold(event.name).replace(/\s+/g, '-')}:${club.registryId}:${boatRow.boat || '1'}`,
    scoreFor: place,
    scoreAgainst: field,
    notScored: boatRow.notScored || undefined,
  };
  if (place <= 3) entry.result = 'W';
  else if (place <= Math.ceil(field / 2)) entry.result = 'D';
  else entry.result = 'L';
  return entry;
}

function nextEntry(event, club, urls) {
  const fr = eventFr(event.name);
  const boat = event.boat || '';
  const boatLabel = boat ? ` · équipage ${boat}` : '';
  const boatEn = boat ? ` · crew ${boat}` : '';
  const venue = event.venue ? ` · ${event.venue}` : '';
  return {
    date: event.date,
    time: '',
    opponent: `${fr}${boatLabel}`,
    opponentEn: `${event.name}${boatEn}`,
    opponentFullName: `${event.name}${venue}`,
    opponentCode: 'CICS',
    home: null,
    sport: 'sailing',
    scoreKind: 'place',
    competition: `CICSA · ${fr}${boatLabel}`,
    url: urls.schedule,
    gameId: `cicsa-next:${event.start}:${fold(event.name).replace(/\s+/g, '-')}:${club.registryId}:${boat || '1'}`,
  };
}

function clubById(clubs) {
  const map = {};
  for (const club of clubs || []) {
    if (club && club.registryId) map[club.registryId] = club;
  }
  return map;
}

/**
 * @param {string} scoresCsv
 * @param {string} scheduleCsv
 * @param {{
 *   seasonStartYear?: number,
 *   seasonLabel?: string,
 *   clubs?: object[],
 *   resultsUrl?: string,
 *   scheduleUrl?: string,
 *   today?: string|Date,
 * }} [options]
 */
function buildCicsaQcTeams(scoresCsv, scheduleCsv, options = {}) {
  assertCsv(scoresCsv, 'Feuille de scores CICSA');
  assertCsv(scheduleCsv, 'Calendrier CICSA');
  const seasonStartYear = Number(options.seasonStartYear) || 2026;
  const seasonLabel = options.seasonLabel || `${seasonStartYear}-${seasonStartYear + 1}`;
  const today = typeof options.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.today)
    ? options.today
    : torontoYmd(options.today ? new Date(options.today) : new Date());
  const urls = {
    results: options.resultsUrl || 'https://cicsailing.ca/season-results',
    schedule: options.scheduleUrl || 'https://cicsailing.ca/season-schedule',
  };
  const clubs = clubById(options.clubs);
  const scoreRows = parseCsv(scoresCsv);
  const scheduleRows = parseCsv(scheduleCsv);
  const standings = parseSeasonTables(scoreRows);
  const events = parseScoreEvents(scoreRows, seasonStartYear);
  const schedule = parseSchedule(scheduleRows, seasonStartYear);

  const scheduleByName = new Map();
  for (const event of schedule) scheduleByName.set(fold(event.name), event);

  /** @type {Record<string, object[]>} */
  const results = {};
  /** @type {Record<string, object[]>} */
  const upcoming = {};
  const ensure = (id) => {
    if (!results[id]) results[id] = [];
    if (!upcoming[id]) upcoming[id] = [];
  };

  for (const event of events) {
    const scheduled = scheduleByName.get(fold(event.name));
    const enriched = {
      ...event,
      venue: scheduled ? scheduled.venue : '',
      host: scheduled ? scheduled.host : '',
    };
    for (const boatRow of event.boats) {
      if (!boatRow.boat || boatRow.noShow) continue;
      ensure(boatRow.boat.registryId);
      const club = clubs[boatRow.boat.registryId] || { registryId: boatRow.boat.registryId };
      const entry = resultEntry(enriched, { ...boatRow, boat: boatRow.boat.boat }, club, urls);
      if (entry && entry.date && entry.date <= today) results[boatRow.boat.registryId].push(entry);
    }
  }

  for (const event of schedule) {
    if (event.end < today) continue;
    const scored = events.find((item) => fold(item.name) === fold(event.name));
    const primaries = event.qc.filter((boat) => !boat.boat);
    const boats = primaries.length ? primaries : event.qc;
    for (const boat of boats) {
      const already = scored && scored.boats.some((row) => (
        row.boat
        && row.boat.registryId === boat.registryId
        && !row.noShow
        && (row.rank != null || row.result != null)
      ));
      if (already) continue;
      ensure(boat.registryId);
      const date = event.start >= today ? event.start : today;
      upcoming[boat.registryId].push(nextEntry(
        { ...event, date, boat: '' },
        clubs[boat.registryId] || boat,
        urls,
      ));
    }
  }

  const ids = new Set([
    ...Object.keys(standings),
    ...Object.keys(results),
    ...Object.keys(upcoming),
    ...Object.keys(clubs),
  ]);
  const teams = {};
  for (const registryId of ids) {
    const club = clubs[registryId];
    if (!club) continue;
    const season = standings[registryId] || null;
    const past = (results[registryId] || []).slice().sort((a, b) => (
      String(b.date || '').localeCompare(String(a.date || ''))
      || (Number(a.scoreFor) || 99) - (Number(b.scoreFor) || 99)
    ));
    const nextGames = (upcoming[registryId] || []).slice().sort((a, b) => (
      String(a.date || '').localeCompare(String(b.date || ''))
    ));
    const soonest = nextGames[0] || null;
    if (!past.length && !soonest && !season) continue;
    const team = {
      id: `sailing:universitaire:${registryId}`,
      rseqTeamId: club.rseqTeamId || registryId,
      leagueId: 'cicsa',
      name: club.clubName || club.shortName || club.name || registryId,
      code: club.code || '',
      sector: 'universitaire',
      sport: 'sailing',
      sportLabel: 'Voile',
      sex: null,
      division: 'CICSA',
      usports: false,
      leagueLabel: 'CICSA · association étudiante QC',
      results: past,
      lastGame: past[0] || null,
      nextGames: soonest ? [soonest] : [],
      nextGame: soonest,
      record: null,
      source: 'cicsa',
      fullName: club.name || club.fullName || '',
      province: 'QC',
      registryId,
      kind: 'association-etudiante',
      clubNote: club.note || 'Club de voile universitaire — circuit CICSA. Distinct du programme d’excellence.',
      url: club.url || urls.results,
    };
    if (season && season.rank && season.field) {
      team.cicsaSeason = {
        season: seasonLabel,
        region: 'Québec',
        rank: season.rank,
        field: season.field,
        score: season.score,
        regionScore: season.regionScore,
        url: urls.results,
      };
    }
    teams[team.id] = team;
  }
  return { teams, standings, events, schedule };
}

module.exports = {
  parseCsv,
  torontoYmd,
  qcBoat,
  buildCicsaQcTeams,
};

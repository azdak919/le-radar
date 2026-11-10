// Formats natifs du Radar (logique pure, testée dans tests/social-formats.mjs) :
//  - « Résultats du week-end » (U SPORTS + RSEQ) depuis sports.json ;
//  - « À écouter ce soir » depuis radio-schedules.json.
// Aucune publication ici : ce module construit des modèles et des textes par réseau, avec contrôles de cohérence.
import { torontoDay, torontoHour, torontoWeekday } from './policy.mjs';
import { xlen, personCredit } from './lib.mjs';
void personCredit;

export const SPORT_EMOJI = { football: '🏈', 'flag-football': '🏈', hockey: '🏒', basketball: '🏀', volleyball: '🏐', soccer: '⚽', rugby: '🏉', badminton: '🏸' };
export const SPORT_WEIGHT = { football: 100, hockey: 95, basketball: 80, volleyball: 70, soccer: 65, rugby: 55, 'flag-football': 20, badminton: 10 };
export const SPORT_HASH = { football: '#FootballU', 'flag-football': '#FootballU', hockey: '#HockeyU', basketball: '#BasketU', volleyball: '#VolleyU', soccer: '#SoccerU', rugby: '#RugbyU', badminton: '#BadmintonU' };
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 6-8 nov. » ou « 30 oct.-1 nov. » à partir de deux dates AAAA-MM-JJ. */
export function frenchRange(a, b) {
  const [, ma, da] = a.split('-').map(Number), [, mb, db] = b.split('-').map(Number);
  return ma === mb ? `${da}-${db} ${MONTHS[mb - 1]}` : `${da} ${MONTHS[ma - 1]}-${db} ${MONTHS[mb - 1]}`;
}
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Dernier week-end terminé (vendredi → dimanche, jours civils Toronto) : le dimanche le plus récent strictement avant aujourd'hui. */
export function weekendWindow(now = Date.now()) {
  const today = torontoDay(now), dow = torontoWeekday(now);
  const sunday = addDays(today, -(dow === 0 ? 7 : dow));
  return { start: addDays(sunday, -2), end: sunday, key: sunday, label: frenchRange(addDays(sunday, -2), sunday) };
}

const shortCollege = s => String(s || '').replace(/^(Collège|Cégep|College)\s+(de la |de l'|de |du |d'|des )?/i, '').replace(/^Collège\s+/i, '').trim();
const isInt = n => Number.isInteger(n) && n >= 0;

/**
 * Parties du week-end, dédoublonnées par identifiant de match (chaque match figure dans la fiche des deux équipes).
 * Un match vu des deux côtés doit être symétrique (scores et résultat) ; sinon il est écarté et signalé (`rejected`).
 * Un match vu d'un seul côté (adversaire hors catalogue) est gardé, marqué « single ».
 */
export function collectGames(teams, win) {
  const groups = new Map(), rejected = [];
  for (const t of Object.values(teams || {})) for (const r of t.results || []) {
    if (!r || r.date < win.start || r.date > win.end || r.priorSeason) continue;
    // Même match vu par les deux équipes (identifiants de match parfois différents d'une source à l'autre) : signature date + sport + sexe + équipes.
    const pair = t.registryId && r.opponentRegistryId ? [t.registryId, r.opponentRegistryId].sort().join('~') : '';
    const key = pair ? [r.date, r.sport || t.sport, t.sex, pair].join('|') : r.gameId || [r.date, r.sport || t.sport, t.sex, t.registryId, String(r.opponent || '').toLowerCase()].join('|');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ t, r });
  }
  const games = [];
  for (const [key, views] of groups) {
    const { t, r } = views[0];
    if (!isInt(r.scoreFor) || !isInt(r.scoreAgainst) || !r.result) { rejected.push({ key, why: 'score absent' }); continue; }
    const mirrored = views.slice(1).find(v => v.t.id !== t.id);
    if (views.length > 2) { rejected.push({ key, why: 'plus de deux fiches' }); continue; }
    if (mirrored) {
      const m = mirrored.r, comp = { W: 'L', L: 'W', D: 'D' }[r.result];
      if (m.scoreFor !== r.scoreAgainst || m.scoreAgainst !== r.scoreFor || m.result !== comp || m.date !== r.date) { rejected.push({ key, why: 'fiches incohérentes', a: [t.nickname || t.name, r.scoreFor, r.scoreAgainst], b: [mirrored.t.nickname || mirrored.t.name, m.scoreFor, m.scoreAgainst] }); continue; }
    } else if (views.length === 2) { rejected.push({ key, why: 'deux fiches de la même équipe' }); continue; }
    // orientation : gagnant en premier ; égalité : domicile en premier
    const me = { reg: t.registryId, nick: t.nickname, full: t.fullName || t.institutionName || t.name, score: r.scoreFor };
    const op = { reg: r.opponentRegistryId, nick: r.opponentNickname, full: r.opponentFullName || r.opponent, score: r.scoreAgainst };
    const meFirst = r.scoreFor > r.scoreAgainst || (r.scoreFor === r.scoreAgainst && r.home !== false);
    const [A, B] = meFirst ? [me, op] : [op, me];
    const sector = t.sector, name = s => sector === 'universitaire' ? (s.nick || shortCollege(s.full)) : shortCollege(s.full || s.nick);
    if (!name(A) || !name(B)) { rejected.push({ key, why: 'nom manquant' }); continue; }
    games.push({
      key, date: r.date, sport: r.sport || t.sport, sex: t.sex, sector, division: t.division || null, competition: r.competition || t.leagueLabel || '',
      A: { ...A, name: name(A) }, B: { ...B, name: name(B) }, tie: r.scoreFor === r.scoreAgainst, confirmed: views.length === 2,
      priority: Math.min(...views.map(v => Number.isFinite(v.t.priority) ? v.t.priority : 99)), url: r.url || '',
    });
  }
  return { games, rejected };
}

const divRank = d => ({ D1: 20, D2: 10, D3: 0 }[d] ?? 0);
const margin = g => Math.abs(g.A.score - g.B.score);
const score = g => (SPORT_WEIGHT[g.sport] ?? 5) + (g.sector === 'universitaire' ? (g.priority <= 4 ? 15 : 0) : divRank(g.division)) + (g.confirmed ? 5 : 0);

/** Sélection : U SPORTS (universitaire) puis RSEQ collégial ; jamais deux fois le même match ; ≤ 2 par sport (≤ 1 au collégial). */
export function selectResults(games, { uni = 4, coll = 2 } = {}) {
  const pick = (list, max, perSport) => {
    const out = [], count = new Map();
    for (const g of [...list].sort((a, b) => score(b) - score(a) || margin(a) - margin(b) || a.key.localeCompare(b.key))) {
      if (out.length >= max) break;
      if ((count.get(g.sport) || 0) >= perSport) continue;
      out.push(g); count.set(g.sport, (count.get(g.sport) || 0) + 1);
    }
    return out;
  };
  const u = games.filter(g => g.sector === 'universitaire'), c = games.filter(g => g.sector === 'collegial' && !['badminton', 'flag-football'].includes(g.sport));
  return { uni: pick(u, uni, 2), coll: pick(c, coll, 1), totals: { uni: u.length, coll: games.length - u.length } };
}

export function weekendModel(sportsData, now = Date.now(), cfg = {}) {
  const win = weekendWindow(now), { games, rejected } = collectGames(sportsData.teams, win);
  const sel = selectResults(games, cfg.maxGames || {});
  const fetchedAt = Date.parse(sportsData.fetchedAt || sportsData.updated || ''), ageH = Number.isFinite(fetchedAt) ? (now - fetchedAt) / 3600e3 : Infinity;
  const doubts = [];
  if (!(ageH <= (cfg.maxDataAgeH ?? 36))) doubts.push(`données sports trop anciennes ou sans date (${Number.isFinite(ageH) ? Math.round(ageH) + ' h' : 'inconnu'})`);
  if (sel.uni.length + sel.coll.length < 2) doubts.push('moins de deux résultats vérifiés');
  const shown = [...sel.uni, ...sel.coll], bad = rejected.filter(r => r.why !== 'score absent');
  if (bad.length) doubts.push(`${bad.length} match(s) écarté(s) (fiches incohérentes ou en double : non publiés)`);
  return { window: win, ...sel, rejected, ageH, doubts, hardDoubt: doubts.filter(d => !/écarté/.test(d)), shown };
}
/** Modèle restreint aux sections publiées (`sections` de policy.json : « uni », « coll ») ; le reste reste en aperçu. */
export function publishedModel(model, sections = ['uni', 'coll']) {
  const uni = sections.includes('uni') ? model.uni : [], coll = sections.includes('coll') ? model.coll : [];
  const doubts = [...model.doubts]; if (uni.length + coll.length < 2) doubts.push('moins de deux résultats dans les sections publiées');
  return { ...model, uni, coll, shown: [...uni, ...coll], doubts: [...new Set(doubts)], hardDoubt: [...new Set(doubts)].filter(d => !/écarté/.test(d)) };
}

// ── Textes ───────────────────────────────────────────────────────────────────
const lc = s => String(s || '').toLowerCase();
const stripAccents = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const camel = s => stripAccents(s).replace(/&/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
const CLOSING_TAGS = ['#SportÉtudiant', '#Québec'];

/** Hashtag d'équipe : surnom en CamelCase sans accents (ex. #RougeEtOr), jamais le compte athletics. */
function teamHash(side) {
  const base = side?.nick || '';
  if (!base) return '';
  const tag = '#' + camel(base);
  return tag === '#' ? '' : tag;
}

/**
 * Hashtags du format « Résultats du week-end », groupés pour pouvoir retirer d'abord les équipes si le texte dépasse la limite.
 * Ligues présentes, sport « U » par sport présent, quelques équipes (surnom, fréquence puis ordre alphabétique), puis #SportÉtudiant #Québec.
 */
export function resultsTagGroups(model, teamAcc = {}) {
  void teamAcc;
  const leagues = [];
  if (model.uni.length) leagues.push('#USports');
  if (model.uni.length || model.coll.length) leagues.push('#RSEQ');
  const bySport = new Map();
  for (const x of model.shown) bySport.set(x.sport, (bySport.get(x.sport) || 0) + 1);
  const sports = [...bySport].sort((a, b) => b[1] - a[1] || (SPORT_WEIGHT[b[0]] ?? 0) - (SPORT_WEIGHT[a[0]] ?? 0)).map(([s]) => SPORT_HASH[s]).filter(Boolean);
  const counts = new Map();
  for (const x of model.shown) for (const side of [x.A, x.B]) {
    if (!side?.reg) continue; // adversaire hors catalogue : pas une équipe québécoise du Radar
    const tag = teamHash(side);
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const teams = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([tag]) => tag);
  return { leagues, sports, teams, closing: [...CLOSING_TAGS] };
}

/** Hashtags dédoublonnés, au plus `max` (~8) : ligues, sports, équipes (place restante), formalités. */
export function resultsTags(model, max, teamAcc = {}) {
  if (!(max > 0)) return [];
  const { leagues, sports, teams, closing } = resultsTagGroups(model, teamAcc);
  const out = [];
  const take = (arr, room = max) => { for (const t of arr) if (t && !out.includes(t) && out.length < room) out.push(t); };
  take(leagues);
  take(sports);
  const reserved = closing.filter(t => !out.includes(t)).length;
  const teamRoom = out.length + reserved <= max ? max - reserved : max;
  take(teams, teamRoom);
  take(closing);
  return out;
}
/** Étiquettes Tumblr (minuscules, sans #, 10 à 15). */
export function resultsTumblrTags(model, teamAcc = {}) {
  const t = ['usports', 'rseq', 'résultats sportifs', 'sports universitaires', 'sport collégial', 'québec', 'montréal', 'sport étudiant'];
  for (const x of model.shown) { t.push(lc(x.sport === 'soccer' ? 'soccer' : x.sport)); for (const s of [x.A, x.B]) t.push(lc(s.nick || s.name)); }
  for (const x of model.uni) for (const s of [x.A, x.B]) { const i = teamAcc.teams?.[s.reg]?.institution; if (i) t.push(lc(i.slice(1))); }
  return [...new Set(t.map(x => x.replace(/[#,]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 15);
}

const sexMark = g => (g.sex === 'F' && g.sport !== 'football' ? ' (F)' : '');
/** Ligne d'un match : « 🏒 Carabins 4, Martlets 0 (F) ». `mention(side)` reste disponible mais le format résultats ne l'utilise plus. */
export function gameLine(g, mention = () => '') {
  const side = s => { const m = mention(s); return `${s.name}${m ? ` (${m})` : ''} ${s.score}`; };
  return `${SPORT_EMOJI[g.sport] || '🏅'} ${side(g.A)}, ${side(g.B)}${sexMark(g)}`;
}

/**
 * Texte « Résultats du week-end » pour un réseau. `net` : { limit, len, subheaders }.
 * Aucune mention @. Si le texte dépasse la limite, on retire d'abord les hashtags d'équipes, puis des lignes de matchs.
 * Renvoie null si même le minimum (2 résultats, sans hashtags d'équipes) ne tient pas.
 */
export function buildResultsText(model, net, { link, teamAcc = {}, tags = [], maxMentions = 0 } = {}) {
  void maxMentions;
  const len = net.len || xlen, nl = s => len(s);
  const teamSet = new Set(resultsTagGroups(model, teamAcc).teams);
  const compose = (uni, coll, hash) => {
    const hdr = `🏆 Résultats du week-end (${model.window.label})`;
    const lines = [];
    if (net.subheaders) {
      if (uni.length) lines.push(...uni.map(g => gameLine(g)));
      if (coll.length) lines.push(...(uni.length ? [''] : []), 'RSEQ collégial', ...coll.map(g => gameLine(g)));
    } else {
      lines.push(...uni.map(g => gameLine(g)), ...coll.map(g => gameLine(g)));
    }
    const body = [hdr, lines.join('\n')].join('\n\n');
    return [body, net.subheaders ? `Tous les résultats : ${link}` : link, hash.length ? hash.join(' ') : ''].filter(Boolean).join('\n\n').replace(/\n\n(#\S)/, '\n$1');
  };
  const dropTeamTag = hash => {
    const idx = hash.reduce((last, t, i) => teamSet.has(t) ? i : last, -1);
    return idx >= 0 ? hash.filter((_, i) => i !== idx) : null;
  };
  let uni = [...model.uni], coll = [...model.coll], hash = [...tags];
  for (;;) {
    const t = compose(uni, coll, hash);
    if (nl(t) <= net.limit) return t;
    const next = dropTeamTag(hash);
    if (next) { hash = next; continue; }
    if (coll.length) coll.pop();
    else if (uni.length > 2) uni.pop();
    else break;
    if (uni.length + coll.length < 2) break;
  }
  return null;
}

// ── À écouter ce soir ────────────────────────────────────────────────────────
const GENERIC_SHOW = /^(musique|programmation|en rotation|rotation|automation|rediffusion|replay|silence|signal|test|bulletin)\b/i;
const mondayOf = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const mins = s => { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
export const frenchTime = s => { const m = mins(s); const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`; };

/** Émissions du soir (une par station, grille vérifiée cette semaine), triées par heure. */
export function listenModel(radio, now = Date.now(), cfg = {}) {
  const day = torontoDay(now), dow = torontoWeekday(now), week = mondayOf(day);
  const from = (cfg.fromHour ?? 18) * 60, to = (cfg.toHour ?? 22) * 60 + 30, shows = [], skipped = [];
  for (const [id, st] of Object.entries(radio?.stations || {})) {
    if (st.verifiedWeekOf !== week) { skipped.push({ id, why: `grille non vérifiée cette semaine (${st.verifiedWeekOf || 'jamais'})` }); continue; }
    const c = (st.grid || []).filter(g => g.day === dow && mins(g.start) !== null && mins(g.start) >= from && mins(g.start) <= to && g.title && !GENERIC_SHOW.test(g.title.trim()))
      .sort((a, b) => mins(a.start) - mins(b.start));
    const g = c.find(x => mins(x.start) >= 19 * 60) || c[0];
    if (!g) { skipped.push({ id, why: 'aucune émission en soirée' }); continue; }
    shows.push({ station: id, name: st.name, start: g.start, end: g.end || '', title: g.title.trim(), url: g.url || '' });
  }
  shows.sort((a, b) => mins(a.start) - mins(b.start) || a.station.localeCompare(b.station));
  const doubts = shows.length < 2 ? ['moins de deux émissions vérifiées'] : [];
  return { day, shows: shows.slice(0, cfg.maxShows ?? 4), skipped, doubts };
}
export function buildListenText(model, net, { link, teamAcc = {}, tags = [] } = {}) {
  const len = net.len || xlen;
  const stName = s => teamAcc.stations?.[s.station]?.nom || s.name;
  const tryBuild = (shows, withMentions) => {
    const lines = shows.map(s => {
      const a = teamAcc.stations?.[s.station], h = withMentions ? (net.x ? a?.x : net.bluesky ? a?.bluesky : '') : '';
      return `${frenchTime(s.start)} · ${stName(s)}${h ? ` (${h})` : ''} : ${s.title}`;
    });
    return ['🎧 À écouter ce soir', lines.join('\n'), net.subheaders ? `Horaires complets : ${link}` : link, tags.join(' ')].filter(Boolean).join('\n\n').replace(/\n\n(#\S)/, '\n$1');
  };
  for (const withMentions of [true, false]) {
    let shows = [...model.shows];
    while (shows.length >= 2) { const t = tryBuild(shows, withMentions); if (len(t) <= net.limit) return t; shows.pop(); }
  }
  return null;
}
export function listenTags(model, max, teamAcc = {}) {
  if (!(max > 0)) return [];
  const st = model.shows.map(s => teamAcc.stations?.[s.station]?.tag).filter(Boolean);
  return ['#RadioCampus', '#Québec', ...st].filter((x, i, a) => a.indexOf(x) === i).slice(0, max);
}

/** Réseaux : limite, longueur, mentions natives. Facebook/LinkedIn/Tumblr : texte en clair, sans @. */
export const NET_SPEC = {
  x: { limit: 280, len: xlen, x: true, subheaders: false },
  bluesky: { limit: 300, len: s => [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s)].length, bluesky: true, subheaders: false },
  mastodon: { limit: 500, len: s => [...String(s).replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length, subheaders: true },
  tumblr: { limit: 1000, len: s => [...s].length, subheaders: true },
  facebook: { limit: 1500, len: s => [...s].length, subheaders: true },
  linkedin: { limit: 2000, len: s => [...s].length, subheaders: true },
};

/** Contrôles d'un texte avant toute publication : limite, doublons de lignes, pas de @ dans les résultats (ailleurs : @ vérifiés seulement), scores conformes au modèle. */
export function checkText(text, net, { model = null, teamAcc = {}, kind = 'weekend_results' } = {}) {
  const problems = [], len = net.len || xlen;
  if (!text) return ['texte vide'];
  if (len(text) > net.limit) problems.push(`trop long (${len(text)}/${net.limit})`);
  if (/undefined|NaN|\[object|null/.test(text)) problems.push('valeur invalide dans le texte');
  const lines = text.split('\n').filter(Boolean);
  if (new Set(lines).size !== lines.length) problems.push('ligne en double');
  const foundMentions = [...text.matchAll(/(^|[\s(])(@[\w.]+)/g)].map(m => m[2]);
  if (kind === 'weekend_results') {
    if (foundMentions.length) problems.push(`mention @ interdite dans les résultats : ${foundMentions[0]}`);
  } else {
    const known = new Set([
      ...Object.values(teamAcc.leagues || {}).map(x => x.x), ...Object.values(teamAcc.teams || {}).map(x => x.x),
      ...Object.values(teamAcc.stations || {}).flatMap(x => [x.x, x.bluesky]),
    ].filter(Boolean).map(lc));
    for (const m of foundMentions) if (!known.has(lc(m))) problems.push(`@ non vérifié : ${m}`);
  }
  if (kind === 'weekend_results' && model) {
    const rows = lines.filter(l => /^\p{Extended_Pictographic}/u.test(l) && /\d/.test(l) && !l.startsWith('🏆'));
    const want = model.shown.length;
    if (!rows.length || rows.length > want) problems.push(`nombre de résultats incohérent (${rows.length}/${want})`);
    for (const r of rows) { const nums = [...r.matchAll(/(?<![\w@])(\d+)(?=[,\s(]|$)/g)].map(x => +x[1]); const ok = model.shown.some(g => nums.includes(g.A.score) && nums.includes(g.B.score) && r.includes(g.A.name) && r.includes(g.B.name)); if (!ok) problems.push(`ligne sans match correspondant : ${r}`); }
  }
  return problems;
}

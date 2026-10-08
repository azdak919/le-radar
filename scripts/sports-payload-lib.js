/**
 * LE-RADAR — format compact (« packed ») de sports.json.
 *
 * Le payload complet répète chaque match sous les deux formations (plus
 * nextGame / lastGame), avec l’adversaire et l’URL RSEQ en toutes lettres.
 * Ce format range :
 *   - `games`     : un objet par gameId (champs communs à toutes les vues ;
 *                   l’URL RSEQ est recalculée depuis le gameId) ;
 *   - `opponents` : chaque combinaison opponent* une seule fois ;
 *   - `shapes`    : l’ordre des clés de chaque vue (reconstruction exacte) ;
 *   - `teams[*].$games` : vues par formation, qui ne gardent que leurs écarts
 *     (home, score, résultat…) + des index `$g` / `$o` / `$k`.
 *
 * `unpackSportsPayload(packSportsPayload(p))` est identique octet pour octet
 * à `p` (JSON.stringify). Les lecteurs appellent `unpackSportsPayload` dès le
 * chargement ; un payload déjà déplié passe tel quel.
 *
 * Les anciens lecteurs (sans dépliage) voient des formations sans
 * nextGames / results / nextGame / lastGame : ils dégradent proprement au lieu
 * d’afficher des matchs tronqués.
 *
 * UMD : require() Node ou window.RadarSportsPayload en navigateur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RadarSportsPayload = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'sports-packed-v1';
  const RSEQ_GAME_URL = 'https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=';
  /** Champs d’une formation qui portent des matchs (objet ou tableau). */
  const GAME_KEYS = ['nextGames', 'results', 'nextGame', 'lastGame'];
  const OPP_KEYS = [
    'opponent', 'opponentCode', 'opponentFullName', 'opponentNickname',
    'opponentRegistryId', 'opponentSector',
  ];
  const OPP_SET = new Set(OPP_KEYS);
  const RESERVED = new Set(['$g', '$o', '$k']);

  function isView(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function isPacked(data) {
    return !!data && data.format === FORMAT;
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  function teamList(teams) {
    if (Array.isArray(teams)) return teams;
    return teams && typeof teams === 'object' ? Object.values(teams) : [];
  }

  function mapTeams(teams, fn) {
    if (Array.isArray(teams)) return teams.map(fn);
    const out = {};
    for (const [id, team] of Object.entries(teams || {})) out[id] = fn(team);
    return out;
  }

  function eachView(team, fn) {
    for (const key of GAME_KEYS) {
      const v = team[key];
      if (Array.isArray(v)) v.forEach((g) => { if (isView(g)) fn(g); });
      else if (isView(v)) fn(v);
    }
  }

  function packSportsPayload(input) {
    if (!input || typeof input !== 'object' || isPacked(input) || !input.teams) return input;
    // Forme JSON d’abord : les clés à `undefined` (errors, sportsMissing…)
    // disparaissent comme dans le fichier écrit, sinon `shapes` / `topOrder`
    // les listeraient et un re-pack du fichier déplié différerait.
    const data = JSON.parse(JSON.stringify(input));
    const teams = teamList(data.teams);

    // Passe 1 : champs communs (même valeur) à toutes les vues d’un gameId.
    const common = new Map();
    for (const team of teams) {
      eachView(team, (g) => {
        if (typeof g.gameId !== 'string' || !g.gameId) return;
        for (const k of Object.keys(g)) if (RESERVED.has(k)) return;
        const prev = common.get(g.gameId);
        if (!prev) {
          const base = {};
          for (const [k, v] of Object.entries(g)) {
            if (k !== 'gameId' && !OPP_SET.has(k)) base[k] = v;
          }
          common.set(g.gameId, base);
          return;
        }
        for (const k of Object.keys(prev)) {
          if (!(k in g) || !sameValue(prev[k], g[k])) delete prev[k];
        }
      });
    }

    const games = [];
    const gameIndex = new Map();
    for (const [id, fields] of common) {
      const entry = { id };
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'url') continue;
        entry[k] = v;
      }
      if (!('url' in fields)) entry.url = null;
      else if (fields.url !== RSEQ_GAME_URL + id) entry.url = fields.url;
      gameIndex.set(id, games.length);
      games.push(entry);
    }

    const opponents = [];
    const oppIndex = new Map();
    const shapes = [];
    const shapeIndex = new Map();

    function packView(g) {
      for (const k of Object.keys(g)) if (RESERVED.has(k)) return g;
      const out = {};
      const keys = Object.keys(g);
      const shapeKey = keys.join('\u0000');
      if (!shapeIndex.has(shapeKey)) {
        shapeIndex.set(shapeKey, shapes.length);
        shapes.push(keys);
      }
      out.$k = shapeIndex.get(shapeKey);
      const fields = typeof g.gameId === 'string' && common.get(g.gameId);
      if (fields) out.$g = gameIndex.get(g.gameId);
      const opp = {};
      let hasOpp = false;
      for (const k of OPP_KEYS) {
        if (k in g) { opp[k] = g[k]; hasOpp = true; }
      }
      if (hasOpp) {
        const ok = JSON.stringify(opp);
        if (!oppIndex.has(ok)) {
          oppIndex.set(ok, opponents.length);
          opponents.push(opp);
        }
        out.$o = oppIndex.get(ok);
      }
      for (const k of keys) {
        if (OPP_SET.has(k)) continue;
        if (fields && (k === 'gameId' || k in fields)) continue;
        out[k] = g[k];
      }
      return out;
    }

    const packedTeams = mapTeams(data.teams, (team) => {
      if (!team || typeof team !== 'object') return team;
      const out = {};
      const packed = {};
      let any = false;
      for (const [k, v] of Object.entries(team)) {
        if (!GAME_KEYS.includes(k)) { out[k] = v; continue; }
        any = true;
        packed[k] = Array.isArray(v) ? v.map((g) => (isView(g) ? packView(g) : g))
          : (isView(v) ? packView(v) : v);
      }
      if (any) {
        // Ordre des clés de la formation, pour une reconstruction exacte.
        packed.$order = Object.keys(team);
        out.$games = packed;
      }
      return out;
    });

    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'teams') continue;
      out[k] = v;
    }
    out.format = FORMAT;
    out.gameUrlBase = RSEQ_GAME_URL;
    out.games = games;
    out.opponents = opponents;
    out.shapes = shapes;
    out.teams = packedTeams;
    // Ordre des clés de premier niveau du payload d’origine.
    out.topOrder = Object.keys(data);
    return out;
  }

  function unpackSportsPayload(data) {
    if (!isPacked(data)) return data;
    const base = data.gameUrlBase || RSEQ_GAME_URL;
    const games = Array.isArray(data.games) ? data.games : [];
    const opponents = Array.isArray(data.opponents) ? data.opponents : [];
    const shapes = Array.isArray(data.shapes) ? data.shapes : [];

    function unpackView(v) {
      if (!isView(v) || !('$k' in v)) return v;
      const flat = {};
      const game = Number.isInteger(v.$g) ? games[v.$g] : null;
      if (game) {
        for (const [k, val] of Object.entries(game)) {
          if (k === 'id') flat.gameId = val;
          else if (k !== 'url') flat[k] = val;
        }
        if (!('url' in game)) flat.url = base + game.id;
        else if (game.url !== null) flat.url = game.url;
      }
      const opp = Number.isInteger(v.$o) ? opponents[v.$o] : null;
      if (opp) Object.assign(flat, opp);
      for (const [k, val] of Object.entries(v)) {
        if (!RESERVED.has(k)) flat[k] = val;
      }
      const keys = shapes[v.$k];
      if (!Array.isArray(keys)) return flat;
      const out = {};
      for (const k of keys) if (k in flat) out[k] = flat[k];
      for (const k of Object.keys(flat)) if (!(k in out)) out[k] = flat[k];
      return out;
    }

    const teams = mapTeams(data.teams, (team) => {
      if (!team || typeof team !== 'object' || !team.$games) return team;
      const packed = team.$games;
      const flat = {};
      for (const [k, v] of Object.entries(team)) if (k !== '$games') flat[k] = v;
      for (const k of GAME_KEYS) {
        if (!(k in packed)) continue;
        const v = packed[k];
        flat[k] = Array.isArray(v) ? v.map(unpackView) : unpackView(v);
      }
      const order = Array.isArray(packed.$order) ? packed.$order : null;
      if (!order) return flat;
      const out = {};
      for (const k of order) if (k in flat) out[k] = flat[k];
      for (const k of Object.keys(flat)) if (!(k in out)) out[k] = flat[k];
      return out;
    });

    const meta = new Set(['format', 'gameUrlBase', 'games', 'opponents', 'shapes', 'topOrder']);
    const flat = {};
    for (const [k, v] of Object.entries(data)) {
      if (!meta.has(k) && k !== 'teams') flat[k] = v;
    }
    flat.teams = teams;
    const order = Array.isArray(data.topOrder) ? data.topOrder : null;
    if (!order) return flat;
    const out = {};
    for (const k of order) if (k in flat) out[k] = flat[k];
    for (const k of Object.keys(flat)) if (!(k in out)) out[k] = flat[k];
    return out;
  }

  return {
    FORMAT,
    RSEQ_GAME_URL,
    isPacked,
    packSportsPayload,
    unpackSportsPayload,
  };
}));

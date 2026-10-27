'use strict';
/**
 * Veille des chiffriers CICSA : chaque saison, CICSA publie de nouvelles
 * feuilles Google (scores, calendrier). On ne bascule que si c'est fiable :
 *  - calendrier : titre « CICSA AAAA-AA … » de la saison courante (ou plus récente) ;
 *  - scores : « Updated <mois> <jour> <année> » plus récent que la feuille actuelle.
 * Sinon on garde l'actuelle ; si elle a disparu des pages CICSA, alerte.
 * Pur : reçoit { id, head } (début du CSV), rend la décision.
 */
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function scheduleSeason(head = '') {
  const m = String(head).match(/CICSA\s+(20\d\d)(?:\s*[-–\/]\s*(\d{2,4}))?\s+(?:Draft\s+)?Schedule/i);
  return m ? Number(m[1]) : null;
}

function scoresUpdated(head = '') {
  const m = String(head).match(/Updated\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)/i);
  if (!m || !(m[1].toLowerCase() in MONTHS)) return null;
  return Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
}

function decide({ cfg = {}, seasonStartYear, listedIds = [], sheets = [] }) {
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const out = { scoresSheetId: cfg.scoresSheetId, scheduleSheetId: cfg.scheduleSheetId, changes: [], alerts: [] };
  // Calendrier : la saison la plus récente ≥ saison courante, unique.
  const curSched = scheduleSeason((byId.get(cfg.scheduleSheetId) || {}).head) || 0;
  const scheds = sheets.map((s) => ({ id: s.id, year: scheduleSeason(s.head) })).filter((s) => s.year && s.year >= seasonStartYear && s.year > curSched);
  const best = Math.max(0, ...scheds.map((s) => s.year));
  const top = scheds.filter((s) => s.year === best);
  if (top.length === 1) { out.scheduleSheetId = top[0].id; out.changes.push(`calendrier → ${top[0].id} (saison ${best})`); }
  else if (top.length > 1) out.alerts.push(`plusieurs calendriers CICSA ${best} : bascule manuelle`);
  // Scores : date « Updated » la plus récente, strictement plus récente que l'actuelle.
  const curScores = scoresUpdated((byId.get(cfg.scoresSheetId) || {}).head) || 0;
  const scores = sheets.map((s) => ({ id: s.id, at: scoresUpdated(s.head) })).filter((s) => s.at && s.at > curScores && s.id !== cfg.scoresSheetId);
  scores.sort((a, b) => b.at - a.at);
  if (scores.length && (scores.length === 1 || scores[0].at > scores[1].at)) {
    out.scoresSheetId = scores[0].id; out.changes.push(`scores → ${scores[0].id} (mis à jour ${new Date(scores[0].at).toISOString().slice(0, 10)})`);
  }
  for (const [k, id] of [['scores', out.scoresSheetId], ['calendrier', out.scheduleSheetId]]) {
    if (listedIds.length && !listedIds.includes(id)) out.alerts.push(`feuille ${k} ${id} n'est plus listée sur cicsailing.ca`);
  }
  return out;
}

module.exports = { scheduleSeason, scoresUpdated, decide };

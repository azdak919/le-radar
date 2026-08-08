/**
 * Dérive des grilles horaires — la grille publiée dit-elle encore ce que la
 * station diffuse aujourd'hui ?
 *
 * `radio-schedules.json` est un instantané collecté aux deux semaines. Or une
 * station réécrit sa page le jour même quand elle sort de sa programmation :
 * CHYZ a déplacé les Capitales de Québec de 18:50 à 16:50 et supprimé
 * l'émission régulière du créneau, ce qu'aucun instantané ne pouvait prévoir.
 *
 * Comparer la grille publiée à la grille **relue à l'instant** rend ce
 * hors-programmation visible, pour n'importe quelle station qui publie un
 * horaire — donc pour les stations à venir aussi, sans code dédié.
 *
 * Ce module est pur : la collecte réseau reste dans detect-schedule-drift.js.
 */

/**
 * Au-delà de cette part de créneaux changés, ce n'est plus une émission
 * spéciale : c'est une grille refaite (rentrée). Les deux demandent des gestes
 * opposés — la spéciale se corrige toute seule au prochain passage du bot
 * now-playing, la refonte réclame `fetch-radio-schedules.js --update`.
 */
const OVERHAUL_RATIO = 0.4;

/**
 * …mais une proportion seule ment sur les petites grilles. CHYZ ne publie que
 * 25 créneaux et CHOQ 22 : un seul soir de match y pèse déjà plus de 40 %, et
 * serait annoncé comme une refonte — donc une fausse consigne de recollecte.
 * Une rentrée déplace une grille entière, pas trois cases : il faut les deux
 * signaux.
 */
const OVERHAUL_MIN_SLOTS = 8;

/** Un créneau vaut par son jour, ses bornes et son titre — pas par son URL. */
function slotKey(slot) {
  return [
    Number(slot?.day),
    String(slot?.start || ''),
    String(slot?.end || ''),
    String(slot?.title || '').toLowerCase().replace(/\s+/g, ' ').trim(),
  ].join('|');
}

/** Créneau lisible en une ligne de rapport : « ven 16:50–23:00 Capitales ». */
const DAY_LABELS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

function slotLabel(slot) {
  const day = DAY_LABELS[Number(slot?.day)] || '?';
  return `${day} ${slot?.start || '??:??'}–${slot?.end || '??:??'} ${slot?.title || ''}`.trim();
}

/**
 * Créneaux ajoutés / retirés entre deux grilles.
 * @returns {{ added: object[], removed: object[] }}
 */
function diffGrids(published = [], fresh = []) {
  const pub = Array.isArray(published) ? published : [];
  const nxt = Array.isArray(fresh) ? fresh : [];
  const pubKeys = new Set(pub.map(slotKey));
  const freshKeys = new Set(nxt.map(slotKey));
  return {
    added: nxt.filter((s) => !pubKeys.has(slotKey(s))),
    removed: pub.filter((s) => !freshKeys.has(slotKey(s))),
  };
}

/**
 * Qualifie l'écart d'une station.
 *
 *   unreachable  la source ne répond plus / ne se parse plus — on ne sait rien
 *   stable       grille identique
 *   drift        quelques créneaux bougent → émission spéciale, hors grille
 *   overhaul     la grille a été refaite → relancer la collecte
 *
 * @returns {{ id, status, published, fresh, added, removed, changed, ratio }}
 */
function classifyDrift(id, published = [], fresh = [], {
  overhaulRatio = OVERHAUL_RATIO,
  overhaulMinSlots = OVERHAUL_MIN_SLOTS,
} = {}) {
  const pubCount = Array.isArray(published) ? published.length : 0;
  const freshCount = Array.isArray(fresh) ? fresh.length : 0;
  const base = {
    id,
    published: pubCount,
    fresh: freshCount,
    added: [],
    removed: [],
    changed: 0,
    ratio: 0,
  };

  // Source muette : ne jamais lire un silence comme « la station a tout changé ».
  if (!freshCount) return { ...base, status: 'unreachable' };
  // Rien de publié : il n'y a pas de dérive à mesurer, il y a une grille à
  // collecter — même geste qu'une refonte.
  if (!pubCount) return { ...base, fresh: freshCount, status: 'overhaul' };

  const { added, removed } = diffGrids(published, fresh);
  const changed = added.length + removed.length;
  const ratio = pubCount ? changed / pubCount : 1;
  const out = {
    ...base,
    added: added.map(slotLabel),
    removed: removed.map(slotLabel),
    changed,
    ratio: Number(ratio.toFixed(3)),
  };

  if (!changed) return { ...out, status: 'stable' };
  const overhaul = ratio >= overhaulRatio && changed >= overhaulMinSlots;
  return { ...out, status: overhaul ? 'overhaul' : 'drift' };
}

/** Compte par statut + liste des stations à regarder, pour bot-status.json. */
function summarizeDrift(stations = []) {
  const by = (status) => stations.filter((s) => s.status === status);
  return {
    checked: stations.length,
    stable: by('stable').length,
    drift: by('drift').map((s) => s.id),
    overhaul: by('overhaul').map((s) => s.id),
    unreachable: by('unreachable').map((s) => s.id),
  };
}

module.exports = {
  OVERHAUL_RATIO,
  OVERHAUL_MIN_SLOTS,
  DAY_LABELS,
  slotKey,
  slotLabel,
  diffGrids,
  classifyDrift,
  summarizeDrift,
};

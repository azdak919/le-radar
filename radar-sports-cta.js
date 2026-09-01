// LE-RADAR — bandeau sports / CTA du mât
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

// ═══════════════════════════════════════════════════════════════════════════
//  SPORTS STRIP (RSEQ collégial + universitaire QC) — sous la radio
//  Rotation carte-par-carte (comme la météo), tons par sport / résultat.
// ═══════════════════════════════════════════════════════════════════════════
const SPORTS_FAV_KEY = 'radar-sports-favorites-v1';
/**
 * Boost éditorial doux (fallback si sports.json n’a pas encore `priority`
 * du registre sports-teams.json). Après favoris + imminence.
 */
const SPORTS_DEFAULT_CODES = ['LAV', 'MCG', 'UCON', 'MTL', 'UQAM', 'USHE', 'BIS', 'GAR', 'LIM', 'VAN'];
/** Palette par sport (évite le tout-rouge des prochains matchs). */
const SPORTS_SPORT_TONES = {
  football: '#c45c2a',
  basketball: '#d88a0a',
  soccer: '#3d9a6a',
  'soccer-interieur': '#15803d',
  futsal: '#166534',
  volleyball: '#3b82c4',
  hockey: '#5498bb',
  sailing: '#0e7490',
  rugby: '#7c2d12',
  badminton: '#0f766e',
  baseball: '#9a3412',
  'flag-football': '#854d0e',
  athletisme: '#b45309',
  'cross-country': '#92400e',
  natation: '#0369a1',
  golf: '#15803d',
  cheerleading: '#be185d',
  ultimate: '#7c3aed',
  default: '#66839e',
};
/*
 * Fenêtres d’urgence (ms) — parité scoreboards ESPN / apps scores.
 *
 * Attention aux noms : ils se lisent à l’envers du code qu’ils servent. Le test
 * de `sportsUrgency` est `t >= now - SPORTS_LIVE_BEFORE_MS`, ce qui retient un
 * match dont le coup d’envoi date de **moins de 2 h**, et
 * `t <= now + SPORTS_LIVE_AFTER_MS`, un coup d’envoi dans **moins de 3 h**.
 * La fenêtre réelle est donc [coup d’envoi − 3 h ; coup d’envoi + 2 h].
 * On ne renomme pas : ces bornes pilotent le tri, pas l’affichage. Le registre
 * visuel « en direct » a ses propres bornes, plus serrées (SPORTS_LIVE_VISUAL_*).
 */
const SPORTS_LIVE_BEFORE_MS = 2 * 3600 * 1000;
const SPORTS_LIVE_AFTER_MS = 3 * 3600 * 1000;
const SPORTS_IMMINENT_MS = 7 * 24 * 3600 * 1000; /* 7 jours — tri d’urgence seulement */
/**
 * Puces scores : SSOT `RadarSportsFreshness.MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO`
 * (5 j civils Toronto). Plus de filet glissant 5×24 h.
 */
const SPORTS_RECENT_RESULT_DAYS = (typeof RadarSportsFreshness !== 'undefined'
  && Number.isFinite(RadarSportsFreshness.MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO))
  ? RadarSportsFreshness.MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO
  : 5;
/**
 * Marquee puces match (2 lignes, noms longs) — plus lent que la CTA (5,5 s).
 * Un overflow dense (voile / place / événement) à 5,5 s se lisait en zapping.
 */
const SPORTS_MATCH_SCROLL_ONE_WAY_MS = 8000;
/** Plafond faces CTA après dédup reçoit/chez. */
const SPORTS_CTA_MAX_POOL = 80;
/** Hors saison : 1er match de chacun des N premiers jours d’action dès le jour lead. */
const SPORTS_CTA_OFFSEASON_LEAD_DAYS = 7;
/*
 * Registre d’alerte de la carte CTA — focus-group le-radar-sports-first-glance
 * (garde-fou `registre-alerte-reserve`) et le-radar-cta-sports-badge.
 *
 * La pastille rouge et le point live sont **gagnés** par un match en cours, pas
 * allumés par défaut : un point qui pulse pour un match dans douze jours est une
 * promesse fausse. Bornes serrées, indépendantes de celles du tri.
 */
const SPORTS_LIVE_VISUAL_LEAD_MS = 15 * 60 * 1000; /* 15 min avant le coup d’envoi */
const SPORTS_LIVE_VISUAL_TAIL_MS = 3 * 3600 * 1000; /* 3 h après le coup d’envoi */
/**
 * Filet résultats CTA : jours civils Toronto « aujourd’hui » + « hier »
 * (`RadarSportsFreshness.isMastheadCtaResult`). À venir en saison = jour lead.
 */
/** À venir dans l’heure : passe devant hier (même seuil que « dans 45 min »). */
const SPORTS_CTA_WITHIN_HOUR_MS = 60 * 60 * 1000;
/**
 * Accroches CTA **uniquement** quand le pool (live / hier / aujourd’hui /
 * jour lead) est vide. Pas de puces grises à gauche pour ces messages —
 * elles se confondaient avec des scores (régression UX 2026-07-30 :
 * « Hors saison » à côté de vrais prochains matchs).
 */
const SPORTS_CTA_IDLE_LABELS = [
  'Scores collégiaux et universitaires',
  'Voir le tableau des scores',
];
const RADAR_BRAND_SHORT = 'LE-RADAR.ca';
const RADAR_BRAND_LONG = 'Le Réseau Académique de Découverte et d’Agrégation de Ressources';
let sportsData = null;
let sportsSlides = [];
/** Slides actuellement affichées (1 par slot), comme mastheadWeatherSlots. */
let sportsVisible = [];
/** @deprecated remplacé par des timers par slot (indépendants). */
let sportsNextSlot = 0;
/** Un timeout par slot : chaque puce tourne à son rythme (marquee inclus). */
let sportsSlotTimers = [];
let sportsWaveTimer = 0;
let sportsWaveSlot = 0;
/** Rotation de la CTA suspendue (survol ou focus) — garde-fou `pause-survol-focus`. */
let sportsCtaPaused = false;
/**
 * La rotation dispose toujours d'un mécanisme de pause : survol/focus avec une
 * souris, appui maintenu au doigt. Ne pas la borner à 700 px : iPad est tactile
 * mais plus large, donc sa CTA quittait la cascade malgré `pointerdown`.
 */
/**
 * Plafond mesuré après paint (parité météo `mastheadWeatherFitCount`).
 * null = pas encore contraint ; sinon min(base largeur, fit).
 * On retire une carte score à la fois tant que le bandeau est à l’étroit ;
 * le dernier chip restant est toujours la CTA « SPORTS ».
 */
let sportsFitCount = null;
/** Garde-fou récursion fit (max 4 → 1). */
let sportsFitDepth = 0;
let sportsReducedMotion = false;
try {
  sportsReducedMotion = !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
} catch { /* ignore */ }
/**
 * Temps d’affichage des puces sports (gauche) — calibré pour *lire* l’info
 * (glyphe + équipes + date + heure), pas un flip nerveux type gare météo.
 *
 * Feedback prod 2026-08-11 : 4,8–8 s en rotation *parallèle* faisait « trop
 * vide » (3 slots qui tournent chacun de leur côté). La vague L→R puis pause
 * évite ça : le bandeau reste plein pendant le hold.
 * Feedback prod 2026-08-29 : 9–14 s de pause après la vague = trop long.
 * Sans défilement : ~6,5–10 s selon la longueur du libellé.
 * Avec marquee : ≥ 1 aller-retour CSS + pause au repos pour relire le début
 *   (même esprit que MARQUEE_REST_MS du dial radio).
 */
const SPORTS_READ_MIN_MS = 6500;
const SPORTS_READ_PER_CHAR_MS = 32;
const SPORTS_READ_MAX_MS = 10000;
/**
 * Une voie du marquee CSS `sports-chip-scroll` (style.css) — tenir synchro
 * avec `--sports-scroll-duration`. `alternate` → aller-retour = 2 ×.
 */
/** Synchro style.css `--sports-scroll-duration` (marquee L→R). */
const SPORTS_SCROLL_ONE_WAY_MS = 5500;
const SPORTS_SCROLL_ROUND_TRIP_MS = SPORTS_SCROLL_ONE_WAY_MS * 2;
/** Délai lecture avant scroll — aligné MARQUEE_READ_DELAY_MS / CSS --sports-scroll-delay. */
const SPORTS_SCROLL_READ_DELAY_MS = MARQUEE_READ_DELAY_MS;
/** Pause au repos après le retour (re-ack du début de ligne). */
const SPORTS_SCROLL_POST_PAUSE_MS = MARQUEE_REST_MS;
/** Décalage initial entre slots pour éviter un flip simultané au 1er paint. */
const SPORTS_SLOT_STAGGER_MS = 1100;
/**
 * Vague de toutes les puces (scores + texte CTA), puis pause lecture.
 * Tous les écrans : même principe ; CTA en pause à l’appui sur tactile et
 * inchangée seulement en mouvement réduit.
 * Step assez lent pour suivre la cascade ; hold assez long pour relire le ruban
 * sans laisser les cartes figées ~12–16 s (prod 2026-08-29).
 */
const SPORTS_CASCADE_STEP_MS = 440;
const SPORTS_BOARD_HOLD_MS = 7500;
/** Entrée d’une puce score (CSS sports-chip-arrive) — plus long = moins brutal. */
const SPORTS_ARRIVE_MS = 640;
/**
 * CTA du mât : pastille « SPORTS » + accroche datée + sous-ligne.
 *
 * Trois verdicts focus-group se superposent ici :
 * · `le-radar-sports-first-glance` — lead = résultat aujourd’hui/hier (civil QC)
 *   sinon prochain du jour lead ; alerte réservée au direct.
 * · `le-radar-cta-sports-motion` — override humain 2026-08-17 : le
 *   renouvellement de l’accroche rejoue la **même** sortie/entrée que les
 *   puces scores (`is-leaving` / `is-arriving` sur la carte entière), y
 *   compris en 390/430 où la CTA est seule.
 * · `le-radar-cta-sports-badge` — le mot de la pastille reste « Sports » au
 *   repos ; seul le direct le remplace (override mainteneur 2026-08-09).
 */
const SPORTS_CTA_TAG = 'Sports';
/** Pastille pendant un match en cours — le seul cas qui remplace la rubrique. */
const SPORTS_CTA_TAG_LIVE = 'En direct';
/** Coup d’envoi du jour, pas encore commencé — mot Aujourd’hui, lamp soon (pulse). */
const SPORTS_MATCH_TAG_TODAY = 'Aujourd’hui';
const SPORTS_CTA_TAG_SOON = SPORTS_MATCH_TAG_TODAY;
/**
 * 2e ligne des pastilles datées.
 * Aujourd’hui seulement : « cet AM » / « ce PM » (ce = ce jour-ci).
 * Demain : « AM » / « PM ». Pas Hier / En direct / Prochain.
 * Pas « cette AM ». Pas « ce PM hier ».
 */
const SPORTS_MERIDIEM_AM_LINE = 'cet AM';
const SPORTS_MERIDIEM_PM_LINE = 'ce PM';
/** Demain : mot Demain, même jaune que Prochain. */
const SPORTS_CTA_TAG_TOMORROW = 'Demain';
/** Résultat du jour : deux lignes DERNIÈRE / HEURE. Pas d’AM/PM. */
const SPORTS_CTA_TAG_LATEST = 'Dernière heure';
/** Après demain : Prochain + date courte en 2ᵉ ligne. */
const SPORTS_CTA_TAG_NEXT = 'Prochain';
/** Repli idle (creux total, pas de match) ; sinon ton du sport via sportsCtaTone. Rouge = direct. */
const SPORTS_CTA_REST_TONE = '#6a7580';
const SPORTS_CTA_LIVE_TONE = '#c8102e';
/**
 * Rythme de la carte CTA — un cran plus posé que les puces scores, mais pas
 * figé. Feedback prod 2026-08-11 : 24 s laissait l’accroche « collée ».
 * Cible ~8 s (proche des scores stables). Survol = pause
 * (garde-fou rotation-pointeur-fin).
 */
const SPORTS_CTA_DWELL_MS = 8000;
/** Sortie douce d’une puce score avant replaceWith (synchro CSS is-leaving). */
const SPORTS_CHIP_LEAVE_MS = 420;
/** Popularité sports étudiants QC (aligné page /sports/). */
const SPORTS_POPULARITY = [
  'hockey',
  'football',
  'soccer',
  'basketball',
  'volleyball',
  'rugby',
  'flag-football',
  'soccer-interieur',
  'futsal',
  'baseball',
  'badminton',
  'natation',
  'athletisme',
  'cross-country',
  'golf',
  'cheerleading',
  'ultimate',
  'sailing',
];
const SPORTS_CTA_KEY = 'cta:board';
/** Curseur d’accroche CTA (un sport à la fois, par popularité). */
let sportsCtaLabelIndex = 0;
/** Curseur circulaire dans le pool de gauche (résultats ou next). */
let sportsLeftCursor = 0;

/**
 * Glyphes — d’abord reconnaissables par les pratiquants.
 * Variantes (intérieur, futsal, cross) partagent l’emoji « métier » ;
 * le libellé + la teinte de section font la distinction.
 */
function sportsGlyph(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return '🏀';
  if (s.includes('hockey')) return '🏒';
  if (s.includes('sail') || s.includes('voile')) return '⛵';
  if (s.includes('badminton')) return '🏸';
  if (s.includes('baseball') || s.includes('base-ball')) return '⚾';
  if (s.includes('ultimate') || s.includes('frisbee')) return '🥏';
  if (s.includes('rugby')) return '🏉';
  if (s.includes('volley')) return '🏐';
  // Soccer extérieur, intérieur et futsal → ballon (identité terrain).
  if (
    s.includes('futsal')
    || s.includes('soccer')
    || s.includes('interieur')
    || s.includes('intérieur')
    || (s.includes('foot') && !s.includes('flag') && !s.includes('football'))
  ) return '⚽';
  if (s.includes('flag')) return '🚩';
  if (s.includes('football')) return '🏈';
  if (s.includes('natat') || s.includes('swim')) return '🏊';
  if (s.includes('golf')) return '⛳';
  // Athlé + cross-country course → coureur (pas un arbre abstrait).
  if (s.includes('cross') || s.includes('athlet')) return '🏃';
  if (s.includes('cheer')) return '📣';
  if (s.includes('tennis')) return '🎾';
  if (s.includes('handball')) return '🤾';
  if (s.includes('ski')) return '⛷️';
  return '🏅';
}

function sportsResultTone(result) {
  if (result === 'W') return '#3d9a6a';
  if (result === 'L') return '#c45c5c';
  if (result === 'D' || result === 'T') return '#8fa3b0';
  return SPORTS_SPORT_TONES.default;
}

/** Ordinal FR de place : 1er, 2e, 7e. */
function sportsPlaceOrdinal(place) {
  const n = Number(place);
  if (!Number.isFinite(n) || n < 1) return '';
  return n === 1 ? '1er' : `${n}e`;
}

/** Score d’une régate : « 1er/12 », « 7e/12 ». */
function sportsPlaceScoreText(game) {
  const ord = sportsPlaceOrdinal(game?.scoreFor);
  const field = Number(game?.scoreAgainst);
  if (!ord || !Number.isFinite(field) || field < 1) return '';
  return `${ord}/${field}`;
}

/** Marque de résultat pour la 2e ligne Hier : score « 2–1 » ou place « 7e/12 ». */
function sportsResultMarkText(game, sport) {
  if (sportsIsPlaceResult(game, sport || game?.sport)) return sportsPlaceScoreText(game);
  if (sportsGameHasScore(game)) return `${game.scoreFor}–${game.scoreAgainst}`;
  return '';
}

/** Hier : score ou place sous le mot, pas dans l’accroche. */
function sportsCtaTagPutsResultScore(wanted) {
  return wanted === 'Hier';
}

/**
 * Pastille de résultat.
 * Match : V / D / N.
 * Régate / place : médaille 1–3, rien au-delà (le « 7e/12 » suffit — pas un V).
 */
function sportsResultBadgeSpec(game, sport) {
  if (sportsIsPlaceResult(game, sport || game?.sport)) {
    const n = Number(game?.scoreFor);
    if (n === 1) return { letter: '🥇', mod: 'place' };
    if (n === 2) return { letter: '🥈', mod: 'place' };
    if (n === 3) return { letter: '🥉', mod: 'place' };
    return null;
  }
  const r = String(game?.result || '');
  if (r === 'W') return { letter: 'V', mod: 'w' };
  if (r === 'L') return { letter: 'D', mod: 'l' };
  if (r === 'D' || r === 'T') return { letter: 'N', mod: 'd' };
  return { letter: 'N', mod: 'd' };
}

function sportsResultBadgeEl(game, sport) {
  const spec = sportsResultBadgeSpec(game, sport);
  if (!spec) return null;
  const el = document.createElement('span');
  el.className = `sports-chip__badge sports-chip__badge--${spec.mod}`;
  el.textContent = spec.letter;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function sportsSportTone(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('basket')) return SPORTS_SPORT_TONES.basketball;
  if (s.includes('hockey')) return SPORTS_SPORT_TONES.hockey;
  if (s.includes('sail') || s.includes('voile')) return SPORTS_SPORT_TONES.sailing;
  if (s.includes('badminton')) return SPORTS_SPORT_TONES.badminton;
  if (s.includes('baseball') || s.includes('base-ball')) return SPORTS_SPORT_TONES.baseball;
  if (s.includes('ultimate')) return SPORTS_SPORT_TONES.ultimate;
  if (s.includes('rugby')) return SPORTS_SPORT_TONES.rugby;
  if (s.includes('volley')) return SPORTS_SPORT_TONES.volleyball;
  if (s.includes('futsal')) return SPORTS_SPORT_TONES.futsal;
  if (s.includes('interieur') || s.includes('intérieur')) return SPORTS_SPORT_TONES['soccer-interieur'];
  if (s.includes('soccer')) return SPORTS_SPORT_TONES.soccer;
  if (s.includes('flag')) return SPORTS_SPORT_TONES['flag-football'];
  if (s.includes('football')) return SPORTS_SPORT_TONES.football;
  if (s.includes('natat') || s.includes('swim')) return SPORTS_SPORT_TONES.natation;
  if (s.includes('golf')) return SPORTS_SPORT_TONES.golf;
  if (s.includes('cheer')) return SPORTS_SPORT_TONES.cheerleading;
  if (s.includes('cross')) return SPORTS_SPORT_TONES['cross-country'];
  if (s.includes('athlet')) return SPORTS_SPORT_TONES.athletisme;
  return SPORTS_SPORT_TONES.default;
}

function sportsSlideTone(slide) {
  if (!slide) return SPORTS_SPORT_TONES.default;
  if (slide.mode === 'result' && slide.game?.result) {
    return sportsResultTone(slide.game.result);
  }
  return sportsSportTone(slide.game?.sport || slide.team?.sport);
}

function readSportsFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPORTS_FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function sportsIsFavorite(team, favSet) {
  if (!team || !favSet?.size) return false;
  return favSet.has(team.id) || favSet.has(team.code)
    || favSet.has(String(team.code || '').toUpperCase());
}

/** Instant du match (ms) — date ISO + time « HH:MM » (fuseau du navigateur / QC). */
function sportsGameMs(game) {
  if (!game?.date) return NaN;
  const rawTime = String(game.time || '12:00').trim();
  const m = rawTime.match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? String(Math.min(23, Number(m[1]))).padStart(2, '0') : '12';
  const mm = m ? m[2] : '00';
  const t = Date.parse(`${game.date}T${hh}:${mm}:00`);
  return Number.isFinite(t) ? t : NaN;
}

/** Jour civil America/Toronto (YYYY-MM-DD) — frontière « hier / aujourd’hui ».
 *  Sert aux matchs comme aux articles : le jour de référence est celui du
 *  Québec, pas celui du fuseau de la personne qui lit. */
function torontoDayKey(msOrDate = Date.now()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(msOrDate));
  } catch {
    return new Date(msOrDate).toISOString().slice(0, 10);
  }
}

/** true si le match est le jour civil d’aujourd’hui (QC). */
function sportsGameIsToday(game) {
  const ms = sportsGameMs(game);
  if (!Number.isFinite(ms)) {
    // Fallback date seule
    if (!game?.date) return false;
    return game.date === torontoDayKey();
  }
  return torontoDayKey(ms) === torontoDayKey();
}

/** YYYY-MM-DD ± n jours civils (arithmétique UTC sur la date seule). */
function sportsCivilDayShift(yyyyMmDd, deltaDays) {
  const m = String(yyyyMmDd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3] + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
}

/** Jour civil Toronto d’un match (YYYY-MM-DD) — champ `date`, pas l’heure locale. */
function sportsGameDayKey(game, now = Date.now()) {
  if (typeof RadarSportsFreshness?.gameCivilDayKey === 'function') {
    const key = RadarSportsFreshness.gameCivilDayKey(game);
    if (key) return key;
  }
  const d = String(game?.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const ms = sportsGameMs(game);
  if (Number.isFinite(ms)) return torontoDayKey(ms);
  return '';
}

/**
 * Écart en jours civils Toronto (0 = aujourd’hui, 1 = hier).
 * Négatif si le match est à venir. Infini si la date est illisible.
 */
function sportsCivilDaysAgo(game, now = Date.now()) {
  if (typeof RadarSportsFreshness?.civilDaysAgo === 'function') {
    return RadarSportsFreshness.civilDaysAgo(game, new Date(now));
  }
  const day = sportsGameDayKey(game, now);
  const today = torontoDayKey(now);
  if (!day || !today) return Number.POSITIVE_INFINITY;
  const a = Date.parse(`${day}T12:00:00Z`);
  const b = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86400000);
}

/** Résultat dans la fenêtre des puces (5 jours civils, saison courante). */
function sportsResultIsRecent(game, now = Date.now()) {
  if (typeof RadarSportsFreshness?.isMastheadChipResult === 'function') {
    return RadarSportsFreshness.isMastheadChipResult(game, new Date(now));
  }
  const days = sportsCivilDaysAgo(game, now);
  return Number.isFinite(days) && days >= 0 && days <= SPORTS_RECENT_RESULT_DAYS;
}

/**
 * Résultat admissible sur la CTA : jour civil Toronto = aujourd’hui **ou** hier.
 */
function sportsCtaResultIsTodayOrYesterday(game, now = Date.now()) {
  if (typeof RadarSportsFreshness?.isMastheadCtaResult === 'function') {
    return RadarSportsFreshness.isMastheadCtaResult(game, new Date(now));
  }
  const days = sportsCivilDaysAgo(game, now);
  return days === 0 || days === 1;
}

/** Coup d’envoi encore à venir et dans moins d’une heure. */
function sportsCtaKickoffWithinHour(game, now = Date.now()) {
  const ms = sportsGameMs(game);
  if (!Number.isFinite(ms)) return false;
  const delta = ms - now;
  return delta >= 0 && delta < SPORTS_CTA_WITHIN_HOUR_MS;
}

/** Sentinelle RSEQ : pas encore de rapport (soccer collégial surtout). */
const SPORTS_SCORE_NONE = -999;

/** Score numérique collé (live non officiel ou résultat). `-999` ne compte pas. */
function sportsScoreNumber(n) {
  if (n === '' || n == null) return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v === SPORTS_SCORE_NONE) return null;
  return v;
}

function sportsGameHasScore(game) {
  return sportsScoreNumber(game?.scoreFor) != null && sportsScoreNumber(game?.scoreAgainst) != null;
}

/** Libellé de période / horloge collé par le bot (`1re mi-temps`). */
function sportsLivePeriodLabel(game) {
  const p = String(game?.period || '').trim();
  return p;
}

/**
 * Match réellement en cours *maintenant* — prédicat visuel, recalculé à chaque
 * rendu (contrairement à `slide.urgency`, figé à la construction des slides).
 *
 * C’est lui, et lui seul, qui autorise le registre d’alerte de la carte CTA :
 * pastille rouge et point live. Fenêtre serrée autour du coup d’envoi, pas la
 * fenêtre large du tri.
 *
 * Un résultat officiel (`final` / score sans `live`) ne reste pas « En direct »
 * pendant les 3 h de queue — même si le coup d’envoi est encore dans la
 * fenêtre. Un 0-0 encore marqué `live` (rapport pas déposé) oui.
 */
function sportsGameIsLive(game, now = Date.now()) {
  if (!game || game.final === true || game.live === false) return false;
  const t = sportsGameMs(game);
  const inWindow = Number.isFinite(t)
    && t <= now + SPORTS_LIVE_VISUAL_LEAD_MS
    && t >= now - SPORTS_LIVE_VISUAL_TAIL_MS;
  if (game.live === true) return inWindow || !Number.isFinite(t);
  if (sportsGameHasScore(game)) return false;
  return inWindow;
}

/** Âge d’un résultat en ms (négatif si le match est à venir). */
function sportsResultAgeMs(game, now = Date.now()) {
  const t = sportsGameMs(game);
  return Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
}

/**
 * Palier d’urgence (plus bas = plus prioritaire), style scoreboards populaires :
 *  0 live (proxy) · 1 aujourd’hui / ≤7 j · 2 résultat récent · 3 à venir plus tard
 *  · 4 vieux résultat · 5 rien
 * @returns {{ tier: number, sortMs: number }}
 */
function sportsUrgency(mode, game, now = Date.now()) {
  const t = sportsGameMs(game);
  if (!Number.isFinite(t)) return { tier: 5, sortMs: Number.POSITIVE_INFINITY };

  if (mode === 'next') {
    // Proxy « en direct » : fenêtre autour du coup d’envoi (tant que l’API
    // S1 n’expose pas un statut live fiable).
    if (t <= now + SPORTS_LIVE_AFTER_MS && t >= now - SPORTS_LIVE_BEFORE_MS) {
      return { tier: 0, sortMs: t };
    }
    if (t >= now && t - now <= SPORTS_IMMINENT_MS) {
      return { tier: 1, sortMs: t }; // bientôt : le plus proche d’abord
    }
    if (t >= now) {
      return { tier: 3, sortMs: t }; // plus loin
    }
    // nextGame dans le passé hors fenêtre live → traiter comme peu urgent
    return { tier: 4, sortMs: -t };
  }

  // Résultat
  if (sportsResultIsRecent(game, now)) {
    return { tier: 2, sortMs: -t }; // plus récent d’abord
  }
  return { tier: 4, sortMs: -t };
}

function sportsEditorialRank(teamOrCode) {
  if (teamOrCode && typeof teamOrCode === 'object') {
    if (Number.isFinite(teamOrCode.priority)) return teamOrCode.priority;
    return sportsEditorialRank(teamOrCode.code);
  }
  const i = SPORTS_DEFAULT_CODES.indexOf(String(teamOrCode || '').toUpperCase());
  return i === -1 ? 99 : i;
}

/** Slide résultat passé pour une équipe (null si aucun lastGame). */
function sportsGameDedupeStamp(game = {}) {
  return `${game.date || ''}|${game.time || ''}|${game.gameId || ''}|${game.opponentCode || game.opponent || ''}`;
}

function sportsResultSlideFromGame(team, game, now = Date.now()) {
  if (!team || !game) return null;
  const u = sportsUrgency('result', game, now);
  const gid = game.gameId != null ? String(game.gameId) : '';
  return {
    mode: 'result',
    team,
    game,
    key: `r:${team.id}:${game.date}:${game.time || ''}:${gid}`,
    urgency: u,
  };
}

function sportsResultSlide(team, now = Date.now()) {
  if (!team?.lastGame) return null;
  return sportsResultSlideFromGame(team, team.lastGame, now);
}

function sportsNextSlideFromGame(team, game, now = Date.now()) {
  if (!team || !game) return null;
  const u = sportsUrgency('next', game, now);
  const gid = game.gameId != null ? String(game.gameId) : '';
  return {
    mode: 'next',
    team,
    game,
    key: `n:${team.id}:${game.date}:${game.time || ''}:${gid}`,
    urgency: u,
  };
}

/** Slide match à venir pour une équipe (null si aucun nextGame). */
function sportsNextSlide(team, now = Date.now()) {
  if (!team?.nextGame) return null;
  return sportsNextSlideFromGame(team, team.nextGame, now);
}

/**
 * Ancien « meilleur signal » par équipe — conservé pour la CTA (urgence).
 * Un résultat récent (5 j civils) prime sur un prochain lointain ;
 * un prochain imminent prime sur un vieux score.
 */
function sportsPickTeamSlide(team, now = Date.now()) {
  const candidates = [sportsResultSlide(team, now), sportsNextSlide(team, now)].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.urgency.tier !== b.urgency.tier) return a.urgency.tier - b.urgency.tier;
    if (a.urgency.sortMs !== b.urgency.sortMs) return a.urgency.sortMs - b.urgency.sortMs;
    return a.mode === 'result' ? -1 : 1;
  });
  return candidates[0];
}

/** Largeur utile du bandeau sports (contenu, hors padding). */
function sportsStripAvailWidth() {
  const strip = MASTHEAD_SPORTS_STRIP;
  if (strip) {
    const w = strip.clientWidth || strip.getBoundingClientRect().width;
    if (w > 0) {
      const cs = getComputedStyle(strip);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      // 8 px de filet : évite que la dernière carte dépasse le cadre.
      return Math.max(0, w - padL - padR - 8);
    }
  }
  return document.documentElement.clientWidth || 360;
}

/** Nombre de cartes sports hors CTA (scores). */
function sportsMatchChipCount() {
  const fromState = (typeof sportsVisible !== 'undefined' && Array.isArray(sportsVisible))
    ? sportsVisible.filter((slide) => slide && slide.mode !== 'cta').length
    : 0;
  if (fromState > 0) return fromState;
  const strip = MASTHEAD_SPORTS_STRIP;
  if (!strip || strip.hidden) return 0;
  return strip.querySelectorAll('.sports-chip--match').length;
}

function syncWeatherCountToSports() {
  if (!isWideDesktopComfort() || !MASTHEAD_WEATHER) return;
  // Option D : largeurs = grille CSS. Rien à recaler depuis les scores.
}

/**
 * Wide : nombre de cartes CTA (1–4) selon largeur + taille du pool.
 * Plusieurs CTAs = matchs / accroches **distincts** (pas la même info).
 * 1600 / 1920 → 2 CTA, 1 score de chaque côté ; 2560 → 3 ; 3440 / 3840 → 4.
 * ≤1440 → 1. Toutes les cartes (CTA + scores) partagent la même largeur.
 */
function isWide1600SportsBand() {
  try {
    return isWideDesktopComfort()
      && window.matchMedia('(min-width: 1600px)').matches
      && !window.matchMedia('(min-width: 1920px)').matches;
  } catch {
    return false;
  }
}

function isWideDualSportsCta() {
  try {
    return isWideDesktopComfort() && window.matchMedia('(min-width: 1600px)').matches;
  } catch {
    return false;
  }
}

function isWideTripleSportsCta() {
  try {
    return isWideDesktopComfort() && window.matchMedia('(min-width: 2560px)').matches;
  } catch {
    return false;
  }
}

function isWideQuadSportsCta() {
  try {
    return isWideDesktopComfort() && window.matchMedia('(min-width: 3440px)').matches;
  } catch {
    return false;
  }
}

function sportsWantedCtaCount() {
  if (isWideQuadSportsCta()) return 4;
  if (isWideTripleSportsCta()) return 3;
  if (isWideDualSportsCta()) return 2;
  return 1;
}

function sportsWideCtaCount(boardCount = 0) {
  if (typeof isWideNoMarqueeMode !== 'function' || !isWideNoMarqueeMode()) return 1;
  const poolN = Math.max(
    sportsCtaCandidateSlides()?.length || 0,
    sportsCtaLabelPool()?.length || 0,
  );
  if (isWideDesktopComfort()) {
    const want = sportsWantedCtaCount();
    const cap = boardCount > 0 ? boardCount : 13;
    return Math.max(1, Math.min(want, cap));
  }
  const avail = sportsStripAvailWidth();
  let want = 1;
  if (avail >= 2000 && poolN >= 3) want = 3;
  else if (avail >= 1300 && poolN >= 2) want = 2;
  // Ne pas dépasser le board ni le pool (au moins 1)
  const cap = boardCount > 0 ? boardCount : 9;
  return Math.max(1, Math.min(want, poolN || 1, cap));
}

/**
 * Focus-group le-radar-sports-weather-fit A :
 * Plafond sports = largeur seule (max 3 scores + CTA). Météo indépendante.
 * Wide : place pour 2–3 CTAs + scores autour.
 * 1600 / 1920 (2 CTA) : score | CTA | CTA | score — pas une 2ᵉ à droite.
 */
function sportsDualCtaOneEachSide() {
  return isWideDualSportsCta() && !isWideTripleSportsCta();
}

function sportsBoardCountBase() {
  const avail = sportsStripAvailWidth();
  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const gap = 6;
  // Un seul plancher : CTA et scores ont la même largeur. Assez large
  // pour un nom + sous-ligne sans clip ; si ça déborde encore, le fit −1.
  const minSlot = comfort ? 220 : (wide ? 200 : 240);
  let maxN = 4;
  if (comfort) {
    if (avail >= 3000) maxN = 14;
    else if (avail >= 2200) maxN = 12;
    else if (avail >= 1700) maxN = 9;
    else maxN = 7;
  } else if (wide) {
    if (avail >= 2200) maxN = 11;
    else if (avail >= 1800) maxN = 9;
    else if (avail >= 1400) maxN = 7;
    else maxN = 5;
  }

  const roughCta = comfort
    ? sportsWantedCtaCount()
    : (wide
      ? (avail >= 2000 ? 3 : avail >= 1300 ? 2 : 1)
      : 1);

  let n = 1;
  for (let tryN = maxN; tryN >= 2; tryN -= 1) {
    const ctaN = wide ? Math.min(roughCta, tryN) : 1;
    const need = tryN * minSlot + gap * (tryN - 1);
    if (avail >= need && tryN >= ctaN) {
      n = tryN;
      break;
    }
  }
  // Wide 1 CTA historique : totaux impairs pour équilibre L/R.
  // Multi-CTA : pas d’obligation d’impair (cluster CTA au centre).
  if (wide && roughCta <= 1 && n >= 4 && n % 2 === 0) {
    const up = n + 1;
    const needUp = up * minSlot + gap * (up - 1);
    if (avail >= needUp && up <= maxN) n = up;
    else n = Math.max(3, n - 1);
  }
  // Multi-CTA : nombre pair de scores (un de chaque côté du cluster).
  if (comfort && roughCta >= 2) {
    const scores = n - Math.min(roughCta, n);
    if (scores >= 1 && scores % 2 === 1 && n > roughCta + 1) n -= 1;
  }
  // Dual CTA 1600–2559 : un score de chaque côté. Une 2ᵉ à droite
  // se clippe (overflow:hidden) — vu à 1920.
  if (comfort && sportsDualCtaOneEachSide()) {
    n = Math.min(n, roughCta + 2);
  }
  return n;
}


/**
 * Nombre de chips cible : largeur × fit post-paint (overflow texte = −1).
 * Jamais de plafond météo (A). On descend 4 → 3 → 2 → 1 (CTA seule).
 */
function sportsBoardCount() {
  const base = sportsBoardCountBase();
  return sportsFitCount === null ? base : Math.min(base, sportsFitCount);
}

/**
 * CTA « Au tableau » épinglée à droite dès qu’il y a 2+ chips.
 * À 1 chip : CTA seule (plus d’alternance score ↔ CTA).
 */
function sportsCtaPinned() {
  return sportsBoardCount() >= 2;
}

/**
 * True si une puce **score** a titre ou sous-ligne qui déborde
 * (focus-group A : overflow → retirer une puce, jamais marquee scores).
 */
function sportsMatchChipTextOverflows(chip) {
  if (!chip || chip.classList.contains('sports-chip--cta')) return false;
  const viewport = chip.querySelector('.sports-chip__line');
  const inner = chip.querySelector('.sports-chip__line-inner');
  if (viewport && inner && sportsMeasureOverflow(viewport, inner, false) > 1) {
    return true;
  }
  const subView = chip.querySelector('.sports-chip__sub');
  const subInner = chip.querySelector('.sports-chip__sub-text');
  return !!(subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 1);
}

/** CTA : titre ou sous-ligne trop long pour la largeur peinte (wide = −1 carte). */
function sportsCtaTextOverflows(chip) {
  if (!chip?.classList?.contains('sports-chip--cta')) return false;
  const layer = typeof sportsCtaActiveLabel === 'function'
    ? sportsCtaActiveLabel(chip)
    : chip;
  const titleView = layer?.querySelector?.('.sports-chip__cta-line')
    || chip.querySelector('.sports-chip__cta-line');
  const titleInner = layer?.querySelector?.('.sports-chip__cta-text')
    || chip.querySelector('.sports-chip__cta-text');
  if (titleView && titleInner && sportsMeasureOverflow(titleView, titleInner, false) > 1) {
    return true;
  }
  const subView = layer?.querySelector?.('.sports-chip__cta-sub')
    || chip.querySelector('.sports-chip__cta-sub');
  const subInner = layer?.querySelector?.('.sports-chip__cta-sub-text')
    || chip.querySelector('.sports-chip__cta-sub-text');
  return !!(subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 1);
}

/**
 * Le bandeau est-il trop étroit / texte illisible pour les chips peints ?
 * - CTA écrasée (tag) ou texte CTA overflow → −1 score
 * - Puce score trop étroite OU titre/sous-ligne overflow → −1 score
 * Wide : **jamais** marquee ni clip — on retire une carte tant que le texte
 * ne tient pas en entier (design inchangé, juste moins de puces).
 */
function sportsStripCramped() {
  const strip = MASTHEAD_SPORTS_STRIP;
  if (!strip || strip.hidden) return false;
  const chips = [...strip.querySelectorAll('.sports-chip')];
  if (chips.length <= 1) return false;

  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const minScore = comfort ? 0 : (wide ? 100 : 118);
  const minCta = wide ? 120 : 148;

  const cta = strip.querySelector('.sports-chip--cta');
  if (!cta) return true;
  if (!comfort && !wide && cta.clientWidth + 0.5 < minCta) return true;
  if (!wide) {
    const tag = cta.querySelector('.sports-chip__cta-tag');
    if (tag && tag.scrollWidth > tag.clientWidth + 1) return true;
  }

  if (comfort) {
    // Ne pas sommer les largeurs flex peintes (used≈avail → 2 cartes géantes
    // à 1440). Texte illisible ou dernière carte hors cadre = −1.
    for (const chip of chips) {
      if (chip.classList.contains('sports-chip--cta')) continue;
      if (sportsMatchChipTextOverflows(chip)) return true;
    }
    const last = chips[chips.length - 1];
    if (last) {
      const stripBox = strip.getBoundingClientRect();
      const padR = parseFloat(getComputedStyle(strip).paddingRight) || 0;
      if (last.getBoundingClientRect().right > stripBox.right - padR + 2) return true;
    }
    return false;
  }

  for (const chip of chips) {
    if (chip.classList.contains('sports-chip--cta')) continue;
    if (chip.clientWidth + 0.5 < minScore) return true;
    if (!wide && sportsMatchChipTextOverflows(chip)) return true;
  }
  return false;
}

/** Wide : purge toute classe marquee sports (sécurité après paint / rotation). */
function clearWideSportsMarqueeClasses() {
  if (!isWideNoMarqueeMode() || !MASTHEAD_SPORTS_STRIP) return;
  // CTA : marquee L→R conservé à toute largeur. Scores : pas de marquee.
  MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip:not(.sports-chip--cta)').forEach((el) => {
    el.classList.remove('is-overflowing', 'is-sub-overflowing');
    el.style.removeProperty('--sports-scroll');
    el.style.removeProperty('--sports-scroll-sub');
  });
}

function sportsMatchNaturalWidth(chip) {
  if (!chip) return 0;
  const prev = {
    width: chip.style.width,
    minWidth: chip.style.minWidth,
    maxWidth: chip.style.maxWidth,
    flex: chip.style.flex,
  };
  const inners = [...chip.querySelectorAll('.sports-chip__line-inner, .sports-chip__sub-text')];
  const saved = inners.map((el) => ({
    el,
    maxWidth: el.style.maxWidth,
    overflow: el.style.overflow,
  }));
  inners.forEach((el) => {
    el.style.maxWidth = 'none';
    el.style.overflow = 'visible';
  });
  chip.style.width = 'max-content';
  chip.style.minWidth = 'max-content';
  chip.style.maxWidth = 'none';
  chip.style.flex = '0 0 auto';
  const boxW = Math.ceil(chip.getBoundingClientRect().width);
  const textW = inners.reduce((max, el) => Math.max(max, el.scrollWidth || 0), 0);
  saved.forEach(({ el, maxWidth, overflow }) => {
    el.style.maxWidth = maxWidth;
    el.style.overflow = overflow;
  });
  chip.style.width = prev.width;
  chip.style.minWidth = prev.minWidth;
  chip.style.maxWidth = prev.maxWidth;
  chip.style.flex = prev.flex;
  // max-width:100% sur le texte fausse max-content ; on prend le vrai
  // scrollWidth + chrome glyphe/padding (~48 px) + filet subpixel.
  return Math.max(boxW, Math.ceil(textW) + 48);
}

/** Toutes largeurs : CTA et scores en flex égal — retirer les width inline. */
function fitWideSportsMatchSlots() {
  if (!MASTHEAD_SPORTS_STRIP) return;
  const strip = MASTHEAD_SPORTS_STRIP;
  strip.style.removeProperty('--sports-match-w');
  strip.querySelectorAll('.sports-chip').forEach((el) => {
    el.style.removeProperty('flex');
    el.style.removeProperty('width');
    el.style.removeProperty('min-width');
    el.style.removeProperty('max-width');
  });
}

/**
 * Après paint : retirer une carte score si étroit ou texte overflow,
 * jusqu’à CTA seule. Max 3 passes (focus-group A) ; 5 en wide (plafond plus haut).
 */
function fitSportsStripAfterPaint() {
  if (!MASTHEAD_SPORTS_STRIP || MASTHEAD_SPORTS_STRIP.hidden) return;
  // Wide : d’abord couper tout marquee résiduel, puis fit par −1 carte.
  clearWideSportsMarqueeClasses();
  fitWideSportsMatchSlots({ fill: false });
  const count = sportsVisible.length;
  if (count <= 1) {
    fitWideSportsMatchSlots({ fill: true });
    refreshSportsChipScroll();
    syncWeatherCountToSports();
    return;
  }
  if (!sportsStripCramped()) {
    fitWideSportsMatchSlots({ fill: true });
    refreshSportsChipScroll();
    syncWeatherCountToSports();
    return;
  }
  const wide = isWideNoMarqueeMode();
  const comfort = isWideDesktopComfort();
  const maxPasses = wide ? 6 : 3;
  if (sportsFitDepth >= maxPasses) {
    fitWideSportsMatchSlots({ fill: true });
    syncWeatherCountToSports();
    return;
  }
  sportsFitDepth += 1;
  // Wide étroit : totaux impairs (CTA centrée). ≥1440 : juste −1 (garder le remplissage).
  // ≥ ~520 px : ne pas jeter le dernier score (round-trip 2560→1920 le perdait).
  // Multi-CTA : au moins un score de chaque côté (sinon le seul part à droite).
  const ctaFloor = (typeof sportsWantedCtaCount === 'function') ? sportsWantedCtaCount() : 1;
  const floor = isWideDesktopComfort()
    ? (ctaFloor >= 2 ? ctaFloor + 2 : 3)
    : (sportsStripAvailWidth() >= 520 ? 2 : 1);
  let next = count - 1;
  if (!comfort && wide && next >= 4 && next % 2 === 0) next -= 1;
  if (comfort && ctaFloor >= 2) {
    const scores = next - Math.min(ctaFloor, next);
    if (scores >= 1 && scores % 2 === 1 && next > ctaFloor + 1) next -= 1;
    if (sportsDualCtaOneEachSide()) next = Math.min(next, ctaFloor + 2);
  }
  sportsFitCount = Math.max(floor, next);
  if (sportsFitCount >= count) {
    fitWideSportsMatchSlots({ fill: true });
    refreshSportsChipScroll();
    syncWeatherCountToSports();
    return;
  }
  try {
    renderSportsStrip();
  } finally {
    sportsFitDepth = Math.max(0, sportsFitDepth - 1);
  }
}

/** Remplacement pour le mode mobile (1 slot) — respecte la voie de gauche. */
function sportsRandomResultSlide(usedKeys) {
  return nextSportsSlide(usedKeys, { avoidSport: '' });
}

/**
 * Codes / écoles hors focus LE-RADAR (RSEQ invitees hors Québec, etc.).
 * On garde les matchs QC ↔ Ottawa vus **depuis** l’équipe québécoise
 * (« UdeM reçoit uOttawa »), pas le point de vue « uOttawa chez UdeM ».
 */
const SPORTS_OUT_OF_PROVINCE_CODES = new Set([
  'OTT', // University of Ottawa
  'CAR', // Carleton
  'DAL', // Dalhousie
  'UNB', // New Brunswick
  'CMR', // Collège militaire royal (Kingston)
]);

/**
 * Équipe « nôtre » pour le mât : campus / cégep du Québec seulement.
 * province=QC si présent ; sinon denylist codes + heuristique de nom.
 */
function sportsTeamIsQuebecFocus(team) {
  if (!team) return false;
  if (team.province) return team.province === 'QC';
  const code = String(team.code || '').toUpperCase();
  if (SPORTS_OUT_OF_PROVINCE_CODES.has(code)) return false;
  const blob = `${team.fullName || ''} ${team.name || ''} ${team.school || ''} ${team.institution || ''}`;
  if (/University of Ottawa|Carleton University|Dalhousie|University of New Brunswick|Royal Military College/i.test(blob)) {
    return false;
  }
  return true;
}

/**
 * Construit le pool de slides mât :
 *  - tous les résultats passés (lastGame)
 *  - tous les matchs à venir (nextGame)
 * Les puces de GAUCHE n’utilisent que les résultats en saison ;
 * hors saison elles basculent sur next + infos (voir sportsLeftLaneState).
 * La CTA (droite) continue de piocher via sportsCtaCandidateSlides.
 */
function buildSportsSlides(data) {
  const teams = Object.values(data?.teams || {});
  if (!teams.length) return [];
  const now = Date.now();

  // Focus Québec : pas de puces « uOttawa reçoit… » ; l’inverse (QC vs OTT)
  // reste via l’équipe québécoise. Voile : hors QC. Clubs watchlist : hors strip.
  const eligible = teams.filter((team) => {
    if (!sportsTeamIsQuebecFocus(team)) return false;
    if (team.sport === 'sailing') {
      if (team.province && team.province !== 'QC') return false;
      if (team.status === 'club' || team.status === 'upcoming') return false;
      if (team.source === 'sailing-watchlist') return false;
    }
    return true;
  });

  const results = [];
  const nexts = [];
  for (const team of eligible) {
    const seenR = new Set();
    const resultGames = [];
    if (team.lastGame) resultGames.push(team.lastGame);
    for (const g of team.results || []) resultGames.push(g);
    for (const g of resultGames) {
      const stamp = sportsGameDedupeStamp(g);
      if (seenR.has(stamp)) continue;
      seenR.add(stamp);
      const r = sportsResultSlideFromGame(team, g, now);
      if (r) results.push(r);
    }
    const seenN = new Set();
    const nextGames = (Array.isArray(team.nextGames) && team.nextGames.length)
      ? team.nextGames
      : (team.nextGame ? [team.nextGame] : []);
    for (const g of nextGames) {
      const stamp = sportsGameDedupeStamp(g);
      if (seenN.has(stamp)) continue;
      seenN.add(stamp);
      const n = sportsNextSlideFromGame(team, g, now);
      if (n) nexts.push(n);
    }
  }

  // Résultats : plus récents d’abord (fraîcheur d’affichage).
  results.sort((a, b) => {
    const ma = sportsGameMs(a.game) || 0;
    const mb = sportsGameMs(b.game) || 0;
    if (mb !== ma) return mb - ma;
    return sportsEditorialRank(a.team) - sportsEditorialRank(b.team);
  });
  // À venir : plus proches d’abord.
  nexts.sort((a, b) => {
    const ma = sportsGameMs(a.game) || Number.POSITIVE_INFINITY;
    const mb = sportsGameMs(b.game) || Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
    return sportsEditorialRank(a.team) - sportsEditorialRank(b.team);
  });

  return [...results, ...nexts].map((slide) => {
    slide.tone = sportsSlideTone(slide);
    return slide;
  });
}

/** Résultats passés triés (plus récent → plus vieux). */
function sportsResultSlidesSorted() {
  return sportsSlides
    .filter((s) => s && s.mode === 'result')
    .slice()
    .sort((a, b) => (sportsGameMs(b.game) || 0) - (sportsGameMs(a.game) || 0));
}

/** Matchs à venir triés (plus proche → plus loin). */
function sportsNextSlidesSorted() {
  const now = Date.now();
  return sportsSlides
    .filter((s) => s && s.mode === 'next')
    .filter((s) => {
      const ms = sportsGameMs(s.game);
      return Number.isFinite(ms) && ms >= now - SPORTS_LIVE_AFTER_MS;
    })
    .slice()
    .sort((a, b) => (sportsGameMs(a.game) || 0) - (sportsGameMs(b.game) || 0));
}

/**
 * Voie unique : même liste que le premier cran (chaleur d’abord).
 * kind reste « results » s’il y a un score récent, sinon offseason
 * (rotation / hold).
 */
function sportsLeftLaneState() {
  const pool = sportsOpenOrderSlides();
  const results = pool.filter((s) => s.mode === 'result');
  const nexts = pool.filter((s) => s.mode === 'next' && !sportsGameIsLive(s.game));
  const kind = results.length ? 'results' : 'offseason';
  return { kind, results, nexts, pool };
}

/**
 * Accroche info — **désactivée dans la voie de gauche** (conservée pour
 * tests / repli extrême si un appel force encore mode info).
 * Les messages creux vivent uniquement sur la CTA rouge.
 */
function sportsInfoSlide(index = 0) {
  const labels = SPORTS_CTA_IDLE_LABELS;
  const idx = ((index % labels.length) + labels.length) % labels.length;
  return {
    mode: 'info',
    key: `info:${idx}:${index}`,
    label: labels[idx],
    labelIndex: idx,
    tone: '#5a6570',
    team: { sport: 'board', name: 'Info', code: 'QC' },
    game: { sport: 'board' },
  };
}

function formatSportsWhen(iso, time) {
  if (!iso) return '';
  let label = iso;
  try {
    label = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' })
      .format(new Date(`${iso}T12:00:00`));
  } catch { /* keep iso */ }
  if (time) label += ` · ${String(time).replace(':', ' h ')}`;
  return label;
}

/** Lien diffusion RSEQ (match joué, à venir, ou page ligue en repli). */
function sportsGameHref(slide) {
  const g = slide?.game || {};
  if (g.url && /^https?:\/\//i.test(g.url)) return g.url;
  if (g.gameId) {
    return `https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=${encodeURIComponent(g.gameId)}`;
  }
  const leagueId = slide?.team?.leagueId;
  if (leagueId) {
    return `https://diffusion.rseq.ca/?Type=League&LeagueId=${encodeURIComponent(leagueId)}`;
  }
  return 'https://www.rseq-stats.ca/';
}

/**
 * Page SEO « Au tableau » — sport + équipe (deep-link).
 * sports-board.js filtre le sport, ouvre la section, surbrille et scroll
 * jusqu’à la carte formation (parité sélection d’une station radio).
 */
function radarHomeHref() {
  const home = document.querySelector('a.masthead-home, a[data-home-nav]');
  const href = home?.getAttribute('href');
  if (href) return href;
  return new URL('.', window.location.href).pathname;
}

function radarIconSrc() {
  const img = document.querySelector('.wordmark-logo, .site-foot__logo');
  const src = img?.getAttribute('src');
  if (src) return src;
  return new URL('assets/icon.svg', window.location.href).pathname;
}

function radarBrandLogoEl() {
  const img = document.createElement('img');
  img.className = 'sports-chip__cta-logo';
  img.src = radarIconSrc();
  img.width = 18;
  img.height = 18;
  img.alt = '';
  img.decoding = 'async';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

function markNoTranslate(el) {
  if (!el) return el;
  el.classList.add('notranslate');
  el.setAttribute('translate', 'no');
  return el;
}

function sportsBoardHref(slide) {
  const base = new URL('sports/', window.location.href).pathname;
  // CTA avec match en accroche : deep-link vers ce match / sport.
  if (slide?.mode === 'cta') {
    const from = slide.ctaFrom;
    if (from?.team || from?.game) {
      const sport = String(from.game?.sport || from.team?.sport || '').toLowerCase();
      const teamId = String(from.team?.id || '').trim();
      const params = new URLSearchParams();
      if (sport) params.set('sport', sport);
      if (teamId) params.set('team', teamId);
      const q = params.toString();
      return q ? `${base}?${q}` : base;
    }
    return base;
  }
  const sport = String(slide?.game?.sport || slide?.team?.sport || '').toLowerCase();
  const teamId = String(slide?.team?.id || '').trim();
  const params = new URLSearchParams();
  if (sport) params.set('sport', sport);
  if (teamId) params.set('team', teamId);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

/**
 * Nouvel onglet pour les liens « Au tableau » / puces sports.
 * Même règle que les articles du fil : ne pas décharger la page où la radio joue
 * (sinon le flux et la synchro lecteurs se coupent).
 */
function markSportsBoardLink(a) {
  if (!a || a.tagName !== 'A') return a;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * Meilleure carte (déjà triée : urgence / fraîcheur) par sport.
 * Sert à la diversité des chips scores (pas la CTA).
 */
function sportsBestSlidesBySport() {
  const map = new Map();
  for (const s of sportsSlides) {
    if (!s || s.mode === 'cta') continue;
    const sp = String(s.team?.sport || s.game?.sport || '').toLowerCase();
    if (!sp || map.has(sp)) continue;
    map.set(sp, s);
  }
  return map;
}

/** Sports triés par popularité QC, puis le reste alpha. */
function sportsOrderedKeys(bestMap) {
  const keys = [...bestMap.keys()];
  const rank = (sp) => {
    const i = SPORTS_POPULARITY.indexOf(sp);
    return i < 0 ? 100 + sp.localeCompare('') : i;
  };
  return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
}

/**
 * Suffixes de couleur d’équipe (CNDF rugby F Bleu/Jaune, etc.) — **ne jamais
 * retirer** : ce n’est pas un ornement, c’est l’identité de la formation.
 */
const SPORTS_TEAM_COLOR_SUFFIX_RE = /\s+(Bleu(?:e)?|Jaune|Noir(?:e)?|Blanc(?:he)?|Rouge|Vert(?:e)?|Or)\s*$/i;

/**
 * Abréviations cryptiques issues du flux RSEQ / vieux registre — élargies à
 * l’affichage même si sports.json n’a pas encore été re-sync.
 */
const SPORTS_CRYPTIC_SHORT_EXPAND = {
  'Ch.-St-Lambert': 'Champlain St-Lambert',
  'Ch.-Lennoxville': 'Champlain Lennoxville',
  'Ch.-St-Lawrence': 'Champlain St-Lawrence',
  'Abitibi-Témisc.': 'Abitibi-Témiscamingue',
  'Ch. Saint-Lambert': 'Champlain St-Lambert',
  'Ch. St-Lambert': 'Champlain St-Lambert',
  'Ch. Lennoxville': 'Champlain Lennoxville',
  'Ch. St-Lawrence': 'Champlain St-Lawrence',
};

/**
 * Accronymes univ. (ULaval, UdeM…) — table `institution-acronyms-data.js`
 * déjà chargée sur l’accueil. Repli codes RSEQ si la table manque.
 */
/**
 * Codes RSEQ **universitaires** seulement → acronyme.
 * SHE = Cégep de Sherbrooke (collégial) — **jamais** UdeS (c’est USHE).
 */
const SPORTS_UNI_CODE_ACRONYM = {
  LAV: 'ULaval',
  MTL: 'UdeM',
  MCG: 'McGill',
  UCON: 'Concordia',
  CON: 'Concordia',
  USHE: 'UdeS',
  UQAM: 'UQAM',
  UQTR: 'UQTR',
  UQAC: 'UQAC',
  UQO: 'UQO',
  UQAR: 'UQAR',
  UQAT: 'UQAT',
  ETS: 'ÉTS',
  ÉTS: 'ÉTS',
  BIS: "Bishop's",
  OTT: 'uOttawa',
  POLY: 'Poly',
  HEC: 'HEC',
  CAR: 'Carleton',
  DAL: 'Dalhousie',
  UNB: 'UNB',
  CMR: 'CMR',
};

/**
 * Short RSEQ = toponyme de ville. Sur une face universitaire, ça se lit comme
 * le cégep homonyme (Sherbrooke / Cégep de Sherbrooke). Sigle obligatoire.
 * Surnoms (Carabins, Rouge et Or) ne passent pas ici.
 */
const SPORTS_UNI_CITY_TO_ACRONYM = {
  sherbrooke: 'UdeS',
  laval: 'ULaval',
  montreal: 'UdeM',
  'trois-rivieres': 'UQTR',
  rimouski: 'UQAR',
  chicoutimi: 'UQAC',
  saguenay: 'UQAC',
  gatineau: 'UQO',
  outaouais: 'UQO',
  ottawa: 'uOttawa',
  'rouyn-noranda': 'UQAT',
  'abitibi-temiscamingue': 'UQAT',
};

function sportsFoldKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, '-');
}

function sportsUniCityAcronym(shortName) {
  return SPORTS_UNI_CITY_TO_ACRONYM[sportsFoldKey(shortName)] || '';
}

/** Codes collégiaux qui ne doivent **jamais** recevoir un acronyme univ. */
const SPORTS_COLLEGIAL_CODES = new Set([
  'SHE', // Cégep de Sherbrooke — pas USHE / UdeS
  'SLA', 'LEN', 'SLC', 'LAF', 'NDF', 'NDFB', 'NDFJ', 'CLG', 'GAR', 'LIM',
  'VAN', 'DAW', 'JAC', 'CVM', 'AHU', 'OUT', 'CSF', 'TRV', 'VIC', 'STH',
  'RIM', 'CHI', 'CAT', // Rimouski / Chicoutimi / Abitibi — pas UQAR / UQAC / UQAT
]);

/**
 * Toponymes collégiaux **ambigus** avec une univ. (réseau UQ / UdeS).
 * Short = nom de ville seul → le lecteur croit à l’université (ex. « Trois-Rivières »
 * pour UQTR). Puces + CTA : préfixe « Cégep … » compact (marquee si long).
 * Clé = code RSEQ collégial.
 */
const SPORTS_COLLEGIAL_CITY_DISAMBIG = {
  TRV: 'Cégep de Trois-Rivières', // ≠ UQTR
  RIM: 'Cégep de Rimouski', // ≠ UQAR
  CHI: 'Cégep de Chicoutimi', // ≠ UQAC
  OUT: "Cégep de l'Outaouais", // ≠ UQO
  SHE: 'Cégep de Sherbrooke', // ≠ UdeS (USHE)
  CAT: "Cégep de l'Abitibi-Témiscamingue", // ≠ UQAT
};

/** Shorts collégiaux (sans code) qui collident avec une ville d’université. */
const SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG = {
  'trois-rivieres': 'Cégep de Trois-Rivières',
  rimouski: 'Cégep de Rimouski',
  chicoutimi: 'Cégep de Chicoutimi',
  outaouais: "Cégep de l'Outaouais",
  sherbrooke: 'Cégep de Sherbrooke',
  'abitibi-temiscamingue': "Cégep de l'Abitibi-Témiscamingue",
};

/**
 * Libellé collégial désambiguïsé, ou '' si non applicable.
 * Ne s’applique **jamais** au secteur universitaire (UQTR reste UQTR).
 */
function sportsCollegialCityDisambig({ shortName, fullName, code, sector } = {}) {
  if (!sportsLooksCollegial({ fullName, shortName, sector, code })) return '';
  const c = String(code || '').toUpperCase();
  if (SPORTS_COLLEGIAL_CITY_DISAMBIG[c]) return SPORTS_COLLEGIAL_CITY_DISAMBIG[c];
  const short = String(shortName || '').trim();
  if (!short || /^C[eé]gep\b/i.test(short)) return '';
  const key = short
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, '-');
  if (SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[key]) {
    return SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[key];
  }
  // fullName « Cégep de X » + short = X (ou proche) pour villes UQ.
  const full = String(fullName || '');
  const m = full.match(/^C[eé]gep\s+(?:de\s+(?:l['’]\s*)?)?(.+)$/i);
  if (m && /Trois-Rivi|Rimouski|Chicoutimi|Outaouais|Sherbrooke|Abitibi/i.test(m[1])) {
    const place = m[1].replace(/^l['’]\s*/i, '').trim();
    return place ? `Cégep ${place}` : '';
  }
  return '';
}

function sportsInstitutionAcronymMap() {
  try {
    return (typeof window !== 'undefined' && window.RadarInstitutionAcronyms) || {};
  } catch {
    return {};
  }
}

function sportsLookupInstitutionAcronym(...candidates) {
  const map = sportsInstitutionAcronymMap();
  for (const raw of candidates) {
    const k = String(raw || '').trim();
    if (!k) continue;
    if (map[k]) return String(map[k]);
    const bare = k.replace(/\s*\([^)]*\)\s*$/u, '').trim();
    if (bare && bare !== k && map[bare]) return String(map[bare]);
  }
  return '';
}

/** true si le fullName / code indique clairement le collégial. */
function sportsLooksCollegial({ fullName, shortName, sector, code } = {}) {
  if (String(sector || '').toLowerCase() === 'collegial') return true;
  const c = String(code || '').toUpperCase();
  if (SPORTS_COLLEGIAL_CODES.has(c)) return true;
  const f = `${fullName || ''} ${shortName || ''}`;
  // Cégep / Collège / Campus / Champlain College — pas « Université … »
  if (/C[eé]gep|Coll[eè]ge(?!\s+militaire)|Campus\s|Champlain\s+College/i.test(f)
    && !/Universit[eé]|University/i.test(f)) {
    return true;
  }
  return false;
}

/**
 * Université seulement si collégial exclu.
 * Ne pas déduire UdeS depuis le short « Sherbrooke » seul (ambigu SHE/USHE).
 */
function sportsLooksUniversity({ fullName, shortName, sector, code } = {}) {
  if (sportsLooksCollegial({ fullName, shortName, sector, code })) return false;
  if (String(sector || '').toLowerCase() === 'universitaire') return true;
  const f = String(fullName || '');
  if (/Universit[eé]|University/i.test(f)) return true;
  const c = String(code || '').toUpperCase();
  // Code univ. : seulement si le libellé est vraiment l’établissement.
  // « Carabins » + code MTL ne doit pas devenir UdeM.
  if (SPORTS_UNI_CODE_ACRONYM[c]) {
    if (/Universit[eé]|University/i.test(f)) return true;
    const ac = SPORTS_UNI_CODE_ACRONYM[c];
    const s = String(shortName || '').trim();
    if (s && (s === ac || s === c || /^U[A-ZÉ]{2,}/i.test(s))) return true;
    // USHE + « Sherbrooke » (pas Carabins + MTL).
    if (s && sportsUniCityAcronym(s)) return true;
    if (!s && !f) return true;
    return false;
  }
  // Acronyme table **seulement** si fullName d’université (pas short seul)
  if (f) {
    const ac = sportsLookupInstitutionAcronym(f);
    return !!(ac && /^(U|ÉTS|ETS|HEC|McGill|Concordia|Bishop|Poly|uOttawa)/i.test(ac));
  }
  return false;
}

/** Adversaire Spordle manquant : le bot écrit « ADV » (adversaire), pas une école. */
const SPORTS_PLACEHOLDER_OPPONENT_RE = /^(ADV|TBD|TBA|N\/A|\?+|adversaire)$/i;

function sportsGameHasNamedOpponent(game) {
  if (!game) return false;
  if (sportsIsPlaceResult(game, game.sport)) return true;
  const n = String(game.opponent || '').trim();
  const full = String(game.opponentFullName || '').trim();
  if (SPORTS_PLACEHOLDER_OPPONENT_RE.test(n) && !full) return false;
  if (!n && !full) return false;
  if (SPORTS_PLACEHOLDER_OPPONENT_RE.test(n) && SPORTS_PLACEHOLDER_OPPONENT_RE.test(full || n)) {
    return false;
  }
  return true;
}

function sportsSlideIsDisplayable(slide) {
  if (!slide?.game) return false;
  return sportsGameHasNamedOpponent(slide.game);
}

/**
 * Nom d’établissement en clair — garde-fou `noms-lisibles`
 * (focus-group le-radar-sports-first-glance). Tooltips : forme lisible.
 * CTA + puces scores : acronymes univ (sinon le titre coupe « Université de Mc… »).
 * **Jamais** de troncature `…` — marquee L→R si trop long.
 */
function sportsPlainTeamName(team) {
  return sportsDisplaySideName({
    shortName: team?.name,
    fullName: team?.fullName,
    code: team?.code,
    sector: team?.sector,
    fallback: 'Équipe',
    preferAcronym: false,
  });
}

function sportsPlainOpponentName(game) {
  return sportsDisplaySideName({
    shortName: game?.opponent,
    fullName: game?.opponentFullName,
    code: game?.opponentCode,
    fallback: 'adversaire',
    preferAcronym: false,
  });
}

/**
 * Libellé d’une face (équipe ou adversaire).
 * - Nom d’équipe d’abord (Vert & Or, Cheetahs…) — univ et cégeps.
 * - Garde « Notre-Dame Bleu / Jaune ».
 * - Repli puces : univ → ULaval / UdeS… ; collégial ville → Cégep Sherbrooke.
 * - Sinon mono-token → fullName établissement (tooltip).
 */
function sportsDisplaySideName({
  shortName, fullName, code, sector, nickname, fallback = 'Équipe', preferAcronym = false,
} = {}) {
  const nick = String(nickname || '').trim();
  if (nick) return nick;
  let short = String(shortName || '').trim();
  let full = String(fullName || '').trim();
  const codeU = String(code || '').toUpperCase();

  // Déplier « Ch.-St-Lambert » → « Champlain St-Lambert » (etc.)
  if (short && SPORTS_CRYPTIC_SHORT_EXPAND[short]) {
    short = SPORTS_CRYPTIC_SHORT_EXPAND[short];
  }
  if (full && (full.startsWith('Cégep de Ch.') || full.includes('Témisc.') || full.includes('Ch.-'))) {
    if (codeU === 'SLC' || /St-?Lawrence/i.test(full) || /St-?Lawrence/i.test(short)) {
      full = 'Champlain College St. Lawrence';
    } else if (codeU === 'SLA' || /St-?Lambert/i.test(full) || /St-?Lambert/i.test(short)) {
      full = 'Champlain College Saint-Lambert';
    } else if (codeU === 'LEN' || /Lennoxville/i.test(full) || /Lennoxville/i.test(short)) {
      full = 'Champlain College Lennoxville';
    } else if (codeU === 'CAT' || /Abitibi/i.test(full)) {
      full = "Cégep de l'Abitibi-Témiscamingue";
    }
  }

  if (short && SPORTS_TEAM_COLOR_SUFFIX_RE.test(short)) return short;

  // Acronyme univ. **uniquement** si ce n’est pas du collégial (bloque UdeS pour SHE).
  if (
    preferAcronym
    && !sportsLooksCollegial({ fullName: full, shortName: short, sector, code: codeU })
    && sportsLooksUniversity({ fullName: full, shortName: short, sector, code: codeU })
  ) {
    // Préférer fullName pour la table d’acronymes ; code USHE en repli.
    // Ne pas passer le short « Sherbrooke » seul (collision cégep / univ).
    const ac = sportsLookupInstitutionAcronym(full)
      || SPORTS_UNI_CODE_ACRONYM[codeU]
      || sportsUniCityAcronym(short)
      || '';
    if (ac) return ac;
    if (short && short.length <= 6 && /^[A-ZÉÙÛÂÊÎÔ0-9]{2,6}$/i.test(short)) return short;
  }

  // Ville seule = ambigu cégep vs univ (Trois-Rivières / UQTR, Rimouski / UQAR…).
  // Avant le return multi-parties « Trois-Rivières » (hyphen) qui court-circuitait le fullName.
  const cityDis = sportsCollegialCityDisambig({
    shortName: short, fullName: full, code: codeU, sector,
  });
  if (cityDis) {
    // CTA / tooltip : fullName officiel si déjà « Cégep … »
    if (!preferAcronym && full && /^C[eé]gep\b/i.test(full)) return full;
    return cityDis;
  }

  // Multi-parties déjà distinctives (Lionel-Groulx, Vieux Montréal…)
  if (short && /[\s-]/.test(short) && short.replace(/-/g, '').length >= 5) return short;

  // Mono-token : fullName si CTA ; sur puce étroite sans acronyme → short
  if (full && short && !/[\s-]/.test(short) && full.length > short.length) {
    if (preferAcronym) return short;
    return full;
  }
  if (short) return short;
  if (full) return full;
  return String(code || fallback).trim() || fallback;
}

/**
 * Sigle univ. (UdeS) ou nom officiel cégep (Cégep de l'Outaouais)
 * à coller à droite du surnom : « Vert & Or (UdeS) ».
 */
function sportsInstitutionParen({ shortName, fullName, code, sector } = {}) {
  const short = String(shortName || '').trim();
  const full = String(fullName || '').trim();
  const codeU = String(code || '').toUpperCase();
  if (sportsLooksCollegial({ fullName: full, shortName: short, sector, code: codeU })) {
    if (SPORTS_COLLEGIAL_CITY_DISAMBIG[codeU]) return SPORTS_COLLEGIAL_CITY_DISAMBIG[codeU];
    const fold = sportsFoldKey(short.replace(/^Cégep\s+(de\s+|d'|du\s+|de\s+la\s+)?/i, ''));
    if (SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[fold]) return SPORTS_COLLEGIAL_CITY_SHORT_DISAMBIG[fold];
    if (short && !/^Cégep\b/i.test(short)) return short;
    return full || short;
  }
  if (sportsLooksUniversity({ fullName: full, shortName: short, sector, code: codeU })) {
    return sportsLookupInstitutionAcronym(full)
      || SPORTS_UNI_CODE_ACRONYM[codeU]
      || sportsUniCityAcronym(short)
      || '';
  }
  return '';
}

function sportsChipWithInstitution(label, paren) {
  const l = String(label || '').trim();
  const p = String(paren || '').trim();
  if (!l) return p;
  if (!p) return l;
  if (l === p || l.includes(`(${p})`)) return l;
  const foldL = sportsFoldKey(l);
  const foldP = sportsFoldKey(p);
  if (foldL === foldP || foldL.endsWith(foldP) || foldP.endsWith(foldL)) return l;
  return `${l} (${p})`;
}

/**
 * Nom d’équipe pour **puce** : surnom + (sigle) (Vert & Or (UdeS)).
 * Sans surnom : acronyme univ. ou nom officiel cégep. Voile = club.
 */
function sportsChipTeamShort(team) {
  const sport = String(team?.sport || '').toLowerCase();
  const sailing = sport === 'sailing' || sport === 'voile';
  const args = {
    shortName: team?.name || team?.shortName,
    fullName: team?.fullName,
    code: team?.code,
    sector: team?.sector,
  };
  const nick = sailing ? '' : String(team?.nickname || '').trim();
  if (nick) return sportsChipWithInstitution(nick, sportsInstitutionParen(args));
  let name = sportsDisplaySideName({
    ...args,
    nickname: '',
    preferAcronym: true,
    fallback: 'Équipe',
  });
  if (sailing) {
    name = name.replace(/\s+(sailing|voile)\s*$/i, '').trim() || name;
  }
  return name;
}

/** Adversaire sur puce — surnom + (sigle), comme l’équipe à domicile. */
function sportsChipOpponentLabel(game) {
  const full = String(game?.opponentFullName || '');
  const code = String(game?.opponentCode || '').toUpperCase();
  const sport = String(game?.sport || '').toLowerCase();
  const sailing = sport === 'sailing' || sport === 'voile';
  let sector = '';
  if (sportsLooksCollegial({ fullName: full, shortName: game?.opponent, code })) {
    sector = 'collegial';
  } else if (sportsLooksUniversity({ fullName: full, shortName: game?.opponent, code })) {
    sector = 'universitaire';
  }
  const args = {
    shortName: game?.opponent,
    fullName: game?.opponentFullName,
    code: game?.opponentCode,
    sector,
  };
  const nick = sailing ? '' : String(game?.opponentNickname || '').trim();
  if (nick) return sportsChipWithInstitution(nick, sportsInstitutionParen(args));
  return sportsDisplaySideName({
    ...args,
    nickname: '',
    preferAcronym: sector === 'universitaire',
    fallback: 'adversaire',
  });
}

/** Événement / compétition pour place (régates) — texte entier, marquee si long. */
function sportsPlaceEventShort(game) {
  const comp = String(game?.competition || '').trim();
  if (comp) return comp;
  const opp = sportsPlainOpponentName(game);
  return opp;
}

/** Verbe de rencontre — domicile « reçoit », visiteur « chez » (ton presse : à = lieu, chez = domicile d’équipe). */
function sportsMatchVerb(game, lang = 'fr') {
  if (game?.home === false) return lang === 'en' ? 'at' : 'chez';
  return lang === 'en' ? 'hosts' : 'reçoit';
}

/**
 * Séparateur de score final quand le chiffre est déjà dans la pastille
 * (Hier). Plus court que « vs » / « contre » ; lisible FR et EN
 * (tennis, télégrammes). Pas un 2ᵉ score — le ton pâle de `.sports-chip__vs`.
 */
const SPORTS_RESULT_VS = 'v.';

function sportsVsParticleHtml(particleFr) {
  const fr = String(particleFr || '').trim();
  const shown = window.RadarTranslate?.displayUiText?.(fr) || fr;
  return `<span class="sports-chip__vs" data-vs-orig="${escapeHtml(fr)}">${escapeHtml(shown)}</span>`;
}

function sportsVsHtml(game) {
  return sportsVsParticleHtml(sportsMatchVerb(game, 'fr'));
}

function sportsResultVsHtml() {
  return sportsVsParticleHtml(SPORTS_RESULT_VS);
}

/**
 * Score live : chiffre collé, sinon 0–0 (soccer, hockey, football, basket,
 * volleyball…). RSEQ envoie souvent -999 tant que le rapport n’est pas versé
 * — un match sans chiffre s’affiche comme au coup d’envoi. Place / voile
 * n’utilisent jamais ce 0–0.
 */
const SPORTS_LIVE_SCORE_PENDING_SIDE = '0';
const SPORTS_LIVE_SCORE_PENDING = `${SPORTS_LIVE_SCORE_PENDING_SIDE}–${SPORTS_LIVE_SCORE_PENDING_SIDE}`;

function sportsLiveScoreText(game) {
  if (sportsIsPlaceResult(game, game?.sport)) {
    return sportsPlaceScoreText(game) || '';
  }
  const a = sportsScoreNumber(game?.scoreFor);
  const b = sportsScoreNumber(game?.scoreAgainst);
  if (a != null && b != null) return `${a}–${b}`;
  return SPORTS_LIVE_SCORE_PENDING;
}

function sportsLiveTeamsScoreHtml(team, game) {
  const home = sportsChipTeamShort(team);
  const opp = sportsChipOpponentLabel(game);
  const scoreTxt = sportsLiveScoreText(game);
  return `<span class="sports-chip__name">${escapeHtml(home)}</span> `
    + `<span class="sports-chip__score">${escapeHtml(scoreTxt)}</span> `
    + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
}

/**
 * Live-first (focus-group le-radar-sports-scorebug E) : domicile dessus,
 * visiteur dessous, chiffre à droite. `game.home === false` = on est l’extérieur
 * donc l’adversaire est le domicile. Score « pour nous » reste scoreFor.
 */
function sportsScorebugSides(team, game) {
  const us = sportsChipTeamShort(team);
  const them = sportsChipOpponentLabel(game);
  const has = sportsGameHasScore(game);
  const usN = has ? String(game.scoreFor) : SPORTS_LIVE_SCORE_PENDING_SIDE;
  const themN = has ? String(game.scoreAgainst) : SPORTS_LIVE_SCORE_PENDING_SIDE;
  if (game?.home === false) {
    return { homeName: them, homeNum: themN, awayName: us, awayNum: usN };
  }
  return { homeName: us, homeNum: usN, awayName: them, awayNum: themN };
}

function sportsScorebugLampWord() {
  return window.RadarTranslate?.displayUiText?.(SPORTS_CTA_TAG_LIVE) || SPORTS_CTA_TAG_LIVE;
}

/** Scorebug live — lampe En direct + 2 rangées. aria-live seulement sur les chiffres. */
function buildSportsScorebugEl(team, game, opts = {}) {
  const sides = sportsScorebugSides(team, game);
  const period = opts.period != null ? opts.period : sportsLivePeriodLabel(game);
  const wrap = document.createElement('span');
  wrap.className = opts.page ? 'scorebug scorebug--page' : 'scorebug';
  wrap.setAttribute('aria-hidden', 'false');

  const lamp = document.createElement('span');
  lamp.className = 'scorebug__lamp';
  markNoTranslate(lamp);
  const dot = document.createElement('span');
  dot.className = 'scorebug__dot';
  dot.setAttribute('aria-hidden', 'true');
  const word = document.createElement('span');
  word.className = 'scorebug__lamp-word';
  word.textContent = sportsScorebugLampWord();
  lamp.append(dot, word);
  if (period) {
    const pEl = document.createElement('span');
    pEl.className = 'scorebug__period';
    pEl.textContent = period;
    lamp.append(pEl);
  }

  const rows = document.createElement('span');
  rows.className = 'scorebug__rows';
  const addRow = (name, num, side) => {
    const row = document.createElement('span');
    row.className = 'scorebug__row';
    const club = document.createElement('span');
    club.className = 'scorebug__club';
    club.textContent = name;
    const n = document.createElement('span');
    n.className = 'scorebug__num';
    n.dataset.side = side;
    n.setAttribute('aria-live', 'polite');
    n.textContent = num;
    row.append(club, n);
    rows.append(row);
  };
  addRow(sides.homeName, sides.homeNum, 'home');
  addRow(sides.awayName, sides.awayNum, 'away');
  wrap.append(lamp, rows);
  return wrap;
}

function sportsScorebugSubLine(slide) {
  const kick = sportsKickoffClock(slide?.game);
  const comp = sportsCompetitionLabel(slide);
  const stamp = sportsUpdatedShort();
  const parts = [kick, comp];
  if (stamp && !(kick && stamp.includes(kick))) parts.push(stamp);
  return parts.filter(Boolean).join(' · ');
}

function patchSportsScorebug(root, team, game) {
  const bug = root?.querySelector?.('.scorebug') || (root?.classList?.contains('scorebug') ? root : null);
  if (!bug || !team || !game) return false;
  const sides = sportsScorebugSides(team, game);
  const set = (sel, text) => {
    const el = bug.querySelector(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };
  set('.scorebug__num[data-side="home"]', sides.homeNum);
  set('.scorebug__num[data-side="away"]', sides.awayNum);
  const clubs = bug.querySelectorAll('.scorebug__club');
  if (clubs[0] && clubs[0].textContent !== sides.homeName) clubs[0].textContent = sides.homeName;
  if (clubs[1] && clubs[1].textContent !== sides.awayName) clubs[1].textContent = sides.awayName;
  const period = sportsLivePeriodLabel(game);
  let pEl = bug.querySelector('.scorebug__period');
  if (period) {
    if (!pEl) {
      pEl = document.createElement('span');
      pEl.className = 'scorebug__period';
      bug.querySelector('.scorebug__lamp')?.append(pEl);
    }
    if (pEl.textContent !== period) pEl.textContent = period;
  }
  return true;
}

/** Domicile / extérieur — tooltip / sous-ligne optionnelle. */
function sportsVenueLabel(game, lang = 'fr') {
  if (game?.home === false) return lang === 'en' ? 'away' : 'extérieur';
  if (game?.home === true) return lang === 'en' ? 'home' : 'domicile';
  return '';
}

function sportsIsPlaceResult(game, sport) {
  return game?.scoreKind === 'place'
    || sport === 'sailing'
    || game?.sport === 'sailing';
}

/** Jour + date + heure, écrits pour être situés sans compter : « jeu. 20 août, 20 h 30 ». */
function sportsWhenLong(iso, time) {
  if (!iso) return '';
  let label = iso;
  try {
    label = new Intl.DateTimeFormat('fr-CA', {
      weekday: 'short', day: 'numeric', month: 'long',
    }).format(new Date(`${iso}T12:00:00`));
  } catch { /* keep iso */ }
  if (time) label += `, ${String(time).replace(':', ' h ')}`;
  return label;
}

/** Heure de coup d’envoi seule — « 17 h 00 ». */
function sportsKickoffClock(game) {
  const t = String(game?.time || '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1]} h ${m[2]}`;
}

/** AM avant midi Toronto, PM à partir de 12 h 00. */
function sportsMeridiem(game) {
  const t = String(game?.time || '').trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return Number(m[1]) < 12 ? 'AM' : 'PM';
}

/** Aujourd’hui (À venir / résultat du jour) : « ce » est licite. */
function sportsCtaTagIsToday(wanted) {
  return wanted === SPORTS_CTA_TAG_SOON || wanted === 'Aujourd’hui';
}

/**
 * 2e ligne. `today: true` → cet AM / ce PM.
 * Demain → AM / PM seuls. Hier n’en a pas.
 */
function sportsMeridiemLine(game, { today = false } = {}) {
  const half = sportsMeridiem(game);
  if (!half) return '';
  if (!today) return half;
  return half === 'AM' ? SPORTS_MERIDIEM_AM_LINE : SPORTS_MERIDIEM_PM_LINE;
}

/** AM/PM : aujourd’hui et demain. Pas Hier, En direct, Prochain. */
function sportsCtaTagUsesMeridiem(wanted) {
  if (!wanted) return false;
  if (wanted === SPORTS_CTA_TAG_LIVE) return false;
  if (wanted === SPORTS_CTA_TAG_NEXT) return false;
  if (wanted === RADAR_BRAND_SHORT) return false;
  if (wanted === 'Hier') return false;
  if (wanted === SPORTS_CTA_TAG_LATEST) return false;
  return true;
}

/** Âge lisible d’un fait daté — « il y a 14 h », « hier », « il y a 3 j ». */
function sportsRelativeAge(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const delta = Math.max(0, now - ms);
  const min = Math.round(delta / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(delta / 3600000);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(delta / 86400000);
  return days <= 1 ? 'hier' : `il y a ${days} j`;
}

/** Échéance lisible — passé : « il y a 5 h » ; futur : « dans 3 h », « demain ». */
function sportsRelativeWhen(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  if (ms <= now) return sportsRelativeAge(ms, now);
  const min = Math.round((ms - now) / 60000);
  if (min < 2) return 'imminent';
  if (min < 60) return `dans ${min} min`;
  const hours = Math.round((ms - now) / 3600000);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round((ms - now) / 86400000);
  if (days <= 1) return 'demain';
  return `dans ${days} j`;
}

/**
 * Horodatage de la banque, **rendu dans la carte** — garde-fou
 * `fraicheur-visible`. Il n’existait que dans `title`/`aria-label` : au doigt il
 * n’y a pas de survol, donc sur téléphone personne ne l’a jamais vu.
 */
function sportsUpdatedShort() {
  const raw = sportsData?.updated;
  if (!raw) return '';
  try {
    const when = new Intl.DateTimeFormat('fr-CA', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
    }).format(new Date(raw));
    return `mis à jour à ${when.replace(':', ' h ')}`;
  } catch {
    return '';
  }
}

/** Libellé de compétition, ou repli sport + secteur. */
function sportsCompetitionLabel(slide) {
  const comp = String(slide?.game?.competition || '').trim();
  if (comp) return comp;
  const sport = sportsSportLabelFr(slide?.team?.sport || slide?.game?.sport || '');
  const sector = slide?.team?.sector === 'universitaire' ? 'universitaire' : 'collégial';
  return sport ? `${sport} ${sector}` : '';
}

/**
 * Sous-ligne des puces scores (gauche) — parité CTA :
 * date/heure · compétition · [saison précédente].
 * La compétition (ex. « Hockey collégial masculin D2 ») est la même info
 * qu’à droite de la date sur la carte CTA (`sportsCtaSubLine`).
 */
/**
 * Mot de temps des puces (même vocabulaire que la CTA) :
 * Aujourd’hui / Demain / hier. Vide → date courte.
 */
/** Kicker : En direct / Aujourd’hui / Demain / Prochain+date / Hier / date. */
function sportsMatchWhenTag(slide) {
  const g = slide?.game || {};
  if (sportsGameIsLive(g)) {
    return { word: SPORTS_CTA_TAG_LIVE, lamp: 'live' };
  }
  const day = sportsSlideDayKey(slide);
  const today = torontoDayKey();
  if (slide?.mode === 'next') {
    if (day && day === today) {
      return { word: SPORTS_CTA_TAG_SOON, lamp: 'soon' };
    }
    if (day && day === sportsCivilDayShift(today, 1)) {
      return { word: SPORTS_CTA_TAG_TOMORROW, lamp: 'next' };
    }
    const iso = g.date || day;
    return {
      word: SPORTS_CTA_TAG_NEXT,
      lamp: 'next',
      dateLine: sportsCtaCompactDateLine(iso),
    };
  }
  if (slide?.mode === 'result') {
    const word = sportsCtaResultTag(slide);
    let lamp = 'past';
    if (day && day === today) lamp = 'today';
    return { word, lamp };
  }
  return null;
}

function sportsWhenWord(slide) {
  const g = slide?.game || {};
  if (sportsGameIsLive(g)) return '';
  const day = sportsSlideDayKey(slide);
  if (!day) return '';
  const today = torontoDayKey();
  if (day === today) {
    if (slide.mode === 'next') return SPORTS_MATCH_TAG_TODAY;
    if (slide.mode === 'result') return 'aujourd’hui';
  }
  if (day === sportsCivilDayShift(today, 1)) return 'Demain';
  if (day === sportsCivilDayShift(today, -1)) return 'hier';
  return '';
}

function sportsMatchSubLine(slide) {
  const g = slide?.game || {};
  const tag = sportsMatchWhenTag(slide);
  const clock = sportsKickoffClock(g);
  let when = '';
  if (tag) {
    when = clock;
  } else {
    const word = sportsWhenWord(slide);
    if (word === SPORTS_MATCH_TAG_TODAY || word === 'Demain') {
      when = [word, clock].filter(Boolean).join(' · ');
    } else if (word) {
      when = word;
    } else {
      when = formatSportsWhen(g.date, g.time);
    }
  }
  const prior = !!(g.priorSeason || slide?.team?.lastGamePriorSeason);
  const placeKind = sportsIsPlaceResult(g, slide?.team?.sport || g.sport);
  // Régate / place : l’événement de place prime (souvent = competition).
  const meta = placeKind
    ? (sportsPlaceEventShort(g) || sportsCompetitionLabel(slide))
    : sportsCompetitionLabel(slide);
  return [when, meta, prior ? 'Saison précédente' : ''].filter(Boolean).join(' · ');
}

/**
 * Accroche principale de la CTA — acronymes univ (UQAM, McGill), comme les puces.
 * Le marqueur temporel vit à part (`sportsCtaEyebrow`) pour rester hors de la
 * zone qui défile (garde-fou `marqueur-non-tronque`).
 */
function sportsCtaLabelFromSlide(slide) {
  if (!slide?.team || !slide.game) return '';
  const g = slide.game;
  const glyph = sportsGlyph(slide.team.sport || g.sport);
  const home = sportsChipTeamShort(slide.team);
  const opp = sportsChipOpponentLabel(g);

  if (sportsGameIsLive(g)) {
    return `${glyph} ${home} ${sportsLiveScoreText(g)} ${opp}`;
  }
  if (slide.mode === 'next') {
    return `${glyph} ${home} ${sportsMatchVerb(g)} ${opp}`;
  }
  if (slide.mode === 'result') {
    const placeKind = sportsIsPlaceResult(g, slide.team.sport);
    const score = sportsResultMarkText(g, slide.team.sport);
    return placeKind
      ? `${glyph} ${home} ${score}`
      : `${glyph} ${home} ${score} ${opp}`;
  }
  return `${glyph} ${home}`;
}

/**
 * Plus de marqueur à côté / au-dessus de la pastille : Prochain / Hier /
 * Aujourd’hui vivent **dans** la pastille (`sportsCtaTagLabel`).
 */
function sportsCtaEyebrow(_slide, _state) {
  return '';
}

/**
 * Date compacte pour la 2ᵉ ligne de Prochain : « ven. 4 sept ».
 */
function sportsCtaCompactDateLine(iso) {
  const day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  try {
    const parts = new Intl.DateTimeFormat('fr-CA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Toronto',
    }).formatToParts(new Date(`${day}T12:00:00`));
    const weekday = ((parts.find((p) => p.type === 'weekday') || {}).value || '')
      .replace(/\.$/, '');
    const dayNum = (parts.find((p) => p.type === 'day') || {}).value;
    const month = (parts.find((p) => p.type === 'month') || {}).value;
    if (weekday && dayNum && month) return `${weekday}. ${dayNum} ${month}`;
    if (dayNum && month) return `${dayNum} ${month}`;
  } catch { /* fall through */ }
  return '';
}

function sportsCtaTagDateLine(slide, wanted) {
  if (wanted !== SPORTS_CTA_TAG_NEXT) return '';
  const src = slide?.ctaFrom || slide;
  return sportsCtaCompactDateLine(src?.game?.date || sportsSlideDayKey(src));
}

/**
 * Date plus vieille que hier : « mercredi » / « 19 août »
 * (kicker 2 lignes). `formatToParts` pour ne pas parser la locale.
 */
function sportsCtaResultDateParts(iso) {
  if (!iso) return null;
  try {
    const d = new Date(`${iso}T12:00:00`);
    const parts = new Intl.DateTimeFormat('fr-CA', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Toronto',
    }).formatToParts(d);
    const weekday = (parts.find((p) => p.type === 'weekday') || {}).value;
    const dayNum = (parts.find((p) => p.type === 'day') || {}).value;
    const month = (parts.find((p) => p.type === 'month') || {}).value;
    if (weekday && dayNum && month) return [weekday, `${dayNum} ${month}`];
  } catch { /* fall through */ }
  return null;
}

/** Pastille d’un résultat : Dernière heure, Hier, sinon date (jour + mois). */
function sportsCtaResultTag(src) {
  const day = sportsSlideDayKey(src);
  if (!day) return SPORTS_CTA_TAG;
  const today = torontoDayKey();
  if (day === today) return SPORTS_CTA_TAG_LATEST;
  if (day === sportsCivilDayShift(today, -1)) return 'Hier';
  const iso = src?.game?.date || day;
  const parts = sportsCtaResultDateParts(iso);
  return parts ? parts.join(' ') : iso;
}

/** Coup d’envoi (ou résultat) le jour civil Toronto d’aujourd’hui. */
function sportsCtaGameIsToday(slide) {
  const src = slide?.ctaFrom || slide;
  const day = sportsSlideDayKey(src);
  return !!(day && day === torontoDayKey());
}

function sportsCtaGameIsTomorrow(slide) {
  const src = slide?.ctaFrom || slide;
  const day = sportsSlideDayKey(src);
  return !!(day && day === sportsCivilDayShift(torontoDayKey(), 1));
}

/**
 * Pastille : Aujourd’hui (à venir du jour) / Demain / Prochain+date
 * / En direct / Dernière heure / Hier / date.
 * Creux : LE-RADAR.ca (logo PWA), pas « Sports ».
 */
function sportsCtaTagLabel(slide, state) {
  const st = state || sportsCtaState(slide);
  if (st === 'live') return SPORTS_CTA_TAG_LIVE;
  if (st === 'next') {
    if (sportsCtaGameIsToday(slide)) return SPORTS_CTA_TAG_SOON;
    if (sportsCtaGameIsTomorrow(slide)) return SPORTS_CTA_TAG_TOMORROW;
    return SPORTS_CTA_TAG_NEXT;
  }
  if (st === 'result') return sportsCtaResultTag(slide?.ctaFrom || slide);
  return RADAR_BRAND_SHORT;
}

/**
 * Date courte « mercredi 19 août » / « mer. 19 août » → 2 lignes
 * (jour de la semaine, puis jour + mois).
 */
function sportsCtaDateLinePair(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\S+)\s+(\d{1,2}\s+\S.+)$/u);
  return m ? [m[1], m[2].trim()] : null;
}

/**
 * Kicker F : 1 ligne, sauf « Dernière heure », « Prochain » + date, et les
 * dates plus vieilles que hier (2 lignes). Score entre les noms.
 */
function sportsCtaTagLinePair(wanted, shown, extra = {}) {
  if (wanted === SPORTS_CTA_TAG_LATEST) {
    const parts = String(shown).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
  }
  if (wanted === SPORTS_CTA_TAG_NEXT) {
    const dateLine = String(extra.dateLine || '').trim();
    if (dateLine) return [shown, dateLine];
  }
  return sportsCtaDateLinePair(shown) || sportsCtaDateLinePair(wanted);
}

function fillSportsCtaTagCopy(tag, wanted, extra = {}) {
  tag.replaceChildren();
  markNoTranslate(tag);
  const shown = window.RadarTranslate?.displayUiText?.(wanted) || wanted;
  const pair = sportsCtaTagLinePair(wanted, shown, extra);
  if (pair) {
    const lines = document.createElement('span');
    lines.className = 'sports-chip__cta-tag-lines';
    pair.forEach((txt) => {
      const line = document.createElement('span');
      line.textContent = txt;
      lines.append(line);
    });
    tag.append(lines);
    return;
  }
  tag.append(document.createTextNode(shown));
}

function setSportsLocalizableText(el, original) {
  if (!el) return;
  const raw = String(original || '');
  el.dataset.origFr = raw;
  el.textContent = window.RadarTranslate?.displayUiText?.(raw) || raw;
}

function collectSportsChromeOriginals() {
  const out = new Set();
  document.querySelectorAll('.sports-chip .sports-chip__cta-tag[data-cta-tag]').forEach((tag) => {
    if (tag.classList.contains('sports-chip__cta-tag--brand')) return;
    if (tag.dataset.ctaTag) out.add(tag.dataset.ctaTag);
    if (tag.dataset.ctaMeridiemLine) out.add(tag.dataset.ctaMeridiemLine);
    if (tag.dataset.ctaDateLine) out.add(tag.dataset.ctaDateLine);
  });
  document.querySelectorAll('.sports-chip--match .sports-chip__when-tag[data-when-tag]').forEach((tag) => {
    if (tag.dataset.whenTag) out.add(tag.dataset.whenTag);
    if (tag.dataset.meridiem) out.add(tag.dataset.meridiem);
  });
  document.querySelectorAll('[data-orig-fr]').forEach((el) => {
    if (el.classList.contains('notranslate')) return;
    const raw = el.getAttribute('data-orig-fr');
    if (raw) out.add(raw);
  });
  document.querySelectorAll('.sports-chip__vs[data-vs-orig]').forEach((el) => {
    const orig = el.getAttribute('data-vs-orig');
    if (orig) out.add(orig);
  });
  return [...out];
}

function paintSportsChromeLanguage() {
  document.querySelectorAll('.sports-chip .sports-chip__cta-tag').forEach((tag) => {
    if (tag.classList.contains('sports-chip__cta-tag--brand')) return;
    const wanted = tag.dataset.ctaTag;
    if (wanted) {
      fillSportsCtaTagCopy(tag, wanted, {
        score: tag.dataset.ctaScore,
        meridiemLine: tag.dataset.ctaMeridiemLine,
        dateLine: tag.dataset.ctaDateLine,
      });
    }
  });
  document.querySelectorAll('.sports-chip--match .sports-chip__when-tag').forEach((tag) => {
    const wanted = tag.dataset.whenTag;
    if (wanted) {
      fillSportsCtaTagCopy(tag, wanted, {
        meridiemLine: tag.dataset.meridiem || '',
        dateLine: tag.dataset.ctaDateLine || '',
      });
    }
  });
  document.querySelectorAll('[data-orig-fr]').forEach((el) => {
    if (el.classList.contains('notranslate')) return;
    const raw = el.getAttribute('data-orig-fr');
    if (raw == null) return;
    el.textContent = window.RadarTranslate?.displayUiText?.(raw) || raw;
  });
  document.querySelectorAll('.sports-chip__vs[data-vs-orig]').forEach((el) => {
    const orig = el.getAttribute('data-vs-orig');
    if (!orig) return;
    el.textContent = window.RadarTranslate?.displayUiText?.(orig) || orig;
  });
}

/** Pastilles + sous-lignes : glossaire, puis cache MT (IU / « ce PM »). */
let sportsChromeLangTimer = 0;
function refreshSportsChromeLanguage() {
  paintSportsChromeLanguage();
  window.clearTimeout(sportsChromeLangTimer);
  sportsChromeLangTimer = window.setTimeout(() => {
    const api = window.RadarTranslate;
    const mode = api?.getMode?.();
    if (!api?.translateText || !mode || mode === api.DEFAULT_MODE) return;
    const originals = collectSportsChromeOriginals();
    if (!originals.length) return;
    Promise.all(originals.map((s) => api.translateText(s, mode))).then(() => {
      paintSportsChromeLanguage();
    }).catch(() => { /* garder le glossaire */ });
  }, 40);
}

/** Couleur du voyant : live / soon (rouge pulse) · today (rouge) · next (ambre) · past (vert). */
function sportsCtaLamp(slide, state) {
  const st = state || sportsCtaState(slide);
  if (st === 'live') return 'live';
  if (st === 'next') return sportsCtaGameIsToday(slide) ? 'soon' : 'next';
  if (st === 'result') {
    const src = slide?.ctaFrom || slide;
    const day = sportsSlideDayKey(src);
    if (day && day === torontoDayKey()) return 'today';
    return 'past';
  }
  return 'idle';
}

/**
 * Sous-ligne live : heure de début (`18 h 30`), période RSEQ si elle existe,
 * compétition, tampon de dernière *vérification*. Jamais l’âge du coup
 * d’envoi (« il y a 2 min » sous En direct se lit comme un match fini).
 */
function sportsLiveSubParts(slide) {
  const kick = sportsKickoffClock(slide?.game);
  const period = sportsLivePeriodLabel(slide?.game);
  const comp = sportsCompetitionLabel(slide);
  const stamp = sportsUpdatedShort();
  const parts = [kick, period, comp];
  // Pas « 20 h 30 · … · mis à jour à 20 h 30 » — même horloge deux fois.
  if (stamp && !(kick && stamp.includes(kick))) parts.push(stamp);
  return parts.filter(Boolean);
}

/**
 * Sous-ligne CTA — hiérarchie scorebug (ESPN / Flashscore / L’Équipe) :
 *   live    → heure de début, période si l’API la donne, compétition,
 *             tampon « mis à jour à ». Jamais l’âge du coup d’envoi.
 *   prochain→ aujourd’hui : « Aujourd’hui · 19 h 00 » (compte à rebours
 *             seulement dans l’heure : « Aujourd’hui · dans 45 min »).
 *             Demain / plus tard : heure ou date, sans redire la pastille.
 *   résultat→ compétition. La pastille dit déjà Aujourd’hui / Hier ;
 *             l’âge du coup d’envoi ment (2 h de jeu ≠ « il y a 2 h »).
 */
function sportsCtaSubLine(slide, state) {
  const comp = sportsCompetitionLabel(slide);
  const g = slide?.game;
  const ms = sportsGameMs(g);
  const tag = sportsCtaTagLabel(slide, state);
  const now = Date.now();
  if (state === 'live') {
    return sportsLiveSubParts(slide).join(' · ');
  }
  if (state === 'next') {
    const minToGo = Number.isFinite(ms) ? Math.round((ms - now) / 60000) : null;
    let when = '';
    if (minToGo != null && minToGo >= 0 && minToGo < 60) {
      when = sportsRelativeWhen(ms, now);
    } else if (minToGo != null && minToGo >= 0) {
      const clock = sportsKickoffClock(g);
      const day = sportsSlideDayKey(slide);
      const today = day === torontoDayKey(now);
      const tomorrow = day === sportsCivilDayShift(torontoDayKey(now), 1);
      when = (today || tomorrow) ? clock : (sportsWhenLong(g?.date, g?.time) || clock);
    }
    if (sportsCtaGameIsToday(slide)) {
      when = when
        ? (/\baujourd/i.test(when) ? when : `Aujourd’hui · ${when}`)
        : 'Aujourd’hui';
    }
    if (when && when.toLowerCase() === String(tag || '').toLowerCase()) when = '';
    return [when, comp].filter(Boolean).join(' · ');
  }
  if (state === 'result') {
    return comp || '';
  }
  return [comp, sportsUpdatedShort()].filter(Boolean).join(' · ');
}

/**
 * Teinte lavis de la CTA : sport du match (ou résultat W/L), rouge live,
 * ardoise seulement en creux idle (pas de match à montrer).
 */
function sportsCtaTone(slide) {
  const state = slide?.ctaState || sportsCtaState(slide);
  if (state === 'live') return SPORTS_CTA_LIVE_TONE;
  const src = slide?.ctaFrom;
  if (src?.game || src?.team) return sportsSlideTone(src);
  if (slide?.tone && slide.tone !== SPORTS_CTA_REST_TONE) return slide.tone;
  return SPORTS_CTA_REST_TONE;
}

/**
 * Clé de dédup d’un match pour la CTA (focus-group le-radar-cta-sports-transition).
 * Priorité gameId ; sinon date + sport + paire d’équipes triée (miroir A↔B).
 */
function sportsMatchDedupeKey(slide) {
  const g = slide?.game || {};
  if (g.gameId != null && String(g.gameId).trim()) {
    return `gid:${String(g.gameId).trim()}`;
  }
  const sport = String(slide?.team?.sport || g.sport || '').toLowerCase();
  const a = String(slide?.team?.code || '').toUpperCase().slice(0, 4);
  const b = String(g.opponentCode || g.opponent || '').toUpperCase().slice(0, 4);
  const pair = [a, b].filter(Boolean).sort().join('|');
  return `pair:${g.date || ''}|${g.time || ''}|${sport}|${pair}`;
}

/**
 * Face d’un match miroir : **reçoit** ou **chez**, jamais les deux, jamais
 * le libellé « reçoit/chez ». Favori → sa face ; sinon pile ou face **stable**
 * (même match = même verbe jusqu’au prochain `sports.json`).
 */
function sportsMatchFaceHash(slide) {
  const key = sportsMatchDedupeKey(slide) || slide?.key || '';
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Rang CTA d’un résultat : vainqueur d’abord, puis nul, jamais la défaite. */
function sportsResultFaceRank(slide) {
  const r = String(slide?.game?.result || '');
  if (r === 'W') return 0;
  if (r === 'D' || r === 'T') return 1;
  if (r === 'L') return 3;
  return 2;
}

function sportsPreferMatchFace(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.mode === 'result' && b.mode === 'result') {
    const ra = sportsResultFaceRank(a);
    const rb = sportsResultFaceRank(b);
    if (ra !== rb) return ra < rb ? a : b;
  }
  let favSet = new Set();
  try { favSet = new Set(readSportsFavorites()); } catch { /* ignore */ }
  const fa = sportsIsFavorite(a.team, favSet);
  const fb = sportsIsFavorite(b.team, favSet);
  if (fa && !fb) return a;
  if (fb && !fa) return b;
  const home = a.game?.home === true ? a : (b.game?.home === true ? b : null);
  const away = a.game?.home === true ? b : a;
  if (home && away && home !== away) {
    return (sportsMatchFaceHash(home) & 1) === 0 ? home : away;
  }
  return a;
}

/** Une entrée par match (gameId / paire) — garde la face préférée. */
function sportsDedupeMatchSlides(slides) {
  const map = new Map();
  for (const s of slides) {
    if (!s) continue;
    const key = sportsMatchDedupeKey(s);
    if (!key || key === 'pair:|||') {
      // Sans ancre de match : garder tel quel (clé slide).
      map.set(s.key || `solo:${map.size}`, s);
      continue;
    }
    map.set(key, sportsPreferMatchFace(map.get(key), s));
  }
  return [...map.values()];
}

/**
 * Accueil : une carte par match à score (vainqueur, ou un seul N).
 * Régate / place : chaque formation garde sa place (pas le même match V/D).
 */
function sportsDedupeHomepageResults(slides) {
  const scored = [];
  const place = [];
  for (const s of slides || []) {
    if (!s) continue;
    if (sportsIsPlaceResult(s.game, s.team?.sport || s.game?.sport)) place.push(s);
    else scored.push(s);
  }
  return sportsDedupeMatchSlides(scored).concat(place);
}

/**
 * Clé d’un résultat à score. Plus utilisée pour coller V/D voisins :
 * le pool n’en garde qu’une face.
 */
function sportsResultMatchKey(slide) {
  if (slide?.mode !== 'result') return '';
  const key = sportsMatchDedupeKey(slide);
  return key && key !== 'pair:|||' ? key : '';
}

function sportsAdjacentResultMatchKeys(slot, visible = sportsVisible) {
  const keys = new Set();
  for (const i of [slot - 1, slot + 1]) {
    const key = sportsResultMatchKey(visible[i]);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Clés d’occupation d’une slide.
 * Un match à score = une face (vainqueur / un N / reçoit ou chez).
 * Régate / place : occupation par formation (slide.key), pas par match.
 */
function sportsSlideOccupyKeys(slide) {
  const keys = new Set();
  if (!slide) return keys;
  if (slide.mode === 'cta' && slide.ctaFrom) {
    if (slide.ctaFrom.key) keys.add(slide.ctaFrom.key);
    const dk = sportsMatchDedupeKey(slide.ctaFrom);
    if (dk && dk !== 'pair:|||') keys.add(dk);
    return keys;
  }
  if (slide.key) keys.add(slide.key);
  const place = sportsIsPlaceResult(slide.game, slide.team?.sport || slide.game?.sport);
  if (slide.mode === 'result' && place) return keys;
  const dk = sportsMatchDedupeKey(slide);
  if (dk && dk !== 'pair:|||') keys.add(dk);
  return keys;
}

/** true si la slide est déjà représentée (même face ou miroir) dans `used`. */
function sportsSlideIsUsed(slide, used) {
  if (!slide || !used?.size) return false;
  for (const k of sportsSlideOccupyKeys(slide)) {
    if (used.has(k)) return true;
  }
  return false;
}

/** Union des clés occupées par les slots visibles (sauf exceptSlot). */
function sportsVisibleOccupyKeys(exceptSlot = null) {
  const used = new Set();
  sportsVisible.forEach((s, i) => {
    if (exceptSlot != null && i === exceptSlot) return;
    for (const k of sportsSlideOccupyKeys(s)) used.add(k);
  });
  return used;
}

/**
 * Diversité sport souple après ordre chrono : évite 2× le même sport d’affilée
 * si une alternative existe dans les ~4 prochains slots — sans enterrer le
 * match le plus proche (verdict D, soft vs pure round-robin).
 */
function sportsSoftSportDiversity(slides) {
  if (!Array.isArray(slides) || slides.length < 3) return slides || [];
  const arr = slides.slice();
  const sportOf = (s) => String(s?.team?.sport || s?.game?.sport || '').toLowerCase();
  for (let i = 0; i < arr.length - 1; i += 1) {
    if (sportOf(arr[i]) !== sportOf(arr[i + 1])) continue;
    const same = sportOf(arr[i]);
    let swapAt = -1;
    for (let j = i + 2; j < Math.min(arr.length, i + 5); j += 1) {
      if (sportOf(arr[j]) && sportOf(arr[j]) !== same) {
        swapAt = j;
        break;
      }
    }
    if (swapAt > 0) {
      const [item] = arr.splice(swapAt, 1);
      arr.splice(i + 1, 0, item);
    }
  }
  return arr;
}

/**
 * Partage des rôles bandeau — focus-group `le-radar-cta-sports-window` F
 * + gates mainteneur (civil aujourd’hui/hier ; hors saison 7 j) :
 *
 *  CTA (droite)
 *   • **en direct** : uniquement les matchs en cours. Un seul → carte figée ;
 *     plusieurs → rotation entre eux. Dès qu’il n’y a plus de live, le cycle
 *     normal reprend.
 *   • sans live, ordre du cycle :
 *     1. à venir **dans l’heure**
 *     2. résultats **d’hier**
 *     3. résultats **d’aujourd’hui**
 *     4. autres à venir (jour lead ; hors saison : 1er match × 7 j)
 *   • **résultats** : aujourd’hui / hier seulement (plus vieux → puces, 5 j)
 *   • **en saison** (résultat aujourd’hui/hier) : prochains du **jour lead** seul
 *   • **hors saison** (pas de résultat aujourd’hui/hier) : **1er match** de
 *     chacun des **7 premiers jours** d’action à partir du jour lead, en
 *     alternance (rotation CTA) — pas un seul match pendant des jours
 *   • dédup miroir + diversité sport souple ; plafond SPORTS_CTA_MAX_POOL
 *   • adversaire placeholder (ADV / TBD) exclu
 *
 *  CARTES (une famille)
 *   • Résultats jusqu’à 5 j civils : une face par match (vainqueur / un N).
 *     Régate : une carte par formation. Puis à-venir. Hors saison : prochains.
 */
/** Jour civil America/Toronto d’une slide match (YYYY-MM-DD). */
function sportsSlideDayKey(slide) {
  const ms = sportsGameMs(slide?.game);
  if (Number.isFinite(ms)) return torontoDayKey(ms);
  const d = String(slide?.game?.date || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

/**
 * Jour lead CTA : premier jour civil (Toronto) qui a encore un match à venir
 * (ou en fenêtre live). Vide s’il n’y a aucun prochain en grille.
 */
function sportsCtaLeadDayKey(nextSlides = []) {
  if (!nextSlides.length) return '';
  let bestMs = Number.POSITIVE_INFINITY;
  let bestDay = '';
  for (const s of nextSlides) {
    const ms = sportsGameMs(s.game);
    if (!Number.isFinite(ms) || ms >= bestMs) continue;
    const day = sportsSlideDayKey(s);
    if (!day) continue;
    bestMs = ms;
    bestDay = day;
  }
  return bestDay;
}

/**
 * Matchs réellement en cours — source de vérité pour la CTA live.
 * Indépendant du pool mixte (résultats / prochains).
 */
function sportsCtaLiveSources(now = Date.now()) {
  const seen = new Set();
  const out = [];
  for (const s of sportsSlides) {
    if (!s || s.mode === 'cta' || !s.game || !s.key || seen.has(s.key)) continue;
    if (s.mode !== 'next' && s.mode !== 'result') continue;
    if (!sportsSlideIsDisplayable(s)) continue;
    if (!sportsGameIsLive(s.game, now)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return sportsDedupeMatchSlides(out);
}

/**
 * Chaleur du bandeau (plus bas = plus prioritaire) :
 * live → à-venir aujourd’hui (dans l’heure d’abord) → dernière heure
 * → autres à-venir → hier → reliquat 5 j.
 * Hier / musée 5 j ne passent plus devant un match encore à jouer.
 */
const SPORTS_OPEN_LIVE = 0;
const SPORTS_OPEN_TODAY_NEXT = 1;
const SPORTS_OPEN_TODAY_RESULT = 2;
const SPORTS_OPEN_LATER_NEXT = 3;
const SPORTS_OPEN_YESTERDAY = 4;
const SPORTS_OPEN_OLDER_RESULT = 5;

function sportsOpenOrderBucket(slide, now = Date.now()) {
  const g = slide?.game;
  if (!g) return 99;
  if (sportsGameIsLive(g, now)) return SPORTS_OPEN_LIVE;
  const today = torontoDayKey(now);
  const yesterday = sportsCivilDayShift(today, -1);
  const day = sportsGameDayKey(g, now) || sportsSlideDayKey(slide);
  if (slide.mode === 'next') {
    if (day === today || sportsCtaKickoffWithinHour(g, now)) return SPORTS_OPEN_TODAY_NEXT;
    return SPORTS_OPEN_LATER_NEXT;
  }
  if (slide.mode === 'result') {
    if (day === today) return SPORTS_OPEN_TODAY_RESULT;
    if (day === yesterday) return SPORTS_OPEN_YESTERDAY;
    if (sportsResultIsRecent(g, now)) return SPORTS_OPEN_OLDER_RESULT;
    return 99;
  }
  return 99;
}

/**
 * Liste unique. DOM = cet ordre. Pas de cycle éditorial à part,
 * pas de codes phares, pas de skip football.
 */
function sportsOpenOrderSlides(now = Date.now()) {
  const nexts = [];
  const results = [];
  const seen = new Set();
  for (const s of sportsSlides) {
    if (!s || s.mode === 'cta' || s.mode === 'info' || !s.game || !s.key) continue;
    if (seen.has(s.key)) continue;
    if (!sportsSlideIsDisplayable(s)) continue;
    seen.add(s.key);
    const bucket = sportsOpenOrderBucket(s, now);
    if (bucket > SPORTS_OPEN_OLDER_RESULT) continue;
    if (s.mode === 'result') {
      if (s.game?.priorSeason || s.team?.lastGamePriorSeason) continue;
      results.push(s);
    } else if (s.mode === 'next') {
      nexts.push(s);
    }
  }
  const list = sportsDedupeMatchSlides(nexts).concat(sportsDedupeHomepageResults(results));
  list.sort((a, b) => {
    const ba = sportsOpenOrderBucket(a, now);
    const bb = sportsOpenOrderBucket(b, now);
    if (ba !== bb) return ba - bb;
    const ma = sportsGameMs(a.game) || 0;
    const mb = sportsGameMs(b.game) || 0;
    const soonest = ba === SPORTS_OPEN_LIVE
      || ba === SPORTS_OPEN_TODAY_NEXT
      || ba === SPORTS_OPEN_LATER_NEXT;
    if (soonest) return ma - mb;
    return mb - ma;
  });
  return list.slice(0, SPORTS_CTA_MAX_POOL);
}

function sportsCtaCandidateSlides() {
  return sportsOpenOrderSlides();
}

/** Libellés CTA : matchs chauds, sinon messages hors saison / creux. */
function sportsCtaLabelPool() {
  const hot = sportsCtaCandidateSlides()
    .map(sportsCtaLabelFromSlide)
    .filter(Boolean);
  if (hot.length) return hot;
  return [RADAR_BRAND_SHORT];
}

/**
 * État visuel de la carte CTA. La slide CTA ne porte pas d’`urgency` à sa
 * racine : le match vit dans `ctaFrom`, il faut y descendre.
 */
function sportsCtaState(slide) {
  const src = slide?.ctaFrom || slide;
  if (!src?.game || src.mode === 'cta' || src.game.sport === 'board') return 'idle';
  if (sportsGameIsLive(src.game)) return 'live';
  if (src.mode === 'result') return 'result';
  if (src.mode === 'next') return 'next';
  return 'idle';
}

/** Un seul direct : la CTA reste dessus. Plusieurs : elle tourne entre eux. */
function sportsCtaHoldOnLive(slide) {
  const g = slide?.ctaFrom?.game || slide?.game;
  return sportsGameIsLive(g) && sportsCtaLiveSources().length < 2;
}

/**
 * Slide CTA — tête de liste (live / à-venir / aujourd’hui / dernière heure).
 * Match du pool ou accroche idle.
 */
function sportsCtaSlide(labelIndex = sportsCtaLabelIndex) {
  const candidates = sportsCtaCandidateSlides();
  if (!candidates.length) {
    return {
      mode: 'cta',
      key: `${SPORTS_CTA_KEY}:brand`,
      label: RADAR_BRAND_SHORT,
      labelIndex: 0,
      tone: SPORTS_CTA_REST_TONE,
      team: { sport: 'board', name: RADAR_BRAND_SHORT, code: 'RADAR' },
      game: { sport: 'board' },
      ctaIdle: true,
      ctaState: 'idle',
      ctaEyebrow: '',
      ctaSub: RADAR_BRAND_LONG,
      titleExtra: RADAR_BRAND_LONG,
    };
  }
  const idx = ((labelIndex % candidates.length) + candidates.length) % candidates.length;
  const src = candidates[idx];
  const label = sportsCtaLabelFromSlide(src);
  const state = sportsCtaState({ ctaFrom: src });
  const draft = {
    mode: 'cta',
    key: `${SPORTS_CTA_KEY}:${idx}`,
    label: label || SPORTS_CTA_IDLE_LABELS[0],
    labelIndex: idx,
    team: { sport: 'board', name: 'Sports', code: 'RSEQ' },
    game: { sport: 'board' },
    ctaFrom: src,
    ctaState: state,
    ctaEyebrow: sportsCtaEyebrow(src, state),
    ctaSub: sportsCtaSubLine(src, state),
    titleExtra: src
      ? `${src.team?.fullName || src.team?.name || ''} · ${label}`
      : '',
  };
  draft.tone = sportsCtaTone(draft);
  return draft;
}

/**
 * Pioche `n` slides CTA **sans la même info** (match / idle distincts).
 * @param {number} n
 * @returns {object[]}
 */
function pickDistinctSportsCtas(n) {
  const want = Math.max(1, n | 0);
  const out = [];
  const used = new Set();
  const candidates = sportsCtaCandidateSlides();
  const poolLen = Math.max(1, candidates.length || 1);

  for (let i = 0; i < poolLen && out.length < want; i += 1) {
    const slide = sportsCtaSlide(i);
    if (sportsSlideIsUsed(slide, used)) continue;
    // Idle sans ctaFrom : dédup par labelIndex / label
    if (slide.ctaIdle) {
      const idleKey = `idle:${slide.labelIndex}:${slide.label}`;
      if (used.has(idleKey)) continue;
      used.add(idleKey);
    }
    for (const k of sportsSlideOccupyKeys(slide)) used.add(k);
    used.add(slide.key);
    out.push(slide);
  }
  // Filet : au moins une CTA, et remplir jusqu’à `want` (4 à 3440)
  // même si le pool de matchs distincts est plus court.
  if (!out.length) out.push(sportsCtaSlide(0));
  for (let i = out.length; i < want; i += 1) {
    const slide = sportsCtaSlide(i);
    out.push({
      ...slide,
      key: `${SPORTS_CTA_KEY}:fill:${i}`,
      labelIndex: (slide?.labelIndex ?? 0) + i * 17,
    });
  }
  sportsCtaLabelIndex = out[0]?.labelIndex ?? 0;
  return out;
}

/** Tooltip + aria de la CTA SPORTS (sans reconstruire le DOM). */
function sportsCtaA11y(slide) {
  const updated = sportsData?.updated
    ? (() => {
      try {
        return new Intl.DateTimeFormat('fr-CA', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'America/Toronto',
        }).format(new Date(sportsData.updated));
      } catch {
        return String(sportsData.updated).slice(0, 16);
      }
    })()
    : '';
  let title;
  if (slide?.ctaFrom?.team) {
    title = [sportsChipTitle({ ...slide.ctaFrom, mode: slide.ctaFrom.mode || 'next' }), updated ? `MAJ ${updated}` : '']
      .filter(Boolean).join(' · ');
  } else {
    title = [RADAR_BRAND_SHORT, RADAR_BRAND_LONG].join(' · ');
  }
  const aria = slide?.ctaIdle
    ? `${RADAR_BRAND_SHORT} — ${RADAR_BRAND_LONG}`
    : `Sports : ${slide?.label || 'résultats sportifs étudiants du Québec'} (nouvel onglet)`;
  return { title, aria };
}

/**
 * Label CTA visible (couche front) — pour marquee / dwell / a11y.
 */
function sportsCtaActiveLabel(chip) {
  if (!chip) return null;
  return chip.querySelector('.sports-chip__cta-label.is-front')
    || chip.querySelector('.sports-chip__cta-label');
}

/**
 * Construit le contenu d’une couche d’accroche : marqueur, glyphe, texte, sous-ligne.
 * · Marqueur (PROCHAIN / Aujourd’hui…) : fixe, hors marquee
 *   (garde-fou `marqueur-non-tronque`).
 * · Glyphe sport (⚽…) : fixe, frère de la fenêtre de défilement — **ne défile pas**.
 * · Titre (`.sports-chip__cta-text`) et sous-ligne (`.sports-chip__cta-sub-text`)
 *   défilent L→R s’ils débordent — **jamais** d’ellipsis « … » (clip + marquee).
 */
function fillSportsCtaLayer(layer, slide) {
  layer.replaceChildren();
  // Ligne 1 : marqueur + glyphe (fixes) + fenêtre de défilement des noms.
  // Même structure que les puces gauche (glyphe hors `.sports-chip__body`).
  const head = document.createElement('span');
  head.className = 'sports-chip__cta-head';
  const eyebrow = slide.ctaEyebrow || '';
  if (eyebrow) {
    const el = document.createElement('span');
    el.className = 'sports-chip__cta-eyebrow sports-chip__cta-eyebrow--head';
    el.textContent = eyebrow;
    head.append(el);
  }
  const src = slide?.ctaFrom;
  const sportKey = src?.team?.sport || src?.game?.sport || '';
  const glyph = (src?.team || src?.game) && sportKey && sportKey !== 'board'
    ? sportsGlyph(sportKey)
    : '';
  if (glyph) {
    const gEl = document.createElement('span');
    gEl.className = 'sports-chip__cta-glyph';
    gEl.setAttribute('aria-hidden', 'true');
    gEl.textContent = glyph;
    head.append(gEl);
  }
  if (src?.mode === 'result' && src.game) {
    const badge = sportsResultBadgeEl(src.game, sportKey);
    if (badge) head.append(badge);
  }
  const line = document.createElement('span');
  line.className = 'sports-chip__cta-line';
  const text = document.createElement('span');
  text.className = 'sports-chip__cta-text';
  if (src?.team && src.game && sportsGameIsLive(src.game)) {
    text.innerHTML = sportsLiveTeamsScoreHtml(src.team, src.game);
  } else if (src?.mode === 'next' && src.team && src.game) {
    const g = src.game;
    const home = sportsChipTeamShort(src.team);
    const opp = sportsChipOpponentLabel(g);
    text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
      + sportsVsHtml(g)
      + ` <span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
  } else if (src?.team && src.game && src.mode === 'result') {
    const g = src.game;
    const home = sportsChipTeamShort(src.team);
    const opp = sportsChipOpponentLabel(g);
    const placeKind = sportsIsPlaceResult(g, src.team.sport);
    if (placeKind) {
      const placeTxt = sportsPlaceScoreText(g);
      text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(placeTxt)}</span>`;
    } else {
      const scoreTxt = sportsLiveScoreText(g);
      text.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(scoreTxt)}</span> `
        + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    }
  } else {
    markNoTranslate(text);
    text.textContent = RADAR_BRAND_SHORT;
  }
  line.append(text);
  head.append(line);
  layer.append(head);

  const sub = slide.ctaSub || '';
  if (sub) {
    const el = document.createElement('span');
    el.className = 'sports-chip__cta-sub';
    const subText = document.createElement('span');
    subText.className = 'sports-chip__cta-sub-text';
    subText.dataset.origFr = sub;
    subText.textContent = window.RadarTranslate?.displayUiText?.(sub) || sub;
    if (slide?.ctaIdle || sub === RADAR_BRAND_LONG) markNoTranslate(subText);
    el.append(subText);
    layer.append(el);
  }
  const chip = layer.closest?.('.sports-chip--cta');
  if (chip) syncSportsCtaRail(chip, slide);
  return layer;
}

/** Marqueur PROCHAIN sur le rail (390/430 : au-dessus de SPORTS).
 *  Hier / Aujourd’hui vivent dans la pastille, pas ici. */
function syncSportsCtaRail(chip, slide) {
  const railEb = chip?.querySelector('.sports-chip__cta-eyebrow--rail');
  if (!railEb) return;
  const text = String(slide?.ctaEyebrow || '').trim();
  railEb.textContent = text;
  railEb.hidden = !text;
}

/**
 * La carte CTA a-t-elle le droit de tourner ? — focus-group
 * `le-radar-cta-sports-rhythm` D, garde-fou `rotation-pointeur-fin`.
 *
 * WCAG 2.2.2 réclame un mécanisme de pause pour tout contenu qui se met à jour
 * seul au-delà de 5 s. Souris : survol/focus. Téléphone : doigt posé sur la
 * carte. Sans pause tactile l’accroche restait figée, et le marquee donnait
 * l’impression que l’info allait changer après le défilement.
 */
function sportsCtaMayRotate() {
  if (sportsReducedMotion) return false;
  return sportsCtaLabelPool().length > 1;
}

/** Texte qui défile dans une couche (ou la couche elle-même en repli). */
function sportsCtaScrollTarget(layer) {
  return layer?.querySelector('.sports-chip__cta-text') || layer;
}

/** Signature d’une accroche — évite de rouler pour un contenu identique. */
function sportsCtaSignature(slide) {
  return [slide?.ctaEyebrow || '', slide?.label || '', slide?.ctaSub || ''].join('\u0001');
}

/**
 * Registre visuel de la carte CTA — focus-group `le-radar-sports-first-glance`
 * (garde-fou `registre-alerte-reserve`) et `le-radar-cta-sports-badge`.
 *
 * Au repos : lavis du sport du match + contour pourpre (parité chip-look).
 * Rouge, pastille « En direct » et point live **uniquement** pendant un match.
 * Le point était créé sans condition et pulsait toute l’année, y compris pour
 * un match à quinze jours : une promesse fausse.
 */
function applySportsCtaState(chip, slide) {
  if (!chip) return;
  const state = slide?.ctaState || sportsCtaState(slide);
  chip.dataset.ctaState = state;
  const lamp = sportsCtaLamp(slide, state);
  chip.dataset.ctaLamp = lamp;
  chip.style.setProperty('--sports-tone', sportsCtaTone({ ...slide, ctaState: state }));

  const tag = chip.querySelector('.sports-chip__cta-tag');
  if (!tag) return;
  tag.hidden = false;
  const wanted = sportsCtaTagLabel(slide, state);
  tag.dataset.ctaLamp = lamp;
  if (state === 'idle') {
    tag.classList.add('sports-chip__cta-tag--brand');
    markNoTranslate(tag);
    tag.dataset.ctaTag = RADAR_BRAND_SHORT;
    tag.replaceChildren(radarBrandLogoEl());
  } else {
    tag.classList.remove('sports-chip__cta-tag--brand');
    markNoTranslate(tag);
    const lang = window.RadarTranslate?.getMode?.() || 'original';
    delete tag.dataset.ctaScore;
    delete tag.dataset.ctaMeridiemLine;
    const dateLine = sportsCtaTagDateLine(slide, wanted);
    const prevDate = tag.dataset.ctaDateLine || '';
    if (dateLine) tag.dataset.ctaDateLine = dateLine;
    else delete tag.dataset.ctaDateLine;
    if (tag.dataset.ctaTag !== wanted || tag.dataset.ctaLang !== lang || prevDate !== dateLine) {
      tag.dataset.ctaTag = wanted;
      tag.dataset.ctaLang = lang;
      fillSportsCtaTagCopy(tag, wanted, { dateLine });
    }
  }
  syncSportsCtaRail(chip, slide);
  refreshSportsChromeLanguage();
}

/**
 * Pause de la rotation au survol et au focus — garde-fou `pause-survol-focus`
 * (WCAG 2.2.2). Sur tactile, un appui maintenu suspend la rotation.
 */
function bindSportsCtaPause(chip) {
  if (!chip || chip._ctaPauseBound) return;
  chip._ctaPauseBound = true;
  const hold = () => { sportsCtaPaused = true; };
  const release = () => {
    sportsCtaPaused = false;
    // Relire le ruban, puis une nouvelle vague complète (scores + CTA).
    scheduleSportsWave({ fromSlot: 0, firstWait: true });
  };
  chip.addEventListener('pointerenter', hold, { passive: true });
  chip.addEventListener('pointerleave', release, { passive: true });
  chip.addEventListener('pointerdown', hold, { passive: true });
  chip.addEventListener('pointerup', release, { passive: true });
  chip.addEventListener('pointercancel', release, { passive: true });
  chip.addEventListener('focusin', hold);
  chip.addEventListener('focusout', release);
}

/**
 * Mesure un couple viewport/inner : overflow en px (0 si tout tient).
 * Toujours lever max-width le temps de la mesure (même si is-overflowing est
 * déjà posé) : certains moteurs gardent un scrollWidth plafonné tant que la
 * contrainte CSS est active, ce qui laissait l’ellipsis figée sur le titre.
 * On ne touche pas aux classes d’animation (évite de relancer le marquee).
 */
function sportsMeasureOverflow(viewport, inner, _hadOverflow) {
  if (!viewport || !inner) return 0;
  const prevMax = inner.style.maxWidth;
  const prevOverflow = inner.style.overflow;
  const prevTextOverflow = inner.style.textOverflow;
  inner.style.maxWidth = 'none';
  inner.style.overflow = 'visible';
  inner.style.textOverflow = 'clip';
  // scrollWidth du texte à largeur naturelle vs fenêtre de clip.
  const overflow = Math.max(0, inner.scrollWidth - viewport.clientWidth);
  inner.style.maxWidth = prevMax;
  inner.style.overflow = prevOverflow;
  inner.style.textOverflow = prevTextOverflow;
  return overflow;
}

/**
 * Applique / retire un marquee sur une puce (classe + --sports-scroll*).
 * Ne relance PAS l’animation si le décalage est inchangé.
 */
function sportsApplyScrollState(chip, {
  flag,
  prop,
  overflow,
} = {}) {
  if (!chip || !flag || !prop) return;
  // Scores : pas de marquee en wide étroit. CTA : toujours, le nom complet doit défiler.
  if (
    !chip.classList.contains('sports-chip--cta')
    && isWideNoMarqueeMode()
    && !isWideDesktopComfort()
  ) {
    chip.classList.remove(flag);
    chip.style.removeProperty(prop);
    return;
  }
  const had = chip.classList.contains(flag);
  const needs = overflow > 2;
  if (!needs) {
    if (had) {
      chip.classList.remove(flag);
      chip.style.removeProperty(prop);
    }
    return;
  }
  const next = `${overflow}px`;
  const prev = (chip.style.getPropertyValue(prop) || '').trim();
  if (had && prev === next) return;
  chip.style.setProperty(prop, next);
  if (!had) chip.classList.add(flag);
}

/**
 * Défilement L→R du texte trop long (scores + accroche CTA titre + sous-ligne).
 * @param {Element|null} [chipOrRoot] une puce, le bandeau, ou null (= tout le bandeau).
 * Ne relance PAS l’animation CSS des puces déjà stables (évite le « tous
 * se rafraîchissent » quand une seule change).
 */
function refreshSportsChipScroll(chipOrRoot = null) {
  if (!MASTHEAD_SPORTS_STRIP && !chipOrRoot) return;
  const root = chipOrRoot || MASTHEAD_SPORTS_STRIP;
  if (!root) return;
  // Wide étroit : scores sans marquee. CTA mesurée plus bas dans la boucle.
  if (isWideNoMarqueeMode() && !isWideDesktopComfort()) {
    clearWideSportsMarqueeClasses();
  }
  const chips = root.classList?.contains('sports-chip')
    ? [root]
    : Array.from(root.querySelectorAll?.('.sports-chip') || []);
  chips.forEach((chip) => {
    const isCta = chip.classList.contains('sports-chip--cta');
    // CTA : le roulement déplace la couche (translateY), le marquee déplace le
    // texte (translateX). Deux nœuds distincts, sinon les transforms se
    // marchent dessus — c’est ce qui rendait l’ancien fondu saccadé.
    const layer = isCta ? sportsCtaActiveLabel(chip) : null;
    // Pendant un roulement : ne pas mesurer une couche en mouvement.
    if (
      isCta
      && layer
      && (
        layer.classList.contains('is-rolling-in')
        || chip.querySelector('.sports-chip__cta-label.is-rolling-out')
      )
    ) {
      return;
    }

    if (!isCta) {
      if (isWideDesktopComfort()) {
        const titleView = chip.querySelector('.sports-chip__line');
        const titleInner = chip.querySelector('.sports-chip__line-inner');
        const subView = chip.querySelector('.sports-chip__sub');
        const subInner = chip.querySelector('.sports-chip__sub-text');
        const titleOverflow = (titleView && titleInner)
          ? sportsMeasureOverflow(titleView, titleInner, chip.classList.contains('is-overflowing'))
          : 0;
        const subOverflow = (subView && subInner)
          ? sportsMeasureOverflow(subView, subInner, chip.classList.contains('is-sub-overflowing'))
          : 0;
        sportsApplyScrollState(chip, {
          flag: 'is-overflowing',
          prop: '--sports-scroll',
          overflow: titleOverflow,
        });
        sportsApplyScrollState(chip, {
          flag: 'is-sub-overflowing',
          prop: '--sports-scroll-sub',
          overflow: subOverflow,
        });
        return;
      }
      // Prod : puces scores = jamais marquee. Le fit retire une carte.
      chip.classList.remove('is-overflowing', 'is-sub-overflowing');
      chip.style.removeProperty('--sports-scroll');
      chip.style.removeProperty('--sports-scroll-sub');
      return;
    }

    // ── CTA : titre + sous-ligne mesurés séparément ──
    const titleView = layer?.querySelector('.sports-chip__cta-line');
    const titleInner = sportsCtaScrollTarget(layer);
    const subView = layer?.querySelector('.sports-chip__cta-sub');
    const subInner = layer?.querySelector('.sports-chip__cta-sub-text');

    if (!titleView || !titleInner) {
      chip.classList.remove('is-overflowing', 'is-sub-overflowing');
      chip.style.removeProperty('--sports-scroll');
      chip.style.removeProperty('--sports-scroll-sub');
      return;
    }

    const hadTitle = chip.classList.contains('is-overflowing');
    const hadSub = chip.classList.contains('is-sub-overflowing');
    const titleOverflow = sportsMeasureOverflow(titleView, titleInner, hadTitle);
    // Sous-ligne : viewport = .cta-sub, contenu = .cta-sub-text
    const subOverflow = (subView && subInner)
      ? sportsMeasureOverflow(subView, subInner, hadSub)
      : 0;

    sportsApplyScrollState(chip, {
      flag: 'is-overflowing',
      prop: '--sports-scroll',
      overflow: titleOverflow,
    });
    sportsApplyScrollState(chip, {
      flag: 'is-sub-overflowing',
      prop: '--sports-scroll-sub',
      overflow: subOverflow,
    });
    if (titleOverflow > 2 || subOverflow > 2) {
      const label = [titleInner?.textContent || '', subInner?.textContent || '']
        .filter(Boolean)
        .join(' · ');
      const trips = marqueeAlternateCount(
        SPORTS_SCROLL_ONE_WAY_MS,
        sportsLabelReadingMs(label),
      );
      chip.style.setProperty('--sports-scroll-trips', String(trips));
    } else {
      chip.style.removeProperty('--sports-scroll-trips');
    }
  });
}

/**
 * Libellé tooltip d’une formation — focus group stats :
 * une identité claire, pas le dump « court · surnom · établissement ».
 * Préfère surnom (Cougars) + court entre parenthèses si utile.
 */
function sportsTooltipTeamLabel({ name, nickname, fullName, code } = {}) {
  const short = String(name || code || '').trim();
  const nick = String(nickname || '').trim();
  if (nick && short && nick.toLowerCase() !== short.toLowerCase()) {
    return `${nick} (${short})`;
  }
  if (short) return short;
  if (nick) return nick;
  const full = String(fullName || '').trim();
  return full || 'Équipe';
}

function sportsSportLabelFr(sport) {
  const s = String(sport || '').toLowerCase();
  const map = {
    hockey: 'Hockey',
    football: 'Football',
    soccer: 'Soccer',
    'soccer-interieur': 'Soccer intérieur',
    futsal: 'Futsal',
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    rugby: 'Rugby',
    'flag-football': 'Flag-football',
    baseball: 'Baseball',
    badminton: 'Badminton',
    natation: 'Natation',
    athletisme: 'Athlétisme',
    'cross-country': 'Cross-country',
    golf: 'Golf',
    cheerleading: 'Cheerleading',
    ultimate: 'Ultimate',
    sailing: 'Voile',
  };
  return map[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
}

/**
 * Tooltip / title d’une puce score — scannable en un coup d’œil :
 * Statut · Sport · Équipe vs Adversaire · [score] · Quand
 * (sans « voir le tableau… » redondant — le clic est déjà le CTA).
 */
function sportsChipTitle(slide) {
  if (!slide?.team || !slide.game) return 'Sports — scores étudiants';
  const team = slide.team;
  const g = slide.game;
  const sport = sportsSportLabelFr(g.sport || team.sport);
  // Mêmes libellés que les puces (Bleu/Jaune, fullName si mono-token).
  const home = sportsChipTeamShort(team);
  const opp = sportsPlainOpponentName(g);
  const when = formatSportsWhen(g.date, g.time);
  const host = String(team.fullName || '').trim();

  if (slide.mode === 'result') {
    const issue = g.result === 'W' ? 'Victoire' : g.result === 'L' ? 'Défaite' : 'Match nul';
    const placeKind = sportsIsPlaceResult(g, team.sport);
    const score = placeKind
      ? `place ${g.scoreFor}/${g.scoreAgainst}`
      : `${g.scoreFor}–${g.scoreAgainst}`;
    const line = placeKind ? `${home} ${score}` : `${home} ${score} ${opp}`;
    return [issue, sport, line, when, host].filter(Boolean).join(' · ');
  }

  if (sportsGameIsLive(g)) {
    return [
      SPORTS_CTA_TAG_LIVE,
      sport,
      `${home} ${sportsLiveScoreText(g)} ${opp}`,
      sportsKickoffClock(g),
      sportsUpdatedShort(),
      host,
    ].filter(Boolean).join(' · ');
  }
  const status = sportsCtaGameIsToday(slide) ? SPORTS_MATCH_TAG_TODAY
    : sportsCtaGameIsTomorrow(slide) ? 'Demain'
    : SPORTS_CTA_TAG_NEXT;
  const verb = sportsMatchVerb(g);
  return [status, sport, `${home} ${verb} ${opp}`, when, host].filter(Boolean).join(' · ');
}

function paintSportsChip(slide, animate = false) {
  if (!slide) return document.createElement('span');

  /* ── Info hors saison (gauche) : accroche calendrier / tableau, ton ardoise ── */
  if (slide.mode === 'info') {
    const a = document.createElement('a');
    a.className = 'sports-chip sports-chip--info';
    a.href = new URL('sports/', window.location.href).pathname;
    markSportsBoardLink(a);
    if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
    a.dataset.sportsKey = slide.key || 'info';
    a.dataset.sportsMode = 'info';
    a.dataset.sportsSport = 'board';
    a.style.setProperty('--sports-tone', slide.tone || '#5a6570');
    a.title = slide.label || 'Sports';
    a.setAttribute('aria-label', slide.label || 'Voir le tableau des scores (nouvel onglet)');
    const line = document.createElement('span');
    line.className = 'sports-chip__line';
    const inner = document.createElement('span');
    inner.className = 'sports-chip__line-inner sports-chip__info-label';
    inner.textContent = slide.label || 'Calendrier à venir';
    line.append(inner);
    a.append(line);
    if (animate && !sportsReducedMotion) {
      window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
    }
    return a;
  }

  /* ── Creux marque. Un match CTA est peint comme puce sport (une famille). ── */
  if (slide.mode === 'cta') {
    if (!slide.ctaIdle && slide.ctaFrom?.team && slide.ctaFrom?.game) {
      return paintSportsChip(slide.ctaFrom, animate);
    }
    const a = document.createElement('a');
    a.className = 'sports-chip sports-chip--match sports-chip--idle';
    if (slide.ctaIdle) {
      a.href = radarHomeHref();
    } else {
      a.href = sportsBoardHref(slide);
      markSportsBoardLink(a);
    }
    if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
    a.dataset.sportsKey = slide.key || SPORTS_CTA_KEY;
    a.dataset.sportsMode = 'cta';
    a.dataset.sportsSport = 'board';
    if (slide.labelIndex != null) a.dataset.ctaLabelIndex = String(slide.labelIndex);
    const { title, aria } = sportsCtaA11y(slide);
    a.title = title;
    a.setAttribute('aria-label', aria);

    if (slide.ctaFrom?.game && sportsGameIsLive(slide.ctaFrom.game)) {
      a.dataset.sportsLive = '1';
    }

    // Kicker 1 ligne (F) + glyphe dans la couche.
    const tag = document.createElement('span');
    tag.className = 'sports-chip__cta-tag';
    tag.setAttribute('aria-hidden', 'true');
    const rail = document.createElement('span');
    rail.className = 'sports-chip__cta-rail';
    const railEyebrow = document.createElement('span');
    railEyebrow.className = 'sports-chip__cta-eyebrow sports-chip__cta-eyebrow--rail';
    railEyebrow.setAttribute('aria-hidden', 'true');
    rail.append(railEyebrow, tag);

    const line = document.createElement('span');
    line.className = 'sports-chip__line';
    const stack = document.createElement('span');
    stack.className = 'sports-chip__cta-stack';
    const layer = document.createElement('span');
    layer.className = 'sports-chip__cta-label is-front';
    fillSportsCtaLayer(layer, slide);
    layer.dataset.ctaSig = sportsCtaSignature(slide);
    stack.append(layer);
    line.append(stack);

    a.append(rail, line);
    applySportsCtaState(a, slide);
    bindSportsCtaPause(a);
    if (animate && !sportsReducedMotion) {
      window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
    }
    return a;
  }

  const team = slide.team;
  const g = slide.game || {};
  const sport = g.sport || team.sport || '';
  const tone = slide.tone || sportsSlideTone(slide);
  // Clic principal → page SEO locale (nouvel onglet, radio intacte).
  const href = sportsBoardHref(slide);
  const a = document.createElement('a');
  a.className = 'sports-chip sports-chip--match';
  a.href = href;
  markSportsBoardLink(a);
  if (animate && !sportsReducedMotion) a.classList.add('is-arriving');
  a.dataset.sportsKey = slide.key || '';
  a.dataset.sportsMode = slide.mode || '';
  a.dataset.sportsSport = sport || '';
  a.style.setProperty('--sports-tone', tone);

  const glyph = document.createElement('span');
  glyph.className = 'sports-chip__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = sportsGlyph(sport);

  /*
   * Deux lignes comme la CTA, largeur chip :
   *   haut  — noms (acronymes univ. à gauche) + vs / score
   *   bas   — date · compétition (même méta que sous-ligne CTA)
   * Marquee L→R si overflow — **jamais** de troncature « … ».
   */
  const body = document.createElement('span');
  body.className = 'sports-chip__body';
  const line = document.createElement('span');
  line.className = 'sports-chip__line';
  const inner = document.createElement('span');
  inner.className = 'sports-chip__line-inner';
  const sub = document.createElement('span');
  sub.className = 'sports-chip__sub';
  const subText = document.createElement('span');
  subText.className = 'sports-chip__sub-text';

  const home = sportsChipTeamShort(team);
  // Puce étroite : acronymes univ. (ULaval, UdeM…) — CTA garde les formes longues.
  const opp = sportsChipOpponentLabel(g);
  const subLine = sportsMatchSubLine(slide);
  const whenInfo = sportsMatchWhenTag(slide);
  const whenTag = whenInfo ? (() => {
    const el = document.createElement('span');
    el.className = 'sports-chip__cta-tag';
    el.setAttribute('aria-hidden', 'true');
    el.dataset.whenTag = whenInfo.word;
    el.dataset.ctaTag = whenInfo.word;
    if (whenInfo.lamp) {
      el.dataset.whenLamp = whenInfo.lamp;
      el.dataset.ctaLamp = whenInfo.lamp;
    }
    if (whenInfo.dateLine) el.dataset.ctaDateLine = whenInfo.dateLine;
    else delete el.dataset.ctaDateLine;
    fillSportsCtaTagCopy(el, whenInfo.word, { dateLine: whenInfo.dateLine || '' });
    return el;
  })() : null;
  if (whenInfo?.lamp) a.dataset.ctaLamp = whenInfo.lamp;

  if (slide.mode === 'result') {
    a.dataset.ctaState = 'result';
    const badge = sportsResultBadgeEl(g, sport);
    if (whenTag && badge) a.append(whenTag, glyph, badge);
    else if (whenTag) a.append(whenTag, glyph);
    else if (badge) a.append(glyph, badge);
    else a.append(glyph);
    const placeKind = sportsIsPlaceResult(g, sport);
    const prior = g.priorSeason || team.lastGamePriorSeason;
    if (placeKind) {
      // Régate / place : ne pas coller « McGill Sailing 7/12 ICSA Regional… »
      // en une ligne. Haut = équipe + place ; bas = date · compétition.
      const placeTxt = sportsPlaceScoreText(g);
      inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(placeTxt)}</span>`;
    } else {
      const scoreTxt = sportsLiveScoreText(g);
      inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
        + `<span class="sports-chip__score">${escapeHtml(scoreTxt)}</span> `
        + `<span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    }
    setSportsLocalizableText(subText, subLine);
    if (prior) a.classList.add('sports-chip--prior-season');
    a.title = sportsChipTitle(slide) + (prior ? ' · Saison précédente' : '');
    a.setAttribute('aria-label', `${a.title}. Ouvrir le tableau des scores (nouvel onglet).`);
  } else if (slide.mode === 'next' && sportsGameIsLive(g)) {
    a.dataset.sportsLive = '1';
    a.dataset.ctaState = 'live';
    if (whenTag) a.append(whenTag, glyph);
    else a.append(glyph);
    inner.innerHTML = sportsLiveTeamsScoreHtml(team, g);
    setSportsLocalizableText(subText, sportsLiveSubParts(slide).join(' · '));
    a.title = sportsChipTitle(slide);
    a.setAttribute('aria-label', `${a.title}. Ouvrir le tableau des scores (nouvel onglet).`);
  } else {
    a.dataset.ctaState = 'next';
    if (whenTag) a.append(whenTag, glyph);
    else a.append(glyph);
    // « reçoit » / « chez » — même ton presse que la CTA ; verbe en .sports-chip__vs (gris).
    inner.innerHTML = `<span class="sports-chip__name">${escapeHtml(home)}</span> `
      + sportsVsHtml(g)
      + ` <span class="sports-chip__name sports-chip__opp">${escapeHtml(opp)}</span>`;
    setSportsLocalizableText(subText, subLine);
    a.title = sportsChipTitle(slide);
    a.setAttribute('aria-label', `${a.title}. Ouvrir le tableau des scores (nouvel onglet).`);
  }
  line.append(inner);
  sub.append(subText);
  body.append(line, sub);
  a.append(body);
  if (animate && !sportsReducedMotion) {
    window.setTimeout(() => a.classList.remove('is-arriving'), SPORTS_ARRIVE_MS);
  }
  return a;
}

/**
 * Prochaine carte : même chaleur que le premier cran
 * (live / à-venir / aujourd’hui / dernière heure avant le reliquat).
 * Jamais de puce grise « Hors saison / Calendrier… » ici.
 */
function nextSportsSlide(usedKeys, opts = {}) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys || []);
  sportsVisible.forEach((s) => {
    if (s?.mode !== 'cta') return;
    for (const k of sportsSlideOccupyKeys(s)) used.add(k);
  });
  const pool = sportsOpenOrderSlides();
  const avoidMatchKeys = opts.avoidMatchKeys instanceof Set
    ? opts.avoidMatchKeys
    : new Set(opts.avoidMatchKeys || []);
  const isAvailable = (slide) => {
    if (sportsSlideIsUsed(slide, used)) return false;
    const matchKey = sportsResultMatchKey(slide);
    return !(matchKey && avoidMatchKeys.has(matchKey));
  };
  if (!pool.length) return null;
  for (let i = 0; i < pool.length; i += 1) {
    const s = pool[(sportsLeftCursor + i) % pool.length];
    if (!isAvailable(s)) continue;
    sportsLeftCursor = (sportsLeftCursor + i + 1) % pool.length;
    return s;
  }
  return null;
}

/**
 * Wide E : cluster CTA au centre (1–3), scores à gauche et à droite.
 * Prod : une CTA à droite (historique).
 * @param {object[]} contentSlides
 * @param {object|object[]} ctaOrList
 */
function arrangeSportsVisible(contentSlides, ctaOrList) {
  const ctas = (Array.isArray(ctaOrList) ? ctaOrList : [ctaOrList]).filter(Boolean);
  if (!ctas.length) return contentSlides.slice();
  if (!contentSlides.length) return ctas.slice();
  // B : plus chaud à gauche (DOM = ordre visuel). Plus de pin à droite / au centre.
  return [...ctas, ...contentSlides];
}

/**
 * Filet : si deux faces du même match à score se suivent (ne devrait plus
 * arriver après dédup), on n’en garde qu’une hors wide.
 */
function sportsSeparateAdjacentResults(visible) {
  if (!Array.isArray(visible) || visible.length < 2) return visible || [];
  const kept = [];
  const deferred = [];
  for (const slide of visible) {
    const prev = kept[kept.length - 1];
    const a = sportsResultMatchKey(prev);
    const b = sportsResultMatchKey(slide);
    if (a && b && a === b) deferred.push(slide);
    else kept.push(slide);
  }
  // Hors wide : CTA à droite. On ne recale pas une face après elle.
  const wide = typeof isWideNoMarqueeMode === 'function' && isWideNoMarqueeMode();
  if (!wide) return kept;
  for (const slide of deferred) {
    const key = sportsResultMatchKey(slide);
    let inserted = false;
    for (let i = 0; i <= kept.length; i += 1) {
      const left = sportsResultMatchKey(kept[i - 1]);
      const right = sportsResultMatchKey(kept[i]);
      if (key && left === key) continue;
      if (key && right === key) continue;
      kept.splice(i, 0, slide);
      inserted = true;
      break;
    }
    if (!inserted) continue;
  }
  return kept;
}

function sportsCtaSlotIndex(visible = sportsVisible) {
  const i = visible.findIndex((s) => s?.mode === 'cta');
  if (i >= 0) return i;
  return 0;
}

/** Indices de toutes les CTAs visibles (wide multi). */
function sportsCtaSlotIndices(visible = sportsVisible) {
  const out = [];
  visible.forEach((s, i) => {
    if (s?.mode === 'cta') out.push(i);
  });
  return out;
}

/**
 * Première peinture : préfixe de sportsOpenOrderSlides.
 * Une seule famille visuelle (puce sport). Pas de chrome CTA.
 * Overflow = coupe la queue, pas de re-tri. Creux = marque.
 */
function pickInitialSportsVisible(count) {
  sportsCtaLabelIndex = 0;
  sportsLeftCursor = 0;
  const pool = sportsOpenOrderSlides();
  const n = Math.max(1, count | 0);
  if (!pool.length) return [sportsCtaSlide(0)];
  const picked = [];
  const usedKeys = new Set();
  for (const slide of pool) {
    if (picked.length >= n) break;
    if (!slide || sportsSlideIsUsed(slide, usedKeys)) continue;
    picked.push(slide);
    for (const k of sportsSlideOccupyKeys(slide)) usedKeys.add(k);
  }
  if (!picked.length) return [sportsCtaSlide(0)];
  return sportsSeparateAdjacentResults(picked);
}

/** Remplit / recalcule les slots visibles (resize ou 1er paint). */
function renderSportsStrip() {
  if (!MASTHEAD_SPORTS_STRIP || !sportsSlides.length) {
    if (MASTHEAD_SPORTS_STRIP) {
      MASTHEAD_SPORTS_STRIP.hidden = true;
      MASTHEAD_SPORTS_STRIP.classList.add('is-empty');
      MASTHEAD_SPORTS_STRIP.replaceChildren();
    }
    sportsVisible = [];
    return;
  }
  const board = sportsBoardCount();
  const count = Math.min(board, Math.max(1, sportsSlides.length + 3));
  sportsVisible = pickInitialSportsVisible(count);
  if (MASTHEAD_SPORTS_STRIP) {
    MASTHEAD_SPORTS_STRIP.dataset.ctaLayout = 'start';
    MASTHEAD_SPORTS_STRIP.dataset.ctaCount = '0';
  }

  // Rotation L→R : toujours repartir du slot le plus à gauche après un re-paint.
  sportsNextSlot = 0;
  const frag = document.createDocumentFragment();
  sportsVisible.forEach((slide) => frag.append(paintSportsChip(slide, false)));
  MASTHEAD_SPORTS_STRIP.replaceChildren(frag);
  MASTHEAD_SPORTS_STRIP.hidden = false;
  MASTHEAD_SPORTS_STRIP.classList.remove('is-empty');
  MASTHEAD_SPORTS_STRIP.dataset.count = String(sportsVisible.length);
  MASTHEAD_SPORTS_STRIP.dataset.ctaPinned = sportsVisible.length >= 2 ? '1' : '0';
  // Fit anti-marquee (A) + marquee CTA seulement, après layout stable.
  window.requestAnimationFrame(() => {
    refreshSportsChipScroll();
    window.requestAnimationFrame(() => {
      fitSportsStripAfterPaint();
      markUiReady(MASTHEAD_SPORTS_STRIP);
      // Polices webfont : re-fit une fois prêtes (mesure titre/sous-ligne juste).
      const fonts = document.fonts;
      if (fonts?.ready && typeof fonts.ready.then === 'function') {
        fonts.ready.then(() => {
          if (!MASTHEAD_SPORTS_STRIP?.isConnected) return;
          fitSportsStripAfterPaint();
          refreshSportsChipScroll();
        }).catch(() => { /* ignore */ });
      }
    });
  });
}

/**
 * Temps de lecture estimé d’un libellé de puce (scan compact FR).
 * Ex. « CLG vs OUT · 19 août · 23 h 40 » ≈ 6,5–8 s ; accroche plus longue → plus.
 */
function sportsLabelReadingMs(text) {
  const len = String(text || '').replace(/\s+/g, ' ').trim().length;
  if (!len) return SPORTS_READ_MIN_MS;
  return Math.min(
    SPORTS_READ_MAX_MS,
    Math.max(SPORTS_READ_MIN_MS, 3000 + len * SPORTS_READ_PER_CHAR_MS),
  );
}

/**
 * True si la puce a besoin d’un marquee (dwell allongé).
 * Focus-group A : puces **scores** → toujours false (pas de marquee).
 * CTA : titre ou sous-ligne overflow (marquee encore toléré).
 */
function sportsChipNeedsMarquee(chip) {
  if (!chip || sportsReducedMotion) return false;
  // Scores : anti-marquee — overflow géré par −1 puce, pas par scroll.
  if (!chip.classList.contains('sports-chip--cta')) return false;
  if (
    chip.classList.contains('is-overflowing')
    || chip.classList.contains('is-sub-overflowing')
  ) {
    return true;
  }
  const layer = sportsCtaActiveLabel(chip);
  if (!layer) return false;
  const titleView = layer.querySelector('.sports-chip__cta-line');
  const titleInner = sportsCtaScrollTarget(layer);
  if (titleView && titleInner && sportsMeasureOverflow(titleView, titleInner, false) > 2) {
    return true;
  }
  const subView = layer.querySelector('.sports-chip__cta-sub');
  const subInner = layer.querySelector('.sports-chip__cta-sub-text');
  if (subView && subInner && sportsMeasureOverflow(subView, subInner, false) > 2) {
    return true;
  }
  return false;
}

/**
 * Temps d’affichage d’un slot avant rotation — assez long pour *apprécier*
 * la carte et enregistrer l’info.
 * · Texte entier visible : dwell = lecture estimée (puces ~6,5–10 s ; CTA ~8 s).
 * · Texte qui défile : **toujours** 1 aller-retour marquee + pause repos
 *   (ne jamais changer la carte au milieu du scroll).
 */
function sportsSlotDwellMs(slot) {
  const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
  const isCta = !!chip?.classList?.contains('sports-chip--cta');
  const labelEl = isCta
    ? sportsCtaScrollTarget(sportsCtaActiveLabel(chip))
    : chip?.querySelector('.sports-chip__line-inner');
  const subEl = isCta
    ? sportsCtaActiveLabel(chip)?.querySelector('.sports-chip__cta-sub-text')
    : chip?.querySelector('.sports-chip__sub-text');
  const label = [labelEl?.textContent || '', subEl?.textContent || '']
    .filter(Boolean)
    .join(' · ');
  const readMs = sportsLabelReadingMs(label);
  if (sportsReducedMotion) return readMs;
  if (!chip) return SPORTS_READ_MIN_MS;
  // CTA : plancher propre (un cran plus posé que les scores, sans 24 s collants).
  const floor = isCta ? SPORTS_CTA_DWELL_MS : readMs;
  if (sportsChipNeedsMarquee(chip)) {
    const oneWay = chip.classList.contains('sports-chip--match')
      ? SPORTS_MATCH_SCROLL_ONE_WAY_MS
      : SPORTS_SCROLL_ONE_WAY_MS;
    const trips = parseFloat(chip.style.getPropertyValue('--sports-scroll-trips')) || marqueeAlternateCount(oneWay, floor);
    const n = trips >= 2 ? trips : MARQUEE_ROUND_TRIPS;
    return Math.max(
      floor,
      SPORTS_SCROLL_READ_DELAY_MS + oneWay * n + SPORTS_SCROLL_POST_PAUSE_MS,
    );
  }
  return floor;
}

/** Délai après rotateSportsSlot avant de re-mesurer / re-planifier le dwell. */
function sportsSlotSettleMs(slot, replacement) {
  if (sportsReducedMotion) return 80;
  // Scores, prochains et CTA : même sortie + entrée carte entière.
  return SPORTS_CHIP_LEAVE_MS + SPORTS_ARRIVE_MS + 100;
}

function clearSportsSlotTimers() {
  for (let i = 0; i < sportsSlotTimers.length; i += 1) {
    if (sportsSlotTimers[i]) clearTimeout(sportsSlotTimers[i]);
  }
  sportsSlotTimers = [];
  if (typeof clearSportsWave === 'function') clearSportsWave();
}

/**
 * Rotation d’un seul slot — indépendante des voisines.
 * ≥ 2 chips : CTA(s) fixe(s) (droite en prod, **centre en wide E**) ; scores autour.
 * Wide multi-CTA : chaque CTA cycle sans reprendre le match d’une voisine.
 * 1 chip : CTA seule.
 */
function rotateSportsSlot(slot) {
  if (!MASTHEAD_SPORTS_STRIP || sportsVisible.length < 1 || sportsSlides.length < 1) return;
  const n = sportsVisible.length;
  if (slot < 0 || slot >= n) return;
  const used = sportsVisibleOccupyKeys();
  const avoidMatchKeys = sportsAdjacentResultMatchKeys(slot);
  const usedSports = new Set(
    sportsVisible
      .filter((_, i) => i !== slot)
      .map((s) => String(s.team?.sport || '').toLowerCase())
      .filter(Boolean),
  );

  let replacement = nextSportsSlide(used, { usedSports, avoidMatchKeys });
  if (!replacement && sportsVisible[slot]?.mode === 'cta') {
    const poolLen = Math.max(1, sportsCtaCandidateSlides().length || 1);
    const curIdx = Number(sportsVisible[slot]?.labelIndex) || 0;
    replacement = sportsCtaSlide((curIdx + 1) % poolLen);
  }

  if (!replacement) return;
  // Même match déjà affiché : forcer le curseur suivant puis retenter une fois.
  if (
    replacement.mode !== 'cta'
    && replacement.mode !== 'info'
    && sportsSlideIsUsed(replacement, used)
  ) {
    const avoid = String(sportsVisible[slot]?.team?.sport || '').toLowerCase();
    sportsLeftCursor = (sportsLeftCursor + 1) % Math.max(1, sportsLeftLaneState().pool.length || 1);
    replacement = nextSportsSlide(used, { usedSports, avoidSport: avoid, avoidMatchKeys });
    if (!replacement || sportsSlideIsUsed(replacement, used)) return;
  }

  sportsVisible[slot] = replacement;

  // Après rotation CTA : si une puce score montre le même match, la remplacer.
  if (replacement.mode === 'cta' && replacement.ctaFrom) {
    const ctaKeys = sportsSlideOccupyKeys(replacement);
    for (let i = 0; i < n; i += 1) {
      if (i === slot) continue;
      const left = sportsVisible[i];
      if (!left || left.mode === 'cta') continue;
      if (!sportsSlideIsUsed(left, ctaKeys)) continue;
      const avoid = String(left.team?.sport || '').toLowerCase();
      const leftUsed = sportsVisibleOccupyKeys(i);
      const leftAvoidMatchKeys = sportsAdjacentResultMatchKeys(i);
      const alt = nextSportsSlide(leftUsed, {
        usedSports,
        avoidSport: avoid,
        avoidMatchKeys: leftAvoidMatchKeys,
      });
      if (alt && alt.mode !== 'cta' && !sportsSlideIsUsed(alt, leftUsed)) {
        sportsVisible[i] = alt;
        const chips = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip');
        const oldLeft = chips[i];
        if (oldLeft) {
          const painted = paintSportsChip(alt, !sportsReducedMotion);
          oldLeft.replaceWith(painted);
          window.requestAnimationFrame(() => refreshSportsChipScroll(painted));
        }
      }
    }
  }
  sportsNextSlot = (slot + 1) % n;
  const chips = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip');
  const oldChip = chips[slot];

  // Scores, prochains et CTA (y compris 390/430, CTA seule) :
  // sortie carte entière → entrée carte entière.
  const newChip = paintSportsChip(replacement, !sportsReducedMotion);
  if (!oldChip) {
    MASTHEAD_SPORTS_STRIP.append(newChip);
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
    return sportsSlotSettleMs(slot, replacement);
  }
  if (sportsReducedMotion) {
    oldChip.replaceWith(newChip);
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
    return 80;
  }
  // Annuler une sortie en cours sur ce slot.
  if (oldChip._leaveTimer) {
    clearTimeout(oldChip._leaveTimer);
    oldChip._leaveTimer = null;
  }
  oldChip.classList.remove('is-arriving');
  oldChip.classList.add('is-leaving');
  oldChip.style.pointerEvents = 'none';
  oldChip._leaveTimer = window.setTimeout(() => {
    oldChip._leaveTimer = null;
    if (!oldChip.isConnected) return;
    oldChip.replaceWith(newChip);
    // Uniquement cette puce — ne pas relancer le marquee des voisines.
    window.requestAnimationFrame(() => refreshSportsChipScroll(newChip));
  }, SPORTS_CHIP_LEAVE_MS);
  return sportsSlotSettleMs(slot, replacement);
}

/** Compat tests / appels historiques : un tick = slot 0 (ou le prochain round-robin). */
function rotateOneSportsCard() {
  if (!sportsVisible.length) return;
  const slot = sportsNextSlot % sportsVisible.length;
  rotateSportsSlot(slot);
}

/**
 * Programme un timeout pour un slot, puis se re-planifie après rotation.
 * Dwell = lecture, ou **aller-retour marquee complet + pause** si overflow.
 * Après rotation : attendre la fin du fondu, mesurer le marquee, puis dwell.
 */
function scheduleSportsSlot(slot, { initialStagger = 0 } = {}) {
  if (!MASTHEAD_SPORTS_STRIP) return;
  if (sportsSlotTimers[slot]) {
    clearTimeout(sportsSlotTimers[slot]);
    sportsSlotTimers[slot] = null;
  }
  const n = sportsVisible.length;
  if (slot < 0 || slot >= n) return;
  // La carte CTA ne tourne que là où on peut l’arrêter, et pas pendant qu’on la
  // survole ou qu’elle a le focus (garde-fous `rotation-pointeur-fin` et
  // `pause-survol-focus`). Ailleurs, l’accroche reste celle du chargement.
  if (sportsCtaHoldOnLive(sportsVisible[slot])) return;
  if (sportsCtaPaused && sportsVisible[slot]?.mode === 'cta') return;
  // Mesurer le marquee avant de fixer le dwell (classe peut être absente un instant).
  const chipNow = MASTHEAD_SPORTS_STRIP.querySelectorAll('.sports-chip')?.[slot];
  if (chipNow) refreshSportsChipScroll(chipNow);
  const delay = Math.max(0, sportsSlotDwellMs(slot) + initialStagger);
  sportsSlotTimers[slot] = window.setTimeout(() => {
    sportsSlotTimers[slot] = null;
    // Ne pas couper un marquee en cours : si overflow encore actif et temps
    // écoulé trop court, le dwell a déjà inclus l’aller-retour ; on rotate.
    const settleMs = rotateSportsSlot(slot) || 80;
    // Attendre sortie+entrée, puis mesurer overflow sur la *nouvelle* carte
    // avant de reprogrammer le prochain dwell (sinon lecture seule trop courte).
    sportsSlotTimers[slot] = window.setTimeout(() => {
      sportsSlotTimers[slot] = null;
      const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
      if (chip) refreshSportsChipScroll(chip);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scheduleSportsSlot(slot));
      });
    }, settleMs);
  }, delay);
}

function clearSportsWave() {
  if (sportsWaveTimer) {
    clearTimeout(sportsWaveTimer);
    sportsWaveTimer = 0;
  }
}

/** Pause lecture après une vague sports (scores + accroches CTA). */
function sportsBoardHoldMs() {
  const n = Math.max(1, sportsVisible.length);
  let hold = Math.min(12000, Math.max(SPORTS_BOARD_HOLD_MS, 1400 * n));
  sportsVisible.forEach((slide, i) => {
    if (slide?.mode === 'cta') hold = Math.max(hold, sportsSlotDwellMs(i));
  });
  // Hors wide : un libellé qui défile doit finir son cycle pendant le hold.
  if (!isWideNoMarqueeMode()) {
    sportsVisible.forEach((_, i) => {
      hold = Math.max(hold, sportsSlotDwellMs(i));
    });
    hold = Math.min(12000, hold);
  }
  return hold;
}

/**
 * Vague L→R de toutes les cartes (y compris le texte CTA), puis pause,
 * puis une nouvelle vague. Tous les écrans.
 * CTA sautée si tactile, motion réduite, survol ou focus (WCAG 2.2.2).
 */
function scheduleSportsWave({ fromSlot = 0, firstWait = true } = {}) {
  clearSportsSlotTimers();
  clearSportsWave();
  const n = sportsVisible.length;
  if (n < 1) return;
  const lane = sportsLeftLaneState();
  const canSpin = lane.pool.length > 1
    || lane.kind === 'offseason'
    || n > 1
    || sportsCtaMayRotate();
  if (!canSpin) return;
  sportsWaveSlot = ((fromSlot % n) + n) % n;

  const stepMs = sportsReducedMotion ? 80 : SPORTS_CASCADE_STEP_MS;
  const step = (index) => {
    const liveN = sportsVisible.length;
    if (liveN < 1) return;
    if (index >= liveN) {
      sportsWaveTimer = window.setTimeout(() => {
        sportsWaveTimer = 0;
        scheduleSportsWave({ fromSlot: 0, firstWait: false });
      }, sportsBoardHoldMs());
      return;
    }
    const slot = index;
    const slide = sportsVisible[slot];
    // Direct unique : la carte En direct ne tourne pas. Plusieurs lives : cycle.
    if (sportsCtaHoldOnLive(slide)) {
      sportsWaveTimer = window.setTimeout(() => step(index + 1), stepMs);
      return;
    }
    if (slide?.ctaIdle && (!sportsCtaMayRotate() || sportsCtaPaused)) {
      sportsWaveTimer = window.setTimeout(() => step(index + 1), stepMs);
      return;
    }
    rotateSportsSlot(slot);
    const chip = MASTHEAD_SPORTS_STRIP?.querySelectorAll('.sports-chip')?.[slot];
    if (chip) {
      window.requestAnimationFrame(() => refreshSportsChipScroll(chip));
    }
    sportsWaveTimer = window.setTimeout(() => step(index + 1), stepMs);
  };
  if (firstWait) {
    sportsWaveTimer = window.setTimeout(() => {
      sportsWaveTimer = 0;
      step(sportsWaveSlot);
    }, sportsBoardHoldMs());
    return;
  }
  step(sportsWaveSlot);
}

function scheduleSportsRotate() {
  // Vague unique L→R, tous les écrans (CTA sautée si elle ne peut pas tourner).
  scheduleSportsWave({ fromSlot: 0, firstWait: true });
}

/** Relit le snapshot léger du mât tant qu’un direct est à l’écran — le bot tourne aux 5 min. */
const SPORTS_LIVE_POLL_MS = 15000;

function sportsLivePollNeeded() {
  try {
    if (sportsCtaLiveSources().length) return true;
  } catch { /* slides pas encore prêts */ }
  return (sportsSlides || []).some((s) => {
    const g = s?.game || s?.ctaFrom?.game;
    return sportsGameIsLive(g);
  });
}

function sportsBoardLiveSig() {
  const parts = [];
  for (const s of sportsSlides || []) {
    const g = s.game || s.ctaFrom?.game;
    if (!g || !sportsGameIsLive(g)) continue;
    parts.push([s.key || s.ctaFrom?.key || '', sportsLiveScoreText(g), sportsLivePeriodLabel(g)].join('\t'));
  }
  parts.sort();
  return parts.join('|');
}

function sportsVisibleLiveKeys() {
  return (sportsVisible || [])
    .filter((s) => sportsGameIsLive(s?.game || s?.ctaFrom?.game))
    .map((s) => s.key || s.ctaFrom?.key || '')
    .join('|');
}

function patchVisibleLiveScorebugs() {
  const strip = MASTHEAD_SPORTS_STRIP;
  if (!strip) return;
  strip.querySelectorAll('.sports-chip').forEach((chip) => {
    let team;
    let game;
    if (chip.classList.contains('sports-chip--cta')) {
      const src = sportsCtaSlide(sportsCtaLabelIndex)?.ctaFrom;
      team = src?.team;
      game = src?.game;
    } else {
      const key = chip.dataset.sportsKey;
      const slide = (sportsVisible || []).find((s) => s?.key === key)
        || (sportsSlides || []).find((s) => s?.key === key);
      team = slide?.team;
      game = slide?.game;
    }
    if (!team || !game || !sportsGameIsLive(game)) return;
    const scoreEl = chip.querySelector('.sports-chip__score');
    const txt = sportsLiveScoreText(game);
    if (scoreEl && scoreEl.textContent !== txt) scoreEl.textContent = txt;
  });
}

function applySportsPayload(raw) {
  sportsData = (typeof RadarSportsFreshness !== 'undefined'
    && typeof RadarSportsFreshness.pruneSportsPayload === 'function')
    ? RadarSportsFreshness.pruneSportsPayload(raw)
    : raw;
  sportsSlides = buildSportsSlides(sportsData);
}

async function pollLiveSportsJson() {
  // Timer toujours allumé : un coup d’envoi peut entrer dans la fenêtre
  // après le boot (page ouverte à 18 h, KO 19 h).
  if (!sportsLivePollNeeded()) return;
  try {
    const res = await fetch(appAsset('sports-masthead.json'), { cache: 'no-store' });
    if (!res.ok) return;
    const raw = await res.json();
    const prevSig = sportsBoardLiveSig();
    const prevKeys = sportsVisibleLiveKeys();
    applySportsPayload(raw);
    const nextSig = sportsBoardLiveSig();
    const nextKeys = sportsVisibleLiveKeys();
    if (prevSig === nextSig) return;
    if (prevKeys && prevKeys === nextKeys) {
      patchVisibleLiveScorebugs();
      return;
    }
    sportsFitCount = null;
    sportsFitDepth = 0;
    renderSportsStrip();
    scheduleSportsRotate();
  } catch { /* ignore : le snapshot en mémoire reste */ }
}

function scheduleLiveSportsPoll() {
  if (initMastheadSports._liveTimer) return;
  initMastheadSports._liveTimer = window.setInterval(pollLiveSportsJson, SPORTS_LIVE_POLL_MS);
}

async function initMastheadSports() {
  if (!MASTHEAD_SPORTS_STRIP) return;
  try {
    const res = await fetch(appAsset('sports-masthead.json'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    /* Focus-group B : même fenêtre de sessions que les articles + filet hors saison. */
    applySportsPayload(raw);
    sportsVisible = [];
    sportsNextSlot = 0;
    sportsFitCount = null;
    sportsFitDepth = 0;
    renderSportsStrip();
    scheduleSportsRotate();
    scheduleLiveSportsPoll();
    if (!initMastheadSports._resizeBound) {
      initMastheadSports._resizeBound = true;
      initMastheadSports._lastWidth = MASTHEAD_SPORTS_STRIP.clientWidth || 0;
      const onSportsLayout = (source = 'resize') => {
        if (initMastheadSports._rz) clearTimeout(initMastheadSports._rz);
        // Léger debounce pour enchaîner 4→3→2→1 pendant le drag de fenêtre.
        // Comme la météo : on annule le plafond mesuré et on re-fit depuis zéro.
        // Ignore les RO purement internes (reflow des chips) : seule une vraie
        // variation de largeur du bandeau doit resetter le fit.
        initMastheadSports._rz = setTimeout(() => {
          const w = MASTHEAD_SPORTS_STRIP?.clientWidth || 0;
          if (
            source === 'ro'
            && Math.abs(w - (initMastheadSports._lastWidth || 0)) < 8
          ) {
            return;
          }
          initMastheadSports._lastWidth = w;
          const prev = sportsVisible.length;
          sportsFitCount = null;
          sportsFitDepth = 0;
          renderSportsStrip();
          scheduleSportsRotate();
          // Si le nombre de chips a changé, le scroll texte doit se recalculer.
          if (sportsVisible.length !== prev) {
            window.requestAnimationFrame(() => refreshSportsChipScroll());
          }
        }, 40);
      };
      window.addEventListener('resize', () => onSportsLayout('resize'), { passive: true });
      try {
        window.visualViewport?.addEventListener('resize', () => onSportsLayout('vv'), { passive: true });
      } catch { /* ignore */ }
      if (typeof ResizeObserver !== 'undefined' && MASTHEAD_SPORTS_STRIP) {
        initMastheadSports._ro = new ResizeObserver(() => onSportsLayout('ro'));
        initMastheadSports._ro.observe(MASTHEAD_SPORTS_STRIP);
      }
    }
  } catch (err) {
    console.warn('Le Radar: sports indisponibles', err);
    if (MASTHEAD_SPORTS_STRIP) {
      MASTHEAD_SPORTS_STRIP.hidden = true;
      MASTHEAD_SPORTS_STRIP.classList.add('is-empty');
      MASTHEAD_SPORTS_STRIP.replaceChildren();
    }
  }
}

window.addEventListener('radar:translate-mode', refreshSportsChromeLanguage);


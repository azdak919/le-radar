// LE-RADAR — syntoniseur, écoute externe, audio
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.

const EXTERNAL_LISTEN_LOAD_MS = 14000;
const EXTERNAL_POPUP_SIZE = 400;

let externalListenTimer = null;
let externalListenPopupWatch = null;

function setExternalListenStatus(mode, text) {
  if (!EXTERNAL_STATUS || !EXTERNAL_STATUS_TEXT) return;
  EXTERNAL_STATUS.classList.remove('is-ready', 'is-error');
  if (mode) EXTERNAL_STATUS.classList.add(mode);
  EXTERNAL_STATUS_TEXT.textContent = text;
}

function clearExternalListenTimers() {
  if (externalListenTimer) {
    clearTimeout(externalListenTimer);
    externalListenTimer = null;
  }
  if (externalListenPopupWatch) {
    clearInterval(externalListenPopupWatch);
    externalListenPopupWatch = null;
  }
}

function closeExternalListen() {
  clearExternalListenTimers();
  if (EXTERNAL_MODAL) {
    EXTERNAL_MODAL.classList.add('hidden');
    EXTERNAL_MODAL.hidden = true;
    EXTERNAL_MODAL.setAttribute('aria-hidden', 'true');
  }
  if (EXTERNAL_FRAME) EXTERNAL_FRAME.removeAttribute('src');
  if (EXTERNAL_FRAME_WRAP) EXTERNAL_FRAME_WRAP.classList.add('hidden');
  document.body.classList.remove('external-listen-open');
}

function bindExternalListen() {
  if (!EXTERNAL_MODAL) return;
  EXTERNAL_MODAL.querySelectorAll('[data-external-close]').forEach((el) => {
    el.addEventListener('click', closeExternalListen);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && EXTERNAL_MODAL && !EXTERNAL_MODAL.hidden) closeExternalListen();
  });
  EXTERNAL_REOPEN?.addEventListener('click', () => {
    if (currentStation && isExternalListen(currentStation)) {
      openExternalListenPopup(currentStation, { focus: true });
    }
  });
}

function openExternalListenPopup(radio, { focus = true } = {}) {
  const url = safeHttpUrl(getListenUrl(radio), { allowHttp: true });
  if (!url) return false;

  const name = `radar-listen-${radio.id}`;
  const features = [
    'popup=yes',
    `width=${EXTERNAL_POPUP_SIZE}`,
    `height=${EXTERNAL_POPUP_SIZE}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',');

  if (listenWindow && !listenWindow.closed && listenWindowId === radio.id) {
    if (focus) listenWindow.focus();
    setExternalListenStatus('is-ready', 'Fenêtre du lecteur ouverte — appuyez sur ▶ si besoin.');
    return true;
  }

  listenWindow = window.open(url, name, features);
  listenWindowId = radio.id;

  if (!listenWindow) {
    setExternalListenStatus('is-error', 'Fenêtre bloquée par le navigateur. Utilisez le bouton ci-dessous.');
    EXTERNAL_REOPEN?.classList.remove('hidden');
    return false;
  }

  try { listenWindow.opener = null; } catch { /* cross-origin */ }

  setExternalListenStatus('is-ready', 'Fenêtre du lecteur ouverte — appuyez sur ▶ si la lecture ne démarre pas.');
  EXTERNAL_REOPEN?.classList.remove('hidden');

  clearExternalListenTimers();
  externalListenPopupWatch = setInterval(() => {
    if (!listenWindow || listenWindow.closed) {
      clearInterval(externalListenPopupWatch);
      externalListenPopupWatch = null;
      setExternalListenStatus('is-error', 'Fenêtre fermée. Rouvrez le lecteur avec le bouton ci-dessous.');
    }
  }, 800);

  return true;
}

function openExternalListenIframe(radio) {
  const url = safeHttpUrl(getListenUrl(radio));
  if (!url || !EXTERNAL_FRAME || !EXTERNAL_FRAME_WRAP) return;

  EXTERNAL_FRAME_WRAP.classList.remove('hidden');
  EXTERNAL_REOPEN?.classList.add('hidden');
  setExternalListenStatus('', 'Chargement de la page du poste…');

  let settled = false;
  const onReady = () => {
    if (settled) return;
    settled = true;
    clearExternalListenTimers();
    setExternalListenStatus('is-ready', 'Page chargée — appuyez sur ▶ dans le cadre si la lecture ne démarre pas.');
  };
  const onFail = () => {
    if (settled) return;
    settled = true;
    clearExternalListenTimers();
    EXTERNAL_FRAME.removeAttribute('src');
    EXTERNAL_FRAME_WRAP.classList.add('hidden');
    setExternalListenStatus('is-error', 'La page n\'a pas pu se charger ici. Ouvrez le lecteur dans une fenêtre séparée.');
    openExternalListenPopup(radio, { focus: true });
  };

  EXTERNAL_FRAME.onload = onReady;
  EXTERNAL_FRAME.onerror = onFail;
  EXTERNAL_FRAME.src = url;

  externalListenTimer = setTimeout(() => {
    if (!settled) onFail();
  }, EXTERNAL_LISTEN_LOAD_MS);
}

function openListenWindow(radio) {
  const url = getListenUrl(radio);
  if (!url) {
    showToast('Aucun site d\'écoute disponible pour ce poste.');
    return false;
  }

  if (!EXTERNAL_MODAL) {
    return openExternalListenPopup(radio);
  }

  clearExternalListenTimers();

  const hint = radio.listenHint
    || 'Si la lecture ne démarre pas automatiquement, appuyez sur le bouton de lecture (▶) dans le cadre ci-dessus.';
  const inst = shortInstitution(radio.institution, radio.type);

  EXTERNAL_TITLE.textContent = radio.fullName || radio.name;
  EXTERNAL_SUB.textContent = `${radio.frequency || 'Web'} · ${inst}`;
  if (EXTERNAL_HINT) EXTERNAL_HINT.textContent = hint;
  if (EXTERNAL_TAB) EXTERNAL_TAB.href = safeHttpUrl(url, { allowHttp: true }) || '#';

  if (EXTERNAL_LOGO) {
    if (radio.logo) {
      EXTERNAL_LOGO.src = radio.logo;
      EXTERNAL_LOGO.alt = radio.name;
      EXTERNAL_LOGO.classList.remove('hidden');
    } else {
      EXTERNAL_LOGO.classList.add('hidden');
      EXTERNAL_LOGO.removeAttribute('src');
    }
  }

  EXTERNAL_MODAL.classList.remove('hidden');
  EXTERNAL_MODAL.hidden = false;
  EXTERNAL_MODAL.setAttribute('aria-hidden', 'false');
  document.body.classList.add('external-listen-open');

  if (isSecurePageUrl(url)) {
    openExternalListenIframe(radio);
  } else {
    EXTERNAL_FRAME_WRAP?.classList.add('hidden');
    if (EXTERNAL_FRAME) EXTERNAL_FRAME.removeAttribute('src');
    EXTERNAL_REOPEN?.classList.remove('hidden');
    setExternalListenStatus('', 'Ouverture du lecteur dans une fenêtre séparée…');
    const opened = openExternalListenPopup(radio, { focus: true });
    if (!opened) {
      setExternalListenStatus('is-error', 'Impossible d\'ouvrir la fenêtre. Utilisez « Ouvrir dans un onglet ».');
    }
  }

  return true;
}


// ═══════════════════════════════════════════════════════════════════════════
//  TUNER
// ═══════════════════════════════════════════════════════════════════════════
/** Ordre d’affichage dans le menu du syntoniseur (universités en tête). */
const TUNER_STATION_ORDER = ['chyz', 'choq', 'cism', 'ckut'];

function tunerStationRank(radio = {}) {
  const idx = TUNER_STATION_ORDER.indexOf(radio.id);
  return idx >= 0 ? idx : 100 + radioPopularityRank(radio);
}

function sortRadios(list) {
  const order = { universite: 0, cegep: 1 };
  return [...list].sort((a, b) => {
    const t = (order[a.type] ?? 9) - (order[b.type] ?? 9);
    if (t !== 0) return t;
    const aNative = getPlayableStream(a) ? 0 : 1;
    const bNative = getPlayableStream(b) ? 0 : 1;
    if (aNative !== bNative) return aNative - bNative;
    const rankDiff = tunerStationRank(a) - tunerStationRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Une session live est détenue par un autre onglet/page (pair confirmé). */
function isRemoteSessionActive() {
  if (isPlaying() || isCasting()) return false;
  if (!remoteLeaderConfirmed) return false;
  try {
    const s = window.RadarPlayerSync?.readState?.();
    if (!s?.playing || !s.leaderId) return false;
    return s.leaderId !== window.RadarPlayerSync.getTabId();
  } catch {
    return false;
  }
}

/** Mode radio : enchaîner les flux natifs après un poste externe (prev/next ou menu). */
function tunerShouldAutoplayNative(next) {
  if (!next || !getPlayableStream(next)) return false;
  if (isPlaying()) return true;
  // Suiveur : prev/next doit aussi demander le changement au leader.
  if (isRemoteSessionActive()) return true;
  return !!(currentStation && isExternalListen(currentStation));
}

function radioPopularityRank(radio = {}) {
  return typeof radio.popularity === 'number' ? radio.popularity : 50;
}

function radioSlogan(radio = {}) {
  return String(radio.slogan || '').trim()
    || String(radio.description || '').split('.')[0]?.trim()
    || '';
}

function nowPlayingEntry(radio) {
  return radio?.id ? radioNowPlaying.stations?.[radio.id] : null;
}

/**
 * Les APIs des stations servent du HTML échappé : Airtime (CKUT) renvoie
 * « Utopia&#039;s Paradise ». Le bot décode déjà à la source, mais le JSON
 * publié peut dater d'avant ce correctif et les sondes navigateur (CISM,
 * Triton) tapent les APIs en direct. On décode donc **une fois** à l'arrivée
 * de la charge utile, pas à chaque rendu (l'antenne se redessine toutes les
 * secondes).
 */
function decodeAirShow(show) {
  if (!show || typeof show !== 'object') return show;
  const title = decodeHtmlEntities(String(show.title || ''));
  const host = decodeHtmlEntities(String(show.host || ''));
  if (title === show.title && host === (show.host || '')) return show;
  return { ...show, title, ...(show.host != null ? { host } : {}) };
}

function decodeNowPlayingStation(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  return {
    ...entry,
    current: decodeAirShow(entry.current),
    next: decodeAirShow(entry.next),
    track: decodeHtmlEntities(String(entry.track || '')),
    showTitle: decodeHtmlEntities(String(entry.showTitle || '')),
    host: decodeHtmlEntities(String(entry.host || '')),
  };
}

function decodeNowPlayingPayload(payload) {
  const stations = payload?.stations;
  if (!stations || typeof stations !== 'object') return payload || { stations: {} };
  const out = {};
  for (const [id, entry] of Object.entries(stations)) out[id] = decodeNowPlayingStation(entry);
  return { ...payload, stations: out };
}

function normLoose(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * true / false si la plage start–end (fuseau grille) couvre l'instant présent ;
 * null si aucune horloge exploitable (on fait confiance au bot).
 * end exclusive — à 15:00 pile, l'émission 14:00–15:00 est terminée.
 */
function airSlotIsLive(slot) {
  if (!slot) return null;
  const start = scheduleTimeToMin(slot.start);
  const end = scheduleTimeToMin(slot.end);
  if (start == null && end == null) return null;
  const { minutes: now } = scheduleZonedNow();
  if (start != null && end != null) {
    // Nuit : end <= start (ex. 22:00 → 02:00)
    if (end <= start) return now >= start || now < end;
    return now >= start && now < end;
  }
  if (end != null) return now < end;
  // start seul : en cours dès le début (le bot next / la grille corrigeront la fin)
  return now >= start;
}

/** true si le créneau a un start dans le futur (pas encore commencé aujourd'hui). */
function airSlotIsFuture(slot) {
  if (!slot) return false;
  const start = scheduleTimeToMin(slot.start);
  if (start == null) return false;
  const { minutes: now } = scheduleZonedNow();
  const end = scheduleTimeToMin(slot.end);
  // Nuit 22:00→02:00 : « futur » seulement avant le début le soir
  if (end != null && end <= start) return now < start && now >= end;
  return now < start;
}

/** Émission en cours / à venir : d'abord le bot (radio-nowplaying.json), puis grille locale. */
function botCurrentShow(radio) {
  const entry = nowPlayingEntry(radio);
  const cur = entry?.current;
  if (cur?.title && String(cur.title).trim().length >= 3) {
    const live = airSlotIsLive(cur);
    if (live === true) {
      // Une entrée issue de la grille peut être dépassée par une émission
      // spéciale : la grille locale résout alors le créneau le plus récent.
      if (cur.source === 'schedule') return scheduleCurrentSlot(radio) || cur;
      return cur;
    }
    if (live === false) {
      // Créneau pas commencé ou déjà fini — ne jamais l'afficher comme « en ondes »
    } else {
      // live === null : pas d'horaire exploitable
      // Ne pas traiter comme live si un next est clairement en cours
      const next = entry?.next;
      if (!(next?.title && airSlotIsLive(next) === true)) return cur;
    }
  } else {
    // Repli legacy showTitle seulement s'il n'y a pas de current horodaté expiré
    const legacy = String(entry?.showTitle || '').trim();
    if (legacy.length >= 3) {
      return {
        title: legacy,
        host: entry?.host || '',
        source: entry?.source || '',
      };
    }
  }
  // Promouvoir next quand son créneau a commencé (bot pas encore rafraîchi)
  const next = entry?.next;
  if (next?.title && String(next.title).trim().length >= 3 && airSlotIsLive(next) === true) {
    return next;
  }
  return null;
}

function botNextShow(radio) {
  const entry = nowPlayingEntry(radio);
  // Émission déjà résolue en ondes (peut provenir de entry.next promu).
  // Sert à ne pas recycler un `current` périmé en « à venir ».
  const liveShow = botCurrentShow(radio);
  // current futur (bot a mis l'émission dans current trop tôt) → à venir
  const cur = entry?.current;
  if (cur?.title && String(cur.title).trim().length >= 3) {
    if (airSlotIsLive(cur) === false && airSlotIsFuture(cur)) {
      /*
       * Piège minuit (CISM Mix anglo 22:00–00:00) : après la fin, airSlotIsFuture
       * reste vrai toute la journée (fenêtre « ce soir »), alors que l’entrée
       * bot est encore le current d’hier. Si une autre émission est en ondes
       * (ou a été promue depuis next), ne pas annoncer l’ancienne en « à venir ».
       */
      if (!liveShow || normLoose(liveShow.title) === normLoose(cur.title)) return cur;
    }
  }
  const next = entry?.next;
  if (!next?.title || String(next.title).trim().length < 3) return null;
  // Déjà en ondes (promu current) ou terminé (bot retardataire) : ce n'est
  // plus « à venir ». Dans ce dernier cas, le repli de grille trouvera le
  // prochain vrai créneau au lieu de conserver l'émission expirée.
  const nextLive = airSlotIsLive(next);
  if (nextLive === true || (nextLive === false && !airSlotIsFuture(next))) return null;
  if (liveShow && normLoose(liveShow.title) === normLoose(next.title)) return null;
  return next;
}

/**
 * Minutes jusqu’au prochain début de `show` (0–7×1440).
 * Jour de grille via `show.day` ou la grille locale ; sans jour, heuristique
 * « aujourd’hui si l’heure est encore devant, sinon demain ».
 */
function showUpcomingDeltaMin(radio, show) {
  if (!show?.title) return Infinity;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  const slot = radio ? scheduleSlotForTitle(radio, show.title) : null;
  const start = scheduleTimeToMin(show.start || slot?.start);
  if (start == null) return Infinity;
  const showDay = show.day != null ? Number(show.day) : (slot?.day ?? null);
  if (showDay == null || Number.isNaN(showDay)) {
    let delta = start - minutes;
    if (delta <= 0) delta += 1440;
    return delta;
  }
  let delta = showDay * 1440 + start - nowAbs;
  if (delta <= 0) delta += WEEK;
  return delta;
}

/**
 * Prochaine émission à afficher : le plus tôt entre le bot et la grille.
 * La grille hebdo gagne quand l’API annonce une émission plus lointaine
 * (ex. CHOQ GraphQL saute un créneau du jour → « Opération… » vendredi
 * alors qu’Intervenir ensemble est jeudi 11 h).
 */
function resolveUpcomingShow(radio) {
  if (!radio) return null;
  // Plancher : ce qui est en ondes pour de vrai évince ce que la grille
  // annonçait dans le même intervalle (émission spéciale / hors programmation).
  const airLeft = authoritativeAirLeftMin(radio);
  let bot = botNextShow(radio);
  if (airLeft != null && bot?.title && showUpcomingDeltaMin(radio, bot) < airLeft) bot = null;
  const sched = scheduleNextSlot(radio, airLeft || 0);
  if (!bot?.title && !sched) return null;
  if (!bot?.title && sched) {
    return { title: sched.title, start: sched.start, end: sched.end, day: sched.day, source: 'schedule' };
  }
  if (bot?.title && !sched) {
    const slot = scheduleSlotForTitle(radio, bot.title);
    return {
      title: bot.title,
      start: bot.start || slot?.start || '',
      end: bot.end || slot?.end || '',
      day: bot.day != null ? bot.day : (slot?.day ?? null),
      source: bot.source || 'api-live',
    };
  }
  const dBot = showUpcomingDeltaMin(radio, bot);
  const dSched = showUpcomingDeltaMin(radio, {
    title: sched.title,
    start: sched.start,
    end: sched.end,
    day: sched.day,
  });
  if (dSched < dBot) {
    return { title: sched.title, start: sched.start, end: sched.end, day: sched.day, source: 'schedule' };
  }
  const slot = scheduleSlotForTitle(radio, bot.title);
  return {
    title: bot.title,
    start: bot.start || slot?.start || '',
    end: bot.end || (slot && slot.start === (bot.start || slot.start) ? slot.end : '') || '',
    day: bot.day != null ? bot.day : (slot?.day ?? null),
    source: bot.source || 'api-live',
  };
}

function nowAirShowTitle(radio) {
  return String(botCurrentShow(radio)?.title || '').trim();
}

// ─── Repli grille locale (si bot absent ou incomplet) ───────────────────────────

/** Jour (0-6) + minutes depuis minuit dans le fuseau de la grille. */
function scheduleZonedNow(date = new Date()) {
  const tz = radioNowPlaying.timezone || radioSchedules.timezone || 'America/Toronto';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(map.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0;
  const minute = parseInt(map.minute, 10) || 0;
  return { day: wd[map.weekday] ?? 0, minutes: hour * 60 + minute };
}

const SCHEDULE_DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Jour de grille (0-6) d'une émission d'après son titre, si elle y figure.
 * Une émission peut revenir plusieurs fois par semaine (ex. Capitales de
 * Québec le dim/ven/sam) : on prend l'occurrence la plus proche dans le
 * temps plutôt que la première du tableau, sinon le jour renvoyé peut être
 * complètement décorrélé du créneau réellement à venir.
 */
function scheduleSlotForTitle(radio, title) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !title) return null;
  const target = normLoose(title);
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let best = null;
  let bestDelta = WEEK;
  for (const slot of grid) {
    if (!slot.title || normLoose(slot.title) !== target) continue;
    const start = scheduleTimeToMin(slot.start);
    if (start == null) continue;
    let delta = (slot.day * 1440 + start) - nowAbs;
    if (delta <= 0) delta += WEEK;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

function scheduleDayForTitle(radio, title) {
  return scheduleSlotForTitle(radio, title)?.day ?? null;
}

/**
 * « Demain », le nom du jour, ou '' si c'est aujourd'hui — pour éviter
 * qu'un « à venir » dont l'heure est déjà passée aujourd'hui (ex. 22 h vu à
 * 23 h 47) ne paraisse être une émission manquée alors qu'elle est demain.
 */
function scheduleRelativeDayLabel(day) {
  if (day == null) return '';
  const today = scheduleZonedNow().day;
  if (day === today) return '';
  const diff = (day - today + 7) % 7;
  if (diff === 1) return 'Demain';
  return SCHEDULE_DAY_NAMES[day].replace(/^./, (c) => c.toUpperCase());
}

function scheduleTimeToMin(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Plage horaire couvrant l'instant présent (gère les émissions de nuit). */
function scheduleCurrentSlot(radio) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !grid.length) return null;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let current = null;
  let currentStartAbs = -Infinity;
  for (const slot of grid) {
    const start = scheduleTimeToMin(slot.start);
    const end = scheduleTimeToMin(slot.end);
    if (start == null || end == null || !slot.title) continue;
    const startAbs = slot.day * 1440 + start;
    const endAbs = slot.day * 1440 + (end <= start ? end + 1440 : end);
    const isLive = (nowAbs >= startAbs && nowAbs < endAbs)
      || (nowAbs + WEEK >= startAbs && nowAbs + WEEK < endAbs);
    if (!isLive) continue;

    // En cas de chevauchement, la diffusion commencée le plus récemment
    // prévaut (ex. une émission spéciale remplace la grille régulière).
    const effectiveStart = startAbs > nowAbs ? startAbs - WEEK : startAbs;
    if (effectiveStart > currentStartAbs) {
      current = slot;
      currentStartAbs = effectiveStart;
    }
  }
  return current;
}

/**
 * Prochaine émission planifiée (utile entre deux créneaux, ex. CHYZ l'après-midi).
 *
 * `minDelta` écarte les créneaux qui commencent avant une échéance : de quoi
 * sauter ceux qu'une diffusion spéciale recouvre déjà (voir
 * `authoritativeAirLeftMin`) et proposer le premier créneau réellement libre.
 */
function scheduleNextSlot(radio, minDelta = 0) {
  const grid = radio?.id ? radioSchedules.stations?.[radio.id]?.grid : null;
  if (!Array.isArray(grid) || !grid.length) return null;
  const WEEK = 7 * 1440;
  const { day, minutes } = scheduleZonedNow();
  const nowAbs = day * 1440 + minutes;
  let best = null;
  let bestDelta = WEEK;
  for (const slot of grid) {
    const start = scheduleTimeToMin(slot.start);
    if (start == null || !slot.title) continue;
    const startAbs = slot.day * 1440 + start;
    let delta = startAbs - nowAbs;
    if (delta <= 0) delta += WEEK;
    if (delta < minDelta) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

/** true si le bot a une source « live » fiable (API station). */
function isAuthoritativeLiveShow(radio) {
  const cur = botCurrentShow(radio);
  const src = String(cur?.source || nowPlayingEntry(radio)?.source || '');
  return src === 'api-live';
}

/**
 * Sources plus fraîches que la grille hebdo embarquée : l'API de la station,
 * et sa page horaire relue à l'instant par le bot (`schedule-live`). Voir
 * `sourceRank` dans radio-nowplaying-lib.js — garder les deux alignés.
 */
const FRESH_AIR_SOURCES = new Set(['api-live', 'schedule-live']);

/**
 * Minutes restantes de l'émission en ondes quand sa source bat la grille
 * embarquée, sinon null.
 *
 * Une diffusion hors programmation — un match dont l'heure a bougé le jour même
 * — recouvre des créneaux que la grille hebdo, collectée aux deux semaines,
 * continue d'annoncer. Le site montrait ainsi « À venir · Capitales de Québec ·
 * 18:50 » pendant que CHYZ diffusait ce même match depuis 16:50. Rien ne peut
 * commencer avant la fin de ce qui joue : cette durée sert de plancher au
 * « à venir ».
 *
 * La grille embarquée n'ouvre jamais ce veto — elle ne peut pas se corriger
 * elle-même — et un `current` déjà terminé (fenêtre dépassée) ne barre plus rien.
 */
function authoritativeAirLeftMin(radio) {
  const cur = botCurrentShow(radio);
  if (!FRESH_AIR_SOURCES.has(String(cur?.source || ''))) return null;
  const start = scheduleTimeToMin(cur?.start);
  const end = scheduleTimeToMin(cur?.end);
  if (start == null || end == null) return null;
  const wraps = end <= start;
  const endAbs = wraps ? end + 1440 : end;
  const { minutes } = scheduleZonedNow();
  const nowAbs = wraps && minutes < start ? minutes + 1440 : minutes;
  if (nowAbs < start || nowAbs >= endAbs) return null;
  return endAbs - nowAbs;
}

/** Créneau horaire « HH:MM – HH:MM », préfixé de « Demain »/jour si ce n'est pas aujourd'hui. */
function upcomingTimeRange(upcoming, radio) {
  if (!upcoming) return '';
  // Les APIs station ne donnent pas toujours la fin (CISM n'expose qu'un
  // horodatage de début) : la grille locale la complète, sinon « À venir »
  // s'affiche sans heure de fin, voire sans heure du tout.
  const slot = scheduleSlotForTitle(radio, upcoming.title);
  const start = upcoming.start || slot?.start || '';
  // N'apparier une fin venue de la grille qu'avec le même début : une émission
  // revient plusieurs fois par semaine, et coller la fin d'une autre diffusion
  // afficherait une plage qui n'a jamais existé.
  const end = upcoming.end || (slot && slot.start === start ? slot.end : '') || '';
  const range = start && end ? `${start} – ${end}` : (start || '');
  const day = upcoming.day != null ? upcoming.day : (slot?.day ?? null);
  const dayLabel = scheduleRelativeDayLabel(day);
  if (!dayLabel) return range;
  return range ? `${dayLabel} · ${range}` : dayLabel;
}

/**
 * Piste CHOQ « aberrante » (slug fichier, épisode collé, etc.)
 * Ex. « S1 — E6intervenir-ensemble28-novAmv1 » → ignorer, garder l’émission.
 */
function isGarbageChoqTrack(track, relatedTitles = []) {
  let raw = String(track || '').replace(/^♪\s*/, '').trim();
  if (raw.length < 2) return true;

  const compact = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');

  // Codes épisode / saison collés au texte (S1 E6…, E6intervenir…)
  if (/\bs\d+\b/i.test(raw) && /\be\d+/i.test(raw)) return true;
  if (/e\d+[a-z]{4,}/i.test(compact)) return true;

  // Extension de fichier littérale (ex. « Bloc Pub 21 juillet.mp3 ») : sur
  // `raw`, avant que `compact` n'efface le point et ne recolle le mot d'avant
  // à l'extension (juillet.mp3 → juilletmp3, qui ne matche plus le test ci-
  // dessous faute de séparateur devant « mp3 »).
  if (/\.(mp3|wav|flac|aiff?|m4a|ogg|wma|aac)$/i.test(raw)) return true;

  // Extensions / masters / versions fichier
  if (/(^|[^a-z])(amv|wav|mp3|flac|aiff|master|mixdown|edit)\d*$/i.test(compact)) return true;
  if (/\d{1,2}[a-z]{3,4}\d*/i.test(compact) && /v\d|amv|nov|jan|fev|mar|avr|mai|jun|jul|aou|sep|oct|dec/i.test(compact)) {
    return true;
  }

  // Peu d’espaces + tirets/underscores → nom de fichier
  const spaces = (raw.match(/\s/g) || []).length;
  if (raw.length >= 18 && spaces <= 2 && /[-_]/.test(raw) && /[a-z]\d|\d[a-z]/i.test(raw)) {
    return true;
  }

  // Contient le slug d’une émission liée sans espaces (intervenirensemble…)
  for (const title of relatedTitles) {
    const slug = String(title || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '');
    if (slug.length >= 8 && compact.includes(slug) && compact !== slug) return true;
  }

  return false;
}

/** Arrête le timer de rotation du panneau bureau. */
function stopAirPanelRotate() {
  if (airPanelRotateTimer) {
    clearTimeout(airPanelRotateTimer);
    airPanelRotateTimer = null;
  }
}

/** Passe à la phase suivante et demande un fondu au prochain rendu. */
function advanceAirPhase(phaseCount) {
  if (!(phaseCount > 1)) return;
  airPhaseIndex = (airPhaseIndex + 1) % phaseCount;
  nowAirCrossfadePending = true;
  lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
}

/**
 * Rotation du panneau « À l'antenne » — **bureau, poste syntonisé seulement**.
 *
 * Une seule horloge à la fois, dans les deux sens :
 *  - sous 1100 px le panneau est `display:none` et c'est le tick du dial qui
 *    fait avancer la phase, à sa cadence adaptée à la longueur du texte ;
 *  - au repos (aucun poste choisi), c'est le carrousel de postes qui rythme
 *    l'affichage, et le panneau montre toujours la première phase du poste
 *    présenté. Y superposer ce timer ne changeait donc aucun texte, mais
 *    forçait un fondu du panneau toutes les 8 s sur un contenu identique.
 */
function syncAirPanelRotate(radio) {
  const phases = composedAirPhases(radio, { withSlogan: false });
  if (isTunerPresentationPaused() || !currentStation || phases.length < 2 || isTunerSubRotateMode()) {
    stopAirPanelRotate();
    return;
  }
  if (airPanelRotateTimer) return;
  scheduleAirPanelRotateTick();
}

/**
 * Chaîne de `setTimeout` plutôt qu'un `setInterval` fixe : la durée dépend de
 * la phase affichée. L'émission en ondes reste deux fois plus longtemps que la
 * piste ou le « à venir », et un titre qui déborde a le temps de faire son
 * aller-retour complet avant d'être remplacé — la même règle que le dial.
 */
function scheduleAirPanelRotateTick() {
  stopAirPanelRotate();
  if (isTunerPresentationPaused() || !currentStation || isTunerSubRotateMode()) return;

  const phases = composedAirPhases(currentStation, { withSlogan: false });
  if (phases.length < 2) return;

  const phase = phases[airPhaseIndex % phases.length];

  whenMarqueeSettled(TUNER_NOWAIR_TITLE, () => {
    if (isTunerPresentationPaused() || !currentStation || isTunerSubRotateMode() || airPanelRotateTimer) return;
    const delay = Math.max(
      airPhaseDwellMs(phase, AIR_PANEL_ROTATE_MS),
      marqueeRoundTripMs(TUNER_NOWAIR_TITLE),
      marqueeRoundTripMs(TUNER_NOWAIR_SUB),
    );
    airPanelRotateTimer = setTimeout(() => {
      airPanelRotateTimer = null;
      const live = composedAirPhases(currentStation, { withSlogan: false });
      if (isTunerPresentationPaused() || !currentStation || live.length < 2 || isTunerSubRotateMode()) return;
      advanceAirPhase(live.length);
      // `renderTunerNowAir()` réarme le cycle via `syncAirPanelRotate()` :
      // ne pas replanifier ici, on programmerait deux fois.
      renderTunerNowAir();
    }, delay);
  });
}

/**
 * Métadonnée technique plutôt qu'un contenu : ce que l'automate émet entre
 * deux émissions. Le bot filtre déjà à la source (radio-nowplaying-lib.js),
 * mais le JSON publié peut dater d'avant ce filtre — d'où le double garde.
 * Vaut pour tous les postes, pas seulement CKUT/McGill.
 */
const AIR_TECHNICAL_RE = /^(?:off ?line|off ?air|dead ?air|silence(?: detected)?|station ?id|airtime!?|liquidsoap(?:\s+radio!?)?|no name|unknown|unspecified|n\/a)$/i;

/**
 * Piste affichable (CHOQ : ignore les slugs fichier / métadonnées pourries).
 */
function trackForAirDisplay(radio, track, relatedTitles = []) {
  const t = decodeHtmlEntities(String(track || '')).replace(/^♪\s*/, '').trim();
  if (!t) return '';
  if (AIR_TECHNICAL_RE.test(t)) return '';
  // « ♪ CKUT 90,3 » ou « ♪ <slogan> » : le nom du poste n'est pas un morceau.
  const low = normLoose(t);
  if (low === normLoose(radio?.name) || low === normLoose(radioSlogan(radio || {}))) return '';
  if (radio?.id === 'choq' && isGarbageChoqTrack(t, relatedTitles)) return '';
  return t;
}

/**
 * Phases de la ligne d'antenne, dans l'ordre d'affichage.
 *
 * Une **liste** plutôt qu'une alternance à deux temps : c'est ce qui rend
 * « À venir » visible. Auparavant la prochaine émission n'était atteignable
 * que si aucune émission n'était en ondes — c'est-à-dire presque jamais.
 *
 *   1. émission en cours   2. à venir   3. piste   4. slogan (mobile seulement)
 *
 * Le slogan ferme le cycle sur mobile et n'y figure pas sur bureau, où il
 * occupe déjà la ligne 2 du syntoniseur (`tunerDesktopSubLine`) — l'ajouter
 * l'afficherait deux fois au même écran.
 *
 * @returns {{ title: string, sub: string, kind: 'live'|'upcoming'|'idle' }[]}
 */
function airRotationPhases(radio, { withSlogan = false } = {}) {
  if (!radio) return [];
  const slogan = radioSlogan(radio);
  const entry = nowPlayingEntry(radio);
  const botCur = botCurrentShow(radio);
  const schedCur = scheduleCurrentSlot(radio);
  const upcomingResolved = resolveUpcomingShow(radio);
  const relatedTitles = [
    botCur?.title,
    schedCur?.title,
    upcomingResolved?.title,
  ].filter(Boolean);
  // CHOQ : ne jamais afficher une piste « fichier » (titre ni sous-titre)
  const track = trackForAirDisplay(radio, entry?.track, relatedTitles);

  const phases = [];
  const seen = new Set();
  const push = (title, sub, kind) => {
    const t = String(title || '').trim();
    if (!t) return;
    const key = normLoose(t);
    if (!key || seen.has(key)) return;
    seen.add(key);
    phases.push({ title: t, sub: String(sub || '').trim(), kind });
  };

  // 1) Émission en cours — bot (api > grille) puis repli grille locale
  const cur = (botCur?.title && botCur) || (schedCur?.title && schedCur) || null;
  if (cur) {
    const host = String(cur.host || entry?.host || '').trim();
    const start = cur.start || schedCur?.start || '';
    const end = cur.end || schedCur?.end || '';
    const timeRange = start && end ? `${start} – ${end}` : (start || '');
    // La piste a sa propre phase : inutile de la répéter en sous-titre.
    const sub = timeRange
      || (host && normLoose(host) !== normLoose(cur.title) ? `avec ${host}` : '');
    push(cur.title, sub, 'live');
  }

  // 2) À venir — désormais affiché même pendant qu'une émission est en ondes.
  // resolveUpcomingShow arbitrage bot vs grille (le plus tôt gagne).
  if (upcomingResolved?.title) {
    push(upcomingResolved.title, upcomingTimeRange(upcomingResolved, radio), 'upcoming');
  }

  // 3) Piste en cours
  if (track) push(`♪ ${track}`, '', 'live');

  // 4) Slogan : ferme le cycle sur mobile, jamais seul en tête
  if (withSlogan && slogan && phases.length) push(slogan, '', 'idle');

  // Rien à annoncer : le slogan (ou un repli) devient la seule phase.
  if (!phases.length) push(slogan || `Vous écoutez ${radio.name}`, '', 'idle');

  return phases;
}

/**
 * Phase courante d'un poste. Le poste écouté suit l'index de rotation ;
 * un poste seulement prévisualisé montre sa phase la plus informative.
 * @returns {{ title: string, sub: string, kind: 'live'|'upcoming'|'idle' }}
 */
function nowAirLines(radio) {
  const phases = composedAirPhases(radio, { withSlogan: isTunerSubRotateMode() });
  if (!phases.length) {
    return { title: `Vous écoutez ${radio?.name || ''}`.trim(), sub: '', kind: 'idle' };
  }
  const index = radio && currentStation && radio.id === currentStation.id
    ? airPhaseIndex % phases.length
    : 0;
  return phases[index];
}

/** Libellé du panneau bureau : « À l'antenne » (live/idle) ou « À venir ». */
function nowAirPanelLabel(kind = 'idle') {
  return kind === 'upcoming' ? 'À venir' : "À l'antenne";
}

/**
 * Une seule ligne pour la rotation du sous-titre du dial (mobile / compact).
 * Sur bureau le libellé panneau porte déjà « À venir » ; ici on le préfixe
 * quand kind === upcoming (le panneau est masqué sous 1100px).
 */
function formatNowAirSubLine(title, sub, empty, kind = 'idle', { liveLabel = false } = {}) {
  if (empty) return 'Les radios étudiantes jouent en direct, 24/7';
  const t = String(title || '').trim();
  const s = String(sub || '').trim();
  // Ne pas juxtaposer deux fois la même information : « ♪ Rotten · Rotten »
  // ou « Mutations · Mutations (reprise) » se lisent comme un bégaiement.
  const lowT = normLoose(t);
  const lowS = normLoose(s);
  const redundant = !!lowS && !!lowT && (lowT.includes(lowS) || lowS.includes(lowT));
  const core = s && !redundant ? `${t} · ${s}` : (t || s);
  if (!core) return '';
  if (kind === 'upcoming') return `À venir · ${core}`;
  // « À l'antenne » sous 1100 px (panneau latéral masqué) : distingue l'émission
  // en cours de « À venir ». Aussi en aperçu idle mode B : L1 porte le poste,
  // L2 doit porter le statut (focus-group le-radar-tuner-dial-info-900).
  // Le ♪ d'une piste se suffit à lui-même.
  if (liveLabel && kind === 'live' && !t.startsWith('♪')) return `À l'antenne · ${core}`;
  return core;
}

/**
 * true si la ligne antenne n'apporte rien de plus que la ligne méta (slogan).
 * Faire alterner deux lignes équivalentes donne l'impression que l'affichage
 * hésite, alors qu'il n'a qu'une chose à dire — on n'alterne pas dans ce cas.
 */
function isRedundantAirLine(airLine, metaLine) {
  const air = normLoose(airLine);
  const meta = normLoose(metaLine);
  if (!air) return true;
  if (air === meta) return true;
  if (!meta) return false;
  const rest = air.split('·').map((p) => p.trim()).filter((p) => p && p !== meta);
  return rest.length === 0;
}

/**
 * Surface de test. La mise en forme de la ligne d'antenne est de la logique
 * pure : l'exposer permet de vérifier les règles anti-répétition sans dépendre
 * de ce que les stations diffusent au moment du test (donc sans test
 * instable). Lecture seule, aucune incidence sur l'exécution — voir
 * tests/now-air-lines.spec.mjs.
 */
window.RadarAir = {
  _pure: {
    formatNowAirSubLine,
    isRedundantAirLine,
    airRotationPhases,
    dialPhaseLinesForRadio,
    dialPhasesForRadio,
    idleDialStoryLine,
    previewDialLine,
    compactDialTitleLine,
    isTunerDialMidLayout,
    stationBandedName,
    airPhaseDwellMs,
    marqueeRoundTripMs,
    getTunerSubRotateDelayMs,
    marqueeAlternateCount,
    trackForAirDisplay,
    liveCopyFromPhases,
    splitChoqSongLines,
    applyChoqLiveSongLines,
    composedAirPhases,
    wideNowAirLiveCopy,
    isGarbageChoqTrack,
    botCurrentShow,
    botNextShow,
    resolveUpcomingShow,
    scheduleNextSlot,
    scheduleCurrentSlot,
    authoritativeAirLeftMin,
    showUpcomingDeltaMin,
    airSlotIsLive,
    airSlotIsFuture,
  },
};

function nowAirInterestScore(radio) {
  if (botCurrentShow(radio) && isAuthoritativeLiveShow(radio)) return 4;
  if (botCurrentShow(radio) || scheduleCurrentSlot(radio)?.title) return 3;
  if (botNextShow(radio) || scheduleNextSlot(radio)?.title) return 2;
  if (nowPlayingEntry(radio)?.track) return 1;
  return 0;
}

function nowAirPreviewPool() {
  const interesting = radios.filter((r) => nowAirInterestScore(r) > 0);
  return interesting.length ? interesting : radios;
}

function pickNowAirPreviewRadio() {
  const pool = nowAirPreviewPool();
  if (!pool.length) {
    nowAirPreviewRadio = null;
    return null;
  }
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && pick.id === lastNowAirPreviewId) {
    const others = pool.filter((r) => r.id !== lastNowAirPreviewId);
    pick = others[Math.floor(Math.random() * others.length)];
  }
  nowAirPreviewRadio = pick;
  lastNowAirPreviewId = pick.id;
  return pick;
}

function formatStationNowAirLabel(radio) {
  const inst = shortInstitution(radio.institution, radio.type);
  return inst ? `${radio.name} · ${inst}` : radio.name;
}

/* ── Synthoniseur uniquement (#tuner-now-name) — pas articles, filtres ni RSS ── */

/**
 * Téléphone (< 600 px) ou embed étroit (pomo/solitaire mobile) :
 * layout dial compact (ligne antenne dans le sous-titre).
 */
function isTunerDialPhoneLayout() {
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_DIAL_PHONE_MQ?.matches;
}

/**
 * Institution dans le syntoniseur : **toujours l’acronyme** (UQAM, UdeM, ULaval…).
 * Évite le marquee inutile en veille (« CHOQ.ca · Université du Québec à Montréal »)
 * et aligne bureau / tablette / téléphone.
 */
function tunerDialInstitutionLabel(radio) {
  if (!radio) return '';
  const raw = shortInstitution(radio.institution, radio.type)
    || resolveInstitutionAcronym(radio.institution)
    || adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution));
  // Acronymes neutres (pas de MT) ; forme longue seulement si aucun acronyme.
  return adaptRadarInstitutionLabel(raw);
}

/**
 * Suffixe « FM » / « AM » depuis frequency, si absent du nom
 * (ex. name « CISM 89,3 » + frequency « 89,3 FM » → « CISM 89,3 FM »).
 * Web / sans bande → chaîne vide.
 */
function stationOnAirBandLabel(radio = {}) {
  const name = String(radio.name || '');
  if (/\bFM\b/i.test(name) || /\bAM\b/i.test(name)) return '';
  // 1690AM collé sans espace
  if (/\dAM\b/i.test(name) || /\dFM\b/i.test(name)) return '';
  const freq = String(radio.frequency || '').trim();
  if (/\bFM\b/i.test(freq)) return ' FM';
  if (/\bAM\b/i.test(freq)) return ' AM';
  return '';
}

/** Nom d’antenne affiché : « CISM 89,3 FM », « CJLO 1690AM », « CHOQ.ca ». */
function stationDisplayName(radio = {}) {
  const name = String(radio.name || '').trim();
  if (!name) return '';
  return `${name}${stationOnAirBandLabel(radio)}`;
}

/**
 * Poste **et** sa bande de diffusion : « CISM 89,3 FM », « CJLO 1690AM »,
 * « CHOQ.ca · Web ». `stationOnAirBandLabel()` ne connaît que FM et AM ;
 * un poste sans fréquence hertzienne annonce donc « Web », sans quoi rien
 * n'indiquerait comment il se diffuse.
 */
function stationBandedName(radio = {}) {
  const display = stationDisplayName(radio);
  if (!display) return '';
  // « CJLO 1690AM » porte déjà sa bande, collée au chiffre : `\bAM\b` ne la
  // voyait pas (pas de frontière de mot entre « 0 » et « A »), et on ajoutait
  // « · 1690 AM » derrière.
  if (/(?:\b|\d)(?:FM|AM)\b/i.test(display)) return display;
  const freq = String(radio.frequency || '').trim();
  if (!freq || /^web$/i.test(freq)) return `${display} · Web`;
  return `${display} · ${freq}`;
}

/** Ligne 1 du syntoniseur (vue compacte) : « poste · établissement ». */
function tunerDialTitleLine(radio) {
  if (!radio) return tunerSubMeta || 'Radios étudiantes en direct';
  const inst = tunerDialInstitutionLabel(radio);
  const name = stationDisplayName(radio) || radio.name;
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne 1 du syntoniseur (bureau) : « poste FM · acronyme ».
 * Ex. CISM 89,3 FM · UdeM
 */
function tunerDesktopTitleLine(radio) {
  if (!radio) return 'Syntoniser un poste';
  const name = stationDisplayName(radio) || String(radio.name || '').trim() || 'Syntoniser un poste';
  const inst = shortInstitution(radio.institution, radio.type)
    || adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution));
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne 2 du syntoniseur (bureau) : slogan (sinon fréquence / site externe).
 */
function tunerDesktopSubLine(radio, { external = false } = {}) {
  if (!radio) return '';
  const slogan = radioSlogan(radio);
  if (slogan) return slogan;
  if (external) return adaptRadarUiText('Site externe');
  return String(radio.frequency || '').trim();
}

/**
 * Mobile / tablette (< 1100 px) sur le site principal.
 * Embed large : logique « bureau » (panneau latéral À l'antenne).
 * Embed étroit (≤640 px) : même logique compacte que le site mobile
 * (ligne 2 = antenne / à venir + marquee) car le panneau est masqué en CSS.
 */
function isDialCompactLayout() {
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

/**
 * Mid 768–900 (jusqu’à 1099.98) : combler le vide du carré avec institution
 * complète + heures. Hors mid (téléphone) : acronyme, pas d’horaire collé.
 * Embed : jamais (barre étroite).
 */
function isTunerDialMidLayout() {
  if (IS_TUNER_EMBED) return false;
  return !!TUNER_DIAL_MID_MQ?.matches && isDialCompactLayout();
}

/**
 * Titre ligne 1 en layout compact :
 *  - téléphone : poste · acronyme
 *  - mid 768/900 : poste · nom complet d’institution (comble le vide)
 */
function compactDialTitleLine(radio) {
  if (!radio) return tunerSubMeta || 'Radios étudiantes en direct';
  const name = stationDisplayName(radio) || radio.name || '';
  const inst = isTunerDialMidLayout()
    ? adaptRadarInstitutionLabel(tunerInstitutionLabel(radio.institution || ''))
    : tunerDialInstitutionLabel(radio);
  if (!name) return inst || '';
  return inst ? `${name} · ${inst}` : name;
}

/**
 * Ligne « méta » du dial compact (sous le titre poste · établissement) :
 * slogan (langue principale de l’institution, sans MT) — alterne avec l’antenne.
 * Fréquence seulement en dernier recours.
 */
function dialCompactMetaLineForRadio(radio) {
  if (!radio) return '';
  if (isExternalListen(radio)) return adaptRadarUiText('Site externe');
  // Slogan original (pas de traduction) = langue principale de l’institution
  const slogan = radioSlogan(radio);
  if (slogan) return slogan;
  return String(radio.frequency || '').trim() || 'Web';
}

/**
 * Phases L2 du dial compact **en écoute** (focus-group
 * `le-radar-tuner-dial-info-900` — mode **E**).
 *
 * Ordre : émission live → piste → à venir → (horaire filet hors mid).
 * Mid 768/900 : horaire collé à l’émission primaire pour combler le vide
 * (`À l'antenne · Titre · 08:00 – 18:30`). Ailleurs : titre seul + filet horaire.
 */
function dialPhasesForRadio(radio) {
  if (!radio) return [];
  const mid = isTunerDialMidLayout();
  const raw = airRotationPhases(radio, { withSlogan: false });
  const liveShows = [];
  const tracks = [];
  const upcomings = [];
  /** @type {{ title: string, sub: string, kind: string }[]} */
  const timeFilet = [];

  for (const phase of raw) {
    const title = String(phase.title || '').trim();
    if (!title) continue;
    const isTrack = title.startsWith('♪');
    if (phase.kind === 'upcoming') {
      upcomings.push(phase);
      continue;
    }
    if (isTrack) {
      tracks.push(phase);
      continue;
    }
    if (phase.kind === 'live') {
      liveShows.push(phase);
      // Hors mid : horaire en filet séparé (pas collé au titre).
      const time = String(phase.sub || '').trim();
      if (!mid && time && /^\d{1,2}:\d{2}/.test(time)) {
        timeFilet.push({ title: time, sub: '', kind: 'idle' });
      }
      continue;
    }
    // Repli idle (slogan seul si aucune grille) : une face utile.
    liveShows.push(phase);
  }

  const ordered = [...liveShows, ...tracks, ...upcomings, ...timeFilet];
  const seen = new Set();
  const out = [];
  for (const phase of ordered) {
    const title = String(phase.title || '').trim();
    const isTrack = title.startsWith('♪');
    const isTimeOnly = phase.kind === 'idle' && /^\d{1,2}:\d{2}/.test(title);
    // Mid : garder l’horaire sur la face primaire live pour remplir le carré.
    const sub = (phase.kind === 'live' && !isTrack && !mid)
      ? ''
      : String(phase.sub || '').trim();
    const line = isTimeOnly
      ? title
      : formatNowAirSubLine(title, sub, false, phase.kind, { liveLabel: true });
    const key = normLoose(line);
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...phase, sub, line });
  }
  return out;
}

/** Les mêmes phases, réduites à leur texte. */
function dialPhaseLinesForRadio(radio) {
  return dialPhasesForRadio(radio).map((p) => p.line);
}

/**
 * L2 du carré dial **hors écoute** (mode **B** — panel élargi).
 * Téléphone : préfixe + titre. Mid 768/900 : + horaire si dispo (comble le vide).
 */
function idleDialStoryLine(radio) {
  if (!radio) return '';
  const phase = airRotationPhases(radio, { withSlogan: false })[0];
  if (!phase) return '';
  const mid = isTunerDialMidLayout();
  const sub = mid ? String(phase.sub || '').trim() : '';
  return formatNowAirSubLine(phase.title, sub, false, phase.kind, { liveLabel: true });
}

/**
 * @deprecated Nom historique — désormais l'histoire L2 idle (B), sans poste.
 * Conservé pour `RadarAir._pure` / tests ; préférer `idleDialStoryLine`.
 */
function previewDialLine(radio) {
  return idleDialStoryLine(radio);
}

function formatPreviewNowAir(radio, { omitStation = false } = {}) {
  const stationLine = formatStationNowAirLabel(radio);
  const { title, sub, kind } = nowAirLines(radio);
  const genericListen = `Vous écoutez ${radio.name}`;
  const slogan = radioSlogan(radio);

  let airDetail = sub || '';
  if (!airDetail || airDetail === genericListen || airDetail === slogan) {
    airDetail = '';
  }

  if (omitStation) {
    if (title === genericListen) {
      const fallback = airDetail || slogan || '';
      return { title: fallback || 'En direct', sub: '', kind: kind || 'idle' };
    }
    return { title, sub: airDetail || '', kind };
  }

  if (title === genericListen) {
    return {
      title: stationLine,
      sub: airDetail || slogan || '',
      kind: kind || 'idle',
    };
  }

  return {
    title,
    sub: airDetail ? `${stationLine} · ${airDetail}` : stationLine,
    kind,
  };
}

function stopNowAirPreview() {
  if (nowAirPreviewTimer) {
    clearTimeout(nowAirPreviewTimer);
    nowAirPreviewTimer = null;
  }
}

/**
 * Temps qu'il faut à un texte qui défile pour : lire → partir → revenir → reposer.
 *
 * L'animation est `alternate` × `--marquee-trips` (2 ou 4) + delay lecture.
 * Un cycle complet = delay + trips × `--marquee-duration` + pause repos.
 *
 * On ne change jamais un texte avant la fin de ses aller-retour.
 */
function marqueeRoundTripMs(el) {
  if (!el?.classList.contains('is-marquee')) return 0;
  const sec = parseFloat(el.style.getPropertyValue('--marquee-duration'));
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  const tripsRaw = parseFloat(el.style.getPropertyValue('--marquee-trips'));
  const trips = Number.isFinite(tripsRaw) && tripsRaw >= 2 ? tripsRaw : MARQUEE_ROUND_TRIPS;
  return Math.ceil(sec * 1000 * trips)
    + MARQUEE_READ_DELAY_MS
    + MARQUEE_REST_MS;
}

/**
 * Combien de temps laisser une phase à l'écran, avant la contrainte de
 * défilement. L'émission en ondes est l'information principale : elle reste
 * deux fois plus longtemps qu'une piste, qu'un « à venir » ou qu'un slogan.
 */
function airPhaseDwellMs(phase, baseMs) {
  const title = String(phase?.title || '');
  const isLiveShow = phase?.kind === 'live' && !title.startsWith('♪');
  return isLiveShow ? Math.round(baseMs * AIR_LIVE_DWELL_FACTOR) : baseMs;
}

/**
 * Délai avant la prochaine alternance du sous-titre.
 *
 * La durée **de base** dépend de la largeur (un écran étroit se lit moins
 * vite) ; la contrainte de défilement, elle, vaut à **toute** largeur — elle
 * était auparavant enfermée dans la garde `< 1100 px`, si bien qu'en embed
 * large une ligne qui défilait pouvait changer en pleine course.
 */
function getTunerSubRotateDelayMs(activeEl, phase = null) {
  let delay = TUNER_SUB_ROTATE_MS;

  if (TUNER_SUB_ROTATE_MQ?.matches) {
    if (TUNER_SUB_ROTATE_VERY_NARROW_MQ?.matches) {
      delay = TUNER_SUB_ROTATE_VERY_NARROW_MS;
    } else if (TUNER_SUB_ROTATE_NARROW_MQ?.matches) {
      delay = TUNER_SUB_ROTATE_NARROW_MS;
    }
  }

  if (phase) delay = airPhaseDwellMs(phase, delay);
  return Math.max(delay, marqueeRoundTripMs(activeEl));
}

/**
 * Attend que la mesure du défilement soit posée avant de calculer le délai.
 *
 * Le budget suit celui de `scheduleMarqueeMeasure()` (2 rAF par tentative,
 * jusqu'à 5) : plus court, on calculait le délai avant que
 * `--marquee-duration` n'existe, la durée retombait à la base et la ligne
 * changeait en plein défilement.
 */
const MARQUEE_MEASURE_FRAMES = 12;

/**
 * Appelle `cb` une fois que `el` sait s'il défile ou non. Partagé par le dial
 * et le panneau : sans cette attente, on calcule un délai à partir d'un
 * `--marquee-duration` qui n'existe pas encore.
 */
function whenMarqueeSettled(el, cb, attempt = 0) {
  const span = el?.querySelector('.tuner-now-sub-text');
  const mightOverflow = span && el?.clientWidth > 0
    && span.scrollWidth > el.clientWidth + 4;

  if (attempt < MARQUEE_MEASURE_FRAMES && mightOverflow && !el?.classList.contains('is-marquee')) {
    requestAnimationFrame(() => whenMarqueeSettled(el, cb, attempt + 1));
    return;
  }
  cb();
}

function planTunerSubRotateDelay(activeEl, attempt, onReady, phase = null) {
  whenMarqueeSettled(activeEl, () => onReady(getTunerSubRotateDelayMs(activeEl, phase)), attempt);
}

function isNowAirPanelPreviewMode() {
  // Au repos (rien en lecture) : les postes alternent au hasard.
  // On verrouille si lecture, pause utilisateur, ou choix explicite d’un poste.
  return !PREFERS_REDUCED_MOTION?.matches
    && radios.length > 0
    && !isPlaybackActive()
    && !userPaused
    && !userPickedStation
    && !isBuffering;
}

/**
 * Compact sans poste : composition B dans le carré dial
 * (L1 identité carrousel, L2 une face). Site &lt;1100 + embed étroit
 * (panneau « À l'antenne » masqué). Embed large : panneau latéral, pas ici.
 */
function isMobileIdleDialPreview() {
  if (!isNowAirPanelPreviewMode()) return false;
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

/** Bureau sans poste : faire défiler les radios disponibles dans le sous-titre du dial. */
function isDesktopIdleDialCarousel() {
  return !currentStation
    && !PREFERS_REDUCED_MOTION?.matches
    && (IS_TUNER_EMBED ? !isEmbedNowAirInDial() : !TUNER_SUB_ROTATE_MQ?.matches)
    && radios.length > 0;
}

/** Première composition L1/L2 posée — évite le flash HTML « Syntoniser un poste ». */
function markTunerDialReady() {
  TUNER?.classList.add('is-dial-ready');
}

function applyDialTextCrossfade(el, text, crossfade = false) {
  if (!el) return;
  if (!crossfade || PREFERS_REDUCED_MOTION?.matches) {
    applyMarquee(el, text);
    return;
  }
  el.classList.add('is-crossfading');
  setTimeout(() => {
    applyMarquee(el, text);
    requestAnimationFrame(() => el.classList.remove('is-crossfading'));
  }, NOW_AIR_CROSSFADE_MS);
}

/** Bureau sans poste : titre fixe + postes qui défilent en bas ; « À l'antenne » reste à part. */
function syncDesktopDialPreview(_airTitle, crossfade = false) {
  // Wide E : institution + poste + slogan complets (aperçu ou écoute).
  if (isWideTunerLayout()) {
    const radio = currentStation || nowAirPreviewRadio;
    if (radio) {
      paintWideDial(radio);
      lastDialCarouselText = stationDisplayName(radio) || radio.name || '';
      return;
    }
    paintWideDial(null);
    return;
  }
  // Mode B (site compact / embed étroit) : L1 géré dans syncTunerSubRotate.
  // Ne jamais écrire « Syntoniser un poste » ici — c’était le flash d’une frame.
  if (isMobileIdleDialPreview()) return;

  if (!isDesktopIdleDialCarousel()) {
    // Vrai vide seulement (pas de carrousel d’aperçu).
    if (!currentStation && !isNowAirPanelPreviewMode()) {
      setTunerNameText('Syntoniser un poste');
      markTunerDialReady();
    }
    return;
  }

  if (!nowAirPreviewRadio) {
    setTunerNameText('Syntoniser un poste');
    if (tunerSubMeta) applyMarquee(TUNER_SUB, tunerSubMeta);
    markTunerDialReady();
    return;
  }

  // Acronyme d’établissement (CHOQ.ca · UQAM) — pas le nom long qui force un marquee en veille.
  const stationLine = tunerDialTitleLine(nowAirPreviewRadio);
  const subText = TUNER_SUB?.querySelector('.tuner-now-sub-text')?.textContent;
  if (!crossfade && stationLine === lastDialCarouselText && subText === stationLine) {
    setTunerNameText('Syntoniser un poste');
    markTunerDialReady();
    return;
  }
  lastDialCarouselText = stationLine;

  setTunerNameText('Syntoniser un poste');
  applyDialTextCrossfade(TUNER_SUB, stationLine, crossfade);
  markTunerDialReady();
}

function scheduleNowAirPreviewTick() {
  if (nowAirPreviewTimer) {
    clearTimeout(nowAirPreviewTimer);
    nowAirPreviewTimer = null;
  }
  if (isTunerPresentationPaused() || !isNowAirPanelPreviewMode()) return;

  const wait = IS_TUNER_EMBED ? TUNER_SUB_ROTATE_MS : NOW_AIR_PREVIEW_DWELL_MS;
  nowAirPreviewTimer = setTimeout(() => {
    nowAirPreviewTimer = null;
    if (isTunerPresentationPaused() || !isNowAirPanelPreviewMode()) return;
    pickNowAirPreviewRadio();
    renderTunerNowAir();
    scheduleNowAirPreviewTick();
  }, wait);
}

function startNowAirPreview() {
  if (isTunerPresentationPaused() || nowAirPreviewTimer || !isNowAirPanelPreviewMode()) return;
  if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
  scheduleNowAirPreviewTick();
}

function isTunerSubRotateMode() {
  if (PREFERS_REDUCED_MOTION?.matches) return false;
  // Embed étroit : alternance slogan/fréquence ↔ à l'antenne / à venir dans le dial.
  if (IS_TUNER_EMBED) return isEmbedNowAirInDial();
  return !!TUNER_SUB_ROTATE_MQ?.matches;
}

function stopTunerSubRotate() {
  if (tunerSubRotateTimer) {
    clearTimeout(tunerSubRotateTimer);
    tunerSubRotateTimer = null;
  }
  TUNER_SUB?.parentElement?.classList.remove('is-rotating');
}

/**
 * Écrit `text` dans le créneau qui devient actif, puis bascule.
 *
 * Les deux éléments ne portent plus un rôle figé (slogan d'un côté, antenne de
 * l'autre) : ce sont deux créneaux interchangeables entre lesquels on fait un
 * fondu, et le contenu vient de la liste de phases. C'est ce qui permet
 * d'avoir plus de deux phases.
 */
function setDialRotateSlot(slotB, text) {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  const incoming = slotB ? TUNER_SUB_AIR : TUNER_SUB;
  const outgoing = slotB ? TUNER_SUB : TUNER_SUB_AIR;
  applyMarquee(incoming, text);
  outgoing.classList.remove('is-marquee');
  TUNER_SUB.classList.toggle('is-active', !slotB);
  TUNER_SUB_AIR.classList.toggle('is-active', slotB);
  TUNER_SUB.setAttribute('aria-hidden', String(slotB));
  TUNER_SUB_AIR.setAttribute('aria-hidden', String(!slotB));
  scheduleMarqueeRefresh();
}

/**
 * Garde `lastNowAir` aligné sur la phase courante : sans ça, le prochain
 * `renderTunerNowAir()` (tick 30 s) croit à un changement et refait un fondu.
 */
function syncNowAirCacheToPhase(radio) {
  const { title, sub, kind } = nowAirLines(radio);
  lastNowAir = { ...lastNowAir, title, sub, kind };
}

function scheduleTunerSubRotateTick() {
  if (tunerSubRotateTimer) {
    clearTimeout(tunerSubRotateTimer);
    tunerSubRotateTimer = null;
  }
  if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;

  const activeEl = dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB;
  // Phase actuellement lisible : c'est elle qui décide du temps d'affichage
  // (l'émission en ondes reste plus longtemps que la piste ou le « à venir »).
  const shown = dialPhasesForRadio(currentStation);
  const phase = shown.length ? shown[airPhaseIndex % shown.length] : null;

  planTunerSubRotateDelay(activeEl, 0, (delay) => {
    if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;
    tunerSubRotateTimer = setTimeout(() => {
      tunerSubRotateTimer = null;
      if (isTunerPresentationPaused() || !isTunerSubRotateMode() || !currentStation) return;
      const phases = dialPhasesForRadio(currentStation);
      if (phases.length < 2) {
        renderTunerNowAir();
        return;
      }
      // La phase n'avance qu'ici, entre deux affichages — jamais pendant
      // qu'on lit la ligne.
      airPhaseIndex = (airPhaseIndex + 1) % phases.length;
      dialRotateSlotB = !dialRotateSlotB;
      setDialRotateSlot(dialRotateSlotB, phases[airPhaseIndex].line);
      syncNowAirCacheToPhase(currentStation);
      scheduleTunerSubRotateTick();
    }, delay);
  }, phase);
}

function restartTunerSubRotateTimer() {
  if (!isTunerPresentationPaused() && TUNER_SUB?.parentElement?.classList.contains('is-rotating') && currentStation) {
    scheduleTunerSubRotateTick();
  }
}

/** Fige l'affichage sur le créneau A (hors rotation). */
function resetDialRotateSlots(text) {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  dialRotateSlotB = false;
  TUNER_SUB.classList.add('is-active');
  TUNER_SUB_AIR.classList.remove('is-active');
  TUNER_SUB.setAttribute('aria-hidden', 'false');
  TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');
  TUNER_SUB_AIR.classList.remove('is-marquee');
  if (text != null) applyMarquee(TUNER_SUB, text);
}

/** Texte du panneau antenne : marquee doux seulement en cas de débordement. */
function applyNowAirPanelText(el, text) {
  if (!el) return;
  const value = String(text ?? '').trim();
  el.classList.remove('hidden');
  if (!value) {
    applyMarquee(el, '');
    el.removeAttribute('title');
    return;
  }
  applyMarquee(el, value);
  el.setAttribute('title', value);
}

/**
 * @param {string} title
 * @param {string} sub
 * @param {{ crossfade?: boolean, panelLabel?: string }} [opts]
 */
function updateNowAirPanel(title, sub, opts = {}) {
  const crossfade = !!opts.crossfade;
  const swapDelayMs = Number.isFinite(opts.swapDelayMs) ? opts.swapDelayMs : NOW_AIR_PANEL_SWAP_MS;
  const panelLabel = opts.panelLabel;
  const onWritten = typeof opts.onWritten === 'function' ? opts.onWritten : null;
  const panel = TUNER_NOWAIR;
  if (!panel) return;

  const write = () => {
    if (panelLabel != null) {
      const labelEl = panel.querySelector('.tuner-nowair-label') || TUNER_NOWAIR_LABEL;
      if (labelEl) labelEl.textContent = panelLabel;
      panel.setAttribute('aria-label', panelLabel);
    }
    applyNowAirPanelText(TUNER_NOWAIR_TITLE, title);
    if (TUNER_NOWAIR_SUB) {
      if (sub) {
        TUNER_NOWAIR_SUB.classList.remove('hidden');
        applyNowAirPanelText(TUNER_NOWAIR_SUB, sub);
      } else {
        TUNER_NOWAIR_SUB.textContent = '';
        TUNER_NOWAIR_SUB.classList.add('hidden');
        TUNER_NOWAIR_SUB.removeAttribute('title');
      }
    }
    onWritten?.();
  };

  const useFade = crossfade && !PREFERS_REDUCED_MOTION?.matches;
  if (!useFade) {
    nowAirFadeGen += 1;
    panel.classList.remove('is-swapping');
    write();
    return;
  }

  // Fondu : fade out → swap contenu → fade in. gen annule les bascules concurrentes.
  const gen = ++nowAirFadeGen;
  panel.classList.add('is-swapping');
  window.setTimeout(() => {
    if (gen !== nowAirFadeGen) return;
    write();
    requestAnimationFrame(() => {
      if (gen !== nowAirFadeGen) return;
      panel.classList.remove('is-swapping');
    });
  }, swapDelayMs);
}

function syncTunerSubRotate(title, sub, empty, crossfade = false, kind = 'idle') {
  if (!TUNER_SUB || !TUNER_SUB_AIR) return;
  const wrapper = TUNER_SUB.parentElement;

  if (isMobileIdleDialPreview()) {
    stopTunerSubRotate();
    wrapper?.classList.remove('is-rotating');
    TUNER_SUB.classList.add('is-active');
    TUNER_SUB_AIR.classList.remove('is-active');
    TUNER_SUB.setAttribute('aria-hidden', 'false');
    TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');
    // Mode B (panel élargi) : L1 = identité poste du carrousel ; L2 = une seule
    // face antenne (pas de soupe poste·label·émission·horaire·campus).
    const preview = nowAirPreviewRadio;
    if (preview) {
      setTunerNameText(compactDialTitleLine(preview), crossfade);
      tunerSubAirText = idleDialStoryLine(preview)
        || formatNowAirSubLine(title, '', empty, kind, { liveLabel: true })
        || 'Radios étudiantes en direct';
    } else {
      setTunerNameText('Syntoniser un poste', crossfade);
      tunerSubAirText = 'Radios étudiantes en direct';
    }
    TUNER_SUB?.parentElement?.classList.toggle('is-empty', !tunerSubAirText);
    applyDialTextCrossfade(TUNER_SUB, tunerSubAirText, crossfade);
    markTunerDialReady();
    return;
  }

  /*
   * Compact + poste sélectionné — mode E (écoute) :
   *  L1 = poste · acronyme
   *  L2 = face primaire (émission) puis filet piste → à venir → horaire
   */
  if (currentStation && isDialCompactLayout()) {
    setTunerNameText(compactDialTitleLine(currentStation), crossfade);
    tunerSubMeta = dialCompactMetaLineForRadio(currentStation);

    const lines = dialPhaseLinesForRadio(currentStation);
    // Une seule phase : rien à faire tourner, on la pose et on s'arrête.
    if (!isTunerSubRotateMode() || lines.length < 2) {
      stopTunerSubRotate();
      wrapper?.classList.remove('is-rotating');
      airPhaseIndex = 0;
      const line = lines[0] || tunerSubMeta;
      tunerSubAirText = line;
      resetDialRotateSlots(null);
      TUNER_SUB?.parentElement?.classList.toggle('is-empty', !line);
      if (crossfade) applyDialTextCrossfade(TUNER_SUB, line, true);
      else applyMarquee(TUNER_SUB, line);
      scheduleMarqueeRefresh();
      markTunerDialReady();
      return;
    }

    wrapper?.classList.add('is-rotating');
    TUNER_SUB?.parentElement?.classList.remove('is-empty');
    // L'index peut dépasser si la liste a rétréci entre deux rendus.
    airPhaseIndex %= lines.length;
    tunerSubAirText = lines[airPhaseIndex];

    if (!tunerSubRotateTimer) {
      airPhaseIndex = 0;
      resetDialRotateSlots(lines[0]);
      scheduleTunerSubRotateTick();
    } else {
      // Rafraîchir la phase visible sans toucher au créneau masqué : le fondu
      // est porté par la bascule de créneau, pas par une réécriture.
      const activeEl = dialRotateSlotB ? TUNER_SUB_AIR : TUNER_SUB;
      applyMarquee(activeEl, lines[airPhaseIndex]);
    }
    scheduleMarqueeRefresh();
    markTunerDialReady();
    return;
  }

  tunerSubAirText = formatNowAirSubLine(title, sub, empty, kind);

  if (!isTunerSubRotateMode()) {
    stopTunerSubRotate();
    TUNER_SUB.classList.add('is-active');
    TUNER_SUB_AIR.classList.remove('is-active');
    TUNER_SUB.setAttribute('aria-hidden', 'false');
    TUNER_SUB_AIR.setAttribute('aria-hidden', 'true');

    if (isDesktopIdleDialCarousel()) {
      return;
    }

    // Compact (site ou embed étroit) : préférer la ligne antenne si dispo.
    const showAirInDialSub = currentStation && (isEmbedNowAirInDial() || (!IS_TUNER_EMBED && TUNER_SUB_ROTATE_MQ?.matches));
    if (showAirInDialSub && tunerSubAirText) {
      applyMarquee(TUNER_SUB, tunerSubAirText);
    } else if (tunerSubMeta) {
      applyMarquee(TUNER_SUB, tunerSubMeta);
    }
    return;
  }

  // Rotation demandée sans poste syntonisé (embed large au repos) : il n'y a
  // pas de liste de phases à faire tourner, on pose la ligne disponible.
  wrapper?.classList.add('is-rotating');
  resetDialRotateSlots(tunerSubAirText || tunerSubMeta);
  scheduleMarqueeRefresh();
}

function onTunerSubRotateLayoutChange() {
  syncTunerShellLayout();
}

/** Repeint le synthé pour la coque courante (wide ↔ bureau ↔ compact). */
function syncTunerShellLayout() {
  ensureWideNowAirPair();
  if (!isWideTunerLayout()) clearWideDialInlineSize();
  lastNowAir = {
    title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null,
  };
  renderTunerNowAir();
  scheduleMarqueeRefresh();
  restartTunerSubRotateTimer();
  if (isNowAirPanelPreviewMode()) {
    scheduleNowAirPreviewTick();
  }
  try { updateVolumeUI(); } catch { /* ignore */ }
  try { syncWideStickyTop(); } catch { /* ignore */ }
}

function initTunerSubRotateListeners() {
  onMediaQueryChange(TUNER_SUB_ROTATE_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_DIAL_PHONE_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_DIAL_MID_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_SUB_ROTATE_NARROW_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_SUB_ROTATE_VERY_NARROW_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(TUNER_EMBED_NOWAIR_HIDDEN_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(WIDE_TUNER_MQ, onTunerSubRotateLayoutChange);
  onMediaQueryChange(PREFERS_REDUCED_MOTION, onTunerSubRotateLayoutChange);
}

function renderTunerNowAir() {
  if (!TUNER_NOWAIR || isTunerPresentationPaused()) return;

  // Wide E : dual « À l'antenne » + « À venir », dial institution/slogan complets.
  if (isWideTunerLayout()) {
    const previewing = isNowAirPanelPreviewMode();
    if (previewing && !nowAirPreviewRadio) pickNowAirPreviewRadio();
    const radio = previewing
      ? (nowAirPreviewRadio || currentStation)
      : currentStation;
    if (previewing && radio && TUNER_SELECT && TUNER_SELECT.value !== radio.id) {
      TUNER_SELECT.value = radio.id;
    }
    paintWideNowAirPair(radio);
    paintWideDial(radio);
    // La voie wide return avant les markTunerDialReady() du chemin compact :
    // sans cet appel le carré reste opacity: 0 (rectangle vide) sur tout
    // écran ≥ 1281 px — accueil, kit média, fiches.
    markTunerDialReady();
    syncWideStickyTop();
    if (previewing) {
      startNowAirPreview();
      if (radio) syncAirPanelRotate(radio);
    } else if (currentStation) {
      stopNowAirPreview();
      syncAirPanelRotate(currentStation);
    } else {
      stopNowAirPreview();
      stopAirPanelRotate();
    }
    if (currentStation && isPlaybackActive()) {
      const { title, sub } = nowAirLines(currentStation);
      updateMediaSession(currentStation, { title, sub });
    }
    lastNowAir = { ...lastNowAir, shell: 'wide' };
    return;
  }

  // Quitter le mode wide : wrappers + largeur inline, sinon la barre casse
  // jusqu’au prochain refresh (resize 1920 → 1280).
  ensureWideNowAirPair();
  clearWideDialInlineSize();
  const wideWrap = document.getElementById('tuner-nowair-wide');
  if (wideWrap) wideWrap.hidden = true;
  TUNER_NOWAIR.classList.remove('tuner-nowair--legacy-slot');
  TUNER_NOWAIR.hidden = false;
  TUNER_NOWAIR.removeAttribute('aria-hidden');
  const instEl = document.getElementById('tuner-now-inst');
  if (instEl) {
    instEl.hidden = true;
    instEl.textContent = '';
  }

  const previewing = isNowAirPanelPreviewMode();
  let title;
  let sub;
  /** @type {'live'|'upcoming'|'idle'} */
  let kind = 'idle';

  if (previewing) {
    if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
    if (nowAirPreviewRadio) {
      ({ title, sub, kind } = formatPreviewNowAir(nowAirPreviewRadio, {
        omitStation: isDesktopIdleDialCarousel(),
      }));
    } else {
      title = 'Syntoniser un poste';
      sub = 'Les radios étudiantes jouent en direct, 24/7';
      kind = 'idle';
    }
  } else if (currentStation) {
    ({ title, sub, kind } = nowAirLines(currentStation));
  } else {
    title = 'Syntoniser un poste';
    sub = 'Les radios étudiantes jouent en direct, 24/7';
    kind = 'idle';
  }

  const empty = !currentStation && !previewing;
  const previewId = previewing ? (nowAirPreviewRadio?.id ?? null) : null;
  if (empty) kind = 'idle';

  const stationId = previewing
    ? (nowAirPreviewRadio?.id ?? null)
    : (currentStation?.id ?? null);

  // Rien n'a changé : on n'écrase pas le DOM.
  const shell = tunerShellLayoutKey();
  if (lastNowAir.title === title
    && lastNowAir.sub === sub
    && lastNowAir.empty === empty
    && lastNowAir.previewId === previewId
    && lastNowAir.kind === kind
    && lastNowAir.stationId === stationId
    && lastNowAir.shell === shell
    && !nowAirCrossfadePending) {
    if (previewing) startNowAirPreview();
    else stopNowAirPreview();
    if (previewing) syncAirPanelRotate(nowAirPreviewRadio);
    else if (currentStation) syncAirPanelRotate(currentStation);
    return;
  }

  const stationChanged = lastNowAir.stationId != null
    && stationId != null
    && lastNowAir.stationId !== stationId;
  const crossfadePreview = previewing
    && !PREFERS_REDUCED_MOTION?.matches
    && lastNowAir.previewId != null
    && previewId !== lastNowAir.previewId;

  // Fondu uniquement : changement de poste ou bascule CHOQ (pas chaque MAJ de piste)
  const shouldFade = nowAirCrossfadePending || stationChanged;
  nowAirCrossfadePending = false;

  lastNowAir = { title, sub, empty, previewId, kind, stationId, shell };

  // Toujours visible sur bureau (placeholder HTML dès le paint).
  TUNER_NOWAIR.classList.remove('hidden');
  TUNER_NOWAIR.removeAttribute('aria-hidden');
  TUNER_NOWAIR.classList.toggle('is-empty', empty);
  // Couleurs live/upcoming appliquées après le swap (pendant le fade out
  // on garde l’ancienne teinte un instant — OK).
  const applyKindClasses = () => {
    TUNER_NOWAIR.classList.toggle('is-live', kind === 'live');
    TUNER_NOWAIR.classList.toggle('is-upcoming', kind === 'upcoming');
    TUNER_NOWAIR.dataset.airKind = kind;
  };
  if (!shouldFade || PREFERS_REDUCED_MOTION?.matches) applyKindClasses();

  const panelLabel = empty ? "À l'antenne" : nowAirPanelLabel(kind);

  updateNowAirPanel(title, sub, {
    crossfade: (shouldFade || crossfadePreview) && !empty,
    // Carrousel au repos : le panneau et le dial décrivent le MÊME poste, mais
    // leurs fondus n'ont pas la même durée (0,3 s contre 0,7 s). En échangeant
    // chacun à son rythme, le panneau annonçait l'émission du poste suivant
    // pendant que le dial nommait encore le précédent. On aligne l'instant de
    // bascule sur le plus lent des deux ; le panneau est déjà invisible depuis
    // longtemps, l'attente ne se voit pas.
    swapDelayMs: crossfadePreview ? NOW_AIR_CROSSFADE_MS : NOW_AIR_PANEL_SWAP_MS,
    panelLabel,
    onWritten: applyKindClasses,
  });

  syncDesktopDialPreview(title, crossfadePreview);
  syncTunerSubRotate(title, sub, empty, crossfadePreview, kind);
  if (currentStation && isPlaybackActive()) {
    updateMediaSession(currentStation, empty ? {} : { title, sub });
  }

  if (currentStation && !previewing) {
    stopNowAirPreview();
    nowAirPreviewRadio = null;
    lastNowAirPreviewId = null;
    lastDialCarouselText = '';
    // Ne pas réécrire le nom ici si selectStation l’a déjà posé (évite double flash)
    if (!isDialCompactLayout()) {
      /* nom déjà posé par selectStation ; re-sync si besoin */
    }
    if (isWideTunerLayout()) {
      paintWideDial(currentStation);
    } else {
      setTunerNameText(
        isDialCompactLayout()
          ? compactDialTitleLine(currentStation)
          : tunerDesktopTitleLine(currentStation),
      );
    }
    syncAirPanelRotate(currentStation);
    markTunerDialReady();
  } else if (previewing) {
    // Garantir un poste d’aperçu avant le 1er paint B (sinon L1 reste le placeholder HTML).
    if (!nowAirPreviewRadio) pickNowAirPreviewRadio();
    startNowAirPreview();
    syncAirPanelRotate(nowAirPreviewRadio);
    // syncTunerSubRotate (mode B) a déjà posé L1/L2 + is-dial-ready.
    if (!isMobileIdleDialPreview()) markTunerDialReady();
  } else {
    stopNowAirPreview();
    stopAirPanelRotate();
    setTunerNameText('Syntoniser un poste');
    markTunerDialReady();
  }
}

/**
 * Horloge interne : ré-évalue l'émission en cours chaque minute pour que
 * l'affichage bascule tout seul au changement d'émission, sans recharger la
 * page. Le garde-fou de renderTunerNowAir évite de relancer le défilement
 * quand l'émission n'a pas changé.
 */
function startNowAirTick() {
  if (nowAirTick) return;
  nowAirTick = setInterval(renderTunerNowAir, 30000);
}

function isTunerPresentationPaused() {
  return tunerPresentationPaused || document.visibilityState === 'hidden';
}

/** Gèle seulement le visuel : ni l'audio, ni Media Session, ni les polls ne sont touchés. */
function pauseTunerPresentation() {
  if (tunerPresentationPaused) return;
  tunerPresentationPaused = true;
  tunerPresentationNeedsRefresh = true;
  tunerPresentationResumeGeneration += 1;
  document.documentElement.classList.add('is-tuner-presentation-paused');
  stopAirPanelRotate();
  stopTunerSubRotate();
  stopNowAirPreview();
  // Annule tout fondu commencé juste avant l'arrière-plan.
  nowAirFadeGen += 1;
}

/**
 * Retour visible : actualiser d'abord les deux sources live, puis seulement
 * ensuite réécrire le synthétiseur à la première phase (« À l’antenne »).
 * Une promesse partagée absorbe visibilitychange + pageshow + focus, qui
 * arrivent généralement ensemble au retour d'un onglet.
 */
function resumeTunerPresentation() {
  if (document.visibilityState === 'hidden' || !tunerPresentationNeedsRefresh) {
    return tunerPresentationResumePromise || Promise.resolve();
  }
  if (tunerPresentationResumePromise) return tunerPresentationResumePromise;

  const generation = ++tunerPresentationResumeGeneration;
  tunerPresentationResumePromise = refreshNowPlayingCache({ render: false })
    .catch(() => { /* la dernière information fiable reste affichable */ })
    .finally(() => {
      tunerPresentationResumePromise = null;
      if (generation !== tunerPresentationResumeGeneration || document.visibilityState === 'hidden') return;
      tunerPresentationPaused = false;
      tunerPresentationNeedsRefresh = false;
      document.documentElement.classList.remove('is-tuner-presentation-paused');
      // Repartir de la phase la plus utile et d'un marquee neuf, jamais d'un
      // timer vieux de plusieurs minutes qui tenterait de combler son retard.
      airPhaseIndex = 0;
      dialRotateSlotB = false;
      nowAirCrossfadePending = false;
      nowAirFadeGen += 1;
      lastNowAir = { title: null, sub: null, empty: null, previewId: null, kind: null, stationId: null, shell: null };
      renderTunerNowAir();
      scheduleMarqueeRefresh();
    });
  return tunerPresentationResumePromise;
}

function initTunerPresentationLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseTunerPresentation();
    else resumeTunerPresentation();
  });
  window.addEventListener('pagehide', pauseTunerPresentation);
  window.addEventListener('pageshow', resumeTunerPresentation);
  window.addEventListener('focus', resumeTunerPresentation);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RETOUR DANS L'APP — fraîcheur du contenu
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Une PWA installée n'est jamais « rechargée » au sens d'un onglet : on la
 * quitte, on y revient, et le même document reprend là où il en était — des
 * jours plus tard sur iOS, qui garde l'app en mémoire. Le fil affiché est alors
 * celui de la dernière ouverture, alors que le bot d'articles publie sept fois
 * par jour.
 *
 * Trois régimes, parce qu'un rechargement dur n'est pas gratuit — il coûte la
 * position de lecture, et couperait la radio :
 *
 *   < 5 min    rien. Basculer vers une autre app deux secondes ne doit rien
 *              coûter, et c'est le cas de loin le plus fréquent.
 *   ≥ 5 min    le fil est rechargé **sur place** : pas de clignotement, pas de
 *              perte de position, et surtout compatible avec une écoute.
 *   ≥ 1 h      tout le document est périmé — météo, sports, fond du mât,
 *              horaires — et un rechargement franc est plus honnête qu'une
 *              page à moitié fraîche. Sauf si la radio joue : cette règle-là ne
 *              se négocie pas (un déploiement coupait l'écoute, voir
 *              `reloadUnlessListening`).
 *
 * Dans tous les cas au-delà de 5 min, on redemande aussi le service worker :
 * une version déployée pendant l'absence sera prise au prochain moment sûr.
 */
const CONTENT_REFRESH_AFTER_MS = 5 * 60 * 1000;
const HARD_RELOAD_AFTER_MS = 60 * 60 * 1000;

let appHiddenAt = 0;

/**
 * Que faire au retour, après `awayMs` d'absence. Logique pure : c'est la règle
 * qu'on veut pouvoir vérifier sans simuler un cycle d'arrière-plan iOS.
 * @returns {'none'|'refresh'|'reload'}
 */
function returnRefreshAction(awayMs, { playing = false } = {}) {
  if (!(awayMs > 0)) return 'none';
  if (awayMs < CONTENT_REFRESH_AFTER_MS) return 'none';
  if (awayMs >= HARD_RELOAD_AFTER_MS && !playing) return 'reload';
  return 'refresh';
}

function noteAppHidden() {
  // Ne pas écraser un départ déjà noté : `pagehide` et `visibilitychange`
  // arrivent ensemble, et c'est le **premier** instant d'absence qui compte.
  if (!appHiddenAt) appHiddenAt = Date.now();
}

function refreshContentOnReturn() {
  if (document.visibilityState === 'hidden') return;
  const hiddenAt = appHiddenAt;
  // Consommé une seule fois : visibilitychange, pageshow et resume arrivent
  // souvent en rafale au retour, et trois rechargements du fil pour un seul
  // retour ne diraient rien de plus.
  appHiddenAt = 0;
  if (!hiddenAt) return;

  const action = returnRefreshAction(Date.now() - hiddenAt, { playing: isPlaybackActive() });
  if (action === 'none') return;

  checkForAppUpdate();
  if (action === 'reload') {
    window.location.reload();
    return;
  }
  loadNews({ silent: true }).catch(() => { /* le fil déjà affiché reste valable */ });
}

/**
 * Surface de test. La règle de retour est de la logique pure : l'exposer
 * permet de vérifier les seuils et la garde « radio en écoute » sans mettre
 * réellement une PWA en arrière-plan pendant une heure.
 */
window.RadarLifecycle = {
  _pure: {
    returnRefreshAction,
    CONTENT_REFRESH_AFTER_MS,
    HARD_RELOAD_AFTER_MS,
  },
};

function initContentFreshnessLifecycle() {
  if (IS_TUNER_EMBED) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') noteAppHidden();
    else refreshContentOnReturn();
  });
  window.addEventListener('pagehide', noteAppHidden);
  // bfcache / retour d'app iOS : le document reprend sans repasser par load.
  window.addEventListener('pageshow', refreshContentOnReturn);
  // Cycle de vie Chrome : un onglet gelé puis réveillé n'émet pas toujours
  // visibilitychange.
  window.addEventListener('freeze', noteAppHidden);
  window.addEventListener('resume', refreshContentOnReturn);
  initPullToRefresh();
}


function isStandaloneDisplay() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
    if (navigator.standalone === true) return true;
  } catch { /* ignore */ }
  return false;
}

/** Pull-to-refresh PWA : fil d’actus le plus récent (soft). */
function initPullToRefresh() {
  if (typeof IS_TUNER_EMBED !== 'undefined' && IS_TUNER_EMBED) return;
  if (!isStandaloneDisplay()) return;
  if (document.documentElement.dataset.pullRefresh === '1') return;
  document.documentElement.dataset.pullRefresh = '1';
  const THRESHOLD = 72;
  const MAX_PULL = 110;
  let startY = 0, pulling = false, armed = false, indicator = null;
  let reducedMotion = false;
  try { reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch {}
  function ensureIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'radar-pull-refresh';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<span class="radar-pull-refresh__dot"></span>';
    document.body.appendChild(indicator);
    return indicator;
  }
  function setPull(px) {
    const el = ensureIndicator();
    const p = Math.min(MAX_PULL, Math.max(0, px));
    el.style.setProperty('--pull', p + 'px');
    el.classList.toggle('is-armed', p >= THRESHOLD);
    el.classList.toggle('is-visible', p > 8);
  }
  function releasePull(trigger) {
    const el = indicator;
    if (!el) return;
    if (trigger) {
      el.classList.add('is-refreshing');
      el.classList.remove('is-armed');
      try { checkForAppUpdate(); } catch {}
      loadNews({ silent: true }).catch(() => {}).finally(() => {
        window.setTimeout(() => {
          el.classList.remove('is-refreshing', 'is-visible');
          el.style.setProperty('--pull', '0px');
        }, reducedMotion ? 120 : 420);
      });
      return;
    }
    el.classList.remove('is-armed', 'is-visible', 'is-refreshing');
    el.style.setProperty('--pull', '0px');
  }
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 2) return;
    startY = e.touches[0].clientY; pulling = true; armed = false;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!pulling || e.touches.length !== 1) return;
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 2) { pulling = false; releasePull(false); return; }
    const dy = e.touches[0].clientY - startY;
    if (dy < 4) return;
    if (dy > 12 && e.cancelable) e.preventDefault();
    setPull(dy * 0.55);
    armed = dy * 0.55 >= THRESHOLD;
  }, { passive: false });
  document.addEventListener('touchend', () => { if (!pulling) return; pulling = false; const go = armed; armed = false; releasePull(go); }, { passive: true });
  document.addEventListener('touchcancel', () => { pulling = false; armed = false; releasePull(false); }, { passive: true });
}

async function refreshNowPlayingCache({ render = true } = {}) {
  if (!nowPlayingRefreshPromise) {
    nowPlayingRefreshPromise = (async () => {
      try {
        radioNowPlaying = decodeNowPlayingPayload(
          await fetch(appAsset('radio-nowplaying.json'), { cache: 'no-store' }).then((r) => r.json()),
        );
      } catch {
        /* Le cache mémoire reste le repli si la collecte échoue. */
      }
      // Re-poll navigateur des APIs CORS signalées par le bot (clientPoll).
      await refreshStationLiveApis();
    })().finally(() => {
      nowPlayingRefreshPromise = null;
    });
  }
  await nowPlayingRefreshPromise;
  if (render && !isTunerPresentationPaused()) renderTunerNowAir();
}

/**
 * Parse une réponse live côté navigateur selon le type d'adaptateur du bot.
 * Types CORS : cism-v1 (émissions), triton-np (piste). Craft/CHOQ /api/live
 * n'a pas de CORS — ne pas l'utiliser ici comme « émission ».
 */
/**
 * « HH:MM » dans le fuseau de la grille, depuis un horodatage Unix (s ou ms)
 * ou une chaîne ISO.
 *
 * CISM n'expose que `datetime` (Unix). Le bot le convertit déjà
 * (`timeFromStamp`, radio-nowplaying-lib.js) ; sans équivalent ici, la sonde
 * navigateur écrasait l'heure calculée par le bot par une chaîne vide — d'où
 * un « À venir » sans heure dès que le poll client passait.
 */
function airClockFromStamp(value) {
  if (value == null || value === '') return '';
  let ms = NaN;
  if (typeof value === 'number' || /^\d{9,}$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    ms = n > 1e12 ? n : n * 1000;
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) {
    ms = Date.parse(String(value));
  } else {
    // Déjà « HH:MM » (ou « HH:MM:SS ») : normaliser sans conversion de fuseau.
    const m = /^(\d{1,2}):(\d{2})/.exec(String(value).trim());
    return m ? `${String(Number(m[1])).padStart(2, '0')}:${m[2]}` : '';
  }
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const tz = radioNowPlaying.timezone || radioSchedules.timezone || 'America/Toronto';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24 || Number.isNaN(hour)) hour = 0;
  const minute = parseInt(map.minute, 10) || 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseClientLivePayload(type, payload) {
  if (!payload) return null;
  if (type === 'cism-v1' || type === 'cism') {
    const cur = payload?.data?.current || payload?.current;
    const up = payload?.data?.upcoming || payload?.data?.next || payload?.upcoming;
    if (!cur?.title) return null;
    const show = (raw) => ({
      title: String(raw.title).trim(),
      host: String(raw.host || '').trim(),
      source: 'api-live',
      slug: String(raw.slug || '').trim(),
      start: airClockFromStamp(raw.datetime ?? raw.starts ?? raw.start),
      end: airClockFromStamp(raw.end ?? raw.ends),
    });
    return {
      current: show(cur),
      next: up?.title ? show(up) : null,
    };
  }
  // CHOQ / Craft /api/live : title+artist = PISTE uniquement
  if (type === 'craft-live' || type === 'craft' || type === 'choq') {
    const live = payload.live || payload;
    const showTitle = String(live?.show || live?.program || live?.emission || '').trim();
    const trackTitle = String(live?.title || live?.name || '').trim();
    const trackArtist = String(live?.artist || '').trim();
    let track = '';
    if (trackTitle && trackArtist && trackTitle.toLowerCase() !== trackArtist.toLowerCase()) {
      track = `${trackArtist} — ${trackTitle}`;
    } else {
      track = trackTitle || trackArtist;
    }
    if (showTitle) {
      return {
        current: {
          title: showTitle,
          host: String(live.host || live.dj || '').trim(),
          source: 'api-live',
        },
        next: null,
        track: track || '',
      };
    }
    if (!track) return null;
    return { current: null, next: null, track };
  }
  // Triton XML (souvent déjà parsé en texte si fetch renvoie xml — voir ci-dessous)
  if (type === 'triton-np' || type === 'triton') {
    return null; // géré dans fetchClientLivePoll (XML)
  }
  return null;
}

function parseTritonNowPlayingXml(xmlText = '') {
  const text = String(xmlText || '');
  if (!text.includes('nowplaying-info')) return null;
  const prop = (name) => {
    const re = new RegExp(
      `name="${name}"\\s*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</property>`,
      'i',
    );
    const m = re.exec(text);
    return m ? String(m[1]).replace(/\s+/g, ' ').trim() : '';
  };
  const title = prop('cue_title') || prop('track_title') || prop('title');
  const artist = prop('track_artist_name') || prop('artist_name') || prop('artist');
  let track = '';
  if (title && artist && title.toLowerCase() !== artist.toLowerCase()) {
    track = `${artist} — ${title}`;
  } else {
    track = title || artist;
  }
  if (!track) return null;
  return { current: null, next: null, track };
}

/**
 * URL de re-poll : passe par le Worker de métadonnées (CORS + cache partagé).
 * Repli direct si le Worker est vide / hors service.
 */
function nowplayingFetchUrl(rawUrl) {
  const safe = safeHttpUrl(rawUrl, { allowHttp: true });
  if (!safe) return null;
  if (!NOWPLAYING_API_BASE) return safe;
  try {
    // Toujours HTTPS côté proxy
    const u = new URL(safe);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return `${NOWPLAYING_API_BASE.replace(/\/+$/, '')}/v1/fetch?url=${encodeURIComponent(u.href)}`;
  } catch {
    return safe;
  }
}

async function fetchClientLivePoll(id, poll) {
  if (!poll?.url) return null;
  const isTriton = poll.type === 'triton-np' || poll.type === 'triton'
    || /tritondigital\.com|nowplaying/i.test(poll.url);
  const accept = isTriton ? 'application/xml, text/xml, */*' : 'application/json';

  async function attempt(url) {
    if (!url) return null;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: accept },
    });
    if (!res.ok) return null;
    // Worker renvoie du JSON d'erreur { error: ... } si upstream KO
    const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
    if (ctype.includes('application/json') && !isTriton) {
      const body = await res.json();
      if (body && body.error) return null;
      return parseClientLivePayload(poll.type, body);
    }
    if (isTriton || ctype.includes('xml') || ctype.includes('text/')) {
      const text = await res.text();
      // Erreur JSON du worker parfois en text/plain
      if (text.trimStart().startsWith('{') && text.includes('"error"')) return null;
      if (isTriton) return parseTritonNowPlayingXml(text);
      try {
        return parseClientLivePayload(poll.type, JSON.parse(text));
      } catch {
        return null;
      }
    }
    return parseClientLivePayload(poll.type, await res.json());
  }

  try {
    // 1) Worker cache + CORS
    let parsed = await attempt(nowplayingFetchUrl(poll.url));
    // 2) Repli direct (si l’API a déjà CORS, ex. certains endpoints)
    if (!parsed && NOWPLAYING_API_BASE) {
      parsed = await attempt(safeHttpUrl(poll.url, { allowHttp: true }));
    }
    if (!parsed) return null;
    if (!parsed.current?.title && !parsed.track) return null;
    return { id, ...parsed, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function refreshStationLiveApis() {
  const stations = radioNowPlaying.stations || {};
  const jobs = Object.entries(stations)
    .filter(([, st]) => st?.clientPoll?.url)
    .map(([id, st]) => fetchClientLivePoll(id, st.clientPoll));
  if (!jobs.length) return;
  const results = await Promise.all(jobs);
  for (const raw of results) {
    if (!raw) continue;
    // Sonde navigateur = API station en direct, donc entités possibles.
    const hit = decodeNowPlayingStation(raw);
    const prev = radioNowPlaying.stations[hit.id] || {};
    const nextCurrent = hit.current?.title ? hit.current : (prev.current || null);
    const nextNext = hit.next?.title ? hit.next : (prev.next || null);
    const nextTrack = hit.track != null && hit.track !== ''
      ? hit.track
      : (prev.track || '');
    // Ne pas écraser une émission valide avec un poll piste-only
    radioNowPlaying.stations[hit.id] = {
      ...prev,
      id: hit.id,
      name: prev.name || radios.find((r) => r.id === hit.id)?.name || hit.id,
      current: nextCurrent,
      next: nextNext,
      track: nextTrack,
      showTitle: nextCurrent?.title || prev.showTitle || '',
      host: nextCurrent?.host || prev.host || '',
      source: nextCurrent?.source || prev.source || 'api-live',
      checkedAt: hit.checkedAt,
    };
  }
}

function syncNowPlayingPoll() {
  if (nowPlayingPollTimer) {
    clearInterval(nowPlayingPollTimer);
    nowPlayingPollTimer = null;
  }
  if (currentStation && getPlayableStream(currentStation) && isPlaybackActive()) {
    // 15 s : aligné sur CHOQ (REFRESHRATE 15s) pour la piste Triton CORS ;
    // le fichier bot reste le filet (émissions / grilles).
    nowPlayingPollTimer = setInterval(refreshNowPlayingCache, 15000);
    refreshNowPlayingCache();
  }
}

function buildTunerOptions() {
  TUNER_SELECT.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Syntoniser un poste…';
  placeholder.disabled = true;
  placeholder.selected = true;
  TUNER_SELECT.appendChild(placeholder);

  const groups = [
    { type: 'universite', label: 'Universités' },
    { type: 'cegep', label: 'Cégeps' },
  ];

  groups.forEach(({ type, label }) => {
    const inGroup = radios.filter((r) => r.type === type);
    if (!inGroup.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    inGroup.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.name} · ${formatInstitutionDisplay(r.institution)}`;
      og.appendChild(opt);
    });
    TUNER_SELECT.appendChild(og);
  });
}

function bindTuner() {
  TUNER_SELECT.addEventListener('change', () => {
    const next = radios.find((r) => r.id === TUNER_SELECT.value);
    selectStation(TUNER_SELECT.value, {
      autoplay: !!getPlayableStream(next),
      openExternal: true,
    });
  });

  TUNER_PREV.addEventListener('click', () => stepStation(-1));
  TUNER_NEXT.addEventListener('click', () => stepStation(1));

  TUNER_PLAY.addEventListener('click', togglePlay);

  const onVolumeInput = (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    // Curseur > 0 annule le mute local ; publier pour que le leader suive.
    setSharedVolume(v, {
      muted: v <= 0.001 ? true : false,
      publish: true,
    });
  };
  TUNER_VOLUME.addEventListener('input', onVolumeInput);
  // change : certains navigateurs ne répètent pas input à la fin du glisser.
  TUNER_VOLUME.addEventListener('change', onVolumeInput);

  initVolumeRangeBounds();
  bindVolumePopover();
  bindVolumePopoverMute();
  bindVolumeSliderLayout();
  bindVolumeSliderDrag();
}

/**
 * Sans Web Audio : range 0–100 %, zone boost et repère 200 % masqués.
 * Avec Web Audio (y compris mobile) : curseur 0–200 % toujours visible.
 */
function initVolumeRangeBounds() {
  if (!TUNER_VOLUME || GAIN_UI_MAX >= MAX_GAIN) return;
  TUNER_VOLUME.max = String(GAIN_UI_MAX);
  TUNER_VOLUME.setAttribute('aria-label', 'Volume — 0 % à gauche, 100 % à droite');
  TUNER_VOL?.classList.add('tuner-vol--no-boost');
}

function bindVolumeSliderLayout() {
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  if (!track || volSliderResizeObs) return;
  const schedule = () => requestAnimationFrame(() => updateVolumeSliderVisual());
  volSliderResizeObs = new ResizeObserver(schedule);
  volSliderResizeObs.observe(track);
  const inner = track.closest('.tuner-inner');
  if (inner) volSliderResizeObs.observe(inner);
  window.addEventListener('resize', schedule, { passive: true });
  onMediaQueryChange(VOL_COMPACT, schedule);
  schedule();
}

// Sous 1100 px, le curseur est masqué : l'icône ouvre une bulle (libère le synthétiseur).
function bindVolumePopover() {
  if (!TUNER_VOL_TOGGLE) return;
  const close = () => {
    if (!TUNER_VOL.classList.contains('is-open')) return;
    TUNER_VOL.classList.remove('is-open');
    TUNER_VOL_TOGGLE.setAttribute('aria-expanded', 'false');
  };

  TUNER_VOL_TOGGLE.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isVolCompactMode()) {
      const open = TUNER_VOL.classList.toggle('is-open');
      TUNER_VOL_TOGGLE.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        requestAnimationFrame(() => {
          updateVolumeSliderVisual();
          requestAnimationFrame(() => updateVolumeSliderVisual());
        });
      }
      return;
    }
    toggleVolumeMute();
  });

  document.addEventListener('click', (e) => {
    if (volumeSliderDragging) return;
    if (!TUNER_VOL.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // En repassant en mode large, on referme proprement la bulle.
  const onVolLayoutChange = (e) => {
    if (!e.matches) close();
    updateVolumeUI();
  };
  onMediaQueryChange(IS_TUNER_EMBED ? EMBED_VOL_POPOVER_MQ : VOL_COMPACT, onVolLayoutChange);
}

function bindVolumePopoverMute() {
  if (!TUNER_VOL_MUTE) return;
  TUNER_VOL_MUTE.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVolumeMute();
  });
}

/** Glissement tactile fiable (le range natif opacity:0 glisse mal au doigt). */
function bindVolumeSliderDrag() {
  const slider = TUNER_VOLUME?.closest('.tuner-vol-slider');
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  if (!slider || !track || !TUNER_VOLUME) return;

  const setGainFromClientX = (clientX) => {
    const rect = slider.getBoundingClientRect();
    const thumbPx = getVolThumbPx(track);
    const travel = Math.max(rect.width - thumbPx, 1);
    const x = Math.min(Math.max(clientX - rect.left - thumbPx / 2, 0), travel);
    const ratio = x / travel;
    const stepped = Math.round(ratio * GAIN_UI_MAX / 0.02) * 0.02;
    const clamped = Math.min(GAIN_UI_MAX, Math.max(0, stepped));
    if (Math.abs(parseFloat(TUNER_VOLUME.value) - clamped) < 0.001) return;
    TUNER_VOLUME.value = String(clamped);
    TUNER_VOLUME.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const endDrag = (e) => {
    if (!volumeSliderDragging) return;
    track.classList.remove('is-dragging');
    try { slider.releasePointerCapture(e.pointerId); } catch (_) {}
    // Retarde la fin pour éviter que le clic document referme la bulle.
    setTimeout(() => { volumeSliderDragging = false; }, 80);
  };

  slider.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    volumeSliderDragging = true;
    track.classList.add('is-dragging');
    slider.setPointerCapture(e.pointerId);
    setGainFromClientX(e.clientX);
  }, { passive: false });

  slider.addEventListener('pointermove', (e) => {
    if (!volumeSliderDragging) return;
    setGainFromClientX(e.clientX);
  });

  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);
}

function getVolThumbPx(track) {
  if (!track) return VOL_THUMB_PX;
  const raw = getComputedStyle(track).getPropertyValue('--vol-thumb').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : VOL_THUMB_PX;
}

function currentIndex() {
  if (!currentStation) return -1;
  return radios.findIndex(r => r.id === currentStation.id);
}

function stepStation(dir) {
  if (!radios.length) return;
  let idx = currentIndex();
  idx = idx === -1 ? (dir > 0 ? 0 : radios.length - 1) : (idx + dir + radios.length) % radios.length;
  const next = radios[idx];
  TUNER_SELECT.value = next.id;
  selectStation(next.id, { autoplay: tunerShouldAutoplayNative(next) });
}

function getMarqueeAvailableWidth(el) {
  if (!el) return 0;
  const style = getComputedStyle(el);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  return Math.max(0, el.clientWidth - padL - padR);
}

function ensureMarqueeObserved(el) {
  if (!marqueeResizeObs || !el || marqueeObservedEls.has(el)) return;
  marqueeObservedEls.add(el);
  marqueeResizeObs.observe(el);
}

function registerFilterMarqueeObservers() {
  if (!NEWS_FILTERS) return;
  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((btn) => {
    ensureMarqueeObserved(btn);
    const inst = btn.querySelector('.filter-btn__inst');
    if (inst) ensureMarqueeObserved(inst);
  });
}

function scheduleFilterMarqueeRefresh() {
  scheduleMarqueeRefresh();
  if (filterMarqueeResyncTimer) clearTimeout(filterMarqueeResyncTimer);
  filterMarqueeResyncTimer = setTimeout(() => {
    filterMarqueeResyncTimer = null;
    scheduleMarqueeRefresh();
  }, FILTER_MARQUEE_RESYNC_MS);
}

function getFilterInstMarqueeElements() {
  return NEWS_FILTERS
    ? [...NEWS_FILTERS.querySelectorAll('.filter-btn__inst')]
    : [];
}

function getMarqueeElements() {
  return [
    TUNER_NAME,
    TUNER_SUB,
    TUNER_SUB_AIR,
    TUNER_NOWAIR_TITLE,
    TUNER_NOWAIR_SUB,
    ...getFilterInstMarqueeElements(),
  ].filter(Boolean);
}

/** Adapte un libellé UI à la langue Radar active (glossaire / MT déjà posé). */
function adaptRadarUiText(text = '') {
  if (window.RadarTranslate?.displayUiText) {
    return RadarTranslate.displayUiText(text);
  }
  return text;
}

function adaptRadarInstitutionLabel(text = '') {
  if (window.RadarTranslate?.displayInstitutionLabel) {
    return RadarTranslate.displayInstitutionLabel(text);
  }
  return text;
}

/** Défilement doux sur le libellé d'institution des pastilles sources. */
function applyFilterInstMarquees() {
  if (!NEWS_FILTERS) return;
  NEWS_FILTERS.querySelectorAll('.filter-btn').forEach((btn) => {
    const instEl = btn.querySelector('.filter-btn__inst');
    if (!instEl) return;
    const src = btn.dataset.source;
    if (src === 'all') {
      // UI — se traduit avec la langue active (ne pas figer le FR)
      applyMarquee(instEl, adaptRadarUiText('Toutes les sources'));
      return;
    }
    const { institution, type } = sourceInfo(src);
    const instLabel = filterSourceInstitutionLabel(institution, type, src);
    // Établissement : localisable hors Original/FR/EN ; médias restent notranslate.
    applyMarquee(instEl, adaptRadarInstitutionLabel(instLabel || ''));
  });
}

function measureMarquee(el) {
  if (!el || PREFERS_REDUCED_MOTION?.matches) return;

  const span = el.querySelector('.tuner-now-sub-text');
  if (!span) return;

  // Wide : texte fixe. Bureau ≥1100 : le titre d’antenne passe sur 2 lignes
  // au lieu de défiler (phrases CHOQ / longues émissions).
  const nowAirWrap = el === TUNER_NOWAIR_TITLE || el === TUNER_NOWAIR_SUB;
  if (isWideNoMarqueeMode() || (nowAirWrap && isNowAirTwoLineMode())) {
    el.classList.remove('is-marquee');
    el.style.removeProperty('--marquee-shift');
    el.style.removeProperty('--marquee-duration');
    el.style.removeProperty('--marquee-delay');
    el.style.removeProperty('--marquee-trips');
    return;
  }

  const available = getMarqueeAvailableWidth(el);
  if (!available) return;

  const overflow = span.scrollWidth - available;
  if (overflow <= 2) {
    el.classList.remove('is-marquee');
    el.style.removeProperty('--marquee-shift');
    el.style.removeProperty('--marquee-duration');
    el.style.removeProperty('--marquee-delay');
    el.style.removeProperty('--marquee-trips');
    return;
  }

  // Arrondi au pixel : `available` dérive d'un padding calculé, souvent
  // fractionnaire. Un décalage à la virgule fait reposer le texte entre deux
  // pixels, et le compositeur le rééchantillonne — c'est flou précisément aux
  // deux extrémités, là où l'animation marque une pause pour qu'on lise.
  const distance = Math.round(overflow + 12);
  const duration = Math.max(7, distance / 16);
  const oneWayMs = duration * 1000;
  let readMs = TUNER_SUB_ROTATE_MS;
  if (TUNER_SUB_ROTATE_MQ?.matches) {
    if (TUNER_SUB_ROTATE_VERY_NARROW_MQ?.matches) readMs = TUNER_SUB_ROTATE_VERY_NARROW_MS;
    else if (TUNER_SUB_ROTATE_NARROW_MQ?.matches) readMs = TUNER_SUB_ROTATE_NARROW_MS;
  }
  const trips = marqueeAlternateCount(oneWayMs, readMs);
  el.style.setProperty('--marquee-shift', `-${distance}px`);
  el.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
  el.style.setProperty('--marquee-delay', `${(MARQUEE_READ_DELAY_MS / 1000).toFixed(1)}s`);
  el.style.setProperty('--marquee-trips', String(trips));
  el.classList.add('is-marquee');
}

/** Mesure après layout (double rAF) ; réessaie si la largeur n'est pas encore stable. */
function scheduleMarqueeMeasure(el, attempt = 0) {
  if (!el || attempt > 4) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const span = el.querySelector('.tuner-now-sub-text');
      if (!span || PREFERS_REDUCED_MOTION?.matches) return;

      const available = getMarqueeAvailableWidth(el);
      if (!available) {
        scheduleMarqueeMeasure(el, attempt + 1);
        return;
      }

      measureMarquee(el);

      const overflow = span.scrollWidth - available;
      const shouldMarquee = overflow > 2;
      const hasMarquee = el.classList.contains('is-marquee');
      if (attempt < 4 && shouldMarquee !== hasMarquee) {
        scheduleMarqueeMeasure(el, attempt + 1);
      }
    });
  });
}

function refreshAllMarquees() {
  marqueeResizeScheduled = false;
  getMarqueeElements().forEach((el) => {
    const text = marqueeTextByEl.get(el);
    if (text == null) return;
    if (PREFERS_REDUCED_MOTION?.matches) return;
    if (!el.querySelector('.tuner-now-sub-text')) {
      applyMarquee(el, text);
      return;
    }
    scheduleMarqueeMeasure(el);
  });
}

function scheduleMarqueeRefresh() {
  if (marqueeResizeScheduled) return;
  marqueeResizeScheduled = true;
  requestAnimationFrame(refreshAllMarquees);
}

function initMarqueeResizeListeners() {
  if (marqueeResizeObs || typeof ResizeObserver === 'undefined') return;

  marqueeResizeObs = new ResizeObserver(scheduleMarqueeRefresh);

  const observeTargets = new Set(getMarqueeElements());
  [
    TUNER_SUB?.parentElement,
    TUNER_SUB?.closest('.tuner-now'),
    TUNER_SUB?.closest('.tuner-dial'),
    TUNER?.querySelector('.tuner-inner'),
    TUNER_NOWAIR,
    TUNER_NOWAIR?.querySelector('.tuner-nowair-body'),
    NEWS_FILTERS,
    FILTERS_PANEL,
  ].forEach((el) => { if (el) observeTargets.add(el); });

  observeTargets.forEach((el) => ensureMarqueeObserved(el));
  registerFilterMarqueeObservers();

  NEWS_FILTERS?.addEventListener('transitionend', (e) => {
    const t = e.target;
    if (t?.classList?.contains('filter-btn') && e.propertyName === 'flex-basis') {
      scheduleFilterMarqueeRefresh();
    }
  });

  FILTERS_PANEL?.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-height') scheduleFilterMarqueeRefresh();
  });

  window.addEventListener('resize', scheduleMarqueeRefresh, { passive: true });
  onMediaQueryChange(PREFERS_REDUCED_MOTION, () => {
    getMarqueeElements().forEach((el) => {
      const text = marqueeTextByEl.get(el);
      if (text != null) applyMarquee(el, text);
    });
  });
}

/**
 * Affiche un texte sur une seule ligne et, s'il dépasse de son conteneur,
 * l'anime en défilement doux droite → gauche (sinon ellipsis). Réutilisé par
 * le sous-titre du syntoniseur et par le module « À l'antenne ».
 */
function applyMarquee(el, text) {
  if (!el) return;
  const value = String(text ?? '').trim();
  el.classList.remove('is-marquee');
  el.style.removeProperty('--marquee-shift');
  el.style.removeProperty('--marquee-duration');
  el.style.removeProperty('--marquee-delay');
  el.style.removeProperty('--marquee-trips');

  if (!value) {
    marqueeTextByEl.delete(el);
    el.replaceChildren();
    return;
  }

  marqueeTextByEl.set(el, value);

  if (PREFERS_REDUCED_MOTION?.matches) {
    el.textContent = value;
    return;
  }

  const span = document.createElement('span');
  span.className = 'tuner-now-sub-text';
  span.textContent = value;
  el.replaceChildren(span);

  scheduleMarqueeMeasure(el);
}

function setTunerNameText(text, crossfade = false) {
  if (!TUNER_NAME) return;
  if (!crossfade || PREFERS_REDUCED_MOTION?.matches) {
    applyMarquee(TUNER_NAME, text);
    return;
  }
  TUNER_NAME.classList.add('is-crossfading');
  setTimeout(() => {
    applyMarquee(TUNER_NAME, text);
    requestAnimationFrame(() => TUNER_NAME.classList.remove('is-crossfading'));
  }, NOW_AIR_CROSSFADE_MS);
}

/** Sous-titre du syntoniseur (fréquence · institution au complet). */
function setTunerSubText(text) {
  tunerSubMeta = text;
  applyMarquee(TUNER_SUB, text);
}

function selectStation(id, { autoplay = false, openExternal = false, fromSync = false } = {}) {
  const radio = radios.find(r => r.id === id);
  if (!radio) return;

  const prevId = currentStation?.id || null;
  currentStation = radio;
  if (!fromSync) userPickedStation = true;
  // Garder la liste déroulante alignée (hydratation multi-onglets, prev/next, deep-link).
  if (TUNER_SELECT && TUNER_SELECT.value !== radio.id) {
    TUNER_SELECT.value = radio.id;
  }

  // Changement de poste : repartir de la phase 1 (émission en cours) + fondu
  // antenne, sinon le nouveau poste hérite de l'index du précédent.
  stopAirPanelRotate();
  stopTunerSubRotate();
  airPhaseIndex = 0;
  dialRotateSlotB = false;
  if (prevId !== radio.id) {
    cancelLoudnessProbe();
    nowAirCrossfadePending = true;
  }

  const playable = getPlayableStream(radio);
  const external = isExternalListen(radio);

  if (isDialCompactLayout()) {
    // Mobile / embed étroit : L1 = poste · acronyme ; L2 = première phase
    // (l'émission en cours), que renderTunerNowAir() enchaîne juste après.
    setTunerNameText(compactDialTitleLine(radio));
    tunerSubMeta = dialCompactMetaLineForRadio(radio);
    const firstLine = dialPhaseLinesForRadio(radio)[0] || tunerSubMeta;
    TUNER_SUB?.parentElement?.classList.toggle('is-empty', !firstLine);
    resetDialRotateSlots(firstLine);
  } else if (isWideTunerLayout()) {
    // Wide E : institution complète + poste + slogan complet (pas d’acronyme).
    paintWideDial(radio);
  } else {
    // Bureau (+ embed large) : L1 = poste FM · acronyme ; L2 = slogan
    setTunerNameText(tunerDesktopTitleLine(radio));
    setTunerSubText(tunerDesktopSubLine(radio, { external }));
  }

  // Mettre à jour l’antenne tout de suite (avant play async / métadonnées)
  renderTunerNowAir();

  TUNER_PLAY.disabled = !playable && !external;
  TUNER_PLAY.title = playable
    ? 'Écouter'
    : external
      ? 'Écouter sur le site du poste (fenêtre externe)'
      : 'Flux direct indisponible';

  updateMediaSession(radio);

  if (!playable) {
    window.RadarCast?.endSession?.();
    stopPlayback({ keepStation: true });
    updatePlayUI();
    if (external && openExternal) openListenWindow(radio);
    return;
  }

  window.RadarCast?.onStationChange?.();

  if (autoplay) {
    // Autre onglet possède déjà le flux : publier le nouveau poste pour que
    // le leader bascule, sans voler l’audio (sinon silence côté « lecteur
    // principal » et double claim fragiles).
    if (!fromSync && isRemoteSessionActive()) {
      try {
        window.RadarPlayerSync?.publishStation?.(radio.id);
      } catch { /* */ }
      syncRemotePlaying = true;
      updatePlayUI();
    } else {
      play(radio);
    }
  } else {
    updatePlayUI();
  }

  // Keep shared station id in sync when the user picks a post (not remote apply).
  if (!fromSync && !window.RadarPlayerSync?.isApplyingRemote?.()) {
    try {
      const s = window.RadarPlayerSync?.readState?.();
      // En session distante, publishStation (ci-dessus) a déjà posé le stationId.
      if (!s?.playing) {
        window.RadarPlayerSync?.writeState?.({
          stationId: radio.id,
          playing: false,
          volume: currentGain,
          muted: volumeMuted,
          leaderId: window.RadarPlayerSync.getTabId(),
        });
      }
    } catch { /* */ }
  }
}

function togglePlay() {
  if (isNowAirPanelPreviewMode() && nowAirPreviewRadio) {
    selectStation(nowAirPreviewRadio.id, {
      autoplay: !isExternalListen(nowAirPreviewRadio),
      openExternal: isExternalListen(nowAirPreviewRadio),
    });
    return;
  }
  if (!currentStation) {
    const first = radios.find(r => getPlayableStream(r)) || radios[0];
    if (!first) return;
    TUNER_SELECT.value = first.id;
    selectStation(first.id, { autoplay: !isExternalListen(first), openExternal: isExternalListen(first) });
    return;
  }
  if (isExternalListen(currentStation)) {
    openListenWindow(currentStation);
    return;
  }
  // Pendant la connexion, un second appui annule nettement la tentative.
  if (isBuffering) {
    stopPlayback({ keepStation: true });
    return;
  }
  // Cast actif : pause/reprise distante (ne pas relancer le flux local en double).
  if (window.RadarCast?.isChromecasting?.()) {
    if (window.RadarCast.isRemotePlaying?.()) {
      pauseByUser();
    } else {
      userPaused = false;
      window.RadarCast.resumeRemote?.();
      mobilePlayback?.onPlayStart();
      updatePlayUI();
    }
    return;
  }
  // Another tab owns audio: ▶/⏸ control the shared session.
  // Only treat as global pause when a *live* peer was confirmed — otherwise a
  // ghost localStorage session would swallow the first click as "pause".
  if (syncRemotePlaying && !window.RadarPlayerSync?.isLeader?.()) {
    if (isPlaying() || isCasting()) {
      pauseByUser();
    } else if (remoteLeaderConfirmed) {
      pauseByUser();
    } else {
      userPaused = false;
      play(currentStation);
    }
    return;
  }
  if (isPlaybackActive()) {
    pauseByUser();
  } else {
    userPaused = false;
    play(currentStation);
  }
}

async function play(radio) {
  const url = getPlayableStream(radio);
  if (!url) return;
  userPaused = false;
  syncRemotePlaying = false;
  remoteLeaderConfirmed = false;

  // Claim leadership first so other same-origin players mute immediately.
  try {
    window.RadarPlayerSync?.claimPlay?.(radio.id, currentGain, volumeMuted);
  } catch { /* */ }

  // Reprise Cast plutôt que double lecture locale + distante.
  if (window.RadarCast?.isChromecasting?.()) {
    window.RadarCast.resumeRemote?.();
    mobilePlayback?.onPlayStart();
    updatePlayUI();
    return;
  }

  // Branche (ou non) le graphe d'amplification selon le gain demandé et le poste.
  const tuning = STATION_PLAYBACK[radio.id] || {};
  syncBoostWiring({ station: radio, allowUnwire: true });
  reconnectTries = 0;
  mobilePlayback?.resetReconnectTries();
  audio.preload = mobilePlayback?.getMobilePreload(!!tuning.resilient)
    ?? (tuning.resilient ? 'auto' : 'none');
  try {
    if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch {} }
    if (audio.src !== url) audio.src = url;
    setBuffering(true);
    updatePlayUI();
    syncMediaSessionPlaybackState();
    syncMediaSessionLivePosition();
    await audio.play();
    mobilePlayback?.onPlayStart();
    syncMediaSessionPlaybackState();
    applyGain();
    armPlayerSession();
    updatePlayUI();
    try {
      window.RadarPlayerSync?.claimPlay?.(radio.id, currentGain, volumeMuted);
    } catch { /* */ }
  } catch {
    // Autoplay / gesture refusée : l’UI play reste inactive ; pas de toast (bruit inutile).
    setBuffering(false);
    updatePlayUI();
  }
}

function stopPlayback({ keepStation = false } = {}) {
  reconnectTries = 0;
  cancelLoudnessProbe();
  userPaused = false;
  setBuffering(false);
  mobilePlayback?.onPlayStop();
  window.RadarCast?.endSession?.();
  if (audio) {
    suppressAudioError = true;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    suppressAudioError = false;
  }
  if (!keepStation) currentStation = null;
  updatePlayUI();
}

function isPlaying() {
  return audio && !audio.paused && !!audio.src;
}

function isCasting() {
  return !!window.RadarCast?.isCasting?.();
}

function isPlaybackActive() {
  // Cast en pause distante : session active mais pas « en lecture ».
  if (window.RadarCast?.isChromecasting?.()) {
    return !!window.RadarCast.isRemotePlaying?.();
  }
  // Follower tab: show as playing only when another *live* context owns the stream.
  // Ghost sessions (localStorage playing, dead leader) must not look active.
  if (syncRemotePlaying && !isPlaying()) return remoteLeaderConfirmed;
  return isPlaying() || isCasting();
}

function updatePlayUI() {
  const active = isPlaybackActive();
  const audible = active && !isBuffering;
  const external = !!currentStation && isExternalListen(currentStation);
  ICO_PLAY.classList.toggle('hidden', audible || external || isBuffering);
  ICO_PAUSE.classList.toggle('hidden', !audible || isBuffering);
  ICO_EXTERNAL?.classList.toggle('hidden', !external || audible || isBuffering);
  TUNER_PLAY.classList.toggle('is-buffering', isBuffering);
  TUNER_PLAY.classList.toggle('is-external', external && !audible && !isBuffering);
  TUNER.classList.toggle('is-playing', audible);
  syncSeoSchedulePlayback();
  TUNER.classList.toggle('is-buffering', isBuffering);
  TUNER.classList.toggle('is-external', external && !audible && !isBuffering);
  if (isBuffering) {
    TUNER_PLAY.title = 'Connexion au flux — appuyer pour annuler';
    TUNER_PLAY.setAttribute('aria-label', 'Connexion au flux — appuyer pour annuler');
  } else {
    const actionLabel = audible ? 'Mettre en pause' : (external ? 'Écouter sur le site du poste' : 'Écouter');
    TUNER_PLAY.title = actionLabel;
    TUNER_PLAY.setAttribute('aria-label', actionLabel);
  }
  // État observable pour tests et shell (indépendant du timing de la classe CSS).
  document.documentElement.dataset.radarBuffering = isBuffering ? '1' : '0';
  // Signal for nav-shell (Phase 2b): local stream actually playing on this page.
  if (isPlaying()) {
    document.documentElement.dataset.radarPlaying = '1';
  } else if (!syncRemotePlaying) {
    disarmPlayerSessionPlayingFlag();
  } else {
    document.documentElement.dataset.radarPlaying = '0';
  }
  renderTunerNowAir();
  syncNowPlayingPoll();
  syncMediaSessionPlaybackState();
  window.RadarCast?.updateButton?.();
}

/**
 * Faut-il brancher le graphe Web Audio (gain > 1 possible) ?
 * - Bureau : oui dès que Web Audio existe (CORS testé au premier play).
 * - Mobile : seulement si le curseur dépasse 100 % — évite de forcer
 *   crossOrigin + AudioContext pour une écoute « normale », tout en
 *   permettant le 200 % sur téléphone / tablette quand l'utilisateur le demande.
 */
function wantsAudioBoost() {
  if (!webAudioSupported) return false;
  // iOS : audio.volume est en lecture seule — l'atténuation (< 100 %) doit
  // aussi passer par le gain Web Audio, sinon le curseur n'a aucun effet.
  if (IS_IOS) return Math.abs(currentGain - 1) > 0.001;
  if (MOBILE_PLAYBACK) return currentGain > 1.001;
  return true;
}

/**
 * Aligne le graphe d'amplification sur le gain / poste courants.
 * Sur mobile, une fois branché on évite de démonter juste parce que le gain
 * redescend ≤ 100 % (rebuild de l'<audio> = perte de session Android).
 */
function syncBoostWiring({ station = currentStation, allowUnwire = false } = {}) {
  if (!station) return;
  const tuning = STATION_PLAYBACK[station.id] || {};
  const wantBoost = wantsAudioBoost()
    && !boostUnavailable.has(station.id)
    && !tuning.noBoost;

  if (wantBoost === boostWired) return;
  // Garder le graphe si on est déjà amplifié et que le démontage n'est pas
  // explicitement autorisé (changement de poste / play()).
  if (boostWired && !wantBoost && !allowUnwire) return;

  const wasPlaying = !!(audio && !audio.paused && audio.src);
  const url = (audio && audio.src)
    || getPlayableStream(station)
    || '';

  rebuildAudio(wantBoost);

  if (!url || !audio) return;
  try {
    if (audio.src !== url) audio.src = url;
    if (wasPlaying) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch {}
}

function getPlayerElement() {
  let el = document.getElementById('radar-player');
  if (!el) {
    el = document.createElement('audio');
    el.id = 'radar-player';
    el.preload = 'none';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    // Android / Chrome : session longue durée (radio live), pas de téléchargement.
    el.setAttribute('x-webkit-airplay', 'allow');
    try { el.disableRemotePlayback = false; } catch {}
    el.controls = false;
    el.classList.add('sr-only');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

function pauseForCast() {
  if (!audio) return;
  mobilePlayback?.stopKeepalive();
  suppressAudioError = true;
  try { audio.pause(); } catch {}
  suppressAudioError = false;
  updatePlayUI();
}

function pauseByUser() {
  userPaused = true;
  setBuffering(false);
  syncRemotePlaying = false;
  remoteLeaderConfirmed = false;
  // Cast : pause distante (ou fin de session si le LIVE ne gère pas pause).
  // Ne pas appeler endSession ici — le bouton Cast sert à arrêter la diffusion.
  if (window.RadarCast?.isChromecasting?.()) {
    window.RadarCast.pauseRemote?.();
  }
  mobilePlayback?.onUserPause();
  if (audio) {
    suppressAudioError = true;
    try { audio.pause(); } catch {}
    suppressAudioError = false;
  }
  try {
    window.RadarPlayerSync?.publishPause?.(currentStation?.id, currentGain, volumeMuted);
  } catch { /* */ }
  updatePlayUI();
}

function syncMediaSessionPlaybackState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = isPlaybackActive() ? 'playing' : 'paused';
}

function syncMediaSessionLivePosition() {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Number.POSITIVE_INFINITY,
      playbackRate: 1,
      position: 0,
    });
  } catch {}
}

function initMobilePlayback() {
  if (mobilePlayback || !window.RadarMobilePlayback) return;
  mobilePlayback = RadarMobilePlayback.create({
    getPlayer: () => audio,
    getStation: () => currentStation,
    isUserPaused: () => userPaused,
    isPlaying,
    isExternalListen,
    isCasting,
    isStationResilient: () => !!currentTuning().resilient,
    playStation: play,
    getStreamUrl: getPlayableStream,
    syncMediaSession: () => {
      syncMediaSessionPlaybackState();
      syncMediaSessionLivePosition();
    },
    ensureNativePlayback: () => {
      // Ne plus démonter le graphe d'amplification ici : rebuildAudio() recréait
      // l'<audio>, tuait la Media Session Android et coupait le 200 %.
      // On se contente de relancer l'AudioContext si besoin.
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    },
    resumeAudioCtx: () => {
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    },
    performReconnect: () => mobilePlayback?.attemptReconnect(),
    setSuppressErrors: (v) => { suppressAudioError = v; },
    // Une seule invitation discrète si Android refuse le play() sans geste
    // (pas de spam : le contrôleur mobile gate déjà « une fois / session »).
    onPlayBlocked: () => {
      try {
        const en = window.RadarTranslate?.getMode?.() === 'en';
        showToast(en
          ? 'Tap ▶ to resume the radio (browser paused background audio).'
          : 'Touchez ▶ pour relancer la radio (le navigateur a suspendu l’audio).');
      } catch {
        showToast('Touchez ▶ pour relancer la radio.');
      }
    },
    // Après longue absence : flux rechargé pour coller au live (évite le
    // « rattrapage » décalé du buffer périmé).
    onLiveResync: () => {
      try {
        const en = window.RadarTranslate?.getMode?.() === 'en';
        showToast(en
          ? 'Back on the live stream (synced after background pause).'
          : 'Retour au direct (flux resynchronisé après pause en arrière-plan).');
      } catch {
        showToast('Retour au direct — flux resynchronisé.');
      }
    },
  });
  mobilePlayback.setupLifecycle();
}

// ─── Audio engine ──────────────────────────────────────────────────────────────
function attachAudioListeners(el) {
  if (playerListenersAttached.has(el)) return;
  playerListenersAttached.add(el);
  const enterBuffering = () => {
    // Ces événements ne proviennent d'un <audio> que lorsqu'un flux est en
    // cours de préparation; `currentStation` couvre aussi l'instant où le
    // navigateur normalise l'URL de src.
    if (!userPaused && !syncRemotePlaying && (el.src || currentStation)) {
      setBuffering(true);
      updatePlayUI();
    }
  };
  el.addEventListener('loadstart', enterBuffering);
  el.addEventListener('waiting', enterBuffering);
  el.addEventListener('stalled', enterBuffering);
  el.addEventListener('play',    updatePlayUI);
  el.addEventListener('pause',   () => {
    setBuffering(false);
    updatePlayUI();
  });
  el.addEventListener('ended',   onAudioEnded);
  el.addEventListener('playing', onAudioPlaying);
  el.addEventListener('error',   onAudioError);
  mobilePlayback?.attachToPlayer(el);
}

function currentTuning() {
  return (currentStation && STATION_PLAYBACK[currentStation.id]) || {};
}

function onAudioPlaying() {
  reconnectTries = 0;
  setBuffering(false);
  scheduleLoudnessProbe();
  mobilePlayback?.onPlaying();
  updatePlayUI();
}

function onAudioEnded() {
  setBuffering(false);
  if (mobilePlayback?.shouldHandleEnded() && mobilePlayback.attemptReconnect()) return;
  updatePlayUI();
}

function reconnectResilient() {
  // Reconnexion silencieuse — les toasts « flux instable » étaient des faux positifs.
  mobilePlayback?.attemptReconnect();
  updatePlayUI();
}

function onAudioError() {
  setBuffering(false);
  if (suppressAudioError) { updatePlayUI(); return; }
  // Poste résilient qui jouait déjà : coupure réseau → reconnexion douce
  // (currentTime > 0 distingue une vraie coupure d'un échec CORS au démarrage).
  if (mobilePlayback?.shouldHandleError(audio?.currentTime ?? 0)) {
    reconnectResilient();
    return;
  }
  // En mode amplifié, un flux sans en-tête CORS fait échouer l'élément <audio>
  // « anonymous ». On le note et on retombe une fois en lecture native simple.
  if (boostWired && currentStation && !boostUnavailable.has(currentStation.id)) {
    boostUnavailable.add(currentStation.id);
    if (currentGain > 1.001) {
      showToast('Amplification indisponible pour ce poste — volume plafonné à 100 %.');
    } else if (IS_IOS && currentGain < 0.999) {
      // Sans Web Audio, iOS ignore audio.volume : le niveau reste à 100 %.
      showToast('Volume non réglable pour ce poste sur iPhone/iPad — utilise les boutons physiques.');
    }
    rebuildAudio(false);
    play(currentStation);
    return;
  }
  // Erreur audio : UI mise à jour sans toast — le flux reprend souvent tout seul.
  updatePlayUI();
}

/** Niveau correctif propre à un poste (1 = aucun changement). */
function stationTrim(station = currentStation) {
  if (!station?.id) return 1;
  const value = stationTrims.get(station.id);
  return Number.isFinite(value) ? Math.min(1, Math.max(0.55, value)) : 1;
}

function saveStationTrims() {
  try {
    localStorage.setItem(STATION_TRIMS_KEY, JSON.stringify(Object.fromEntries(stationTrims)));
  } catch { /* stockage indisponible : le réglage reste valable pour la session */ }
}

function loadStationTrims() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATION_TRIMS_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return;
    Object.entries(saved).forEach(([id, value]) => {
      if (Number.isFinite(value) && value >= 0.55 && value <= 1) stationTrims.set(id, value);
    });
  } catch { /* valeur ancienne/corrompue : ignorer */ }
}

function cancelLoudnessProbe() {
  if (loudnessProbeTimer) clearInterval(loudnessProbeTimer);
  loudnessProbeTimer = null;
  loudnessProbeStationId = null;
}

function averageRmsDb(samples) {
  if (!samples.length) return null;
  const meanSquare = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
  return meanSquare > 0 ? 10 * Math.log10(meanSquare) : null;
}

/**
 * Mesure courte, une seule fois par poste et par session de lecture.
 * On ne fait jamais d'AGC qui pompe : un flux vraiment fort reçoit seulement
 * une réduction durable. Les flux CORS incompatibles restent en lecture native.
 */
function scheduleLoudnessProbe() {
  cancelLoudnessProbe();
  if (!boostWired || !analyserNode || !currentStation?.id || !audio || audio.paused) return;

  const stationId = currentStation.id;
  const values = [];
  const buffer = new Float32Array(analyserNode.fftSize);
  let ticks = 0;
  loudnessProbeStationId = stationId;
  loudnessProbeTimer = setInterval(() => {
    if (!audio || audio.paused || currentStation?.id !== stationId || !analyserNode) {
      cancelLoudnessProbe();
      return;
    }
    analyserNode.getFloatTimeDomainData(buffer);
    let squareSum = 0;
    for (let i = 0; i < buffer.length; i += 1) squareSum += buffer[i] * buffer[i];
    values.push(squareSum / buffer.length);
    ticks += 1;
    // Ne garder qu'une courte fenêtre, après que le flux se soit stabilisé.
    if (ticks < 18) return;
    cancelLoudnessProbe();

    const db = averageRmsDb(values);
    if (!Number.isFinite(db)) return;
    // -16 dBFS et plus fort est déjà très dense. La réduction est graduelle,
    // plafonnée à 45 %, et seulement vers le bas pour respecter l'intention.
    const target = db > -11 ? 0.68 : db > -16 ? 0.80 : db > -20 ? 0.90 : 1;
    const existing = stationTrim(currentStation);
    if (target < existing - 0.015) {
      stationTrims.set(stationId, target);
      saveStationTrims();
      applyGain({ smooth: true });
    }
  }, 350);
}

/** Branche un graphe Web Audio (analyse → limiteur → gain → sortie). */
function wireBoost() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { webAudioSupported = false; return false; }
  try {
    if (!audio) return false;
    audio.crossOrigin = 'anonymous';
    audioCtx = audioCtx || new Ctx();
    mediaSource = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    compressorNode = audioCtx.createDynamicsCompressor();
    // Limiteur léger des crêtes : aucune "remontée" automatique des passages calmes.
    compressorNode.threshold.setValueAtTime(-10, audioCtx.currentTime);
    compressorNode.knee.setValueAtTime(2, audioCtx.currentTime);
    compressorNode.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressorNode.release.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode = audioCtx.createGain();
    mediaSource.connect(analyserNode).connect(compressorNode).connect(gainNode).connect(audioCtx.destination);
    const resumeIfNeeded = () => {
      if (audioCtx && audioCtx.state === 'suspended' && isPlaying() && !userPaused) {
        audioCtx.resume().catch(() => {});
      }
    };
    audioCtx.onstatechange = resumeIfNeeded;
    // Mobile : l'AudioContext est souvent suspendu en arrière-plan — on reprend
    // dès que la page redevient visible pour que le 200 % continue de sonner.
    if (!boostCtxLifecycleBound) {
      boostCtxLifecycleBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resumeIfNeeded();
      });
      window.addEventListener('pageshow', resumeIfNeeded);
      window.addEventListener('focus', resumeIfNeeded);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    boostWired = true;
  } catch {
    boostWired = false;
  }
  return boostWired;
}

/** Recrée l'élément <audio>, avec ou sans graphe d'amplification. */
function rebuildAudio(withBoost) {
  cancelLoudnessProbe();
  if (audio) {
    suppressAudioError = true;
    try { audio.pause(); } catch {}
    suppressAudioError = false;
    // createMediaElementSource est à usage unique — on remplace l'élément au changement de mode.
    if (boostWired || withBoost || mediaSource) {
      audio.remove();
      audio = null;
    } else {
      audio.removeAttribute('src');
      audio.removeAttribute('crossorigin');
      try { audio.load(); } catch {}
    }
  }
  audio = getPlayerElement();
  audio.preload = 'none';
  if (!withBoost) audio.removeAttribute('crossorigin');
  attachAudioListeners(audio);
  // Élément recréé : re-brancher les écouteurs AirPlay (sinon le bouton cast
  // perd la détection de disponibilité après un passage par le mode amplifié).
  window.RadarCast?.attachPlayer?.(audio);
  mediaSource = null;
  gainNode = null;
  compressorNode = null;
  analyserNode = null;
  boostWired = false;
  if (withBoost) wireBoost();
  applyGain();
}

/**
 * Applique gain + mute localement et, si demandé, publie aux autres onglets.
 * Le leader possède le vrai <audio> : sans cette publication, un suiveur
 * (fiche SEO, second onglet) ne changeait que son curseur.
 */
function setSharedVolume(gain, { muted, publish = false } = {}) {
  if (Number.isFinite(gain)) {
    currentGain = Math.min(GAIN_UI_MAX, Math.max(0, gain));
  }
  if (muted !== undefined) {
    if (muted) {
      gainBeforeMute = currentGain > 0.001 ? currentGain : (gainBeforeMute || DEFAULT_GAIN);
      volumeMuted = true;
    } else {
      volumeMuted = false;
      if (currentGain <= 0.001 && gainBeforeMute > 0.001) {
        currentGain = gainBeforeMute;
      }
    }
  } else if (currentGain > 0.001 && volumeMuted) {
    volumeMuted = false;
  }

  if (TUNER_VOLUME) TUNER_VOLUME.value = String(currentGain);
  try {
    localStorage.setItem('radar-player-vol', String(currentGain));
    localStorage.setItem(VOLUME_MUTE_KEY, volumeMuted ? '1' : '0');
  } catch { /* private mode */ }

  // Franchir 100 % côté suiveur doit aussi brancher le graphe sur le leader.
  syncBoostWiring();
  applyGain();
  updateVolumeUI();
  updateVolumeSliderVisual();

  if (publish) {
    try {
      window.RadarPlayerSync?.publishVolume?.(currentGain, volumeMuted);
    } catch { /* */ }
  }
}

/** Applique volume/mute reçus d’un autre contexte (BroadcastChannel / storage). */
function applyRemoteVolumeState(state) {
  if (!state) return;
  const hasVol = Number.isFinite(state.volume);
  const hasMute = state.muted !== undefined && state.muted !== null;
  if (!hasVol && !hasMute) return;

  const nextGain = hasVol ? state.volume : currentGain;
  const nextMuted = hasMute ? !!state.muted : volumeMuted;
  const gainChanged = hasVol && Math.abs(nextGain - currentGain) > 0.005;
  const muteChanged = hasMute && nextMuted !== volumeMuted;
  if (!gainChanged && !muteChanged) return;

  setSharedVolume(nextGain, { muted: nextMuted, publish: false });
}

function setVolumeMuted(muted, { publish = true } = {}) {
  setSharedVolume(currentGain, { muted: !!muted, publish });
}

function toggleVolumeMute() {
  setVolumeMuted(!volumeMuted, { publish: true });
}

function updateVolumeSliderVisual() {
  const track = TUNER_VOLUME?.closest('.tuner-vol-track');
  const slider = track?.querySelector('.tuner-vol-slider');
  if (!track || !slider) return;

  const width = slider.getBoundingClientRect().width || slider.clientWidth || track.clientWidth;
  if (width < 1) return;

  const thumbPx = getVolThumbPx(track);
  const travel = width - thumbPx;
  const xMin = thumbPx / 2;
  const xMid = xMin + travel * 0.5;
  const xMax = xMin + travel;
  const gain = volumeMuted ? 0 : currentGain;
  const ratio = Math.min(Math.max(gain / GAIN_UI_MAX, 0), 1);
  const xThumb = xMin + travel * ratio;

  track.style.setProperty('--vol-x', `${xThumb}px`);
  track.style.setProperty('--vol-x-min', `${xMin}px`);
  track.style.setProperty('--vol-x-mid', `${xMid}px`);
  track.style.setProperty('--vol-x-max', `${xMax}px`);
  track.style.setProperty('--vol-ratio', String(ratio));
  if (GAIN_UI_MAX >= MAX_GAIN) {
    // Deux zones : remplissage bleu 0–100 %, orange 100–200 %.
    track.style.setProperty('--vol-base', `${Math.min(ratio / 0.5, 1) * 100}%`);
    track.style.setProperty('--vol-boost', `${Math.max((ratio - 0.5) / 0.5, 0) * 100}%`);
  } else {
    // Sans amplification : une seule zone pleine largeur.
    track.style.setProperty('--vol-base', `${ratio * 100}%`);
    track.style.setProperty('--vol-boost', '0%');
  }
  track.classList.toggle('is-boost', gain > 1.001);
}

function syncVolumeMuteButton(btn, { pressed = false, icon = 'toggle' } = {}) {
  if (!btn) return;
  const icoVol = btn.querySelector('.ico-vol');
  const icoMute = btn.querySelector('.ico-vol-mute');
  if (icon === 'mute') {
    icoVol?.classList.add('hidden');
    icoMute?.classList.remove('hidden');
  } else if (icon === 'vol') {
    icoVol?.classList.remove('hidden');
    icoMute?.classList.add('hidden');
  } else {
    icoVol?.classList.toggle('hidden', volumeMuted);
    icoMute?.classList.toggle('hidden', !volumeMuted);
  }
  if (pressed) {
    btn.setAttribute('aria-pressed', String(volumeMuted));
    btn.setAttribute(
      'aria-label',
      volumeMuted ? 'Réactiver le son' : 'Couper le son',
    );
    btn.title = volumeMuted ? 'Réactiver le son' : 'Couper le son';
  }
}

function updateVolumeUI() {
  TUNER_VOL?.classList.toggle('is-muted', volumeMuted);
  const compact = isVolCompactMode();
  syncVolumeMuteButton(TUNER_VOL_MUTE, { pressed: true, icon: 'mute' });
  syncVolumeMuteButton(TUNER_VOL_TOGGLE, {
    pressed: !compact,
    icon: compact ? 'vol' : 'toggle',
  });
  if (TUNER_VOL_TOGGLE) {
    if (compact) {
      TUNER_VOL_TOGGLE.removeAttribute('aria-pressed');
      TUNER_VOL_TOGGLE.setAttribute('aria-label', 'Réglages du volume');
      TUNER_VOL_TOGGLE.title = 'Réglages du volume';
    } else {
      TUNER_VOL_TOGGLE.setAttribute(
        'aria-label',
        volumeMuted ? 'Réactiver le son' : 'Couper le son',
      );
      TUNER_VOL_TOGGLE.title = volumeMuted
        ? 'Réactiver le son'
        : 'Couper le son — curseur à droite pour amplifier les flux faibles';
    }
  }
  if (TUNER_VOLUME) {
    const pct = volumeMuted ? 0 : Math.round(currentGain * 100);
    TUNER_VOLUME.setAttribute('aria-valuetext', volumeMuted ? 'Muet' : `${pct} %`);
  }
  updateVolumeSliderVisual();
}

function isOutputSilent() {
  return volumeMuted || currentGain <= 0.001;
}

/** Applique le curseur maître et l'éventuelle correction prudente du poste. */
function applyGain({ smooth = false } = {}) {
  const effective = volumeMuted ? 0 : currentGain * stationTrim();
  const silent = isOutputSilent();

  if (audio) {
    if (boostWired && gainNode) {
      audio.volume = 1;
      try {
        if (audioCtx && smooth) {
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setTargetAtTime(effective, audioCtx.currentTime, 0.35);
        } else if (audioCtx) {
          gainNode.gain.setValueAtTime(effective, audioCtx.currentTime);
        }
        else gainNode.gain.value = effective;
      } catch {
        try { gainNode.gain.value = effective; } catch {}
      }
      // L'élément peut encore fuiter hors du graphe Web Audio (embed iframe, etc.).
      audio.muted = silent;
    } else {
      audio.muted = silent;
      audio.volume = silent ? 0 : Math.min(1, effective);
    }
  }

  // Keepalive mobile (WAV / oscillateur) : arrêt quand muet ou 0 %.
  if (silent) mobilePlayback?.stopKeepalive();
  else if (isPlaybackActive() && !userPaused) mobilePlayback?.startKeepalive();

  TUNER.classList.toggle('is-boosted', !silent && currentGain > 1.001);
  updateVolumeUI();
}

function setupAudio() {
  if (audio) return;
  initMobilePlayback();
  audio = getPlayerElement();
  audio.preload = 'none';
  attachAudioListeners(audio);

  if ('mediaSession' in navigator) {
    // Les handlers Media Session sont privilégiés par Android pour relancer
    // l'audio depuis l'écran de verrouillage / la notification média.
    // On les ré-enregistre aussi après une longue pause (certaines OEM les
    // perdent) via rebindMediaSessionActions si besoin.
    const onMsPlay = () => {
      userPaused = false;
      mobilePlayback?.onPlayStart();
      if (window.RadarCast?.isChromecasting?.()) {
        window.RadarCast.resumeRemote?.();
        updatePlayUI();
        return;
      }
      if (currentStation) {
        if (audio?.src && audio.paused) {
          audio.play().catch(() => play(currentStation));
        } else {
          play(currentStation);
        }
      }
      syncMediaSessionPlaybackState();
      syncMediaSessionLivePosition();
    };
    const onMsPause = () => pauseByUser();
    const onMsStop = () => {
      userPaused = true;
      window.RadarCast?.endSession?.();
      mobilePlayback?.onUserPause();
      if (audio) {
        suppressAudioError = true;
        try { audio.pause(); } catch {}
        suppressAudioError = false;
      }
      updatePlayUI();
    };
    const bindMs = () => {
      try {
        navigator.mediaSession.setActionHandler('play', onMsPlay);
        navigator.mediaSession.setActionHandler('pause', onMsPause);
        navigator.mediaSession.setActionHandler('stop', onMsStop);
        navigator.mediaSession.setActionHandler('previoustrack', () => stepStation(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => stepStation(1));
        try { navigator.mediaSession.setActionHandler('seekto', null); } catch {}
      } catch { /* Media Session indisponible */ }
    };
    bindMs();
    // Re-lier au retour visible (Deep Doze / OEM) pour que ▶ du lockscreen
    // fonctionne encore après une longue absence.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentStation && !userPaused) {
        bindMs();
        syncMediaSessionPlaybackState();
        syncMediaSessionLivePosition();
      }
    });
  }

  window.RadarCast?.init?.({
    getPlayer: () => audio,
    getStation: () => currentStation,
    getStreamUrl: getPlayableStream,
    isExternal: isExternalListen,
    isPlaying,
    isUserPaused: () => userPaused,
    playStation: play,
    pauseLocal: pauseForCast,
    assetUrl,
    formatInstitution: formatInstitutionDisplay,
    getNowAirMeta: (radio) => {
      if (!radio || radio.id !== currentStation?.id) return {};
      if (lastNowAir.title) {
        return { title: lastNowAir.title, sub: lastNowAir.sub || '' };
      }
      return {};
    },
    buildMediaSessionMeta: buildStationMediaMeta,
    showToast,
    onCastStateChange: updatePlayUI,
  });
}

function assetUrl(path) {
  try {
    return new URL(String(path).replace(/^\.\//, ''), window.location.href).href;
  } catch {
    return path;
  }
}

/** Métadonnées lock screen / notification : émission en titre, poste en artiste. */
function buildStationMediaMeta(radio, { title, sub } = {}) {
  const stationLine = formatStationNowAirLabel(radio);
  const airTitle = String(title || '').trim();
  const airSub = String(sub || '').trim();
  const genericListen = `Vous écoutez ${radio.name}`;
  const hasShow = airTitle && airTitle !== genericListen;

  if (hasShow) {
    return {
      title: airTitle,
      artist: stationLine,
      album: airSub || tunerInstitutionLabel(radio.institution) || 'Le Radar',
    };
  }

  return {
    title: radio.fullName || radio.name,
    artist: tunerInstitutionLabel(radio.institution),
    album: airSub || radioSlogan(radio) || 'Le Radar',
  };
}

function updateMediaSession(radio, { title, sub } = {}) {
  if (!('mediaSession' in navigator)) return;
  const meta = buildStationMediaMeta(radio, { title, sub });
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    artwork: [
      { src: assetUrl('assets/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: assetUrl('assets/icon-512.png'), sizes: '512x512', type: 'image/png' },
    ],
  });
}

function restoreVolume() {
  loadStationTrims();
  const raw = localStorage.getItem('radar-player-vol');
  const saved = parseFloat(raw ?? String(DEFAULT_GAIN));
  // Migration douce : 72 % était l'ancien défaut automatique. On ne touche
  // jamais aux personnes qui avaient déjà choisi une autre valeur.
  const oldDefault = localStorage.getItem(VOLUME_PREF_VERSION_KEY) !== VOLUME_PREF_VERSION
    && (raw === null || Math.abs(saved - 0.72) < 0.005 || Math.abs(saved - 1) < 0.005);
  if (oldDefault) localStorage.setItem('radar-player-vol', String(DEFAULT_GAIN));
  try { localStorage.setItem(VOLUME_PREF_VERSION_KEY, VOLUME_PREF_VERSION); } catch {}
  currentGain = oldDefault
    ? DEFAULT_GAIN
    : (Number.isFinite(saved) ? Math.min(GAIN_UI_MAX, Math.max(0, saved)) : DEFAULT_GAIN);
  gainBeforeMute = currentGain > 0.001 ? currentGain : (gainBeforeMute || DEFAULT_GAIN);
  if (TUNER_VOLUME) TUNER_VOLUME.value = String(currentGain);
  // Mute mémorisé (clé dédiée). La session multi-onglets peut encore
  // surcharger juste après via applyRemoteVolumeState(boot).
  let savedMuted = false;
  try { savedMuted = localStorage.getItem(VOLUME_MUTE_KEY) === '1'; } catch { /* */ }
  volumeMuted = savedMuted;
  applyGain();
  updateVolumeUI();
  updateVolumeSliderVisual();
}


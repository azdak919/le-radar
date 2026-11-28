// Fonctions pures du déclencheur (testées par tests/news-trigger.mjs).
export function newestFeedDate(xml = '', lastModified = null) {
  const dates = [];
  for (const m of String(xml).matchAll(/<(pubDate|updated|published|dc:date)>([^<]+)<\/\1>/g)) {
    const t = Date.parse(m[2].trim());
    if (t) dates.push(t);
  }
  if (lastModified && Date.parse(lastModified)) dates.push(Date.parse(lastModified));
  return dates.length ? Math.max(...dates) : null;
}

export function decide({ now, newsUpdated, active, feedDates = [], maxAgeMin = 60 }) {
  const ageMin = Math.floor((now - newsUpdated) / 60000);
  if (active > 0) return { dispatch: false, reason: `collecte déjà en cours/en file (${active})`, ageMin };
  const fresh = feedDates.filter((t) => t > newsUpdated && t <= now + 5 * 60000).length;
  if (fresh > 0) return { dispatch: true, reason: `${fresh} flux avec du nouveau`, ageMin };
  if (ageMin >= maxAgeMin) return { dispatch: true, reason: `dernière collecte il y a ${ageMin} min`, ageMin };
  return { dispatch: false, reason: 'rien de neuf', ageMin };
}

// Créneaux sociaux (America/Toronto) = DAILY_SLOTS de scripts/social/lib.mjs.
export const SOCIAL_SLOTS = ['08:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '19:00', '21:00'];
/** Vrai si un créneau est passé depuis 0 à windowMin minutes (heure de Toronto). */
export function slotsDue(now, { windowMin = 35, tz = 'America/Toronto', slots = SOCIAL_SLOTS } = {}) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  const m = +p.hour * 60 + +p.minute;
  return slots.some(s => { const [h, mm] = s.split(':').map(Number); const d = m - (h * 60 + mm); return d >= 0 && d < windowMin; });
}

/** SOCIAL_WORKFLOW : un ou plusieurs workflows séparés par des virgules (ex. Bluesky, Tumblr). */
export const socialWorkflows = v => [...new Set(String(v || '').split(',').map(s => s.trim()).filter(Boolean))];

/** Passages sociaux : chaque :05/:35 de 7 h à 23 h 59 (Toronto) ; le bot décide selon ses fenêtres. */
export function socialHours(now, tz = 'America/Toronto') {
  const h = +new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now);
  return h >= 7;
}

/** Minutes depuis minuit, heure de Toronto. */
export function torontoMinutes(now, tz = 'America/Toronto') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}

/**
 * Fenêtre où un cron GitHub sauté mérite un rattrapage.
 * une / revue : matin 7 h 30–10 h 30, soir 19 h–22 h 30 ; revue aussi 23 h–23 h 59.
 * buffer : soir 21 h–22 h 30 et nuit 3 h–7 h.
 * story : 7 h–19 h 30 ; revue-social : 7 h–13 h 30 et 19 h–22 h 30.
 */
export function backupDue(now, kind) {
  const m = torontoMinutes(now);
  const inWin = (a, b) => m >= a && m <= b;
  if (kind === 'une') return inWin(7 * 60 + 30, 10 * 60 + 30) || inWin(19 * 60, 22 * 60 + 30);
  if (kind === 'revue') return inWin(6 * 60 + 45, 10 * 60 + 30) || inWin(19 * 60, 22 * 60 + 30) || inWin(23 * 60, 23 * 60 + 59);
  if (kind === 'buffer') return inWin(21 * 60, 22 * 60 + 30) || inWin(3 * 60, 7 * 60);
  // Stories sport (préparées dès 7 h, programmées pour 9 h et 15 h ; TikTok 16 h) et revue sur les réseaux.
  if (kind === 'story') return inWin(7 * 60, 19 * 60 + 30);
  if (kind === 'revue-social') return inWin(7 * 60, 13 * 60 + 30) || inWin(19 * 60, 22 * 60 + 30);
  return false;
}

/** Vrai si aucune passe n'est en cours et que la dernière date de plus de maxAgeMin. */
export function backupStale({ lastCreated, lastStatus, now, maxAgeMin }) {
  if (lastStatus && lastStatus !== 'completed') return false;
  if (!lastCreated) return true;
  const t = Date.parse(lastCreated);
  if (!Number.isFinite(t)) return true;
  return (now - t) / 60000 >= maxAgeMin;
}

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

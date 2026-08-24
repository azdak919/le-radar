'use strict';

/**
 * Horaire du bot d'actualités.
 *
 * Fréquence calée sur les heures de publication des articles du fil
 * (America/Toronto) : presque rien 0 h–6 h ; masse 7 h–21 h, pics 8 h et 16 h.
 * Huit passages **toutes les 2 h de 7 h à 21 h** Québec — pas 5 h 30 (créneau
 * mort) ni un 16 h pile (on raterait le pic 16 h–17 h).
 *
 * GitHub retarde souvent 20–40 min et le fetch prend ~10 min : on déclenche
 * CRON_LEAD_MINUTES *avant* l'heure affichée.
 *
 * UTC = Québec EDT (UTC−4) en été ; en EST les créneaux glissent d'une heure.
 */

// Heure affichée, en horloge UTC d'été.
const TARGET_PASSES_UTC = [
  [1, 0],   // 21:00 QC
  [11, 0],  // 07:00 QC
  [13, 0],  // 09:00 QC
  [15, 0],  // 11:00 QC
  [17, 0],  // 13:00 QC
  [19, 0],  // 15:00 QC
  [21, 0],  // 17:00 QC
  [23, 0],  // 19:00 QC
];

const CRON_LEAD_MINUTES = 35;
const CRON_LEAD_MS = CRON_LEAD_MINUTES * 60 * 1000;

// Après l'heure affichée : encore coller le créneau (retard GitHub).
const SCHEDULE_TOLERANCE_MINUTES = 75;
const SCHEDULE_TOLERANCE_MS = SCHEDULE_TOLERANCE_MINUTES * 60 * 1000;

const SAFETY_NET_CRON = '20 * * * *';

function fireTimeFor(slot) {
  return new Date(slot.getTime() - CRON_LEAD_MS);
}

function eachTargetSlot(now, dayOffsets = [0, -1, 1]) {
  const slots = [];
  for (const dayOffset of dayOffsets) {
    for (const [hour, minute] of TARGET_PASSES_UTC) {
      slots.push(new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + dayOffset,
        hour,
        minute,
      )));
    }
  }
  return slots;
}

/**
 * ISO du créneau affiché correspondant à cette exécution, ou null hors horaire
 * (filet :20, manuel, passe trop tardive).
 */
function scheduledSlotFor(now = new Date()) {
  const t = now instanceof Date ? now : new Date(now);
  const candidates = [];
  for (const slot of eachTargetSlot(t)) {
    const start = slot.getTime() - CRON_LEAD_MS;
    const end = slot.getTime() + SCHEDULE_TOLERANCE_MS;
    if (t.getTime() >= start && t.getTime() <= end) candidates.push(slot);
  }
  if (!candidates.length) return null;
  // Le départ réel est plus proche du cron (slot − lead) que de l'heure affichée.
  candidates.sort((a, b) => {
    const da = Math.abs(t.getTime() - fireTimeFor(a).getTime());
    const db = Math.abs(t.getTime() - fireTimeFor(b).getTime());
    return da - db;
  });
  return candidates[0].toISOString();
}

function primaryFireUtc() {
  return TARGET_PASSES_UTC.map(([hour, minute]) => {
    let minutes = hour * 60 + minute - CRON_LEAD_MINUTES;
    if (minutes < 0) minutes += 24 * 60;
    return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
  });
}

module.exports = {
  TARGET_PASSES_UTC,
  CRON_LEAD_MINUTES,
  SCHEDULE_TOLERANCE_MINUTES,
  SAFETY_NET_CRON,
  scheduledSlotFor,
  primaryFireUtc,
};

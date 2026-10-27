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

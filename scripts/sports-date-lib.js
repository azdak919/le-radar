/* Published civil dates: the same pure formatter in SSR and the browser.
 * Date-only values never pass through the host timezone. Unknown hours stay unknown.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadarSportsDate = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const TZ = 'America/Toronto';
  const civilFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const formats = Object.fromEntries(['en', 'fr'].map(lang => [lang, {
    short: new Intl.DateTimeFormat(`${lang}-CA`, { timeZone: 'UTC', day: 'numeric', month: 'short' }),
    full: new Intl.DateTimeFormat(`${lang}-CA`, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }]));

  // Callers supply now explicitly, so build-time and hydration use the same policy.
  function civilNow(now) {
    const parts = Object.fromEntries(civilFormatter.formatToParts(new Date(now)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function dateValue(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
    const value = new Date(date + 'T00:00:00Z');
    return Number.isFinite(+value) && value.toISOString().slice(0, 10) === date ? value : null;
  }

  function clockValue(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match || +match[1] > 23 || +match[2] > 59) return null;
    return {
      hour: +match[1], minute: +match[2], minutes: +match[1] * 60 + (+match[2]),
      canonical: match[1].padStart(2, '0') + ':' + match[2]
    };
  }

  function format(date, time, lang, now) {
    const en = String(lang).startsWith('en');
    const value = dateValue(date);
    if (!value) return { day: '', year: '', clock: '', datetime: '', accessible: '', canonicalTime: '' };
    const today = civilNow(now);
    const delta = (+value - (+dateValue(today))) / DAY;
    const parsedClock = clockValue(time);
    const relative = en
      ? { 0: 'Today', 1: 'Tomorrow', '-1': 'Yesterday' }
      : { 0: 'Aujourd’hui', 1: 'Demain', '-1': 'Hier' };
    const formatter = formats[en ? 'en' : 'fr'];
    const day = relative[delta] || formatter.short.format(value);
    const year = date.slice(0, 4) !== today.slice(0, 4) ? date.slice(0, 4) : '';
    let clock = '';
    if (parsedClock) {
      const { hour, minute } = parsedClock;
      const minutes = minute ? String(minute).padStart(2, '0') : '';
      clock = en
        ? `${hour % 12 || 12}${minutes ? ':' + minutes : ''} ${hour < 12 ? 'AM' : 'PM'}`
        : `${hour}h${minutes}`;
    }
    const full = formatter.full.format(value);
    const accessible = full + (parsedClock
      ? (en ? `, ${clock}, Toronto time` : ` à ${parsedClock.hour} h ${String(parsedClock.minute).padStart(2, '0')}, heure de Toronto`)
      : '');
    // A local civil datetime preserves the published clock, including DST ambiguity.
    // Do not invent a UTC offset or a default noon/midnight when no hour is supplied.
    return {
      day, year, clock, accessible,
      datetime: date + (parsedClock ? 'T' + parsedClock.canonical : ''),
      canonicalTime: parsedClock?.canonical || ''
    };
  }

  function compare(a, b, descending = false) {
    const direction = descending ? -1 : 1;
    const day = String(a.date || '').localeCompare(String(b.date || ''));
    if (day) return day * direction;
    const ac = clockValue(a.time);
    const bc = clockValue(b.time);
    // Unknown hours sort last in both directions, never as an invented zero.
    if (!ac || !bc) return ac ? -1 : bc ? 1 : 0;
    return (ac.minutes - bc.minutes) * direction;
  }

  return { format, compare, clockValue, civilNow };
});

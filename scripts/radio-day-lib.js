/* Local-clock weekly schedules: no guessed durations and no remote code execution. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarDay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function moment(date = new Date()) {
    const p = Object.fromEntries(clock.formatToParts(date).map(x => [x.type, x.value]));
    const iso = `${p.year}-${p.month}-${p.day}`;
    return { iso, day: new Date(`${iso}T12:00:00Z`).getUTCDay(), minute: Number(p.hour) * 60 + Number(p.minute) };
  }
  function minute(value) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!m || Number(m[2]) > 59 || Number(m[1]) > 24 || (Number(m[1]) === 24 && Number(m[2]))) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function time(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
  function weekDates(weekOf, date = new Date()) {
    const now = moment(date);
    let start = /^\d{4}-\d{2}-\d{2}$/.test(weekOf || '') ? new Date(`${weekOf}T12:00:00Z`) : new Date(`${now.iso}T12:00:00Z`);
    if (!Number.isFinite(start.getTime())) start = new Date(`${now.iso}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
      return { iso: d.toISOString().slice(0, 10), day: d.getUTCDay() };
    });
  }
  // Connected overlap groups share lanes; never discard a published alternation.
  function lanes(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);
    const result = []; let group = []; let through = -1;
    function flush() {
      const ends = [];
      for (const b of group) {
        let lane = ends.findIndex(end => end <= b.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = b.end; b.lane = lane;
      }
      for (const b of group) result.push({ ...b, laneCount: ends.length });
      group = []; through = -1;
    }
    for (const b of sorted) {
      if (b.start >= through) flush();
      group.push({ ...b }); through = Math.max(through, b.end);
    }
    flush(); return result;
  }
  function segments(grid, day) {
    const blocks = []; const unknown = [];
    if (!Number.isInteger(day) || day < 0 || day > 6) return { blocks, unknown };
    (Array.isArray(grid) ? grid : []).forEach((slot, index) => {
      if (!slot || !slot.title || !Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) return;
      const start = minute(slot.start), end = minute(slot.end);
      if (start == null || start >= 1440) return;
      if (end == null || end === start || slot.endUnknown || slot.endInferred) {
        if (slot.day === day) unknown.push({ slot, index });
        return;
      }
      const overnight = end <= start;
      if (slot.day === day) blocks.push({ slot, index, start, end: overnight ? 1440 : end, fromPrevious: false });
      if (overnight && end > 0 && (slot.day + 1) % 7 === day) blocks.push({ slot, index, start: 0, end, fromPrevious: true });
    });
    return { blocks: lanes(blocks.filter(b => b.end > b.start)), unknown };
  }
  return { moment, minute, time, weekDates, segments, lanes };
});

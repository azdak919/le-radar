/* Progressive enhancement for /horaires/ only. Uses the existing JSON and audio player. */
(function () {
  'use strict';
  const root = document.querySelector('[data-radio-day-view]');
  if (!root || !window.RadarDay) return;
  const L = window.RadarDay;
  const en = document.documentElement.lang.startsWith('en');
  const locale = en ? 'en-CA' : 'fr-CA';
  const text = en ? {
    loading: 'Loading the shared schedule…', fail: 'The shared schedule could not load. The station schedules above remain available.',
    day: 'Day', previous: 'Previous day', next: 'Next day', today: 'Today', now: 'Current time',
    region: 'Daily comparison, six stations. Scroll vertically for times and horizontally for stations.',
    station: 'Station to show', swipe: 'Scroll horizontally to compare the six stations →', hours: 'Time', week: 'Week', list: 'Also view as a list', empty: 'No published time slot for this day.',
    unknown: 'End time not published', previousNight: 'Continues from the previous day',
    close: 'Close', listen: 'Listen live to', unavailable: 'The live player is not ready. Use the radio bar above.',
    programme: 'Programme page', source: 'Station source', live: 'Live audio is the station’s current broadcast, not a replay of this slot.',
    overlap: 'The source publishes overlapping slots; both are preserved.',
    checked: 'Source checked', retained: 'Retained grid from', detail: 'Details', weekOf: 'Week of', timezone: 'Québec time (America/Toronto)',
  } : {
    loading: 'Chargement de la grille commune…', fail: 'La grille commune n’a pas pu charger. Les horaires par station restent disponibles ci-dessus.',
    day: 'Journée', previous: 'Jour précédent', next: 'Jour suivant', today: 'Aujourd’hui', now: 'Heure actuelle',
    region: 'Comparaison journalière des six radios. Défiler verticalement pour les heures et horizontalement pour les stations.',
    station: 'Station à afficher', swipe: 'Défilez horizontalement pour comparer les six radios →', hours: 'Heure', week: 'Semaine', list: 'Voir aussi en liste', empty: 'Aucun créneau publié pour ce jour.',
    unknown: 'Fin non publiée', previousNight: 'Suite de la veille',
    close: 'Fermer', listen: 'Écouter en direct', unavailable: 'Le lecteur n’est pas encore prêt. Utilisez la barre radio ci-dessus.',
    programme: 'Fiche de l’émission', source: 'Source de la station', live: 'Le direct joue ce qui est diffusé maintenant, pas une rediffusion de ce créneau.',
    overlap: 'La source publie des créneaux qui se chevauchent ; ils sont conservés.',
    checked: 'Source vérifiée', retained: 'Grille conservée du', detail: 'Détails', weekOf: 'Semaine du', timezone: 'Heures du Québec (America/Toronto)',
  };
  const stations = JSON.parse(root.querySelector('[data-day-stations]').textContent);
  const px = 1.6; // One civil-clock hour = 96 px, including the two DST transition days.
  const palette = ['#876227', '#17656c', '#815278', '#385f91', '#994d3b', '#496f3a'];
  const base = new URL('.', document.currentScript.src);
  let payload, dates, selected = L.moment().day, followToday = true, lastToday = L.moment().iso;
  let scroll, board, axis, models, opener;
  const el = (tag, cls, value) => {
    const node = document.createElement(tag); if (cls) node.className = cls;
    if (value != null) node.textContent = value; return node;
  };
  const button = (label, cls) => { const b = el('button', cls, label); b.type = 'button'; return b; };
  const dateLabel = iso => new Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00Z`));
  const range = b => `${b.slot.start}–${b.slot.end && !b.slot.endUnknown && !b.slot.endInferred && b.slot.end !== b.slot.start ? b.slot.end : '?'}`;
  const describe = (station, b) => `${station.name} · ${range(b)} · ${b.slot.title}${b.fromPrevious ? ` · ${text.previousNight}` : ''}`;
  const safeLink = (value, label) => {
    try {
      const url = new URL(value); if (!/^https?:$/.test(url.protocol)) return null;
      const a = el('a', '', label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    } catch { return null; }
  };
  const status = root.querySelector('[data-day-status]');
  const ui = root.querySelector('[data-day-ui]');
  const toolbar = el('div', 'radio-day-toolbar');
  const label = el('label', 'radio-day-label', text.day); label.htmlFor = 'radio-day-select';
  const select = el('select'); select.id = 'radio-day-select'; label.append(select);
  const prev = button('←', 'radio-day-nav'); prev.setAttribute('aria-label', text.previous);
  const next = button('→', 'radio-day-nav'); next.setAttribute('aria-label', text.next);
  const today = button(text.today, 'radio-day-today');
  const jump = button(text.now, 'radio-day-jump');
  const heading = el('p', 'radio-day-date'); heading.setAttribute('aria-live', 'polite');
  toolbar.append(prev, label, next, today, jump);
  const stationLabel = el('label', 'radio-day-label radio-day-station-picker', text.station);
  stationLabel.htmlFor = 'radio-day-station';
  const stationSelect = el('select'); stationSelect.id = 'radio-day-station';
  stations.forEach((station, i) => { const option = el('option', '', station.name); option.value = String(i); stationSelect.append(option); });
  stationLabel.append(stationSelect); toolbar.append(stationLabel);
  const swipe = el('p', 'radio-day-swipe', text.swipe);
  const dialog = el('dialog', 'radio-day-dialog'); dialog.setAttribute('aria-labelledby', 'radio-day-detail-title');
  dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  document.body.append(dialog);
  function showDetail(station, b, trigger) {
    opener = trigger; dialog.replaceChildren();
    const close = button(text.close, 'radio-day-close'); close.autofocus = true;
    close.addEventListener('click', () => dialog.close());
    const h = el('h2', '', b.slot.title); h.id = 'radio-day-detail-title';
    const sourceStation = payload.stations?.[station.id] || {};
    const sourceDate = L.weekDates(sourceStation.verifiedWeekOf || dates[0].iso).find(d => d.day === selected).iso;
    const meta = el('p', '', `${station.name} · ${dateLabel(sourceDate)} · ${range(b)}`);
    dialog.append(close, h, meta);
    if (sourceStation.checkedAt && Number.isFinite(Date.parse(sourceStation.checkedAt))) {
      const checked = new Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sourceStation.checkedAt));
      dialog.append(el('p', 'seo-note', `${text.checked} · ${checked} (Toronto)`));
    }
    if (b.fromPrevious) dialog.append(el('p', '', text.previousNight));
    if (b.laneCount > 1) dialog.append(el('p', '', text.overlap));
    if (!b.slot.end || b.slot.endUnknown || b.slot.endInferred) dialog.append(el('p', '', text.unknown));
    const listen = button(`${text.listen} ${station.name}`, 'radio-day-listen');
    const feedback = el('p'); feedback.setAttribute('role', 'status');
    listen.addEventListener('click', () => {
      if (typeof selectStation === 'function' && typeof radios !== 'undefined' && radios.some(r => r.id === station.id)) {
        selectStation(station.id, { autoplay: true, openExternal: false });
        dialog.close();
      } else feedback.textContent = text.unavailable;
    });
    dialog.append(listen, el('p', 'seo-note', text.live), feedback);
    const links = el('p', 'radio-day-links');
    const programme = safeLink(b.slot.url, text.programme); if (programme) links.append(programme);
    const used = String(payload.stations?.[station.id]?.sources?.[0] || '').replace(/^[^:]+:(?=https?:\/\/)/, '');
    const source = safeLink(used, text.source); if (source) links.append(source);
    dialog.append(links); dialog.showModal();
  }
  function makeSlotButton(station, b, cls) {
    const bttn = button('', cls); bttn.setAttribute('aria-label', `${describe(station, b)} · ${text.detail}`);
    bttn.addEventListener('click', () => showDetail(station, b, bttn)); return bttn;
  }
  function updateNow() {
    if (!board) return;
    const now = L.moment();
    const isToday = dates.find(d => d.day === selected)?.iso === now.iso;
    jump.disabled = !isToday;
    jump.title = `${text.now} · ${L.time(now.minute)} (Toronto)`;
    for (const line of board.querySelectorAll('[data-day-now]')) {
      line.hidden = !isToday; line.style.top = `${now.minute * px}px`;
      if (line.dataset.dayNow === 'label') line.textContent = L.time(now.minute);
    }
    board.querySelectorAll('.radio-day-block').forEach(b => b.classList.toggle('is-current-time', isToday && b.closest('.radio-day-track').dataset.verified === 'true' && Number(b.dataset.start) <= now.minute && now.minute < Number(b.dataset.end)));
  }
  function scrollToNow() {
    if (scroll && !jump.disabled) scroll.scrollTop = Math.max(0, (L.moment().minute - 60) * px);
  }
  function render() {
    const chosen = dates.find(d => d.day === selected);
    heading.textContent = `${dateLabel(chosen.iso)} · ${text.timezone}`;
    const index = dates.findIndex(d => d.day === selected);
    select.value = String(selected); prev.disabled = index === 0; next.disabled = index === 6;
    today.disabled = !dates.some(d => d.iso === L.moment().iso);
    board.replaceChildren();
    const corner = el('div', 'radio-day-corner', text.hours); board.append(corner);
    axis = el('div', 'radio-day-axis');
    for (let h = 0; h <= 24; h++) {
      const tick = el('span', 'radio-day-tick', `${String(h).padStart(2, '0')}:00`); tick.style.top = `${h * 60 * px}px`; axis.append(tick);
    }
    const current = el('span', 'radio-day-current'); current.dataset.dayNow = 'label'; current.setAttribute('aria-hidden', 'true'); axis.append(current); board.append(axis);
    models = stations.map(station => ({ station, ...L.segments(payload.stations?.[station.id]?.grid, selected) }));
    const list = root.querySelector('[data-day-list]'); list.replaceChildren();
    for (const [i, model] of models.entries()) {
      const { station, blocks, unknown } = model;
      const sourceStation = payload.stations?.[station.id] || {};
      const ownWeek = sourceStation.verifiedWeekOf || dates[0].iso;
      const older = ownWeek !== dates[0].iso;
      const head = el('div', 'radio-day-heading'); head.style.gridColumn = String(i + 2); head.style.setProperty('--station-color', palette[i % palette.length]);
      const week = el('a', '', station.name); week.href = station.href; week.title = `${text.week} · ${station.name}`;
      head.append(week, el('span', '', station.place));
      if (older) head.append(el('span', '', `${text.retained} ${new Intl.DateTimeFormat(locale, { timeZone: 'America/Toronto', day: 'numeric', month: 'short' }).format(new Date(`${ownWeek}T12:00:00Z`))}`));
      board.append(head);
      const track = el('div', 'radio-day-track'); track.style.gridColumn = String(i + 2); track.style.setProperty('--station-color', palette[i % palette.length]); track.dataset.station = station.id; track.dataset.verified = String(!older && !sourceStation.unverified);
      for (const b of blocks) {
        const slot = makeSlotButton(station, b, 'radio-day-block');
        slot.dataset.start = b.start; slot.dataset.end = b.end; slot.dataset.sourceIndex = b.index; slot.dataset.lane = b.lane; slot.dataset.lanes = b.laneCount;
        slot.style.top = `${b.start * px}px`; slot.style.height = `${(b.end - b.start) * px}px`;
        slot.style.left = `calc(${b.lane * 100 / b.laneCount}% + 2px)`; slot.style.width = `calc(${100 / b.laneCount}% - 4px)`;
        const content = el('span', 'radio-day-block__content');
        const when = el('span', 'radio-day-block__time', `${b.fromPrevious ? '↳ ' : ''}${L.time(b.start)}–${L.time(b.end)}`);
        content.append(when, el('span', 'radio-day-block__title', b.slot.title));
        slot.append(content, el('span', 'radio-day-block__more', '↗')); track.append(slot);
      }
      const line = el('div', 'radio-day-now'); line.dataset.dayNow = 'line'; line.setAttribute('aria-hidden', 'true'); track.append(line); board.append(track);
      const section = el('section', 'radio-day-list-station'); const title = el('h3', '', station.name); section.append(title);
      const ul = el('ul');
      for (const b of [...blocks, ...unknown.map(b => ({ ...b, fromPrevious: false }))]) {
        const item = el('li'); const entry = makeSlotButton(station, b, 'radio-day-list-entry');
        entry.textContent = `${range(b)} · ${b.slot.title}${b.fromPrevious ? ` · ${text.previousNight}` : ''}${!b.slot.end || b.slot.endUnknown || b.slot.endInferred ? ` · ${text.unknown}` : ''}`;
        item.append(entry); ul.append(item);
      }
      section.append(ul.children.length ? ul : el('p', 'seo-note', text.empty));
      if (unknown.length) head.append(el('span', 'radio-day-unknown', `${unknown.length} · ${text.unknown}`));
      list.append(section);
    }
    updateNow();
  }
  function choose(day, follow = false) {
    selected = day; followToday = follow;
    const left = scroll.scrollLeft; render(); scroll.scrollLeft = left;
    scroll.scrollTop = 0;
    if (follow) scrollToNow();
  }
  async function init() {
    status.textContent = text.loading;
    try {
      if (typeof radioSchedules !== 'undefined' && Object.keys(radioSchedules.stations || {}).length) payload = radioSchedules;
      else {
        const response = await fetch(new URL('radio-schedules.json', base));
        if (!response.ok) throw new Error('Schedule HTTP ' + response.status);
        payload = await response.json();
      }
      if (!payload?.stations) throw new Error('Missing schedules');
      const week = Object.values(payload.stations).map(s => s.verifiedWeekOf).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s || '')).sort().pop();
      dates = L.weekDates(week);
      dates.forEach(d => { const option = el('option', '', dateLabel(d.iso)); option.value = String(d.day); select.append(option); });
      select.addEventListener('change', () => choose(Number(select.value)));
      prev.addEventListener('click', () => choose(dates[dates.findIndex(d => d.day === selected) - 1].day));
      next.addEventListener('click', () => choose(dates[dates.findIndex(d => d.day === selected) + 1].day));
      today.addEventListener('click', () => choose(L.moment().day, true)); jump.addEventListener('click', scrollToNow);
      scroll = el('div', 'radio-day-scroll'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', text.region);
      board = el('div', 'radio-day-board'); scroll.append(board);
      const details = el('details', 'radio-day-list'); details.append(el('summary', '', text.list)); const list = el('div'); list.dataset.dayList = ''; details.append(list);
      stationSelect.addEventListener('change', () => {
        const head = board.querySelectorAll('.radio-day-heading')[Number(stationSelect.value)];
        if (head) scroll.scrollLeft = Math.max(0, head.offsetLeft - 58);
      });
      ui.append(toolbar, heading, swipe, scroll, details); ui.hidden = false;
      render(); status.hidden = true; root.dataset.ready = 'true'; scrollToNow();
      // A narrow first view should not open on an empty column if another
      // station publishes a slot at this hour. The picker always names it.
      if (scroll.scrollWidth > scroll.clientWidth && !jump.disabled) {
        const now = L.moment();
        const firstCurrent = models.findIndex(m => !payload.stations?.[m.station.id]?.unverified && m.blocks.some(b => b.start <= now.minute && now.minute < b.end));
        if (firstCurrent > 0) { stationSelect.value = String(firstCurrent); stationSelect.dispatchEvent(new Event('change')); }
      }
      if (location.hash === '#journee') requestAnimationFrame(() => root.scrollIntoView({ block: 'start' }));
      window.setInterval(() => {
        const now = L.moment();
        if (now.iso !== lastToday) {
          lastToday = now.iso;
          // Do not relabel an older collected week as this week's live schedule.
          if (followToday && dates.some(d => d.iso === now.iso)) choose(now.day, true);
          else render();
        }
        updateNow();
      }, 30000);
      window.addEventListener('pageshow', () => updateNow());
    } catch (error) {
      status.textContent = text.fail; console.warn('Shared radio schedule unavailable', error);
    }
  }
  void init();
})();

/**
 * Le Radar — catalogue et sélecteur de langue partagé.
 *
 * La traduction du contenu reste confiée à l'adaptateur de chaque application :
 * Le Radar traduit son fil, Pomo conserve ses citations localisées et Solitaire
 * ses libellés de jeu. Ce module est la source commune pour le catalogue, le
 * menu accessible, la recherche, le positionnement et la préférence globale.
 */
(function () {
  'use strict';

  const GLOBAL_PREFERENCE_KEY = 'radar-translate-mode';
  const scriptUrl = document.currentScript?.src || location.href;
  const registryUrl = new URL('indigenous-mt.json', scriptUrl).href;

  const CORE = [
    ['original', 'Original', 'Original', '—'],
    ['fr', 'Français', 'Français', 'FR'],
    ['en', 'English', 'Anglais', 'EN'],
  ];
  const INDIGENOUS = [
    ['iu', 'ᐃᓄᒃᑎᑐᑦ', 'Inuktitut', 'IU', 'iu', 'Syllabiques'],
    ['iu-latn', 'Inuktut', 'Inuktitut', 'IU', 'iu-Latn', 'Latin'],
  ];
  const OTHER = [
    ['am', 'አማርኛ', 'Amharique', 'AM'], ['ar', 'العربية', 'Arabe', 'AR'],
    ['bn', 'বাংলা', 'Bengali', 'BN'], ['de', 'Deutsch', 'Allemand', 'DE'],
    ['el', 'Ελληνικά', 'Grec', 'EL'], ['es', 'Español', 'Espagnol', 'ES'],
    ['fa', 'فارسی', 'Persan', 'FA'], ['gu', 'ગુજરાતી', 'Gujarati', 'GU'],
    ['ha', 'Hausa', 'Haoussa', 'HA'], ['he', 'עברית', 'Hébreu', 'HE', 'iw'],
    ['hi', 'हिन्दी', 'Hindi', 'HI'], ['ht', 'Kreyòl ayisyen', 'Créole haïtien', 'HT'],
    ['id', 'Bahasa Indonesia', 'Indonésien', 'ID'], ['ig', 'Igbo', 'Igbo', 'IG'],
    ['it', 'Italiano', 'Italien', 'IT'], ['ja', '日本語', 'Japonais', 'JA'],
    ['kn', 'ಕನ್ನಡ', 'Kannada', 'KN'], ['ko', '한국어', 'Coréen', 'KO'],
    ['ml', 'മലയാളം', 'Malayalam', 'ML'], ['mr', 'मराठी', 'Marathi', 'MR'],
    ['ms', 'Bahasa Melayu', 'Malais', 'MS'], ['nl', 'Nederlands', 'Néerlandais', 'NL'],
    ['pa', 'ਪੰਜਾਬੀ', 'Pendjabi', 'PA'], ['pl', 'Polski', 'Polonais', 'PL'],
    ['pt', 'Português', 'Portugais', 'PT'], ['ro', 'Română', 'Roumain', 'RO'],
    ['ru', 'Русский', 'Russe', 'RU'], ['sv', 'Svenska', 'Suédois', 'SV'],
    ['sw', 'Kiswahili', 'Swahili', 'SW'], ['ta', 'தமிழ்', 'Tamoul', 'TA'],
    ['te', 'తెలుగు', 'Télougou', 'TE'], ['th', 'ไทย', 'Thaï', 'TH'],
    ['tl', 'Tagalog', 'Tagalog', 'TL'], ['tr', 'Türkçe', 'Turc', 'TR'],
    ['uk', 'Українська', 'Ukrainien', 'UK'], ['ur', 'اردو', 'Ourdou', 'UR'],
    ['vi', 'Tiếng Việt', 'Vietnamien', 'VI'], ['yo', 'Yorùbá', 'Yoruba', 'YO'],
    ['zh', '简体中文', 'Chinois', '简中', 'zh-CN', 'Simplifié'],
    ['zh-tw', '繁體中文', 'Chinois', '繁中', 'zh-TW', 'Traditionnel'],
  ];

  const NAME_EN = {
    original: 'Original', fr: 'French', en: 'English', iu: 'Inuktitut', 'iu-latn': 'Inuktitut',
    am: 'Amharic', ar: 'Arabic', bn: 'Bengali', de: 'German', el: 'Greek', es: 'Spanish',
    fa: 'Persian', gu: 'Gujarati', ha: 'Hausa', he: 'Hebrew', hi: 'Hindi', ht: 'Haitian Creole',
    id: 'Indonesian', ig: 'Igbo', it: 'Italian', ja: 'Japanese', kn: 'Kannada', ko: 'Korean',
    ml: 'Malayalam', mr: 'Marathi', ms: 'Malay', nl: 'Dutch', pa: 'Punjabi', pl: 'Polish',
    pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sv: 'Swedish', sw: 'Swahili',
    ta: 'Tamil', te: 'Telugu', th: 'Thai', tl: 'Tagalog', tr: 'Turkish', uk: 'Ukrainian',
    ur: 'Urdu', vi: 'Vietnamese', yo: 'Yoruba', zh: 'Chinese', 'zh-tw': 'Chinese',
    cr: 'Cree', moe: 'Innu', atj: 'Atikamekw', alq: 'Algonquin', moh: 'Mohawk', mic: "Mi'kmaq",
  };

  function fromRows(rows, group) {
    return Object.fromEntries(rows.map(([id, label, nameFr, short, goog, script]) => [id, {
      id, label, nameFr, nameEn: NAME_EN[id] || nameFr, short,
      goog: goog || (id === 'original' ? undefined : id), script, group,
      title: id === 'original' ? 'Ne pas traduire — conserver la langue originale' : `Traduire en ${label}`,
    }]));
  }

  function createModes() {
    return {
      ...fromRows(CORE, 'core'),
      ...fromRows(INDIGENOUS, 'indigenous'),
      ...fromRows(OTHER, 'other'),
    };
  }

  function normalizeMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return '';
    if (/^zh-(tw|hk|hant)/.test(value)) return 'zh-tw';
    if (value.startsWith('zh')) return 'zh';
    if (value === 'fil') return 'tl';
    if (value === 'iw') return 'he';
    if (value === 'ike' || value.startsWith('iu-')) return value.includes('latn') ? 'iu-latn' : 'iu';
    if (value === 'nb' || value === 'nn') return 'no';
    return value.split('-')[0];
  }

  function preferredMode(fallback = 'original') {
    try {
      const saved = normalizeMode(localStorage.getItem(GLOBAL_PREFERENCE_KEY));
      if (saved) return saved;
    } catch { /* stockage privé */ }
    const browser = normalizeMode(navigator.languages?.[0] || navigator.language);
    if (!browser || browser === 'fr' || browser === 'en') return fallback;
    return browser;
  }

  function persistMode(mode) {
    try { localStorage.setItem(GLOBAL_PREFERENCE_KEY, mode || 'original'); } catch { /* stockage privé */ }
  }

  function languageTag(mode) {
    if (!mode || mode === 'original') return null;
    if (mode === 'zh') return 'zh-Hans';
    if (mode === 'zh-tw') return 'zh-Hant';
    if (mode === 'iu-latn') return 'iu-Latn';
    if (mode === 'tl') return 'fil';
    return mode === 'he' ? 'he' : mode;
  }

  function localName(mode, locale, modes) {
    if (mode === 'original') return 'Original';
    try {
      const name = new Intl.DisplayNames([locale || 'fr', 'fr', 'en'], { type: 'language' }).of(languageTag(mode));
      if (name) return name.charAt(0).toLocaleUpperCase(locale || 'fr') + name.slice(1);
    } catch { /* Intl incomplet */ }
    return String(locale || '').startsWith('en') ? modes[mode]?.nameEn : modes[mode]?.nameFr;
  }

  function roughlySame(a, b) {
    const n = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const left = n(a);
    const right = n(b);
    return left === right || (left && right && (left.includes(right) || right.includes(left)));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sortOther(modes) {
    return Object.values(modes).filter((m) => m.group === 'other').sort((a, b) =>
      a.nameFr.localeCompare(b.nameFr, 'fr', { sensitivity: 'base' })
      || String(a.script || '').localeCompare(String(b.script || ''), 'fr'));
  }

  async function mergeIndigenousRegistry(modes, url = registryUrl) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return modes;
      const data = await response.json();
      for (const language of data.languages || []) {
        if (!language?.id) continue;
        const enabled = Boolean(language.enabled && !language.unavailable && language.goog);
        modes[language.id] = {
          id: language.id,
          label: language.label || language.id,
          nameFr: language.nameFr || language.label || language.id,
          nameEn: language.nameEn || NAME_EN[language.id] || language.nameFr || language.label,
          short: language.short || language.id.toUpperCase(),
          goog: enabled ? language.goog : undefined,
          script: language.script,
          aliases: language.aliases || [],
          title: language.title || language.label || language.id,
          unavailable: !enabled,
          group: 'indigenous',
        };
      }
    } catch { /* le repli statique reste utilisable hors ligne */ }
    return modes;
  }

  function mount(options = {}) {
    const button = typeof options.button === 'string' ? document.querySelector(options.button) : options.button;
    const menu = typeof options.menu === 'string' ? document.querySelector(options.menu) : options.menu;
    const label = typeof options.label === 'string' ? document.querySelector(options.label) : options.label;
    if (!button || !menu) return null;

    const modes = options.modes || createModes();
    let activeMode = normalizeMode(options.initialMode) || 'original';
    let positionBound = false;

    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.classList.add('translate-menu');
    // backdrop-filter/transform sur les barres Pomo et Solitaire crée un bloc
    // contenant pour position:fixed. Porter le panneau dans <body> garantit
    // des coordonnées réellement liées au viewport après redimensionnement.
    if (options.anchor && menu.parentElement !== document.body) {
      menu.classList.add('translate-menu--app');
      document.body.appendChild(menu);
    }
    button.classList.add('translate-toggle');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');

    const locale = () => {
      if (activeMode === 'original') return options.nativeLocale || document.documentElement.lang || 'fr';
      return languageTag(activeMode) || 'fr';
    };

    function secondary(mode) {
      if (mode.id === 'original') {
        return locale().startsWith('en') ? 'No translation' : 'Aucune traduction';
      }
      const localized = localName(mode.id, locale(), modes);
      const parts = roughlySame(localized, mode.label) ? [] : [localized];
      if (mode.script && !String(localized).toLowerCase().includes(String(mode.script).toLowerCase())) parts.push(mode.script);
      if (mode.unavailable) parts.push(locale().startsWith('en') ? 'Coming soon' : 'Bientôt');
      return parts.join(' · ');
    }

    function searchBlob(mode) {
      return [mode.label, mode.nameFr, mode.nameEn, mode.short, mode.id, mode.script, ...(mode.aliases || [])]
        .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    }

    function groupLabel(group) {
      const english = locale().startsWith('en');
      if (group === 'indigenous') return english ? 'Indigenous languages of Quebec' : 'Langues autochtones du Québec';
      if (group === 'other') return english ? 'Other languages' : 'Autres langues';
      return '';
    }

    function orderedModes() {
      const core = ['original', 'fr', 'en'].map((id) => modes[id]).filter(Boolean);
      const indigenous = Object.values(modes).filter((m) => m.group === 'indigenous');
      return [...core, ...indigenous, ...sortOther(modes)];
    }

    function filter(query = '') {
      const needle = String(query).trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      let count = 0;
      menu.querySelectorAll('.translate-menu__opt').forEach((option) => {
        const visible = !needle || option.dataset.search.includes(needle);
        option.hidden = !visible;
        if (visible) count += 1;
      });
      menu.querySelectorAll('.translate-menu__group').forEach((group) => {
        group.hidden = !group.querySelector('.translate-menu__opt:not([hidden])');
      });
      menu.dataset.filterEmpty = count ? '0' : '1';
    }

    function setActive(mode) {
      activeMode = normalizeMode(mode) || 'original';
      const data = modes[activeMode] || { label: activeMode.toUpperCase(), short: activeMode.toUpperCase() };
      if (label) label.textContent = activeMode === 'original' ? data.label : (data.short || data.label);
      button.dataset.mode = activeMode;
      button.title = data.title || data.label;
      button.setAttribute('aria-label', `Langue d’affichage : ${data.label}. Changer la langue.`);
      menu.querySelectorAll('.translate-menu__opt').forEach((option) => {
        const active = option.dataset.mode === activeMode;
        option.classList.toggle('is-active', active);
        option.classList.toggle('active', active);
        option.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    function build() {
      const search = document.createElement('div');
      search.className = 'translate-menu__search-wrap';
      search.innerHTML = '<div class="translate-menu__search-field">'
        + '<svg class="translate-menu__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
        + '<input type="search" class="translate-menu__search" autocomplete="off" spellcheck="false" aria-label="Filtrer les langues">'
        + '</div>';
      const fragment = document.createDocumentFragment();
      fragment.append(search);
      let currentGroup = '';
      let groupElement = null;
      for (const mode of orderedModes()) {
        if (mode.group !== currentGroup) {
          currentGroup = mode.group;
          const heading = groupLabel(currentGroup);
          groupElement = null;
          if (heading) {
            groupElement = document.createElement('div');
            groupElement.className = 'translate-menu__group';
            groupElement.dataset.group = currentGroup;
            groupElement.setAttribute('role', 'group');
            groupElement.setAttribute('aria-label', heading);
            groupElement.innerHTML = `<div class="translate-menu__sep"><span class="translate-menu__sep-label">${escapeHtml(heading)}</span></div>`;
            fragment.append(groupElement);
          }
        }
        const option = document.createElement('button');
        option.type = 'button';
        option.className = `translate-menu__opt lang-option${mode.unavailable ? ' is-unavailable' : ''}`;
        option.dataset.mode = mode.id;
        option.dataset.lang = mode.id;
        option.dataset.search = searchBlob(mode);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-disabled', mode.unavailable ? 'true' : 'false');
        const hint = secondary(mode);
        option.innerHTML = `<span class="translate-menu__row"><span class="translate-menu__name"${mode.goog ? ` lang="${escapeHtml(mode.goog)}"` : ''}>${escapeHtml(mode.label)}</span>${mode.short && mode.short !== '—' ? `<span class="translate-menu__code" aria-hidden="true">${escapeHtml(mode.short)}</span>` : ''}</span>${hint ? `<span class="translate-menu__hint">${escapeHtml(hint)}</span>` : ''}`;
        (groupElement || fragment).append(option);
      }
      menu.replaceChildren(fragment);
      search.querySelector('input').addEventListener('input', (event) => filter(event.target.value));
      setActive(activeMode);
      if (!menu.hidden) requestAnimationFrame(position);
    }

    function position() {
      if (menu.hidden) return;
      const pad = 12;
      const gap = 6;
      const rect = button.getBoundingClientRect();
      const anchor = typeof options.anchor === 'string'
        ? document.querySelector(options.anchor)
        : options.anchor;
      const anchorRect = anchor?.getBoundingClientRect();
      const width = Math.min(320, Math.max(240, window.innerWidth - pad * 2));
      menu.style.width = `${width}px`;
      const preferredTop = Math.max(rect.bottom, anchorRect?.bottom || rect.bottom) + gap;
      const availableBelow = window.innerHeight - preferredTop - pad;
      const maxHeight = Math.min(560, Math.max(120, availableBelow));
      menu.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(menu.offsetHeight || 300, window.innerHeight - pad * 2);
      let left = Math.max(pad, Math.min(rect.right - width, window.innerWidth - width - pad));
      let top = preferredTop;
      if (availableBelow < 120) {
        const aboveAnchor = (anchorRect?.top || rect.top) - gap - height;
        top = aboveAnchor >= pad ? aboveAnchor : Math.max(pad, window.innerHeight - pad - height);
      }
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.style.right = 'auto';
    }

    function onViewportChange() { position(); }
    function close() {
      menu.hidden = true;
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
      if (positionBound) {
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        positionBound = false;
      }
    }
    function open() {
      menu.hidden = false;
      menu.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
      const input = menu.querySelector('.translate-menu__search');
      if (input) { input.value = ''; filter(''); }
      requestAnimationFrame(() => {
        position();
        if (window.innerWidth >= 480) input?.focus({ preventScroll: true });
        menu.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
      });
      if (!positionBound) {
        window.addEventListener('resize', onViewportChange, { passive: true });
        window.addEventListener('scroll', onViewportChange, { passive: true, capture: true });
        positionBound = true;
      }
    }
    function visibleOptions() {
      return [...menu.querySelectorAll('.translate-menu__opt:not([hidden]):not([aria-disabled="true"])')];
    }
    function moveFocus(delta) {
      const visible = visibleOptions();
      if (!visible.length) return;
      let index = visible.indexOf(document.activeElement);
      if (index < 0) index = visible.findIndex((item) => item.classList.contains('is-active'));
      visible[(Math.max(index, 0) + delta + visible.length) % visible.length].focus();
    }

    build();
    mergeIndigenousRegistry(modes, options.registryUrl || registryUrl).then(() => build());

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.hidden ? open() : close();
    });
    menu.addEventListener('click', (event) => {
      const option = event.target.closest('.translate-menu__opt');
      if (!option || option.getAttribute('aria-disabled') === 'true') return;
      const mode = option.dataset.mode;
      persistMode(mode);
      setActive(mode);
      close();
      options.onSelect?.(mode, modes[mode]);
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
        button.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) close();
    });

    return { close, open, setActive, getMode: () => activeMode, getModes: () => modes };
  }

  window.RadarLanguageMenu = {
    GLOBAL_PREFERENCE_KEY,
    createModes,
    mergeIndigenousRegistry,
    normalizeMode,
    preferredMode,
    persistMode,
    mount,
  };
})();

/**
 * LE RADAR — traduction de page (moteur type Ataraxia).
 *
 * Pas de widget Google Website Translator (cookies googtrans souvent cassés
 * sur GitHub Pages). On traduit le DOM via des API libres :
 *   1. Google gtx (translate.googleapis.com, sans clé — comme Ataraxia)
 *   2. MyMemory (repli)
 *
 * Règles d'activation :
 *  1. Préférence utilisateur (localStorage) si elle existe — y compris « Original ».
 *  2. Sinon navigateur fr ou en → Original (aucune traduction) ; autre langue → auto.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'radar-translate-mode';
  // v10 : { t, ts } + purge fraîcheur (sessions QC). Invalide v9 (échos FR).
  const CACHE_KEY = 'radar-translate-cache-v10';
  const CACHE_LEGACY_KEYS = ['radar-translate-cache-v9', 'radar-translate-cache-v8'];
  const CACHE_MAX = 4000;
  const CACHE_VERSION = 10;
  const DEFAULT_MODE = 'original';
  // 6 = plafond HTTP/1.1 par hôte vers gtx. Au-delà, le navigateur file.
  // La vitesse perçue vient du passage chrome (glossaire, 0 réseau), pas d’un
  // plus gros robinet — ouvrir MAX_CHUNK / CONCURRENCY casse l’ordre IU.
  const CONCURRENCY = 6;
  const MAX_CHUNK = 450;
  /** gtx/MyMemory sans délai = overlay coincé (persan vu à 21 %). Mutable en test. */
  const MT = { timeoutMs: 6000 };
  /** Mât, tuner, CTA, nav, tête du fil, pied — avant les articles. */
  const CHROME_SELECTOR = 'header.masthead, #tuner, #masthead-sports-strip, nav.site-sections, .wire-head, .site-foot';

  /**
   * Catalogue de langues.
   *
   * Bonnes pratiques (W3C / Unicode CLDR / sélecteurs Apple·Google·Wikipedia) :
   *  - `label` = endonyme (nom de la langue *dans* cette langue)
   *  - `nameFr` = nom en français (UI du site) pour repère + tri + recherche
   *  - pas de liste de pays (une langue ≠ un pays ; l’arabe n’est pas « l’Arabie »)
   *  - `script` seulement pour les variantes d’écriture (syllabiques, simplifié…)
   *  - groupes : core | indigenous | other — pas de continents
   */
  const MODES = {
    original: {
      id: 'original',
      label: 'Original',
      nameFr: 'Original',
      short: '—',
      title: 'Ne pas traduire — chaque article reste dans sa langue d’origine',
      group: 'core',
    },
    fr: {
      id: 'fr',
      label: 'Français',
      nameFr: 'Français',
      short: 'FR',
      title: 'Traduire toute la page en français',
      goog: 'fr',
      group: 'core',
    },
    en: {
      id: 'en',
      label: 'English',
      nameFr: 'Anglais',
      short: 'EN',
      title: 'Translate the whole page into English',
      goog: 'en',
      group: 'core',
    },
    /* Langues autochtones : catalogue dynamique dans indigenous-mt.json
       (sondage mensuel scripts/probe-indigenous-mt.js). Repli statique : */
    iu: {
      id: 'iu',
      label: 'ᐃᓄᒃᑎᑐᑦ',
      nameFr: 'Inuktitut',
      short: 'IU',
      title: 'Inuktitut (syllabiques) — Inuktut, Nunavik et Inuit du Québec',
      script: 'Syllabiques',
      goog: 'iu',
      group: 'indigenous',
    },
    'iu-latn': {
      id: 'iu-latn',
      label: 'Inuktut',
      nameFr: 'Inuktitut',
      short: 'IU',
      title: 'Inuktut (alphabet latin) — Inuit du Québec',
      script: 'Latin',
      // Code gtx sensible à la casse : iu-Latn = alphabet latin ; iu = syllabiques.
      goog: 'iu-Latn',
      group: 'indigenous',
    },
    /* —— Autres langues (liste plate, tri A→Z par nameFr) ——
       Population étudiante internationale au Québec / Canada. */
    am: {
      id: 'am',
      label: 'አማርኛ',
      nameFr: 'Amharique',
      short: 'AM',
      title: 'ሙሉ ገጹን ወደ አማርኛ ተርጉም',
      goog: 'am',
      group: 'other',
    },
    ar: {
      id: 'ar',
      label: 'العربية',
      nameFr: 'Arabe',
      short: 'AR',
      title: 'ترجمة الصفحة كاملة إلى العربية',
      goog: 'ar',
      group: 'other',
    },
    bn: {
      id: 'bn',
      label: 'বাংলা',
      nameFr: 'Bengali',
      short: 'BN',
      title: 'সম্পূর্ণ পৃষ্ঠা বাংলায় অনুবাদ করুন',
      goog: 'bn',
      group: 'other',
    },
    de: {
      id: 'de',
      label: 'Deutsch',
      nameFr: 'Allemand',
      short: 'DE',
      title: 'Ganze Seite auf Deutsch übersetzen',
      goog: 'de',
      group: 'other',
    },
    el: {
      id: 'el',
      label: 'Ελληνικά',
      nameFr: 'Grec',
      short: 'EL',
      title: 'Μετάφραση ολόκληρης της σελίδας στα ελληνικά',
      goog: 'el',
      group: 'other',
    },
    es: {
      id: 'es',
      label: 'Español',
      nameFr: 'Espagnol',
      short: 'ES',
      title: 'Traducir toda la página al español',
      goog: 'es',
      group: 'other',
    },
    fa: {
      id: 'fa',
      label: 'فارسی',
      nameFr: 'Persan',
      short: 'FA',
      title: 'ترجمهٔ کل صفحه به فارسی',
      goog: 'fa',
      group: 'other',
    },
    gu: {
      id: 'gu',
      label: 'ગુજરાતી',
      nameFr: 'Gujarati',
      short: 'GU',
      title: 'સમગ્ર પૃષ્ઠનું ગુજરાતીમાં ભાષાંતર',
      goog: 'gu',
      group: 'other',
    },
    ha: {
      id: 'ha',
      label: 'Hausa',
      nameFr: 'Haoussa',
      short: 'HA',
      title: 'Fassara dukkan shafin zuwa Hausa',
      goog: 'ha',
      group: 'other',
    },
    he: {
      id: 'he',
      label: 'עברית',
      nameFr: 'Hébreu',
      short: 'HE',
      title: 'תרגם את כל העמוד לעברית',
      goog: 'iw',
      group: 'other',
    },
    hi: {
      id: 'hi',
      label: 'हिन्दी',
      nameFr: 'Hindi',
      short: 'HI',
      title: 'पूरे पृष्ठ का हिंदी में अनुवाद करें',
      goog: 'hi',
      group: 'other',
    },
    ht: {
      id: 'ht',
      label: 'Kreyòl ayisyen',
      nameFr: 'Créole haïtien',
      short: 'HT',
      title: 'Tradui tout paj la an kreyòl ayisyen',
      goog: 'ht',
      group: 'other',
    },
    id: {
      id: 'id',
      label: 'Bahasa Indonesia',
      nameFr: 'Indonésien',
      short: 'ID',
      title: 'Terjemahkan seluruh halaman ke bahasa Indonesia',
      goog: 'id',
      group: 'other',
    },
    ig: {
      id: 'ig',
      label: 'Igbo',
      nameFr: 'Igbo',
      short: 'IG',
      title: 'Tụgharịa ibe dum gaa n’Igbo',
      goog: 'ig',
      group: 'other',
    },
    it: {
      id: 'it',
      label: 'Italiano',
      nameFr: 'Italien',
      short: 'IT',
      title: 'Traduci l’intera pagina in italiano',
      goog: 'it',
      group: 'other',
    },
    ja: {
      id: 'ja',
      label: '日本語',
      nameFr: 'Japonais',
      short: 'JA',
      title: 'ページ全体を日本語に翻訳',
      goog: 'ja',
      group: 'other',
    },
    kn: {
      id: 'kn',
      label: 'ಕನ್ನಡ',
      nameFr: 'Kannada',
      short: 'KN',
      title: 'ಸಂಪೂರ್ಣ ಪುಟವನ್ನು ಕನ್ನಡಕ್ಕೆ ಅನುವಾದಿಸಿ',
      goog: 'kn',
      group: 'other',
    },
    ko: {
      id: 'ko',
      label: '한국어',
      nameFr: 'Coréen',
      short: 'KO',
      title: '전체 페이지를 한국어로 번역',
      goog: 'ko',
      group: 'other',
    },
    ml: {
      id: 'ml',
      label: 'മലയാളം',
      nameFr: 'Malayalam',
      short: 'ML',
      title: 'മുഴുവൻ പേജും മലയാളത്തിലേക്ക് വിവർത്തനം ചെയ്യുക',
      goog: 'ml',
      group: 'other',
    },
    mr: {
      id: 'mr',
      label: 'मराठी',
      nameFr: 'Marathi',
      short: 'MR',
      title: 'संपूर्ण पृष्ठ मराठीत भाषांतरित करा',
      goog: 'mr',
      group: 'other',
    },
    ms: {
      id: 'ms',
      label: 'Bahasa Melayu',
      nameFr: 'Malais',
      short: 'MS',
      title: 'Terjemah seluruh halaman ke Bahasa Melayu',
      goog: 'ms',
      group: 'other',
    },
    nl: {
      id: 'nl',
      label: 'Nederlands',
      nameFr: 'Néerlandais',
      short: 'NL',
      title: 'Vertaal de hele pagina naar het Nederlands',
      goog: 'nl',
      group: 'other',
    },
    pa: {
      id: 'pa',
      label: 'ਪੰਜਾਬੀ',
      nameFr: 'Pendjabi',
      short: 'PA',
      title: 'ਸਾਰੇ ਸਫ਼ੇ ਦਾ ਪੰਜਾਬੀ ਵਿੱਚ ਅਨੁਵਾਦ',
      goog: 'pa',
      group: 'other',
    },
    pl: {
      id: 'pl',
      label: 'Polski',
      nameFr: 'Polonais',
      short: 'PL',
      title: 'Przetłumacz całą stronę na polski',
      goog: 'pl',
      group: 'other',
    },
    pt: {
      id: 'pt',
      label: 'Português',
      nameFr: 'Portugais',
      short: 'PT',
      title: 'Traduzir a página inteira para português',
      goog: 'pt',
      group: 'other',
    },
    ro: {
      id: 'ro',
      label: 'Română',
      nameFr: 'Roumain',
      short: 'RO',
      title: 'Traduce întreaga pagină în română',
      goog: 'ro',
      group: 'other',
    },
    ru: {
      id: 'ru',
      label: 'Русский',
      nameFr: 'Russe',
      short: 'RU',
      title: 'Перевести всю страницу на русский',
      goog: 'ru',
      group: 'other',
    },
    sv: {
      id: 'sv',
      label: 'Svenska',
      nameFr: 'Suédois',
      short: 'SV',
      title: 'Översätt hela sidan till svenska',
      goog: 'sv',
      group: 'other',
    },
    sw: {
      id: 'sw',
      label: 'Kiswahili',
      nameFr: 'Swahili',
      short: 'SW',
      title: 'Tafsiri ukurasa mzima kwa Kiswahili',
      goog: 'sw',
      group: 'other',
    },
    ta: {
      id: 'ta',
      label: 'தமிழ்',
      nameFr: 'Tamoul',
      short: 'TA',
      title: 'முழு பக்கத்தையும் தமிழில் மொழிபெயர்க்கவும்',
      goog: 'ta',
      group: 'other',
    },
    te: {
      id: 'te',
      label: 'తెలుగు',
      nameFr: 'Télougou',
      short: 'TE',
      title: 'మొత్తం పేజీని తెలుగులోకి అనువదించండి',
      goog: 'te',
      group: 'other',
    },
    th: {
      id: 'th',
      label: 'ไทย',
      nameFr: 'Thaï',
      short: 'TH',
      title: 'แปลทั้งหน้าเป็นภาษาไทย',
      goog: 'th',
      group: 'other',
    },
    tl: {
      id: 'tl',
      label: 'Tagalog',
      nameFr: 'Tagalog',
      short: 'TL',
      title: 'Isalin ang buong pahina sa Tagalog',
      goog: 'tl',
      group: 'other',
    },
    tr: {
      id: 'tr',
      label: 'Türkçe',
      nameFr: 'Turc',
      short: 'TR',
      title: 'Tüm sayfayı Türkçeye çevir',
      goog: 'tr',
      group: 'other',
    },
    uk: {
      id: 'uk',
      label: 'Українська',
      nameFr: 'Ukrainien',
      short: 'UK',
      title: 'Перекласти всю сторінку українською',
      goog: 'uk',
      group: 'other',
    },
    ur: {
      id: 'ur',
      label: 'اردو',
      nameFr: 'Ourdou',
      short: 'UR',
      title: 'پورے صفحے کا اردو ترجمہ',
      goog: 'ur',
      group: 'other',
    },
    vi: {
      id: 'vi',
      label: 'Tiếng Việt',
      nameFr: 'Vietnamien',
      short: 'VI',
      title: 'Dịch toàn bộ trang sang tiếng Việt',
      goog: 'vi',
      group: 'other',
    },
    yo: {
      id: 'yo',
      label: 'Yorùbá',
      nameFr: 'Yoruba',
      short: 'YO',
      title: 'Túmọ̀ gbogbo ojú-ìwé sí èdè Yorùbá',
      goog: 'yo',
      group: 'other',
    },
    zh: {
      id: 'zh',
      label: '中文',
      nameFr: 'Chinois',
      short: '中文',
      title: '将整页翻译成中文（简体）',
      script: 'Simplifié',
      goog: 'zh-CN',
      group: 'other',
    },
    'zh-tw': {
      id: 'zh-tw',
      label: '繁體中文',
      nameFr: 'Chinois',
      short: '繁中',
      title: '將整頁翻譯成繁體中文',
      script: 'Traditionnel',
      goog: 'zh-TW',
      group: 'other',
    },
  };

  // Le catalogue partagé complète les trois applications. Les métadonnées plus
  // riches du Radar ci-dessus priment lorsqu'une entrée existe déjà.
  if (window.RadarLanguageMenu?.createModes) {
    for (const [id, mode] of Object.entries(window.RadarLanguageMenu.createModes())) {
      if (!MODES[id]) MODES[id] = mode;
    }
  }

  /**
   * Ordre d’affichage :
   *  1. core — Original, FR, EN (pas d’en-tête de groupe)
   *  2. indigenous — Langues autochtones du Québec (Premiers Peuples + Inuit)
   *  3. other — liste plate A→Z (nameFr), sans continents
   * Les IDs autochtones sont injectés depuis indigenous-mt.json.
   */
  const MENU_ORDER_CORE = ['original', 'fr', 'en'];
  const MENU_ORDER_OTHER_IDS = [
    'am', 'ar', 'bn', 'de', 'el', 'es', 'fa', 'gu', 'ha', 'he', 'hi', 'ht',
    'id', 'ig', 'it', 'ja', 'kn', 'ko', 'ml', 'mr', 'ms', 'nl', 'pa', 'pl',
    'pt', 'ro', 'ru', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur',
    'vi', 'yo', 'zh', 'zh-tw',
  ];

  function sortLangIdsByNameFr(ids) {
    return [...ids].sort((a, b) => {
      const na = MODES[a]?.nameFr || MODES[a]?.label || a;
      const nb = MODES[b]?.nameFr || MODES[b]?.label || b;
      const cmp = na.localeCompare(nb, 'fr', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      // Même nameFr (ex. Chinois simplifié / traditionnel) : script puis id
      const sa = MODES[a]?.script || '';
      const sb = MODES[b]?.script || '';
      return sa.localeCompare(sb, 'fr', { sensitivity: 'base' })
        || a.localeCompare(b, 'fr');
    });
  }

  let MENU_ORDER_TAIL = sortLangIdsByNameFr(MENU_ORDER_OTHER_IDS);
  let MENU_ORDER = [...MENU_ORDER_CORE, 'iu', 'iu-latn', ...MENU_ORDER_TAIL];

  /**
   * Groupes du menu.
   *
   * « Langues autochtones du Québec » — formulation officielle du gouvernement
   * du Québec (ex. plan d’action culture/langues autochtones ; volet « langues
   * autochtones » du MCC). « Autochtone » au Québec = les 10 Premières Nations
   * + les Inuit (11 nations) ; « Premières Nations » seul exclurait l’inuktitut.
   * Alternatives plus longues : « Langues des Premières Nations et des Inuit ».
   * Pas de subdivision par continent pour les autres langues.
   */
  /**
   * En-têtes de groupe (FR par défaut ; localisés via UI_PHRASES / repli EN).
   */
  const GROUP_LABELS = {
    indigenous: {
      fr: 'Langues autochtones du Québec',
      en: 'Indigenous languages of Quebec',
    },
    other: {
      fr: 'Autres langues',
      en: 'Other languages',
    },
  };

  /** Repli anglais (CLDR) si Intl.DisplayNames indisponible. */
  const LANG_NAME_EN = {
    original: 'Original',
    fr: 'French',
    en: 'English',
    iu: 'Inuktitut',
    'iu-latn': 'Inuktitut',
    am: 'Amharic',
    ar: 'Arabic',
    bn: 'Bengali',
    de: 'German',
    el: 'Greek',
    es: 'Spanish',
    fa: 'Persian',
    gu: 'Gujarati',
    ha: 'Hausa',
    he: 'Hebrew',
    hi: 'Hindi',
    ht: 'Haitian Creole',
    id: 'Indonesian',
    ig: 'Igbo',
    it: 'Italian',
    ja: 'Japanese',
    kn: 'Kannada',
    ko: 'Korean',
    ml: 'Malayalam',
    mr: 'Marathi',
    ms: 'Malay',
    nl: 'Dutch',
    pa: 'Punjabi',
    pl: 'Polish',
    pt: 'Portuguese',
    ro: 'Romanian',
    ru: 'Russian',
    sv: 'Swedish',
    sw: 'Swahili',
    ta: 'Tamil',
    te: 'Telugu',
    th: 'Thai',
    tl: 'Tagalog',
    tr: 'Turkish',
    uk: 'Ukrainian',
    ur: 'Urdu',
    vi: 'Vietnamese',
    yo: 'Yoruba',
    zh: 'Chinese',
    'zh-tw': 'Chinese',
    cr: 'Cree',
    moe: 'Innu',
    atj: 'Atikamekw',
    alq: 'Algonquin',
    moh: 'Mohawk',
    mic: "Mi'kmaq",
  };

  const SCRIPT_TO_ISO = {
    Simplifié: 'Hans',
    Traditionnel: 'Hant',
    Latin: 'Latn',
  };

  const SCRIPT_LABEL_EN = {
    Simplifié: 'Simplified',
    Traditionnel: 'Traditional',
    Syllabiques: 'Syllabics',
    Latin: 'Latin',
  };

  let indigenousRegistryReady = false;

  /**
   * Locale BCP-47 du chrome du menu = langue d’affichage active
   * (Original / FR → fr ; sinon code de la langue choisie).
   */
  function menuChromeLocale() {
    if (!activeMode || activeMode === DEFAULT_MODE || activeMode === 'fr') return 'fr';
    if (activeMode === 'en') return 'en';
    if (activeMode === 'zh') return 'zh-CN';
    if (activeMode === 'zh-tw') return 'zh-TW';
    if (activeMode === 'iu-latn') return 'iu-Latn';
    if (activeMode === 'he') return 'he';
    if (activeMode === 'tl') return 'fil';
    const goog = MODES[activeMode]?.goog;
    if (goog === 'iw') return 'he';
    if (goog === 'zh-CN') return 'zh-CN';
    if (goog === 'zh-TW') return 'zh-TW';
    return goog || activeMode || 'fr';
  }

  /** Tag BCP-47 d’une entrée du menu pour Intl.DisplayNames.of(). */
  function languageTagForMode(modeId) {
    if (!modeId || modeId === 'original') return null;
    if (modeId === 'zh') return 'zh-Hans';
    if (modeId === 'zh-tw') return 'zh-Hant';
    if (modeId === 'iu-latn') return 'iu-Latn';
    if (modeId === 'iu') return 'iu';
    if (modeId === 'tl') return 'fil';
    if (modeId === 'he') return 'he';
    const goog = MODES[modeId]?.goog;
    if (goog === 'zh-CN') return 'zh-Hans';
    if (goog === 'zh-TW') return 'zh-Hant';
    if (goog === 'iw') return 'he';
    if (goog === 'iu-Latn') return 'iu-Latn';
    if (goog) return goog;
    return modeId;
  }

  function prettifyDisplayName(name = '') {
    const s = String(name || '').trim();
    if (!s) return '';
    // Ne pas toucher CJK / Hangul / arabe / hébreu / indic / cyrillique…
    if (/[^\u0000-\u024F]/.test(s)) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function namesRoughlyEqual(a, b) {
    const norm = (x) => String(x || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  /**
   * Nom d’une langue *dans* la locale active (CLDR via Intl.DisplayNames).
   * Repli : nameEn / nameFr du catalogue.
   */
  function displayLanguageName(modeId, locale) {
    if (modeId === 'original') {
      if (String(locale).toLowerCase().startsWith('en')) return 'Original';
      if (String(locale).toLowerCase().startsWith('es')) return 'Original';
      if (String(locale).toLowerCase().startsWith('pt')) return 'Original';
      if (String(locale).toLowerCase().startsWith('de')) return 'Original';
      if (String(locale).toLowerCase().startsWith('ko')) return '원본';
      if (String(locale).toLowerCase().startsWith('ja')) return '原文';
      if (String(locale).toLowerCase().startsWith('zh')) return '原文';
      if (String(locale).toLowerCase().startsWith('ar')) return 'الأصل';
      if (String(locale).toLowerCase().startsWith('ru')) return 'Оригинал';
      if (String(locale).toLowerCase().startsWith('hi')) return 'मूल';
      return 'Original';
    }
    const tag = languageTagForMode(modeId);
    if (tag && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      try {
        const dn = new Intl.DisplayNames([locale, 'en', 'fr'], { type: 'language' });
        const raw = dn.of(tag);
        if (raw && raw.toLowerCase() !== String(tag).toLowerCase()) {
          return prettifyDisplayName(raw);
        }
      } catch { /* locale non supportée */ }
    }
    const loc = String(locale || '').toLowerCase();
    if (loc.startsWith('en')) {
      return LANG_NAME_EN[modeId] || MODES[modeId]?.nameEn || MODES[modeId]?.nameFr || '';
    }
    return MODES[modeId]?.nameFr || LANG_NAME_EN[modeId] || MODES[modeId]?.nameEn || '';
  }

  function displayScriptLabel(script, locale) {
    if (!script) return '';
    const code = SCRIPT_TO_ISO[script];
    if (code && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      try {
        const dn = new Intl.DisplayNames([locale, 'en', 'fr'], { type: 'script' });
        const raw = dn.of(code);
        if (raw) return prettifyDisplayName(raw);
      } catch { /* ignore */ }
    }
    const loc = String(locale || '').toLowerCase();
    if (loc.startsWith('en')) return SCRIPT_LABEL_EN[script] || script;
    if (loc.startsWith('fr')) return script;
    return SCRIPT_LABEL_EN[script] || script;
  }

  function unavailableLabel(locale) {
    const loc = String(locale || 'fr').toLowerCase();
    if (loc.startsWith('en')) return 'Coming soon';
    if (loc.startsWith('es')) return 'Próximamente';
    if (loc.startsWith('pt')) return 'Em breve';
    if (loc.startsWith('de')) return 'Demnächst';
    if (loc.startsWith('it')) return 'Presto disponibile';
    if (loc.startsWith('ko')) return '준비 중';
    if (loc.startsWith('ja')) return '近日対応';
    if (loc.startsWith('zh')) return '即将推出';
    if (loc.startsWith('ar')) return 'قريباً';
    if (loc.startsWith('ru')) return 'Скоро';
    if (loc.startsWith('hi')) return 'जल्द आ रहा है';
    if (loc.startsWith('vi')) return 'Sắp có';
    if (loc.startsWith('tr')) return 'Yakında';
    if (loc.startsWith('pl')) return 'Wkrótce';
    if (loc.startsWith('nl')) return 'Binnenkort';
    if (loc.startsWith('uk')) return 'Незабаром';
    return 'Bientôt';
  }

  function groupLabelText(groupKey) {
    const entry = GROUP_LABELS[groupKey];
    if (!entry) return '';
    const fr = typeof entry === 'string' ? entry : entry.fr;
    const locale = menuChromeLocale();
    const loc = String(locale).toLowerCase();
    if (loc.startsWith('fr')) return fr;
    if (typeof entry === 'object' && entry.en && loc.startsWith('en')) return entry.en;
    // Autres langues actives : glossaire UI si dispo
    if (typeof preferredUiPhrase === 'function') {
      const hit = preferredUiPhrase(fr, locale);
      if (hit && hit !== fr) return hit;
    }
    if (typeof entry === 'object' && entry.en) return entry.en;
    return fr;
  }

  /**
   * Ligne secondaire sous l’endonyme : nom de la langue *dans la langue active*
   * (Intl.DisplayNames / CLDR) + écriture si besoin. Pas de pays, pas de gtx.
   */
  function languageSecondaryLine(m = {}) {
    if (m.id === 'original') {
      return menuChromeLocale().startsWith('en') ? 'No translation' : 'Aucune traduction';
    }
    const parts = [];
    const label = String(m.label || '').trim();
    const locale = menuChromeLocale();
    const name = displayLanguageName(m.id, locale);
    if (name && !namesRoughlyEqual(name, label)) {
      parts.push(name);
    }
    if (m.script) {
      // zh-Hans via DisplayNames inclut souvent déjà « simplifié / 간체 »
      const scriptAlreadyInName = /simplif|tradit|simplified|traditional|간체|번체|简|繁|syllab|latin/i.test(name);
      if (!scriptAlreadyInName) {
        const sc = displayScriptLabel(m.script, locale);
        if (sc && !parts.some((p) => namesRoughlyEqual(p, sc))) parts.push(sc);
      }
    }
    if (m.unavailable) parts.push(unavailableLabel(locale));
    return parts.join(' · ');
  }

  /** Chaîne de recherche (endonyme + FR + EN + code + script + aliases). */
  function languageSearchBlob(m = {}) {
    return [
      m.label, m.nameFr, m.nameEn, LANG_NAME_EN[m.id],
      m.short, m.id, m.script, m.hint,
      ...(Array.isArray(m.aliases) ? m.aliases : []),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  /** Met à jour secondaires + en-têtes de groupe sans reconstruire tout le menu. */
  function refreshMenuChromeLabels() {
    const menu = document.getElementById('translate-menu');
    if (!menu) return;
    menu.querySelectorAll('.translate-menu__opt[data-mode]').forEach((opt) => {
      const m = MODES[opt.dataset.mode];
      if (!m) return;
      const secondary = languageSecondaryLine(m);
      let hint = opt.querySelector('.translate-menu__hint');
      if (secondary) {
        if (!hint) {
          hint = document.createElement('span');
          hint.className = 'translate-menu__hint';
          opt.appendChild(hint);
        }
        hint.textContent = secondary;
      } else if (hint) {
        hint.remove();
      }
      opt.dataset.search = languageSearchBlob(m);
    });
    menu.querySelectorAll('.translate-menu__group[data-group]').forEach((g) => {
      const sep = g.querySelector('.translate-menu__sep-label');
      const text = groupLabelText(g.dataset.group);
      if (sep && text) sep.textContent = text;
      if (text) g.setAttribute('aria-label', text);
    });
  }

  /** Fusionne indigenous-mt.json → MODES + MENU_ORDER (active + bientôt). */
  function applyIndigenousRegistry(reg) {
    if (!reg || !Array.isArray(reg.languages)) return;
    const indigenousIds = [];
    for (const lang of reg.languages) {
      if (!lang?.id) continue;
      const enabled = !!lang.enabled && !lang.unavailable && lang.goog;
      // nameFr : champ dédié, sinon dériver du hint historique (« Inuktitut · … »)
      const nameFr = lang.nameFr
        || String(lang.hint || '').split(/\s*[·•|]\s*/)[0].trim()
        || lang.label
        || lang.id;
      const script = lang.script
        || (/syllab/i.test(lang.hint || '') ? 'Syllabiques'
          : /latin/i.test(lang.hint || '') ? 'Latin'
            : undefined);
      MODES[lang.id] = {
        id: lang.id,
        label: lang.label || lang.id,
        nameFr,
        nameEn: lang.nameEn || LANG_NAME_EN[lang.id] || nameFr,
        short: lang.short || String(lang.id).toUpperCase(),
        title: lang.title || lang.label || lang.id,
        script,
        aliases: lang.aliases || [],
        group: 'indigenous',
        goog: enabled ? lang.goog : undefined,
        unavailable: !enabled,
      };
      indigenousIds.push(lang.id);
    }
    if (indigenousIds.length) {
      MENU_ORDER_TAIL = sortLangIdsByNameFr(MENU_ORDER_OTHER_IDS);
      MENU_ORDER = [...MENU_ORDER_CORE, ...indigenousIds, ...MENU_ORDER_TAIL];
    }
  }

  function loadIndigenousRegistry() {
    if (indigenousRegistryReady) return Promise.resolve();
    return fetch('./indigenous-mt.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) applyIndigenousRegistry(data);
        indigenousRegistryReady = true;
      })
      .catch(() => {
        indigenousRegistryReady = true;
      });
  }

  /** textNode → original string (avant toute traduction) */
  const originalByNode = new WeakMap();
  /** cache localStorage : key → { t, ts } */
  let translationCache = {};
  /** Titres / extraits encore dans le fil frais — pour purger le cache. */
  let newsCorpusTexts = new Set();
  let activeMode = DEFAULT_MODE;
  let translating = false;
  let pendingRetranslate = false;
  let translateGen = 0;
  /** Requêtes MT en vol, dédupliquées par clé de cache. */
  const inflight = new Map();
  let mutateTimer = 0;
  let mutateObserver = null;
  /** Noms de médias étudiants (propres) — ne jamais traduire. */
  const protectedMediaNames = new Set([
    'Le Radar', 'LE RADAR', 'Le radar',
    'LE-RADAR.ca', 'Le-Radar.ca', 'le-radar.ca',
    'LE·RADAR.ca', 'LE.RADAR.ca', 'LE RADAR.ca',
  ]);
  /**
   * Noms d'établissements (propres) — ne jamais traduire.
   * gtx casse souvent la casse (ex. ES : « Université Laval » → « universidad laval »)
   * ou déforme le sens (EN « Bishop's University » → « Universidad del Obispo »).
   */
  const protectedInstitutionNames = new Set([
    'ULaval', 'UdeM', 'UQAM', 'UQTR', 'UQAC', 'UQAR', 'UQO', 'UQAT',
    'UdeS', 'McGill', 'Concordia', "Bishop's", 'Poly Montréal', 'Polytechnique Montréal',
    'CVM', 'Dawson', 'Jonquière', 'Vieux-Montréal',
    'Université Laval', 'Université de Montréal', 'Université de Sherbrooke',
    'Université McGill', 'McGill University', 'Concordia University',
    "Bishop's University", 'Dawson College', 'Collège Dawson',
    'Université du Québec à Montréal', 'Université du Québec à Trois-Rivières',
    'Université du Québec à Chicoutimi', 'Cégep du Vieux Montréal',
    'Cégep de Jonquière', 'Cégep de Jonquière (ATM – journalisme)',
  ]);
  let mediaNamesReady = false;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'CODE', 'PRE', 'KBD', 'SAMP', 'SVG', 'PATH', 'MATH', 'IFRAME',
  ]);

  /**
   * Politique de traduction des noms propres (Le Radar) :
   *  - Noms de **sources** (médias) → jamais (filter-btn__name, article-source)
   *  - **Auteurs** d’articles → jamais (article-author)
   *  - **Crédits photo** (photographes, « Crédit photo : … ») → jamais
   *  - **Institutions** (article-inst, filter-btn__inst, …) → localisées
   *    seulement hors Original / FR / EN (ex. ES : Universidad…, Colegio…)
   *  - Libellés UI (« Par », « À la une », « Toutes les sources ») → traduits
   */
  const SKIP_CLASS_RE = /\b(?:notranslate|article-source|article-author|filter-btn__name|article-media-credit(?:__creator)?|sports-(?:panel|chip)__code|sports-chip__cta-tag|site-foot__signature)\b/;

  /**
   * Sigles d'équipes sportives (THE, SL, OUT, LAF, ÉTS, UQAC…) : ce sont des
   * codes RSEQ, pas des mots. Sans garde, un moteur MT rend « THE » par « LE »
   * et « OUT » par « DEHORS ». Le balisage les marque désormais `notranslate`,
   * mais une page servie depuis le cache du service worker peut être antérieure
   * au correctif : on protège aussi côté module, par zone + forme du texte.
   */
  const SPORTS_ZONE_SELECTOR = '.sports-panel, .sports-chip, .masthead-sports-strip, [data-sports-board]';
  const TEAM_CODE_RE = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’.-]{0,5}$/u;

  function isSportsTeamCode(text = '', node = null) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || !TEAM_CODE_RE.test(t)) return false;
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    return !!el?.closest?.(SPORTS_ZONE_SELECTOR);
  }

  function hasUserPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function isValidLangCode(code) {
    return typeof code === 'string' && /^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(code);
  }

  function normalizeBrowserLang(tag) {
    const raw = String(tag || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'zh-tw' || raw === 'zh-hk' || raw === 'zh-hant' || raw.startsWith('zh-hant')) return 'zh-tw';
    if (raw.startsWith('zh')) return 'zh';
    if (raw === 'fil' || raw === 'fil-ph') return 'tl';
    if (raw === 'iw') return 'he';
    if (raw === 'nb' || raw === 'nn') return 'no';
    return raw.split('-')[0] || '';
  }

  function googCodeForMode(mode) {
    if (!mode || mode === DEFAULT_MODE) return null;
    if (MODES[mode]?.unavailable) return null;
    if (MODES[mode]?.goog) return MODES[mode].goog;
    if (mode === 'zh') return 'zh-CN';
    if (mode === 'zh-tw') return 'zh-TW';
    if (mode === 'he') return 'iw';
    // iu-Latn (L majuscule) = orthographe latine ; iu = syllabaires canadiens
    if (mode === 'iu-latn') return 'iu-Latn';
    if (mode === 'iu') return 'iu';
    if (mode === 'fil') return 'tl';
    if (isValidLangCode(mode)) return mode;
    return null;
  }

  function gtxLang(code) {
    const map = {
      zh: 'zh-CN',
      'zh-tw': 'zh-TW',
      he: 'iw',
      // Conserver la casse exacte exigée par gtx
      'iu-latn': 'iu-Latn',
      'iu-Latn': 'iu-Latn',
      iu: 'iu',
      tl: 'tl', // Tagalog / Filipino
      fil: 'tl',
    };
    return map[code] || code;
  }

  /** Codes gtx à essayer, dans l’ordre. Un hang (null) arrête la liste. */
  const GTX_TL_ALIASES = {
    fa: ['fa', 'fa-IR'],
    he: ['iw', 'he'],
    iw: ['iw', 'he'],
    zh: ['zh-CN', 'zh'],
    'zh-CN': ['zh-CN', 'zh'],
    'zh-tw': ['zh-TW'],
    'zh-TW': ['zh-TW'],
    tl: ['tl', 'fil'],
    fil: ['tl', 'fil'],
    iu: ['iu', 'ike'],
    'iu-latn': ['iu-Latn', 'ike-Latn', 'iu'],
    'iu-Latn': ['iu-Latn', 'ike-Latn', 'iu'],
  };

  function gtxTargetCodes(tl) {
    const code = gtxLang(tl);
    const aliases = GTX_TL_ALIASES[code] || GTX_TL_ALIASES[tl];
    if (!aliases) return [code];
    const seen = new Set();
    const out = [];
    for (const item of aliases) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out.length ? out : [code];
  }

  /** MyMemory veut ISO 639 (he, pas iw ; fa, pas fa-IR). */
  function mymemoryLang(tl) {
    const code = gtxLang(tl);
    const map = {
      iw: 'he',
      'fa-IR': 'fa',
      'iu-Latn': 'iu',
      fil: 'tl',
    };
    return map[code] || code;
  }

  function notify(msg) {
    const el = document.getElementById('toast');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(el._radarTranslateT);
      el._radarTranslateT = setTimeout(() => el.classList.add('hidden'), 4200);
      return;
    }
    console.info(msg);
  }

  function labelForMode(mode) {
    if (MODES[mode]) return MODES[mode];
    if (mode && mode !== DEFAULT_MODE) {
      return {
        id: mode,
        label: mode.toUpperCase(),
        short: mode.toUpperCase(),
        title: `Translate page to ${mode}`,
        hint: 'Auto',
        goog: googCodeForMode(mode),
      };
    }
    return MODES.original;
  }

  function detectBrowserAutoMode() {
    let tags = [];
    try {
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        tags = navigator.languages.slice();
      } else if (navigator.language) {
        tags = [navigator.language];
      }
    } catch {
      tags = [];
    }

    for (const tag of tags) {
      const lower = String(tag || '').toLowerCase();
      const primary = normalizeBrowserLang(tag);
      if (!primary) continue;
      if (primary === 'fr' || primary === 'en') return DEFAULT_MODE;
      if (primary === 'iu' || primary === 'ike' || lower.startsWith('iu')) {
        return lower.includes('latn') ? 'iu-latn' : 'iu';
      }
      if (MODES[primary]?.unavailable) continue;
      if (MODES[primary]?.goog) return primary;
      if (isValidLangCode(primary)) return primary;
    }
    return DEFAULT_MODE;
  }

  function getMode() {
    if (hasUserPreference()) {
      try {
        const raw = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase().trim();
        if (raw === DEFAULT_MODE) return DEFAULT_MODE;
        if (raw === 'iu-latn' || raw === 'zh-tw') return raw;
        if (MODES[raw] && !MODES[raw].unavailable) return raw;
        if (raw === 'fil') return 'tl';
        if (raw === 'iw') return 'he';
        if (isValidLangCode(raw) && raw !== 'fr' && raw !== 'en') return raw;
        // fr/en stockés manuellement restent valides
        if (raw === 'fr' || raw === 'en') return raw;
      } catch { /* fall through */ }
    }
    return detectBrowserAutoMode();
  }

  function setMode(mode) {
    if (MODES[mode]?.unavailable) return getMode();
    if (mode !== DEFAULT_MODE && !MODES[mode] && !isValidLangCode(mode) && mode !== 'iu-latn') {
      mode = DEFAULT_MODE;
    }
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch { /* private mode */ }
    return mode;
  }

  function cacheKey(text, tl) {
    return `auto|${tl}|${text}`;
  }

  function cacheKeyParts(key) {
    const first = String(key).indexOf('|');
    const second = String(key).indexOf('|', first + 1);
    if (second < 0) return { sl: '', tl: '', text: String(key) };
    return {
      sl: key.slice(0, first),
      tl: key.slice(first + 1, second),
      text: key.slice(second + 1),
    };
  }

  function unwrapCacheVal(val) {
    if (val && typeof val === 'object' && typeof val.t === 'string') return val;
    if (typeof val === 'string') return { t: val, ts: Date.now() };
    return null;
  }

  function loadCache() {
    try {
      CACHE_LEGACY_KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        translationCache = {};
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === CACHE_VERSION && parsed.entries && typeof parsed.entries === 'object') {
        translationCache = parsed.entries;
      } else if (parsed && typeof parsed === 'object' && !parsed.v) {
        translationCache = {};
        for (const [k, val] of Object.entries(parsed)) {
          const rec = unwrapCacheVal(val);
          if (!rec) continue;
          const { text } = cacheKeyParts(k);
          if (sameMtText(rec.t, text)) continue;
          translationCache[k] = { t: rec.t, ts: rec.ts || Date.now() };
        }
      } else {
        translationCache = {};
      }
    } catch {
      translationCache = {};
    }
  }

  function persistCachePayload() {
    return JSON.stringify({
      v: CACHE_VERSION,
      savedAt: Date.now(),
      entries: translationCache,
    });
  }

  function saveCache() {
    const keys = Object.keys(translationCache);
    if (keys.length > CACHE_MAX) {
      keys.slice(0, keys.length - CACHE_MAX).forEach((k) => {
        delete translationCache[k];
      });
    }
    try {
      localStorage.setItem(CACHE_KEY, persistCachePayload());
    } catch {
      keys.slice(0, Math.ceil(keys.length * 0.35)).forEach((k) => {
        delete translationCache[k];
      });
      try {
        localStorage.setItem(CACHE_KEY, persistCachePayload());
      } catch { /* quota */ }
    }
  }

  /** LRU : relire une clé la remet en fin d’insertion (le cap coupe le début). */
  function cacheGet(key) {
    if (!Object.prototype.hasOwnProperty.call(translationCache, key)) return undefined;
    const rec = unwrapCacheVal(translationCache[key]);
    if (!rec) {
      delete translationCache[key];
      return undefined;
    }
    const { text } = cacheKeyParts(key);
    if (sameMtText(rec.t, text)) {
      delete translationCache[key];
      return undefined;
    }
    delete translationCache[key];
    translationCache[key] = { t: rec.t, ts: Date.now() };
    return rec.t;
  }

  function cacheSet(key, val) {
    if (val == null || val === '') return;
    const { text } = cacheKeyParts(key);
    if (sameMtText(val, text)) return;
    if (Object.prototype.hasOwnProperty.call(translationCache, key)) {
      delete translationCache[key];
    }
    translationCache[key] = { t: String(val), ts: Date.now() };
  }

  function rememberNewsCorpus(items = []) {
    const list = Array.isArray(items) ? items : [];
    const fresh = (typeof window !== 'undefined' && window.RadarSessionFreshness?.filterFreshItems)
      ? window.RadarSessionFreshness.filterFreshItems(list)
      : list;
    const next = new Set();
    const fields = ['title', 'excerpt', 'summary', 'description', 'brief', 'author', 'byline', 'kicker'];
    for (const item of fresh) {
      if (!item || typeof item !== 'object') continue;
      for (const field of fields) {
        const t = String(item[field] || '').replace(/\s+/g, ' ').trim();
        if (t) next.add(t);
      }
    }
    newsCorpusTexts = next;
    pruneTranslationCache();
  }

  function chromeKeepTexts() {
    const keep = new Set();
    Object.keys(UI_PHRASES).forEach((k) => keep.add(k));
    Object.values(OVERLAY_COPY_FR || {}).forEach((k) => keep.add(k));
    if (typeof document === 'undefined') return keep;
    document.querySelectorAll(`${CHROME_SELECTOR}, .article`).forEach((root) => {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n = walk.nextNode();
      while (n) {
        const orig = originalByNode.get(n);
        const t = String(orig || n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (t) keep.add(t);
        n = walk.nextNode();
      }
    });
    return keep;
  }

  /**
   * Garde les traductions du fil encore frais + chrome UI.
   * Sans corpus (news pas encore là) : seulement cap LRU + échos FR.
   */
  function pruneTranslationCache({ persist = true } = {}) {
    const keep = chromeKeepTexts();
    newsCorpusTexts.forEach((t) => keep.add(t));
    const hasCorpus = newsCorpusTexts.size > 0;
    const windowStart = (typeof window !== 'undefined'
      && window.RadarSessionFreshness?.freshnessWindowStart)
      ? window.RadarSessionFreshness.freshnessWindowStart().getTime()
      : 0;

    for (const key of Object.keys(translationCache)) {
      const rec = unwrapCacheVal(translationCache[key]);
      const { text } = cacheKeyParts(key);
      const norm = String(text || '').replace(/\s+/g, ' ').trim();
      if (!rec || sameMtText(rec.t, text)) {
        delete translationCache[key];
        continue;
      }
      if (keep.has(text) || keep.has(norm)) continue;
      if (hasCorpus) {
        delete translationCache[key];
        continue;
      }
      if (windowStart && rec.ts && rec.ts < windowStart) {
        delete translationCache[key];
      }
    }

    const keys = Object.keys(translationCache);
    if (keys.length > CACHE_MAX) {
      keys.slice(0, keys.length - CACHE_MAX).forEach((k) => {
        delete translationCache[k];
      });
    }
    if (persist) {
      try {
        localStorage.setItem(CACHE_KEY, persistCachePayload());
      } catch { /* quota */ }
    }
  }

  function cleanTranslation(str) {
    if (typeof str !== 'string' || !str) return str;
    let out = str.replace(/<g[^>]*>([\s\S]*?)<\/g>/gi, '$1');
    out = out.replace(/<[^>]+>/g, '');
    out = out
      .replace(/&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return fixInternalTranslationSpacing(out);
  }

  /**
   * gtx mange souvent les espaces de bord (« sous licence » + lien →
   * « na licencjiPowszechna ») et après « Photo: ».
   */
  function fixInternalTranslationSpacing(str = '') {
    let out = String(str);
    // Crédits / libellés « Mot:Texte » → « Mot: Texte »
    out = out.replace(
      /(^|[\s(])((?:Photo|Crédit(?:\s+photo)?|Credit(?:\s+photo)?|Zdjęcie|Foto|Fotografía|Fotoğraf))\s*:(?=\S)/giu,
      '$1$2: ',
    );
    // Deux-points collés avant une lettre (pas les URL https:// ni 12:30) :
    out = out.replace(/:(?!\/\/)(?=[\p{L}])/gu, ': ');
    // Mot collé en camel accidentel : licencjiPowszechna
    out = out.replace(/(\p{Ll}{2,})(\p{Lu}\p{L})/gu, '$1 $2');
    // Ne PAS appeler fixInstitutionMistranslations ici avec original vide :
    // ça réécrivait des phrases hors établissement (régressions de traduction).
    // Les corrections collège/université passent par polishInstitutionTranslation
    // uniquement dans les zones .article-inst / pastilles.
    // Espaces doubles éventuels
    out = out.replace(/ {2,}/g, ' ');
    return out;
  }

  /** Réapplique les espaces de début/fin de l’original (gtx les retire). */
  function reapplyEdgeWhitespace(original, translated) {
    const orig = String(original ?? '');
    let out = String(translated ?? '');
    if (!orig.trim()) return orig;
    const hadLead = /^\s/.test(orig);
    const hadTrail = /\s$/.test(orig);
    out = fixInternalTranslationSpacing(out.replace(/^\s+|\s+$/g, ''));
    if (hadLead) out = ` ${out}`;
    if (hadTrail) out = `${out} `;
    return out;
  }

  /**
   * Phrases UI courtes — gtx invente souvent des contresens (ex. IU sur
   * « Toutes les sources »). On force des libellés fiables (endonymes).
   * Clés = texte source affiché en FR dans le shell.
   */
  const UI_PHRASES = {
    'Toutes les sources': {
      en: 'All sources', es: 'Todas las fuentes', pt: 'Todas as fontes',
      de: 'Alle Quellen', it: 'Tutte le fonti', ht: 'Tout sous',
      zh: '全部来源', 'zh-tw': '全部來源', ar: 'كل المصادر', hi: 'सभी स्रोत',
      ru: 'Все источники', uk: 'Усі джерела', ko: '모든 출처', ja: 'すべての情報源',
      vi: 'Tất cả nguồn', tl: 'Lahat ng pinagmulan', tr: 'Tüm kaynaklar',
      pl: 'Wszystkie źródła', nl: 'Alle bronnen', ro: 'Toate sursele',
      iu: 'Toutes les sources', 'iu-latn': 'Toutes les sources',
    },
    'Plus de sources': {
      en: 'More sources', es: 'Más fuentes', pt: 'Mais fontes',
      de: 'Weitere Quellen', it: 'Altre fonti', zh: '更多来源', 'zh-tw': '更多來源',
      ar: 'المزيد من المصادر', ru: 'Ещё источники', ko: '출처 더보기',
      iu: 'Plus de sources', 'iu-latn': 'Plus de sources',
    },
    'Moins de sources': {
      en: 'Fewer sources', es: 'Menos fuentes', pt: 'Menos fontes',
      de: 'Weniger Quellen', it: 'Meno fonti',
      iu: 'Moins de sources', 'iu-latn': 'Moins de sources',
    },
    "Plus d'articles": {
      en: 'More articles', es: 'Más artículos', pt: 'Mais artigos',
      de: 'Weitere Artikel', it: 'Altri articoli', zh: '更多文章', 'zh-tw': '更多文章',
      ar: 'المزيد من المقالات', ru: 'Ещё статьи', ko: '기사 더보기', ja: '記事をもっと見る',
      vi: 'Thêm bài viết', tl: 'Higit pang mga artikulo', hi: 'और लेख',
      pl: 'Więcej artykułów', nl: 'Meer artikelen', tr: 'Daha fazla makale',
      iu: "Plus d'articles", 'iu-latn': "Plus d'articles",
    },
    'Réduire': {
      en: 'Show less', es: 'Mostrar menos', pt: 'Mostrar menos',
      de: 'Weniger anzeigen', it: 'Mostra meno', zh: '收起', 'zh-tw': '收起',
      ar: 'عرض أقل', ru: 'Свернуть', ko: '접기', ja: '閉じる',
      iu: 'Réduire', 'iu-latn': 'Réduire',
    },
    'À la une': {
      en: 'Top story', es: 'Portada', pt: 'Destaque', de: 'Titelgeschichte',
      it: 'In evidenza', zh: '头条', 'zh-tw': '頭條', ar: 'أبرز الأخبار',
      ru: 'Главное', ko: '헤드라인', ja: 'トップ', hi: 'मुख्य समाचार',
      vi: 'Tin nổi bật', tl: 'Pangunahing balita', tr: 'Manşet',
      pl: 'Na okładce', nl: 'Voorpagina', ht: 'Alain',
      iu: 'À la une', 'iu-latn': 'À la une',
    },
    'En bref': {
      en: 'In brief', es: 'En breve', pt: 'Em breve', de: 'Kurz gemeldet',
      it: 'In breve', zh: '简讯', 'zh-tw': '簡訊', ar: 'باختصار',
      ru: 'Коротко', ko: '한눈에', ja: '手短に', hi: 'संक्षेप में',
      vi: 'Tóm tắt', tl: 'Sa madaling salita', tr: 'Kısaca',
      pl: 'W skrócie', nl: 'In het kort', ht: 'An rezime',
      iu: 'En bref', 'iu-latn': 'En bref',
    },
    'Suite du fil': {
      en: 'More stories', es: 'Más noticias', pt: 'Mais notícias', de: 'Weitere Meldungen',
      it: 'Altre notizie', zh: '更多报道', 'zh-tw': '更多報導', ar: 'المزيد من الأخبار',
      ru: 'Ещё новости', ko: '더 많은 소식', ja: 'その他の記事', hi: 'और समाचार',
      vi: 'Tin khác', tl: 'Iba pang balita', tr: 'Diğer haberler',
      pl: 'Więcej wiadomości', nl: 'Meer berichten', ht: 'Plis nouvèl',
      iu: 'Suite du fil', 'iu-latn': 'Suite du fil',
    },
    'Le fil étudiant': {
      en: 'Student wire', es: 'Hilo estudiantil', pt: 'Fio estudantil',
      de: 'Studierenden-Ticker', it: 'Filo studentesco', zh: '学生资讯',
      ar: 'الخيط الطلابي', ru: 'Студенческая лента',
      iu: 'Le fil étudiant', 'iu-latn': 'Le fil étudiant',
    },
    Par: {
      en: 'By', es: 'Por', pt: 'Por', de: 'Von', it: 'Di', zh: '作者',
      ar: 'بقلم', ru: 'Автор', ko: '글', ja: '執筆', hi: 'लेखक',
      vi: 'Bởi', tl: 'Ni', tr: 'Yazan', pl: 'Autor', nl: 'Door', ht: 'Pa',
      fr: 'Par',
    },
    By: {
      fr: 'Par', es: 'Por', pt: 'Por', de: 'Von', it: 'Di', zh: '作者',
      en: 'By',
    },
    'Lire la suite →': {
      en: 'Read more →', es: 'Leer más →', pt: 'Ler mais →', de: 'Weiterlesen →',
      it: 'Continua →', zh: '阅读全文 →', 'zh-tw': '閱讀全文 →', ar: 'اقرأ المزيد →',
      ru: 'Читать далее →', ko: '더 읽기 →', ja: '続きを読む →', hi: 'और पढ़ें →',
      vi: 'Đọc tiếp →', tl: 'Magbasa pa →', tr: 'Devamını oku →',
      pl: 'Czytaj dalej →', nl: 'Lees verder →', ht: 'Li plis →',
    },
    'Read more →': {
      fr: 'Lire la suite →', es: 'Leer más →', pt: 'Ler mais →', de: 'Weiterlesen →',
      en: 'Read more →',
    },
    'Lire la suite': {
      en: 'Read more', es: 'Leer más', pt: 'Ler mais', de: 'Weiterlesen',
      it: 'Continua', zh: '阅读全文', ar: 'اقرأ المزيد',
    },
    'Read more': {
      fr: 'Lire la suite', es: 'Leer más', pt: 'Ler mais', en: 'Read more',
    },
    Rechercher: {
      en: 'Search', es: 'Buscar', pt: 'Pesquisar', de: 'Suchen', it: 'Cerca',
      zh: '搜索', ar: 'بحث', ru: 'Поиск',
    },
    Search: {
      fr: 'Rechercher', es: 'Buscar', en: 'Search',
    },
    /*
     * Radio — ne pas laisser gtx inventer « ON WAVES » pour EN ONDES.
     * Deux libellés distincts (sinon double « ON AIR » confus) :
     *  - EN ONDES = pastille statut flux (LIVE)
     *  - À l'antenne = panneau grille / émission (NOW PLAYING)
     */
    'EN ONDES': {
      en: 'LIVE', es: 'EN DIRECTO', pt: 'NO AR', de: 'LIVE', it: 'IN ONDA',
      zh: '直播', 'zh-tw': '直播', ar: 'مباشر', ru: 'В ЭФИРЕ', ko: '생방송',
      ja: 'ライブ', hi: 'लाइव', vi: 'TRỰC TIẾP', tr: 'CANLI', pl: 'NA ŻYWO',
      nl: 'LIVE', ht: 'AN DIRÈK',
    },
    "À l'antenne": {
      en: 'NOW PLAYING', es: 'AHORA', pt: 'NO AR AGORA', de: 'JETZT',
      it: 'IN ONDA ORA', zh: '正在播出', 'zh-tw': '正在播出', ar: 'يبث الآن',
      ru: 'СЕЙЧАС В ЭФИРЕ', ko: '지금 방송', ja: '放送中', hi: 'अभी प्रसारित',
      vi: 'ĐANG PHÁT', tr: 'ŞU AN', pl: 'TERAZ', nl: 'NU TE BELUISTEREN',
      ht: 'Kounye a',
    },
    "A l'antenne": {
      en: 'NOW PLAYING', es: 'AHORA', fr: "À l'antenne",
    },
    /*
     * Sports — nœud isolé « match » (pastille 2 lignes) : gtx le prend pour
     * le verbe *to match* → « correspondre ». Phrases unitaires, pas MT.
     * La pastille est aussi `notranslate` : ce glossaire sert le remplissage
     * via displayUiText, et les verbes « reçoit / chez » du rail.
     */
    'Prochains match': {
      en: 'Next games', es: 'Próximos partidos', pt: 'Próximos jogos',
      de: 'Nächste Spiele', it: 'Prossime partite', nl: 'Volgende wedstrijden',
      pl: 'Następne mecze', tr: 'Sonraki maçlar', ru: 'Ближайшие матчи',
      uk: 'Наступні матчі', zh: '下场比赛', 'zh-tw': '下場比賽',
      ar: 'المباريات القادمة', ko: '다음 경기', ja: '次の試合',
      hi: 'अगले मैच', vi: 'Trận tới', ht: 'Pwochèn match',
      fr: 'Prochains match',
    },
    'Prochain match': {
      en: 'Next game', es: 'Próximo partido', pt: 'Próximo jogo',
      de: 'Nächstes Spiel', it: 'Prossima partita', nl: 'Volgende wedstrijd',
      pl: 'Następny mecz', tr: 'Sonraki maç', ru: 'Следующий матч',
      zh: '下场比赛', ar: 'المباراة القادمة', ko: '다음 경기', ja: '次の試合',
      fr: 'Prochain match',
    },
    match: {
      en: 'game', es: 'partido', pt: 'jogo', de: 'Spiel', it: 'partita',
      nl: 'wedstrijd', pl: 'mecz', tr: 'maç', ru: 'матч', uk: 'матч',
      zh: '比赛', 'zh-tw': '比賽', ar: 'مباراة', ko: '경기', ja: '試合',
      hi: 'मैच', vi: 'trận', ht: 'match', fr: 'match',
    },
    Match: {
      en: 'Game', es: 'Partido', pt: 'Jogo', de: 'Spiel', it: 'Partita',
      fr: 'Match',
    },
    'En direct': {
      en: 'Live', es: 'En directo', pt: 'Ao vivo', de: 'Live', it: 'In diretta',
      nl: 'Live', pl: 'Na żywo', tr: 'Canlı', ru: 'В эфире', uk: 'Наживо',
      zh: '直播', 'zh-tw': '直播', ar: 'مباشر', ko: '생중계', ja: 'ライブ',
      hi: 'लाइव', vi: 'Trực tiếp', ht: 'An dirèk',
      fr: 'En direct',
    },
    'En cours': {
      en: 'Live', es: 'En directo', pt: 'Ao vivo', de: 'Live', it: 'In diretta',
      nl: 'Live', pl: 'Na żywo', tr: 'Canlı', ru: 'В эфире', uk: 'Наживо',
      zh: '直播', 'zh-tw': '直播', ar: 'مباشر', ko: '생중계', ja: 'ライブ',
      hi: 'लाइव', vi: 'Trực tiếp', ht: 'An dirèk',
      fr: 'En direct',
    },
    Demain: {
      en: 'Tomorrow', es: 'Mañana', pt: 'Amanhã', de: 'Morgen', it: 'Domani',
      nl: 'Morgen', pl: 'Jutro', tr: 'Yarın', ru: 'Завтра', uk: 'Завтра',
      zh: '明天', ar: 'غدًا', ko: '내일', ja: '明日', hi: 'कल', vi: 'Ngày mai',
      ht: 'Demen', fr: 'Demain',
    },
    Hier: {
      en: 'Yesterday', es: 'Ayer', pt: 'Ontem', de: 'Gestern', it: 'Ieri',
      nl: 'Gisteren', pl: 'Wczoraj', tr: 'Dün', ru: 'Вчера', uk: 'Вчора',
      zh: '昨天', ar: 'أمس', ko: '어제', ja: '昨日', hi: 'कल', vi: 'Hôm qua',
      ht: 'Yè', fr: 'Hier',
    },
    "Aujourd'hui": {
      en: 'Today', es: 'Hoy', pt: 'Hoje', de: 'Heute', it: 'Oggi',
      nl: 'Vandaag', pl: 'Dziś', tr: 'Bugün', ru: 'Сегодня', uk: 'Сьогодні',
      zh: '今天', ar: 'اليوم', ko: '오늘', ja: '今日', hi: 'आज', vi: 'Hôm nay',
      ht: 'Jodi a', fr: "Aujourd'hui",
    },
    'Aujourd’hui': {
      en: 'Today', es: 'Hoy', pt: 'Hoje', de: 'Heute', it: 'Oggi',
      nl: 'Vandaag', pl: 'Dziś', tr: 'Bugün', ru: 'Сегодня',
      zh: '今天', ar: 'اليوم', ko: '오늘', ja: '今日',
      fr: 'Aujourd’hui',
    },
    'Avant-hier': {
      en: '2 days ago', es: 'Anteayer', pt: 'Anteontem', de: 'Vorgestern',
      it: 'L’altro ieri', nl: 'Eergisteren', pl: 'Przedwczoraj',
      tr: 'Evvelsi gün', ru: 'Позавчера', zh: '前天', ar: 'أول أمس',
      ko: '그저께', ja: '一昨日', fr: 'Avant-hier',
    },
    Sports: {
      en: 'Sports', es: 'Deportes', pt: 'Esportes', de: 'Sport', it: 'Sport',
      nl: 'Sport', pl: 'Sport', tr: 'Spor', ru: 'Спорт', zh: '体育',
      ar: 'رياضة', ko: '스포츠', ja: 'スポーツ', fr: 'Sports',
    },
    reçoit: {
      en: 'hosts', es: 'recibe', pt: 'recebe', de: 'empfängt', it: 'ospita',
      nl: 'ontvangt', pl: 'gości', tr: 'ağırlıyor', ru: 'принимает',
      zh: '主场迎战', ar: 'يستضيف', ko: '홈', ja: 'ホーム',
      fr: 'reçoit',
    },
    reçoivent: {
      en: 'host', es: 'reciben', pt: 'recebem', de: 'empfangen', it: 'ospitano',
      fr: 'reçoivent',
    },
    chez: {
      en: 'at', es: 'en casa de', pt: 'em', de: 'bei', it: 'in casa di',
      nl: 'bij', pl: 'u', tr: 'deplasmanda', ru: 'в гостях у',
      zh: '客场', ar: 'خارج الأرض', ko: '원정', ja: 'アウェイ',
      fr: 'chez',
    },
    'Calendrier à venir': {
      en: 'Schedule upcoming', es: 'Calendario por venir',
      pt: 'Calendário a seguir', de: 'Terminplan folgt',
      it: 'Calendario in arrivo', fr: 'Calendrier à venir',
    },
    Accueil: {
      en: 'Home', es: 'Inicio', pt: 'Início', de: 'Start', it: 'Home',
      fr: 'Accueil',
    },
    Médias: {
      en: 'Media', es: 'Medios', pt: 'Mídias', de: 'Medien', it: 'Media',
      fr: 'Médias',
    },
    Journaux: {
      en: 'Newspapers', es: 'Periódicos', pt: 'Jornais', de: 'Zeitungen',
      it: 'Giornali', fr: 'Journaux',
    },
    Radios: {
      en: 'Radio', es: 'Radios', pt: 'Rádios', de: 'Radios', it: 'Radio',
      fr: 'Radios',
    },
    'À venir': {
      // Libellé panneau (text-transform: uppercase → UP NEXT) + sous-titres grille.
      en: 'Up next', es: 'Próximamente', pt: 'A seguir', de: 'Als Nächstes',
      it: 'A seguire', zh: '即将播出', 'zh-tw': '即將播出', ar: 'التالي', ru: 'Далее',
      ko: '다음', ja: '次の番組', hi: 'आगे', vi: 'Sắp tới', tr: 'Sırada',
      nl: 'Hierna', pl: 'Następnie', ht: 'A pwochen',
    },
    'Syntoniser un poste': {
      en: 'Tune a station', es: 'Sintonizar una emisora', pt: 'Sintonizar uma estação',
      de: 'Sender wählen', it: 'Sintonizza una stazione',
    },
    'Les radios étudiantes jouent en direct, 24/7': {
      en: 'Student radio plays live, 24/7',
      es: 'Las radios estudiantiles emiten en directo, 24/7',
    },
    'Radios étudiantes en direct': {
      en: 'Student radio live',
      es: 'Radios estudiantiles en directo',
    },
    'Site externe': {
      en: 'External site', es: 'Sitio externo', pt: 'Site externo',
      de: 'Externe Website', it: 'Sito esterno',
    },
    'Langues autochtones du Québec': {
      en: 'Indigenous languages of Quebec',
      es: 'Lenguas indígenas de Quebec',
      pt: 'Línguas indígenas de Quebec',
      de: 'Indigene Sprachen Quebecs',
      it: 'Lingue indigene del Québec',
      ko: '퀘벡 원주민 언어',
      ja: 'ケベックの先住民言語',
      zh: '魁北克原住民语言',
      'zh-tw': '魁北克原住民語言',
      ar: 'لغات السكان الأصليين في كيبيك',
      ru: 'Языки коренных народов Квебека',
      hi: 'क्यूबेक की आदिवासी भाषाएँ',
      vi: 'Ngôn ngữ bản địa Québec',
      tr: 'Quebec yerli dilleri',
      pl: 'Języki rdzenne Quebecu',
      nl: 'Inheemse talen van Quebec',
      uk: 'Корінні мови Квебеку',
      ht: 'Lang endijèn Kebèk',
    },
    'Autres langues': {
      en: 'Other languages',
      es: 'Otras lenguas',
      pt: 'Outros idiomas',
      de: 'Andere Sprachen',
      it: 'Altre lingue',
      ko: '기타 언어',
      ja: 'その他の言語',
      zh: '其他语言',
      'zh-tw': '其他語言',
      ar: 'لغات أخرى',
      ru: 'Другие языки',
      hi: 'अन्य भाषाएँ',
      vi: 'Ngôn ngữ khác',
      tr: 'Diğer diller',
      pl: 'Inne języki',
      nl: 'Andere talen',
      uk: 'Інші мови',
      ht: 'Lòt lang',
    },
    'Préparation de la langue…': {
      en: 'Preparing the language…', es: 'Preparando el idioma…',
      pt: 'A preparar o idioma…', de: 'Sprache wird vorbereitet…',
      it: 'Preparazione della lingua…', nl: 'Taal wordt voorbereid…',
      pl: 'Przygotowywanie języka…', tr: 'Dil hazırlanıyor…',
      ru: 'Подготовка языка…', uk: 'Підготовка мови…',
      ar: 'جارٍ تجهيز اللغة…', fa: 'آماده‌سازی زبان…',
      he: 'מכינים את השפה…', ur: 'زبان تیار کی جا رہی ہے…',
      zh: '正在准备语言…', 'zh-tw': '正在準備語言…',
      ko: '언어 준비 중…', ja: '言語を準備しています…',
      hi: 'भाषा तैयार हो रही है…', vi: 'Đang chuẩn bị ngôn ngữ…',
      ht: 'N ap prepare lang lan…', el: 'Προετοιμασία γλώσσας…',
      fr: 'Préparation de la langue…',
    },
    'Traduction des articles…': {
      en: 'Translating articles…', es: 'Traduciendo los artículos…',
      pt: 'A traduzir os artigos…', de: 'Artikel werden übersetzt…',
      it: 'Traduzione degli articoli…', nl: 'Artikelen worden vertaald…',
      pl: 'Tłumaczenie artykułów…', tr: 'Yazılar çevriliyor…',
      ru: 'Перевод статей…', uk: 'Переклад статей…',
      ar: 'جارٍ ترجمة المقالات…', fa: 'در حال ترجمهٔ مقاله‌ها…',
      he: 'מתרגמים את הכתבות…', ur: 'مضامین کا ترجمہ ہو رہا ہے…',
      zh: '正在翻译文章…', 'zh-tw': '正在翻譯文章…',
      ko: '기사 번역 중…', ja: '記事を翻訳しています…',
      hi: 'लेख अनूदित हो रहे हैं…', vi: 'Đang dịch bài…',
      ht: 'N ap tradui atik yo…', el: 'Μετάφραση άρθρων…',
      fr: 'Traduction des articles…',
    },
    'Mise en page…': {
      en: 'Laying out the page…', es: 'Maquetando…',
      pt: 'A paginar…', de: 'Seite wird gesetzt…',
      it: 'Impaginazione…', nl: 'Opmaak…',
      pl: 'Skład strony…', tr: 'Sayfa düzenleniyor…',
      ru: 'Вёрстка…', uk: 'Верстка…',
      ar: 'جارٍ تنسيق الصفحة…', fa: 'صفحه‌آرایی…',
      he: 'עימוד…', ur: 'صفحہ آرائی…',
      zh: '正在排版…', 'zh-tw': '正在排版…',
      ko: '페이지 구성 중…', ja: 'レイアウト中…',
      hi: 'पृष्ठ सजाया जा रहा है…', vi: 'Đang dàn trang…',
      ht: 'N ap mete paj la…', el: 'Σελιδοποίηση…',
      fr: 'Mise en page…',
    },
    'Prêt': {
      en: 'Ready', es: 'Listo', pt: 'Pronto', de: 'Fertig',
      it: 'Pronto', nl: 'Klaar', pl: 'Gotowe', tr: 'Hazır',
      ru: 'Готово', uk: 'Готово',
      ar: 'جاهز', fa: 'آماده', he: 'מוכן', ur: 'تیار',
      zh: '完成', 'zh-tw': '完成', ko: '완료', ja: '完了',
      hi: 'तैयार', vi: 'Xong', ht: 'Pare', el: 'Έτοιμο',
      fr: 'Prêt',
    },
    'Afficher les articles dans la langue actuelle': {
      en: 'Show articles in the current language',
      es: 'Mostrar los artículos en el idioma actual',
      pt: 'Mostrar os artigos no idioma atual',
      de: 'Artikel in der aktuellen Sprache anzeigen',
      it: 'Mostra gli articoli nella lingua attuale',
      nl: 'Artikelen in de huidige taal tonen',
      pl: 'Pokaż artykuły w bieżącym języku',
      tr: 'Yazıları geçerli dilde göster',
      ru: 'Показать статьи на текущем языке',
      uk: 'Показати статті поточною мовою',
      ar: 'عرض المقالات باللغة الحالية',
      fa: 'نمایش مقاله‌ها به زبان فعلی',
      he: 'הצגת הכתבות בשפה הנוכחית',
      ur: 'موجودہ زبان میں مضامین دکھائیں',
      zh: '以当前语言显示文章',
      'zh-tw': '以目前語言顯示文章',
      ko: '현재 언어로 기사 보기',
      ja: '現在の言語で記事を表示',
      hi: 'वर्तमान भाषा में लेख दिखाएँ',
      vi: 'Hiện bài bằng ngôn ngữ hiện tại',
      ht: 'Montre atik yo nan lang aktyèl la',
      el: 'Εμφάνιση άρθρων στην τρέχουσα γλώσσα',
      fr: 'Afficher les articles dans la langue actuelle',
    },
  };

  /** Langues où un calque FR figé n’aide pas — laisser gtx tenter. */
  function prefersMachineUi(lang = '') {
    const l = institutionLangKey(lang);
    return /^(iu|ar|fa|he|ur|zh|hi|pa|bn|ta|te|mr|gu|kn|ml|ko|ja|th|am|hy|ka|my|km|lo|si|ne|bo)$/.test(l);
  }

  /** Ne jamais envoyer ces libellés au MT, même en IU/ar (cas « correspondre »). */
  const UI_LOCK_NO_MT = new Set([
    'match', 'Match', 'Prochains match', 'Prochain match',
    'En direct', 'En cours', 'reçoit', 'reçoivent', 'chez',
  ]);

  function uiPhraseLookup(core = '', targetLang = '') {
    const entry = UI_PHRASES[core];
    if (!entry) {
      return UI_LOCK_NO_MT.has(core) ? core : null;
    }
    const lang = institutionLangKey(targetLang);
    if (entry[lang] != null) {
      // Ancien filet « garder le FR en IU » : équivaut à ne pas traduire.
      // Pour les scripts lointains, on laisse plutôt le MT travailler —
      // sauf le chrome sport, où gtx hallucine (match → correspondre).
      if (prefersMachineUi(lang) && entry[lang] === core) {
        return UI_LOCK_NO_MT.has(core) ? core : null;
      }
      return entry[lang];
    }
    if (entry.default != null) return entry.default;
    if (UI_LOCK_NO_MT.has(core)) return core;
    return null;
  }

  function preferredUiPhrase(text = '', targetLang = '') {
    const core = String(text || '').replace(/\s+/g, ' ').trim();
    if (!core) return null;

    const direct = uiPhraseLookup(core, targetLang);
    if (direct != null) return direct;

    // « À venir · 16:00 – 17:00 » (grille radio)
    const upcoming = core.match(/^À venir(?:\s*·\s*(.+))?$/i)
      || core.match(/^Up next(?:\s*·\s*(.+))?$/i);
    if (upcoming) {
      const stem = uiPhraseLookup('À venir', targetLang) || 'Up next';
      return upcoming[1] ? `${stem} · ${upcoming[1]}` : stem;
    }
    // « avec Prénom Nom » (animateur)
    const withHost = core.match(/^avec\s+(.+)$/i) || core.match(/^with\s+(.+)$/i);
    if (withHost) {
      const lang = institutionLangKey(targetLang);
      const prep = ({
        en: 'with', es: 'con', pt: 'com', de: 'mit', it: 'con',
        fr: 'avec', nl: 'met', pl: 'z',
      })[lang] || 'with';
      return `${prep} ${withHost[1]}`;
    }

    // « Plus d'articles (12) » / « More articles (12) »
    const moreFr = core.match(/^Plus d['’]articles\s*\((\d+)\)\s*$/i);
    if (moreFr) {
      const stem = uiPhraseLookup("Plus d'articles", targetLang) || 'More articles';
      return `${stem} (${moreFr[1]})`;
    }
    const moreEn = core.match(/^More articles\s*\((\d+)\)\s*$/i);
    if (moreEn) {
      const stem = uiPhraseLookup('More articles', targetLang)
        || uiPhraseLookup("Plus d'articles", targetLang)
        || 'More articles';
      return `${stem} (${moreEn[1]})`;
    }

    // Compteurs dynamiques « 185 articles » / « 12 sources »
    const countArticles = core.match(/^(\d+)\s+articles?\s*$/i);
    if (countArticles) {
      const n = countArticles[1];
      const lang = institutionLangKey(targetLang);
      if (lang === 'en') return `${n} article${n === '1' ? '' : 's'}`;
      if (lang === 'es') return `${n} artículo${n === '1' ? '' : 's'}`;
      if (lang === 'pt') return `${n} artigo${n === '1' ? '' : 's'}`;
      if (lang === 'de') return `${n} Artikel`;
      if (lang === 'it') return `${n} articol${n === '1' ? 'o' : 'i'}`;
      if (lang === 'zh' || lang === 'zh-tw') return `${n} 篇文章`;
      if (lang === 'ar') return `${n} مقالة`;
      if (lang === 'ru') return `${n} статей`;
      if (lang === 'ko') return `기사 ${n}개`;
      if (lang === 'ja') return `${n}本の記事`;
      if (lang === 'fr') return `${n} article${n === '1' ? '' : 's'}`;
    }

    return null;
  }

  function sameMtText(a = '', b = '') {
    return String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
  }

  async function fetchJsonTimed(url, ms = MT.timeoutMs) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), ms);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) return { data: null, aborted: false, status: resp.status };
      return { data: await resp.json(), aborted: false, status: resp.status };
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      return { data: null, aborted, status: 0 };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function readGtxText(data) {
    const raw = data?.[0]?.map((s) => s?.[0]).filter(Boolean).join('');
    return cleanTranslation(raw || '')?.replace(/^\s+|\s+$/g, '') || '';
  }

  async function fetchMachineTranslation(core, tl) {
    const encoded = encodeURIComponent(core);
    const tls = gtxTargetCodes(tl);
    // fr = originaux Radar ; auto si sl=fr échoue ; en = sonde IU (probe sl=en).
    const sources = ['fr', 'auto', 'en'];

    gtxLoop:
    for (const gtl of tls) {
      for (const sl of sources) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(gtl)}&dt=t&q=${encoded}`;
        const res = await fetchJsonTimed(url);
        const translated = readGtxText(res.data);
        if (translated && !sameMtText(translated, core)) return translated;
        if (res.aborted) break gtxLoop;
      }
    }

    try {
      const mm = mymemoryLang(tl);
      const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=fr|${encodeURIComponent(mm)}`;
      const res = await fetchJsonTimed(url);
      const payload = res.data;
      if (payload?.responseStatus === 200 && payload.responseData?.translatedText) {
        const translated = cleanTranslation(payload.responseData.translatedText)
          ?.replace(/^\s+|\s+$/g, '') || '';
        if (translated && !sameMtText(translated, core) && translated !== core.toUpperCase()) {
          return translated;
        }
      }
    } catch { /* keep original */ }

    return null;
  }

  async function translateText(text, targetLang) {
    const original = String(text || '');
    if (!original.trim()) return original;
    // Traduire le cœur sans espaces de bord (clé de cache stable)
    const core = original.replace(/^\s+|\s+$/g, '');
    const tl = gtxLang(targetLang);
    const key = cacheKey(core, tl);

    const finish = (translatedCore) => reapplyEdgeWhitespace(original, translatedCore);

    const cached = cacheGet(key);
    if (cached != null) return finish(cached);

    // Phrases UI connues : pas de MT (évite les contresens)
    const uiHit = preferredUiPhrase(core, targetLang);
    if (uiHit != null) {
      cacheSet(key, uiHit);
      return finish(uiHit);
    }

    if (inflight.has(key)) {
      const shared = await inflight.get(key);
      return finish(shared != null ? shared : core);
    }

    const work = (async () => {
      // Très longs : découper par phrases approximatives
      if (core.length > MAX_CHUNK) {
        const parts = splitLong(core, MAX_CHUNK);
        const out = [];
        let anyReal = false;
        for (const part of parts) {
          const piece = await translateText(part, targetLang);
          out.push(piece);
          if (piece && !sameMtText(piece, part)) anyReal = true;
        }
        const joined = fixInternalTranslationSpacing(out.join('')).replace(/^\s+|\s+$/g, '');
        if (anyReal && !sameMtText(joined, core)) cacheSet(key, joined);
        return anyReal ? joined : core;
      }

      const translated = await fetchMachineTranslation(core, tl);
      if (translated) {
        cacheSet(key, translated);
        return translated;
      }
      return core;
    })();

    inflight.set(key, work);
    try {
      const translatedCore = await work;
      return finish(translatedCore);
    } finally {
      inflight.delete(key);
    }
  }

  function splitLong(text, max) {
    const parts = [];
    let rest = text;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function addProtectedName(set, raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 2) return;
    set.add(t);
    set.add(t.toLowerCase());
    // Sans parenthèse finale « (ATM – journalisme) »
    const stripped = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (stripped && stripped !== t) {
      set.add(stripped);
      set.add(stripped.toLowerCase());
    }
  }

  function loadProtectedMediaNames() {
    if (mediaNamesReady) return Promise.resolve();
    return fetch('./news-sources.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        for (const s of data?.active || []) {
          if (s?.name) addProtectedName(protectedMediaNames, s.name);
          if (s?.institution) addProtectedName(protectedInstitutionNames, s.institution);
        }
        for (const s of data?.candidates || []) {
          if (s?.name) addProtectedName(protectedMediaNames, s.name);
          if (s?.institution) addProtectedName(protectedInstitutionNames, s.institution);
        }
        mediaNamesReady = true;
      })
      .catch(() => {
        mediaNamesReady = true;
      });
  }

  function nameInSet(set, text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (set.has(t) || set.has(t.toLowerCase())) return true;
    for (const name of set) {
      if (!name || name.length < 2) continue;
      if (t === name || t.toLowerCase() === String(name).toLowerCase()) return true;
    }
    return false;
  }

  function isProtectedMediaName(text = '') {
    return nameInSet(protectedMediaNames, text);
  }

  function isProtectedInstitutionName(text = '') {
    return nameInSet(protectedInstitutionNames, text);
  }

  /** Langue cible du passage de traduction en cours (null hors translateDom). */
  let translateTargetLang = null;

  /**
   * Localiser les noms d’établissements seulement hors Original / FR / EN.
   * Original, français et anglais : libellés d’origine tels quels
   * (Université McGill, McGill University, Cégep… selon la source).
   * Autres langues (ES, PT…) : Universidad…, Colegio…, etc.
   */
  function shouldLocalizeInstitutions(targetLang = translateTargetLang) {
    if (!targetLang) return false;
    const lang = institutionLangKey(targetLang);
    if (!lang || lang === 'fr' || lang === 'en') return false;
    return true;
  }

  /** Pastilles sources, barre compacte, meta article (institution). */
  function isInstitutionLabelZone(node) {
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el || el.nodeType !== 1) return false;
    // Sous-titre « Toutes les sources » : copie UI, pas un nom d’établissement.
    if (el.closest?.('.filter-btn--all')) return false;
    return !!(el.closest?.('.filter-btn__inst, .filters-compact__inst, .article-inst'));
  }

  /** Zone institution ET langue où la localisation est autorisée. */
  function isTranslatableInstitutionZone(node) {
    if (!shouldLocalizeInstitutions()) return false;
    return isInstitutionLabelZone(node);
  }

  /**
   * Noms propres à ne pas traduire (média, établissement hors localisation,
   * ou libellé composé « poste · institution » dans le tuner).
   */
  function isProtectedProperName(text = '', node = null) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (isProtectedMediaName(t)) return true;

    // Original / FR / EN : ne pas localiser les établissements
    if (isInstitutionLabelZone(node) && !shouldLocalizeInstitutions()) {
      return true;
    }

    // Autres langues : autoriser la localisation dans les zones institution
    if (isProtectedInstitutionName(t)) {
      if (isTranslatableInstitutionZone(node)) return false;
      return true;
    }
    // Segments séparés par point médian / barre (tuner, etc.)
    const parts = t.split(/\s*[·|•]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (isTranslatableInstitutionZone(node)) {
        if (parts.some((p) => isProtectedMediaName(p))) return true;
        return false;
      }
      if (parts.some((p) => isProtectedInstitutionName(p) || isProtectedMediaName(p))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Libellés d’établissements fiables par langue.
   *
   * Cégeps : n’existent qu’au Québec — comme Dawson, on mappe le *type* vers
   * College / Colegio / Colégio / Collège et on garde le toponyme (pas de MT
   * libre qui invente « Universidad … »).
   */
  const INSTITUTION_LABELS = {
    'Dawson College': {
      fr: 'Collège Dawson',
      en: 'Dawson College',
      es: 'Colegio Dawson',
      pt: 'Colégio Dawson',
      de: 'Dawson College',
      it: 'Dawson College',
      pl: 'Dawson College',
      default: 'Dawson College',
    },
    "Bishop's University": {
      fr: "Université Bishop's",
      en: "Bishop's University",
      es: "Universidad Bishop's",
      pt: "Universidade Bishop's",
      de: "Bishop's University",
      default: "Bishop's University",
    },
    'Polytechnique Montréal': {
      fr: 'Polytechnique Montréal',
      en: 'Polytechnique Montréal',
      es: 'Polytechnique Montréal',
      default: 'Polytechnique Montréal',
    },
    'Université de Montréal': {
      fr: 'Université de Montréal',
      en: 'Université de Montréal',
      es: 'Universidad de Montréal',
      pt: 'Universidade de Montréal',
      default: 'Université de Montréal',
    },
    'Université Laval': {
      fr: 'Université Laval',
      en: 'Université Laval',
      es: 'Universidad Laval',
      pt: 'Universidade Laval',
      default: 'Université Laval',
    },
    'Université de Sherbrooke': {
      fr: 'Université de Sherbrooke',
      en: 'Université de Sherbrooke',
      es: 'Universidad de Sherbrooke',
      pt: 'Universidade de Sherbrooke',
      default: 'Université de Sherbrooke',
    },
    'Université McGill': {
      fr: 'Université McGill',
      en: 'McGill University',
      es: 'Universidad McGill',
      pt: 'Universidade McGill',
      default: 'Université McGill',
    },
    'McGill University': {
      fr: 'Université McGill',
      en: 'McGill University',
      es: 'Universidad McGill',
      pt: 'Universidade McGill',
      default: 'McGill University',
    },
    'Concordia University': {
      fr: 'Université Concordia',
      en: 'Concordia University',
      es: 'Universidad Concordia',
      pt: 'Universidade Concordia',
      default: 'Concordia University',
    },
    'Université du Québec à Montréal': {
      fr: 'Université du Québec à Montréal',
      en: 'Université du Québec à Montréal',
      es: 'Universidad de Quebec en Montréal',
      pt: 'Universidade de Quebec em Montréal',
      default: 'Université du Québec à Montréal',
    },
    UQAM: {
      fr: 'Université du Québec à Montréal',
      en: 'Université du Québec à Montréal',
      es: 'Universidad de Quebec en Montréal',
      pt: 'Universidade de Quebec em Montréal',
      default: 'Université du Québec à Montréal',
    },
    'Université du Québec à Trois-Rivières': {
      fr: 'Université du Québec à Trois-Rivières',
      en: 'Université du Québec à Trois-Rivières',
      es: 'Universidad de Quebec en Trois-Rivières',
      pt: 'Universidade de Quebec em Trois-Rivières',
      default: 'Université du Québec à Trois-Rivières',
    },
  };

  /** Langues où l’on adapte le *type* (Universidad / Universidade…). */
  const INSTITUTION_TYPE_LOCALIZE = new Set([
    'es', 'pt', 'de', 'it', 'pl', 'nl', 'ro', 'ca',
  ]);

  function institutionLangKey(targetLang = '') {
    const raw = String(targetLang || '').toLowerCase();
    if (raw.startsWith('zh')) return raw.includes('tw') || raw.includes('hant') ? 'zh-tw' : 'zh';
    if (raw === 'iw') return 'he';
    if (raw === 'fil') return 'tl';
    if (raw === 'iu-latn' || raw.startsWith('iu-latn') || raw === 'ike-latn') return 'iu-latn';
    return raw.split(/[-_]/)[0] || raw;
  }

  /**
   * Cégeps et collèges du Québec ≠ universités.
   * Un cégep / college préuniversitaire ne doit jamais être libellé
   * « University / Universidad / Universidade / … ».
   */
/* RADAR:QC_COLLEGE_PLACE_PARTS:BEGIN */
  // Dérivé de institutions.json (type=cegep) — `node scripts/sync-college-places.js`
  const QC_COLLEGE_PLACE_PARTS = [
      "[eé]douard[\\s-]?Montpetit",
      "Ahuntsic",
      "Alma",
      "Andr[eé][\\s-]?Grasset",
      "Andr[eé][\\s-]?Laurendeau",
      "Baie[\\s-]?Comeau",
      "Beauce[\\s-]?Appalaches",
      "Bois[\\s-]?de[\\s-]?Boulogne",
      "Champlain",
      "Champlain campus de Lennoxville",
      "Champlain campus Saint[\\s-]?Lambert",
      "Champlain campus Saint[\\s-]?Lawrence",
      "Champlain Regional",
      "Chicoutimi",
      "Dawson",
      "Drummondville",
      "G[eé]rald[\\s-]?Godin",
      "Garneau",
      "Granby",
      "Heritage",
      "Institut maritime du Qu[eé]bec",
      "Institution Kiuna",
      "Jean[\\s-]?de[\\s-]?Br[eé]beuf",
      "John Abbott",
      "John\\s+Abbott",
      "Jonqui[eè]re",
      "l'Abitibi[\\s-]?T[eé]miscamingue",
      "l'Outaouais",
      "L[eé]vis",
      "la Gasp[eé]sie et des Îles",
      "La Pocati[eè]re",
      "Limoilou",
      "Lionel[\\s-]?Groulx",
      "Maisonneuve",
      "Marie[\\s-]?Victorin",
      "Matane",
      "Montmorency",
      "r[eé]gional Champlain de Saint[\\s-]?Lambert",
      "r[eé]gional de Lanaudi[eè]re",
      "r[eé]gional de Lanaudi[eè]re [aà] Joliette",
      "r[eé]gional de Lanaudi[eè]re [aà] L'Assomption",
      "r[eé]gional de Lanaudi[eè]re [aà] Terrebonne",
      "Rimouski",
      "Rivi[eè]re[\\s-]?du[\\s-]?Loup",
      "Rosemont",
      "Saint[\\s-]?F[eé]licien",
      "Saint[\\s-]?Hyacinthe",
      "Saint[\\s-]?J[eé]rôme",
      "Saint[\\s-]?Jean[\\s-]?sur[\\s-]?Richelieu",
      "Saint[\\s-]?Laurent",
      "Sainte[\\s-]?Foy",
      "Sept[\\s-]?Îles",
      "Shawinigan",
      "Sherbrooke",
      "Sorel[\\s-]?Tracy",
      "Thetford",
      "Trois[\\s-]?Rivi[eè]res",
      "Valleyfield",
      "Vanier",
      "Victoriaville",
      "Vieux Montr[eé]al",
      "Vieux[\\s-]?Montr[eé]al",
  ];
  const QC_COLLEGE_PLACE_RE = new RegExp(QC_COLLEGE_PLACE_PARTS.join('|'), 'i');
/* RADAR:QC_COLLEGE_PLACE_PARTS:END */

  function isCegepInstitutionName(name = '') {
    return /^c[eé]gep\b/i.test(String(name || '').replace(/\s+/g, ' ').trim());
  }

  /**
   * Mots-type « collège » dans les langues où on localise le type.
   *
   * Le type peut arriver en tête (« Collège de Maisonneuve ») ou en queue
   * (« Vanier College », « Dawson College ») : il faut pouvoir le retirer des
   * deux côtés avant de le réappliquer, sinon on le compte deux fois.
   */
  const COLLEGE_TYPE_WORDS = 'coll[eè]ge|college|colegio|col[eé]gio|colegiul|col·legi';
  const COLLEGE_TYPE_LEAD_RE = new RegExp(`^(?:${COLLEGE_TYPE_WORDS})\\b\\s*`, 'i');
  const COLLEGE_TYPE_TAIL_RE = new RegExp(`\\s*\\b(?:${COLLEGE_TYPE_WORDS})$`, 'i');

  /** Retire le mot-type en tête ET en queue — rend le formatage idempotent. */
  function stripCollegeTypeWords(name = '') {
    return String(name)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(COLLEGE_TYPE_LEAD_RE, '')
      .replace(COLLEGE_TYPE_TAIL_RE, '')
      .trim();
  }

  function isCollegeInstitutionName(name = '') {
    const t = String(name || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    // Préfixe Collège / College / Colegio…
    if (/^(?:coll[eè]ge|college|colegio|col[eé]gio|col·legi)\b/i.test(t)) return true;
    // Dawson College et collèges anglo du réseau collégial québécois
    if (/^dawson\s+college$/i.test(t)) return true;
    // Formes localisées « Jonquière College », « Vieux Montréal College » (cégep → College)
    // ou collèges CEGEP-network : jamais des universités.
    if (/\bcollege$/i.test(t) && QC_COLLEGE_PLACE_RE.test(t)) return true;
    return false;
  }

  /** Cégep ou collège québécois (préuniversitaire / technique) — pas une université. */
  function isCegepOrCollegeInstitution(name = '') {
    return isCegepInstitutionName(name) || isCollegeInstitutionName(name);
  }

  /**
   * Frontière de mot compatible accents : en JS, `\b` après `é` échoue
   * (é n’est pas un « word char » ASCII) — d’où « Université » non détectée.
   */
  function uniTypePrefixRe() {
    // Université | University | Universidad | Universidade | Universität | …
    return /^(?:universit(?:é|e|y|ad|ade|ät|à|eit|atea|at)|university)(?=\s|$|[^A-Za-z])/i;
  }

  function isUniversityInstitutionName(name = '') {
    const t = String(name || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    // Garde-fou : un cégep / collège n’est jamais une université
    if (isCegepOrCollegeInstitution(t)) return false;
    if (/^(?:UQAM|UdeM|ULaval|UdeS|UQTR|UQAC|UQAR|UQO|UQAT)$/i.test(t)) return true;
    if (uniTypePrefixRe().test(t)) return true;
    if (/\buniversity$/i.test(t)) return true;
    if (/^(?:mcgill|concordia)\b/i.test(t) && !/\bcollege\b/i.test(t)) return true;
    return false;
  }

  /**
   * Si l’original est un cégep/collège, retire tout libellé de type université
   * introduit par MT ou une mauvaise localisation.
   */
  function demoteUniversityLabelIfCollege(original = '', translated = '', lang = '') {
    if (!isCegepOrCollegeInstitution(original)) return translated;
    let t = String(translated || '');
    if (!t) return t;

    const L = institutionLangKey(lang || translateTargetLang || '');

    // Remplacer les mots-type « université » par l’équivalent collège selon la langue
    const collegeType = ({
      fr: 'Collège',
      es: 'Colegio',
      pt: 'Colégio',
      it: 'College',
      de: 'College',
      pl: 'College',
      nl: 'College',
      ro: 'Colegiul',
      ca: 'Col·legi',
      en: 'College',
    })[L] || 'College';

    // Remplace tout type « université / university / universidad… » (accents inclus).
    // Pas de `\b` après `é` : en JS ça ne matche pas « Université ».
    t = t
      .replace(/(?<![A-Za-z])Universidades?(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universidad(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universidade(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universität(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Università(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Uniwersytet(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universiteit(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universitatea(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universitat(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])Universit[eé](?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])University(?![A-Za-z])/giu, collegeType)
      .replace(/(?<![A-Za-z])univ\.(?![A-Za-z])/giu, collegeType);

    // « College of Dawson » / calques inutiles → nom propre + College
    if (/\bdawson\b/i.test(original) || /\bdawson\b/i.test(t)) {
      if (L === 'es') t = t.replace(/\b(?:Colegio|College|Collège)\s+(?:de\s+|del\s+)?Dawson\b/giu, 'Colegio Dawson')
        .replace(/\bDawson\s+(?:Colegio|College|Collège|University|Universidad)\b/giu, 'Colegio Dawson');
      else if (L === 'pt') t = t.replace(/\b(?:Colégio|College|Collège)\s+(?:de\s+|do\s+)?Dawson\b/giu, 'Colégio Dawson')
        .replace(/\bDawson\s+(?:Colégio|College|Collège|University|Universidade)\b/giu, 'Colégio Dawson');
      else if (L === 'fr') t = t.replace(/\b(?:Collège|College)\s+(?:de\s+)?Dawson\b/giu, 'Collège Dawson')
        .replace(/\bDawson\s+(?:Collège|College|Université|University)\b/giu, 'Collège Dawson');
      else t = t.replace(/\b(?:College|Collège|Colegio|Colégio)\s+(?:de\s+|of\s+)?Dawson\b/giu, 'Dawson College')
        .replace(/\bDawson\s+(?:College|Collège|University|Universidad|Université)\b/giu, 'Dawson College');
    }

    // Cégep : si le type a été perdu, préférer un libellé collège stable
    if (isCegepInstitutionName(original) && /\buniversit/i.test(t)) {
      const preferred = preferredInstitutionLabel(original, L || lang);
      if (preferred) return preferred;
    }

    return t;
  }

  /**
   * Universités : pas de MT libre (gtx invente des syllabiques / casse les
   * noms propres). Glossaire d’abord ; sinon adaptation du type pour es/pt/…
   * ou conservation du nom officiel.
   */
  function formatUniversityLabel(name = '', lang = 'fr') {
    const key = String(name || '').replace(/\s+/g, ' ').trim();
    if (!key) return null;

    // Acronymes → forme longue officielle (FR) avant localisation du type
    const expanded = INSTITUTION_LABELS[key]?.fr
      || INSTITUTION_LABELS[key]?.default
      || key;

    // Glossaire exact (y compris entrée acronyme)
    const entry = INSTITUTION_LABELS[key]
      || INSTITUTION_LABELS[expanded]
      || Object.entries(INSTITUTION_LABELS).find(
        ([k]) => k.toLowerCase() === key.toLowerCase()
          || k.toLowerCase() === expanded.toLowerCase(),
      )?.[1];
    if (entry) {
      // Forme dédiée pour la langue cible
      if (entry[lang] != null) return entry[lang];
      // Scripts lointains (IU, ar, …) : pas de default FR — laisser gtx
      if (prefersMachineUi(lang)) return null;
      // Langues à type localisable sans entrée : dériver plus bas depuis FR
      if (!INSTITUTION_TYPE_LOCALIZE.has(lang)) {
        return entry.default || expanded;
      }
      // continue avec expanded (FR) pour Universidad / Universidade…
    }

    // Hors langues à type localisable : conserver le nom officiel
    // (sauf prefersMachineUi : null → MT côté preferredInstitutionLabel)
    if (!INSTITUTION_TYPE_LOCALIZE.has(lang)) {
      if (prefersMachineUi(lang)) return null;
      return expanded;
    }

    const typeWord = {
      es: 'Universidad',
      pt: 'Universidade',
      de: 'Universität',
      it: 'Università',
      pl: 'Uniwersytet',
      nl: 'Universiteit',
      ro: 'Universitatea',
      ca: 'Universitat',
    }[lang] || 'University';

    // « McGill University », « Concordia University »
    let m = expanded.match(/^(.+?)\s+University$/i);
    if (m) {
      const place = m[1].trim();
      if (lang === 'de') return `${place}-${typeWord}`;
      return `${typeWord} ${place}`;
    }

    // « Université de Montréal », « Université du Québec à … », « Université Laval »
    m = expanded.match(/^Universit[eé]\s+(de\s+|du\s+|des\s+|d['’]\s*)?(.+)$/i);
    if (m) {
      const particle = (m[1] || '').toLowerCase().trim();
      const rest = m[2].trim();
      if (lang === 'es') {
        if (!particle) return `${typeWord} ${rest}`;
        if (particle.startsWith('du')) return `${typeWord} del ${rest}`;
        return `${typeWord} de ${rest}`;
      }
      if (lang === 'pt') {
        if (!particle) return `${typeWord} ${rest}`;
        if (particle.startsWith('du')) return `${typeWord} do ${rest}`;
        return `${typeWord} de ${rest}`;
      }
      if (lang === 'de') {
        const place = rest.replace(/^(de|du|des|d['’])\s+/i, '').trim();
        return `${typeWord} ${place}`;
      }
      if (lang === 'it') {
        if (!particle) return `${typeWord} ${rest}`;
        return `${typeWord} di ${rest.replace(/^(de|du|des)\s+/i, '')}`;
      }
      if (lang === 'pl') {
        const place = rest.replace(/^(de|du|des|d['’])\s+/i, '').trim();
        return `${typeWord} ${place}`;
      }
      if (lang === 'nl' || lang === 'ca' || lang === 'ro') {
        if (!particle) return `${typeWord} ${rest}`;
        return `${typeWord} de ${rest.replace(/^(de|du|des)\s+/i, '')}`;
      }
      return expanded;
    }

    return expanded;
  }

  /**
   * Sépare « Cégep de Jonquière (ATM – journalisme) »
   * → particle « de », place « Jonquière », note « (ATM – journalisme) ».
   */
  function parseCegepParts(name = '') {
    const raw = String(name).replace(/\s+/g, ' ').trim()
      .replace(/^c[eé]gep\b/i, 'Cégep');
    const m = raw.match(
      /^Cégep\s+(de|du|des|d')\s+(.+?)(?:\s*(\([^)]*\)))?\s*$/i,
    );
    if (!m) {
      const loose = raw.match(/^Cégep\s+(.+?)(?:\s*(\([^)]*\)))?\s*$/i);
      if (!loose) return null;
      return { particle: '', place: loose[1].trim(), note: (loose[2] || '').trim() };
    }
    return {
      particle: m[1].toLowerCase().replace(/^d'$/i, "d'"),
      place: m[2].trim(),
      note: (m[3] || '').trim(),
    };
  }

  function localizeCegepNote(note = '', lang = 'fr') {
    if (!note) return '';
    if (lang === 'en') {
      return note
        .replace(/\bjournalisme\b/gi, 'journalism')
        .replace(/\barts?\s+et\s+lettres\b/gi, 'arts and letters');
    }
    return note;
  }

  /**
   * Cégep → équivalent « college » hors FR (comme Dawson College → Colegio Dawson).
   * FR : on garde le mot officiel « Cégep ».
   */
  function formatCegepLabel(name = '', lang = 'fr') {
    const parts = parseCegepParts(name);
    if (!parts) {
      return String(name).replace(/\s+/g, ' ').trim().replace(/^c[eé]gep\b/i, 'Cégep');
    }
    const { particle, note } = parts;
    // Même garde que pour les collèges : si le toponyme portait déjà un
    // mot-type, ne pas le réappliquer par-dessus.
    const place = stripCollegeTypeWords(parts.place) || parts.place;
    const noteLoc = localizeCegepNote(note, lang);
    const noteSuffix = noteLoc ? ` ${noteLoc}` : '';

    // Français : libellé institutionnel officiel
    if (lang === 'fr') {
      const p = particle === "d'" ? "d'" : (particle ? `${particle} ` : '');
      return `Cégep ${p}${place}${noteSuffix}`.replace(/\s+/g, ' ').trim();
    }

    // Anglais : « Jonquière College », « Vieux Montréal College » (style Dawson)
    if (lang === 'en') {
      return `${place} College${noteSuffix}`.replace(/\s+/g, ' ').trim();
    }

    // Espagnol / portugais : Colegio/Colégio + particule adaptée
    if (lang === 'es') {
      let p = particle;
      if (p === 'du') p = 'del';
      else if (p === "d'") p = 'de';
      else if (p === 'des') p = 'de';
      else if (!p) p = 'de';
      const join = p === 'de' || p === 'del' ? `${p} ` : `${p} `;
      return `Colegio ${join}${place}${noteSuffix}`.replace(/\s+/g, ' ').trim();
    }
    if (lang === 'pt') {
      let p = particle;
      if (p === 'du') p = 'do';
      else if (p === "d'") p = 'de';
      else if (p === 'des') p = 'de';
      else if (!p) p = 'de';
      return `Colégio ${p} ${place}${noteSuffix}`.replace(/\s+/g, ' ').trim();
    }

    // Autres langues : même schéma qu’en anglais (toponyme + College)
    return `${place} College${noteSuffix}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Collège Lionel-Groulx, Collège de Maisonneuve, Dawson College…
   * Type adapté à la langue ; nom propre intact (modèle Dawson).
   */
  function formatCollegeLabel(name = '', lang = 'fr') {
    const raw = String(name).replace(/\s+/g, ' ').trim();
    // Dawson passe par le glossaire quelle que soit la forme reçue
    // (« Dawson College », « Colegio Dawson », « Collège Dawson »…) : sinon un
    // second passage produisait « Colegio de Colegio Dawson ».
    if (/\bdawson\b/i.test(raw)) {
      const entry = INSTITUTION_LABELS['Dawson College'];
      return (entry && (entry[lang] || entry.default)) || 'Dawson College';
    }
    const rest = stripCollegeTypeWords(raw);
    if (!rest) return raw;
    // EN : « Maisonneuve College » si « de Maisonneuve », sinon « Lionel-Groulx College »
    if (lang === 'en') {
      const place = rest.replace(/^(de|du|des|d')\s+/i, '').trim();
      return `${place} College`;
    }
    if (lang === 'es') {
      let r = rest.replace(/^du\s+/i, 'del ').replace(/^d'\s*/i, 'de ');
      if (!/^(de|del)\s/i.test(r)) r = `de ${r}`;
      return `Colegio ${r}`;
    }
    if (lang === 'pt') {
      let r = rest.replace(/^du\s+/i, 'do ').replace(/^d'\s*/i, 'de ');
      if (!/^(de|do)\s/i.test(r)) r = `de ${r}`;
      return `Colégio ${r}`;
    }
    if (lang === 'de' || lang === 'it' || lang === 'pl') {
      const place = rest.replace(/^(de|du|des|d')\s+/i, '').trim();
      return `${place} College`;
    }
    // Autres langues : même convention que formatCegepLabel (« toponyme +
    // College », modèle Dawson). Renvoyer un « Collège … » français ici mettait
    // les deux fonctions en désaccord pour nl / ro / ca — et un libellé français
    // n'a de sens dans aucune de ces langues.
    const place = rest.replace(/^(de|du|des|d')\s+/i, '').trim();
    return `${place} College`;
  }

  function preferredInstitutionLabel(original = '', targetLang = '') {
    // Pas de glossaire / mapping en Original, FR ou EN
    if (!shouldLocalizeInstitutions(targetLang)) return null;

    const key = String(original || '').replace(/\s+/g, ' ').trim();
    if (!key) return null;
    const lang = institutionLangKey(targetLang);

    // Acronymes courts (UdeM, McGill, Dawson…) : neutres — ne pas MT / étendre.
    // La localisation porte sur les formes longues « Université … », « Cégep … ».
    if (/^(?:UQAM|UdeM|ULaval|UdeS|UQTR|UQAC|UQAR|UQO|UQAT|CVM|McGill|Concordia|Dawson|Poly)$/i.test(key)
      || /^Poly\s+Montr[eé]al$/i.test(key)
      || /^Bishop'?s$/i.test(key)) {
      return key;
    }

    // Ordre critique : cégep/collège AVANT université, pour ne jamais
    // promouvoir un collège québécois en « University / Universidad ».

    // 1) Cégeps → College / Colegio… (jamais Universidad)
    //    Scripts lointains : null → gtx (évite de figer « Jonquière College » en IU/ar).
    if (isCegepInstitutionName(key)) {
      if (prefersMachineUi(lang)) return null;
      return formatCegepLabel(key, lang);
    }

    // 2) Collèges / colleges (Dawson, formes « X College », etc.)
    if (isCollegeInstitutionName(key)) {
      if (prefersMachineUi(lang)) {
        // Glossaire (Dawson) s’il a une entrée pour la langue ; sinon MT
        const dawson = INSTITUTION_LABELS['Dawson College'];
        if (/^dawson\s+college$/i.test(key) && dawson?.[lang] != null) return dawson[lang];
        return null;
      }
      return formatCollegeLabel(key, lang);
    }

    // 3) Glossaire exact (Bishop's = univ, Polytechnique, UdeM…)
    //    Dawson est aussi dans le glossaire, mais déjà traité en (2).
    const entry = INSTITUTION_LABELS[key]
      || Object.entries(INSTITUTION_LABELS).find(
        ([k]) => k.toLowerCase() === key.toLowerCase(),
      )?.[1];
    if (entry) {
      // Entrée dédiée pour la langue → l’utiliser
      if (entry[lang] != null) {
        const label = entry[lang];
        if (isCegepOrCollegeInstitution(key)) {
          return demoteUniversityLabelIfCollege(key, label, lang);
        }
        return label;
      }
      // Scripts lointains (IU, ar, hi…) : ne PAS renvoyer le default FR/EN
      // (sinon les pastilles sources restent en français et gtx ne tourne jamais).
      if (prefersMachineUi(lang)) return null;
      // Langues à type localisable sans entrée : dériver Universidad… depuis FR
      if (INSTITUTION_TYPE_LOCALIZE.has(lang)) {
        const base = entry.fr || entry.default || key;
        if (isUniversityInstitutionName(base) || isUniversityInstitutionName(key)) {
          const mapped = formatUniversityLabel(base, lang);
          if (mapped && mapped !== base && mapped !== key) return mapped;
        }
        if (isCegepOrCollegeInstitution(key)) {
          return formatCegepLabel(key, lang) || formatCollegeLabel(key, lang);
        }
      }
      const label = entry.default || entry.fr || null;
      if (label && isCegepOrCollegeInstitution(key)) {
        return demoteUniversityLabelIfCollege(key, label, lang);
      }
      return label;
    }

    // 4) Universités — mapping type (Universidad / University…) sans MT
    if (isUniversityInstitutionName(key)) {
      const mapped = formatUniversityLabel(key, lang);
      // Si le mapping n’a rien changé (ex. IU, hi, ar) → null pour laisser gtx
      // dans les zones pastilles / meta (sinon les Sources restent en français).
      if (mapped && mapped !== key) return mapped;
      if (prefersMachineUi(lang) || !INSTITUTION_TYPE_LOCALIZE.has(lang)) return null;
      return mapped || key;
    }

    // 5) Non reconnu : MT autorisé hors FR/EN (null = appel gtx côté translateDom)
    return null;
  }

  /** Filet de casse après gtx (ex. ES : « universidad laval »). */
  function fixInstitutionTranslationCasing(str = '') {
    // Lookarounds ASCII : `\b` casse sur les accents (é, è, ç…).
    let s = String(str);
    s = s.replace(/(?<![A-Za-z])université(?![A-Za-z])/giu, 'Université');
    s = s.replace(/(?<![A-Za-z])universite(?![A-Za-z])/giu, 'Université');
    s = s.replace(/(?<![A-Za-z])university(?![A-Za-z])/giu, 'University');
    s = s.replace(/(?<![A-Za-z])universidad(?![A-Za-z])/giu, 'Universidad');
    s = s.replace(/(?<![A-Za-z])universidade(?![A-Za-z])/giu, 'Universidade');
    s = s.replace(/(?<![A-Za-z])universität(?![A-Za-z])/giu, 'Universität');
    s = s.replace(/(?<![A-Za-z])università(?![A-Za-z])/giu, 'Università');
    s = s.replace(/(?<![A-Za-z])cégep(?![A-Za-z])/giu, 'Cégep');
    s = s.replace(/(?<![A-Za-z])cegep(?![A-Za-z])/giu, 'Cégep');
    s = s.replace(/(?<![A-Za-z])college(?![A-Za-z])/giu, 'College');
    s = s.replace(/(?<![A-Za-z])collège(?![A-Za-z])/giu, 'Collège');
    s = s.replace(/(?<![A-Za-z])colegio(?![A-Za-z])/giu, 'Colegio');
    s = s.replace(/(?<![A-Za-z])colégio(?![A-Za-z])/giu, 'Colégio');
    s = s.replace(/(?<![A-Za-z])laval(?![A-Za-z])/giu, 'Laval');
    s = s.replace(/(?<![A-Za-z])montr[eé]al(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Montréal' : 'Montreal'));
    s = s.replace(/(?<![A-Za-z])sherbrooke(?![A-Za-z])/giu, 'Sherbrooke');
    s = s.replace(/(?<![A-Za-z])mcgill(?![A-Za-z])/giu, 'McGill');
    s = s.replace(/(?<![A-Za-z])concordia(?![A-Za-z])/giu, 'Concordia');
    s = s.replace(/(?<![A-Za-z])dawson(?![A-Za-z])/giu, 'Dawson');
    s = s.replace(/(?<![A-Za-z])qu[eé]bec(?![A-Za-z])/giu, (m) => (m.includes('é') ? 'Québec' : 'Quebec'));
    return s;
  }

  /**
   * Corrige les contresens gtx sur les établissements connus
   * (Dawson / cégeps ≠ universidad ; Bishop’s ≠ Obispo).
   */
  function fixInstitutionMistranslations(original = '', translated = '', targetLang = '') {
    let t = String(translated || '');
    const o = String(original || '').toLowerCase();
    const lang = institutionLangKey(targetLang || translateTargetLang || '');

    // ── Cégeps & collèges QC : JAMAIS une université ──────────────────────
    if (isCegepOrCollegeInstitution(original) || /\bc[eé]gep\b/i.test(original)) {
      // Réappliquer le libellé collégial fiable si dispo
      const preferred = preferredInstitutionLabel(original, lang || targetLang);
      if (preferred && !/\buniversit/i.test(preferred)) {
        t = preferred;
      } else {
        t = demoteUniversityLabelIfCollege(original, t, lang);
        // Calques gtx fréquents : Universidad de Vieux / University of Jonquière…
        t = t
          .replace(
            /\b(?:Universidad|Universidade|University|Université|Universität|Università|Uniwersytet)\s+(?:de\s+|del\s+|do\s+|di\s+|of\s+|du\s+)?(?=Vieux|Jonqui|Maisonneuve|Lionel|Dawson|Ahuntsic|Garneau|Vanier|Champlain|Abbott|Montpetit|Laurendeau|Montmorency|Rosemont|Godin)/giu,
            lang === 'es' ? 'Colegio de ' : lang === 'pt' ? 'Colégio de ' : lang === 'fr' ? 'Collège ' : '',
          );
        // Si on a vidé le type, reconstruire « Place College »
        if (lang !== 'es' && lang !== 'pt' && lang !== 'fr') {
          t = t
            .replace(/\bDawson\b(?:\s+(?:College|University))?/giu, 'Dawson College')
            .replace(/\b(Vieux\s*Montr[eé]al)\b(?:\s+(?:College|University))?/giu, 'Vieux Montréal College')
            .replace(/\b(Jonqui[eè]re)\b(?:\s+(?:College|University))?/giu, 'Jonquière College');
        }
        t = t.replace(/\bcegep\b/giu, 'Cégep');
      }
      // Filet final : plus aucun mot « universit* » sur un collège
      t = demoteUniversityLabelIfCollege(original, t, lang);
      return t;
    }

    // Dawson mentionné hors détection stricte
    if (/\bdawson\b/.test(o) || /\bdawson\b/i.test(t)) {
      t = t
        .replace(/\bUniversidad(?:\s+de)?\s+Dawson\b/giu, 'Colegio Dawson')
        .replace(/\bUniversidade(?:\s+de)?\s+Dawson\b/giu, 'Colégio Dawson')
        .replace(/\bUniversità(?:\s+di)?\s+Dawson\b/giu, 'Dawson College')
        .replace(/\bUniwersytet\s+Dawsona?\b/giu, 'Dawson College')
        .replace(/\b(?:The\s+)?University\s+of\s+Dawson\b/giu, 'Dawson College')
        .replace(/\bDawson\s+University\b/giu, 'Dawson College')
        .replace(/\bUniversité\s+Dawson\b/giu, 'Collège Dawson')
        .replace(/\bDawson-Universität\b/giu, 'Dawson College')
        .replace(/\bUniversität\s+Dawson\b/giu, 'Dawson College');
    }

    // Bishop's University — ne pas traduire Bishop → Obispo / Bispo
    // (c’est bien une université ; on garde le type University / Universidad)
    if (/bishop/.test(o) || /obispo|bispo|biskup/i.test(t)) {
      t = t
        .replace(/\bUniversidad del Obispo\b/giu, "Universidad Bishop's")
        .replace(/\bUniversidade do Bispo\b/giu, "Universidade Bishop's")
        .replace(/\bUniwersytet Biskupi\b/giu, "Bishop's University")
        .replace(/\bUniversité de l['’]Évêque\b/giu, "Université Bishop's")
        .replace(/\bUniversity of the Bishop\b/giu, "Bishop's University")
        // Ne jamais rétrograder Bishop's en college
        .replace(/\bColegio(?:\s+de)?\s+Bishop'?s?\b/giu, "Universidad Bishop's")
        .replace(/\bColégio(?:\s+de)?\s+Bishop'?s?\b/giu, "Universidade Bishop's")
        .replace(/\bBishop'?s?\s+College\b/giu, "Bishop's University");
    }

    return t;
  }

  function polishInstitutionTranslation(original, translated, targetLang) {
    const preferred = preferredInstitutionLabel(original, targetLang);
    if (preferred) {
      // Même un glossaire ne doit pas coller « University » sur un cégep
      return demoteUniversityLabelIfCollege(original, preferred, targetLang);
    }
    let out = fixInstitutionTranslationCasing(translated);
    out = fixInstitutionMistranslations(original, out, targetLang);
    out = demoteUniversityLabelIfCollege(original, out, targetLang);
    return out;
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.translate === false) return true;
    if (el.classList?.contains('notranslate')) return true;
    if (el.getAttribute?.('translate') === 'no') return true;
    if (SKIP_CLASS_RE.test(el.className || '')) return true;
    if (el.closest?.('.notranslate, [translate="no"], .translate-control, .sr-only, .article-source, .article-author, .filter-btn__name, .article-media-credit')) {
      return true;
    }
    return false;
  }

  /**
   * Articles de la suite du fil *entièrement* hors écran (sous le pli
   * « Plus d'articles », au-delà de la rangée peek).
   *
   * On MT : les N cartes pleines + la rangée peek (titres partiels sous le
   * fondu). On saute le reste jusqu’au dépliage — gain de latence.
   *
   * Source de vérité : `data-translate-skip="1"` posé par app.js.
   * `.is-tail-overflow` seul ne suffit plus (la peek l’a aussi).
   */
  function isInCollapsedTailOverflow(node) {
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el || el.nodeType !== 1) return false;
    // Explicit skip (app.js) — cartes au-delà de visible + peek
    if (el.closest?.('[data-translate-skip="1"]')) return true;
    const tail = el.closest?.('.news-tail');
    if (!tail || !tail.classList.contains('has-overflow') || tail.classList.contains('is-expanded')) {
      return false;
    }
    const article = el.closest?.('.article, a.article');
    if (!article || !tail.contains(article)) return false;
    // Carte peek (is-tail-overflow sans data-translate-skip) → traduire
    if (article.hasAttribute?.('data-translate-skip')) {
      return article.getAttribute('data-translate-skip') === '1';
    }
    const body = tail.querySelector('.news-tail-body');
    if (!body) return false;
    const cards = [...body.querySelectorAll(':scope > .article, :scope > a.article')];
    const idx = cards.indexOf(article);
    if (idx < 0) return false;
    const visible = parseInt(tail.dataset.tailVisible || '10', 10) || 10;
    const peek = parseInt(tail.dataset.tailPeekTranslate || '2', 10) || 2;
    return idx >= visible + peek;
  }

  function isChromeTextNode(node) {
    const el = node && node.nodeType === 3 ? node.parentElement : node;
    return !!el?.closest?.(CHROME_SELECTOR);
  }

  function collectTextNodes(root = document.body, {
    includeCollapsedTail = false,
    chromeOnly = false,
  } = {}) {
    if (!root) return [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const val = node.nodeValue;
        if (!val || !val.trim()) return NodeFilter.FILTER_REJECT;
        // Ignorer purement numérique / ponctuation
        if (!/[\p{L}]/u.test(val)) return NodeFilter.FILTER_REJECT;
        if (chromeOnly && !isChromeTextNode(node)) return NodeFilter.FILTER_REJECT;
        // Suite du fil repliée : ignorer les cartes hors écran
        if (!includeCollapsedTail && isInCollapsedTailOverflow(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Sigles d'équipes sportives (THE, SL, OUT…) : jamais de MT
        if (isSportsTeamCode(val, node)) return NodeFilter.FILTER_REJECT;
        // Noms de médias (toujours) / établissements hors pastilles sources
        if (isProtectedProperName(val, node)) return NodeFilter.FILTER_REJECT;
        let p = node.parentElement;
        while (p) {
          if (shouldSkipElement(p)) return NodeFilter.FILTER_REJECT;
          // Ne pas remonter hors de root
          if (p === root) break;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function rememberOriginal(node) {
    if (!originalByNode.has(node)) {
      originalByNode.set(node, node.nodeValue);
    }
    return originalByNode.get(node);
  }

  function restoreOriginals(root = document.body) {
    const nodes = collectTextNodes(root);
    for (const node of nodes) {
      if (originalByNode.has(node)) {
        node.nodeValue = originalByNode.get(node);
      }
    }
  }

  /** Overlay articles : délai, paliers, skip — mutables pour les tests. */
  const OVERLAY_TIMING = {
    SHOW_DELAY_MS: 350,
    INDETERMINATE_MS: 1000,
    SKIP_AFTER_MS: 9000,
    FADE_MS: 250,
    HOLD_AT_100_MS: 280,
  };
  const OVERLAY_LIVE_MARKS = [25, 50, 75, 100];

  let overlaySession = null;
  let overlayLocked = false;
  let overlayLockY = 0;
  let overlayLayoutBound = false;

  function isMiniAppPath() {
    try {
      return /\/(pomo|solitaire)(\/|$)/.test(location.pathname || '');
    } catch {
      return false;
    }
  }

  function articlesHost() {
    if (isMiniAppPath()) return null;
    return document.querySelector('main.wire');
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function eventInTuner(e) {
    const t = e.target;
    const el = t && t.nodeType === 1 ? t : t?.parentElement;
    return !!el?.closest?.('#tuner, #radar-player, .tuner-controls, .tuner-vol-slot, .tuner-vol-popover');
  }

  function blockPageScroll(e) {
    if (!overlayLocked) return;
    if (eventInTuner(e)) return;
    if (e.type === 'keydown') {
      const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (!keys.includes(e.key)) return;
      if (e.key === ' ') {
        const el = e.target && e.target.nodeType === 1 ? e.target : e.target?.parentElement;
        if (el?.closest?.('button, a, [href], input, textarea, select')) return;
      }
    }
    e.preventDefault();
  }

  function overlayLockTargets() {
    const host = articlesHost();
    const targets = [];
    if (host) {
      for (const child of host.children) {
        if (child.id === 'translate-progress' || child.classList.contains('translate-progress')) continue;
        targets.push(child);
      }
      targets.push(host);
    }
    const nav = document.querySelector('nav.site-sections');
    if (nav && !host?.contains(nav)) targets.push(nav);
    return targets;
  }

  function setInert(el, on) {
    if (!el) return;
    try { el.inert = on; } catch { /* anciens moteurs */ }
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }

  function lockArticlesScroll() {
    if (overlayLocked) return;
    overlayLocked = true;
    overlayLockY = window.scrollY || 0;
    document.documentElement.classList.add('translate-articles-lock');
    const host = articlesHost();
    if (host) {
      host.classList.add('is-translate-locked');
      host.setAttribute('aria-busy', 'true');
    }
    for (const el of overlayLockTargets()) {
      if (el === host) continue;
      setInert(el, true);
    }
    document.addEventListener('wheel', blockPageScroll, { passive: false, capture: true });
    document.addEventListener('touchmove', blockPageScroll, { passive: false, capture: true });
    document.addEventListener('keydown', blockPageScroll, { capture: true });
  }

  function unlockArticlesScroll() {
    if (!overlayLocked) return;
    overlayLocked = false;
    document.documentElement.classList.remove('translate-articles-lock');
    const host = articlesHost();
    if (host) {
      host.classList.remove('is-translate-locked');
      host.removeAttribute('aria-busy');
    }
    for (const el of overlayLockTargets()) setInert(el, false);
    document.removeEventListener('wheel', blockPageScroll, { capture: true });
    document.removeEventListener('touchmove', blockPageScroll, { capture: true });
    document.removeEventListener('keydown', blockPageScroll, { capture: true });
    const y = overlayLockY;
    window.requestAnimationFrame(() => {
      if (Math.abs((window.scrollY || 0) - y) > 1) {
        window.scrollTo(0, y);
      }
    });
  }

  const OVERLAY_COPY_FR = {
    prep: 'Préparation de la langue…',
    articles: 'Traduction des articles…',
    layout: 'Mise en page…',
    ready: 'Prêt',
    skip: 'Afficher les articles dans la langue actuelle',
  };
  let overlayCopy = { ...OVERLAY_COPY_FR };

  function overlayLabelForPercent(p) {
    if (p >= 100) return overlayCopy.ready;
    if (p >= 75) return overlayCopy.layout;
    if (p >= 30) return overlayCopy.articles;
    return overlayCopy.prep;
  }

  function applyOverlayCopyToDom() {
    const el = document.getElementById('translate-progress');
    if (!el) return;
    const skip = el.querySelector('.translate-progress__skip');
    if (skip) skip.textContent = overlayCopy.skip;
    const label = el.querySelector('#translate-progress-label');
    if (label) {
      const determined = (overlaySession?.total || 0) > 0;
      label.textContent = determined
        ? overlayLabelForPercent(overlaySession?.percent || 0)
        : overlayCopy.prep;
    }
  }

  async function translateOverlayCopyFirst(targetLang, gen) {
    overlayCopy = { ...OVERLAY_COPY_FR };
    const next = { ...OVERLAY_COPY_FR };
    for (const key of Object.keys(OVERLAY_COPY_FR)) {
      const hit = preferredUiPhrase(OVERLAY_COPY_FR[key], targetLang);
      if (hit && hit !== OVERLAY_COPY_FR[key]) next[key] = hit;
    }
    overlayCopy = { ...next };
    applyOverlayCopyToDom();
    if (!targetLang || !articlesHost()) return;
    const missing = Object.keys(OVERLAY_COPY_FR).filter((key) => next[key] === OVERLAY_COPY_FR[key]);
    if (missing.length) {
      await Promise.all(missing.map(async (key) => {
        if (gen != null && gen !== translateGen) return;
        const out = await translateText(OVERLAY_COPY_FR[key], targetLang);
        if (out && out !== OVERLAY_COPY_FR[key]) next[key] = out;
      }));
      if (gen != null && gen !== translateGen) return;
    }
    for (const key of Object.keys(OVERLAY_COPY_FR)) {
      if (next[key] !== OVERLAY_COPY_FR[key]) continue;
      const en = preferredUiPhrase(OVERLAY_COPY_FR[key], 'en');
      if (en) next[key] = en;
    }
    overlayCopy = next;
    applyOverlayCopyToDom();
  }

  function layoutArticlesOverlay() {
    const host = articlesHost();
    const overlay = document.getElementById('translate-progress');
    if (!host || !overlay || overlay.hidden) return;
    const hostRect = host.getBoundingClientRect();
    const tuner = document.getElementById('tuner');
    const tunerBottom = tuner ? tuner.getBoundingClientRect().bottom : 0;
    const viewTop = Math.max(0, tunerBottom);
    const visTop = Math.max(hostRect.top, viewTop);
    const visBottom = Math.min(hostRect.bottom, window.innerHeight);
    const visLeft = Math.max(hostRect.left, 0);
    const visRight = Math.min(hostRect.right, window.innerWidth);
    const width = Math.max(0, visRight - visLeft);
    const height = Math.max(0, visBottom - visTop);
    overlay.style.top = `${visTop - hostRect.top}px`;
    overlay.style.left = `${visLeft - hostRect.left}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${Math.max(height, 8)}px`;
    overlay.style.removeProperty('--translate-rail-shift');
    overlay.classList.remove('is-wide');

    const card = overlay.querySelector('.translate-progress__card');
    if (!card) return;
    const cardH = card.offsetHeight || 220;
    const minTop = visTop + 16;
    const maxTop = visBottom - cardH - 16;
    let cardTopVp = (window.innerHeight / 2) - (cardH / 2);
    if (maxTop >= minTop) {
      cardTopVp = Math.min(Math.max(cardTopVp, minTop), maxTop);
    } else {
      cardTopVp = minTop;
    }
    card.style.position = 'absolute';
    card.style.top = `${Math.max(0, cardTopVp - visTop)}px`;
    card.style.left = '50%';
    card.style.right = 'auto';
    card.style.transform = 'translateX(-50%)';
    card.style.margin = '0';
  }

  let overlayLayoutRaf = 0;
  function scheduleArticlesOverlayLayout() {
    if (overlayLayoutRaf) return;
    overlayLayoutRaf = window.requestAnimationFrame(() => {
      overlayLayoutRaf = 0;
      layoutArticlesOverlay();
    });
  }

  function bindOverlayLayout() {
    if (overlayLayoutBound) return;
    overlayLayoutBound = true;
    window.addEventListener('resize', scheduleArticlesOverlayLayout);
    try {
      window.visualViewport?.addEventListener('resize', scheduleArticlesOverlayLayout);
    } catch { /* pas de visualViewport */ }
  }

  function ensureArticlesOverlay() {
    const host = articlesHost();
    if (!host) return null;
    let el = document.getElementById('translate-progress');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'translate-progress';
    el.className = 'translate-progress notranslate';
    el.setAttribute('translate', 'no');
    el.hidden = true;
    el.innerHTML = [
      '<div class="translate-progress__veil" aria-hidden="true"></div>',
      '<div class="translate-progress__layout">',
      '  <div class="translate-progress__card">',
      '    <div class="translate-progress__mark" aria-hidden="true">',
      '      <span class="translate-progress__wave"></span>',
      '      <span class="translate-progress__wave"></span>',
      '      <span class="translate-progress__wave"></span>',
      '      <div class="translate-progress__ring"></div>',
      '      <img class="translate-progress__logo" src="./assets/icon.svg" width="48" height="48" alt="">',
      '    </div>',
      '    <p class="translate-progress__pct" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-labelledby="translate-progress-label">',
      '      <span class="translate-progress__num">0</span><span class="translate-progress__suffix"> %</span>',
      '    </p>',
      '    <p id="translate-progress-label" class="translate-progress__label"></p>',
      '    <div class="translate-progress__bar" aria-hidden="true"><div class="translate-progress__fill"></div></div>',
      '    <button type="button" class="translate-progress__skip" hidden></button>',
      '  </div>',
      '</div>',
      '<div class="translate-progress__live" aria-live="polite"></div>',
    ].join('');
    el.querySelector('.translate-progress__skip').addEventListener('click', (e) => {
      e.preventDefault();
      skipArticlesOverlay();
    });
    host.appendChild(el);
    applyOverlayCopyToDom();
    bindOverlayLayout();
    return el;
  }

  function paintArticlesOverlay(percent, { determined = true } = {}) {
    const el = ensureArticlesOverlay();
    if (!el) return;
    const pct = Math.max(0, Math.min(100, percent));
    const num = el.querySelector('.translate-progress__num');
    const bar = el.querySelector('.translate-progress__pct');
    const fill = el.querySelector('.translate-progress__fill');
    const ring = el.querySelector('.translate-progress__ring');
    const label = el.querySelector('#translate-progress-label');
    const live = el.querySelector('.translate-progress__live');
    el.classList.toggle('is-indeterminate', !determined);
    if (num) num.textContent = determined ? String(Math.round(pct)) : '…';
    const suffix = el.querySelector('.translate-progress__suffix');
    if (suffix) suffix.hidden = !determined;
    if (bar) {
      if (determined) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      else bar.removeAttribute('aria-valuenow');
    }
    if (fill && determined) fill.style.width = `${pct}%`;
    if (ring) ring.style.setProperty('--translate-pct', determined ? String(pct) : '0');
    if (label) label.textContent = determined ? overlayLabelForPercent(pct) : overlayCopy.prep;
    const skip = el.querySelector('.translate-progress__skip');
    if (skip) skip.textContent = overlayCopy.skip;
    if (live && overlaySession && determined) {
      for (const mark of OVERLAY_LIVE_MARKS) {
        if (pct >= mark && !overlaySession.liveAnnounced.has(mark)) {
          overlaySession.liveAnnounced.add(mark);
          live.textContent = `${mark} %`;
        }
      }
    }
  }

  function showArticlesOverlay() {
    if (!articlesHost()) return;
    if (overlaySession?.dismissed) return;
    const el = ensureArticlesOverlay();
    if (!el) return;
    const wasFocusedInTuner = eventInTuner({ target: document.activeElement });
    el.hidden = false;
    el.classList.remove('is-leaving');
    lockArticlesScroll();
    layoutArticlesOverlay();
    window.requestAnimationFrame(() => layoutArticlesOverlay());
    if (overlaySession) overlaySession.shown = true;
    paintArticlesOverlay(overlaySession?.percent || 10, { determined: (overlaySession?.total || 0) > 0 });
    if (wasFocusedInTuner && document.activeElement && eventInTuner({ target: document.activeElement })) {
      /* ne pas voler le focus radio */
    }
    if (overlaySession && !overlaySession.skipTimer) {
      overlaySession.skipTimer = window.setTimeout(() => {
        const skip = el.querySelector('.translate-progress__skip');
        if (skip && overlaySession && !overlaySession.dismissed && overlaySession.shown) {
          skip.hidden = false;
        }
      }, OVERLAY_TIMING.SKIP_AFTER_MS);
    }
  }

  function hideArticlesOverlay({ fade = true } = {}) {
    const el = document.getElementById('translate-progress');
    const runUnlock = () => {
      unlockArticlesScroll();
      if (!el) return;
      el.hidden = true;
      el.classList.remove('is-leaving');
    };
    if (!el || el.hidden) {
      runUnlock();
      return Promise.resolve();
    }
    const useFade = fade && !prefersReducedMotion();
    if (!useFade) {
      runUnlock();
      return Promise.resolve();
    }
    el.classList.add('is-leaving');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        runUnlock();
        resolve();
      }, OVERLAY_TIMING.FADE_MS);
    });
  }

  function skipArticlesOverlay() {
    if (!overlaySession) {
      hideArticlesOverlay({ fade: true });
      return;
    }
    overlaySession.dismissed = true;
    if (overlaySession.showTimer) {
      clearTimeout(overlaySession.showTimer);
      overlaySession.showTimer = null;
    }
    hideArticlesOverlay({ fade: true });
  }

  function abortArticlesOverlay() {
    if (!overlaySession) {
      hideArticlesOverlay({ fade: false });
      return;
    }
    overlaySession.dismissed = true;
    if (overlaySession.showTimer) clearTimeout(overlaySession.showTimer);
    if (overlaySession.skipTimer) clearTimeout(overlaySession.skipTimer);
    overlaySession = null;
    overlayCopy = { ...OVERLAY_COPY_FR };
    hideArticlesOverlay({ fade: false });
  }

  function mapOverlayPercent(session) {
    if (session.phase === 'done') return 100;
    if (session.phase === 'dom') return 96;
    if (session.total <= 0) return session.hadWork ? 10 : 0;
    const lo = session.bandLo ?? 12;
    const hi = session.bandHi ?? 94;
    const t = Math.min(1, Math.max(0, session.passDone / Math.max(1, session.passTotal)));
    return Math.round(lo + t * (hi - lo));
  }

  function setOverlayPercent(next) {
    if (!overlaySession) return;
    let p = Math.max(0, Math.min(100, next));
    if (p === 99 && overlaySession.phase !== 'done') p = 98;
    p = Math.max(overlaySession.percent, p);
    overlaySession.percent = p;
    if (overlaySession.shown) {
      const determined = overlaySession.total > 0 || overlaySession.phase === 'dom' || overlaySession.phase === 'done';
      paintArticlesOverlay(p, { determined });
    }
  }

  function startArticlesOverlaySession(gen) {
    abortArticlesOverlay();
    if (!articlesHost()) {
      return {
        nodes() {},
        markDom() {},
        finish() { return Promise.resolve(); },
      };
    }
    const session = {
      gen,
      shown: false,
      dismissed: false,
      hadWork: true,
      total: 0,
      done: 0,
      passBase: 0,
      passDone: 0,
      passTotal: 0,
      bandLo: 10,
      bandHi: 94,
      percent: 10,
      phase: 'start',
      liveAnnounced: new Set(),
      startedAt: Date.now(),
      showTimer: null,
      skipTimer: null,
    };
    overlaySession = session;
    const maybeShow = () => {
      if (overlaySession !== session || session.dismissed || session.shown) return;
      if (!session.hadWork) return;
      if (Date.now() - session.startedAt < OVERLAY_TIMING.SHOW_DELAY_MS) return;
      showArticlesOverlay();
    };
    session.showTimer = window.setTimeout(maybeShow, OVERLAY_TIMING.SHOW_DELAY_MS);

    return {
      nodes({ total, done, band }) {
        if (overlaySession !== session || session.dismissed) return;
        if (Array.isArray(band) && band.length === 2) {
          session.bandLo = Number(band[0]) || 10;
          session.bandHi = Number(band[1]) || 94;
        }
        if (typeof total === 'number' && total > 0) {
          session.hadWork = true;
          session.passTotal = total;
          session.total = Math.max(session.total, total);
          session.passDone = typeof done === 'number' ? done : 0;
          session.phase = 'nodes';
          setOverlayPercent(mapOverlayPercent(session));
        }
        maybeShow();
      },
      markDom() {
        if (overlaySession !== session || session.dismissed) return;
        session.phase = 'dom';
        setOverlayPercent(96);
      },
      async finish() {
        if (overlaySession !== session) return;
        if (session.showTimer) {
          clearTimeout(session.showTimer);
          session.showTimer = null;
        }
        if (session.skipTimer) {
          clearTimeout(session.skipTimer);
          session.skipTimer = null;
        }
        if (session.dismissed || gen !== translateGen) {
          overlaySession = null;
          await hideArticlesOverlay({ fade: false });
          return;
        }
        if (!session.shown) {
          overlaySession = null;
          return;
        }
        session.phase = 'done';
        setOverlayPercent(100);
        const dwell = prefersReducedMotion() ? 0 : OVERLAY_TIMING.HOLD_AT_100_MS;
        if (dwell > 0) {
          await new Promise((r) => window.setTimeout(r, dwell));
        }
        overlaySession = null;
        await hideArticlesOverlay({ fade: true });
      },
    };
  }

  async function translateDom(targetLang, {
    quiet = false,
    root = document.body,
    /** Si true : ne réécrit que les nœuds encore à l’original (dépliage suite du fil). */
    onlyUntranslated = false,
    includeCollapsedTail = false,
    chromeOnly = false,
    gen = null,
    force = false,
    onNodeProgress = null,
  } = {}) {
    if (!targetLang) return;
    if (gen != null && gen !== translateGen) return;
    if (translating && !force) {
      pendingRetranslate = true;
      return;
    }
    translating = true;
    translateTargetLang = targetLang;
    document.documentElement.dataset.translateBusy = '1';
    if (!quiet) {
      notify(`Traduction en cours… (${labelForMode(activeMode).short || targetLang})`);
    }

    const stale = () => gen != null && gen !== translateGen;

    try {
      const nodes = collectTextNodes(root, { includeCollapsedTail, chromeOnly });
      // Grouper par texte original (dédup) — une requête MT par chaîne unique
      const byText = new Map(); // original → [nodes]
      for (const node of nodes) {
        const orig = rememberOriginal(node);
        if (onlyUntranslated && node.nodeValue !== orig) continue;
        if (!byText.has(orig)) byText.set(orig, []);
        byText.get(orig).push(node);
      }

      const entries = [...byText.entries()];
      let ok = 0;
      let fail = 0;
      let progressed = 0;
      if (onNodeProgress) onNodeProgress({ total: entries.length, done: 0 });
      if (onNodeProgress && window.__RADAR_TRANSLATE_HOLD) {
        try { await window.__RADAR_TRANSLATE_HOLD; } catch { /* harnais de test */ }
      }

      for (let i = 0; i < entries.length; i += CONCURRENCY) {
        if (stale()) return;
        const batch = entries.slice(i, i + CONCURRENCY);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.map(async ([orig, list]) => {
          if (stale()) return;
          try {
            const instNodes = list.filter((n) => isTranslatableInstitutionZone(n));
            // Noms d’établissements : glossaire / mapping type d’abord ;
            // si pas de mapping (IU, ar, …) → MT + filet collège/université.
            if (instNodes.length && instNodes.length === list.length) {
              let preferred = preferredInstitutionLabel(orig, targetLang);
              if (preferred) {
                preferred = demoteUniversityLabelIfCollege(orig, preferred, targetLang);
                for (const node of list) {
                  if (node.parentNode) {
                    node.nodeValue = reapplyEdgeWhitespace(orig, preferred);
                  }
                }
                ok += 1;
                return;
              }
              // Fall through to MT for script languages / unmapped labels
            }

            // Glossaire UI avant MT (À la une, En bref, Par, Plus d'articles…)
            const uiHit = preferredUiPhrase(String(orig).replace(/^\s+|\s+$/g, ''), targetLang);
            let translated = uiHit != null
              ? reapplyEdgeWhitespace(orig, uiHit)
              : await translateText(orig, targetLang);

            if (translated && translated !== orig) {
              for (const node of list) {
                if (!node.parentNode) continue;
                if (onlyUntranslated && node.nodeValue !== orig) continue;
                // Filet institution seulement dans les zones dédiées — pas sur le corps
                const out = isTranslatableInstitutionZone(node)
                  ? polishInstitutionTranslation(orig, translated, targetLang)
                  : (
                    isInstitutionLabelZone(node)
                      ? fixInstitutionMistranslations(orig, translated, targetLang)
                      : translated
                  );
                node.nodeValue = out;
              }
              ok += 1;
            } else {
              fail += 1;
            }
          } catch {
            fail += 1;
          } finally {
            progressed += 1;
            if (!stale() && onNodeProgress) {
              onNodeProgress({ total: entries.length, done: progressed });
            }
          }
        }));
      }

      saveCache();

      if (!quiet && !stale()) {
        const m = labelForMode(activeMode);
        if (ok === 0 && entries.length > 0) {
          notify('Traduction indisponible pour le moment. Réessayez dans quelques secondes.');
        } else {
          notify(`Page affichée en ${m.label}`);
        }
      }
    } finally {
      translating = false;
      translateTargetLang = null;
      document.documentElement.removeAttribute('data-translate-busy');
      if (pendingRetranslate && (gen == null || gen === translateGen)) {
        pendingRetranslate = false;
        scheduleRetranslate();
      }
    }
  }

  /** Dépliage Suite du fil : MT uniquement les cartes nouvellement visibles. */
  function onNewsTailExpand() {
    if (activeMode === DEFAULT_MODE || translating) return;
    const target = googCodeForMode(activeMode);
    if (!target) return;
    const tail = document.querySelector('.news-tail');
    if (!tail) return;
    // Traduire le corps entier du tail en onlyUntranslated (cartes déjà faites = skip)
    const body = tail.querySelector('.news-tail-body') || tail;
    translateDom(target, {
      quiet: true,
      root: body,
      onlyUntranslated: true,
      includeCollapsedTail: true,
    });
  }

  function updateUi(mode) {
    const m = labelForMode(mode);
    const label = document.getElementById('translate-label');
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    if (label) {
      label.textContent = mode === DEFAULT_MODE ? m.label : m.short;
    }
    if (btn) {
      btn.title = m.title;
      btn.setAttribute(
        'aria-label',
        mode === DEFAULT_MODE
          ? 'Langue : original — aucune traduction. Ouvrir pour traduire la page.'
          : `Langue d'affichage : ${m.label}. Changer la langue.`,
      );
      btn.dataset.mode = mode;
    }
    // Secondaires du menu (nom FR ↔ EN) + en-têtes de groupe
    refreshMenuChromeLabels();
    if (menu) {
      menu.querySelectorAll('[data-mode]').forEach((opt) => {
        const active = opt.dataset.mode === mode;
        opt.setAttribute('aria-selected', active ? 'true' : 'false');
        opt.classList.toggle('is-active', active);
      });
    }
    document.documentElement.dataset.translate = mode;
    // Ne jamais poser dir=rtl sur <html> : le chrome (tuner, filtres, masthead)
    // est conçu en LTR et bascule en overflow horizontal (scroll vers la gauche).
    // On marque seulement le contenu éditorial via data-script-dir.
    const rtl = new Set(['ar', 'fa', 'he', 'ur']);
    document.documentElement.removeAttribute('dir');
    if (mode === DEFAULT_MODE) {
      document.documentElement.lang = 'fr-CA';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'en') {
      document.documentElement.lang = 'en-CA';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'fr') {
      document.documentElement.lang = 'fr-CA';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'zh') {
      document.documentElement.lang = 'zh-Hans';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'zh-tw') {
      document.documentElement.lang = 'zh-Hant';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'iu' || mode === 'iu-latn') {
      document.documentElement.lang = 'iu';
      document.documentElement.removeAttribute('data-script-dir');
    } else if (mode === 'he') {
      document.documentElement.lang = 'he';
      document.documentElement.dataset.scriptDir = 'rtl';
    } else {
      const code = googCodeForMode(mode) || mode;
      document.documentElement.lang = code === 'iw' ? 'he' : code;
      if (rtl.has(mode)) document.documentElement.dataset.scriptDir = 'rtl';
      else document.documentElement.removeAttribute('data-script-dir');
    }
  }

  let menuPositionBound = false;

  /**
   * Place le menu en fixed sous le bouton, entièrement dans le viewport.
   * Évite le clipping à droite (overflow-x:clip + titres longs après traduction).
   */
  function positionMenu() {
    const menu = document.getElementById('translate-menu');
    const btn = document.getElementById('translate-toggle');
    if (!menu || !btn || menu.hidden) return;

    const pad = 12;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btnRect = btn.getBoundingClientRect();

    // Largeur cible : au moins 240, au plus 320, jamais hors écran
    const maxW = Math.min(320, Math.max(160, vw - pad * 2));
    menu.style.width = '';
    menu.style.maxWidth = `${maxW}px`;
    menu.style.maxHeight = '';

    // Mesure après affichage (menu non hidden)
    let menuW = Math.min(Math.max(menu.offsetWidth || 240, 240), maxW);
    let menuH = menu.offsetHeight || 200;
    const maxH = Math.min(vh * 0.75, 560, Math.max(120, vh - pad * 2));
    if (menuH > maxH) {
      menu.style.maxHeight = `${maxH}px`;
      menuH = maxH;
    }

    // Préférer l’alignement droit du bouton (ouvre vers la gauche) ;
    // si ça sort à gauche, basculer ; toujours clamper dans le viewport.
    let left = btnRect.right - menuW;
    if (left < pad) left = btnRect.left;
    if (left + menuW > vw - pad) left = Math.max(pad, vw - pad - menuW);
    if (left < pad) left = pad;

    let top = btnRect.bottom + gap;
    if (top + menuH > vh - pad) {
      // Ouvrir au-dessus du bouton si pas assez de place en bas
      const above = btnRect.top - gap - menuH;
      if (above >= pad) top = above;
      else {
        top = Math.max(pad, vh - pad - menuH);
        menu.style.maxHeight = `${Math.max(120, vh - top - pad)}px`;
      }
    }

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
  }

  function onMenuViewportChange() {
    positionMenu();
  }

  function bindMenuPositioning() {
    if (menuPositionBound) return;
    menuPositionBound = true;
    window.addEventListener('resize', onMenuViewportChange, { passive: true });
    window.addEventListener('scroll', onMenuViewportChange, { passive: true, capture: true });
  }

  function unbindMenuPositioning() {
    if (!menuPositionBound) return;
    menuPositionBound = false;
    window.removeEventListener('resize', onMenuViewportChange);
    window.removeEventListener('scroll', onMenuViewportChange, true);
  }

  function closeMenu() {
    const menu = document.getElementById('translate-menu');
    const btn = document.getElementById('translate-toggle');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    unbindMenuPositioning();
  }

  function openMenu() {
    const menu = document.getElementById('translate-menu');
    const btn = document.getElementById('translate-toggle');
    if (!menu || !btn) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // Réinitialiser le filtre à l’ouverture
    const filter = menu.querySelector('#translate-menu-filter');
    if (filter) {
      filter.value = '';
      filterMenuOptions(menu, '');
    }
    // Double rAF : laisser le layout peindre le menu avant mesure
    requestAnimationFrame(() => {
      positionMenu();
      requestAnimationFrame(() => {
        positionMenu();
        // Focus filtre (liste longue) ou option active — pratique accessibilité
        const active = menu.querySelector('.translate-menu__opt.is-active');
        if (filter && window.innerWidth >= 480) {
          filter.focus({ preventScroll: true });
        } else {
          active?.scrollIntoView({ block: 'nearest' });
        }
        active?.scrollIntoView({ block: 'nearest' });
      });
    });
    bindMenuPositioning();
  }

  function toggleMenu() {
    const menu = document.getElementById('translate-menu');
    if (!menu) return;
    if (menu.hidden) openMenu();
    else closeMenu();
  }

  async function applyMode(mode, { persist = true, fromUserClick = false } = {}) {
    if (MODES[mode]?.unavailable) {
      notify(
        `${MODES[mode].label} : la traduction automatique n’est pas encore offerte `
        + 'pour cette langue autochtone. La page reste en original (sans traduction).',
      );
      return;
    }

    const gen = ++translateGen;
    pendingRetranslate = false;
    abortArticlesOverlay();

    if (persist) mode = setMode(mode);
    else if (!mode) mode = DEFAULT_MODE;

    activeMode = mode;
    updateUi(mode);

    if (mode === DEFAULT_MODE) {
      restoreOriginals();
      notifyDisplayRefresh();
      if (fromUserClick) notify('Original — articles dans leur langue, sans traduction');
      return;
    }

    const target = googCodeForMode(mode);
    if (!target) {
      notify('Code de langue inconnu.');
      return;
    }

    await loadProtectedMediaNames();
    if (gen !== translateGen) return;

    // Un passage précédent (autre langue) : attendre qu’il voie le gen périmé.
    const waitStart = Date.now();
    while (translating && Date.now() - waitStart < 8000) {
      await new Promise((r) => window.setTimeout(r, 16));
    }
    if (gen !== translateGen) return;

    // Toujours repartir des originaux avant de re-traduire
    restoreOriginals();
    // Réaligner pastilles sources (marquees) + pastille CTA (glossaire)
    notifyDisplayRefresh();

    const quiet = !fromUserClick && !hasUserPreference();
    if (!quiet) {
      notify(`Traduction en cours… (${labelForMode(activeMode).short || target})`);
    }

    const overlay = startArticlesOverlaySession(gen);
    try {
      // 0) Libellés de la carte d’attente (skip inclus) — avant tout le reste.
      await translateOverlayCopyFirst(target, gen);
      if (gen !== translateGen) return;

      // 1) Chrome (glossaire radio/sports/nav). L’overlay part dès 350 ms.
      await translateDom(target, {
        quiet: true,
        chromeOnly: true,
        gen,
        force: true,
        onNodeProgress: (p) => overlay.nodes({ ...p, band: [10, 22] }),
      });
      if (gen !== translateGen) return;
      notifyDisplayRefresh();

      // 2) Reste de la page (fil, cartes) — onlyUntranslated saute le chrome fait
      await translateDom(target, {
        quiet: true,
        onlyUntranslated: true,
        includeCollapsedTail: false,
        gen,
        force: true,
        onNodeProgress: (p) => overlay.nodes({ ...p, band: [22, 80] }),
      });
      if (gen !== translateGen) return;

      // Marquees / libellés « Plus de sources » : reposer les originaux localisés
      // puis laisser un second passage MT pour ce qui n’a pas de glossaire.
      notifyDisplayRefresh();
      await translateDom(target, {
        quiet: true,
        onlyUntranslated: true,
        includeCollapsedTail: false,
        gen,
        force: true,
        onNodeProgress: (p) => overlay.nodes({ ...p, band: [80, 94] }),
      });
      if (gen !== translateGen) return;
      overlay.markDom();

      if (!quiet) {
        notify(`Page affichée en ${labelForMode(activeMode).label}`);
      }
    } finally {
      await overlay.finish();
    }
  }

  function scheduleRetranslate() {
    if (activeMode === DEFAULT_MODE) return;
    if (translating) {
      pendingRetranslate = true;
      return;
    }
    clearTimeout(mutateTimer);
    mutateTimer = window.setTimeout(() => {
      const target = googCodeForMode(activeMode);
      // Re-render news : ne retraduire que ce qui est encore à l’original
      // (et hors overflow replié) — cache + glossaire UI font le reste.
      if (target) {
        translateDom(target, {
          quiet: true,
          onlyUntranslated: true,
          includeCollapsedTail: false,
        });
      }
    }, 180);
  }

  function startObserver() {
    if (mutateObserver || !document.body) return;
    // childList seulement : le fil d'articles se re-rend souvent.
    // Pas de characterData — nos propres nodeValue déclencheraient une boucle.
    mutateObserver = new MutationObserver((mutations) => {
      if (activeMode === DEFAULT_MODE) return;
      for (const m of mutations) {
        if (m.type !== 'childList' || !m.addedNodes?.length) continue;
        // Ignorer le menu de traduction et les nœuds purement techniques
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.closest?.('.translate-control, .notranslate, .translate-progress')) continue;
          if (node.nodeType === 1 || node.nodeType === 3) {
            scheduleRetranslate();
            return;
          }
        }
      }
    });
    mutateObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildMenu() {
    const menu = document.getElementById('translate-menu');
    if (!menu) return;

    const frag = document.createDocumentFragment();

    // Filtre (liste longue) — loupe plutôt que placeholder « Filtrer… »
    const searchWrap = document.createElement('div');
    searchWrap.className = 'translate-menu__search-wrap';
    searchWrap.setAttribute('role', 'presentation');
    searchWrap.innerHTML = ''
      + '<label class="translate-menu__search-label" for="translate-menu-filter">'
      + '<span class="sr-only">Filtrer les langues</span>'
      + '</label>'
      + '<div class="translate-menu__search-field">'
      + '<svg class="translate-menu__search-icon" viewBox="0 0 24 24" width="16" height="16" '
      + 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" '
      + 'stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="11" cy="11" r="7"/>'
      + '<path d="M20 20l-3.5-3.5"/>'
      + '</svg>'
      + '<input type="search" id="translate-menu-filter" class="translate-menu__search" '
      + 'placeholder="" autocomplete="off" spellcheck="false" '
      + 'aria-label="Filtrer les langues" enterkeyhint="search" />'
      + '</div>';
    frag.appendChild(searchWrap);

    let lastGroup = '';
    let groupEl = null;

    for (const id of MENU_ORDER) {
      const m = MODES[id];
      if (!m) continue;
      const group = m.group || 'other';

      if (group !== lastGroup) {
        const groupLabel = groupLabelText(group);
        if (groupLabel) {
          groupEl = document.createElement('div');
          groupEl.className = 'translate-menu__group';
          groupEl.setAttribute('role', 'group');
          groupEl.setAttribute('aria-label', groupLabel);
          groupEl.dataset.group = group;
          const sep = document.createElement('div');
          sep.className = 'translate-menu__sep';
          sep.setAttribute('role', 'presentation');
          sep.innerHTML = `<span class="translate-menu__sep-label">${escapeHtml(groupLabel)}</span>`;
          groupEl.appendChild(sep);
          frag.appendChild(groupEl);
        } else {
          groupEl = null;
        }
        lastGroup = group;
      }

      const opt = document.createElement('button');
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.id = `translate-opt-${id}`;
      opt.className = 'translate-menu__opt'
        + (id === DEFAULT_MODE ? ' is-active' : '')
        + (m.unavailable ? ' is-unavailable' : '');
      opt.dataset.mode = id;
      // Endonyme + code + nom FR / écriture (pas de pays)
      const code = escapeHtml(m.short || id.toUpperCase());
      const secondary = languageSecondaryLine(m);
      opt.dataset.search = languageSearchBlob(m);
      opt.setAttribute('aria-selected', id === DEFAULT_MODE ? 'true' : 'false');
      if (m.unavailable) {
        opt.setAttribute('aria-disabled', 'true');
        opt.title = m.title;
      } else {
        opt.title = m.title;
      }
      const langAttr = m.goog
        ? ` lang="${escapeHtml(m.goog)}"`
        : (id !== 'original' ? ` lang="${escapeHtml(id)}"` : '');
      opt.innerHTML = `<span class="translate-menu__row">`
        + `<span class="translate-menu__name"${langAttr}>${escapeHtml(m.label)}</span>`
        + (m.short && m.short !== '—'
          ? `<span class="translate-menu__code" aria-hidden="true">${code}</span>`
          : '')
        + `</span>`
        + (secondary
          ? `<span class="translate-menu__hint">${escapeHtml(secondary)}</span>`
          : '');
      (groupEl || frag).appendChild(opt);
    }

    menu.replaceChildren(frag);

    const filter = menu.querySelector('#translate-menu-filter');
    if (filter) {
      filter.addEventListener('input', () => filterMenuOptions(menu, filter.value));
      filter.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusMenuOption(menu, 1);
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          closeMenu();
          document.getElementById('translate-toggle')?.focus();
        }
      });
    }
  }

  function filterMenuOptions(menu, query = '') {
    const q = String(query || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const opts = menu.querySelectorAll('.translate-menu__opt');
    let visibleCount = 0;
    opts.forEach((opt) => {
      const hay = (opt.dataset.search || '').normalize('NFD').replace(/\p{M}/gu, '');
      const show = !q || hay.includes(q);
      opt.hidden = !show;
      if (show) visibleCount += 1;
    });
    // Masquer les groupes vides
    menu.querySelectorAll('.translate-menu__group').forEach((g) => {
      const any = g.querySelector('.translate-menu__opt:not([hidden])');
      g.hidden = !any;
    });
    menu.dataset.filterEmpty = visibleCount === 0 ? '1' : '0';
  }

  function visibleMenuOptions(menu) {
    return [...menu.querySelectorAll('.translate-menu__opt:not([hidden]):not([aria-disabled="true"])')];
  }

  function focusMenuOption(menu, delta = 1) {
    const opts = visibleMenuOptions(menu);
    if (!opts.length) return;
    const active = document.activeElement;
    let idx = opts.indexOf(active);
    if (idx < 0) idx = opts.findIndex((o) => o.classList.contains('is-active'));
    if (idx < 0) idx = 0;
    else idx = (idx + delta + opts.length) % opts.length;
    opts[idx].focus();
  }

  function bindUi() {
    const btn = document.getElementById('translate-toggle');
    const menu = document.getElementById('translate-menu');
    const control = document.getElementById('translate-control');
    if (control) {
      control.classList.add('notranslate');
      control.setAttribute('translate', 'no');
    }
    if (!btn || !menu) return;

    buildMenu();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-mode]');
      if (!opt || !menu.contains(opt) || opt.getAttribute('aria-disabled') === 'true') return;
      e.stopPropagation();
      const mode = opt.dataset.mode;
      closeMenu();
      if (mode) applyMode(mode, { persist: true, fromUserClick: true });
    });

    // Navigation clavier listbox (WAI-ARIA)
    menu.addEventListener('keydown', (e) => {
      if (menu.hidden) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusMenuOption(menu, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusMenuOption(menu, -1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        visibleMenuOptions(menu)[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const opts = visibleMenuOptions(menu);
        opts[opts.length - 1]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        const opt = e.target.closest?.('[data-mode]');
        if (opt && menu.contains(opt) && opt.getAttribute('aria-disabled') !== 'true') {
          e.preventDefault();
          const mode = opt.dataset.mode;
          closeMenu();
          if (mode) applyMode(mode, { persist: true, fromUserClick: true });
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  function init() {
    loadCache();
    startObserver();

    // Catalogue autochtones + noms de médias, puis UI (menu à jour) + auto-traduction
    Promise.all([loadIndigenousRegistry(), loadProtectedMediaNames()]).then(() => {
      bindUi();

      const mode = getMode();
      activeMode = mode;
      updateUi(mode);

      if (mode === DEFAULT_MODE) return;
      const run = () => applyMode(mode, {
        persist: hasUserPreference(),
        fromUserClick: false,
      });
      if (document.readyState === 'complete') {
        window.setTimeout(run, 200);
      } else {
        window.addEventListener('load', () => window.setTimeout(run, 200), { once: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * Libellés à poser depuis app.js (marquees pastilles, « Plus de sources »…)
   * pour rester alignés avec la langue active sans écraser le MT ensuite.
   */
  function displayUiText(original = '') {
    const raw = String(original ?? '');
    const tl = activeMode === DEFAULT_MODE ? null : googCodeForMode(activeMode);
    if (!tl) return raw;
    const hit = preferredUiPhrase(raw.replace(/\s+/g, ' ').trim(), tl);
    return hit != null ? hit : raw;
  }

  function displayInstitutionLabel(original = '') {
    const raw = String(original ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) return raw;
    const tl = activeMode === DEFAULT_MODE ? null : googCodeForMode(activeMode);
    if (!tl || !shouldLocalizeInstitutions(tl)) return raw;
    const hit = preferredInstitutionLabel(raw, tl);
    if (hit != null) return hit;
    // IU / ar / … : réutiliser le cache MT pour ne pas réécraser les pastilles
    // en français après notifyDisplayRefresh (marquees).
    const cached = cacheGet(cacheKey(raw, tl));
    if (cached) return cached;
    return raw;
  }

  function notifyDisplayRefresh() {
    try {
      window.dispatchEvent(new CustomEvent('radar:translate-mode', {
        detail: { mode: activeMode, lang: googCodeForMode(activeMode) },
      }));
    } catch { /* ignore */ }
  }

  window.RadarTranslate = {
    getMode,
    applyMode,
    rememberNewsCorpus,
    pruneTranslationCache,
    detectBrowserAutoMode,
    hasUserPreference,
    translateText,
    onNewsTailExpand,
    scheduleRetranslate,
    displayUiText,
    displayInstitutionLabel,
    notifyDisplayRefresh,
    preferredUiPhrase,
    DEFAULT_MODE,
    MODES,
    /**
     * Surface de test. Les libellés d'établissements sont de la logique pure :
     * les exposer permet de les vérifier sans appel réseau au moteur de
     * traduction (donc sans test instable). Lecture seule, aucune incidence
     * sur l'exécution — voir tests/institution-labels.spec.mjs.
     */
    _ui: {
      preferredUiPhrase,
      CHROME_SELECTOR,
      CACHE_KEY,
      CACHE_MAX,
      CACHE_VERSION,
      pruneTranslationCache,
      rememberNewsCorpus,
      cacheSize: () => Object.keys(translationCache).length,
      CONCURRENCY,
      MAX_CHUNK,
      MT,
      OVERLAY_TIMING,
      gtxTargetCodes,
      mymemoryLang,
    },
    _labels: {
      formatCegepLabel,
      formatCollegeLabel,
      preferredInstitutionLabel,
      isCegepOrCollegeInstitution,
      isUniversityInstitutionName,
    },
  };
})();

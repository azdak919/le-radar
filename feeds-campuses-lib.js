// Liste « Campus couverts » de feeds.html, calculée à partir de news-sources.json
// (configuration réelle des sources du fil, mise à jour à chaque récolte).
// Partagé entre le navigateur (window.RadarFeedsCampuses) et les tests Node.
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.RadarFeedsCampuses = lib;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const OVERRIDES = {
    'Polytechnique Montréal': 'Poly',
    'Cégep de Jonquière (ATM – journalisme)': 'Jonquière',
    'Cégep de Jonquière': 'Jonquière',
  };

  const ORDER = [
    'UdeM', 'UQAM', 'McGill', 'Concordia', 'ULaval', 'UdeS', 'UQTR', 'Poly', "Bishop's",
    'Cégep Vieux-Montréal', 'Jonquière',
  ];

  // Nom court d’un établissement : table connue, sinon nom sans « Cégep / Collège de »,
  // sinon nom complet. Jamais tronqué avec « … ».
  function institutionAcronym(name = '', table = {}) {
    if (!name) return '';
    const map = { ...table, ...OVERRIDES };
    if (map[name]) return map[name];
    const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (map[stripped]) return map[stripped];
    const m = stripped.match(/^(?:cégep|collège|college)\s+(?:de la\s+|de l['’]\s*|du\s+|des\s+|de\s+|d['’]\s*)?(.+)$/i);
    if (m) return m[1].trim();
    const en = stripped.match(/^(.+?)\s+college$/i);
    if (en) return en[1].trim();
    return stripped;
  }

  function isCegep(src = {}) {
    return src.type === 'cegep';
  }

  function groupSources(sources = [], table = {}) {
    const groups = new Map();
    sources.forEach((src) => {
      const inst = String(src.institution || '').trim();
      if (!src.name || !inst) return;
      const key = institutionAcronym(inst, table) || inst;
      if (!groups.has(key)) {
        groups.set(key, { key, institution: inst, acronym: key, type: 'universite', papers: [], minPopularity: 50 });
      }
      const g = groups.get(key);
      if (!g.papers.includes(src.name)) g.papers.push(src.name);
      g.minPopularity = Math.min(g.minPopularity, src.popularity ?? 50);
      if (isCegep(src)) g.type = 'cegep';
    });
    groups.forEach((g) => g.papers.sort((a, b) => a.localeCompare(b, 'fr')));
    return [...groups.values()].sort((a, b) => {
      const typeDiff = (a.type === 'cegep' ? 1 : 0) - (b.type === 'cegep' ? 1 : 0);
      if (typeDiff) return typeDiff;
      const ai = ORDER.indexOf(a.key);
      const bi = ORDER.indexOf(b.key);
      const ar = ai >= 0 ? ai : 100 + a.minPopularity;
      const br = bi >= 0 ? bi : 100 + b.minPopularity;
      return ar - br || a.acronym.localeCompare(b.acronym, 'fr');
    });
  }

  // Sources réellement publiées : au moins un article dans news.json (fil de la
  // dernière récolte). Sans news.json, on écarte au moins les sources « stale ».
  function publishedNames(news) {
    const items = Array.isArray(news?.items) ? news.items : null;
    if (!items) return null;
    return new Set(items.map((a) => a && a.source).filter(Boolean));
  }

  // Modèle complet de la section : universités, cégeps et note « en cours d’intégration ».
  // Une source configurée sans article publié passe dans le compteur.
  function buildCampusModel(registry = {}, table = {}, news = null) {
    const configured = (registry.active || []).filter((s) => s && s.name && s.institution);
    const published = publishedNames(news);
    const isLive = (s) => (published ? published.has(s.name) : s._status !== 'stale');
    const active = configured.filter(isLive);
    const waiting = configured.filter((s) => !isLive(s));
    const groups = groupSources(active, table);
    const pending = (registry.candidates || []).length + waiting.length;
    return {
      universities: groups.filter((g) => g.type !== 'cegep'),
      cegeps: groups.filter((g) => g.type === 'cegep'),
      pending,
      waiting: waiting.map((s) => s.name),
      note: pending > 0
        ? `+ ${pending} publication${pending > 1 ? 's' : ''} en cours d’intégration au fil.`
        : '',
    };
  }

  return { institutionAcronym, groupSources, buildCampusModel };
}));

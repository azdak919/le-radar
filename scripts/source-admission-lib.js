'use strict';
/**
 * Admission automatique des nouveaux médias étudiants (sans approbation).
 *
 * Un candidat est ajouté au fil seulement s'il passe TOUS les critères :
 *  1. vrai nom de journal (pas « Média — … », pas un nom d'établissement nu) ;
 *  2. établissement du Québec présent dans institutions.json ;
 *  3. pas un site d'association / administration / service (nom ou hôte) ;
 *  4. pas un doublon (hôte ou nom déjà actif ou candidat retiré) ;
 *  5. pas dans data/source-blocklist.json (retrait manuel définitif) ;
 *  6. flux RSS/Atom public valide avec au moins MIN_ITEMS articles ;
 *  7. actif : dernier article ≤ 45 jours, ou publié depuis le début de la
 *     session en cours ;
 *  8. signal « média étudiant » (graine vérifiée, ou mention sur la page) ;
 *  9. une photo du campus de SON établissement existe (repli des images) ;
 * 10. crédits lisibles : sur les articles échantillonnés du flux, l'auteur
 *     et le crédit photo extraits par le pipeline ne sont ni des libellés
 *     d'interface (« See author's posts »), ni un pseudo/média collé
 *     (« X // @x // Média »), ni un compte générique (« admin »).
 * Aucun réseau ici : fonctions pures, testées par tests/source-admission.mjs.
 */

const DAY = 86400000;
const ACTIVE_DAYS = 45;
const MIN_ITEMS = 3;

const PLACEHOLDER = /^m[eé]dia\s*[—–\-:]/i;
const WEAK_LABEL = /^(actualit[eé]s?|nouvelles?|news|communiqu[eé]s?|presse|media|média|publications?|blogue?|blog)$/i;
const BARE_INSTITUTION = /^(institut|universit[eé]|university|c[eé]gep|college|coll[eè]ge|[eé]cole)\b/i;
const ASSOCIATION_NAME = /\b(association|asso\b|syndicat|services?\b|club|fondation|bureau|vie [eé]tudiante|student life office|alumni|dipl[oô]m[eé]s|registraire|admissions?|f[eé]d[eé]ration|conseil)\b/i;
const ADMIN_HOST = /(^|\.)(uquebec\.ca|gouv\.qc\.ca|quebec\.ca|canada\.ca)$/i;
const ADMIN_PATH = /\/(nouvelles|actualites|news|salle-de-presse|communiques?|medias?)\b/i;
const STUDENT_SIGNAL = /journal (?:étudiant|etudiant|des étudiant|des etudiant)|student[- ](?:run )?(?:news)?paper|student (?:press|newspaper|publication|media)|média étudiant|media etudiant|journal du c[eé]gep|independent student/i;

function norm(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim();
}

function hostOf(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** Sessions québécoises : automne 15 août → 22 déc., hiver 6 janv. → 20 mai. */
function currentSessionStart(now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const t = d.getTime();
  const fall = Date.UTC(y, 7, 15), fallEnd = Date.UTC(y, 11, 22, 23, 59);
  const winter = Date.UTC(y, 0, 6), winterEnd = Date.UTC(y, 4, 20, 23, 59);
  if (t >= fall && t <= fallEnd) return fall;
  if (t >= winter && t <= winterEnd) return winter;
  return null;
}

function isActive(lastItemMs, now = Date.now()) {
  if (!Number.isFinite(lastItemMs) || lastItemMs > now + DAY) return false;
  if ((now - lastItemMs) / DAY <= ACTIVE_DAYS) return true;
  const start = currentSessionStart(now);
  return start != null && lastItemMs >= start;
}

const INSTITUTION_ALIASES = {
  'universite mcgill': 'mcgill university',
  'universite concordia': 'concordia university',
  'uqam': 'universite du quebec a montreal',
  'champlain college saint-lambert': 'cegep champlain campus saint-lambert',
};

function findInstitution(name, institutions = []) {
  let n = norm(name).replace(/\s*\([^)]*\)/g, '').trim();
  n = INSTITUTION_ALIASES[n] || n;
  if (!n) return null;
  return institutions.find((i) => {
    const k = norm(i.name).replace(/\s*\([^)]*\)/g, '').trim();
    const acro = (String(i.name).match(/\(([^)]+)\)/) || [])[1];
    return k === n || (acro && norm(acro) === n);
  }) || null;
}

function loadBlocklist(json) {
  const list = (json && Array.isArray(json.entries)) ? json.entries : [];
  return list.map((e) => ({ ...e, _host: hostOf(e.site || e.url || ''), _name: norm(e.name || '') }));
}

function isBlocked(cand, blocklist = []) {
  const h = hostOf(cand.site || cand.url || '');
  const n = norm(cand.name);
  return blocklist.find((b) => (b._host && b._host === h) || (b._name && b._name === n)) || null;
}

/** Doublon : même hôte ou même nom qu'une source active, ou qu'un candidat retiré/rejeté. */
function findDuplicate(cand, registry = {}) {
  const h = hostOf(cand.site || cand.url || '');
  const n = norm(cand.name);
  const pool = [
    ...(registry.active || []).map((s) => ({ s, why: 'déjà actif' })),
    ...(registry.candidates || []).filter((s) => s._status === 'retired' || s._status === 'rejected')
      .map((s) => ({ s, why: 'source retirée' })),
  ];
  for (const { s, why } of pool) {
    if (s === cand) continue;
    const hs = [hostOf(s.site || ''), hostOf(s.url || '')].filter(Boolean);
    if ((h && hs.includes(h)) || (n && norm(s.name) === n)) return `${why} (${s.name})`;
  }
  return null;
}

/** Critères statiques (sans réseau). Retourne une raison de refus ou null. */
function staticRejection(cand, ctx = {}) {
  const name = String(cand.name || '').trim();
  if (name.length < 2) return 'nom manquant';
  if (PLACEHOLDER.test(name) || WEAK_LABEL.test(name)) return 'nom générique (pas un journal)';
  if (BARE_INSTITUTION.test(name) && !/journal|campus|student|newspaper|gazette/i.test(name)) {
    return "nom d'établissement, pas de journal";
  }
  if (ASSOCIATION_NAME.test(name)) return 'association / service, pas un média';
  const blocked = isBlocked(cand, ctx.blocklist);
  if (blocked) return `liste de blocage${blocked.reason ? ` : ${blocked.reason}` : ''}`;
  if (cand._status === 'retired' || cand._status === 'rejected') return 'source retirée';
  const dup = findDuplicate(cand, ctx.registry);
  if (dup) return `doublon — ${dup}`;
  const inst = findInstitution(cand.institution, ctx.institutions);
  if (!inst) return 'établissement hors catalogue Québec';
  const h = hostOf(cand.site || cand.url || '');
  const ih = hostOf(inst.website || '');
  if (!h) return 'pas de site';
  if (ADMIN_HOST.test(h) || (ih && (h === ih || h.endsWith(`.${ih}`)))) {
    return "site de l'établissement (portail institutionnel)";
  }
  if (ih && ADMIN_PATH.test(cand.site || '')) return 'page de nouvelles institutionnelle';
  return null;
}

/**
 * Décision finale après sondage du flux.
 * probe = { feedUrl, isFeed, items, lastItemMs, pageText }
 * ctx   = { registry, institutions, blocklist, hasCampusPhoto(inst) → bool, now }
 */
function evaluateAdmission(cand, probe = {}, ctx = {}) {
  const now = ctx.now || Date.now();
  const stat = staticRejection(cand, ctx);
  if (stat) return { admit: false, reason: stat };
  if ((!probe.feedUrl || !probe.isFeed) && probe.challenge) {
    return { admit: false, reason: 'flux bloqué par une page anti-robot (collecte impossible)' };
  }
  if (!probe.feedUrl || !probe.isFeed) return { admit: false, reason: 'aucun flux RSS/Atom public' };
  if ((probe.items || 0) < MIN_ITEMS) return { admit: false, reason: `flux trop mince (${probe.items || 0} article(s))` };
  if (!isActive(probe.lastItemMs, now)) {
    const d = Number.isFinite(probe.lastItemMs) ? new Date(probe.lastItemMs).toISOString().slice(0, 10) : '?';
    return { admit: false, reason: `inactif (dernier article ${d})` };
  }
  if (!cand.vetted && !STUDENT_SIGNAL.test(probe.pageText || '')) {
    return { admit: false, reason: 'aucun signal « journal étudiant » sur le site' };
  }
  const inst = findInstitution(cand.institution, ctx.institutions);
  if (ctx.hasCampusPhoto && !ctx.hasCampusPhoto(inst.name, cand.institution)) {
    return { admit: false, reason: `pas de photo de campus pour ${inst.name} (repli d'image requis)` };
  }
  const creditProblems = auditSampleCredits(probe.creditSamples, cand.name);
  if (creditProblems.length) {
    return { admit: false, reason: `crédits mal extraits : ${creditProblems[0]}` };
  }
  return { admit: true, reason: 'critères respectés', institution: inst };
}

const JUNK_CREDIT = /\b(?:see|view)\s+(?:all\s+)?(?:author['’]?s?\s+)?posts\b|\bposts\s+by\b|\bvoir\s+(?:tous\s+)?(?:les\s+)?articles\b|\/\/|(?:^|\s)@[\w.]+|^(?:admin|administrator|administrateur|wordpress|webmaster|editor|user\d*)$/i;

/**
 * Valide les crédits extraits par le pipeline sur un échantillon d'articles
 * du flux : [{ link, author, creditLine, creator }]. Renvoie les problèmes
 * (vides = OK). Un auteur absent ou un repli « Photo : [média] » n'est pas
 * une erreur (le site affiche alors « La rédaction » / le média) — seul un
 * crédit FAUX bloque l'admission.
 */
function auditSampleCredits(samples = [], sourceName = '') {
  const problems = [];
  const src = norm(sourceName);
  for (const s of samples || []) {
    const author = String(s.author || '').trim();
    const creator = String(s.creator || '').trim();
    const line = String(s.creditLine || '').trim();
    if (author && JUNK_CREDIT.test(author)) problems.push(`auteur illisible « ${author} » (${s.link || '?'})`);
    if (author && src && norm(author) === src) problems.push(`nom du média pris pour l'auteur (${s.link || '?'})`);
    if ((creator && JUNK_CREDIT.test(creator)) || (line && JUNK_CREDIT.test(line))) {
      problems.push(`crédit photo illisible « ${line || creator} » (${s.link || '?'})`);
    }
  }
  return problems;
}

const AUTO_PALETTE = ['#1F6FB2', '#B23A1F', '#2E7D32', '#6A1B9A', '#C77700', '#00838F', '#AD1457', '#455A64'];
function autoColor(name = '') {
  let h = 0;
  for (const c of norm(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AUTO_PALETTE[h % AUTO_PALETTE.length];
}

/** Configuration complète d'une source admise. */
function buildSourceConfig(cand, probe, inst, now = Date.now()) {
  const site = cand.site || `https://${hostOf(probe.feedUrl)}/`;
  const host = hostOf(site);
  return {
    name: String(cand.name).trim(),
    institution: inst.name,
    region: cand.region || inst.region || '',
    type: inst.type || cand.type || 'cegep',
    lang: cand.lang === 'en' ? 'en' : 'fr',
    url: probe.feedUrl,
    site,
    popularity: 5,
    botHints: {
      authors: { forcePageAuthor: true, ignoreRssAuthor: true },
      images: {
        preferSizeFull: true,
        validateOnPage: true,
        rejectPathPatterns: ['logo', 'favicon', 'cropped-', 'placeholder', 'default-image', 'cropped-.*-32x32'],
      },
    },
    _note: `Ajout automatique (${new Date(now).toISOString().slice(0, 10)}) par discover-news-sources — ${inst.name}, ${host}. Repli images : banque campus ${inst.name}. Retrait : data/source-blocklist.json.`,
    _autoAdded: new Date(now).toISOString(),
    _status: 'ok',
    _failCount: 0,
    _lastItemDate: new Date(probe.lastItemMs).toISOString(),
  };
}

/** Dédoublonne une liste de graines/candidats (hôte puis nom). */
function dedupeCandidates(list = []) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const k = hostOf(c.site || c.url || '') || norm(c.name);
    if (!k || seen.has(k) || seen.has(norm(c.name))) continue;
    seen.add(k); seen.add(norm(c.name));
    out.push(c);
  }
  return out;
}

/** Journal Markdown pour l'issue permanente. */
function renderDiscoveryLog({ added = [], rejected = [], now = Date.now(), activeCount = 0 }) {
  const d = new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const L = [];
  L.push('# Découverte des médias étudiants — journal du bot', '');
  L.push(`Dernière passe : **${d}** · sources actives : **${activeCount}**.`, '');
  L.push('Les médias qui respectent les règles sont **ajoutés automatiquement** au fil. Pour retirer une source hors sujet sans qu\'elle revienne : ajouter une entrée dans `data/source-blocklist.json` (nom ou site + raison).', '');
  L.push('## Ajoutés lors de cette passe', '');
  if (!added.length) L.push('_Aucun nouvel ajout._');
  else {
    L.push('| Média | Établissement | Flux | Dernier article |', '|---|---|---|---|');
    for (const a of added) L.push(`| ${a.name} | ${a.institution} | ${a.url} | ${String(a._lastItemDate || '').slice(0, 10)} |`);
  }
  L.push('', '## Candidats écartés', '');
  if (!rejected.length) L.push('_Aucun._');
  else {
    L.push('| Média | Établissement | Site | Raison |', '|---|---|---|---|');
    for (const r of rejected) L.push(`| ${r.name} | ${r.institution || '—'} | ${r.site || '—'} | ${r.reason} |`);
  }
  L.push('', '_Critères : vrai média étudiant d\'un cégep ou d\'une université du Québec, flux public valide (≥ 3 articles), actif (≤ 45 jours ou publié pendant la session en cours), pas un site d\'association ni d\'administration, pas de doublon ni de source retirée, photo du campus de l\'établissement disponible._');
  return L.join('\n') + '\n';
}

module.exports = {
  ACTIVE_DAYS, MIN_ITEMS, norm, hostOf, currentSessionStart, isActive, findInstitution,
  loadBlocklist, isBlocked, findDuplicate, staticRejection, evaluateAdmission,
  buildSourceConfig, autoColor, auditSampleCredits, dedupeCandidates, renderDiscoveryLog, STUDENT_SIGNAL,
};

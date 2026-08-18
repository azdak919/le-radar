/**
 * LE RADAR — normalisation des crédits Wikimedia Commons
 *
 * Commons injecte souvent :
 *   « No machine-readable author provided. NAME assumed (based on copyright claims). »
 *   « Sam311 ( talk ) ( Uploads ) »
 *   « Andrea Schaffer from Sydney, Australia »
 * Affiché tel quel (et parfois auto-traduit), ça donne une ligne illisible
 * sous le mât. On extrait un libellé court et lisible.
 *
 * Origine de l’auteur (« from Sydney, Australia ») ≠ lieu de la photo.
 * Format d’affichage : « Nom — lieu » quand le toponyme est connu.
 *
 * Utilisé par : maintain-quebec-backgrounds.js, scrub banks, tests.
 * Miroir runtime : quebec-backgrounds.js (sanitizeBgCredit / placeFromBg)
 * + pomo/js/backgrounds.js.
 */

'use strict';

/**
 * Pseudos Commons collés → nom affiché (identités publiques connues).
 * Clé = forme normalisée (minuscules, sans espaces).
 */
const CREDIT_DISPLAY_ALIASES = {
  jeangagnon: 'Jean Gagnon',
  danielhbordeleau: 'Daniel H. Bordeleau',
};

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeCommonsCredit(raw) {
  if (raw == null) return '';
  let s = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  // EN : "No machine-readable author provided. Miguel Andrade assumed (based on copyright claims)."
  let m = s.match(
    /no machine-readable author provided\.?\s*(.+?)\s+assumed\s*\(\s*based on copyright claims\s*\)\.?/i
  );
  if (m) return _finalizeCreditName(m[1]);

  // FR (si stocké ou déjà traduit) :
  // "Aucun auteur lisible par machine n'est fourni, Miguel Andrade l'a supposé (…)."
  m = s.match(
    /aucun auteur lisible par machine n['’]est fourni[.,]?\s*(.+?)\s+l['’]a\s+suppos[ée]/i
  );
  if (m) return _finalizeCreditName(m[1]);

  // Variante sans nom extrait
  if (/^no machine-readable author provided\.?$/i.test(s)) {
    return 'Wikimedia Commons';
  }
  if (/^aucun auteur lisible par machine/i.test(s)) {
    return 'Wikimedia Commons';
  }

  // Placeholder de licence Commons (pas un auteur)
  if (/you may select the license of your choice/i.test(s)) {
    return 'Wikimedia Commons';
  }

  // Origine de l’auteur (« from Sydney, Australia ») ≠ lieu de la photo.
  s = s.replace(
    /\s+from\s+[A-ZÀ-Ÿ][\wÀ-ÿ.'’\-]*(?:,?\s+[A-ZÀ-Ÿ][\wÀ-ÿ.'’\-]*){0,5}\s*$/u,
    '',
  ).trim();

  // Déchets wiki Commons : « ( talk ) », « Uploads », licence collée.
  s = s
    .replace(/\(\s*talk\s*\)/ig, '')
    .replace(/\(\s*uploads?\s*\)/ig, '')
    .replace(/\s*\/\s*uploads?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Fichier / œuvre dérivée : « MontrealNasa.jpg : NASA derivative work: MTLskyline »
  s = s.replace(/^[\w.\-]+\.(?:jpe?g|png|gif|webp)\s*:\s*/i, '');
  s = s.replace(/\s*derivative work:\s*\S+/ig, '').trim();

  // Site collé au nom : « Nichole Ouellette/ouellette001.com »
  s = s.replace(/\/[a-z0-9._-]+\.[a-z]{2,}(?:\/\S*)?$/i, '').trim();

  if (/ville de montr[ée]al/i.test(s)) s = 'Ville de Montréal';

  // Signature Commons « Name- Me • MyEars • MyMouth -timed »
  s = s.replace(/\s*[-–—]\s*Me\s*[•·].*$/i, '').trim();

  if (/^nasa\b/i.test(s)) {
    const courtesy = s.match(/courtesy of\s+(.+?)\.?$/i);
    if (courtesy) s = `NASA / ${courtesy[1].replace(/\.$/, '').trim()}`;
    else if (/^nasa\.?\s*$/i.test(s)) s = 'NASA';
  }

  if (s.includes(';')) {
    s = s.split(/\s*;\s*/).map(_invertLastFirst).join(', ');
  } else {
    s = _invertLastFirst(s);
  }

  if (!/\s/.test(s) && s.length >= 8 && s.length <= 40 && /[a-z][A-Z]/.test(s)) {
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  if (/^jeangagnon$/i.test(s)) s = 'Jean Gagnon';

  // Tronquer les crédits monstrueux restants (HTML raté, listes…)
  if (s.length > 72) {
    const head = s.split(/\s*[—–|]\s*|\s*\(/)[0].trim();
    if (head.length >= 2 && head.length <= 60) s = head;
    else s = `${s.slice(0, 60).trim()}…`;
  }

  // "MontrealNasa.jpg : NASA derivative work: MTLskyline ( talk )"
  m = s.match(/derivative\s+work:\s*(.+)$/i);
  if (m) {
    s = m[1].trim();
  } else {
    m = s.match(/^[^\s:]+\.(?:jpe?g|png|gif|webp)\s*:\s*(.+)$/i);
    if (m) s = m[1].trim();
  }

  // Bruit page utilisateur Commons : ( talk ), ( Uploads ), ( discussion ), …
  s = s.replace(
    /\s*\(\s*(?:talk|discussion|uploads|t[eé]l[eé]versements|contribs?|contributions)\s*\)/gi,
    ''
  );

  // "Nichole Ouellette/ouellette001.com"
  s = s.replace(/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\S*)?$/i, '');

  // Flickr / Commons : "… from Sydney, Australia" / "… from Canada"
  s = s.replace(
    /\s+from\s+(?:North\s+)?[\p{L}][\p{L}\d'’.\-]*(?:\s+[\p{L}][\p{L}\d'’.\-]*)*(?:,\s*[\p{L}][\p{L}\d'’.\-]*(?:\s+[\p{L}][\p{L}\d'’.\-]*)*)?\s*$/u,
    ''
  );

  // Signature spam type « Blanchardb- Me • MyEars • MyMouth -timed »
  if (/[•]/.test(s) || /MyEars|MyMouth/i.test(s)) {
    const head = s.split(/[-–—]/)[0].trim();
    if (head.length >= 2) s = head;
  }

  return _finalizeCreditName(s);
}

/** « Last, First, 1851-1933 » → « First Last ». Laisse les orgs intactes. */
function _invertLastFirst(raw) {
  const t = String(raw || '').trim();
  const m = t.match(
    /^([A-ZÀ-Ÿ][\wÀ-ÿ'’.\-]+),\s+([A-ZÀ-Ÿ][\wÀ-ÿ'’.\-]+(?:[\s-][A-ZÀ-Ÿ][\wÀ-ÿ'’.\-]+)*)(?:,\s*\d{4}(?:-\d{4})?)?$/u
  );
  if (!m) return t;
  if (/^(cantons|ville|ressources|parcours|nasa)/i.test(m[1])) return t;
  return `${m[2]} ${m[1]}`.replace(/\s+/g, ' ').trim();
}

/**
 * Lieu de la *photo* (titre / description), jamais l’origine de l’auteur.
 * Premier match gagne : toponymes précis avant régions / villes.
 * Pas de repli sur le titre brut (sinon « Érables et sable en féerie »).
 */
const PLACE_HINTS = [
  [/forillon|cap bon-ami/i, 'Forillon'],
  [/rocher perc[ée]|perc[ée] rock|(?:^|[,\-–—])\s*perc[ée]\b/i, 'Percé'],
  [/montmorency/i, 'Chute Montmorency'],
  [/canal de soulanges|soulanges canal/i, 'Canal de Soulanges'],
  [/deux[- ]montagnes/i, 'Lac des Deux-Montagnes'],
  [/wapizagonke|waber|parc national de la mauricie|la mauricie np/i, 'Mauricie'],
  [/\bmauricie\b/i, 'Mauricie'],
  [/olivine|xalibu|parc national de la gaspésie/i, 'Gaspésie'],
  [/gasp[eé]sie/i, 'Gaspésie'],
  [/pingualuit|kangirsuk|nunavik/i, 'Nunavik'],
  [/manawan/i, 'Manawan'],
  [/odanak/i, 'Odanak'],
  [/pessamit/i, 'Pessamit'],
  [/ouj[eé]-bougoumou/i, 'Oujé-Bougoumou'],
  [/gesgapegiag/i, 'Gesgapegiag'],
  [/kangiqsualujjuaq/i, 'Kangiqsualujjuaq'],
  [/pointe bleue|mashteuiatsh/i, 'Mashteuiatsh'],
  [/mont[- ]tremblant|laurentides/i, 'Mont-Tremblant'],
  [/universit[ée] laval/i, 'Université Laval'],
  [/mcgill/i, 'McGill'],
  [/concordia/i, 'Concordia'],
  [/uqam|judith-jasmin/i, 'UQAM'],
  [/polytechnique|roger-gaudry|universit[ée] de montr[ée]al/i, 'Université de Montréal'],
  [/bishop/i, "Bishop's"],
  [/longueuil/i, 'Longueuil'],
  [/lac-beauport/i, 'Lac-Beauport'],
  [/saint-claude/i, 'Saint-Claude'],
  [/pointe-calumet/i, 'Pointe-Calumet'],
  [/l['’]anse-saint-jean/i, "L'Anse-Saint-Jean"],
  [/coteau[- ]du[- ]lac/i, 'Coteau-du-Lac'],
  [/[iî]le[- ]perrot/i, 'Île-Perrot'],
  [/bas[- ]saint[- ]laurent/i, 'Bas-Saint-Laurent'],
  [/lasalle|mercier bridge|pont mercier/i, 'Montréal'],
  [/wahsipekuk/i, 'Wahsipekuk'],
  [/\b(?:le\s+)?bic\b|parc du bic|plage du bic/i, 'Le Bic'],
  [/rivi[eè]re saint[- ]fran[cç]ois|riviere saint francois/i, 'Rivière Saint-François'],
  [/saint-luc-de-matane|\bmatane\b/i, 'Matane'],
  [/carleton/i, 'Carleton-sur-Mer'],
  [/adstock/i, 'Adstock'],
  [/\bhudson\b/i, 'Hudson'],
  [/\bnewport\b/i, 'Newport'],
  [/bateiscan|batiscan|montauban/i, 'Batiscan'],
  [/peribonka|péribonka/i, 'Péribonka'],
  [/orford/i, 'Orford'],
  [/brompton/i, 'Brompton'],
  [/gatineau/i, 'Gatineau'],
  [/saguenay|fjord/i, 'Saguenay'],
  [/sherbrooke/i, 'Sherbrooke'],
  [/lac f[ée]lix/i, 'Lac Félix'],
  [/bois du r[ée]v[ée]rend ponton/i, 'Bois du Révérend Ponton'],
  [
    /verdun|mont royal|pierrefonds|skyline de montr|centre-ville de montr|panorama de montr|sunrise over montr|montr[ée]al|\bmontreal\b/i,
    'Montréal',
  ],
  [
    /qu[ée]bec city|quebec city|old quebec|vieux-qu[ée]bec|skyline de qu[ée]bec|panorama de qu[ée]bec|cityscapes of quebec|skylines of quebec|ch[âa]teau frontenac|gare fluviale de qu[ée]bec|frontenac/i,
    'Québec',
  ],
];

function placeFromPhotoMeta(title = '', description = '') {
  const blob = `${title} ${description}`;
  for (const [re, label] of PLACE_HINTS) {
    if (re.test(blob)) return label;
  }
  return '';
}

function formatMastheadCredit(photo = {}) {
  const name = sanitizeCommonsCredit(photo.credit || '');
  const computed = placeFromPhotoMeta(photo.title || '', photo.description || '');
  const stored = String(photo.place || '').trim();
  const place = computed || (stored && !looksLikePhotoTitle(stored) ? stored : '');
  if (name && place && !name.toLowerCase().includes(place.toLowerCase())) {
    return { name, place, label: `${name} — ${place}` };
  }
  return { name, place: place || '', label: name || place || '' };
}

/** Titre descriptif collé comme « lieu » (à ignorer). */
function looksLikePhotoTitle(value) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (s.length > 36) return true;
  return /panorama|skyline|landscape|cropped|f[ée]erie|[ée]rables|kayaking|d[ée]gel|train station|exo\)|sunrise over|nasa /i.test(s);
}

/**
 * @param {string} name
 * @returns {string}
 */
function _cleanName(name) {
  return String(name || '')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .replace(/\s*([—–])\s*/g, ' $1 ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Espaces, camelCase léger, alias, troncature.
 * @param {string} name
 * @returns {string}
 */
function _finalizeCreditName(name) {
  let s = _cleanName(name);
  if (!s) return '';

  // camelCase collé : AndreaSchaffer → Andrea Schaffer ; DannysFlamand → Dannys Flamand
  if (!/\s/.test(s) && s.length >= 8 && s.length <= 48 && /[a-z][A-Z]/.test(s)) {
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Chiffres collés en fin de pseudo après scission : Irksome Buccaneer2635 → Irksome Buccaneer
    s = s.replace(/(\p{L})\d{2,}$/u, '$1');
  }

  const aliasKey = s.toLowerCase().replace(/\s+/g, '');
  if (CREDIT_DISPLAY_ALIASES[aliasKey]) {
    return CREDIT_DISPLAY_ALIASES[aliasKey];
  }

  // Tronquer les crédits monstrueux restants (HTML raté, listes…)
  if (s.length > 72) {
    const head = s.split(/\s*[—–|]\s*|\s*\(/)[0].trim();
    if (head.length >= 2 && head.length <= 60) return head;
    return `${s.slice(0, 60).trim()}…`;
  }
  return s;
}

/**
 * Applique sanitizeCommonsCredit sur credit de chaque photo d’une banque.
 * Recalcule toujours `place` (écrase un ancien titre pris pour un lieu).
 * @param {{ photos?: object[] }} bank
 * @returns {number} nombre de crédits / lieux modifiés
 */
function scrubBankCredits(bank) {
  if (!bank || !Array.isArray(bank.photos)) return 0;
  let n = 0;
  for (const p of bank.photos) {
    if (!p) continue;
    if (p.credit != null) {
      const next = sanitizeCommonsCredit(p.credit);
      if (next !== p.credit) {
        p.credit = next;
        n += 1;
      }
    }
    const place = placeFromPhotoMeta(p.title || '', p.description || '');
    if (place) {
      if (p.place !== place) {
        p.place = place;
        n += 1;
      }
    } else if (p.place) {
      delete p.place;
      n += 1;
    }
  }
  return n;
}

module.exports = {
  sanitizeCommonsCredit,
  scrubBankCredits,
  placeFromPhotoMeta,
  formatMastheadCredit,
  CREDIT_DISPLAY_ALIASES,
};

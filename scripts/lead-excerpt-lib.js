/**
 * Extraction du paragraphe le plus adapté depuis la page source —
 * pour l'affichage « à la une » (champ leadExcerpt dans news.json).
 *
 * Ne prend pas aveuglément le premier <p> : chaque paragraphe reçoit un score
 * (longueur, structure journalistique, ton, meta/chapô, etc.).
 */

const https = require('https');
const { extractBylineFromText } = require('./author-lib');

const FETCH_TIMEOUT = 12000;
const LEAD_EXCERPT_MAX = 1200;
const LEAD_EXCERPT_MIN = 80;
const SUBSTANTIVE_MIN = 60;
const LEAD_SUITABILITY_MIN = 52;
const SCAN_PARAGRAPH_LIMIT = 10;

const TRUNC_MARKERS_RE = /(?:…|\.{3,}|\[…\]|\[\.\.\.\]|\[&hellip;\])/gi;

const UNSUITABLE_PATTERNS = [
  /^(?:Photo|Crédit|Credit|Image|Illustration|Source|Vidéo|Video)\s*:/i,
  /^L['’]équipe\b/i,
  /^Pour lire\b/i,
  /^Cliquez\b|^Click\b/i,
  /^Écoutez\b|^Listen\b/i,
  /^Suivez\b|^Follow\b/i,
  /^Partagez\b|^Share\b/i,
  /^Cet article\b/i,
  /^Mise à jour\b/i,
  /^Note de la rédaction\b/i,
  /^En collaboration avec\b/i,
  /^Publicité\b|^Sponsorisé\b|^Sponsored\b/i,
  /^Voir aussi\b|^Lire aussi\b|^Read also\b/i,
  /^Inscrivez-vous\b|^Subscribe\b/i,
  /^Téléchargez\b|^Download\b/i,
  /^Cette édition\b/i,
  /^Retrouvez\b/i,
];

const DECK_PATTERNS = [
  /^Pour en finir avec\b/i,
  /^Découvrez\b|^Découvrir\b/i,
  /^Ne manquez pas\b/i,
  /^Un regard sur\b/i,
  /^Plongée dans\b/i,
  /^Focus sur\b/i,
  /^Au fil de\b/i,
];

const NEWS_LEAD_OPENERS = /^(?:Les|La|Le|L['’]|Un|Une|À|En|Après|Depuis|Selon|Alors que|Cependant|Dans|Face à|Plus de|Croulant|Chaque|Acheter|Connue|Le programme|La confiance|Il fut)\b/iu;
const FIRST_PERSON_OPENERS = /^(?:Salut|Je suis|Moi,? c['’]est|Aujourd['']hui,?\s+je|Mon nom est|Je m['’]appelle)\b/iu;

function decodeEntities(str = '') {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&hellip;/gi, '…');
}

function stripHtml(html = '') {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTruncationArtifacts(text = '') {
  return String(text)
    .replace(TRUNC_MARKERS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function endsCompleteSentence(text = '') {
  return /[.!?»"')\]]\s*$/.test(String(text).trim());
}

function countSentences(text = '') {
  const parts = String(text).split(/(?<=[.!?…])\s+/).filter((s) => s.trim().length > 8);
  return parts.length || (endsCompleteSentence(text) ? 1 : 0);
}

function fetchText(url, redirects = 3, timeout = FETCH_TIMEOUT) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; REQ-NewsBot/1.0)',
          Accept: 'text/html, application/xhtml+xml, */*',
        },
        timeout,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchText(next, redirects - 1, timeout));
        }
        if (res.statusCode >= 400) {
          res.resume();
          return resolve('');
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
  });
}

function articleBodyHtml(html = '') {
  const regions = [
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i),
    html.match(/class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    html.match(/class=["'][^"']*post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    html.match(/class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
  ];
  for (const m of regions) {
    if (m && m[1] && m[1].length > 120) return m[1];
  }
  return html;
}

function isBylineOnlyParagraph(text = '') {
  const plain = String(text).replace(/\s+/g, ' ').trim();
  if (!/^(?:Par|By)\s+/i.test(plain)) return false;
  const { author, body } = extractBylineFromText(plain);
  return !!author && body.length < 24;
}

function isJunkParagraph(text = '') {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (!t || t.length < 24) return true;
  if (/^(?:Photo|Crédit|Credit|Image|Illustration)\s*:/i.test(t)) return true;
  if (/^\[?\s*(?:read more|lire la suite|continue reading)/i.test(t)) return true;
  if (/^L['’]article\b/i.test(t) && t.length < 100) return true;
  if (isBylineOnlyParagraph(t)) return true;
  return false;
}

function paragraphsFromHtml(html = '') {
  const decoded = decodeEntities(html);
  const raw = decoded.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  return raw.map((p) => stripHtml(p)).filter(Boolean);
}

function normalizeLeadParagraph(text = '') {
  let s = stripTruncationArtifacts(stripHtml(text));
  s = s.replace(/\s*L['’]article\b[\s\S]*?est apparu en premier sur[\s\S]*$/i, '');
  s = s.replace(/\[[^\]]*(?:read more|lire la suite|continue reading)[^\]]*\]/gi, '');
  s = s.replace(/\b(?:read more|lire la suite|continue reading)\b\.?\s*$/i, '');
  const byline = extractBylineFromText(s);
  if (byline.body.length >= SUBSTANTIVE_MIN) s = byline.body;
  return s.replace(/\s+/g, ' ').trim();
}

function truncateLeadExcerpt(text = '', max = LEAD_EXCERPT_MAX) {
  let s = normalizeLeadParagraph(text);
  if (!s) return '';
  if (s.length <= max) return s;

  let cut = s.slice(0, max);
  const sentenceEnd = s.slice(max).search(/[.!?»"')\]](?:\s|$)/);
  if (sentenceEnd >= 0 && sentenceEnd < 140) {
    cut = s.slice(0, max + sentenceEnd + 1);
  } else {
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > max * 0.55) cut = cut.slice(0, lastSpace);
  }
  return cut.replace(/[,;:\s]+$/u, '').trimEnd();
}

/**
 * Évalue si un paragraphe convient comme extrait « à la une ».
 * Retourne { score, suitable, reason, text }.
 */
function scoreLeadParagraph(text = '', { index = 0, nextText = '' } = {}) {
  const t = normalizeLeadParagraph(text);
  if (!t || isJunkParagraph(t)) {
    return { score: 0, suitable: false, reason: 'junk', text: t };
  }

  for (const re of UNSUITABLE_PATTERNS) {
    if (re.test(t)) {
      return { score: 0, suitable: false, reason: 'meta-or-nav', text: t };
    }
  }

  let score = 48;
  const len = t.length;
  const sentences = countSentences(t);

  if (len < 90) score -= 28;
  else if (len < 130) score -= 14;
  else if (len >= 150 && len <= 750) score += 16;
  else if (len > 950) score -= 8;

  if (sentences >= 2) score += 20;
  else if (sentences === 1 && len >= 220) score += 8;
  else if (sentences === 1) score -= 8;

  if (endsCompleteSentence(t)) score += 12;
  else score -= 18;

  if (NEWS_LEAD_OPENERS.test(t)) score += 10;
  if (FIRST_PERSON_OPENERS.test(t)) score -= 38;

  for (const re of DECK_PATTERNS) {
    if (re.test(t)) score -= 32;
  }

  if (sentences === 1 && len < 140) score -= 22;
  if (/\b(?:fière de vous présenter|édition papier|notre équipe|par ici)\b/i.test(t)) score -= 45;
  if (/\b(?:je|j['’]|moi)\b/i.test(t) && len < 260) score -= 12;

  if (/\b(?:20\d{2}|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i.test(t)) {
    score += 6;
  }
  if (/\b(?:université|gouvernement|ministre|étudiant|québec|montréal|canada|sherbrooke|laval|uqam)\b/i.test(t)) {
    score += 5;
  }

  if (index === 0 && len < 130 && sentences <= 1 && nextText) {
    const next = scoreLeadParagraph(nextText, { index: 1 });
    if (next.score >= score + 18) score -= 28;
  }

  if (index === 0 && score >= 58) score += 4;
  if (index > 5) score -= 6;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    suitable: score >= LEAD_SUITABILITY_MIN,
    reason: score >= LEAD_SUITABILITY_MIN ? 'lead-fit' : 'low-score',
    text: t,
  };
}

function pickBestLeadParagraph(html = '') {
  const rawParas = paragraphsFromHtml(html);
  const candidates = [];

  for (let i = 0; i < Math.min(rawParas.length, SCAN_PARAGRAPH_LIMIT); i += 1) {
    if (isJunkParagraph(rawParas[i])) continue;
    const normalized = normalizeLeadParagraph(rawParas[i]);
    if (!normalized) continue;

    let nextText = '';
    for (let j = i + 1; j < rawParas.length; j += 1) {
      if (!isJunkParagraph(rawParas[j])) {
        nextText = normalizeLeadParagraph(rawParas[j]);
        break;
      }
    }

    const scored = scoreLeadParagraph(normalized, { index: i, nextText });
    if (scored.score > 0) {
      candidates.push({ ...scored, index: i });
    }
  }

  if (!candidates.length) return { text: '', score: 0, reason: 'no-candidates' };

  const maxScore = Math.max(...candidates.map((c) => c.score));
  const tier = candidates.filter((c) => c.score >= maxScore - 4);
  tier.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  const best = tier[0] || candidates.sort((a, b) => b.score - a.score || a.index - b.index)[0];
  if (!best.suitable) {
    return { text: '', score: best.score, reason: best.reason, runnerUp: candidates[1]?.score ?? 0 };
  }

  let text = best.text;
  if (text.length < 200 && best.index < rawParas.length - 1) {
    const nextNorm = normalizeLeadParagraph(rawParas[best.index + 1]);
    const nextScored = scoreLeadParagraph(nextNorm, { index: best.index + 1 });
    if (nextScored.suitable && nextScored.score >= best.score - 12) {
      text = `${text} ${nextNorm}`.trim();
    }
  }

  return {
    text: truncateLeadExcerpt(text),
    score: best.score,
    reason: best.reason,
    index: best.index,
  };
}

function leadParagraphFromHtml(html = '') {
  return pickBestLeadParagraph(html).text;
}

function leadExcerptLooksSuitable(text = '') {
  const scored = scoreLeadParagraph(text, { index: 0 });
  return scored.suitable && scored.text.length >= LEAD_EXCERPT_MIN;
}

function excerptLooksIncomplete(item = {}) {
  const existing = String(item.leadExcerpt || '').trim();
  if (existing) {
    if (!leadExcerptLooksSuitable(existing)) return true;
    if (!endsCompleteSentence(existing)) return true;
    if (existing.length >= 180 && existing.length <= 420) return false;
    if (existing.length > 420 && countSentences(existing) >= 3) return true;
    if (leadExcerptLooksSuitable(existing) && existing.length >= 180) return false;
    return true;
  }

  const ex = stripTruncationArtifacts(stripHtml(String(item.excerpt || '')));
  if (!ex) return true;
  if (TRUNC_MARKERS_RE.test(String(item.excerpt || ''))) return true;
  if (!endsCompleteSentence(ex) && ex.length >= 120) return true;

  const { body } = extractBylineFromText(ex);
  const text = body || ex;
  if (text.length < 200) return true;
  return false;
}

function isLeadExcerptCandidate(item, index = 0) {
  if (!item?.link) return false;
  if (item.featured) return true;
  return index < 45;
}

function needsLeadExcerptEnrichment(item, index = 0) {
  if (!isLeadExcerptCandidate(item, index)) return false;
  return excerptLooksIncomplete(item);
}

async function fetchLeadExcerpt(item) {
  if (!item?.link) return { text: '', score: 0, reason: 'no-link' };
  const html = await fetchText(item.link);
  if (!html || html.length < 200) return { text: '', score: 0, reason: 'fetch-failed' };
  const body = articleBodyHtml(html);
  const picked = pickBestLeadParagraph(body);
  if (picked.text.length >= LEAD_EXCERPT_MIN) return picked;
  return {
    ...picked,
    text: '',
    reason: picked.text ? 'too-short' : (picked.reason || 'no-suitable-paragraph'),
  };
}

function selectEnrichmentCandidates(items = [], limit = 35) {
  const queue = [];
  const seen = new Set();

  items.forEach((item, index) => {
    if (!needsLeadExcerptEnrichment(item, index)) return;
    const key = item.link;
    if (!key || seen.has(key)) return;
    seen.add(key);
    queue.push({ item, index });
  });

  queue.sort((a, b) => {
    const fa = a.item.featured ? 1 : 0;
    const fb = b.item.featured ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return a.index - b.index;
  });

  return queue.slice(0, limit).map((e) => e.item);
}

module.exports = {
  LEAD_EXCERPT_MAX,
  LEAD_EXCERPT_MIN,
  LEAD_SUITABILITY_MIN,
  fetchText,
  articleBodyHtml,
  paragraphsFromHtml,
  scoreLeadParagraph,
  pickBestLeadParagraph,
  leadParagraphFromHtml,
  leadExcerptLooksSuitable,
  excerptLooksIncomplete,
  isLeadExcerptCandidate,
  needsLeadExcerptEnrichment,
  fetchLeadExcerpt,
  selectEnrichmentCandidates,
  endsCompleteSentence,
};
'use strict';
/**
 * Format réel d'une image, lu dans ses premiers octets (jamais dans l'extension ni dans le
 * Content-Type). GitHub Pages choisit le Content-Type d'après l'extension : un AVIF enregistré
 * sous <hash>.jpg part en « image/jpeg ». LinkedIn a refusé un tel fichier le 16 nov. 2026
 * (« An unknown error has occurred », assets/news-images/ebfd0e0cb64e1419.jpg).
 */
function sniffImageFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buf.toString('ascii', 8, Math.min(buf.length, 40));
    if (/avi[fs]/.test(brands)) return 'avif';
    if (/hei[cxms]|hev[cx]|mif1|msf1/.test(brands)) return 'heic';
  }
  return null;
}

/** Extension de fichier qui fait servir le bon Content-Type par GitHub Pages. */
const EXT = { jpeg: '.jpg', png: '.png', gif: '.gif', webp: '.webp', avif: '.avif', heic: '.heic' };
function extForFormat(format) { return EXT[format] || ''; }

/** Format attendu d'après l'extension du fichier (.jpeg = jpeg). */
function formatForExt(name = '') {
  const m = String(name).toLowerCase().match(/\.(jpe?g|png|gif|webp|avif|heic)$/);
  if (!m) return null;
  return m[1].startsWith('jp') ? 'jpeg' : m[1];
}

/** Formats que le miroir publie tels quels (affichés partout dans les navigateurs du site). */
const WEB_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp']);

/**
 * Formats confiés à Buffer : JPEG et PNG seulement, admis par X, LinkedIn et Facebook.
 * (WebP, AVIF et HEIC passent par un relais qui réencode en JPEG.)
 */
const SOCIAL_FORMATS = new Set(['jpeg', 'png']);

/** Le Content-Type annoncé correspond-il au contenu réel ? */
function contentTypeMatches(contentType = '', format = '') {
  const ct = String(contentType).toLowerCase().split(';')[0].trim();
  if (!format) return false;
  if (format === 'jpeg') return ct === 'image/jpeg' || ct === 'image/jpg' || ct === 'image/pjpeg';
  return ct === `image/${format}`;
}

module.exports = { sniffImageFormat, extForFormat, formatForExt, contentTypeMatches, WEB_FORMATS, SOCIAL_FORMATS };

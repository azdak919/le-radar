/**
 * JPEG que Facebook accepte via Buffer.
 *
 * Les exports Canva (« Lightspeed Local ») gardent un JFIF densité 1×1,
 * un profil ICC minuscule et un paquet XMP. Buffer les transmet tels quels
 * et Facebook répond « trouble uploading that image » (fichier jugé corrompu).
 * On retire les segments APPn et on pose un JFIF 72 dpi. Le flux compressé
 * (DQT, SOF, DHT, SOS) ne change pas : mêmes pixels.
 */

const APP0 = Buffer.from([
  0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01,
  0x01,
  0x00, 0x48, 0x00, 0x48,
  0x00, 0x00,
]);

function isJpeg(buf) {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

function walk(buf, onSegment) {
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return false;
    const start = i;
    i += 1;
    while (i < buf.length && buf[i] === 0xff) i += 1;
    if (i >= buf.length) return false;
    const marker = buf[i];
    i += 1;
    if (marker === 0xd9) return true;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > buf.length) return false;
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) return false;
    const stop = onSegment({ start, marker, offset: i, len });
    if (stop) return true;
    i += len;
  }
  return false;
}

/** Vrai si un APPn autre que JFIF 72 dpi est présent, ou si le JFIF est absent / bizarre. */
function jpegNeedsFacebookSanitize(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!isJpeg(buf)) return false;
  let app0ok = false;
  let otherApp = false;
  walk(buf, ({ marker, offset, len }) => {
    if (marker === 0xda) return true;
    if (marker === 0xe0 && len >= 16 && buf.toString('ascii', offset + 2, offset + 7) === 'JFIF\0') {
      const units = buf[offset + 9];
      const xd = buf.readUInt16BE(offset + 10);
      const yd = buf.readUInt16BE(offset + 12);
      app0ok = units === 1 && xd === 72 && yd === 72;
    } else if (marker >= 0xe0 && marker <= 0xef) {
      otherApp = true;
    }
    return false;
  });
  return otherApp || !app0ok;
}

/**
 * JPEG baseline 8 bits, sans EXIF / XMP / ICC.
 * Retourne null si ce n'est pas un JPEG qu'on sait réécrire (CMYK, fichier cassé).
 */
function sanitizeJpegForFacebook(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!isJpeg(buf)) return null;
  const parts = [Buffer.from([0xff, 0xd8]), APP0];
  let sawFrame = false;
  let ok = true;
  walk(buf, ({ start, marker, offset, len }) => {
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const precision = buf[offset + 2];
      const components = buf[offset + 7];
      if (precision !== 8 || components === 4) {
        ok = false;
        return true;
      }
      sawFrame = true;
    }
    if (marker === 0xda) {
      parts.push(buf.subarray(start));
      sawFrame = true;
      return true;
    }
    if (!isApp) parts.push(buf.subarray(start, offset + len));
    return false;
  });
  if (!ok || !sawFrame) return null;
  return Buffer.concat(parts);
}

/** URL wsrv qui ré-encode en JPEG simple. Facebook va chercher ce fichier, pas l'original. */
function facebookRelayUrl(url) {
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85`;
}

module.exports = {
  jpegNeedsFacebookSanitize,
  sanitizeJpegForFacebook,
  facebookRelayUrl,
};

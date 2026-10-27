'use strict';
/**
 * Garde-fous de la publication Android automatique (android-version-prep.yml).
 * Un tag android-vX.Y.Z n'est poussé que si TOUTES les conditions passent.
 */
// Fichiers qui changent réellement l'app (le web est empaqueté par mobile:sync,
// mais les données à forte rotation sont lues en ligne : elles ne comptent pas).
const APP_PATHS = [/^android\//, /^mobile\//, /^article\//, /^capacitor\.config\.json$/, /^native-tuner\.js$/, /^mobile-playback\.js$/];
const DATA_PATHS = [/\.json$/, /^assets\/news-images\//, /^data\//, /^news\//];

function appChanges(files = []) {
  return files.filter((f) => APP_PATHS.some((r) => r.test(f)))
    .filter((f) => !(DATA_PATHS.some((r) => r.test(f)) && !/^android\/|^capacitor\.config\.json$/.test(f)));
}

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  return m ? m.slice(1).map(Number) : null;
}

/** Prochaine version : correctif par défaut, mineure si demandé. Jamais majeure. */
function nextVersion(cur, kind = 'patch') {
  const p = parse(cur);
  if (!p) throw new Error(`version invalide : ${cur}`);
  return kind === 'minor' ? `${p[0]}.${p[1] + 1}.0` : `${p[0]}.${p[1]}.${p[2] + 1}`;
}

function bumpOk(prev, next, prevCode, nextCode) {
  const a = parse(prev); const b = parse(next);
  if (!a || !b) return false;
  if (!(Number(nextCode) > Number(prevCode))) return false;
  if (b[0] !== a[0]) return false; // jamais de majeure automatique
  const patch = b[1] === a[1] && b[2] === a[2] + 1;
  const minor = b[1] === a[1] + 1 && b[2] === 0;
  return patch || minor;
}

/** Au plus une version par mois civil (UTC). */
function monthlyOk(lastTagIso, now = new Date()) {
  if (!lastTagIso) return true;
  const t = new Date(lastTagIso);
  return t.getUTCFullYear() !== now.getUTCFullYear() || t.getUTCMonth() !== now.getUTCMonth();
}

/**
 * @param {object} s  { changes:[], bump:{prev,next,prevCode,nextCode}, lastTagIso, now,
 *                      verification, mobile ('success'|…), gmsClasses:number|null }
 */
function decide(s) {
  const fails = [];
  if (!s.changes || s.changes.length === 0) fails.push('aucun changement app depuis le dernier tag');
  const b = s.bump || {};
  if (!bumpOk(b.prev, b.next, b.prevCode, b.nextCode)) fails.push(`version refusée (${b.prev}→${b.next}, code ${b.prevCode}→${b.nextCode})`);
  if (!monthlyOk(s.lastTagIso, s.now)) fails.push('déjà une version ce mois-ci');
  if (s.verification !== 'success') fails.push(`Vérification : ${s.verification || 'absente'}`);
  if (s.mobile !== 'success') fails.push(`Mobile (tests + builds fdroid/full) : ${s.mobile || 'absent'}`);
  if (s.gmsClasses !== 0) fails.push(`APK fdroid : ${s.gmsClasses == null ? 'non vérifié' : `${s.gmsClasses} classe(s) com.google.android.gms`}`);
  return { release: fails.length === 0, fails };
}

module.exports = { appChanges, nextVersion, bumpOk, monthlyOk, decide };

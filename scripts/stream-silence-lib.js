'use strict';
/**
 * Détection de silence des flux radio.
 *
 * Un flux peut répondre 200 audio/mpeg tout en diffusant du silence numérique
 * (encodeur muet côté poste). On échantillonne ~20 s avec ffmpeg volumedetect
 * et on marque le poste « silent » seulement après SILENT_STREAK_REQUIRED
 * échantillons silencieux consécutifs. Un échantillon raté (ffmpeg absent,
 * timeout, erreur réseau) ne change jamais le statut : il ne masque rien.
 */
const { spawn } = require('child_process');

const SILENCE_MEAN_DB = -60;
const SILENT_STREAK_REQUIRED = 2;
const SAMPLE_SECONDS = 20;

function parseVolumedetect(stderr = '') {
  const mean = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(stderr);
  const max = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(stderr);
  if (!mean) return null;
  const num = (m) => (m[1] === '-inf' ? -Infinity : Number(m[1]));
  const out = { meanDb: num(mean), maxDb: max ? num(max) : null };
  return Number.isNaN(out.meanDb) ? null : out;
}

function isSilentSample(sample) {
  return !!sample && sample.meanDb < SILENCE_MEAN_DB;
}

/**
 * Applique un échantillon à une entrée radios.json (copie).
 * `entry._streamStatus` doit déjà refléter la validation HTTP ('working'…).
 * `prev` = entrée précédente (pour la série de silences).
 */
function applySilenceSample(entry, prev = {}, sample, now = new Date().toISOString()) {
  const out = { ...entry };
  const prevStreak = Number(prev._silentStreak) || 0;
  if (out._streamStatus !== 'working' && out._streamStatus !== 'silent') return out;
  if (!sample) {
    // Échec d'échantillonnage : on conserve l'état antérieur tel quel.
    out._audioCheckFailed = now;
    if (prev._streamStatus === 'silent') out._streamStatus = 'silent';
    if (prevStreak) out._silentStreak = prevStreak;
    return out;
  }
  delete out._audioCheckFailed;
  out._audioChecked = now;
  out._audioMeanDb = Number.isFinite(sample.meanDb) ? Math.round(sample.meanDb * 10) / 10 : -999;
  if (isSilentSample(sample)) {
    const streak = prevStreak + 1;
    out._silentStreak = streak;
    out._streamStatus = streak >= SILENT_STREAK_REQUIRED ? 'silent' : 'working';
  } else {
    delete out._silentStreak;
    out._streamStatus = 'working';
  }
  return out;
}

function sampleStreamLoudness(url, { seconds = SAMPLE_SECONDS, timeoutMs = (seconds + 25) * 1000 } = {}) {
  return new Promise((resolve) => {
    let stderr = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let child;
    try {
      child = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-rw_timeout', '15000000',
        '-t', String(seconds), '-i', url, '-af', 'volumedetect', '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch { return finish(null); }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} finish(null); }, timeoutMs);
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 200000) stderr = stderr.slice(-50000); });
    child.on('error', () => { clearTimeout(timer); finish(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Trop peu d'audio décodé = échantillon non fiable.
      const t = /time=(\d+):(\d+):([\d.]+)/g; let m, last = 0;
      while ((m = t.exec(stderr))) last = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      if (code !== 0 || last < seconds * 0.6) return finish(null);
      finish(parseVolumedetect(stderr));
    });
  });
}

/** Côté clients : un poste masqué temporairement. */
function isStationSilent(radio) {
  return !!radio && radio._streamStatus === 'silent';
}

module.exports = {
  SILENCE_MEAN_DB, SILENT_STREAK_REQUIRED, SAMPLE_SECONDS,
  parseVolumedetect, isSilentSample, applySilenceSample, sampleStreamLoudness, isStationSilent,
};

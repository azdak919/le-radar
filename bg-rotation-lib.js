/* LE RADAR — rotation / randomness des fonds (mât + pomo)
 *
 * Objectifs :
 *   - CSPRNG (crypto.getRandomValues) + rejet sans biais modulo
 *   - identité stable par URL (pas d’index fragile quand les banques bougent)
 *   - sac de session (shuffle bag) + fenêtre anti-répétition longue
 *   - diversité banque / mood / photographe
 *   - entropie optionnelle Cloudflare Worker (edge crypto + colo)
 *
 * API globale : window.BgRotation
 * Worker optionnel : GET {origin}/v1/entropy?surface=masthead|pomo
 */
(function (root) {
  'use strict';

  const DEFAULT_ENTROPY_URL =
    typeof location !== 'undefined' && /le-radar\.ca$/i.test(location.hostname)
      ? 'https://le-radar-bg-rotation.azdak.workers.dev/v1/entropy'
      : '';

  /** Uint32 CSPRNG → entier [0, n) sans biais. */
  function randInt(n) {
    if (n <= 1) return 0;
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint32Array(1);
        const max = 0x100000000;
        const limit = max - (max % n);
        let x;
        do {
          crypto.getRandomValues(buf);
          x = buf[0];
        } while (x >= limit);
        return x % n;
      }
    } catch (_) {}
    return Math.floor(Math.random() * n);
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Identifiant stable d’une photo (URL normalisée). */
  function photoId(item) {
    if (!item) return '';
    if (typeof item === 'string') return item.trim();
    const url = String(item.url || item.id || '').trim();
    if (!url) return String(item.title || '').trim().slice(0, 80);
    try {
      const u = new URL(url, 'https://example.invalid');
      // Ignore query cache-busters for identity
      u.search = '';
      u.hash = '';
      return u.href;
    } catch {
      return url.split('?')[0];
    }
  }

  function bankOf(item) {
    if (!item) return 'other';
    if (item.bank) return String(item.bank);
    if (item.culture === 'quebec-nations') return 'nations';
    if (item.culture === 'quebec') return 'quebec';
    if (item.culture) return `c:${item.culture}`;
    const src = String(item.source || '');
    if (/unsplash/i.test(src)) return 'unsplash';
    if (/pexels/i.test(src)) return 'pexels';
    if (/wikimedia|commons/i.test(src)) return 'commons';
    return 'other';
  }

  function photographerKey(item) {
    if (!item) return '';
    try {
      if (item.link) {
        const path = new URL(item.link).pathname.replace(/\/+$/, '');
        const handle = path.split('/').filter(Boolean).pop();
        if (handle) return handle.toLowerCase();
      }
    } catch (_) {}
    return String(item.credit || '')
      .split(/[—|·]/)[0]
      .trim()
      .toLowerCase()
      .slice(0, 48);
  }

  function loadJson(key, fallback) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw == null ? fallback : raw;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  /**
   * Mélange un blob d’entropie distante (Worker CF) dans un pool d’octets local.
   * Sans Worker : CSPRNG local suffit.
   */
  async function fetchRemoteEntropy(surface, entropyUrl) {
    const url = entropyUrl || DEFAULT_ENTROPY_URL;
    if (!url || typeof fetch !== 'function') return null;
    try {
      const u = new URL(url);
      u.searchParams.set('surface', surface || 'any');
      u.searchParams.set('t', String(Date.now()));
      const res = await fetch(u.href, {
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data.entropy !== 'string') return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Crée un état de rotation pour une surface (masthead | pomo).
   * @param {object} opts
   * @param {string} opts.surface
   * @param {string} opts.storageKey  préfixe localStorage
   * @param {number} [opts.maxRecent=40]
   * @param {string} [opts.entropyUrl]
   * @param {function} [opts.moodFn]  (item) => string
   */
  function createRotator(opts) {
    const surface = opts.surface || 'default';
    const storageKey = opts.storageKey || `lr_bg_rot_${surface}`;
    const maxRecent = opts.maxRecent || 40;
    const moodFn = typeof opts.moodFn === 'function' ? opts.moodFn : () => 'other';
    const entropyUrl = opts.entropyUrl;

    let bag = []; // photoIds
    let recentIds = loadJson(`${storageKey}_recent`, []);
    if (!Array.isArray(recentIds)) recentIds = [];
    let recentBanks = loadJson(`${storageKey}_banks`, []);
    if (!Array.isArray(recentBanks)) recentBanks = [];
    let recentMoods = loadJson(`${storageKey}_moods`, []);
    if (!Array.isArray(recentMoods)) recentMoods = [];
    let remoteEntropy = null;
    let entropyPromise = null;

    function ensureEntropy() {
      if (remoteEntropy || entropyPromise) return entropyPromise;
      entropyPromise = fetchRemoteEntropy(surface, entropyUrl).then((data) => {
        remoteEntropy = data;
        // Stir: consume a few extra CSPRNG draws seeded by remote day+colo length
        if (data && data.entropy) {
          const n = Math.min(8, data.entropy.length);
          for (let i = 0; i < n; i++) randInt(97 + (data.entropy.charCodeAt(i) % 50));
        }
        return data;
      });
      return entropyPromise;
    }

    // Fire-and-forget; pick works offline without waiting
    ensureEntropy();

    function persist() {
      saveJson(`${storageKey}_recent`, recentIds.slice(-maxRecent));
      saveJson(`${storageKey}_banks`, recentBanks.slice(-12));
      saveJson(`${storageKey}_moods`, recentMoods.slice(-8));
    }

    function record(item) {
      const id = photoId(item);
      if (!id) return;
      recentIds = recentIds.filter((x) => x !== id);
      recentIds.push(id);
      if (recentIds.length > maxRecent) recentIds = recentIds.slice(-maxRecent);

      const bank = bankOf(item);
      recentBanks.push(bank);
      if (recentBanks.length > 12) recentBanks = recentBanks.slice(-12);

      const mood = moodFn(item);
      recentMoods.push(mood);
      if (recentMoods.length > 8) recentMoods = recentMoods.slice(-8);

      bag = bag.filter((x) => x !== id);
      persist();
    }

    function refillBag(items, failedIds) {
      const failed = failedIds || new Set();
      const avoid = new Set(recentIds.slice(-maxRecent));
      const ids = items
        .map((it) => photoId(it))
        .filter((id) => id && !failed.has(id));
      const fresh = ids.filter((id) => !avoid.has(id));
      const base =
        fresh.length >= Math.min(8, ids.length) ? fresh : ids.slice();
      bag = shuffleInPlace(base.slice());
    }

    function scoreItem(item, byId) {
      let score = 10 + randInt(6);
      const id = photoId(item);
      const bank = bankOf(item);
      const mood = moodFn(item);
      const photo = photographerKey(item);

      // Anti-répétition récente (plus fort si très récent)
      const rIdx = recentIds.lastIndexOf(id);
      if (rIdx >= 0) {
        const age = recentIds.length - 1 - rIdx;
        score -= Math.max(0, 14 - age);
      } else {
        score += 4;
      }

      // Diversité banque (mât multi-banques / pomo QC+stock)
      for (let k = 0; k < recentBanks.length; k++) {
        if (recentBanks[recentBanks.length - 1 - k] === bank) {
          score -= Math.max(1, 5 - k);
        }
      }
      // Bonus si banque sous-représentée dans l’historique
      const bankHits = recentBanks.filter((b) => b === bank).length;
      if (bankHits === 0) score += 3;
      else if (bankHits >= 4) score -= 2;

      // Diversité mood
      for (let k = 0; k < recentMoods.length; k++) {
        if (recentMoods[recentMoods.length - 1 - k] === mood) {
          score -= Math.max(1, 5 - k);
        }
      }
      if (mood === 'mist') score -= 4;

      // Même photographe d’affilée
      if (recentIds.length) {
        const last = byId.get(recentIds[recentIds.length - 1]);
        if (last && photo && photo === photographerKey(last)) score -= 9;
      }

      return score;
    }

    /**
     * Choisit un item dans la liste.
     * @param {object[]} items
     * @param {{ failedIds?: Set<string>, excludeId?: string }} [opts]
     */
    function pick(items, pickOpts) {
      const list = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!list.length) return null;

      const failed = (pickOpts && pickOpts.failedIds) || new Set();
      const excludeId = pickOpts && pickOpts.excludeId;

      const byId = new Map();
      for (const it of list) {
        const id = photoId(it);
        if (id) byId.set(id, it);
      }

      let eligible = list.filter((it) => {
        const id = photoId(it);
        return id && !failed.has(id) && id !== excludeId;
      });
      if (!eligible.length) {
        eligible = list.filter((it) => photoId(it) !== excludeId);
      }
      if (!eligible.length) eligible = list.slice();

      // Sac : ids encore dans le pool éligible
      const eligibleIds = new Set(eligible.map(photoId));
      bag = bag.filter((id) => eligibleIds.has(id));
      if (bag.length < 3) {
        refillBag(eligible, failed);
        bag = bag.filter((id) => id !== excludeId);
        if (!bag.length) refillBag(eligible, failed);
      }

      // Fenêtre en tête du sac + scoring de diversité
      const windowSize = Math.min(12, Math.max(1, bag.length));
      let windowIds = bag.slice(0, windowSize);
      // Garantir que chaque banque présente a au moins 1 candidat dans la fenêtre
      const banksInPool = new Set(eligible.map(bankOf));
      if (banksInPool.size > 1 && windowIds.length >= 4) {
        const windowBanks = new Set(
          windowIds.map((id) => bankOf(byId.get(id))).filter(Boolean)
        );
        for (const b of banksInPool) {
          if (windowBanks.has(b)) continue;
          const alt = eligible.find((it) => bankOf(it) === b);
          if (alt) {
            windowIds.push(photoId(alt));
            windowBanks.add(b);
          }
        }
      }

      let bestId = windowIds[0] || photoId(eligible[0]);
      let bestScore = -Infinity;
      for (const id of windowIds) {
        const it = byId.get(id);
        if (!it) continue;
        const s = scoreItem(it, byId);
        if (s > bestScore) {
          bestScore = s;
          bestId = id;
        }
      }

      const chosen = byId.get(bestId) || eligible[randInt(eligible.length)];
      bag = bag.filter((id) => id !== photoId(chosen));
      return chosen;
    }

    function getState() {
      return {
        surface,
        recentIds: recentIds.slice(),
        recentBanks: recentBanks.slice(),
        bagSize: bag.length,
        remoteEntropy: remoteEntropy
          ? { day: remoteEntropy.day, colo: remoteEntropy.colo }
          : null,
      };
    }

    return {
      photoId,
      bankOf,
      pick,
      record,
      ensureEntropy,
      getState,
      randInt,
      shuffleInPlace,
    };
  }

  const api = {
    randInt,
    shuffleInPlace,
    photoId,
    bankOf,
    photographerKey,
    createRotator,
    fetchRemoteEntropy,
    DEFAULT_ENTROPY_URL,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BgRotation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

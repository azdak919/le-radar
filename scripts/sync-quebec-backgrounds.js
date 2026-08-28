#!/usr/bin/env node
/**
 * LE RADAR — sync banques fonds QC (JSON → JS, hors réseau)
 *
 * JSON = source de vérité. Les `*-data.js` sont dérivés.
 * Purge aussi les entrées hard-bannies (voir quebec-backgrounds-blacklist.js).
 *
 * Usage :
 *   node scripts/sync-quebec-backgrounds.js           # purge + écrit JS
 *   node scripts/sync-quebec-backgrounds.js --check   # dry-run, exit 1 si drift/ban
 *   node scripts/sync-quebec-backgrounds.js --profile masthead
 *
 * Ne découvre PAS Commons. Pour revalidation + seeds :
 *   npm run maintain:masthead  (etc.)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { matchHardBanned } = require('./quebec-backgrounds-blacklist');
const { scrubBankCredits, sanitizeCommonsCredit, placeFromPhotoMeta } = require('./commons-credit-lib');
const { seasonTagTrusted } = require('./season-lib');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const profileFilter = (() => {
  const eq = args.find((a) => a.startsWith('--profile='));
  if (eq) return eq.slice('--profile='.length).trim().toLowerCase();
  const i = args.indexOf('--profile');
  if (i >= 0 && args[i + 1]) return String(args[i + 1]).trim().toLowerCase();
  return null;
})();

/** Cartographie banques — garder alignée avec maintain-quebec-backgrounds + pin-background. */
const BANKS = [
  {
    id: 'masthead',
    label: 'paysages QC — mât',
    jsonRel: 'data/quebec-backgrounds.json',
    jsRel: 'quebec-backgrounds-data.js',
    globalName: 'QUEBEC_BACKGROUNDS',
    consumers: 'mât page d’accueil seulement — jamais le pomo',
    kind: 'maintain',
  },
  {
    id: 'universities',
    label: 'campus universitaires QC — mât',
    jsonRel: 'data/quebec-university-backgrounds.json',
    jsRel: 'quebec-university-backgrounds-data.js',
    globalName: 'QUEBEC_UNIVERSITY_BACKGROUNDS',
    consumers: 'mât page d’accueil seulement — jamais le pomo',
    kind: 'maintain',
  },
  {
    id: 'pomo',
    label: 'paysages QC — pomo',
    jsonRel: 'data/quebec-pomo-backgrounds.json',
    jsRel: 'quebec-pomo-backgrounds-data.js',
    globalName: 'QUEBEC_POMO_BACKGROUNDS',
    consumers: 'pomo uniquement — jamais le mât de la page principale',
    kind: 'maintain',
  },
  {
    id: 'nations',
    label: 'Premières Nations & Inuit — mât + pomo',
    jsonRel: 'data/quebec-nations-backgrounds.json',
    jsRel: 'quebec-nations-backgrounds-data.js',
    globalName: 'QUEBEC_NATIONS_BACKGROUNDS',
    consumers: 'mât page d’accueil ET pomo (banque partagée thématique)',
    kind: 'maintain',
  },
  {
    id: 'favorites',
    label: 'favorites manuelles (permanentes)',
    jsonRel: 'data/quebec-favorites-backgrounds.json',
    jsRel: 'quebec-favorites-backgrounds-data.js',
    globalName: 'QUEBEC_FAVORITES_BACKGROUNDS',
    consumers: 'mât (+ pomo / solitaire si surfaces les inclut)',
    kind: 'favorites',
  },
];

function photoIdFromUrl(url) {
  return crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function loadBank(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    return { version: 1, photos: [], _missing: true };
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function parseJsUrls(jsPath) {
  if (!fs.existsSync(jsPath)) return [];
  const text = fs.readFileSync(jsPath, 'utf8');
  const urls = [];
  const re = /url:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) urls.push(m[1]);
  return urls;
}

function photoToJsObject(p, bank) {
  const credit = sanitizeCommonsCredit(p.credit || '') || p.credit || '';
  const lines = [
    `    url: "${esc(p.url)}"`,
    `    credit: "${esc(credit)}"`,
    `    link: "${esc(p.link)}"`,
    `    license: "${esc(p.license)}"`,
    `    title: "${esc(p.title)}"`,
  ];
  if (typeof p.focalY === 'number' && !Number.isNaN(p.focalY)) {
    lines.push(`    focalY: ${p.focalY}`);
  }
  // Dimensions natives Commons — gate low_resolution côté client (pas le thumb)
  if (typeof p.width === 'number' && p.width > 0) {
    lines.push(`    width: ${Math.round(p.width)}`);
  }
  if (typeof p.height === 'number' && p.height > 0) {
    lines.push(`    height: ${Math.round(p.height)}`);
  }
  if (typeof p.position === 'string' && p.position.trim()) {
    lines.push(`    position: "${esc(p.position.trim())}"`);
  }
  const place = p.place || placeFromPhotoMeta(p.title || '', p.description || '');
  if (place) lines.push(`    place: "${esc(place)}"`);
  if (bank.id === 'universities') {
    lines.push('    campus: true');
  }
  if (bank.id === 'nations') {
    if (p.nationId) lines.push(`    nationId: "${esc(p.nationId)}"`);
    if (p.nation) lines.push(`    nation: "${esc(p.nation)}"`);
  }
  // Saisons pour rotation client (4 = QC ; 6 = nations/Inuit).
  // Le miroir ne transporte ni seasonSource ni seasonConfidence : une étiquette
  // « sessionId-fallback » (photo jamais analysée, héritée de la session de
  // moisson) y deviendrait indiscernable d'une vraie détection et entrerait dans
  // le tier STRICT — c'est ainsi qu'une scène de neige s'affichait en août. On
  // n'exporte donc que les étiquettes de confiance ; les autres sont traitées
  // comme « saison inconnue » côté client.
  if (seasonTagTrusted(p)) {
    if (p.season) lines.push(`    season: "${esc(p.season)}"`);
    if (p.season6) lines.push(`    season6: "${esc(p.season6)}"`);
  }
  if (bank.kind === 'favorites' || p.permanent === true) {
    lines.push('    permanent: true');
  }
  if (Array.isArray(p.surfaces) && p.surfaces.length) {
    lines.push(
      `    surfaces: [${p.surfaces.map((s) => `"${esc(s)}"`).join(', ')}]`
    );
  }
  if (Array.isArray(p.tags) && p.tags.length) {
    lines.push(`    tags: [${p.tags.map((t) => `"${esc(t)}"`).join(', ')}]`);
  }
  return `  {\n${lines.join(',\n')},\n  }`;
}

function buildJs(bank, photos) {
  if (bank.kind === 'favorites') {
    const header = `/* LE RADAR — banque favorites (permanente, manuelle)
 * Source de vérité : ${bank.jsonRel}
 * Régénéré par : node scripts/sync-quebec-backgrounds.js
 * Ne pas écraser via maintain-quebec-backgrounds (ménage / purge).
 * Ajouts : signalement manuel ou node scripts/pin-background.js
 *
 * Consommateurs : ${bank.consumers}
 * permanent: true → immunisé contre la purge des bots
 */
`;
    const body = photos.map((p) => photoToJsObject(p, bank)).join(',\n');
    return `${header}const ${bank.globalName} = [\n${body}\n];\n`;
  }

  const header = `/* LE RADAR — banque de photos de fond (généré)
 * Profil : ${bank.id} (${bank.label})
 * Source de vérité : ${bank.jsonRel}
 * Régénéré par : node scripts/sync-quebec-backgrounds.js
 * (ou maintain-quebec-backgrounds.js --update --profile ${bank.id})
 * Ne pas éditer à la main — le bot de session / bank:sync écrase ce fichier.
 *
 * Consommateurs : ${bank.consumers}
 *
 * Politique : pas de religieux institutionnel ; nations du Québec OK ;
 * pas de personnes reconnaissables ; plafond large ; ménage 1×/session univ.
 * Résolution mini ~1400×700 / 1.2 Mpx (anti-grain upscale).
 * focalY optionnel (0=haut, 1=bas) pour cover crop.
 * Hard-ban : scripts/quebec-backgrounds-blacklist.js
 */
`;
  const body = photos.map((p) => photoToJsObject(p, bank)).join(',\n');
  return `${header}const ${bank.globalName} = [\n${body}\n];\n`;
}

function purgeBanned(photos) {
  const kept = [];
  const removed = [];
  for (const p of photos || []) {
    const hit = matchHardBanned(p);
    if (hit) {
      removed.push({ title: p.title || p.id || p.url, reason: hit.reason, fragment: hit.fragment });
      continue;
    }
    if (!p.id && p.url) p.id = photoIdFromUrl(p.url);
    kept.push(p);
  }
  return { kept, removed };
}

function syncBanks(opts = {}) {
  const root = opts.root || ROOT;
  const checkOnlyFlag = opts.checkOnly != null ? opts.checkOnly : checkOnly;
  const photosLib = require('./photo-bank-lib');
  const unifiedPath = path.join(root, photosLib.PHOTOS_REL);
  const hasUnified = fs.existsSync(unifiedPath);
  if (hasUnified && !checkOnlyFlag && opts.materialize !== false) {
    if (!opts.skipRetain) {
      const uni = photosLib.loadPhotos(root);
      const before = (uni.photos || []).length;
      const kept = [];
      let strippedMat = 0;
      let mutated = 0;
      for (const p of uni.photos || []) {
        const retained = photosLib.retainUnifiedPhoto(p);
        if (!retained) continue;
        if (retained !== p) mutated += 1;
        if (matchHardBanned(p) && retained !== p) strippedMat += 1;
        kept.push(retained);
      }
      uni.photos = kept;
      if (uni.photos.length !== before || mutated) {
        photosLib.savePhotos(uni, root);
        const dropped = before - uni.photos.length;
        if (dropped) console.log(`  − photo-bank : ${dropped} hard-ban (rejets labo / hors campus)`);
        if (strippedMat) {
          console.log(`  · photo-bank : ${strippedMat} campus hors mât (Casault et assimilés)`);
        } else if (mutated) {
          console.log(`  · photo-bank : ${mutated} photo(s) destinée(s) affiches hors mât`);
        }
      }
    }
    photosLib.materializeLegacySlices(root);
  }
  if (opts.skipScrub == null && hasUnified) opts.skipScrub = true;
  const profile = opts.profile != null ? opts.profile : profileFilter;
  const quiet = !!opts.quiet;
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  const banks = profile
    ? BANKS.filter((b) => b.id === profile || (profile === 'landscape' && b.id === 'masthead'))
    : BANKS;

  if (profile && !banks.length) {
    const msg = `Profil inconnu « ${profile} ».`;
    if (opts.throwOnError) throw new Error(msg);
    console.error(msg);
    process.exit(2);
  }

  log(
    `LE RADAR — bank ${checkOnlyFlag ? 'check' : 'sync'} (${banks.map((b) => b.id).join(', ')})\n`
  );

  let exitCode = 0;
  let wrote = 0;
  let purgedTotal = 0;
  let creditScrubTotal = 0;

  for (const bank of banks) {
    const jsonPath = path.join(root, bank.jsonRel);
    const jsPath = path.join(root, bank.jsRel);
    const data = loadBank(jsonPath);

    if (data._missing) {
      log(`  ⚠ ${bank.id}: JSON manquant (${bank.jsonRel})`);
      exitCode = 1;
      continue;
    }

    const before = (data.photos || []).length;
    const { kept, removed } = purgeBanned(data.photos || []);
    purgedTotal += removed.length;
    // Crédits Commons « machine-readable author… » → nom court
    // Le labo photo passe skipScrub : sinon un save manuel est écrasé
    // (lieu recalculé depuis le titre, crédit re-sanitisé).
    const creditFixed = opts.skipScrub ? 0 : scrubBankCredits({ photos: kept });
    creditScrubTotal += creditFixed;

    for (const r of removed) {
      log(`  − ${bank.id}: hard-ban « ${r.title} » (${r.reason})`);
    }
    if (creditFixed) {
      log(`  ✎ ${bank.id}: ${creditFixed} crédit(s) Commons normalisé(s)`);
    }

    const jsonUrls = kept.map((p) => p.url).filter(Boolean);
    const jsUrls = parseJsUrls(jsPath);
    const onlyJson = jsonUrls.filter((u) => !jsUrls.includes(u));
    const onlyJs = jsUrls.filter((u) => !jsonUrls.includes(u));
    // Drift crédit : JS a encore le gabarit long
    const jsText = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
    const jsOut = buildJs(bank, kept);
    const contentDrift = jsOut !== jsText;
    const creditDrift =
      creditFixed > 0 ||
      /No machine-readable author provided/i.test(jsText) ||
      /Aucun auteur lisible par machine/i.test(jsText);
    const drift =
      onlyJson.length > 0 ||
      onlyJs.length > 0 ||
      jsonUrls.length !== jsUrls.length ||
      creditDrift ||
      contentDrift;

    if (removed.length || drift || creditFixed) {
      if (drift && !removed.length && !creditFixed) {
        log(
          `  ± ${bank.id}: drift JSON↔JS (json=${jsonUrls.length} js=${jsUrls.length}` +
            `${onlyJson.length ? ` +json=${onlyJson.length}` : ''}` +
            `${onlyJs.length ? ` +js=${onlyJs.length}` : ''})`
        );
      }
      if (checkOnlyFlag) {
        exitCode = 1;
        log(`  ✗ ${bank.id}: ${before} photos — action requise (bank:sync)`);
        continue;
      }
    } else if (checkOnlyFlag) {
      log(`  ✓ ${bank.id}: ${kept.length} photos, JSON↔JS OK, aucun ban`);
      continue;
    }

    if (checkOnlyFlag) continue;

    if (!removed.length && !drift && !creditFixed) {
      log(`  · ${bank.id}: inchangé`);
      continue;
    }

    data.photos = kept;
    data.updated = new Date().toISOString();
    if (bank.kind === 'maintain' && !data.profile) data.profile = bank.id;
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

    fs.writeFileSync(jsPath, jsOut, 'utf8');
    wrote += 1;
    log(
      `  ✅ ${bank.id}: ${kept.length} photos` +
        (removed.length ? ` (−${removed.length} ban)` : '') +
        (creditFixed ? ` (crédits ✎${creditFixed})` : '') +
        ` → ${bank.jsRel}`
    );
  }

  if (checkOnlyFlag) {
    if (exitCode === 0) {
      log('\nCheck OK — JSON et JS alignés, aucun hard-ban en banque.');
    } else {
      log('\nCheck ÉCHEC — lancer : npm run bank:sync');
    }
    if (opts.returnResult) return { exitCode, wrote, purgedTotal, creditScrubTotal };
    process.exit(exitCode);
  }

  log(
    `\nSync terminé : ${wrote} banque(s) écrite(s), ${purgedTotal} hard-ban purgé(s)` +
      (creditScrubTotal ? `, ${creditScrubTotal} crédit(s) normalisé(s)` : '') +
      '.'
  );
  if (wrote > 0) {
    log(
      'Si des *-data.js shell ont changé : bump SW (radar-shell + pomo-shell si pomo/nations/favorites).'
    );
  }
  return { exitCode, wrote, purgedTotal, creditScrubTotal };
}

function main() {
  const result = syncBanks();
  if (result && result.exitCode) process.exit(result.exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  BANKS,
  syncBanks,
  photoToJsObject,
  buildJs,
  purgeBanned,
};

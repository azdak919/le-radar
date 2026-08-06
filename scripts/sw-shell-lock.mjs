#!/usr/bin/env node
/**
 * Verrou de fraîcheur des shells service worker.
 *
 * POURQUOI CE FICHIER EXISTE
 * `AGENTS.md` demande de bumper `radar-shell-vN` quand un asset de l'`APP_SHELL`
 * change. La consigne a été oubliée trois fois de suite sur `style.css`
 * (a5be73a, a0a83ff, 6ea309f) : les workers restent network-first, mais leur
 * repli `caches.match()` sert alors une feuille jamais purgée. Un appareil dont
 * le réseau flanche sur une seule requête affiche un HTML récent avec un CSS
 * d'il y a plusieurs jours — le menu de sections y sortait en liens soulignés
 * collés au bord gauche, faute des règles `.site-sections`.
 *
 * Le verrou enregistre une empreinte des assets de code de chaque shell.
 * `npm run check` échoue si elle a bougé sans bump ; `npm run sw:bump` bumpe et
 * réécrit le verrou.
 *
 * POURQUOI SEULEMENT `.css` ET `.js`
 * Les shells listent aussi du HTML, du JSON et des images. `sports/index.html`
 * est reprérendu par le bot RSEQ à chaque passage, `radios.json` et
 * `brand-colors.json` bougent tout autant : les inclure ferait échouer le check
 * sur chaque commit automatique, pour un risque nul (le HTML est servi
 * network-first et les données sont rechargées par le JS). Le mal qu'on répare
 * est le couple « HTML frais + feuille de style ou script périmé ».
 *
 * Le worker lui-même est exclu : son propre `vN` est ce qu'on bumpe, l'inclure
 * rendrait le verrou impossible à satisfaire.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_PATH = join(ROOT, 'sw-shell-lock.json');

/**
 * Un descripteur par worker : les mini-apps ne nomment pas leurs constantes
 * comme la racine, et /sports/ compose sa liste depuis deux tableaux.
 */
export const WORKERS = [
  { file: 'sw.js', cacheConst: 'CACHE_NAME', shellConsts: ['APP_SHELL'] },
  { file: 'pomo/sw.js', cacheConst: 'SHELL_CACHE', shellConsts: ['SHELL_ASSETS'] },
  { file: 'solitaire/sw.js', cacheConst: 'SHELL_CACHE', shellConsts: ['SHELL_ASSETS'] },
  { file: 'sports/sw.js', cacheConst: 'SHELL_CACHE', shellConsts: ['SCOPE_ASSETS', 'SHARED_ASSETS'] },
];

const HASHED_EXT = /\.(css|js)$/i;

/** Nom de cache déclaré par le worker (ex. `radar-shell-v576`). */
function readCacheName(source, constName, file) {
  const m = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*["']([^"']+)["']`));
  if (!m) throw new Error(`${file} : constante ${constName} introuvable`);
  return m[1];
}

/** Entrées d'un tableau littéral de chemins déclaré `const NOM = [ … ];`. */
function readShellArray(source, constName, file) {
  const start = source.indexOf(`const ${constName} = [`);
  if (start === -1) throw new Error(`${file} : tableau ${constName} introuvable`);
  const end = source.indexOf('];', start);
  if (end === -1) throw new Error(`${file} : tableau ${constName} non terminé`);
  return [...source.slice(start, end).matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith('.'));
}

/**
 * Empreintes des assets de code d'un worker, chemins relatifs à la racine du
 * dépôt pour que le verrou reste lisible.
 */
function hashShell(worker) {
  const file = join(ROOT, worker.file);
  const source = readFileSync(file, 'utf8');
  const base = dirname(file);
  const seen = new Map();
  for (const shellConst of worker.shellConsts) {
    for (const entry of readShellArray(source, shellConst, worker.file)) {
      if (!HASHED_EXT.test(entry)) continue;
      const target = resolve(base, entry);
      if (target === file) continue; // le worker se bumpe lui-même
      const key = relative(ROOT, target);
      if (seen.has(key)) continue;
      if (!existsSync(target)) throw new Error(`${worker.file} : ${entry} listé mais absent du dépôt`);
      seen.set(key, createHash('sha256').update(readFileSync(target)).digest('hex').slice(0, 16));
    }
  }
  return {
    cache: readCacheName(source, worker.cacheConst, worker.file),
    assets: Object.fromEntries([...seen.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** État calculé depuis les fichiers, pour les quatre workers. */
export function computeLock() {
  const out = {};
  for (const worker of WORKERS) out[worker.file] = hashShell(worker);
  return out;
}

export function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
}

/**
 * Écarts entre le verrou et les fichiers, worker par worker.
 * `changed` : assets dont l'empreinte a bougé (ou apparu/disparu).
 * `cacheStale` : ces assets ont bougé ET le nom de cache n'a pas suivi.
 */
export function diffLock(lock, computed) {
  const report = [];
  for (const worker of WORKERS) {
    const before = lock?.[worker.file];
    const after = computed[worker.file];
    const keys = new Set([...Object.keys(before?.assets || {}), ...Object.keys(after.assets)]);
    const changed = [...keys].filter((k) => before?.assets?.[k] !== after.assets[k]).sort();
    report.push({
      file: worker.file,
      cacheBefore: before?.cache || null,
      cacheAfter: after.cache,
      changed,
      cacheStale: changed.length > 0 && before?.cache === after.cache,
      missing: !before,
    });
  }
  return report;
}

/** `radar-shell-v575` → `radar-shell-v576`. */
function bumpCacheName(name) {
  const m = name.match(/^(.*?)(\d+)$/);
  if (!m) throw new Error(`nom de cache non versionné : ${name}`);
  return `${m[1]}${Number(m[2]) + 1}`;
}

function writeBump(workerFile, from, to) {
  const path = join(ROOT, workerFile);
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, source.replace(`"${from}"`, `"${to}"`).replace(`'${from}'`, `'${to}'`));
}

function main() {
  const write = process.argv.includes('--write');
  let computed = computeLock();
  const report = diffLock(readLock(), computed);

  if (!write) {
    const problems = report.filter((r) => r.cacheStale || r.missing);
    for (const r of report) {
      if (r.missing) {
        console.error(`✗ ${r.file} : absent de sw-shell-lock.json — lance « npm run sw:bump »`);
      } else if (r.cacheStale) {
        console.error(
          `✗ ${r.changed.join(', ')} a changé sans bump de ${r.cacheAfter} `
          + `(${r.file}, voir AGENTS.md) — lance « npm run sw:bump »`,
        );
      }
    }
    const drift = report.filter((r) => !r.cacheStale && !r.missing && r.changed.length);
    for (const r of drift) {
      console.error(`✗ ${r.file} : verrou désynchronisé (${r.changed.join(', ')}) — lance « npm run sw:bump »`);
    }
    if (problems.length || drift.length) process.exit(1);
    console.log(`OK verrou des shells SW (${WORKERS.length} workers)`);
    return;
  }

  const bumped = [];
  for (const r of report) {
    if (!r.changed.length || r.missing) continue;
    const next = bumpCacheName(r.cacheAfter);
    writeBump(r.file, r.cacheAfter, next);
    bumped.push(`${r.file} : ${r.cacheAfter} → ${next} (${r.changed.join(', ')})`);
  }
  if (bumped.length) computed = computeLock();
  writeFileSync(LOCK_PATH, `${JSON.stringify(computed, null, 2)}\n`);
  if (bumped.length) bumped.forEach((line) => console.log(`↑ ${line}`));
  else console.log('= aucun asset de shell modifié, verrou resynchronisé');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
/**
 * LE RADAR — récolte « vibe-code intense » → candidats ledger
 *
 * Ce n’est PAS de la magie conversationnelle : on observe le **git**
 * (commits + working tree) pour détecter des zones chaudes répétées et
 * proposer des lignes pour AGENTS.md.
 *
 * Usage :
 *   npm run agents:harvest              # analyse + affiche
 *   npm run agents:harvest -- --write   # écrit § candidats dans AGENTS.md
 *   npm run agents:harvest -- --since 12h
 *   npm run agents:harvest -- --json
 *
 * L’agent doit lancer harvest en fin de session intensive, montrer les
 * candidats à l’humain, et n’ajouter une vraie dette D# qu’avec OK.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENTS_PATH = path.join(ROOT, 'AGENTS.md');
const HARVEST_PATH = path.join(ROOT, '.agents-harvest.json');

/** Zones → suggestion de dette (si intensité haute). */
const ZONES = [
  {
    id: 'monolith-app',
    test: (f) => f === 'app.js' || f.endsWith('/app.js'),
    weight: 3,
    title: 'Découper / modulariser app.js (tranche)',
    why: 'Fichier monolithe touché souvent en vibe-code → re-lit cher en tokens',
    effort: 'L',
    related: 'D2',
  },
  {
    id: 'monolith-css',
    test: (f) => f === 'style.css' || f.endsWith('/style.css'),
    weight: 2.5,
    title: 'Extraire CSS mât / thème (tranche style.css)',
    why: 'style.css monolithe ; changements UI = relecture large',
    effort: 'M',
    related: 'D2',
  },
  {
    id: 'banks-photo',
    test: (f) =>
      /quebec-.*background|data\/quebec-|maintain-quebec|bank-hard|season-lib|detect-photo-seasons|religious-facade|blacklist/.test(
        f,
      ),
    weight: 2,
    title: 'Pipeline banques photo (QC / saisons / audit)',
    why: 'Beaucoup d’activité sur les fonds — documenter ou automatiser le reste',
    effort: 'M',
    related: 'D3',
  },
  {
    id: 'radio-mobile',
    test: (f) =>
      /mobile-playback|player-sync|cast\.js|radio-nowplaying|nowplaying/.test(f),
    weight: 2.5,
    title: 'Radio mobile / Media Session / reprise',
    why: 'Zone audio mobile sensible ; regroupe les fix récurrents',
    effort: 'M',
    related: null,
  },
  {
    id: 'pwa-sw',
    test: (f) =>
      /(^|\/)sw\.js$|manifest\.json|engage-prompt|offline\.html|pomo\/sw/.test(f),
    weight: 2,
    title: 'PWA / service worker / install',
    why: 'SW et install touchés souvent ; risque de cache oublié',
    effort: 'S',
    related: null,
  },
  {
    id: 'pomo',
    test: (f) => f.startsWith('pomo/'),
    weight: 1.5,
    title: 'Isolation / qualité mini-app Pomo',
    why: 'Activité concentrée sur /pomo/',
    effort: 'S',
    related: null,
  },
  {
    id: 'bots-ci',
    test: (f) =>
      f.startsWith('scripts/') ||
      f.startsWith('tests/') ||
      f.startsWith('.github/'),
    weight: 1.2,
    title: 'Bots / CI / scripts de maintenance',
    why: 'Beaucoup de scripts touchés — opportunité de factoriser',
    effort: 'M',
    related: 'D1',
  },
  {
    id: 'docs-agents',
    test: (f) =>
      /AGENTS\.md|agent-playbook|CLAUDE\.md|\.cursor\/|agents-ledger|agents-harvest/.test(
        f,
      ),
    weight: 0.8,
    title: 'Playbook / ledger agents (méta)',
    why: 'Travail sur le système d’agents lui-même',
    effort: 'S',
    related: null,
  },
];

function sh(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch (e) {
    return (e.stdout || '').toString().trim();
  }
}

function parseSince(arg) {
  // 12h, 2d, 48h, default 36h
  const m = String(arg || '36h').match(/^(\d+)([hd])$/i);
  if (!m) return '36 hours ago';
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase() === 'd' ? 'days' : 'hours';
  return `${n} ${unit} ago`;
}

/** Fichiers générés par bots CI — ne comptent pas comme « vibe humain ». */
const IGNORE_FILE =
  /^(news\.json|author-qc\.json|lead-.*\.json|photo-credit-qc\.json|social-feed\.json|radio-nowplaying\.json|feed\.xml|bot-status\.json|docs\/scan-qc-report\.(json|md))$/;

function collectFiles(sinceHuman) {
  const counts = new Map(); // file -> touches
  const log = sh(
    `git log --since="${sinceHuman}" --pretty=format: --name-only`,
  );
  for (const line of log.split('\n')) {
    const f = line.trim();
    if (!f || IGNORE_FILE.test(f)) continue;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  // Working tree (vibe en cours non commité)
  const dirty = sh('git status --porcelain');
  for (const line of dirty.split('\n')) {
    if (!line.trim()) continue;
    const f = line.slice(3).trim().split(' -> ').pop();
    if (!f || IGNORE_FILE.test(f)) continue;
    counts.set(f, (counts.get(f) || 0) + 2); // poids un peu plus fort si WIP
  }
  return counts;
}

function scoreZones(fileCounts) {
  const scores = new Map();
  const filesByZone = new Map();
  for (const [file, n] of fileCounts) {
    for (const z of ZONES) {
      if (!z.test(file)) continue;
      scores.set(z.id, (scores.get(z.id) || 0) + n * z.weight);
      if (!filesByZone.has(z.id)) filesByZone.set(z.id, []);
      filesByZone.get(z.id).push({ file, n });
    }
  }
  return { scores, filesByZone };
}

function intensity(fileCounts, commitCount) {
  let files = fileCounts.size;
  let touches = 0;
  for (const n of fileCounts.values()) touches += n;
  // seuils empiriques « vibe intense »
  const score =
    commitCount * 2 + files * 1.2 + Math.min(touches, 80) * 0.4;
  let level = 'light';
  if (score >= 18) level = 'moderate';
  if (score >= 35) level = 'intense';
  if (score >= 55) level = 'heavy';
  return { score: Math.round(score * 10) / 10, level, files, touches, commitCount };
}

function buildCandidates(scores, filesByZone, intensityInfo) {
  if (intensityInfo.level === 'light') return [];
  const minScore = intensityInfo.level === 'heavy' ? 4 : intensityInfo.level === 'intense' ? 6 : 10;
  const out = [];
  for (const z of ZONES) {
    const s = scores.get(z.id) || 0;
    if (s < minScore) continue;
    const files = (filesByZone.get(z.id) || [])
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((x) => x.file);
    out.push({
      zone: z.id,
      title: z.title,
      why: z.why,
      effort: z.effort,
      related: z.related,
      heat: Math.round(s * 10) / 10,
      files,
    });
  }
  out.sort((a, b) => b.heat - a.heat);
  return out.slice(0, 6);
}

function renderAgentsSection(harvest) {
  const lines = [
    '',
    '## 3c. Candidats auto (récolte vibe-code) — pas encore des dettes',
    '',
    '> Généré par `npm run agents:harvest -- --write`. **Pas des D# ouvertes.**',
    '> L’humain (ou l’agent avec OK) promeut une ligne en §3 si pertinent.',
    `> Dernière récolte : ${harvest.generatedAt} · intensité **${harvest.intensity.level}** (score ${harvest.intensity.score}) · fenêtre \`${harvest.since}\``,
    '',
  ];
  if (!harvest.intense) {
    lines.push('_Aucune intensité vibe détectée sur la fenêtre — rien à proposer._');
    lines.push('');
    return lines.join('\n');
  }
  if (!harvest.candidates.length) {
    lines.push('_Intensité détectée mais aucune zone au-dessus du seuil._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Zone | Chaleur | Effort | Suggestion | Fichiers chauds |');
  lines.push('|------|---------|--------|------------|-----------------|');
  for (const c of harvest.candidates) {
    const files = c.files.map((f) => `\`${f}\``).join(', ');
    lines.push(
      `| ${c.zone} | ${c.heat} | ${c.effort} | ${c.title} | ${files} |`,
    );
  }
  lines.push('');
  lines.push(
    'Pour promouvoir : ajouter une ligne D# en §3 avec effort + pourquoi, après OK humain.',
  );
  lines.push('');
  return lines.join('\n');
}

function writeAgentsSection(sectionMd) {
  let md = fs.readFileSync(AGENTS_PATH, 'utf8');
  const startMark = '## 3c. Candidats auto (récolte vibe-code)';
  const nextH2 = /^## [0-9]/gm;
  if (md.includes(startMark)) {
    const start = md.indexOf(startMark);
    // find next ## after start
    const rest = md.slice(start + 3);
    const m = rest.match(/\n## /);
    const end = m ? start + 3 + m.index + 1 : md.length;
    md = md.slice(0, start).replace(/\n*$/, '\n') + sectionMd + md.slice(end).replace(/^\n*/, '');
  } else {
    // insert before ## 4. Dettes résolues
    const anchor = '## 4. Dettes résolues';
    if (md.includes(anchor)) {
      md = md.replace(anchor, `${sectionMd}${anchor}`);
    } else {
      md = `${md.trimEnd()}\n${sectionMd}`;
    }
  }
  fs.writeFileSync(AGENTS_PATH, md, 'utf8');
}

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const asJson = argv.includes('--json');
  let sinceArg = '36h';
  const si = argv.indexOf('--since');
  if (si >= 0 && argv[si + 1]) sinceArg = argv[si + 1];
  const sinceHuman = parseSince(sinceArg);

  const commitCount = Number(
    sh(`git rev-list --count --since="${sinceHuman}" HEAD`) || '0',
  );
  const fileCounts = collectFiles(sinceHuman);
  const { scores, filesByZone } = scoreZones(fileCounts);
  const intensityInfo = intensity(fileCounts, commitCount);
  const intense =
    intensityInfo.level === 'moderate' ||
    intensityInfo.level === 'intense' ||
    intensityInfo.level === 'heavy';
  const candidates = buildCandidates(scores, filesByZone, intensityInfo);

  const harvest = {
    generatedAt: new Date().toISOString(),
    since: sinceArg,
    sinceGit: sinceHuman,
    intense,
    intensity: intensityInfo,
    candidates,
    topFiles: [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([file, n]) => ({ file, n })),
  };

  fs.writeFileSync(HARVEST_PATH, `${JSON.stringify(harvest, null, 2)}\n`, 'utf8');

  if (write) {
    writeAgentsSection(renderAgentsSection(harvest));
    console.log(`Écrit §3c dans AGENTS.md + ${path.basename(HARVEST_PATH)}`);
  }

  if (asJson) {
    console.log(JSON.stringify(harvest, null, 2));
    return;
  }

  console.log('LE RADAR — harvest vibe-code (git)\n');
  console.log(
    `Fenêtre : ${sinceArg} (${sinceHuman}) · commits ${commitCount} · ` +
      `fichiers ${intensityInfo.files} · touches ${intensityInfo.touches}`,
  );
  console.log(
    `Intensité : **${intensityInfo.level}** (score ${intensityInfo.score})` +
      (intense ? ' → récolte active' : ' → sous le seuil « beaucoup de vibe »'),
  );
  console.log('');

  if (harvest.topFiles.length) {
    console.log('Fichiers les plus touchés :');
    for (const { file, n } of harvest.topFiles.slice(0, 10)) {
      console.log(`  ${String(n).padStart(3)}×  ${file}`);
    }
    console.log('');
  }

  if (!candidates.length) {
    console.log('Aucun candidat ledger (intensité faible ou zones froides).');
  } else {
    console.log('Candidats (pas des dettes tant que non promus) :');
    for (const c of candidates) {
      console.log(
        `  • [${c.heat}] ${c.zone} (${c.effort}) — ${c.title}` +
          (c.related ? ` · lié ${c.related}` : ''),
      );
      console.log(`      ${c.why}`);
      console.log(`      ex. ${c.files.slice(0, 3).join(', ')}`);
    }
  }

  console.log('');
  console.log(
    'Message agent → humain si intense :',
  );
  console.log('---');
  if (intense && candidates.length) {
    console.log(
      `Session vibe **${intensityInfo.level}** détectée (git ${sinceArg}). ` +
        `${candidates.length} zone(s) chaude(s) — candidats dans §3c / .agents-harvest.json. ` +
        `Veux-tu en **promouvoir une** en dette D# ouverte (max 1), ou ignorer ?`,
    );
  } else {
    console.log(
      'Pas de vibe intense détecté sur la fenêtre git — pas de nouveau candidat ledger.',
    );
  }
  console.log('---');
  if (!write) {
    console.log('\nPour écrire dans AGENTS.md : npm run agents:harvest -- --write');
  }
}

main();

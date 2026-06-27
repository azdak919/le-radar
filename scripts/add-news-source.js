#!/usr/bin/env node
/**
 * Ajoute une source au registre et lance la vérification d'intégration.
 *
 * Exemple (deux journaux distincts, même université — cas Concordia) :
 *   node scripts/add-news-source.js \\
 *     --name "The Concordian" \\
 *     --institution "Concordia University" \\
 *     --region "Montréal" \\
 *     --type universite \\
 *     --lang en \\
 *     --url "https://theconcordian.substack.com/feed" \\
 *     --site "https://theconcordian.com/" \\
 *     --popularity 7 \\
 *     --update
 *
 *   node scripts/add-news-source.js --help
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'news-sources.json');

function parseArgs(argv) {
  const out = { update: false, promote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--update') out.update = true;
    else if (a === '--promote') out.promote = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1];
  }
  return out;
}

function showHelp() {
  console.log(`Usage: node scripts/add-news-source.js [options] [--update]

Options requises pour une nouvelle source :
  --name          Nom affiché (ex. "The Concordian")
  --institution   Établissement (ex. "Concordia University")
  --region        Région administrative
  --type          universite | cegep
  --lang          fr | en
  --url           URL du flux RSS/Atom

Options recommandées :
  --site          Site web public (découverte sociale, candidats)
  --popularity    Ordre des filtres UI (1 = plus visible, défaut 50)
  --note          Note interne (ex. "journal indépendant, distinct de The Link")

  --promote       Retirer des candidates si présent, ajouter à active
  --update        Écrire news-sources.json puis lancer verify-news-sources.js
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const required = ['name', 'institution', 'region', 'type', 'lang', 'url'];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) {
    console.error(`Champs manquants : ${missing.join(', ')}`);
    showHelp();
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  registry.active = registry.active || [];
  registry.candidates = registry.candidates || [];

  const entry = {
    name: args.name,
    institution: args.institution,
    region: args.region,
    type: args.type,
    lang: args.lang,
    url: args.url,
    popularity: args.popularity ? Number(args.popularity) : 50,
    _status: 'ok',
    _failCount: 0,
    _lastChecked: new Date().toISOString(),
  };
  if (args.site) entry.site = args.site;
  if (args.note) entry._note = args.note;

  const inActive = registry.active.findIndex((s) => s.name === entry.name);
  const inCand = registry.candidates.findIndex((s) => s.name === entry.name);

  if (inActive >= 0) {
    registry.active[inActive] = { ...registry.active[inActive], ...entry };
    console.log(`Mise à jour de la source active : ${entry.name}`);
  } else {
    registry.active.push(entry);
    console.log(`Ajout à active : ${entry.name}`);
  }

  if (args.promote && inCand >= 0) {
    registry.candidates.splice(inCand, 1);
    console.log(`Retiré des candidates : ${entry.name}`);
  }

  const peers = registry.active.filter(
    (s) => s.institution === entry.institution && s.name !== entry.name,
  );
  if (peers.length) {
    console.log(`Note : ${entry.institution} a ${peers.length + 1} journal(aux) distinct(s) :`);
    [...peers, entry].forEach((p) => console.log(`  · ${p.name} → ${p.url}`));
  }

  if (args.update) {
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(registry, null, 2) + '\n');
    console.log(`\n✅ ${SOURCES_PATH}`);
    try {
      execSync(`node scripts/verify-news-sources.js --name ${JSON.stringify(entry.name)}`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch {
      process.exit(1);
    }
  } else {
    console.log('\nDry-run. Ajoutez --update pour écrire et vérifier.');
  }
}

main();
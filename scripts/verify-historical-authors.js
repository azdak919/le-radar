#!/usr/bin/env node
/**
 * Vérifie les signatures visibles des archives historiques, sans conserver le
 * corps des articles. Plafonné et séquentiel : une byline est une métadonnée,
 * jamais un prétexte pour aspirer une publication entière.
 *
 *   node scripts/verify-historical-authors.js --source="Le Trait d'Union" --update
 */
const fs = require('fs');
const path = require('path');
const { fetchText } = require('./article-image-lib');
const { authorFromArticleHtml, normalizeAuthor } = require('./author-lib');
const { loadSourceRegistryMap, getBotHints } = require('./source-retention-lib');

const ARCHIVE = path.join(__dirname, '..', 'news-archive.json');
const update = process.argv.includes('--update');
const force = process.argv.includes('--force');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(0, Math.min(100, Number(limitArg?.slice(8) || 20) || 20));
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourceFilter = String(sourceArg?.slice(9) || '').trim().toLocaleLowerCase('fr-CA');
const RECHECK_AFTER_MS = 90 * 86400000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function due(record) {
  if (force) return true;
  const checked = Date.parse(record?.authorCheckedAt || '');
  return !Number.isFinite(checked) || Date.now() - checked > RECHECK_AFTER_MS || !normalizeAuthor(record?.author);
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
  const sourceMap = loadSourceRegistryMap();
  const candidates = (catalog.records || [])
    .filter((record) => record?.originalUrl && due(record))
    .filter((record) => !sourceFilter || String(record.source || '').toLocaleLowerCase('fr-CA') === sourceFilter)
    .slice(0, limit);

  let found = 0;
  let unavailable = 0;
  for (const record of candidates) {
    const source = sourceMap.get(record.source);
    const hints = getBotHints(source, 'authors');
    const html = await fetchText(record.originalUrl, 3, 12_000);
    let author = '';
    try {
      author = html ? authorFromArticleHtml(html, record.language === 'en' ? 'en' : 'fr', hints, record.source) : '';
    } catch { /* un parseur ne doit pas interrompre la passe */ }
    if (author) {
      record.author = author;
      found += 1;
    } else if (!normalizeAuthor(record.author)) {
      // Le compte technique RSS ne doit pas devenir une fausse attribution.
      record.author = '';
      unavailable += 1;
    }
    record.authorCheckedAt = new Date().toISOString();
    await sleep(350);
  }

  catalog.updated = new Date().toISOString();
  console.log(`Auteurs historiques${sourceFilter ? ` (${sourceFilter})` : ''} : ${candidates.length} contrôlé(s); ${found} signature(s) trouvée(s), ${unavailable} sans signature fiable.`);
  if (update) fs.writeFileSync(ARCHIVE, JSON.stringify(catalog) + '\n');
  else console.log('Dry-run — utilisez --update pour enregistrer les résultats.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

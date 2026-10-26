#!/usr/bin/env node
/** Amorce le registre historique depuis le cache courant, sans inventer de date de découverte. */
const fs = require('fs');
const path = require('path');
const { mergeHistoricalCatalog, serializeHistoricalCatalog } = require('./historical-catalog-lib');

const ROOT = path.join(__dirname, '..');
const NEWS = path.join(ROOT, 'news.json');
const { readArchive, writeArchive } = require('./archive-store');
const CONFIG = path.join(ROOT, 'historical-catalog.config.json');
const update = process.argv.includes('--update');
const news = JSON.parse(fs.readFileSync(NEWS, 'utf8'));
const histConfig = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
let prior = { schemaVersion: 1, records: [] };
prior = readArchive(ROOT, prior);
const observedAt = news.updated || new Date().toISOString();
const result = mergeHistoricalCatalog(prior, news.items || [], observedAt, { importedAt: observedAt }, { maxRecords: histConfig.storage?.maxRecords });
console.log(`Catalogue historique : +${result.added}, ${result.updated} réobservé(s), ${result.catalog.records.length} total.`);
if (update) writeArchive(serializeHistoricalCatalog(result.catalog, histConfig).catalog);
else console.log('Dry-run — utilisez --update pour écrire data/archives/.');

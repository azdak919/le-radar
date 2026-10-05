#!/usr/bin/env node
/**
 * Assemble le dossier servi par Capacitor (mobile/www).
 * Copie l’interface et les JSON publics du fil. Le catalogue historique
 * et les banques photo restent hors de l’application.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const www = join(root, 'mobile/www');

rmSync(www, { recursive: true, force: true });
cpSync(join(root, 'mobile/app'), www, { recursive: true });
mkdirSync(join(www, 'data'), { recursive: true });
mkdirSync(join(www, 'vendor'), { recursive: true });

for (const file of ['news.json', 'news-sources.json', 'radios.json', 'brand-colors.json']) {
  cpSync(join(root, file), join(www, 'data', file));
}

cpSync(join(root, 'scripts/media-follow-store.js'), join(www, 'vendor/media-follow-store.js'));
console.log('mobile/www prêt');

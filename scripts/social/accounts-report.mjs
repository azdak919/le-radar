#!/usr/bin/env node
// Rapport hebdo : sources/auteurs du flux sans compte X connu. N'ajoute JAMAIS de compte (vérification humaine).
import fs from 'node:fs';
import { parseFeed, unknownAccounts } from './lib.mjs';
const accounts = JSON.parse(fs.readFileSync('data/social/x-accounts.json', 'utf8')).accounts;
const xml = await (await fetch(process.env.FEED_URL || 'https://le-radar.ca/feed.xml', { signal: AbortSignal.timeout(30000) })).text();
const u = unknownAccounts(parseFeed(xml), accounts);
const md = [`# Comptes X à vérifier (bot social)`, '', `Mis à jour : ${new Date().toISOString().slice(0, 10)}. Ajouter un compte dans \`data/social/x-accounts.json\` seulement après vérification (bio ou lien officiel). \`cle_flux\` = nom exact dans feed.xml.`, '',
  `## Sources sans compte (${u.sources.length})`, ...u.sources.map(s => `- ${s}`), '', `## Auteurs sans compte (${u.authors.length})`, ...u.authors.map(a => `- ${a.author} (${a.source})`), ''].join('\n');
fs.writeFileSync(process.argv[2] || 'social-accounts-report.md', md);
console.log(md);

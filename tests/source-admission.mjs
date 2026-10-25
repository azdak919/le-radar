// Admission automatique des médias étudiants : critères stricts, sans réseau.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const A = require('../scripts/source-admission-lib.js');

const now = Date.parse('2026-10-25T17:00:00Z');
const day = 86400000;
const institutions = [
  { name: "Cégep de l'Outaouais", type: 'cegep', region: 'Outaouais', website: 'https://www.cegepoutaouais.qc.ca/' },
  { name: 'McGill University', type: 'universite', region: 'Montréal', website: 'https://www.mcgill.ca/' },
  { name: 'Université du Québec à Montréal (UQAM)', type: 'universite', region: 'Montréal', website: 'https://uqam.ca/' },
];
const registry = {
  active: [{ name: 'The McGill Daily', institution: 'McGill University', url: 'https://www.mcgilldaily.com/feed/', site: 'https://www.mcgilldaily.com/' }],
  candidates: [{ name: 'Le Brise-Glace', site: 'https://lebrise-glace.com/', _status: 'retired' }],
};
const blocklist = A.loadBlocklist({ entries: [{ name: 'Hors Sujet', site: 'https://horssujet.ca/', reason: 'hors sujet' }] });
const ctx = { registry, institutions, blocklist, now, hasCampusPhoto: (n) => n !== 'McGill University' };
const good = { name: 'La Griffe', institution: "Cégep de l'Outaouais", site: 'https://journallagriffe.ca/', lang: 'fr', vetted: true };
const probe = { feedUrl: 'https://journallagriffe.ca/feed/', isFeed: true, items: 10, lastItemMs: now - 6 * day, pageText: '' };

// Admis
let v = A.evaluateAdmission(good, probe, ctx);
assert.equal(v.admit, true, v.reason);
// Signal « journal étudiant » exigé pour une graine non vérifiée
assert.equal(A.evaluateAdmission({ ...good, vetted: false }, probe, ctx).admit, false);
assert.equal(A.evaluateAdmission({ ...good, vetted: false }, { ...probe, pageText: '<title>La Griffe - Le journal des étudiants du Cégep</title>' }, ctx).admit, true);

// Refus
const why = (c, p = probe) => A.evaluateAdmission(c, p, ctx).reason;
assert.match(why({ ...good, name: 'Média — UQAM' }), /générique/);
assert.match(why({ ...good, name: 'Actualités' }), /générique/);
assert.match(why({ ...good, name: 'Cégep de l\'Outaouais' }), /établissement/);
assert.match(why({ ...good, name: 'Association étudiante du cégep' }), /association/);
assert.match(why({ ...good, name: 'Services aux étudiants' }), /association/);
assert.match(why({ ...good, name: 'Hors Sujet', site: 'https://horssujet.ca/' }), /blocage/);
assert.match(why({ ...good, name: 'Autre nom', site: 'https://www.horssujet.ca/x' }), /blocage/, 'blocage par hôte');
assert.match(why({ ...good, name: 'The McGill Daily', site: 'https://autre.ca/' }), /doublon/);
assert.match(why({ ...good, name: 'Nouveau', site: 'https://mcgilldaily.com/' }), /doublon/, 'doublon par hôte (www ignoré)');
assert.match(why({ ...good, name: 'Le Brise-Glace', site: 'https://lebrise-glace.com/' }), /retirée/);
assert.match(why({ ...good, institution: 'Lycée de Lyon' }), /hors catalogue/);
assert.match(why({ ...good, site: 'https://www.cegepoutaouais.qc.ca/journal' }), /portail institutionnel/);
assert.match(why({ ...good, site: 'https://nouvelles.uquebec.ca/' }), /portail institutionnel/);
assert.match(why(good, { ...probe, isFeed: false, feedUrl: null }), /aucun flux/);
assert.match(why(good, { feedUrl: null, isFeed: false, challenge: true }), /anti-robot/);
assert.match(why(good, { ...probe, items: 2 }), /mince/);
assert.match(why(good, { ...probe, lastItemMs: Date.parse('2025-12-11T00:00:00Z') }), /inactif \(dernier article 2025-12-11\)/);
assert.match(why({ ...good, name: 'The Bull', institution: 'Université McGill', site: 'https://bull.ca/' }), /photo de campus/);

// Activité : ≤ 45 jours, ou publié pendant la session en cours
assert.equal(A.isActive(now - 45 * day, now), true);
assert.equal(A.isActive(Date.parse('2026-08-20T00:00:00Z'), now), true, 'session d\'automne en cours');
assert.equal(A.isActive(Date.parse('2026-08-01T00:00:00Z'), now), false, 'avant la session');
const july = Date.parse('2026-07-20T12:00:00Z');
assert.equal(A.currentSessionStart(july), null);
assert.equal(A.isActive(Date.parse('2026-05-01T00:00:00Z'), july), false, 'été : seulement 45 jours');
assert.equal(A.isActive(now + 3 * day, now), false, 'date future refusée');

// Configuration complète
const cfg = A.buildSourceConfig(good, probe, v.institution, now);
assert.equal(cfg.name, 'La Griffe');
assert.equal(cfg.institution, "Cégep de l'Outaouais");
assert.equal(cfg.type, 'cegep');
assert.equal(cfg.lang, 'fr');
assert.equal(cfg.url, probe.feedUrl);
assert.equal(cfg._status, 'ok');
assert.ok(cfg._autoAdded && cfg._note.includes('banque campus'));
assert.ok(cfg.botHints.images.rejectPathPatterns.includes('logo'));
assert.match(A.autoColor('X'), /^#[0-9A-F]{6}$/);

// Déduplication des graines
assert.equal(A.dedupeCandidates([good, { ...good, name: 'LA GRIFFE ' }, { ...good, name: 'Autre', site: 'https://www.journallagriffe.ca/' }]).length, 1);

// Journal pour l'issue
const md = A.renderDiscoveryLog({ added: [cfg], rejected: [{ name: 'Typographe', reason: 'inactif' }], now, activeCount: 21 });
assert.match(md, /Ajoutés lors de cette passe/);
assert.match(md, /La Griffe/);
assert.match(md, /source-blocklist\.json/);
assert.doesNotMatch(md, /approbation|approuver/i);

// Fichiers de données valides et cohérents
const seeds = JSON.parse(readFileSync(new URL('../data/student-media-seeds.json', import.meta.url))).seeds;
assert.ok(seeds.length > 10);
assert.equal(A.dedupeCandidates(seeds).length, seeds.length, 'graines sans doublon');
const bl = JSON.parse(readFileSync(new URL('../data/source-blocklist.json', import.meta.url)));
assert.ok(Array.isArray(bl.entries));
const live = JSON.parse(readFileSync(new URL('../news-sources.json', import.meta.url)));
for (const s of live.active) assert.equal(A.isBlocked(s, A.loadBlocklist(bl)), null, `${s.name} est bloqué mais actif`);

// Le workflow publie UNE issue permanente et ne demande pas d'approbation
const yml = readFileSync(new URL('../.github/workflows/discover-news-sources.yml', import.meta.url), 'utf8');
assert.match(yml, /issues: write/);
assert.match(yml, /Découverte des médias étudiants \(bot\)/);
assert.match(yml, /gh issue edit/);
assert.match(yml, /data\/news-discovery\.md/);
assert.match(yml, /brand-colors\.json/);
console.log('source-admission : ok');

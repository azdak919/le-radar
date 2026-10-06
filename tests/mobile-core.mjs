#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import core from '../mobile/app/js/core.js';
import follow from '../scripts/media-follow-store.js';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const link = 'https://quartierlibre.ca/2026/09/01/titre-essai/?utm_source=rss&utm_medium=rss';
const clean = 'https://quartierlibre.ca/2026/09/01/titre-essai';
assert.equal(core.canonicalArticleUrl(link), clean);
assert.equal(core.articleId(link), core.articleId(`${clean}/`));
assert.equal(core.articleId('javascript:alert(1)'), '');
assert.match(core.articleId(clean), /^[0-9a-f]{16}$/);

const meta = core.articleMeta({
  title: '  Un titre  ',
  link,
  source: 'Quartier Libre',
  excerpt: 'court',
  content: 'CORPS INTÉGRAL QUI NE DOIT PAS SORTIR',
  body: 'non plus',
  image: 'http://insecure.example/a.jpg',
  author: 'Ada',
  institution: 'Université de Montréal',
  region: 'Montréal',
  date: '2026-09-01T12:00:00.000Z',
});
assert.equal(meta.link, clean);
assert.equal(meta.title, 'Un titre');
assert.equal(meta.excerpt, 'court');
assert.equal(meta.image, '');
assert.equal(meta.content, undefined);
assert.equal(meta.body, undefined);
assert.equal(core.articleMeta({ title: 'x', link: 'http://exemple.test/a' }), null);

const long = 'mot '.repeat(120);
assert.ok(core.articleMeta({ title: 'T', link: clean, excerpt: long }).excerpt.length <= core.LIMITS.excerpt + 1);

assert.equal(core.slugify("L'Exemplaire"), 'lexemplaire');
assert.equal(core.slugify('Le Délit'), 'le-delit');
assert.equal(core.slugify('La Pige'), follow.slugify('La Pige'));
assert.equal(core.slugify('Université de Montréal'), follow.slugify('Université de Montréal'));
assert.ok(existsSync(join(root, 'journaux', core.slugify('La Pige'), 'index.html')));

const items = [
  { title: 'A', source: 'La Pige', region: 'Saguenay–Lac-Saint-Jean', link: 'https://exemple.test/a', excerpt: 'élections municipales' },
  { title: 'B', source: 'Quartier Libre', region: 'Montréal', link: 'https://exemple.test/b', excerpt: 'logement étudiant' },
  { title: 'C', source: 'Le Délit', region: 'Montréal', link: 'https://exemple.test/c', excerpt: 'autre' },
];
const follows = ['la-pige'];
const hidden = ['le-delit'];
assert.deepEqual(core.filterFeed(items, { mode: 'follows', follows, hidden }).map((item) => item.title), ['A']);
assert.equal(core.filterFeed(items, { mode: 'all', hidden }).length, 2);
assert.equal(core.filterFeed(items, { mode: 'regions', regions: ['Montréal'], hidden }).length, 1);
assert.equal(core.filterFeed(items, { mode: 'keywords', keywords: ['election'] }).length, 1);
assert.equal(core.filterFeed(items, { mode: 'keywords', keywords: ['z'] }).length, 0);
assert.equal(core.searchFeed(items, 'logement', hidden).length, 1);
assert.equal(core.searchFeed(items, 'a', []).length, 0);

const id = core.articleId('https://exemple.test/b');
assert.equal(core.findById(items, id).title, 'B');
assert.equal(core.findById(items, 'zzzz'), null);

let library = core.emptyLibrary();
library = core.addFavorite(library, items[1], 10);
library = core.addFavorite(library, { ...items[1], content: 'secret' }, 11);
assert.equal(library.favorites.length, 1);
assert.equal(library.favorites[0].savedAt, 11);
assert.equal(library.favorites[0].content, undefined);
assert.equal(core.isFavorite(library, id), true);
library = core.recordView(library, items[0], 12);
library = core.recordView(library, items[0], 13);
assert.equal(library.history.length, 1);
assert.equal(library.history[0].viewedAt, 13);
for (let n = 0; n < 210; n += 1) {
  library = core.addFavorite(library, {
    title: `N${n}`,
    link: `https://exemple.test/n/${n}`,
    source: 'La Pige',
  }, n);
}
assert.equal(library.favorites.length, core.LIMITS.favorites);
library = core.clearFavorites(library);
assert.equal(library.favorites.length, 0);
assert.equal(core.clearLibrary().history.length, 0);

let prefs = core.emptyPrefs();
assert.equal(prefs.notifications.enabled, false);
assert.equal(core.systemNotificationsActive(prefs), false);
prefs = core.updateNotifications(prefs, { enabled: true, follows: true });
assert.equal(prefs.notifications.enabled, true);
assert.equal(core.systemNotificationsActive(prefs), false);
prefs = core.addKeyword(prefs, 'élection');
prefs = core.addKeyword(prefs, 'Election');
prefs = core.addKeyword(prefs, 'a');
assert.deepEqual(prefs.keywords, ['élection']);
prefs = core.removeKeyword(prefs, 'election');
assert.equal(prefs.keywords.length, 0);
prefs = core.setHidden(prefs, 'Le Délit', true);
assert.equal(core.isHidden(prefs, 'le-delit'), true);
prefs = core.setHidden(prefs, 'Le Délit', false);
assert.equal(core.isHidden(prefs, 'le-delit'), false);
prefs = core.setRegionFollow(prefs, 'Montréal', true);
assert.ok(prefs.regions.includes('montreal'));
prefs = core.setTheme(prefs, 'bleu');
assert.equal(prefs.theme, 'system');
prefs = core.markSeen(prefs, '2026-09-01T00:00:00.000Z');
assert.equal(core.countFreshFollows(items, ['Quartier Libre'], prefs.seenAt), 0);
assert.equal(core.countFreshFollows(
  [{ source: 'Quartier Libre', date: '2026-09-02T00:00:00.000Z' }],
  ['Quartier Libre'],
  prefs.seenAt,
), 1);
assert.equal(core.countFreshFollows(items, [], prefs.seenAt), 0);

const picked = core.pickFeed({
  online: false,
  networkItems: items,
  snapshotItems: [items[0]],
  bundledItems: [items[2]],
});
assert.equal(picked.origin, 'snapshot');
assert.equal(core.pickFeed({ online: true, networkItems: items, snapshotItems: [items[0]] }).origin, 'network');
assert.equal(core.pickFeed({ online: true, networkItems: [], snapshotItems: [items[0]] }).origin, 'snapshot');
const snap = core.buildSnapshot({ updated: '2026-09-01', items: [{ ...items[0], body: 'plein' }] });
assert.equal(snap.items[0].body, undefined);
assert.equal(snap.updated, '2026-09-01');

const route = core.parseDeepLink('https://www.le-radar.ca/journaux/la-pige/');
assert.deepEqual(route, { kind: 'journal', slug: 'la-pige' });
assert.equal(core.parseDeepLink('https://le-radar.ca/radios/chyz').kind, 'radio');
assert.equal(core.parseDeepLink('https://le-radar.ca/etablissements/universite-laval/').slug, 'universite-laval');
assert.equal(core.parseDeepLink('https://le-radar.ca/en/journaux/le-delit/').slug, 'le-delit');
assert.equal(core.parseDeepLink(`https://le-radar.ca/article/?id=${id}`).id, id);
assert.equal(core.parseDeepLink(`https://le-radar.ca/article/index.html?id=${id}`).kind, 'article');
assert.equal(core.parseDeepLink('https://le-radar.ca/pomo/').kind, 'home');
assert.equal(core.parseDeepLink('https://quartierlibre.ca/texte').kind, 'external');
assert.equal(core.parseDeepLink('http://127.0.0.1:4173/mobile/app/#/recherche?q=logement').kind, 'search');
assert.equal(core.parseDeepLink('http://127.0.0.1:4173/mobile/app/#/explorer/source/la-pige').slug, 'la-pige');
assert.equal(core.hashForRoute({ kind: 'journal', slug: 'la-pige' }), '#/explorer/source/la-pige');

const original = core.shareOriginal(items[1]);
assert.equal(original.url, core.canonicalArticleUrl(items[1].link));
assert.equal(original.url.includes('le-radar.ca'), false);
const discovery = core.shareDiscovery(items[1]);
assert.equal(discovery.url, `https://le-radar.ca/article/?id=${id}`);
const action = core.publisherAction(items[1]);
assert.equal(action.label, 'Lire chez Quartier Libre');
assert.equal(action.url, original.url);

const catalog = core.sourceCatalog(
  { active: [{ name: 'La Pige', institution: 'Cégep de Jonquière', region: 'Saguenay–Lac-Saint-Jean', site: 'https://lapige.atmjonquiere.com/' }] },
  [{ source: 'Inconnue', institution: 'X', region: 'Y' }],
);
assert.equal(catalog.find((source) => source.id === 'la-pige').site.startsWith('https://'), true);
assert.ok(catalog.some((source) => source.id === 'inconnue'));
const radios = core.radioCatalog([
  { id: 'chyz', name: 'CHYZ', stream: 'https://example.test/stream', website: 'http://chyz.ca', slogan: 'allo' },
]);
assert.equal(radios[0].stream, 'https://example.test/stream');
assert.equal(radios[0].website, '');
const nowPayload = {
  updatedAt: '2026-10-05T18:43:51.460Z',
  stations: {
    chyz: { current: { title: 'Little Songs On The Prairie' }, track: '', checkedAt: '2026-10-05T18:43:22.786Z' },
    cism: { showTitle: 'Le palmarès', track: 'Artiste – Titre', checkedAt: '2026-10-05T18:43:25.017Z' },
    ckut: { current: { title: 'Même' }, track: 'même', checkedAt: '2026-10-05T18:43:25.017Z' },
  },
};
const nowMs = Date.parse('2026-10-05T19:00:00Z');
assert.equal(core.nowPlayingLabel(nowPayload, 'chyz', nowMs), 'Little Songs On The Prairie');
assert.equal(core.nowPlayingLabel(nowPayload, 'cism', nowMs), 'Le palmarès · Artiste – Titre');
assert.equal(core.nowPlayingLabel(nowPayload, 'ckut', nowMs), 'Même');
assert.equal(core.nowPlayingLabel(nowPayload, 'absente', nowMs), '');
assert.equal(core.nowPlayingLabel(nowPayload, 'chyz', Date.parse('2026-10-06T03:00:00Z')), '', 'grille périmée ignorée');
assert.equal(core.nowPlayingLabel(null, 'chyz', nowMs), '');
assert.equal(core.institutionColor({ institutions: { UQAM: { color: '#0079BE' } } }, 'UQAM'), '#0079BE');
assert.equal(core.institutionColor({ institutions: { X: { color: 'red' } } }, 'X'), '');
assert.equal(core.homeMode('', ['la-pige']), 'suivis');
assert.equal(core.homeMode('', []), 'tout');
assert.equal(core.homeMode('tout', ['la-pige']), 'tout');

const shell = read('mobile/app/index.html');
const appJs = read('mobile/app/js/app.js');
const prepare = read('mobile/scripts/prepare.mjs');
const article = read('article/index.html');
// Barre radio persistante : l’unique <audio> vit dans la coquille, hors de
// #screen (re-rendu par innerHTML à chaque route), sinon l’écoute meurt.
assert.ok(shell.indexOf('id="player-audio"') > shell.indexOf('</main>'), 'audio radio hors de #screen');
assert.equal((shell.match(/<audio\b/g) || []).length, 1, 'un seul <audio> dans la coquille');
assert.equal(/<audio\s/.test(appJs), false, 'aucun <audio> rendu dans un écran');
assert.match(shell, /Journaux, radios et sports étudiants du Québec,/);
assert.match(shell, /réunis au même endroit/);
assert.doesNotMatch(shell, /Médias étudiants du Québec/);
assert.match(shell, /LE-RADAR\.ca/);
assert.match(shell, /id="translate-toggle"/);
assert.match(shell, /js\/translate\.js/);
assert.match(prepare, /translate\.js/);
assert.match(prepare, /indigenous-mt\.json/);
const translate = read('translate.js');
assert.match(translate, /Québec student newspapers, campus radio and sports,/);
assert.match(translate, /all in one place/);
assert.equal(shell.includes('umami'), false);
assert.equal(shell.includes('news-archive'), false);
assert.equal(shell.includes('radar-news.js'), false);
assert.equal(appJs.includes('news-archive'), false);
assert.equal(prepare.includes('news-archive'), false);
assert.match(article, /noindex/i);
assert.equal(article.includes('class="site-foot"'), false);
assert.match(article, /mobile\/app\/js\/core\.js/);
assert.equal(core.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, core.APP_VERSION);
const gradle = read('android/variables.gradle');
assert.match(gradle, /targetSdkVersion = 36/);
assert.match(gradle, /compileSdkVersion = 36/);
assert.match(gradle, /minSdkVersion = 24/);
const manifest = read('android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /android\.permission\.INTERNET/);
assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE/);
assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
assert.match(manifest, /android\.permission\.WAKE_LOCK/);
assert.match(manifest, /RadioPlaybackService/);
assert.match(manifest, /foregroundServiceType="mediaPlayback"/);
assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|CAMERA|RECORD_AUDIO|AD_ID/);
assert.doesNotMatch(read('android/build.gradle'), /google-services|com\.google\.gms/);
assert.doesNotMatch(read('android/app/build.gradle'), /google-services|com\.google\.gms/);
assert.match(read('android/app/build.gradle'), /media3-exoplayer/);
assert.match(read('android/app/build.gradle'), /media3-session/);
assert.match(read('android/variables.gradle'), /media3Version/);
assert.equal(existsSync(join(root, 'android/app/src/main/java/ca/leradar/app/radio/RadioPlaybackPlugin.java')), true);
assert.equal(existsSync(join(root, 'android/app/src/main/java/ca/leradar/app/radio/RadioPlaybackService.java')), true);
assert.match(appJs, /RadioPlayback/);
assert.match(appJs, /useNativeRadio/);
// F-Droid : signature optionnelle. Sans keystore.properties, assembleRelease sort un APK non signé.
const appGradle = read('android/app/build.gradle');
assert.match(appGradle, /versionCode 3/);
assert.match(appGradle, /versionName "1\.1\.0"/);
assert.match(appGradle, /if \(keystorePropertiesFile\.exists\(\)\) \{\s*signingConfigs \{/);
assert.match(appGradle, /if \(keystorePropertiesFile\.exists\(\)\) \{\s*signingConfig signingConfigs\.release/);
assert.equal(existsSync(join(root, 'fastlane/metadata/android/en-US/short_description.txt')), true);
assert.equal(existsSync(join(root, `fastlane/metadata/android/en-US/changelogs/${appGradle.match(/versionCode (\d+)/)[1]}.txt`)), true);
assert.match(manifest, /usesCleartextTraffic="false"/);
assert.match(manifest, /pathPrefix="\/article"/);
const plist = read('ios/App/App/Info.plist');
assert.match(plist, /<string>LE-RADAR<\/string>/);
assert.match(plist, /ITSAppUsesNonExemptEncryption/);
assert.match(plist, /UIBackgroundModes/);
assert.match(plist, /<string>audio<\/string>/);
assert.doesNotMatch(plist, /NSUserTrackingUsageDescription|NSCameraUsageDescription|NSLocationWhenInUseUsageDescription/);
assert.match(read('ios/App/App/AppDelegate.swift'), /AVAudioSession/);
const privacy = read('ios/App/App/PrivacyInfo.xcprivacy');
assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);

console.log('OK mobile-core');

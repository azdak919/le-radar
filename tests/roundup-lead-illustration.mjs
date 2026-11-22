/**
 * Chroniques récapitulatives (Quartier Libre, « Cinq nouvelles de la semaine ») :
 * l'illustration d'origine se garde, même réutilisée chaque semaine et même
 * si elle contient du texte ou le logo du journal. Approuvé le 21 nov. 2026.
 * La règle générale contre les visuels génériques ne doit pas être relâchée.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  dropSharedSourceImages,
  keepNewestSharedImage,
  isRecurringRoundupLead,
} = require('../scripts/article-image-lib.js');
const rubric = require('../scripts/rubric-banner-lib.js');

const ILLUSTRATION = 'https://quartierlibre.ca/wp-content/uploads/2026/01/5Infos_QL-e1769792962990.png';
const ILLUSTRATION_SIZED = 'https://quartierlibre.ca/wp-content/uploads/2026/01/5Infos_QL-e1769792962990-1024x703.png';

function roundup(n, date, image = ILLUSTRATION) {
  return {
    source: 'Quartier Libre',
    title: 'Cinq nouvelles de la semaine',
    link: `https://quartierlibre.ca/cinq-nouvelles-de-la-semaine-${n}/`,
    date,
    image,
  };
}

assert.equal(isRecurringRoundupLead(roundup(17, '2026-11-21T22:00:10.000Z')), true, 'titre habituel');
assert.equal(
  isRecurringRoundupLead({ source: 'Quartier Libre', title: '5 infos de la semaine' }),
  true,
  'titre « 5 infos »',
);
assert.equal(
  isRecurringRoundupLead({ source: 'Quartier Libre', title: 'Cinq nouvelles marquantes de l’été' }),
  true,
  'hors-série d’été',
);
assert.equal(
  isRecurringRoundupLead({ source: 'Quartier Libre', title: 'Les jeunes voteront-ils ?' }),
  false,
  'autre article QL',
);
assert.equal(
  isRecurringRoundupLead({ source: 'Le Collectif', title: 'Cinq nouvelles de la semaine' }),
  false,
  'même titre, autre source',
);

const weeks = [
  roundup(17, '2026-11-21T22:00:10.000Z'),
  roundup(16, '2026-11-14T20:00:00.000Z', ILLUSTRATION_SIZED),
  roundup(15, '2026-11-07T23:00:00.000Z'),
];
assert.equal(dropSharedSourceImages(weeks, 2), 0, 'la série hebdomadaire garde son illustration (min. 2)');
assert.ok(weeks.every((it) => it.image), 'aucune une de la série vidée par dropShared');
assert.equal(keepNewestSharedImage(weeks), 0, 'keepNewest ne retire pas les semaines précédentes');
assert.ok(weeks.every((it) => it.image), 'les trois semaines gardent l’illustration');

const logo = 'https://quartierlibre.ca/wp-content/uploads/2026/11/logo-entete.png';
const other = [
  { source: 'Quartier Libre', title: 'Conseil universitaire', link: 'https://quartierlibre.ca/a/', date: '2026-11-21T12:00:00.000Z', image: logo },
  { source: 'Quartier Libre', title: 'Grève étudiante', link: 'https://quartierlibre.ca/b/', date: '2026-11-20T12:00:00.000Z', image: logo },
];
assert.equal(dropSharedSourceImages(other, 2), 2, 'un logo vraiment partagé est toujours retiré');
assert.ok(other.every((it) => !it.image), 'les deux articles non récapitulatifs perdent le logo');

const mixed = [
  roundup(17, '2026-11-21T22:00:10.000Z'),
  { source: 'Quartier Libre', title: 'Autre sujet', link: 'https://quartierlibre.ca/c/', date: '2026-11-20T12:00:00.000Z', image: ILLUSTRATION },
];
assert.equal(dropSharedSourceImages(mixed, 2), 1, 'seul l’article hors série perd l’image partagée');
assert.equal(mixed[0].image, ILLUSTRATION, 'la chronique garde l’illustration');
assert.equal(mixed[1].image, '', 'l’autre article est retiré');

const store = { generic: [], cache: { [ILLUSTRATION]: 'aaaaaaaaaaaaaaaa', [ILLUSTRATION_SIZED]: 'aaaaaaaaaaaaaaaa' } };
const hits = await rubric.findRubricBanners(
  [roundup(17, '2026-11-21T22:00:10.000Z'), roundup(16, '2026-11-14T20:00:00.000Z', ILLUSTRATION_SIZED)],
  { store, fingerprint: async () => 'aaaaaaaaaaaaaaaa' },
);
assert.equal(hits.size, 0, 'purge des bannières de rubrique : série hebdomadaire intacte');
assert.equal(store.generic.length, 0, 'l’illustration n’est pas apprise comme bannière générique');

const banner = { source: 'The McGill Daily', title: 'Editorial', image: 'https://d/editorial_banner.png' };
const photo = { source: 'The McGill Daily', title: 'Campus news', image: 'https://d/students-1000x667.jpg' };
const editorialHits = await rubric.findRubricBanners(
  [banner, photo],
  { store: { generic: [], cache: {} }, fingerprint: async () => '' },
);
assert.equal(editorialHits.has(banner), true, 'un fichier « editorial » / « banner » reste une bannière');
assert.equal(editorialHits.has(photo), false, 'une photo ordinaire n’est pas une bannière');

console.log('roundup-lead-illustration: ok');

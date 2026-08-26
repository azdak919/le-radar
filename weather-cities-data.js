// LE-RADAR — catalogue météo campus / collectivités (mât + Pomo).
// var : partagé entre scripts classiques. Le Pomo parse ce fichier par regex.
var WEATHER_CITIES = [
  { id: 'montreal', name: 'Montréal', compactName: 'MTL', lat: 45.5017, lon: -73.5673 },
  { id: 'quebec', name: 'Québec', compactName: 'QC', lat: 46.8139, lon: -71.2080 },
  { id: 'sherbrooke', name: 'Sherbrooke', lat: 45.4000, lon: -71.9000 },
  { id: 'trois-rivieres', name: 'Trois-Rivières', lat: 46.3432, lon: -72.5430 },
  { id: 'saguenay', name: 'Saguenay', lat: 48.4284, lon: -71.0680 },
  // Saguenay–Lac-Saint-Jean : la météo de Chicoutimi ne résume pas le Lac.
  { id: 'alma', name: 'Alma', region: 'Saguenay–Lac-Saint-Jean', lat: 48.5500, lon: -71.6500 },
  { id: 'roberval', name: 'Roberval', region: 'Saguenay–Lac-Saint-Jean', lat: 48.5200, lon: -72.2300 },
  { id: 'dolbeau-mistassini', name: 'Dolbeau-Mistassini', region: 'Saguenay–Lac-Saint-Jean', lat: 48.8800, lon: -72.2300 },
  { id: 'saint-felicien', name: 'Saint-Félicien', region: 'Saguenay–Lac-Saint-Jean', lat: 48.6500, lon: -72.4500 },
  { id: 'rimouski', name: 'Rimouski', lat: 48.4488, lon: -68.5230 },
  { id: 'riviere-du-loup', name: 'Rivière-du-Loup', region: 'Bas-Saint-Laurent', lat: 47.8300, lon: -69.5300 },
  { id: 'matane', name: 'Matane', region: 'Bas-Saint-Laurent', lat: 48.8500, lon: -67.5300 },
  { id: 'baie-comeau', name: 'Baie-Comeau', region: 'Côte-Nord', lat: 49.2200, lon: -68.1500 },
  { id: 'sept-iles', name: 'Sept-Îles', region: 'Côte-Nord', lat: 50.2000, lon: -66.3800 },
  { id: 'fermont', name: 'Fermont', region: 'Côte-Nord', lat: 52.7900, lon: -67.0800 },
  { id: 'gaspe', name: 'Gaspé', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 48.8300, lon: -64.4800 },
  { id: 'carleton-sur-mer', name: 'Carleton-sur-Mer', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 48.1000, lon: -66.1300 },
  { id: 'sainte-anne-des-monts', name: 'Sainte-Anne-des-Monts', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 49.1200, lon: -66.4900 },
  { id: 'cap-aux-meules', name: 'Cap-aux-Meules', region: 'Gaspésie–Îles-de-la-Madeleine', lat: 47.3800, lon: -61.8600 },
  { id: 'shawinigan', name: 'Shawinigan', region: 'Mauricie', lat: 46.5400, lon: -72.7500 },
  { id: 'la-tuque', name: 'La Tuque', region: 'Mauricie', lat: 47.4400, lon: -72.7800 },
  { id: 'drummondville', name: 'Drummondville', region: 'Centre-du-Québec', lat: 45.8800, lon: -72.4800 },
  { id: 'victoriaville', name: 'Victoriaville', region: 'Centre-du-Québec', lat: 46.0500, lon: -71.9600 },
  { id: 'saint-georges', name: 'Saint-Georges', region: 'Chaudière-Appalaches', lat: 46.1200, lon: -70.6700 },
  { id: 'thetford-mines', name: 'Thetford Mines', region: 'Chaudière-Appalaches', lat: 46.0900, lon: -71.3000 },
  { id: 'maniwaki', name: 'Maniwaki', region: 'Outaouais', lat: 46.3800, lon: -75.9700 },
  { id: 'chibougamau', name: 'Chibougamau', region: 'Nord-du-Québec', lat: 49.9200, lon: -74.3700 },
  { id: 'gatineau', name: 'Gatineau', lat: 45.4765, lon: -75.7013 },
  { id: 'rouyn-noranda', name: 'Rouyn-Noranda', lat: 48.2366, lon: -79.0231 },
  // Abitibi–Témiscamingue : plusieurs pôles distincts plutôt qu'une seule ville.
  // Slug MM = val-dor (pas val-d-or) — apostrophe typographique sinon mauvaise URL.
  { id: 'val-dor', name: 'Val-d’Or', region: 'Abitibi–Témiscamingue', lat: 48.1000, lon: -77.7800, weatherSlug: 'val-dor' },
  { id: 'amos', name: 'Amos', region: 'Abitibi–Témiscamingue', lat: 48.5700, lon: -78.1200 },
  { id: 'la-sarre', name: 'La Sarre', region: 'Abitibi–Témiscamingue', lat: 48.8000, lon: -79.2000 },
  { id: 'ville-marie', name: 'Ville-Marie', region: 'Abitibi–Témiscamingue', lat: 47.3300, lon: -79.4300 },
  { id: 'levis', name: 'Lévis', lat: 46.8033, lon: -71.1779 },
  // Ville centre (pas le MRC Vaudreuil–Soulanges) — slug MM = vaudreuil-dorion.
  { id: 'vaudreuil-dorion', name: 'Vaudreuil-Dorion', compactName: 'V-Dorion', region: 'Vaudreuil–Soulanges', lat: 45.4000, lon: -74.0300, weatherSlug: 'vaudreuil-dorion' },
  { id: 'saint-ignace-de-loyola', name: 'Saint-Ignace-de-Loyola', region: 'Lanaudière', lat: 46.0800, lon: -73.0200 },
  // Collectivités (1 / nation) — noms d’usage préférés ; URL MM QC vérifiées.
  // « manawan » sur MétéoMédia → réserve en Saskatchewan : lien = manouane.
  { id: 'odanak', name: 'Odanak', nation: 'W8banaki · Abénakis', lat: 46.0723, lon: -72.8181, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/odanak-12/actuelle' },
  { id: 'kitigan-zibi', name: 'Kitigan Zibi', nation: 'Anishinabeg', lat: 46.3825, lon: -75.9879, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kitigan-zibi/actuelle' },
  { id: 'manawan', name: 'Manawan', nation: 'Atikamekw', lat: 47.2203, lon: -74.3822, weatherSlug: 'manouane', weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/manouane/actuelle' },
  { id: 'nemaska', name: 'Nemaska', nation: 'Eeyou Istchee', lat: 51.2022, lon: -76.1906, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/nemaska/actuelle' },
  { id: 'wendake', name: 'Wendake', nation: 'Huron-Wendat', lat: 46.8550, lon: -71.3567, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/wendake/actuelle' },
  // ITUM — Uashat 27 + Mani-Utenam (Maliotenam).
  { id: 'uashat', name: 'Uashat mak Mani-Utenam', compactName: 'Uashat', nation: 'Innu', lat: 50.2300, lon: -66.3800, weatherSlug: 'uashat', weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/uashat/actuelle' },
  { id: 'kuujjuaq', name: 'Kuujjuaq', nation: 'Inuit · Nunavik', lat: 58.1000, lon: -68.4200, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kuujjuaq/actuelle' },
  { id: 'cacouna', name: 'Cacouna', nation: 'Wolastoqiyik Wahsipekuk', lat: 47.9204, lon: -69.5147, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/cacouna/actuelle' },
  { id: 'gesgapegiag', name: 'Gesgapegiag', nation: 'Mi’gmaq', lat: 48.2125, lon: -65.9961, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/gesgapegiag-2/actuelle' },
  // Orthographe Kanien’kéha ; page MM = Kahnawake 14.
  { id: 'kahnawake', name: 'Kahnawà:ke', nation: 'Kanien’kehá:ka', lat: 45.4000, lon: -73.7500, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kahnawake-14/actuelle' },
  { id: 'kawawachikamach', name: 'Kawawachikamach', compactName: 'Kawawa', nation: 'Naskapi', lat: 55.3400, lon: -66.8500, weatherUrl: 'https://www.meteomedia.com/fr/ville/ca/quebec/kawawachikamach/actuelle' },
];

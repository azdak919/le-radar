/**
 * Doodle de fin novembre 2026 — décision avant premier affichage.
 * Run: node tests/doodle-boot.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  STORAGE_KEY,
  CITY_STORAGE_KEY,
  END_MS,
  CHANCE,
  CITY_CHANCE,
  CITIES,
  resolveDoodleState,
  resolveDoodleCity,
  formatCityCredit,
  applyDoodleClass,
} = require("../doodle-boot-lib.js");

const END = Date.parse("2026-12-01T04:59:59.999Z");
const BEFORE = Date.parse("2026-11-21T20:00:00-05:00");
const AFTER = Date.parse("2026-12-01T05:00:00Z");

assert.equal(END_MS, END, "la fin doit être le 30 nov. 2026 à 23 h 59:59, heure de Montréal");
assert.equal(CHANCE, 0.2, "tirage 1 sur 5");
assert.equal(CITY_CHANCE, 0.5, "villes à parts égales");
assert.deepEqual(CITIES, ["montreal", "quebec"]);
assert.equal(STORAGE_KEY, "radar-doodle-2026-11");
assert.equal(CITY_STORAGE_KEY, "radar-doodle-2026-11-city");

function memStore(initial) {
  const data = { ...(initial || {}) };
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
  };
}

assert.equal(resolveDoodleState({ search: "?doodle=on", now: AFTER }), "on");
assert.equal(resolveDoodleState({ search: "doodle=off", now: BEFORE }), "off");
assert.equal(resolveDoodleState({ search: "?doodle=ON", now: AFTER }), "on");
assert.equal(resolveDoodleState({ search: "?foo=1&doodle=off", now: BEFORE }), "off");

assert.equal(
  resolveDoodleState({ now: AFTER, storage: memStore({ [STORAGE_KEY]: "on" }) }),
  "off",
);

assert.equal(
  resolveDoodleState({
    now: BEFORE,
    storage: memStore({ [STORAGE_KEY]: "on" }),
    random: () => 0.99,
  }),
  "on",
);
assert.equal(
  resolveDoodleState({
    now: BEFORE,
    storage: memStore({ [STORAGE_KEY]: "off" }),
    random: () => 0,
  }),
  "off",
);

{
  const store = memStore();
  const a = resolveDoodleState({ now: BEFORE, storage: store, random: () => 0.05 });
  assert.equal(a, "on");
  assert.equal(store.data[STORAGE_KEY], "on");
  const b = resolveDoodleState({ now: BEFORE, storage: store, random: () => 0.99 });
  assert.equal(b, "on", "le tirage mémorisé ne doit pas être relancé");
}
{
  const store = memStore();
  const a = resolveDoodleState({ now: BEFORE, storage: store, random: () => 0.5 });
  assert.equal(a, "off");
  assert.equal(store.data[STORAGE_KEY], "off");
}

{
  const store = memStore({ [STORAGE_KEY]: "off" });
  assert.equal(resolveDoodleState({ search: "?doodle=on", now: BEFORE, storage: store }), "on");
  assert.equal(store.data[STORAGE_KEY], "off");
}

{
  const session = memStore();
  assert.equal(resolveDoodleCity({ cityStorage: session, randomCity: () => 0.49 }), "montreal");
  assert.equal(session.data[CITY_STORAGE_KEY], "montreal");
  assert.equal(
    resolveDoodleCity({ cityStorage: session, randomCity: () => 0.99 }),
    "montreal",
    "la ville tirée reste pour la session",
  );
}
{
  const session = memStore();
  assert.equal(resolveDoodleCity({ cityStorage: session, randomCity: () => 0.5 }), "quebec");
  assert.equal(session.data[CITY_STORAGE_KEY], "quebec");
}
{
  const session = memStore({ [CITY_STORAGE_KEY]: "montreal" });
  assert.equal(
    resolveDoodleCity({ search: "?doodle-city=quebec", cityStorage: session }),
    "quebec",
  );
  assert.equal(session.data[CITY_STORAGE_KEY], "montreal", "le paramètre ne réécrit pas la session");
}

assert.equal(formatCityCredit("montreal"), "Stefan Fussan — Montréal");
assert.equal(formatCityCredit("quebec"), "Martin St-Amant — Québec");

{
  const classList = {
    _s: new Set(["keep-me"]),
    remove(...names) { names.forEach((n) => this._s.delete(n)); },
    add(n) { this._s.add(n); },
  };
  const attrs = {};
  const doc = {
    documentElement: {
      classList,
      setAttribute(k, v) { attrs[k] = v; },
      removeAttribute(k) { delete attrs[k]; },
    },
  };
  applyDoodleClass(doc, "on", "quebec");
  assert.ok(classList._s.has("doodle-on"));
  assert.ok(!classList._s.has("doodle-off"));
  assert.ok(classList._s.has("keep-me"));
  assert.equal(attrs["data-doodle"], "on");
  assert.equal(attrs["data-doodle-city"], "quebec");
  applyDoodleClass(doc, "off");
  assert.ok(classList._s.has("doodle-off"));
  assert.equal(attrs["data-doodle"], "off");
  assert.equal(attrs["data-doodle-city"], undefined);
}

const bootSrc = readFileSync(join(__dirname, "..", "seo-page-theme.js"), "utf8");
assert.match(bootSrc, /radar-doodle-2026-11/);
assert.match(bootSrc, /radar-doodle-2026-11-city/);
assert.match(bootSrc, /2026-12-01T04:59:59\.999Z/);
assert.match(bootSrc, /Math\.random\(\) < 0\.2/);
assert.match(bootSrc, /Math\.random\(\) < 0\.5/);
assert.match(bootSrc, /sessionStorage/);
assert.match(bootSrc, /data-doodle-city/);
assert.match(bootSrc, /doodle-on/);
assert.match(bootSrc, /doodle=on/);
assert.match(bootSrc, /doodle-city/);

const bgSrc = readFileSync(join(__dirname, "..", "quebec-backgrounds.js"), "utf8");
assert.match(bgSrc, /_isDoodleOn/);
assert.match(bgSrc, /_doodleCity/);
assert.match(bgSrc, /montreal-skyline-stefan-fussan\.jpg/);
assert.match(bgSrc, /quebec-skyline-martin-st-amant\.jpg/);
assert.match(bgSrc, /Stefan Fussan/);
assert.match(bgSrc, /Martin St-Amant/);
assert.match(bgSrc, /data-doodle-city/);
assert.match(bgSrc, /if \(_isDoodleOn\(\)\) return;/);

const cssSrc = readFileSync(join(__dirname, "..", "style-masthead.css"), "utf8");
assert.match(cssSrc, /data-doodle-city="montreal"/);
assert.match(cssSrc, /data-doodle-city="quebec"/);
assert.match(cssSrc, /montreal-skyline-stefan-fussan\.jpg/);
assert.match(cssSrc, /quebec-skyline-martin-st-amant\.jpg/);

const root = join(__dirname, "..");
assert.ok(existsSync(join(root, "assets/doodle/le-radar-pricedown.svg")));
assert.ok(existsSync(join(root, "assets/doodle/montreal-skyline-stefan-fussan.jpg")));
assert.ok(existsSync(join(root, "assets/doodle/quebec-skyline-martin-st-amant.jpg")));
const svg = readFileSync(join(root, "assets/doodle/le-radar-pricedown.svg"), "utf8");
assert.doesNotMatch(svg, /font-face|font-family|@font/i, "aucune police dans le SVG du titre");
assert.match(svg, /stroke-width="102"/);

const third = readFileSync(join(root, "THIRD_PARTY.md"), "utf8");
assert.match(third, /Stefan Fussan/);
assert.match(third, /Skyline of Montreal at sunset/);
assert.match(third, /Martin St-Amant - Wikipedia - CC-BY-SA-3.0/);
assert.match(third, /79 - Québec - Juin 2009/);
assert.match(third, /CC BY-SA 3\.0/);
assert.match(third, /couleurs modifiées/);

console.log("tests/doodle-boot.mjs : ok");

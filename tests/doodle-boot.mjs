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
  END_MS,
  CHANCE,
  resolveDoodleState,
  applyDoodleClass,
} = require("../doodle-boot-lib.js");

const END = Date.parse("2026-12-01T04:59:59.999Z");
const BEFORE = Date.parse("2026-11-21T20:00:00-05:00");
const AFTER = Date.parse("2026-12-01T05:00:00Z");

assert.equal(END_MS, END, "la fin doit être le 30 nov. 2026 à 23 h 59:59, heure de Montréal");
assert.equal(CHANCE, 0.2, "tirage 1 sur 5");
assert.equal(STORAGE_KEY, "radar-doodle-2026-11");

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
    },
  };
  applyDoodleClass(doc, "on");
  assert.ok(classList._s.has("doodle-on"));
  assert.ok(!classList._s.has("doodle-off"));
  assert.ok(classList._s.has("keep-me"));
  assert.equal(attrs["data-doodle"], "on");
}

const bootSrc = readFileSync(join(__dirname, "..", "seo-page-theme.js"), "utf8");
assert.match(bootSrc, /radar-doodle-2026-11/);
assert.match(bootSrc, /2026-12-01T04:59:59\.999Z/);
assert.match(bootSrc, /Math\.random\(\) < 0\.2/);
assert.match(bootSrc, /doodle-on/);
assert.match(bootSrc, /doodle=on/);

const bgSrc = readFileSync(join(__dirname, "..", "quebec-backgrounds.js"), "utf8");
assert.match(bgSrc, /_isDoodleOn/);
assert.match(bgSrc, /miami-skyline-joe-desousa-vaporwave\.jpg/);
assert.match(bgSrc, /if \(_isDoodleOn\(\)\) return;/);

const root = join(__dirname, "..");
assert.ok(existsSync(join(root, "assets/doodle/le-radar-pricedown.svg")));
assert.ok(existsSync(join(root, "assets/doodle/miami-skyline-joe-desousa-vaporwave.jpg")));
const svg = readFileSync(join(root, "assets/doodle/le-radar-pricedown.svg"), "utf8");
assert.doesNotMatch(svg, /font-face|font-family|@font/i, "aucune police dans le SVG du titre");
assert.match(svg, /stroke-width="102"/);

const third = readFileSync(join(root, "THIRD_PARTY.md"), "utf8");
assert.match(third, /Joe deSousa/);
assert.match(third, /CC0 1\.0/);
assert.match(third, /Miami Skyline/);

console.log("tests/doodle-boot.mjs : ok");

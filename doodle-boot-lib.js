/**
 * Doodle de fin novembre 2026 — décision avant le premier affichage.
 *
 * Fin : 30 novembre 2026, 23 h 59:59 (heure de Montréal, UTC−5).
 * Tirage 1 sur 5, mémorisé pour toute la période. ?doodle=on et
 * ?doodle=off forcent l’état, y compris après la date, pour les essais.
 *
 * CommonJS pour les tests ; navigateur via __lrDoodleBoot.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "radar-doodle-2026-11";
  var END_MS = Date.parse("2026-12-01T04:59:59.999Z");
  var CHANCE = 0.2;

  function readParam(search) {
    try {
      var raw = String(search || "");
      if (raw.charAt(0) === "?") raw = raw.slice(1);
      var params = new URLSearchParams(raw);
      var value = (params.get("doodle") || "").toLowerCase().trim();
      if (value === "on" || value === "off") return value;
      return "";
    } catch (err) {
      return "";
    }
  }

  /**
   * @param {object} opts
   * @param {string} [opts.search] query string (avec ou sans ?)
   * @param {number} [opts.now] horloge, ms
   * @param {{getItem?: Function, setItem?: Function}} [opts.storage]
   * @param {() => number} [opts.random]
   * @returns {"on"|"off"}
   */
  function resolveDoodleState(opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var force = readParam(opts.search || "");
    if (force === "on" || force === "off") return force;
    if (now > END_MS) return "off";
    var storage = opts.storage;
    try {
      if (storage && typeof storage.getItem === "function") {
        var saved = storage.getItem(STORAGE_KEY);
        if (saved === "on" || saved === "off") return saved;
      }
    } catch (err) { /* mode privé */ }
    var random = typeof opts.random === "function" ? opts.random() : Math.random();
    var on = random < CHANCE;
    try {
      if (storage && typeof storage.setItem === "function") {
        storage.setItem(STORAGE_KEY, on ? "on" : "off");
      }
    } catch (err2) { /* ignore */ }
    return on ? "on" : "off";
  }

  function applyDoodleClass(doc, state) {
    if (!doc || !doc.documentElement) return state;
    var el = doc.documentElement;
    el.classList.remove("doodle-on", "doodle-off");
    el.classList.add(state === "on" ? "doodle-on" : "doodle-off");
    el.setAttribute("data-doodle", state === "on" ? "on" : "off");
    return state;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    END_MS: END_MS,
    CHANCE: CHANCE,
    readParam: readParam,
    resolveDoodleState: resolveDoodleState,
    applyDoodleClass: applyDoodleClass,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.__lrDoodleBoot = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);

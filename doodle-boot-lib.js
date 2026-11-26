/**
 * Doodle de fin novembre 2026 — décision avant le premier affichage.
 *
 * Fin : 25 novembre 2026, 23 h 59:59 (désactivé le 26) (heure de Montréal, UTC−5).
 * Tirage 1 sur 5, mémorisé pour toute la période. Quand le doodle est
 * allumé, la ville (Montréal ou Québec) est tirée à parts égales et
 * gardée pour la session (sessionStorage). ?doodle=on et ?doodle=off
 * forcent l’état, y compris après la date, pour les essais.
 * ?doodle-city=montreal|quebec force la ville, sans l’écrire en session.
 *
 * CommonJS pour les tests ; navigateur via __lrDoodleBoot.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "radar-doodle-2026-11";
  var CITY_STORAGE_KEY = "radar-doodle-2026-11-city";
  var END_MS = Date.parse("2026-11-26T04:59:59.999Z");
  var CHANCE = 0.2;
  var CITY_CHANCE = 0.5;
  var CITIES = ["montreal", "quebec"];

  var CITY_META = {
    montreal: {
      id: "montreal",
      url: "/assets/doodle/montreal-skyline-stefan-fussan.jpg",
      credit: "Stefan Fussan",
      place: "Montréal",
      shortCredit: "Stefan Fussan — Montréal",
      link: "https://commons.wikimedia.org/wiki/File:Montreal_-_Skyline_-_0100.jpg",
      license: "CC BY-SA 3.0",
      title: "Skyline of Montreal at sunset",
      focalY: 0.48,
      width: 2880,
      height: 1236,
    },
    quebec: {
      id: "quebec",
      url: "/assets/doodle/quebec-skyline-martin-st-amant.jpg",
      credit: "Martin St-Amant",
      place: "Québec",
      shortCredit: "Martin St-Amant — Québec",
      link: "https://commons.wikimedia.org/wiki/File:79_-_Qu%C3%A9bec_-_Juin_2009.jpg",
      license: "CC BY-SA 3.0",
      title: "79 - Québec - Juin 2009",
      focalY: 0.50,
      width: 2880,
      height: 685,
    },
  };

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

  function readCityParam(search) {
    try {
      var raw = String(search || "");
      if (raw.charAt(0) === "?") raw = raw.slice(1);
      var params = new URLSearchParams(raw);
      var value = (params.get("doodle-city") || "").toLowerCase().trim();
      if (value === "montreal" || value === "quebec") return value;
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

  /**
   * Ville du doodle, 50/50, mémorisée pour la session.
   * @param {object} opts
   * @param {string} [opts.search]
   * @param {{getItem?: Function, setItem?: Function}} [opts.cityStorage]
   * @param {() => number} [opts.randomCity]
   * @returns {"montreal"|"quebec"}
   */
  function resolveDoodleCity(opts) {
    opts = opts || {};
    var force = readCityParam(opts.search || "");
    if (force === "montreal" || force === "quebec") return force;
    var storage = opts.cityStorage;
    try {
      if (storage && typeof storage.getItem === "function") {
        var saved = storage.getItem(CITY_STORAGE_KEY);
        if (saved === "montreal" || saved === "quebec") return saved;
      }
    } catch (err) { /* mode privé */ }
    var random = typeof opts.randomCity === "function" ? opts.randomCity() : Math.random();
    var city = random < CITY_CHANCE ? "montreal" : "quebec";
    try {
      if (storage && typeof storage.setItem === "function") {
        storage.setItem(CITY_STORAGE_KEY, city);
      }
    } catch (err2) { /* ignore */ }
    return city;
  }

  function formatCityCredit(city) {
    var meta = CITY_META[city];
    if (!meta) return "";
    return meta.shortCredit;
  }

  function applyDoodleClass(doc, state, city) {
    if (!doc || !doc.documentElement) return state;
    var el = doc.documentElement;
    el.classList.remove("doodle-on", "doodle-off");
    el.classList.add(state === "on" ? "doodle-on" : "doodle-off");
    el.setAttribute("data-doodle", state === "on" ? "on" : "off");
    if (state === "on" && (city === "montreal" || city === "quebec")) {
      el.setAttribute("data-doodle-city", city);
    } else if (typeof el.removeAttribute === "function") {
      el.removeAttribute("data-doodle-city");
    }
    return state;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    CITY_STORAGE_KEY: CITY_STORAGE_KEY,
    END_MS: END_MS,
    CHANCE: CHANCE,
    CITY_CHANCE: CITY_CHANCE,
    CITIES: CITIES,
    CITY_META: CITY_META,
    readParam: readParam,
    readCityParam: readCityParam,
    resolveDoodleState: resolveDoodleState,
    resolveDoodleCity: resolveDoodleCity,
    formatCityCredit: formatCityCredit,
    applyDoodleClass: applyDoodleClass,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.__lrDoodleBoot = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);

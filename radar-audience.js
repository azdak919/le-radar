/**
 * Compteur anonyme du bandeau sportif. Interrupteur éteint.
 *
 * Un clic n'envoie rien tant que l'interrupteur est faux. Le corps, le jour
 * où il partira, n'a que le nom « sport » et un contexte court (code de sport
 * et page). Pas d'adresse, pas de navigateur, pas d'identifiant. Ce n'est pas
 * le script Umami déjà présent sur d'autres pages.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.sportsAudienceTie = api.sportsAudienceTie;
  if (typeof document === 'undefined') return;

  document.addEventListener('click', function (event) {
    if (!api.ENABLED) return;
    var node = event.target;
    var chip = node && node.closest ? node.closest('.sports-chip--match') : null;
    if (!chip) return;
    var sport = chip.getAttribute('data-sports-sport') || '';
    if (!sport || sport === 'board') return;
    var page = /\/sports(\/|$)/.test(location.pathname) ? 'sports' : 'accueil';
    api.send(sport, page);
  }, true);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ENABLED = false;
  var BASE = '';
  var TOKEN = /^[a-z0-9][a-z0-9-]{0,23}$/;

  function sportCode(raw) {
    var code = String(raw || '').trim().toLowerCase();
    if (code === 'voile') code = 'sailing';
    return TOKEN.test(code) && code.length <= 16 ? code : '';
  }

  function clickBody(sport, page, enabled) {
    if (enabled !== true) return null;
    var code = sportCode(sport);
    var where = page === 'sports' ? 'sports' : 'accueil';
    if (!code) return null;
    var contexte = code + '-' + where;
    if (!TOKEN.test(contexte)) return null;
    return { name: 'sport', contexte: contexte };
  }

  /**
   * Porte fermée en production. Le départage ne s'ouvre que si l'appelant
   * réunit l'interrupteur, quatre à huit semaines, un seuil donné et une
   * moyenne déjà lissée. Un creux gelé, un sport sous le seuil ou une
   * moyenne absente ne compte pas comme « impopulaire ».
   */
  var AUDIENCE_GATE = {
    enabled: false,
    weeks: null,
    frozen: false,
    minimum: null,
    averages: null,
  };

  function weightDelta(sportA, sportB, gate) {
    var g = gate || AUDIENCE_GATE;
    if (g.enabled !== true) return 0;
    if (g.frozen === true) return 0;
    var weeks = g.weeks;
    if (typeof weeks !== 'number' || weeks < 4 || weeks > 8) return 0;
    var minimum = g.minimum;
    if (typeof minimum !== 'number' || !(minimum > 0)) return 0;
    var averages = g.averages;
    if (!averages || typeof averages !== 'object') return 0;
    var left = sportCode(sportA);
    var right = sportCode(sportB);
    if (!left || !right || left === right) return 0;
    var leftAvg = averages[left];
    var rightAvg = averages[right];
    if (typeof leftAvg !== 'number' || typeof rightAvg !== 'number') return 0;
    if (leftAvg < minimum || rightAvg < minimum) return 0;
    if (leftAvg === rightAvg) return 0;
    return leftAvg > rightAvg ? -1 : 1;
  }

  function sportsAudienceTie(sportA, sportB) {
    return weightDelta(sportA, sportB, AUDIENCE_GATE);
  }

  function stripOrder(keys, counts, enabled) {
    void counts;
    void enabled;
    return Array.isArray(keys) ? keys.slice() : [];
  }

  function send(sport, page) {
    var body = clickBody(sport, page, ENABLED);
    if (!body || !BASE) return null;
    var url = String(BASE).replace(/\/$/, '') + '/v1/audience/event';
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(function () {});
    return body;
  }

  return {
    ENABLED: ENABLED,
    clickBody: clickBody,
    stripOrder: stripOrder,
    weightDelta: weightDelta,
    sportsAudienceTie: sportsAudienceTie,
    send: send,
  };
});

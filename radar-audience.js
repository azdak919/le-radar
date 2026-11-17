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
   * L'ordre du bandeau ne change pas. Le poids n'est pas branché :
   * ni interrupteur éteint, ni totaux sous le seuil, ni totaux au-dessus.
   */
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

  return { ENABLED: ENABLED, clickBody: clickBody, stripOrder: stripOrder, send: send };
});

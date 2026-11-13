/**
 * LE-RADAR — chargement de la page SPORTS Étudiants.
 * Même principe que l’overlay de langue (voile, ondes, anneau, % honnête,
 * paliers, skip) : il n’apparaît que si le tableau met plus de 350 ms.
 * Le centre est le trophée. Les sections restent fermées ; ce script ne les ouvre pas.
 *
 * Script bloquant en tête, avant le corps : il compte les fiches pendant
 * l’analyse du HTML. CSP sans unsafe-inline — pas de script dans la page.
 */
(function () {
  'use strict';

  var meta = document.querySelector('meta[name="sports-panel-total"]');
  if (!meta) return;
  var total = parseInt(meta.getAttribute('content') || '', 10);
  if (!Number.isFinite(total) || total <= 0) return;

  var TIMING = {
    SHOW_DELAY_MS: 350,
    SKIP_AFTER_MS: 9000,
    FADE_MS: 250,
    HOLD_AT_100_MS: 280,
  };
  var LIVE_MARKS = [25, 50, 75, 100];
  var lang = (document.documentElement.lang || 'fr').toLowerCase().indexOf('en') === 0 ? 'en' : 'fr';
  var copy = lang === 'en'
    ? {
      prep: 'Preparing the board…',
      games: 'Loading games…',
      layout: 'Laying out…',
      ready: 'Ready',
      skip: 'Show the board',
    }
    : {
      prep: 'Préparation du tableau…',
      games: 'Chargement des matchs…',
      layout: 'Mise en page…',
      ready: 'Prêt',
      skip: 'Afficher le tableau',
    };

  var scriptSrc = document.currentScript && document.currentScript.src;
  var started = Date.now();
  var shown = false;
  var done = false;
  var dismissed = false;
  var el = null;
  var count = 0;
  var announced = {};
  var showTimer = 0;
  var skipTimer = 0;
  var layoutRaf = 0;

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function assetUrl(rel) {
    try { return new URL(rel, scriptSrc || window.location.href).href; } catch (e) { return rel; }
  }

  function labelFor(percent) {
    if (percent >= 100) return copy.ready;
    if (percent >= 75) return copy.layout;
    if (percent >= 30) return copy.games;
    return copy.prep;
  }

  /** 10–94 pendant l’analyse, 100 seulement quand le tableau est prêt. */
  function displayPercent() {
    var ratio = Math.max(0, Math.min(1, count / total));
    return Math.max(10, Math.min(94, Math.round(10 + ratio * 84)));
  }

  function readCount() {
    return document.getElementsByClassName('sports-panel').length;
  }

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sports-load';
    el.className = 'translate-progress translate-progress--sports notranslate';
    el.setAttribute('translate', 'no');
    el.hidden = true;
    el.innerHTML = [
      '<div class="translate-progress__veil" aria-hidden="true"></div>',
      '<div class="translate-progress__layout">',
      '  <div class="translate-progress__card">',
      '    <div class="translate-progress__mark" aria-hidden="true">',
      '      <span class="translate-progress__wave"></span>',
      '      <span class="translate-progress__wave"></span>',
      '      <span class="translate-progress__wave"></span>',
      '      <div class="translate-progress__ring"></div>',
      '      <img class="translate-progress__logo" src="' + assetUrl('assets/emoji/trophy.png') + '" width="48" height="48" alt="">',
      '    </div>',
      '    <p class="translate-progress__pct" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-labelledby="sports-load-label">',
      '      <span class="translate-progress__num">0</span><span class="translate-progress__suffix"> %</span>',
      '    </p>',
      '    <p id="sports-load-label" class="translate-progress__label"></p>',
      '    <div class="translate-progress__bar" aria-hidden="true"><div class="translate-progress__fill"></div></div>',
      '    <button type="button" class="translate-progress__skip notranslate" translate="no" hidden></button>',
      '  </div>',
      '</div>',
      '<div class="translate-progress__live" aria-live="polite"></div>',
    ].join('');
    var logo = el.querySelector('.translate-progress__logo');
    if (logo) {
      logo.addEventListener('error', function () {
        logo.src = assetUrl('assets/icon.svg');
      });
    }
    el.querySelector('.translate-progress__skip').addEventListener('click', function (event) {
      event.preventDefault();
      dismiss();
    });
    return el;
  }

  function paint(percent, determined) {
    var node = ensure();
    var pct = Math.max(0, Math.min(100, percent));
    var num = node.querySelector('.translate-progress__num');
    var bar = node.querySelector('.translate-progress__pct');
    var fill = node.querySelector('.translate-progress__fill');
    var ring = node.querySelector('.translate-progress__ring');
    var label = node.querySelector('#sports-load-label');
    var live = node.querySelector('.translate-progress__live');
    var suffix = node.querySelector('.translate-progress__suffix');
    node.classList.toggle('is-indeterminate', !determined);
    if (num) num.textContent = determined ? String(Math.round(pct)) : '…';
    if (suffix) suffix.hidden = !determined;
    if (bar) {
      if (determined) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      else bar.removeAttribute('aria-valuenow');
    }
    if (fill && determined) fill.style.width = pct + '%';
    if (ring) ring.style.setProperty('--translate-pct', determined ? String(pct) : '0');
    if (label) label.textContent = determined ? labelFor(pct) : copy.prep;
    var skip = node.querySelector('.translate-progress__skip');
    if (skip) skip.textContent = copy.skip;
    if (live && determined) {
      for (var i = 0; i < LIVE_MARKS.length; i += 1) {
        var mark = LIVE_MARKS[i];
        if (pct >= mark && !announced[mark]) {
          announced[mark] = true;
          live.textContent = mark + ' %';
        }
      }
    }
  }

  function centerCard(height) {
    var card = el && el.querySelector('.translate-progress__card');
    if (!card) return;
    var cardH = card.offsetHeight || 220;
    var minTop = 16;
    var maxTop = height - cardH - 16;
    var cardTop = (height / 2) - (cardH / 2);
    if (maxTop >= minTop) cardTop = Math.min(Math.max(cardTop, minTop), maxTop);
    else cardTop = minTop;
    card.style.position = 'absolute';
    card.style.top = Math.max(0, cardTop) + 'px';
    card.style.left = '50%';
    card.style.right = 'auto';
    card.style.transform = 'translateX(-50%)';
    card.style.margin = '0';
  }

  function layout() {
    if (!el || el.hidden) return;
    var main = document.querySelector('main.wire');
    if (shown && !done && !dismissed) {
      document.documentElement.classList.add('translate-articles-lock');
      if (main) {
        main.classList.add('is-translate-locked');
        main.setAttribute('aria-busy', 'true');
      }
    }
    if (!main) {
      if (el.parentElement !== document.documentElement) document.documentElement.appendChild(el);
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      centerCard(window.innerHeight);
      return;
    }
    if (el.parentElement !== main) main.appendChild(el);
    el.style.position = 'absolute';
    var hostRect = main.getBoundingClientRect();
    var tuner = document.getElementById('tuner');
    var tunerBottom = tuner ? tuner.getBoundingClientRect().bottom : 0;
    var viewTop = Math.max(0, tunerBottom);
    var visTop = Math.max(hostRect.top, viewTop);
    var visBottom = Math.min(hostRect.bottom, window.innerHeight);
    var visLeft = Math.max(hostRect.left, 0);
    var visRight = Math.min(hostRect.right, window.innerWidth);
    var width = Math.max(0, visRight - visLeft);
    var height = Math.max(0, visBottom - visTop);
    el.style.top = (visTop - hostRect.top) + 'px';
    el.style.left = (visLeft - hostRect.left) + 'px';
    el.style.width = width + 'px';
    el.style.height = Math.max(height, 8) + 'px';
    centerCard(Math.max(height, 8));
  }

  function scheduleLayout() {
    if (layoutRaf) return;
    layoutRaf = window.requestAnimationFrame(function () {
      layoutRaf = 0;
      layout();
    });
  }

  function lock() {
    document.documentElement.classList.add('translate-articles-lock');
    var main = document.querySelector('main.wire');
    if (!main) return;
    main.classList.add('is-translate-locked');
    main.setAttribute('aria-busy', 'true');
  }

  function unlock() {
    document.documentElement.classList.remove('translate-articles-lock');
    var main = document.querySelector('main.wire');
    if (!main) return;
    main.classList.remove('is-translate-locked');
    main.removeAttribute('aria-busy');
  }

  function show() {
    if (shown || done || dismissed) return;
    shown = true;
    var node = ensure();
    node.hidden = false;
    node.classList.remove('is-leaving');
    lock();
    count = readCount();
    paint(displayPercent(), true);
    layout();
    scheduleLayout();
    window.addEventListener('resize', scheduleLayout);
    try { window.visualViewport && window.visualViewport.addEventListener('resize', scheduleLayout); } catch (e) { /* pas de visualViewport */ }
    skipTimer = window.setTimeout(function () {
      var skip = el && el.querySelector('.translate-progress__skip');
      if (skip && shown && !dismissed && !done) skip.hidden = false;
    }, TIMING.SKIP_AFTER_MS);
  }

  function hide(fade) {
    unlock();
    window.removeEventListener('resize', scheduleLayout);
    try { window.visualViewport && window.visualViewport.removeEventListener('resize', scheduleLayout); } catch (e) { /* ignore */ }
    if (!el) return;
    var node = el;
    var remove = function () {
      if (node.parentElement) node.parentElement.removeChild(node);
    };
    if (!fade || reducedMotion() || node.hidden) {
      remove();
      return;
    }
    node.classList.add('is-leaving');
    window.setTimeout(remove, TIMING.FADE_MS);
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    done = true;
    window.clearTimeout(showTimer);
    window.clearTimeout(skipTimer);
    if (observer) observer.disconnect();
    hide(true);
  }

  function finish() {
    if (done || dismissed) return;
    done = true;
    window.clearTimeout(showTimer);
    window.clearTimeout(skipTimer);
    if (observer) observer.disconnect();
    count = readCount();
    if (!shown) return;
    paint(100, true);
    layout();
    var hold = reducedMotion() ? 0 : TIMING.HOLD_AT_100_MS;
    window.setTimeout(function () { hide(true); }, hold);
  }

  var countRaf = 0;
  var observer = new MutationObserver(function () {
    if (countRaf || done || dismissed) return;
    countRaf = window.requestAnimationFrame(function () {
      countRaf = 0;
      count = readCount();
      if (shown && !done) {
        paint(displayPercent(), true);
        scheduleLayout();
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  showTimer = window.setTimeout(function () {
    if (done || dismissed) return;
    count = readCount();
    if (document.readyState !== 'loading' && count >= total) {
      done = true;
      if (observer) observer.disconnect();
      return;
    }
    show();
  }, TIMING.SHOW_DELAY_MS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', finish);
  } else {
    finish();
  }
})();

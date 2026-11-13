/**
 * LE RADAR — icônes des réseaux sociaux dans le pied de page partagé (.site-foot).
 * Tracés : Simple Icons (CC0) et Bootstrap Icons (MIT, LinkedIn) — voir assets/social-icons/LICENSE.md.
 * Activer un réseau : passer `enabled` à true (Mastodon attend l'approbation du compte).
 * Les pages qui ont déjà le bloc en HTML statique (.site-foot__social) ne sont pas touchées.
 */
(function () {
  'use strict';
  const SOCIAL_LINKS = [
    { id: 'x', name: 'X', href: 'https://x.com/le_radar_ca', label: 'LE-RADAR.ca sur X', viewBox: '0 0 24 24', path: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z', enabled: true },
    { id: 'bluesky', name: 'Bluesky', href: 'https://bsky.app/profile/le-radar.ca', label: 'LE-RADAR.ca sur Bluesky', viewBox: '0 0 24 24', path: 'M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026', enabled: true },
    { id: 'facebook', name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61596092762097', label: 'LE-RADAR.ca sur Facebook', viewBox: '0 0 24 24', path: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z', enabled: true },
    { id: 'linkedin', name: 'LinkedIn', href: 'https://www.linkedin.com/company/le-radar-ca/', label: 'LE-RADAR.ca sur LinkedIn', viewBox: '0 0 16 16', path: 'M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z', enabled: true },
    { id: 'tumblr', name: 'Tumblr', href: 'https://le-radar-ca.tumblr.com', label: 'LE-RADAR.ca sur Tumblr', viewBox: '0 0 24 24', path: 'M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z', enabled: true },
    { id: 'mastodon', name: 'Mastodon', href: 'https://piaille.fr/@leradar', label: 'LE-RADAR.ca sur Mastodon', viewBox: '0 0 24 24', path: 'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z', enabled: true },
    { id: 'rss', name: 'RSS', href: 'https://le-radar.ca/feed.xml', label: 'Fil RSS de LE-RADAR.ca', viewBox: '0 0 24 24', path: 'M19.199 24C19.199 13.467 10.533 4.8 0 4.8V0c13.165 0 24 10.835 24 24h-4.801zM3.291 17.415c1.814 0 3.293 1.479 3.293 3.295 0 1.813-1.485 3.29-3.301 3.29C1.47 24 0 22.526 0 20.71s1.475-3.294 3.291-3.295zM15.909 24h-4.665c0-6.169-5.075-11.245-11.244-11.245V8.09c8.727 0 15.909 7.184 15.909 15.91z', enabled: true },
  ];
  const NS = 'http://www.w3.org/2000/svg';
  function build() {
    const nav = document.createElement('nav');
    nav.className = 'site-foot__social';
    nav.setAttribute('aria-label', 'LE-RADAR.ca sur les réseaux sociaux');
    for (const s of SOCIAL_LINKS) {
      if (!s.enabled) continue;
      const a = document.createElement('a');
      a.href = s.href;
      a.rel = 'me noopener';
      a.target = '_blank';
      a.dataset.social = s.id;
      a.setAttribute('aria-label', s.label);
      a.title = s.name;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', s.viewBox);
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', s.path);
      svg.appendChild(path);
      a.appendChild(svg);
      nav.appendChild(a);
    }
    return nav;
  }
  const COL_LABELS = {
    fr: { explore: 'Explorer', project: 'Le projet', install: 'Installer', nav: 'Pied de page' },
    en: { explore: 'Explore', project: 'The project', install: 'Install', nav: 'Footer' },
  };
  function col(key, labels) {
    const div = document.createElement('div');
    div.className = 'site-foot__col site-foot__col--' + key;
    const h = document.createElement('p');
    h.className = 'site-foot__col-title';
    h.textContent = labels[key];
    const list = document.createElement('div');
    list.className = 'site-foot__col-list';
    div.append(h, list);
    return { div, list };
  }
  /**
   * Pied de page v2 : marque + réseaux, colonnes (Explorer / Le projet / Installer),
   * puis mentions en bas. Tous les gabarits (.site-foot) passent par ici ; le contenu
   * existant est déplacé, jamais supprimé.
   */
  function restructure(foot) {
    if (foot.classList.contains('site-foot--v2') || foot.classList.contains('site-foot--maintenance')) return;
    const links = foot.querySelector(':scope > .site-foot__links');
    if (!links) return;
    const lang = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
    const labels = COL_LABELS[lang];
    const brand = foot.querySelector(':scope > .site-foot__brand');
    const social = foot.querySelector(':scope > .site-foot__social');
    const about = [...foot.querySelectorAll(':scope > p')].find((p) => !p.className && !p.querySelector('a[rel~="license"]'));
    const licence = [...foot.querySelectorAll(':scope > p')].find((p) => p.querySelector('a[rel~="license"]'));
    const kao = foot.querySelector(':scope > .site-foot__kao');
    const credit = foot.querySelector(':scope > .site-foot__credit');
    const contact = credit && credit.querySelector('.site-foot__contact');

    const top = document.createElement('div');
    top.className = 'site-foot__top';
    const brandCol = document.createElement('div');
    brandCol.className = 'site-foot__brandcol';
    if (brand) brandCol.append(brand);
    if (social) brandCol.append(social);
    if (about) { about.classList.add('site-foot__about'); brandCol.append(about); }

    const explore = col('explore', labels);
    const project = col('project', labels);
    const install = col('install', labels);
    [...links.children].forEach((el) => {
      if (el.classList.contains('site-foot__sep')) { el.remove(); return; }
      const href = el.getAttribute('href') || '';
      if (el.hasAttribute('data-install-app') || el.hasAttribute('data-foot-fdroid')) install.list.append(el);
      else if (el.hasAttribute('hreflang') || /kit-media|media-kit/.test(href)) project.list.append(el);
      else explore.list.append(el);
    });
    if (contact) project.list.append(contact);
    if (kao) project.list.append(kao);
    links.classList.add('site-foot__cols');
    links.setAttribute('aria-label', labels.nav);
    links.append(explore.div, project.div);
    if (install.list.children.length) links.append(install.div);
    top.append(brandCol, links);

    const bottom = document.createElement('div');
    bottom.className = 'site-foot__bottom';
    if (credit) bottom.append(credit);
    if (licence) { licence.classList.add('site-foot__licence'); credit ? credit.insertBefore(licence, credit.querySelector('.site-foot__legal')) : bottom.append(licence); }
    foot.prepend(top);
    top.after(bottom);
    foot.classList.add('site-foot--v2');
  }
  const WORDMARK = 'LE\u2011RADAR.ca';
  function assetBeside(el, filename) {
    const src = el && (el.getAttribute('src') || el.src);
    if (!src) return '';
    return src.replace(/[^/?#]+(?=[?#]|$)/, filename);
  }
  function printAsset(foot, filename, fallback) {
    const fromFoot = assetBeside(foot.querySelector('.site-foot__logo'), filename);
    if (fromFoot) return fromFoot;
    const fromMark = assetBeside(document.querySelector('.wordmark-logo'), filename);
    if (fromMark) return fromMark;
    return fallback;
  }
  function injectPrintPromo(foot) {
    if (!foot || foot.querySelector('.print-promo')) return;
    const lang = (document.documentElement.lang || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
    const aside = document.createElement('aside');
    aside.className = 'print-promo';
    aside.setAttribute('aria-hidden', 'true');
    const qr = document.createElement('img');
    qr.className = 'print-promo__qr';
    qr.src = printAsset(foot, 'kit/qr-le-radar.svg', 'assets/kit/qr-le-radar.svg');
    qr.alt = '';
    qr.width = 120;
    qr.height = 120;
    const copy = document.createElement('div');
    copy.className = 'print-promo__copy';
    const scan = document.createElement('p');
    scan.className = 'print-promo__scan';
    scan.textContent = lang === 'en' ? 'Scan me' : 'Scanne-moi';
    const tag = document.createElement('p');
    tag.className = 'print-promo__tag';
    tag.textContent = lang === 'en' ? 'The student wire, live' : 'Le fil étudiant, en direct';
    const suite = document.createElement('p');
    suite.className = 'print-promo__suite';
    suite.appendChild(document.createTextNode(lang === 'en' ? 'Continued on ' : 'Suite sur '));
    const mark = document.createElement('span');
    mark.className = 'print-promo__mark notranslate';
    mark.setAttribute('translate', 'no');
    const logo = document.createElement('img');
    logo.className = 'print-promo__logo';
    logo.src = printAsset(foot, 'icon.svg', 'assets/icon.svg');
    logo.alt = '';
    logo.width = 20;
    logo.height = 20;
    const brand = document.createElement('span');
    brand.className = 'print-promo__brand';
    brand.textContent = WORDMARK;
    mark.append(logo, brand);
    suite.appendChild(mark);
    copy.append(scan, tag, suite);
    aside.append(qr, copy);
    const anchor = foot.querySelector('.site-foot__bottom, .site-foot__credit, .site-foot__author');
    if (anchor) anchor.before(aside);
    else foot.append(aside);
  }
  function markTruncatedBriefs() {
    document.querySelectorAll('.article-brief.is-truncated .article-brief-text').forEach((el) => {
      const text = (el.textContent || '').replace(/\s+$/g, '');
      if (text && !/[.…⋯]{1,3}$/.test(text)) el.classList.add('is-cut');
      else el.classList.remove('is-cut');
    });
  }
  function mount() {
    document.querySelectorAll('footer.site-foot').forEach((foot) => {
      if (!foot.querySelector('.site-foot__social')) {
        const brand = foot.querySelector('.site-foot__brand');
        const nav = build();
        if (brand) brand.after(nav); else foot.prepend(nav);
      }
      restructure(foot);
      injectPrintPromo(foot);
    });
    markTruncatedBriefs();
  }
  const FR_INST_PRINT = {
    'Concordia University': 'Université Concordia',
    'McGill University': 'Université McGill',
    "Bishop's University": "Université Bishop's",
    'Bishop\u2019s University': 'Université Bishop\u2019s',
  };
  function applyFrenchInstitutionNames(on) {
    const fr = !(document.documentElement.lang || 'fr').toLowerCase().startsWith('en');
    if (!fr) return;
    document.querySelectorAll('.article-inst__full, .article-inst').forEach((el) => {
      if (el.querySelector('.article-inst__full, .article-inst__short')) return;
      if (on) {
        if (!el.dataset.orig) el.dataset.orig = el.textContent;
        const orig = el.dataset.orig;
        if (FR_INST_PRINT[orig]) el.textContent = FR_INST_PRINT[orig];
      } else if (el.dataset.orig) {
        el.textContent = el.dataset.orig;
      }
    });
    // Dual full/short spans
    document.querySelectorAll('.article-inst__full').forEach((el) => {
      if (on) {
        if (!el.dataset.orig) el.dataset.orig = el.textContent;
        if (FR_INST_PRINT[el.dataset.orig]) el.textContent = FR_INST_PRINT[el.dataset.orig];
      } else if (el.dataset.orig) {
        el.textContent = el.dataset.orig;
      }
    });
  }
  window.addEventListener('beforeprint', () => {
    markTruncatedBriefs();
    applyFrenchInstitutionNames(true);
  });
  window.addEventListener('afterprint', () => applyFrenchInstitutionNames(false));
  const newsList = document.getElementById('news-list');
  if (newsList) {
    new MutationObserver(() => markTruncatedBriefs()).observe(newsList, { childList: true, subtree: true });
  }
  window.RadarSocialLinks = SOCIAL_LINKS;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

/**
 * LE RADAR — Phase 2b navigation shell (same-tab continuous listening).
 *
 * While this top-level page is actually playing audio, internal navigations
 * (accueil, feeds, pomo, solitaire) load in a full-viewport iframe so the
 * host document — and its <audio> — stay alive. Child frames skip this module
 * (window !== top).
 *
 * Combined with Phase 1 sync: the iframe page becomes a follower UI; host keeps the stream.
 */
(function () {
  'use strict';

  const FRAME_ID = 'radar-nav-frame';
  const SHELL_CLASS = 'radar-shell-active';
  const STYLE_ID = 'radar-nav-shell-style';
  const NAVIGATE_MESSAGE = 'radar-nav-shell-navigate';

  function pathNorm(pathname) {
    let p = pathname || '/';
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p || '/';
  }

  /** Paths we keep inside the shell (same-origin app surfaces). */
  function isShellPath(pathname) {
    const p = pathNorm(pathname);
    // Project pages on github.io: /le-radar, /le-radar/pomo, …
    const base = pathNorm(new URL('.', location.href).pathname);
    const rel = p === base ? '/' : (p.startsWith(base + '/') ? p.slice(base.length) : p);
    const r = rel.startsWith('/') ? rel : '/' + rel;
    // Le lecteur natif existe sur toutes les pages publiques. Les exceptions
    // sont la maintenance, les pages techniques et l'iframe des mini-apps.
    return r !== '/offline.html' && r !== '/tuner-embed.html' && r !== '/sports-embed.html' && r !== '/sports-ad-embed.html' && r !== '/easter-egg.html' && !r.startsWith('/dev/');
  }

  /**
   * PWA installée (et WebView Capacitor si le site y tourne).
   * Un target=_blank sur Sports sortirait de l’app ; Pomo et Solitaire
   * n’en ont pas, donc ils restent dans la fenêtre. Ici on fait pareil.
   * Dans un onglet de bureau, le nouvel onglet reste : la radio continue.
   */
  function isInstalledSurface() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
      if (navigator.standalone === true) return true;
    } catch { /* pas de matchMedia */ }
    try {
      const cap = window.Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
    } catch { /* pas Capacitor */ }
    return false;
  }

  function blankLeavesApp(link) {
    const target = (link.getAttribute('target') || '').toLowerCase();
    return Boolean(target && target !== '_self' && !isInstalledSurface());
  }

  // A page already displayed inside the shell must delegate its own internal
  // links to the host. Otherwise the iframe changes page by itself: listening
  // continues, but the address/history fall out of sync with what is shown.
  if (window !== window.top) {
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target?.closest?.('a[href]');
      if (!link || link.hasAttribute('download')) return;
      if (blankLeavesApp(link)) return;

      let url;
      try {
        url = new URL(link.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin || !isShellPath(url.pathname)) return;
      if (url.hash && pathNorm(url.pathname) === pathNorm(location.pathname) && url.search === location.search) return;

      event.preventDefault();
      if ((link.getAttribute('target') || '').toLowerCase() === '_blank') event.stopPropagation();
      window.top.postMessage({ type: NAVIGATE_MESSAGE, href: url.href }, location.origin);
    }, true);
    return;
  }

  function audioElPlaying(el) {
    return !!(el && el.src && !el.paused && !el.ended);
  }

  function isLocallyPlaying() {
    if (document.documentElement.dataset.radarPlaying === '1') return true;
    if (audioElPlaying(document.getElementById('radar-player'))) return true;

    // Pomo / Solitaire: the real player lives in the tuner embed iframe.
    const embeds = document.querySelectorAll(
      'iframe#radar-embed, iframe.radar-embed-frame, iframe[src*="tuner-embed"]'
    );
    for (const frame of embeds) {
      try {
        const doc = frame.contentDocument;
        if (!doc) continue;
        if (doc.documentElement.dataset.radarPlaying === '1') return true;
        if (audioElPlaying(doc.getElementById('radar-player'))) return true;
      } catch {
        /* cross-origin — ignore */
      }
    }
    return false;
  }

  function shouldUseShell() {
    return isLocallyPlaying();
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      html.${SHELL_CLASS}, html.${SHELL_CLASS} body {
        overflow: hidden !important;
      }
      #${FRAME_ID} {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        margin: 0;
        padding: 0;
        z-index: 2147483000;
        background: #0e1014;
      }
    `;
    document.head.appendChild(s);
  }

  function getFrame() {
    return document.getElementById(FRAME_ID);
  }

  function ensureFrame() {
    ensureStyles();
    let f = getFrame();
    if (!f) {
      f = document.createElement('iframe');
      f.id = FRAME_ID;
      f.title = 'Le Radar';
      f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      document.body.appendChild(f);
    }
    return f;
  }

  function exitShell({ restoreUrl } = {}) {
    const f = getFrame();
    if (f) f.remove();
    document.documentElement.classList.remove(SHELL_CLASS);
    if (restoreUrl) {
      try {
        history.replaceState({ radarShell: false }, '', restoreUrl);
      } catch { /* */ }
    }
  }

  function sameDocument(url) {
    try {
      const u = new URL(url, location.href);
      return (
        u.origin === location.origin
        && pathNorm(u.pathname) === pathNorm(location.pathname)
        && u.search === location.search
      );
    } catch {
      return false;
    }
  }

  function navigateInShell(href, { replace = false } = {}) {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !isShellPath(url.pathname)) {
      location.href = href;
      return;
    }

    // Navigating "back" to the host page itself → just close the overlay.
    if (sameDocument(url.href)) {
      exitShell();
      if (!replace) {
        try { history.pushState({ radarShell: false }, '', url.href); } catch { /* */ }
      }
      return;
    }

    const f = ensureFrame();
    document.documentElement.classList.add(SHELL_CLASS);
    if (f.dataset.src !== url.href) {
      f.dataset.src = url.href;
      f.src = url.href;
    }
    try {
      const state = { radarShell: true, url: url.href };
      if (replace) history.replaceState(state, '', url.href);
      else history.pushState(state, '', url.href);
    } catch {
      /* ignore */
    }
  }

  function onClick(event) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const a = event.target?.closest?.('a[href]');
    if (!a) return;
    if (a.hasAttribute('download')) return;
    if (blankLeavesApp(a)) return;

    let url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    if (url.hash && pathNorm(url.pathname) === pathNorm(location.pathname) && url.search === location.search) {
      return; // in-page anchor
    }
    if (!isShellPath(url.pathname)) return;
    if (!shouldUseShell()) {
      // PWA : Sports (target=_blank) reste dans l’app, comme Pomo / Solitaire.
      if (isInstalledSurface() && (a.getAttribute('target') || '').toLowerCase() === '_blank') {
        event.preventDefault();
        event.stopPropagation();
        location.assign(url.href);
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateInShell(url.href);
  }

  function onPopState(event) {
    const st = event.state;
    if (st?.radarShell && st.url) {
      const f = ensureFrame();
      document.documentElement.classList.add(SHELL_CLASS);
      if (f.dataset.src !== st.url) {
        f.dataset.src = st.url;
        f.src = st.url;
      }
      return;
    }
    // Left shell history entry
    exitShell();
  }

  function onMessage(event) {
    if (event.origin !== location.origin) return;
    const payload = event.data;
    if (payload?.type !== NAVIGATE_MESSAGE || typeof payload.href !== 'string') return;

    const frame = getFrame();
    if (!frame || event.source !== frame.contentWindow) return;

    let url;
    try {
      url = new URL(payload.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin || !isShellPath(url.pathname)) return;
    navigateInShell(url.href);
  }

  // If a child (iframe) wants to break out while host is still playing, it can
  // set location on top — we leave that to target=_top links.
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('message', onMessage);

  // Expose tiny API for debugging / future controls
  window.RadarNavShell = {
    navigate: navigateInShell,
    exit: exitShell,
    isActive: () => document.documentElement.classList.contains(SHELL_CLASS),
  };
})();

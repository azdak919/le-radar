/**
 * Boutons « Suivre » / « Suivi » — hydrate le HTML statique des fiches
 * et le bandeau du fil. L’état vit dans MediaFollowStore.
 */
'use strict';

(function initMediaFollowUi(global) {
const FOLLOWED_FILTER = 'followed';

function store() {
  return global.MediaFollowStore || null;
}

function escapeHtml(value) {
  if (typeof global.escapeHtml === 'function') return global.escapeHtml(value);
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageLang() {
  const lang = document.documentElement.lang || '';
  return lang.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

function defaultLabels(lang) {
  if (lang === 'en') {
    return {
      follow: 'Follow',
      following: 'Following',
      followNamed: 'Follow {name} in LE-RADAR',
      followingNamed: 'Unfollow {name}',
    };
  }
  return {
    follow: 'Suivre',
    following: 'Suivi',
    followNamed: 'Suivre {name} dans LE-RADAR',
    followingNamed: 'Ne plus suivre {name}',
  };
}

function fill(template, name) {
  return String(template || '').replace(/\{name\}/g, name);
}

function labelsFor(button) {
  const lang = button.getAttribute('data-follow-lang') || pageLang();
  const fallback = defaultLabels(lang);
  const name = button.getAttribute('data-media-name') || '';
  return {
    follow: button.getAttribute('data-label-follow') || fallback.follow,
    following: button.getAttribute('data-label-following') || fallback.following,
    followNamed: fill(button.getAttribute('data-label-follow-named') || fallback.followNamed, name),
    followingNamed: fill(button.getAttribute('data-label-following-named') || fallback.followingNamed, name),
  };
}

function syncButton(button) {
  const api = store();
  if (!button || !api) return;
  const id = button.getAttribute('data-media-id') || api.mediaIdFromName(button.getAttribute('data-media-name') || '');
  if (!id) return;
  if (!button.getAttribute('data-media-id')) button.setAttribute('data-media-id', id);
  const followed = api.isFollowed(id);
  const labels = labelsFor(button);
  button.setAttribute('aria-pressed', followed ? 'true' : 'false');
  button.classList.toggle('is-followed', followed);
  const mark = button.querySelector('.media-follow__mark');
  const label = button.querySelector('.media-follow__label');
  if (mark) mark.textContent = followed ? '★' : '☆';
  if (label) label.textContent = followed ? labels.following : labels.follow;
  button.setAttribute('aria-label', followed ? labels.followingNamed : labels.followNamed);
  button.title = followed ? labels.followingNamed : labels.followNamed;
}

function onFollowClick(event) {
  const button = event.currentTarget;
  const api = store();
  if (!api) return;
  const id = button.getAttribute('data-media-id') || api.mediaIdFromName(button.getAttribute('data-media-name') || '');
  if (!id) return;
  api.toggle(id);
  syncButton(button);
}

function bindButton(button) {
  if (!button || button.dataset.followBound === '1') return;
  button.dataset.followBound = '1';
  if (!button.getAttribute('type')) button.setAttribute('type', 'button');
  button.addEventListener('click', onFollowClick);
  syncButton(button);
}

function bindFollowButtons(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('[data-media-follow]').forEach(bindButton);
}

function syncAll(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('[data-media-follow]').forEach(syncButton);
}

function createFollowButton({ id, name, lang } = {}) {
  const api = store();
  const mediaId = id || (api ? api.mediaIdFromName(name || '') : '');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-follow';
  button.setAttribute('data-media-follow', '');
  if (mediaId) button.setAttribute('data-media-id', mediaId);
  if (name) button.setAttribute('data-media-name', name);
  if (lang) button.setAttribute('data-follow-lang', lang);
  const mark = document.createElement('span');
  mark.className = 'media-follow__mark';
  mark.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'media-follow__label';
  button.append(mark, label);
  bindButton(button);
  return button;
}

function followButtonHtml({ id, name, lang = 'fr', escape = escapeHtml }) {
  const labels = defaultLabels(lang);
  const namedFollow = fill(labels.followNamed, name);
  return `<button type="button" class="media-follow" data-media-follow data-media-id="${escape(id)}" data-media-name="${escape(name)}" data-follow-lang="${escape(lang)}" data-label-follow="${escape(labels.follow)}" data-label-following="${escape(labels.following)}" data-label-follow-named="${escape(labels.followNamed)}" data-label-following-named="${escape(labels.followingNamed)}" aria-pressed="false" aria-label="${escape(namedFollow)}" title="${escape(namedFollow)}"><span class="media-follow__mark" aria-hidden="true">☆</span><span class="media-follow__label">${escape(labels.follow)}</span></button>`;
}

function ficheHref(name) {
  const api = store();
  const id = api ? api.mediaIdFromName(name) : '';
  if (!id) return '';
  try {
    if (typeof appAsset === 'function') return appAsset(`journaux/${id}/`);
  } catch { /* ignore */ }
  try {
    if (typeof APP_BASE_URL !== 'undefined') return new URL(`journaux/${id}/`, APP_BASE_URL).href;
  } catch { /* ignore */ }
  return `journaux/${id}/`;
}

function renderSourceFollowBar(container, { name } = {}) {
  if (!container) return;
  const api = store();
  if (!api || !name) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  container.hidden = false;
  container.replaceChildren();
  const cluster = document.createElement('div');
  cluster.className = 'media-follow-bar__cluster';
  cluster.appendChild(createFollowButton({ name, lang: pageLang() }));
  const fiche = ficheHref(name);
  if (fiche) {
    const link = document.createElement('a');
    link.className = 'media-follow-bar__fiche';
    link.href = fiche;
    link.textContent = pageLang() === 'en' ? 'Media profile' : 'Fiche du média';
    cluster.appendChild(link);
  }
  container.appendChild(cluster);
}

if (store() && typeof store().subscribe === 'function') {
  store().subscribe(() => syncAll());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindFollowButtons(document), { once: true });
  } else {
    bindFollowButtons(document);
  }
}

const api = {
  FOLLOWED_FILTER,
  bindFollowButtons,
  syncAll,
  createFollowButton,
  followButtonHtml,
  renderSourceFollowBar,
  ficheHref,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (global) global.MediaFollowUI = api;
}(typeof globalThis === 'object' ? globalThis : this));

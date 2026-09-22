/**
 * Fiche web minimale : même identifiant que l’application, sans le site complet.
 * noindex. Le lien canonique de l’article reste celui de la publication.
 */
'use strict';

(function initArticlePage() {
  const core = window.RadarMobile;
  const root = document.getElementById('fiche');

  function esc(value) {
    return core.escapeHtml(value == null ? '' : value);
  }

  function show(html) {
    root.innerHTML = html;
  }

  const id = new URLSearchParams(location.search).get('id') || '';

  fetch('../news.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('fil');
      return response.json();
    })
    .then((data) => {
      const article = core.findById(data && data.items, id);
      if (!article) {
        show(`<h1>Fiche introuvable</h1>
          <p>Cet identifiant n’est pas dans le fil publié en ce moment.</p>
          <p><a href="../">Retour à LE-RADAR</a></p>`);
        return;
      }
      const action = core.publisherAction(article);
      const when = article.date
        ? `<p class="card-meta"><time datetime="${esc(article.date)}">${esc(article.date.slice(0, 10))}</time>${article.author ? ` · ${esc(article.author)}` : ''}</p>`
        : '';
      const image = article.image
        ? `<img class="card-photo" src="${esc(article.image)}" alt="${esc(article.source ? `Illustration publiée par ${article.source}` : 'Illustration')}" width="640" height="427">`
        : '';
      document.title = `${article.title} — fiche LE-RADAR`;
      show(`<article class="fiche">
        <p class="card-source"><span>${esc(article.source)}</span></p>
        <h1>${esc(article.title)}</h1>
        ${when}
        ${image}
        ${article.excerpt ? `<p class="excerpt">${esc(article.excerpt)}</p>` : ''}
        <p class="attribution">Cet article est publié par ${esc(article.source || 'la publication d’origine')}. LE-RADAR ne le reproduit pas.</p>
        <a class="wide primary" href="${esc(action.url)}" target="_blank" rel="noopener noreferrer">${esc(action.label)}</a>
        <p><a href="../">Tout le fil sur le-radar.ca</a></p>
      </article>`);
    })
    .catch(() => {
      show('<h1>Fiche indisponible</h1><p>Le fil n’a pas pu être chargé.</p>');
    });
}());

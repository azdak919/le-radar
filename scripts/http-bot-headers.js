/**
 * Identité honnête du robot pour les pages d'articles, les flux et les images.
 * On se présente comme LE-RADAR, avec une adresse et un contact — jamais
 * comme un navigateur (pas de signature Chrome/Firefox). Un serveur qui
 * exige un User-Agent (Cloudflare 406 sans en-tête, The Concordian) reçoit
 * cette identité ; un vrai blocage n'est pas contourné.
 */
const BOT_USER_AGENT = 'LE-RADAR-NewsBot/1.0 (https://le-radar.ca; azdak-qc@proton.me)';

/** Accept habituel d'une navigation HTML, pas un Accept de flux RSS en premier. */
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';

const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7';

function htmlHeaders() {
  return { 'User-Agent': BOT_USER_AGENT, Accept: HTML_ACCEPT };
}

function imageHeaders() {
  return { 'User-Agent': BOT_USER_AGENT, Accept: IMAGE_ACCEPT };
}

function feedHeaders() {
  return { 'User-Agent': BOT_USER_AGENT, Accept: FEED_ACCEPT };
}

module.exports = {
  BOT_USER_AGENT,
  HTML_ACCEPT,
  IMAGE_ACCEPT,
  FEED_ACCEPT,
  htmlHeaders,
  imageHeaders,
  feedHeaders,
};

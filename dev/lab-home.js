/**
 * Lien « Tableau de bord » sur les outils locaux (hors /dev/ lui-même).
 */
(function () {
  const h = location.hostname;
  if (h !== '127.0.0.1' && h !== 'localhost' && h !== '[::1]') return;
  const path = (location.pathname || '').replace(/\/+$/, '') || '/';
  if (path === '/dev' || path === '/dev/index.html') return;
  if (new URLSearchParams(location.search).get('labFrame') === '1') return;
  if (document.getElementById('local-lab-home') || document.querySelector('.hub-link')) return;

  const a = document.createElement('a');
  a.id = 'local-lab-home';
  a.href = '/dev/';
  a.textContent = 'Tableau de bord';
  a.style.cssText = [
    'position:fixed',
    'z-index:10002',
    'top:10px',
    'left:10px',
    'padding:7px 12px',
    'border-radius:999px',
    'border:1px solid rgba(255,255,255,0.16)',
    'background:rgba(18,20,24,0.94)',
    'color:#f1f2f4',
    'font:600 12px/1.2 Inter,system-ui,sans-serif',
    'text-decoration:none',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
  ].join(';');
  const mount = () => {
    if (!document.body || document.getElementById('local-lab-home')) return;
    document.body.appendChild(a);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

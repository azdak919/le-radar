// Carrousels d'une revue (revues/<id>/), produits par scripts/revue/revue-pdfs.mjs : PDF « document » pour LinkedIn,
// pages en images 4:5 pour Facebook (plusieurs photos) et Instagram (carrousel à glisser).
// La revue est une publication distincte de La une (décision de Charles, 26 nov. 2026) : ces fonctions ne servent
// qu'à une publication « revue » à part entière, jamais à remplacer l'image de La une.
/** Carrousel LinkedIn d'une revue (« 2026-11-25:soir » → revues/2026-11-25-soir/), s'il est en ligne. */
export async function linkedinCarousel(slotKey, { fetchImpl = fetch } = {}) {
  const id = String(slotKey || '').replace(':', '-');
  if (!/^\d{4}-\d{2}-\d{2}-(matin|soir)$/.test(id)) return null;
  const base = `https://le-radar.ca/revues/${id}/`;
  const url = `${base}le-radar-revue-${id}-linkedin.pdf`, thumbnailUrl = `${base}linkedin-cover.jpg`;
  try {
    const [a, b] = await Promise.all([url, thumbnailUrl].map((u) => fetchImpl(u, { method: 'HEAD', signal: AbortSignal.timeout(15000) })));
    if (!a.ok || !b.ok) return null;
  } catch { return null; }
  const [day, ed] = [id.slice(0, 10), id.slice(11)];
  const d = new Date(`${day}T12:00:00Z`);
  const date = new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return { url, thumbnailUrl, title: `${ed === 'soir' ? 'La revue du soir' : 'La revue du matin'} du Radar · ${date}` };
}

/**
 * Carrousel Facebook / Instagram : les pages du carrousel LinkedIn d'une revue, en images 4:5
 * (revues/<id>/carrousel-<n>.jpg, liste et textes alternatifs dans carrousel.json). null s'il n'est pas en ligne :
 * rien n'est publié.
 */
export async function revueCarousel(slotKey, { fetchImpl = fetch } = {}) {
  const id = String(slotKey || '').replace(':', '-');
  if (!/^\d{4}-\d{2}-\d{2}-(matin|soir)$/.test(id)) return null;
  const base = `https://le-radar.ca/revues/${id}/`;
  try {
    const r = await fetchImpl(`${base}carrousel.json`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const pages = ((await r.json())?.pages || []).filter((p) => /^carrousel-\d+\.jpg$/.test(p?.file || '')).slice(0, 10);
    if (pages.length < 2) return null;
    const heads = await Promise.all(pages.map((p) => fetchImpl(base + p.file, { method: 'HEAD', signal: AbortSignal.timeout(15000) })));
    if (heads.some((h) => !h.ok)) return null;
    return pages.map((p) => ({ url: base + p.file, alt: String(p.alt || '') }));
  } catch { return null; }
}

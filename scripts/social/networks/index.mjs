// Un module par réseau Buffer (x, facebook, linkedin, threads) : règles de format, de rythme et
// d'heures de pointe. data/social/buffer-pages.json ne garde que l'opérationnel (canal, compte,
// interrupteur, mise en service, lien).
import x from './x.mjs';
import facebook from './facebook.mjs';
import linkedin from './linkedin.mjs';
import threads from './threads.mjs';

export const NETWORKS = { x, facebook, linkedin, threads };

/** Réglages complets d'une Page Buffer : règles du module, puis l'opérationnel de buffer-pages.json. */
export function pageConfig(net, json = {}) {
  const m = NETWORKS[net] || {};
  const { windows, sources, label, metadata, dailySlots, ...rules } = m;
  return { ...rules, ...(json[net] || {}) };
}

/** Plafonds de hashtags des modules (prioritaires sur policy.json). */
export const moduleHashtags = () => Object.fromEntries(Object.entries(NETWORKS).map(([k, v]) => [k, v.hashtags]));

/** Heures de pointe des modules (fusionnées avec data/social/posting-windows.json). */
export const moduleWindows = () => Object.fromEntries(Object.entries(NETWORKS).map(([k, v]) => [k, v.windows]));

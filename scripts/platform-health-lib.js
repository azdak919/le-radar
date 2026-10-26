'use strict';
/**
 * Santé de la plateforme (ce que les bots ne peuvent pas réparer seuls) :
 * taille du dépôt, certificat HTTPS Pages, PR Dependabot bloquées,
 * workflows désactivés, versions Node/actions en fin de vie.
 * Pur : reçoit des faits, rend { problems, body }.
 */
const REPO_WARN_MB = 3000;   // GitHub : 5 Go = limite dure pratique.
const CERT_WARN_DAYS = 21;   // Pages renouvelle ~30 j avant ; 21 j = renouvellement en panne.
const PR_STALE_DAYS = 30;

function evaluate(facts, now = Date.now()) {
  const problems = [];
  const day = 86400000;
  if (Number(facts.repoSizeMb) > REPO_WARN_MB) {
    problems.push(`Dépôt à ${Math.round(facts.repoSizeMb)} Mo (seuil ${REPO_WARN_MB} Mo, limite GitHub ~5 Go).`);
  }
  const pages = facts.pages || {};
  if (pages.status && !['built', 'building'].includes(pages.status)) problems.push(`GitHub Pages : statut « ${pages.status} ».`);
  const cert = pages.https_certificate || {};
  if (cert.state && cert.state !== 'approved') problems.push(`Certificat HTTPS : état « ${cert.state} ».`);
  if (cert.expires_at) {
    const left = Math.floor((Date.parse(cert.expires_at) - now) / day);
    if (left < CERT_WARN_DAYS) problems.push(`Certificat HTTPS expire dans ${left} j (${cert.expires_at}) : renouvellement automatique en panne ? Vérifier le DNS du domaine.`);
  }
  if (pages.https_enforced === false) problems.push('HTTPS non forcé sur Pages.');
  for (const pr of facts.dependabotPrs || []) {
    const age = Math.floor((now - Date.parse(pr.createdAt)) / day);
    if (age >= PR_STALE_DAYS) problems.push(`PR Dependabot #${pr.number} ouverte depuis ${age} j : « ${pr.title} » (majeure ou tests rouges).`);
  }
  for (const wf of facts.workflows || []) {
    if (wf.state && wf.state !== 'active') problems.push(`Workflow « ${wf.name} » : ${wf.state}.`);
  }
  for (const w of facts.deprecations || []) problems.push(`Avertissement CI : ${w}`);
  return problems;
}

function renderBody(problems, at = new Date().toISOString()) {
  return [
    `Mis à jour automatiquement par platform-health.yml — ${at}.`,
    'Cette issue se ferme seule quand tout est réglé.',
    '',
    '## Problèmes',
    ...(problems.length ? problems.map((p) => `- ${p}`) : ['- aucun']),
    '',
  ].join('\n');
}

module.exports = { evaluate, renderBody, REPO_WARN_MB, CERT_WARN_DAYS, PR_STALE_DAYS };

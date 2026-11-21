#!/usr/bin/env bash
# Gate locale des bots qui touchent le site (HTML / SEO / app) avant commit sur main.
# Objectif : échouer dans le job bot plutôt qu’envoyer un mail Vérification
# après un commit cassé.
#
# Usage (workflow) :
#   bash scripts/bot-prepush-check.sh
#   bash scripts/bot-prepush-check.sh --full   # + Playwright (plus lent)
#
# - défaut : npm run check (syntaxe + unitaires + intégrité données)
# - --full  : npm test (check + navigateur) — réservé aux jobs rares / maintenances
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mode=check
if [[ "${1:-}" == "--full" ]]; then
  mode=full
fi

if [[ ! -f package.json ]]; then
  echo "bot-prepush-check: package.json introuvable" >&2
  exit 1
fi

# Install minimal si le job n’a pas encore fait npm ci (bots Node seuls).
if [[ ! -d node_modules ]]; then
  echo "bot-prepush-check: npm ci…"
  npm ci --omit=optional
fi

# Bascule du lundi : régénère « Semaine du … » des pages SEO avant
# static-integrity (sinon tout bot échoue jusqu’au passage horaires radio).
node scripts/seo-week-freshness.js --refresh

log="$(mktemp)"
set +e
if [[ "$mode" == "full" ]]; then
  echo "bot-prepush-check: npm test (full, Playwright)…"
  npx playwright install chromium 2>/dev/null || true
  npm test >"$log" 2>&1
else
  echo "bot-prepush-check: npm run check…"
  npm run check >"$log" 2>&1
fi
code=$?
set -e
cat "$log"
if [[ "$code" -ne 0 ]]; then
  # Sur Actions, un contrôle rouge ne pousse rien et n’envoie pas un courriel
  # à chaque cron : une seule issue, les fichiers générés sont abandonnés.
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    key="contrôle ${GITHUB_WORKFLOW:-bots}"
    node scripts/source-incident.js --state open --key "$key" --body-file "$log" || true
    rm -f "$log"
    git reset --hard HEAD
    git clean -fd -e node_modules -e .npm
    echo "bot-prepush-check: échec consigné, dernières données conservées"
    exit 0
  fi
  rm -f "$log"
  exit "$code"
fi
rm -f "$log"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  node scripts/source-incident.js --state close --key "contrôle ${GITHUB_WORKFLOW:-bots}" || true
fi

echo "bot-prepush-check: OK ($mode)"

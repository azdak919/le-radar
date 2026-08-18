#!/usr/bin/env bash
# Gate locale des bots qui touchent le site (HTML / SEO / app) avant push main.
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

if [[ "$mode" == "full" ]]; then
  echo "bot-prepush-check: npm test (full, Playwright)…"
  npx playwright install chromium 2>/dev/null || true
  npm test
else
  echo "bot-prepush-check: npm run check…"
  npm run check
fi

echo "bot-prepush-check: OK ($mode)"

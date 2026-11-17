#!/usr/bin/env bash
# Exemples hors dépôt de « La revue du matin » et « La revue du soir » à partir des données du dépôt (ou de --news …) :
# jour = jour de Montréal de la dernière collecte (news.json updated). Matin : à 10 h 15 (fin de la fenêtre de secours) ;
# soir : à 19 h 15 si la collecte est postérieure, sinon à l'heure de la collecte. Puis captures et PDF.
# Usage : bash scripts/revue/revue-sample.sh DOSSIER
set -euo pipefail
OUT="${1:-revue-sample}"
rm -rf "$OUT"; mkdir -p "$OUT"
read -r DAY HHMM < <(node -e '
const u = Date.parse(require("./news.json").updated);
const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(u)).map(x=>[x.type,x.value]));
console.log(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`);')
SOIR_AT="19:15"; [[ "$HHMM" < "19:15" ]] && SOIR_AT="$HHMM"
node scripts/revue/revue-run.mjs --sample --edition matin --day "$DAY" --at 10:15 --out "$OUT" | tee "$OUT/journal-matin.txt"
node scripts/revue/revue-run.mjs --sample --edition soir --day "$DAY" --at "$SOIR_AT" --out "$OUT" | tee "$OUT/journal-soir.txt"
if [ -s "$OUT/data/revue/index.json" ]; then node scripts/revue/revue-screenshots.mjs --sample "$OUT" --out "$OUT/captures"; fi

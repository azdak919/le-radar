#!/usr/bin/env bash
# Exemples hors dépôt de « La revue du matin » et « La revue du soir » à partir des données du dépôt (ou de --news …) :
# jour = jour de Montréal de la dernière collecte (news.json updated). Matin : à 7 h (heure de publication ; 10 h 15 si la nuit est vide) ;
# soir : à 19 h 15 si la collecte est postérieure, sinon à l'heure de la collecte. Puis captures et PDF d'impression
# (Letter, Legal, Tabloid, A4, A3).
# Usage : bash scripts/revue/revue-sample.sh DOSSIER
set -euo pipefail
OUT="${1:-revue-sample}"
rm -rf "$OUT"; mkdir -p "$OUT"
read -r DAY HHMM < <(node -e '
const u = Date.parse(require("./news.json").updated);
const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(u)).map(x=>[x.type,x.value]));
console.log(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`);')
SOIR_AT="19:15"; [[ "$HHMM" < "19:15" ]] && SOIR_AT="$HHMM"
node scripts/revue/revue-run.mjs --sample --edition matin --day "$DAY" --at 07:00 --out "$OUT" | tee "$OUT/journal-matin.txt"
# Nuit sans article (dimanche soir, par ex.) : l'exemple prend le déclenchement de secours de 10 h 15.
if grep -q "sautée" "$OUT/journal-matin.txt"; then node scripts/revue/revue-run.mjs --sample --edition matin --day "$DAY" --at 10:15 --out "$OUT" | tee -a "$OUT/journal-matin.txt"; fi
node scripts/revue/revue-run.mjs --sample --edition soir --day "$DAY" --at "$SOIR_AT" --out "$OUT" | tee "$OUT/journal-soir.txt"
if [ -s "$OUT/data/revue/index.json" ]; then node scripts/revue/revue-screenshots.mjs --sample "$OUT" --out "$OUT/captures"; fi

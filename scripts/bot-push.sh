#!/usr/bin/env bash
# Publication commune des bots (remplace `pull --rebase -X theirs` + 3 essais).
#
#   scripts/bot-push.sh [--verify "cmd"] [--regen "cmd"] [--redo "cmd"]
#
# - Rebase NORMAL sur origin/main : on n'écrase jamais en silence le travail
#   d'un autre bot (`-X theirs` gardait la version du bot qui poussait).
# - Conflit sur un fichier GÉNÉRÉ (HTML, sitemaps, llms.txt, feed.xml, pages
#   d'entités) : on prend la version de main, on finit le rebase, puis on
#   relance --regen pour reproduire l'artefact à partir des données fusionnées.
# - Conflit sur un fichier de données : abandon du rebase, nouvel essai
#   (les écrivains sont sérialisés par le groupe `data-writers`, donc c'est
#   en pratique un push humain concurrent).
#   Avec --redo, on repart de main (reset) et on relance la commande, qui
#   doit refaire la collecte et créer le commit : la donnée la plus fraîche
#   gagne sans effacer celle de l'autre bot.
# - Les fichiers modifiés mais non commités (rapports, caches) sont mis de
#   côté pendant le pull puis restaurés : plus d'autostash qui échoue.
# - --verify tourne après chaque rebase réussi, avant le push.
set -uo pipefail
VERIFY=""; REGEN=""; REDO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verify) VERIFY="$2"; shift 2 ;;
    --regen) REGEN="$2"; shift 2 ;;
    --redo) REDO="$2"; shift 2 ;;
    *) echo "bot-push: option inconnue $1" >&2; exit 2 ;;
  esac
done
BRANCH="${GITHUB_REF_NAME:-main}"
GENERATED_RE='^(index\.html|sitemap\.xml|sitemap-archives\.xml|llms\.txt|feed\.xml|(radios|journaux|etablissements|medias|horaires|en|archives|sports)/.*)$'
TRIES="${BOT_PUSH_TRIES:-5}"

in_rebase() { local g; g="$(git rev-parse --git-dir)"; [ -d "$g/rebase-merge" ] || [ -d "$g/rebase-apply" ]; }

STASHED=false
if [ -n "$(git status --porcelain)" ]; then
  git stash push --include-untracked -q -m bot-push && STASHED=true
fi
restore() { if $STASHED; then git stash pop -q 2>/dev/null || { git checkout -q -- . 2>/dev/null; git stash drop -q 2>/dev/null; }; fi; }
trap restore EXIT

for i in $(seq 1 "$TRIES"); do
  NEED_REGEN=false
  if ! git pull -q --rebase --no-autostash origin "$BRANCH"; then
    ok=true
    while in_rebase; do
      mapfile -t conflicted < <(git diff --name-only --diff-filter=U)
      [ ${#conflicted[@]} -eq 0 ] && { GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { ok=false; break; }; continue; }
      for f in "${conflicted[@]}"; do
        if [[ "$f" =~ $GENERATED_RE ]]; then
          # Pendant un rebase, « ours » = main : on part de main et on régénère.
          git checkout -q --ours -- "$f" 2>/dev/null || git rm -q -- "$f"
          git add -- "$f" 2>/dev/null || true
          NEED_REGEN=true
        else
          echo "::warning::conflit sur une donnée ($f) : nouvel essai sans écraser"
          ok=false
        fi
      done
      $ok || break
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || in_rebase || { ok=false; break; }
    done
    if ! $ok; then
      git rebase --abort 2>/dev/null || true
      if [ -n "$REDO" ]; then
        echo "Conflit de données : on repart de main et on refait ($REDO)"
        git fetch -q origin "$BRANCH" && git reset -q --hard "origin/${BRANCH}"
        bash -c "$REDO" || { echo "::error::--redo a échoué"; exit 1; }
        if [ "$(git rev-list --count "origin/${BRANCH}..HEAD")" = "0" ]; then echo "Rien à publier après --redo."; exit 0; fi
        continue
      fi
      echo "essai $i : rebase impossible, nouvel essai…"
      sleep $((i * 5)); continue
    fi
  fi
  if $NEED_REGEN; then
    if [ -n "$REGEN" ]; then
      echo "Conflit sur des fichiers générés : régénération ($REGEN)"
      bash -c "$REGEN" || { echo "::error::régénération échouée"; exit 1; }
      for g in index.html sitemap.xml sitemap-archives.xml llms.txt feed.xml radios journaux etablissements medias horaires en archives sports; do [ -e "$g" ] && git add -A -- "$g"; done
      git commit -q -m "bot: régénère les artefacts après rebase (auto)" || true
    else
      echo "::notice::fichiers générés repris de main (pas de --regen pour ce bot)"
    fi
  fi
  if [ -n "$VERIFY" ] && ! bash -c "$VERIFY"; then
    echo "::error::vérification avant push échouée"; exit 1
  fi
  if git push -q origin "HEAD:${BRANCH}"; then echo "Publié (essai $i)."; exit 0; fi
  echo "essai $i : push refusé, nouvel essai…"; sleep $((i * 5))
done
echo "::error::publication impossible après $TRIES essais"
exit 1

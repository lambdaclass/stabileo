#!/usr/bin/env bash
# run-engine.sh <engine> <write|review> <workdir> <prompt-file> <out-file>: runs one model engine
# non-interactively and logs which one ran. write = the engine may edit files in <workdir>;
# review = read-only, the prompt carries everything. DRY_RUN=1 prints the command instead.
. "$(dirname "$0")/common.sh"
engine=$1; mode=$2; dir=$3; prompt=$4; out=$5
case "$engine:$mode" in
  claude:write) cmd=(claude -p --permission-mode auto) ; input=stdin ;;
  codex:write)  cmd=(codex exec -s workspace-write --skip-git-repo-check -C "$dir" -) ; input=stdin ;;
  codex:review) cmd=(codex exec --skip-git-repo-check -C "$dir" -) ; input=stdin ;;
  kimi:write)   cmd=(kimi --auto -p "$(head -c 125000 "$prompt")") ; input=none ;;
  kimi:review)  cmd=(kimi -p "$(head -c 125000 "$prompt")") ; input=none ;;
  grok:write)   echo "run-engine: grok never writes code (review only)" >&2; exit 2 ;;
  grok:review)  cmd=(grok --permission-mode plan -p "Read the file $prompt with your file tool: it is a complete request. Do exactly what it asks. Do not run shell commands; read only that file.") ; input=none ;;
  *) echo "run-engine: no engine for $engine:$mode" >&2; exit 2 ;;
esac
log "engine $engine ($mode) in $dir -> $out"
if [ "${DRY_RUN:-0}" = 1 ]; then
  shown=(); for a in "${cmd[@]}"; do [ ${#a} -gt 60 ] && a="${a:0:57}..."; shown+=("$a"); done
  printf 'DRY_RUN: (cd %s && %s%s > %s)\n' "$dir" "${shown[*]}" "$([ $input = stdin ] && echo " < $prompt")" "$out"
  exit 0
fi
cd "$dir" || exit 1
if [ "$input" = stdin ]; then timeout 3600 "${cmd[@]}" < "$prompt" > "$out" 2> "$out.err"; else timeout 3600 "${cmd[@]}" < /dev/null > "$out" 2> "$out.err"; fi
rc=$?; log "engine $engine ($mode) exit $rc, $(wc -l < "$out") lines"; exit $rc

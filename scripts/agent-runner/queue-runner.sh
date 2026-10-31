#!/usr/bin/env bash
# queue-runner.sh [--once]: runs queued research/review jobs unattended, so they continue while the
# interactive Claude session is paused (e.g. at a 429). Jobs: $Q/jobs/pending/<name>.job, shell
# assignments: TYPE=fixpaper|review|review-chunked|review-paper  ARG=<id or PR>  SCOPE=research|tools|review|docs|engine|safety|app
# optional ENGINE=<force one engine, e.g. kimi for an owed Kimi review>, AUTHOR_ENGINE=<who wrote it>.
# Engine, safety and app jobs only run on claude (they still need two reviews before main).
# Exit 75 from a job = no engine available now: it stays pending. One instance at a time (flock).
. "$(dirname "$0")/common.sh"
J=$Q/jobs; mkdir -p "$J/pending" "$J/running" "$J/done" "$J/failed"
exec 9> "$J/.lock"; flock -n 9 || { echo "queue-runner: already running"; exit 0; }
run_one() {
  local f=$1 name TYPE ARG SCOPE ENGINE AUTHOR_ENGINE mode engine rc
  name=$(basename "$f" .job); TYPE= ARG= SCOPE=research ENGINE= AUTHOR_ENGINE=claude
  . "$f"
  case "$TYPE" in fixpaper) mode=write ;; *) mode=review ;; esac
  if [ -n "$ENGINE" ]; then engine=$ENGINE; else engine=$(pick_engine "$mode" "$( [ $mode = review ] && echo "$AUTHOR_ENGINE")"); fi
  [ "$engine" != none ] || { log "queue: $name waits (no $mode engine)"; return; }
  [ "$mode:$engine" != write:grok ] || { log "queue: $name: grok never writes code, job refused"; mv "$f" "$J/failed/"; return; }
  scope_allows "$engine" "$SCOPE" || { log "queue: $name ($SCOPE) waits for claude"; return; }
  [ -n "$ENGINE" ] && { python3 "$ST/bin/engines.py" status 2>/dev/null | grep -qE "^$mode +$ENGINE +yes" || [ -n "${STABILEO_FORCE_ENGINE:-}" ] || { log "queue: $name waits for $ENGINE"; return; }; }
  mv "$f" "$J/running/"; log "queue: $name start ($TYPE $ARG, $SCOPE, $engine)"
  case "$TYPE" in
    fixpaper) ENGINE=$engine SCOPE=$SCOPE "$ST/bin/fixpaper.sh" "$ARG" ;;
    review) STABILEO_FORCE_ENGINE=${ENGINE:-} AUTHOR_ENGINE=$AUTHOR_ENGINE "$ST/bin/review-diff.sh" "$ARG" ;;
    review-chunked) STABILEO_FORCE_ENGINE=${ENGINE:-} AUTHOR_ENGINE=$AUTHOR_ENGINE "$ST/bin/review-chunked.sh" "$ARG" ;;
    review-paper) STABILEO_FORCE_ENGINE=${ENGINE:-} AUTHOR_ENGINE=$AUTHOR_ENGINE "$ST/bin/review-paper.sh" "$ARG" ;;
    *) log "queue: $name unknown TYPE $TYPE"; false ;;
  esac
  rc=$?
  if [ $rc = 75 ]; then mv "$J/running/$name.job" "$J/pending/"; log "queue: $name back to pending (no engine)";
  elif [ $rc = 0 ]; then mv "$J/running/$name.job" "$J/done/"; log "queue: $name done ($engine)";
  else mv "$J/running/$name.job" "$J/failed/"; log "queue: $name failed rc=$rc ($engine)"; fi
}
while :; do
  for f in "$J"/pending/*.job; do [ -e "$f" ] && run_one "$f"; done
  [ "${1:-}" = --once ] && break
  sleep 600
done

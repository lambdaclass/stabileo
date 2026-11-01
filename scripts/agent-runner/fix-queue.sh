#!/usr/bin/env bash
# fix-queue.sh: runs fixpaper.sh for every id in $Q/papers.txt (one per line), MAX at a time.
# Each id moves to papers.running, then papers.done ("<id> <exit>").
. "$(dirname "$0")/common.sh"
MAX=${MAX:-4}
touch "$Q/papers.txt" "$Q/papers.running" "$Q/papers.done"
while :; do
  running=$(grep -c . "$Q/papers.running")
  next=$(head -1 "$Q/papers.txt")
  if [ -z "$next" ]; then [ "$running" -eq 0 ] && break; sleep 30; continue; fi
  if [ "$running" -ge "$MAX" ]; then sleep 30; continue; fi
  sed -i 1d "$Q/papers.txt"; echo "$next" >> "$Q/papers.running"
  ( "$(dirname "$0")/fixpaper.sh" "$next"; rc=$?
    sed -i "/^$next\$/d" "$Q/papers.running"; echo "$next $rc $(date +%H:%M)" >> "$Q/papers.done" ) &
  sleep 20
done
wait
log "fix-queue: empty"

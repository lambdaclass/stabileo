#!/usr/bin/env bash
# Run Kani harnesses one at a time under a memory and time watchdog.
#
# CBMC bit-blasts every f64 op; a harness with many symbolic floats can need tens
# of GB, and `cargo kani -j` running several at once has taken a 128 GB machine
# down. This script never runs harnesses concurrently and kills a harness whose
# process tree exceeds the limits, recording it as MEM/TIME instead.
#
# Usage (inside `nix develop .#verify`, from anywhere in the repo):
#   scripts/kani-safe.sh                       # all harnesses
#   scripts/kani-safe.sh truss_ dense_         # harnesses whose name contains a filter
# Env: KANI_TIER (default all; "fast" skips harnesses marked `// kani: nightly`
#      on a line above their #[kani::proof]), KANI_MEM_GB (default 12), KANI_TIMEOUT_S (default 900),
#      KANI_REPORT (default target/kani-report.tsv), KANI_TARGET_DIR (default target/agent-kani),
#      KANI_EXTRA_ARGS (extra cargo-kani arguments, e.g.
#      "-Z concrete-playback --concrete-playback=print" to print counterexamples).
# Exit status is non-zero if any harness did not finish with SUCCESSFUL.
set -uo pipefail

root=$(git rev-parse --show-toplevel)
mem_kb=$(( ${KANI_MEM_GB:-12} * 1024 * 1024 ))
timeout_s=${KANI_TIMEOUT_S:-900}
report=${KANI_REPORT:-$root/target/kani-report.tsv}
case $report in /*) ;; *) report=$PWD/$report ;; esac
src=$root/engine/src/kani_proofs.rs
logdir=$root/target/kani-logs
target_dir=${KANI_TARGET_DIR:-$root/target/agent-kani}
mkdir -p "$logdir" "$(dirname "$report")"

tier=${KANI_TIER:-all}
harnesses=$(awk -v tier="$tier" '
	/^\/\/ kani: nightly/ { slow = 1; next }
	/#\[kani::proof\]/ { p = 1; next }
	p && /fn [a-z_0-9]+/ {
		match($0, /fn [a-z_0-9]+/)
		if (!(tier == "fast" && slow)) print substr($0, RSTART + 3, RLENGTH - 3)
		p = 0; slow = 0
	}
	/^}/ { if (!p) slow = 0 }' "$src")
if [ $# -gt 0 ]; then
	harnesses=$(for h in $harnesses; do for f in "$@"; do case $h in *"$f"*) echo "$h"; break;; esac; done; done)
fi

# Sum RSS (KB) over a process and all its descendants.
tree_rss() {
	ps -A -o pid=,ppid=,rss= | awk -v root="$1" '
		{ parent[$1] = $2; rss[$1] = $3 }
		END {
			for (p in parent) {
				q = p
				while (q != "" && q != root && q != 1 && q != 0) q = parent[q]
				if (q == root) total += rss[p]
			}
			print total + 0
		}'
}

kill_tree() {
	local pids
	pids=$(ps -A -o pid=,ppid= | awk -v root="$1" '
		{ parent[$1] = $2 }
		END { for (p in parent) { q = p; while (q != "" && q != root && q != 1 && q != 0) q = parent[q]; if (q == root) print p } }')
	kill -KILL $pids 2>/dev/null
}

# Run from the workspace root: engine/.cargo/config.toml enables build-std for
# WASM, which breaks Kani (it would rebuild `core` against its own sysroot).
cd "$root" || exit 1
printf 'harness\tstatus\tseconds\tpeak_gb\n' > "$report"
failed=0
shown=
for h in $harnesses; do
	log=$logdir/$h.log
	start=$(date +%s)
	# The nix shell points DEVELOPER_DIR/SDKROOT at its Apple SDK, which breaks the
	# /usr/bin/gcc xcrun shim that goto-cc uses for preprocessing on macOS.
	env -u DEVELOPER_DIR -u SDKROOT cargo kani -p dedaliano-engine -Z stubbing --target-dir "$target_dir" --harness "kani_proofs::$h" --exact ${KANI_EXTRA_ARGS:-} > "$log" 2>&1 &
	pid=$!
	peak=0
	status=
	while kill -0 "$pid" 2>/dev/null; do
		rss=$(tree_rss "$pid")
		[ "$rss" -gt "$peak" ] && peak=$rss
		if [ "$rss" -gt "$mem_kb" ]; then status=MEM; kill_tree "$pid"; kill -KILL "$pid" 2>/dev/null; break; fi
		if [ $(( $(date +%s) - start )) -gt "$timeout_s" ]; then status=TIME; kill_tree "$pid"; kill -KILL "$pid" 2>/dev/null; break; fi
		sleep 1
	done
	wait "$pid" 2>/dev/null
	if [ -z "$status" ]; then
		if grep -q "VERIFICATION:- SUCCESSFUL" "$log"; then status=OK; else status=FAIL; fi
	fi
	secs=$(( $(date +%s) - start ))
	gb=$(awk -v k="$peak" 'BEGIN { printf "%.1f", k / 1048576 }')
	printf '%s\t%s\t%s\t%s\n' "$h" "$status" "$secs" "$gb" | tee -a "$report"
	if [ "$status" != OK ]; then
		failed=1
		# Show why, once per run: a setup error fails every harness the same way.
		[ -n "$shown" ] || { tail -n 30 "$log" | sed 's/^/    /'; shown=1; }
	fi
done
echo "report: $report  logs: $logdir"
exit $failed

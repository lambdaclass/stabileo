set -u
area=/root/audit/soundness-2026-11-11
for endpoint in repo base; do
cd "$area/$endpoint"
python3 "$area/instrument.py"
python3 "$area/instrument-lib.py"
export AUDIT_NATIVE_OUT="$area/$endpoint-native-isolated"
for filter in benchmarks::reduction_benchmark:: benchmarks::shell_benchmark::research_cylinder research_benchmarks::macneal_trapezoidal research_benchmarks::macneal_parallelogram research_benchmarks::buckling_818_exact_reference; do
ignored=()
if test "$filter" != benchmarks::reduction_benchmark::; then ignored=(--ignored); fi
nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked --release -p dedaliano-engine --test validation "$filter" -- --nocapture --test-threads=1 "${ignored[@]}" > "$area/$endpoint-finish-${filter//:/_}.log" 2>&1
printf '%s %s status=%s\n' "$endpoint" "$filter" "$?"
done
done
python3 - <<'PY'
import pathlib,json
area=pathlib.Path('/root/audit/soundness-2026-11-11');target=area/'extra-inputs';target.mkdir(exist_ok=True)
for endpoint in ['base','repo']:
 for p in (area/f'{endpoint}-native-isolated').glob('*.json'):
  if (area/'fixed-inputs'/p.name).exists():continue
  d=json.loads(p.read_text());d.pop('result',None);(target/p.name).write_text(json.dumps(d))
print('extra frozen models',len(list(target.glob('*.json'))),flush=True)
PY
unset AUDIT_NATIVE_OUT
for endpoint in repo base; do
cd "$area/$endpoint"
AUDIT_FIXED_FROM="$area/extra-inputs" AUDIT_FIXED_TO="$area/$endpoint-fixed-native" nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked --release -p dedaliano-engine --lib unrefused_oracles::audit_capture_lib::audit_replay_fixed_corpus -- --nocapture --test-threads=1 > "$area/$endpoint-extra-replay.log" 2>&1
printf '%s extra frozen replay status=%s\n' "$endpoint" "$?"
done
nice -n 19 nix develop --command python3 "$area/compare.py" native
nice -n 19 nix develop --command python3 "$area/summarize-native.py"

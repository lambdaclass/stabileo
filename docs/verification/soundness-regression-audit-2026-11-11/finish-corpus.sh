set -euo pipefail
area=/root/audit/soundness-2026-11-11
for endpoint in repo base; do
cd "$area/$endpoint"
python3 "$area/audit_evidence.py" check-replay "$area/fixed-inputs" "$area/$endpoint-fixed-native"
python3 "$area/instrument.py"
python3 "$area/instrument-lib.py"
git diff --exit-code -- engine/src web/src/lib/engine
export AUDIT_NATIVE_OUT
AUDIT_NATIVE_OUT=$(mktemp -d "$area/$endpoint-native-XXXXXX")
printf '%s\n' "$AUDIT_NATIVE_OUT" > "$area/$endpoint-current-capture"
for filter in benchmarks::reduction_benchmark:: benchmarks::shell_benchmark::research_cylinder research_benchmarks::macneal_trapezoidal research_benchmarks::macneal_parallelogram research_benchmarks::buckling_818_exact_reference; do
ignored=()
if test "$filter" != benchmarks::reduction_benchmark::; then ignored=(--ignored); fi
status=0
nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked --release -p dedaliano-engine --test validation "$filter" -- --nocapture --test-threads=1 "${ignored[@]}" > "$area/$endpoint-finish-${filter//:/_}.log" 2>&1 || status=$?
python3 "$area/audit_evidence.py" check-suite "$area/$endpoint-finish-${filter//:/_}.log" "$status" --allow-failures
printf '%s %s status=%s\n' "$endpoint" "$filter" "${status:-0}"
done
done
python3 - <<'PY'
import pathlib,json
area=pathlib.Path('/root/audit/soundness-2026-11-11');target=area/'extra-inputs';target.mkdir(exist_ok=True)
assert not list(target.glob('*.json')), 'input manifest must start empty'
for endpoint in ['base','repo']:
 capture=pathlib.Path((area/f'{endpoint}-current-capture').read_text().strip())
 for p in capture.glob('*.json'):
  d=json.loads(p.read_text());d.pop('result',None)
  existing=area/'fixed-inputs'/p.name
  if existing.exists():
   previous=json.loads(existing.read_text());assert previous['analysis']==d['analysis'] and previous['input']==d['input'], f'input identity collision: {p.name}'
   continue
  destination=target/p.name
  if destination.exists():
   previous=json.loads(destination.read_text());assert previous['analysis']==d['analysis'] and previous['input']==d['input'], f'input identity collision: {p.name}'
  destination.write_text(json.dumps(d))
print('extra frozen models',len(list(target.glob('*.json'))),flush=True)
PY
unset AUDIT_NATIVE_OUT
for endpoint in repo base; do
cd "$area/$endpoint"
replay_target=$(mktemp -d "$area/extra-$endpoint-XXXXXX")
AUDIT_FIXED_FROM="$area/extra-inputs" AUDIT_FIXED_TO="$replay_target" nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked --release -p dedaliano-engine --lib unrefused_oracles::audit_capture_lib::audit_replay_fixed_corpus -- --nocapture --test-threads=1 > "$area/$endpoint-extra-replay.log" 2>&1
python3 "$area/audit_evidence.py" check-suite "$area/$endpoint-extra-replay.log" 0
python3 "$area/audit_evidence.py" check-replay "$area/extra-inputs" "$replay_target"
cp "$replay_target"/*.json "$area/$endpoint-fixed-native/"
python3 "$area/audit_evidence.py" check-replay "$area/fixed-inputs" "$area/$endpoint-fixed-native" --additional "$area/extra-inputs"
printf '%s extra frozen replay status=%s\n' "$endpoint" "${status:-0}"
done
nice -n 19 nix develop --command python3 "$area/compare.py" native
nice -n 19 nix develop --command python3 "$area/summarize-native.py"

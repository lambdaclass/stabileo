set -u
area=/root/audit/soundness-2026-11-11
for endpoint in repo base; do
cd "$area/$endpoint"
python3 "$area/instrument.py"
python3 "$area/instrument-lib.py"
git diff --exit-code -- engine/src web/src/lib/engine
export AUDIT_NATIVE_OUT="$area/$endpoint-native-isolated"
for binary_filter in 'gates acceptance::' 'validation benchmarks::' 'validation benchmark_protocol::' 'validation three_d::corotational_benchmarks' 'validation three_d::buckling_benchmarks' 'validation research_benchmarks::' 'validation navier_plate::' 'integration newmark_1959::' 'integration plastic_collapse_benchmark::' 'solver cqc_1981::' 'solver dadeppo_arch::' 'solver lee_frame::' 'shells macneal_harder::' 'lib unrefused_oracles::constraints_benchmark::' 'lib unrefused_oracles::neal_plastic_extended::' 'lib unrefused_oracles::plastic_collapse::' 'lib unrefused_oracles::plastic_collapse_extended::' 'lib unrefused_oracles::plastic_mechanisms::'; do
read -r binary filter <<< "$binary_filter"
args=(--test "$binary")
if test "$binary" = lib; then args=(--lib); fi
nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked -p dedaliano-engine --release "${args[@]}" "$filter" -- --nocapture --test-threads=1 > "$area/$endpoint-complete-$binary-${filter//:/_}.log" 2>&1
printf '%s %s %s status=%s\n' "$endpoint" "$binary" "$filter" "$?"
done
done
python3 - <<'PY'
import pathlib,json
area=pathlib.Path('/root/audit/soundness-2026-11-11')
target=area/'fixed-inputs'
target.mkdir(exist_ok=True)
for endpoint in ['base','repo']:
 for p in (area/f'{endpoint}-native-isolated').glob('*.json'):
  d=json.loads(p.read_text());d.pop('result',None)
  (target/p.name).write_text(json.dumps(d))
print('union models',len(list(target.glob('*.json'))),flush=True)
PY
unset AUDIT_NATIVE_OUT
for endpoint in repo base; do
cd "$area/$endpoint"
AUDIT_FIXED_FROM="$area/fixed-inputs" AUDIT_FIXED_TO="$area/$endpoint-fixed-native" nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked -p dedaliano-engine --release --lib unrefused_oracles::audit_capture_lib::audit_replay_fixed_corpus -- --nocapture --test-threads=1 > "$area/$endpoint-fixed-replay.log" 2>&1
printf '%s frozen replay status=%s\n' "$endpoint" "$?"
done
nice -n 19 nix develop --command python3 "$area/compare.py" native

set -euo pipefail
area=/root/audit/soundness-2026-11-11
for endpoint in repo base; do
cd "$area/$endpoint"
test ! -e "$area/$endpoint-fixed-native"
mkdir "$area/$endpoint-fixed-native"
python3 "$area/instrument.py"
python3 "$area/instrument-lib.py"
git diff --exit-code -- engine/src web/src/lib/engine
export AUDIT_NATIVE_OUT
AUDIT_NATIVE_OUT=$(mktemp -d "$area/$endpoint-native-XXXXXX")
printf '%s\n' "$AUDIT_NATIVE_OUT" > "$area/$endpoint-current-capture"
for binary_filter in 'gates acceptance::' 'validation benchmarks::' 'validation benchmark_protocol::' 'validation three_d::three_d_corotational::' 'validation three_d::three_d_buckling::' 'validation research_benchmarks::' 'validation navier_plate::' 'integration newmark_1959::' 'integration plastic_collapse_benchmark::' 'solver cqc_1981::' 'solver dadeppo_arch::' 'solver lee_frame::' 'shells macneal_harder::' 'lib unrefused_oracles::constraints_benchmark::' 'lib unrefused_oracles::neal_plastic_extended::' 'lib unrefused_oracles::plastic_collapse::' 'lib unrefused_oracles::plastic_collapse_extended::' 'lib unrefused_oracles::plastic_mechanisms::'; do
read -r binary filter <<< "$binary_filter"
args=(--test "$binary")
if test "$binary" = lib; then args=(--lib); fi
status=0
nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked -p dedaliano-engine --release "${args[@]}" "$filter" -- --nocapture --test-threads=1 > "$area/$endpoint-complete-$binary-${filter//:/_}.log" 2>&1 || status=$?
python3 "$area/audit_evidence.py" check-suite "$area/$endpoint-complete-$binary-${filter//:/_}.log" "$status" --allow-failures
printf '%s %s %s status=%s\n' "$endpoint" "$binary" "$filter" "${status:-0}"
done
done
python3 - <<'PY'
import pathlib,json,sys
sys.path.insert(0, "/root/audit/soundness-2026-11-11")
from audit_evidence import merge_input_records
area=pathlib.Path('/root/audit/soundness-2026-11-11')
target=area/'fixed-inputs'
target.mkdir(exist_ok=True)
assert not list(target.glob('*.json')), 'input manifest must start empty'
for endpoint in ['base','repo']:
 capture=pathlib.Path((area/f'{endpoint}-current-capture').read_text().strip())
 for p in capture.glob('*.json'):
  d=json.loads(p.read_text());d.pop('result',None)
  destination=target/p.name
  if destination.exists():
   d=merge_input_records(json.loads(destination.read_text()),d)
  destination.write_text(json.dumps(d))
print('union models',len(list(target.glob('*.json'))),flush=True)
PY
unset AUDIT_NATIVE_OUT
for endpoint in repo base; do
cd "$area/$endpoint"
replay_target=$(mktemp -d "$area/fixed-$endpoint-XXXXXX")
AUDIT_FIXED_FROM="$area/fixed-inputs" AUDIT_FIXED_TO="$replay_target" nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-$endpoint" RUSTC_WRAPPER= cargo test --locked -p dedaliano-engine --release --lib unrefused_oracles::audit_capture_lib::audit_replay_fixed_corpus -- --nocapture --test-threads=1 > "$area/$endpoint-fixed-replay.log" 2>&1
python3 "$area/audit_evidence.py" check-suite "$area/$endpoint-fixed-replay.log" 0
python3 "$area/audit_evidence.py" check-replay "$area/fixed-inputs" "$replay_target"
cp "$replay_target"/*.json "$area/$endpoint-fixed-native/"
printf '%s frozen replay status=0\n' "$endpoint"
done
nice -n 19 nix develop --command python3 "$area/compare.py" native

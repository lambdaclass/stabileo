set -euo pipefail

version=$(awk '/^name = "wasm-bindgen"$/ { getline; gsub(/"/, "", $3); print $3 }' Cargo.lock)
find_runner() {
    local candidate
    for candidate in wasm-bindgen-test-runner "${XDG_CACHE_HOME:-$HOME/.cache}"/.wasm-pack/wasm-bindgen-*/wasm-bindgen-test-runner; do
        if command -v "$candidate" >/dev/null && [ "$("$candidate" --version)" = "wasm-bindgen-test-runner $version" ]; then
            command -v "$candidate"
            return
        fi
    done
    return 1
}

mkdir -p target
audit_dir=$(mktemp -d "$PWD/target/candidate-1901.XXXXXXXX")
trap 'rm -r -- "$audit_dir"' EXIT
if ! runner=$(find_runner); then
    (cd engine && wasm-pack build --target nodejs --no-opt --out-dir "$audit_dir/wasm")
    runner=$(find_runner)
fi

CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER="$runner" cargo test --locked -p dedaliano-engine \
    --lib --release --target wasm32-unknown-unknown audit_candidate_1901_rejected_iterates -- --nocapture \
    | awk -v iterates="$audit_dir/iterates.json" '
        sub(/^[[:space:]]*CANDIDATE_1901_AUDIT /, "") { print > iterates; next }
        { print }
    '
python3 testing/docs/audits/candidate-1901-audit.py "$audit_dir/iterates.json"

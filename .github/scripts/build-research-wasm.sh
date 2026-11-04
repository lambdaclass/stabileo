#!/usr/bin/env bash
set -uo pipefail
declare -A script=(
  [shauer-2025]=research/fracture/shauer-2025/wasm/build.sh
  [andreassen-2011]=research/optimization/andreassen-2011/wasm/build.sh
  [biggins-2026]=research/mechanics/biggins-2026/build.sh
  [grossman-2026]=research/metamaterials/grossman-2026/wasm/build.sh
  [pastrana-2026]=research/form-finding/pastrana-2026/wasm/build.sh
  [fairclough-2026]=research/optimisation/fairclough-2026/wasm/build.sh
)
declare -A manifests=(
  [shauer-2025]="research/fracture/shauer-2025/wasm/Cargo.toml research/fracture/shauer-2025/Cargo.toml"
  [andreassen-2011]=research/optimization/andreassen-2011/wasm/Cargo.toml
  [biggins-2026]=research/mechanics/biggins-2026/Cargo.toml
  [grossman-2026]=research/metamaterials/grossman-2026/wasm/Cargo.toml
  [pastrana-2026]=research/form-finding/pastrana-2026/wasm/Cargo.toml
  [fairclough-2026]=research/optimisation/fairclough-2026/Cargo.toml
)
if [[ ${1:-} == --list ]]; then
  for name in "${!script[@]}"; do echo "$name ${script[$name]} ${manifests[$name]}"; done | sort
  exit 0
fi
for name in "$@"; do
  [[ -n ${script[$name]:-} ]] || { echo "unknown research bundle: $name" >&2; exit 2; }
done
for name in "$@"; do
  for manifest in ${manifests[$name]}; do
    .github/scripts/retry-infra.sh ${BUILD_PREFIX:-nix develop --command} cargo fetch --locked --manifest-path "$manifest" || exit 1
  done
done
logs=$(mktemp -d)
trap 'rm -rf "$logs"' EXIT
declare -A pid
for name in "$@"; do
  target=${CARGO_TARGET_DIR:+$CARGO_TARGET_DIR/research-$name}
  ${BUILD_PREFIX:-nix develop --command} env RUSTC_WRAPPER= SCCACHE_DISABLE=1 ${target:+CARGO_TARGET_DIR=$target} "${script[$name]}" > "$logs/$name.log" 2>&1 &
  pid[$name]=$!
done
status=0
for name in "$@"; do
  if wait "${pid[$name]}"; then result=ok; else result=FAILED; status=1; fi
  echo "::group::$name ($result)"
  cat "$logs/$name.log"
  echo "::endgroup::"
  [[ $result == ok ]] || echo "::error title=Research WASM::$name failed to build (log above)"
done
exit "$status"

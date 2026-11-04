#!/usr/bin/env bash
# The tests most likely affected by what you changed, and nothing else: a fast local loop.
#
#   scripts/test-changed.sh              your branch against origin/main, uncommitted work included
#   scripts/test-changed.sh --dry-run    the plan only
#
# It is a guess, made in the open: it prints what it runs and what it skips, and why. CI runs
# everything; this is for knowing in a minute what CI would tell you in twenty.
#
#   web/        `vitest related` on the changed files (the unit project): every unit test that
#               imports one of them, directly or not. A change to a module half the app imports
#               runs most of the suite (~2 min); a leaf runs a handful (~15 s).
#   engine/     the engine's library unit tests when engine/src changed; each integration target
#               (engine/tests/<name>.rs or <name>/) whose own files changed; and the targets
#               whose name contains the changed source file's name (src/element/shell.rs ->
#               *shell*), at most six. The other ~100 targets are not run: `make test-engine`.
#   backend/    `cargo test -p dedaliano-backend`.
#
# Options (the pre-push hook uses the last three):
#   --base REV     compare against REV instead of `git merge-base origin/main HEAD`
#   --dry-run      print the plan, run nothing
#   --head REV     the changes in BASE..REV only, without uncommitted work
#   --web-only     web tests only: skip the engine and the backend
#   --typecheck    also `npm run typecheck` when web files changed
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
ARGS=("$@")

base=""
head=""
dry=0
web_only=0
typecheck=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base=$2; shift 2 ;;
    --head) head=$2; shift 2 ;;
    --dry-run) dry=1; shift ;;
    --web-only) web_only=1; shift ;;
    --typecheck) typecheck=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
    *) echo "test-changed: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done

# Outside `nix develop`, re-enter through the flake (a few seconds), which pins node and rust:
# the hook runs from whatever shell `git push` was typed in, and the node on PATH there can be
# another major (Homebrew's 26 on one machine here, against the project's 22).
if [ "$dry" = 0 ] && [ -z "${IN_NIX_SHELL:-}" ] && [ -z "${TEST_CHANGED_IN_NIX:-}" ] && command -v nix >/dev/null 2>&1; then
  TEST_CHANGED_IN_NIX=1 exec nix develop "$ROOT" --command "$0" ${ARGS[@]+"${ARGS[@]}"}
fi
if [ "$dry" = 0 ] && ! command -v npx >/dev/null 2>&1; then
  echo "test-changed: node is not on PATH (run inside \`nix develop\`)" >&2
  exit 2
fi

if [ -z "$base" ]; then
  if ! git rev-parse --verify --quiet origin/main >/dev/null; then
    echo "test-changed: no origin/main to compare against (git fetch origin, or pass --base)" >&2
    exit 2
  fi
  base=$(git merge-base origin/main "${head:-HEAD}")
fi

# Changed files that still exist: committed since the base, plus (without --head) staged,
# unstaged and untracked work. Deleted files have nothing left to test; what imported them
# fails to compile, which the typecheck and the related tests of their importers catch.
if [ -n "$head" ]; then
  changed=$(git diff --name-only --diff-filter=d "$base" "$head")
  deleted=$(git diff --name-only --diff-filter=D "$base" "$head")
else
  changed=$( { git diff --name-only --diff-filter=d "$base"; git ls-files --others --exclude-standard; } | sort -u)
  deleted=$(git diff --name-only --diff-filter=D "$base")
fi

echo "test-changed: $(printf '%s\n' "$changed" | grep -c . || true) changed file(s) since $(git rev-parse --short "$base")${head:+ up to $(git rev-parse --short "$head")}"
[ -n "$deleted" ] && echo "  deleted (nothing to run for them): $(echo "$deleted" | wc -l | tr -d ' ') file(s)"

web_related=()
web_config=()
e2e_specs=()
engine_src=()
engine_targets=()
engine_other=()
backend=0
other=()

target_exists() { [ -f "engine/tests/$1.rs" ] || [ -f "engine/tests/$1/main.rs" ]; }
add_target() {
  local t
  for t in "${engine_targets[@]+"${engine_targets[@]}"}"; do [ "$t" = "$1" ] && return; done
  engine_targets+=("$1")
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    web/e2e/*.spec.ts) e2e_specs+=("$f") ;;
    web/e2e/*) other+=("$f") ;;
    web/package.json|web/package-lock.json|web/vite.config.ts|web/vitest.setup.ts|web/tsconfig*.json|web/svelte.config.js)
      web_config+=("$f") ;;
    web/*.ts|web/*.js|web/*.mjs|web/*.cjs|web/*.svelte|web/*.json) web_related+=("${f#web/}") ;;
    engine/src/*) engine_src+=("$f") ;;
    engine/tests/*)
      rest=${f#engine/tests/}
      name=${rest%%/*}
      name=${name%.rs}
      if target_exists "$name"; then add_target "$name"; else engine_other+=("$f (shared by several test targets)"); fi ;;
    engine/*) engine_other+=("$f") ;;
    backend/*) backend=1 ;;
    *) other+=("$f") ;;
  esac
done <<< "$changed"

# Integration targets named after a changed source file: src/element/shell.rs -> *shell*,
# src/certify/mod.rs -> *certify*. A guess, so few of them, and never the wall-clock gates
# (they run single-threaded in CI and mean nothing on a busy laptop).
guessed=()
if [ "${#engine_src[@]}" -gt 0 ]; then
  all_targets=$( { ls engine/tests/*.rs 2>/dev/null | sed 's#.*/##; s#\.rs$##'; ls engine/tests/*/main.rs 2>/dev/null | sed 's#engine/tests/##; s#/main.rs$##'; } | sort -u)
  for f in "${engine_src[@]}"; do
    stem=$(basename "$f" .rs)
    [ "$stem" = mod ] || [ "$stem" = lib ] && stem=$(basename "$(dirname "$f")")
    [ "${#stem}" -lt 4 ] && continue
    while IFS= read -r t; do
      [ -z "$t" ] && continue
      case "$t" in perf_*|bench_*) continue ;; esac
      [ "${#guessed[@]}" -ge 6 ] && break
      skip=0
      for g in "${guessed[@]+"${guessed[@]}"}" "${engine_targets[@]+"${engine_targets[@]}"}"; do [ "$g" = "$t" ] && skip=1; done
      [ "$skip" = 0 ] && guessed+=("$t")
    done <<< "$(printf '%s\n' "$all_targets" | grep -F -- "$stem" || true)"
  done
fi

plan=()     # descriptions, for the summary
failed=()

run() {     # run <label> <dir> <command...>
  local label=$1 dir=$2
  shift 2
  echo
  echo "▶ $label"
  echo "  (cd $dir && $*)"
  [ "$dry" = 1 ] && return 0
  local t0=$SECONDS
  if (cd "$dir" && "$@"); then
    plan+=("ok    $label ($((SECONDS - t0)) s)")
  else
    plan+=("FAIL  $label ($((SECONDS - t0)) s)")
    failed+=("$label")
  fi
}

skipped=()

# A deleted web module leaves its importers broken, and `vitest related` cannot start from a
# file that is gone: the typecheck is what sees it.
web_deleted=$(printf '%s\n' "$deleted" | grep -E '^web/.*\.(ts|js|mjs|cjs|svelte|json)$' | grep -v '^web/e2e/' || true)

# ── web ───────────────────────────────────────────────────────────────
if [ "${#web_related[@]}" -gt 0 ] || [ "${#web_config[@]}" -gt 0 ] || [ -n "$web_deleted" ]; then
  if [ ! -d web/node_modules ]; then
    echo "test-changed: web/node_modules is missing (cd web && npm ci)" >&2
    exit 2
  fi
  if [ "$typecheck" = 1 ]; then
    run "web: typecheck (no new errors against the baseline)" web npm run --silent typecheck
  fi
fi
if [ "${#web_related[@]}" -gt 0 ]; then
  run "web: unit tests related to ${#web_related[@]} changed file(s)" web \
    npx vitest related "${web_related[@]}" --run --project unit --passWithNoTests
fi
if [ -n "$web_deleted" ]; then
  [ "$typecheck" = 0 ] && skipped+=("$(echo "$web_deleted" | wc -l | tr -d ' ') web file(s) deleted: their importers are checked by \`cd web && npm run typecheck\` (the pre-push hook runs it)")
  skipped+=("web file(s) deleted: no related tests can start from a deleted file; the whole unit pass is \`cd web && npm run test:unit\`")
fi
[ "${#web_config[@]}" -gt 0 ] && skipped+=("web config changed (${web_config[*]}): related tests cannot see a config change; the whole unit pass is \`cd web && npm run test:unit\`")
[ "${#e2e_specs[@]}" -gt 0 ] && skipped+=("e2e specs (Playwright, slow): cd web && npx playwright test ${e2e_specs[*]#web/}")

# ── engine and backend ────────────────────────────────────────────────
if [ "$web_only" = 1 ]; then
  [ "${#engine_src[@]}" -gt 0 ] || [ "${#engine_targets[@]}" -gt 0 ] && skipped+=("engine changes: --web-only (scripts/test-changed.sh runs them)")
  [ "$backend" = 1 ] && skipped+=("backend changes: --web-only")
else
  if cargo nextest --version >/dev/null 2>&1; then nextest=1; else nextest=0; fi
  rust_tests() {  # rust_tests <label> <cargo selection args...>
    local label=$1
    shift
    if [ "$nextest" = 1 ]; then
      run "$label" engine cargo nextest run -p dedaliano-engine --no-fail-fast "$@"
    else
      run "$label" engine cargo test -p dedaliano-engine --no-fail-fast "$@"
    fi
  }
  if [ "${#engine_src[@]}" -gt 0 ]; then
    rust_tests "engine: library unit tests (${#engine_src[@]} source file(s) changed)" --lib
    skipped+=("engine: the web runs the WASM build in web/src/lib/wasm; \`make wasm\` before testing the web against this engine change")
  fi
  targets=("${engine_targets[@]+"${engine_targets[@]}"}" "${guessed[@]+"${guessed[@]}"}")
  if [ "${#engine_targets[@]}" -gt 0 ] || [ "${#guessed[@]}" -gt 0 ]; then
    args=()
    for t in "${targets[@]}"; do [ -n "$t" ] && args+=(--test "$t"); done
    label="engine: integration targets"
    [ "${#engine_targets[@]}" -gt 0 ] && label+=" changed: ${engine_targets[*]};"
    [ "${#guessed[@]}" -gt 0 ] && label+=" named after changed sources (a guess): ${guessed[*]}"
    rust_tests "$label" "${args[@]}"
  fi
  if [ "${#engine_src[@]}" -gt 0 ] || [ "${#engine_targets[@]}" -gt 0 ]; then
    skipped+=("engine: every other integration target (make test-engine, or CI)")
  fi
  [ "$backend" = 1 ] && run "backend: cargo test" . cargo test -p dedaliano-backend
fi
for f in "${engine_other[@]+"${engine_other[@]}"}"; do skipped+=("engine file not mapped to a test target: $f"); done
[ "${#other[@]}" -gt 0 ] && skipped+=("${#other[@]} file(s) outside web/, engine/, backend/ code: no tests chosen for them")

# ── summary ───────────────────────────────────────────────────────────
echo
echo "── test-changed summary ──"
[ "$dry" = 1 ] && echo "(dry run: nothing was run)"
for p in "${plan[@]+"${plan[@]}"}"; do echo "  $p"; done
[ "${#plan[@]}" -eq 0 ] && [ "$dry" = 0 ] && echo "  nothing to run"
for s in "${skipped[@]+"${skipped[@]}"}"; do echo "  skipped: $s"; done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "test-changed: ${#failed[@]} step(s) failed" >&2
  exit 1
fi

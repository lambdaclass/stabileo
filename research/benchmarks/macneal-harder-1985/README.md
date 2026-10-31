# MacNeal–Harder production-engine evidence

The native test and browser/WASM runner read
`engine/tests/benchmarks/macneal_harder.json`. All 12 cases remain:
eight accuracy passes (strict relative error below 2%), two numeric failures
(distorted out-of-plane meshes), and two expected containment refusals
(distorted in-plane meshes). Refusals are **not** accuracy passes.

The two `expectedRefusal` entries require known issue **#798** and diagnostic
**SH-MITC4-DISTORTION**. Native checks validate the structured containment error.
The WASM parity check requires the refusal message, issue number, diagnostic ID,
null value/error and false accuracy pass in both native and browser results.
Unexpected exceptions or a successful solve in a refusal case fail verification.
Other cases retain their measurements, tolerances, native bounds and numeric
native/WASM parity checks unchanged.

The live page displays “withheld by the engine (known issue #798)” with no
computed displacement or error for these two cases. Its accuracy denominator
stays 12. Reference values remain visible as references, not engine results.
The current committed measurements are in
`engine/tests/benchmarks/KNOWN_ISSUES.md#mh-mitc4-distortion`; the old in-plane
numbers are replaced with withheld outcomes. There is no committed JSON result
snapshot for this benchmark.

## Reproduce

`.github/workflows/ci.yml` invokes the reusable `research.yml` workflow, whose
`engine-benchmarks` job is named “Production engine benchmarks (native and WASM)”.
After dependency installation and `make wasm`, its MacNeal–Harder commands are:

```sh
export CARGO_TARGET_DIR=/private/tmp/claude-501/codex-807mh-target
export CARGO_BUILD_JOBS=4
MACNEAL_HARDER_RESULTS=/tmp/macneal-native.json nix develop -c cargo test --locked --manifest-path engine/Cargo.toml --test shells macneal_harder::browser_cases
nix develop -c node research/benchmarks/macneal-harder-1985/wasm/check.mjs /tmp/macneal-native.json
nix develop -c sh -c 'cd web && npx vitest run src/components/research/macneal1985/__tests__/cases.test.ts'
```

The same job also runs Mattiasson and Shell Obstacle Course native/WASM checks
and their related Vitest files.

## Local verification (2026-10-30)

Used the supplied engine/research WASM builds and installed dependencies.
Nix startup was denied by the filesystem sandbox (cache lock, then daemon
socket); the underlying commands ran directly with the exports above.
Research source edits changed the asset identity, so the existing asset
publisher refreshed the generated research manifest/replay identity.

- MacNeal–Harder native case test: passed.
- Production WASM/native parity: passed for all 12 outcomes.
- MacNeal–Harder Vitest: 7 passed.
- Mattiasson Vitest: 4 passed.
- Shell Obstacle Course Vitest: 3 passed, 2 failed because its existing numeric
  expectations encounter a separate #798 containment refusal. Those other
  benchmark expectations are unchanged.
- Mattiasson native corotational regression: 13 passed; fresh native result
  generator and production WASM parity also passed.
- Full Svelte check: 342 errors and 262 warnings elsewhere in the repository;
  no errors in the MacNeal–Harder, Mattiasson or Shell Obstacle Course directories.
- Compared the shared JSON against HEAD after removing only the two new
  expectation fields: all inputs, references, bounds, tolerances and cases match.
- Shell native filters: roof 2 passed, cylinder 2 passed, hemisphere 1 passed.
  The first attempt hit a shared-target Cargo artifact mismatch after building
  the separate Mattiasson workspace; cleaning only this run's engine release
  artifacts and rerunning sequentially resolved it.
- Shell WASM parity still fails: `hemisphere-4.json` is absent. The existing
  native hemisphere test asserts containment for meshes 4/8/16 and does not
  export result rows, while its WASM checker still expects numeric JSON files.
  Together with the two Shell Vitest failures above, this remains a separate
  blocker for the full production-engine benchmark job.

No Git write commands were used. No numerical tolerances were loosened and no
cases were removed.

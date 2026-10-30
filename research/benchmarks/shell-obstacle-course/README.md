# Shell obstacle course

Route: `/research/benchmarks/shell-obstacle-course`.

Belytschko et al. (1985), *Stress projection for membrane and shear locking in shell
finite elements*, CMAME 51, 221–258, DOI 10.1016/0045-7825(85)90035-0. Citation metadata
verified through `research/tools/catalog.py show`; numerical paper tables were not
checked, so the catalogue remains **proposed**. No paper summary is inferred from its title.

The page runs the production MITC4 WASM wrapper against engine-owned
`engine/tests/benchmarks/shell_obstacle_course.json`. Inputs were serialized from the
existing validation builders before replacing those builders with a shared-file reader;
test bodies and every assertion are preserved. There is no research solver.

The roof uses reference 0.3024, the diaphragm cylinder 1.8248e-5, and the NAFEMS-labelled
18°-hole hemisphere 0.185 under quarter loads ±2. The separate solid-shell hemisphere
uses ±1 and 0.094; it stays native-only. See the page and engine findings ledger for
boundary conditions, source test names, numerical failures and unresolved provenance.

The headline counts only the finest selected meshes, with the existing benchmark-page
policy of strict relative error below 2%. The 16×16 cap bounds each model to 289 nodes. Cylinder 12×12 and 16×16 extend the
existing geometry and restraints without adding or changing historical assertions. The native
fixture reader evaluates every shared input once, then returns the requested measurement
to each unchanged test. This workload cap is not a measured browser capacity limit.
Native regression bounds remain independent. The viewer uses the shared scalar-field
viewer with an explicit isometric projection and true 3D displacement magnitudes.
Open in Stabileo preserves all six per-node restraint flags through custom3d supports.

Run from `engine/` (use a fresh output directory):

```sh
SHELL_OBSTACLE_RESULTS=/tmp/shell-native nix develop .. -c cargo test --locked --release --test validation benchmark_scordelis_lo
SHELL_OBSTACLE_RESULTS=/tmp/shell-native nix develop .. -c cargo test --locked --release --test validation benchmark_pinched_cylinder
SHELL_OBSTACLE_RESULTS=/tmp/shell-native nix develop .. -c cargo test --locked --release --test validation benchmark_hemisphere_hole_convergence
nix develop .. -c cargo test --locked --release --test shells solid_shell_locking
```

From the repository root, after `make wasm`:

```sh
nix develop -c node research/benchmarks/shell-obstacle-course/wasm/check.mjs /tmp/shell-native
research/tools/check_isolation.sh
python3 -I research/tools/catalog.py check --offline
nix develop -c make typecheck.web
```

From `web/`:

```sh
nix develop .. -c npx vitest run src/components/research/shell1985/__tests__/cases.test.ts
```

The e2e spec is `web/e2e/research-shell-obstacle-course.spec.ts`. Chromium was not launched
for this work. There are no imported research result artifacts: the live page reads the
engine test case file and computes fresh results. All model views use the shared viewer.

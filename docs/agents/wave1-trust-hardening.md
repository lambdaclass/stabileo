# Wave 1 — Trust & Contract Hardening Agent Prompts

These are self-contained prompts for coding agents. Each can be run independently.

## Launch Order

1. **Agent C + Agent B** (immediate, parallel) — highest payoff, fastest to verify
2. **Agent A** (after C+B land) — needs more care in generator design
3. **Agent D** (after A lands) — heaviest, wants convention gates in place first so it doesn't normalize wrong assumptions

---

## Agent A: Solver Property-Based Invariant Tests

### Prompt

```
You are adding property-based invariant tests to the Dedaliano structural analysis engine (Rust).
The engine is at engine/ in this repo. Tests go in engine/tests/property/.

There is no proptest dependency. Write parameterized tests using standard Rust #[test] with helper
functions that generate varied inputs. Look at engine/tests/property/differential_fuzz.rs and
engine/tests/sparse_shell_gates.rs for existing patterns.

The solver entry points are:
- 2D: engine/src/solver/linear.rs — solve_2d(input: &SolverInput2D) -> SolverOutput2D
- 3D: engine/src/solver/linear.rs — solve_3d(input: &SolverInput3D) -> SolverOutput3D
- Types: engine/src/types/input.rs, engine/src/types/output.rs
- Assembly: engine/src/solver/assembly.rs — builds K and F

Write a new file engine/tests/property/solver_invariants.rs with these invariant tests:

1. **Equilibrium preservation**: For any solved model, sum of reaction forces must equal sum of
   applied loads (within tolerance). Test on: cantilever, simply supported beam, 2-span continuous
   beam, portal frame. Both 2D and 3D. Tolerance: 1e-6 relative.

2. **Stiffness matrix symmetry**: For any assembled K matrix, K[i][j] == K[j][i] within machine
   epsilon. Test on: single frame element, multi-element frame, truss, mixed frame+truss. Extract
   K from assembly before solve.

3. **Stiffness matrix positive-definiteness**: For a well-constrained model, all eigenvalues of
   K_ff (free DOFs) must be positive. Test on: cantilever, fixed-fixed beam, portal frame. Use
   the existing eigenvalue infrastructure in engine/src/linalg/.

4. **Energy bounds**: Strain energy must be non-negative for any solved model. Strain energy =
   0.5 * u^T * K * u. Must also satisfy work-energy theorem: external work = strain energy.
   Test on: loaded cantilever, frame with distributed load.

5. **Rigid body modes**: A free 3D structure (no supports) should have exactly 6 zero eigenvalues.
   A free 2D structure should have exactly 3. Use modal analysis. Tolerance for "zero": < 1e-8
   times the first non-zero eigenvalue.

6. **Zero-load zero-displacement**: A model with no loads but valid supports should produce all-zero
   displacements and reactions. Test 2D and 3D.

Register the new file in engine/tests/property/mod.rs (create if needed).

Run: cd engine && cargo test --test property -- solver_invariants
All tests must pass.
```

### Done criteria
- Tests cover 2D + 3D solver paths
- Each invariant has at least 3 model variations
- All pass with `cargo test`

---

## Agent B: WASM Boundary Fuzz and Parity Tests

### Prompt

```
You are adding WASM serialization boundary tests to the Dedaliano structural analysis web app.
Tests go in web/src/lib/engine/__tests__/. Use vitest (describe/it/expect). Run with:
cd web && npx vitest run <test-file>

The WASM boundary works like this:
- TypeScript builds a SolverInput JSON object
- JSON is serialized and sent to the Rust/WASM solver
- Rust deserializes with serde (camelCase), solves, serializes result back
- TypeScript receives SolverOutput JSON

The solver functions are in:
- web/src/lib/engine/solver-wasm.ts (WASM calls)
- web/src/lib/engine/types-3d.ts (3D types)
- web/src/lib/engine/solver-js.ts (TS fallback solver for 2D)
- web/src/lib/engine/solver-3d.ts (TS fallback solver for 3D)

IMPORTANT: WASM may not be available in vitest. That's fine — test the TS fallback paths with
the same edge-case inputs. The point is to verify the solver doesn't crash on bad input.

Create web/src/lib/engine/__tests__/solver-boundary-robustness.test.ts:

1. **NaN/Inf input handling**: Build valid models then inject NaN or Infinity into:
   - Node coordinates (x, y, z)
   - Material properties (E, nu, rho)
   - Section properties (A, Iz, Iy, J)
   - Load values (fx, fz, my)
   - Spring stiffness values
   The solver should either return an error/empty result or produce finite outputs — never crash
   or hang. Test both 2D (solve()) and 3D (solve3D()) paths.

2. **Zero/degenerate geometry**: Test models with:
   - Zero-length elements (nodeI == nodeJ position)
   - Collinear nodes (all on one line in 3D)
   - Very large coordinates (1e12)
   - Very small coordinates (1e-12)
   - Single-node model with support and load
   Should not crash.

3. **Empty/minimal models**: Test with:
   - No elements, just nodes
   - No loads
   - No supports (should detect mechanism)
   - Single element, no loads
   Should produce meaningful error or empty result, not crash.

4. **Extreme values**: Test with:
   - Very stiff material (E = 1e15) with very flexible (E = 1)
   - Very long element (L = 1e6) with very short (L = 1e-3)
   - Very large load (1e12) on very stiff structure
   Should solve or report instability, not crash or produce NaN.

5. **Field name contract**: Verify that 2D solver output has fields named:
   - displacements: ux, uz, ry (NOT uy, rz)
   - reactions: rx, rz, my (NOT ry, mz for 2D)
   - element forces: nStart, nEnd, vStart, vEnd, mStart, mEnd
   Verify 3D solver output has: ux, uy, uz, rx, ry, rz, nStart, vyStart, vzStart, mxStart,
   myStart, mzStart.

Run: cd web && npx vitest run src/lib/engine/__tests__/solver-boundary-robustness.test.ts
All tests must pass (some may assert "does not throw" or "result is not NaN").
```

### Done criteria
- 20+ test cases covering NaN, Inf, zero, degenerate, empty, extreme inputs
- No crashes on any input
- Field name contract verified for 2D and 3D outputs

---

## Agent C: Coordinate, Mode, and Contract Regression Gates

### Prompt

```
You are adding semantic regression gates to prevent axis convention and mode-handling bugs from
recurring in the Dedaliano web app. These bugs were fixed in April 2026 (commits b09cb48 through
13de93d). The bugs were NOT solver math errors — they were seam bugs where different parts of the
codebase used different conventions for the same concept.

Tests go in web/src/lib/engine/__tests__/. Use vitest. Run with:
cd web && npx vitest run <test-file>

Read web/src/lib/engine/__tests__/zup-field-names.test.ts for the existing gate pattern. It uses
readFileSync to inspect source code and imports pure functions where possible.

IMPORTANT: Some files import Svelte stores which use $state runes not available in vitest.
For those, use readFileSync to inspect source code strings instead of importing functions.
Pure functions in non-Svelte files (coordinate-system.ts, section-stress-3d.ts, auto-verify.ts)
CAN be imported directly.

Create web/src/lib/engine/__tests__/convention-regression-gates.test.ts with these semantic seams:

─── SEAM 1: Allowed field names by mode ───

Define the canonical field name sets as constants in the test file:

  const FIELDS_2D_DISPLACEMENT = ['ux', 'uz', 'ry'] as const;
  const FIELDS_2D_REACTION = ['rx', 'rz', 'my'] as const;
  const FIELDS_2D_NODAL_LOAD = ['fx', 'fz', 'my'] as const;
  const FIELDS_3D_DISPLACEMENT = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const;
  const FIELDS_3D_ELEMENT_FORCES = ['nStart','nEnd','vyStart','vyEnd','vzStart','vzEnd',
    'mxStart','mxEnd','myStart','myEnd','mzStart','mzEnd'] as const;
  const BANNED_2D_FIELDS = ['uy', 'rz', 'fy', 'mz']; // old Y-up convention

Tests:
- Solve a 2D cantilever (import solve from solver-js.ts). Verify output displacement keys
  are exactly FIELDS_2D_DISPLACEMENT. Verify BANNED_2D_FIELDS do not appear as primary keys.
- Solve a 3D cantilever (import solve3D from solver-3d.ts). Verify element force keys match
  FIELDS_3D_ELEMENT_FORCES.
- Read backend/src/capabilities/actions.rs. Verify AddNodalLoad struct uses 'fz' and 'my' as
  primary serde field names (not 'fy'/'mz' as primary — those should only be aliases).
- Read backend/src/capabilities/generators.rs. Verify add_nodal_load_2d emits "fz" and "my".

─── SEAM 2: Permitted analysis modes and PRO handling ───

Define:
  const MODES_TREATED_AS_3D = ['3d', 'pro'] as const;
  const MODES_TREATED_AS_2D = ['2d', 'edu'] as const;

Tests:
- Import shouldProjectModelToXZ from coordinate-system.ts. For each mode in MODES_TREATED_AS_3D,
  call shouldProjectModelToXZ with that analysisMode and verify it returns false (3D modes must
  NOT be auto-projected to XZ).
- For each mode in MODES_TREATED_AS_2D, call shouldProjectModelToXZ with some 2D-compatible nodes
  and verify it returns true.
- Read file.ts source. Verify isMode3D function body contains both '3d' and 'pro'. Verify it
  does NOT return true for '2d' or 'edu'.
- Read file.ts source. Count occurrences of "analysisMode === '3d'" that are NOT inside isMode3D.
  There should be zero — every 3D check outside the helper definition is a potential PRO-mode miss.
  (Allow the isMode3D definition itself.)
- Read excel.ts source. Verify every 3D-mode branch uses isMode3D, not a raw === '3d' check.

─── SEAM 3: My/Mz axis identity preservation ───

The rule: Mz = strong-axis moment (about Z, vertical), My = weak-axis moment (about Y, horizontal).
Design checks must preserve this identity. Code must NOT sort My and Mz by magnitude and assign
the larger to "strong axis."

Tests:
- Read auto-verify.ts. Verify it contains 'const MuMax = MzMax' (Mu = strong axis = Mz).
  Verify it contains 'const MuyMax = MyMax' (Muy = weak axis = My).
  Verify it does NOT contain 'Math.max(MzMax, MyMax)' or 'Math.min(MzMax, MyMax)'.
- Read ProVerificationTab.svelte. Verify 'MuMax = _mzMax' exists. Verify 'MuyMax = _myMax' exists.
  Verify 'MuMax = Math.max(_mzMax, _myMax)' does NOT exist.
  Verify 'MuzMax = Math.max(_mzM, _myM)' does NOT exist.
- Read ProPanel.svelte. Verify Mu computation uses only mzStart/mzEnd (not myStart/myEnd in
  the same Math.max call).
- Import normalStress3D test or read section-stress-3d.ts source. Verify the Navier formula is:
  sigma += Mz * y / Iz (Mz paired with y and Iz)
  sigma -= My * z / Iy (My paired with z and Iy)
  Verify the OLD swapped formula does NOT exist: 'sigma -= My * y / Iz' or 'sigma += Mz * z / Iy'.
- Read stress-heatmap.ts. Verify the Math.max(my, mz) line has a comment containing "envelope"
  or "intensity" or "visualization" — confirming it is intentional for color intensity, NOT an
  axis assignment.

─── SEAM 4: File persistence and share link contracts ───

Tests:
- Read file.ts. Verify serializeProject writes both 'analysisMode' and 'axisConvention3D' fields.
  Verify loadProject/loadFile reads both fields.
- Read url-sharing.ts. Verify toCompact serializes plates (key 'pl'), quads ('qu'), constraints
  ('cn'). Verify fromCompact handles these keys. This ensures PRO models with plates/quads don't
  lose data in share links.

─── SEAM 5: Locale wording matches code convention ───

Tests:
- Read en.ts and es.ts locale files.
- Verify rotMomentHelp contains 'Mz = M·cos(α)' (strong axis at α=0) — NOT 'My = M·cos(α)'.
- Verify moments3dHelp contains 'My' near 'weak' (en) or 'débil' (es), and 'Mz' near 'strong'
  (en) or 'fuerte' (es).
- Verify forces3dHelp contains 'Vy' paired with 'Mz' and 'Vz' paired with 'My' (shear-moment
  plane correspondence).

─── SEAM 6: Z-up coordinate constants ───

Tests:
- Import from coordinate-system.ts: VERTICAL_AXIS, UP_VECTOR, GRAVITY_VECTOR_3D, GLOBAL_Z.
- Verify VERTICAL_AXIS === 'z'.
- Verify UP_VECTOR equals GLOBAL_Z (both are (0,0,1)).
- Verify GRAVITY_VECTOR_3D is (0,0,-1).
- Import projectNodeToScene. Verify projectNodeToScene({x:3, y:5}, true) returns {x:3, y:0, z:5}
  (2D node Y becomes scene Z).
- Import setCameraUp. Call it on a mock camera object with an up vector. Verify it sets up to
  (0,0,1).

Run: cd web && npx vitest run src/lib/engine/__tests__/convention-regression-gates.test.ts
All tests must pass.
```

### Done criteria
- Each semantic seam (field names, mode handling, My/Mz identity, persistence, locales, Z-up) has its own describe block
- Canonical sets are defined as constants, not scattered magic strings
- Tests encode the RULE, not just grep for wording — e.g., "every === '3d' outside isMode3D is suspicious"
- Backend Rust files are also checked (via readFileSync)
- All tests pass

---

## Agent D: Advanced Solver CI Coverage

### Prompt

```
You are adding CI-grade smoke and parity tests for advanced solver paths in the Dedaliano engine.
Tests go in engine/tests/. Look at engine/tests/sparse_shell_gates.rs for the pattern.

The solver supports these advanced paths (all in engine/src/solver/ or engine/src/linalg/):
- Modal analysis: solve_modal_3d (engine/src/solver/linear.rs or modal paths)
- Buckling: solve_buckling_3d
- Harmonic: solve_harmonic_3d
- Guyan reduction: guyan_reduce_3d (engine/src/solver/reduction.rs or similar)
- Craig-Bampton: craig_bampton_3d
- Constraints: engine/src/solver/constraints.rs (RigidLink, Diaphragm, EqualDOF, etc.)

Also check: engine/src/solver/assembly.rs for sparse assembly, engine/src/linalg/ for sparse
Cholesky and Lanczos.

Create engine/tests/solver_ci_coverage.rs with these test groups:

1. **Modal smoke tests**:
   - Simply supported beam (2D and 3D): first 3 natural frequencies should match analytical
     f_n = (n*pi)^2 * sqrt(EI/(rho*A*L^4)) / (2*pi). Tolerance 1%.
   - Cantilever beam: f_1 = 1.875^2 * sqrt(EI/(rho*A*L^4)) / (2*pi). Tolerance 1%.
   - 3D portal frame: should return 6+ modes without crashing.

2. **Buckling smoke tests**:
   - Euler column (pinned-pinned): P_cr = pi^2 * EI / L^2. Tolerance 1%.
   - Fixed-free column: P_cr = pi^2 * EI / (4*L^2). Tolerance 2%.
   - Verify buckling eigenvalue is positive for compression, solver returns meaningful result.

3. **Sparse vs dense parity**:
   - Build a 3D portal frame, solve with sparse and dense paths.
   - Displacements must match to 1e-10 relative tolerance.
   - Reactions must match to 1e-10.
   - If sparse/dense path selection is automatic, build a model large enough to trigger sparse
     (check sparse_shell_gates.rs for size thresholds).

4. **Deterministic assembly**:
   - Solve the same model twice with identical input.
   - All outputs must be bit-for-bit identical (not just within tolerance — exactly equal).
   - Test with 2D and 3D models.

5. **Constraint system smoke**:
   - Build a 3D frame with a RigidLink constraint. Verify the constrained DOFs track correctly.
   - Build a model with a Diaphragm constraint. Verify all constrained nodes have equal
     in-plane displacements.
   - Build a model with EqualDOF. Verify linked DOFs are equal in the output.
   - None should crash. Results should satisfy equilibrium.

6. **Fill-ratio and no-dense-fallback gates**:
   - Build a 10x10 MITC4 plate model (see sparse_shell_gates.rs for the pattern).
   - Verify sparse path is used (no dense fallback).
   - Verify fill ratio is within bounds (< 10x for this size).
   - Verify 0 Cholesky perturbations.

7. **Tolerance policy by test type** (document as comments):
   - Analytical reference tests: 1% relative tolerance
   - Parity tests (sparse vs dense): 1e-10 relative
   - Determinism tests: exact equality
   - Benchmark-comparison tests: 5% relative (these are looser by design)

Run: cd engine && cargo test --test solver_ci_coverage
All tests must pass.

IMPORTANT: Read the existing test files first to understand how models are built. The test
helpers in engine/tests/common/ or the patterns in sparse_shell_gates.rs show how to construct
SolverInput3D structs. Do NOT guess the API — read the types and existing tests.
```

### Done criteria
- Modal, buckling, sparse parity, determinism, constraint, and fill-ratio tests all exist
- Analytical reference values are cited with formulas
- Tolerance policy is documented in comments
- All pass with `cargo test`

---

## Execution Notes

**Launch order:**
1. **C + B in parallel** (immediate) — C catches convention regressions, B catches boundary crashes. Both are fast, high-payoff, low-risk.
2. **A after C+B land** — property tests need more care in generator design. Having C's gates in place first means A won't accidentally encode wrong assumptions.
3. **D after A lands** — heaviest agent. Wants convention gates and invariant tests in place first so it builds on a trustworthy foundation.

**Why not all parallel:** D (advanced solver CI) could normalize wrong assumptions if the convention gates from C aren't in place yet. A (property tests) could produce noisy false failures without the field-name contracts from C to anchor expectations.

**After all 4 pass, run full suites:**
- `cd engine && cargo test` (expect 5919+ tests)
- `cd web && npx vitest run` (expect 1946+ tests)

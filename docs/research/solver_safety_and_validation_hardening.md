# Solver Safety and Validation Hardening

This note collects the safety and correctness hardening work that should sit around the solver core so the product does not silently return wrong answers, partial results, or fragile payloads.

It is not a replacement for [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/docs/roadmap/SOLVER_ROADMAP.md). It is the implementation-oriented research note behind the roadmap's immediate hardening and trust priorities.

## Why This Matters

The main risk is not only "missing features." It is silent wrongness:

- invalid inputs reaching assembly and producing NaNs or panics
- nonlinear solvers returning partial results without making failure explicit
- post-solve results being returned without equilibrium or residual checks
- fragile result payloads breaking downstream design/report/AI layers
- frontend edits allowing users to create invalid or contradictory models
- test infrastructure reporting green while important checks were skipped

The hardening goal is simple:

- the solver should fail explicitly on invalid or non-physical models
- the solver should surface uncertainty and non-convergence explicitly
- the solver should prove trust with structured diagnostics and verification signals
- the frontend should make it harder for users to create bad models by accident

## Defense Layers

### 1. Frontend mutation guards

The UI should reject or heavily guard:

- non-finite coordinates or properties
- non-positive elastic modulus, area, thickness, or other impossible properties
- invalid Poisson ratio
- deleting nodes/materials/sections still referenced by the model
- creating degenerate elements from the UI
- creating contradictory supports, releases, or constraints

This is not the main correctness layer, but it reduces bad inputs early.

### 2. Pre-solve Rust validation

Before assembly, the Rust solver should validate:

- missing node/material/section/load/constraint references
- duplicate IDs
- zero-length elements
- self-referencing elements
- non-finite input values
- negative or non-physical material/section properties
- invalid shell geometry:
  - repeated shell nodes
  - near-zero area
  - self-intersection
  - negative Jacobian
  - severe distortion / warping
  - non-positive thickness
- invalid or cyclic constraint definitions
- load and combination validity

The solver should reject these with explicit, structured diagnostics instead of panicking or continuing into assembly.

### 3. Nonlinear convergence safeguards

All nonlinear solve paths should share the same expectations:

- detect divergence
- detect stagnation
- reject NaN / Inf propagation immediately
- distinguish:
  - `converged`
  - `not_converged`
  - `diverging`
  - `partial`

The solver should not return normal-looking final results if convergence failed unless that state is explicit in the result contract.

### 4. Post-solve verification

For accepted solves, the solver should verify:

- residual quality (`K u - f`)
- global equilibrium
- constrained-force consistency
- reaction balance
- finite result values

These checks should not live only as loose test helpers. The real solve path should decide which checks are:

- hard errors
- warnings
- debug-only signals

and should do so consistently by solver path.

### 5. Structured diagnostics and provenance

Plain `warnings: Vec<String>` is too weak for the long term.

The preferred direction is a structured diagnostic payload such as:

- `code`
- `severity`
- `message`
- `entity_type`
- `entity_id`
- `phase`
- `combination`
- `details`

This supports:

- UI highlights
- report narratives
- AI explanation
- review comments
- QA/replay workflows

### 6. Solver-run artifacts and reproducibility

Every important failure and suspicious success should be reproducible.

Useful solver-run artifacts include:

- normalized input
- solver path
- ordering
- tolerances
- diagnostics
- residuals
- convergence history
- build SHA / version

This is essential for debugging, QA, and trust.

## Additional Safeguards Worth Making Explicit

### Constraint validation

Constraint validation deserves its own explicit work item:

- missing references
- incompatible master/slave definitions
- cyclic constraints
- contradictory constraints
- invalid MPC equations
- rigid-link / diaphragm / eccentric-link consistency

Constraint errors are especially dangerous because they can make models look stable while producing wrong stiffness and reaction behavior.

### Load and combination validation

Load/combo validation should also be explicit:

- loads on missing entities
- empty combinations
- missing load-case references
- NaN / Inf factors
- incompatible load patterns
- accidental torsion / code-load metadata inconsistencies

This matters for automation and report trust as much as for raw analysis.

### Shell-specific validity and trust

Shell workflows need their own validity rules:

- Jacobian sign
- aspect ratio
- warping/distortion
- folding/self-intersection
- thickness validity
- suspicious local axes

These should become structured diagnostics, not only internal notes.

### Strict vs permissive solve modes

A useful long-term product distinction:

- `strict mode`
  - fail on serious warnings or suspicious solver conditions
- `permissive mode`
  - continue solving, but return explicit diagnostics

This is helpful for production engineering workflows versus exploratory modeling.

## Testing Policy That Matches Solver Risk

The test strategy should distinguish test types clearly.

### Analytical / closed-form tests

These should be very strict.

Examples:

- Euler-Bernoulli beam deflection
- axial deformation
- torsion
- simple modal references

### Rust/WASM/native parity tests

These should be near machine precision where paths are supposed to match exactly.

### External benchmark comparisons

These can use looser tolerances when comparing against:

- NAFEMS
- ANSYS
- Abaqus
- Code_Aster

but those looser tolerances should not leak into internal regression tests.

### Property and invariant tests

These are especially valuable:

- stiffness matrix symmetry
- non-negative strain energy
- rigid body mode detection
- reaction equilibrium
- invariance under global translation/rotation where appropriate
- shell/element patch tests

### Fuzz and randomized tests

Randomized testing should not rely only on parity against an older implementation. It should increasingly assert:

- no crash
- finite outputs
- equilibrium
- symmetry / invariants
- stable diagnostics

### Timing and performance checks

Timing-sensitive assertions should not be default correctness tests.

They should live in:

- ignored perf tests
- benchmark suites
- dedicated CI performance gates

not in ordinary `cargo test` correctness flows that need to be deterministic.

## Result-Contract Hardening

Result payloads should be treated as a product interface, not an internal detail.

Important rules:

- version result contracts
- snapshot-test serialized shapes
- distinguish final vs partial vs failed solve states
- include trust metadata and diagnostics
- keep RC/steel extraction payloads stable enough that UI and reports do not reconstruct semantics ad hoc

This is especially important now that product automation, AI, and report workflows depend directly on solver outputs.

## Recommended Sequencing

### Immediate

- eliminate false-green tests
- harden 3D extraction contracts
- strengthen equilibrium and tolerance oracles
- move flaky timing checks out of correctness tests
- validate loads/constraints more explicitly

### Near-term

- add Rust-side input validation module
- add post-solve residual/equilibrium verification into real solve paths
- add structured diagnostics instead of free-form warning strings
- add solver-run artifact capture
- tighten frontend mutation validation

### After that

- unify nonlinear convergence tracking across all nonlinear paths
- add strict/permissive execution policy
- deepen shell-specific trust diagnostics
- expand property/fuzz/invariant validation

## How This Should Show Up In The Roadmap

The roadmap should reflect this work in a few clear places:

- `ASAP hardening`
  - false-green tests
  - extraction contract hardening
  - stronger test oracles
  - timing-test cleanup
- `Result trust and structured diagnostics`
  - structured diagnostics
  - model quality gates
  - solver-run artifacts
  - tolerance policy by test type
- `Constraint-system maturity`
  - constraint validation and parity
- `Verification moat`
  - property/fuzz/invariant testing
  - explicit fixture/skip discipline

The research note should hold the deeper safety architecture so the roadmap can stay shorter and more execution-focused.

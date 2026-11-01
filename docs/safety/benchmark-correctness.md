# Benchmark correctness

A failed comparison is evidence to investigate, not proof of an engine defect.
This first slice implements the test-correctness program in the 2026-10-29
roadmap. Production solver code and existing tests/tolerances are unchanged.

## Executable format and workflow

`engine/tests/benchmarks/spec/schema.json` describes the version-one JSON format.
`protocol.py` is the single shared generator and checker; `runner.rs` adapts its
models to the production Rust solvers. The adapter dispatches 2D linear and
corotational analysis and 3D linear analysis; unsupported combinations report
an error before solving. Python uses only the standard library.
The lint validates the schema's supported vocabulary, fails on unknown schema
assertions, then applies cross-field and numerical admission rules.

Each spec records geometry and element identity, material, section, supports,
symmetry planes, loads and an independently stated analytic force total,
measurement component, sign and normalization, expected rigid-body modes,
three doubling meshes, and a justified relative tolerance. `sources` identifies
the source location for each physical field. E is the engine input modulus
(the assembly multiplies it by 1000); shell coordinates and forces use the
consistent benchmark system described in the #810 audit. The normalization is
2 m for Mattiasson and 1 for unnormalized displacement.

Every numerical reference includes kind (`paper`, `exact`, `textbook`, or
`independent-solver`), citation, page/table/equation location, signed value,
absolute precision, independence identity, provisional status and pass/fail use.
Two non-provisional independent references must overlap within their stated
precision **before** solving. Precision is reference uncertainty, not permission
to widen the response tolerance. A provisional reference can be retained for
information but cannot contribute a pass/fail gate. Mathematical derivations
use an equation/function location instead of inventing a printed page number.

The runtime order is:

1. Validate the spec and reference agreement.
2. Generate the model. Union symmetry constraints at intersections; retain
   loads at supported DOFs. Close the full cylinder seam by sharing nodes.
3. Check applied force against the independent analytic total. Compute the rank
   of support constraints acting on the three/six rigid motions; require the
   specified remaining rigid motions. Check generated restraints against the
   declared support contract.
4. Solve to full load and check reaction force and moment balance (current coordinates for nonlinear frames).
   For symmetric shells, independently solve a full mesh and reduced mesh with
   the same physical element sizes and compare the measured signed displacement.
   The full model has one axial translation gauge at midspan, not artificial
   vertical crown support. Full/reduced agreement is required within 1e-6.
5. Run the mesh sequence. Require strictly decreasing error against every admitted
   reference, shrinking same-sign successive differences across the entire
   sequence, and a finite positive observed order.
   For doubled meshes, `p=log2((u_h-u_h/2)/(u_h/2-u_h/4))` and
   `u_inf=u_h/4+(u_h/4-u_h/2)/(2^p-1)`. Both the finest value and extrapolation
   must satisfy the unchanged tolerance against every admitted reference. The
   reported error at each mesh is the maximum absolute error across admitted
   references, so both the decision and report are independent of reference order.
   A plateau, growing error, oscillatory sequence or failed extrapolation reports
   **model or reference suspect**.

The rank check measures rigid motions, not all internal mechanisms or the
stiffness spectrum. Neither check can prove that a physically incorrect extra support is absent.

## Converted incident families

| Incident | Specs and preserved meaning | Negative check |
|---|---|---|
| #845 Mattiasson | q=1,2,5,10, A=1, EI=20000; signed shortening and downward displacement; elliptic integral and published Table 1 references; 16/32/64 meshes | Old q=5 downward value .6647 fails two-reference agreement before solving |
| #846 shallow toggle | Explicit truss and explicit frame, pinned bases, unreleased frame apex; same E/A/I/geometry as corrected branch; stable P=50 point | Changing truss element identity to frame fails reference-model identity; independent scalar-energy differentiation cross-checks the equilibrium reference |
| #810 shells | Scordelis–Lo quarter roof and pinched-cylinder eighth sector; corrected support union, all gravity loads, correct P/4 load; full shell comparisons | Crown pin fails support contract; omitted corner constraints also fail full/reduced displacement; omitted supported loads fail analytic total |

**Important physical limitation of the requested crown negative:** an extra
crown pin still permits zero rigid-body modes and balanced forces. The original
#810 audit explicitly demonstrated balanced reactions for the wrong model.
Claiming that equilibrium or a zero-mode count alone catches that pin would
repeat the very test-correctness mistake this program is intended to prevent.
The additional support contract catches it, and symmetry/accuracy provide
independent physical checks.

**Shallow-toggle reference scope:** #846 explicitly derives a **two-element**
frame energy law, not a continuum frame solution. Subdividing the members
changes that discrete problem. A straight pin-jointed truss subdivided into
collinear bars acquires transverse mechanisms. The initial specs retain
[1,2,4] as a diagnostic refinement sequence, but the discrete two-element gate
must not be advertised as a successful continuum Richardson study. A new
independent continuum frame solution and a meaningful truss refinement protocol
are required before admitting those as continuum-convergence benchmarks. The
existing path tests are retained unchanged; the new stable-point test does not
replace the #846 branch's full snap-through path coverage.

Reference provenance was read with `git show`, without switching branches:

- `fix/845-elastica` (`dcfb121a7`), reference derivation and model audit.
- `fix/846-shallow-toggle`, `BENCHMARK_REFERENCES.md`, “Shallow-toggle resolution”.
- `safety/triage-810` (`f0c9db165`), corrected models and numerical audit.
- Local `docs/roadmap-research-2026-10-29`, Prevention / Test-correctness program;
  the requested `origin/…` ref was absent in this checkout.

The [COMSOL roof discussion](https://doc.comsol.com/6.4/doc/com.comsol.help.models.sme.scordelis_lo_roof/scordelis_lo_roof.html)
reports approximately −0.302 as the converged displacement, while
[Altair OS-V:0730](https://help.altair.com/hwsolvers/os/topics/solvers/os/scordelis_lo_roof_verification_r_2.htm)
uses −0.3024. The spec preserves that distinction; it does not pretend the
historical −0.3086 quotation agrees. The cylinder's second numerical check is
[Abaqus Table 3](https://docs.software.vt.edu/abaqusv2025/English/SIMACAEBMKRefMap/simabmk-c-pinchcyl.htm),
STRI65, 3366 DOF, irregular mesh type 2: −1.824e−5 with reported −0.05% error.
Its 1e−8 absolute precision includes numerical error, not just decimal rounding.

## Adding and migrating benchmarks

Add a JSON spec, with two genuinely independent sources and explicit model
scope. Audit the cited numbers and units, not just their titles. If the generator
needs new geometry or load primitives, add them once in `protocol.py` and test
physical invariants. Add a Rust sequence gate and a deliberately wrong fixture
that must fail for the intended reason. For symmetry, build the full physical
model without the reduced model's symmetry restraints. Never label a
self-comparison between two copies of the same reduced model as symmetry proof.

Run from the repository root:

```sh
python3 engine/tests/benchmarks/protocol.py lint
python3 engine/tests/benchmarks/test_protocol.py
CARGO_BUILD_JOBS=2 make test.engine.benchmark-protocol
python3 -I scripts/check-test-targets.py
```

Convert remaining classic beams/frames, then plates/shells, then buckling,
material and dynamic benchmarks. Preserve every existing assertion until an
equivalent or stronger spec gate has demonstrated that it rejects known wrong
variants. Keep discrete formulation tests separate from continuum convergence.
Next slices: independent continuum toggle references and path refinement,
modal/internal-mechanism checks, independent-engine replay,
CI coverage lint for legacy benchmark registration, shared research-page
references, mutation tests of engine implementations, double-entry specs and
independent engineer sign-off. None of those is claimed complete by this slice.

## Review-fix verification (2026-10-30)

Working-tree changes based on `b03e89268c3cef28f2849d82c6a1fbc5641a4ae4`:
the five targeted Python convergence tests pass (admitted-reference ordering,
informational-reference permutations, Richardson/suspect classification,
four-mesh reversal, and discrete-reference scope). The Rust validation filters
`benchmark_protocol_mattiasson`, `benchmark_protocol_roof`, and
`benchmark_protocol_cylinder` each pass one test, with 0 failures and 0 ignored.
These ran with `CARGO_BUILD_JOBS=2` and
`CARGO_TARGET_DIR=/private/tmp/claude-501/codex-862rfix-target`.
All 12 specs pass lint; `git diff --check` passes. No full suites were run.

## Historical verification record (2026-10-29)

This historical record describes commit `a574a70d7` (the initial protocol),
which contained 16 Python tests and 8 Rust tests. It does not describe the
subsequent review fixes or the current working tree.

The targeted Cargo filter above passes **8 tests, 0 failures, 0 ignored**.
The Python suite passes **16 tests**; all 12 specs pass lint. The test-target
registration lint and `git diff --check` also pass. No full engine suite was run.

| Quantity | Meshes | Observed order | Extrapolation |
|---|---|---:|---:|
| Mattiasson downward displacement, q=1/2/5/10 | 16/32/64 | 2.002 / 2.003 / 2.007 / 2.014 | .301725701 / .493479781 / .713880155 / .810809110 |
| Mattiasson shortening, q=1/2/5/10 | 16/32/64 | 1.998 / 1.996 / 1.968 / 1.674 | .056427108 / .160627934 / .387605844 / .554966828 |
| Roof uz | 4/8/16 | 2.560 | −.3020066873 |
| Cylinder uy | 8/16/32 | 1.629 | −1.856743826e−5 |

Roof full/reduced at equal element sizes: −.3165750271662464 versus
−.31657502716721053. Cylinder: −7.074906096670729e−6 versus
−7.0749060966710575e−6. These are coarse symmetry checks, not accuracy claims.
The cylinder's Richardson estimate is within 2% but is less accurate than its
finest mesh; its low observed order remains visible in the report.

At P=50 the frame displacements for 1/2/4 elements per member are
.00253765809728 / .00254106694754 / .00254213348702. Reference error grows, so
this diagnostic correctly reports suspect. The subdivided truss at four
segments returns singular tangent stiffness. Neither diagnostic is counted as
an admitted continuum convergence benchmark. Existing branch tests remain the
authority for the full toggle snap-through path.

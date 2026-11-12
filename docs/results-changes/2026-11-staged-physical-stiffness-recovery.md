# Staged physical stiffness recovery (2026-11-12)

PR #1952, review round 14. All planar and spatial staged reactions now use
one recovery assembler, independently of dense or sparse solution dispatch.
The assembler builds the full physical stiffness and cumulative applied load
with artificial stiffness unconditionally disabled. Planar prestress equivalent
loads and physical support springs remain included.

The old `PhysicalStageResidual::assemble` accepted an arbitrary closure. Its
physical-assembly scope did not remove stabilization from a matrix captured
before entering the closure. A private `PhysicalStageStiffness` now owns the
matrix inside the recovery module. Only its physical assembler constructs it;
the residual constructor is private too. Callers supply the model, numbering
and cumulative displacement, with no matrix or force-vector argument.

Four ignored tests in the preceding test commit demonstrate the old boundary
accepting a cached stabilized matrix, in dense/sparse 2D/3D representations.
They use the released-slave model's compatible supplied rotation and an earlier
assembly with constraints omitted. Constraints do not add physical element
stiffness; omitting them lets the existing orphan guard put an artificial
spring on the released rotation. Each test first verifies that this earlier
matrix actually contains a nonzero stabilization action. Physical recovery
must report exactly zero released-rotation force and constraint moment. This
is a supplied-state boundary reproducer, not a failing public staged solve.

The public released-slave reaction cases already pass before this refactor:
normal staged assembly suppresses artificial stiffness and tied rotations are
excluded by the ordinary orphan guard. Native and WASM controls check both
constraint forms, signed/zero prescribed master motion, unchanged later stages,
and exactly 63, 64 and 65 independent DOFs around the dispatch threshold.
Their loaded cantilever support shear, support moment and tip translation are
computed directly from the input load, span and bending stiffness. They also
require the restrained master's reaction and all constraint forces to be zero.
The root's physical, nonzero reactions must remain available.

This entry registers the staged recovery change separately from the earlier
nonlinear physical-force boundary. Reassembly can change floating-point
summation in previously dense recovery. It does not authorize changes in
linear, P-Delta or nonlinear result collections outside staged outputs. Main's
frozen exclusions and audited baseline files are retained; no known-wrong
arc-length output is reintroduced as a frozen answer. No tolerance or numerical
baseline is relaxed.

This refactor does not repair staged prescribed-master displacement expansion,
which is recorded separately in the round-14 handoff. It makes no claim that
the public staged examples reproduce fictitious stabilization forces on main.

The merge preserved the branch's two corrected arch references byte for byte
under `docs/results-changes/fixtures/1952-arc-reactions/`. The subsequent
[#1952 frozen-coverage restoration](2026-11-arc-length-reactions.md#restore-live-frozen-coverage-after-the-main-merge-2026-11-12)
regenerates both cases in the live frozen corpus and removes their two named
exclusions. The independent live comparison now reads `web/results-frozen/`;
the historical references and their replay assertions remain available.

Pending nonlinear entries now use main's collection-name declarations under
explicit `analysis:nonlinear` conditions. The separate P-Delta entry retains
its equilibrium scope. The branch's static negative controls are retained in
`reaction-change-scope.test.ts`, alongside main's unchanged audit tests.

# Repeated eigenvalues retain their multiplicity

Results version: 5 (main was 4). Issue: #759. PR: #827.

A single starting vector for Lanczos spans at most one direction of each exact
repeated eigenspace. Neither early breakdown nor small Ritz residuals after a
full requested search space prove that all lowest eigenvalues were found with
multiplicity. Lanczos results are now accepted only after convergence in a
full-dimensional search space. Early breakdown or failure to converge uses the
existing dense solver, including from the ordinary and buckling entry points.

These entry points now refuse problems above 2,048 free DOFs before allocating
search-space or dense matrices. This is a conservative work and memory limit:
one dense matrix at the limit occupies 32 MiB, compared with 1.46 GiB at 14,000
DOFs; the solver needs several matrices and cubic work. Modal and buckling callers
report the limit and ask the engineer to reduce the mesh or model size. This
also refuses large models with simple spectra that previously solved sparsely.
Restoring that capability requires a multiplicity-preserving sparse method or
an independent completeness check. Harmonic analysis retains its direct-solve
fallback, and automatic Rayleigh damping retains its diagonal estimate fallback.

The completeness check also exposes a dense-fallback defect for exactly massless
DOFs: a near-zero mode can make the relative reciprocal-eigenvalue cutoff
classify higher physical modes as infinite. The fallback now statically condenses
exactly zero mass rows, solves the finite-mass problem, and recovers the eliminated
coordinates. No artificial mass or numerical cutoff is introduced. A diagonal
regression with eigenvalues 1e-10 and repeated 1e4 plus a massless DOF pins the
lost modes; a coupled three-DOF regression checks the recovered coordinates,
unit modal mass, and the original eigen-equation.

The 3D buckling golden moved by at most 2.2e-10 relative after requiring the full
search space. Its four values still pass the independent Euler cantilever check
at 1e-6 relative tolerance; the golden was recaptured without relaxing either
tolerance. The shell modal golden moved by at most 2.8e-7 relative after massless
condensation. All five physical modes pass the dense-path comparison at 1e-6
before the golden check; both tolerances are unchanged.

In the regression of sixteen identical one-member warping cantilevers, the second
returned squared angular frequency changes from 38,156,001.48918348 to
27,685,104.630653664 rad²/s², the repeated lowest eigenvalue (frequency
983.1087470294 → 837.4197827911 Hz). Modal effective masses
and downstream spectral, harmonic and time-history results may also change.
Re-run these analyses on symmetric structures.

The two orthogonality reports in the issue have a separate cause: the metamorphic
checker reconstructed six DOFs per node and omitted the returned warping DOF.
The feature-matrix cantilever then appeared to have a mass cross product of
0.01685, and seed 20754 appeared to duplicate a mode. With all seven DOFs these
models already pass the mass-orthogonality and dense-spectrum checks on main.
The checker now includes warping; this correction alone changes no solver results.

Regression tests check mass-normalized Gram matrices (including repeated pairs),
ascending frequencies and dense-reference spectra with multiplicity. Generated
symmetric structures vary length, copy count, warping and requested mode count.
The existing published max-component shape normalization is preserved.

The certificate algorithm and its proof contract are unchanged. Independent
repeated modes can certify completeness; duplicated or missing vectors cannot.
Single-mode enclosures alone do not establish completeness. Tests exercise these
cases and compare certificate claims with the dense reference spectrum.

MD-ORTHOGONALITY containment belongs to another branch and is not changed here.
It must be removed when both branches land.

Prior-head verification on 2026-10-29 used
`CARGO_TARGET_DIR=/private/tmp/claude-501/codex-759-target` and the Nix toolchain.
The minimized one-member checker regression fails with the old reconstruction:
`modes 0 and 4 ... 1.000e0 > 5.296e-10`; the full issue fixture reproduces
`modes 2 and 3 ... 1.685e-2 > 2.674e-8`. Both pass after including warping.
The symmetric-spectrum regression fails before the Lanczos change with
`mode 1: 3.815600148918348e7 vs dense 2.7685104630653664e7`, then passes.

Validation results: library 573 passed; certificates 149 passed / 8 ignored;
core 217 passed, followed by all 6 focused modal tests (24 generated property
cases included) and the final minimized regressions; release validation 4,763
passed; release metamorphic 21 passed / 5 ignored; the exact issue nightly command
passed; all 3 issue-specific metamorphic regressions passed. The redundant broad
debug metamorphic run was interrupted after the full release suite passed.

`make wasm`, all 41 results tests, the snapshot gate and `make check.changelog`
passed. All 39 committed results snapshots remain unchanged, so none were
regenerated. A separate working-tree comparison checked those files against
`origin/main` because the standard gate compares committed HEAD. Web unit tests:
15,825 passed / 14 skipped. `make typecheck.web`: no new TypeScript errors against
the existing 247-error baseline, no errors in guarded Svelte paths, site-header
check passed. The fixture stamp and its two pinned hashes were updated for version
5; no CAD output golden was regenerated.

PR #827 follow-up regressions include diagonal K with 40 and 60 distinct values,
each repeated three times, M = I and two requested modes. Both returned modes
must equal the lowest eigenvalue and have an orthonormal Gram matrix. A model
of 2,000 identical warping cantilevers (14,000 free DOFs) must return an actionable
resource-limit error. Separate sparse API tests exercise the normal, large-mode
count, nonzero-shift and buckling routes at that size without densification.

Follow-up verification used `CARGO_TARGET_DIR=/private/tmp/claude-501/codex-827-target`.
The final release run passed 573 library, 149 certificate (8 ignored), 224 core,
22 metamorphic (5 ignored), and all 4,763 validation tests. `make wasm`, all 41
results tests, `make check.changelog`, `make check.results-snapshot-gate` and
`nix develop -c make typecheck.web` passed. No results snapshots were regenerated;
TypeScript remains at its existing 247-error baseline, with no guarded Svelte
errors.

The full web unit run passed 15,818 tests, skipped 14, and reported six timeouts
plus the old expectation that the 6,732-DOF validation model could run buckling.
That test now checks the actionable refusal while retaining the second-order
convergence checks and three stable combinations. All 83 tests in the six affected
files then passed serially, with unchanged timeouts. The industrial-building
advanced-analysis test took about 92 seconds: requiring a full search space has
a substantial performance cost even below the dimension limit.

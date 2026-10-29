# Repeated eigenvalues retain their multiplicity

Results version: 5 (main was 4). Issue: #759. PR: TBD.

A single starting vector for Lanczos spans at most one direction of each exact
repeated eigenspace. An early invariant-subspace breakdown proves convergence in
that subspace, but does not prove that all lowest eigenvalues were found with
multiplicity. The solver previously accepted that incomplete spectrum. It now
uses the existing dense fallback on early breakdown, preserving independent
vectors at repeated eigenvalues. The shared ordinary and buckling Lanczos paths
receive the same correction. This fallback can use more memory and time on large
highly symmetric models.

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

Verification on 2026-10-29 used
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

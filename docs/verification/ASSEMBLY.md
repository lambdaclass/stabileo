# Cross-path assembly oracle

The engine builds the same matrices along several independent code paths. A result
certificate (`CERTIFY.md`) checks a solve against the K it was given; it cannot see that
another path would have given a different K. `engine/tests/assembly_paths.rs` compares the
paths with each other.

## What it compares

Random models from `engine/tests/fuzz_models` (`random_2d_model_rich`,
`random_3d_model_rich`) reach every branch the assemblers take: springs with angles and on
restrained DOFs, inclined rollers and supports, hinges and releases (torsion included),
truss-only nodes in frame models, Timoshenko shear areas, local-axis vectors and roll
angles, left-handed axes, warping (including non-warping members in a 7-DOF model),
plates, MITC4 and MITC9 quads (warped too), solid and curved shells, connectors,
prescribed displacements, and every member, nodal and surface load type. Random MPCs
(equal DOF, rigid link, diaphragm, linear) are added for the constrained reductions.

For each model every path below is compared with the dense one, entry by entry, at
`1e-12` times the larger max-norm of the two matrices (or vectors):

| Quantity | Paths |
|---|---|
| K (full and free block) | `assemble_stiffness_2d/3d` (dense) · `assemble_stiffness_sparse_2d/3d` (linear static at or above `SPARSE_THRESHOLD`, certificates, modal, harmonic, P-Delta) · `assemble_sparse_2d_ex` (2D buckling, time history) · `assemble_stiffness_sparse_3d_parallel` · the legacy triplet assemblers `assemble_2d_sparse`, `assemble_elements_parallel_2d` (benches only) · `buckling_system_2d/3d` · `certify::solver::reduced_sparse_2d/3d` |
| load vector | `assemble_load_vector_2d`, `assemble_2d`, `_ex`, legacy · `assemble_load_vector_3d_dense/_sparse`, `assemble_load_vector_sparse_3d` (parallel) · the certificate's `f_F − K_FR u_R` |
| M | `assemble_mass_matrix_2d/3d` vs `_sparse`, and whether skipping the inclined-support rotation (the dynamic solvers never apply it to M) is harmless |
| K_G | from displacements (`add_geometric_stiffness_2d/3d`, P-Delta) · from element forces (`build_kg_from_forces_2d/3d`, buckling) · the affine terms of the P-Delta certificate · the buckling system's −K_G, which must be in the frame of its K |
| reductions | `FreeConstraintSystem::reduce_matrix` (dense) vs `reduce_matrix_sparse` for K, M and K_G |
| bookkeeping | DOF maps (a bijection, free DOFs first, independent of HashMap order), artificial-stiffness DOFs, `max_diag_k`, inclined transforms (exact); dense K and K_G symmetric |

A 2D model is also embedded in the XZ plane of a 3D one with every out-of-plane DOF
restrained, so the 2D and 3D element routines check each other (K, M, K_G, loads, DOF
map). The 2D rotation is minus the 3D rotation about +y, and the 2D thermal gradient is
the −y face minus the +y face while the 3D one is the +z face minus the other; the web
flips it the same way (`solver-service.ts`).

Every comparison must be reached by the sweep, or the test fails: a generator change that
stops exercising a path cannot pass silently.

## Running

    cargo test --test assembly_paths -- --nocapture     # default sweep, ~15 s in debug
    cargo test --release --test assembly_paths assembly_paths_agree_large -- --ignored --nocapture
    cargo test --features parallel --test assembly_paths  # the parallel 3D paths for real
    ORACLE_SEED=53 ORACLE_DIM=3 cargo test --test assembly_paths oracle_one -- --ignored --nocapture

The default sweep runs in the normal suite; the large one runs nightly in the
`certify-large` job. Without the `parallel` feature the parallel names resolve to the
sequential assemblers, so run the sweep with the feature after touching them. A failing
check is shrunk to a minimal model (greedy removal of loads, members, supports, surface
families and feature flags) and printed as JSON; `oracle_one` does the same for one seed.

Checks that fail only because of a known bug fixed on another branch are tallied, not
asserted (`KNOWN`); new findings not fixed here are tallied too (`REPORTED`). Each has a
minimal `#[ignore]`d reproduction in the same file.

## Findings

Fixed (each with a regression test in `assembly_paths.rs` and a CHANGELOG entry):

- The sparse 3D assemblers took the largest diagonal over the free DOFs only. It scales
  the artificial warping stiffness and the regularization shift of a failed sparse
  Cholesky, so the paths disagreed whenever a support held the largest diagonal.
- The 2D geometric stiffness ignored hinges (all three builders); 3D condenses releases.
  Found by the 2D-in-3D embedding.
- 3D buckling added K_G in global axes to a K rotated at inclined supports: the critical
  factor depended on the model's orientation (101.5 vs 62.1), and mode shapes were left in
  the support's frame.
- 3D modal, buckling, harmonic, Guyan and Craig–Bampton ignored curved beams (buckling
  panicked).
- The parallel sparse 3D load vector left quad and MITC9 self-weight in local axes.

Known, fixed elsewhere (`#[ignore = "KNOWN: ..."]`):

- `assemble_sparse_2d_ex` ignores spring angles and inclined rollers, lacks the
  orphan-rotation guard, omits springs on restrained DOFs from `k_full` (fix/sparse2d).
  The 2D buckling K comes from it.
- Connector assembly hardcodes 3 (2D) and 6 (3D) DOFs per node: wrong terms on truss-only
  2D models, an index panic with warping (fix/connectors). The sweep drops connectors on
  such models.

Reported, not fixed here:

- `assemble_sparse_2d_ex` scales its artificial stiffness by the largest free diagonal.
  Belongs with fix/sparse2d.
- The mass matrix is never rotated at inclined supports, while K is: modal, harmonic,
  time history and the reductions mix frames, and mode shapes stay in the support's frame.
  A beam whose end slides along it changes its third frequency by 7% when rotated. The fix
  touches every dynamic solver and its certificate, so it is left for its own change.
- 2D buckling never rotates K_G at inclined supports. Latent: its K, from `_ex`, is not
  rotated either; once fix/sparse2d rotates it, K_G and the mode shapes must follow, as
  in 3D.
- The legacy triplet assemblers (benches only) drop truss member and thermal loads and
  connectors, among others. They are not reached by any solver.

Seen while building the oracle, outside its scope: modal 3D fails ("Eigenvalue
decomposition failed") on models mixing warping and non-warping members, and any section
with `cw`, even unused, turns on the seventh DOF for the whole model; the corotational 3D
tangent's geometric stiffness ignores releases; the fiber, material-nonlinear and staged
3D solvers never call `expand_curved_beams_3d` either (not checked further).

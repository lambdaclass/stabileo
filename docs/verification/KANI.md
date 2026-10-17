# Kani harnesses

Bounded model checking of the Rust engine with [Kani](https://github.com/model-checking/kani)
(CBMC underneath). Harnesses live in `engine/src/kani_proofs.rs`; the conventions are in
that file's header.

## Running

Run harnesses only through `scripts/kani-safe.sh`. It runs one harness at a time under a
memory and time watchdog. `cargo kani` on its own, and especially `-j`, has taken down a
128 GB machine.

    nix develop .#verify -c scripts/kani-safe.sh                 # every harness
    KANI_TIER=fast nix develop .#verify -c scripts/kani-safe.sh  # skip `// kani: nightly`
    KANI_MEM_GB=8 KANI_TIMEOUT_S=900 nix develop .#verify -c scripts/kani-safe.sh interval_ csc_
    KANI_EXTRA_ARGS="-Z concrete-playback --concrete-playback=print" \
        nix develop .#verify -c scripts/kani-safe.sh <harness>   # print a counterexample

Results go to `target/kani-report.tsv` (status, seconds, peak GB); logs go to
`target/kani-logs/`. CI runs the fast tier on pull requests and every harness nightly
(`.github/workflows/verify.yml`).

In a git worktree, `nix develop .#verify` can fail with "getting Git object … object
not found". Point it at a directory holding a copy of only `flake.nix` and `flake.lock`
instead: `nix develop path:/that/dir#verify`. Do not use `path:.`, which copies
`target/` into the store.

## How to read the table

- **Tier.** *fast* runs on every pull request. *nightly* marks harnesses over about
  100 s or 4 GB.
- **Time / GB.** Wall time and peak resident memory of one run on an Apple-silicon
  laptop, as measured by `kani-safe.sh`. Rows marked † come from the last recorded run
  on `verify/certified-solver` and were not re-run on this branch. Rows with `—`
  have not been measured to completion.
- **Counterexample harnesses.** A harness with `should_panic` asserts something that
  is false. It "passes" because Kani finds the counterexample. Each one documents a
  finding.
- **What every harness proves.** Besides its own assertions, every harness also
  proves that no panic, out-of-bounds index or usize overflow occurs on any path its
  assumptions allow.

## Lessons (why the harnesses look the way they do)

- **Keep symbolic floats few.** CBMC turns every f64 operation into a SAT circuit
  ("bit-blasts" it). The monolithic 3D frame harness needed more than 80 GB, so the
  frame proofs are split up and use stubs.
- **Never ask CBMC to prove that two differently rounded expressions are equal.** For
  example, two separately computed copies of `6·ecw/l²`: compute each term once.
- **Use concrete sizes, not a symbolic `n`, for allocations.** A symbolic `n` makes
  CBMC model an n·n allocation and an n³ loop of unknown size, which went over 12 GB.
- **Leave nonlinear facts heavy in sqrt or division to unit tests** (for example
  `|dᵢ/√Σd²| ≤ 1`). They do not finish.
- **Checking a rounded float result against independent exact arithmetic is hard for
  SAT.** Comparing `rn(x·y)` against an integer product of two full 53-bit significands
  is a multiplier-equivalence problem. It did not finish in 10 minutes with symbolic
  exponents. With the exponents fixed, full-width × takes about 30 s ("scale slices",
  below). ÷ finishes only with a 3-bit divisor (591 s), x² only with 30 significant
  bits, and √ not at all.
- **Kani's NaN check counts any operation that produces a NaN as a failure,** even
  inf − inf inside code whose job is to propagate NaN. Poisoning harnesses therefore
  keep the other operand finite.
- **Get counterexample values with concrete playback.** Pass `KANI_EXTRA_ARGS` (see
  Running). To read an intermediate value, assert `w != value` for a fresh symbolic
  `w`; the counterexample then prints the value.
- **HashMap-based code is out of reach.** `HashMap::new` asks the OS for random keys
  (`CCRandomGenerateBytes` on macOS), which Kani cannot model. With the key source
  stubbed, CBMC still unrolls SipHash over every key (`dof_numbering_2d_bijection` hit
  8 GB in 500 s). Prefer exhaustive small-model tests for that code.
- **Symbolic orderings with heaps and queues blow up.** `amd_order` and `rcm_order` on
  every 3-vertex graph did not finish in 10 minutes. `tests/index_exhaustive.rs` runs
  them on every graph with up to 6 vertices instead.

## Tool finding: CBMC f64 division with a subnormal dividend

CBMC 6.11.0 (Kani 0.68) encodes f64 division wrongly when the dividend is subnormal.
For example:

- `0x752 / 0x3bcd800000000000` (9.26e-321 / 1.249e-20) comes out as
  `0x019fc30000000000` (7.4105141e-301).
- The correctly rounded IEEE result is `0x019fc34115b1e5f7` (7.4107459e-301).

The wrong quotient keeps only the 11 significant bits of the dividend. Constant folding
gives the right answer (checked with a concrete-input harness, removed after diagnosis);
only the symbolic encoding is wrong.

Consequences:

- A harness can fail spuriously, which is how this was found:
  `interval_div_point_encloses` failed only for |q| < 1e-300.
- A harness can also pass spuriously when an assertion depends on such a quotient.
- So harnesses that divide must keep dividends normal. The physical input ranges used
  by the element harnesses already do.

`cbmc_division_subnormal_dividend_bug` tracks the bug. It asserts the IEEE result and is
`should_panic`, so it starts failing once CBMC is fixed. It has not yet been reported upstream to CBMC.

## Interval arithmetic (`certify/interval.rs`)

The result certificates (CERTIFY.md) rest on one property of `Interval`: for each
operation, the exact real result on any reals in the operand intervals lies in the
computed interval. The harnesses prove this in two layers.

1. **Structure, for every finite input.**
   - For + and −, each output endpoint is the outward neighbour (`next_down` /
     `next_up`) of the round-to-nearest result of the matching endpoint operation, and
     overflow gives a non-finite interval. The same statement for × did not finish in
     5 minutes; there the min/max over the corner products is read from the code.
   - NaN, ±inf and reversed operands poison `mul`, `div`, `sqrt` and `square`.
   - `neg` and `mag` are exact.
2. **Enclosure against exact integer arithmetic**, with no floating point in the check
   and no assumed theorem:
   - A finite f64 is exactly ±m·2^e (`dyadic`).
   - A product of two f64 is ±(m₁m₂)·2^(e₁+e₂) in a u128.
   - A sum of two f64 whose exponents lie within 70 binades of each other fits in an
     i128.
   - `cmp_exact` compares such numbers exactly. `dyadic_cmp_matches_ieee` checks it
     against IEEE comparison.
   - The quotient q = x/y lies in [lo, hi] iff lo·y ≤ x ≤ hi·y (for y > 0).

**Scale slices.** Enclosure is proved with one operand fixed to a binade (x ∈ ±[1, 2)).
The other operand covers the binades where rounding happens. IEEE operations are scale
invariant away from overflow and underflow: rn(2^k·v) = 2^k·rn(v), and next_up and
next_down scale the same way. So a slice covers every operand pair whose result stays
in the normal range. Elsewhere, layer 1 holds and IEEE correct rounding (|v − rn(v)| ≤
½ ulp < distance to the next float) closes the argument. That step is a property of the
IEEE standard and is not machine-checked here.

**From endpoints to whole boxes** is ordinary real analysis:

- + and − are monotone in each argument.
- × is bilinear, so its extremes lie at the four corners.
- x² is monotone in |x|, with minimum 0 when 0 is in the interval.
- ÷ (with 0 not in the denominator) and √ are monotone.

**Not proved by Kani:**

- Enclosure for √ (times out).
- Enclosure for ÷ beyond a 3-bit divisor (591 s with 3 bits; wider times out).
- Enclosure for x² beyond 30 significant bits (full width times out). The full-width
  × slice and the x² structure together still cover it.
- Interval × over four symbolic endpoints (times out).

The fma-based unit tests in `certify/interval.rs` cover these: 20 000 random cases per
operation, checked with exact residuals.

**Findings:**

- **`add` and `sub` accept a reversed operand.** They do not reject a finite operand
  with lo > hi. For example, [1, 1⁻] + [0, 0] = [1⁻, 1], a finite and ordered result;
  [−MAX⁺, −inf] + [0, 0] = [−MAX, −MAX] is another case. `mul`, `div`, `sqrt` and
  `square` all reject such operands. This is harmless today: every
  `Interval::new` call site builds down(p) ≤ up(p).
- **Knuth's branch-free TwoSum is unsafe near the overflow threshold.** Its
  intermediate `s − bb` overflows for some finite x, y with finite s = x + y, so it is
  not error-free on the whole finite range. The unit test helper in `interval.rs`
  stays within exponents ±40, so it is unaffected. Fast2Sum on operands ordered by
  magnitude has no such overflow.

## Index plumbing around K

These properties (DOF numbering, orderings, sparse and dense assembly) are checked
mostly by exhaustive tests in `engine/tests/index_exhaustive.rs`, because HashMap and
heap-based code is out of Kani's reach (see the lessons above). Kani proves the CSC
builder and the permutation algebra on small concrete sizes.

`tests/index_exhaustive.rs` contains:

- **`orderings_are_permutations_for_every_small_graph`.** AMD and RCM return
  permutations, and `inverse_perm` inverts them, for every graph on up to 6 vertices,
  with and without the diagonal.
- **`csc_from_triplets_and_permute_random`.** 20 000 random triplet sets checked
  against a dense sum: the CSC invariants hold, nnz equals the number of distinct
  positions, and `permute_symmetric` is correct.
- **`dof_numbering_2d_exhaustive`, `dof_numbering_3d_exhaustive`.** For every 2D
  support type on 3 nodes, and every 3D restraint pattern on 2 nodes, with and without
  springs:
  - the numbering is a bijection;
  - free DOFs come first;
  - each class is numbered in (node id, local DOF) order;
  - the restrained set matches an independent specification.
- **`assembly_2d_linear_sparse_matches_dense_exhaustive`.** The linear-static sparse
  assembler (`sparse_assembly::assemble_stiffness_sparse_2d`) matches dense on the
  free-free K, the full K and the artificial-stiffness DOFs. It covers every member
  type, hinge and support combination on a 3-node model, including springs with and
  without an angle and inclined rollers.
- **`assembly_2d_sparse_ex_matches_dense_exhaustive`.** The same comparison for
  `assembly::assemble_sparse_2d_ex`, restricted to the features it supports.

**Findings for `assemble_sparse_2d_ex`.** 2D buckling and 2D time integration use it at
every model size. Each finding has an ignored reproduction:

- It ignores a spring's angle and adds diag(kx, ky) instead of Rᵀ·diag·R
  (`assembly_2d_sparse_ex_angled_spring`).
- It ignores inclined rollers. Its K_ff restrains global uz instead of the incline
  normal (`assembly_2d_sparse_ex_inclined_roller`). The kinematic fast path detects
  both cases and defers to dense. Buckling and time integration do not.
- It has no orphan-rotation guard. In a frame model, a node reached only by trusses
  leaves a zero row in K_ff (`assembly_2d_sparse_ex_orphan_rotation`).
- Its full K omits springs on restrained DOFs, so with a prescribed displacement there
  the reaction differs by k·δ (`assembly_2d_sparse_ex_k_full_restrained_spring`).

## Element stiffness (test level)

These tests are not Kani harnesses, but they are the main evidence that K is right:

- **`tests/element_rigid_body_modes.rs`.** For every element type, over random
  geometries, K_e annihilates every rigid-body mode relative to ‖K_e‖. The number of
  zero eigenvalues equals the number of rigid modes plus the mechanisms introduced by
  releases. K_e is symmetric positive semidefinite. Another test checks the assembled
  free-free K of a mixed model.
- **`tests/shell_patch_tests.rs`.** Constant-strain and constant-curvature patch tests
  on the distorted MacNeal–Harder patch, tilted out of plane, for DKT+CST, MITC4, MITC9,
  the curved shell and the solid shell.
- **`tests/determinate_exact.rs`.** Random statically determinate 2D trusses and
  frames with integer data. Member forces and reactions are computed by equilibrium
  alone in exact rational arithmetic and compared with the solver's results.
- **`tests/connector_k_findings.rs`.** The connector findings (finite-length shear
  without shear–moment coupling, hard-coded DOFs per node), now fixed, with analytic,
  rotation-invariance and dense/sparse assembly checks of models with connectors.

## Harness table

| Harness | Property | Input assumptions | Tier | Status | Time (s) | GB |
|---|---|---|---|---|---|---|
| **element/truss.rs** | | | | | | |
| truss_local_stiffness_2d_ok | finite, bitwise symmetric, axial diagonal > 0, diagonal ≥ 0, row sum exactly 0 | E∈[1e3,1e12], A∈[1e-8,10], L∈[1e-3,1e3] | fast | OK† | 15 | 1.5 |
| truss_local_stiffness_3d_ok | finite, bitwise symmetric, axial diagonal > 0, diagonal ≥ 0 | as above | fast | OK† | 20 | 1.5 |
| truss_global_stiffness_2d_ok | finite, bitwise symmetric, diagonal ≥ 0 | as above, c, s ∈ [−1, 1] | fast | OK† | 22 | 1.6 |
| truss_global_stiffness_3d_finite_and_blocks | finite, diagonal ≥ 0, exact block structure [[B,−B],[−B,B]] | \|dᵢ\| ≤ L | fast | OK† | 39 | 1.5 |
| truss_global_stiffness_3d_symmetry_counterexample | FINDING (should_panic): not bitwise symmetric | as above | fast | OK† | 91 | 1.5 |
| **element/frame.rs** | | | | | | |
| frame_local_stiffness_2d_ok | finite, bitwise symmetric, diagonal ≥ 0, axial > 0, transverse > 0 unless both ends hinged, released rotation has zero row and column | physical ranges, φ∈[0,100], any hinges | nightly | OK† | 123 | 1.8 |
| bending_block_{fixed,release_start,release_end,released_both}_ok | each release case of the bending block: finite, symmetric, diagonal ≥ 0, v₁ diagonal > 0 | physical ranges, either sign | fast | OK† | 13–71 | 1.5 |
| frame_local_stiffness_3d_ok | 12×12 assembly: finite, symmetric, diagonal ≥ 0, axial > 0, torsion > 0 unless released | bending block stubbed by its proven contract | fast | OK† | 51 | 1.7 |
| torsion_warping_block_ok | finite, symmetric, diagonal ≥ 0 | GJ ≥ 1e-10, ECw = 0 or ≥ 1e-9 | fast | OK† | 17 | 1.5 |
| frame_local_stiffness_3d_warping_ok | 14×14 assembly: finite, symmetric, diagonal ≥ 0 | 12×12 and warping blocks stubbed by their proven contracts | nightly | OK† | 127 | 4.1 |
| **element/transform.rs** | | | | | | |
| frame_transform_2d_structure, truss_transform_2d_structure | exact block structure of T | c, s ∈ [−1, 1] | fast | OK† | 15–18 | 1.5 |
| frame_transform_3d_structure, frame_transform_3d_warping_structure | exact block structure (warping DOFs identity) | axis components in [−1, 1] | fast | OK† | 38–63 | 1.5–1.7 |
| compute_local_axes_3d_default_finite | no panic, finite axes | L ≥ 1e-3; numeric helpers stubbed by unit-tested contracts | fast | OK† | 19 | 1.5 |
| **element/fef.rs** | | | | | | |
| fef_distributed_2d_ok | finite, axial entries 0 | q ∈ [−1e6, 1e6] | fast | OK† | 21–88 | 1.8 |
| fef_point_load_2d_ok | finite | a ∈ [0, L] | nightly | OK† | 255–418 | 2.0 |
| fef_thermal_2d_ok | finite, self-equilibrated (exact negation) | physical ranges | fast | OK† | 14 | 1.8 |
| adjust_fef_for_hinges_ok | finite, released moments 0, unchanged without hinges, axial untouched | as above | fast | OK† | 19–25 | 1.7 |
| adjust_fef_for_hinges_3d_ok | finite, released moments 0 | as above | nightly | OK† | 79–108 | 1.7 |
| expand_fef_12_to_14_ok | exact copy plus zero warping entries | any f64 | fast | OK† | 9–12 | 1.8 |
| axial_distributed_fef_ok | finite | physical ranges | fast | OK† | 13–17 | 1.8 |
| **linalg/dense.rs** | | | | | | |
| dense_mat_vec_bounds, dense_mat_vec_rect_bounds, dense_mat_mul_bounds, dense_transform_force_displacement_bounds, dense_transform_stiffness_bounds | indexing and lengths for every n ≤ 3 | concrete arrays | fast | OK† | 17–29 | 1.6 |
| dense_transpose_involution | transpose moves (i,j) to (j,i) and is an involution, n ≤ 4 | tagged concrete data | fast | OK† | 17 | 1.5 |
| transform_stiffness_truss_2d_symmetry_counterexample | FINDING (should_panic): Tᵀ K T is not bitwise symmetric | EA ∈ [1e-3, 1e9] | nightly | OK† | 245 | 1.9 |
| dense_extract_submatrix_exact | bitwise exact extraction | n ≤ 3 | nightly | OK† | 71 | 9.1 |
| dense_extract_scatter_subvec_roundtrip | extract then scatter round-trips | m ≤ 3 | fast | OK† | 45 | 5.9 |
| **certify/interval.rs** | | | | | | |
| dyadic_cmp_matches_ieee | exact comparator agrees with IEEE `<` / `==` | every finite pair | fast | OK | 14 | 1.5 |
| interval_add_structure | endpoints = next_down / next_up of rn(x+y), strictly around it; overflow → non-finite | every finite pair | fast | OK | 78 | 1.4 |
| interval_sub_structure | same for − | every finite pair | fast | OK | 67 | 1.5 |
| interval_add_encloses_slice | exact x+y ∈ result | x ∈ ±[1,2), y ∈ ±2^−d·[1,2), d ≤ 70, both full width | fast | OK | 87 | 1.5 |
| interval_add_encloses_far | result = (next_down x, next_up x), gaps ≥ 2^−53 > \|y\| | x ∈ ±[1,2), \|y\| < 2^−70 (incl. subnormal, 0) | fast | OK | 8 | 1.5 |
| interval_sub_encloses_slice | exact x−y ∈ result | as add slice | nightly | OK | 169 | 1.5 |
| interval_mul_encloses_slice | exact x·y ∈ result | x, y ∈ ±[1,2), both full width | fast | OK | 30 | 1.5 |
| certify_sparse_prod_encloses_slice | `certify::sparse::prod` encloses x·y | as mul slice | fast | OK | 16 | 1.5 |
| certify_sparse_prod_zero_exact | prod(x, 0) = prod(0, x) = [0, 0] | every finite x | fast | OK | 7 | 1.5 |
| interval_square_encloses_slice | exact x² ∈ result, lo ≥ 0 | x ∈ ±[1,2), 30 significant bits (full width: TIME at 600 s) | fast | OK | 78 | 1.5 |
| interval_square_contains_zero | 0 ∈ I ⇒ lo = 0 | every finite interval containing 0 | fast | OK | 7 | 1.5 |
| interval_div_encloses_slice | exact x/y ∈ result | x ∈ ±[1,2) full width, y ∈ ±[1,2) 3 bits | nightly | OK | 591 | 1.5 |
| cbmc_division_subnormal_dividend_bug | TOOL FINDING (should_panic): CBMC divides a subnormal dividend wrongly | the concrete pair above | fast | OK | 7 | 1.5 |
| interval_neg_exact | −x ∈ −I for every f64 x ∈ I; finiteness preserved | any endpoints | fast | OK | 9 | 1.5 |
| interval_mag_bounds | \|x\| ≤ mag for x ∈ I; mag is an endpoint magnitude | finite ordered I | fast | OK | 11 | 1.4 |
| interval_mul_div_sqrt_square_poison_invalid | an invalid operand (NaN, ±inf, lo > hi) never gives a finite result | any f64 endpoints, either side | fast | OK | 14 | 1.5 |
| interval_add_sub_poison_nonfinite | a NaN or ±inf endpoint (not reversed) never gives a finite result | other operand finite and ordered | fast | OK | 9 | 1.5 |
| interval_add_reversed_operand_counterexample | FINDING (should_panic): add accepts reversed operands | finite lo > hi | fast | OK | 12 | 1.5 |
| **linalg/amd.rs, sparse.rs** | | | | | | |
| inverse_perm_inverts | inverse_perm(p)[p[i]] = i and p[inverse_perm(p)[i]] = i | every permutation, each n ≤ 4 | fast | OK | 10 | 1.5 |
| csc_from_triplets_invariants | col_ptr starts at 0, is monotone and ends at nnz; rows in range, lower, strictly increasing; dense equals the mirrored triplet sum; nnz = number of distinct positions | 3 triplets at any positions in either triangle, n = 3, values 1, 2, 4 | nightly | OK | 71 | 11.4 |

### Attempted and dropped

None of these finished, so the properties are covered elsewhere.

| Harness (removed) | Result | Covered instead by |
|---|---|---|
| interval × with four symbolic endpoints | TIME at 240 s (one operand short) | per-corner `interval_mul_encloses_slice` plus the min/max structure |
| ÷ and × with symbolic exponents on both operands | TIME at 300–600 s | the slices above |
| √ enclosure (slice x ∈ [1, 4)), √ structure | TIME at 240 s | `interval_mul_div_sqrt_square_poison_invalid`; unit tests |
| Knuth TwoSum-based + enclosure | assertion failed: TwoSum overflow (see findings); then TIME | integer slices |
| dof_numbering_2d_bijection | MEM (8 GB) at 500 s with RandomState stubbed | tests/index_exhaustive.rs |
| amd_order / rcm_order permutation, every graph on 3 vertices | TIME at 600 s (5 GB) | tests/index_exhaustive.rs (every graph on ≤ 6 vertices) |
| csc_permute_symmetric_correct | TIME at 600 s, even with a concrete matrix | tests/index_exhaustive.rs |
| assembly_2d_sparse_matches_dense | not run to completion (HashMap, as for DOF numbering) | tests/index_exhaustive.rs |

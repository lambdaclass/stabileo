//! Kani bounded-model-checking harnesses. Run with `cargo kani`.
//!
//! See `docs/verification/KANI.md` for what each harness proves, under which
//! input assumptions, and the counterexamples Kani found.
//!
//! Conventions:
//! - Float inputs come from `kani::any()` constrained by `kani::assume` to
//!   physically meaningful, finite ranges (a range check also excludes NaN).
//! - Every harness implicitly proves absence of panics, out-of-bounds indexing
//!   and integer (usize) overflow on all paths reachable under the assumptions;
//!   Kani adds those checks automatically.
//! - "Bitwise" equalities compare `f64::to_bits`, i.e. exact IEEE-754 equality
//!   (stronger than `==`, which conflates +0.0/-0.0).
//! - Harnesses preceded by `// kani: nightly` are skipped on pull requests
//!   (`KANI_TIER=fast` in scripts/kani-safe.sh) and run on the nightly schedule.
//! - Harnesses marked `#[kani::should_panic]` encode a property that does NOT
//!   hold; they pass only because Kani finds a counterexample. They document
//!   findings and guard against silently "fixing" them in the docs.

use crate::element::*;
use crate::linalg::dense;
use crate::certify::interval::Interval;
use crate::linalg::sparse::CscMatrix;

// ─── helpers ────────────────────────────────────────────────────────────────

/// Symbolic f64 in the closed interval [lo, hi] (hence finite, not NaN).
fn any_in(lo: f64, hi: f64) -> f64 {
    let x: f64 = kani::any();
    kani::assume(x >= lo && x <= hi);
    x
}

/// Symbolic f64 with |x| in [lo, hi], either sign.
fn any_mag(lo: f64, hi: f64) -> f64 {
    let x: f64 = kani::any();
    kani::assume(x.abs() >= lo && x.abs() <= hi);
    x
}

/// Symbolic f64 in [-hi, hi] (zero allowed).
fn any_sym(hi: f64) -> f64 {
    any_in(-hi, hi)
}

// Physical ranges (SI-ish: kN, m).
fn any_len() -> f64 { any_in(1e-3, 1e3) }
fn any_e() -> f64 { any_in(1e3, 1e12) }
fn any_area() -> f64 { any_in(1e-8, 10.0) }
fn any_inertia() -> f64 { any_in(1e-12, 10.0) }
fn any_phi() -> f64 { any_in(0.0, 100.0) }

fn all_finite(v: &[f64]) -> bool {
    v.iter().all(|x| x.is_finite())
}

fn bitwise_symmetric(k: &[f64], n: usize) -> bool {
    let mut ok = true;
    for i in 0..n {
        for j in (i + 1)..n {
            ok &= k[i * n + j].to_bits() == k[j * n + i].to_bits();
        }
    }
    ok
}

fn diag_nonneg(k: &[f64], n: usize) -> bool {
    (0..n).all(|i| k[i * n + i] >= 0.0)
}

// ─── truss.rs ───────────────────────────────────────────────────────────────

#[kani::proof]
fn truss_local_stiffness_2d_ok() {
    let (e, a, l) = (any_e(), any_area(), any_len());
    let k = truss_local_stiffness_2d(e, a, l);
    assert!(k.len() == 16);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 4));
    assert!(k[0] > 0.0 && k[2 * 4 + 2] > 0.0);
    assert!(diag_nonneg(&k, 4));
    // Row sums are exactly zero (rigid translation produces no force).
    assert!(k[0] + k[2] == 0.0);
}

#[kani::proof]
fn truss_local_stiffness_3d_ok() {
    let (e, a, l) = (any_e(), any_area(), any_len());
    let k = truss_local_stiffness_3d(e, a, l);
    assert!(k.len() == 36);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 6));
    assert!(k[0] > 0.0 && k[3 * 6 + 3] > 0.0);
    assert!(diag_nonneg(&k, 6));
}

#[kani::proof]
fn truss_global_stiffness_2d_ok() {
    let (e, a, l) = (any_e(), any_area(), any_len());
    let c = any_sym(1.0);
    let s = any_sym(1.0);
    let k = truss_global_stiffness_2d(e, a, l, c, s);
    assert!(k.len() == 16);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 4));
    assert!(diag_nonneg(&k, 4));
}

/// Finiteness, non-negative diagonal and the exact block structure
/// K = [[B, -B], [-B, B]] of the direct 3D truss global stiffness.
#[kani::proof]
fn truss_global_stiffness_3d_finite_and_blocks() {
    let (e, a, l) = (any_e(), any_area(), any_len());
    // Direction components with |d| <= L (they are projections of L).
    let dx = any_in(-l, l);
    let dy = any_in(-l, l);
    let dz = any_in(-l, l);
    let k = truss_global_stiffness_3d(e, a, l, dx, dy, dz);
    assert!(k.len() == 36);
    assert!(all_finite(&k));
    assert!(diag_nonneg(&k, 6));
    for i in 0..3 {
        for j in 0..3 {
            let b = k[i * 6 + j];
            assert!(k[i * 6 + j + 3] == -b);
            assert!(k[(i + 3) * 6 + j] == -b);
            assert!(k[(i + 3) * 6 + j + 3].to_bits() == b.to_bits());
        }
    }
}

/// FINDING: the direct 3D truss global stiffness is NOT bitwise symmetric.
/// k[i][j] = (ea_l*dir[i])*dir[j] and k[j][i] = (ea_l*dir[j])*dir[i] round
/// differently. This harness asserts symmetry and is expected to FAIL.
#[kani::proof]
#[kani::should_panic]
fn truss_global_stiffness_3d_symmetry_counterexample() {
    let (e, a, l) = (any_e(), any_area(), any_len());
    let dx = any_in(-l, l);
    let dy = any_in(-l, l);
    let k = truss_global_stiffness_3d(e, a, l, dx, dy, 0.0);
    assert!(k[0 * 6 + 1].to_bits() == k[1 * 6 + 0].to_bits());
}

// ─── frame.rs ───────────────────────────────────────────────────────────────

// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
fn frame_local_stiffness_2d_ok() {
    let (e, a, iz, l) = (any_e(), any_area(), any_inertia(), any_len());
    let phi = any_phi();
    let hs: bool = kani::any();
    let he: bool = kani::any();
    let k = frame_local_stiffness_2d(e, a, iz, l, hs, he, phi);
    assert!(k.len() == 36);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 6));
    assert!(diag_nonneg(&k, 6));
    // Axial diagonal always strictly positive.
    assert!(k[0] > 0.0 && k[3 * 6 + 3] > 0.0);
    // Transverse translational stiffness strictly positive unless both ends hinged.
    if !(hs && he) {
        assert!(k[1 * 6 + 1] > 0.0 && k[4 * 6 + 4] > 0.0);
    }
    // Released rotations have exactly zero row/column.
    if hs {
        for j in 0..6 {
            assert!(k[2 * 6 + j] == 0.0 && k[j * 6 + 2] == 0.0);
        }
    } else {
        assert!(k[2 * 6 + 2] > 0.0);
    }
    if he {
        for j in 0..6 {
            assert!(k[5 * 6 + j] == 0.0 && k[j * 6 + 5] == 0.0);
        }
    } else {
        assert!(k[5 * 6 + 5] > 0.0);
    }
}

fn any_hinge3d() -> Hinge3D {
    Hinge3D {
        release_my_start: kani::any(),
        release_mz_start: kani::any(),
        release_t_start: kani::any(),
        release_my_end: kani::any(),
        release_mz_end: kani::any(),
        release_t_end: kani::any(),
    }
}

// The 3D frame stiffness is verified compositionally. CBMC bit-blasts every f64
// operation, so the monolithic harness (10 symbolic floats x 64 hinge
// combinations) needed > 80 GB. Instead:
//   1. `bending_block_*` prove each release case of `add_bending_block` alone:
//      finite, bitwise symmetric, non-negative diagonal, positive v1 diagonal.
//   2. `frame_local_stiffness_3d_ok` stubs `add_bending_block` with
//      `add_bending_block_stub`, which may write any finite symmetric values with
//      a non-negative diagonal to any subset of the symmetric pairs of its four
//      DOFs. By (1) that over-approximates the real block, so the assembly
//      properties proven with the stub hold for the real function.
//   3. `torsion_warping_block_ok` proves the torsion-warping 4x4 block alone, and
//      `frame_local_stiffness_3d_warping_ok` stubs both the 12x12 matrix
//      (justified by (2)) and that block (justified by (3)) to check how the
//      14x14 matrix is assembled from them.

fn bending_block_case(release_start: bool, release_end: bool) {
    let e = any_e();
    let i = any_inertia();
    let l = any_len();
    let phi = any_phi();
    let s = if kani::any() { 1.0 } else { -1.0 };
    let mut k = [0.0f64; 16];
    add_bending_block(&mut k, 4, 0, 1, 2, 3, e, i, l, l * l, l * l * l, phi, s, release_start, release_end);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 4));
    assert!(diag_nonneg(&k, 4));
    if !(release_start && release_end) {
        assert!(k[0] > 0.0 && k[2 * 4 + 2] > 0.0);
    }
}

#[kani::proof]
fn bending_block_fixed_ok() { bending_block_case(false, false) }

#[kani::proof]
fn bending_block_release_start_ok() { bending_block_case(true, false) }

#[kani::proof]
fn bending_block_release_end_ok() { bending_block_case(false, true) }

#[kani::proof]
fn bending_block_released_both_ok() { bending_block_case(true, true) }

/// Over-approximation of `add_bending_block` (see the note above).
#[allow(clippy::too_many_arguments)]
fn add_bending_block_stub(
    k: &mut [f64], n: usize,
    v1: usize, r1: usize, v2: usize, r2: usize,
    _e: f64, _i: f64, _l: f64, _l2: f64, _l3: f64, _phi: f64, _s: f64,
    _release_start: bool, _release_end: bool,
) {
    let idx = [v1, r1, v2, r2];
    for p in 0..4 {
        for q in p..4 {
            if kani::any() {
                let x: f64 = kani::any();
                kani::assume(x.is_finite() && (p != q || x >= 0.0));
                k[idx[p] * n + idx[q]] = x;
                k[idx[q] * n + idx[p]] = x;
            }
        }
    }
}

#[kani::proof]
#[kani::stub(add_bending_block, add_bending_block_stub)]
fn frame_local_stiffness_3d_ok() {
    let e = any_e();
    let a = any_area();
    let iy = any_inertia();
    let iz = any_inertia();
    let j = any_inertia();
    let l = any_len();
    let g = any_in(1e2, 1e12);
    let phi_y = any_phi();
    let phi_z = any_phi();
    let h = any_hinge3d();
    let k = frame_local_stiffness_3d(e, a, iy, iz, j, l, g, h, phi_y, phi_z);
    assert!(k.len() == 144);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 12));
    assert!(diag_nonneg(&k, 12));
    assert!(k[0] > 0.0 && k[6 * 12 + 6] > 0.0);
    if !h.release_t_start && !h.release_t_end {
        assert!(k[3 * 12 + 3] > 0.0 && k[9 * 12 + 9] > 0.0);
    }
}

/// Over-approximation of `frame_local_stiffness_3d`, justified by
/// `frame_local_stiffness_3d_ok`: any finite symmetric 12x12 with a
/// non-negative diagonal.
#[allow(clippy::too_many_arguments)]
fn frame_local_stiffness_3d_stub(
    _e: f64, _a: f64, _iy: f64, _iz: f64, _j: f64, _l: f64, _g: f64,
    _hinge: Hinge3D, _phi_y: f64, _phi_z: f64,
) -> Vec<f64> {
    let mut k = vec![0.0; 144];
    for p in 0..12 {
        for q in p..12 {
            let x: f64 = kani::any();
            kani::assume(x.is_finite() && (p != q || x >= 0.0));
            k[p * 12 + q] = x;
            k[q * 12 + p] = x;
        }
    }
    k
}

/// The torsion-warping block alone: finite, bitwise symmetric, non-negative
/// diagonal. `gj = G·J ≥ 1e2·1e-12`; `ecw = E·Cw` is exactly 0 (no warping) or
/// ≥ 1e-9. (Before the block computed each term once, proving two separately
/// rounded copies of `6·ecw/l²` equal did not finish in 15 minutes.)
#[kani::proof]
fn torsion_warping_block_ok() {
    let gj = any_in(1e-10, 1e13);
    let ecw = if kani::any() { 0.0 } else { any_in(1e-9, 1e12) };
    let l = any_len();
    let k = torsion_warping_block(gj, ecw, l, l * l, l * l * l);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 4));
    assert!(diag_nonneg(&k, 4));
}

/// Over-approximation of `torsion_warping_block`, justified by
/// `torsion_warping_block_ok`.
fn torsion_warping_block_stub(_gj: f64, _ecw: f64, _l: f64, _l2: f64, _l3: f64) -> [f64; 16] {
    let mut k = [0.0; 16];
    for p in 0..4 {
        for q in p..4 {
            let x: f64 = kani::any();
            kani::assume(x.is_finite() && (p != q || x >= 0.0));
            k[p * 4 + q] = x;
            k[q * 4 + p] = x;
        }
    }
    k
}

// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
#[kani::stub(frame_local_stiffness_3d, frame_local_stiffness_3d_stub)]
#[kani::stub(torsion_warping_block, torsion_warping_block_stub)]
fn frame_local_stiffness_3d_warping_ok() {
    let e = any_e();
    let a = any_area();
    let iy = any_inertia();
    let iz = any_inertia();
    let j = any_inertia();
    let cw = any_in(0.0, 1.0);
    let l = any_len();
    let g = any_in(1e2, 1e12);
    let phi_y = any_phi();
    let phi_z = any_phi();
    let h = any_hinge3d();
    let k = frame_local_stiffness_3d_warping(e, a, iy, iz, j, cw, l, g, h, phi_y, phi_z);
    assert!(k.len() == 196);
    assert!(all_finite(&k));
    assert!(bitwise_symmetric(&k, 14));
    assert!(diag_nonneg(&k, 14));
}

// ─── transform.rs ───────────────────────────────────────────────────────────

#[kani::proof]
fn frame_transform_2d_structure() {
    let c = any_sym(1.0);
    let s = any_sym(1.0);
    let t = frame_transform_2d(c, s);
    assert!(t.len() == 36);
    assert!(all_finite(&t));
    // Exact block structure: two identical rotation blocks + unit rotation DOFs.
    for b in [0usize, 3] {
        assert!(t[b * 6 + b] == c && t[b * 6 + b + 1] == s);
        assert!(t[(b + 1) * 6 + b] == -s && t[(b + 1) * 6 + b + 1] == c);
        assert!(t[(b + 2) * 6 + b + 2] == 1.0);
    }
}

#[kani::proof]
fn truss_transform_2d_structure() {
    let c = any_sym(1.0);
    let s = any_sym(1.0);
    let t = truss_transform_2d(c, s);
    assert!(t.len() == 16);
    assert!(all_finite(&t));
    assert!(t[0] == t[2 * 4 + 2] && t[1] == t[2 * 4 + 3]);
    assert!(t[4] == -s && t[3 * 4 + 2] == -s);
}

#[kani::proof]
fn frame_transform_3d_structure() {
    let ex = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let ey = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let ez = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let t = frame_transform_3d(&ex, &ey, &ez);
    assert!(t.len() == 144);
    assert!(all_finite(&t));
    let r: usize = kani::any();
    let c: usize = kani::any();
    kani::assume(r < 12 && c < 12);
    let v = t[r * 12 + c];
    if r / 3 != c / 3 {
        assert!(v == 0.0);
    } else {
        let row = [ex, ey, ez][r % 3];
        assert!(v == row[c % 3]);
    }
}

#[kani::proof]
fn frame_transform_3d_warping_structure() {
    let ex = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let ey = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let ez = [any_sym(1.0), any_sym(1.0), any_sym(1.0)];
    let t = frame_transform_3d_warping(&ex, &ey, &ez);
    assert!(t.len() == 196);
    assert!(all_finite(&t));
    assert!(t[6 * 14 + 6] == 1.0 && t[13 * 14 + 13] == 1.0);
    let r: usize = kani::any();
    let c: usize = kani::any();
    kani::assume(r < 14 && c < 14);
    // Warping rows/cols are identity.
    if (r == 6 || r == 13 || c == 6 || c == 13) && r != c {
        assert!(t[r * 14 + c] == 0.0);
    }
}

// compute_local_axes_3d: Kani proves the composition, with the three numeric
// helpers stubbed by their contracts. The contracts themselves involve sqrt
// normalization (e.g. |dᵢ/√(Σd²)| ≤ 1), which CBMC does not finish within 20
// minutes even per helper, so they are checked by unit tests instead
// (element::transform::tests::local_axes_helper_contracts: edge cases plus
// 200k random directions):
//   1. unit_direction: for max |dᵢ| ≥ 1e-3, ex is finite, |exᵢ| ≤ 1 + 1e-12,
//      ex·ex ≥ 0.99.
//   2. default_ey_ref: for such ex, finite with components ≤ 1.01.
//   3. orthonormal_frame: for such ex and ey_ref, ey and ez finite.

fn any_unit_like() -> [f64; 3] {
    let e = [any_sym(1.0 + 1e-12), any_sym(1.0 + 1e-12), any_sym(1.0 + 1e-12)];
    kani::assume(e[0] * e[0] + e[1] * e[1] + e[2] * e[2] >= 0.99);
    e
}

/// Member direction components with max |dᵢ| ≥ 1e-3 (so L ≥ 1e-3).
fn any_member_direction() -> (f64, f64, f64) {
    let (dx, dy, dz) = (any_sym(1e3), any_sym(1e3), any_sym(1e3));
    kani::assume(dx.abs() >= 1e-3 || dy.abs() >= 1e-3 || dz.abs() >= 1e-3);
    (dx, dy, dz)
}

fn unit_direction_stub(_dx: f64, _dy: f64, _dz: f64) -> [f64; 3] {
    any_unit_like()
}

fn default_ey_ref_stub(_ex: &[f64; 3]) -> [f64; 3] {
    [any_sym(1.01), any_sym(1.01), any_sym(1.01)]
}

fn orthonormal_frame_stub(_ex: &[f64; 3], _r: &[f64; 3]) -> ([f64; 3], [f64; 3]) {
    let v: [f64; 6] = kani::any();
    kani::assume(v.iter().all(|x| x.is_finite()));
    ([v[0], v[1], v[2]], [v[3], v[4], v[5]])
}

/// compute_local_axes_3d with the default (Z-up) convention, no explicit local
/// Y, no roll: no panic and all outputs finite for members with L >= 1e-3.
#[kani::proof]
#[kani::stub(unit_direction, unit_direction_stub)]
#[kani::stub(default_ey_ref, default_ey_ref_stub)]
#[kani::stub(orthonormal_frame, orthonormal_frame_stub)]
fn compute_local_axes_3d_default_finite() {
    let (dx, dy, dz) = any_member_direction();
    let lh: bool = kani::any();
    let (ex, ey, ez) =
        compute_local_axes_3d(0.0, 0.0, 0.0, dx, dy, dz, None, None, None, None, lh);
    assert!(all_finite(&ex) && all_finite(&ey) && all_finite(&ez));
}

// ─── fef.rs ─────────────────────────────────────────────────────────────────

fn any_q() -> f64 { any_sym(1e6) }

#[kani::proof]
fn fef_distributed_2d_ok() {
    let (qi, qj, l, phi) = (any_q(), any_q(), any_len(), any_phi());
    let f = fef_distributed_2d(qi, qj, l, phi);
    assert!(all_finite(&f));
    assert!(f[0] == 0.0 && f[3] == 0.0);
}

// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
fn fef_point_load_2d_ok() {
    let l = any_len();
    let a = any_in(0.0, l);
    let (p, px, m, phi) = (any_q(), any_q(), any_q(), any_phi());
    let f = fef_point_load_2d(p, px, m, a, l, phi);
    assert!(all_finite(&f));
}

#[kani::proof]
fn fef_thermal_2d_ok() {
    let (e, a, iz, l) = (any_e(), any_area(), any_inertia(), any_len());
    let dtu = any_sym(1e3);
    let dtg = any_sym(1e3);
    let alpha = any_in(0.0, 1e-4);
    let h = any_in(0.0, 10.0);
    let f = fef_thermal_2d(e, a, iz, l, dtu, dtg, alpha, h);
    assert!(all_finite(&f));
    // Self-equilibrated: exact negation between ends.
    assert!(f[0] == -f[3] && f[2] == -f[5]);
}

#[kani::proof]
fn adjust_fef_for_hinges_ok() {
    let l = any_len();
    let phi = any_phi();
    let mut f = [0.0, any_q(), any_q(), 0.0, any_q(), any_q()];
    let hs: bool = kani::any();
    let he: bool = kani::any();
    let before = f;
    adjust_fef_for_hinges(&mut f, l, hs, he, phi);
    assert!(all_finite(&f));
    if hs { assert!(f[2] == 0.0); }
    if he { assert!(f[5] == 0.0); }
    if !hs && !he {
        for i in 0..6 { assert!(f[i].to_bits() == before[i].to_bits()); }
    }
    // Axial entries never touched.
    assert!(f[0] == 0.0 && f[3] == 0.0);
}

// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
fn adjust_fef_for_hinges_3d_ok() {
    let l = any_len();
    let (py, pz) = (any_phi(), any_phi());
    let mut f = [0.0; 12];
    for i in [1usize, 2, 4, 5, 7, 8, 10, 11] {
        f[i] = any_q();
    }
    let h = any_hinge3d();
    adjust_fef_for_hinges_3d(&mut f, l, h, py, pz);
    assert!(all_finite(&f));
    if h.release_mz_start { assert!(f[5] == 0.0); }
    if h.release_mz_end { assert!(f[11] == 0.0); }
    if h.release_my_start { assert!(f[4] == 0.0); }
    if h.release_my_end { assert!(f[10] == 0.0); }
}

#[kani::proof]
fn expand_fef_12_to_14_ok() {
    let f12: [f64; 12] = kani::any();
    let f14 = expand_fef_12_to_14(&f12);
    for i in 0..6 {
        assert!(f14[i].to_bits() == f12[i].to_bits());
        assert!(f14[7 + i].to_bits() == f12[6 + i].to_bits());
    }
    assert!(f14[6] == 0.0 && f14[13] == 0.0);
}

#[kani::proof]
fn axial_distributed_fef_ok() {
    let l = any_len();
    let a = any_in(0.0, l);
    let b = any_in(0.0, l);
    let (qi, qj) = (any_q(), any_q());
    let f = axial_distributed_fef(qi, qj, a, b, l);
    assert!(all_finite(&f));
}

// ─── linalg/dense.rs ────────────────────────────────────────────────────────

const NMAX: usize = 3;

// The dense helpers' bounds harnesses check indexing and lengths, which do not
// depend on the float values, so the arrays are concrete: the proof covers
// every size n ≤ NMAX. (Symbolic floats added nothing but CBMC cost — over
// 12 GB — and NaN reports from ∞·0 that say nothing about indexing.)

#[kani::proof]
#[kani::unwind(4)]
fn dense_mat_vec_bounds() {
    let n: usize = kani::any();
    kani::assume(n <= NMAX);
    let a = [1.0f64; NMAX * NMAX];
    let x = [1.0f64; NMAX];
    let y = dense::mat_vec(&a[..n * n], &x[..n], n);
    assert!(y.len() == n);
}

#[kani::proof]
#[kani::unwind(4)]
fn dense_mat_vec_rect_bounds() {
    let nr: usize = kani::any();
    let nc: usize = kani::any();
    kani::assume(nr <= NMAX && nc <= NMAX);
    let a = [1.0f64; NMAX * NMAX];
    let x = [1.0f64; NMAX];
    let y = dense::mat_vec_rect(&a[..nr * nc], &x[..nc], nr, nc);
    assert!(y.len() == nr);
}

/// Every size n ≤ NMAX, one concrete instance each (a symbolic n makes CBMC
/// model an n·n allocation and n³ loop of unknown size: > 12 GB).
#[kani::proof]
#[kani::unwind(10)]
fn dense_mat_mul_bounds() {
    let a = [1.0f64; NMAX * NMAX];
    let b = [1.0f64; NMAX * NMAX];
    for n in 0..=NMAX {
        let c = dense::mat_mul(&a[..n * n], &b[..n * n], n);
        assert!(c.len() == n * n);
    }
}

/// Transpose moves (i,j) to (j,i) and is an involution. It only moves data,
/// so distinct tags (k as f64) identify the permutation for every input.
#[kani::proof]
#[kani::unwind(17)]
fn dense_transpose_involution() {
    let mut orig = [0.0f64; 16];
    for (k, v) in orig.iter_mut().enumerate() {
        *v = k as f64;
    }
    for n in 0..=4 {
        let mut a = orig;
        dense::transpose_inplace(&mut a[..n * n], n);
        for i in 0..n {
            for j in 0..n {
                assert!(a[i * n + j] == orig[j * n + i]);
            }
        }
        dense::transpose_inplace(&mut a[..n * n], n);
        for k in 0..16 {
            assert!(a[k] == orig[k]);
        }
    }
}

#[kani::proof]
#[kani::unwind(4)]
fn dense_transform_force_displacement_bounds() {
    let n: usize = kani::any();
    kani::assume(n <= NMAX);
    let t = [1.0f64; NMAX * NMAX];
    let f = [1.0f64; NMAX];
    let g = dense::transform_force(&f[..n], &t[..n * n], n);
    let u = dense::transform_displacement(&f[..n], &t[..n * n], n);
    assert!(g.len() == n && u.len() == n);
}

#[kani::proof]
#[kani::unwind(10)]
fn dense_transform_stiffness_bounds() {
    let k = [1.0f64; NMAX * NMAX];
    let t = [1.0f64; NMAX * NMAX];
    for n in 0..=NMAX {
        let r = dense::transform_stiffness(&k[..n * n], &t[..n * n], n);
        assert!(r.len() == n * n);
    }
}

/// FINDING candidate: does Tᵀ K T preserve bitwise symmetry? Uses the real
/// 2D truss local stiffness and transform (n = 4). Expected to FAIL.
// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
#[kani::should_panic]
fn transform_stiffness_truss_2d_symmetry_counterexample() {
    let ea = any_in(1e-3, 1e9);
    let c = any_sym(1.0);
    let s = any_sym(1.0);
    let k = truss_local_stiffness_2d(ea, 1.0, 1.0);
    let t = truss_transform_2d(c, s);
    let kg = dense::transform_stiffness(&k, &t, 4);
    assert!(bitwise_symmetric(&kg, 4));
}

// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
#[kani::unwind(4)]
fn dense_extract_submatrix_exact() {
    let n: usize = kani::any();
    kani::assume(n >= 1 && n <= NMAX);
    let a: [f64; NMAX * NMAX] = kani::any();
    let nr: usize = kani::any();
    let nc: usize = kani::any();
    kani::assume(nr <= 2 && nc <= 2);
    let rows: [usize; 2] = kani::any();
    let cols: [usize; 2] = kani::any();
    kani::assume(rows.iter().all(|&r| r < n) && cols.iter().all(|&c| c < n));
    let sub = dense::extract_submatrix(&a[..n * n], n, &rows[..nr], &cols[..nc]);
    assert!(sub.len() == nr * nc);
    let i: usize = kani::any();
    let j: usize = kani::any();
    kani::assume(i < nr && j < nc);
    assert!(sub[i * nc + j].to_bits() == a[rows[i] * n + cols[j]].to_bits());
}

#[kani::proof]
#[kani::unwind(4)]
fn dense_extract_scatter_subvec_roundtrip() {
    let v: [f64; NMAX] = kani::any();
    let m: usize = kani::any();
    kani::assume(m <= NMAX);
    let idx: [usize; NMAX] = kani::any();
    kani::assume(idx.iter().all(|&i| i < NMAX));
    let sub = dense::extract_subvec(&v, &idx[..m]);
    assert!(sub.len() == m);
    let mut full = [0.0f64; NMAX];
    dense::scatter_subvec(&mut full, &idx[..m], &sub);
    for k in 0..m {
        assert!(full[idx[k]].to_bits() == v[idx[k]].to_bits());
    }
}

// ─── certify/interval.rs: outward-rounded interval arithmetic ───────────────
//
// What is proved, and how (details and the full table: docs/verification/KANI.md):
//
// 1. Structure, over every finite input: for + and −, each endpoint is the
//    outward neighbour (next_down / next_up) of the round-to-nearest result of
//    the endpoint operation and overflow yields a non-finite interval; NaN,
//    ±inf and reversed operands poison mul/div/sqrt/square; neg and mag are
//    exact. (The same structural statement for × over every finite input did
//    not finish in 5 minutes.)
// 2. Enclosure, i.e. that the exact real result lies in the computed interval,
//    checked against exact integer arithmetic (no float in the check, no
//    assumed theorem): a finite f64 is exactly ±m·2^e (`dyadic`), a product of
//    two is ±(m₁m₂)·2^(e₁+e₂) in a u128, a sum of two with exponents within 70
//    binades fits an i128, and `cmp_exact` compares such numbers exactly.
//
// Enclosure is proved on scale slices: one operand has a fixed binade
// (x ∈ ±[1, 2)), the other ranges over the relevant binades. IEEE-754
// operations are scale invariant away from overflow and underflow
// (rn(2^k·v) = 2^k·rn(v), and next_up/next_down scale likewise), so a slice
// covers every operand pair whose result stays in the normal range; the
// remaining ranges rest on (1) plus IEEE correct rounding. With symbolic
// exponents on both operands CBMC did not finish in 5–10 minutes (comparing a
// float multiplier against an integer one is a multiplier-equivalence
// problem, hard for SAT); with the exponents fixed, full-width × takes ~30 s.
// ÷ finishes only with a 3-bit divisor (nightly), x² with 30 bits, and √ not
// at all; the fma-based unit tests in certify/interval.rs cover the rest.
//
// From endpoints to every real in the operand intervals: +, − and × (bilinear)
// attain their extremes over a box at corners, x² is monotone in |x|, ÷ and √
// are monotone; the interval code takes min/max over the corner results
// (read from the code; proved by Kani only for + and −, whose endpoints use
// one corner each).
//
// TOOL FINDING: CBMC 6.11 (Kani 0.68) bit-blasts f64 division wrongly when
// the dividend is subnormal: 0x752 / 0x3bcd800000000000 (9.26e-321 /
// 1.249e-20) gives 7.4105141e-301 instead of the IEEE 7.4107459e-301 (the
// significand keeps only the dividend's 11 bits). Constant folding is
// correct, the symbolic encoding is not. Division harnesses must therefore
// keep dividends normal; `cbmc_division_subnormal_dividend_bug` tracks it.

type Dyadic = (bool, u128, i32); // (negative, m, e): value ±m·2^e

/// Exact value of a finite f64 (subnormals included; ±0 → m = 0).
fn dyadic(x: f64) -> Dyadic {
    let b = x.to_bits();
    let neg = (b >> 63) == 1;
    let ex = ((b >> 52) & 0x7ff) as i32;
    let fr = (b & ((1u64 << 52) - 1)) as u128;
    if ex == 0 { (neg, fr, -1074) } else { (neg, fr | (1u128 << 52), ex - 1075) }
}

/// Exact product of two finite f64.
fn dyadic_mul(x: f64, y: f64) -> Dyadic {
    let (na, ma, ea) = dyadic(x);
    let (nb, mb, eb) = dyadic(y);
    (na != nb, ma * mb, ea + eb)
}

/// Exact comparison of nonnegative m₁·2^e₁ and m₂·2^e₂: −1, 0 or 1.
fn cmp_mag(m1: u128, e1: i32, m2: u128, e2: i32) -> i32 {
    if m1 == 0 || m2 == 0 {
        return (m1 != 0) as i32 - (m2 != 0) as i32;
    }
    let b1 = 128 - m1.leading_zeros() as i32;
    let b2 = 128 - m2.leading_zeros() as i32;
    // Position of the leading bit decides unless equal; then align the
    // mantissas to the same bit length (both stay < 2^128) and compare.
    if e1 + b1 != e2 + b2 {
        return if e1 + b1 > e2 + b2 { 1 } else { -1 };
    }
    let (a, b) = if b1 < b2 { (m1 << (b2 - b1) as u32, m2) } else { (m1, m2 << (b1 - b2) as u32) };
    (a > b) as i32 - (a < b) as i32
}

/// Exact comparison of two dyadic numbers: −1, 0 or 1.
fn cmp_exact(x: Dyadic, y: Dyadic) -> i32 {
    let sx = if x.1 == 0 { 0 } else if x.0 { -1 } else { 1 };
    let sy = if y.1 == 0 { 0 } else if y.0 { -1 } else { 1 };
    if sx != sy {
        return if sx > sy { 1 } else { -1 };
    }
    if sx == 0 {
        return 0;
    }
    let c = cmp_mag(x.1, x.2, y.1, y.2);
    if sx > 0 { c } else { -c }
}

/// f64 `lo` ≤ exact value `v` ≤ f64 `hi`.
fn dyadic_in(v: Dyadic, lo: f64, hi: f64) -> bool {
    cmp_exact(dyadic(lo), v) <= 0 && cmp_exact(v, dyadic(hi)) <= 0
}

/// Sanity of the exact comparator against IEEE comparison (which is exact).
#[kani::proof]
fn dyadic_cmp_matches_ieee() {
    let x: f64 = kani::any();
    let y: f64 = kani::any();
    kani::assume(x.is_finite() && y.is_finite());
    let c = cmp_exact(dyadic(x), dyadic(y));
    assert!((c < 0) == (x < y) && (c == 0) == (x == y) && (c > 0) == (x > y));
}

/// Exact comparison of x + y with z, using integers only; None when the
/// nonzero operands' exponents are more than 70 binades apart.
fn cmp_sum_exact(x: f64, y: f64, z: f64) -> Option<i32> {
    let (dx, dy) = (dyadic(x), dyadic(y));
    let emin = if dx.1 == 0 { dy.2 } else if dy.1 == 0 { dx.2 } else { dx.2.min(dy.2) };
    if dx.1 != 0 && dy.1 != 0 && (dx.2 - dy.2).abs() > 70 {
        return None;
    }
    let int = |d: Dyadic| -> i128 {
        if d.1 == 0 { 0 } else {
            let m = (d.1 << (d.2 - emin) as u32) as i128; // < 2^124
            if d.0 { -m } else { m }
        }
    };
    let sum = int(dx) + int(dy);
    Some(cmp_exact((sum < 0, sum.unsigned_abs(), emin), dyadic(z)))
}

/// f64 from sign, biased exponent and fraction bits.
fn float_from(neg: bool, exp: u64, frac: u64) -> f64 {
    f64::from_bits(((neg as u64) << 63) | (exp << 52) | (frac & ((1u64 << 52) - 1)))
}

/// Symbolic interval with finite ordered endpoints.
fn any_interval() -> Interval {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    kani::assume(lo.is_finite() && hi.is_finite() && lo <= hi);
    Interval::new(lo, hi)
}

/// Symbolic x ∈ ±[1, 2), full 53-bit significand.
fn any_unit() -> f64 {
    float_from(kani::any(), 1023, kani::any())
}

/// Symbolic x ∈ ±[1, 2) with at most `k` significant bits.
fn any_unit_short(k: u32) -> f64 {
    let f: u64 = kani::any();
    float_from(kani::any(), 1023, f & !((1u64 << (52 - k)) - 1))
}

/// Point + over every finite input: the endpoints are exactly the outward
/// neighbours of rn(x+y), strictly around it; overflow gives a non-finite
/// interval. Interval + computes each endpoint this way from the matching
/// endpoints, so this covers the general operation.
#[kani::proof]
fn interval_add_structure() {
    let x: f64 = kani::any();
    let y: f64 = kani::any();
    kani::assume(x.is_finite() && y.is_finite());
    let r = Interval::point(x) + Interval::point(y);
    let s = x + y;
    if s.is_finite() {
        assert!(r.lo.to_bits() == s.next_down().to_bits() && r.hi.to_bits() == s.next_up().to_bits());
        assert!(r.lo < s && s < r.hi);
    } else {
        assert!(!r.is_finite());
    }
}

/// Point − over every finite input (as for +).
#[kani::proof]
fn interval_sub_structure() {
    let x: f64 = kani::any();
    let y: f64 = kani::any();
    kani::assume(x.is_finite() && y.is_finite());
    let r = Interval::point(x) - Interval::point(y);
    let s = x - y;
    if s.is_finite() {
        assert!(r.lo.to_bits() == s.next_down().to_bits() && r.hi.to_bits() == s.next_up().to_bits());
        assert!(r.lo < s && s < r.hi);
    } else {
        assert!(!r.is_finite());
    }
}

/// + encloses the exact sum: x ∈ ±[1, 2), y ∈ ±2^−d·[1, 2) for d ≤ 70
/// (either sign, so cancellation down to exact zero is included).
#[kani::proof]
fn interval_add_encloses_slice() {
    let x = any_unit();
    let d: u64 = kani::any();
    kani::assume(d <= 70);
    let y = float_from(kani::any(), 1023 - d, kani::any());
    let r = Interval::point(x) + Interval::point(y);
    assert!(cmp_sum_exact(x, y, r.lo).unwrap() >= 0 && cmp_sum_exact(x, y, r.hi).unwrap() <= 0);
}

/// + encloses the exact sum when |y| < 2^−70·|x| (y possibly subnormal or 0):
/// rn(x+y) = x, and both neighbours of x are at least 2^−53 away.
#[kani::proof]
fn interval_add_encloses_far() {
    let x = any_unit();
    let y: f64 = kani::any();
    kani::assume(y.is_finite() && y.abs() < 1.0 / (1u128 << 70) as f64);
    let r = Interval::point(x) + Interval::point(y);
    assert!(r.lo.to_bits() == x.next_down().to_bits() && r.hi.to_bits() == x.next_up().to_bits());
    let gap = 1.0 / (1u64 << 53) as f64;
    assert!(x - r.lo >= gap && r.hi - x >= gap); // exact (Sterbenz), > |y|
}

/// − encloses the exact difference on the same slice as +.
// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
fn interval_sub_encloses_slice() {
    let x = any_unit();
    let d: u64 = kani::any();
    kani::assume(d <= 70);
    let y = float_from(kani::any(), 1023 - d, kani::any());
    let r = Interval::point(x) - Interval::point(y);
    assert!(cmp_sum_exact(x, -y, r.lo).unwrap() >= 0 && cmp_sum_exact(x, -y, r.hi).unwrap() <= 0);
}

/// × encloses the exact product: x, y ∈ ±[1, 2), both full width (with the
/// exponents fixed CBMC handles the 53×53 multiplier comparison in ~30 s).
#[kani::proof]
fn interval_mul_encloses_slice() {
    let (x, y) = (any_unit(), any_unit());
    let r = Interval::point(x) * Interval::point(y);
    assert!(dyadic_in(dyadic_mul(x, y), r.lo, r.hi));
}

/// `certify::sparse::prod` encloses the exact product (same slice as ×).
#[kani::proof]
fn certify_sparse_prod_encloses_slice() {
    let (x, y) = (any_unit(), any_unit());
    let r = crate::certify::sparse::prod(x, y);
    assert!(dyadic_in(dyadic_mul(x, y), r.lo, r.hi));
}

/// `certify::sparse::prod` is the exact zero for a zero factor, and otherwise
/// the outward neighbours of rn(x·y) (non-finite on overflow).
#[kani::proof]
fn certify_sparse_prod_zero_exact() {
    let x: f64 = kani::any();
    kani::assume(x.is_finite());
    let r = crate::certify::sparse::prod(x, 0.0);
    assert!(r.lo == 0.0 && r.hi == 0.0);
    let r = crate::certify::sparse::prod(0.0, x);
    assert!(r.lo == 0.0 && r.hi == 0.0);
}

/// x² encloses the exact square: x ∈ ±[1, 2) with 30 significant bits (the
/// square has up to 60 bits, so rounding is exercised; full width did not
/// finish in 10 minutes).
#[kani::proof]
fn interval_square_encloses_slice() {
    let x = any_unit_short(30);
    let r = Interval::point(x).square();
    assert!(r.lo >= 0.0);
    assert!(dyadic_in(dyadic_mul(x, x), r.lo, r.hi));
}

/// x² over an interval containing 0 starts at exactly 0 and is ordered.
#[kani::proof]
fn interval_square_contains_zero() {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    kani::assume(lo.is_finite() && hi.is_finite() && lo <= 0.0 && 0.0 <= hi);
    let r = Interval::new(lo, hi).square();
    assert!(r.lo == 0.0 && (r.hi >= 0.0 || r.hi.is_nan() || r.hi.is_infinite()));
}

/// Exact q = x / y lies in [lo, hi] (y ≠ 0): lo·y ≤ x ≤ hi·y for y > 0,
/// reversed for y < 0. Products are exact dyadics.
fn quotient_in(x: f64, y: f64, lo: f64, hi: f64) -> bool {
    let (ly, hy, xx) = (dyadic_mul(lo, y), dyadic_mul(hi, y), dyadic(x));
    if y > 0.0 {
        cmp_exact(ly, xx) <= 0 && cmp_exact(xx, hy) <= 0
    } else {
        cmp_exact(ly, xx) >= 0 && cmp_exact(xx, hy) >= 0
    }
}

/// ÷ encloses the exact quotient on a slice with a 3-bit divisor (591 s;
/// wider divisors time out).
// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
fn interval_div_encloses_slice() {
    let (x, y) = (any_unit(), any_unit_short(3));
    let r = Interval::point(x).div(Interval::point(y));
    assert!(quotient_in(x, y, r.lo, r.hi));
}

/// TOOL FINDING (see the section comment): CBMC's symbolic f64 division is
/// wrong for a subnormal dividend. Asserts the IEEE result, so it fails
/// (and this should_panic harness passes) while the CBMC bug is present.
#[kani::proof]
#[kani::should_panic]
fn cbmc_division_subnormal_dividend_bug() {
    let xb: u64 = kani::any();
    let yb: u64 = kani::any();
    kani::assume(xb == 0x752 && yb == 0x3bcd_8000_0000_0000);
    let q = f64::from_bits(xb) / f64::from_bits(yb);
    assert!(q.to_bits() == 0x019f_c341_15b1_e5f7); // IEEE 754 (native) result
}

/// Negation is exact: −x ∈ −a for every f64 x ∈ a, and finiteness is kept.
#[kani::proof]
fn interval_neg_exact() {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    let a = Interval::new(lo, hi);
    let r = -a;
    assert!(r.is_finite() == a.is_finite());
    let x: f64 = kani::any();
    kani::assume(a.is_finite() && lo <= x && x <= hi);
    assert!(r.lo <= -x && -x <= r.hi);
}

/// mag bounds |x| for every x in the interval and is attained at an endpoint.
#[kani::proof]
fn interval_mag_bounds() {
    let a = any_interval();
    let m = a.mag();
    assert!(m == a.lo.abs() || m == a.hi.abs());
    let x: f64 = kani::any();
    kani::assume(a.lo <= x && x <= a.hi);
    assert!(x.abs() <= m);
}

/// Any interval with a NaN/infinite endpoint or lo > hi.
fn any_bad_interval() -> Interval {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    let a = Interval::new(lo, hi);
    kani::assume(!a.is_finite());
    a
}

/// mul, div, sqrt, square never return a finite interval from an invalid
/// operand (NaN, ±inf, or lo > hi), whatever the other operand is.
#[kani::proof]
fn interval_mul_div_sqrt_square_poison_invalid() {
    let bad = any_bad_interval();
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    let other = Interval::new(lo, hi);
    assert!(!(bad * other).is_finite() && !(other * bad).is_finite());
    assert!(!bad.div(other).is_finite() && !other.div(bad).is_finite());
    assert!(!bad.sqrt().is_finite() && !bad.square().is_finite());
}

/// add/sub never return a finite interval from an operand with a NaN or
/// infinite endpoint (not reversed) and a finite ordered other operand.
/// (With an arbitrary other operand Kani's NaN check flags inf − inf inside
/// the operation itself, which is the intended poisoning, not a bug.)
#[kani::proof]
fn interval_add_sub_poison_nonfinite() {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    // A NaN or infinite endpoint, not reversed (reversed operands: see the
    // counterexample harness below; with them Kani finds e.g.
    // [−MAX⁺, −inf] + [0, 0] = [−MAX, −MAX]).
    kani::assume((!lo.is_finite() || !hi.is_finite()) && !(lo > hi));
    let bad = Interval::new(lo, hi);
    let other = any_interval();
    assert!(!(bad + other).is_finite() && !(other + bad).is_finite());
    assert!(!(bad - other).is_finite() && !(other - bad).is_finite());
}

/// FINDING: add/sub do not reject a reversed (lo > hi) finite operand: e.g.
/// [1, 1⁻] + [0, 0] = [1⁻, 1], a finite ordered interval. mul/div/sqrt/square
/// do (see above). Harmless as long as no caller builds a reversed interval
/// (none does: `Interval::new` is only called with down(p) ≤ up(p)).
#[kani::proof]
#[kani::should_panic]
fn interval_add_reversed_operand_counterexample() {
    let lo: f64 = kani::any();
    let hi: f64 = kani::any();
    kani::assume(lo.is_finite() && hi.is_finite() && lo > hi);
    let r = Interval::new(lo, hi) + Interval::ZERO;
    assert!(!r.is_finite());
}


// ─── solver/dof.rs and solver/assembly.rs ───────────────────────────────────
//
// DofNumbering and the assemblers are built on HashMap. Its RandomState needs
// OS randomness (CCRandomGenerateBytes), which Kani cannot model; with the key
// source stubbed, a 3-node numbering harness still hit the 8 GB cap after
// 500 s, CBMC unrolling SipHash over String and usize keys. These properties
// (numbering bijection, free-first order, restrained sets, sparse == dense
// assembly) are checked exhaustively over small models in
// tests/index_exhaustive.rs instead.

// ─── linalg/amd.rs, rcm.rs, sparse.rs: orderings and CSC ────────────────────


// amd_order / rcm_order with a symbolic graph did not finish in 10 minutes
// even on 3 vertices (heap, queue and sort loops unrolled over a symbolic
// pattern); tests/index_exhaustive.rs runs both on every graph on up to 6
// vertices. Kani proves the permutation algebra they rely on.

/// inverse_perm inverts every permutation of size ≤ 4 (each size concrete).
#[kani::proof]
#[kani::unwind(6)]
fn inverse_perm_inverts() {
    let p: [usize; 4] = kani::any();
    for n in 0..=4 {
        let mut ok = true;
        for i in 0..n {
            ok &= p[i] < n;
            for j in 0..i {
                ok &= p[i] != p[j];
            }
        }
        if ok {
            let ip = crate::linalg::amd::inverse_perm(&p[..n]);
            assert!(ip.len() == n);
            for i in 0..n {
                assert!(ip[p[i]] == i && p[ip[i]] == i);
            }
        }
    }
}

const NT: usize = 3; // triplets
const NC: usize = 3; // matrix order

/// Triplets with symbolic positions (either triangle) and the concrete
/// values 1, 2, 4: every subset sums to a distinct exact f64, so the summed
/// value at a position identifies exactly which triplets were merged there.
/// (Symbolic values made CBMC bit-blast a float adder per merge: > 8 GB.)
fn any_triplets() -> ([usize; NT], [usize; NT], [f64; NT]) {
    let rows: [usize; NT] = kani::any();
    let cols: [usize; NT] = kani::any();
    kani::assume(rows.iter().all(|&r| r < NC) && cols.iter().all(|&c| c < NC));
    (rows, cols, [1.0, 2.0, 4.0])
}

/// CSC invariants: col_ptr starts at 0, is monotone and ends at nnz; rows in
/// range, in the lower triangle, strictly increasing within each column.
fn check_csc(m: &CscMatrix) {
    assert!(m.col_ptr.len() == m.n + 1 && m.col_ptr[0] == 0);
    for j in 0..m.n {
        assert!(m.col_ptr[j] <= m.col_ptr[j + 1]);
    }
    assert!(m.col_ptr[m.n] == m.row_idx.len() && m.row_idx.len() == m.values.len());
    for j in 0..m.n {
        for k in m.col_ptr[j]..m.col_ptr[j + 1] {
            assert!(m.row_idx[k] < m.n && m.row_idx[k] >= j);
            if k > m.col_ptr[j] {
                assert!(m.row_idx[k - 1] < m.row_idx[k]);
            }
        }
    }
}

/// from_triplets: CSC invariants, and the symmetric dense matrix equals the
/// sum of the triplets mirrored into the lower triangle (duplicates summed).
// kani: nightly (> 100 s or > 4 GB on a laptop)
#[kani::proof]
#[kani::unwind(10)]
fn csc_from_triplets_invariants() {
    let (rows, cols, vals) = any_triplets();
    let m = CscMatrix::from_triplets(NC, &rows, &cols, &vals);
    check_csc(&m);
    let mut dense = [0.0f64; NC * NC];
    for t in 0..NT {
        let (r, c) = if rows[t] >= cols[t] { (rows[t], cols[t]) } else { (cols[t], rows[t]) };
        dense[r * NC + c] += vals[t];
    }
    let d = m.to_dense_symmetric();
    for i in 0..NC {
        for j in 0..=i {
            assert!(d[i * NC + j] == dense[i * NC + j] && d[j * NC + i] == dense[i * NC + j]);
        }
    }
    // Stored entries are exactly the touched positions (one per position).
    let mut touched = 0;
    for p in 0..NC * NC {
        let (i, j) = (p / NC, p % NC);
        if i >= j && (0..NT).any(|t| rows[t].max(cols[t]) == i && rows[t].min(cols[t]) == j) {
            touched += 1;
        }
    }
    assert!(m.nnz() == touched);
}

// permute_symmetric: a harness with a concrete 3×3 matrix and a symbolic
// permutation of 3 did not finish in 10 minutes (7 GB): permute_symmetric
// rebuilds through from_triplets, whose generic sort over symbolic keys is
// costly. Covered by tests/index_exhaustive.rs (20 000 random cases).

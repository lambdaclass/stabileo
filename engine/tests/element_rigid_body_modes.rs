//! Element stiffness matrices against rigid-body motion, over random geometries.
//!
//! The certificates in `certify/` prove the solution is close to the exact solution
//! of the ASSEMBLED K; these tests are evidence that K itself is right. For every
//! element stiffness the solver assembles, on seeded random geometries and
//! properties, in GLOBAL coordinates (exactly what assembly scatters):
//!
//! 1. K·r ≈ 0 for every rigid-body motion r (‖K·r‖∞ ≤ tol·‖K‖max·‖r‖∞). A
//!    violation is a spring to ground: reactions stop balancing loads.
//! 2. The number of (numerically) zero eigenvalues equals the expected kernel
//!    dimension: the rigid motions the element's DOFs can represent plus the
//!    mechanisms its releases introduce, and no more. An extra zero eigenvalue
//!    is a spurious zero-energy mode (hourglass, missing coupling); a missing
//!    one is a rigid motion that costs energy.
//!
//! Extends `shell_rigid_body_modes.rs` (one fixed geometry, residual only) to
//! random geometries, every element family and the kernel dimension.

use dedaliano_engine::element::curved_shell::{compute_element_directors, curved_shell_stiffness};
use dedaliano_engine::element::quad::{mitc4_local_stiffness, quad_transform_3d};
use dedaliano_engine::element::quad9::{mitc9_local_stiffness, quad9_transform_3d};
use dedaliano_engine::element::solid_shell::solid_shell_stiffness;
use dedaliano_engine::element::*;
use dedaliano_engine::linalg::jacobi_eigen;

// ─── utilities ──────────────────────────────────────────────────────────────

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0
    }
    /// Uniform in [lo, hi).
    fn f(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * ((self.next() >> 11) as f64 / (1u64 << 53) as f64)
    }
    fn b(&mut self) -> bool {
        self.next() & (1 << 40) != 0
    }
    /// Log-uniform in [lo, hi).
    fn logf(&mut self, lo: f64, hi: f64) -> f64 {
        (self.f(lo.ln(), hi.ln())).exp()
    }
    /// Random rotation matrix (rows = rotated axes), from a random unit quaternion.
    fn rotation(&mut self) -> [[f64; 3]; 3] {
        let q = loop {
            let q = [self.f(-1.0, 1.0), self.f(-1.0, 1.0), self.f(-1.0, 1.0), self.f(-1.0, 1.0)];
            let n = (q.iter().map(|v| v * v).sum::<f64>()).sqrt();
            if n > 0.2 && n < 1.0 {
                break q.map(|v| v / n);
            }
        };
        let [w, x, y, z] = q;
        [
            [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - w * z), 2.0 * (x * z + w * y)],
            [2.0 * (x * y + w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - w * x)],
            [2.0 * (x * z - w * y), 2.0 * (y * z + w * x), 1.0 - 2.0 * (x * x + y * y)],
        ]
    }
}

fn rot_apply(r: &[[f64; 3]; 3], p: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| r[i][0] * p[0] + r[i][1] * p[1] + r[i][2] * p[2])
}

/// Tᵀ·K·T (u_local = T·u_global).
fn to_global(k: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    let mut kt = vec![0.0; n * n];
    for i in 0..n {
        for m in 0..n {
            let kim = k[i * n + m];
            if kim != 0.0 {
                for j in 0..n {
                    kt[i * n + j] += kim * t[m * n + j];
                }
            }
        }
    }
    let mut out = vec![0.0; n * n];
    for m in 0..n {
        for i in 0..n {
            let tmi = t[m * n + i];
            if tmi != 0.0 {
                for j in 0..n {
                    out[i * n + j] += tmi * kt[m * n + j];
                }
            }
        }
    }
    out
}

/// Node layout of an element's DOF vector, for building rigid motions.
#[derive(Clone, Copy)]
enum Layout {
    /// 2D: per node [ux, uy] (truss) — `rot` false — or [ux, uy, θz] — `rot` true.
    Planar { rot: bool },
    /// 3D: per node [ux, uy, uz] and, if `rot`, [θx, θy, θz]; `warp` appends φ′.
    Spatial { rot: bool, warp: bool },
}

impl Layout {
    fn per_node(self) -> usize {
        match self {
            Layout::Planar { rot } => 2 + rot as usize,
            Layout::Spatial { rot, warp } => 3 + 3 * rot as usize + warp as usize,
        }
    }
}

/// Rigid motions of `nodes` about `x0`: translations then rotations.
/// Planar: tx, ty, rz. Spatial: tx, ty, tz, rx, ry, rz. Warping DOFs (φ′, the rate
/// of twist) are zero under a rigid motion.
fn rigid_modes(nodes: &[[f64; 3]], layout: Layout, x0: [f64; 3]) -> Vec<Vec<f64>> {
    let pn = layout.per_node();
    let n = nodes.len() * pn;
    let mut modes = Vec::new();
    match layout {
        Layout::Planar { rot } => {
            for a in 0..2 {
                let mut r = vec![0.0; n];
                for i in 0..nodes.len() {
                    r[i * pn + a] = 1.0;
                }
                modes.push(r);
            }
            let mut r = vec![0.0; n];
            for (i, p) in nodes.iter().enumerate() {
                r[i * pn] = -(p[1] - x0[1]);
                r[i * pn + 1] = p[0] - x0[0];
                if rot {
                    r[i * pn + 2] = 1.0;
                }
            }
            modes.push(r);
        }
        Layout::Spatial { rot, .. } => {
            for a in 0..3 {
                let mut r = vec![0.0; n];
                for i in 0..nodes.len() {
                    r[i * pn + a] = 1.0;
                }
                modes.push(r);
            }
            for a in 0..3 {
                let mut w = [0.0; 3];
                w[a] = 1.0;
                let mut r = vec![0.0; n];
                for (i, p) in nodes.iter().enumerate() {
                    let d = [p[0] - x0[0], p[1] - x0[1], p[2] - x0[2]];
                    let u = [w[1] * d[2] - w[2] * d[1], w[2] * d[0] - w[0] * d[2], w[0] * d[1] - w[1] * d[0]];
                    for b in 0..3 {
                        r[i * pn + b] = u[b];
                        if rot {
                            r[i * pn + 3 + b] = w[b];
                        }
                    }
                }
                modes.push(r);
            }
        }
    }
    modes
}

/// Worst ‖K·r‖∞ / (‖K‖max·‖r‖∞) over the rigid motions.
fn worst_rigid_residual(k: &[f64], nodes: &[[f64; 3]], layout: Layout) -> f64 {
    let n = nodes.len() * layout.per_node();
    assert_eq!(k.len(), n * n);
    let kmax = k.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    assert!(kmax > 0.0 && kmax.is_finite(), "K is zero or non-finite");
    // An arbitrary centre, so rotation modes are not about a node.
    let c = nodes.iter().fold([0.0; 3], |a, p| [a[0] + p[0], a[1] + p[1], a[2] + p[2]]);
    let m = nodes.len() as f64;
    let x0 = [c[0] / m + 0.37, c[1] / m - 1.21, c[2] / m + 0.83];
    let mut worst = 0.0_f64;
    for r in rigid_modes(nodes, layout, x0) {
        let rmax = r.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        for i in 0..n {
            let s: f64 = (0..n).map(|j| k[i * n + j] * r[j]).sum();
            worst = worst.max(s.abs() / (kmax * rmax));
        }
    }
    worst
}

/// Eigenvalues of symmetric K (ascending) after checking symmetry.
fn eigenvalues(k: &[f64], n: usize) -> Vec<f64> {
    let kmax = k.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    for i in 0..n {
        for j in 0..i {
            assert!(
                (k[i * n + j] - k[j * n + i]).abs() <= 1e-12 * kmax,
                "K not symmetric at ({i},{j}): {} vs {}",
                k[i * n + j],
                k[j * n + i]
            );
        }
    }
    jacobi_eigen(k, n, 200).values
}

/// Number of eigenvalues with |λ| ≤ rel·λmax. Also asserts no eigenvalue is
/// meaningfully negative (K must be positive semidefinite).
fn zero_count(vals: &[f64], rel: f64) -> usize {
    let lmax = vals.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    let lmin = vals.iter().cloned().fold(f64::INFINITY, f64::min);
    assert!(lmin >= -1e-9 * lmax, "K indefinite: λmin = {lmin:e}, λmax = {lmax:e}");
    vals.iter().filter(|v| v.abs() <= rel * lmax).count()
}

/// Kernel-dimension check with a spectral gap: exactly `expected` eigenvalues
/// at or below `zero_rel`·λmax, and the next one above `gap_rel`·λmax.
fn assert_kernel(name: &str, k: &[f64], n: usize, expected: usize, zero_rel: f64, gap_rel: f64) {
    let vals = eigenvalues(k, n);
    let lmax = vals.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    let zeros = zero_count(&vals, zero_rel);
    assert_eq!(
        zeros, expected,
        "{name}: {zeros} zero eigenvalues, expected {expected}; spectrum/λmax = {:?}",
        vals.iter().take(expected + 3).map(|v| v / lmax).collect::<Vec<_>>()
    );
    if expected < n {
        let next = vals[expected];
        assert!(
            next > gap_rel * lmax,
            "{name}: smallest non-rigid eigenvalue {:.3e}·λmax below gap {gap_rel:e}",
            next / lmax
        );
    }
}

/// A flat convex quadrilateral in the local xy plane: a jittered rectangle.
fn random_quad_2d(g: &mut Lcg) -> [[f64; 2]; 4] {
    let a = g.f(0.5, 3.0);
    let b = a * g.f(0.3, 1.5);
    let j = 0.2 * a.min(b);
    [
        [g.f(-j, j), g.f(-j, j)],
        [a + g.f(-j, j), g.f(-j, j)],
        [a + g.f(-j, j), b + g.f(-j, j)],
        [g.f(-j, j), b + g.f(-j, j)],
    ]
}

/// Place local 2D/3D points into space with a random rotation and offset.
fn place(g: &mut Lcg, pts: &[[f64; 3]]) -> Vec<[f64; 3]> {
    let r = g.rotation();
    let o = [g.f(-10.0, 10.0), g.f(-10.0, 10.0), g.f(-10.0, 10.0)];
    pts.iter()
        .map(|p| {
            let q = rot_apply(&r, *p);
            [q[0] + o[0], q[1] + o[1], q[2] + o[2]]
        })
        .collect()
}

fn lift(p: &[[f64; 2]]) -> Vec<[f64; 3]> {
    p.iter().map(|q| [q[0], q[1], 0.0]).collect()
}

const SAMPLES: usize = 40;

fn check(name: &str, k: &[f64], nodes: &[[f64; 3]], layout: Layout, tol: f64) {
    let res = worst_rigid_residual(k, nodes, layout);
    assert!(res <= tol, "{name}: K·r ≠ 0 for a rigid motion, relative residual {res:.3e} > {tol:e}");
}

// ─── bars ───────────────────────────────────────────────────────────────────

fn random_bar_2d(g: &mut Lcg) -> ([f64; 3], [f64; 3], f64, f64, f64) {
    loop {
        let p = [g.f(-5.0, 5.0), g.f(-5.0, 5.0), 0.0];
        let q = [g.f(-5.0, 5.0), g.f(-5.0, 5.0), 0.0];
        let l = ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2)).sqrt();
        if l > 0.3 {
            return (p, q, l, (q[0] - p[0]) / l, (q[1] - p[1]) / l);
        }
    }
}

fn random_bar_3d(g: &mut Lcg) -> ([f64; 3], [f64; 3], f64) {
    loop {
        let p = [g.f(-5.0, 5.0), g.f(-5.0, 5.0), g.f(-5.0, 5.0)];
        let q = [g.f(-5.0, 5.0), g.f(-5.0, 5.0), g.f(-5.0, 5.0)];
        let l = ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2) + (q[2] - p[2]).powi(2)).sqrt();
        if l > 0.3 {
            return (p, q, l);
        }
    }
}

#[test]
fn truss_2d_rigid_modes_and_kernel() {
    let mut g = Lcg(1);
    for s in 0..SAMPLES {
        let (p, q, l, c, sn) = random_bar_2d(&mut g);
        let (e, a) = (g.logf(1e4, 3e8), g.logf(1e-4, 1e-1));
        let lay = Layout::Planar { rot: false };
        let kg = truss_global_stiffness_2d(e, a, l, c, sn);
        check("truss 2D direct", &kg, &[p, q], lay, 1e-14);
        assert_kernel(&format!("truss 2D #{s}"), &kg, 4, 3, 1e-12, 0.1);
        // The local + transform path must agree with the direct one.
        let kt = to_global(&truss_local_stiffness_2d(e, a, l), &truss_transform_2d(c, sn), 4);
        for i in 0..16 {
            assert!((kt[i] - kg[i]).abs() <= 1e-13 * kg.iter().fold(0.0_f64, |m, v| m.max(v.abs())));
        }
        let kc = cable_global_stiffness_2d(e, a, l, c, sn);
        check("cable 2D", &kc, &[p, q], lay, 1e-14);
        assert_kernel(&format!("cable 2D #{s}"), &kc, 4, 3, 1e-12, 0.1);
    }
}

#[test]
fn truss_3d_rigid_modes_and_kernel() {
    let mut g = Lcg(2);
    for s in 0..SAMPLES {
        let (p, q, l) = random_bar_3d(&mut g);
        let (e, a) = (g.logf(1e4, 3e8), g.logf(1e-4, 1e-1));
        let lay = Layout::Spatial { rot: false, warp: false };
        let d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        // A 2-node bar has 5 independent rigid motions (the spin about its axis
        // moves no node): kernel dimension 6 − rank 1 = 5.
        let k = truss_global_stiffness_3d(e, a, l, d[0], d[1], d[2]);
        check("truss 3D", &k, &[p, q], lay, 1e-14);
        assert_kernel(&format!("truss 3D #{s}"), &k, 6, 5, 1e-12, 0.1);
        let kc = cable_global_stiffness_3d(e, a, l, d[0], d[1], d[2]);
        check("cable 3D", &kc, &[p, q], lay, 1e-14);
        assert_kernel(&format!("cable 3D #{s}"), &kc, 6, 5, 1e-12, 0.1);
    }
}

// ─── frames ─────────────────────────────────────────────────────────────────

#[test]
fn frame_2d_rigid_modes_and_kernel_with_hinges() {
    let mut g = Lcg(3);
    for s in 0..SAMPLES * 2 {
        let (p, q, l, c, sn) = random_bar_2d(&mut g);
        let e = g.logf(1e4, 3e8);
        let a = g.logf(1e-3, 1e-1);
        let iz = a * a * g.f(0.05, 0.5);
        let phi = if g.b() { 0.0 } else { g.f(0.0, 5.0) };
        let (hs, he) = (g.b(), g.b());
        let k = to_global(&frame_local_stiffness_2d(e, a, iz, l, hs, he, phi), &frame_transform_2d(c, sn), 6);
        let name = format!("frame 2D #{s} hinges ({hs},{he}) phi {phi:.2}");
        check(&name, &k, &[p, q], Layout::Planar { rot: true }, 1e-12);
        // Rank: axial 1 + bending (2 fixed-fixed, 1 with one hinge, 0 with two).
        let rank = 1 + match (hs, he) {
            (false, false) => 2,
            (true, true) => 0,
            _ => 1,
        };
        assert_kernel(&name, &k, 6, 6 - rank, 1e-12, 1e-10);
    }
}

fn random_hinge(g: &mut Lcg) -> Hinge3D {
    // Mostly unreleased so the fixed-fixed case gets coverage too.
    let p = |g: &mut Lcg| g.f(0.0, 1.0) < 0.25;
    Hinge3D {
        release_my_start: p(g),
        release_mz_start: p(g),
        release_t_start: p(g),
        release_my_end: p(g),
        release_mz_end: p(g),
        release_t_end: p(g),
    }
}

/// Expected rank of the 3D frame stiffness: axial 1, torsion 1 unless released at
/// either end, each bending plane 2 − (number of released ends) (0 if both).
fn frame_3d_rank(h: &Hinge3D) -> usize {
    let bend = |s: bool, e: bool| 2 - (s as usize + e as usize);
    1 + (!(h.release_t_start || h.release_t_end)) as usize
        + bend(h.release_my_start, h.release_my_end)
        + bend(h.release_mz_start, h.release_mz_end)
}

fn random_frame_3d_props(g: &mut Lcg) -> (f64, f64, f64, f64, f64, f64, f64, f64) {
    let e = g.logf(1e4, 3e8);
    let gm = e / (2.0 * (1.0 + g.f(0.1, 0.45)));
    let a = g.logf(1e-3, 1e-1);
    let iy = a * a * g.f(0.05, 0.5);
    let iz = a * a * g.f(0.05, 0.5);
    let j = (iy + iz) * g.f(0.01, 1.0);
    let phy = if g.b() { 0.0 } else { g.f(0.0, 3.0) };
    let phz = if g.b() { 0.0 } else { g.f(0.0, 3.0) };
    (e, gm, a, iy, iz, j, phy, phz)
}

#[test]
fn frame_3d_rigid_modes_and_kernel_with_releases() {
    let mut g = Lcg(4);
    for s in 0..SAMPLES * 2 {
        let (p, q, l) = random_bar_3d(&mut g);
        let (e, gm, a, iy, iz, j, phy, phz) = random_frame_3d_props(&mut g);
        let h = random_hinge(&mut g);
        // Random orientation vector or roll angle, as users specify them.
        let (ex, ey, ez) = if g.b() {
            compute_local_axes_3d(p[0], p[1], p[2], q[0], q[1], q[2], None, None, None, Some(g.f(-180.0, 180.0)), false)
        } else {
            let v = [g.f(-1.0, 1.0), g.f(-1.0, 1.0), g.f(-1.0, 1.0)];
            compute_local_axes_3d(p[0], p[1], p[2], q[0], q[1], q[2], Some(v[0]), Some(v[1]), Some(v[2]), None, false)
        };
        let kl = frame_local_stiffness_3d(e, a, iy, iz, j, l, gm, h, phy, phz);
        let k = to_global(&kl, &frame_transform_3d(&ex, &ey, &ez), 12);
        let name = format!("frame 3D #{s} {h:?}");
        check(&name, &k, &[p, q], Layout::Spatial { rot: true, warp: false }, 1e-12);
        assert_kernel(&name, &k, 12, 12 - frame_3d_rank(&h), 1e-12, 1e-11);
    }
}

#[test]
fn frame_3d_warping_rigid_modes_and_kernel() {
    let mut g = Lcg(5);
    for s in 0..SAMPLES * 2 {
        let (p, q, l) = random_bar_3d(&mut g);
        let (e, gm, a, iy, iz, j, phy, phz) = random_frame_3d_props(&mut g);
        let cw = iy * iz * g.f(0.01, 1.0);
        let h = random_hinge(&mut g);
        let (ex, ey, ez) = compute_local_axes_3d(p[0], p[1], p[2], q[0], q[1], q[2], None, None, None, None, false);
        let kl = frame_local_stiffness_3d_warping(e, a, iy, iz, j, cw, l, gm, h, phy, phz);
        let k = to_global(&kl, &frame_transform_3d_warping(&ex, &ey, &ez), 14);
        let name = format!("frame 3D warping #{s} {h:?}");
        check(&name, &k, &[p, q], Layout::Spatial { rot: true, warp: true }, 1e-12);
        // Torsion-warping block over [θx1, φ′1, θx2, φ′2] has rank 3 (only the rigid
        // twist is free) when torsion is not released, else it is zeroed (rank 0).
        let torsion_free = h.release_t_start || h.release_t_end;
        let tw_rank = if torsion_free { 0 } else { 3 };
        let bend = |s: bool, e: bool| 2 - (s as usize + e as usize);
        let rank = 1 + tw_rank + bend(h.release_my_start, h.release_my_end) + bend(h.release_mz_start, h.release_mz_end);
        assert_kernel(&name, &k, 14, 14 - rank, 1e-12, 1e-12);
    }
}

// ─── connectors ─────────────────────────────────────────────────────────────

/// A zero-length connector (coincident nodes, the documented primary use: bearings,
/// isolators) annihilates every rigid motion and has rank 3 (2D) / 6 (3D) when all
/// its springs are positive.
#[test]
fn connector_zero_length_rigid_modes_and_kernel() {
    let mut g = Lcg(6);
    for s in 0..SAMPLES {
        let p = [g.f(-5.0, 5.0), g.f(-5.0, 5.0), g.f(-5.0, 5.0)];
        let t = g.f(0.0, std::f64::consts::TAU);
        let k2 = connector_stiffness_2d(g.logf(1.0, 1e6), g.logf(1.0, 1e6), g.logf(1.0, 1e6), t.cos(), t.sin());
        let p2 = [p[0], p[1], 0.0];
        check("connector 2D zero-length", &k2, &[p2, p2], Layout::Planar { rot: true }, 1e-14);
        assert_kernel(&format!("connector 2D #{s}"), &k2, 6, 3, 1e-12, 1e-9);
        let v = [g.f(-1.0, 1.0), g.f(-1.0, 1.0), g.f(-1.0, 1.0)];
        let n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        let dir = v.map(|x| x / n);
        let ks: Vec<f64> = (0..6).map(|_| g.logf(1.0, 1e6)).collect();
        let k3 = connector_stiffness_3d(ks[0], ks[1], ks[2], ks[3], ks[4], ks[5], dir);
        check("connector 3D zero-length", &k3, &[p, p], Layout::Spatial { rot: true, warp: false }, 1e-14);
        assert_kernel(&format!("connector 3D #{s}"), &k3, 12, 6, 1e-12, 1e-9);
    }
}

/// FINDING: a connector of FINITE length with a non-zero shear spring does not
/// annihilate the rigid rotation. K = [K_ii, −K_ii; −K_ii, K_ii] with K_ii =
/// diag(k_axial, k_shear, k_moment) has no shear–moment coupling, so rotating the
/// whole connector by θ about node i moves node j sideways by θ·L and the shear
/// spring pushes back with k_shear·θ·L: a spring to ground. The documentation
/// (connector.rs) allows finite-length connectors. Consequence: reactions do not
/// balance the loads in moment (see `connector_finite_length_moment_equilibrium`
/// in connector_k_findings.rs). Pinned here so a fix is noticed.
#[test]
fn connector_finite_length_violates_rigid_rotation() {
    let k2 = connector_stiffness_2d(1e3, 1e3, 1e3, 1.0, 0.0);
    let nodes = [[0.0, 0.0, 0.0], [2.0, 0.0, 0.0]];
    let res = worst_rigid_residual(&k2, &nodes, Layout::Planar { rot: true });
    assert!(res > 0.1, "finite-length connector now annihilates rigid rotation ({res:e}); update the finding");
    // With k_shear = 0 (axial + moment only) a finite connector is rigid-invariant.
    let k2 = connector_stiffness_2d(1e3, 0.0, 1e3, 0.6, 0.8);
    check("connector 2D axial+moment finite", &k2, &[[0.0, 0.0, 0.0], [1.2, 1.6, 0.0]], Layout::Planar { rot: true }, 1e-14);
}

// ─── plates and shells ──────────────────────────────────────────────────────

const E: f64 = 30.0e6; // kN/m²

#[test]
fn dkt_cst_triangle_rigid_modes_and_kernel() {
    let mut g = Lcg(7);
    for s in 0..SAMPLES {
        let tri = loop {
            let p = [[0.0, 0.0], [g.f(0.5, 3.0), g.f(-0.5, 0.5)], [g.f(-0.5, 2.0), g.f(0.5, 3.0)]];
            let area2 = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
            if area2 > 0.3 {
                break p;
            }
        };
        let c = place(&mut g, &lift(&tri));
        let coords = [c[0], c[1], c[2]];
        let (nu, t) = (g.f(0.0, 0.45), g.f(0.01, 0.4));
        let k = to_global(&plate_local_stiffness(&coords, E, nu, t), &plate_transform_3d(&coords), 18);
        let name = format!("DKT+CST #{s}");
        check(&name, &k, &c, Layout::Spatial { rot: true, warp: false }, 1e-10);
        // Drilling rotations are stabilised (Hughes–Brezzi), so only the six rigid
        // motions remain.
        assert_kernel(&name, &k, 18, 6, 1e-10, 1e-9);
    }
}

#[test]
fn mitc4_rigid_modes_and_kernel() {
    let mut g = Lcg(8);
    for s in 0..SAMPLES {
        let q = lift(&random_quad_2d(&mut g));
        let c = place(&mut g, &q);
        let coords = [c[0], c[1], c[2], c[3]];
        let (nu, t) = (g.f(0.0, 0.45), g.f(0.01, 0.4));
        let k = to_global(&mitc4_local_stiffness(&coords, E, nu, t), &quad_transform_3d(&coords), 24);
        let name = format!("MITC4 #{s}");
        check(&name, &k, &c, Layout::Spatial { rot: true, warp: false }, 1e-10);
        assert_kernel(&name, &k, 24, 6, 1e-10, 1e-9);
    }
}

fn random_quad9(g: &mut Lcg) -> Vec<[f64; 3]> {
    let q = random_quad_2d(g);
    let mid = |a: [f64; 2], b: [f64; 2]| [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
    let ctr = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4.0, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4.0];
    let mut p = vec![q[0], q[1], q[2], q[3], mid(q[0], q[1]), mid(q[1], q[2]), mid(q[2], q[3]), mid(q[3], q[0]), ctr];
    // Curved edges: nudge midside and centre nodes in-plane.
    for pt in p.iter_mut().skip(4) {
        pt[0] += g.f(-0.05, 0.05);
        pt[1] += g.f(-0.05, 0.05);
    }
    lift(&p)
}

#[test]
fn mitc9_rigid_modes_and_kernel() {
    let mut g = Lcg(9);
    for s in 0..SAMPLES / 2 {
        let q = random_quad9(&mut g);
        let c = place(&mut g, &q);
        let coords: [[f64; 3]; 9] = std::array::from_fn(|i| c[i]);
        let (nu, t) = (g.f(0.0, 0.45), g.f(0.01, 0.4));
        let k = to_global(&mitc9_local_stiffness(&coords, E, nu, t), &quad9_transform_3d(&coords), 54);
        let name = format!("MITC9 #{s}");
        check(&name, &k, &c, Layout::Spatial { rot: true, warp: false }, 1e-10);
        assert_kernel(&name, &k, 54, 6, 1e-10, 1e-10);
    }
}

#[test]
fn curved_shell_rigid_modes_and_kernel() {
    let mut g = Lcg(10);
    for s in 0..SAMPLES {
        let q = random_quad_2d(&mut g);
        // Warped (non-planar) geometry: the curved shell's reason to exist.
        let w = g.f(0.0, 0.2);
        let local = [[q[0][0], q[0][1], w], [q[1][0], q[1][1], -w], [q[2][0], q[2][1], w], [q[3][0], q[3][1], -w]];
        let c = place(&mut g, &local);
        let coords = [c[0], c[1], c[2], c[3]];
        let (nu, t) = (g.f(0.0, 0.45), g.f(0.01, 0.4));
        let dirs = compute_element_directors(&coords);
        let k = curved_shell_stiffness(&coords, &dirs, E, nu, t);
        let name = format!("curved shell #{s} warp {w:.3}");
        check(&name, &k, &c, Layout::Spatial { rot: true, warp: false }, 1e-10);
        assert_kernel(&name, &k, 24, 6, 1e-10, 1e-10);
    }
}

#[test]
fn solid_shell_rigid_modes_and_kernel() {
    let mut g = Lcg(11);
    for s in 0..SAMPLES {
        let q = random_quad_2d(&mut g);
        let t = g.f(0.05, 0.5);
        let j = 0.1 * t;
        let mut local = Vec::new();
        for p in &q {
            local.push([p[0], p[1], 0.0]);
        }
        for p in &q {
            local.push([p[0] + g.f(-j, j), p[1] + g.f(-j, j), t + g.f(-j, j)]);
        }
        let c = place(&mut g, &local);
        let coords: [[f64; 3]; 8] = std::array::from_fn(|i| c[i]);
        let k = solid_shell_stiffness(&coords, E, g.f(0.0, 0.45));
        let name = format!("solid shell #{s}");
        check(&name, &k, &c, Layout::Spatial { rot: false, warp: false }, 1e-10);
        assert_kernel(&name, &k, 24, 6, 1e-10, 1e-10);
    }
}

// ─── assembled model ────────────────────────────────────────────────────────

/// The ASSEMBLED free-free stiffness (no supports) of a mixed 3D model — a curved
/// beam expanded into frame segments, straight frames with releases and an
/// orientation vector, a truss, MITC4 quads and DKT triangles sharing nodes —
/// annihilates the six global rigid motions and has no zero eigenvalue beyond
/// them and the truss-only node's rotations. The shell part is planar: on a
/// warped quad the flat MITC4 is not rigid-invariant (see
/// `mitc4_warped_rigid_residual_grows_with_warp`). This checks the DOF numbering and scatter of every element
/// family together, and the curved-beam expansion (whose K is the frames').
#[test]
fn assembled_free_model_rigid_modes_and_kernel() {
    use dedaliano_engine::solver::assembly::assemble_stiffness_3d;
    use dedaliano_engine::solver::dof::DofNumbering;
    use dedaliano_engine::solver::linear::expand_curved_beams_3d;
    use dedaliano_engine::types::*;
    use std::collections::HashMap;

    let pts: [(usize, [f64; 3]); 9] = [
        (1, [0.0, 0.0, 0.0]),
        (2, [3.0, 0.2, 0.0]),
        (3, [3.2, 2.5, 0.0]),
        (4, [-0.1, 2.3, 0.0]),
        (5, [1.5, 4.0, 0.0]),  // triangle apex on edge 3–4
        (6, [1.6, 1.2, 3.0]),  // curved beam mid
        (7, [3.0, 0.2, 2.5]),  // column top above 2
        (8, [0.0, 0.0, 2.5]),  // column top above 1
        (9, [6.0, 0.0, 0.0]),  // truss end
    ];
    let mut nodes = HashMap::new();
    for (id, p) in pts {
        nodes.insert(id.to_string(), SolverNode3D { id, x: p[0], y: p[1], z: p[2] });
    }
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });
    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.02, iy: 2e-4, iz: 1e-4, j: 5e-5, cw: None, as_y: None, as_z: None });
    let frame = |id: usize, i: usize, j: usize, ty: &str, rel: bool| SolverElement3D {
        id, elem_type: ty.into(), node_i: i, node_j: j, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: rel, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false,
        local_yx: if id == 2 { Some(0.3) } else { None }, local_yy: if id == 2 { Some(1.0) } else { None },
        local_yz: if id == 2 { Some(0.2) } else { None }, roll_angle: None,
    };
    let mut elements = HashMap::new();
    for e in [frame(1, 1, 8, "frame", false), frame(2, 2, 7, "frame", true), frame(3, 8, 7, "frame", false), frame(4, 2, 9, "truss", false), frame(5, 1, 9, "truss", false), frame(6, 9, 7, "truss", false)] {
        elements.insert(e.id.to_string(), e);
    }
    let mut quads = HashMap::new();
    quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.15 });
    let mut plates = HashMap::new();
    plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [4, 3, 5], material_id: 1, thickness: 0.15 });
    let input = SolverInput3D {
        nodes, materials, sections, elements, supports: HashMap::new(), loads: vec![], constraints: vec![],
        left_hand: None, plates, quads, quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![CurvedBeamInput { node_start: 8, node_mid: 6, node_end: 7, material_id: 1, section_id: 1, num_segments: 6, hinge_start: false, hinge_end: false }],
        connectors: HashMap::new(), solver_options: None,
    };
    let input = expand_curved_beams_3d(&input);
    assert!(input.nodes.len() > 9, "curved beam was not expanded");
    let dof = DofNumbering::build_3d(&input);
    assert_eq!(dof.dofs_per_node, 6);
    let asm = assemble_stiffness_3d(&input, &dof);
    let n = dof.n_total;
    // The curved beam's mid node is only a geometric definition point; if the
    // expansion leaves it unconnected its 6 DOFs are free (zero rows).
    let mut ids: Vec<usize> = input.nodes.values().map(|nd| nd.id).collect();
    ids.sort();
    let connected: Vec<usize> = ids
        .iter()
        .copied()
        .filter(|&id| (0..6).any(|d| {
            let g = dof.map[&(id, d)];
            (0..n).any(|j| asm.k[g * n + j] != 0.0)
        }))
        .collect();
    let by_id: HashMap<usize, [f64; 3]> = input.nodes.values().map(|nd| (nd.id, [nd.x, nd.y, nd.z])).collect();
    // Permute K into node-major order over connected nodes for the shared helpers.
    let order: Vec<usize> = connected.iter().flat_map(|&id| (0..6).map(move |d| (id, d))).map(|key| dof.map[&key]).collect();
    let m = order.len();
    let mut k = vec![0.0; m * m];
    for (a, &ga) in order.iter().enumerate() {
        for (b, &gb) in order.iter().enumerate() {
            k[a * m + b] = asm.k[ga * n + gb];
        }
    }
    let coords: Vec<[f64; 3]> = connected.iter().map(|id| by_id[id]).collect();
    assert!(asm.artificial_dofs.is_empty(), "unexpected artificial DOFs {:?}", asm.artificial_dofs);
    check("assembled free model", &k, &coords, Layout::Spatial { rot: true, warp: false }, 1e-9);
    // Kernel: the 6 rigid motions plus the 3 rotations of node 9, which only
    // trusses reach (zero rows; assembly adds no artificial stiffness there).
    // The released my_end of element 2 meets stiff members at node 7: no mechanism.
    assert_kernel("assembled free model", &k, m, 9, 1e-11, 1e-12);
}

/// FINDING (known limitation of flat shell elements, quantified): MITC4 on a
/// WARPED quad (nodes not coplanar) projects onto a mean plane and does not
/// annihilate rigid rotations; the relative residual grows ~linearly with the
/// warp ratio h/L. Pinned so a warping correction (e.g. rigid offsets to the
/// mean plane) shows up; the curved shell is the element for warped geometry and
/// passes (`curved_shell_rigid_modes_and_kernel`, warped inputs).
#[test]
fn mitc4_warped_rigid_residual_grows_with_warp() {
    let mut last = 0.0;
    for w in [1e-4, 1e-3, 1e-2, 5e-2] {
        // 2 × 2 square with corners alternately ±w out of plane (warp ratio w/2).
        let c = [[0.0, 0.0, w], [2.0, 0.0, -w], [2.0, 2.0, w], [0.0, 2.0, -w]];
        let k = to_global(&mitc4_local_stiffness(&c, E, 0.3, 0.1), &quad_transform_3d(&c), 24);
        let res = worst_rigid_residual(&k, &c, Layout::Spatial { rot: true, warp: false });
        eprintln!("MITC4 warp {w:e}: rigid residual {res:.3e}");
        assert!(res > last, "residual should grow with warp");
        last = res;
    }
    assert!(last > 1e-3, "warped MITC4 now rigid-invariant ({last:e}): update the finding");
}

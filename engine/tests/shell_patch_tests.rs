//! Element-level patch tests (Irons; MacNeal–Harder 1985 patch geometry) for the
//! plate and shell elements, on distorted meshes placed in a tilted plane.
//!
//! The existing patch tests (validation/…/patch_tests.rs, quad_shell.rs,
//! plates_extended.rs) solve whole models on regular meshes with loose ratios.
//! These are the strict "form A" test: assemble the element stiffnesses of a
//! distorted patch in GLOBAL coordinates (exactly what assembly scatters), impose
//! the nodal values of an exact constant-strain (membrane) or constant-curvature
//! (bending) field on every node, and require the nodal forces K·u at the
//! INTERIOR nodes to vanish to round-off. A constant-stress state is in
//! equilibrium with no body force, so a consistent element produces no
//! out-of-balance force at a node surrounded by elements; any residual means
//! the element cannot represent constant strain on that mesh and will not
//! converge to the right answer under refinement.
//!
//! Fields (local patch coordinates x, y, normal z; rotations by the right-hand
//! rule, u = θ × r for a rigid rotation):
//! - membrane: u = a·x + b·y, v = c·x + d·y, θz = (c − b)/2 (the drilling
//!   rotation equals the material spin, so the drilling penalty is inactive);
//! - bending (Kirchhoff, so also exact for Mindlin elements with zero shear):
//!   w = ½(κx·x² + κy·y² + 2κxy·x·y), θx = ∂w/∂y, θy = −∂w/∂x.

use dedaliano_engine::element::curved_shell::{compute_element_directors, curved_shell_stiffness};
use dedaliano_engine::element::quad::{mitc4_local_stiffness, quad_transform_3d};
use dedaliano_engine::element::quad9::{mitc9_local_stiffness, quad9_transform_3d};
use dedaliano_engine::element::solid_shell::solid_shell_stiffness;
use dedaliano_engine::element::{plate_local_stiffness, plate_transform_3d};

#[path = "benchmarks/macneal_harder.rs"]
mod mh;
use std::sync::LazyLock;
static E: LazyLock<f64> = LazyLock::new(|| mh::DATA["patch"]["e"].as_f64().unwrap());
static NU: LazyLock<f64> = LazyLock::new(|| mh::DATA["patch"]["nu"].as_f64().unwrap());
static MH_NODES: LazyLock<[[f64; 2]; 8]> = LazyLock::new(|| serde_json::from_value(mh::DATA["patch"]["nodes"].clone()).unwrap());
static MH_QUADS: LazyLock<[[usize; 4]; 5]> = LazyLock::new(|| serde_json::from_value(mh::DATA["patch"]["quads"].clone()).unwrap());
static MH_INTERIOR: LazyLock<[usize; 4]> = LazyLock::new(|| serde_json::from_value(mh::DATA["patch"]["interior"].clone()).unwrap());

/// Tilt: rows are the patch's local x, y, z axes in global coordinates.
fn tilt() -> [[f64; 3]; 3] {
    let n = [1.0 / 14f64.sqrt(), 2.0 / 14f64.sqrt(), 3.0 / 14f64.sqrt()];
    let ex = [2.0 / 5f64.sqrt(), -1.0 / 5f64.sqrt(), 0.0];
    let ey = [n[1] * ex[2] - n[2] * ex[1], n[2] * ex[0] - n[0] * ex[2], n[0] * ex[1] - n[1] * ex[0]];
    [ex, ey, n]
}

const ORIGIN: [f64; 3] = [1.5, -0.5, 2.0];

fn to_global_pt(r: &[[f64; 3]; 3], p: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|a| ORIGIN[a] + p[0] * r[0][a] + p[1] * r[1][a] + p[2] * r[2][a])
}

fn to_global_vec(r: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|a| v[0] * r[0][a] + v[1] * r[1][a] + v[2] * r[2][a])
}

/// Tᵀ·K·T.
fn to_global(k: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    let mut kt = vec![0.0; n * n];
    for i in 0..n {
        for m in 0..n {
            let a = k[i * n + m];
            if a != 0.0 {
                for j in 0..n {
                    kt[i * n + j] += a * t[m * n + j];
                }
            }
        }
    }
    let mut out = vec![0.0; n * n];
    for m in 0..n {
        for i in 0..n {
            let a = t[m * n + i];
            if a != 0.0 {
                for j in 0..n {
                    out[i * n + j] += a * kt[m * n + j];
                }
            }
        }
    }
    out
}

/// Patch assembly in global coordinates with `dpn` DOFs per node.
struct Patch {
    dpn: usize,
    n_nodes: usize,
    k: Vec<f64>,
}

impl Patch {
    fn new(n_nodes: usize, dpn: usize) -> Self {
        Patch { dpn, n_nodes, k: vec![0.0; (n_nodes * dpn).pow(2)] }
    }
    fn add(&mut self, conn: &[usize], ke: &[f64]) {
        let ne = conn.len() * self.dpn;
        let n = self.n_nodes * self.dpn;
        assert_eq!(ke.len(), ne * ne);
        for a in 0..ne {
            let ga = conn[a / self.dpn] * self.dpn + a % self.dpn;
            for b in 0..ne {
                let gb = conn[b / self.dpn] * self.dpn + b % self.dpn;
                self.k[ga * n + gb] += ke[a * ne + b];
            }
        }
    }
    /// max |(K·u)_i| over the DOFs of `interior` nodes, relative to ‖K‖max·‖u‖∞·(DOFs per row).
    fn interior_residual(&self, u: &[f64], interior: &[usize]) -> f64 {
        let n = self.n_nodes * self.dpn;
        let kmax = self.k.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        let umax = u.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        let mut worst = 0.0_f64;
        for &node in interior {
            for d in 0..self.dpn {
                let i = node * self.dpn + d;
                let f: f64 = (0..n).map(|j| self.k[i * n + j] * u[j]).sum();
                worst = worst.max(f.abs());
            }
        }
        worst / (kmax * umax)
    }
    /// Same field must produce non-zero forces on the boundary (else the test is vacuous).
    fn total_force(&self, u: &[f64]) -> f64 {
        let n = self.n_nodes * self.dpn;
        (0..n).map(|i| (0..n).map(|j| self.k[i * n + j] * u[j]).sum::<f64>().abs()).fold(0.0, f64::max)
    }
}

/// Local field at local point (x, y): (displacement, rotation), local axes.
type Field = fn(f64, f64) -> ([f64; 3], [f64; 3]);

fn membrane(x: f64, y: f64) -> ([f64; 3], [f64; 3]) {
    let (a, b, c, d) = (1.0e-3, 0.4e-3, -0.7e-3, 0.6e-3);
    ([a * x + b * y + 2e-4, c * x + d * y - 1e-4, 0.0], [0.0, 0.0, (c - b) / 2.0])
}

fn bending(x: f64, y: f64) -> ([f64; 3], [f64; 3]) {
    let (kx, ky, kxy) = (2.0e-2, -1.0e-2, 0.7e-2);
    let w = 0.5 * (kx * x * x + ky * y * y + 2.0 * kxy * x * y);
    let wx = kx * x + kxy * y;
    let wy = ky * y + kxy * x;
    ([0.0, 0.0, w], [wy, -wx, 0.0])
}

/// Global nodal DOF vector (6 per node) for a local field.
fn nodal_field(local_pts: &[[f64; 2]], field: Field) -> Vec<f64> {
    let r = tilt();
    let mut u = Vec::new();
    for p in local_pts {
        let (d, th) = field(p[0], p[1]);
        u.extend(to_global_vec(&r, d));
        u.extend(to_global_vec(&r, th));
    }
    u
}

fn global_pts(local_pts: &[[f64; 2]]) -> Vec<[f64; 3]> {
    let r = tilt();
    local_pts.iter().map(|p| to_global_pt(&r, [p[0], p[1], 0.0])).collect()
}

static TOL: LazyLock<f64> = LazyLock::new(|| mh::DATA["patch"]["tolerance"].as_f64().unwrap());

fn run(name: &str, patch: &Patch, local_pts: &[[f64; 2]], interior: &[usize]) {
    for (fname, field) in [("membrane", membrane as Field), ("bending", bending as Field)] {
        let u = nodal_field(local_pts, field);
        assert!(patch.total_force(&u) > 0.0, "{name} {fname}: field produces no force at all");
        let res = patch.interior_residual(&u, interior);
        assert!(res < *TOL, "{name} {fname} patch test: interior residual {res:.3e} ≥ {:e}", *TOL);
    }
}

fn quad_coords(pts: &[[f64; 3]], q: &[usize; 4]) -> [[f64; 3]; 4] {
    [pts[q[0]], pts[q[1]], pts[q[2]], pts[q[3]]]
}

#[test]
fn mitc4_patch_test_distorted() {
    for t in [0.001, 0.01, 0.05] {
        let g = global_pts(&*MH_NODES);
        let mut patch = Patch::new(8, 6);
        for q in &*MH_QUADS {
            let c = quad_coords(&g, q);
            patch.add(q, &to_global(&mitc4_local_stiffness(&c, *E, *NU, t), &quad_transform_3d(&c), 24));
        }
        run(&format!("MITC4 t={t}"), &patch, &*MH_NODES, &*MH_INTERIOR);
    }
}

#[test]
fn curved_shell_flat_patch_test_distorted() {
    for t in [0.001, 0.01, 0.05] {
        let g = global_pts(&*MH_NODES);
        let mut patch = Patch::new(8, 6);
        for q in &*MH_QUADS {
            let c = quad_coords(&g, q);
            let dirs = compute_element_directors(&c);
            patch.add(q, &curved_shell_stiffness(&c, &dirs, *E, *NU, t));
        }
        run(&format!("curved shell t={t}"), &patch, &*MH_NODES, &*MH_INTERIOR);
    }
}

#[test]
fn dkt_cst_patch_test_distorted() {
    // Each MacNeal–Harder quad split along a diagonal (alternating) into two triangles.
    let mut tris = Vec::new();
    for (i, q) in MH_QUADS.iter().enumerate() {
        if i % 2 == 0 {
            tris.push([q[0], q[1], q[2]]);
            tris.push([q[0], q[2], q[3]]);
        } else {
            tris.push([q[0], q[1], q[3]]);
            tris.push([q[1], q[2], q[3]]);
        }
    }
    for t in [0.001, 0.01, 0.05] {
        let g = global_pts(&*MH_NODES);
        let mut patch = Patch::new(8, 6);
        for tri in &tris {
            let c = [g[tri[0]], g[tri[1]], g[tri[2]]];
            patch.add(tri, &to_global(&plate_local_stiffness(&c, *E, *NU, t), &plate_transform_3d(&c), 18));
        }
        run(&format!("DKT+CST t={t}"), &patch, &*MH_NODES, &*MH_INTERIOR);
    }
}

#[test]
fn mitc9_patch_test_distorted() {
    // Straight-sided 9-node quads on the MacNeal–Harder corners: midside nodes at
    // edge midpoints, centre at the bilinear centre (so the map is the bilinear
    // one and constant strain is in the element's span).
    let mut pts: Vec<[f64; 2]> = MH_NODES.to_vec();
    let mut id_of = |p: [f64; 2], pts: &mut Vec<[f64; 2]>| -> usize {
        if let Some(i) = pts.iter().position(|q| (q[0] - p[0]).abs() < 1e-14 && (q[1] - p[1]).abs() < 1e-14) {
            i
        } else {
            pts.push(p);
            pts.len() - 1
        }
    };
    let mid = |a: [f64; 2], b: [f64; 2]| [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
    let mut elems = Vec::new();
    for q in &*MH_QUADS {
        let c = q.map(|i| MH_NODES[i]);
        let mut conn = q.to_vec();
        for e in 0..4 {
            conn.push(id_of(mid(c[e], c[(e + 1) % 4]), &mut pts));
        }
        let ctr = [(c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4.0, (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4.0];
        conn.push(id_of(ctr, &mut pts));
        elems.push(conn);
    }
    // Interior: every node not on the outer rectangle.
    let interior: Vec<usize> = (0..pts.len())
        .filter(|&i| {
            let p = pts[i];
            p[0] > 1e-12 && p[0] < 0.24 - 1e-12 && p[1] > 1e-12 && p[1] < 0.12 - 1e-12
        })
        .collect();
    assert!(interior.len() >= 4 + 5 + 4, "expected interior corner, centre and midside nodes");
    for t in [0.001, 0.01, 0.05] {
        let g = global_pts(&pts);
        let mut patch = Patch::new(pts.len(), 6);
        for conn in &elems {
            let c: [[f64; 3]; 9] = std::array::from_fn(|i| g[conn[i]]);
            patch.add(conn, &to_global(&mitc9_local_stiffness(&c, *E, *NU, t), &quad9_transform_3d(&c), 54));
        }
        run(&format!("MITC9 t={t}"), &patch, &pts, &interior);
    }
}

/// Two layers of hexes (so there are truly interior nodes) on plan `plan` with
/// quads `quads`, level heights `z(plan node, level)`, mapped by rotation `r`.
/// Returns the patch and the global node coordinates (index = level·n_plan + p).
fn solid_patch(
    plan: &[[f64; 2]],
    quads: &[[usize; 4]],
    z: impl Fn(usize, usize) -> f64,
    r: &[[f64; 3]; 3],
) -> (Patch, Vec<[f64; 3]>) {
    let np = plan.len();
    let mut g = Vec::new();
    for l in 0..3 {
        for (p, xy) in plan.iter().enumerate() {
            g.push(to_global_pt(r, [xy[0], xy[1], z(p, l)]));
        }
    }
    let mut patch = Patch::new(3 * np, 3);
    for l in 0..2 {
        for q in quads {
            let conn: Vec<usize> = q.iter().map(|&p| l * np + p).chain(q.iter().map(|&p| (l + 1) * np + p)).collect();
            let c: [[f64; 3]; 8] = std::array::from_fn(|i| g[conn[i]]);
            patch.add(&conn, &solid_shell_stiffness(&c, *E, *NU));
        }
    }
    (patch, g)
}

/// Worst interior residual over the nine unit displacement-gradient states
/// u_i = 1e-3·x_j (global axes): every linear field is a constant-strain state.
fn solid_worst(patch: &Patch, g: &[[f64; 3]], interior: &[usize]) -> (f64, String) {
    let mut worst = (0.0, String::new());
    for comp in 0..9 {
        let (i, j) = (comp / 3, comp % 3);
        let mut u = Vec::new();
        for p in g {
            let mut d = [0.0; 3];
            d[i] = 1e-3 * (p[j] - ORIGIN[j]);
            u.extend(d);
        }
        assert!(patch.total_force(&u) > 0.0);
        let res = patch.interior_residual(&u, interior);
        if res > worst.0 {
            worst = (res, format!("du{i}/dx{j}"));
        }
    }
    worst
}

const IDENTITY: [[f64; 3]; 3] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

/// What the solid shell DOES pass: thickness along global z, plan made of
/// parallelograms (regular or skewed). All nine constant-gradient states.
#[test]
fn solid_shell_patch_test_parallelograms_z_aligned() {
    let quads = [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]];
    for skew in [0.0, 0.05] {
        let plan: Vec<[f64; 2]> = (0..9).map(|k| [0.1 * (k % 3) as f64 + skew * (k / 3) as f64, 0.06 * (k / 3) as f64]).collect();
        let (patch, g) = solid_patch(&plan, &quads, |_, l| 0.02 * l as f64, &IDENTITY);
        let (res, what) = solid_worst(&patch, &g, &[9 + 4]);
        assert!(res < *TOL, "solid shell skew {skew}: interior residual {res:.3e} for {what}");
    }
}

/// The solid shell on a distorted (MacNeal–Harder) plan, flat with thickness
/// along global z and tilted out of every global plane. Regression for the old
/// ANS, which tied GLOBAL Cartesian ε_zz, γ_xz, γ_yz instead of covariant
/// components and left a ~2e-2 residual (transverse-shear states flat, in-plane
/// states too once tilted).
#[test]
fn solid_shell_patch_test_distorted() {
    for (name, r) in [("flat z-aligned", IDENTITY), ("tilted", tilt())] {
        let (patch, g) = solid_patch(&*MH_NODES, &*MH_QUADS, |_, l| 0.02 * l as f64, &r);
        let interior: Vec<usize> = MH_INTERIOR.iter().map(|&p| 8 + p).collect();
        let (res, what) = solid_worst(&patch, &g, &interior);
        assert!(res < *TOL, "solid shell {name} MacNeal–Harder patch: interior residual {res:.3e} for {what}");
    }
}

/// solid_shell_stiffness is invariant under a rigid rotation of the element:
/// K(R·X) = R·K(X)·Rᵀ to round-off, for a 2×1×0.2 box tilted out of every
/// global plane (the old global-z ANS was off by ≈8%).
#[test]
fn solid_shell_stiffness_is_frame_invariant() {
    let c0: [[f64; 3]; 8] = [
        [0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.0, 0.0], [0.0, 1.0, 0.0],
        [0.0, 0.0, 0.2], [2.0, 0.0, 0.2], [2.0, 1.0, 0.2], [0.0, 1.0, 0.2],
    ];
    let r = tilt();
    let c1: [[f64; 3]; 8] = std::array::from_fn(|i| to_global_vec(&r, c0[i]));
    let k0 = solid_shell_stiffness(&c0, *E, *NU);
    let k1 = solid_shell_stiffness(&c1, *E, *NU);
    // u_rotated = Rᵀ·u (to_global_vec), so K(X) must equal T·K(R·X)·Tᵀ with T = blockdiag(R).
    let mut tt = vec![0.0; 576]; // Tᵀ
    for b in 0..8 {
        for i in 0..3 {
            for j in 0..3 {
                tt[(b * 3 + j) * 24 + b * 3 + i] = r[i][j];
            }
        }
    }
    let back = to_global(&k1, &tt, 24);
    let kmax = k0.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    let diff = k0.iter().zip(&back).fold(0.0_f64, |m, (a, b)| m.max((a - b).abs()));
    assert!(diff <= 1e-12 * kmax, "K not frame invariant: max |ΔK| / max |K| = {:.3e}", diff / kmax);
}

/// Control for the invariance check above: MITC4 and the curved shell pass the
/// same rotation test, so the test itself is sound.
#[test]
fn mitc4_and_curved_shell_stiffness_are_frame_invariant() {
    let c0: [[f64; 3]; 4] = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.0], [2.2, 1.0, 0.0], [-0.1, 0.9, 0.0]];
    let r = tilt();
    let c1: [[f64; 3]; 4] = std::array::from_fn(|i| to_global_vec(&r, c0[i]));
    let k0 = to_global(&mitc4_local_stiffness(&c0, *E, *NU, 0.05), &quad_transform_3d(&c0), 24);
    let k1 = to_global(&mitc4_local_stiffness(&c1, *E, *NU, 0.05), &quad_transform_3d(&c1), 24);
    let mut tt = vec![0.0; 576];
    for b in 0..8 {
        for i in 0..3 {
            for j in 0..3 {
                tt[(b * 3 + j) * 24 + b * 3 + i] = r[i][j];
            }
        }
    }
    let back = to_global(&k1, &tt, 24);
    let kmax = k0.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    let diff = k0.iter().zip(&back).fold(0.0_f64, |m, (a, b)| m.max((a - b).abs()));
    assert!(diff <= 1e-10 * kmax, "MITC4 not frame invariant: {:.3e}", diff / kmax);

    // Curved shell (warped geometry), built directly in global coordinates.
    let c0: [[f64; 3]; 4] = [[0.0, 0.0, 0.0], [2.0, 0.1, 0.1], [2.2, 1.0, -0.1], [-0.1, 0.9, 0.1]];
    let c1: [[f64; 3]; 4] = std::array::from_fn(|i| to_global_vec(&r, c0[i]));
    let k0 = curved_shell_stiffness(&c0, &compute_element_directors(&c0), *E, *NU, 0.05);
    let k1 = curved_shell_stiffness(&c1, &compute_element_directors(&c1), *E, *NU, 0.05);
    let back = to_global(&k1, &tt, 24);
    let kmax = k0.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    let diff = k0.iter().zip(&back).fold(0.0_f64, |m, (a, b)| m.max((a - b).abs()));
    assert!(diff <= 1e-10 * kmax, "curved shell not frame invariant: {:.3e}", diff / kmax);
}

/// Locking check for the solid shell: a thin cantilever strip (L = 1, b = 0.1,
/// 8 × 1 × 1 elements, ν = 0, clamped at x = 0, unit tip load along the
/// thickness) must match Euler–Bernoulli δ = PL³/(3EI) as t/L goes from 1/10
/// to 1/1000, flat and tilted. A shear- or thickness-locking element stiffens
/// like (L/t)²; the old global-z ANS did so as soon as the strip was tilted.
#[test]
fn solid_shell_thin_cantilever_does_not_lock() {
    let (l, b, n) = (1.0, 0.1, 8);
    for (name, r) in [("flat", IDENTITY), ("tilted", tilt())] {
        for t in [1e-1, 1e-2, 1e-3] {
            // Node (i, j, k): i along x, j across width, k through thickness.
            let id = |i: usize, j: usize, k: usize| (i * 2 + j) * 2 + k;
            let nn = (n + 1) * 4;
            let mut g = vec![[0.0; 3]; nn];
            for i in 0..=n {
                for j in 0..2 {
                    for k in 0..2 {
                        g[id(i, j, k)] = to_global_pt(&r, [l * i as f64 / n as f64, b * j as f64, t * k as f64]);
                    }
                }
            }
            let mut patch = Patch::new(nn, 3);
            for i in 0..n {
                let conn = [
                    id(i, 0, 0), id(i + 1, 0, 0), id(i + 1, 1, 0), id(i, 1, 0),
                    id(i, 0, 1), id(i + 1, 0, 1), id(i + 1, 1, 1), id(i, 1, 1),
                ];
                let c: [[f64; 3]; 8] = std::array::from_fn(|a| g[conn[a]]);
                patch.add(&conn, &solid_shell_stiffness(&c, *E, 0.0));
            }
            // Free DOFs: every node with i > 0. Load: P/4 along the thickness at the tip.
            let free: Vec<usize> = (12..nn * 3).collect();
            let m = free.len();
            let mut a: Vec<f64> = free.iter().flat_map(|&p| free.iter().map(move |&q| (p, q))).map(|(p, q)| patch.k[p * nn * 3 + q]).collect();
            let mut f = vec![0.0; m];
            for j in 0..2 {
                for k in 0..2 {
                    for d in 0..3 {
                        f[id(n, j, k) * 3 + d - 12] = 0.25 * r[2][d];
                    }
                }
            }
            // Dense Gaussian elimination (SPD, no pivoting needed).
            for p in 0..m {
                for q in (p + 1)..m {
                    let s = a[q * m + p] / a[p * m + p];
                    if s != 0.0 {
                        for c in p..m {
                            a[q * m + c] -= s * a[p * m + c];
                        }
                        f[q] -= s * f[p];
                    }
                }
            }
            let mut u = vec![0.0; m];
            for p in (0..m).rev() {
                let s: f64 = ((p + 1)..m).map(|c| a[p * m + c] * u[c]).sum();
                u[p] = (f[p] - s) / a[p * m + p];
            }
            let tip: f64 = (0..2)
                .flat_map(|j| (0..2).map(move |k| (j, k)))
                .map(|(j, k)| (0..3).map(|d| u[id(n, j, k) * 3 + d - 12] * r[2][d]).sum::<f64>())
                .sum::<f64>()
                / 4.0;
            let ratio = tip / (l.powi(3) / (3.0 * *E * b * t.powi(3) / 12.0));
            assert!((0.97..1.03).contains(&ratio), "solid shell {name} cantilever t/L = {t}: δ/δ_EB = {ratio:.4}");
        }
    }
}

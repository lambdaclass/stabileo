//! Every shell element's stiffness must annihilate the six rigid-body motions.
//!
//! A rigid motion strains nothing, so K·r = 0 is a necessary condition of any element, before
//! any benchmark. An element that fails it acts as a spring to ground on that motion: the model's
//! reactions stop balancing its loads by the force the spring absorbs.
//!
//! The motions are built in global coordinates about an arbitrary point, on tilted and distorted
//! elements, and taken through each element's own global transform (Tᵀ·K·T), exactly as assembly
//! does. Rotations are the nodal rotation DOFs set to ω and translations u = ω × (x − x₀).

use dedaliano_engine::element::curved_shell::{compute_element_directors, curved_shell_stiffness};
use dedaliano_engine::element::quad::{mitc4_local_stiffness, quad_transform_3d};
use dedaliano_engine::element::quad9::{mitc9_local_stiffness, quad9_transform_3d};
use dedaliano_engine::element::{plate_local_stiffness, plate_transform_3d};

const E: f64 = 30.0e6; // kN/m²
const NU: f64 = 0.2;
const T: f64 = 0.2;

/// Tᵀ·K·T for a block rotation T (u_local = T·u_global).
fn to_global(k: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    let mut kt = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let mut s = 0.0;
            for m in 0..n {
                s += k[i * n + m] * t[m * n + j];
            }
            kt[i * n + j] = s;
        }
    }
    let mut out = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let mut s = 0.0;
            for m in 0..n {
                s += t[m * n + i] * kt[m * n + j];
            }
            out[i * n + j] = s;
        }
    }
    out
}

/// The six rigid motions of `nodes`, about `x0`: three translations, then three rotations.
fn rigid_modes(nodes: &[[f64; 3]], x0: [f64; 3]) -> Vec<Vec<f64>> {
    let mut modes = Vec::new();
    for a in 0..3 {
        let mut r = vec![0.0; nodes.len() * 6];
        for i in 0..nodes.len() {
            r[i * 6 + a] = 1.0;
        }
        modes.push(r);
    }
    for a in 0..3 {
        let mut w = [0.0; 3];
        w[a] = 1.0;
        let mut r = vec![0.0; nodes.len() * 6];
        for (i, p) in nodes.iter().enumerate() {
            let d = [p[0] - x0[0], p[1] - x0[1], p[2] - x0[2]];
            let u = [w[1] * d[2] - w[2] * d[1], w[2] * d[0] - w[0] * d[2], w[0] * d[1] - w[1] * d[0]];
            for b in 0..3 {
                r[i * 6 + b] = u[b];
                r[i * 6 + 3 + b] = w[b];
            }
        }
        modes.push(r);
    }
    modes
}

/// max_i |(K·r)_i| relative to max_ij |K_ij| · max_i |r_i|, for each rigid mode.
fn residuals(k: &[f64], n: usize, nodes: &[[f64; 3]]) -> Vec<f64> {
    let kmax = k.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    rigid_modes(nodes, [0.37, -1.21, 0.83])
        .iter()
        .map(|r| {
            let rmax = r.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
            let mut worst = 0.0_f64;
            for i in 0..n {
                let s: f64 = (0..n).map(|j| k[i * n + j] * r[j]).sum();
                worst = worst.max(s.abs());
            }
            worst / (kmax * rmax)
        })
        .collect()
}

/// A flat, distorted element, tilted out of every global plane.
fn tilted(points_2d: &[[f64; 2]]) -> Vec<[f64; 3]> {
    // Orthonormal in-plane basis of a plane with normal (1, 2, 3)/√14.
    let ex = [2.0 / 5f64.sqrt(), -1.0 / 5f64.sqrt(), 0.0];
    let n = [1.0 / 14f64.sqrt(), 2.0 / 14f64.sqrt(), 3.0 / 14f64.sqrt()];
    let ey = [n[1] * ex[2] - n[2] * ex[1], n[2] * ex[0] - n[0] * ex[2], n[0] * ex[1] - n[1] * ex[0]];
    let origin = [1.5, 0.5, 2.0];
    points_2d
        .iter()
        .map(|p| [0, 1, 2].map(|a| origin[a] + p[0] * ex[a] + p[1] * ey[a]))
        .collect()
}

const TOL: f64 = 1e-10;

fn assert_rigid(name: &str, res: &[f64]) {
    let labels = ["tx", "ty", "tz", "rx", "ry", "rz"];
    let bad: Vec<String> = res
        .iter()
        .zip(labels)
        .filter(|(r, _)| **r > TOL)
        .map(|(r, l)| format!("{l}: {r:.3e}"))
        .collect();
    assert!(bad.is_empty(), "{name}: K·r ≠ 0 for rigid motions {bad:?}");
}

#[test]
fn mitc4_annihilates_rigid_motions() {
    let c = tilted(&[[0.0, 0.0], [2.2, 0.1], [2.5, 1.9], [-0.2, 1.6]]);
    let coords: [[f64; 3]; 4] = [c[0], c[1], c[2], c[3]];
    let k = to_global(&mitc4_local_stiffness(&coords, E, NU, T), &quad_transform_3d(&coords), 24);
    assert_rigid("MITC4", &residuals(&k, 24, &c));
}

#[test]
fn mitc9_annihilates_rigid_motions() {
    let corners = [[0.0, 0.0], [2.2, 0.1], [2.5, 1.9], [-0.2, 1.6]];
    let mid = |a: [f64; 2], b: [f64; 2]| [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
    let centre = [(0.0 + 2.2 + 2.5 - 0.2) / 4.0, (0.0 + 0.1 + 1.9 + 1.6) / 4.0];
    let p = [
        corners[0], corners[1], corners[2], corners[3],
        mid(corners[0], corners[1]), mid(corners[1], corners[2]), mid(corners[2], corners[3]), mid(corners[3], corners[0]),
        centre,
    ];
    let c = tilted(&p);
    let coords: [[f64; 3]; 9] = [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]];
    let k = to_global(&mitc9_local_stiffness(&coords, E, NU, T), &quad9_transform_3d(&coords), 54);
    assert_rigid("MITC9", &residuals(&k, 54, &c));
}

#[test]
fn dkt_cst_triangle_annihilates_rigid_motions() {
    let c = tilted(&[[0.0, 0.0], [2.3, 0.2], [0.7, 1.8]]);
    let coords: [[f64; 3]; 3] = [c[0], c[1], c[2]];
    let k = to_global(&plate_local_stiffness(&coords, E, NU, T), &plate_transform_3d(&coords), 18);
    assert_rigid("DKT+CST", &residuals(&k, 18, &c));
}

#[test]
fn curved_shell_annihilates_rigid_motions() {
    let c = tilted(&[[0.0, 0.0], [2.2, 0.1], [2.5, 1.9], [-0.2, 1.6]]);
    let coords: [[f64; 3]; 4] = [c[0], c[1], c[2], c[3]];
    let dirs = compute_element_directors(&coords);
    let k = curved_shell_stiffness(&coords, &dirs, E, NU, T);
    assert_rigid("curved shell", &residuals(&k, 24, &c));
}

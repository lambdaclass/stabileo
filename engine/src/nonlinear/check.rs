//! Checks every element and material of the framework must pass, as plain
//! functions so that each new one is tested the same way:
//!
//! - its tangent is the derivative of its internal force (or stress), by
//!   central differences;
//! - its tangent is symmetric where its formulation is;
//! - it is objective: a rigid motion strains nothing, and a rigidly rotated
//!   state has the rotated internal force (moments included in 3D).
//!
//! The tangent checks return a relative error (largest discrepancy over the
//! largest entry); the rigid-motion checks the absolute largest discrepancy
//! of the internal force, since a rigid motion of an undeformed element has
//! nothing to be relative to. The caller asserts the bound its formulation
//! earns.

use super::element::Element;
use super::material::UniaxialMaterial;
use super::model3d::{Element3D, NodeState3D};
use super::plane_stress::PlaneStressMaterial;
use super::rotation::{exp, mat_mul, mat_vec, Mat3};

fn relative(err: f64, scale: f64) -> f64 {
    if scale > 0.0 { err / scale } else { err }
}

/// Largest |K_ij − FD_ij| over the largest |K_ij|: K at `u` against central
/// differences of the internal force with step `h` on each DOF.
pub fn element_tangent(make: &dyn Fn() -> Box<dyn Element>, u: &[f64], h: f64) -> Result<f64, String> {
    let n = u.len();
    let mut e = make();
    e.update(u)?;
    let k = e.tangent().to_vec();
    let scale = k.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let mut err = 0.0f64;
    for j in 0..n {
        let (mut up, mut um) = (u.to_vec(), u.to_vec());
        up[j] += h;
        um[j] -= h;
        let mut ep = make();
        ep.update(&up)?;
        let mut em = make();
        em.update(&um)?;
        for i in 0..n {
            let fd = (ep.internal_force()[i] - em.internal_force()[i]) / (2.0 * h);
            err = err.max((fd - k[n * i + j]).abs());
        }
    }
    Ok(relative(err, scale))
}

/// The 3D version, with translations perturbed by `h_translation` and nodal
/// rotations by spatial increments of `h_rotation` (R ← exp(±h·e_k)·R): the
/// variables the tangent is written in.
pub fn element3d_tangent(make: &dyn Fn() -> Box<dyn Element3D>, states: &[NodeState3D], h_translation: f64, h_rotation: f64) -> Result<f64, String> {
    let n = 6 * states.len();
    let mut e = make();
    e.update(states)?;
    let k = e.tangent().to_vec();
    let scale = k.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let mut err = 0.0f64;
    for j in 0..n {
        let (node, local) = (j / 6, j % 6);
        let mut f = [Vec::new(), Vec::new()];
        for (c, sign) in [(0, 1.0), (1, -1.0)] {
            let mut st = states.to_vec();
            if local < 3 {
                st[node].u[local] += sign * h_translation;
            } else {
                let mut d = [0.0; 3];
                d[local - 3] = sign * h_rotation;
                st[node].r = mat_mul(&exp(d), &st[node].r);
            }
            let mut ep = make();
            ep.update(&st)?;
            f[c] = ep.internal_force().to_vec();
        }
        let h = if local < 3 { h_translation } else { h_rotation };
        for i in 0..n {
            let fd = (f[0][i] - f[1][i]) / (2.0 * h);
            err = err.max((fd - k[n * i + j]).abs());
        }
    }
    Ok(relative(err, scale))
}

/// max |K_ij − K_ji| over max |K_ij| for a row-major n×n matrix.
pub fn symmetry(k: &[f64], n: usize) -> f64 {
    let scale = k.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let mut err = 0.0f64;
    for i in 0..n {
        for j in 0..i {
            err = err.max((k[n * i + j] - k[n * j + i]).abs());
        }
    }
    relative(err, scale)
}

/// The material tangent against central differences of the stress, from a
/// fresh (virgin) state at `strain`.
pub fn uniaxial_tangent(make: &dyn Fn() -> Box<dyn UniaxialMaterial>, strain: f64, h: f64) -> f64 {
    let mut m = make();
    m.set_trial_strain(strain);
    let t = m.tangent();
    let stress = |x: f64| {
        let mut m = make();
        m.set_trial_strain(x);
        m.stress()
    };
    let fd = (stress(strain + h) - stress(strain - h)) / (2.0 * h);
    relative((fd - t).abs(), t.abs().max(fd.abs()))
}

/// The plane-stress tangent against central differences of the stress, from
/// the state `make` returns (which may carry committed history).
pub fn plane_stress_tangent(make: &dyn Fn() -> Box<dyn PlaneStressMaterial>, strain: [f64; 3], h: f64) -> Result<f64, String> {
    let mut m = make();
    m.set_trial_strain(strain)?;
    let ct = m.tangent();
    let scale = ct.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let mut err = 0.0f64;
    for j in 0..3 {
        let (mut ep, mut em) = (strain, strain);
        ep[j] += h;
        em[j] -= h;
        let mut mp = make();
        mp.set_trial_strain(ep)?;
        let mut mm = make();
        mm.set_trial_strain(em)?;
        for i in 0..3 {
            let fd = (mp.stress()[i] - mm.stress()[i]) / (2.0 * h);
            err = err.max((fd - ct[3 * i + j]).abs());
        }
    }
    Ok(relative(err, scale))
}

/// Objectivity of a 2D element whose nodes (undeformed at `coords`) carry
/// `dofs_per_node` DOFs (2: ux, uz; 3: ux, uz, θ): the state `u`, rotated
/// rigidly by φ about the origin and translated by `t`, must give the
/// internal force rotated by φ (moments unchanged). With `u` zero this is
/// "a rigid motion strains nothing". Returns the largest absolute discrepancy.
pub fn rigid_motion_2d(make: &dyn Fn() -> Box<dyn Element>, coords: &[[f64; 2]], dofs_per_node: usize, u: &[f64], phi: f64, t: [f64; 2]) -> Result<f64, String> {
    let (c, s) = (phi.cos(), phi.sin());
    let rot = |v: [f64; 2]| [c * v[0] - s * v[1], s * v[0] + c * v[1]];
    let mut moved = u.to_vec();
    for (n, x0) in coords.iter().enumerate() {
        let b = n * dofs_per_node;
        let x = [x0[0] + u[b], x0[1] + u[b + 1]];
        let xr = rot(x);
        moved[b] = xr[0] + t[0] - x0[0];
        moved[b + 1] = xr[1] + t[1] - x0[1];
        if dofs_per_node == 3 {
            moved[b + 2] = u[b + 2] + phi;
        }
    }
    let mut e0 = make();
    e0.update(u)?;
    let mut e1 = make();
    e1.update(&moved)?;
    let (f0, f1) = (e0.internal_force(), e1.internal_force());
    let mut err = 0.0f64;
    for n in 0..coords.len() {
        let b = n * dofs_per_node;
        let fr = rot([f0[b], f0[b + 1]]);
        err = err.max((f1[b] - fr[0]).abs()).max((f1[b + 1] - fr[1]).abs());
        if dofs_per_node == 3 {
            err = err.max((f1[b + 2] - f0[b + 2]).abs());
        }
    }
    Ok(err)
}

/// Objectivity of a 3D element: the states rotated rigidly by `q` about the
/// origin (positions and nodal rotations) and translated by `t` must give the
/// internal force with both its forces and its moments rotated by `q`.
/// Returns the largest absolute discrepancy.
pub fn rigid_motion_3d(make: &dyn Fn() -> Box<dyn Element3D>, states: &[NodeState3D], q: &Mat3, t: [f64; 3]) -> Result<f64, String> {
    let moved: Vec<NodeState3D> = states
        .iter()
        .map(|s| {
            let p = mat_vec(q, s.position());
            NodeState3D { x0: s.x0, u: [p[0] + t[0] - s.x0[0], p[1] + t[1] - s.x0[1], p[2] + t[2] - s.x0[2]], r: mat_mul(q, &s.r) }
        })
        .collect();
    let mut e0 = make();
    e0.update(states)?;
    let mut e1 = make();
    e1.update(&moved)?;
    let (f0, f1) = (e0.internal_force(), e1.internal_force());
    let mut err = 0.0f64;
    for blk in 0..2 * states.len() {
        let b = 3 * blk;
        let r = mat_vec(q, [f0[b], f0[b + 1], f0[b + 2]]);
        for k in 0..3 {
            err = err.max((f1[b + k] - r[k]).abs());
        }
    }
    Ok(err)
}

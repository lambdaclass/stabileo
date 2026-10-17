//! Certified per-element bounds on member end forces, from a certified
//! displacement bound.
//!
//! In linear statics a member's local end forces are `f = k_local · T · u_e − fef`:
//! affine in its end displacements `u_e`, with `fef` independent of `u`. So the
//! forces evaluated at the exact solution `u*` and at the computed `ũ` differ, in
//! local component `i`, by `|(k_local T (u*_e − ũ_e))_i| ≤ ‖row_i(k_local)‖₂ ·
//! ‖T‖₂ · ‖u* − ũ‖₂`, and `‖T‖₂ ≤ 1 + 4ε` (an orthogonal matrix up to rounding of
//! its entries). With `‖u* − ũ‖₂ ≤ abs_bound` from the displacement certificate,
//! each bound below holds for both end values of that force component.
//!
//! The bound covers the displacement error only; evaluating the force formulas
//! in f64 adds rounding of order ε·|terms|, which is not included.
//!
//! Warping frames (14 DOFs, `frame_local_stiffness_3d_warping`) are covered the
//! same way, bimoment included. Shell stress resultants (MITC4 quads, DKT
//! plates, MITC9 quads) are linear in the element's local displacements,
//! `s = L · T · u_e` (thermal terms are constant): `L`'s columns are obtained by
//! running the solver's own recovery on unit vectors with zero thermal load,
//! and each resultant gets `‖row_i(L)‖₂ · ‖T‖₂ · ‖u* − ũ‖₂`. Von Mises and
//! principal stresses are not linear and get no bound; solid shells neither.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::element::{frame_local_stiffness_2d, frame_local_stiffness_3d, frame_local_stiffness_3d_warping, Hinge3D};
use crate::solver::dof::DofNumbering;
use crate::types::*;

/// Bounds on |force(u*) − force(ũ)| for one 2D member (kN, kN·m).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceBound2D {
    pub element_id: usize,
    pub n: f64,
    pub v: f64,
    pub m: f64,
}

/// Bounds on |force(u*) − force(ũ)| for one 3D member (local axes).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceBound3D {
    pub element_id: usize,
    pub n: f64,
    pub vy: f64,
    pub vz: f64,
    pub t: f64,
    pub my: f64,
    pub mz: f64,
    /// Bimoment (warping frames only; 0 otherwise).
    #[serde(default)]
    pub bimoment: f64,
}

/// Bounds on |resultant(u*) − resultant(ũ)| for one shell element, at the
/// points the solver reports (`QuadStress` / `PlateStress`, element axes).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellBound {
    pub element_id: usize,
    /// "quad", "plate" or "quad9" (their ids are independent counters).
    pub kind: String,
    pub sigma_xx: f64,
    pub sigma_yy: f64,
    pub tau_xy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    /// Transverse shear (MITC4 quads only, where the solver reports it).
    pub qx: Option<f64>,
    pub qy: Option<f64>,
}

#[inline]
pub(crate) fn up(x: f64) -> f64 {
    x.next_up()
}

/// ‖T‖₂ ≤ 1 + 4ε for a rotation whose entries are rounded.
pub(crate) const T_NORM: f64 = 1.0 + 4.0 * f64::EPSILON;

/// Upper bound on the 2-norm of row `i` of an n×n row-major matrix.
pub(crate) fn row_norm(k: &[f64], n: usize, i: usize) -> f64 {
    let mut s = 0.0f64;
    for &x in &k[i * n..(i + 1) * n] {
        s = up(s + up(x * x));
    }
    up(s.sqrt())
}

/// One member's local stiffness exactly as the solver's force recovery builds
/// it (`compute_internal_forces_{2d,3d}`): `k` is `n × n` row-major in local
/// DOFs; a truss/cable has `n = 2` and `k = [EA/L, −EA/L]` (its one axial row).
pub(crate) struct LocalK {
    pub element_id: usize,
    /// The member length as the force recovery computes it (`ef.length`).
    pub length: f64,
    pub n: usize,
    pub k: Vec<f64>,
    pub truss: bool,
}

impl LocalK {
    /// Row `i` of `k` (the truss has its single row at 0).
    pub fn row(&self, i: usize) -> &[f64] {
        if self.truss {
            &self.k
        } else {
            &self.k[i * self.n..(i + 1) * self.n]
        }
    }
}

/// Every 2D member's local stiffness, as `assemble_stiffness_2d` and
/// `compute_internal_forces_2d` build it, sorted by element id.
pub(crate) fn local_stiffness_2d(input: &SolverInput) -> Vec<LocalK> {
    let nodes: HashMap<usize, &SolverNode> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection> = input.sections.values().map(|s| (s.id, s)).collect();
    let mut out: Vec<LocalK> = input
        .elements
        .values()
        .map(|elem| {
            let (ni, nj) = (nodes[&elem.node_i], nodes[&elem.node_j]);
            let (mat, sec) = (mats[&elem.material_id], secs[&elem.section_id]);
            let (dx, dy) = (nj.x - ni.x, nj.z - ni.z);
            let l = (dx * dx + dy * dy).sqrt();
            let e = mat.e * 1000.0;
            if elem.elem_type == "truss" || elem.elem_type == "cable" {
                // local axial stiffness EA/L·[[1, −1], [−1, 1]]: row norm √2·EA/L
                let k = vec![e * sec.a / l, -(e * sec.a / l)];
                return LocalK { element_id: elem.id, length: l, n: 2, k, truss: true };
            }
            let phi = match sec.as_y {
                Some(as_y) => {
                    let g = e / (2.0 * (1.0 + mat.nu));
                    12.0 * e * sec.iz / (g * as_y * l * l)
                }
                None => 0.0,
            };
            let k = frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi);
            LocalK { element_id: elem.id, length: l, n: 6, k, truss: false }
        })
        .collect();
    out.sort_by_key(|b| b.element_id);
    out
}

/// Every 3D member's local stiffness (frames, warping frames, trusses), as
/// `assemble_stiffness_3d` and `compute_internal_forces_3d` build it, sorted by
/// element id. Warping members in a 7-DOF-per-node model have `n = 14`.
pub(crate) fn local_stiffness_3d(input: &SolverInput3D) -> Vec<LocalK> {
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let secs: HashMap<usize, &SolverSection3D> = input.sections.values().map(|s| (s.id, s)).collect();
    // The solver uses the 14-DOF warping element only in a 7-DOF-per-node model.
    let warping_model = DofNumbering::build_3d(input).dofs_per_node >= 7;
    let mut out: Vec<LocalK> = input
        .elements
        .values()
        .map(|elem| {
            let (ni, nj) = (nodes[&elem.node_i], nodes[&elem.node_j]);
            let (mat, sec) = (mats[&elem.material_id], secs[&elem.section_id]);
            let (dx, dy, dz) = (nj.x - ni.x, nj.y - ni.y, nj.z - ni.z);
            let l = (dx * dx + dy * dy + dz * dz).sqrt();
            let e = mat.e * 1000.0;
            let g = e / (2.0 * (1.0 + mat.nu));
            if elem.elem_type == "truss" || elem.elem_type == "cable" {
                let k = vec![e * sec.a / l, -(e * sec.a / l)];
                return LocalK { element_id: elem.id, length: l, n: 2, k, truss: true };
            }
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                (
                    sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0),
                    sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0),
                )
            } else {
                (0.0, 0.0)
            };
            if let (Some(cw), true) = (sec.cw.filter(|&cw| cw > 0.0), warping_model) {
                // 14 DOFs [u1 v1 w1 θx1 θy1 θz1 φ'1 u2 … φ'2], as compute_internal_forces_3d.
                let k = frame_local_stiffness_3d_warping(
                    e, sec.a, sec.iy, sec.iz, sec.j, cw, l, g, Hinge3D::from_elem(elem), phi_y, phi_z,
                );
                return LocalK { element_id: elem.id, length: l, n: 14, k, truss: false };
            }
            let k = frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g, Hinge3D::from_elem(elem), phi_y, phi_z,
            );
            LocalK { element_id: elem.id, length: l, n: 12, k, truss: false }
        })
        .collect();
    out.sort_by_key(|b| b.element_id);
    out
}

/// `‖row‖ · ‖T‖ · abs_bound` over the given rows (max), rounded up.
pub(crate) fn scaled_row_bound(lk: &LocalK, rows: &[usize], abs_bound: f64) -> f64 {
    let r = rows.iter().map(|&i| row_norm(lk.row(i), lk.row(i).len(), 0)).fold(0.0, f64::max);
    up(up(r * T_NORM) * abs_bound)
}

/// Per-member force bounds for a 2D model, given `‖u* − ũ‖₂ ≤ abs_bound`.
/// Uses the element stiffness exactly as `assemble_stiffness_2d` builds it.
pub fn force_bounds_2d(input: &SolverInput, abs_bound: f64) -> Vec<ForceBound2D> {
    local_stiffness_2d(input)
        .iter()
        .map(|lk| {
            let b = |rows: &[usize]| scaled_row_bound(lk, rows, abs_bound);
            if lk.truss {
                return ForceBound2D { element_id: lk.element_id, n: b(&[0]), v: 0.0, m: 0.0 };
            }
            ForceBound2D { element_id: lk.element_id, n: b(&[0, 3]), v: b(&[1, 4]), m: b(&[2, 5]) }
        })
        .collect()
}

/// Per-member force bounds for a 3D model (frames, warping frames and
/// trusses), given `‖u* − ũ‖₂ ≤ abs_bound`. Uses the element stiffness exactly
/// as `assemble_stiffness_3d` builds it.
pub fn force_bounds_3d(input: &SolverInput3D, abs_bound: f64) -> Vec<ForceBound3D> {
    local_stiffness_3d(input)
        .iter()
        .map(|lk| {
            let b = |rows: &[usize]| scaled_row_bound(lk, rows, abs_bound);
            let eid = lk.element_id;
            match lk.n {
                2 => ForceBound3D { element_id: eid, n: b(&[0]), vy: 0.0, vz: 0.0, t: 0.0, my: 0.0, mz: 0.0, bimoment: 0.0 },
                14 => ForceBound3D {
                    element_id: eid,
                    n: b(&[0, 7]), vy: b(&[1, 8]), vz: b(&[2, 9]), t: b(&[3, 10]),
                    my: b(&[4, 11]), mz: b(&[5, 12]), bimoment: b(&[6, 13]),
                },
                _ => ForceBound3D {
                    element_id: eid,
                    n: b(&[0, 6]), vy: b(&[1, 7]), vz: b(&[2, 8]), t: b(&[3, 9]),
                    my: b(&[4, 10]), mz: b(&[5, 11]), bimoment: 0.0,
                },
            }
        })
        .collect()
}

/// `‖row‖₂` of each row of a row-major `rows × cols` matrix, rounded up.
fn row_norms(l: &[f64], rows: usize, cols: usize) -> Vec<f64> {
    (0..rows).map(|i| row_norm(&l[i * cols..(i + 1) * cols], cols, 0)).collect()
}

/// Columns `L e_k` of a linear recovery `f: ℝ^cols → ℝ^rows`, row-major.
fn probe(rows: usize, cols: usize, f: impl Fn(&[f64]) -> Vec<f64>) -> Vec<f64> {
    let mut l = vec![0.0; rows * cols];
    let mut e = vec![0.0; cols];
    for k in 0..cols {
        e[k] = 1.0;
        for (i, v) in f(&e).into_iter().enumerate() {
            l[i * cols + k] = v;
        }
        e[k] = 0.0;
    }
    l
}

/// Per-element bounds on the shell stress resultants the solver reports
/// (MITC4 quads, DKT plates, MITC9 quads), given `‖u* − ũ‖₂ ≤ abs_bound`.
pub fn shell_bounds_3d(input: &SolverInput3D, abs_bound: f64) -> Vec<ShellBound> {
    use crate::element::{plate_stress_recovery, quad, quad9};
    let nodes: HashMap<usize, &SolverNode3D> = input.nodes.values().map(|n| (n.id, n)).collect();
    let mats: HashMap<usize, &SolverMaterial> = input.materials.values().map(|m| (m.id, m)).collect();
    let xyz = |id: usize| [nodes[&id].x, nodes[&id].y, nodes[&id].z];
    let scale = |r: f64| up(up(r * T_NORM) * abs_bound);
    let mut out = Vec::new();
    for q in input.quads.values() {
        let (e, nu, t) = (mats[&q.material_id].e * 1000.0, mats[&q.material_id].nu, q.thickness);
        let c: [[f64; 3]; 4] = q.nodes.map(xyz);
        let l = probe(8, 24, |u| {
            let mut ul = [0.0; 24];
            ul.copy_from_slice(u);
            let s = quad::quad_stresses(&c, &ul, e, nu, t, 0.0, 0.0, 0.0);
            let qs = quad::quad_transverse_shear(&c, &ul, e, nu, t);
            vec![s.sigma_xx, s.sigma_yy, s.tau_xy, s.mx, s.my, s.mxy, qs[0], qs[1]]
        });
        let r = row_norms(&l, 8, 24);
        out.push(ShellBound {
            element_id: q.id,
            kind: "quad".into(),
            sigma_xx: scale(r[0]), sigma_yy: scale(r[1]), tau_xy: scale(r[2]),
            mx: scale(r[3]), my: scale(r[4]), mxy: scale(r[5]),
            qx: Some(scale(r[6])), qy: Some(scale(r[7])),
        });
    }
    for p in input.plates.values() {
        let (e, nu, t) = (mats[&p.material_id].e * 1000.0, mats[&p.material_id].nu, p.thickness);
        let c: [[f64; 3]; 3] = p.nodes.map(xyz);
        let l = probe(6, 18, |u| {
            let s = plate_stress_recovery(&c, e, nu, t, u, 0.0, 0.0, 0.0);
            vec![s.sigma_xx, s.sigma_yy, s.tau_xy, s.mx, s.my, s.mxy]
        });
        let r = row_norms(&l, 6, 18);
        out.push(ShellBound {
            element_id: p.id,
            kind: "plate".into(),
            sigma_xx: scale(r[0]), sigma_yy: scale(r[1]), tau_xy: scale(r[2]),
            mx: scale(r[3]), my: scale(r[4]), mxy: scale(r[5]),
            qx: None, qy: None,
        });
    }
    for q in input.quad9s.values() {
        let (e, nu, t) = (mats[&q.material_id].e * 1000.0, mats[&q.material_id].nu, q.thickness);
        let c: [[f64; 3]; 9] = q.nodes.map(xyz);
        let l = probe(6, 54, |u| {
            let s = quad9::quad9_stresses(&c, u, e, nu, t, 0.0, 0.0, 0.0);
            vec![s.sigma_xx, s.sigma_yy, s.tau_xy, s.mx, s.my, s.mxy]
        });
        let r = row_norms(&l, 6, 54);
        out.push(ShellBound {
            element_id: q.id,
            kind: "quad9".into(),
            sigma_xx: scale(r[0]), sigma_yy: scale(r[1]), tau_xy: scale(r[2]),
            mx: scale(r[3]), my: scale(r[4]), mxy: scale(r[5]),
            qx: None, qy: None,
        });
    }
    out.sort_by(|a, b| (&a.kind, a.element_id).cmp(&(&b.kind, b.element_id)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solver::linear::{compute_internal_forces_2d, compute_internal_forces_3d, solve_2d, solve_3d};

    /// Deterministic pseudo-random direction in the free DOFs, scaled to norm `b`.
    fn perturbation(n_total: usize, nf: usize, b: f64, seed: usize) -> Vec<f64> {
        let mut d: Vec<f64> = (0..n_total)
            .map(|i| if i < nf { (((i + seed) * 7919) % 211) as f64 / 105.5 - 1.0 } else { 0.0 })
            .collect();
        let nrm = d.iter().map(|x| x * x).sum::<f64>().sqrt();
        d.iter_mut().for_each(|x| *x *= b / nrm);
        d
    }

    #[test]
    fn force_bounds_2d_cover_displacement_perturbations() {
        let input: SolverInput =
            serde_json::from_str(include_str!("../../tests/fixtures/ex-building-3story-dlw-case1-input.json")).unwrap();
        let res = solve_2d(&input).unwrap();
        let dof = DofNumbering::build_2d(&input);
        let u = super::super::solver::gather_u_2d(&dof, &res.displacements).unwrap();
        let b = 1e-3;
        let bounds: HashMap<usize, ForceBound2D> =
            force_bounds_2d(&input, b).into_iter().map(|f| (f.element_id, f)).collect();
        let f0 = compute_internal_forces_2d(&input, &dof, &u);
        let mut worst = 0.0f64;
        for seed in 0..20 {
            let d = perturbation(dof.n_total, dof.n_free, b, seed);
            let u1: Vec<f64> = u.iter().zip(&d).map(|(a, b)| a + b).collect();
            for (a, c) in f0.iter().zip(compute_internal_forces_2d(&input, &dof, &u1)) {
                let fb = &bounds[&a.element_id];
                let slack = 1e-9 * (1.0 + fb.n + fb.v + fb.m); // f64 evaluation rounding
                assert!((a.n_start - c.n_start).abs() <= fb.n + slack, "N {} {fb:?}", a.element_id);
                assert!((a.n_end - c.n_end).abs() <= fb.n + slack, "N {}", a.element_id);
                assert!((a.v_start - c.v_start).abs() <= fb.v + slack, "V {}", a.element_id);
                assert!((a.v_end - c.v_end).abs() <= fb.v + slack, "V {}", a.element_id);
                assert!((a.m_start - c.m_start).abs() <= fb.m + slack, "M {}", a.element_id);
                assert!((a.m_end - c.m_end).abs() <= fb.m + slack, "M {}", a.element_id);
                worst = worst.max((a.m_start - c.m_start).abs() / fb.m).max((a.n_start - c.n_start).abs() / fb.n);
            }
        }
        // Not vacuous: random perturbations reach a real fraction of the bound.
        assert!(worst > 0.05, "bounds look vacuous: max ratio {worst}");
    }

    #[test]
    fn force_bounds_3d_cover_displacement_perturbations() {
        let input: SolverInput3D =
            serde_json::from_str(include_str!("../../tests/fixtures/ex-3d-portal-frame-input.json")).unwrap();
        let res = solve_3d(&input).unwrap();
        let dof = DofNumbering::build_3d(&input);
        let u = super::super::solver::gather_u_3d(&dof, &res.displacements).unwrap();
        let b = 1e-4;
        let bounds: HashMap<usize, ForceBound3D> =
            force_bounds_3d(&input, b).into_iter().map(|f| (f.element_id, f)).collect();
        let f0 = compute_internal_forces_3d(&input, &dof, &u);
        let mut worst = 0.0f64;
        for seed in 0..20 {
            let d = perturbation(dof.n_total, dof.n_free, b, seed);
            let u1: Vec<f64> = u.iter().zip(&d).map(|(a, b)| a + b).collect();
            for (a, c) in f0.iter().zip(compute_internal_forces_3d(&input, &dof, &u1)) {
                let Some(fb) = bounds.get(&a.element_id) else { continue };
                let s = 1e-9 * (1.0 + fb.n + fb.vy + fb.vz + fb.t + fb.my + fb.mz);
                let pairs = [
                    (a.n_start - c.n_start, fb.n), (a.n_end - c.n_end, fb.n),
                    (a.vy_start - c.vy_start, fb.vy), (a.vy_end - c.vy_end, fb.vy),
                    (a.vz_start - c.vz_start, fb.vz), (a.vz_end - c.vz_end, fb.vz),
                    (a.mx_start - c.mx_start, fb.t), (a.mx_end - c.mx_end, fb.t),
                    (a.my_start - c.my_start, fb.my), (a.my_end - c.my_end, fb.my),
                    (a.mz_start - c.mz_start, fb.mz), (a.mz_end - c.mz_end, fb.mz),
                ];
                for (k, (diff, bnd)) in pairs.iter().enumerate() {
                    assert!(diff.abs() <= bnd + s, "elem {} component {k}: {diff} > {bnd}", a.element_id);
                    if *bnd > 0.0 {
                        worst = worst.max(diff.abs() / bnd);
                    }
                }
            }
        }
        assert!(worst > 0.05, "bounds look vacuous: max ratio {worst}");
    }

    /// Cantilever with a warping section (14-DOF elements), warping restrained
    /// at the root, torque and bending at the tip.
    #[test]
    fn force_bounds_warping_cover_displacement_perturbations() {
        use std::collections::HashMap as Map;
        let mut nodes = Map::new();
        for i in 0..=6 {
            nodes.insert((i + 1).to_string(), SolverNode3D { id: i + 1, x: i as f64, y: 0.2 * i as f64, z: 0.0 });
        }
        let mut elements = Map::new();
        for i in 1..=6 {
            elements.insert(i.to_string(), SolverElement3D {
                id: i, elem_type: "frame".into(), node_i: i, node_j: i + 1, material_id: 1, section_id: 1,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
        }
        let mut sections = Map::new();
        sections.insert("1".into(), SolverSection3D {
            id: 1, name: None, a: 5e-3, iy: 4e-5, iz: 2e-6, j: 1e-7, cw: Some(2e-8), as_y: None, as_z: None,
        });
        let mut materials = Map::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
        let mut supports = Map::new();
        supports.insert("1".into(), SolverSupport3D {
            node_id: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            rw: Some(true), kw: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        });
        let input = SolverInput3D {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 7, fx: 1.0, fy: -2.0, fz: 3.0, mx: 0.5, my: 0.1, mz: 0.0, bw: None,
            })],
            constraints: vec![], left_hand: None, plates: Map::new(), quads: Map::new(), quad9s: Map::new(),
            solid_shells: Map::new(), curved_beams: vec![], curved_shells: Map::new(), connectors: Map::new(),
            solver_options: None,
        };
        let res = solve_3d(&input).unwrap();
        let dof = DofNumbering::build_3d(&input);
        assert_eq!(dof.dofs_per_node, 7, "warping model");
        let u = super::super::solver::gather_u_3d(&dof, &res.displacements).unwrap();
        let b = 1e-5;
        let bounds: HashMap<usize, ForceBound3D> =
            force_bounds_3d(&input, b).into_iter().map(|f| (f.element_id, f)).collect();
        assert_eq!(bounds.len(), 6, "every warping member gets a bound");
        let f0 = compute_internal_forces_3d(&input, &dof, &u);
        let mut worst = 0.0f64;
        let mut worst_b = 0.0f64;
        for seed in 0..30 {
            let d = perturbation(dof.n_total, dof.n_free, b, seed);
            let u1: Vec<f64> = u.iter().zip(&d).map(|(a, b)| a + b).collect();
            for (a, c) in f0.iter().zip(compute_internal_forces_3d(&input, &dof, &u1)) {
                let fb = &bounds[&a.element_id];
                assert!(fb.bimoment > 0.0);
                let s = 1e-9 * (1.0 + fb.n + fb.vy + fb.vz + fb.t + fb.my + fb.mz + fb.bimoment);
                let bi = |x: &ElementForces3D| (x.bimoment_start.unwrap(), x.bimoment_end.unwrap());
                let pairs = [
                    (a.n_start - c.n_start, fb.n), (a.n_end - c.n_end, fb.n),
                    (a.vy_start - c.vy_start, fb.vy), (a.vy_end - c.vy_end, fb.vy),
                    (a.vz_start - c.vz_start, fb.vz), (a.vz_end - c.vz_end, fb.vz),
                    (a.mx_start - c.mx_start, fb.t), (a.mx_end - c.mx_end, fb.t),
                    (a.my_start - c.my_start, fb.my), (a.my_end - c.my_end, fb.my),
                    (a.mz_start - c.mz_start, fb.mz), (a.mz_end - c.mz_end, fb.mz),
                    (bi(a).0 - bi(&c).0, fb.bimoment), (bi(a).1 - bi(&c).1, fb.bimoment),
                ];
                for (k, (diff, bnd)) in pairs.iter().enumerate() {
                    assert!(diff.abs() <= bnd + s, "elem {} component {k}: {diff} > {bnd}", a.element_id);
                    if *bnd > 0.0 {
                        worst = worst.max(diff.abs() / bnd);
                    }
                }
                worst_b = worst_b.max((bi(a).0 - bi(&c).0).abs() / fb.bimoment);
            }
        }
        assert!(worst > 0.05 && worst_b > 0.01, "bounds look vacuous: {worst} {worst_b}");
    }

    #[derive(Clone, Copy, PartialEq, Debug)]
    enum Shell {
        Mitc4,
        Dkt,
        Mitc9,
    }

    /// A 4×2 strip in a tilted plane (so the element transforms are not the
    /// identity), clamped on one edge, loaded in and out of plane at the tip.
    fn shell_strip(kind: Shell) -> SolverInput3D {
        use std::collections::HashMap as Map;
        let (nx, ny) = (4, 2);
        let sub = if kind == Shell::Mitc9 { 2 } else { 1 };
        let (mx, my) = (nx * sub, ny * sub);
        let (ca, sa) = (0.6f64.cos(), 0.6f64.sin());
        let mut nodes = Map::new();
        let mut lat = vec![vec![0usize; my + 1]; mx + 1];
        let mut id = 1;
        for (i, row) in lat.iter_mut().enumerate() {
            for (j, slot) in row.iter_mut().enumerate() {
                let (x, y) = (4.0 * i as f64 / mx as f64, 1.0 * j as f64 / my as f64);
                nodes.insert(id.to_string(), SolverNode3D { id, x, y: y * ca, z: y * sa });
                *slot = id;
                id += 1;
            }
        }
        let g = |i: usize, j: usize| lat[i * sub][j * sub];
        let (mut quads, mut plates, mut quad9s) = (Map::new(), Map::new(), Map::new());
        let mut eid = 1;
        for i in 0..nx {
            for j in 0..ny {
                let n = [g(i, j), g(i + 1, j), g(i + 1, j + 1), g(i, j + 1)];
                match kind {
                    Shell::Mitc4 => {
                        quads.insert(eid.to_string(), SolverQuadElement { id: eid, nodes: n, material_id: 1, thickness: 0.05 });
                    }
                    Shell::Dkt => {
                        plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[1], n[2]], material_id: 1, thickness: 0.05 });
                        eid += 1;
                        plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[2], n[3]], material_id: 1, thickness: 0.05 });
                    }
                    Shell::Mitc9 => {
                        let (a, b) = (2 * i, 2 * j);
                        let n9 = [
                            lat[a][b], lat[a + 2][b], lat[a + 2][b + 2], lat[a][b + 2],
                            lat[a + 1][b], lat[a + 2][b + 1], lat[a + 1][b + 2], lat[a][b + 1],
                            lat[a + 1][b + 1],
                        ];
                        quad9s.insert(eid.to_string(), SolverQuad9Element { id: eid, nodes: n9, material_id: 1, thickness: 0.05 });
                    }
                }
                eid += 1;
            }
        }
        let mut supports = Map::new();
        for (k, &nid) in lat[0].iter().enumerate() {
            supports.insert((k + 1).to_string(), SolverSupport3D {
                node_id: nid, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
                kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
        }
        let loads = lat[mx]
            .iter()
            .map(|&n| SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n, fx: 2.0, fy: -1.0, fz: 0.5, mx: 0.01, my: 0.02, mz: 0.0, bw: None,
            }))
            .collect();
        let mut materials = Map::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.25 });
        SolverInput3D {
            nodes, materials, sections: Map::new(), elements: Map::new(), supports, loads,
            constraints: vec![], left_hand: None, solver_options: None,
            plates, quads, quad9s, solid_shells: Map::new(), curved_shells: Map::new(),
            curved_beams: vec![], connectors: Map::new(),
        }
    }

    /// The reported resultants as (kind, id, [σxx σyy τxy mx my mxy qx qy]).
    fn resultants(input: &SolverInput3D, dof: &DofNumbering, u: &[f64]) -> Vec<(String, usize, [f64; 8])> {
        use crate::solver::linear::{compute_plate_stresses, compute_quad_stresses};
        let mut v: Vec<(String, usize, [f64; 8])> = compute_plate_stresses(input, dof, u, None)
            .into_iter()
            .map(|s| ("plate".to_string(), s.element_id, [s.sigma_xx, s.sigma_yy, s.tau_xy, s.mx, s.my, s.mxy, 0.0, 0.0]))
            .collect();
        let kind = if input.quad9s.is_empty() { "quad" } else { "quad9" };
        v.extend(compute_quad_stresses(input, dof, u, None).into_iter().map(|s| {
            let q = [s.qx.unwrap_or(0.0), s.qy.unwrap_or(0.0)];
            (kind.to_string(), s.element_id, [s.sigma_xx, s.sigma_yy, s.tau_xy, s.mx, s.my, s.mxy, q[0], q[1]])
        }));
        v
    }

    #[test]
    fn shell_bounds_cover_displacement_perturbations() {
        for kind in [Shell::Mitc4, Shell::Dkt, Shell::Mitc9] {
            let input = shell_strip(kind);
            let res = solve_3d(&input).unwrap();
            let dof = DofNumbering::build_3d(&input);
            let u = super::super::solver::gather_u_3d(&dof, &res.displacements).unwrap();
            let b = 1e-5;
            let bounds: HashMap<(String, usize), ShellBound> =
                shell_bounds_3d(&input, b).into_iter().map(|s| ((s.kind.clone(), s.element_id), s)).collect();
            let r0 = resultants(&input, &dof, &u);
            assert_eq!(bounds.len(), r0.len(), "{kind:?}: one bound per element");
            let mut worst = [0.0f64; 8];
            for seed in 0..30 {
                let d = perturbation(dof.n_total, dof.n_free, b, seed);
                let u1: Vec<f64> = u.iter().zip(&d).map(|(a, b)| a + b).collect();
                for ((k, id, a), (_, _, c)) in r0.iter().zip(resultants(&input, &dof, &u1)) {
                    let sb = &bounds[&(k.clone(), *id)];
                    let bs = [
                        sb.sigma_xx, sb.sigma_yy, sb.tau_xy, sb.mx, sb.my, sb.mxy,
                        sb.qx.unwrap_or(0.0), sb.qy.unwrap_or(0.0),
                    ];
                    for i in 0..8 {
                        let diff = (a[i] - c[i]).abs();
                        let slack = 1e-9 * (1.0 + bs.iter().sum::<f64>());
                        assert!(diff <= bs[i] + slack, "{kind:?} {k} {id} component {i}: {diff:e} > {:e}", bs[i]);
                        if bs[i] > 0.0 {
                            worst[i] = worst[i].max(diff / bs[i]);
                        }
                    }
                }
            }
            let reported = if kind == Shell::Mitc4 { 8 } else { 6 };
            for (i, w) in worst.iter().take(reported).enumerate() {
                assert!(*w > 0.02, "{kind:?}: component {i} bound looks vacuous: max ratio {w}");
            }
        }
    }
}
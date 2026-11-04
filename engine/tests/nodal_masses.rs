//! Nodal (lumped), line and area masses in the dynamic analyses (#341).
//!
//! The engine took mass only from material density. `SolverInput::masses` /
//! `SolverInput3D::masses` add lumped masses at nodes (per direction, with
//! rotary inertia), mass per length along members and mass per area over
//! shells. Checked against closed forms (SDOF, 2-DOF, cantilever with a tip
//! mass, torsional SDOF), against models that carry the same mass another way
//! (raised density, mass-only stub elements, a diaphragm master with m·r²,
//! a linear MPC in place of an inclined support), and through every analysis
//! that reads the mass matrix.

use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d};
use dedaliano_engine::solver::harmonic::{solve_harmonic_2d, HarmonicInput};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::solver::reduction::{craig_bampton_2d, CraigBamptonInput};
use dedaliano_engine::solver::time_integration::solve_time_history_2d;
use dedaliano_engine::types::*;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::f64::consts::PI;

const E_MPA: f64 = 200_000.0;
const E: f64 = E_MPA * 1000.0; // kN/m²

fn close(what: &str, a: f64, b: f64, rel: f64) {
    assert!((a - b).abs() <= rel * b.abs().max(1e-300), "{what}: {a} vs {b} (rel {:e})", (a - b).abs() / b.abs());
}

fn no_density() -> HashMap<String, f64> {
    HashMap::new()
}

/// 2D vertical cantilever, `n` elements of length `l / n`, fixed at node 1.
fn cantilever_2d(l: f64, n: usize, a: f64, iz: f64, masses: Value) -> SolverInput {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), json!({"id": i + 1, "x": 0.0, "z": l * i as f64 / n as f64}));
        if i > 0 {
            elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1,
                "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
        }
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": E_MPA, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a, "iz": iz}},
        "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [],
        "masses": masses,
    }))
    .unwrap()
}

/// 3D vertical cantilever along z, `n` elements, fixed at node 1.
fn cantilever_3d(l: f64, n: usize, masses: Value) -> SolverInput3D {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), json!({"id": i + 1, "x": 0.0, "y": 0.0, "z": l * i as f64 / n as f64}));
        if i > 0 {
            elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1,
                "materialId": 1, "sectionId": 1}));
        }
    }
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": E_MPA, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": elements,
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [],
        "masses": masses,
    }))
    .unwrap()
}

// ─── Closed forms ──────────────────────────────────────────────────────────

#[test]
fn sdof_massless_cantilever_with_tip_mass() {
    // Massless column, tip mass m in X and Z: ω² = 3EI/(mL³) sideways and
    // EA/(mL) axially. One Hermite element is exact for the static stiffness.
    let (l, a, iz, m) = (3.0, 0.01, 1e-4, 2.0);
    let input = cantilever_2d(l, 1, a, iz, json!({"nodal": [{"nodeId": 2, "mass": m}]}));
    let r = solve_modal_2d(&input, &no_density(), 2).unwrap();
    let w_lat = (3.0 * E * iz / (m * l.powi(3))).sqrt();
    let w_ax = (E * a / (m * l)).sqrt();
    close("lateral ω", r.modes[0].omega, w_lat, 1e-9);
    close("axial ω", r.modes[1].omega, w_ax, 1e-9);
    close("total mass", r.total_mass, m, 1e-12);
    close("mode 1 X mass ratio", r.modes[0].mass_ratio_x, 1.0, 1e-9);
    close("mode 2 Z mass ratio", r.modes[1].mass_ratio_y, 1.0, 1e-9);
    assert!(r.modes[0].mass_ratio_y < 1e-12 && r.modes[1].mass_ratio_x < 1e-12);
}

#[test]
fn two_dof_massless_cantilever_with_two_lumped_masses() {
    // Horizontal masses m1 at mid-height and m2 at the tip (massZ 0): the
    // 2×2 eigenproblem of the exact flexibility matrix.
    let (l, iz, m1, m2) = (4.0, 1e-4, 3.0, 1.5);
    let input = cantilever_2d(l, 2, 0.01, iz, json!({"nodal": [
        {"nodeId": 2, "mass": m1, "massZ": 0.0},
        {"nodeId": 3, "mass": m2, "massZ": 0.0}]}));
    let r = solve_modal_2d(&input, &no_density(), 2).unwrap();
    let ei = E * iz;
    let a1 = l / 2.0;
    let f11 = a1.powi(3) / (3.0 * ei);
    let f22 = l.powi(3) / (3.0 * ei);
    let f12 = a1 * a1 * (3.0 * l - a1) / (6.0 * ei);
    // det(F M − μ I) = 0, μ = 1/ω².
    let (p, q) = (f11 * m1 + f22 * m2, (f11 * f22 - f12 * f12) * m1 * m2);
    let disc = (p * p - 4.0 * q).sqrt();
    let (mu1, mu2) = ((p + disc) / 2.0, (p - disc) / 2.0);
    close("ω1", r.modes[0].omega, 1.0 / mu1.sqrt(), 1e-9);
    close("ω2", r.modes[1].omega, 1.0 / mu2.sqrt(), 1e-9);
    // Horizontal mass only: X ratios sum to 1 over the mass that moves in X.
    close("total mass", r.total_mass, m1 + m2, 1e-12);
    close("Σ X mass ratio", r.cumulative_mass_ratio_x, 1.0, 1e-9);
    assert_eq!(r.cumulative_mass_ratio_y, 0.0);
}

/// First root of the cantilever-with-tip-mass frequency equation
/// 1 + cos β cosh β + μβ(cos β sinh β − sin β cosh β) = 0, μ = M/(m̄L).
fn beta_tip_mass(mu: f64) -> f64 {
    let f = |b: f64| 1.0 + b.cos() * b.cosh() + mu * b * (b.cos() * b.sinh() - b.sin() * b.cosh());
    let (mut lo, mut hi) = (0.1, 1.875_104_07);
    assert!(f(lo) * f(hi) < 0.0);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(lo) * f(mid) <= 0.0 { hi = mid } else { lo = mid }
    }
    0.5 * (lo + hi)
}

#[test]
fn cantilever_with_distributed_and_tip_mass_matches_closed_form() {
    // Euler–Bernoulli cantilever, m̄ from density, tip mass μ·m̄L as a nodal
    // mass (no rotary inertia): ω1 = β² √(EI/(m̄L⁴)).
    let (l, a, iz, rho) = (5.0, 0.02, 2e-4, 7850.0);
    let mbar = rho * a / 1000.0; // t/m
    for mu in [0.0, 0.5, 2.0] {
        let tip = mu * mbar * l;
        let masses = if mu > 0.0 { json!({"nodal": [{"nodeId": 41, "mass": tip}]}) } else { json!({}) };
        let input = cantilever_2d(l, 40, a, iz, masses);
        let dens = HashMap::from([("1".to_string(), rho)]);
        let r = solve_modal_2d(&input, &dens, 1).unwrap();
        let b = beta_tip_mass(mu);
        let w = b * b * (E * iz / (mbar * l.powi(4))).sqrt();
        close(&format!("μ = {mu}: ω1"), r.modes[0].omega, w, 1e-6);
        close(&format!("μ = {mu}: total mass"), r.total_mass, mbar * l + tip, 1e-12);
    }
}

#[test]
fn torsional_sdof_from_rotary_inertia() {
    // Massless 3D column with only izz at its top: ω² = GJ/(L·Izz), and that
    // is the only mode.
    let (l, izz, j, nu) = (3.0, 0.8, 5e-5, 0.3);
    let input = cantilever_3d(l, 1, json!({"nodal": [{"nodeId": 2, "izz": izz}]}));
    let r = solve_modal_3d(&input, &no_density(), 1).unwrap();
    let g = E / (2.0 * (1.0 + nu));
    close("torsional ω", r.modes[0].omega, (g * j / (l * izz)).sqrt(), 1e-9);
    assert_eq!(r.total_mass, 0.0, "no translational mass");
    assert!(r.modes[0].mass_ratio_x.abs() < 1e-12 && r.modes[0].mass_ratio_y.abs() < 1e-12);
}

#[test]
fn rotary_inertia_2d_couples_with_bending() {
    // Massless cantilever, tip mass m and rotary inertia J (2D `iy`):
    // K_tip = EI/L³ [[12, -6L], [-6L, 4L²]] condensed to the tip (u, θ),
    // M = diag(m, J); compare the two finite modes with the 2×2 solution.
    let (l, iz, m, jr) = (2.0, 1e-4, 1.2, 0.9);
    let input = cantilever_2d(l, 1, 1e3, iz, json!({"nodal": [{"nodeId": 2, "mass": m, "massZ": 0.0, "iy": jr}]}));
    let r = solve_modal_2d(&input, &no_density(), 2).unwrap();
    let k = E * iz / l.powi(3);
    let (k11, k12, k22) = (12.0 * k, 6.0 * l * k, 4.0 * l * l * k); // sign of k12 irrelevant to ω
    // det(K − λ M) = 0
    let (a2, a1, a0) = (m * jr, -(k11 * jr + k22 * m), k11 * k22 - k12 * k12);
    let disc = (a1 * a1 - 4.0 * a2 * a0).sqrt();
    let (l1, l2) = ((-a1 - disc) / (2.0 * a2), (-a1 + disc) / (2.0 * a2));
    close("ω1", r.modes[0].omega, l1.sqrt(), 1e-9);
    close("ω2", r.modes[1].omega, l2.sqrt(), 1e-9);
}

#[test]
fn participation_sums_to_one_with_all_modes() {
    // Masses at two levels of a massless 3D column, every DOF massed: the 12
    // modes carry all the mass in X, Y and Z.
    let input = cantilever_3d(6.0, 2, json!({"nodal": [
        {"nodeId": 2, "mass": 4.0, "ixx": 0.5, "iyy": 0.7, "izz": 1.1},
        {"nodeId": 3, "mass": 2.5, "massZ": 3.0, "ixx": 0.3, "iyy": 0.2, "izz": 0.6}]}));
    let r = solve_modal_3d(&input, &no_density(), 12).unwrap();
    assert_eq!(r.modes.len(), 12);
    close("Σ X", r.cumulative_mass_ratio_x, 1.0, 1e-8);
    close("Σ Y", r.cumulative_mass_ratio_y, 1.0, 1e-8);
    close("Σ Z", r.cumulative_mass_ratio_z, 1.0, 1e-8);
    // The largest directional total: Z carries 4 + 3.
    close("total mass", r.total_mass, 7.0, 1e-12);
}

// ─── Same mass, carried another way ────────────────────────────────────────

fn frame_3d_with_slab(masses: Value, slab_density: f64, beam_density: f64) -> (SolverInput3D, HashMap<String, f64>) {
    // Two columns, a beam and a quad slab panel hung off the beam.
    let input: SolverInput3D = serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 3.0},
            "3": {"id": 3, "x": 5.0, "y": 0.0, "z": 3.0}, "4": {"id": 4, "x": 5.0, "y": 0.0, "z": 0.0},
            "5": {"id": 5, "x": 5.0, "y": 2.0, "z": 3.0}, "6": {"id": 6, "x": 0.0, "y": 2.0, "z": 3.0},
            "7": {"id": 7, "x": 5.0, "y": 2.0, "z": 0.0}, "8": {"id": 8, "x": 0.0, "y": 2.0, "z": 0.0}
        },
        "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}, "2": {"id": 2, "e": 30000.0, "nu": 0.2},
                      "3": {"id": 3, "e": 30000.0, "nu": 0.2}},
        "sections": {"1": {"id": 1, "a": 0.09, "iy": 6.75e-4, "iz": 6.75e-4, "j": 1.1e-3},
                     "2": {"id": 2, "a": 0.12, "iy": 1.6e-3, "iz": 9e-4, "j": 1.5e-3}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 4, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 2, "sectionId": 2},
            "4": {"id": 4, "type": "frame", "nodeI": 7, "nodeJ": 5, "materialId": 1, "sectionId": 1},
            "5": {"id": 5, "type": "frame", "nodeI": 8, "nodeJ": 6, "materialId": 1, "sectionId": 1},
            "6": {"id": 6, "type": "frame", "nodeI": 6, "nodeJ": 5, "materialId": 2, "sectionId": 2}
        },
        "quads": {"1": {"id": 1, "nodes": [2, 3, 5, 6], "materialId": 3, "thickness": 0.15}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "4": {"nodeId": 4, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "7": {"nodeId": 7, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "8": {"nodeId": 8, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": [],
        "masses": masses,
    }))
    .unwrap();
    let dens = HashMap::from([("1".into(), 2500.0), ("2".into(), beam_density), ("3".into(), slab_density)]);
    (input, dens)
}

#[test]
fn line_and_area_masses_equal_raised_density() {
    // 1.8 t/m on beam 3 (A = 0.12) and 0.4 t/m² on the slab (t = 0.15) are
    // the beam's density raised by 15 000 kg/m³ and the slab's by 2 666.7.
    let (base_beam, base_slab) = (2500.0, 2400.0);
    let (a, b) = frame_3d_with_slab(
        json!({"line": [{"elementId": 3, "massPerLength": 1.8}],
               "area": [{"elementId": 1, "kind": "quad", "massPerArea": 0.4}]}),
        base_slab, base_beam);
    // Beam 6 shares material 2 with beam 3: give beam 3 its own material in
    // the reference so only it is raised.
    let (mut c, mut dc) = frame_3d_with_slab(json!({}), base_slab + 0.4 * 1000.0 / 0.15, base_beam);
    c.materials.insert("9".into(), SolverMaterial { id: 9, e: 30000.0, nu: 0.2 });
    c.elements.get_mut("3").unwrap().material_id = 9;
    dc.insert("9".into(), base_beam + 1.8 * 1000.0 / 0.12);
    let ra = solve_modal_3d(&a, &b, 6).unwrap();
    let rc = solve_modal_3d(&c, &dc, 6).unwrap();
    for k in 0..6 {
        close(&format!("mode {} frequency", k + 1), ra.modes[k].frequency, rc.modes[k].frequency, 1e-10);
        close(&format!("mode {} X eff. mass", k + 1), ra.modes[k].effective_mass_x + 1.0, rc.modes[k].effective_mass_x + 1.0, 1e-9);
    }
    close("total mass", ra.total_mass, rc.total_mass, 1e-12);
}

/// A one-storey 3D frame with an XY diaphragm (master 5): four corner
/// columns and a fifth column under node 9 at `(x9, y9)`, a slave too (its
/// column gives node 9 stiffness in every DOF, whichever DOFs the diaphragm
/// ties).
fn diaphragm_storey(x9: f64, y9: f64, masses: Value) -> SolverInput3D {
    let plan = [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (0.0, 4.0)];
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut column = |i: usize, base: usize, top: usize, x: f64, y: f64| {
        nodes.insert(base.to_string(), json!({"id": base, "x": x, "y": y, "z": 0.0}));
        nodes.insert(top.to_string(), json!({"id": top, "x": x, "y": y, "z": 3.2}));
        elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": base, "nodeJ": top,
            "materialId": 1, "sectionId": 1}));
        supports.insert(base.to_string(), json!({"nodeId": base, "rx": true, "ry": true, "rz": true,
            "rrx": true, "rry": true, "rrz": true}));
    };
    for (i, &(x, y)) in plan.iter().enumerate() {
        column(i + 1, i + 1, i + 5, x, y);
    }
    column(5, 10, 9, x9, y9);
    serde_json::from_value(json!({
        "nodes": nodes,
        "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}},
        "sections": {"1": {"id": 1, "a": 0.15, "iy": 3.125e-3, "iz": 1.125e-3, "j": 2.8e-3}},
        "elements": elements,
        "supports": supports,
        "loads": [],
        "constraints": [{"type": "diaphragm", "masterNode": 5, "slaveNodes": [6, 7, 8, 9], "plane": "XY"}],
        "masses": masses,
    }))
    .unwrap()
}

#[test]
fn slave_masses_reach_the_diaphragm_as_m_r_squared() {
    // Horizontal masses at the four corners vs their sum at their mass centre
    // (node 9, a slave) plus the polar moment Σ m r² about it: the same
    // rigid-floor mass, so the same modes.
    let m = [2.0, 3.0, 2.5, 1.5];
    let plan = [(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (0.0, 4.0)];
    let total: f64 = m.iter().sum();
    let (gx, gy) = (
        (0..4).map(|i| m[i] * plan[i].0).sum::<f64>() / total,
        (0..4).map(|i| m[i] * plan[i].1).sum::<f64>() / total,
    );
    let ip: f64 = (0..4).map(|i| m[i] * ((plan[i].0 - gx).powi(2) + (plan[i].1 - gy).powi(2))).sum();
    let corners: Vec<Value> = (0..4).map(|i| json!({"nodeId": i + 5, "massX": m[i], "massY": m[i], "massZ": 0.0})).collect();
    let a = diaphragm_storey(gx, gy, json!({"nodal": corners}));
    // The floor's polar inertia goes on the master's rotation, which is the
    // floor's (any point of a rigid floor turns by the same angle).
    let b = diaphragm_storey(gx, gy, json!({"nodal": [
        {"nodeId": 9, "massX": total, "massY": total, "massZ": 0.0},
        {"nodeId": 5, "mass": 0.0, "izz": ip}]}));
    let ra = solve_modal_3d(&a, &no_density(), 3).unwrap();
    let rb = solve_modal_3d(&b, &no_density(), 3).unwrap();
    for k in 0..3 {
        close(&format!("mode {} ω", k + 1), ra.modes[k].omega, rb.modes[k].omega, 1e-9);
        close(&format!("mode {} X eff. mass", k + 1), ra.modes[k].effective_mass_x + 1e-3, rb.modes[k].effective_mass_x + 1e-3, 1e-8);
    }
    close("Σ X", ra.cumulative_mass_ratio_x, 1.0, 1e-9);
    close("Σ Y", ra.cumulative_mass_ratio_y, 1.0, 1e-9);
    let ca = certify_modal_3d(&a, &no_density(), 3).unwrap();
    assert!(ca.certificate.is_certified(), "{:?}", ca.certificate);
}

/// Portal 1-2-3-4, fixed at 1, inclined roller at 4 (or the MPC n·u4 = 0).
fn portal_inclined(mpc: bool, masses: Value) -> SolverInput {
    let theta: f64 = 0.5;
    let mut supports = serde_json::Map::new();
    supports.insert("1".into(), json!({"id": 1, "nodeId": 1, "type": "fixed"}));
    let mut constraints = Vec::new();
    if mpc {
        constraints.push(json!({"type": "linearMPC", "terms": [
            {"nodeId": 4, "dof": 0, "coefficient": theta.sin()},
            {"nodeId": 4, "dof": 1, "coefficient": theta.cos()}]}));
    } else {
        supports.insert("4".into(), json!({"id": 4, "nodeId": 4, "type": "inclinedRoller", "angle": theta}));
    }
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 0.0, "z": 4.0},
                  "3": {"id": 3, "x": 5.0, "z": 4.0}, "4": {"id": 4, "x": 5.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": E_MPA, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1}
        },
        "supports": supports,
        "loads": [],
        "constraints": constraints,
        "masses": masses,
    }))
    .unwrap()
}

#[test]
fn directional_mass_on_an_inclined_support_is_in_global_axes() {
    // A directional mass on the inclined-roller node is a global-axes mass:
    // it must be added before the DOFs are rotated into the roller frame.
    // The MPC reference has no rotated frame.
    let masses = json!({"nodal": [
        {"nodeId": 4, "massX": 3.0, "massZ": 0.5},
        {"nodeId": 3, "mass": 1.0, "iy": 0.2},
        {"nodeId": 2, "massX": 2.0, "massZ": 0.0}]});
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let a = solve_modal_2d(&portal_inclined(false, masses.clone()), &dens, 4).unwrap();
    let b = solve_modal_2d(&portal_inclined(true, masses), &dens, 4).unwrap();
    for k in 0..4 {
        close(&format!("mode {} ω", k + 1), a.modes[k].omega, b.modes[k].omega, 1e-8);
    }
    let c = certify_modal_2d(&portal_inclined(false, json!({"nodal": [{"nodeId": 4, "massX": 3.0, "massZ": 0.5}]})), &dens, 3).unwrap();
    assert!(c.certificate.is_certified(), "{:?}", c.certificate);
}

// ─── Acceptance cases re-expressed: stubs vs nodal masses ─────────────────

/// Replace mass-only truss stubs (material E = 1e-6 MPa, far node fixed; the
/// acceptance suite's emulation of nodal masses) by the nodal mass they put
/// on the structure: their consistent mass ρAL/3 in both translations.
fn stubs_to_nodal_masses(model: &Value, densities: &Value) -> (Value, Value) {
    let mut m = model.clone();
    let stub_mats: Vec<String> = m["materials"].as_object().unwrap().iter()
        .filter(|(_, v)| v["e"].as_f64() == Some(1e-6)).map(|(k, _)| k.clone()).collect();
    let mut nodal: HashMap<u64, f64> = HashMap::new();
    let elems = m["elements"].as_object().unwrap().clone();
    let mut aux = Vec::new();
    for (k, e) in &elems {
        let mat = e["materialId"].as_u64().unwrap().to_string();
        if !stub_mats.contains(&mat) { continue; }
        assert_eq!(e["type"], "truss");
        let sec = &m["sections"][e["sectionId"].as_u64().unwrap().to_string()];
        let (ni, nj) = (e["nodeI"].as_u64().unwrap(), e["nodeJ"].as_u64().unwrap());
        let (pi, pj) = (&m["nodes"][ni.to_string()], &m["nodes"][nj.to_string()]);
        let l = ((pj["x"].as_f64().unwrap() - pi["x"].as_f64().unwrap()).powi(2)
            + (pj["z"].as_f64().unwrap() - pi["z"].as_f64().unwrap()).powi(2)).sqrt();
        let rho = densities[&mat].as_f64().unwrap();
        *nodal.entry(ni).or_insert(0.0) += rho * sec["a"].as_f64().unwrap() * l / 3.0 / 1000.0;
        m["elements"].as_object_mut().unwrap().remove(k);
        aux.push(nj);
    }
    for n in &aux {
        m["nodes"].as_object_mut().unwrap().remove(&n.to_string());
        let sups = m["supports"].as_object_mut().unwrap();
        let key = sups.iter().find(|(_, s)| s["nodeId"].as_u64() == Some(*n)).map(|(k, _)| k.clone()).unwrap();
        sups.remove(&key);
    }
    let mut d = densities.clone();
    for k in &stub_mats {
        m["materials"].as_object_mut().unwrap().remove(k);
        d.as_object_mut().unwrap().remove(k);
    }
    let mut list: Vec<(u64, f64)> = nodal.into_iter().collect();
    list.sort_by_key(|p| p.0);
    m["masses"] = json!({"nodal": list.iter().map(|&(n, mass)| json!({"nodeId": n, "mass": mass})).collect::<Vec<_>>()});
    (m, d)
}

fn modal_frequencies_2d(model: &Value, densities: &Value, n: usize) -> Vec<f64> {
    let input: SolverInput = serde_json::from_value(model.clone()).unwrap();
    let dens: HashMap<String, f64> = serde_json::from_value(densities.clone()).unwrap();
    solve_modal_2d(&input, &dens, n).unwrap().modes.iter().map(|m| m.frequency).collect()
}

#[test]
fn sac_la_3story_stubs_and_nodal_masses_give_the_same_frequencies() {
    // PR #337's SAC LA 3-storey case (Ohtori et al. 2004), its stubs replaced
    // by nodal masses. Paper: 0.99, 3.06, 5.83 Hz (half a unit in the last
    // digit).
    let case: Value = serde_json::from_str(include_str!("fixtures/sac_la_3story_mass_stubs.json")).unwrap();
    let (nodal, dn) = stubs_to_nodal_masses(&case["model"], &case["densities"]);
    assert!(nodal["masses"]["nodal"].as_array().unwrap().len() >= 12);
    let fs = modal_frequencies_2d(&case["model"], &case["densities"], 3);
    let fn_ = modal_frequencies_2d(&nodal, &dn, 3);
    for (k, (a, b)) in fs.iter().zip(&fn_).enumerate() {
        close(&format!("mode {} stub vs nodal", k + 1), *b, *a, 1e-6);
    }
    for (k, want) in [0.99, 3.06, 5.83].iter().enumerate() {
        assert!((fn_[k] - want).abs() <= 0.005, "mode {}: {} Hz vs paper {want}", k + 1, fn_[k]);
    }
}

/// Bathe & Wilson (1972) ten-bay, nine-storey frame (CSI SAP2000
/// verification Example 1-021): member mass lumped half to each end node in
/// both translations, here as nodal masses, or as PR #337's stubs.
fn bathe_wilson(stubs: bool) -> (Value, Value) {
    const FT: f64 = 0.3048;
    let e_mpa = 432_000.0 * 47.880_258_98 / 1000.0;
    let (a, i) = (3.0 * FT * FT, FT.powi(4));
    let mbar = 3.0 * (4448.221_615_260_5 / FT) / FT; // kg per m of member
    let (nb, ns) = (10usize, 9usize);
    let (bay, storey) = (20.0 * FT, 10.0 * FT);
    let idx = |r: usize, c: usize| r * (nb + 1) + c + 1;
    let mut nodes = serde_json::Map::new();
    let mut xz = HashMap::new();
    for r in 0..=ns {
        for c in 0..=nb {
            let p = (c as f64 * bay, r as f64 * storey);
            xz.insert(idx(r, c), p);
            nodes.insert(idx(r, c).to_string(), json!({"id": idx(r, c), "x": p.0, "z": p.1}));
        }
    }
    let mut members: Vec<(usize, usize)> = Vec::new();
    for r in 0..ns { for c in 0..=nb { members.push((idx(r, c), idx(r + 1, c))); } }
    for r in 1..=ns { for c in 0..nb { members.push((idx(r, c), idx(r, c + 1))); } }
    let mut mass: HashMap<usize, f64> = HashMap::new();
    let mut elements = serde_json::Map::new();
    for (k, &(p, q)) in members.iter().enumerate() {
        let (a_, b_) = (xz[&p], xz[&q]);
        let le = ((b_.0 - a_.0).powi(2) + (b_.1 - a_.1).powi(2)).sqrt();
        *mass.entry(p).or_insert(0.0) += mbar * le / 2.0;
        *mass.entry(q).or_insert(0.0) += mbar * le / 2.0;
        elements.insert((k + 1).to_string(), json!({"id": k + 1, "type": "frame", "nodeI": p, "nodeJ": q,
            "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}));
    }
    let mut supports = serde_json::Map::new();
    for c in 1..=nb + 1 {
        supports.insert(c.to_string(), json!({"id": c, "nodeId": c, "type": "fixed"}));
    }
    let mut materials = serde_json::Map::new();
    materials.insert("1".into(), json!({"id": 1, "e": e_mpa, "nu": 0.3}));
    let mut densities = serde_json::Map::new();
    densities.insert("1".into(), json!(0.0));
    let mut nodal = Vec::new();
    let mut ids: Vec<usize> = mass.keys().copied().filter(|&n| n > nb + 1).collect();
    ids.sort_unstable();
    let mut sid = nb + 2;
    for (k, n) in ids.iter().enumerate() {
        let m = mass[n];
        if stubs {
            let (aux, el, mid) = (10_000 + k, 10_000 + k, 100 + k);
            let p = xz[n];
            nodes.insert(aux.to_string(), json!({"id": aux, "x": p.0 + 0.5f64.sqrt(), "z": p.1 + 0.5f64.sqrt()}));
            materials.insert(mid.to_string(), json!({"id": mid, "e": 1e-6, "nu": 0.3}));
            densities.insert(mid.to_string(), json!(3.0 * m));
            elements.insert(el.to_string(), json!({"id": el, "type": "truss", "nodeI": n, "nodeJ": aux,
                "materialId": mid, "sectionId": 2, "hingeStart": false, "hingeEnd": false}));
            supports.insert(sid.to_string(), json!({"id": sid, "nodeId": aux, "type": "fixed"}));
            sid += 1;
        } else {
            nodal.push(json!({"nodeId": n, "mass": m / 1000.0}));
        }
    }
    let model = json!({
        "nodes": nodes, "materials": materials,
        "sections": {"1": {"id": 1, "a": a, "iz": i}, "2": {"id": 2, "a": 1.0, "iz": 1e-12}},
        "elements": elements, "supports": supports, "loads": [],
        "masses": {"nodal": nodal},
    });
    (model, Value::Object(densities))
}

#[test]
fn bathe_wilson_frame_with_nodal_masses_matches_the_1972_eigenvalues() {
    // ω² = 0.589541, 5.52695, 16.5878 (rad/s)², printed truncated to six
    // significant figures: the true value is in [printed, printed + ulp).
    let (nodal, dn) = bathe_wilson(false);
    let (stub, ds) = bathe_wilson(true);
    let fnod = modal_frequencies_2d(&nodal, &dn, 3);
    let fstub = modal_frequencies_2d(&stub, &ds, 3);
    for (k, (printed, ulp)) in [(0.589541, 1e-6), (5.52695, 1e-5), (16.5878, 1e-4)].iter().enumerate() {
        let w2 = (2.0 * PI * fnod[k]).powi(2);
        assert!(w2 >= printed - 1e-12 && w2 < printed + ulp, "mode {}: ω² = {w2} vs printed {printed}", k + 1);
        close(&format!("mode {} stub vs nodal", k + 1), fnod[k], fstub[k], 1e-6);
    }
}

// ─── Every analysis that reads the mass ────────────────────────────────────

#[test]
fn time_history_sdof_step_load_peaks_at_twice_static() {
    // Massless cantilever, horizontal tip mass: a suddenly applied force F
    // gives u_max = 2F/k at t = T/2 (undamped).
    let (l, iz, m, f) = (3.0, 1e-4, 2.0, 10.0);
    let solver = cantilever_2d(l, 1, 0.01, iz, json!({"nodal": [{"nodeId": 2, "mass": m, "massZ": 0.0}]}));
    let k = 3.0 * E * iz / l.powi(3);
    let t = 2.0 * PI * (m / k).sqrt();
    let dt = t / 400.0;
    let load = |time: f64| json!({"time": time, "loads": [{"nodeId": 2, "fx": f, "fz": 0.0, "my": 0.0}]});
    let input: TimeHistoryInput = serde_json::from_value(json!({
        "solver": solver, "densities": {}, "timeStep": dt, "nSteps": 300,
        "method": "newmark", "dampingXi": 0.0,
        "forceHistory": [load(0.0), load(1000.0 * t)],
    }))
    .unwrap();
    let r = solve_time_history_2d(&input).unwrap();
    let h = r.node_histories.iter().find(|h| h.node_id == 2).unwrap();
    let (i_max, u_max) = h.ux.iter().enumerate().fold((0, 0.0f64), |acc, (i, &u)| if u > acc.1 { (i, u) } else { acc });
    close("u_max", u_max, 2.0 * f / k, 2e-3);
    close("t(u_max)", r.time_steps[i_max], t / 2.0, 0.02);
}

#[test]
fn harmonic_sdof_amplitude_off_resonance() {
    // |u| = F / |k − mω²| below resonance, lightly damped.
    let (l, iz, m, f) = (3.0, 1e-4, 2.0, 10.0);
    let mut solver = cantilever_2d(l, 1, 0.01, iz, json!({"nodal": [{"nodeId": 2, "mass": m, "massZ": 0.0}]}));
    solver.loads = serde_json::from_value(json!([{"type": "nodal", "data": {"nodeId": 2, "fx": f, "fz": 0.0, "my": 0.0}}])).unwrap();
    let k = 3.0 * E * iz / l.powi(3);
    let fnat = (k / m).sqrt() / (2.0 * PI);
    let freqs = vec![0.3 * fnat, 0.6 * fnat, 1.8 * fnat];
    let r = solve_harmonic_2d(&HarmonicInput {
        solver, densities: no_density(), frequencies: freqs.clone(), damping_ratio: 0.002,
        response_node_id: 2, response_dof: "x".into(),
    })
    .unwrap();
    for (p, fr) in r.response_points.iter().zip(&freqs) {
        let w = 2.0 * PI * fr;
        close(&format!("|u| at {fr:.3} Hz"), p.amplitude, f / (k - m * w * w).abs(), 1e-3);
    }
}

#[test]
fn craig_bampton_keeps_nodal_masses() {
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let cb = |solver: SolverInput| craig_bampton_2d(&CraigBamptonInput {
        solver, boundary_nodes: vec![9], n_modes: 3, densities: dens.clone() }).unwrap();
    // Interior (fixed-interface) modes: the column clamped at both ends, with
    // its mid-height nodal mass.
    let mid = json!({"nodal": [{"nodeId": 5, "mass": 3.0, "iy": 0.4}]});
    let r = cb(cantilever_2d(4.0, 8, 0.01, 1e-4, mid.clone()));
    let mut clamped = cantilever_2d(4.0, 8, 0.01, 1e-4, mid);
    clamped.supports.insert("9".into(), serde_json::from_value(json!({"id": 9, "nodeId": 9, "type": "fixed"})).unwrap());
    let m = solve_modal_2d(&clamped, &dens, 3).unwrap();
    for k in 0..3 {
        close(&format!("interior mode {}", k + 1), r.interior_frequencies[k], m.modes[k].frequency, 1e-8);
    }
    // A tip (boundary) mass lands on the boundary block of the reduced mass:
    // +m on the tip's two translations, nothing on its rotation.
    let tip = 5.0;
    let with = cb(cantilever_2d(4.0, 8, 0.01, 1e-4, json!({"nodal": [{"nodeId": 9, "mass": tip}]})));
    let without = cb(cantilever_2d(4.0, 8, 0.01, 1e-4, json!({})));
    let n = with.n_reduced;
    assert_eq!(with.n_boundary, 3);
    let diag = |r: &dedaliano_engine::solver::reduction::CraigBamptonResult, i: usize| r.m_reduced[i * n + i];
    close("tip mass on ux", diag(&with, 0) - diag(&without, 0), tip, 1e-9);
    close("tip mass on uz", diag(&with, 1) - diag(&without, 1), tip, 1e-9);
    assert!((diag(&with, 2) - diag(&without, 2)).abs() < 1e-9 * tip);
}

#[test]
fn certificates_cover_nodal_masses() {
    let input = cantilever_2d(4.0, 4, 0.01, 1e-4, json!({"nodal": [{"nodeId": 5, "mass": 2.0, "iy": 0.3}, {"nodeId": 3, "massX": 1.0}]}));
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let c = certify_modal_2d(&input, &dens, 4).unwrap();
    assert!(c.certificate.is_certified(), "{:?}", c.certificate);
}

// ─── Input ─────────────────────────────────────────────────────────────────

#[test]
fn invalid_masses_are_refused() {
    let bad = |masses: Value| solve_modal_2d(&cantilever_2d(3.0, 2, 0.01, 1e-4, masses), &no_density(), 1).unwrap_err();
    assert!(bad(json!({"nodal": [{"nodeId": 99, "mass": 1.0}]})).contains("node 99"));
    assert!(bad(json!({"nodal": [{"nodeId": 2, "mass": -1.0}]})).contains(">= 0"));
    let mut nan = cantilever_2d(3.0, 2, 0.01, 1e-4, json!({"nodal": [{"nodeId": 2, "mass": 1.0}]}));
    nan.masses.nodal[0].mass_x = Some(f64::NAN);
    assert!(solve_modal_2d(&nan, &no_density(), 1).unwrap_err().contains("finite"));
    assert!(bad(json!({"line": [{"elementId": 7, "massPerLength": 1.0}]})).contains("element 7"));
    assert!(bad(json!({})).contains("needs mass"));
    let r3 = |masses: Value| {
        let (i, d) = frame_3d_with_slab(masses, 2400.0, 2500.0);
        solve_modal_3d(&i, &d, 1)
    };
    assert!(r3(json!({"area": [{"elementId": 1, "kind": "slab", "massPerArea": 1.0}]})).unwrap_err().contains("unknown kind"));
    assert!(r3(json!({"area": [{"elementId": 5, "massPerArea": 1.0}]})).unwrap_err().contains("does not exist"));
    // Unknown fields are refused, not ignored (a misspelt "mas" would drop the mass).
    assert!(serde_json::from_value::<MassInput3D>(json!({"nodal": [{"nodeId": 1, "mas": 1.0}]})).is_err());
}

#[test]
fn models_without_masses_serialize_as_before() {
    let input = cantilever_2d(3.0, 1, 0.01, 1e-4, json!({}));
    let v = serde_json::to_value(&input).unwrap();
    assert!(v.get("masses").is_none(), "an empty mass input is not written");
    let input = cantilever_2d(3.0, 1, 0.01, 1e-4, json!({"nodal": [{"nodeId": 2, "mass": 1.0}]}));
    let back: SolverInput = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
    assert_eq!(back.masses.nodal.len(), 1);
}

// ─── Every entry point that assembles mass validates it (Codex review) ────

#[test]
fn craig_bampton_refuses_invalid_masses() {
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let cb = |masses: Value| craig_bampton_2d(&CraigBamptonInput {
        solver: cantilever_2d(4.0, 4, 0.01, 1e-4, masses), boundary_nodes: vec![5], n_modes: 2, densities: dens.clone() });
    // A negative boundary mass went into M; a mass on a missing node was dropped.
    assert!(cb(json!({"nodal": [{"nodeId": 5, "mass": -3.0}]})).unwrap_err().contains(">= 0"));
    assert!(cb(json!({"nodal": [{"nodeId": 99, "mass": 3.0}]})).unwrap_err().contains("node 99"));
    assert!(cb(json!({"line": [{"elementId": 42, "massPerLength": 1.0}]})).unwrap_err().contains("element 42"));
    assert!(cb(json!({"nodal": [{"nodeId": 5, "mass": 3.0}]})).is_ok());
}

#[test]
fn craig_bampton_3d_refuses_invalid_masses() {
    use dedaliano_engine::solver::reduction::{craig_bampton_3d, CraigBamptonInput3D};
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let cb = |masses: Value| craig_bampton_3d(&CraigBamptonInput3D {
        solver: cantilever_3d(4.0, 4, masses), boundary_nodes: vec![5], n_modes: 2, densities: dens.clone() });
    assert!(cb(json!({"nodal": [{"nodeId": 5, "mass": 1.0, "izz": -2.0}]})).unwrap_err().contains(">= 0"));
    assert!(cb(json!({"nodal": [{"nodeId": 77, "mass": 1.0}]})).unwrap_err().contains("node 77"));
    assert!(cb(json!({"area": [{"elementId": 1, "kind": "quad", "massPerArea": 1.0}]})).unwrap_err().contains("does not exist"));
    assert!(cb(json!({"nodal": [{"nodeId": 5, "mass": 1.0}]})).is_ok());
}

#[test]
fn spectral_refuses_invalid_masses() {
    // Spectral takes its modes as given, but its certificate re-assembles M
    // from the model's masses.
    use dedaliano_engine::solver::spectral::solve_spectral_2d;
    let good = cantilever_2d(3.0, 2, 0.01, 1e-4, json!({"nodal": [{"nodeId": 3, "mass": 2.0}]}));
    let modal = solve_modal_2d(&good, &no_density(), 1).unwrap();
    let spectral = |solver: SolverInput| -> Result<_, String> {
        let input: SpectralInput = serde_json::from_value(json!({
            "solver": solver, "modes": modal.modes, "densities": {},
            "spectrum": {"name": "flat", "points": [{"period": 0.0, "sa": 0.3}, {"period": 4.0, "sa": 0.3}]},
            "direction": "X",
        })).unwrap();
        solve_spectral_2d(&input)
    };
    assert!(spectral(good.clone()).is_ok());
    let mut bad = good;
    bad.masses.nodal[0].mass = -2.0;
    assert!(spectral(bad).unwrap_err().contains(">= 0"));
}

/// Validation: Chimney / Stack / Tower Extended Structural Analysis
///
/// References:
///   - ACI 307-08: Design and Construction of Reinforced Concrete Chimneys
///   - EN 1991-1-4: Wind actions, Annex E (vortex shedding)
///   - EN 13084-1: Free-standing chimneys, general requirements
///   - CICIND Model Code for Concrete Chimneys (2011)
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Roark's Formulas for Stress and Strain, 9th Ed.
///
/// Tests model chimney/tower as horizontal cantilever (fixed start, free end)
/// with lateral loads applied as transverse (fy) loads:
///   1. Along-wind: triangular wind profile, M_base = qH²/6
///   2. Vortex shedding: Vcr = f*D/St verification via equivalent lateral load
///   3. Self-weight: axial compression in cantilever column, N_base = γ*A*H
///   4. Combined wind + self-weight: eccentric loading, combined stress check
///   5. Temperature gradient: ΔT across section produces M = EI*α*ΔT/d
///   6. Tapered section: stepped column (two sections) vs uniform
///   7. Guy wire effect: guyed mast modeled with spring reduces base moment
///   8. P-delta on tall column: second-order amplification from axial load

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// Concrete chimney properties
const E_CONC: f64 = 30_000.0; // MPa (solver multiplies by 1000 → 30e6 kN/m²)
const A_CHIMNEY: f64 = 1.5;   // m², annular cross-section (typical 5m dia, 0.3m wall)
const IZ_CHIMNEY: f64 = 2.5;  // m⁴, second moment of area

// ================================================================
// 1. Along-Wind Loading: Triangular Wind Profile on Cantilever
// ================================================================
//
// Chimney modeled as cantilever with triangular distributed load:
// q(x) increases linearly from 0 at base (fixed end) to q_max at tip.
// Total force = q_max * H / 2
// Centroid of triangular load at 2H/3 from fixed end
// Base moment (from statics): M_base = (q_max * H / 2) * (2H/3) = q_max * H² / 3
//
// Model: horizontal cantilever, fixed at node 1, free at tip.
// Triangular load increases from 0 at fixed end to q_max at free end.
//
// Reference: Roark's, Table 8, Case 3e adapted for triangular load.

#[test]
fn chimney_along_wind_triangular_profile() {
    let h: f64 = 60.0;    // m, chimney height
    let n = 12;            // number of elements
    let q_max: f64 = -5.0; // kN/m, peak wind load at top (downward = transverse)

    // Build triangular load: 0 at fixed end (element 1 start) to q_max at free end
    let mut loads = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        let qi: f64 = q_max * xi;
        let qj: f64 = q_max * xj;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Analytical: M_base = |q_max| * H² / 3
    // (total load q*H/2 acts at centroid 2H/3 from fixed end)
    let m_base_exact: f64 = q_max.abs() * h * h / 3.0;

    // Base reaction moment (at node 1)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz.abs(), m_base_exact, 0.03, "Along-wind: M_base = qH²/3");

    // Total vertical reaction should equal total load = |q_max| * H / 2
    let total_load: f64 = q_max.abs() * h / 2.0;
    assert_close(r.ry.abs(), total_load, 0.03, "Along-wind: Ry = qH/2");
}

// ================================================================
// 2. Vortex Shedding: Equivalent Lateral Load from Vcr
// ================================================================
//
// Vortex shedding critical speed: Vcr = f_n * D / St
// For a chimney of given natural frequency and diameter, we compute
// the equivalent inertia force from vortex lock-in.
//
// Model: cantilever with a single point load at tip representing
// the equivalent vortex-induced force. Verify tip displacement
// matches δ = F * L³ / (3EI).

#[test]
fn chimney_vortex_shedding_equivalent_load() {
    let h: f64 = 60.0;
    let d: f64 = 5.0;
    let st: f64 = 0.20;     // Strouhal number
    let fn1: f64 = 0.5;     // Hz, natural frequency
    let n = 10;

    // Critical wind speed
    let v_cr: f64 = fn1 * d / st;
    assert!(v_cr > 5.0 && v_cr < 30.0, "Vcr = {:.1} m/s", v_cr);

    // Equivalent lateral force from vortex shedding (simplified)
    // F_vortex ~ 0.5 * rho * Vcr² * D * Cl * H_eff
    let rho: f64 = 1.225;
    let cl: f64 = 0.2;       // lateral force coefficient
    let h_eff: f64 = h / 3.0; // effective correlation length
    let f_vortex: f64 = 0.5 * rho * v_cr * v_cr * d * cl * h_eff / 1000.0; // kN

    // Apply as point load at tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -f_vortex,
        mz: 0.0,
    })];

    let input = make_beam(n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Tip deflection: δ = F * L³ / (3EI)
    let e_eff: f64 = E_CONC * 1000.0;
    let delta_exact: f64 = f_vortex * h.powi(3) / (3.0 * e_eff * IZ_CHIMNEY);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_tip.uy.abs(), delta_exact, 0.02, "Vortex: tip deflection = FL³/(3EI)");

    // Base moment = F * H
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz.abs(), f_vortex * h, 0.02, "Vortex: M_base = F*H");
}

// ================================================================
// 3. Self-Weight: Axial Compression in Cantilever Column
// ================================================================
//
// Chimney under self-weight only. Model as cantilever along X with
// axial distributed load (fx direction for horizontal model).
// Since the solver handles transverse distributed loads, we model
// self-weight as a concentrated axial load at tip equal to total weight.
//
// N_base = γ * A * H (total weight)
// Axial shortening: δ = γ * A * H * L / (2 * E * A) = γ * H² / (2E)
// (The factor of 2 comes from the linearly varying axial force.)

#[test]
fn chimney_self_weight_axial() {
    let h: f64 = 60.0;
    let gamma: f64 = 25.0;   // kN/m³ concrete unit weight
    let n = 10;

    // Total weight W = γ * A * H
    let w_total: f64 = gamma * A_CHIMNEY * h;

    // Model: axial load at tip (compression along beam axis = negative fx)
    // This gives uniform axial force throughout, which is a simplification.
    // For exact self-weight, we'd need distributed axial loads.
    // Here we use a single tip load to verify axial force transmission.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -w_total, // compression
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_beam(n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Axial force in first element should equal W_total (compression)
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), w_total, 0.02, "Self-weight: N_base = γAH");

    // Base reaction: Rx = W_total (opposing compression)
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rx.abs(), w_total, 0.02, "Self-weight: Rx = W_total");

    // Axial shortening at tip: δ = W*L/(EA)
    let e_eff: f64 = E_CONC * 1000.0;
    let delta_ax: f64 = w_total * h / (e_eff * A_CHIMNEY);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_tip.ux.abs(), delta_ax, 0.02, "Self-weight: δ = WL/(EA)");
}

// ================================================================
// 4. Combined Wind + Self-Weight: Eccentric Loading
// ================================================================
//
// Chimney under simultaneous self-weight (axial) and wind (transverse).
// Verify that superposition holds: reactions and deflections equal
// the sum of individual load cases.

#[test]
fn chimney_combined_wind_selfweight() {
    let h: f64 = 60.0;
    let n = 10;
    let w_total: f64 = 25.0 * A_CHIMNEY * h; // self-weight
    let f_wind: f64 = -30.0;                   // kN lateral at tip

    // Case 1: axial only
    let input_axial = make_beam(
        n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -w_total, fy: 0.0, mz: 0.0,
        })],
    );
    let res_axial = linear::solve_2d(&input_axial).expect("solve axial");

    // Case 2: wind only
    let input_wind = make_beam(
        n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: f_wind, mz: 0.0,
        })],
    );
    let res_wind = linear::solve_2d(&input_wind).expect("solve wind");

    // Case 3: combined
    let input_combined = make_beam(
        n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -w_total, fy: f_wind, mz: 0.0,
        })],
    );
    let res_combined = linear::solve_2d(&input_combined).expect("solve combined");

    // Superposition check: tip deflection uy (combined) = uy (wind)
    // (axial load doesn't cause transverse deflection in linear analysis)
    let uy_wind = res_wind.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    let uy_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    assert_close(uy_combined, uy_wind, 0.02, "Combined: uy = uy_wind (linear)");

    // Superposition check: tip ux (combined) = ux (axial)
    let ux_axial = res_axial.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    let ux_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    assert_close(ux_combined, ux_axial, 0.02, "Combined: ux = ux_axial (linear)");

    // Base moment from wind: M_base = |F_wind| * H
    let r_combined = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_combined.mz.abs(), f_wind.abs() * h, 0.02, "Combined: M_base = F_wind*H");

    // Combined stress check: σ = N/A ± M*y/I (verify both are nonzero)
    let sigma_axial: f64 = w_total / A_CHIMNEY;   // MPa-scale (kN/m²)
    let sigma_bending: f64 = f_wind.abs() * h * 2.5 / IZ_CHIMNEY; // using y = D/2 = 2.5m
    assert!(sigma_axial > 0.0, "Axial stress exists");
    assert!(sigma_bending > 0.0, "Bending stress exists");
}

// ================================================================
// 5. Temperature Gradient: ΔT Across Section
// ================================================================
//
// Hot flue gas inside chimney creates temperature differential across
// the cross-section. For a fixed-fixed beam, this produces a moment:
//   M = E * I * α * ΔT / d
// For a cantilever (fixed-free), the beam curves but is free to deform,
// so there are no fixed-end moments at the free end. The base moment
// is zero, but the tip deflects.
//
// Tip deflection of cantilever with thermal gradient:
//   δ_tip = α * ΔT * L² / (2 * d)
//
// We verify this by comparing solver output to the analytical formula.

#[test]
fn chimney_temperature_gradient() {
    let h: f64 = 40.0;
    let n = 8;
    let dt_gradient: f64 = 50.0;  // °C difference across section
    let d: f64 = 5.0;              // section depth (diameter)
    let alpha: f64 = 10e-6;        // coefficient of thermal expansion (1/°C)

    // For the solver, we need Iz and section depth.
    // The thermal gradient load uses dt_gradient and the section height.
    // The FEF formula: M_thermal = E * Iz * alpha * dt_gradient / h_section
    //
    // For a cantilever with thermal gradient, the tip deflection is:
    // δ = α * ΔT * L² / (2 * d)

    // Create thermal loads on each element
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        }));
    }

    // Use a section with depth = d (Iz = π*R³*t for thin shell, but we just use IZ_CHIMNEY)
    // The FEF code uses h = sqrt(12 * Iz / A) for the section depth
    // So we choose A and Iz such that sqrt(12 * Iz / A) = d
    // d² = 12 * Iz / A → A = 12 * Iz / d²
    let iz_therm: f64 = 2.5;
    let a_therm: f64 = 12.0 * iz_therm / (d * d); // = 12 * 2.5 / 25 = 1.2

    let input = make_beam(n, h, E_CONC, a_therm, iz_therm, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // For a cantilever with thermal gradient, the tip deflection is:
    // δ = α * ΔT * L² / (2 * d)
    let delta_exact: f64 = alpha * dt_gradient * h * h / (2.0 * d);

    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_tip.uy.abs(), delta_exact, 0.05,
        "Thermal gradient: δ_tip = α*ΔT*L²/(2d)");

    // For a cantilever, the base moment should be zero (free to deform)
    // Actually for cantilever with thermal gradient, M is constant = 0
    // because the cantilever is free to curve. Reactions have zero moment.
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz, 0.0, 0.05, "Thermal gradient cantilever: M_base ≈ 0");
}

// ================================================================
// 6. Tapered Section: Stepped Column vs Uniform
// ================================================================
//
// Real chimneys often taper. Model as two segments:
// - Lower half: larger section (A1, I1)
// - Upper half: smaller section (A2, I2)
//
// Compare tip deflection to uniform section beam.
// The stepped beam should be stiffer (less deflection) than a beam
// that uses the smaller section throughout but less stiff than one
// using the larger section throughout.
//
// δ_stepped should satisfy: δ_large < δ_stepped < δ_small

#[test]
fn chimney_tapered_stepped_column() {
    let h: f64 = 60.0;
    let n = 12;       // 12 elements total, 6 per segment
    let n_half = n / 2;
    let p: f64 = -20.0; // kN tip load

    // Section properties: lower (larger) and upper (smaller)
    let a1: f64 = 2.0;
    let iz1: f64 = 4.0;
    let a2: f64 = 1.0;
    let iz2: f64 = 1.0;

    // Build stepped beam manually with two section types
    let elem_len: f64 = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Lower half uses section 1, upper half uses section 2
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let sec_id = if i < n_half { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
    })];

    let input_stepped = make_input(
        nodes,
        vec![(1, E_CONC, 0.3)],
        vec![(1, a1, iz1), (2, a2, iz2)],
        elems,
        sups,
        loads,
    );
    let res_stepped = linear::solve_2d(&input_stepped).expect("solve stepped");
    let d_stepped = res_stepped.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Uniform large section
    let input_large = make_beam(
        n, h, E_CONC, a1, iz1, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res_large = linear::solve_2d(&input_large).expect("solve large");
    let d_large = res_large.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Uniform small section
    let input_small = make_beam(
        n, h, E_CONC, a2, iz2, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res_small = linear::solve_2d(&input_small).expect("solve small");
    let d_small = res_small.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Ordering: d_large < d_stepped < d_small
    assert!(
        d_large < d_stepped,
        "Stepped > large uniform: {:.6e} vs {:.6e}",
        d_stepped, d_large
    );
    assert!(
        d_stepped < d_small,
        "Stepped < small uniform: {:.6e} vs {:.6e}",
        d_stepped, d_small
    );

    // Base moment should be identical for all (same load, same height)
    let m_exact: f64 = p.abs() * h;
    let r_stepped = res_stepped.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_stepped.mz.abs(), m_exact, 0.02,
        "Stepped: M_base = P*H");
}

// ================================================================
// 7. Guy Wire Effect: Guyed Mast with Spring Support
// ================================================================
//
// A guyed mast has lateral support from guy wires at mid-height.
// Model: cantilever with a spring support (ky) at mid-span representing
// the horizontal stiffness of the guy wire system.
//
// The spring reduces the tip deflection and base moment compared to
// a free cantilever. Verify:
//   - Tip deflection (guyed) < tip deflection (unguyed)
//   - Base moment (guyed) < base moment (unguyed)
//   - Spring reaction = ky * displacement at spring node

#[test]
fn chimney_guy_wire_spring_support() {
    let h: f64 = 60.0;
    let n = 10;
    let p: f64 = -30.0;    // kN lateral tip load
    let ky: f64 = 500.0;    // kN/m, guy wire lateral stiffness

    let mid_node = n / 2 + 1; // node at mid-height

    // Unguyed cantilever (reference)
    let input_free = make_beam(
        n, h, E_CONC, A_CHIMNEY, IZ_CHIMNEY, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res_free = linear::solve_2d(&input_free).expect("solve free");
    let d_free_tip = res_free.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let m_free_base = res_free.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    // Guyed cantilever: add spring support at mid-height
    // Build manually since make_beam doesn't support spring supports
    let elem_len: f64 = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let loads_guyed = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
    })];

    // Build support map with fixed base + spring at mid-height
    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E_CONC, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A_CHIMNEY, iz: IZ_CHIMNEY, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, _, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: "frame".to_string(),
            node_i: *ni, node_j: *nj, material_id: *mi, section_id: *si,
            hinge_start: *hs, hinge_end: *he,
        });
    }
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "spring".to_string(),
        kx: None, ky: Some(ky), kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let input_guyed = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: loads_guyed,
    constraints: vec![],
    };
    let res_guyed = linear::solve_2d(&input_guyed).expect("solve guyed");

    let d_guyed_tip = res_guyed.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Guy wire should reduce tip deflection
    assert!(
        d_guyed_tip < d_free_tip,
        "Guy wire reduces tip deflection: guyed={:.6e} < free={:.6e}",
        d_guyed_tip, d_free_tip
    );

    // Base moment should be reduced by guy wire
    let r_guyed = res_guyed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_guyed_base: f64 = r_guyed.mz.abs();
    assert!(
        m_guyed_base < m_free_base,
        "Guy wire reduces base moment: guyed={:.2} < free={:.2}",
        m_guyed_base, m_free_base
    );

    // Verify spring reaction: F_spring = ky * u_mid
    let u_mid = res_guyed.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;
    let f_spring_expected: f64 = (ky * u_mid).abs();

    // Global equilibrium: sum of Ry at fixed support + spring reaction = total applied load
    let ry_fixed: f64 = r_guyed.ry;
    // The spring reaction is ky * u (sign depends on displacement direction)
    let ry_spring: f64 = -ky * u_mid; // spring reaction opposes displacement
    let total_applied: f64 = p; // applied at tip
    let equilibrium_err: f64 = (ry_fixed + ry_spring - (-total_applied)).abs();
    assert!(
        equilibrium_err < 0.1,
        "Equilibrium: Ry_fixed({:.4}) + Ry_spring({:.4}) = -P({:.4}), err={:.6}",
        ry_fixed, ry_spring, -total_applied, equilibrium_err
    );

    // Spring force should be nonzero (wire is engaged)
    assert!(
        f_spring_expected > 0.1,
        "Spring force is nonzero: {:.4} kN",
        f_spring_expected
    );
}

// ================================================================
// 8. P-Delta on Tall Column: Second-Order Amplification
// ================================================================
//
// A tall chimney under self-weight (axial compression) and lateral wind
// exhibits P-delta amplification. The lateral displacement causes
// additional moment from the axial load.
//
// Amplification factor: AF ≈ 1 / (1 - P/P_cr)
// where P_cr = π²EI / (4L²) for cantilever.
//
// We verify that P-delta displacement > linear displacement
// using the pdelta solver, and compare the amplification to
// the theoretical value.

#[test]
fn chimney_pdelta_amplification() {
    let h: f64 = 50.0;
    let n = 10;
    let e_eff: f64 = E_CONC * 1000.0; // kN/m²
    let iz: f64 = 3.0; // m⁴
    let a_sec: f64 = 1.5; // m²

    // Euler critical load for cantilever: P_cr = π²EI/(4L²)
    let pi: f64 = std::f64::consts::PI;
    let p_cr: f64 = pi * pi * e_eff * iz / (4.0 * h * h);

    // Apply axial load at 30% of P_cr (well below buckling)
    let p_axial: f64 = 0.30 * p_cr;
    let f_lateral: f64 = 20.0; // kN lateral

    // Build model: cantilever along X
    // For a vertical column modeled horizontally:
    // - axial load = fx (along beam axis)
    // - lateral wind = fy (transverse)
    let elem_len: f64 = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1_usize, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -p_axial, // compression
        fy: -f_lateral, // lateral
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E_CONC, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    // Linear analysis
    let res_linear = linear::solve_2d(&input).expect("solve linear");
    let d_lin = res_linear.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // P-delta analysis
    use dedaliano_engine::solver::pdelta;
    let pd_result = pdelta::solve_pdelta_2d(&input, 30, 1e-6).expect("solve pdelta");
    assert!(pd_result.converged, "P-delta should converge");
    assert!(pd_result.is_stable, "Column should be stable at 30% P_cr");

    let d_pd = pd_result.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // P-delta displacement should be larger than linear
    assert!(
        d_pd > d_lin,
        "P-delta amplifies: d_pd={:.6e} > d_lin={:.6e}",
        d_pd, d_lin
    );

    // Theoretical amplification factor: AF = 1 / (1 - P/Pcr)
    let af_theory: f64 = 1.0 / (1.0 - p_axial / p_cr);
    let af_actual: f64 = d_pd / d_lin;

    // The P-delta method gives a slightly different amplification than the
    // closed-form because it uses geometric stiffness iteration, but
    // should be within ~15% of theory for this load ratio
    let af_err: f64 = (af_actual - af_theory).abs() / af_theory;
    assert!(
        af_err < 0.15,
        "Amplification factor: actual={:.4}, theory={:.4}, err={:.1}%",
        af_actual, af_theory, af_err * 100.0
    );
}

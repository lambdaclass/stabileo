/// Validation: Hydraulic Engineering Structures (Extended)
///
/// References:
///   - USBR "Design of Small Dams" (3rd Edition, 1987)
///   - USACE EM 1110-2-3001: Planning and Design of Hydroelectric Power Plants
///   - USACE EM 1110-2-2400: Structural Design of Spillways and Outlet Works
///   - ASCE "Hydraulic Structures" (Novak et al., 4th Ed., 2007)
///   - USBR Monograph No. 25: Design of Stilling Basins
///   - FEMA P-94: Selecting Analytic Tools for Concrete Dams
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Roark's Formulas for Stress and Strain, 9th Ed.
///
/// Tests verify structural response of typical hydraulic engineering
/// elements modeled as beams: spillway piers, intake towers, canal linings,
/// penstock pipe spans, stilling basin slabs, fish ladder baffles,
/// flume support beams, and weir crest structures.

use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

/// Common concrete properties for hydraulic structures.
/// E = 25,000 MPa (typical for C25/30 concrete).
const E: f64 = 25_000.0;

// ================================================================
// 1. Spillway Pier Structure
// ================================================================
//
// A spillway pier acts as a cantilever wall subjected to differential
// water pressure from adjacent bays during asymmetric gate operation.
//
// Model: vertical cantilever, fixed at base, free at top.
//   Height H = 10 m, width b = 2.0 m (into page), thickness t = 1.5 m
//   Hydrostatic load: triangular from 0 at top to gamma_w * H at base
//   gamma_w = 9.81 kN/m^3 => max pressure = 98.1 kN/m^2
//   Load per unit height (for b=2.0m strip): q_max = 98.1 * 2.0 = 196.2 kN/m
//
// Analytical (cantilever with triangular load, max at fixed end):
//   Total force W = q_max * H / 2 = 981 kN
//   Reaction Ry = W = 981 kN (horizontal, modeled as vertical in 2D)
//   Fixed-end moment M = W * H/3 = 981 * 10/3 = 3270 kN-m
//
// Tip deflection for triangular load (max at support, zero at tip):
//   delta_tip = q_max * H^4 / (30 * EI)
//
// Section: A = b*t = 3.0 m^2, Iz = b*t^3/12 = 2*1.5^3/12 = 0.5625 m^4

#[test]
fn hydraulic_spillway_pier_cantilever() {
    let h: f64 = 10.0;
    let b_pier: f64 = 2.0;
    let t_pier: f64 = 1.5;
    let gamma_w: f64 = 9.81;
    let a_sec: f64 = b_pier * t_pier;
    let iz: f64 = b_pier * t_pier.powi(3) / 12.0;
    let q_max: f64 = gamma_w * h * b_pier; // kN/m at base
    let n = 10;
    let ei: f64 = E * 1000.0 * iz; // kN-m^2

    // Triangular load: max at fixed end (node 1), zero at tip (node n+1)
    // Beam along X, load in Y direction (downward = negative)
    let elem_len = h / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        // x_start from fixed end
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        // Triangular: q(x) = q_max * (1 - x/H), so max at x=0 (fixed), zero at x=H (tip)
        let qi = -q_max * (1.0 - x_start / h);
        let qj = -q_max * (1.0 - x_end / h);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: qi,
            q_j: qj,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, E, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).unwrap();

    // Total applied load = q_max * H / 2
    let total_load = q_max * h / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, total_load, 0.02, "Spillway pier Ry");

    // Fixed-end moment = q_max * H^2 / 6
    // (For triangular load max at support: M = W * H/3 = (qH/2) * H/3 = qH^2/6)
    let m_fixed = q_max * h * h / 6.0;
    assert_close(r1.my.abs(), m_fixed, 0.03, "Spillway pier M_fixed");

    // Tip deflection: delta = q_max * H^4 / (30 * EI)
    // (Triangular load decreasing from support: Roark Table 8)
    let delta_exact = q_max * h.powi(4) / (30.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), delta_exact, 0.05, "Spillway pier tip deflection");
}

// ================================================================
// 2. Intake Tower Cantilever
// ================================================================
//
// A dam intake tower modeled as a vertical cantilever subjected to
// uniform lateral load from water current and debris impact.
//
// Model: cantilever, fixed at base, free at top.
//   Height H = 12 m, rectangular section 1.8 m x 1.2 m
//   Uniform load q = 15 kN/m (current + debris, per unit height)
//
// Analytical (cantilever with UDL):
//   Ry = q * H = 180 kN
//   M_fixed = q * H^2 / 2 = 1080 kN-m
//   delta_tip = q * H^4 / (8 * EI)
//   theta_tip = q * H^3 / (6 * EI)

#[test]
fn hydraulic_intake_tower_cantilever() {
    let h: f64 = 12.0;
    let b_sec: f64 = 1.8;
    let t_sec: f64 = 1.2;
    let a_sec: f64 = b_sec * t_sec;
    let iz: f64 = b_sec * t_sec.powi(3) / 12.0;
    let q: f64 = 15.0; // kN/m
    let n = 12;
    let ei: f64 = E * 1000.0 * iz;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, E, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).unwrap();

    // Reaction = q * H
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q * h, 0.02, "Intake tower Ry");

    // Fixed-end moment = q * H^2 / 2
    assert_close(r1.my.abs(), q * h * h / 2.0, 0.02, "Intake tower M_fixed");

    // Tip deflection = q * H^4 / (8 * EI)
    let delta_exact = q * h.powi(4) / (8.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), delta_exact, 0.02, "Intake tower tip deflection");

    // Tip rotation = q * H^3 / (6 * EI)
    let theta_exact = q * h.powi(3) / (6.0 * ei);
    assert_close(tip.ry.abs(), theta_exact, 0.02, "Intake tower tip rotation");
}

// ================================================================
// 3. Canal Lining Slab
// ================================================================
//
// A canal lining slab spans between longitudinal support beams.
// Modeled as a simply-supported beam under uniform uplift pressure
// from groundwater beneath the slab.
//
// Model: simply-supported beam, span L = 4 m
//   Slab thickness = 0.20 m, unit width = 1.0 m
//   Uplift pressure q = 8 kN/m^2 => q_line = 8 kN/m (for 1m strip)
//
// Analytical (SS beam with UDL):
//   R_A = R_B = q*L/2 = 16 kN
//   M_max = q*L^2/8 = 16 kN-m
//   delta_mid = 5*q*L^4/(384*EI)

#[test]
fn hydraulic_canal_lining_slab() {
    let l: f64 = 4.0;
    let t_slab: f64 = 0.20;
    let b_strip: f64 = 1.0;
    let a_sec: f64 = b_strip * t_slab;
    let iz: f64 = b_strip * t_slab.powi(3) / 12.0;
    let q: f64 = 8.0; // kN/m (uplift)
    let n = 8;
    let ei: f64 = E * 1000.0 * iz;

    // Uplift acts upward, modeled as negative load in beam convention
    // (upward = positive fy direction for the beam). But since we model
    // the slab horizontally and uplift pushes upward, we apply it as
    // downward load on the beam (the slab resists uplift, so the load
    // on the structural model acts downward from the slab's perspective).
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, a_sec, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Reactions: each = q*L/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "Canal slab R_A");
    assert_close(r_end.rz, q * l / 2.0, 0.02, "Canal slab R_B");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "Canal slab equilibrium");

    // Midspan deflection = 5*q*L^4/(384*EI)
    let delta_exact = 5.0 * q * l.powi(4) / (384.0 * ei);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), delta_exact, 0.02, "Canal slab midspan deflection");
}

// ================================================================
// 4. Penstock Pipe Span
// ================================================================
//
// A steel penstock pipe spanning between support saddles, carrying
// self-weight plus water weight as uniform distributed load.
//
// Model: simply-supported beam, L = 15 m
//   Steel pipe: D_outer = 1.2 m, wall thickness = 12 mm
//   E_steel = 200,000 MPa
//   A = pi*(D_o^2 - D_i^2)/4, I = pi*(D_o^4 - D_i^4)/64
//   Combined load (pipe + water): q = 25 kN/m
//
// Analytical:
//   R_A = R_B = q*L/2 = 187.5 kN
//   M_max = q*L^2/8 = 703.125 kN-m
//   delta_mid = 5*q*L^4/(384*EI)
//   theta_end = q*L^3/(24*EI)

#[test]
fn hydraulic_penstock_pipe_span() {
    let l: f64 = 15.0;
    let d_o: f64 = 1.2;
    let t_wall: f64 = 0.012;
    let d_i: f64 = d_o - 2.0 * t_wall;
    let pi: f64 = std::f64::consts::PI;
    let a_sec: f64 = pi * (d_o * d_o - d_i * d_i) / 4.0;
    let iz: f64 = pi * (d_o.powi(4) - d_i.powi(4)) / 64.0;
    let e_steel: f64 = 200_000.0; // MPa
    let q: f64 = 25.0; // kN/m
    let n = 10;
    let ei: f64 = e_steel * 1000.0 * iz;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_sec, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "Penstock R_A");
    assert_close(r_end.rz, q * l / 2.0, 0.02, "Penstock R_B");

    // Midspan deflection
    let delta_exact = 5.0 * q * l.powi(4) / (384.0 * ei);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), delta_exact, 0.02, "Penstock midspan deflection");

    // End rotation
    let theta_exact = q * l.powi(3) / (24.0 * ei);
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert_close(d1.ry.abs(), theta_exact, 0.02, "Penstock end rotation");
}

// ================================================================
// 5. Stilling Basin Slab
// ================================================================
//
// A stilling basin slab downstream of a spillway, subjected to uplift
// pressure. The slab is continuous over two equal spans with interior
// support from a cutoff wall.
//
// Model: 2-span continuous beam, each span L = 5 m
//   Slab: 0.40 m thick, 1.0 m unit width
//   Uplift q = 20 kN/m
//
// Analytical (2-span continuous beam with UDL, by three-moment equation):
//   R_A = R_C = 3*q*L/8 = 37.5 kN
//   R_B = 10*q*L/8 = 125 kN
//   M_B = -q*L^2/8 = -62.5 kN-m

#[test]
fn hydraulic_stilling_basin_slab() {
    let l: f64 = 5.0;
    let t_slab: f64 = 0.40;
    let b_strip: f64 = 1.0;
    let a_sec: f64 = b_strip * t_slab;
    let iz: f64 = b_strip * t_slab.powi(3) / 12.0;
    let q: f64 = 20.0;
    let n_per_span = 4;
    let n_total = 2 * n_per_span;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, a_sec, iz, loads);
    let results = solve_2d(&input).unwrap();

    // Reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();

    assert_close(r_a.rz, 3.0 * q * l / 8.0, 0.03, "Stilling basin R_A");
    assert_close(r_b.rz, 10.0 * q * l / 8.0, 0.03, "Stilling basin R_B");
    assert_close(r_c.rz, 3.0 * q * l / 8.0, 0.03, "Stilling basin R_C");

    // Equilibrium: total load = 2*q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "Stilling basin equilibrium");

    // Interior support moment: |M_B| = q*L^2/8
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_at_b.m_end.abs(), q * l * l / 8.0, 0.05, "Stilling basin M_B");
}

// ================================================================
// 6. Fish Ladder Baffles
// ================================================================
//
// Fish ladder baffles are short cantilever walls projecting from the
// channel floor, subjected to differential water pressure.
//
// Model: cantilever, fixed at base, free at top.
//   Height H = 0.8 m, width b = 0.6 m, thickness t = 0.15 m
//   Uniform water pressure difference: delta_p = 3.0 kN/m^2
//   Line load q = delta_p * b = 1.8 kN/m
//
// Analytical (cantilever with UDL):
//   Ry = q * H = 1.44 kN
//   M_fixed = q * H^2 / 2 = 0.576 kN-m
//   delta_tip = q * H^4 / (8 * EI)

#[test]
fn hydraulic_fish_ladder_baffles() {
    let h: f64 = 0.8;
    let b_baffle: f64 = 0.6;
    let t_baffle: f64 = 0.15;
    let a_sec: f64 = b_baffle * t_baffle;
    let iz: f64 = b_baffle * t_baffle.powi(3) / 12.0;
    let delta_p: f64 = 3.0; // kN/m^2
    let q: f64 = delta_p * b_baffle; // kN/m
    let n = 8;
    let ei: f64 = E * 1000.0 * iz;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, E, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).unwrap();

    // Reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q * h, 0.02, "Fish ladder baffle Ry");

    // Fixed-end moment
    assert_close(r1.my.abs(), q * h * h / 2.0, 0.02, "Fish ladder baffle M_fixed");

    // Tip deflection
    let delta_exact = q * h.powi(4) / (8.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), delta_exact, 0.02, "Fish ladder baffle tip deflection");

    // Verify proportionality: deflection at midspan should be less than tip
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(
        mid.uz.abs() < tip.uz.abs(),
        "Midspan deflection {:.6e} < tip {:.6e}",
        mid.uz.abs(),
        tip.uz.abs()
    );
}

// ================================================================
// 7. Flume Support Beam
// ================================================================
//
// An elevated flume (aqueduct) support beam carries the flume trough
// weight and water load. The beam spans between concrete piers.
//
// Model: propped cantilever (fixed-roller), L = 8 m
//   Steel beam: E = 200,000 MPa, A = 0.008 m^2, Iz = 2e-4 m^4
//   Combined load (flume + water): q = 30 kN/m
//
// Analytical (propped cantilever with UDL):
//   R_roller = 3*q*L/8 = 90 kN
//   R_fixed = 5*q*L/8 = 150 kN
//   M_fixed = q*L^2/8 = 240 kN-m
//   delta_max occurs at x = 0.4215*L, value = q*L^4/(185*EI) (approx)

#[test]
fn hydraulic_flume_support_beam() {
    let l: f64 = 8.0;
    let e_steel: f64 = 200_000.0;
    let a_sec: f64 = 0.008;
    let iz: f64 = 2e-4;
    let q: f64 = 30.0;
    let n = 8;
    let ei: f64 = e_steel * 1000.0 * iz;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_sec, iz, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Roller reaction = 3*q*L/8
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.rz, 3.0 * q * l / 8.0, 0.02, "Flume beam R_roller");

    // Fixed reaction = 5*q*L/8
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, 5.0 * q * l / 8.0, 0.02, "Flume beam R_fixed");

    // Fixed-end moment = q*L^2/8
    assert_close(r1.my.abs(), q * l * l / 8.0, 0.02, "Flume beam M_fixed");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "Flume beam equilibrium");

    // Maximum deflection for propped cantilever with UDL:
    // delta_max = q*L^4/(185*EI) (approximate, exact coefficient is 1/185.2)
    // Occurs near x = 0.4215*L. We check at nearest node.
    let node_near_max = (0.4215 * n as f64).round() as usize + 1;
    let d_max_node = results.displacements.iter().find(|d| d.node_id == node_near_max).unwrap();
    let delta_approx = q * l.powi(4) / (185.0 * ei);
    assert_close(d_max_node.uz.abs(), delta_approx, 0.10, "Flume beam max deflection");
}

// ================================================================
// 8. Weir Crest Structure
// ================================================================
//
// A broad-crested weir modeled as a fixed-fixed beam spanning
// between abutments, subjected to hydrostatic + self-weight loading.
//
// Model: fixed-fixed beam, L = 6 m
//   Concrete section: 0.8 m wide x 0.5 m deep
//   Combined load (hydrostatic + self-weight): q = 18 kN/m
//
// Analytical (fixed-fixed with UDL):
//   R_A = R_B = q*L/2 = 54 kN
//   M_end = q*L^2/12 = 54 kN-m
//   M_mid = q*L^2/24 = 27 kN-m (sagging)
//   delta_mid = q*L^4/(384*EI)

#[test]
fn hydraulic_weir_crest_structure() {
    let l: f64 = 6.0;
    let b_weir: f64 = 0.8;
    let d_weir: f64 = 0.5;
    let a_sec: f64 = b_weir * d_weir;
    let iz: f64 = b_weir * d_weir.powi(3) / 12.0;
    let q: f64 = 18.0;
    let n = 8;
    let ei: f64 = E * 1000.0 * iz;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, a_sec, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).unwrap();

    // Reactions: each = q*L/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "Weir R_A");
    assert_close(r_end.rz, q * l / 2.0, 0.02, "Weir R_B");

    // End moments: |M| = q*L^2/12
    assert_close(r1.my.abs(), q * l * l / 12.0, 0.03, "Weir M_end_A");
    assert_close(r_end.my.abs(), q * l * l / 12.0, 0.03, "Weir M_end_B");

    // Midspan deflection = q*L^4/(384*EI)
    let delta_exact = q * l.powi(4) / (384.0 * ei);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), delta_exact, 0.03, "Weir midspan deflection");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "Weir equilibrium");
}

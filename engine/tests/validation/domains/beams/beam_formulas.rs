/// Validation: Classical beam deflection/reaction/moment formulas.
///
/// References: Timoshenko *Strength of Materials*, Ghali/Neville *Structural Analysis*
///
/// Tests: simply-supported, cantilever, propped cantilever, fixed-fixed, overhang.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0; // E * 1000 * IZ

// ═══════════════════════════════════════════════════════════════
// 1. Simply-Supported Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ss_midspan_point_load() {
    // P=100 at midspan, L=10, 8 elements
    // δ_mid = PL³/(48EI) = 100*1000/(48*20000) = 0.10417
    // M_max = PL/4 = 250
    let l = 10.0;
    let p = 100.0;
    let n = 8;
    // Midspan node = n/2 + 1 = 5 at x=5
    let mut loads = vec![];
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
    }));
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let expected_delta = p * l.powi(3) / (48.0 * EI);
    assert_close(mid.uz.abs(), expected_delta, 0.01, "SS midspan δ");

    // Check reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p / 2.0, 0.01, "SS R_A");
    assert_close(r_end.rz, p / 2.0, 0.01, "SS R_B");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "SS ΣRy = P");
}

#[test]
fn validation_ss_point_at_third() {
    // P=100 at L/3, L=10, 6 elements (node 3 at x=10/3)
    // R_A = Pb/L = 100*20/3/10 = 66.667
    // R_B = Pa/L = 100*10/3/10 = 33.333
    let l = 10.0;
    let p = 100.0;
    let n = 6; // elem_len = 10/6, node 3 at x=2*10/6 = 10/3
    let a = l / 3.0;
    let b = 2.0 * l / 3.0;
    let load_node = 3; // x = 10/3

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p * b / l, 0.01, "SS L/3 R_A");
    assert_close(r_end.rz, p * a / l, 0.01, "SS L/3 R_B");

    // δ at load point = Pa²b²/(3EIL)
    let expected_delta = p * a * a * b * b / (3.0 * EI * l);
    let d_load = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    assert_close(d_load.uz.abs(), expected_delta, 0.01, "SS L/3 δ");
}

#[test]
fn validation_ss_udl() {
    // q=12, L=10, 8 elements
    // δ_mid = 5qL⁴/(384EI) = 5*12*10000/(384*20000) = 0.078125
    // θ_A = qL³/(24EI) = 12*1000/(24*20000) = 0.025
    let l = 10.0;
    let q = 12.0;
    let n = 8;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let expected_delta = 5.0 * q * l.powi(4) / (384.0 * EI);
    assert_close(mid.uz.abs(), expected_delta, 0.01, "SS UDL δ_mid");

    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let expected_theta = q * l.powi(3) / (24.0 * EI);
    assert_close(d1.ry.abs(), expected_theta, 0.01, "SS UDL θ_A");

    // Reactions: R = qL/2 = 60
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "SS UDL ΣRy");
}

#[test]
fn validation_ss_triangular_load() {
    // Triangular load 0→q0=20 over L=10, 8 elements
    // R_A = q0*L/6 = 33.333, R_B = q0*L/3 = 66.667
    let l = 10.0;
    let q0 = 20.0;
    let n = 8;
    let elem_len = l / n as f64;

    let mut loads = Vec::new();
    for i in 0..n {
        let x_start = i as f64 * elem_len;
        let x_end = (i + 1) as f64 * elem_len;
        let q_start = -q0 * x_start / l;
        let q_end = -q0 * x_end / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_start, q_j: q_end, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, q0 * l / 6.0, 0.02, "tri R_A");
    assert_close(r_end.rz, q0 * l / 3.0, 0.02, "tri R_B");

    // Equilibrium: total load = q0*L/2 = 100
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q0 * l / 2.0, 0.01, "tri ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 2. Cantilever Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_cantilever_tip_point_load() {
    // P=60, L=8, 8 elements
    // δ = PL³/(3EI) = 60*512/(3*20000) = 0.512
    // θ = PL²/(2EI) = 60*64/(2*20000) = 0.096
    // M_fixed = PL = 480
    let l = 8.0;
    let p = 60.0;
    let n = 8;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), p * l.powi(3) / (3.0 * EI), 0.01, "cantilever tip δ");
    assert_close(tip.ry.abs(), p * l.powi(2) / (2.0 * EI), 0.01, "cantilever tip θ");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, p, 0.01, "cantilever Ry");
    assert_close(r1.my.abs(), p * l, 0.01, "cantilever M_fixed");
}

#[test]
fn validation_cantilever_udl() {
    // q=10, L=8, 8 elements
    // δ = qL⁴/(8EI) = 10*4096/(8*20000) = 0.256
    // θ = qL³/(6EI) = 10*512/(6*20000) = 0.04267
    // M_fixed = qL²/2 = 320
    let l = 8.0;
    let q = 10.0;
    let n = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), q * l.powi(4) / (8.0 * EI), 0.01, "cantilever UDL δ");
    assert_close(tip.ry.abs(), q * l.powi(3) / (6.0 * EI), 0.01, "cantilever UDL θ");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q * l, 0.01, "cantilever UDL Ry");
    assert_close(r1.my.abs(), q * l * l / 2.0, 0.01, "cantilever UDL M_fixed");
}

#[test]
fn validation_cantilever_tip_moment() {
    // M=200 at tip, L=8, 8 elements
    // δ = ML²/(2EI) = 200*64/(2*20000) = 0.32
    // θ = ML/EI = 200*8/20000 = 0.08
    let l = 8.0;
    let m = 200.0;
    let n = 8;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), m * l * l / (2.0 * EI), 0.01, "cantilever moment δ");
    assert_close(tip.ry.abs(), m * l / EI, 0.01, "cantilever moment θ");
}

#[test]
fn validation_cantilever_midlength_point() {
    // P=60 at mid-length (a=L/2=4), L=8, 8 elements
    // δ_tip = Pa²(3L-a)/(6EI) = 60*16*(24-4)/(6*20000) = 60*16*20/120000 = 0.16
    let l = 8.0;
    let p = 60.0;
    let n = 8;
    let a = l / 2.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let expected = p * a * a * (3.0 * l - a) / (6.0 * EI);
    assert_close(tip.uz.abs(), expected, 0.01, "cantilever mid-load tip δ");
}

// ═══════════════════════════════════════════════════════════════
// 3. Propped Cantilever (fixed + rollerX)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_propped_cantilever_udl() {
    // q=10, L=10, 8 elements
    // R_roller = 3qL/8 = 37.5, M_fixed = qL²/8 = 125
    let l = 10.0;
    let q = 10.0;
    let n = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.rz, 3.0 * q * l / 8.0, 0.01, "propped UDL R_roller");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), q * l * l / 8.0, 0.02, "propped UDL M_fixed");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "propped UDL ΣRy");
}

#[test]
fn validation_propped_cantilever_midspan_point() {
    // P=100 at center, L=10, 8 elements
    // R_roller = 5P/16 = 31.25, M_fixed = 3PL/16 = 187.5
    let l = 10.0;
    let p = 100.0;
    let n = 8;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_end.rz, 5.0 * p / 16.0, 0.01, "propped point R_roller");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), 3.0 * p * l / 16.0, 0.02, "propped point M_fixed");
}

// ═══════════════════════════════════════════════════════════════
// 4. Fixed-Fixed Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_fixed_fixed_udl() {
    // q=12, L=10, 8 elements
    // M_end = qL²/12 = 100, M_mid = qL²/24 = 50
    // δ_mid = qL⁴/(384EI) = 12*10000/(384*20000) = 0.015625
    let l = 10.0;
    let q = 12.0;
    let n = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.my.abs(), q * l * l / 12.0, 0.02, "FF UDL M_end_A");
    assert_close(r_end.my.abs(), q * l * l / 12.0, 0.02, "FF UDL M_end_B");

    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), q * l.powi(4) / (384.0 * EI), 0.02, "FF UDL δ_mid");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "FF UDL ΣRy");
}

#[test]
fn validation_fixed_fixed_midspan_point() {
    // P=80, L=10, 8 elements
    // M_end = PL/8 = 100, δ_mid = PL³/(192EI) = 80*1000/(192*20000) = 0.020833
    let l = 10.0;
    let p = 80.0;
    let n = 8;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.my.abs(), p * l / 8.0, 0.02, "FF point M_end_A");
    assert_close(r_end.my.abs(), p * l / 8.0, 0.02, "FF point M_end_B");

    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uz.abs(), p * l.powi(3) / (192.0 * EI), 0.02, "FF point δ_mid");
}

// ═══════════════════════════════════════════════════════════════
// 5. Beam with Overhang
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_overhang_point_load() {
    // SS beam L=8 + overhang a=3, P=50 at tip of overhang
    // ΣM_A: R_B*8 = 50*11 → R_B = 68.75 (upward)
    // ΣFy: R_A + 68.75 = 50 → R_A = -18.75 (downward)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0), (4, 11.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -50.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, -18.75, 0.01, "overhang R_A");
    assert_close(r3.rz, 68.75, 0.01, "overhang R_B");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 50.0, 0.01, "overhang ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 6. Global Equilibrium for All Beam Types
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_beam_equilibrium_comprehensive() {
    // Verify ΣR = ΣF for multiple beam configurations
    let cases: Vec<(&str, SolverInput, f64)> = vec![
        ("SS+UDL", make_ss_beam_udl(8, 10.0, E, A, IZ, -12.0), 12.0 * 10.0),
        ("Cantilever+P", make_beam(8, 8.0, E, A, IZ, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 9, fx: 0.0, fz: -60.0, my: 0.0,
            })]), 60.0),
        ("FF+UDL", {
            let mut loads = Vec::new();
            for i in 0..8 {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i + 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
                }));
            }
            make_beam(8, 10.0, E, A, IZ, "fixed", Some("fixed"), loads)
        }, 10.0 * 10.0),
    ];

    for (label, input, total_load) in cases {
        let results = linear::solve_2d(&input).unwrap();
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert!(
            (sum_ry - total_load).abs() < 0.5,
            "{}: ΣRy={:.4}, expected={:.4}", label, sum_ry, total_load
        );
    }
}

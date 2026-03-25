/// Linear static 2D analysis tests with analytical benchmarks.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// Standard material/section: E=200,000 MPa, A=0.01 m², Iz=1e-4 m⁴
const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴
const EI: f64 = 200_000.0 * 1000.0 * 1e-4; // = 20,000 kN·m²

// ─── Simply Supported Beam ───────────────────────────────────

#[test]
fn simply_supported_beam_udl_reactions() {
    // q=10 kN/m, L=6m → RA=RB=qL/2=30 kN
    let input = make_ss_beam_udl(1, 6.0, E, A, IZ, -10.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, 30.0, 0.01, "R1y");
    assert_close(r2.rz, 30.0, 0.01, "R2y");
    assert_close(r1.rx, 0.0, 0.01, "R1x");
}

#[test]
fn simply_supported_beam_udl_deflection() {
    // δ_max = 5qL⁴/(384EI)
    // q=10, L=6 → δ = 5*10*1296/(384*20000) = 0.0084375 m
    let input = make_ss_beam_udl(2, 6.0, E, A, IZ, -10.0);
    let results = linear::solve_2d(&input).unwrap();

    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta = 5.0 * 10.0 * 6.0_f64.powi(4) / (384.0 * EI);
    assert_close(mid.uz.abs(), expected_delta, 0.02, "midspan deflection");
}

#[test]
fn simply_supported_beam_udl_end_rotation() {
    // θ_A = qL³/(24EI)
    let q = 10.0;
    let l = 6.0;
    let input = make_ss_beam_udl(1, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let expected_theta = q * l.powi(3) / (24.0 * EI);
    assert_close(d1.ry.abs(), expected_theta, 0.02, "end rotation θA");
}

// ─── Cantilever Beam ─────────────────────────────────────────

#[test]
fn cantilever_point_load_reactions() {
    // P=50 kN at tip, L=4m → Ry=50, Mz=200 kN·m
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -50.0, my: 0.0 })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, 50.0, 0.01, "Ry");
    assert_close(r1.my.abs(), 200.0, 0.01, "Mz");
}

#[test]
fn cantilever_point_load_deflection() {
    // δ = PL³/(3EI), θ = PL²/(2EI)
    let p = 50.0;
    let l = 4.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta = p * l.powi(3) / (3.0 * EI);
    let expected_theta = p * l.powi(2) / (2.0 * EI);
    assert_close(d2.uz.abs(), expected_delta, 0.01, "tip deflection");
    assert_close(d2.ry.abs(), expected_theta, 0.01, "tip rotation");
}

#[test]
fn cantilever_udl_reactions() {
    // q=10, L=5 → Ry=qL=50, Mz=qL²/2=125
    let q = 10.0;
    let l = 5.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, q * l, 0.01, "Ry");
    assert_close(r1.my.abs(), q * l * l / 2.0, 0.01, "Mz");
}

#[test]
fn cantilever_udl_tip_deflection() {
    // δ = qL⁴/(8EI)
    let q = 10.0;
    let l = 5.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected = q * l.powi(4) / (8.0 * EI);
    assert_close(d2.uz.abs(), expected, 0.01, "cantilever UDL tip deflection");
}

// ─── Fixed-Fixed Beam ────────────────────────────────────────

#[test]
fn fixed_fixed_beam_udl_reactions() {
    // q=12 kN/m, L=6m → RA=RB=36 kN, MA=MB=qL²/12=36 kN·m
    let q = 12.0;
    let l = 6.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -q, q_j: -q, a: None, b: None,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "R1y");
    assert_close(r3.rz, q * l / 2.0, 0.02, "R3y");
    // Fixed-end moments: qL²/12 = 36 kN·m
    assert_close(r1.my.abs(), q * l * l / 12.0, 0.02, "M1");
    assert_close(r3.my.abs(), q * l * l / 12.0, 0.02, "M3");
}

// ─── Simple Truss ────────────────────────────────────────────

#[test]
fn triangular_truss_equilibrium() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: RA_y = RB_y = 5 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, 5.0, 0.01, "RA_y");
    assert_close(r2.rz, 5.0, 0.01, "RB_y");
    assert_close(r1.rz + r2.rz, 10.0, 0.001, "ΣRy = P");

    // All truss elements: zero shear and moment
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-6, "truss shear should be zero");
        assert!(ef.m_start.abs() < 1e-6, "truss moment should be zero");
    }
}

// ─── Portal Frame ────────────────────────────────────────────

#[test]
fn portal_frame_lateral_load_equilibrium() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    // ΣFx: R1_x + R4_x + 20 = 0
    assert_close(sum_rx, -20.0, 0.01, "portal frame ΣFx equilibrium");

    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 0.01, "portal frame ΣFy = 0");

    // Moment equilibrium about the left support (node 1 at origin (0,0)):
    // ΣM = reaction moments + reaction forces × arms + applied load moments = 0
    // Portal: h=4, w=6. Lateral load H=20 at node 2 (0, 4).
    let node_coords: std::collections::HashMap<usize, (f64, f64)> = [
        (1, (0.0, 0.0)), (2, (0.0, 4.0)), (3, (6.0, 4.0)), (4, (6.0, 0.0)),
    ].iter().cloned().collect();
    check_moment_equilibrium_2d(&results, &input.loads, &node_coords, 1.0, "portal frame ΣM");
}

// ─── Hinged Elements ─────────────────────────────────────────

#[test]
fn simply_supported_beam_with_hinge_start() {
    // Frame with hinge at start → acts like simply-supported for moment
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, true, false)],  // hinge at start
        vec![(1, 1, "fixed"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // With hinge at start, M_start should be ~0
    let ef = &results.element_forces[0];
    assert!(ef.m_start.abs() < 0.1, "hinge start moment should be ~0, got {}", ef.m_start);
}

// ─── Point Load on Element ───────────────────────────────────

#[test]
fn simply_supported_beam_midspan_point_load() {
    // P at midspan: RA=RB=P/2, Mmax=PL/4
    let p = 100.0;
    let l = 8.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: l / 2.0, p: -p, px: None, my: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.01, "RA");
    assert_close(r2.rz, p / 2.0, 0.01, "RB");
}

// ─── Mechanism Detection ─────────────────────────────────────

#[test]
fn mechanism_detection() {
    // Pinned column with hinge at both ends → mechanism
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, true, true)],  // both ends hinged
        vec![(1, 1, "pinned")],  // Only bottom pinned
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    // This should either fail or produce very large displacements
    let result = linear::solve_2d(&input);
    // A column with hinges at both ends and pinned support = mechanism for lateral load
    // It should detect instability
    assert!(result.is_err() || {
        let r = result.unwrap();
        r.displacements.iter().any(|d| d.ux.abs() > 1000.0 || d.uz.abs() > 1000.0)
    });
}

// ─── Multi-element mesh refinement ───────────────────────────

#[test]
fn cantilever_mesh_convergence() {
    // Verify that more elements → better accuracy
    let p = 50.0_f64;
    let l = 5.0_f64;
    let exact_delta = p * l.powi(3) / (3.0 * EI);

    let mut prev_error = f64::INFINITY;
    for n_elem in [1_usize, 2, 4, 8] {
        let elem_len = l / n_elem as f64;
        let mut nodes = Vec::new();
        for i in 0..=n_elem {
            nodes.push((i + 1, i as f64 * elem_len, 0.0));
        }
        let mut elems = Vec::new();
        for i in 0..n_elem {
            elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
        }
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, IZ)],
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n_elem + 1, fx: 0.0, fz: -p, my: 0.0 })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let tip = results.displacements.iter().find(|d| d.node_id == n_elem + 1).unwrap();
        let error = (tip.uz.abs() - exact_delta).abs() / exact_delta;

        // For this load case, 1 element already gives exact answer (cubic interpolation)
        assert!(error < 0.01, "n_elem={}: error={:.4}%", n_elem, error * 100.0);
        prev_error = error;
    }
    let _ = prev_error;
}

// ─── JSON roundtrip ──────────────────────────────────────────

#[test]
fn json_roundtrip_solve() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -50.0, my: 0.0 })],
    );

    // Serialize → deserialize → solve (simulates WASM boundary)
    let json = serde_json::to_string(&input).unwrap();
    let deserialized: SolverInput = serde_json::from_str(&json).unwrap();
    let results = linear::solve_2d(&deserialized).unwrap();

    // Serialize results and verify
    let results_json = serde_json::to_string(&results).unwrap();
    let results_back: AnalysisResults = serde_json::from_str(&results_json).unwrap();

    assert_eq!(results_back.displacements.len(), results.displacements.len());
    assert_eq!(results_back.reactions.len(), results.reactions.len());
    assert_eq!(results_back.element_forces.len(), results.element_forces.len());

    let r1 = results_back.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, 50.0, 0.01, "JSON roundtrip Ry");
}

// ─── Fully Restrained (nf==0) ───────────────────────────────

#[test]
fn fully_restrained_2node_beam_udl() {
    // Two-node fixed-fixed beam: all 6 DOFs restrained → nf == 0.
    // Should return zero displacements, reactions = -FEF, element forces = -FEF.
    // q=10 kN/m, L=6m → R_each = qL/2 = 30 kN, M_each = qL²/12 = 30 kN·m
    let q = 10.0;
    let l = 6.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // All displacements must be zero
    for d in &results.displacements {
        assert_close(d.ux, 0.0, 0.01, &format!("node {} ux", d.node_id));
        assert_close(d.uz, 0.0, 0.01, &format!("node {} uz", d.node_id));
        assert_close(d.ry, 0.0, 0.01, &format!("node {} ry", d.node_id));
    }

    // Reactions: each end carries qL/2 vertical, qL²/12 moment
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, q * l / 2.0, 0.02, "R1z");
    assert_close(r2.rz, q * l / 2.0, 0.02, "R2z");
    assert_close(r1.my.abs(), q * l * l / 12.0, 0.02, "M1");
    assert_close(r2.my.abs(), q * l * l / 12.0, 0.02, "M2");
}

#[test]
fn fully_restrained_2node_beam_no_load() {
    // Two-node fixed-fixed beam with no loads → all zeros.
    let l = 4.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );
    let results = linear::solve_2d(&input).unwrap();

    for d in &results.displacements {
        assert_close(d.ux, 0.0, 0.01, &format!("node {} ux", d.node_id));
        assert_close(d.uz, 0.0, 0.01, &format!("node {} uz", d.node_id));
        assert_close(d.ry, 0.0, 0.01, &format!("node {} ry", d.node_id));
    }
    for r in &results.reactions {
        assert_close(r.rx, 0.0, 0.01, &format!("node {} rx", r.node_id));
        assert_close(r.rz, 0.0, 0.01, &format!("node {} rz", r.node_id));
        assert_close(r.my, 0.0, 0.01, &format!("node {} my", r.node_id));
    }
}

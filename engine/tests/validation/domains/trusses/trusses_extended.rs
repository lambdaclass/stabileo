/// Extended validation: Truss structures modelled as frame elements with both hinges,
/// verified against analytical method-of-joints / method-of-sections solutions.
///
/// Each element uses hinge_start=true, hinge_end=true so the 6×6 stiffness
/// reduces to axial-only (EA/L) while keeping 3 DOF per node.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-8; // tiny but non-zero to avoid singular stiffness with hinges

// Effective E in solver units: E * 1000 kN/m²
const E_EFF: f64 = E * 1000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Two-bar truss (45° V-truss) — symmetric vertical load
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_two_bar_v_truss_symmetric() {
    // Two bars meeting at apex, 45° angles.
    //   Node 1 (0,0) pinned, Node 2 (6,0) rollerX, Node 3 (3,3) apex
    //   Load: P = 100 kN downward at node 3
    //
    // By symmetry: R1y = R2y = 50 kN
    // Method of joints at node 3:
    //   Bar 1→3: L₁ = sqrt(9+9) = 3√2, angle = 45°
    //   ΣFy at node 3: -F₁ sin45 - F₂ sin45 = 100 (compression in bars)
    //   By symmetry F₁ = F₂ = -100/(2 sin45) = -50√2 ≈ -70.71 kN (compression)
    //   Bar 1→2 (bottom): ΣFx at node 1: F_bottom + F₁ cos45 = 0
    //     F_bottom = -F₁ cos45 = 50 kN (tension)

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 3.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 1, 2, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -100.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, 50.0, 0.02, "V-truss R1y");
    assert_close(r2.rz, 50.0, 0.02, "V-truss R2y");

    // Member forces
    let sin45: f64 = (std::f64::consts::PI / 4.0).sin();
    let expected_inclined: f64 = -100.0 / (2.0 * sin45); // compression ≈ -70.71

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Inclined bars in compression
    assert_close(ef1.n_start, expected_inclined, 0.02, "V-truss bar1 N");
    assert_close(ef2.n_start, expected_inclined, 0.02, "V-truss bar2 N");

    // Bottom chord in tension: 50 kN
    assert_close(ef3.n_start, 50.0, 0.02, "V-truss bottom N");

    // Truss behavior: V=0 and M=0
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.1, "V-truss V≠0: elem {}", ef.element_id);
        assert!(ef.m_start.abs() < 0.1, "V-truss M≠0: elem {}", ef.element_id);
    }
}

// ═══════════════════════════════════════════════════════════════
// 2. Three-bar truss — horizontal load at apex
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_three_bar_truss_horizontal_load() {
    // Nodes: 1(0,0) pinned, 2(4,0) rollerX, 3(2,3) free
    // Load: Fx = 60 kN at node 3
    //
    // Moments about node 2: R1y * 4 + 60 * 3 = 0  =>  R1y = -45 kN (downward)
    // ΣFy: R2y = 45 kN (upward)
    // ΣFx: R1x = -60 kN
    //
    // Method of joints at node 1:
    //   Bar 1→2 horizontal (L=4), bar 1→3 inclined (L=√(4+9)=√13)
    //   cosα = 2/√13, sinα = 3/√13
    //   ΣFy at node 1: R1y + F13*sinα = 0  => F13 = 45/(3/√13) = 15√13 ≈ 54.08 kN (tension)
    //   ΣFx at node 1: R1x + F12 + F13*cosα = 0  => F12 = 60 - 15√13*(2/√13) = 60 - 30 = 30 kN (tension)

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 1, 3, 1, 1, true, true),
            (3, "frame", 2, 3, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 60.0, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, -45.0, 0.02, "3bar R1y");
    assert_close(r2.rz, 45.0, 0.02, "3bar R2y");
    assert_close(r1.rx, -60.0, 0.02, "3bar R1x");

    // Member forces by method of joints
    let sqrt13: f64 = 13.0_f64.sqrt();
    let f13_expected: f64 = 15.0 * sqrt13; // tension ≈ 54.08
    let f12_expected: f64 = 30.0; // tension

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert_close(ef1.n_start, f12_expected, 0.02, "3bar bottom N");
    assert_close(ef2.n_start, f13_expected, 0.02, "3bar inclined 1-3 N");

    // Method of joints at node 2:
    //   Bar 2→3: cosβ = -2/√13, sinβ = 3/√13 (from node 2 to node 3)
    //   ΣFy at node 2: R2y + F23*sinβ = 0  => F23 = -45/(3/√13) = -15√13 (compression)
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef3.n_start, -f13_expected, 0.02, "3bar inclined 2-3 N");
}

// ═══════════════════════════════════════════════════════════════
// 3. Simple Pratt-style truss (3 panels, load at bottom midspan)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pratt_3_panel_bottom_load() {
    // 3 panels @ 4m, height 3m
    // Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0)
    // Top:    5(4,3), 6(8,3)
    // Members:
    //   Bottom chord: 1-2, 2-3, 3-4
    //   Top chord: 5-6
    //   Diagonals: 1-5, 6-4
    //   Verticals: 2-5, 3-6
    //   Extra diagonal to make determinate: 5-3
    // m=9, r=3, n=6 → 9+3=12=2*6 ✓
    //
    // Load: P = 120 kN downward at node 2 (bottom, x=4)
    // Supports: pinned at 1, rollerX at 4
    //
    // ΣM about 4: R1y*12 = 120*(12-4) = 960 => R1y = 80 kN
    // R4y = 120 - 80 = 40 kN
    //
    // Method of joints at node 1 (only bars 1-2 horizontal, 1-5 diagonal):
    //   Bar 1-5: direction (4,3)/5, sinα = 3/5, cosα = 4/5
    //   ΣFy: 80 + F15*(3/5) = 0 => F15 = -400/3 ≈ -133.33 (compression)
    //   ΣFx: F12 + F15*(4/5) = 0 => F12 = (400/3)*(4/5) = 1600/15 = 320/3 ≈ 106.67 (tension)

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0), (4, 12.0, 0.0),
            (5, 4.0, 3.0), (6, 8.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Bottom chord
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, true),
            // Top chord
            (4, "frame", 5, 6, 1, 1, true, true),
            // Verticals
            (5, "frame", 2, 5, 1, 1, true, true),
            (6, "frame", 3, 6, 1, 1, true, true),
            // Diagonals
            (7, "frame", 1, 5, 1, 1, true, true),
            (8, "frame", 5, 3, 1, 1, true, true),
            (9, "frame", 6, 4, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -120.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rz, 80.0, 0.02, "pratt3 R1y");
    assert_close(r4.rz, 40.0, 0.02, "pratt3 R4y");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 120.0, 0.01, "pratt3 ΣRy");

    // Bottom chord 1-2 (tension) from method of joints at node 1
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.n_start, 320.0 / 3.0, 0.03, "pratt3 bottom 1-2 N");

    // Diagonal 1-5 (compression) from method of joints at node 1
    let ef7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert_close(ef7.n_start, -400.0 / 3.0, 0.03, "pratt3 diagonal 1-5 N");

    // All members: V≈0 and M≈0
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.5, "pratt3 V≠0: elem {}, V={}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 0.5, "pratt3 M≠0: elem {}, M={}", ef.element_id, ef.m_start);
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Two collinear bars — axial stiffness check (F = k * δ)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_two_bar_axial_stiffness() {
    // Two horizontal bars in series: (0,0)→(5,0)→(10,0)
    // Node 1 pinned, node 3 rollerX, load Fx = 200 kN at node 2
    // Both bars have same EA.
    //
    // This is an axial-only problem (all uy restrained by supports at ends,
    // and node 2 uy determined by equilibrium with the two bars).
    // Actually node 2 is free, so let's use a triangulated approach.
    //
    // Simpler: two inclined bars forming a V, verify axial displacement.
    //   Node 1 (0,0) pinned, Node 2 (5,0) pinned, Node 3 (2.5, 0) loaded
    //   Wait, that's collinear — mechanism.
    //
    // Use two-bar truss: node 1(0,0) pinned, node 2(4,0) rollerX, node 3(2,2) free
    // Apply Fy = -P at node 3. Both bars carry compression.
    // Bar 1→3: L₁ = √(4+4) = 2√2, bar 2→3: L₂ = √(4+4) = 2√2 (symmetric)
    // By symmetry: δy at node 3 can be computed from virtual work.
    //
    // δy = Σ (N_i * n_i * L_i) / (EA)
    // Real forces: N₁ = N₂ = -P/(2 sin45) = -P√2/2 (compression)
    // Virtual unit load at node 3: n₁ = n₂ = -1/(2 sin45) = -√2/2
    // δy = 2 * (-P√2/2) * (-√2/2) * 2√2 / (EA) = 2 * (P/2) * 2√2 / (EA)
    //     = 2P√2 / (EA)
    // With P=100, E_EFF=200e6, A=0.01:
    // δy = 2*100*√2 / (200e6 * 0.01) = 200√2 / 2e6 = √2 * 1e-4

    let p: f64 = 100.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 1, 2, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Expected vertical displacement (downward, so negative)
    let sqrt2: f64 = 2.0_f64.sqrt();
    let expected_dy: f64 = -2.0 * p * sqrt2 / (E_EFF * A);

    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d3.uz, expected_dy, 0.03, "two-bar axial δy");

    // Axial forces: both inclined bars should be in compression
    let expected_n: f64 = -p * sqrt2 / 2.0; // ≈ -70.71
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start, expected_n, 0.03, "two-bar axial N1");
    assert_close(ef2.n_start, expected_n, 0.03, "two-bar axial N2");

    // Bottom chord in tension: P/(2 tan45) = P/2 = 50
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef3.n_start, p / 2.0, 0.03, "two-bar axial bottom N");
}

// ═══════════════════════════════════════════════════════════════
// 5. Right-angle truss — two inclined bars (3-4-5 triangle)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_right_angle_truss_345() {
    // Three nodes forming a 3-4-5 right triangle:
    //   Node 1 (0,0) pinned, Node 2 (4,0) pinned, Node 3 (0,3) free
    // Members: 1-2 (bottom, L=4), 1-3 (left vertical, L=3), 2-3 (hypotenuse, L=5)
    // Load: Fx = 50 kN at node 3
    //
    // Moment about node 2: R1y*4 + 50*3 = 0  =>  R1y = -37.5 kN
    // ΣFy: R2y = 37.5 kN
    // ΣFx: R1x + R2x = -50
    //
    // Method of joints at node 3 (free):
    //   Bar 1→3 is vertical. Bar 2→3 goes from (4,0) to (0,3): direction = (-4,3)/5
    //   At node 3: from bar 1-3 direction is (0,-1) (pointing away from 3 toward 1)
    //   from bar 2-3: direction from 3 toward 2 is (4,-3)/5
    //   ΣFx: 50 + F23*(4/5) = 0  =>  F23 = -62.5 kN (compression)
    //   ΣFy: F13*(-1) + F23*(-3/5) = 0  => F13 = -(-62.5)*(3/5) = 37.5 kN
    //   Wait, need sign convention. For n_start: positive = tension.
    //   Bar 2→3: if n_start > 0, member is in tension (being pulled apart).
    //   The member goes from node 2 to node 3. If compression, F23_n_start < 0.
    //
    // Actually let me think about it via equilibrium at node 3:
    //   Applied load at node 3: Fx = 50
    //   Member 1→3 (vertical, from 1 to 3): tension means node 3 is pulled toward node 1 (downward)
    //   Member 2→3 (hyp, from 2 to 3): tension means node 3 is pulled toward node 2
    //   Direction 3→2 = (4,-3)/5
    //   Direction 3→1 = (0,-1)
    //   If F_13 is tension (positive n_start): force on node 3 from bar 1-3 = F_13 * (0,-1)
    //   If F_23 is tension (positive n_start): force on node 3 from bar 2-3 = F_23 * (4,-3)/5
    //   Equilibrium at node 3: 50 + F_23*(4/5) = 0 and F_13*(-1) + F_23*(-3/5) = 0
    //   F_23 = -62.5 (compression), F_13 = -(-62.5)*3/5 = 37.5 (tension... wait)
    //   F_13*(-1) + (-62.5)*(-3/5) = 0 => -F_13 + 37.5 = 0 => F_13 = 37.5 (tension)
    //
    // But the n_start is measured at the start node. For bar 1→3, start is node 1.
    // The force pulling node 1 toward node 3 (upward) with 37.5 kN tension means
    // n_start = 37.5 (positive = tension).
    //
    // For bar 2→3, start is node 2. compression F = -62.5 means n_start = -62.5.

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 0.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom
            (2, "frame", 1, 3, 1, 1, true, true), // left vertical
            (3, "frame", 2, 3, 1, 1, true, true), // hypotenuse
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 50.0, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, -37.5, 0.02, "345 R1y");
    assert_close(r2.rz, 37.5, 0.02, "345 R2y");

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -50.0, 0.02, "345 ΣRx");

    // Member forces
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    assert_close(ef2.n_start, 37.5, 0.03, "345 bar 1-3 N (tension)");
    assert_close(ef3.n_start, -62.5, 0.03, "345 bar 2-3 N (compression)");

    // Truss behavior
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.5, "345 V≠0: elem {}", ef.element_id);
        assert!(ef.m_start.abs() < 0.5, "345 M≠0: elem {}", ef.element_id);
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. K-truss (4 nodes, determinate diamond)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_diamond_truss() {
    // Diamond/rhombus shape:
    //   Node 1 (0,0) pinned, Node 2 (3,2) free, Node 3 (6,0) rollerX, Node 4 (3,-2) free
    // Members: 1-2, 2-3, 3-4, 4-1, 1-3 (horizontal diagonal)
    // m=5, r=3, n=4 → 5+3=8=2*4 (determinate)
    // Load: P = 120 kN downward at node 2
    //
    // By symmetry about x=3 line (load is at x=3, supports at x=0,x=6):
    //   R1y = R3y = 60 kN
    //
    // Method of joints at node 2 (free):
    //   Bar 1→2: direction from 2→1 = (-3,-2)/√13
    //   Bar 2→3: direction from 2→3 = (3,-2)/√13
    //   ΣFx: F12*(-3/√13) + F23*(3/√13) = 0 => F12 = F23
    //   ΣFy: -120 + F12*(-2/√13) + F23*(-2/√13) = 0
    //   => -120 + 2*F12*(-2/√13) = 0 => F12 = -120*√13/4 = -30√13
    //   Both bars 1-2 and 2-3 are in compression with magnitude 30√13 ≈ 108.17

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 2.0), (3, 6.0, 0.0), (4, 3.0, -2.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, true),
            (4, "frame", 4, 1, 1, 1, true, true),
            (5, "frame", 1, 3, 1, 1, true, true), // horizontal diagonal
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -120.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, 60.0, 0.02, "diamond R1y");
    assert_close(r3.rz, 60.0, 0.02, "diamond R3y");

    // Member forces
    let sqrt13: f64 = 13.0_f64.sqrt();
    let expected_comp: f64 = -30.0 * sqrt13; // ≈ -108.17

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start, expected_comp, 0.03, "diamond bar 1-2 N");
    assert_close(ef2.n_start, expected_comp, 0.03, "diamond bar 2-3 N");

    // By symmetry bars 3-4 and 4-1 should also have equal magnitude
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef3.n_start.abs(), ef4.n_start.abs(), 0.02, "diamond bottom symmetry");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 120.0, 0.01, "diamond ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 7. Displacement compatibility — two parallel bars
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_parallel_bars_displacement() {
    // Two parallel horizontal bars connected at a rigid plate (same node).
    // Bar 1: (0,0)→(3,0), Bar 2: (0,1)→(3,1)
    // Nodes 1,3 fixed (pinned + rollerY at each); nodes 2,4 connected by rigid link.
    // Actually, model as: node 1(0,0) fixed, node 2(3,0) free, node 3(0,1) fixed, node 4(3,1) free,
    // plus a stiff bar 2→4 to link them.
    //
    // Simpler approach: Two bars of different lengths sharing a common end node.
    // Bar 1: (0,0)→(6,0), L=6
    // Bar 2: (0,3)→(6,0), L=√(36+9)=√45=3√5
    // Supports: node 1 pinned, node 3 pinned (both restrained)
    // Load: Fy = -100 kN at node 2 (6,0)
    //
    // Actually this is just a 2-bar truss. Let's use a different configuration.
    // Two bars: (0,0)→(4,3) L=5, (8,0)→(4,3) L=5
    // Node 1(0,0) pinned, node 3(8,0) pinned, node 2(4,3) loaded
    // Load: Fy = -100 kN at node 2
    //
    // By symmetry: R1y = R2y = 50 kN
    // Method of joints at node 2:
    //   Bar 1→2: direction 2→1 = (-4,-3)/5, bar 2→3: direction 2→3 = (4,-3)/5
    //   ΣFx: F12*(-4/5) + F23*(4/5) = 0 => F12 = F23
    //   ΣFy: -100 + F12*(-3/5) + F23*(-3/5) = 0 => F12 = F23 = -100*5/6 = -250/3
    //   Both in compression
    //
    // Displacement check: δy at node 2
    //   Each bar shortens by δ = NL/(EA) = (250/3)*5/(E_EFF*A)
    //   δy = δ / sin(θ) where sin(θ) = 3/5
    //   δy = (250/3)*5/(E_EFF*A) / (3/5) = (250/3)*25/(3*E_EFF*A) = 6250/(9*E_EFF*A)
    //   With E_EFF = 200e6, A = 0.01: δy = 6250/(9*2e6) = 6250/18e6 ≈ 3.472e-4 m

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 3.0), (3, 8.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 3, 2, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -100.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, 50.0, 0.02, "parallel R1y");
    assert_close(r3.rz, 50.0, 0.02, "parallel R3y");

    // Member forces (compression)
    let expected_n: f64 = -250.0 / 3.0; // ≈ -83.33
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start, expected_n, 0.03, "parallel bar1 N");
    assert_close(ef2.n_start, expected_n, 0.03, "parallel bar2 N");

    // Displacement at node 2
    let expected_dy: f64 = -6250.0 / (9.0 * E_EFF * A); // negative (downward)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(d2.uz, expected_dy, 0.03, "parallel bar δy");
}

// ═══════════════════════════════════════════════════════════════
// 8. K-truss with asymmetric load — method of sections
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_k_truss_asymmetric_load() {
    // Simple K-truss: 3 panels @ 4m, height 3m
    // Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0)
    // Top:    5(4,3), 6(8,3)
    // Members: bottom 1-2, 2-3, 3-4; top 5-6;
    //          diagonals 1-5, 6-4; verticals 2-5, 3-6
    // m=8, r=3, n=6 → 8+3=11 ≠ 12 — need one more member.
    // Add diagonal 5-3: m=9 → 9+3=12=2*6 ✓
    //
    // Load: P = 90 kN downward at node 5
    // Supports: pinned at 1, rollerX at 4
    //
    // ΣM about node 4: R1y * 12 = 90 * (12-4) = 720 => R1y = 60 kN
    // R4y = 90 - 60 = 30 kN
    //
    // Method of sections — cut through left panel (members 5-6, 2-5 or 5-3, and 2-3):
    // Left of cut, applied loads: R1y=60 at node 1, P=-90 at node 5
    // ΣM about node 3 (8,0), left side:
    //   R1y*8 + (-90)*(8-4) + F56*3 = 0  (F56 horizontal at height 3)
    //   60*8 - 90*4 + F56*3 = 0
    //   480 - 360 + 3*F56 = 0 => F56 = -40 kN (compression)

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0), (4, 12.0, 0.0),
            (5, 4.0, 3.0), (6, 8.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Bottom chord
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, true),
            // Top chord
            (4, "frame", 5, 6, 1, 1, true, true),
            // Verticals
            (5, "frame", 2, 5, 1, 1, true, true),
            (6, "frame", 3, 6, 1, 1, true, true),
            // Diagonals
            (7, "frame", 1, 5, 1, 1, true, true),
            (8, "frame", 5, 3, 1, 1, true, true),
            (9, "frame", 6, 4, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fz: -90.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rz, 60.0, 0.02, "K-truss R1y");
    assert_close(r4.rz, 30.0, 0.02, "K-truss R4y");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 90.0, 0.01, "K-truss ΣRy");

    // Top chord force: F56 = -40 kN (compression) from method of sections
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef4.n_start, -40.0, 0.03, "K-truss top chord N");

    // All members: V≈0 and M≈0 (truss behavior)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.5, "K-truss V≠0: elem {}, V={}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 0.5, "K-truss M≠0: elem {}, M={}", ef.element_id, ef.m_start);
    }

    // Diagonal 1→5: L = 5, angle to horizontal: atan(3/4)
    // Method of joints at node 1: R1y=60 (up), R1x (horizontal)
    // ΣFy at node 1: 60 + F15*sin(α) + F12*0 = 0 where sin(α) = 3/5
    // But there's also the vertical component... node 1 has bars 1-2 (horizontal) and 1-5 (inclined)
    // ΣFy at node 1: 60 + F15*(3/5) = 0 => F15 = -100 kN (compression)
    let ef7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert_close(ef7.n_start, -100.0, 0.03, "K-truss diagonal 1-5 N");

    // ΣFx at node 1: R1x + F12 + F15*(4/5) = 0
    // R1x = 0 (only vertical reactions and roller), so F12 = -F15*4/5 = 80 kN (tension)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.n_start, 80.0, 0.03, "K-truss bottom chord 1-2 N");
}

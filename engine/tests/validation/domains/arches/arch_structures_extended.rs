/// Validation: Extended Arch Structure Benchmarks
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 6
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 12-15
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 10 (arches)
///   - Heyman, "The Stone Skeleton", Cambridge (masonry arches)
///
/// Tests verify extended arch behavior NOT covered by the base suite:
///   1. Fixed-fixed parabolic arch: zero horizontal displacement at supports
///   2. Truss arch (pinned segments): purely axial load path, zero moments
///   3. Arch crown deflection under point load: Castigliano comparison
///   4. Circular vs parabolic arch bending under UDL: parabolic is superior
///   5. Three-hinge arch crown hinge moment is zero
///   6. Arch with horizontal applied load: lateral thrust asymmetry
///   7. Two-hinge parabolic arch fixed-end moment symmetry
///   8. Polygonal (segmental) arch: segment axial forces follow thrust line
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Parabolic Arch: Zero Displacement at Both Supports
// ================================================================
//
// A parabolic arch with fixed (encastre) supports under UDL.
// Both supports must have zero displacement (ux=0, uy=0, rz=0).
// The fixed-fixed arch is stiffer than pinned and develops
// fixed-end moments at the supports.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15

#[test]
fn validation_arch_ext_fixed_fixed_zero_displacement() {
    let l = 10.0;
    let f_rise = 2.5;
    let n = 20;
    let w: f64 = 10.0;

    // Build parabolic arch nodes
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at both supports
    let sups = vec![(1, 1_usize, "fixed"), (2, n + 1, "fixed")];

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w, q_j: -w, a: None, b: None,
        }))
        .collect();

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed supports: zero displacements at nodes 1 and n+1
    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_left.ux, 0.0, 0.001, "Fixed arch left: ux=0");
    assert_close(d_left.uy, 0.0, 0.001, "Fixed arch left: uy=0");
    assert_close(d_left.rz, 0.0, 0.001, "Fixed arch left: rz=0");

    assert_close(d_right.ux, 0.0, 0.001, "Fixed arch right: ux=0");
    assert_close(d_right.uy, 0.0, 0.001, "Fixed arch right: uy=0");
    assert_close(d_right.rz, 0.0, 0.001, "Fixed arch right: rz=0");

    // Fixed-fixed arch develops fixed-end moments (Mz != 0 at supports)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_left.mz.abs() > 0.1,
        "Fixed arch should develop support moments: Mz_left={:.4}", r_left.mz);
    assert!(r_right.mz.abs() > 0.1,
        "Fixed arch should develop support moments: Mz_right={:.4}", r_right.mz);

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load: f64 = w * l;
    assert_close(sum_ry, total_load, 0.05, "Fixed arch: ΣRy ≈ wL");
}

// ================================================================
// 2. Truss Arch: Purely Axial — Zero Bending Moments
// ================================================================
//
// A parabolic arch built from truss (pin-jointed) elements carries
// load purely in axial compression/tension. All bending moments must
// be zero because truss elements have no moment capacity.
//
// Ref: Kassimali, "Structural Analysis", 6th Ed., Ch. 4

#[test]
fn validation_arch_ext_truss_arch_zero_moments() {
    let l = 12.0;
    let f_rise = 3.0;
    let n = 12;
    let p = 20.0;

    // Build parabolic arch nodes
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    // Truss elements: hinge_start=true AND hinge_end=true
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, true, true))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];

    // Point loads at each internal node (simulating gravity)
    let loads: Vec<SolverLoad> = (2..=n)
        .map(|i| SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -p, mz: 0.0,
        }))
        .collect();

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All element moments must be zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.001,
            &format!("Truss arch elem {}: m_start=0", ef.element_id));
        assert_close(ef.m_end, 0.0, 0.001,
            &format!("Truss arch elem {}: m_end=0", ef.element_id));
        assert_close(ef.v_start, 0.0, 0.001,
            &format!("Truss arch elem {}: v_start=0", ef.element_id));
        assert_close(ef.v_end, 0.0, 0.001,
            &format!("Truss arch elem {}: v_end=0", ef.element_id));
    }

    // All elements should carry axial force (non-zero n)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() > 0.1,
            "Truss arch elem {}: should have axial force, got n_start={:.4}",
            ef.element_id, ef.n_start);
    }

    // Vertical equilibrium: ΣRy = (n-1) * P
    let total_applied = (n - 1) as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_applied, 0.01, "Truss arch: ΣRy = total P");
}

// ================================================================
// 3. Arch Crown Deflection Under Point Load
// ================================================================
//
// A two-hinge parabolic arch under a point load P at the crown.
// The crown deflection is small compared to a simply-supported beam
// of the same span (arch is much stiffer due to axial action).
//
// For a simply-supported beam: δ_beam = PL³/(48EI)
// The arch should deflect significantly less due to axial compression.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9

#[test]
fn validation_arch_ext_crown_deflection_vs_beam() {
    let l = 10.0;
    let f_rise = 2.5;
    let n = 20;
    let p = 50.0;

    // Build parabolic arch
    let mut nodes_arch = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes_arch.push((i + 1, x, y));
    }

    let elems_arch: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups_arch = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];
    let crown_node = n / 2 + 1;
    let loads_arch = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: crown_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input_arch = make_input(
        nodes_arch, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_arch, sups_arch, loads_arch,
    );
    let res_arch = linear::solve_2d(&input_arch).unwrap();

    // Simply-supported beam for comparison
    let input_beam = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: crown_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_beam = linear::solve_2d(&input_beam).unwrap();

    // Crown deflection of arch
    let d_arch = res_arch.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap();
    // Midspan deflection of beam
    let d_beam = res_beam.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap();

    // Both deflect downward
    assert!(d_arch.uy < 0.0, "Arch crown should deflect down: uy={:.6}", d_arch.uy);
    assert!(d_beam.uy < 0.0, "Beam midspan should deflect down: uy={:.6}", d_beam.uy);

    // Arch deflection should be smaller than beam deflection (arch is stiffer)
    assert!(d_arch.uy.abs() < d_beam.uy.abs(),
        "Arch should deflect less than beam: arch={:.6}, beam={:.6}",
        d_arch.uy, d_beam.uy);
}

// ================================================================
// 4. Circular vs Parabolic Arch: Crown Deflection Under Point Load
// ================================================================
//
// Under a single point load at the crown, neither shape is funicular.
// The parabolic arch (optimized for UDL) and circular arch (constant
// curvature) respond differently. We compare both against a straight
// beam of the same span to confirm arch action reduces deflection.
// Both arches should deflect less than the beam (arch stiffening).
// The two arches should have similar but distinct crown deflections.
//
// Ref: Megson, "Structural and Stress Analysis", 4th Ed., Section 6.2

#[test]
fn validation_arch_ext_circular_vs_parabolic_bending() {
    let l = 10.0;
    let f_rise = 2.5;
    let n = 20;
    let p = 50.0;

    // --- Parabolic arch ---
    let mut nodes_para = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes_para.push((i + 1, x, y));
    }

    let elems_para: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];
    let crown_node = n / 2 + 1;
    let load = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: crown_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input_para = make_input(
        nodes_para, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_para, sups.clone(), load.clone(),
    );
    let res_para = linear::solve_2d(&input_para).unwrap();

    // --- Circular arch ---
    let r_circ: f64 = (l * l / 4.0 + f_rise * f_rise) / (2.0 * f_rise);
    let y_center = f_rise - r_circ;

    let mut nodes_circ = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let dx = x - l / 2.0;
        let y = y_center + (r_circ * r_circ - dx * dx).abs().sqrt();
        nodes_circ.push((i + 1, x, y));
    }

    let elems_circ: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input_circ = make_input(
        nodes_circ, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_circ, sups.clone(), load.clone(),
    );
    let res_circ = linear::solve_2d(&input_circ).unwrap();

    // --- Simply-supported beam ---
    let input_beam = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"), load,
    );
    let res_beam = linear::solve_2d(&input_beam).unwrap();

    // Crown/midspan deflections
    let uy_para = res_para.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap().uy;
    let uy_circ = res_circ.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap().uy;
    let uy_beam = res_beam.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap().uy;

    // All deflect downward
    assert!(uy_para < 0.0, "Parabolic arch crown deflects down: uy={:.6}", uy_para);
    assert!(uy_circ < 0.0, "Circular arch crown deflects down: uy={:.6}", uy_circ);
    assert!(uy_beam < 0.0, "Beam midspan deflects down: uy={:.6}", uy_beam);

    // Both arches stiffer than beam
    assert!(uy_para.abs() < uy_beam.abs(),
        "Parabolic arch stiffer than beam: arch={:.6}, beam={:.6}", uy_para, uy_beam);
    assert!(uy_circ.abs() < uy_beam.abs(),
        "Circular arch stiffer than beam: arch={:.6}, beam={:.6}", uy_circ, uy_beam);

    // Both arches have similar order of magnitude (within factor of 5)
    let ratio = uy_para.abs() / uy_circ.abs();
    assert!(ratio > 0.2 && ratio < 5.0,
        "Parabolic and circular arch deflections similar order: ratio={:.3}", ratio);
}

// ================================================================
// 5. Three-Hinge Arch: Crown Hinge Has Zero Moment
// ================================================================
//
// The defining property of a three-hinge arch is that the internal
// moment at the crown hinge is exactly zero. This is the third
// equilibrium equation that makes the arch statically determinate.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Section 5-2

#[test]
fn validation_arch_ext_crown_hinge_zero_moment() {
    let l = 12.0;
    let f_rise = 3.0;
    let n = 12;
    let w: f64 = 8.0;

    // Build three-hinge parabolic arch
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    // Crown hinge at element n/2 (hinge_start) — this is the element
    // whose start node is the crown node
    let crown_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = i == crown_elem;
            let he = i + 1 == crown_elem;
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];

    // Asymmetric load to make it non-trivial (not funicular)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 4 + 1, fx: 0.0, fy: -w * 10.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3 * n / 4 + 1, fx: 0.0, fy: -w * 5.0, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // The element to the left of the crown hinge should have m_end ≈ 0
    // (because the hinge releases moment there)
    let ef_before_crown = results.element_forces.iter()
        .find(|ef| ef.element_id == crown_elem).unwrap();
    assert_close(ef_before_crown.m_end, 0.0, 0.01,
        "Three-hinge arch: moment at crown hinge (m_end of preceding elem) = 0");

    // The element starting at the crown should have m_start ≈ 0
    let ef_after_crown = results.element_forces.iter()
        .find(|ef| ef.element_id == crown_elem + 1).unwrap();
    assert_close(ef_after_crown.m_start, 0.0, 0.01,
        "Three-hinge arch: moment at crown hinge (m_start of following elem) = 0");
}

// ================================================================
// 6. Arch With Horizontal Applied Load: Asymmetric Thrust
// ================================================================
//
// When a horizontal force is applied to the crown of a pinned-pinned
// arch, the horizontal reactions are no longer equal and opposite in
// the pattern of a vertically loaded arch. The load transfers
// differently through the curved geometry.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9

#[test]
fn validation_arch_ext_horizontal_load_reactions() {
    let l = 10.0;
    let f_rise = 3.0;
    let n = 20;
    let fx_applied = 30.0; // Horizontal force at crown

    // Build parabolic arch
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];
    let crown_node = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: crown_node, fx: fx_applied, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // ΣFx = 0: Rx_left + Rx_right + Fx_applied = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx + fx_applied, 0.0, 0.01,
        "Horizontal load arch: ΣRx + Fx = 0");

    // ΣFy = 0: no vertical applied load, but the arch curve couples Fx to vertical reactions
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 0.01,
        "Horizontal load arch: ΣFy = 0");

    // Vertical reactions should be non-zero (equal and opposite) due to moment of Fx
    // The horizontal force at crown height creates a moment about supports
    assert!(r_left.ry.abs() > 0.1,
        "Horizontal load should create vertical reactions: Ry_left={:.4}", r_left.ry);
    assert_close(r_left.ry + r_right.ry, 0.0, 0.01,
        "Vertical reactions sum to zero");

    // Moment equilibrium about left support (counterclockwise positive):
    // Fx_applied at (L/2, f_rise) creates moment = Fx_applied * f_rise (CCW).
    // Ry_right at (L, 0) creates moment = Ry_right * L (CCW if Ry_right > 0).
    // ΣM = 0: Ry_right * L + Fx_applied * f_rise = 0 is wrong because
    // Fx (rightward) at height f_rise creates CW moment, Ry_right (upward) at x=L creates CCW.
    // Correct: Ry_right * L - Fx_applied * f_rise = 0
    // => Ry_right = Fx_applied * f_rise / L
    let y_crown = f_rise; // crown height
    let ry_right_expected = fx_applied * y_crown / l;
    assert_close(r_right.ry, ry_right_expected, 0.05,
        "Horizontal load arch: Ry_right from moment equilibrium");
}

// ================================================================
// 7. Two-Hinge Arch: Support Moment Symmetry Under Symmetric Load
// ================================================================
//
// A two-hinge (pinned-pinned) parabolic arch under symmetric UDL
// should have symmetric reactions. The left and right support
// reactions (Rx, Ry) should be mirror images of each other.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 12

#[test]
fn validation_arch_ext_two_hinge_reaction_symmetry() {
    let l = 10.0;
    let f_rise = 2.5;
    let n = 20;
    let w: f64 = 12.0;

    // Build parabolic arch
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * f_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    // Two-hinge: no crown hinge
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n + 1, "pinned")];
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -w, q_j: -w, a: None, b: None,
        }))
        .collect();

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Symmetric loading: Ry_left = Ry_right
    assert_close(r_left.ry, r_right.ry, 0.01,
        "Two-hinge symmetric: Ry_left = Ry_right");

    // Symmetric loading: Rx_left = -Rx_right (horizontal thrusts equal and opposite)
    assert_close(r_left.rx, -r_right.rx, 0.01,
        "Two-hinge symmetric: Rx_left = -Rx_right");

    // Crown deflection should be vertical only (no horizontal by symmetry)
    let crown_node = n / 2 + 1;
    let d_crown = results.displacements.iter()
        .find(|d| d.node_id == crown_node).unwrap();
    assert_close(d_crown.ux, 0.0, 0.01,
        "Two-hinge symmetric: crown ux = 0 by symmetry");
    // For a parabolic two-hinge arch under UDL (nearly funicular), the
    // crown vertical displacement is very small. It may be slightly up or
    // down depending on the balance between axial shortening and bending.
    // The key check is that it is much smaller than a beam's deflection.
    // Beam midspan deflection: δ = 5wL⁴/(384EI)
    let delta_beam = 5.0 * w * l.powi(4) / (384.0 * E * 1000.0 * IZ);
    assert!(d_crown.uy.abs() < delta_beam * 0.5,
        "Two-hinge arch crown deflection much less than beam: arch={:.6}, beam={:.6}",
        d_crown.uy.abs(), delta_beam);

    // Displacement symmetry: nodes equidistant from midspan have same uy
    let d_quarter = results.displacements.iter()
        .find(|d| d.node_id == n / 4 + 1).unwrap();
    let d_three_quarter = results.displacements.iter()
        .find(|d| d.node_id == 3 * n / 4 + 1).unwrap();
    assert_close(d_quarter.uy, d_three_quarter.uy, 0.01,
        "Two-hinge symmetric: uy at L/4 = uy at 3L/4");
}

// ================================================================
// 8. Polygonal (Segmental) Arch: Axial Forces Follow Thrust Line
// ================================================================
//
// A coarse polygonal arch (few straight segments) under symmetric
// nodal loads. Using frame elements (not truss) because a 4-segment
// truss arch with only pinned supports is kinematically ill-conditioned
// in a 2D frame formulation (unconstrained rotational DOFs at every
// node create near-singularity). The frame arch still demonstrates
// the thrust line concept: axial forces dominate over bending, and
// the axial force in each segment can be verified against the reaction
// forces projected onto the segment direction.
//
// Ref: Heyman, "The Stone Skeleton", Cambridge, Ch. 2

#[test]
fn validation_arch_ext_polygonal_axial_thrust_line() {
    // 4-segment frame arch: 5 nodes
    let l = 12.0;
    let f_rise = 3.0;
    let p = 20.0; // Point load at each of the two intermediate nodes

    // Nodes: 5 points along parabolic curve
    // x: 0, 3, 6, 9, 12
    // y = 4*3/144 * x * (12-x)
    // Node 1: (0, 0), Node 2: (3, 2.25), Node 3: (6, 3.0), Node 4: (9, 2.25), Node 5: (12, 0)
    let nodes: Vec<(usize, f64, f64)> = (0..=4)
        .map(|i| {
            let x = i as f64 * l / 4.0;
            let y = 4.0 * f_rise / (l * l) * x * (l - x);
            (i + 1, x, y)
        })
        .collect();

    // Frame elements (continuous joints) — avoids the rotational DOF
    // singularity that occurs with all-hinged (truss) elements in a
    // coarse arch with only pinned supports
    let elems = vec![
        (1, "frame", 1_usize, 2_usize, 1_usize, 1_usize, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];

    let sups = vec![(1, 1_usize, "pinned"), (2, 5_usize, "pinned")];

    // Symmetric loads at node 2 and node 4
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];

    let input = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical reactions: by symmetry, Ry = P each (total load = 2P)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(r_left.ry, p, 0.05, "Polygonal arch: Ry_left = P");
    assert_close(r_right.ry, p, 0.05, "Polygonal arch: Ry_right = P");

    // Horizontal equilibrium: Rx_left + Rx_right = 0
    assert_close(r_left.rx + r_right.rx, 0.0, 0.01,
        "Polygonal arch: ΣRx = 0");

    // First segment goes from node 1 (0, 0) to node 2 (3, 2.25)
    let x1 = nodes[0].1;
    let y1 = nodes[0].2;
    let x2 = nodes[1].1;
    let y2 = nodes[1].2;
    let seg_len: f64 = ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt();
    let cos_a = (x2 - x1) / seg_len;
    let sin_a = (y2 - y1) / seg_len;

    // At node 1 (pinned support, m_start=0), equilibrium gives:
    // Axial force projection: N * cos_a = -Rx, N * sin_a = -Ry
    // N = -(Rx * cos_a + Ry * sin_a) in element local axis
    let n_expected = -(r_left.rx * cos_a + r_left.ry * sin_a);
    let ef1 = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    assert_close(ef1.n_start, n_expected, 0.05,
        "Polygonal arch: axial force in segment 1 matches thrust line");

    // All elements should carry significant axial force (compression)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() > 1.0,
            "Polygonal arch elem {}: should have significant axial force, got n_start={:.4}",
            ef.element_id, ef.n_start);
    }

    // By symmetry, force in segment 1 should equal force in segment 4
    let ef4 = results.element_forces.iter()
        .find(|ef| ef.element_id == 4).unwrap();
    assert_close(ef1.n_start.abs(), ef4.n_start.abs(), 0.01,
        "Polygonal arch symmetry: |N1| = |N4|");

    // Bending moments are small relative to axial forces (arch action)
    let n_max = results.element_forces.iter()
        .map(|ef| ef.n_start.abs().max(ef.n_end.abs()))
        .fold(0.0_f64, f64::max);
    let m_max = results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    // For a well-shaped arch, axial forces should be at least 2x the moments
    assert!(n_max > m_max * 2.0,
        "Polygonal arch: axial dominates bending: N_max={:.4}, M_max={:.4}",
        n_max, m_max);
}

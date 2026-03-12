/// Validation: Stiffness Modification Effects (Hinges, Cross-Sections, Member Releases)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (internal hinges, member releases)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5 (internal loadings with releases)
///   - Ghali & Neville, "Structural Analysis", 5th Ed., Ch. 11 (non-prismatic members)
///   - Pilkey, "Formulas for Stress, Strain, and Structural Matrices", 2nd Ed., §16
///
/// Tests verify:
///   1. Internal hinge creates zero moment at the hinge location
///   2. Hinge at midspan of SS beam: remains SS (two independent half-beams)
///   3. Hinge converts fixed-fixed to propped cantilever
///   4. Doubling Iz halves deflection for SS beam with UDL
///   5. Mixed cross sections: stiffer half deflects less
///   6. Axial release: truss-like member (double-hinged, moment-free)
///   7. Adding hinge increases deflection vs fixed-fixed beam
///   8. Multiple hinges in multi-bay frame: lateral load sharing
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Internal Hinge Creates Zero Moment
// ================================================================
//
// 2-element beam (fixed-roller), hinge at shared node (hinge_end=true
// on elem 1). The bending moment at the hinge must vanish.
// Analytical: fixed-roller beam with hinge at midspan under UDL
// becomes two independent SS beams for moment purposes.

#[test]
fn validation_stiffmod_internal_hinge_zero_moment() {
    let l = 8.0;
    let _n = 2; // 2 elements, hinge at the shared node (node 2)

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l / 2.0, 0.0),
        (3, l, 0.0),
    ];
    // hinge_end=true on elem 1 releases moment at node 2
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 3, "rollerX")];

    // UDL on both elements
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // m_end of element 1 should be ~0 (hinge releases moment)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef1.m_end.abs() < 0.5,
        "Hinge moment at m_end of elem 1 should be ~0: got {:.6}", ef1.m_end);

    // Global equilibrium: total load = 10 * 8 = 80 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 80.0, 0.02, "Hinge beam equilibrium: sum Ry = qL");
}

// ================================================================
// 2. Hinge at Midspan of SS Beam: Two Independent Half-Beams
// ================================================================
//
// Simply-supported beam, 3 nodes, hinge at node 2.
// Under a point load at the hinge, both halves act as independent
// SS beams. The deflection at midspan equals that of a simple beam
// of length L/2 under load P/2 at its end, summed for both halves.
// Actually for a SS beam with a hinge at midspan under a point load
// at the hinge: it's a mechanism unless there's additional support.
// Instead: apply UDL. Each half-beam carries its own UDL as a SS beam.
// Midspan deflection of each half: 5q(L/2)^4/(384EI).
// With the hinge, the combined deflection at the hinge node should
// match the SS half-beam deflection pattern.

#[test]
fn validation_stiffmod_hinge_midspan_ss_beam() {
    let l = 8.0;
    let n = 8; // 8 elements, hinge at midspan (node 5)
    let q = -10.0;
    let e_eff = E * 1000.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    let mid_elem = n / 2; // element 4
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let he = i + 1 == mid_elem;        // hinge_end on elem 4
            let hs = i + 1 == mid_elem + 1;    // hinge_start on elem 5
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    // Add internal support at hinge node to prevent mechanism
    let mid_node = mid_elem + 1; // node 5
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, mid_node, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads.clone());
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge should be zero
    let ef_before = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.5,
        "Hinge moment at midspan should be ~0: m_end={:.6}", ef_before.m_end);

    // Each half acts as an independent SS beam of length L/2.
    // The reaction at the hinge support should carry load from both halves.
    // For SS beam with UDL: R = qL_half/2 from each side = 2 * q*L/2/2 = qL/2
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let expected_r_mid = q.abs() * l / 2.0; // total from both halves
    assert_close(r_mid.ry, expected_r_mid, 0.03,
        "Hinge midspan support reaction = qL/2");

    // Quarter-point deflection of each half-beam should match
    // 5q(L/2)^4 / (384*E*I) for SS beam of length L/2
    let half_l = l / 2.0;
    let delta_half_ss = 5.0 * q.abs() * half_l.powi(4) / (384.0 * e_eff * IZ);

    // Check quarter-span node (node 3, at x = L/4)
    let quarter_node = n / 4 + 1;
    let d_quarter = results.displacements.iter()
        .find(|d| d.node_id == quarter_node).unwrap();
    let err = (d_quarter.uy.abs() - delta_half_ss).abs() / delta_half_ss;
    assert!(err < 0.05,
        "Quarter-span deflection: {:.6e} vs half-SS formula {:.6e}, err={:.1}%",
        d_quarter.uy.abs(), delta_half_ss, err * 100.0);
}

// ================================================================
// 3. Hinge Converts Fixed-Fixed to Propped Cantilever
// ================================================================
//
// Fixed-fixed beam with hinge_start=true on first element.
// This releases the moment at the left fixed support, making it
// behave as a pinned support. The result is a propped cantilever
// (pinned at left, fixed at right).
// For UDL on propped cantilever: R_pinned = 3qL/8, R_fixed = 5qL/8.

#[test]
fn validation_stiffmod_hinge_converts_fixed_to_propped() {
    let l = 6.0;
    let n = 8;
    let q = -12.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // hinge_start=true on first element releases moment at left support
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = i == 0; // hinge at start of first element
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, false)
        })
        .collect();

    let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left support moment should be ~0 (hinge released it)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_left.mz.abs() < 0.5,
        "Hinge at left: moment should be ~0: Mz={:.6}", r_left.mz);

    // Propped cantilever UDL reactions:
    // R_pinned (left) = 3qL/8, R_fixed (right) = 5qL/8
    let total_load = q.abs() * l;
    let r_pinned_expected = 3.0 * total_load / 8.0;
    let r_fixed_expected = 5.0 * total_load / 8.0;

    assert_close(r_left.ry, r_pinned_expected, 0.03,
        "Propped cantilever: R_pinned = 3qL/8");

    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.ry, r_fixed_expected, 0.03,
        "Propped cantilever: R_fixed = 5qL/8");

    // Verify midspan deflection matches propped cantilever formula
    // delta_max ≈ qL^4 / (185.2 * EI)
    let e_eff = E * 1000.0;
    let delta_propped = q.abs() * l.powi(4) / (185.2 * e_eff * IZ);
    let max_defl = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let err = (max_defl - delta_propped).abs() / delta_propped;
    assert!(err < 0.05,
        "Propped cantilever deflection: {:.6e} vs formula {:.6e}, err={:.1}%",
        max_defl, delta_propped, err * 100.0);
}

// ================================================================
// 4. Doubling Iz Halves Deflection
// ================================================================
//
// SS beam with UDL. Midspan deflection = 5qL^4 / (384EI).
// Deflection is inversely proportional to I.
// With 2*IZ, deflection should be exactly half.

#[test]
fn validation_stiffmod_doubling_iz_halves_deflection() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;

    let build_ss_udl = |iz: f64| -> f64 {
        let n_nodes = n + 1;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1_usize, "pinned"), (2, n_nodes, "rollerX")];
        let mut loads = Vec::new();
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, iz)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        let mid = n / 2 + 1;
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs()
    };

    let defl_iz = build_ss_udl(IZ);
    let defl_2iz = build_ss_udl(2.0 * IZ);

    // Ratio should be 2 (doubling I halves deflection)
    let ratio = defl_iz / defl_2iz;
    assert_close(ratio, 2.0, 0.02,
        "Doubling Iz halves deflection: ratio");

    // Also verify absolute value against formula
    let e_eff = E * 1000.0;
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let err = (defl_iz - delta_exact).abs() / delta_exact;
    assert!(err < 0.03,
        "SS UDL deflection: {:.6e} vs 5qL^4/(384EI)={:.6e}, err={:.1}%",
        defl_iz, delta_exact, err * 100.0);
}

// ================================================================
// 5. Mixed Cross Sections: Stiffer Half Deflects Less
// ================================================================
//
// 2-element SS beam: elem 1 uses section with Iz=1e-4,
// elem 2 uses section with Iz=2e-4.
// Under uniform load, the stiffer half (elem 2) should deflect
// less at its midpoint than the weaker half.

#[test]
fn validation_stiffmod_mixed_cross_sections() {
    let l = 8.0;
    let _half_l = l / 2.0;
    let n_per = 4; // 4 elements per half
    let n = 2 * n_per;
    let q = -10.0;
    let iz1 = IZ;       // 1e-4 (weaker)
    let iz2 = 2.0 * IZ; // 2e-4 (stiffer)

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, y: 0.0 },
        );
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: iz1, as_y: None });
    secs_map.insert("2".to_string(), SolverSection { id: 2, a: A, iz: iz2, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        let sec_id = if i < n_per { 1 } else { 2 };
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: sec_id,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Quarter-point of left half (weaker): node at L/4
    let quarter_left = n_per / 2 + 1; // midpoint of left half
    let d_left = results.displacements.iter()
        .find(|d| d.node_id == quarter_left).unwrap().uy.abs();

    // Quarter-point of right half (stiffer): node at 3L/4
    let quarter_right = n_per + n_per / 2 + 1; // midpoint of right half
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == quarter_right).unwrap().uy.abs();

    // The stiffer half should deflect less
    assert!(d_left > d_right,
        "Weaker section ({:.6e}) should deflect more than stiffer ({:.6e})",
        d_left, d_right);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q.abs() * l, 0.02, "Mixed sections: equilibrium");
}

// ================================================================
// 6. Axial Release: Truss-Like Member (Double-Hinged)
// ================================================================
//
// Frame element with hinges at both ends acts as a truss element:
// it can only carry axial force, not bending. Under transverse load,
// moments at both ends should be zero.
// Test with an inclined member in a simple frame.

#[test]
fn validation_stiffmod_axial_release_truss_like() {
    // Simple triangular truss-like structure:
    //   Node 1 (0,0) - pinned
    //   Node 2 (4,0) - rollerX
    //   Node 3 (2,3) - free, loaded
    // All members double-hinged → no bending, pure truss.
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 2.0, 3.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, true, true), // both hinges
        (2, "frame", 2, 3, 1, 1, true, true), // both hinges
        (3, "frame", 1, 2, 1, 1, true, true), // both hinges (bottom chord)
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -20.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All elements should have zero moments at both ends
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "Truss-like elem {}: m_start should be ~0: {:.6}", ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 0.01,
            "Truss-like elem {}: m_end should be ~0: {:.6}", ef.element_id, ef.m_end);
    }

    // Equilibrium: sum Ry = 20
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 20.0, 0.02, "Truss-like: equilibrium Ry");

    // By symmetry, both supports share the vertical load equally
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, 10.0, 0.02, "Truss-like: symmetric R1y");
    assert_close(r2.ry, 10.0, 0.02, "Truss-like: symmetric R2y");
}

// ================================================================
// 7. Adding Hinge Increases Deflection
// ================================================================
//
// Compare fixed-fixed beam with and without internal hinge at midspan.
// The hinged version loses moment continuity → deflects more.
// Fixed-fixed center load: delta = PL^3/(192EI)
// With midspan hinge → propped cantilever behavior on each half.

#[test]
fn validation_stiffmod_hinge_increases_deflection() {
    let l = 6.0;
    let n = 8;
    let _p = 15.0;

    let build = |with_hinge: bool| -> f64 {
        let n_nodes = n + 1;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();

        let mid_elem = n / 2;
        let elems: Vec<_> = (0..n)
            .map(|i| {
                let he = with_hinge && i + 1 == mid_elem;
                let hs = with_hinge && i + 1 == mid_elem + 1;
                (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
            })
            .collect();

        let sups = vec![(1, 1_usize, "fixed"), (2, n_nodes, "fixed")];

        // UDL on all elements
        let mut loads = Vec::new();
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
            }));
        }

        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Find maximum deflection
        results.displacements.iter()
            .map(|d| d.uy.abs())
            .fold(0.0_f64, f64::max)
    };

    let defl_no_hinge = build(false);
    let defl_with_hinge = build(true);

    // Hinge must increase deflection
    assert!(defl_with_hinge > defl_no_hinge,
        "Hinge should increase deflection: with={:.6e} > without={:.6e}",
        defl_with_hinge, defl_no_hinge);

    // The ratio should be significant (fixed-fixed to hinged is a large stiffness change)
    let ratio = defl_with_hinge / defl_no_hinge;
    assert!(ratio > 1.5,
        "Hinge deflection ratio should be > 1.5: got {:.3}", ratio);

    // Verify the no-hinge case matches the fixed-fixed formula
    let e_eff = E * 1000.0;
    let q = 10.0;
    let delta_ff = q * l.powi(4) / (384.0 * e_eff * IZ);
    let err = (defl_no_hinge - delta_ff).abs() / delta_ff;
    assert!(err < 0.05,
        "Fixed-fixed UDL deflection: {:.6e} vs formula {:.6e}, err={:.1}%",
        defl_no_hinge, delta_ff, err * 100.0);
}

// ================================================================
// 8. Multiple Hinges in Multi-Bay Frame: Lateral Load Distribution
// ================================================================
//
// 3-bay portal frame with hinges at all beam-to-column connections.
// The hinges make beams act as simply-supported between column tops,
// turning the frame into a collection of independent cantilever columns
// (for lateral loads). Each column should carry an equal share of
// the total lateral load applied at the top.

#[test]
fn validation_stiffmod_multi_bay_hinged_frame() {
    let h = 4.0;
    let w = 5.0;
    let p = 40.0; // total lateral load at top-left

    // 3-bay frame: 4 columns + 3 beams
    // Nodes: 1-4 at base, 5-8 at top
    //   1=(0,0), 5=(0,h)
    //   2=(w,0), 6=(w,h)
    //   3=(2w,0), 7=(2w,h)
    //   4=(3w,0), 8=(3w,h)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0), (4, 3.0 * w, 0.0),
        (5, 0.0, h),   (6, w, h),   (7, 2.0 * w, h),   (8, 3.0 * w, h),
    ];

    // Columns (no hinges — fixed at base, hinged at top via beam hinges)
    // Beams with hinges at both ends
    let elems = vec![
        // Columns
        (1, "frame", 1, 5, 1, 1, false, true),  // col 1, hinge at top
        (2, "frame", 2, 6, 1, 1, false, true),  // col 2, hinge at top
        (3, "frame", 3, 7, 1, 1, false, true),  // col 3, hinge at top
        (4, "frame", 4, 8, 1, 1, false, true),  // col 4, hinge at top
        // Beams (hinges at both ends)
        (5, "frame", 5, 6, 1, 1, true, true),   // beam 1
        (6, "frame", 6, 7, 1, 1, true, true),   // beam 2
        (7, "frame", 7, 8, 1, 1, true, true),   // beam 3
    ];

    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
        (4, 4, "fixed"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Multi-bay hinged frame: sum Rx = -P");

    // With all beam-column connections hinged, beams transmit no moment.
    // The beams are double-hinged so they act as axial links.
    // This means the frame sways as a unit (rigid diaphragm at top).
    // All columns have the same height, same I, same boundary conditions
    // (fixed at base, hinged at top = cantilever with guided top).
    // Each column should carry P/4 of the lateral load.
    let expected_per_col = p / 4.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r1.rx.abs(), expected_per_col, 0.05,
        "Column 1 shear = P/4");
    assert_close(r2.rx.abs(), expected_per_col, 0.05,
        "Column 2 shear = P/4");
    assert_close(r3.rx.abs(), expected_per_col, 0.05,
        "Column 3 shear = P/4");
    assert_close(r4.rx.abs(), expected_per_col, 0.05,
        "Column 4 shear = P/4");

    // All beam moments should be zero (double-hinged beams)
    for eid in 5..=7 {
        let ef = results.element_forces.iter().find(|e| e.element_id == eid).unwrap();
        assert!(ef.m_start.abs() < 0.1,
            "Beam {} m_start should be ~0: {:.6}", eid, ef.m_start);
        assert!(ef.m_end.abs() < 0.1,
            "Beam {} m_end should be ~0: {:.6}", eid, ef.m_end);
    }

    // All top nodes should have the same lateral displacement (rigid diaphragm via axial links)
    let ux5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let ux6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap().ux;
    let ux7 = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;
    let ux8 = results.displacements.iter().find(|d| d.node_id == 8).unwrap().ux;

    let avg_ux = (ux5 + ux6 + ux7 + ux8) / 4.0;
    for (nid, ux) in [(5, ux5), (6, ux6), (7, ux7), (8, ux8)] {
        let err = (ux - avg_ux).abs() / avg_ux.abs().max(1e-12);
        assert!(err < 0.02,
            "Node {} lateral disp {:.6e} should match avg {:.6e}", nid, ux, avg_ux);
    }
}

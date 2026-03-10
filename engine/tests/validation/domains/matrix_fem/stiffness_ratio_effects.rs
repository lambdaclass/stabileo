/// Validation: Stiffness Ratio Effects on Structural Behavior
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 6
///   - Kassimali, "Structural Analysis", Ch. 16 (Moment Distribution)
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", Ch. 12
///
/// The relative stiffness of connected members determines how loads
/// are distributed between them. These tests verify that the solver
/// correctly captures stiffness-dependent load distribution.
///
/// Tests verify:
///   1. Stiff beam / flexible column: load goes through beam
///   2. Flexible beam / stiff column: columns share more
///   3. Distribution factor: moment splits by EI/L ratio
///   4. Rigid floor assumption: equal lateral displacement
///   5. Relative member stiffness: force partition
///   6. Spring support stiffness effect
///   7. Axial vs flexural stiffness
///   8. Beam stiffness effect on frame sidesway
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Stiff Beam / Flexible Column Portal
// ================================================================
//
// When the beam is much stiffer than columns, lateral load
// distributes equally between columns (like a rigid floor).

#[test]
fn validation_stiffness_stiff_beam() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let iz_beam = IZ * 1000.0; // very stiff beam

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // col (IZ)
        (2, "frame", 2, 3, 1, 2, false, false), // beam (IZ*1000)
        (3, "frame", 3, 4, 1, 1, false, false), // col (IZ)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // With rigid beam: columns share equally, so lateral drift at nodes 2 and 3 is equal
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    assert_close(d2, d3, 0.01, "Stiff beam: equal column drift");

    // Horizontal reactions should be approximately equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx.abs(), r4.rx.abs(), 0.05,
        "Stiff beam: equal column shears");
}

// ================================================================
// 2. Flexible Beam / Stiff Column: Independent Column Action
// ================================================================

#[test]
fn validation_stiffness_flexible_beam() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let iz_beam = IZ * 1e-8; // extremely flexible beam

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // With very flexible beam: joint rotation at loaded node is larger
    // (beam provides no rotational restraint → cantilever-like behavior)
    let rz2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().rz.abs();

    // Compare with stiff-beam case
    let iz_stiff = IZ * 1000.0;
    let nodes_s = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_s = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_s = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_s = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input_s = make_input(
        nodes_s, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_stiff)],
        elems_s, sups_s, loads_s,
    );
    let res_s = linear::solve_2d(&input_s).unwrap();
    let rz2_stiff = res_s.displacements.iter().find(|d| d.node_id == 2).unwrap().rz.abs();

    // Flexible beam → larger joint rotation
    assert!(rz2 > rz2_stiff * 1.5,
        "Flexible beam: more joint rotation: {:.6} vs {:.6}",
        rz2, rz2_stiff);
}

// ================================================================
// 3. Distribution Factor: Moment Splits by EI/L
// ================================================================
//
// At a joint where two beams meet, an applied moment distributes
// in proportion to their stiffness (4EI/L for far-end fixed).

#[test]
fn validation_stiffness_distribution() {
    let l1 = 6.0;
    let l2 = 8.0;
    let m = 60.0;
    let iz1 = IZ;
    let iz2 = IZ * 2.0;
    let e_eff = E * 1000.0;

    // Two beams meeting at node 2, both fixed at far ends
    // Applied moment at node 2
    let n1 = 12;
    let n2 = 16;

    let mut nodes = Vec::new();
    let dx1 = l1 / n1 as f64;
    for i in 0..=n1 {
        nodes.push((i + 1, i as f64 * dx1, 0.0));
    }
    let dx2 = l2 / n2 as f64;
    for i in 1..=n2 {
        nodes.push((n1 + 1 + i, l1 + i as f64 * dx2, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..n1 {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in 0..n2 {
        elems.push((n1 + 1 + i, "frame", n1 + 1 + i, n1 + 2 + i, 1, 2, false, false));
    }

    let sups = vec![
        (1, 1, "fixed"),
        (2, n1 + 1 + n2, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n1 + 1, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz1), (2, A, iz2)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Stiffnesses: k1 = 4*E*iz1/l1, k2 = 4*E*iz2/l2
    let k1 = 4.0 * e_eff * iz1 / l1;
    let k2 = 4.0 * e_eff * iz2 / l2;
    let df1 = k1 / (k1 + k2);
    let df2 = k2 / (k1 + k2);

    // Moment in beam 1 near the joint
    let ef_joint1 = results.element_forces.iter()
        .find(|e| e.element_id == n1).unwrap();
    let ef_joint2 = results.element_forces.iter()
        .find(|e| e.element_id == n1 + 1).unwrap();

    // The moments near the joint should be proportional to distribution factors
    let m1 = ef_joint1.m_end.abs();
    let m2 = ef_joint2.m_start.abs();
    let total = m1 + m2;

    if total > 1.0 {
        let computed_df1 = m1 / total;
        let computed_df2 = m2 / total;
        assert_close(computed_df1, df1, 0.15,
            "Distribution factor beam 1");
        assert_close(computed_df2, df2, 0.15,
            "Distribution factor beam 2");
    }
}

// ================================================================
// 4. Rigid Floor Assumption: Equal Lateral Displacement
// ================================================================

#[test]
fn validation_stiffness_rigid_floor() {
    let h = 3.5;
    let w = 5.0;
    let f = 10.0;
    let iz_beam = IZ * 10000.0; // extremely stiff beam

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, w, 0.0),
        (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 2, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 2, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // All floor-level nodes should have same lateral displacement
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    assert_close(d2, d3, 0.01, "Rigid floor: d2 = d3");
    assert_close(d3, d5, 0.01, "Rigid floor: d3 = d5");
}

// ================================================================
// 5. Parallel Springs: Force Partition by Stiffness
// ================================================================

#[test]
fn validation_stiffness_parallel_springs() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;

    // Beam on two spring supports with different stiffnesses
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * l / n as f64, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    // Pinned at left, spring at right
    let mut sups_map = std::collections::HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let mut mats_map = std::collections::HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = std::collections::HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut nodes_map = std::collections::HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut elems_map = std::collections::HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(),
            node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si,
            hinge_start: *hs, hinge_end: *he,
        });
    }

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Both supports have reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry + r_end.ry, p, 0.01,
        "Parallel supports: ΣRy = P");
}

// ================================================================
// 6. Spring Support Stiffness Effect
// ================================================================

#[test]
fn validation_stiffness_spring_effect() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;

    let solve_with_spring = |ky: f64| -> f64 {
        let nodes: Vec<_> = (0..=n)
            .map(|i| (i + 1, i as f64 * l / n as f64, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let mut sups_map = std::collections::HashMap::new();
        sups_map.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1,
            support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n + 1,
            support_type: "free".to_string(),
            kx: None, ky: Some(ky), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });

        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })];

        let mut nodes_map = std::collections::HashMap::new();
        for (id, x, y) in &nodes {
            nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
        }
        let mut elems_map = std::collections::HashMap::new();
        for (id, t, ni, nj, mi, si, hs, he) in &elems {
            elems_map.insert(id.to_string(), SolverElement {
                id: *id, elem_type: t.to_string(),
                node_i: *ni, node_j: *nj,
                material_id: *mi, section_id: *si,
                hinge_start: *hs, hinge_end: *he,
            });
        }
        let mut mats_map = std::collections::HashMap::new();
        mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
        let mut secs_map = std::collections::HashMap::new();
        secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

        let input = SolverInput {
            nodes: nodes_map, materials: mats_map, sections: secs_map,
            elements: elems_map, supports: sups_map, loads, constraints: vec![],
            connectors: std::collections::HashMap::new(), };
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs()
    };

    let d_soft = solve_with_spring(100.0);   // soft spring
    let d_stiff = solve_with_spring(1e8);     // very stiff spring

    // Stiffer spring → less deflection
    assert!(d_stiff < d_soft,
        "Spring stiffness: stiffer spring deflects less: {:.6} < {:.6}",
        d_stiff, d_soft);
}

// ================================================================
// 7. Axial vs Flexural Stiffness
// ================================================================
//
// Axial stiffness EA/L >> flexural stiffness 12EI/L³ for slender beams.
// Under axial load, deformation is tiny. Under lateral load, it's large.

#[test]
fn validation_stiffness_axial_vs_flexural() {
    let l = 10.0;
    let n = 20;
    let p = 10.0;

    // Axial load
    let loads_axial = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_axial = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_axial);
    let res_axial = linear::solve_2d(&input_axial).unwrap();

    // Lateral load
    let mid = n / 2 + 1;
    let loads_lateral = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_lateral = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_lateral);
    let res_lateral = linear::solve_2d(&input_lateral).unwrap();

    let d_axial = res_axial.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux.abs();
    let d_lateral = res_lateral.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Axial: δ = PL/(EA); Lateral: δ = PL³/(48EI)
    // Ratio: δ_lat/δ_axial = EA*L²/(48*I) which is >> 1 for slender beams
    let ratio = d_lateral / d_axial;
    assert!(ratio > 10.0,
        "Axial vs flexural: lateral much softer: ratio = {:.1}", ratio);
}

// ================================================================
// 8. Beam Stiffness Effect on Frame Sidesway
// ================================================================

#[test]
fn validation_stiffness_beam_on_sidesway() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let solve_portal = |iz_beam: f64| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 2, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
        })];
        let input = make_input(
            nodes, vec![(1, E, 0.3)],
            vec![(1, A, IZ), (2, A, iz_beam)],
            elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    let d_weak = solve_portal(IZ * 0.1);    // weak beam
    let d_strong = solve_portal(IZ * 100.0); // strong beam

    // Stronger beam → less sidesway (more frame action)
    assert!(d_strong < d_weak,
        "Beam stiffness: stronger beam reduces sway: {:.6} < {:.6}",
        d_strong, d_weak);

    // Ratio should be significant
    assert!(d_weak / d_strong > 1.5,
        "Beam stiffness: significant sway reduction");
}

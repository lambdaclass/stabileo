/// Validation: 3D Boundary Conditions — Prescribed Displacements, Springs
///
/// References:
///   - Ghali/Neville: Support settlement in continuous beams
///   - Beam theory: rotational spring stiffness limits
///   - Spring theory: u = F/(EA/L + k) for series stiffness
///
/// Tests:
///   1. 3D prescribed settlement at midspan
///   2. 3D prescribed rotation at cantilever tip
///   3. 3D differential settlement on continuous beam
///   4. Rotational spring krz at midspan (intermediate behavior)
///   5. Rotational spring limits (stiff → fixed, soft → pinned)
///   6. Translational spring kx at tip
///   7. Combined rotational + translational springs on portal frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 1e-4;

// ================================================================
// 1. Prescribed Settlement at Midspan
// ================================================================
//
// SS beam in 3D, prescribed dy = -0.01 m at midspan support.
// M = 6·EI·δ/L² at supports (propped cantilever analogy for each span).

#[test]
fn validation_3d_prescribed_settlement() {
    let n = 8;
    let l = 6.0;
    let delta = -0.01; // 10mm downward settlement

    let elem_len = l / n as f64;
    let n_nodes = n + 1;
    let mid_node = n / 2 + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    // Supports: fixed at start, roller at end, prescribed settlement at mid
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    sups_map.insert("2".to_string(), SolverSupport3D {
        node_id: n_nodes,
        rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    // Midspan: prescribed vertical displacement
    sups_map.insert("3".to_string(), SolverSupport3D {
        node_id: mid_node,
        rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: Some(delta), drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id: *id, x: *x, y: *y, z: *z });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D { id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None, as_y: None, as_z: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in &elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let input = SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![],
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Verify midspan node has prescribed displacement
    let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid.uz, delta, 0.01, "prescribed uz at midspan");

    // Settlement induces reactions at supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();

    // Sum of vertical reactions should be zero (no external loads)
    let sum_fz = r1.fz + r_end.fz + r_mid.fz;
    assert!(sum_fz.abs() < 1e-3, "ΣFz = 0, got {:.6}", sum_fz);
}

// ================================================================
// 2. Prescribed Rotation at Cantilever Tip
// ================================================================
//
// 3D cantilever, prescribed rotation drz at tip.
// This forces a rotation which induces consistent displacements.

#[test]
fn validation_3d_prescribed_rotation() {
    let n = 4;
    let l = 3.0;
    let drz_prescribed = 0.01; // 10 mrad

    let fixed_dofs = vec![true, true, true, true, true, true];
    let elem_len = l / n as f64;
    let n_nodes = n + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    let mut sups = vec![(1_usize, fixed_dofs)];
    // Tip: prescribed rotation about z
    sups.push((n_nodes, vec![false, false, false, false, false, false]));

    let mut input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)], elems, sups, vec![]);

    // Set prescribed rotation at tip
    if let Some(sup) = input.supports.values_mut().find(|s| s.node_id == n_nodes) {
        sup.rrz = true;
        sup.drz = Some(drz_prescribed);
    }

    let results = linear::solve_3d(&input).unwrap();

    // Tip should have the prescribed rotation
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(tip.rz, drz_prescribed, 0.02, "prescribed rz at tip");

    // Should produce non-zero bending moment at root
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.mz.abs() > 1e-6, "Fixed end should have reaction moment, got mz={:.6}", r1.mz);
}

// ================================================================
// 3. Differential Settlement on Continuous Beam
// ================================================================
//
// 3-support continuous beam (2 spans), settle middle support.
// Settlement redistributes reactions.
// Beam along X, settlement in Z → bending about Y (My).
// Supports must restrain rry to develop fixed-end moments.

#[test]
fn validation_3d_differential_settlement() {
    let l_span = 4.0;
    let n_per_span = 4;
    let delta = -0.005; // 5mm settlement at middle support

    let total_n = 2 * n_per_span;
    let n_nodes = total_n + 1;
    let mid_node = n_per_span + 1;
    let elem_len = l_span / n_per_span as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    let mut sups_map = HashMap::new();
    // Fixed at left end (all DOFs restrained → develops moment from settlement)
    sups_map.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    // Middle support with settlement (restrain rz, rry for moment continuity)
    sups_map.insert("2".to_string(), SolverSupport3D {
        node_id: mid_node,
        rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: Some(delta), drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    // Fixed at right end
    sups_map.insert("3".to_string(), SolverSupport3D {
        node_id: n_nodes,
        rx: false, ry: false, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id: *id, x: *x, y: *y, z: *z });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D { id: 1, name: None, a: A, iy: IY, iz: IZ, j: J, cw: None, as_y: None, as_z: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in &elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let input = SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![],
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Middle node should have the prescribed settlement
    let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid.uz, delta, 0.02, "differential settlement uz");

    // Reactions should be in equilibrium (no external loads)
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() < 1e-3, "ΣFz = 0, got {:.6}", sum_fz);

    // Settlement in Z direction → bending about Y (my), not Z (mz)
    let has_moment = results.element_forces.iter().any(|ef| ef.my_start.abs() > 1e-6 || ef.mz_start.abs() > 1e-6);
    assert!(has_moment, "Settlement should induce bending moments");
}

// ================================================================
// 4. Rotational Spring krz at Midspan
// ================================================================
//
// SS beam with rotational spring at midspan under quarter-span load.
// (A midspan symmetric load has zero rotation at mid → spring has no effect.)
// Load at quarter-span in Y → Mz bending → krz spring is relevant.

#[test]
fn validation_3d_rotational_spring_krz() {
    let n = 8;
    let l = 6.0;
    let p = 10.0;
    let quarter_node = n / 4 + 1;
    let mid_node = n / 2 + 1;

    let fixed_dofs_pin = vec![true, true, true, true, true, false]; // pin: free rrz
    let fixed_dofs_roller = vec![false, true, true, true, true, false]; // roller: free rx, rrz

    // Quarter-span point load in Y (→ Mz bending, non-zero rotation at midspan)
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: quarter_node, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input_ss = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs_pin.clone(), Some(fixed_dofs_roller.clone()), loads.clone());
    let res_ss = linear::solve_3d(&input_ss).unwrap();

    // With rotational spring krz at midspan
    let mut input_spring = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs_pin, Some(fixed_dofs_roller), loads);

    let n_existing = input_spring.supports.len();
    input_spring.supports.insert((n_existing + 1).to_string(), SolverSupport3D {
        node_id: mid_node,
        rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None,
        krz: Some(E * 1000.0 * IZ / l), // Moderate spring stiffness
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let res_spring = linear::solve_3d(&input_spring).unwrap();

    // Compare deflection at the load point (quarter-span)
    let q_ss = res_ss.displacements.iter().find(|d| d.node_id == quarter_node).unwrap();
    let q_spring = res_spring.displacements.iter().find(|d| d.node_id == quarter_node).unwrap();

    // Spring should reduce deflection compared to no spring
    assert!(
        q_spring.uy.abs() < q_ss.uy.abs(),
        "Spring should reduce deflection: with_spring={:.6e}, without={:.6e}",
        q_spring.uy.abs(), q_ss.uy.abs()
    );
}

// ================================================================
// 5. Rotational Spring Limits
// ================================================================
//
// Very stiff krz → approaches fixed-end behavior (cantilever)
// Very soft krz → approaches pinned behavior (free rotation)
// Load in Y direction → Mz bending → krz is the relevant rotational DOF.

#[test]
fn validation_3d_rotational_spring_limit() {
    let n = 4;
    let l = 3.0;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Load in Y direction at tip → bending about Z (Mz) → krz relevant
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    // Cantilever (all DOFs fixed at base, free tip)
    let fixed_dofs = vec![true, true, true, true, true, true];
    let res_fixed = linear::solve_3d(&make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads.clone())).unwrap();
    let delta_fixed = res_fixed.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Base with translations + rrx,rry fixed, rrz free + very stiff spring → approaches fixed
    let pinned_dofs = vec![true, true, true, true, true, false]; // free rrz
    let mut input_stiff = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned_dofs.clone(), None, loads.clone());
    for sup in input_stiff.supports.values_mut() {
        if sup.node_id == 1 {
            sup.krz = Some(1e12); // Very stiff
        }
    }
    let res_stiff = linear::solve_3d(&input_stiff).unwrap();
    let delta_stiff = res_stiff.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Base with very soft rotational spring → approaches free rotation
    let mut input_soft = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned_dofs, None, loads);
    for sup in input_soft.supports.values_mut() {
        if sup.node_id == 1 {
            sup.krz = Some(1e-3); // Very soft
        }
    }
    let res_soft = linear::solve_3d(&input_soft).unwrap();
    let delta_soft = res_soft.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // δ_cantilever = PL³/(3EI_z) — cantilever deflection for Fy load
    let delta_cantilever = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(delta_stiff, delta_cantilever, 0.05,
        "Very stiff krz → cantilever deflection");

    // Soft spring should give larger deflection than fixed
    assert!(
        delta_soft > delta_fixed * 1.5,
        "Soft spring should give much larger deflection: soft={:.6e}, fixed={:.6e}",
        delta_soft, delta_fixed
    );
}

// ================================================================
// 6. Translational Spring kx at Tip
// ================================================================
//
// Cantilever with kx spring at tip, axial load → u = F/(EA/L + k)

#[test]
fn validation_3d_translational_spring_kx() {
    let n = 4;
    let l = 3.0;
    let e_eff = E * 1000.0;
    let f_axial = 100.0; // kN axial load

    let k_spring = 50_000.0; // kN/m spring stiffness
    let ea_over_l = e_eff * A / l;
    // Series stiffness: u = F/(EA/L + k)
    // Actually for spring at tip, it's parallel:
    // K_bar = EA/L, K_spring = k → total K = EA/L + k
    // u = F / (EA/L + k)
    let u_expected = f_axial / (ea_over_l + k_spring);

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: f_axial, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let fixed_dofs = vec![true, true, true, true, true, true];
    let mut input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads);

    // Add spring support at tip
    let n_nodes = n + 1;
    let n_existing = input.supports.len();
    input.supports.insert((n_existing + 1).to_string(), SolverSupport3D {
        node_id: n_nodes,
        rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: Some(k_spring), ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();

    assert_close(tip.ux, u_expected, 0.02, "kx spring tip displacement");
}

// ================================================================
// 7. Combined Rotational + Translational Springs on Portal Frame
// ================================================================
//
// Portal frame with spring base: drift should be between pinned and fixed.

#[test]
fn validation_3d_combined_springs() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0; // kN lateral load

    // 3D portal frame: 4 nodes
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, w, h, 0.0),
        (4, w, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: lateral, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    // Fixed base reference
    let sups_fixed = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let input_fixed = make_3d_input(
        nodes.clone(), vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems.clone(), sups_fixed, loads.clone(),
    );
    let res_fixed = linear::solve_3d(&input_fixed).unwrap();
    let drift_fixed = res_fixed.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Pinned base reference
    let sups_pinned = vec![
        (1, vec![true, true, true, true, true, false]),
        (4, vec![true, true, true, true, true, false]),
    ];
    let input_pinned = make_3d_input(
        nodes.clone(), vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems.clone(), sups_pinned, loads.clone(),
    );
    let res_pinned = linear::solve_3d(&input_pinned).unwrap();
    let drift_pinned = res_pinned.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Spring base: pinned + rotational spring
    let sups_spring = vec![
        (1, vec![true, true, true, true, true, false]),
        (4, vec![true, true, true, true, true, false]),
    ];
    let mut input_spring = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups_spring, loads,
    );
    // Add rotational springs at base
    let e_eff = E * 1000.0;
    let krz_val = 3.0 * e_eff * IZ / h; // Moderate stiffness
    for sup in input_spring.supports.values_mut() {
        sup.krz = Some(krz_val);
    }
    let res_spring = linear::solve_3d(&input_spring).unwrap();
    let drift_spring = res_spring.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Spring drift should be between fixed and pinned
    assert!(
        drift_spring > drift_fixed * 0.95 && drift_spring < drift_pinned * 1.05,
        "Spring drift={:.6e} should be between fixed={:.6e} and pinned={:.6e}",
        drift_spring, drift_fixed, drift_pinned
    );
}

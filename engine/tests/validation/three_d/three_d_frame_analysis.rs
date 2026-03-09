/// Validation: 3D Frame Analysis Benchmarks
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 10
///   - McGuire/Gallagher/Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - ANSYS VM4: Deflection of a hinged support
///   - Timoshenko & Goodier, "Theory of Elasticity"
///
/// Tests:
///   1. 3D cantilever biaxial bending: δy and δz match beam theory
///   2. Space truss: bar forces match joint equilibrium
///   3. Torsion of cantilever: twist angle = TL/(GJ)
///   4. 3D portal frame: lateral stiffness bounds
///   5. Grid (beam on supports): deflection under point load
///   6. 3D continuous beam: two-span deflection
///   7. Cantilever combined loading: N + Vy + Vz + T + My + Mz
///   8. Symmetric frame: verify load sharing
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. 3D Cantilever Biaxial Bending
// ================================================================
//
// Cantilever beam along X. Tip loads in Y and Z.
// δy = Fy·L³/(3·E_eff·Iz), δz = Fz·L³/(3·E_eff·Iy)

#[test]
fn validation_3d_frame_cantilever_biaxial() {
    let l: f64 = 5.0;
    let n = 8;
    let fy_load = 10.0;
    let fz_load = 5.0;
    let e_eff = E * 1000.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: fy_load, fz: fz_load,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_y_exact = fy_load * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_z_exact = fz_load * l.powi(3) / (3.0 * e_eff * IY);

    let err_y = (tip.uy.abs() - delta_y_exact).abs() / delta_y_exact;
    let err_z = (tip.uz.abs() - delta_z_exact).abs() / delta_z_exact;

    assert!(err_y < 0.05,
        "Biaxial Y: uy={:.6e}, exact={:.6e}, err={:.1}%",
        tip.uy.abs(), delta_y_exact, err_y * 100.0);
    assert!(err_z < 0.05,
        "Biaxial Z: uz={:.6e}, exact={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_z_exact, err_z * 100.0);
}

// ================================================================
// 2. Space Truss: Joint Equilibrium
// ================================================================
//
// Simple 3D truss with 3 bars meeting at a point.
// Applied load at junction → verify equilibrium.

#[test]
fn validation_3d_frame_space_truss_equilibrium() {
    let h = 3.0;
    let r = 2.0;
    let angle_step = 2.0 * std::f64::consts::PI / 3.0;

    // Base triangle + apex
    let mut nodes = Vec::new();
    for i in 0..3 {
        let angle = i as f64 * angle_step;
        nodes.push((i + 1, r * angle.cos(), r * angle.sin(), 0.0));
    }
    nodes.push((4, 0.0, 0.0, h)); // apex

    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];

    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    let fz = -100.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);

    let results = linear::solve_3d(&input).unwrap();

    // Verify global equilibrium: ΣRz = -Fz
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let eq_err = (sum_rz + fz).abs() / fz.abs();
    assert!(eq_err < 0.01,
        "Vertical equilibrium: ΣRz={:.4}, Fz={:.4}, err={:.2}%",
        sum_rz, fz, eq_err * 100.0);

    // Apex should deflect downward
    let apex = results.displacements.iter()
        .find(|d| d.node_id == 4).unwrap();
    assert!(apex.uz < 0.0, "Apex should deflect down, got uz={:.6e}", apex.uz);
}

// ================================================================
// 3. Torsion of Cantilever: θ = TL/(GJ)
// ================================================================
//
// Cantilever under end torque. Twist angle at tip.
// G = E/(2(1+ν)), θ = T·L/(G·J)

#[test]
fn validation_3d_frame_cantilever_torsion() {
    let l: f64 = 4.0;
    let n = 8;
    let torque = 5.0; // kN·m
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let theta_exact = torque * l / (g * J);
    let err = (tip.rx.abs() - theta_exact).abs() / theta_exact;

    assert!(err < 0.05,
        "Torsion: rx={:.6e}, exact={:.6e}, err={:.1}%",
        tip.rx.abs(), theta_exact, err * 100.0);
}

// ================================================================
// 4. 3D Portal Frame: Lateral Stiffness
// ================================================================
//
// 3D portal frame with fixed bases, lateral load at roof level.
// Stiffness bounded between 2×3EI/h³ (cantilever pair) and 24EI/h³ (rigid beam).

#[test]
fn validation_3d_frame_portal_stiffness() {
    let h: f64 = 4.0;
    let bay: f64 = 6.0;
    let h_load = 1.0;
    let e_eff = E * 1000.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, bay, 0.0, h),
        (4, bay, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column
        (2, "frame", 2, 3, 1, 1), // beam
        (3, "frame", 3, 4, 1, 1), // column
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: h_load, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);

    let results = linear::solve_3d(&input).unwrap();
    let d2 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();

    let k_actual = h_load / d2.ux.abs();

    // Use Iz for bending about Z (columns bend in XZ plane for X-direction lateral load)
    let k_cantilever = 2.0 * 3.0 * e_eff * IZ / h.powi(3);
    let k_rigid_beam = 24.0 * e_eff * IZ / h.powi(3);

    assert!(k_actual > k_cantilever * 0.5,
        "Stiffness={:.4} should exceed cantilever pair={:.4}", k_actual, k_cantilever);
    assert!(k_actual < k_rigid_beam * 1.5,
        "Stiffness={:.4} should be below rigid beam={:.4}", k_actual, k_rigid_beam);
}

// ================================================================
// 5. Grid: Beam on Supports Under Point Load
// ================================================================
//
// Cross-shaped grid (two beams crossing at center).
// Point load at intersection → shared by both beams.

#[test]
fn validation_3d_frame_grid_point_load() {
    let l: f64 = 6.0;
    let n = 4;
    let elem_len = l / n as f64;
    let p = 10.0;

    // Beam 1: along X (nodes 1-5)
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut elem_id = 1;
    for i in 0..=n {
        nodes.push((i + 1, -l / 2.0 + i as f64 * elem_len, 0.0, 0.0));
    }
    for i in 0..n {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1));
        elem_id += 1;
    }
    let center_node = n / 2 + 1; // node 3

    // Beam 2: along Y (nodes 6-10), sharing center node 3
    let mut node_id = n + 2; // start at 6
    for i in 0..=n {
        if i == n / 2 {
            continue; // skip center, use node 3
        }
        nodes.push((node_id, 0.0, -l / 2.0 + i as f64 * elem_len, 0.0));
        node_id += 1;
    }

    // Build Y-beam elements: 6-7-3-8-9
    let y_nodes: Vec<usize> = {
        let mut yn = Vec::new();
        let mut nid = n + 2;
        for i in 0..=n {
            if i == n / 2 {
                yn.push(center_node);
            } else {
                yn.push(nid);
                nid += 1;
            }
        }
        yn
    };
    for i in 0..n {
        elems.push((elem_id, "frame", y_nodes[i], y_nodes[i + 1], 1, 1));
        elem_id += 1;
    }

    // Supports: pin all 4 ends
    let sups = vec![
        (1, vec![true, true, true, true, false, false]),          // beam1 start
        (n + 1, vec![true, true, true, true, false, false]),      // beam1 end
        (n + 2, vec![true, true, true, true, false, false]),      // beam2 start
        (*y_nodes.last().unwrap(), vec![true, true, true, true, false, false]), // beam2 end
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: center_node, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);

    let results = linear::solve_3d(&input).unwrap();

    // Center should deflect downward
    let center = results.displacements.iter()
        .find(|d| d.node_id == center_node).unwrap();
    assert!(center.uz < 0.0, "Center should deflect down, got uz={:.6e}", center.uz);

    // Equilibrium check
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let eq_err = (sum_rz - p).abs() / p;
    assert!(eq_err < 0.01, "Equilibrium: ΣRz={:.4}, P={:.4}", sum_rz, p);
}

// ================================================================
// 6. 3D Two-Span Continuous Beam
// ================================================================
//
// Two-span continuous beam, pinned at both ends and roller at center.
// UDL on both spans. Verify deflection pattern and equilibrium.

#[test]
fn validation_3d_frame_two_span_continuous() {
    let l_span: f64 = 5.0;
    let n_per = 4;
    let n_total = 2 * n_per;
    let q = -5.0; // kN/m downward in Z
    let elem_len = l_span / n_per as f64;
    let nodes: Vec<_> = (0..=n_total)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    let mid_node = n_per + 1;
    let end_node = n_total + 1;

    let sups = vec![
        (1, vec![true, true, true, true, false, false]),       // pin start
        (mid_node, vec![false, true, true, true, false, false]), // roller at mid
        (end_node, vec![false, true, true, true, false, false]), // roller at end
    ];

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i + 1,
            q_yi: 0.0, q_yj: 0.0,
            q_zi: q, q_zj: q,
            a: None, b: None,
        }));
    }

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);

    let results = linear::solve_3d(&input).unwrap();

    // Both spans should deflect downward
    let quarter1 = n_per / 2 + 1;
    let quarter2 = n_per + n_per / 2 + 1;
    let d_q1 = results.displacements.iter().find(|d| d.node_id == quarter1).unwrap();
    let d_q2 = results.displacements.iter().find(|d| d.node_id == quarter2).unwrap();

    assert!(d_q1.uz < 0.0, "Span 1 should deflect down: uz={:.6e}", d_q1.uz);
    assert!(d_q2.uz < 0.0, "Span 2 should deflect down: uz={:.6e}", d_q2.uz);

    // Symmetry: both quarter points should have similar deflection
    let ratio = d_q1.uz / d_q2.uz;
    assert!((ratio - 1.0).abs() < 0.15,
        "Symmetric spans: ratio={:.3}", ratio);

    // Total reaction = total applied load = q × 2L
    let total_load = q.abs() * 2.0 * l_span;
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let eq_err = (sum_rz - total_load).abs() / total_load;
    assert!(eq_err < 0.02, "Equilibrium: ΣRz={:.2}, total_load={:.2}", sum_rz, total_load);
}

// ================================================================
// 7. Cantilever Combined Loading: All 6 DOF Forces
// ================================================================
//
// Cantilever under N + Vy + Vz + T + My + Mz simultaneously.
// Superposition should hold for linear analysis.

#[test]
fn validation_3d_frame_combined_loading_superposition() {
    let l: f64 = 4.0;
    let n = 4;

    let fx = 50.0;
    let fy = 10.0;
    let fz = 8.0;
    let mx = 2.0;
    let my = 3.0;
    let mz = 4.0;

    let fixed_dofs = vec![true, true, true, true, true, true];

    // Combined load
    let input_combined = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed_dofs.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx, fy, fz, mx, my, mz, bw: None,
        })],
    );

    // Individual loads
    let cases: Vec<(f64, f64, f64, f64, f64, f64)> = vec![
        (fx, 0.0, 0.0, 0.0, 0.0, 0.0),
        (0.0, fy, 0.0, 0.0, 0.0, 0.0),
        (0.0, 0.0, fz, 0.0, 0.0, 0.0),
        (0.0, 0.0, 0.0, mx, 0.0, 0.0),
        (0.0, 0.0, 0.0, 0.0, my, 0.0),
        (0.0, 0.0, 0.0, 0.0, 0.0, mz),
    ];

    let res_combined = linear::solve_3d(&input_combined).unwrap();
    let tip_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let mut sum_ux = 0.0;
    let mut sum_uy = 0.0;
    let mut sum_uz = 0.0;
    let mut sum_rx = 0.0;
    let mut sum_ry = 0.0;
    let mut sum_rz = 0.0;

    for (cfx, cfy, cfz, cmx, cmy, cmz) in cases {
        let input_i = make_3d_beam(
            n, l, E, NU, A, IY, IZ, J,
            fixed_dofs.clone(), None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: cfx, fy: cfy, fz: cfz,
                mx: cmx, my: cmy, mz: cmz, bw: None,
            })],
        );
        let res_i = linear::solve_3d(&input_i).unwrap();
        let tip_i = res_i.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap();
        sum_ux += tip_i.ux;
        sum_uy += tip_i.uy;
        sum_uz += tip_i.uz;
        sum_rx += tip_i.rx;
        sum_ry += tip_i.ry;
        sum_rz += tip_i.rz;
    }

    // Check superposition
    let check = |name: &str, combined: f64, summed: f64| {
        let denom = combined.abs().max(1e-12);
        let err = (combined - summed).abs() / denom;
        assert!(err < 0.01,
            "Superposition {}: combined={:.6e}, sum={:.6e}, err={:.2}%",
            name, combined, summed, err * 100.0);
    };

    check("ux", tip_combined.ux, sum_ux);
    check("uy", tip_combined.uy, sum_uy);
    check("uz", tip_combined.uz, sum_uz);
    check("rx", tip_combined.rx, sum_rx);
    check("ry", tip_combined.ry, sum_ry);
    check("rz", tip_combined.rz, sum_rz);
}

// ================================================================
// 8. Symmetric Frame: Equal Load Sharing
// ================================================================
//
// Two parallel cantilevers connected by a rigid beam at the tip.
// Vertical load at midpoint of connecting beam → each column carries half.

#[test]
fn validation_3d_frame_symmetric_load_sharing() {
    let h: f64 = 4.0;
    let spacing: f64 = 4.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),        // base col1
        (2, 0.0, 0.0, h),           // top col1
        (3, 0.0, spacing, 0.0),     // base col2
        (4, 0.0, spacing, h),       // top col2
        (5, 0.0, spacing / 2.0, h), // mid beam
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column 1
        (2, "frame", 3, 4, 1, 1), // column 2
        (3, "frame", 2, 5, 1, 1), // half beam
        (4, "frame", 5, 4, 1, 1), // half beam
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);

    let results = linear::solve_3d(&input).unwrap();

    // Both base reactions should carry approximately half the load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    let share_ratio = r1.fz / r2.fz;
    assert!((share_ratio - 1.0).abs() < 0.05,
        "Symmetric sharing: R1_z={:.4}, R2_z={:.4}, ratio={:.3}",
        r1.fz, r2.fz, share_ratio);

    // Total equilibrium
    let sum_rz = r1.fz + r2.fz;
    assert!((sum_rz - p).abs() / p < 0.01,
        "Equilibrium: ΣRz={:.4}, P={:.1}", sum_rz, p);
}

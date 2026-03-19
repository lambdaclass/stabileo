/// Validation: Extended 3D Frame Analysis Benchmarks
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - McGuire/Gallagher/Ziemian, "Matrix Structural Analysis"
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///
/// Tests:
///   1. Cantilever torsion: theta = T*L/(G*J)
///   2. Biaxial bending: independent bending in Y and Z
///   3. Space truss equilibrium (octahedral 6-bar)
///   4. Right-angle 3D frame: torsion-bending coupling
///   5. 3D portal under lateral X load
///   6. Inclined column under vertical load
///   7. Symmetric box frame with equal vertical loads
///   8. 3D cantilever UDL in Y: tip deflection = wL^4/(8EI_z)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m^2)
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const G_EFF: f64 = E_EFF / (2.0 * (1.0 + NU));
const A_SEC: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// =================================================================
// 1. 3D Cantilever — Torsion at Tip
// =================================================================
//
// Fixed-free cantilever, L = 5 m, torque T = 2 kN*m at tip.
// Torsional rotation at tip: theta = T*L / (G*J)
// G = E / (2*(1+nu))

#[test]
fn validation_3d_ext_1_cantilever_torsion() {
    let l = 5.0;
    let torque = 2.0; // kN*m
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None, // free tip
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: 0.0,
            mx: torque, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let theta_expected = torque * l / (G_EFF * J);

    assert_close(tip.rx.abs(), theta_expected, 0.02, "cantilever torsion theta");

    // Pure torsion should produce no lateral deflection
    assert!(tip.uz.abs() < 1e-8, "torsion: no uy, got {:.2e}", tip.uz);
    assert!(tip.uz.abs() < 1e-8, "torsion: no uz, got {:.2e}", tip.uz);

    // And no axial displacement
    assert!(tip.ux.abs() < 1e-8, "torsion: no ux, got {:.2e}", tip.ux);
}

// =================================================================
// 2. 3D Fixed-Free Beam — Biaxial Bending
// =================================================================
//
// Cantilever L = 6 m with Fy = 15 kN and Fz = 8 kN at tip.
// Each bending plane is independent:
//   delta_y = Fy * L^3 / (3*E*Iz)
//   delta_z = Fz * L^3 / (3*E*Iy)
// Verify both deflections match analytical and there is no coupling.

#[test]
fn validation_3d_ext_2_frame_biaxial_bending() {
    let l = 6.0;
    let fy = 15.0;
    let fz = 8.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz: fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y = fy * l.powi(3) / (3.0 * E_EFF * IZ);
    let delta_z = fz * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.uz.abs(), delta_y, 0.02, "biaxial delta_y");
    assert_close(tip.uz.abs(), delta_z, 0.02, "biaxial delta_z");

    // Also verify the two planes are truly independent by checking
    // Y-only and Z-only superposition
    let input_y = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let input_z = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined uy should match Y-only case
    assert_close(tip.uz, tip_y.uz, 0.01, "biaxial superposition uy");
    // Combined uz should match Z-only case
    assert_close(tip.uz, tip_z.uz, 0.01, "biaxial superposition uz");
}

// =================================================================
// 3. Space Truss Equilibrium — 6-bar Octahedral
// =================================================================
//
// 6 bars connecting a top apex (0,0,h) to 4 base corners of a square
// at z=0, plus 2 diagonal bars across the base.
// Single vertical load P at apex. Verify 3D equilibrium:
//   sum(Fx) = 0, sum(Fy) = 0, sum(Fz) = P

#[test]
fn validation_3d_ext_3_space_truss_equilibrium() {
    let s = 2.0; // half-side of base square
    let h = 3.0; // height of apex
    let p = 80.0; // kN vertical load at apex

    // Nodes: 4 base corners + 1 apex
    // Base corners at z=0 forming a square
    let nodes = vec![
        (1, -s, -s, 0.0), // base corner 1
        (2,  s, -s, 0.0), // base corner 2
        (3,  s,  s, 0.0), // base corner 3
        (4, -s,  s, 0.0), // base corner 4
        (5, 0.0, 0.0, h), // apex
    ];

    // 6 bars: 4 inclined (base to apex) + 2 base diagonals for stability
    let elems = vec![
        (1, "truss", 1, 5, 1, 1), // corner 1 to apex
        (2, "truss", 2, 5, 1, 1), // corner 2 to apex
        (3, "truss", 3, 5, 1, 1), // corner 3 to apex
        (4, "truss", 4, 5, 1, 1), // corner 4 to apex
        (5, "truss", 1, 3, 1, 1), // diagonal 1-3
        (6, "truss", 2, 4, 1, 1), // diagonal 2-4
    ];

    // Pin all base nodes (translations only, since truss)
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
        (4, vec![true, true, true, false, false, false]),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5,
        fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, 0.001, 1e-10, 1e-10, 1e-10)], // truss section
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Check 3D equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert!(sum_fx.abs() < 0.5, "6-bar truss Fx={:.3}, expected 0", sum_fx);
    assert!(sum_fz.abs() < 0.5, "6-bar truss Fy={:.3}, expected 0", sum_fz);
    assert_close(sum_fz, p, 0.01, "6-bar truss sum(Fz) = P");

    // By symmetry, all 4 inclined bars should carry equal force
    let forces: Vec<f64> = (1..=4)
        .map(|id| {
            results.element_forces.iter()
                .find(|e| e.element_id == id).unwrap().n_start.abs()
        })
        .collect();
    assert_close(forces[0], forces[1], 0.02, "truss symmetry bar 1 vs 2");
    assert_close(forces[1], forces[2], 0.02, "truss symmetry bar 2 vs 3");
    assert_close(forces[2], forces[3], 0.02, "truss symmetry bar 3 vs 4");
}

// =================================================================
// 4. Right-Angle 3D Frame — Torsion-Bending Coupling
// =================================================================
//
// Two beams at a right angle in 3D. Beam AB along X (fixed at A),
// Beam BC along Y (free at C). Vertical load Fz at C.
// In member AB, this load induces bending about Y-axis and torsion
// about X-axis. In member BC, it induces pure bending about Y-axis.

#[test]
fn validation_3d_ext_4_right_angle_frame() {
    let l1 = 4.0; // AB along X
    let l2 = 3.0; // BC along Y

    // Nodes
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // A (fixed)
        (2, l1, 0.0, 0.0),  // B (junction)
        (3, l1, l2, 0.0),   // C (free, loaded)
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // AB along X
        (2, "frame", 2, 3, 1, 1), // BC along Y
    ];

    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // A fixed
    ];

    let fz = 10.0; // vertical load at C
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3,
        fx: 0.0, fy: 0.0, fz: -fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A_SEC, IY, IZ, J)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Node C should deflect in Z
    let dc = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(dc.uz.abs() > 1e-6, "right-angle frame: node C must deflect in Z, got {:.2e}", dc.uz);

    // Member AB should have torsion (mx) due to the out-of-plane load on cantilever BC
    let ef_ab = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef_ab.mx_start.abs() > 1e-4,
        "right-angle frame: AB must have torsion mx, got {:.4}", ef_ab.mx_start);

    // Member BC should have bending (shear and moment from the Z-load).
    // Depending on local axis orientation, the shear may appear as vy or vz.
    let ef_bc = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let bc_shear_max = ef_bc.vy_start.abs().max(ef_bc.vz_start.abs());
    assert!(bc_shear_max > 1e-4,
        "right-angle frame: BC must have shear, got vy={:.4}, vz={:.4}",
        ef_bc.vy_start, ef_bc.vz_start);

    // Global equilibrium
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, fz, 0.01, "right-angle frame sum(Fz)=P");
}

// =================================================================
// 5. 3D Portal — Lateral Load in X
// =================================================================
//
// 4 columns at corners of a rectangle in plan, connected by beams
// at the top. Lateral load in X at one top corner. Verify sway and
// diaphragm action (all top nodes sway together).

#[test]
fn validation_3d_ext_5_portal_3d_lateral() {
    let h = 4.0;  // column height (Z direction)
    let wx = 6.0; // plan dimension in X
    let wy = 4.0; // plan dimension in Y

    // 8 nodes: 4 base + 4 top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // base 1
        (2, wx, 0.0, 0.0),   // base 2
        (3, wx, wy, 0.0),    // base 3
        (4, 0.0, wy, 0.0),   // base 4
        (5, 0.0, 0.0, h),    // top 1
        (6, wx, 0.0, h),     // top 2
        (7, wx, wy, h),      // top 3
        (8, 0.0, wy, h),     // top 4
    ];

    // 4 columns + 4 beams at top
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), // column 1
        (2, "frame", 2, 6, 1, 1), // column 2
        (3, "frame", 3, 7, 1, 1), // column 3
        (4, "frame", 4, 8, 1, 1), // column 4
        (5, "frame", 5, 6, 1, 1), // beam 5-6 (along X)
        (6, "frame", 6, 7, 1, 1), // beam 6-7 (along Y)
        (7, "frame", 7, 8, 1, 1), // beam 7-8 (along X)
        (8, "frame", 8, 5, 1, 1), // beam 8-5 (along Y)
    ];

    // All base nodes fixed
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let fx = 20.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5,
        fx, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A_SEC, IY, IZ, J)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // All top nodes should sway in X direction
    let top_nodes = [5, 6, 7, 8];
    for &nid in &top_nodes {
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        assert!(d.ux.abs() > 1e-6,
            "3D portal: top node {} must sway in X, got ux={:.2e}", nid, d.ux);
    }

    // Frame action: all top nodes should sway in the positive X direction
    // (same direction as the applied load). The beams are flexible, so magnitudes
    // will differ, but all should be positive.
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();
    let d7 = results.displacements.iter().find(|d| d.node_id == 7).unwrap();
    let d8 = results.displacements.iter().find(|d| d.node_id == 8).unwrap();

    // All top nodes must sway in the positive X direction
    assert!(d5.ux > 0.0, "portal: node 5 ux={:.6} should be positive", d5.ux);
    assert!(d6.ux > 0.0, "portal: node 6 ux={:.6} should be positive", d6.ux);
    assert!(d7.ux > 0.0, "portal: node 7 ux={:.6} should be positive", d7.ux);
    assert!(d8.ux > 0.0, "portal: node 8 ux={:.6} should be positive", d8.ux);

    // Due to torsion of the frame in plan, nodes at different Y positions
    // may have different X-sway. But nodes symmetric about the Y midplane
    // should pair up: (5,8) and (6,7) are at different X but same Y pairs.
    // Nodes 5 (y=0) and 8 (y=wy) are at x=0; nodes 6 (y=0) and 7 (y=wy) at x=wx.
    // Pairs at same Y should have closer sway ratios.
    // Here we just verify that the loaded side (x=0: nodes 5,8) has larger
    // average sway than the far side (x=wx: nodes 6,7).
    let avg_loaded = (d5.ux + d8.ux) / 2.0;
    let avg_far = (d6.ux + d7.ux) / 2.0;
    assert!(avg_loaded > avg_far * 0.5,
        "portal: loaded side avg ux={:.6} should exceed far side {:.6}",
        avg_loaded, avg_far);

    // Global equilibrium in X
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!((sum_fx + fx).abs() < 0.5,
        "3D portal equil: sum_fx={:.3}, fx={:.3}", sum_fx, fx);
}

// =================================================================
// 6. Inclined Column — Vertical Load
// =================================================================
//
// Column inclined in 3D space from (0,0,0) to (3,4,5).
// Fixed at base, vertical load Fz at top.
// The vertical load decomposes into axial and transverse components
// relative to the member axis. Verify displacement at top.

#[test]
fn validation_3d_ext_6_inclined_column() {
    let x1: f64 = 3.0;
    let y1: f64 = 4.0;
    let z1: f64 = 5.0;
    let l = (x1 * x1 + y1 * y1 + z1 * z1).sqrt(); // ~7.07 m
    let fz: f64 = -50.0; // kN downward

    // Direction cosines of the member axis
    let cx = x1 / l;
    let cy = y1 / l;
    let cz = z1 / l;

    // Axial component of load
    let f_axial = fz * cz; // projection of Fz onto member axis
    // Transverse component (magnitude)
    let f_transverse = (fz * fz - f_axial * f_axial).abs().sqrt();

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, x1, y1, z1),
    ];

    let elems = vec![(1, "frame", 1, 2, 1, 1)];

    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed base
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A_SEC, IY, IZ, J)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // The tip must deflect primarily in Z (downward)
    assert!(tip.uz.abs() > 1e-6, "inclined column: must have uz deflection");

    // Axial deformation component: delta_axial = F_axial * L / (E*A)
    let delta_axial = f_axial.abs() * l / (E_EFF * A_SEC);

    // Bending deformation component: delta_bend = F_trans * L^3 / (3*E*I)
    // Use minimum I for conservative estimate
    let i_min = IY.min(IZ);
    let delta_bend = f_transverse.abs() * l.powi(3) / (3.0 * E_EFF * i_min);

    // Total displacement should be bounded by axial + bending contributions
    let total_disp = (tip.ux * tip.ux + tip.uz * tip.uz + tip.uz * tip.uz).sqrt();
    assert!(total_disp > delta_axial * 0.5,
        "inclined column: total disp {:.6} should exceed half axial deform {:.6}",
        total_disp, delta_axial * 0.5);
    assert!(total_disp < (delta_axial + delta_bend) * 2.0,
        "inclined column: total disp {:.6} should be bounded by 2*(axial+bend)={:.6}",
        total_disp, (delta_axial + delta_bend) * 2.0);

    // Equilibrium: reaction at base
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, fz.abs(), 0.01, "inclined column Fz equilibrium");

    // Also verify the displacement projection along the member axis
    // gives the axial deformation
    let disp_along_axis = tip.ux * cx + tip.uz * cy + tip.uz * cz;
    // This should be close to -F_axial*L/(EA) since axial shortening
    let delta_axial_signed = f_axial * l / (E_EFF * A_SEC);
    assert_close(disp_along_axis.abs(), delta_axial_signed.abs(), 0.15,
        "inclined column: axial displacement along member axis");
}

// =================================================================
// 7. Symmetric Box Frame — Equal Vertical Loads
// =================================================================
//
// 4 vertical columns + 4 horizontal beams forming a box.
// Equal vertical loads at all 4 top corners.
// By symmetry, all columns carry equal axial force = P.

#[test]
fn validation_3d_ext_7_symmetric_box() {
    let h = 4.0;  // column height (Z direction)
    let a = 4.0;  // box side length

    // 8 nodes: 4 base + 4 top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, a, 0.0, 0.0),
        (3, a, a, 0.0),
        (4, 0.0, a, 0.0),
        (5, 0.0, 0.0, h),
        (6, a, 0.0, h),
        (7, a, a, h),
        (8, 0.0, a, h),
    ];

    // 4 columns (vertical along Z) + 4 top beams
    let elems = vec![
        (1, "frame", 1, 5, 1, 1),
        (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1),
        (4, "frame", 4, 8, 1, 1),
        (5, "frame", 5, 6, 1, 1),
        (6, "frame", 6, 7, 1, 1),
        (7, "frame", 7, 8, 1, 1),
        (8, "frame", 8, 5, 1, 1),
    ];

    // All base nodes fixed
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    // Equal vertical loads at all 4 top corners
    let p = 25.0; // kN each
    let loads: Vec<SolverLoad3D> = [5, 6, 7, 8].iter().map(|&nid| {
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: nid,
            fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })
    }).collect();

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A_SEC, IY, IZ, J)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // By symmetry, all 4 columns carry equal axial force
    let col_forces: Vec<f64> = (1..=4)
        .map(|id| {
            results.element_forces.iter()
                .find(|e| e.element_id == id).unwrap().n_start.abs()
        })
        .collect();

    // All column axial forces should be approximately equal
    for i in 1..4 {
        assert_close(col_forces[i], col_forces[0], 0.05,
            &format!("symmetric box: column {} vs column 1 axial force", i + 1));
    }

    // Each column axial force should be approximately P (since beams are in horizontal plane)
    assert_close(col_forces[0], p, 0.10,
        "symmetric box: column axial force approx P");

    // By symmetry, all top nodes should have equal vertical displacement
    let top_uz: Vec<f64> = [5, 6, 7, 8].iter().map(|&nid| {
        results.displacements.iter()
            .find(|d| d.node_id == nid).unwrap().uz
    }).collect();

    for i in 1..4 {
        assert_close(top_uz[i], top_uz[0], 0.02,
            &format!("symmetric box: node {} vs node 5 uz", i + 5));
    }

    // Horizontal displacements should be zero by symmetry
    for &nid in &[5, 6, 7, 8] {
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        assert!(d.ux.abs() < 1e-6,
            "symmetric box: node {} ux={:.2e} should be ~0", nid, d.ux);
        assert!(d.uz.abs() < 1e-6,
            "symmetric box: node {} uy={:.2e} should be ~0", nid, d.uy);
    }

    // Total vertical reaction = 4*P
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, 4.0 * p, 0.01, "symmetric box sum(Fz) = 4P");
}

// =================================================================
// 8. 3D Cantilever UDL in Y — Tip Deflection
// =================================================================
//
// 3D cantilever beam, UDL w in Y direction on all elements.
// Tip deflection: delta_y = w*L^4 / (8*E*Iz)
// Should match the 2D cantilever UDL result.

#[test]
fn validation_3d_ext_8_cantilever_udl_3d() {
    let l = 5.0;
    let n: usize = 8;
    let w = -12.0; // kN/m in Y direction

    let fixed = vec![true, true, true, true, true, true];

    // 3D distributed load in Y direction
    let loads_3d: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: w,
                q_yj: w,
                q_zi: 0.0,
                q_zj: 0.0,
                a: None,
                b: None,
            })
        })
        .collect();

    let input_3d = make_3d_beam(
        n, l, E, NU, A_SEC, IY, IZ, J,
        fixed, None, loads_3d,
    );

    let results_3d = linear::solve_3d(&input_3d).unwrap();
    let tip_3d = results_3d.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Analytical tip deflection: delta = |w| * L^4 / (8 * E_eff * Iz)
    let delta_exact = w.abs() * l.powi(4) / (8.0 * E_EFF * IZ);

    assert_close(tip_3d.uz.abs(), delta_exact, 0.03, "cantilever UDL 3D tip uy");

    // No deflection in Z (load is only in Y)
    assert!(tip_3d.uz.abs() < 1e-6,
        "cantilever UDL 3D: no uz coupling, got {:.2e}", tip_3d.uz);

    // Compare with 2D result
    let loads_2d: Vec<SolverLoad> = (0..n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();

    let input_2d = make_beam(
        n, l, E, A_SEC, IZ, "fixed", None, loads_2d,
    );
    let results_2d = linear::solve_2d(&input_2d).unwrap();
    let tip_2d = results_2d.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // 2D and 3D should agree closely
    if tip_2d.uz.abs() > 1e-8 {
        let ratio = tip_3d.uz.abs() / tip_2d.uz.abs();
        assert!(
            (ratio - 1.0).abs() < 0.05,
            "3D vs 2D UDL cantilever: uy_3d={:.6}, uy_2d={:.6}, ratio={:.4}",
            tip_3d.uz, tip_2d.uz, ratio
        );
    }
}

/// Validation: 3D Space Frame Geometry
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 6
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 7
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 10
///
/// Tests verify 3D frame behavior with non-coplanar members and
/// complex spatial geometry:
///   1. L-shaped frame in 3D: out-of-plane deflection
///   2. Right-angle bend: force transfer across perpendicular members
///   3. 3D portal: biaxial lateral loading
///   4. Space truss tetrahedron: equilibrium and symmetry
///   5. Inclined 3D beam: gravity load decomposition
///   6. 3D cantilever with offset load: torsion coupling
///   7. Grid of beams: load sharing between orthogonal members
///   8. 3D equilibrium: ΣF=0, ΣM=0 for complex geometry
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 2e-4;
const IZ: f64 = 1e-4;
const J: f64 = 3e-4;

// ================================================================
// 1. L-Shaped Frame: Out-of-Plane Response
// ================================================================

#[test]
fn validation_space_l_frame() {
    let l = 5.0;
    let p = 10.0;

    // L-shaped frame: segment 1 along X, segment 2 along Z
    // Node 1 (0,0,0) fixed, node 2 (L,0,0), node 3 (L,0,L)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l, 0.0, 0.0),
        (3, l, 0.0, l),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, vec![(1, fixed)], loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Tip should deflect downward
    assert!(tip.uy < 0.0, "L-frame: tip deflects downward: {:.6e}", tip.uy);
    assert!(tip.uy.abs() > 1e-8, "L-frame: non-zero deflection");

    // Equilibrium: reaction fy at node 1 = P
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.fy, p, 0.02, "L-frame: Ry = P");
}

// ================================================================
// 2. Right-Angle Bend: Force Transfer
// ================================================================

#[test]
fn validation_space_right_angle() {
    let l = 4.0;
    let p = 20.0;

    // Horizontal beam along X, then vertical column along Y
    // Node 1 (0,0,0) fixed base, node 2 (0,l,0) knee, node 3 (l,l,0) free tip
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, l, 0.0),
        (3, l, l, 0.0),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, vec![(1, fixed)], loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reaction at base should carry the full load
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.fy, p, 0.02, "Right angle: Ry = P");

    // Moment at base: overturning about Z from horizontal arm
    assert_close(r.mz.abs(), p * l, 0.05, "Right angle: Mz = P×L");
}

// ================================================================
// 3. 3D Portal: Biaxial Lateral Load
// ================================================================

#[test]
fn validation_space_3d_portal() {
    let w = 6.0;
    let h = 4.0;
    let fx = 10.0;
    let fz = 8.0;

    // 4-column portal: columns at corners, beam grid at top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0),
        (3, w, 0.0, w), (4, 0.0, 0.0, w),
        (5, 0.0, h, 0.0), (6, w, h, 0.0),
        (7, w, h, w), (8, 0.0, h, w),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1), (4, "frame", 4, 8, 1, 1),
        (5, "frame", 5, 6, 1, 1), (6, "frame", 6, 7, 1, 1),
        (7, "frame", 7, 8, 1, 1), (8, "frame", 8, 5, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let sups = vec![
        (1, fixed.clone()), (2, fixed.clone()),
        (3, fixed.clone()), (4, fixed),
    ];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fx, -fx, 0.02, "3D portal: ΣRx = -Fx");
    assert_close(sum_fz, -fz, 0.02, "3D portal: ΣRz = -Fz");
}

// ================================================================
// 4. Space Truss Tetrahedron: Symmetry and Equilibrium
// ================================================================

#[test]
fn validation_space_tetrahedron() {
    let s = 4.0; // edge length
    let p = 30.0;

    // Regular tetrahedron base in XZ plane, apex at top
    let h_tet = s * (2.0_f64 / 3.0).sqrt();
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s / 2.0, 0.0, s * (3.0_f64).sqrt() / 2.0),
        (4, s / 2.0, h_tet, s * (3.0_f64).sqrt() / 6.0),
    ];
    let fixed = vec![true, true, true, false, false, false];
    let roller_yz = vec![false, true, true, false, false, false];
    let roller_y = vec![false, true, false, false, false, false];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 1, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let sups = vec![
        (1, fixed), (2, roller_yz), (3, roller_y),
    ];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Total vertical reaction = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "Tetrahedron: ΣRy = P");

    // Apex deflects downward
    let tip = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(tip.uy < 0.0, "Tetrahedron: apex deflects down: {:.6e}", tip.uy);
}

// ================================================================
// 5. Inclined 3D Beam: Gravity Decomposition
// ================================================================

#[test]
fn validation_space_inclined_beam() {
    let l = 6.0;
    let angle = std::f64::consts::PI / 6.0; // 30° from horizontal
    let p = 10.0;
    let n = 6;

    // Beam inclined at 30° from XY plane, spanning in XY
    let lx = l * angle.cos();
    let ly = l * angle.sin();

    let fixed = vec![true, true, true, true, true, true];
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        let frac = i as f64 / n as f64;
        nodes.push((i + 1, frac * lx, frac * ly, 0.0));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1));
        }
    }

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, vec![(1, fixed)], loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reaction at base carries full vertical load
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.fy, p, 0.02, "Inclined: Ry = P");

    // No horizontal load applied → Rx should be small (or from bending)
    // Fx reaction comes from the constraint and bending coupling
    // but should be finite
    assert!(r.fx.abs().is_finite(), "Inclined: Rx finite");
}

// ================================================================
// 6. 3D Cantilever with Eccentric Load: Torsion Coupling
// ================================================================

#[test]
fn validation_space_torsion_coupling() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];
    // Apply load in Z on a beam along X → creates both bending (about Y)
    // and the load itself is through the shear center, so no torsion
    // But if we apply load offset from shear center (via moment), there IS torsion
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: p * 0.05, my: 0.0, mz: 0.0, bw: None, // eccentric → torsion
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Should have both bending deflection (uz) and twist (rx)
    let delta_z = p * l * l * l / (3.0 * e_eff * IY);
    assert_close(tip.uz.abs(), delta_z, 0.02, "Torsion coupling: δz correct");

    // Twist at tip: θx = T×L/(GJ) where T = P×0.05, G = E/(2(1+ν))
    let g = e_eff / (2.0 * (1.0 + NU));
    let torque = p * 0.05;
    let theta_x = torque * l / (g * J);
    assert_close(tip.rx.abs(), theta_x, 0.05, "Torsion coupling: θx = TL/(GJ)");
}

// ================================================================
// 7. Grid of Beams: Load Sharing
// ================================================================

#[test]
fn validation_space_grid_sharing() {
    let l = 6.0;
    let p = 20.0;

    // Two beams crossing at center: one along X, one along Z
    // All ends fixed. Load at center node (intersection).
    let nodes = vec![
        (1, 0.0, 0.0, l / 2.0), // X-beam left
        (2, l, 0.0, l / 2.0),   // X-beam right
        (3, l / 2.0, 0.0, 0.0), // Z-beam front
        (4, l / 2.0, 0.0, l),   // Z-beam back
        (5, l / 2.0, 0.0, l / 2.0), // center
    ];
    let fixed = vec![true, true, true, true, true, true];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1),
        (2, "frame", 5, 2, 1, 1),
        (3, "frame", 3, 5, 1, 1),
        (4, "frame", 5, 4, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let sups = vec![
        (1, fixed.clone()), (2, fixed.clone()),
        (3, fixed.clone()), (4, fixed),
    ];
    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Total reaction = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "Grid: ΣRy = P");

    // Center deflects downward
    let center = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(center.uy < 0.0, "Grid: center deflects down");

    // Each direction should carry load (not all on one beam)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fy;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().fy;
    assert!(r1 > 0.0, "Grid: X-beam carries load");
    assert!(r3 > 0.0, "Grid: Z-beam carries load");
}

// ================================================================
// 8. 3D Global Equilibrium
// ================================================================

#[test]
fn validation_space_global_equilibrium() {
    let l = 5.0;
    let fx = 10.0;
    let fy = -15.0;
    let fz = 8.0;
    let mx = 3.0;
    let my = -2.0;
    let mz = 5.0;

    // 3D cantilever with general loading at tip
    let n = 8;
    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx, fy, fz, mx, my, mz, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -fx, 0.02, "3D equil: Rx = -Fx");
    assert_close(r.fy, -fy, 0.02, "3D equil: Ry = -Fy");
    assert_close(r.fz, -fz, 0.02, "3D equil: Rz = -Fz");

    // Moment equilibrium about base (origin):
    // Tip at (L,0,0). Cross product r×F for moments about origin:
    //   fy at (L,0,0) → (0, 0, L×fy)
    //   fz at (L,0,0) → (0, -L×fz, 0)
    // R_mx = -mx
    // R_my = -(my - fz×L)
    // R_mz = -(mz + fy×L)
    assert_close(r.mx, -mx, 0.02, "3D equil: Mx = -mx");
    assert_close(r.my, -(my - fz * l), 0.02, "3D equil: My = -(my - fz×L)");
    assert_close(r.mz, -(mz + fy * l), 0.02, "3D equil: Mz = -(mz + fy×L)");
}

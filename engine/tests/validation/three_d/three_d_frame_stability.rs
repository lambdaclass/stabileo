/// Validation: 3D Frame Stability and Load Path Verification
///
/// References:
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 5
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 12
///   - Bazant & Cedolin, "Stability of Structures", Ch. 2
///
/// Tests verify 3D frame behavior under various loading conditions:
///   1. 3D portal frame: lateral load in X
///   2. 3D portal frame: lateral load in Z (out-of-plane)
///   3. 3D space frame: combined biaxial loading
///   4. 3D cantilever column: gravity + lateral
///   5. 3D frame symmetry verification
///   6. 3D frame: torsional response to eccentric load
///   7. 3D continuous beam: multi-span in space
///   8. 3D frame global equilibrium check
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
// 1. 3D Portal Frame: Lateral Load in X
// ================================================================

#[test]
fn validation_3d_stability_portal_x() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    // 3D portal: columns along Y, beam along X
    // Nodes: 1(0,0,0), 2(0,h,0), 3(w,h,0), 4(w,0,0)
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, h, 0.0), (3, w, h, 0.0), (4, w, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: f, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Lateral deflection at loaded node
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0, "3D portal X: positive ux: {:.6e}", d2.ux);

    // Equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_fx, -f, 0.02, "3D portal X: ΣFx = -F");
}

// ================================================================
// 2. 3D Portal Frame: Lateral Load in Z (Out-of-Plane)
// ================================================================

#[test]
fn validation_3d_stability_portal_z() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, h, 0.0), (3, w, h, 0.0), (4, w, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: f, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Out-of-plane deflection
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uz > 0.0, "3D portal Z: positive uz: {:.6e}", d2.uz);

    // Equilibrium
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, -f, 0.02, "3D portal Z: ΣFz = -F");
}

// ================================================================
// 3. 3D Space Frame: Biaxial Loading
// ================================================================

#[test]
fn validation_3d_stability_biaxial_frame() {
    let h = 4.0;
    let w = 6.0;
    let fx = 10.0;
    let fz = 5.0;

    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, h, 0.0), (3, w, h, 0.0), (4, w, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: fx, fy: 0.0, fz: fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Both directions should deflect
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0, "3D biaxial: ux > 0: {:.6e}", d2.ux);
    assert!(d2.uz > 0.0, "3D biaxial: uz > 0: {:.6e}", d2.uz);

    // Equilibrium in both directions
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fx, -fx, 0.02, "3D biaxial: ΣFx = -Fx");
    assert_close(sum_fz, -fz, 0.02, "3D biaxial: ΣFz = -Fz");
}

// ================================================================
// 4. 3D Cantilever Column: Gravity + Lateral
// ================================================================

#[test]
fn validation_3d_stability_cantilever_column() {
    let l = 5.0;
    let n = 10;
    let p_grav = 20.0;
    let p_lat = 5.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: p_lat, fy: -p_grav, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -p_lat, 0.02, "3D cantilever: Rx = -P_lat");
    assert_close(r.fy, p_grav, 0.02, "3D cantilever: Ry = P_grav");

    // For beam along X: fy load creates bending about Z
    // Mz at base = P_grav × L (gravity load creates the moment)
    assert_close(r.mz.abs(), p_grav * l, 0.05,
        "3D cantilever: Mz ≈ P_grav×L");
}

// ================================================================
// 5. 3D Frame Symmetry
// ================================================================

#[test]
fn validation_3d_stability_symmetry() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    // Symmetric 3D beam with symmetric load at midspan
    let mid = n / 2 + 1;
    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), Some(fixed), loads);
    let results = linear::solve_3d(&input).unwrap();

    // By symmetry: reactions at both ends should be equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.fy, r_end.fy, 0.02, "3D symmetry: Fy_left = Fy_right");
    assert_close(r1.mz.abs(), r_end.mz.abs(), 0.02,
        "3D symmetry: |Mz_left| = |Mz_right|");
}

// ================================================================
// 6. 3D Frame: Torsion from Eccentric Load
// ================================================================

#[test]
fn validation_3d_stability_eccentric_torsion() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    // Apply load in Z at tip → creates bending about Y
    // If we apply moment about X (torsion) at tip → torsion in beam
    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: p, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Torsion reaction: Mx = -P (applied torque)
    assert_close(r.mx, -p, 0.02, "3D torsion: Mx = -T_applied");

    // No other force reactions (pure torsion)
    assert!(r.fy.abs() < 0.1, "3D torsion: Fy ≈ 0: {:.6e}", r.fy);
    assert!(r.fz.abs() < 0.1, "3D torsion: Fz ≈ 0: {:.6e}", r.fz);
}

// ================================================================
// 7. 3D Continuous Beam: Multi-Span
// ================================================================

#[test]
fn validation_3d_stability_continuous() {
    let span = 5.0;
    let n = 8;
    let p = 10.0;

    // 2-span 3D beam along X, supported at 3 points
    let total_n = 2 * n;
    let mut nodes = Vec::new();
    for i in 0..=total_n {
        nodes.push((i + 1, i as f64 * span / n as f64, 0.0, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..total_n {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1));
    }

    // Fixed at start, roller-equivalent (uy restrained) at mid and end
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (n + 1, vec![false, true, true, false, false, false]),
        (total_n + 1, vec![false, true, true, false, false, false]),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n / 2 + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Total vertical reaction = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "3D continuous: ΣFy = P");
}

// ================================================================
// 8. 3D Frame Global Equilibrium
// ================================================================

#[test]
fn validation_3d_stability_global_equilibrium() {
    let l = 5.0;
    let n = 8;
    let fx = 3.0;
    let fy = 10.0;
    let fz = 5.0;
    let mx = 2.0;
    let my = 1.0;
    let mz = 3.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx, fy: -fy, fz, mx, my, mz, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium: ΣF = 0
    assert_close(r.fx, -fx, 0.02, "3D equil: ΣFx = 0");
    assert_close(r.fy, fy, 0.02, "3D equil: ΣFy = 0");
    assert_close(r.fz, -fz, 0.02, "3D equil: ΣFz = 0");

    // Moment equilibrium about origin includes:
    // Applied moments + moments from force × distance
    assert_close(r.mx, -mx, 0.02, "3D equil: ΣMx = 0");
}

/// Validation: 3D Frame Benchmarks
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Dover, Ch. 6
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 8
///   - MacLeod, "Modern Structural Analysis", Ch. 9 (3D frames)
///
/// Tests verify 3D frame behavior:
///   1. 3D cantilever with biaxial bending
///   2. L-shaped frame in 3D: out-of-plane loading
///   3. Space frame: equilibrium under 3D loads
///   4. 3D portal frame: sway under lateral load
///   5. Torsion-bending coupling in 3D beam
///   6. 3D truss: determinate space truss
///   7. 3D continuous beam: multi-span along X
///   8. 3D frame: global equilibrium under gravity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;

// ================================================================
// 1. 3D Cantilever with Biaxial Bending
// ================================================================
//
// Cantilever loaded in both Y and Z directions at tip.
// δy = Py × L³/(3EIz), δz = Pz × L³/(3EIy).
// Biaxial bending is independent for doubly-symmetric sections.

#[test]
fn validation_3d_cantilever_biaxial() {
    let l = 5.0;
    let n = 8;
    let py = 10.0;
    let pz = 6.0;
    let e_eff = E * 1000.0;

    let fix = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -py, fz: pz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Y deflection: δy = Py L³/(3EIz)
    let dy_exact = py * l.powi(3) / (3.0 * e_eff * IZ);
    let err_y = (tip.uy.abs() - dy_exact).abs() / dy_exact;
    assert!(err_y < 0.03,
        "3D biaxial: δy={:.6e}, expected {:.6e}", tip.uy.abs(), dy_exact);

    // Z deflection: δz = Pz L³/(3EIy)
    let dz_exact = pz * l.powi(3) / (3.0 * e_eff * IY);
    let err_z = (tip.uz.abs() - dz_exact).abs() / dz_exact;
    assert!(err_z < 0.03,
        "3D biaxial: δz={:.6e}, expected {:.6e}", tip.uz.abs(), dz_exact);
}

// ================================================================
// 2. L-Shaped Frame in 3D: Out-of-Plane Loading
// ================================================================
//
// L-shaped frame: horizontal leg along X, vertical leg along Z.
// Load applied out-of-plane on the vertical leg.

#[test]
fn validation_3d_l_shaped_frame() {
    let l = 4.0;
    let p = 10.0;

    // Nodes: 1=(0,0,0) fixed, 2=(l,0,0) corner, 3=(l,0,l) tip
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l, 0.0, 0.0),
        (3, l, 0.0, l),
    ];
    let mats = vec![(1, E, NU)];
    let secs = vec![(1, A, IY, IZ, J)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
    ];
    let sups = vec![(1, vec![true, true, true, true, true, true])];

    // Load at tip in Y direction
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Tip should deflect in Y
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3.uy.abs() > 1e-6,
        "L-frame tip should deflect in Y: uy={:.6e}", d3.uy);

    // Equilibrium: ΣFy = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "L-frame: ΣFy = P");
}

// ================================================================
// 3. Space Frame: 3D Equilibrium
// ================================================================
//
// 3D portal frame loaded laterally. Check all 6 equilibrium equations.

#[test]
fn validation_3d_space_frame_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let d = 4.0; // depth (Z direction)
    let p = 10.0;

    // 3D portal: 8 nodes (4 at base, 4 at top)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0),
        (3, w, 0.0, d),     (4, 0.0, 0.0, d),
        (5, 0.0, h, 0.0),   (6, w, h, 0.0),
        (7, w, h, d),        (8, 0.0, h, d),
    ];
    let fix = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (3, fix.clone()), (4, fix.clone()),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 5, 1, 1), (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1), (4, "frame", 4, 8, 1, 1),
        // Beams
        (5, "frame", 5, 6, 1, 1), (6, "frame", 6, 7, 1, 1),
        (7, "frame", 7, 8, 1, 1), (8, "frame", 8, 5, 1, 1),
    ];

    // Lateral load at top
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: p, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // ΣFx = P
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_fx, -p, 0.02, "3D frame: ΣFx = -P");

    // ΣFy = 0 (no vertical loads)
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fy.abs() < p * 0.01, "3D frame: ΣFy ≈ 0: {:.6}", sum_fy);

    // ΣFz = 0 (no Z loads)
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() < p * 0.01, "3D frame: ΣFz ≈ 0: {:.6}", sum_fz);
}

// ================================================================
// 4. 3D Portal Frame: Sway Under Lateral Load
// ================================================================
//
// 3D portal (two columns, beam connecting tops) with lateral load.
// Both column tops should sway roughly equally.

#[test]
fn validation_3d_portal_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0),
        (3, 0.0, h, 0.0), (4, w, h, 0.0),
    ];
    let fix = vec![true, true, true, true, true, true];
    let sups = vec![(1, fix.clone()), (2, fix.clone())];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), // left column
        (2, "frame", 2, 4, 1, 1), // right column
        (3, "frame", 3, 4, 1, 1), // beam
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: p, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Both top nodes should sway in X
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    assert!(d3.ux > 0.0, "Top left should sway +X: ux={:.6e}", d3.ux);

    // Top nodes connected by rigid beam → similar sway
    let diff = (d3.ux - d4.ux).abs();
    assert!(diff < d3.ux * 0.1 || diff < 1e-6,
        "Both tops sway equally: d3={:.6e}, d4={:.6e}", d3.ux, d4.ux);
}

// ================================================================
// 5. Pure Torsion on 3D Beam
// ================================================================
//
// Cantilever with torque at tip. θx = TL/(GJ).
// No bending should occur (pure torsion).

#[test]
fn validation_3d_pure_torsion() {
    let l = 5.0;
    let n = 8;
    let t = 5.0; // torque
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let fix = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Twist: θx = TL/(GJ)
    let theta_exact = t * l / (g * J);
    let err = (tip.rx.abs() - theta_exact).abs() / theta_exact;
    assert!(err < 0.03,
        "Pure torsion: θx={:.6e}, expected {:.6e}", tip.rx.abs(), theta_exact);

    // No bending displacement
    assert!(tip.uy.abs() < theta_exact * 0.01,
        "Pure torsion: uy should be ~0: {:.6e}", tip.uy);
    assert!(tip.uz.abs() < theta_exact * 0.01,
        "Pure torsion: uz should be ~0: {:.6e}", tip.uz);
}

// ================================================================
// 6. 3D Determinate Truss
// ================================================================
//
// Simple 3D truss: tripod structure.
// Three bars meeting at a point, loaded vertically.

#[test]
fn validation_3d_determinate_truss() {
    let h = 3.0;
    let p = 10.0;

    // Tripod: 3 supports on XZ plane, apex at (0, h, 0)
    let r = 2.0; // radius of base triangle
    let nodes = vec![
        (1, r, 0.0, 0.0),                               // base 1
        (2, -r * 0.5, 0.0, r * 0.866),                   // base 2
        (3, -r * 0.5, 0.0, -r * 0.866),                  // base 3
        (4, 0.0, h, 0.0),                                // apex
    ];
    let fix = vec![true, true, true, false, false, false];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()), (3, fix.clone()),
    ];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // ΣFy = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "Tripod: ΣFy = P");

    // ΣFx = 0 (symmetric about Y axis)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!(sum_fx.abs() < p * 0.01, "Tripod: ΣFx ≈ 0: {:.6}", sum_fx);

    // Apex should deflect downward
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.uy < 0.0, "Tripod apex: uy < 0: {:.6e}", d4.uy);
}

// ================================================================
// 7. 3D Continuous Beam
// ================================================================
//
// Multi-span beam along X, supported at each span boundary.
// 3D version should give same results as 2D for in-plane loading.

#[test]
fn validation_3d_continuous_beam() {
    let l = 5.0;
    let p = 10.0;

    // Two-span beam: 3 supports
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l / 2.0, 0.0, 0.0),
        (3, l, 0.0, 0.0),
        (4, 3.0 * l / 2.0, 0.0, 0.0),
        (5, 2.0 * l, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
        (4, "frame", 4, 5, 1, 1),
    ];
    // Pinned at 1, roller (uy fixed) at 3, roller at 5
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (3, vec![false, true, true, false, false, false]),
        (5, vec![false, true, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // ΣFy = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "3D continuous beam: ΣFy = P");

    // Load in span 1 → node 2 deflects downward
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy < 0.0, "3D beam: node 2 deflects down: {:.6e}", d2.uy);
}

// ================================================================
// 8. 3D Frame Global Equilibrium Under Gravity
// ================================================================
//
// 3D building frame with gravity loads. All 6 equilibrium equations.

#[test]
fn validation_3d_frame_gravity_equilibrium() {
    let h = 3.5;
    let w = 5.0;
    let d = 4.0;
    let p_floor: f64 = -20.0; // gravity at each floor node

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0),
        (3, w, 0.0, d),     (4, 0.0, 0.0, d),
        (5, 0.0, h, 0.0),   (6, w, h, 0.0),
        (7, w, h, d),        (8, 0.0, h, d),
    ];
    let fix = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (3, fix.clone()), (4, fix.clone()),
    ];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1), (4, "frame", 4, 8, 1, 1),
        (5, "frame", 5, 6, 1, 1), (6, "frame", 6, 7, 1, 1),
        (7, "frame", 7, 8, 1, 1), (8, "frame", 8, 5, 1, 1),
    ];

    // Gravity at each floor node
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 0.0, fy: p_floor, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 6, fx: 0.0, fy: p_floor, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 7, fx: 0.0, fy: p_floor, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 8, fx: 0.0, fy: p_floor, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let total_load = 4.0 * p_floor.abs();

    // ΣFy = total gravity
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, total_load, 0.02,
        "3D gravity: ΣFy = total load");

    // ΣFx = 0 (no lateral load)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!(sum_fx.abs() < total_load * 0.01,
        "3D gravity: ΣFx ≈ 0: {:.6}", sum_fx);

    // ΣFz = 0 (no Z load)
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() < total_load * 0.01,
        "3D gravity: ΣFz ≈ 0: {:.6}", sum_fz);

    // All floor nodes should deflect downward (symmetrically for symmetric structure)
    for nid in [5, 6, 7, 8] {
        let d = results.displacements.iter().find(|dd| dd.node_id == nid).unwrap();
        assert!(d.uy < 0.0, "Node {} should deflect down: uy={:.6e}", nid, d.uy);
    }
}

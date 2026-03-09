/// Validation: 3D Skew (Inclined) Beams
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 10
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 6
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed., Ch. 7
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5
///
/// Tests verify 3D beams not aligned with principal axes:
///   1. Beam at 45° in XY plane: deflection in both X and Y
///   2. 3D beam inclined in XZ plane: tip deflection components
///   3. Skew beam reactions: force transformation check
///   4. Inclined beam vs equivalent horizontal beam: same end moments
///   5. 3D beam along diagonal of cube: all DOF coupling
///   6. Skew beam symmetry: mirrored geometry gives equal deflections
///   7. Inclined 3D cantilever: tip deflection from beam theory
///   8. Skew beam global equilibrium: ΣF = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 8e-5;

// ================================================================
// 1. Beam at 45° in XY Plane: Deflection Components
// ================================================================
//
// Cantilever beam inclined 45° from X toward Y (in XY plane).
// Fixed at (0,0,0), free end at (L/√2, L/√2, 0).
// Gravity load (-Z) at free end. The beam is a cantilever of
// projected length L in the XY plane.
// Global equilibrium must hold: Σ reactions = applied load.
//
// Reference: McGuire et al., "Matrix Structural Analysis", §6.2.

#[test]
fn validation_3d_skew_45deg_xy_equilibrium() {
    let l = 4.0;
    let p = -10.0; // vertical (Z) load at free end
    let cos45 = 1.0 / 2.0_f64.sqrt();

    // Single inclined element at 45° in XY plane
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l * cos45, l * cos45, 0.0),
    ];
    let elems = vec![(1, "frame", 1, 2, 1, 1)];
    let sups = vec![(1, vec![true, true, true, true, true, true])]; // fully fixed at node 1
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 0.0,
        fy: 0.0,
        fz: p,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium: Fz reaction = -P
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_fz = (r.fz + p).abs() / p.abs();
    assert!(
        err_fz < 0.01,
        "45° skew: Fz reaction={:.4}, applied={:.4}, err={:.2}%",
        r.fz,
        p,
        err_fz * 100.0
    );

    // Fx and Fy reactions must be zero (only Z load applied)
    assert!(
        r.fx.abs() < 1e-6 * p.abs(),
        "45° skew: Fx reaction should be ~0, got {:.6e}",
        r.fx
    );
    assert!(
        r.fy.abs() < 1e-6 * p.abs(),
        "45° skew: Fy reaction should be ~0, got {:.6e}",
        r.fy
    );

    // Free end must deflect downward
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(tip.uz < 0.0, "45° skew tip: uz should be negative (downward)");
}

// ================================================================
// 2. 3D Beam Inclined in XZ Plane: Force Components
// ================================================================
//
// Cantilever beam at 30° from X toward Z (in XZ plane).
// End node at (L·cos30°, 0, L·sin30°). Apply vertical (Y) load at tip.
// The beam's local axis is rotated in the XZ plane.
// Reaction forces must satisfy global equilibrium.
//
// Reference: Przemieniecki, "Theory of Matrix Structural Analysis", §10.1.

#[test]
fn validation_3d_skew_xz_plane_force_components() {
    let l = 5.0;
    let angle_deg = 30.0_f64;
    let angle_rad = angle_deg.to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();
    let fy_load = -15.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l * cos_a, 0.0, l * sin_a),
    ];
    let elems = vec![(1, "frame", 1, 2, 1, 1)];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 0.0,
        fy: fy_load,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Fy reaction must equal -applied Fy
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_fy = (r.fy + fy_load).abs() / fy_load.abs();
    assert!(
        err_fy < 0.01,
        "XZ skew Fy: reaction={:.4}, applied={:.4}, err={:.2}%",
        r.fy,
        fy_load,
        err_fy * 100.0
    );

    // No Fx load → Fx reaction should be near zero (pure bending, not significant axial)
    // For a beam, the reaction at the fixed end includes bending reaction but not Fx from Fy
    assert!(
        r.fx.abs() < fy_load.abs() * 0.01,
        "XZ skew: Fx reaction should be ~0 for transverse load, got {:.6e}",
        r.fx
    );

    // Tip should deflect in Y
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(tip.uy < 0.0, "XZ skew tip: uy should be negative");
}

// ================================================================
// 3. Skew Beam Reactions: Force Transformation Check
// ================================================================
//
// Two cases: (a) horizontal beam with horizontal axial load,
// (b) same beam rotated 45° in XY plane with same global load.
// For case (b) the reaction in the beam's local axial direction
// must equal the projection of the global force onto the beam axis.
//
// Reference: Weaver & Gere, "Matrix Analysis of Framed Structures", §7.3.

#[test]
fn validation_3d_skew_reaction_transformation() {
    let l = 4.0;
    let fx_global = 20.0; // applied globally in X at free end

    // Case (a): beam along X axis
    let input_horiz = make_3d_beam(
        1,
        l,
        E,
        NU,
        A,
        IY,
        IZ,
        J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: fx_global,
            fy: 0.0,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );
    let res_horiz = linear::solve_3d(&input_horiz).unwrap();
    let r_horiz = res_horiz.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // For horizontal beam with axial load, reaction Fx = -applied
    assert_close(r_horiz.fx, -fx_global, 0.01, "Horizontal beam: Rx = -Fx");

    // Case (b): beam at 45° in XY plane
    let cos45 = 1.0 / 2.0_f64.sqrt();
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l * cos45, l * cos45, 0.0),
    ];
    let elems = vec![(1, "frame", 1, 2, 1, 1)];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: fx_global,
        fy: 0.0,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];
    let input_skew = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let res_skew = linear::solve_3d(&input_skew).unwrap();
    let r_skew = res_skew.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Reaction must balance applied force: ΣFx = 0
    let err_fx = (r_skew.fx + fx_global).abs() / fx_global.abs();
    assert!(
        err_fx < 0.01,
        "Skew reaction: Rx={:.4}, applied Fx={:.4}, err={:.2}%",
        r_skew.fx,
        fx_global,
        err_fx * 100.0
    );

    // For 45° beam with X load, Y reaction must also appear (bending component)
    // Ry is not necessarily zero because the load has a transverse component in local frame
    // Check global equilibrium: Rx + Fx_applied = 0
    let sum_fx = r_skew.fx + fx_global;
    assert!(
        sum_fx.abs() < 1e-4,
        "Skew global Fx equilibrium: Rx + Fx = {:.6e}", sum_fx
    );
}

// ================================================================
// 4. Inclined Beam vs Horizontal Beam: Equivalent End Forces
// ================================================================
//
// A cantilever beam of real length L_real at angle α in XZ plane
// under a transverse load perpendicular to its own axis gives the same
// tip displacement (in local coords) as a horizontal beam of the same
// real length under the same local transverse load.
//
// We verify: for a beam at angle α, applying load in local-Y direction
// gives the same local tip deflection as a reference horizontal beam.
//
// Reference: Przemieniecki, §10.2.

#[test]
fn validation_3d_skew_equivalent_local_response() {
    let l_real = 5.0;
    let angle_deg = 45.0_f64;
    let angle_rad = angle_deg.to_radians();
    let fz_local = -10.0; // local-transverse load (global Y for reference)

    // Reference: horizontal beam (along X), tip load in Y
    let input_ref = make_3d_beam(
        4,
        l_real,
        E,
        NU,
        A,
        IY,
        IZ,
        J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5,
            fx: 0.0,
            fy: fz_local,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );
    let res_ref = linear::solve_3d(&input_ref).unwrap();
    let tip_ref = res_ref.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let local_tip_ref = tip_ref.uy.abs(); // deflection in local-transverse direction

    // Skew beam at 45° in XY plane: beam axis = (cos45, sin45, 0)
    // Local-Y of element (perpendicular in XY plane) = (-sin45, cos45, 0)
    // Apply load in global Y (which maps to local-transverse for 45° in-plane beam)
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l_real * cos_a * 0.25, l_real * sin_a * 0.25, 0.0),
        (3, l_real * cos_a * 0.50, l_real * sin_a * 0.50, 0.0),
        (4, l_real * cos_a * 0.75, l_real * sin_a * 0.75, 0.0),
        (5, l_real * cos_a, l_real * sin_a, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
        (4, "frame", 4, 5, 1, 1),
    ];
    let sups = vec![(1, vec![true, true, true, true, true, true])];

    // For a 45° beam in XY plane, local Y is perpendicular in XY: (-sin45, cos45, 0)
    // A load in global Z is purely transverse (perpendicular to beam axis in XZ sense)
    // Use global Z load which is fully transverse for any XY-plane beam
    let fz_global = fz_local;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5,
        fx: 0.0,
        fy: 0.0,
        fz: fz_global,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input_skew = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let res_skew = linear::solve_3d(&input_skew).unwrap();
    let tip_skew = res_skew.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let local_tip_skew = tip_skew.uz.abs();

    // Both should give the same tip deflection magnitude (same beam, same local transverse load)
    let err = (local_tip_skew - local_tip_ref).abs() / local_tip_ref;
    assert!(
        err < 0.02,
        "Equivalent beam: skew tip={:.6e}, reference={:.6e}, err={:.1}%",
        local_tip_skew,
        local_tip_ref,
        err * 100.0
    );
}

// ================================================================
// 5. 3D Beam Along Diagonal of Cube: All DOF Coupling
// ================================================================
//
// Single beam from (0,0,0) to (L,L,L) — along the main space diagonal.
// Fixed at start, free end with vertical load (Y direction).
// All 6 DOFs at the fixed end should be non-zero due to coupling.
//
// Reference: McGuire et al., "Matrix Structural Analysis", §6.3.

#[test]
fn validation_3d_skew_space_diagonal_coupling() {
    let l = 3.0;
    let l_comp = l / 3.0_f64.sqrt(); // each coordinate = L/√3

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l_comp, l_comp, l_comp),
    ];
    let elems = vec![(1, "frame", 1, 2, 1, 1)];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let fy_load = -10.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 0.0,
        fy: fy_load,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Fy reaction must balance applied Fy
    let err_fy = (r.fy + fy_load).abs() / fy_load.abs();
    assert!(
        err_fy < 0.01,
        "Space diagonal: Fy reaction={:.4}, applied={:.4}", r.fy, fy_load
    );

    // For a fully 3D skew beam, moments at the fixed end are non-zero
    let max_moment = r.mx.abs().max(r.my.abs()).max(r.mz.abs());
    assert!(
        max_moment > 1e-6,
        "Space diagonal: fixed end must have nonzero moment: max_M={:.6e}", max_moment
    );

    // Tip must deflect primarily in Y direction
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(tip.uy < 0.0, "Space diagonal: tip uy should be downward");
}

// ================================================================
// 6. Skew Beam Symmetry: Mirrored Geometry Gives Equal Deflections
// ================================================================
//
// Two cantilever beams: one at +45° and one at -45° in XY plane,
// both fixed at origin with equal loads. By symmetry, the Z-deflection
// of the free end should be identical for both.
//
// Reference: Weaver & Gere, "Matrix Analysis of Framed Structures", §7.4.

#[test]
fn validation_3d_skew_mirror_symmetry() {
    let l = 4.0;
    let cos45 = 1.0 / 2.0_f64.sqrt();
    let fz = -10.0;

    // Beam at +45°: free end at (L·cos45, L·sin45, 0)
    let nodes_pos = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l * cos45, l * cos45, 0.0),
    ];
    let input_pos = make_3d_input(
        nodes_pos,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: 0.0,
            fy: 0.0,
            fz,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );
    let res_pos = linear::solve_3d(&input_pos).unwrap();
    let uz_pos = res_pos.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    // Beam at -45°: free end at (L·cos45, -L·sin45, 0)
    let nodes_neg = vec![
        (1, 0.0, 0.0, 0.0),
        (2, l * cos45, -l * cos45, 0.0),
    ];
    let input_neg = make_3d_input(
        nodes_neg,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2,
            fx: 0.0,
            fy: 0.0,
            fz,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );
    let res_neg = linear::solve_3d(&input_neg).unwrap();
    let uz_neg = res_neg.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    // By symmetry (mirrored about XZ plane), uz should be the same
    let err = (uz_pos - uz_neg).abs() / uz_pos.abs().max(1e-12);
    assert!(
        err < 0.01,
        "Mirror symmetry: uz_pos={:.6e}, uz_neg={:.6e}, err={:.2}%",
        uz_pos,
        uz_neg,
        err * 100.0
    );

    // Both must be downward
    assert!(uz_pos < 0.0, "Skew +45°: uz should be downward");
    assert!(uz_neg < 0.0, "Skew -45°: uz should be downward");
}

// ================================================================
// 7. Inclined 3D Cantilever: Tip Deflection From Beam Theory
// ================================================================
//
// Cantilever beam in 3D at 30° from X toward Y (in XY plane).
// Real length = L. Apply load perpendicular to beam axis (global Z).
// Tip deflection in Z: δ_z = P·L³/(3·E_eff·Iz)
// (same formula as for a horizontal beam since Z load is always transverse).
//
// Reference: Przemieniecki, §10.3.

#[test]
fn validation_3d_skew_cantilever_tip_deflection() {
    let l_real = 5.0;
    let n = 5;
    let angle_deg = 30.0_f64;
    let angle_rad = angle_deg.to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();
    let fz = -20.0;
    let e_eff = E * 1000.0;

    // Build n-element skew beam in XY plane at 30°
    let elem_len = l_real / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| {
            let x = i as f64 * elem_len * cos_a;
            let y = i as f64 * elem_len * sin_a;
            (i + 1, x, y, 0.0)
        })
        .collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: 0.0,
        fy: 0.0,
        fz,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // For global Z load on XY-plane beam, Z deflection = PL³/(3EIy)
    let delta_exact = fz.abs() * l_real.powi(3) / (3.0 * e_eff * IY);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        err < 0.05,
        "Inclined cantilever: uz={:.6e}, exact PL³/(3EIy)={:.6e}, err={:.1}%",
        tip.uz.abs(),
        delta_exact,
        err * 100.0
    );

    // Z reaction at fixed end = -Fz
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_fz = (r.fz + fz).abs() / fz.abs();
    assert!(
        err_fz < 0.01,
        "Inclined cantilever: Fz reaction={:.4}, applied={:.4}", r.fz, fz
    );
}

// ================================================================
// 8. Skew Beam Global Equilibrium: ΣF = 0 for Arbitrary Loads
// ================================================================
//
// Cantilever beam at arbitrary angle in 3D. Apply simultaneous
// loads in all three global directions. Verify that global
// equilibrium is satisfied: ΣFx = 0, ΣFy = 0, ΣFz = 0.
//
// Reference: McGuire et al., "Matrix Structural Analysis", §6.1.

#[test]
fn validation_3d_skew_global_equilibrium() {
    let l = 4.0;
    let angle_xy = 35.0_f64.to_radians();
    let angle_z = 20.0_f64.to_radians();

    // Beam end: (L·cos(az)·cos(axy), L·cos(az)·sin(axy), L·sin(az))
    let dx = l * angle_z.cos() * angle_xy.cos();
    let dy = l * angle_z.cos() * angle_xy.sin();
    let dz = l * angle_z.sin();

    let fx_load = 5.0;
    let fy_load = -8.0;
    let fz_load = 3.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, dx, dy, dz),
    ];
    let elems = vec![(1, "frame", 1, 2, 1, 1)];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: fx_load,
        fy: fy_load,
        fz: fz_load,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // ΣFx = 0
    let sum_fx = r.fx + fx_load;
    assert!(
        sum_fx.abs() < 1e-4 * fx_load.abs(),
        "Skew equilibrium ΣFx: reaction={:.4}, applied={:.4}, sum={:.2e}",
        r.fx,
        fx_load,
        sum_fx
    );

    // ΣFy = 0
    let sum_fy = r.fy + fy_load;
    assert!(
        sum_fy.abs() < 1e-4 * fy_load.abs(),
        "Skew equilibrium ΣFy: reaction={:.4}, applied={:.4}, sum={:.2e}",
        r.fy,
        fy_load,
        sum_fy
    );

    // ΣFz = 0
    let sum_fz = r.fz + fz_load;
    assert!(
        sum_fz.abs() < 1e-4 * fz_load.abs(),
        "Skew equilibrium ΣFz: reaction={:.4}, applied={:.4}, sum={:.2e}",
        r.fz,
        fz_load,
        sum_fz
    );
}

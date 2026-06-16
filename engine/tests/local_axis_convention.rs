//! Canonical Z-up local-axis convention (default, when local_y is absent).
//!
//! Locks the corrected default convention in the Rust solver so it matches the
//! web `computeLocalAxes3D`: local z = global up (Z) projected ⊥ to the member
//! axis; ey = ez × ex. Therefore a vertical (global-Z) gravity load on ANY
//! horizontal-plan member bends about local y (My), regardless of plan angle —
//! no orientation-dependent My/Mz flip, and the section strong axis (depth,
//! along local z) consistently resists gravity.
//!
//! These exercise the FULL 3D solve via the default convention (elements built
//! with local_y = None). Axis-level roll / left-hand / cardinal-vector checks
//! live in `src/element/transform.rs`'s unit tests.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

// Asymmetric section: iy = strong (resists gravity bending), iz = weak.
const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 2.0e-4; // strong
const IZ: f64 = 4.0e-5; // weak
const J: f64 = 1.0e-5;
const P: f64 = 10.0; // tip load (kN)
const L: f64 = 5.0; // length (m)

/// Cantilever from node 1 (fixed) to node 2 at (dx,dy,dz), with a nodal load.
fn solve_cantilever(dx: f64, dy: f64, dz: f64, f: (f64, f64, f64)) -> AnalysisResults3D {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, dx, dy, dz)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])], // node 1 fixed
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: f.0, fy: f.1, fz: f.2, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    linear::solve_3d(&input).expect("solve_3d failed")
}

fn tip_uz(r: &AnalysisResults3D) -> f64 {
    r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz
}

// ── 1. Horizontal X beam under gravity → My ──────────────────────────────────
#[test]
fn x_beam_gravity_bends_about_my() {
    let f = &solve_cantilever(L, 0.0, 0.0, (0.0, 0.0, -P)).element_forces[0];
    assert!((f.my_start.abs() - P * L).abs() < 1e-6, "My should carry P·L: {}", f.my_start);
    assert!(f.mz_start.abs() < 1e-6, "Mz should be ~0: {}", f.mz_start);
    assert!((f.vz_start.abs() - P).abs() < 1e-6, "shear in local z: {}", f.vz_start);
}

// ── 2. Horizontal Y beam → My, SAME deflection as X (no weak-axis flip) ───────
#[test]
fn y_beam_gravity_bends_about_my_same_as_x() {
    let rx = solve_cantilever(L, 0.0, 0.0, (0.0, 0.0, -P));
    let ry = solve_cantilever(0.0, L, 0.0, (0.0, 0.0, -P));
    let fy = &ry.element_forces[0];
    assert!((fy.my_start.abs() - P * L).abs() < 1e-6, "Y beam My should carry P·L: {}", fy.my_start);
    assert!(fy.mz_start.abs() < 1e-6, "Y beam Mz should be ~0: {}", fy.mz_start);
    // Identical strong-axis deflection — the pre-fix bug made the Y beam ~5× softer.
    assert!((tip_uz(&rx) - tip_uz(&ry)).abs() < 1e-9, "X uz {} vs Y uz {}", tip_uz(&rx), tip_uz(&ry));
}

// ── 3. Diagonal plan beam (37°) → My ─────────────────────────────────────────
#[test]
fn diagonal_plan_beam_gravity_bends_about_my() {
    let a = 37.0_f64.to_radians();
    let f = &solve_cantilever(L * a.cos(), L * a.sin(), 0.0, (0.0, 0.0, -P)).element_forces[0];
    assert!((f.my_start.abs() - P * L).abs() < 1e-6, "My: {}", f.my_start);
    assert!(f.mz_start.abs() < 1e-6, "Mz ~0: {}", f.mz_start);
}

// ── 4. 360° plan sweep → no My/Mz flip, consistent deflection ─────────────────
#[test]
fn plan_sweep_no_my_mz_flip() {
    let uz_ref = tip_uz(&solve_cantilever(L, 0.0, 0.0, (0.0, 0.0, -P)));
    let mut deg = 0.0;
    while deg < 360.0 {
        let a = (deg as f64).to_radians();
        let r = solve_cantilever(L * a.cos(), L * a.sin(), 0.0, (0.0, 0.0, -P));
        let f = &r.element_forces[0];
        assert!(f.my_start.abs() > 0.999 * P * L, "deg {deg}: My should carry gravity: {}", f.my_start);
        assert!(f.mz_start.abs() < 1e-6, "deg {deg}: Mz should stay ~0: {}", f.mz_start);
        assert!((tip_uz(&r) - uz_ref).abs() < 1e-9, "deg {deg}: deflection consistent");
        deg += 15.0;
    }
}

// ── 5. Inclined member → axial + local-z transverse, bending primarily My ─────
#[test]
fn inclined_member_axial_plus_my() {
    let a = 30.0_f64.to_radians();
    let f = &solve_cantilever(L * a.cos(), 0.0, L * a.sin(), (0.0, 0.0, -P)).element_forces[0];
    assert!(f.n_start.abs() > 1.0, "axial component present: {}", f.n_start);
    assert!(f.my_start.abs() > f.mz_start.abs() + 1.0, "bending primarily My: my={} mz={}", f.my_start, f.mz_start);
    assert!(f.mz_start.abs() < 1e-6, "Mz ~0 for an in-XZ-plane incline: {}", f.mz_start);
}

// ── 6. Vertical column: stable, finite, no degenerate axes ────────────────────
#[test]
fn vertical_column_stable() {
    // Axial gravity → pure axial, no bending, finite.
    let axial = solve_cantilever(0.0, 0.0, L, (0.0, 0.0, -P));
    let fa = &axial.element_forces[0];
    assert!(fa.my_start.abs() < 1e-6 && fa.mz_start.abs() < 1e-6, "column under axial load: no bending");
    assert!(tip_uz(&axial).is_finite(), "finite axial displacement");
    // Lateral load → stable finite bending (no NaN / degenerate axes).
    let lateral = solve_cantilever(0.0, 0.0, L, (-P, 0.0, 0.0));
    let fl = &lateral.element_forces[0];
    let bending = (fl.my_start.powi(2) + fl.mz_start.powi(2)).sqrt();
    assert!((bending - P * L).abs() < 1e-6, "stable expected bending: {bending}");
    assert!(lateral.displacements.iter().all(|d| d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite()));
}

// ── 7. Explicit local_y still overrides the default ───────────────────────────
#[test]
fn explicit_local_y_overrides_default() {
    // Y beam, but force ey_ref = global Z (vertical) → gravity bends about local z (Mz),
    // i.e. the alternate orientation, proving the explicit override is honored.
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, L, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -P, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let e = input.elements.get_mut("1").unwrap();
    e.local_yx = Some(0.0);
    e.local_yy = Some(0.0);
    e.local_yz = Some(1.0);
    let r = linear::solve_3d(&input).expect("solve failed");
    let f = &r.element_forces[0];
    assert!(f.mz_start.abs() > 0.999 * P * L, "explicit local_y → bending about local z (Mz): {}", f.mz_start);
    assert!(f.my_start.abs() < 1e-6, "My ~0 under the forced alternate orientation: {}", f.my_start);
}

// ── 9. Curved-beam subsegments inherit the corrected default ──────────────────
#[test]
fn curved_beam_subsegments_use_corrected_default() {
    // Horizontal arc (in the XY plane) under a vertical load. Its straight
    // subsegments are generated internally with local_y = None → corrected
    // default → gravity bends them about My. Verify the solve is finite and
    // My-dominant (proving the subsegments use the corrected convention).
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 5.0, 3.0, 0.0), (3, 10.0, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![], // no straight frames — only the curved beam below
        vec![
            (1, vec![true, true, true, true, true, true]),
            (3, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -P, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    input.curved_beams.push(CurvedBeamInput {
        node_start: 1, node_mid: 2, node_end: 3,
        material_id: 1, section_id: 1, num_segments: 8,
        hinge_start: false, hinge_end: false,
    });
    let r = linear::solve_3d(&input).expect("curved beam solve failed");
    assert!(r.displacements.iter().all(|d| d.uz.is_finite()), "finite, stable solve");
    let sum_my: f64 = r.element_forces.iter().map(|f| f.my_start.abs() + f.my_end.abs()).sum();
    let sum_mz: f64 = r.element_forces.iter().map(|f| f.mz_start.abs() + f.mz_end.abs()).sum();
    assert!(sum_my > sum_mz, "horizontal arc under gravity: My-dominant (corrected default): my={sum_my} mz={sum_mz}");
}

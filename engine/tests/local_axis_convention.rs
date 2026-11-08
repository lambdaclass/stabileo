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

use crate::common;

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

#[test]
fn expand_fef_12_to_14_exact_mapping() {
    use dedaliano_engine::element::expand_fef_12_to_14;

    let fef12 = [2.0, -3.5, 5.0, -7.25, 11.0, -13.5, 17.0, -19.25, 23.0, -29.5, 31.0, -37.25];
    let fef14 = expand_fef_12_to_14(&fef12);
    let expected = [
        2.0, -3.5, 5.0, -7.25, 11.0, -13.5, 0.0,
        17.0, -19.25, 23.0, -29.5, 31.0, -37.25, 0.0,
    ];
    assert_eq!(fef14, expected);
    assert_eq!(expand_fef_12_to_14(&[0.0; 12]), [0.0; 14]);
}

#[test]
fn fef_partial_distributed_2d_zero_and_subthreshold_span() {
    use dedaliano_engine::element::fef_partial_distributed_2d;

    let sub = fef_partial_distributed_2d(100.0, 200.0, 2.0, 2.0 + 5e-13, 6.0, 0.0);
    assert_eq!(sub, [0.0; 6]);

    let zero = fef_partial_distributed_2d(100.0, 200.0, 2.0, 2.0, 6.0, 0.0);
    assert_eq!(zero, [0.0; 6]);

    let q = -12.0;
    let l = 4.0;
    let full = fef_partial_distributed_2d(q, q, 0.0, l, l, 0.0);
    let expected = [0.0, q * l / 2.0, q * l * l / 12.0, 0.0, q * l / 2.0, -q * l * l / 12.0];
    for k in 0..6 {
        assert!((full[k] - expected[k]).abs() <= 1e-13, "dof {k}: {} vs {}", full[k], expected[k]);
    }
}

#[test]
fn fef_thermal_2d_and_3d_exact_and_degenerate_depth() {
    use dedaliano_engine::element::{fef_thermal_2d, fef_thermal_3d};

    let e = 2.0e8;
    let a = 0.02;
    let iy = 2.0e-4;
    let iz = 1.0e-4;
    let l = 4.0;
    let dt = 25.0;
    let dt_gy = 15.0;
    let dt_gz = -20.0;
    let alpha = 1.2e-5;
    let fx = e * a * alpha * dt;

    let f2_deg = fef_thermal_2d(e, a, iz, l, dt, dt_gy, alpha, 1e-12);
    assert_eq!(f2_deg, [-fx, 0.0, 0.0, fx, 0.0, 0.0]);

    let h = 0.4;
    let mz = e * iz * alpha * dt_gy / h;
    let f2 = fef_thermal_2d(e, a, iz, l, dt, dt_gy, alpha, h);
    let exp2 = [-fx, 0.0, -mz, fx, 0.0, mz];
    for k in 0..6 {
        assert!((f2[k] - exp2[k]).abs() <= 1e-12 * (1.0 + exp2[k].abs()));
    }

    let f3_deg_y = fef_thermal_3d(e, a, iy, iz, l, dt, dt_gy, dt_gz, alpha, 1e-12, 0.5);
    let my_valid = e * iy * alpha * dt_gz / 0.5;
    assert_eq!(f3_deg_y[5], 0.0);
    assert_eq!(f3_deg_y[11], 0.0);
    assert!((f3_deg_y[4] - (-my_valid)).abs() <= 1e-12 * my_valid.abs());
    assert!((f3_deg_y[10] - my_valid).abs() <= 1e-12 * my_valid.abs());

    let f3_deg_z = fef_thermal_3d(e, a, iy, iz, l, dt, dt_gy, dt_gz, alpha, 0.4, 1e-12);
    assert_eq!(f3_deg_z[4], 0.0);
    assert_eq!(f3_deg_z[10], 0.0);
    assert!((f3_deg_z[5] - (-mz)).abs() <= 1e-12 * mz.abs());
    assert!((f3_deg_z[11] - mz).abs() <= 1e-12 * mz.abs());
}

#[test]
fn local_axes_3d_degenerate_thresholds_and_fallback_frames() {
    use dedaliano_engine::element::compute_local_axes_3d;

    let (ex1, ey1, ez1) = compute_local_axes_3d(
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
        Some(0.0), Some(0.0), Some(1e-10), None, false,
    );
    assert_eq!(ex1, [1.0, 0.0, 0.0]);
    assert_eq!(ey1, [0.0, 1.0, 0.0]);
    assert_eq!(ez1, [0.0, 0.0, 1.0]);

    let (_, ey_lh, ez_lh) = compute_local_axes_3d(
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
        None, None, None, Some(45.0), true,
    );
    let s = std::f64::consts::FRAC_1_SQRT_2;
    assert!((ey_lh[0]).abs() <= 1e-15);
    assert!((ey_lh[1] - (-s)).abs() <= 1e-15);
    assert!((ey_lh[2] - (-s)).abs() <= 1e-15);
    assert!((ez_lh[1] - (-s)).abs() <= 1e-15);
    assert!((ez_lh[2] - s).abs() <= 1e-15);

    let (ex2, ey2, ez2) = compute_local_axes_3d(
        0.0, 0.0, 0.0, 0.0, 1.0, 0.0,
        Some(0.0), Some(1.0), Some(1e-10), None, false,
    );
    assert_eq!(ex2, [0.0, 1.0, 0.0]);
    assert_eq!(ey2, [0.0, 0.0, 1.0]);
    assert_eq!(ez2, [1.0, 0.0, 0.0]);

    let dz = 0.1_f64.sqrt();
    let (ex3, ey3, ez3) = compute_local_axes_3d(
        0.0, 0.0, 0.0, 0.9, 0.3, dz,
        Some(0.9), Some(0.3), Some(dz), None, false,
    );
    let ez_mag = 0.91_f64.sqrt();
    let exp_ez3 = [-dz / ez_mag, 0.0, 0.9 / ez_mag];
    let exp_ey3 = [
        exp_ez3[1] * ex3[2] - exp_ez3[2] * ex3[1],
        exp_ez3[2] * ex3[0] - exp_ez3[0] * ex3[2],
        exp_ez3[0] * ex3[1] - exp_ez3[1] * ex3[0],
    ];
    for k in 0..3 {
        assert!((ez3[k] - exp_ez3[k]).abs() <= 1e-15, "ez3[{k}]: {} vs {}", ez3[k], exp_ez3[k]);
        assert!((ey3[k] - exp_ey3[k]).abs() <= 1e-15, "ey3[{k}]: {} vs {}", ey3[k], exp_ey3[k]);
    }

    let dy4 = (1.0 - 0.999_f64 * 0.999).sqrt();
    let (_, ey4, ez4) = compute_local_axes_3d(
        0.0, 0.0, 0.0, 0.0, dy4, 0.999,
        None, None, None, None, false,
    );
    assert!((ey4[0] - (-1.0)).abs() <= 1e-14);
    assert!(ey4[1].abs() <= 1e-14);
    assert!(ey4[2].abs() <= 1e-14);
    assert!(ez4[0].abs() <= 1e-14);
    assert!((ez4[1] - (-0.999)).abs() <= 1e-14);
    assert!((ez4[2] - dy4).abs() <= 1e-14);
}

#[test]
fn steel_bilinear_kinematic_hardening_and_consistent_tangent_exact() {
    use dedaliano_engine::element::fiber_beam::{material_response, FiberMaterial, FiberMaterialState};

    let e = 200_000.0;
    let fy = 250.0;
    let alpha = 0.02;
    let mat = FiberMaterial::SteelBilinear { e, fy, hardening_ratio: alpha };
    let mut state = FiberMaterialState::new();

    let (s0, t0) = material_response(&mat, 0.001, &mut state);
    assert!((s0 - 200.0).abs() <= 1e-12);
    assert!((t0 - e).abs() <= 1e-12);
    assert_eq!(state.back_stress, 0.0);

    let (s1, t1) = material_response(&mat, 0.003, &mut state);
    assert!((s1 - 257.0).abs() <= 1e-12);
    assert!((t1 - alpha * e).abs() <= 1e-11);
    assert!((state.plastic_strain - 0.001715).abs() <= 1e-15);
    assert!((state.back_stress - 7.0).abs() <= 1e-12);

    let (s2, t2) = material_response(&mat, 0.0, &mut state);
    assert!((s2 - (-245.0)).abs() <= 1e-12);
    assert!((t2 - alpha * e).abs() <= 1e-11);
    assert!((state.plastic_strain - 0.001225).abs() <= 1e-15);
    assert!((state.back_stress - 5.0).abs() <= 1e-12);
}

#[test]
fn concrete_hognestad_compression_tension_and_cracking_exact() {
    use dedaliano_engine::element::fiber_beam::{material_response, FiberMaterial, FiberMaterialState};

    let fc = 35.0;
    let eps_c0 = 0.002;
    let eps_cu = 0.0045;
    let ft = 3.5;
    let e0 = 2.0 * fc / eps_c0;
    let eps_cr = ft / e0;
    let mat = FiberMaterial::ConcreteHognestad { fc, eps_c0, eps_cu, ft };

    let mut st = FiberMaterialState::new();
    let r = 0.4;
    let (sc1, tc1) = material_response(&mat, -r * eps_c0, &mut st);
    let exp_sc1 = -fc * (2.0 * r - r * r);
    let exp_tc1 = fc * (2.0 - 2.0 * r) / eps_c0;
    assert!((sc1 - exp_sc1).abs() <= 1e-12);
    assert!((tc1 - exp_tc1).abs() <= 1e-10);

    let (sc_peak, tc_peak) = material_response(&mat, -eps_c0, &mut st);
    assert!((sc_peak - (-fc)).abs() <= 1e-12);
    assert!(tc_peak.abs() <= 1e-12);

    let eps_desc = 0.003;
    let (sc2, tc2) = material_response(&mat, -eps_desc, &mut st);
    let exp_sc2 = -fc * (1.0 - (eps_desc - eps_c0) / (eps_cu - eps_c0));
    let exp_tc2 = -fc / (eps_cu - eps_c0);
    assert!((sc2 - exp_sc2).abs() <= 1e-12);
    assert!((tc2 - exp_tc2).abs() <= 1e-10);

    let (sc_crush, tc_crush) = material_response(&mat, -eps_cu, &mut st);
    assert_eq!(sc_crush, 0.0);
    assert_eq!(tc_crush, 1e-6);

    let mut st_t = FiberMaterialState::new();
    let eps_t = 0.5 * eps_cr;
    let (st1, tt1) = material_response(&mat, eps_t, &mut st_t);
    assert!(!st_t.cracked);
    assert!((st1 - e0 * eps_t).abs() <= 1e-12);
    assert!((tt1 - e0).abs() <= 1e-10);

    let (st_pre, _) = material_response(&mat, 0.99 * eps_cr, &mut st_t);
    assert!(!st_t.cracked);
    assert!((st_pre - 0.99 * ft).abs() <= 1e-12);

    let (st_post, tt_post) = material_response(&mat, 1.01 * eps_cr, &mut st_t);
    assert!(st_t.cracked);
    assert_eq!(st_post, 0.0);
    assert_eq!(tt_post, 1e-6);

    let (st_reload, tt_reload) = material_response(&mat, 0.5 * eps_cr, &mut st_t);
    assert!(st_t.cracked);
    assert_eq!(st_reload, 0.0);
    assert_eq!(tt_reload, 1e-6);

    let mat_no_ft = FiberMaterial::ConcreteHognestad { fc, eps_c0, eps_cu, ft: 0.0 };
    let mut st_no_ft = FiberMaterialState::new();
    let (s_no_ft, t_no_ft) = material_response(&mat_no_ft, 0.5 * eps_cr, &mut st_no_ft);
    assert!(st_no_ft.cracked);
    assert_eq!(s_no_ft, 0.0);
    assert_eq!(t_no_ft, 1e-6);
}

#[test]
fn fiber_section_response_2d_asymmetric_coupling_exact() {
    use dedaliano_engine::element::fiber_beam::{
        section_response_2d, Fiber, FiberMaterial, FiberSectionDef, SectionState,
    };

    let e = 200_000.0;
    let section = FiberSectionDef {
        fibers: vec![
            Fiber { y: 0.25, z: 0.0, area: 0.004, material_idx: 0 },
            Fiber { y: -0.10, z: 0.0, area: 0.002, material_idx: 0 },
        ],
        materials: vec![FiberMaterial::Elastic { e }],
    };
    let mut state = SectionState::new(2);
    let (forces, k_sec) = section_response_2d(&section, &[0.0005, 0.002], &mut state);

    let exp_ea = 1.2e6;
    let exp_es = 1.6e5;
    let exp_ei = 5.4e4;
    assert!((k_sec[0] - exp_ea).abs() <= 1e-8);
    assert!((k_sec[1] - exp_es).abs() <= 1e-8);
    assert!((k_sec[2] - exp_es).abs() <= 1e-8);
    assert!((k_sec[3] - exp_ei).abs() <= 1e-8);
    assert!((forces[0] - 920.0).abs() <= 1e-10);
    assert!((forces[1] - 188.0).abs() <= 1e-10);
}

#[test]
fn gauss_lobatto_6_point_polynomial_quadrature_exact() {
    use dedaliano_engine::element::fiber_beam::gauss_lobatto_points;

    let l = 3.5;
    let pts = gauss_lobatto_points(6, l);
    assert_eq!(pts.len(), 6);
    assert_eq!(pts[0].0, 0.0);
    assert!((pts[5].0 - l).abs() <= 1e-15);
    for i in 0..5 {
        assert!(pts[i].0 < pts[i + 1].0, "non-monotone abscissas at {i}: {:?}", pts);
    }
    for i in 1..5 {
        let xi = 2.0 * pts[i].0 / l - 1.0;
        let dp5 = 21.0 * xi.powi(4) - 14.0 * xi.powi(2) + 1.0;
        assert!(dp5.abs() <= 1e-14, "interior node {i} not a root of P5': xi={xi}, dp5={dp5}");
    }
    for deg in 0..=9 {
        let quad: f64 = pts.iter().map(|&(x, w)| w * x.powi(deg)).sum();
        let exact = l.powi(deg + 1) / (deg + 1) as f64;
        assert!(
            (quad - exact).abs() <= 1e-13 * exact,
            "degree {deg}: quad={quad} vs exact={exact}"
        );
    }
}

#[test]
fn expand_curved_beam_planes_hinges_and_section_frame_exact() {
    use dedaliano_engine::element::curved_beam::expand_curved_beam;
    use dedaliano_engine::element::compute_local_axes_3d;

    let c = [1.3, -2.7, 0.8];
    let r = 4.5;
    let t0 = 0.25_f64;
    let tm = 0.95_f64;
    let te = 2.15_f64;
    let n_seg = 4usize;

    let frames: [([f64; 3], [f64; 3], [f64; 3]); 4] = [
        ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]),
        ([1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]),
        ([0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]),
        (
            [2.0 / 3.0, 1.0 / 3.0, 2.0 / 3.0],
            [-2.0 / 3.0, 2.0 / 3.0, 1.0 / 3.0],
            [-1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0],
        ),
    ];

    let pt = |u: [f64; 3], v: [f64; 3], th: f64| -> [f64; 3] {
        let (ct, st) = (th.cos(), th.sin());
        [
            c[0] + r * (ct * u[0] + st * v[0]),
            c[1] + r * (ct * u[1] + st * v[1]),
            c[2] + r * (ct * u[2] + st * v[2]),
        ]
    };

    for (idx, (u, v, n_exp)) in frames.iter().copied().enumerate() {
        let p_start = pt(u, v, t0);
        let p_mid = pt(u, v, tm);
        let p_end = pt(u, v, te);
        let cb = CurvedBeamInput {
            node_start: 2,
            node_mid: 5,
            node_end: 9,
            material_id: 3,
            section_id: 7,
            num_segments: n_seg,
            hinge_start: true,
            hinge_end: true,
        };
        let exp = expand_curved_beam(&cb, p_start, p_mid, p_end, 100, 200);
        assert_eq!(exp.new_nodes.len(), n_seg - 1);
        for i in 1..n_seg {
            let th = t0 + (i as f64 / n_seg as f64) * (te - t0);
            let p_exp = pt(u, v, th);
            let (nid, x, y, z) = exp.new_nodes[i - 1];
            assert_eq!(nid, 100 + i - 1);
            assert!((x - p_exp[0]).abs() <= 1e-12, "plane {idx} node {i} x: {x} vs {}", p_exp[0]);
            assert!((y - p_exp[1]).abs() <= 1e-12, "plane {idx} node {i} y: {y} vs {}", p_exp[1]);
            assert!((z - p_exp[2]).abs() <= 1e-12, "plane {idx} node {i} z: {z} vs {}", p_exp[2]);
        }

        let exp_node_chain = [2usize, 100, 101, 102, 9];
        assert_eq!(exp.new_elements.len(), n_seg);
        for i in 0..n_seg {
            let (eid, ni, nj, mat, sec, hs, he) = exp.new_elements[i];
            assert_eq!(eid, 200 + i);
            assert_eq!(ni, exp_node_chain[i]);
            assert_eq!(nj, exp_node_chain[i + 1]);
            assert_eq!(mat, 3);
            assert_eq!(sec, 7);
            assert_eq!(hs, i == 0);
            assert_eq!(he, i == n_seg - 1);
        }

        let sf = exp.section_frame.expect("arc must have section_frame");
        for k in 0..3 {
            assert!((sf.normal[k] - n_exp[k]).abs() <= 1e-13, "plane {idx} normal[{k}]");
        }
        let th_mid = 0.5 * (t0 + te);
        let t_mid = [
            -th_mid.sin() * u[0] + th_mid.cos() * v[0],
            -th_mid.sin() * u[1] + th_mid.cos() * v[1],
            -th_mid.sin() * u[2] + th_mid.cos() * v[2],
        ];
        let p_a = pt(u, v, th_mid);
        let p_b = [p_a[0] + t_mid[0], p_a[1] + t_mid[1], p_a[2] + t_mid[2]];
        let ly = sf.local_y(p_a, p_b);
        let (_, ey_default, _) = compute_local_axes_3d(
            p_a[0], p_a[1], p_a[2], p_b[0], p_b[1], p_b[2],
            None, None, None, None, false,
        );
        for k in 0..3 {
            assert!(
                (ly[k] - ey_default[k]).abs() <= 1e-13,
                "plane {idx} local_y[{k}]: {} vs {}",
                ly[k],
                ey_default[k]
            );
        }
    }
}

#[test]
fn expand_curved_beam_collinear_straight_fallback_exact() {
    use dedaliano_engine::element::curved_beam::expand_curved_beam;

    let p_start = [1.5, -2.5, 3.5];
    let p_end = [9.5, 5.5, -4.5];
    let p_mid = [5.5, 1.5, -0.5];
    let cb = CurvedBeamInput {
        node_start: 4,
        node_mid: 6,
        node_end: 8,
        material_id: 2,
        section_id: 5,
        num_segments: 4,
        hinge_start: true,
        hinge_end: true,
    };
    let exp = expand_curved_beam(&cb, p_start, p_mid, p_end, 10, 20);
    assert!(exp.section_frame.is_none());
    assert_eq!(exp.new_nodes.len(), 3);
    for i in 1..4 {
        let t = i as f64 / 4.0;
        let (nid, x, y, z) = exp.new_nodes[i - 1];
        assert_eq!(nid, 10 + i - 1);
        assert!((x - (p_start[0] + t * (p_end[0] - p_start[0]))).abs() <= 1e-14);
        assert!((y - (p_start[1] + t * (p_end[1] - p_start[1]))).abs() <= 1e-14);
        assert!((z - (p_start[2] + t * (p_end[2] - p_start[2]))).abs() <= 1e-14);
    }
    let chain = [4usize, 10, 11, 12, 8];
    assert_eq!(exp.new_elements.len(), 4);
    for i in 0..4 {
        let (eid, ni, nj, mat, sec, hs, he) = exp.new_elements[i];
        assert_eq!(eid, 20 + i);
        assert_eq!(ni, chain[i]);
        assert_eq!(nj, chain[i + 1]);
        assert_eq!(mat, 2);
        assert_eq!(sec, 5);
        assert_eq!(hs, i == 0);
        assert_eq!(he, i == 3);
    }
}



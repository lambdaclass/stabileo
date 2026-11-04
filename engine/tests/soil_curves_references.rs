//! The p-y, t-z and q-z soil curves against hand calculations from the
//! references they cite (#421 AC-12, #422 AC-13, #423 AC-16; SA-2026-017).
//!
//! - Soft clay: Matlock (1970) as API RP 2A §6.8.2–3 tabulates it, with the J·c·z/D term.
//! - Stiff clay without free water: Welch & Reese (1972), Reese & Welch (1975).
//! - Sand: API RP 2A §6.8.6–7, static A = max(3 − 0.8 z/D, 0.9), cyclic 0.9,
//!   k from API RP 2GEO Table 5 (25°, 30°, 35°, 40° → 5.4, 11, 22, 45 MN/m³).
//! - q-z: API RP 2A §6.4.3 table, times the tip area. t-z times the perimeter.
//!
//! The expected numbers are written out by hand from the reference formulas,
//! not computed by the engine's helpers.

use dedaliano_engine::solver::soil_curves::*;
use dedaliano_engine::solver::ssi::{solve_ssi_2d, SSIInput, SoilSpring};
use dedaliano_engine::types::*;
use serde_json::json;
use std::collections::HashMap;

fn close(what: &str, got: f64, want: f64, rel: f64) {
    assert!((got - want).abs() <= rel * want.abs().max(1e-12), "{what}: got {got}, want {want}");
}

fn eval(c: &SoilCurve, y: f64) -> f64 {
    evaluate_soil_curve(c, y).unwrap().0
}

fn soft(depth: f64) -> SoilCurve {
    SoilCurve::PySoftClay { su: 20.0, gamma_eff: 6.0, d: 1.0, depth, eps_50: 0.01, j: Some(0.5) }
}

// ---------- soft clay (Matlock 1970) ----------

#[test]
fn soft_clay_ultimate_follows_matlock_with_j() {
    // c = 20 kPa, γ' = 6 kN/m³, D = 1 m, J = 0.5:
    // p_u = (3c + γ'z + J c z/D)·D, capped at 9c·D = 180 kN/m at X_R = 6D/(γ'D/c + J) = 7.5 m.
    for (z, pu) in [(0.0, 60.0), (2.0, 92.0), (4.0, 124.0), (7.5, 180.0), (10.0, 180.0)] {
        close(&format!("p_u at z = {z}"), eval(&soft(z), 1.0), pu, 1e-12);
    }
}

#[test]
fn soft_clay_shape_is_the_api_static_table() {
    // z = 4 m: p_u = 124 kN/m, y_c = 2.5·0.01·1 = 0.025 m. API RP 2A §6.8.3:
    // p/p_u = 0.23, 0.33, 0.50, 0.72, 1.00 at y/y_c = 0.1, 0.3, 1, 3, 8.
    let c = soft(4.0);
    for (r, ratio) in [(0.1, 0.23), (0.3, 0.33), (1.0, 0.50), (3.0, 0.72), (8.0, 1.0), (20.0, 1.0)] {
        close(&format!("y = {r} y_c"), eval(&c, r * 0.025), ratio * 124.0, 1e-12);
        // Matlock's cube root at the same point, to the table's two digits.
        if r <= 8.0 { assert!((0.5 * f64::powf(r, 1.0 / 3.0) - ratio).abs() < 0.006, "{r}"); }
    }
    // Linear between points: y = 2 y_c is halfway from 0.50 to 0.72.
    close("y = 2 y_c", eval(&c, 0.05), 0.61 * 124.0, 1e-12); // 75.64
    close("antisymmetric", eval(&c, -0.05), -0.61 * 124.0, 1e-12);
    // Finite initial stiffness: the first segment, 2.3 p_u / y_c.
    close("k0", evaluate_soil_curve(&c, 0.0).unwrap().1, 2.3 * 124.0 / 0.025, 1e-12);
    // Continuous where the branches meet.
    close("8 y50 from below", eval(&c, 0.2 * (1.0 - 1e-10)), 124.0, 1e-9);
}

#[test]
fn soft_clay_refuses_missing_or_out_of_range_j() {
    let mut c = soft(4.0);
    if let SoilCurve::PySoftClay { j, .. } = &mut c { *j = None; }
    assert!(evaluate_soil_curve(&c, 0.01).unwrap_err().contains("J"));
    if let SoilCurve::PySoftClay { j, .. } = &mut c { *j = Some(0.8); }
    assert!(evaluate_soil_curve(&c, 0.01).is_err());
    // Old JSON without J is refused, not given J = 0.
    let old: SoilCurve = serde_json::from_value(json!({"type": "py_soft_clay", "su": 50, "gamma_eff": 18, "d": 0.6, "depth": 5, "eps_50": 0.01})).unwrap();
    assert!(evaluate_soil_curve(&old, 0.01).is_err());
}

// ---------- stiff clay without free water (Welch & Reese 1972) ----------

fn stiff(free_water: Option<bool>) -> SoilCurve {
    SoilCurve::PyStiffClay { su: 100.0, gamma_eff: 9.0, d: 1.0, depth: 3.0, eps_50: 0.005, j: Some(0.5), free_water }
}

#[test]
fn stiff_clay_is_welch_reese_quarter_power_to_16_y50() {
    // p_u = (300 + 27 + 150)·1 = 477 kN/m (< 9c·D = 900); y50 = 2.5·0.005·1 = 0.0125 m.
    // p = 0.5 p_u (y/y50)^(1/4) at the sampled points.
    let c = stiff(Some(false));
    for (r, ratio) in [(0.001, 0.088914), (0.01, 0.158114), (0.1, 0.281171), (0.3, 0.370041), (1.0, 0.5), (3.0, 0.658037), (8.0, 0.840896), (16.0, 1.0)] {
        close(&format!("y = {r} y50"), eval(&c, r * 0.0125), ratio * 477.0, 3e-6);
    }
    // Between the sampled points it stays within 3.3 % below the quarter power.
    for k in 0..=400 {
        let r = 0.001 * f64::powf(16_000.0, k as f64 / 400.0);
        let exact = 0.5 * f64::powf(r, 0.25) * 477.0;
        let got = eval(&c, r * 0.0125);
        assert!(got <= exact * (1.0 + 1e-12) && got >= 0.967 * exact, "y = {r} y50: {got} vs {exact}");
    }
    // Linear between: 4 y50 is a fifth of the way from 3 to 8 y50.
    close("y = 4 y50", eval(&c, 0.05), (0.658037 + 0.2 * (0.840896 - 0.658037)) * 477.0, 3e-6); // 331.33
    close("y = 32 y50", eval(&c, 0.4), 477.0, 1e-12);
    // No jump anywhere: just past y50 it is 0.5·p_u, not p_u (the old curve jumped to 477).
    close("just past y50", eval(&c, 0.0125 * (1.0 + 1e-9)), 238.5, 1e-8);
    close("just below 16 y50", eval(&c, 0.2 * (1.0 - 1e-10)), 477.0, 1e-9);
}

#[test]
fn stiff_clay_refuses_free_water_and_missing_inputs() {
    assert!(evaluate_soil_curve(&stiff(Some(true)), 0.01).unwrap_err().contains("not implemented"));
    assert!(evaluate_soil_curve(&stiff(None), 0.01).is_err());
    let old: SoilCurve = serde_json::from_value(json!({"type": "py_stiff_clay", "su": 100, "gamma_eff": 9, "d": 1, "depth": 3, "eps_50": 0.005})).unwrap();
    assert!(evaluate_soil_curve(&old, 0.01).is_err());
}

// ---------- API sand ----------

fn sand(phi: f64, depth: f64, loading: SandLoading) -> SoilCurve {
    SoilCurve::PySand { phi, gamma_eff: 10.0, d: 1.0, depth, loading: Some(loading) }
}

#[test]
fn sand_k_interpolates_api_table() {
    for (phi, k) in [(25.0, 5_400.0), (27.0, 7_640.0), (30.0, 11_000.0), (32.5, 16_500.0), (35.0, 22_000.0), (38.0, 35_800.0), (40.0, 45_000.0)] {
        close(&format!("k at φ = {phi}"), api_sand_k(phi).unwrap(), k, 1e-12);
    }
    assert!(api_sand_k(24.9).is_err() && api_sand_k(40.1).is_err() && api_sand_k(f64::NAN).is_err());
}

#[test]
fn sand_static_and_cyclic_match_api_hand_values() {
    // φ = 30°: C1 = 1.9117, C2 = 2.6667, C3 = 28.745 (API Fig. 6.8.6-1); γ' = 10, D = 1, k = 11 MN/m³.
    // (z, A static, p_u, p static at y = 0.01, p cyclic at y = 0.01)
    let rows = [
        (1.0, 2.2, 45.7837, 80.3416, 40.8116),
        (2.0, 1.4, 129.8015, 152.0780, 111.5384),
        (5.0, 0.9, 611.2595, 418.9224, 418.9224),
        (10.0, 0.9, 2178.3712, 997.4650, 997.4650),
    ];
    for (z, a, pu, p_static, p_cyclic) in rows {
        close(&format!("static p at z = {z}"), eval(&sand(30.0, z, SandLoading::Static), 0.01), p_static, 2e-6);
        close(&format!("cyclic p at z = {z}"), eval(&sand(30.0, z, SandLoading::Cyclic), 0.01), p_cyclic, 2e-6);
        close(&format!("static A·p_u at z = {z}"), eval(&sand(30.0, z, SandLoading::Static), 10.0), a * pu, 2e-6);
        close(&format!("cyclic A·p_u at z = {z}"), eval(&sand(30.0, z, SandLoading::Cyclic), 10.0), 0.9 * pu, 2e-6);
    }
    // Initial modulus k·z.
    close("k·z", evaluate_soil_curve(&sand(30.0, 2.0, SandLoading::Static), 0.0).unwrap().1, 22_000.0, 1e-12);
}

#[test]
fn sand_refuses_missing_loading_and_phi_outside_the_k_table() {
    let old: SoilCurve = serde_json::from_value(json!({"type": "py_sand", "phi": 30, "gamma_eff": 10, "d": 1, "depth": 2})).unwrap();
    assert!(evaluate_soil_curve(&old, 0.01).unwrap_err().contains("loading"));
    assert!(evaluate_soil_curve(&sand(42.0, 2.0, SandLoading::Static), 0.01).is_err());
    let parsed: SoilCurve = serde_json::from_value(json!({"type": "py_sand", "phi": 30, "gamma_eff": 10, "d": 1, "depth": 2, "loading": "cyclic"})).unwrap();
    close("parsed cyclic", eval(&parsed, 0.01), 111.5384, 2e-6);
}

// ---------- t-z and q-z: forces, not stresses ----------

#[test]
fn tz_is_shaft_friction_times_perimeter() {
    // t_ult = 50 kPa, z_ult = 0.01 m, D = 0.5 m: perimeter π·0.5 = 1.5708 m.
    let per = std::f64::consts::PI * 0.5;
    let c = SoilCurve::Tz { t_ult: 50.0, z_ult: 0.01, perimeter: Some(per) };
    close("z = z_ult/4", eval(&c, 0.0025), 25.0 * per, 1e-12); // 39.27 kN/m
    close("z = z_ult", eval(&c, 0.01), 50.0 * per, 1e-12);
    close("z = 3 z_ult", eval(&c, 0.03), 50.0 * per, 1e-12);
    let old: SoilCurve = serde_json::from_value(json!({"type": "tz", "t_ult": 50, "z_ult": 0.01})).unwrap();
    assert!(evaluate_soil_curve(&old, 0.001).unwrap_err().contains("perimeter"));
}

#[test]
fn qz_follows_api_table_times_tip_area() {
    // q_ult = 5000 kPa, D = 0.6 m, A = π·0.6²/4 = 0.282743 m².
    let area = std::f64::consts::PI * 0.36 / 4.0;
    let c = SoilCurve::Qz { q_ult: 5000.0, d: 0.6, tip_area: Some(area) };
    // Compression: the tip moves down (negative along the spring's axis).
    for (z_over_d, ratio) in [(0.001, 0.125), (0.002, 0.25), (0.013, 0.50), (0.0275, 0.625), (0.042, 0.75), (0.073, 0.90), (0.1, 1.0), (0.2, 1.0)] {
        close(&format!("Q at z/D = {z_over_d}"), -eval(&c, -z_over_d * 0.6), ratio * 5000.0 * area, 1e-9);
    }
    // Uplift: no tip resistance, never tension.
    assert_eq!(evaluate_soil_curve(&c, 0.06).unwrap(), (0.0, 0.0));
    assert!(c.is_point_spring());
    let old: SoilCurve = serde_json::from_value(json!({"type": "qz", "q_ult": 5000, "d": 0.6})).unwrap();
    assert!(evaluate_soil_curve(&old, 0.001).unwrap_err().contains("tip area"));
}

/// A near-rigid vertical pile on t-z springs along the shaft and a q-z spring
/// at the tip. Prescribe the settlement δ through the load the hand
/// calculation says it takes: P = t(δ)·πD·L + q(δ)·A_tip.
#[test]
fn single_pile_axial_capacity_matches_hand_calculation() {
    let (d, length, n) = (0.5_f64, 10.0_f64, 10usize);
    let (t_ult, z_ult, q_ult) = (50.0, 0.01, 2000.0);
    let delta = 0.0025;
    let per = std::f64::consts::PI * d;
    let area = std::f64::consts::PI * d * d / 4.0;
    // Shaft: t(δ) = 50·√0.25 = 25 kPa over πD·L = 15.708 m² → 392.70 kN.
    let shaft = 25.0 * per * length;
    // Tip: z/D = 0.005, between (0.002, 0.25) and (0.013, 0.50): 0.25 + 0.25·3/11 = 0.31818 → 636.36 kPa × 0.19635 m² = 124.95 kN.
    let tip = (0.25 + 0.25 * 3.0 / 11.0) * q_ult * area;
    let p = shaft + tip; // 517.65 kN

    let dz = length / n as f64;
    let solver = pile(n, length, 2.0e11, area, std::f64::consts::PI * d.powi(4) / 64.0, "guidedZ",
        SolverNodalLoad { node_id: 1, fx: 0.0, fz: -p, my: 0.0 });
    let mut soil_springs: Vec<SoilSpring> = (0..=n).map(|i| SoilSpring {
        node_id: i + 1, direction: 1,
        curve: SoilCurve::Tz { t_ult, z_ult, perimeter: Some(per) },
        tributary_length: if i == 0 || i == n { dz / 2.0 } else { dz },
    }).collect();
    // The tip spring: its tributary length is not used (a force already).
    soil_springs.push(SoilSpring { node_id: n + 1, direction: 1, curve: SoilCurve::Qz { q_ult, d, tip_area: Some(area) }, tributary_length: 123.0 });

    let r = solve_ssi_2d(&SSIInput { solver, soil_springs, max_iter: 500, tolerance: 1e-12 }).unwrap();
    assert!(r.converged);
    for disp in &r.results.displacements {
        close(&format!("settlement of node {}", disp.node_id), -disp.uz, delta, 1e-6);
    }
    let shaft_got: f64 = r.spring_results[..=n].iter().map(|s| s.reaction).sum();
    let tip_got = r.spring_results[n + 1].reaction;
    close("shaft force", -shaft_got, shaft, 1e-6);
    close("tip force", -tip_got, tip, 1e-6);
}

/// A vertical pile, head (node 1) at z = 0, `n` frame elements down to z = −length.
fn pile(n: usize, length: f64, e: f64, a: f64, iz: f64, head_support: &str, load: SolverNodalLoad) -> SolverInput {
    let dz = length / n as f64;
    let mut nodes = HashMap::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode { id: i + 1, x: 0.0, z: -(i as f64) * dz });
    }
    let mut elements = HashMap::new();
    for i in 0..n {
        elements.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".into(), node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: if head_support == "guidedZ" { 1 } else { n + 1 }, support_type: head_support.into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    SolverInput {
        solver_options: None, masses: Default::default(), nodes,
        materials: HashMap::from([("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 })]),
        sections: HashMap::from([("1".to_string(), SolverSection { id: 1, a, iz, as_y: None })]),
        elements, supports,
        loads: vec![SolverLoad::Nodal(load)],
        constraints: vec![], connectors: HashMap::new(),
    }
}

/// Laterally loaded piles on each p-y family converge (the tabulated clay
/// curves have a finite initial stiffness), and with the toe free to slide
/// (a vertical roller) the spring reactions alone balance the head load.
#[test]
fn lateral_piles_converge_on_every_py_family() {
    let (d, length, n) = (1.0_f64, 20.0_f64, 20usize);
    let iz = std::f64::consts::PI * d.powi(4) / 64.0;
    let a = std::f64::consts::PI * d * d / 4.0;
    let dz = length / n as f64;
    let families: [(&str, fn(f64) -> SoilCurve); 4] = [
        ("soft clay", |z| SoilCurve::PySoftClay { su: 50.0, gamma_eff: 9.0, d: 1.0, depth: z, eps_50: 0.01, j: Some(0.5) }),
        ("stiff clay", |z| SoilCurve::PyStiffClay { su: 150.0, gamma_eff: 19.0, d: 1.0, depth: z, eps_50: 0.005, j: Some(0.5), free_water: Some(false) }),
        ("sand static", |z| SoilCurve::PySand { phi: 35.0, gamma_eff: 10.0, d: 1.0, depth: z, loading: Some(SandLoading::Static) }),
        ("sand cyclic", |z| SoilCurve::PySand { phi: 35.0, gamma_eff: 10.0, d: 1.0, depth: z, loading: Some(SandLoading::Cyclic) }),
    ];
    for (name, curve) in families {
        let solver = pile(n, length, 500_000.0 / iz / 1000.0, a, iz, "rollerX", SolverNodalLoad { node_id: 1, fx: 200.0, fz: 0.0, my: 0.0 });
        let soil_springs = (1..n).map(|i| SoilSpring { node_id: i + 1, direction: 0, curve: curve(i as f64 * dz), tributary_length: dz }).collect();
        let r = solve_ssi_2d(&SSIInput { solver, soil_springs, max_iter: 200, tolerance: 1e-6 }).unwrap();
        assert!(r.converged, "{name}: not converged in {} iterations", r.iterations);
        let springs: f64 = r.spring_results.iter().map(|s| s.reaction).sum();
        close(&format!("{name}: ΣH"), springs, 200.0, 1e-4);
    }
}

/// A spring on a node the model does not have, or along a rotation, is refused:
/// it used to read a zero displacement, or put a soil force on a rotation.
#[test]
fn springs_on_missing_nodes_or_rotations_are_refused() {
    let tz = SoilCurve::Tz { t_ult: 50.0, z_ult: 0.01, perimeter: Some(1.0) };
    let run = |node_id: usize, direction: usize| {
        let solver = pile(4, 4.0, 2.0e5, 0.1, 1e-3, "pinned", SolverNodalLoad { node_id: 1, fx: 1.0, fz: 0.0, my: 0.0 });
        solve_ssi_2d(&SSIInput { solver, soil_springs: vec![SoilSpring { node_id, direction, curve: tz.clone(), tributary_length: 1.0 }], max_iter: 20, tolerance: 1e-6 })
    };
    assert!(run(99, 0).unwrap_err().contains("not in the model"));
    assert!(run(2, 2).unwrap_err().contains("not a translation"));
    assert!(run(2, 0).is_ok());
}

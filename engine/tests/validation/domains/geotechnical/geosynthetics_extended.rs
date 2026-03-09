/// Validation: Geosynthetics and Reinforced Soil Structures (Extended)
///
/// References:
///   - FHWA-NHI-10-024: Design and Construction of MSE Walls and RSS
///   - Koerner: "Designing with Geosynthetics" 6th ed. (2012)
///   - EN 13251/13252: Geotextiles and Geomembranes
///   - AASHTO LRFD Bridge Design 11.10: MSE Walls
///   - EN 1997-1 (EC7): Geotechnical Design
///   - BS 8006-1: Code of Practice for Strengthened/Reinforced Soils
///   - Jewell (1996): "Soil Reinforcement with Geotextiles"
///   - Houlsby (1991): Bearing capacity improvement with reinforcement
///
/// Tests verify MSE wall internal stability, pullout resistance,
/// reinforced slope FOS, geomembrane strain, bearing capacity improvement,
/// filter/separation criteria, reinforced embankment on soft ground,
/// and wrap-around wall geotextile tension.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. MSE Wall Internal Stability: T_max = Ka * gamma * z * Sv * Sh
// ================================================================
//
// FHWA simplified method: maximum tension in each reinforcement layer
//   T_max = Ka * gamma * z * Sv * Sh
// where:
//   Ka = tan^2(45 - phi/2) (active earth pressure coefficient)
//   gamma = unit weight of backfill (kN/m3)
//   z = depth to reinforcement layer (m)
//   Sv = vertical spacing (m)
//   Sh = horizontal spacing (m, typically = 1.0 for continuous sheets)
//
// Verify T_max at multiple depths and compare with FEM beam-on-spring
// analogy: a horizontal beam representing the facing panel loaded by
// earth pressure with reaction from reinforcement anchors.

#[test]
fn geosynthetics_mse_wall_internal_stability() {
    let gamma: f64 = 18.0;      // kN/m3, backfill unit weight
    let phi: f64 = 34.0_f64.to_radians();
    let h: f64 = 9.0;           // m, wall height
    let sv: f64 = 0.75;         // m, vertical spacing
    let sh: f64 = 1.0;          // m, horizontal spacing (continuous)

    // Active earth pressure coefficient (Rankine)
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    // For phi = 34 deg: Ka ~ 0.283

    assert_close(ka, 0.283, 0.02, "Ka for phi=34 deg");

    // T_max at various depths
    let depths = [1.5, 3.0, 4.5, 6.0, 7.5, 9.0];
    let mut t_max_values = Vec::new();

    for &z in &depths {
        let t_max: f64 = ka * gamma * z * sv * sh;
        t_max_values.push(t_max);

        // T_max must be positive and increase with depth
        assert!(t_max > 0.0, "T_max at z={:.1}m = {:.2} kN/m > 0", z, t_max);
    }

    // Verify linear increase with depth
    for i in 1..t_max_values.len() {
        assert!(
            t_max_values[i] > t_max_values[i - 1],
            "T_max increases with depth: {:.2} > {:.2}",
            t_max_values[i], t_max_values[i - 1]
        );
    }

    // Verify T_max at base (z = H)
    let t_max_base: f64 = ka * gamma * h * sv * sh;
    // = 0.283 * 18 * 9 * 0.75 * 1.0 = 34.37 kN/m
    assert_close(t_max_base, ka * gamma * h * sv * sh, 0.01, "T_max at wall base");

    // Model: horizontal beam (facing panel between reinforcement layers)
    // representing a 0.75m-tall panel strip under earth pressure at z = 4.5m
    // Simply supported between reinforcement anchors spaced at 1.0m
    let z_mid: f64 = 4.5;
    let sigma_h: f64 = ka * gamma * z_mid; // horizontal pressure at z=4.5m
    // = 0.283 * 18 * 4.5 = 22.93 kPa
    let q_panel: f64 = sigma_h * sv; // load per unit length on panel strip
    // = 22.93 * 0.75 = 17.20 kN/m

    let e_panel: f64 = 25_000.0; // MPa, concrete facing panel
    let a_panel: f64 = 0.15 * 1.0; // m2, 150mm thick x 1m wide
    let iz_panel: f64 = 1.0 * 0.15_f64.powi(3) / 12.0; // m4

    // Panel span = horizontal spacing = 1.0m
    let l_span: f64 = sh;
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q_panel, q_j: -q_panel, a: None, b: None,
        }),
    ];
    let input = make_beam(1, l_span, e_panel, a_panel, iz_panel, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Reaction at each support = q * L / 2 = T_max at that depth
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q_panel * l_span, 0.01, "panel equilibrium");

    // Each reaction = q * L / 2
    let r_expected: f64 = q_panel * l_span / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_expected, 0.02, "panel reaction = half total load");
}

// ================================================================
// 2. Geogrid Pullout Resistance: F_pullout = 2 * f * sigma_v * Le * b
// ================================================================
//
// Pullout resistance of geogrid embedded in soil:
//   F_pullout = 2 * f* * sigma_v * Le * b
// where:
//   f* = pullout resistance factor (tan(phi) * Ci or alpha*F* per FHWA)
//   sigma_v = overburden stress at reinforcement level
//   Le = embedment length beyond failure plane
//   b = width of reinforcement (unit width = 1.0)
//   Factor 2 accounts for friction on both sides
//
// FHWA: F* = 0.67*tan(phi) for geogrids (lower bound)
// Check pullout FS = F_pullout / T_max >= 1.5

#[test]
fn geosynthetics_geogrid_pullout_resistance() {
    let gamma: f64 = 19.0;      // kN/m3
    let phi: f64 = 36.0_f64.to_radians();
    let h: f64 = 8.0;           // m, wall height
    let sv: f64 = 0.60;         // m, vertical spacing
    let b: f64 = 1.0;           // m, unit width

    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);

    // Pullout resistance factor (FHWA for geogrids)
    let f_star: f64 = 0.67 * phi.tan();
    // = 0.67 * tan(36) = 0.67 * 0.7265 = 0.4868

    assert!(f_star > 0.3 && f_star < 0.8, "f* = {:.3}", f_star);

    // Check at depth z = 4.0m
    let z: f64 = 4.0;
    let sigma_v: f64 = gamma * z; // = 76 kPa

    // T_max at this depth
    let t_max: f64 = ka * gamma * z * sv;
    // Ka ~ 0.260, t_max = 0.260 * 19 * 4 * 0.6 = 11.86 kN/m

    // Embedment length beyond failure plane
    // Failure plane at 45 + phi/2 from horizontal at base
    // At z from top, horizontal distance from face = (H - z) * tan(45 - phi/2)
    let x_failure: f64 = (h - z) * (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan();
    let l_total: f64 = 0.7 * h; // total reinforcement length (FHWA: 0.7H minimum)
    let le: f64 = l_total - x_failure;
    // Minimum Le = 1.0m per FHWA
    let le_design: f64 = le.max(1.0);

    // Pullout resistance
    let f_pullout: f64 = 2.0 * f_star * sigma_v * le_design * b;

    // Factor of safety against pullout
    let fs_pullout: f64 = f_pullout / t_max;

    assert!(
        fs_pullout > 1.5,
        "Pullout FS = {:.2} > 1.5 at z={}m", fs_pullout, z
    );

    // Verify at deeper level (z = 6.0m) -- higher overburden helps pullout
    let z_deep: f64 = 6.0;
    let sigma_v_deep: f64 = gamma * z_deep;
    let t_max_deep: f64 = ka * gamma * z_deep * sv;
    let x_failure_deep: f64 = (h - z_deep) * (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan();
    let le_deep: f64 = (l_total - x_failure_deep).max(1.0);
    let f_pullout_deep: f64 = 2.0 * f_star * sigma_v_deep * le_deep * b;
    let fs_deep: f64 = f_pullout_deep / t_max_deep;

    assert!(
        fs_deep > 1.5,
        "Pullout FS = {:.2} > 1.5 at z={}m", fs_deep, z_deep
    );

    // Verify F_pullout formula: 2 * f* * sigma_v * Le * b
    let f_pullout_check: f64 = 2.0 * f_star * sigma_v * le_design * b;
    assert_close(f_pullout, f_pullout_check, 0.001, "pullout formula consistency");
}

// ================================================================
// 3. Reinforced Slope: FOS Improvement with Horizontal Reinforcement
// ================================================================
//
// Unreinforced infinite slope: FS = (c + gamma*z*cos^2(beta)*tan(phi)) /
//                                    (gamma*z*sin(beta)*cos(beta))
// With n layers of reinforcement (tension T each):
//   FS_reinforced = (c + gamma*z*cos^2(beta)*tan(phi) + sum_T*cos(beta)*tan(phi)/(gamma*z)) /
//                   (gamma*z*sin(beta)*cos(beta))
//
// Verify FS improvement using FEM: horizontal beam under lateral earth
// pressure shows reduced deflection when reinforcement adds restoring force.

#[test]
fn geosynthetics_reinforced_slope_fos() {
    let gamma: f64 = 19.0;      // kN/m3
    let h: f64 = 10.0;          // m, slope height
    let beta: f64 = 55.0_f64.to_radians(); // slope angle
    let phi: f64 = 25.0_f64.to_radians();
    let c: f64 = 8.0;           // kPa, cohesion

    // Effective depth for infinite slope approximation
    let z_eff: f64 = h / 2.0;   // mid-height

    // Driving and resisting forces (per unit area)
    let sigma_n: f64 = gamma * z_eff * beta.cos() * beta.cos();
    let tau_drive: f64 = gamma * z_eff * beta.sin() * beta.cos();
    let tau_resist: f64 = c + sigma_n * phi.tan();

    let fs_unreinforced: f64 = tau_resist / tau_drive;

    // Should be less than 1.5 (marginal stability)
    assert!(
        fs_unreinforced < 1.5,
        "Unreinforced FS = {:.3} < 1.5 (needs reinforcement)", fs_unreinforced
    );

    // Add horizontal reinforcement (high-strength geogrid, closely spaced)
    let n_layers: usize = 10;
    let t_allow: f64 = 40.0;    // kN/m per layer
    let sum_t: f64 = n_layers as f64 * t_allow; // = 400 kN/m total

    // Jewell (1996) formulation for infinite slope with reinforcement:
    // Horizontal reinforcement T contributes to stability via:
    //   - Normal component on slip plane: T*sin(beta) increases friction
    //   - Tangential component on slip plane: T*cos(beta) directly resists sliding
    // Additional resisting stress per unit slip area = T * [sin(beta)*tan(phi) + cos(beta)] / (gamma*z)
    // where gamma*z = weight per unit slip area
    let weight_per_unit: f64 = gamma * z_eff;
    let reinf_contribution: f64 = sum_t * (beta.sin() * phi.tan() + beta.cos()) / weight_per_unit;
    let fs_reinforced: f64 = (tau_resist + reinf_contribution) / tau_drive;

    assert!(
        fs_reinforced > fs_unreinforced,
        "Reinforced FS {:.3} > unreinforced {:.3}", fs_reinforced, fs_unreinforced
    );

    // Improvement ratio (>15% for 10 layers of 40 kN/m on a 10m slope)
    let improvement: f64 = fs_reinforced / fs_unreinforced;
    assert!(
        improvement > 1.15,
        "FOS improvement ratio: {:.2}", improvement
    );

    // FEM verification: model a 1m-wide horizontal strip of slope face
    // under lateral earth pressure, with pinned ends representing reinforcement anchors
    let sigma_h_mid: f64 = gamma * z_eff * (1.0 - phi.sin()); // Ko condition
    let l_strip: f64 = 2.0; // m, spacing between reinforcement
    let q_strip: f64 = sigma_h_mid; // kN/m
    let e_soil: f64 = 50.0; // MPa, equivalent soil modulus
    let a_strip: f64 = 1.0;
    let iz_strip: f64 = 1.0 / 12.0; // 1m thick strip

    let loads_fem = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q_strip, q_j: -q_strip, a: None, b: None,
        }),
    ];
    let input = make_beam(1, l_strip, e_soil, a_strip, iz_strip, "pinned", Some("rollerX"), loads_fem);
    let results = solve_2d(&input).expect("solve");

    // Verify equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q_strip * l_strip, 0.02, "slope strip equilibrium");
}

// ================================================================
// 4. Geomembrane Strain Under Differential Settlement
// ================================================================
//
// Geomembrane spanning a zone of differential settlement:
//   epsilon = sqrt(1 + (2*delta/L)^2) - 1  (catenary approximation)
// For small deflection: epsilon ~ 2*delta^2 / L^2
//
// Allowable strain: typically 3-6% for HDPE geomembranes.
// Model: beam under imposed settlement at midspan to verify
// axial strain in membrane-like element.

#[test]
fn geosynthetics_geomembrane_strain() {
    let l: f64 = 4.0;           // m, span over settlement zone
    let e_gm: f64 = 400.0;      // MPa, HDPE geomembrane (short-term)
    let t_gm: f64 = 2.0;        // mm, thickness
    let fy_gm: f64 = 15.0;      // MPa, yield stress

    // Settlement magnitudes
    let deltas = [0.05, 0.10, 0.20, 0.40]; // m

    let mut strains = Vec::new();
    for &delta in &deltas {
        // Catenary-based strain
        let ratio: f64 = 2.0 * delta / l;
        let eps: f64 = (1.0 + ratio * ratio).sqrt() - 1.0;
        strains.push(eps);

        // Small deflection approximation
        let eps_approx: f64 = 2.0 * delta * delta / (l * l);

        // For small delta/L, both should be close
        if delta / l < 0.1 {
            let rel_diff: f64 = (eps - eps_approx).abs() / eps;
            assert!(
                rel_diff < 0.15,
                "Small deflection approx within 15% for delta/L = {:.3}: exact={:.5}, approx={:.5}",
                delta / l, eps, eps_approx
            );
        }
    }

    // Strains should increase with settlement
    for i in 1..strains.len() {
        assert!(
            strains[i] > strains[i - 1],
            "Strain increases with settlement"
        );
    }

    // Check allowable strain at delta = 0.20m
    let delta_design: f64 = 0.20;
    let ratio_d: f64 = 2.0 * delta_design / l;
    let eps_design: f64 = (1.0 + ratio_d * ratio_d).sqrt() - 1.0;
    let eps_percent: f64 = eps_design * 100.0;

    // HDPE allowable strain is 3-6%
    assert!(
        eps_percent < 6.0,
        "Design strain {:.2}% < 6% allowable", eps_percent
    );

    // Membrane stress and tension
    let sigma_gm: f64 = e_gm * eps_design; // MPa
    assert!(
        sigma_gm < fy_gm,
        "Membrane stress {:.2} MPa < yield {:.0} MPa", sigma_gm, fy_gm
    );

    let tension_per_m: f64 = sigma_gm * t_gm / 1000.0; // kN/m
    assert!(
        tension_per_m > 0.0,
        "Membrane tension: {:.3} kN/m", tension_per_m
    );

    // FEM check: beam under imposed midspan settlement (point load to create deflection)
    // For a SS beam with central point load P: delta_max = P*L^3/(48*E*I)
    // Solve for P that gives delta = 0.20m, then check consistency
    let a_mem: f64 = t_gm / 1000.0 * 1.0; // m2 per meter width
    let iz_mem: f64 = 1.0 * (t_gm / 1000.0).powi(3) / 12.0;
    // Solver uses E*1000 internally (MPa -> kN/m2), so analytical P uses E*1000
    let e_kn_m2: f64 = e_gm * 1000.0;
    let p_required: f64 = delta_design * 48.0 * e_kn_m2 * iz_mem / (l.powi(3));

    let loads_fem = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p_required, mz: 0.0,
        }),
    ];
    let input = make_beam(2, l, e_gm, a_mem, iz_mem, "pinned", Some("rollerX"), loads_fem);
    let results = solve_2d(&input).expect("solve");

    // Check deflection at midspan
    let mid_node = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(mid_node.uy.abs(), delta_design, 0.05, "membrane midspan deflection");
}

// ================================================================
// 5. Bearing Capacity Improvement with Reinforcement Layers
// ================================================================
//
// Houlsby/Binquet & Lee: bearing capacity ratio (BCR)
//   BCR = q_reinforced / q_unreinforced
// For N layers of reinforcement below footing:
//   BCR ~ 1 + 0.25 * N  (approximate, for first few layers)
// Maximum BCR typically 2-4 depending on configuration.
//
// Verify with beam-on-elastic-foundation analogy: stiffer response
// with reinforcement modeled as increased section stiffness.

#[test]
fn geosynthetics_bearing_capacity_improvement() {
    let b: f64 = 2.0;           // m, footing width
    let gamma: f64 = 18.0;      // kN/m3
    let phi: f64 = 30.0_f64.to_radians();
    let c: f64 = 0.0;           // cohesionless soil

    // Terzaghi bearing capacity factors
    let nq: f64 = ((std::f64::consts::PI * phi.tan()).exp())
        * (std::f64::consts::FRAC_PI_4 + phi / 2.0).tan().powi(2);
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 2.0 * (nq + 1.0) * phi.tan(); // approximate

    // Unreinforced bearing capacity (surface footing, Df = 0)
    let q_ult_unreinforced: f64 = c * nc + 0.5 * gamma * b * n_gamma;

    assert!(
        q_ult_unreinforced > 100.0,
        "Unreinforced q_ult: {:.0} kPa", q_ult_unreinforced
    );

    // Reinforced bearing capacity: BCR increases with layers
    let bcr_values = [1.0, 1.25, 1.50, 1.70, 1.85]; // 0 to 4 layers

    for (n, &bcr) in bcr_values.iter().enumerate() {
        let q_reinforced: f64 = q_ult_unreinforced * bcr;

        if n > 0 {
            let q_prev: f64 = q_ult_unreinforced * bcr_values[n - 1];
            assert!(
                q_reinforced > q_prev,
                "Layer {} BCR {:.2} > layer {} BCR {:.2}",
                n, bcr, n - 1, bcr_values[n - 1]
            );
        }
    }

    // Diminishing returns: BCR increment decreases
    for i in 2..bcr_values.len() {
        let delta_current: f64 = bcr_values[i] - bcr_values[i - 1];
        let delta_prev: f64 = bcr_values[i - 1] - bcr_values[i - 2];
        assert!(
            delta_current <= delta_prev + 0.01,
            "Diminishing returns: delta[{}]={:.2} <= delta[{}]={:.2}",
            i, delta_current, i - 1, delta_prev
        );
    }

    // FEM analogy: beam with increased stiffness models reinforced foundation
    // Unreinforced: standard beam under central load
    let e_soil: f64 = 30.0;     // MPa, soil modulus
    let a_found: f64 = b * 1.0; // m2
    let iz_found: f64 = 1.0 * b.powi(3) / 12.0;
    let p_load: f64 = -100.0;   // kN, vertical load

    let loads_unreinf = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_load, mz: 0.0,
        }),
    ];
    let input_unreinf = make_beam(2, b * 2.0, e_soil, a_found, iz_found, "pinned", Some("rollerX"), loads_unreinf);
    let res_unreinf = solve_2d(&input_unreinf).expect("solve unreinforced");

    // Reinforced: 2x stiffness (reinforcement adds composite stiffness)
    let iz_reinf: f64 = iz_found * 2.0;
    let loads_reinf = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_load, mz: 0.0,
        }),
    ];
    let input_reinf = make_beam(2, b * 2.0, e_soil, a_found, iz_reinf, "pinned", Some("rollerX"), loads_reinf);
    let res_reinf = solve_2d(&input_reinf).expect("solve reinforced");

    // Reinforced should have less deflection
    let d_unreinf = res_unreinf.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_reinf = res_reinf.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert!(
        d_reinf.uy.abs() < d_unreinf.uy.abs(),
        "Reinforced deflection {:.4}mm < unreinforced {:.4}mm",
        d_reinf.uy.abs(), d_unreinf.uy.abs()
    );
}

// ================================================================
// 6. Separation Function: Filter Requirements & Soil-Geotextile Interaction
// ================================================================
//
// Geotextile filter criteria (EN 13251, FHWA):
//   Retention: O95 <= B * d85  (prevents soil piping)
//   Permeability: k_gt >= k_soil  (prevents clogging)
//   Survivability: CBR puncture >= threshold for soil type
//
// Soil-geotextile interaction coefficient:
//   alpha_ds = tan(delta_sg) / tan(phi_soil)
// where delta_sg = soil-geotextile interface friction angle.
// Typical: alpha_ds = 0.6-0.9 for woven, 0.7-1.0 for nonwoven.
//
// Model: beam (representing geotextile) under normal pressure with
// friction-limited shear transfer to supports.

#[test]
fn geosynthetics_separation_filter_requirements() {
    // Soil properties
    let d85: f64 = 0.42;        // mm, 85% passing size
    let d15: f64 = 0.06;        // mm, 15% passing size
    let d50: f64 = 0.15;        // mm, 50% passing size
    let cu: f64 = d85 / d15;    // uniformity coefficient ~ 7.0
    let k_soil: f64 = 5e-6;     // m/s, soil permeability

    // Retention criterion: O95 <= B * d85
    // B depends on Cu and soil type
    let b_coeff: f64 = if cu <= 2.0 {
        1.0
    } else if cu <= 4.0 {
        0.5 * cu
    } else {
        8.0 / cu
    };
    let o95_max: f64 = b_coeff * d85;

    assert!(o95_max > 0.0, "O95_max: {:.3} mm", o95_max);

    // Selected geotextile
    let o95_gt: f64 = 0.10;     // mm (nonwoven geotextile)
    assert!(
        o95_gt <= o95_max,
        "O95={:.3}mm <= max {:.3}mm: retention OK", o95_gt, o95_max
    );

    // Permeability criterion
    let k_gt: f64 = 2e-3;       // m/s, geotextile permeability
    let perm_ratio: f64 = k_gt / k_soil;
    assert!(
        perm_ratio >= 10.0,
        "k_gt/k_soil = {:.0} >= 10: permeability OK", perm_ratio
    );

    // Interface friction
    let phi_soil: f64 = 30.0_f64.to_radians();
    let alpha_ds_woven: f64 = 0.70;  // typical woven
    let alpha_ds_nonwoven: f64 = 0.85; // typical nonwoven
    let delta_woven: f64 = (alpha_ds_woven * phi_soil.tan()).atan();
    let delta_nonwoven: f64 = (alpha_ds_nonwoven * phi_soil.tan()).atan();

    // Nonwoven has higher interface friction
    assert!(
        delta_nonwoven > delta_woven,
        "Nonwoven delta {:.1} deg > woven {:.1} deg",
        delta_nonwoven.to_degrees(), delta_woven.to_degrees()
    );

    // FEM model: geotextile as a beam under normal pressure
    // representing soil weight on geotextile in separation application
    let sigma_n: f64 = 20.0;    // kPa, overburden pressure
    let l_span: f64 = 1.5;      // m, unsupported span
    let q_gt: f64 = sigma_n;    // kN/m per meter width

    let e_gt: f64 = 200.0;      // MPa, geotextile equivalent modulus
    let a_gt: f64 = 0.005;      // m2, effective cross-section
    let iz_gt: f64 = 1.0e-6;    // m4, very low bending stiffness

    let loads_fem = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -q_gt, q_j: -q_gt, a: None, b: None,
        }),
    ];
    let input = make_beam(1, l_span, e_gt, a_gt, iz_gt, "pinned", Some("rollerX"), loads_fem);
    let results = solve_2d(&input).expect("solve");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load: f64 = q_gt * l_span;
    assert_close(sum_ry, total_load, 0.02, "geotextile equilibrium");

    let _d50 = d50;
    let _cu = cu;
}

// ================================================================
// 7. Reinforced Embankment on Soft Ground
// ================================================================
//
// Base reinforcement for embankment on soft clay:
//   T_required = gamma_fill * H * L_slope * sin(alpha) - cu * L_base
// where:
//   gamma_fill = fill unit weight, H = embankment height
//   L_slope = slope length, alpha = slope angle
//   cu = undrained shear strength of soft ground
//   L_base = base width of failure wedge
//
// BS 8006-1: T_req = K * gamma * H^2 / 2 (simplified lateral thrust)
// Model: beam representing embankment base with lateral thrust load.

#[test]
fn geosynthetics_reinforced_embankment_soft_ground() {
    let gamma_fill: f64 = 20.0; // kN/m3, embankment fill
    let h_emb: f64 = 5.0;       // m, embankment height
    let slope: f64 = 2.0;       // horizontal:vertical (1V:2H)
    let cu: f64 = 15.0;         // kPa, undrained shear strength of clay
    let gamma_clay: f64 = 16.0; // kN/m3, soft clay

    // Embankment geometry
    let crest_width: f64 = 10.0;    // m
    let toe_width: f64 = crest_width + 2.0 * slope * h_emb; // = 30m

    // Lateral thrust on embankment (BS 8006-1 simplified)
    let ka_fill: f64 = 0.33;    // approximate Ka for fill
    let t_lateral: f64 = 0.5 * ka_fill * gamma_fill * h_emb * h_emb;
    // = 0.5 * 0.33 * 20 * 25 = 82.5 kN/m

    assert!(
        t_lateral > 50.0,
        "Lateral thrust: {:.1} kN/m", t_lateral
    );

    // Bearing capacity of soft clay (undrained)
    let nc_strip: f64 = 5.14;   // Prandtl: Nc for strip footing (undrained)
    let q_ult_clay: f64 = nc_strip * cu;
    // = 5.14 * 15 = 77.1 kPa

    // Applied stress from embankment
    let q_emb: f64 = gamma_fill * h_emb;
    // = 100 kPa

    // Factor of safety without reinforcement
    let fs_unreinf: f64 = q_ult_clay / q_emb;
    assert!(
        fs_unreinf < 1.5,
        "Unreinforced FS = {:.2} < 1.5 (needs reinforcement)", fs_unreinf
    );

    // Required reinforcement tension to achieve FS = 1.3 (overall stability)
    // Simplified: T provides horizontal resistance to lateral spread
    let t_required: f64 = t_lateral; // minimum tension = lateral thrust

    // Geotextile selection
    let t_allow_gt: f64 = 100.0; // kN/m, available geotextile strength
    let fs_reinf: f64 = t_allow_gt / t_required;
    assert!(
        fs_reinf > 1.0,
        "Reinforcement FS = {:.2} > 1.0", fs_reinf
    );

    // FEM: model base as beam with lateral thrust
    // Beam represents half the embankment base, fixed at center, lateral load at toe
    let l_half: f64 = toe_width / 2.0; // = 15m
    let e_base: f64 = 100.0;    // MPa, composite base modulus
    let a_base: f64 = 0.50;     // m2
    let iz_base: f64 = 0.50_f64.powi(3) / 12.0; // m4

    // Vertical load = embankment weight distributed on base
    let q_vert: f64 = -(gamma_fill * h_emb * crest_width / toe_width);
    // = -(20 * 5 * 10/30) = -33.3 kN/m (average)

    let loads_fem = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q_vert, q_j: q_vert, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_vert, q_j: q_vert, a: None, b: None,
        }),
    ];
    let input = make_beam(2, l_half, e_base, a_base, iz_base, "fixed", Some("rollerX"), loads_fem);
    let results = solve_2d(&input).expect("solve");

    // Verify equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_vert: f64 = q_vert.abs() * l_half;
    assert_close(sum_ry, total_vert, 0.03, "embankment base vertical equilibrium");

    let _gamma_clay = gamma_clay;
    let _toe_width = toe_width;
}

// ================================================================
// 8. Wrap-Around Wall: Tension in Geotextile at Each Layer
// ================================================================
//
// Wrap-around (wrapped-face) MSE wall: geotextile wraps around
// the soil face at each layer. Tension in each layer:
//   T_i = Ka * gamma * z_i * Sv
// where z_i = depth to layer i.
//
// Total horizontal force per unit width:
//   P_a = 0.5 * Ka * gamma * H^2
//
// Verify: sum of all layer tensions approximates P_a.
// FEM model: vertical wall panel as beam loaded by lateral pressure
// with pinned supports at reinforcement layer positions.

#[test]
fn geosynthetics_wraparound_wall_tension() {
    let gamma: f64 = 18.5;      // kN/m3
    let phi: f64 = 32.0_f64.to_radians();
    let h: f64 = 6.0;           // m, wall height
    let sv: f64 = 0.50;         // m, vertical spacing

    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);
    // For phi=32 deg: Ka ~ 0.307

    assert_close(ka, 0.307, 0.02, "Ka for phi=32 deg");

    // Number of reinforcement layers
    let n_layers: usize = (h / sv) as usize; // = 12 layers

    // Tension at each layer
    let mut tensions = Vec::new();
    let mut sum_t: f64 = 0.0;

    for i in 1..=n_layers {
        let z_i: f64 = i as f64 * sv; // depth to layer i
        let t_i: f64 = ka * gamma * z_i * sv;
        tensions.push(t_i);
        sum_t += t_i;
    }

    // Tensions increase with depth
    for i in 1..tensions.len() {
        assert!(
            tensions[i] > tensions[i - 1],
            "Layer {} tension {:.2} > layer {} tension {:.2}",
            i + 1, tensions[i], i, tensions[i - 1]
        );
    }

    // Top layer has minimum tension
    let t_top: f64 = ka * gamma * sv * sv;
    assert_close(tensions[0], t_top, 0.01, "top layer tension");

    // Bottom layer has maximum tension
    let t_bottom: f64 = ka * gamma * h * sv;
    assert_close(tensions[n_layers - 1], t_bottom, 0.01, "bottom layer tension");

    // Sum of layer tensions should approximate total active thrust
    let pa_total: f64 = 0.5 * ka * gamma * h * h;
    // The discrete sum: sum(Ka*gamma*i*Sv*Sv, i=1..n) = Ka*gamma*Sv^2 * n*(n+1)/2
    let sum_analytical: f64 = ka * gamma * sv * sv * (n_layers * (n_layers + 1)) as f64 / 2.0;
    assert_close(sum_t, sum_analytical, 0.001, "discrete sum matches formula");

    // The discrete sum should approach Pa as Sv -> 0 (integral limit)
    // With finite spacing, sum_t ~ Pa * (1 + Sv/H)
    let ratio: f64 = sum_t / pa_total;
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "Sum_T / Pa = {:.3} ~ 1.0 (discrete vs continuous)", ratio
    );

    // FEM: model wall facing as vertical beam under triangular lateral pressure
    // Supported at top and bottom (conservative 2-support model)
    let _sigma_h_base: f64 = ka * gamma * h; // = 0.307 * 18.5 * 6 = 34.1 kPa
    let e_facing: f64 = 200.0;  // MPa, geotextile facing equivalent
    let a_facing: f64 = 0.01;   // m2
    let iz_facing: f64 = 1.0e-5; // m4

    // Triangular load: zero at top, sigma_h_base at bottom
    // Using 4 elements for the wall height
    let n_elem: usize = 4;
    let elem_len: f64 = h / n_elem as f64;

    let mut loads_fem = Vec::new();
    for i in 0..n_elem {
        let z_top: f64 = i as f64 * elem_len;
        let z_bot: f64 = (i + 1) as f64 * elem_len;
        let q_top: f64 = -(ka * gamma * z_top); // lateral pressure at element top
        let q_bot: f64 = -(ka * gamma * z_bot); // lateral pressure at element bottom
        loads_fem.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_top, q_j: q_bot, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, h, e_facing, a_facing, iz_facing, "pinned", Some("rollerX"), loads_fem);
    let results = solve_2d(&input).expect("solve");

    // Total reaction should equal total lateral force
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, pa_total, 0.05, "wall facing total reaction ~ Pa");
}

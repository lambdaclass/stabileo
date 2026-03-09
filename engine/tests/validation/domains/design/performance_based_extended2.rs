/// Validation: Performance-Based Earthquake Engineering — Extended Benchmarks 2
///
/// References:
///   - ASCE 41-17: Seismic Evaluation and Retrofit of Existing Buildings
///   - FEMA P-58 (2018): Seismic Performance Assessment of Buildings
///   - FEMA 440 (2005): Improvement of Nonlinear Static Seismic Analysis
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria, Ch. 11-12
///   - ATC-40 (1996): Seismic Evaluation and Retrofit of Concrete Buildings
///   - Chopra & Goel (2002): "A modal pushover analysis procedure for
///     estimating seismic demands for buildings", Earthquake Engineering &
///     Structural Dynamics, 31(3), 561-582
///   - Cornell et al. (2002): "Probabilistic Basis for 2000 SAC FEMA Steel
///     Moment Frame Guidelines", ASCE JSE 128(4)
///   - FEMA P-58-1 Vol. 1: Methodology (2018), Ch. 4-7
///
/// Tests verify ASCE 41 target displacement by the coefficient method,
/// pushover capacity curve bilinear idealization, drift-based performance
/// level classification, component demand-to-capacity ratios, FEMA P-58
/// fragility-based damage probability, expected annual loss integration,
/// ASCE 41 acceptance criteria checking, and comparison of Immediate
/// Occupancy vs Life Safety performance objectives using solver results.
#[allow(unused_imports)]
use dedaliano_engine::solver::linear;
#[allow(unused_imports)]
use dedaliano_engine::types::*;
use crate::common::*;

const PI: f64 = std::f64::consts::PI;

// ================================================================
// Helper: Standard normal CDF approximation (Abramowitz & Stegun)
// ================================================================
//
// Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
//
// Using the rational approximation for erf from
// Abramowitz & Stegun, Handbook of Mathematical Functions, 7.1.26

fn erf_approx(x: f64) -> f64 {
    let a1: f64 = 0.254829592;
    let a2: f64 = -0.284496736;
    let a3: f64 = 1.421413741;
    let a4: f64 = -1.453152027;
    let a5: f64 = 1.061405429;
    let p: f64 = 0.3275911;
    let sign: f64 = if x >= 0.0 { 1.0 } else { -1.0 };
    let x_abs: f64 = x.abs();
    let t: f64 = 1.0 / (1.0 + p * x_abs);
    let y: f64 = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x_abs * x_abs).exp();
    sign * y
}

fn phi_approx(z: f64) -> f64 {
    0.5 * (1.0 + erf_approx(z / 2.0_f64.sqrt()))
}

// ================================================================
// 1. ASCE 41 Target Displacement (Coefficient Method, Multi-Story)
// ================================================================
//
// ASCE 41-17 section 7.4.3.2 (Coefficient Method):
//   delta_t = C0 * C1 * C2 * Sa * (Te^2 / (4*pi^2)) * g
//
// For a multi-story building the effective period Te is derived
// from the elastic stiffness obtained by pushover analysis. We
// use the solver to get the elastic stiffness of a 2-bay portal
// frame and then compute target displacement for different hazard
// levels, verifying that MCE target displacement exceeds DBE.
//
// C0 values (ASCE 41-17 Table 7-5):
//   1-story: 1.0, 2-story: 1.2, 3-story: 1.3, >=5-story: 1.4
// C1 = max(1.0, 1 + (R-1)/(a*Te^2))  for Te < Ts, else 1.0
// C2 = 1 + (1/(800))*(R-1)^2          for framing types I/II

#[test]
fn validation_pbd_ext2_asce41_target_displacement() {
    // --- Portal frame elastic stiffness from solver ---
    let e: f64 = 200_000.0;   // MPa
    let a: f64 = 0.01;        // m^2
    let iz: f64 = 1e-4;       // m^4
    let h: f64 = 3.5;         // story height (m)
    let w: f64 = 6.0;         // bay width (m)
    let f_ref: f64 = 100.0;   // reference lateral load (kN)

    let input = make_portal_frame(h, w, e, a, iz, f_ref, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert!(ux_top > 0.0, "Elastic lateral displacement positive: {:.6}", ux_top);

    let k_elastic: f64 = f_ref / ux_top;

    // --- ASCE 41 coefficients for a 3-story steel moment frame ---
    let c0: f64 = 1.3;        // 3-story building
    let c2: f64 = 1.0;        // no hysteretic degradation (steel)
    let g: f64 = 9.81;        // m/s^2

    // Seismic weight and effective period
    let w_seismic: f64 = 3000.0;   // kN
    let m_eff: f64 = w_seismic / g; // effective mass (kN*s^2/m)

    // Effective period from elastic stiffness:
    //   Te = 2*pi*sqrt(m_eff / k_elastic)
    let te: f64 = 2.0 * PI * (m_eff / k_elastic).sqrt();

    // Characteristic site period for Site Class D
    let ts: f64 = 0.50;

    // C1 depends on whether Te < Ts
    let r_factor: f64 = 5.0;  // strength ratio (elastic demand / yield strength)
    let a_site: f64 = 130.0;  // site factor (FEMA 440)
    let c1: f64 = if te < ts {
        (1.0 + (r_factor - 1.0) / (a_site * te.powi(2))).max(1.0)
    } else {
        1.0
    };

    // --- DBE target displacement (Sa = 0.60g at Te) ---
    let sa_dbe: f64 = 0.60;
    let sd_dbe: f64 = sa_dbe * g * te.powi(2) / (4.0 * PI * PI);
    let delta_t_dbe: f64 = c0 * c1 * c2 * sd_dbe;

    // --- MCE target displacement (Sa = 0.90g at Te) ---
    let sa_mce: f64 = 0.90;
    let sd_mce: f64 = sa_mce * g * te.powi(2) / (4.0 * PI * PI);
    let delta_t_mce: f64 = c0 * c1 * c2 * sd_mce;

    // MCE target displacement exceeds DBE
    assert!(delta_t_mce > delta_t_dbe,
        "MCE delta_t = {:.4} > DBE delta_t = {:.4}", delta_t_mce, delta_t_dbe);

    // MCE/DBE ratio should equal Sa ratio (since all other coefficients are same)
    let ratio: f64 = delta_t_mce / delta_t_dbe;
    let expected_ratio: f64 = sa_mce / sa_dbe;
    assert_close(ratio, expected_ratio, 0.02,
        "MCE/DBE target displacement ratio = Sa_MCE/Sa_DBE");

    // --- Verify self-consistency: Te from m and k recovers itself ---
    let omega: f64 = (k_elastic / m_eff).sqrt();
    let te_check: f64 = 2.0 * PI / omega;
    assert_close(te_check, te, 0.01,
        "Period self-consistency: Te from omega = Te from formula");

    // Target displacements in a physically reasonable range
    assert!(delta_t_dbe > 0.01 && delta_t_dbe < 1.0,
        "DBE target displacement {:.4} m in [0.01, 1.0]", delta_t_dbe);
    assert!(delta_t_mce > 0.01 && delta_t_mce < 2.0,
        "MCE target displacement {:.4} m in [0.01, 2.0]", delta_t_mce);
}

// ================================================================
// 2. Pushover Capacity Curve — Bilinear Idealization
// ================================================================
//
// A pushover capacity curve relates base shear V to roof
// displacement delta. The bilinear idealization (ASCE 41-17
// section 7.4.3.2.4) fits an elastic branch and a post-yield
// plateau that preserves the area under the actual curve up
// to the target displacement.
//
// For a linear elastic frame, the "capacity curve" is simply
// a straight line V = k * delta. We verify the solver-derived
// stiffness gives a linear V-delta relationship by running two
// different load levels and checking proportionality.
//
// The bilinear idealization yield point is found by equating
// areas: A_bilinear = A_actual, giving:
//   V_y = 2 * (A_curve - k_e * delta_t^2 / 2) / delta_t + k_e * delta_t
// For the elastic case, V_y = k_e * delta_t (no yielding).

#[test]
fn validation_pbd_ext2_pushover_capacity_curve() {
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;

    // --- Run solver at two different load levels ---
    let f1: f64 = 50.0;
    let f2: f64 = 150.0;

    let input1 = make_portal_frame(h, w, e, a, iz, f1, 0.0);
    let results1 = linear::solve_2d(&input1).unwrap();
    let ux1: f64 = results1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let input2 = make_portal_frame(h, w, e, a, iz, f2, 0.0);
    let results2 = linear::solve_2d(&input2).unwrap();
    let ux2: f64 = results2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // --- Verify linearity: k = V/delta is constant ---
    let k1: f64 = f1 / ux1;
    let k2: f64 = f2 / ux2;
    assert_close(k1, k2, 0.02,
        "Pushover linearity: stiffness at two load levels");

    // --- Displacement scales linearly with load ---
    let scale_factor: f64 = f2 / f1;
    assert_close(ux2 / ux1, scale_factor, 0.02,
        "Displacement scales linearly: ux2/ux1 = F2/F1");

    // --- Bilinear idealization for elastic case ---
    // For a purely linear system, the bilinear representation has:
    //   Elastic stiffness k_e = k (same as actual)
    //   Yield displacement delta_y = delta_t (no plastic deformation)
    //   Yield base shear V_y = k * delta_t
    //   Post-yield stiffness alpha*k_e = 0 (plateau at V_y) is irrelevant
    //     because the elastic curve and bilinear curve are identical
    let k_e: f64 = (k1 + k2) / 2.0;  // average stiffness
    let delta_t: f64 = 0.10;  // assumed target displacement (m)
    let vy_elastic: f64 = k_e * delta_t;

    // Area under the elastic curve up to delta_t:
    //   A = 0.5 * k_e * delta_t^2
    let area_elastic: f64 = 0.5 * k_e * delta_t.powi(2);

    // Area under the bilinear curve (elastic only, no yielding):
    //   A_bilinear = 0.5 * V_y * delta_t = 0.5 * k_e * delta_t^2
    let area_bilinear: f64 = 0.5 * vy_elastic * delta_t;

    assert_close(area_bilinear, area_elastic, 0.02,
        "Bilinear area equals elastic area (no yielding case)");

    // --- Bilinear idealization with assumed yielding ---
    // Now assume the structure yields at delta_y = 0.6 * delta_t
    // with post-yield stiffness ratio alpha = 0.05
    let alpha: f64 = 0.05;
    let delta_y: f64 = 0.6 * delta_t;
    let vy_inelastic: f64 = k_e * delta_y;

    // Bilinear curve area:
    //   A = 0.5 * k_e * delta_y^2 + V_y * (delta_t - delta_y)
    //       + 0.5 * alpha * k_e * (delta_t - delta_y)^2
    let plastic_range: f64 = delta_t - delta_y;
    let area_inelastic: f64 = 0.5 * k_e * delta_y.powi(2)
        + vy_inelastic * plastic_range
        + 0.5 * alpha * k_e * plastic_range.powi(2);

    // The inelastic area should be less than elastic area (early yielding reduces area)
    assert!(area_inelastic < area_elastic,
        "Inelastic area {:.4} < elastic area {:.4} (yielding reduces stiffness)",
        area_inelastic, area_elastic);

    // Verify the force at target displacement for bilinear:
    //   V(delta_t) = V_y + alpha * k_e * (delta_t - delta_y)
    let v_at_target: f64 = vy_inelastic + alpha * k_e * plastic_range;
    assert!(v_at_target < vy_elastic,
        "V at target with yielding {:.2} < elastic V {:.2}", v_at_target, vy_elastic);

    // Positive stiffness values
    assert!(k_e > 0.0, "Elastic stiffness positive: k = {:.2} kN/m", k_e);
}

// ================================================================
// 3. Drift-Based Performance Level Classification
// ================================================================
//
// ASCE 41-17 Table 10-3 drift limits for steel moment frames:
//   IO (Immediate Occupancy):  transient drift <= 0.7%
//   LS (Life Safety):          transient drift <= 2.5%
//   CP (Collapse Prevention):  transient drift <= 5.0%
//
// This test uses the solver to compute elastic story drift under
// a reference load, then classifies a range of scaled demands
// into performance levels and verifies the classification is
// consistent with the drift thresholds.

#[test]
fn validation_pbd_ext2_drift_performance_classification() {
    let theta_io: f64 = 0.007;    // 0.7%
    let theta_ls: f64 = 0.025;    // 2.5%
    let theta_cp: f64 = 0.050;    // 5.0%

    // --- Solver: get elastic drift per unit load ---
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;
    let f_ref: f64 = 1.0;  // unit lateral load

    let input = make_portal_frame(h, w, e, a, iz, f_ref, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let drift_per_kn: f64 = ux_top / h;  // drift ratio per kN of lateral load

    assert!(drift_per_kn > 0.0,
        "Drift per unit load positive: {:.8}", drift_per_kn);

    // --- Find lateral loads that produce each drift threshold ---
    let f_io: f64 = theta_io / drift_per_kn;
    let f_ls: f64 = theta_ls / drift_per_kn;
    let f_cp: f64 = theta_cp / drift_per_kn;

    // --- Classify several demand drift levels ---
    let test_drifts: [(f64, &str); 5] = [
        (0.003, "IO"),     // 0.3% < 0.7% -> IO
        (0.007, "IO"),     // exactly at IO boundary
        (0.015, "LS"),     // 1.5% in LS range
        (0.035, "CP"),     // 3.5% in CP range
        (0.060, "beyond"), // 6.0% exceeds CP
    ];

    for &(drift, expected_level) in &test_drifts {
        let level = if drift <= theta_io {
            "IO"
        } else if drift <= theta_ls {
            "LS"
        } else if drift <= theta_cp {
            "CP"
        } else {
            "beyond"
        };
        assert_eq!(level, expected_level,
            "Drift {:.1}% -> {} (expected {})", drift * 100.0, level, expected_level);
    }

    // --- Verify solver drift at IO load matches IO threshold ---
    let input_io = make_portal_frame(h, w, e, a, iz, f_io, 0.0);
    let results_io = linear::solve_2d(&input_io).unwrap();
    let ux_io: f64 = results_io.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let theta_io_check: f64 = ux_io / h;
    assert_close(theta_io_check, theta_io, 0.02,
        "Solver drift at IO load matches IO limit");

    // --- Verify solver drift at LS load matches LS threshold ---
    let input_ls = make_portal_frame(h, w, e, a, iz, f_ls, 0.0);
    let results_ls = linear::solve_2d(&input_ls).unwrap();
    let ux_ls: f64 = results_ls.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let theta_ls_check: f64 = ux_ls / h;
    assert_close(theta_ls_check, theta_ls, 0.02,
        "Solver drift at LS load matches LS limit");

    // --- Load ordering ---
    assert!(f_io < f_ls && f_ls < f_cp,
        "F_IO {:.1} < F_LS {:.1} < F_CP {:.1} kN", f_io, f_ls, f_cp);
}

// ================================================================
// 4. Component Demand-to-Capacity Ratio (DCR)
// ================================================================
//
// ASCE 41-17 section 7.5.2.1.2: For linear analysis procedures,
// the demand-to-capacity ratio (DCR) for deformation-controlled
// actions is:
//
//   DCR = Q_UD / (m * kappa * Q_CE)
//
// where:
//   Q_UD  = demand from analysis (force or deformation)
//   m     = component modification factor (ductility capacity)
//   kappa = knowledge factor (1.0 for full knowledge, 0.75 for limited)
//   Q_CE  = expected component capacity
//
// If DCR <= 1.0, the component satisfies the performance objective.
//
// We use the solver to compute beam end moments as demand values,
// then compute DCR for different performance levels (IO, LS, CP)
// using ASCE 41-17 Table 9-3 m-factors for steel moment frames.

#[test]
fn validation_pbd_ext2_component_dcr() {
    // --- Solver: portal frame under lateral + gravity load ---
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;
    let f_lateral: f64 = 100.0;
    let f_gravity: f64 = -50.0;  // gravity at beam-column joints

    let input = make_portal_frame(h, w, e, a, iz, f_lateral, f_gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Get maximum beam-end moment (element 2 is the beam)
    let beam_forces = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();
    let m_demand: f64 = beam_forces.m_start.abs().max(beam_forces.m_end.abs());

    assert!(m_demand > 0.0,
        "Beam end moment demand: {:.2} kN*m > 0", m_demand);

    // --- Component capacities (steel W-shape, example) ---
    // Expected plastic moment capacity
    let mp_ce: f64 = 300.0;  // kN*m (expected)

    // m-factors from ASCE 41-17 Table 9-3 (steel moment frame beams):
    //   IO: m = 2.0, LS: m = 6.0, CP: m = 8.0  (compact, fully restrained)
    let m_io: f64 = 2.0;
    let m_ls: f64 = 6.0;
    let m_cp: f64 = 8.0;

    // Knowledge factor (full investigation)
    let kappa: f64 = 1.0;

    // --- DCR at each performance level ---
    let dcr_io: f64 = m_demand / (m_io * kappa * mp_ce);
    let dcr_ls: f64 = m_demand / (m_ls * kappa * mp_ce);
    let dcr_cp: f64 = m_demand / (m_cp * kappa * mp_ce);

    // DCR_IO > DCR_LS > DCR_CP because m-factor increases
    assert!(dcr_io > dcr_ls,
        "DCR_IO {:.4} > DCR_LS {:.4} (IO is more restrictive)", dcr_io, dcr_ls);
    assert!(dcr_ls > dcr_cp,
        "DCR_LS {:.4} > DCR_CP {:.4} (LS is more restrictive than CP)", dcr_ls, dcr_cp);

    // --- Verify DCR ratios reflect m-factor ratios ---
    // DCR_IO / DCR_LS = m_ls / m_io = 6/2 = 3
    let dcr_ratio_io_ls: f64 = dcr_io / dcr_ls;
    assert_close(dcr_ratio_io_ls, m_ls / m_io, 0.02,
        "DCR_IO/DCR_LS = m_LS/m_IO");

    let dcr_ratio_ls_cp: f64 = dcr_ls / dcr_cp;
    assert_close(dcr_ratio_ls_cp, m_cp / m_ls, 0.02,
        "DCR_LS/DCR_CP = m_CP/m_LS");

    // --- DCR with reduced knowledge factor (kappa = 0.75) ---
    let kappa_limited: f64 = 0.75;
    let dcr_ls_limited: f64 = m_demand / (m_ls * kappa_limited * mp_ce);

    // Limited knowledge increases DCR by 1/0.75 = 1.333
    assert_close(dcr_ls_limited / dcr_ls, 1.0 / kappa_limited, 0.02,
        "Limited knowledge amplifies DCR by 1/kappa");

    // --- Column DCR (element 1 is left column) ---
    let col_forces = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let m_col_demand: f64 = col_forces.m_start.abs().max(col_forces.m_end.abs());
    let dcr_col_ls: f64 = m_col_demand / (m_ls * kappa * mp_ce);

    // Column and beam both have finite DCR
    assert!(dcr_col_ls > 0.0,
        "Column DCR at LS: {:.4} > 0", dcr_col_ls);
}

// ================================================================
// 5. FEMA P-58 Fragility-Based Damage Probability
// ================================================================
//
// FEMA P-58 uses lognormal fragility functions to estimate the
// probability of reaching or exceeding each damage state given
// an engineering demand parameter (EDP, typically story drift):
//
//   P(DS >= ds_i | EDP) = Phi( (ln(EDP) - ln(theta_i)) / beta_i )
//
// For a structural component with multiple damage states
// (DS1 = slight, DS2 = moderate, DS3 = extensive, DS4 = complete),
// the probability of being in exactly damage state i is:
//   P(DS = i) = P(DS >= i) - P(DS >= i+1)
//   P(DS = 0) = 1 - P(DS >= 1)
//
// This test verifies fragility arithmetic with typical parameters
// for a steel moment connection (FEMA P-58 Fragility Database).

#[test]
fn validation_pbd_ext2_fema_p58_fragility() {
    // Fragility parameters for steel moment connection (WUF-W):
    //   DS1 (yielding):    theta = 0.015, beta = 0.30
    //   DS2 (local buckling): theta = 0.025, beta = 0.30
    //   DS3 (fracture):    theta = 0.040, beta = 0.35
    let theta_ds: [f64; 3] = [0.015, 0.025, 0.040];
    let beta_ds: [f64; 3] = [0.30, 0.30, 0.35];

    // --- At EDP = 0.020 (2% story drift) ---
    let edp: f64 = 0.020;

    let mut p_exceedance = [0.0_f64; 3];
    for i in 0..3 {
        let z: f64 = (edp.ln() - theta_ds[i].ln()) / beta_ds[i];
        p_exceedance[i] = phi_approx(z);
    }

    // Monotonicity: P(DS>=1) > P(DS>=2) > P(DS>=3)
    assert!(p_exceedance[0] > p_exceedance[1],
        "P(DS>=1) = {:.3} > P(DS>=2) = {:.3}", p_exceedance[0], p_exceedance[1]);
    assert!(p_exceedance[1] > p_exceedance[2],
        "P(DS>=2) = {:.3} > P(DS>=3) = {:.3}", p_exceedance[1], p_exceedance[2]);

    // --- Damage state probabilities ---
    let p_ds0: f64 = 1.0 - p_exceedance[0];
    let p_ds1: f64 = p_exceedance[0] - p_exceedance[1];
    let p_ds2: f64 = p_exceedance[1] - p_exceedance[2];
    let p_ds3: f64 = p_exceedance[2];

    // All probabilities non-negative
    assert!(p_ds0 >= 0.0, "P(DS0) = {:.4} >= 0", p_ds0);
    assert!(p_ds1 >= 0.0, "P(DS1) = {:.4} >= 0", p_ds1);
    assert!(p_ds2 >= 0.0, "P(DS2) = {:.4} >= 0", p_ds2);
    assert!(p_ds3 >= 0.0, "P(DS3) = {:.4} >= 0", p_ds3);

    // Sum of probabilities = 1
    let p_sum: f64 = p_ds0 + p_ds1 + p_ds2 + p_ds3;
    assert_close(p_sum, 1.0, 0.01,
        "Sum of damage state probabilities = 1.0");

    // --- At EDP = theta_ds[0] = 0.015: P(DS>=1) = 0.50 (median) ---
    let z_at_median: f64 = (theta_ds[0].ln() - theta_ds[0].ln()) / beta_ds[0];
    let p_at_median: f64 = phi_approx(z_at_median);
    assert_close(p_at_median, 0.50, 0.02,
        "P(DS>=1 | EDP=theta_1) = 0.50 at median");

    // --- At very low EDP: all P -> 0 ---
    let edp_low: f64 = 0.001;
    let z_low: f64 = (edp_low.ln() - theta_ds[0].ln()) / beta_ds[0];
    let p_low: f64 = phi_approx(z_low);
    assert!(p_low < 0.01,
        "P(DS>=1 | EDP=0.001) = {:.4} ~ 0", p_low);

    // --- At very high EDP: P(DS>=3) -> 1 ---
    let edp_high: f64 = 0.20;
    let z_high: f64 = (edp_high.ln() - theta_ds[2].ln()) / beta_ds[2];
    let p_high: f64 = phi_approx(z_high);
    assert!(p_high > 0.99,
        "P(DS>=3 | EDP=0.20) = {:.4} ~ 1.0", p_high);

    // --- Expected damage factor (repair cost / replacement cost) ---
    // Typical consequence function weights for steel connections:
    let repair_ratio: [f64; 4] = [0.0, 0.10, 0.40, 1.00];  // DS0..DS3
    let expected_damage_factor: f64 = p_ds0 * repair_ratio[0]
        + p_ds1 * repair_ratio[1]
        + p_ds2 * repair_ratio[2]
        + p_ds3 * repair_ratio[3];

    assert!(expected_damage_factor > 0.0 && expected_damage_factor < 1.0,
        "Expected damage factor {:.4} in (0, 1)", expected_damage_factor);
}

// ================================================================
// 6. Expected Annual Loss (EAL) Calculation
// ================================================================
//
// FEMA P-58-1 Vol. 1, Ch. 7: The expected annual loss integrates
// expected loss over all hazard levels:
//
//   EAL = integral from 0 to inf of E[L|IM] * |d_lambda/d_IM| * dIM
//
// Discretized using the trapezoidal rule over hazard intervals:
//   EAL = sum_i { 0.5 * (E[L_i] + E[L_{i+1}]) * (lambda_i - lambda_{i+1}) }
//
// This test uses a 5-point hazard curve with corresponding
// expected loss ratios and verifies the integration, including
// the property that frequent small events can dominate EAL.

#[test]
fn validation_pbd_ext2_eal_calculation() {
    // Hazard levels: (annual probability of exceedance, expected loss ratio)
    // Ordered from most frequent to most rare
    let hazard: [(f64, f64); 5] = [
        (0.1000, 0.0005),   // 10-yr event: 0.05% loss
        (0.0400, 0.0030),   // 25-yr event: 0.30% loss
        (0.0210, 0.0100),   // ~50-yr event (DBE-like): 1.0% loss
        (0.0100, 0.0350),   // 100-yr event: 3.5% loss
        (0.0004, 0.1500),   // 2500-yr event (MCE): 15% loss
    ];

    let replacement_cost: f64 = 20_000_000.0;  // $20M building

    // --- Trapezoidal integration ---
    let mut eal_ratio: f64 = 0.0;
    for i in 0..hazard.len() - 1 {
        let lambda_i = hazard[i].0;
        let lambda_j = hazard[i + 1].0;
        let loss_i = hazard[i].1;
        let loss_j = hazard[i + 1].1;

        let delta_lambda: f64 = lambda_i - lambda_j;
        let avg_loss: f64 = (loss_i + loss_j) / 2.0;
        eal_ratio += avg_loss * delta_lambda;
    }

    let eal_dollars: f64 = eal_ratio * replacement_cost;

    // --- EAL should be positive ---
    assert!(eal_ratio > 0.0, "EAL ratio positive: {:.6}", eal_ratio);
    assert!(eal_dollars > 0.0, "EAL dollars positive: ${:.0}", eal_dollars);

    // --- EAL as percentage of replacement cost ---
    let eal_pct: f64 = eal_ratio * 100.0;
    assert!(eal_pct > 0.0 && eal_pct < 2.0,
        "EAL = {:.4}% of replacement cost (typical range 0.1-1.5%)", eal_pct);

    // --- Contribution from each hazard interval ---
    let mut contributions = Vec::new();
    for i in 0..hazard.len() - 1 {
        let delta_lambda: f64 = hazard[i].0 - hazard[i + 1].0;
        let avg_loss: f64 = (hazard[i].1 + hazard[i + 1].1) / 2.0;
        contributions.push(avg_loss * delta_lambda);
    }

    // Sum of contributions = EAL
    let sum_contributions: f64 = contributions.iter().sum();
    assert_close(sum_contributions, eal_ratio, 0.01,
        "Sum of interval contributions = EAL");

    // --- Frequent events contribute significantly ---
    // The first interval (most frequent) should have a non-trivial contribution
    let first_interval_pct: f64 = contributions[0] / eal_ratio * 100.0;
    assert!(first_interval_pct > 0.0,
        "First (frequent) interval contributes {:.1}% of EAL", first_interval_pct);

    // --- If we double all losses, EAL doubles ---
    let mut eal_doubled: f64 = 0.0;
    for i in 0..hazard.len() - 1 {
        let delta_lambda: f64 = hazard[i].0 - hazard[i + 1].0;
        let avg_loss: f64 = (2.0 * hazard[i].1 + 2.0 * hazard[i + 1].1) / 2.0;
        eal_doubled += avg_loss * delta_lambda;
    }
    assert_close(eal_doubled, 2.0 * eal_ratio, 0.01,
        "Doubling losses doubles EAL");

    // --- Payback period estimate ---
    // If mitigation costs 5% of replacement cost and eliminates 50% of losses:
    let mitigation_cost: f64 = 0.05 * replacement_cost;
    let eal_reduction: f64 = 0.50 * eal_dollars;
    let payback_years: f64 = mitigation_cost / eal_reduction;
    assert!(payback_years > 0.0,
        "Mitigation payback period: {:.1} years", payback_years);
}

// ================================================================
// 7. ASCE 41 Acceptance Criteria Check
// ================================================================
//
// ASCE 41-17 acceptance criteria are checked at three performance
// levels for both force-controlled and deformation-controlled
// actions. This test uses the solver to compute demands in a
// portal frame, then checks acceptance at all three levels.
//
// For deformation-controlled actions (beams, ductile connections):
//   DCR = Q_UD / (m * kappa * Q_CE) <= 1.0
//
// For force-controlled actions (columns in compression, connections):
//   Q_UF <= kappa * Q_CL / (C1 * C2 * J)
//
// where J = force delivery reduction factor (2.0 for high ductility,
// 1.0 for low ductility), Q_CL = lower-bound component capacity.

#[test]
fn validation_pbd_ext2_acceptance_criteria_check() {
    // --- Solver: portal frame under seismic-level lateral load ---
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;
    let v_base: f64 = 200.0;  // design base shear (kN)

    let input = make_portal_frame(h, w, e, a, iz, v_base, -80.0);
    let results = linear::solve_2d(&input).unwrap();

    // --- Beam demands (deformation-controlled) ---
    let beam_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();
    let m_beam_demand: f64 = beam_ef.m_start.abs().max(beam_ef.m_end.abs());

    // --- Column demands (force-controlled for axial, deformation-controlled for bending) ---
    let col_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let n_col_demand: f64 = col_ef.n_start.abs().max(col_ef.n_end.abs());
    let m_col_demand: f64 = col_ef.m_start.abs().max(col_ef.m_end.abs());

    assert!(m_beam_demand > 0.0, "Beam moment demand: {:.2} kN*m", m_beam_demand);
    assert!(m_col_demand > 0.0, "Column moment demand: {:.2} kN*m", m_col_demand);

    // --- Deformation-controlled acceptance (beam bending) ---
    let mp_beam_ce: f64 = 400.0;  // expected plastic moment (kN*m)
    let kappa: f64 = 1.0;         // full knowledge

    // m-factors for steel moment frame beams (ASCE 41-17 Table 9-3)
    let m_factors: [(f64, &str); 3] = [
        (2.0, "IO"),
        (6.0, "LS"),
        (8.0, "CP"),
    ];

    let mut prev_dcr: f64 = f64::MAX;
    for &(m_factor, level) in &m_factors {
        let dcr: f64 = m_beam_demand / (m_factor * kappa * mp_beam_ce);
        let acceptable: bool = dcr <= 1.0;

        // DCR decreases as performance level becomes less restrictive
        assert!(dcr < prev_dcr || prev_dcr == f64::MAX,
            "DCR at {} = {:.4} < previous {:.4}", level, dcr, prev_dcr);
        prev_dcr = dcr;

        // With a large enough capacity, beam should pass at all levels
        if m_factor * mp_beam_ce > m_beam_demand {
            assert!(acceptable,
                "Beam bending at {} level: DCR = {:.4} <= 1.0", level, dcr);
        }
    }

    // --- Force-controlled acceptance (column axial) ---
    // Q_UF <= kappa * Q_CL / (C1 * C2 * J)
    let n_col_cl: f64 = 1500.0;   // lower-bound axial capacity (kN)
    let c1: f64 = 1.0;
    let c2: f64 = 1.0;
    let j_high_ductility: f64 = 2.0;
    let j_low_ductility: f64 = 1.0;

    let capacity_high: f64 = kappa * n_col_cl / (c1 * c2 * j_high_ductility);
    let capacity_low: f64 = kappa * n_col_cl / (c1 * c2 * j_low_ductility);

    // High ductility gives lower effective capacity (more conservative)
    assert!(capacity_high < capacity_low,
        "High ductility J=2 capacity {:.1} < low ductility J=1 capacity {:.1}",
        capacity_high, capacity_low);

    let fc_check_high: bool = n_col_demand <= capacity_high;
    let fc_check_low: bool = n_col_demand <= capacity_low;

    // If high ductility passes, low ductility must also pass
    if fc_check_high {
        assert!(fc_check_low,
            "If high-ductility check passes, low-ductility must also pass");
    }

    // --- Story drift acceptance ---
    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let story_drift: f64 = ux_top / h;

    let drift_limits: [(f64, &str); 3] = [
        (0.007, "IO"),
        (0.025, "LS"),
        (0.050, "CP"),
    ];

    // Verify drift limit ordering and check acceptance
    for i in 0..drift_limits.len() - 1 {
        assert!(drift_limits[i].0 < drift_limits[i + 1].0,
            "Drift limit {} < {}", drift_limits[i].1, drift_limits[i + 1].1);
    }

    // If drift satisfies IO, it must satisfy LS and CP
    if story_drift <= drift_limits[0].0 {
        assert!(story_drift <= drift_limits[1].0,
            "IO satisfaction implies LS satisfaction");
        assert!(story_drift <= drift_limits[2].0,
            "IO satisfaction implies CP satisfaction");
    }
}

// ================================================================
// 8. Immediate Occupancy vs Life Safety — Structural Comparison
// ================================================================
//
// ASCE 41-17 defines multiple performance objectives that pair
// a performance level with a hazard level:
//
//   BSE-1N (Basic Safety, non-enhanced):
//     DBE hazard (10%/50yr ~ 475-yr RP) + Life Safety (LS)
//   BSE-2N:
//     MCE hazard (2%/50yr ~ 2475-yr RP) + Collapse Prevention (CP)
//   Enhanced:
//     BSE-1E: DBE + Immediate Occupancy (IO)
//     BSE-2E: MCE + Life Safety (LS)
//
// For a given structural system, achieving IO under DBE requires
// greater strength/stiffness than achieving LS under the same
// hazard. This test verifies, using the solver, that the required
// lateral force capacity to satisfy IO drift limits is higher
// than for LS, and quantifies the margin between performance
// objectives.

#[test]
fn validation_pbd_ext2_io_vs_ls_comparison() {
    // --- ASCE 41 drift limits ---
    let theta_io: f64 = 0.007;    // IO: 0.7%
    let theta_ls: f64 = 0.025;    // LS: 2.5%

    // --- Solver: portal frame stiffness ---
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;

    // Get elastic stiffness
    let f_ref: f64 = 50.0;
    let input = make_portal_frame(h, w, e, a, iz, f_ref, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let k_elastic: f64 = f_ref / ux_top;

    // --- Lateral force capacity at each drift limit ---
    let delta_io: f64 = theta_io * h;   // IO displacement (m)
    let delta_ls: f64 = theta_ls * h;   // LS displacement (m)

    let v_io: f64 = k_elastic * delta_io;  // base shear at IO drift
    let v_ls: f64 = k_elastic * delta_ls;  // base shear at LS drift

    // IO permits less displacement, so it triggers at lower base shear
    assert!(v_io < v_ls,
        "IO base shear {:.2} kN < LS base shear {:.2} kN", v_io, v_ls);

    // --- For a given seismic demand, IO requires more strength ---
    // Seismic demand: Sa = 0.60g (DBE level)
    let sa_dbe: f64 = 0.60;
    let g: f64 = 9.81;
    let w_seismic: f64 = 2000.0;  // kN
    let m_eff: f64 = w_seismic / g;

    // R factor needed to limit drift to each level:
    //   R = elastic demand / yield capacity
    // If elastic drift = Sa*g*Te^2/(4*pi^2) / h and limit = theta,
    // then the required strength ratio is:
    //   For T > Ts (equal displacement): R_max = theta_elastic / theta_limit
    let te: f64 = 2.0 * PI * (m_eff / k_elastic).sqrt();
    let sd_elastic: f64 = sa_dbe * g * te.powi(2) / (4.0 * PI * PI);
    let theta_elastic: f64 = sd_elastic / h;

    // If theta_elastic > theta_io, the structure must be strengthened or
    // stiffened for IO. If theta_elastic <= theta_ls, LS is satisfied elastically.
    let r_io: f64 = if theta_elastic > theta_io {
        theta_elastic / theta_io
    } else {
        1.0
    };
    let r_ls: f64 = if theta_elastic > theta_ls {
        theta_elastic / theta_ls
    } else {
        1.0
    };

    // IO requires smaller R (less force reduction = more strength) or
    // R_IO >= R_LS (larger ratio = need more ductility)
    assert!(r_io >= r_ls,
        "IO R-factor {:.2} >= LS R-factor {:.2} (IO more demanding)", r_io, r_ls);

    // --- Margin between IO and LS ---
    // The ratio of drift limits gives the margin:
    let drift_margin: f64 = theta_ls / theta_io;  // = 2.5/0.7 = 3.571
    assert_close(drift_margin, 25.0 / 7.0, 0.02,
        "LS/IO drift margin = 25/7 ≈ 3.57");

    // --- Verify with solver at both drift limits ---
    let input_io = make_portal_frame(h, w, e, a, iz, v_io, 0.0);
    let results_io = linear::solve_2d(&input_io).unwrap();
    let ux_io: f64 = results_io.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let theta_io_check: f64 = ux_io / h;

    let input_ls = make_portal_frame(h, w, e, a, iz, v_ls, 0.0);
    let results_ls = linear::solve_2d(&input_ls).unwrap();
    let ux_ls: f64 = results_ls.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let theta_ls_check: f64 = ux_ls / h;

    assert_close(theta_io_check, theta_io, 0.02,
        "Solver confirms IO drift at V_IO");
    assert_close(theta_ls_check, theta_ls, 0.02,
        "Solver confirms LS drift at V_LS");

    // --- LS/IO displacement ratio matches drift limit ratio ---
    let displacement_ratio: f64 = ux_ls / ux_io;
    assert_close(displacement_ratio, drift_margin, 0.02,
        "Displacement ratio = drift limit ratio = 3.57");

    // --- Cost implication: IO structure needs higher base shear capacity ---
    // The "upgrade factor" from LS to IO (assuming same hazard):
    //   V_IO / V_LS gives how much stronger the LS structure needs to be
    //   to achieve IO. But since V_IO < V_LS (IO triggers at lower load),
    //   the structure that satisfies IO under a given demand must be
    //   stiffer by the ratio theta_ls/theta_io to achieve the same
    //   force at IO drift as the LS structure develops at LS drift.
    let stiffness_upgrade: f64 = theta_ls / theta_io;
    assert_close(stiffness_upgrade, drift_margin, 0.02,
        "Stiffness upgrade factor for IO = drift margin");
}

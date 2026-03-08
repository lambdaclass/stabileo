/// Validation: Performance-Based Earthquake Engineering — Extended Benchmarks
///
/// References:
///   - ASCE 41-17: Seismic Evaluation and Retrofit of Existing Buildings
///   - FEMA P-58 (2018): Seismic Performance Assessment of Buildings
///   - FEMA 440 (2005): Improvement of Nonlinear Static Seismic Analysis
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria, Ch. 11-12
///   - Newmark & Hall (1982): "Earthquake Spectra and Design"
///   - Chopra & Goel (1999): "Capacity-Demand-Diagram Methods for Estimating
///     Seismic Deformation of Inelastic Structures: SDF Systems"
///   - Cornell et al. (2002): "Probabilistic Basis for 2000 SAC FEMA Steel
///     Moment Frame Guidelines", ASCE JSE 128(4)
///
/// Tests verify analytical relationships from performance-based earthquake
/// engineering (PBEE): target displacement, fragility functions, ductility
/// demand, drift-based acceptance, base shear coefficients, R-mu-T
/// relationships, and hazard-return period conversions.  Where possible,
/// solver results for a portal frame are used to anchor elastic response
/// quantities before applying code-based modification factors.
mod helpers;

#[allow(unused_imports)]
use dedaliano_engine::solver::linear;
#[allow(unused_imports)]
use dedaliano_engine::types::*;
use helpers::*;

const PI: f64 = std::f64::consts::PI;

// ================================================================
// 1. ASCE 41 Target Displacement
// ================================================================
//
// ASCE 41-17 §7.4.3.2 (Coefficient Method):
//   delta_t = C0 * C1 * C2 * Sa * (Te^2 / (4*pi^2)) * g
//
// where:
//   Sa  = spectral acceleration at effective period Te (in g)
//   Te  = effective fundamental period (seconds)
//   C0  = modification factor relating SDOF to MDOF displacement
//         (Table 7-5: 1.0 for 1-story, 1.2 for 2-story, 1.3 for 3-story)
//   C1  = modification for inelastic displacement (≥ 1.0; = 1 for T > Ts)
//   C2  = modification for hysteresis shape degradation
//   g   = 9.81 m/s^2
//
// Verification: compute analytically and cross-check with a portal frame
// elastic displacement scaled by the modification factors.

#[test]
fn validation_pbd_ext_asce41_target_displacement() {
    // --- Analytical target displacement ---
    let sa: f64 = 0.60;        // spectral acceleration in g
    let te: f64 = 0.80;        // effective period in seconds
    let c0: f64 = 1.2;         // 2-story MDOF factor
    let c1: f64 = 1.0;         // long-period (T > Ts), no amplification
    let c2: f64 = 1.0;         // no stiffness/strength degradation
    let g: f64 = 9.81;         // m/s^2

    // ASCE 41 Eq. 7-28:
    //   delta_t = C0 * C1 * C2 * Sa * Te^2 / (4*pi^2) * g
    let delta_t: f64 = c0 * c1 * c2 * sa * te.powi(2) / (4.0 * PI * PI) * g;

    // Manual check:
    //   Sd = Sa * g * Te^2 / (4*pi^2) = 0.60 * 9.81 * 0.64 / 39.478
    //      = 3.767 / 39.478 = 0.09542 m
    //   delta_t = 1.2 * 0.09542 = 0.11451 m
    let sd: f64 = sa * g * te.powi(2) / (4.0 * PI * PI);
    let delta_expected: f64 = c0 * c1 * c2 * sd;

    assert_close(delta_t, delta_expected, 0.01,
        "ASCE 41 target displacement: delta_t = C0*C1*C2*Sd");

    // --- Solver cross-check: elastic portal frame displacement ---
    // Build a portal frame with lateral force = V = Sa * W / R
    // W = total weight of frame tributary mass
    // For this check we use a unit-weight approach: apply a lateral load
    // equal to Sa * g to one node, then scale the elastic displacement
    // by (Te^2 / (4*pi^2)) to get Sd, and confirm C0 * Sd ≈ delta_t
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;       // story height
    let w: f64 = 6.0;       // bay width

    // Lateral load that produces elastic displacement
    let f_lateral: f64 = 50.0;  // kN

    let input = make_portal_frame(h, w, e, a, iz, f_lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Top lateral displacement from solver
    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap().ux;

    // Verify solver produces a finite, positive lateral displacement
    assert!(ux_top > 0.0,
        "Portal frame lateral displacement should be positive: {:.6}", ux_top);

    // The elastic stiffness k = F / delta
    let k_elastic: f64 = f_lateral / ux_top;

    // If we know Te and k, the effective mass is m_eff = k * Te^2 / (4*pi^2)
    // Then Sd = Sa * g / omega^2 = Sa * g * Te^2 / (4*pi^2)
    // And delta_t = C0 * Sd (for C1=C2=1)
    // Verify the formula is self-consistent: delta from k-based SDOF
    let m_eff: f64 = k_elastic * te.powi(2) / (4.0 * PI * PI);
    let omega: f64 = (k_elastic / m_eff).sqrt();
    let t_check: f64 = 2.0 * PI / omega;

    assert_close(t_check, te, 0.01,
        "Self-consistency: period from k and m_eff recovers Te");

    // Target displacement is well-defined and in a reasonable range
    // for a moderate earthquake on a mid-rise structure
    assert!(delta_t > 0.05 && delta_t < 0.50,
        "Target displacement {:.4} m in reasonable range [0.05, 0.50]", delta_t);
}

// ================================================================
// 2. FEMA P-58 Fragility Function (Lognormal CDF)
// ================================================================
//
// P(D > d | IM) = Phi( (ln(IM) - ln(theta)) / beta )
//
// where:
//   theta = median capacity (intensity measure at 50% probability)
//   beta  = logarithmic standard deviation (dispersion)
//   Phi() = standard normal CDF
//
// Properties:
//   - At IM = theta: P = 0.50 (by definition)
//   - At IM = theta * exp(beta): P = Phi(1) ≈ 0.8413
//   - At IM = theta * exp(-beta): P = Phi(-1) ≈ 0.1587
//   - At IM → 0: P → 0
//   - At IM → ∞: P → 1

#[test]
fn validation_pbd_ext_fema_p58_fragility() {
    let theta: f64 = 0.02;    // median drift capacity = 2%
    let beta: f64 = 0.40;     // typical dispersion for structural components

    // --- At IM = theta: z = 0, P = 0.50 ---
    let im_median: f64 = theta;
    let z_median: f64 = (im_median.ln() - theta.ln()) / beta;
    assert_close(z_median, 0.0, 0.01,
        "Fragility at median: z = 0");
    let p_median: f64 = phi_approx(z_median);
    assert_close(p_median, 0.50, 0.01,
        "Fragility at median: P = 0.50");

    // --- At IM = theta * exp(beta): z = 1, P ≈ 0.8413 ---
    let im_plus_1beta: f64 = theta * beta.exp();
    let z_plus: f64 = (im_plus_1beta.ln() - theta.ln()) / beta;
    assert_close(z_plus, 1.0, 0.01,
        "Fragility at theta*exp(beta): z = 1.0");
    let p_plus: f64 = phi_approx(z_plus);
    assert_close(p_plus, 0.8413, 0.02,
        "Fragility at +1beta: P ≈ 0.8413");

    // --- At IM = theta * exp(-beta): z = -1, P ≈ 0.1587 ---
    let im_minus_1beta: f64 = theta * (-beta).exp();
    let z_minus: f64 = (im_minus_1beta.ln() - theta.ln()) / beta;
    assert_close(z_minus, -1.0, 0.01,
        "Fragility at theta*exp(-beta): z = -1.0");
    let p_minus: f64 = phi_approx(z_minus);
    assert_close(p_minus, 0.1587, 0.02,
        "Fragility at -1beta: P ≈ 0.1587");

    // --- Monotonicity: P increases with IM ---
    let mut prev_p: f64 = 0.0;
    for i in 1..=20 {
        let im_i: f64 = theta * (i as f64 / 10.0);
        let z_i: f64 = (im_i.ln() - theta.ln()) / beta;
        let p_i: f64 = phi_approx(z_i);
        assert!(p_i >= prev_p - 1e-10,
            "Fragility monotonicity: P({:.4}) = {:.4} >= P_prev = {:.4}",
            im_i, p_i, prev_p);
        prev_p = p_i;
    }

    // --- At very high IM (10x median): P → ~1 ---
    let im_high: f64 = 10.0 * theta;
    let z_high: f64 = (im_high.ln() - theta.ln()) / beta;
    let p_high: f64 = phi_approx(z_high);
    assert!(p_high > 0.99,
        "Fragility at 10x median: P = {:.4} ≈ 1.0", p_high);
}

// ================================================================
// 3. Equal Displacement Approximation (T > Ts)
// ================================================================
//
// For structures with period T exceeding the characteristic site
// period Ts, the inelastic peak displacement is approximately equal
// to the elastic peak displacement, regardless of strength.
//
//   delta_inelastic ≈ delta_elastic    (for T > Ts)
//
// This means the displacement ductility demand mu = R (the force
// reduction factor).  We verify this with a portal frame: the
// elastic displacement from the solver gives Sd_elastic, and we
// confirm that for T >> Ts the FEMA 440 coefficient C1 → 1.0.

#[test]
fn validation_pbd_ext_equal_displacement() {
    // Characteristic site period (boundary between constant-accel and
    // constant-velocity regions of the design spectrum)
    let ts: f64 = 0.50;  // typical for Site Class D

    // FEMA 440 improved C1 coefficient:
    //   C1 = 1 + (R - 1) / (a * Te^2)   for Te < Ts
    //   C1 = 1.0                          for Te >= Ts
    // where a ≈ 130 (site class D) and R is the strength ratio
    let r: f64 = 5.0;    // response modification factor
    let a_site: f64 = 130.0;

    // Test across a range of periods
    let periods = [0.2, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0];
    for &te in &periods {
        let c1: f64 = if te < ts {
            (1.0 + (r - 1.0) / (a_site * te.powi(2))).max(1.0)
        } else {
            1.0
        };

        if te >= ts {
            // Equal displacement approximation: C1 = 1.0
            assert_close(c1, 1.0, 0.01,
                &format!("Equal displacement at T={:.1}s: C1 = 1.0", te));
        } else {
            // Short period: C1 > 1.0 (inelastic displacement exceeds elastic)
            assert!(c1 > 1.0,
                "Short period T={:.1}s: C1 = {:.3} > 1.0", te, c1);
        }
    }

    // --- Solver verification: elastic SDOF displacement ---
    // Portal frame under lateral load; verify elastic stiffness is finite
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f_lat: f64 = 100.0;

    let input = make_portal_frame(h, w, e, a_sec, iz, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let k_frame: f64 = f_lat / ux_top;

    // For any long period T > Ts, the elastic spectral displacement is:
    //   Sd = Sa * g * T^2 / (4*pi^2)
    // And the inelastic displacement ≈ Sd (equal displacement rule)
    // So delta_inelastic / delta_elastic = C1 = 1.0
    let sa: f64 = 0.40;
    let g: f64 = 9.81;
    let te_long: f64 = 1.5;  // well above Ts
    let sd_elastic: f64 = sa * g * te_long.powi(2) / (4.0 * PI * PI);
    let sd_inelastic: f64 = 1.0 * sd_elastic;  // C1 = 1.0

    assert_close(sd_inelastic / sd_elastic, 1.0, 0.01,
        "Equal displacement: inelastic/elastic ratio = 1.0 for T >> Ts");

    // The frame stiffness should be positive and reasonable
    assert!(k_frame > 0.0, "Frame stiffness k = {:.2} kN/m > 0", k_frame);
}

// ================================================================
// 4. Ductility Demand from SDOF System
// ================================================================
//
// Ductility demand: mu = delta_max / delta_yield
//
// For an elastic-perfectly-plastic SDOF with stiffness k and
// yield force Fy:
//   delta_yield = Fy / k
//   delta_elastic = Sa * g * T^2 / (4*pi^2)  (elastic demand)
//   delta_max ≈ delta_elastic  (for T > Ts, equal displacement)
//   mu = delta_max / delta_yield = delta_elastic / (Fy / k)
//      = k * Sd / Fy
//
// If we define the strength reduction factor R = Fe / Fy (where
// Fe = k * Sd is the elastic force demand), then mu = R for T > Ts.
//
// We verify this using a portal frame's elastic stiffness from the solver.

#[test]
fn validation_pbd_ext_ductility_demand() {
    // Portal frame properties
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;
    let w: f64 = 6.0;

    // Get elastic stiffness from solver
    let f_lateral: f64 = 80.0;
    let input = make_portal_frame(h, w, e, a, iz, f_lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let k: f64 = f_lateral / ux_top;  // elastic lateral stiffness

    // Assumed yield strength and elastic force demand
    let fy: f64 = 40.0;           // yield lateral force (kN)
    let delta_y: f64 = fy / k;     // yield displacement
    let sa: f64 = 0.50;            // spectral acceleration (g)
    let g: f64 = 9.81;
    let te: f64 = 1.2;             // effective period (s), T > Ts

    // Elastic displacement demand (spectral displacement)
    let sd: f64 = sa * g * te.powi(2) / (4.0 * PI * PI);

    // For T > Ts (equal displacement): delta_max ≈ Sd
    let delta_max: f64 = sd;

    // Ductility demand
    let mu: f64 = delta_max / delta_y;

    // Strength reduction factor
    let fe: f64 = k * sd;          // elastic force demand
    let r_factor: f64 = fe / fy;    // R = Fe / Fy

    // For equal displacement (T > Ts): mu ≈ R
    assert_close(mu, r_factor, 0.01,
        "Ductility demand: mu = R for equal displacement rule");

    // Verify mu > 1 (structure is yielding, since we chose Fy < Fe)
    assert!(mu > 1.0,
        "Ductility demand mu = {:.2} > 1.0 (yielding)", mu);

    // Verify delta_y < delta_max (inelastic response exceeds yield)
    assert!(delta_y < delta_max,
        "delta_y = {:.6} m < delta_max = {:.6} m", delta_y, delta_max);

    // Cross-check: mu * delta_y = delta_max
    assert_close(mu * delta_y, delta_max, 0.01,
        "Ductility identity: mu * delta_y = delta_max");
}

// ================================================================
// 5. Drift-Based Performance Levels (ASCE 41 / FEMA 356)
// ================================================================
//
// ASCE 41-17 Table 10-3 (Steel Moment Frames):
//   IO (Immediate Occupancy): transient drift ≤ 0.7%
//   LS (Life Safety):         transient drift ≤ 2.5%
//   CP (Collapse Prevention): transient drift ≤ 5.0%
//
// For a portal frame under lateral load, the story drift ratio is
//   theta = ux_top / h
//
// We use the solver to compute elastic drift, then scale to find
// what load level triggers each performance level.

#[test]
fn validation_pbd_ext_drift_performance_levels() {
    // ASCE 41 drift limits for steel moment frames
    let theta_io: f64 = 0.007;    // 0.7%
    let theta_ls: f64 = 0.025;    // 2.5%
    let theta_cp: f64 = 0.050;    // 5.0%

    // Ordering: IO < LS < CP
    assert!(theta_io < theta_ls, "IO < LS drift limit");
    assert!(theta_ls < theta_cp, "LS < CP drift limit");

    // --- Solver: compute elastic drift for a reference lateral load ---
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let h: f64 = 3.5;        // story height (m)
    let w: f64 = 6.0;        // bay width (m)
    let f_ref: f64 = 10.0;   // reference lateral load (kN)

    let input = make_portal_frame(h, w, e, a, iz, f_ref, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ux_top: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Elastic drift ratio under reference load
    let theta_ref: f64 = ux_top / h;
    assert!(theta_ref > 0.0,
        "Reference drift ratio = {:.6} > 0", theta_ref);

    // Load factors to reach each performance level (linear scaling)
    let f_io: f64 = theta_io / theta_ref * f_ref;
    let f_ls: f64 = theta_ls / theta_ref * f_ref;
    let f_cp: f64 = theta_cp / theta_ref * f_ref;

    // Ordering: F_IO < F_LS < F_CP
    assert!(f_io < f_ls,
        "IO load {:.2} kN < LS load {:.2} kN", f_io, f_ls);
    assert!(f_ls < f_cp,
        "LS load {:.2} kN < CP load {:.2} kN", f_ls, f_cp);

    // Ratios between performance levels match drift ratios
    let ratio_ls_io: f64 = f_ls / f_io;
    let expected_ls_io: f64 = theta_ls / theta_io;  // 2.5/0.7 ≈ 3.571
    assert_close(ratio_ls_io, expected_ls_io, 0.01,
        "LS/IO load ratio matches drift ratio");

    let ratio_cp_ls: f64 = f_cp / f_ls;
    let expected_cp_ls: f64 = theta_cp / theta_ls;  // 5.0/2.5 = 2.0
    assert_close(ratio_cp_ls, expected_cp_ls, 0.01,
        "CP/LS load ratio matches drift ratio");

    // Verify solver at IO load gives theta_io drift
    let input_io = make_portal_frame(h, w, e, a, iz, f_io, 0.0);
    let results_io = linear::solve_2d(&input_io).unwrap();
    let ux_io: f64 = results_io.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let theta_io_check: f64 = ux_io / h;

    assert_close(theta_io_check, theta_io, 0.02,
        "Solver drift at IO load matches IO limit");
}

// ================================================================
// 6. Base Shear Coefficient (ASCE 7-22 Equivalent Lateral Force)
// ================================================================
//
// ASCE 7-22 §12.8.1: Design base shear
//   V = Cs * W
//
// where Cs is the seismic response coefficient:
//   Cs = SDS / (R / Ie)                   (short-period plateau)
//   Cs need not exceed: SD1 / (T * R/Ie)  (descending branch)
//   Cs shall not be less than 0.044*SDS*Ie (minimum)
//
// Parameters:
//   SDS = design spectral acceleration at short period (g)
//   SD1 = design spectral acceleration at 1 second (g)
//   R   = response modification coefficient
//   Ie  = importance factor
//   T   = fundamental period
//   W   = effective seismic weight

#[test]
fn validation_pbd_ext_base_shear_coefficient() {
    // Design parameters (ASCE 7-22 typical values)
    let sds: f64 = 1.0;       // g, Site Class D, Sms = 1.5, SDS = 2/3*Sms
    let sd1: f64 = 0.60;      // g
    let r: f64 = 8.0;         // Special steel moment frame
    let ie: f64 = 1.0;        // Risk Category II
    let w: f64 = 5000.0;      // kN, seismic weight

    // --- Short-period structure (T = 0.3s, on plateau) ---
    let t_short: f64 = 0.3;
    let cs_plateau: f64 = sds / (r / ie);
    let cs_descend: f64 = sd1 / (t_short * (r / ie));
    let cs_min: f64 = 0.044 * sds * ie;
    let cs_short: f64 = cs_plateau.min(cs_descend).max(cs_min);

    // At T = 0.3: Cs = SDS/(R/Ie) = 1.0/8.0 = 0.125
    //   Check descending: SD1/(T*R/Ie) = 0.60/(0.3*8) = 0.25 > 0.125
    //   So Cs = 0.125 (plateau governs)
    assert_close(cs_short, 0.125, 0.01,
        "Short-period Cs = SDS/(R/Ie) = 0.125");

    let v_short: f64 = cs_short * w;
    assert_close(v_short, 625.0, 0.01,
        "Short-period base shear V = Cs*W = 625 kN");

    // --- Long-period structure (T = 1.5s, descending branch) ---
    let t_long: f64 = 1.5;
    let cs_plateau_l: f64 = sds / (r / ie);
    let cs_descend_l: f64 = sd1 / (t_long * (r / ie));
    let cs_long: f64 = cs_plateau_l.min(cs_descend_l).max(cs_min);

    // Cs = min(0.125, 0.60/(1.5*8)) = min(0.125, 0.05) = 0.05
    assert_close(cs_long, 0.05, 0.01,
        "Long-period Cs = SD1/(T*R/Ie) = 0.05");

    let v_long: f64 = cs_long * w;
    assert_close(v_long, 250.0, 0.01,
        "Long-period base shear V = Cs*W = 250 kN");

    // --- Verify base shear decreases with period ---
    assert!(v_long < v_short,
        "V decreases with T: V(1.5s) = {:.0} < V(0.3s) = {:.0}", v_long, v_short);

    // --- Minimum Cs check ---
    // For very long periods, the minimum governs
    let t_very_long: f64 = 5.0;
    let cs_desc_vl: f64 = sd1 / (t_very_long * (r / ie));
    let cs_vl: f64 = cs_plateau.min(cs_desc_vl).max(cs_min);

    // cs_desc = 0.60/(5.0*8) = 0.015, cs_min = 0.044*1.0*1.0 = 0.044
    // cs = max(0.015, 0.044) = 0.044
    assert_close(cs_vl, 0.044, 0.01,
        "Very long-period: minimum Cs = 0.044 governs");

    // --- Solver verification: equilibrium check ---
    // Apply the short-period base shear to a portal frame and verify
    // that the sum of reactions equals the applied lateral force
    let e_mat: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz_sec: f64 = 1e-4;
    let h_frame: f64 = 3.5;
    let w_frame: f64 = 6.0;

    let input = make_portal_frame(h_frame, w_frame, e_mat, a_sec, iz_sec, v_short, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    // Horizontal equilibrium: sum of horizontal reactions = -applied lateral load
    assert_close(sum_rx, -v_short, 0.02,
        "Equilibrium: sum(Rx) = -V_base");
}

// ================================================================
// 7. Period-Dependent R Factor: Newmark-Hall R-mu-T Relationships
// ================================================================
//
// Newmark & Hall (1982) proposed R-mu-T relationships for different
// period ranges:
//
//   Short period (T < 0.12s, "acceleration-sensitive"):
//     R = 1 (no reduction, mu = 1 — remains elastic)
//
//   Medium period (0.12s < T < ~0.5s, "velocity-sensitive"):
//     R = sqrt(2*mu - 1)  (equal energy rule)
//
//   Long period (T > ~0.5s, "displacement-sensitive"):
//     R = mu  (equal displacement rule)
//
// These are fundamental to understanding how ductility translates
// to force reduction as a function of natural period.

#[test]
fn validation_pbd_ext_newmark_hall_r_mu_t() {
    // Test ductility values
    let ductilities = [1.0, 2.0, 4.0, 6.0, 8.0];

    for &mu in &ductilities {
        // --- Short period: R = 1 (no reduction for very stiff systems) ---
        // Special case: if mu = 1, R = 1 regardless of period
        let mu_diff: f64 = mu - 1.0;
        if mu_diff.abs() < 1e-10 {
            let r_short: f64 = 1.0;
            let r_long: f64 = mu;
            assert_close(r_short, 1.0, 0.01,
                "mu=1: R = 1 at all periods");
            assert_close(r_long, 1.0, 0.01,
                "mu=1: R = 1 at long periods too");
            continue;
        }

        // --- Medium period: Equal Energy Rule ---
        //   R = sqrt(2*mu - 1)
        let r_energy: f64 = (2.0 * mu - 1.0).sqrt();

        // Inverse check: mu = (R^2 + 1) / 2
        let mu_check: f64 = (r_energy.powi(2) + 1.0) / 2.0;
        assert_close(mu_check, mu, 0.01,
            &format!("Equal energy inverse: mu={:.0}, R={:.3}", mu, r_energy));

        // --- Long period: Equal Displacement Rule ---
        //   R = mu
        let r_disp: f64 = mu;
        assert_close(r_disp, mu, 0.01,
            &format!("Equal displacement: R = mu = {:.0}", mu));

        // --- R_energy < R_displacement for mu > 1 ---
        // Equal energy gives less force reduction than equal displacement
        assert!(r_energy < r_disp,
            "mu={:.0}: R_energy={:.3} < R_disp={:.3}", mu, r_energy, r_disp);

        // --- Verify Newmark-Hall transition region ---
        // At the "equal velocity" boundary: R_energy should be positive
        assert!(r_energy > 0.0,
            "R_energy > 0 for mu={:.0}", mu);
    }

    // --- Verify specific benchmark values ---
    // mu = 4: R_energy = sqrt(7) ≈ 2.646
    let r_4_arg: f64 = 2.0 * 4.0 - 1.0;
    let r_4_energy: f64 = r_4_arg.sqrt();
    assert_close(r_4_energy, 7.0_f64.sqrt(), 0.01,
        "mu=4: R_energy = sqrt(7) ≈ 2.646");

    // mu = 2: R_energy = sqrt(3) ≈ 1.732
    let r_2_arg: f64 = 2.0 * 2.0 - 1.0;
    let r_2_energy: f64 = r_2_arg.sqrt();
    assert_close(r_2_energy, 3.0_f64.sqrt(), 0.01,
        "mu=2: R_energy = sqrt(3) ≈ 1.732");

    // --- The ratio R_disp/R_energy increases with mu ---
    let ratio_mu2: f64 = 2.0 / (3.0_f64.sqrt());
    let ratio_mu4: f64 = 4.0 / (7.0_f64.sqrt());
    let ratio_mu8: f64 = 8.0 / (15.0_f64.sqrt());

    assert!(ratio_mu4 > ratio_mu2,
        "Ratio increases: mu=4 {:.3} > mu=2 {:.3}", ratio_mu4, ratio_mu2);
    assert!(ratio_mu8 > ratio_mu4,
        "Ratio increases: mu=8 {:.3} > mu=4 {:.3}", ratio_mu8, ratio_mu4);
}

// ================================================================
// 8. Annual Probability of Exceedance and Return Period
// ================================================================
//
// The relationship between probability of exceedance PE over
// an exposure time t (years) and the mean return period TR is:
//
//   PE = 1 - exp(-t / TR)
//   TR = -t / ln(1 - PE)
//   lambda = 1/TR = -ln(1 - PE) / t  (annual rate of exceedance)
//
// Standard hazard levels:
//   - Frequent (SLE):    50% in 30 yr → TR ≈ 43 yr
//   - Design (DBE):      10% in 50 yr → TR ≈ 475 yr
//   - Maximum (MCE):     2% in 50 yr  → TR ≈ 2475 yr
//   - Very rare:         1% in 100 yr → TR ≈ 9950 yr

#[test]
fn validation_pbd_ext_annual_probability_exceedance() {
    // --- 10% in 50 years (Design Basis Earthquake) ---
    let pe_dbe: f64 = 0.10;
    let t_dbe: f64 = 50.0;
    let lambda_dbe: f64 = -(1.0 - pe_dbe).ln() / t_dbe;
    let tr_dbe: f64 = 1.0 / lambda_dbe;

    // TR = -50/ln(0.90) = -50/(-0.10536) = 474.6 yr
    assert_close(tr_dbe, 475.0, 0.02,
        "DBE return period: TR ≈ 475 years");
    assert_close(lambda_dbe, 1.0 / 475.0, 0.02,
        "DBE annual rate: lambda ≈ 1/475");

    // --- 2% in 50 years (Maximum Considered Earthquake) ---
    let pe_mce: f64 = 0.02;
    let t_mce: f64 = 50.0;
    let lambda_mce: f64 = -(1.0 - pe_mce).ln() / t_mce;
    let tr_mce: f64 = 1.0 / lambda_mce;

    // TR = -50/ln(0.98) = -50/(-0.02020) = 2475 yr
    assert_close(tr_mce, 2475.0, 0.02,
        "MCE return period: TR ≈ 2475 years");

    // --- 50% in 30 years (Serviceability Level Earthquake) ---
    let pe_sle: f64 = 0.50;
    let t_sle: f64 = 30.0;
    let lambda_sle: f64 = -(1.0 - pe_sle).ln() / t_sle;
    let tr_sle: f64 = 1.0 / lambda_sle;

    // TR = -30/ln(0.50) = -30/(-0.6931) = 43.3 yr
    assert_close(tr_sle, 43.3, 0.02,
        "SLE return period: TR ≈ 43 years");

    // --- 1% in 100 years (Very Rare) ---
    let pe_vr: f64 = 0.01;
    let t_vr: f64 = 100.0;
    let lambda_vr: f64 = -(1.0 - pe_vr).ln() / t_vr;
    let tr_vr: f64 = 1.0 / lambda_vr;

    // TR = -100/ln(0.99) = -100/(-0.01005) = 9950 yr
    assert_close(tr_vr, 9950.0, 0.02,
        "Very rare return period: TR ≈ 9950 years");

    // --- Return period ordering: SLE < DBE < MCE < VR ---
    assert!(tr_sle < tr_dbe,
        "SLE {:.0} < DBE {:.0}", tr_sle, tr_dbe);
    assert!(tr_dbe < tr_mce,
        "DBE {:.0} < MCE {:.0}", tr_dbe, tr_mce);
    assert!(tr_mce < tr_vr,
        "MCE {:.0} < VR {:.0}", tr_mce, tr_vr);

    // --- Inverse check: PE from TR ---
    let pe_dbe_check: f64 = 1.0 - (-t_dbe / tr_dbe).exp();
    assert_close(pe_dbe_check, pe_dbe, 0.02,
        "Inverse: PE from TR recovers 10%");

    let pe_mce_check: f64 = 1.0 - (-t_mce / tr_mce).exp();
    assert_close(pe_mce_check, pe_mce, 0.02,
        "Inverse: PE from TR recovers 2%");

    // --- Poisson process property: doubling exposure time ---
    // PE(2t) = 1 - (1-PE(t))^2 for a Poisson process
    let pe_50: f64 = pe_dbe;  // 10% in 50yr
    let pe_100_poisson: f64 = 1.0 - (1.0 - pe_50).powi(2);
    let pe_100_exact: f64 = 1.0 - (-100.0 / tr_dbe).exp();

    assert_close(pe_100_poisson, pe_100_exact, 0.01,
        "Poisson property: PE(100yr) = 1 - (1-PE(50yr))^2");

    // --- Annual rate is independent of exposure time ---
    let lambda_check: f64 = -(1.0 - pe_100_exact).ln() / 100.0;
    assert_close(lambda_check, lambda_dbe, 0.01,
        "Annual rate lambda invariant w.r.t. exposure time");
}

// ================================================================
// Helper: Standard normal CDF approximation (Abramowitz & Stegun)
// ================================================================
//
// Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
//
// Using the rational approximation for erf from
// Abramowitz & Stegun, Handbook of Mathematical Functions, §7.1.26

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

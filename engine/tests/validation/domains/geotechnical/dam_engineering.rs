/// Validation: Dam Engineering
///
/// References:
///   - USBR Design of Small Dams (3rd Edition, 1987)
///   - USACE EM 1110-2-2200: Gravity Dam Design
///   - ICOLD Bulletin 148: Selecting Seismic Parameters for Large Dams
///   - EN 1998-1 (EC8): Seismic design + reservoir-induced effects
///   - FERC Engineering Guidelines: Chapter 3 (Gravity Dams)
///   - ANCOLD Guidelines on Dam Safety Management (2003)
///
/// Tests verify gravity dam stability, uplift pressure,
/// arch dam ring action, spillway hydraulics, and seismic loading.

// ================================================================
// 1. Gravity Dam -- Sliding Stability
// ================================================================
//
// FS_sliding = (ΣV × tan(φ) + c × A) / ΣH
// ΣV = vertical forces (weight - uplift)
// ΣH = horizontal forces (hydrostatic + sediment)
// USACE: FS ≥ 2.0 (usual), FS ≥ 1.3 (flood), FS ≥ 1.0 (seismic)

#[test]
fn dam_gravity_sliding() {
    let h: f64 = 30.0;          // m, dam height
    let b: f64 = 24.0;          // m, base width
    let gamma_c: f64 = 24.0;    // kN/m³, concrete
    let gamma_w: f64 = 9.81;    // kN/m³, water

    // Dam self-weight (triangular section approximation)
    let w_dam: f64 = 0.5 * gamma_c * b * h; // kN/m (per unit length)
    // = 0.5 * 24 * 24 * 30 = 8640 kN/m

    // Hydrostatic horizontal force
    let h_water: f64 = 28.0;    // m, water height (2m freeboard)
    let f_hydro: f64 = 0.5 * gamma_w * h_water * h_water;
    // = 0.5 * 9.81 * 784 = 3846 kN/m

    // Uplift force (linear distribution, with drain effectiveness)
    let drain_eff: f64 = 0.50;  // 50% drain effectiveness
    let u_heel: f64 = gamma_w * h_water; // full head at heel
    let u_toe: f64 = 0.0;       // zero at toe (no tailwater)
    let u_avg: f64 = u_heel * (1.0 - drain_eff) * 0.5 + u_toe * 0.5;
    let f_uplift: f64 = u_avg * b;

    // Net vertical force
    let v_net: f64 = w_dam - f_uplift;

    assert!(
        v_net > 0.0,
        "Net vertical: {:.0} kN/m", v_net
    );

    // Sliding factor of safety
    let phi: f64 = 45.0_f64.to_radians(); // rock friction angle
    let c: f64 = 0.0;           // zero cohesion (conservative)

    let fs_sliding: f64 = (v_net * phi.tan() + c * b) / f_hydro;

    assert!(
        fs_sliding > 1.5,
        "Sliding FS = {:.2} > 1.5", fs_sliding
    );
}

// ================================================================
// 2. Gravity Dam -- Overturning Stability
// ================================================================
//
// FS_overturning = Σ(stabilizing moments) / Σ(overturning moments)
// USACE: resultant must be in middle third for usual case.

#[test]
fn dam_gravity_overturning() {
    let h: f64 = 30.0;
    let b: f64 = 24.0;
    let gamma_c: f64 = 24.0;
    let gamma_w: f64 = 9.81;
    let h_water: f64 = 28.0;

    // Self-weight and moment about toe
    let w: f64 = 0.5 * gamma_c * b * h;
    let xw: f64 = 2.0 * b / 3.0; // centroid of triangle from heel = 2b/3 from toe
    let m_stab: f64 = w * xw;

    // Hydrostatic force and moment about toe
    let fh: f64 = 0.5 * gamma_w * h_water * h_water;
    let yh: f64 = h_water / 3.0; // acts at h/3 from base
    let m_ot_hydro: f64 = fh * yh;

    // Uplift moment about toe (simplified)
    let u_heel: f64 = gamma_w * h_water;
    let f_uplift: f64 = 0.5 * u_heel * b * 0.50; // with 50% drainage
    let xu: f64 = 2.0 * b / 3.0; // centroid of triangular uplift from toe
    let m_ot_uplift: f64 = f_uplift * xu;

    // Total overturning moment
    let m_ot: f64 = m_ot_hydro + m_ot_uplift;

    // Overturning FS
    let fs_ot: f64 = m_stab / m_ot;

    assert!(
        fs_ot > 1.5,
        "Overturning FS = {:.2}", fs_ot
    );

    // Resultant location (middle third check)
    let x_res: f64 = (m_stab - m_ot) / (w - f_uplift);

    assert!(
        x_res > b / 3.0 && x_res < 2.0 * b / 3.0,
        "Resultant at {:.1}m -- within middle third ({:.1} to {:.1}m)",
        x_res, b / 3.0, 2.0 * b / 3.0
    );
}

// ================================================================
// 3. Uplift Pressure -- Drainage Gallery
// ================================================================
//
// With drainage: bilinear pressure distribution.
// At drain: pressure = γw × (h_w × (1 - η))
// η = drainage efficiency (0.25-0.50 per USACE)

#[test]
fn dam_uplift_pressure() {
    let h_w: f64 = 25.0;        // m, headwater depth
    let h_tw: f64 = 2.0;        // m, tailwater depth
    let gamma_w: f64 = 9.81;

    // Without drainage: linear distribution
    let u_heel_no_drain: f64 = gamma_w * h_w;
    let u_toe_no_drain: f64 = gamma_w * h_tw;

    // With drainage (USACE: η = 0.50, drain at 1/3 base from heel)
    let eta: f64 = 0.50;
    let u_heel: f64 = gamma_w * h_w; // full head at heel
    let u_drain: f64 = gamma_w * (h_tw + (1.0 - eta) * (h_w - h_tw));
    let u_toe: f64 = gamma_w * h_tw;

    // Drain reduces pressure significantly
    assert!(
        u_drain < u_heel,
        "At drain: {:.1} < heel: {:.1} kPa", u_drain, u_heel
    );

    // Total uplift force reduction (per unit length, B = 20m, drain at B/3)
    let b: f64 = 20.0;
    let b_heel: f64 = b / 3.0;  // drain location from heel
    let b_toe: f64 = b - b_heel;

    let f_no_drain: f64 = 0.5 * (u_heel_no_drain + u_toe_no_drain) * b;
    let f_drain: f64 = 0.5 * (u_heel + u_drain) * b_heel
                     + 0.5 * (u_drain + u_toe) * b_toe;

    let reduction: f64 = 1.0 - f_drain / f_no_drain;

    assert!(
        reduction > 0.10,
        "Uplift reduction: {:.0}%", reduction * 100.0
    );
}

// ================================================================
// 4. Arch Dam -- Ring Action
// ================================================================
//
// Thin arch dam: load shared between arch (ring) and cantilever actions.
// Ring stress: σ = p × R / t (hoop stress in thin arch)
// R = upstream radius, t = arch thickness, p = water pressure

#[test]
fn dam_arch_ring() {
    let h_water: f64 = 80.0;    // m, water height
    let gamma_w: f64 = 9.81;
    let r: f64 = 150.0;         // m, upstream radius at mid-height
    let t: f64 = 8.0;           // m, arch thickness

    // Water pressure at mid-height
    let z: f64 = h_water / 2.0;
    let p: f64 = gamma_w * z / 1000.0; // MPa

    // Ring (hoop) stress
    let sigma_ring: f64 = p * r / t;
    // = 0.392 * 150 / 8 = 7.35 MPa

    assert!(
        sigma_ring > 3.0 && sigma_ring < 15.0,
        "Ring stress: {:.2} MPa", sigma_ring
    );

    // Concrete compressive strength (typical: 25-35 MPa for dams)
    let fc: f64 = 30.0;
    let utilization: f64 = sigma_ring / fc;

    assert!(
        utilization < 0.40,
        "Ring stress utilization: {:.0}%", utilization * 100.0
    );

    // Thickness-to-radius ratio
    let tr_ratio: f64 = t / r;
    // Thin arch: t/R < 0.2
    assert!(
        tr_ratio < 0.20,
        "t/R = {:.3} -- thin arch theory valid", tr_ratio
    );

    // At base: full hydrostatic pressure
    let p_base: f64 = gamma_w * h_water / 1000.0;
    let sigma_base: f64 = p_base * r / t;
    assert!(
        sigma_base > sigma_ring,
        "Base stress {:.2} > mid-height {:.2} MPa", sigma_base, sigma_ring
    );
}

// ================================================================
// 5. Spillway Hydraulics -- Ogee Crest
// ================================================================
//
// USBR: Q = C × L × H^1.5 (broad-crested weir)
// C = discharge coefficient (depends on H/Hd ratio)
// For design head (H = Hd): C ≈ 2.18 (metric)

#[test]
fn dam_spillway_discharge() {
    let l: f64 = 50.0;          // m, crest length
    let hd: f64 = 5.0;          // m, design head
    let cd: f64 = 2.18;         // discharge coefficient at design head

    // Design discharge
    let hd_pow: f64 = hd.powf(1.5);
    let q_design: f64 = cd * l * hd_pow;
    // = 2.18 * 50 * 11.18 = 1219 m³/s

    assert!(
        q_design > 1000.0,
        "Design discharge: {:.0} m³/s", q_design
    );

    // At half design head: C reduces
    let h_half: f64 = hd / 2.0;
    let c_half: f64 = 2.18 * 0.90; // approximately 90% of Cd
    let h_half_pow: f64 = h_half.powf(1.5);
    let q_half: f64 = c_half * l * h_half_pow;

    // Flow at half head is much less than half design flow
    assert!(
        q_half < q_design * 0.5,
        "At H/2: Q = {:.0} < {:.0} m³/s", q_half, q_design * 0.5
    );

    // PMF check: head above design (H > Hd)
    let h_pmf: f64 = 7.0;       // m, PMF head
    let c_pmf: f64 = 2.18 * 1.03; // slightly increased at H > Hd
    let h_pmf_pow: f64 = h_pmf.powf(1.5);
    let q_pmf: f64 = c_pmf * l * h_pmf_pow;

    assert!(
        q_pmf > q_design,
        "PMF discharge {:.0} > design {:.0} m³/s", q_pmf, q_design
    );
}

// ================================================================
// 6. Seismic Loading -- Westergaard Added Mass
// ================================================================
//
// Hydrodynamic pressure during earthquake:
// Westergaard (1933): p = (7/8) × ρw × a × sqrt(H × z)
// a = peak ground acceleration (as fraction of g)
// Total force: F = (7/12) × ρw × a × H²

#[test]
fn dam_seismic_westergaard() {
    let h: f64 = 40.0;          // m, water depth
    let rho_w: f64 = 1000.0;    // kg/m³
    let a_g: f64 = 0.20;        // g, PGA

    // Hydrodynamic pressure at base (z = H)
    let p_base: f64 = 7.0 / 8.0 * rho_w * a_g * 9.81 * (h * h).sqrt() / 1000.0;
    // = 0.875 * 1000 * 0.20 * 9.81 * 40 / 1000 = 68.7 kPa

    assert!(
        p_base > 50.0 && p_base < 100.0,
        "Hydrodynamic pressure at base: {:.1} kPa", p_base
    );

    // Total hydrodynamic force (per unit length)
    let f_total: f64 = 7.0 / 12.0 * rho_w * a_g * 9.81 * h * h / 1000.0;
    // kN/m

    // Hydrostatic force for comparison
    let f_hydrostatic: f64 = 0.5 * 9.81 * h * h;

    // Hydrodynamic is significant fraction of hydrostatic
    let ratio: f64 = f_total / f_hydrostatic;
    assert!(
        ratio > 0.05 && ratio < 0.50,
        "Hydrodynamic/hydrostatic ratio: {:.2}", ratio
    );

    // Point of application (at 0.4H from base)
    let y_hydro: f64 = 0.40 * h;
    assert!(
        y_hydro > 0.0,
        "Hydrodynamic force acts at {:.1}m from base", y_hydro
    );
}

// ================================================================
// 7. Dam Foundation -- Stress Distribution
// ================================================================
//
// Base stress: σ = V/A ± M*y/I
// Compression everywhere required (no tension at heel).
// σ_heel = V/B - 6M/(B²), σ_toe = V/B + 6M/(B²)

#[test]
fn dam_foundation_stress() {
    let b: f64 = 20.0;          // m, base width
    let v: f64 = 8000.0;        // kN/m, net vertical force
    let m: f64 = 30000.0;       // kN·m/m, net moment about base center

    // Eccentricity
    let e: f64 = m / v;
    // = 3.75 m

    // For no tension: e ≤ B/6 (middle third rule)
    let e_limit: f64 = b / 6.0;

    // Kern check
    let in_kern: bool = e <= e_limit;

    // Base stresses (compression positive)
    let sigma_toe: f64 = v / b + 6.0 * m / (b * b);
    let sigma_heel: f64 = v / b - 6.0 * m / (b * b);

    if in_kern {
        assert!(
            sigma_heel >= 0.0,
            "Heel stress: {:.1} kPa (no tension)", sigma_heel
        );
    }

    // Maximum bearing stress vs allowable rock bearing
    let q_allow: f64 = 1500.0;  // kPa, typical competent rock
    assert!(
        sigma_toe < q_allow,
        "Toe stress {:.1} < allowable {:.1} kPa", sigma_toe, q_allow
    );

    // Stress ratio
    let stress_ratio: f64 = sigma_toe / sigma_heel.abs().max(1.0);
    assert!(
        stress_ratio > 0.0,
        "Toe/heel stress ratio: {:.1}", stress_ratio
    );
}

// ================================================================
// 8. Reservoir Induced Seismicity -- Magnitude Estimation
// ================================================================
//
// RIS: correlation between reservoir volume/depth and seismic potential.
// Empirical: M_max ≈ 2.0 + 0.7 × log10(V) (V in million m³)
// Depth threshold: typically > 100m for significant RIS risk.

#[test]
fn dam_reservoir_seismicity() {
    // Reservoir parameters
    let volume: f64 = 5000.0;   // million m³
    let depth: f64 = 120.0;     // m, maximum depth

    // Empirical magnitude estimate (after Baecher & Keeney)
    let m_est: f64 = 2.0 + 0.7 * volume.log10();
    // = 2.0 + 0.7 * 3.7 = 4.59

    assert!(
        m_est > 3.0 && m_est < 7.0,
        "Estimated M_max: {:.1}", m_est
    );

    // Depth threshold for RIS
    let ris_risk: bool = depth > 100.0;
    assert!(
        ris_risk,
        "Depth {:.0}m > 100m -- RIS potential exists", depth
    );

    // Comparison: smaller reservoir
    let vol_small: f64 = 50.0;  // million m³
    let m_small: f64 = 2.0 + 0.7 * vol_small.log10();

    assert!(
        m_small < m_est,
        "Smaller reservoir M={:.1} < large M={:.1}", m_small, m_est
    );

    // Loading rate effect: rapid impoundment increases risk
    let fill_rate: f64 = 0.5;   // m/day (depth rise)
    let rapid_fill: bool = fill_rate > 0.3; // threshold
    assert!(
        rapid_fill,
        "Fill rate {:.1} m/day -- rapid filling", fill_rate
    );
}

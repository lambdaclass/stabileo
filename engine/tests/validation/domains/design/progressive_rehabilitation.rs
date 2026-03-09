/// Validation: Structural Assessment & Rehabilitation
///
/// References:
///   - ACI 562-21: Code Requirements for Assessment, Repair, and Rehabilitation of Concrete Structures
///   - ASCE 41-17: Seismic Evaluation and Retrofit of Existing Buildings
///   - EN 1998-3: Assessment and Retrofitting of Buildings
///   - fib Bulletin 80: Partial Factor Methods for Existing Concrete Structures
///   - FEMA 356: Prestandard for Seismic Rehabilitation
///   - ISO 13822: Bases for Design of Structures — Assessment of Existing Structures
///
/// Tests verify capacity reduction with age, CFRP strengthening,
/// section loss assessment, load rating, and seismic retrofit.

// ================================================================
// 1. Concrete Carbonation -- Remaining Service Life
// ================================================================
//
// Carbonation depth: x = K × √t
// K = carbonation coefficient (mm/√year)
// When x reaches rebar depth → corrosion initiates.

#[test]
fn rehab_carbonation_depth() {
    let k: f64 = 4.0;           // mm/√year (typical for w/c = 0.55)
    let age: f64 = 30.0;        // years, current age
    let cover: f64 = 35.0;      // mm, concrete cover

    // Current carbonation depth
    let x_current: f64 = k * age.sqrt();
    // = 4.0 * 5.48 = 21.9 mm

    assert!(
        x_current < cover,
        "Carbonation {:.1}mm < cover {:.0}mm -- not yet at rebar", x_current, cover
    );

    // Time to reach rebar
    let t_initiation: f64 = (cover / k).powi(2);
    // = (35/4)² = 76.6 years

    assert!(
        t_initiation > age,
        "Initiation at {:.0} years > current age {:.0}", t_initiation, age
    );

    // Remaining time before corrosion
    let t_remaining: f64 = t_initiation - age;
    assert!(
        t_remaining > 20.0,
        "Remaining safe life: {:.0} years", t_remaining
    );

    // Effect of higher w/c ratio (K increases)
    let k_poor: f64 = 6.0;      // poor quality concrete
    let t_poor: f64 = (cover / k_poor).powi(2);
    assert!(
        t_poor < t_initiation,
        "Poor concrete: initiation at {:.0} vs {:.0} years", t_poor, t_initiation
    );
}

// ================================================================
// 2. Corrosion -- Section Loss Assessment
// ================================================================
//
// Uniform corrosion rate: typically 0.01-0.10 mm/year for rebars.
// Remaining capacity: proportional to remaining steel area.
// Pitting corrosion: localized loss up to 5-10× uniform rate.

#[test]
fn rehab_corrosion_section_loss() {
    let d_orig: f64 = 16.0;     // mm, original rebar diameter
    let corrosion_rate: f64 = 0.05; // mm/year, uniform
    let years_corroding: f64 = 20.0;

    // Radius loss (uniform corrosion from all sides)
    let loss: f64 = corrosion_rate * years_corroding;
    // = 1.0 mm

    let d_remaining: f64 = d_orig - 2.0 * loss;

    assert!(
        d_remaining > 0.0,
        "Remaining diameter: {:.1} mm", d_remaining
    );

    // Area ratio
    let area_ratio: f64 = (d_remaining / d_orig).powi(2);

    assert!(
        area_ratio > 0.50,
        "Remaining area: {:.0}%", area_ratio * 100.0
    );

    // Capacity reduction
    let mn_ratio: f64 = area_ratio; // moment capacity proportional to area
    assert!(
        mn_ratio < 1.0,
        "Moment capacity: {:.0}% of original", mn_ratio * 100.0
    );

    // Pitting factor (localized loss much worse)
    let pitting_factor: f64 = 5.0;
    let loss_pit: f64 = pitting_factor * loss;
    let d_pit: f64 = d_orig - 2.0 * loss_pit;

    // Pitting may reduce section to zero locally
    assert!(
        d_pit < d_remaining,
        "Pitting diameter {:.1} < uniform {:.1} mm", d_pit, d_remaining
    );
}

// ================================================================
// 3. CFRP Flexural Strengthening
// ================================================================
//
// ACI 440.2R: externally bonded FRP for flexural strengthening.
// Mn = As*fy*(d-a/2) + Af*ffe*(df-a/2)
// ffe = εfe × Ef (effective FRP stress)

#[test]
fn rehab_cfrp_flexure() {
    // Existing beam
    let b: f64 = 300.0;         // mm
    let d: f64 = 500.0;         // mm
    let as_exist: f64 = 1200.0; // mm², existing rebar
    let fc: f64 = 25.0;         // MPa
    let fy: f64 = 400.0;        // MPa

    // Existing capacity
    let a_exist: f64 = as_exist * fy / (0.85 * fc * b);
    let mn_exist: f64 = as_exist * fy * (d - a_exist / 2.0) / 1e6; // kN·m

    // CFRP strengthening
    let af: f64 = 300.0;        // mm², CFRP area (2 layers × 150mm wide × 1.0mm thick)
    let ef: f64 = 230_000.0;    // MPa, CFRP modulus
    let efu: f64 = 0.015;       // ultimate strain

    // Effective strain (ACI 440.2R debonding limit)
    let efe: f64 = 0.41 * (fc / (1.0 * ef * 0.001)).sqrt().min(0.9 * efu);
    let ffe: f64 = ef * efe.min(efu);

    // Strengthened compression block
    let a_new: f64 = (as_exist * fy + af * ffe) / (0.85 * fc * b);

    // Strengthened moment capacity
    let df: f64 = d + 25.0;     // mm, CFRP depth (below rebar)
    let mn_new: f64 = (as_exist * fy * (d - a_new / 2.0) + af * ffe * (df - a_new / 2.0)) / 1e6;

    assert!(
        mn_new > mn_exist,
        "Strengthened {:.1} > existing {:.1} kN·m", mn_new, mn_exist
    );

    // Strengthening ratio
    let ratio: f64 = mn_new / mn_exist;
    assert!(
        ratio > 1.10 && ratio < 2.0,
        "Strengthening increase: {:.0}%", (ratio - 1.0) * 100.0
    );
}

// ================================================================
// 4. Steel Section Loss -- Remaining Capacity
// ================================================================
//
// Corrosion in steel beams: flange and web section loss.
// Remaining capacity computed with reduced section properties.

#[test]
fn rehab_steel_section_loss() {
    // Original W-section properties
    let d: f64 = 400.0;         // mm, depth
    let bf: f64 = 200.0;        // mm, flange width
    let tf: f64 = 16.0;         // mm, flange thickness
    let tw: f64 = 10.0;         // mm, web thickness
    let fy: f64 = 250.0;        // MPa

    // Original plastic section modulus (approximate)
    let zx_orig: f64 = bf * tf * (d - tf) + tw * (d - 2.0 * tf).powi(2) / 4.0;
    let mp_orig: f64 = fy * zx_orig / 1e6; // kN·m

    // After 40 years: 2mm loss on each exposed face
    let loss: f64 = 2.0;        // mm per face
    let tf_red: f64 = tf - loss; // top face exposed
    let tw_red: f64 = tw - 2.0 * loss; // both faces

    assert!(
        tw_red > 0.0,
        "Remaining web: {:.1} mm", tw_red
    );

    // Reduced properties
    let zx_red: f64 = bf * tf_red * (d - tf_red) + tw_red * (d - 2.0 * tf_red).powi(2) / 4.0;
    let mp_red: f64 = fy * zx_red / 1e6;

    // Capacity loss
    let capacity_ratio: f64 = mp_red / mp_orig;
    assert!(
        capacity_ratio < 1.0,
        "Remaining capacity: {:.0}%", capacity_ratio * 100.0
    );

    assert!(
        capacity_ratio > 0.60,
        "Capacity ratio {:.2} > 0.60 -- still serviceable", capacity_ratio
    );
}

// ================================================================
// 5. ASCE 41 -- Seismic Retrofit Evaluation
// ================================================================
//
// ASCE 41-17: m-factors for deformation-controlled actions.
// Component capacity: QCE × m (expected capacity × ductility factor)
// Demand: QUF = gravity + earthquake (force-controlled)

#[test]
fn rehab_asce41_seismic() {
    // Beam expected capacity
    let mn_e: f64 = 300.0;      // kN·m, expected moment capacity

    // m-factor for RC beam (Life Safety, conforming)
    let m: f64 = 6.0;           // typical for well-confined beam

    // Deformation-controlled capacity
    let m_dc: f64 = mn_e * m;

    // Seismic demand (from analysis)
    let m_demand: f64 = 1500.0; // kN·m, from linear dynamic analysis

    // DCR (Demand-Capacity Ratio)
    let dcr: f64 = m_demand / m_dc;

    assert!(
        dcr < 1.0,
        "DCR = {:.2} < 1.0 -- adequate for LS", dcr
    );

    // Column check (force-controlled)
    let vn: f64 = 200.0;        // kN, nominal shear capacity
    let ve: f64 = 180.0;        // kN, earthquake shear demand

    // Force-controlled: no m-factor
    let dcr_shear: f64 = ve / vn;
    assert!(
        dcr_shear < 1.0,
        "Shear DCR = {:.2} < 1.0", dcr_shear
    );

    // Knowledge factor (limited data about existing structure)
    let kappa: f64 = 0.75;      // minimum testing/inspection
    let mn_adjusted: f64 = mn_e * kappa;

    assert!(
        mn_adjusted < mn_e,
        "Knowledge-adjusted: {:.0} < expected {:.0} kN·m",
        mn_adjusted, mn_e
    );
}

// ================================================================
// 6. Load Rating -- Bridge Assessment
// ================================================================
//
// AASHTO MBE: Rating Factor = (C - γ_DC*DC - γ_DW*DW) / (γ_LL*(LL+IM))
// RF ≥ 1.0: legal load OK. RF < 1.0: posting or strengthening needed.

#[test]
fn rehab_bridge_load_rating() {
    // Component capacities and demands
    let phi_mn: f64 = 2000.0;   // kN·m, factored capacity
    let dc: f64 = 800.0;        // kN·m, dead load (components)
    let dw: f64 = 200.0;        // kN·m, dead load (wearing surface)

    // Live load (HL-93)
    let ll_im: f64 = 600.0;     // kN·m, live load + impact

    // Load factors (strength I)
    let gamma_dc: f64 = 1.25;
    let gamma_dw: f64 = 1.50;
    let gamma_ll: f64 = 1.75;

    // Inventory rating factor
    let rf_inv: f64 = (phi_mn - gamma_dc * dc - gamma_dw * dw) / (gamma_ll * ll_im);

    assert!(
        rf_inv > 0.0,
        "Inventory RF = {:.2}", rf_inv
    );

    // Operating rating (lower load factors)
    let gamma_ll_oper: f64 = 1.35;
    let rf_oper: f64 = (phi_mn - gamma_dc * dc - gamma_dw * dw) / (gamma_ll_oper * ll_im);

    assert!(
        rf_oper > rf_inv,
        "Operating RF {:.2} > inventory RF {:.2}", rf_oper, rf_inv
    );

    // Posting check
    let needs_posting: bool = rf_inv < 1.0;
    assert!(
        !needs_posting || rf_oper > 0.0,
        "RF_inv={:.2}, RF_oper={:.2}", rf_inv, rf_oper
    );
}

// ================================================================
// 7. Steel Plate Bonding -- Flexural Strengthening
// ================================================================
//
// Traditional strengthening: epoxy-bonded steel plates.
// Plate adds tension reinforcement → increased moment capacity.
// Interface shear stress: τ = V*S/(I*b) at adhesive layer.

#[test]
fn rehab_steel_plate_bonding() {
    // Existing RC beam
    let b: f64 = 300.0;         // mm
    let d: f64 = 500.0;         // mm
    let as_exist: f64 = 1200.0; // mm²
    let fy: f64 = 400.0;        // MPa
    let fc: f64 = 30.0;         // MPa

    // Existing capacity
    let a: f64 = as_exist * fy / (0.85 * fc * b);
    let mn_exist: f64 = as_exist * fy * (d - a / 2.0) / 1e6;

    // Steel plate strengthening
    let bp: f64 = 250.0;        // mm, plate width
    let tp: f64 = 6.0;          // mm, plate thickness
    let fyp: f64 = 275.0;       // MPa, plate yield
    let ap: f64 = bp * tp;      // mm²

    // Strengthened capacity
    let a_new: f64 = (as_exist * fy + ap * fyp) / (0.85 * fc * b);
    let dp: f64 = d + tp / 2.0 + 2.0; // plate below beam + adhesive
    let mn_new: f64 = (as_exist * fy * (d - a_new / 2.0)
                      + ap * fyp * (dp - a_new / 2.0)) / 1e6;

    assert!(
        mn_new > mn_exist,
        "Strengthened {:.1} > existing {:.1} kN·m", mn_new, mn_exist
    );

    // Interface shear stress check
    let v: f64 = 150.0;         // kN, design shear
    // Simplified: average bond stress over anchorage length
    let tau_avg: f64 = ap * fyp / (bp * 1000.0); // MPa (over 1m length)
    let tau_limit: f64 = 2.0;   // MPa, adhesive bond limit

    assert!(
        tau_avg < tau_limit,
        "Bond stress {:.2} < limit {:.1} MPa", tau_avg, tau_limit
    );

    let _v = v;
}

// ================================================================
// 8. Condition Rating -- Structural Assessment
// ================================================================
//
// NBI condition rating: 0-9 scale (9 = excellent, 0 = failed).
// Element-level: CS1-CS4 condition states.
// Rating affects inspection frequency and load rating requirements.

#[test]
fn rehab_condition_assessment() {
    // Element condition states (percentage in each state)
    // CS1: good, CS2: fair, CS3: poor, CS4: severe
    let cs: [f64; 4] = [40.0, 30.0, 20.0, 10.0]; // percentages

    // Weighted condition index (1-4 scale)
    let wci: f64 = (cs[0] * 1.0 + cs[1] * 2.0 + cs[2] * 3.0 + cs[3] * 4.0)
                  / (cs[0] + cs[1] + cs[2] + cs[3]);

    assert!(
        wci > 1.0 && wci < 4.0,
        "Weighted condition index: {:.2}", wci
    );

    // Convert to NBI-like scale (higher = better)
    let nbi: f64 = 9.0 - 2.0 * (wci - 1.0);

    assert!(
        nbi > 3.0 && nbi < 9.0,
        "NBI equivalent: {:.0}", nbi
    );

    // Inspection frequency based on condition
    let inspection_interval: f64 = if nbi >= 7.0 {
        48.0 // months
    } else if nbi >= 5.0 {
        24.0
    } else {
        12.0 // frequent inspection for poor condition
    };

    assert!(
        inspection_interval > 0.0,
        "Inspection interval: {:.0} months", inspection_interval
    );

    // Health index (0-100)
    let hi: f64 = cs[0] * 1.0 + cs[1] * 0.75 + cs[2] * 0.25 + cs[3] * 0.0;
    // = 40 + 22.5 + 5 + 0 = 67.5

    assert!(
        hi > 0.0 && hi <= 100.0,
        "Health index: {:.1}", hi
    );
}

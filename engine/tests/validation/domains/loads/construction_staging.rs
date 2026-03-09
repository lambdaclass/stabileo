/// Validation: Construction Staging & Temporary Works
///
/// References:
///   - AASHTO LRFD §5.12: Segmental construction
///   - EN 12812:2008: Falsework — Performance requirements
///   - Ratay: "Temporary Structures in Construction" 3rd ed. (2012)
///   - ACI 347: Guide to Formwork for Concrete
///   - Chen & Duan: "Bridge Engineering Handbook" 2nd ed. (2014)
///
/// Tests verify shore loads, reshoring effects, staged construction
/// load tracking, and temporary bracing requirements.

// ================================================================
// 1. Formwork Load — ACI 347 (Fresh Concrete Pressure)
// ================================================================
//
// Lateral pressure on wall forms:
// p = w_c * h (fluid pressure) up to a maximum based on pour rate
// ACI 347: p_max = min(CwCc*(150 + 43400/T + 2800*R/T), w_c*h)
// where R = pour rate (m/hr), T = temperature (°F), Cw, Cc = unit wt and chemistry factors

#[test]
fn staging_formwork_pressure() {
    let w_c: f64 = 24.0;      // kN/m³, concrete unit weight
    let h: f64 = 4.0;         // m, form height (pour height)

    // Full hydrostatic (fluid) pressure at base
    let p_hydro: f64 = w_c * h;
    let p_expected: f64 = 96.0; // kPa

    assert!(
        (p_hydro - p_expected).abs() / p_expected < 0.01,
        "Hydrostatic pressure: {:.1} kPa, expected {:.1}", p_hydro, p_expected
    );

    // With rate of placement R = 1.5 m/hr, T = 20°C (68°F):
    // Simplified ACI 347: p = Cw * (7.2 + 785*R/(17.8 + T))
    let r: f64 = 1.5;         // m/hr
    let t_c: f64 = 20.0;      // °C
    let cw: f64 = 1.0;        // normal weight concrete

    // Simplified metric formula: p = Cw*(7.2 + 785*R/(17.8+T))
    let p_limited: f64 = cw * (7.2 + 785.0 * r / (17.8 + t_c));
    // = 1.0 * (7.2 + 1177.5/37.8) = 7.2 + 31.15 = 38.35 kPa

    // Use minimum of hydrostatic and rate-limited
    let p_design: f64 = p_hydro.min(p_limited);

    assert!(
        p_design <= p_hydro,
        "Rate-limited pressure {:.1} ≤ hydrostatic {:.1}", p_design, p_hydro
    );
}

// ================================================================
// 2. Shore Load Distribution — Multi-Story
// ================================================================
//
// When pouring floor n, shores below transfer load through multiple levels.
// For n-level shoring: load on level k = DL * (n-k+1)/n (simplified)
// More accurate: depends on slab stiffness vs shore stiffness ratio.

#[test]
fn staging_shore_load_multi_story() {
    let dl_slab: f64 = 5.0;   // kN/m², self-weight of one slab
    let ll_const: f64 = 1.5;  // kN/m², construction live load

    // Pour floor 3, supported by 2 levels of shores
    let n_shores: usize = 2;
    let total_new: f64 = dl_slab + ll_const; // = 6.5 kN/m²

    // Simplified assumption: shores are rigid, slabs are flexible
    // Load splits equally to each shore level
    let load_per_level: f64 = total_new / n_shores as f64;
    let load_expected: f64 = 3.25; // kN/m²

    assert!(
        (load_per_level - load_expected).abs() / load_expected < 0.01,
        "Shore load per level: {:.2} kN/m²", load_per_level
    );

    // Maximum shore load at lowest level = accumulated from above
    // Level 1 (lowest) carries: its own slab + redistributed loads
    let max_shore: f64 = dl_slab + total_new / n_shores as f64;
    // = 5.0 + 3.25 = 8.25 kN/m²

    assert!(
        max_shore > dl_slab,
        "Max shore load {:.2} > single slab {:.2}", max_shore, dl_slab
    );
}

// ================================================================
// 3. Reshoring Effects
// ================================================================
//
// After initial set, forms are stripped and reshores installed.
// The slab takes its own weight, then reshores provide support for loads above.
// Reshore load: P_reshore = (q_above * slab_stiffness) / (slab + shore stiffness)

#[test]
fn staging_reshoring() {
    let dl: f64 = 5.0;        // kN/m², slab dead load
    let _ll_const: f64 = 1.5;

    // When forms are stripped, slab takes its own weight
    // Reshore installed → share load from level above

    // Stiffness ratio: if slab is much stiffer than reshore, most load goes to slab
    let k_slab: f64 = 100.0;  // relative stiffness
    let k_shore: f64 = 50.0;  // relative stiffness

    // Load from above distributed based on stiffness
    let dl_above: f64 = dl; // dead load from slab being poured above
    let p_reshore: f64 = dl_above * k_shore / (k_slab + k_shore);
    // = 5.0 * 50/(100+50) = 5.0 * 0.333 = 1.667 kN/m²

    let p_slab: f64 = dl_above * k_slab / (k_slab + k_shore);
    // = 5.0 * 100/150 = 3.333 kN/m²

    assert!(
        (p_reshore + p_slab - dl_above).abs() / dl_above < 0.01,
        "Load balance: {:.2} + {:.2} = {:.2}", p_reshore, p_slab, dl_above
    );

    // Total slab load = own weight + share from above
    let total_slab: f64 = dl + p_slab;
    assert!(
        total_slab > dl,
        "Total slab load {:.2} > self-weight {:.2}", total_slab, dl
    );
}

// ================================================================
// 4. Temporary Bracing for Steel Erection
// ================================================================
//
// During erection, unbraced length is full story height.
// Erection load: 1.0D + 1.0 erection load (OSHA/AISC)
// Bracing required until permanent bracing/deck installed.

#[test]
fn staging_temporary_bracing() {
    let h: f64 = 4.0;         // m, story height
    let p_column: f64 = 500.0; // kN, column gravity load during erection
    let e: f64 = 200_000.0;   // MPa, steel modulus
    let iz: f64 = 1.0e-4;     // m⁴, column weak-axis inertia

    // Euler buckling (unbraced full height, K=2.0 for cantilever)
    let k: f64 = 2.0;
    let pe: f64 = std::f64::consts::PI * std::f64::consts::PI * e * 1000.0 * iz / (k * h).powi(2);
    // = π²*200e6*1e-4/(8)² = 9.8696*20000/64 = 3084 kN

    // Check stability during erection
    let ratio: f64 = p_column / pe;
    assert!(
        ratio < 0.5,
        "P/Pe = {:.3} — stable during erection", ratio
    );

    // OSHA requirement: erection bracing for columns > 2 stories unbraced
    // Minimum bracing force: 2% of column load
    let f_brace: f64 = 0.02 * p_column;
    let f_brace_expected: f64 = 10.0; // kN

    assert!(
        (f_brace - f_brace_expected).abs() / f_brace_expected < 0.01,
        "Min bracing force: {:.1} kN", f_brace
    );
}

// ================================================================
// 5. Segmental Bridge Construction — Cantilever Method
// ================================================================
//
// Free cantilever construction: unbalanced moment from one segment.
// M_unbalanced = W_segment * L_arm
// Temporary post-tensioning must resist this moment.

#[test]
fn staging_segmental_cantilever() {
    let w_segment: f64 = 800.0;  // kN, weight of one segment
    let l_segment: f64 = 3.5;    // m, segment length
    let n_built: usize = 6;      // segments built from pier (each side)

    // Unbalanced moment if one side is 1 segment ahead
    let l_arm: f64 = (n_built as f64 + 0.5) * l_segment; // CG of extra segment
    let m_unbalanced: f64 = w_segment * l_arm;
    // = 800 * (6.5 * 3.5) = 800 * 22.75 = 18200 kN·m

    assert!(
        m_unbalanced > 10000.0,
        "Unbalanced moment: {:.0} kN·m", m_unbalanced
    );

    // Total cantilever moment (one side): Σ(Wi * xi)
    let mut m_total: f64 = 0.0;
    for i in 1..=n_built {
        let xi: f64 = (i as f64 - 0.5) * l_segment;
        m_total += w_segment * xi;
    }
    // = 800 * (1.75 + 5.25 + 8.75 + 12.25 + 15.75 + 19.25)
    // = 800 * 63.0 = 50400 kN·m

    assert!(
        m_total > 40000.0,
        "Total cantilever moment: {:.0} kN·m", m_total
    );
}

// ================================================================
// 6. Scaffold Load (EN 12811)
// ================================================================
//
// EN 12811 load classes:
// Class 1: 0.75 kN/m² (inspection/access)
// Class 2: 1.50 kN/m² (light work)
// Class 3: 2.00 kN/m² (masonry work)
// Class 4: 3.00 kN/m² (heavy work)
// Class 5: 4.50 kN/m² (storage)
// Class 6: 6.00 kN/m² (heavy storage)

#[test]
fn staging_scaffold_loads() {
    let q_class3: f64 = 2.00;  // kN/m², masonry work

    // Platform dimensions
    let width: f64 = 0.6;      // m, standard scaffold width
    let bay: f64 = 2.5;        // m, bay length

    // Load per bay
    let q_bay: f64 = q_class3 * width * bay;
    let q_bay_expected: f64 = 3.0; // kN

    assert!(
        (q_bay - q_bay_expected).abs() / q_bay_expected < 0.01,
        "Bay load: {:.1} kN, expected {:.1}", q_bay, q_bay_expected
    );

    // Self-weight of scaffold (approximate)
    let sw: f64 = 0.3;  // kN/m², scaffold self-weight
    let q_total: f64 = (q_class3 + sw) * width * bay;

    assert!(
        q_total > q_bay,
        "Total with SW: {:.1} kN > imposed {:.1} kN", q_total, q_bay
    );

    // Leg load (4 legs per bay, equal sharing)
    let n_legs: usize = 4;
    let leg_load: f64 = q_total / n_legs as f64;
    assert!(
        leg_load > 0.5,
        "Load per leg: {:.2} kN", leg_load
    );
}

// ================================================================
// 7. Propping of Composite Slab
// ================================================================
//
// Steel decking propped during concrete pour.
// After prop removal, composite slab takes full load.
// Prop load: P_prop = (w_concrete + w_deck) * L_trib / 2

#[test]
fn staging_composite_slab_propping() {
    let w_concrete: f64 = 3.0; // kN/m², wet concrete weight
    let w_deck: f64 = 0.15;    // kN/m², steel deck weight
    let l_span: f64 = 3.0;     // m, span between props
    let _b_trib: f64 = 1.0;    // m, unit width

    // Prop load per meter of width
    let p_prop: f64 = (w_concrete + w_deck) * l_span / 2.0;
    // = 3.15 * 3.0 / 2.0 = 4.725 kN/m
    let p_expected: f64 = 4.725;

    assert!(
        (p_prop - p_expected).abs() / p_expected < 0.01,
        "Prop load: {:.3} kN/m, expected {:.3}", p_prop, p_expected
    );

    // Deflection of unpropped deck: δ = 5*w*L⁴/(384*EI)
    let e_deck: f64 = 210_000.0; // MPa
    let i_deck: f64 = 50.0;      // cm⁴/m = 50e-8 m⁴ (per meter width)
    let w_total: f64 = w_concrete + w_deck; // kN/m²

    // In consistent units (kN, m):
    let delta_unpropped: f64 = 5.0 * w_total * l_span.powi(4)
        / (384.0 * e_deck * 1000.0 * i_deck * 1e-8);
    let delta_mm: f64 = delta_unpropped * 1000.0;

    // Should be significant → propping needed
    assert!(
        delta_mm > 5.0,
        "Unpropped deflection: {:.1} mm — propping beneficial", delta_mm
    );
}

// ================================================================
// 8. Construction Load Combination (EN 12812)
// ================================================================
//
// EN 12812: Qd = 1.35*Gk + 1.50*Qk + 1.50*Qc
// Gk = permanent (self-weight), Qk = imposed, Qc = concrete pressure

#[test]
fn staging_load_combination() {
    let gk: f64 = 2.0;        // kN/m², falsework + formwork weight
    let qk: f64 = 1.0;        // kN/m², personnel + equipment
    let qc: f64 = 5.0;        // kN/m², fresh concrete weight

    // ULS combination
    let qd: f64 = 1.35 * gk + 1.50 * qk + 1.50 * qc;
    // = 2.7 + 1.5 + 7.5 = 11.7 kN/m²
    let qd_expected: f64 = 11.7;

    assert!(
        (qd - qd_expected).abs() / qd_expected < 0.01,
        "ULS load: {:.1} kN/m², expected {:.1}", qd, qd_expected
    );

    // SLS combination
    let qs: f64 = gk + qk + qc;
    // = 2.0 + 1.0 + 5.0 = 8.0 kN/m²
    let qs_expected: f64 = 8.0;

    assert!(
        (qs - qs_expected).abs() / qs_expected < 0.01,
        "SLS load: {:.1} kN/m², expected {:.1}", qs, qs_expected
    );

    // Factor between ULS and SLS
    let factor: f64 = qd / qs;
    assert!(
        factor > 1.3 && factor < 1.6,
        "ULS/SLS factor: {:.2}", factor
    );
}

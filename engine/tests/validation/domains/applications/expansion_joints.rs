/// Validation: Expansion Joints & Movement Design
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications, 9th ed.: Section 14
///   - EN 1993-2: Steel Bridges (movement joints)
///   - EN 1994-2: Composite Bridges (shrinkage + thermal)
///   - Chen & Duan: "Bridge Engineering Handbook" 2nd ed. (2014)
///   - CIRIA C660: Early-Age Thermal Crack Control in Concrete
///   - ACI 224.3R: Joints in Concrete Construction
///
/// Tests verify thermal movement, shrinkage, creep, bearing displacement,
/// joint gap sizing, modular joints, and finger joints.

// ================================================================
// 1. Thermal Movement -- Bridge Deck
// ================================================================
//
// ΔL = α × ΔT × L (free expansion)
// Steel: α = 12×10⁻⁶/°C, Concrete: α = 10×10⁻⁶/°C
// Temperature range: depends on geographic location.

#[test]
fn joint_thermal_movement() {
    let l: f64 = 100.0;         // m, expansion length
    let alpha_steel: f64 = 12e-6;   // 1/°C
    let alpha_concrete: f64 = 10e-6; // 1/°C

    // Temperature range (EN 1991-1-5: uniform component)
    let t_max: f64 = 45.0;      // °C
    let t_min: f64 = -15.0;     // °C
    let t_install: f64 = 15.0;  // °C, construction temperature
    let delta_t_exp: f64 = t_max - t_install;
    let delta_t_con: f64 = t_install - t_min;

    // Steel bridge movement
    let delta_exp_steel: f64 = alpha_steel * delta_t_exp * l * 1000.0; // mm
    let delta_con_steel: f64 = alpha_steel * delta_t_con * l * 1000.0;

    assert!(
        delta_exp_steel > 20.0 && delta_exp_steel < 60.0,
        "Steel expansion: {:.1} mm", delta_exp_steel
    );

    // Total movement range
    let total_steel: f64 = delta_exp_steel + delta_con_steel;

    assert!(
        total_steel > 40.0,
        "Total steel movement: {:.1} mm", total_steel
    );

    // Concrete bridge: less movement
    let total_concrete: f64 = alpha_concrete * (t_max - t_min) * l * 1000.0;

    assert!(
        total_concrete < total_steel,
        "Concrete {:.1} < steel {:.1} mm", total_concrete, total_steel
    );
}

// ================================================================
// 2. Shrinkage & Creep Movement -- Concrete
// ================================================================
//
// Shrinkage strain: εcs ≈ 200-400 × 10⁻⁶ (long-term)
// Creep shortening: εcc = φ × σ/Ec (under sustained load)
// These are one-way movements (shortening only).

#[test]
fn joint_shrinkage_creep() {
    let l: f64 = 50.0;          // m, expansion length
    let fc: f64 = 40.0;         // MPa

    // Shrinkage strain (EN 1992-1-1: drying + autogenous)
    let eps_cd: f64 = 300e-6;   // drying shrinkage
    let eps_ca: f64 = 50e-6;    // autogenous shrinkage
    let eps_cs: f64 = eps_cd + eps_ca;

    // Shrinkage movement
    let delta_shrinkage: f64 = eps_cs * l * 1000.0; // mm
    // = 350e-6 × 50000 = 17.5 mm

    assert!(
        delta_shrinkage > 10.0 && delta_shrinkage < 30.0,
        "Shrinkage: {:.1} mm", delta_shrinkage
    );

    // Creep shortening
    let sigma_prestress: f64 = 8.0; // MPa, average compressive stress
    let ec: f64 = 35_000.0;     // MPa, concrete modulus
    let phi_creep: f64 = 2.0;   // creep coefficient (long-term)

    let eps_creep: f64 = phi_creep * sigma_prestress / ec;
    let delta_creep: f64 = eps_creep * l * 1000.0; // mm

    assert!(
        delta_creep > 5.0 && delta_creep < 30.0,
        "Creep shortening: {:.1} mm", delta_creep
    );

    // Total long-term shortening
    let delta_total: f64 = delta_shrinkage + delta_creep;

    assert!(
        delta_total > 15.0,
        "Total shortening: {:.1} mm", delta_total
    );

    let _fc = fc;
}

// ================================================================
// 3. Joint Gap Sizing
// ================================================================
//
// Gap at installation temperature must accommodate:
// - Thermal expansion (gap closes)
// - Thermal contraction + shrinkage + creep (gap opens)
// Gap_install = gap_min + expansion_movement
// Gap_max = gap_install + contraction + shrinkage + creep

#[test]
fn joint_gap_sizing() {
    let delta_exp: f64 = 36.0;  // mm, thermal expansion
    let delta_con: f64 = 36.0;  // mm, thermal contraction
    let delta_shrinkage: f64 = 17.0; // mm
    let delta_creep: f64 = 12.0; // mm

    // Minimum gap (prevent contact): 10-20mm
    let gap_min: f64 = 15.0;    // mm

    // Gap at installation
    let gap_install: f64 = gap_min + delta_exp;
    // = 15 + 36 = 51 mm

    assert!(
        gap_install > 40.0,
        "Installation gap: {:.0} mm", gap_install
    );

    // Maximum gap (opening)
    let gap_max: f64 = gap_install + delta_con + delta_shrinkage + delta_creep;
    // = 51 + 36 + 17 + 12 = 116 mm

    assert!(
        gap_max > 80.0,
        "Maximum gap: {:.0} mm", gap_max
    );

    // Total joint movement range
    let total_range: f64 = gap_max - gap_min;
    // = 116 - 15 = 101 mm

    assert!(
        total_range > 50.0,
        "Total range: {:.0} mm", total_range
    );

    // Joint type selection
    let joint_type = if total_range < 40.0 {
        "compression seal"
    } else if total_range < 80.0 {
        "strip seal"
    } else if total_range < 200.0 {
        "finger joint"
    } else {
        "modular expansion joint"
    };

    assert!(
        !joint_type.is_empty(),
        "Joint type: {} (range = {:.0} mm)", joint_type, total_range
    );
}

// ================================================================
// 4. Modular Expansion Joint -- Multi-Gap
// ================================================================
//
// For large movements: multiple gaps in series.
// Each gap controlled by center beams on spring/elastomer supports.
// Movement per gap: 50-80mm typically.
// Total capacity: n_gaps × movement_per_gap.

#[test]
fn joint_modular_expansion() {
    let total_movement: f64 = 300.0; // mm, total required
    let gap_capacity: f64 = 60.0;    // mm per gap

    // Number of gaps required
    let n_gaps: usize = (total_movement / gap_capacity).ceil() as usize;

    assert!(
        n_gaps >= 5,
        "Number of gaps: {}", n_gaps
    );

    // Center beam spacing (approximately)
    let beam_width: f64 = 80.0;  // mm, center beam width
    let total_width: f64 = n_gaps as f64 * (gap_capacity + beam_width);

    assert!(
        total_width > 500.0,
        "Joint total width: {:.0} mm", total_width
    );

    // Spring stiffness (equalize gap movements)
    // Each center beam on springs: k per support point
    let w_beam: f64 = 1.0;      // kN/m, center beam self-weight
    let l_beam: f64 = 10.0;     // m, beam length (bridge width)
    let n_supports: usize = 5;  // support points per beam
    let k_spring: f64 = w_beam * l_beam / n_supports as f64; // kN per spring (static)

    assert!(
        k_spring > 0.0,
        "Spring stiffness: {:.2} kN/support", k_spring
    );

    // Traffic loading on joint (wheel crosses gaps)
    let p_wheel: f64 = 75.0;    // kN (EN 1991-2 LM1 tandem)
    let contact_width: f64 = 400.0; // mm, tire contact width

    // Local bending of center beam
    let span_cb: f64 = l_beam / n_supports as f64 * 1000.0; // mm
    let m_cb: f64 = p_wheel * span_cb / 4.0 / 1000.0; // kN·m (simply supported)

    assert!(
        m_cb > 10.0,
        "Center beam moment: {:.1} kN·m", m_cb
    );

    let _contact_width = contact_width;
}

// ================================================================
// 5. Bearing Displacement -- Elastomeric Pad
// ================================================================
//
// Elastomeric bearing accommodates movement through shear deformation.
// Maximum shear strain: γ = Δ/t ≤ 0.5-0.7 (EN 1337-3)
// Bearing size determined by movement + vertical load.

#[test]
fn joint_elastomeric_bearing() {
    let delta_total: f64 = 50.0; // mm, total horizontal movement
    let n_vertical: f64 = 500.0; // kN, vertical load

    // Maximum allowable shear strain
    let gamma_max: f64 = 0.50;  // EN 1337-3

    // Required rubber thickness
    let t_rubber: f64 = delta_total / gamma_max;
    // = 50 / 0.5 = 100 mm

    assert!(
        t_rubber > 50.0 && t_rubber < 300.0,
        "Required rubber thickness: {:.0} mm", t_rubber
    );

    // Bearing plan area (from compressive stress limit)
    let sigma_c_max: f64 = 10.0; // MPa, compressive stress limit
    let a_bearing: f64 = n_vertical * 1000.0 / sigma_c_max; // mm²
    let l_bearing: f64 = a_bearing.sqrt(); // square bearing

    assert!(
        l_bearing > 150.0,
        "Bearing dimension: {:.0} × {:.0} mm", l_bearing, l_bearing
    );

    // Shape factor (S ≥ 5 typically)
    let n_layers: usize = 8;
    let t_layer: f64 = t_rubber / n_layers as f64;
    let s: f64 = l_bearing / (4.0 * t_layer); // for square bearing

    assert!(
        s > 3.0,
        "Shape factor: {:.1}", s
    );

    // Total bearing height (rubber + steel shims)
    let t_shim: f64 = 3.0;      // mm, steel reinforcing plate
    let h_total: f64 = t_rubber + (n_layers - 1) as f64 * t_shim + 2.0 * 5.0; // top/bottom plates

    assert!(
        h_total > t_rubber,
        "Total height: {:.0} mm", h_total
    );
}

// ================================================================
// 6. Finger Joint -- Bridge Deck
// ================================================================
//
// Finger (or tooth) joints for medium movements (50-200mm).
// Cantilever fingers mesh together.
// Must carry wheel loads while allowing movement.

#[test]
fn joint_finger_type() {
    let total_movement: f64 = 120.0; // mm
    let _gap_at_install: f64 = total_movement / 2.0; // set at mid-range

    // Finger dimensions
    let finger_length: f64 = total_movement + 30.0; // mm, movement + min overlap
    let finger_width: f64 = 60.0; // mm
    let finger_thickness: f64 = 50.0; // mm (steel finger plate)

    // Overlap at maximum opening
    let overlap_min: f64 = finger_length - total_movement;

    assert!(
        overlap_min > 0.0,
        "Minimum overlap: {:.0} mm (must be positive!)", overlap_min
    );

    // Wheel load on finger (EN 1991-2: 150 kN over 400×400mm)
    let p_wheel: f64 = 150.0;   // kN
    let contact_area: f64 = 400.0; // mm, contact width
    let n_fingers_loaded: f64 = contact_area / (finger_width + 10.0); // 10mm gap
    let p_per_finger: f64 = p_wheel / n_fingers_loaded;

    assert!(
        p_per_finger > 10.0 && p_per_finger < 50.0,
        "Load per finger: {:.1} kN", p_per_finger
    );

    // Finger bending (cantilever)
    let m_finger: f64 = p_per_finger * finger_length / 1000.0; // kN·m
    let w_finger: f64 = finger_width * finger_thickness * finger_thickness / 6.0; // mm³
    let sigma_finger: f64 = m_finger * 1e6 / w_finger;

    assert!(
        sigma_finger < 250.0,
        "Finger stress: {:.0} MPa", sigma_finger
    );
}

// ================================================================
// 7. Building Expansion Joint -- Seismic Gap
// ================================================================
//
// Buildings need expansion joints for thermal + seismic.
// Seismic gap: δ_gap ≥ √(δ₁² + δ₂²) (SRSS combination)
// where δ₁, δ₂ = maximum displacements of adjacent structures.

#[test]
fn joint_building_seismic_gap() {
    let h: f64 = 30.0;          // m, building height
    let drift_1: f64 = 0.020;   // maximum drift ratio (building 1)
    let drift_2: f64 = 0.015;   // maximum drift ratio (building 2)

    // Maximum displacement at top
    let delta_1: f64 = drift_1 * h * 1000.0; // mm
    let delta_2: f64 = drift_2 * h * 1000.0;

    assert!(
        delta_1 > 400.0,
        "Building 1 displacement: {:.0} mm", delta_1
    );

    // SRSS combination (independent motion)
    let gap_seismic: f64 = (delta_1 * delta_1 + delta_2 * delta_2).sqrt();

    assert!(
        gap_seismic > 500.0,
        "Seismic gap: {:.0} mm", gap_seismic
    );

    // ABS combination (worst case, same direction)
    let gap_abs: f64 = delta_1 + delta_2;
    assert!(
        gap_abs > gap_seismic,
        "ABS gap {:.0} > SRSS gap {:.0} mm", gap_abs, gap_seismic
    );

    // Thermal expansion joint spacing in building
    let l_building: f64 = 80.0; // m
    let alpha: f64 = 10e-6;
    let delta_t: f64 = 40.0;
    let thermal_movement: f64 = alpha * delta_t * l_building * 1000.0;

    assert!(
        thermal_movement > 20.0,
        "Thermal movement: {:.0} mm", thermal_movement
    );

    // Total gap requirement
    let total_gap: f64 = gap_seismic + thermal_movement;
    assert!(
        total_gap > gap_seismic,
        "Total gap: {:.0} mm (seismic + thermal)", total_gap
    );
}

// ================================================================
// 8. Pot Bearing -- Rotation & Translation
// ================================================================
//
// Pot bearings: accommodate rotation + vertical load.
// Guided pot bearing: movement in one direction.
// Multi-directional pot bearing: movement in all directions.

#[test]
fn joint_pot_bearing() {
    let n: f64 = 3000.0;        // kN, vertical load
    let delta_x: f64 = 80.0;    // mm, longitudinal movement
    let delta_y: f64 = 20.0;    // mm, transverse movement
    let theta_max: f64 = 0.02;  // rad, maximum rotation

    // Pot diameter (from vertical load)
    // Contact pressure on elastomeric disc: σ ≤ 30 MPa
    let sigma_max: f64 = 30.0;  // MPa
    let a_pot: f64 = n * 1000.0 / sigma_max; // mm²
    let d_pot: f64 = (4.0 * a_pot / std::f64::consts::PI).sqrt();

    assert!(
        d_pot > 300.0 && d_pot < 500.0,
        "Pot diameter: {:.0} mm", d_pot
    );

    // Elastomeric disc thickness
    // Must accommodate rotation: t_disc ≥ d_pot × θ / 2
    let t_disc: f64 = d_pot * theta_max / 2.0;

    assert!(
        t_disc > 3.0,
        "Disc thickness: {:.1} mm (for rotation)", t_disc
    );

    // PTFE sliding surface
    // Friction coefficient: μ = 0.03-0.05 (lubricated PTFE)
    let mu: f64 = 0.03;
    let f_friction: f64 = mu * n;

    assert!(
        f_friction > 50.0,
        "Friction force: {:.0} kN", f_friction
    );

    // Horizontal force on substructure (from friction + movement restraint)
    let h_total: f64 = f_friction; // for free bearing
    let m_pier: f64 = h_total * 5.0; // kN·m (pier height = 5m)

    assert!(
        m_pier > 200.0,
        "Pier moment from bearing: {:.0} kN·m", m_pier
    );

    let _delta_x = delta_x;
    let _delta_y = delta_y;
}

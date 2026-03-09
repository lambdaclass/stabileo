/// Validation: Steel Storage Rack Design
///
/// References:
///   - RMI MH16.1: Specification for Industrial Steel Storage Racks (2021)
///   - EN 15512: Steel Static Storage Systems (2020)
///   - FEM 10.2.02: Recommendations for Design of Static Steel Pallet Racking
///   - AISC 360: Steel Construction (applicable sections)
///   - AS 4084: Steel Storage Racking (2012)
///   - FEMA 460: Seismic Considerations for Steel Storage Racks
///
/// Tests verify column design, beam-column connection, base plate,
/// frame bracing, seismic design, pallet beam, and down-aisle stability.

// ================================================================
// 1. Upright Column -- Perforated Section
// ================================================================
//
// Rack columns: thin-walled open sections with perforations.
// Effective area reduced by perforation pattern.
// EN 15512: stub column test determines effective area.
// Buckling about both axes + distortional buckling.

#[test]
fn rack_column_capacity() {
    let a_gross: f64 = 800.0;   // mm², gross area
    let perf_ratio: f64 = 0.85; // net/gross area ratio
    let a_net: f64 = a_gross * perf_ratio;

    let fy: f64 = 350.0;        // MPa, yield strength
    let e: f64 = 210_000.0;     // MPa

    // Effective area from stub column test
    let q_factor: f64 = 0.90;   // local buckling reduction (thin walls)
    let a_eff: f64 = a_net * q_factor;

    // Squash load
    let n_sq: f64 = a_eff * fy / 1000.0; // kN

    assert!(
        n_sq > 150.0,
        "Squash load: {:.0} kN", n_sq
    );

    // Flexural buckling
    let l_col: f64 = 2000.0;    // mm, effective buckling length (one beam spacing)
    let r_min: f64 = 22.0;      // mm, minimum radius of gyration
    let lambda: f64 = l_col / r_min;

    assert!(
        lambda > 50.0,
        "Slenderness: {:.0}", lambda
    );

    // Euler buckling stress
    let sigma_e: f64 = std::f64::consts::PI * std::f64::consts::PI * e / (lambda * lambda);
    let lambda_bar: f64 = (fy / sigma_e).sqrt(); // normalized slenderness

    // EN 15512 buckling curve (similar to curve b)
    let alpha_imp: f64 = 0.34;  // imperfection factor
    let phi: f64 = 0.5 * (1.0 + alpha_imp * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
    let chi: f64 = 1.0 / (phi + (phi * phi - lambda_bar * lambda_bar).sqrt());
    let chi_bounded: f64 = chi.min(1.0);

    let n_buckling: f64 = chi_bounded * a_eff * fy / 1000.0;

    assert!(
        n_buckling < n_sq,
        "Buckling capacity: {:.0} < squash {:.0} kN", n_buckling, n_sq
    );

    assert!(
        n_buckling > 30.0,
        "Buckling capacity: {:.0} kN (usable)", n_buckling
    );
}

// ================================================================
// 2. Beam-to-Column Connection (Boltless)
// ================================================================
//
// Typical: tab-in-slot connector (boltless).
// Semi-rigid connection: stiffness from test (EN 15512 §A.2.4).
// M-θ relationship: bilinear or Ramberg-Osgood model.

#[test]
fn rack_beam_column_connection() {
    // Connection properties from cantilever test (EN 15512 A.2.4)
    let m_rd: f64 = 2.5;        // kN·m, design moment resistance
    let k_initial: f64 = 100.0; // kN·m/rad, initial stiffness
    let theta_max: f64 = 0.04;  // rad, maximum rotation

    // Check moment at design rotation
    let theta_design: f64 = 0.02; // rad
    let m_design: f64 = k_initial * theta_design;

    // Connection moment limited by capacity
    let m_actual: f64 = m_design.min(m_rd);

    assert!(
        m_actual <= m_rd,
        "M = {:.2} ≤ M_Rd = {:.2} kN·m", m_actual, m_rd
    );

    // Classification (EN 15512): rigid if k > 8*EI/L
    let ei_beam: f64 = 500.0;   // kN·m² (typical rack beam)
    let l_beam: f64 = 2.7;      // m, bay width
    let k_rigid_limit: f64 = 8.0 * ei_beam / l_beam;

    let connection_type = if k_initial > k_rigid_limit {
        "rigid"
    } else if k_initial > 0.5 * ei_beam / l_beam {
        "semi-rigid"
    } else {
        "pinned"
    };

    assert!(
        !connection_type.is_empty(),
        "Connection: {} (k={:.0} vs limit={:.0})", connection_type, k_initial, k_rigid_limit
    );

    let _theta_max = theta_max;
}

// ================================================================
// 3. Base Plate Design
// ================================================================
//
// Column base: anchored to floor slab.
// Moment resistance depends on anchor bolt pattern.
// EN 15512 §9.4: base stiffness from test.

#[test]
fn rack_base_plate() {
    let n_col: f64 = 80.0;      // kN, column axial load
    let m_base: f64 = 1.5;      // kN·m, base moment (from sway)

    // Base plate dimensions
    let b_plate: f64 = 120.0;   // mm
    let d_plate: f64 = 150.0;   // mm
    let t_plate: f64 = 8.0;     // mm

    // Bearing pressure
    let e: f64 = m_base * 1e6 / (n_col * 1e3); // mm, eccentricity
    let a_plate: f64 = b_plate * d_plate;

    // Check if within kern (d/6)
    let kern: f64 = d_plate / 6.0;
    let within_kern: bool = e < kern;

    if within_kern {
        let sigma_max: f64 = n_col * 1000.0 / a_plate * (1.0 + 6.0 * e / d_plate);
        let sigma_min: f64 = n_col * 1000.0 / a_plate * (1.0 - 6.0 * e / d_plate);

        assert!(
            sigma_min >= 0.0,
            "Full compression: σ_min = {:.1} MPa", sigma_min
        );
        assert!(
            sigma_max < 40.0,
            "Max bearing: {:.1} MPa", sigma_max
        );
    }

    // Anchor bolt tension (if moment causes uplift)
    let lever_arm: f64 = 100.0; // mm, bolt to compression edge
    let t_bolt: f64 = (m_base * 1e6 - n_col * 1000.0 * lever_arm / 2.0) / lever_arm;

    // For low eccentricity, bolt tension may be zero or negative (compression)
    assert!(
        t_bolt < 50_000.0,
        "Bolt tension: {:.0} N", t_bolt.max(0.0)
    );

    let _t_plate = t_plate;
}

// ================================================================
// 4. Cross-Aisle Bracing
// ================================================================
//
// Upright frames braced in cross-aisle direction.
// Diagonal bracing: compression/tension under horizontal loads.
// RMI: frame capacity based on test or calculation.

#[test]
fn rack_cross_aisle_bracing() {
    let h: f64 = 6.0;           // m, frame height
    let d: f64 = 1.0;           // m, frame depth (cross-aisle)
    let n_panels: usize = 4;    // number of bracing panels
    let panel_h: f64 = h / n_panels as f64;

    // Diagonal length
    let l_diag: f64 = (panel_h * panel_h + d * d).sqrt() * 1000.0; // mm

    assert!(
        l_diag > 1000.0 && l_diag < 3000.0,
        "Diagonal length: {:.0} mm", l_diag
    );

    // Horizontal load (seismic or notional)
    let w_total: f64 = 100.0;   // kN, total frame load
    let f_h: f64 = 0.05 * w_total; // notional horizontal (5%)

    // Diagonal force
    let f_diag: f64 = f_h * l_diag / (d * 1000.0);

    assert!(
        f_diag > 0.0 && f_diag < 50.0,
        "Diagonal force: {:.1} kN", f_diag
    );

    // Diagonal section (typically C-section or angle)
    let a_diag: f64 = 250.0;    // mm², diagonal cross-section
    let r_diag: f64 = 12.0;     // mm, radius of gyration
    let lambda_diag: f64 = l_diag / r_diag;

    // Must check compression buckling
    assert!(
        lambda_diag < 250.0,
        "Diagonal slenderness: {:.0}", lambda_diag
    );

    // Buckling capacity
    let fy: f64 = 350.0;
    let e: f64 = 210_000.0;
    let sigma_e: f64 = std::f64::consts::PI.powi(2) * e / (lambda_diag * lambda_diag);
    let n_diag: f64 = a_diag * sigma_e.min(fy) / 1000.0;

    assert!(
        n_diag > f_diag,
        "Diagonal capacity {:.1} > demand {:.1} kN", n_diag, f_diag
    );
}

// ================================================================
// 5. Seismic Design -- FEMA 460
// ================================================================
//
// Storage racks: unique seismic behavior.
// Period depends on connection stiffness (semi-rigid).
// Contents may slide → reduced seismic mass.
// FEMA 460: R = 4 (down-aisle), R = 3 (cross-aisle, braced).

#[test]
fn rack_seismic_design() {
    let w_rack: f64 = 5.0;      // kN, rack self-weight per frame
    let w_pallet: f64 = 10.0;   // kN, per pallet position
    let n_levels: usize = 4;
    let n_bays: usize = 5;

    // Total weight
    let w_total: f64 = w_rack + w_pallet * (n_levels * n_bays) as f64;

    assert!(
        w_total > 100.0,
        "Total weight: {:.0} kN", w_total
    );

    // Seismic mass (contents may slide)
    let p_sliding: f64 = 0.67;  // fraction of pallet weight effective
    let w_seismic: f64 = w_rack + p_sliding * w_pallet * (n_levels * n_bays) as f64;

    assert!(
        w_seismic < w_total,
        "Seismic weight: {:.0} < total {:.0} kN", w_seismic, w_total
    );

    // Approximate period (semi-rigid connections)
    let t_down: f64 = 1.5;      // s, typical down-aisle period
    let t_cross: f64 = 0.3;     // s, typical cross-aisle period

    // Base shear (ASCE 7 equivalent lateral force)
    let sds: f64 = 1.0;         // g, design spectral acceleration
    let r_down: f64 = 4.0;      // response modification factor
    let r_cross: f64 = 3.0;
    let ie: f64 = 1.5;          // importance factor (public access)

    let cs_down: f64 = sds / (r_down / ie);
    let cs_cross: f64 = sds / (r_cross / ie);

    let v_down: f64 = cs_down * w_seismic;
    let v_cross: f64 = cs_cross * w_seismic;

    assert!(
        v_cross > v_down,
        "Cross-aisle V={:.0} > down-aisle V={:.0} kN (lower R)", v_cross, v_down
    );

    let _t_down = t_down;
    let _t_cross = t_cross;
}

// ================================================================
// 6. Pallet Beam Design
// ================================================================
//
// Beam carries pallet loads between uprights.
// Typically open C or box section.
// Design for bending + shear under 2-3 pallet positions.

#[test]
fn rack_pallet_beam() {
    let l: f64 = 2700.0;        // mm, beam span (bay width)
    let n_pallets: usize = 3;
    let w_pallet: f64 = 10.0;   // kN, per pallet

    // Total UDL equivalent
    let w_total: f64 = w_pallet * n_pallets as f64;
    let w_per_mm: f64 = w_total / l; // kN/mm

    // Maximum moment (UDL approximation)
    let m_max: f64 = w_total * l / 8.0 / 1000.0; // kN·m
    // = 30 × 2700 / 8000 = 10.1 kN·m

    assert!(
        m_max > 5.0 && m_max < 30.0,
        "Max moment: {:.1} kN·m", m_max
    );

    // Maximum shear
    let v_max: f64 = w_total / 2.0;

    assert!(
        v_max > 10.0,
        "Max shear: {:.0} kN", v_max
    );

    // Beam section (typical box beam)
    let s_x: f64 = 30_000.0;    // mm³, section modulus
    let fy: f64 = 350.0;        // MPa

    // Bending capacity
    let m_rd: f64 = s_x * fy / 1e6; // kN·m

    assert!(
        m_rd > m_max,
        "M_Rd = {:.1} > M_Ed = {:.1} kN·m", m_rd, m_max
    );

    // Deflection check (L/200 for racks, EN 15512)
    let ei: f64 = 700.0;        // kN·m²
    let delta: f64 = 5.0 * w_total * (l / 1000.0).powi(3) / (384.0 * ei) * 1000.0; // mm
    let delta_limit: f64 = l / 200.0;

    assert!(
        delta < delta_limit,
        "Deflection {:.1} < {:.1} mm (L/200)", delta, delta_limit
    );

    let _w_per_mm = w_per_mm;
}

// ================================================================
// 7. Down-Aisle Stability (P-Δ)
// ================================================================
//
// Down-aisle frames: sway due to semi-rigid connections.
// P-Δ effects significant due to high axial loads + flexibility.
// EN 15512: amplification factor αcr < 10 → second-order required.

#[test]
fn rack_down_aisle_stability() {
    let h: f64 = 6.0;           // m, total height
    let n_col_pairs: usize = 6; // number of column pairs in run
    let p_col: f64 = 80.0;      // kN, axial load per column

    // Sway stiffness (from semi-rigid connections)
    let k_sway: f64 = 50.0;     // kN/m, horizontal stiffness of frame

    // Critical load (sway)
    let v_total: f64 = p_col * (n_col_pairs * 2) as f64;
    let h_cr: f64 = k_sway * h; // kN (simplified elastic critical load parameter)

    // αcr = H_cr / V × h (elastic critical load multiplier)
    // More precisely: αcr = (H × h) / (V × Δ)
    // Simplified: αcr ≈ k_sway × h² / V_total
    let alpha_cr: f64 = k_sway * h * h / v_total;

    assert!(
        alpha_cr > 1.0,
        "α_cr = {:.2} > 1.0 (stable)", alpha_cr
    );

    // If αcr < 10: must use second-order analysis
    if alpha_cr < 10.0 {
        // Amplification factor
        let amplifier: f64 = 1.0 / (1.0 - 1.0 / alpha_cr);
        assert!(
            amplifier > 1.0 && amplifier < 5.0,
            "P-Δ amplifier: {:.2}", amplifier
        );
    }

    // Notional horizontal load (EN 15512)
    let phi_s: f64 = 1.0 / 200.0; // sway imperfection
    let h_notional: f64 = v_total * phi_s;

    assert!(
        h_notional > 0.0,
        "Notional load: {:.2} kN", h_notional
    );

    let _h_cr = h_cr;
}

// ================================================================
// 8. Floor Loading from Rack -- Slab Check
// ================================================================
//
// Rack base plates create point loads on floor slab.
// Must check slab punching under concentrated loads.
// RMI: report rack reactions for floor designer.

#[test]
fn rack_floor_loading() {
    let p_col: f64 = 100.0;     // kN, column reaction (max loaded)
    let base_plate: f64 = 120.0; // mm, base plate dimension

    // Floor slab properties
    let h_slab: f64 = 200.0;    // mm, slab thickness
    let fc: f64 = 25.0;         // MPa, concrete strength
    let d: f64 = 160.0;         // mm, effective depth

    // Punching perimeter (at d/2 from plate edge)
    let u: f64 = 4.0 * (base_plate + d); // mm

    // Punching resistance (EC2 simplified)
    let v_rd: f64 = 0.18 * (1.0 + (200.0 / d).sqrt()) * fc.powf(1.0 / 3.0); // MPa
    let f_rd: f64 = v_rd * u * d / 1000.0; // kN

    assert!(
        f_rd > p_col,
        "Punching capacity {:.0} > demand {:.0} kN", f_rd, p_col
    );

    // Bearing pressure under base plate
    let a_base: f64 = base_plate * base_plate;
    let sigma_bearing: f64 = p_col * 1000.0 / a_base; // MPa

    // Allowable bearing on concrete: 0.85*fc (unreinforced)
    let sigma_allow: f64 = 0.85 * fc;

    assert!(
        sigma_bearing < sigma_allow,
        "Bearing {:.1} < allowable {:.1} MPa", sigma_bearing, sigma_allow
    );

    // Slab moment under point load (Westergaard)
    let k: f64 = 50.0;          // MN/m³, subgrade modulus
    let e_c: f64 = 30_000.0;    // MPa
    let k_nmm3: f64 = k * 1e-3; // convert MN/m³ to N/mm³
    let l_radius: f64 = ((e_c * h_slab.powi(3)) / (12.0 * (1.0 - 0.2 * 0.2) * k_nmm3)).powf(0.25);

    assert!(
        l_radius > 300.0,
        "Radius of relative stiffness: {:.0} mm", l_radius
    );
}

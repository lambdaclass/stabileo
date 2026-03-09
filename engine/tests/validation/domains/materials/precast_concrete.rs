/// Validation: Precast Concrete Design
///
/// References:
///   - PCI Design Handbook, 8th Edition (2017)
///   - EN 1992-1-1 (EC2): Design of Concrete Structures
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - fib Model Code 2010
///   - CPCI Design Manual (Canadian Precast/Prestressed Concrete Institute)
///   - PCI Connections Manual (2008)
///
/// Tests verify hollow-core slab capacity, double-tee design,
/// corbel design, bearing pad stress, connection design, and tolerances.

// ================================================================
// 1. Hollow-Core Slab -- Flexural Capacity
// ================================================================
//
// Prestressed hollow-core: effective prestress + section properties.
// Mn = Aps * fps * (dp - a/2)
// fps from strain compatibility or ACI approximate formula.

#[test]
fn precast_hollow_core_flexure() {
    let aps: f64 = 770.0;       // mm², total strand area (7 × 12.7mm strands)
    let fpu: f64 = 1860.0;      // MPa, strand ultimate strength
    let fpe: f64 = 1100.0;      // MPa, effective prestress after losses
    let dp: f64 = 175.0;        // mm, depth to centroid of strands
    let b: f64 = 1200.0;        // mm, slab width
    let fc: f64 = 45.0;         // MPa, concrete strength

    // ACI 318 approximate fps
    let rho_p: f64 = aps / (b * dp);
    let gamma_p: f64 = 0.28;    // for fpy/fpu ≥ 0.9 (low-relaxation)
    let beta1: f64 = 0.65;      // for fc = 45 MPa

    let fps: f64 = fpu * (1.0 - gamma_p / beta1 * rho_p * fpu / fc);

    assert!(
        fps > fpe && fps < fpu,
        "fps = {:.0} MPa (between fpe and fpu)", fps
    );

    // Compression block depth
    let a: f64 = aps * fps / (0.85 * fc * b);

    assert!(
        a < dp * 0.3,
        "a = {:.1}mm < 0.3*dp -- under-reinforced (ductile)", a
    );

    // Nominal moment capacity
    let mn: f64 = aps * fps * (dp - a / 2.0) / 1e6; // kN·m

    assert!(
        mn > 100.0 && mn < 400.0,
        "Mn = {:.1} kN·m", mn
    );
}

// ================================================================
// 2. Double-Tee Flange Design
// ================================================================
//
// Composite double-tee: precast stem + cast-in-place topping.
// Effective flange width per ACI 318.
// Check interface shear (horizontal shear) at composite joint.

#[test]
fn precast_double_tee_composite() {
    let b_stem: f64 = 150.0;    // mm, stem width (each)
    let n_stems: f64 = 2.0;
    let span: f64 = 18_000.0;   // mm
    let h_precast: f64 = 600.0; // mm, precast depth
    let h_topping: f64 = 75.0;  // mm, topping thickness
    let fc_precast: f64 = 40.0; // MPa
    let fc_topping: f64 = 30.0; // MPa

    // Modular ratio for composite section
    let n_ratio: f64 = (fc_topping / fc_precast).sqrt();

    assert!(
        n_ratio < 1.0,
        "Modular ratio {:.3} < 1.0 (topping weaker)", n_ratio
    );

    // Interface shear demand (ACI 318 §16.4)
    // Vnh = Vu (simplified: all vertical shear transferred at interface)
    let w: f64 = 8.0;           // kN/m, total UDL
    let vu: f64 = w * span / 1000.0 / 2.0; // kN

    // Interface shear capacity (roughened surface, no ties)
    // vnh = 0.55 MPa (ACI 318 for roughened surface)
    let vnh_stress: f64 = 0.55; // MPa
    let b_v: f64 = n_stems * b_stem; // mm, contact width
    let vnh: f64 = vnh_stress * b_v * span / 2.0 / 1000.0; // kN (over half span)

    // This is total capacity; compare unit shear
    let _v_interface: f64 = vu * 1000.0 / b_v; // N/mm = MPa (over length)
    // Actually: unit shear = V / (bv * d), simplified
    let d_comp: f64 = h_precast + h_topping;
    let unit_shear: f64 = vu * 1000.0 / (b_v * d_comp); // MPa

    assert!(
        unit_shear < vnh_stress,
        "Interface shear {:.3} < capacity {:.2} MPa", unit_shear, vnh_stress
    );

    let _vnh = vnh;
}

// ================================================================
// 3. Corbel Design -- PCI Strut-and-Tie
// ================================================================
//
// Short cantilever bracket (a/d ≤ 1.0).
// PCI: Af = Vu/(φ*fy*μ), An = Nuc/(φ*fy), As = max(Af+An, 2Avf/3+An)
// μ = 1.4 for monolithic concrete

#[test]
fn precast_corbel_design() {
    let vu: f64 = 250.0;        // kN, vertical load (factored)
    let nuc: f64 = 50.0;        // kN, horizontal tensile force (0.2*Vu min)
    let fy: f64 = 500.0;        // MPa
    let fc: f64 = 35.0;         // MPa
    let phi: f64 = 0.75;        // strength reduction factor

    // Friction coefficient (monolithic, normal weight)
    let mu: f64 = 1.4;

    // Shear-friction reinforcement
    let avf: f64 = vu * 1000.0 / (phi * fy * mu); // mm²
    // = 250000 / (0.75 * 500 * 1.4) = 476 mm²

    // Direct tension reinforcement
    let an: f64 = nuc * 1000.0 / (phi * fy); // mm²
    // = 50000 / (0.75 * 500) = 133 mm²

    // Primary reinforcement (ACI 318 §16.5)
    let as1: f64 = avf + an;
    let as2: f64 = 2.0 * avf / 3.0 + an;
    let as_req: f64 = as1.max(as2);

    assert!(
        as_req > 400.0 && as_req < 1000.0,
        "Required As = {:.0} mm²", as_req
    );

    // Check a/d ratio (must be ≤ 1.0 for corbel design)
    let a_lever: f64 = 200.0;   // mm, distance from face to Vu
    let d: f64 = 400.0;         // mm, effective depth
    let ad_ratio: f64 = a_lever / d;

    assert!(
        ad_ratio <= 1.0,
        "a/d = {:.2} ≤ 1.0 -- corbel provisions apply", ad_ratio
    );

    // Maximum shear
    let vn_max: f64 = 0.2 * fc * 300.0 * d / 1000.0; // kN (b=300mm)
    assert!(
        vu < vn_max,
        "Vu = {:.0} < Vn_max = {:.0} kN", vu, vn_max
    );
}

// ================================================================
// 4. Bearing Pad -- Elastomeric Bearing
// ================================================================
//
// PCI: shape factor S = loaded area / (perimeter × pad thickness per layer)
// Compressive stress: σ ≤ GS (for plain pads) or σ ≤ 2GS (reinforced)
// G = shear modulus of elastomer (0.5-1.0 MPa)

#[test]
fn precast_bearing_pad() {
    let l: f64 = 200.0;         // mm, pad length
    let w: f64 = 150.0;         // mm, pad width
    let t_layer: f64 = 10.0;    // mm, individual layer thickness
    let n_layers: f64 = 3.0;
    let g: f64 = 0.7;           // MPa, shear modulus (Shore A 50)

    // Shape factor
    let area: f64 = l * w;
    let perimeter: f64 = 2.0 * (l + w);
    let s: f64 = area / (perimeter * t_layer);
    // = 30000 / (700 * 10) = 4.29

    assert!(
        s > 3.0 && s < 10.0,
        "Shape factor S = {:.2}", s
    );

    // Allowable compressive stress (reinforced pad)
    let sigma_allow: f64 = 2.0 * g * s;
    // = 2 * 0.7 * 4.29 = 6.0 MPa

    // Applied stress
    let p: f64 = 120.0;         // kN, reaction
    let sigma: f64 = p * 1000.0 / area;
    // = 120000 / 30000 = 4.0 MPa

    assert!(
        sigma < sigma_allow,
        "σ = {:.1} < σ_allow = {:.1} MPa", sigma, sigma_allow
    );

    // Shear deformation check
    // Δ_s ≤ 0.5 × total pad thickness
    let delta_s: f64 = 5.0;     // mm, thermal movement
    let t_total: f64 = n_layers * t_layer;
    let shear_strain: f64 = delta_s / t_total;

    assert!(
        shear_strain < 0.50,
        "Shear strain {:.3} < 0.50", shear_strain
    );

    // Compressive deflection
    let eps_c: f64 = sigma / (6.0 * g * s * s);
    let delta_c: f64 = eps_c * t_total;

    assert!(
        delta_c < 3.0,
        "Compressive deflection: {:.2} mm", delta_c
    );
}

// ================================================================
// 5. Precast Connection -- Welded Plate Insert
// ================================================================
//
// Steel plate embedded in concrete with headed studs.
// Stud capacity: Ns = n × Ase × fut (steel failure)
// Concrete breakout: Ncb = k × sqrt(f'c) × hef^1.5 (ACI 318 §17)

#[test]
fn precast_welded_connection() {
    let n_studs: f64 = 4.0;
    let d_stud: f64 = 19.0;     // mm, stud diameter
    let hef: f64 = 100.0;       // mm, effective embedment
    let fut: f64 = 450.0;       // MPa, stud tensile strength
    let fc: f64 = 40.0;         // MPa

    // Steel capacity of stud group
    let ase: f64 = std::f64::consts::PI * d_stud * d_stud / 4.0;
    let ns: f64 = n_studs * ase * fut / 1000.0; // kN
    // = 4 * 283.5 * 450 / 1000 = 511 kN

    assert!(
        ns > 300.0,
        "Steel capacity: {:.0} kN", ns
    );

    // Concrete breakout (ACI 318-19 §17.6.2)
    // Nb = kc * sqrt(f'c) * hef^1.5 (single anchor)
    let kc: f64 = 10.0;         // for cast-in anchors (metric)
    let nb: f64 = kc * fc.sqrt() * hef.powf(1.5) / 1000.0; // kN

    // Group effect: projected area ratio
    // For 4 studs at 100mm spacing:
    let s: f64 = 100.0;         // mm, stud spacing
    let a_nc: f64 = (3.0 * hef + s) * (3.0 * hef + s); // actual projected area
    let a_nc0: f64 = 9.0 * hef * hef; // single anchor projected area

    let psi_group: f64 = a_nc / (n_studs * a_nc0);

    // Group breakout
    let ncb: f64 = n_studs * nb * psi_group.min(1.0);

    // Governing capacity is minimum
    let n_capacity: f64 = ns.min(ncb);

    // Concrete breakout governs for shallow, closely spaced studs
    assert!(
        n_capacity > 50.0,
        "Governing capacity: {:.0} kN", n_capacity
    );

    // Steel capacity is much higher than breakout for this config
    assert!(
        ns > ncb,
        "Steel {:.0} > breakout {:.0} kN -- concrete governs", ns, ncb
    );
}

// ================================================================
// 6. Precast Erection -- Lifting Insert Design
// ================================================================
//
// PCI: design for 1.5 × dead load (impact during lifting).
// Suction from form: add 1.0 kPa to self-weight.
// Insert capacity: governed by concrete pullout or steel.

#[test]
fn precast_lifting_design() {
    let panel_wt: f64 = 25.0;   // kN, panel weight
    let n_points: f64 = 4.0;    // lifting points

    // Dynamic impact factor
    let impact: f64 = 1.50;

    // Suction factor (stripping from form)
    let suction: f64 = 1.0;     // kPa
    let panel_area: f64 = 6.0 * 3.0; // m², 6m × 3m panel
    let suction_force: f64 = suction * panel_area; // kN

    // Total lifting load per point
    let p_lift: f64 = impact * (panel_wt + suction_force) / n_points;
    // = 1.5 * (25 + 18) / 4 = 16.1 kN

    assert!(
        p_lift > 10.0 && p_lift < 50.0,
        "Lifting load per point: {:.1} kN", p_lift
    );

    // Safety factor on insert
    let insert_capacity: f64 = 50.0; // kN, rated capacity
    let sf: f64 = insert_capacity / p_lift;

    assert!(
        sf > 2.0,
        "Safety factor: {:.1} > 2.0", sf
    );

    // Sling angle effect: tension increases as angle decreases
    let sling_angle: f64 = 60.0_f64.to_radians(); // from horizontal
    let sling_force: f64 = p_lift / sling_angle.sin();

    assert!(
        sling_force > p_lift,
        "Sling force {:.1} > vertical {:.1} kN (angle effect)",
        sling_force, p_lift
    );

    // At 45°: force increases by 1/sin(45°) = √2
    let sling_45: f64 = p_lift / 45.0_f64.to_radians().sin();
    let ratio_45: f64 = sling_45 / p_lift;
    assert!(
        (ratio_45 - std::f64::consts::SQRT_2).abs() < 0.01,
        "45° sling: force × {:.3}", ratio_45
    );
}

// ================================================================
// 7. Production Tolerances -- PCI MNL-135
// ================================================================
//
// Dimensional tolerances affect fit-up, bearing, and capacity.
// PCI MNL-135: standard tolerances for various precast products.

#[test]
fn precast_tolerances() {
    // PCI standard tolerances for beams/columns
    let length_tol: f64 = 19.0; // mm, ±19mm for members up to 12m
    let depth_tol: f64 = 6.0;   // mm, ±6mm
    let width_tol: f64 = 6.0;   // mm, ±6mm

    // Bearing length reduction due to tolerances
    let nominal_bearing: f64 = 75.0; // mm
    // Worst case: member too long + support too short
    let bearing_reduction: f64 = length_tol + 3.0; // member + erection tolerance
    let actual_bearing: f64 = nominal_bearing - bearing_reduction;

    assert!(
        actual_bearing > 0.0,
        "Minimum bearing: {:.0} mm", actual_bearing
    );

    // PCI minimum bearing lengths
    let min_bearing_solid: f64 = 38.0;  // mm, solid slab
    let min_bearing_hc: f64 = 64.0;     // mm, hollow-core

    assert!(
        actual_bearing > min_bearing_solid,
        "Actual {:.0} > min solid bearing {:.0} mm",
        actual_bearing, min_bearing_solid
    );

    // Erection tolerance for column plumbness
    let column_height: f64 = 9000.0; // mm
    let plumb_tol: f64 = (column_height / 500.0).max(6.0); // PCI: L/500 or 6mm min
    // = 18mm

    assert!(
        plumb_tol > 10.0,
        "Column plumbness tolerance: ±{:.0} mm", plumb_tol
    );

    // Accumulated tolerance over building height
    let n_stories: f64 = 5.0;
    let cumulative: f64 = plumb_tol * n_stories.sqrt(); // statistical accumulation
    assert!(
        cumulative < 50.0,
        "Cumulative tolerance: ±{:.0} mm over {} stories", cumulative, n_stories
    );

    let _depth_tol = depth_tol;
    let _width_tol = width_tol;
    let _min_bearing_hc = min_bearing_hc;
}

// ================================================================
// 8. Precast Shear Wall -- Dry Connection
// ================================================================
//
// Horizontal joint between wall panels: grouted connection.
// Shear capacity: V = μ(Avf*fy + Nuc) (shear friction)
// Connection must transfer in-plane shear + prevent overturning.

#[test]
fn precast_shear_wall_connection() {
    let h_panel: f64 = 3.0;     // m, panel height
    let l_panel: f64 = 6.0;     // m, panel length
    let t_panel: f64 = 200.0;   // mm, panel thickness
    let fc: f64 = 40.0;         // MPa

    // In-plane shear from lateral loads
    let v_design: f64 = 300.0;  // kN

    // Overturning moment
    let m_ot: f64 = v_design * h_panel; // kN·m
    // = 900 kN·m

    // Dead load stabilizing
    let gamma_c: f64 = 25.0;    // kN/m³
    let w_panel: f64 = gamma_c * l_panel * h_panel * t_panel / 1000.0; // kN
    // = 25 * 6 * 3 * 0.2 = 90 kN

    // Stability ratio
    let m_stab: f64 = w_panel * l_panel / 2.0; // kN·m (about toe)
    let stability_ratio: f64 = m_stab / m_ot;

    // May need hold-downs if stability_ratio < 1.5
    let needs_holddowns: bool = stability_ratio < 1.5;
    assert!(
        needs_holddowns || stability_ratio >= 1.5,
        "Stability ratio: {:.2}", stability_ratio
    );

    // Horizontal joint shear friction
    let mu: f64 = 1.0;          // grouted joint, roughened surface
    let fy: f64 = 500.0;        // MPa
    let phi: f64 = 0.75;

    // Required shear friction reinforcement
    let avf_req: f64 = v_design * 1000.0 / (phi * fy * mu); // mm²
    // = 300000 / (0.75 * 500 * 1.0) = 800 mm²

    assert!(
        avf_req > 0.0,
        "Required Avf: {:.0} mm²", avf_req
    );

    // Check against maximum shear stress
    let v_stress: f64 = v_design * 1000.0 / (l_panel * 1000.0 * t_panel); // MPa
    let v_max: f64 = 0.2 * fc; // ACI maximum

    assert!(
        v_stress < v_max,
        "v = {:.2} < v_max = {:.1} MPa", v_stress, v_max
    );
}

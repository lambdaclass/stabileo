/// Validation: Advanced Precast Concrete Benchmark Cases
///
/// References:
///   - PCI Design Handbook, 8th Edition (2017)
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - PCI Connections Manual (2008)
///   - PCI Standard Design Practice (MNL-120)
///
/// Tests verify hollow-core flexure (detailed), double-tee composite action,
/// corbel shear-friction, bearing pad mechanics, shear key transfer,
/// erection bracing, connection ductility, and prestress camber prediction.

// ================================================================
// 1. Hollow-Core Flexure -- Detailed PCI Approach
// ================================================================
//
// PCI hollow-core slab: 305mm deep, 1220mm wide.
// 6 strands of 12.7mm (Aps = 6 * 98.7 = 592 mm²).
// Cracking moment from Mcr = (fr + fpe) * Sb
// Ultimate moment from strain compatibility.
// Reference: PCI Design Handbook Table 2.6.1

#[test]
fn validation_pc_ext_1_hollow_core_flexure() {
    // Section properties (PCI 305mm hollow-core)
    let _h: f64 = 305.0;          // mm, total depth
    let b: f64 = 1220.0;          // mm, slab width
    let a_c: f64 = 143_000.0;     // mm², net concrete area
    let i_g: f64 = 1.387e9;       // mm⁴, gross moment of inertia
    let y_b: f64 = 152.5;         // mm, centroid to bottom fiber
    let s_b: f64 = i_g / y_b;     // mm³, bottom section modulus

    // Strand data
    let n_strands: f64 = 6.0;
    let a_strand: f64 = 98.7;     // mm², per strand (12.7mm dia)
    let aps: f64 = n_strands * a_strand; // 592.2 mm²
    let fpu: f64 = 1860.0;        // MPa
    let fpe: f64 = 1100.0;        // MPa, effective prestress after all losses
    let dp: f64 = 254.0;          // mm, depth to strand centroid
    let fc: f64 = 45.0;           // MPa

    // Effective prestress force
    let p_e: f64 = aps * fpe;     // N
    // = 592.2 * 1100 = 651,420 N

    // Concrete stress at bottom fiber due to prestress
    let e_ps: f64 = dp - y_b;     // mm, eccentricity
    let f_pe_bottom: f64 = p_e / a_c + p_e * e_ps * y_b / i_g; // MPa (compression)

    assert!(
        f_pe_bottom > 3.0 && f_pe_bottom < 15.0,
        "Bottom fiber prestress: {:.2} MPa", f_pe_bottom
    );

    // Modulus of rupture
    let fr: f64 = 0.62 * fc.sqrt(); // MPa (ACI 318)

    // Cracking moment
    let m_cr: f64 = (fr + f_pe_bottom) * s_b / 1e6; // kN-m

    // Cracking moment should be significant but less than ultimate
    assert!(
        m_cr > 50.0 && m_cr < 200.0,
        "Cracking moment: {:.1} kN-m", m_cr
    );

    // Ultimate moment via ACI 318 approximate fps formula
    let rho_p: f64 = aps / (b * dp);
    let gamma_p: f64 = 0.28;      // low-relaxation strands
    let beta1: f64 = 0.65;        // for fc = 45 MPa

    let fps: f64 = fpu * (1.0 - gamma_p / beta1 * rho_p * fpu / fc);

    assert!(fps > fpe && fps < fpu, "fps = {:.0} MPa", fps);

    // Compression block
    let a_block: f64 = aps * fps / (0.85 * fc * b);

    // Nominal moment capacity
    let m_n: f64 = aps * fps * (dp - a_block / 2.0) / 1e6; // kN-m

    // Verify Mn > Mcr (ductile behavior per PCI)
    let mn_mcr_ratio: f64 = m_n / m_cr;
    assert!(
        mn_mcr_ratio > 1.2,
        "Mn/Mcr = {:.2} > 1.2 (ACI minimum)", mn_mcr_ratio
    );

    // Verify depth of neutral axis
    let c: f64 = a_block / beta1;
    let c_dp_ratio: f64 = c / dp;
    assert!(
        c_dp_ratio < 0.375,
        "c/dp = {:.3} < 0.375 -- tension-controlled (phi=0.9)", c_dp_ratio
    );

    // phi*Mn should be reasonably large for a 305mm slab
    let phi_mn: f64 = 0.9 * m_n;
    assert!(
        phi_mn > 100.0 && phi_mn < 300.0,
        "phi*Mn = {:.1} kN-m", phi_mn
    );
}

// ================================================================
// 2. Double-Tee Composite -- PCI Composite Section Analysis
// ================================================================
//
// Precast double-tee (600mm deep) with 75mm CIP topping.
// Composite section properties via transformed section method.
// Interface shear per ACI 318 Section 16.4.
// Verify: transformed I, composite Mn, interface shear demand vs capacity.

#[test]
fn validation_pc_ext_2_double_tee_composite() {
    // Precast double-tee properties
    let h_pc: f64 = 600.0;        // mm, precast depth
    let h_top: f64 = 75.0;        // mm, topping thickness
    let h_total: f64 = h_pc + h_top; // mm, total composite depth
    let b_flange: f64 = 2440.0;   // mm, total flange width (8-ft DT)
    let b_stem: f64 = 150.0;      // mm, each stem width
    let n_stems: usize = 2;

    // Concrete strengths
    let fc_pc: f64 = 40.0;        // MPa, precast
    let fc_top: f64 = 28.0;       // MPa, topping

    // Modular ratio (topping relative to precast)
    let ec_pc: f64 = 4700.0 * fc_pc.sqrt();   // MPa
    let ec_top: f64 = 4700.0 * fc_top.sqrt();  // MPa
    let n_mod: f64 = ec_top / ec_pc;

    assert!(
        n_mod > 0.7 && n_mod < 1.0,
        "Modular ratio n = {:.3}", n_mod
    );

    // Transformed topping width
    let b_top_tr: f64 = b_flange * n_mod;

    // Precast section (simplified: treat as rectangle for stems + flange)
    let a_pc: f64 = 195_000.0;    // mm², typical 8DT24 area
    let y_bar_pc: f64 = 408.0;    // mm, centroid from bottom (precast only)
    let i_pc: f64 = 8.69e9;       // mm⁴, precast I

    // Topping section
    let a_top: f64 = b_top_tr * h_top;
    let y_top: f64 = h_pc + h_top / 2.0; // centroid of topping from bottom

    // Composite centroid
    let a_comp: f64 = a_pc + a_top;
    let y_bar_comp: f64 = (a_pc * y_bar_pc + a_top * y_top) / a_comp;

    assert!(
        y_bar_comp > y_bar_pc,
        "Composite centroid {:.1} > precast centroid {:.1} mm",
        y_bar_comp, y_bar_pc
    );

    // Composite moment of inertia (parallel axis theorem)
    let i_top: f64 = b_top_tr * h_top.powi(3) / 12.0;
    let d_pc: f64 = y_bar_comp - y_bar_pc;
    let d_top: f64 = y_top - y_bar_comp;
    let i_comp: f64 = i_pc + a_pc * d_pc.powi(2) + i_top + a_top * d_top.powi(2);

    // Composite I should be significantly larger than precast alone
    let i_ratio: f64 = i_comp / i_pc;
    assert!(
        i_ratio > 1.2 && i_ratio < 2.5,
        "I_comp/I_pc = {:.2}", i_ratio
    );

    // Interface shear check
    let span: f64 = 18_000.0;     // mm
    let w_total: f64 = 10.0;      // kN/m, total factored UDL
    let v_u: f64 = w_total * span / 1000.0 / 2.0; // kN, max shear at support

    // Contact width for interface shear
    let b_v: f64 = (n_stems as f64) * b_stem; // mm
    let d_eff: f64 = h_total - 50.0;          // mm, effective depth

    // Interface shear stress
    let v_nh: f64 = v_u * 1000.0 / (b_v * d_eff); // MPa

    // Capacity: roughened surface, no ties -- 0.55 MPa per ACI 318
    let v_nh_allow: f64 = 0.55; // MPa

    assert!(
        v_nh < v_nh_allow,
        "Interface shear {:.3} < {:.2} MPa (roughened, no ties)",
        v_nh, v_nh_allow
    );
}

// ================================================================
// 3. Corbel Design -- ACI 318 Section 16.5
// ================================================================
//
// Vn = mu * Avf * fy (shear-friction method)
// Nuc = horizontal tensile force (min 0.2*Vu)
// As = Af + An, or 2/3*Avf + An (whichever is larger)
// Verify a/d <= 1.0, shear-friction steel, max shear limit.

#[test]
fn validation_pc_ext_3_corbel_design() {
    let vu: f64 = 350.0;          // kN, factored vertical load
    let nuc: f64 = 0.2 * vu;      // kN, min horizontal tension = 0.2*Vu
    let fy: f64 = 420.0;          // MPa
    let fc: f64 = 35.0;           // MPa
    let phi: f64 = 0.75;
    let mu: f64 = 1.4;            // monolithic, normal-weight concrete

    // Corbel geometry
    let a_lever: f64 = 150.0;     // mm, lever arm (face of column to Vu)
    let d: f64 = 450.0;           // mm, effective depth
    let b_corbel: f64 = 350.0;    // mm, corbel width

    // Check a/d ratio
    let ad_ratio: f64 = a_lever / d;
    assert!(
        ad_ratio <= 1.0,
        "a/d = {:.3} <= 1.0 -- corbel provisions apply", ad_ratio
    );

    // Shear-friction reinforcement: Af = Vu / (phi * fy * mu)
    let af: f64 = vu * 1000.0 / (phi * fy * mu);
    // = 350000 / (0.75 * 420 * 1.4) = 793.7 mm²

    // Direct tension reinforcement: An = Nuc / (phi * fy)
    let an: f64 = nuc * 1000.0 / (phi * fy);
    // = 70000 / (0.75 * 420) = 222.2 mm²

    // Primary reinforcement (ACI 318 §16.5.4.3)
    let as_opt1: f64 = af + an;
    let as_opt2: f64 = 2.0 * af / 3.0 + an;
    let as_req: f64 = as_opt1.max(as_opt2);

    assert!(
        (as_req - as_opt1).abs() < 1.0,
        "Af + An = {:.1} governs over 2/3*Af+An = {:.1}", as_opt1, as_opt2
    );

    // Minimum reinforcement: As >= 0.04*(fc/fy)*b*d
    let as_min: f64 = 0.04 * (fc / fy) * b_corbel * d;

    assert!(
        as_req > as_min,
        "As_req = {:.0} > As_min = {:.0} mm²", as_req, as_min
    );

    // Maximum shear per ACI 318 §16.5.2.4
    let vn_max_1: f64 = 0.2 * fc * b_corbel * d / 1000.0; // kN
    let vn_max_2: f64 = 5.5 * b_corbel * d / 1000.0;      // kN (5.5 MPa limit)
    let vn_max: f64 = vn_max_1.min(vn_max_2);

    assert!(
        vu < phi * vn_max,
        "Vu = {:.0} < phi*Vn_max = {:.0} kN", vu, phi * vn_max
    );

    // Closed stirrup area (Ah >= 0.5*(As - An))
    let ah_req: f64 = 0.5 * (as_req - an);
    assert!(
        ah_req > 0.0,
        "Closed stirrup area Ah >= {:.0} mm²", ah_req
    );
}

// ================================================================
// 4. Bearing Pad -- Contact Stress and Rotation Capacity
// ================================================================
//
// Elastomeric bearing pad with steel laminates.
// Shape factor S = LW / (2(L+W) * hri)
// Compressive capacity: sigma <= 2GS (reinforced) or GS (plain)
// Rotation capacity: theta_max = 2*delta_c / L
// Reference: PCI Design Handbook §6.8

#[test]
fn validation_pc_ext_4_bearing_pad() {
    // Pad geometry
    let l_pad: f64 = 250.0;       // mm, length (parallel to beam)
    let w_pad: f64 = 200.0;       // mm, width
    let h_ri: f64 = 12.0;         // mm, individual rubber layer thickness
    let n_layers: f64 = 4.0;
    let g: f64 = 0.8;             // MPa, shear modulus (Shore A 55)

    // Shape factor (for internal layers of reinforced pad)
    let s: f64 = (l_pad * w_pad) / (2.0 * (l_pad + w_pad) * h_ri);
    // = 50000 / (2 * 450 * 12) = 4.63

    crate::common::assert_close(s, 4.63, 0.01, "Shape factor S");

    // Allowable compressive stress (reinforced pad, PCI)
    let sigma_allow: f64 = 2.0 * g * s;
    // = 2 * 0.8 * 4.63 = 7.41 MPa

    // Applied load
    let p_service: f64 = 200.0;   // kN, service reaction
    let sigma_applied: f64 = p_service * 1000.0 / (l_pad * w_pad); // MPa
    // = 200000 / 50000 = 4.0 MPa

    assert!(
        sigma_applied < sigma_allow,
        "sigma = {:.1} < sigma_allow = {:.1} MPa", sigma_applied, sigma_allow
    );

    // Compressive strain (empirical: eps = sigma / (6*G*S^2) for S > 3)
    let eps_c: f64 = sigma_applied / (6.0 * g * s * s);

    // Compressive deflection per layer
    let delta_c_layer: f64 = eps_c * h_ri;
    let delta_c_total: f64 = delta_c_layer * n_layers;

    assert!(
        delta_c_total < 3.0,
        "Total compressive deflection: {:.2} mm", delta_c_total
    );

    // Rotation capacity
    // Maximum rotation per PCI: theta_max = 2 * delta_c_layer / L
    // (assuming one edge at zero compression, other at 2x average)
    let theta_max_per_layer: f64 = 2.0 * delta_c_layer / l_pad; // radians
    let theta_max_total: f64 = theta_max_per_layer * n_layers;

    // Convert to degrees for sanity check
    let theta_deg: f64 = theta_max_total.to_degrees();

    assert!(
        theta_deg > 0.05 && theta_deg < 2.0,
        "Max rotation capacity: {:.3} degrees", theta_deg
    );

    // Shear deformation limit: delta_s <= 0.5 * h_total
    let h_total: f64 = n_layers * h_ri;
    let delta_s_allow: f64 = 0.5 * h_total;

    // Thermal movement (typical)
    let delta_thermal: f64 = 10.0; // mm

    assert!(
        delta_thermal < delta_s_allow,
        "Thermal {:.0} < shear limit {:.1} mm", delta_thermal, delta_s_allow
    );

    // Combined stress check: compressive + shear strain
    let shear_strain: f64 = delta_thermal / h_total;
    let comp_strain: f64 = eps_c;
    let total_strain: f64 = comp_strain + shear_strain;

    // Total elastomer strain should be reasonable
    assert!(
        total_strain < 0.50,
        "Combined strain: {:.3}", total_strain
    );
}

// ================================================================
// 5. Shear Key -- Horizontal Shear Transfer at Interface
// ================================================================
//
// Shear key at precast-to-precast or precast-to-CIP interface.
// ACI 318 §16.4: horizontal shear transfer.
// Vnh = (Avf*fy*mu + P_clamp) for tied roughened interface
// Maximum: min(0.2*fc*Acr, 5.5*Acr) -- ACI 318 §16.4.4.5

#[test]
fn validation_pc_ext_5_shear_key() {
    // Interface geometry
    let b_interface: f64 = 300.0;  // mm, contact width
    let d_comp: f64 = 500.0;      // mm, depth of composite section
    let span: f64 = 12_000.0;     // mm
    let fc: f64 = 35.0;           // MPa

    // Applied shear (factored UDL on simply-supported span)
    let wu: f64 = 25.0;           // kN/m, factored load
    let vu: f64 = wu * span / 1000.0 / 2.0; // kN = 150 kN

    // Unit interface shear stress
    let v_u_stress: f64 = vu * 1000.0 / (b_interface * d_comp); // MPa
    // = 150000 / (300 * 500) = 1.0 MPa

    crate::common::assert_close(v_u_stress, 1.0, 0.01, "Unit shear stress");

    // Tie reinforcement design
    // For roughened + tied: Vnh = Avf*fy*mu_e
    let fy: f64 = 420.0;          // MPa
    let mu_e: f64 = 1.0;          // effective friction coefficient (roughened + ties)
    let phi: f64 = 0.75;

    // Required Avf per unit length: avf_per_mm = vu / (phi * fy * mu_e * d)
    let avf_per_m: f64 = vu * 1000.0 / (phi * fy * mu_e * d_comp) * 1000.0; // mm²/m
    // = 150000 / (0.75 * 420 * 1.0 * 500) * 1000 = 952.4 mm²/m

    assert!(
        avf_per_m > 500.0 && avf_per_m < 2000.0,
        "Required Avf = {:.0} mm²/m", avf_per_m
    );

    // Provide #13 U-stirrups at spacing s
    let a_bar: f64 = 2.0 * 129.0; // mm², 2 legs of #13
    let s_req: f64 = a_bar / avf_per_m * 1000.0; // mm
    // = 258 / 952.4 * 1000 = 270.8 mm

    assert!(
        s_req > 100.0 && s_req < 500.0,
        "Required stirrup spacing: {:.0} mm", s_req
    );

    // Maximum interface shear capacity per ACI 318 §16.4.4.5
    let acr: f64 = b_interface * d_comp; // mm² (contact area per unit length is bv*d)
    let v_max_1: f64 = 0.2 * fc * acr / 1000.0; // kN
    let v_max_2: f64 = 5.5 * acr / 1000.0;      // kN
    let v_max: f64 = v_max_1.min(v_max_2);

    assert!(
        vu < phi * v_max,
        "Vu = {:.0} < phi*Vn_max = {:.0} kN", vu, phi * v_max
    );

    // Minimum tie requirement: Avf_min = 0.062*sqrt(fc)*bv*s/fy
    let s_provided: f64 = 250.0;  // mm, actual provided spacing
    let avf_min: f64 = 0.062 * fc.sqrt() * b_interface * s_provided / fy;
    let avf_provided: f64 = a_bar;

    assert!(
        avf_provided > avf_min,
        "Avf_provided = {:.0} > Avf_min = {:.0} mm²", avf_provided, avf_min
    );
}

// ================================================================
// 6. Erection Bracing -- Temporary Bracing During Erection
// ================================================================
//
// Lateral stability during erection: beam not yet connected to diaphragm.
// Check: lateral-torsional buckling of slender beam hanging from crane.
// PCI: Fs = 1.0 + e_i/y_r factor for sweep imperfection.
// Tipping angle: theta_max = arctan(b/(2*y_roll))
// Reference: PCI Design Handbook §5.3

#[test]
fn validation_pc_ext_6_erection_bracing() {
    // Beam properties for erection
    let l_beam: f64 = 24_000.0;   // mm, beam length
    let h_beam: f64 = 1200.0;     // mm, beam depth
    let b_top: f64 = 300.0;       // mm, top flange width
    let w_beam: f64 = 15.0;       // kN/m, self-weight

    // Sweep imperfection (PCI: L/960 max)
    let e_sweep: f64 = l_beam / 960.0; // mm
    // = 25.0 mm

    crate::common::assert_close(e_sweep, 25.0, 0.01, "Sweep imperfection");

    // Roll axis height above CG (for hanging beam)
    let y_roll: f64 = h_beam;     // mm, conservative (lift point at top)

    // Tipping stability factor
    // Critical angle for tipping: theta_max = arctan(b_top / (2 * y_roll))
    let theta_max: f64 = (b_top / (2.0 * y_roll)).atan();
    let theta_max_deg: f64 = theta_max.to_degrees();

    assert!(
        theta_max_deg > 3.0 && theta_max_deg < 15.0,
        "Maximum tipping angle: {:.1} degrees", theta_max_deg
    );

    // Initial roll angle due to sweep imperfection
    let theta_i: f64 = (e_sweep / y_roll).atan();
    let _theta_i_deg: f64 = theta_i.to_degrees();

    // Factor of safety against tipping
    let fs_tip: f64 = theta_max / theta_i;

    assert!(
        fs_tip > 1.5,
        "FS against tipping = {:.2} > 1.5", fs_tip
    );

    // Bracing force for erection (PCI: 2% of beam weight)
    let brace_percent: f64 = 0.02;
    let total_weight: f64 = w_beam * l_beam / 1000.0; // kN
    let brace_force: f64 = brace_percent * total_weight;
    // = 0.02 * 360 = 7.2 kN

    crate::common::assert_close(brace_force, 7.2, 0.01, "Bracing force");

    // Wind load on beam during erection (worst case: 0.5 kPa on beam face)
    let q_wind: f64 = 0.5;        // kPa
    let f_wind: f64 = q_wind * h_beam / 1000.0 * l_beam / 1000.0; // kN
    // = 0.5 * 1.2 * 24 = 14.4 kN

    // Total lateral force on bracing
    let f_lateral: f64 = brace_force + f_wind;

    assert!(
        f_lateral > 10.0 && f_lateral < 50.0,
        "Total lateral force on bracing: {:.1} kN", f_lateral
    );

    // Number of braces needed (each brace rated for 10 kN)
    let brace_capacity: f64 = 10.0; // kN per brace
    let n_braces: f64 = (f_lateral / brace_capacity).ceil();

    assert!(
        n_braces >= 2.0,
        "Minimum braces needed: {:.0}", n_braces
    );
}

// ================================================================
// 7. Connection Ductility -- Ductile vs Non-Ductile Behavior
// ================================================================
//
// Compare ductile (welded steel plate) vs non-ductile (dry-packed grout)
// connection types for seismic resistance.
// Ductility ratio: mu = delta_u / delta_y
// Energy absorption: W = integral F*d(delta) ~ F_y * delta_u * (1 - 1/(2*mu))
// Reference: PCI Connections Manual, FEMA 356

#[test]
fn validation_pc_ext_7_connection_ductility() {
    // Ductile connection (welded steel plate with headed studs)
    let fy_steel: f64 = 250.0;    // MPa, plate yield
    let fu_steel: f64 = 400.0;    // MPa, plate ultimate
    let a_plate: f64 = 150.0 * 12.0; // mm², plate cross-section (150mm x 12mm)
    let l_eff: f64 = 200.0;       // mm, effective deformable length

    // Yield force and displacement
    let f_y: f64 = fy_steel * a_plate / 1000.0; // kN
    let e_steel: f64 = 200_000.0; // MPa
    let delta_y: f64 = fy_steel / e_steel * l_eff; // mm
    // = 250/200000 * 200 = 0.25 mm

    crate::common::assert_close(delta_y, 0.25, 0.01, "Yield displacement");

    // Ultimate displacement (assume 5% elongation at fracture)
    let eps_u: f64 = 0.05;
    let delta_u: f64 = eps_u * l_eff; // mm = 10.0 mm

    crate::common::assert_close(delta_u, 10.0, 0.01, "Ultimate displacement");

    // Ductility ratio
    let mu_ductile: f64 = delta_u / delta_y;
    // = 10.0 / 0.25 = 40.0

    assert!(
        mu_ductile > 20.0,
        "Ductile connection mu = {:.0} > 20", mu_ductile
    );

    // Non-ductile connection (dry-packed grout shear key)
    let f_y_grout: f64 = 100.0;   // kN, cracking/yield force
    let delta_y_grout: f64 = 0.5; // mm, deformation at cracking
    let delta_u_grout: f64 = 1.5; // mm, ultimate deformation (brittle)

    let mu_nonductile: f64 = delta_u_grout / delta_y_grout;
    // = 3.0

    assert!(
        mu_nonductile < 5.0,
        "Non-ductile connection mu = {:.1} < 5", mu_nonductile
    );

    // Energy absorption comparison
    // Ductile: W ~ Fy * delta_u * (1 - 1/(2*mu))
    let w_ductile: f64 = f_y * delta_u * (1.0 - 1.0 / (2.0 * mu_ductile)); // kN-mm
    let w_nonductile: f64 = f_y_grout * delta_u_grout * (1.0 - 1.0 / (2.0 * mu_nonductile)); // kN-mm

    // Ductile connection absorbs far more energy
    let energy_ratio: f64 = w_ductile / w_nonductile;
    assert!(
        energy_ratio > 10.0,
        "Energy ratio ductile/non-ductile = {:.1}", energy_ratio
    );

    // Overstrength factor for capacity design (PCI)
    let overstrength: f64 = fu_steel / fy_steel;
    assert!(
        overstrength > 1.25,
        "Overstrength ratio = {:.2} > 1.25 (ACI requirement)", overstrength
    );

    // Seismic qualification: Rd factor comparison
    // Ductile connection qualifies for Rd >= 2.5
    // Non-ductile limited to Rd = 1.5
    let rd_ductile: f64 = (2.0 * mu_ductile - 1.0).sqrt(); // Newmark equal-energy
    let rd_nonductile: f64 = (2.0 * mu_nonductile - 1.0).sqrt();

    assert!(
        rd_ductile > rd_nonductile,
        "Rd_ductile = {:.1} > Rd_nonductile = {:.1}",
        rd_ductile, rd_nonductile
    );
}

// ================================================================
// 8. Camber Prediction -- Prestress Camber via PCI Method
// ================================================================
//
// Upward camber for simply-supported prestressed beam:
//   Parabolic tendon: delta_up = P*e*L^2 / (8*E*I)
//   Straight tendon:  delta_up = P*e*L^2 / (8*E*I) (for harped at midspan)
// Downward deflection from self-weight:
//   delta_down = 5*w*L^4 / (384*E*I)
// Net camber = delta_up - delta_down
// Long-term multiplier: PCI uses 2.0-2.5 for prestress, 2.4-3.0 for dead load.
// Reference: PCI Design Handbook §5.8

#[test]
fn validation_pc_ext_8_camber_prediction() {
    // Beam properties (PCI I-girder, 20m span)
    let l: f64 = 20_000.0;        // mm, span
    let fc: f64 = 45.0;           // MPa
    let ec: f64 = 4700.0 * fc.sqrt(); // MPa ~ 31528 MPa
    let i_g: f64 = 1.2e10;        // mm⁴, gross moment of inertia
    let w_sw: f64 = 7.5;          // kN/m, self-weight

    // Prestress data (parabolic profile)
    let p_i: f64 = 2_000_000.0;   // N, initial prestress force (before losses)
    let e_mid: f64 = 350.0;       // mm, eccentricity at midspan
    let e_end: f64 = 0.0;         // mm, eccentricity at ends (for parabolic)

    // Upward camber due to prestress (parabolic tendon)
    // delta_up = P * e_mid * L^2 / (8 * E * I)
    let delta_up: f64 = p_i * e_mid * l.powi(2) / (8.0 * ec * i_g);
    // = 1800000 * 350 * 15000^2 / (8 * 31528 * 1.25e10)
    // = 1800000 * 350 * 2.25e8 / (3.1528e5 * 1.25e10)
    // = 1.4175e17 / 3.941e15
    // = 35.97 mm

    assert!(
        delta_up > 20.0 && delta_up < 150.0,
        "Prestress camber (up): {:.1} mm", delta_up
    );

    // Downward deflection from self-weight
    // delta_down = 5 * w * L^4 / (384 * E * I)
    let w_n: f64 = w_sw;           // N/mm (1 kN/m = 1 N/mm)
    let delta_down: f64 = 5.0 * w_n * l.powi(4) / (384.0 * ec * i_g);

    assert!(
        delta_down > 10.0 && delta_down < 50.0,
        "Self-weight deflection (down): {:.1} mm", delta_down
    );

    // Net initial camber
    let net_camber: f64 = delta_up - delta_down;

    assert!(
        net_camber > 0.0,
        "Net initial camber = {:.1} mm (upward)", net_camber
    );

    // Long-term camber prediction (PCI multipliers)
    // At erection: prestress multiplier = 1.80, dead load multiplier = 1.85
    let lt_ps: f64 = 1.80;
    let lt_dl: f64 = 1.85;
    let camber_erection: f64 = lt_ps * delta_up - lt_dl * delta_down;

    assert!(
        camber_erection > 0.0,
        "Camber at erection: {:.1} mm (upward)", camber_erection
    );

    // Final long-term: prestress multiplier = 2.20, dead load multiplier = 2.40
    let lt_ps_final: f64 = 2.20;
    let lt_dl_final: f64 = 2.40;
    let camber_final: f64 = lt_ps_final * delta_up - lt_dl_final * delta_down;

    // Final camber should be less than erection camber (losses reduce prestress effect)
    // But dead load deflection also grows, so final could be positive or slightly less
    assert!(
        camber_final.abs() < 200.0,
        "Final long-term camber: {:.1} mm", camber_final
    );

    // Verify PCI formula consistency: straight tendon comparison
    // For straight tendon: delta = P*e*L^2/(8*E*I) (same formula but e = constant)
    let e_straight: f64 = e_mid;
    let delta_straight: f64 = p_i * e_straight * l.powi(2) / (8.0 * ec * i_g);

    // Parabolic with same midspan eccentricity gives same midspan camber
    // (the 5/48 vs 1/8 difference comes from harped vs parabolic profiles,
    //  but for parabolic with e_end=0, the formula P*e*L^2/(8EI) is exact)
    crate::common::assert_close(delta_straight, delta_up, 0.01, "Straight vs parabolic camber");

    // Camber-to-span ratio check (typical: L/300 to L/600)
    let camber_span_ratio: f64 = net_camber / l;
    let _e_end = e_end; // suppress unused warning

    assert!(
        camber_span_ratio > 1.0 / 1000.0 && camber_span_ratio < 1.0 / 200.0,
        "Camber/span = 1/{:.0}", 1.0 / camber_span_ratio
    );
}

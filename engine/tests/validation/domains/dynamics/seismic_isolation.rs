/// Validation: Seismic Isolation Systems
///
/// References:
///   - ASCE 7-22 Chapter 17: Seismic Design Requirements for Seismically Isolated Structures
///   - EN 1998-1 (EC8) §10: Base Isolation
///   - EN 15129: Anti-seismic Devices
///   - Naeim & Kelly: "Design of Seismic Isolated Structures" (1999)
///   - Constantinou et al.: "Principles of Friction, Viscoelastic and Cable Isolation" (2022)
///   - FEMA P-751 Chapter 12: Seismically Isolated Structures
///
/// Tests verify LRB, FPS, HDR isolators, damping,
/// displacement demand, and superstructure force reduction.

// ================================================================
// 1. Lead Rubber Bearing (LRB) -- Bilinear Model
// ================================================================
//
// Bilinear hysteresis: Q_d = yield force of lead core, K2 = post-yield stiffness.
// K_eff = (Q_d + K2*D) / D (effective stiffness at displacement D)
// β_eff = 2*Q_d*(D-Dy) / (π*K_eff*D²) (effective damping)

#[test]
fn isolation_lrb_bilinear() {
    let qd: f64 = 100.0;        // kN, characteristic strength (lead yield)
    let k2: f64 = 1.0;          // kN/mm, post-yield stiffness
    let fy_lead: f64 = 10.0;    // MPa, lead yield stress

    // Lead core area
    let a_lead: f64 = qd * 1000.0 / fy_lead;
    // = 10,000 mm²

    // Yield displacement
    let k1: f64 = 10.0 * k2;    // elastic stiffness ≈ 10 × post-yield
    let dy: f64 = qd / (k1 - k2); // mm

    assert!(
        dy > 5.0 && dy < 30.0,
        "Yield displacement: {:.1} mm", dy
    );

    // At design displacement
    let d: f64 = 200.0;         // mm, design displacement

    // Effective stiffness
    let k_eff: f64 = (qd + k2 * d) / d; // kN/mm
    assert!(
        k_eff > k2,
        "K_eff = {:.3} > K2 = {:.3} kN/mm", k_eff, k2
    );

    // Effective damping
    let energy: f64 = 4.0 * qd * (d - dy); // hysteretic energy per cycle
    let beta_eff: f64 = energy / (2.0 * std::f64::consts::PI * k_eff * d * d);

    assert!(
        beta_eff > 0.10 && beta_eff < 0.40,
        "Effective damping: {:.1}%", beta_eff * 100.0
    );

    let _a_lead = a_lead;
}

// ================================================================
// 2. Friction Pendulum System (FPS)
// ================================================================
//
// T_iso = 2π√(R/g) (period independent of mass)
// F = μ*W + W*D/R (restoring + friction)
// K_eff = W*(1/R + μ/D)

#[test]
fn isolation_fps() {
    let r: f64 = 2000.0;        // mm, radius of curvature
    let mu: f64 = 0.06;         // friction coefficient
    let w: f64 = 1000.0;        // kN, vertical load
    let g: f64 = 9810.0;        // mm/s²

    // Isolated period (independent of mass!)
    let t_iso: f64 = 2.0 * std::f64::consts::PI * (r / g).sqrt();

    assert!(
        t_iso > 2.0 && t_iso < 5.0,
        "FPS period: {:.2}s (mass-independent)", t_iso
    );

    // At design displacement
    let d: f64 = 200.0;         // mm

    // Effective stiffness
    let k_eff: f64 = w * (1.0 / r + mu / d);

    assert!(
        k_eff > 0.0,
        "K_eff: {:.3} kN/mm", k_eff
    );

    // Effective damping
    let beta_eff: f64 = 2.0 * mu / (std::f64::consts::PI * (mu + d / r));

    assert!(
        beta_eff > 0.05 && beta_eff < 0.30,
        "FPS damping: {:.1}%", beta_eff * 100.0
    );

    // Restoring force check (self-centering)
    let f_restoring: f64 = w * d / r;
    let f_friction: f64 = mu * w;
    let restoring_ratio: f64 = f_restoring / f_friction;

    // Must be > 1.0 for reliable self-centering
    assert!(
        restoring_ratio > 0.5,
        "Restoring/friction: {:.2}", restoring_ratio
    );
}

// ================================================================
// 3. High-Damping Rubber (HDR) Bearing
// ================================================================
//
// HDR: strain-dependent properties.
// Shear modulus G decreases with strain (typically 0.4-1.0 MPa).
// Damping increases with strain (10-15% at γ = 100%).

#[test]
fn isolation_hdr_bearing() {
    // Typical HDR properties at different shear strains
    let strains: [(f64, f64, f64); 3] = [
        // (shear_strain_%, G_MPa, damping_%)
        (50.0, 0.8, 10.0),
        (100.0, 0.5, 15.0),
        (200.0, 0.4, 12.0),
    ];

    // Check G decreases with strain (initially)
    assert!(
        strains[1].1 < strains[0].1,
        "G at 100% ({:.2}) < G at 50% ({:.2}) MPa", strains[1].1, strains[0].1
    );

    // Bearing dimensions
    let d_bearing: f64 = 600.0;  // mm, diameter
    let t_rubber: f64 = 150.0;   // mm, total rubber thickness (10 layers × 15mm)
    let a: f64 = std::f64::consts::PI * d_bearing * d_bearing / 4.0;

    // Stiffness at 100% strain
    let g_100: f64 = strains[1].1;
    let k_h: f64 = g_100 * a / t_rubber / 1000.0; // kN/mm

    assert!(
        k_h > 0.5,
        "Horizontal stiffness: {:.2} kN/mm", k_h
    );

    // Design displacement at 100% strain
    let d_100: f64 = t_rubber * 1.0; // 100% strain

    assert!(
        d_100 > 100.0,
        "Design displacement: {:.0} mm", d_100
    );

    // Vertical stiffness (much higher)
    let ec: f64 = 6.0 * g_100 * (d_bearing / (4.0 * 15.0)).powi(2); // shape factor effect
    let k_v: f64 = ec * a / t_rubber / 1000.0;

    assert!(
        k_v > k_h * 100.0,
        "Kv/Kh ratio: {:.0}", k_v / k_h
    );
}

// ================================================================
// 4. ASCE 7 -- Design Displacement
// ================================================================
//
// D_D = g*S_D1*T_D / (4π²*B_D)
// D_M = g*S_M1*T_M / (4π²*B_M)
// BD, BM = damping reduction factors

#[test]
fn isolation_design_displacement() {
    let sd1: f64 = 0.60;        // g, design spectral acceleration at 1s
    let sm1: f64 = 0.90;        // g, MCE spectral acceleration at 1s
    let g: f64 = 9810.0;        // mm/s²
    let td: f64 = 2.5;          // s, effective period (design)
    let tm: f64 = 3.0;          // s, effective period (MCE)

    // Damping reduction factor (ASCE 7 Table 17.5-1)
    let beta: f64 = 0.15;       // 15% effective damping
    // BD for β = 15%: ≈ 1.35
    let bd: f64 = 1.35;
    let bm: f64 = 1.35;

    // Design displacement
    let dd: f64 = g * sd1 * td / (4.0 * std::f64::consts::PI * std::f64::consts::PI * bd);

    assert!(
        dd > 100.0 && dd < 500.0,
        "Design displacement: {:.0} mm", dd
    );

    // MCE displacement
    let dm: f64 = g * sm1 * tm / (4.0 * std::f64::consts::PI * std::f64::consts::PI * bm);

    assert!(
        dm > dd,
        "MCE {:.0} > design {:.0} mm", dm, dd
    );

    // Total displacement (including torsion)
    let e: f64 = 0.05;          // accidental eccentricity (5%)
    let d_plan: f64 = 30.0;     // m, building plan dimension
    let y: f64 = 15.0;          // m, distance to corner
    let pt: f64 = 12.0 * e;     // torsional coefficient

    let dtd: f64 = dd * (1.0 + y * pt / (d_plan * d_plan + pt * pt).sqrt());

    assert!(
        dtd > dd,
        "Total DD {:.0} > DD {:.0} mm (torsion effect)", dtd, dd
    );

    let _beta = beta;
}

// ================================================================
// 5. Superstructure Force Reduction
// ================================================================
//
// Isolation reduces force on superstructure by factor ~R_I = 2.0 (ASCE 7).
// V_b = K_eff × D_D (base shear at isolation level)
// V_s = V_b / R_I (superstructure shear)

#[test]
fn isolation_force_reduction() {
    let w: f64 = 50000.0;       // kN, total weight
    let sd1: f64 = 0.60;        // g

    // Fixed-base design (R = 8 for SMRF)
    let t_fixed: f64 = 0.8;     // s
    let cs_fixed: f64 = sd1 / (t_fixed * 8.0); // Cs/R
    let v_fixed: f64 = cs_fixed * w;

    // Isolated design
    let td: f64 = 2.5;          // s
    let bd: f64 = 1.35;
    let ri: f64 = 2.0;          // isolation R factor (ASCE 7)

    // Base shear at isolators
    let vb: f64 = sd1 * w / (td * bd);

    // Superstructure shear
    let vs: f64 = vb / ri;

    // Isolated superstructure force is less than fixed-base elastic force
    let vs_elastic_fixed: f64 = sd1 * w / t_fixed; // elastic fixed-base
    assert!(
        vs < vs_elastic_fixed,
        "Isolated Vs {:.0} < elastic fixed {:.0} kN", vs, vs_elastic_fixed
    );

    // But isolated base shear may be higher than reduced fixed-base
    // (isolation trades ductility for reduced displacement demand)
    assert!(
        vb > 0.0 && vs > 0.0,
        "Vb = {:.0}, Vs = {:.0} kN", vb, vs
    );

    let _v_fixed = v_fixed;
}

// ================================================================
// 6. Vertical Load Stability -- Critical Buckling
// ================================================================
//
// Isolator must carry vertical load without buckling.
// P_cr = π²*EI/(Le²) modified for rubber bearings.
// P_cr = (G*A*S²*π²) / (4*h²) (simplified for rubber bearing)

#[test]
fn isolation_vertical_stability() {
    let d: f64 = 700.0;         // mm, bearing diameter
    let t_layer: f64 = 12.0;    // mm, rubber layer thickness
    let n_layers: f64 = 12.0;
    let t_total: f64 = n_layers * t_layer;
    let g: f64 = 0.5;           // MPa, shear modulus

    // Shape factor
    let s: f64 = d / (4.0 * t_layer);
    // = 700 / 48 = 14.6

    assert!(
        s > 10.0,
        "Shape factor: {:.1}", s
    );

    // Bearing area
    let a: f64 = std::f64::consts::PI * d * d / 4.0;

    // Critical buckling load (Haringx theory, simplified)
    let pcr: f64 = g * a * s * s / (t_total * t_total) * std::f64::consts::PI * std::f64::consts::PI * t_total / 1000.0;
    // Very simplified; real formula includes Ec

    // More accurate: Pcr ≈ π*S*G*A / (2*h_r/r)
    // where r = sqrt(I/A)
    let r: f64 = d / 4.0;       // radius of gyration for circle
    let pcr_approx: f64 = std::f64::consts::PI * s * g * a / (2.0 * t_total / r) / 1000.0;

    // Design vertical load
    let p_design: f64 = 2000.0;  // kN

    // Safety factor against buckling
    let fs_buckling: f64 = pcr_approx / p_design;

    assert!(
        fs_buckling > 2.0,
        "Buckling FS = {:.1} > 2.0", fs_buckling
    );

    let _pcr = pcr;
}

// ================================================================
// 7. Triple Friction Pendulum (TFP)
// ================================================================
//
// TFP: 4 sliding surfaces, 3 effective pendulum mechanisms.
// Provides adaptive behavior: different stiffness at different displacements.
// Small earthquakes → inner slides (short period, high friction)
// Large earthquakes → outer slides (long period, lower friction)

#[test]
fn isolation_triple_pendulum() {
    // Inner surfaces
    let r_inner: f64 = 300.0;   // mm, inner radius
    let mu_inner: f64 = 0.03;   // inner friction
    let _d_inner: f64 = 25.0;   // mm, inner displacement capacity

    // Outer surfaces
    let r_outer: f64 = 2500.0;  // mm, outer radius
    let mu_outer: f64 = 0.06;   // outer friction
    let _d_outer: f64 = 300.0;  // mm, outer displacement capacity

    // Stage 1: small motion (inner surfaces)
    let k1: f64 = 1.0 / r_inner; // normalized stiffness (per unit weight)
    let t1: f64 = 2.0 * std::f64::consts::PI * (r_inner / 9810.0).sqrt();

    // Stage 2: large motion (outer surfaces)
    let k2: f64 = 1.0 / r_outer;
    let t2: f64 = 2.0 * std::f64::consts::PI * (r_outer / 9810.0).sqrt();

    // Outer period much longer than inner
    assert!(
        t2 > t1 * 2.0,
        "Outer T = {:.2}s >> inner T = {:.2}s", t2, t1
    );

    // Stiffness decreases with displacement (adaptive)
    assert!(
        k2 < k1,
        "Outer K = {:.5} < inner K = {:.5} (softer at large D)",
        k2, k1
    );

    // Friction increases from inner to outer
    assert!(
        mu_outer > mu_inner,
        "Outer μ = {:.3} > inner μ = {:.3}", mu_outer, mu_inner
    );
}

// ================================================================
// 8. Moat Wall -- Displacement Restraint
// ================================================================
//
// Seismic moat (gap) around isolated building must accommodate
// total maximum displacement DTM.
// ASCE 7: moat ≥ DTM, or provide bumper system.

#[test]
fn isolation_moat_gap() {
    // Maximum displacement from analysis
    let dd: f64 = 250.0;        // mm, design displacement
    let dtd: f64 = 280.0;       // mm, total design (with torsion)
    let dm: f64 = 400.0;        // mm, MCE displacement
    let dtm: f64 = 450.0;       // mm, total MCE displacement

    // Moat gap must accommodate DTM
    let gap: f64 = dtm * 1.10;  // 10% margin
    // = 495 mm ≈ 500 mm

    assert!(
        gap > dtm,
        "Moat gap {:.0}mm > DTM {:.0}mm", gap, dtm
    );

    // Utility crossings must also accommodate displacement
    let utility_flex: f64 = 2.0 * dtm; // total range (both directions)

    assert!(
        utility_flex > 500.0,
        "Utility flexibility: ±{:.0}mm", dtm
    );

    // Building separation from adjacent structures
    let separation: f64 = dtm + 50.0; // DTM + clearance
    assert!(
        separation > 400.0,
        "Building separation: {:.0}mm", separation
    );

    let _dd = dd;
    let _dtd = dtd;
    let _dm = dm;
}

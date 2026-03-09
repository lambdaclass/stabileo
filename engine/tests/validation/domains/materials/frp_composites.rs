/// Validation: Fiber-Reinforced Polymer (FRP) Composites
///
/// References:
///   - ACI 440.2R-17: Guide for Design of Externally Bonded FRP Systems
///   - ACI 440.1R-15: Guide for Design of Concrete Reinforced with FRP Bars
///   - EN 1999-1-1 Annex N (draft): FRP in buildings
///   - CNR-DT 200 R1/2013: Guide for Design of FRP Strengthening (Italy)
///   - Bank: "Composites for Construction" (2006)
///   - Hollaway & Teng: "Strengthening and Rehabilitation of Civil Infrastructures" (2008)
///
/// Tests verify laminate theory, FRP bar properties,
/// flexural strengthening, and shear strengthening.

// ================================================================
// 1. FRP Material Properties — Comparison
// ================================================================
//
// GFRP: E ≈ 40-55 GPa, fu ≈ 500-1000 MPa, εu ≈ 1.5-3.0%
// CFRP: E ≈ 120-230 GPa, fu ≈ 1500-3500 MPa, εu ≈ 1.0-1.7%
// AFRP: E ≈ 40-120 GPa, fu ≈ 1000-2500 MPa, εu ≈ 2.0-4.0%

#[test]
fn frp_material_properties() {
    // CFRP (carbon fiber)
    let e_cfrp: f64 = 165_000.0;   // MPa
    let fu_cfrp: f64 = 2800.0;     // MPa
    let eps_u_cfrp: f64 = fu_cfrp / e_cfrp; // ≈ 1.7%

    // GFRP (glass fiber)
    let e_gfrp: f64 = 45_000.0;
    let fu_gfrp: f64 = 700.0;
    let eps_u_gfrp: f64 = fu_gfrp / e_gfrp; // ≈ 1.6%

    // Steel reinforcement
    let e_steel: f64 = 200_000.0;
    let fy_steel: f64 = 500.0;
    let _eps_y_steel: f64 = fy_steel / e_steel; // ≈ 0.25%

    // CFRP has highest strength
    assert!(
        fu_cfrp > fu_gfrp && fu_cfrp > fy_steel,
        "CFRP fu = {:.0} > GFRP {:.0} > Steel fy {:.0}", fu_cfrp, fu_gfrp, fy_steel
    );

    // GFRP is most flexible (lowest E)
    assert!(
        e_gfrp < e_cfrp && e_gfrp < e_steel,
        "GFRP E = {:.0} < CFRP {:.0} < Steel {:.0}", e_gfrp, e_cfrp, e_steel
    );

    // FRP is linear elastic to failure (no yielding)
    assert!(
        (eps_u_cfrp - fu_cfrp / e_cfrp).abs() < 0.001,
        "CFRP: εu = fu/E (linear elastic)"
    );

    let _eps_u_gfrp = eps_u_gfrp;
}

// ================================================================
// 2. Classical Laminate Theory — Ply Stiffness
// ================================================================
//
// Unidirectional ply: Q matrix (reduced stiffness)
// Q11 = E1/(1-ν12*ν21), Q22 = E2/(1-ν12*ν21)
// Q12 = ν12*E2/(1-ν12*ν21), Q66 = G12

#[test]
fn frp_laminate_stiffness() {
    // Unidirectional carbon/epoxy ply
    let e1: f64 = 140_000.0;   // MPa, fiber direction
    let e2: f64 = 10_000.0;    // MPa, transverse
    let nu12: f64 = 0.30;
    let g12: f64 = 5_000.0;    // MPa

    // Reciprocal relation: ν21 = ν12 * E2/E1
    let nu21: f64 = nu12 * e2 / e1;
    assert!(
        nu21 < nu12,
        "ν21 = {:.4} < ν12 = {:.2}", nu21, nu12
    );

    // Reduced stiffness matrix components
    let denom: f64 = 1.0 - nu12 * nu21;
    let q11: f64 = e1 / denom;
    let q22: f64 = e2 / denom;
    let q12: f64 = nu12 * e2 / denom;
    let q66: f64 = g12;

    // Q11 >> Q22 (highly anisotropic)
    let anisotropy: f64 = q11 / q22;
    assert!(
        anisotropy > 10.0,
        "Anisotropy ratio Q11/Q22 = {:.1}", anisotropy
    );

    // Symmetry check: Q12 = Q21
    let q21: f64 = nu21 * e1 / denom;
    assert!(
        (q12 - q21).abs() / q12 < 0.01,
        "Q12 = {:.0}, Q21 = {:.0} (symmetric)", q12, q21
    );

    let _q66 = q66;
}

// ================================================================
// 3. FRP Bar Reinforced Concrete — Flexure (ACI 440.1R)
// ================================================================
//
// FRP-RC design controlled by concrete crushing (over-reinforced preferred)
// because FRP doesn't yield → brittle failure if FRP ruptures.
// M_n = A_f * f_f * (d - a/2) where a = Af*ff/(0.85*f'c*b)

#[test]
fn frp_rc_flexure() {
    let fc: f64 = 30.0;        // MPa
    let b: f64 = 300.0;        // mm
    let d: f64 = 450.0;        // mm
    let af: f64 = 800.0;       // mm², FRP bar area

    // GFRP bar properties
    let ffu: f64 = 700.0;      // MPa, guaranteed tensile strength
    let ef: f64 = 45_000.0;    // MPa

    // Environmental reduction (ACI 440.1R Table 7.1)
    let ce: f64 = 0.80;        // glass in concrete exposed to moisture
    let ffu_design: f64 = ce * ffu; // = 560 MPa

    // Balanced reinforcement ratio
    let beta1: f64 = 0.85;
    let eps_cu: f64 = 0.003;
    let rho_fb: f64 = 0.85 * beta1 * fc / ffu_design * (ef * eps_cu / (ef * eps_cu + ffu_design));

    // Actual reinforcement ratio
    let rho_f: f64 = af / (b * d);

    // Check if over-reinforced (preferred for FRP)
    let is_over_reinforced: bool = rho_f > rho_fb;

    if is_over_reinforced {
        // Concrete crushing controls: iterate for stress in FRP
        let a: f64 = af * ffu_design / (0.85 * fc * b);
        let mn: f64 = af * ffu_design * (d - a / 2.0) / 1e6; // kN·m

        assert!(
            mn > 50.0,
            "FRP-RC moment capacity: {:.1} kN·m", mn
        );
    }

    // FRP bars → no yielding → larger deflections at service
    let _rho_fb = rho_fb;
}

// ================================================================
// 4. Externally Bonded FRP Strengthening — Flexure (ACI 440.2R)
// ================================================================
//
// Additional moment from FRP: ΔM = Af * ffe * (d_f - a/2)
// Effective FRP strain: εfe = εcu*(d_f/c - 1) - εbi ≤ κm*εfu
// κm = debonding strain reduction factor

#[test]
fn frp_external_strengthening() {
    // Original beam
    let fc: f64 = 25.0;        // MPa
    let b: f64 = 300.0;        // mm
    let d: f64 = 400.0;        // mm
    let _as: f64 = 1200.0;     // mm², existing steel
    let fy: f64 = 420.0;       // MPa

    // Original capacity
    let a_orig: f64 = _as * fy / (0.85 * fc * b);
    let mn_orig: f64 = _as * fy * (d - a_orig / 2.0) / 1e6; // kN·m

    // CFRP strengthening
    let n_plies: f64 = 2.0;
    let tf: f64 = 0.167;       // mm, ply thickness
    let wf: f64 = 300.0;       // mm, FRP width
    let af: f64 = n_plies * tf * wf; // = 100.2 mm²
    let ef: f64 = 230_000.0;   // MPa
    let efu: f64 = 0.017;      // design rupture strain

    // Debonding strain limit (ACI 440.2R Eq. 10.1)
    let n_ef_tf: f64 = n_plies * ef * tf; // N/mm per unit width... simplified
    let km: f64 = if n_ef_tf <= 180_000.0 {
        1.0 / (60.0 * efu) * (1.0 - n_ef_tf / (360_000.0))
    } else {
        1.0 / (60.0 * efu)
    };

    let efe: f64 = km * efu; // effective strain
    let ffe: f64 = ef * efe; // effective stress

    // Additional moment from FRP
    let df: f64 = d + 50.0; // mm, depth to FRP (beam soffit + half thickness)
    let delta_m: f64 = af * ffe * (df - a_orig / 2.0) / 1e6;

    // Strengthened capacity (simplified)
    let mn_strengthened: f64 = mn_orig + 0.85 * delta_m; // φ_f = 0.85

    assert!(
        mn_strengthened > mn_orig,
        "Strengthened {:.1} > original {:.1} kN·m", mn_strengthened, mn_orig
    );

    // Typical increase: 20-50%
    let increase: f64 = (mn_strengthened - mn_orig) / mn_orig;
    assert!(
        increase > 0.05,
        "FRP increases capacity by {:.1}%", increase * 100.0
    );
}

// ================================================================
// 5. FRP Shear Strengthening — U-Wrap
// ================================================================
//
// ACI 440.2R: V_f = Af_v * f_fe * (sin(α) + cos(α)) * d_fv / s_f
// For U-wraps: effective strain limited by debonding
// ε_fe = 0.004 ≤ 0.75*ε_fu (ACI 440.2R conservative)

#[test]
fn frp_shear_strengthening() {
    let d: f64 = 400.0;        // mm, effective depth
    let fc: f64 = 25.0;        // MPa

    // U-wrap CFRP
    let tf: f64 = 0.167;       // mm, ply thickness
    let n: f64 = 1.0;          // number of plies
    let ef: f64 = 230_000.0;   // MPa
    let efu: f64 = 0.017;

    // Effective strain for U-wrap (ACI 440.2R)
    let efe: f64 = 0.004_f64.min(0.75 * efu);
    let ffe: f64 = ef * efe;

    // Continuous U-wrap: sf = wf (full coverage)
    let sf: f64 = 200.0;       // mm, strip spacing
    let wf: f64 = 100.0;       // mm, strip width
    let alpha: f64 = 90.0_f64.to_radians(); // vertical strips

    // FRP shear contribution
    let afv: f64 = 2.0 * n * tf * wf; // both sides
    let dfv: f64 = d; // effective FRP depth
    let vf: f64 = afv * ffe * (alpha.sin() + alpha.cos()) * dfv / sf / 1000.0; // kN
    // sin(90) = 1, cos(90) = 0
    // = 2*0.167*100 * 920 * 1 * 400 / 200 / 1000

    assert!(
        vf > 10.0,
        "FRP shear contribution: {:.1} kN", vf
    );

    // Original concrete shear capacity: Vc = 0.17*sqrt(f'c)*b*d/1000
    let b: f64 = 300.0;
    let vc: f64 = 0.17 * fc.sqrt() * b * d / 1000.0;

    // FRP should add meaningful contribution
    let ratio: f64 = vf / vc;
    assert!(
        ratio > 0.1,
        "FRP adds {:.0}% to concrete shear capacity", ratio * 100.0
    );
}

// ================================================================
// 6. FRP Confinement — Column Strengthening
// ================================================================
//
// ACI 440.2R: confined concrete strength
// f'cc = f'c + ψ_f * 3.3 * κ_a * f_l
// f_l = 2*n*t_f*E_f*ε_fe / D (confining pressure)

#[test]
fn frp_confinement() {
    let fc: f64 = 20.0;        // MPa, unconfined
    let d_col: f64 = 400.0;    // mm, column diameter (circular)

    // CFRP wrap
    let n: f64 = 3.0;          // plies
    let tf: f64 = 0.167;       // mm
    let ef: f64 = 230_000.0;   // MPa
    let efe: f64 = 0.004;      // effective confinement strain

    // Confining pressure
    let fl: f64 = 2.0 * n * tf * ef * efe / d_col;
    // = 2 * 3 * 0.167 * 230000 * 0.004 / 400 = 2.305 MPa

    // Confined strength
    let psi_f: f64 = 0.95;     // FRP reduction factor
    let ka: f64 = 1.0;         // for circular columns
    let fcc: f64 = fc + psi_f * 3.3 * ka * fl;

    // Strength increase
    let increase: f64 = (fcc - fc) / fc;
    assert!(
        increase > 0.20,
        "Confinement increases f'c by {:.0}% ({:.1} → {:.1} MPa)",
        increase * 100.0, fc, fcc
    );

    // Minimum confinement ratio: f_l/f'c ≥ 0.08 (ACI 440.2R)
    let confinement_ratio: f64 = fl / fc;
    assert!(
        confinement_ratio > 0.08,
        "f_l/f'c = {:.3} ≥ 0.08 — adequate confinement", confinement_ratio
    );
}

// ================================================================
// 7. Durability — Environmental Reduction Factors
// ================================================================
//
// ACI 440.2R Table 9.4 / ACI 440.1R Table 7.1:
// CE factors account for long-term degradation.

#[test]
fn frp_environmental_factors() {
    // Interior exposure
    let ce_carbon_int: f64 = 0.95;
    let ce_glass_int: f64 = 0.75;
    let ce_aramid_int: f64 = 0.85;

    // Exterior exposure (bridges, parking garages)
    let ce_carbon_ext: f64 = 0.85;
    let ce_glass_ext: f64 = 0.65;
    let ce_aramid_ext: f64 = 0.75;

    // Carbon is most durable
    assert!(
        ce_carbon_int > ce_glass_int,
        "CFRP CE = {:.2} > GFRP CE = {:.2} (interior)",
        ce_carbon_int, ce_glass_int
    );

    // Exterior is more severe
    assert!(
        ce_carbon_ext < ce_carbon_int,
        "Exterior {:.2} < interior {:.2} (CFRP)", ce_carbon_ext, ce_carbon_int
    );

    // Glass most affected by environment
    let glass_reduction: f64 = ce_glass_ext / ce_glass_int;
    let carbon_reduction: f64 = ce_carbon_ext / ce_carbon_int;
    assert!(
        glass_reduction < carbon_reduction,
        "Glass more affected: {:.3} < {:.3}", glass_reduction, carbon_reduction
    );

    let _ce_aramid_int = ce_aramid_int;
    let _ce_aramid_ext = ce_aramid_ext;
}

// ================================================================
// 8. Creep Rupture — Sustained Stress Limits
// ================================================================
//
// FRP under sustained load: creep rupture risk
// ACI 440.1R limits: GFRP ≤ 0.20*ffu, CFRP ≤ 0.55*ffu, AFRP ≤ 0.30*ffu

#[test]
fn frp_creep_rupture() {
    // Creep rupture stress limits (fraction of ultimate)
    let limit_gfrp: f64 = 0.20;
    let limit_cfrp: f64 = 0.55;
    let limit_afrp: f64 = 0.30;

    // CFRP is most resistant to creep rupture
    assert!(
        limit_cfrp > limit_afrp && limit_afrp > limit_gfrp,
        "CFRP({:.2}) > AFRP({:.2}) > GFRP({:.2})",
        limit_cfrp, limit_afrp, limit_gfrp
    );

    // For GFRP bar (ffu = 700 MPa):
    let ffu_gfrp: f64 = 700.0;
    let sustained_limit_gfrp: f64 = limit_gfrp * ffu_gfrp;
    // = 0.20 * 700 = 140 MPa

    // Compare to service stress in concrete member
    // Typical: 40-60% of capacity → check against creep limit
    let service_stress: f64 = 150.0; // MPa (example)

    if service_stress > sustained_limit_gfrp {
        // Would need to increase bar area to reduce stress
        let as_ratio: f64 = service_stress / sustained_limit_gfrp;
        assert!(
            as_ratio > 1.0,
            "Need {:.0}% more GFRP area for creep rupture", (as_ratio - 1.0) * 100.0
        );
    }

    // CFRP is much better for sustained loads
    let ffu_cfrp: f64 = 2800.0;
    let sustained_limit_cfrp: f64 = limit_cfrp * ffu_cfrp;
    assert!(
        sustained_limit_cfrp > sustained_limit_gfrp * 5.0,
        "CFRP sustained limit {:.0} >> GFRP {:.0} MPa",
        sustained_limit_cfrp, sustained_limit_gfrp
    );
}

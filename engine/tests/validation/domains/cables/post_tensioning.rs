/// Validation: Post-Tensioning Design
///
/// References:
///   - PTI Post-Tensioning Manual, 6th Edition (2006)
///   - ACI 318-19 Chapter 20: Prestressed Concrete
///   - EN 1992-1-1 (EC2) §5.10: Prestressed Members
///   - AASHTO LRFD §5.9: Prestressed Concrete
///   - Collins & Mitchell: "Prestressed Concrete Structures" (1997)
///   - Lin & Burns: "Design of Prestressed Concrete Structures" 3rd ed.
///
/// Tests verify prestress losses, tendon profile, load balancing,
/// stress checks, and anchorage zone design.

// ================================================================
// 1. Immediate Prestress Losses -- Elastic Shortening
// ================================================================
//
// For post-tensioned members with sequential stressing:
// Δf_ES = 0.5 × n × f_cir (average for multiple tendons)
// n = Ep/Ec (modular ratio), f_cir = concrete stress at CGS

#[test]
fn pt_elastic_shortening() {
    let ep: f64 = 195_000.0;    // MPa, strand modulus
    let ec: f64 = 35_000.0;     // MPa, concrete modulus
    let n: f64 = ep / ec;       // modular ratio

    assert!(
        n > 5.0 && n < 7.0,
        "Modular ratio: {:.2}", n
    );

    // Concrete stress at CGS after transfer
    let fpi: f64 = 1395.0;      // MPa, initial prestress
    let aps: f64 = 3000.0;      // mm², total tendon area
    let a_conc: f64 = 300_000.0; // mm², concrete area
    let i_conc: f64 = 5.0e9;    // mm⁴, concrete moment of inertia
    let e_tendon: f64 = 200.0;  // mm, eccentricity

    // Prestress force
    let pi: f64 = fpi * aps / 1000.0; // kN

    // Concrete stress at CGS
    let f_cir: f64 = pi * 1000.0 / a_conc + pi * 1000.0 * e_tendon * e_tendon / i_conc;

    // Elastic shortening loss (average for sequential stressing)
    let delta_f_es: f64 = 0.5 * n * f_cir;

    assert!(
        delta_f_es > 20.0 && delta_f_es < 200.0,
        "Elastic shortening loss: {:.1} MPa", delta_f_es
    );

    // As percentage
    let loss_pct: f64 = delta_f_es / fpi * 100.0;
    assert!(
        loss_pct < 10.0,
        "ES loss: {:.1}%", loss_pct
    );
}

// ================================================================
// 2. Friction Loss -- Tendon Profile
// ================================================================
//
// Δfp = fpi × (1 - e^(-μα - Kx))
// μ = curvature friction coefficient (0.15-0.25)
// K = wobble coefficient (0.0005-0.002 per m)
// α = total angular change, x = distance from stressing end

#[test]
fn pt_friction_loss() {
    let fpi: f64 = 1488.0;      // MPa, jacking stress (0.80*fpu)
    let mu: f64 = 0.20;         // curvature friction
    let k: f64 = 0.001;         // wobble coefficient (per m)

    // Tendon profile: parabolic over 20m span
    let span: f64 = 20.0;       // m
    let sag: f64 = 0.300;       // m, tendon sag at midspan
    let alpha: f64 = 8.0 * sag / span; // total angular change (rad, parabola)
    // = 8 * 0.3 / 20 = 0.12 rad

    // Friction loss at midspan
    let x: f64 = span / 2.0;
    let exponent: f64 = mu * alpha / 2.0 + k * x; // half the total angle at midspan
    let fp_mid: f64 = fpi * (-exponent).exp();
    let delta_fp: f64 = fpi - fp_mid;

    assert!(
        delta_fp > 10.0 && delta_fp < 60.0,
        "Friction loss at midspan: {:.1} MPa", delta_fp
    );

    // Loss at far end (full span)
    let exponent_end: f64 = mu * alpha + k * span;
    let fp_end: f64 = fpi * (-exponent_end).exp();
    let delta_fp_end: f64 = fpi - fp_end;

    assert!(
        delta_fp_end > delta_fp,
        "Loss at far end {:.1} > midspan {:.1} MPa", delta_fp_end, delta_fp
    );

    // Loss as percentage
    let loss_pct: f64 = delta_fp_end / fpi * 100.0;
    assert!(
        loss_pct < 10.0,
        "Friction loss: {:.1}%", loss_pct
    );
}

// ================================================================
// 3. Anchorage Set Loss
// ================================================================
//
// Anchor slip (wedge seating): typically 6-10mm.
// Loss propagates along tendon: distance L_set = √(Δ_slip × Ap × Ep / p)
// p = friction loss per unit length

#[test]
fn pt_anchorage_set() {
    let delta_slip: f64 = 6.0;   // mm, anchor set
    let ep: f64 = 195_000.0;     // MPa
    let aps: f64 = 140.0;        // mm², per strand (15.2mm)
    let n_strands: f64 = 12.0;
    let _aps_total: f64 = aps * n_strands;

    // Friction loss gradient (from friction calculation)
    let fpi: f64 = 1488.0;
    let loss_per_m: f64 = 3.0;  // MPa/m (approximate from friction)

    // Anchor set affected length (in mm)
    let l_set: f64 = (delta_slip * ep / loss_per_m).sqrt();
    // = sqrt(6 * 195000 / 3) = sqrt(390000) = 624 mm

    assert!(
        l_set > 300.0 && l_set < 2000.0,
        "Anchor set length: {:.0} mm ({:.2} m)", l_set, l_set / 1000.0
    );

    // Stress loss at anchorage
    let delta_f_anc: f64 = 2.0 * loss_per_m * l_set / 1000.0; // MPa (triangular distribution)

    assert!(
        delta_f_anc > 0.0 && delta_f_anc < 10.0,
        "Anchorage set loss: {:.1} MPa", delta_f_anc
    );

    // Beyond L_set: no effect from anchor set
    let _fpi = fpi;
}

// ================================================================
// 4. Long-Term Losses -- Creep, Shrinkage, Relaxation
// ================================================================
//
// ACI 318 lump sum: 230 MPa for normal concrete
// EC2 detailed: separate calculation for each component.

#[test]
fn pt_long_term_losses() {
    let fpi: f64 = 1395.0;      // MPa, initial prestress after immediate losses

    // Creep loss
    let phi_creep: f64 = 2.0;   // creep coefficient (EC2, depends on environment)
    let n: f64 = 5.6;           // modular ratio
    let fcgp: f64 = 10.0;       // MPa, concrete stress at CGS

    let delta_creep: f64 = n * phi_creep * fcgp;
    // = 5.6 * 2.0 * 10 = 112 MPa

    // Shrinkage loss
    let eps_sh: f64 = 300.0e-6; // shrinkage strain (typical)
    let ep: f64 = 195_000.0;
    let delta_shrinkage: f64 = eps_sh * ep;
    // = 0.0003 * 195000 = 58.5 MPa

    // Relaxation loss (low-relaxation strand, ACI 318 lump sum approach)
    // For low-relaxation strands: typically 2.5-3.5% of initial prestress
    let relax_pct: f64 = 0.03;  // 3% for low-relaxation strand
    let delta_relax: f64 = relax_pct * fpi;
    // = 0.03 * 1395 = 41.9 MPa

    assert!(
        delta_relax > 20.0 && delta_relax < 60.0,
        "Relaxation loss: {:.1} MPa", delta_relax
    );

    // Total long-term losses
    let delta_total: f64 = delta_creep + delta_shrinkage + delta_relax;

    assert!(
        delta_total > 100.0 && delta_total < 300.0,
        "Total long-term loss: {:.0} MPa", delta_total
    );

    let total_loss_pct: f64 = delta_total / (fpi + 93.0) * 100.0; // fpi + immediate losses ≈ jacking
    assert!(
        total_loss_pct > 10.0 && total_loss_pct < 25.0,
        "Total loss: {:.0}% of jacking stress", total_loss_pct
    );
}

// ================================================================
// 5. Load Balancing
// ================================================================
//
// Post-tensioning equivalent load: w_bal = 8*P*e/L²
// For parabolic tendon with eccentricity e at midspan.
// Balanced load = self-weight → zero deflection under DL.

#[test]
fn pt_load_balancing() {
    let span: f64 = 12.0;       // m
    let e: f64 = 0.150;         // m, tendon eccentricity at midspan

    // Concrete slab self-weight
    let t_slab: f64 = 0.200;    // m
    let gamma_c: f64 = 25.0;    // kN/m³
    let w_dl: f64 = gamma_c * t_slab; // = 5.0 kN/m²

    // For 1m wide strip:
    let w_dl_strip: f64 = w_dl; // kN/m

    // Required prestress force for full balance
    let p_balance: f64 = w_dl_strip * span * span / (8.0 * e);
    // = 5.0 * 144 / (8 * 0.15) = 600 kN/m

    assert!(
        p_balance > 400.0 && p_balance < 1000.0,
        "Balancing force: {:.0} kN/m", p_balance
    );

    // Typical: balance 80-100% of DL
    let balance_ratio: f64 = 0.80;
    let p_actual: f64 = p_balance * balance_ratio;
    let w_balanced: f64 = 8.0 * p_actual * e / (span * span);

    assert!(
        w_balanced < w_dl_strip,
        "Balanced load {:.2} < DL {:.2} kN/m -- partial balance", w_balanced, w_dl_strip
    );

    // Residual load causing deflection
    let w_residual: f64 = w_dl_strip - w_balanced;
    assert!(
        w_residual > 0.0,
        "Unbalanced load: {:.2} kN/m", w_residual
    );
}

// ================================================================
// 6. Stress Limits -- Service Conditions
// ================================================================
//
// ACI 318 Table 24.5.3.1:
// At transfer: σ_t ≤ 0.60f'ci (compression), σ_t ≤ 0.25√f'ci (tension)
// At service: σ ≤ 0.45f'c (sustained), σ ≤ 0.60f'c (total)
// Class U: no tension (fully prestressed)

#[test]
fn pt_stress_limits() {
    let fci: f64 = 30.0;        // MPa, concrete at transfer
    let fc: f64 = 45.0;         // MPa, 28-day concrete

    // Allowable stresses at transfer
    let fc_transfer: f64 = 0.60 * fci; // compression
    let ft_transfer: f64 = 0.25 * fci.sqrt(); // tension

    assert!(
        fc_transfer > 15.0,
        "Transfer compression limit: {:.1} MPa", fc_transfer
    );
    assert!(
        ft_transfer > 1.0,
        "Transfer tension limit: {:.2} MPa", ft_transfer
    );

    // Allowable at service
    let fc_sustained: f64 = 0.45 * fc;
    let fc_total: f64 = 0.60 * fc;

    // Check stresses (example beam)
    let p_eff: f64 = 2500.0;    // kN, effective prestress
    let a: f64 = 200_000.0;     // mm², cross-section area
    let s_top: f64 = 15.0e6;    // mm³, section modulus (top)
    let s_bot: f64 = 15.0e6;    // mm³, section modulus (bottom)
    let e_cgs: f64 = 150.0;     // mm, eccentricity
    let m_dl: f64 = 300.0;      // kN·m, dead load moment

    // Bottom fiber (prestress + DL moment)
    let f_bot: f64 = p_eff * 1000.0 / a + p_eff * 1000.0 * e_cgs / s_bot
                    - m_dl * 1e6 / s_bot;

    assert!(
        f_bot > 0.0 && f_bot < fc_sustained,
        "Bottom stress: {:.2} MPa (compression)", f_bot
    );

    // Top fiber
    let f_top: f64 = p_eff * 1000.0 / a - p_eff * 1000.0 * e_cgs / s_top
                    + m_dl * 1e6 / s_top;

    assert!(
        f_top.abs() < fc_total,
        "Top stress: {:.2} MPa", f_top
    );
}

// ================================================================
// 7. Anchorage Zone -- Bursting Reinforcement
// ================================================================
//
// Post-tensioned anchorage creates high local stresses.
// Bursting force: T_burst = 0.25*P*(1 - a/h) (Guyon/AASHTO)
// a = bearing plate dimension, h = member depth

#[test]
fn pt_anchorage_zone() {
    let p: f64 = 4000.0;        // kN, tendon force
    let a_plate: f64 = 250.0;   // mm, bearing plate side
    let h: f64 = 800.0;         // mm, member depth

    // Bursting force (Guyon formula)
    let t_burst: f64 = 0.25 * p * (1.0 - a_plate / h);
    // = 0.25 * 4000 * (1 - 0.3125) = 687.5 kN

    assert!(
        t_burst > 500.0 && t_burst < 1000.0,
        "Bursting force: {:.0} kN", t_burst
    );

    // Required bursting reinforcement
    let fy: f64 = 500.0;        // MPa
    let phi: f64 = 0.75;
    let as_burst: f64 = t_burst * 1000.0 / (phi * fy);

    assert!(
        as_burst > 1000.0,
        "Bursting steel: {:.0} mm²", as_burst
    );

    // Spalling reinforcement (2% of P)
    let t_spall: f64 = 0.02 * p;
    let as_spall: f64 = t_spall * 1000.0 / (phi * fy);

    assert!(
        as_spall > 100.0,
        "Spalling steel: {:.0} mm²", as_spall
    );

    // Bearing stress check (with confinement factor per ACI 318 §25.9)
    let a_bearing: f64 = a_plate * a_plate;
    let a_support: f64 = h * h; // supporting area (full section)
    let confinement: f64 = (a_support / a_bearing).sqrt().min(2.0);
    let fb: f64 = p * 1000.0 / a_bearing;
    let fb_allow: f64 = 0.85 * 45.0 * confinement; // with confinement

    assert!(
        fb < fb_allow,
        "Bearing stress {:.1} < allowable {:.1} MPa", fb, fb_allow
    );
}

// ================================================================
// 8. Unbonded vs Bonded Tendon -- Stress at Ultimate
// ================================================================
//
// Bonded: fps from strain compatibility (typically near fpu)
// Unbonded: fps = fpe + 70 + fc/(100*ρp) ≤ fpe + 420 (ACI 318)
// Unbonded tendons have lower fps than bonded.

#[test]
fn pt_bonded_vs_unbonded() {
    let fpu: f64 = 1860.0;      // MPa
    let fpe: f64 = 1100.0;      // MPa, effective prestress
    let fc: f64 = 40.0;         // MPa
    let dp: f64 = 500.0;        // mm, depth to tendon
    let b: f64 = 1000.0;        // mm (per meter width)
    let aps: f64 = 1000.0;      // mm²/m

    // Bonded: approximate fps (ACI 318)
    let rho_p: f64 = aps / (b * dp);
    let gamma_p: f64 = 0.28;
    let beta1: f64 = 0.76;      // for fc = 40 MPa
    let fps_bonded: f64 = fpu * (1.0 - gamma_p / beta1 * rho_p * fpu / fc);

    // Unbonded: ACI 318 approximate
    let fps_unbonded: f64 = (fpe + 70.0 + fc / (100.0 * rho_p)).min(fpe + 420.0).min(fpu);

    // Bonded has higher stress at ultimate
    assert!(
        fps_bonded > fps_unbonded,
        "Bonded fps {:.0} > unbonded {:.0} MPa", fps_bonded, fps_unbonded
    );

    // Both are between fpe and fpu
    assert!(
        fps_bonded > fpe && fps_bonded < fpu,
        "Bonded: {:.0} MPa", fps_bonded
    );
    assert!(
        fps_unbonded > fpe && fps_unbonded < fpu,
        "Unbonded: {:.0} MPa", fps_unbonded
    );

    // Moment capacity comparison
    let a_b: f64 = aps * fps_bonded / (0.85 * fc * b);
    let mn_bonded: f64 = aps * fps_bonded * (dp - a_b / 2.0) / 1e6;

    let a_u: f64 = aps * fps_unbonded / (0.85 * fc * b);
    let mn_unbonded: f64 = aps * fps_unbonded * (dp - a_u / 2.0) / 1e6;

    assert!(
        mn_bonded > mn_unbonded,
        "Bonded Mn {:.1} > unbonded {:.1} kN·m", mn_bonded, mn_unbonded
    );
}

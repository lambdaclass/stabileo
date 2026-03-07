/// Validation: Prestressed Concrete Design
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1:2004 (EC2): Design of concrete structures
///   - PCI Design Handbook 8th ed. (2017)
///   - Nawy: "Prestressed Concrete: A Fundamental Approach" 5th ed.
///   - Collins & Mitchell: "Prestressed Concrete Structures" (1991)
///   - Lin & Burns: "Design of Prestressed Concrete Structures" 3rd ed.
///
/// Tests verify prestress losses, flexural capacity, allowable stresses,
/// partial prestressing, anchorage zone, and deflection.

mod helpers;

// ═══════════════════════════════════════════════════════════════
// 1. Prestress Losses — Elastic Shortening (ACI 318 §20.3.2.6)
// ═══════════════════════════════════════════════════════════════
//
// For pretensioned members:
//   Δf_ES = n × (Pi/A + Pi·e²/I) = n × Pi × (1/A + e²/I)
//   where Pi = initial prestress force, e = eccentricity
//   n = Ep/Ec (modular ratio)
//
// Example: I-beam, A = 250,000 mm², I = 12.5×10⁹ mm⁴
//   e = 300 mm, Pi = 2,000 kN, Ep = 196,000 MPa, Ec = 35,000 MPa
//   n = 196,000/35,000 = 5.6
//   f_cgp = 2,000,000/250,000 + 2,000,000×300²/12.5×10⁹ = 8.0 + 14.4 = 22.4 MPa
//   Δf_ES = 5.6 × 22.4 = 125.4 MPa

#[test]
fn prestress_elastic_shortening_loss() {
    let a_c: f64 = 250_000.0;
    let i_c: f64 = 12.5e9;
    let e: f64 = 300.0;
    let pi: f64 = 2_000_000.0;
    let ep: f64 = 196_000.0;
    let ec: f64 = 35_000.0;

    let n: f64 = ep / ec;
    assert!((n - 5.6).abs() / 5.6 < 0.001, "n = {:.2}, expected 5.6", n);

    let f_cgp: f64 = pi / a_c + pi * e * e / i_c;
    let f_cgp_expected: f64 = 22.4;
    assert!(
        (f_cgp - f_cgp_expected).abs() / f_cgp_expected < 0.01,
        "f_cgp = {:.2} MPa, expected {:.2}", f_cgp, f_cgp_expected
    );

    let delta_es: f64 = n * f_cgp;
    let delta_es_expected: f64 = 125.44;
    assert!(
        (delta_es - delta_es_expected).abs() / delta_es_expected < 0.01,
        "Δf_ES = {:.2} MPa, expected {:.2}", delta_es, delta_es_expected
    );

    let fpi: f64 = pi / 1_400.0;
    let loss_pct: f64 = delta_es / fpi * 100.0;
    assert!(
        loss_pct > 5.0 && loss_pct < 20.0,
        "Elastic shortening loss = {:.1}% of initial stress", loss_pct
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Long-Term Losses — Creep, Shrinkage, Relaxation (PCI Method)
// ═══════════════════════════════════════════════════════════════
//
// PCI simplified method:
//   Δf_CR = n × f_cgp × Cu  (creep), Cu = 1.6
//   Δf_SH = ε_sh × Ep       (shrinkage), ε_sh = 500×10⁻⁶
//   Δf_RE = 0.04 × fpi      (relaxation, low-relax strand simplified)
//
// Example:
//   Δf_CR = 5.6 × 22.4 × 1.6 = 200.7 MPa
//   Δf_SH = 500×10⁻⁶ × 196,000 = 98.0 MPa
//   Δf_RE = 0.04 × 1428.6 = 57.1 MPa
//   Total ≈ 125.4 + 200.7 + 98.0 + 57.1 = 481.2 MPa

#[test]
fn prestress_long_term_losses() {
    let ep: f64 = 196_000.0;
    let ec: f64 = 35_000.0;
    let n: f64 = ep / ec;
    let f_cgp: f64 = 22.4;
    let delta_es: f64 = n * f_cgp;

    let cu: f64 = 1.6;
    let delta_cr: f64 = n * f_cgp * cu;
    let delta_cr_expected: f64 = 200.7;
    assert!(
        (delta_cr - delta_cr_expected).abs() / delta_cr_expected < 0.02,
        "Δf_CR = {:.1} MPa, expected {:.1}", delta_cr, delta_cr_expected
    );

    let eps_sh: f64 = 500e-6;
    let delta_sh: f64 = eps_sh * ep;
    assert!(
        (delta_sh - 98.0).abs() / 98.0 < 0.01,
        "Δf_SH = {:.1} MPa, expected 98.0", delta_sh
    );

    let aps: f64 = 1_400.0;
    let pi: f64 = 2_000_000.0;
    let fpi: f64 = pi / aps;
    let delta_re: f64 = 0.04 * fpi;
    assert!(
        (delta_re - 57.1).abs() / 57.1 < 0.02,
        "Δf_RE = {:.1} MPa, expected 57.1", delta_re
    );

    let total_losses: f64 = delta_es + delta_cr + delta_sh + delta_re;
    let total_expected: f64 = 481.2;
    assert!(
        (total_losses - total_expected).abs() / total_expected < 0.02,
        "Total losses = {:.1} MPa, expected {:.1}", total_losses, total_expected
    );

    let loss_pct: f64 = total_losses / fpi * 100.0;
    assert!(
        loss_pct > 20.0 && loss_pct < 50.0,
        "Total losses = {:.1}% of fpi", loss_pct
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Flexural Capacity of Prestressed Section (ACI 318 §22.3)
// ═══════════════════════════════════════════════════════════════
//
// fps = fpu × (1 − γp/β₁ × ρp × fpu/f'c)
// γp = 0.28 for fpy/fpu ≥ 0.9 (low-relax strand)
// ρp = Aps / (b·dp)
//
// Example: b=400, dp=550, Aps=1000, fpu=1860, f'c=40, β₁=0.76
//   ρp = 1000/(400×550) = 0.004545
//   fps = 1860×(1 − 0.28/0.76 × 0.004545 × 1860/40) = 1715.1 MPa
//   a = 1000×1715.1/(0.85×40×400) = 126.3 mm
//   Mn = 1000×1715.1×(550−63.1) = 835.2 kN·m

#[test]
fn prestress_flexural_capacity() {
    let b: f64 = 400.0;
    let dp: f64 = 550.0;
    let aps: f64 = 1_000.0;
    let fpu: f64 = 1_860.0;
    let fc_prime: f64 = 40.0;
    let beta1: f64 = 0.76;
    let gamma_p: f64 = 0.28;

    let rho_p: f64 = aps / (b * dp);
    assert!(
        (rho_p - 0.004545).abs() / 0.004545 < 0.01,
        "ρp = {:.6}", rho_p
    );

    let fps: f64 = fpu * (1.0 - (gamma_p / beta1) * rho_p * fpu / fc_prime);
    let fps_expected: f64 = 1_715.1;
    assert!(
        (fps - fps_expected).abs() / fps_expected < 0.01,
        "fps = {:.1} MPa, expected {:.1}", fps, fps_expected
    );

    let a: f64 = aps * fps / (0.85 * fc_prime * b);
    assert!(
        (a - 126.3).abs() / 126.3 < 0.02,
        "a = {:.1} mm", a
    );

    let mn: f64 = aps * fps * (dp - a / 2.0) / 1.0e6;
    assert!(
        (mn - 835.2).abs() / 835.2 < 0.02,
        "Mn = {:.1} kN·m, expected 835.2", mn
    );

    let c: f64 = a / beta1;
    assert!(c / dp < 0.42, "c/dp = {:.3} < 0.42 (ductility OK)", c / dp);
}

// ═══════════════════════════════════════════════════════════════
// 4. Allowable Stresses at Transfer and Service (ACI 318 §24.5)
// ═══════════════════════════════════════════════════════════════
//
// At transfer (f'ci): Comp ≤ 0.60·f'ci, Tens ≤ 0.25·√f'ci
// At service (f'c):  Comp_sust ≤ 0.45·f'c, Comp_total ≤ 0.60·f'c
//                    Tens ≤ 0.62·√f'c (Class U)
//
// Example: f'c=45, f'ci=32
//   Transfer: comp ≤ 19.2, tens ≤ 1.414 MPa
//   Service: comp_sust ≤ 20.25, comp_total ≤ 27.0, tens ≤ 4.16 MPa

#[test]
fn prestress_allowable_stresses() {
    let fc_prime: f64 = 45.0;
    let fci_prime: f64 = 32.0;

    let comp_transfer: f64 = 0.60 * fci_prime;
    assert!((comp_transfer - 19.2).abs() < 0.01, "Transfer comp = {:.1}", comp_transfer);

    let tens_transfer: f64 = 0.25 * fci_prime.sqrt();
    assert!(
        (tens_transfer - 1.414).abs() / 1.414 < 0.01,
        "Transfer tens = {:.3} MPa", tens_transfer
    );

    let tens_bonded: f64 = 0.50 * fci_prime.sqrt();
    assert!(tens_bonded > tens_transfer, "Bonded {:.3} > basic {:.3}", tens_bonded, tens_transfer);

    let comp_sustained: f64 = 0.45 * fc_prime;
    assert!((comp_sustained - 20.25).abs() < 0.01, "Sustained comp = {:.2}", comp_sustained);

    let comp_total: f64 = 0.60 * fc_prime;
    assert!((comp_total - 27.0).abs() < 0.01, "Total comp = {:.1}", comp_total);

    let tens_service: f64 = 0.62 * fc_prime.sqrt();
    assert!(
        (tens_service - 4.16).abs() / 4.16 < 0.01,
        "Service tens = {:.2} MPa", tens_service
    );

    assert!(comp_sustained < comp_total, "Sustained < total compression");
    assert!(tens_transfer < tens_service, "Transfer < service tension");
}

// ═══════════════════════════════════════════════════════════════
// 5. Ultimate Moment with Bonded Tendons (Strain Compatibility)
// ═══════════════════════════════════════════════════════════════
//
// εps = εce + εdecomp + Δεps
// εce = fse/Ep, εdecomp = fce/Ec, Δεps = εcu×(dp−c)/c
//
// Example: fse=1100, Ep=196000, Ec=32000, f'c=40
//   dp=500, Aps=800, b=350, fpu=1860
//   εce = 0.005612, εdecomp = 0.000313
//   With c=120: Δεps = 0.003×380/120 = 0.0095
//   εps = 0.01543 → fps = min(εps×Ep, fpu) → fpu governs

#[test]
fn prestress_ultimate_moment_strain_compatibility() {
    let fse: f64 = 1_100.0;
    let ep: f64 = 196_000.0;
    let ec: f64 = 32_000.0;
    let dp: f64 = 500.0;
    let aps: f64 = 800.0;
    let b: f64 = 350.0;
    let fpu: f64 = 1_860.0;
    let fce: f64 = 10.0;
    let eps_cu: f64 = 0.003;
    let beta1: f64 = 0.76;

    let eps_ce: f64 = fse / ep;
    assert!((eps_ce - 0.005612).abs() < 0.0001, "εce = {:.6}", eps_ce);

    let eps_decomp: f64 = fce / ec;
    assert!((eps_decomp - 0.000313).abs() < 0.0001, "εdecomp = {:.6}", eps_decomp);

    let c: f64 = 120.0;
    let delta_eps: f64 = eps_cu * (dp - c) / c;
    let eps_ps: f64 = eps_ce + eps_decomp + delta_eps;
    assert!(eps_ps > 0.01, "Total strain = {:.6} > 0.01", eps_ps);

    let fps_raw: f64 = eps_ps * ep;
    let fps: f64 = fps_raw.min(fpu);
    assert!((fps - fpu).abs() < 0.01, "fps = fpu = {:.0} MPa (capped)", fps);

    let a: f64 = beta1 * c;
    let compression: f64 = 0.85 * 40.0 * a * b;
    let tension: f64 = aps * fps;
    let ratio: f64 = tension / compression;
    assert!(ratio > 0.5 && ratio < 2.0, "T/C = {:.3}", ratio);

    let a_bal: f64 = aps * fpu / (0.85 * 40.0 * b);
    let mn: f64 = aps * fpu * (dp - a_bal / 2.0) / 1.0e6;
    assert!(mn > 500.0 && mn < 1000.0, "Mn = {:.1} kN·m", mn);
}

// ═══════════════════════════════════════════════════════════════
// 6. Partial Prestressing Ratio (PPR)
// ═══════════════════════════════════════════════════════════════
//
// PPR = Aps×fps / (Aps×fps + As×fy)
//
// Example: Aps=800, fps=1700, As=1200, fy=420
//   PPR = 1,360,000 / 1,864,000 = 0.730

#[test]
fn prestress_partial_prestressing_ratio() {
    let aps: f64 = 800.0;
    let fps: f64 = 1_700.0;
    let as_mild: f64 = 1_200.0;
    let fy: f64 = 420.0;

    let f_ps: f64 = aps * fps;
    let f_mild: f64 = as_mild * fy;
    let ppr: f64 = f_ps / (f_ps + f_mild);
    assert!(
        (ppr - 0.730).abs() / 0.730 < 0.01,
        "PPR = {:.3}, expected 0.730", ppr
    );
    assert!(ppr > 0.0 && ppr < 1.0, "Partially prestressed");

    let ppr_full: f64 = f_ps / (f_ps + 0.0);
    assert!((ppr_full - 1.0).abs() < 1e-10, "Fully prestressed PPR=1");

    let ppr_rc: f64 = 0.0_f64 / (0.0 + f_mild);
    assert!(ppr_rc.abs() < 1e-10, "Pure RC: PPR=0");

    let aps2: f64 = 1_200.0;
    let as2: f64 = 600.0;
    let ppr2: f64 = (aps2 * fps) / (aps2 * fps + as2 * fy);
    assert!(ppr2 > ppr, "More prestress: PPR={:.3} > {:.3}", ppr2, ppr);
}

// ═══════════════════════════════════════════════════════════════
// 7. Anchorage Zone Bursting Force — Guyon Formula
// ═══════════════════════════════════════════════════════════════
//
// Tburst = 0.25 × P × (1 − a/h)
// dburst = 0.5 × (h − 2e) [concentric: 0.5h]
//
// Example: P=2000 kN, h=800 mm, plate 200 mm
//   Tburst = 0.25×2000×(1−200/800) = 375 kN
//   As = 375,000/(0.75×420) = 1190.5 mm²

#[test]
fn prestress_anchorage_zone_bursting_guyon() {
    let p: f64 = 2_000.0;
    let h: f64 = 800.0;
    let a_plate: f64 = 200.0;
    let fy: f64 = 420.0;
    let phi: f64 = 0.75;

    let t_burst: f64 = 0.25 * p * (1.0 - a_plate / h);
    assert!(
        (t_burst - 375.0).abs() / 375.0 < 0.001,
        "Tburst = {:.1} kN", t_burst
    );

    let d_burst: f64 = 0.5 * h;
    assert!((d_burst - 400.0).abs() < 0.01, "dburst = {:.0} mm", d_burst);

    let as_req: f64 = t_burst * 1000.0 / (phi * fy);
    assert!(
        (as_req - 1190.5).abs() / 1190.5 < 0.01,
        "As = {:.0} mm²", as_req
    );

    let t_large: f64 = 0.25 * p * (1.0 - 400.0 / h);
    assert!(t_large < t_burst, "Larger plate → less burst");

    let t_full: f64 = 0.25 * p * (1.0 - h / h);
    assert!(t_full.abs() < 0.001, "Full plate → zero burst");
}

// ═══════════════════════════════════════════════════════════════
// 8. Deflection of Prestressed Beam (Effective Moment of Inertia)
// ═══════════════════════════════════════════════════════════════
//
// Branson's equation: Ie = (Mcr/Ma)³·Ig + [1−(Mcr/Ma)³]·Icr ≤ Ig
// Mcr = (fr + fce − fd) × Sb
// fr = 0.62√f'c, Sb = I/yb
//
// Example: L=12m, w=25 kN/m, Ig=12.5e9, Icr=6e9
//   Mcr = 459.3 kN·m, Ma(25kN/m) = 450 kN·m → uncracked
//   Ma(30kN/m) = 540 kN·m → cracked → Ie between Icr and Ig

#[test]
fn prestress_deflection_effective_inertia() {
    let fc_prime: f64 = 40.0;
    let l: f64 = 12_000.0;
    let w_dead: f64 = 15.0;
    let ig: f64 = 12.5e9;
    let icr: f64 = 6.0e9;
    let yb: f64 = 350.0;
    let pe: f64 = 1_500_000.0;
    let e_tendon: f64 = 250.0;
    let a_c: f64 = 250_000.0;

    let sb: f64 = ig / yb;

    let fr: f64 = 0.62 * fc_prime.sqrt();
    assert!((fr - 3.92).abs() / 3.92 < 0.01, "fr = {:.2}", fr);

    let fce: f64 = pe / a_c + pe * e_tendon / sb;
    assert!((fce - 16.5).abs() / 16.5 < 0.02, "fce = {:.1}", fce);

    let l_m: f64 = l / 1000.0;
    let md: f64 = w_dead * l_m * l_m / 8.0;
    let fd: f64 = md * 1.0e6 / sb;
    assert!((fd - 7.56).abs() / 7.56 < 0.02, "fd = {:.2}", fd);

    let mcr: f64 = (fr + fce - fd) * sb / 1.0e6;
    assert!((mcr - 459.3).abs() / 459.3 < 0.02, "Mcr = {:.1}", mcr);

    let w_total: f64 = 25.0;
    let ma: f64 = w_total * l_m * l_m / 8.0;
    assert!((ma - 450.0).abs() / 450.0 < 0.001, "Ma = {:.1}", ma);

    // Uncracked: Mcr > Ma
    assert!(mcr > ma, "Mcr={:.1} > Ma={:.1} → uncracked", mcr, ma);

    let ratio3: f64 = (mcr / ma).powi(3);
    let ie: f64 = (ratio3 * ig + (1.0 - ratio3) * icr).min(ig);
    assert!((ie - ig).abs() / ig < 0.001, "Ie = Ig (uncracked)");

    // Heavier load → cracked
    let w_heavy: f64 = 30.0;
    let ma_heavy: f64 = w_heavy * l_m * l_m / 8.0;
    assert!(ma_heavy > mcr, "Heavy load cracks section");

    let ratio3_h: f64 = (mcr / ma_heavy).powi(3);
    let ie_h: f64 = (ratio3_h * ig + (1.0 - ratio3_h) * icr).min(ig);
    assert!(
        ie_h > icr && ie_h < ig,
        "Cracked Ie={:.2e} between Icr and Ig", ie_h
    );
}

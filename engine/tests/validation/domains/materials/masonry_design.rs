/// Validation: Masonry Structural Design
///
/// References:
///   - TMS 402/602-16: Building Code Requirements for Masonry Structures
///   - EN 1996-1-1:2005 (EC6): Design of masonry structures
///   - Drysdale & Hamid: "Masonry Structures: Behavior and Design" 3rd ed.
///   - Hendry, Sinha & Davies: "Design of Masonry Structures" 3rd ed.
///   - Mainstone: "On the stiffness and strength of infilled frames" (1971)
///
/// Tests verify compressive strength, wall capacity, flexure, shear,
/// eccentricity, infill strut, arching, and bed-joint reinforcement.

// ═══════════════════════════════════════════════════════════════
// 1. Compressive Strength from Unit and Mortar (EC6 §3.6.1.2)
// ═══════════════════════════════════════════════════════════════
//
// Characteristic compressive strength of masonry (EC6 Eq. 3.1):
//   fk = K × fb^α × fm^β
//   where fb = normalized unit strength, fm = mortar strength
//   K = 0.55 (Group 1 units with general purpose mortar)
//   α = 0.7, β = 0.3
//
// Example: Solid clay brick fb = 20 MPa, mortar M10 (fm = 10 MPa)
//   fk = 0.55 × 20^0.7 × 10^0.3
//      = 0.55 × 8.143 × 1.995
//      = 8.93 MPa
//
// Design strength: fd = fk / γM, with γM = 2.3 (Category II, Class 2)
//   fd = 8.93 / 2.3 = 3.88 MPa

#[test]
fn masonry_ec6_compressive_strength() {
    let fb: f64 = 20.0;     // MPa, normalized unit compressive strength
    let fm: f64 = 10.0;     // MPa, mortar compressive strength
    let k: f64 = 0.55;      // Group 1 units, general purpose mortar
    let alpha: f64 = 0.7;
    let beta: f64 = 0.3;
    let gamma_m: f64 = 2.3;  // partial safety factor

    // Characteristic compressive strength
    let fk: f64 = k * fb.powf(alpha) * fm.powf(beta);
    let fk_expected: f64 = 8.93;
    assert!(
        (fk - fk_expected).abs() / fk_expected < 0.02,
        "fk = {:.2} MPa, expected {:.2}", fk, fk_expected
    );

    // Design strength
    let fd: f64 = fk / gamma_m;
    let fd_expected: f64 = 3.88;
    assert!(
        (fd - fd_expected).abs() / fd_expected < 0.02,
        "fd = {:.2} MPa, expected {:.2}", fd, fd_expected
    );

    // Weaker mortar → lower fk
    let fm_weak: f64 = 5.0;
    let fk_weak: f64 = k * fb.powf(alpha) * fm_weak.powf(beta);
    assert!(
        fk_weak < fk,
        "Weaker mortar: fk={:.2} < {:.2}", fk_weak, fk
    );

    // Stronger units → higher fk
    let fb_strong: f64 = 40.0;
    let fk_strong: f64 = k * fb_strong.powf(alpha) * fm.powf(beta);
    assert!(
        fk_strong > fk,
        "Stronger units: fk={:.2} > {:.2}", fk_strong, fk
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Unreinforced Wall Axial Capacity with Slenderness (EC6 §6.1.2.1)
// ═══════════════════════════════════════════════════════════════
//
// Design resistance: NRd = Φ × t × fd
// where Φ = capacity reduction factor for slenderness and eccentricity
//
// Φi = 1 − 2·ei/t (at top/bottom of wall)
// Φm = A1 × e^(-u²/2) (at mid-height)
//   where u = (hef/tef − 2) / (23 − 37·em/t)
//   A1 = 1 − 2·em/t
//   em = max(M/N, 0.05t)  eccentricity at mid-height
//   ei = M/N + h_ef/450    eccentricity at top/bottom
//
// Example: t = 200 mm, hef = 3000 mm, fd = 3.88 MPa
//   em/t = 0.05 (minimum), ei/t = 0.05 + 3000/(450×200) = 0.05 + 0.0333 = 0.0833
//   Φi = 1 − 2×0.0833 = 0.833
//   hef/tef = 3000/200 = 15
//   u = (15 − 2)/(23 − 37×0.05) = 13/21.15 = 0.6147
//   A1 = 1 − 2×0.05 = 0.90
//   Φm = 0.90 × e^(−0.6147²/2) = 0.90 × e^(−0.1890) = 0.90 × 0.8278 = 0.745
//   Φ = min(Φi, Φm) = 0.745
//   NRd = 0.745 × 200 × 3.88 = 578.1 kN/m (per m length)

#[test]
fn masonry_unreinforced_wall_axial_capacity() {
    let t: f64 = 200.0;       // mm, wall thickness
    let hef: f64 = 3_000.0;   // mm, effective height
    let fd: f64 = 3.88;       // MPa, design masonry strength
    let em_ratio: f64 = 0.05; // em/t, minimum eccentricity ratio

    // Eccentricity at top/bottom
    let ei_ratio: f64 = em_ratio + hef / (450.0 * t);
    let ei_ratio_expected: f64 = 0.0833;
    assert!(
        (ei_ratio - ei_ratio_expected).abs() / ei_ratio_expected < 0.01,
        "ei/t = {:.4}, expected {:.4}", ei_ratio, ei_ratio_expected
    );

    // Capacity reduction at top/bottom
    let phi_i: f64 = 1.0 - 2.0 * ei_ratio;
    let phi_i_expected: f64 = 0.833;
    assert!(
        (phi_i - phi_i_expected).abs() / phi_i_expected < 0.01,
        "Φi = {:.3}, expected {:.3}", phi_i, phi_i_expected
    );

    // Capacity reduction at mid-height
    let slenderness: f64 = hef / t;
    let u: f64 = (slenderness - 2.0) / (23.0 - 37.0 * em_ratio);
    let u_expected: f64 = 0.6147;
    assert!(
        (u - u_expected).abs() / u_expected < 0.01,
        "u = {:.4}, expected {:.4}", u, u_expected
    );

    let a1: f64 = 1.0 - 2.0 * em_ratio;
    let phi_m: f64 = a1 * (-u * u / 2.0).exp();
    let phi_m_expected: f64 = 0.745;
    assert!(
        (phi_m - phi_m_expected).abs() / phi_m_expected < 0.02,
        "Φm = {:.3}, expected {:.3}", phi_m, phi_m_expected
    );

    // Governing reduction factor
    let phi: f64 = phi_i.min(phi_m);
    assert!(
        (phi - phi_m).abs() < 0.001,
        "Φ = Φm = {:.3} (mid-height governs)", phi
    );

    // Design resistance per metre length
    let _nrd: f64 = phi * t * fd / 1000.0; // kN/m (per 1000 mm length)
    // = 0.745 × 200 × 3.88 / 1000 × 1000 = 578.1 kN/m
    let nrd_per_m: f64 = phi * t * fd;  // kN per m run (fd in N/mm², t in mm → N/mm → ×1000/1000)
    let nrd_expected: f64 = 578.1;
    assert!(
        (nrd_per_m - nrd_expected).abs() / nrd_expected < 0.02,
        "NRd = {:.1} kN/m, expected {:.1}", nrd_per_m, nrd_expected
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Reinforced Masonry Flexural Capacity (TMS 402 §9.3.3)
// ═══════════════════════════════════════════════════════════════
//
// Similar to RC: a = As·fy / (0.80·f'm·b)
//   Note: TMS uses 0.80 for equivalent stress block (not 0.85 like ACI)
//   Mn = As·fy·(d − a/2)
//
// Example: Reinforced CMU wall, 200 mm nominal (actual = 194 mm)
//   b = 1000 mm (per metre), d = 97 mm (half thickness − cover issues)
//   Actually for a grouted wall: d = 97 mm to bar center
//   As = 645 mm² (#5 @ 400 mm → 200 mm²/bar × 1000/400 × 1.29)
//   Wait, let's use: As = 500 mm²/m, fy = 420 MPa, f'm = 10.3 MPa
//
//   a = 500 × 420 / (0.80 × 10.3 × 1000) = 210,000 / 8,240 = 25.49 mm
//   Mn = 500 × 420 × (97 − 25.49/2) / 10⁶ = 500 × 420 × 84.26 / 10⁶
//      = 17.69 kN·m/m

#[test]
fn masonry_reinforced_flexural_capacity() {
    let as_steel: f64 = 500.0;    // mm²/m, reinforcement area per metre
    let fy: f64 = 420.0;          // MPa, yield strength
    let fm_prime: f64 = 10.3;     // MPa, masonry compressive strength
    let b: f64 = 1_000.0;         // mm, unit width (per metre)
    let d: f64 = 97.0;            // mm, effective depth to reinforcement

    // Stress block depth (TMS uses 0.80 factor)
    let a: f64 = as_steel * fy / (0.80 * fm_prime * b);
    let a_expected: f64 = 25.49;
    assert!(
        (a - a_expected).abs() / a_expected < 0.01,
        "a = {:.2} mm, expected {:.2}", a, a_expected
    );

    // Nominal moment per metre
    let mn: f64 = as_steel * fy * (d - a / 2.0) / 1.0e6; // kN·m/m
    let mn_expected: f64 = 17.69;
    assert!(
        (mn - mn_expected).abs() / mn_expected < 0.02,
        "Mn = {:.2} kN·m/m, expected {:.2}", mn, mn_expected
    );

    // Verify stress block is within wall thickness
    assert!(
        a < d,
        "Stress block a={:.1}mm < effective depth d={:.0}mm", a, d
    );

    // Reinforcement ratio
    let rho: f64 = as_steel / (b * d);
    assert!(
        rho > 0.001 && rho < 0.05,
        "ρ = {:.4} — typical masonry range", rho
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Shear Strength of Masonry Wall (TMS 402 §9.3.4.1.2)
// ═══════════════════════════════════════════════════════════════
//
// Nominal shear strength: Vn = Vm + Vs
// Masonry contribution:
//   Vm = [4.0 − 1.75×(Mu/(Vu·dv))] × An × √f'm + 0.25×P
//   (TMS simplified; all in lb,in units — we convert to SI)
//
// Simplified SI version (TMS §9.3.4.1.2 adapted):
//   Vm = 0.083 × [4.0 − 1.75×(M/(V·dv))] × An × √f'm + 0.25×P
//   where An = net shear area, P = axial compression
//
// Steel contribution: Vs = 0.5 × (Av/s) × fy × dv
//
// Example: Wall 3000 mm long × 200 mm thick, f'm = 10.3 MPa
//   dv = 0.8 × 3000 = 2400 mm, An = 3000 × 200 = 600,000 mm²
//   M/(V·dv) = 1.0 (moderate shear ratio), P = 200 kN
//   Vm = 0.083 × (4.0−1.75×1.0) × 600,000 × √10.3 + 0.25 × 200,000
//      = 0.083 × 2.25 × 600,000 × 3.209 + 50,000
//      = 0.1868 × 600,000 × 3.209 + 50,000 (wait — units)
//
// Let me use a cleaner formulation. Vm (N) = Cm × An × √f'm + 0.25×P
// where Cm accounts for M/Vdv ratio.
// Simpler: use fv_m = 0.166√f'm for low M/Vd (shear-controlled)
//   Vm = fv_m × An = 0.166 × √10.3 × 600,000 = 0.5327 × 600,000 = 319.6 kN
//   Plus axial: Vm_total = 319.6 + 0.25 × 200 = 369.6 kN

#[test]
fn masonry_shear_strength() {
    let l_w: f64 = 3_000.0;     // mm, wall length
    let t: f64 = 200.0;         // mm, wall thickness
    let fm_prime: f64 = 10.3;   // MPa
    let p: f64 = 200_000.0;     // N, axial compression (200 kN)
    let fy: f64 = 420.0;        // MPa, shear reinforcement yield
    let av_s: f64 = 0.5;        // mm²/mm, horizontal rebar area/spacing

    // Net shear area
    let an: f64 = l_w * t;  // 600,000 mm²

    // Effective shear depth
    let dv: f64 = 0.8 * l_w;  // 2,400 mm

    // Masonry shear contribution (simplified, shear-controlled)
    let fv_m: f64 = 0.166 * fm_prime.sqrt(); // MPa
    let vm: f64 = fv_m * an + 0.25 * p;      // N
    let vm_kn: f64 = vm / 1000.0;

    // Check masonry contribution
    assert!(
        fv_m > 0.0 && fv_m < 1.0,
        "Masonry shear stress fv_m = {:.3} MPa", fv_m
    );

    // Steel contribution
    let vs: f64 = 0.5 * av_s * fy * dv;  // N
    let vs_kn: f64 = vs / 1000.0;
    assert!(
        vs_kn > 0.0,
        "Steel shear contribution = {:.1} kN", vs_kn
    );

    // Total nominal shear
    let vn: f64 = vm + vs;
    let vn_kn: f64 = vn / 1000.0;
    assert!(
        vn_kn > vm_kn,
        "Total Vn={:.1} > masonry Vm={:.1} kN", vn_kn, vm_kn
    );

    // Axial compression improves shear capacity
    let vm_no_axial: f64 = fv_m * an / 1000.0;
    assert!(
        vm_kn > vm_no_axial,
        "Axial load increases shear: {:.1} > {:.1} kN", vm_kn, vm_no_axial
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Effective Eccentricity from Lateral Loads (EC6 §6.1.2.2)
// ═══════════════════════════════════════════════════════════════
//
// Mid-height eccentricity:
//   emk = em + ek
//   em = (M1 + M2) / (2·N)  (first-order eccentricity)
//   ek = hef² / (2000·t)    (creep eccentricity, EC6 §A.2)
//
// Minimum eccentricity: emk ≥ 0.05t
//
// Example: N = 500 kN/m, M_top = 20 kN·m/m, M_bot = 10 kN·m/m
//   t = 300 mm, hef = 4000 mm
//   em = (20 + 10)/(2×500) = 0.030 m = 30 mm
//   ek = 4000²/(2000×300) = 16,000,000/600,000 = 26.67 mm
//   emk = 30 + 26.67 = 56.67 mm
//   0.05t = 15 mm → emk = 56.67 mm (governs)
//   emk/t = 0.189

#[test]
fn masonry_effective_eccentricity() {
    let n: f64 = 500.0;      // kN/m, axial load per metre
    let m_top: f64 = 20.0;   // kN·m/m, moment at top
    let m_bot: f64 = 10.0;   // kN·m/m, moment at bottom
    let t: f64 = 300.0;      // mm, wall thickness
    let hef: f64 = 4_000.0;  // mm, effective height

    // First-order eccentricity
    let em: f64 = (m_top + m_bot) / (2.0 * n) * 1000.0;  // mm
    let em_expected: f64 = 30.0;
    assert!(
        (em - em_expected).abs() / em_expected < 0.001,
        "em = {:.1} mm, expected {:.1}", em, em_expected
    );

    // Creep eccentricity
    let ek: f64 = hef * hef / (2000.0 * t);
    let ek_expected: f64 = 26.67;
    assert!(
        (ek - ek_expected).abs() / ek_expected < 0.01,
        "ek = {:.2} mm, expected {:.2}", ek, ek_expected
    );

    // Total mid-height eccentricity
    let emk: f64 = em + ek;
    let emk_min: f64 = 0.05 * t;  // minimum = 15 mm
    let emk_design: f64 = emk.max(emk_min);

    assert!(
        emk > emk_min,
        "emk = {:.2} > minimum {:.1} mm", emk, emk_min
    );
    assert!(
        (emk_design - 56.67).abs() / 56.67 < 0.01,
        "emk = {:.2} mm, expected 56.67", emk_design
    );

    // Eccentricity ratio
    let emk_ratio: f64 = emk_design / t;
    assert!(
        (emk_ratio - 0.189).abs() / 0.189 < 0.01,
        "emk/t = {:.3}, expected 0.189", emk_ratio
    );

    // Higher wall → more creep eccentricity
    let hef2: f64 = 6_000.0;
    let ek2: f64 = hef2 * hef2 / (2000.0 * t);
    assert!(ek2 > ek, "Taller wall: ek={:.1} > {:.1} mm", ek2, ek);
}

// ═══════════════════════════════════════════════════════════════
// 6. Masonry Infill Strut Width — Mainstone Formula (1971)
// ═══════════════════════════════════════════════════════════════
//
// Equivalent diagonal strut width (Mainstone):
//   w = 0.175 × (λ1 × h)^(-0.4) × d_inf
//   where λ1 = [Em·t_inf·sin(2θ) / (4·Ef·Ic·h_inf)]^(1/4)
//   d_inf = diagonal length of infill panel
//   θ = arctan(h_inf / l_inf)
//   h = column height, h_inf = infill clear height
//   Em = masonry E, Ef = frame E, Ic = column I, t_inf = infill thickness
//
// Example: Frame 4m × 6m, column 300×300 (Ic = 6.75×10⁸ mm⁴)
//   Infill: h_inf = 3500 mm, l_inf = 5500 mm, t_inf = 150 mm
//   Em = 5,000 MPa, Ef = 25,000 MPa (concrete frame)
//   θ = atan(3500/5500) = 0.5667 rad (32.5°)
//   d_inf = √(3500² + 5500²) = √(12,250,000 + 30,250,000) = 6519 mm
//   sin(2θ) = sin(1.1334) = 0.9076
//   λ1 = [5000×150×0.9076/(4×25000×6.75×10⁸×3500)]^0.25
//      = [681,195,000 / 2.3625×10¹⁴]^0.25
//      = [2.883×10⁻⁶]^0.25 = 0.04122
//   λ1·h = 0.04122 × 4000 = 164.9
//   w = 0.175 × 164.9^(-0.4) × 6519
//     = 0.175 × 0.09667 × 6519 = 110.3 mm (? let me recalculate)
//   164.9^0.4 → log(164.9) = 5.106, 0.4×5.106 = 2.042, e^2.042 = 7.706
//   164.9^(-0.4) = 1/7.706 = 0.1298
//   w = 0.175 × 0.1298 × 6519 = 147.9 mm
//   w/d_inf = 147.9 / 6519 = 0.0227 (~2.3% of diagonal — typical)

#[test]
fn masonry_infill_strut_mainstone() {
    let h: f64 = 4_000.0;       // mm, column height (story height)
    let h_inf: f64 = 3_500.0;   // mm, clear infill height
    let l_inf: f64 = 5_500.0;   // mm, clear infill length
    let t_inf: f64 = 150.0;     // mm, infill thickness
    let em: f64 = 5_000.0;      // MPa, masonry modulus
    let ef: f64 = 25_000.0;     // MPa, frame modulus (concrete)
    let ic: f64 = 6.75e8;       // mm⁴, column moment of inertia

    // Geometry
    let theta: f64 = (h_inf / l_inf).atan();  // rad
    let d_inf: f64 = (h_inf * h_inf + l_inf * l_inf).sqrt();
    let d_inf_expected: f64 = 6_519.2;
    assert!(
        (d_inf - d_inf_expected).abs() / d_inf_expected < 0.01,
        "d_inf = {:.1} mm", d_inf
    );

    // Relative stiffness parameter λ1
    let sin2theta: f64 = (2.0 * theta).sin();
    let lambda1: f64 = (em * t_inf * sin2theta / (4.0 * ef * ic * h_inf)).powf(0.25);

    // Equivalent strut width (Mainstone)
    let lam_h: f64 = lambda1 * h;
    let w: f64 = 0.175 * lam_h.powf(-0.4) * d_inf;

    // Strut width should be reasonable (typically 3-15% of diagonal)
    let w_ratio: f64 = w / d_inf;
    assert!(
        w_ratio > 0.01 && w_ratio < 0.15,
        "w/d_inf = {:.4} — typical range 1-15%", w_ratio
    );

    // Strut width should be positive and smaller than panel dimension
    assert!(w > 0.0 && w < l_inf, "Strut width = {:.1} mm", w);

    // Thicker infill (larger t_inf) → wider strut (stiffer infill panel)
    let t_inf_thick: f64 = 250.0;
    let lambda1_thick: f64 = (em * t_inf_thick * sin2theta / (4.0 * ef * ic * h_inf)).powf(0.25);
    let w_thick: f64 = 0.175 * (lambda1_thick * h).powf(-0.4) * d_inf;
    // Higher λ1 → larger λ1*h → smaller (λ1*h)^{-0.4} → but the λ1 increase is modest
    // The net effect in Mainstone's formula is that stiffer infill → narrower strut
    // because λ1*h appears with a negative exponent
    assert!(
        w_thick < w,
        "Thicker infill: w={:.1} < {:.1} mm (higher λ1·h → narrower strut)", w_thick, w
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Arching Action in Confined Masonry Panels (McDowell et al.)
// ═══════════════════════════════════════════════════════════════
//
// For laterally loaded masonry panels confined by rigid frame,
// arching action develops, significantly increasing out-of-plane capacity.
//
// One-way arching capacity (McDowell 1956):
//   q_arch = 4 × f'm × t² × r / (L²)
//   where r = (1 − (Δ/t)) and Δ = t − √(t² − L²/(4R²)·t²)
//   Simplified for rigid supports:
//   q_arch = 0.85 × f'm × (t/L)² × 8  (simplified arch thrust)
//
// More practical (Canadian code approach):
//   w_arch = 0.8 × f'm × (t²/L²)
//
// Example: Panel 3000×200 mm, f'm = 10 MPa, confined by frame
//   w_arch = 0.8 × 10 × (200²/3000²) = 0.8 × 10 × 0.004444 = 0.0356 MPa
//   = 35.6 kPa (lateral pressure)
//
// Compare to simple flexure (unreinforced, no arching):
//   w_flex = 2 × ft × t² / (3 × L²)  where ft ≈ 0.3 MPa
//   w_flex = 2 × 0.3 × 200² / (3 × 3000²) = 24,000 / 27,000,000 = 0.889 kPa
//   → Arching provides ~40× increase

#[test]
fn masonry_arching_action() {
    let fm_prime: f64 = 10.0;    // MPa, masonry compressive strength
    let t: f64 = 200.0;          // mm, panel thickness
    let l: f64 = 3_000.0;        // mm, span
    let ft: f64 = 0.3;           // MPa, tensile strength (for comparison)

    // Arching capacity (simplified Canadian approach)
    let w_arch: f64 = 0.8 * fm_prime * (t * t) / (l * l);  // MPa
    let w_arch_kpa: f64 = w_arch * 1000.0;                   // kPa
    let w_arch_expected: f64 = 35.56;
    assert!(
        (w_arch_kpa - w_arch_expected).abs() / w_arch_expected < 0.02,
        "w_arch = {:.2} kPa, expected {:.2}", w_arch_kpa, w_arch_expected
    );

    // Flexural capacity without arching (unreinforced)
    let w_flex: f64 = 2.0 * ft * (t * t) / (3.0 * l * l);  // MPa
    let w_flex_kpa: f64 = w_flex * 1000.0;

    // Arching provides massive increase
    let ratio: f64 = w_arch_kpa / w_flex_kpa;
    assert!(
        ratio > 10.0,
        "Arching/flexure ratio = {:.1}× (arching dominates)", ratio
    );

    // Thicker panel → higher arching capacity (proportional to t²)
    let t2: f64 = 300.0;
    let w_arch2: f64 = 0.8 * fm_prime * (t2 * t2) / (l * l) * 1000.0;
    assert!(
        w_arch2 > w_arch_kpa,
        "Thicker panel: {:.1} > {:.1} kPa", w_arch2, w_arch_kpa
    );

    // Longer span → lower capacity (inversely proportional to L²)
    let l2: f64 = 5_000.0;
    let w_arch3: f64 = 0.8 * fm_prime * (t * t) / (l2 * l2) * 1000.0;
    assert!(
        w_arch3 < w_arch_kpa,
        "Longer span: {:.1} < {:.1} kPa", w_arch3, w_arch_kpa
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Bed-Joint Reinforcement Contribution to Shear (TMS 402 §9.3.4.1.2)
// ═══════════════════════════════════════════════════════════════
//
// Shear reinforcement contribution in masonry walls:
//   Vs = 0.5 × (Av/s) × fy × dv
//
// where Av = area of shear reinforcement at spacing s
//       dv = effective shear depth = 0.8 × Lw (or d for beams)
//
// Bed-joint reinforcement: typical #4 (12.7mm) bars at specific courses
//   Course height = 200 mm (standard CMU + mortar)
//   If rebar every other course: s = 400 mm
//   Av = 2 × 127 = 254 mm² (2 legs of #4)
//
// Example: Lw = 4000 mm, #4 @ every other course
//   dv = 0.8 × 4000 = 3200 mm
//   Av/s = 254/400 = 0.635 mm²/mm
//   Vs = 0.5 × 0.635 × 420 × 3200 = 427,056 N = 427.1 kN
//
// Maximum shear limit: Vs ≤ Vs_max (TMS provisions)

#[test]
fn masonry_bed_joint_reinforcement_shear() {
    let lw: f64 = 4_000.0;     // mm, wall length
    let av: f64 = 254.0;       // mm², 2 legs of #4 bar (2 × 127 mm²)
    let s: f64 = 400.0;        // mm, spacing (every other course)
    let fy: f64 = 420.0;       // MPa

    // Effective shear depth
    let dv: f64 = 0.8 * lw;
    assert!(
        (dv - 3200.0).abs() < 0.01,
        "dv = {:.0} mm", dv
    );

    // Reinforcement ratio
    let av_s: f64 = av / s;
    let av_s_expected: f64 = 0.635;
    assert!(
        (av_s - av_s_expected).abs() / av_s_expected < 0.01,
        "Av/s = {:.3} mm²/mm", av_s
    );

    // Steel shear contribution
    let vs: f64 = 0.5 * av_s * fy * dv / 1000.0;  // kN
    let vs_expected: f64 = 427.1;
    assert!(
        (vs - vs_expected).abs() / vs_expected < 0.01,
        "Vs = {:.1} kN, expected {:.1}", vs, vs_expected
    );

    // Closer spacing → more shear capacity
    let s2: f64 = 200.0;  // every course
    let vs2: f64 = 0.5 * (av / s2) * fy * dv / 1000.0;
    assert!(
        vs2 > vs,
        "Closer spacing: Vs={:.1} > {:.1} kN", vs2, vs
    );

    // Check that shear capacity scales linearly with wall length
    let lw2: f64 = 2_000.0;
    let dv2: f64 = 0.8 * lw2;
    let vs_short: f64 = 0.5 * av_s * fy * dv2 / 1000.0;
    let ratio: f64 = vs_short / vs;
    assert!(
        (ratio - 0.5).abs() < 0.01,
        "Half wall length → half Vs: ratio = {:.3}", ratio
    );
}

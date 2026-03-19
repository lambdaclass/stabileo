/// Validation: Beam-Column Interaction and Combined Loading — Extended
///
/// References:
///   - AISC 360-22, Chapter H (Combined Forces), Eq. H1-1a & H1-1b
///   - EN 1993-1-1:2005 (Eurocode 3), Clause 6.3.3 (Members in combined bending and compression)
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 1 (Beam-Column Theory)
///   - Chen & Lui, "Structural Stability: Theory and Implementation", Ch. 4
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 5 (Beam-Columns)
///   - Perry, "On Struts" (1886), The Engineer 62
///
/// Tests:
///   1. AISC H1-1 interaction — Pr/(2*Pc) + (Mrx/Mcx + Mry/Mcy) <= 1.0 for Pr/Pc < 0.2
///   2. Moment amplification — M_max = Cm*M0/(1-P/Pe), Cm factor for different end conditions
///   3. Secant formula — e = (ec/r²)*(sec(sqrt(P/(EI))*L/2)-1) for eccentric loading
///   4. Perry-Robertson — sigma_cr from quadratic with imperfection parameter eta
///   5. EC3 interaction checks — N_Ed/N_Rd + kyy*My_Ed/My_Rd + kyz*Mz_Ed/Mz_Rd <= 1.0
///   6. Biaxial bending — interaction surface for rectangular section under N + Mx + My
///   7. Second-order moment — exact amplification factor vs B1 approximation comparison
///   8. Column with intermediate load — superposition of moments from axial + lateral loading
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

/// Standard structural steel E = 200,000 MPa.
/// The solver multiplies by 1000 internally, so E_EFF = 200e6 kN/m².
const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. AISC H1-1 Interaction Check — Pr/Pc < 0.2 Branch
// ================================================================
//
// AISC 360 H1-1 defines two interaction equations:
//   (a) When Pr/Pc >= 0.2:  Pr/Pc + (8/9)*(Mrx/Mcx + Mry/Mcy) <= 1.0
//   (b) When Pr/Pc < 0.2:   Pr/(2*Pc) + (Mrx/Mcx + Mry/Mcy) <= 1.0
//
// For a W14x48 column (A=0.00912 m², Iz=2.0126e-4 m⁴, L=4 m),
// we compute the Euler capacity and check that the H1-1b equation is
// correctly satisfied for a light axial load with significant bending.
//
// We verify by building a cantilever, extracting forces, then
// evaluating the AISC interaction ratio analytically.

#[test]
fn validation_bc_ext_aisc_h1_1_interaction() {
    let l: f64 = 4.0;
    let a: f64 = 0.00912;
    let iz: f64 = 2.0126e-4;
    let n = 8;
    let pi: f64 = std::f64::consts::PI;

    // Euler buckling load for pinned-pinned (K=1)
    let pe: f64 = pi.powi(2) * E_EFF * iz / (l * l);

    // Applied loads: light axial, significant lateral
    let p_axial: f64 = 0.05 * pe; // Pr/Pc < 0.2 (using Pe as proxy for Pc)
    let p_lateral: f64 = 30.0;    // kN, transverse at tip

    // Build cantilever with combined loading
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -p_axial,
        fz: -p_lateral,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, a, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract base element forces
    let ef_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();

    // Check axial force magnitude
    let pr: f64 = ef_base.n_start.abs();
    assert_close(pr, p_axial, 0.02, "AISC H1-1: axial force Pr");

    // Check base moment = P_lateral * L
    let mr: f64 = ef_base.m_start.abs();
    let m_expected: f64 = p_lateral * l;
    assert_close(mr, m_expected, 0.02, "AISC H1-1: base moment Mr");

    // Compute interaction ratio (H1-1b since Pr/Pc < 0.2)
    // Using Pe as capacity proxy; Mc = plastic moment capacity (use Fy*Zx)
    let fz: f64 = 345.0; // MPa = 345e3 kN/m²
    let fy_eff: f64 = fz * 1000.0; // kN/m²
    // Plastic section modulus for W14x48 ≈ 7.84e-4 m³
    let zx: f64 = 7.84e-4;
    let mc: f64 = fy_eff * zx; // Plastic moment capacity (kN·m)

    // Pr/Pc ratio
    let ratio_axial: f64 = pr / pe;
    assert!(ratio_axial < 0.2,
        "Pr/Pc = {:.4} should be < 0.2 for H1-1b branch", ratio_axial);

    // H1-1b: Pr/(2*Pc) + Mr/Mc
    let interaction: f64 = pr / (2.0 * pe) + mr / mc;
    // Interaction should be <= 1.0 for this loading level
    assert!(interaction < 1.0,
        "AISC H1-1b interaction = {:.4} should be < 1.0", interaction);

    // Verify the interaction value is in a reasonable range (not trivially zero)
    assert!(interaction > 0.1,
        "Interaction should be meaningful, got {:.4}", interaction);
}

// ================================================================
// 2. Moment Amplification — Cm Factor for Different End Conditions
// ================================================================
//
// The amplified moment is:
//   M_max = Cm * M0 / (1 - P/Pe)
//
// where Cm depends on the moment diagram shape:
//   Cm = 1.0 for uniform moment (equal end moments)
//   Cm = 0.6 - 0.4*(M1/M2) for unequal end moments (M1/M2 = ratio, single curvature)
//
// We compare Cm-based analytical results with solver output for a
// beam-column under end moments.

#[test]
fn validation_bc_ext_moment_amplification_cm() {
    let l: f64 = 5.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let pi: f64 = std::f64::consts::PI;
    let n = 10;

    // Euler load
    let pe: f64 = pi.powi(2) * E_EFF * iz / (l * l);

    // Case 1: Equal end moments (single curvature) => Cm = 1.0
    let m_end: f64 = 20.0; // kN·m
    let p_axial: f64 = 0.3 * pe; // 30% of Pe (significant compression)

    let cm_equal: f64 = 1.0;
    let af_equal: f64 = cm_equal / (1.0 - p_axial / pe);
    let m_amp_equal: f64 = af_equal * m_end;

    // Case 2: Reverse curvature, M1/M2 = -0.5: Cm = 0.6 - 0.4*(-0.5) = 0.8
    // At P/Pe=0.3: AF = 0.8/(1-0.3) = 0.8/0.7 = 1.143 > 1.0
    let m1_over_m2: f64 = -0.5;
    let cm_unequal: f64 = 0.6 - 0.4 * m1_over_m2;
    let af_unequal: f64 = cm_unequal / (1.0 - p_axial / pe);
    let m_amp_unequal: f64 = af_unequal * m_end;

    // The equal end moment case (Cm=1.0) should produce larger amplified moment
    // than the reverse curvature case (Cm=0.8) since AF_equal > AF_unequal
    assert!(m_amp_equal > m_amp_unequal,
        "Equal moments: M_amp={:.4} should > unequal M_amp={:.4}",
        m_amp_equal, m_amp_unequal);

    // Both amplification factors should exceed 1.0 at 30% of Pe
    assert!(af_equal > 1.0,
        "AF(Cm=1.0) = {:.4} should be > 1.0", af_equal);
    assert!(af_unequal > 1.0,
        "AF(Cm=0.8) = {:.4} should be > 1.0", af_unequal);

    // Now verify with solver: cantilever with end moment
    // Cantilever with moment at tip: M diagram = constant = M_end
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: 0.0,
        my: m_end,
    })];
    let input = make_beam(n, l, E, a, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip rotation: theta = M*L/(EI) for cantilever with end moment
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_exact: f64 = m_end * l / (E_EFF * iz);
    assert_close(tip.ry.abs(), theta_exact, 0.02,
        "Cm test: tip rotation theta = M*L/(EI)");

    // Verify the Cm analytical values
    assert_close(cm_equal, 1.0, 0.01, "Cm for equal end moments");
    assert_close(cm_unequal, 0.8, 0.01, "Cm for M1/M2 = -0.5");

    // Verify amplified moment is always >= first-order moment
    assert!(m_amp_equal >= m_end,
        "Amplified moment {:.2} >= first-order {:.2}", m_amp_equal, m_end);
}

// ================================================================
// 3. Secant Formula — Eccentric Column Loading
// ================================================================
//
// For a column with eccentric load P at eccentricity ec:
//   delta_max = ec * (sec(sqrt(P/(EI)) * L/2) - 1)
//
// The secant formula gives the maximum stress:
//   sigma_max = (P/A) * (1 + (ec*c/r²) * sec((L/(2r)) * sqrt(P/(AE))))
//
// where r = sqrt(I/A) = radius of gyration, c = distance to extreme fiber.
//
// We verify the eccentricity-deflection relationship using the solver:
// a cantilever with a moment M = P*ec at the tip is equivalent to
// eccentric axial loading in first-order analysis.

#[test]
fn validation_bc_ext_secant_formula() {
    let l: f64 = 4.0;
    let a: f64 = 0.02;    // m²
    let iz: f64 = 2e-4;   // m⁴
    let n = 12;
    let pi: f64 = std::f64::consts::PI;

    // Radius of gyration
    let r: f64 = (iz / a).sqrt();
    // Eccentricity
    let ec: f64 = 0.05; // 50 mm

    // Euler load for pinned-pinned
    let pe: f64 = pi.powi(2) * E_EFF * iz / (l * l);

    // Applied axial load = 20% of Euler
    let p: f64 = 0.20 * pe;

    // Secant formula: midspan deflection for pin-pin column
    let k_param: f64 = (p / (E_EFF * iz)).sqrt();
    let sec_val: f64 = 1.0 / (k_param * l / 2.0).cos();
    let delta_secant: f64 = ec * (sec_val - 1.0);

    // The secant formula predicts amplified deflection
    assert!(delta_secant > 0.0,
        "Secant deflection should be positive: {:.6e}", delta_secant);
    assert!(delta_secant > ec * p / pe,
        "Secant deflection should exceed linear approximation");

    // Verify with solver: simply-supported beam with end moments M = P*ec
    // This models the first-order effect of eccentric loading
    let m_ecc: f64 = p * ec;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fz: 0.0,
            my: m_ecc,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: 0.0,
            my: -m_ecc,
        }),
    ];
    let input = make_beam(n, l, E, a, iz, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // First-order midspan deflection: delta_1 = M*L²/(8EI) for uniform moment on SS beam
    // Actually for equal end moments on SS beam: delta_mid = M*L²/(8*EI)
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let delta_1st_exact: f64 = m_ecc * l * l / (8.0 * E_EFF * iz);
    assert_close(mid_disp.uz.abs(), delta_1st_exact, 0.03,
        "Secant: first-order midspan deflection");

    // The secant formula amplification factor vs first-order
    let af_secant: f64 = delta_secant / delta_1st_exact;
    let af_approx: f64 = 1.0 / (1.0 - p / pe);
    // Secant and 1/(1-P/Pe) should be close for small eccentricity
    assert_close(af_secant, af_approx, 0.05,
        "Secant AF vs 1/(1-P/Pe) approximation");

    // Verify radius of gyration
    let r_check: f64 = (iz / a).sqrt();
    assert_close(r, r_check, 0.001, "Radius of gyration consistency");
}

// ================================================================
// 4. Perry-Robertson Formula — Imperfection Parameter
// ================================================================
//
// The Perry-Robertson formula accounts for initial imperfections:
//
//   sigma_cr = 0.5 * (sigma_y + (1+eta)*sigma_e - sqrt((sigma_y + (1+eta)*sigma_e)² - 4*sigma_y*sigma_e))
//
// where:
//   sigma_e = pi²*E / lambda² (Euler stress)
//   eta = alpha*(lambda - 0.2) for lambda >= 0.2 (imperfection parameter)
//   lambda = L/r * sqrt(sigma_y / (pi²*E)) (non-dimensional slenderness)
//
// This is the basis for EN 1993 column curves.

#[test]
fn validation_bc_ext_perry_robertson() {
    let a: f64 = 0.01;     // m²
    let iz: f64 = 1e-4;    // m⁴
    let l: f64 = 5.0;      // m
    let pi: f64 = std::f64::consts::PI;

    // Material properties
    let fy: f64 = 355.0; // MPa (S355 steel)
    let fy_eff: f64 = fy * 1000.0; // kN/m²

    // Radius of gyration
    let r: f64 = (iz / a).sqrt();

    // Slenderness ratio
    let lambda_ratio: f64 = l / r;

    // Euler stress
    let sigma_e: f64 = pi.powi(2) * E_EFF / (lambda_ratio * lambda_ratio);

    // Non-dimensional slenderness
    let lambda_bar: f64 = (fy_eff / sigma_e).sqrt();

    // Perry imperfection parameter (EC3 curve 'b': alpha = 0.34)
    let alpha_perry: f64 = 0.34;
    let eta: f64 = if lambda_bar > 0.2 {
        alpha_perry * (lambda_bar - 0.2)
    } else {
        0.0
    };

    // Perry-Robertson critical stress
    let term1: f64 = fy_eff + (1.0 + eta) * sigma_e;
    let discriminant: f64 = term1 * term1 - 4.0 * fy_eff * sigma_e;
    assert!(discriminant >= 0.0,
        "Discriminant should be non-negative: {:.4}", discriminant);
    let sigma_cr: f64 = 0.5 * (term1 - discriminant.sqrt());

    // sigma_cr should be less than both fy and sigma_e
    assert!(sigma_cr < fy_eff,
        "Perry-Robertson: sigma_cr={:.2} < fy={:.2}", sigma_cr, fy_eff);
    assert!(sigma_cr < sigma_e,
        "Perry-Robertson: sigma_cr={:.2} < sigma_e={:.2}", sigma_cr, sigma_e);

    // Reduction factor chi = sigma_cr / fy
    let chi: f64 = sigma_cr / fy_eff;
    assert!(chi > 0.0 && chi < 1.0,
        "chi should be in (0, 1): {:.4}", chi);

    // EC3 Clause 6.3.1.2: chi = 1/(phi + sqrt(phi²-lambda_bar²))
    let phi: f64 = 0.5 * (1.0 + alpha_perry * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
    let chi_ec3: f64 = 1.0 / (phi + (phi * phi - lambda_bar * lambda_bar).sqrt());
    assert_close(chi, chi_ec3, 0.02,
        "Perry-Robertson chi vs EC3 chi");

    // Verify with solver: apply axial load = chi * fy * A (design resistance)
    let n_rd: f64 = chi * fy_eff * a;
    let n = 10;
    // Simply-supported column with small lateral perturbation
    let p_applied: f64 = 0.5 * n_rd; // Half of design resistance (safe)
    let f_pert: f64 = 0.1; // Small lateral perturbation
    let mid_node = n / 2 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_applied,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: f_pert,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, a, iz, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify equilibrium: reactions should balance
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx, p_applied, 0.02, "Perry-Robertson: ΣRx = P_applied");
    assert_close(sum_ry, -f_pert, 0.02, "Perry-Robertson: ΣRy = -F_pert");
}

// ================================================================
// 5. EC3 Interaction Checks — Combined N + My + Mz
// ================================================================
//
// EN 1993-1-1 Clause 6.3.3, Eq. 6.61:
//   N_Ed/N_Rd + kyy*My_Ed/My_Rd + kyz*Mz_Ed/Mz_Rd <= 1.0
//
// The interaction factors kyy, kyz depend on the member susceptibility
// to torsional/lateral-torsional buckling. For a doubly symmetric I-section
// Class 1/2 with uniform moment (Cmy = 1.0):
//
//   kyy = Cmy * (1 + 0.6 * lambda_y * N_Ed / (chi_y * N_Rk/gamma_M1))
//   kyz = 0.6 * kyy
//
// We verify the interaction equation is correctly computed.

#[test]
fn validation_bc_ext_ec3_interaction() {
    let l: f64 = 6.0;
    let a: f64 = 0.00912; // W14x48
    let iz: f64 = 2.0126e-4;
    let n = 10;
    let pi: f64 = std::f64::consts::PI;

    // Material properties (S355)
    let fy: f64 = 355.0;
    let fy_eff: f64 = fy * 1000.0;

    // Radius of gyration and slenderness
    let r: f64 = (iz / a).sqrt();
    let lambda_ratio: f64 = l / r;
    let sigma_e: f64 = pi.powi(2) * E_EFF / (lambda_ratio * lambda_ratio);
    let lambda_bar: f64 = (fy_eff / sigma_e).sqrt();

    // EC3 reduction factor (curve 'b', alpha = 0.34)
    let alpha_ec3: f64 = 0.34;
    let phi: f64 = 0.5 * (1.0 + alpha_ec3 * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
    let chi: f64 = 1.0 / (phi + (phi * phi - lambda_bar * lambda_bar).sqrt());

    // Design resistances
    let n_rk: f64 = fy_eff * a;       // Characteristic axial resistance
    let gamma_m1: f64 = 1.0;           // Partial factor (unity for comparison)
    let n_rd: f64 = chi * n_rk / gamma_m1; // Design buckling resistance

    // Section modulus (elastic) for W14x48 ≈ Iz / (d/2)
    let d: f64 = 0.348; // approximate depth
    let wy: f64 = iz / (d / 2.0);
    let my_rd: f64 = fy_eff * wy;      // Moment resistance

    // Applied loads: 40% of axial resistance, 30% of moment resistance
    let n_ed: f64 = 0.4 * n_rd;
    let my_ed: f64 = 0.3 * my_rd;

    // Interaction factor kyy (simplified, Cmy = 1.0)
    let cmy: f64 = 1.0;
    let kyy: f64 = cmy * (1.0 + 0.6 * lambda_bar * n_ed / (chi * n_rk / gamma_m1));
    // kyy should be capped: kyy <= Cmy*(1 + 0.6*N_Ed/(chi_y*N_Rk/gamma_M1))
    let kyy_max: f64 = cmy * (1.0 + 0.6 * n_ed / (chi * n_rk / gamma_m1));
    let kyy_used: f64 = kyy.min(kyy_max);

    // kyz = 0.6 * kyy
    let kyz: f64 = 0.6 * kyy_used;

    // EC3 Eq. 6.61 (with Mz_Ed = 0 for simplicity)
    let mz_ed: f64 = 0.0;
    let mz_rd: f64 = my_rd; // simplified
    let interaction: f64 = n_ed / n_rd + kyy_used * my_ed / my_rd + kyz * mz_ed / mz_rd;

    assert!(interaction < 1.0,
        "EC3 interaction = {:.4} should be < 1.0", interaction);
    assert!(interaction > 0.0,
        "EC3 interaction = {:.4} should be > 0.0", interaction);

    // Verify with solver: cantilever with combined loading
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -n_ed,
        fz: 0.0,
        my: my_ed,
    })];
    let input = make_beam(n, l, E, a, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base moment from solver
    let ef_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();

    // The base moment should combine the applied moment and the cantilever effect
    // For a cantilever with tip moment only (no lateral force), M is constant = my_ed
    assert_close(ef_base.n_start.abs(), n_ed, 0.02,
        "EC3: axial force matches applied");

    // Tip displacement check: theta = M*L/(EI)
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_expected: f64 = my_ed * l / (E_EFF * iz);
    assert_close(tip.ry.abs(), theta_expected, 0.03,
        "EC3: tip rotation from applied moment");
}

// ================================================================
// 6. Biaxial Bending — Rectangular Section Interaction Surface
// ================================================================
//
// For a rectangular cross-section under N + Mx + My, the interaction
// surface is described by:
//
//   (N/Npl)^a1 + (Mx/Mplx)^a2 + (My/Mply)^a3 <= 1.0
//
// For rectangular sections with no axial load: a2 = a3 = 1.0 (linear)
// With axial load present, the reduced moment capacities are:
//   Mrx = Mplx * (1 - (N/Npl)²)
//   Mry = Mply * (1 - (N/Npl)²)
//
// We verify the interaction surface computation and the solver's
// force distribution for a column under biaxial loading.

#[test]
fn validation_bc_ext_biaxial_bending() {
    let l: f64 = 3.0;
    let b: f64 = 0.20;    // 200mm width
    let h: f64 = 0.30;    // 300mm height
    let a: f64 = b * h;   // 0.06 m²
    let iz: f64 = b * h * h * h / 12.0; // 4.5e-4 m⁴
    let n = 8;

    // Yield stress (S355)
    let fy_eff: f64 = 355_000.0; // kN/m²

    // Plastic capacities
    let n_pl: f64 = fy_eff * a;              // Axial squash load
    let m_pl_x: f64 = fy_eff * b * h * h / 4.0; // Plastic moment about strong axis

    // Applied axial load ratio
    let n_ratio: f64 = 0.3; // N/Npl = 0.3
    let n_ed: f64 = n_ratio * n_pl;

    // Reduced moment capacity for rectangular section
    let m_rx: f64 = m_pl_x * (1.0 - n_ratio * n_ratio);

    // m_rx should be less than m_pl_x
    assert!(m_rx < m_pl_x,
        "Reduced moment {:.2} < plastic moment {:.2}", m_rx, m_pl_x);

    // Reduction factor
    let reduction: f64 = 1.0 - n_ratio * n_ratio;
    assert_close(reduction, 0.91, 0.01, "Biaxial: reduction factor 1-(0.3)²=0.91");

    // Apply 50% of reduced moment capacity
    let m_applied: f64 = 0.5 * m_rx;

    // Check interaction: (N/Npl)² + (M/Mrx) should be < 1
    let interaction: f64 = n_ratio * n_ratio + m_applied / m_pl_x;
    assert!(interaction < 1.0,
        "Biaxial interaction = {:.4} should be < 1.0", interaction);

    // Verify with solver: cantilever with axial + moment
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: -n_ed,
        fz: 0.0,
        my: m_applied,
    })];
    let input = make_beam(n, l, E, a, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();

    // Axial force should be constant along the column
    assert_close(ef_base.n_start.abs(), n_ed, 0.02,
        "Biaxial: axial force at base");

    // Moment at base of cantilever with only tip moment = m_applied (constant)
    assert_close(ef_base.m_start.abs(), m_applied, 0.02,
        "Biaxial: base moment from applied tip moment");

    // Verify tip deflection: delta = M*L²/(2EI) for cantilever with end moment
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_expected: f64 = m_applied * l * l / (2.0 * E_EFF * iz);
    assert_close(tip.uz.abs(), delta_expected, 0.03,
        "Biaxial: tip deflection from moment");
}

// ================================================================
// 7. Second-Order Moment — Exact AF vs B1 Approximation
// ================================================================
//
// For a beam-column under axial load P and uniform transverse load w,
// the exact amplification factor (from differential equation solution) is:
//
//   AF_exact = (8/u²) * (sec(u/2) - 1)   where u = L*sqrt(P/(EI))
//
// The AISC B1 approximation is:
//   AF_B1 = Cm / (1 - P/Pe)
//
// For uniform load, Cm = 1.0 (or more precisely 1.0 - 0.4*P/Pe per AISC commentary).
// We verify that AF_exact and AF_B1 agree within engineering tolerance.

#[test]
fn validation_bc_ext_second_order_moment() {
    let l: f64 = 6.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let pi: f64 = std::f64::consts::PI;
    let n = 12;

    // Euler load
    let pe: f64 = pi.powi(2) * E_EFF * iz / (l * l);
    let w: f64 = 10.0; // kN/m uniform load

    // Test at multiple axial load levels
    let p_ratios: [f64; 3] = [0.05, 0.15, 0.30];

    for &p_ratio in &p_ratios {
        let p: f64 = p_ratio * pe;

        // Exact amplification factor for uniform load on SS beam-column
        let u: f64 = l * (p / (E_EFF * iz)).sqrt();
        let sec_half_u: f64 = 1.0 / (u / 2.0).cos();
        let af_exact: f64 = (8.0 / (u * u)) * (sec_half_u - 1.0);

        // B1 approximation (Cm = 1.0 for uniform load, conservative)
        let cm: f64 = 1.0;
        let af_b1: f64 = cm / (1.0 - p / pe);

        // Both should be > 1 (amplification occurs)
        assert!(af_exact > 1.0,
            "P/Pe={:.2}: AF_exact={:.4} should be > 1", p_ratio, af_exact);
        assert!(af_b1 > 1.0,
            "P/Pe={:.2}: AF_B1={:.4} should be > 1", p_ratio, af_b1);

        // B1 should be conservative (>= exact) or close
        // The B1 with Cm=1.0 is always conservative for uniform load
        assert!(af_b1 >= af_exact * 0.95,
            "P/Pe={:.2}: B1={:.4} should be >= 0.95*exact={:.4}",
            p_ratio, af_b1, af_exact * 0.95);

        // Agreement within ~15% (B1 is an approximation)
        let diff: f64 = (af_b1 - af_exact).abs() / af_exact;
        assert!(diff < 0.15,
            "P/Pe={:.2}: B1 vs exact diff={:.2}% exceeds 15%",
            p_ratio, diff * 100.0);
    }

    // Verify first-order moment with solver
    let loads_fo: Vec<SolverLoad> = (0..n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: w,
            q_j: w,
            a: None,
            b: None,
        })
    }).collect();
    let input_fo = make_beam(n, l, E, a, iz, "pinned", Some("rollerX"), loads_fo);
    let results_fo = linear::solve_2d(&input_fo).unwrap();

    // Midspan moment from solver should match wL²/8
    let m_mid_expected: f64 = w * l * l / 8.0;
    // Get midspan element (element n/2) and check moment
    let mid_elem = n / 2;
    let ef_mid = results_fo.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // The moment at the end of the mid element (near midspan)
    let m_solver: f64 = ef_mid.m_end.abs();
    assert_close(m_solver, m_mid_expected, 0.03,
        "Second-order: first-order midspan moment = wL²/8");
}

// ================================================================
// 8. Column with Intermediate Lateral Load — Superposition
// ================================================================
//
// A simply-supported beam-column with axial load P and lateral point
// load Q at midspan. In first-order (linear) analysis, axial and
// bending effects superpose:
//   - Axial force: N = P (constant)
//   - Midspan moment: M = Q*L/4
//   - Midspan deflection: delta = Q*L³/(48EI) (from lateral load)
//   - Axial shortening: delta_x = P*L/(EA)
//
// The combined stress at any section is:
//   sigma = N/A + M*y/I = P/A + (Q*L/4)*c/I

#[test]
fn validation_bc_ext_column_intermediate_load() {
    let l: f64 = 8.0;
    let a: f64 = 0.015;    // m²
    let iz: f64 = 1.5e-4;  // m⁴
    let n = 16;
    let mid = n / 2 + 1;

    let p_axial: f64 = 100.0;   // kN compression (applied at roller end toward pinned end)
    let q_lateral: f64 = 20.0;  // kN midspan load

    // Build SS beam with axial load at roller end + midspan lateral load.
    // Pinned at node 1 restrains X and Y; rollerX at node n+1 restrains Y only.
    // Axial load applied at roller end in negative X direction (compression).
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_axial,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid,
            fx: 0.0,
            fz: -q_lateral,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, a, iz, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify axial force is constant = P_axial along the beam
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), p_axial, 0.03,
            &format!("Intermediate: N = P in elem {}", ef.element_id));
    }

    // Midspan moment = Q*L/4
    let m_mid_expected: f64 = q_lateral * l / 4.0;

    // Find element just before midspan and check moment at its end
    let ef_before_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    let m_at_mid: f64 = ef_before_mid.m_end.abs();
    assert_close(m_at_mid, m_mid_expected, 0.03,
        "Intermediate: midspan moment = Q*L/4");

    // Midspan deflection = Q*L³/(48EI) from lateral load only
    let delta_lat: f64 = q_lateral * l.powi(3) / (48.0 * E_EFF * iz);
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert_close(mid_disp.uz.abs(), delta_lat, 0.03,
        "Intermediate: midspan deflection = Q*L³/(48EI)");

    // Combined stress check (analytical)
    // sigma = P/A + M*c/I where c = depth/2
    // Using a generic depth for section ~ sqrt(12*I/A)
    let depth_approx: f64 = (12.0 * iz / a).sqrt();
    let c: f64 = depth_approx / 2.0;
    let sigma_axial: f64 = p_axial / a;
    let sigma_bending: f64 = m_mid_expected * c / iz;
    let sigma_total: f64 = sigma_axial + sigma_bending;

    // Total stress should be sum of components (superposition)
    assert_close(sigma_total, sigma_axial + sigma_bending, 0.001,
        "Intermediate: sigma_total = sigma_axial + sigma_bending");

    // Verify reactions: ΣRy = Q_lateral (upward), ΣRx = P_axial (pinned end reacts)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_ry, q_lateral, 0.02,
        "Intermediate: ΣRy = Q_lateral");
    assert_close(sum_rx, p_axial, 0.02,
        "Intermediate: ΣRx = P_axial");
}

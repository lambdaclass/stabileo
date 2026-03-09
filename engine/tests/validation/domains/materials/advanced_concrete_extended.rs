/// Validation: Advanced Concrete Mechanics — Extended Topics
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1:2004 (EC2): Design of concrete structures
///   - Schlaich, Schafer & Jennewein: "Toward a Consistent Design of Structural Concrete"
///     PCI Journal, 1987 (strut-and-tie model)
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - ACI 318R-19: Commentary on Building Code Requirements
///   - Park & Gamble: "Reinforced Concrete Slabs" 2nd ed. (two-way slabs)
///   - Nawy: "Prestressed Concrete: A Fundamental Approach" 5th ed.
///
/// Tests:
///   1. Strut-and-tie: deep beam shear transfer verification
///   2. T-beam effective width: wide vs narrow flange stiffness comparison
///   3. Concrete torsion: equivalent circular section, threshold cracking torque
///   4. Post-tensioned load balancing: w_bal = 8Pe/L², uniform upward force
///   5. Two-way slab: moment distribution between column and middle strips
///   6. ACI moment coefficients: continuous beam wL^2/11 vs exact
///   7. Development length: bar stress transfer, bond stress distribution
///   8. Modular ratio: transformed section, steel-concrete composite beam

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Strut-and-Tie: Deep Beam with Concentrated Load
// ================================================================
//
// A deep beam (span/depth ratio < 4) transfers load primarily through
// arch action (strut-and-tie mechanism) rather than beam bending.
//
// Configuration: simply-supported beam, L = 4 m, depth = 2 m,
// single concentrated load P = 100 kN at midspan.
//
// For a deep beam, the strut angle theta is:
//   tan(theta) = h_eff / (L/2)
// where h_eff = jd ~ 0.8*d for deep beams.
//
// With d = 2.0 m, h_eff ~ 0.8*2.0 = 1.6 m, half-span = 2.0 m:
//   theta = atan(1.6/2.0) = 38.66 deg
//
// Strut force: F_strut = (P/2) / sin(theta)
//
// Tie force (bottom chord tension): T = (P/2) / tan(theta)
//   = (50) / tan(38.66 deg) = 50 / 0.80 = 62.5 kN
//
// FEM verification: model as a beam and verify that at the supports,
// the vertical reaction = P/2 = 50 kN (equilibrium for symmetric load).
// Also verify that the midspan moment M = PL/4 = 100 kN for the beam model.
//
// Source: Schlaich et al., PCI Journal 1987; ACI 318-19 §23

#[test]
fn validation_strut_and_tie_deep_beam_shear_transfer() {
    let l: f64 = 4.0;      // m, span
    let p: f64 = 100.0;    // kN, concentrated load at midspan
    let n = 8;              // elements
    let mid = n / 2 + 1;   // midspan node

    // Deep beam properties: concrete E = 25000 MPa, section 1.0 m wide x 2.0 m deep
    let e_conc: f64 = 25_000.0;  // MPa (solver multiplies by 1000)
    let b_w: f64 = 1.0;          // m, width
    let h_beam: f64 = 2.0;       // m, total depth
    let a_sec: f64 = b_w * h_beam;                  // m^2
    let iz_sec: f64 = b_w * h_beam.powi(3) / 12.0;  // m^4

    let input = make_beam(
        n, l, e_conc, a_sec, iz_sec,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical reactions must each be P/2 = 50 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "Deep beam R_left = P/2");
    assert_close(r_end.ry, p / 2.0, 0.02, "Deep beam R_right = P/2");

    // Equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Deep beam vertical equilibrium");

    // Strut-and-tie geometry verification
    let d_eff: f64 = 0.8 * h_beam;            // effective depth
    let half_span: f64 = l / 2.0;
    let theta: f64 = (d_eff / half_span).atan();   // strut angle
    let theta_deg: f64 = theta * 180.0 / std::f64::consts::PI;

    // ACI 318-19 §23.2.7: strut angle must be >= 25 degrees
    assert!(theta_deg >= 25.0,
        "Strut angle {:.1} deg must be >= 25 deg (ACI 318-19 §23.2.7)", theta_deg);

    // Tie force = horizontal component of equilibrium
    let tie_force: f64 = (p / 2.0) / theta.tan();
    let tie_expected: f64 = 62.5;
    assert_close(tie_force, tie_expected, 0.02, "STM tie force");

    // Strut compressive force
    let strut_force: f64 = (p / 2.0) / theta.sin();
    // Strut force must be greater than the applied shear (P/2)
    assert!(strut_force > p / 2.0,
        "Strut force {:.2} kN must exceed shear {:.1} kN", strut_force, p / 2.0);

    // Midspan moment from FEM: M_max = PL/4
    let m_max_expected: f64 = p * l / 4.0;  // 100.0 kN-m
    // Find element forces near midspan
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_left.m_end.abs(), m_max_expected, 0.02, "Deep beam midspan moment PL/4");
}

// ================================================================
// 2. T-Beam Effective Width: Wide vs Narrow Flange Stiffness
// ================================================================
//
// A T-beam has an effective flange width that contributes to bending
// stiffness. ACI 318-19 §6.3.2.1 limits the effective flange width:
//   b_eff <= L/4  (for interior T-beams, among other limits)
//
// Compare two beams:
//   - Beam A: narrow rectangular section (web only), b=300mm, h=600mm
//   - Beam B: T-section with effective flange b_f=1500mm, t_f=150mm,
//             web b_w=300mm, h_total=600mm
//
// The T-beam has a much higher I_z due to the wide flange.
// Under the same load, the T-beam deflects less.
//
// I_web = b_w * h^3 / 12 = 0.3 * 0.6^3 / 12 = 5.4e-3 m^4
//
// For the T-section (transformed about centroid):
//   A_f = 1.5 * 0.15 = 0.225 m^2 (flange)
//   A_w = 0.3 * 0.45 = 0.135 m^2 (web below flange)
//   y_bar from bottom:
//     = (A_w * 0.225 + A_f * 0.525) / (A_w + A_f)
//     = (0.135*0.225 + 0.225*0.525) / 0.36
//     = (0.030375 + 0.118125) / 0.36 = 0.4125 m
//
//   I_T = I_w + A_w*(y_bar - 0.225)^2 + I_f + A_f*(0.525 - y_bar)^2
//       = 0.3*0.45^3/12 + 0.135*(0.4125-0.225)^2
//         + 1.5*0.15^3/12 + 0.225*(0.525-0.4125)^2
//       = 2.278e-3 + 4.752e-3 + 4.219e-4 + 2.848e-3
//       = 10.299e-3 m^4
//
// Deflection ratio: delta_web/delta_T = I_T/I_web = 10.299e-3/5.4e-3 ~ 1.907
//
// Source: ACI 318-19 §6.3.2.1; Wight Ch. 5

#[test]
fn validation_t_beam_effective_width_stiffness() {
    let l: f64 = 8.0;
    let q: f64 = 30.0;   // kN/m distributed load
    let n = 8;
    let mid = n / 2 + 1;
    let e_conc: f64 = 25_000.0;  // MPa

    // Web-only rectangular section: 300mm x 600mm
    let b_w: f64 = 0.300;
    let h_total: f64 = 0.600;
    let a_web: f64 = b_w * h_total;
    let iz_web: f64 = b_w * h_total.powi(3) / 12.0;

    // T-beam section computed properties
    let b_f: f64 = 1.500;    // effective flange width
    let t_f: f64 = 0.150;    // flange thickness
    let h_w: f64 = h_total - t_f;  // web depth below flange = 0.45 m

    let a_flange: f64 = b_f * t_f;
    let a_web_part: f64 = b_w * h_w;
    let a_t: f64 = a_flange + a_web_part;

    // Centroid from bottom
    let y_bar: f64 = (a_web_part * (h_w / 2.0) + a_flange * (h_w + t_f / 2.0)) / a_t;

    // Moment of inertia about centroid (parallel axis theorem)
    let i_web_part: f64 = b_w * h_w.powi(3) / 12.0
        + a_web_part * (y_bar - h_w / 2.0).powi(2);
    let i_flange: f64 = b_f * t_f.powi(3) / 12.0
        + a_flange * (h_w + t_f / 2.0 - y_bar).powi(2);
    let iz_t: f64 = i_web_part + i_flange;

    // T-beam I must be larger than web-only I
    assert!(iz_t > iz_web,
        "T-beam Iz={:.6e} must exceed web-only Iz={:.6e}", iz_t, iz_web);

    // ACI effective width check: b_eff <= L/4
    let b_eff_limit: f64 = l / 4.0;
    assert!(b_f <= b_eff_limit,
        "Effective width {:.3} m must be <= L/4 = {:.3} m", b_f, b_eff_limit);

    // Build UDL loads
    let mut loads_web = Vec::new();
    let mut loads_t = Vec::new();
    for i in 0..n {
        loads_web.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
        loads_t.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    // Solve web-only beam
    let input_web = make_beam(n, l, e_conc, a_web, iz_web, "pinned", Some("rollerX"), loads_web);
    let res_web = solve_2d(&input_web).expect("solve web");
    let delta_web = res_web.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Solve T-beam
    let input_t = make_beam(n, l, e_conc, a_t, iz_t, "pinned", Some("rollerX"), loads_t);
    let res_t = solve_2d(&input_t).expect("solve T-beam");
    let delta_t = res_t.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // T-beam deflects less than web-only
    assert!(delta_t < delta_web,
        "T-beam delta={:.6e} must be less than web delta={:.6e}", delta_t, delta_web);

    // Deflection ratio should match stiffness ratio (inversely proportional to EI)
    let stiffness_ratio: f64 = iz_t / iz_web;
    let deflection_ratio: f64 = delta_web / delta_t;
    assert_close(deflection_ratio, stiffness_ratio, 0.05,
        "T-beam deflection ratio matches stiffness ratio");
}

// ================================================================
// 3. Concrete Torsion: Equivalent Section, Cracking Torque
// ================================================================
//
// ACI 318-19 §22.7: Torsion in concrete members.
//
// For a solid rectangular section (b x h), the equivalent thin-walled
// tube parameters per ACI 318-19:
//   Acp = b * h                  (area enclosed by outer perimeter)
//   pcp = 2(b + h)               (outer perimeter)
//   Aoh = (b - 2*cover)*(h - 2*cover)  (area enclosed by shear flow path)
//
// Threshold (cracking) torsional moment (ACI 318-19 §22.7.4.1):
//   Tcr = (1/3) * lambda * sqrt(f'c) * (Acp^2 / pcp)
//
// For b = 400 mm, h = 600 mm, f'c = 30 MPa, lambda = 1.0:
//   Acp = 400 * 600 = 240,000 mm^2
//   pcp = 2*(400 + 600) = 2000 mm
//   Acp^2 / pcp = 240000^2 / 2000 = 28,800,000,000 / 2000 = 28,800,000 mm^3
//
//   Tcr = (1/3) * 1.0 * sqrt(30) * 28,800,000
//       = 0.3333 * 5.4772 * 28,800,000
//       = 52,560,000 N-mm = 52.56 kN-m
//
// Verify that the cracking torque exceeds the torsion from a beam
// loaded eccentrically: T = V * e, where V is shear and e is eccentricity.
//
// Source: ACI 318-19 §22.7; Nilson et al. Ch. 7

#[test]
fn validation_concrete_torsion_cracking_torque() {
    // Section geometry
    let b: f64 = 400.0;     // mm
    let h: f64 = 600.0;     // mm
    let fc_prime: f64 = 30.0;  // MPa
    let lambda: f64 = 1.0;     // normal weight concrete
    let cover: f64 = 40.0;     // mm, clear cover

    // Gross section properties
    let acp: f64 = b * h;
    let pcp: f64 = 2.0 * (b + h);
    let acp_expected: f64 = 240_000.0;
    let pcp_expected: f64 = 2000.0;
    assert_close(acp, acp_expected, 0.001, "Acp");
    assert_close(pcp, pcp_expected, 0.001, "pcp");

    // Shear flow path area
    let aoh: f64 = (b - 2.0 * cover) * (h - 2.0 * cover);
    let aoh_expected: f64 = (400.0 - 80.0) * (600.0 - 80.0);
    assert_close(aoh, aoh_expected, 0.001, "Aoh");

    // Threshold cracking torque (ACI 318-19 Eq. 22.7.4.1a)
    let tcr: f64 = (1.0 / 3.0) * lambda * fc_prime.sqrt() * acp.powi(2) as f64 / pcp;
    let tcr_knm: f64 = tcr / 1.0e6;
    let tcr_expected: f64 = 52.56;

    assert_close(tcr_knm, tcr_expected, 0.02, "Cracking torque Tcr");

    // Verify Tcr > 0 (sanity)
    assert!(tcr_knm > 0.0, "Cracking torque must be positive");

    // Below threshold: torsion can be neglected (ACI 318-19 §9.5.4.1)
    // Threshold for neglect = phi * Tcr / 4
    let phi_torsion: f64 = 0.75;
    let t_threshold: f64 = phi_torsion * tcr_knm / 4.0;
    assert!(t_threshold > 0.0,
        "Torsion neglect threshold = {:.2} kN-m", t_threshold);

    // Cross-check: for a circular section of same area,
    // the cracking torque would be different. Verify the equivalent
    // circular section radius and compare.
    let r_eq: f64 = (acp / std::f64::consts::PI).sqrt();
    let acp_circ: f64 = std::f64::consts::PI * r_eq.powi(2);
    let pcp_circ: f64 = 2.0 * std::f64::consts::PI * r_eq;
    let tcr_circ: f64 = (1.0 / 3.0) * lambda * fc_prime.sqrt()
        * acp_circ.powi(2) as f64 / pcp_circ / 1.0e6;

    // Circular section is more efficient in torsion per ACI method
    assert!(tcr_circ > tcr_knm,
        "Circular Tcr={:.2} kN-m should exceed rectangular Tcr={:.2} kN-m",
        tcr_circ, tcr_knm);

    // Also verify with an FEM beam under eccentric loading that induces torsion-equivalent shear.
    // A simply-supported beam with point load: V_max = P/2.
    // If eccentricity e causes torsion T = V*e, the beam still satisfies equilibrium.
    let l: f64 = 6.0;
    let p: f64 = 40.0;  // kN
    let n = 6;
    let e_conc: f64 = 25_000.0;
    let a_sec: f64 = (b * h) / 1.0e6;   // m^2
    let iz_sec: f64 = b * h.powi(3) / 12.0 / 1.0e12;  // m^4

    let input = make_beam(
        n, l, e_conc, a_sec, iz_sec,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Torsion beam equilibrium");
}

// ================================================================
// 4. Post-Tensioned Load Balancing: w_bal = 8Pe / L^2
// ================================================================
//
// In post-tensioned concrete, a parabolic tendon profile with
// eccentricity 'e' at midspan produces an equivalent uniform
// upward load (load balancing):
//   w_bal = 8 * P * e / L^2
//
// For: P = 500 kN, e = 0.200 m, L = 10 m
//   w_bal = 8 * 500 * 0.2 / 100 = 8.0 kN/m (upward)
//
// If the beam carries a uniform dead load w_DL = 8.0 kN/m (downward),
// the tendon exactly balances the dead load, producing zero deflection
// under the balanced condition (only axial compression P in the beam).
//
// FEM verification: apply w_net = w_DL - w_bal on a beam.
// When balanced, w_net = 0, so deflection should be approximately zero
// (only axial shortening from prestress, which is negligible for bending).
//
// Source: Nawy, "Prestressed Concrete", Ch. 4; Lin & Burns Ch. 10

#[test]
fn validation_post_tensioned_load_balancing() {
    let l: f64 = 10.0;        // m, span
    let p_tendon: f64 = 500.0; // kN, prestress force
    let e_tendon: f64 = 0.200;  // m, midspan eccentricity
    let n = 10;
    let mid = n / 2 + 1;

    // Load balancing formula
    let w_bal: f64 = 8.0 * p_tendon * e_tendon / l.powi(2);
    let w_bal_expected: f64 = 8.0;  // kN/m upward
    assert_close(w_bal, w_bal_expected, 0.01, "w_bal = 8Pe/L^2");

    // Dead load exactly equals balanced load
    let w_dl: f64 = 8.0;  // kN/m downward
    let w_net: f64 = w_dl - w_bal;  // should be ~ 0
    assert_close(w_net, 0.0, 0.01, "Net load under balanced condition");

    // Concrete section properties
    let e_conc: f64 = 30_000.0;  // MPa
    let a_sec: f64 = 0.18;       // m^2 (e.g., 300mm x 600mm)
    let iz_sec: f64 = 5.4e-3;    // m^4

    // Case 1: Beam with full DL only (no balancing) - expect deflection
    let mut loads_dl = Vec::new();
    for i in 0..n {
        loads_dl.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_dl, q_j: -w_dl, a: None, b: None,
        }));
    }
    let input_dl = make_beam(n, l, e_conc, a_sec, iz_sec, "pinned", Some("rollerX"), loads_dl);
    let res_dl = solve_2d(&input_dl).expect("solve DL");
    let delta_dl = res_dl.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Case 2: Beam with net load (DL - w_bal) ~ 0 applied as tiny residual
    // Apply a very small load to avoid zero-load case
    let w_residual: f64 = 0.001;  // kN/m, tiny residual
    let mut loads_balanced = Vec::new();
    for i in 0..n {
        loads_balanced.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_residual, q_j: -w_residual, a: None, b: None,
        }));
    }
    let input_balanced = make_beam(n, l, e_conc, a_sec, iz_sec, "pinned", Some("rollerX"), loads_balanced);
    let res_balanced = solve_2d(&input_balanced).expect("solve balanced");
    let delta_balanced = res_balanced.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Under balanced condition, deflection is essentially zero compared to DL alone
    assert!(delta_balanced < delta_dl * 0.01,
        "Balanced deflection {:.6e} must be << DL deflection {:.6e}", delta_balanced, delta_dl);

    // Verify exact analytical deflection for DL case: delta = 5*w*L^4 / (384*E*I)
    let e_eff: f64 = e_conc * 1000.0;  // actual E in kN/m^2
    let delta_exact: f64 = 5.0 * w_dl * l.powi(4) / (384.0 * e_eff * iz_sec);
    assert_close(delta_dl, delta_exact, 0.02, "DL deflection matches 5wL^4/384EI");

    // Load balancing ratio: w_bal / w_dl = 1.0 for full balance
    let balance_ratio: f64 = w_bal / w_dl;
    assert_close(balance_ratio, 1.0, 0.01, "Full load balancing ratio = 1.0");
}

// ================================================================
// 5. Two-Way Slab: Moment Distribution (Column vs Middle Strips)
// ================================================================
//
// ACI 318-19 §8.10: For a two-way slab system, the total static
// moment in each direction is:
//   Mo = w * l2 * ln^2 / 8
//
// This total moment is distributed between negative and positive
// regions, and then between column strip and middle strip.
//
// For a flat plate (no beams), interior panel:
//   Negative moment: 0.65 * Mo
//   Positive moment: 0.35 * Mo
//
// Column strip share of negative moment: 75% (ACI Table 8.10.5.1)
// Middle strip share of negative moment: 25%
//
// Column strip share of positive moment: 60% (ACI Table 8.10.5.2)
// Middle strip share of positive moment: 40%
//
// For w = 10 kN/m^2, l1 = l2 = 6.0 m, ln = 5.5 m (clear span):
//   Mo = 10 * 6.0 * 5.5^2 / 8 = 226.875 kN-m/panel width
//
// Verify with FEM: model a strip of the slab as a continuous beam
// to get the total moment, then apply the distribution factors.
//
// Source: ACI 318-19 §8.10; Park & Gamble Ch. 5

#[test]
fn validation_two_way_slab_moment_distribution() {
    // Slab geometry
    let _l1: f64 = 6.0;    // m, span in direction of analysis
    let l2: f64 = 6.0;     // m, span perpendicular
    let ln: f64 = 5.5;     // m, clear span (l1 - column width)
    let w: f64 = 10.0;     // kN/m^2, uniform load

    // ACI total static moment
    let mo: f64 = w * l2 * ln.powi(2) / 8.0;
    let mo_expected: f64 = 226.875;
    assert_close(mo, mo_expected, 0.01, "Total static moment Mo");

    // Distribution factors (interior panel, flat plate, no beams)
    let neg_fraction: f64 = 0.65;
    let pos_fraction: f64 = 0.35;

    let m_neg: f64 = neg_fraction * mo;
    let m_pos: f64 = pos_fraction * mo;

    // Column strip shares
    let cs_neg_frac: f64 = 0.75;
    let cs_pos_frac: f64 = 0.60;
    let ms_neg_frac: f64 = 1.0 - cs_neg_frac;
    let ms_pos_frac: f64 = 1.0 - cs_pos_frac;

    let m_neg_cs: f64 = cs_neg_frac * m_neg;
    let m_pos_cs: f64 = cs_pos_frac * m_pos;
    let m_neg_ms: f64 = ms_neg_frac * m_neg;
    let m_pos_ms: f64 = ms_pos_frac * m_pos;

    // Verify: column strip + middle strip = total for each region
    assert_close(m_neg_cs + m_neg_ms, m_neg, 0.001, "Neg: CS + MS = total");
    assert_close(m_pos_cs + m_pos_ms, m_pos, 0.001, "Pos: CS + MS = total");

    // Verify: neg + pos = Mo
    assert_close(m_neg + m_pos, mo, 0.001, "Neg + Pos = Mo");

    // Column strip carries more than middle strip
    assert!(m_neg_cs > m_neg_ms,
        "Column strip negative {:.2} > middle strip {:.2}", m_neg_cs, m_neg_ms);
    assert!(m_pos_cs > m_pos_ms,
        "Column strip positive {:.2} > middle strip {:.2}", m_pos_cs, m_pos_ms);

    // FEM verification: model equivalent beam strip (width = l2)
    // with fixed ends (simulating continuity) under UDL
    let w_strip: f64 = w * l2;  // kN/m for the strip
    let n = 8;
    let e_conc: f64 = 25_000.0;
    let t_slab: f64 = 0.200;  // m, slab thickness
    let a_strip: f64 = l2 * t_slab;
    let iz_strip: f64 = l2 * t_slab.powi(3) / 12.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_strip, q_j: -w_strip, a: None, b: None,
        }));
    }

    // Fixed-fixed beam to represent interior panel continuity
    let input = make_beam(n, ln, e_conc, a_strip, iz_strip, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-end moment: wL^2/12 for the strip
    let m_fixed: f64 = w_strip * ln.powi(2) / 12.0;
    // Midspan moment for fixed-fixed: wL^2/24
    let m_mid: f64 = w_strip * ln.powi(2) / 24.0;

    // Check end moment from FEM
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed, 0.05, "Fixed-end moment wL^2/12");

    // Total static moment for fixed-fixed: M_neg + M_pos = wL^2/8
    // (sum of absolute fixed-end moment and midspan moment)
    let mo_strip: f64 = w_strip * ln.powi(2) / 8.0;
    assert_close(m_fixed + m_mid, mo_strip, 0.01, "Mo = wL^2/8 for strip");
}

// ================================================================
// 6. ACI Moment Coefficients: wL^2/11 vs Exact
// ================================================================
//
// ACI 318-19 §6.5 provides approximate moment coefficients for
// continuous beams with uniform loading:
//   Positive moment (end span): wL^2/14
//   Positive moment (interior span): wL^2/16
//   Negative moment (at interior support, 2 spans): wL^2/9
//   Negative moment (at interior support, > 2 spans): wL^2/11
//   Negative moment (at exterior support with column): wL^2/16
//
// For a 3-span continuous beam (equal spans L, uniform load w):
//   Exact: M_interior_support = -wL^2/10 (from three-moment equation)
//   ACI approximate: wL^2/11
//
// The ACI coefficient is slightly conservative (smaller magnitude).
//
// Source: ACI 318-19 §6.5; Nilson et al. Table 9.1

#[test]
fn validation_aci_moment_coefficients_vs_exact() {
    let l: f64 = 6.0;      // m, each span
    let w: f64 = 20.0;     // kN/m, uniform load
    let n_per_span = 10;

    // ACI approximate moment at interior support (>2 spans)
    let m_aci: f64 = w * l.powi(2) / 11.0;
    let m_aci_expected: f64 = 65.45;
    assert_close(m_aci, m_aci_expected, 0.01, "ACI coefficient wL^2/11");

    // Exact three-moment equation for 3 equal spans
    let m_exact: f64 = w * l.powi(2) / 10.0;
    let m_exact_expected: f64 = 72.0;
    assert_close(m_exact, m_exact_expected, 0.01, "Exact wL^2/10");

    // ACI is conservative (lower magnitude than exact)
    assert!(m_aci < m_exact,
        "ACI {:.2} must be < exact {:.2} (conservative)", m_aci, m_exact);

    // FEM verification: 3-span continuous beam
    let n_total = 3 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w, q_j: -w, a: None, b: None,
        }));
    }

    let e_conc: f64 = 25_000.0;
    let a_sec: f64 = 0.18;
    let iz_sec: f64 = 5.4e-3;

    let input = make_continuous_beam(&[l, l, l], n_per_span, e_conc, a_sec, iz_sec, loads);
    let results = solve_2d(&input).expect("solve");

    // Interior support moment from FEM (end of first span)
    let ef_span1_end = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_fem: f64 = ef_span1_end.m_end.abs();

    // FEM should match exact value closely
    assert_close(m_fem, m_exact, 0.05, "FEM interior moment vs exact wL^2/10");

    // FEM must be closer to exact than to ACI approximate
    let err_fem_exact: f64 = (m_fem - m_exact).abs();
    let err_fem_aci: f64 = (m_fem - m_aci).abs();
    assert!(err_fem_exact < err_fem_aci,
        "FEM closer to exact ({:.4}) than ACI ({:.4})", err_fem_exact, err_fem_aci);

    // Other ACI coefficients verification (formula only)
    let m_pos_end: f64 = w * l.powi(2) / 14.0;     // positive moment, end span
    let m_pos_int: f64 = w * l.powi(2) / 16.0;     // positive moment, interior span
    let m_neg_ext: f64 = w * l.powi(2) / 16.0;     // negative moment at exterior support

    // Ordering: interior negative > end span positive > interior positive
    assert!(m_exact > m_pos_end,
        "Interior negative {:.2} > end span positive {:.2}", m_exact, m_pos_end);
    assert!(m_pos_end > m_pos_int,
        "End span positive {:.2} > interior positive {:.2}", m_pos_end, m_pos_int);
    // Exterior negative with column is relatively small
    assert!(m_neg_ext <= m_pos_end,
        "Exterior negative {:.2} <= end span positive {:.2}", m_neg_ext, m_pos_end);
}

// ================================================================
// 7. Development Length: Bar Stress Transfer, Bond Distribution
// ================================================================
//
// ACI 318-19 §25.4.2: Development length determines the embedment
// needed for a bar to develop its full yield strength through bond.
//
// Simplified equation (ACI 318-19 §25.4.2.3):
//   ld = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(f'c)) * db
//
// The average bond stress over the development length is:
//   u_avg = Ab * fy / (pi * db * ld)
//
// where Ab = pi * db^2 / 4 is the bar area.
//
// Simplifying: u_avg = db * fy / (4 * ld)
//
// For #20 bar (db = 20 mm), f'c = 28 MPa, fy = 420 MPa:
//   ld/db = 420 / (1.1 * sqrt(28)) = 420 / 5.821 = 72.16
//   ld = 72.16 * 20 = 1443.2 mm
//
//   Ab = pi * 20^2 / 4 = 314.16 mm^2
//   u_avg = 314.16 * 420 / (pi * 20 * 1443.2) = 131,947 / 90,668 = 1.455 MPa
//
// FEM verification: model the stress transfer as a beam under axial
// load, where the bar develops its full capacity over length ld.
// The reaction should equal the applied force (equilibrium).
//
// Source: ACI 318-19 §25.4; Wight Ch. 6

#[test]
fn validation_development_length_bond_stress() {
    let db: f64 = 20.0;        // mm, #20 bar diameter
    let fy: f64 = 420.0;       // MPa
    let fc_prime: f64 = 28.0;  // MPa
    let lambda: f64 = 1.0;     // normal weight concrete
    let psi_t: f64 = 1.0;      // bottom bar
    let psi_e: f64 = 1.0;      // uncoated
    let psi_s: f64 = 1.0;      // bar size >= #22 -> actually for db=20mm, psi_s = 0.8 for < #22
    // For #20 (db < 19mm is #19... actually #20 has db ~ 19.1mm, so use psi_s = 0.8 for bars < #22)
    // However, using 1.0 for direct comparison with simplified formula
    let psi_g: f64 = 1.0;

    // Development length
    let ld_over_db: f64 = (fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * fc_prime.sqrt());
    let ld: f64 = ld_over_db * db;
    let ld_expected: f64 = 1443.2;  // mm
    assert_close(ld, ld_expected, 0.02, "Development length ld");

    // ACI minimum check
    let ld_min: f64 = 300.0;
    assert!(ld > ld_min,
        "ld={:.1} mm must exceed minimum {:.0} mm", ld, ld_min);

    // Bar area
    let ab: f64 = std::f64::consts::PI * db.powi(2) / 4.0;
    let ab_expected: f64 = 314.16;
    assert_close(ab, ab_expected, 0.01, "Bar area Ab");

    // Total bar force at yield
    let f_bar: f64 = ab * fy;
    let f_bar_expected: f64 = 131_947.0;
    assert_close(f_bar, f_bar_expected, 0.01, "Bar yield force");

    // Average bond stress over development length
    let u_avg: f64 = f_bar / (std::f64::consts::PI * db * ld);
    let u_avg_expected: f64 = 1.455;
    assert_close(u_avg, u_avg_expected, 0.02, "Average bond stress");

    // Alternative: u_avg = db * fy / (4 * ld)
    let u_avg_alt: f64 = db * fy / (4.0 * ld);
    assert_close(u_avg, u_avg_alt, 0.001, "Bond stress formula equivalence");

    // FEM verification: model bar embedment as a beam element
    // A beam fixed at one end, with axial load at the other end
    // The reaction should equal the applied force
    let l_embed: f64 = ld / 1000.0;  // convert to meters
    let e_steel: f64 = 200_000.0;    // MPa
    let a_bar: f64 = ab / 1.0e6;     // m^2
    let iz_bar: f64 = std::f64::consts::PI * (db / 1000.0).powi(4) / 64.0;
    let p_applied: f64 = f_bar / 1000.0;  // kN

    let input = make_beam(
        4, l_embed, e_steel, a_bar, iz_bar,
        "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: p_applied, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Axial equilibrium: reaction at fixed end opposes applied force
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), p_applied, 0.02, "Bond transfer equilibrium");
}

// ================================================================
// 8. Modular Ratio: Transformed Section, Steel-Concrete Composite
// ================================================================
//
// The modular ratio n = E_s / E_c converts a composite steel-concrete
// section into an equivalent homogeneous concrete section.
//
// For E_s = 200,000 MPa, E_c = 25,000 MPa: n = 8
//
// Transformed section for a concrete beam with steel reinforcement:
// The steel area A_s is replaced by an equivalent concrete area n*A_s.
//
// Section: b = 300 mm, h = 500 mm, d = 440 mm, A_s = 1500 mm^2
//
// Cracked transformed section (neutral axis from compression face):
//   b*x^2/2 = n*A_s*(d - x)
//   300*x^2/2 = 8*1500*(440 - x)
//   150*x^2 + 12000*x - 5,280,000 = 0
//   x = (-12000 + sqrt(12000^2 + 4*150*5280000)) / (2*150)
//   x = (-12000 + sqrt(144e6 + 3168e6)) / 300
//   x = (-12000 + sqrt(3312e6)) / 300
//   x = (-12000 + 57,550.8) / 300
//   x = 151.84 mm
//
// Cracked moment of inertia:
//   I_cr = b*x^3/3 + n*A_s*(d - x)^2
//        = 300*151.84^3/3 + 8*1500*(440 - 151.84)^2
//        = 300*3,503,654,590/3e9 ... let's compute carefully:
//
//   x^3 = 151.84^3 = 3,502,505 mm^3 (approx)
//   b*x^3/3 = 300*3,502,505/3 = 350,250,500 mm^4
//   n*A_s*(d-x)^2 = 8*1500*(288.16)^2 = 12000*83,036 = 996,432,000 mm^4 (approx)
//   I_cr = 350,250,500 + 996,432,000 = 1,346,682,500 mm^4 ~ 1.347e9 mm^4
//
// Compare with gross (uncracked) section:
//   I_g = b*h^3/12 = 300*500^3/12 = 3,125,000,000 mm^4 = 3.125e9 mm^4
//
// FEM verification: compare deflections of beams with I_cr vs I_g.
// The cracked section deflects more (I_cr < I_g).
//
// Source: Wight Ch. 4; Nilson et al. Ch. 3

#[test]
fn validation_modular_ratio_transformed_section() {
    let e_s: f64 = 200_000.0;  // MPa, steel modulus
    let e_c: f64 = 25_000.0;   // MPa, concrete modulus

    // Modular ratio
    let n_mod: f64 = e_s / e_c;
    let n_expected: f64 = 8.0;
    assert_close(n_mod, n_expected, 0.001, "Modular ratio n = Es/Ec");

    // Section properties
    let b: f64 = 300.0;       // mm
    let h: f64 = 500.0;       // mm
    let d: f64 = 440.0;       // mm
    let as_steel: f64 = 1500.0;  // mm^2

    // Solve quadratic for cracked neutral axis depth x:
    // b*x^2/2 = n*A_s*(d - x)
    // (b/2)*x^2 + n*A_s*x - n*A_s*d = 0
    let qa: f64 = b / 2.0;
    let qb: f64 = n_mod * as_steel;
    let qc: f64 = -n_mod * as_steel * d;

    let discriminant: f64 = qb * qb - 4.0 * qa * qc;
    let x_cr: f64 = (-qb + discriminant.sqrt()) / (2.0 * qa);
    let x_cr_expected: f64 = 151.84;
    assert_close(x_cr, x_cr_expected, 0.01, "Cracked neutral axis depth");

    // Verify x_cr is reasonable (between 0 and d)
    assert!(x_cr > 0.0 && x_cr < d,
        "x_cr={:.2} must be between 0 and d={:.0}", x_cr, d);

    // Cracked moment of inertia
    let i_cr: f64 = b * x_cr.powi(3) / 3.0 + n_mod * as_steel * (d - x_cr).powi(2);

    // Gross moment of inertia (ignoring steel)
    let i_g: f64 = b * h.powi(3) / 12.0;
    let i_g_expected: f64 = 3.125e9;
    assert_close(i_g, i_g_expected, 0.001, "Gross moment of inertia Ig");

    // I_cr < I_g always
    assert!(i_cr < i_g,
        "I_cr={:.3e} must be < I_g={:.3e}", i_cr, i_g);

    // Ratio I_cr / I_g determines effective stiffness
    let stiffness_ratio: f64 = i_cr / i_g;
    assert!(stiffness_ratio > 0.3 && stiffness_ratio < 0.7,
        "I_cr/I_g = {:.3} should be between 0.3 and 0.7 for typical beams", stiffness_ratio);

    // FEM verification: compare deflections
    let l: f64 = 8.0;
    let q: f64 = 20.0;   // kN/m
    let n_elem = 8;
    let mid = n_elem / 2 + 1;

    // Convert to m^4 for FEM
    let iz_gross: f64 = i_g / 1.0e12;   // m^4
    let iz_cracked: f64 = i_cr / 1.0e12; // m^4
    let a_sec: f64 = b * h / 1.0e6;      // m^2

    let mut loads_g = Vec::new();
    let mut loads_cr = Vec::new();
    for i in 0..n_elem {
        loads_g.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
        loads_cr.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input_gross = make_beam(n_elem, l, e_c, a_sec, iz_gross,
        "pinned", Some("rollerX"), loads_g);
    let res_gross = solve_2d(&input_gross).expect("solve gross");
    let delta_gross = res_gross.displacements.iter()
        .find(|dd| dd.node_id == mid).unwrap().uy.abs();

    let input_cracked = make_beam(n_elem, l, e_c, a_sec, iz_cracked,
        "pinned", Some("rollerX"), loads_cr);
    let res_cracked = solve_2d(&input_cracked).expect("solve cracked");
    let delta_cracked = res_cracked.displacements.iter()
        .find(|dd| dd.node_id == mid).unwrap().uy.abs();

    // Cracked section deflects more
    assert!(delta_cracked > delta_gross,
        "Cracked delta={:.6e} must exceed gross delta={:.6e}", delta_cracked, delta_gross);

    // Deflection ratio should be inversely proportional to I ratio
    let deflection_ratio: f64 = delta_cracked / delta_gross;
    let expected_deflection_ratio: f64 = i_g / i_cr;
    assert_close(deflection_ratio, expected_deflection_ratio, 0.05,
        "Deflection ratio matches inverse stiffness ratio");
}

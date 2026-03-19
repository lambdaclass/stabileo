/// Validation: Steel Fiber Reinforced Concrete (SFRC) — Extended
///
/// References:
///   - fib Model Code 2010: Chapter 5.6 (Fibre Reinforced Concrete)
///   - ACI 544.4R: Design Considerations for SFRC
///   - EN 14651: Test Method for Metallic Fibre Concrete
///   - RILEM TC 162-TDF: sigma-epsilon Design Method (2003)
///   - Naaman: "High Performance Fiber Reinforced Cement Composites" (2008)
///   - Minelli & Plizzari: "On the Effectiveness of Steel Fibers as Shear Reinforcement" (2013)
///   - ACI 544.1R: State-of-the-Art Report on Fiber Reinforced Concrete
///   - TR34 (Concrete Society, 4th Ed.): Concrete Industrial Ground Floors
///
/// Tests verify SFRC flexural strength, fiber volume fraction effects,
/// residual strength parameters, slab on grade design, tunnel segment
/// ductility, beam stiffness comparison, fiber aspect ratio pullout,
/// and hybrid fiber + rebar reinforcement capacity.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. SFRC Flexural Strength: f_r = 0.62*sqrt(f'c) + fiber contribution
// ================================================================
//
// The modulus of rupture for plain concrete is f_r = 0.62*sqrt(f'c)
// (ACI 318). Steel fibers add a post-cracking contribution proportional
// to the fiber reinforcing index (Vf * L/d).
//
// Naaman model: f_r_sfrc = 0.62*sqrt(f'c) + eta_b * eta_l * tau * Vf * (L/d)
// where eta_b = bond efficiency ~ 0.5 (hooked), eta_l = length efficiency ~ 1.0,
// tau = fiber-matrix bond strength ~ 6.8 MPa.
//
// We model a simply-supported beam using an equivalent cracked EI derived
// from the SFRC flexural strength, and compare midspan deflection to the
// plain concrete beam. Stiffer SFRC beam deflects less.

#[test]
fn sfrc_flexural_strength_fiber_contribution() {
    let fc: f64 = 40.0; // MPa, compressive strength

    // Plain concrete modulus of rupture
    let fr_plain: f64 = 0.62 * fc.sqrt(); // ACI 318, MPa

    // Fiber parameters (hooked steel fibers)
    let vf: f64 = 0.01;        // 1% volume fraction (79 kg/m3)
    let l_f: f64 = 60.0;       // mm, fiber length
    let d_f: f64 = 0.75;       // mm, fiber diameter
    let aspect: f64 = l_f / d_f; // 80
    let eta_b: f64 = 0.5;      // bond efficiency for hooked fibers
    let eta_l: f64 = 1.0;      // length efficiency
    let tau: f64 = 6.8;        // MPa, bond strength

    // SFRC flexural strength (Naaman composite model)
    let fiber_contribution: f64 = eta_b * eta_l * tau * vf * aspect;
    let fr_sfrc: f64 = fr_plain + fiber_contribution;

    // Verify fiber contribution is meaningful
    assert_close(fr_plain, 3.922, 0.01, "plain f_r = 0.62*sqrt(40)");
    assert_close(fiber_contribution, 2.72, 0.01, "fiber contribution");
    assert_close(fr_sfrc, 6.642, 0.01, "SFRC f_r total");

    // Model beams: plain vs SFRC
    // Use E based on ACI: E_c = 4700*sqrt(f'c) MPa
    let ec: f64 = 4700.0 * fc.sqrt(); // ~29725 MPa
    let l: f64 = 6000.0;   // mm span
    let b: f64 = 300.0;    // mm width
    let h: f64 = 500.0;    // mm depth
    let a_sec: f64 = b * h; // mm^2
    let iz_plain: f64 = b * h.powi(3) / 12.0; // mm^4

    // SFRC effective moment of inertia is larger (cracked EI ratio ~ fr_sfrc/fr_plain)
    let stiffness_ratio: f64 = fr_sfrc / fr_plain;
    let iz_sfrc: f64 = iz_plain * stiffness_ratio;

    let n = 4;
    let q = -0.02; // kN/mm (20 kN/m UDL)

    // Plain concrete beam
    let mut loads_plain = Vec::new();
    for i in 0..n {
        loads_plain.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_plain = make_beam(n, l, ec, a_sec, iz_plain, "pinned", Some("rollerX"), loads_plain);
    let res_plain = solve_2d(&input_plain).expect("solve plain");

    // SFRC beam (higher effective Iz)
    let mut loads_sfrc = Vec::new();
    for i in 0..n {
        loads_sfrc.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_sfrc = make_beam(n, l, ec, a_sec, iz_sfrc, "pinned", Some("rollerX"), loads_sfrc);
    let res_sfrc = solve_2d(&input_sfrc).expect("solve sfrc");

    let mid = n / 2 + 1;
    let delta_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let delta_sfrc: f64 = res_sfrc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // SFRC deflects less by the stiffness ratio
    let deflection_ratio: f64 = delta_plain / delta_sfrc;
    assert_close(deflection_ratio, stiffness_ratio, 0.05, "deflection ratio ~ stiffness ratio");
}

// ================================================================
// 2. Fiber Volume Fraction: Vf Effect on Tensile Capacity
// ================================================================
//
// Increasing Vf linearly increases the post-cracking tensile capacity.
// We model three beams with different Vf (0.5%, 1.0%, 1.5%) and verify
// that the effective stiffness scales proportionally, resulting in
// deflections inversely proportional to (1 + alpha * Vf).
//
// Reference: ACI 544.4R, Section 4.4; Naaman (2008) Ch. 5.

#[test]
fn sfrc_fiber_volume_fraction_effect() {
    let fc: f64 = 35.0;
    let ec: f64 = 4700.0 * fc.sqrt();
    let l: f64 = 5000.0;
    let b: f64 = 250.0;
    let h: f64 = 400.0;
    let a_sec: f64 = b * h;
    let iz_base: f64 = b * h.powi(3) / 12.0;

    // Fiber parameters
    let aspect: f64 = 65.0;     // L/d
    let tau: f64 = 6.0;         // MPa bond strength
    let eta: f64 = 0.5;         // combined efficiency

    let vf_values: [f64; 3] = [0.005, 0.010, 0.015]; // 0.5%, 1.0%, 1.5%
    let fr_plain: f64 = 0.62 * fc.sqrt();

    let n = 4;
    let q = -0.015; // kN/mm

    let mut deflections = Vec::new();
    let mut capacities = Vec::new();

    for &vf in &vf_values {
        let fiber_add: f64 = eta * tau * vf * aspect;
        let fr_total: f64 = fr_plain + fiber_add;
        capacities.push(fr_total);

        let ratio: f64 = fr_total / fr_plain;
        let iz_eff: f64 = iz_base * ratio;

        let mut loads = Vec::new();
        for i in 0..n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let input = make_beam(n, l, ec, a_sec, iz_eff, "pinned", Some("rollerX"), loads);
        let res = solve_2d(&input).expect("solve");

        let mid = n / 2 + 1;
        let delta: f64 = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();
        deflections.push(delta);
    }

    // Doubling Vf should roughly double the fiber contribution
    let cap_increase_1_to_2: f64 = capacities[1] - capacities[0];
    let cap_increase_2_to_3: f64 = capacities[2] - capacities[1];
    assert_close(cap_increase_1_to_2, cap_increase_2_to_3, 0.01,
        "linear Vf effect on capacity");

    // Higher Vf => less deflection
    assert!(deflections[0] > deflections[1],
        "Vf=0.5% deflection > Vf=1.0% deflection");
    assert!(deflections[1] > deflections[2],
        "Vf=1.0% deflection > Vf=1.5% deflection");

    // Verify deflection ratio between Vf=0.5% and Vf=1.5%
    // ratio should equal (fr_sfrc_1.5) / (fr_sfrc_0.5) since delta ~ 1/EI_eff
    let expected_ratio: f64 = capacities[2] / capacities[0];
    let actual_ratio: f64 = deflections[0] / deflections[2];
    assert_close(actual_ratio, expected_ratio, 0.05,
        "deflection ratio matches capacity ratio");
}

// ================================================================
// 3. Residual Strength: Post-Crack Residual fR1, fR3
// ================================================================
//
// EN 14651 defines residual strengths from notched beam test:
//   fR,j = 3*Fj*L / (2*b*hsp^2)
//
// fR1 (at CMOD=0.5mm) governs SLS; fR3 (at CMOD=2.5mm) governs ULS.
// fib MC2010 design values:
//   f_Fts = 0.45 * fR1  (serviceability)
//   f_Ftu = fR3 / 3.0   (ultimate, simplified)
//
// We verify the relationship between residual strengths and the
// resulting beam stiffness under service loads.

#[test]
fn sfrc_residual_strength_fr1_fr3() {
    // EN 14651 test geometry
    let l_test: f64 = 500.0;    // mm, span
    let b_test: f64 = 150.0;    // mm, width
    let h_test: f64 = 150.0;    // mm, total height
    let notch: f64 = 25.0;      // mm
    let hsp: f64 = h_test - notch; // 125 mm

    // Test loads at CMOD values (typical 35 kg/m3 hooked fiber)
    let f1_kn: f64 = 16.5;      // kN at CMOD=0.5mm
    let f3_kn: f64 = 14.0;      // kN at CMOD=2.5mm

    // Residual strengths
    let fr1: f64 = 3.0 * f1_kn * 1000.0 * l_test / (2.0 * b_test * hsp * hsp);
    let fr3: f64 = 3.0 * f3_kn * 1000.0 * l_test / (2.0 * b_test * hsp * hsp);

    assert_close(fr1, 5.28, 0.01, "fR1 residual strength");
    assert_close(fr3, 4.48, 0.01, "fR3 residual strength");

    // fib MC2010 design values
    let f_fts: f64 = 0.45 * fr1;
    let f_ftu: f64 = fr3 / 3.0;

    assert_close(f_fts, 2.376, 0.01, "SLS design strength f_Fts");
    assert_close(f_ftu, 1.493, 0.01, "ULS design strength f_Ftu");

    // Classification ratio fR3/fR1 (fib MC2010 classes: a>=0.5, b>=0.7, c>=0.9, d>=1.1)
    let ratio: f64 = fr3 / fr1;
    assert_close(ratio, 0.848, 0.01, "fR3/fR1 ratio");

    // Model effect: beam with f_Fts-based cracked stiffness vs uncracked
    let fc: f64 = 30.0;
    let ec: f64 = 4700.0 * fc.sqrt();
    let l_beam: f64 = 4000.0;
    let b_beam: f64 = 200.0;
    let h_beam: f64 = 350.0;
    let a_sec: f64 = b_beam * h_beam;
    let iz_uncracked: f64 = b_beam * h_beam.powi(3) / 12.0;

    // Cracking moment: M_cr = f_r * I / y_t
    let fr_concrete: f64 = 0.62 * fc.sqrt();
    let fr_total: f64 = fr_concrete + f_fts; // enhanced cracking capacity

    // Effective Iz ratio due to residual strength contribution
    let enhancement: f64 = fr_total / fr_concrete;
    let iz_sfrc: f64 = iz_uncracked * enhancement;

    let n = 4;
    let p = -10.0; // kN midspan point load

    // Uncracked beam
    let input_plain = make_beam(n, l_beam, ec, a_sec, iz_uncracked, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let res_plain = solve_2d(&input_plain).expect("solve plain");

    // SFRC beam
    let input_sfrc = make_beam(n, l_beam, ec, a_sec, iz_sfrc, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1, fx: 0.0, fz: p, my: 0.0,
        })]);
    let res_sfrc = solve_2d(&input_sfrc).expect("solve sfrc");

    let mid = n / 2 + 1;
    let d_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_sfrc: f64 = res_sfrc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let ratio_defl: f64 = d_plain / d_sfrc;
    assert_close(ratio_defl, enhancement, 0.05, "deflection ratio matches enhancement");
}

// ================================================================
// 4. SFRC Slab on Grade: Reduced Thickness vs Plain Concrete
// ================================================================
//
// TR34 (Concrete Society): SFRC slabs on grade can be designed thinner
// than plain concrete due to post-cracking residual strength.
//
// Thickness relationship for same load capacity:
//   h_sfrc / h_plain = sqrt(fr_plain / fr_sfrc)
//
// Westergaard radius of relative stiffness:
//   l = (E*h^3 / (12*(1-mu^2)*k))^0.25
//
// We model two beams on elastic foundation (approximated as simply
// supported with equivalent section) and verify the thickness reduction.

#[test]
fn sfrc_slab_on_grade_thickness_reduction() {
    let fc: f64 = 30.0;
    let ec: f64 = 4700.0 * fc.sqrt(); // MPa

    // Plain concrete slab
    let h_plain: f64 = 200.0;   // mm
    let fr_plain: f64 = 0.7 * fc.sqrt(); // MPa (~3.83)

    // SFRC slab (Re,3 = 0.5 enhancement from fibers)
    let re3: f64 = 0.50;
    let fr_sfrc: f64 = fr_plain * (1.0 + re3); // ~5.75 MPa

    // Required thickness reduction
    // M_capacity proportional to f_r * h^2, so for same M:
    //   fr_plain * h_plain^2 = fr_sfrc * h_sfrc^2
    //   h_sfrc = h_plain * sqrt(fr_plain / fr_sfrc)
    let h_sfrc: f64 = h_plain * (fr_plain / fr_sfrc).sqrt();

    assert_close(h_sfrc, 163.30, 0.01, "SFRC reduced thickness");

    // Verify thickness reduction percentage
    let reduction_pct: f64 = (1.0 - h_sfrc / h_plain) * 100.0;
    assert_close(reduction_pct, 18.35, 0.02, "thickness reduction percentage");

    // Model beams with respective thicknesses, same span & load
    let l: f64 = 4000.0;
    let b: f64 = 1000.0; // 1m strip
    let n = 4;
    let q = -0.025; // kN/mm (25 kN/m)

    // Plain concrete slab section
    let a_plain: f64 = b * h_plain;
    let iz_plain: f64 = b * h_plain.powi(3) / 12.0;

    // SFRC slab section (thinner)
    let a_sfrc: f64 = b * h_sfrc;
    let iz_sfrc: f64 = b * h_sfrc.powi(3) / 12.0;

    let mut loads_plain = Vec::new();
    let mut loads_sfrc = Vec::new();
    for i in 0..n {
        loads_plain.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
        loads_sfrc.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_plain = make_beam(n, l, ec, a_plain, iz_plain, "pinned", Some("rollerX"), loads_plain);
    let input_sfrc = make_beam(n, l, ec, a_sfrc, iz_sfrc, "pinned", Some("rollerX"), loads_sfrc);

    let res_plain = solve_2d(&input_plain).expect("solve plain");
    let res_sfrc = solve_2d(&input_sfrc).expect("solve sfrc");

    let mid = n / 2 + 1;
    let d_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_sfrc: f64 = res_sfrc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // SFRC slab is thinner so deflects more, but moment capacity is equivalent
    // Deflection ratio = Iz_plain / Iz_sfrc = (h_plain/h_sfrc)^3
    let expected_defl_ratio: f64 = (h_plain / h_sfrc).powi(3);
    let actual_defl_ratio: f64 = d_sfrc / d_plain;
    assert_close(actual_defl_ratio, expected_defl_ratio, 0.05,
        "deflection ratio from thickness change");

    // But moment capacity is maintained: fr_sfrc * h_sfrc^2 ~ fr_plain * h_plain^2
    let capacity_plain: f64 = fr_plain * h_plain * h_plain;
    let capacity_sfrc: f64 = fr_sfrc * h_sfrc * h_sfrc;
    assert_close(capacity_sfrc, capacity_plain, 0.01, "moment capacity equivalence");
}

// ================================================================
// 5. Tunnel Segment: Enhanced Ductility from Fibers
// ================================================================
//
// TBM tunnel segments subject to thrust + bending.
// SFRC provides ductility: the ratio of ultimate to cracking moment
// (mu_d = Mu/Mcr) is enhanced by fiber residual strength.
//
// For a segment under combined N and M:
//   sigma = N/A +/- M*y/I
// Fibers allow tension capacity f_Ftu, extending the ductile range.
//
// We model a fixed-fixed beam (simulating a segment between joints)
// and compare stiffness with/without fiber enhancement.

#[test]
fn sfrc_tunnel_segment_ductility() {
    let fc: f64 = 50.0;
    let ec: f64 = 4700.0 * fc.sqrt();

    // Segment geometry
    let b: f64 = 1500.0;        // mm, width
    let h: f64 = 300.0;         // mm, thickness
    let l: f64 = 3000.0;        // mm, segment span (between joints)

    // Section properties
    let a_sec: f64 = b * h;
    let iz: f64 = b * h.powi(3) / 12.0;

    // Ductility: ratio of SFRC to plain cracking moment
    let fr_plain: f64 = 0.62 * fc.sqrt(); // ~4.38 MPa
    let f_ftu: f64 = 2.0;                  // MPa, ULS residual

    // Plain: cracking moment M_cr = fr * I / (h/2)
    let m_cr_plain: f64 = fr_plain * iz / (h / 2.0); // N*mm
    // SFRC: effective cracking with residual
    let m_cr_sfrc: f64 = (fr_plain + f_ftu) * iz / (h / 2.0);

    // Ductility index (moment ratio)
    let ductility: f64 = m_cr_sfrc / m_cr_plain;
    assert_close(ductility, 1.456, 0.02, "ductility index Mu_sfrc/Mu_plain");

    // Model: fixed-fixed beam representing segment
    // Plain segment
    let n = 4;
    let q = -0.05; // kN/mm (50 kN/m representing ground pressure)

    let mut loads_plain = Vec::new();
    let mut loads_sfrc = Vec::new();
    for i in 0..n {
        loads_plain.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
        loads_sfrc.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_plain = make_beam(n, l, ec, a_sec, iz, "fixed", Some("fixed"), loads_plain);
    let res_plain = solve_2d(&input_plain).expect("solve plain segment");

    // SFRC segment with enhanced EI (effective cracked stiffness improvement)
    let iz_sfrc: f64 = iz * ductility;
    let input_sfrc = make_beam(n, l, ec, a_sec, iz_sfrc, "fixed", Some("fixed"), loads_sfrc);
    let res_sfrc = solve_2d(&input_sfrc).expect("solve sfrc segment");

    let mid = n / 2 + 1;
    let d_plain: f64 = res_plain.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_sfrc: f64 = res_sfrc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // SFRC segment deflects less
    assert!(d_sfrc < d_plain, "SFRC segment deflects less than plain");
    let defl_ratio: f64 = d_plain / d_sfrc;
    assert_close(defl_ratio, ductility, 0.05, "deflection reduction matches ductility index");

    // Verify moment at support (fixed-fixed UDL: M_end = qL^2/12)
    let m_end_exact: f64 = q.abs() * l * l / 12.0; // kN*mm
    // Both beams have same load, same supports, so same reactions and moments
    // (changing EI doesn't change moment in a determinate/fixed-fixed beam)
    // Actually for fixed-fixed beam, moments depend on EI only through compatibility
    // but for a single uniform beam, the moment distribution is independent of EI.
    let r_plain = &res_plain.reactions;
    let m_support_plain: f64 = r_plain.iter().map(|r| r.my.abs()).sum::<f64>() / 2.0;
    assert_close(m_support_plain, m_end_exact, 0.05, "support moment qL^2/12");
}

// ================================================================
// 6. SFRC Beam: Comparison with Conventional RC Beam Stiffness
// ================================================================
//
// A conventional RC beam has transformed section moment of inertia
// I_cr based on steel ratio. An SFRC beam uses fiber-enhanced EI.
//
// We compare deflections of two beams:
//   - RC beam: E_c with I_cr = rho_factor * I_gross
//   - SFRC beam: E_c with I_sfrc = (1 + fiber_enhancement) * I_gross_fraction
//
// For equivalent service deflection, we verify the stiffness ratio.

#[test]
fn sfrc_beam_vs_conventional_rc_stiffness() {
    let fc: f64 = 35.0;
    let ec: f64 = 4700.0 * fc.sqrt();

    let b: f64 = 300.0;
    let h: f64 = 600.0;
    let l: f64 = 8000.0;
    let a_sec: f64 = b * h;
    let ig: f64 = b * h.powi(3) / 12.0; // gross moment of inertia

    // Conventional RC beam: cracked section ~0.35 * Ig (typical)
    let cracked_ratio_rc: f64 = 0.35;
    let iz_rc: f64 = ig * cracked_ratio_rc;

    // SFRC beam: residual strength reduces crack depth
    // Effective cracked ratio ~ 0.50 * Ig (fibers bridge cracks)
    let cracked_ratio_sfrc: f64 = 0.50;
    let iz_sfrc: f64 = ig * cracked_ratio_sfrc;

    let n = 8;
    let q = -0.030; // kN/mm (30 kN/m UDL)

    let mut loads_rc = Vec::new();
    let mut loads_sfrc = Vec::new();
    for i in 0..n {
        loads_rc.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
        loads_sfrc.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_rc = make_beam(n, l, ec, a_sec, iz_rc, "pinned", Some("rollerX"), loads_rc);
    let input_sfrc = make_beam(n, l, ec, a_sec, iz_sfrc, "pinned", Some("rollerX"), loads_sfrc);

    let res_rc = solve_2d(&input_rc).expect("solve RC");
    let res_sfrc = solve_2d(&input_sfrc).expect("solve SFRC");

    let mid = n / 2 + 1;
    let d_rc: f64 = res_rc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_sfrc: f64 = res_sfrc.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // SFRC deflects less since higher effective Iz
    assert!(d_sfrc < d_rc, "SFRC deflection < RC deflection");

    // Deflection ratio should equal Iz ratio (for same E, same loading)
    let expected_ratio: f64 = iz_rc / iz_sfrc; // 0.35/0.50 = 0.70
    let actual_ratio: f64 = d_sfrc / d_rc;
    assert_close(actual_ratio, expected_ratio, 0.02,
        "deflection ratio matches Iz ratio");

    // SFRC gives about 30% less deflection
    let reduction_pct: f64 = (1.0 - d_sfrc / d_rc) * 100.0;
    assert_close(reduction_pct, 30.0, 0.05, "SFRC deflection reduction ~30%");

    // Verify exact deflection formula: delta = 5*q*L^4 / (384*E*I)
    // All in consistent units: E in MPa, I in mm^4, q in same force/length as solver, L in mm
    let delta_rc_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * ec * iz_rc);
    assert_close(d_rc, delta_rc_exact, 0.05, "RC deflection matches formula");
}

// ================================================================
// 7. Fiber Aspect Ratio: L/d Effect on Pullout Strength
// ================================================================
//
// The fiber reinforcing index (Vf * L/d) determines the post-cracking
// strength contribution. Higher aspect ratio = more effective per fiber.
//
// We compare three aspect ratios (45, 65, 80) at the same Vf and
// verify the pullout contribution scales linearly with aspect ratio.
//
// Reference: Naaman (2008), ACI 544.1R Table 1.1.

#[test]
fn sfrc_fiber_aspect_ratio_pullout() {
    let fc: f64 = 40.0;
    let ec: f64 = 4700.0 * fc.sqrt();
    let fr_plain: f64 = 0.62 * fc.sqrt();

    let vf: f64 = 0.0075; // 0.75% volume fraction
    let tau: f64 = 6.5;    // MPa, bond strength
    let eta: f64 = 0.50;   // efficiency factor

    let aspect_ratios: [f64; 3] = [45.0, 65.0, 80.0];

    let l: f64 = 5000.0;
    let b: f64 = 250.0;
    let h: f64 = 450.0;
    let a_sec: f64 = b * h;
    let ig: f64 = b * h.powi(3) / 12.0;

    let n = 4;
    let p = -15.0; // kN

    let mut fiber_contributions = Vec::new();
    let mut deflections = Vec::new();

    for &ar in &aspect_ratios {
        let fiber_add: f64 = eta * tau * vf * ar;
        fiber_contributions.push(fiber_add);

        let fr_total: f64 = fr_plain + fiber_add;
        let iz_eff: f64 = ig * (fr_total / fr_plain);

        let input = make_beam(n, l, ec, a_sec, iz_eff, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fz: p, my: 0.0,
            })]);
        let res = solve_2d(&input).expect("solve");

        let mid = n / 2 + 1;
        let delta: f64 = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();
        deflections.push(delta);
    }

    // Fiber contribution scales linearly with aspect ratio
    let ratio_65_45: f64 = fiber_contributions[1] / fiber_contributions[0];
    let expected_65_45: f64 = 65.0 / 45.0;
    assert_close(ratio_65_45, expected_65_45, 0.01,
        "fiber contribution ratio 65/45");

    let ratio_80_45: f64 = fiber_contributions[2] / fiber_contributions[0];
    let expected_80_45: f64 = 80.0 / 45.0;
    assert_close(ratio_80_45, expected_80_45, 0.01,
        "fiber contribution ratio 80/45");

    // Higher aspect ratio => less deflection
    assert!(deflections[0] > deflections[1], "AR=45 deflects more than AR=65");
    assert!(deflections[1] > deflections[2], "AR=65 deflects more than AR=80");

    // Verify specific contribution values
    // contribution = eta * tau * Vf * AR = 0.5 * 6.5 * 0.0075 * AR
    assert_close(fiber_contributions[0], 0.5 * 6.5 * 0.0075 * 45.0, 0.001,
        "AR=45 contribution");
    assert_close(fiber_contributions[1], 0.5 * 6.5 * 0.0075 * 65.0, 0.001,
        "AR=65 contribution");
    assert_close(fiber_contributions[2], 0.5 * 6.5 * 0.0075 * 80.0, 0.001,
        "AR=80 contribution");
}

// ================================================================
// 8. Combined Fiber + Rebar: Hybrid Reinforcement Capacity
// ================================================================
//
// Hybrid reinforcement: conventional rebar + steel fibers.
// Total capacity: M_n = M_rebar + M_fiber
// Fibers allow reduction in minimum rebar while maintaining ductility.
//
// ACI 544.4R approach:
//   M_rebar = As * fy * (d - a/2)
//   M_fiber = sigma_t * b * (h - c) * ((h - c)/2 + c - a/2)
//
// We model two beams: full rebar vs hybrid (reduced rebar + fibers)
// and verify similar overall stiffness.

#[test]
fn sfrc_hybrid_fiber_rebar_capacity() {
    let fc: f64 = 35.0;
    let ec: f64 = 4700.0 * fc.sqrt();

    let b: f64 = 350.0;
    let h: f64 = 600.0;
    let d: f64 = 540.0;
    let l: f64 = 7000.0;

    // Case 1: Conventional RC (full rebar, no fibers)
    let as_full: f64 = 1800.0;  // mm^2
    let fy: f64 = 500.0;        // MPa

    // Rebar moment capacity
    let a_block: f64 = as_full * fy / (0.85 * fc * b);
    let m_rebar_full: f64 = as_full * fy * (d - a_block / 2.0) / 1e6; // kN*m

    // Case 2: Hybrid (reduced rebar + fibers)
    let as_hybrid: f64 = 1200.0; // mm^2 (33% less rebar)
    let f_ftu: f64 = 1.8;        // MPa, residual tensile strength

    // Rebar contribution
    let a_block_h: f64 = as_hybrid * fy / (0.85 * fc * b);
    let m_rebar_hybrid: f64 = as_hybrid * fy * (d - a_block_h / 2.0) / 1e6;

    // Fiber contribution (rectangular stress block in tension zone)
    let c_na: f64 = a_block_h / 0.80; // neutral axis (beta1 ~ 0.80 for 35 MPa)
    let h_tension: f64 = h - c_na;
    let fiber_force: f64 = f_ftu * b * h_tension; // N
    let fiber_lever: f64 = h_tension / 2.0;       // mm from bottom of tension zone centroid
    let m_fiber: f64 = fiber_force * fiber_lever / 1e6; // kN*m

    let m_hybrid_total: f64 = m_rebar_hybrid + m_fiber;

    // Verify moment capacities
    assert_close(m_rebar_full, 453.85, 0.02, "full RC moment capacity");
    assert_close(m_rebar_hybrid, 306.43, 0.02, "hybrid rebar moment");

    // Fiber contribution should make up a significant portion
    let fiber_pct: f64 = m_fiber / m_hybrid_total * 100.0;
    assert!(fiber_pct > 15.0, "Fiber contributes {:.1}% > 15% of hybrid capacity", fiber_pct);

    // Hybrid total should be close to full RC (within ~10%)
    let capacity_ratio: f64 = m_hybrid_total / m_rebar_full;
    assert!(capacity_ratio > 0.85,
        "Hybrid capacity {:.1} kN*m is >{:.0}% of full RC {:.1} kN*m",
        m_hybrid_total, capacity_ratio * 100.0, m_rebar_full);

    // Model beams and compare stiffness
    let a_sec: f64 = b * h;
    let ig: f64 = b * h.powi(3) / 12.0;

    // Effective Iz: proportional to moment capacity (simplified)
    let iz_full: f64 = ig * 0.40; // typical cracked Iz for full RC
    let iz_hybrid: f64 = ig * 0.40 * capacity_ratio; // scaled by capacity ratio

    let n = 8;
    let q = -0.020; // kN/mm

    let mut loads_full = Vec::new();
    let mut loads_hybrid = Vec::new();
    for i in 0..n {
        loads_full.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
        loads_hybrid.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_full = make_beam(n, l, ec, a_sec, iz_full, "pinned", Some("rollerX"), loads_full);
    let input_hybrid = make_beam(n, l, ec, a_sec, iz_hybrid, "pinned", Some("rollerX"), loads_hybrid);

    let res_full = solve_2d(&input_full).expect("solve full RC");
    let res_hybrid = solve_2d(&input_hybrid).expect("solve hybrid");

    let mid = n / 2 + 1;
    let d_full: f64 = res_full.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let d_hybrid: f64 = res_hybrid.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Deflection ratio should match inverse of Iz ratio
    let expected_defl_ratio: f64 = iz_full / iz_hybrid;
    let actual_defl_ratio: f64 = d_hybrid / d_full;
    assert_close(actual_defl_ratio, expected_defl_ratio, 0.03,
        "deflection ratio matches inverse Iz ratio");

    // Hybrid deflection should be reasonably close to full RC
    let defl_increase_pct: f64 = (d_hybrid / d_full - 1.0) * 100.0;
    assert!(defl_increase_pct < 20.0,
        "Hybrid deflection only {:.1}% > full RC (< 20%)", defl_increase_pct);
}

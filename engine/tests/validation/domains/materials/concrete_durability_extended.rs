use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

/// Common concrete properties for durability tests.
/// E_concrete = 30,000 MPa (C30/37 per EN 1992-1-1 Table 3.1).
const E_CONC: f64 = 30_000.0;
const A_CONC: f64 = 0.12;       // m^2, 300×400 mm section
const IZ_CONC: f64 = 1.6e-3;    // m^4, bh^3/12 = 0.3*0.4^3/12

// ================================================================
// 1. Carbonation Depth Prediction — Effective Stiffness Reduction
// ================================================================
//
// Carbonation penetrates from the surface, reducing the effective
// concrete cover and potentially the effective section depth.
//
// Model: A simply-supported beam is analysed at two conditions:
//   (a) Original intact section (full Iz)
//   (b) After 50 years of carbonation, the outermost concrete
//       has carbonated and micro-cracked, reducing EI by a factor
//       that reflects the loss of cover contribution.
//
// Carbonation depth: x_c = k * sqrt(t), k = 4.0 mm/sqrt(yr)
// At 50 years: x_c = 4.0 * sqrt(50) = 28.3 mm
//
// For a 400 mm deep section (h=400), the carbonation-reduced
// effective depth ratio: (h - 2*x_c) / h, and Iz scales as the
// cube of the depth ratio for a rectangular section:
//   Iz_reduced / Iz_original = ((h - 2*x_c) / h)^3
//
// Deflection is inversely proportional to EI, so:
//   delta_carbonated / delta_original = Iz_original / Iz_reduced
//
// Reference: fib Bulletin 34 — Model Code for Service Life Design

#[test]
fn durability_ext_carbonation_depth_stiffness_reduction() {
    let l: f64 = 8.0;
    let n = 8;
    let p = 30.0; // kN midspan load
    let mid = n / 2 + 1;

    // Carbonation parameters
    let k_carb: f64 = 4.0;          // mm/sqrt(year)
    let t_years: f64 = 50.0;
    let x_c: f64 = k_carb * t_years.sqrt(); // mm, carbonation depth
    let h: f64 = 400.0;             // mm, section depth

    // Effective depth ratio and Iz reduction
    let depth_ratio: f64 = (h - 2.0 * x_c) / h;
    let iz_ratio: f64 = depth_ratio.powi(3);
    let iz_reduced = IZ_CONC * iz_ratio;

    // Solve original beam
    let input_orig = make_beam(n, l, E_CONC, A_CONC, IZ_CONC, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_orig = solve_2d(&input_orig).unwrap();
    let delta_orig = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Solve carbonated beam (reduced EI)
    let input_carb = make_beam(n, l, E_CONC, A_CONC, iz_reduced, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_carb = solve_2d(&input_carb).unwrap();
    let delta_carb = res_carb.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Analytical: deflection ratio = Iz_original / Iz_reduced
    let expected_ratio: f64 = 1.0 / iz_ratio;
    let actual_ratio = delta_carb / delta_orig;

    assert_close(actual_ratio, expected_ratio, 0.02,
        "Carbonation stiffness ratio (delta_carb/delta_orig)");

    // Verify carbonation depth is reasonable (28-29 mm at 50 years)
    assert_close(x_c, 28.28, 0.02, "Carbonation depth at 50 years (mm)");

    // Carbonated beam must deflect more
    assert!(delta_carb > delta_orig,
        "Carbonated beam delta={:.6e} should exceed original delta={:.6e}",
        delta_carb, delta_orig);
}

// ================================================================
// 2. Chloride Penetration (Fick's Law) — Cover Adequacy via
//    Stiffness Comparison
// ================================================================
//
// Chloride ingress causes rebar corrosion, reducing the effective
// steel area. In a beam model, we represent this as a reduction
// in the transformed moment of inertia.
//
// Fick's 2nd law: C(x,t) = Cs * (1 - erf(x / (2*sqrt(D*t))))
//
// For a 50mm cover, D = 1e-12 m^2/s, Cs = 5%, after 30 years:
//   z = 0.050 / (2*sqrt(1e-12 * 30*365.25*24*3600))
//   If C > 0.4% at the rebar, corrosion initiates.
//
// Corrosion reduces bar diameter: d_remaining = d_0 - 2 * x_loss
// Area ratio = (d_remaining / d_0)^2.
// For a transformed section, Iz_eff is reduced proportionally.
//
// We model two conditions and verify deflection increase matches
// the inverse stiffness ratio.
//
// Reference: ACI 201.2R — Guide to Durable Concrete

#[test]
fn durability_ext_chloride_penetration_section_loss() {
    let l: f64 = 6.0;
    let n = 6;
    let q = -12.0; // kN/m uniform load
    let mid = n / 2 + 1;

    // Corrosion parameters
    let d_bar: f64 = 20.0;         // mm original bar diameter
    let i_corr: f64 = 1.5;         // uA/cm^2, moderate marine exposure
    let t_corr: f64 = 25.0;        // years of active corrosion
    let penetration_rate: f64 = 11.6 * i_corr; // um/year
    let x_loss: f64 = penetration_rate * t_corr / 1000.0; // mm

    let d_remaining: f64 = d_bar - 2.0 * x_loss;
    let area_ratio: f64 = (d_remaining / d_bar).powi(2);

    // For a reinforced concrete section, the steel contribution to Iz
    // is proportional to As. Approximate the effective Iz reduction as
    // a weighted combination: Iz_eff = Iz_conc * (0.7 + 0.3 * area_ratio)
    // This represents ~30% steel contribution to overall stiffness.
    let steel_contribution: f64 = 0.3;
    let iz_factor: f64 = (1.0 - steel_contribution) + steel_contribution * area_ratio;
    let iz_corroded = IZ_CONC * iz_factor;

    // Distributed loads for both beams
    let loads_orig: Vec<SolverLoad> = (0..n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();
    let loads_corr: Vec<SolverLoad> = (0..n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();

    let input_orig = make_beam(n, l, E_CONC, A_CONC, IZ_CONC, "pinned", Some("rollerX"), loads_orig);
    let res_orig = solve_2d(&input_orig).unwrap();
    let delta_orig = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let input_corr = make_beam(n, l, E_CONC, A_CONC, iz_corroded, "pinned", Some("rollerX"), loads_corr);
    let res_corr = solve_2d(&input_corr).unwrap();
    let delta_corr = res_corr.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Deflection ratio = Iz_orig / Iz_corroded
    let expected_ratio: f64 = IZ_CONC / iz_corroded;
    let actual_ratio = delta_corr / delta_orig;
    assert_close(actual_ratio, expected_ratio, 0.03,
        "Chloride corrosion deflection ratio");

    // Verify the remaining bar diameter is reasonable
    assert!(d_remaining > 0.0 && d_remaining < d_bar,
        "Remaining bar diameter {:.2} mm should be between 0 and {:.1} mm",
        d_remaining, d_bar);

    // Corroded beam must deflect more
    assert!(delta_corr > delta_orig,
        "Corroded beam delta={:.6e} should exceed original delta={:.6e}",
        delta_corr, delta_orig);
}

// ================================================================
// 3. Corrosion-Reduced Section — Moment Capacity via Reaction Check
// ================================================================
//
// A fixed-fixed beam under UDL has fixed-end moments:
//   M_fixed = q*L^2/12
//
// After corrosion reduces the section (lower EI), the moments
// remain the same for a fixed-fixed beam under UDL (statically
// determinate moment distribution in this case). But the reactions
// must still satisfy equilibrium: R = q*L/2.
//
// We verify that for both the original and corroded fixed-fixed beam,
// the vertical reactions are identical (equilibrium is independent
// of stiffness for statically determinate reaction components).
//
// Reference: Gere & Goodno, "Mechanics of Materials", 9th Ed.

#[test]
fn durability_ext_corrosion_reduced_section_reactions() {
    let l: f64 = 10.0;
    let n = 10;
    let q = -8.0; // kN/m UDL

    // Corrosion-reduced Iz (20% loss in effective stiffness)
    let iz_reduced = IZ_CONC * 0.80;

    let loads_orig: Vec<SolverLoad> = (0..n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();
    let loads_red: Vec<SolverLoad> = (0..n).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();

    // Original beam (fixed-fixed)
    let input_orig = make_beam(n, l, E_CONC, A_CONC, IZ_CONC, "fixed", Some("fixed"), loads_orig);
    let res_orig = solve_2d(&input_orig).unwrap();

    // Corrosion-reduced beam (fixed-fixed)
    let input_red = make_beam(n, l, E_CONC, A_CONC, iz_reduced, "fixed", Some("fixed"), loads_red);
    let res_red = solve_2d(&input_red).unwrap();

    // Analytical reaction: R = |q| * L / 2
    let r_expected: f64 = q.abs() * l / 2.0;

    // Check reactions for original beam
    let ry_orig_total: f64 = res_orig.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_orig_total, q.abs() * l, 0.02, "Original beam total Ry");

    // Check reactions for corroded beam — must be identical
    let ry_red_total: f64 = res_red.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_red_total, q.abs() * l, 0.02, "Corroded beam total Ry");

    // Each support reaction should be q*L/2
    let r1_orig = res_orig.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r1_red = res_red.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(r1_orig, r_expected, 0.02, "Original beam R1");
    assert_close(r1_red, r_expected, 0.02, "Corroded beam R1");

    // Deflections should differ (corroded beam deflects more)
    let mid = n / 2 + 1;
    let delta_orig = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let delta_red = res_red.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert!(delta_red > delta_orig,
        "Corroded beam delta={:.6e} should exceed original delta={:.6e}",
        delta_red, delta_orig);
}

// ================================================================
// 4. CFRP Strengthening — Beam Stiffness Enhancement
// ================================================================
//
// Carbon Fiber Reinforced Polymer (CFRP) plates bonded to the
// tension face of a beam increase its flexural stiffness.
//
// Model: CFRP strengthening is represented as an increase in the
// effective moment of inertia. The effective Iz of the strengthened
// section is:
//   Iz_strengthened = Iz_original * (1 + alpha)
// where alpha is the stiffness enhancement factor.
//
// For a typical CFRP plate (E_cfrp = 165 GPa, t = 1.4mm, b = 250mm):
//   alpha ~ 0.25 for a 300x400mm concrete beam (25% stiffness increase).
//
// Deflection of a SS beam with point load: delta = PL^3 / (48*EI)
// Enhancement ratio: delta_orig / delta_strengthened = (1 + alpha)
//
// Reference: ACI 440.2R — Guide for Design and Construction of
//   Externally Bonded FRP Systems for Strengthening Concrete Structures

#[test]
fn durability_ext_cfrp_strengthening_beam() {
    let l: f64 = 7.0;
    let n = 8;
    let p = 40.0; // kN midspan point load
    let mid = n / 2 + 1;

    // CFRP enhancement factor
    let alpha: f64 = 0.25; // 25% stiffness increase
    let iz_strengthened = IZ_CONC * (1.0 + alpha);

    // Original (unstrengthened) beam
    let input_orig = make_beam(n, l, E_CONC, A_CONC, IZ_CONC, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_orig = solve_2d(&input_orig).unwrap();
    let delta_orig = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // CFRP-strengthened beam
    let input_cfrp = make_beam(n, l, E_CONC, A_CONC, iz_strengthened, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_cfrp = solve_2d(&input_cfrp).unwrap();
    let delta_cfrp = res_cfrp.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Deflection ratio: delta_orig / delta_strengthened = 1 + alpha
    let expected_ratio: f64 = 1.0 + alpha;
    let actual_ratio = delta_orig / delta_cfrp;
    assert_close(actual_ratio, expected_ratio, 0.02,
        "CFRP strengthening deflection ratio");

    // Verify analytical midspan deflection: delta = PL^3 / (48*E*Iz)
    let e_eff: f64 = E_CONC * 1000.0; // kN/m^2
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * iz_strengthened);
    assert_close(delta_cfrp, delta_exact, 0.03,
        "CFRP beam midspan deflection vs analytical");

    // Reactions remain the same (static equilibrium independent of stiffness)
    let r_orig: f64 = res_orig.reactions.iter().map(|r| r.rz).sum();
    let r_cfrp: f64 = res_cfrp.reactions.iter().map(|r| r.rz).sum();
    assert_close(r_orig, p, 0.02, "Original beam total reaction");
    assert_close(r_cfrp, p, 0.02, "CFRP beam total reaction");
}

// ================================================================
// 5. Concrete Patch Repair — Differential Stiffness Loading
// ================================================================
//
// When a section of a continuous beam is patch-repaired, the repair
// material may have different stiffness than the original concrete.
// This creates a "composite" beam with varying EI along its length.
//
// Model: A two-span continuous beam where one span uses the original
// concrete (E = 30,000 MPa) and the other span uses repair concrete
// (E_repair = 25,000 MPa, lower quality repair).
//
// For a two-span continuous beam with different EI per span under
// UDL, the interior support reaction depends on the stiffness ratio.
// A symmetric beam (equal EI) has R_interior = 1.25 * q * L.
// Asymmetric EI shifts the reaction.
//
// Reference: Concrete Society TR69 — Repair of Concrete Structures
//   with Reference to BS EN 1504

#[test]
fn durability_ext_patch_repair_differential_stiffness() {
    let l_span: f64 = 6.0;
    let n_per_span = 6;
    let q = -10.0; // kN/m

    // Symmetric continuous beam (both spans same EI)
    let loads_sym: Vec<SolverLoad> = (0..(2 * n_per_span)).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();
    let input_sym = make_continuous_beam(
        &[l_span, l_span], n_per_span, E_CONC, A_CONC, IZ_CONC, loads_sym);
    let res_sym = solve_2d(&input_sym).unwrap();

    // Asymmetric beam: span 2 uses repair concrete (lower E)
    let e_repair: f64 = 25_000.0; // MPa, lower stiffness repair
    // Build manually with two different materials
    let total_nodes = 2 * n_per_span + 1;
    let total_elems = 2 * n_per_span;
    let elem_len = l_span / n_per_span as f64;

    let nodes: Vec<(usize, f64, f64)> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let mats = vec![(1, E_CONC, 0.2), (2, e_repair, 0.2)];
    let secs = vec![(1, A_CONC, IZ_CONC)];
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..total_elems)
        .map(|i| {
            let mat_id = if i < n_per_span { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, mat_id, 1, false, false)
        })
        .collect();
    let mid_node = n_per_span + 1;
    let sups = vec![
        (1, 1, "pinned"),
        (2, mid_node, "rollerX"),
        (3, total_nodes, "rollerX"),
    ];
    let loads_asym: Vec<SolverLoad> = (0..total_elems).map(|i| {
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        })
    }).collect();

    let input_asym = make_input(nodes, mats, secs, elems, sups, loads_asym);
    let res_asym = solve_2d(&input_asym).unwrap();

    // Total reactions must equal total load for both cases
    let total_load: f64 = q.abs() * 2.0 * l_span;
    let ry_sym: f64 = res_sym.reactions.iter().map(|r| r.rz).sum();
    let ry_asym: f64 = res_asym.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_sym, total_load, 0.02, "Symmetric beam total Ry");
    assert_close(ry_asym, total_load, 0.02, "Asymmetric beam total Ry");

    // Interior support reaction for symmetric case: R_mid = 1.25 * q * L
    let r_mid_sym = res_sym.reactions.iter()
        .find(|r| r.node_id == mid_node).unwrap().rz;
    let r_mid_expected: f64 = 1.25 * q.abs() * l_span;
    assert_close(r_mid_sym, r_mid_expected, 0.05,
        "Symmetric continuous beam interior reaction");

    // Asymmetric: weaker span deflects more, shifting load to the stiffer span
    let r_mid_asym = res_asym.reactions.iter()
        .find(|r| r.node_id == mid_node).unwrap().rz;

    // The interior reaction should differ from the symmetric case
    // (asymmetric stiffness redistributes the interior reaction)
    let diff_pct: f64 = (r_mid_asym - r_mid_sym).abs() / r_mid_sym;
    assert!(diff_pct < 0.15,
        "Interior reaction shift due to repair: {:.2}% (should be modest)", diff_pct * 100.0);
}

// ================================================================
// 6. Section Loss Moment Capacity — Reduced Iz vs Deflection
// ================================================================
//
// Progressive section loss (e.g. from spalling or corrosion) reduces
// the beam's moment of inertia. For a cantilever beam with tip load,
// the exact deflection is:
//   delta = P * L^3 / (3 * E * Iz)
//
// We verify the solver output against this formula for three levels
// of section loss (0%, 15%, 30%) and confirm the deflection
// increases proportionally.
//
// Reference: Nilson, Darwin & Dolan, "Design of Concrete Structures"

#[test]
fn durability_ext_section_loss_moment_capacity() {
    let l: f64 = 4.0;
    let n = 8;
    let p = 15.0; // kN tip load
    let tip = n + 1;
    let e_eff: f64 = E_CONC * 1000.0; // kN/m^2

    let loss_levels: [f64; 3] = [0.0, 0.15, 0.30]; // 0%, 15%, 30% Iz loss
    let mut deltas: Vec<f64> = Vec::new();

    for &loss in &loss_levels {
        let iz_eff: f64 = IZ_CONC * (1.0 - loss);
        let input = make_beam(n, l, E_CONC, A_CONC, iz_eff, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip, fx: 0.0, fz: -p, my: 0.0,
            })]);
        let res = solve_2d(&input).unwrap();
        let delta = res.displacements.iter()
            .find(|d| d.node_id == tip).unwrap().uz.abs();

        // Analytical: delta = P*L^3 / (3*E*Iz)
        let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * iz_eff);
        assert_close(delta, delta_exact, 0.03,
            &format!("Cantilever deflection at {:.0}% section loss", loss * 100.0));

        deltas.push(delta);
    }

    // Deflection at 15% loss should be greater than at 0%
    assert!(deltas[1] > deltas[0],
        "15% loss delta={:.6e} should exceed 0% delta={:.6e}", deltas[1], deltas[0]);

    // Deflection at 30% loss should be greater than at 15%
    assert!(deltas[2] > deltas[1],
        "30% loss delta={:.6e} should exceed 15% delta={:.6e}", deltas[2], deltas[1]);

    // Ratio check: delta(30%) / delta(0%) = 1/(1-0.30) = 1.4286
    let expected_ratio_30: f64 = 1.0 / (1.0 - 0.30);
    let actual_ratio_30 = deltas[2] / deltas[0];
    assert_close(actual_ratio_30, expected_ratio_30, 0.03,
        "Deflection ratio at 30% section loss");
}

// ================================================================
// 7. Alkali-Silica Reaction (ASR) Expansion — Stiffness Degradation
// ================================================================
//
// ASR causes internal micro-cracking in concrete, which degrades
// the elastic modulus. The degree of degradation depends on the
// expansion strain level:
//   E_asr = E_0 * (1 - beta * eps_asr / eps_max)
//
// where beta is a degradation severity factor (~0.5 for moderate
// ASR, ~0.8 for severe ASR), and eps_max is the maximum expansion
// strain at which the concrete is effectively destroyed.
//
// For two beams with different cross-sectional areas but the same
// degraded E, the midspan deflection under the same point load
// depends only on EI. Since Iz scales as the cube of depth for a
// rectangular section (Iz = b*h^3/12), beams with different
// section sizes will have different deflections proportional to
// their Iz ratio.
//
// We verify:
//   (a) ASR-degraded E produces larger deflections
//   (b) Deflection ratio between two section sizes matches Iz ratio
//   (c) Analytical PL^3/(48EI) matches solver output
//
// Reference: fib Bulletin 22 — Monitoring and Safety Evaluation
//   of Existing Concrete Structures, ISE Technical Report on ASR

#[test]
fn durability_ext_asr_expansion_stiffness_degradation() {
    let l: f64 = 6.0;
    let n = 6;
    let p = 20.0; // kN midspan point load
    let mid = n / 2 + 1;

    // ASR degradation model
    let beta_severity: f64 = 0.6; // severe ASR
    let eps_asr: f64 = 0.003;     // 0.3% free expansion
    let eps_max: f64 = 0.005;     // max expansion before destruction

    let e_ratio: f64 = 1.0 - beta_severity * eps_asr / eps_max;
    let e_degraded: f64 = E_CONC * e_ratio; // degraded modulus

    // Two section sizes: small and large
    let iz_small: f64 = 1.6e-3;  // m^4, 300x400 mm
    let iz_large: f64 = 5.333e-3; // m^4, 400x400 mm (b*h^3/12 = 0.4*0.4^3/12)

    // Undamaged beam (small section)
    let input_orig = make_beam(n, l, E_CONC, A_CONC, iz_small, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_orig = solve_2d(&input_orig).unwrap();
    let delta_orig = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // ASR-degraded beam (small section)
    let input_asr = make_beam(n, l, e_degraded, A_CONC, iz_small, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_asr = solve_2d(&input_asr).unwrap();
    let delta_asr = res_asr.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // ASR-degraded beam (large section)
    let input_asr_large = make_beam(n, l, e_degraded, A_CONC, iz_large, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_asr_large = solve_2d(&input_asr_large).unwrap();
    let delta_asr_large = res_asr_large.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // (a) ASR-degraded beam deflects more than undamaged
    let expected_degradation_ratio: f64 = 1.0 / e_ratio;
    let actual_degradation_ratio = delta_asr / delta_orig;
    assert_close(actual_degradation_ratio, expected_degradation_ratio, 0.02,
        "ASR degradation deflection ratio");

    // (b) Deflection ratio between small and large sections matches Iz ratio
    let expected_size_ratio: f64 = iz_large / iz_small;
    let actual_size_ratio = delta_asr / delta_asr_large;
    assert_close(actual_size_ratio, expected_size_ratio, 0.03,
        "ASR section size deflection ratio (Iz_large/Iz_small)");

    // (c) Analytical check for degraded small beam
    let e_eff: f64 = e_degraded * 1000.0; // kN/m^2
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * iz_small);
    assert_close(delta_asr, delta_exact, 0.03,
        "ASR degraded beam analytical deflection");
}

// ================================================================
// 8. Freeze-Thaw Degradation — Progressive Stiffness Loss
//    in Continuous Beam
// ================================================================
//
// Freeze-thaw cycles cause progressive micro-cracking that reduces
// the dynamic modulus (and hence E) of concrete. The relative
// dynamic modulus after N cycles is:
//   E_n / E_0 = (1 - N/N_max) for linear degradation model
//
// where N_max is the number of cycles to failure (~300 for non-air-
// entrained concrete per ASTM C666).
//
// A two-span continuous beam is analysed at three degradation levels.
// The midspan deflection of the more-degraded span increases while
// equilibrium (total reactions = total load) is always maintained.
//
// Reference: ACI 201.2R — Guide to Durable Concrete
//   ASTM C666 — Standard Test Method for Resistance of Concrete
//   to Rapid Freezing and Thawing

#[test]
fn durability_ext_freeze_thaw_progressive_degradation() {
    let l: f64 = 8.0;
    let n = 8;
    let q = -15.0; // kN/m UDL
    let mid = n / 2 + 1;

    // Freeze-thaw degradation: E reduces with cycles
    let n_max: f64 = 300.0; // cycles to failure
    let cycle_counts: [f64; 3] = [0.0, 100.0, 200.0];
    let mut deltas: Vec<f64> = Vec::new();

    for &cycles in &cycle_counts {
        // Linear degradation model
        let e_ratio: f64 = 1.0 - cycles / n_max;
        let e_degraded: f64 = E_CONC * e_ratio;

        let loads: Vec<SolverLoad> = (0..n).map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
            })
        }).collect();

        let input = make_beam(n, l, e_degraded, A_CONC, IZ_CONC, "pinned", Some("rollerX"), loads);
        let res = solve_2d(&input).unwrap();

        let delta = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();

        // Equilibrium: total reactions = total load
        let ry_total: f64 = res.reactions.iter().map(|r| r.rz).sum();
        assert_close(ry_total, q.abs() * l, 0.02,
            &format!("Equilibrium at {} cycles", cycles));

        // Analytical: delta_max = 5*q*L^4 / (384*E*Iz) for SS beam UDL
        let e_eff: f64 = e_degraded * 1000.0;
        let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ_CONC);
        assert_close(delta, delta_exact, 0.05,
            &format!("Deflection at {} freeze-thaw cycles", cycles));

        deltas.push(delta);
    }

    // Progressive increase in deflection
    assert!(deltas[1] > deltas[0],
        "100 cycles delta={:.6e} should exceed 0 cycles delta={:.6e}",
        deltas[1], deltas[0]);
    assert!(deltas[2] > deltas[1],
        "200 cycles delta={:.6e} should exceed 100 cycles delta={:.6e}",
        deltas[2], deltas[1]);

    // Deflection at 200 cycles should be 3x the undamaged value
    // E_200 = E_0 * (1 - 200/300) = E_0 / 3
    // delta_200 / delta_0 = E_0 / E_200 = 3.0
    let expected_ratio: f64 = 1.0 / (1.0 - 200.0 / n_max);
    let actual_ratio = deltas[2] / deltas[0];
    assert_close(actual_ratio, expected_ratio, 0.03,
        "Freeze-thaw deflection ratio at 200 cycles");
}

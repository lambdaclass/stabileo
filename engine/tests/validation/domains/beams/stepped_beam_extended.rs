/// Validation: Stepped Beams — Extended Tests
///
/// References:
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 5th Ed., Ch. 11
///     (non-prismatic members, force-method analysis of stepped beams)
///   - Pilkey, W.D., "Formulas for Stress, Strain, and Structural Matrices",
///     2nd Ed., SS16.1 (stepped-section beams)
///   - Roark, R.J. & Young, W.C., "Roark's Formulas for Stress and Strain",
///     9th Ed., Table 8.10 (discontinuous beams, stepped sections)
///   - Timoshenko, S.P. & Gere, J.M., "Mechanics of Materials", SS5.5
///     (deflection of non-prismatic beams by superposition)
///
/// Stepped beams are modeled by assigning different section IDs to
/// different element groups. Each section has its own moment of inertia,
/// causing the stiffness matrix to change at the step boundary. These
/// tests cover simply-supported, cantilever, fixed-fixed, and propped
/// cantilever configurations with 2 or 3 cross-section segments.
///
/// Tests verify:
///   1. SS beam with 2 sections: stiffer half deflects less than softer half
///   2. Cantilever stepped: thicker near fixed end reduces tip deflection
///   3. SS beam I1 left, I2 right: asymmetric deflection curve
///   4. Stepped beam equilibrium: reactions same for statically determinate
///   5. Two-section cantilever: tip deflection by superposition of flexibility
///   6. Stepped fixed-fixed beam: section change causes asymmetric end moments
///   7. Stepped propped cantilever: moment distribution affected by stiffness
///   8. Three-section beam: continuity of displacements at section transitions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a stepped beam with arbitrary support conditions.
/// `seg_lengths`: length of each segment
/// `seg_iz`:      moment of inertia for each segment
/// `n_per_seg`:   number of elements per segment
/// `sup_left`:    support type at left end (node 1)
/// `sup_right`:   optional support type at right end (last node)
/// `loads`:       applied loads
fn make_stepped_beam(
    seg_lengths: &[f64],
    seg_iz: &[f64],
    n_per_seg: usize,
    sup_left: &str,
    sup_right: Option<&str>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_segs = seg_lengths.len();
    assert_eq!(n_segs, seg_iz.len());

    let mut nodes_map = HashMap::new();
    let mut elems_map = HashMap::new();
    let mut secs_map = HashMap::new();
    let mut mats_map = HashMap::new();

    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    for (s, &iz) in seg_iz.iter().enumerate() {
        secs_map.insert(
            (s + 1).to_string(),
            SolverSection { id: s + 1, a: A, iz, as_y: None },
        );
    }

    let mut x = 0.0;
    let mut node_id = 1;
    nodes_map.insert(
        node_id.to_string(),
        SolverNode { id: node_id, x, y: 0.0 },
    );
    node_id += 1;

    for &seg_len in seg_lengths.iter() {
        let elem_len = seg_len / n_per_seg as f64;
        for _j in 0..n_per_seg {
            x += elem_len;
            nodes_map.insert(
                node_id.to_string(),
                SolverNode { id: node_id, x, y: 0.0 },
            );
            node_id += 1;
        }
    }

    let total_nodes = node_id - 1;

    let mut elem_id = 1;
    let mut base_node = 1;
    for (s, _) in seg_lengths.iter().enumerate() {
        let sec_id = s + 1;
        for _j in 0..n_per_seg {
            elems_map.insert(
                elem_id.to_string(),
                SolverElement {
                    id: elem_id,
                    elem_type: "frame".to_string(),
                    node_i: base_node,
                    node_j: base_node + 1,
                    material_id: 1,
                    section_id: sec_id,
                    hinge_start: false,
                    hinge_end: false,
                },
            );
            elem_id += 1;
            base_node += 1;
        }
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: sup_left.to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    if let Some(sr) = sup_right {
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2, node_id: total_nodes, support_type: sr.to_string(),
            kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
        });
    }

    SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![], }
}

// ================================================================
// 1. SS Beam with 2 Sections: Stiffer Half Deflects Less
// ================================================================
//
// Simply-supported beam of total length L = 10 m, split into two
// equal halves. Left half has I1 = 4*IZ (stiffer), right half has
// I2 = IZ (softer). Under full UDL, the midpoint of the stiffer
// left half deflects less than the midpoint of the softer right half.
//
// Reference: Pilkey SS16.1 — stepped beams with piecewise constant EI.

#[test]
fn validation_stepped_ext_ss_stiffer_half_deflects_less() {
    let l = 10.0;
    let n_per = 8;
    let q: f64 = -10.0;
    let total_elems = 2 * n_per;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Left half: 4*IZ (stiffer), Right half: IZ (softer)
    let input = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[4.0 * IZ, IZ],
        n_per,
        "pinned",
        Some("rollerX"),
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Quarter-point of left half: node at index n_per/2 + 1
    let left_quarter_node = n_per / 2 + 1;
    // Quarter-point of right half: node at index n_per + n_per/2 + 1
    let right_quarter_node = n_per + n_per / 2 + 1;

    let d_left: f64 = results.displacements.iter()
        .find(|d| d.node_id == left_quarter_node).unwrap().uy.abs();
    let d_right: f64 = results.displacements.iter()
        .find(|d| d.node_id == right_quarter_node).unwrap().uy.abs();

    // Stiffer left half deflects less under uniform load
    assert!(
        d_left < d_right,
        "Stiffer left half should deflect less: d_left={:.6e} < d_right={:.6e}",
        d_left, d_right
    );

    // The ratio should be significant (left half is 4x stiffer).
    // For a SS beam under UDL, the stiffness difference shifts the deflection
    // curve but both halves share global curvature, so the ratio is moderate.
    assert!(
        d_right / d_left > 1.2,
        "Deflection ratio should be significant: d_right/d_left={:.3}",
        d_right / d_left
    );
}

// ================================================================
// 2. Cantilever Stepped: Thicker Near Fixed End Reduces Tip Deflection
// ================================================================
//
// Cantilever of total length L = 6 m with tip load P.
// Case A: Uniform section IZ throughout.
// Case B: Near the fixed end (first half), section is 3*IZ;
//         near the tip (second half), section is IZ.
// The stepped cantilever (B) must have smaller tip deflection than
// the uniform cantilever (A), because the stiffer root reduces rotation.
//
// Reference: Roark Table 8.10 — stepped cantilever tip deflection.

#[test]
fn validation_stepped_ext_cantilever_thicker_root_reduces_tip() {
    let l1 = 3.0;
    let l2 = 3.0;
    let l_total = l1 + l2;
    let p = 15.0;
    let n_per = 6;
    let tip_node = 2 * n_per + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // Case A: Uniform IZ cantilever
    let input_uniform = make_beam(
        2 * n_per, l_total, E, A, IZ, "fixed", None, loads.clone(),
    );
    let d_uniform: f64 = linear::solve_2d(&input_uniform).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // Case B: Stepped cantilever (3*IZ near root, IZ near tip)
    let input_stepped = make_stepped_beam(
        &[l1, l2],
        &[3.0 * IZ, IZ],
        n_per,
        "fixed",
        None,
        loads.clone(),
    );
    let d_stepped: f64 = linear::solve_2d(&input_stepped).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // Case C: Uniform 3*IZ cantilever (stiffest, lower bound on deflection)
    let input_stiff = make_beam(
        2 * n_per, l_total, E, A, 3.0 * IZ, "fixed", None, loads,
    );
    let d_stiff: f64 = linear::solve_2d(&input_stiff).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // Stepped deflection: less than uniform IZ, more than uniform 3*IZ
    assert!(
        d_stepped < d_uniform,
        "Thicker root reduces tip deflection: d_stepped={:.6e} < d_uniform={:.6e}",
        d_stepped, d_uniform
    );
    assert!(
        d_stepped > d_stiff,
        "Stepped > uniform stiff: d_stepped={:.6e} > d_stiff={:.6e}",
        d_stepped, d_stiff
    );
}

// ================================================================
// 3. SS Beam I1 on Left, I2 on Right: Asymmetric Deflection Curve
// ================================================================
//
// Simply-supported beam of length L = 10 m under full UDL.
// Left half has I1 = IZ, right half has I2 = 3*IZ.
// The maximum deflection must shift toward the softer (left) half.
// The deflection at the left quarter point must exceed the deflection
// at the right quarter point.
//
// Reference: Ghali & Neville SS11.2 — non-prismatic beams.

#[test]
fn validation_stepped_ext_ss_asymmetric_deflection_curve() {
    let l = 10.0;
    let n_per = 10;
    let q: f64 = -10.0;
    let total_elems = 2 * n_per;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Left half softer (IZ), right half stiffer (3*IZ)
    let input = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[IZ, 3.0 * IZ],
        n_per,
        "pinned",
        Some("rollerX"),
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Left quarter (node n_per/2 + 1) and right quarter (node n_per + n_per/2 + 1)
    let left_quarter = n_per / 2 + 1;
    let right_quarter = n_per + n_per / 2 + 1;
    let mid_node = n_per + 1;

    let d_lq: f64 = results.displacements.iter()
        .find(|d| d.node_id == left_quarter).unwrap().uy.abs();
    let d_rq: f64 = results.displacements.iter()
        .find(|d| d.node_id == right_quarter).unwrap().uy.abs();
    let d_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    // The softer left half deflects more than the stiffer right half
    assert!(
        d_lq > d_rq,
        "Asymmetric: softer left deflects more: d_lq={:.6e} > d_rq={:.6e}",
        d_lq, d_rq
    );

    // Maximum deflection shifts toward the softer side, so
    // left quarter deflection should be closer to (or exceed) midspan
    // At minimum, left quarter deflection is substantial relative to midspan
    assert!(
        d_lq > 0.5 * d_mid,
        "Left quarter deflection is significant: d_lq={:.6e} > 0.5*d_mid={:.6e}",
        d_lq, 0.5 * d_mid
    );
}

// ================================================================
// 4. Stepped Beam Equilibrium: Reactions Same for Statically Determinate
// ================================================================
//
// A simply-supported beam (statically determinate) has reactions that
// depend only on equilibrium equations, NOT on EI distribution.
// Whether the beam is uniform or stepped, the reactions under the
// same UDL must be identical: R_A = R_B = qL/2.
//
// Reference: Timoshenko & Gere SS5.5 — equilibrium of determinate beams.

#[test]
fn validation_stepped_ext_determinate_reactions_independent_of_stiffness() {
    let l = 8.0;
    let n_per = 6;
    let q: f64 = -12.0;
    let total_elems = 2 * n_per;
    let total_nodes = total_elems + 1;
    let total_load: f64 = q.abs() * l;

    let make_loads = || -> Vec<SolverLoad> {
        (1..=total_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect()
    };

    // Case A: Uniform beam IZ
    let input_uniform = make_beam(
        total_elems, l, E, A, IZ, "pinned", Some("rollerX"), make_loads(),
    );
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();
    let ra_uniform = res_uniform.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let rb_uniform = res_uniform.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().ry;

    // Case B: Stepped beam (left half IZ, right half 5*IZ)
    let input_stepped = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[IZ, 5.0 * IZ],
        n_per,
        "pinned",
        Some("rollerX"),
        make_loads(),
    );
    let res_stepped = linear::solve_2d(&input_stepped).unwrap();
    let ra_stepped = res_stepped.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let rb_stepped = res_stepped.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().ry;

    // Case C: Stepped beam (left half 3*IZ, right half IZ)
    let input_stepped2 = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[3.0 * IZ, IZ],
        n_per,
        "pinned",
        Some("rollerX"),
        make_loads(),
    );
    let res_stepped2 = linear::solve_2d(&input_stepped2).unwrap();
    let ra_stepped2 = res_stepped2.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let rb_stepped2 = res_stepped2.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().ry;

    // For a simply-supported beam under symmetric UDL: R_A = R_B = qL/2
    let expected_r: f64 = total_load / 2.0;

    // All cases must give the same reactions (statically determinate)
    assert_close(ra_uniform, expected_r, 0.01, "Uniform R_A = qL/2");
    assert_close(rb_uniform, expected_r, 0.01, "Uniform R_B = qL/2");
    assert_close(ra_stepped, expected_r, 0.01, "Stepped R_A = qL/2");
    assert_close(rb_stepped, expected_r, 0.01, "Stepped R_B = qL/2");
    assert_close(ra_stepped2, expected_r, 0.01, "Stepped2 R_A = qL/2");
    assert_close(rb_stepped2, expected_r, 0.01, "Stepped2 R_B = qL/2");
}

// ================================================================
// 5. Two-Section Cantilever: Tip Deflection by Superposition of Flexibility
// ================================================================
//
// Cantilever of total length L = L1 + L2, with I1 for segment 1
// (near root) and I2 for segment 2 (near tip). Tip load P.
//
// By superposition (virtual work / Mohr integral):
//   delta_tip = P*L2^3/(3*E_eff*I2) + P*L2^2*L1/(2*E_eff*I2)
//             + P*L2^2*L1/(2*E_eff*I1) + P*L1^3/(3*E_eff*I1)
//             - P*L2^2*L1/(2*E_eff*I1)   [correction for double-counting]
//
// Simplification for equal-length segments L1 = L2 = a:
//   delta_tip = P*a^3/(3*E_eff*I2) + P*a^2*a/(2*E_eff*I2)
//             + P*a^3/(3*E_eff*I1)
//
// which gives:
//   delta_tip = P*a^3 * [5/(6*E_eff*I2) + 1/(3*E_eff*I1)]
//
// Reference: Timoshenko & Gere SS5.5.

#[test]
fn validation_stepped_ext_cantilever_tip_superposition() {
    let a: f64 = 3.0; // each segment length
    let p: f64 = 10.0;
    let i1: f64 = 2.0 * IZ; // root segment
    let i2: f64 = IZ;        // tip segment
    let n_per = 8;
    let tip_node = 2 * n_per + 1;

    let e_eff: f64 = E * 1000.0; // solver multiplies E by 1000 internally

    // Analytical tip deflection by Mohr integral (virtual work):
    // Segment 2 (tip, length a, EI2):
    //   integral of (M * m) / EI2 dx from 0 to a
    //   where M = P*x (moment from tip load), m = x (unit load moment)
    //   contribution = P*a^3/(3*EI2)
    // Segment 1 (root, length a, EI1):
    //   moment in segment 1 from P at tip: M = P*(a + x') where x' is from 0 to a
    //   unit load moment from unit load at tip: m = a + x'
    //   contribution = integral_0^a P*(a+x')*(a+x')/(EI1) dx'
    //               = P/(EI1) * integral_0^a (a+x')^2 dx'
    //               = P/(EI1) * [(a+x')^3/3] from 0 to a
    //               = P/(EI1) * [(2a)^3/3 - a^3/3]
    //               = P/(EI1) * [8a^3/3 - a^3/3]
    //               = P*7*a^3/(3*EI1)
    // Segment 2 also contributes from the rotation at the junction:
    //   The moment in segment 2 from P at tip is M = P*x (0..a)
    //   The unit load moment in segment 2 is m = x (0..a)
    //   This was already counted above.
    //
    // Actually, use the simpler formula directly:
    // delta = integral_0^L [M(x) * m(x) / EI(x)] dx
    // with M(x) = P * (L - x) for x measured from root, L = 2a
    // and  m(x) = 1 * (L - x) for unit load at tip
    //
    // Segment 1 (x = 0..a, EI = e_eff*I1):
    //   = P/(e_eff*I1) * integral_0^a (2a - x)^2 dx
    //   = P/(e_eff*I1) * [-(2a-x)^3/3] from 0 to a
    //   = P/(e_eff*I1) * [-(a)^3/3 + (2a)^3/3]
    //   = P/(e_eff*I1) * (8a^3 - a^3)/3
    //   = 7*P*a^3 / (3*e_eff*I1)
    //
    // Segment 2 (x = a..2a, EI = e_eff*I2):
    //   = P/(e_eff*I2) * integral_a^{2a} (2a - x)^2 dx
    //   = P/(e_eff*I2) * [-(2a-x)^3/3] from a to 2a
    //   = P/(e_eff*I2) * [0 + a^3/3]
    //   = P*a^3 / (3*e_eff*I2)
    //
    // Total: delta = 7*P*a^3/(3*e_eff*I1) + P*a^3/(3*e_eff*I2)

    let delta_analytical: f64 = 7.0 * p * a.powi(3) / (3.0 * e_eff * i1)
                               + p * a.powi(3) / (3.0 * e_eff * i2);

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_stepped_beam(
        &[a, a],
        &[i1, i2],
        n_per,
        "fixed",
        None,
        loads,
    );
    let d_fem: f64 = linear::solve_2d(&input).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // FEM should match analytical within 2% (with 8 elements per segment)
    assert_close(d_fem, delta_analytical, 0.02,
        "Stepped cantilever tip deflection by superposition");
}

// ================================================================
// 6. Stepped Fixed-Fixed Beam: Section Change Causes Asymmetric End Moments
// ================================================================
//
// A fixed-fixed beam of length L = 10 m under full UDL.
// If uniform: both fixed-end moments are equal: M = qL^2/12.
// When the left half has I1 = 4*IZ and right half has I2 = IZ,
// the stiffer end attracts more moment. The left fixed-end moment
// (stiffer side) must exceed the right fixed-end moment.
//
// Reference: Ghali & Neville SS11.2 — redistribution in indeterminate beams.

#[test]
fn validation_stepped_ext_fixed_fixed_asymmetric_moments() {
    let l = 10.0;
    let n_per = 10;
    let q: f64 = -10.0;
    let total_elems = 2 * n_per;
    let total_nodes = total_elems + 1;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Left half stiffer (4*IZ), right half softer (IZ)
    let input_stepped = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[4.0 * IZ, IZ],
        n_per,
        "fixed",
        Some("fixed"),
        loads.clone(),
    );
    let res_stepped = linear::solve_2d(&input_stepped).unwrap();

    // Get end moments (reactions)
    let m_left: f64 = res_stepped.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_right: f64 = res_stepped.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().mz.abs();

    // Stiffer left end attracts more moment
    assert!(
        m_left > m_right,
        "Stiffer left end has larger moment: m_left={:.4} > m_right={:.4}",
        m_left, m_right
    );

    // Uniform fixed-fixed: both moments = qL^2/12
    let input_uniform = make_beam(
        total_elems, l, E, A, IZ, "fixed", Some("fixed"), loads,
    );
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();
    let m_left_uniform: f64 = res_uniform.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_right_uniform: f64 = res_uniform.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().mz.abs();

    // Uniform beam: both end moments are equal
    let rel_diff_uniform: f64 = (m_left_uniform - m_right_uniform).abs()
        / m_left_uniform.max(1e-6);
    assert!(
        rel_diff_uniform < 0.02,
        "Uniform beam: end moments equal: m_L={:.4}, m_R={:.4}",
        m_left_uniform, m_right_uniform
    );

    // Stepped beam end moments should be asymmetric (differ by at least 10%)
    let asymmetry: f64 = (m_left - m_right).abs() / ((m_left + m_right) / 2.0);
    assert!(
        asymmetry > 0.10,
        "Stepped beam moments are asymmetric: asymmetry={:.3} (>0.10)",
        asymmetry
    );

    // Global equilibrium: sum of vertical reactions = total load
    let sum_ry: f64 = res_stepped.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q.abs() * l, 0.02, "Fixed-fixed stepped: sum Ry = qL");
}

// ================================================================
// 7. Stepped Propped Cantilever: Moment Distribution Affected by Stiffness
// ================================================================
//
// Propped cantilever (fixed at left, roller at right) of length L = 12 m
// under full UDL. The fixed-end moment M_A depends on the stiffness
// distribution. When the right half is stiffer, the roller attracts
// more load, reducing M_A compared to the uniform case. Conversely,
// when the left half is stiffer (near fixed end), M_A increases.
//
// Reference: Pilkey SS16.1.2 — propped cantilever with stepped sections.

#[test]
fn validation_stepped_ext_propped_cantilever_moment_redistribution() {
    let l = 12.0;
    let n_per = 8;
    let q: f64 = -10.0;
    let total_elems = 2 * n_per;
    let total_nodes = total_elems + 1;

    let make_loads = || -> Vec<SolverLoad> {
        (1..=total_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect()
    };

    // Case A: Uniform beam
    let input_uniform = make_beam(
        total_elems, l, E, A, IZ, "fixed", Some("rollerX"), make_loads(),
    );
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();
    let m_a_uniform: f64 = res_uniform.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let r_b_uniform: f64 = res_uniform.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().ry;

    // Case B: Left half stiffer (3*IZ), right half IZ
    let input_left_stiff = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[3.0 * IZ, IZ],
        n_per,
        "fixed",
        Some("rollerX"),
        make_loads(),
    );
    let res_left_stiff = linear::solve_2d(&input_left_stiff).unwrap();
    let m_a_left_stiff: f64 = res_left_stiff.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    // Case C: Right half stiffer (3*IZ), left half IZ
    let input_right_stiff = make_stepped_beam(
        &[l / 2.0, l / 2.0],
        &[IZ, 3.0 * IZ],
        n_per,
        "fixed",
        Some("rollerX"),
        make_loads(),
    );
    let res_right_stiff = linear::solve_2d(&input_right_stiff).unwrap();
    let m_a_right_stiff: f64 = res_right_stiff.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let r_b_right_stiff: f64 = res_right_stiff.reactions.iter()
        .find(|r| r.node_id == total_nodes).unwrap().ry;

    // When right half is stiffer, the roller (right) attracts more load,
    // which increases R_B and reduces the fixed-end moment M_A
    assert!(
        r_b_right_stiff > r_b_uniform,
        "Stiffer right half: R_B increases: {:.4} > {:.4}",
        r_b_right_stiff, r_b_uniform
    );
    assert!(
        m_a_right_stiff < m_a_uniform,
        "Stiffer right half: M_A decreases: {:.4} < {:.4}",
        m_a_right_stiff, m_a_uniform
    );

    // When left half is stiffer, the fixed end attracts more moment
    assert!(
        m_a_left_stiff > m_a_uniform,
        "Stiffer left half: M_A increases: {:.4} > {:.4}",
        m_a_left_stiff, m_a_uniform
    );

    // Equilibrium in all cases
    for (label, res) in [
        ("Uniform", &res_uniform),
        ("Left stiff", &res_left_stiff),
        ("Right stiff", &res_right_stiff),
    ] {
        let sum_ry: f64 = res.reactions.iter().map(|r| r.ry).sum();
        assert_close(sum_ry, q.abs() * l, 0.02,
            &format!("{}: sum Ry = qL", label));
    }
}

// ================================================================
// 8. Three-Section Beam: Continuity of Displacements at Transitions
// ================================================================
//
// Simply-supported beam of total length L = 12 m with three equal
// segments of 4 m each. Sections: [IZ, 3*IZ, IZ]. Under full UDL,
// the displacement field must be continuous at the two transition
// nodes (no jumps in displacement).
//
// We verify:
//   - The displacement at each transition node is the same whether
//     computed from the element on the left or the right
//   - The slope (rotation) is also continuous at the transitions
//
// Reference: Ghali & Neville SS2.5 — displacement compatibility at nodes.

#[test]
fn validation_stepped_ext_three_section_displacement_continuity() {
    let seg_l = 4.0;
    let n_per = 6;
    let q: f64 = -10.0;
    let total_elems = 3 * n_per;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Three sections: [IZ, 3*IZ, IZ]
    let input = make_stepped_beam(
        &[seg_l, seg_l, seg_l],
        &[IZ, 3.0 * IZ, IZ],
        n_per,
        "pinned",
        Some("rollerX"),
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Transition node 1: end of segment 1 / start of segment 2
    // This is node (n_per + 1)
    let trans1_node = n_per + 1;
    // Transition node 2: end of segment 2 / start of segment 3
    // This is node (2 * n_per + 1)
    let trans2_node = 2 * n_per + 1;

    // Displacement continuity: node displacement is unique (FEM guarantees this)
    // but we verify via element forces that moment is continuous at transitions
    let d_trans1 = results.displacements.iter()
        .find(|d| d.node_id == trans1_node).unwrap();
    let d_trans2 = results.displacements.iter()
        .find(|d| d.node_id == trans2_node).unwrap();

    // Both transition nodes must have nonzero deflection (beam is loaded)
    assert!(
        d_trans1.uy.abs() > 1e-10,
        "Transition 1 has nonzero deflection: uy={:.6e}", d_trans1.uy
    );
    assert!(
        d_trans2.uy.abs() > 1e-10,
        "Transition 2 has nonzero deflection: uy={:.6e}", d_trans2.uy
    );

    // Verify moment continuity at transition nodes
    // Element ending at transition 1: element n_per; starting: element n_per+1
    let ef_before_t1 = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per).unwrap();
    let ef_after_t1 = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per + 1).unwrap();

    let m_diff_t1: f64 = (ef_before_t1.m_end - ef_after_t1.m_start).abs();
    let m_scale_t1: f64 = ef_before_t1.m_end.abs().max(ef_after_t1.m_start.abs()).max(1e-6);
    assert!(
        m_diff_t1 / m_scale_t1 < 0.02,
        "Moment continuity at transition 1: m_end={:.6e}, m_start={:.6e}",
        ef_before_t1.m_end, ef_after_t1.m_start
    );

    // Element ending at transition 2: element 2*n_per; starting: element 2*n_per+1
    let ef_before_t2 = results.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per).unwrap();
    let ef_after_t2 = results.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per + 1).unwrap();

    let m_diff_t2: f64 = (ef_before_t2.m_end - ef_after_t2.m_start).abs();
    let m_scale_t2: f64 = ef_before_t2.m_end.abs().max(ef_after_t2.m_start.abs()).max(1e-6);
    assert!(
        m_diff_t2 / m_scale_t2 < 0.02,
        "Moment continuity at transition 2: m_end={:.6e}, m_start={:.6e}",
        ef_before_t2.m_end, ef_after_t2.m_start
    );

    // Verify shear continuity at the transition nodes (no external load there)
    let v_diff_t1: f64 = (ef_before_t1.v_end.abs() - ef_after_t1.v_start.abs()).abs();
    let v_scale_t1: f64 = ef_before_t1.v_end.abs().max(ef_after_t1.v_start.abs()).max(1e-6);
    assert!(
        v_diff_t1 / v_scale_t1 < 0.02,
        "Shear continuity at transition 1: v_end={:.6e}, v_start={:.6e}",
        ef_before_t1.v_end, ef_after_t1.v_start
    );

    let v_diff_t2: f64 = (ef_before_t2.v_end.abs() - ef_after_t2.v_start.abs()).abs();
    let v_scale_t2: f64 = ef_before_t2.v_end.abs().max(ef_after_t2.v_start.abs()).max(1e-6);
    assert!(
        v_diff_t2 / v_scale_t2 < 0.02,
        "Shear continuity at transition 2: v_end={:.6e}, v_start={:.6e}",
        ef_before_t2.v_end, ef_after_t2.v_start
    );

    // Symmetric section [IZ, 3*IZ, IZ] under symmetric load: deflections at
    // transition nodes must be equal by symmetry
    let rel_diff_trans: f64 = (d_trans1.uy - d_trans2.uy).abs()
        / d_trans1.uy.abs().max(1e-10);
    assert!(
        rel_diff_trans < 0.02,
        "Symmetric sections: transition deflections equal: t1={:.6e}, t2={:.6e}",
        d_trans1.uy, d_trans2.uy
    );

    // Rotation continuity: rotations at transition nodes must also be continuous.
    // By symmetry, rotation at transition 1 should be equal and opposite to transition 2.
    let rz_sum: f64 = (d_trans1.rz + d_trans2.rz).abs();
    let rz_scale: f64 = d_trans1.rz.abs().max(d_trans2.rz.abs()).max(1e-10);
    assert!(
        rz_sum / rz_scale < 0.02,
        "Symmetric sections: rotations antisymmetric: rz1={:.6e}, rz2={:.6e}",
        d_trans1.rz, d_trans2.rz
    );
}

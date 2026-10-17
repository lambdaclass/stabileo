//! Focused regressions for the silently-wrong (feature, analysis) pairs that
//! `feature_matrix.rs` found. Each test states the reference the fix was
//! checked against; the matrix itself covers every pair.

#[path = "common/mod.rs"]
mod common;

use common::{make_3d_input, make_input};
use dedaliano_engine::postprocess::influence;
use dedaliano_engine::solver::{buckling, corotational, linear, material_nonlinear, plastic, staged};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const FIXED: [bool; 6] = [true; 6];

fn nodal3(node: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: node, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None })
}

/// A vertical cantilever under a lateral tip load: the co-rotational solve
/// subtracted the rigid rotation in global axes from rotations in local axes,
/// right only for a member along +X. A column converged to itself folded in
/// half (u_z = −2L) and reported convergence.
#[test]
fn corotational_3d_column_matches_linear_for_any_local_axes() {
    for local_y in [None, Some((0.0, -1.0, 0.0)), Some((1.0, 0.0, 0.0)), Some((0.0, 0.0, 1.0))] {
        let mut input = make_3d_input(
            (1..=5).map(|i| (i, 0.0, 0.0, 0.75 * (i - 1) as f64)).collect(),
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.09, 6.75e-4, 6.75e-4, 1.14e-3)],
            (1..=4).map(|i| (i, "frame", i, i + 1, 1, 1)).collect(),
            vec![(1, FIXED.to_vec())],
            vec![nodal3(5, [10.0, 0.0, 0.0, 0.0, 0.0, 0.0])],
        );
        if let Some((x, y, z)) = local_y {
            for e in input.elements.values_mut() {
                (e.local_yx, e.local_yy, e.local_yz) = (Some(x), Some(y), Some(z));
            }
        }
        let lin = linear::solve_3d(&input).unwrap();
        let co = corotational::solve_corotational_3d(&input, 50, 1e-6, 4, false).unwrap();
        assert!(co.converged, "{local_y:?}: did not converge");
        let (l, c) = (
            lin.displacements.iter().find(|d| d.node_id == 5).unwrap(),
            co.results.displacements.iter().find(|d| d.node_id == 5).unwrap(),
        );
        assert!((c.ux - l.ux).abs() < 1e-3 * l.ux.abs(), "{local_y:?}: ux {} vs {}", c.ux, l.ux);
        assert!(c.uz.abs() < 1e-3, "{local_y:?}: uz {}", c.uz);
    }
}

/// A beam released into its right support buckles as the same beam on a
/// pinned support: clamped–pinned, P_cr = 20.1907·EI/L². The 2D geometric
/// stiffness was not condensed for the release (3.2% low).
#[test]
fn buckling_2d_released_member_matches_pinned_support() {
    let mut input = common::make_beam(12, 6.0, 200_000.0, 0.08, 1.0667e-3, "guidedX", Some("fixed"), vec![]);
    input.elements.get_mut("12").unwrap().hinge_end = true;
    input.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: 200.0, fz: 0.0, my: 0.0 }));
    let ei = 200_000.0 * 1000.0 * 1.0667e-3;
    let pcr = 20.1907 * ei / 36.0;
    let lf = buckling::solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    assert!((lf * 200.0 / pcr - 1.0).abs() < 2e-3, "λ·P = {} vs {pcr}", lf * 200.0);
}

/// A beam on a pinned support with a rotational spring, loaded at one third:
/// mechanism with hinges at the spring and under the load,
/// λ = (Mp + Mp·b/L)/(P·a·b/L) = 83.33. The hinge at the spring was dropped
/// as "the same as the free node", and the beam collapsed at 150.
#[test]
fn plastic_2d_hinge_forms_at_a_rotational_spring() {
    let mut input = common::make_beam(6, 6.0, 200_000.0, 0.08, 0.2 * 0.4f64.powi(3) / 12.0, "pinned", Some("rollerX"), vec![]);
    input.supports.values_mut().find(|s| s.node_id == 1).unwrap().kz = Some(50_000.0);
    input.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -30.0, my: 0.0 }));
    let sections = [("1".to_string(), PlasticSectionData { a: 0.08, iz: 0.2 * 0.4f64.powi(3) / 12.0, material_id: 1, b: Some(0.2), h: Some(0.4) })].into();
    let materials = [("1".to_string(), PlasticMaterialData { fy: Some(250.0) })].into();
    let r = plastic::solve_plastic_2d(&PlasticInput { solver: input, sections, materials, max_hinges: None, mp_overrides: None }).unwrap();
    assert!((r.collapse_factor - 250.0 / 3.0).abs() < 1e-6, "collapse factor {}", r.collapse_factor);
}

/// Material-nonlinear 3D iterated on the unconstrained system: a node tied
/// only by EqualDOF left the tangent singular, a diaphragm was not there.
#[test]
fn material_nonlinear_3d_honours_constraints() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 0.0), (4, 4.0, 0.0, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.09, 6.75e-4, 6.75e-4, 1.14e-3)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 3, 4, 1, 1)],
        vec![(1, FIXED.to_vec()), (3, FIXED.to_vec())],
        vec![nodal3(2, [30.0, 10.0, -20.0, 0.0, 0.0, 0.0])],
    );
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint { master_node: 2, slave_nodes: vec![4], plane: "XY".into() }));
    let lin = linear::solve_3d(&input).unwrap();
    let nl = material_nonlinear::solve_nonlinear_material_3d(&NonlinearMaterialInput3D {
        solver: input.clone(),
        material_models: [("1".to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 1e9, alpha: None })].into(),
        section_capacities: [("1".to_string(), SectionCapacity3D { np: 1e12, mpy: 1e12, mpz: 1e12, mpx: None })].into(),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments: 2,
    })
    .unwrap();
    assert!(nl.converged);
    let d = |r: &AnalysisResults3D| r.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    assert!(d(&lin) > 1e-5, "the diaphragm carries the push to the second column");
    assert!((d(&nl.results) - d(&lin)).abs() < 1e-6 * d(&lin).abs().max(1e-12) + 1e-12, "{} vs {}", d(&nl.results), d(&lin));
}

/// Influence lines dropped constraints and connectors from the structure.
#[test]
fn influence_line_keeps_connectors() {
    let mut input = common::make_beam(6, 6.0, 200_000.0, 0.08, 1.0667e-3, "fixed", None, vec![]);
    input.nodes.insert("50".into(), SolverNode { id: 50, x: 6.0, z: -1.0 });
    input.supports.insert("50".into(), SolverSupport {
        id: 50, node_id: 50, support_type: "fixed".into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    input.connectors.insert("1".into(), ConnectorElement { id: 1, node_i: 7, node_j: 50, k_axial: 5000.0, k_shear: 0.0, k_moment: 0.0, k_shear_z: 0.0, k_bend_y: 0.0, k_bend_z: 0.0 });
    let il = influence::compute_influence_line(&influence::InfluenceLineInput {
        solver: input.clone(), quantity: "M".into(), target_node_id: None, target_element_id: Some(2), target_position: 0.5, n_points_per_element: 2,
    })
    .unwrap();
    // The tip ordinate, against a direct solve with the unit load at the tip.
    let tip = il.points.iter().find(|p| p.element_id == 6 && (p.t - 1.0).abs() < 1e-9).unwrap().value;
    let mut s = input.clone();
    let e6 = s.elements["6"].clone();
    s.loads = influence::influence_unit_loads_2d(&e6, 1.0, 1.0, 1.0, 0.0);
    let r = linear::solve_2d(&s).unwrap();
    let direct = influence::extract_value("M", None, Some(2), 0.5, &r);
    assert!((tip - direct).abs() < 1e-9 * direct.abs().max(1.0), "{tip} vs {direct}");
}

/// Staged payloads carrying model parts the staged input has no field for
/// were solved without them; they are refused by name.
#[test]
fn staged_refuses_connectors_and_curved_beams() {
    let r = staged::parse_staged_2d(r#"{"nodes":{},"materials":{},"sections":{},"elements":{},"supports":{},"loads":[],"stages":[],
        "connectors":{"1":{"id":1,"nodeI":1,"nodeJ":2,"kAxial":1.0}}}"#);
    assert!(r.unwrap_err().contains("connector"));
    let r = staged::parse_staged_3d(r#"{"nodes":{},"materials":{},"sections":{},"elements":{},"supports":{},"loads":[],"stages":[],
        "curvedBeams":[{"nodeStart":1,"nodeMid":2,"nodeEnd":3,"materialId":1,"sectionId":1}]}"#);
    assert!(r.unwrap_err().contains("curved beams"));
    // Empty maps are what the app sends for a model without them.
    assert!(staged::parse_staged_3d(r#"{"nodes":{},"materials":{},"sections":{},"elements":{},"supports":{},"loads":[],"stages":[],"connectors":{}}"#).is_ok());
}

/// Analyses that cannot honour a feature say so by name.
#[test]
fn refusals_name_the_feature() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 3.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.08, 1e-3)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: -10.0, fz: 0.0, my: 0.0 })],
    );
    input.supports.get_mut("2").unwrap().dz = Some(-0.01);
    let e = corotational::solve_corotational_2d(&input, 50, 1e-6, 4, false).unwrap_err();
    assert!(e.contains("prescribed support displacements") && e.contains("support 2"), "{e}");
    let _ = HashMap::<String, f64>::new();
}

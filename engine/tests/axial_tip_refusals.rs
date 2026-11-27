use crate::common::make_beam;
use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
use dedaliano_engine::solver::{
    contact::{solve_contact_2d, ContactInput},
    corotational::solve_corotational_2d,
    fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput},
    ssi::{solve_ssi_2d, SSIInput},
};
use dedaliano_engine::types::{
    DiagnosticCode, SolverInput, SolverLoad, SolverNodalLoad, StructuredDiagnostic,
};
use std::collections::HashMap;

const FREE_AXIAL_TIP: &str = "the structure is a mechanism at nodes [2]: a node can move freely in a direction no member, support or spring stiffens; add supports or members, or remove releases";

pub(super) fn transverse_loaded_bar() -> SolverInput {
    serde_json::from_value(serde_json::json!({
        "nodes": {"1": {"id": 1, "x": -53.39259906210398, "z": -85.39605063257972}, "2": {"id": 2, "x": -28.598050853224024, "z": -52.92016340104717}},
        "materials": {"1": {"id": 1, "e": 10530.127602377152, "nu": 0.2681219095578359}},
        "sections": {"1": {"id": 1, "a": 0.01819587776383571, "iz": 0.00011849462806740683}},
        "elements": {"1": {"id": 1, "type": "truss", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": -24.880367155551312, "qJ": -13.982488394650844}}]
    })).unwrap()
}

fn fixed_beam() -> SolverInput {
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    })];
    make_beam(4, 4.0, 200_000.0, 0.045, 3.375e-4, "fixed", None, loads)
}

fn assert_no_invariance_warning(diagnostics: &[StructuredDiagnostic], context: &str) {
    assert!(
        !diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::KnownIssue
                && d.phase.as_deref() == Some("NUM-INVARIANCE")),
        "{context}: {diagnostics:?}"
    );
}

#[test]
fn planar_contact_ssi_and_corotational_refuse_the_transverse_bar_mechanism() {
    let solve = |input: &SolverInput| {
        let contact: ContactInput =
            serde_json::from_value(serde_json::json!({ "solver": input })).unwrap();
        let ssi = SSIInput {
            solver: input.clone(),
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        [
            (
                "contact",
                solve_contact_2d(&contact).map(|r| r.results.structured_diagnostics),
            ),
            (
                "SSI",
                solve_ssi_2d(&ssi).map(|r| r.results.structured_diagnostics),
            ),
            (
                "corotational",
                solve_corotational_2d(input, 100, 1e-10, 4, false)
                    .map(|r| r.results.structured_diagnostics),
            ),
        ]
    };
    let refusals = solve(&transverse_loaded_bar()).map(|(name, result)| (name, result.err()));
    assert_eq!(
        refusals
            .each_ref()
            .map(|(name, error)| (*name, error.as_deref())),
        ["contact", "SSI", "corotational"].map(|name| (name, Some(FREE_AXIAL_TIP)))
    );
    for (name, result) in solve(&fixed_beam()) {
        assert_no_invariance_warning(&result.unwrap_or_else(|e| panic!("{name}: {e}")), name);
    }
}

#[test]
fn planar_fiber_refuses_the_transverse_bar_mechanism() {
    let solve = |solver: SolverInput, modified_nr| {
        let section = &solver.sections["1"];
        let e = solver.materials["1"].e;
        let h = (12.0 * section.iz / section.a).sqrt();
        let fibers = (0..20)
            .map(|k| Fiber {
                y: -h / 2.0 + (k as f64 + 0.5) * h / 20.0,
                z: 0.0,
                area: section.a / 20.0,
                material_idx: 0,
            })
            .collect();
        let fiber_sections = HashMap::from([(
            "1".to_string(),
            FiberSectionDef {
                fibers,
                materials: vec![FiberMaterial::Elastic { e }],
            },
        )]);
        solve_fiber_nonlinear_2d(&FiberNonlinearInput {
            solver,
            fiber_sections,
            n_integration_points: 5,
            max_iter: 50,
            tolerance: 1e-10,
            n_increments: 1,
            modified_nr,
        })
        .map(|r| r.results.structured_diagnostics)
    };
    let refusals =
        [false, true].map(|modified_nr| solve(transverse_loaded_bar(), modified_nr).err());
    assert_eq!(
        refusals.each_ref().map(|error| error.as_deref()),
        [Some(FREE_AXIAL_TIP); 2]
    );
    for modified_nr in [false, true] {
        let context = format!("2D modified {modified_nr}");
        let result = solve(fixed_beam(), modified_nr).unwrap_or_else(|e| panic!("{context}: {e}"));
        assert_no_invariance_warning(&result, &context);
    }
}

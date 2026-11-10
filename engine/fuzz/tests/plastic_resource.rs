#[test]
fn issue_743_grid_is_admitted_by_storage_without_running_a_heavy_solve() {
    let bytes = include_bytes!("../corpus-regressions/plastic-lp-budget/engine-grid-slab.bin");
    let input: dedaliano_engine::types::PlasticInput3D =
        serde_json::from_slice(&bytes[2..]).unwrap();
    let model = dedaliano_engine::certify::plastic_3d::build_model_3d(&input).unwrap();
    let work = dedaliano_engine::certify::plastic_3d::lp_work(&model);
    assert_eq!(work.force_variables, 144);
    assert_eq!(work.equilibrium_equations, 84);
    assert_eq!(work.max_halfspaces, 6144);
    assert_eq!(work.max_tableau_cells(), 912050);
    assert!(work.initial_pivot_cells() > 1 << 31);
    assert!(work.check_engine_budget().is_ok());
    assert!(dedaliano_engine_fuzz::plastic::certificate_budget_3d(&input).is_ok());
}

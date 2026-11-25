use crate::{ana2, ana3, case::{Case2, Case3}, checks2, checks3, tally::{Tally, Verdict}};
use dedaliano_engine::metamorphic::transform::{Iso2, Iso3};
use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::{SolverElement, SolverInput3D, SolverLoad, SolverNodalLoad};

fn replay_spatial_rotation(model: &str, analysis: &str, seed: u64) {
    check_spatial_rotation(&spatial_replay_case(model), spatial_analysis(analysis), seed);
}

fn spatial_replay_case(model: &str) -> Case3 {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/support-invariance.json")).unwrap();
    let data = &fixtures[model];
    let input: SolverInput3D = serde_json::from_value(data.clone()).unwrap();
    let mut case = Case3::new("replay", input);
    if let Some(densities) = data.get("_nightly_dens") {
        case.dens = serde_json::from_value(densities.clone()).unwrap();
    }
    case
}

fn spatial_analysis(name: &str) -> ana3::Ana3 {
    let mut matches = ana3::rows().into_iter().filter(|a| a.name == name);
    let analysis = matches.next().unwrap();
    assert!(matches.next().is_none());
    analysis
}

fn check_spatial_rotation(case: &Case3, analysis: ana3::Ana3, seed: u64) {
    let tally = Tally::default();
    checks3::check_case(
        &checks3::Ctx { tally: &tally, rng_seed: seed },
        case,
        std::slice::from_ref(&analysis),
        &["rotation"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    assert_eq!(tally.symbol(analysis.name, "rotation"), "✓", "{}", tally.report());
}

#[test]
fn issue_1192_pinned_and_roller_supports_rotate_as_one_restraint() {
    let model = include_str!("../metamorphic_corpus/nightly/issue-1192.json");
    let case = Case2::new("issue-1192", serde_json::from_str(model).unwrap());
    let mut canonical = case.clone();
    canonical.s.supports.remove("3").unwrap();
    assert_eq!(analyze_kinematics_2d(&case.s).degree, analyze_kinematics_2d(&canonical.s).degree);
    let results = |case: &Case2| {
        let r = solve_2d(&case.s).unwrap();
        serde_json::to_value((r.displacements, r.reactions, r.element_forces)).unwrap()
    };
    assert_eq!(results(&case), results(&canonical));

    for iso in [Iso2::mirror_line(0.4), Iso2::rotation(0.3).translated(2.0, -3.0)] {
        let transformed = case.iso(&iso).unwrap();
        assert_eq!(transformed.s.supports.values().filter(|s| s.node_id == 2).count(), 1);
        let expected = canonical.iso(&iso).unwrap();
        assert_eq!(results(&transformed), results(&expected));
        assert_eq!(analyze_kinematics_2d(&transformed.s).degree, analyze_kinematics_2d(&expected.s).degree);
    }

    let tally = Tally::default();
    let analyses: Vec<_> = ana2::rows().into_iter().filter(|a| a.name == "linear").collect();
    checks2::check_case(
        &checks2::Ctx { tally: &tally, rng_seed: 2026110204434 },
        &case,
        &analyses,
        &["units", "relabel"],
    );
    assert!(tally.failures().is_empty(), "{:?}", tally.failures());
    for relation in ["units", "relabel"] {
        assert_eq!(tally.symbol("linear", relation), "✓", "{}", tally.report());
    }
}

fn check_loaded_planar_isometry(iso: Iso2) {
    let model = include_str!("../metamorphic_corpus/nightly/issue-1192.json");
    let mut case = Case2::new("loaded issue-1192 control", serde_json::from_str(model).unwrap());
    let [start, end] = [&case.s.nodes["1"], &case.s.nodes["2"]];
    let midpoint = [start.x.midpoint(end.x), start.z.midpoint(end.z)];
    let loaded = case.s.nodes.get_mut("3").unwrap();
    [loaded.x, loaded.z] = midpoint;
    let first_member = case.s.elements.get_mut("1").unwrap();
    first_member.section_id = 2;
    let second_member = SolverElement { id: 2, node_i: 3, node_j: 2, ..first_member.clone() };
    case.s.elements.insert("2".into(), second_member);
    case.s.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 2.0, fz: -3.0, my: 4.0 }));

    let linear = ana2::rows().into_iter().find(|row| row.name == "linear").unwrap();
    let verdict = checks2::check_isometry(&linear, &case, &iso);
    assert!(matches!(verdict, Verdict::Pass(_)), "{verdict:?}");
}

#[test]
fn issue_1192_mirror_agrees_with_the_original_solution() {
    check_loaded_planar_isometry(Iso2::mirror_line(0.4));
}

#[test]
fn issue_1192_rotation_agrees_with_the_original_solution() {
    check_loaded_planar_isometry(Iso2::rotation(0.3).translated(2.0, -3.0));
}

#[test]
fn issue_1827_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "constrained", 2026110905303);
}

#[test]
fn issue_1832_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "creep & shrinkage (t = t0)", 2026110905303);
}

#[test]
fn issue_1835_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "cable solver", 2026110905303);
}

#[test]
fn issue_1836_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "certified linear", 2026110905303);
}

#[test]
fn issue_1839_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "harmonic", 2026110905303);
}

#[test]
fn issue_1840_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "material nonlinear", 2026110905303);
}

#[test]
fn issue_1841_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "modal", 2026110905303);
}

#[test]
fn issue_1843_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "load combinations", 2026110905303);
}

#[test]
fn issue_1845_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "linear", 2026110905303);
}

#[test]
fn issue_1848_rotation_preserves_zero_static_indeterminacy() {
    let case = spatial_replay_case("1827");
    let analysis = spatial_analysis("kinematic check");
    let seed = 2026110905303;

    let original = analyze_kinematics_3d(&case.s);
    assert!(original.invalid_input.is_none(), "{:?}", original.invalid_input);
    assert_eq!(original.degree, 0, "original model");

    let iso = checks3::rotation_for(&analysis, &mut checks3::case_rng(seed, &case, &analysis));
    let rotated = analyze_kinematics_3d(&case.iso(&iso).unwrap().s);
    assert!(rotated.invalid_input.is_none(), "{:?}", rotated.invalid_input);
    assert_eq!(rotated.degree, 0, "rotated model");

    check_spatial_rotation(&case, analysis, seed);
}

#[test]
fn issue_1860_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1827", "corotational", 2026110905303);
}

#[test]
fn issue_1829_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "Winkler (no foundation)", 2026110900251);
}

#[test]
fn issue_1849_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "linear (load session)", 2026110900251);
}

#[test]
fn issue_1853_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "contact (no gaps)", 2026110900251);
}

#[test]
fn issue_1863_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("1829", "SSI (no soil springs)", 2026110900251);
}

#[test]
fn issue_2195_rotation_preserves_the_shared_rigid_restraint() {
    replay_spatial_rotation("2195", "P-Delta", 2026111606393);
}

#[test]
fn shared_spatial_plane_requires_a_representable_normal() {
    let data = include_str!("../fixtures/support-invariance.json");
    let fixtures: serde_json::Value = serde_json::from_str(data).unwrap();
    let mut input: SolverInput3D = serde_json::from_value(fixtures["1829"].clone()).unwrap();
    let extra = input.supports.get_mut("3").unwrap();
    assert!(extra.rz);
    input.supports.get_mut("2").unwrap().rz = false;
    input.supports.get_mut("2").unwrap().ry = false;
    let case = Case3::new("two restrained translations", input);

    let canonical = case.iso(&Iso3::from_euler(0.0, 0.37, 0.0)).unwrap();
    let supports: Vec<_> = canonical.s.supports.values().filter(|s| s.node_id == 3).collect();
    assert_eq!(supports.len(), 1);
    assert_eq!([supports[0].rx, supports[0].ry, supports[0].rz], [true, false, true]);
    assert_eq!(analyze_kinematics_3d(&case.s).degree, analyze_kinematics_3d(&canonical.s).degree);

    let refusal = case.iso(&Iso3::about_z(0.37)).unwrap_err();
    assert!(refusal.contains("support restraining two translations, rotated off the axes"), "{refusal}");
}

#[test]
fn shared_supports_with_settlements_still_refuse_in_both_dimensions() {
    let data = include_str!("../fixtures/support-invariance.json");
    let fixtures: serde_json::Value = serde_json::from_str(data).unwrap();
    let mut input: SolverInput3D = serde_json::from_value(fixtures["1829"].clone()).unwrap();
    input.supports.get_mut("3").unwrap().dz = Some(0.0);
    let case = Case3::new("zero settlement", input);
    solve_3d(&case.iso(&Iso3::about_z(0.37)).unwrap().s).unwrap();
    let mut settled = case;
    settled.s.supports.get_mut("3").unwrap().dz = Some(0.01);
    assert!(solve_3d(&settled.s).unwrap_err().contains("has several supports"));
    assert!(settled.iso(&Iso3::about_z(0.37)).unwrap_err().contains("cannot be merged as plain rigid restraints"));

    let data = include_str!("../metamorphic_corpus/nightly/issue-1192.json");
    let mut case = Case2::new("zero settlement", serde_json::from_str(data).unwrap());
    case.s.supports.get_mut("3").unwrap().dz = Some(-0.0);
    solve_2d(&case.iso(&Iso2::rotation(0.37)).unwrap().s).unwrap();
    case.s.supports.get_mut("3").unwrap().dz = Some(0.01);
    assert!(solve_2d(&case.s).unwrap_err().contains("has several supports"));
    assert!(case.iso(&Iso2::rotation(0.37)).unwrap_err().contains("cannot be merged as plain rigid restraints"));
}

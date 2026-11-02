use crate::common::*;
use dedaliano_engine::certify::design::*;
use dedaliano_engine::postprocess::beam_stations::*;
use dedaliano_engine::postprocess::design_demands::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::postprocess::steel_check::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::load_cases::*;
use dedaliano_engine::types::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 53.8e-4;
const IY: f64 = 8356e-8;
const IZ: f64 = 604e-8;
const J: f64 = 20.1e-8;
const FY: f64 = 345_000.0;
const ZY: f64 = 628e-6;
const ZZ: f64 = 125e-6;
const AW: f64 = 0.300 * 0.0071;
const AW_WEAK: f64 = 2.0 * 0.150 * 0.0107;
const L: f64 = 6.0;
const P: f64 = 20.0;
const W: f64 = 10.0;

fn phi_mn_y() -> f64 {
    0.9 * FY * ZY
}

fn phi_mn_z() -> f64 {
    0.9 * FY * ZZ.min(1.6 * 80.5e-6)
}

fn phi_vn() -> f64 {
    0.9 * 0.6 * FY * AW
}

fn phi_vn_weak() -> f64 {
    0.9 * 0.6 * FY * AW_WEAK
}

fn ipe300(id: usize) -> SteelMemberData {
    serde_json::from_value(serde_json::json!({
        "elementId": id, "fy": FY, "ag": A, "aw": AW,
        "lby": L, "lbz": L, "iy": IY, "iz": IZ,
        "ry": (IY / A).sqrt(), "rz": (IZ / A).sqrt(),
        "zy": ZY, "zz": ZZ, "sy": 557e-6, "sz": 80.5e-6,
        "j": J, "cw": 126e-9, "lb": 0.0, "e": E * 1000.0,
        "compressionElements": []
    }))
    .unwrap()
}

fn free() -> Vec<bool> {
    vec![false; 6]
}

fn simply_supported_3d(roll: Option<f64>, loads: Vec<SolverLoad3D>) -> SolverInput3D {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, L / 2.0, 0.0, 0.0), (3, L, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)],
        vec![(1, vec![true, true, true, true, false, false]), (3, vec![false, true, true, false, false, false])],
        loads,
    );
    for e in input.elements.values_mut() {
        e.roll_angle = roll;
    }
    input
}

fn midspan_gravity() -> Vec<SolverLoad3D> {
    vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -P, mx: 0.0, my: 0.0, mz: 0.0, bw: None })]
}

fn udl_gravity_alpha0() -> Vec<SolverLoad3D> {
    (1..=2)
        .map(|id| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                q_xi: 0.0, q_xj: 0.0, element_id: id,
                q_yi: 0.0, q_yj: 0.0, q_zi: -W, q_zj: -W, a: None, b: None,
            })
        })
        .collect()
}

fn cantilever_column(fx: f64, fy: f64) -> SolverInput3D {
    make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6]), (2, free())],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx, fy, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    )
}

fn stations_3d(input: &SolverInput3D) -> GroupedBeamStationResult3D {
    let results = solve_3d(input).unwrap();
    let mut ids: Vec<usize> = input.elements.values().map(|e| e.id).collect();
    ids.sort();
    let members = ids
        .iter()
        .map(|&id| {
            let e = &input.elements[&id.to_string()];
            let (a, b) = (&input.nodes[&e.node_i.to_string()], &input.nodes[&e.node_j.to_string()]);
            let len = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
            BeamMemberInfo { element_id: id, section_id: 1, material_id: 1, length: len, label: None }
        })
        .collect();
    extract_beam_stations_grouped_3d(&BeamStationInput3D {
        members,
        combinations: vec![LabeledResults3D { combo_id: 1, combo_name: None, results }],
        num_stations: Some(21),
    })
}

fn steel_member_3d(input: &SolverInput3D) -> ElementDesignForces {
    let demands = extract_steel_demands_3d(&stations_3d(input), DemandStrategy::MaxAbsMoment);
    governing_steel(&demands)
}

fn governing_steel(demands: &[ElementDesignForces]) -> ElementDesignForces {
    let my = demands.iter().map(|d| d.my.abs()).fold(0.0, f64::max);
    let mz = demands.iter().map(|d| d.mz.unwrap_or(0.0).abs()).fold(0.0, f64::max);
    let vy = demands.iter().map(|d| d.vy.unwrap_or(0.0).abs()).fold(0.0, f64::max);
    ElementDesignForces { element_id: 1, n: 0.0, my, mz: Some(mz), vy: Some(vy) }
}

fn close(a: f64, b: f64, what: &str) {
    assert!((a - b).abs() <= 1e-6 * (1.0 + b.abs()), "{what}: {a} != {b}");
}

fn simply_supported_2d() -> GroupedBeamStationResult {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L / 2.0, 0.0), (3, L, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -P, my: 0.0 })],
    );
    let results = solve_2d(&input).unwrap();
    extract_beam_stations_grouped(&BeamStationInput {
        members: (1..=2)
            .map(|id| BeamMemberInfo { element_id: id, section_id: 1, material_id: 1, length: L / 2.0, label: None })
            .collect(),
        combinations: vec![LabeledResults { combo_id: 1, combo_name: None, results }],
        num_stations: Some(21),
    })
}

#[test]
fn gravity_beam_alpha0_reports_strong_axis_moment_and_web_shear() {
    let d = steel_member_3d(&simply_supported_3d(None, midspan_gravity()));
    close(d.my, P * L / 4.0, "My = PL/4");
    close(d.mz.unwrap(), 0.0, "Mz");
    close(d.vy.unwrap(), P / 2.0, "web shear = P/2");
}

#[test]
fn gravity_udl_alpha0_reports_wl2_over_8_and_wl_over_2() {
    let d = steel_member_3d(&simply_supported_3d(None, udl_gravity_alpha0()));
    close(d.my, W * L * L / 8.0, "My = wL²/8");
    close(d.vy.unwrap(), W * L / 2.0, "web shear = wL/2");
}

#[test]
fn gravity_beam_matches_the_2d_solve() {
    let d3 = steel_member_3d(&simply_supported_3d(None, midspan_gravity()));
    let d2 = governing_steel(&extract_steel_demands_2d(&simply_supported_2d(), DemandStrategy::MaxAbsMoment));
    close(d3.my, d2.my, "3D strong-axis moment vs 2D moment");
    close(d3.vy.unwrap(), d2.vy.unwrap(), "3D web shear vs 2D shear");
    close(d2.vy.unwrap(), P / 2.0, "2D shear = P/2");
}

#[test]
fn gravity_beam_alpha0_check_ratios_use_strong_axis_demands() {
    let d = steel_member_3d(&simply_supported_3d(None, midspan_gravity()));
    let r = &check_steel_members(&SteelCheckInput { members: vec![ipe300(1)], forces: vec![d] })[0];
    close(r.flexure_y_ratio, P * L / 4.0 / phi_mn_y(), "Flexure-Y ratio");
    close(r.flexure_z_ratio, 0.0, "Flexure-Z ratio");
    close(r.shear_ratio, P / 2.0 / phi_vn(), "Shear G2 ratio");
}

#[test]
fn certified_gravity_beam_alpha0_fails_on_web_shear() {
    let span = 1.0;
    let w = 900.0;
    let mut solver = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, span, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, false, false]), (2, vec![false, true, true, false, false, false])],
        vec![],
    );
    solver.loads.clear();
    let mc = MultiCaseInput3D {
        solver,
        load_cases: vec![LoadCase3D {
            name: "G".into(),
            loads: vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
                q_xi: 0.0, q_xj: 0.0, element_id: 1,
                q_yi: 0.0, q_yj: 0.0, q_zi: -w, q_zj: -w, a: None, b: None,
            })],
        }],
        combinations: vec![CombinationDef { name: "1.0G".into(), factors: [("G".to_string(), 1.0)].into_iter().collect() }],
    };
    let out = certify_steel_multi_case_3d(&SteelMultiCaseInput3D { multi_case: mc, members: vec![ipe300(1)], stations: Some(21) })
        .unwrap();
    let r = &out.steel[0];
    assert!(r.certified, "{r:?}");
    let shear = r.checks.iter().find(|c| c.name == "Shear G2").unwrap();
    let flex = r.checks.iter().find(|c| c.name == "Flexure-Y F2").unwrap();
    let expect_v = w * span / 2.0 / phi_vn();
    let expect_m = w * span * span / 8.0 / phi_mn_y();
    assert!(expect_v > 1.0 && expect_m < 1.0);
    assert!((shear.upper - expect_v).abs() <= 1e-6 * expect_v, "shear {shear:?} vs {expect_v}");
    assert!((flex.upper - expect_m).abs() <= 1e-6 * expect_m, "flexure {flex:?} vs {expect_m}");
    assert!(!r.certified_ok && r.certified_fail, "{r:?}");
    assert_eq!(r.governing_check, "Shear G2");
}

#[test]
fn rolled_beam_alpha90_bends_about_the_weak_axis() {
    let d = steel_member_3d(&simply_supported_3d(Some(90.0), midspan_gravity()));
    close(d.my, 0.0, "My");
    close(d.mz.unwrap(), P * L / 4.0, "Mz = PL/4");
    close(d.vy.unwrap(), 0.0, "web shear");
}

#[test]
fn column_lateral_x_is_strong_axis() {
    let d = steel_member_3d(&cantilever_column(10.0, 0.0));
    close(d.my, 30.0, "My = PH");
    close(d.mz.unwrap(), 0.0, "Mz");
    close(d.vy.unwrap(), 10.0, "web shear = P");
}

#[test]
fn column_lateral_y_is_weak_axis() {
    let d = steel_member_3d(&cantilever_column(0.0, 10.0));
    close(d.my, 0.0, "My");
    close(d.mz.unwrap(), 30.0, "Mz = PH");
    close(d.vy.unwrap(), 0.0, "web shear");
}

fn rc_beam(id: usize) -> RCMemberData {
    serde_json::from_value(serde_json::json!({
        "elementId": id, "fc": 25e6, "fy": 420e6, "b": 0.3, "h": 0.6, "d": 0.55, "asTension": 6e-4,
        "av": 1.0e-4, "sStirrup": 0.2
    }))
    .unwrap()
}

#[test]
fn rc_gravity_beam_alpha0_uses_strong_axis_moment_and_shear() {
    let demands = extract_rc_demands_3d(&stations_3d(&simply_supported_3d(None, udl_gravity_alpha0())), DemandStrategy::MaxAbsMoment);
    let mu = demands.iter().map(|d| d.mu.abs()).fold(0.0, f64::max);
    let vu = demands.iter().map(|d| d.vu.unwrap_or(0.0).abs()).fold(0.0, f64::max);
    close(mu, W * L * L / 8.0, "Mu = wL²/8");
    close(vu, W * L / 2.0, "Vu = wL/2");
    let forces: Vec<RCDesignForces> = demands
        .iter()
        .map(|d| RCDesignForces { element_id: d.element_id, mu: d.mu * 1e3, vu: d.vu.map(|v| v * 1e3), nu: Some(0.0) })
        .collect();
    let checks = check_rc_members(&RCCheckInput { members: vec![rc_beam(1), rc_beam(2)], forces });
    let a = 6e-4 * 420e6 / (0.85 * 25e6 * 0.3);
    let phi_mn = 0.9 * 6e-4 * 420e6 * (0.55 - a / 2.0);
    let ratio = checks.iter().map(|c| c.flexure_ratio).fold(0.0, f64::max);
    assert!((checks[0].phi_mn - phi_mn).abs() <= 1e-3 * phi_mn, "φMn {} vs {phi_mn}", checks[0].phi_mn);
    close(ratio, W * L * L / 8.0 * 1e3 / phi_mn, "flexure ratio");
}

//! Production-engine checks for Research pages; see BENCHMARK_REFERENCES.md.
//! Models are built here in Rust, without importing research crates or solver output.
use crate::common::make_beam;
use dedaliano_engine::{
    solver::{
        arc_length::{solve_arc_length, ArcLengthInput},
        buckling, corotational, linear,
    },
    types::*,
};
use serde_json::json;

fn relative(actual: f64, reference: f64, tolerance: f64) {
    let error = (actual / reference - 1.).abs();
    assert!(actual.is_finite() && error < tolerance,
        "actual={actual:.15}, reference={reference:.15}, relative error={error:.9}, tolerance={tolerance}");
}

#[test]
fn signed_response_checks_reject_reversals() {
    for (response, reference) in [
        ("downward cantilever displacement", -0.0036),
        ("positive moment displacement", 0.009),
        ("positive moment rotation", 0.003),
        ("in-plane shell displacement", 0.1081),
        ("out-of-plane shell displacement", 0.4321),
    ] {
        relative(reference, reference, 0.02);
        assert!(
            std::panic::catch_unwind(|| relative(-reference, reference, 0.02)).is_err(),
            "reversed {response} must fail"
        );
    }
}

// Analytical Euler–Bernoulli adaptation in validation/benchmarks/patch_tests.rs;
// NOT the paper’s solid/shell mesh or material. PL³/(3EI), ML²/(2EI), ML/(EI).
// Existing assert_close divides by max(reference, 1), so does not enforce 2% here.
#[test]
fn macneal_frame_shear_and_moment() {
    for n in [1, 2, 4, 8] {
        let input = make_beam(
            n,
            6.,
            200000.,
            0.01,
            1e-4,
            "fixed",
            None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1,
                fx: 0.,
                fz: -1.,
                my: 0.,
            })],
        );
        let r = linear::solve_2d(&input).unwrap();
        relative(
            r.displacements
                .iter()
                .find(|d| d.node_id == n + 1)
                .unwrap()
                .uz,
            -0.0036,
            0.02,
        );
    }
    let input = make_beam(
        4,
        6.,
        200000.,
        0.01,
        1e-4,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: 0.,
            fz: 0.,
            my: 10.,
        })],
    );
    let r = linear::solve_2d(&input).unwrap();
    let d = r.displacements.iter().find(|d| d.node_id == 5).unwrap();
    // The 2D beam convention gives positive uz and ry for positive tip my.
    relative(d.uz, 0.009, 0.02);
    relative(d.ry, 0.003, 0.02);
}

fn macneal_quad(mesh: usize, in_plane: bool) -> SolverInput3D {
    let mut nodes = serde_json::Map::new();
    let mut quads = serde_json::Map::new();
    for i in 0..=6 {
        let shift = if i == 0 || i == 6 || mesh == 0 {
            0.
        } else if mesh == 1 && i % 2 == 0 {
            0.1
        } else {
            -0.1
        };
        for j in 0..2 {
            let id = 2 * i + j + 1;
            let x = i as f64 + if j == 0 { shift } else { -shift };
            nodes.insert(
                id.to_string(),
                json!({"id":id,"x":x,"y":j as f64*0.2,"z":0.}),
            );
        }
        if i < 6 {
            let id = i + 1;
            quads.insert(
                id.to_string(),
                json!({"id":id,"nodes":[2*i+1,2*i+3,2*i+4,2*i+2],"materialId":1,"thickness":0.1}),
            );
        }
    }
    let loads: Vec<_> = [13,14].into_iter().map(|id| json!({"type":"nodal","data":{"nodeId":id,"fx":0.,"fy":if in_plane {0.5} else {0.},"fz":if in_plane {0.} else {0.5},"mx":0.,"my":0.,"mz":0.}})).collect();
    serde_json::from_value(json!({"nodes":nodes,"quads":quads,"elements":{},"sections":{},"materials":{"1":{"id":1,"e":10000.,"nu":0.3}},
        "supports":{"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},"2":{"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},"loads":loads})).unwrap()
}
// MacNeal–Harder straight cantilever; values and 6×1 mesh transcribed from
// solid_shell_locking.rs. Original page/table not yet verified. MITC4 uses midsurface nodes.
// Geometry: Fig. 4, p. 7 (page provenance; numerical table remains unverified).
fn macneal_displacement(mesh: usize, in_plane: bool) {
    let r = linear::solve_3d(&macneal_quad(mesh, in_plane)).unwrap();
    let value = [13, 14]
        .iter()
        .map(|id| {
            let d = r.displacements.iter().find(|d| d.node_id == *id).unwrap();
            if in_plane {
                d.uy
            } else {
                d.uz
            }
        })
        .sum::<f64>()
        / 2.;
    relative(value, if in_plane { 0.1081 } else { 0.4321 }, 0.02);
}

#[test]
fn macneal_regular_in() {
    macneal_displacement(0, true);
}

#[test]
fn macneal_regular_out() {
    macneal_displacement(0, false);
}

#[test]
#[ignore = "known wrong result: #798"]
fn macneal_trapezoidal_in() {
    macneal_displacement(1, true);
}

#[test]
#[ignore = "known wrong result: #798"]
fn macneal_trapezoidal_out() {
    macneal_displacement(1, false);
}

#[test]
#[ignore = "known wrong result: #798"]
fn macneal_parallelogram_in() {
    macneal_displacement(2, true);
}

#[test]
#[ignore = "known wrong result: #798"]
fn macneal_parallelogram_out() {
    macneal_displacement(2, false);
}

// Fixed-direction tip-force elastica (not a follower force). References are
// independently evaluated elliptic integrals, not the old provisional table.
// See BENCHMARK_REFERENCES.md, "Mattiasson Elastica", for the derivation,
// reproducible generator, axial-extension correction and refinement measurements.
fn elastica_response(parameter: f64, n: usize, area: f64, steps: usize) -> (f64, f64) {
    // E is in MPa; the engine converts it to kN/m². EI=20000 kN m²,
    // L=2 m, hence P=parameter*5000 kN. No shear area => Euler–Bernoulli.
    let input = make_beam(
        n,
        2.,
        200000.,
        area,
        1e-4,
        "fixed",
        None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.,
            fz: -parameter * 5000.,
            my: 0.,
        })],
    );
    let r = corotational::solve_corotational_2d(&input, 50, 1e-8, steps, false).unwrap();
    let d = r
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    eprintln!(
        "elastica q={parameter}, n={n}, A={area}, steps={steps}: u/L={:.12}, w/L={:.12}, converged={}, load={}",
        -d.ux / 2., -d.uz / 2., r.converged, r.load_factor
    );
    assert!(
        r.converged && (r.load_factor - 1.).abs() < 1e-6,
        "full load required"
    );
    (-d.ux / 2., -d.uz / 2.)
}

fn elastica(parameter: f64, u: f64, w: f64) {
    // A=1 reduces P/EA to <=0.00025; residual extensibility changes either
    // reference by <=0.025%. Retain the original A=.01 model separately below.
    // Measured worst errors at 16/32/64 elements: .0801/.0384/.0281%.
    // All tolerances are tighter than the former 2%; refinement must improve
    // BOTH signed displacements, not merely land inside an acceptance band.
    let mut previous = (f64::INFINITY, f64::INFINITY);
    for (n, tolerance) in [(16, 0.001), (32, 0.0005), (64, 0.0003)] {
        let actual = elastica_response(parameter, n, 1., 100);
        relative(actual.0, u, tolerance);
        relative(actual.1, w, tolerance);
        let error = ((actual.0 - u).abs(), (actual.1 - w).abs());
        assert!(
            error.0 < previous.0 && error.1 < previous.1,
            "mesh refinement: {previous:?} -> {error:?}"
        );
        previous = error;
    }
}
#[test]
fn mattiasson_1() {
    elastica(1., 0.056433236283377, 0.301720773799814);
}
#[test]
fn mattiasson_2() {
    elastica(2., 0.160641720825167, 0.493457480396712);
}
#[test]
fn mattiasson_5() {
    elastica(5., 0.387628360724430, 0.713791523611913);
}
#[test]
fn mattiasson_10() {
    elastica(10., 0.554995597753751, 0.810609024880296);
}

#[test]
fn mattiasson_original_area_extensible() {
    // Independent extensible Kirchhoff-rod BVP, not engine-generated snapshots.
    // Keep the original A=.01 inputs, including q=10, with a 0.01% check at
    // 64 elements. This prevents suppressing an axial-stiffness defect by only
    // testing a nearly inextensible beam.
    for (q, u, w) in [
        (1., 0.055819791294775, 0.302213694059550),
        (2., 0.159261091516678, 0.495690076153543),
        (5., 0.385373098137779, 0.722663728094834),
        (10., 0.552095793299974, 0.830630993307244),
    ] {
        let actual = elastica_response(q, 64, 0.01, 100);
        relative(actual.0, u, 0.0001);
        relative(actual.1, w, 0.0001);
    }
}

#[test]
fn mattiasson_load_step_independence() {
    // The original 10 increments (delta q=1) exhausted 50 Newton iterations.
    // Smaller steps reach the SAME full-load equilibrium for both areas.
    for area in [0.01, 1.] {
        let coarse = elastica_response(10., 16, area, 20);
        let fine = elastica_response(10., 16, area, 100);
        relative(coarse.0, fine.0, 1e-8);
        relative(coarse.1, fine.1, 1e-8);
    }
}
fn roorda(n: usize, eccentricity: f64) -> SolverInput {
    assert!((2..=80).contains(&n));
    assert!(eccentricity.is_finite() && eccentricity.abs() <= 0.01);
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=2 * n {
        let (x, z) = if i <= n {
            (0., i as f64 / n as f64)
        } else {
            ((i - n) as f64 / n as f64, 1.)
        };
        nodes.insert((i + 1).to_string(), json!({"id":i+1,"x":x,"z":z}));
    }
    for i in 0..2 * n {
        elements.insert((i+1).to_string(),json!({"id":i+1,"type":"frame","nodeI":i+1,"nodeJ":i+2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}));
    }
    let input:SolverInput=serde_json::from_value(json!({"nodes":nodes,"elements":elements,"materials":{"1":{"id":1,"e":21.,"nu":0.3}},"sections":{"1":{"id":1,"a":0.01,"iz":1e-4/12.}},"supports":{"1":{"id":1,"nodeId":1,"type":"pinned"},"2":{"id":2,"nodeId":2*n+1,"type":"pinned"}},"loads":[{"type":"nodal","data":{"nodeId":n+1,"fx":0.,"fz":-1.,"my":eccentricity}}]})).unwrap();
    input
}

// Ferrari & Sigmund (2025), DOI 10.1002/nme.70082, §2.1.2 / Fig. 1a.
// Printed p. 5: numerical λ1=2.4313, absolute tolerance 1e-4.
// 2.431355677 is the page's engine result, not an unrounded paper reference.
#[test]
fn ferrari_roorda_numerical() {
    let value = buckling::solve_buckling_2d(&roorda(10, 0.), 1)
        .unwrap()
        .modes[0]
        .load_factor;
    assert!((value - 2.4313).abs() < 1e-4, "lambda1={value}");
    assert!(
        (value - 2.431355677).abs() < 1e-8,
        "page regression lambda1={value}"
    );
}
// Same paper, printed p. 4: reported closed-form λ1=2.430, relative tolerance 0.1%.
#[test]
fn ferrari_roorda_closed_form() {
    relative(
        buckling::solve_buckling_2d(&roorda(40, 0.), 1)
            .unwrap()
            .modes[0]
            .load_factor,
        2.430,
        0.001,
    );
}

// von Mises two-bar truss equilibrium, using the formulation documented in
// engine/tests/validation/domains/nonlinear/nonlinear_extended.rs; arc-length
// method reference: M. A. Crisfield, Non-linear Finite Element Analysis of
// Solids and Structures, Vol. 1, Ch. 9 (Wiley, 1991), cited as a general arc-length reference; the exact
// values below come from the closed-form truss equilibrium, not from the book.
// P(y)=2EA(1-L/L0)y/L, L²=a²+y². The page uses frame elements; the
// analytical reference omits bending. Rerun prefixes to recover apex uz,
// because control_displacement is a different DOF.
fn checked_path_residual(v: f64, load: f64, exact: f64, limit_p: f64) -> f64 {
    assert!(v.is_finite(), "non-finite path displacement: {v}");
    assert!(load.is_finite(), "non-finite path load: {load}");
    assert!(exact.is_finite(), "non-finite analytical force: {exact}");
    let residual = (load - exact).abs() / limit_p;
    assert!(residual.is_finite(), "non-finite path residual: {residual}");
    residual
}

#[test]
#[should_panic(expected = "non-finite path displacement")]
fn path_check_rejects_nan_away_from_peak() {
    // The finite peak would pass even if max silently discarded the later NaN.
    let samples = [(1., 2., 2.), (f64::NAN, 1., f64::NAN)];
    let mut max_error = 0.0_f64;
    for (v, load, exact) in samples {
        max_error = max_error.max(checked_path_residual(v, load, exact, 2.));
    }
    assert!(max_error <= 0.05);
}

#[test]
fn path_check_rejects_nonfinite_values() {
    assert_eq!(checked_path_residual(1., 2., 2., 2.), 0.);
    for (v, load, exact, limit_p) in [
        (f64::INFINITY, 2., 2., 2.),
        (1., f64::NAN, 2., 2.),
        (1., 2., f64::NAN, 2.),
        // Finite operands can still produce an infinite residual.
        (1., f64::MAX, -f64::MAX, 2.),
        (1., 2., 2., 0.),
    ] {
        assert!(
            std::panic::catch_unwind(|| checked_path_residual(v, load, exact, limit_p)).is_err(),
            "non-finite path sample or residual must fail"
        );
    }
}

fn riks_check(
    mut input: ArcLengthInput,
    apex: usize,
    a: f64,
    h: f64,
    p: f64,
    limit_p: f64,
    limit_v: f64,
) -> Vec<(f64, f64)> {
    let full = solve_arc_length(&input).unwrap();
    assert!(full.converged);
    assert_eq!(full.steps.len(), input.max_steps);
    let ea = input.solver.materials["1"].e * 1000. * input.solver.sections["1"].a;
    let mut samples = Vec::new();
    let mut max_error = 0.0_f64;
    for k in 1..=full.steps.len() {
        input.max_steps = k;
        let prefix = solve_arc_length(&input).unwrap();
        assert!(prefix.converged);
        assert_eq!(
            serde_json::to_value(&prefix.steps).unwrap(),
            serde_json::to_value(&full.steps[..k]).unwrap()
        );
        let v = -prefix
            .results
            .displacements
            .iter()
            .find(|d| d.node_id == apex)
            .unwrap()
            .uz;
        let load = prefix.final_load_factor * p;
        let y = h - v;
        let l = a.hypot(y);
        let exact = 2. * ea * (1. - l / a.hypot(h)) * y / l;
        max_error = max_error.max(checked_path_residual(v, load, exact, limit_p));
        samples.push((load, v));
    }
    eprintln!(
        "final sample={:?}, min dv={}",
        samples.last(),
        samples
            .windows(2)
            .map(|w| w[1].1 - w[0].1)
            .fold(f64::INFINITY, f64::min)
    );
    let peak = samples
        .windows(2)
        .position(|w| w[0].0 > 0. && w[1].0 < w[0].0);
    let i = peak.unwrap_or_else(|| {
        samples
            .iter()
            .enumerate()
            .max_by(|a, b| a.1 .0.total_cmp(&b.1 .0))
            .unwrap()
            .0
    });
    eprintln!(
        "peak={:?}, reached={}, reference=({limit_p}, {limit_v}), path error={max_error}",
        samples[i],
        peak.is_some()
    );
    assert!(
        max_error <= 0.05,
        "normalized equilibrium path error={max_error}"
    );
    relative(samples[i].0, limit_p, 0.05);
    assert!(peak.is_some(), "upper limit point must be reached");
    relative(samples[i].1, limit_v, 0.05);
    samples
}

fn shallow_toggle() -> ArcLengthInput {
    let input: ArcLengthInput = serde_json::from_value(json!({"solver": {"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}, "3": {"id": 3, "x": 2.0, "z": 0.1}}, "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}}, "sections": {"1": {"id": 1, "a": 0.01, "iz": 0.0001}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}, "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}}, "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 2, "type": "pinned"}}, "loads": [{"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -50.0, "my": 0.0}}], "constraints": [], "connectors": {}}, "maxSteps": 100, "maxIter": 30, "tolerance": 1e-05, "initialDs": 0.05, "minDs": 1e-08, "maxDs": 0.5, "targetIter": 5})).unwrap();
    input
}

#[test]
fn riks_shallow_toggle() {
    let mut input = shallow_toggle();
    for element in input.solver.elements.values_mut() {
        element.elem_type = "truss".into();
    }
    input.max_steps = 2000;
    input.max_ds = 0.25;
    input.tolerance = 1e-10;
    let samples = riks_check(
        input,
        3,
        2.0,
        0.1,
        50.0,
        95.98504891452458,
        0.04228900098628047,
    );
    assert!(
        samples.windows(2).all(|w| w[1].1 > w[0].1),
        "path must never turn back"
    );
    assert!(
        samples.last().unwrap().1 > 0.2,
        "must pass both limits and the unloaded inverted state"
    );
    for &(load, v) in &samples {
        let y = 0.1 - v;
        let l = 2.0_f64.hypot(y);
        let exact = 4e6 * (1. - l / 2.0_f64.hypot(0.1)) * y / l;
        assert!(
            (load - exact).abs() / 95.98504891452458 < 1e-8,
            "v={v}, load={load}, exact={exact}"
        );
    }
    let i = samples.windows(2).position(|w| w[1].0 < w[0].0).unwrap();
    let (p0, v0) = samples[i - 1];
    let (p1, v1) = samples[i];
    let (p2, v2) = samples[i + 1];
    let s0 = (p1 - p0) / (v1 - v0);
    let s1 = (p2 - p1) / (v2 - v1);
    let curvature = (s1 - s0) / (v2 - v0);
    let v_peak = (v0 + v1 - s0 / curvature) / 2.;
    let p_peak = p0 + s0 * (v_peak - v0) + curvature * (v_peak - v0) * (v_peak - v1);
    eprintln!(
        "interpolated peak=({p_peak}, {v_peak}), samples={:?}",
        &samples[i - 1..=i + 1]
    );
    relative(p_peak, 95.98504891452458, 0.001);
    relative(v_peak, 0.04228900098628047, 0.001);
}

#[test]
fn riks_shallow_frame_energy_reference() {
    let mut input = shallow_toggle();
    input.tolerance = 1e-10;
    input.initial_ds = 25.;
    input.max_ds = 25.;
    let mut max_error = 0.0_f64;
    let mut last_v = 0.;
    for k in 1..=160 {
        input.max_steps = k;
        let result = solve_arc_length(&input).unwrap();
        assert!(result.converged);
        assert_eq!(result.steps.len(), k);
        let v = -result
            .results
            .displacements
            .iter()
            .find(|d| d.node_id == 3)
            .unwrap()
            .uz;
        let a = 2.0_f64;
        let h = 0.1_f64;
        let l0 = a.hypot(h);
        let y = h - v;
        let l = a.hypot(y);
        let beta = (y / a).atan() - (h / a).atan();
        let axial = 2. * 2e6 * (1. - l / l0) * y / l;
        let bending = -6. * 2e4 / l0 * beta * a / l.powi(2);
        let exact = axial + bending;
        let load = result.final_load_factor * 50.;
        relative(load, exact, 1e-8);
        max_error = max_error.max((load / exact - 1.).abs());
        assert!(v > last_v);
        last_v = v;
    }
    eprintln!("frame energy reference: max relative error={max_error}, final v={last_v}");
    assert!(max_error < 1e-8);
    assert!(last_v > 0.2);
}

#[test]
fn riks_von_mises_truss() {
    let input: ArcLengthInput = serde_json::from_value(json!({"solver": {"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 2.0}, "3": {"id": 3, "x": 6.0, "z": 0.0}}, "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}}, "sections": {"1": {"id": 1, "a": 0.001, "iz": 1e-08}}, "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}, "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}}, "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": 3, "type": "pinned"}}, "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -1000.0, "my": 0.0}}], "constraints": [], "connectors": {}}, "maxSteps": 700, "maxIter": 30, "tolerance": 1e-08, "initialDs": 25.0, "minDs": 1e-06, "maxDs": 25.0, "targetIter": 5})).unwrap();
    riks_check(
        input,
        2,
        3.0,
        2.0,
        1000.0,
        15672.742997591187,
        0.9166559507513323,
    );
}

// Zmyślony, Khan & Biggins (2026), arXiv v2 2601.06598, Eq.(2) p.3,
// Eq.(3) p.4; supplementary S2.6 and S2.8. Central 70% threshold:
// 21.52 sqrt(epsilon), p.3 after Eq.(2), also Table S1 on supplementary p.8
// (combined PDF p.17). Test-local Hermite integration follows the page.
mod arches {
    use super::*;
    #[derive(Clone)]
    pub struct Mode {
        pub force: f64,
        pub y: Vec<f64>,
        pub slope: Vec<f64>,
    }

    pub fn basis(n: usize, count: usize) -> Result<Vec<Mode>, String> {
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        let mut loads = vec![];
        for i in 0..=n {
            nodes.insert(i.to_string(), json!({"id":i,"x":i as f64/n as f64,"z":0}));
            if i < n {
                elements.insert(
                i.to_string(),
                json!({"id":i,"type":"frame","nodeI":i,"nodeJ":i+1,"materialId":0,"sectionId":0}),
            );
                loads.push(json!({"type":"thermal","data":{"elementId":i,"dtUniform":1.0,"dtGradient":0.0,"alpha":0.00001}}));
            }
        }
        let input: SolverInput = serde_json::from_value(json!({"nodes":nodes,"elements":elements,
        "materials":{"0":{"id":0,"e":1000,"nu":0.3}},
        "sections":{"0":{"id":0,"a":0.1,"iz":0.000001}},
        "supports":{"0":{"id":0,"nodeId":0,"type":"fixed"},"1":{"id":1,"nodeId":n,"type":"fixed"}},"loads":loads})).map_err(|e|e.to_string())?;
        let result = buckling::solve_buckling_2d(&input, count)?;
        result
            .modes
            .into_iter()
            .map(|m| {
                let mut y = vec![0.; n + 1];
                let mut slope = y.clone();
                for d in m.displacements {
                    y[d.node_id] = d.uz;
                    slope[d.node_id] = d.ry;
                }
                let norm = (0..n)
                    .map(|j| {
                        let h = 1. / n as f64;
                        let a = 6. * (y[j] - y[j + 1]) / h + 3. * (slope[j] + slope[j + 1]);
                        let b = 6. * (y[j + 1] - y[j]) / h - 4. * slope[j] - 2. * slope[j + 1];
                        let c = slope[j];
                        h * (a * a / 5. + a * b / 2. + (b * b + 2. * a * c) / 3. + b * c + c * c)
                            / 2.
                    })
                    .sum::<f64>()
                    .sqrt();
                if !norm.is_finite() || norm < 1e-12 {
                    return Err("invalid mode normalization".into());
                }
                let sign = if y[n / 2] < -1e-8 { -1. } else { 1. };
                for v in &mut y {
                    *v *= sign / norm;
                }
                for v in &mut slope {
                    *v *= sign / norm;
                }
                Ok(Mode {
                    force: m.load_factor,
                    y,
                    slope,
                })
            })
            .collect()
    }

    fn slope_at(mode: &Mode, x: f64) -> f64 {
        let n = mode.y.len() - 1;
        let j = ((x * n as f64).floor() as usize).min(n - 1);
        let t = x * n as f64 - j as f64;
        let h = 1. / n as f64;
        (6. * t * t - 6. * t) * mode.y[j] / h
            + (3. * t * t - 4. * t + 1.) * mode.slope[j]
            + (-6. * t * t + 6. * t) * mode.y[j + 1] / h
            + (3. * t * t - 2. * t) * mode.slope[j + 1]
    }

    pub fn coefficients(modes: &[Mode], width: f64) -> Vec<f64> {
        modes
            .iter()
            .enumerate()
            .map(|(i, m)| {
                if i % 2 == 1 {
                    0.
                } else {
                    (slope_at(m, (1. + width) / 2.) - slope_at(m, (1. - width) / 2.)) / 2.
                }
            })
            .collect()
    }
    fn spectrum(modes: &[Mode], c: &[f64], f: f64) -> f64 {
        modes
            .iter()
            .zip(c)
            .filter(|(_, c)| c.abs() > 1e-12)
            .map(|(m, c)| (c / (f - m.force)).powi(2))
            .sum()
    }
    pub fn threshold(modes: &[Mode], width: f64) -> (f64, f64) {
        let c = coefficients(modes, width);
        let mut lo = modes[0].force + 1e-8;
        let mut hi = modes[1].force;
        for _ in 0..100 {
            let a = lo + (hi - lo) / 3.;
            let b = hi - (hi - lo) / 3.;
            if spectrum(modes, &c, a) < spectrum(modes, &c, b) {
                hi = b;
            } else {
                lo = a;
            }
        }
        let f = (lo + hi) / 2.;
        (1. / spectrum(modes, &c, f).sqrt(), f)
    }

    #[test]
    fn production_modes_and_published_threshold() {
        let m = basis(64, 16).unwrap();
        relative(m[0].force, 4. * std::f64::consts::PI.powi(2), 1e-5);
        relative(m[1].force, 80.7629142257, 1e-5);
        let value = threshold(&m, 0.7).0;
        assert!((value - 21.52).abs() < 0.02, "threshold={value}");
    }
}

// Fairclough et al. (2026), accepted manuscript printed p.28 (PDF p.29),
// Table 1 first row (five nodes), §4.3: V=13.8394. The conic optimizer is
// research-only; the engine checks the exported 128-segment frame, whose
// volume approximates the conic volume to 0.2%, and force balance to 1e-8.
// Fixture contains only curve coordinates and areas from PR #837; the Rust
// builder reconstructs nodes, sections, supports and lumped self-weight.
fn fairclough_model(curves: &[Vec<[f64; 4]>]) -> serde_json::Value {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut sections = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut weights = vec![0.; 129];
    nodes.insert(
        "1".into(),
        json!({"id":1,"x":0.,"y":0.,"z":curves[0][32][2]}),
    );
    let mut node_id = 2;
    let mut element_id = 1;
    for (c, curve) in curves.iter().enumerate() {
        let mut ids = Vec::new();
        for (k, p) in curve.iter().enumerate() {
            if k == 32 {
                ids.push(1);
                continue;
            }
            let id = node_id;
            node_id += 1;
            nodes.insert(id.to_string(), json!({"id":id,"x":p[0],"y":p[1],"z":p[2]}));
            ids.push(id);
            if k == 0 {
                supports.insert((c+1).to_string(), json!({"nodeId":id,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false}));
            }
        }
        for k in 0..32 {
            let id = element_id;
            element_id += 1;
            let area = (curve[k][3] + curve[k + 1][3]) / 2.;
            let inertia = area * area / (4. * std::f64::consts::PI);
            sections.insert(
                id.to_string(),
                json!({"id":id,"a":area,"iy":inertia,"iz":inertia,"j":2.*inertia}),
            );
            elements.insert(id.to_string(), json!({"id":id,"type":"frame","nodeI":ids[k],"nodeJ":ids[k+1],"materialId":1,"sectionId":id}));
            let length = (0..3)
                .map(|d| (curve[k + 1][d] - curve[k][d]).powi(2))
                .sum::<f64>()
                .sqrt();
            let weight = 1.65 * area * length;
            weights[ids[k] - 1] += weight / 2.;
            weights[ids[k + 1] - 1] += weight / 2.;
        }
    }
    weights[0] += 1.;
    let loads: Vec<_> = weights.iter().enumerate().map(|(i, w)| json!({"type":"nodal","data":{"nodeId":i+1,"fx":0.,"fy":0.,"fz":-w,"mx":0.,"my":0.,"mz":0.}})).collect();
    json!({"nodes":nodes,"elements":elements,"sections":sections,"materials":{"1":{"id":1,"e":1000.,"nu":0.3}},"supports":supports,"loads":loads})
}

#[test]
fn fairclough_frame_equilibrium() {
    let curves: Vec<Vec<[f64; 4]>> =
        serde_json::from_str(include_str!("fixtures/research-fairclough-curves.json")).unwrap();
    let input: SolverInput3D = serde_json::from_value(fairclough_model(&curves)).unwrap();
    let volume: f64 = input
        .elements
        .values()
        .map(|e| {
            let a = &input.nodes[&e.node_i.to_string()];
            let b = &input.nodes[&e.node_j.to_string()];
            input.sections[&e.section_id.to_string()].a
                * (a.x - b.x).hypot(a.y - b.y).hypot(a.z - b.z)
        })
        .sum();
    relative(volume, 13.8394, 0.002);
    let r = linear::solve_3d(&input).unwrap();
    let applied: f64 = input
        .loads
        .iter()
        .map(|l| match l {
            SolverLoad3D::Nodal(n) => n.fz,
            _ => panic!("unexpected load"),
        })
        .sum();
    let reaction: f64 = r.reactions.iter().map(|r| r.fz).sum();
    relative(reaction, -applied, 1e-8);
    assert!(r
        .displacements
        .iter()
        .all(|d| d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite()));
    assert!(r.displacements.iter().any(|d| d.uz.abs() > 0.));
}

// GitHub #741/#818: exact rational eigenvalue is in
// [4688.92034, 4688.92035]; #818 requires relative accuracy 1e-6.
// This is the separate 3D fuzz regression, NOT Ferrari's Roorda frame.
#[test]
#[ignore = "known wrong result: #818"]
fn buckling_818_exact_reference() {
    let input: SolverInput3D = serde_json::from_value(json!({"elements": {"1": {"id": 1, "materialId": 1, "nodeI": 1, "nodeJ": 2, "sectionId": 1, "type": "frame"}, "2": {"id": 2, "materialId": 1, "nodeI": 2, "nodeJ": 3, "sectionId": 1, "type": "frame"}, "3": {"id": 3, "materialId": 1, "nodeI": 3, "nodeJ": 4, "sectionId": 1, "type": "frame"}}, "loads": [{"data": {"elementId": 3, "qYI": -3330997229.0, "qYJ": -18.011781194247305, "qZI": 4.009405128657818, "qZJ": -7.76929097622633}, "type": "distributed"}], "materials": {"1": {"e": 200000, "id": 1, "nu": 0.3}}, "nodes": {"1": {"id": 1, "x": 0, "y": 0, "z": 0}, "2": {"id": 2, "x": 5.741907958187831, "y": 5, "z": 0}, "3": {"id": 3, "x": 0.9414404305807742, "y": 4.848409259226173, "z": 3.27579596824944}, "4": {"id": 4, "x": 3.7865452979101173, "y": 2, "z": 0.3494559196841771}}, "sections": {"1": {"a": 0.00538, "id": 1, "iy": 8.356e-05, "iz": 6.04e-06, "j": 2.01e-07}}, "supports": {"1": {"nodeId": 1, "rrx": true, "rry": true, "rrz": true, "rx": true, "ry": true, "rz": true}, "2": {"nodeId": 2, "rrx": false, "rry": false, "rrz": false, "rx": true, "ry": true, "rz": true}}})).unwrap();
    let value = buckling::solve_buckling_3d(&input, 1).unwrap().modes[0].load_factor;
    relative(value, 4688.920345, 1e-6);
}

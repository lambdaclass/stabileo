use crate::units_legacy_3d as legacy;
use dedaliano_engine::solver::linear::{solve_2d, solve_2d_typed, solve_3d};
use dedaliano_engine::types::units::*;
use dedaliano_engine::types::*;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

fn fixtures(three_d: bool) -> Vec<(String, String)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut out: Vec<(String, String)> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.contains("3d") == three_d && name.ends_with("input.json")
        })
        .map(|p| (p.display().to_string(), std::fs::read_to_string(&p).unwrap()))
        .collect();
    out.sort();
    out
}

fn bits(v: f64) -> u64 {
    v.to_bits()
}

fn sorted<T: Serialize>(map: &HashMap<String, T>) -> String {
    serde_json::to_string(&map.iter().collect::<BTreeMap<_, _>>()).unwrap()
}

fn opt(v: Option<f64>) -> Option<u64> {
    v.map(bits)
}

fn support_bits_2d(s: &HashMap<String, SolverSupport>) -> Vec<(String, Vec<Option<u64>>)> {
    let mut out: Vec<_> = s
        .iter()
        .map(|(k, s)| (k.clone(), [s.kx, s.ky, s.kz, s.dx, s.dz, s.dry, s.angle].into_iter().map(opt).collect()))
        .collect();
    out.sort();
    out
}

fn support_bits_3d(s: &HashMap<String, SolverSupport3D>) -> Vec<(String, Vec<Option<u64>>)> {
    let mut out: Vec<_> = s
        .iter()
        .map(|(k, s)| {
            let v = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.dx, s.dy, s.dz, s.drx, s.dry, s.drz, s.kw, s.normal_x, s.normal_y, s.normal_z];
            (k.clone(), v.into_iter().map(opt).collect())
        })
        .collect();
    out.sort();
    out
}

fn roll_bits(e: &HashMap<String, SolverElement3D>) -> Vec<(String, Option<u64>)> {
    let mut out: Vec<_> = e.iter().map(|(k, e)| (k.clone(), opt(e.roll_angle))).collect();
    out.sort();
    out
}

fn load_bits_2d(loads: &[SolverLoad]) -> Vec<Vec<Option<u64>>> {
    loads
        .iter()
        .map(|l| match l {
            SolverLoad::Distributed(d) => vec![Some(bits(d.q_i)), Some(bits(d.q_j)), opt(d.a), opt(d.b)],
            SolverLoad::AxialDistributed(d) => vec![Some(bits(d.q_i)), Some(bits(d.q_j)), opt(d.a), opt(d.b)],
            SolverLoad::Thermal(t) => vec![Some(bits(t.dt_uniform)), Some(bits(t.dt_gradient)), opt(t.alpha), opt(t.depth)],
            SolverLoad::Nodal(_) | SolverLoad::PointOnElement(_) => vec![],
        })
        .collect()
}

fn load_bits_3d(loads: &[SolverLoad3D]) -> Vec<Vec<Option<u64>>> {
    use SolverLoad3D as L;
    loads
        .iter()
        .map(|l| match l {
            L::Distributed(d) => [d.q_xi, d.q_xj, d.q_yi, d.q_yj, d.q_zi, d.q_zj].into_iter().map(|v| Some(bits(v))).chain([opt(d.a), opt(d.b)]).collect(),
            L::Thermal(t) => vec![
                Some(bits(t.dt_uniform)),
                Some(bits(t.dt_gradient_y)),
                Some(bits(t.dt_gradient_z)),
                opt(t.alpha),
                opt(t.depth_y),
                opt(t.depth_z),
            ],
            L::Pressure(p) | L::QuadPressure(p) | L::Quad9Pressure(p) | L::SolidShellPressure(p) | L::CurvedShellPressure(p) => {
                vec![Some(bits(p.pressure))]
            }
            L::PlateThermal(t) | L::QuadThermal(t) | L::Quad9Thermal(t) | L::CurvedShellThermal(t) => {
                vec![Some(bits(t.dt_uniform)), Some(bits(t.dt_gradient)), opt(t.alpha)]
            }
            L::QuadEdge(e) | L::Quad9Edge(e) | L::CurvedShellEdge(e) => vec![Some(e.edge as u64), Some(bits(e.qn)), Some(bits(e.qt))],
            L::Nodal(_)
            | L::PointOnElement(_)
            | L::Bimoment(_)
            | L::QuadSelfWeight(_)
            | L::Quad9SelfWeight(_)
            | L::SolidShellSelfWeight(_)
            | L::CurvedShellSelfWeight(_) => vec![],
        })
        .collect()
}

fn without_timings(value: Value) -> String {
    fn strip(v: &mut Value) {
        match v {
            Value::Object(m) => {
                m.remove("timings");
                m.values_mut().for_each(strip);
            }
            Value::Array(a) => a.iter_mut().for_each(strip),
            _ => {}
        }
    }
    let mut value = value;
    strip(&mut value);
    value.to_string()
}

fn every_2d_field() -> Value {
    json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.14159, "z": 0.0}, "3": {"id": 3, "x": 6.0, "z": 0.5}, "4": {"id": 4, "x": 9.0, "z": 0.5}},
        "materials": {"1": {"id": 1, "e": 27123.456789, "nu": 0.271}},
        "sections": {"1": {"id": 1, "a": 0.0137, "iz": 0.000173, "asY": 0.006127}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "frame", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed", "dx": 0.001, "dy": -0.0, "drz": 1e-4},
            "2": {"id": 2, "nodeId": 3, "type": "spring", "kx": 1234.5, "ky": 9876.5, "kz": 321.25, "angle": 0.3},
            "3": {"id": 3, "nodeId": 4, "type": "pinned", "dx": -0.0, "dz": -0.002, "dry": null, "angle": null}
        },
        "loads": [
            {"type": "distributed", "data": {"elementId": 1, "qI": -5.5, "qJ": -2.25}},
            {"type": "distributed", "data": {"elementId": 2, "qI": -0.0, "qJ": 1e-9, "a": 0.25, "b": 2.0}},
            {"type": "axialDistributed", "data": {"elementId": 3, "qI": 1.5, "qJ": -0.0, "a": 0.0, "b": null}},
            {"type": "thermal", "data": {"elementId": 1, "dtUniform": 20.5, "dtGradient": -7.25}},
            {"type": "thermal", "data": {"elementId": 2, "dtUniform": -0.0, "dtGradient": 3.0, "alpha": 1.0e-5, "depth": 0.45}},
            {"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fz": -3.0, "my": 0.0}}
        ]
    })
}

fn every_3d_field() -> Value {
    json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0},
            "3": {"id": 3, "x": 3.0, "y": 2.5, "z": 0.0}, "4": {"id": 4, "x": 0.0, "y": 2.5, "z": 0.0},
            "5": {"id": 5, "x": 3.0, "y": 0.0, "z": 3.5}
        },
        "materials": {"1": {"id": 1, "e": 27123.456789, "nu": 0.271}},
        "sections": {"1": {"id": 1, "a": 0.0137, "iy": 0.000173, "iz": 0.0001234567, "j": 1.7e-6, "asY": 0.006127}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 2, "nodeJ": 5, "materialId": 1, "sectionId": 1, "rollAngle": 30.0},
            "2": {"id": 2, "type": "frame", "nodeI": 3, "nodeJ": 5, "materialId": 1, "sectionId": 1, "rollAngle": -0.0, "releaseMyEnd": true}
        },
        "plates": {"7": {"id": 7, "nodes": [1, 2, 3], "materialId": 1, "thickness": 0.2}},
        "quads": {"8": {"id": 8, "nodes": [1, 2, 3, 4], "materialId": 1, "thickness": 0.15}},
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "dz": -0.001, "dry": -0.0, "drz": 2e-4},
            "2": {"nodeId": 4, "rx": true, "ry": true, "rz": false, "rrx": false, "rry": true, "rrz": true, "kz": 4567.5, "krx": 89.125, "dx": 0.0},
            "3": {"nodeId": 2, "rx": false, "ry": false, "rz": true, "rrx": false, "rry": false, "rrz": false, "kx": 1e4, "ky": 2e4, "kry": 3.5, "krz": -0.0, "drx": null}
        },
        "loads": [
            {"type": "distributed", "data": {"elementId": 1, "qYI": -5, "qYJ": -2.5, "qZI": 0, "qZJ": 1.25}},
            {"type": "distributed", "data": {"elementId": 2, "qXI": 0.5, "qXJ": -0.0, "qYI": 1e-9, "qYJ": 0, "qZI": -3, "qZJ": -3, "a": 0.5, "b": 1.75}},
            {"type": "thermal", "data": {"elementId": 1, "dtUniform": 15.5, "dtGradientY": -4.0, "dtGradientZ": 2.5}},
            {"type": "thermal", "data": {"elementId": 2, "dtUniform": -0.0, "dtGradientY": 0, "dtGradientZ": 6, "alpha": 1.0e-5, "depthY": 0.3, "depthZ": 0.2}},
            {"type": "pressure", "data": {"elementId": 7, "pressure": -2.75}},
            {"type": "plateThermal", "data": {"elementId": 7, "dtUniform": 10.0, "dtGradient": 5.0, "alpha": 1.1e-5}},
            {"type": "quadPressure", "data": {"elementId": 8, "pressure": 1.5}},
            {"type": "quadThermal", "data": {"elementId": 8, "dtUniform": -8.0}},
            {"type": "quadEdge", "data": {"elementId": 8, "edge": 1, "qn": 2.5, "qt": -0.0}},
            {"type": "quadEdge", "data": {"elementId": 8, "edge": 3}}
        ]
    })
}

fn every_shell_load_tag() -> Value {
    let mut model = every_3d_field();
    model["loads"] = json!([
        {"type": "quad9Pressure", "data": {"elementId": 1, "pressure": -0.0}},
        {"type": "quad9Thermal", "data": {"elementId": 1, "dtUniform": 1.5, "dtGradient": -0.0, "alpha": null}},
        {"type": "quad9Edge", "data": {"elementId": 1, "edge": 2, "qn": 1e-9}},
        {"type": "solidShellPressure", "data": {"elementId": 1, "pressure": 3.25}},
        {"type": "curvedShellPressure", "data": {"elementId": 1, "pressure": 4.5}},
        {"type": "curvedShellThermal", "data": {"elementId": 1, "dtUniform": 2.0, "dtGradient": 7.5, "alpha": 2.3e-5}},
        {"type": "curvedShellEdge", "data": {"elementId": 1, "edge": 0, "qt": -6.5}},
        {"type": "bimoment", "data": {"nodeId": 1, "bimoment": 0.5}},
        {"type": "quadSelfWeight", "data": {"elementId": 8, "density": 2500, "gz": -9.81}}
    ]);
    model
}

#[test]
fn units_2d_distributed_thermal_and_supports_parse_to_the_same_bits_and_results() {
    let mut inputs = fixtures(false);
    inputs.push(("every 2D field".into(), every_2d_field().to_string()));
    let (mut parsed, mut solved) = (0, 0);
    for (what, text) in inputs {
        let legacy = serde_json::from_str::<SolverInput>(&text);
        let typed = serde_json::from_str::<ElasticInput2D>(&text);
        let (legacy, typed) = match (legacy, typed) {
            (Ok(l), Ok(t)) => (l, t),
            (Err(l), Err(t)) => {
                assert_eq!(l.to_string(), t.to_string(), "{what}");
                continue;
            }
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        };
        let erased = typed.clone().into_legacy();
        assert_eq!(serde_json::to_string(&erased.loads).unwrap(), serde_json::to_string(&legacy.loads).unwrap(), "{what}");
        assert_eq!(sorted(&erased.supports), sorted(&legacy.supports), "{what}");
        assert_eq!(support_bits_2d(&erased.supports), support_bits_2d(&legacy.supports), "{what}");
        assert_eq!(load_bits_2d(&erased.loads), load_bits_2d(&legacy.loads), "{what}");
        parsed += 1;
        match (solve_2d(&legacy), solve_2d_typed(&typed)) {
            (Ok(l), Ok(t)) => {
                assert_eq!(
                    without_timings(serde_json::to_value(&t).unwrap()),
                    without_timings(serde_json::to_value(&l).unwrap()),
                    "{what}"
                );
                solved += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l, t, "{what}"),
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(parsed >= 30, "only {parsed} 2D fixtures parsed");
    assert!(solved >= 30, "only {solved} 2D fixtures solved");
}

#[test]
fn units_2d_every_field_reaches_the_solver_with_its_signed_zeros_and_aliases() {
    let typed = serde_json::from_value::<ElasticInput2D>(every_2d_field()).unwrap();
    assert!(solve_2d_typed(&typed).is_ok());
    let erased = typed.into_legacy();
    let s = &erased.supports["1"];
    assert_eq!((opt(s.dx), opt(s.dz), opt(s.dry)), (Some(bits(0.001)), Some(bits(-0.0)), Some(bits(1e-4))));
    let s = &erased.supports["2"];
    assert_eq!([s.kx, s.ky, s.kz, s.angle].map(opt), [Some(bits(1234.5)), Some(bits(9876.5)), Some(bits(321.25)), Some(bits(0.3))]);
    let s = &erased.supports["3"];
    assert_eq!((opt(s.dx), opt(s.dz), s.dry, s.angle), (Some(bits(-0.0)), Some(bits(-0.002)), None, None));
    let SolverLoad::Distributed(d) = &erased.loads[1] else { panic!() };
    assert_eq!((bits(d.q_i), bits(d.q_j), opt(d.a), opt(d.b)), (bits(-0.0), bits(1e-9), Some(bits(0.25)), Some(bits(2.0))));
    let SolverLoad::AxialDistributed(d) = &erased.loads[2] else { panic!() };
    assert_eq!((bits(d.q_j), opt(d.a), d.b), (bits(-0.0), Some(bits(0.0)), None));
    let SolverLoad::Thermal(t) = &erased.loads[3] else { panic!() };
    assert_eq!((bits(t.dt_uniform), bits(t.dt_gradient), t.alpha, t.depth), (bits(20.5), bits(-7.25), None, None));
    let SolverLoad::Thermal(t) = &erased.loads[4] else { panic!() };
    assert_eq!((bits(t.dt_uniform), opt(t.alpha), opt(t.depth)), (bits(-0.0), Some(bits(1.0e-5)), Some(bits(0.45))));
}

#[test]
fn units_3d_distributed_thermal_and_supports_parse_to_the_same_bits_and_results() {
    let mut inputs = fixtures(true);
    inputs.push(("every 3D field".into(), every_3d_field().to_string()));
    inputs.push(("every shell load tag".into(), every_shell_load_tag().to_string()));
    let (mut parsed, mut solved) = (0, 0);
    for (what, text) in inputs {
        let typed = serde_json::from_str::<ElasticInput3D>(&text).map_err(|e| e.to_string());
        let (legacy, typed) = match (legacy::parse(&text), typed) {
            (Ok(l), Ok(t)) => (l, t),
            (Err(l), Err(t)) => {
                assert_eq!(t, l, "{what}");
                continue;
            }
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        };
        let erased = typed.into_legacy();
        assert_eq!(serde_json::to_string(&erased.loads).unwrap(), serde_json::to_string(&legacy.loads).unwrap(), "{what}");
        assert_eq!(sorted(&erased.supports), sorted(&legacy.supports), "{what}");
        assert_eq!(sorted(&erased.elements), sorted(&legacy.elements), "{what}");
        assert_eq!(support_bits_3d(&erased.supports), support_bits_3d(&legacy.supports), "{what}");
        assert_eq!(roll_bits(&erased.elements), roll_bits(&legacy.elements), "{what}");
        assert_eq!(load_bits_3d(&erased.loads), load_bits_3d(&legacy.loads), "{what}");
        parsed += 1;
        match (solve_3d(&legacy), solve_3d(&erased)) {
            (Ok(l), Ok(t)) => {
                assert_eq!(
                    without_timings(serde_json::to_value(&t).unwrap()),
                    without_timings(serde_json::to_value(&l).unwrap()),
                    "{what}"
                );
                solved += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l, t, "{what}"),
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(parsed >= 31, "only {parsed} 3D inputs parsed");
    assert!(solved >= 31, "only {solved} 3D inputs solved");
}

#[test]
fn units_3d_every_field_reaches_the_solver_with_its_signed_zeros() {
    let erased = serde_json::from_value::<ElasticInput3D>(every_3d_field()).unwrap().into_legacy();
    assert!(solve_3d(&erased).is_ok());
    assert_eq!(opt(erased.elements["1"].roll_angle), Some(bits(30.0)));
    assert_eq!(opt(erased.elements["2"].roll_angle), Some(bits(-0.0)));
    let s = &erased.supports["1"];
    assert_eq!([s.dz, s.dry, s.drz, s.dx].map(opt), [Some(bits(-0.001)), Some(bits(-0.0)), Some(bits(2e-4)), None]);
    let s = &erased.supports["3"];
    assert_eq!([s.kx, s.ky, s.kry, s.krz, s.drx].map(opt), [Some(bits(1e4)), Some(bits(2e4)), Some(bits(3.5)), Some(bits(-0.0)), None]);
    let SolverLoad3D::Distributed(d) = &erased.loads[0] else { panic!() };
    assert_eq!((bits(d.q_xi), bits(d.q_xj), d.a), (bits(0.0), bits(0.0), None));
    let SolverLoad3D::Distributed(d) = &erased.loads[1] else { panic!() };
    assert_eq!((bits(d.q_xj), bits(d.q_yi), opt(d.b)), (bits(-0.0), bits(1e-9), Some(bits(1.75))));
    let SolverLoad3D::Thermal(t) = &erased.loads[3] else { panic!() };
    assert_eq!([Some(t.dt_uniform), t.alpha, t.depth_y, t.depth_z].map(opt), [Some(bits(-0.0)), Some(bits(1.0e-5)), Some(bits(0.3)), Some(bits(0.2))]);
    let SolverLoad3D::QuadThermal(t) = &erased.loads[7] else { panic!() };
    assert_eq!((bits(t.dt_uniform), bits(t.dt_gradient), t.alpha), (bits(-8.0), bits(0.0), None));
    let SolverLoad3D::QuadEdge(e) = &erased.loads[8] else { panic!() };
    assert_eq!((e.edge, bits(e.qn), bits(e.qt)), (1, bits(2.5), bits(-0.0)));
    let SolverLoad3D::QuadEdge(e) = &erased.loads[9] else { panic!() };
    assert_eq!((bits(e.qn), bits(e.qt)), (bits(0.0), bits(0.0)));
}

fn malformed_cases() -> Vec<(&'static str, &'static str, Value)> {
    vec![
        ("loads", "distributed string qI", json!([{"type": "distributed", "data": {"elementId": 1, "qI": "1", "qJ": 0, "qYI": "1", "qYJ": 0, "qZI": 0, "qZJ": 0}}])),
        ("loads", "distributed missing qJ", json!([{"type": "distributed", "data": {"elementId": 1, "qI": 1, "qYI": 1, "qZI": 0, "qZJ": 0}}])),
        ("loads", "distributed bool a", json!([{"type": "distributed", "data": {"elementId": 1, "qI": 1, "qJ": 1, "qYI": 1, "qYJ": 1, "qZI": 0, "qZJ": 0, "a": true}}])),
        ("loads", "distributed null qXI", json!([{"type": "distributed", "data": {"elementId": 1, "qI": 1, "qJ": 1, "qXI": null, "qYI": 1, "qYJ": 1, "qZI": 0, "qZJ": 0}}])),
        ("loads", "axial string b", json!([{"type": "axialDistributed", "data": {"elementId": 1, "qI": 1, "qJ": 1, "b": "2"}}])),
        ("loads", "thermal missing gradient", json!([{"type": "thermal", "data": {"elementId": 1, "dtUniform": 10}}])),
        ("loads", "thermal string alpha", json!([{"type": "thermal", "data": {"elementId": 1, "dtUniform": 1, "dtGradient": 1, "dtGradientY": 1, "dtGradientZ": 1, "alpha": "1e-5"}}])),
        ("loads", "thermal string depth", json!([{"type": "thermal", "data": {"elementId": 1, "dtUniform": 1, "dtGradient": 1, "dtGradientY": 1, "dtGradientZ": 1, "depth": "0.3", "depthY": "0.3"}}])),
        ("loads", "pressure string", json!([{"type": "pressure", "data": {"elementId": 1, "pressure": "2"}}])),
        ("loads", "quad pressure missing", json!([{"type": "quadPressure", "data": {"elementId": 1}}])),
        ("loads", "plate thermal string gradient", json!([{"type": "plateThermal", "data": {"elementId": 1, "dtUniform": 1, "dtGradient": "x"}}])),
        ("loads", "quad edge string qn", json!([{"type": "quadEdge", "data": {"elementId": 1, "edge": 0, "qn": "1"}}])),
        ("loads", "curved edge null qt", json!([{"type": "curvedShellEdge", "data": {"elementId": 1, "edge": 0, "qt": null}}])),
        ("supports", "string spring", json!({"1": {"id": 1, "nodeId": 1, "type": "spring", "kx": "100", "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}})),
        ("supports", "string rotational spring", json!({"1": {"id": 1, "nodeId": 1, "type": "spring", "kz": "1", "krz": "1", "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}})),
        ("supports", "bool prescribed", json!({"1": {"id": 1, "nodeId": 1, "type": "fixed", "dx": true, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}})),
        ("supports", "string prescribed rotation alias", json!({"1": {"id": 1, "nodeId": 1, "type": "fixed", "drz": "0.1", "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}})),
        ("supports", "string angle", json!({"1": {"id": 1, "nodeId": 1, "type": "inclinedRoller", "angle": "0.5", "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true, "kw": "1"}})),
        ("supports", "missing node", json!({"1": {"id": 1, "type": "fixed", "rx": true}})),
        ("supports", "support is a number", json!({"1": 4})),
        ("elements", "string roll angle", json!({"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "rollAngle": "30"}})),
        ("elements", "unknown element field", json!({"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "rollAngel": 30}})),
        ("elements", "element missing section", json!({"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1}})),
    ]
}

fn err<T: serde::de::DeserializeOwned>(text: &str) -> Result<(), String> {
    serde_json::from_str::<T>(text).map(|_| ()).map_err(|e| e.to_string())
}

#[test]
fn units_malformed_distributed_thermal_and_support_inputs_give_the_same_message() {
    let mut compared = 0;
    for (field, what, bad) in malformed_cases() {
        let mut model = every_2d_field();
        model[field] = bad.clone();
        let text = model.to_string();
        let legacy2 = err::<SolverInput>(&text);
        assert_eq!(err::<ElasticInput2D>(&text), legacy2, "2D model {what}");
        compared += legacy2.is_err() as usize;
        let mut model = every_3d_field();
        model[field] = bad.clone();
        let text = model.to_string();
        let legacy3 = legacy::parse(&text).map(|_| ());
        assert!(legacy3.is_err(), "3D model {what} parsed");
        assert_eq!(err::<ElasticInput3D>(&text), legacy3, "3D model {what}");
        assert_eq!(err::<SolverInput3D>(&text), legacy3, "3D model {what}");
        compared += 1;
        let text = bad.to_string();
        match field {
            "loads" => {
                assert_eq!(err::<Vec<TypedLoad>>(&text), err::<Vec<SolverLoad>>(&text), "2D records {what}");
                assert_eq!(err::<Vec<TypedLoad3D>>(&text), err::<Vec<SolverLoad3D>>(&text), "3D records {what}");
            }
            "supports" => {
                assert_eq!(err::<HashMap<String, TypedSupport>>(&text), err::<HashMap<String, SolverSupport>>(&text), "2D records {what}");
                assert_eq!(err::<HashMap<String, TypedSupport3D>>(&text), err::<HashMap<String, SolverSupport3D>>(&text), "3D records {what}");
            }
            _ => assert_eq!(err::<HashMap<String, TypedElement3D>>(&text), err::<HashMap<String, SolverElement3D>>(&text), "3D records {what}"),
        }
    }
    assert!(compared >= 40, "only {compared} malformed inputs were rejected");
}

#[test]
fn units_malformed_slice_4_records_name_the_legacy_struct() {
    for text in [r#""x""#, "7", "[1, 2]", "{}"] {
        assert_eq!(err::<TypedDistributedLoad>(text), err::<SolverDistributedLoad>(text), "{text}");
        assert_eq!(err::<TypedAxialDistributedLoad>(text), err::<SolverAxialDistributedLoad>(text), "{text}");
        assert_eq!(err::<TypedThermalLoad>(text), err::<SolverThermalLoad>(text), "{text}");
        assert_eq!(err::<TypedDistributedLoad3D>(text), err::<SolverDistributedLoad3D>(text), "{text}");
        assert_eq!(err::<TypedThermalLoad3D>(text), err::<SolverThermalLoad3D>(text), "{text}");
        assert_eq!(err::<TypedPressureLoad>(text), err::<SolverPressureLoad>(text), "{text}");
        assert_eq!(err::<TypedPlateThermalLoad>(text), err::<SolverPlateThermalLoad>(text), "{text}");
        assert_eq!(err::<TypedQuadEdgeLoad>(text), err::<SolverQuadEdgeLoad>(text), "{text}");
        assert_eq!(err::<TypedSupport>(text), err::<SolverSupport>(text), "{text}");
        assert_eq!(err::<TypedSupport3D>(text), err::<SolverSupport3D>(text), "{text}");
        assert_eq!(err::<TypedElement3D>(text), err::<SolverElement3D>(text), "{text}");
    }
}

#[test]
fn units_typed_records_serialize_to_the_legacy_text() {
    for (model, three_d) in [(every_2d_field(), false), (every_3d_field(), true), (every_shell_load_tag(), true)] {
        let text = model.to_string();
        if three_d {
            let typed: ElasticInput3D = serde_json::from_str(&text).unwrap();
            let legacy = legacy::parse(&text).unwrap();
            assert_eq!(serde_json::to_string(&typed.loads).unwrap(), serde_json::to_string(&legacy.loads).unwrap());
            assert_eq!(sorted(&typed.supports), sorted(&legacy.supports));
            assert_eq!(sorted(&typed.elements), sorted(&legacy.elements));
        } else {
            let typed: ElasticInput2D = serde_json::from_str(&text).unwrap();
            let legacy: SolverInput = serde_json::from_str(&text).unwrap();
            assert_eq!(serde_json::to_string(&typed.loads).unwrap(), serde_json::to_string(&legacy.loads).unwrap());
            assert_eq!(sorted(&typed.supports), sorted(&legacy.supports));
        }
    }
}

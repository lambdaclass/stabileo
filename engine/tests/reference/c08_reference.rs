use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn slave_load_reference(dim: usize, constraint: &str, force: &[f64], moment: &[f64]) -> Value {
    let mut support = json!({"nodeId": 1, "type": "fixed"});
    for key in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
        support[key] = json!(true);
    }
    let mut load = json!({"nodeId": 2});
    let force_keys: &[&str] = if dim == 2 {
        &["fx", "fz"]
    } else {
        &["fx", "fy", "fz"]
    };
    let moment_keys: &[&str] = if dim == 2 {
        &["my"]
    } else {
        &["mx", "my", "mz"]
    };
    for (key, value) in force_keys
        .iter()
        .zip(force)
        .chain(moment_keys.iter().zip(moment))
    {
        load[*key] = json!(value);
    }
    let input = json!({
        "nodes": {"1": {"id": 1, "x": 0, "y": 0, "z": 0}, "2": {"id": 2, "x": 2, "y": 3, "z": 4}},
        "materials": {"1": {"e": 200, "nu": 0.25}},
        "sections": {"1": {"a": 1, "iy": 1, "iz": 1, "j": 1}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": support},
        "constraints": [{"type": constraint, "masterNode": 1, "slaveNode": 2, "dofs": []}],
        "loads": [{"type": "nodal", "data": load}]
    });
    let script = r#"import json, runpy, sys
from decimal import localcontext
module = runpy.run_path(sys.argv[1])
with localcontext() as context:
    context.prec = 90
    print(json.dumps(module['refs'](json.load(sys.stdin))))
"#;
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../docs/results-changes/1753-c08-reference.py");
    let mut child = Command::new("python3")
        .args(["-B", "-I", "-c", script])
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(
            serde_json::to_string(&json!({"input": input, "dim": dim}))
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn check_reaction(reference: &Value, tag: &str, expected: &[f64]) {
    let items = reference["items"].as_array().unwrap();
    let item = items
        .iter()
        .find(|item| item["node"] == 1 && item["tag"] == tag)
        .unwrap();
    let actual: Vec<f64> = item["values"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().parse().unwrap())
        .collect();
    assert_eq!(actual, expected, "support {tag}");
    for item in items
        .iter()
        .filter(|item| item["tag"] == "u" || item["tag"] == "r" || item["tag"] == "ry")
    {
        for value in item["values"].as_array().unwrap() {
            assert_eq!(value.as_str().unwrap().parse::<f64>().unwrap(), 0.0);
        }
    }
}

#[test]
#[ignore = "known wrong result: #1753"]
fn issue_1753_c08_reference_equal_dof_transfers_slave_axial_load_to_fixed_master() {
    let reference = slave_load_reference(2, "equalDOF", &[7.0, 0.0], &[0.0]);
    check_reaction(&reference, "R", &[-7.0, 0.0]);
    check_reaction(&reference, "RM", &[0.0]);
}

#[test]
#[ignore = "known wrong result: #1753"]
fn issue_1753_c08_reference_rigid_link_transfers_slave_force_and_lever_moment_2d() {
    let (fx, fz, my) = (5.0, -7.0, 11.0);
    let reference = slave_load_reference(2, "rigidLink", &[fx, fz], &[my]);
    check_reaction(&reference, "R", &[-fx, -fz]);
    check_reaction(&reference, "RM", &[-(2.0 * fz - 4.0 * fx + my)]);
}

#[test]
#[ignore = "known wrong result: #1753"]
fn issue_1753_c08_reference_equal_dof_transfers_slave_forces_and_moments_3d() {
    let reference = slave_load_reference(3, "equalDOF", &[5.0, -7.0, 11.0], &[13.0, 17.0, -19.0]);
    check_reaction(&reference, "R", &[-5.0, 7.0, -11.0]);
    check_reaction(&reference, "RM", &[-13.0, -17.0, 19.0]);
}

#[test]
#[ignore = "known wrong result: #1753"]
fn issue_1753_c08_reference_rigid_link_transfers_slave_force_and_lever_moment_3d() {
    let force = [5.0, -7.0, 11.0];
    let moment = [13.0, 17.0, -19.0];
    let offset = [2.0, 3.0, 4.0];
    let expected: Vec<f64> = (0..3)
        .map(|i| {
            let (j, k) = ((i + 1) % 3, (i + 2) % 3);
            -(moment[i] + offset[j] * force[k] - offset[k] * force[j])
        })
        .collect();
    let reference = slave_load_reference(3, "rigidLink", &force, &moment);
    check_reaction(&reference, "R", &force.map(|v| -v));
    check_reaction(&reference, "RM", &expected);
}

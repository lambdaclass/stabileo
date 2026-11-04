use serde::{Deserialize, Serialize};
#[cfg(test)]
use serde_json::Value;

pub const VERTICAL_AXIS_3D: &str = "z";
pub const DEFAULT_HORIZONTAL_PLANE_3D: &str = "XY";
pub const GRAVITY_DIRECTION_3D: [f64; 3] = [0.0, 0.0, -1.0];

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAxis {
    Y,
    Z,
}

#[cfg(test)]
pub fn node_elevation(node: &Value) -> Option<f64> {
    node.get("z").and_then(Value::as_f64)
}

#[cfg(test)]
pub fn assert_z_up_snapshot(snapshot: &Value) {
    assert_eq!(snapshot["analysisMode"].as_str(), Some("3d"));

    let nodes = snapshot["nodes"].as_array().expect("3D snapshot must contain nodes");
    assert!(nodes.iter().all(|n| n[1].get("z").is_some()), "3D nodes must carry z elevation");

    let min_z = nodes
        .iter()
        .filter_map(|n| node_elevation(&n[1]))
        .fold(f64::INFINITY, f64::min);

    let supports = snapshot["supports"].as_array().expect("3D snapshot must contain supports");
    for support in supports {
        let node_id = support[1]["nodeId"].as_u64().expect("support nodeId") as u32;
        let node = nodes
            .iter()
            .find(|n| n[0].as_u64() == Some(node_id as u64))
            .expect("support node exists");
        let z = node_elevation(&node[1]).expect("support node elevation");
        assert!((z - min_z).abs() < 1e-6, "base supports must lie on minimum z");
    }
}

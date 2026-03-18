use serde_json::Value;
use std::collections::HashSet;

use crate::error::AppError;

/// Validate a raw model snapshot before returning it to the frontend.
/// Returns `Ok(warnings)` on success, `Err` on fatal validation failures.
pub fn validate_snapshot(snapshot: &Value) -> Result<Vec<String>, AppError> {
    let mut warnings = Vec::new();

    let obj = snapshot
        .as_object()
        .ok_or_else(|| AppError::BadRequest("snapshot must be a JSON object".into()))?;

    // Required top-level arrays
    let nodes = get_array(obj, "nodes")?;
    let elements = get_array(obj, "elements")?;
    let materials = get_array(obj, "materials")?;
    let sections = get_array(obj, "sections")?;
    let supports = get_array(obj, "supports")?;

    if nodes.is_empty() {
        return Err(AppError::BadRequest("nodes must not be empty".into()));
    }
    if elements.is_empty() {
        return Err(AppError::BadRequest("elements must not be empty".into()));
    }
    if supports.is_empty() {
        return Err(AppError::BadRequest(
            "at least one support is required for stability".into(),
        ));
    }
    if materials.is_empty() {
        return Err(AppError::BadRequest("materials must not be empty".into()));
    }
    if sections.is_empty() {
        return Err(AppError::BadRequest("sections must not be empty".into()));
    }

    // Collect IDs and check uniqueness
    let node_ids = collect_ids(nodes, "node")?;
    let elem_ids = collect_ids(elements, "element")?;
    let mat_ids = collect_ids(materials, "material")?;
    let sec_ids = collect_ids(sections, "section")?;
    let _sup_ids = collect_ids(supports, "support")?;

    // Validate element references
    for entry in elements {
        let (id, data) = parse_entry(entry)?;
        let node_i = data
            .get("nodeI")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let node_j = data
            .get("nodeJ")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        if let Some(ni) = node_i {
            if !node_ids.contains(&ni) {
                return Err(AppError::BadRequest(format!(
                    "element {id} references non-existent nodeI={ni}"
                )));
            }
        }
        if let Some(nj) = node_j {
            if !node_ids.contains(&nj) {
                return Err(AppError::BadRequest(format!(
                    "element {id} references non-existent nodeJ={nj}"
                )));
            }
        }

        // Check section/material refs
        if let Some(sid) = data.get("sectionId").and_then(|v| v.as_u64()).map(|v| v as u32) {
            if !sec_ids.contains(&sid) {
                return Err(AppError::BadRequest(format!(
                    "element {id} references non-existent sectionId={sid}"
                )));
            }
        }
        if let Some(mid) = data.get("materialId").and_then(|v| v.as_u64()).map(|v| v as u32) {
            if !mat_ids.contains(&mid) {
                return Err(AppError::BadRequest(format!(
                    "element {id} references non-existent materialId={mid}"
                )));
            }
        }
    }

    // Validate support node references
    for entry in supports {
        let (id, data) = parse_entry(entry)?;
        if let Some(nid) = data.get("nodeId").and_then(|v| v.as_u64()).map(|v| v as u32) {
            if !node_ids.contains(&nid) {
                return Err(AppError::BadRequest(format!(
                    "support {id} references non-existent nodeId={nid}"
                )));
            }
        }
    }

    // Validate section properties are positive
    for entry in sections {
        let (id, data) = parse_entry(entry)?;
        if let Some(a) = data.get("a").and_then(|v| v.as_f64()) {
            if a <= 0.0 {
                warnings.push(format!("section {id}: area (a) should be positive"));
            }
        }
        if let Some(iz) = data.get("iz").and_then(|v| v.as_f64()) {
            if iz <= 0.0 {
                warnings.push(format!("section {id}: moment of inertia (iz) should be positive"));
            }
        }
    }

    // Validate material E is positive
    for entry in materials {
        let (id, data) = parse_entry(entry)?;
        if let Some(e) = data.get("e").and_then(|v| v.as_f64()) {
            if e <= 0.0 {
                return Err(AppError::BadRequest(format!(
                    "material {id}: elastic modulus (e) must be positive"
                )));
            }
        }
    }

    // Validate load references if present
    if let Some(loads) = obj.get("loads").and_then(|v| v.as_array()) {
        for load in loads {
            let data = if let Some(arr) = load.as_array() {
                arr.get(1).and_then(|v| v.as_object())
            } else {
                load.as_object()
            };
            if let Some(d) = data {
                if let Some(inner) = d.get("data").and_then(|v| v.as_object()) {
                    if let Some(eid) = inner.get("elementId").and_then(|v| v.as_u64()).map(|v| v as u32) {
                        if !elem_ids.contains(&eid) {
                            warnings.push(format!("load references non-existent elementId={eid}"));
                        }
                    }
                    if let Some(nid) = inner.get("nodeId").and_then(|v| v.as_u64()).map(|v| v as u32) {
                        if !node_ids.contains(&nid) {
                            warnings.push(format!("load references non-existent nodeId={nid}"));
                        }
                    }
                }
            }
        }
    }

    Ok(warnings)
}

// ─── Helpers ────────────────────────────────────────────────────

fn get_array<'a>(
    obj: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a Vec<Value>, AppError> {
    obj.get(key)
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::BadRequest(format!("missing or invalid '{key}' array")))
}

/// Entries can be either `[id, {data}]` tuples or `{id, ...}` objects.
fn parse_entry(entry: &Value) -> Result<(u32, &serde_json::Map<String, Value>), AppError> {
    // Tuple format: [id, { ... }]
    if let Some(arr) = entry.as_array() {
        if arr.len() >= 2 {
            let id = arr[0].as_u64().unwrap_or(0) as u32;
            if let Some(obj) = arr[1].as_object() {
                return Ok((id, obj));
            }
        }
    }
    // Object format: { id, ... }
    if let Some(obj) = entry.as_object() {
        let id = obj
            .get("id")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        return Ok((id, obj));
    }
    Err(AppError::BadRequest(format!(
        "invalid entry format: {entry}"
    )))
}

fn collect_ids(entries: &[Value], entity_name: &str) -> Result<HashSet<u32>, AppError> {
    let mut ids = HashSet::new();
    for entry in entries {
        let (id, _) = parse_entry(entry)?;
        if !ids.insert(id) {
            return Err(AppError::BadRequest(format!(
                "duplicate {entity_name} id: {id}"
            )));
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn minimal_snapshot() -> Value {
        json!({
            "analysisMode": "2d",
            "nodes": [[1, {"id": 1, "x": 0, "y": 0}], [2, {"id": 2, "x": 6, "y": 0}]],
            "elements": [[1, {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "sectionId": 1, "materialId": 1}]],
            "materials": [[1, {"id": 1, "name": "Steel A36", "e": 200000, "nu": 0.3}]],
            "sections": [[1, {"id": 1, "name": "IPE 300", "a": 0.005381, "iz": 0.00008356}]],
            "supports": [[1, {"id": 1, "nodeId": 1, "type": "pinned"}]],
            "loads": []
        })
    }

    #[test]
    fn valid_snapshot_passes() {
        let result = validate_snapshot(&minimal_snapshot());
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn missing_nodes_fails() {
        let mut snap = minimal_snapshot();
        snap.as_object_mut().unwrap().remove("nodes");
        assert!(validate_snapshot(&snap).is_err());
    }

    #[test]
    fn empty_supports_fails() {
        let mut snap = minimal_snapshot();
        snap["supports"] = json!([]);
        assert!(validate_snapshot(&snap).is_err());
    }

    #[test]
    fn bad_node_ref_in_element_fails() {
        let mut snap = minimal_snapshot();
        snap["elements"] = json!([[1, {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 99, "sectionId": 1, "materialId": 1}]]);
        assert!(validate_snapshot(&snap).is_err());
    }

    #[test]
    fn duplicate_node_ids_fails() {
        let mut snap = minimal_snapshot();
        snap["nodes"] = json!([[1, {"id": 1, "x": 0, "y": 0}], [1, {"id": 1, "x": 6, "y": 0}]]);
        assert!(validate_snapshot(&snap).is_err());
    }

    #[test]
    fn negative_material_e_fails() {
        let mut snap = minimal_snapshot();
        snap["materials"] = json!([[1, {"id": 1, "name": "Bad", "e": -100}]]);
        assert!(validate_snapshot(&snap).is_err());
    }
}

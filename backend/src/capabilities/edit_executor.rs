//! Edit executor — applies edit actions to an existing model snapshot.
//!
//! Operates on `serde_json::Value` to avoid mirroring the full frontend
//! type system in Rust. The snapshot uses `[id, {data}]` tuples for
//! nodes/elements/supports and `{type, data}` for loads.

use serde_json::{json, Value};

use super::actions::BuildAction;
use super::sections::lookup_section;
use crate::error::AppError;

#[derive(Clone, Copy)]
struct NodeCoord {
    x: f64,
    y: f64,
    z: Option<f64>,
}

/// Apply an edit action to an existing snapshot, returning the modified snapshot.
pub fn apply_edit(action: &BuildAction, snapshot: &Value) -> Result<Value, AppError> {
    let mut snap = snapshot.clone();

    match action {
        BuildAction::AddBay { width, side, beam_section, column_section } => {
            add_bay(&mut snap, *width, side.as_deref(), beam_section.as_deref(), column_section.as_deref())?;
        }
        BuildAction::AddStory { height, beam_section, column_section } => {
            add_story(&mut snap, *height, beam_section.as_deref(), column_section.as_deref())?;
        }
        BuildAction::ChangeSection { section, element_ids, element_filter } => {
            change_section(&mut snap, section, element_ids.as_deref(), element_filter.as_deref())?;
        }
        BuildAction::SetAllSupports { support_type } => {
            set_all_supports(&mut snap, support_type)?;
        }
        BuildAction::SetAllBeamLoads { q } => {
            set_all_beam_loads(&mut snap, *q)?;
        }
        BuildAction::AddLateralLoads { h } => {
            add_lateral_loads(&mut snap, *h)?;
        }
        BuildAction::AddDistributedLoad { element_id, q } => {
            add_distributed_load(&mut snap, *element_id, *q)?;
        }
        BuildAction::AddNodalLoad { node_id, fx, fz, my } => {
            add_nodal_load(&mut snap, *node_id, *fx, *fz, *my)?;
        }
        BuildAction::DeleteElement { element_id } => {
            delete_element(&mut snap, *element_id)?;
        }
        BuildAction::DeleteLoad { load_id } => {
            delete_load(&mut snap, *load_id)?;
        }
        _ => {
            return Err(AppError::BadRequest(format!(
                "Action is not an edit action"
            )));
        }
    }

    Ok(snap)
}

// ─── Helpers ───────────────────────────────────────────────────

fn next_id(snap: &mut Value, key: &str) -> u32 {
    let next = snap["nextId"][key].as_u64().unwrap_or(1) as u32;
    snap["nextId"][key] = json!(next + 1);
    next
}

fn get_node_coords(snap: &Value, node_id: u32) -> Option<NodeCoord> {
    let nodes = snap["nodes"].as_array()?;
    for entry in nodes {
        if entry[0].as_u64() == Some(node_id as u64) {
            let x = entry[1]["x"].as_f64()?;
            let y = entry[1]["y"].as_f64()?;
            let z = entry[1]["z"].as_f64();
            return Some(NodeCoord { x, y, z });
        }
    }
    None
}

fn is_3d_snapshot(snap: &Value) -> bool {
    snap["analysisMode"].as_str() == Some("3d")
}

/// Extract all distinct X values (column lines) sorted ascending.
fn column_lines(snap: &Value) -> Vec<f64> {
    let mut xs: Vec<f64> = snap["nodes"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|n| n[1]["x"].as_f64())
        .collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
    xs
}

/// Extract all distinct Y values (floor levels) sorted ascending.
fn floor_levels(snap: &Value) -> Vec<f64> {
    let is_3d = is_3d_snapshot(snap);
    let mut ys: Vec<f64> = snap["nodes"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|n| {
            if is_3d {
                n[1]["z"].as_f64()
            } else {
                n[1]["y"].as_f64()
            }
        })
        .collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    ys.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
    ys
}

/// Find node ID at given (x, y) coordinates, or None.
fn find_node_at(snap: &Value, x: f64, y: f64) -> Option<u32> {
    snap["nodes"].as_array()?.iter().find_map(|n| {
        let nx = n[1]["x"].as_f64()?;
        let ny = n[1]["y"].as_f64()?;
        if (nx - x).abs() < 1e-6 && (ny - y).abs() < 1e-6 {
            n[0].as_u64().map(|id| id as u32)
        } else {
            None
        }
    })
}

fn find_node_at_3d(snap: &Value, x: f64, y: f64, z: f64) -> Option<u32> {
    snap["nodes"].as_array()?.iter().find_map(|n| {
        let nx = n[1]["x"].as_f64()?;
        let ny = n[1]["y"].as_f64()?;
        let nz = n[1]["z"].as_f64()?;
        if (nx - x).abs() < 1e-6 && (ny - y).abs() < 1e-6 && (nz - z).abs() < 1e-6 {
            n[0].as_u64().map(|id| id as u32)
        } else {
            None
        }
    })
}

fn add_distributed_load_to_snap(snap: &mut Value, element_id: u32, q: f64) {
    let load_id = next_id(snap, "load");
    let load = if is_3d_snapshot(snap) {
        json!({
            "type": "distributed3d",
            "data": {"id": load_id, "elementId": element_id, "qYI": q, "qYJ": q, "qZI": 0.0, "qZJ": 0.0}
        })
    } else {
        json!({
            "type": "distributed",
            "data": {"id": load_id, "elementId": element_id, "qI": q, "qJ": q}
        })
    };
    snap["loads"].as_array_mut().unwrap().push(load);
}

/// Get the first section and material from the snapshot (for reuse).
fn first_section_id(snap: &Value) -> u32 {
    snap["sections"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|s| s[0].as_u64())
        .unwrap_or(1) as u32
}

fn first_material_id(snap: &Value) -> u32 {
    snap["materials"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|m| m[0].as_u64())
        .unwrap_or(1) as u32
}

fn add_node_to_snap(snap: &mut Value, x: f64, y: f64, z: Option<f64>) -> u32 {
    let id = next_id(snap, "node");
    let node = if let Some(z) = z {
        json!([id, {"id": id, "x": x, "y": y, "z": z}])
    } else {
        json!([id, {"id": id, "x": x, "y": y}])
    };
    snap["nodes"].as_array_mut().unwrap().push(node);
    id
}

fn add_element_to_snap(snap: &mut Value, node_i: u32, node_j: u32, mat_id: u32, sec_id: u32) -> u32 {
    let id = next_id(snap, "element");
    let elem = json!([id, {
        "id": id,
        "type": "frame",
        "nodeI": node_i,
        "nodeJ": node_j,
        "materialId": mat_id,
        "sectionId": sec_id,
        "hingeStart": false,
        "hingeEnd": false,
    }]);
    snap["elements"].as_array_mut().unwrap().push(elem);
    id
}

fn clone_element_to_snap(snap: &mut Value, source: &Value, node_i: u32, node_j: u32) -> u32 {
    let id = next_id(snap, "element");
    let mut data = source.clone();
    data["id"] = json!(id);
    data["nodeI"] = json!(node_i);
    data["nodeJ"] = json!(node_j);
    let elem = json!([id, data]);
    snap["elements"].as_array_mut().unwrap().push(elem);
    id
}

fn add_support_to_snap(snap: &mut Value, node_id: u32, support_type: &str) -> u32 {
    let id = next_id(snap, "support");
    let support = json!([id, {"id": id, "nodeId": node_id, "type": support_type}]);
    snap["supports"].as_array_mut().unwrap().push(support);
    id
}

/// Get or create a section by name, returning its ID.
fn ensure_section(snap: &mut Value, name: &str) -> u32 {
    // Check if section already exists
    if let Some(sections) = snap["sections"].as_array() {
        for s in sections {
            if s[1]["name"].as_str() == Some(name) {
                return s[0].as_u64().unwrap_or(1) as u32;
            }
        }
    }

    // Create new section
    let id = next_id(snap, "section");
    let props = lookup_section(name);
    let sec = if let Some(p) = props {
        json!([id, {"id": id, "name": name, "a": p.a, "iz": p.iz}])
    } else {
        // Unknown section — use defaults
        json!([id, {"id": id, "name": name, "a": 0.00538, "iz": 8.356e-5}])
    };
    snap["sections"].as_array_mut().unwrap().push(sec);
    id
}

// ─── Edit implementations ──────────────────────────────────────

fn add_bay(
    snap: &mut Value,
    width: f64,
    side: Option<&str>,
    beam_section: Option<&str>,
    column_section: Option<&str>,
) -> Result<(), AppError> {
    if is_3d_snapshot(snap) {
        return add_bay_3d(snap, width, side, beam_section, column_section);
    }

    let cols = column_lines(snap);
    let floors = floor_levels(snap);

    if cols.is_empty() || floors.len() < 2 {
        return Err(AppError::BadRequest(
            "Cannot add bay: model needs at least 2 floor levels".into(),
        ));
    }

    let side = side.unwrap_or("right");
    let new_x = if side == "left" {
        cols[0] - width
    } else {
        cols[cols.len() - 1] + width
    };

    let mat_id = first_material_id(snap);
    let beam_sec_id = beam_section
        .map(|n| ensure_section(snap, n))
        .unwrap_or_else(|| first_section_id(snap));
    let col_sec_id = column_section
        .map(|n| ensure_section(snap, n))
        .unwrap_or_else(|| first_section_id(snap));

    // The adjacent column line for connecting beams
    let adj_x = if side == "left" { cols[0] } else { cols[cols.len() - 1] };

    // Add nodes at each floor level, columns between consecutive floors, and beams
    let mut prev_node_id: Option<u32> = None;
    for (i, &y) in floors.iter().enumerate() {
        let node_id = add_node_to_snap(snap, new_x, y, None);

        // Column from previous floor to this one
        if let Some(prev_id) = prev_node_id {
            add_element_to_snap(snap, prev_id, node_id, mat_id, col_sec_id);
        }

        // Beam connecting to adjacent column at this floor (skip base level)
        if i > 0 {
            if let Some(adj_node) = find_node_at(snap, adj_x, y) {
                add_element_to_snap(snap, adj_node, node_id, mat_id, beam_sec_id);
            }
        }

        // Support at base
        if i == 0 {
            add_support_to_snap(snap, node_id, "fixed");
        }

        prev_node_id = Some(node_id);
    }

    Ok(())
}

fn add_bay_3d(
    snap: &mut Value,
    width: f64,
    side: Option<&str>,
    beam_section: Option<&str>,
    column_section: Option<&str>,
) -> Result<(), AppError> {
    let xs = column_lines(snap);
    if xs.len() < 2 {
        return Err(AppError::BadRequest(
            "Cannot add bay: 3D model needs at least 2 x-grid lines".into(),
        ));
    }

    let side = side.unwrap_or("right");
    let (outer_x, inner_x, new_x) = if side == "left" {
        (xs[0], xs[1], xs[0] - width)
    } else {
        let last = xs.len() - 1;
        (xs[last], xs[last - 1], xs[last] + width)
    };
    let base_z = *floor_levels(snap).first().unwrap_or(&0.0);

    let beam_override = beam_section.map(|n| ensure_section(snap, n));
    let col_override = column_section.map(|n| ensure_section(snap, n));

    let outer_face_nodes: Vec<(u32, NodeCoord)> = snap["nodes"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|n| {
            let id = n[0].as_u64()? as u32;
            let coord = get_node_coords(snap, id)?;
            if (coord.x - outer_x).abs() < 1e-6 {
                Some((id, coord))
            } else {
                None
            }
        })
        .collect();

    let mut node_map = std::collections::HashMap::new();
    for (old_id, coord) in &outer_face_nodes {
        let new_id = add_node_to_snap(snap, new_x, coord.y, coord.z);
        if coord.z.map(|z| (z - base_z).abs() < 1e-6).unwrap_or(false) {
            add_support_to_snap(snap, new_id, "fixed3d");
        }
        node_map.insert(*old_id, new_id);
    }

    let elements = snap["elements"].as_array().unwrap_or(&vec![]).clone();
    for entry in elements {
        let elem = &entry[1];
        let ni = elem["nodeI"].as_u64().unwrap() as u32;
        let nj = elem["nodeJ"].as_u64().unwrap() as u32;
        let ci = get_node_coords(snap, ni).unwrap();
        let cj = get_node_coords(snap, nj).unwrap();

        let new_pair = if (ci.x - outer_x).abs() < 1e-6 && (cj.x - outer_x).abs() < 1e-6 {
            Some((*node_map.get(&ni).unwrap(), *node_map.get(&nj).unwrap()))
        } else if ((ci.x - inner_x).abs() < 1e-6 && (cj.x - outer_x).abs() < 1e-6)
            || ((ci.x - outer_x).abs() < 1e-6 && (cj.x - inner_x).abs() < 1e-6)
        {
            let old_outer = if (ci.x - outer_x).abs() < 1e-6 { ni } else { nj };
            let old_inner = if old_outer == ni { nj } else { ni };
            let inner_coord = get_node_coords(snap, old_inner).unwrap();
            let shifted_outer = find_node_at_3d(snap, outer_x, inner_coord.y, inner_coord.z.unwrap()).unwrap();
            Some((shifted_outer, *node_map.get(&old_outer).unwrap()))
        } else {
            None
        };

        if let Some((new_i, new_j)) = new_pair {
            let mut cloned = elem.clone();
            if let Some(sec_id) = if (ci.z.unwrap_or(0.0) - cj.z.unwrap_or(0.0)).abs() < 1e-6 {
                beam_override
            } else {
                col_override
            } {
                cloned["sectionId"] = json!(sec_id);
            }
            clone_element_to_snap(snap, &cloned, new_i, new_j);
        }
    }

    Ok(())
}

fn add_story(
    snap: &mut Value,
    height: f64,
    beam_section: Option<&str>,
    column_section: Option<&str>,
) -> Result<(), AppError> {
    let floors = floor_levels(snap);
    if floors.is_empty() {
        return Err(AppError::BadRequest(
            "Cannot add story: model has no nodes".into(),
        ));
    }

    if is_3d_snapshot(snap) {
        add_story_3d(snap, height, beam_section, column_section)?;
    } else {
        add_story_2d(snap, height, beam_section, column_section)?;
    }
    Ok(())
}

fn add_story_2d(
    snap: &mut Value,
    height: f64,
    beam_section: Option<&str>,
    column_section: Option<&str>,
) -> Result<(), AppError> {
    let cols = column_lines(snap);
    let floors = floor_levels(snap);

    if cols.is_empty() || floors.is_empty() {
        return Err(AppError::BadRequest(
            "Cannot add story: model has no nodes".into(),
        ));
    }

    let top_y = floors[floors.len() - 1];
    let new_y = top_y + height;

    let mat_id = first_material_id(snap);
    let beam_sec_id = beam_section
        .map(|n| ensure_section(snap, n))
        .unwrap_or_else(|| first_section_id(snap));
    let col_sec_id = column_section
        .map(|n| ensure_section(snap, n))
        .unwrap_or_else(|| first_section_id(snap));

    let mut new_node_ids = Vec::new();
    for &x in &cols {
        let new_node = add_node_to_snap(snap, x, new_y, None);
        new_node_ids.push(new_node);

        if let Some(top_node) = find_node_at(snap, x, top_y) {
            add_element_to_snap(snap, top_node, new_node, mat_id, col_sec_id);
        }
    }

    for i in 0..new_node_ids.len().saturating_sub(1) {
        add_element_to_snap(snap, new_node_ids[i], new_node_ids[i + 1], mat_id, beam_sec_id);
    }

    Ok(())
}

fn add_story_3d(
    snap: &mut Value,
    height: f64,
    beam_section: Option<&str>,
    column_section: Option<&str>,
) -> Result<(), AppError> {
    let floors = floor_levels(snap);
    let top_z = *floors
        .last()
        .ok_or_else(|| AppError::BadRequest("Cannot add story: model has no floor levels".into()))?;
    let new_z = top_z + height;

    let beam_override = beam_section.map(|n| ensure_section(snap, n));
    let col_override = column_section.map(|n| ensure_section(snap, n));

    let top_nodes: Vec<(u32, NodeCoord)> = snap["nodes"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|n| {
            let id = n[0].as_u64()? as u32;
            let coord = get_node_coords(snap, id)?;
            if coord.z.map(|z| (z - top_z).abs() < 1e-6).unwrap_or(false) {
                Some((id, coord))
            } else {
                None
            }
        })
        .collect();

    if top_nodes.is_empty() {
        return Err(AppError::BadRequest(
            "Cannot add story: top floor has no nodes".into(),
        ));
    }

    let mut node_map = std::collections::HashMap::new();
    for (old_id, coord) in &top_nodes {
        let new_id = add_node_to_snap(snap, coord.x, coord.y, Some(new_z));
        node_map.insert(*old_id, new_id);
    }

    let top_floor_elements: Vec<Value> = snap["elements"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|elem| {
            let ni = elem[1]["nodeI"].as_u64()? as u32;
            let nj = elem[1]["nodeJ"].as_u64()? as u32;
            let ci = get_node_coords(snap, ni)?;
            let cj = get_node_coords(snap, nj)?;
            let on_top = ci.z.map(|z| (z - top_z).abs() < 1e-6).unwrap_or(false)
                && cj.z.map(|z| (z - top_z).abs() < 1e-6).unwrap_or(false);
            if on_top { Some(elem[1].clone()) } else { None }
        })
        .collect();

    let vertical_elements: Vec<Value> = snap["elements"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|elem| {
            let ni = elem[1]["nodeI"].as_u64()? as u32;
            let nj = elem[1]["nodeJ"].as_u64()? as u32;
            let ci = get_node_coords(snap, ni)?;
            let cj = get_node_coords(snap, nj)?;
            let reaches_top = [ci.z?, cj.z?].iter().any(|z| (*z - top_z).abs() < 1e-6);
            let vertical = (ci.x - cj.x).abs() < 1e-6 && (ci.y - cj.y).abs() < 1e-6;
            if reaches_top && vertical { Some(elem[1].clone()) } else { None }
        })
        .collect();

    for elem in vertical_elements {
        let ni = elem["nodeI"].as_u64().unwrap() as u32;
        let nj = elem["nodeJ"].as_u64().unwrap() as u32;
        let top_node = if node_map.contains_key(&ni) { ni } else { nj };
        let new_node = *node_map.get(&top_node).unwrap();
        let mat_id = elem["materialId"].as_u64().unwrap_or(first_material_id(snap) as u64) as u32;
        let sec_id = col_override.unwrap_or(elem["sectionId"].as_u64().unwrap_or(first_section_id(snap) as u64) as u32);
        add_element_to_snap(snap, top_node, new_node, mat_id, sec_id);
    }

    for elem in top_floor_elements {
        let ni = elem["nodeI"].as_u64().unwrap() as u32;
        let nj = elem["nodeJ"].as_u64().unwrap() as u32;
        let new_ni = *node_map.get(&ni).unwrap();
        let new_nj = *node_map.get(&nj).unwrap();

        let cloned = if let Some(sec_id) = beam_override {
            let mut data = elem.clone();
            data["sectionId"] = json!(sec_id);
            data
        } else {
            elem.clone()
        };
        clone_element_to_snap(snap, &cloned, new_ni, new_nj);
    }

    Ok(())
}

fn change_section(
    snap: &mut Value,
    section_name: &str,
    element_ids: Option<&[u32]>,
    element_filter: Option<&str>,
) -> Result<(), AppError> {
    let sec_id = ensure_section(snap, section_name);

    // Pre-compute which element IDs to change (avoids borrow conflict)
    let target_ids: Vec<u32> = snap["elements"]
        .as_array()
        .ok_or_else(|| AppError::BadRequest("No elements in model".into()))?
        .iter()
        .filter_map(|elem| {
            let eid = elem[0].as_u64()? as u32;
            let matches = match (element_ids, element_filter) {
                (Some(ids), _) => ids.contains(&eid),
                (None, Some(filter)) => match filter {
                    "beam" | "beams" => is_horizontal_element(snap, &elem[1]),
                    "column" | "columns" => !is_horizontal_element(snap, &elem[1]),
                    _ => true,
                },
                (None, None) => true,
            };
            if matches { Some(eid) } else { None }
        })
        .collect();

    // Now mutate
    if let Some(elements) = snap["elements"].as_array_mut() {
        for elem in elements.iter_mut() {
            let eid = elem[0].as_u64().unwrap_or(0) as u32;
            if target_ids.contains(&eid) {
                elem[1]["sectionId"] = json!(sec_id);
            }
        }
    }

    Ok(())
}

fn is_horizontal_element(snap: &Value, elem_data: &Value) -> bool {
    let ni = elem_data["nodeI"].as_u64().unwrap_or(0) as u32;
    let nj = elem_data["nodeJ"].as_u64().unwrap_or(0) as u32;
    if let (Some(ci), Some(cj)) = (get_node_coords(snap, ni), get_node_coords(snap, nj)) {
        if is_3d_snapshot(snap) {
            let zi = ci.z.unwrap_or(0.0);
            let zj = cj.z.unwrap_or(0.0);
            (zi - zj).abs() < 1e-6
        } else {
            (ci.y - cj.y).abs() < 1e-6
        }
    } else {
        false
    }
}

fn set_all_supports(snap: &mut Value, support_type: &str) -> Result<(), AppError> {
    let supports = snap["supports"]
        .as_array_mut()
        .ok_or_else(|| AppError::BadRequest("No supports in model".into()))?;

    for support in supports.iter_mut() {
        support[1]["type"] = json!(support_type);
    }

    Ok(())
}

fn set_all_beam_loads(snap: &mut Value, q: f64) -> Result<(), AppError> {
    // Remove existing distributed loads
    if let Some(loads) = snap["loads"].as_array_mut() {
        loads.retain(|l| {
            let ty = l["type"].as_str();
            ty != Some("distributed") && ty != Some("distributed3d")
        });
    }

    // Add distributed load on every element
    let element_ids: Vec<u32> = snap["elements"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|e| e[0].as_u64().unwrap_or(0) as u32)
        .collect();

    for eid in element_ids {
        add_distributed_load_to_snap(snap, eid, q);
    }

    Ok(())
}

fn add_lateral_loads(snap: &mut Value, h: f64) -> Result<(), AppError> {
    let cols = column_lines(snap);
    let floors = floor_levels(snap);

    if cols.is_empty() || floors.len() < 2 {
        return Err(AppError::BadRequest(
            "Cannot add lateral loads: need at least 2 floor levels".into(),
        ));
    }

    let left_x = cols[0];

    if is_3d_snapshot(snap) {
        let min_y = snap["nodes"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|n| n[1]["y"].as_f64())
            .fold(f64::INFINITY, f64::min);

        for &z in &floors[1..] {
            if let Some(node_id) = find_node_at_3d(snap, left_x, min_y, z) {
                let load_id = next_id(snap, "load");
                let load = json!({
                    "type": "nodal3d",
                    "data": {"id": load_id, "nodeId": node_id, "fx": h, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}
                });
                snap["loads"].as_array_mut().unwrap().push(load);
            }
        }
    } else {
        for &y in &floors[1..] {
            if let Some(node_id) = find_node_at(snap, left_x, y) {
                let load_id = next_id(snap, "load");
                let load = json!({
                    "type": "nodal",
                    "data": {"id": load_id, "nodeId": node_id, "fx": h, "fz": 0, "my": 0}
                });
                snap["loads"].as_array_mut().unwrap().push(load);
            }
        }
    }

    Ok(())
}

fn add_distributed_load(snap: &mut Value, element_id: u32, q: f64) -> Result<(), AppError> {
    // Verify element exists
    let exists = snap["elements"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .any(|e| e[0].as_u64() == Some(element_id as u64));

    if !exists {
        return Err(AppError::BadRequest(format!(
            "Element {element_id} not found"
        )));
    }

    add_distributed_load_to_snap(snap, element_id, q);

    Ok(())
}

fn add_nodal_load(
    snap: &mut Value,
    node_id: u32,
    fx: Option<f64>,
    fz: Option<f64>,
    my: Option<f64>,
) -> Result<(), AppError> {
    let exists = snap["nodes"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .any(|n| n[0].as_u64() == Some(node_id as u64));

    if !exists {
        return Err(AppError::BadRequest(format!(
            "Node {node_id} not found"
        )));
    }

    let load_id = next_id(snap, "load");
    let load = if is_3d_snapshot(snap) {
        json!({
            "type": "nodal3d",
            "data": {
                "id": load_id,
                "nodeId": node_id,
                "fx": fx.unwrap_or(0.0),
                "fy": 0.0,
                "fz": fz.unwrap_or(0.0),
                "mx": 0.0,
                "my": my.unwrap_or(0.0),
                "mz": 0.0,
            }
        })
    } else {
        json!({
            "type": "nodal",
            "data": {
                "id": load_id,
                "nodeId": node_id,
                "fx": fx.unwrap_or(0.0),
                "fz": fz.unwrap_or(0.0),
                "my": my.unwrap_or(0.0),
            }
        })
    };
    snap["loads"].as_array_mut().unwrap().push(load);

    Ok(())
}

fn delete_element(snap: &mut Value, element_id: u32) -> Result<(), AppError> {
    let elements = snap["elements"]
        .as_array_mut()
        .ok_or_else(|| AppError::BadRequest("No elements in model".into()))?;

    let before = elements.len();
    elements.retain(|e| e[0].as_u64() != Some(element_id as u64));
    if elements.len() == before {
        return Err(AppError::BadRequest(format!(
            "Element {element_id} not found"
        )));
    }

    // Also remove loads referencing this element
    if let Some(loads) = snap["loads"].as_array_mut() {
        loads.retain(|l| {
            l["data"]["elementId"].as_u64() != Some(element_id as u64)
        });
    }

    Ok(())
}

fn delete_load(snap: &mut Value, load_id: u32) -> Result<(), AppError> {
    let loads = snap["loads"]
        .as_array_mut()
        .ok_or_else(|| AppError::BadRequest("No loads in model".into()))?;

    let before = loads.len();
    loads.retain(|l| l["data"]["id"].as_u64() != Some(load_id as u64));
    if loads.len() == before {
        return Err(AppError::BadRequest(format!(
            "Load {load_id} not found"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::generators::execute_action;
    use crate::capabilities::actions::BuildAction;

    fn make_frame() -> Value {
        let action = BuildAction::CreatePortalFrame {
            width: 6.0,
            height: 4.0,
            q_beam: Some(-10.0),
            h_lateral: None,
            base_support: None,
            beam_section: None,
            column_section: None,
        };
        execute_action(&action).unwrap()
    }

    fn make_multi_story() -> Value {
        let action = BuildAction::CreateMultiStoryFrame {
            n_bays: 2,
            n_floors: 2,
            bay_width: 6.0,
            floor_height: 3.0,
            q_beam: Some(-10.0),
            h_lateral: None,
            beam_section: None,
            column_section: None,
        };
        execute_action(&action).unwrap()
    }

    fn make_multi_story_3d() -> Value {
        let action = BuildAction::CreateMultiStoryFrame3d {
            n_bays_x: 2,
            n_bays_z: 2,
            n_floors: 2,
            bay_width: 5.0,
            floor_height: 3.0,
            q_beam: None,
            h_lateral: None,
            base_support: None,
            beam_section: None,
            column_section: None,
        };
        execute_action(&action).unwrap()
    }

    #[test]
    fn add_bay_to_portal_frame() {
        let snap = make_frame();
        let action = BuildAction::AddBay {
            width: 5.0,
            side: None,
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        // Original: 4 nodes, now +2 (base + top) = 6
        assert_eq!(result["nodes"].as_array().unwrap().len(), 6);
        // Original: 3 elements (2 cols + 1 beam), now +2 (col + beam) = 5
        assert_eq!(result["elements"].as_array().unwrap().len(), 5);
        // Original: 2 supports, now +1 = 3
        assert_eq!(result["supports"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn add_story_to_portal_frame() {
        let snap = make_frame();
        let action = BuildAction::AddStory {
            height: 3.5,
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        // Original: 4 nodes, now +2 (one per column line) = 6
        assert_eq!(result["nodes"].as_array().unwrap().len(), 6);
        // Original: 3 elements, now +3 (2 cols + 1 beam) = 6
        assert_eq!(result["elements"].as_array().unwrap().len(), 6);
    }

    #[test]
    fn add_bay_left() {
        let snap = make_frame();
        let action = BuildAction::AddBay {
            width: 4.0,
            side: Some("left".into()),
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        // Check the new node has x = -4
        let nodes = result["nodes"].as_array().unwrap();
        let xs: Vec<f64> = nodes.iter().filter_map(|n| n[1]["x"].as_f64()).collect();
        assert!(xs.contains(&-4.0));
    }

    #[test]
    fn change_all_sections() {
        let snap = make_frame();
        let action = BuildAction::ChangeSection {
            section: "HEB 400".into(),
            element_ids: None,
            element_filter: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        // All elements should have the new section
        let sections = result["sections"].as_array().unwrap();
        let has_heb = sections.iter().any(|s| s[1]["name"].as_str() == Some("HEB 400"));
        assert!(has_heb);
    }

    #[test]
    fn set_all_supports_to_pinned() {
        let snap = make_frame();
        let action = BuildAction::SetAllSupports {
            support_type: "pinned".into(),
        };
        let result = apply_edit(&action, &snap).unwrap();
        let supports = result["supports"].as_array().unwrap();
        for s in supports {
            assert_eq!(s[1]["type"].as_str().unwrap(), "pinned");
        }
    }

    #[test]
    fn set_all_beam_loads() {
        let snap = make_frame();
        let action = BuildAction::SetAllBeamLoads { q: -20.0 };
        let result = apply_edit(&action, &snap).unwrap();
        let loads = result["loads"].as_array().unwrap();
        // Should have one distributed load per element
        let dist_count = loads.iter().filter(|l| l["type"].as_str() == Some("distributed")).count();
        assert_eq!(dist_count, result["elements"].as_array().unwrap().len());
    }

    #[test]
    fn add_lateral_loads_to_multi_story() {
        let snap = make_multi_story();
        let floors = floor_levels(&snap);
        let action = BuildAction::AddLateralLoads { h: 15.0 };
        let result = apply_edit(&action, &snap).unwrap();
        let loads = result["loads"].as_array().unwrap();
        let nodal_count = loads.iter().filter(|l| l["type"].as_str() == Some("nodal")).count();
        // One per floor level above base
        assert_eq!(nodal_count, floors.len() - 1);
    }

    #[test]
    fn delete_element_removes_element_and_loads() {
        let snap = make_frame();
        let elem_id = snap["elements"].as_array().unwrap()[0][0].as_u64().unwrap() as u32;
        let action = BuildAction::DeleteElement { element_id: elem_id };
        let result = apply_edit(&action, &snap).unwrap();
        assert_eq!(result["elements"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn add_story_to_multi_story() {
        let snap = make_multi_story();
        let orig_nodes = snap["nodes"].as_array().unwrap().len();
        let orig_elems = snap["elements"].as_array().unwrap().len();
        let action = BuildAction::AddStory {
            height: 3.0,
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        // 3 column lines → 3 new nodes
        assert_eq!(result["nodes"].as_array().unwrap().len(), orig_nodes + 3);
        // 3 columns + 2 beams = 5 new elements
        assert_eq!(result["elements"].as_array().unwrap().len(), orig_elems + 5);
    }

    #[test]
    fn add_story_to_multi_story_3d() {
        let snap = make_multi_story_3d();
        let orig_nodes = snap["nodes"].as_array().unwrap().len();
        let orig_elems = snap["elements"].as_array().unwrap().len();
        let action = BuildAction::AddStory {
            height: 3.0,
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();

        assert_eq!(result["nodes"].as_array().unwrap().len(), orig_nodes + 9);

        let zs: Vec<f64> = result["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|n| n[1]["z"].as_f64())
            .collect();
        assert!(zs.iter().any(|z| (*z - 9.0).abs() < 1e-6));
        assert!(result["elements"].as_array().unwrap().len() > orig_elems);
    }

    #[test]
    fn add_bay_to_multi_story_3d() {
        let snap = make_multi_story_3d();
        let orig_nodes = snap["nodes"].as_array().unwrap().len();
        let action = BuildAction::AddBay {
            width: 5.0,
            side: None,
            beam_section: None,
            column_section: None,
        };
        let result = apply_edit(&action, &snap).unwrap();
        assert_eq!(result["nodes"].as_array().unwrap().len(), orig_nodes + 9);
        let xs: Vec<f64> = result["nodes"].as_array().unwrap().iter().filter_map(|n| n[1]["x"].as_f64()).collect();
        assert!(xs.iter().any(|x| (*x - 15.0).abs() < 1e-6));
    }

    #[test]
    fn set_all_beam_loads_uses_3d_payloads() {
        let snap = make_multi_story_3d();
        let action = BuildAction::SetAllBeamLoads { q: -12.0 };
        let result = apply_edit(&action, &snap).unwrap();
        assert!(result["loads"].as_array().unwrap().iter().all(|l| l["type"].as_str() == Some("distributed3d")));
    }
}

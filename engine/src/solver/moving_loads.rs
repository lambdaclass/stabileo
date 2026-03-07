use crate::types::*;
use std::collections::HashMap;

/// Moving loads analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadEnvelope {
    pub elements: HashMap<String, ElementEnvelope>,
    pub train: LoadTrain,
    pub path: Vec<PathSegment>,
    pub num_positions: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEnvelope {
    pub m_max_pos: f64,
    pub m_max_neg: f64,
    pub v_max_pos: f64,
    pub v_max_neg: f64,
    pub n_max_pos: f64,
    pub n_max_neg: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    pub element_id: usize,
    pub start_pos: f64,
    pub end_pos: f64,
    pub length: f64,
    pub cos: f64,
    pub sin: f64,
}

/// Solve 2D moving loads analysis (envelope computation).
pub fn solve_moving_loads_2d(input: &MovingLoadInput) -> Result<MovingLoadEnvelope, String> {
    let solver_input = &input.solver;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);

    // Build load path
    let path = build_load_path(solver_input, input.path_element_ids.as_deref())?;
    if path.is_empty() {
        return Err("No load path found".into());
    }

    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);

    // Initialize envelopes
    let mut envelopes: HashMap<String, ElementEnvelope> = HashMap::new();
    for elem in solver_input.elements.values() {
        envelopes.insert(elem.id.to_string(), ElementEnvelope {
            m_max_pos: 0.0, m_max_neg: 0.0,
            v_max_pos: 0.0, v_max_neg: 0.0,
            n_max_pos: 0.0, n_max_neg: 0.0,
        });
    }

    // Step through positions
    let start_pos = -max_offset;
    let end_pos = total_length;
    let mut pos = start_pos;
    let mut num_positions = 0;

    while pos <= end_pos + 1e-10 {
        num_positions += 1;

        // Build loads for this position
        let mut loads = base_loads(solver_input);

        for axle in &train.axles {
            let axle_pos = pos + axle.offset;
            if axle_pos < -1e-10 || axle_pos > total_length + 1e-10 {
                continue;
            }

            // Find which segment this axle is on
            if let Some((seg, local_pos)) = find_segment(&path, axle_pos) {
                // Decompose weight into perpendicular component (point on element)
                // and axial component (nodal load in element direction)
                let perp_force = -axle.weight; // Downward force

                // Add as point load on element in local Y direction
                loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: seg.element_id,
                    a: local_pos,
                    p: perp_force * seg.cos.powi(2).max(0.0).sqrt().copysign(1.0),
                    px: None,
                    mz: None,
                }));

                // For vertical loads on non-horizontal members, add axial component as well
                // Simplified: project downward force onto element axes
                if seg.sin.abs() > 1e-6 {
                    // Perpendicular component (transverse to element)
                    let p_perp = -axle.weight * seg.cos;
                    // Axial component
                    let p_axial = -axle.weight * seg.sin;

                    // Replace the simple load with proper decomposition
                    loads.pop(); // Remove the one we just added
                    loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                        element_id: seg.element_id,
                        a: local_pos,
                        p: p_perp,
                        px: Some(p_axial),
                        mz: None,
                    }));
                }
            }
        }

        // Solve with these loads
        let mut modified_input = solver_input.clone();
        modified_input.loads = loads;

        if let Ok(results) = super::linear::solve_2d(&modified_input) {
            // Update envelopes
            for ef in &results.element_forces {
                if let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) {
                    let m_max = ef.m_start.max(ef.m_end);
                    let m_min = ef.m_start.min(ef.m_end);
                    let v_max = ef.v_start.max(ef.v_end);
                    let v_min = ef.v_start.min(ef.v_end);
                    let n_max = ef.n_start.max(ef.n_end);
                    let n_min = ef.n_start.min(ef.n_end);

                    env.m_max_pos = env.m_max_pos.max(m_max);
                    env.m_max_neg = env.m_max_neg.min(m_min);
                    env.v_max_pos = env.v_max_pos.max(v_max);
                    env.v_max_neg = env.v_max_neg.min(v_min);
                    env.n_max_pos = env.n_max_pos.max(n_max);
                    env.n_max_neg = env.n_max_neg.min(n_min);
                }
            }
        }

        pos += step;
    }

    Ok(MovingLoadEnvelope {
        elements: envelopes,
        train: train.clone(),
        path,
        num_positions,
    })
}

fn build_load_path(
    input: &SolverInput,
    path_element_ids: Option<&[usize]>,
) -> Result<Vec<PathSegment>, String> {
    let mut path = Vec::new();
    let mut cum_pos = 0.0;

    let elem_ids: Vec<usize> = if let Some(ids) = path_element_ids {
        ids.to_vec()
    } else {
        // Auto-detect: find connected chain of elements
        auto_detect_path(input)?
    };

    for eid in &elem_ids {
        let elem = input.elements.values().find(|e| e.id == *eid)
            .ok_or_else(|| format!("Element {} not found", eid))?;
        let ni = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let nj = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;

        path.push(PathSegment {
            element_id: *eid,
            start_pos: cum_pos,
            end_pos: cum_pos + l,
            length: l,
            cos,
            sin,
        });
        cum_pos += l;
    }

    Ok(path)
}

fn auto_detect_path(input: &SolverInput) -> Result<Vec<usize>, String> {
    // Find a chain: start from leftmost supported node, traverse connected elements
    let mut elem_list: Vec<&SolverElement> = input.elements.values().collect();
    elem_list.sort_by(|a, b| {
        let na = input.nodes.values().find(|n| n.id == a.node_i).unwrap();
        let nb = input.nodes.values().find(|n| n.id == b.node_i).unwrap();
        na.x.partial_cmp(&nb.x).unwrap()
    });

    // Simple: just return elements sorted by their start node X coordinate
    Ok(elem_list.iter().map(|e| e.id).collect())
}

fn find_segment<'a>(path: &'a [PathSegment], global_pos: f64) -> Option<(&'a PathSegment, f64)> {
    for seg in path {
        if global_pos >= seg.start_pos - 1e-10 && global_pos <= seg.end_pos + 1e-10 {
            let local = (global_pos - seg.start_pos).max(0.0).min(seg.length);
            return Some((seg, local));
        }
    }
    None
}

fn base_loads(input: &SolverInput) -> Vec<SolverLoad> {
    // Keep existing permanent loads (nodal and distributed, but not moving point loads)
    input.loads.iter().filter(|l| {
        matches!(l, SolverLoad::Nodal(_) | SolverLoad::Distributed(_) | SolverLoad::Thermal(_))
    }).cloned().collect()
}

// ==================== 3D Moving Loads ====================

/// 3D moving loads analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadEnvelope3D {
    pub elements: HashMap<String, ElementEnvelope3D>,
    pub train: LoadTrain,
    pub path: Vec<PathSegment3D>,
    pub num_positions: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementEnvelope3D {
    pub n_max_pos: f64,
    pub n_max_neg: f64,
    pub vy_max_pos: f64,
    pub vy_max_neg: f64,
    pub vz_max_pos: f64,
    pub vz_max_neg: f64,
    pub my_max_pos: f64,
    pub my_max_neg: f64,
    pub mz_max_pos: f64,
    pub mz_max_neg: f64,
    pub mx_max_pos: f64,
    pub mx_max_neg: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment3D {
    pub element_id: usize,
    pub start_pos: f64,
    pub end_pos: f64,
    pub length: f64,
    /// Unit direction vector of the element in global coordinates
    pub dir_x: f64,
    pub dir_y: f64,
    pub dir_z: f64,
}

/// Solve 3D moving loads analysis (envelope computation).
///
/// Moves a load train along a path of 3D elements, solving for each position
/// and computing the envelope of force maxima/minima across all positions.
pub fn solve_moving_loads_3d(input: &MovingLoadInput3D) -> Result<MovingLoadEnvelope3D, String> {
    let solver_input = &input.solver;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);

    let gravity = input.gravity_direction.as_deref().unwrap_or("z");

    // Build 3D load path
    let path = build_load_path_3d(solver_input, input.path_element_ids.as_deref())?;
    if path.is_empty() {
        return Err("No load path found".into());
    }

    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);

    // Initialize envelopes
    let mut envelopes: HashMap<String, ElementEnvelope3D> = HashMap::new();
    for elem in solver_input.elements.values() {
        envelopes.insert(elem.id.to_string(), ElementEnvelope3D {
            n_max_pos: 0.0, n_max_neg: 0.0,
            vy_max_pos: 0.0, vy_max_neg: 0.0,
            vz_max_pos: 0.0, vz_max_neg: 0.0,
            my_max_pos: 0.0, my_max_neg: 0.0,
            mz_max_pos: 0.0, mz_max_neg: 0.0,
            mx_max_pos: 0.0, mx_max_neg: 0.0,
        });
    }

    let start_pos = -max_offset;
    let end_pos = total_length;
    let mut pos = start_pos;
    let mut num_positions = 0;

    while pos <= end_pos + 1e-10 {
        num_positions += 1;

        // Build loads for this position
        let mut loads = base_loads_3d(solver_input);

        for axle in &train.axles {
            let axle_pos = pos + axle.offset;
            if axle_pos < -1e-10 || axle_pos > total_length + 1e-10 {
                continue;
            }

            if let Some((seg, local_pos)) = find_segment_3d(&path, axle_pos) {
                // Gravity vector in global coordinates
                let (gx, gy, gz) = match gravity {
                    "y" => (0.0, -axle.weight, 0.0),
                    _ => (0.0, 0.0, -axle.weight), // "z" default
                };

                // Element direction vector (local x-axis in global frame)
                let _ex = [seg.dir_x, seg.dir_y, seg.dir_z];

                // Compute the element's local axes using the same function as the solver
                if let Some(elem) = solver_input.elements.values().find(|e| e.id == seg.element_id) {
                    let ni = solver_input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
                    let nj = solver_input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
                    let left_hand = solver_input.left_hand.unwrap_or(false);
                    let (_lex, ley, lez) = crate::element::compute_local_axes_3d(
                        ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
                        elem.local_yx, elem.local_yy, elem.local_yz,
                        elem.roll_angle, left_hand,
                    );

                    // Project gravity force onto local axes
                    // py = gravity · local_y, pz = gravity · local_z
                    let py = gx * ley[0] + gy * ley[1] + gz * ley[2];
                    let pz = gx * lez[0] + gy * lez[1] + gz * lez[2];

                    // Apply as point-on-element load (proper FEF treatment)
                    loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                        element_id: seg.element_id,
                        a: local_pos,
                        py,
                        pz,
                    }));
                }
            }
        }

        // Solve with these loads
        let mut modified_input = solver_input.clone();
        modified_input.loads = loads;

        if let Ok(results) = super::linear::solve_3d(&modified_input) {
            for ef in &results.element_forces {
                if let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) {
                    env.n_max_pos = env.n_max_pos.max(ef.n_start.max(ef.n_end));
                    env.n_max_neg = env.n_max_neg.min(ef.n_start.min(ef.n_end));
                    env.vy_max_pos = env.vy_max_pos.max(ef.vy_start.max(ef.vy_end));
                    env.vy_max_neg = env.vy_max_neg.min(ef.vy_start.min(ef.vy_end));
                    env.vz_max_pos = env.vz_max_pos.max(ef.vz_start.max(ef.vz_end));
                    env.vz_max_neg = env.vz_max_neg.min(ef.vz_start.min(ef.vz_end));
                    env.my_max_pos = env.my_max_pos.max(ef.my_start.max(ef.my_end));
                    env.my_max_neg = env.my_max_neg.min(ef.my_start.min(ef.my_end));
                    env.mz_max_pos = env.mz_max_pos.max(ef.mz_start.max(ef.mz_end));
                    env.mz_max_neg = env.mz_max_neg.min(ef.mz_start.min(ef.mz_end));
                    env.mx_max_pos = env.mx_max_pos.max(ef.mx_start.max(ef.mx_end));
                    env.mx_max_neg = env.mx_max_neg.min(ef.mx_start.min(ef.mx_end));
                }
            }
        }

        pos += step;
    }

    Ok(MovingLoadEnvelope3D {
        elements: envelopes,
        train: train.clone(),
        path,
        num_positions,
    })
}

fn build_load_path_3d(
    input: &SolverInput3D,
    path_element_ids: Option<&[usize]>,
) -> Result<Vec<PathSegment3D>, String> {
    let mut path = Vec::new();
    let mut cum_pos = 0.0;

    let elem_ids: Vec<usize> = if let Some(ids) = path_element_ids {
        ids.to_vec()
    } else {
        auto_detect_path_3d(input)?
    };

    for eid in &elem_ids {
        let elem = input.elements.values().find(|e| e.id == *eid)
            .ok_or_else(|| format!("Element {} not found", eid))?;
        let ni = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let nj = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let dz = nj.z - ni.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();

        path.push(PathSegment3D {
            element_id: *eid,
            start_pos: cum_pos,
            end_pos: cum_pos + l,
            length: l,
            dir_x: dx / l,
            dir_y: dy / l,
            dir_z: dz / l,
        });
        cum_pos += l;
    }

    Ok(path)
}

fn auto_detect_path_3d(input: &SolverInput3D) -> Result<Vec<usize>, String> {
    let mut elem_list: Vec<&SolverElement3D> = input.elements.values().collect();
    elem_list.sort_by(|a, b| {
        let na = input.nodes.values().find(|n| n.id == a.node_i).unwrap();
        let nb = input.nodes.values().find(|n| n.id == b.node_i).unwrap();
        na.x.partial_cmp(&nb.x).unwrap()
    });
    Ok(elem_list.iter().map(|e| e.id).collect())
}

fn find_segment_3d<'a>(path: &'a [PathSegment3D], global_pos: f64) -> Option<(&'a PathSegment3D, f64)> {
    for seg in path {
        if global_pos >= seg.start_pos - 1e-10 && global_pos <= seg.end_pos + 1e-10 {
            let local = (global_pos - seg.start_pos).max(0.0).min(seg.length);
            return Some((seg, local));
        }
    }
    None
}

fn base_loads_3d(input: &SolverInput3D) -> Vec<SolverLoad3D> {
    input.loads.iter().filter(|l| {
        matches!(l, SolverLoad3D::Nodal(_) | SolverLoad3D::Distributed(_) | SolverLoad3D::Thermal(_))
    }).cloned().collect()
}

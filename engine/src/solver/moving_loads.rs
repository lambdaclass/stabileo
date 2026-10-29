use crate::types::*;
use crate::solver::linear::{prepare_static_2d, prepare_static_3d, solve_2d, solve_3d};
use std::collections::HashMap;

/// Moving loads analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadEnvelope {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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
    /// The train crosses this member from node_j to node_i (the member was
    /// drawn against the direction of travel).
    #[serde(default)]
    pub reversed: bool,
}

/// Direction of travel over each member of a path, from connectivity: the
/// first member is entered at the end it does not share with the second,
/// each later member at the node the previous one was left by. A member
/// with no neighbour on the path keeps its own node order.
pub(crate) fn travel_reversed(ends: &[(usize, usize)]) -> Vec<bool> {
    let mut rev = vec![false; ends.len()];
    if ends.len() >= 2 {
        let (i0, j0) = ends[0];
        let (i1, j1) = ends[1];
        // Entered at node_j when node_i is the joint with the next member.
        rev[0] = (i0 == i1 || i0 == j1) && !(j0 == i1 || j0 == j1);
        let mut exit = if rev[0] { i0 } else { j0 };
        for k in 1..ends.len() {
            let (i, j) = ends[k];
            rev[k] = if i == exit { false } else if j == exit { true } else { false };
            exit = if rev[k] { i } else { j };
        }
    }
    rev
}

/// Most train positions one moving-load run may solve. The step and the axle
/// offsets come from the model, and each position is a full solve.
pub const MAX_MOVING_LOAD_POSITIONS: f64 = 100_000.0;

/// Refuse a step that would never advance the train (zero, negative, NaN, or
/// infinite) or that would solve more than `MAX_MOVING_LOAD_POSITIONS`
/// positions over a travel of `travel`: either keeps the solver looping.
fn check_step(step: f64, travel: f64) -> Result<(), String> {
    if !(step.is_finite() && step > 0.0) {
        return Err(format!("Moving loads: step must be a positive finite number, got {step}"));
    }
    if !travel.is_finite() || travel / step > MAX_MOVING_LOAD_POSITIONS {
        return Err(format!(
            "Moving loads: step {step} over a travel of {travel} needs more than {MAX_MOVING_LOAD_POSITIONS} positions"
        ));
    }
    Ok(())
}

/// Solve 2D moving loads analysis (envelope computation).
pub fn solve_moving_loads_2d(input: &MovingLoadInput) -> Result<MovingLoadEnvelope, String> {
    let solver_input = &input.solver;

    // The path builder below resolves element ends by direct map indexing —
    // three lines after handling a missing *element* gracefully — and runs
    // before `prepare_static_2d`, whose validation would have caught a
    // dangling node.
    crate::solver::linear::validate_input_2d(solver_input)?;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);

    // Build load path
    let path = build_load_path(solver_input, input.path_element_ids.as_deref())?;
    if path.is_empty() {
        return Err("No load path found".into());
    }

    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);
    check_step(step, total_length + max_offset)?;

    // Initialize envelopes
    let mut envelopes: HashMap<String, ElementEnvelope> = HashMap::new();
    for elem in crate::ordered::values(&solver_input.elements) {
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

    // Prepare the structure once (assembly + factorization of K); each
    // position then reuses the factorization, rebuilding only its load vector.
    // Models with constraints keep the legacy per-position full solve (the
    // constrained solver handles each position's loads itself).
    let prep_input = if solver_input.constraints.is_empty() {
        let mut pi = solver_input.clone();
        pi.loads = vec![];
        Some(pi)
    } else {
        None
    };
    // A prepare failure is the model's and is returned. `.ok()`-ed, it left
    // `prepared` empty and every position unsolved, and an envelope of zeros
    // came back as `Ok` — for a model the solver had refused by name.
    let prepared = prep_input.as_ref().map(|pi| prepare_static_2d(pi)).transpose()?;

    let mut structured_diagnostics = Vec::new();
    while pos <= end_pos + 1e-10 {
        num_positions += 1;

        // Build loads for this position
        let loads = moving_loads_at_position_2d(solver_input, train, &path, pos, total_length);

        // Every position must solve: skipping a refusal would return an
        // incomplete envelope, or all zeros if every position failed.
        let results = match &prepared {
            Some(p) => p.solve_loads(&loads)?,
            None => {
                let mut modified_input = solver_input.clone();
                modified_input.loads = loads;
                solve_2d(&modified_input)?
            }
        };

        // Update envelopes
        crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
        for ef in &results.element_forces {
            if let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) {
                // Along the member, not only at its ends: under a span load M peaks inside the
                // span, and under a sign-changing axial span load so does N.
                let (m_min, m_max) = diagram_range_2d(ef, "moment", ef.m_start, ef.m_end);
                let (v_min, v_max) = diagram_range_2d(ef, "shear", ef.v_start, ef.v_end);
                let (n_min, n_max) = diagram_range_2d(ef, "axial", ef.n_start, ef.n_end);

                env.m_max_pos = env.m_max_pos.max(m_max);
                env.m_max_neg = env.m_max_neg.min(m_min);
                env.v_max_pos = env.v_max_pos.max(v_max);
                env.v_max_neg = env.v_max_neg.min(v_min);
                env.n_max_pos = env.n_max_pos.max(n_max);
                env.n_max_neg = env.n_max_neg.min(n_min);
            }
        }

        pos += step;
    }

    Ok(MovingLoadEnvelope {
        structured_diagnostics: { crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Linear)); structured_diagnostics },
        elements: envelopes,
        train: train.clone(),
        path,
        num_positions,
    })
}

/// Build the load set for one train position: permanent loads (nodal,
/// distributed, thermal) plus the equivalent point loads of every axle
/// currently on the path.
pub fn moving_loads_at_position_2d(
    solver_input: &SolverInput,
    train: &LoadTrain,
    path: &[PathSegment],
    pos: f64,
    total_length: f64,
) -> Vec<SolverLoad> {
    let mut loads = base_loads(solver_input);

    for axle in &train.axles {
        let axle_pos = pos + axle.offset;
        if axle_pos < -1e-10 || axle_pos > total_length + 1e-10 {
            continue;
        }

        // Find which segment this axle is on
        if let Some((seg, local_pos)) = find_segment(path, axle_pos) {
            // The axle weight acts straight down (−Z). In member axes (local
            // x = (c, s) from node_i to node_j, local y = (−s, c)) that is
            // p = −W·c transverse and px = −W·s axial — for any orientation.
            // The former branch for near-horizontal members used −W·|c|,
            // which pushed the train UP on a member drawn right-to-left
            // (found by the metamorphic mirror check).
            let a = if seg.reversed { seg.length - local_pos } else { local_pos };
            loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: seg.element_id,
                a,
                p: -axle.weight * seg.cos,
                px: if seg.sin != 0.0 { Some(-axle.weight * seg.sin) } else { None },
                my: None,
            }));
        }
    }

    loads
}

pub fn build_load_path(
    input: &SolverInput,
    path_element_ids: Option<&[usize]>,
) -> Result<Vec<PathSegment>, String> {
    let mut path = Vec::new();
    let mut cum_pos = 0.0;

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();

    let elem_ids: Vec<usize> = if let Some(ids) = path_element_ids {
        ids.to_vec()
    } else {
        // Auto-detect: find connected chain of elements
        auto_detect_path(input)?
    };

    let mut ends = Vec::with_capacity(elem_ids.len());
    for eid in &elem_ids {
        let elem = elem_by_id.get(eid).ok_or_else(|| format!("Element {} not found", eid))?;
        ends.push((elem.node_i, elem.node_j));
    }
    let reversed = travel_reversed(&ends);
    for (k, eid) in elem_ids.iter().enumerate() {
        let elem = elem_by_id.get(eid)
            .ok_or_else(|| format!("Element {} not found", eid))?;
        let ni = node_by_id[&elem.node_i];
        let nj = node_by_id[&elem.node_j];
        let dx = nj.x - ni.x;
        let dy = nj.z - ni.z;
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
            reversed: reversed[k],
        });
        cum_pos += l;
    }

    Ok(path)
}

fn auto_detect_path(input: &SolverInput) -> Result<Vec<usize>, String> {
    // Find a chain: start from leftmost supported node, traverse connected elements
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mut elem_list: Vec<&SolverElement> = crate::ordered::values(&input.elements).collect();
    elem_list.sort_by(|a, b| {
        let na = node_by_id[&a.node_i];
        let nb = node_by_id[&b.node_i];
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

/// The least and greatest value of a 2D diagram along a member: its ends and the stations
/// the diagrams sample (`diagram_positions_2d`, which include every point load), plus, for N,
/// where the total axial span load changes sign (N' = −q_x, so N peaks there).
fn diagram_range_2d(ef: &ElementForces, kind: &str, start: f64, end: f64) -> (f64, f64) {
    use crate::postprocess::diagrams::{compute_diagram_value_at, diagram_positions_2d};
    let mut ts = diagram_positions_2d(ef, kind);
    if kind == "axial" && ef.length > 0.0 {
        let mut xs: Vec<f64> = vec![0.0, ef.length];
        for d in &ef.distributed_loads_x { xs.push(d.a); xs.push(d.b); }
        xs.sort_by(|a, b| a.total_cmp(b));
        let q_at = |x: f64| -> f64 {
            ef.distributed_loads_x.iter()
                .filter(|d| d.b > d.a && x >= d.a && x <= d.b)
                .map(|d| d.q_i + (d.q_j - d.q_i) * (x - d.a) / (d.b - d.a))
                .sum()
        };
        for w in xs.windows(2) {
            let (x0, x1) = (w[0], w[1]);
            if x1 - x0 < 1e-12 { continue; }
            let h = (x1 - x0) * 1e-9;
            let (q0, q1) = (q_at(x0 + h), q_at(x1 - h));
            if q0 * q1 < 0.0 { ts.push((x0 + (x1 - x0) * q0 / (q0 - q1)) / ef.length); }
        }
    }
    let (mut lo, mut hi) = (start.min(end), start.max(end));
    for t in ts {
        let v = compute_diagram_value_at(kind, t.clamp(0.0, 1.0), ef);
        if v.is_finite() { lo = lo.min(v); hi = hi.max(v); }
    }
    (lo, hi)
}

/// The permanent loads, all of them: every load in the input is permanent (the train's axle
/// loads are generated per position, never read from it). Point loads on members used to be
/// filtered out as if they were the train's, so a permanent point load on a member, and since
/// #437 the axial part of an inclined one, was missing from every envelope.
fn base_loads(input: &SolverInput) -> Vec<SolverLoad> {
    input.loads.clone()
}

// ==================== 3D Moving Loads ====================

/// 3D moving loads analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingLoadEnvelope3D {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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
    /// Crossed from node_j to node_i (see `PathSegment::reversed`).
    #[serde(default)]
    pub reversed: bool,
}

/// Solve 3D moving loads analysis (envelope computation).
///
/// Moves a load train along a path of 3D elements, solving for each position
/// and computing the envelope of force maxima/minima across all positions.
pub fn solve_moving_loads_3d(input: &MovingLoadInput3D) -> Result<MovingLoadEnvelope3D, String> {
    crate::solver::linear::validate_input_3d(&input.solver)?;

    let solver_input = &input.solver;
    let train = &input.train;
    let step = input.step.unwrap_or(0.25);

    // "z" (default, −Z) or "y" (−Y), either case; anything else used to
    // mean −Z silently.
    let gravity = match input.gravity_direction.as_deref() {
        None | Some("z") | Some("Z") => "z",
        Some("y") | Some("Y") => "y",
        Some(g) => return Err(format!("Moving loads: unknown gravityDirection '{g}'; expected \"z\" or \"y\"")),
    };

    // Build 3D load path
    let path = build_load_path_3d(solver_input, input.path_element_ids.as_deref())?;
    if path.is_empty() {
        return Err("No load path found".into());
    }

    let total_length: f64 = path.iter().map(|s| s.length).sum();
    let max_offset: f64 = train.axles.iter().map(|a| a.offset).fold(0.0, f64::max);
    check_step(step, total_length + max_offset)?;

    // Initialize envelopes
    let mut envelopes: HashMap<String, ElementEnvelope3D> = HashMap::new();
    for elem in crate::ordered::values(&solver_input.elements) {
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

    // Prepare the structure once (assembly + factorization of K); each
    // position then reuses the factorization, rebuilding only its load vector.
    // Models with constraints keep the legacy per-position full solve.
    let prep_input = if solver_input.constraints.is_empty() {
        let mut pi = solver_input.clone();
        pi.loads = vec![];
        Some(pi)
    } else {
        None
    };
    // A prepare failure is the model's and is returned. `.ok()`-ed, it left
    // `prepared` empty and every position unsolved, and an envelope of zeros
    // came back as `Ok` — for a model the solver had refused by name.
    let prepared = prep_input.as_ref().map(|pi| prepare_static_3d(pi)).transpose()?;

    // Lookup maps for local-axis projection — built once for all positions.
    let maps = MovingLoadMaps3d::new(solver_input);

    let mut structured_diagnostics = Vec::new();
    while pos <= end_pos + 1e-10 {
        num_positions += 1;

        // Build loads for this position
        let loads = moving_loads_at_position_3d_with_maps(
            solver_input, train, gravity, &path, pos, total_length, &maps,
        );

        // Constrained models bypass preparation, so geometry refusals arrive
        // here. Propagate them rather than returning a zero/partial envelope.
        let results = match &prepared {
            Some(p) => p.solve_loads(&loads)?,
            None => {
                let mut modified_input = solver_input.clone();
                modified_input.loads = loads;
                solve_3d(&modified_input)?
            }
        };

        crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
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

        pos += step;
    }

    Ok(MovingLoadEnvelope3D {
        structured_diagnostics: { crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Linear)); structured_diagnostics },
        elements: envelopes,
        train: train.clone(),
        path,
        num_positions,
    })
}

/// Pre-built node/element lookup maps for `moving_loads_at_position_3d_with_maps`
/// (build once per analysis, reuse across all positions).
pub struct MovingLoadMaps3d<'a> {
    pub node_by_id: HashMap<usize, &'a SolverNode3D>,
    pub elem_by_id: HashMap<usize, &'a SolverElement3D>,
}

impl<'a> MovingLoadMaps3d<'a> {
    pub fn new(input: &'a SolverInput3D) -> Self {
        Self {
            node_by_id: crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect(),
            elem_by_id: crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect(),
        }
    }
}

/// Build the load set for one train position in 3D: permanent loads plus the
/// axle weights projected onto each path element's local axes as
/// point-on-element loads.
///
/// Hot loops should prefer `moving_loads_at_position_3d_with_maps` (lookup
/// maps built once) — this wrapper rebuilds them per call for convenience.
pub fn moving_loads_at_position_3d(
    solver_input: &SolverInput3D,
    train: &LoadTrain,
    gravity: &str,
    path: &[PathSegment3D],
    pos: f64,
    total_length: f64,
) -> Vec<SolverLoad3D> {
    let maps = MovingLoadMaps3d::new(solver_input);
    moving_loads_at_position_3d_with_maps(solver_input, train, gravity, path, pos, total_length, &maps)
}

/// Same as `moving_loads_at_position_3d` but takes pre-built lookup maps, so
/// callers iterating over many positions build them once (was O(P·(N+E))
/// redundant hashing per analysis).
pub fn moving_loads_at_position_3d_with_maps(
    solver_input: &SolverInput3D,
    train: &LoadTrain,
    gravity: &str,
    path: &[PathSegment3D],
    pos: f64,
    total_length: f64,
    maps: &MovingLoadMaps3d,
) -> Vec<SolverLoad3D> {
    let node_by_id = &maps.node_by_id;
    let elem_by_id = &maps.elem_by_id;
    let mut loads = base_loads_3d(solver_input);

    for axle in &train.axles {
        let axle_pos = pos + axle.offset;
        if axle_pos < -1e-10 || axle_pos > total_length + 1e-10 {
            continue;
        }

        if let Some((seg, local_pos)) = find_segment_3d(path, axle_pos) {
            // Gravity vector in global coordinates
            let (gx, gy, gz) = match gravity {
                "y" => (0.0, -axle.weight, 0.0),
                _ => (0.0, 0.0, -axle.weight), // "z" default
            };

            // Compute the element's local axes using the same function as the solver
            if let Some(&elem) = elem_by_id.get(&seg.element_id) {
                let ni = node_by_id[&elem.node_i];
                let nj = node_by_id[&elem.node_j];
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
                    a: if seg.reversed { seg.length - local_pos } else { local_pos },
                    py,
                    pz,
                }));
            }
        }
    }

    loads
}

pub fn build_load_path_3d(
    input: &SolverInput3D,
    path_element_ids: Option<&[usize]>,
) -> Result<Vec<PathSegment3D>, String> {
    let mut path = Vec::new();
    let mut cum_pos = 0.0;

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();

    let elem_ids: Vec<usize> = if let Some(ids) = path_element_ids {
        ids.to_vec()
    } else {
        auto_detect_path_3d(input)?
    };

    let mut ends = Vec::with_capacity(elem_ids.len());
    for eid in &elem_ids {
        let elem = elem_by_id.get(eid).ok_or_else(|| format!("Element {} not found", eid))?;
        ends.push((elem.node_i, elem.node_j));
    }
    let reversed = travel_reversed(&ends);
    for (k, eid) in elem_ids.iter().enumerate() {
        let elem = elem_by_id.get(eid)
            .ok_or_else(|| format!("Element {} not found", eid))?;
        let ni = node_by_id[&elem.node_i];
        let nj = node_by_id[&elem.node_j];
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
            reversed: reversed[k],
        });
        cum_pos += l;
    }

    Ok(path)
}

fn auto_detect_path_3d(input: &SolverInput3D) -> Result<Vec<usize>, String> {
    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mut elem_list: Vec<&SolverElement3D> = crate::ordered::values(&input.elements).collect();
    elem_list.sort_by(|a, b| {
        let na = node_by_id[&a.node_i];
        let nb = node_by_id[&b.node_i];
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

/// As `base_loads`: every input load is permanent (point loads on members, bimoments and
/// shell loads used to be dropped).
fn base_loads_3d(input: &SolverInput3D) -> Vec<SolverLoad3D> {
    input.loads.clone()
}

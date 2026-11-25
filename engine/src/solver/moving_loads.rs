use crate::postprocess::{diagrams::member_diagram_range_2d, diagrams_3d::member_diagram_range_3d};
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

pub(crate) fn reference_sample_count(start: f64, end: f64, step: f64) -> Result<f64, &'static str> {
    if !(step.is_finite() && step > 0.0 && start.is_finite() && end.is_finite()) {
        return Err(UNRESOLVED_AXLE_STATION);
    }
    let last = ((end - start) / step).floor();
    if last < 0.0 {
        return Ok(0.0);
    }
    if !last.is_finite() || last >= (1_u64 << 52) as f64 {
        return Err(UNRESOLVED_AXLE_STATION);
    }
    let bound = joint_roundoff(end, end, start.abs());
    let reaches = |index: f64| (start + index * step) - end <= bound;
    if reaches(last + 1.0) {
        Ok(last + 2.0)
    } else if reaches(last) {
        Ok(last + 1.0)
    } else {
        Ok(last)
    }
}

pub fn reference_positions(
    train: &LoadTrain, end: f64, step: f64,
) -> Result<impl Iterator<Item = f64> + use<>, String> {
    let start = -train.axles.iter().map(|axle| axle.offset).fold(0.0, f64::max);
    check_step(step, end - start)?;
    let count = reference_sample_count(start, end, step)? as usize;
    Ok((0..count).map(move |index| start + index as f64 * step))
}

#[derive(Clone, Copy)]
struct RouteSegment {
    start: f64,
    end: f64,
    length: f64,
    reversed: bool,
}

enum RouteStation {
    Interior { segment: usize, a: f64 },
    Joint(usize),
}

fn route_station(
    count: usize,
    segment: impl Fn(usize) -> RouteSegment,
    position: f64,
    scale: f64,
) -> Result<Option<RouteStation>, &'static str> {
    if count == 0 {
        return Ok(None);
    }
    let mut range = 0..count;
    while range.start < range.end {
        let mid = range.start + (range.end - range.start) / 2;
        if position > segment(mid).end {
            range.start = mid + 1;
        } else {
            range.end = mid;
        }
    }
    let index = range.start.min(count - 1);
    let part = segment(index);
    let a = sampled_axle_station(part.start, part.end, part.length, part.reversed, position, scale)?;
    Ok(a.map(|a| {
        if a == 0.0 {
            RouteStation::Joint(index + usize::from(part.reversed))
        } else if a == part.length {
            RouteStation::Joint(index + usize::from(!part.reversed))
        } else {
            RouteStation::Interior { segment: index, a }
        }
    }))
}

#[derive(Clone, Copy)]
struct AxleFace {
    element: usize,
    node: usize,
    at_end: bool,
    local_force: [f64; 3],
}

#[derive(Default)]
struct FaceLoads {
    start: [f64; 3],
    end: [f64; 3],
}

impl FaceLoads {
    fn include(&mut self, face: AxleFace) {
        let load = if face.at_end { &mut self.end } else { &mut self.start };
        for (sum, action) in load.iter_mut().zip(face.local_force) {
            *sum += action;
        }
    }

    fn component(&self, axis: usize) -> [f64; 2] {
        [self.start[axis], self.end[axis]]
    }
}

struct SampleLimit<L> {
    changes: Vec<(usize, Option<L>)>,
    faces: HashMap<usize, FaceLoads>,
}

struct MovingSample<L> {
    loads: Vec<L>,
    limits: [SampleLimit<L>; 2],
}

impl<L: Clone> MovingSample<L> {
    fn new(loads: Vec<L>) -> Self {
        Self {
            loads,
            limits: std::array::from_fn(|_| SampleLimit { changes: Vec::new(), faces: HashMap::new() }),
        }
    }

    fn add_joint(&mut self, faces: [Option<AxleFace>; 2], load_at: impl Fn(usize) -> L) {
        let Some(node) = faces.iter().flatten().next().map(|face| face.node) else { return };
        let index = self.loads.len();
        self.loads.push(load_at(node));
        for (limit, face) in self.limits.iter_mut().zip(faces) {
            if let Some(face) = face {
                limit.faces.entry(face.element).or_default().include(face);
            }
            if face.map(|face| face.node) != Some(node) {
                limit.changes.push((index, face.map(|face| load_at(face.node))));
            }
        }
    }

    fn fold<R>(
        &self,
        mut solve: impl FnMut(&[L]) -> Result<R, String>,
        mut fold: impl FnMut(&R, &HashMap<usize, FaceLoads>, bool) -> Result<(), String>,
    ) -> Result<(), String> {
        let exact = solve(&self.loads)?;
        fold(&exact, &HashMap::new(), false)?;
        for limit in &self.limits {
            if limit.changes.is_empty() {
                if !limit.faces.is_empty() {
                    fold(&exact, &limit.faces, true)?;
                }
                continue;
            }
            let mut changes = limit.changes.iter().peekable();
            let loads: Vec<_> = self.loads.iter().enumerate().filter_map(|(index, load)| {
                if changes.peek().is_some_and(|(changed, _)| *changed == index) {
                    changes.next().unwrap().1.clone()
                } else {
                    Some(load.clone())
                }
            }).collect();
            fold(&solve(&loads)?, &limit.faces, false)?;
        }
        Ok(())
    }
}

fn axle_offset_scale(train: &LoadTrain) -> f64 {
    train.axles.iter().map(|axle| axle.offset.abs()).fold(0.0, f64::max)
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

    let total_length = path.last().unwrap().end_pos;
    let positions = reference_positions(train, total_length, step)?;

    // Initialize envelopes
    let mut envelopes: HashMap<String, ElementEnvelope> = HashMap::new();
    for elem in crate::ordered::values(&solver_input.elements) {
        envelopes.insert(elem.id.to_string(), ElementEnvelope {
            m_max_pos: 0.0, m_max_neg: 0.0,
            v_max_pos: 0.0, v_max_neg: 0.0,
            n_max_pos: 0.0, n_max_neg: 0.0,
        });
    }

    let elements = crate::ordered::values(&solver_input.elements).map(|elem| (elem.id, elem)).collect();
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
    for pos in positions {
        num_positions += 1;

        let sample = sample_2d(solver_input, train, &path, pos, &elements)?;
        sample.fold(
            |loads| match &prepared {
                Some(p) => p.solve_loads(loads),
                None => {
                    let mut modified_input = solver_input.clone();
                    modified_input.loads = loads.to_vec();
                    solve_2d(&modified_input)
                }
            },
            |results, faces, reuse| {
                if !reuse {
                    crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
                }
                for ef in &results.element_forces {
                    let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) else { continue };
                    let face = faces.get(&ef.element_id);
                    if reuse && face.is_none() {
                        continue;
                    }
                    let (lo, hi) = member_diagram_range_2d(ef, "moment", [0.0; 2])?;
                    env.m_max_pos = env.m_max_pos.max(hi);
                    env.m_max_neg = env.m_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_2d(ef, "shear", face.map_or([0.0; 2], |f| f.component(2)))?;
                    env.v_max_pos = env.v_max_pos.max(hi);
                    env.v_max_neg = env.v_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_2d(ef, "axial", face.map_or([0.0; 2], |f| f.component(0)))?;
                    env.n_max_pos = env.n_max_pos.max(hi);
                    env.n_max_neg = env.n_max_neg.min(lo);
                }
                Ok(())
            },
        )?;
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
) -> Result<Vec<SolverLoad>, String> {
    let elements = crate::ordered::values(&solver_input.elements).map(|elem| (elem.id, elem)).collect();
    Ok(sample_2d(solver_input, train, path, pos, &elements)?.loads)
}

fn sample_2d(
    input: &SolverInput,
    train: &LoadTrain,
    path: &[PathSegment],
    pos: f64,
    elements: &HashMap<usize, &SolverElement>,
) -> Result<MovingSample<SolverLoad>, String> {
    let mut sample = MovingSample::new(input.loads.clone());
    let scale = axle_offset_scale(train);
    for seg in path {
        check_path_segment(seg.start_pos, seg.end_pos, seg.length, scale)?;
    }
    for axle in &train.axles {
        let station = route_station(path.len(), |index| {
            let part = &path[index];
            RouteSegment { start: part.start_pos, end: part.end_pos, length: part.length, reversed: part.reversed }
        }, pos + axle.offset, scale)?;
        match station {
            Some(RouteStation::Interior { segment, a }) => {
                let part = &path[segment];
                sample.loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: part.element_id,
                    a,
                    p: -axle.weight * part.cos,
                    px: if part.sin != 0.0 { Some(-axle.weight * part.sin) } else { None },
                    my: None,
                }));
            }
            Some(RouteStation::Joint(index)) => {
                let face = |segment: &PathSegment, exit: bool| {
                    let elem = elements[&segment.element_id];
                    let at_end = exit != segment.reversed;
                    AxleFace {
                        element: elem.id,
                        node: if at_end { elem.node_j } else { elem.node_i },
                        at_end,
                        local_force: [
                            -axle.weight * segment.sin,
                            0.0,
                            if elem.elem_type == "truss" { 0.0 } else { -axle.weight * segment.cos },
                        ],
                    }
                };
                sample.add_joint(
                    [index.checked_sub(1).map(|i| face(&path[i], true)), path.get(index).map(|seg| face(seg, false))],
                    |node_id| SolverLoad::Nodal(SolverNodalLoad { node_id, fx: 0.0, fz: -axle.weight, my: 0.0 }),
                );
            }
            None => {}
        }
    }
    Ok(sample)
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

        check_path_segment(cum_pos, cum_pos + l, l, 0.0)?;
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

const UNRESOLVED_AXLE_STATION: &str = "Moving loads: axle position cannot be resolved at a path joint";

fn joint_roundoff(station: f64, length: f64, arithmetic_scale: f64) -> f64 {
    let geometry_scale = if station == 0.0 { length } else { station.abs() };
    ((8.0 * f64::EPSILON) * geometry_scale).max((4.0 * f64::EPSILON) * arithmetic_scale)
}

pub(crate) fn check_path_segment(
    start: f64, end: f64, length: f64, arithmetic_scale: f64,
) -> Result<(), &'static str> {
    if length.is_finite() && length > 0.0 && end.is_finite() && arithmetic_scale.is_finite()
        && end - start > joint_roundoff(start, length, arithmetic_scale)
            + joint_roundoff(end, length, arithmetic_scale)
    {
        Ok(())
    } else {
        Err(UNRESOLVED_AXLE_STATION)
    }
}

pub(crate) fn sampled_axle_station(
    start: f64, end: f64, length: f64, reversed: bool, position: f64, arithmetic_scale: f64,
) -> Result<Option<f64>, &'static str> {
    check_path_segment(start, end, length, arithmetic_scale)?;
    if !position.is_finite() {
        return Err(UNRESOLVED_AXLE_STATION);
    }
    let from_start = position - start;
    let to_end = end - position;
    if from_start.abs() <= joint_roundoff(start, length, arithmetic_scale) {
        return Ok(Some(if reversed { length } else { 0.0 }));
    }
    if to_end.abs() <= joint_roundoff(end, length, arithmetic_scale) {
        return Ok(Some(if reversed { 0.0 } else { length }));
    }
    if from_start < 0.0 || to_end < 0.0 {
        return Ok(None);
    }
    let a = if reversed { length - from_start } else { from_start };
    if 0.0 < a && a < length {
        Ok(Some(a))
    } else {
        Err(UNRESOLVED_AXLE_STATION)
    }
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

    let total_length = path.last().unwrap().end_pos;
    let positions = reference_positions(train, total_length, step)?;

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
    for pos in positions {
        num_positions += 1;

        let sample = sample_3d(solver_input, train, gravity, &path, pos, &maps)?;
        sample.fold(
            |loads| match &prepared {
                Some(p) => p.solve_loads(loads),
                None => {
                    let mut modified_input = solver_input.clone();
                    modified_input.loads = loads.to_vec();
                    solve_3d(&modified_input)
                }
            },
            |results, faces, reuse| {
                if !reuse {
                    crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
                }
                for ef in &results.element_forces {
                    let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) else { continue };
                    let face = faces.get(&ef.element_id);
                    if reuse && face.is_none() {
                        continue;
                    }
                    let (lo, hi) = member_diagram_range_3d(ef, "axial", face.map_or([0.0; 2], |f| f.component(0)))?;
                    env.n_max_pos = env.n_max_pos.max(hi);
                    env.n_max_neg = env.n_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "shearY", face.map_or([0.0; 2], |f| f.component(1)))?;
                    env.vy_max_pos = env.vy_max_pos.max(hi);
                    env.vy_max_neg = env.vy_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "shearZ", face.map_or([0.0; 2], |f| f.component(2)))?;
                    env.vz_max_pos = env.vz_max_pos.max(hi);
                    env.vz_max_neg = env.vz_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "momentY", [0.0; 2])?;
                    env.my_max_pos = env.my_max_pos.max(hi);
                    env.my_max_neg = env.my_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "momentZ", [0.0; 2])?;
                    env.mz_max_pos = env.mz_max_pos.max(hi);
                    env.mz_max_neg = env.mz_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "torsion", [0.0; 2])?;
                    env.mx_max_pos = env.mx_max_pos.max(hi);
                    env.mx_max_neg = env.mx_max_neg.min(lo);
                }
                Ok(())
            },
        )?;
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
) -> Result<Vec<SolverLoad3D>, String> {
    let maps = MovingLoadMaps3d::new(solver_input);
    moving_loads_at_position_3d_with_maps(solver_input, train, gravity, path, pos, &maps)
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
    maps: &MovingLoadMaps3d,
) -> Result<Vec<SolverLoad3D>, String> {
    Ok(sample_3d(solver_input, train, gravity, path, pos, maps)?.loads)
}

fn sample_3d(
    input: &SolverInput3D,
    train: &LoadTrain,
    gravity: &str,
    path: &[PathSegment3D],
    pos: f64,
    maps: &MovingLoadMaps3d,
) -> Result<MovingSample<SolverLoad3D>, String> {
    let mut sample = MovingSample::new(input.loads.clone());
    let scale = axle_offset_scale(train);
    for seg in path {
        check_path_segment(seg.start_pos, seg.end_pos, seg.length, scale)?;
    }
    let gravity_axis = if gravity == "y" { 1 } else { 2 };
    for axle in &train.axles {
        let station = route_station(path.len(), |index| {
            let part = &path[index];
            RouteSegment { start: part.start_pos, end: part.end_pos, length: part.length, reversed: part.reversed }
        }, pos + axle.offset, scale)?;
        let local_force = |elem: &SolverElement3D| {
            let ni = maps.node_by_id[&elem.node_i];
            let nj = maps.node_by_id[&elem.node_j];
            let (ex, ey, ez) = crate::element::compute_local_axes_3d(
                ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, input.left_hand.unwrap_or(false),
            );
            [ex, ey, ez].map(|axis| -axle.weight * axis[gravity_axis])
        };
        match station {
            Some(RouteStation::Interior { segment, a }) => {
                let part = &path[segment];
                let [px, py, pz] = local_force(maps.elem_by_id[&part.element_id]);
                sample.loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: part.element_id, a, px, py, pz,
                }));
            }
            Some(RouteStation::Joint(index)) => {
                let face = |part: &PathSegment3D, exit: bool| {
                    let elem = maps.elem_by_id[&part.element_id];
                    let at_end = exit != part.reversed;
                    let [px, mut py, mut pz] = local_force(elem);
                    if elem.elem_type == "truss" {
                        py = 0.0;
                        pz = 0.0;
                    }
                    AxleFace {
                        element: elem.id,
                        node: if at_end { elem.node_j } else { elem.node_i },
                        at_end,
                        local_force: [px, py, pz],
                    }
                };
                sample.add_joint(
                    [index.checked_sub(1).map(|i| face(&path[i], true)), path.get(index).map(|seg| face(seg, false))],
                    |node_id| SolverLoad3D::Nodal(SolverNodalLoad3D {
                        node_id, fx: 0.0, fy: if gravity_axis == 1 { -axle.weight } else { 0.0 },
                        fz: if gravity_axis == 2 { -axle.weight } else { 0.0 }, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                    }),
                );
            }
            None => {}
        }
    }
    Ok(sample)
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

        check_path_segment(cum_pos, cum_pos + l, l, 0.0)?;
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

#[cfg(test)]
mod diagram_limit_tests {
    use super::*;

    #[test]
    fn moving_range_keeps_end_forces_and_recovered_tip_limits() {
        let mut ef: ElementForces3D = serde_json::from_value(serde_json::json!({
            "elementId": 1, "length": 10.0, "nStart": 0.0, "nEnd": 0.0,
            "vyStart": 0.0, "vyEnd": 0.0, "vzStart": 0.0, "vzEnd": 0.0,
            "mxStart": 0.0, "mxEnd": 0.0, "myStart": 50.0, "myEnd": 0.0,
            "mzStart": 0.0, "mzEnd": 0.0, "qYI": 0.0, "qYJ": 0.0,
            "qZI": -1.0, "qZJ": -1.0, "distributedLoadsY": [], "distributedLoadsZ": [],
            "pointLoadsY": [], "pointLoadsZ": [{"a": 10.0, "p": 10.0}]
        })).unwrap();
        assert_eq!(member_diagram_range_3d(&ef, "shearZ", [0.0; 2]).unwrap(), (-10.0, 0.0));
        ef.point_loads_z[0].a = f64::from_bits(10.0_f64.to_bits() - 1);
        let range = member_diagram_range_3d(&ef, "shearZ", [0.0; 2]).unwrap();
        assert!(range.0 > -10.0 && range.0 < -9.0, "{range:?}");
    }
}

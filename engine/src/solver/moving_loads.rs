use crate::postprocess::diagram_extrema::{CoincidentAxle, MovingForceCuts};
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
    #[serde(default)]
    pub station_roundoff: [f64; 2],
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

pub(crate) fn reference_sample_count(start: f64, end: f64, step: f64, end_roundoff: f64) -> Result<f64, &'static str> {
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
    let bound = joint_roundoff(end, end).max(end_roundoff);
    let reaches = |index: f64| {
        let [station, arithmetic] = ReferencePosition::new(start, step, index).axle_station(0.0);
        station - end <= bound.max(arithmetic)
    };
    if reaches(last + 1.0) {
        Ok(last + 2.0)
    } else if reaches(last) {
        Ok(last + 1.0)
    } else {
        Ok(last)
    }
}

#[derive(Clone, Copy)]
pub struct ReferencePosition {
    base: f64,
    step: f64,
    index: f64,
}

impl ReferencePosition {
    pub(crate) fn new(base: f64, step: f64, index: f64) -> Self {
        Self { base, step, index }
    }

    pub(crate) fn axle_station(self, offset: f64) -> [f64; 2] {
        let travel = self.index * self.step;
        let travel_error = self.index.mul_add(self.step, -travel);
        let (reference, reference_error) = sum_with_error(self.base, travel);
        let (station, station_error) = sum_with_error(reference, offset);
        let arithmetic = if travel_error == 0.0 {
            0.0
        } else {
            self.index * rounding_radius(self.step) + rounding_radius(self.base) + rounding_radius(travel)
        };
        [station + (travel_error + reference_error + station_error), arithmetic]
    }
}

impl From<f64> for ReferencePosition {
    fn from(position: f64) -> Self {
        Self::new(position, 0.0, 0.0)
    }
}

fn sum_with_error(a: f64, b: f64) -> (f64, f64) {
    let sum = a + b;
    let b_in_sum = sum - a;
    (sum, (a - (sum - b_in_sum)) + (b - b_in_sum))
}

pub fn reference_positions(
    train: &LoadTrain, end: f64, step: f64, end_roundoff: f64,
) -> Result<impl Iterator<Item = ReferencePosition> + use<>, String> {
    let start = -train.axles.iter().map(|axle| axle.offset).fold(0.0, f64::max);
    check_step(step, end - start)?;
    let count = reference_sample_count(start, end, step, end_roundoff)? as usize;
    Ok((0..count).map(move |index| ReferencePosition::new(start, step, index as f64)))
}

#[derive(Clone, Copy)]
struct RouteSegment {
    start: f64,
    end: f64,
    length: f64,
    reversed: bool,
    roundoff: [f64; 2],
}

enum RouteStation {
    Interior { segment: usize, a: f64 },
    Joint(usize),
}

fn route_station(
    count: usize,
    segment: impl Fn(usize) -> RouteSegment,
    [position, arithmetic]: [f64; 2],
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
    let a = sampled_axle_station(part.start, part.end, part.length, part.reversed, position, part.roundoff, arithmetic)?;
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

fn axle_cut_force([axial, y, z]: [f64; 3], axial_only: bool) -> [f64; 3] {
    if axial_only { [axial, 0.0, 0.0] } else { [axial, y, z] }
}

#[derive(Default)]
struct MemberLimit {
    faces: [[f64; 3]; 2],
    coincident: Vec<CoincidentAxle>,
}

impl MemberLimit {
    fn add_face(&mut self, face: AxleFace) {
        let load = &mut self.faces[usize::from(face.at_end)];
        for (sum, action) in load.iter_mut().zip(face.local_force) {
            *sum += action;
        }
    }

    fn add_coincident(&mut self, station: f64, force: [f64; 3], moving_after: bool) {
        if let Some(axle) = self.coincident.iter_mut().find(|axle| axle.station == station && axle.moving_after == moving_after) {
            for (sum, action) in axle.force.iter_mut().zip(force) {
                *sum += action;
            }
        } else {
            self.coincident.push(CoincidentAxle { station, force, moving_after });
        }
    }

    fn component(&self, axis: usize) -> MovingForceCuts<'_> {
        MovingForceCuts { faces: self.faces.map(|face| face[axis]), coincident: &self.coincident, axis }
    }
}

struct SampleLimit<L> {
    changes: Vec<(usize, Option<L>)>,
    members: HashMap<usize, MemberLimit>,
}

struct MovingSample<L> {
    loads: Vec<L>,
    limits: [SampleLimit<L>; 2],
    permanent_stations: HashMap<usize, Vec<f64>>,
    has_joint: bool,
}

impl<L: Clone> MovingSample<L> {
    fn new(loads: &[L], point_station: impl Fn(&L) -> Option<(usize, f64)>) -> Self {
        let mut permanent_stations = HashMap::<_, Vec<_>>::new();
        for (element, station) in loads.iter().filter_map(point_station) {
            permanent_stations.entry(element).or_default().push(station);
        }
        Self {
            loads: loads.to_vec(),
            limits: std::array::from_fn(|_| SampleLimit { changes: Vec::new(), members: HashMap::new() }),
            permanent_stations,
            has_joint: false,
        }
    }

    fn add_interior(&mut self, load: L, element: usize, station: f64, reversed: bool, force: [f64; 3]) {
        self.loads.push(load);
        if self.permanent_stations.get(&element).is_some_and(|stations| stations.contains(&station)) {
            for (limit, moving_after) in self.limits.iter_mut().zip([reversed, !reversed]) {
                limit.members.entry(element).or_default().add_coincident(station, force, moving_after);
            }
        }
    }

    fn add_joint(&mut self, faces: [Option<AxleFace>; 2], load_at: impl Fn(usize) -> L) {
        let Some(node) = faces.iter().flatten().next().map(|face| face.node) else { return };
        self.has_joint = true;
        let index = self.loads.len();
        self.loads.push(load_at(node));
        for (limit, face) in self.limits.iter_mut().zip(faces) {
            if let Some(face) = face {
                limit.members.entry(face.element).or_default().add_face(face);
            }
            if face.map(|face| face.node) != Some(node) {
                limit.changes.push((index, face.map(|face| load_at(face.node))));
            }
        }
    }

    fn fold<R>(
        &self,
        mut solve: impl FnMut(&[L]) -> Result<R, String>,
        mut fold: impl FnMut(&R, &HashMap<usize, MemberLimit>, bool) -> Result<(), String>,
    ) -> Result<(), String> {
        let exact = solve(&self.loads)?;
        fold(&exact, &HashMap::new(), false)?;
        if !self.has_joint {
            return Ok(());
        }
        for limit in &self.limits {
            if limit.changes.is_empty() {
                if !limit.members.is_empty() {
                    fold(&exact, &limit.members, true)?;
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
            fold(&solve(&loads)?, &limit.members, false)?;
        }
        Ok(())
    }
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
    let positions = reference_positions(train, total_length, step, path.last().unwrap().station_roundoff[1])?;

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
            |results, limits, reuse| {
                if !reuse {
                    crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
                }
                for ef in &results.element_forces {
                    let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) else { continue };
                    let limit = limits.get(&ef.element_id);
                    if reuse && limit.is_none() {
                        continue;
                    }
                    let cuts = |axis| limit.map_or_else(MovingForceCuts::default, |limit| limit.component(axis));
                    let (lo, hi) = member_diagram_range_2d(ef, "moment", MovingForceCuts::default())?;
                    env.m_max_pos = env.m_max_pos.max(hi);
                    env.m_max_neg = env.m_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_2d(ef, "shear", cuts(2))?;
                    env.v_max_pos = env.v_max_pos.max(hi);
                    env.v_max_neg = env.v_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_2d(ef, "axial", cuts(0))?;
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
    pos: impl Into<ReferencePosition>,
) -> Result<Vec<SolverLoad>, String> {
    let elements = crate::ordered::values(&solver_input.elements).map(|elem| (elem.id, elem)).collect();
    Ok(sample_2d(solver_input, train, path, pos.into(), &elements)?.loads)
}

fn sample_2d(
    input: &SolverInput,
    train: &LoadTrain,
    path: &[PathSegment],
    pos: ReferencePosition,
    elements: &HashMap<usize, &SolverElement>,
) -> Result<MovingSample<SolverLoad>, String> {
    let mut sample = MovingSample::new(&input.loads, |load| match load {
        SolverLoad::PointOnElement(load) => Some((load.element_id, load.a)),
        _ => None,
    });
    for axle in &train.axles {
        let station = route_station(path.len(), |index| {
            let part = &path[index];
            RouteSegment { start: part.start_pos, end: part.end_pos, length: part.length, reversed: part.reversed, roundoff: part.station_roundoff }
        }, pos.axle_station(axle.offset))?;
        match station {
            Some(RouteStation::Interior { segment, a }) => {
                let part = &path[segment];
                let p = -axle.weight * part.cos;
                let px = (part.sin != 0.0).then_some(-axle.weight * part.sin);
                let load = SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: part.element_id, a, p, px, my: None,
                });
                let force = axle_cut_force([px.unwrap_or(0.0), 0.0, p], elements[&part.element_id].elem_type == "truss");
                sample.add_interior(load, part.element_id, a, part.reversed, force);
            }
            Some(RouteStation::Joint(index)) => {
                let face = |segment: &PathSegment, exit: bool| {
                    let elem = elements[&segment.element_id];
                    let at_end = exit != segment.reversed;
                    AxleFace {
                        element: elem.id,
                        node: if at_end { elem.node_j } else { elem.node_i },
                        at_end,
                        local_force: axle_cut_force(
                            [-axle.weight * segment.sin, 0.0, -axle.weight * segment.cos],
                            elem.elem_type == "truss",
                        ),
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
    let mut cum_roundoff = 0.0;

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

        let station_roundoff = [cum_roundoff, cum_roundoff + segment_coordinate_roundoff([ni.x, 0.0, ni.z], [nj.x, 0.0, nj.z])];
        check_path_segment(cum_pos, cum_pos + l, l, station_roundoff)?;
        path.push(PathSegment {
            element_id: *eid,
            start_pos: cum_pos,
            end_pos: cum_pos + l,
            length: l,
            station_roundoff,
            cos,
            sin,
            reversed: reversed[k],
        });
        cum_pos += l;
        cum_roundoff = station_roundoff[1];
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

fn joint_roundoff(station: f64, length: f64) -> f64 {
    let geometry_scale = if station == 0.0 { length } else { station.abs() };
    (8.0 * f64::EPSILON) * geometry_scale
}

fn rounding_radius(value: f64) -> f64 {
    let magnitude = value.abs();
    (magnitude.next_up() - magnitude) / 2.0
}

pub(crate) fn segment_coordinate_roundoff(start: [f64; 3], end: [f64; 3]) -> f64 {
    let mut nominal = 0.0_f64;
    let mut lower = 0.0_f64;
    let mut upper = 0.0_f64;
    for (a, b) in start.into_iter().zip(end) {
        let distance = (b - a).abs();
        let uncertainty = rounding_radius(a) + rounding_radius(b);
        nominal = nominal.hypot(distance);
        lower = lower.hypot((distance - uncertainty).max(0.0));
        upper = upper.hypot(distance + uncertainty);
    }
    (nominal - lower).max(upper - nominal)
}

pub(crate) fn check_path_segment(
    start: f64, end: f64, length: f64, [start_roundoff, end_roundoff]: [f64; 2],
) -> Result<(), &'static str> {
    let start_bound = joint_roundoff(start, length).max(start_roundoff);
    let end_bound = joint_roundoff(end, length).max(end_roundoff);
    if length.is_finite() && length > 0.0 && end.is_finite() && end - start > start_bound + end_bound {
        Ok(())
    } else {
        Err(UNRESOLVED_AXLE_STATION)
    }
}

pub(crate) fn sampled_axle_station(
    start: f64, end: f64, length: f64, reversed: bool, position: f64,
    roundoff: [f64; 2], arithmetic: f64,
) -> Result<Option<f64>, &'static str> {
    check_path_segment(start, end, length, roundoff)?;
    if !position.is_finite() || !arithmetic.is_finite() {
        return Err(UNRESOLVED_AXLE_STATION);
    }
    let from_start = position - start;
    let to_end = end - position;
    let at_start = from_start.abs() <= joint_roundoff(start, length).max(roundoff[0]).max(arithmetic);
    let at_end = to_end.abs() <= joint_roundoff(end, length).max(roundoff[1]).max(arithmetic);
    match (at_start, at_end) {
        (true, true) => return Err(UNRESOLVED_AXLE_STATION),
        (true, false) => return Ok(Some(if reversed { length } else { 0.0 })),
        (false, true) => return Ok(Some(if reversed { 0.0 } else { length })),
        (false, false) => {}
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
    #[serde(default)]
    pub station_roundoff: [f64; 2],
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
    let positions = reference_positions(train, total_length, step, path.last().unwrap().station_roundoff[1])?;

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
            |results, limits, reuse| {
                if !reuse {
                    crate::known_issues::attach(&mut structured_diagnostics, results.structured_diagnostics.clone());
                }
                for ef in &results.element_forces {
                    let Some(env) = envelopes.get_mut(&ef.element_id.to_string()) else { continue };
                    let limit = limits.get(&ef.element_id);
                    if reuse && limit.is_none() {
                        continue;
                    }
                    let cuts = |axis| limit.map_or_else(MovingForceCuts::default, |limit| limit.component(axis));
                    let (lo, hi) = member_diagram_range_3d(ef, "axial", cuts(0))?;
                    env.n_max_pos = env.n_max_pos.max(hi);
                    env.n_max_neg = env.n_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "shearY", cuts(1))?;
                    env.vy_max_pos = env.vy_max_pos.max(hi);
                    env.vy_max_neg = env.vy_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "shearZ", cuts(2))?;
                    env.vz_max_pos = env.vz_max_pos.max(hi);
                    env.vz_max_neg = env.vz_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "momentY", MovingForceCuts::default())?;
                    env.my_max_pos = env.my_max_pos.max(hi);
                    env.my_max_neg = env.my_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "momentZ", MovingForceCuts::default())?;
                    env.mz_max_pos = env.mz_max_pos.max(hi);
                    env.mz_max_neg = env.mz_max_neg.min(lo);
                    let (lo, hi) = member_diagram_range_3d(ef, "torsion", MovingForceCuts::default())?;
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
    pos: impl Into<ReferencePosition>,
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
    pos: impl Into<ReferencePosition>,
    maps: &MovingLoadMaps3d,
) -> Result<Vec<SolverLoad3D>, String> {
    Ok(sample_3d(solver_input, train, gravity, path, pos.into(), maps)?.loads)
}

fn sample_3d(
    input: &SolverInput3D,
    train: &LoadTrain,
    gravity: &str,
    path: &[PathSegment3D],
    pos: ReferencePosition,
    maps: &MovingLoadMaps3d,
) -> Result<MovingSample<SolverLoad3D>, String> {
    let mut sample = MovingSample::new(&input.loads, |load| match load {
        SolverLoad3D::PointOnElement(load) => Some((load.element_id, load.a)),
        _ => None,
    });
    let gravity_axis = if gravity == "y" { 1 } else { 2 };
    for axle in &train.axles {
        let station = route_station(path.len(), |index| {
            let part = &path[index];
            RouteSegment { start: part.start_pos, end: part.end_pos, length: part.length, reversed: part.reversed, roundoff: part.station_roundoff }
        }, pos.axle_station(axle.offset))?;
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
                let elem = maps.elem_by_id[&part.element_id];
                let force = local_force(elem);
                let [px, py, pz] = force;
                let load = SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: part.element_id, a, px, py, pz,
                });
                sample.add_interior(load, part.element_id, a, part.reversed, axle_cut_force(force, elem.elem_type == "truss"));
            }
            Some(RouteStation::Joint(index)) => {
                let face = |part: &PathSegment3D, exit: bool| {
                    let elem = maps.elem_by_id[&part.element_id];
                    let at_end = exit != part.reversed;
                    AxleFace {
                        element: elem.id,
                        node: if at_end { elem.node_j } else { elem.node_i },
                        at_end,
                        local_force: axle_cut_force(local_force(elem), elem.elem_type == "truss"),
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
    let mut cum_roundoff = 0.0;

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

        let station_roundoff = [cum_roundoff, cum_roundoff + segment_coordinate_roundoff([ni.x, ni.y, ni.z], [nj.x, nj.y, nj.z])];
        check_path_segment(cum_pos, cum_pos + l, l, station_roundoff)?;
        path.push(PathSegment3D {
            element_id: *eid,
            start_pos: cum_pos,
            end_pos: cum_pos + l,
            length: l,
            station_roundoff,
            dir_x: dx / l,
            dir_y: dy / l,
            dir_z: dz / l,
            reversed: reversed[k],
        });
        cum_pos += l;
        cum_roundoff = station_roundoff[1];
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
        assert_eq!(member_diagram_range_3d(&ef, "shearZ", MovingForceCuts::default()).unwrap(), (-10.0, 0.0));
        ef.point_loads_z[0].a = f64::from_bits(10.0_f64.to_bits() - 1);
        let range = member_diagram_range_3d(&ef, "shearZ", MovingForceCuts::default()).unwrap();
        assert!(range.0 > -10.0 && range.0 < -9.0, "{range:?}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metamorphic::planes::{embed_2d, Plane};

    #[test]
    fn simultaneous_entrance_and_exit_stage_only_the_axle_on_the_route() {
        let mut planar: SolverInput =
            serde_json::from_str(include_str!("../../tests/fixtures/moving-shear-2104.json")).unwrap();
        planar.loads.clear();
        let path = build_load_path(&planar, Some(&[1])).unwrap();
        let spatial = embed_2d(&planar, Plane::XZ).unwrap();
        let path_3d = build_load_path_3d(&spatial, Some(&[1])).unwrap();
        let train = LoadTrain {
            name: "simultaneous entry and exit".into(),
            axles: vec![
                Axle { offset: 0.0, weight: 100.0 },
                Axle { offset: path[0].length, weight: 50.0 },
            ],
        };
        let expected = [
            vec![(1, -100.0), (2, -50.0)],
            vec![(2, -50.0)],
            vec![(1, -100.0)],
        ];
        let elements = planar.elements.values().map(|element| (element.id, element)).collect();
        let sample = sample_2d(&planar, &train, &path, 0.0.into(), &elements).unwrap();
        let mut load_sets = Vec::new();
        sample.fold(|loads| {
            load_sets.push(loads.iter().map(|load| match load {
                SolverLoad::Nodal(load) => (load.node_id, load.fz),
                _ => panic!("expected a nodal axle"),
            }).collect::<Vec<_>>());
            Ok(())
        }, |_, _, _| Ok(())).unwrap();
        assert_eq!(load_sets, expected);

        let maps = MovingLoadMaps3d::new(&spatial);
        let sample = sample_3d(&spatial, &train, "z", &path_3d, 0.0.into(), &maps).unwrap();
        let mut load_sets = Vec::new();
        sample.fold(|loads| {
            load_sets.push(loads.iter().map(|load| match load {
                SolverLoad3D::Nodal(load) => (load.node_id, load.fz),
                _ => panic!("expected a nodal axle"),
            }).collect::<Vec<_>>());
            Ok(())
        }, |_, _, _| Ok(())).unwrap();
        assert_eq!(load_sets, expected);
    }
}

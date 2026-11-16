use crate::types::*;
use std::{borrow::Cow, collections::HashMap};

fn endpoint_scale<const D: usize>(i: [f64; D], j: [f64; D], b: Option<f64>) -> Option<f64> {
    let b = b?;
    let delta: [f64; D] = std::array::from_fn(|k| j[k] - i[k]);
    let length = delta.iter().map(|d| d * d).sum::<f64>().sqrt();
    if !b.is_finite() || !length.is_finite() || length <= 0.0 || b <= length {
        return None;
    }
    let rounding = f64::EPSILON * 4.0 * length;
    if b - length > rounding {
        return None;
    }
    let alternate = delta.iter().fold(0.0_f64, |s, d| s.hypot(*d));
    let coincides = (0..D).all(|k| i[k] + (delta[k] / length) * b == j[k]);
    (b == alternate || coincides).then_some(b / length)
}

fn scaled_pair(q_i: f64, q_j: f64, scale: f64) -> Option<[f64; 2]> {
    let pair = [q_i * scale, q_j * scale];
    for weights in [[0.5, 0.5], [1.0 / 6.0, 1.0 / 3.0]] {
        let source = (q_i * weights[0] + q_j * weights[1]) * scale;
        let mapped = pair[0] * weights[0] + pair[1] * weights[1];
        if !source.is_finite()
            || !mapped.is_finite()
            || (source - mapped).abs() > f64::EPSILON * 4.0 * source.abs()
        {
            return None;
        }
    }
    Some(pair)
}

fn map_interval(a: &mut Option<f64>, b: &mut Option<f64>, scale: f64) {
    *a = a.map(|a| a / scale);
    *b = None;
}

pub(super) fn plane<'a>(input: &SolverInput, loads: &'a [SolverLoad]) -> Cow<'a, [SolverLoad]> {
    let nodes: HashMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let elements: HashMap<_, _> = input.elements.values().map(|e| (e.id, e)).collect();
    let mut result = Cow::Borrowed(loads);
    for (k, load) in loads.iter().enumerate() {
        let (id, b) = match load {
            SolverLoad::Distributed(d) => (d.element_id, d.b),
            SolverLoad::AxialDistributed(d) => (d.element_id, d.b),
            _ => continue,
        };
        let Some(e) = elements.get(&id) else { continue };
        let (Some(i), Some(j)) = (nodes.get(&e.node_i), nodes.get(&e.node_j)) else {
            continue;
        };
        let Some(scale) = endpoint_scale([i.x, i.z], [j.x, j.z], b) else {
            continue;
        };
        match &mut result.to_mut()[k] {
            SolverLoad::Distributed(d) => {
                let Some(pair) = scaled_pair(d.q_i, d.q_j, scale) else {
                    continue;
                };
                map_interval(&mut d.a, &mut d.b, scale);
                [d.q_i, d.q_j] = pair;
            }
            SolverLoad::AxialDistributed(d) => {
                let Some(pair) = scaled_pair(d.q_i, d.q_j, scale) else {
                    continue;
                };
                map_interval(&mut d.a, &mut d.b, scale);
                [d.q_i, d.q_j] = pair;
            }
            _ => unreachable!(),
        }
    }
    result
}

pub(super) fn space<'a>(
    input: &SolverInput3D,
    loads: &'a [SolverLoad3D],
) -> Cow<'a, [SolverLoad3D]> {
    let nodes: HashMap<_, _> = input.nodes.values().map(|n| (n.id, n)).collect();
    let elements: HashMap<_, _> = input.elements.values().map(|e| (e.id, e)).collect();
    let mut result = Cow::Borrowed(loads);
    for (k, load) in loads.iter().enumerate() {
        let SolverLoad3D::Distributed(d) = load else {
            continue;
        };
        let Some(e) = elements.get(&d.element_id) else {
            continue;
        };
        let (Some(i), Some(j)) = (nodes.get(&e.node_i), nodes.get(&e.node_j)) else {
            continue;
        };
        let Some(scale) = endpoint_scale([i.x, i.y, i.z], [j.x, j.y, j.z], d.b) else {
            continue;
        };
        let SolverLoad3D::Distributed(d) = &mut result.to_mut()[k] else {
            unreachable!()
        };
        let pairs = [
            scaled_pair(d.q_xi, d.q_xj, scale),
            scaled_pair(d.q_yi, d.q_yj, scale),
            scaled_pair(d.q_zi, d.q_zj, scale),
        ];
        let [Some(x), Some(y), Some(z)] = pairs else {
            continue;
        };
        map_interval(&mut d.a, &mut d.b, scale);
        [d.q_xi, d.q_xj] = x;
        [d.q_yi, d.q_yj] = y;
        [d.q_zi, d.q_zj] = z;
    }
    result
}

pub(super) fn plane_input(input: &SolverInput) -> Cow<'_, SolverInput> {
    match plane(input, &input.loads) {
        Cow::Borrowed(_) => Cow::Borrowed(input),
        Cow::Owned(loads) => Cow::Owned(SolverInput {
            loads,
            ..input.clone()
        }),
    }
}

pub(super) fn space_input(input: &SolverInput3D) -> Cow<'_, SolverInput3D> {
    match space(input, &input.loads) {
        Cow::Borrowed(_) => Cow::Borrowed(input),
        Cow::Owned(loads) => Cow::Owned(SolverInput3D {
            loads,
            ..input.clone()
        }),
    }
}

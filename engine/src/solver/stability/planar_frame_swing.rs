use super::{DofNumbering, TranslationMechanism, SolverInput};
use crate::sanity::geometry::Components;
use crate::solver::support::support_dofs_2d;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn find_swings(input: &SolverInput, dof: &DofNumbering) -> Vec<TranslationMechanism> {
    let mut components = Components::new();
    let mut frame_ends = Vec::new();
    let mut rotations = BTreeMap::new();
    let mut axial_neighbors = BTreeMap::<usize, Vec<usize>>::new();
    for element in crate::ordered::values(&input.elements) {
        if element.elem_type != "frame" {
            axial_neighbors.entry(element.node_i).or_default().push(element.node_j);
            axial_neighbors.entry(element.node_j).or_default().push(element.node_i);
            continue;
        }
        let member = frame_ends.len();
        let ends = [(element.node_i, !element.hinge_start), (element.node_j, !element.hinge_end)];
        for (node, rotation) in ends {
            if rotation {
                if let Some(other) = rotations.insert(node, member) {
                    components.union(member, other);
                }
            }
        }
        frame_ends.push(ends);
    }

    let mut groups = BTreeMap::<usize, BTreeMap<usize, bool>>::new();
    let mut membership = BTreeMap::<usize, BTreeSet<usize>>::new();
    for (member, ends) in frame_ends.into_iter().enumerate() {
        let group = components.find(member);
        for (node, rotation) in ends {
            *groups.entry(group).or_default().entry(node).or_default() |= rotation;
            membership.entry(node).or_default().insert(group);
        }
    }

    let connectors: BTreeSet<_> = input.connectors.values().flat_map(|e| [e.node_i, e.node_j]).collect();
    let mut translation_springs = BTreeSet::new();
    let mut rotation_springs = BTreeSet::new();
    for support in input.supports.values() {
        let [x, z, r] = support_dofs_2d(support);
        if super::has_spring([x, z]) {
            translation_springs.insert(support.node_id);
        }
        if super::has_spring([r]) {
            rotation_springs.insert(support.node_id);
        }
    }
    let positions: BTreeMap<_, _> = input.nodes.values().map(|node| (node.id, node)).collect();
    let free = |node, local| dof.global_dof(node, local).filter(|&index| index < dof.n_free);
    groups.into_values().filter_map(|nodes| {
        let mut pivots = nodes.keys().copied().filter(|node| {
            free(*node, 0).is_none() || free(*node, 1).is_none()
                || translation_springs.contains(node) || connectors.contains(node)
                || membership[node].len() > 1
                || axial_neighbors.get(node).is_some_and(|ends| ends.iter().any(|n| !nodes.contains_key(n)))
        });
        let pivot = pivots.next().or_else(|| nodes.first_key_value().map(|(&node, _)| node))?;
        if pivots.next().is_some() {
            return None;
        }
        let mut moving = Vec::new();
        let mut dofs = Vec::new();
        for (&node, &rotation) in &nodes {
            if node != pivot {
                moving.push(node);
                dofs.extend([free(node, 0)?, free(node, 1)?]);
            }
            if rotation {
                if connectors.contains(&node) || rotation_springs.contains(&node) {
                    return None;
                }
                dofs.push(free(node, 2)?);
            }
        }
        let tip = positions.get(moving.first()?)?;
        let pivot = positions.get(&pivot)?;
        let component = if (tip.z - pivot.z).abs() > (tip.x - pivot.x).abs() { "ux" } else { "uz" };
        Some(TranslationMechanism::planar_swing(moving, dofs, component))
    }).collect()
}

use std::collections::{BTreeMap, BTreeSet};

use num_rational::BigRational as Rational;
use num_traits::{One, Signed, Zero};

use super::constraints::FreeConstraintSystem;
use super::dof::DofNumbering;
use crate::types::{SolverInput, SolverInput3D};

#[derive(Default)]
pub(super) struct StructuralKinematics {
    axial_joints: Vec<TranslationMechanism>,
    frame_swings: Vec<(TranslationMechanism, Option<&'static str>)>,
    isolated_axial: Vec<TranslationMechanism>,
    isolated_frames: Vec<TranslationMechanism>,
}

pub(super) struct TranslationMechanism {
    nodes: Vec<usize>,
    motion: TranslationMotion,
    planar_component: Option<&'static str>,
}

enum TranslationMotion {
    Isolated(Vec<usize>),
    Exact(LocalMotion),
}

impl TranslationMechanism {
    pub(super) fn isolated(nodes: Vec<usize>, dofs: Vec<usize>) -> Self {
        Self { nodes, motion: TranslationMotion::Isolated(dofs), planar_component: None }
    }

    pub(super) fn planar_swing(nodes: Vec<usize>, dofs: Vec<usize>, component: &'static str) -> Self {
        Self { planar_component: Some(component), ..Self::isolated(nodes, dofs) }
    }

    fn local(node: usize, components: Vec<(usize, Row)>, conditions: RowBasis) -> Self {
        Self {
            nodes: vec![node],
            motion: TranslationMotion::Exact(LocalMotion { components, conditions }),
            planar_component: None,
        }
    }

    fn admissible(
        &self,
        constraints: Option<&FreeConstraintSystem>,
        inactive: &[usize],
        additional_dofs: &[bool],
    ) -> bool {
        match &self.motion {
            TranslationMotion::Isolated(dofs) => dofs.iter().all(|&dof| {
                let retained = match constraints {
                    Some(cs) => cs.c_ff.isolated_unit_column(dof),
                    None => Some(dof),
                };
                additional_dofs.get(dof) != Some(&true)
                    && retained.is_some_and(|index| inactive.binary_search(&index).is_err())
            }),
            TranslationMotion::Exact(motion) => motion.admissible(constraints, inactive, additional_dofs),
        }
    }
}

pub(super) enum MechanismWitness {
    Unrestrained { nodes: Vec<usize>, frame_nodes: Vec<usize>, planar_component: Option<&'static str> },
    AxialJoint(usize),
    FrameSwing { node: usize, planar_component: Option<&'static str> },
}

struct LocalMotion {
    components: Vec<(usize, Row)>,
    conditions: RowBasis,
}

type Row = Vec<Rational>;

#[derive(Clone)]
struct RowBasis {
    rows: Vec<Option<Row>>,
}

impl RowBasis {
    fn new(width: usize) -> Self {
        Self {
            rows: vec![None; width],
        }
    }

    fn add(&mut self, mut row: Row) {
        for (pivot, basis) in self.rows.iter_mut().enumerate() {
            if row[pivot].is_zero() {
                continue;
            }
            let Some(basis) = basis else {
                *basis = Some(row);
                return;
            };
            let scale = &row[pivot] / &basis[pivot];
            for (value, entry) in row[pivot..].iter_mut().zip(&basis[pivot..]) {
                *value -= &scale * entry;
            }
        }
    }

    fn has_kernel(&self) -> bool {
        self.rows.iter().any(Option::is_none)
    }
}

impl StructuralKinematics {
    pub(super) fn isolated(axial: Vec<TranslationMechanism>) -> Self {
        Self { isolated_axial: axial, ..Self::default() }
    }

    pub(super) fn extend_axial(&mut self, mechanisms: Vec<TranslationMechanism>) {
        self.isolated_axial.extend(mechanisms);
    }

    pub(super) fn extend_frames(&mut self, mechanisms: Vec<TranslationMechanism>) {
        self.isolated_frames.extend(mechanisms);
    }

    pub(super) fn planar(input: &SolverInput, dof: &DofNumbering) -> Self {
        let mut neighbors = BTreeMap::new();
        let mut other_members = BTreeSet::new();
        let mut unsupported = BTreeSet::new();
        let mut incidence = BTreeMap::new();
        for element in input.elements.values() {
            *incidence.entry(element.node_i).or_insert(0) += 1;
            *incidence.entry(element.node_j).or_insert(0) += 1;
            record_member(
                &mut neighbors,
                &mut other_members,
                element.node_i,
                element.node_j,
                &element.elem_type,
            );
        }
        for connector in input.connectors.values() {
            unsupported.extend([connector.node_i, connector.node_j]);
        }
        let mut springs = BTreeSet::new();
        for support in input.supports.values() {
            let settings = super::support::support_dofs_2d(support);
            for (axis, setting) in settings.iter().enumerate() {
                if setting.spring.is_some_and(|value| value != 0.0) {
                    springs.insert((support.node_id, axis));
                    if support.support_type == "spring" && support.angle.unwrap_or(0.0) != 0.0 {
                        unsupported.insert(support.node_id);
                    }
                }
            }
            if support.support_type == "inclinedRoller" {
                unsupported.insert(support.node_id);
            }
        }
        let positions = input
            .nodes
            .values()
            .map(|node| (node.id, [node.x, node.z]))
            .collect();
        let mut frame_swings = Vec::new();
        for member in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
            for (pivot, tip, released, tip_released) in [
                (
                    member.node_i,
                    member.node_j,
                    member.hinge_start,
                    member.hinge_end,
                ),
                (
                    member.node_j,
                    member.node_i,
                    member.hinge_end,
                    member.hinge_start,
                ),
            ] {
                if !released || !terminal(tip, &incidence, &unsupported) {
                    continue;
                }
                let Some(chord) = chord(&positions, pivot, tip) else {
                    continue;
                };
                let rows = [
                    vec![-&chord[1]],
                    vec![chord[0].clone()],
                    vec![if tip_released {
                        Rational::zero()
                    } else {
                        Rational::one()
                    }],
                ];
                if let Some(swing) =
                    LocalMotion::at_node(tip, rows, RowBasis::new(1), dof, &springs)
                {
                    let component = if chord[1].abs() > chord[0].abs() { "ux" } else { "uz" };
                    frame_swings.push((swing, Some(component)));
                }
            }
        }
        other_members.extend(unsupported);
        Self {
            axial_joints: Self::axial_joints(dof, &positions, neighbors, &other_members, &springs),
            frame_swings,
            ..Self::default()
        }
    }

    pub(super) fn spatial(input: &SolverInput3D, dof: &DofNumbering) -> Self {
        let mut neighbors = BTreeMap::new();
        let mut other_members = BTreeSet::new();
        let mut unsupported: BTreeSet<_> = super::stability::non_member_attachments_3d(input).collect();
        let mut incidence = BTreeMap::new();
        for element in input.elements.values() {
            *incidence.entry(element.node_i).or_insert(0) += 1;
            *incidence.entry(element.node_j).or_insert(0) += 1;
            record_member(
                &mut neighbors,
                &mut other_members,
                element.node_i,
                element.node_j,
                &element.elem_type,
            );
        }
        let mut springs = BTreeSet::new();
        for support in input.supports.values() {
            if support.is_inclined == Some(true) {
                unsupported.insert(support.node_id);
            }
            let settings = super::support::support_dofs_3d(support);
            for (axis, setting) in settings[..6].iter().enumerate() {
                if setting.spring.is_some_and(|value| value != 0.0) {
                    springs.insert((support.node_id, axis));
                }
            }
        }

        let positions = input
            .nodes
            .values()
            .map(|node| (node.id, [node.x, node.y, node.z]))
            .collect();
        let mut frame_swings = Vec::new();
        for member in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
            for (pivot, tip, my, mz) in [
                (
                    member.node_i,
                    member.node_j,
                    member.release_my_start,
                    member.release_mz_start,
                ),
                (
                    member.node_j,
                    member.node_i,
                    member.release_my_end,
                    member.release_mz_end,
                ),
            ] {
                if !(my && mz) || input.left_hand.unwrap_or(false) || !terminal(tip, &incidence, &unsupported) {
                    continue;
                }
                let Some(chord) = chord(&positions, pivot, tip) else {
                    continue;
                };
                let [x, y, z] = chord.as_slice() else {
                    unreachable!()
                };
                let rows = [
                    vec![Rational::zero(), z.clone(), -y],
                    vec![-z, Rational::zero(), x.clone()],
                    vec![y.clone(), -x, Rational::zero()],
                    unit_row(3, 0),
                    unit_row(3, 1),
                    unit_row(3, 2),
                ];
                let mut conditions = RowBasis::new(3);
                conditions.add(chord);
                if let Some(swing) = LocalMotion::at_node(tip, rows, conditions, dof, &springs)
                {
                    frame_swings.push((swing, None));
                }
            }
        }
        other_members.extend(unsupported);
        Self {
            axial_joints: Self::axial_joints(dof, &positions, neighbors, &other_members, &springs),
            frame_swings,
            ..Self::default()
        }
    }

    fn axial_joints<const D: usize>(
        dof: &DofNumbering,
        positions: &BTreeMap<usize, [f64; D]>,
        neighbors: BTreeMap<usize, Vec<usize>>,
        unsupported: &BTreeSet<usize>,
        springs: &BTreeSet<(usize, usize)>,
    ) -> Vec<TranslationMechanism> {
        neighbors
            .into_iter()
            .filter_map(|(node, mut others)| {
                if unsupported.contains(&node) || others.len() < 2 {
                    return None;
                }
                let axes: Vec<_> = (0..D)
                    .filter_map(|axis| {
                        let index = dof.global_dof(node, axis)?;
                        (index < dof.n_free && !springs.contains(&(node, axis)))
                            .then_some((axis, index))
                    })
                    .collect();
                if axes.is_empty() {
                    return None;
                }

                let origin = positions.get(&node)?;
                let mut strains = RowBasis::new(axes.len());
                others.sort_unstable();
                others.dedup();
                for other in others {
                    let end = positions.get(&other)?;
                    let row = axes
                        .iter()
                        .map(|&(axis, _)| {
                            Some(
                                Rational::from_float(end[axis])?
                                    - Rational::from_float(origin[axis])?,
                            )
                        })
                        .collect::<Option<Row>>()?;
                    strains.add(row);
                    if !strains.has_kernel() {
                        return None;
                    }
                }
                let width = axes.len();
                let components = axes.into_iter().enumerate()
                    .map(|(axis, (_, index))| (index, unit_row(width, axis)))
                    .collect();
                Some(TranslationMechanism::local(node, components, strains))
            })
            .collect()
    }

    pub(super) fn mechanism(
        &self,
        constraints: Option<&FreeConstraintSystem>,
        inactive: &[usize],
        additional_dofs: &[bool],
    ) -> Option<MechanismWitness> {
        let admissible = |motion: &&TranslationMechanism| motion.admissible(constraints, inactive, additional_dofs);
        if let Some(joint) = self.axial_joints.iter().find(admissible) {
            return Some(MechanismWitness::AxialJoint(joint.nodes[0]));
        }
        let axial_nodes = self.isolated_axial.iter().filter(admissible).flat_map(|m| m.nodes.iter().copied());
        let frames = self.isolated_frames.iter().filter(admissible);
        let planar_component = frames.clone().min_by_key(|m| m.nodes[0]).and_then(|m| m.planar_component);
        let frame_nodes: BTreeSet<_> = frames.flat_map(|m| m.nodes.iter().copied()).collect();
        let nodes: BTreeSet<_> = axial_nodes.chain(frame_nodes.iter().copied()).collect();
        if !nodes.is_empty() {
            return Some(MechanismWitness::Unrestrained {
                nodes: nodes.into_iter().collect(),
                frame_nodes: frame_nodes.into_iter().collect(),
                planar_component,
            });
        }
        self.frame_swings.iter()
            .find(|(motion, _)| motion.admissible(constraints, inactive, additional_dofs))
            .map(|(motion, component)| MechanismWitness::FrameSwing {
                node: motion.nodes[0],
                planar_component: *component,
            })
    }
}

impl LocalMotion {
    fn at_node<const N: usize>(
        node: usize,
        rows: [Row; N],
        mut conditions: RowBasis,
        dof: &DofNumbering,
        springs: &BTreeSet<(usize, usize)>,
    ) -> Option<TranslationMechanism> {
        let mut components = Vec::new();
        for (axis, row) in rows.into_iter().enumerate() {
            if row.iter().all(Zero::is_zero) {
                continue;
            }
            let index = dof.global_dof(node, axis)?;
            if index < dof.n_free && !springs.contains(&(node, axis)) {
                components.push((index, row));
            } else {
                conditions.add(row);
            }
        }
        conditions.has_kernel().then(|| TranslationMechanism::local(node, components, conditions))
    }

    fn admissible(
        &self,
        constraints: Option<&FreeConstraintSystem>,
        inactive: &[usize],
        additional_dofs: &[bool],
    ) -> bool {
        let mut conditions = self.conditions.clone();
        for (dof, row) in &self.components {
            if additional_dofs.get(*dof) == Some(&true)
                || (constraints.is_none() && inactive.binary_search(dof).is_ok())
            {
                conditions.add(row.clone());
            }
        }
        if let Some(system) = constraints {
            if self
                .restrict_to_constraint_range(system, inactive, &mut conditions)
                .is_none()
            {
                return false;
            }
        }
        conditions.has_kernel()
    }

    fn restrict_to_constraint_range(
        &self,
        system: &FreeConstraintSystem,
        inactive: &[usize],
        conditions: &mut RowBasis,
    ) -> Option<()> {
        let transform = &system.c_ff;
        let width = conditions.rows.len();
        let mut compatibility = BTreeMap::new();
        for (dof, components) in &self.components {
            let identity = compatibility
                .entry(*dof)
                .or_insert_with(|| vec![Rational::zero(); width]);
            for (value, component) in identity.iter_mut().zip(components) {
                *value -= component;
            }
            if let Ok(col) = system.independent_dofs().binary_search(dof) {
                if inactive.binary_search(&col).is_err() {
                    for p in transform.col_ptr[col]..transform.col_ptr[col + 1] {
                        let row = compatibility
                            .entry(transform.row_idx[p])
                            .or_insert_with(|| vec![Rational::zero(); width]);
                        let coefficient = Rational::from_float(transform.csc_vals[p])?;
                        for (value, component) in row.iter_mut().zip(components) {
                            *value += &coefficient * component;
                        }
                    }
                }
            }
        }
        for row in compatibility.into_values() {
            conditions.add(row);
        }
        Some(())
    }
}

fn unit_row(width: usize, axis: usize) -> Row {
    let mut row = vec![Rational::zero(); width];
    row[axis] = Rational::one();
    row
}

fn chord<const D: usize>(
    positions: &BTreeMap<usize, [f64; D]>,
    pivot: usize,
    tip: usize,
) -> Option<Row> {
    let a = positions.get(&pivot)?;
    let b = positions.get(&tip)?;
    let row: Row = a
        .iter()
        .zip(b)
        .map(|(&a, &b)| Some(Rational::from_float(b)? - Rational::from_float(a)?))
        .collect::<Option<_>>()?;
    row.iter().any(|value| !value.is_zero()).then_some(row)
}

fn terminal(
    node: usize,
    incidence: &BTreeMap<usize, usize>,
    unsupported: &BTreeSet<usize>,
) -> bool {
    incidence.get(&node) == Some(&1) && !unsupported.contains(&node)
}

fn record_member(
    neighbors: &mut BTreeMap<usize, Vec<usize>>,
    unsupported: &mut BTreeSet<usize>,
    a: usize,
    b: usize,
    element_type: &str,
) {
    if element_type == "truss" {
        neighbors.entry(a).or_default().push(b);
        neighbors.entry(b).or_default().push(a);
    } else {
        unsupported.extend([a, b]);
    }
}

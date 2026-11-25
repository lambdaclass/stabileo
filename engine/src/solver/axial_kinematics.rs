use std::collections::{BTreeMap, BTreeSet};

use num_rational::BigRational as Rational;
use num_traits::{One, Zero};

use super::constraints::FreeConstraintSystem;
use super::dof::DofNumbering;
use crate::types::{SolverInput, SolverInput3D};

#[derive(Default)]
pub(super) struct AxialKinematics(Vec<AxialJoint>);

struct AxialJoint {
    node: usize,
    dofs: Vec<usize>,
    strains: RowBasis,
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

    fn hold(&mut self, index: usize) {
        let mut row = vec![Rational::zero(); self.rows.len()];
        row[index] = Rational::one();
        self.add(row);
    }
}

impl AxialKinematics {
    pub(super) fn planar(input: &SolverInput, dof: &DofNumbering) -> Self {
        let mut neighbors = BTreeMap::new();
        let mut unsupported = BTreeSet::new();
        for element in input.elements.values() {
            record_member(
                &mut neighbors,
                &mut unsupported,
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
            for (axis, setting) in settings[..2].iter().enumerate() {
                if setting.spring.is_some_and(|value| value > 0.0) {
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
        Self::from_model(dof, &positions, neighbors, &unsupported, &springs)
    }

    pub(super) fn spatial(input: &SolverInput3D, dof: &DofNumbering) -> Self {
        let mut neighbors = BTreeMap::new();
        let mut unsupported = BTreeSet::new();
        for element in input.elements.values() {
            record_member(
                &mut neighbors,
                &mut unsupported,
                element.node_i,
                element.node_j,
                &element.elem_type,
            );
        }
        for beam in &input.curved_beams {
            unsupported.extend([beam.node_start, beam.node_mid, beam.node_end]);
        }
        for connector in input.connectors.values() {
            unsupported.extend([connector.node_i, connector.node_j]);
        }
        unsupported.extend(input.plates.values().flat_map(|element| element.nodes));
        unsupported.extend(input.quads.values().flat_map(|element| element.nodes));
        unsupported.extend(input.quad9s.values().flat_map(|element| element.nodes));
        unsupported.extend(
            input
                .curved_shells
                .values()
                .flat_map(|element| element.nodes),
        );
        unsupported.extend(
            input
                .solid_shells
                .values()
                .flat_map(|element| element.nodes),
        );

        let mut springs = BTreeSet::new();
        for support in input.supports.values() {
            if support.is_inclined == Some(true) {
                unsupported.insert(support.node_id);
            }
            let settings = super::support::support_dofs_3d(support);
            for (axis, setting) in settings[..3].iter().enumerate() {
                if setting.spring.is_some_and(|value| value > 0.0) {
                    springs.insert((support.node_id, axis));
                }
            }
        }

        let positions = input
            .nodes
            .values()
            .map(|node| (node.id, [node.x, node.y, node.z]))
            .collect();
        Self::from_model(dof, &positions, neighbors, &unsupported, &springs)
    }

    fn from_model<const D: usize>(
        dof: &DofNumbering,
        positions: &BTreeMap<usize, [f64; D]>,
        neighbors: BTreeMap<usize, Vec<usize>>,
        unsupported: &BTreeSet<usize>,
        springs: &BTreeSet<(usize, usize)>,
    ) -> Self {
        let joints = neighbors
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
                Some(AxialJoint {
                    node,
                    dofs: axes.into_iter().map(|(_, index)| index).collect(),
                    strains,
                })
            })
            .collect();
        Self(joints)
    }

    pub(super) fn mechanism_node(
        &self,
        constraints: Option<&FreeConstraintSystem>,
        inactive: &[usize],
        additional_dofs: &[bool],
    ) -> Option<usize> {
        self.0.iter().find_map(|joint| {
            let mut strains = joint.strains.clone();
            for (index, &dof) in joint.dofs.iter().enumerate() {
                if additional_dofs.get(dof) == Some(&true) {
                    strains.hold(index);
                }
            }
            if let Some(system) = constraints {
                joint.restrict_to_constraint_range(system, inactive, &mut strains)?;
            } else {
                for (index, dof) in joint.dofs.iter().enumerate() {
                    if inactive.binary_search(dof).is_ok() {
                        strains.hold(index);
                    }
                }
            }
            strains.has_kernel().then_some(joint.node)
        })
    }
}

impl AxialJoint {
    fn restrict_to_constraint_range(
        &self,
        system: &FreeConstraintSystem,
        inactive: &[usize],
        basis: &mut RowBasis,
    ) -> Option<()> {
        let transform = &system.c_ff;
        let width = self.dofs.len();
        let mut compatibility = BTreeMap::new();
        for (axis, dof) in self.dofs.iter().enumerate() {
            let identity = compatibility
                .entry(*dof)
                .or_insert_with(|| vec![Rational::zero(); width]);
            identity[axis] -= Rational::one();
            if let Ok(col) = system.independent_dofs().binary_search(dof) {
                if inactive.binary_search(&col).is_err() {
                    for p in transform.col_ptr[col]..transform.col_ptr[col + 1] {
                        let row = compatibility
                            .entry(transform.row_idx[p])
                            .or_insert_with(|| vec![Rational::zero(); width]);
                        row[axis] += Rational::from_float(transform.csc_vals[p])?;
                    }
                }
            }
        }
        for row in compatibility.into_values() {
            basis.add(row);
        }
        Some(())
    }
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

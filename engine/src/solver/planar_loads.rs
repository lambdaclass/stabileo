use std::collections::{BTreeMap, HashMap};

use num_rational::BigRational;
use num_traits::{Signed, ToPrimitive, Zero};

use super::assembly::{
    self, FrameLoadGeometry, InclinedTransformData2D, LocalMemberActions2D, PlanarLoadContribution,
    PlanarLoadVisitor,
};
use super::dof::DofNumbering;
use crate::types::*;

mod mechanical;

#[derive(Default)]
struct ExactSum {
    value: BigRational,
    nonfinite: bool,
}

impl ExactSum {
    fn add(&mut self, value: f64) {
        if value != 0.0 {
            match BigRational::from_float(value) {
                Some(value) => self.value += value,
                None => self.nonfinite = true,
            }
        }
    }

    fn add_scaled(&mut self, sum: &Self, coefficient: f64) {
        if coefficient == 0.0 {
            return;
        }
        self.nonfinite |= sum.nonfinite;
        if coefficient == 1.0 {
            self.value += &sum.value;
            return;
        }
        if sum.value.is_zero() && coefficient.is_finite() {
            return;
        }
        match BigRational::from_float(coefficient) {
            Some(coefficient) => self.value += coefficient * &sum.value,
            None => self.nonfinite = true,
        }
    }

    fn is_zero(&self) -> bool {
        !self.nonfinite && self.value.is_zero()
    }

    fn rounded(self) -> f64 {
        if self.nonfinite {
            f64::NAN
        } else {
            self.value.to_f64().unwrap_or(f64::NAN)
        }
    }

    fn projected(row: [f64; 2], components: [Option<&Self>; 2]) -> Self {
        let mut result = Self::default();
        for (coefficient, component) in row.into_iter().zip(components) {
            if let Some(component) = component {
                result.add_scaled(component, coefficient);
            }
        }
        result
    }
}

struct Weight {
    value: f64,
    exact: BigRational,
}

impl Weight {
    fn new(value: f64) -> Self {
        Self {
            value,
            exact: BigRational::from_float(value).unwrap_or_default(),
        }
    }

    fn complement(&self) -> Self {
        Self {
            value: 1.0 - self.value,
            exact: BigRational::from_integer(1.into()) - &self.exact,
        }
    }

    fn term(&self, sum: &ExactSum) -> BigRational {
        &self.exact * &sum.value
    }
}

fn combined<'a>(terms: impl Iterator<Item = (Option<&'a ExactSum>, &'a Weight)>) -> ExactSum {
    let mut sum = ExactSum::default();
    for (term, weight) in terms {
        let Some(term) = term else { continue };
        if weight.value == 0.0 {
            continue;
        }
        sum.nonfinite |= term.nonfinite || !weight.value.is_finite();
        if !term.value.is_zero() {
            sum.value += weight.term(term);
        }
    }
    sum
}

pub(super) fn affine_positions(base: &[f64], target: &[f64], factor: f64) -> Vec<f64> {
    match factor {
        0.0 => base.to_vec(),
        1.0 => target.to_vec(),
        _ => {
            let target_weight = Weight::new(factor);
            let base_weight = target_weight.complement();
            base.iter()
                .zip(target)
                .map(|(&base, &target)| {
                    if base == target {
                        return target;
                    }
                    let mut base_sum = ExactSum::default();
                    base_sum.add(base);
                    let mut target_sum = ExactSum::default();
                    target_sum.add(target);
                    combined(
                        [
                            (Some(&base_sum), &base_weight),
                            (Some(&target_sum), &target_weight),
                        ]
                        .into_iter(),
                    )
                    .rounded()
                })
                .collect()
        }
    }
}

#[derive(Default)]
struct MemberActions {
    dead: [ExactSum; 6],
    thermal: [ExactSum; 6],
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum LoadPosition {
    Transverse(usize, u64, u64),
    Axial(usize, u64, u64),
    Point(usize, u64),
}

fn position_bits(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

fn member_load_components(
    load: &SolverLoad,
    lengths: &HashMap<usize, f64>,
) -> Option<(LoadPosition, [f64; 3])> {
    match load {
        SolverLoad::Distributed(d) => Some((
            LoadPosition::Transverse(
                d.element_id,
                position_bits(d.a.unwrap_or(0.0)),
                position_bits(d.b.unwrap_or(lengths[&d.element_id])),
            ),
            [d.q_i, d.q_j, 0.0],
        )),
        SolverLoad::AxialDistributed(d) => Some((
            LoadPosition::Axial(
                d.element_id,
                position_bits(d.a.unwrap_or(0.0)),
                position_bits(d.b.unwrap_or(lengths[&d.element_id])),
            ),
            [d.q_i, d.q_j, 0.0],
        )),
        SolverLoad::PointOnElement(p) => Some((
            LoadPosition::Point(p.element_id, position_bits(p.a)),
            [p.p, p.px.unwrap_or(0.0), p.my.unwrap_or(0.0)],
        )),
        _ => None,
    }
}

fn set_member_load_components(load: &mut SolverLoad, [first, second, third]: [f64; 3]) {
    match load {
        SolverLoad::Distributed(d) => {
            d.q_i = first;
            d.q_j = second;
        }
        SolverLoad::AxialDistributed(d) => {
            d.q_i = first;
            d.q_j = second;
        }
        SolverLoad::PointOnElement(p) => {
            p.p = first;
            p.px = (second != 0.0 || p.px.is_some()).then_some(second);
            p.my = (third != 0.0 || p.my.is_some()).then_some(third);
        }
        _ => unreachable!(),
    }
}

struct MemberComponents {
    position: LoadPosition,
    load: SolverLoad,
    components: [ExactSum; 3],
}

fn sum_member_components(input: &SolverInput) -> Vec<MemberComponents> {
    let nodes: HashMap<_, _> = input.nodes.values().map(|node| (node.id, node)).collect();
    let lengths = input
        .elements
        .values()
        .filter_map(|element| {
            let i = nodes.get(&element.node_i)?;
            let j = nodes.get(&element.node_j)?;
            let (dx, dz) = (j.x - i.x, j.z - i.z);
            Some((element.id, (dx * dx + dz * dz).sqrt()))
        })
        .collect();
    let mut positions = HashMap::<LoadPosition, usize>::new();
    let mut members = Vec::<MemberComponents>::new();
    for load in &input.loads {
        let Some((position, components)) = member_load_components(load, &lengths) else {
            continue;
        };
        let index = *positions.entry(position).or_insert_with(|| {
            members.push(MemberComponents {
                position,
                load: load.clone(),
                components: Default::default(),
            });
            members.len() - 1
        });
        for (sum, value) in members[index].components.iter_mut().zip(components) {
            sum.add(value);
        }
    }
    members
}

struct PlanarLoadPattern {
    forces: Vec<Option<ExactSum>>,
    actions: BTreeMap<usize, MemberActions>,
    members: Vec<MemberComponents>,
}

impl PlanarLoadPattern {
    fn assemble(
        input: &SolverInput,
        dofs: &DofNumbering,
        transforms: &[InclinedTransformData2D],
    ) -> Self {
        let members = sum_member_components(input);
        let mut loads: Vec<_> = input
            .loads
            .iter()
            .filter(|load| matches!(load, SolverLoad::Nodal(_) | SolverLoad::Thermal(_)))
            .cloned()
            .collect();
        let member_offset = loads.len();
        let active_members: Vec<_> = members
            .iter()
            .filter(|member| {
                member
                    .components
                    .iter()
                    .any(|component| !component.is_zero())
            })
            .collect();
        loads.extend(active_members.iter().map(|member| member.load.clone()));

        let mut forces = Vec::new();
        forces.resize_with(dofs.n_total, || None::<ExactSum>);
        let mut actions: BTreeMap<usize, MemberActions> = BTreeMap::new();
        assembly::visit_load_vector_2d(
            input,
            &loads,
            dofs,
            PlanarLoadVisitor::Local(&mut |contribution| match contribution {
                PlanarLoadContribution::Nodal(i, value) => {
                    if value != 0.0 {
                        forces[i].get_or_insert_with(ExactSum::default).add(value);
                    }
                }
                PlanarLoadContribution::Member(local) => {
                    let actions = actions.entry(local.element_id).or_default();
                    let (sums, local_actions) = match local.actions {
                        LocalMemberActions2D::Mechanical { length, frame } => (
                            &mut actions.dead,
                            mechanical::actions(
                                active_members[local.index - member_offset],
                                length,
                                frame,
                            ),
                        ),
                        LocalMemberActions2D::Thermal(values) => (
                            &mut actions.thermal,
                            values.map(|value| {
                                let mut action = ExactSum::default();
                                action.add(value);
                                action
                            }),
                        ),
                    };
                    for (sum, action) in sums.iter_mut().zip(&local_actions) {
                        sum.add_scaled(action, 1.0);
                    }
                    let [c, s] = local.direction;
                    for offset in [0, 3] {
                        let [axial, transverse, moment] =
                            std::array::from_fn(|i| &local_actions[offset + i]);
                        for (i, row) in [[c, -s], [s, c]].into_iter().enumerate() {
                            if let Some(dof) = local.dofs[offset + i] {
                                let force = forces[dof].get_or_insert_with(ExactSum::default);
                                force.add_scaled(axial, row[0]);
                                force.add_scaled(transverse, row[1]);
                            }
                        }
                        if let Some(dof) = local.dofs[offset + 2] {
                            forces[dof]
                                .get_or_insert_with(ExactSum::default)
                                .add_scaled(moment, 1.0);
                        }
                    }
                }
            }),
        );
        for transform in transforms {
            let components = transform.dofs.map(|i| forces[i].take());
            for (dof, row) in transform.dofs.into_iter().zip(transform.r) {
                let force = ExactSum::projected(row, components.each_ref().map(Option::as_ref));
                forces[dof] = (!force.is_zero()).then_some(force);
            }
        }
        Self {
            forces,
            actions,
            members,
        }
    }
}

pub(super) struct PlanarLoadPath {
    target: PlanarLoadPattern,
    base: Option<PlanarLoadPattern>,
    interpolate_base: bool,
}

impl PlanarLoadPath {
    pub(super) fn increments(
        input: &SolverInput,
        base: Option<&SolverInput>,
        dofs: &DofNumbering,
        transforms: &[InclinedTransformData2D],
    ) -> Self {
        Self::new(input, base, dofs, transforms, true)
    }

    pub(super) fn continuation(
        input: &SolverInput,
        base: Option<&SolverInput>,
        dofs: &DofNumbering,
        transforms: &[InclinedTransformData2D],
    ) -> Self {
        Self::new(input, base, dofs, transforms, false)
    }

    fn new(
        input: &SolverInput,
        base: Option<&SolverInput>,
        dofs: &DofNumbering,
        transforms: &[InclinedTransformData2D],
        interpolate_base: bool,
    ) -> Self {
        Self {
            target: PlanarLoadPattern::assemble(input, dofs, transforms),
            base: base.map(|input| PlanarLoadPattern::assemble(input, dofs, transforms)),
            interpolate_base,
        }
    }

    fn weighted(&self, target: f64, base: f64) -> PlanarLoadState<'_> {
        PlanarLoadState {
            target: (&self.target, Weight::new(target)),
            base: self
                .base
                .as_ref()
                .map(|base_load| (base_load, Weight::new(base))),
        }
    }

    pub(super) fn reference(&self) -> PlanarLoadState<'_> {
        self.weighted(1.0, 0.0)
    }

    pub(super) fn base(&self) -> PlanarLoadState<'_> {
        self.weighted(0.0, 1.0)
    }

    pub(super) fn at(&self, factor: f64) -> PlanarLoadState<'_> {
        if self.interpolate_base {
            let mut state = self.weighted(factor, 1.0 - factor);
            if let Some((_, base)) = &mut state.base {
                *base = state.target.1.complement();
            }
            state
        } else {
            self.weighted(factor, 1.0)
        }
    }
}

pub(super) struct PlanarDisplacements<'a> {
    solver: &'a [f64],
    axes: HashMap<usize, Vec<[[f64; 2]; 2]>>,
}

impl<'a> PlanarDisplacements<'a> {
    pub(super) fn new(solver: &'a [f64], transforms: &[InclinedTransformData2D]) -> Self {
        let mut axes = HashMap::<_, Vec<_>>::new();
        for transform in transforms {
            axes.entry(transform.node_id).or_default().push(transform.r);
        }
        Self { solver, axes }
    }

    fn global_member_motion(
        &self,
        node: usize,
        dofs: &[usize; 2],
        [dx, dz]: [f64; 2],
    ) -> [ExactSum; 2] {
        let mut motion = dofs.map(|dof| {
            let mut sum = ExactSum::default();
            sum.add(self.solver[dof]);
            sum
        });
        let Some((last, earlier)) = self.axes.get(&node).and_then(|axes| axes.split_last()) else {
            return motion;
        };
        let reverse = |axes: [[f64; 2]; 2], motion: &[ExactSum; 2]| {
            let [[a, b], [c, d]] = axes;
            [[a, c], [b, d]].map(|row| ExactSum::projected(row, motion.each_ref().map(Some)))
        };
        for &rotation in earlier {
            motion = reverse(rotation, &motion);
        }

        let length = (dx * dx + dz * dz).sqrt();
        let chord_axes = [[dx, dz], [-dx, -dz], [-dz, dx], [dz, -dx]]
            .map(|[x, z]| [[x, z], [z, -x]])
            .into_iter()
            .find(|axes| axes.map(|row| row.map(|value| value / length)) == *last);
        if let (Some(axes), Some(length)) = (chord_axes, BigRational::from_float(length)) {
            reverse(axes, &motion).map(|mut component| {
                component.value /= &length;
                component
            })
        } else {
            reverse(*last, &motion)
        }
    }

    pub(super) fn member_rotation(
        &self,
        nodes: [&SolverNode; 2],
        dofs: &[[usize; 2]; 2],
    ) -> [f64; 2] {
        let [i, j] = nodes;
        let [dx, dz] = [j.x - i.x, j.z - i.z];
        let mut chord = [dx, dz].map(|component| {
            let mut sum = ExactSum::default();
            sum.add(component);
            sum
        });
        for ((node, dofs), sign) in nodes.into_iter().zip(dofs).zip([-1.0, 1.0]) {
            let global = self.global_member_motion(node.id, dofs, [dx, dz]);
            for (component, displacement) in chord.iter_mut().zip(&global) {
                component.add_scaled(displacement, sign);
            }
        }
        let [parallel, transverse] =
            [[dx, dz], [-dz, dx]].map(|row| ExactSum::projected(row, chord.each_ref().map(Some)));
        let scale = parallel.value.abs().max(transverse.value.abs());
        if parallel.nonfinite || transverse.nonfinite || scale.is_zero() {
            return [f64::NAN; 2];
        }
        let [parallel, transverse] = [parallel, transverse]
            .map(|component| (component.value / &scale).to_f64().unwrap_or(f64::NAN));
        let length = parallel.hypot(transverse);
        [parallel / length, transverse / length]
    }
}

pub(super) struct PlanarLoadState<'a> {
    target: (&'a PlanarLoadPattern, Weight),
    base: Option<(&'a PlanarLoadPattern, Weight)>,
}

impl PlanarLoadState<'_> {
    fn patterns(&self) -> impl Iterator<Item = (&PlanarLoadPattern, &Weight)> {
        std::iter::once((self.target.0, &self.target.1))
            .chain(self.base.iter().map(|(pattern, weight)| (*pattern, weight)))
    }

    pub(super) fn forces(&self) -> Vec<f64> {
        (0..self.target.0.forces.len())
            .map(|i| combined(self.patterns().map(|(p, w)| (p.forces[i].as_ref(), w))).rounded())
            .collect()
    }

    fn exact_actions(&self, id: usize, thermal: bool) -> [ExactSum; 6] {
        std::array::from_fn(|i| {
            combined(self.patterns().map(|(p, w)| {
                let sum = p
                    .actions
                    .get(&id)
                    .map(|a| if thermal { &a.thermal[i] } else { &a.dead[i] });
                (sum, w)
            }))
        })
    }

    pub(super) fn actions(&self, id: usize) -> [f64; 6] {
        self.exact_actions(id, false).map(ExactSum::rounded)
    }

    pub(super) fn frame_actions(&self, id: usize, rotation: impl FnOnce() -> [f64; 2]) -> [f64; 6] {
        let mut dead = self.exact_actions(id, false);
        if [0, 1, 3, 4].into_iter().any(|i| !dead[i].is_zero()) {
            let [c, s] = rotation();
            for offset in [0, 3] {
                let local = [Some(&dead[offset]), Some(&dead[offset + 1])];
                let [axial, shear] = [[c, s], [-s, c]].map(|row| ExactSum::projected(row, local));
                dead[offset] = axial;
                dead[offset + 1] = shear;
            }
        }
        let mut thermal = self.exact_actions(id, true).into_iter();
        dead.map(|mut dead| {
            dead.add_scaled(&thermal.next().unwrap(), 1.0);
            dead.rounded()
        })
    }

    pub(super) fn descriptions(&self) -> Vec<SolverLoad> {
        let mut positions = HashMap::<LoadPosition, usize>::new();
        let mut loads = Vec::<(SolverLoad, [ExactSum; 3])>::new();
        for (pattern, weight) in self.patterns().filter(|(_, weight)| weight.value != 0.0) {
            for member in &pattern.members {
                let entry = *positions.entry(member.position).or_insert_with(|| {
                    loads.push((member.load.clone(), Default::default()));
                    loads.len() - 1
                });
                let (_, sums) = &mut loads[entry];
                for (sum, component) in sums.iter_mut().zip(&member.components) {
                    sum.nonfinite |= component.nonfinite || !weight.value.is_finite();
                    sum.value += weight.term(component);
                }
            }
        }
        loads
            .into_iter()
            .map(|(mut load, sums)| {
                set_member_load_components(&mut load, sums.map(ExactSum::rounded));
                load
            })
            .collect()
    }
}

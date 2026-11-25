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

    fn projected(row: [&BigRational; 2], components: [Option<&Self>; 2]) -> Self {
        let mut result = Self::default();
        for (coefficient, component) in row.into_iter().zip(components) {
            if let Some(component) = component.filter(|_| !coefficient.is_zero()) {
                result.nonfinite |= component.nonfinite;
                result.value += coefficient * &component.value;
            }
        }
        result
    }
}

pub(super) struct MemberActionProjection {
    chord: [BigRational; 2],
    length: BigRational,
}

impl MemberActionProjection {
    fn dot_cross([x, z]: &[BigRational; 2], components: [&ExactSum; 2]) -> [ExactSum; 2] {
        [[x, z], [&-z, x]].map(|row| ExactSum::projected(row, components.map(Some)))
    }

    fn reference_to_global(chord: ReferenceChord) -> Option<Self> {
        let [x, z] = chord.components;
        Some(Self {
            chord: [BigRational::from_float(x)?, BigRational::from_float(-z)?],
            length: BigRational::from_float(chord.length).filter(|length| !length.is_zero())?,
        })
    }

    fn reference_to_current(reference: ReferenceChord, chord: &[ExactSum; 2]) -> Option<Self> {
        let [x, z] = reference.components;
        let reference = [BigRational::from_float(x)?, BigRational::from_float(z)?];
        let [parallel, transverse] = Self::dot_cross(&reference, chord.each_ref());
        if parallel.nonfinite || transverse.nonfinite {
            return None;
        }
        let chord = [parallel.value, transverse.value];
        let scale = chord[0].abs().max(chord[1].abs());
        if scale.is_zero() {
            return None;
        }
        let [x, z] = chord.each_ref().map(|component| component / &scale);
        let square = &x * &x + &z * &z;
        let length = scale * BigRational::from_float(square.to_f64()?.sqrt())?;
        Some(Self { chord, length })
    }

    fn apply(projection: Option<&Self>, components: [&ExactSum; 2]) -> [ExactSum; 2] {
        match projection {
            Some(projection) => Self::dot_cross(&projection.chord, components).map(|mut action| {
                action.value /= &projection.length;
                action
            }),
            None => std::array::from_fn(|_| ExactSum {
                value: BigRational::zero(),
                nonfinite: true,
            }),
        }
    }
}

#[derive(Clone, Copy)]
struct ReferenceChord {
    components: [f64; 2],
    length: f64,
}

impl ReferenceChord {
    fn between(i: &SolverNode, j: &SolverNode) -> Self {
        let (components, length) = assembly::member_chord_2d(i, j);
        Self { components, length }
    }

    fn aligned_support(self, support: [[f64; 2]; 2]) -> Option<[[BigRational; 2]; 2]> {
        let [x, z] = self.components;
        let axes = [[x, z], [-x, -z], [-z, x], [z, -x]]
            .map(|[x, z]| [[x, z], [z, -x]])
            .into_iter()
            .find(|axes| axes.map(|row| row.map(|value| value / self.length)) == support)?;
        let length = BigRational::from_float(self.length).filter(|length| !length.is_zero())?;
        Some(axes.map(|row| row.map(|value| BigRational::from_float(value).unwrap() / &length)))
    }
}

fn reference_chords(input: &SolverInput) -> HashMap<usize, ReferenceChord> {
    let nodes: HashMap<_, _> = crate::ordered::values(&input.nodes)
        .map(|node| (node.id, node))
        .collect();
    crate::ordered::values(&input.elements)
        .filter_map(|element| {
            let i = nodes.get(&element.node_i)?;
            let j = nodes.get(&element.node_j)?;
            Some((element.id, ReferenceChord::between(i, j)))
        })
        .collect()
}

struct PlanarSupportProjection {
    dofs: [usize; 2],
    axes: [[BigRational; 2]; 2],
}

type PlanarSupportProjections = HashMap<usize, Vec<PlanarSupportProjection>>;

fn support_projections(
    input: &SolverInput,
    base: Option<&SolverInput>,
    chords: &HashMap<usize, ReferenceChord>,
    transforms: &[InclinedTransformData2D],
) -> PlanarSupportProjections {
    if transforms.is_empty() {
        return HashMap::new();
    }
    let mut by_node = HashMap::<_, Vec<_>>::new();
    for transform in transforms {
        by_node
            .entry(transform.node_id)
            .or_default()
            .push(transform);
    }
    let has_member_loads = std::iter::once(input)
        .chain(base)
        .flat_map(|input| &input.loads)
        .any(|load| {
            matches!(
                load,
                SolverLoad::Distributed(_)
                    | SolverLoad::AxialDistributed(_)
                    | SolverLoad::PointOnElement(_)
                    | SolverLoad::Thermal(_)
            )
        });
    let mut incident = HashMap::<_, Vec<_>>::new();
    if has_member_loads {
        for element in input.elements.values() {
            if let Some(&chord) = chords.get(&element.id) {
                for node in [element.node_i, element.node_j] {
                    if by_node.contains_key(&node) {
                        incident.entry(node).or_default().push(chord);
                    }
                }
            }
        }
    }

    by_node
        .into_iter()
        .map(|(node, rotations)| {
            let last = rotations.len() - 1;
            let projections = rotations
                .into_iter()
                .enumerate()
                .map(|(index, rotation)| {
                    let mut aligned = incident
                        .get(&node)
                        .into_iter()
                        .flatten()
                        .filter_map(|chord| chord.aligned_support(rotation.r));
                    let axes = if index == last {
                        aligned
                            .next()
                            .filter(|first| aligned.all(|candidate| candidate == *first))
                    } else {
                        None
                    };
                    PlanarSupportProjection {
                        dofs: rotation.dofs,
                        axes: axes.unwrap_or_else(|| {
                            rotation
                                .r
                                .map(|row| row.map(|value| BigRational::from_float(value).unwrap()))
                        }),
                    }
                })
                .collect();
            (node, projections)
        })
        .collect()
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
    chords: &HashMap<usize, ReferenceChord>,
) -> Option<(LoadPosition, [f64; 3])> {
    match load {
        SolverLoad::Distributed(d) => Some((
            LoadPosition::Transverse(
                d.element_id,
                position_bits(d.a.unwrap_or(0.0)),
                position_bits(d.b.unwrap_or(chords[&d.element_id].length)),
            ),
            [d.q_i, d.q_j, 0.0],
        )),
        SolverLoad::AxialDistributed(d) => Some((
            LoadPosition::Axial(
                d.element_id,
                position_bits(d.a.unwrap_or(0.0)),
                position_bits(d.b.unwrap_or(chords[&d.element_id].length)),
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

fn sum_member_components(
    input: &SolverInput,
    chords: &HashMap<usize, ReferenceChord>,
) -> Vec<MemberComponents> {
    let mut positions = HashMap::<LoadPosition, usize>::new();
    let mut members = Vec::<MemberComponents>::new();
    for load in &input.loads {
        let Some((position, components)) = member_load_components(load, chords) else {
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
        chords: &HashMap<usize, ReferenceChord>,
        supports: &PlanarSupportProjections,
    ) -> Self {
        let members = sum_member_components(input, chords);
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
                    let projection =
                        MemberActionProjection::reference_to_global(chords[&local.element_id]);
                    for offset in [0, 3] {
                        let [axial, transverse, moment] =
                            std::array::from_fn(|i| &local_actions[offset + i]);
                        let global =
                            MemberActionProjection::apply(projection.as_ref(), [axial, transverse]);
                        for (i, action) in global.iter().enumerate() {
                            if let Some(dof) = local.dofs[offset + i] {
                                forces[dof]
                                    .get_or_insert_with(ExactSum::default)
                                    .add_scaled(action, 1.0);
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
        for transform in supports.values().flatten() {
            let components = transform.dofs.map(|i| forces[i].take());
            for (dof, row) in transform.dofs.into_iter().zip(&transform.axes) {
                let force =
                    ExactSum::projected(row.each_ref(), components.each_ref().map(Option::as_ref));
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
    supports: PlanarSupportProjections,
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
        let chords = reference_chords(input);
        let supports = support_projections(input, base, &chords, transforms);
        Self {
            target: PlanarLoadPattern::assemble(input, dofs, &chords, &supports),
            base: base.map(|input| {
                PlanarLoadPattern::assemble(input, dofs, &reference_chords(input), &supports)
            }),
            interpolate_base,
            supports,
        }
    }

    fn weighted(&self, target: f64, base: f64) -> PlanarLoadState<'_> {
        PlanarLoadState {
            supports: &self.supports,
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
    supports: &'a PlanarSupportProjections,
}

impl PlanarDisplacements<'_> {
    fn global_member_motion(&self, node: usize, dofs: &[usize; 2]) -> [ExactSum; 2] {
        let mut motion = dofs.map(|dof| {
            let mut sum = ExactSum::default();
            sum.add(self.solver[dof]);
            sum
        });
        if let Some(projections) = self.supports.get(&node) {
            for projection in projections {
                let [[a, b], [c, d]] = &projection.axes;
                motion = [[a, c], [b, d]]
                    .map(|row| ExactSum::projected(row, motion.each_ref().map(Some)));
            }
        }
        motion
    }

    pub(super) fn member_action_projection(
        &self,
        nodes: [&SolverNode; 2],
        dofs: &[[usize; 2]; 2],
    ) -> Option<MemberActionProjection> {
        let [i, j] = nodes;
        let reference = ReferenceChord::between(i, j);
        let mut chord = reference.components.map(|component| {
            let mut sum = ExactSum::default();
            sum.add(component);
            sum
        });
        for ((node, dofs), sign) in nodes.into_iter().zip(dofs).zip([-1.0, 1.0]) {
            let global = self.global_member_motion(node.id, dofs);
            for (component, displacement) in chord.iter_mut().zip(&global) {
                component.add_scaled(displacement, sign);
            }
        }
        MemberActionProjection::reference_to_current(reference, &chord)
    }
}

pub(super) struct PlanarLoadState<'a> {
    supports: &'a PlanarSupportProjections,
    target: (&'a PlanarLoadPattern, Weight),
    base: Option<(&'a PlanarLoadPattern, Weight)>,
}

impl PlanarLoadState<'_> {
    pub(super) fn displacements<'a>(&'a self, solver: &'a [f64]) -> PlanarDisplacements<'a> {
        PlanarDisplacements {
            solver,
            supports: self.supports,
        }
    }

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

    pub(super) fn frame_actions(
        &self,
        id: usize,
        projection: impl FnOnce() -> Option<MemberActionProjection>,
    ) -> [f64; 6] {
        let mut dead = self.exact_actions(id, false);
        if [0, 1, 3, 4].into_iter().any(|i| !dead[i].is_zero()) {
            let projection = projection();
            for offset in [0, 3] {
                let [axial, shear] = MemberActionProjection::apply(
                    projection.as_ref(),
                    [&dead[offset], &dead[offset + 1]],
                );
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

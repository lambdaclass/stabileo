use std::collections::{BTreeMap, HashMap};

use num_rational::BigRational;
use num_traits::{ToPrimitive, Zero};

use super::assembly::{self, InclinedTransformData2D};
use super::dof::DofNumbering;
use crate::types::*;

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

    fn term(&self, sum: &ExactSum) -> BigRational {
        &self.exact * &sum.value
    }
}

fn combined<'a>(terms: impl Iterator<Item = (Option<&'a ExactSum>, &'a Weight)>) -> f64 {
    let mut sum = None;
    for (term, weight) in terms {
        let Some(term) = term else { continue };
        if weight.value == 0.0 {
            continue;
        }
        if term.nonfinite || !weight.value.is_finite() {
            return f64::NAN;
        }
        if !term.value.is_zero() {
            let term = weight.term(term);
            sum = Some(match sum {
                Some(previous) => previous + term,
                None => term,
            });
        }
    }
    sum.map_or(0.0, |sum: BigRational| sum.to_f64().unwrap_or(f64::NAN))
}

#[derive(Default)]
struct MemberActions {
    dead: [ExactSum; 6],
    thermal: [ExactSum; 6],
}

#[derive(PartialEq, Eq, Hash)]
enum LoadPosition {
    Transverse(usize, Option<u64>, Option<u64>),
    Axial(usize, Option<u64>, Option<u64>),
    Point(usize, u64),
}

fn position_bits(value: f64) -> u64 {
    if value == 0.0 {
        0
    } else {
        value.to_bits()
    }
}

fn member_load_components(load: &SolverLoad) -> Option<(LoadPosition, [f64; 3])> {
    match load {
        SolverLoad::Distributed(d) => Some((
            LoadPosition::Transverse(d.element_id, d.a.map(position_bits), d.b.map(position_bits)),
            [d.q_i, d.q_j, 0.0],
        )),
        SolverLoad::AxialDistributed(d) => Some((
            LoadPosition::Axial(d.element_id, d.a.map(position_bits), d.b.map(position_bits)),
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

pub(super) struct PlanarLoadPattern {
    forces: Vec<Option<ExactSum>>,
    actions: BTreeMap<usize, MemberActions>,
    descriptions: Vec<SolverLoad>,
}

impl PlanarLoadPattern {
    pub(super) fn assemble(input: &SolverInput, dofs: &DofNumbering) -> Self {
        let mut forces = Vec::new();
        forces.resize_with(dofs.n_total, || None::<ExactSum>);
        let mut actions: BTreeMap<usize, MemberActions> = BTreeMap::new();
        assembly::visit_load_vector_2d(
            input,
            &input.loads,
            dofs,
            false,
            true,
            &mut |i, value, _| {
                if value != 0.0 {
                    forces[i].get_or_insert_with(ExactSum::default).add(value);
                }
            },
            &mut |id, thermal, values| {
                let actions = actions.entry(id).or_default();
                let sums = if thermal {
                    &mut actions.thermal
                } else {
                    &mut actions.dead
                };
                for (sum, value) in sums.iter_mut().zip(values) {
                    sum.add(value);
                }
            },
        );
        let descriptions = input
            .loads
            .iter()
            .filter(|load| member_load_components(load).is_some())
            .cloned()
            .collect();
        Self {
            forces,
            actions,
            descriptions,
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
    ) -> Self {
        Self::new(input, base, dofs, true)
    }

    pub(super) fn continuation(
        input: &SolverInput,
        base: Option<&SolverInput>,
        dofs: &DofNumbering,
    ) -> Self {
        Self::new(input, base, dofs, false)
    }

    fn new(
        input: &SolverInput,
        base: Option<&SolverInput>,
        dofs: &DofNumbering,
        interpolate_base: bool,
    ) -> Self {
        Self {
            target: PlanarLoadPattern::assemble(input, dofs),
            base: base.map(|input| PlanarLoadPattern::assemble(input, dofs)),
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
                base.exact = BigRational::from_integer(1.into()) - &state.target.1.exact;
            }
            state
        } else {
            self.weighted(factor, 1.0)
        }
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

    pub(super) fn forces(&self, its: &[InclinedTransformData2D]) -> Vec<f64> {
        let mut result: Vec<_> = (0..self.target.0.forces.len())
            .map(|i| combined(self.patterns().map(|(p, w)| (p.forces[i].as_ref(), w))))
            .collect();
        for it in its {
            assembly::rotate_inclined_f_2d(&mut result, &it.dofs, &it.r);
        }
        result
    }

    pub(super) fn actions(&self, id: usize, thermal: bool) -> [f64; 6] {
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

    pub(super) fn descriptions(&self) -> Vec<SolverLoad> {
        let mut positions = HashMap::<LoadPosition, usize>::new();
        let mut loads = Vec::<(SolverLoad, [BigRational; 3])>::new();
        for (pattern, weight) in self.patterns().filter(|(_, weight)| weight.value != 0.0) {
            for load in &pattern.descriptions {
                let (position, components) = member_load_components(load).unwrap();
                let entry = *positions.entry(position).or_insert_with(|| {
                    loads.push((load.clone(), Default::default()));
                    loads.len() - 1
                });
                let (_, sums) = &mut loads[entry];
                for (sum, component) in sums.iter_mut().zip(components) {
                    let mut term = ExactSum::default();
                    term.add(component);
                    *sum += weight.term(&term);
                }
            }
        }
        loads
            .into_iter()
            .map(|(mut load, sums)| {
                let components = sums.map(|value| value.to_f64().unwrap_or(f64::NAN));
                set_member_load_components(&mut load, components);
                load
            })
            .collect()
    }
}

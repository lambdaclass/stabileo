use num_rational::BigRational as Q;
use num_traits::{One, Zero};

use super::{ExactSum, FrameLoadGeometry, LoadPosition, MemberComponents};

fn integer(value: i32) -> Q {
    Q::from_integer(value.into())
}

pub(super) fn actions(
    member: &MemberComponents,
    length: f64,
    frame: Option<FrameLoadGeometry>,
) -> [ExactSum; 6] {
    let evaluated = evaluate(member, length, frame);
    match evaluated {
        Some(actions) => actions.map(|value| ExactSum {
            value,
            nonfinite: false,
        }),
        None => std::array::from_fn(|_| ExactSum {
            value: Q::zero(),
            nonfinite: true,
        }),
    }
}

fn evaluate(
    member: &MemberComponents,
    length: f64,
    frame: Option<FrameLoadGeometry>,
) -> Option<[Q; 6]> {
    if length <= 0.0 || member.components.iter().any(|sum| sum.nonfinite) {
        return None;
    }
    let length = Q::from_float(length)?;
    let frame = match frame {
        Some(geometry) => Some(FrameShapes::new(&length, geometry)?),
        None => None,
    };
    let [first, second, third] = member.components.each_ref().map(|sum| &sum.value);
    let mut axial = [Q::zero(), Q::zero()];
    let mut bending = std::array::from_fn(|_| Q::zero());
    match member.position {
        LoadPosition::Point(_, station) => {
            let station = Q::from_float(f64::from_bits(station))?;
            let xi = &station / &length;
            axial = [second * (Q::one() - &xi), second * &xi];
            if let Some(frame) = &frame {
                if !first.is_zero() {
                    bending = frame.deflection(&xi).map(|shape| first * shape);
                }
                if !third.is_zero() {
                    for (action, shape) in bending.iter_mut().zip(frame.rotation(&xi)) {
                        *action += third * shape;
                    }
                }
            } else {
                let couple = third / &length;
                bending[0] = first * (Q::one() - &xi) - &couple;
                bending[2] = first * &xi + couple;
            }
        }
        LoadPosition::Axial(_, a, b) | LoadPosition::Transverse(_, a, b) => {
            let a = Q::from_float(f64::from_bits(a))?;
            let b = Q::from_float(f64::from_bits(b))?;
            match (member.position, &frame) {
                (LoadPosition::Axial(..), _) => {
                    axial = linear_end_actions(first, second, &a, &b, &length);
                }
                (_, Some(frame)) => {
                    bending = integrate_span(first, second, &a, &b, frame);
                }
                (_, None) => {
                    [bending[0], bending[2]] = linear_end_actions(first, second, &a, &b, &length);
                }
            }
        }
    }
    let [vi, mi, vj, mj] = match frame {
        Some(frame) => frame.release(bending),
        None => bending,
    };
    let [ni, nj] = axial;
    Some([ni, vi, mi, nj, vj, mj])
}

fn linear_end_actions(q_i: &Q, q_j: &Q, a: &Q, b: &Q, length: &Q) -> [Q; 2] {
    let span = b - a;
    let resultant = (q_i + q_j) * &span / integer(2);
    let moment = &resultant * a + (q_i + integer(2) * q_j) * &span * &span / integer(6);
    let at_j = moment / length;
    [resultant - &at_j, at_j]
}

fn integrate_span(q_i: &Q, q_j: &Q, a: &Q, b: &Q, frame: &FrameShapes<'_>) -> [Q; 4] {
    let span = b - a;
    let start = a / frame.length;
    let step = &span / (integer(4) * frame.length);
    let intensity_step = (q_j - q_i) / integer(4);
    let mut xi = start;
    let mut intensity = q_i.clone();
    let mut actions = std::array::from_fn(|_| Q::zero());
    for weight in [7, 32, 12, 32, 7] {
        if !intensity.is_zero() {
            let weighted = &intensity * integer(weight);
            for (action, shape) in actions.iter_mut().zip(frame.deflection(&xi)) {
                *action += &weighted * shape;
            }
        }
        xi += &step;
        intensity += &intensity_step;
    }
    let scale = span / integer(90);
    actions.map(|action| action * &scale)
}

struct FrameShapes<'a> {
    length: &'a Q,
    phi: Q,
    mu: Q,
    geometry: FrameLoadGeometry,
}

impl<'a> FrameShapes<'a> {
    fn new(length: &'a Q, geometry: FrameLoadGeometry) -> Option<Self> {
        let phi = Q::from_float(geometry.phi)?;
        let denominator = Q::one() + &phi;
        if denominator.is_zero()
            || (geometry.hinge_start != geometry.hinge_end && phi == -integer(4))
        {
            return None;
        }
        Some(Self {
            length,
            phi,
            mu: denominator.recip(),
            geometry,
        })
    }

    fn deflection(&self, xi: &Q) -> [Q; 4] {
        let rest = Q::one() - xi;
        let cross = xi * &rest;
        let shear = &self.phi * &cross / integer(2);
        let vi = &rest * &rest * (Q::one() + integer(2) * xi) + &self.phi * &rest;
        let vj = xi * xi * (Q::one() + integer(2) * &rest) + &self.phi * xi;
        let mi = self.length * (&cross * rest + &shear);
        let mj = -self.length * (cross * xi + shear);
        [vi, mi, vj, mj].map(|shape| shape * &self.mu)
    }

    fn rotation(&self, xi: &Q) -> [Q; 4] {
        let rest = Q::one() - xi;
        let vj = integer(6) * xi * &rest / self.length;
        let mi = rest * (Q::one() - integer(3) * xi + &self.phi);
        let mj = xi * (integer(3) * xi - integer(2) + &self.phi);
        [-&vj, mi, vj, mj].map(|shape| shape * &self.mu)
    }

    fn release(&self, [vi, mi, vj, mj]: [Q; 4]) -> [Q; 4] {
        match (self.geometry.hinge_start, self.geometry.hinge_end) {
            (false, false) => [vi, mi, vj, mj],
            (true, true) => {
                let shift = (mi + mj) / self.length;
                [vi - &shift, Q::zero(), vj + shift, Q::zero()]
            }
            (at_start, _) => {
                let released = if at_start { &mi } else { &mj };
                let ratio = released / (integer(4) + &self.phi);
                let shift = integer(6) * &ratio / self.length;
                let moment = (integer(2) - &self.phi) * ratio;
                let [mi, mj] = if at_start {
                    [Q::zero(), mj - moment]
                } else {
                    [mi - moment, Q::zero()]
                };
                [vi - &shift, mi, vj + shift, mj]
            }
        }
    }
}

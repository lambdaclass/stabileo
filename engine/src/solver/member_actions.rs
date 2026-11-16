use crate::types::{SolverLoad, SolverLoad3D};

#[derive(Clone, Copy, Default)]
pub(super) struct TransverseMemberActions(pub [[f64; 2]; 2]);

impl TransverseMemberActions {
    fn span(q_i: f64, q_j: f64, a: f64, b: f64, length: f64) -> [f64; 2] {
        let span = b - a;
        if span.abs() < 1e-15 {
            return [0.0; 2];
        }
        let parts = [
            (q_i * span, (a + b) / 2.0),
            ((q_j - q_i) * span / 2.0, a + 2.0 * span / 3.0),
        ];
        let mut ends = [0.0; 2];
        for (w, xc) in parts {
            ends[0] += w * (length - xc) / length;
            ends[1] += w * xc / length;
        }
        ends
    }

    pub fn from_2d(load: &SolverLoad, length: f64) -> Self {
        let [i, j] = match load {
            SolverLoad::Distributed(l) => Self::span(
                l.q_i,
                l.q_j,
                l.a.unwrap_or(0.0),
                l.b.unwrap_or(length),
                length,
            ),
            SolverLoad::PointOnElement(l) => [
                l.p * (1.0 - l.a / length) - l.my.unwrap_or(0.0) / length,
                l.p * l.a / length + l.my.unwrap_or(0.0) / length,
            ],
            _ => [0.0; 2],
        };
        Self([[i, 0.0], [j, 0.0]])
    }

    pub fn from_3d(load: &SolverLoad3D, length: f64) -> Self {
        match load {
            SolverLoad3D::Distributed(l) => {
                let [yi, yj] = Self::span(
                    l.q_yi,
                    l.q_yj,
                    l.a.unwrap_or(0.0),
                    l.b.unwrap_or(length),
                    length,
                );
                let [zi, zj] = Self::span(
                    l.q_zi,
                    l.q_zj,
                    l.a.unwrap_or(0.0),
                    l.b.unwrap_or(length),
                    length,
                );
                Self([[yi, zi], [yj, zj]])
            }
            SolverLoad3D::PointOnElement(l) => Self([
                [l.py * (1.0 - l.a / length), l.pz * (1.0 - l.a / length)],
                [l.py * (l.a / length), l.pz * (l.a / length)],
            ]),
            _ => Self::default(),
        }
    }

    pub fn add(&mut self, other: Self) {
        for (end, other) in self.0.iter_mut().zip(other.0) {
            for (v, other) in end.iter_mut().zip(other) {
                *v += other;
            }
        }
    }

    pub fn complete_axial_member_forces(self, mut recovered: [[f64; 3]; 2]) -> [[f64; 3]; 2] {
        for (force, load) in recovered.iter_mut().zip(self.0) {
            force[1] -= load[0];
            force[2] -= load[1];
        }
        recovered
    }
}

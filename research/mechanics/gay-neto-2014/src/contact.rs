use crate::hd::{Hd, Scalar};
use crate::rot::{cross, dot, lift, scale, sub, V3};

#[derive(Clone, Copy, Debug)]
pub struct Triangle {
    pub points: [V3<f64>; 3],
}

impl Triangle {
    pub fn normal(&self) -> V3<f64> {
        let n = cross(
            sub(self.points[1], self.points[0]),
            sub(self.points[2], self.points[0]),
        );
        let len = dot(n, n).sqrt();
        scale(n, 1.0 / len)
    }

    /// Whether the projection of `x` on the triangle's plane falls inside it.
    pub fn contains_projection(&self, x: V3<f64>) -> bool {
        let n = self.normal();
        (0..3).all(|i| {
            let a = self.points[i];
            let b = self.points[(i + 1) % 3];
            dot(cross(sub(b, a), sub(x, a)), n) >= -1e-9
        })
    }
}

#[derive(Clone, Debug)]
pub struct NodeToSurface {
    pub nodes: Vec<usize>,
    pub surfaces: Vec<Triangle>,
    pub mu: f64,
    pub epn: f64,
    pub ept: f64,
    pub radius: f64,
}

/// Converged contact state of one node, the analogue of the reference code's `copy_*` data.
#[derive(Clone, Copy, Debug, Default)]
pub struct History {
    pub touching: bool,
    pub tangential_gap: V3<f64>,
    pub position: V3<f64>,
}

pub struct Evaluation {
    pub force: V3<f64>,
    pub jacobian: [[f64; 3]; 3],
    pub next: History,
    pub gap: f64,
}

impl NodeToSurface {
    fn surface_for(&self, x: V3<f64>) -> Option<&Triangle> {
        self.surfaces.iter().find(|t| t.contains_projection(x))
    }

    /// Contact force on the node at `x`, its derivative, and the history it would leave if
    /// this configuration converged. Friction is off on the first increment of a contact,
    /// as in the reference code.
    pub fn evaluate(&self, x: V3<f64>, history: &History) -> Evaluation {
        let mut none = Evaluation {
            force: [0.0; 3],
            jacobian: [[0.0; 3]; 3],
            next: History {
                touching: false,
                tangential_gap: [0.0; 3],
                position: x,
            },
            gap: f64::INFINITY,
        };
        let Some(tri) = self.surface_for(x) else {
            return none;
        };
        let n = lift::<Hd>(tri.normal());
        let xs: V3<Hd> = [Hd::var(x[0], 0), Hd::var(x[1], 1), Hd::var(x[2], 2)];
        let gap = dot(n, crate::rot::sub(xs, lift(tri.points[0]))) + (-self.radius);
        none.gap = gap.val();
        if gap.val() > 0.0 {
            return none;
        }
        let normal_force = gap * -self.epn;
        let mut force = scale(n, normal_force);
        let mut next_gap = [0.0; 3];
        if self.mu > 0.0 && history.touching {
            let moved = crate::rot::sub(xs, lift(history.position));
            let along = crate::rot::sub(moved, scale(n, dot(n, moved)));
            let gt = crate::rot::add(lift(history.tangential_gap), along);
            let norm2 = dot(gt, gt);
            let norm = if norm2.val() > 0.0 {
                norm2.sqrt()
            } else {
                Hd::cst(0.0)
            };
            let trial = norm * self.ept;
            let max = normal_force * self.mu;
            let (tangential, kept) = if trial.val() < max.val() {
                (scale(gt, Hd::cst(-self.ept)), 1.0)
            } else {
                (
                    scale(gt, Hd::cst(0.0) - max / norm),
                    max.val() / trial.val(),
                )
            };
            force = crate::rot::add(force, tangential);
            next_gap = [gt[0].val() * kept, gt[1].val() * kept, gt[2].val() * kept];
        }
        let mut jacobian = [[0.0; 3]; 3];
        for i in 0..3 {
            for j in 0..3 {
                jacobian[i][j] = force[i].g[j];
            }
        }
        Evaluation {
            force: [force[0].val(), force[1].val(), force[2].val()],
            jacobian,
            next: History {
                touching: true,
                tangential_gap: next_gap,
                position: x,
            },
            gap: gap.val(),
        }
    }
}

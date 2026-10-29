use dedaliano_engine::{solver::dof::DofNumbering, types::SolverInput};
use std::ops::{Add, Mul, Sub};

#[derive(Clone, Copy)]
struct Jet([f64; 16]);
impl Jet {
    fn constant(x: f64) -> Self {
        let mut a = [0.; 16];
        a[0] = x;
        Self(a)
    }
    fn compose(self, derivatives: [f64; 5]) -> Self {
        let mut h = self;
        h.0[0] = 0.;
        let mut power = Self::constant(1.);
        let mut result = Self::constant(derivatives[0]);
        let mut factorial = 1.;
        for (i, d) in derivatives.iter().enumerate().skip(1) {
            power = power * h;
            factorial *= i as f64;
            result = result + power * (*d / factorial);
        }
        result
    }
    fn sqrt(self) -> Self {
        let x = self.0[0];
        assert!(x > 0.);
        let r = x.sqrt();
        self.compose([
            r,
            0.5 / r,
            -0.25 / (x * r),
            0.375 / (x * x * r),
            -0.9375 / (x * x * x * r),
        ])
    }
    fn inverse(self) -> Self {
        let x = self.0[0];
        assert!(x != 0.);
        self.compose([
            1. / x,
            -1. / x.powi(2),
            2. / x.powi(3),
            -6. / x.powi(4),
            24. / x.powi(5),
        ])
    }
    fn atan(self) -> Self {
        let x = self.0[0];
        let q = 1. + x * x;
        self.compose([
            x.atan(),
            1. / q,
            -2. * x / q.powi(2),
            (6. * x * x - 2.) / q.powi(3),
            24. * x * (1. - x * x) / q.powi(4),
        ])
    }
}
impl Add for Jet {
    type Output = Self;
    fn add(self, b: Self) -> Self {
        let mut r = self;
        for i in 0..16 {
            r.0[i] += b.0[i];
        }
        r
    }
}
impl Sub for Jet {
    type Output = Self;
    fn sub(self, b: Self) -> Self {
        self + b * (-1.)
    }
}
impl Mul<f64> for Jet {
    type Output = Self;
    fn mul(self, b: f64) -> Self {
        let mut r = self;
        for v in &mut r.0 {
            *v *= b;
        }
        r
    }
}
impl Mul for Jet {
    type Output = Self;
    fn mul(self, b: Self) -> Self {
        let mut r = Self::constant(0.);
        for mask in 0..16 {
            let mut sub = mask;
            loop {
                r.0[mask] += self.0[sub] * b.0[mask ^ sub];
                if sub == 0 {
                    break;
                }
                sub = (sub - 1) & mask;
            }
        }
        r
    }
}

pub fn variation(
    input: &SolverInput,
    dofs: &DofNumbering,
    u: &[f64],
    directions: &[&[f64]],
) -> f64 {
    assert!(directions.len() <= 4 && u.len() == dofs.n_total);
    assert!(directions.iter().all(|d| d.len() == u.len()));
    let variables: Vec<Jet> = u
        .iter()
        .enumerate()
        .map(|(i, &v)| {
            let mut x = Jet::constant(v);
            for (j, d) in directions.iter().enumerate() {
                x.0[1 << j] = d[i];
            }
            x
        })
        .collect();
    let mut sum = Jet::constant(0.);
    let mut elements: Vec<_> = input.elements.values().collect();
    elements.sort_by_key(|e| e.id);
    for e in elements {
        assert!(e.elem_type == "frame" && !e.hinge_start && !e.hinge_end);
        let ni = input.nodes.values().find(|p| p.id == e.node_i).unwrap();
        let nj = input.nodes.values().find(|p| p.id == e.node_j).unwrap();
        let material = input
            .materials
            .values()
            .find(|m| m.id == e.material_id)
            .unwrap();
        let section = input
            .sections
            .values()
            .find(|s| s.id == e.section_id)
            .unwrap();
        assert!(section.as_y.is_none());
        let indices = dofs.element_dofs(e.node_i, e.node_j);
        let d: Vec<_> = indices.iter().map(|&i| variables[i]).collect();
        let (x, z) = (nj.x - ni.x, nj.z - ni.z);
        let length = x.hypot(z);
        let dx = Jet::constant(x) + d[3] - d[0];
        let dz = Jet::constant(z) + d[4] - d[1];
        let l = (dx * dx + dz * dz).sqrt();
        let dot = dx * x + dz * z;
        assert!(
            dot.0[0] > 0.,
            "derivative domain excludes chord rotations of 90 degrees or more"
        );
        let angle = ((dz * x - dx * z) * dot.inverse()).atan();
        let elong = l - Jet::constant(length);
        let a = d[2] - angle;
        let b = d[5] - angle;
        let young = material.e * 1000.;
        sum = sum
            + elong * elong * (young * section.a / (2. * length))
            + (a * a + a * b + b * b) * (2. * young * section.iz / length);
    }
    sum.0[(1 << directions.len()) - 1]
}

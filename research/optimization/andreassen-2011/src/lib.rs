use dedaliano_engine::linalg::{sparse_cholesky_solve_full, CscMatrix};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub nelx: usize,
    pub nely: usize,
    pub volfrac: f64,
    pub penal: f64,
    pub rmin: f64,
    pub ft: u8,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            nelx: 60,
            nely: 20,
            volfrac: 0.5,
            penal: 3.0,
            rmin: 2.4,
            ft: 1,
        }
    }
}

impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.nelx < 2
            || self.nely < 2
            || self.nelx > 120
            || self.nely > 60
            || self.nelx.checked_mul(self.nely).is_none_or(|n| n > 3600)
            || !self.volfrac.is_finite()
            || !(0.05..=0.95).contains(&self.volfrac)
            || !self.penal.is_finite()
            || !(1.0..=5.0).contains(&self.penal)
            || !self.rmin.is_finite()
            || !(1.0..=10.0).contains(&self.rmin)
            || ![1, 2].contains(&self.ft)
        {
            return Err("Invalid configuration: mesh 2..120 × 2..60, at most 3600 cells; volume 0.05..0.95; penal 1..5; radius 1..10; filter 1 or 2".into());
        }
        Ok(())
    }
}

pub fn stiffness() -> [[f64; 8]; 8] {
    let nu = 0.3;
    let a = [
        [12., 3., -6., -3.],
        [3., 12., 3., 0.],
        [-6., 3., 12., -3.],
        [-3., 0., -3., 12.],
    ];
    let b = [
        [-6., -3., 0., 3.],
        [-3., -6., -3., -6.],
        [0., -3., -6., 3.],
        [3., -6., 3., -6.],
    ];
    let c = [
        [-4., 3., -2., 9.],
        [3., -4., -9., 4.],
        [-2., -9., -4., -3.],
        [9., 4., -3., -4.],
    ];
    let d = [
        [2., -3., 4., -9.],
        [-3., 2., 9., -2.],
        [4., 9., 2., 3.],
        [-9., -2., 3., 2.],
    ];
    let mut k = [[0.; 8]; 8];
    for i in 0..8 {
        for j in 0..8 {
            let (p, q) = (i % 4, j % 4);
            let (aa, bb) = if i / 4 == j / 4 {
                (a[p][q], c[p][q])
            } else if i < 4 {
                (b[p][q], d[p][q])
            } else {
                (b[q][p], d[q][p])
            };
            k[i][j] = (aa + nu * bb) / (24. * (1. - nu * nu));
        }
    }
    k
}

pub fn connectivity(c: &Config) -> Vec<[usize; 4]> {
    (0..c.nelx)
        .flat_map(|i| {
            (0..c.nely).map(move |j| {
                let n = i * (c.nely + 1) + j;
                [n + 1, n + c.nely + 2, n + c.nely + 1, n]
            })
        })
        .collect()
}

pub struct Filter {
    pub rows: Vec<Vec<(usize, f64)>>,
    pub sums: Vec<f64>,
}
impl Filter {
    pub fn new(c: &Config) -> Self {
        let mut rows = vec![vec![]; c.nelx * c.nely];
        let radius = c.rmin.ceil() as usize - 1;
        for i in 0..c.nelx {
            for j in 0..c.nely {
                for a in i.saturating_sub(radius)..=(i + radius).min(c.nelx - 1) {
                    for b in j.saturating_sub(radius)..=(j + radius).min(c.nely - 1) {
                        let w =
                            (c.rmin - (i.abs_diff(a) as f64).hypot(j.abs_diff(b) as f64)).max(0.);
                        if w > 0. {
                            rows[i * c.nely + j].push((a * c.nely + b, w));
                        }
                    }
                }
            }
        }
        let sums = rows
            .iter()
            .map(|r| r.iter().map(|(_, w)| w).sum())
            .collect();
        Self { rows, sums }
    }
    pub fn apply(&self, v: &[f64]) -> Vec<f64> {
        self.rows
            .iter()
            .zip(&self.sums)
            .map(|(r, s)| r.iter().map(|&(j, w)| w * v[j]).sum::<f64>() / s)
            .collect()
    }
    pub fn transpose(&self, v: &[f64]) -> Vec<f64> {
        self.rows
            .iter()
            .map(|r| r.iter().map(|&(j, w)| w * v[j] / self.sums[j]).sum())
            .collect()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Iteration {
    pub iteration: usize,
    pub compliance: f64,
    pub volume: f64,
    pub change: f64,
    pub density: Vec<f64>,
}

pub struct Optimizer {
    pub config: Config,
    pub x: Vec<f64>,
    pub physical: Vec<f64>,
    filter: Filter,
    elements: Vec<[usize; 4]>,
    iteration: usize,
    change: f64,
}

impl Optimizer {
    pub fn new(config: Config) -> Result<Self, String> {
        config.validate()?;
        let x = vec![config.volfrac; config.nelx * config.nely];
        Ok(Self {
            filter: Filter::new(&config),
            elements: connectivity(&config),
            config,
            physical: x.clone(),
            x,
            iteration: 0,
            change: 1.,
        })
    }
    pub fn finished(&self) -> bool {
        self.change <= 0.01
    }
    pub fn step(&mut self) -> Result<Iteration, String> {
        if self.finished() {
            return Err("Already converged".into());
        }
        if self.iteration >= 1000 {
            return Err("Iteration limit reached without convergence".into());
        }
        let c = &self.config;
        let nd = 2 * (c.nelx + 1) * (c.nely + 1);
        let mut dofs = vec![usize::MAX; nd];
        let mut nf = 0;
        for (d, id) in dofs.iter_mut().enumerate() {
            if !(d < 2 * (c.nely + 1) && d % 2 == 0 || d == nd - 1) {
                *id = nf;
                nf += 1;
            }
        }
        let ke = stiffness();
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        let mut edofs = Vec::new();
        for (e, nodes) in self.elements.iter().enumerate() {
            let ds: [usize; 8] = std::array::from_fn(|i| 2 * nodes[i / 2] + i % 2);
            let modulus = 1e-9 + self.physical[e].powf(c.penal) * (1. - 1e-9);
            for i in 0..8 {
                for j in 0..8 {
                    let (r, s) = (dofs[ds[i]], dofs[ds[j]]);
                    if r != usize::MAX && s != usize::MAX && r >= s {
                        rows.push(r);
                        cols.push(s);
                        vals.push(modulus * ke[i][j]);
                    }
                }
            }
            edofs.push(ds);
        }
        let matrix = CscMatrix::from_triplets(nf, &rows, &cols, &vals);
        let mut force = vec![0.; nf];
        force[dofs[1]] = -1.;
        let free_u = sparse_cholesky_solve_full(&matrix, &force).ok_or("Cholesky failed")?;
        let u: Vec<f64> = dofs
            .iter()
            .map(|&d| if d == usize::MAX { 0. } else { free_u[d] })
            .collect();
        let mut compliance = 0.;
        let mut dc = vec![0.; self.x.len()];
        for (e, ds) in edofs.iter().enumerate() {
            let mut ce = 0.;
            for i in 0..8 {
                for j in 0..8 {
                    ce += u[ds[i]] * ke[i][j] * u[ds[j]];
                }
            }
            compliance += (1e-9 + self.physical[e].powf(c.penal) * (1. - 1e-9)) * ce;
            dc[e] = -c.penal * (1. - 1e-9) * self.physical[e].powf(c.penal - 1.) * ce;
        }
        let mut dv = vec![1.; dc.len()];
        if c.ft == 1 {
            dc = self.filter.apply(
                &dc.iter()
                    .zip(&self.x)
                    .map(|(d, x)| d * x)
                    .collect::<Vec<_>>(),
            );
            for (d, x) in dc.iter_mut().zip(&self.x) {
                *d /= x.max(1e-3);
            }
        } else {
            dc = self.filter.transpose(&dc);
            dv = self.filter.transpose(&dv);
        }
        let (mut lo, mut hi) = (0., 1e9);
        let mut next = self.x.clone();
        while (hi - lo) / (hi + lo) > 1e-3 {
            let mid = 0.5 * (hi + lo);
            for i in 0..next.len() {
                next[i] = (self.x[i] * (-dc[i] / dv[i] / mid).sqrt())
                    .min(self.x[i] + 0.2)
                    .min(1.)
                    .max(self.x[i] - 0.2)
                    .max(0.);
            }
            self.physical = if c.ft == 1 {
                next.clone()
            } else {
                self.filter.apply(&next)
            };
            if self.physical.iter().sum::<f64>() > c.volfrac * next.len() as f64 {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        self.change = next
            .iter()
            .zip(&self.x)
            .map(|(a, b)| (a - b).abs())
            .fold(0., f64::max);
        self.x = next;
        self.iteration += 1;
        if !compliance.is_finite() || self.physical.iter().any(|v| !v.is_finite()) {
            return Err("Nonfinite solution".into());
        }
        Ok(Iteration {
            iteration: self.iteration,
            compliance,
            volume: self.physical.iter().sum::<f64>() / self.x.len() as f64,
            change: self.change,
            density: self.physical.clone(),
        })
    }
}

use dedaliano_engine::linalg::{
    pcg::pcg_solve,
    preconditioner::{JacobiPreconditioner, Preconditioner},
    CscMatrix,
};
use stabileo_compute::{
    resident::{self, ResidentVectors, ResidualStats},
    ComputeError,
};

// Test-only f64 implementation checks the new resident control flow against the
// production solver independently of WGSL's f32 arithmetic and reduction order.
struct CpuVectors {
    a: CscMatrix,
    pre: JacobiPreconditioner,
    x: Vec<f64>,
    r: Vec<f64>,
    z: Vec<f64>,
    p: Vec<f64>,
    ap: Vec<f64>,
}
impl CpuVectors {
    fn new(a: CscMatrix) -> Self {
        let pre = JacobiPreconditioner::new(&a).unwrap();
        Self {
            a,
            pre,
            x: vec![],
            r: vec![],
            z: vec![],
            p: vec![],
            ap: vec![],
        }
    }
    fn stats(&self) -> ResidualStats {
        ResidualStats {
            norm: self.r.iter().map(|v| v * v).sum::<f64>().sqrt(),
            rz: self.r.iter().zip(&self.z).map(|(r, z)| r * z).sum(),
        }
    }
}
impl ResidentVectors for CpuVectors {
    fn dimension(&self) -> usize {
        self.a.n
    }
    async fn initialize(&mut self, rhs: &[f64]) -> Result<ResidualStats, ComputeError> {
        self.x = vec![0.; self.a.n];
        self.r = rhs.to_vec();
        self.z = vec![0.; self.a.n];
        self.pre.apply(&self.r, &mut self.z);
        self.p = self.z.clone();
        Ok(self.stats())
    }
    async fn curvature(&mut self, beta: Option<f64>) -> Result<f64, ComputeError> {
        if let Some(beta) = beta {
            for (p, z) in self.p.iter_mut().zip(&self.z) {
                *p = z + beta * *p;
            }
        }
        self.ap = self.a.sym_mat_vec(&self.p);
        Ok(self.p.iter().zip(&self.ap).map(|(p, ap)| p * ap).sum())
    }
    async fn update(&mut self, alpha: f64) -> Result<ResidualStats, ComputeError> {
        for ((x, r), (p, ap)) in self
            .x
            .iter_mut()
            .zip(&mut self.r)
            .zip(self.p.iter().zip(&self.ap))
        {
            *x += alpha * p;
            *r -= alpha * ap;
        }
        self.pre.apply(&self.r, &mut self.z);
        Ok(self.stats())
    }
    async fn solution(&mut self) -> Result<Vec<f64>, ComputeError> {
        Ok(self.x.clone())
    }
}

#[test]
fn resident_control_matches_production_arithmetic_iterations_and_refusals() {
    pollster::block_on(async {
        for case in stabileo_compute::fixtures::comparison_cases() {
            let mut vectors = CpuVectors::new(case.matrix());
            for limit in [1, 7, 2000] {
                let expected = pcg_solve(&vectors.a, &case.rhs, &vectors.pre, 1e-6, limit);
                let actual = resident::solve(&mut vectors, &case.rhs, 1e-6, limit)
                    .await
                    .unwrap();
                assert_eq!(actual.x, expected.x);
                assert_eq!(actual.iterations, expected.iterations);
                assert_eq!(actual.converged, expected.converged);
                assert_eq!(
                    actual.final_rel_residual.to_bits(),
                    expected.final_rel_residual.to_bits()
                );
            }
        }
        let a = stabileo_compute::fixtures::grid(2, 1, 0.5);
        let mut vectors = CpuVectors::new(a);
        let r = resident::solve(&mut vectors, &[1., 1.], 1e-6, 100)
            .await
            .unwrap();
        assert!(!r.converged);
        assert_eq!(r.iterations, 0);
    });
}

struct Stalled {
    n: usize,
    steps: usize,
    curvature: f64,
    rz: f64,
}
impl ResidentVectors for Stalled {
    fn dimension(&self) -> usize {
        self.n
    }
    async fn initialize(&mut self, _: &[f64]) -> Result<ResidualStats, ComputeError> {
        Ok(ResidualStats {
            norm: 1.,
            rz: self.rz,
        })
    }
    async fn curvature(&mut self, _: Option<f64>) -> Result<f64, ComputeError> {
        Ok(self.curvature)
    }
    async fn update(&mut self, _: f64) -> Result<ResidualStats, ComputeError> {
        self.steps += 1;
        Ok(ResidualStats {
            norm: (self.n as f64).sqrt(),
            rz: self.rz,
        })
    }
    async fn solution(&mut self) -> Result<Vec<f64>, ComputeError> {
        Ok(vec![0.; self.n])
    }
}

#[test]
fn stagnation_curvature_and_preconditioner_guards_are_preserved() {
    pollster::block_on(async {
        for n in [1, 64, 257] {
            let mut v = Stalled {
                n,
                steps: 0,
                curvature: 1.,
                rz: 1.,
            };
            let r = resident::solve(&mut v, &vec![1.; n], 1e-6, 10000)
                .await
                .unwrap();
            assert!(!r.converged);
            assert_eq!(
                r.iterations,
                50usize.max(8 * (n as f64).sqrt().ceil() as usize)
            );
        }
        for invalid in [0., -1., f64::NAN, f64::INFINITY] {
            for pre in [false, true] {
                let mut v = Stalled {
                    n: 1,
                    steps: 0,
                    curvature: if pre { 1. } else { invalid },
                    rz: if pre { invalid } else { 1. },
                };
                assert!(
                    !resident::solve(&mut v, &[1.], 1e-6, 100)
                        .await
                        .unwrap()
                        .converged
                );
                assert_eq!(v.steps, 0);
            }
        }
    });
}

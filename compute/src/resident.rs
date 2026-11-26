//! Experimental PCG control over resident vectors. Platform implementations own
//! vector arithmetic; this loop retains the engine's stopping and refusal rules.
use crate::ComputeError;
use dedaliano_engine::linalg::pcg::PcgResult;

#[derive(Clone, Copy, Debug)]
pub struct ResidualStats {
    pub norm: f64,
    pub rz: f64,
}

#[allow(async_fn_in_trait)]
pub trait ResidentVectors {
    fn dimension(&self) -> usize;
    async fn initialize(&mut self, rhs: &[f64]) -> Result<ResidualStats, ComputeError>;
    /// Update p = z + beta*p (except at the first step), then compute pᵀAp.
    async fn curvature(&mut self, beta: Option<f64>) -> Result<f64, ComputeError>;
    /// Update x/r/z and return ||r|| and rᵀz.
    async fn update(&mut self, alpha: f64) -> Result<ResidualStats, ComputeError>;
    async fn solution(&mut self) -> Result<Vec<f64>, ComputeError>;
}

/// Returns recursive convergence only. Callers must validate the candidate
/// against the original f64 matrix, as `ResidentPcg::solve` does.
pub async fn solve(
    vectors: &mut impl ResidentVectors,
    rhs: &[f64],
    tolerance: f64,
    max_iterations: usize,
) -> Result<PcgResult, ComputeError> {
    let n = vectors.dimension();
    crate::validate_batch(n, 1, rhs)?;
    if !tolerance.is_finite()
        || tolerance <= 0.
        || tolerance >= 1.
        || max_iterations == 0
        || max_iterations > 100_000
    {
        return Err(ComputeError::InvalidOptions);
    }
    let bnorm = rhs.iter().map(|v| v * v).sum::<f64>().sqrt();
    if !bnorm.is_finite() || (bnorm == 0. && rhs.iter().any(|v| *v != 0.)) {
        return Err(ComputeError::NumericRange);
    }
    if bnorm == 0. {
        return Ok(PcgResult {
            x: vec![0.; n],
            iterations: 0,
            final_rel_residual: 0.,
            converged: true,
        });
    }
    let initial = vectors.initialize(rhs).await?;
    if !initial.norm.is_finite() || initial.norm < 0. {
        return Err(ComputeError::NonFinite);
    }
    let mut rz = initial.rz;
    let mut beta = None;
    let mut iterations = 0;
    let mut final_rel = 1.;
    let mut converged = false;
    let mut best_rel = 1.;
    let mut stall = 0;
    let stall_limit = 50usize.max(8 * (n as f64).sqrt().ceil() as usize);
    if rz.is_finite() && rz > 0. {
        for iter in 0..max_iterations {
            let pap = vectors.curvature(beta).await?;
            if !pap.is_finite() || pap <= 0. {
                break;
            }
            let stats = vectors.update(rz / pap).await?;
            if !stats.norm.is_finite() || stats.norm < 0. {
                return Err(ComputeError::NonFinite);
            }
            iterations = iter + 1;
            final_rel = stats.norm / bnorm;
            if !final_rel.is_finite() {
                return Err(ComputeError::NonFinite);
            }
            if final_rel <= tolerance {
                converged = true;
                break;
            }
            if final_rel < 0.99 * best_rel {
                best_rel = final_rel;
                stall = 0;
            } else {
                stall += 1;
                if stall >= stall_limit {
                    break;
                }
            }
            if !stats.rz.is_finite() || stats.rz <= 0. {
                break;
            }
            beta = Some(stats.rz / rz);
            rz = stats.rz;
        }
    }
    let x = vectors.solution().await?;
    if x.len() != n {
        return Err(ComputeError::InvalidBatch);
    }
    if x.iter().any(|v| !v.is_finite()) {
        return Err(ComputeError::NonFinite);
    }
    Ok(PcgResult {
        x,
        iterations,
        final_rel_residual: final_rel,
        converged,
    })
}

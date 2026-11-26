use dedaliano_engine::linalg::{pcg::PcgResult, preconditioner::Preconditioner, CscMatrix};

pub fn reference_pcg(
    a: &CscMatrix,
    b: &[f64],
    pre: &dyn Preconditioner,
    tol: f64,
    max_iter: usize,
) -> PcgResult {
    let n = a.n;
    assert_eq!(b.len(), n, "rhs length must match matrix dimension");

    let bnorm: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
    if bnorm == 0.0 {
        return PcgResult {
            x: vec![0.0; n],
            iterations: 0,
            final_rel_residual: 0.0,
            converged: true,
        };
    }

    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    let mut z = vec![0.0; n];
    let mut p = vec![0.0; n];

    pre.apply(&r, &mut z);
    let mut rz: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
    if !rz.is_finite() || rz <= 0.0 {
        return PcgResult {
            x,
            iterations: 0,
            final_rel_residual: 1.0,
            converged: false,
        };
    }
    p.copy_from_slice(&z);

    let stall_limit = 50usize.max(8 * (n as f64).sqrt().ceil() as usize);
    const STALL_FACTOR: f64 = 0.99;
    let mut best_rel = 1.0f64; // ||r₀||/‖b‖ = 1
    let mut stall = 0usize;

    let mut iterations = 0;
    let mut final_rel = 1.0;
    let mut converged = false;

    for iter in 0..max_iter {
        let ap = a.sym_mat_vec(&p);
        let pap: f64 = p.iter().zip(ap.iter()).map(|(pi, api)| pi * api).sum();
        if !pap.is_finite() || pap <= 0.0 {
            break;
        }
        let alpha = rz / pap;
        for ((x_i, r_i), (p_i, ap_i)) in x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(ap.iter()))
        {
            *x_i += alpha * p_i;
            *r_i -= alpha * ap_i;
        }
        iterations = iter + 1;

        let rnorm: f64 = r.iter().map(|v| v * v).sum::<f64>().sqrt();
        let rel = rnorm / bnorm;
        final_rel = rel;
        if rel <= tol {
            converged = true;
            break;
        }
        if rel < STALL_FACTOR * best_rel {
            best_rel = rel;
            stall = 0;
        } else {
            stall += 1;
            if stall >= stall_limit {
                break;
            }
        }

        pre.apply(&r, &mut z);
        let rz_new: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
        if !rz_new.is_finite() || rz_new <= 0.0 {
            break;
        }
        let beta = rz_new / rz;
        rz = rz_new;
        for (p_i, z_i) in p.iter_mut().zip(z.iter()) {
            *p_i = z_i + beta * *p_i;
        }
    }

    PcgResult {
        x,
        iterations,
        final_rel_residual: final_rel,
        converged,
    }
}

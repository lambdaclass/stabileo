//! Minimises c·x subject to A x ≤ b with few free variables, by a revised simplex on the dual
//! (k equality rows). The primal solution is the simplex multiplier vector, x = A_B⁻¹ b_B.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LpError {
    Infeasible,
    Unbounded,
    Singular,
    IterationLimit,
    /// Phase 1 met a ray. Its objective, the sum of the artificial variables, is bounded below
    /// by zero, so this only happens through round-off.
    Numerical,
}

fn dense_solve(b: &[f64], v: &[f64], n: usize) -> Option<Vec<f64>> {
    let mut m = b.to_vec();
    let mut z = v.to_vec();
    for col in 0..n {
        let p = (col..n).max_by(|&i, &j| m[i * n + col].abs().total_cmp(&m[j * n + col].abs()))?;
        if m[p * n + col].abs() < 1e-14 {
            return None;
        }
        if p != col {
            for k in 0..n {
                m.swap(col * n + k, p * n + k);
            }
            z.swap(col, p);
        }
        for i in col + 1..n {
            let f = m[i * n + col] / m[col * n + col];
            if f != 0.0 {
                for k in col..n {
                    m[i * n + k] -= f * m[col * n + k];
                }
                z[i] -= f * z[col];
            }
        }
    }
    for i in (0..n).rev() {
        let s: f64 = (i + 1..n).map(|k| m[i * n + k] * z[k]).sum();
        z[i] = (z[i] - s) / m[i * n + i];
    }
    Some(z)
}

struct Dual<'a> {
    k: usize,
    m: usize,
    a: &'a [Vec<f64>],
    sign: Vec<f64>,
}

impl Dual<'_> {
    fn column(&self, i: usize, out: &mut [f64]) {
        if i < self.m {
            out.copy_from_slice(&self.a[i]);
        } else {
            out.fill(0.0);
            out[i - self.m] = self.sign[i - self.m];
        }
    }
    fn basis(&self, basis: &[usize]) -> (Vec<f64>, Vec<f64>) {
        let k = self.k;
        let mut b = vec![0.0; k * k];
        let mut col = vec![0.0; k];
        for (j, &i) in basis.iter().enumerate() {
            self.column(i, &mut col);
            for r in 0..k {
                b[r * k + j] = col[r];
            }
        }
        let mut bt = vec![0.0; k * k];
        for r in 0..k {
            for c in 0..k {
                bt[c * k + r] = b[r * k + c];
            }
        }
        (b, bt)
    }
}

fn simplex(d: &Dual, rhs: &[f64], cost: &dyn Fn(usize) -> f64, allowed: &dyn Fn(usize) -> bool, basis: &mut [usize]) -> Result<bool, LpError> {
    let (k, total) = (d.k, d.m + d.k);
    let mut col = vec![0.0; k];
    let mut degenerate = 0usize;
    let limit = 200 * total + 1000;
    for _ in 0..limit {
        let (b, bt) = d.basis(basis);
        let xb = dense_solve(&b, rhs, k).ok_or(LpError::Singular)?;
        let cb: Vec<f64> = basis.iter().map(|&i| cost(i)).collect();
        let pi = dense_solve(&bt, &cb, k).ok_or(LpError::Singular)?;
        let bland = degenerate > 50;
        let mut entering: Option<(usize, f64)> = None;
        for i in 0..total {
            if !allowed(i) || basis.contains(&i) {
                continue;
            }
            d.column(i, &mut col);
            let scale = 1.0 + col.iter().fold(0.0f64, |s, v| s.max(v.abs()));
            let rc = cost(i) - pi.iter().zip(&col).map(|(p, c)| p * c).sum::<f64>();
            if rc < -1e-11 * scale {
                if bland {
                    entering = Some((i, rc));
                    break;
                }
                if entering.is_none_or(|(_, best)| rc / scale < best) {
                    entering = Some((i, rc / scale));
                }
            }
        }
        let Some((q, _)) = entering else { return Ok(true) };
        d.column(q, &mut col);
        let dir = dense_solve(&b, &col, k).ok_or(LpError::Singular)?;
        let mut leave: Option<(usize, f64, f64)> = None;
        for r in 0..k {
            if dir[r] > 1e-12 {
                let ratio = xb[r].max(0.0) / dir[r];
                let better = match leave {
                    None => true,
                    Some((lr, best, piv)) => {
                        if bland {
                            ratio < best - 1e-15 || (ratio <= best + 1e-15 && basis[r] < basis[lr])
                        } else {
                            ratio < best - 1e-15 || (ratio <= best + 1e-15 && dir[r] > piv)
                        }
                    }
                };
                if better {
                    leave = Some((r, ratio, dir[r]));
                }
            }
        }
        let Some((r, ratio, _)) = leave else { return Ok(false) };
        degenerate = if ratio <= 1e-15 { degenerate + 1 } else { 0 };
        basis[r] = q;
    }
    Err(LpError::IterationLimit)
}

fn phase(d: &Dual, rhs: &[f64], cost: &dyn Fn(usize) -> f64, allowed: &dyn Fn(usize) -> bool, basis: &mut [usize], on_ray: LpError) -> Result<(), LpError> {
    if simplex(d, rhs, cost, allowed, basis)? { Ok(()) } else { Err(on_ray) }
}

pub fn minimise(c: &[f64], a: &[Vec<f64>], b: &[f64]) -> Result<Vec<f64>, LpError> {
    let k = c.len();
    let m = a.len();
    assert!(b.len() == m && a.iter().all(|row| row.len() == k));
    let rhs: Vec<f64> = c.iter().map(|v| -v).collect();
    let sign: Vec<f64> = rhs.iter().map(|v| if *v < 0.0 { -1.0 } else { 1.0 }).collect();
    let d = Dual { k, m, a, sign };
    let mut basis: Vec<usize> = (m..m + k).collect();

    let phase1 = |i: usize| if i >= m { 1.0 } else { 0.0 };
    phase(&d, &rhs, &phase1, &|_| true, &mut basis, LpError::Numerical)?;
    let (bm, _) = d.basis(&basis);
    let xb = dense_solve(&bm, &rhs, k).ok_or(LpError::Singular)?;
    let scale = 1.0 + rhs.iter().fold(0.0f64, |s, v| s.max(v.abs()));
    let infeasibility: f64 = basis.iter().zip(&xb).filter(|(i, _)| **i >= m).map(|(_, x)| x.max(0.0)).sum();
    if infeasibility > 1e-9 * scale {
        return Err(LpError::Unbounded);
    }
    let mut col = vec![0.0; k];
    for r in 0..k {
        if basis[r] < m {
            continue;
        }
        let (_, bt) = d.basis(&basis);
        let mut e = vec![0.0; k];
        e[r] = 1.0;
        let row = dense_solve(&bt, &e, k).ok_or(LpError::Singular)?;
        let mut best: Option<(usize, f64)> = None;
        for i in 0..m {
            if basis.contains(&i) {
                continue;
            }
            d.column(i, &mut col);
            let v = row.iter().zip(&col).map(|(p, c)| p * c).sum::<f64>().abs();
            if v > 1e-9 && best.is_none_or(|(_, bv)| v > bv) {
                best = Some((i, v));
            }
        }
        basis[r] = best.ok_or(LpError::Singular)?.0;
    }

    let phase2 = |i: usize| if i < m { b[i] } else { 0.0 };
    phase(&d, &rhs, &phase2, &|i| i < m, &mut basis, LpError::Infeasible)?;
    let (_, bt) = d.basis(&basis);
    let cb: Vec<f64> = basis.iter().map(|&i| b[i]).collect();
    dense_solve(&bt, &cb, k).ok_or(LpError::Singular)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_triangle() {
        // max x + y  s.t. x ≥ 0, y ≥ 0, x + 2y ≤ 4, 3x + y ≤ 6  → (1.6, 1.2)
        let a = vec![vec![-1.0, 0.0], vec![0.0, -1.0], vec![1.0, 2.0], vec![3.0, 1.0]];
        let x = minimise(&[-1.0, -1.0], &a, &[0.0, 0.0, 4.0, 6.0]).unwrap();
        assert!((x[0] - 1.6).abs() < 1e-12 && (x[1] - 1.2).abs() < 1e-12, "{x:?}");
    }

    #[test]
    fn infeasible_and_unbounded() {
        let a = vec![vec![1.0], vec![-1.0]];
        assert_eq!(minimise(&[1.0], &a, &[-1.0, -1.0]), Err(LpError::Infeasible));
        assert_eq!(minimise(&[-1.0], &[vec![-1.0]], &[0.0]), Err(LpError::Unbounded));
    }

    #[test]
    fn a_ray_in_either_phase_is_reported_and_never_read_as_a_solution() {
        // One equality row y₀ − y₁ = 1 in the dual: column 1 has a negative entry, so the cost
        // −1 on it gives a ray once y₀ is basic.
        let a = vec![vec![1.0], vec![-1.0]];
        let d = Dual { k: 1, m: 2, a: &a, sign: vec![1.0] };
        let rhs = [1.0];
        let ray = |i: usize| if i == 1 { -1.0 } else { 0.0 };
        let mut basis = [0usize];
        assert_eq!(phase(&d, &rhs, &ray, &|i| i < 2, &mut basis, LpError::Numerical), Err(LpError::Numerical));
        let mut basis = [0usize];
        assert_eq!(phase(&d, &rhs, &ray, &|i| i < 2, &mut basis, LpError::Infeasible), Err(LpError::Infeasible));
        let mut basis = [2usize];
        let phase1 = |i: usize| if i >= 2 { 1.0 } else { 0.0 };
        assert_eq!(phase(&d, &rhs, &phase1, &|_| true, &mut basis, LpError::Numerical), Ok(()));
        assert_eq!(basis, [0]);
    }

    #[test]
    fn phase_one_never_meets_a_ray_on_random_problems() {
        let mut seed = 0x2545_f491_4f6c_dd1du64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            (seed >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0
        };
        for _ in 0..2000 {
            let k = 1 + ((next() + 1.0) * 2.0) as usize;
            let m = k + ((next() + 1.0) * 6.0) as usize;
            let a: Vec<Vec<f64>> = (0..m).map(|_| (0..k).map(|_| next()).collect()).collect();
            let b: Vec<f64> = (0..m).map(|_| next()).collect();
            let c: Vec<f64> = (0..k).map(|_| next()).collect();
            assert_ne!(minimise(&c, &a, &b), Err(LpError::Numerical));
        }
    }

    #[test]
    fn a_degenerate_vertex() {
        // min −x − y with many constraints through (1, 1).
        let mut a = vec![vec![-1.0, 0.0], vec![0.0, -1.0]];
        let mut b = vec![0.0, 0.0];
        for i in 1..40 {
            let s = i as f64 / 10.0;
            a.push(vec![s, 1.0]);
            b.push(s + 1.0);
            a.push(vec![1.0, s]);
            b.push(1.0 + s);
        }
        let x = minimise(&[-1.0, -1.0], &a, &b).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-12 && (x[1] - 1.0).abs() < 1e-12, "{x:?}");
    }
}

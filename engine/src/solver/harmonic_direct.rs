use crate::linalg::{amd::amd_order, CscMatrix};
use std::collections::{BTreeMap, BTreeSet};
use super::time_integration::MAX_DENSE_FALLBACK_DOFS;

const STORAGE_BUDGET: usize = 8 * MAX_DENSE_FALLBACK_DOFS * MAX_DENSE_FALLBACK_DOFS;
const ENTRY_BYTES: usize = 256;

type Rows = Vec<BTreeMap<usize, f64>>;

struct System {
    rows: Rows,
    columns: Vec<BTreeSet<usize>>,
    entries: usize,
    limit: usize,
}

impl System {
    fn new(n: usize, budget: usize) -> Result<Self, String> {
        let overhead = n.checked_mul(256).ok_or("Harmonic sparse direct storage overflow")?;
        let limit = budget.checked_sub(overhead).ok_or("Harmonic sparse direct storage budget exceeded")? / ENTRY_BYTES;
        Ok(Self { rows: vec![BTreeMap::new(); n], columns: vec![BTreeSet::new(); n], entries: 0, limit })
    }

    fn set(&mut self, row: usize, col: usize, value: f64) -> Result<(), String> {
        if !value.is_finite() {
            return Err("Harmonic sparse direct solve produced a non-finite matrix entry".into());
        }
        if value == 0.0 {
            if self.rows[row].remove(&col).is_some() {
                self.columns[col].remove(&row);
                self.entries -= 1;
            }
        } else {
            if !self.rows[row].contains_key(&col) {
                if self.entries >= self.limit {
                    return Err("Harmonic sparse direct storage budget exceeded during assembly or elimination".into());
                }
                self.entries += 1;
                self.columns[col].insert(row);
            }
            self.rows[row].insert(col, value);
        }
        Ok(())
    }

    fn add(&mut self, row: usize, col: usize, value: f64) -> Result<(), String> {
        self.set(row, col, self.rows[row].get(&col).copied().unwrap_or(0.0) + value)
    }

    fn solve(mut self, mut rhs: Vec<f64>) -> Result<Vec<f64>, String> {
        let n = rhs.len();
        let mut pivots = Vec::with_capacity(n);
        for col in 0..n {
            let row = self.columns[col].iter().copied()
                .max_by(|&a, &b| self.rows[a][&col].abs().total_cmp(&self.rows[b][&col].abs()))
                .ok_or("Harmonic sparse direct solve: singular dynamic stiffness")?;
            let pivot = self.rows[row][&col];
            if pivot.abs() < 1e-14 {
                return Err("Harmonic sparse direct solve: singular dynamic stiffness".into());
            }
            let upper: Vec<(usize, f64)> = self.rows[row].range((col + 1)..).map(|(&j, &v)| (j, v)).collect();
            for &j in self.rows[row].keys() {
                self.columns[j].remove(&row);
            }
            let affected: Vec<usize> = self.columns[col].iter().copied().collect();
            for i in affected {
                let factor = self.rows[i][&col] / pivot;
                self.set(i, col, 0.0)?;
                for &(j, v) in &upper {
                    self.add(i, j, -factor * v)?;
                }
                rhs[i] -= factor * rhs[row];
            }
            pivots.push(row);
        }
        let mut x = vec![0.0; n];
        for col in (0..n).rev() {
            let row = pivots[col];
            let tail: f64 = self.rows[row].range((col + 1)..).map(|(&j, &v)| v * x[j]).sum();
            x[col] = (rhs[row] - tail) / self.rows[row][&col];
        }
        if x.iter().any(|v| !v.is_finite()) {
            return Err("Harmonic sparse direct solve produced a non-finite response".into());
        }
        Ok(x)
    }
}

pub(super) fn solve(k: &CscMatrix, m: &CscMatrix, f: &[f64], (a0, a1): (f64, f64), omega: f64) -> Result<(Vec<f64>, Vec<f64>), String> {
    let n = k.n;
    if m.n != n || f.len() != n {
        return Err("Harmonic sparse direct dimension mismatch".into());
    }
    let mut system = System::new(2 * n, STORAGE_BUDGET)?;
    let mut scales = vec![1.0_f64; 2 * n];
    if k.nnz().saturating_add(m.nnz()) > system.limit / 8 {
        return Err("Harmonic sparse direct storage budget exceeded before assembly".into());
    }
    let mut kp = k.clone();
    let mut mp = m.clone();
    kp.values.fill(1.0);
    mp.values.fill(1.0);
    let pattern = CscMatrix::linear_combination(1.0, &kp, 1.0, &mp);
    let perm = amd_order(n, &pattern.col_ptr, &pattern.row_idx);
    let mut inverse = vec![0; n];
    for (i, &j) in perm.iter().enumerate() { inverse[j] = i; }
    for (matrix, real, imag) in [(k, 1.0, omega * a1), (m, -omega * omega, omega * a0)] {
        for j in 0..n {
            for p in matrix.col_ptr[j]..matrix.col_ptr[j + 1] {
                let i = matrix.row_idx[p];
                let v = matrix.values[p];
                for (i, j) in [(i, j), (j, i)].into_iter().take(if i == j { 1 } else { 2 }) {
                    let (r, c) = (2 * inverse[i], 2 * inverse[j]);
                    let scale = (real * v).abs().max((imag * v).abs());
                    scales[c] = scales[c].max(scale);
                    scales[c + 1] = scales[c + 1].max(scale);
                    system.add(r, c, real * v)?;
                    system.add(r + 1, c + 1, real * v)?;
                    system.add(r, c + 1, -imag * v)?;
                    system.add(r + 1, c, imag * v)?;
                }
            }
        }
    }
    let mut rhs = vec![0.0; 2 * n];
    for i in 0..n { rhs[2 * inverse[i]] = f[i]; }
    for row in &system.rows {
        for (&col, &value) in row { scales[col] = scales[col].max(value.abs()); }
    }
    for row in &mut system.rows {
        for (&col, value) in row { *value /= scales[col]; }
    }
    let mut x = system.solve(rhs)?;
    for (value, scale) in x.iter_mut().zip(scales) { *value /= scale; }
    let re = (0..n).map(|i| x[2 * inverse[i]]).collect();
    let im = (0..n).map(|i| x[2 * inverse[i] + 1]).collect();
    Ok((re, im))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solver::damping::rayleigh_damping_matrix;
    use crate::solver::harmonic::solve_complex_system;

    fn structural_resonance(sparse: bool) {
        for scale in [1e7_f64, 1e9, 1e12] {
            let k = [2.0 * scale, -scale, -scale, 2.0 * scale];
            let m = [1.0, 0.0, 0.0, 1.0];
            let f = [1.0, 1.0];
            let omega = scale.sqrt();
            let result = if sparse {
                solve(&CscMatrix::from_dense_symmetric(&k, 2), &CscMatrix::from_dense_symmetric(&m, 2), &f, (0.0, 0.0), omega)
            } else {
                solve_complex_system(&k, &m, &[0.0; 4], &f, 2, omega)
            };
            assert!(result.is_err(), "scale={scale:e}, sparse={sparse}: {result:?}");
            let scalar = if sparse {
                solve(&CscMatrix::from_triplets(1, &[0], &[0], &[scale]), &CscMatrix::from_triplets(1, &[0], &[0], &[1.0]), &[1.0], (0.0, 0.0), omega)
            } else {
                solve_complex_system(&[scale], &[1.0], &[0.0], &[1.0], 1, omega)
            };
            assert!(scalar.is_err(), "scalar scale={scale:e}, sparse={sparse}: {scalar:?}");
        }
    }

    #[test]
    fn dense_structural_scale_undamped_resonance_is_refused() {
        structural_resonance(false);
    }

    #[test]
    fn sparse_structural_scale_undamped_resonance_is_refused() {
        structural_resonance(true);
    }

    #[test]
    fn structural_scale_damped_near_resonance_matches_closed_form() {
        for scale in [1e7_f64, 1e9, 1e12] {
            let k = [2.0 * scale, -scale, -scale, 2.0 * scale];
            let m = [1.0, 0.0, 0.0, 1.0];
            let f = [1.0, 1.0];
            let omega = scale.sqrt() * (1.0 + 1e-6);
            let damping = (0.2, 0.0);
            let c = rayleigh_damping_matrix(&m, &k, 2, damping.0, damping.1);
            let real = scale - omega * omega;
            let imag = omega * damping.0;
            let denom = real * real + imag * imag;
            let expected = (real / denom, -imag / denom);
            for (re, im) in [
                solve_complex_system(&k, &m, &c, &f, 2, omega).unwrap(),
                solve(&CscMatrix::from_dense_symmetric(&k, 2), &CscMatrix::from_dense_symmetric(&m, 2), &f, damping, omega).unwrap(),
            ] {
                for i in 0..2 {
                    assert!((re[i] - expected.0).hypot(im[i] - expected.1) <= 1e-10 * expected.0.hypot(expected.1), "scale={scale:e}: {re:?} {im:?} vs {expected:?}");
                }
            }
        }
    }

    fn coupled_static_closed_form(sparse: bool) {
        let scale = 1e7;
        let k = [scale + 1.0, scale, scale, scale + 1.0];
        let m = [1.0, 0.0, 0.0, 1.0];
        let expected = [(scale + 1.0) / (2.0 * scale + 1.0), -scale / (2.0 * scale + 1.0)];
        let (re, im) = if sparse {
            solve(&CscMatrix::from_dense_symmetric(&k, 2), &CscMatrix::from_dense_symmetric(&m, 2), &[1.0, 0.0], (0.0, 0.0), 0.0).unwrap()
        } else {
            solve_complex_system(&k, &m, &[0.0; 4], &[1.0, 0.0], 2, 0.0).unwrap()
        };
        for i in 0..2 {
            assert!((re[i] - expected[i]).hypot(im[i]) <= 1e-10 * expected[i].abs(), "sparse={sparse}: {re:?} {im:?} vs {expected:?}");
        }
    }

    #[test]
    #[ignore = "known wrong result: #1539"]
    fn dense_coupled_static_response_matches_closed_form() {
        coupled_static_closed_form(false);
    }

    #[test]
    #[ignore = "known wrong result: #1539"]
    fn sparse_coupled_static_response_matches_closed_form() {
        coupled_static_closed_form(true);
    }

    #[test]
    fn sparse_full_system_matches_dense_with_coupling_pivoting_and_resonance() {
        let k = [2.0, -1.0, 0.0, -1.0, 2.0, -1.0, 0.0, -1.0, 2.0];
        let m = [2.0, 0.1, 0.0, 0.1, 1.0, 0.2, 0.0, 0.2, 3.0];
        let f = [1.0, -0.3, 0.7];
        let ks = CscMatrix::from_dense_symmetric(&k, 3);
        let ms = CscMatrix::from_dense_symmetric(&m, 3);
        for damping in [(0.0, 0.0), (0.05, 0.01)] {
            let c = rayleigh_damping_matrix(&m, &k, 3, damping.0, damping.1);
            for w in [0.0, 0.5, 1.0, 2.0, 100.0] {
                let (er, ei) = solve_complex_system(&k, &m, &c, &f, 3, w).unwrap();
                let (re, im) = solve(&ks, &ms, &f, damping, w).unwrap();
                for i in 0..3 {
                    assert!((re[i] - er[i]).hypot(im[i] - ei[i]) <= 1e-12 * er[i].hypot(ei[i]), "w={w}, dof={i}");
                }
            }
        }
    }

    #[test]
    fn sparse_full_system_refuses_dimension_mismatches() {
        let one = CscMatrix::from_triplets(1, &[0], &[0], &[1.0]);
        let two = CscMatrix::from_triplets(2, &[0, 1], &[0, 1], &[1.0, 1.0]);
        for (m, f) in [(&two, vec![1.0]), (&one, vec![]), (&one, vec![1.0, 2.0])] {
            assert_eq!(solve(&one, m, &f, (0.0, 0.0), 1.0).unwrap_err(), "Harmonic sparse direct dimension mismatch");
        }
    }

    #[test]
    fn sparse_full_system_refuses_singular_nonfinite_and_over_budget_systems() {
        let k = CscMatrix::from_triplets(1, &[0], &[0], &[4.0]);
        let m = CscMatrix::from_triplets(1, &[0], &[0], &[1.0]);
        assert!(solve(&k, &m, &[1.0], (0.0, 0.0), 2.0).is_err());
        assert!(solve(&k, &m, &[f64::NAN], (0.0, 0.0), 1.0).is_err());
        assert!(solve(&k, &m, &[1.0], (f64::INFINITY, 0.0), 1.0).is_err());
        assert!(System::new(1, 0).is_err());
        let mut a = System::new(2, 2 * 256 + ENTRY_BYTES).unwrap();
        a.set(0, 0, 1.0).unwrap();
        assert!(a.set(1, 1, 1.0).is_err());
        a.set(0, 0, 0.0).unwrap();
        a.set(1, 1, 1.0).unwrap();
    }
}

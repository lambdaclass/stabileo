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

    fn factor(&mut self) -> Result<Vec<usize>, String> {
        let n = self.rows.len();
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
                self.set(i, col, factor)?;
                self.columns[col].remove(&i);
            }
            pivots.push(row);
        }
        Ok(pivots)
    }

    fn apply(&self, pivots: &[usize], rhs: &[f64]) -> Result<Vec<f64>, String> {
        let n = pivots.len();
        let mut y = rhs.to_vec();
        for col in 0..n {
            let row = pivots[col];
            for (&j, &factor) in self.rows[row].range(..col) { y[row] -= factor * y[pivots[j]]; }
        }
        let mut x = vec![0.0; n];
        for col in (0..n).rev() {
            let row = pivots[col];
            let tail: f64 = self.rows[row].range((col + 1)..).map(|(&j, &v)| v * x[j]).sum();
            x[col] = (y[row] - tail) / self.rows[row][&col];
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
    dynamic_entries(k, m, (a0, a1), omega, |i, j, real, imag, scale| {
        for (i, j) in [(i, j), (j, i)].into_iter().take(if i == j { 1 } else { 2 }) {
            let (r, c) = (2 * inverse[i], 2 * inverse[j]);
            scales[c] = scales[c].max(scale);
            scales[c + 1] = scales[c + 1].max(scale);
            system.add(r, c, real)?;
            system.add(r + 1, c + 1, real)?;
            system.add(r, c + 1, -imag)?;
            system.add(r + 1, c, imag)?;
        }
        Ok(())
    })?;
    let mut rhs = vec![0.0; 2 * n];
    for i in 0..n { rhs[2 * inverse[i]] = f[i]; }
    for row in &system.rows {
        for (&col, &value) in row { scales[col] = scales[col].max(value.abs()); }
    }
    for scale in &mut scales { *scale = column_scale(*scale)?; }
    for row in &mut system.rows {
        for (&col, value) in row { *value /= scales[col]; }
    }
    let pivots = system.factor()?;
    let mut x = system.apply(&pivots, &rhs)?;
    for (value, scale) in x.iter_mut().zip(&scales) { *value /= scale; }
    for _ in 0..2 {
        let mut residual: Vec<Residual> = rhs.iter().copied().map(Residual::new).collect();
        dynamic_entries(k, m, (a0, a1), omega, |i, j, real, imag, _| {
            for (i, j) in [(i, j), (j, i)].into_iter().take(if i == j { 1 } else { 2 }) {
                let (r, c) = (2 * inverse[i], 2 * inverse[j]);
                residual[r].subtract(real, x[c]);
                residual[r].subtract(-imag, x[c + 1]);
                residual[r + 1].subtract(imag, x[c]);
                residual[r + 1].subtract(real, x[c + 1]);
            }
            Ok(())
        })?;
        let residual: Vec<f64> = residual.into_iter().map(Residual::value).collect();
        let correction = system.apply(&pivots, &residual)?;
        for i in 0..2 * n { x[i] += correction[i] / scales[i]; }
    }
    if x.iter().any(|v| !v.is_finite()) {
        return Err("Harmonic sparse direct solve produced a non-finite response".into());
    }
    let re = (0..n).map(|i| x[2 * inverse[i]]).collect();
    let im = (0..n).map(|i| x[2 * inverse[i] + 1]).collect();
    Ok((re, im))
}

fn dynamic_entries(k: &CscMatrix, m: &CscMatrix, (a0, a1): (f64, f64), omega: f64, mut visit: impl FnMut(usize, usize, f64, f64, f64) -> Result<(), String>) -> Result<(), String> {
    for j in 0..k.n {
        let (mut kp, mut mp) = (k.col_ptr[j], m.col_ptr[j]);
        let (ke, me) = (k.col_ptr[j + 1], m.col_ptr[j + 1]);
        while kp < ke || mp < me {
            let i = k.row_idx.get(kp).filter(|_| kp < ke).copied().unwrap_or(usize::MAX)
                .min(m.row_idx.get(mp).filter(|_| mp < me).copied().unwrap_or(usize::MAX));
            let kv = if kp < ke && k.row_idx[kp] == i { let v = k.values[kp]; kp += 1; v } else { 0.0 };
            let mv = if mp < me && m.row_idx[mp] == i { let v = m.values[mp]; mp += 1; v } else { 0.0 };
            let inertia = omega * omega * mv;
            let (kc, mc) = (omega * a1 * kv, omega * a0 * mv);
            visit(i, j, kv - inertia, kc + mc, kv.abs().max(inertia.abs()).max(kc.abs()).max(mc.abs()))?;
        }
    }
    Ok(())
}

pub(super) fn column_scale(value: f64) -> Result<f64, String> {
    let fraction = (1_u64 << 52) - 1;
    let bits = value.to_bits();
    let scale = if bits & fraction == 0 { value } else { f64::from_bits((bits & !fraction) + (1_u64 << 52)) };
    if !value.is_finite() || !scale.is_finite() {
        return Err("Harmonic direct column scale is non-finite".into());
    }
    Ok(scale)
}

pub(super) struct Residual {
    sum: f64,
    correction: f64,
}

impl Residual {
    pub(super) fn new(rhs: f64) -> Self { Self { sum: rhs, correction: 0.0 } }

    pub(super) fn subtract(&mut self, a: f64, x: f64) {
        let product = -a * x;
        let next = self.sum + product;
        self.correction += if self.sum.abs() >= product.abs() { (self.sum - next) + product } else { (product - next) + self.sum };
        self.correction += (-a).mul_add(x, -product);
        self.sum = next;
    }

    pub(super) fn value(self) -> f64 { self.sum + self.correction }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solver::damping::rayleigh_damping_matrix;
    use crate::solver::harmonic::solve_complex_system;

    fn singular_arrowhead(sparse: bool) {
        let count = 1024;
        let n = count + 1;
        let t = 1.0 - 383.0 / (1_u64 << 26) as f64;
        let mut k = vec![0.0; n * n];
        let mut m = vec![0.0; n * n];
        let mut f = vec![0.0; n];
        for i in 0..count {
            k[i * n + i] = 2.0;
            k[i * n + count] = -t;
            k[count * n + i] = -t;
        }
        k[count * n + count] = 1.0 + count as f64 * t * t;
        for i in 0..n { m[i * n + i] = 1.0; }
        f[count] = 1.0;
        assert_eq!(k[count * n + count] - 1.0, count as f64 * t * t);
        let result = if sparse {
            solve(&CscMatrix::from_dense_symmetric(&k, n), &CscMatrix::from_dense_symmetric(&m, n), &f, (0.0, 0.0), 1.0)
        } else {
            solve_complex_system(&k, &m, &vec![0.0; n * n], &f, n, 1.0)
        };
        assert!(result.is_err(), "singular inconsistent system returned a response: sparse={sparse}, last={:?}", result.as_ref().map(|(re, im)| (re[count], im[count])));
    }

    #[test]
    #[ignore = "known wrong result: #1922"]
    fn dense_singular_arrowhead_with_roundoff_pivot_is_refused() {
        singular_arrowhead(false);
    }

    #[test]
    #[ignore = "known wrong result: #1922"]
    fn sparse_singular_arrowhead_with_roundoff_pivot_is_refused() {
        singular_arrowhead(true);
    }

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
    fn dense_coupled_static_response_matches_closed_form() {
        coupled_static_closed_form(false);
    }

    #[test]
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

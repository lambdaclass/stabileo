use super::constraints::{FreeConstraintSystem, SparseTransform};
use crate::certify::exact::{q, Q};
use crate::linalg::{cholesky_decompose, CscMatrix, EigenResult};
use num_traits::{Signed, ToPrimitive, Zero};
use std::collections::{BTreeMap, BTreeSet};

type Row = BTreeMap<usize, Q>;

struct MassiveBlock {
    factor: Vec<f64>,
    rows: Vec<Row>,
}

#[derive(Default)]
pub(super) struct MassAssembly {
    blocks: Vec<MassiveBlock>,
    invalid: bool,
}

impl MassAssembly {
    pub(super) fn add(&mut self, mass: &[f64], transform: Option<&[f64]>, dofs: &[usize]) {
        if self.add_block(mass, transform, dofs).is_none() {
            self.invalid = true;
        }
    }

    fn add_block(&mut self, mass: &[f64], transform: Option<&[f64]>, dofs: &[usize]) -> Option<()> {
        let n = dofs.len();
        let active: Vec<_> = (0..n)
            .filter(|&i| (0..n).any(|j| mass[i * n + j] != 0.0))
            .collect();
        let r = active.len();
        if r == 0 {
            return Some(());
        }
        let scales: Vec<_> = active.iter().map(|&i| mass[i * n + i].sqrt()).collect();
        if scales.iter().any(|s| !s.is_finite() || *s <= 0.0) {
            return None;
        }
        let mut factor = vec![0.0; r * r];
        for (i, &a) in active.iter().enumerate() {
            for (j, &b) in active.iter().enumerate() {
                factor[i * r + j] = (mass[a * n + b] / scales[i]) / scales[j];
            }
        }
        if !cholesky_decompose(&mut factor, r) {
            return None;
        }
        for i in 0..r {
            for j in 0..=i {
                factor[i * r + j] *= scales[i];
            }
        }
        let mut rows = Vec::with_capacity(r);
        for &i in &active {
            let mut row = Row::new();
            for (j, &d) in dofs.iter().enumerate() {
                let value = transform.map_or(if i == j { 1.0 } else { 0.0 }, |t| t[i * n + j]);
                if value != 0.0 {
                    *row.entry(d).or_default() += q(value)?;
                }
            }
            row.retain(|_, v| !v.is_zero());
            rows.push(row);
        }
        self.blocks.push(MassiveBlock { factor, rows });
        Some(())
    }

    pub(super) fn add_curved_shell(
        &mut self,
        coords: &[[f64; 3]; 4],
        dirs: &[[f64; 3]; 4],
        rho: f64,
        h: f64,
        dofs: &[usize],
    ) {
        let build = || -> Option<Vec<MassiveBlock>> {
            let mut blocks = Vec::new();
            for (shape, dv) in crate::element::curved_shell::mass_quadrature(coords, dirs, h) {
                let mut rows = vec![Row::new(); 6];
                for i in 0..4 {
                    for a in 0..3 {
                        rows[a].insert(dofs[i * 6 + a], q(shape[i])?);
                    }
                    let d = dirs[i];
                    let cross = [[0.0, d[2], -d[1]], [-d[2], 0.0, d[0]], [d[1], -d[0], 0.0]];
                    for a in 0..3 {
                        for b in 0..3 {
                            if cross[a][b] != 0.0 {
                                rows[3 + a]
                                    .insert(dofs[i * 6 + 3 + b], q(shape[i])? * q(cross[a][b])?);
                            }
                        }
                    }
                }
                let mut factor = vec![0.0; 36];
                let translation = (rho * dv).sqrt();
                let rotation = ((rho * h * h / 12.0) * dv).sqrt();
                if [translation, rotation]
                    .iter()
                    .any(|v| !v.is_finite() || *v <= 0.0)
                {
                    return None;
                }
                for i in 0..6 {
                    factor[i * 6 + i] = if i < 3 { translation } else { rotation };
                }
                blocks.push(MassiveBlock { factor, rows });
            }
            Some(blocks)
        };
        if let Some(blocks) = build() {
            self.blocks.extend(blocks);
        } else {
            self.invalid = true;
        }
    }

    pub(super) fn finish<const D: usize>(
        mut self,
        nf: usize,
        rotations: impl Iterator<Item = ([usize; D], [[f64; D]; D])>,
        constraints: Option<&FreeConstraintSystem>,
    ) -> Result<MassRange, String> {
        let build = || -> Option<MassRange> {
            if self.invalid {
                return None;
            }
            for (dofs, rotation) in rotations {
                for block in &mut self.blocks {
                    for row in &mut block.rows {
                        let old: Vec<_> = dofs
                            .iter()
                            .map(|d| row.remove(d).unwrap_or_default())
                            .collect();
                        for i in 0..D {
                            let mut value = Q::zero();
                            for j in 0..D {
                                value += &old[j] * q(rotation[i][j])?;
                            }
                            if !value.is_zero() {
                                row.insert(dofs[i], value);
                            }
                        }
                    }
                }
            }
            let n = constraints.map_or(nf, |c| c.n_free_indep);
            let mut range = BTreeMap::<usize, Row>::new();
            let mut columns = BTreeMap::<usize, BTreeSet<usize>>::new();
            let mut weighted = Vec::new();
            for block in &mut self.blocks {
                for row in &mut block.rows {
                    row.retain(|&d, _| d < nf);
                    if let Some(cs) = constraints {
                        let mut reduced = Row::new();
                        for (&i, v) in row.iter() {
                            for p in cs.c_ff.row_ptr[i]..cs.c_ff.row_ptr[i + 1] {
                                *reduced.entry(cs.c_ff.col_idx[p]).or_default() +=
                                    v * q(cs.c_ff.vals[p])?;
                            }
                        }
                        reduced.retain(|_, v| !v.is_zero());
                        *row = reduced;
                    }
                    let mut residual = row.clone();
                    let existing_pivots: Vec<_> = residual
                        .keys()
                        .copied()
                        .filter(|p| range.contains_key(p))
                        .collect();
                    for pivot in existing_pivots {
                        let existing = &range[&pivot];
                        if let Some(value) = residual.remove(&pivot) {
                            for (&j, v) in existing {
                                if j != pivot {
                                    *residual.entry(j).or_default() -= &value * v;
                                }
                            }
                            residual.retain(|_, v| !v.is_zero());
                        }
                    }
                    if let Some((&pivot, value)) =
                        residual.iter().max_by(|a, b| a.1.abs().cmp(&b.1.abs()))
                    {
                        let value = value.clone();
                        for v in residual.values_mut() {
                            *v /= &value;
                        }
                        for previous_pivot in columns.remove(&pivot).unwrap_or_default() {
                            let previous = range.get_mut(&previous_pivot)?;
                            for j in previous.keys() {
                                if let Some(uses) = columns.get_mut(j) {
                                    uses.remove(&previous_pivot);
                                }
                            }
                            if let Some(value) = previous.remove(&pivot) {
                                for (&j, v) in &residual {
                                    if j != pivot {
                                        *previous.entry(j).or_default() -= &value * v;
                                    }
                                }
                                previous.retain(|_, v| !v.is_zero());
                            }
                            for &j in previous.keys() {
                                columns.entry(j).or_default().insert(previous_pivot);
                            }
                        }
                        for &j in residual.keys() {
                            columns.entry(j).or_default().insert(pivot);
                        }
                        range.insert(pivot, residual);
                    }
                }
                let r = block.rows.len();
                for k in 0..r {
                    let mut row = BTreeMap::<usize, f64>::new();
                    for i in k..r {
                        for (&j, v) in &block.rows[i] {
                            *row.entry(j).or_default() += block.factor[i * r + k] * v.to_f64()?;
                        }
                    }
                    if row.values().any(|v| !v.is_finite()) {
                        return None;
                    }
                    weighted.push(
                        row.into_iter()
                            .filter(|(_, v)| *v != 0.0)
                            .collect::<Vec<_>>(),
                    );
                }
            }
            let rank = range.len();
            if rank == 0 {
                return None;
            }
            let mut rows: Vec<Vec<(usize, f64)>> = (0..n).map(|i| vec![(i, 1.0)]).collect();
            for (&pivot, row) in &range {
                for (&j, v) in row {
                    if j == pivot {
                        continue;
                    }
                    let value = -v.to_f64()?;
                    if !value.is_finite() {
                        return None;
                    }
                    rows[pivot].push((j, value));
                }
            }
            for row in &mut rows {
                row.sort_by_key(|&(j, _)| j);
            }
            let transform = SparseTransform::from_rows(n, n, rows);
            let weight_rows = weighted
                .into_iter()
                .map(|row| {
                    row.into_iter()
                        .filter(|(j, _)| range.contains_key(j))
                        .collect()
                })
                .collect::<Vec<_>>();
            let weights = SparseTransform::from_rows(weight_rows.len(), n, weight_rows);
            Some(MassRange {
                rank,
                pivots: range.keys().copied().collect(),
                transform,
                weights,
            })
        };
        build().ok_or_else(|| "REFUSE: physical_mass_range: cannot establish the physical massive rows and their rank".into())
    }
}

pub(super) struct MassRange {
    rank: usize,
    pivots: Vec<usize>,
    transform: SparseTransform,
    weights: SparseTransform,
}

impl MassRange {
    fn mass_on_range(&self) -> CscMatrix {
        let indices: Vec<_> = (0..self.weights.n_rows).collect();
        let identity =
            CscMatrix::from_triplets(indices.len(), &indices, &indices, &vec![1.0; indices.len()]);
        self.weights.reduce_sparse(&identity)
    }

    fn condensed(&self, stiffness: &CscMatrix) -> Option<CondensedMassRange> {
        use crate::linalg::sparse_chol::{
            numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky,
        };
        let n = self.transform.n_rows;
        let r = self.rank;
        let stiffness = self.transform.reduce_sparse(stiffness);
        let null: Vec<_> = (0..n)
            .filter(|i| self.pivots.binary_search(i).is_err())
            .collect();
        let massless = stiffness.extract_principal_submatrix(&null);
        let symbolic = std::rc::Rc::new(symbolic_cholesky(&massless));
        let factor = numeric_cholesky(&symbolic, &massless)?;
        let mut rows: Vec<Vec<(usize, f64)>> = vec![Vec::new(); n];
        let (mut ki, mut kj, mut kv) = (Vec::new(), Vec::new(), Vec::new());
        for (col, &pivot) in self.pivots.iter().enumerate() {
            rows[pivot].push((col, 1.0));
            let mut unit = vec![0.0; n];
            unit[pivot] = 1.0;
            let product = stiffness.sym_mat_vec(&unit);
            let rhs: Vec<_> = null.iter().map(|&i| -product[i]).collect();
            let solution = sparse_cholesky_solve(&factor, &rhs);
            if solution.iter().any(|x| !x.is_finite()) {
                return None;
            }
            for (&i, &x) in null.iter().zip(&solution) {
                unit[i] = x;
                if x != 0.0 {
                    rows[i].push((col, x));
                }
            }
            let product = stiffness.sym_mat_vec(&unit);
            for (row, &i) in self.pivots.iter().enumerate().skip(col) {
                if product[i] != 0.0 {
                    ki.push(row);
                    kj.push(col);
                    kv.push(product[i]);
                }
            }
        }
        let recovery = SparseTransform::from_rows(n, r, rows);
        let stiffness = CscMatrix::from_triplets(r, &ki, &kj, &kv);
        let mass = self
            .mass_on_range()
            .extract_principal_submatrix(&self.pivots);
        Some(CondensedMassRange {
            stiffness,
            mass,
            recovery,
        })
    }

    fn recover(&self, condensed: &CondensedMassRange, result: EigenResult) -> Option<EigenResult> {
        if result.values.len() > self.rank {
            return None;
        }
        let count = result.values.len();
        let n = self.transform.n_rows;
        let mut vectors = vec![0.0; n * count];
        for j in 0..count {
            let column: Vec<_> = (0..self.rank)
                .map(|i| result.vectors[i * count + j])
                .collect();
            let column = self.transform.mul_vec(&condensed.recovery.mul_vec(&column));
            for i in 0..n {
                vectors[i * count + j] = column[i];
            }
        }
        Some(EigenResult {
            values: result.values,
            vectors,
        })
    }

    pub(super) fn solve_dense(
        &self,
        stiffness: &[f64],
        mass: &[f64],
        count: usize,
    ) -> Option<EigenResult> {
        let n = self.transform.n_rows;
        if self.rank == self.transform.n_rows {
            let result =
                crate::linalg::lanczos::lanczos_generalized_eigen(stiffness, mass, n, count, 0.0)?;
            return (result.values.len() == count.min(self.rank)).then_some(result);
        }
        self.solve_sparse(
            &CscMatrix::from_dense_symmetric(stiffness, n),
            &CscMatrix::from_dense_symmetric(mass, n),
            count,
            &mut |_| {},
        )
    }

    pub(super) fn solve_sparse(
        &self,
        stiffness: &CscMatrix,
        mass: &CscMatrix,
        count: usize,
        observe: &mut dyn FnMut(Option<&crate::linalg::sparse_chol::NumericCholesky>),
    ) -> Option<EigenResult> {
        if self.rank == self.transform.n_rows {
            let result = crate::linalg::lanczos::lanczos_generalized_eigen_sparse_observed(
                stiffness, mass, count, 0.0, observe,
            )?;
            return (result.values.len() == count.min(self.rank)).then_some(result);
        }
        {
            use crate::linalg::sparse_chol::{numeric_cholesky, symbolic_cholesky};
            let symbolic = std::rc::Rc::new(symbolic_cholesky(stiffness));
            let factor = numeric_cholesky(&symbolic, stiffness);
            observe(factor.as_ref());
        }
        let condensed = self.condensed(stiffness)?;
        let result = crate::linalg::lanczos::lanczos_generalized_eigen_sparse_observed(
            &condensed.stiffness,
            &condensed.mass,
            count.min(self.rank),
            0.0,
            &mut |_| {},
        )?;
        if result.values.len() != count.min(self.rank) {
            return None;
        }
        self.recover(&condensed, result)
    }
}

struct CondensedMassRange {
    stiffness: CscMatrix,
    mass: CscMatrix,
    recovery: SparseTransform,
}

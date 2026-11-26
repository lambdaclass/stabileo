use super::constraints::{FreeConstraintSystem, SparseTransform};
use super::load_work::{add_up, gamma, mul_up};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Default)]
struct EntryScale {
    magnitude: f64,
    input_operations: usize,
    terms: usize,
}

impl EntryScale {
    fn accumulate(&mut self, magnitude: f64, input_operations: usize) {
        if magnitude != 0.0 {
            self.magnitude = add_up(self.magnitude, magnitude);
            self.input_operations = self.input_operations.max(input_operations);
            self.terms += 1;
        }
    }

    fn operations(self) -> usize {
        self.input_operations + self.terms.saturating_sub(1)
    }
}

#[derive(Default)]
pub(super) struct StiffnessRoundoff(BTreeMap<(usize, usize), EntryScale>);

impl StiffnessRoundoff {
    pub(super) fn record(&mut self, row: usize, col: usize, value: f64) {
        if value != 0.0 {
            self.0.entry((row, col)).or_default().accumulate(value.abs(), 8);
        }
    }

    pub(super) fn record_symmetric(&mut self, rows: &[usize], cols: &[usize], values: &[f64]) {
        for ((&row, &col), &value) in rows.iter().zip(cols).zip(values) {
            self.record(row, col, value);
            if row != col {
                self.record(col, row, value);
            }
        }
    }

    pub(super) fn rotate<const N: usize>(&mut self, dofs: [usize; N], rotation: &[[f64; N]; N]) {
        let columns = |d: usize| {
            let index = dofs.iter().position(|&index| index == d);
            std::iter::once((d, 1.0)).filter(move |_| index.is_none()).chain(
                dofs.into_iter().zip(rotation).filter_map(move |(target, row)| {
                    index.map(|i| (target, row[i]))
                }),
            )
        };
        let mut rotated = Self::default();
        self.0.retain(|&(row, col), entry| {
            if !dofs.contains(&row) && !dofs.contains(&col) {
                return true;
            }
            rotated.project_entry(row, col, *entry, &columns);
            false
        });
        self.0.append(&mut rotated.0);
    }

    pub(super) fn finish(
        mut self, free: usize, constraints: Option<&FreeConstraintSystem>,
    ) -> Option<SolveStiffnessRoundoff> {
        self.0.retain(|&(row, col), _| row < free && col < free);
        if let Some(constraints) = constraints {
            self.reduce(&constraints.c_ff);
        }
        let mut bounds = BTreeMap::new();
        for (position, entry) in self.0 {
            let bound = mul_up(gamma(entry.operations()), entry.magnitude);
            if !bound.is_finite() {
                return None;
            }
            bounds.insert(position, bound);
        }
        Some(SolveStiffnessRoundoff(bounds))
    }

    fn reduce(&mut self, transform: &SparseTransform) {
        let columns = |row: usize| {
            let range = transform.row_ptr[row]..transform.row_ptr[row + 1];
            let indices = &transform.col_idx[range.clone()];
            let values = &transform.vals[range];
            indices.iter().copied().zip(values.iter().copied())
        };
        let assembled = std::mem::take(&mut self.0);
        for ((row, col), entry) in assembled {
            self.project_entry(row, col, entry, &columns);
        }
    }

    fn project_entry<I: Iterator<Item = (usize, f64)>>(
        &mut self,
        row: usize,
        col: usize,
        entry: EntryScale,
        columns: &impl Fn(usize) -> I,
    ) {
        for (target_row, a) in columns(row).filter(|(_, value)| *value != 0.0) {
            for (target_col, b) in columns(col).filter(|(_, value)| *value != 0.0) {
                let magnitude = mul_up(mul_up(a.abs(), entry.magnitude), b.abs());
                let products = usize::from(a.abs() != 1.0) + usize::from(b.abs() != 1.0);
                self.0.entry((target_row, target_col)).or_default()
                    .accumulate(magnitude, entry.operations() + products);
            }
        }
    }
}

pub(super) struct SolveStiffnessRoundoff(BTreeMap<(usize, usize), f64>);

impl SolveStiffnessRoundoff {
    pub(super) fn error(&self, row: usize, col: usize) -> f64 {
        self.0.get(&(row, col)).copied().unwrap_or(0.0)
    }

    pub(super) fn entries(&self) -> impl Iterator<Item = ((usize, usize), f64)> + '_ {
        self.0.iter().map(|(&position, &bound)| (position, bound))
    }
}

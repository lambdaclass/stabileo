use super::{CscMatrix, Triplet};

#[derive(Default)]
pub(crate) struct TripletAssemblyCache {
    plan: Option<AssemblyPlan>,
}

struct AssemblyPlan {
    n: usize,
    rows: Vec<usize>,
    cols: Vec<usize>,
    sources: Vec<usize>,
    ends: Vec<usize>,
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
}

const MAX_PLAN_BYTES: usize = 8 * 1024 * 1024;

fn plan_fits(n: usize, entries: usize) -> bool {
    entries.checked_mul(5)
        .and_then(|v| n.checked_add(1).and_then(|columns| v.checked_add(columns)))
        .and_then(|v| v.checked_mul(std::mem::size_of::<usize>()))
        .is_some_and(|bytes| bytes <= MAX_PLAN_BYTES)
}

impl TripletAssemblyCache {
    pub(crate) fn assemble(&mut self, n: usize, rows: &[usize], cols: &[usize], vals: &[f64]) -> CscMatrix {
        assert_eq!(rows.len(), cols.len());
        assert_eq!(rows.len(), vals.len());
        if !plan_fits(n, rows.len()) {
            self.plan = None;
            return CscMatrix::from_triplets(n, rows, cols, vals);
        }
        if self.plan.as_ref().is_none_or(|p| p.n != n || p.rows != rows || p.cols != cols) {
            self.plan = Some(AssemblyPlan::new(n, rows, cols));
        }
        self.plan.as_ref().unwrap().assemble(vals)
    }
}

impl AssemblyPlan {
    fn new(n: usize, rows: &[usize], cols: &[usize]) -> Self {
        let mut triplets: Vec<_> = rows.iter().zip(cols).enumerate().map(|(i, (&r, &c))| {
            // Preserve the original Triplet layout and sort; its payload carries source-index bits.
            Triplet { row: r.max(c), col: r.min(c), val: f64::from_bits(i as u64) }
        }).collect();
        super::sort_triplets(&mut triplets);
        let mut col_ptr = vec![0; n + 1];
        let mut row_idx = Vec::with_capacity(triplets.len());
        let mut sources = Vec::with_capacity(triplets.len());
        let mut ends = Vec::with_capacity(triplets.len());
        let mut i = 0;
        while i < triplets.len() {
            let (row, col) = (triplets[i].row, triplets[i].col);
            loop {
                sources.push(triplets[i].val.to_bits() as usize);
                i += 1;
                if i == triplets.len() || triplets[i].row != row || triplets[i].col != col { break; }
            }
            row_idx.push(row);
            ends.push(i);
            col_ptr[col + 1] += 1;
        }
        for j in 0..n { col_ptr[j + 1] += col_ptr[j]; }
        Self { n, rows: rows.to_vec(), cols: cols.to_vec(), sources, ends, col_ptr, row_idx }
    }

    fn assemble(&self, vals: &[f64]) -> CscMatrix {
        let mut values = Vec::with_capacity(self.ends.len());
        let mut start = 0;
        for &end in &self.ends {
            let mut value = vals[self.sources[start]];
            for &source in &self.sources[start + 1..end] { value += vals[source]; }
            values.push(value);
            start = end;
        }
        CscMatrix { n: self.n, col_ptr: self.col_ptr.clone(), row_idx: self.row_idx.clone(), values }
    }
}

#[cfg(test)]
mod tests;

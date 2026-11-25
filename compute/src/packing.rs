use crate::{validate_matrix, ComputeError};
use dedaliano_engine::linalg::CscMatrix;

pub(crate) struct PackedMatrix {
    pub offsets: Vec<u32>,
    pub columns: Vec<u32>,
    pub values: Vec<f32>,
    pub row_norm: f64,
}

pub(crate) fn checked_f32(value: f64) -> Result<f32, ComputeError> {
    if !value.is_finite() {
        return Err(ComputeError::NonFinite);
    }
    let narrow = value as f32;
    if !narrow.is_finite() || (value != 0.0 && !narrow.is_normal()) {
        return Err(ComputeError::NumericRange);
    }
    Ok(narrow)
}

impl PackedMatrix {
    /// Repack CSR in stripes of 32 rows without reordering entries within a row.
    /// Padding is never evaluated. Keep CSR if padding or device limits would
    /// make the alternative unsuitable; failure leaves the matrix untouched.
    #[cfg(any(feature = "metal", feature = "webgpu", test))]
    pub fn interleave_rows(&mut self, max_bytes: u64, binding_bytes: u64) -> bool {
        let n = self.offsets.len() - 1;
        let stripes = n.div_ceil(32);
        let offset_bytes = (self.offsets.len() as u64 + stripes as u64 + 1) * 4;
        if offset_bytes > binding_bytes || offset_bytes > max_bytes {
            return false;
        }
        let mut starts = Vec::with_capacity(stripes + 1);
        let mut padded = 0u64;
        starts.push(0u32);
        for first in (0..n).step_by(32) {
            let width = (first..(first + 32).min(n))
                .map(|r| self.offsets[r + 1] - self.offsets[r])
                .max()
                .unwrap_or(0);
            padded += u64::from(width) * 32;
            if padded > u64::from(u32::MAX)
                || padded > self.values.len() as u64 * 5 / 4
                || padded.max(1) * 4 > binding_bytes
                || offset_bytes + padded.max(1) * 8 > max_bytes
            {
                return false;
            }
            starts.push(padded as u32);
        }
        let mut columns = vec![0; padded as usize];
        let mut values = vec![0.; padded as usize];
        for row in 0..n {
            let base = starts[row / 32] as usize + row % 32;
            for (i, k) in (self.offsets[row]..self.offsets[row + 1]).enumerate() {
                columns[base + i * 32] = self.columns[k as usize];
                values[base + i * 32] = self.values[k as usize];
            }
        }
        self.offsets.extend(starts);
        self.columns = columns;
        self.values = values;
        true
    }

    pub fn new(matrix: &CscMatrix, max_entries: usize) -> Result<Self, ComputeError> {
        validate_matrix(matrix)?;
        let n = matrix.n;
        if n >= u32::MAX as usize {
            return Err(ComputeError::ResourceLimit);
        }
        let mut counts = vec![0usize; n];
        let mut total = 0usize;
        for col in 0..n {
            for k in matrix.col_ptr[col]..matrix.col_ptr[col + 1] {
                let row = matrix.row_idx[k];
                let copies = if row == col { 1 } else { 2 };
                total = total
                    .checked_add(copies)
                    .ok_or(ComputeError::ResourceLimit)?;
                if total > max_entries || total > u32::MAX as usize {
                    return Err(ComputeError::ResourceLimit);
                }
                counts[row] += 1;
                if row != col {
                    counts[col] += 1;
                }
            }
        }
        let mut offsets = Vec::with_capacity(n + 1);
        offsets.push(0u32);
        for count in counts {
            offsets.push(offsets.last().unwrap() + count as u32);
        }
        let mut cursor = offsets[..n].to_vec();
        let mut columns = vec![0u32; total];
        let mut values = vec![0f32; total];
        let mut norms = vec![0.0f64; n];
        for col in 0..n {
            for k in matrix.col_ptr[col]..matrix.col_ptr[col + 1] {
                let row = matrix.row_idx[k];
                let value = checked_f32(matrix.values[k])?;
                let mut insert = |r: usize, c: usize| {
                    let slot = cursor[r] as usize;
                    columns[slot] = c as u32;
                    values[slot] = value;
                    norms[r] += f64::from(value).abs();
                    cursor[r] += 1;
                };
                insert(row, col);
                if row != col {
                    insert(col, row);
                }
            }
        }
        Ok(Self {
            offsets,
            columns,
            values,
            row_norm: norms.into_iter().fold(0.0, f64::max),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stripes_preserve_each_row_including_value_bits_and_entry_order() {
        for n in [31, 32, 255, 256, 257] {
            let mut rows = vec![];
            let mut cols = vec![];
            let mut values = vec![];
            for i in 0..n {
                // An empty row, unequal row lengths and signed zero exercise
                // stripe padding without adding its entries to the operator.
                if i == 7 {
                    continue;
                }
                rows.push(i);
                cols.push(i);
                values.push(if i == 3 { -0. } else { 4. });
                if i + 1 < n && i + 1 != 7 {
                    rows.push(i + 1);
                    cols.push(i);
                    values.push(-0.125);
                }
            }
            let a = CscMatrix::from_triplets(n, &rows, &cols, &values);
            let before = PackedMatrix::new(&a, usize::MAX).unwrap();
            let mut after = PackedMatrix::new(&a, usize::MAX).unwrap();
            assert!(after.interleave_rows(u64::MAX, u64::MAX));
            assert_eq!(&after.offsets[..n + 1], &before.offsets);
            assert_eq!(after.row_norm.to_bits(), before.row_norm.to_bits());
            for row in 0..n {
                let actual: Vec<_> = (0..before.offsets[row + 1] - before.offsets[row])
                    .map(|i| {
                        let k =
                            after.offsets[n + 1 + row / 32] as usize + row % 32 + i as usize * 32;
                        (after.columns[k], after.values[k].to_bits())
                    })
                    .collect();
                let expected: Vec<_> = (before.offsets[row]..before.offsets[row + 1])
                    .map(|k| {
                        (
                            before.columns[k as usize],
                            before.values[k as usize].to_bits(),
                        )
                    })
                    .collect();
                assert_eq!(actual, expected);
            }
        }
    }

    #[test]
    fn stripes_fall_back_without_mutation_on_padding_or_memory_limits() {
        for n in [1, 33, 64] {
            let a = crate::fixtures::grid(n, 1, 4.);
            // n=1/33 have excessive padding; n=64 fits but exceeds each
            // tested budget. In all cases the original CSR remains usable.
            for (budget, binding) in [(0, u64::MAX), (u64::MAX, 0), (1500, 10000), (10000, 500)] {
                let mut p = PackedMatrix::new(&a, usize::MAX).unwrap();
                let offsets = p.offsets.clone();
                let columns = p.columns.clone();
                let values = p.values.clone();
                assert!(!p.interleave_rows(budget, binding));
                assert_eq!(p.offsets, offsets);
                assert_eq!(p.columns, columns);
                assert_eq!(p.values, values);
            }
        }
        // A dense first row among short rows must not cause a large allocation.
        let a = CscMatrix::from_triplets(
            64,
            &(0..64).collect::<Vec<_>>(),
            &vec![0; 64],
            &vec![1.; 64],
        );
        let mut p = PackedMatrix::new(&a, usize::MAX).unwrap();
        assert!(!p.interleave_rows(u64::MAX, u64::MAX));
    }

    #[test]
    fn conversion_preserves_the_symmetric_operator_and_empty_rows() {
        let matrix = CscMatrix {
            n: 4,
            col_ptr: vec![0, 2, 3, 3, 3],
            row_idx: vec![0, 2, 1],
            values: vec![4., -2., 3.],
        };
        let p = PackedMatrix::new(&matrix, 4).unwrap();
        let x = [2., 3., 4., 5.];
        let actual: Vec<f64> = (0..4)
            .map(|r| {
                (p.offsets[r]..p.offsets[r + 1])
                    .map(|k| f64::from(p.values[k as usize]) * x[p.columns[k as usize] as usize])
                    .sum()
            })
            .collect();
        assert_eq!(actual, matrix.sym_mat_vec(&x));
        assert_eq!(p.row_norm, 6.);
        assert!(matches!(
            PackedMatrix::new(&matrix, 3),
            Err(ComputeError::ResourceLimit)
        ));
    }
    #[test]
    fn conversion_refuses_overflow_underflow_and_subnormals() {
        for x in [f64::MAX, 1e-300, f32::MIN_POSITIVE as f64 / 2.] {
            assert_eq!(checked_f32(x), Err(ComputeError::NumericRange));
        }
        for x in [f64::NAN, f64::INFINITY] {
            assert_eq!(checked_f32(x), Err(ComputeError::NonFinite));
        }
        assert_eq!(checked_f32(-0.).unwrap().to_bits(), (-0.0f32).to_bits());
        assert_eq!(checked_f32(1.25).unwrap(), 1.25);
    }
}

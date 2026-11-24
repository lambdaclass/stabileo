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

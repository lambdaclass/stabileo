use super::*;

fn reference(local: &[f64], transform: &[f64], n: usize) -> Vec<f64> {
    let temp = mat_mul(local, transform, n);
    let mut result = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let mut sum = 0.0;
            for k in 0..n {
                sum += transform[k * n + i] * temp[k * n + j];
            }
            result[i * n + j] = sum;
        }
    }
    result
}

fn check(local: &[f64], transform: &[f64], n: usize) {
    let expected = reference(local, transform, n);
    let actual = transform_stiffness(local, transform, n);
    assert_eq!(actual.len(), expected.len());
    for (i, (actual, expected)) in actual.iter().zip(&expected).enumerate() {
        assert_eq!(actual.to_bits(), expected.to_bits(), "n={n}, entry={i}");
    }
}

#[test]
fn transformations_preserve_bits_and_nonfinite_propagation() {
    let mut state = 17u64;
    for n in [0, 1, 2, 6, 11, 12, 14, 18, 24, 54] {
        for scale in [-0.0, 0.0, 1e-300, 1e-100, 1.0, 1e100, 1e300, f64::MAX, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
            for _ in 0..8 {
                let mut matrix = || (0..n*n).map(|_| {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    match state % 5 {
                        0 => 0.0,
                        1 => -0.0,
                        _ => (state % 2001) as f64 / 1000.0 - 1.0,
                    }
                }).collect::<Vec<_>>();
                let local: Vec<_> = matrix().into_iter().map(|v| v * scale).collect();
                let transform = matrix();
                check(&local, &transform, n);
            }
        }
    }
}

#[test]
fn transformations_preserve_block_rotations_and_overflow() {
    for n in [6, 12, 18, 24, 54] {
        for angle in [0.0_f64, 0.3, std::f64::consts::FRAC_PI_2, -1.2] {
            let (s, c) = angle.sin_cos();
            let mut transform = vec![0.0; n*n];
            for block in (0..n).step_by(3) {
                transform[block*n+block] = c;
                transform[block*n+block+1] = -s;
                transform[(block+1)*n+block] = s;
                transform[(block+1)*n+block+1] = c;
                transform[(block+2)*n+block+2] = 1.0;
            }
            let mut local = vec![0.0; n*n];
            for i in 0..n { local[i*n+i] = 2.0; }
            check(&local, &transform, n);
            for exceptional in [f64::MAX, f64::INFINITY, f64::NEG_INFINITY, f64::NAN, f64::from_bits(1), -0.0] {
                local[n+1] = exceptional;
                check(&local, &transform, n);
            }
        }
    }
}

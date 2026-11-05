pub fn nullspace(rows: &[Vec<f64>], n: usize) -> Vec<Vec<f64>> {
    let mut a = vec![vec![0.0; n]; n];
    for r in rows {
        for i in 0..n {
            for j in 0..n {
                a[i][j] += r[i] * r[j];
            }
        }
    }
    let mut v: Vec<Vec<f64>> = (0..n).map(|i| (0..n).map(|j| if i == j { 1.0 } else { 0.0 }).collect()).collect();
    for _ in 0..100 {
        let off: f64 = (0..n).flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j))).map(|(i, j)| a[i][j] * a[i][j]).sum();
        if off < 1e-300 {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                if a[p][q] == 0.0 {
                    continue;
                }
                let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (akp, akq) = (a[k][p], a[k][q]);
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for k in 0..n {
                    let (apk, aqk) = (a[p][k], a[q][k]);
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for k in 0..n {
                    let (vkp, vkq) = (v[k][p], v[k][q]);
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let scale = (0..n).map(|i| a[i][i].abs()).fold(0.0, f64::max).max(1.0);
    (0..n).filter(|&i| a[i][i].abs() <= 1e-12 * scale).map(|i| (0..n).map(|k| v[k][i]).collect()).collect()
}

#[test]
fn nullspace_of_concurrent_rollers_is_the_rotation_about_their_point() {
    let rows = vec![vec![0.0, 1.0, -2.0], vec![1.0, 0.0, 3.0]];
    let ns = nullspace(&rows, 3);
    assert_eq!(ns.len(), 1);
    for r in &rows {
        assert!(r.iter().zip(&ns[0]).map(|(a, b)| a * b).sum::<f64>().abs() < 1e-14);
    }
    assert_eq!(nullspace(&[vec![1.0, 0.0, 0.0], vec![0.0, 1.0, 0.0], vec![0.0, 0.0, 1.0]], 3).len(), 0);
    assert_eq!(nullspace(&[], 6).len(), 6);
}

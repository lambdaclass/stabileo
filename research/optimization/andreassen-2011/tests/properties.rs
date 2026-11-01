use topopt_andreassen_2011::*;
#[test]
fn element_patch_and_rigid_modes() {
    let k = stiffness();
    let energy = |u: [f64; 8]| -> f64 {
        (0..8)
            .map(|i| (0..8).map(|j| u[i] * k[i][j] * u[j]).sum::<f64>())
            .sum()
    };
    for i in 0..8 {
        for j in 0..8 {
            assert!((k[i][j] - k[j][i]).abs() < 1e-15);
        }
    }
    for u in [
        [1., 0., 1., 0., 1., 0., 1., 0.],
        [0., 1., 0., 1., 0., 1., 0., 1.],
        [0., 0., 0., 1., -1., 1., -1., 0.],
    ] {
        assert!(energy(u).abs() < 1e-14);
    }
    assert!((energy([0., 0., 1., 0., 1., 0., 0., 0.]) - 1. / (1. - 0.3 * 0.3)).abs() < 1e-14);
    assert!((energy([0., 0., 0., 0., 1., 0., 1., 0.]) - 1. / (2. * 1.3)).abs() < 1e-14);
}
#[test]
fn filter_partition_and_adjoint() {
    let c = Config {
        nelx: 8,
        nely: 4,
        ..Config::default()
    };
    let f = Filter::new(&c);
    for v in f.apply(&vec![1.; 32]) {
        assert!((v - 1.).abs() < 1e-14);
    }
    let x: Vec<f64> = (0..32).map(|i| (i as f64).sin()).collect();
    let y: Vec<f64> = (0..32).map(|i| (i as f64).cos()).collect();
    let lhs: f64 = f.apply(&x).iter().zip(&y).map(|(a, b)| a * b).sum();
    let rhs: f64 = x.iter().zip(f.transpose(&y)).map(|(a, b)| a * b).sum();
    assert!((lhs - rhs).abs() < 1e-13);
}
#[test]
fn oc_volume_bounds_and_move() {
    for ft in [1, 2] {
        let mut o = Optimizer::new(Config {
            nelx: 12,
            nely: 4,
            ft,
            ..Config::default()
        })
        .unwrap();
        for _ in 0..5 {
            let previous = o.x.clone();
            let s = o.step().unwrap();
            assert!((s.volume - 0.5).abs() < 5e-4);
            assert!(s.density.iter().all(|v| (0.0..=1.0).contains(v)));
            assert!(o
                .x
                .iter()
                .zip(previous)
                .all(|(a, b)| (a - b).abs() <= 0.200000000001));
        }
    }
}
#[test]
fn invalid_configuration_rejected_before_allocation() {
    for c in [
        Config {
            nelx: usize::MAX,
            ..Config::default()
        },
        Config {
            rmin: f64::NAN,
            ..Config::default()
        },
        Config {
            ft: 3,
            ..Config::default()
        },
    ] {
        assert!(Optimizer::new(c).is_err());
    }
}

use topopt_andreassen_2011::*;
#[test]
fn authors_iterations() {
    let mut checks = vec![];
    for ft in [1, 2] {
        let path = format!(
            "{}/reference-results/ft{ft}.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let reference: Vec<Iteration> = serde_json::from_str(
            &std::fs::read_to_string(&path)
                .expect("Run reference/run_reference.py first; reference evidence is required"),
        )
        .unwrap();
        let mut o = Optimizer::new(Config {
            ft,
            ..Config::default()
        })
        .unwrap();
        let mut errors = [0_f64; 4];
        let mut volume_error = 0_f64;
        for r in &reference {
            let s = o.step().unwrap();
            volume_error = volume_error.max((s.volume - 0.5).abs());
            assert_eq!(s.iteration, r.iteration);
            assert_eq!(s.density.len(), r.density.len());
            errors[0] = errors[0].max((s.compliance - r.compliance).abs() / r.compliance.abs());
            errors[1] = errors[1].max((s.volume - r.volume).abs());
            errors[2] = errors[2].max((s.change - r.change).abs());
            errors[3] = s
                .density
                .iter()
                .zip(&r.density)
                .map(|(a, b)| (a - b).abs())
                .fold(0., f64::max);
        }
        assert!(o.finished(), "iteration count ft={ft}");
        assert!(volume_error < 5e-4);
        checks.push(serde_json::json!({"name":format!("ft{ft}: OC volume constraint every iteration"),"metric":"absolute error","observed":volume_error,"tolerance":5e-4,"passed":true}));
        for ((metric, tolerance), observed) in [
            ("compliance relative", 1e-6),
            ("volume absolute", 1e-8),
            ("change absolute", 1e-6),
            ("final density max absolute", 1e-5),
        ]
        .into_iter()
        .zip(errors)
        {
            assert!(observed <= tolerance, "ft{ft} {metric}: {observed}");
            checks.push(serde_json::json!({"name":format!("ft{ft}: {metric}"),"metric":metric,"observed":observed,"tolerance":tolerance,"passed":true}));
        }
        checks.push(serde_json::json!({"name":format!("ft{ft}: iteration count"),"metric":"exact","observed":0,"tolerance":0,"passed":true}));
        eprintln!(
            "ft{ft}: {} iterations; compliance {}; volume {}; change {}; errors {:?}",
            reference.len(),
            reference.last().unwrap().compliance,
            reference.last().unwrap().volume,
            reference.last().unwrap().change,
            errors
        );
    }
    let ke = stiffness();
    let symmetry = (0..8)
        .flat_map(|i| (0..8).map(move |j| (ke[i][j] - ke[j][i]).abs()))
        .fold(0., f64::max);
    let energy = |u: [f64; 8]| {
        (0..8)
            .map(|i| (0..8).map(|j| u[i] * ke[i][j] * u[j]).sum::<f64>())
            .sum::<f64>()
    };
    let patch = [
        energy([1., 0., 1., 0., 1., 0., 1., 0.]).abs(),
        energy([0., 1., 0., 1., 0., 1., 0., 1.]).abs(),
        energy([0., 0., 0., 1., -1., 1., -1., 0.]).abs(),
        (energy([0., 0., 1., 0., 1., 0., 0., 0.]) - 1. / 0.91).abs(),
        (energy([0., 0., 0., 0., 1., 0., 1., 0.]) - 1. / 2.6).abs(),
    ]
    .into_iter()
    .fold(0., f64::max);
    let f = Filter::new(&Config::default());
    let partition = f
        .apply(&vec![1.; 1200])
        .iter()
        .map(|v| (v - 1.).abs())
        .fold(0., f64::max);
    for (name, observed) in [
        ("KE symmetry", symmetry),
        ("constant strain patch and rigid modes", patch),
        ("filter partition of unity", partition),
    ] {
        assert!(observed < 1e-13);
        checks.push(serde_json::json!({"name":name,"metric":"absolute error","observed":observed,"tolerance":1e-13,"passed":true}));
    }
    if std::env::var_os("UPDATE_VALIDATION").is_some() {
        let v = serde_json::json!({"checks":checks,"produced_by":"UPDATE_VALIDATION=1 cargo test --release --locked --test reference","reference":"reference-results/ (unmodified DTU top88.m, GNU Octave; see MANIFEST.json)"});
        std::fs::write(
            "VALIDATION.json",
            serde_json::to_string_pretty(&v).unwrap() + "\n",
        )
        .unwrap();
    }
}

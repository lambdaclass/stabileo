#[path = "../tests/support/pcg_reference.rs"]
mod reference;
use dedaliano_engine::linalg::{pcg::pcg_solve, preconditioner::JacobiPreconditioner};
use std::{hint::black_box, time::Instant};
fn main() {
    let mut rows = Vec::new();
    for case in stabileo_compute::fixtures::comparison_cases() {
        let a = case.matrix();
        let pre = JacobiPreconditioner::new(&a).unwrap();
        let mut current = Vec::new();
        let mut old = Vec::new();
        let start = Instant::now();
        for _ in 0..10 {
            black_box(reference::reference_pcg(&a, &case.rhs, &pre, 1e-6, 2000));
        }
        let repeats = (0.1 / (start.elapsed().as_secs_f64() / 10.))
            .ceil()
            .clamp(1., 100_000.) as usize;
        for round in 0..10 {
            for original in [round % 2 == 0, round % 2 != 0] {
                let start = Instant::now();
                for _ in 0..repeats {
                    black_box(if original {
                        reference::reference_pcg(&a, &case.rhs, &pre, 1e-6, 2000)
                    } else {
                        pcg_solve(&a, &case.rhs, &pre, 1e-6, 2000)
                    });
                }
                let ms = start.elapsed().as_secs_f64() * 1000. / repeats as f64;
                if round > 0 {
                    if original {
                        old.push(ms);
                    } else {
                        current.push(ms);
                    }
                }
            }
        }
        current.sort_by(f64::total_cmp);
        old.sort_by(f64::total_cmp);
        rows.push(
            serde_json::json!({"case":case.name,"repeats_per_sample":repeats,
            "original_ms":old[4],"shared_driver_ms":current[4],"ratio":current[4]/old[4],
            "original_samples_ms":old,"shared_driver_samples_ms":current}),
        );
    }
    println!("{}", serde_json::to_string_pretty(&rows).unwrap());
}

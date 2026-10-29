//! Run one of the reference examples and print its load steps as JSON lines; with `--fields DIR`
//! also write the damage and displacement at every step.
//!
//!   cargo run --release --bin reproduce -- ex1|ex2|ex3 [--history] [--fields DIR]

use phasefield_shauer_2025::examples::{bar_reference, three_point_bending_reference, NotchedPlate};
use phasefield_shauer_2025::model::Irreversibility;
use phasefield_shauer_2025::solver::Solver;
use std::io::Write;

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let mut problem = match args.get(1).map(String::as_str) {
        Some("ex1") => bar_reference(),
        Some("ex2") => NotchedPlate::reference().problem()?,
        Some("ex3") => three_point_bending_reference(),
        _ => return Err("usage: reproduce ex1|ex2|ex3 [--history] [--fields DIR]".into()),
    };
    if args.iter().any(|a| a == "--history") {
        problem.controls.irreversibility = Irreversibility::History;
    }
    let fields = args.iter().position(|a| a == "--fields").and_then(|i| args.get(i + 1)).cloned();
    if let Some(dir) = &fields {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut solver = Solver::new(problem)?;
    let t0 = std::time::Instant::now();
    let out = std::io::stdout();
    solver.run(|s, sv| {
        let mut o = out.lock();
        writeln!(o, "{}", serde_json::to_string(s).unwrap()).unwrap();
        if let Some(dir) = &fields {
            let mut f = std::fs::File::create(format!("{dir}/step{:03}.csv", s.step)).unwrap();
            for i in 0..sv.d.len() {
                writeln!(f, "{:.17e},{:.17e},{:.17e}", sv.d[i], sv.u[2 * i], sv.u[2 * i + 1]).unwrap();
            }
        }
    })?;
    eprintln!("wall seconds: {:.2}", t0.elapsed().as_secs_f64());
    Ok(())
}

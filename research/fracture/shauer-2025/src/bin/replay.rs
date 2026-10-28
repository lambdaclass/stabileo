//! Record the reference notched-plate run for the page's autoplay, or verify a recording.
//!
//!   cargo run --release --bin replay -- write <out.bin>
//!   cargo run --release --bin replay -- verify <file.bin>
//!
//! `verify` decodes the file and checks it against a fresh run of the same configuration: every
//! step's scalars exactly, and the fields within their quantization step.

use phasefield_shauer_2025::examples::NotchedPlate;
use phasefield_shauer_2025::replay::{decode, encode, DAMAGE_MAX};
use phasefield_shauer_2025::solver::{Solver, StepResult};

fn fresh(plate: &NotchedPlate) -> Result<(Solver, Vec<StepResult>, Vec<(Vec<f64>, Vec<f64>)>), String> {
    let mut solver = Solver::new(plate.problem()?)?;
    let mut frames = Vec::new();
    let steps = solver.run(|_, sv| frames.push((sv.d.clone(), sv.u.clone())))?;
    Ok((solver, steps, frames))
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let (cmd, path) = match (args.get(1), args.get(2)) {
        (Some(c), Some(p)) => (c.as_str(), p.clone()),
        _ => return Err("usage: replay write|verify <file>".into()),
    };
    let plate = NotchedPlate::reference();
    let (solver, steps, frames) = fresh(&plate)?;
    match cmd {
        "write" => {
            let bytes = encode(&solver.problem.mesh, serde_json::to_value(&plate).unwrap(), &steps, &frames)?;
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            eprintln!("replay: {} steps, {} bytes -> {path}", steps.len(), bytes.len());
        }
        "verify" => {
            let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
            let (header, nodes, elements, stored) = decode(&bytes)?;
            if header.steps.len() != steps.len() || stored.len() != frames.len() {
                return Err("replay: step count differs from a fresh run".into());
            }
            for (a, b) in header.steps.iter().zip(&steps) {
                if a != &serde_json::to_value(b).unwrap() {
                    return Err(format!("replay: step {} results differ from a fresh run", b.step));
                }
            }
            if elements != solver.problem.mesh.elements {
                return Err("replay: connectivity differs".into());
            }
            let pos = nodes.iter().zip(&solver.problem.mesh.nodes).map(|(a, b)| (a[0] - b[0]).abs().max((a[1] - b[1]).abs())).fold(0.0, f64::max);
            let (mut dd, mut du) = (0.0f64, 0.0f64);
            for ((fd, fu), s) in frames.iter().zip(&stored) {
                let scale = fu.iter().fold(0.0f64, |m, v| m.max(v.abs()));
                for i in 0..fd.len() {
                    dd = dd.max((fd[i].clamp(0.0, DAMAGE_MAX) - s.damage[i]).abs() / (DAMAGE_MAX / 255.0));
                }
                for i in 0..fu.len() {
                    if scale > 0.0 {
                        du = du.max((fu[i] - s.displacement[i]).abs() / (scale / 127.0));
                    }
                }
            }
            println!("{{\"steps\":{},\"bytes\":{},\"node_position_error\":{pos:e},\"damage_error_in_quanta\":{dd:.3},\"displacement_error_in_quanta\":{du:.3}}}", steps.len(), bytes.len());
            if pos > 1e-7 || dd > 0.5 + 1e-9 || du > 0.5 + 1e-9 {
                return Err("replay: fields differ from a fresh run by more than half a quantization step".into());
            }
        }
        _ => return Err("usage: replay write|verify <file>".into()),
    }
    Ok(())
}

use phasefield_shauer_2025::examples::{bar_reference, three_point_bending_reference, NotchedPlate};
use phasefield_shauer_2025::solver::Solver;

fn main() -> Result<(), String> {
    let case = std::env::args().nth(1).ok_or("usage: timing ex1|ex2|ex3")?;
    let problem = match case.as_str() {
        "ex1" => bar_reference(),
        "ex2" => NotchedPlate::reference().problem()?,
        "ex3" => three_point_bending_reference(),
        _ => return Err("usage: timing ex1|ex2|ex3".into()),
    };
    let elements = problem.mesh.elements.len();
    let nodes = problem.mesh.nodes.len();
    let mut solver = Solver::new(problem)?;
    let steps = solver.run(|_, _| {})?;
    if steps.iter().any(|s| !s.converged) {
        return Err("unconverged timing run".into());
    }
    println!("{}", serde_json::json!({ "steps": steps.len(), "elements": elements, "nodes": nodes }));
    Ok(())
}

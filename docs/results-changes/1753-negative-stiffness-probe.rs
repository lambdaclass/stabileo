use dedaliano_engine::{solver::{linear, stability}, types::*};
fn main() {
    for two_d in [true, false] {
        let kind = if two_d { stability::DofKind::Translation } else { stability::DofKind::Rotation };
        let result = stability::analyze_dense(&[1e20, 1.0, 1.0, -1.0], 2, &[stability::DofTag { node: 2, kind }; 2]);
        println!("matrix {two_d}: {result:?}");
    }
    let paths: Vec<String> = std::env::args().skip(1).collect();
    let i2: SolverInput = serde_json::from_str(&std::fs::read_to_string(&paths[0]).unwrap()).unwrap();
    let i3: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(&paths[1]).unwrap()).unwrap();
    println!("model 2d: {:?}", linear::solve_2d(&i2));
    println!("model 3d: {:?}", linear::solve_3d(&i3));
}

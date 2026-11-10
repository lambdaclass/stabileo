use shape_control_feher_2026::run;

fn main() {
    let path = std::env::args().nth(1).expect("usage: replay <out.json>");
    let replay = run::path(run::CORNER.0, run::CORNER.1).unwrap();
    std::fs::write(path, serde_json::to_string(&replay).unwrap() + "\n").unwrap();
}

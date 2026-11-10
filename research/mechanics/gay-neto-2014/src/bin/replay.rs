use risers_gay_neto_2014::run;

fn main() {
    let path = std::env::args().nth(1).expect("usage: replay <out.json>");
    let replay = serde_json::json!({
        "riser": run::riser(run::PULL, run::LIFT, run::FRICTION).unwrap(),
        "cantilever": run::cantilever().unwrap(),
    });
    std::fs::write(path, serde_json::to_string(&replay).unwrap() + "\n").unwrap();
}

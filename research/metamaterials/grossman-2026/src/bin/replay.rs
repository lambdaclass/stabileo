use springs_grossman_2026::experiment::{run_periodic, run_strip, NetworkSpec, PeriodicSpec, StripSpec};
use serde_json::json;
fn main() {
    let mut frames = Vec::new();
    for i in 0..26 {
        let eta = i as f64 * 0.02;
        let network: NetworkSpec = serde_json::from_value(json!({"lattice":{"kind":"triangular","phi":1,"psi":1},"eta":eta})).unwrap();
        let strip = run_strip(&StripSpec { network: network.clone(), width:13.0, height:52.0, theta:0.0, clamp_band:0.5, strain:0.01 }).unwrap();
        let cell = run_periodic(&PeriodicSpec { network:network.clone(), n1:26, n2:26, strain:[0.0;3] }).unwrap();
        frames.push(json!({"input":{"network":network,"label":{"family":"foam","eta":eta,"keep":1,"seed":0,"strain":0.01},"theta":0,"cells":26,"phi":2,"psi":0.5},"strip":strip,"cell":cell,"ordered":null}));
    }
    let path = std::env::args().nth(1).map(std::path::PathBuf::from).unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("reference-results/replay.json"));
    std::fs::write(path, serde_json::to_string(&frames).unwrap()).unwrap();
}

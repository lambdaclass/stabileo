use shape_control_feher_2026::run;
fn main() {
    for (t, d) in [(1.3, 0.6), (1.3, 0.8), (1.3, 1.0), (1.3, 1.2), (1.2, 1.3), (1.1, 1.3), (1.05, 1.3), (1.5, 1.3), (1.3, 1.6)] {
        match run::path(t, d) {
            Ok(v) => { let f = v["frames"].as_array().unwrap(); println!("({t},{d}) frames {} snaps {:?} lost {} end {} kmax {:.2}", f.len(), v["snaps"], v["lost"], f.last().unwrap()["y_mid"], f.iter().map(|x| x["max_curvature"].as_f64().unwrap()).fold(0.0, f64::max)); }
            Err(e) => println!("({t},{d}) ERR {e}"),
        }
    }
}

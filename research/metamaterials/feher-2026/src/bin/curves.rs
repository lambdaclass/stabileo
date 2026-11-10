use cut_strip_feher_2026::{load_cycle, Strip, LENGTH};

fn main() {
    let mut cases = vec![];
    for span in [0.5, 0.75] {
        for b in [0.2, 0.5, 0.8] {
            cases.push(load_cycle(&Strip { a: 0.5, b }, span * LENGTH, 4.0, 0.05, 10.0).unwrap());
        }
    }
    println!("{}", serde_json::to_string(&cases).unwrap());
}

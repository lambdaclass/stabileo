fn main() {
    let run = arches_biggins_2026::run(0.7, 0.012).unwrap();
    println!("{}", serde_json::to_string(&run).unwrap());
}

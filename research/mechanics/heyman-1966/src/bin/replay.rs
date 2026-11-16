fn main() {
    let path = std::env::args().nth(1).expect("usage: replay <out.json>");
    let replay = masonry_arches_heyman_1966::run::replay().unwrap();
    std::fs::write(path, serde_json::to_string(&replay).unwrap() + "\n").unwrap();
}

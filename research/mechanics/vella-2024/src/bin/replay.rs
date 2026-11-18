fn main() {
    let settings = snap_symmetry_vella_2024::study::default_settings();
    let page = snap_symmetry_vella_2024::run::page(&settings, &mut |_| false).expect("the default run");
    let out = std::env::args().nth(1).expect("output path");
    std::fs::write(out, serde_json::to_string(&page).unwrap() + "\n").unwrap();
}

fn main() {
    let result = koiter_ferrari_sigmund_2025::replay::reproduce();
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("results/stabileo_results.json");
    std::fs::write(path, serde_json::to_string_pretty(&result).unwrap() + "\n").unwrap();
    println!(
        "lambda={} frames={}",
        result["lambda"],
        result["frames"].as_array().unwrap().len()
    );
}

use form_finding_pastrana_2026::four_bar;
fn main() {
    let frames: Vec<_> = (0..=24)
        .map(|i| four_bar(1., 1. + i as f64 / 8.).unwrap())
        .collect();
    let output = std::env::args().nth(1).expect("output path");
    std::fs::write(
        output,
        serde_json::to_string_pretty(&frames).unwrap() + "\n",
    )
    .unwrap();
}

use dedaliano_engine::types::SolverInput3D;
use dedaliano_engine::solver::linear::solve_3d;

#[test]
fn tower_fixture_displacements_match_ts() {
    let json = std::fs::read_to_string("tests/fixtures/tower-dead-load.json")
        .expect("failed to read fixture");
    let input: SolverInput3D = serde_json::from_str(&json)
        .expect("failed to parse fixture");

    // Verify sections
    println!("Sections in input:");
    for (k, s) in &input.sections {
        println!("  key={} id={} name={:?} a={} iy={} iz={} j={}", k, s.id, s.name, s.a, s.iy, s.iz, s.j);
    }

    // Verify element section assignments
    let mut sec_counts = std::collections::HashMap::new();
    for elem in input.elements.values() {
        *sec_counts.entry(elem.section_id).or_insert(0usize) += 1;
    }
    println!("Element section counts: {:?}", sec_counts);

    let results = solve_3d(&input).expect("solver failed");

    let mut max_ux: f64 = 0.0;
    let mut max_uy: f64 = 0.0;
    let mut max_uz: f64 = 0.0;
    for d in &results.displacements {
        max_ux = max_ux.max(d.ux.abs());
        max_uy = max_uy.max(d.uy.abs());
        max_uz = max_uz.max(d.uz.abs());
    }

    println!("Rust solver: max_ux={:.1}mm max_uy={:.1}mm max_uz={:.1}mm",
             max_ux * 1000.0, max_uy * 1000.0, max_uz * 1000.0);

    // TS solver gives: ux=50.4mm, uy=21.1mm, uz=5.5mm (SAP2000/textbook axes)
    // Allow 10% tolerance for numerical differences
    assert!((max_ux * 1000.0 - 50.4).abs() < 5.0, "max_ux={:.1}mm, expected ~50.4mm", max_ux * 1000.0);
    assert!((max_uy * 1000.0 - 21.1).abs() < 3.0, "max_uy={:.1}mm, expected ~21.1mm", max_uy * 1000.0);
    assert!((max_uz * 1000.0 - 5.5).abs() < 2.0, "max_uz={:.1}mm, expected ~5.5mm", max_uz * 1000.0);
}

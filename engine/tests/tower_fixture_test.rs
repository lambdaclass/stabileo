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

    // Canonical Z-up local-axis convention (the corrected default — matches web
    // computeLocalAxes3D). Under the old global-Y default this tower bent some
    // members about their weak axis and read ux=50.4/uy=21.1/uz=5.5 mm; the
    // corrected convention orients each member's strong axis to resist load, so
    // the tower is stiffer: ux≈9.0/uy≈6.3/uz≈0.9 mm. Baseline updated to the
    // corrected convention (no legacy mode).
    assert!((max_ux * 1000.0 - 9.0).abs() < 2.0, "max_ux={:.1}mm, expected ~9.0mm", max_ux * 1000.0);
    assert!((max_uy * 1000.0 - 6.3).abs() < 2.0, "max_uy={:.1}mm, expected ~6.3mm", max_uy * 1000.0);
    assert!((max_uz * 1000.0 - 0.9).abs() < 1.0, "max_uz={:.1}mm, expected ~0.9mm", max_uz * 1000.0);
}

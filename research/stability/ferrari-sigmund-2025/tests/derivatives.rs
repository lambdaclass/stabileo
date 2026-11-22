#[test]
fn every_energy_derivative_through_order_four_matches_central_differences() {
    let maxima = koiter_ferrari_sigmund_2025::validation::derivative_maxima();
    println!("derivative relative scaled maxima {maxima:?}");
    assert!(maxima.into_iter().all(|x| x < 2e-5));
}

pub(crate) fn load_precedes_station(a: f64, length: f64, t: f64) -> bool {
    a / length < t
}

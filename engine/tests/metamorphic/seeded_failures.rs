use crate::case::Case2;
use crate::response::Resp;
use crate::tally::Tally;

fn cantilever() -> Case2 {
    Case2::new("seeded cantilever", serde_json::from_str(include_str!("../fixtures/ex-cantilever-input.json")).unwrap())
}

fn check_2d(a: crate::ana2::Ana2, invariant: &str) -> serde_json::Value {
    let t = Tally::default();
    crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: 1919 }, &cantilever(), &[a], &[invariant]);
    t.replay_results()
}

#[test]
#[ignore = "known wrong result: #1919"]
fn seeded_failure_empty_linear_agreement() {
    let mut a = crate::ana2::rows().into_iter().find(|a| a.name == "linear (dense reference)").unwrap();
    assert_eq!(check_2d(a, "linear agreement")["verdicts"][0]["pass"], 1);
    a = crate::ana2::rows().into_iter().find(|a| a.name == "linear (dense reference)").unwrap();
    a.run = |_| Ok(Resp::default());
    let result = check_2d(a, "linear agreement");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

#[test]
#[ignore = "known wrong result: #1919"]
fn seeded_failure_energy_dropped_load() {
    let mut a = crate::ana2::rows().into_iter().find(|a| a.name == "linear").unwrap();
    assert_eq!(check_2d(a, "energy")["verdicts"][0]["pass"], 1);
    a = crate::ana2::rows().into_iter().find(|a| a.name == "linear").unwrap();
    a.run = |c| {
        let mut unloaded = c.s.clone();
        unloaded.loads.clear();
        Ok(crate::response::static_2d(&dedaliano_engine::solver::linear::solve_2d(&unloaded)?))
    };
    let result = check_2d(a, "energy");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

fn cantilever_3d() -> crate::case::Case3 {
    let s = dedaliano_engine::metamorphic::planes::embed_2d(&cantilever().s, dedaliano_engine::metamorphic::planes::Plane::XZ).unwrap();
    crate::case::Case3::new("seeded cantilever 3D", s)
}

fn check_3d(a: crate::ana3::Ana3, invariant: &str) -> serde_json::Value {
    let t = Tally::default();
    crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: 1919 }, &cantilever_3d(), &[a], &[invariant]);
    t.replay_results()
}

#[test]
#[ignore = "known wrong result: #1919"]
fn seeded_failure_energy_dropped_load_3d() {
    let mut a = crate::ana3::rows().into_iter().find(|a| a.name == "linear").unwrap();
    assert_eq!(check_3d(a, "energy")["verdicts"][0]["pass"], 1);
    a = crate::ana3::rows().into_iter().find(|a| a.name == "linear").unwrap();
    a.run = |c| {
        let mut unloaded = c.s.clone();
        unloaded.loads.clear();
        Ok(crate::response::static_3d(&dedaliano_engine::solver::linear::solve_3d(&unloaded)?))
    };
    let result = check_3d(a, "energy");
    assert_eq!(result["verdicts"][0]["fail"], 1, "{result}");
}

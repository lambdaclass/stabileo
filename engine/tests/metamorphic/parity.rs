//! The load sessions and the typed WASM path must report what the regular solve reports: the
//! same refusal, or the same structured diagnostics (code, severity, phase, members, nodes).

use crate::corpus::{self, Tier};
use dedaliano_engine::load_session::{LoadSession2D, LoadSession3D};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::units::ElasticInput2D;
use dedaliano_engine::types::*;

type Key = (String, String, Option<String>, Vec<usize>, Vec<usize>);

fn keys(d: &[StructuredDiagnostic]) -> Vec<Key> {
    let mut k: Vec<Key> = d
        .iter()
        .map(|d| (format!("{:?}", d.code), format!("{:?}", d.severity), d.phase.clone(), d.element_ids.clone(), d.node_ids.clone()))
        .collect();
    k.sort();
    k
}

fn outcome<T>(r: Result<T, String>, diagnostics: impl Fn(&T) -> &[StructuredDiagnostic]) -> Result<Vec<Key>, String> {
    r.map(|r| keys(diagnostics(&r)))
}

pub fn differences(name: &str, path: &str, regular: &Result<Vec<Key>, String>, other: &Result<Vec<Key>, String>) -> Option<String> {
    match (regular, other) {
        (Ok(a), Ok(b)) if a == b => None,
        (Ok(a), Ok(b)) => Some(format!(
            "{name}: {path} diagnostics differ: only regular {:?}; only {path} {:?}",
            a.iter().filter(|k| !b.contains(k)).collect::<Vec<_>>(),
            b.iter().filter(|k| !a.contains(k)).collect::<Vec<_>>()
        )),
        (Err(a), Err(b)) if a == b => None,
        (Err(a), Err(b)) => Some(format!("{name}: both refuse, differently: regular {a:.200}; {path} {b:.200}")),
        (Ok(_), Err(b)) => Some(format!("{name}: regular solves, {path} refuses: {b:.300}")),
        (Err(a), Ok(_)) => Some(format!("{name}: {path} solves, regular refuses: {a:.300}")),
    }
}

fn typed(s: &SolverInput) -> Result<ElasticInput2D, String> {
    serde_json::to_value(s).and_then(serde_json::from_value).map_err(|e| e.to_string())
}

#[test]
fn sessions_and_the_typed_path_report_what_the_regular_solve_reports() {
    let mut found = Vec::new();
    for c in corpus::cases_2d(Tier::Pr, crate::seed()) {
        let regular = outcome(linear::solve_2d(&c.s), |r| &r.structured_diagnostics);
        let session = outcome(LoadSession2D::from_input(c.s.clone()).and_then(|x| x.solve_loads(&c.s.loads)), |r| &r.structured_diagnostics);
        let typed = outcome(typed(&c.s).and_then(|t| linear::solve_2d_typed(&t)), |r| &r.structured_diagnostics);
        found.extend(differences(&c.name, "2D session", &regular, &session));
        found.extend(differences(&c.name, "2D typed path", &regular, &typed));
    }
    for c in corpus::cases_3d(Tier::Pr, crate::seed()) {
        let regular = outcome(linear::solve_3d(&c.s), |r| &r.structured_diagnostics);
        let session = outcome(LoadSession3D::from_input(c.s.clone()).and_then(|x| x.solve_loads(&c.s.loads)), |r| &r.structured_diagnostics);
        found.extend(differences(&c.name, "3D session", &regular, &session));
    }
    assert!(found.is_empty(), "{} disagreement(s):\n{}", found.len(), found.join("\n"));
}

#[test]
fn a_missing_diagnostic_or_a_one_sided_refusal_is_a_difference() {
    let k = |code: &str| (code.to_string(), "Warning".to_string(), None, vec![1], vec![]);
    assert_eq!(differences("m", "p", &Ok(vec![k("A")]), &Ok(vec![k("A")])), None);
    assert!(differences("m", "p", &Ok(vec![k("A")]), &Ok(vec![])).unwrap().contains("only regular"));
    assert!(differences("m", "p", &Ok(vec![]), &Err("refused".into())).unwrap().contains("regular solves, p refuses"));
    assert!(differences("m", "p", &Err("x".into()), &Err("y".into())).unwrap().contains("differently"));
    assert_eq!(differences("m", "p", &Err("x".into()), &Err("x".into())), None);
}

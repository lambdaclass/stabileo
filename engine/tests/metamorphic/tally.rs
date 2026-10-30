//! Outcome bookkeeping: the invariants × analyses matrix.

use std::collections::BTreeMap;
use std::sync::Mutex;

#[derive(Debug, Clone)]
pub enum Verdict {
    /// Held; worst |diff|/tol seen.
    Pass(f64),
    Ignored(&'static str),
    /// The analysis refused or failed on this model (not a metamorphic finding).
    Refused(String),
    /// The transform cannot be expressed for this model.
    Unrepresentable(String),
    /// The derived tolerance is too loose to discriminate.
    Inconclusive(f64),
    /// Does not apply.
    NotApplicable,
    /// Violated.
    Fail(String),
}

#[derive(Debug, Default, Clone)]
pub struct Cell {
    pub pass: usize,
    pub ignored: std::collections::BTreeSet<&'static str>,
    pub refused: usize,
    pub unrep: usize,
    pub inconclusive: usize,
    pub fails: Vec<String>,
    pub worst: f64,
    pub notes: BTreeMap<String, usize>,
}

#[derive(Default)]
pub struct Tally {
    pub cells: Mutex<BTreeMap<(String, String), Cell>>,
}

impl Tally {
    pub fn record(&self, ana: &str, inv: &str, case: &str, v: Verdict) {
        let mut g = self.cells.lock().unwrap();
        let c = g.entry((ana.to_string(), inv.to_string())).or_default();
        match v {
            Verdict::Ignored(issue) => { c.ignored.insert(issue); }
            Verdict::Pass(w) => {
                c.pass += 1;
                c.worst = c.worst.max(w);
            }
            Verdict::Refused(r) => {
                c.refused += 1;
                *c.notes.entry(short(&r)).or_default() += 1;
            }
            Verdict::Unrepresentable(r) => {
                c.unrep += 1;
                *c.notes.entry(short(&r)).or_default() += 1;
            }
            Verdict::Inconclusive(_) => c.inconclusive += 1,
            Verdict::NotApplicable => {}
            Verdict::Fail(m) => c.fails.push(format!("{case}: {m}")),
        }
    }

    pub fn failures(&self) -> Vec<String> {
        let g = self.cells.lock().unwrap();
        g.iter().flat_map(|((a, i), c)| c.fails.iter().map(move |f| format!("[{a} × {i}] {f}"))).collect()
    }

    pub fn report(&self) -> String {
        let g = self.cells.lock().unwrap();
        let mut s = String::new();
        for ((a, i), c) in g.iter() {
            s += &format!(
                "{a:<34} {i:<16} pass {:>4}  fail {:>3}  refused {:>4}  unrep {:>4}  inconcl {:>3}  worst {:.2e}\n",
                c.pass,
                c.fails.len(),
                c.refused,
                c.unrep,
                c.inconclusive,
                c.worst
            );
        }
        s
    }

    /// Matrix symbol of a cell: ✓ held on every model it ran on, ✗ violated,
    /// R the analysis refused every model (or the transform's result) by
    /// name, U never representable, · not applicable.
    pub fn symbol(&self, ana: &str, inv: &str) -> &'static str {
        let g = self.cells.lock().unwrap();
        match g.get(&(ana.to_string(), inv.to_string())) {
            Some(c) if !c.fails.is_empty() => "✗",
            Some(c) if !c.ignored.is_empty() => c.ignored.iter().next().copied().unwrap(),
            Some(c) if c.pass > 0 => "✓",
            Some(c) if c.inconclusive > 0 => "~",
            Some(c) if c.refused > 0 => "R",
            Some(c) if c.unrep > 0 => "U",
            _ => "·",
        }
    }

    /// Status per cell for the doc: holds / VIOLATED / not checked.
    pub fn status(&self, ana: &str, inv: &str) -> &'static str {
        let g = self.cells.lock().unwrap();
        match g.get(&(ana.to_string(), inv.to_string())) {
            Some(c) if !c.fails.is_empty() => "VIOLATED",
            Some(c) if c.pass > 0 => "holds",
            Some(c) if c.unrep > 0 && c.refused == 0 => "unrepresentable",
            Some(c) if c.refused > 0 => "refused",
            _ => "—",
        }
    }
}

fn short(s: &str) -> String {
    let s = s.lines().next().unwrap_or("");
    s.chars().take(90).collect()
}

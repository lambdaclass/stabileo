//! CIRSOC 101-2025 §2.3.2 strength combinations, with INPRES-CIRSOC 103-2018 §3.7.1 [3.16]
//! companions in the seismic one, F and H per §2.3.2, the "loads not acting" variants and
//! §2.3.4 (T).
//!
//! Verified clause by clause in `docs/verification/LOADS.md` (the TypeScript generator that
//! preceded this one, `web/src/lib/codes/cirsoc101/combinations.ts`, is now an adapter, and its
//! differential tests hold the two to each other on every subset of loads).
//!
//! The generator returns what each combination is (its id, basic number, terms), and the clause
//! references and notes as data: `ClauseRef` tuples and message keys with raw parameters. The
//! app renders them.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LoadSymbol {
    D,
    L,
    Lr,
    S,
    R,
    W,
    Wa,
    E,
    F,
    H,
    T,
    M,
    A,
    I,
}

impl LoadSymbol {
    fn name(self) -> &'static str {
        match self {
            LoadSymbol::D => "D",
            LoadSymbol::L => "L",
            LoadSymbol::Lr => "Lr",
            LoadSymbol::S => "S",
            LoadSymbol::R => "R",
            LoadSymbol::W => "W",
            LoadSymbol::Wa => "Wa",
            LoadSymbol::E => "E",
            LoadSymbol::F => "F",
            LoadSymbol::H => "H",
            LoadSymbol::T => "T",
            LoadSymbol::M => "M",
            LoadSymbol::A => "A",
            LoadSymbol::I => "I",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CombinationTerm {
    pub symbol: LoadSymbol,
    pub factor: f64,
}

/// A clause reference, as the app's `clause()` builds it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ClauseRef {
    pub regulation: String,
    pub edition: String,
    pub clause: String,
    pub label: String,
}

fn cref(regulation: &str, edition: &str, clause: &str, label: &str) -> ClauseRef {
    ClauseRef { regulation: regulation.into(), edition: edition.into(), clause: clause.into(), label: label.into() }
}

/// A message for a human: an i18n key and raw parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Map<String, Value>>,
}

fn note(key: &str) -> Note {
    Note { key: key.into(), params: None }
}

fn note_with(key: &str, params: Value) -> Note {
    Note { key: key.into(), params: params.as_object().cloned() }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Combination {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub basic: Option<u8>,
    pub terms: Vec<CombinationTerm>,
    pub refs: Vec<ClauseRef>,
    pub notes: Vec<Note>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Present {
    #[serde(default, rename = "L")]
    pub l: bool,
    #[serde(default, rename = "Lr")]
    pub lr: bool,
    #[serde(default, rename = "S")]
    pub s: bool,
    #[serde(default, rename = "R")]
    pub r: bool,
    #[serde(default, rename = "W")]
    pub w: bool,
    #[serde(default, rename = "E")]
    pub e: bool,
    #[serde(default, rename = "F")]
    pub f: bool,
    #[serde(default, rename = "H")]
    pub h: bool,
    #[serde(default, rename = "Wa")]
    pub wa: bool,
    #[serde(default, rename = "T")]
    pub t: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EarthPressureAction {
    Adds,
    Opposes,
    Unknown,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SeismicCompanions {
    #[serde(default)]
    pub f1: Option<f64>,
    #[serde(default)]
    pub f2: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationInputs {
    pub present: Present,
    #[serde(default, rename = "maxLoKNm2")]
    pub max_lo_knm2: Option<f64>,
    #[serde(default)]
    pub has_garage_or_public_assembly: bool,
    #[serde(default)]
    pub earth_pressure_action: Option<EarthPressureAction>,
    #[serde(default)]
    pub earth_pressure_permanent: bool,
    #[serde(default)]
    pub seismic_companions: Option<SeismicCompanions>,
    #[serde(default)]
    pub not_acting: Option<bool>,
}

/// §2.3.2 Exception 1: the companion factor on L in combinations 3, 4 and 5, and why.
pub fn live_load_factor_in_companion(i: &CombinationInputs) -> (f64, Note) {
    if i.has_garage_or_public_assembly {
        return (1.0, note("loads.cirsoc101.exception1.blockedByAssembly"));
    }
    match i.max_lo_knm2 {
        None => (1.0, note("loads.cirsoc101.exception1.unknownLo")),
        Some(lo) if lo <= 5.0 => (0.5, note_with("loads.cirsoc101.exception1.applied", json!({ "lo": lo }))),
        Some(lo) => (1.0, note_with("loads.cirsoc101.exception1.heavyLo", json!({ "lo": lo }))),
    }
}

fn ref_basic() -> ClauseRef {
    cref("cirsoc-101", "2025", "2.3.2", "combinaciones básicas")
}
fn ref_exc1() -> ClauseRef {
    cref("cirsoc-101", "2025", "2.3.2 Excepción 1", "factor de carga L reducido")
}
fn ref_exc2() -> ClauseRef {
    cref("cirsoc-101", "2025", "2.3.2 Excepción 2", "S como carga de nieve sobre cubierta plana")
}

struct Variant {
    suffix: &'static str,
    terms: Vec<CombinationTerm>,
    refs: Vec<ClauseRef>,
    notes: Vec<Note>,
}

fn term(symbol: LoadSymbol, factor: f64) -> CombinationTerm {
    CombinationTerm { symbol, factor }
}

/// F with D's factor (not in 6), and H at 1,6 / 0,9 / 0 per its action (both when unknown).
fn apply_fluid_and_earth(basic: u8, terms: &[CombinationTerm], i: &CombinationInputs) -> Vec<Variant> {
    let mut with_f = terms.to_vec();
    let mut refs = Vec::new();
    let mut notes = Vec::new();
    if i.present.f && basic != 6 {
        let d = terms.iter().find(|t| t.symbol == LoadSymbol::D).map_or(1.0, |t| t.factor);
        with_f.push(term(LoadSymbol::F, d));
        refs.push(cref("cirsoc-101", "2025", "2.3.2", "cargas debidas a fluidos F"));
        notes.push(note("loads.cirsoc101.note.fSameFactorAsD"));
    }
    if !i.present.h {
        return vec![Variant { suffix: "", terms: with_f, refs, notes }];
    }
    let h_ref = cref("cirsoc-101", "2025", "2.3.2", "empuje lateral del suelo H");
    let opposing = if i.earth_pressure_permanent { 0.9 } else { 0.0 };
    let opposing_note = note(if i.earth_pressure_permanent {
        "loads.cirsoc101.note.hOpposesPermanent"
    } else {
        "loads.cirsoc101.note.hOpposesTemporary"
    });
    let with_h = |f: f64| -> Vec<CombinationTerm> {
        let mut t = with_f.clone();
        if f != 0.0 {
            t.push(term(LoadSymbol::H, f));
        }
        t
    };
    let plus = |extra: Vec<ClauseRef>, n: Note| -> (Vec<ClauseRef>, Vec<Note>) {
        let mut r = refs.clone();
        r.extend(extra);
        let mut ns = notes.clone();
        ns.push(n);
        (r, ns)
    };
    match i.earth_pressure_action.unwrap_or(EarthPressureAction::Unknown) {
        EarthPressureAction::Adds => {
            let (r, n) = plus(vec![h_ref], note("loads.cirsoc101.note.hAdds"));
            vec![Variant { suffix: "", terms: with_h(1.6), refs: r, notes: n }]
        }
        EarthPressureAction::Opposes => {
            let (r, n) = plus(vec![h_ref], opposing_note);
            vec![Variant { suffix: "", terms: with_h(opposing), refs: r, notes: n }]
        }
        EarthPressureAction::Unknown => {
            let (r1, n1) = plus(vec![h_ref.clone()], note("loads.cirsoc101.note.hUnknownAdding"));
            let (r2, n2) = plus(
                vec![h_ref],
                note_with("loads.cirsoc101.note.hUnknownOpposing", json!({ "factor": opposing })),
            );
            vec![
                Variant { suffix: "-H+", terms: with_h(1.6), refs: r1, notes: n1 },
                Variant { suffix: "-H-", terms: with_h(opposing), refs: r2, notes: n2 },
            ]
        }
    }
}

fn term_key(terms: &[CombinationTerm]) -> Vec<(&'static str, i64)> {
    let mut k: Vec<_> = terms
        .iter()
        .filter(|t| t.factor != 0.0)
        .map(|t| (t.symbol.name(), (t.factor * 1e4).round() as i64))
        .collect();
    k.sort();
    k
}

fn principal(basic: u8) -> &'static [LoadSymbol] {
    match basic {
        2 => &[LoadSymbol::L],
        3 => &[LoadSymbol::Lr, LoadSymbol::S, LoadSymbol::R],
        4 | 6 => &[LoadSymbol::W],
        5 | 7 => &[LoadSymbol::E],
        _ => &[],
    }
}

fn is_companion(s: LoadSymbol) -> bool {
    matches!(s, LoadSymbol::L | LoadSymbol::Lr | LoadSymbol::S | LoadSymbol::R | LoadSymbol::W | LoadSymbol::E)
}

/// The strength combinations for the loads present.
pub fn generate_combinations(i: &CombinationInputs) -> Vec<Combination> {
    use LoadSymbol::*;
    let p = &i.present;
    let mut out: Vec<Combination> = Vec::new();
    let (l_comp, exc_note) = live_load_factor_in_companion(i);
    let roof: Vec<LoadSymbol> = [(p.lr, Lr), (p.s, S), (p.r, R)].iter().filter(|x| x.0).map(|x| x.1).collect();

    let push = |out: &mut Vec<Combination>, basic: u8, suffix: String, terms: Vec<CombinationTerm>, refs: Vec<ClauseRef>, notes: Vec<Note>| {
        for v in apply_fluid_and_earth(basic, &terms, i) {
            let mut r = refs.clone();
            r.extend(v.refs);
            let mut n = notes.clone();
            n.extend(v.notes);
            out.push(Combination { id: format!("{basic}{suffix}{}", v.suffix), basic: Some(basic), terms: v.terms, refs: r, notes: n });
        }
    };
    let snow_note = || note("loads.cirsoc101.note.snowAsFlatRoof");

    push(&mut out, 1, String::new(), vec![term(D, 1.4)], vec![ref_basic()], vec![]);

    if p.l || !roof.is_empty() {
        if roof.is_empty() {
            push(&mut out, 2, String::new(), vec![term(D, 1.2), term(L, 1.6)], vec![ref_basic()], vec![]);
        } else {
            for &c in &roof {
                let mut t = vec![term(D, 1.2)];
                if p.l {
                    t.push(term(L, 1.6));
                }
                t.push(term(c, 0.5));
                let mut refs = vec![ref_basic()];
                let mut notes = vec![];
                if c == S {
                    refs.push(ref_exc2());
                    notes.push(snow_note());
                }
                push(&mut out, 2, format!("-{}", c.name()), t, refs, notes);
            }
        }
    }

    for &c in &roof {
        if p.l {
            push(&mut out, 3, format!("-{}-L", c.name()), vec![term(D, 1.2), term(c, 1.6), term(L, l_comp)], vec![ref_basic(), ref_exc1()], vec![exc_note.clone()]);
        }
        if p.w {
            push(&mut out, 3, format!("-{}-W", c.name()), vec![term(D, 1.2), term(c, 1.6), term(W, 0.5)], vec![ref_basic()], vec![]);
        }
        if !p.l && !p.w {
            push(&mut out, 3, format!("-{}", c.name()), vec![term(D, 1.2), term(c, 1.6)], vec![ref_basic()], vec![]);
        }
    }

    if p.w {
        let mut base = vec![term(D, 1.2), term(W, 1.0)];
        if p.l {
            base.push(term(L, l_comp));
        }
        let notes: Vec<Note> = if p.l { vec![exc_note.clone()] } else { vec![] };
        if roof.is_empty() {
            push(&mut out, 4, String::new(), base, vec![ref_basic(), ref_exc1()], notes);
        } else {
            for &c in &roof {
                let mut t = base.clone();
                t.push(term(c, 0.5));
                let mut refs = vec![ref_basic(), ref_exc1()];
                let mut ns = notes.clone();
                if c == S {
                    refs.push(ref_exc2());
                    ns.push(snow_note());
                }
                push(&mut out, 4, format!("-{}", c.name()), t, refs, ns);
            }
        }
    }

    if p.e {
        let sc = i.seismic_companions.as_ref();
        let l_e = l_comp.max(sc.and_then(|s| s.f1).unwrap_or(0.0));
        let s_e = 0.2f64.max(sc.and_then(|s| s.f2).unwrap_or(0.0));
        let raised = (p.l && l_e > l_comp) || (p.s && s_e > 0.2);
        let mut t = vec![term(D, 1.2), term(E, 1.0)];
        if p.l {
            t.push(term(L, l_e));
        }
        if p.s {
            t.push(term(S, s_e));
        }
        let mut refs = vec![ref_basic(), ref_exc1()];
        if p.s {
            refs.push(ref_exc2());
        }
        if sc.is_some() {
            refs.push(cref("inpres-cirsoc-103-i", "2018", "3.7.1", "combinación de acciones con sismo [3.16]"));
        }
        let mut notes = vec![];
        if p.l {
            notes.push(exc_note.clone());
        }
        if p.s {
            notes.push(snow_note());
        }
        if raised {
            notes.push(note_with("loads.cirsoc101.note.seismicCompanions", json!({ "l": l_e, "s": s_e })));
        }
        push(&mut out, 5, String::new(), t, refs, notes);
    }

    if p.w {
        push(&mut out, 6, String::new(), vec![term(D, 0.9), term(W, 1.0)], vec![ref_basic()], vec![]);
    }
    if p.e {
        push(&mut out, 7, String::new(), vec![term(D, 0.9), term(E, 1.0)], vec![ref_basic()], vec![]);
    }
    // With H and neither W nor E, 6 and 7 with their principal load not acting are 0,9 D + H: the
    // check where the dead load resists the earth pressure (a retaining wall). Nothing else in the
    // set reaches it, since every other combination has D at 1,2 or 1,4.
    if p.h && !p.w && !p.e {
        let refs = vec![ref_basic(), cref("cirsoc-101", "2025", "2.3.2", "efectos de cargas que no estén actuando")];
        let notes = vec![note_with("loads.cirsoc101.note.notActing", json!({ "loads": "W, E" }))];
        push(&mut out, 6, "-noWE".to_string(), vec![term(D, 0.9)], refs, notes);
    }

    // §2.3.2: the effects of one or more loads not acting.
    if i.not_acting.unwrap_or(true) {
        let mut seen: HashSet<Vec<(&'static str, i64)>> = out.iter().map(|c| term_key(&c.terms)).collect();
        let printed = out.len();
        for k in 0..printed {
            let c = out[k].clone();
            let prin = principal(c.basic.unwrap_or(0));
            if prin.is_empty() {
                continue;
            }
            // With H in it, the principal load is droppable too: 1,2 D + 1,6 H is not between
            // 1,4 D and a printed combination when D and H act in opposite senses (LOADS.md).
            let with_h = c.terms.iter().any(|t| t.symbol == H && t.factor != 0.0);
            let companions: Vec<LoadSymbol> = c
                .terms
                .iter()
                .filter(|t| is_companion(t.symbol) && (with_h || !prin.contains(&t.symbol)) && t.factor != 0.0)
                .map(|t| t.symbol)
                .collect();
            if !c.terms.iter().any(|t| prin.contains(&t.symbol)) {
                continue;
            }
            for mask in 1u32..(1u32 << companions.len()) {
                let drop: Vec<LoadSymbol> =
                    companions.iter().enumerate().filter(|(i, _)| mask & (1 << i) != 0).map(|(_, s)| *s).collect();
                let terms: Vec<CombinationTerm> = c.terms.iter().filter(|t| !drop.contains(&t.symbol)).copied().collect();
                let key = term_key(&terms);
                if !seen.insert(key) {
                    continue;
                }
                let names: Vec<&str> = drop.iter().map(|s| s.name()).collect();
                let mut refs = c.refs.clone();
                refs.push(cref("cirsoc-101", "2025", "2.3.2", "efectos de cargas que no estén actuando"));
                let mut notes = c.notes.clone();
                notes.push(note_with("loads.cirsoc101.note.notActing", json!({ "loads": names.join(", ") })));
                out.push(Combination { id: format!("{}-no{}", c.id, names.join("")), basic: c.basic, terms, refs, notes });
            }
        }
    }

    // §2.3.4: T.
    if p.t {
        let r = cref("cirsoc-101", "2025", "2.3.4", "cargas de coacción T");
        let n = note("loads.cirsoc101.note.tCommentary");
        let mut t1 = vec![term(D, 1.2), term(T, 1.2)];
        if p.l {
            t1.push(term(L, 0.5));
        }
        out.push(Combination { id: "T1".into(), basic: None, terms: t1, refs: vec![r.clone()], notes: vec![n.clone()] });
        if p.l {
            out.push(Combination {
                id: "T2".into(),
                basic: None,
                terms: vec![term(D, 1.2), term(L, 1.6), term(T, 1.0)],
                refs: vec![r],
                notes: vec![n],
            });
        }
    }
    out
}

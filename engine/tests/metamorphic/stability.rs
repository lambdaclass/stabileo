use crate::case::{Case2, Case3};
use crate::corpus::{self, Model, Tier};
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::{Iso2, Iso3};
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::solver::stability::{self, analyze_dense, DofKind, DofTag, Reason, Stability, Verdict};

const CONSTRAINTS_UNMIRRORED: &str = "connectors and constraints have no mirror rule yet";
const SINGLE_TRANSLATION_CONSTRAINT: &str = "constraint on a single translation that leaves the axes";
const PARTIAL_ROTATION_SUPPORT: &str = "support restraining some rotations, rotated off the axes";

const UNSUPPORTED: &[(&str, &str, &str)] = &[
    ("issue-993", "rotation", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-993", "mirror", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-994", "rotation", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-994", "mirror", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-1028", "rotation", "anisotropic translational springs on a rigid support type"),
    ("issue-1028", "mirror", "anisotropic translational springs on a rigid support type"),
    ("issue-1106", "rotation", PARTIAL_ROTATION_SUPPORT),
    ("issue-1106", "mirror", CONSTRAINTS_UNMIRRORED),
    ("issue-1118", "rotation", PARTIAL_ROTATION_SUPPORT),
    ("issue-1118", "mirror", "nodal bimoment"),
    ("issue-1265", "rotation", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-1265", "mirror", SINGLE_TRANSLATION_CONSTRAINT),
    ("issue-1355", "rotation", PARTIAL_ROTATION_SUPPORT),
    ("issue-1357", "rotation", "support restraining two translations, rotated off the axes"),
    ("collinear rigid link", "mirror", CONSTRAINTS_UNMIRRORED),
    ("offset rigid link", "mirror", CONSTRAINTS_UNMIRRORED),
    ("rigid link offset by 9e-9 of its length", "mirror", CONSTRAINTS_UNMIRRORED),
];

fn kind(what: &str) -> &str {
    what.trim_end_matches(|c: char| c.is_ascii_digit()).trim_end()
}

fn unsupported(name: &str, what: &str, error: &str) -> bool {
    UNSUPPORTED.iter().any(|&(n, k, reason)| n == name && k == kind(what) && error.contains(reason))
}

const UNITS: [(f64, f64); 4] = [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448), (1e3, 1e3)];

const SAME_MODEL: &[(u32, u32)] = &[(965, 964), (968, 964), (1041, 1029), (1352, 1351)];

fn fixture(issue: u32) -> u32 {
    SAME_MODEL.iter().find(|&&(i, _)| i == issue).map_or(issue, |&(_, f)| f)
}

fn c08() -> Vec<(String, Model)> {
    corpus::load_dir(&corpus::root().join("metamorphic_corpus").join("stability"), |_| true)
}

fn transforms_2d(c: &Case2, seed: u64) -> Vec<(String, Result<Case2, String>)> {
    let mut rng = Rng::new(seed);
    let mut out: Vec<(String, Result<Case2, String>)> = UNITS.iter().map(|&(l, f)| (format!("units {l}/{f}"), Ok(c.units(&Units::froude(l, f))))).collect();
    for k in 0..3 {
        let iso = Iso2::rotation(rng.range(0.1, 6.2)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
        out.push((format!("rotation {k}"), c.iso(&iso)));
        let iso = Iso2::rotation(std::f64::consts::FRAC_PI_2 * (1 + k) as f64);
        out.push((format!("quarter turn {k}"), c.iso(&iso)));
        let iso = Iso2::mirror_line(rng.range(0.0, 3.1)).translated(rng.range(-50.0, 50.0), rng.range(-50.0, 50.0));
        out.push((format!("mirror {k}"), c.iso(&iso)));
    }
    out.push(("mirror x".into(), c.iso(&Iso2::mirror_x())));
    for k in 0..4 { out.push((format!("relabel {k}"), Ok(c.relabel(&Relabel::random_2d(&c.s, seed + k), seed + k)))); }
    out
}

fn transforms_3d(c: &Case3, seed: u64) -> Vec<(String, Result<Case3, String>)> {
    let mut rng = Rng::new(seed);
    let mut out: Vec<(String, Result<Case3, String>)> = UNITS.iter().map(|&(l, f)| (format!("units {l}/{f}"), Ok(c.units(&Units::froude(l, f))))).collect();
    for k in 0..3 {
        let iso = Iso3::random(&mut rng).translated([rng.range(-50.0, 50.0), rng.range(-50.0, 50.0), rng.range(-50.0, 50.0)]);
        out.push((format!("rotation {k}"), c.iso(&iso)));
        out.push((format!("axis permutation {k}"), c.iso(&Iso3::axis_permutation(3 + 5 * k))));
        out.push((format!("mirror {k}"), c.mirror(k, [rng.range(-50.0, 50.0), 0.0, 0.0])));
    }
    for k in 0..4 { out.push((format!("relabel {k}"), Ok(c.relabel(&Relabel::random_3d(&c.s, seed + k), seed + k)))); }
    out
}

type Image = Result<Result<Stability, String>, String>;

fn verdicts(name: &str, m: &Model) -> (Result<Stability, String>, Vec<(String, Image)>) {
    let seed = name.bytes().fold(20261108u64, |h, b| h.wrapping_mul(31).wrapping_add(b as u64));
    match m {
        Model::D2(s) => {
            let c = Case2::new(name, s.clone());
            (stability::of_2d(&c.s), transforms_2d(&c, seed).into_iter().map(|(w, t)| (w, t.map(|t| stability::of_2d(&t.s)))).collect())
        }
        Model::D3(s) => {
            let c = Case3::new(name, s.clone());
            (stability::of_3d(&c.s), transforms_3d(&c, seed).into_iter().map(|(w, t)| (w, t.map(|t| stability::of_3d(&t.s)))).collect())
        }
    }
}

fn summary(r: &Result<Stability, String>) -> String {
    match r {
        Ok(s) => format!("{:?} κ {:.3e} A {:.3e} free {}", s.verdict, s.kappa, s.anisotropy, s.free.len()),
        Err(e) => format!("error {e}"),
    }
}

fn same(a: &Stability, b: &Stability) -> Result<(), String> {
    if a.verdict != b.verdict {
        return Err(format!("{:?} vs {:?}", a.verdict, b.verdict));
    }
    if a.free.len() != b.free.len() {
        return Err(format!("{} vs {} free directions", a.free.len(), b.free.len()));
    }
    if a.verdict == Verdict::Stable {
        let n = a.free.len().max(8) as f64;
        let tol = (1e-6f64).max(64.0 * n * f64::EPSILON * a.kappa * a.anisotropy);
        if (a.kappa - b.kappa).abs() > tol * a.kappa {
            return Err(format!("κ {:.6e} vs {:.6e}", a.kappa, b.kappa));
        }
    }
    Ok(())
}

#[test]
fn the_stability_verdict_of_every_c08_reproducer_survives_units_rotation_mirror_and_relabelling() {
    let models = c08();
    assert_eq!(models.len() + SAME_MODEL.len(), C08.len(), "the C08 reproducers");
    let mut failures = Vec::new();
    let mut skipped = std::collections::BTreeSet::new();
    let mut compared = 0;
    for (name, m) in &models {
        let (base, others) = verdicts(name, m);
        let base = base.unwrap_or_else(|e| panic!("{name}: {e}"));
        let mut kinds = std::collections::BTreeSet::new();
        for (what, other) in others {
            match other {
                Ok(Ok(o)) => {
                    compared += 1;
                    kinds.insert(kind(&what).to_string());
                    if let Err(e) = same(&base, &o) { failures.push(format!("{name} {what}: {e}")) }
                }
                Ok(Err(e)) => failures.push(format!("{name} {what}: {e}")),
                Err(e) if unsupported(name, &what, &e) => { skipped.insert((name.clone(), kind(&what).to_string())); }
                Err(e) => failures.push(format!("{name} {what} could not be built: {e}")),
            }
        }
        for &(_, k, _) in UNSUPPORTED.iter().filter(|&&(n, _, _)| n == name) {
            if kinds.contains(k) || !skipped.contains(&(name.clone(), k.to_string())) { failures.push(format!("{name} {k} is listed unsupported but was built or never refused as such")); }
        }
    }
    assert!(failures.is_empty(), "{} verdicts changed or missing:\n{}", failures.len(), failures.join("\n"));
    assert!(compared >= models.len() * 15, "{compared} images compared");
}

const REFUSED: &[u32] = &[964, 965, 966, 967, 968, 973, 993, 1008, 1028, 1029, 1041, 1083, 1091, 1095, 1103, 1112, 1115, 1353, 1355, 1357, 1359, 1362, 1648, 1651, 1653];
const SOLVED: &[u32] = &[954, 956, 960, 994, 1086, 1097, 1101, 1102, 1116, 1117, 1118, 1216, 1265];
const STABLE_PENDING: &[u32] = &[972, 1099, 1647];
const CONSERVATIVE: &[u32] = &[1090, 1106, 1193, 1351, 1352, 1635];

const C08: &[(u32, u64, &str, &str)] = &[
    (954, 20757, "linear (PCG)", "relabel"), (956, 20757, "linear (sparse path)", "energy"), (960, 2026103105180, "harmonic", "units"),
    (964, 2026103102530, "SSI (no soil springs)", "units"), (965, 2026103102530, "creep & shrinkage (t = t0)", "units"), (966, 2026103102530, "buckling", "mirror"),
    (967, 2026103100170, "contact (no gaps)", "units"), (968, 2026103102530, "staged (one stage)", "mirror"), (972, 2026103105091, "P-Delta", "units"),
    (973, 2026103101692, "modal", "units"), (993, 20758, "linear (sparse path)", "units"), (994, 20758, "harmonic", "units"),
    (1008, 2026110100526, "corotational", "rotation"), (1028, 20758, "cable solver", "units"), (1029, 2026110104392, "Winkler (no foundation)", "mirror"),
    (1041, 2026110104392, "time history", "mirror"), (1083, 2026110200810, "harmonic", "units"), (1086, 20759, "SSI (no soil springs)", "units"),
    (1090, 20759, "material nonlinear", "reversal"), (1091, 2026110202452, "staged (loads in two stages)", "rotation"), (1095, 20759, "modal", "mirror"),
    (1097, 20759, "buckling", "mirror"), (1099, 20759, "linear (sparse path)", "superposition"), (1101, 2026110202817, "harmonic", "units"),
    (1102, 20759, "time history", "units"), (1103, 20759, "creep & shrinkage (t = t0)", "rotation"), (1106, 20759, "linear", "reversal"),
    (1112, 2026110201488, "fiber nonlinear", "units"), (1115, 2026110202157, "harmonic", "units"), (1116, 20759, "certified modal", "units"),
    (1117, 2026110201645, "harmonic", "rotation"), (1118, 20759, "time history", "units"), (1193, 2026110202227, "SSI (no soil springs)", "units"),
    (1216, 2026110204962, "harmonic", "rotation"), (1265, 20760, "harmonic", "units"), (1351, 2026110405909, "modal", "rotation"),
    (1352, 2026110405909, "time history (ground motion)", "units"), (1353, 2026110403211, "linear", "rotation"), (1355, 2026110400077, "linear (PCG)", "units"),
    (1357, 2026110400539, "time history (ground motion)", "rotation"), (1359, 2026110400150, "creep & shrinkage (t = t0)", "rotation"), (1362, 2026110406180, "certified modal", "mirror"),
    (1635, 2026110706825, "modal", "reversal"), (1647, 2026110707396, "P-Delta", "planes"), (1648, 20764, "buckling", "planes"),
    (1651, 2026110700946, "linear", "planes"), (1653, 2026110705916, "P-Delta", "planes"),
];

fn replay(issue: u32) -> (Stability, crate::tally::Cell) {
    let &(_, seed, analysis, relation) = C08.iter().find(|c| c.0 == issue).unwrap();
    let text = std::fs::read_to_string(corpus::root().join("metamorphic_corpus").join("stability").join(format!("issue-{}.json", fixture(issue)))).unwrap();
    let meta: serde_json::Value = serde_json::from_str(&text).unwrap();
    let dens: Option<std::collections::HashMap<String, f64>> = meta.get("_nightly_dens").map(|d| serde_json::from_value(d.clone()).unwrap());
    let t = crate::tally::Tally::default();
    let name = format!("issue-{issue}");
    let verdict = match corpus::parse(&text).unwrap() {
        Model::D2(s) => {
            let mut c = Case2::new(name, s);
            if let Some(d) = dens { c.dens = d; }
            let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| a.name == analysis).collect();
            crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &[relation]);
            stability::of_2d(&c.s)
        }
        Model::D3(s) => {
            let mut c = Case3::new(name, s);
            if let Some(d) = dens { c.dens = d; }
            let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| a.name == analysis).collect();
            crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &[relation]);
            stability::of_3d(&c.s)
        }
    };
    let cell = t.cells.lock().unwrap().get(&(analysis.to_string(), relation.to_string())).cloned().unwrap_or_else(|| panic!("#{issue}: {analysis} × {relation} not run"));
    (verdict.unwrap(), cell)
}

#[test]
fn every_c08_reproducer_is_either_solved_identically_or_refused_by_the_verdict() {
    let listed: std::collections::BTreeSet<u32> = REFUSED.iter().chain(SOLVED).chain(STABLE_PENDING).chain(CONSERVATIVE).copied().collect();
    assert_eq!(listed, C08.iter().map(|c| c.0).collect(), "every C08 issue is classified once");
    let mut wrong = Vec::new();
    for &issue in REFUSED {
        let (v, _) = replay(issue);
        if v.is_stable() || v.refusal().is_none() { wrong.push(format!("#{issue} listed refused: {}", summary(&Ok(v)))); }
    }
    for &issue in SOLVED {
        let (v, cell) = replay(issue);
        if !v.is_stable() || !cell.fails.is_empty() || cell.pass == 0 { wrong.push(format!("#{issue} listed solved: {} {cell:?}", summary(&Ok(v)))); }
    }
    for &issue in CONSERVATIVE {
        let (v, _) = replay(issue);
        if v.reason != Reason::CoupledSoftDirection { wrong.push(format!("#{issue} listed conservatively refused: {} {:?}", summary(&Ok(v.clone())), v.reason)); }
    }
    for &issue in STABLE_PENDING {
        let (v, _) = replay(issue);
        if !v.is_stable() { wrong.push(format!("#{issue} listed stable: {} {:?}", summary(&Ok(v.clone())), v.reason)); }
    }
    assert!(wrong.is_empty(), "{}", wrong.join("\n"));
}

#[test]
fn no_model_of_the_example_and_feature_corpus_is_refused() {
    let mut refused = Vec::new();
    for c in corpus::cases_2d(Tier::Nightly, 0).into_iter().filter(|c| !c.name.starts_with("fuzz_")) {
        let r = stability::of_2d(&c.s);
        if !r.as_ref().is_ok_and(|s| s.is_stable()) { refused.push(format!("{}: {}", c.name, summary(&r))); }
    }
    for c in corpus::cases_3d(Tier::Nightly, 0).into_iter().filter(|c| !c.name.starts_with("fuzz_")) {
        let r = stability::of_3d(&c.s);
        if !r.as_ref().is_ok_and(|s| s.is_stable()) { refused.push(format!("{}: {}", c.name, summary(&r))); }
    }
    assert!(refused.is_empty(), "{}", refused.join("\n"));
}

#[test]
fn every_random_model_the_verdict_refuses_is_refused_by_the_linear_solve() {
    let mut solved = Vec::new();
    for c in corpus::cases_2d(Tier::Nightly, 0).into_iter().filter(|c| c.name.starts_with("fuzz_")) {
        if stability::of_2d(&c.s).is_ok_and(|s| s.is_stable()) { continue; }
        if dedaliano_engine::solver::linear::solve_2d(&c.s).is_ok() { solved.push(c.name.clone()); }
    }
    for c in corpus::cases_3d(Tier::Nightly, 0).into_iter().filter(|c| c.name.starts_with("fuzz_")) {
        if stability::of_3d(&c.s).is_ok_and(|s| s.is_stable()) { continue; }
        if dedaliano_engine::solver::linear::solve_3d(&c.s).is_ok() { solved.push(c.name.clone()); }
    }
    assert_eq!(solved, Vec::<String>::new());
}

fn t(node: usize, kind: DofKind) -> DofTag { DofTag { node, kind } }

#[test]
fn a_spring_pair_is_stable_and_a_free_pair_is_singular() {
    let k = [2.0, -1.0, -1.0, 2.0];
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Translation)];
    let s = analyze_dense(&k, 2, &tags);
    assert_eq!(s.verdict, Verdict::Stable);
    assert!((s.kappa - 3.0).abs() < 1e-9, "{}", s.kappa);
    assert_eq!(analyze_dense(&[1.0, -1.0, -1.0, 1.0], 2, &tags).verdict, Verdict::Singular);
}

#[test]
fn a_rotation_nothing_stiffens_is_a_free_rotation_not_a_mechanism() {
    let s = analyze_dense(&[3.0, 0.0, 0.0, 0.0], 2, &[t(1, DofKind::Translation), t(1, DofKind::Rotation)]);
    assert_eq!(s.verdict, Verdict::Stable);
    assert_eq!(s.free_rotations().count(), 1);
}

#[test]
fn the_scaled_spectrum_ignores_a_change_of_units() {
    let k = [2.0, -1.0, 0.5, -1.0, 2.0, 0.0, 0.5, 0.0, 1.0];
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Translation), t(2, DofKind::Rotation)];
    let base = analyze_dense(&k, 3, &tags);
    let d = [1e3, 1e3, 1e-4];
    let ks: Vec<f64> = (0..9).map(|i| k[i] * d[i / 3] * d[i % 3]).collect();
    let other = analyze_dense(&ks, 3, &tags);
    assert_eq!(base.verdict, other.verdict);
    assert!((base.kappa - other.kappa).abs() <= 1e-9 * base.kappa, "{} vs {}", base.kappa, other.kappa);
}

#[test]
fn a_node_stiff_along_one_axis_only_is_a_mechanism_across_it_in_every_orientation() {
    for angle in [0.0f64, 0.3, 1.1, 2.0] {
        let (c, s) = (angle.cos(), angle.sin());
        let r = analyze_dense(&[c * c, c * s, c * s, s * s], 2, &[t(1, DofKind::Translation), t(1, DofKind::Translation)]);
        assert_eq!(r.verdict, Verdict::Mechanism, "{angle}");
    }
}

fn invariant_verdict(name: &str, m: Model) -> Stability {
    let (base, others) = verdicts(name, &m);
    let base = base.unwrap();
    let listed = UNSUPPORTED.iter().filter(|&&(n, _, _)| n == name).count();
    let mut skipped = 0;
    for (what, o) in others {
        let o = match o {
            Err(e) if unsupported(name, &what, &e) => { skipped += 1; continue }
            o => o.unwrap_or_else(|e| panic!("{name} {what} could not be built: {e}")).unwrap_or_else(|e| panic!("{name} {what}: {e}")),
        };
        if let Err(e) = same(&base, &o) { panic!("{name} {what}: {e}"); }
    }
    assert_eq!(skipped > 0, listed > 0, "{name}: listed unsupported {listed}, skipped {skipped}");
    base
}

fn invariant_or_conservatively_refused(name: &str, m: Model) -> Stability {
    let (base, images) = verdicts(name, &m);
    let base = base.unwrap();
    for (what, image) in images {
        let s = match image {
            Err(e) if unsupported(name, &what, &e) => continue,
            image => image.unwrap_or_else(|e| panic!("{name} {what} could not be built: {e}")).unwrap_or_else(|e| panic!("{name} {what}: {e}")),
        };
        let conservative = s.verdict == Verdict::Singular && matches!(s.reason, Reason::CoupledSoftDirection | Reason::SwingAtRounding);
        assert!(conservative || same(&base, &s).is_ok(), "{name} {what}: {s:?}");
    }
    base
}

fn d2(v: serde_json::Value) -> Model { Model::D2(serde_json::from_value(v).unwrap()) }

fn d3(v: serde_json::Value) -> Model { Model::D3(serde_json::from_value(v).unwrap()) }

fn frame_2d(elements: serde_json::Value, supports: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 3.0, "z": 2.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": elements, "supports": supports, "loads": []
    })
}

#[test]
fn stable_frames_soft_springs_and_anisotropic_members_stay_stable_in_every_frame() {
    let fixed = serde_json::json!({"1": {"id": 1, "nodeId": 1, "type": "fixed"}});
    let bent = serde_json::json!({
        "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
        "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
    });
    assert!(invariant_verdict("bent cantilever", d2(frame_2d(bent.clone(), fixed.clone()))).is_stable());
    let soft = serde_json::json!({"1": {"id": 1, "nodeId": 1, "type": "spring", "kx": 1.0, "ky": 1.0, "kz": 1e-2}});
    let s = invariant_verdict("bent frame on soft springs", d2(frame_2d(bent.clone(), soft)));
    assert!(s.is_stable(), "{s:?}");
    let softest = serde_json::json!({"1": {"id": 1, "nodeId": 1, "type": "spring", "kx": 1e-3, "ky": 1e-3, "kz": 1e-3}});
    let s = invariant_verdict("bent frame on springs a million times softer than its members", d2(frame_2d(bent, softest)));
    assert!(s.verdict == Verdict::Singular && s.kappa * s.anisotropy > stability::RESOLVABLE, "{s:?}");
    let hinged = serde_json::json!({
        "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeEnd": true},
        "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": true},
        "3": {"id": 3, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1}
    });
    let two_pins = serde_json::json!({"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "3": {"id": 3, "nodeId": 3, "type": "pinned"}});
    let s = invariant_verdict("frame hinged at a node", d2(frame_2d(hinged, two_pins)));
    assert!(s.is_stable() && s.free_rotations().count() == 1, "{s:?}");
    let anisotropic = serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 1.0, "z": 0.5}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-8, "j": 1e-9}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": []
    });
    assert!(invariant_verdict("anisotropic 3D cantilever", d3(anisotropic)).is_stable());
}

#[test]
fn mechanisms_are_refused_in_every_frame() {
    let pendulum = serde_json::json!({"1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}});
    let pin = serde_json::json!({"1": {"id": 1, "nodeId": 1, "type": "pinned"}});
    assert_eq!(invariant_verdict("pendulum", d2(frame_2d(pendulum, pin.clone()))).verdict, Verdict::Mechanism);
    let pinned_bent = serde_json::json!({
        "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
        "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
    });
    assert!(!invariant_verdict("bent frame on one pin", d2(frame_2d(pinned_bent, pin))).is_stable());
    let rollers = serde_json::json!({
        "1": {"id": 1, "nodeId": 1, "type": "inclinedRoller", "angle": 0.4},
        "3": {"id": 3, "nodeId": 3, "type": "inclinedRoller", "angle": 0.4}
    });
    let bent = serde_json::json!({
        "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
        "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
    });
    assert!(!invariant_verdict("parallel inclined rollers", d2(frame_2d(bent, rollers))).is_stable());
}

fn threshold_pair(eta: f64) -> Stability {
    let c = 1e-3 * eta.sqrt();
    let k = [eta, 0.0, c, 0.0, 1.0, 0.0, c, 0.0, 1.0];
    analyze_dense(&k, 3, &[t(1, DofKind::Translation), t(1, DofKind::Translation), t(2, DofKind::Translation)])
}

#[test]
fn a_model_just_past_the_resolvable_product_is_singular_and_one_just_short_is_stable() {
    let kappa = 1.001 / 0.999;
    let past = threshold_pair(kappa / (stability::RESOLVABLE * (1.0 + 1e-4)));
    assert_eq!(past.verdict, Verdict::Singular, "{past:?}");
    let short = threshold_pair(kappa / (stability::RESOLVABLE * (1.0 - 1e-4)));
    assert_eq!(short.verdict, Verdict::Stable, "{short:?}");
    assert!((short.kappa - kappa).abs() < 1e-9, "{}", short.kappa);
}

#[test]
fn a_soft_node_is_judged_by_its_own_stiffness_not_by_a_stiffer_node_elsewhere() {
    let s = analyze_dense(&[1.0, 0.0, 0.0, 1e-13], 2, &[t(1, DofKind::Translation), t(2, DofKind::Translation)]);
    assert_eq!(s.verdict, Verdict::Stable, "{s:?}");
    assert!(s.free.is_empty());
}

#[test]
fn a_free_master_rotation_that_swings_a_rigid_link_slave_is_a_mechanism_in_every_frame() {
    let pendulum = serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "z": 1.0}, "3": {"id": 3, "x": -3.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": true}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "3": {"id": 3, "nodeId": 3, "type": "fixed"}},
        "constraints": [{"type": "rigidLink", "masterNode": 1, "slaveNode": 2, "dofs": []}],
        "loads": []
    });
    assert_eq!(invariant_verdict("rigid-link pendulum", d2(pendulum)).verdict, Verdict::Mechanism);
}

#[test]
fn a_spin_about_a_collinear_rigid_link_is_a_free_rotation_and_any_offset_one_is_refused_in_every_frame() {
    let model = |slave: [f64; 3]| serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": slave[0], "y": slave[1], "z": slave[2]}, "3": {"id": 3, "x": -3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 3, "nodeJ": 1, "materialId": 1, "sectionId": 1, "releaseTEnd": true}},
        "supports": {"3": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "constraints": [{"type": "rigidLink", "masterNode": 1, "slaveNode": 2, "dofs": []}],
        "loads": []
    });
    let s = invariant_or_conservatively_refused("collinear rigid link", d3(model([2.0, 0.0, 0.0])));
    assert!(s.is_stable() && s.free_rotations().filter(|f| f.node == 1).count() == 1, "{s:?}");
    assert_eq!(invariant_verdict("offset rigid link", d3(model([2.0, 1.0, 0.0]))).verdict, Verdict::Mechanism);
    let name = "rigid link offset by 9e-9 of its length";
    let (base, images) = verdicts(name, &d3(model([1.0, 9e-9, 0.0])));
    let mut all = vec![("base".to_string(), base.unwrap())];
    for (what, image) in images {
        match image {
            Err(e) if unsupported(name, &what, &e) => {}
            image => all.push((what.clone(), image.unwrap_or_else(|e| panic!("{what} could not be built: {e}")).unwrap())),
        }
    }
    for (what, s) in all {
        assert_eq!(s.verdict, Verdict::Mechanism, "{what}: {s:?}");
    }
}

#[test]
fn a_soft_rotation_coupled_into_a_translation_is_not_dropped_as_free() {
    let a = 2f64.powi(-24);
    let k = [1.0, 0.0, -a, 0.0, 1.0, 0.0, -a, 0.0, a * a];
    let s = analyze_dense(&k, 3, &[t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)]);
    assert!(!s.is_stable(), "{s:?}");
}

fn coupled_identity(order: &[usize]) -> Stability {
    let m = order.len();
    let mut k = vec![0.0; m * m];
    for i in 0..m { k[i * m + i] = 1.0; }
    let (a, b) = (order[0], order[101]);
    k[a * m + b] = -0.5;
    k[b * m + a] = -0.5;
    analyze_dense(&k, m, &(0..m).map(|i| t(i, DofKind::Translation)).collect::<Vec<_>>())
}

#[test]
fn a_mode_with_equal_components_on_its_two_coupled_dofs_certifies_in_any_numbering() {
    let m = stability::DENSE_SPECTRUM + 1;
    let identity: Vec<usize> = (0..m).collect();
    let reversed: Vec<usize> = (0..m).rev().collect();
    let shuffled: Vec<usize> = (0..m).map(|i| (i * 37 + 11) % m).collect();
    for order in [identity, reversed, shuffled] {
        let s = coupled_identity(&order);
        assert_eq!(s.verdict, Verdict::Stable, "{s:?}");
        assert!(s.kappa >= 3.0 && s.kappa <= 3.0 * (1.0 + 3e-3), "{}", s.kappa);
    }
}

fn degenerate_free_rotations_coupled(angle: f64) -> Stability {
    let (c, s) = (angle.cos(), angle.sin());
    let coupling = [8e-11 * (c + s), 8e-11 * (c - s), 0.0];
    let mut k = vec![0.0; 16];
    k[0] = 1.0;
    for (r, d) in [2e-20, 2e-20, 1.0].into_iter().enumerate() { k[(r + 1) * 4 + r + 1] = d; }
    for r in 0..3 {
        k[r + 1] = coupling[r];
        k[(r + 1) * 4] = coupling[r];
    }
    analyze_dense(&k, 4, &[t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)])
}

#[test]
fn soft_rotations_coupled_into_a_translation_get_one_verdict_whatever_basis_spans_them() {
    let axes = degenerate_free_rotations_coupled(0.0);
    let diagonal = degenerate_free_rotations_coupled(std::f64::consts::FRAC_PI_4);
    assert_eq!(axes.verdict, diagonal.verdict, "{axes:?}\n{diagonal:?}");
    assert_eq!(axes.verdict, Verdict::Singular);
}

#[test]
fn a_non_finite_stiffness_is_singular_never_stable() {
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let rotation = analyze_dense(&[bad], 1, &[t(1, DofKind::Rotation)]);
        assert_eq!(rotation.verdict, Verdict::Singular, "{bad}: {rotation:?}");
        assert!(rotation.refusal().unwrap().contains("infinite or undefined"), "{bad}");
        let beside = analyze_dense(&[2.0, 0.0, 0.0, bad], 2, &[t(1, DofKind::Translation), t(2, DofKind::Rotation)]);
        assert_eq!(beside.verdict, Verdict::Singular, "{bad}: {beside:?}");
        let coupled = analyze_dense(&[2.0, bad, bad, 1.0], 2, &[t(1, DofKind::Translation), t(1, DofKind::Rotation)]);
        assert_eq!(coupled.verdict, Verdict::Singular, "{bad}: {coupled:?}");
    }
}

#[test]
fn a_warping_stiffness_below_the_artificial_spring_gets_one_verdict_in_every_unit_system() {
    let cantilever = serde_json::json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 2e8, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-29, "cw": 1e-30}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": []
    });
    let s = invariant_verdict("cantilever whose torsion only a vanishing warping constant stiffens", d3(cantilever));
    assert_eq!((s.verdict, s.reason), (Verdict::Singular, Reason::CoupledSoftDirection), "{s:?}");
}

fn rotate_rotations(k: &[f64], n: usize, first: usize, angle: f64) -> Vec<f64> {
    let mut r = vec![0.0; n * n];
    for i in 0..n { r[i * n + i] = 1.0; }
    let (c, s) = (angle.cos(), angle.sin());
    let (a, b) = (first, first + 1);
    r[a * n + a] = c;
    r[a * n + b] = -s;
    r[b * n + a] = s;
    r[b * n + b] = c;
    let mut out = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            out[i * n + j] = (0..n).flat_map(|p| (0..n).map(move |q| (p, q))).map(|(p, q)| r[p * n + i] * k[p * n + q] * r[q * n + j]).sum();
        }
    }
    out
}

#[test]
fn a_soft_rotation_that_closes_a_mechanism_with_a_translation_is_never_dropped_as_free() {
    let k = [1.0, 0.0, -1.0, 0.0, 1e24, 0.0, -1.0, 0.0, 1.0];
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)];
    for angle in [0.0, 0.3, std::f64::consts::FRAC_PI_4, 1.2, std::f64::consts::FRAC_PI_2] {
        for scale in [1.0, 1e-6, 1e6] {
            let ks: Vec<f64> = rotate_rotations(&k, 3, 1, angle).into_iter().map(|x| x * scale).collect();
            let s = analyze_dense(&ks, 3, &tags);
            assert!(matches!(s.verdict, Verdict::Mechanism | Verdict::Singular), "{angle} {scale}: {s:?}");
        }
    }
}

#[test]
fn a_rotation_block_scaled_to_the_edge_of_the_exponent_range_keeps_its_verdict() {
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)];
    let base = analyze_dense(&[1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0], 3, &tags);
    assert!(base.is_stable() && base.free_rotations().count() == 1, "{base:?}");
    for scale in [1e-200, 1e200] {
        let k = [1.0, 0.0, 0.0, 0.0, scale, scale, 0.0, scale, scale];
        let s = analyze_dense(&k, 3, &tags);
        assert_eq!(s.verdict, base.verdict, "{scale}: {s:?}");
        assert_eq!(s.free_rotations().count(), 1, "{scale}: {s:?}");
    }
}

#[test]
fn each_refusal_states_its_own_reason() {
    let coupled = degenerate_free_rotations_coupled(0.0);
    assert_eq!(coupled.reason, Reason::CoupledSoftDirection, "{coupled:?}");
    let text = coupled.refusal().unwrap();
    assert!(text.contains("coupled") && !text.contains("exceeds"), "{text}");
    let pair = analyze_dense(&[1.0, -1.0, -1.0, 1.0], 2, &[t(1, DofKind::Translation), t(2, DofKind::Translation)]);
    assert_eq!(pair.reason, Reason::Conditioning, "{pair:?}");
    assert!(pair.refusal().unwrap().contains("exceeds"));
    let pendulum = analyze_dense(&[1.0, 0.0, 0.0, 0.0], 2, &[t(1, DofKind::Translation), t(1, DofKind::Translation)]);
    assert_eq!(pendulum.reason, Reason::FreeTranslation, "{pendulum:?}");
    assert_eq!(analyze_dense(&[f64::NAN], 1, &[t(1, DofKind::Rotation)]).reason, Reason::NonFinite);
    assert_eq!(analyze_dense(&[2.0], 1, &[t(1, DofKind::Translation)]).reason, Reason::Resolved);
}

fn every_frame(k: &[f64], n: usize, tags: &[DofTag], blocks: &[usize]) -> Vec<(String, Stability)> {
    let mut out = Vec::new();
    for angle in [0.0, 0.3, std::f64::consts::FRAC_PI_4, 1.2, std::f64::consts::FRAC_PI_2] {
        let mut turned = k.to_vec();
        for &first in blocks { turned = rotate_rotations(&turned, n, first, angle); }
        for scale in [1.0, 1e-6, 1e6] {
            let ks: Vec<f64> = turned.iter().map(|x| x * scale).collect();
            out.push((format!("angle {angle} scale {scale}"), analyze_dense(&ks, n, tags)));
        }
    }
    out
}

#[test]
fn a_rotation_stiffer_than_any_rounding_floor_does_not_hide_the_mechanism_its_soft_neighbour_closes() {
    let big = 2f64.powi(96);
    let k = [1.0, 0.0, -1.0, 0.0, big, 0.0, -1.0, 0.0, 1.0];
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)];
    for (frame, s) in every_frame(&k, 3, &tags, &[1]) {
        assert!(matches!(s.verdict, Verdict::Mechanism | Verdict::Singular), "{frame}: {s:?}");
    }
}

#[test]
fn soft_rotations_at_two_nodes_that_close_a_mechanism_together_are_not_dropped_one_node_at_a_time() {
    let (mu, delta, c) = (2f64.powi(-44), 2f64.powi(-63), 2f64.powi(-32));
    let mut k = vec![0.0; 25];
    let mut set = |i: usize, j: usize, v: f64| { k[i * 5 + j] = v; k[j * 5 + i] = v; };
    set(0, 0, 1.0);
    set(1, 1, mu);
    set(3, 3, mu);
    set(1, 3, -mu + delta);
    set(0, 1, c);
    set(0, 3, c);
    set(2, 2, 1.0);
    set(4, 4, 1.0);
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation), t(3, DofKind::Rotation), t(3, DofKind::Rotation)];
    let null = [1.0, -2f64.powi(31), 0.0, -2f64.powi(31), 0.0];
    for i in 0..5 {
        let r: f64 = (0..5).map(|j| k[i * 5 + j] * null[j]).sum();
        assert_eq!(r, 0.0, "row {i}");
    }
    for (frame, s) in every_frame(&k, 5, &tags, &[1, 3]) {
        assert!(matches!(s.verdict, Verdict::Mechanism | Verdict::Singular), "{frame}: {s:?}");
    }
}

#[test]
fn a_free_rotation_swinging_a_constrained_translation_is_a_mechanism_at_any_arm_scale() {
    let tags = [t(1, DofKind::Translation), t(2, DofKind::Rotation), t(2, DofKind::Rotation)];
    for arm in [1.0, 1e-200, 1e200] {
        for angle in [0.0, 0.3, std::f64::consts::FRAC_PI_4, 1.2] {
            for scale in [1.0, 1e-6, 1e6] {
                let k = [scale, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
                let (c, s) = (angle.cos(), angle.sin());
                let moves = vec![Vec::new(), vec![(10, arm * c)], vec![(10, arm * s), (11, arm)]];
                let r = stability::analyze_dense_constrained(&k, 3, &tags, &moves);
                assert_eq!(r.verdict, Verdict::Mechanism, "arm {arm} angle {angle} scale {scale}: {r:?}");
            }
        }
    }
}

#[test]
fn free_rotations_coupled_only_to_each_other_are_refused_even_when_nothing_else_is_kept() {
    for delta in [1e-300, 1e-16, 1.0, 1e200] {
        for swap in [false, true] {
            let (a, b) = if swap { (3, 2) } else { (2, 3) };
            let alone = analyze_dense(&[0.0, delta, delta, 0.0], 2, &[t(a, DofKind::Rotation), t(b, DofKind::Rotation)]);
            assert_eq!((alone.verdict, alone.reason), (Verdict::Singular, Reason::CoupledSoftDirection), "{delta} {swap}: {alone:?}");
            let k = [1.0, 0.0, 0.0, 0.0, 0.0, delta, 0.0, delta, 0.0];
            let beside = analyze_dense(&k, 3, &[t(1, DofKind::Translation), t(a, DofKind::Rotation), t(b, DofKind::Rotation)]);
            assert_eq!(beside.verdict, Verdict::Singular, "{delta} {swap}: {beside:?}");
        }
    }
}

fn linear_solve(issue: u32) -> Result<(), String> {
    let text = std::fs::read_to_string(corpus::root().join("metamorphic_corpus").join("stability").join(format!("issue-{}.json", fixture(issue)))).unwrap();
    match corpus::parse(&text).unwrap() {
        Model::D2(s) => dedaliano_engine::solver::linear::solve_2d(&s).map(|_| ()),
        Model::D3(s) => dedaliano_engine::solver::linear::solve_3d(&s).map(|_| ()),
    }
}

fn the_linear_solve_refuses_what_the_verdict_refuses(issue: u32) {
    let (v, cell) = replay(issue);
    let refusal = v.refusal().unwrap_or_else(|| panic!("#{issue}: the verdict is Stable"));
    assert!(cell.fails.is_empty(), "#{issue}: {cell:?}");
    let err = linear_solve(issue).expect_err("the linear solve returned a result");
    assert!(err.contains(&refusal), "#{issue}: {err}");
}

#[test]
fn issue_993_the_sparse_linear_solve_refuses_in_every_unit_system() { the_linear_solve_refuses_what_the_verdict_refuses(993) }

#[test]
fn issue_1353_the_linear_solve_refuses_in_every_orientation() { the_linear_solve_refuses_what_the_verdict_refuses(1353) }

#[test]
fn issue_1355_the_pcg_linear_solve_refuses_in_every_unit_system() { the_linear_solve_refuses_what_the_verdict_refuses(1355) }

#[test]
fn issue_1651_the_linear_solve_refuses_in_every_plane() { the_linear_solve_refuses_what_the_verdict_refuses(1651) }

#[test]
fn issue_1106_the_linear_solve_refuses_in_both_load_directions() { the_linear_solve_refuses_what_the_verdict_refuses(1106) }

fn continuous_beam(spans: usize) -> dedaliano_engine::types::SolverInput {
    let n = 10 * spans;
    let nodes: serde_json::Map<String, serde_json::Value> = (0..=n).map(|i| (i.to_string(), serde_json::json!({"id": i, "x": i as f64, "z": 0.0}))).collect();
    let elements: serde_json::Map<String, serde_json::Value> = (0..n)
        .map(|i| (i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1})))
        .collect();
    let mut supports = serde_json::Map::new();
    supports.insert("0".into(), serde_json::json!({"id": 0, "nodeId": 0, "type": "fixed"}));
    for i in (10..=n).step_by(10) {
        supports.insert(i.to_string(), serde_json::json!({"id": i, "nodeId": i, "type": "pinned"}));
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements, "supports": supports,
        "materials": {"1": {"id": 1, "e": 200e3, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "loads": [{"type": "nodal", "data": {"nodeId": n / 2 + 5, "fx": 0.0, "fz": -10.0, "my": 0.0}}]
    }))
    .unwrap()
}

/// The equal spans of a long continuous beam cluster the extreme eigenvalues of `S`, where a
/// Lanczos estimate stops short of the extreme: above 240 kept directions the certified
/// condition number must still agree with the full spectrum's, and the beam is solved.
#[test]
fn a_long_continuous_beam_is_stable_past_the_full_spectrum() {
    let dense = stability::of_2d(&continuous_beam(7)).unwrap();
    assert!(dense.is_stable(), "{:?}", dense.refusal());
    for spans in [10, 20, 40] {
        let input = continuous_beam(spans);
        let s = stability::of_2d(&input).unwrap();
        assert!(s.is_stable() && s.kappa >= dense.kappa && s.kappa < 2.0 * dense.kappa, "{spans} spans: kappa {:e} against {:e}", s.kappa, dense.kappa);
        dedaliano_engine::solver::linear::solve_2d(&input).unwrap_or_else(|e| panic!("{spans} spans: {e}"));
    }
}

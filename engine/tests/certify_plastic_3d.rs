//! Certified 3D plastic collapse load factor (docs/verification/CERTIFY.md,
//! "Plastic collapse load factor, 3D"), and the 3D event-to-event solver
//! against it.
//!
//! Closed forms are classical rigid-plastic results (independent of the LP
//! heuristic, the exact checker and the solver). Refusal tests tamper with the
//! exact candidates and with the model.

use crate::common;

use common::*;
use dedaliano_engine::certify::exact::{qi, to_f64, Q};
use dedaliano_engine::certify::plastic_3d::*;
use dedaliano_engine::solver::plastic::solve_plastic_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IY: f64 = 8.0e-6;
const IZ: f64 = 4.0e-6;
const J: f64 = 1.0e-5;
const MPY: f64 = 100.0;
const MPZ: f64 = 50.0;
const FIXED: [bool; 6] = [true; 6];

fn plastic(solver: SolverInput3D, mpy: f64, mpz: f64) -> PlasticInput3D {
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), PlasticSectionData3D { a: A, iy: IY, iz: IZ, material_id: 1, b: None, h: None, d: None });
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });
    PlasticInput3D {
        solver,
        sections,
        materials,
        max_hinges: Some(60),
        mp_overrides: Some(HashMap::from([("1".to_string(), [mpy, mpz])])),
    }
}

fn udl(e: usize, qy: f64, qz: f64) -> SolverLoad3D {
    SolverLoad3D::Distributed(SolverDistributedLoad3D {
        q_xi: 0.0,
        q_xj: 0.0,
        element_id: e,
        q_yi: qy,
        q_yj: qy,
        q_zi: qz,
        q_zj: qz,
        a: None,
        b: None,
    })
}

fn nodal(n: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None })
}

fn frame(nodes: Vec<(usize, f64, f64, f64)>, elems: Vec<(usize, usize, usize)>, sups: Vec<(usize, [bool; 6])>, loads: Vec<SolverLoad3D>) -> SolverInput3D {
    make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY, IZ, J)],
        elems.into_iter().map(|(id, i, j)| (id, "frame", i, j, 1, 1)).collect(),
        sups.into_iter().map(|(n, d)| (n, d.to_vec())).collect(),
        loads,
    )
}

fn certify(input: &PlasticInput3D) -> (PlasticCertificate3D, PlasticResult3DRef) {
    let res = solve_plastic_3d(input).unwrap();
    let c = certify_collapse_3d(input, Some(&res));
    (c, res)
}
type PlasticResult3DRef = dedaliano_engine::solver::plastic::PlasticResult3D;

/// The certified enclosure contains `exact`, is tight to `rel`, and the
/// incremental solver lands in it up to its own f64 round-off.
fn assert_encloses(label: &str, c: &PlasticCertificate3D, exact: f64, rel: f64) {
    assert!(c.certified, "{label}: not certified: {:?}", c.reason);
    let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(lo <= up, "{label}: [{lo}, {up}]");
    assert!(lo <= exact * (1.0 + 1e-15) && exact * (1.0 - 1e-15) <= up, "{label}: {exact} ∉ [{lo}, {up}]");
    assert!((up - lo) / exact <= rel, "{label}: enclosure too wide [{lo}, {up}] (rel {:e})", (up - lo) / exact);
    eprintln!(
        "{label}: λ_c = {exact} ∈ [{lo}, {up}], rel width {:.2e}, solver {:?} deviation {:?}",
        (up - lo) / exact,
        c.solver_collapse_factor,
        c.solver_deviation
    );
    let dev = c.solver_deviation.expect("solver value");
    assert!(dev < 1e-9, "{label}: solver {:?} outside [{lo}, {up}] (deviation {dev:e})", c.solver_collapse_factor);
}

#[test]
fn fixed_beam_udl_in_each_plane() {
    // λ_c = 16 Mp / (q L²) with Mp of the bending plane, whatever the
    // discretisation: the span hinge forms where the moment peaks. The old
    // solver (end hinges only) read 3.33 / 5.00 instead of 4.44 for one /
    // three elements under q_z.
    let (l, qv) = (6.0, 10.0);
    for n in [1, 2, 3, 5] {
        for (qy, qz, mp) in [(0.0, -qv, MPY), (-qv, 0.0, MPZ)] {
            let loads = (1..=n).map(|e| udl(e, qy, qz)).collect();
            let s = make_3d_beam(n, l, E, 0.3, A, IY, IZ, J, FIXED.to_vec(), Some(FIXED.to_vec()), loads);
            let inp = plastic(s, MPY, MPZ);
            let (c, res) = certify(&inp);
            let exact = 16.0 * mp / (qv * l * l);
            assert_encloses(&format!("fixed beam n={n} qy={qy} qz={qz}"), &c, exact, 1e-9);
            assert!(res.is_mechanism && res.warnings.is_empty(), "{:?}", res.warnings);
            // the last hinge is at midspan
            let last = res.hinges.last().unwrap();
            let x = (last.element_id - 1) as f64 * l / n as f64 + last.position * l / n as f64;
            assert!((x - l / 2.0).abs() < 1e-6 * l, "n={n}: last hinge at x = {x}");
            for st in &res.steps {
                assert_eq!(st.results.element_forces.len(), n);
                assert_eq!(st.results.displacements.len(), n + 1);
            }
        }
    }
}

#[test]
fn inclined_members_with_rational_axes() {
    // A fixed beam along (3, 4, 0) (L = 5) and one along Y, gravity UDL in
    // local z (vertical): 16 Mp_y/(q L²). A member along (1, 1, 1) has
    // irrational axes: a member load there is refused, a nodal load is not.
    let qv = 8.0;
    for (dx, dy) in [(3.0, 4.0), (0.0, 5.0)] {
        let s = frame(
            vec![(1, 0.0, 0.0, 0.0), (2, dx, dy, 0.0)],
            vec![(1, 1, 2)],
            vec![(1, FIXED), (2, FIXED)],
            vec![udl(1, 0.0, -qv)],
        );
        let (c, _) = certify(&plastic(s, MPY, MPZ));
        assert_encloses(&format!("beam along ({dx},{dy},0)"), &c, 16.0 * MPY / (qv * 25.0), 1e-9);
    }
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 1.0, 1.0, 1.0)], vec![(1, 1, 2)], vec![(1, FIXED), (2, FIXED)], vec![udl(1, 0.0, -qv)]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert!(!c.certified && c.reason.unwrap().contains("not rational"));
    // a cantilever along (1, 1, 1) with a tip force: base moment |F| L, the
    // circle Mp_y = Mp_z makes the axes irrelevant: λ_c = Mp/(|F| L) = Mp/(√2·√3)
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 1.0, 1.0, 1.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![nodal(2, [1.0, -1.0, 0.0, 0.0, 0.0, 0.0])]);
    let (c, _) = certify(&plastic(s, MPY, MPY));
    assert_encloses("diagonal cantilever", &c, MPY / 6f64.sqrt(), 1e-9);
}

#[test]
fn point_loads_on_members() {
    // simply supported (torsion held at one end) beam, off-centre point load
    // in local y at a = 2 of L = 6: λ_c = Mp_z L / (P a b)
    let pinned = [true, true, true, true, false, false];
    let roller = [false, true, true, false, false, false];
    let pl = SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 1, a: 2.0, py: -1.0, pz: 0.0 });
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, pinned), (2, roller)], vec![pl]);
    let (c, res) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("SS point load y", &c, MPZ * 6.0 / 8.0, 1e-12);
    assert!((res.hinges[0].position - 1.0 / 3.0).abs() < 1e-12);
    // same in local z with a UDL on top: fixed-fixed, central P and q:
    // mechanism hinges at both ends and midspan, λ (P L/2 + q L²/4)... = 4 Mp·2/L·... :
    // D = 4 Mp θ, W = λ (P θL/2 + q θL²/4) ⇒ λ = 16 Mp / (2 P L + q L²)
    let pl = SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 1, a: 3.0, py: 0.0, pz: -2.0 });
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 6.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED), (2, FIXED)], vec![pl, udl(1, 0.0, -1.0)]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("fixed beam P + q in z", &c, 16.0 * MPY / (2.0 * 2.0 * 6.0 + 36.0), 1e-9);
}

#[test]
fn biaxial_cantilever() {
    // tip force (0, −1, −1) at L = 3: base moments 3λ about both axes,
    // (3λ/30)² + (3λ/40)² = 1 ⇒ λ_c = 8 (one hinge, statically determinate)
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![nodal(2, [0.0, -1.0, -1.0, 0.0, 0.0, 0.0])]);
    let (c, res) = certify(&plastic(s, 30.0, 40.0));
    assert_encloses("biaxial cantilever", &c, 8.0, 1e-9);
    assert!((res.hinges[0].interaction_ratio - 1.0).abs() < 1e-12);
}

/// Columns 1-2 and 4-3 (height 3), beam 2-3 along X (span 4), fixed bases.
fn portal(f: [f64; 6]) -> SolverInput3D {
    frame(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 3.0), (4, 4.0, 0.0, 0.0)],
        vec![(1, 1, 2), (2, 2, 3), (3, 4, 3)],
        vec![(1, FIXED), (4, FIXED)],
        vec![nodal(2, f)],
    )
}

#[test]
fn space_portal_sway() {
    // In-plane sway (X): four hinges about Y (Mp_y of columns and beam), λ_c =
    // 4 Mp_y / (H h). Out-of-plane (Y): the frame turns about the base line
    // (the beam twists rigidly), two base hinges about X (Mp_z of the
    // columns): λ_c = 2 Mp_z / (H h). The old solver read 133.325 and 77.04
    // (the latter far above the collapse load).
    let (c, res) = certify(&plastic(portal([1.0, 0.0, 0.0, 0.0, 0.0, 0.0]), MPY, MPZ));
    assert_encloses("portal in-plane sway", &c, 4.0 * MPY / 3.0, 1e-9);
    assert!(res.is_mechanism && res.warnings.is_empty(), "{:?}", res.warnings);
    let (c, res) = certify(&plastic(portal([0.0, 1.0, 0.0, 0.0, 0.0, 0.0]), MPY, MPZ));
    assert_encloses("portal out-of-plane sway", &c, 2.0 * MPZ / 3.0, 1e-9);
    assert!(res.is_mechanism && res.warnings.is_empty(), "{:?}", res.warnings);
    // In-plane sway plus a vertical load at midspan of the beam (a point load
    // on the member): combined mechanism 6 Mp_y / (H h + V a), a = 2.
    let mut s = portal([1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    s.loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 2, a: 2.0, py: 0.0, pz: -1.0 }));
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    let exact = [4.0 * MPY / 3.0, 4.0 * MPY / 2.0, 6.0 * MPY / (3.0 + 2.0)].into_iter().fold(f64::INFINITY, f64::min);
    assert_encloses("portal sway + beam load", &c, exact, 1e-9);
}

#[test]
fn space_portal_biaxial_sway_is_a_safe_lower_bound() {
    // Both sway directions at once. The exact λ_c of the biaxial (ellipse)
    // model is the out-of-plane value 2 Mp_z / h = 33.33: the in-plane moments
    // can be carried at the knees with My = 0 at the bases. The solver's base
    // hinges form under biaxial moments and hold them, so it stops lower
    // (32.03), says so, and stays below the certified enclosure, never above.
    let (c, res) = certify(&plastic(portal([1.0, 1.0, 0.0, 0.0, 0.0, 0.0]), MPY, MPZ));
    assert!(c.certified, "{c:?}");
    let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    let exact = 2.0 * MPZ / 3.0;
    assert!(lo <= exact * (1.0 + 1e-15) && exact <= up * (1.0 + 1e-15) && (up - lo) / up < 1e-9, "[{lo}, {up}]");
    assert!(res.collapse_factor <= up && res.collapse_factor < lo, "{}", res.collapse_factor);
    assert!(res.warnings.iter().any(|w| w.contains("biaxial")), "{:?}", res.warnings);
    eprintln!("biaxial portal: solver {} vs certified [{lo}, {up}]", res.collapse_factor);
}

/// #511: renumbering the portal (nodes, elements, sections, map order)
/// changes nothing: the hand values in each plane, and the biaxial sway the
/// same factor below the certificate, whatever the numbering.
#[test]
fn space_portal_collapse_factor_does_not_depend_on_numbering() {
    use dedaliano_engine::metamorphic::relabel::Relabel;
    for (f, exact) in [
        ([1.0, 0.0, 0.0, 0.0, 0.0, 0.0], Some(4.0 * MPY / 3.0)),
        ([0.0, 1.0, 0.0, 0.0, 0.0, 0.0], Some(2.0 * MPZ / 3.0)),
        ([1.0, 1.0, 0.0, 0.0, 0.0, 0.0], None),
    ] {
        let base = solve_plastic_3d(&plastic(portal(f), MPY, MPZ)).unwrap();
        if let Some(x) = exact {
            assert!((base.collapse_factor - x).abs() <= 1e-9 * x, "{f:?}: {} vs {x}", base.collapse_factor);
        } else {
            assert!(base.collapse_factor <= 2.0 * MPZ / 3.0, "{}", base.collapse_factor);
        }
        for seed in 0..12 {
            let s = portal(f);
            let rl = Relabel::random_3d(&s, seed);
            let mut inp = plastic(rl.apply_3d(&s, seed), MPY, MPZ);
            let sec = rl.sec(1).to_string();
            inp.sections = HashMap::from([(sec.clone(), PlasticSectionData3D { a: A, iy: IY, iz: IZ, material_id: rl.mat(1), b: None, h: None, d: None })]);
            inp.materials = HashMap::from([(rl.mat(1).to_string(), PlasticMaterialData { fy: Some(250.0) })]);
            inp.mp_overrides = Some(HashMap::from([(sec, [MPY, MPZ])]));
            let r = solve_plastic_3d(&inp).unwrap();
            assert!((r.collapse_factor - base.collapse_factor).abs() <= 1e-9 * base.collapse_factor, "{f:?} seed {seed}: {} vs {}", r.collapse_factor, base.collapse_factor);
        }
    }
}

/// A point load beside a hinged member end is a real peak, not a hinge
/// drifting (the #511 fix treats span peaks within 0.1 % of a hinge as that
/// hinge): the beam, pinned at both ends (released at the start), still
/// collapses at P a (L − a) / L = Mp with a = 0.002, L = 4.
#[test]
fn point_load_beside_a_hinged_end_still_forms_its_hinge() {
    let mut s = frame(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 1, 2)],
        vec![(1, FIXED), (2, [true, true, true, true, false, false])],
        vec![SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 1, a: 0.002, py: 0.0, pz: -1.0 })],
    );
    let e = s.elements.get_mut("1").unwrap();
    (e.release_my_start, e.release_mz_start) = (true, true);
    let res = solve_plastic_3d(&plastic(s, 100.0, 100.0)).unwrap();
    let exact = 100.0 * 4.0 / (0.002 * 3.998);
    assert!((res.collapse_factor - exact).abs() <= 1e-6 * exact && res.is_mechanism, "{} vs {exact}: {:?}", res.collapse_factor, res.warnings);
}

#[test]
fn moment_sign_conventions_match_solver() {
    // cantilever along X, tip force fz = 1 and a nodal couple my = −1 adding
    // to it at the base (M_y = −3 fz + ... ): base |My| = 3 + 1 ⇒ Mp_y / 4
    let tip = nodal(2, [0.0, 0.0, 1.0, 0.0, -1.0, 0.0]);
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![tip]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("tip force + couple", &c, MPY / 4.0, 1e-12);
    // member UDL along local z adds to a tip force along +Z: q L²/2 + F L
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![nodal(2, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]), udl(1, 0.0, 1.0)]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("tip force + UDL z", &c, MPY / (8.0 + 4.0), 1e-12);
    // and along local y with a tip force along +Y
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![nodal(2, [0.0, 1.0, 0.0, 0.0, 0.0, 0.0]), udl(1, 1.0, 0.0)]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("tip force + UDL y", &c, MPZ / (8.0 + 4.0), 1e-12);
    // a torque at the tip of the cantilever does nothing to bending
    let s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)], vec![(1, 1, 2)], vec![(1, FIXED)], vec![nodal(2, [0.0, 1.0, 0.0, 7.0, 0.0, 0.0])]);
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("tip force + torque", &c, MPZ / 4.0, 1e-12);
}

#[test]
fn releases_and_trusses() {
    // A beam fixed at both ends with a moment release about local y at the
    // right end (a propped cantilever in the vertical plane) under central
    // vertical point load: λ_c = 6 Mp_y / (P L) (hinges at the fixed end and
    // under the load).
    let mut s = frame(vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0), (3, 6.0, 0.0, 0.0)], vec![(1, 1, 2), (2, 2, 3)], vec![(1, FIXED), (3, FIXED)], vec![nodal(2, [0.0, 0.0, -1.0, 0.0, 0.0, 0.0])]);
    s.elements.get_mut("2").unwrap().release_my_end = true;
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert_encloses("released end", &c, 6.0 * MPY / 6.0, 1e-12);
    // a cantilever propped by a truss tie at the tip: hinge at the base and
    // the tie never yields: unbounded? no — the tie carries the load: the
    // only collapse needs a hinge at the base and one in the tie (none), so
    // a tip force along the tie axis... keep it simple: truss diagonal braces a
    // cantilever tip, transverse tip load: λ_c from a span hinge only when
    // the load acts inside the span; here a tip load is carried by the tie:
    // the certificate must not certify a finite collapse load from bending.
    let mut s = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0), (3, 0.0, 0.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "truss", 3, 2, 1, 1)],
        vec![(1, FIXED.to_vec()), (3, FIXED.to_vec())],
        vec![udl(1, 0.0, -1.0)],
    );
    let (c, _) = certify(&plastic(s.clone(), MPY, MPZ));
    // propped cantilever (prop = tie in the vertical plane): (6 + 4√2) Mp / (q L²)
    let exact = (6.0 + 4.0 * 2f64.sqrt()) * MPY / 16.0;
    assert!(c.certified, "{c:?}");
    let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
    assert!(lo <= exact && exact <= up && (up - lo) / exact < 1e-8, "[{lo}, {up}] vs {exact}");
    assert!(c.solver_deviation.unwrap() < 1e-9, "{c:?}");
    // a transverse load on the truss member is refused
    s.loads.push(udl(2, 0.0, -1.0));
    let (c, _) = certify(&plastic(s, MPY, MPZ));
    assert!(!c.certified);
}

#[test]
fn tampered_candidates_are_refused() {
    let s = make_3d_beam(2, 6.0, E, 0.3, A, IY, IZ, J, FIXED.to_vec(), Some(FIXED.to_vec()), vec![udl(1, 0.0, -10.0), udl(2, 0.0, -10.0)]);
    let inp = plastic(s, MPY, MPZ);
    let model = build_model_3d(&inp).unwrap();
    let c = plastic_candidates_3d(&model, None).unwrap();
    let field = c.static_field.clone().unwrap();
    let mech = c.mechanism.clone().unwrap();
    assert!(check_static_3d(&model, &field).is_ok());
    assert!(check_mechanism_3d(&model, &mech).is_ok());
    let exact = 16.0 * MPY / 360.0;
    let lo = c.static_check.unwrap().lambda_lower;
    let up = c.mechanism_check.unwrap().lambda_upper;
    assert!(to_f64(&lo) <= exact * (1.0 + 1e-12) && to_f64(&up) >= exact * (1.0 - 1e-12), "{} {}", to_f64(&lo), to_f64(&up));

    // equilibrium broken by one unit
    let mut f = field.clone();
    f.elems[0][2] += qi(1);
    assert!(check_static_3d(&model, &f).unwrap_err().contains("equilibrium"));
    // a larger λ with the same forces is not in equilibrium either
    let mut f = field.clone();
    f.lambda *= qi(2);
    assert!(check_static_3d(&model, &f).is_err());
    // released end must carry no moment
    let mut m2 = model.clone();
    m2.elems[0].rel[0][1] = true;
    assert!(check_static_3d(&m2, &field).unwrap_err().contains("released"));

    // incompatible mechanism
    let mut m = mech.clone();
    m.elems[0].omegas[0][1] += qi(1);
    assert!(check_mechanism_3d(&model, &m).is_err());
    // moving a restrained DOF
    let mut m = mech.clone();
    m.nodes[0][2] = qi(1);
    assert!(check_mechanism_3d(&model, &m).unwrap_err().contains("restrained"));
    // a torsional kink at an interior hinge is not a bending hinge
    let mut m = mech.clone();
    let em = &mut m.elems[0];
    em.hinges.push(Q::new(1.into(), 3.into()));
    let last = em.omegas.last().unwrap().clone();
    em.omegas.insert(em.omegas.len() - 1, last.clone());
    let n = em.omegas.len();
    // segment rotations equal ⇒ zero kink; add a twist (about x) to the last
    // segment: d·Δω ≠ 0 (and incompatible); the checker refuses it either way
    em.omegas[n - 1][0] += qi(1);
    assert!(check_mechanism_3d(&model, &m).is_err());
    // reversing the mechanism makes the work negative
    let mut m = mech.clone();
    for n in &mut m.nodes {
        for v in n.iter_mut() {
            *v = -v.clone();
        }
    }
    for e in &mut m.elems {
        for w in &mut e.omegas {
            for v in w.iter_mut() {
                *v = -v.clone();
            }
        }
    }
    assert!(check_mechanism_3d(&model, &m).unwrap_err().contains("work"));
}

#[test]
fn unsupported_models_are_refused() {
    let base = || make_3d_beam(2, 6.0, E, 0.3, A, IY, IZ, J, FIXED.to_vec(), Some(FIXED.to_vec()), vec![udl(1, 0.0, -10.0)]);
    let reason = |s: SolverInput3D| {
        let inp = plastic(s, MPY, MPZ);
        let c = certify_collapse_3d(&inp, None);
        assert!(!c.certified);
        c.reason.unwrap()
    };
    let mut s = base();
    s.supports.get_mut("1").unwrap().kz = Some(1e3);
    assert!(reason(s).contains("spring"));
    let mut s = base();
    s.supports.get_mut("2").unwrap().dz = Some(0.01);
    assert!(reason(s).contains("prescribed"));
    let mut s = base();
    s.loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: 1, dt_uniform: 10.0, dt_gradient_y: 0.0, dt_gradient_z: 0.0, alpha: None, depth_y: None, depth_z: None }));
    assert!(reason(s).contains("thermal"));
    let mut s = base();
    s.elements.get_mut("1").unwrap().elem_type = "cable".into();
    assert!(reason(s).contains("cable"));
    let mut s = base();
    s.elements.get_mut("1").unwrap().roll_angle = Some(30.0);
    assert!(reason(s).contains("roll"));
    let mut s = base();
    s.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 2, dofs: vec![0] }));
    assert!(reason(s).contains("constraints"));
    // a cantilever loaded only axially has no bending collapse
    let s = make_3d_beam(1, 6.0, E, 0.3, A, IY, IZ, J, FIXED.to_vec(), None, vec![nodal(2, [1.0, 0.0, 0.0, 0.0, 0.0, 0.0])]);
    assert!(!certify_collapse_3d(&plastic(s, MPY, MPZ), None).certified);
    // roll angles in multiples of 90° are exact: Mp_y and Mp_z swap roles
    let mut s = base();
    for e in s.elements.values_mut() {
        e.roll_angle = Some(90.0);
    }
    let inp = plastic(s, MPY, MPZ);
    let (c, _) = certify(&inp);
    assert!(c.certified, "{c:?}");
    assert!(c.solver_deviation.unwrap() < 1e-9, "{c:?}");
}

#[test]
fn certify_plastic_3d_reports_solver_value() {
    let out = certify_plastic_3d(&plastic(portal([1.0, 0.0, 0.0, 0.0, 0.0, 0.0]), MPY, MPZ)).unwrap();
    assert!(out.certificate.certified);
    assert_eq!(out.certificate.solver_collapse_factor, Some(out.results.collapse_factor));
    assert!(!out.certificate.mechanism.is_empty());
    let json = serde_json::to_string(&out).unwrap();
    assert!(json.contains("lambdaLower") && json.contains("rotationY") && json.contains("position"));
}

// ───────────────────────── random frames vs the incremental solver ─────────────────────────

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Multi-bay, multi-storey plane frames placed in space along a plan
/// direction (1,0), (0,1), (3/5,4/5) or (−4/5, 3/5), loaded in their plane
/// (nodal loads and beam UDLs along local z), random capacities, some
/// released beam ends and pinned bases. Every hinge is uniaxial, so the
/// solver must land in the certified enclosure.
#[test]
#[ignore = "minutes at opt-level 1; nightly certify-large runs it in release"]
fn random_plane_frames_in_space_agree_with_solver() {
    let mut g = Lcg(7);
    // plan directions with rational unit vectors (coordinates stay exact)
    let dirs = [(1.0, 0.0), (0.0, 1.0), (3.0 / 5.0, 4.0 / 5.0), (-4.0 / 5.0, 3.0 / 5.0)];
    let (mut checked, mut warned, mut unloaded, mut spans) = (0, 0, 0, 0);
    for case in 0..20 {
        let (cx, cy) = dirs[case % 4];
        let bays = 1 + (g.next() * 2.0) as usize;
        let stories = 1 + (g.next() * 3.0) as usize;
        let (w, h) = (5.0 * (1.0 + (g.next() * 1.0).round()), 3.0 + (g.next() * 2.0).round());
        let mut nodes = Vec::new();
        let mut col_node = vec![vec![0; bays + 1]; stories + 1];
        for (s, row) in col_node.iter_mut().enumerate() {
            for (b, n) in row.iter_mut().enumerate() {
                // w is a multiple of 5: b w (3/5) etc. are integers
                let x = b as f64 * w;
                nodes.push((nodes.len() + 1, (x * cx * 5.0).round() / 5.0, (x * cy * 5.0).round() / 5.0, s as f64 * h));
                *n = nodes.len();
            }
        }
        let mut elems = Vec::new();
        let mut loads = Vec::new();
        for s in 0..stories {
            for b in 0..=bays {
                elems.push((elems.len() + 1, "frame", col_node[s][b], col_node[s + 1][b], 1, 1));
            }
        }
        let mut released = Vec::new();
        for s in 1..=stories {
            for b in 0..bays {
                elems.push((elems.len() + 1, "frame", col_node[s][b], col_node[s][b + 1], 1, 2));
                if g.next() < 0.5 {
                    loads.push(udl(elems.len(), 0.0, -(1.0 + (g.next() * 3.0).round())));
                } else {
                    let a = w * (1.0 + (g.next() * 3.0).round()) / 5.0;
                    loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: elems.len(), a, py: 0.0, pz: -(2.0 + (g.next() * 6.0).round()) }));
                }
                if g.next() < 0.2 {
                    released.push(elems.len());
                }
            }
            let hx = (g.next() * 3.0).round();
            loads.push(nodal(col_node[s][0], [hx * cx, hx * cy, 0.0, 0.0, 0.0, 0.0]));
        }
        let sups: Vec<_> = (0..=bays)
            .map(|b| (col_node[0][b], if g.next() < 0.3 { vec![true, true, true, true, false, true] } else { FIXED.to_vec() }))
            .collect();
        let mut s = make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IY, IZ, J), (2, A, IY, IZ, J)], elems, sups, loads);
        // columns turn their local y into the frame's plane (local_y = plan
        // direction): in-plane bending is about local z for the columns and
        // about local y for the beams, so every hinge is uniaxial
        for e in s.elements.values_mut() {
            let (ni, nj) = (e.node_i, e.node_j);
            let zi = s.nodes.values().find(|n| n.id == ni).unwrap().z;
            let zj = s.nodes.values().find(|n| n.id == nj).unwrap().z;
            if zi != zj {
                (e.local_yx, e.local_yy, e.local_yz) = (Some(cx), Some(cy), Some(0.0));
            }
        }
        for id in released {
            // release about the in-plane bending axis (local y) only
            s.elements.get_mut(&id.to_string()).unwrap().release_my_start = true;
        }
        // pinned bases: in-plane rotation free means rotation about the plan
        // normal (−cy, cx, 0); only axis-aligned planes can express that with
        // support flags, so the oblique frames keep fixed bases.
        if cx != 0.0 && cy != 0.0 {
            for sup in s.supports.values_mut() {
                sup.rry = true;
                sup.rrx = true;
            }
        } else if cx == 0.0 {
            for sup in s.supports.values_mut() {
                if !sup.rry {
                    sup.rry = true;
                    sup.rrx = false;
                }
            }
        }
        let mut inp = plastic(s, MPY, MPZ);
        let mp_beam = 50.0 + (g.next() * 100.0).round();
        inp.sections.insert("2".to_string(), PlasticSectionData3D { a: A, iy: IY, iz: IZ, material_id: 1, b: None, h: None, d: None });
        inp.mp_overrides.as_mut().unwrap().insert("2".to_string(), [mp_beam, mp_beam * 0.5]);
        let res = solve_plastic_3d(&inp).unwrap();
        let c = certify_collapse_3d(&inp, Some(&res));
        assert!(c.certified, "case {case}: {c:?}");
        let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
        assert!((up - lo) / up < 1e-7, "case {case}: [{lo}, {up}]");
        assert!(res.is_mechanism, "case {case}: {:?}", res.warnings);
        let dev = c.solver_deviation.unwrap();
        if res.warnings.is_empty() {
            assert!(dev < 1e-9, "case {case}: solver {} outside [{lo}, {up}]", res.collapse_factor);
            checked += 1;
        } else {
            // hinges cannot move along a member: when a span peak passes a
            // hinge the solver says so, and is then only approximate
            assert!(res.warnings.iter().all(|w| w.contains("moves along a member") || w.contains("exceeds the yield surface")), "case {case}: {:?}", res.warnings);
            warned += 1;
        }
        if res.hinges.iter().any(|h| h.unloaded_at.is_some()) {
            unloaded += 1;
        }
        if res.hinges.iter().any(|h| h.position > 0.0 && h.position < 1.0) {
            spans += 1;
        }
        eprintln!("case {case}: λ = {} ∈ [{lo}, {up}], {} hinges", res.collapse_factor, res.hinges.len());
    }
    eprintln!("within the enclosure {checked}, warned {warned}, with unloading {unloaded}, with span hinges {spans}");
    assert!(checked >= 14, "only {checked} cases without warnings");
    assert!(spans >= 5, "span hinges exercised in {spans} cases");
}

/// Space frames (1×1 or 2×1 bays in plan, 1–2 storeys) with lateral loads
/// in X and Y and gravity loads on the beams: hinges are biaxial. The
/// enclosure is certified and tight, and the solver never exceeds it; where
/// it falls below, it warns about biaxial hinges.
#[test]
#[ignore = "minutes at opt-level 1; nightly certify-large runs it in release"]
fn random_space_frames_solver_is_safe() {
    let mut g = Lcg(99);
    let (mut inside, mut below) = (0, 0);
    for case in 0..8 {
        // kept small: the exact checks and the polygon LP grow fast with size
        let (bx, by) = (1 + (g.next() * 2.0) as usize, 1);
        let stories = 1 + (g.next() * 1.6) as usize;
        let (w, h) = (4.0, 3.0);
        let mut nodes = Vec::new();
        let mut id = HashMap::new();
        for s in 0..=stories {
            for i in 0..=bx {
                for j in 0..=by {
                    nodes.push((nodes.len() + 1, i as f64 * w, j as f64 * w, s as f64 * h));
                    id.insert((s, i, j), nodes.len());
                }
            }
        }
        let mut elems = Vec::new();
        let mut loads = Vec::new();
        for s in 0..stories {
            for i in 0..=bx {
                for j in 0..=by {
                    elems.push((elems.len() + 1, id[&(s, i, j)], id[&(s + 1, i, j)]));
                }
            }
        }
        for s in 1..=stories {
            for i in 0..=bx {
                for j in 0..=by {
                    if i < bx {
                        elems.push((elems.len() + 1, id[&(s, i, j)], id[&(s, i + 1, j)]));
                        loads.push(udl(elems.len(), 0.0, -(g.next() * 4.0).round()));
                    }
                    if j < by {
                        elems.push((elems.len() + 1, id[&(s, i, j)], id[&(s, i, j + 1)]));
                    }
                }
            }
            loads.push(nodal(id[&(s, 0, 0)], [(g.next() * 3.0).round(), (g.next() * 3.0).round(), 0.0, 0.0, 0.0, 0.0]));
        }
        let sups = (0..=bx).flat_map(|i| (0..=by).map(move |j| (i, j))).map(|(i, j)| (id[&(0, i, j)], FIXED)).collect();
        let s = frame(nodes, elems, sups, loads);
        let inp = plastic(s, MPY, MPZ);
        let res = solve_plastic_3d(&inp).unwrap();
        let c = certify_collapse_3d(&inp, Some(&res));
        assert!(c.certified, "case {case}: {c:?}");
        let (lo, up) = (c.lambda_lower.unwrap(), c.lambda_upper.unwrap());
        eprintln!("space case {case}: solver {} vs [{lo}, {up}] (rel width {:.1e}) {} warnings", res.collapse_factor, (up - lo) / up, res.warnings.len());
        assert!((up - lo) / up < 1e-4, "case {case}: [{lo}, {up}]");
        assert!(res.collapse_factor <= up * (1.0 + 1e-9), "case {case}: solver {} above {up}", res.collapse_factor);
        if c.solver_deviation.unwrap() < 1e-9 {
            inside += 1;
        } else {
            below += 1;
            assert!(res.warnings.iter().any(|w| w.contains("biaxial")), "case {case}: {:?}", res.warnings);
        }
    }
    eprintln!("space frames: {inside} inside, {below} below with the biaxial warning");
}

/// #520: `ex-3d-portal-frame` (8 members, two loaded beams + biaxial nodal load)
/// and its fuzz mutations previously ran all 60+10 polygon-refinement LP
/// iterations (bisecting non-hinge and already-converged vertices down to 1e-7
/// rad), taking 30–37 s and >500 MB per call under libFuzzer/ASan.
#[test]
fn fuzz_520_portal_frame_and_grid_slab_certify_promptly() {
    let solver: SolverInput3D = serde_json::from_str(include_str!("fixtures/ex-3d-portal-frame-input.json")).unwrap();
    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        PlasticSectionData3D { a: 0.01, iy: 1e-4, iz: 1e-4, material_id: 1, b: Some(0.15), h: Some(0.3), d: None },
    );
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(250.0) });
    let inp = PlasticInput3D { solver, sections, materials, max_hinges: None, mp_overrides: None };
    let out = certify_plastic_3d(&inp).unwrap();
    assert_encloses("ex-3d-portal-frame (#520)", &out.certificate, 10.125, 1e-9);

    let slab: SolverInput3D = serde_json::from_str(include_str!("fixtures/ex-3d-grid-slab-input.json")).unwrap();
    let (c, _) = certify(&plastic(slab, MPY, MPZ));
    assert_encloses("ex-3d-grid-slab", &c, 2.5, 1e-9);
}

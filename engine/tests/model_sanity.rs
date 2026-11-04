//! Model sanity review: deliberately broken models must each be caught, and a sound one must
//! come out clean (no findings at all, every check that applies run).
//!
//! The broken models are the mistakes engineers actually make: E in GPa typed into an MPa field,
//! self-weight left out, a dead load pointing up, a structure that only just stands, geometry in
//! millimetres. Most are solved end to end with the engine, so the review reads real results.

use dedaliano_engine::sanity::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// A parametric building: nx × ny bays, ns storeys, columns fixed at the base.
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Spec {
    nx: usize,
    ny: usize,
    ns: usize,
    bay: f64,
    storey: f64,
    /// Coordinates are multiplied by this (1000: drawn in millimetres).
    scale: f64,
    e: f64,
    rho: f64,
    fy: Option<f64>,
    col: (f64, f64, f64, f64), // A, Iy, Iz, J
    beam: (f64, f64, f64, f64),
    /// Superimposed dead and live loads, kN/m², applied at the joints by tributary area.
    dead: f64,
    live: f64,
    /// Sign of gravity (−1 down; +1 is the "load in the wrong direction" mistake).
    gravity: f64,
    /// Self-weight lumped at member ends into the dead case.
    self_weight: bool,
}

impl Spec {
    fn steel() -> Self {
        Spec {
            nx: 2,
            ny: 2,
            ns: 3,
            bay: 6.0,
            storey: 3.0,
            scale: 1.0,
            e: 200_000.0,
            rho: 78.5,
            fy: Some(250.0),
            col: (0.0118, 2.5e-4, 2.5e-4, 1e-6),
            beam: (0.0078, 1.9e-4, 1.0e-5, 5e-7),
            dead: 5.0,
            live: 3.0,
            gravity: -1.0,
            self_weight: true,
        }
    }

    fn concrete() -> Self {
        Spec {
            e: 30_000.0,
            rho: 25.0,
            fy: Some(30.0),
            col: (0.16, 2.13e-3, 2.13e-3, 3.6e-3),
            beam: (0.15, 3.1e-3, 1.1e-3, 2.4e-3),
            ..Spec::steel()
        }
    }
}

struct Building {
    input: SolverInput3D,
    /// node id → (ix, iy, storey)
    grid: HashMap<usize, (usize, usize, usize)>,
}

fn node_id(s: &Spec, ix: usize, iy: usize, k: usize) -> usize {
    1 + ix + iy * (s.nx + 1) + k * (s.nx + 1) * (s.ny + 1)
}

fn building(s: &Spec) -> Building {
    let mut nodes = HashMap::new();
    let mut grid = HashMap::new();
    for k in 0..=s.ns {
        for iy in 0..=s.ny {
            for ix in 0..=s.nx {
                let id = node_id(s, ix, iy, k);
                nodes.insert(
                    id.to_string(),
                    SolverNode3D { id, x: ix as f64 * s.bay * s.scale, y: iy as f64 * s.bay * s.scale, z: k as f64 * s.storey * s.scale },
                );
                grid.insert(id, (ix, iy, k));
            }
        }
    }
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: s.e, nu: 0.3 });
    let mut sections = HashMap::new();
    for (id, (a, iy, iz, j)) in [(1usize, s.col), (2, s.beam)] {
        sections.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    }
    let mut elements = HashMap::new();
    let mut next = 1;
    let mut add = |ni: usize, nj: usize, sec: usize, elements: &mut HashMap<String, SolverElement3D>| {
        let id = next;
        next += 1;
        elements.insert(
            id.to_string(),
            SolverElement3D {
                id,
                elem_type: "frame".into(),
                node_i: ni,
                node_j: nj,
                material_id: 1,
                section_id: sec,
                release_my_start: false,
                release_my_end: false,
                release_mz_start: false,
                release_mz_end: false,
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    };
    for k in 1..=s.ns {
        for iy in 0..=s.ny {
            for ix in 0..=s.nx {
                add(node_id(s, ix, iy, k - 1), node_id(s, ix, iy, k), 1, &mut elements);
                if ix < s.nx {
                    add(node_id(s, ix, iy, k), node_id(s, ix + 1, iy, k), 2, &mut elements);
                }
                if iy < s.ny {
                    add(node_id(s, ix, iy, k), node_id(s, ix, iy + 1, k), 2, &mut elements);
                }
            }
        }
    }
    let mut supports = HashMap::new();
    for iy in 0..=s.ny {
        for ix in 0..=s.nx {
            let n = node_id(s, ix, iy, 0);
            supports.insert(n.to_string(), fixed(n));
        }
    }
    Building {
        input: SolverInput3D {
            nodes,
            materials,
            sections,
            elements,
            supports,
            loads: vec![],
            constraints: vec![],
            left_hand: None,
            plates: HashMap::new(),
            quads: HashMap::new(),
            quad9s: HashMap::new(),
            solid_shells: HashMap::new(),
            curved_shells: HashMap::new(),
            curved_beams: vec![],
            connectors: HashMap::new(),
            solver_options: None, masses: Default::default(),
        },
        grid,
    }
}

fn fixed(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true,
        ry: true,
        rz: true,
        rrx: true,
        rry: true,
        rrz: true,
        kx: None,
        ky: None,
        kz: None,
        krx: None,
        kry: None,
        krz: None,
        dx: None,
        dy: None,
        dz: None,
        drx: None,
        dry: None,
        drz: None,
        rw: None,
        kw: None,
        normal_x: None,
        normal_y: None,
        normal_z: None,
        is_inclined: None,
    }
}

fn nodal(node_id: usize, f: [f64; 3]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })
}

/// Floor loads q (kN/m²) at the joints by tributary area, on every floor. The joint loads are
/// worked out in metres, as an engineer types them, whatever unit the geometry was drawn in.
fn floor_loads(s: &Spec, b: &Building, q: f64) -> Vec<SolverLoad3D> {
    let mut out = vec![];
    for (&id, &(ix, iy, k)) in &b.grid {
        if k == 0 || q == 0.0 {
            continue;
        }
        let wx = if ix == 0 || ix == s.nx { 0.5 } else { 1.0 } * s.bay;
        let wy = if iy == 0 || iy == s.ny { 0.5 } else { 1.0 } * s.bay;
        out.push(nodal(id, [0.0, 0.0, s.gravity * q * wx * wy]));
    }
    out
}

/// Each member's weight, half to each end.
fn self_weight_loads(s: &Spec, b: &Building) -> Vec<SolverLoad3D> {
    let mut out = vec![];
    for el in b.input.elements.values() {
        let (pi, pj) = (&b.input.nodes[&el.node_i.to_string()], &b.input.nodes[&el.node_j.to_string()]);
        let l = ((pj.x - pi.x).powi(2) + (pj.y - pi.y).powi(2) + (pj.z - pi.z).powi(2)).sqrt();
        let a = b.input.sections[&el.section_id.to_string()].a;
        let w = s.rho * a * l / 2.0;
        out.push(nodal(el.node_i, [0.0, 0.0, s.gravity * w]));
        out.push(nodal(el.node_j, [0.0, 0.0, s.gravity * w]));
    }
    out
}

/// Σ applied (forces and moments about the origin), summed here from the loads: independent of
/// the solver's assembly.
fn applied(input: &SolverInput3D, loads: &[SolverLoad3D]) -> [f64; 6] {
    let mut s = [0.0; 6];
    for l in loads {
        if let SolverLoad3D::Nodal(n) = l {
            let p = &input.nodes[&n.node_id.to_string()];
            let (f, r) = ([n.fx, n.fy, n.fz], [p.x, p.y, p.z]);
            let m = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
            for k in 0..3 {
                s[k] += f[k];
                s[3 + k] += m[k] + [n.mx, n.my, n.mz][k];
            }
        }
    }
    s
}

struct CaseDef {
    id: usize,
    name: &'static str,
    kind: CaseKind,
    loads: Vec<SolverLoad3D>,
    self_weight: bool,
}

/// The sanity input for a model: each case solved with the engine, its applied side summed from
/// its loads.
fn sanity_input(model: &SolverInput3D, rho: f64, fy: Option<f64>, cases: Vec<CaseDef>, solve: bool) -> SanityInput {
    let mut out = SanityInput {
        up: UpAxis::Z,
        nodes: model.nodes.values().map(|n| SanityNode { id: n.id, x: n.x, y: n.y, z: n.z }).collect(),
        materials: model
            .materials
            .values()
            .map(|m| SanityMaterial { id: m.id, name: format!("M{}", m.id), e: m.e, rho: Some(rho), fy, family: None })
            .collect(),
        sections: model
            .sections
            .values()
            .map(|s| SanitySection { id: s.id, name: format!("S{}", s.id), a: s.a, iz: s.iz, iy: Some(s.iy) })
            .collect(),
        members: model
            .elements
            .values()
            .map(|e| SanityMember {
                id: e.id,
                node_i: e.node_i,
                node_j: e.node_j,
                material_id: e.material_id,
                section_id: e.section_id,
                truss: e.elem_type == "truss",
            })
            .collect(),
        supports: model
            .supports
            .values()
            .map(|s| SanitySupport {
                node_id: s.node_id,
                restraint: [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz],
                spring: [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz],
            })
            .collect(),
        solved: solve,
        ..Default::default()
    };
    for c in cases {
        let mut sc = SanityCase {
            id: c.id,
            name: c.name.into(),
            kind: c.kind,
            applied: Some(applied(model, &c.loads)),
            moments_close: true,
            self_weight: c.self_weight,
            load_points: c
                .loads
                .iter()
                .filter_map(|l| match l {
                    SolverLoad3D::Nodal(n) => {
                        let p = &model.nodes[&n.node_id.to_string()];
                        Some(LoadPoint { p: [p.x, p.y, p.z], f: [n.fx, n.fy, n.fz] })
                    }
                    _ => None,
                })
                .collect(),
            ..Default::default()
        };
        if solve {
            let mut m = model.clone();
            m.loads = c.loads.clone();
            let res = linear::solve_3d(&m).expect("solves");
            sc.solved = true;
            sc.reactions = res.reactions.iter().map(|r| NodeVector { node_id: r.node_id, v: [r.fx, r.fy, r.fz, r.mx, r.my, r.mz] }).collect();
            sc.displacements =
                res.displacements.iter().map(|d| NodeVector { node_id: d.node_id, v: [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] }).collect();
            sc.member_axial = res.element_forces.iter().map(|f| MemberAxial { id: f.element_id, n_start: f.n_start, n_end: f.n_end }).collect();
        }
        out.cases.push(sc);
    }
    out
}

/// A building with a dead case (floor loads + self-weight as stated) and a live case, solved.
fn reviewed(s: &Spec) -> (SanityInput, Building) {
    let b = building(s);
    let mut dead = floor_loads(s, &b, s.dead);
    if s.self_weight {
        dead.extend(self_weight_loads(s, &b));
    }
    let cases = vec![
        CaseDef { id: 1, name: "D", kind: CaseKind::Dead, loads: dead, self_weight: s.self_weight },
        CaseDef { id: 2, name: "L", kind: CaseKind::Live, loads: floor_loads(s, &b, s.live), self_weight: false },
    ];
    (sanity_input(&b.input, s.rho, s.fy, cases, true), b)
}

fn codes(r: &SanityReport) -> Vec<SanityCode> {
    r.findings.iter().map(|f| f.code).collect()
}

fn find(r: &SanityReport, code: SanityCode) -> &SanityFinding {
    r.findings.iter().find(|f| f.code == code).unwrap_or_else(|| panic!("{:?} not found in {:#?}", code, r.findings))
}

// ---------------------------------------------------------------------------
// The sound models: nothing to say, and every applicable check ran
// ---------------------------------------------------------------------------

#[test]
fn sound_steel_building_is_clean() {
    let (mut input, _) = reviewed(&Spec::steel());
    // A plausible period: Ta = 0.0724·9^0.8 = 0.42 s.
    input.modal = Some(SanityModal { modes: vec![SanityMode { period: 0.7, mass_x: 0.8, mass_y: 0.0 }] });
    let r = review(&input);
    assert!(r.findings.is_empty(), "{:#?}", r.findings);
    for c in [
        CheckId::Equilibrium,
        CheckId::GravityDirection,
        CheckId::SelfWeight,
        CheckId::GravityWeight,
        CheckId::Period,
        CheckId::Tributary,
        CheckId::Materials,
        CheckId::Sections,
        CheckId::Geometry,
        CheckId::LoadPath,
        CheckId::Supports,
        CheckId::Springs,
        CheckId::Deflection,
        CheckId::Connectivity,
    ] {
        assert_eq!(r.status(c).map(|s| s.status), Some(CheckStatusKind::Ran), "{:?}: {:?}", c, r.status(c));
    }
}

#[test]
fn sound_concrete_building_is_clean() {
    let (input, _) = reviewed(&Spec::concrete());
    let r = review(&input);
    assert!(r.findings.is_empty(), "{:#?}", r.findings);
    // No modal analysis: the period check says it did not run, rather than nothing.
    let p = r.status(CheckId::Period).unwrap();
    assert_eq!((p.status, p.reason), (CheckStatusKind::Skipped, Some(SkipReason::NoModal)));
}

// ---------------------------------------------------------------------------
// The broken models: each must be caught
// ---------------------------------------------------------------------------

#[test]
fn e_in_gpa_typed_as_mpa_is_caught() {
    let (input, _) = reviewed(&Spec { e: 200.0, ..Spec::steel() });
    let r = review(&input);
    let f = find(&r, SanityCode::ModulusImplausible);
    assert_eq!(f.severity, Severity::Error);
    assert_eq!(f.params.get("unit"), Some(&Param::Text("GPa".into())));
    assert_eq!(f.params.get("corrected"), Some(&Param::Num(200_000.0)));
    assert!(f.message.contains("200 MPa") && f.message.contains("steel"), "{}", f.message);
    assert!(!f.element_ids.is_empty());
}

#[test]
fn e_in_kgf_per_cm2_is_caught() {
    let (input, _) = reviewed(&Spec { e: 2.1e6, ..Spec::steel() });
    let f = find(&review(&input), SanityCode::ModulusImplausible).clone();
    assert_eq!(f.params.get("unit"), Some(&Param::Text("kgf/cm²".into())));
}

#[test]
fn missing_self_weight_is_caught() {
    // A concrete frame whose dead case has the floor finishes but not the frame's own weight.
    let s = Spec { self_weight: false, dead: 1.5, ..Spec::concrete() };
    let (input, _) = reviewed(&s);
    let r = review(&input);
    let f = find(&r, SanityCode::SelfWeightMissing);
    assert_eq!(f.severity, Severity::Warning);
    let Param::Num(w) = f.params["weight"] else { panic!() };
    assert!(w > 1000.0, "the frame weighs {} kN", w);
}

#[test]
fn self_weight_counted_as_loads_is_not_missing() {
    // No case flags self-weight, but the dead case carries it as loads: nothing to say.
    let s = Spec { self_weight: true, ..Spec::concrete() };
    let (mut input, _) = reviewed(&s);
    for c in &mut input.cases {
        c.self_weight = false;
    }
    assert!(!review(&input).has(SanityCode::SelfWeightMissing));
}

#[test]
fn gravity_load_in_the_wrong_direction_is_caught() {
    let (input, _) = reviewed(&Spec { gravity: 1.0, ..Spec::steel() });
    let r = review(&input);
    let ups: Vec<_> = r.findings.iter().filter(|f| f.code == SanityCode::GravityUpward).collect();
    assert_eq!(ups.len(), 2, "both the dead and the live case push up: {:#?}", r.findings);
    assert!(ups.iter().all(|f| f.severity == Severity::Error));
    assert_eq!(ups[0].case_id, Some(1));
}

#[test]
fn geometry_in_millimetres_is_caught() {
    let (input, _) = reviewed(&Spec { scale: 1000.0, ..Spec::steel() });
    let r = review(&input);
    let f = find(&r, SanityCode::GeometryScale);
    assert!(f.message.contains("3000") || f.message.contains("6000"), "{}", f.message);
    // The weight per floor area is a millionth of a building's, too.
    assert!(r.has(SanityCode::WeightPerAreaLow), "{:?}", codes(&r));
}

#[test]
fn a_structure_that_only_just_stands_is_caught() {
    // One storey on pins along y = 0, the rest held up by springs of 1 N/m: it solves, and the
    // answer is a rigid-body tilt.
    let s = Spec { ns: 1, ..Spec::steel() };
    let mut b = building(&s);
    for iy in 0..=s.ny {
        for ix in 0..=s.nx {
            let n = node_id(&s, ix, iy, 0);
            let sup = b.input.supports.get_mut(&n.to_string()).unwrap();
            sup.rrx = false;
            sup.rry = false;
            sup.rrz = false;
            if iy > 0 {
                sup.rz = false;
                sup.kz = Some(1e-3);
            }
        }
    }
    let mut dead = floor_loads(&s, &b, s.dead);
    dead.extend(self_weight_loads(&s, &b));
    let input = sanity_input(
        &b.input,
        s.rho,
        s.fy,
        vec![CaseDef { id: 1, name: "D", kind: CaseKind::Dead, loads: dead, self_weight: true }],
        true,
    );
    let r = review(&input);
    assert!(r.has(SanityCode::SpringSoft), "{:?}", codes(&r));
    let f = find(&r, SanityCode::DisplacementAbsurd);
    assert_eq!(f.severity, Severity::Error);
}

#[test]
fn supports_on_one_line_are_caught() {
    let s = Spec { ns: 1, ..Spec::steel() };
    let mut b = building(&s);
    b.input.supports.retain(|_, sup| {
        let (_, iy, _) = b.grid[&sup.node_id];
        iy == 0
    });
    for sup in b.input.supports.values_mut() {
        sup.rrx = false;
        sup.rry = false;
        sup.rrz = false;
    }
    let input = sanity_input(&b.input, s.rho, s.fy, vec![], false);
    let r = review(&input);
    let f = find(&r, SanityCode::SupportsColinear);
    assert_eq!(f.node_ids.len(), s.nx + 1);
    // Fixed supports on the same line hold the rotation: nothing to say.
    for sup in b.input.supports.values_mut() {
        sup.rrx = true;
    }
    assert!(!review(&sanity_input(&b.input, s.rho, s.fy, vec![], false)).has(SanityCode::SupportsColinear));
}

#[test]
fn all_supports_at_one_pinned_point_are_caught() {
    let s = Spec { ns: 1, nx: 1, ny: 1, ..Spec::steel() };
    let mut b = building(&s);
    let keep = node_id(&s, 0, 0, 0).to_string();
    b.input.supports.retain(|k, _| *k == keep);
    let sup = b.input.supports.get_mut(&keep).unwrap();
    sup.rrz = false;
    let r = review(&sanity_input(&b.input, s.rho, s.fy, vec![], false));
    assert!(find(&r, SanityCode::SupportsSinglePoint).message.contains("rz"));
}

#[test]
fn reactions_that_do_not_balance_the_loads_are_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    // A load the solve never saw: the applied side has 50 kN more than the reactions balance.
    input.cases[0].applied.as_mut().unwrap()[2] -= 50.0;
    let r = review(&input);
    let f = find(&r, SanityCode::EquilibriumViolation);
    assert_eq!((f.severity, f.case_id), (Severity::Error, Some(1)));
    assert_eq!(f.params["component"], Param::Text("Fz".into()));
    // When the case has loads the sum cannot total, it is not judged on a partial sum: the check
    // says which case it left out and why.
    input.cases[0].uncovered = vec!["moving".into()];
    let r = review(&input);
    assert!(!r.has(SanityCode::EquilibriumViolation));
    let st = r.status(CheckId::Equilibrium).unwrap();
    assert_eq!((st.status, st.reason), (CheckStatusKind::Partial, Some(SkipReason::SomeCasesUnchecked)));
    assert!(st.detail.contains("D (moving)"), "{}", st.detail);
}

#[test]
fn equilibrium_tolerance_is_tight() {
    // 0.1 % of the case's load is not round-off.
    let (mut input, _) = reviewed(&Spec::steel());
    let fz = input.cases[0].applied.unwrap()[2];
    input.cases[0].applied.as_mut().unwrap()[2] += 1e-3 * fz;
    assert!(review(&input).has(SanityCode::EquilibriumViolation));
}

#[test]
fn a_floating_part_is_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    input.nodes.push(SanityNode { id: 900, x: 50.0, y: 0.0, z: 3.0 });
    input.nodes.push(SanityNode { id: 901, x: 56.0, y: 0.0, z: 3.0 });
    input.members.push(SanityMember { id: 900, node_i: 900, node_j: 901, material_id: 1, section_id: 2, truss: false });
    let f = find(&review(&input), SanityCode::UnsupportedPart).clone();
    assert_eq!((f.severity, f.element_ids.clone(), f.node_ids.clone()), (Severity::Error, vec![900], vec![900, 901]));
}

#[test]
fn a_pipe_rack_is_not_read_as_a_building() {
    // Six bays long, one bay wide, three levels with beams across every frame: its levels close
    // panels and have members across them, but a rack's level is not a floor, and the weight per
    // floor area of a building does not apply to it.
    let (input, _) = reviewed(&Spec { nx: 6, ny: 1, dead: 1.0, live: 0.0, ..Spec::steel() });
    let r = review(&input);
    let s = r.status(CheckId::GravityWeight).unwrap();
    assert_eq!((s.status, s.reason), (CheckStatusKind::Skipped, Some(SkipReason::NotABuilding)), "{:#?}", r.findings);
    assert!(!r.has(SanityCode::WeightPerAreaLow));
}

#[test]
fn a_two_by_one_bay_building_is_still_a_building() {
    // Two bays by one has no node inside its floors either; it is not long and narrow, so it is
    // a building, and a light one is caught.
    let (input, _) = reviewed(&Spec { nx: 2, ny: 1, dead: 0.5, live: 0.0, ..Spec::steel() });
    let r = review(&input);
    assert_eq!(r.status(CheckId::GravityWeight).unwrap().status, CheckStatusKind::Ran);
    assert!(r.has(SanityCode::WeightPerAreaLow), "{:#?}", r.findings);
}

#[test]
fn a_node_on_a_span_without_a_connection_is_caught() {
    // A secondary beam drawn between the midspans of two parallel first-floor beams, whose nodes
    // were placed on those beams but the beams were never split there.
    let (mut input, _) = reviewed(&Spec::steel());
    input.nodes.push(SanityNode { id: 900, x: 3.0, y: 0.0, z: 3.0 });
    input.nodes.push(SanityNode { id: 901, x: 3.0, y: 6.0, z: 3.0 });
    input.members.push(SanityMember { id: 900, node_i: 900, node_j: 901, material_id: 1, section_id: 2, truss: false });
    let r = review(&input);
    let f = find(&r, SanityCode::NodeOnSpan).clone();
    assert_eq!(f.severity, Severity::Warning);
    assert_eq!(f.node_ids, vec![900, 901]);
    assert_eq!(f.element_ids.len(), 2, "{:?}", f.element_ids);
    assert_eq!(f.params.get("percent"), Some(&Param::Num(50.0)));
    // The new beam is not connected to anything that holds it either.
    assert!(r.has(SanityCode::UnsupportedPart));
    assert_eq!(r.status(CheckId::Connectivity).map(|s| s.status), Some(CheckStatusKind::Ran));
}

#[test]
fn a_node_near_but_off_a_span_or_unused_is_not_flagged() {
    let (mut input, _) = reviewed(&Spec::steel());
    // 5 cm off a 6 m beam: a different line, not a node on it.
    input.nodes.push(SanityNode { id: 900, x: 3.0, y: 0.05, z: 3.0 });
    input.nodes.push(SanityNode { id: 901, x: 3.0, y: 0.05, z: 0.0 });
    input.members.push(SanityMember { id: 900, node_i: 900, node_j: 901, material_id: 1, section_id: 1, truss: false });
    input.supports.push(SanitySupport { node_id: 901, restraint: [true; 6], spring: [None; 6] });
    // A construction point on a beam that nothing uses.
    input.nodes.push(SanityNode { id: 902, x: 3.0, y: 6.0, z: 3.0 });
    // A beam hung 0.2 m below the first floor by a rigid offset: its end node lies on the column
    // below, tied to the column's top node by a link, which is a connection.
    let (top, below) = (node_id(&Spec::steel(), 2, 2, 1), 903);
    input.nodes.push(SanityNode { id: below, x: 12.0, y: 12.0, z: 2.8 });
    input.nodes.push(SanityNode { id: 904, x: 18.0, y: 12.0, z: 2.8 });
    input.members.push(SanityMember { id: 903, node_i: below, node_j: 904, material_id: 1, section_id: 2, truss: false });
    input.links.push(vec![top, below]);
    let r = review(&input);
    assert!(!r.has(SanityCode::NodeOnSpan), "{:#?}", r.findings);
}

#[test]
fn density_in_kg_per_m3_is_caught() {
    let (input, _) = reviewed(&Spec { rho: 7850.0, ..Spec::steel() });
    let f = find(&review(&input), SanityCode::DensityImplausible).clone();
    assert_eq!(f.severity, Severity::Error);
    assert_eq!(f.params.get("unit"), Some(&Param::Text("kg/m³".into())));
}

#[test]
fn density_in_t_per_m3_is_caught() {
    let (input, _) = reviewed(&Spec { rho: 7.85, ..Spec::steel() });
    let f = find(&review(&input), SanityCode::DensityImplausible).clone();
    assert_eq!(f.severity, Severity::Warning);
    assert_eq!(f.params.get("unit"), Some(&Param::Text("t/m³".into())));
}

#[test]
fn strength_in_kgf_per_cm2_is_caught() {
    let (input, _) = reviewed(&Spec { fy: Some(2530.0), ..Spec::steel() });
    let f = find(&review(&input), SanityCode::StrengthImplausible).clone();
    assert_eq!(f.params.get("unit"), Some(&Param::Text("kgf/cm²".into())));
}

#[test]
fn inertia_in_cm4_is_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    let s = input.sections.iter_mut().find(|s| s.id == 2).unwrap();
    s.iz = 8356.0; // an IPE 300's Iz in cm⁴
    let f = find(&review(&input), SanityCode::SectionImplausible).clone();
    assert_eq!(f.params.get("unit"), Some(&Param::Text("cm⁴".into())));
}

#[test]
fn a_section_far_from_the_rest_is_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    // 0.0085 m² typed as 85.
    input.sections.push(SanitySection { id: 9, name: "typo".into(), a: 85.0, iz: 1e-4, iy: None });
    input.members[0].section_id = 9;
    let r = review(&input);
    assert!(r.has(SanityCode::SectionOutlier) || r.has(SanityCode::SectionImplausible), "{:?}", codes(&r));
}

#[test]
fn springs_absurdly_stiff_are_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    input.supports[0].restraint[2] = false;
    input.supports[0].spring[2] = Some(1e18);
    assert!(review(&input).has(SanityCode::SpringStiff));
}

#[test]
fn a_period_far_from_the_code_formula_is_caught() {
    let (mut input, _) = reviewed(&Spec::steel());
    input.modal = Some(SanityModal { modes: vec![SanityMode { period: 12.0, mass_x: 0.8, mass_y: 0.0 }] });
    let f = find(&review(&input), SanityCode::PeriodOutOfRange).clone();
    assert_eq!(f.params["system"], Param::Text("steelMomentFrame".into()));
    let Param::Num(ta) = f.params["ta"] else { panic!() };
    assert!((ta - 0.0724 * 9f64.powf(0.8)).abs() < 1e-12);
}

#[test]
fn a_column_far_from_its_tributary_load_is_caught() {
    let (mut input, b) = reviewed(&Spec::steel());
    // The interior column of the first storey reported as carrying almost nothing.
    let s = Spec::steel();
    let (ni, nj) = (node_id(&s, 1, 1, 0), node_id(&s, 1, 1, 1));
    let col = b.input.elements.values().find(|e| e.node_i == ni && e.node_j == nj).unwrap().id;
    for a in &mut input.cases[0].member_axial {
        if a.id == col {
            a.n_start *= 0.1;
            a.n_end *= 0.1;
        }
    }
    let r = review(&input);
    let f = find(&r, SanityCode::TributaryMismatch);
    assert!(f.element_ids.contains(&col));
    assert!(r.has(SanityCode::StoreyLoadMismatch));
}

#[test]
fn tributary_check_says_when_it_does_not_apply() {
    let (mut input, _) = reviewed(&Spec::steel());
    // A brace: the method no longer applies, and the review says so instead of staying silent.
    input.members.push(SanityMember { id: 999, node_i: 1, node_j: 1 + 3 * 3 + 1, material_id: 1, section_id: 2, truss: true });
    let st = review(&input).status(CheckId::Tributary).unwrap().clone();
    assert_eq!((st.status, st.reason), (CheckStatusKind::Skipped, Some(SkipReason::DiagonalMembers)));
}

#[test]
fn result_checks_say_the_model_was_not_solved() {
    let (mut input, _) = reviewed(&Spec::steel());
    input.solved = false;
    let r = review(&input);
    for c in [CheckId::Equilibrium, CheckId::Tributary, CheckId::Deflection] {
        assert_eq!(r.status(c).unwrap().reason, Some(SkipReason::NotSolved), "{:?}", c);
    }
}

#[test]
fn a_plane_model_says_floor_area_is_unknown() {
    let (mut input, _) = reviewed(&Spec::steel());
    input.planar = true;
    let st = review(&input).status(CheckId::GravityWeight).unwrap().clone();
    assert_eq!(st.reason, Some(SkipReason::PlaneModel));
}

#[test]
fn json_round_trip() {
    let (input, _) = reviewed(&Spec { e: 200.0, ..Spec::steel() });
    let json = serde_json::to_string(&input).unwrap();
    let out: serde_json::Value = serde_json::from_str(&review_json(&json).unwrap()).unwrap();
    let f = out["findings"].as_array().unwrap().iter().find(|f| f["code"] == "modulus_implausible").unwrap();
    assert_eq!(f["severity"], "error");
    assert!(f["why"].as_str().unwrap().len() > 20 && f["fix"].as_str().unwrap().len() > 20);
    assert!(out["checks"].as_array().unwrap().iter().any(|c| c["check"] == "period" && c["status"] == "skipped" && c["reason"] == "no_modal"));
}

#[test]
fn a_dead_load_applied_sideways_is_caught() {
    // Half the floor load typed along a horizontal axis: the mistake of a member load in a local
    // axis that is horizontal for that member.
    let s = Spec::steel();
    let b = building(&s);
    let mut dead = self_weight_loads(&s, &b);
    for l in floor_loads(&s, &b, s.dead) {
        if let SolverLoad3D::Nodal(n) = l {
            dead.push(nodal(n.node_id, [0.0, n.fz / 2.0, n.fz / 2.0]));
        }
    }
    let input = sanity_input(&b.input, s.rho, s.fy, vec![CaseDef { id: 1, name: "D", kind: CaseKind::Dead, loads: dead, self_weight: true }], true);
    let r = review(&input);
    let f = find(&r, SanityCode::GravityCaseHorizontal);
    assert_eq!((f.severity, f.case_id), (Severity::Warning, Some(1)));
    // It balances: the reactions are right for the wrong loads, which is why this needs its own check.
    assert!(!r.has(SanityCode::EquilibriumViolation));
}

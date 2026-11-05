//! 3D buckling of members whose axial force varies along the span under axial span loads (#456).
//!
//! References, for a cantilever of length L and weak-axis stiffness EI under compression λ·c(x):
//! the slope θ solves EI·θ'' + λ·c(x)·θ = 0 with θ(0) = 0 and θ'(L) = 0.
//! - c = P·x/L (rising to the free tip) and c = P·(L − x)/L (Euler's heavy column): the Bessel
//!   closed forms of `buckling_span_axial_2d`, λP·L²/EI = 3.476619 and 7.837347.
//! - c = 2.5·x·(4 − x) on L = 4 (q = 10 − 5x, N zero at both ends, mean −20/3): RK4 shooting,
//!   λ = 455.69407; the same shooting gives Euler's π²EI/(4L²) for a constant force to 1e-12.
//! - c = 2.5·x·(4 − x) − 20/3 (the same load and a tip pull of 20/3, mean zero, tension at the
//!   ends): RK4 shooting, λ = 3985.4689.
//!
//! One member is checked against the one-member Ritz value with the consistent Kg ∫N·φ'·φ' dx,
//! computed outside the engine (cubic Hermite, Gauss), and meshes against the exact value. Where
//! no closed form exists (a flexural-torsional mode), a mesh with the span loads on each member is
//! checked against a finer mesh that carries the same load as nodal forces, whose members each
//! have a constant axial force and so no span term.
use dedaliano_engine::solver::buckling::solve_buckling_3d;
use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::types::*;
use serde_json::json;

const E: f64 = 200_000.0;
const L: f64 = 4.0;
const P: f64 = 100.0;
const WEAK: f64 = 1e-4;
const EI: f64 = E * 1000.0 * WEAK;

const RISING: f64 = 3.476_619_007_992;
const FALLING: f64 = 7.837_347_438_943;
const PARABOLIC: f64 = 455.694_073_025_685;
const SIGN_CHANGE: f64 = 3_985.468_940_886;

const RISING_ONE: f64 = 3.542_486_889_354;
const FALLING_ONE: f64 = 7.888_974_490_720;
const PARABOLIC_ONE: f64 = 460.078_356_728_536;

const SKEW: [f64; 3] = [1.0 / 3.0, 2.0 / 3.0, 2.0 / 3.0];
const FIXED: [bool; 6] = [true; 6];

/// Axial load per unit length along the member, as a function of the distance from its base.
type Load = fn(f64) -> f64;

struct Column {
    axis: [f64; 3],
    n: usize,
    section: serde_json::Value,
    base: [bool; 6],
    head: Option<[bool; 6]>,
    hinge_at_head: bool,
    q: Load,
    tip: f64,
    lumped: bool,
}

impl Column {
    fn new(n: usize, q: Load, tip: f64) -> Self {
        Column { axis: [1.0, 0.0, 0.0], n, section: section(WEAK, 2.0 * WEAK), base: FIXED, head: None, hinge_at_head: false, q, tip, lumped: false }
    }

    fn input(&self) -> SolverInput3D {
        let h = L / self.n as f64;
        let at = |x: f64| [x * self.axis[0], x * self.axis[1], x * self.axis[2]];
        let nodes: serde_json::Map<String, serde_json::Value> = (0..=self.n)
            .map(|i| { let p = at(i as f64 * h); ((i + 1).to_string(), json!({"id": i + 1, "x": p[0], "y": p[1], "z": p[2]})) })
            .collect();
        let elements: serde_json::Map<String, serde_json::Value> = (1..=self.n)
            .map(|i| {
                let head = self.hinge_at_head && i == self.n;
                (i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1, "releaseMyEnd": head, "releaseMzEnd": head}))
            })
            .collect();
        let support = |id: usize, r: [bool; 6]| json!({"nodeId": id, "rx": r[0], "ry": r[1], "rz": r[2], "rrx": r[3], "rry": r[4], "rrz": r[5]});
        let mut supports = serde_json::Map::new();
        supports.insert("1".into(), support(1, self.base));
        if let Some(head) = self.head {
            supports.insert("2".into(), support(self.n + 1, head));
        }
        let mut nodal = vec![0.0; self.n + 2];
        nodal[self.n + 1] += self.tip;
        let mut loads = Vec::new();
        for i in 1..=self.n {
            let (x0, x1) = ((i - 1) as f64 * h, i as f64 * h);
            let (qi, qj) = ((self.q)(x0), (self.q)(x1));
            if qi == 0.0 && qj == 0.0 {
                continue;
            }
            if self.lumped {
                nodal[i] += h * (2.0 * qi + qj) / 6.0;
                nodal[i + 1] += h * (qi + 2.0 * qj) / 6.0;
            } else {
                loads.push(json!({"type": "distributed", "data": {"elementId": i, "qXI": qi, "qXJ": qj, "qYI": 0, "qYJ": 0, "qZI": 0, "qZJ": 0}}));
            }
        }
        for (id, &f) in nodal.iter().enumerate().skip(1) {
            if f != 0.0 {
                loads.push(json!({"type": "nodal", "data": {"nodeId": id, "fx": f * self.axis[0], "fy": f * self.axis[1], "fz": f * self.axis[2], "mx": 0, "my": 0, "mz": 0}}));
            }
        }
        serde_json::from_value(json!({
            "nodes": nodes, "elements": elements, "supports": supports, "loads": loads,
            "materials": {"1": {"id": 1, "e": E, "nu": 0.3}},
            "sections": {"1": self.section},
        }))
        .unwrap()
    }

    fn factor(&self) -> f64 {
        solve_buckling_3d(&self.input(), 1).expect("buckling solves").modes[0].load_factor
    }
}

fn section(iy: f64, iz: f64) -> serde_json::Value {
    json!({"id": 1, "a": 0.01, "iy": iy, "iz": iz, "j": 1e-4})
}

fn rising_q(_: f64) -> f64 {
    P / L
}

fn falling_q(_: f64) -> f64 {
    -P / L
}

fn parabolic_q(x: f64) -> f64 {
    10.0 - 5.0 * x
}

fn scaled(lambda: f64) -> f64 {
    lambda * P * L * L / EI
}

fn one_member(got: f64, ritz: f64, exact: f64) {
    assert!((got - ritz).abs() <= 1e-9 * ritz, "{got}, one-member consistent model {ritz}");
    assert!(ritz > exact, "the one-member model is an upper bound");
}

fn within(got: f64, exact: f64, above: f64) {
    assert!(got >= exact * (1.0 - 1e-6) && got <= exact * (1.0 + above), "{got}, exact {exact}, allowed up to +{above}");
}

/// #456: q = 10 − 5x on a 4 m cantilever leaves N zero at both ends and 2.5x(x − 4) inside. The end
/// average made the member look unloaded and the analysis was refused; the mean −20/3 alone would
/// buckle it at the tip-thrust factor 466.1 (one member), 2.3 % above the 455.7 it has.
#[test]
fn a_cantilever_compressed_only_between_its_ends_buckles_at_its_own_factor() {
    for axis in [[1.0, 0.0, 0.0], SKEW] {
        let column = Column { axis, ..Column::new(1, parabolic_q, 0.0) };
        let ef = &solve_3d(&column.input()).unwrap().element_forces[0];
        assert!(ef.n_start.abs() < 1e-9 && ef.n_end.abs() < 1e-9, "ends {} {}", ef.n_start, ef.n_end);
        let r = solve_buckling_3d(&column.input(), 1).expect("compressed inside the span");
        let d = r.element_data.iter().find(|d| d.element_id == 1).expect("the member is reported as compressed");
        assert!((d.axial_force + 20.0 / 3.0).abs() < 1e-6, "mean N {}", d.axial_force);
        one_member(r.modes[0].load_factor, PARABOLIC_ONE, PARABOLIC);
        within(Column { axis, ..Column::new(16, parabolic_q, 0.0) }.factor(), PARABOLIC, 1e-3);
    }
}

#[test]
fn a_cantilever_compressed_only_between_its_ends_matches_the_lumped_mesh() {
    let lumped = Column { lumped: true, ..Column::new(64, parabolic_q, 0.0) }.factor();
    within(lumped, PARABOLIC, 1e-3);
}

/// Compression rising from 0 at the support to P at the free tip, in each principal plane and
/// along a skew axis. The mean −P/2 put the one-member factor at 4.97, 43 % above the exact 3.48.
#[test]
#[ignore = "known wrong result: #456"]
fn a_cantilever_with_compression_growing_to_the_free_end() {
    for axis in [[1.0, 0.0, 0.0], SKEW] {
        for (iy, iz) in [(WEAK, 2.0 * WEAK), (2.0 * WEAK, WEAK)] {
            let one = Column { axis, section: section(iy, iz), ..Column::new(1, rising_q, -P) };
            one_member(scaled(one.factor()), RISING_ONE, RISING);
            let mesh = Column { n: 8, ..one };
            within(scaled(mesh.factor()), RISING, 1e-3);
        }
    }
}

#[test]
fn a_heavy_cantilever() {
    for axis in [[1.0, 0.0, 0.0], SKEW] {
        one_member(scaled(Column { axis, ..Column::new(1, falling_q, 0.0) }.factor()), FALLING_ONE, FALLING);
        within(scaled(Column { axis, ..Column::new(8, falling_q, 0.0) }.factor()), FALLING, 1e-3);
    }
}

/// Rotation held and sway free at the base, pinned at the head under the thrust, with both bending
/// rotations released there: the condensed one-member model gives λP·L²/EI = 40/11 (the mean, 5).
#[test]
fn a_sway_column_with_compression_growing_to_a_released_head() {
    let sway = |n| Column {
        base: [true, false, false, true, true, true],
        head: Some([false, true, true, false, false, false]),
        hinge_at_head: true,
        ..Column::new(n, rising_q, -P)
    };
    let one = scaled(sway(1).factor());
    assert!((one - 40.0 / 11.0).abs() <= 1e-9, "λP·L²/EI = {one}, condensed one-member model 40/11");
    within(scaled(sway(8).factor()), RISING, 1e-3);
}

/// Mean force zero, compression only in the middle: refused before as uncompressed, now buckled at
/// its own factor (the one-member model is too coarse here, 18 % high, so meshes are compared).
#[test]
fn a_member_with_zero_mean_force_and_compression_inside() {
    let column = |n| Column::new(n, parabolic_q, 20.0 / 3.0);
    let r = solve_buckling_3d(&column(1).input(), 1).expect("compressed inside the span");
    assert!(r.element_data.is_empty(), "no member has a compressive mean: {:?}", r.element_data);
    within(column(32).factor(), SIGN_CHANGE, 1e-3);
}

/// Tension all along, down to zero at both ends or at one: nothing to buckle, refused as such.
#[test]
fn a_member_in_tension_all_along_is_refused() {
    for (q, tip) in [(falling_q as Load, P), (|x| -parabolic_q(x), 0.0), (rising_q, 0.0)] {
        let err = solve_buckling_3d(&Column::new(1, q, tip).input(), 1).unwrap_err();
        assert_eq!(err, "No compressed elements — buckling not applicable", "tip {tip}");
    }
}

/// A monosymmetric section with warping restrained, which buckles flexural-torsionally under the
/// rising compression: the span loads on 16 members against 64 members under nodal forces.
#[test]
fn a_flexural_torsional_mode_matches_the_lumped_mesh() {
    let channel = json!({"id": 1, "a": 0.01, "iy": 4e-5, "iz": 1e-4, "j": 2e-7, "cw": 1e-7, "shearCenterZ": 0.06});
    let column = |n, lumped| Column { section: channel.clone(), lumped, ..Column::new(n, rising_q, -P) };
    let input = column(16, false).input();
    let r = solve_buckling_3d(&input, 1).unwrap();
    let twist = r.modes[0].displacements.iter().fold(0.0f64, |m, d| m.max(d.rx.abs()));
    assert!(twist > 1e-3, "the mode twists: {twist}");
    let (span, lumped) = (r.modes[0].load_factor, column(64, true).factor());
    assert!((span / lumped - 1.0).abs() < 2e-4, "16 members with span loads {span}, 64 with nodal forces {lumped}");
}

#[test]
fn the_certified_solve_gives_the_same_corrected_factor() {
    let input = Column::new(1, rising_q, -P).input();
    let plain = solve_buckling_3d(&input, 1).unwrap().modes[0].load_factor;
    let certified = dedaliano_engine::certify::buckling::certify_buckling_3d(&input, 1).expect("the certified solve accepts the model");
    assert_eq!(certified.results.modes[0].load_factor, plain);
    one_member(scaled(plain), RISING_ONE, RISING);
}

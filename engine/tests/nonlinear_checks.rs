//! Every element and material of the nonlinear framework through the same
//! checks (`nonlinear::check`): the tangent is the derivative of the internal
//! force or stress, symmetric where the formulation is, and the element is
//! objective under rigid motion. Plus the plane-stress J2 hardening laws.

use dedaliano_engine::element::fiber_beam::FiberMaterial;
use dedaliano_engine::nonlinear::check;
use dedaliano_engine::nonlinear::rotation::{self, exp, mat_mul, IDENTITY};
use dedaliano_engine::nonlinear::*;

const E: f64 = 2e8; // kN/m²
const FY: f64 = 250e3;

fn steel(hardening_ratio: f64) -> FiberLaw1D {
    FiberLaw1D::new(FiberMaterial::SteelBilinear { e: E, fy: FY, hardening_ratio })
}

// ==================== 2D elements ====================

const XI: [f64; 2] = [0.0, 0.0];
const XJ: [f64; 2] = [0.6, 0.8];

/// End rotations and a stretch in the element's own frame, after a rigid
/// rotation φ: a deformed state at a large rotation.
fn frame_state(phi: f64, th1: f64, th2: f64, stretch: f64) -> [f64; 6] {
    let (c, s) = (phi.cos(), phi.sin());
    let d = [(XJ[0] - XI[0]) * (1.0 + stretch), (XJ[1] - XI[1]) * (1.0 + stretch)];
    let x = [c * d[0] - s * d[1], s * d[0] + c * d[1]];
    [0.0, 0.0, phi + th1, x[0] - (XJ[0] - XI[0]), x[1] - (XJ[1] - XI[1]), phi + th2]
}

fn frame2d(kin: Kinematics, plastic: bool) -> impl Fn() -> Box<dyn Element> {
    let section = FiberSection2D::rectangle(0.1, 0.2, 21, &steel(0.02));
    move || {
        let basic: Box<dyn BasicResponse2D> =
            if plastic { Box::new(FiberBasic2D::new(1.0, &section, 5)) } else { Box::new(ElasticBasic2D::new(2e6, 1e3, 1.0)) };
        Box::new(Frame2D::new([0, 1, 2, 3, 4, 5], XI, XJ, kin, basic).unwrap()) as Box<dyn Element>
    }
}

#[test]
fn frame2d_tangents_match_finite_differences_and_are_symmetric() {
    for (kin, plastic) in [(Kinematics::Linear, false), (Kinematics::Corotational, false), (Kinematics::Linear, true), (Kinematics::Corotational, true)] {
        // Yielded fibers need curvatures past 2·fy/(E·h) = 0.0125.
        // Linear kinematics is not objective: its states have no rigid rotation.
        let phi = if kin == Kinematics::Corotational { 1.1 } else { 0.0 };
        let u = if plastic { frame_state(phi, 0.012, -0.004, 4e-4) } else { frame_state(phi, 0.003, -0.001, 2e-4) };
        let make = frame2d(kin, plastic);
        let err = check::element_tangent(&make, &u, 1e-8).unwrap();
        assert!(err < 1e-5, "{kin:?}, plastic {plastic}: tangent error {err}");
        let mut e = make();
        e.update(&u).unwrap();
        let sym = check::symmetry(e.tangent(), 6);
        assert!(sym < 1e-10, "{kin:?}, plastic {plastic}: asymmetry {sym}");
    }
}

#[test]
fn corotational_2d_elements_are_objective() {
    let coords = [XI, XJ];
    for plastic in [false, true] {
        let make = frame2d(Kinematics::Corotational, plastic);
        let u = frame_state(0.3, 0.012, -0.004, 4e-4);
        let f_scale = {
            let mut e = make();
            e.update(&u).unwrap();
            e.internal_force().iter().fold(0.0f64, |a, x| a.max(x.abs()))
        };
        for (phi, t) in [(0.7, [0.3, -1.2]), (-2.5, [0.0, 0.0]), (3.0, [5.0, 5.0])] {
            let deformed = check::rigid_motion_2d(&make, &coords, 3, &u, phi, t).unwrap();
            assert!(deformed < 1e-9 * f_scale, "plastic {plastic}: rotated force off by {deformed} (scale {f_scale})");
            let rigid = check::rigid_motion_2d(&make, &coords, 3, &[0.0; 6], phi, t).unwrap();
            assert!(rigid < 1e-9 * f_scale, "plastic {plastic}: a rigid motion strains: {rigid}");
        }
    }
    let truss = || Box::new(Truss2D::new([0, 1, 2, 3], XI, XJ, Kinematics::Corotational, 0.01, Box::new(steel(0.02))).unwrap()) as Box<dyn Element>;
    let u = [0.0, 0.0, 0.002, -0.001];
    let deformed = check::rigid_motion_2d(&truss, &coords, 2, &u, 1.9, [0.4, 0.2]).unwrap();
    let rigid = check::rigid_motion_2d(&truss, &coords, 2, &[0.0; 4], 1.9, [0.4, 0.2]).unwrap();
    assert!(deformed < 1e-6 && rigid < 1e-6, "truss: {deformed}, {rigid}");
    let err = check::element_tangent(&truss, &u, 1e-9).unwrap();
    assert!(err < 1e-5, "truss tangent {err}");
}

// ==================== 3D elements ====================

const X3I: [f64; 3] = [0.0, 0.0, 0.0];
const X3J: [f64; 3] = [0.6, 0.0, 0.8];

fn frame3d(kin: Kinematics, plastic: bool) -> impl Fn() -> Box<dyn Element3D> {
    let section = FiberSection3D::rectangle(0.1, 0.2, 7, 9, &steel(0.02));
    move || {
        let basic: Box<dyn BasicResponse3D> =
            if plastic { Box::new(FiberBasic3D::new(1.0, 1e4, &section, 5)) } else { Box::new(ElasticBasic3D::new(2e6, 3e2, 1e3, 2e3, 1.0)) };
        Box::new(Frame3D::new([0, 1], X3I, X3J, [0.0, 1.0, 0.0], kin, basic).unwrap()) as Box<dyn Element3D>
    }
}

/// A rigid rotation of the element plus small deformation.
fn states3d(rigid: [f64; 3], stretch: f64, w1: [f64; 3], w2: [f64; 3]) -> [NodeState3D; 2] {
    let q = exp(rigid);
    let d = [X3J[0] - X3I[0], X3J[1] - X3I[1], X3J[2] - X3I[2]];
    let m = rotation::mat_vec(&q, [d[0] * (1.0 + stretch), d[1] * (1.0 + stretch), d[2] * (1.0 + stretch)]);
    [
        NodeState3D { x0: X3I, u: [0.0; 3], r: mat_mul(&exp(w1), &q) },
        NodeState3D { x0: X3J, u: [m[0] - d[0], m[1] - d[1], m[2] - d[2]], r: mat_mul(&exp(w2), &q) },
    ]
}

#[test]
fn frame3d_tangents_match_finite_differences() {
    for (kin, plastic) in [(Kinematics::Linear, false), (Kinematics::Corotational, false), (Kinematics::Linear, true), (Kinematics::Corotational, true)] {
        let rigid = if kin == Kinematics::Linear { [0.0; 3] } else { [0.3, -0.9, 0.5] };
        let st = states3d(rigid, 4e-4, [0.004, 0.009, -0.006], [-0.003, -0.011, 0.008]);
        let make = frame3d(kin, plastic);
        let err = check::element3d_tangent(&make, &st, 1e-7, 1e-7).unwrap();
        // Linear kinematics takes log R as the rotation and the tangent with
        // respect to it, while the check perturbs by spatial increments: the
        // two agree to O(θ²), θ ≈ 0.01 here. Co-rotational: exact.
        let bound = if kin == Kinematics::Linear { 2e-4 } else { 1e-5 };
        assert!(err < bound, "{kin:?}, plastic {plastic}: tangent error {err}");
        if kin == Kinematics::Linear {
            let mut e = make();
            e.update(&st).unwrap();
            assert!(check::symmetry(e.tangent(), 12) < 1e-10, "linear 3D frame: symmetric");
        }
    }
}

#[test]
fn corotational_3d_elements_are_objective() {
    for plastic in [false, true] {
        let make = frame3d(Kinematics::Corotational, plastic);
        let st = states3d([0.2, 0.1, -0.3], 4e-4, [0.004, 0.009, -0.006], [-0.003, -0.011, 0.008]);
        let f_scale = {
            let mut e = make();
            e.update(&st).unwrap();
            e.internal_force().iter().fold(0.0f64, |a, x| a.max(x.abs()))
        };
        for (q, t) in [(exp([0.4, -1.3, 2.2]), [1.0, -2.0, 0.5]), (exp([3.0, 0.0, 0.1]), [0.0; 3])] {
            let deformed = check::rigid_motion_3d(&make, &st, &q, t).unwrap();
            assert!(deformed < 1e-8 * f_scale, "plastic {plastic}: rotated force off by {deformed} (scale {f_scale})");
            let undeformed = [NodeState3D { x0: X3I, u: [0.0; 3], r: IDENTITY }, NodeState3D { x0: X3J, u: [0.0; 3], r: IDENTITY }];
            let rigid = check::rigid_motion_3d(&make, &undeformed, &q, t).unwrap();
            assert!(rigid < 1e-8 * f_scale, "plastic {plastic}: a rigid motion strains: {rigid}");
        }
    }
    let truss = || Box::new(Truss3D::new([0, 1], X3I, X3J, Kinematics::Corotational, 0.01, Box::new(steel(0.02))).unwrap()) as Box<dyn Element3D>;
    let st = states3d([0.0; 3], 5e-3, [0.0; 3], [0.0; 3]);
    let err = check::element3d_tangent(&truss, &st, 1e-9, 1e-7).unwrap();
    assert!(err < 1e-5, "3D truss tangent {err}");
    let off = check::rigid_motion_3d(&truss, &st, &exp([0.5, 1.0, -0.7]), [1.0, 1.0, 1.0]).unwrap();
    assert!(off < 1e-6, "3D truss objectivity {off}");
}

// ==================== Uniaxial materials ====================

#[test]
fn uniaxial_tangents_match_finite_differences() {
    let concrete = || Box::new(FiberLaw1D::new(FiberMaterial::ConcreteHognestad { fc: 30e3, eps_c0: 0.002, eps_cu: 0.0035, ft: 3e3 })) as Box<dyn UniaxialMaterial>;
    let steel_m = || Box::new(steel(0.02)) as Box<dyn UniaxialMaterial>;
    let elastic = || Box::new(Elastic1D::new(E)) as Box<dyn UniaxialMaterial>;
    for (name, make, strain) in [
        ("elastic", &elastic as &dyn Fn() -> Box<dyn UniaxialMaterial>, 0.001),
        ("steel, elastic", &steel_m, 0.0005),
        ("steel, plastic", &steel_m, 0.004),
        ("steel, plastic in compression", &steel_m, -0.004),
        ("concrete, ascending", &concrete, -0.001),
        ("concrete, descending", &concrete, -0.0028),
    ] {
        let err = check::uniaxial_tangent(make, strain, 1e-9);
        assert!(err < 1e-5, "{name}: tangent error {err}");
    }
}

// ==================== Plane-stress J2 ====================

fn j2(hardening: Hardening, kinematic: f64) -> PlaneStressJ2 {
    PlaneStressJ2::with_hardening(E, 0.3, hardening, kinematic).unwrap()
}

fn von_mises(s: [f64; 3]) -> f64 {
    (s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3.0 * s[2] * s[2]).sqrt()
}

fn table() -> Hardening {
    Hardening::Table(vec![(0.0, FY), (0.002, 1.2 * FY), (0.01, 1.5 * FY), (0.05, 1.6 * FY)])
}

/// The consistent tangent with each hardening law, at a first plastic step and
/// after a committed plastic history (where kinematic hardening has moved the
/// surface).
#[test]
fn j2_tangents_match_finite_differences_with_every_hardening() {
    let laws: Vec<(&str, Hardening, f64)> = vec![
        ("linear isotropic", Hardening::Linear { fy: FY, h: 0.01 * E }, 0.0),
        ("perfect", Hardening::Linear { fy: FY, h: 0.0 }, 0.0),
        ("kinematic", Hardening::Linear { fy: FY, h: 0.0 }, 0.02 * E),
        ("combined", Hardening::Linear { fy: FY, h: 0.005 * E }, 0.01 * E),
        ("table", table(), 0.0),
        ("table and kinematic", table(), 0.01 * E),
    ];
    for (name, hardening, hk) in laws {
        let fresh = |h: &Hardening| {
            let h = h.clone();
            move || Box::new(j2(h.clone(), hk)) as Box<dyn PlaneStressMaterial>
        };
        let err = check::plane_stress_tangent(&fresh(&hardening), [0.004, -0.0012, 0.0031], 1e-9).unwrap();
        assert!(err < 1e-5, "{name}, first step: tangent error {err}");
        // History: load, commit, then a step in another direction.
        let hist = {
            let h = hardening.clone();
            move || {
                let mut m = j2(h.clone(), hk);
                m.set_trial_strain([0.004, 0.001, 0.0]).unwrap();
                m.commit();
                Box::new(m) as Box<dyn PlaneStressMaterial>
            }
        };
        let err = check::plane_stress_tangent(&hist, [0.0035, -0.002, 0.003], 1e-9).unwrap();
        assert!(err < 1e-5, "{name}, after history: tangent error {err}");
    }
}

/// Kinematic hardening moves the yield surface: after loading in shear to
/// τ_max, reverse shear re-yields at τ_max − 2τ_y (Bauschinger), not at −τ_y.
#[test]
fn kinematic_hardening_shows_the_bauschinger_effect() {
    let g = E / (2.0 * 1.3);
    let tau_y = FY / 3f64.sqrt();
    let mut m = j2(Hardening::Linear { fy: FY, h: 0.0 }, 0.05 * E);
    let gamma1 = 5.0 * tau_y / g;
    m.set_trial_strain([0.0, 0.0, gamma1]).unwrap();
    m.commit();
    let tau_max = m.stress()[2];
    assert!(tau_max > tau_y * 1.01, "hardened: {tau_max} vs τ_y {tau_y}");
    let gamma_reyield = gamma1 - (2.0 * tau_y) / g;
    // Just short of re-yield: elastic unloading.
    let before = gamma_reyield + 1e-3 * tau_y / g;
    m.set_trial_strain([0.0, 0.0, before]).unwrap();
    let elastic = tau_max - g * (gamma1 - before);
    assert!((m.stress()[2] - elastic).abs() < 1e-9 * tau_y, "still elastic: {} vs {elastic}", m.stress()[2]);
    // Past it: plastic in reverse, below the elastic line in magnitude.
    let after = gamma_reyield - 0.5 * tau_y / g;
    m.set_trial_strain([0.0, 0.0, after]).unwrap();
    let elastic = tau_max - g * (gamma1 - after);
    assert!(m.stress()[2] > elastic + 1e-3 * tau_y, "reverse yielding: {} vs elastic {elastic}", m.stress()[2]);
    assert!(m.stress()[2] > -tau_y, "re-yield well before −τ_y (isotropic hardening would wait for it)");
}

/// Along a monotone equal-biaxial path, the stress sits on the tabulated
/// curve: σ_eq = σ_y(α).
#[test]
fn tabulated_hardening_follows_its_curve() {
    let h = table();
    let mut m = j2(h.clone(), 0.0);
    for k in 1..=60 {
        let eps = 0.0005 * k as f64;
        m.set_trial_strain([eps, eps, 0.0]).unwrap();
        m.commit();
        let alpha = m.equivalent_plastic_strain();
        if alpha > 0.0 {
            let points = match &h {
                Hardening::Table(p) => p.clone(),
                _ => unreachable!(),
            };
            let expected = points
                .windows(2)
                .find(|w| alpha < w[1].0)
                .map_or(points[points.len() - 1].1, |w| w[0].1 + (w[1].1 - w[0].1) * (alpha - w[0].0) / (w[1].0 - w[0].0));
            assert!((von_mises(m.stress()) - expected).abs() < 1e-8 * FY, "α = {alpha}: σ_eq {} vs table {expected}", von_mises(m.stress()));
        }
    }
    assert!(m.equivalent_plastic_strain() > 0.05, "the path reached the flat end of the table");
}

/// A strain increment of a thousand yield strains in one step converges: the
/// bracket keeps Newton on Δγ from overshooting through the table's kinks.
#[test]
fn j2_return_survives_a_huge_increment() {
    for (hardening, hk) in [(table(), 0.0), (Hardening::Linear { fy: FY, h: 0.0 }, 0.0), (table(), 0.01 * E)] {
        let mut m = j2(hardening, hk);
        let eps = 1000.0 * FY / E;
        m.set_trial_strain([eps, -0.3 * eps, 0.7 * eps]).unwrap();
        assert!(m.stress().iter().all(|x| x.is_finite()));
        assert!(m.equivalent_plastic_strain() > 0.0);
    }
}

/// A softening slope steeper than −3G has no unique return and is refused;
/// a mild one is accepted.
#[test]
fn j2_refuses_softening_steeper_than_three_g() {
    let g = E / (2.0 * 1.3);
    let steep = Hardening::Table(vec![(0.0, FY), (1e-4, FY - 4.0 * g * 1e-4)]);
    let mut m = j2(steep, 0.0);
    let err = m.set_trial_strain([0.01, 0.01, 0.0]).unwrap_err();
    assert!(err.contains("softening"), "{err}");
    let mild = Hardening::Table(vec![(0.0, FY), (0.01, 0.9 * FY)]);
    let mut m = j2(mild, 0.0);
    m.set_trial_strain([0.004, 0.004, 0.0]).unwrap();
    assert!(von_mises(m.stress()) < FY);
}

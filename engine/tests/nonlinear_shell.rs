//! The layered shell of the nonlinear framework (src/nonlinear/shell.rs):
//! against the engine's linear MITC4, plate closed forms and plastic
//! collapse bounds, and through the element checks.
use dedaliano_engine::element::quad::{mitc4_local_stiffness, quad_transform_3d};
use dedaliano_engine::nonlinear::check;
use dedaliano_engine::nonlinear::rotation::{exp, mat_mul, IDENTITY};
use dedaliano_engine::nonlinear::*;

const E: f64 = 2.1e8;
const NU: f64 = 0.3;

fn g() -> f64 {
    E / (2.0 * (1.0 + NU))
}

fn elastic(t: f64) -> LayeredSection {
    LayeredSection::uniform(t, 5, &PlaneStressElastic::new(E, NU), g()).unwrap()
}

fn plastic(t: f64, fy: f64) -> LayeredSection {
    LayeredSection::uniform(t, 7, &PlaneStressJ2::new(E, NU, fy, 0.0), g()).unwrap()
}

/// A skewed, rotated quad in space (not in a coordinate plane).
fn skew_quad() -> [[f64; 3]; 4] {
    let q = exp([0.3, -0.5, 0.7]);
    let p = [[0.0, 0.0], [1.2, 0.1], [1.0, 0.9], [-0.1, 1.1]];
    std::array::from_fn(|i| {
        let x = [p[i][0], p[i][1], 0.0];
        [q[0][0] * x[0] + q[0][1] * x[1] + 0.4, q[1][0] * x[0] + q[1][1] * x[1] - 0.2, q[2][0] * x[0] + q[2][1] * x[1] + 1.0]
    })
}

fn states(x: &[[f64; 3]; 4], scale: f64) -> Vec<NodeState3D> {
    let u = [[0.01, -0.02, 0.03], [-0.015, 0.01, 0.02], [0.02, 0.01, -0.01], [0.0, -0.01, 0.025]];
    let th = [[0.05, -0.03, 0.02], [-0.04, 0.06, 0.01], [0.03, 0.02, -0.05], [-0.02, -0.04, 0.03]];
    (0..4)
        .map(|i| NodeState3D { x0: x[i], u: u[i].map(|v| v * scale), r: exp(th[i].map(|v| v * scale)) })
        .collect()
}

/// At the undeformed state the shell's bending, transverse shear and
/// drilling stiffness is the engine's MITC4's (whose membrane differs: it
/// carries EAS modes).
#[test]
fn bending_and_shear_stiffness_are_the_engine_mitc4() {
    let t = 0.05;
    let x = [[0.0, 0.0, 0.0], [1.2, 0.1, 0.0], [1.0, 0.9, 0.0], [-0.1, 1.1, 0.0]];
    for kin in [Kinematics::Linear, Kinematics::Corotational] {
        let s = Shell4::new([0, 1, 2, 3], x, kin, &elastic(t)).unwrap();
        let k = s.tangent();
        // The engine's matrix is in the element's axes: Tᵀ·K·T.
        let (kl, tm) = (mitc4_local_stiffness(&x, E, NU, t), quad_transform_3d(&x));
        let r: Vec<f64> = (0..576)
            .map(|q| {
                let (i, j) = (q / 24, q % 24);
                (0..24).map(|a| tm[24 * a + i] * (0..24).map(|b| kl[24 * a + b] * tm[24 * b + j]).sum::<f64>()).sum()
            })
            .collect();
        let scale = r.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let mut err = 0.0f64;
        for i in 0..24 {
            for j in 0..24 {
                if [2, 3, 4].contains(&(i % 6)) && [2, 3, 4].contains(&(j % 6)) {
                    err = err.max((k[24 * i + j] - r[24 * i + j]).abs());
                }
            }
        }
        println!("{kin:?}: bending/shear max diff {:.2e} of {scale:.2e}", err);
        assert!(err < 1e-12 * scale, "{kin:?}: {err:e}");
    }
}

/// An nx × ny grid of shells over [0, a] × [0, b] in the plane z = 0: the
/// model and the node at (i, j).
fn grid(a: f64, b: f64, nx: usize, ny: usize, kin: Kinematics, section: &LayeredSection) -> (Model3D, Vec<Vec<usize>>) {
    let mut m = Model3D::new();
    let ids: Vec<Vec<usize>> = (0..=nx).map(|i| (0..=ny).map(|j| m.add_node([a * i as f64 / nx as f64, b * j as f64 / ny as f64, 0.0])).collect()).collect();
    for i in 0..nx {
        for j in 0..ny {
            let n = [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]];
            let x = n.map(|k| m.coords(k));
            m.add_element(Box::new(Shell4::new(n, x, kin, section).unwrap()));
        }
    }
    (m, ids)
}

/// A quarter of a simply supported (hard) square plate of side `a`, n × n
/// elements, uniform pressure 1 as nodal loads; in-plane DOFs restrained.
fn quarter_plate(a: f64, n: usize, kin: Kinematics, section: &LayeredSection) -> (Model3D, usize) {
    let h = 0.5 * a / n as f64;
    let (mut m, ids) = grid(0.5 * a, 0.5 * a, n, n, kin, section);
    for i in 0..=n {
        for j in 0..=n {
            let node = ids[i][j];
            let mut fix = [true, true, false, false, false, true];
            if i == 0 { fix[2] = true; fix[3] = true; }
            if j == 0 { fix[2] = true; fix[4] = true; }
            if i == n { fix[4] = true; }
            if j == n { fix[3] = true; }
            m.fix(node, fix);
            let wx = if i == 0 || i == n { 0.5 } else { 1.0 };
            let wy = if j == 0 || j == n { 0.5 } else { 1.0 };
            m.add_load(node, [0.0, 0.0, -wx * wy * h * h, 0.0, 0.0, 0.0]);
        }
    }
    (m, ids[n][n])
}

/// Gauss–Lobatto layers integrate the elastic section exactly: membrane t,
/// bending t³/12, from 3 points on.
#[test]
fn lobatto_layers_integrate_the_elastic_section_exactly() {
    for n in 3..10 {
        let mut s = LayeredSection::uniform(2.0, n, &PlaneStressElastic::new(1.0, 0.0), 0.5).unwrap();
        assert!((s.thickness() - 2.0).abs() < 1e-14, "n = {n}");
        let (_, d) = s.update([0.0; 6]).unwrap();
        assert!((d[0] - 2.0).abs() < 1e-14 && (d[21] - 2.0 / 3.0).abs() < 1e-14, "n = {n}: {} {}", d[0], d[21]);
        assert!(d[3].abs() < 1e-14, "no membrane-bending coupling in a symmetric section");
    }
}

/// The layered section's tangent is the derivative of its resultants, also
/// once its layers have yielded, from a state with history.
#[test]
fn the_layered_section_tangent_is_consistent() {
    let mut s = plastic(0.02, 2.5e5);
    s.update([4e-4, -1e-4, 2e-4, 0.15, -0.05, 0.08]).unwrap();
    s.commit();
    let e = [6e-4, 1e-4, -1e-4, 0.25, 0.1, -0.05];
    let (_, d) = s.clone().update(e).unwrap();
    let scale = d.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let mut err = 0.0f64;
    for j in 0..6 {
        let h = if j < 3 { 1e-9 } else { 1e-7 };
        let (mut ep, mut em) = (e, e);
        ep[j] += h;
        em[j] -= h;
        let (sp, _) = s.clone().update(ep).unwrap();
        let (sm, _) = s.clone().update(em).unwrap();
        for i in 0..6 {
            let col = if j < 3 { scale } else { scale * 0.02 * 0.02 };
            err = err.max(((sp[i] - sm[i]) / (2.0 * h) - d[6 * i + j]).abs() / col);
        }
    }
    assert!(err < 1e-5, "{err:e}");
}

/// The element checks: the tangent against central differences of the
/// internal force (spatial rotation increments), elastic and yielded; and,
/// co-rotational, objectivity: a rigid motion strains nothing, and a rotated
/// state has the rotated internal force.
#[test]
fn shell_tangents_and_objectivity() {
    let x = skew_quad();
    for (label, sec) in [("elastic", elastic(0.05)), ("plastic", plastic(0.05, 2e5))] {
        let co = || -> Box<dyn Element3D> { Box::new(Shell4::new([0, 1, 2, 3], x, Kinematics::Corotational, &sec).unwrap()) };
        for scale in [0.0, 1.0, 4.0] {
            let e = check::element3d_tangent(&co, &states(&x, scale), 1e-6, 1e-6).unwrap();
            assert!(e < 2e-5, "{label}, co-rotational, ×{scale}: {e:e}");
        }
        // Small-displacement kinematics takes log R for the rotations; it
        // agrees with spatial increments to O(θ) at a rotation θ.
        let lin = || -> Box<dyn Element3D> { Box::new(Shell4::new([0, 1, 2, 3], x, Kinematics::Linear, &sec).unwrap()) };
        assert!(check::element3d_tangent(&lin, &states(&x, 0.0), 1e-6, 1e-6).unwrap() < 1e-9, "{label}, linear");

        let q = mat_mul(&exp([0.4, 1.1, -0.6]), &IDENTITY);
        let st = states(&x, 1.0);
        let mut e = co();
        e.update(&st).unwrap();
        let fmax = e.internal_force().iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let err = check::rigid_motion_3d(&co, &st, &q, [0.3, -1.0, 2.0]).unwrap();
        assert!(err < 1e-9 * fmax, "{label}: {err:e} of {fmax:e}");
        let err = check::rigid_motion_3d(&co, &states(&x, 0.0), &q, [0.3, -1.0, 2.0]).unwrap();
        assert!(err < 1e-12 * fmax, "{label}: a rigid motion strains {err:e}");
    }
}

/// A simply supported square plate under uniform pressure: the centre
/// deflection is Navier's, 0.00406·q·a⁴/D (a/t = 100: shear adds 0.02 %).
#[test]
fn a_square_plate_deflects_as_navier() {
    let (a, t): (f64, f64) = (1.0, 0.01);
    let d = E * t * t * t / (12.0 * (1.0 - NU * NU));
    let navier = 0.004_062_35 * a.powi(4) / d;
    for (n, tol) in [(8usize, 1e-3), (16, 5e-4)] {
        let (mut m, c) = quarter_plate(a, n, Kinematics::Linear, &elastic(t));
        let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 1 }, &NewtonOptions::default()).unwrap();
        let w = -out.u[6 * c + 2];
        assert!((w / navier - 1.0).abs() < tol, "{n}×{n}: {w:e} vs {navier:e}");
    }
}

/// The same plate, perfectly plastic (von Mises): its collapse pressure is
/// bracketed by the yield-line load 24·m_p/a² and that load with the von
/// Mises hinge moment 2/√3·m_p, m_p = σ_y·t²/4. Two meshes agree to 3 %.
#[test]
fn a_plastic_square_plate_collapses_near_the_yield_line_load() {
    let (a, t, fy) = (1.0, 0.01, 2.5e5);
    let mp = fy * t * t / 4.0;
    let mut peaks = Vec::new();
    for n in [4usize, 8] {
        let (mut m, _) = quarter_plate(a, n, Kinematics::Linear, &plastic(t, fy));
        let out = solve(&mut m, &Strategy::ArcLength { target: 40.0 * mp / (a * a), increments: 20, max_steps: 80 }, &NewtonOptions::default()).unwrap();
        peaks.push(out.steps.iter().map(|s| s.lambda).fold(0.0f64, f64::max) * a * a / mp);
    }
    let upper = 24.0 * 2.0 / 3f64.sqrt();
    for &p in &peaks {
        assert!(p > 0.98 * 24.0 && p < upper, "collapse {p:.3}·m_p/a² outside [24, {upper:.2}]");
    }
    assert!((peaks[0] / peaks[1] - 1.0).abs() < 0.03, "{peaks:?}");
}

/// A cantilever strip (ν = 0) rolled by an end moment π·EI/L into a half
/// circle: its tip lands over the root at height 2L/π.
#[test]
fn an_end_moment_rolls_a_strip_into_a_half_circle() {
    use std::f64::consts::PI;
    let (l, b, t, n) = (10.0, 1.0, 0.1, 16);
    let sec = LayeredSection::uniform(t, 3, &PlaneStressElastic::new(E, 0.0), E / 2.0).unwrap();
    let ei = E * b * t * t * t / 12.0;
    let (mut m, ids) = grid(l, b, n, 1, Kinematics::Corotational, &sec);
    m.fix(ids[0][0], [true; 6]);
    m.fix(ids[0][1], [true; 6]);
    for j in 0..2 {
        m.add_load(ids[n][j], [0.0, 0.0, 0.0, 0.0, -0.5 * PI * ei / l, 0.0]);
    }
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 10 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    for j in 0..2 {
        let tip = ids[n][j];
        assert!((out.u[6 * tip] + l).abs() < 1e-3 * l, "u_x {}", out.u[6 * tip]);
        assert!((out.u[6 * tip + 2] / (2.0 * l / PI) - 1.0).abs() < 5e-3, "u_z {}", out.u[6 * tip + 2]);
    }
}

/// A simply supported square plate in uniaxial compression buckles at
/// N_cr = 4π²D/b²: two meshes converge to it as h², and their Richardson
/// extrapolation is within 0.5 %. The shell's initial-stress stiffness.
#[test]
fn a_square_plate_in_compression_buckles_at_four_pi_squared_d() {
    use std::f64::consts::PI;
    let (a, t) = (1.0, 0.01);
    let ncr = 4.0 * PI * PI * E * t * t * t / (12.0 * (1.0 - NU * NU)) / (a * a);
    let mut f = Vec::new();
    for n in [8usize, 12] {
        let (mut m, ids) = grid(a, a, n, n, Kinematics::Corotational, &elastic(t));
        for i in 0..=n {
            for j in 0..=n {
                let mut fix = [false; 6];
                fix[2] = i == 0 || i == n || j == 0 || j == n;
                fix[0] = i == 0;
                fix[1] = i == 0 && j == 0;
                m.fix(ids[i][j], fix);
                if i == n {
                    let w = if j == 0 || j == n { 0.5 } else { 1.0 };
                    m.add_load(ids[i][j], [-w * a / n as f64, 0.0, 0.0, 0.0, 0.0, 0.0]);
                }
            }
        }
        f.push(linear_buckling(&mut m, &BucklingOptions::default()).unwrap().factors[0]);
    }
    assert!(f[0] > f[1] && f[1] > ncr && f[1] / ncr - 1.0 < 0.02, "{f:?} vs {ncr}");
    let r = (12.0f64 / 8.0).powi(2);
    let extrapolated = (r * f[1] - f[0]) / (r - 1.0);
    assert!((extrapolated / ncr - 1.0).abs() < 5e-3, "{extrapolated} vs {ncr}");
}

/// Quarter of a simply supported square plate in uniform compression.
/// Symmetry planes are x = a/2 and y = a/2. The loaded edge x = 0 is
/// free to shorten nonuniformly; the unloaded edge y = 0 is free in-plane.
/// Reference edge traction is fy*t, so lambda is the mean stress / fy.
fn compressed_quarter(n: usize, t: f64, fy: f64, offsets: Option<&[[f64; 3]]>, section: &LayeredSection) -> (Model3D, usize) {
    let mut m = Model3D::new();
    let h = 0.5 / n as f64;
    let ids: Vec<Vec<usize>> = (0..=n).map(|i| (0..=n).map(|j| {
        let z = offsets.map_or(0.0, |v| v[i * (n + 1) + j][2]);
        m.add_node([i as f64 * h, j as f64 * h, z])
    }).collect()).collect();
    for i in 0..n {
        for j in 0..n {
            let nodes = [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]];
            m.add_element(Box::new(Shell4::new(nodes, nodes.map(|k| m.coords(k)), Kinematics::Corotational, section).unwrap()));
        }
    }
    for i in 0..=n {
        for j in 0..=n {
            m.fix(ids[i][j], [i == n, j == n, i == 0 || j == 0, j == n, i == n, i == n || j == n]);
            if i == 0 {
                let w = if j == 0 || j == n { 0.5 } else { 1.0 };
                m.add_load(ids[i][j], [w * h * fy * t, 0.0, 0.0, 0.0, 0.0, 0.0]);
            }
        }
    }
    (m, ids[n][n])
}

/// A mode-imperfect plate, followed by centre-deflection control beyond
/// its load peak. Default convergence criteria stay enabled: the b/420,
/// n=6 case stalled before yield when the projector used finite differences.
fn plate_gmnia(n: usize, slenderness: f64, amplitude: f64) -> Outcome {
    use std::f64::consts::PI;
    let fy = 2.5e5;
    let t = (12.0 * (1.0 - NU * NU) * fy / E).sqrt() / (2.0 * PI * slenderness);
    let (mut perfect, center) = compressed_quarter(n, t, fy, None, &elastic(t));
    let b = linear_buckling(&mut perfect, &BucklingOptions { modes: 1, ..Default::default() }).unwrap();
    assert_eq!(b.factors.len(), 1);
    assert!((b.factors[0] * slenderness.powi(2) - 1.0).abs() < 0.02, "LBA {:?}", b.factors);
    let mode = perfect.translations(&b.modes[0]);
    assert!((mode[center][2] - 1.0).abs() < 1e-8, "first mode must have positive unit centre deflection");
    let offsets: Vec<[f64; 3]> = mode.iter().map(|v| [0.0, 0.0, amplitude * v[2]]).collect();
    let (mut m, center) = compressed_quarter(n, t, fy, Some(&offsets), &plastic(t, fy));
    let mut initial = vec![0.0; m.n_dofs()];
    m.assemble(&mut initial, &mut |_, _, _| {}).unwrap();
    assert!(initial.iter().all(|f| f.abs() < 1e-10 * fy * t), "the imperfect reference geometry must be stress-free");
    let target = amplitude.signum() * 2.5 * t;
    let out = solve(&mut m, &Strategy::DisplacementControl { dof: 6 * center + 2, target, increments: 50 },
        &NewtonOptions { max_total_iterations: Some(1500), ..Default::default() }).unwrap();
    assert!(out.completed(), "n={n}, slenderness={slenderness}, amplitude={amplitude}: {:?}", out.termination);
    assert!((out.u[6 * center + 2] / target - 1.0).abs() < 1e-10);
    let (index, peak) = out.steps.iter().enumerate().max_by(|(_, a), (_, b)| a.lambda.total_cmp(&b.lambda)).unwrap();
    assert!(index > 0 && index + 2 < out.steps.len(), "must resolve both sides of the peak");
    assert!(out.lambda < 0.99 * peak.lambda, "must follow the descending branch");
    assert!(out.steps.iter().all(|s| s.lambda.is_finite() && s.lambda > 0.0 && s.u.iter().all(|u| u.is_finite())));
    if slenderness >= 1.5 {
        assert!(peak.lambda > 1.1 * b.factors[0], "slender plate must carry load beyond elastic buckling");
    }
    let reaction: f64 = out.reactions.iter().step_by(6).sum();
    let load = 0.5 * fy * t * out.lambda;
    assert!((reaction + load).abs() < 1e-8 * load, "reaction {reaction}, applied load {load}");
    println!("quarter {n}, slenderness {slenderness}, e0={amplitude}: peak={:.6}, final={:.6}, Newton iterations={}", peak.lambda, out.lambda, out.newton_iterations);
    out
}

fn peak(out: &Outcome) -> f64 {
    out.steps.iter().map(|s| s.lambda).fold(0.0, f64::max)
}

/// Winter is an engineering comparison, not an exact FE oracle. JRC's
/// 2007 commentary to EN 1993-1-5, section 12.4.1 (printed p.145), reports
/// b/420 without residual stresses as one calibration against that curve:
/// https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/EUR22898EN.pdf
/// Here loaded edges can shorten nonuniformly, unloaded edges are free
/// in-plane, and quarter symmetry excludes asymmetric modes. Keep the
/// 15% strength comparison separate from the tighter mesh/path checks.
#[test]
fn imperfect_plate_strength_mesh_convergence_and_imperfection_sensitivity() {
    let amplitude = 1.0 / 420.0;
    let mut mesh_peaks = Vec::new();
    for n in [6usize, 8, 12] {
        mesh_peaks.push(peak(&plate_gmnia(n, 1.5, amplitude)));
    }
    let winter = |slenderness: f64| (slenderness - 0.22) / slenderness.powi(2);
    let mut strengths = vec![(1.5, mesh_peaks[2])];
    for slenderness in [1.0, 2.0] {
        strengths.push((slenderness, peak(&plate_gmnia(8, slenderness, amplitude))));
    }
    for (slenderness, p) in strengths {
        assert!((p / winter(slenderness) - 1.0).abs() < 0.15, "slenderness {slenderness}: {p} vs Winter {}", winter(slenderness));
    }
    assert!(mesh_peaks[0] > mesh_peaks[1] && mesh_peaks[1] > mesh_peaks[2], "{mesh_peaks:?}");
    assert!((mesh_peaks[1] / mesh_peaks[2] - 1.0).abs() < 0.02, "{mesh_peaks:?}");
    assert!(mesh_peaks[1] - mesh_peaks[2] < mesh_peaks[0] - mesh_peaks[1], "mesh differences must shrink");
    let larger_imperfection = peak(&plate_gmnia(8, 1.5, 1.0 / 200.0));
    assert!(larger_imperfection < 0.98 * mesh_peaks[1], "larger imperfection must reduce strength");
    let reflected = peak(&plate_gmnia(8, 1.5, -amplitude));
    assert!((reflected / mesh_peaks[1] - 1.0).abs() < 1e-7, "reflection must preserve strength: {reflected} vs {}", mesh_peaks[1]);
}

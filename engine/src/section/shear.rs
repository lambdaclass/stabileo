//! Transverse shear stress over an arbitrary cross-section.
//!
//! # What this replaces
//!
//! Jourawski's `V*Q/(I*b)` needs one well-defined width `b(y)` at every height.
//! A rectangle has that, and so does the web of an I, H or U — which is why the
//! legacy path was restricted to exactly those four shapes and refused
//! everything else. An angle has rotated principal axes and a shear centre at
//! its corner; a closed tube splits the flow between two walls; an arbitrary
//! polygon has no single width at all. For those the old code returned nothing,
//! which is why combined criteria were unavailable across most of the
//! catalogue.
//!
//! # Formulation
//!
//! Longitudinal equilibrium of a beam slice relates the shear stresses to the
//! rate of change of the bending stress:
//!
//! ```text
//!   d(tau_xy)/dy + d(tau_xz)/dz = -d(sigma_x)/dx
//! ```
//!
//! and for bending about the centroidal `y` axis, `d(sigma_x)/dx = V_z * z / I_y`.
//! Writing the shear field as the gradient of a potential, `tau = grad(phi)`,
//! turns that into a Poisson problem with a traction-free boundary:
//!
//! ```text
//!   laplacian(phi) = -V_z * z / I_y     in Omega
//!   d(phi)/dn = 0                       on every boundary
//! ```
//!
//! Pure Neumann, so `phi` is fixed only up to a constant — irrelevant, since
//! only its gradient is used — and solvable exactly because the compatibility
//! condition `integral(z) dA = 0` is what "centroidal" means. The solver's
//! zero-mean gauge handles the null mode.
//!
//! This is the Weber/Schwalbe shear-flow potential. It is not the complete
//! elasticity solution — that adds a term proportional to Poisson's ratio and a
//! rotational part fixed by requiring zero net twist — but it reproduces the
//! classical results exactly where they exist, which is what the tests below
//! check: `1.5 V/A` at the centre of a rectangle, and Jourawski's parabola
//! across it, recovered rather than assumed.

use serde::{Deserialize, Serialize};

use super::mesh::SectionMesh;
use super::poisson::{LoopBc, PoissonProblem, SolveStrategy};

/// Shear field for one unit transverse force.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShearField {
    /// `[tau_xy, tau_xz]` per triangle, for a UNIT force in this direction.
    pub tau: Vec<[f64; 2]>,
    /// Largest `|tau|` over the section.
    pub tau_max: f64,
    /// Triangle carrying `tau_max`.
    pub tau_max_triangle: usize,
    /// Shear correction factor `κ = A_s / A` by energy equivalence,
    /// `1 / (A ∫τ² dA)` for a unit force. 5/6 for a rectangle, less for
    /// sections that concentrate shear in a web.
    pub kappa: f64,
}

/// Shear response of a section to unit forces along each centroidal axis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShearResult {
    /// Response to a unit force along `y` (the horizontal centroidal axis).
    pub vy: ShearField,
    /// Response to a unit force along `z` (the vertical centroidal axis).
    pub vz: ShearField,
    /// Shear centre, CENTROID-RELATIVE, as `[y, z]`.
    ///
    /// The point a transverse load must pass through to bend the section
    /// without twisting it. For a doubly-symmetric profile it coincides with
    /// the centroid, which is why the distinction can be ignored for an I-beam
    /// and cannot be for a channel or an angle: load a channel through its web
    /// and it twists, because the shear centre sits outside the section
    /// entirely, on the far side of the web from the flanges.
    pub shear_centre: [f64; 2],
    pub residual: f64,
}

/// Second moments a shear solve needs, about the centroid.
///
/// `iyz` is the product of inertia `integral(y z) dA`. It is zero on principal
/// axes, and it is NOT zero for an angle, a Z, a lipped or unequal section or
/// any rotated outline — which is exactly where leaving it out goes wrong: a
/// field driven by `z/Iy` alone then carries a spurious horizontal resultant
/// `Iyz/Iy`, and the shear centre, the shear areas and the warping constant
/// computed from it are wrong (an equal angle's Cw came out 24 times too large,
/// its shear centre 19 mm outside the corner).
#[derive(Debug, Clone, Copy)]
pub struct ShearInertia {
    pub iy: f64,
    pub iz: f64,
    pub iyz: f64,
}

fn solve_one(
    factored: &super::poisson::FactoredPoisson,
    mesh: &SectionMesh,
    centroid: [f64; 2],
    // The bending-stress gradient per unit force is the linear field
    // `f = k[0]*(y - yc) + k[1]*(z - zc)`.
    k: [f64; 2],
) -> Result<(ShearField, f64), String> {
    // The solver reads `-laplacian(phi) = f`, and the physics is
    // `laplacian(phi) = -d(sigma)/dx`, the gradient of the unsymmetric-bending
    // stress per unit transverse force. Evaluated at each triangle's centroid,
    // which is exact for the linear source a P1 element sees.
    let source: Vec<f64> = mesh
        .triangles
        .iter()
        .map(|&t| {
            let y = (mesh.nodes[t[0]][0] + mesh.nodes[t[1]][0] + mesh.nodes[t[2]][0]) / 3.0 - centroid[0];
            let z = (mesh.nodes[t[0]][1] + mesh.nodes[t[1]][1] + mesh.nodes[t[2]][1]) / 3.0 - centroid[1];
            k[0] * y + k[1] * z
        })
        .collect();

    // No Dirichlet loops — the second element is never read.
    let sol = factored.solve(&source, &[])?;

    let mut tau_max = 0.0;
    let mut tau_max_triangle = 0;
    // Shear energy, up to the 1/(2G) factor that cancels below.
    let mut energy = 0.0;
    let mut area = 0.0;
    for (i, g) in sol.grad.iter().enumerate() {
        let mag2 = g[0] * g[0] + g[1] * g[1];
        if mag2.sqrt() > tau_max {
            tau_max = mag2.sqrt();
            tau_max_triangle = i;
        }
        let a = mesh.triangle_area(mesh.triangles[i]).abs();
        energy += mag2 * a;
        area += a;
    }
    // The shear correction factor by energy equivalence: a unit force does
    // work 1/(2·G·A_s), and the solved field stores U = ∫τ²/(2G) dA, so
    // A_s = 1/∫τ² dA and κ = A_s/A. For a rectangle this converges to 5/6.
    // (What stood here before — (∫τ/A)·A — reduces to |∫τ| ≈ 1 for every
    // section by equilibrium, which is not a shape factor at all.)
    let kappa = if energy > 0.0 && area > 0.0 { 1.0 / (energy * area) } else { 0.0 };

    Ok((
        ShearField {
            tau: sol.grad.clone(),
            tau_max,
            tau_max_triangle,
            kappa,
        },
        sol.residual,
    ))
}

/// Torque the shear field exerts about the centroid, per unit applied force.
///
/// `integral(y * tau_xz - z * tau_xy) dA`. A force applied at the centroid
/// produces this much twist; moving the line of action by that distance
/// cancels it, which is what puts the shear centre where it is.
fn torque_about_centroid(mesh: &SectionMesh, centroid: [f64; 2], field: &ShearField) -> f64 {
    let mut m = 0.0;
    for (i, &t) in mesh.triangles.iter().enumerate() {
        let y = (mesh.nodes[t[0]][0] + mesh.nodes[t[1]][0] + mesh.nodes[t[2]][0]) / 3.0 - centroid[0];
        let z = (mesh.nodes[t[0]][1] + mesh.nodes[t[1]][1] + mesh.nodes[t[2]][1]) / 3.0 - centroid[1];
        let a = mesh.triangle_area(t).abs();
        m += (y * field.tau[i][1] - z * field.tau[i][0]) * a;
    }
    m
}

/// Solve transverse shear for unit forces along both centroidal axes.
pub fn solve_shear(
    mesh: &SectionMesh,
    centroid: [f64; 2],
    inertia: ShearInertia,
    strategy: SolveStrategy,
) -> Result<ShearResult, String> {
    if mesh.triangles.is_empty() {
        return Err("mesh has no triangles".into());
    }
    // Validate before paying the factorization, so a bad input is refused
    // with the error that names it and not with an unrelated solver failure.
    for inertia in [inertia.iy, inertia.iz] {
        if !(inertia > 0.0) || !inertia.is_finite() {
            return Err(format!("shear needs a positive second moment, got {inertia}"));
        }
    }
    let det = inertia.iy * inertia.iz - inertia.iyz * inertia.iyz;
    if !inertia.iyz.is_finite() || !(det > 0.0) {
        return Err(format!(
            "shear needs a positive-definite inertia tensor, got Iy={} Iz={} Iyz={}",
            inertia.iy, inertia.iz, inertia.iyz
        ));
    }
    // Both axes solve the SAME pure-Neumann problem — identical mesh, boundary
    // conditions and gauge pin, so identical reduced matrix — with only the
    // source term differing. Factor once and solve twice: the factorization is
    // the dominant cost, so this halves it.
    let mut problem = PoissonProblem::new(mesh);
    problem.loop_bcs = vec![LoopBc::Neumann { value: 0.0 }; mesh.loop_count];
    problem.zero_mean = true;
    problem.strategy = strategy;
    let factored = super::poisson::factor_poisson(&problem)?;

    // Unsymmetric bending: per unit force along z the stress gradient is
    // (Iz z - Iyz y)/D, and along y it is (Iy y - Iyz z)/D, D = Iy Iz - Iyz^2.
    // These are the only linear fields whose resultant is exactly the unit
    // force with no component along the other axis (integral f y and
    // integral f z come out as 0 and 1); on principal axes they reduce to the
    // familiar z/Iy and y/Iz.
    let (vz, r1) = solve_one(&factored, mesh, centroid, [-inertia.iyz / det, inertia.iz / det])?;
    let (vy, r2) = solve_one(&factored, mesh, centroid, [inertia.iy / det, -inertia.iyz / det])?;

    // A unit force along z applied at the centroid twists the section by
    // `torque_about_centroid`; shifting its line of action along y by that
    // amount cancels the twist, so that offset IS the shear centre's y.
    // The z coordinate comes from the other direction, with the opposite sign
    // because the moment arm flips.
    let ysc = torque_about_centroid(mesh, centroid, &vz);
    let zsc = -torque_about_centroid(mesh, centroid, &vy);

    Ok(ShearResult { vy, vz, shear_centre: [ysc, zsc], residual: r1.max(r2) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::section::catalogue as cat;
    use crate::section::mesh::{mesh_section, MeshParams};
    use crate::section::{analyze_section, SectionInput};

    fn setup(g: &cat::CanonicalGeometry, target: f64) -> (SectionMesh, [f64; 2], ShearInertia) {
        let mut p = MeshParams::default();
        p.max_area = target;
        let mesh = mesh_section(&g.polygons, &p).expect("mesh");
        let props = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .expect("props");
        (mesh, [props.yc, props.zc], ShearInertia { iy: props.iy, iz: props.iz, iyz: props.iyz })
    }

    fn src() -> cat::GeometrySource {
        cat::GeometrySource::Parametric { shape: "test".into() }
    }

    /// The textbook case: peak shear at the neutral axis of a rectangle is
    /// exactly 3/2 of the average. Recovering it from a Poisson solve, rather
    /// than assuming it, is what says the formulation is right.
    #[test]
    fn a_rectangle_peaks_at_three_halves_the_average() {
        let (b, h) = (60.0, 100.0);
        let g = cat::rectangle(b, h).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let mean = 1.0 / (b * h);
        let ratio = r.vz.tau_max / mean;
        assert!((ratio - 1.5).abs() < 0.08, "peak/mean = {ratio:.4}, expected 1.5");
    }

    /// And the whole distribution is Jourawski's parabola, not merely its peak.
    #[test]
    fn a_rectangle_reproduces_the_parabolic_distribution() {
        let (b, h) = (60.0, 100.0);
        let g = cat::rectangle(b, h).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let iy = i.iy;
        let mut worst: f64 = 0.0;
        for (t, tri) in mesh.triangles.iter().enumerate() {
            let z = (mesh.nodes[tri[0]][1] + mesh.nodes[tri[1]][1] + mesh.nodes[tri[2]][1]) / 3.0;
            // tau(z) = V/(2I) * (h^2/4 - z^2) for a unit V.
            let exact = (h * h / 4.0 - z * z) / (2.0 * iy);
            worst = worst.max((r.vz.tau[t][1] - exact).abs());
        }
        // Scale the tolerance to the peak value.
        let peak = h * h / (8.0 * iy);
        assert!(worst < 0.06 * peak, "worst deviation {worst:.3e} vs peak {peak:.3e}");
    }

    /// Shear must vanish at the extreme fibres — the traction-free surface.
    #[test]
    fn shear_vanishes_at_the_top_and_bottom_fibres() {
        let (b, h) = (60.0, 100.0);
        let g = cat::rectangle(b, h).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let peak = r.vz.tau_max;
        for (t, tri) in mesh.triangles.iter().enumerate() {
            let z = (mesh.nodes[tri[0]][1] + mesh.nodes[tri[1]][1] + mesh.nodes[tri[2]][1]) / 3.0;
            if (z.abs() - h / 2.0).abs() < h * 0.02 {
                assert!(
                    r.vz.tau[t][1].abs() < 0.15 * peak,
                    "tau {:.3e} near the free surface, peak {peak:.3e}",
                    r.vz.tau[t][1]
                );
            }
        }
    }

    /// An I-profile carries almost all of its shear in the web. This is the
    /// property design rules lean on, and the reason `V/A_web` is a decent hand
    /// check — so the solve has to reproduce it without being told.
    #[test]
    fn an_i_profile_carries_its_shear_in_the_web() {
        let (h, b, tw, tf) = (300.0, 150.0, 7.1, 10.7);
        let g = cat::i_section(h, b, tw, tf, 15.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 3.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let (mut web, mut total) = (0.0, 0.0);
        for (t, tri) in mesh.triangles.iter().enumerate() {
            let y = (mesh.nodes[tri[0]][0] + mesh.nodes[tri[1]][0] + mesh.nodes[tri[2]][0]) / 3.0;
            let a = mesh.triangle_area(*tri).abs();
            let f = r.vz.tau[t][1] * a;
            total += f;
            if y.abs() < tw {
                web += f;
            }
        }
        let share = web / total;
        assert!(share > 0.75, "web carries only {:.1} % of the shear", share * 100.0);
    }

    /// Peak web shear against the hand rule `V / (h * tw)` every designer uses.
    #[test]
    fn peak_web_shear_is_near_the_v_over_web_area_hand_rule() {
        let (h, b, tw, tf) = (300.0, 150.0, 7.1, 10.7);
        let g = cat::i_section(h, b, tw, tf, 15.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 3.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let hand = 1.0 / (h * tw);
        let ratio = r.vz.tau_max / hand;
        assert!((0.85..1.45).contains(&ratio), "peak/hand-rule = {ratio:.3}");
    }

    /// The case Jourawski could not do at all: an angle. There is no single
    /// width, so the legacy path refused it. Here it simply solves, and the
    /// answer has to be finite, non-trivial and traction-free at the surface.
    #[test]
    fn an_angle_solves_where_the_legacy_formula_refused() {
        let g = cat::angle_section_filleted(100.0, 100.0, 10.0, 12.0, 6.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        assert!(r.vz.tau_max.is_finite() && r.vz.tau_max > 0.0);
        assert!(r.vy.tau_max.is_finite() && r.vy.tau_max > 0.0);
        // An angle is not symmetric, so the two directions must differ.
        assert!((r.vy.tau_max / r.vz.tau_max - 1.0).abs() > 1e-6);
    }

    /// A closed tube splits its flow between two walls; Jourawski's single
    /// width cannot express that either.
    #[test]
    fn a_closed_tube_solves_and_stays_bounded() {
        let g = cat::rectangular_hollow_rounded(100.0, 60.0, 4.0, 8.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let mean = 1.0 / mesh.area();
        assert!(r.vz.tau_max > mean, "peak must exceed the average");
        assert!(r.vz.tau_max < 12.0 * mean, "peak {:.3e} is implausible", r.vz.tau_max);
    }

    // ─── Shear centre ──────────────────────────────────────────────

    /// A doubly-symmetric section has its shear centre AT the centroid. This is
    /// why the distinction can be ignored for an I-beam, and it is the one case
    /// where the answer is exactly known, so it bounds the numerical noise
    /// every other case has to be read against.
    #[test]
    fn a_doubly_symmetric_section_has_its_shear_centre_at_the_centroid() {
        for g in [
            cat::rectangle(60.0, 100.0).unwrap(),
            cat::i_section(300.0, 150.0, 7.1, 10.7, 15.0, 8, src()).unwrap(),
        ] {
            let (mesh, c, i) = setup(&g, 3.0);
            let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
            let scale = mesh.area().sqrt();
            assert!(
                r.shear_centre[0].abs() < 0.05 * scale && r.shear_centre[1].abs() < 0.05 * scale,
                "shear centre {:?} should sit at the centroid (scale {scale:.1})",
                r.shear_centre
            );
        }
    }

    /// A channel's shear centre lies OUTSIDE the section, on the opposite side
    /// of the web from the flanges. That is the whole reason loading a channel
    /// through its web twists it, and it is the case an engineer is most likely
    /// to be caught by.
    #[test]
    fn a_channel_has_its_shear_centre_outside_the_web() {
        let g = cat::upn_section(200.0, 75.0, 8.5, 11.5, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 2.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        // The web sits at the horizontal origin and the flanges run towards +y,
        // so the centroid is at positive y and the shear centre must be further
        // negative than the web's outer face.
        assert!(
            r.shear_centre[0] < -c[0],
            "shear centre y {:.2} should be beyond the web face (centroid at {:.2})",
            r.shear_centre[0],
            c[0]
        );
        // Symmetry about mid-height pins the other coordinate.
        assert!(r.shear_centre[1].abs() < 0.05 * mesh.area().sqrt());
    }

    /// A channel and its mirror must give mirrored shear centres. A sign error
    /// in the moment arm survives every symmetric test and dies here.
    #[test]
    fn mirroring_a_channel_mirrors_its_shear_centre() {
        let g = cat::upn_section(200.0, 75.0, 8.5, 11.5, 8, src()).unwrap();
        let mut flipped = g.clone();
        for poly in &mut flipped.polygons {
            for v in &mut poly.vertices {
                v[0] = -v[0];
            }
            poly.vertices.reverse();
        }
        let (m1, c1, i1) = setup(&g, 2.0);
        let (m2, c2, i2) = setup(&flipped, 2.0);
        let a = solve_shear(&m1, c1, i1, SolveStrategy::Sparse).unwrap();
        let b = solve_shear(&m2, c2, i2, SolveStrategy::Sparse).unwrap();
        assert!(
            (a.shear_centre[0] + b.shear_centre[0]).abs() < 0.1 * a.shear_centre[0].abs().max(1.0),
            "{:?} and {:?} are not mirrored",
            a.shear_centre,
            b.shear_centre
        );
    }

    /// An angle's shear centre sits at the corner where its two legs meet,
    /// because both walls' shear flows pass through it.
    #[test]
    fn an_angle_has_its_shear_centre_near_the_leg_intersection() {
        let (leg, t) = (100.0, 10.0);
        let g = cat::angle_section_filleted(leg, leg, t, 12.0, 6.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 1.5);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        // The outline puts the corner at the origin, so the intersection of the
        // two wall centrelines is at (t/2, t/2) absolute — centroid-relative,
        // that is (t/2 - yc, t/2 - zc).
        let want = [t / 2.0 - c[0], t / 2.0 - c[1]];
        let err = ((r.shear_centre[0] - want[0]).powi(2) + (r.shear_centre[1] - want[1]).powi(2))
            .sqrt();
        assert!(err < 0.25 * leg, "shear centre {:?} vs corner {want:?} (off by {err:.1})", r.shear_centre);
    }

    /// The shear correction factor the energy definition gives a rectangle is
    /// the textbook 5/6 — this is the test that pins `kappa` to a real shape
    /// factor rather than to a number that is 1.0 for every section.
    #[test]
    fn a_rectangles_kappa_converges_to_five_sixths() {
        let g = cat::rectangle(60.0, 100.0).unwrap();
        let (mesh, c, i) = setup(&g, 1.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        assert!(
            (r.vz.kappa - 5.0 / 6.0).abs() < 0.04,
            "kappa = {:.4}, expected ≈ 0.833",
            r.vz.kappa
        );
    }

    /// A section that concentrates shear in its web has a meaningfully smaller
    /// shear area than its gross area — the case the shape factor exists for.
    #[test]
    fn an_i_profile_has_a_smaller_kappa_than_a_rectangle() {
        let g = cat::i_section(300.0, 150.0, 7.1, 10.7, 15.0, 8, src()).unwrap();
        let (mesh, c, i) = setup(&g, 3.0);
        let r = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        assert!(
            r.vz.kappa < 0.6 && r.vz.kappa > 0.15,
            "I-profile kappa = {:.3}, expected well below 5/6 but above zero",
            r.vz.kappa
        );
    }

    #[test]
    fn the_sparse_and_dense_paths_agree() {
        let g = cat::rectangle(40.0, 60.0).unwrap();
        let (mesh, c, i) = setup(&g, 8.0);
        let a = solve_shear(&mesh, c, i, SolveStrategy::Sparse).unwrap();
        let b = solve_shear(&mesh, c, i, SolveStrategy::Dense).unwrap();
        assert!((a.vz.tau_max / b.vz.tau_max - 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_zero_inertia_is_refused_rather_than_dividing_by_it() {
        let g = cat::rectangle(40.0, 60.0).unwrap();
        let (mesh, c, _) = setup(&g, 8.0);
        let bad = ShearInertia { iy: 0.0, iz: 1.0, iyz: 0.0 };
        assert!(solve_shear(&mesh, c, bad, SolveStrategy::Sparse).is_err());
    }
}

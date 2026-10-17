//! Warping constant `Cw`, from the Saint-Venant warping function.
//!
//! # Why it is needed
//!
//! `J` alone describes uniform torsion, where every cross-section warps
//! identically and freely. Restrain that warping — at a fixed end, or simply by
//! the moment varying along the member — and the section picks up longitudinal
//! stresses and a second, much stiffer torsional mechanism. `Cw` measures it.
//!
//! It is the term that makes lateral-torsional buckling computable: the elastic
//! critical moment of a beam depends on `G*J` and `E*Cw` together, and for an
//! open profile the warping term usually dominates at the spans that matter.
//! Without `Cw` a section can be analysed but not checked for lateral buckling.
//!
//! # Formulation
//!
//! The warping function `omega` satisfies Laplace's equation with a boundary
//! condition set by the shear flow:
//!
//! ```text
//!   laplacian(omega) = 0                  in Omega
//!   d(omega)/dn = z*n_y - y*n_z           on the boundary
//! ```
//!
//! Pure Neumann again, so `omega` is fixed only up to a constant, removed by
//! the zero-mean gauge. Then, with `omega` measured from the SHEAR CENTRE
//! rather than the centroid, `Cw = integral(omega^2) dA`.
//!
//! That shear-centre requirement is the part that is easy to miss and quietly
//! wrong: taking the warping function about the centroid gives a value that is
//! right only for doubly-symmetric sections and too large for everything else.
//!
//! # Closed sections are refused
//!
//! A multiply-connected section needs a circulation condition per hole here
//! too, exactly as torsion does — the warping displacement has to come back to
//! itself around each cell. Without it the solve overstates `Cw`; measured
//! against an open profile of the same envelope it came out only three times
//! smaller, where the true ratio is orders of magnitude, because a closed cell
//! barely warps at all.
//!
//! Rather than return that, closed sections are refused. Practically nothing
//! is lost: warping restraint is a concern for open profiles, and design codes
//! treat a closed tube's `Cw` as negligible precisely because it is.

use serde::{Deserialize, Serialize};

use super::mesh::SectionMesh;
use super::poisson::{LoopBc, PoissonProblem, SolveStrategy};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpingResult {
    /// Warping constant, in (section length unit)^6.
    pub cw: f64,
    /// Warping function at each node, measured from the shear centre.
    pub omega: Vec<f64>,
    pub residual: f64,
}

/// Solve for the warping constant about `shear_centre` (centroid-relative).
pub fn solve_warping(
    mesh: &SectionMesh,
    centroid: [f64; 2],
    shear_centre: [f64; 2],
    strategy: SolveStrategy,
) -> Result<WarpingResult, String> {
    if mesh.triangles.is_empty() {
        return Err("mesh has no triangles".into());
    }
    if mesh.loop_count > 1 {
        return Err(format!(
            "section has {} holes; warping of a closed cell needs a circulation \
             condition per hole, and without it Cw is overstated. A closed \
             section's warping constant is negligible in practice, which is why \
             this is a refusal rather than a gap",
            mesh.loop_count - 1
        ));
    }
    // The pole: warping is measured about the shear centre, in absolute mesh
    // coordinates. Using the centroid here is the classic silent error — it
    // agrees only when the two coincide, which is exactly when it does not
    // matter.
    let pole = [centroid[0] + shear_centre[0], centroid[1] + shear_centre[1]];

    // Boundary flux `d(omega)/dn = z*n_y - y*n_z`, per boundary edge, with the
    // coordinates taken from the pole.
    // Orientation matters and is not stored: see `oriented_boundary_edge`. With
    // the raw vertex order the normals point half one way and half the other,
    // and the compatibility condition — which must vanish exactly — does not.
    let mut edge_flux = Vec::with_capacity(mesh.boundary_edges.len());
    for e in &mesh.boundary_edges {
        let Some((a, b, _)) = mesh.oriented_boundary_edge(e.a, e.b) else {
            edge_flux.push(0.0);
            continue;
        };
        let (p, q) = (mesh.nodes[a], mesh.nodes[b]);
        let mid = [(p[0] + q[0]) / 2.0 - pole[0], (p[1] + q[1]) / 2.0 - pole[1]];
        let (dy, dz) = (q[0] - p[0], q[1] - p[1]);
        let len = (dy * dy + dz * dz).sqrt();
        if len <= 0.0 {
            edge_flux.push(0.0);
            continue;
        }
        // Unit outward normal for an edge with the material on its left.
        let n = [dz / len, -dy / len];
        edge_flux.push(mid[1] * n[0] - mid[0] * n[1]);
    }

    let mut problem = PoissonProblem::new(mesh);
    problem.source = vec![0.0; mesh.triangles.len()];
    problem.loop_bcs = vec![LoopBc::NeumannPerEdge; mesh.loop_count];
    problem.edge_flux = edge_flux;
    problem.zero_mean = true;
    problem.strategy = strategy;

    let sol = super::poisson::solve_poisson(&problem)?;

    // Cw = integral(omega^2). Exact for the P1 field on each triangle via the
    // standard quadratic mass-matrix rule.
    let mut cw = 0.0;
    for &t in &mesh.triangles {
        let a = mesh.triangle_area(t).abs();
        let (w0, w1, w2) = (sol.u[t[0]], sol.u[t[1]], sol.u[t[2]]);
        cw += a / 6.0 * (w0 * w0 + w1 * w1 + w2 * w2 + w0 * w1 + w1 * w2 + w2 * w0);
    }

    Ok(WarpingResult { cw, omega: sol.u, residual: sol.residual })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::section::catalogue as cat;
    use crate::section::mesh::{mesh_section, MeshParams};
    use crate::section::shear::{solve_shear, ShearInertia};
    use crate::section::{analyze_section, SectionInput};

    fn setup(g: &cat::CanonicalGeometry, target: f64) -> (SectionMesh, [f64; 2], [f64; 2]) {
        let mut p = MeshParams::default();
        p.max_area = target;
        let mesh = mesh_section(&g.polygons, &p).expect("mesh");
        let props = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .expect("props");
        let c = [props.yc, props.zc];
        let sh = solve_shear(
            &mesh, c,
            ShearInertia { iy: props.iy, iz: props.iz, iyz: props.iyz },
            SolveStrategy::Sparse,
        )
        .expect("shear");
        (mesh, c, sh.shear_centre)
    }
    fn src() -> cat::GeometrySource {
        cat::GeometrySource::Parametric { shape: "test".into() }
    }
    fn cw_of(g: &cat::CanonicalGeometry, target: f64) -> f64 {
        let (mesh, c, sc) = setup(g, target);
        solve_warping(&mesh, c, sc, SolveStrategy::Sparse).unwrap().cw
    }

    /// A doubly-symmetric I-profile has the classic closed form
    /// `Cw = Iz * (h - tf)^2 / 4`, the two flanges acting as a couple.
    #[test]
    fn an_i_profile_matches_the_flange_couple_formula() {
        let (h, b, tw, tf) = (300.0, 150.0, 7.1, 10.7);
        let g = cat::i_section(h, b, tw, tf, 15.0, 8, src()).unwrap();
        let cw = cw_of(&g, 3.0);
        let props = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .unwrap();
        let closed = props.iz * (h - tf).powi(2) / 4.0;
        let err = (cw / closed - 1.0).abs();
        assert!(err < 0.15, "Cw {cw:.3e} vs flange-couple {closed:.3e} ({:.1} %)", err * 100.0);
    }

    /// A solid circle warps by essentially nothing: its cross-sections stay
    /// plane under torsion, which is why the elementary circular formula works
    /// at all. `Cw` must be negligible next to a comparable open profile.
    #[test]
    fn a_circle_barely_warps() {
        let g = cat::solid_circle(100.0, 96).unwrap();
        let cw = cw_of(&g, 4.0);
        // Compare against a rectangle of similar area, itself a low-warping
        // shape; the circle must be far below even that.
        let rect = cw_of(&cat::rectangle(88.6, 88.6).unwrap(), 4.0);
        assert!(cw < 0.1 * rect.max(1e-30), "circle Cw {cw:.3e} vs square {rect:.3e}");
    }

    /// A closed section is refused rather than answered with an overstated
    /// value. Discovered by measuring: against an open profile of the same
    /// envelope the closed one came out only three times smaller, where the
    /// real ratio is orders of magnitude — the tell that the circulation
    /// condition is missing, the same one torsion needed.
    #[test]
    fn a_closed_section_is_refused_rather_than_overstated() {
        let g = cat::rectangular_hollow_rounded(150.0, 300.0, 10.0, 20.0, 8, src()).unwrap();
        let (mesh, c, sc) = setup(&g, 6.0);
        let err = solve_warping(&mesh, c, sc, SolveStrategy::Sparse).unwrap_err();
        assert!(err.contains("circulation"), "{err}");
    }

    /// Deeper profile, larger warping: with the flanges further apart the
    /// couple has a longer arm, and Cw grows roughly as the square of it.
    #[test]
    fn a_deeper_profile_warps_more() {
        let shallow = cw_of(&cat::i_section(200.0, 150.0, 7.0, 10.0, 12.0, 8, src()).unwrap(), 3.0);
        let deep = cw_of(&cat::i_section(400.0, 150.0, 7.0, 10.0, 12.0, 8, src()).unwrap(), 3.0);
        let ratio = deep / shallow;
        // (400-10)^2 / (200-10)^2 = 4.2, and the flange inertia is unchanged.
        assert!((3.0..6.0).contains(&ratio), "Cw ratio {ratio:.2}, expected about 4");
    }

    #[test]
    fn the_result_is_stable_under_refinement() {
        let g = cat::i_section(300.0, 150.0, 7.1, 10.7, 15.0, 8, src()).unwrap();
        let coarse = cw_of(&g, 12.0);
        let fine = cw_of(&g, 2.0);
        assert!((coarse / fine - 1.0).abs() < 0.10, "{coarse:.4e} vs {fine:.4e}");
    }
}

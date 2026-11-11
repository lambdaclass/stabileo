use super::{constraints::FreeConstraintSystem, dof::DofNumbering};
use crate::{
    linalg::*,
    types::{SolverInput, SolverInput3D},
};

pub(crate) struct EquilibriumMetric {
    weights: Vec<f64>,
    nf: usize,
    projected: Option<(Vec<f64>, NumericCholesky)>,
}

impl EquilibriumMetric {
    pub(crate) fn for_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        let points = crate::ordered::values(&input.nodes).map(|n| [n.x, 0.0, n.z]);
        Self::new(points, 2, dofs, cs)
    }

    pub(crate) fn for_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        let points = crate::ordered::values(&input.nodes).map(|n| [n.x, n.y, n.z]);
        Self::new(points, 3, dofs, cs)
    }

    fn new(
        mut points: impl Iterator<Item = [f64; 3]>,
        dimensions: usize,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        let origin = points.next().ok_or("Convergence metric requires nodes")?;
        let length = points
            .map(|p| {
                (p[0] - origin[0])
                    .hypot(p[1] - origin[1])
                    .hypot(p[2] - origin[2])
            })
            .fold(0.0, f64::max);
        if !length.is_finite() || length <= 0.0 {
            return Err("Convergence metric requires a finite positive model length".into());
        }
        let mut weights = vec![1.0; dofs.n_total];
        for ((_, local), i) in dofs.entries_by_dof() {
            weights[i] = if local < dimensions {
                1.0
            } else if local < 6 {
                length
            } else {
                length * length
            };
        }
        let projected = if let Some(cs) = cs {
            let c = &cs.c_ff;
            let mut scales = vec![0.0f64; cs.n_free_indep];
            for (j, scale) in scales.iter_mut().enumerate() {
                for p in c.col_ptr[j]..c.col_ptr[j + 1] {
                    *scale = scale.hypot(weights[c.row_idx[p]] * c.csc_vals[p]);
                }
                if !scale.is_finite() || *scale <= 0.0 {
                    return Err("Invalid convergence constraint metric".into());
                }
            }
            let mut rows = Vec::new();
            let mut cols = Vec::new();
            let mut values = Vec::new();
            for (i, weight) in weights.iter().enumerate().take(dofs.n_free) {
                for a in c.row_ptr[i]..c.row_ptr[i + 1] {
                    let j = c.col_idx[a];
                    let x = weight * c.vals[a] / scales[j];
                    for b in c.row_ptr[i]..c.row_ptr[i + 1] {
                        let k = c.col_idx[b];
                        if j >= k {
                            rows.push(j);
                            cols.push(k);
                            values.push(x * (weight * c.vals[b] / scales[k]));
                        }
                    }
                }
            }
            let gram = CscMatrix::from_triplets(cs.n_free_indep, &rows, &cols, &values);
            let symbolic = std::rc::Rc::new(symbolic_cholesky(&gram));
            let factor = numeric_cholesky(&symbolic, &gram)
                .ok_or("Convergence constraint metric is not positive definite")?;
            Some((scales, factor))
        } else {
            None
        };
        Ok(Self {
            weights,
            nf: dofs.n_free,
            projected,
        })
    }

    fn full_norm(&self, vector: &[f64]) -> f64 {
        vector
            .iter()
            .zip(&self.weights)
            .fold(0.0f64, |n, (v, w)| n.hypot(v / w))
    }

    fn free_norm(&self, vector: &[f64], cs: Option<&FreeConstraintSystem>) -> f64 {
        let free = &vector[..self.nf];
        match (&self.projected, cs) {
            (Some((scales, factor)), Some(cs)) => {
                let mut reduced = cs.reduce_vector(free);
                for (v, scale) in reduced.iter_mut().zip(scales) {
                    *v /= scale;
                }
                let norm = reduced.iter().fold(0.0f64, |n, v| n.hypot(*v));
                if norm == 0.0 {
                    return 0.0;
                }
                if !norm.is_finite() {
                    return f64::INFINITY;
                }
                for v in &mut reduced {
                    *v /= norm;
                }
                let dual = sparse_cholesky_solve(factor, &reduced);
                let energy = reduced.iter().zip(dual).map(|(a, b)| a * b).sum::<f64>();
                if energy < 0.0 || !energy.is_finite() {
                    f64::INFINITY
                } else {
                    norm * energy.sqrt()
                }
            }
            (None, None) => self.full_norm(free),
            _ => f64::INFINITY,
        }
    }

    pub(crate) fn relative_increment(&self, previous: &[f64], next: &[f64]) -> f64 {
        let mut change = 0.0f64;
        let mut reference = 0.0f64;
        for ((a, b), w) in previous.iter().zip(next).zip(&self.weights).take(self.nf) {
            change = change.hypot((b - a) * w);
            reference = reference.hypot(b * w);
        }
        if !change.is_finite() || !reference.is_finite() {
            f64::INFINITY
        } else if change == 0.0 {
            0.0
        } else if reference == 0.0 {
            f64::INFINITY
        } else {
            change / reference
        }
    }

    pub(crate) fn global_residual<T: super::assembly::InclinedFrame>(
        &self,
        external: &[f64],
        internal: &[f64],
        its: &[T],
        cs: Option<&FreeConstraintSystem>,
        support_driven: bool,
    ) -> f64 {
        let residual = super::assembly::inclined_residual(external, internal, its);
        let mut external = external.to_vec();
        for it in its {
            it.rotate(&mut external);
        }
        self.relative_residual(&residual, &external, support_driven.then_some(internal), cs)
    }

    pub(crate) fn relative_residual(
        &self,
        residual: &[f64],
        external: &[f64],
        support_reference: Option<&[f64]>,
        cs: Option<&FreeConstraintSystem>,
    ) -> f64 {
        if residual
            .iter()
            .chain(external)
            .chain(support_reference.into_iter().flatten())
            .any(|v| !v.is_finite())
        {
            return f64::INFINITY;
        }
        let r = self.free_norm(residual, cs);
        let full = self.full_norm(external);
        let reference = self
            .free_norm(external, cs)
            .max(support_reference.map_or(0.0, |v| self.full_norm(v)));
        if !r.is_finite() || !full.is_finite() || !reference.is_finite() {
            return f64::INFINITY;
        }
        if r == 0.0 {
            return 0.0;
        }
        if reference == 0.0 {
            f64::INFINITY
        } else {
            r / reference
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::assembly;
    use super::*;
    use crate::metamorphic::{
        transform::{transform_2d, transform_3d, Iso2, Iso3},
        units::{scale_2d, scale_3d, Units},
    };

    fn input() -> SolverInput {
        serde_json::from_str(include_str!("../../tests/metamorphic_corpus/feature_matrix/2d-constraint--rigid-link--offset-beam-with.json")).unwrap()
    }

    fn ratio_2d(s: &SolverInput, r: &SolverInput) -> f64 {
        let dofs = DofNumbering::build_2d(s);
        let cs = FreeConstraintSystem::build_2d(s, &dofs).unwrap();
        let metric = EquilibriumMetric::for_2d(s, &dofs, cs.as_ref()).unwrap();
        let f = assembly::assemble_2d(s, &dofs).f;
        let r = assembly::assemble_2d(r, &dofs).f;
        metric.relative_residual(&r, &f, None, cs.as_ref())
    }

    fn ratio_3d(s: &SolverInput3D, r: &SolverInput3D) -> f64 {
        let dofs = DofNumbering::build_3d(s);
        let cs = FreeConstraintSystem::build_3d(s, &dofs).unwrap();
        let metric = EquilibriumMetric::for_3d(s, &dofs, cs.as_ref()).unwrap();
        let f = assembly::assemble_3d(s, &dofs).f;
        let r = assembly::assemble_3d(r, &dofs).f;
        metric.relative_residual(&r, &f, None, cs.as_ref())
    }

    #[test]
    fn constrained_mixed_force_moment_metric_is_invariant() {
        let mut s = input();
        s.loads = vec![crate::types::SolverLoad::Nodal(
            crate::types::SolverNodalLoad {
                node_id: 3,
                fx: 2.0,
                fz: -3.0,
                my: 5.0,
            },
        )];
        let mut r = s.clone();
        r.loads = vec![crate::types::SolverLoad::Nodal(
            crate::types::SolverNodalLoad {
                node_id: 2,
                fx: -7.0,
                fz: 11.0,
                my: -13.0,
            },
        )];
        let expected = ratio_2d(&s, &r);
        assert!(expected > 0.0 && expected.is_finite());
        for length in [1e-3, 1.0, 1e3] {
            for force in [1e-200, 1.0, 1e200] {
                let units = Units::froude(length, force);
                for iso in [Iso2::rotation(0.731), Iso2::mirror_line(1.293)] {
                    let s = transform_2d(&scale_2d(&s, &units), &iso).unwrap();
                    let r = transform_2d(&scale_2d(&r, &units), &iso).unwrap();
                    assert!((ratio_2d(&s, &r) / expected - 1.0).abs() < 1e-12);
                }
            }
        }
        let mut s: SolverInput3D = serde_json::from_str(include_str!("../../tests/metamorphic_corpus/feature_matrix/3d-constraint--rigid-link--offset-beam-with.json")).unwrap();
        s.supports.retain(|_, support| support.node_id == 1);
        s.loads = vec![crate::types::SolverLoad3D::Nodal(
            crate::types::SolverNodalLoad3D {
                node_id: 3,
                fx: 2.0,
                fy: -3.0,
                fz: 5.0,
                mx: -7.0,
                my: 11.0,
                mz: -13.0,
                bw: None,
            },
        )];
        let mut r = s.clone();
        r.loads = vec![crate::types::SolverLoad3D::Nodal(
            crate::types::SolverNodalLoad3D {
                node_id: 2,
                fx: -13.0,
                fy: 11.0,
                fz: -7.0,
                mx: 5.0,
                my: -3.0,
                mz: 2.0,
                bw: None,
            },
        )];
        let expected = ratio_3d(&s, &r);
        assert!(expected > 0.0 && expected.is_finite());
        for units in [Units::froude(1e-3, 1e-200), Units::froude(1e3, 1e200)] {
            let iso = Iso3::from_euler(0.731, -0.417, 1.293);
            let moved_s = transform_3d(&scale_3d(&s, &units), &iso).unwrap();
            let moved_r = transform_3d(&scale_3d(&r, &units), &iso).unwrap();
            assert!((ratio_3d(&moved_s, &moved_r) / expected - 1.0).abs() < 1e-12);
            let mirror = |mut input: SolverInput3D| {
                let constraints = std::mem::take(&mut input.constraints);
                let mut reflected =
                    crate::metamorphic::mirror::mirror_3d(&input, 0, [0.0; 3]).unwrap();
                reflected.constraints = constraints;
                reflected
            };
            let moved_s = mirror(moved_s);
            let moved_r = mirror(moved_r);
            assert!((ratio_3d(&moved_s, &moved_r) / expected - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn zero_reference_nonfinite_and_both_sides_of_tolerance() {
        let s = input();
        let dofs = DofNumbering::build_2d(&s);
        let metric = EquilibriumMetric::for_2d(&s, &dofs, None).unwrap();
        for force in [1e-200, 1.0, 1e200] {
            let mut f = vec![0.0; dofs.n_total];
            let mut r = f.clone();
            assert_eq!(metric.relative_residual(&r, &f, None, None), 0.0);
            r[0] = force;
            assert_eq!(metric.relative_residual(&r, &f, None, None), f64::INFINITY);
            f[0] = force;
            for factor in [0.5, 2.0] {
                r[0] = factor * 1e-10 * force;
                assert_eq!(
                    metric.relative_residual(&r, &f, None, None) < 1e-10,
                    factor < 1.0
                );
            }
            for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
                r[0] = invalid;
                assert_eq!(metric.relative_residual(&r, &f, None, None), f64::INFINITY);
            }
        }
    }

    #[test]
    fn every_representable_free_residual_is_checked() {
        let base: SolverInput =
            serde_json::from_str(include_str!("../../tests/fixtures/random-41-input.json"))
                .unwrap();
        let s = transform_2d(&base, &Iso2::rotation(0.731)).unwrap();
        let dofs = DofNumbering::build_2d(&s);
        let metric = EquilibriumMetric::for_2d(&s, &dofs, None).unwrap();
        let groups = super::super::constraints::inclined_dofs_2d(&s, &dofs);
        assert_eq!(groups.len(), 1);
        let group = &groups[0];
        let tangent = *group.dofs.iter().find(|&&i| i < dofs.n_free).unwrap();
        let normal = *group.dofs.iter().find(|&&i| i >= dofs.n_free).unwrap();
        for force in [1e-200, 1.0, 1e200] {
            let mut f = vec![0.0; dofs.n_total];
            f[normal] = force;
            let bound = 6.0 * f64::EPSILON;
            for factor in [0.5, 2.0] {
                f[tangent] = factor * bound * force;
                assert_eq!(metric.relative_residual(&f, &f, None, None), 1.0);
            }
            f[tangent] = 0.0;
            let other = (0..dofs.n_free).find(|i| !group.dofs.contains(i)).unwrap();
            f[other] = bound * force / 2.0;
            assert!(metric.relative_residual(&f, &f, None, None) >= 1.0);
        }
    }
    #[test]
    fn an_axis_aligned_projection_cannot_discard_a_small_real_free_load() {
        let mut s: SolverInput =
            serde_json::from_str(include_str!("../../tests/fixtures/random-41-input.json"))
                .unwrap();
        let support = s.supports.values_mut().find(|s| s.node_id == 2).unwrap();
        support.support_type = "inclinedRoller".into();
        support.angle = Some(0.0);
        let dofs = DofNumbering::build_2d(&s);
        let metric = EquilibriumMetric::for_2d(&s, &dofs, None).unwrap();
        let mut force = vec![0.0; dofs.n_total];
        force[dofs.global_dof(2, 0).unwrap()] = 1.0;
        force[dofs.global_dof(2, 1).unwrap()] = 1e20;
        assert!(metric.relative_residual(&force, &force, None, None) >= 1.0);
    }
    #[test]
    fn an_inclined_projection_cannot_discard_a_small_real_free_load() {
        let mut s: SolverInput =
            serde_json::from_str(include_str!("../../tests/fixtures/random-41-input.json"))
                .unwrap();
        let support = s.supports.values_mut().find(|s| s.node_id == 2).unwrap();
        support.support_type = "inclinedRoller".into();
        support.angle = Some(std::f64::consts::FRAC_PI_4);
        let dofs = DofNumbering::build_2d(&s);
        let metric = EquilibriumMetric::for_2d(&s, &dofs, None).unwrap();
        let mut force = vec![0.0; dofs.n_total];
        force[dofs.global_dof(2, 0).unwrap()] = 65536.0;
        force[dofs.global_dof(2, 1).unwrap()] = 1e20;
        assert!(metric.relative_residual(&force, &force, None, None) >= 1.0);
    }
}

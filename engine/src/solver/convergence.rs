use super::{constraints::FreeConstraintSystem, dof::DofNumbering};
use crate::{
    linalg::*,
    types::{SolverInput, SolverInput3D},
};

pub(crate) struct EquilibriumMetric {
    weights: Vec<f64>,
    nf: usize,
    support_force: f64,
    projected: Option<(Vec<f64>, NumericCholesky)>,
}

impl EquilibriumMetric {
    pub(crate) fn for_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        let points: Vec<_> = crate::ordered::values(&input.nodes)
            .map(|n| [n.x, 0.0, n.z])
            .collect();
        let prescribed = super::linear::prescribed_displacements_2d(input, dofs);
        let stiffness = if Self::length(&points)? == 0.0 || prescribed.iter().any(|v| *v != 0.0) {
            Some(super::assembly::assemble_sparse_2d_ex(input, dofs, true))
        } else {
            None
        };
        let mut metric = Self::with_stiffness(
            points.into_iter(),
            2,
            dofs,
            cs,
            stiffness
                .as_ref()
                .map(|s| (&s.k_ff, s.artificial_dofs.as_slice())),
        )?;
        if let Some(stiffness) = stiffness {
            metric.set_support_force(
                stiffness
                    .k_full
                    .as_ref()
                    .ok_or("Missing support coupling stiffness")?,
                &prescribed,
                dofs,
                cs,
            );
        }
        Ok(metric)
    }

    pub(crate) fn for_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        let points: Vec<_> = crate::ordered::values(&input.nodes)
            .map(|n| [n.x, n.y, n.z])
            .collect();
        let prescribed = super::linear::prescribed_displacements_3d(input, dofs);
        let stiffness = if Self::length(&points)? == 0.0 || prescribed.iter().any(|v| *v != 0.0) {
            Some(super::assembly::assemble_sparse_3d(input, dofs, true))
        } else {
            None
        };
        let mut metric = Self::with_stiffness(
            points.into_iter(),
            3,
            dofs,
            cs,
            stiffness
                .as_ref()
                .map(|s| (&s.k_ff, s.artificial_dofs.as_slice())),
        )?;
        if let Some(stiffness) = stiffness {
            metric.set_support_force(
                stiffness
                    .k_full
                    .as_ref()
                    .ok_or("Missing support coupling stiffness")?,
                &prescribed,
                dofs,
                cs,
            );
        }
        Ok(metric)
    }

    fn length(points: &[[f64; 3]]) -> Result<f64, String> {
        if points.is_empty() {
            return Err("Convergence metric requires nodes".into());
        }
        if points.iter().flatten().any(|v| !v.is_finite()) {
            return Err("Convergence metric requires finite node coordinates".into());
        }
        let mut points = points.to_vec();
        points.sort_by(|a, b| {
            a[0].total_cmp(&b[0])
                .then(a[1].total_cmp(&b[1]))
                .then(a[2].total_cmp(&b[2]))
        });
        let origin: [f64; 3] =
            std::array::from_fn(|i| points.iter().map(|p| p[i] / points.len() as f64).sum());
        let length = points
            .iter()
            .map(|p| {
                (p[0] - origin[0])
                    .hypot(p[1] - origin[1])
                    .hypot(p[2] - origin[2])
            })
            .fold(0.0, f64::max);
        if !length.is_finite() {
            return Err("Convergence metric requires a finite model length".into());
        }
        Ok(length)
    }

    #[cfg(test)]
    fn new(
        points: impl Iterator<Item = [f64; 3]>,
        dimensions: usize,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Result<Self, String> {
        Self::with_stiffness(points, dimensions, dofs, cs, None)
    }

    fn with_stiffness(
        points: impl Iterator<Item = [f64; 3]>,
        dimensions: usize,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
        stiffness: Option<(&CscMatrix, &[usize])>,
    ) -> Result<Self, String> {
        let mut length = Self::length(&points.collect::<Vec<_>>())?;
        if length == 0.0 {
            let entries = dofs.entries_by_dof();
            let power = |local| {
                if local < dimensions {
                    0
                } else if local < 6 {
                    1
                } else {
                    2
                }
            };
            let active: std::collections::BTreeSet<_> = entries
                .iter()
                .filter(|(_, i)| *i < dofs.n_free)
                .map(|((_, local), _)| power(*local))
                .collect();
            length = if active.len() > 1 {
                let (k, artificial) = stiffness
                    .ok_or("Mixed point-model convergence requires physical stiffness scales")?;
                let diagonal = k.diagonal();
                let mut traces = [0.0f64; 3];
                for ((_, local), i) in entries {
                    if i < dofs.n_free && !artificial.contains(&i) {
                        traces[power(local)] += diagonal[i];
                    }
                }
                let physical: Vec<_> = traces
                    .iter()
                    .enumerate()
                    .filter(|(_, k)| k.is_finite() && **k > 0.0)
                    .collect();
                if traces.iter().any(|k| !k.is_finite() || *k < 0.0) || physical.len() < 2 {
                    return Err(
                        "Mixed point-model convergence requires positive physical stiffness scales"
                            .into(),
                    );
                }
                let (lower, kl) = physical[0];
                let (upper, ku) = physical[1];
                let ratio = ku.sqrt() / kl.sqrt();
                let scale = if upper - lower == 2 {
                    ratio.sqrt()
                } else {
                    ratio
                };
                if !scale.is_finite() || scale <= 0.0 {
                    return Err(
                        "Mixed point-model convergence requires positive physical stiffness scales"
                            .into(),
                    );
                }
                scale
            } else {
                1.0
            };
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
        if weights.iter().any(|w| !w.is_finite() || *w <= 0.0) {
            return Err("Convergence metric requires finite positive DOF scales".into());
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
            support_force: 0.0,
            projected,
        })
    }

    fn set_support_force(
        &mut self,
        stiffness: &CscMatrix,
        prescribed: &[f64],
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) {
        let mut nodes = vec![0; dofs.n_total];
        for ((node, _), i) in dofs.entries_by_dof() {
            nodes[i] = node;
        }
        let mut coupling =
            std::collections::BTreeMap::<usize, std::collections::BTreeMap<usize, f64>>::new();
        for j in 0..dofs.n_total {
            for p in stiffness.col_ptr[j]..stiffness.col_ptr[j + 1] {
                let i = stiffness.row_idx[p];
                let pair = if i < self.nf && j >= self.nf {
                    Some((i, j))
                } else if j < self.nf && i >= self.nf {
                    Some((j, i))
                } else {
                    None
                };
                if let Some((free, restrained)) = pair {
                    let displacement = prescribed[restrained - self.nf];
                    if displacement != 0.0 {
                        *coupling
                            .entry(nodes[restrained])
                            .or_default()
                            .entry(free)
                            .or_default() += stiffness.values[p] * displacement;
                    }
                }
            }
        }
        self.support_force = 0.0;
        for force in coupling.values() {
            let norm = if cs.is_none() {
                force
                    .iter()
                    .fold(0.0f64, |norm, (i, f)| norm.hypot(f / self.weights[*i]))
            } else {
                let mut vector = vec![0.0; self.nf];
                for (i, f) in force {
                    vector[*i] = *f;
                }
                self.free_norm(&vector, cs)
            };
            self.support_force = self.support_force.hypot(norm);
        }
    }

    fn full_norm(&self, vector: &[f64]) -> f64 {
        vector
            .iter()
            .zip(&self.weights)
            .fold(0.0f64, |n, (v, w)| n.hypot(v / w))
    }

    pub(crate) fn free_norm(&self, vector: &[f64], cs: Option<&FreeConstraintSystem>) -> f64 {
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
        if previous.iter().chain(next).any(|v| !v.is_finite()) {
            return f64::INFINITY;
        }
        let mut change = 0.0f64;
        let mut reference = 0.0f64;
        for ((a, b), w) in previous.iter().zip(next).zip(&self.weights).take(self.nf) {
            change = change.hypot((b - a) * w);
            reference = reference.hypot(b * w);
        }
        for (i, (a, w)) in previous.iter().zip(&self.weights).enumerate().skip(self.nf) {
            let b = next.get(i).copied().unwrap_or(*a);
            reference = reference.hypot(a.abs().max(b.abs()) * w);
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
        self.relative_residual(&residual, &external, support_driven.then_some(1.0), cs)
    }

    pub(crate) fn relative_residual(
        &self,
        residual: &[f64],
        external: &[f64],
        support_factor: Option<f64>,
        cs: Option<&FreeConstraintSystem>,
    ) -> f64 {
        if residual
            .iter()
            .chain(external)
            .chain(support_factor.as_ref())
            .any(|v| !v.is_finite())
        {
            return f64::INFINITY;
        }
        let r = self.free_norm(residual, cs);
        let applied = self.free_norm(external, cs);
        let reference = if applied > 0.0 {
            applied
        } else {
            support_factor.map_or(0.0, |factor| factor.abs() * self.support_force)
        };
        if !r.is_finite() || !reference.is_finite() {
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
    #[test]
    fn r2_restrained_reactions_cannot_mask_free_disequilibrium() {
        let s = input();
        let d = DofNumbering::build_2d(&s);
        let mut m = EquilibriumMetric::for_2d(&s, &d, None).unwrap();
        m.support_force = 1e20;
        let mut f = vec![0.0; d.n_total];
        f[0] = 0.01;
        assert_eq!(m.relative_residual(&f, &f, Some(1.0), None), 1.0);
    }

    #[test]
    fn r2_length_does_not_depend_on_node_labels() {
        let mut s = input();
        let keys: Vec<_> = crate::ordered::entries(&s.nodes)
            .map(|(key, _)| key.clone())
            .collect();
        for (i, key) in keys.iter().enumerate() {
            let n = s.nodes.get_mut(key).unwrap();
            n.x = i as f64 * 5.0;
            n.z = 0.0;
        }
        let d = DofNumbering::build_2d(&s);
        let a = EquilibriumMetric::for_2d(&s, &d, None).unwrap();
        let mut points: Vec<_> = crate::ordered::values(&s.nodes)
            .map(|n| [n.x, 0.0, n.z])
            .collect();
        points.rotate_left(1);
        let b = EquilibriumMetric::new(points.into_iter(), 2, &d, None).unwrap();
        assert_eq!(a.weights, b.weights);
    }

    #[test]
    fn r2_settlement_scales_free_roundoff_increments() {
        let s = input();
        let d = DofNumbering::build_2d(&s);
        let m = EquilibriumMetric::for_2d(&s, &d, None).unwrap();
        let mut a = vec![0.0; d.n_total];
        a[d.n_free] = 0.01;
        let mut b = a.clone();
        b[0] = 1e-19;
        assert!(m.relative_increment(&a, &b) < 1e-12);
        b.truncate(d.n_free);
        assert!(m.relative_increment(&a, &b) < 1e-12);
        b[0] = 0.001;
        assert!(m.relative_increment(&a, &b) > 1e-2);
    }

    #[test]
    fn r2_every_coordinate_must_be_finite() {
        let s = input();
        let d = DofNumbering::build_2d(&s);
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(EquilibriumMetric::new(
                [[0.0; 3], [1.0; 3], [bad; 3]].into_iter(),
                2,
                &d,
                None
            )
            .is_err());
        }
    }

    #[test]
    fn point_model_scales_require_physical_stiffness_only_when_dimensions_mix() {
        let s = input();
        let mut d = DofNumbering::build_2d(&s);
        d.map = [((2, 0), 0), ((2, 1), 1), ((2, 2), 2)]
            .into_iter()
            .collect();
        d.n_free = 3;
        d.n_total = 3;
        for scale in [1e-100, 1.0, 1e100] {
            let stiffness = CscMatrix::from_triplets(
                3,
                &[0, 1, 2],
                &[0, 1, 2],
                &[100.0 / scale, 100.0 / scale, 400.0 * scale],
            );
            let metric = EquilibriumMetric::with_stiffness(
                [[0.0; 3]; 2].into_iter(),
                2,
                &d,
                None,
                Some((&stiffness, &[])),
            )
            .unwrap();
            assert!((metric.weights[2] / scale / 2.0f64.sqrt() - 1.0).abs() < 1e-12);
        }
        let stiffness = CscMatrix::from_triplets(3, &[0, 1, 2], &[0, 1, 2], &[100.0, 100.0, 400.0]);
        assert!(EquilibriumMetric::with_stiffness(
            [[0.0; 3]; 2].into_iter(),
            2,
            &d,
            None,
            Some((&stiffness, &[2]))
        )
        .is_err());
        let stiffness = CscMatrix::from_triplets(3, &[0, 1, 2], &[0, 1, 2], &[100.0, 100.0, 0.0]);
        assert!(EquilibriumMetric::with_stiffness(
            [[0.0; 3]; 2].into_iter(),
            2,
            &d,
            None,
            Some((&stiffness, &[]))
        )
        .is_err());
        assert!(EquilibriumMetric::new([[0.0; 3]; 2].into_iter(), 2, &d, None).is_err());
        for local in [0, 2] {
            d.map = [((2, local), 0)].into_iter().collect();
            d.n_free = 1;
            d.n_total = 1;
            let metric = EquilibriumMetric::new([[0.0; 3]].into_iter(), 2, &d, None).unwrap();
            assert_eq!(metric.relative_residual(&[1.0], &[1.0], None, None), 1.0);
        }
    }
    #[test]
    fn point_model_warping_uses_its_own_dimension_category() {
        let s = input();
        let mut d = DofNumbering::build_2d(&s);
        d.map = [((2, 3), 0), ((2, 6), 1)].into_iter().collect();
        d.n_free = 2;
        d.n_total = 2;
        assert!(EquilibriumMetric::new([[0.0; 3]].into_iter(), 3, &d, None).is_err());
        let stiffness = CscMatrix::from_triplets(2, &[0, 1], &[0, 1], &[100.0, 400.0]);
        let metric = EquilibriumMetric::with_stiffness(
            [[0.0; 3]].into_iter(),
            3,
            &d,
            None,
            Some((&stiffness, &[])),
        )
        .unwrap();
        assert_eq!(metric.weights, vec![2.0, 4.0]);
    }
    #[test]
    #[ignore = "known wrong result: #761"]
    fn r3_coincident_settlement_mixes_physical_dimensions() {
        let mut s: SolverInput = serde_json::from_str(include_str!("../../tests/fixtures/random-41-input.json")).unwrap();
        s.elements.clear(); s.loads.clear(); s.nodes.retain(|_,n|n.id<=2);
        for n in s.nodes.values_mut() { n.x=0.0; n.z=0.0; }
        s.supports.clear();
        s.supports.insert("1".into(),serde_json::from_value(serde_json::json!({"id":1,"nodeId":1,"type":"fixed","dx":0.01})).unwrap());
        s.supports.insert("2".into(),serde_json::from_value(serde_json::json!({"id":2,"nodeId":2,"type":"pinned"})).unwrap());
        s.connectors.insert("1".into(),serde_json::from_value(serde_json::json!({"id":1,"nodeI":1,"nodeJ":2,"kAxial":100.0,"kShear":100.0,"kMoment":400.0})).unwrap());
        let ratio=|s:&SolverInput| {
            let mut d=DofNumbering::build_2d(s);
            d.map=[((2,2),0),((1,0),1)].into_iter().collect(); d.n_free=1;d.n_total=2; d.dofs_per_node=3;
            let metric=EquilibriumMetric::for_2d(s,&d,None).unwrap();
            let mut before=vec![0.0;d.n_total];
            before[d.global_dof(1,0).unwrap()]=s.supports["1"].dx.unwrap();
            let mut after=before.clone(); after[d.global_dof(2,2).unwrap()]=0.001;
            metric.relative_increment(&before,&after)
        };
        let expected=ratio(&s);
        for length in [1e-3,1e3] {
            assert!((ratio(&scale_2d(&s,&Units::froude(length,1.0)))/expected-1.0).abs()<1e-12);
        }
    }

}

use super::{
    assembly::{InclinedTransformData, InclinedTransformData2D},
    constraints::FreeConstraintSystem,
    dof::DofNumbering,
    linear,
};
use crate::types::*;

pub(crate) struct RecoveredForces {
    restrained: Vec<f64>,
    free_residual: Vec<f64>,
    pub constraint_forces: Vec<ConstraintForce>,
}

impl RecoveredForces {
    pub(super) fn from_physical(
        internal: &PhysicalForces,
        applied: &[f64],
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        let internal = &internal.0;
        assert_eq!(internal.len(), dofs.n_total);
        assert_eq!(applied.len(), dofs.n_total);
        let residual: Vec<f64> = internal.iter().zip(applied).map(|(i, e)| i - e).collect();
        Self::from_residual(&residual, dofs, cs)
    }

    fn from_residual(
        residual: &[f64],
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        assert_eq!(residual.len(), dofs.n_total);
        Self::from_parts(residual[..dofs.n_free].to_vec(), residual[dofs.n_free..].to_vec(), dofs, cs)
    }

    pub(super) fn from_soil(
        residual: super::ssi::PhysicalSoilResidual,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        let (free, restrained) = residual.into_parts();
        Self::from_parts(free, restrained, dofs, cs)
    }

    fn from_parts(
        free_residual: Vec<f64>,
        mut restrained: Vec<f64>,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        assert_eq!(free_residual.len(), dofs.n_free);
        assert_eq!(restrained.len(), dofs.n_total - dofs.n_free);
        let constraint_forces = cs.map_or_else(Vec::new, |cs| {
            let raw = cs.constraint_forces_from_residual(&free_residual);
            cs.add_restrained_master_forces(&raw, &mut restrained);
            cs.constraint_forces(&raw, dofs)
        });
        Self { restrained, free_residual, constraint_forces }
    }

    pub(super) fn free_residual(&self) -> &[f64] {
        &self.free_residual
    }

    pub(super) fn from_stage(
        residual: &super::staged::PhysicalStageResidual,
        dofs: &DofNumbering,
        cs: Option<&FreeConstraintSystem>,
    ) -> Self {
        Self::from_residual(&residual.as_slice(), dofs, cs)
    }

    pub(super) fn reactions_2d(
        &self,
        input: &SolverInput,
        dofs: &DofNumbering,
        u_global: &[f64],
        its: &[InclinedTransformData2D],
    ) -> Result<Vec<Reaction>, String> {
        check_restraints(dofs, crate::ordered::values(&input.supports).flat_map(|s| {
            super::support::support_dofs_2d(s).into_iter().enumerate().filter_map(move |(k, d)| d.restrained.then_some((s.node_id, k)))
        }))?;
        let mut r = linear::build_reactions_2d_inclined(
            input,
            dofs,
            &self.restrained,
            &[],
            dofs.n_free,
            u_global,
            its,
        );
        r.sort_by_key(|r| r.node_id);
        Ok(r)
    }

    pub(super) fn reactions_3d(
        &self,
        input: &SolverInput3D,
        dofs: &DofNumbering,
        u_global: &[f64],
        its: &[InclinedTransformData],
    ) -> Result<Vec<Reaction3D>, String> {
        check_restraints(dofs, crate::ordered::values(&input.supports).flat_map(|s| {
            super::support::support_dofs_3d(s).into_iter().enumerate().filter_map(move |(k, d)| d.restrained.then_some((s.node_id, k)))
        }))?;
        let mut r = linear::build_reactions_3d_inclined(
            input,
            dofs,
            &self.restrained,
            &[],
            dofs.n_free,
            u_global,
            its,
        );
        r.sort_by_key(|r| r.node_id);
        Ok(r)
    }
}

pub(crate) fn unavailable(phase: &str, message: &str) -> StructuredDiagnostic {
    let mut d = StructuredDiagnostic::global(
        DiagnosticCode::ResultQuantityUnavailable,
        Severity::Warning,
        message.to_string(),
    );
    d.phase = Some(phase.to_string());
    d
}

pub(crate) fn balance_2d(
    input: &SolverInput,
    dofs: &DofNumbering,
    u: &[f64],
    f: &[f64],
    reactions: &[Reaction],
    its: &[InclinedTransformData2D],
    tolerance: f64,
) -> EquilibriumSummary {
    use super::fiber_nonlinear::{wrench_equilibrium, NodalWrench};
    let f = super::assembly::to_global(f, dofs.n_total, its);
    let at = |node, k| dofs.global_dof(node, k).map_or(0.0, |d| u[d]);
    let nodes: std::collections::HashMap<_, _> = crate::ordered::values(&input.nodes)
        .map(|n| (n.id, n))
        .collect();
    let position = |id| {
        let n = nodes[&id];
        [n.x + at(id, 0), 0.0, n.z + at(id, 1)]
    };
    let applied: Vec<_> = dofs
        .node_order
        .iter()
        .map(|&id| {
            let force = |k| dofs.global_dof(id, k).map_or(0.0, |d| f[d]);
            NodalWrench {
                r: position(id),
                f: [force(0), 0.0, force(1)],
                m: [0.0, -force(2), 0.0],
            }
        })
        .collect();
    let reacting: Vec<_> = reactions
        .iter()
        .map(|r| NodalWrench {
            r: position(r.node_id),
            f: [r.rx, 0.0, r.rz],
            m: [0.0, -r.my, 0.0],
        })
        .collect();
    let points: Vec<_> = applied.iter().map(|w| w.r).collect();
    let b = wrench_equilibrium(&points, &applied, &reacting, 0.0, tolerance, dofs.n_free);
    let mut summary = b.summary;
    summary.applied_force_sum = vec![b.applied[0], b.applied[2], -b.applied[4]];
    summary.reaction_force_sum = vec![b.reactions[0], b.reactions[2], -b.reactions[4]];
    summary
}

pub(crate) fn balance_3d(
    input: &SolverInput3D,
    dofs: &DofNumbering,
    u: &[f64],
    f: &[f64],
    reactions: &[Reaction3D],
    its: &[InclinedTransformData],
    tolerance: f64,
) -> EquilibriumSummary {
    use super::fiber_nonlinear::{wrench_equilibrium, NodalWrench};
    let f = super::assembly::to_global(f, dofs.n_total, its);
    let at = |node, k| dofs.global_dof(node, k).map_or(0.0, |d| u[d]);
    let nodes: std::collections::HashMap<_, _> = crate::ordered::values(&input.nodes)
        .map(|n| (n.id, n))
        .collect();
    let position = |id| {
        let n = nodes[&id];
        [n.x + at(id, 0), n.y + at(id, 1), n.z + at(id, 2)]
    };
    let applied: Vec<_> = dofs
        .node_order
        .iter()
        .map(|&id| {
            let force = |k| dofs.global_dof(id, k).map_or(0.0, |d| f[d]);
            NodalWrench {
                r: position(id),
                f: [force(0), force(1), force(2)],
                m: [force(3), force(4), force(5)],
            }
        })
        .collect();
    let reacting: Vec<_> = reactions
        .iter()
        .map(|r| NodalWrench {
            r: position(r.node_id),
            f: [r.fx, r.fy, r.fz],
            m: [r.mx, r.my, r.mz],
        })
        .collect();
    let points: Vec<_> = applied.iter().map(|w| w.r).collect();
    let b = wrench_equilibrium(&points, &applied, &reacting, 0.0, tolerance, dofs.n_free);
    let mut summary = b.summary;
    summary.applied_force_sum = b.applied.to_vec();
    summary.reaction_force_sum = b.reactions.to_vec();
    summary
}

fn check_restraints(dofs: &DofNumbering, required: impl Iterator<Item = (usize, usize)>) -> Result<(), String> {
    let required: std::collections::HashSet<_> = required.collect();
    let mut nodes: Vec<_> = dofs.map.iter().filter_map(|(&(node, k), &d)| ((d >= dofs.n_free) != required.contains(&(node, k))).then_some(node)).collect();
    nodes.sort_unstable();
    nodes.dedup();
    if nodes.is_empty() { return Ok(()); }
    let mut diagnostic = unavailable("reactions", "Results withheld: active support restraints differ from the DOFs used by the solve. Reactions, displacements and member forces cannot be recovered for this model. Rebuild the analysis with the requested supports.").with_nodes(nodes);
    diagnostic.severity = Severity::Error;
    Err(serde_json::json!({"message":diagnostic.message,"structuredDiagnostics":[diagnostic]}).to_string())
}

pub(crate) struct PhysicalForces(Vec<f64>);

impl PhysicalForces {
    pub(super) fn linear_2d(input: &SolverInput, dofs: &DofNumbering, u: &[f64]) -> Self {
        let a = super::assembly::physical_stiffness(|| {
            super::sparse_assembly::assemble_stiffness_sparse_2d(input, dofs)
        });
        Self(a.k_full.sym_mat_vec(u))
    }

    pub(super) fn linear_3d(input: &SolverInput3D, dofs: &DofNumbering, u: &[f64]) -> Self {
        let a = super::assembly::physical_stiffness(|| {
            super::assembly::assemble_stiffness_sparse_3d(input, dofs, true)
        });
        Self(
            a.k_full
                .expect("physical full stiffness requested")
                .sym_mat_vec(u),
        )
    }

    pub(super) fn corotational_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        u: &[f64],
        its: &[InclinedTransformData2D],
    ) -> Self {
        let mut f = vec![0.0; dofs.n_total];
        let mut discard = |_, _, _| {};
        super::corotational::assemble_corotational_impl(input, dofs, u, &mut f, &mut discard);
        super::corotational::add_physical_spring_contributions(
            input,
            dofs,
            u,
            &mut f,
            &mut discard,
        );
        Self(super::assembly::to_inclined_free(f, its, dofs.n_total))
    }

    pub(super) fn corotational_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        u: &[f64],
        left_hand: bool,
        its: &[InclinedTransformData],
    ) -> Self {
        let mut f = vec![0.0; dofs.n_total];
        let mut discard = |_, _, _| {};
        super::corotational::assemble_corotational_3d_impl(
            input,
            dofs,
            u,
            &mut f,
            &mut discard,
            left_hand,
        );
        super::corotational::add_spring_contributions_3d(input, dofs, u, &mut f, &mut discard);
        Self(super::assembly::to_inclined_free(f, its, dofs.n_total))
    }

    pub(super) fn material_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        states: &[(usize, super::material_nonlinear::ElementState)],
        u: &[f64],
        its: &[InclinedTransformData2D],
    ) -> Self {
        let mut k = super::material_nonlinear::assemble_tangent_stiffness(input, dofs, states, &[]);
        let mut unused = vec![0.0; dofs.n_total];
        for it in its {
            super::assembly::apply_inclined_transform_2d(
                &mut k,
                &mut unused,
                dofs.n_total,
                &it.dofs,
                &it.r,
            );
        }
        Self(crate::linalg::mat_vec(&k, u, dofs.n_total))
    }

    pub(super) fn material_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        states: &[(usize, super::material_nonlinear::ElementState3D)],
        u: &[f64],
        its: &[InclinedTransformData],
    ) -> Self {
        let mut k =
            super::material_nonlinear::assemble_tangent_stiffness_3d(input, dofs, states, &[]);
        let mut unused = vec![0.0; dofs.n_total];
        for it in its {
            super::assembly::apply_inclined_transform(
                &mut k,
                &mut unused,
                dofs.n_total,
                &it.dofs,
                &it.r,
            );
        }
        Self(crate::linalg::mat_vec(&k, u, dofs.n_total))
    }

    pub(super) fn pdelta_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        u: &[f64],
        its: &[InclinedTransformData2D],
    ) -> Self {
        let mut f = Self::linear_2d(input, dofs, u);
        let global = super::assembly::to_global(u, dofs.n_total, its);
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        super::geometric_stiffness::emit_geometric_stiffness_2d(
            input,
            dofs,
            &global,
            &mut |i, j, v| {
                if i >= j {
                    rows.push(i);
                    cols.push(j);
                    vals.push(v);
                }
            },
        );
        for it in its {
            super::assembly::apply_inclined_transform_triplets_2d(
                &mut rows, &mut cols, &mut vals, &it.dofs, &it.r,
            );
        }
        let k = crate::linalg::sparse::CscMatrix::from_triplets(dofs.n_total, &rows, &cols, &vals);
        for (a, b) in f.0.iter_mut().zip(k.sym_mat_vec(u)) {
            *a += b;
        }
        f
    }

    pub(super) fn pdelta_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        u: &[f64],
        its: &[InclinedTransformData],
    ) -> Self {
        let mut f = Self::linear_3d(input, dofs, u);
        let global = super::assembly::to_global(u, dofs.n_total, its);
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        super::geometric_stiffness::emit_geometric_stiffness_3d(
            input,
            dofs,
            &global,
            &mut |i, j, v| {
                if i >= j {
                    rows.push(i);
                    cols.push(j);
                    vals.push(v);
                }
            },
        );
        for it in its {
            super::assembly::apply_inclined_transform_triplets_k(
                &mut rows, &mut cols, &mut vals, &it.dofs, &it.r,
            );
        }
        let k = crate::linalg::sparse::CscMatrix::from_triplets(dofs.n_total, &rows, &cols, &vals);
        for (a, b) in f.0.iter_mut().zip(k.sym_mat_vec(u)) {
            *a += b;
        }
        f
    }

    pub(super) fn contact_2d(
        input: &SolverInput,
        dofs: &DofNumbering,
        u: &[f64],
        inactive: &[usize],
        corrections: &[super::contact::Correction],
    ) -> Self {
        let mut model = input.clone();
        model.elements.retain(|_, e| !inactive.contains(&e.id));
        Self::linear_2d(&model, dofs, u).with_contact(u, corrections)
    }

    pub(super) fn contact_3d(
        input: &SolverInput3D,
        dofs: &DofNumbering,
        u: &[f64],
        inactive: &[usize],
        corrections: &[super::contact::Correction],
    ) -> Self {
        let mut model = input.clone();
        model.elements.retain(|_, e| !inactive.contains(&e.id));
        Self::linear_3d(&model, dofs, u).with_contact(u, corrections)
    }

    fn with_contact(mut self, u: &[f64], corrections: &[super::contact::Correction]) -> Self {
        for c in corrections {
            let n = c.dofs.len();
            for a in 0..n {
                self.0[c.dofs[a]] -= c.f[a];
                for b in 0..n {
                    self.0[c.dofs[a]] += c.k[a * n + b] * u[c.dofs[b]];
                }
            }
        }
        self
    }

    pub(super) fn with_cables_2d(
        mut self,
        cables: &[super::cable::CableGeom],
        slots: &[([usize; 4], [f64; 4])],
        tensions: &std::collections::HashMap<usize, f64>,
        strains: &std::collections::HashMap<usize, f64>,
    ) -> Self {
        for (c, (dofs, coefficients)) in cables.iter().zip(slots) {
            for (&d, &coef) in dofs.iter().zip(coefficients) {
                if d != usize::MAX {
                    self.0[d] -= coef * (tensions[&c.elem_id] - c.ea * strains[&c.elem_id]);
                }
            }
        }
        self
    }

    pub(super) fn with_cables_3d(
        mut self,
        cables: &[super::cable::CableGeom3D],
        slots: &[([usize; 6], [f64; 6])],
        tensions: &std::collections::HashMap<usize, f64>,
        strains: &std::collections::HashMap<usize, f64>,
    ) -> Self {
        for (c, (dofs, coefficients)) in cables.iter().zip(slots) {
            for (&d, &coef) in dofs.iter().zip(coefficients) {
                if d != usize::MAX {
                    self.0[d] -= coef * (tensions[&c.elem_id] - c.ea * strains[&c.elem_id]);
                }
            }
        }
        self
    }

    pub(super) fn winkler_2d(
        input: &super::winkler::WinklerInput,
        dofs: &DofNumbering,
        u: &[f64],
    ) -> Result<Self, String> {
        let mut a = super::assembly::physical_stiffness(|| {
            super::assembly::assemble_2d(&input.solver, dofs)
        });
        let nodes = crate::ordered::values(&input.solver.nodes)
            .map(|n| (n.id, n))
            .collect();
        let elements = crate::ordered::values(&input.solver.elements)
            .map(|e| (e.id, e))
            .collect();
        for spring in &input.foundation_springs {
            super::winkler::add_foundation_2d(
                &mut a.k,
                dofs.n_total,
                spring,
                &nodes,
                &elements,
                dofs,
            )?;
        }
        Ok(Self(crate::linalg::mat_vec(&a.k, u, dofs.n_total)))
    }

    pub(super) fn winkler_3d(
        input: &super::winkler::WinklerInput3D,
        model: &SolverInput3D,
        dofs: &DofNumbering,
        u: &[f64],
    ) -> Result<Self, String> {
        let mut a =
            super::assembly::physical_stiffness(|| super::assembly::assemble_3d(model, dofs));
        let nodes = crate::ordered::values(&model.nodes)
            .map(|n| (n.id, n))
            .collect();
        let elements = crate::ordered::values(&model.elements)
            .map(|e| (e.id, e))
            .collect();
        for spring in &input.foundation_springs {
            super::winkler::add_foundation_3d(
                &mut a.k,
                dofs.n_total,
                spring,
                model,
                &nodes,
                &elements,
                dofs,
            )?;
        }
        Ok(Self(crate::linalg::mat_vec(&a.k, u, dofs.n_total)))
    }

    pub(super) fn fiber_2d(
        input: &super::fiber_nonlinear::FiberNonlinearInput,
        dofs: &DofNumbering,
        u: &[f64],
        states: &std::collections::HashMap<usize, super::fiber_nonlinear::ElementFiberState>,
        n_ip: usize,
    ) -> Self {
        let mut f = vec![0.0; dofs.n_total];
        let mut probe = states.clone();
        let mut discard = |_, _, _| {};
        super::fiber_nonlinear::assemble_fiber_elements(
            &input.solver,
            &input.fiber_sections,
            dofs,
            u,
            &mut probe,
            n_ip,
            &mut f,
            &mut discard,
        );
        super::fiber_nonlinear::assemble_elastic_elements(
            &input.solver,
            &input.fiber_sections,
            dofs,
            u,
            &mut f,
            &mut discard,
        );
        super::fiber_nonlinear::add_springs(&input.solver, dofs, u, &mut f, &[], &mut discard);
        Self(f)
    }

    pub(super) fn fiber_3d(
        input: &super::fiber_nonlinear::FiberNonlinearInput3D,
        dofs: &DofNumbering,
        u: &[f64],
        states: &std::collections::HashMap<usize, super::fiber_nonlinear::ElementFiberState>,
        n_ip: usize,
    ) -> Self {
        let mut f = vec![0.0; dofs.n_total];
        let mut probe = states.clone();
        let mut discard = |_, _, _| {};
        super::fiber_nonlinear::assemble_fiber_elements_3d(
            &input.solver,
            &input.fiber_sections,
            dofs,
            u,
            &mut probe,
            n_ip,
            &mut f,
            &mut discard,
        );
        super::fiber_nonlinear::assemble_elastic_elements_3d(
            &input.solver,
            &input.fiber_sections,
            dofs,
            u,
            &mut f,
            &mut discard,
        );
        super::fiber_nonlinear::add_springs_3d(&input.solver, dofs, u, &mut f, &mut discard);
        Self(f)
    }

    pub(super) fn in_frame<T: super::assembly::InclinedFrame>(self, its: &[T]) -> Self {
        let n = self.0.len();
        Self(super::assembly::to_inclined_free(self.0, its, n))
    }

    pub(super) fn as_slice(&self) -> &[f64] {
        &self.0
    }
}

#[cfg(test)]
mod r8_tests {
    use super::super::corotational::{add_spring_contributions, build_final_results};
    use super::*;
    use serde_json::json;

    #[test]
    fn issue_1952_r8_stabilized_released_slave_recovery() {
        let mut failures = Vec::new();
        for motion in [0.0, 0.0013, -0.0013] {
            let mut m: serde_json::Value = serde_json::from_str(include_str!(
                "../../tests/fixtures/reaction-recovery-2d.json"
            ))
            .unwrap();
            m["elements"]["1"]["hingeEnd"] = json!(true);
            m["nodes"]["2"] = m["nodes"]["0"].clone();
            m["nodes"]["2"]["id"] = json!(2);
            m["supports"]["2"] = json!({"id":2,"nodeId":2,"type":"fixed","dry":motion});
            m["constraints"] = json!([{"type":"equalDOF","masterNode":2,"slaveNode":1,"dofs":[2]}]);
            m["loads"] = json!([]);
            let input: SolverInput = serde_json::from_value(m).unwrap();
            let dofs = DofNumbering::build_2d(&input);
            let cs = FreeConstraintSystem::build_2d(&input, &dofs).unwrap();
            let slave = dofs.global_dof(1, 2).unwrap();
            let mut u = vec![0.0; dofs.n_total];
            u[slave] = motion;
            u[dofs.global_dof(2, 2).unwrap()] = motion;
            for k in [1e-6, 1.0, 1e6] {
                let mut artificial = vec![0.0; dofs.n_total];
                add_spring_contributions(
                    &input,
                    &dofs,
                    &u,
                    &mut artificial,
                    &[(slave, k)],
                    &mut |_, _, _| {},
                );
                assert_eq!(artificial[slave], k * motion);
                let contaminated = RecoveredForces::from_residual(&artificial, &dofs, cs.as_ref());
                let contaminated_reactions =
                    contaminated.reactions_2d(&input, &dofs, &u, &[]).unwrap();
                let master = contaminated_reactions
                    .iter()
                    .find(|r| r.node_id == 2)
                    .unwrap();
                assert_eq!(master.my, k * motion);

                let result = build_final_results(&input, &dofs, &u, &cs, &[]).unwrap();
                assert_eq!(result.displacements.len(), 3);
                assert_eq!(result.reactions.len(), 2);
                assert_eq!(result.element_forces.len(), 1);
                if result
                    .reactions
                    .iter()
                    .any(|r| [r.rx, r.rz, r.my].iter().any(|&v| v != 0.0))
                    || result.constraint_forces.iter().any(|f| f.force != 0.0)
                {
                    failures.push(format!(
                        "motion={motion} k={k}: {}",
                        serde_json::to_value(&result).unwrap()
                    ));
                }
                let f = &result.element_forces[0];
                assert_eq!(
                    [f.n_start, f.n_end, f.v_start, f.v_end, f.m_start, f.m_end],
                    [0.0; 6]
                );
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}

use super::*;
use crate::solver::experimental_nonlinear::path_following::{
    solve_by_arc_length, solve_by_displacement_control, ArcLengthControl, DisplacementControl,
    PathProblem,
};

pub fn solve_arc_length(input: &ArcLengthInput) -> Result<ArcLengthResult, String> {
    solve_arc_length_from(input, None)
}

pub fn solve_arc_length_from(
    input: &ArcLengthInput,
    start: Option<&crate::solver::corotational::CorotationalStart2D>,
) -> Result<ArcLengthResult, String> {
    let mut r = solve_arc_length_contained(input, start)?;
    crate::known_issues::attach(
        &mut r.results.structured_diagnostics,
        crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Corotational),
    );
    Ok(r)
}

fn set_supports(u: &mut [f64], nf: usize, u_r_start: &[f64], du_support: &[f64], lambda: f64) {
    for (r, (&u0, &du)) in u_r_start.iter().zip(du_support).enumerate() {
        u[nf + r] = u0 + lambda * du;
    }
}

struct ArcLength2D<'a> {
    solver: &'a SolverInput,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    art: &'a [(usize, f64)],
    its: &'a [InclinedTransformData2D],
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    sparse: bool,
    ns: usize,
    moves_supports: bool,
    psi2: f64,
    f_ref: &'a Vec<f64>,
    f_ref_full: &'a Vec<f64>,
    f_start: &'a Vec<f64>,
    f_start_full: &'a Vec<f64>,
    u_r_start: &'a Vec<f64>,
    du_support: &'a Vec<f64>,
    support_direction: &'a Vec<f64>,
    start_internal: &'a Vec<f64>,
    u_full: Vec<f64>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    asm_t: Option<TangentAssembly>,
    residual: Vec<f64>,
    steps: Vec<EquilibriumStep>,
}

impl ArcLength2D<'_> {
    fn reference(&self, asm_t: &TangentAssembly) -> Vec<f64> {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        let support_direction = self.support_direction;
        let mut g = self.f_ref.clone();
        if self.moves_supports {
            if self.sparse {
                for ((&i, &j), &v) in asm_t
                    .trip_rows
                    .iter()
                    .zip(&asm_t.trip_cols)
                    .zip(&asm_t.trip_vals)
                {
                    if i < nf {
                        g[i] -= v * support_direction[j];
                    }
                    if i != j && j < nf {
                        g[j] -= v * support_direction[i];
                    }
                }
            } else {
                for (i, gi) in g.iter_mut().enumerate() {
                    *gi -= (0..n)
                        .map(|j| asm_t.k_t[i * n + j] * support_direction[j])
                        .sum::<f64>();
                }
            }
        }
        g
    }

    fn reduce(&self, v: &Vec<f64>) -> Vec<f64> {
        if let Some(ref cs) = *self.cs {
            cs.reduce_vector(v)
        } else {
            v.clone()
        }
    }
}

impl PathProblem for ArcLength2D<'_> {
    fn unknowns(&self) -> usize {
        self.dof_num.n_free
    }

    fn load_scale(&self) -> f64 {
        self.psi2
    }

    fn linearize_at(&mut self, lambda: f64) {
        set_supports(
            &mut self.u_full,
            self.dof_num.n_free,
            self.u_r_start,
            self.du_support,
            lambda,
        );
        self.asm_t = Some(assemble_tangent(
            self.solver,
            self.dof_num,
            &self.u_full,
            self.art,
            self.sparse,
            self.its,
        ));
    }

    fn measure(&mut self, lambda: f64) -> f64 {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        let (f_start, f_ref, f_start_full, f_ref_full) =
            (self.f_start, self.f_ref, self.f_start_full, self.f_ref_full);
        let Some(asm_t) = self.asm_t.as_ref() else {
            return f64::INFINITY;
        };
        let f_int_new = &asm_t.f_int;

        let mut residual = vec![0.0; nf];
        for i in 0..nf {
            residual[i] = f_start[i] + lambda * f_ref[i] - f_int_new[i];
        }

        let applied: Vec<f64> = (0..n)
            .map(|i| f_start_full[i] + lambda * f_ref_full[i])
            .collect();
        let measure = self.metric.continuation_residual(
            &residual,
            &applied,
            &self.u_full[nf..],
            f_start_full,
            self.start_internal,
            self.cs.as_ref(),
        );
        self.residual = residual;
        measure
    }

    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else {
            return Err("Arc-length analysis: no tangent assembled".into());
        };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_hat_s = solve_with_tangent(&tangent, &self.reduce(&self.reference(&asm_t)), ns)?;
        Ok(if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_hat_s, MasterMotion::Prescribed(self.du_support))
        } else {
            du_hat_s
        })
    }

    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else {
            return Err("Arc-length analysis: no tangent assembled".into());
        };
        let residual = std::mem::take(&mut self.residual);
        let residual_s = if let Some(ref cs) = *self.cs {
            cs.reduce_vector(&residual)
        } else {
            residual.clone()
        };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_r_s = solve_with_tangent(&tangent, &residual_s, ns)?;
        let du_t_s = solve_with_tangent(&tangent, &self.reduce(&self.reference(&asm_t)), ns)?;
        let du_r = if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_r_s, MasterMotion::Homogeneous)
        } else {
            du_r_s
        };
        let du_t = if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_t_s, MasterMotion::Prescribed(self.du_support))
        } else {
            du_t_s
        };
        Ok((du_r, du_t))
    }

    fn advance(&mut self, step: &[f64]) {
        for i in 0..self.dof_num.n_free {
            self.u_full[i] += step[i];
        }
    }

    fn unknown(&self, index: usize) -> f64 {
        self.u_full[index]
    }

    fn record(
        &mut self,
        step: usize,
        lambda: f64,
        iterations: usize,
        converged: bool,
    ) -> Result<(), String> {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        set_supports(
            &mut self.u_full,
            nf,
            self.u_r_start,
            self.du_support,
            lambda,
        );
        self.steps.push(EquilibriumStep {
            step,
            load_factor: lambda,
            control_displacement: self.u_full.get(0).copied().unwrap_or(0.0),
            converged,
            iterations,
            displacements: crate::solver::linear::build_displacements_2d(
                self.dof_num,
                &assembly::to_global(&self.u_full, n, self.its),
            ),
        });
        Ok(())
    }
}

fn solve_arc_length_contained(
    input: &ArcLengthInput,
    start: Option<&crate::solver::corotational::CorotationalStart2D>,
) -> Result<ArcLengthResult, String> {
    crate::solver::linear::validate_input_2d(&input.solver)?;
    crate::solver::feature_gates::refuse_2d(
        &input.solver,
        "Arc-length analysis",
        &[crate::solver::feature_gates::Feature::ThermalLoads],
    )?;
    crate::element::connector::refuse_for_corotational_2d(&input.solver, "Arc-length analysis")?;
    crate::solver::corotational::refuse_inclined_motion_2d(&input.solver, start.is_some())?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let sparse = ns >= SPARSE_THRESHOLD;

    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let its = asm.inclined_transforms_2d;
    let f_ref_full = asm.f;
    let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
    let (u_full, f_start) = match start {
        Some(start) => crate::solver::corotational::start_state_2d(&input.solver, start, &dof_num)?,
        None => (vec![0.0; n], vec![0.0; n]),
    };
    let f_start_full = f_start;
    let f_start: Vec<f64> = f_start_full[..nf].to_vec();
    let u_r_start: Vec<f64> = u_full[nf..].to_vec();
    let du_support = crate::solver::linear::prescribed_displacements_2d(&input.solver, &dof_num);
    let moves_supports = du_support.iter().any(|&v| v != 0.0);
    let mut support_direction = vec![0.0; n];
    support_direction[nf..].copy_from_slice(&du_support);
    if let Some(ref cs) = cs {
        cs.impose_motion(&mut support_direction);
    }
    let support_extent: Vec<_> = u_r_start
        .iter()
        .zip(&du_support)
        .map(|(a, b)| a.abs() + b.abs())
        .collect();
    let metric = crate::solver::convergence::EquilibriumMetric::for_2d_with_state(
        &input.solver,
        &dof_num,
        cs.as_ref(),
        Some(&support_extent),
        &[],
    )?;
    let start_internal = if start.is_some() {
        crate::solver::corotational::continuation_internal_2d(
            &input.solver,
            &dof_num,
            &u_full,
            &its,
            &art,
        )
    } else {
        vec![0.0; n]
    };
    let f_ref_norm = metric.free_norm(&f_ref, cs.as_ref());
    if f_ref_norm == 0.0 && !moves_supports {
        return Err("Zero reference load".into());
    }
    let psi2 = if f_ref_norm > 0.0 {
        vec_norm(&f_ref).powi(2)
    } else {
        vec_norm(&du_support).powi(2)
    };
    let mut problem = ArcLength2D {
        solver: &input.solver,
        dof_num: &dof_num,
        cs: &cs,
        art: &art,
        its: &its,
        metric: &metric,
        sparse,
        ns,
        moves_supports,
        psi2,
        f_ref: &f_ref,
        f_ref_full: &f_ref_full,
        f_start: &f_start,
        f_start_full: &f_start_full,
        u_r_start: &u_r_start,
        du_support: &du_support,
        support_direction: &support_direction,
        start_internal: &start_internal,
        u_full,
        sparse_sym_cache: None,
        asm_t: None,
        residual: Vec::new(),
        steps: Vec::new(),
    };
    let outcome = solve_by_arc_length(
        &mut problem,
        &ArcLengthControl {
            max_steps: input.max_steps,
            max_iter: input.max_iter,
            tolerance: input.tolerance,
            initial_ds: input.initial_ds,
            min_ds: input.min_ds,
            max_ds: input.max_ds,
            target_iter: input.target_iter,
        },
    )?;
    let ArcLength2D {
        mut u_full, steps, ..
    } = problem;
    let (lambda, overall_converged, total_iters) =
        (outcome.load_factor, outcome.converged, outcome.iterations);

    set_supports(&mut u_full, nf, &u_r_start, &du_support, lambda);
    let mut at_state = crate::solver::corotational::scaled_loads_2d(&input.solver, lambda);
    if let Some(start) = start {
        at_state.loads.extend(start.input.loads.clone());
    }
    let results =
        crate::solver::corotational::build_final_results(&at_state, &dof_num, &u_full, &cs, &its)?;

    Ok(ArcLengthResult {
        results,
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

pub fn solve_displacement_control(
    input: &DisplacementControlInput,
) -> Result<DisplacementControlResult, String> {
    let mut r = solve_displacement_control_contained(input)?;
    crate::known_issues::attach(
        &mut r.results.structured_diagnostics,
        crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Corotational),
    );
    Ok(r)
}

struct DisplacementControl2D<'a> {
    solver: &'a SolverInput,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    art: &'a [(usize, f64)],
    its: &'a [InclinedTransformData2D],
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    sparse: bool,
    ns: usize,
    ctrl: usize,
    f_ref: &'a Vec<f64>,
    f_ref_full: &'a Vec<f64>,
    f_ref_s: &'a Vec<f64>,
    u_full: Vec<f64>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    asm_t: Option<TangentAssembly>,
    residual: Vec<f64>,
    steps: Vec<EquilibriumStep>,
}

impl PathProblem for DisplacementControl2D<'_> {
    fn unknowns(&self) -> usize {
        self.dof_num.n_free
    }

    fn load_scale(&self) -> f64 {
        vec_norm(self.f_ref).powi(2)
    }

    fn linearize_at(&mut self, _: f64) {
        self.asm_t = Some(assemble_tangent(
            self.solver,
            self.dof_num,
            &self.u_full,
            self.art,
            self.sparse,
            self.its,
        ));
    }

    fn measure(&mut self, lambda: f64) -> f64 {
        let nf = self.dof_num.n_free;
        let (f_ref, f_ref_full) = (self.f_ref, self.f_ref_full);
        let Some(asm_t) = self.asm_t.as_ref() else {
            return f64::INFINITY;
        };
        let f_int = &asm_t.f_int;

        let mut residual = vec![0.0; nf];
        for i in 0..nf {
            residual[i] = lambda * f_ref[i] - f_int[i];
        }

        let applied: Vec<f64> = f_ref_full.iter().map(|f| lambda * f).collect();
        let rel_error = self
            .metric
            .relative_residual(&residual, &applied, None, self.cs.as_ref());
        self.residual = residual;
        rel_error
    }

    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else {
            return Err("Displacement-control analysis: no tangent assembled".into());
        };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_t_s = solve_with_tangent(&tangent, self.f_ref_s, ns)?;
        Ok(if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_t_s, MasterMotion::Homogeneous)
        } else {
            du_t_s
        })
    }

    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else {
            return Err("Displacement-control analysis: no tangent assembled".into());
        };
        let residual = std::mem::take(&mut self.residual);
        let residual_s = if let Some(ref cs) = *self.cs {
            cs.reduce_vector(&residual)
        } else {
            residual
        };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_r_s = solve_with_tangent(&tangent, &residual_s, ns)?;
        let du_t_s = solve_with_tangent(&tangent, self.f_ref_s, ns)?;
        let du_r = if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_r_s, MasterMotion::Homogeneous)
        } else {
            du_r_s
        };
        let du_t = if let Some(ref cs) = *self.cs {
            cs.expand_solution(&du_t_s, MasterMotion::Homogeneous)
        } else {
            du_t_s
        };
        Ok((du_r, du_t))
    }

    fn advance(&mut self, step: &[f64]) {
        for i in 0..self.dof_num.n_free {
            self.u_full[i] += step[i];
        }
    }

    fn unknown(&self, index: usize) -> f64 {
        self.u_full[index]
    }

    fn record(
        &mut self,
        step: usize,
        lambda: f64,
        iterations: usize,
        converged: bool,
    ) -> Result<(), String> {
        let n = self.dof_num.n_total;
        self.steps.push(EquilibriumStep {
            step,
            load_factor: lambda,
            control_displacement: self.u_full[self.ctrl],
            converged,
            iterations,
            displacements: crate::solver::linear::build_displacements_2d(
                self.dof_num,
                &assembly::to_global(&self.u_full, n, self.its),
            ),
        });
        Ok(())
    }
}

fn solve_displacement_control_contained(
    input: &DisplacementControlInput,
) -> Result<DisplacementControlResult, String> {
    crate::solver::linear::validate_input_2d(&input.solver)?;
    crate::solver::feature_gates::refuse_2d(
        &input.solver,
        "Displacement-control analysis",
        &[
            crate::solver::feature_gates::Feature::PrescribedDisplacements,
            crate::solver::feature_gates::Feature::InclinedSupports,
            crate::solver::feature_gates::Feature::ThermalLoads,
        ],
    )?;
    crate::element::connector::refuse_for_corotational_2d(
        &input.solver,
        "Displacement-control analysis",
    )?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let cs_dc = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let metric = crate::solver::convergence::EquilibriumMetric::for_2d(
        &input.solver,
        &dof_num,
        cs_dc.as_ref(),
    )?;
    let ns_dc = cs_dc.as_ref().map_or(nf, |c| c.n_free_indep);

    let sparse = ns_dc >= SPARSE_THRESHOLD;

    let control_global = dof_num
        .map
        .get(&(input.control_node, input.control_dof))
        .ok_or("Control node/DOF not found in free DOFs")?;
    if *control_global >= nf {
        return Err("Control DOF is restrained".into());
    }
    let ctrl = *control_global;

    if input.n_steps == 0 {
        return Err("Number of displacement steps must be at least 1".into());
    }
    if input.max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if !input.target_displacement.is_finite() || input.target_displacement == 0.0 {
        return Err("Target displacement must be finite and non-zero".into());
    }
    if !input.tolerance.is_finite() || input.tolerance <= 0.0 {
        return Err("Convergence tolerance must be finite and positive".into());
    }

    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let its = asm.inclined_transforms_2d;
    let f_ref_full = asm.f;
    let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
    let f_ref_s_dc = if let Some(ref cs) = cs_dc {
        cs.reduce_vector(&f_ref)
    } else {
        f_ref.clone()
    };
    let f_ref_norm = metric.free_norm(&f_ref, cs_dc.as_ref());
    if f_ref_norm == 0.0 {
        return Err("Zero reference load".into());
    }

    let mut problem = DisplacementControl2D {
        solver: &input.solver,
        dof_num: &dof_num,
        cs: &cs_dc,
        art: &art,
        its: &its,
        metric: &metric,
        sparse,
        ns: ns_dc,
        ctrl,
        f_ref: &f_ref,
        f_ref_full: &f_ref_full,
        f_ref_s: &f_ref_s_dc,
        u_full: vec![0.0; n],
        sparse_sym_cache: None,
        asm_t: None,
        residual: Vec::new(),
        steps: Vec::new(),
    };
    let outcome = solve_by_displacement_control(
        &mut problem,
        &DisplacementControl {
            control: ctrl,
            target: input.target_displacement,
            n_steps: input.n_steps,
            max_iter: input.max_iter,
            tolerance: input.tolerance,
        },
    )?;
    let DisplacementControl2D { u_full, steps, .. } = problem;
    let (lambda, overall_converged, total_iters) =
        (outcome.load_factor, outcome.converged, outcome.iterations);

    let at_state = crate::solver::corotational::scaled_loads_2d(&input.solver, lambda);
    let results = crate::solver::corotational::build_final_results(
        &at_state, &dof_num, &u_full, &cs_dc, &its,
    )?;

    Ok(DisplacementControlResult {
        results,
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

#[cfg(test)]
mod shared_driver_equivalence {
    use super::*;
    use std::collections::HashMap;

    fn frame(n: usize, rise: f64, far_support: Option<&str>) -> SolverInput {
        let (mut nodes, mut elements, mut supports) =
            (HashMap::new(), HashMap::new(), HashMap::new());
        for i in 0..=n {
            let t = i as f64 / n as f64;
            nodes.insert(
                (i + 1).to_string(),
                SolverNode {
                    id: i + 1,
                    x: 6.0 * t,
                    z: rise * 4.0 * t * (1.0 - t),
                },
            );
        }
        for i in 0..n {
            elements.insert(
                (i + 1).to_string(),
                SolverElement {
                    id: i + 1,
                    elem_type: "frame".into(),
                    node_i: i + 1,
                    node_j: i + 2,
                    material_id: 1,
                    section_id: 1,
                    hinge_start: false,
                    hinge_end: false,
                },
            );
        }
        let support = |id: usize, node_id: usize, kind: &str| SolverSupport {
            id,
            node_id,
            support_type: kind.into(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        };
        supports.insert(
            "1".into(),
            support(
                1,
                1,
                if far_support.is_some() {
                    "pinned"
                } else {
                    "fixed"
                },
            ),
        );
        if let Some(kind) = far_support {
            supports.insert("2".into(), support(2, n + 1, kind));
        }
        let loaded = if far_support.is_some() {
            n / 2 + 1
        } else {
            n + 1
        };
        SolverInput {
            solver_options: None,
            masses: Default::default(),
            nodes,
            materials: HashMap::from([(
                "1".to_string(),
                SolverMaterial {
                    id: 1,
                    e: 200.0,
                    nu: 0.3,
                },
            )]),
            sections: HashMap::from([(
                "1".to_string(),
                SolverSection {
                    id: 1,
                    a: 0.01,
                    iz: 1e-4,
                    as_y: None,
                },
            )]),
            elements,
            supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: loaded,
                fx: 0.0,
                fz: -30.0,
                my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    fn asked(
        solver: SolverInput,
        max_steps: usize,
        max_iter: usize,
        initial_ds: f64,
    ) -> ArcLengthInput {
        ArcLengthInput {
            solver,
            max_steps,
            max_iter,
            tolerance: 1e-8,
            initial_ds,
            min_ds: 1e-5,
            max_ds: 2.0 * initial_ds,
            target_iter: 5,
        }
    }

    fn same(
        input: &ArcLengthInput,
        start: Option<&crate::solver::corotational::CorotationalStart2D>,
    ) -> Option<ArcLengthResult> {
        let before = super::super::solve_arc_length_contained(input, start);
        let now = solve_arc_length_contained(input, start);
        match (before, now) {
            (Ok(before), Ok(now)) => {
                assert_eq!(format!("{before:?}"), format!("{now:?}"));
                Some(now)
            }
            (Err(before), Err(now)) => {
                assert_eq!(before, now);
                None
            }
            (before, now) => panic!(
                "{:?} against {:?}",
                before.map(|r| r.converged),
                now.map(|r| r.converged)
            ),
        }
    }

    #[test]
    fn the_shared_driver_gives_the_paths_the_loop_gave_bit_for_bit() {
        let (mut followed, mut cut_short, mut sparse, mut steps) = (0, 0, 0, 0);
        for n in [2, 6, 14, 30] {
            for (rise, far_support) in [
                (0.0, None),
                (0.3, None),
                (0.15, Some("pinned")),
                (0.6, Some("pinned")),
            ] {
                let solver = frame(n, rise, far_support);
                if DofNumbering::build_2d(&solver).n_free >= SPARSE_THRESHOLD {
                    sparse += 1;
                }
                for (max_steps, max_iter, initial_ds) in [
                    (12, 30, 0.05),
                    (30, 30, 0.2),
                    (8, 2, 0.5),
                    (6, 1, 0.05),
                    (0, 30, 0.1),
                ] {
                    let Some(result) = same(
                        &asked(solver.clone(), max_steps, max_iter, initial_ds),
                        None,
                    ) else {
                        continue;
                    };
                    steps += result.steps.len();
                    if result.converged {
                        followed += 1
                    } else {
                        cut_short += 1
                    }
                }
            }
        }
        assert!(
            followed >= 30 && cut_short >= 4 && sparse >= 3 && steps >= 300,
            "{followed} followed, {cut_short} cut short, {sparse} sparse, {steps} steps"
        );
    }

    #[test]
    fn moving_supports_a_start_state_and_refusals_go_through_the_shared_driver_unchanged() {
        for n in [6, 30] {
            let mut settling = frame(n, 0.3, Some("pinned"));
            settling.supports.get_mut("2").unwrap().dz = Some(-0.05);
            assert!(same(&asked(settling.clone(), 10, 30, 0.05), None).is_some());
            settling.loads.clear();
            assert!(same(&asked(settling, 10, 30, 0.05), None).is_some());

            let first = frame(n, 0.3, Some("pinned"));
            let reached =
                crate::solver::corotational::solve_corotational_2d(&first, 60, 1e-8, 8, false)
                    .unwrap();
            let start = crate::solver::corotational::CorotationalStart2D {
                input: &first,
                displacements: &reached.results.displacements,
            };
            let mut next = frame(n, 0.3, Some("pinned"));
            next.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1,
                fx: 2.0,
                fz: -10.0,
                my: 0.0,
            })];
            assert!(same(&asked(next, 10, 30, 0.05), Some(&start)).is_some());
        }
        let mut unloaded = frame(6, 0.3, None);
        unloaded.loads.clear();
        assert!(same(&asked(unloaded, 10, 30, 0.05), None).is_none());
        let mut held = frame(1, 0.0, Some("fixed"));
        held.supports.get_mut("1").unwrap().support_type = "fixed".into();
        assert!(same(&asked(held, 10, 30, 0.05), None).is_none());
    }

    fn driven(
        solver: SolverInput,
        control_node: usize,
        control_dof: usize,
        target_displacement: f64,
        n_steps: usize,
        max_iter: usize,
    ) -> DisplacementControlInput {
        DisplacementControlInput {
            solver,
            control_node,
            control_dof,
            target_displacement,
            n_steps,
            max_iter,
            tolerance: 1e-8,
        }
    }

    fn same_driven(input: &DisplacementControlInput) -> Option<DisplacementControlResult> {
        let before = super::super::solve_displacement_control_contained(input);
        let now = solve_displacement_control_contained(input);
        match (before, now) {
            (Ok(before), Ok(now)) => {
                assert_eq!(format!("{before:?}"), format!("{now:?}"));
                Some(now)
            }
            (Err(before), Err(now)) => {
                assert_eq!(before, now);
                None
            }
            (before, now) => panic!(
                "{:?} against {:?}",
                before.map(|r| r.converged),
                now.map(|r| r.converged)
            ),
        }
    }

    #[test]
    fn the_shared_driver_gives_the_driven_paths_the_loop_gave_bit_for_bit() {
        let (mut reached, mut stopped, mut sparse, mut steps) = (0, 0, 0, 0);
        for n in [2, 6, 14, 30] {
            for (rise, far_support) in [
                (0.0, None),
                (0.3, None),
                (0.15, Some("pinned")),
                (0.6, Some("pinned")),
            ] {
                let solver = frame(n, rise, far_support);
                if DofNumbering::build_2d(&solver).n_free >= SPARSE_THRESHOLD {
                    sparse += 1;
                }
                let node = if far_support.is_some() {
                    n / 2 + 1
                } else {
                    n + 1
                };
                for (dof, target, n_steps, max_iter) in [
                    (1, -0.05, 10, 30),
                    (1, -0.4, 8, 30),
                    (1, 0.02, 5, 30),
                    (2, 0.1, 6, 30),
                    (1, -0.4, 4, 2),
                    (1, -0.05, 3, 1),
                ] {
                    let Some(result) = same_driven(&driven(
                        solver.clone(),
                        node,
                        dof,
                        target,
                        n_steps,
                        max_iter,
                    )) else {
                        continue;
                    };
                    steps += result.steps.len();
                    if result.converged {
                        reached += 1
                    } else {
                        stopped += 1
                    }
                }
            }
        }
        assert!(
            reached >= 25 && stopped >= 10 && sparse >= 3 && steps >= 200,
            "{reached} reached, {stopped} stopped, {sparse} sparse, {steps} steps"
        );
    }

    #[test]
    fn refused_displacement_control_is_refused_with_the_same_words() {
        let solver = frame(6, 0.3, None);
        for input in [
            driven(solver.clone(), 7, 1, -0.05, 0, 30),
            driven(solver.clone(), 7, 1, -0.05, 10, 0),
            driven(solver.clone(), 7, 1, 0.0, 10, 30),
            driven(solver.clone(), 7, 1, f64::NAN, 10, 30),
            driven(solver.clone(), 1, 1, -0.05, 10, 30),
            driven(solver.clone(), 99, 1, -0.05, 10, 30),
            driven(solver.clone(), 7, 9, -0.05, 10, 30),
        ] {
            assert!(same_driven(&input).is_none());
        }
        let mut unloaded = frame(6, 0.3, None);
        unloaded.loads.clear();
        assert!(same_driven(&driven(unloaded, 7, 1, -0.05, 10, 30)).is_none());
        let mut tolerance = driven(solver, 7, 1, -0.05, 10, 30);
        tolerance.tolerance = 0.0;
        assert!(same_driven(&tolerance).is_none());
    }
}

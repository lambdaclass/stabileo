use super::*;
use crate::solver::experimental_nonlinear::{
    incremental::{self, IterationMethod, LoadStepping},
    PlaneInputs,
};

fn interpolate_increment(base: &[f64], target: &[f64], factor: f64) -> Vec<f64> {
    match factor {
        0.0 => base.to_vec(),
        1.0 => target.to_vec(),
        _ => base
            .iter()
            .zip(target)
            .map(|(&base, &target)| base + factor * (target - base))
            .collect(),
    }
}

struct Corotational2D<'a> {
    input: &'a SolverInput,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    asm: &'a assembly::AssemblyResult,
    art: &'a [(usize, f64)],
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    ns: usize,
    f_total: &'a [f64],
    f_base: &'a [f64],
    u_r_base: &'a [f64],
    u_r_target: &'a [f64],
    start_internal: &'a [f64],
    u_full: Vec<f64>,
    u_converged: Vec<f64>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    conditioning: Option<StructuredDiagnostic>,
    f_ext: Vec<f64>,
    active_supports: Vec<f64>,
    support_step: Option<Vec<f64>>,
    cached_factor: Option<CachedTangentFactor>,
    r_f: Vec<f64>,
    unbalance: Vec<f64>,
    k_t: Vec<f64>,
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
}

impl incremental::IncrementalProblem for Corotational2D<'_> {
    fn begin_increment(&mut self, load_factor: f64) {
        let nf = self.dof_num.n_free;
        self.f_ext = interpolate_increment(self.f_base, self.f_total, load_factor);
        self.active_supports = interpolate_increment(self.u_r_base, self.u_r_target, load_factor);
        let support_step: Vec<f64> = self
            .active_supports
            .iter()
            .zip(&self.u_full[nf..])
            .map(|(target, current)| target - current)
            .collect();
        self.support_step = support_step.iter().any(|&v| v != 0.0).then_some(support_step);
        self.cached_factor = None;
    }

    fn linearize(&mut self) -> Result<incremental::Linearization, String> {
        let (input, dof_num, asm, art, metric, cs) = (
            self.input,
            self.dof_num,
            self.asm,
            self.art,
            self.metric,
            self.cs,
        );
        let (f_base, start_internal) = (self.f_base, self.start_internal);
        let (n, nf, ns) = (dof_num.n_total, dof_num.n_free, self.ns);
        let mut f_int = vec![0.0; n];
        let sparse_tangent = ns >= SPARSE_THRESHOLD;
        let mut k_t: Vec<f64> = Vec::new();
        let mut trip_rows: Vec<usize> = Vec::new();
        let mut trip_cols: Vec<usize> = Vec::new();
        let mut trip_vals: Vec<f64> = Vec::new();

        let mut u_geom = self.u_full.clone();
        for it in &asm.inclined_transforms_2d {
            assembly::reverse_inclined_transform_2d(&mut u_geom, &it.dofs, &it.r);
        }

        if sparse_tangent {
            assemble_corotational_triplets_2d(
                input,
                &dof_num,
                &u_geom,
                &mut f_int,
                &mut trip_rows,
                &mut trip_cols,
                &mut trip_vals,
            );
            add_spring_contributions(
                input,
                &dof_num,
                &u_geom,
                &mut f_int,
                &art,
                &mut |gi, gj, v| {
                    if gi >= gj {
                        trip_rows.push(gi);
                        trip_cols.push(gj);
                        trip_vals.push(v);
                    }
                },
            );
            for it in &asm.inclined_transforms_2d {
                assembly::apply_inclined_transform_triplets_2d(
                    &mut trip_rows,
                    &mut trip_cols,
                    &mut trip_vals,
                    &it.dofs,
                    &it.r,
                );
                assembly::rotate_inclined_f_2d(&mut f_int, &it.dofs, &it.r);
            }
        } else {
            k_t = vec![0.0; n * n];
            assemble_corotational(input, &dof_num, &u_geom, &mut f_int, &mut k_t);
            add_spring_contributions(
                input,
                &dof_num,
                &u_geom,
                &mut f_int,
                &art,
                &mut |gi, gj, v| k_t[gi * n + gj] += v,
            );

            for it in &asm.inclined_transforms_2d {
                assembly::apply_inclined_transform_2d(&mut k_t, &mut f_int, n, &it.dofs, &it.r);
            }
        }

        let mut residual = vec![0.0; n];
        for i in 0..n {
            residual[i] = self.f_ext[i] - f_int[i];
        }

        let r_f: Vec<f64> = residual[..nf].to_vec();
        let rel_error = metric.continuation_residual(
            &residual,
            &self.f_ext,
            &self.active_supports,
            &f_base,
            &start_internal,
            cs.as_ref(),
        );

        self.unbalance.clone_from(&r_f);
        self.r_f = r_f;
        self.k_t = k_t;
        self.trip_rows = trip_rows;
        self.trip_cols = trip_cols;
        self.trip_vals = trip_vals;
        Ok(incremental::Linearization {
            measure: rel_error,
            forced: self.support_step.is_some(),
        })
    }

    fn correction(&mut self, modified_nr: bool) -> Result<Vec<f64>, String> {
        let (dof_num, cs) = (self.dof_num, self.cs);
        let (n, nf, ns) = (dof_num.n_total, dof_num.n_free, self.ns);
        let sparse_tangent = ns >= SPARSE_THRESHOLD;
        let r_f = std::mem::take(&mut self.r_f);
        let k_t = std::mem::take(&mut self.k_t);
        let (trip_rows, trip_cols, trip_vals) = (
            std::mem::take(&mut self.trip_rows),
            std::mem::take(&mut self.trip_cols),
            std::mem::take(&mut self.trip_vals),
        );
        let mut r_f = r_f;
        if let Some(ref du_r) = self.support_step {
            let mut known = vec![0.0; n];
            known[nf..].copy_from_slice(du_r);
            if let Some(ref cs) = *cs {
                cs.impose_motion(&mut known);
            }
            if sparse_tangent {
                for ((&i, &j), &v) in trip_rows.iter().zip(&trip_cols).zip(&trip_vals) {
                    if i < nf {
                        r_f[i] -= v * known[j];
                    }
                    if i != j && j < nf {
                        r_f[j] -= v * known[i];
                    }
                }
            } else {
                for i in 0..nf {
                    r_f[i] -= (0..n).map(|j| k_t[i * n + j] * known[j]).sum::<f64>();
                }
            }
        }

        let r_s = if let Some(ref cs) = *cs {
            cs.reduce_vector(&r_f)
        } else {
            r_f
        };

        let delta_u_indep = if modified_nr {
            if let Some(ref factor) = self.cached_factor {
                solve_with_cached_factor(factor, &r_s)
            } else if ns >= SPARSE_THRESHOLD {
                let k_s_csc =
                    tangent_free_sparse_triplets(&trip_rows, &trip_cols, &trip_vals, nf, cs);
                let sym = cached_symbolic(&mut self.sparse_sym_cache, &k_s_csc);
                let factor = numeric_cholesky(sym, &k_s_csc);
                if let Some(found) =
                    crate::known_issues::sparse_factor_conditioning(&k_s_csc, factor.as_ref())
                {
                    self.conditioning = Some(found);
                }
                match factor {
                    Some(num) => {
                        let result = sparse_cholesky_solve(&num, &r_s);
                        self.cached_factor = Some(CachedTangentFactor::Sparse(num));
                        result
                    }
                    None => solve_tangent_sparse_diagnosed(
                        &k_s_csc,
                        &r_s,
                        &mut self.sparse_sym_cache,
                        &mut self.conditioning,
                    )?,
                }
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = *cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                let factor = try_cholesky_factor(&k_s, ns);
                if let Some(found) = crate::known_issues::dense_factor_conditioning(
                    &k_s,
                    ns,
                    factor.as_ref().map(|f| f.l.as_slice()),
                ) {
                    self.conditioning = Some(found);
                }
                match factor {
                    Some(factor) => {
                        let result = solve_with_cholesky_factor(&factor.l, &r_s, factor.n);
                        self.cached_factor = Some(CachedTangentFactor::Dense(factor));
                        result
                    }
                    None => solve_free_dofs(&k_s, &r_s, ns, &mut self.conditioning)?,
                }
            }
        } else if ns >= SPARSE_THRESHOLD {
            let k_s_csc = tangent_free_sparse_triplets(&trip_rows, &trip_cols, &trip_vals, nf, cs);
            solve_tangent_sparse_diagnosed(
                &k_s_csc,
                &r_s,
                &mut self.sparse_sym_cache,
                &mut self.conditioning,
            )?
        } else {
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
            let k_s = if let Some(ref cs) = *cs {
                cs.reduce_matrix(&k_ff)
            } else {
                k_ff
            };
            solve_free_dofs(&k_s, &r_s, ns, &mut self.conditioning)?
        };

        let delta_u_f = if let Some(ref cs) = *cs {
            cs.expand_solution(
                &delta_u_indep,
                self.support_step
                    .as_deref()
                    .map_or(MasterMotion::Homogeneous, MasterMotion::Prescribed),
            )
        } else {
            delta_u_indep
        };

        Ok(delta_u_f)
    }

    fn advance(&mut self, delta_u_f: &[f64]) {
        let nf = self.dof_num.n_free;
        for i in 0..nf {
            self.u_full[i] += delta_u_f[i];
        }
        if self.support_step.take().is_some() {
            self.u_full[nf..].copy_from_slice(&self.active_supports);
        }
    }

    fn state(&self) -> Vec<f64> {
        self.u_full[..self.dof_num.n_free].to_vec()
    }

    fn work(&self, step: &[f64]) -> f64 {
        -crate::solver::line_search::directional_derivative(
            &self.unbalance,
            step,
            self.dof_num.n_free,
        )
    }

    fn set_state(&mut self, state: &[f64]) {
        self.u_full[..self.dof_num.n_free].copy_from_slice(state);
    }

    fn commit(&mut self) -> Result<(), String> {
        self.u_converged.copy_from_slice(&self.u_full);
        Ok(())
    }

    fn rollback(&mut self) {
        self.u_full.copy_from_slice(&self.u_converged);
    }
}

pub fn solve_corotational_2d_stepped(
    input: &SolverInput,
    start: Option<&CorotationalStart2D>,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
    stepping: LoadStepping,
) -> Result<CorotationalResult, String> {
    corotational_2d(
        input,
        start,
        max_iter,
        tolerance,
        n_increments,
        method,
        stepping,
    )
}

pub fn solve_corotational_2d_by(
    input: &SolverInput,
    start: Option<&CorotationalStart2D>,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
) -> Result<CorotationalResult, String> {
    corotational_2d(
        input,
        start,
        max_iter,
        tolerance,
        n_increments,
        method,
        LoadStepping::Equal,
    )
}

fn corotational_2d(
    input: &SolverInput,
    start: Option<&CorotationalStart2D>,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
    stepping: LoadStepping,
) -> Result<CorotationalResult, String> {
    let plane = PlaneInputs::new(input, start);
    let input = plane.target.as_ref();
    let start = plane.start();
    let start = start.as_ref();

    if n_increments == 0 {
        return Err("Number of load increments must be at least 1".into());
    }
    if max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err("Convergence tolerance must be finite and positive".into());
    }
    incremental::validate(method)?;

    crate::solver::linear::validate_input_2d(input)?;
    crate::solver::feature_gates::refuse_2d(
        input,
        "Corotational analysis",
        &[crate::solver::feature_gates::Feature::ThermalLoads],
    )?;
    crate::element::connector::refuse_for_corotational_2d(input, "Corotational analysis")?;
    refuse_inclined_motion_2d(input, start.is_some())?;

    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let cs = FreeConstraintSystem::build_2d(&input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let asm = assembly::assemble_2d(input, &dof_num);
    let f_total = asm.f.clone();
    let art = assembly::artificial_stiffness_entries(&asm);

    let (u_full, f_base) = match start {
        Some(start) => start_state_2d(input, start, &dof_num)?,
        None => (vec![0.0; n], vec![0.0; n]),
    };
    let u_r_base: Vec<f64> = u_full[nf..].to_vec();
    let u_r_target = crate::solver::linear::prescribed_displacements_2d(input, &dof_num);
    let support_extent: Vec<_> = u_r_base
        .iter()
        .zip(&u_r_target)
        .map(|(a, b)| a.abs() + b.abs())
        .collect();
    let metric = crate::solver::convergence::EquilibriumMetric::for_2d_with_state(
        input,
        &dof_num,
        cs.as_ref(),
        Some(&support_extent),
        &[],
    )?;

    let start_internal = if start.is_some() {
        continuation_internal_2d(input, &dof_num, &u_full, &asm.inclined_transforms_2d, &art)
    } else {
        vec![0.0; n]
    };

    let mut problem = Corotational2D {
        input,
        dof_num: &dof_num,
        cs: &cs,
        asm: &asm,
        art: &art,
        metric: &metric,
        ns,
        f_total: &f_total,
        f_base: &f_base,
        u_r_base: &u_r_base,
        u_r_target: &u_r_target,
        start_internal: &start_internal,
        u_converged: u_full.clone(),
        u_full,
        sparse_sym_cache: None,
        conditioning: None,
        f_ext: Vec::new(),
        active_supports: Vec::new(),
        support_step: None,
        cached_factor: None,
        r_f: Vec::new(),
        unbalance: Vec::new(),
        k_t: Vec::new(),
        trip_rows: Vec::new(),
        trip_cols: Vec::new(),
        trip_vals: Vec::new(),
    };
    let outcome = incremental::solve_stepped(
        &mut problem,
        method,
        stepping,
        n_increments,
        tolerance,
        max_iter,
    )?;
    let Corotational2D {
        u_full,
        conditioning,
        ..
    } = problem;
    let (total_iterations, converged, converged_factor) =
        (outcome.iterations, outcome.converged, outcome.load_factor);

    let max_displacement = compute_max_displacement(&dof_num, &u_full);

    let scaled;
    let at_state = if converged_factor == 1.0 {
        input
    } else {
        scaled = match start {
            Some(start) => blended_loads_2d(start.input, input, converged_factor),
            None => scaled_loads_2d(input, converged_factor),
        };
        &scaled
    };
    let mut results = build_final_results(
        at_state,
        &dof_num,
        &u_full,
        &cs,
        &asm.inclined_transforms_2d,
    )?;
    crate::known_issues::attach(
        &mut results.structured_diagnostics,
        conditioning.into_iter().collect(),
    );
    crate::known_issues::attach(
        &mut results.structured_diagnostics,
        crate::known_issues::for_2d(input, crate::known_issues::Analysis::Corotational),
    );

    Ok(CorotationalResult {
        results,
        iterations: total_iterations,
        converged,
        load_increments: if stepping == LoadStepping::Adaptive {
            outcome.increments
        } else {
            n_increments
        },
        load_factor: converged_factor,
        max_displacement,
    })
}

#[cfg(test)]
mod shared_driver_equivalence {
    use super::*;
    use std::collections::HashMap;

    fn axial_spring(force: f64) -> SolverInput {
        serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0, "z": 0}},
            "elements": {}, "materials": {}, "sections": {},
            "supports": {
                "1": {"id": 1, "nodeId": 1, "type": "spring", "kx": 1, "ky": 1}
            },
            "loads": [{"type": "nodal", "data": {"nodeId": 1, "fx": force, "fz": 0, "my": 0}}]
        }))
        .unwrap()
    }

    #[test]
    fn issue_2484_warm_start_reaches_the_exact_target_force() {
        for (base, target) in [(2f64.powi(54), 1.0), (1.0, 1e-20), (1.0, -1e-20), (1.0, 0.25), (1.0, 0.0)] {
            let first = axial_spring(base);
            let target_input = axial_spring(target);
            let initial = solve_corotational_2d_by(&first, None, 20, 1e-8, 1, IterationMethod::Newton)
                .unwrap();
            assert!(initial.converged);
            assert_eq!(initial.results.displacements[0].ux, base);
            let start = CorotationalStart2D {
                input: &first,
                displacements: &initial.results.displacements,
            };
            for result in [
                solve_corotational_2d_by(
                    &target_input, Some(&start), 20, 1e-8, 1, IterationMethod::Newton,
                ),
                solve_corotational_2d_stepped(
                    &target_input, Some(&start), 20, 1e-8, 1,
                    IterationMethod::Newton, LoadStepping::Adaptive,
                ),
            ] {
                let result = result.unwrap();
                assert!(result.converged);
                assert_eq!(result.load_factor, 1.0);
                assert_eq!(result.results.displacements[0].ux, target);
            }
        }
    }

    #[test]
    fn issue_2484_warm_start_assigns_the_exact_prescribed_position() {
        let mut first = frame(1, 0.0, Some("pinned"));
        first.loads.clear();
        first.supports.get_mut("2").unwrap().dx = Some(1.0);
        let initial =
            solve_corotational_2d_by(&first, None, 20, 1e-8, 1, IterationMethod::Newton).unwrap();
        assert!(initial.converged);
        assert_eq!(initial.results.displacements[1].ux, 1.0);
        let start = CorotationalStart2D {
            input: &first,
            displacements: &initial.results.displacements,
        };
        for target in [1e-20, 0.0, -1e-20, 0.25] {
            let mut input = first.clone();
            input.supports.get_mut("2").unwrap().dx = Some(target);
            for result in [
                solve_corotational_2d_by(
                    &input, Some(&start), 20, 1e-8, 1, IterationMethod::Newton,
                ),
                solve_corotational_2d_stepped(
                    &input, Some(&start), 20, 1e-8, 1,
                    IterationMethod::Newton, LoadStepping::Adaptive,
                ),
            ] {
                let result = result.unwrap();
                assert!(result.converged);
                assert_eq!(result.load_factor, 1.0);
                assert_eq!(result.results.displacements[1].ux, target);
            }
        }
    }

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
        supports.insert("1".into(), support(1, 1, "fixed"));
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
                fx: 2.0,
                fz: -30.0,
                my: 4.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    fn same(
        input: &SolverInput,
        start: Option<&CorotationalStart2D>,
        max_iter: usize,
        n_increments: usize,
        modified: bool,
    ) -> Option<CorotationalResult> {
        let before =
            solve_corotational_2d_from(input, start, max_iter, 1e-8, n_increments, modified);
        let method = if modified {
            IterationMethod::ModifiedNewton
        } else {
            IterationMethod::Newton
        };
        let now = solve_corotational_2d_by(input, start, max_iter, 1e-8, n_increments, method);
        match (before, now) {
            (Ok(before), Ok(now)) => {
                assert_eq!(
                    serde_json::to_string(&before).unwrap(),
                    serde_json::to_string(&now).unwrap()
                );
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
    fn the_shared_driver_gives_the_results_the_loop_gave_bit_for_bit() {
        let (mut converged, mut unconverged, mut sparse) = (0, 0, 0);
        for n in [1, 4, 12, 30] {
            for (rise, far_support) in [
                (0.0, None),
                (0.4, None),
                (0.4, Some("pinned")),
                (0.0, Some("rollerX")),
            ] {
                let input = frame(n, rise, far_support);
                let dofs = DofNumbering::build_2d(&input);
                if dofs.n_free >= SPARSE_THRESHOLD {
                    sparse += 1;
                }
                for modified in [false, true] {
                    for (max_iter, n_increments) in [(50, 1), (50, 5), (3, 2), (1, 4), (200, 10)] {
                        match same(&input, None, max_iter, n_increments, modified) {
                            Some(result) if result.converged => converged += 1,
                            Some(_) => unconverged += 1,
                            None => {}
                        }
                    }
                }
            }
        }
        assert!(
            converged >= 40 && unconverged >= 20 && sparse >= 3,
            "{converged} converged, {unconverged} not, {sparse} sparse"
        );
    }

    #[test]
    fn a_moving_support_and_a_start_state_go_through_the_shared_driver_unchanged() {
        for n in [4, 30] {
            let mut settled = frame(n, 0.2, Some("pinned"));
            settled.supports.get_mut("2").unwrap().dz = Some(-0.05);
            settled.supports.get_mut("2").unwrap().dx = Some(0.01);
            for modified in [false, true] {
                let result = same(&settled, None, 60, 4, modified).expect("a result");
                assert!(result.converged || modified);
                same(&settled, None, 2, 3, modified);
            }

            let first = frame(n, 0.2, Some("pinned"));
            let reached = solve_corotational_2d(&first, 60, 1e-8, 4, false).unwrap();
            assert!(reached.converged);
            let start = CorotationalStart2D {
                input: &first,
                displacements: &reached.results.displacements,
            };
            let mut next = frame(n, 0.2, Some("pinned"));
            next.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1,
                fx: -3.0,
                fz: -45.0,
                my: 0.0,
            })];
            for modified in [false, true] {
                let result = same(&next, Some(&start), 60, 3, modified).expect("a result");
                assert!(result.converged || modified);
                same(&next, Some(&start), 2, 3, modified);
            }
        }
    }

    fn apart_of(a: &[Displacement], b: &[Displacement]) -> f64 {
        assert!(
            !b.is_empty() && a.len() == b.len(),
            "{} displacements against {}",
            a.len(),
            b.len()
        );
        let (mut gap, mut largest) = (0.0f64, 0.0f64);
        for (x, y) in a.iter().zip(b) {
            assert_eq!(x.node_id, y.node_id);
            assert!(
                [x.ux, x.uz, x.ry, y.ux, y.uz, y.ry]
                    .iter()
                    .all(|v| v.is_finite()),
                "node {}: {x:?} against {y:?}",
                x.node_id
            );
            gap = gap.max((x.ux - y.ux).abs()).max((x.uz - y.uz).abs());
            largest = largest.max(y.ux.abs()).max(y.uz.abs());
        }
        assert!(largest > 0.0, "the reference did not move");
        gap / largest
    }

    fn apart(a: &CorotationalResult, b: &CorotationalResult) -> f64 {
        apart_of(&a.results.displacements, &b.results.displacements)
    }

    fn moved(node_id: usize, ux: f64, uz: f64) -> Displacement {
        Displacement {
            node_id,
            ux,
            uz,
            ry: 0.0,
        }
    }

    #[test]
    fn the_comparison_measures_the_largest_difference_of_complete_finite_results() {
        let reference = [moved(1, 0.0, 0.0), moved(2, 0.5, -2.0)];
        assert_eq!(apart_of(&reference, &reference), 0.0);
        assert_eq!(
            apart_of(&[moved(1, 0.0, 0.1), moved(2, 0.5, -2.0)], &reference),
            0.05
        );
        assert_eq!(
            apart_of(&[moved(1, 0.0, 0.0), moved(2, 0.9, -2.0)], &reference),
            0.2
        );
    }

    #[test]
    fn the_comparison_refuses_what_it_cannot_compare() {
        let reference = vec![moved(1, 0.0, 0.0), moved(2, 0.5, -2.0)];
        let refused = |a: Vec<Displacement>, b: Vec<Displacement>| {
            std::panic::catch_unwind(move || apart_of(&a, &b)).is_err()
        };
        assert!(refused(vec![], reference.clone()));
        assert!(refused(reference[..1].to_vec(), reference.clone()));
        assert!(refused(reference.clone(), reference[..1].to_vec()));
        assert!(refused(vec![], vec![]));
        assert!(refused(
            vec![moved(1, 0.0, 0.0), moved(3, 0.5, -2.0)],
            reference.clone()
        ));
        assert!(refused(
            vec![moved(2, 0.5, -2.0), moved(1, 0.0, 0.0)],
            reference.clone()
        ));
        for bad in [f64::NAN, f64::INFINITY] {
            assert!(refused(
                vec![moved(1, 0.0, 0.0), moved(2, bad, -2.0)],
                reference.clone()
            ));
            assert!(refused(
                vec![moved(1, 0.0, bad), moved(2, 0.5, -2.0)],
                reference.clone()
            ));
            assert!(refused(
                reference.clone(),
                vec![moved(1, 0.0, 0.0), moved(2, 0.5, bad)]
            ));
            let mut turned = reference.clone();
            turned[1].ry = bad;
            assert!(refused(turned, reference.clone()));
        }
        assert!(refused(
            vec![moved(1, 0.0, 0.0), moved(2, 0.0, 0.0)],
            vec![moved(1, 0.0, 0.0), moved(2, 0.0, 0.0)]
        ));
    }

    #[test]
    fn the_line_search_reaches_the_solution_of_many_small_increments_where_newton_does_not() {
        let (mut newton_elsewhere, mut newton_lost) = (0, 0);
        for n in [4, 12, 30] {
            for (rise, far_support) in [(0.0, None), (0.4, None), (0.4, Some("pinned"))] {
                let input = frame(n, rise, far_support);
                let reference = solve_corotational_2d_by(
                    &input,
                    None,
                    200,
                    1e-8,
                    40,
                    IterationMethod::NewtonLineSearch,
                )
                .unwrap();
                assert!(reference.converged);
                let stepped =
                    solve_corotational_2d_by(&input, None, 200, 1e-8, 40, IterationMethod::Newton)
                        .unwrap();
                if stepped.converged {
                    assert!(
                        apart(&reference, &stepped) <= 1e-8,
                        "n {n}: {}",
                        apart(&reference, &stepped)
                    );
                }
                for n_increments in [1, 4] {
                    let searched = solve_corotational_2d_by(
                        &input,
                        None,
                        200,
                        1e-8,
                        n_increments,
                        IterationMethod::NewtonLineSearch,
                    )
                    .unwrap();
                    assert!(
                        searched.converged && searched.load_factor == 1.0,
                        "n {n}, rise {rise}, {n_increments} increments"
                    );
                    assert!(
                        apart(&searched, &reference) <= 1e-8,
                        "n {n}, rise {rise}, {n_increments} increments: {}",
                        apart(&searched, &reference)
                    );
                    assert!(searched.iterations <= 60, "{}", searched.iterations);
                    let plain = solve_corotational_2d_by(
                        &input,
                        None,
                        200,
                        1e-8,
                        n_increments,
                        IterationMethod::Newton,
                    )
                    .unwrap();
                    if !plain.converged {
                        newton_lost += 1;
                    } else if apart(&plain, &reference) > 1e-3 {
                        newton_elsewhere += 1;
                    }
                }
            }
        }
        assert!(
            newton_lost + newton_elsewhere >= 4,
            "{newton_lost} unconverged, {newton_elsewhere} on another solution"
        );
    }

    #[test]
    fn adaptive_steps_carry_newton_to_the_solution_of_many_small_increments() {
        for n in [4, 12, 30] {
            for (rise, far_support) in [(0.0, None), (0.4, None), (0.4, Some("pinned"))] {
                let input = frame(n, rise, far_support);
                let reference = solve_corotational_2d_by(
                    &input,
                    None,
                    200,
                    1e-8,
                    40,
                    IterationMethod::NewtonLineSearch,
                )
                .unwrap();
                assert!(reference.converged);
                for method in [IterationMethod::Newton, IterationMethod::NewtonLineSearch] {
                    let stepped = solve_corotational_2d_stepped(
                        &input,
                        None,
                        20,
                        1e-8,
                        4,
                        method,
                        LoadStepping::Adaptive,
                    )
                    .unwrap();
                    assert!(
                        stepped.converged && stepped.load_factor == 1.0,
                        "n {n}, rise {rise}, {method:?}"
                    );
                    assert!(
                        stepped.load_increments >= 1 && stepped.load_increments <= 400,
                        "{}",
                        stepped.load_increments
                    );
                    assert!(
                        apart(&stepped, &reference) <= 1e-7,
                        "n {n}, rise {rise}, {method:?}: {}",
                        apart(&stepped, &reference)
                    );
                }
            }
        }
    }

    #[test]
    fn equal_steps_through_the_stepped_entry_point_are_the_plain_solve() {
        let input = frame(12, 0.4, Some("pinned"));
        let plain = solve_corotational_2d(&input, 50, 1e-8, 4, false).unwrap();
        let stepped = solve_corotational_2d_stepped(
            &input,
            None,
            50,
            1e-8,
            4,
            IterationMethod::Newton,
            LoadStepping::Equal,
        )
        .unwrap();
        assert_eq!(
            serde_json::to_string(&plain).unwrap(),
            serde_json::to_string(&stepped).unwrap()
        );
        let short = solve_corotational_2d_stepped(
            &input,
            None,
            1,
            1e-8,
            4,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
        )
        .unwrap();
        assert!(!short.converged);
        assert_eq!((short.load_factor, short.load_increments), (0.0, 0));
        assert!(short
            .results
            .displacements
            .iter()
            .all(|d| d.ux == 0.0 && d.uz == 0.0));
    }

    #[test]
    fn anderson_converges_propped_arches_that_modified_newton_does_not() {
        for n in [4, 12, 30] {
            let input = frame(n, 0.4, Some("pinned"));
            let reference = solve_corotational_2d_by(
                &input,
                None,
                200,
                1e-8,
                40,
                IterationMethod::NewtonLineSearch,
            )
            .unwrap();
            let modified = solve_corotational_2d_by(
                &input,
                None,
                200,
                1e-8,
                4,
                IterationMethod::ModifiedNewton,
            )
            .unwrap();
            assert!(!modified.converged);
            let accelerated = solve_corotational_2d_by(
                &input,
                None,
                200,
                1e-8,
                4,
                IterationMethod::Anderson { depth: 6 },
            )
            .unwrap();
            assert!(
                accelerated.converged && accelerated.load_factor == 1.0,
                "n {n}"
            );
            assert!(accelerated.iterations < 4 * 200);
            assert!(
                apart(&accelerated, &reference) <= 1e-8,
                "n {n}: {}",
                apart(&accelerated, &reference)
            );
        }
    }

    #[test]
    fn an_iteration_that_does_not_converge_reports_the_last_increment_that_did() {
        let input = frame(12, 0.0, None);
        for method in [
            IterationMethod::Anderson { depth: 3 },
            IterationMethod::NewtonLineSearch,
            IterationMethod::ModifiedNewton,
        ] {
            let result = solve_corotational_2d_by(&input, None, 3, 1e-8, 4, method).unwrap();
            assert!(!result.converged, "{method:?}");
            assert_eq!(result.load_factor, 0.0, "{method:?}");
            assert!(
                result
                    .results
                    .displacements
                    .iter()
                    .all(|d| d.ux == 0.0 && d.uz == 0.0),
                "{method:?}"
            );
        }
        let refused = solve_corotational_2d_by(
            &input,
            None,
            50,
            1e-8,
            4,
            IterationMethod::Anderson { depth: 0 },
        );
        assert_eq!(
            refused.err().as_deref(),
            Some("Anderson acceleration needs a depth from 1 to 50")
        );
        let precedence = solve_corotational_2d_by(
            &input,
            None,
            0,
            1e-8,
            4,
            IterationMethod::Anderson { depth: 0 },
        );
        assert_eq!(
            precedence.err().as_deref(),
            Some("Max iterations must be at least 1")
        );
    }

    #[test]
    fn refused_inputs_are_refused_with_the_same_words() {
        let input = frame(4, 0.0, None);
        assert!(same(&input, None, 0, 4, false).is_none());
        assert!(same(&input, None, 20, 0, false).is_none());
        let mut held = frame(2, 0.0, Some("fixed"));
        held.supports.insert(
            "3".into(),
            SolverSupport {
                id: 3,
                node_id: 2,
                support_type: "fixed".into(),
                kx: None,
                ky: None,
                kz: None,
                dx: None,
                dz: None,
                dry: None,
                angle: None,
            },
        );
        assert!(same(&held, None, 20, 2, false).is_none());
    }

    #[test]
    fn line_search_budget_in_2d_equal_steps() {
        let input = frame(1, 0.0, None);
        let mut unloaded = input.clone();
        unloaded.loads.clear();
        let initial = solve_corotational_2d(&unloaded, 200, 1e-8, 1, false).unwrap();
        assert!(initial.converged);
        let start = CorotationalStart2D {
            input: &unloaded,
            displacements: &initial.results.displacements,
        };
        let solve = |max_iter| {
            solve_corotational_2d_by(
                &input,
                Some(&start),
                max_iter,
                1e-8,
                2,
                IterationMethod::NewtonLineSearch,
            )
            .unwrap()
        };
        let expected = solve(200);
        let actual = solve(usize::MAX);
        assert!(expected.converged && actual.converged);
        assert_eq!(actual.load_factor, 1.0);
        assert_eq!(
            serde_json::to_string(&actual).unwrap(),
            serde_json::to_string(&expected).unwrap()
        );
    }

    #[test]
    fn line_search_budget_in_2d_adaptive_steps() {
        let input = frame(1, 0.0, None);
        let solve = |max_iter, stepping| {
            solve_corotational_2d_stepped(
                &input,
                None,
                max_iter,
                1e-8,
                2,
                IterationMethod::NewtonLineSearch,
                stepping,
            )
            .unwrap()
        };
        for stepping in [LoadStepping::Adaptive, LoadStepping::Equal] {
            let expected = solve(200, stepping);
            assert!(expected.converged && expected.load_increments >= 2);
            let actual = solve(usize::MAX, stepping);
            assert!(actual.converged);
            assert_eq!(actual.load_factor, 1.0);
            assert_eq!(
                serde_json::to_string(&actual).unwrap(),
                serde_json::to_string(&expected).unwrap()
            );
        }
    }
}

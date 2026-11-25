use super::*;
use crate::solver::experimental_nonlinear::{NonlinearWork, KrylovWork};
use crate::solver::experimental_nonlinear::incremental::{self, IterationMethod, LoadStepping};

struct Corotational3D<'a> {
    input: &'a SolverInput3D,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    asm: &'a assembly::AssemblyResult,
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    ns: usize,
    left_hand: bool,
    f_total: &'a [f64],
    u_full: Vec<f64>,
    u_converged: Vec<f64>,
    naturals: Vec<MemberDeformation3D>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    conditioning: Option<StructuredDiagnostic>,
    f_ext: Vec<f64>,
    cached_factor: Option<CachedTangentFactor>,
    work: NonlinearWork,
    r_f: Vec<f64>,
    unbalance: Vec<f64>,
    k_t: Vec<f64>,
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
}

impl incremental::IncrementalProblem for Corotational3D<'_> {
    fn begin_increment(&mut self, load_factor: f64) {
        self.f_ext = self.f_total.iter().map(|&f| load_factor * f).collect();
        self.cached_factor = None;
    }

    fn linearize(&mut self) -> Result<incremental::Linearization, String> {
        self.work.linearizations = self.work.linearizations.saturating_add(1);
        let (input, dof_num, asm, metric, cs, left_hand) = (
            self.input,
            self.dof_num,
            self.asm,
            self.metric,
            self.cs,
            self.left_hand,
        );
        let (n, nf, ns) = (dof_num.n_total, dof_num.n_free, self.ns);
        let mut f_int = vec![0.0; n];
        let sparse_tangent = ns >= SPARSE_THRESHOLD;
        let mut k_t: Vec<f64> = Vec::new();
        let mut trip_rows: Vec<usize> = Vec::new();
        let mut trip_cols: Vec<usize> = Vec::new();
        let mut trip_vals: Vec<f64> = Vec::new();

        let mut u_geom = self.u_full.clone();
        for it in &asm.inclined_transforms {
            assembly::reverse_inclined_transform(&mut u_geom, &it.dofs, &it.r);
        }

        if sparse_tangent {
            assemble_corotational_triplets_3d(
                input,
                &dof_num,
                &u_geom,
                &mut f_int,
                &mut trip_rows,
                &mut trip_cols,
                &mut trip_vals,
                left_hand,
            );
            add_spring_contributions_3d(input, &dof_num, &u_geom, &mut f_int, &mut |gi, gj, v| {
                if gi >= gj {
                    trip_rows.push(gi);
                    trip_cols.push(gj);
                    trip_vals.push(v);
                }
            });
            for it in &asm.inclined_transforms {
                assembly::apply_inclined_transform_triplets(
                    &mut trip_rows,
                    &mut trip_cols,
                    &mut trip_vals,
                    &mut f_int,
                    &it.dofs,
                    &it.r,
                );
            }
        } else {
            k_t = vec![0.0; n * n];
            assemble_corotational_3d(input, &dof_num, &u_geom, &mut f_int, &mut k_t, left_hand);
            add_spring_contributions_3d(input, &dof_num, &u_geom, &mut f_int, &mut |gi, gj, v| {
                k_t[gi * n + gj] += v
            });

            for it in &asm.inclined_transforms {
                assembly::apply_inclined_transform(&mut k_t, &mut f_int, n, &it.dofs, &it.r);
            }
        }

        let mut residual = vec![0.0; n];
        for i in 0..n {
            residual[i] = self.f_ext[i] - f_int[i];
        }

        let r_f: Vec<f64> = residual[..nf].to_vec();
        let rel_error = metric.relative_residual(&residual, &self.f_ext, None, cs.as_ref());

        self.unbalance.clone_from(&r_f);
        self.r_f = r_f;
        self.k_t = k_t;
        self.trip_rows = trip_rows;
        self.trip_cols = trip_cols;
        self.trip_vals = trip_vals;
        Ok(incremental::Linearization {
            measure: rel_error,
            forced: false,
        })
    }

    fn correction(&mut self, modified_nr: bool) -> Result<Vec<f64>, String> {
        let (dof_num, cs) = (self.dof_num, self.cs);
        let (n, nf, ns) = (dof_num.n_total, dof_num.n_free, self.ns);
        let r_f = std::mem::take(&mut self.r_f);
        let k_t = std::mem::take(&mut self.k_t);
        let (trip_rows, trip_cols, trip_vals) = (
            std::mem::take(&mut self.trip_rows),
            std::mem::take(&mut self.trip_cols),
            std::mem::take(&mut self.trip_vals),
        );
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
                self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
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
                    None => {
                        self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
                        solve_tangent_sparse_diagnosed(
                            &k_s_csc,
                            &r_s,
                            &mut self.sparse_sym_cache,
                            &mut self.conditioning,
                        )?
                    },
                }
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = *cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
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
                    None => {
                        self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
                        solve_free_dofs(&k_s, &r_s, ns, &mut self.conditioning)?
                    },
                }
            }
        } else if ns >= SPARSE_THRESHOLD {
            self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
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
            self.work.factorization_requests = self.work.factorization_requests.saturating_add(1);
            solve_free_dofs(&k_s, &r_s, ns, &mut self.conditioning)?
        };

        let delta_u = if let Some(ref cs) = *cs {
            cs.expand_solution(&delta_u_indep, MasterMotion::Homogeneous)
        } else {
            delta_u_indep
        };

        Ok(delta_u)
    }

    fn advance(&mut self, delta_u: &[f64]) {
        for i in 0..self.dof_num.n_free {
            self.u_full[i] += delta_u[i];
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

    fn residual(&self) -> Vec<f64> {
        super::experimental_nonlinear_2d::reduced(self.cs, &self.unbalance)
    }

    fn tangent_times(&self, v: &[f64]) -> Vec<f64> {
        super::experimental_nonlinear_2d::tangent_product(
            self.cs,
            (self.dof_num.n_total, self.dof_num.n_free),
            &self.k_t,
            (&self.trip_rows, &self.trip_cols, &self.trip_vals),
            v,
        )
    }

    fn lagged_solve(&self, rhs: &[f64]) -> Option<Vec<f64>> {
        super::experimental_nonlinear_2d::kept_solve(&self.cached_factor, rhs)
    }

    fn residual_into(&self, out: &mut Vec<f64>) {
        super::experimental_nonlinear_2d::reduced_into(self.cs, &self.unbalance, out);
    }

    fn tangent_times_into(&self, v: &[f64], out: &mut Vec<f64>, scratch: &mut crate::solver::experimental_nonlinear::newton_krylov::TangentWorkspace) {
        super::experimental_nonlinear_2d::tangent_product_into(self.cs, (self.dof_num.n_total, self.dof_num.n_free), &self.k_t,
            (&self.trip_rows, &self.trip_cols, &self.trip_vals), v, out, scratch);
    }

    fn lagged_solve_into(&self, rhs: &[f64], out: &mut Vec<f64>, scratch: &mut Vec<f64>) -> bool {
        super::experimental_nonlinear_2d::kept_solve_into(&self.cached_factor, rhs, out, scratch)
    }

    fn record_krylov(&mut self, work: &KrylovWork) { self.work.krylov.add(work); }

    fn expand(&self, reduced: &[f64]) -> Vec<f64> {
        super::experimental_nonlinear_2d::expanded(self.cs, reduced)
    }

    fn commit(&mut self) -> Result<(), String> {
        self.naturals = on_one_branch_3d(
            self.input,
            self.dof_num,
            (&self.u_converged, &self.naturals),
            &self.u_full,
            self.left_hand,
        )?;
        self.u_converged.copy_from_slice(&self.u_full);
        Ok(())
    }

    fn rollback(&mut self) {
        self.u_full.copy_from_slice(&self.u_converged);
    }
}

pub fn solve_corotational_3d_stepped(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
    stepping: LoadStepping,
) -> Result<CorotationalResult3D, String> {
    corotational_3d(input, max_iter, tolerance, n_increments, method, stepping, &mut NonlinearWork::default())
}

pub fn solve_corotational_3d_by(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
) -> Result<CorotationalResult3D, String> {
    corotational_3d(
        input,
        max_iter,
        tolerance,
        n_increments,
        method,
        LoadStepping::Equal,
        &mut NonlinearWork::default(),
    )
}

/// The same solve with observational work counts, including rolled-back attempts.
pub fn solve_corotational_3d_profiled(
    input: &SolverInput3D, max_iter: usize, tolerance: f64, n_increments: usize,
    method: IterationMethod, stepping: LoadStepping, work: &mut NonlinearWork,
) -> Result<CorotationalResult3D, String> {
    *work = NonlinearWork::default();
    corotational_3d(input, max_iter, tolerance, n_increments, method, stepping, work)
}

fn corotational_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    method: IterationMethod,
    stepping: LoadStepping,
    work: &mut NonlinearWork,
) -> Result<CorotationalResult3D, String> {
    let canonical_input = crate::solver::member_loads::space_input(input);
    let input = canonical_input.as_ref();

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

    crate::solver::linear::validate_input_3d(input)?;
    crate::solver::linear::refuse_initial_free_rotation_loads_3d(input)?;
    let pre_solve_diags = crate::solver::pre_solve_gates::run_pre_solve_gates_3d(input);

    let has_shells = !input.plates.is_empty()
        || !input.quads.is_empty()
        || !input.quad9s.is_empty()
        || !input.solid_shells.is_empty()
        || !input.curved_shells.is_empty();
    if has_shells {
        return Err("Corotational 3D solver does not support shell elements. \
            Use the linear solver for models with plates, quads, or shells."
            .into());
    }
    let frame_sections: std::collections::HashSet<usize> = crate::ordered::values(&input.elements)
        .filter(|e| e.elem_type == "frame")
        .map(|e| e.section_id)
        .collect();
    if let Some(sec) = crate::ordered::values(&input.sections)
        .filter(|s| frame_sections.contains(&s.id))
        .find(|s| {
            s.shear_center_y.is_some_and(|v| v != 0.0) || s.shear_center_z.is_some_and(|v| v != 0.0)
        })
    {
        return Err(format!(
            "Corotational 3D solver does not model a shear-centre offset (section {}): \
             flexural-torsional coupling is not included. Use linear buckling or P-Delta.",
            sec.id
        ));
    }

    crate::solver::feature_gates::refuse_3d(
        input,
        "Corotational analysis",
        &[
            crate::solver::feature_gates::Feature::PrescribedDisplacements,
            crate::solver::feature_gates::Feature::ThermalLoads,
            crate::solver::feature_gates::Feature::Warping,
        ],
    )?;
    crate::element::connector::refuse_for_corotational_3d(input, "Corotational analysis")?;
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let left_hand = input.left_hand.unwrap_or(false);

    let cs = FreeConstraintSystem::build_3d(&input, &dof_num)?;
    let metric =
        crate::solver::convergence::EquilibriumMetric::for_3d(input, &dof_num, cs.as_ref())?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let asm = assembly::assemble_3d(input, &dof_num);
    let f_total = asm.f.clone();

    let u_full = vec![0.0; n];
    let mut problem = Corotational3D {
        input,
        dof_num: &dof_num,
        cs: &cs,
        asm: &asm,
        metric: &metric,
        ns,
        left_hand,
        f_total: &f_total,
        naturals: member_deformations_3d(input, &dof_num, &u_full, left_hand),
        u_converged: u_full.clone(),
        u_full,
        sparse_sym_cache: None,
        conditioning: None,
        f_ext: Vec::new(),
        cached_factor: None,
        work: NonlinearWork::default(),
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
    );
    *work = problem.work;
    let outcome = outcome?;
    let Corotational3D {
        u_full,
        u_converged,
        naturals,
        conditioning,
        ..
    } = problem;
    let (total_iterations, converged, converged_factor) =
        (outcome.iterations, outcome.converged, outcome.load_factor);

    let deformations = on_one_branch_3d(
        input,
        &dof_num,
        (&u_converged, &naturals),
        &u_full,
        left_hand,
    )?;
    let max_displacement = compute_max_displacement_3d(&dof_num, &u_full);
    let scaled;
    let at_state = if converged_factor < 1.0 {
        scaled = scaled_loads_3d(input, converged_factor);
        &scaled
    } else {
        input
    };
    let mut results = build_final_results_3d(
        at_state,
        &dof_num,
        &u_full,
        left_hand,
        &cs,
        pre_solve_diags,
        &asm.inclined_transforms,
    )?;
    crate::known_issues::attach(
        &mut results.structured_diagnostics,
        conditioning.into_iter().collect(),
    );
    crate::known_issues::attach(
        &mut results.structured_diagnostics,
        crate::known_issues::for_3d(input, crate::known_issues::Analysis::Corotational),
    );
    if deformations
        .iter()
        .any(|d| d.natural > crate::known_issues::NL3_NATURAL_ROTATION)
    {
        crate::known_issues::attach(
            &mut results.structured_diagnostics,
            vec![crate::known_issues::corotational_natural_rotation()],
        );
    }
    crate::known_issues::refuse(&results.structured_diagnostics)?;

    Ok(CorotationalResult3D {
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
mod shared_driver_equivalence_3d {
    use super::*;

    fn frame(n: usize, rise: f64, propped: bool, scale: f64) -> SolverInput3D {
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        for i in 0..=n {
            let t = i as f64 / n as f64;
            nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": 6.0 * t, "y": 0.5 * t * t, "z": rise * 4.0 * t * (1.0 - t)}));
        }
        for i in 0..n {
            elements.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "type": "frame", "nodeI": i + 1, "nodeJ": i + 2, "materialId": 1, "sectionId": 1}));
        }
        let held = |node: usize, turning: bool| serde_json::json!({"nodeId": node, "rx": true, "ry": true, "rz": true, "rrx": turning, "rry": turning, "rrz": turning});
        let mut supports = serde_json::Map::new();
        supports.insert("1".into(), held(1, true));
        if propped {
            supports.insert("2".into(), held(n + 1, false));
        }
        let loaded = if propped { n / 2 + 1 } else { n + 1 };
        serde_json::from_value(serde_json::json!({
            "nodes": nodes, "elements": elements, "supports": supports,
            "materials": {"1": {"id": 1, "e": 200.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 2e-4, "j": 1.5e-4}},
            "loads": [{"type": "nodal", "data": {"nodeId": loaded, "fx": 1.0 * scale, "fy": 6.0 * scale, "fz": -10.0 * scale, "mx": 0.5 * scale, "my": 1.0 * scale, "mz": 0.0}}]
        })).unwrap()
    }

    fn same(
        input: &SolverInput3D,
        max_iter: usize,
        n_increments: usize,
        modified: bool,
    ) -> Option<CorotationalResult3D> {
        let before = solve_corotational_3d(input, max_iter, 1e-8, n_increments, modified);
        let method = if modified {
            IterationMethod::ModifiedNewton
        } else {
            IterationMethod::Newton
        };
        let now = solve_corotational_3d_by(input, max_iter, 1e-8, n_increments, method);
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
    fn profiling_counts_factorizations_without_changing_results_or_resetting_rolled_back_work() {
        let input = building(2, 3, 20.0);
        let mut work = NonlinearWork::default();
        for max_iter in [1, 80] {
            let expected = solve_corotational_3d_stepped(&input, max_iter, 1e-8, 4, IterationMethod::NewtonKrylov, LoadStepping::Equal).unwrap();
            let got = solve_corotational_3d_profiled(&input, max_iter, 1e-8, 4, IterationMethod::NewtonKrylov, LoadStepping::Equal, &mut work).unwrap();
            assert_eq!(serde_json::to_value(&got).unwrap().to_string(), serde_json::to_value(&expected).unwrap().to_string());
            assert_eq!(work.linearizations, got.iterations as u64);
            assert_eq!(work.factorization_requests, if max_iter == 1 { 1 } else { 4 });
            assert_eq!(work.krylov.no_factor, work.factorization_requests);
            if max_iter == 1 {
                assert!(!got.converged);
                assert_eq!(got.load_factor, 0.0);
                assert_eq!(work.krylov.attempts, 1);
            } else { assert!(got.converged && work.krylov.accepted_steps > 0); }
        }
        assert!(solve_corotational_3d_profiled(&input, 0, 1e-8, 4, IterationMethod::NewtonKrylov, LoadStepping::Equal, &mut work).is_err());
        assert_eq!(work, NonlinearWork::default(), "a refused input cannot expose a previous solve's counters");
    }

    #[test]
    fn the_shared_driver_gives_the_3d_results_the_loop_gave_bit_for_bit() {
        let (mut converged, mut other, mut sparse) = (0, 0, 0);
        for n in [1, 4, 12, 20] {
            for (rise, propped) in [(0.0, false), (0.3, false), (0.3, true)] {
                for scale in [0.05, 1.0] {
                    let input = frame(n, rise, propped, scale);
                    if DofNumbering::build_3d(&input).n_free >= SPARSE_THRESHOLD {
                        sparse += 1;
                    }
                    for modified in [false, true] {
                        for (max_iter, n_increments) in
                            [(60, 1), (60, 5), (3, 2), (1, 4), (300, 10)]
                        {
                            match same(&input, max_iter, n_increments, modified) {
                                Some(result) if result.converged => converged += 1,
                                _ => other += 1,
                            }
                        }
                    }
                }
            }
        }
        assert!(
            converged >= 40 && other >= 40 && sparse >= 6,
            "{converged} converged, {other} not, {sparse} sparse"
        );
    }

    #[test]
    fn refused_3d_inputs_are_refused_with_the_same_words() {
        let input = frame(4, 0.0, false, 0.05);
        assert!(same(&input, 0, 4, false).is_none());
        assert!(same(&input, 20, 0, false).is_none());
        let mut offset = frame(4, 0.0, false, 0.05);
        offset.sections.get_mut("1").unwrap().shear_center_y = Some(0.01);
        assert!(same(&offset, 20, 2, false).is_none());
    }

    fn apart(a: &CorotationalResult3D, b: &CorotationalResult3D) -> f64 {
        let (a, b) = (&a.results.displacements, &b.results.displacements);
        assert!(
            !b.is_empty() && a.len() == b.len(),
            "{} displacements against {}",
            a.len(),
            b.len()
        );
        let (mut gap, mut largest) = (0.0f64, 0.0f64);
        for (x, y) in a.iter().zip(b) {
            assert_eq!(x.node_id, y.node_id);
            let components = [
                x.ux, x.uy, x.uz, x.rx, x.ry, x.rz, y.ux, y.uy, y.uz, y.rx, y.ry, y.rz,
            ];
            assert!(
                components.iter().all(|v| v.is_finite()),
                "node {}",
                x.node_id
            );
            gap = gap
                .max((x.ux - y.ux).abs())
                .max((x.uy - y.uy).abs())
                .max((x.uz - y.uz).abs());
            largest = largest.max(y.ux.abs()).max(y.uy.abs()).max(y.uz.abs());
        }
        assert!(largest > 0.0, "the reference did not move");
        gap / largest
    }

    #[test]
    fn the_3d_comparison_refuses_what_it_cannot_compare() {
        let input = frame(4, 0.0, false, 0.05);
        let solved = solve_corotational_3d(&input, 100, 1e-9, 2, false).unwrap();
        assert_eq!(apart(&solved, &solved), 0.0);
        let refused = |change: &dyn Fn(&mut CorotationalResult3D)| {
            let mut other = solve_corotational_3d(&input, 100, 1e-9, 2, false).unwrap();
            change(&mut other);
            let reference = solve_corotational_3d(&input, 100, 1e-9, 2, false).unwrap();
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| apart(&other, &reference)))
                .is_err()
        };
        assert!(!refused(&|_| {}));
        assert!(refused(&|r| r.results.displacements.clear()));
        assert!(refused(&|r| {
            r.results.displacements.pop();
        }));
        assert!(refused(&|r| r.results.displacements[2].node_id += 100));
        assert!(refused(&|r| r.results.displacements[2].uy = f64::NAN));
        assert!(refused(&|r| r.results.displacements[2].rz = f64::INFINITY));
        let still = solve_corotational_3d(&input, 100, 1e-9, 2, false).unwrap();
        let mut flat = solve_corotational_3d(&input, 100, 1e-9, 2, false).unwrap();
        for d in flat.results.displacements.iter_mut() {
            (d.ux, d.uy, d.uz) = (0.0, 0.0, 0.0);
        }
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| apart(&still, &flat)))
                .is_err()
        );
    }

    #[test]
    fn adaptive_steps_reach_the_3d_solution_equal_steps_reach() {
        for n in [4, 12] {
            for (rise, propped) in [(0.0, false), (0.3, true)] {
                let input = frame(n, rise, propped, 0.05);
                let equal = solve_corotational_3d_by(&input, 100, 1e-9, 4, IterationMethod::Newton)
                    .unwrap();
                assert!(equal.converged);
                let stepped = solve_corotational_3d_stepped(
                    &input,
                    100,
                    1e-9,
                    4,
                    IterationMethod::Newton,
                    LoadStepping::Adaptive,
                )
                .unwrap();
                assert!(stepped.converged && stepped.load_factor == 1.0, "n {n}");
                assert!(stepped.load_increments >= 1);
                assert!(
                    apart(&stepped, &equal) <= 1e-7,
                    "n {n}: {}",
                    apart(&stepped, &equal)
                );
            }
        }
    }

    fn building(bays: usize, stories: usize, push: f64) -> SolverInput3D {
        let id = |i: usize, j: usize, k: usize| 1 + i + (bays + 1) * (j + (bays + 1) * k);
        let (mut nodes, mut elements, mut supports, mut loads) = (serde_json::Map::new(), serde_json::Map::new(), serde_json::Map::new(), Vec::new());
        let mut member = |a: usize, b: usize, section: usize| {
            let e = elements.len() + 1;
            elements.insert(e.to_string(), serde_json::json!({"id": e, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": section}));
        };
        for k in 0..=stories {
            for j in 0..=bays {
                for i in 0..=bays {
                    let n = id(i, j, k);
                    nodes.insert(n.to_string(), serde_json::json!({"id": n, "x": 5.0 * i as f64, "y": 5.0 * j as f64, "z": 3.0 * k as f64}));
                    if k == 0 {
                        supports.insert(n.to_string(), serde_json::json!({"nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}));
                        continue;
                    }
                    member(id(i, j, k - 1), n, 1);
                    if i > 0 { member(id(i - 1, j, k), n, 2); }
                    if j > 0 { member(id(i, j - 1, k), n, 2); }
                    loads.push(serde_json::json!({"type": "nodal", "data": {"nodeId": n, "fx": push, "fy": 0.4 * push, "fz": -40.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}));
                }
            }
        }
        serde_json::from_value(serde_json::json!({
            "nodes": nodes, "elements": elements, "supports": supports, "loads": loads,
            "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}},
            "sections": {"1": {"id": 1, "a": 0.25, "iy": 5.2e-3, "iz": 5.2e-3, "j": 8.8e-3}, "2": {"id": 2, "a": 0.18, "iy": 5.4e-3, "iz": 1.35e-3, "j": 3.7e-3}}
        })).unwrap()
    }

    #[test]
    fn newton_krylov_reaches_newtons_solution_of_a_building_in_as_many_iterations() {
        for (bays, stories) in [(2, 3), (3, 6)] {
            let input = building(bays, stories, 20.0);
            let newton = solve_corotational_3d_by(&input, 40, 1e-8, 4, IterationMethod::Newton).unwrap();
            let inexact = solve_corotational_3d_by(&input, 40, 1e-8, 4, IterationMethod::NewtonKrylov).unwrap();
            assert!(newton.converged && inexact.converged, "{bays} bays, {stories} stories");
            assert_eq!(inexact.load_factor, 1.0);
            assert!(apart(&inexact, &newton) <= 1e-7, "{}", apart(&inexact, &newton));
            assert!(inexact.iterations <= newton.iterations + 4, "{} against {}", inexact.iterations, newton.iterations);
        }
    }

    #[test]
    fn the_other_iterations_reach_the_3d_solution_newton_reaches() {
        for n in [4, 12] {
            for (rise, propped) in [(0.0, false), (0.3, true)] {
                let input = frame(n, rise, propped, 0.05);
                let newton =
                    solve_corotational_3d_by(&input, 100, 1e-9, 4, IterationMethod::Newton)
                        .unwrap();
                assert!(newton.converged);
                for method in [
                    IterationMethod::NewtonLineSearch,
                    IterationMethod::Anderson { depth: 4 },
                ] {
                    let other = solve_corotational_3d_by(&input, 400, 1e-9, 4, method).unwrap();
                    assert!(other.converged, "n {n}, {method:?}");
                    assert!(
                        apart(&other, &newton) <= 1e-7,
                        "n {n}, {method:?}: {}",
                        apart(&other, &newton)
                    );
                }
            }
        }
        let refused = solve_corotational_3d_by(
            &frame(4, 0.0, false, 0.05),
            50,
            1e-8,
            4,
            IterationMethod::Anderson { depth: 0 },
        );
        assert_eq!(
            refused.err().as_deref(),
            Some("Anderson acceleration needs a depth from 1 to 50")
        );
    }

    #[test]
    fn line_search_budget_in_3d_equal_steps() {
        let input = frame(1, 0.0, false, 0.05);
        let solve = |max_iter| {
            solve_corotational_3d_by(&input, max_iter, 1e-8, 2, IterationMethod::NewtonLineSearch)
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
    fn line_search_budget_in_3d_adaptive_steps() {
        let input = frame(1, 0.0, false, 0.05);
        let solve = |max_iter, stepping| {
            solve_corotational_3d_stepped(
                &input,
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

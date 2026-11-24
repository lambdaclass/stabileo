use super::experimental_nonlinear_3d::admitted_3d;
use super::*;
use crate::solver::experimental_nonlinear::path_following::{
    solve_by_arc_length, vec_norm, ArcLengthControl, PathProblem,
};

fn default_max_steps() -> usize {
    100
}
fn default_max_iter() -> usize {
    30
}
fn default_tol() -> f64 {
    1e-6
}
fn default_initial_ds() -> f64 {
    0.1
}
fn default_min_ds() -> f64 {
    1e-6
}
fn default_max_ds() -> f64 {
    1.0
}
fn default_target_iter() -> usize {
    5
}

/// The 3D twin of `arc_length::ArcLengthInput`: the model's loads are the pattern the load
/// factor scales.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthInput3D {
    #[serde(deserialize_with = "crate::types::units::deserialize_input_3d")]
    pub solver: SolverInput3D,
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    #[serde(default = "default_initial_ds")]
    pub initial_ds: f64,
    #[serde(default = "default_min_ds")]
    pub min_ds: f64,
    #[serde(default = "default_max_ds")]
    pub max_ds: f64,
    #[serde(default = "default_target_iter")]
    pub target_iter: usize,
}

#[derive(Debug, Clone)]
pub struct EquilibriumStep3D {
    pub step: usize,
    pub load_factor: f64,
    pub converged: bool,
    pub iterations: usize,
    pub displacements: Vec<Displacement3D>,
}

#[derive(Debug, Clone)]
pub struct ArcLengthResult3D {
    /// The state of the last converged step, under the loads times `final_load_factor`.
    pub results: AnalysisResults3D,
    pub steps: Vec<EquilibriumStep3D>,
    pub final_load_factor: f64,
    /// False when a step did not converge at the smallest arc length.
    pub converged: bool,
    pub total_iterations: usize,
}

enum TangentFactor {
    Sparse(NumericCholesky),
    Cholesky(Vec<f64>),
    Lu { a: Vec<f64>, piv: Vec<usize> },
}

struct ArcLength3D<'a> {
    input: &'a SolverInput3D,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    asm: &'a assembly::AssemblyResult,
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    ns: usize,
    left_hand: bool,
    f_ref: &'a [f64],
    psi2: f64,
    u_full: Vec<f64>,
    u_converged: Vec<f64>,
    naturals: Vec<MemberDeformation3D>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    factor: Option<TangentFactor>,
    factorizations: usize,
    f_int: Vec<f64>,
    r_f: Vec<f64>,
    k_t: Vec<f64>,
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
    steps: Vec<EquilibriumStep3D>,
}

impl ArcLength3D<'_> {
    fn global(&self) -> Vec<f64> {
        let mut u_geom = self.u_full.clone();
        for it in &self.asm.inclined_transforms {
            assembly::reverse_inclined_transform(&mut u_geom, &it.dofs, &it.r);
        }
        u_geom
    }

    /// The tangent of the last `linearize_at`, factorized once for every right-hand side asked
    /// of it. Past a limit point it is indefinite: Cholesky gives way to LU, and no conditioning
    /// diagnostic is kept, as in the 2D arc-length solver.
    fn factorize(&mut self) -> Result<(), String> {
        if self.factor.is_some() {
            return Ok(());
        }
        self.factorizations += 1;
        let (dof_num, cs) = (self.dof_num, self.cs);
        let (n, nf, ns) = (dof_num.n_total, dof_num.n_free, self.ns);
        let dense = if ns >= SPARSE_THRESHOLD {
            let k_s_csc = tangent_free_sparse_triplets(
                &self.trip_rows,
                &self.trip_cols,
                &self.trip_vals,
                nf,
                cs,
            );
            let sym = cached_symbolic(&mut self.sparse_sym_cache, &k_s_csc);
            if let Some(num) = numeric_cholesky(sym, &k_s_csc) {
                self.factor = Some(TangentFactor::Sparse(num));
                return Ok(());
            }
            if ns > crate::solver::time_integration::MAX_DENSE_FALLBACK_DOFS {
                return Err(format!(
                    "Arc-length analysis: the tangent stiffness is not positive definite and \
                     the model has {ns} unknowns, more than the {} the dense fallback takes",
                    crate::solver::time_integration::MAX_DENSE_FALLBACK_DOFS
                ));
            }
            k_s_csc.to_dense_symmetric()
        } else {
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&self.k_t, n, &free_idx, &free_idx);
            if let Some(ref cs) = *cs {
                cs.reduce_matrix(&k_ff)
            } else {
                k_ff
            }
        };
        let mut l = dense.clone();
        if cholesky_decompose(&mut l, ns) {
            self.factor = Some(TangentFactor::Cholesky(l));
            return Ok(());
        }
        let mut a = dense;
        let piv = lu_factor(&mut a, ns).ok_or_else(|| {
            "Singular tangent stiffness — structure may be a mechanism \
             or load increment too large"
                .to_string()
        })?;
        self.factor = Some(TangentFactor::Lu { a, piv });
        Ok(())
    }

    /// K⁻¹·rhs over the free DOFs.
    fn solve(&mut self, rhs: &[f64]) -> Result<Vec<f64>, String> {
        self.factorize()?;
        let (cs, ns) = (self.cs, self.ns);
        let r_s = if let Some(ref cs) = *cs {
            cs.reduce_vector(rhs)
        } else {
            rhs.to_vec()
        };
        let solved = match self.factor.as_ref() {
            Some(TangentFactor::Sparse(num)) => sparse_cholesky_solve(num, &r_s),
            Some(TangentFactor::Cholesky(l)) => solve_with_cholesky_factor(l, &r_s, ns),
            Some(TangentFactor::Lu { a, piv }) => lu_apply(a, piv, &r_s, ns).ok_or_else(|| {
                "Singular tangent stiffness — structure may be a mechanism \
                 or load increment too large"
                    .to_string()
            })?,
            None => return Err("Arc-length analysis: no tangent factorized".into()),
        };
        Ok(if let Some(ref cs) = *cs {
            cs.expand_solution(&solved, MasterMotion::Homogeneous)
        } else {
            solved
        })
    }
}

impl PathProblem for ArcLength3D<'_> {
    fn unknowns(&self) -> usize {
        self.dof_num.n_free
    }

    fn load_scale(&self) -> f64 {
        self.psi2
    }

    fn linearize_at(&mut self, _: f64) {
        let (input, dof_num, asm, left_hand) =
            (self.input, self.dof_num, self.asm, self.left_hand);
        let n = dof_num.n_total;
        let u_geom = self.global();
        let mut f_int = vec![0.0; n];
        let (mut k_t, mut trip_rows, mut trip_cols, mut trip_vals) =
            (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        if self.ns >= SPARSE_THRESHOLD {
            assemble_corotational_triplets_3d(
                input,
                dof_num,
                &u_geom,
                &mut f_int,
                &mut trip_rows,
                &mut trip_cols,
                &mut trip_vals,
                left_hand,
            );
            add_spring_contributions_3d(input, dof_num, &u_geom, &mut f_int, &mut |gi, gj, v| {
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
            assemble_corotational_3d(input, dof_num, &u_geom, &mut f_int, &mut k_t, left_hand);
            add_spring_contributions_3d(input, dof_num, &u_geom, &mut f_int, &mut |gi, gj, v| {
                k_t[gi * n + gj] += v
            });
            for it in &asm.inclined_transforms {
                assembly::apply_inclined_transform(&mut k_t, &mut f_int, n, &it.dofs, &it.r);
            }
        }
        self.factor = None;
        self.f_int = f_int;
        self.k_t = k_t;
        self.trip_rows = trip_rows;
        self.trip_cols = trip_cols;
        self.trip_vals = trip_vals;
    }

    fn measure(&mut self, lambda: f64) -> f64 {
        let nf = self.dof_num.n_free;
        let applied: Vec<f64> = self.asm.f.iter().map(|f| lambda * f).collect();
        let residual: Vec<f64> = applied.iter().zip(&self.f_int).map(|(a, f)| a - f).collect();
        self.r_f = residual[..nf].to_vec();
        self.metric
            .relative_residual(&residual, &applied, None, self.cs.as_ref())
    }

    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        let f_ref = self.f_ref;
        self.solve(f_ref)
    }

    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
        let (r_f, f_ref) = (std::mem::take(&mut self.r_f), self.f_ref);
        Ok((self.solve(&r_f)?, self.solve(f_ref)?))
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
        let u_geom = self.global();
        self.naturals = on_one_branch_3d(
            self.input,
            self.dof_num,
            (&self.u_converged, &self.naturals),
            &u_geom,
            self.left_hand,
        )?;
        self.u_converged.clone_from(&u_geom);
        self.steps.push(EquilibriumStep3D {
            step,
            load_factor: lambda,
            converged,
            iterations,
            displacements: crate::solver::linear::build_displacements_3d(
                self.dof_num,
                &u_geom,
            ),
        });
        Ok(())
    }
}

fn positive(value: f64, what: &str) -> Result<(), String> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(format!("{what} must be finite and positive"))
    }
}

/// Follow the equilibrium path of a 3D frame by arc length, past limit points. Refuses what
/// 3D co-rotational analysis refuses, and a member that leaves its rotation branch on the way.
pub fn solve_arc_length_3d(input: &ArcLengthInput3D) -> Result<ArcLengthResult3D, String> {
    if input.max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if input.target_iter == 0 {
        return Err("Target iterations must be at least 1".into());
    }
    positive(input.tolerance, "Convergence tolerance")?;
    positive(input.initial_ds, "Initial arc length")?;
    positive(input.min_ds, "Minimum arc length")?;
    positive(input.max_ds, "Maximum arc length")?;
    if input.min_ds > input.initial_ds || input.initial_ds > input.max_ds {
        return Err("The initial arc length must lie between the minimum and the maximum".into());
    }

    let canonical_input = crate::solver::member_loads::space_input(&input.solver);
    let (expanded, pre_solve_diags) = admitted_3d(canonical_input.as_ref(), "Arc-length analysis")?;
    let solver = &expanded;
    let dof_num = DofNumbering::build_3d(solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }
    let (n, nf) = (dof_num.n_total, dof_num.n_free);
    let left_hand = solver.left_hand.unwrap_or(false);

    let cs = FreeConstraintSystem::build_3d(solver, &dof_num)?;
    let metric =
        crate::solver::convergence::EquilibriumMetric::for_3d(solver, &dof_num, cs.as_ref())?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let asm = assembly::assemble_3d(solver, &dof_num);
    let f_ref: Vec<f64> = asm.f[..nf].to_vec();
    if metric.free_norm(&f_ref, cs.as_ref()) == 0.0 {
        return Err("Zero reference load".into());
    }

    let u_full = vec![0.0; n];
    let mut problem = ArcLength3D {
        input: solver,
        dof_num: &dof_num,
        cs: &cs,
        asm: &asm,
        metric: &metric,
        ns,
        left_hand,
        f_ref: &f_ref,
        psi2: vec_norm(&f_ref).powi(2),
        naturals: member_deformations_3d(solver, &dof_num, &u_full, left_hand),
        u_converged: u_full.clone(),
        u_full,
        sparse_sym_cache: None,
        factor: None,
        factorizations: 0,
        f_int: Vec::new(),
        r_f: Vec::new(),
        k_t: Vec::new(),
        trip_rows: Vec::new(),
        trip_cols: Vec::new(),
        trip_vals: Vec::new(),
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
    let ArcLength3D {
        u_full,
        naturals,
        steps,
        factorizations,
        ..
    } = problem;
    #[cfg(test)]
    tests::FACTORIZATIONS.with(|count| count.set(factorizations));
    #[cfg(not(test))]
    let _ = factorizations;

    let at_state = scaled_loads_3d(solver, outcome.load_factor);
    let mut results = build_final_results_3d(
        &at_state,
        &dof_num,
        &u_full,
        left_hand,
        &cs,
        pre_solve_diags,
        &asm.inclined_transforms,
    )?;
    crate::known_issues::attach(
        &mut results.structured_diagnostics,
        crate::known_issues::for_3d(solver, crate::known_issues::Analysis::Corotational),
    );
    if naturals
        .iter()
        .any(|d| d.natural > crate::known_issues::NL3_NATURAL_ROTATION)
    {
        crate::known_issues::attach(
            &mut results.structured_diagnostics,
            vec![crate::known_issues::corotational_natural_rotation()],
        );
    }
    crate::known_issues::refuse(&results.structured_diagnostics)?;

    Ok(ArcLengthResult3D {
        results,
        steps,
        final_load_factor: outcome.load_factor,
        converged: outcome.converged,
        total_iterations: outcome.iterations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solver::arc_length::{solve_arc_length, ArcLengthInput};

    /// A frame in the XZ plane, as a 2D model and as the same model in 3D held in its plane.
    fn planar(n: usize, rise: f64, element: &str, load: (f64, f64)) -> (SolverInput, SolverInput3D) {
        let loaded = n / 2 + 1;
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        let mut nodes_3d = serde_json::Map::new();
        let mut supports_3d = serde_json::Map::new();
        for i in 0..=n {
            let t = i as f64 / n as f64;
            let (x, z) = (6.0 * t, rise * 4.0 * t * (1.0 - t));
            nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": x, "z": z}));
            nodes_3d.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": x, "y": 0.0, "z": z}));
            let end = i == 0 || i == n;
            supports_3d.insert((i + 1).to_string(), serde_json::json!({
                "nodeId": i + 1, "rx": end, "ry": true, "rz": end, "rrx": true, "rry": false, "rrz": true
            }));
        }
        for i in 0..n {
            elements.insert((i + 1).to_string(), serde_json::json!({
                "id": i + 1, "type": element, "nodeI": i + 1, "nodeJ": i + 2, "materialId": 1, "sectionId": 1
            }));
        }
        let plane: SolverInput = serde_json::from_value(serde_json::json!({
            "nodes": nodes, "elements": elements,
            "materials": {"1": {"id": 1, "e": 200.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "pinned"}, "2": {"id": 2, "nodeId": n + 1, "type": "pinned"}},
            "loads": [{"type": "nodal", "data": {"nodeId": loaded, "fx": load.0, "fz": load.1, "my": 0.0}}]
        })).unwrap();
        let space: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": nodes_3d, "elements": elements, "supports": supports_3d,
            "materials": {"1": {"id": 1, "e": 200.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
            "loads": [{"type": "nodal", "data": {"nodeId": loaded, "fx": load.0, "fy": 0.0, "fz": load.1, "mx": 0.0, "my": 0.0, "mz": 0.0}}]
        })).unwrap();
        (plane, space)
    }

    fn asked(solver: SolverInput3D, max_steps: usize, initial_ds: f64) -> ArcLengthInput3D {
        ArcLengthInput3D { solver, max_steps, max_iter: 30, tolerance: 1e-9, initial_ds, min_ds: 1e-7, max_ds: initial_ds, target_iter: 5 }
    }

    fn flat(solver: SolverInput, max_steps: usize, initial_ds: f64) -> ArcLengthInput {
        ArcLengthInput { solver, max_steps, max_iter: 30, tolerance: 1e-9, initial_ds, min_ds: 1e-7, max_ds: initial_ds, target_iter: 5 }
    }

    #[test]
    fn a_planar_model_follows_the_path_the_2d_solver_follows() {
        let mut sparse = 0;
        for (n, rise, element, load, ds, steps) in [
            (2, 0.3, "truss", (0.0, -1.0), 0.02, 60),
            (8, 0.3, "frame", (0.0, -1.0), 0.02, 60),
            (8, 0.0, "frame", (0.0, -1.0), 0.02, 30),
            (8, 0.6, "frame", (0.2, -1.0), 0.03, 60),
            (30, 0.3, "frame", (0.0, -1.0), 0.02, 25),
        ] {
            let (plane, space) = planar(n, rise, element, load);
            if DofNumbering::build_3d(&space).n_free >= SPARSE_THRESHOLD { sparse += 1; }
            let reference = solve_arc_length(&flat(plane, steps, ds)).unwrap();
            let followed = solve_arc_length_3d(&asked(space, steps, ds)).unwrap();
            assert!(reference.converged && followed.converged, "{element}, {n} members");
            assert_eq!((reference.steps.len(), followed.steps.len()), (steps, steps));
            assert_eq!(followed.final_load_factor, followed.steps[steps - 1].load_factor);
            for (a, b) in reference.steps.iter().zip(&followed.steps) {
                assert!((a.load_factor - b.load_factor).abs() <= 1e-8, "{element}, {n} members, step {}: {} vs {}", a.step, a.load_factor, b.load_factor);
                assert_eq!(a.displacements.len(), b.displacements.len());
                for (p, q) in a.displacements.iter().zip(&b.displacements) {
                    assert_eq!(p.node_id, q.node_id);
                    assert!((p.ux - q.ux).abs() <= 1e-8 && (p.uz - q.uz).abs() <= 1e-8 && (p.ry.abs() - q.ry.abs()).abs() <= 1e-8, "{element}, {n} members, step {}, node {}", a.step, p.node_id);
                    assert!(q.uy == 0.0 && q.rx == 0.0 && q.rz == 0.0);
                }
            }
        }
        assert!(sparse >= 1);
    }

    #[test]
    fn a_shallow_truss_is_followed_past_its_limit_load() {
        let (_, space) = planar(2, 0.3, "truss", (0.0, -1.0));
        let followed = solve_arc_length_3d(&asked(space, 60, 0.02)).unwrap();
        assert!(followed.converged);
        let factors: Vec<f64> = followed.steps.iter().map(|s| s.load_factor).collect();
        let peak = factors.iter().copied().fold(f64::MIN, f64::max);
        let at = factors.iter().position(|f| *f == peak).unwrap();
        assert!(at >= 5 && at + 10 < factors.len(), "the peak is step {at} of {}", factors.len());
        assert!(factors[..at].windows(2).all(|pair| pair[1] > pair[0]), "the load does not rise to its peak");
        assert!(factors[at..].windows(2).all(|pair| pair[1] < pair[0]), "the load does not fall after its peak");
        assert!(*factors.last().unwrap() < 0.6 * peak);
        let crown: Vec<f64> = followed.steps.iter().map(|s| s.displacements[1].uz).collect();
        assert!(crown.windows(2).all(|pair| pair[1] < pair[0]), "the crown does not keep going down");
    }

    fn space_cantilever(n: usize) -> SolverInput3D {
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        for i in 0..=n {
            let t = i as f64 / n as f64;
            nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": 4.0 * t, "y": 0.6 * t * t, "z": 0.3 * t}));
        }
        for i in 0..n {
            elements.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "type": "frame", "nodeI": i + 1, "nodeJ": i + 2, "materialId": 1, "sectionId": 1}));
        }
        serde_json::from_value(serde_json::json!({
            "nodes": nodes, "elements": elements,
            "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
            "materials": {"1": {"id": 1, "e": 200.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 2e-4, "j": 1.5e-4}},
            "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0.0, "fy": 0.4, "fz": -1.0, "mx": 0.05, "my": 0.0, "mz": 0.0}}]
        })).unwrap()
    }

    #[test]
    fn every_step_of_a_space_frame_is_the_state_load_control_reaches_at_that_load() {
        for n in [4, 12] {
            let followed = solve_arc_length_3d(&asked(space_cantilever(n), 8, 0.01)).unwrap();
            assert!(followed.converged && followed.steps.len() == 8);
            for step in &followed.steps {
                let mut at_load = space_cantilever(n);
                for load in at_load.loads.iter_mut() {
                    if let SolverLoad3D::Nodal(nodal) = load {
                        for value in [&mut nodal.fx, &mut nodal.fy, &mut nodal.fz, &mut nodal.mx, &mut nodal.my, &mut nodal.mz] {
                            *value *= step.load_factor;
                        }
                    }
                }
                let held = solve_corotational_3d(&at_load, 60, 1e-10, 4, false).unwrap();
                assert!(held.converged);
                let largest = held.results.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
                assert!(largest > 0.0);
                assert_eq!(held.results.displacements.len(), step.displacements.len());
                for (p, q) in held.results.displacements.iter().zip(&step.displacements) {
                    assert_eq!(p.node_id, q.node_id);
                    for (x, y) in [(p.ux, q.ux), (p.uy, q.uy), (p.uz, q.uz), (p.rx, q.rx), (p.ry, q.ry), (p.rz, q.rz)] {
                        assert!(x.is_finite() && y.is_finite() && (x - y).abs() <= 1e-6 * largest, "{n} members, step {}, node {}: {x} vs {y}", step.step, p.node_id);
                    }
                }
            }
            let out_of_plane = followed.steps.last().unwrap().displacements.last().unwrap().uy;
            assert!(out_of_plane.abs() > 0.0);
            let last = followed.steps.last().unwrap();
            for (p, q) in followed.results.displacements.iter().zip(&last.displacements) {
                assert_eq!((p.ux, p.uy, p.uz), (q.ux, q.uy, q.uz));
            }
        }
    }

    #[test]
    fn a_path_that_cannot_be_followed_ends_unconverged_at_its_last_step() {
        let (_, space) = planar(8, 0.3, "frame", (0.0, -1.0));
        let mut hopeless = asked(space, 20, 0.02);
        hopeless.max_iter = 1;
        hopeless.min_ds = 0.005;
        let result = solve_arc_length_3d(&hopeless).unwrap();
        assert!(!result.converged);
        assert!(result.steps.is_empty());
        assert_eq!(result.final_load_factor, 0.0);
        assert!(result.results.displacements.iter().all(|d| d.ux == 0.0 && d.uz == 0.0));
    }

    #[test]
    fn what_cannot_be_followed_is_refused() {
        let (_, space) = planar(8, 0.3, "frame", (0.0, -1.0));
        let refusal = |change: &dyn Fn(&mut ArcLengthInput3D)| {
            let mut input = asked(space.clone(), 10, 0.02);
            change(&mut input);
            solve_arc_length_3d(&input).unwrap_err()
        };
        assert_eq!(refusal(&|i| i.max_iter = 0), "Max iterations must be at least 1");
        assert_eq!(refusal(&|i| i.target_iter = 0), "Target iterations must be at least 1");
        for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert_eq!(refusal(&|i| i.tolerance = bad), "Convergence tolerance must be finite and positive");
            assert_eq!(refusal(&|i| i.initial_ds = bad), "Initial arc length must be finite and positive");
            assert_eq!(refusal(&|i| i.min_ds = bad), "Minimum arc length must be finite and positive");
            assert_eq!(refusal(&|i| i.max_ds = bad), "Maximum arc length must be finite and positive");
        }
        assert_eq!(refusal(&|i| i.min_ds = 1.0), "The initial arc length must lie between the minimum and the maximum");
        assert_eq!(refusal(&|i| i.max_ds = 0.001), "The initial arc length must lie between the minimum and the maximum");
        assert_eq!(refusal(&|i| i.solver.loads.clear()), "Zero reference load");
        let moved = refusal(&|i| i.solver.supports.get_mut("1").unwrap().dz = Some(0.01));
        assert!(moved.contains("Arc-length analysis"), "{moved}");
        let like_load_control = solve_corotational_3d(&{
            let mut offset = space.clone();
            offset.sections.get_mut("1").unwrap().shear_center_y = Some(0.01);
            offset
        }, 20, 1e-8, 2, false).unwrap_err();
        assert_eq!(refusal(&|i| i.solver.sections.get_mut("1").unwrap().shear_center_y = Some(0.01)), like_load_control);
        let held: SolverInput3D = {
            let mut held = space.clone();
            for support in held.supports.values_mut() {
                (support.rx, support.rz, support.rry) = (true, true, true);
            }
            held
        };
        assert_eq!(solve_arc_length_3d(&asked(held, 10, 0.02)).unwrap_err(), "No free DOFs — all nodes are fully restrained");
    }

    thread_local! {
        pub(super) static FACTORIZATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }

    #[test]
    fn the_tangent_is_factorized_once_for_each_time_it_is_assembled() {
        for (n, element) in [(2, "truss"), (8, "frame"), (30, "frame")] {
            let (_, space) = planar(n, 0.3, element, (0.0, -1.0));
            let followed = solve_arc_length_3d(&asked(space, 20, 0.02)).unwrap();
            assert!(followed.converged);
            let assembled = followed.total_iterations + followed.steps.len();
            let factorized = FACTORIZATIONS.with(|count| count.get());
            assert!(factorized <= assembled, "{element}, {n}: {factorized} factorizations for {assembled} assemblies");
            assert!(factorized >= followed.steps.len());
        }
    }

    #[test]
    fn inclined_support_steps_check_deformations_in_global_coordinates() {
        for left_hand in [false, true] {
            let mut input = space_cantilever(1);
            input.left_hand = Some(left_hand);
            let mut tip = input.supports["1"].clone();
            tip.node_id = 2;
            (tip.rx, tip.ry, tip.rz, tip.rrx, tip.rry, tip.rrz) = (false, false, false, false, false, false);
            tip.is_inclined = Some(true);
            (tip.normal_x, tip.normal_y, tip.normal_z) = (Some(1.0), Some(2.0), Some(3.0));
            input.supports.insert("2".into(), tip);
            let dof_num = DofNumbering::build_3d(&input);
            let cs = FreeConstraintSystem::build_3d(&input, &dof_num).unwrap();
            let asm = assembly::assemble_3d(&input, &dof_num);
            assert_eq!(asm.inclined_transforms.len(), 1);
            let metric = crate::solver::convergence::EquilibriumMetric::for_3d(&input, &dof_num, cs.as_ref()).unwrap();
            let zero = vec![0.0; dof_num.n_total];
            let mut problem = ArcLength3D {
                input: &input, dof_num: &dof_num, cs: &cs, asm: &asm, metric: &metric,
                ns: dof_num.n_free, left_hand, f_ref: &asm.f[..dof_num.n_free], psi2: 1.0,
                u_full: zero.clone(), u_converged: zero.clone(),
                naturals: member_deformations_3d(&input, &dof_num, &zero, left_hand),
                sparse_sym_cache: None, factor: None, factorizations: 0,
                f_int: Vec::new(), r_f: Vec::new(), k_t: Vec::new(),
                trip_rows: Vec::new(), trip_cols: Vec::new(), trip_vals: Vec::new(), steps: Vec::new(),
            };
            for step in 1..=2 {
                problem.u_full[dof_num.global_dof(2, 0).unwrap()] = 0.02 * step as f64;
                problem.u_full[dof_num.global_dof(2, 1).unwrap()] = -0.01 * step as f64;
                let global = problem.global();
                assert_ne!(global, problem.u_full);
                let expected = on_one_branch_3d(&input, &dof_num,
                    (&problem.u_converged, &problem.naturals), &global, left_hand).unwrap();
                problem.record(step, 1.0, 2, true).unwrap();
                assert_eq!(problem.u_converged, global);
                for (actual, expected) in problem.naturals.iter().zip(expected) {
                    assert_eq!(actual.natural.to_bits(), expected.natural.to_bits());
                    assert_eq!(actual.chord.to_bits(), expected.chord.to_bits());
                    assert_eq!(actual.ends, expected.ends);
                }
                let expected = crate::solver::linear::build_displacements_3d(&dof_num, &global);
                assert_eq!(serde_json::to_value(&problem.steps.last().unwrap().displacements).unwrap(),
                    serde_json::to_value(expected).unwrap());
            }
            problem.u_full[dof_num.global_dof(2, 3).unwrap()] = MAX_RELATIVE_END_ROTATION + 0.1;
            let before = problem.u_converged.clone();
            let expected = on_one_branch_3d(&input, &dof_num,
                (&before, &problem.naturals), &problem.global(), left_hand).err().unwrap();
            assert_eq!(problem.record(3, 1.0, 2, true).unwrap_err(), expected);
            assert_eq!(problem.steps.len(), 2);
            assert_eq!(problem.u_converged, before);
        }
    }

    #[test]
    fn a_large_target_iteration_count_does_not_overflow() {
        let (_, space) = planar(2, 0.3, "truss", (0.0, -1.0));
        let mut input = asked(space, 4, 0.02);
        input.target_iter = usize::MAX;
        let result = solve_arc_length_3d(&input).unwrap();
        assert!(result.converged);
        assert_eq!(result.steps.len(), 4);
        input.target_iter = usize::MAX / 2;
        let expected = solve_arc_length_3d(&input).unwrap();
        assert_eq!(serde_json::to_value(result.results).unwrap(), serde_json::to_value(expected.results).unwrap());
        assert_eq!(format!("{:?}", result.steps), format!("{:?}", expected.steps));
        assert_eq!(result.final_load_factor, expected.final_load_factor);
        assert_eq!(result.converged, expected.converged);
        assert_eq!(result.total_iterations, expected.total_iterations);
    }

    #[test]
    fn an_input_read_from_json_goes_through_the_typed_boundary_and_takes_the_defaults() {
        let (_, space) = planar(8, 0.3, "frame", (0.0, -1.0));
        let read: ArcLengthInput3D = serde_json::from_value(serde_json::json!({
            "solver": serde_json::to_value(&space).unwrap(), "maxSteps": 6, "initialDs": 0.02
        })).unwrap();
        assert_eq!((read.max_steps, read.max_iter, read.target_iter), (6, 30, 5));
        assert_eq!((read.tolerance, read.initial_ds, read.min_ds, read.max_ds), (1e-6, 0.02, 1e-6, 1.0));
        let direct = ArcLengthInput3D { solver: space, ..read.clone() };
        let (from_json, built) = (solve_arc_length_3d(&read).unwrap(), solve_arc_length_3d(&direct).unwrap());
        assert_eq!(format!("{:?}", from_json.steps), format!("{:?}", built.steps));
        assert_eq!(from_json.steps.len(), 6);

        let malformed = serde_json::from_value::<ArcLengthInput3D>(serde_json::json!({
            "solver": {"nodes": {}, "elements": {}, "materials": {}, "supports": {}, "loads": [],
                "sections": {"1": {"id": 1, "a": "wide", "iy": 1.0, "iz": 1.0, "j": 1.0}}}
        }));
        assert!(malformed.is_err());
    }

    #[test]
    fn zero_steps_return_the_undeformed_state() {
        let (_, space) = planar(8, 0.3, "frame", (0.0, -1.0));
        let result = solve_arc_length_3d(&asked(space, 0, 0.02)).unwrap();
        assert!(result.converged && result.steps.is_empty());
        assert_eq!((result.final_load_factor, result.total_iterations), (0.0, 0));
    }
}

use super::shared_driver_equivalence_3d::frame;
use super::*;
use incremental::IncrementalProblem;

fn make<'a>(
    input: &'a SolverInput3D,
    dofs: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    asm: &'a assembly::AssemblyResult,
    metric: &'a crate::solver::convergence::EquilibriumMetric,
    force_only: bool,
) -> Corotational3D<'a> {
    let u = vec![0.0; dofs.n_total];
    Corotational3D {
        modified_newton: force_only,
        prepared: prepared_3d::PreparedCorotational3D::new(input, dofs, false),
        input,
        dof_num: dofs,
        cs,
        asm,
        metric,
        ns: cs.as_ref().map_or(dofs.n_free, |c| c.n_free_indep),
        left_hand: false,
        f_total: &asm.f,
        f_int: Vec::new(),
        u_geom: Vec::new(),
        residual: Vec::new(),
        naturals: member_deformations_3d(input, dofs, &u, false),
        u_full: u.clone(),
        u_converged: u,
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
    }
}
fn bits(v: &[f64]) -> Vec<u64> {
    v.iter().map(|x| x.to_bits()).collect()
}
fn same_forces(a: &Corotational3D<'_>, b: &Corotational3D<'_>) {
    assert_eq!(bits(&a.f_int), bits(&b.f_int));
    assert_eq!(bits(&a.residual), bits(&b.residual));
    assert_eq!(bits(&a.unbalance), bits(&b.unbalance));
    assert_eq!(a.work, b.work);
    assert_eq!(
        serde_json::to_value(&a.conditioning).unwrap(),
        serde_json::to_value(&b.conditioning).unwrap()
    );
}
fn has_tangent(p: &Corotational3D<'_>) -> bool {
    !p.k_t.is_empty() || !p.trip_vals.is_empty()
}

#[test]
fn force_only_requires_both_the_method_and_a_factor_and_rebuilds_each_increment() {
    for n in [1, 12] {
        let input = frame(n, 0.0, false, 0.05);
        let dofs = DofNumbering::build_3d(&input);
        let cs = FreeConstraintSystem::build_3d(&input, &dofs).unwrap();
        let asm = assembly::assemble_3d(&input, &dofs);
        let metric =
            crate::solver::convergence::EquilibriumMetric::for_3d(&input, &dofs, cs.as_ref())
                .unwrap();
        let mut full = make(&input, &dofs, &cs, &asm, &metric, false);
        let mut fast = make(&input, &dofs, &cs, &asm, &metric, true);
        // Re-enter after rollback as adaptive stepping does, then after commit.
        for (load, accept) in [(0.25, false), (0.125, true), (0.5, false)] {
            for p in [&mut full, &mut fast] {
                p.begin_increment(load);
                assert!(p.cached_factor.is_none());
                p.linearize().unwrap();
                assert!(has_tangent(p));
            }
            same_forces(&full, &fast);
            let a = full.correction(true).unwrap();
            let b = fast.correction(true).unwrap();
            assert_eq!(bits(&a), bits(&b));
            assert!(fast.cached_factor.is_some());
            full.advance(&a);
            fast.advance(&b);
            // Previously used matrix storage must not leak into this evaluation.
            fast.k_t.push(f64::NAN);
            fast.trip_vals.push(f64::NAN);
            fast.trip_rows.push(usize::MAX);
            fast.trip_cols.push(usize::MAX);
            assert_eq!(
                full.linearize().unwrap().measure.to_bits(),
                fast.linearize().unwrap().measure.to_bits()
            );
            assert!(has_tangent(&full));
            assert!(!has_tangent(&fast));
            same_forces(&full, &fast);
            assert_eq!(
                bits(&full.correction(true).unwrap()),
                bits(&fast.correction(true).unwrap())
            );
            if accept {
                full.commit().unwrap();
                fast.commit().unwrap();
            } else {
                full.rollback();
                fast.rollback();
            }
            assert_eq!(bits(&full.u_full), bits(&fast.u_full));
            assert_eq!(bits(&full.u_converged), bits(&fast.u_converged));
        }
        // Preparation-budget fallback: even with a factor, keep full assembly.
        fast.prepared = None;
        fast.linearize().unwrap();
        assert!(has_tangent(&fast));
        // An unsuccessful factorization must never enable force-only evaluation.
        fast.cached_factor = None;
        fast.k_t.fill(0.0);
        fast.trip_vals.fill(0.0);
        assert!(fast.correction(true).is_err());
        assert!(fast.cached_factor.is_none());
        fast.prepared = prepared_3d::PreparedCorotational3D::new(&input, &dofs, false);
        fast.linearize().unwrap();
        assert!(has_tangent(&fast));
    }
}

#[test]
fn force_only_keeps_complete_increment_outcomes_states_and_refusals() {
    let mut cases = Vec::new();
    for n in [1, 12] {
        cases.push(frame(n, 0.0, false, 0.05));
        let mut input = frame(n, 0.0, false, 0.05);
        let sup = input.supports.get_mut("1").unwrap();
        sup.is_inclined = Some(true);
        sup.normal_x = Some(0.6);
        sup.normal_y = Some(0.0);
        sup.normal_z = Some(0.8);
        input.supports.insert("spring".into(), serde_json::from_value(serde_json::json!({
            "nodeId":n+1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"ky":0.4,"kz":0.2
        })).unwrap());
        if n > 1 {
            input.constraints.push(serde_json::from_value(serde_json::json!({
                "type":"linearMPC","terms":[{"nodeId":n,"dof":1,"coefficient":1.0},{"nodeId":n+1,"dof":1,"coefficient":-1.0}]
            })).unwrap());
        }
        cases.push(input);
    }
    cases.push(frame(6, 2.0, true, 20.0));
    let mut converged = 0;
    let mut unfinished = 0;
    for input in &cases {
        let dofs = DofNumbering::build_3d(input);
        let cs = FreeConstraintSystem::build_3d(input, &dofs).unwrap();
        let asm = assembly::assemble_3d(input, &dofs);
        let metric =
            crate::solver::convergence::EquilibriumMetric::for_3d(input, &dofs, cs.as_ref())
                .unwrap();
        for stepping in [LoadStepping::Equal, LoadStepping::Adaptive] {
            for limit in [1, 2, 80] {
                let mut full = make(input, &dofs, &cs, &asm, &metric, false);
                let mut fast = make(input, &dofs, &cs, &asm, &metric, true);
                let a = incremental::solve_stepped(
                    &mut full,
                    IterationMethod::ModifiedNewton,
                    stepping,
                    4,
                    1e-8,
                    limit,
                );
                let b = incremental::solve_stepped(
                    &mut fast,
                    IterationMethod::ModifiedNewton,
                    stepping,
                    4,
                    1e-8,
                    limit,
                );
                assert_eq!(a, b);
                match a {
                    Ok(o) if o.converged => converged += 1,
                    _ => unfinished += 1,
                }
                same_forces(&full, &fast);
                assert_eq!(bits(&full.u_full), bits(&fast.u_full));
                assert_eq!(bits(&full.u_converged), bits(&fast.u_converged));
            }
        }
    }
    assert!(converged > 0 && unfinished > 0);
}

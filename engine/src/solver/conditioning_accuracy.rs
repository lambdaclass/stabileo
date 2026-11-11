use super::assembly::InclinedFrame;
use super::{assembly, dof::DofNumbering, stability::{Stability, CONDITIONAL_ACCURACY}};
use crate::types::*;

fn check(stability: &Stability, balance: &[f64], applied: &[f64], nf: usize) -> Result<(), String> {
    if applied.iter().any(|v| !v.is_finite()) { return Err(stability.conditioning_refusal()); }
    let scale = applied.iter().fold(0.0f64, |a, b| a.max(b.abs()));
    if balance[..nf].iter().any(|v| !v.is_finite() || v.abs() > CONDITIONAL_ACCURACY * scale) {
        return Err(stability.conditioning_refusal());
    }
    Ok(())
}

fn constraints(balance: &mut [f64], dof: &DofNumbering, forces: &[ConstraintForce], names: &[&str]) {
    for force in forces {
        if let Some(local) = names.iter().position(|n| *n == force.dof) {
            if let Some(i) = dof.global_dof(force.node_id, local) { balance[i] -= force.force; }
        }
    }
}

pub(super) fn member_balance_2d(input: &SolverInput, loads: &[SolverLoad], dof: &DofNumbering, stability: &Stability, r: &AnalysisResults, fcs: Option<&super::constraints::FreeConstraintSystem>) -> Result<(), String> {
    if !stability.needs_accuracy_check() { return Ok(()); }
    let mut remainder = input.clone();
    remainder.elements.clear();
    remainder.loads = loads.iter().filter(|l| matches!(l, SolverLoad::Nodal(_))).cloned().collect();
    let asm = assembly::without_artificial_stiffness(|| assembly::assemble_sparse_2d_ex(&remainder, dof, true));
    let mut u = vec![0.0; dof.n_total];
    for d in &r.displacements {
        for (local, value) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(i) = dof.global_dof(d.node_id, local) { u[i] = value; }
        }
    }
    let mut ends = vec![0.0; dof.n_total];
    for f in &r.element_forces {
        let e = &input.elements[&f.element_id.to_string()];
        let (a, b) = (&input.nodes[&e.node_i.to_string()], &input.nodes[&e.node_j.to_string()]);
        let (dx, dz) = (b.x - a.x, b.z - a.z);
        let length = dx.hypot(dz);
        let (c, s) = (dx / length, dz / length);
        for (node, axial, shear, moment) in [(e.node_i, -f.n_start, f.v_start, f.m_start), (e.node_j, f.n_end, -f.v_end, -f.m_end)] {
            for (local, value) in [c*axial - s*shear, s*axial + c*shear, moment].into_iter().enumerate() {
                if let Some(i) = dof.global_dof(node, local) { ends[i] += value; }
            }
        }
    }
    if fcs.is_none() { constraints(&mut ends, dof, &r.constraint_forces, &["ux", "uz", "ry"]); }
    for it in &asm.inclined_transforms_2d { it.rotate(&mut u); it.rotate(&mut ends); }
    let mut balance = asm.k_full.as_ref().unwrap().sym_mat_vec(&u);
    for ((v, end), load) in balance.iter_mut().zip(ends).zip(&asm.f) { *v += end - load; }
    let applied = assembly::assemble_load_vector_2d(input, loads, dof, &asm.inclined_transforms_2d);
    if let Some(fcs) = fcs {
        let reduced = fcs.reduce_vector(&balance[..dof.n_free]);
        check(stability, &reduced, &applied, reduced.len())
    } else { check(stability, &balance, &applied, dof.n_free) }
}

pub(super) fn member_balance_3d(input: &SolverInput3D, loads: &[SolverLoad3D], dof: &DofNumbering, stability: &Stability, r: &AnalysisResults3D, fcs: Option<&super::constraints::FreeConstraintSystem>) -> Result<(), String> {
    if !stability.needs_accuracy_check() { return Ok(()); }
    let mut remainder = input.clone();
    remainder.elements.clear();
    remainder.loads = loads.iter().filter(|l| !matches!(l, SolverLoad3D::Distributed(_) | SolverLoad3D::PointOnElement(_) | SolverLoad3D::Thermal(_))).cloned().collect();
    let asm = assembly::without_artificial_stiffness(|| assembly::assemble_sparse_3d(&remainder, dof, true));
    let mut u = vec![0.0; dof.n_total];
    for d in &r.displacements {
        for (local, value) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz, d.warping.unwrap_or(0.0)].into_iter().enumerate() {
            if let Some(i) = dof.global_dof(d.node_id, local) { u[i] = value; }
        }
    }
    let mut ends = vec![0.0; dof.n_total];
    for f in &r.element_forces {
        let e = &input.elements[&f.element_id.to_string()];
        let (a, b) = (&input.nodes[&e.node_i.to_string()], &input.nodes[&e.node_j.to_string()]);
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z,
            e.local_yx, e.local_yy, e.local_yz, e.roll_angle, input.left_hand.unwrap_or(false));
        for (node, force, moment, bimoment) in [
            (e.node_i, [-f.n_start, f.vy_start, f.vz_start], [f.mx_start, f.my_start, f.mz_start], -f.bimoment_start.unwrap_or(0.0)),
            (e.node_j, [f.n_end, -f.vy_end, -f.vz_end], [-f.mx_end, -f.my_end, -f.mz_end], f.bimoment_end.unwrap_or(0.0)),
        ] {
            for (offset, v) in [(0, force), (3, moment)] {
                for local in 0..3 {
                    if let Some(i) = dof.global_dof(node, offset + local) { ends[i] += ex[local]*v[0] + ey[local]*v[1] + ez[local]*v[2]; }
                }
            }
            if let Some(i) = dof.global_dof(node, 6) { ends[i] += bimoment; }
        }
    }
    if fcs.is_none() { constraints(&mut ends, dof, &r.constraint_forces, &["ux", "uy", "uz", "rx", "ry", "rz", "warping"]); }
    for it in &asm.inclined_transforms { it.rotate(&mut u); it.rotate(&mut ends); }
    let mut balance = asm.k_full.as_ref().unwrap().sym_mat_vec(&u);
    for ((v, end), load) in balance.iter_mut().zip(ends).zip(&asm.f) { *v += end - load; }
    let applied = super::sparse_assembly::assemble_load_vector_sparse_3d(input, loads, dof, &asm.inclined_transforms);
    if let Some(fcs) = fcs {
        let reduced = fcs.reduce_vector(&balance[..dof.n_free]);
        check(stability, &reduced, &applied, reduced.len())
    } else { check(stability, &balance, &applied, dof.n_free) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovered_balance_checks_both_sides_of_the_accuracy_limit() {
        let s = Stability::stable();
        for factor in [1.0 - 1e-4, 1.0 + 1e-4] {
            assert_eq!(check(&s, &[CONDITIONAL_ACCURACY*factor, 0.0], &[1.0, 0.0], 2).is_ok(), factor < 1.0);
        }
        assert!(check(&s, &[f64::NAN], &[1.0], 1).is_err());
        assert!(check(&s, &[f64::INFINITY], &[1.0], 1).is_err());
        assert!(check(&s, &[0.0], &[0.0], 1).is_ok());
    }

    fn beam(settlement: bool) -> SolverInput {
        serde_json::from_value(serde_json::json!({
            "nodes": {"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":2.0,"z":0.0},"3":{"id":3,"x":6.0,"z":0.0}},
            "elements": {
                "1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false},
                "2":{"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}},
            "materials":{"1":{"id":1,"e":200000.0,"nu":0.3}},
            "sections":{"1":{"id":1,"a":0.01,"iz":1e-4}},
            "supports":{"1":{"id":1,"nodeId":1,"type":"fixed","dx":if settlement {0.01} else {0.0}},"2":{"id":2,"nodeId":3,"type":"fixed"}},
            "loads":[]
        })).unwrap()
    }

    fn conditional() -> Stability {
        let mut s = Stability::stable();
        s.kappa = super::super::stability::RESOLVABLE;
        s.anisotropy = 2.0;
        assert!(s.needs_accuracy_check());
        s
    }

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn a_large_moment_cannot_mask_a_recovered_force_imbalance() {
        for constrained in [false, true] {
            let mut input = beam(false);
            input.loads = serde_json::from_value(serde_json::json!([
                {"type":"nodal","data":{"nodeId":2,"fx":1.0,"fz":0.0,"my":1e12}}
            ])).unwrap();
            if constrained {
                input.constraints = serde_json::from_value(serde_json::json!([
                    {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}
                ])).unwrap();
            }
            let mut r = super::super::linear::solve_2d(&input).unwrap();
            r.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().n_end += 1.0;
            let dof = DofNumbering::build_2d(&input);
            let fcs = super::super::constraints::FreeConstraintSystem::build_2d(&input, &dof).unwrap();
            let e = member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap_err();
            assert_eq!(e, conditional().conditioning_refusal());
        }
    }

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn a_restrained_force_cannot_mask_a_recovered_force_imbalance() {
        let mut input = beam(false);
        input.loads = serde_json::from_value(serde_json::json!([
            {"type":"nodal","data":{"nodeId":1,"fx":1e12,"fz":0.0,"my":0.0}},
            {"type":"nodal","data":{"nodeId":2,"fx":1.0,"fz":0.0,"my":0.0}}
        ])).unwrap();
        let mut r = super::super::linear::solve_2d(&input).unwrap();
        r.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().n_end += 1.0;
        let dof = DofNumbering::build_2d(&input);
        assert_eq!(member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap_err(), conditional().conditioning_refusal());
    }

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn settlement_only_recovered_forces_pass_conditional_balance() {
        let input = beam(true);
        let r = super::super::linear::solve_2d(&input).unwrap();
        assert!(r.element_forces.iter().all(|f| f.n_start.abs() > 0.0 && f.n_end.abs() > 0.0));
        let dof = DofNumbering::build_2d(&input);
        member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap();
    }

}

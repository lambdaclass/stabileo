use super::member_actions::TransverseMemberActions;
use super::assembly::InclinedFrame;
use super::{assembly, dof::DofNumbering, stability::{Stability, CONDITIONAL_ACCURACY}};
use crate::types::*;

struct IdIndex<'a, T> {
    values: std::collections::HashMap<usize, &'a T>,
    refusal: String,
}

impl<'a, T> IdIndex<'a, T> {
    fn new(values: impl Iterator<Item = &'a T>, id: impl Fn(&T) -> usize, stability: &Stability) -> Result<Self, String> {
        let mut index = Self { values: std::collections::HashMap::new(), refusal: crate::refusal::coded(DiagnosticCode::ResidualHigh, &stability.conditioning_refusal()) };
        for value in values {
            if index.values.insert(id(value), value).is_some() { return Err(index.refusal); }
        }
        Ok(index)
    }

    fn get(&self, id: usize) -> Result<&'a T, String> {
        self.values.get(&id).copied().ok_or_else(|| self.refusal.clone())
    }
}

fn check(stability: &Stability, balance: &[f64], applied: &[f64], prescribed: &[f64], roundoff: &[f64], kinds: &[super::stability::DofKind], terms: usize) -> Result<(), String> {
    let mut scales = [0.0f64; 3];
    let mut rounding = [0.0f64; 3];
    let kind_index = |kind| match kind {
        super::stability::DofKind::Translation => 0,
        super::stability::DofKind::Rotation => 1,
        super::stability::DofKind::Warping => 2,
    };
    for (i, &kind) in kinds.iter().enumerate() {
        if !applied[i].is_finite() || !prescribed[i].is_finite() || !roundoff[i].is_finite() {
            return Err(stability.conditioning_refusal());
        }
        let k = kind_index(kind);
        scales[k] = scales[k].max(applied[i].abs()).max(prescribed[i].abs());
        rounding[k] = rounding[k].max(roundoff[i]);
    }
    for (i, &kind) in kinds.iter().enumerate() {
        let k = kind_index(kind);
        let tolerance = CONDITIONAL_ACCURACY * scales[k] + 64.0 * terms as f64 * f64::EPSILON * rounding[k];
        if !balance[i].is_finite() || balance[i].abs() > tolerance {
            return Err(stability.conditioning_refusal());
        }
    }
    Ok(())
}

fn checked_balance(stability: &Stability, balance: &[f64], applied: &[f64], u: &[f64], k: &crate::linalg::sparse::CscMatrix, dof: &DofNumbering, two_d: bool, fcs: Option<&super::constraints::FreeConstraintSystem>) -> Result<(), String> {
    let nf = dof.n_free;
    let mut prescribed = u.to_vec();
    prescribed[..nf].fill(0.0);
    if let Some(fcs) = fcs { prescribed[..nf].copy_from_slice(&fcs.prescribed_free(&u[nf..])); }
    let prescribed = k.sym_mat_vec(&prescribed);
    let mut magnitude_k = k.clone();
    for v in &mut magnitude_k.values { *v = v.abs(); }
    let magnitude_u: Vec<_> = u.iter().map(|v| v.abs()).collect();
    let mut roundoff = magnitude_k.sym_mat_vec(&magnitude_u);
    for (v, f) in roundoff.iter_mut().zip(applied) { *v += f.abs(); }
    let tags = super::stability::tags(dof, two_d);
    if let Some(fcs) = fcs {
        let mut magnitude_c = fcs.c_ff.clone();
        for v in &mut magnitude_c.vals { *v = v.abs(); }
        let kinds: Vec<_> = fcs.independent_dofs().iter().map(|&i| tags[i].kind).collect();
        check(stability, &fcs.reduce_vector(&balance[..nf]), &fcs.reduce_vector(&applied[..nf]),
            &fcs.reduce_vector(&prescribed[..nf]), &magnitude_c.mul_transpose_vec(&roundoff[..nf]), &kinds, dof.n_total)
    } else {
        let kinds: Vec<_> = tags.iter().take(nf).map(|t| t.kind).collect();
        check(stability, &balance[..nf], &applied[..nf], &prescribed[..nf], &roundoff[..nf], &kinds, dof.n_total)
    }
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
    let mut member_loads: std::collections::HashMap<usize, Vec<&SolverLoad>> = std::collections::HashMap::new();
    for load in loads {
        let id = match load {
            SolverLoad::Distributed(l) => l.element_id,
            SolverLoad::PointOnElement(l) => l.element_id,
            _ => continue,
        };
        member_loads.entry(id).or_default().push(load);
    }
    let members = IdIndex::new(input.elements.values(), |e| e.id, stability)?;
    let nodes = IdIndex::new(input.nodes.values(), |n| n.id, stability)?;
    let mut ends = vec![0.0; dof.n_total];
    for f in &r.element_forces {
        let e = members.get(f.element_id)?;
        let (a, b) = (nodes.get(e.node_i)?, nodes.get(e.node_j)?);
        let (dx, dz) = (b.x - a.x, b.z - a.z);
        let length = dx.hypot(dz);
        let (c, s) = (dx / length, dz / length);
        let mut actions = TransverseMemberActions::default();
        if e.elem_type == "truss" || e.elem_type == "cable" {
            for load in member_loads.get(&e.id).into_iter().flatten() { actions.add(TransverseMemberActions::from_2d(load, length)); }
        }
        let forces = actions.complete_axial_member_forces([[-f.n_start, f.v_start, 0.0], [f.n_end, -f.v_end, 0.0]]);
        for (node, [axial, shear, _], moment) in [(e.node_i, forces[0], f.m_start), (e.node_j, forces[1], -f.m_end)] {
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
    remainder.elements = input.elements.clone();
    remainder.loads.clear();
    let full = assembly::without_artificial_stiffness(|| assembly::assemble_sparse_2d_ex(&remainder, dof, true));
    checked_balance(stability, &balance, &applied, &u, full.k_full.as_ref().unwrap(), dof, true, fcs)
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
    let sections: std::collections::HashMap<_, _> = crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();
    let mut member_loads: std::collections::HashMap<usize, Vec<&SolverLoad3D>> = std::collections::HashMap::new();
    for load in loads {
        let id = match load {
            SolverLoad3D::Distributed(l) => l.element_id,
            SolverLoad3D::PointOnElement(l) => l.element_id,
            _ => continue,
        };
        member_loads.entry(id).or_default().push(load);
    }
    let members = IdIndex::new(input.elements.values(), |e| e.id, stability)?;
    let nodes = IdIndex::new(input.nodes.values(), |n| n.id, stability)?;
    let mut ends = vec![0.0; dof.n_total];
    for f in &r.element_forces {
        let e = members.get(f.element_id)?;
        let (a, b) = (nodes.get(e.node_i)?, nodes.get(e.node_j)?);
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z,
            e.local_yx, e.local_yy, e.local_yz, e.roll_angle, input.left_hand.unwrap_or(false));
        let mut actions = TransverseMemberActions::default();
        let section = sections[&e.section_id];
        if crate::element::MemberKinematics3D::from_elem(e, section) == crate::element::MemberKinematics3D::Axial {
            let length = ((b.x-a.x).powi(2) + (b.y-a.y).powi(2) + (b.z-a.z).powi(2)).sqrt();
            for load in member_loads.get(&e.id).into_iter().flatten() { actions.add(TransverseMemberActions::from_3d(load, length)); }
        }
        let forces = actions.complete_axial_member_forces([[-f.n_start, f.vy_start, f.vz_start], [f.n_end, -f.vy_end, -f.vz_end]]);
        for (node, force, moment, bimoment) in [
            (e.node_i, forces[0], [f.mx_start, f.my_start, f.mz_start], -f.bimoment_start.unwrap_or(0.0)),
            (e.node_j, forces[1], [-f.mx_end, -f.my_end, -f.mz_end], f.bimoment_end.unwrap_or(0.0)),
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
    remainder.elements = input.elements.clone();
    remainder.loads.clear();
    let full = assembly::without_artificial_stiffness(|| assembly::assemble_sparse_3d(&remainder, dof, true));
    checked_balance(stability, &balance, &applied, &u, full.k_full.as_ref().unwrap(), dof, false, fcs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovered_balance_checks_both_sides_of_the_accuracy_limit() {
        let s = Stability::stable();
        for factor in [1.0 - 1e-4, 1.0 + 1e-4] {
            assert_eq!(check(&s, &[CONDITIONAL_ACCURACY*factor, 0.0], &[1.0, 0.0], &[0.0; 2], &[0.0; 2], &[super::super::stability::DofKind::Translation; 2], 2).is_ok(), factor < 1.0);
        }
        assert!(check(&s, &[f64::NAN], &[1.0], &[0.0], &[0.0], &[super::super::stability::DofKind::Translation], 1).is_err());
        assert!(check(&s, &[f64::INFINITY], &[1.0], &[0.0], &[0.0], &[super::super::stability::DofKind::Translation], 1).is_err());
        assert!(check(&s, &[0.0], &[0.0], &[0.0], &[0.0], &[super::super::stability::DofKind::Translation], 1).is_ok());
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
    fn settlement_only_recovered_forces_pass_conditional_balance() {
        let input = beam(true);
        let r = super::super::linear::solve_2d(&input).unwrap();
        assert!(r.element_forces.iter().all(|f| f.n_start.abs() > 0.0 && f.n_end.abs() > 0.0));
        let dof = DofNumbering::build_2d(&input);
        member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap();
    }


    fn beam3(settlement: bool) -> SolverInput3D {
        let mut v = serde_json::to_value(beam(settlement)).unwrap();
        for e in v["elements"].as_object_mut().unwrap().values_mut() {
            let e = e.as_object_mut().unwrap();
            e.remove("hingeStart"); e.remove("hingeEnd");
        }
        for n in v["nodes"].as_object_mut().unwrap().values_mut() { n["y"] = 0.0.into(); }
        v["sections"]["1"]["iy"] = 2e-4.into();
        v["sections"]["1"]["j"] = 1e-5.into();
        for sup in v["supports"].as_object_mut().unwrap().values_mut() {
            *sup = serde_json::json!({"nodeId":sup["nodeId"],"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true,"dx":sup["dx"]});
        }
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn space_balance_separates_moments_and_restrained_loads_from_free_forces() {
        for constrained in [false, true] {
            for moment in [false, true] {
                let mut input = beam3(false);
                input.loads = serde_json::from_value(serde_json::json!([
                    {"type":"nodal","data":{"nodeId":2,"fx":1.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":if moment {1e12} else {0.0},"mz":0.0}},
                    {"type":"nodal","data":{"nodeId":1,"fx":if moment {0.0} else {1e12},"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}}
                ])).unwrap();
                if constrained {
                    input.constraints = serde_json::from_value(serde_json::json!([
                        {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}
                    ])).unwrap();
                }
                let mut r = super::super::linear::solve_3d(&input).unwrap();
                let dof = DofNumbering::build_3d(&input);
                let fcs = super::super::constraints::FreeConstraintSystem::build_3d(&input, &dof).unwrap();
                member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap();
                r.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().n_end += 1.0;
                assert_eq!(member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap_err(), conditional().conditioning_refusal());
            }
        }
    }

    #[test]
    fn space_settlement_only_recovered_forces_pass_conditional_balance() {
        for constrained in [false, true] {
            let mut input = beam3(true);
            if constrained {
                input.constraints = serde_json::from_value(serde_json::json!([
                    {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}
                ])).unwrap();
            }
            let r = super::super::linear::solve_3d(&input).unwrap();
            let dof = DofNumbering::build_3d(&input);
            let fcs = super::super::constraints::FreeConstraintSystem::build_3d(&input, &dof).unwrap();
            assert!(r.element_forces.iter().all(|f| f.n_start.abs() > 0.0));
            member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap();
        }
    }

    #[test]
    fn force_moment_and_bimoment_have_independent_accuracy_scales() {
        use super::super::stability::DofKind::*;
        let kinds = [Translation, Rotation, Warping];
        for large in 0..3 {
            for small in 0..3 {
                if large == small { continue; }
                let mut applied = [1.0; 3];
                applied[large] = 1e12;
                let mut balance = [0.0; 3];
                balance[small] = 1.0;
                assert!(check(&conditional(), &balance, &applied, &[0.0; 3], &[0.0; 3], &kinds, 3).is_err());
            }
        }
    }

    #[test]
    fn conditional_public_solve_accepts_a_settlement_only_c08_model() {
        let sources: serde_json::Value = serde_json::from_str(include_str!("../../../docs/results-changes/1753-loaded-c08-inputs.json")).unwrap();
        let mut input: SolverInput = serde_json::from_value(sources["issue-1653"]["input"].clone()).unwrap();
        input.loads.clear();
        input.supports.get_mut("2").unwrap().dz = Some(0.01);
        assert!(super::super::stability::of_2d(&input).unwrap().needs_accuracy_check());
        let r = super::super::linear::solve_2d(&input).unwrap();
        assert!(r.element_forces.iter().any(|f| f.n_start.abs() > 0.0));
    }


    #[test]
    fn prescribed_master_forcing_is_included_after_constraint_reduction() {
        let constraint = serde_json::json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]}]);
        let mut input = beam(true);
        input.constraints = serde_json::from_value(constraint.clone()).unwrap();
        let r = super::super::linear::solve_2d(&input).unwrap();
        let dof = DofNumbering::build_2d(&input);
        let fcs = super::super::constraints::FreeConstraintSystem::build_2d(&input, &dof).unwrap();
        assert!(r.element_forces.iter().any(|f| f.n_start.abs() > 0.0));
        member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap();
        let mut input = beam3(true);
        input.constraints = serde_json::from_value(constraint).unwrap();
        let r = super::super::linear::solve_3d(&input).unwrap();
        let dof = DofNumbering::build_3d(&input);
        let fcs = super::super::constraints::FreeConstraintSystem::build_3d(&input, &dof).unwrap();
        assert!(r.element_forces.iter().any(|f| f.n_start.abs() > 0.0));
        member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, fcs.as_ref()).unwrap();
    }


    #[test]
    fn loads_eliminated_by_constraints_cannot_inflate_the_checked_scale() {
        let mut input = beam(false);
        input.constraints = serde_json::from_value(serde_json::json!([
            {"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[0]}
        ])).unwrap();
        input.loads = serde_json::from_value(serde_json::json!([
            {"type":"nodal","data":{"nodeId":2,"fx":1e12,"fz":1.0,"my":0.0}}
        ])).unwrap();
        let dof = DofNumbering::build_2d(&input);
        let fcs = super::super::constraints::FreeConstraintSystem::build_2d(&input, &dof).unwrap().unwrap();
        let asm = assembly::without_artificial_stiffness(|| assembly::assemble_sparse_2d_ex(&input, &dof, true));
        let mut balance = vec![0.0; dof.n_total];
        let mut applied = vec![0.0; dof.n_total];
        applied[dof.global_dof(2, 0).unwrap()] = 1e12;
        applied[dof.global_dof(2, 1).unwrap()] = 1.0;
        let u = vec![0.0; dof.n_total];
        checked_balance(&conditional(), &balance, &applied, &u, asm.k_full.as_ref().unwrap(), &dof, true, Some(&fcs)).unwrap();
        balance[dof.global_dof(2, 1).unwrap()] = 1.0;
        assert_eq!(checked_balance(&conditional(), &balance, &applied, &u, asm.k_full.as_ref().unwrap(), &dof, true, Some(&fcs)).unwrap_err(), conditional().conditioning_refusal());
    }

    #[test]
    fn force_loaded_soft_springs_pass_recovered_moment_balance_in_small_length_units() {
        let input: SolverInput = serde_json::from_value(serde_json::json!({
            "nodes":{"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":3.0,"z":0.0},"3":{"id":3,"x":3.0,"z":2.0}},
            "elements":{
                "1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
                "2":{"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}},
            "materials":{"1":{"id":1,"e":200000.0,"nu":0.3}},
            "sections":{"1":{"id":1,"a":0.01,"iz":1e-4}},
            "supports":{"1":{"id":1,"nodeId":1,"type":"spring","kx":1e-3,"ky":1e-3,"kz":1e-3}},
            "loads":[{"type":"nodal","data":{"nodeId":3,"fx":1e-6,"fz":-2e-6,"my":0.0}}]
        })).unwrap();
        let scaled = crate::metamorphic::units::scale_2d(&input, &crate::metamorphic::units::Units::froude(1e-3, 1e3));
        let rotated = crate::metamorphic::transform::transform_2d(&scaled, &crate::metamorphic::transform::Iso2::rotation(0.37)).unwrap();
        assert!(super::super::stability::of_2d(&rotated).unwrap().needs_accuracy_check());
        let result = super::super::linear::solve_2d(&rotated).unwrap();
        let end = result.element_forces.iter().find(|f| f.element_id == 2).unwrap();
        assert!(end.m_end.abs() <= CONDITIONAL_ACCURACY * 2e-6);
    }

    #[test]
    fn sparse_balance_assemblies_omit_artificial_rotation_and_warping_springs() {
        let mut input = beam(false);
        let dof = DofNumbering::build_2d(&input);
        input.elements.clear();
        let assemble = || assembly::assemble_sparse_2d_ex(&input, &dof, true).k_full.unwrap().diagonal();
        let legacy = assemble();
        let physical = assembly::without_artificial_stiffness(assemble);
        let i = dof.global_dof(2, 2).unwrap();
        assert!(legacy[i] > 0.0);
        assert_eq!(physical[i], 0.0);
        for warping in [false, true] {
            let mut input = beam3(false);
            if warping { input.sections.get_mut("1").unwrap().cw = Some(1e-6); }
            let dof = DofNumbering::build_3d(&input);
            input.elements.clear();
            let sequential = || assembly::assemble_sparse_3d(&input, &dof, true).k_full.unwrap().diagonal();
            let parallel = || super::super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(&input, &dof, true).k_full.unwrap().diagonal();
            let legacy = parallel();
            let physical = assembly::without_artificial_stiffness(parallel);
            let sequential_physical = assembly::without_artificial_stiffness(sequential);
            for local in 3..dof.dofs_per_node {
                let i = dof.global_dof(2, local).unwrap();
                assert!(legacy[i] > 0.0);
                assert_eq!(physical[i], 0.0);
                assert_eq!(sequential_physical[i], 0.0);
            }
        }
    }

    fn member_action_cases(kind: &str, which: usize, dimension: usize) {
        for (index, load) in [
            serde_json::json!({"type":"distributed","data":{"elementId":1,"qI":-3.0,"qJ":5.0,"a":0.5,"b":1.5}}),
            serde_json::json!({"type":"pointOnElement","data":{"elementId":1,"p":-3.0,"px":5.0,"a":0.5}}),
            serde_json::json!({"type":"axialDistributed","data":{"elementId":1,"qI":-3.0,"qJ":5.0,"a":0.5,"b":1.5}}),
            serde_json::json!({"type":"thermal","data":{"elementId":1,"dtUniform":3.0,"dtGradient":0.0}}),
        ].into_iter().enumerate() {
            if which != index { continue; }
            let mut variants = vec![load.clone()];
            if which == 0 {
                for span in [1e-15*(1.0-1e-4), 1e-15*(1.0+1e-4), 2.0] {
                    let mut v = load.clone();
                    v["data"]["a"] = 0.0.into();
                    v["data"]["b"] = span.into();
                    variants.push(v);
                }
                for q in [-3.0, 0.0, 3.0] {
                    let mut v = load.clone();
                    v["data"]["qI"] = q.into();
                    v["data"]["qJ"] = (-q).into();
                    variants.push(v);
                }
            }
            if which == 1 {
                for a in [0.0, 2.0] {
                    let mut v = load.clone(); v["data"]["a"] = a.into(); variants.push(v);
                }
            }
            for load in variants {
            let mut input = beam(false);
            input.elements.get_mut("1").unwrap().elem_type = kind.into();
            input.loads = serde_json::from_value(serde_json::json!([load])).unwrap();
            let mut r = super::super::linear::solve_2d(&input).unwrap();
            let dof = DofNumbering::build_2d(&input);
            if dimension == 2 {
            member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap();
            r.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().n_end += 1.0;
            assert_eq!(member_balance_2d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap_err(), conditional().conditioning_refusal());
            } else {
            for plane in [crate::metamorphic::planes::Plane::XZ, crate::metamorphic::planes::Plane::XY, crate::metamorphic::planes::Plane::YZ] {
                let input = crate::metamorphic::planes::embed_2d(&input, plane).unwrap();
                let mut r = super::super::linear::solve_3d(&input).unwrap();
                let dof = DofNumbering::build_3d(&input);
                member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap();
                r.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().n_end += 1.0;
                assert_eq!(member_balance_3d(&input, &input.loads, &dof, &conditional(), &r, None).unwrap_err(), conditional().conditioning_refusal());
            }
            }
            }
        }
    }

    #[test]
    fn truss_distributed_actions_2d() {
        for kind in ["truss"] {
            member_action_cases(kind, 0, 2);
        }
    }

    #[test]
    fn truss_distributed_actions_3d() {
        for kind in ["truss"] {
            member_action_cases(kind, 0, 3);
        }
    }

    #[test]
    fn truss_point_actions_2d() {
        for kind in ["truss"] {
            member_action_cases(kind, 1, 2);
        }
    }

    #[test]
    fn truss_point_actions_3d() {
        for kind in ["truss"] {
            member_action_cases(kind, 1, 3);
        }
    }

    #[test]
    fn axial_and_thermal_actions_still_balance() {
        for kind in ["truss"] {
            for load in [2, 3] {
                for dimension in [2, 3] {
                    member_action_cases(kind, load, dimension);
                }
            }
        }
    }

    #[test]
    fn frame_member_actions_pass_but_corrupted_axial_forces_refuse() {
        for load in 0..4 {
            for dimension in [2, 3] {
                member_action_cases("frame", load, dimension);
            }
        }
    }
    #[test]
    fn nightly_plastic_input_and_minimum_never_panic() {
        let raw = include_bytes!("../../tests/fixtures/plastic-1953-nightly.bin");
        let original: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        let minimum: PlasticInput3D = serde_json::from_str(include_str!("../../tests/fixtures/plastic-1953-min.json")).unwrap();
        for input in [original, minimum] {
            let mut canonical = input.solver.clone();
            canonical.elements = canonical.elements.into_values().map(|e| (e.id.to_string(), e)).collect();
            let expected = super::super::linear::solve_3d(&canonical).unwrap();
            let actual = super::super::linear::solve_3d(&input.solver).unwrap();
            assert_eq!(serde_json::to_value(&actual.element_forces).unwrap(), serde_json::to_value(&expected.element_forces).unwrap());
            let result = super::super::plastic::solve_plastic_3d_incremental(&input).unwrap();
            assert!(result.collapse_factor > 0.0);
            assert!(result.is_mechanism);
            assert!(result.warnings.iter().any(|w| w.contains("biaxial")));
            let mut canonical_input = input.clone();
            canonical_input.solver = canonical;
            let reference = super::super::plastic::solve_plastic_3d_incremental(&canonical_input).unwrap();
            assert_eq!(result.collapse_factor, reference.collapse_factor);
            let error = super::super::plastic::solve_plastic_3d(&input).unwrap_err();
            assert!(error.contains("local axes are not rational"), "{error}");
            assert_eq!(error, super::super::plastic::solve_plastic_3d(&canonical_input).unwrap_err());
        }
    }

    #[test]
    fn balance_uses_member_and_node_ids_from_the_solved_model() {
        for altered in [false, true] {
            let mut input = beam(true);
            if altered {
                input.sections.get_mut("1").unwrap().iz *= 2.0;
                input.elements.get_mut("1").unwrap().hinge_end = true;
            }
            let result = super::super::linear::solve_2d(&input).unwrap();
            input.elements = input.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
            input.nodes = input.nodes.into_values().map(|n| (format!("node-{}", n.id), n)).collect();
            let dof = DofNumbering::build_2d(&input);
            member_balance_2d(&input, &input.loads, &dof, &conditional(), &result, None).unwrap();
            let mut input = beam3(true);
            if altered {
                input.sections.get_mut("1").unwrap().iy *= 2.0;
                input.elements.get_mut("1").unwrap().release_my_end = true;
            }
            let result = super::super::linear::solve_3d(&input).unwrap();
            input.elements = input.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
            input.nodes = input.nodes.into_values().map(|n| (format!("node-{}", n.id), n)).collect();
            let dof = DofNumbering::build_3d(&input);
            member_balance_3d(&input, &input.loads, &dof, &conditional(), &result, None).unwrap();
        }
    }

    #[test]
    fn missing_recovered_members_return_the_structured_conditioning_refusal() {
        let input = beam(true);
        let mut result = super::super::linear::solve_2d(&input).unwrap();
        result.element_forces[0].element_id = usize::MAX;
        let dof = DofNumbering::build_2d(&input);
        let error = member_balance_2d(&input, &input.loads, &dof, &conditional(), &result, None).unwrap_err();
        assert_eq!(error, crate::refusal::coded(DiagnosticCode::ResidualHigh, &conditional().conditioning_refusal()));
        let refusal: serde_json::Value = serde_json::from_str(&error).unwrap();
        assert_eq!(refusal["structuredDiagnostics"][0]["code"], "residual_high");
        assert_eq!(refusal["structuredDiagnostics"][0]["severity"], "error");
        assert!(crate::known_issues::optional_solve::<()>(Err(error.clone())).is_err());
        let input = beam3(true);
        let mut result = super::super::linear::solve_3d(&input).unwrap();
        result.element_forces[0].element_id = usize::MAX;
        let dof = DofNumbering::build_3d(&input);
        assert_eq!(member_balance_3d(&input, &input.loads, &dof, &conditional(), &result, None).unwrap_err(), error);
    }

    #[test]
    fn conditional_rekeyed_models_reach_direct_prepared_typed_and_constraint_paths() {
        let sources: serde_json::Value = serde_json::from_str(include_str!("../../../docs/results-changes/1753-loaded-c08-inputs.json")).unwrap();
        let plane: SolverInput = serde_json::from_value(sources["issue-1653"]["input"].clone()).unwrap();
        for substituted in [false, true] {
            let mut input = plane.clone();
            if substituted { for section in input.sections.values_mut() { section.iz *= 2.0; } }
            assert!(super::super::stability::of_2d(&input).unwrap().needs_accuracy_check());
            let reference = super::super::linear::solve_2d(&input).unwrap();
            input.elements = input.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
            let actual = super::super::linear::solve_2d(&input).unwrap();
            assert_eq!(serde_json::to_value(&actual.element_forces).unwrap(), serde_json::to_value(&reference.element_forces).unwrap());
            let typed: crate::types::units::ElasticInput2D = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
            let typed_result = super::super::linear::solve_2d_typed(&typed).unwrap();
            assert_eq!(serde_json::to_value(&typed_result.element_forces).unwrap(), serde_json::to_value(&reference.element_forces).unwrap());
            let prepared = super::super::linear::prepare_static_2d(&input).unwrap();
            let prepared_result = prepared.solve_loads(&input.loads).unwrap();
            assert_eq!(serde_json::to_value(&prepared_result.element_forces).unwrap(), serde_json::to_value(&reference.element_forces).unwrap());
            let dense = super::super::linear::prepare_static_2d_dense_reference(&input).unwrap();
            dense.solve_loads(&input.loads).unwrap();
        }
        for space in [false, true] {
            for substituted in [false, true] {
                if !space {
                    let mut input = beam(true);
                    if substituted { input.sections.get_mut("1").unwrap().a *= 2.0; }
                    input.constraints = serde_json::from_value(serde_json::json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}])).unwrap();
                    input.elements = input.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
                    let dof = DofNumbering::build_2d(&input);
                    let fcs = super::super::constraints::FreeConstraintSystem::build_2d(&input, &dof).unwrap();
                    let constrained = super::super::constraints::ConstrainedInput { solver: input.clone(), constraints: input.constraints.clone() };
                    let dense = super::super::constraints::solve_constrained_2d_dense(&constrained, &dof).unwrap();
                    let sparse = super::super::constraints::solve_constrained_2d_sparse(&constrained, &dof).unwrap().unwrap();
                    for mut result in [dense, sparse] {
                        member_balance_2d(&input, &input.loads, &dof, &conditional(), &result, fcs.as_ref()).unwrap();
                        result.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().m_end += 1.0;
                        assert!(member_balance_2d(&input, &input.loads, &dof, &conditional(), &result, fcs.as_ref()).is_err());
                    }
                } else {
                    let mut input = beam3(true);
                    if substituted { input.sections.get_mut("1").unwrap().a *= 2.0; }
                    input.constraints = serde_json::from_value(serde_json::json!([{"type":"equalDOF","masterNode":1,"slaveNode":2,"dofs":[1]}])).unwrap();
                    input.elements = input.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
                    let dof = DofNumbering::build_3d(&input);
                    let fcs = super::super::constraints::FreeConstraintSystem::build_3d(&input, &dof).unwrap();
                    let mut result = super::super::linear::solve_3d(&input).unwrap();
                    member_balance_3d(&input, &input.loads, &dof, &conditional(), &result, fcs.as_ref()).unwrap();
                    result.element_forces.iter_mut().find(|f| f.element_id == 1).unwrap().my_end += 1.0;
                    assert!(member_balance_3d(&input, &input.loads, &dof, &conditional(), &result, fcs.as_ref()).is_err());
                }
            }
        }
    }

    #[test]
    fn plastic_and_second_order_entries_preserve_their_model_identity() {
        let sources: serde_json::Value = serde_json::from_str(include_str!("../../../docs/results-changes/1753-loaded-c08-inputs.json")).unwrap();
        let plane: SolverInput = serde_json::from_value(sources["issue-1653"]["input"].clone()).unwrap();
        let fixture: PlasticInput3D = serde_json::from_str(include_str!("../../tests/fixtures/plastic-1953-min.json")).unwrap();
        let mut space = fixture.solver.clone();
        space.elements = space.elements.into_values().map(|e| (e.id.to_string(), e)).collect();
        let mut rekeyed_plane = plane.clone();
        rekeyed_plane.elements = rekeyed_plane.elements.into_values().map(|e| (format!("member-{}", e.id), e)).collect();
        let mut sections = serde_json::Map::new();
        let mut overrides = serde_json::Map::new();
        for (key, section) in &plane.sections {
            let material = plane.elements.values().find(|e| e.section_id == section.id).unwrap().material_id;
            sections.insert(key.clone(), serde_json::json!({"a":section.a,"iz":section.iz,"materialId":material}));
            overrides.insert(key.clone(), serde_json::json!(1.0));
        }
        let make_plastic = |solver: &SolverInput| -> PlasticInput {
            serde_json::from_value(serde_json::json!({"solver":solver,"sections":sections,"materials":fixture.materials,"mpOverrides":overrides,"maxHinges":1})).unwrap()
        };
        let canonical = make_plastic(&plane);
        let rekeyed = make_plastic(&rekeyed_plane);
        let blocked = super::super::plastic::solve_plastic_2d(&rekeyed).unwrap_err();
        assert!(crate::known_issues::is_refusal(&blocked));
        assert!(blocked.contains("PL-2D-INVARIANCE"));
        let expected = super::super::plastic::solve_plastic_2d_unrefused(&canonical).unwrap();
        let actual = super::super::plastic::solve_plastic_2d_unrefused(&rekeyed).unwrap();
        assert_eq!(actual.collapse_factor, expected.collapse_factor);
        let mut expected = super::super::pdelta::solve_pdelta_2d(&plane, 4, CONDITIONAL_ACCURACY).unwrap();
        let mut actual = super::super::pdelta::solve_pdelta_2d(&rekeyed_plane, 4, CONDITIONAL_ACCURACY).unwrap();
        actual.results.element_forces.sort_by_key(|f| f.element_id);
        expected.results.element_forces.sort_by_key(|f| f.element_id);
        assert_eq!(serde_json::to_value(&actual.results.element_forces).unwrap(), serde_json::to_value(&expected.results.element_forces).unwrap());
        let prepared = super::super::linear::prepare_static_3d(&fixture.solver).unwrap();
        let result = prepared.solve_loads(&fixture.solver.loads).unwrap();
        let reference = super::super::linear::solve_3d(&space).unwrap();
        assert_eq!(serde_json::to_value(result.element_forces).unwrap(), serde_json::to_value(reference.element_forces).unwrap());
        let mut expected = super::super::pdelta::solve_pdelta_3d(&space, 4, CONDITIONAL_ACCURACY).unwrap();
        let mut actual = super::super::pdelta::solve_pdelta_3d(&fixture.solver, 4, CONDITIONAL_ACCURACY).unwrap();
        actual.results.element_forces.sort_by_key(|f| f.element_id);
        expected.results.element_forces.sort_by_key(|f| f.element_id);
        assert_eq!(serde_json::to_value(actual.results.element_forces).unwrap(), serde_json::to_value(expected.results.element_forces).unwrap());
    }

    #[test]
    fn colliding_object_keys_cannot_substitute_another_members_geometry() {
        let mut plane = beam(true);
        plane.loads = serde_json::from_value(serde_json::json!([{"type":"nodal","data":{"nodeId":2,"fx":0.0,"fz":1.0,"my":0.0}}])).unwrap();
        let result = super::super::linear::solve_2d(&plane).unwrap();
        let dof = DofNumbering::build_2d(&plane);
        plane.elements = plane.elements.into_values().map(|e| ((3 - e.id).to_string(), e)).collect();
        member_balance_2d(&plane, &plane.loads, &dof, &conditional(), &result, None).unwrap();
        let mut space = beam3(true);
        space.loads = serde_json::from_value(serde_json::json!([{"type":"nodal","data":{"nodeId":2,"fx":0.0,"fy":1.0,"fz":1.0,"mx":0.0,"my":0.0,"mz":0.0}}])).unwrap();
        let result = super::super::linear::solve_3d(&space).unwrap();
        let dof = DofNumbering::build_3d(&space);
        space.elements = space.elements.into_values().map(|e| ((3 - e.id).to_string(), e)).collect();
        member_balance_3d(&space, &space.loads, &dof, &conditional(), &result, None).unwrap();
    }

}

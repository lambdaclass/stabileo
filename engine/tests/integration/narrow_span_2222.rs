use dedaliano_engine::{element::*, metamorphic::planes::{embed_2d, Plane}, postprocess::{diagrams::compute_diagram_value_at, diagrams_3d::evaluate_diagram_3d_at}, solver::{linear, pdelta, corotational}, types::*};

fn witness() -> SolverInput {
    serde_json::from_str(include_str!("../fixtures/narrow-span-2222.json")).unwrap()
}

fn near(a: f64, b: f64) {
    assert!((a-b).abs() <= 1e-10 * b.abs().max(1.0), "{a} != {b}");
}

fn check(r: &AnalysisResults) {
    near(r.reactions.iter().find(|r| r.node_id == 1).unwrap().rz, 27.0/32.0);
    near(r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz, -0.0005625);
    if let Some(eq) = &r.equilibrium { near(eq.applied_force_sum[1], -1.0); }
    let ef = r.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    near(compute_diagram_value_at("shear", 0.9, ef), ef.v_start-1.0);
    near(compute_diagram_value_at("moment", 0.9, ef), ef.m_start-ef.v_start*2.7+1.2);
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_native_linear_entry_points() {
    let input = witness();
    check(&linear::solve_2d(&input).unwrap());
    check(&linear::solve_2d_typed(&serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap()).unwrap());
    check(&linear::prepare_static_2d(&input).unwrap().solve_loads(&input.loads).unwrap());
    check(&linear::prepare_static_2d_dense_reference(&input).unwrap().solve_loads(&input.loads).unwrap());
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_native_nonlinear_entry_points() {
    let input = witness();
    check(&pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().linear_results);
    let mut point = input.clone();
    point.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id:1, a:1.5, p:-1.0, px:None, my:None })];
    let reference = corotational::solve_corotational_2d(&point,40,1e-9,1,false).unwrap().results;
    let result = corotational::solve_corotational_2d(&input,40,1e-9,1,false).unwrap().results;
    for (a,b) in result.displacements.iter().zip(reference.displacements) { near(a.uz,b.uz); }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_native_space_both_planes() {
    for plane in [Plane::XY, Plane::XZ] {
        let input = embed_2d(&witness(), plane).unwrap();
        let ref_input = embed_2d(&{
            let mut i = witness();
            i.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id:1, a:1.5, p:-1.0, px:None, my:None })]; i
        }, plane).unwrap();
        let reference = linear::solve_3d(&ref_input).unwrap();
        for r in [linear::solve_3d(&input).unwrap(), linear::prepare_static_3d(&input).unwrap().solve_loads(&input.loads).unwrap(), pdelta::solve_pdelta_3d(&input,20,1e-9).unwrap().linear_results, corotational::solve_corotational_3d(&input,40,1e-9,1,false).unwrap().results] {
            for (a,b) in r.displacements.iter().zip(&reference.displacements) { near(a.uy,b.uy); near(a.uz,b.uz); }
            let f = &r.element_forces[0]; let rf = &reference.element_forces[0];
            for kind in ["momentY","momentZ","shearY","shearZ"] {
                near(evaluate_diagram_3d_at(f,kind,0.9),evaluate_diagram_3d_at(rf,kind,0.9));
            }
            if let Some(eq) = &r.equilibrium { let total: f64 = eq.applied_force_sum[..3].iter().map(|x| x.abs()).sum(); near(total,1.0); }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_partial_width_class_and_normal_control() {
    for width in [0.0, 1e-15, 0.5e-12, 1e-12, 1.5e-12, 1e-10, 1e-8, 1e-6] {
        for start in [0.0,1.5,3.0-width] {
            let end = start+width;
            for ratio in [1.0,0.0,-1.0] {
                let span = end-start;
                let qi = if span == 0.0 {-7.0} else {-1.0/span};
                let qj = ratio*qi;
                let total = qi*span/2.0+qj*span/2.0;
                let first = (qi*span/2.0)*(start+span/3.0)+(qj*span/2.0)*(start+2.0*span/3.0);
                for phi in [0.0,0.7] {
                    let f = fef_partial_distributed_2d(qi,qj,start,end,3.0,phi);
                    near(f[1]+f[4],total);
                    near(f[2]+3.0*f[4]+f[5],first);
                    let f3=fef_partial_distributed_3d(qi,qj,qi,qj,start,end,3.0,phi,phi);
                    near(f3[1]+f3[7],total); near(f3[2]+f3[8],total);
                    near(f3[5]+3.0*f3[7]+f3[11],first);
                    near(-f3[4]+3.0*f3[8]-f3[10],first);
                }
            }
        }
    }
    for (qi,qj) in [(-2.0,-2.0),(-2.0,-5.0),(-2.0,2.0)] {
        let full=fef_distributed_2d(qi,qj,3.0,0.7);
        let partial=fef_partial_distributed_2d(qi,qj,0.0,3.0,3.0,0.7);
        for (a,b) in full.into_iter().zip(partial) { near(a,b); }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_recovered_diagrams_keep_narrow_resultants() {
    for width in [0.5e-12,1.5e-12,1e-8,1e-6] {
        for a in [0.0,1.5,3.0-width] {
            let b=a+width;
            for ratio in [0.0,1.0,-1.0] {
                let mut i=witness();
                let qi=-1.0/(b-a); let qj=qi*ratio;
                i.loads=vec![SolverLoad::Distributed(SolverDistributedLoad{element_id:1,q_i:qi,q_j:qj,a:Some(a),b:Some(b)})];
                let r=linear::solve_2d(&i).unwrap(); let f=&r.element_forces[0];
                let total=(qi*(b-a)/2.0)+(qj*(b-a)/2.0);
                near(compute_diagram_value_at("shear",1.0+1e-5,f),f.v_start+total);
                for plane in [Plane::XY,Plane::XZ] {
                    let r=linear::solve_3d(&embed_2d(&i,plane).unwrap()).unwrap(); let f=&r.element_forces[0];
                    let expected=if matches!(plane,Plane::XY) {total} else {0.0};
                    near(evaluate_diagram_3d_at(f,"shearY",1.0+1e-5),f.vy_start+expected);
                }
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_nonfinite_resultants_are_refused() {
    let mut i=witness();
    i.loads=vec![SolverLoad::Distributed(SolverDistributedLoad{element_id:1,q_i:f64::MAX,q_j:f64::MAX,a:Some(0.0),b:Some(3.0)})];
    assert!(linear::solve_2d(&i).unwrap_err().contains("resultant"));
    assert!(linear::solve_3d(&embed_2d(&i,Plane::XY).unwrap()).unwrap_err().contains("resultant"));
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_narrow_opposing_load_retains_its_finite_couple() {
    for a in [0.0,1.5] {
        let b=a+0.5e-12; let span=b-a;
        let q=6.0/span/span;
        for phi in [0.0,0.7] {
            let f=fef_partial_distributed_2d(-q,q,a,b,3.0,phi);
            let expected=fef_point_load_2d(0.0,0.0,1.0,a+span/2.0,3.0,phi);
            for (x,y) in f.into_iter().zip(expected) { near(x,y); }
        }
    }
}

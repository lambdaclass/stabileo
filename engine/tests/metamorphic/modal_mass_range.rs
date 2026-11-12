use dedaliano_engine::{certify::modal::{self as certified, ModalCertificate}, solver::modal, types::*};
use serde_json::{json, Value};
use std::collections::HashMap;

fn family(spatial: bool, copies: usize, constrained: bool, padding: usize, split: f64) -> Value {
    let mut nodes = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut masses = vec![];
    let mut constraints = vec![];
    for id in 1..=copies * 2 + padding {
        nodes.insert(id.to_string(), if spatial { json!({"id":id,"x":id as f64,"y":0.0,"z":0.0}) } else { json!({"id":id,"x":id as f64,"z":0.0}) });
        let k = if id > 2 && id <= copies*2 { 1.0 + split } else { 1.0 };
        let support = if spatial {
            json!({"nodeId":id,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":k,"ky":k,"kz":k,"krx":k,"kry":k,"krz":k})
        } else {
            json!({"id":id,"nodeId":id,"type":"spring","kx":k,"ky":k,"kz":k})
        };
        supports.insert(id.to_string(), support);
    }
    for copy in 0..copies {
        let source = 2*copy+1;
        let target = source+1;
        masses.push(json!({"nodeId":source,"massX":1.0}));
        if constrained {
            constraints.push(json!({"type":"linearMPC","terms":[
                {"nodeId":source,"dof":0,"coefficient":1.0},
                {"nodeId":target,"dof":0,"coefficient":-0.3},
                {"nodeId":target,"dof":1,"coefficient":-0.7},
                {"nodeId":target,"dof":2,"coefficient":-0.9}
            ]}));
        }
    }
    json!({"nodes":nodes,"supports":supports,"materials":{},"sections":{},"elements":{},"loads":[],"constraints":constraints,"masses":{"nodal":masses}})
}

fn check_certificate(c: &ModalCertificate, expected: &[f64]) {
    let ModalCertificate::Certified { modes, complete_modes, .. } = c else { panic!("{c:?}") };
    assert_eq!(modes.len(), expected.len());
    assert_eq!(*complete_modes, expected.len());
    for (mode, value) in modes.iter().zip(expected) {
        assert!(mode.omega2_lower <= *value && *value <= mode.omega2_upper, "{mode:?} excludes {value}");
    }
}

fn check(spatial: bool, value: Value, expected: &[f64]) {
    let densities = HashMap::new();
    let (raw, cert, certificate) = if spatial {
        let input: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
        let raw = modal::solve_modal_3d(&input, &densities, expected.len()+3).unwrap();
        let cert = certified::certify_modal_3d(&input, &densities, expected.len()+3).unwrap();
        (raw.modes.iter().map(|m| m.omega.powi(2)).collect::<Vec<_>>(), cert.results.modes.iter().map(|m| m.omega.powi(2)).collect::<Vec<_>>(), cert.certificate)
    } else {
        let input: SolverInput = serde_json::from_value(value.clone()).unwrap();
        let raw = modal::solve_modal_2d(&input, &densities, expected.len()+3).unwrap();
        let cert = certified::certify_modal_2d(&input, &densities, expected.len()+3).unwrap();
        (raw.modes.iter().map(|m| m.omega.powi(2)).collect::<Vec<_>>(), cert.results.modes.iter().map(|m| m.omega.powi(2)).collect::<Vec<_>>(), cert.certificate)
    };
    assert_eq!(raw.len(), expected.len());
    assert_eq!(raw, cert);
    for (got, want) in raw.iter().zip(expected) {
        assert!((got-want).abs() <= 1e-12 * want.abs(), "{got} != {want}");
    }
    check_certificate(&certificate, expected);
    if let Ok(path) = std::env::var("MODAL_MASS_RANGE_CASES") {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path).unwrap();
        writeln!(file, "{}", json!({"spatial":spatial,"input":{"solver":value,"densities":densities},"expected":expected})).unwrap();
    }
}

#[test]
#[ignore = "known wrong result: #1965"]
fn issue_1965_rank_one_and_two_constrained_modal_entry_points() {
    let lambda = 1.0 + 1.0/(0.3_f64.powi(2)+0.7_f64.powi(2)+0.9_f64.powi(2));
    for spatial in [false, true] {
        for copies in [1,2] {
            for split in [0.0, 1e-7, 1.0] {
                let expected: Vec<_> = (0..copies).map(|i| lambda * if i == 0 { 1.0 } else { 1.0+split }).collect();
                check(spatial, family(spatial,copies,true,0,split), &expected);
                let control: Vec<_> = (0..copies).map(|i| if i == 0 { 1.0 } else { 1.0+split }).collect();
                check(spatial, family(spatial,copies,false,0,split), &control);
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #1965"]
fn issue_1965_sparse_modal_preserves_physical_rank() {
    let lambda = 1.0 + 1.0/(0.3_f64.powi(2)+0.7_f64.powi(2)+0.9_f64.powi(2));
    for spatial in [false,true] {
        for padding in [18,19,20,25,26,27,64,65,66] {
            check(spatial, family(spatial,2,true,padding,1e-7), &[lambda,lambda*(1.0+1e-7)]);
        }
    }
}

#[test]
#[ignore = "known wrong result: #1965"]
fn issue_1965_3d_units_boundary_preserves_finite_modes() {
    use dedaliano_engine::metamorphic::units::{scale_3d, Units};
    let base: SolverInput3D = serde_json::from_value(family(true,2,true,0,1e-7)).unwrap();
    let lambda = 1.0 + 1.0/(0.3_f64.powi(2)+0.7_f64.powi(2)+0.9_f64.powi(2));
    for length in [1e-3_f64.next_down(),1e-3,1e-3_f64.next_up(),1.0,1e3_f64.next_down(),1e3,1e3_f64.next_up()] {
        let units = Units { length, force: 1.0, time: 1.0 };
        check(true, serde_json::to_value(scale_3d(&base,&units)).unwrap(), &[lambda,lambda*(1.0+1e-7)]);
    }
}

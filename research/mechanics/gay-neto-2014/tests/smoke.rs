use risers_gay_neto_2014::{input, model::Model, TUTORIAL01};

#[test]
fn tutorial01_tip() {
    let m = Model::from_input(&input::parse(TUTORIAL01).unwrap()).unwrap();
    let s = m.run(1, |s, _| println!("t={:.2} B={:?}", s.t, s.x[10])).unwrap();
    println!("final {:?}", s.x[10]);
}

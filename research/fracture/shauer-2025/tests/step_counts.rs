use phasefield_shauer_2025::{examples::NotchedPlate, solver::Solver};

#[test]
fn browser_load_step_options_match_accumulated_solver_time() {
    for (dt, count) in [(0.005, 159), (0.01, 79), (0.02, 39), (0.03, 26), (0.06, 13)] {
        let mut plate = NotchedPlate::reference();
        plate.mesh.nx = 4;
        plate.mesh.ny = 4;
        plate.mesh.nx_fine = 2;
        plate.mesh.ny_fine = 0;
        plate.top_displacement = 0.0;
        plate.controls.dt = dt;
        let mut solver = Solver::new(plate.problem().unwrap()).unwrap();
        let steps = solver.run(|_, _| {}).unwrap();
        assert_eq!(steps.len(), count, "dt={dt}");
        assert_eq!(steps.last().unwrap().step, count - 1);
    }
}

//! Metamorphic fuzzing (docs/verification/METAMORPHIC.md): any model the
//! linear solver accepts must give the same physical answer after a rigid
//! motion, a renumbering and a change of units, within the tolerance its
//! conditioning allows. Input: selector byte (which transform and seed),
//! parameter byte (unused), JSON model text.
#![no_main]

use dedaliano_engine::metamorphic::compare::{compare, flat_2d, flat_3d, Parts};
use dedaliano_engine::metamorphic::conditioning::{self, INCONCLUSIVE};
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::{map_results_2d, map_results_3d, transform_2d, transform_3d, Iso2, Iso3};
use dedaliano_engine::metamorphic::units::{scale_2d, scale_3d, scale_results_2d, scale_results_3d, Units};
use dedaliano_engine::metamorphic::Rng;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use dedaliano_engine_fuzz::{split, within_bounds};
use libfuzzer_sys::fuzz_target;

fn check(label: &str, got: Result<dedaliano_engine::metamorphic::compare::Report, String>, rel: f64) {
    if rel <= INCONCLUSIVE {
        if let Err(e) = got {
            panic!("metamorphic violation ({label}): {e}");
        }
    }
}

fuzz_target!(|data: &[u8]| {
    let Some((sel, _, json)) = split(data) else { return };
    let mut rng = Rng::new(sel as u64);
    if let Ok(s) = serde_json::from_str::<SolverInput3D>(json) {
        if !within_bounds(&s) {
            return;
        }
        let (Ok(base), Ok(c)) = (linear::solve_3d(&s), conditioning::of_3d(&s)) else { return };
        let rel = c.rel();
        match sel % 3 {
            0 => {
                let iso = if sel & 4 != 0 { Iso3::random(&mut rng) } else { Iso3::axis_permutation(sel as usize) }.translated([rng.range(-20.0, 20.0), 0.0, 1.0]);
                let Ok(t) = transform_3d(&s, &iso) else { return };
                let r = linear::solve_3d(&t).unwrap_or_else(|e| panic!("rotated model refused: {e}"));
                // The translation can move a small model far from the origin:
                // the tolerance is the worse conditioning of the two models.
                let Ok(ct) = conditioning::of_3d(&t) else { return };
                let c = c.worst(&ct);
                let rel = c.rel();
                check("rotation", compare(&flat_3d(&r, Parts::ALL), &flat_3d(&map_results_3d(&base, &iso), Parts::ALL), c.lchar, rel), rel);
            }
            1 => {
                let rl = Relabel::random_3d(&s, sel as u64);
                let Ok(r) = linear::solve_3d(&rl.apply_3d(&s, sel as u64)) else { panic!("relabelled model refused") };
                check("relabel", compare(&flat_3d(&r, Parts::ALL), &flat_3d(&rl.map_results_3d(&base), Parts::ALL), c.lchar, rel), rel);
            }
            _ => {
                let u = Units::froude(0.001, 1000.0);
                let Ok(r) = linear::solve_3d(&scale_3d(&s, &u)) else { panic!("rescaled model refused") };
                check("units", compare(&flat_3d(&r, Parts::ALL), &flat_3d(&scale_results_3d(&base, &u), Parts::ALL), c.lchar * u.length, rel), rel);
            }
        }
    } else if let Ok(s) = serde_json::from_str::<SolverInput>(json) {
        if !within_bounds(&s) {
            return;
        }
        let (Ok(base), Ok(c)) = (linear::solve_2d(&s), conditioning::of_2d(&s)) else { return };
        let rel = c.rel();
        match sel % 3 {
            0 => {
                let iso = if sel & 4 != 0 { Iso2::mirror_line(rng.range(0.0, 3.1)) } else { Iso2::rotation(rng.range(0.0, 6.2)) }.translated(rng.range(-20.0, 20.0), 3.0);
                // transform_2d refuses what a rigid motion cannot represent
                // (axis-bound supports, ...); a representable copy that then
                // fails to solve is a violation, as in 3D.
                let Ok(t) = transform_2d(&s, &iso) else { return };
                let r = linear::solve_2d(&t).unwrap_or_else(|e| panic!("rigidly moved model refused: {e}"));
                let Ok(ct) = conditioning::of_2d(&t) else { return };
                let c = c.worst(&ct);
                let rel = c.rel();
                check("rigid motion", compare(&flat_2d(&r, Parts::ALL), &flat_2d(&map_results_2d(&base, &iso), Parts::ALL), c.lchar, rel), rel);
            }
            1 => {
                let rl = Relabel::random_2d(&s, sel as u64);
                let Ok(r) = linear::solve_2d(&rl.apply_2d(&s, sel as u64)) else { panic!("relabelled model refused") };
                check("relabel", compare(&flat_2d(&r, Parts::ALL), &flat_2d(&rl.map_results_2d(&base), Parts::ALL), c.lchar, rel), rel);
            }
            _ => {
                let u = Units::froude(0.001, 1000.0);
                let Ok(r) = linear::solve_2d(&scale_2d(&s, &u)) else { panic!("rescaled model refused") };
                check("units", compare(&flat_2d(&r, Parts::ALL), &flat_2d(&scale_results_2d(&base, &u), Parts::ALL), c.lchar * u.length, rel), rel);
            }
        }
    }
});

//! Plastic-collapse entry points of the WASM layer (engine/src/lib.rs) on
//! arbitrary bytes: the incremental solver and the exact-arithmetic collapse
//! certificate, 2D and 3D. Input: selector byte, parameter byte, JSON text.
#![no_main]

use dedaliano_engine::certify::{plastic as cplastic, plastic_3d as cplastic3};
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use dedaliano_engine_fuzz::{run, split};
use libfuzzer_sys::fuzz_target;

/// The 3D collapse certificate's exact LPs grow fast with size: the 24-member
/// grid slab template runs for over 25 minutes natively (reported in
/// docs/verification/FUZZ_MUTANTS.md), so the fuzzer keeps 3D models small.
const MAX_3D_SOLVE: usize = 40;
const MAX_3D_CERTIFY: usize = 10;

fuzz_target!(|data: &[u8]| {
    let Some((sel, _, json)) = split(data) else { return };
    match sel % 4 {
        0 => {
            run("solve_plastic_2d", json, |i: &PlasticInput| plastic::solve_plastic_2d(i));
        }
        1 => {
            run("solve_plastic_3d", json, |i: &PlasticInput3D| {
                small(i, MAX_3D_SOLVE)?;
                plastic::solve_plastic_3d(i)
            });
        }
        2 => {
            run("certify_plastic_2d", json, |i: &PlasticInput| cplastic::certify_plastic_2d(i));
        }
        _ => {
            run("certify_plastic_3d", json, |i: &PlasticInput3D| {
                small(i, MAX_3D_CERTIFY)?;
                cplastic3::certify_plastic_3d(i)
            });
        }
    }
});

fn small(i: &PlasticInput3D, max: usize) -> Result<(), String> {
    if i.solver.elements.len() > max {
        return Err("skipped: too large for the fuzz time budget".into());
    }
    Ok(())
}

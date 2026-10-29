//! Static entry points of the WASM layer (engine/src/lib.rs) on arbitrary
//! bytes: linear solve and certificate, certificate bundles, P-Delta, load
//! cases, combinations and envelopes. Input: selector byte, parameter byte,
//! JSON text (see dedaliano_engine_fuzz::split).
#![no_main]

use dedaliano_engine::certify::{self, bundle, combinations as ccomb, pdelta as cpdelta};
use dedaliano_engine::postprocess::combinations::{self as comb, CombinationInput, CombinationInput3D};
use dedaliano_engine::solver::load_cases::{self, MultiCaseInput, MultiCaseInput3D};
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use dedaliano_engine_fuzz::{check_equilibrium_2d, check_equilibrium_3d, run, split};
use libfuzzer_sys::fuzz_target;

fn some<T>(x: Option<T>) -> Result<Option<T>, String> {
    Ok(x)
}

fuzz_target!(|data: &[u8]| {
    let Some((sel, p, json)) = split(data) else { return };
    match sel % 18 {
        0 => {
            run("solve_2d", json, |i: &SolverInput| linear::solve_2d(i));
        }
        1 => {
            run("solve_3d", json, |i: &SolverInput3D| linear::solve_3d(i));
        }
        2 => {
            if let Some((i, out)) = run("certify_linear_2d", json, |i: &SolverInput| certify::certify_linear_2d_full(i)) {
                check_equilibrium_2d(&i, &out.results, &out.certificate);
            }
        }
        3 => {
            if let Some((i, out)) = run("certify_linear_3d", json, |i: &SolverInput3D| certify::certify_linear_3d_full(i)) {
                check_equilibrium_3d(&i, &out.results, &out.certificate);
            }
        }
        4 => {
            run("export_linear_bundle_2d", json, |i: &SolverInput| bundle::export_linear_bundle_2d(i));
        }
        5 => {
            run("export_linear_bundle_3d", json, |i: &SolverInput3D| bundle::export_linear_bundle_3d(i));
        }
        6 => {
            run("solve_pdelta_2d", json, |i: &SolverInput| pdelta::solve_pdelta_2d(i, p.max_iter, p.tolerance));
        }
        7 => {
            run("certify_pdelta_2d", json, |i: &SolverInput| cpdelta::certify_pdelta_2d(i, p.max_iter, p.tolerance));
        }
        8 => {
            run("solve_pdelta_3d", json, |i: &SolverInput3D| pdelta::solve_pdelta_3d(i, p.max_iter, p.tolerance));
        }
        9 => {
            run("certify_pdelta_3d", json, |i: &SolverInput3D| cpdelta::certify_pdelta_3d(i, p.max_iter, p.tolerance));
        }
        10 => {
            run("solve_multi_case_2d", json, |i: &MultiCaseInput| load_cases::solve_multi_case_2d(i));
        }
        11 => {
            run("solve_multi_case_3d", json, |i: &MultiCaseInput3D| load_cases::solve_multi_case_3d(i));
        }
        12 => {
            run("certify_multi_case_2d", json, |i: &MultiCaseInput| ccomb::certify_multi_case_2d(i));
        }
        13 => {
            run("certify_multi_case_3d", json, |i: &MultiCaseInput3D| ccomb::certify_multi_case_3d(i));
        }
        14 => {
            run("combine_results_2d", json, |i: &CombinationInput| some(comb::combine_results(i)));
        }
        15 => {
            run("combine_results_3d", json, |i: &CombinationInput3D| comb::combine_results_3d(i));
        }
        16 => {
            run("compute_envelope_2d", json, |i: &Vec<AnalysisResults>| some(comb::compute_envelope(i)));
        }
        _ => {
            run("compute_envelope_3d", json, |i: &Vec<AnalysisResults3D>| some(comb::compute_envelope_3d(i)));
        }
    }
});

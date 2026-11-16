//! Dynamic and stability entry points of the WASM layer (engine/src/lib.rs)
//! on arbitrary bytes: modal, buckling, spectral, time history and harmonic,
//! each with its certificate. Input: selector byte, parameter byte, JSON text.
#![no_main]

use dedaliano_engine::certify::{buckling as cbuck, dynamics as cdyn, harmonic as charm, modal as cmodal, spectral as cspec};
use dedaliano_engine::solver::harmonic::{self, HarmonicInput, HarmonicInput3D};
use dedaliano_engine::solver::{buckling, modal, spectral, time_integration};
use dedaliano_engine::types::*;
use dedaliano_engine_fuzz::{run, split};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Some((sel, p, json)) = split(data) else { return };
    let n = p.num_modes;
    match sel % 20 {
        0 => {
            run("solve_modal_2d", json, |i: &ModalInput| modal::solve_modal_2d(&i.solver, &i.densities, n));
        }
        1 => {
            run("solve_modal_3d", json, |i: &ModalInput3D| modal::solve_modal_3d(&i.solver, &i.densities, n));
        }
        2 => {
            run("certify_modal_2d", json, |i: &ModalInput| cmodal::certify_modal_2d(&i.solver, &i.densities, n));
        }
        3 => {
            run("certify_modal_3d", json, |i: &ModalInput3D| cmodal::certify_modal_3d(&i.solver, &i.densities, n));
        }
        4 => {
            run("solve_buckling_2d", json, |i: &SolverInput| buckling::solve_buckling_2d(i, n));
        }
        5 => {
            run("solve_buckling_3d", json, |i: &SolverInput3D| buckling::solve_buckling_3d(i, n));
        }
        6 => {
            run("certify_buckling_2d", json, |i: &SolverInput| cbuck::certify_buckling_2d(i, n));
        }
        7 => {
            run("certify_buckling_3d", json, |i: &SolverInput3D| cbuck::certify_buckling_3d(i, n));
        }
        8 => {
            run("solve_spectral_2d", json, |i: &SpectralInput| spectral::solve_spectral_2d(i));
        }
        9 => {
            run("solve_spectral_3d", json, |i: &SpectralInput3D| spectral::solve_spectral_3d(i));
        }
        10 => {
            run("certify_spectral_2d", json, |i: &SpectralInput| cspec::certify_spectral_2d(i));
        }
        11 => {
            run("certify_spectral_3d", json, |i: &SpectralInput3D| cspec::certify_spectral_3d(i));
        }
        12 => {
            run("solve_time_history_2d", json, |i: &TimeHistoryInput| time_integration::solve_time_history_2d(i));
        }
        13 => {
            run("solve_time_history_3d", json, |i: &TimeHistoryInput3D| time_integration::solve_time_history_3d(i));
        }
        14 => {
            run("certify_time_history_2d", json, |i: &TimeHistoryInput| cdyn::certify_time_history_2d(i));
        }
        15 => {
            run("certify_time_history_3d", json, |i: &TimeHistoryInput3D| cdyn::certify_time_history_3d(i));
        }
        16 => {
            run("solve_harmonic_2d", json, |i: &HarmonicInput| harmonic::solve_harmonic_2d(i));
        }
        17 => {
            run("solve_harmonic_3d", json, |i: &HarmonicInput3D| harmonic::solve_harmonic_3d(i));
        }
        18 => {
            run("certify_harmonic_2d", json, |i: &HarmonicInput| charm::certify_harmonic_2d(i));
        }
        _ => {
            run("certify_harmonic_3d", json, |i: &HarmonicInput3D| charm::certify_harmonic_3d(i));
        }
    }
});

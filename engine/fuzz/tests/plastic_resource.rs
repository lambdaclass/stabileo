#[test]
fn issue_743_grid_is_admitted_by_storage_without_running_a_heavy_solve() {
    let bytes = include_bytes!("../corpus-regressions/plastic-lp-budget/engine-grid-slab.bin");
    let input: dedaliano_engine::types::PlasticInput3D =
        serde_json::from_slice(&bytes[2..]).unwrap();
    let model = dedaliano_engine::certify::plastic_3d::build_model_3d(&input).unwrap();
    let work = dedaliano_engine::certify::plastic_3d::lp_work(&model);
    assert_eq!(work.force_variables, 144);
    assert_eq!(work.equilibrium_equations, 84);
    assert_eq!(work.max_halfspaces, 6144);
    assert_eq!(work.max_tableau_cells(), 912050);
    assert!(work.initial_pivot_cells() > 1 << 31);
    assert!(work.check_engine_budget().is_ok());
    assert!(dedaliano_engine_fuzz::plastic::certificate_budget_3d(&input).is_ok());
}

use dedaliano_engine::certify::{exact::qr, plastic as p2, plastic_3d as p3};
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

struct Meter;
thread_local! {
    static MEMORY: Cell<(usize, usize)> = const { Cell::new((0, 0)) };
}

unsafe impl GlobalAlloc for Meter {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            let _ = MEMORY.try_with(|m| {
                let (live, peak) = m.get();
                let live = live + layout.size();
                m.set((live, peak.max(live)));
            });
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        let _ = MEMORY.try_with(|m| {
            let (live, peak) = m.get();
            m.set((live.saturating_sub(layout.size()), peak));
        });
        System.dealloc(ptr, layout);
    }
}

#[global_allocator]
static ALLOCATOR: Meter = Meter;

fn bounded_refusal(f: impl FnOnce() -> dedaliano_engine::certify::plastic_budget::PlasticLpWork) {
    let before = MEMORY.with(|m| {
        let (live, _) = m.get();
        m.set((live, live));
        live
    });
    let work = f();
    let error = work.check_engine_budget().unwrap_err();
    let peak = MEMORY.with(|m| m.get().1) - before;
    assert!(
        error.starts_with("exact plastic LP resource budget exceeded:"),
        "{error}"
    );
    assert!(peak < 64 * 1024, "admission allocated {peak} bytes");
}

fn subdivide(piece: &p2::Piece, count: i64) -> Vec<p2::Piece> {
    (0..count)
        .map(|i| p2::Piece {
            a: &piece.a + (&piece.b - &piece.a) * qr(i, count),
            b: &piece.a + (&piece.b - &piece.a) * qr(i + 1, count),
            c: piece.c.clone(),
        })
        .collect()
}

#[test]
fn many_3d_load_pieces_refuse_without_constructing_samples() {
    let bytes = include_bytes!("../corpus-regressions/plastic-lp-budget/good-loaded-beam.bin");
    let input = serde_json::from_slice(&bytes[2..]).unwrap();
    let mut model = p3::build_model_3d(&input).unwrap();
    let e = &mut model.elems[0];
    e.pieces_y = subdivide(&e.pieces_y[0], 2048);
    e.pieces_z = subdivide(&e.pieces_z[0], 2048);
    bounded_refusal(|| {
        let work = p3::lp_work(&model);
        assert_eq!(work.initial_halfspaces, (16 * 2048 + 1) * 8);
        work
    });
}

#[test]
fn many_2d_load_pieces_refuse_without_constructing_samples() {
    let bytes = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1261.bin");
    let input = serde_json::from_slice(&bytes[2..]).unwrap();
    let mut model = p2::build_model(&input).unwrap();
    let template = model.elems[0].clone();
    model.elems = (0..p2::MAX_PLASTIC_ELEMENTS)
        .map(|i| {
            let mut e = template.clone();
            e.id = i + 1;
            e
        })
        .collect();
    model.elems[0].pieces = subdivide(&template.pieces[0], 2048);
    bounded_refusal(|| p2::lp_work(&model));
}

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};

struct Meter;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
static TOTAL: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Meter {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = System.alloc(layout);
        if !ptr.is_null() {
            let live = LIVE.fetch_add(layout.size(), Relaxed) + layout.size();
            PEAK.fetch_max(live, Relaxed);
            TOTAL.fetch_add(layout.size(), Relaxed);
        }
        ptr
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout);
        LIVE.fetch_sub(layout.size(), Relaxed);
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        let new = System.realloc(ptr, layout, size);
        if !new.is_null() {
            let live = LIVE.fetch_add(size, Relaxed) + size - layout.size();
            LIVE.fetch_sub(layout.size(), Relaxed);
            PEAK.fetch_max(live, Relaxed);
            TOTAL.fetch_add(size, Relaxed);
        }
        new
    }
}

#[global_allocator]
static ALLOCATOR: Meter = Meter;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&args[1]).unwrap();
    let mode = args.get(2).map(String::as_str).unwrap_or("gate");
    let repeats: usize = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(3);
    for iteration in 0..repeats {
        let before = LIVE.load(Relaxed);
        PEAK.store(before, Relaxed);
        TOTAL.store(0, Relaxed);
        let start = std::time::Instant::now();
        let outcome = dedaliano_engine_fuzz::plastic::replay(&bytes, mode != "engine");
        if outcome.starts_with("ok:") {
            match mode {
                "hang" => loop { std::thread::park_timeout(std::time::Duration::from_secs(60)); },
                "leak" => std::mem::forget(vec![0_u8; 1 << 20]),
                _ => {}
            }
        }
        let elapsed = start.elapsed();
        let peak = PEAK.load(Relaxed);
        let total = TOTAL.load(Relaxed);
        let live = LIVE.load(Relaxed) - outcome.capacity();
        println!("{}", serde_json::json!({"iteration": iteration, "seconds": elapsed.as_secs_f64(), "live_before": before, "live_after": live, "peak_bytes": peak, "allocated_bytes": total, "outcome": outcome}));
    }
}

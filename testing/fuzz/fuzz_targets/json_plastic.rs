#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    dedaliano_engine_fuzz::plastic::exercise(data);
});

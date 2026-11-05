use std::process::Command;

const PROBE: &str = r#"
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('gate', os.environ['GATE'])
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
LIB = '#[wasm_bindgen]\npub fn solve_beam_2d(json: &str) -> Result<String, JsValue> { to_json(&solver::beam::solve_beam_2d_typed(&input)?) }\n'
CHECKED = '#[test]\nfn t() {\n    let r = beam::solve_beam_2d_typed(&x);\n    assert!(close(&r));\n}\n'
CASES = {
    'a discarded result': ('engine/tests/beam.rs', '#[test]\nfn t() {\n    let _ = beam::solve_beam_2d_typed(&x);\n    assert!(true);\n}\n'),
    'no comparison': ('engine/tests/beam.rs', '#[test]\nfn t() {\n    let r = beam::solve_beam_2d_typed(&x);\n    println!("{r:?}");\n}\n'),
    'a cfg(any()) module': ('engine/tests/beam.rs', '#[cfg(any())]\nmod off {\n' + CHECKED + '}\n'),
    'a cfg(any()) file': ('engine/tests/beam.rs', '#![cfg(any())]\n' + CHECKED),
    'a nested file no target compiles': ('engine/tests/suite/unregistered.rs', CHECKED),
}
CARGO = '[[test]]\nname = "beam"\npath = "tests/beam.rs"\n\n[[test]]\nname = "suite"\npath = "tests/suite/main.rs"\n'

def errors(file, text):
    files = {'engine/Cargo.toml': CARGO, 'engine/tests/suite/main.rs': '', 'engine/tests/beam.rs': CHECKED, file: text}
    statuses = {k: {'tracked': 1513} for k in gate.INVARIANCES}
    statuses['units'] = {'test': file + '::t'}
    registry = {'scopes': {}, 'entry_points': {'solve_beam_2d': {'scope': 'solve', 'calls': 'beam::solve_beam_2d_typed', 'invariances': statuses}}}
    return gate.check(registry, {'engine/src/lib.rs': LIB}, files.get)

control = errors('engine/tests/beam.rs', CHECKED)
accepted = [name for name, (file, text) in CASES.items() if not errors(file, text)]
print('a checked, compiled test:', control or 'accepted')
print('tests that cannot fail but count as coverage:', accepted)
sys.exit(1 if control or accepted else 0)
"#;

#[test]
#[ignore = "known wrong result: #1513 the invariance gate counts a test that cannot fail as coverage"]
fn issue_1513_the_invariance_gate_rejects_a_test_that_cannot_fail() {
    let gate = concat!(env!("CARGO_MANIFEST_DIR"), "/../scripts/invariance-gate.py");
    let out = Command::new("python3").args(["-B", "-I", "-c", PROBE]).env("GATE", gate).output().expect("python3 runs");
    assert!(out.status.success(), "{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
}

import copy
import importlib.util
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('invariance_gate', ROOT / 'scripts/invariance-gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

LIB = '''
use wasm_bindgen::prelude::*;

/// Calls `solve_beam` in a doc comment only.
#[wasm_bindgen]
pub fn solve_beam_2d(json: &str) -> Result<String, JsValue> {
    let s = "solve_other(";
    let r = solver::beam::solve_beam_2d_typed(&input)?;
    to_json(&r)
}

#[wasm_bindgen]
pub fn check_members(json: &str) -> Result<String, JsValue> { design::check(json) }

fn helper() {}

#[wasm_bindgen]
pub struct Session { state: u8 }

#[wasm_bindgen]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<Session, JsValue> { Session::from_input(input) }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> { self.prepared.solve_loads(&loads) }
    fn private(&self) {}
}
'''

ANA = '''
fn wrap(s: &S) -> R { beam::solve_beam_2d_typed(s) }
pub fn rows() -> Vec<Ana2> {
    vec![
        Ana2 { name: "beam", run: |c| Ok(beam::solve_beam_2d_typed(&c.s)?) },
        Ana2 { name: "beam (helper)", run: |c| Ok(wrap(&c.s)?) },
        Ana2 { name: "session", run: |c| Ok(Session::from_input(c.s.clone())?.solve_loads(&c.s.loads)?) },
        Ana2 { name: "session (prepared only)", run: |c| Ok(prepare(&c.s)?.solve_loads(&c.s.loads)?) },
        Ana2 { name: "legacy beam", run: |c| { let x = Case { name: "inner".into() }; Ok(beam::solve_beam_2d(&c.s)?) } },
    ]
}
'''

DOC = '''
<!-- BEGIN pr_2d -->
| Analysis | rotation | mirror | relabel | reversal | units | linear agreement |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| beam | ✓ | ✓ | ✓ | ✓ | R | ✓ |
| beam (helper) | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| legacy beam | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| session | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| session (prepared only) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
<!-- END pr_2d -->
'''

TEST = '''
#[test]
fn beam_units_scale() {
    let r = dedaliano_engine::solver::beam::solve_beam_2d_typed(&scaled());
    check_scaled(&r, &base());
}

#[test]
fn beam_call_only() {
    let _ = dedaliano_engine::solver::beam::solve_beam_2d_typed(&scaled());
}

#[test]
fn beam_assert_macro() {
    let r = dedaliano_engine::solver::beam::solve_beam_2d_typed(&scaled());
    assert_eq!(r, expected);
}

#[test]
fn beam_through_legacy() {
    let r = solve_beam_2d(&scaled());
}

#[test]
#[ignore]
fn beam_ignored() {
    let r = solve_beam_2d_typed(&scaled());
}

#[cfg(feature = "slow")]
#[test]
fn beam_gated() {
    let r = solve_beam_2d_typed(&scaled());
}

#[test]
#[cfg_attr(all(), ignore)]
fn beam_ignored_conditionally() {
    let r = solve_beam_2d_typed(&scaled());
}

use dedaliano_engine::solver::beam::{other, solve_beam_2d_typed as _, solve_beam_2d_typed};

#[test]
fn beam_imported() {
    let r = solve_beam_2d_typed(&scaled());
    assert!(close(&r));
}

#[test]
fn session_prepared_only() {
    let r = prepare(&x).solve_loads(&loads);
}

#[test]
fn session_through_constructor() {
    let r = Session::from_input(x)?.solve_loads(&loads);
    compare_with_regular(&r);
}

fn not_a_test() { solve_beam_2d_typed(&x); }

fn check_scaled(r: &R, b: &R) { assert!(close(r, b)); }

fn compare_with_regular(r: &R) { assert_eq!(r, &regular()); }

fn report(r: &R) { println!("{r:?}"); }

fn check_ignoring(_: &R) { assert!(true); }

fn check_other(r: &R, expected: &R) { assert!(close(expected, &base())); }

#[test]
fn beam_helper_ignores_the_result() {
    let r = solve_beam_2d_typed(&scaled());
    check_ignoring(&r);
}

#[test]
fn beam_helper_asserts_on_another_argument() {
    let r = solve_beam_2d_typed(&scaled());
    check_other(&r, &base());
}

#[test]
fn beam_result_shadowed() {
    let r = solve_beam_2d_typed(&scaled());
    let r = 0;
    assert_eq!(r, 0);
}

#[test]
fn beam_result_overwritten() {
    let mut r = solve_beam_2d_typed(&scaled());
    r = zero();
    assert_eq!(r, zero());
}

#[test]
fn beam_result_discarded() {
    let _ = solve_beam_2d_typed(&scaled());
    assert!(true);
}

#[test]
fn beam_unrelated_assertion() {
    let r = solve_beam_2d_typed(&scaled());
    let x = 1;
    assert_eq!(x, 1);
}

#[test]
fn beam_helper_without_assertion() {
    let r = solve_beam_2d_typed(&scaled());
    report(&r);
}

#[test]
fn beam_derived_value_asserted() {
    let r = solve_beam_2d_typed(&scaled());
    let tip = r.displacements.last().unwrap().uz;
    for (a, b) in [(tip, 1.0)] {
        assert!((a - b).abs() < 1e-9);
    }
}

#[cfg(any())]
mod disabled {
    #[test]
    fn beam_in_disabled_module() {
        let r = solve_beam_2d_typed(&scaled());
        assert!(close(&r));
    }
}

#[cfg(test)]
mod enabled {
    #[test]
    fn beam_in_test_module() {
        let r = solve_beam_2d_typed(&scaled());
        assert!(close(&r));
    }
}
'''

DISABLED_FILE = '''#![cfg(any())]

use dedaliano_engine::solver::beam::solve_beam_2d_typed;

#[test]
fn beam_in_disabled_file() {
    let r = solve_beam_2d_typed(&scaled());
    assert!(close(&r));
}
'''

CARGO = '''
autotests = false

[features]
default = ["fast"]
slow = []

[[test]]
name = "slow"
path = "tests/slow.rs"
required-features = ["slow"]

[[test]]
name = "default"
path = "tests/default_feature.rs"
required-features = ["fast"]

[[test]]
name = "beam"
path = "tests/beam_invariance.rs"

[[test]]
name = "suite"
path = "tests/suite/main.rs"
'''

SUITE = '''
mod included;
#[cfg(any())]
mod excluded;
#[path = "../shared/beam_shared.rs"]
mod shared;
'''

INCLUDED = '''
use dedaliano_engine::solver::beam::solve_beam_2d_typed;

#[test]
fn beam_units() {
    let r = solve_beam_2d_typed(&scaled());
    assert!(close(&r));
}
'''

FILES = {
    gate.DOC: DOC,
    gate.ANALYSES['pr_2d']: ANA,
    'engine/Cargo.toml': CARGO,
    'engine/tests/beam_invariance.rs': TEST,
    'engine/tests/disabled_file.rs': DISABLED_FILE,
    'engine/tests/suite/main.rs': SUITE,
    'engine/tests/suite/included.rs': INCLUDED,
    'engine/tests/suite/excluded.rs': INCLUDED,
    'engine/tests/shared/beam_shared.rs': INCLUDED,
    'engine/tests/orphan.rs': INCLUDED,
    'engine/tests/slow.rs': INCLUDED,
    'engine/tests/default_feature.rs': INCLUDED,
}

TRACKED = {'tracked': 1497}


def registry():
    statuses = {key: dict(TRACKED) for key in gate.INVARIANCES}
    statuses['rotation'] = {'metamorphic': 'pr_2d', 'analysis': 'beam'}
    statuses['mirror'] = {'metamorphic': 'pr_2d', 'analysis': 'beam (helper)'}
    statuses['units'] = {'test': 'engine/tests/beam_invariance.rs::beam_units_scale'}
    statuses['prepared'] = {'metamorphic': 'pr_2d', 'analysis': 'beam'}
    statuses['planes'] = {'exempt': 'no 3D counterpart'}
    return {
        'scopes': {'design': 'checks from given forces', 'session': 'its solve carries the invariances'},
        'entry_points': {
            'solve_beam_2d': {'scope': 'solve', 'calls': 'beam::solve_beam_2d_typed', 'invariances': statuses},
            'check_members': {'scope': 'design'},
            'Session::new': {'scope': 'session'},
            'Session::solve': {'scope': 'solve', 'calls': 'solve_loads', 'invariances': {key: dict(TRACKED) for key in gate.INVARIANCES}},
        },
    }


def run(reg=None, lib=LIB, files=None):
    files = dict(FILES, **(files or {}))
    return gate.check(registry() if reg is None else reg, {'engine/src/lib.rs': lib}, files.get)


class Exports(unittest.TestCase):
    def test_free_functions_and_methods_of_exported_impls_are_found(self):
        self.assertEqual(sorted(gate.exports({'engine/src/lib.rs': LIB})), ['Session::new', 'Session::solve', 'check_members', 'solve_beam_2d'])

    def test_an_export_after_an_extra_attribute_is_found(self):
        lib = '#[wasm_bindgen]\n#[allow(clippy::too_many_arguments)]\npub fn solve_x(a: f64) -> f64 { a }\n'
        self.assertEqual(list(gate.exports({'lib.rs': lib})), ['solve_x'])

    def test_an_export_without_pub_is_still_an_export(self):
        self.assertEqual(list(gate.exports({'lib.rs': '#[wasm_bindgen]\nfn solve_x() {}\n#[wasm_bindgen]\npub(crate) fn solve_y() {}\n'})), ['solve_x', 'solve_y'])

    def test_a_conditional_export_is_found(self):
        lib = '#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]\npub fn solve_x() {}\n#[cfg_attr(feature = "x", wasm_bindgen(js_name = y))]\nimpl Y {\n    pub fn solve(&self) {}\n}\n'
        self.assertEqual(sorted(gate.exports({'lib.rs': lib})), ['Y::solve', 'solve_x'])

    def test_a_commented_out_export_is_not_found(self):
        self.assertEqual(gate.exports({'lib.rs': '// #[wasm_bindgen]\n// pub fn solve_x() {}\n'}), {})

    def test_the_main_repository_has_every_export_registered(self):
        out = subprocess.run([sys.executable, '-B', '-I', str(ROOT / 'scripts/invariance-gate.py')], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)


class Registry(unittest.TestCase):
    def test_the_example_passes(self):
        self.assertEqual(run(), [])

    def test_a_new_export_without_a_row_fails(self):
        errors = run(lib=LIB + '\n#[wasm_bindgen]\npub fn solve_frame_3d(json: &str) -> Result<String, JsValue> { x }\n')
        self.assertEqual(len(errors), 1)
        self.assertIn('solve_frame_3d (engine/src/lib.rs): a WASM export with no row', errors[0])

    def test_a_function_nested_in_a_method_is_not_an_export(self):
        lib = LIB.replace('fn private(&self) {}', 'fn private(&self) { pub fn inner() {} }')
        self.assertNotIn('Session::inner', gate.exports({'engine/src/lib.rs': lib}))

    def test_a_new_method_of_an_exported_impl_without_a_row_fails(self):
        errors = run(lib=LIB.replace('    fn private', '    pub fn solve_again(&self) {}\n    fn private'))
        self.assertEqual(errors, [e for e in errors if 'Session::solve_again' in e])
        self.assertEqual(len(errors), 1)

    def test_a_row_for_a_removed_export_fails(self):
        errors = run(lib=LIB.replace('#[wasm_bindgen]\npub fn check_members', 'pub fn check_members'))
        self.assertEqual(errors, ['check_members: a registry row for a WASM export that no longer exists'])

    def test_an_undescribed_scope_fails(self):
        reg = registry()
        reg['entry_points']['check_members']['scope'] = 'misc'
        self.assertIn("scope 'misc' is neither", run(reg)[0])

    def test_a_non_solve_row_cannot_list_invariances(self):
        reg = registry()
        reg['entry_points']['check_members']['invariances'] = {}
        self.assertEqual(run(reg), ['check_members: only a solve entry point lists invariances'])

    def test_every_invariance_needs_a_status(self):
        reg = registry()
        del reg['entry_points']['solve_beam_2d']['invariances']['reversal']
        self.assertEqual(len(run(reg)), 1)
        self.assertIn("invariance 'reversal' has no status", run(reg)[0])

    def test_an_unknown_invariance_fails(self):
        reg = registry()
        reg['entry_points']['solve_beam_2d']['invariances']['shear'] = dict(TRACKED)
        self.assertEqual(run(reg), ["solve_beam_2d: unknown invariance 'shear'"])

    def test_the_wrapper_must_call_the_named_function(self):
        reg = registry()
        reg['entry_points']['solve_beam_2d']['calls'] = 'solve_beam'
        self.assertIn('solve_beam_2d: its wrapper in engine/src/lib.rs does not call solve_beam', run(reg))

    def test_a_call_in_a_string_or_comment_does_not_count(self):
        reg = registry()
        for name in ('solve_other', 'solve_beam'):
            reg['entry_points']['solve_beam_2d']['calls'] = name
            self.assertIn(f'solve_beam_2d: its wrapper in engine/src/lib.rs does not call {name}', run(reg))

    def test_an_exemption_needs_a_reason_and_tracking_an_issue_number(self):
        for bad in ({'exempt': ' '}, {'tracked': '1497'}, {'tracked': 0}, {'tracked': True}, {'covered': True}, 'tracked', {'exempt': 'x', 'tracked': 1}):
            reg = registry()
            reg['entry_points']['solve_beam_2d']['invariances']['reversal'] = bad
            self.assertEqual(len(run(reg)), 1, bad)


class Identity(unittest.TestCase):
    def test_calls(self):
        uses = 'use a::beam::{solve_beam, x};\nuse a::frame::*;\n'
        self.assertTrue(gate.calls('solver::beam::solve_beam(1)', 'beam::solve_beam'))
        self.assertTrue(gate.calls('beam::solve_beam::<f64>(1)', 'beam::solve_beam'))
        self.assertFalse(gate.calls('plate::solve_beam(1)', 'beam::solve_beam', uses))
        self.assertTrue(gate.calls('solve_beam(1)', 'beam::solve_beam', uses))
        self.assertFalse(gate.calls('solve_beam(1)', 'beam::solve_beam', 'use a::plate::solve_beam;'))
        self.assertFalse(gate.calls('x.solve_beam(1)', 'beam::solve_beam', uses))
        self.assertTrue(gate.calls('solve_frame(1)', 'frame::solve_frame', uses))
        self.assertTrue(gate.calls('p.solve_loads(&l)', 'solve_loads'))

    def test_a_malformed_calls_value_fails(self):
        for bad in (None, '', [], ['ok', ''], 'a b', 3, ['a::'], [['x']]):
            reg = registry()
            reg['entry_points']['solve_beam_2d']['calls'] = bad
            self.assertIn('names the function or functions it calls', run(reg)[0], bad)

    def test_a_wrapper_calling_the_same_name_in_another_module_fails(self):
        reg = registry()
        reg['entry_points']['solve_beam_2d']['calls'] = 'plate::solve_beam_2d_typed'
        self.assertIn('solve_beam_2d: its wrapper in engine/src/lib.rs does not call plate::solve_beam_2d_typed', run(reg))

    def test_a_method_is_checked_against_its_own_body_and_the_constructor_only(self):
        reg = registry()
        reg['entry_points']['Session::solve']['calls'] = ['Session::from_input', 'solve_loads']
        lib = LIB.replace('    fn private(&self) {}', '    pub fn reset(&self) -> u8 { self.rebuild_all() }\n    fn private(&self) {}')
        reg['entry_points']['Session::reset'] = {'scope': 'session'}
        self.assertEqual(run(reg, lib=lib), [])
        reg['entry_points']['Session::solve']['calls'] = ['Session::from_input', 'rebuild_all']
        self.assertEqual(run(reg, lib=lib), ['Session::solve: its wrapper in engine/src/lib.rs does not call rebuild_all'])
        reg['entry_points']['Session::new'] = {'scope': 'solve', 'calls': 'solve_loads', 'invariances': {key: dict(TRACKED) for key in gate.INVARIANCES}}
        self.assertIn('Session::new: its wrapper in engine/src/lib.rs does not call solve_loads', run(reg, lib=lib))

    def test_a_method_export_is_checked_with_its_constructor(self):
        reg = registry()
        reg['entry_points']['Session::solve']['calls'] = ['Session::from_input', 'solve_loads']
        self.assertEqual(run(reg), [])
        reg['entry_points']['Session::solve']['calls'] = ['Other::from_input', 'solve_loads']
        self.assertEqual(run(reg), ['Session::solve: its wrapper in engine/src/lib.rs does not call Other::from_input'])

    def test_every_listed_call_must_be_in_the_wrapper(self):
        reg = registry()
        reg['entry_points']['Session::solve']['calls'] = ['Session::from_input', 'solve_missing']
        self.assertEqual(run(reg), ['Session::solve: its wrapper in engine/src/lib.rs does not call solve_missing'])

    def test_every_listed_call_must_be_in_the_covering_analysis(self):
        reg = registry()
        statuses = reg['entry_points']['Session::solve']
        statuses['calls'] = ['Session::from_input', 'solve_loads']
        statuses['invariances']['units'] = {'metamorphic': 'pr_2d', 'analysis': 'session (prepared only)'}
        self.assertEqual(run(reg), ["Session::solve units: the metamorphic analysis 'session (prepared only)' does not call Session::from_input and solve_loads, so it does not cover this entry point"])
        statuses['invariances']['units'] = {'metamorphic': 'pr_2d', 'analysis': 'session'}
        self.assertEqual(run(reg), [])

    def test_every_listed_call_must_be_in_the_covering_test(self):
        reg = registry()
        statuses = reg['entry_points']['Session::solve']
        statuses['calls'] = ['Session::from_input', 'solve_loads']
        statuses['invariances']['units'] = {'test': 'engine/tests/beam_invariance.rs::session_prepared_only'}
        self.assertEqual(run(reg), ['Session::solve units: engine/tests/beam_invariance.rs::session_prepared_only: the test does not call Session::from_input, so it does not cover this entry point'])
        statuses['invariances']['units'] = {'test': 'engine/tests/beam_invariance.rs::session_through_constructor'}
        self.assertEqual(run(reg), [])


class Coverage(unittest.TestCase):
    def status(self, key, value, reg=None, **kw):
        reg = copy.deepcopy(reg or registry())
        reg['entry_points']['solve_beam_2d']['invariances'][key] = value
        return run(reg, **kw)

    def test_a_metamorphic_cell_that_is_refused_is_not_coverage(self):
        errors = self.status('units', {'metamorphic': 'pr_2d', 'analysis': 'beam'})
        self.assertEqual(len(errors), 1)
        self.assertIn("shows R for 'beam' × 'units', not ✓", errors[0])

    def test_a_metamorphic_cell_that_did_not_run_is_not_coverage(self):
        errors = self.status('prepared', {'metamorphic': 'pr_2d', 'analysis': 'beam (helper)'})
        self.assertIn("shows · for 'beam (helper)' × 'linear agreement'", errors[0])

    def test_an_analysis_that_calls_another_function_is_not_coverage(self):
        errors = self.status('relabel', {'metamorphic': 'pr_2d', 'analysis': 'legacy beam'})
        self.assertEqual(len(errors), 1)
        self.assertIn("'legacy beam' does not call beam::solve_beam_2d_typed", errors[0])

    def test_an_analysis_through_a_local_helper_is_coverage(self):
        self.assertEqual(self.status('relabel', {'metamorphic': 'pr_2d', 'analysis': 'beam (helper)'}), [])

    def test_an_unknown_analysis_or_tier_fails(self):
        self.assertIn("has no analysis 'inner'", self.status('relabel', {'metamorphic': 'pr_2d', 'analysis': 'inner'})[0])
        self.assertIn("unknown metamorphic tier 'pr_4d'", self.status('relabel', {'metamorphic': 'pr_4d', 'analysis': 'beam'})[0])

    def test_planes_cannot_be_claimed_by_the_metamorphic_tier(self):
        self.assertIn("has no 'planes' check", self.status('planes', {'metamorphic': 'pr_2d', 'analysis': 'beam'})[0])

    def test_a_missing_table_fails(self):
        errors = self.status('relabel', {'metamorphic': 'pr_2d', 'analysis': 'beam'}, files={gate.DOC: 'no tables'})
        self.assertTrue(any('has no pr_2d table' in e for e in errors))

    def test_a_named_test_must_exist_and_call_the_entry_points_function(self):
        self.assertIn('no #[test] fn', self.status('units', {'test': 'engine/tests/beam_invariance.rs::missing'})[0])
        self.assertIn('no #[test] fn', self.status('units', {'test': 'engine/tests/beam_invariance.rs::not_a_test'})[0])
        self.assertIn('does not call beam::solve_beam_2d_typed', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_through_legacy'})[0])
        self.assertEqual(self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_imported'}), [])
        self.assertEqual(self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_assert_macro'}), [])
        self.assertIn('no such test file', self.status('units', {'test': 'engine/tests/nope.rs::x'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_ignored'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_gated'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_ignored_conditionally'})[0])
        self.assertIn('no such test file', self.status('units', {'test': 'engine/src/lib.rs::solve_beam_2d'})[0])

    def test_a_test_must_assert_on_what_the_entry_point_returned(self):
        test = lambda name: self.status('units', {'test': f'engine/tests/beam_invariance.rs::{name}'})
        for name in ['beam_result_discarded', 'beam_unrelated_assertion', 'beam_helper_without_assertion', 'beam_call_only',
                     'beam_helper_ignores_the_result', 'beam_helper_asserts_on_another_argument', 'beam_result_shadowed', 'beam_result_overwritten']:
            errors = test(name)
            self.assertEqual(len(errors), 1, name)
            self.assertIn('no assertion uses what beam::solve_beam_2d_typed returned', errors[0])
        for name in ['beam_units_scale', 'beam_assert_macro', 'beam_derived_value_asserted']:
            self.assertEqual(test(name), [], name)

    def test_one_test_cannot_claim_several_invariances(self):
        reg = registry()
        reg['entry_points']['solve_beam_2d']['invariances']['relabel'] = {'test': 'engine/tests/beam_invariance.rs::beam_units_scale'}
        self.assertEqual(run(reg), ['solve_beam_2d: engine/tests/beam_invariance.rs::beam_units_scale claims relabel, units; each invariance needs its own test, with its own comparison'])
        reg['entry_points']['solve_beam_2d']['invariances']['relabel'] = {'test': 'engine/tests/beam_invariance.rs::beam_assert_macro'}
        self.assertEqual(run(reg), [])

    def test_a_test_in_a_disabled_module_or_file_does_not_count(self):
        self.assertIn('an enclosing module is ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_in_disabled_module'})[0])
        self.assertIn('its file is conditionally compiled', self.status('units', {'test': 'engine/tests/disabled_file.rs::beam_in_disabled_file'})[0])
        self.assertEqual(self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_in_test_module'}), [])

    def test_a_test_file_must_be_compiled_into_a_test_target(self):
        test = lambda file: self.status('units', {'test': f'engine/tests/{file}::beam_units'})
        self.assertEqual(test('suite/included.rs'), [])
        self.assertEqual(test('shared/beam_shared.rs'), [])
        self.assertEqual(test('default_feature.rs'), [])
        for file in ['suite/excluded.rs', 'orphan.rs', 'slow.rs']:
            self.assertIn('is not compiled into any test target', test(file)[0], file)


if __name__ == '__main__':
    unittest.main()

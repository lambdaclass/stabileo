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
    pub fn new(input: JsValue) -> Result<Session, JsValue> { Ok(Session { state: 0 }) }
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
<!-- END pr_2d -->
'''

TEST = '''
#[test]
fn beam_units_scale() {
    let r = dedaliano_engine::solver::beam::solve_beam_2d_typed(&scaled());
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

fn not_a_test() { solve_beam_2d_typed(&x); }
'''

FILES = {
    gate.DOC: DOC,
    gate.ANALYSES['pr_2d']: ANA,
    'engine/tests/beam_invariance.rs': TEST,
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
            'solve_beam_2d': {'scope': 'solve', 'calls': 'solve_beam_2d_typed', 'invariances': statuses},
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
        self.assertIn('calls a different function than solve_beam_2d_typed', errors[0])

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
        self.assertIn('does not call solve_beam_2d_typed', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_through_legacy'})[0])
        self.assertIn('no such test file', self.status('units', {'test': 'engine/tests/nope.rs::x'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_ignored'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_gated'})[0])
        self.assertIn('ignored or conditionally compiled', self.status('units', {'test': 'engine/tests/beam_invariance.rs::beam_ignored_conditionally'})[0])
        self.assertIn('no such test file', self.status('units', {'test': 'engine/src/lib.rs::solve_beam_2d'})[0])


if __name__ == '__main__':
    unittest.main()

import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check_message_matching', ROOT / 'scripts/check-message-matching.py')
lint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lint)

SOURCES = (('engine/src', ('.rs',)), ('web/src', ('.ts', '.svelte')), ('scripts', ('.py', '.cjs')))


def run(files, allow=''):
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        for rel, text in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        return lint.check(root, allow, SOURCES)


def rust(body):
    return {'engine/src/a.rs': f'fn f(err: String, msg: &str, d: &D) -> bool {{\n    {body}\n}}\n'}


def ts(body, path='web/src/lib/a.ts'):
    return {path: f'export function f(e: unknown, msg: string) {{\n  {body}\n}}\n'}


def py(body):
    return {'scripts/a.py': f'def f(message, stderr, failure):\n    {body}\n'}


class Caught(unittest.TestCase):
    def assert_caught(self, files, line=2):
        problems = run(files)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn(f':{line}: ', problems[0])
        self.assertIn('matches message text', problems[0])

    def test_engine_matches_on_message_text(self):
        for body in (
            'err.starts_with("a load acts on")',
            'result.method.starts_with("modal")',
            'd.message.contains("singular")',
            'err.contains(&format!("#{}", 741))',
            'msg.strip_prefix(crate::check::NON_FINITE).is_some()',
            'err == "out of scope"',
            'match err.as_str() { "x" => true, _ => false }',
            'match msg { "unsupported" => true, _ => false }',
            '"out of scope" == err',
            '"x" != d.message',
            'regex::Regex::new("no free DOFs").is_ok()',
        ):
            with self.subTest(body=body):
                self.assert_caught(rust(body))

    def test_web_matches_on_message_text(self):
        for body in (
            "return msg.includes('Could not generate');",
            "return (e as Error).message.startsWith('TH-MASS-SINGULAR: ');",
            "return /no compressed elements/i.test(msg);",
            "return /^Todos los GDL/.test(r.rawDiagnosis ?? '');",
            "return NO_FREE_DOFS.test(String(e));",
            "return x.text.startsWith('TH-MASSLESS-MECHANISM: ');",
            "return message === 'has already been taken';",
            "switch (error.message) { default: return 1; }",
            "return cat.startsWith('Bottom Span');",
        ):
            with self.subTest(body=body):
                self.assert_caught(ts(body))

    def test_a_regex_naming_a_containment_id_is_caught_where_it_is_defined(self):
        self.assert_caught({'web/src/lib/a.ts': "const R = 1;\nconst NON_FINITE = /^TH-NONFINITE: .* from step (\\d+)/;\n"})

    def test_a_local_copied_from_a_message_is_a_message(self):
        files = {'web/src/lib/a.ts': "function f(msg: string) {\n  const lc = msg.toLowerCase();\n"
                                     "  return lc.includes('mecanismo');\n}\n"}
        self.assert_caught(files, line=3)

    def test_a_message_field_compared_to_any_string_is_caught(self):
        for body in ("return error.message === 'singular';", "return 'singular' !== e.message;", "return r.msg == 'x';"):
            with self.subTest(body=body):
                self.assert_caught(ts(body))
        self.assert_caught(py("return failure.stderr == 'killed'"))
        for body in ("return 'no free DOFs' == message", "return 'x' != failure.stderr"):
            with self.subTest(body=body):
                self.assert_caught(py(body))
        self.assert_caught({'web/src/lib/a.ts': "export function f(error: Error) {\n  const text = error.message;\n"
                                                "  return text === 'singular';\n}\n"}, line=3)
        self.assert_caught({'scripts/a.py': "def f(failure):\n    text = failure.message\n    return text == 'singular'\n"}, line=3)

    def test_a_call_split_over_lines_is_caught_at_its_first_line(self):
        self.assert_caught({'web/src/lib/a.ts': 'export function f(message: string) {\n  return NO_FREE_DOFS.test(\n    message\n  );\n}\n'})
        self.assert_caught({'web/src/lib/a.ts': "export function f(message: string) {\n  return message\n    .startsWith('x');\n}\n"}, line=3)
        self.assert_caught({'scripts/a.py': 'def f(stderr):\n    return re.search(\n        r"x", stderr)\n'})

    def test_a_prose_regex_defined_apart_is_caught_where_it_is_used(self):
        files = {'web/src/lib/a.ts': "const NO_FREE = /^No free DOFs/;\nexport const f = (t: string) => NO_FREE.test(t);\n"}
        self.assert_caught(files)
        files = {'web/src/lib/a.ts': "const NO_FREE = new RegExp('no compressed elements');\nexport const f = (t: string) => t.match(NO_FREE);\n"}
        self.assert_caught(files)

    def test_svelte_markup_is_scanned(self):
        self.assert_caught({'web/src/components/A.svelte': "<p>x</p>\n{#if error.includes('singular')}<p>y</p>{/if}\n"})

    def test_scripts_match_on_message_text(self):
        for body in (
            "return 'transformed model failed' in message",
            "return stderr.startswith('error:')",
            "return re.search(r'original solved but transformed', failure)",
            "return EXIT_CODE.match(message)",
            "return message == 'runner lost communication'",
        ):
            with self.subTest(body=body):
                self.assert_caught(py(body))
        self.assert_caught({'scripts/a.cjs': "const x = 1;\nconst refusal = /original solved but transformed model failed:/i.test(raw);\n"})


class NotCaught(unittest.TestCase):
    def test_codes_ids_and_enums_are_not_message_text(self):
        for files in (
            rust('d.code == DiagnosticCode::KnownIssue && ids.contains(&d.id)'),
            rust('d.diagnostics.iter().find(|x| x.severity == Severity::Error).is_some()'),
            rust('DIAGRAM_KINDS.contains(&kind)'),
            rust('match err.kind { Kind::A => true, _ => false }'),
            ts("return limits.includes('anchorage') || reason === 'noGeometry';"),
            ts("return typeof message === 'string' && msg.type === 'ready';"),
            ts("return resultsStore.diagramType === 'none' && items.includes(x as never);"),
            ts("return name.startsWith('IPE');"),
            ts("return typeof error.message === 'string' && typeof (d as D).message === 'string';"),
            ts("return s.replace(/\"/g, '&quot;').replace(/[;\"(]/g, 'x');"),
            py("x = re.search(r'#\\[\\s*(?:ignore|cfg)\\b', attributes)\n    return 'an ignored test does not run'"),
            py("return name.startswith('slow-') or level == 'error'"),
        ):
            with self.subTest(files=files):
                self.assertEqual(run(files), [])

    def test_comments_strings_and_tests_are_skipped(self):
        files = {
            'engine/src/a.rs': ('fn f(err: &str) {\n'
                                '    // err.starts_with("x")\n'
                                '    /* err.contains("y") */\n'
                                '    let s = "err.contains(\\"z\\")";\n'
                                '}\n'
                                '#[cfg(test)]\n'
                                'mod tests {\n'
                                '    fn g(err: &str) -> bool { err.contains("singular") }\n'
                                '}\n'),
            'web/src/lib/a.ts': "// msg.includes('x')\n * msg.includes('y')\n",
            'web/src/lib/__tests__/b.ts': "expect(msg.includes('singular')).toBe(true);\n",
            'web/src/lib/c.test.ts': "expect(msg.includes('singular')).toBe(true);\n",
            'scripts/tests/test_a.py': "assert 'failed' in message\n",
            'scripts/b.py': "# 'failed' in message\n",
        }
        self.assertEqual(run(files), [])


class AllowList(unittest.TestCase):
    SRC = rust('err.starts_with("a load acts on")')
    ENTRY = 'engine/src/a.rs: err.starts_with("a load acts on")\n'

    def test_a_listed_line_with_a_reason_passes(self):
        self.assertEqual(run(self.SRC, '## reassembly classifies by text\n' + self.ENTRY), [])

    def test_an_entry_needs_a_reason(self):
        problems = run(self.SRC, self.ENTRY)
        self.assertTrue(any('no "## reason" line' in p for p in problems), problems)

    def test_a_second_identical_line_is_not_covered(self):
        src = {'engine/src/a.rs': 'fn f(err: &str) -> bool {\n    err.starts_with("a load acts on")\n}\n'
                                  'fn g(err: &str) -> bool {\n    err.starts_with("a load acts on")\n}\n'}
        problems = run(src, '## r\n' + self.ENTRY)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn('a.rs:5:', problems[0])

    def test_an_entry_whose_line_changed_is_stale_and_the_new_line_is_reported(self):
        src = rust('err.starts_with("a load acts upon")')
        problems = run(src, '## r\n' + self.ENTRY)
        self.assertEqual(len(problems), 2, problems)
        self.assertTrue(any('no longer matches' in p for p in problems), problems)
        self.assertTrue(any('a.rs:2:' in p for p in problems), problems)


class Tree(unittest.TestCase):
    def test_the_repository_passes_its_allow_list(self):
        self.assertEqual(lint.check(lint.ROOT, lint.ALLOW.read_text()), [])


if __name__ == '__main__':
    unittest.main()

import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('containment', Path(__file__).parents[1] / 'check-containment.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ContainmentTests(unittest.TestCase):
    def test_modes_and_input(self):
        for row in ['', '| #1 | `X` | UNKNOWN | reason | evidence |', '| #x | `X` | WARN | reason | evidence |', '| #1 | — | WARN | reason | evidence |']:
            with self.assertRaises(ValueError):
                m.decisions(row)
        row = '| #1 | `X` / `Y` | REFUSE / WARN | reason | evidence |'
        self.assertEqual(m.decisions(row), {1: {'REFUSE', 'WARN'}})
        with self.assertRaises(ValueError):
            m.decisions(row + '\n' + row)

    def test_closed_missing_and_open(self):
        issue = {'number': 1, 'state': 'open', 'labels': [{'name': 'safety'}]}
        self.assertEqual(m.audit({1: {'WARN'}}, [issue]), [])
        self.assertTrue(m.audit({}, [issue]))
        self.assertTrue(m.audit({1: {'TRIAGE'}}, [issue]))
        self.assertTrue(m.audit({1: {'TRIAGE', 'SCOPE'}}, [issue]))
        issue['state'] = 'closed'
        self.assertIn('CLOSED', m.audit({1: {'REFUSE'}}, [issue])[0])
        self.assertEqual(m.audit({1: {'CORRECTED'}}, [issue]), [])
        self.assertTrue(m.audit({1: {'WARN'}}, []))
        for invalid in [{}, {**issue, 'number': -1}, {**issue, 'state': 'unknown'}, {**issue, 'labels': ['safety']}]:
            with self.assertRaises(ValueError):
                m.audit({}, [invalid])
        with self.assertRaises(ValueError):
            m.audit({}, [issue, issue])

    def test_repository_ledger(self):
        self.assertTrue(m.decisions((Path(__file__).parents[2] / 'docs/verification/CONTAINMENT.md').read_text()))

    def test_the_refusal_bypass_is_enabled_only_by_the_engines_own_tests(self):
        root = Path(__file__).parents[2]
        skip = ('target', 'node_modules', '.git')
        uses = []
        for path in root.rglob('*'):
            if any(part in skip for part in path.relative_to(root).parts) or not path.is_file():
                continue
            if path.name != 'Cargo.toml' and path.suffix not in ('.yml', '.yaml', '.sh', '.mjs', '.js', '.ts') and path.name != 'Makefile':
                continue
            try:
                text = path.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            uses += [(str(path.relative_to(root)), line.strip()) for line in text.splitlines() if 'unrefused-for-tests' in line or 'all-features' in line]
        self.assertEqual(sorted(uses), [
            ('engine/Cargo.toml', 'dedaliano-engine = { path = ".", features = ["unrefused-for-tests"] }'),
            ('engine/Cargo.toml', 'unrefused-for-tests = []'),
        ])
        manifest = (root / 'engine/Cargo.toml').read_text()
        self.assertLess(manifest.index('[dev-dependencies]'), manifest.index('features = ["unrefused-for-tests"]'))

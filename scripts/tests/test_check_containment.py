import importlib.util
from pathlib import Path
import re
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

    def test_closing_keywords(self):
        texts = ['Fix #426: rotations', 'fixes lambdaclass/stabileo#12 and Closes: #7', 'Resolved #3', 'see #5, prefix #6, fixture #8', None,
                 'Fixes https://github.com/lambdaclass/stabileo/issues/762', 'see https://github.com/lambdaclass/stabileo/issues/9']
        self.assertEqual(m.closed_by(texts), [3, 7, 12, 426, 762])

    def test_queued_pull_requests_are_read_from_the_group_commits(self):
        log = 'Merge pull request #1373 from lambdaclass/ci/x\n\nTitle\nFiber nonlinear: equilibrium gate (#433)\nMerge pull request #1400 from lambdaclass/y\n'
        self.assertEqual(m.queued_pull_requests(log), [1373, 1400])

    def test_a_change_keeps_rows_and_leaves_active_issues_open(self):
        base = {1: {'WARN'}, 2: {'SCOPE'}, 3: {'TRIAGE'}}
        self.assertEqual(m.change_problems(base, {**base, 4: {'SCOPE'}}, []), [])
        self.assertEqual(m.change_problems(base, {1: {'CORRECTED'}, 2: {'SCOPE'}, 3: {'SCOPE'}}, [1, 2, 3, 99]), [])
        self.assertEqual(m.change_problems(base, {1: {'WARN'}, 3: {'TRIAGE'}}, []), ['#2: its containment row was removed'])
        self.assertEqual(m.change_problems(base, base, [1, 2, 3]), ['#1: closed by this change while its row is WARN', '#3: closed by this change while its row is TRIAGE'])
        self.assertEqual(m.change_problems({}, {5: {'REFUSE', 'WARN'}}, [5]), ['#5: closed by this change while its row is REFUSE / WARN'])

    def test_an_active_rows_ids_go_only_with_a_correction(self):
        base_text = '| #5 | `A` / `B` | REFUSE / WARN | r | e |'
        base, ids = m.decisions(base_text), m.contained_ids(base_text)
        self.assertEqual(ids, {5: {'A', 'B'}})
        dropped = '| #5 | `A` | REFUSE | r | e |'
        self.assertEqual(m.change_problems(base, m.decisions(dropped), [], ids, m.contained_ids(dropped)), ['#5: B dropped while the row stays active without CORRECTED'])
        demoted = '| #5 | — | SCOPE | r | e |'
        self.assertEqual(m.change_problems(base, m.decisions(demoted), [5], ids, m.contained_ids(demoted)), ['#5: an active row became SCOPE without CORRECTED'])
        partial = '| #5 | `A` / `B` | PARTIAL | r | e |'
        self.assertEqual(m.change_problems(base, m.decisions(partial), [], ids, m.contained_ids(partial)), ['#5: an active row became PARTIAL without CORRECTED'])
        for ok in ['| #5 | — | CORRECTED | r | e |', '| #5 | `A` | CORRECTED / REFUSE | r | e |', '| #5 | `A` / `B` / `C` | REFUSE / WARN | r | e |']:
            self.assertEqual(m.change_problems(base, m.decisions(ok), [], ids, m.contained_ids(ok)), [], ok)

    def test_which_pull_requests_a_change_carries(self):
        self.assertEqual(m.pull_requests_of({'pull_request': {'number': 807}}, ''), [807])
        group = {'merge_group': {'head_ref': 'refs/heads/gh-readonly-queue/main/pr-1431-0123abcd'}}
        self.assertEqual(m.pull_requests_of(group, 'Merge pull request #1400 from lambdaclass/y\n'), [1400, 1431])
        with self.assertRaises(ValueError):
            m.pull_requests_of({'merge_group': {'head_ref': 'refs/heads/main'}}, '')
        self.assertEqual(m.pull_requests_of({}, ''), [])

    def test_report_lists_every_problem(self):
        body = m.report_body(['#9: no completed containment decision', '#10: CLOSED issue still has active containment'])
        self.assertIn('- #9: no completed containment decision\n', body)
        self.assertIn('- #10: CLOSED issue still has active containment\n', body)

    def test_pull_requests_do_not_read_the_issue_list(self):
        workflow = (Path(__file__).parents[2] / '.github/workflows/containment-audit.yml').read_text()
        ledger, live = workflow.split('\n  live:\n')
        self.assertNotIn('--live', ledger)
        self.assertNotIn('issues:', ledger)
        self.assertIn('edited', ledger)
        self.assertIn("github.event_name == 'pull_request' || github.event_name == 'merge_group'", ledger)
        self.assertIn("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'", live)
        self.assertIn('--live --file-issue', live)
        self.assertIn('unbalancedparentheses,Batuis', (Path(__file__).parents[1] / 'check-containment.py').read_text())

    def test_repository_ledger(self):
        self.assertTrue(m.decisions((Path(__file__).parents[2] / 'docs/verification/CONTAINMENT.md').read_text()))

    def test_the_refusal_bypass_exists_only_in_the_engines_unit_test_build(self):
        root = Path(__file__).parents[2]
        skip = ('target', 'node_modules', '.git')
        uses = []
        for path in root.rglob('*'):
            if any(part in skip for part in path.relative_to(root).parts) or not path.is_file():
                continue
            if path.suffix not in ('.toml', '.yml', '.yaml', '.sh', '.mjs', '.js', '.ts', '.rs') and path.name != 'Makefile':
                continue
            try:
                text = path.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            uses += [str(path.relative_to(root)) for line in text.splitlines() if 'unrefused-for-tests' in line]
        self.assertEqual(uses, [])
        for rel in ('engine/src/solver/plastic.rs', 'engine/src/certify/plastic.rs'):
            lines = (root / rel).read_text().splitlines()
            defs = [i for i, line in enumerate(lines) if re.search(r'\bfn \w+_unrefused\b', line)]
            self.assertTrue(defs, rel)
            for i in defs:
                self.assertEqual(lines[i - 1].strip(), '#[cfg(test)]', rel)
                self.assertTrue(lines[i].lstrip().startswith('pub(crate) fn'), rel)
        callers = [str(p.relative_to(root)) for p in (root / 'engine').rglob('*.rs')
                   if 'target' not in p.parts and '_unrefused(' in p.read_text()
                   and not str(p.relative_to(root)).startswith('engine/src/')]
        included = (root / 'engine/tests/unrefused/mod.rs').read_text()
        for caller in callers:
            self.assertTrue(Path(caller).name in included or Path(caller).stem in included, caller)


if __name__ == '__main__':
    unittest.main()

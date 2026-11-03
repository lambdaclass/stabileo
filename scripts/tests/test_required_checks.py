import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
REQUIRED = {'CI OK', 'rust', 'npm', 'lean', 'symbolic', 'kani'}


def triggers(text):
    block = re.search(r'^on:\n((?:[ #].*\n|\n)*)', text, re.M).group(1)
    return set(re.findall(r'^  ([\w-]+):', block, re.M))


def check_names(text):
    jobs = text.split('\njobs:\n', 1)[1]
    names = set()
    for job_id, body in re.findall(r'^  ([\w-]+):\n((?:(?:    .*)?\n)*)', jobs, re.M):
        name = re.search(r'^    name: (.+)$', body, re.M)
        names.add(name.group(1).strip().strip('\'"') if name else job_id)
    return names


class RequiredChecks(unittest.TestCase):
    def providers(self):
        found = {}
        for path in sorted(WORKFLOWS.glob('*.yml')):
            text = path.read_text()
            if '\njobs:\n' in text:
                for name in check_names(text) & REQUIRED:
                    found.setdefault(name, []).append(path.name)
        return found

    def test_every_required_check_has_exactly_one_provider(self):
        found = self.providers()
        self.assertEqual(set(found), REQUIRED)
        self.assertEqual({n: len(f) for n, f in found.items()}, {n: 1 for n in REQUIRED})

    def test_every_workflow_providing_a_required_check_runs_in_the_merge_queue(self):
        for name, (workflow,) in self.providers().items():
            on = triggers((WORKFLOWS / workflow).read_text())
            self.assertIn('merge_group', on, f'{name} ({workflow})')
            self.assertIn('pull_request', on, f'{name} ({workflow})')

    def test_verify_filters_merge_queue_entries_and_fails_safe(self):
        text = (WORKFLOWS / 'verify.yml').read_text()
        changes = text.split('\n  changes:\n', 1)[1].split('\n  lean:\n', 1)[0]
        self.assertIn("github.event_name == 'merge_group'", changes)
        self.assertIn('github.event.merge_group.base_sha', changes)
        self.assertIn('github.event.merge_group.head_sha', changes)
        gate = "${{ !cancelled() && ((github.event_name != 'pull_request' && github.event_name != 'merge_group') || needs.changes.result != 'success' || needs.changes.outputs.verify == 'true') }}"
        for job in ('lean', 'symbolic', 'kani'):
            body = text.split(f'\n  {job}:\n', 1)[1]
            self.assertEqual(re.search(r'^    if: (.+)$', body, re.M).group(1), gate, job)
        self.assertIn("KANI_TIER: ${{ (github.event_name == 'pull_request' || github.event_name == 'merge_group') && 'fast' || 'all' }}", text)

    def test_the_parser_sees_triggers_and_names(self):
        text = 'on:\n  pull_request:\n  push:\n    branches: [main]\n\njobs:\n  a:\n    name: CI OK\n    steps:\n      - run: x\n  rust:\n    runs-on: y\n'
        self.assertEqual(triggers(text), {'pull_request', 'push'})
        self.assertEqual(check_names(text), {'CI OK', 'rust'})


if __name__ == '__main__':
    unittest.main()

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHARD = ROOT / 'web/scripts/e2e-shard.mjs'
COMMITTED = ROOT / 'web/e2e/shard-timings.json'
FULL = "(needs.changes.outputs.scope == 'full' || needs.changes.outputs.scope == 'site')"


def shards(total, env=None):
    out = []
    for index in range(1, total + 1):
        result = subprocess.run(['node', str(SHARD), str(index), str(total)], cwd=ROOT / 'web', capture_output=True,
                                text=True, check=True, env={**os.environ, **(env or {})})
        out.append(result.stdout.split())
    return out


def jobs(workflow):
    body = workflow.split('\njobs:\n', 1)[1]
    return dict(re.findall(r'(?ms)^  ([a-z0-9-]+):\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)', body))


class LiveTimings(unittest.TestCase):
    def test_a_measured_table_reassigns_files_and_every_file_still_runs_once(self):
        committed = json.loads(COMMITTED.read_text())
        with tempfile.TemporaryDirectory() as directory:
            table = Path(directory) / 'shard-timings.json'
            heavy = sorted(committed)[0]
            table.write_text(json.dumps({**{name: 1 for name in committed}, heavy: 100000}))
            measured = shards(4, {'E2E_SHARD_TIMINGS': str(table)})
            default = shards(4)
        files = [f for shard in measured for f in shard]
        self.assertEqual(sorted(files), sorted(set(files)))
        self.assertEqual(sorted(files), sorted(f for shard in default for f in shard))
        self.assertIn([f'e2e/{heavy}'], measured)
        self.assertNotEqual(measured, default)

    def test_update_writes_the_named_table_and_leaves_the_committed_one(self):
        before = COMMITTED.read_text()
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'smoke.json'
            name = sorted(json.loads(before))[0]
            report.write_text(json.dumps({'suites': [{'file': name, 'specs': [{'tests': [{'results': [{'duration': 42000}]}]}]}]}))
            out = Path(directory) / 'shard-timings.json'
            subprocess.run(['node', str(SHARD), '--update', str(report)], cwd=ROOT / 'web', check=True, capture_output=True,
                           env={**os.environ, 'E2E_SHARD_TIMINGS': str(out)})
            self.assertEqual(json.loads(out.read_text())[name], 42)
        self.assertEqual(COMMITTED.read_text(), before)

    def test_ci_measures_on_trusted_runs_and_every_shard_reads_the_same_table(self):
        workflow = jobs((ROOT / '.github/workflows/ci.yml').read_text())
        changes, e2e, timings = workflow['changes'], workflow['e2e'], workflow['e2e-timings']
        self.assertIn('e2e_timings_run: ${{ steps.timings.outputs.run }}', changes)
        self.assertIn('select(.workflow_run.head_branch == "main" or (.workflow_run.head_branch | startswith("gh-readonly-queue/main/")))', changes)
        self.assertIn('select((.event == "push" or .event == "merge_group") and .path == ".github/workflows/ci.yml" '
                      'and .head_repository.full_name == env.GH_REPO and .repository.full_name == env.GH_REPO) | .id', changes)
        self.assertIn('TIMINGS_RUN: ${{ needs.changes.outputs.e2e_timings_run }}', e2e)
        self.assertIn('test -s web/e2e/.timings/shard-timings.json', e2e)
        self.assertNotIn('continue-on-error', e2e.split('Measured E2E timings', 1)[1].split('- name:', 1)[0])
        self.assertLess(e2e.index('Measured E2E timings'), e2e.index('E2E smoke suite (shard'))
        self.assertIn("if: needs.e2e.result == 'success' && %s && (github.event_name == 'merge_group' || github.event_name == 'push')" % FULL, timings)
        upload = e2e.split('Upload smoke timings', 1)[1].split('- name:', 1)[0]
        self.assertIn("if: success() && %s && (github.event_name == 'merge_group' || github.event_name == 'push')" % FULL, upload)
        self.assertIn('[ "${#reports[@]}" = "$TOTAL" ]', timings)
        self.assertIn('name: e2e-timings', timings)

    def test_only_an_artifact_from_this_repository_s_push_or_queue_run_is_used(self):
        changes = jobs((ROOT / '.github/workflows/ci.yml').read_text())['changes']
        step = changes.split('Latest measured E2E timings', 1)[1].split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in step.splitlines() if line.startswith('          '))
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / 'gh'
            fake.write_text('#!/bin/sh\n'
                            'case "$2" in\n'
                            '  *artifacts*) printf "11\\n22\\n" ;;\n'
                            '  */runs/11) [ "$FORK_TRUSTED" = 1 ] && echo 11 ;;\n'
                            '  */runs/22) echo 22 ;;\n'
                            'esac\n')
            fake.chmod(0o755)
            out = Path(directory) / 'out'
            for trusted, expected in [('0', 'run=22'), ('1', 'run=11')]:
                out.write_text('')
                subprocess.run(['bash', '-c', script], check=True, capture_output=True,
                               env={**os.environ, 'PATH': f'{directory}:{os.environ["PATH"]}', 'GH_REPO': 'o/r',
                                    'GITHUB_OUTPUT': str(out), 'FORK_TRUSTED': trusted})
                self.assertEqual(out.read_text().strip(), expected)


if __name__ == '__main__':
    unittest.main()

import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
RUNNER = ROOT / 'scripts/kani-safe.sh'
AGGREGATOR = ROOT / '.github/scripts/kani-aggregate.py'


def harnesses(tier):
    found = []
    nightly = False
    proof = False
    for line in (ROOT / 'engine/src/kani_proofs.rs').read_text().splitlines():
        if line.startswith('// kani: nightly'):
            nightly = True
            continue
        if '#[kani::proof]' in line:
            proof = True
            continue
        match = re.search(r'fn [a-z_0-9]+', line) if proof else None
        if match:
            if tier != 'fast' or not nightly:
                found.append(match.group()[3:])
            proof = False
            nightly = False
        if line.startswith('}') and not proof:
            nightly = False
    return found


def run_shard(root, tier, shard):
    report = root / f'report-{tier}-{shard.replace("/", "-")}.tsv'
    env = {
        **os.environ,
        'PATH': str(root / 'bin') + os.pathsep + os.environ['PATH'],
        'KANI_TIER': tier,
        'KANI_SHARD': shard,
        'KANI_REPORT': str(report),
        'KANI_TARGET_DIR': str(root / 'target'),
    }
    result = subprocess.run(['bash', str(RUNNER)], cwd=root, env=env, capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(f'shard {shard} failed\n{result.stdout}\n{result.stderr}')
    rows = [line.split('\t') for line in report.read_text().splitlines()[1:]]
    if any(row[1] != 'OK' for row in rows):
        raise AssertionError(rows)
    return [row[0] for row in rows]


def write_results(root, outcomes):
    for shard, outcome in enumerate(outcomes, 1):
        if outcome is None:
            continue
        directory = root / f'kani-result-{shard}'
        directory.mkdir(parents=True)
        (directory / 'result').write_text(outcome + '\n')


def run_aggregate(root):
    return subprocess.run([sys.executable, '-I', str(AGGREGATOR), str(root), '5'], capture_output=True, text=True)


class KaniShards(unittest.TestCase):
    def test_partition_covers_every_harness_exactly_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / 'bin').mkdir()
            (root / 'engine/src').mkdir(parents=True)
            shutil.copyfile(ROOT / 'engine/src/kani_proofs.rs', root / 'engine/src/kani_proofs.rs')
            git = root / 'bin/git'
            git.write_text(f'#!/bin/sh\nprintf "%s\\n" "{root}"\n')
            cargo = root / 'bin/cargo'
            cargo.write_text('#!/bin/sh\nprintf "VERIFICATION:- SUCCESSFUL\\n"\n')
            sleep = root / 'bin/sleep'
            sleep.write_text('#!/bin/sh\nexit 0\n')
            git.chmod(0o755)
            cargo.chmod(0o755)
            sleep.chmod(0o755)
            for tier in ('all', 'fast'):
                expected = harnesses(tier)
                self.assertTrue(expected)
                for total in range(1, 9):
                    selected = []
                    for shard in range(1, total + 1):
                        with self.subTest(tier=tier, total=total, shard=shard):
                            names = run_shard(root, tier, f'{shard}/{total}')
                            self.assertEqual(names, sorted(expected)[shard - 1::total])
                            selected.extend(names)
                    self.assertCountEqual(selected, expected)
                    self.assertEqual(len(selected), len(expected))

    def test_aggregator_requires_every_shard_to_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            write_results(root, ['success'] * 5)
            result = run_aggregate(root)
            self.assertEqual(result.returncode, 0, result.stderr)
        for shard, outcome in [(1, 'failure'), (2, 'cancelled'), (3, 'skipped'), (4, None)]:
            with self.subTest(shard=shard, outcome=outcome), tempfile.TemporaryDirectory() as tmp:
                root = pathlib.Path(tmp)
                outcomes = ['success'] * 5
                outcomes[shard - 1] = outcome
                write_results(root, outcomes)
                result = run_aggregate(root)
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn(f'Kani shard {shard}/5', result.stderr)
                if outcome is None:
                    self.assertIn('missing result', result.stderr)
                else:
                    self.assertIn(outcome, result.stderr)

    def test_workflow_uses_five_shards_and_the_fail_closed_aggregator(self):
        workflow = (ROOT / '.github/workflows/verify.yml').read_text()
        self.assertIn('shard: [1, 2, 3, 4, 5]', workflow)
        self.assertIn('fail-fast: false', workflow)
        self.assertIn('KANI_SHARD: ${{ matrix.shard }}/5', workflow)
        self.assertIn('needs: [changes, kani-shard]', workflow)
        self.assertIn('run: python3 -I .github/scripts/kani-aggregate.py target/kani-results 5', workflow)


if __name__ == '__main__':
    unittest.main()

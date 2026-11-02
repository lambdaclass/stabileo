"""Exercise the recorder directly, without Git writes or network access."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]


class RecordReview(unittest.TestCase):
    def test_records_every_runner_verdict_and_legacy_ready(self):
        verdicts = ('ready', 'ready after should-fix items', 'not ready')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'research/tools').mkdir(parents=True)
            shutil.copy(ROOT / 'research/tools/catalog.py', root / 'research/tools/catalog.py')
            paper = yaml.safe_load((ROOT / 'research/papers.yaml').read_text())['papers'][0]
            # A proposed paper requires no external validation fixture.
            paper.update(status='proposed', reproduced_published_results=False)
            paper.pop('reviews', None)
            path = root / 'research/papers.yaml'
            path.write_text(yaml.safe_dump({'papers': [paper]}, sort_keys=False))
            for verdict in (*verdicts, 'ready to merge'):
                with self.subTest(verdict=verdict):
                    if verdict in verdicts:
                        result = subprocess.run(['bash', '-c',
                            'source "$1"; review_complete /dev/stdin', 'test',
                            str(ROOT / 'scripts/review/lib.sh')],
                            input=verdict + '\n', capture_output=True, text=True)
                        self.assertEqual(result.returncode, 0, result.stderr)
                    result = subprocess.run([sys.executable,
                        str(ROOT / 'scripts/review/record_review.py'), str(root),
                        paper['id'], 'Kimi', 'a' * 40, verdict], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    data = yaml.safe_load(path.read_text())
                    review = data['papers'][0]['reviews'][-1]
                    self.assertEqual(review, {'reviewer': 'Kimi', 'sha': 'a' * 40,
                        'verdict': 'ready to merge' if verdict == 'ready' else verdict})
                    self.assertEqual(json.loads((root / 'research/papers.json').read_text())['papers'],
                                     data['papers'])

    def test_concurrent_recordings_keep_every_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'research/tools').mkdir(parents=True)
            shutil.copy(ROOT / 'research/tools/catalog.py', root / 'research/tools/catalog.py')
            paper = yaml.safe_load((ROOT / 'research/papers.yaml').read_text())['papers'][0]
            paper.update(status='proposed', reproduced_published_results=False)
            paper.pop('reviews', None)
            path = root / 'research/papers.yaml'
            path.write_text(yaml.safe_dump({'papers': [paper]}, sort_keys=False))
            runs = [subprocess.Popen([sys.executable, str(ROOT / 'scripts/review/record_review.py'), str(root),
                                      paper['id'], f'Reviewer{i}', f'{i:x}' * 40, 'not ready'],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for i in range(8)]
            for run in runs:
                _, err = run.communicate()
                self.assertEqual(run.returncode, 0, err)
            reviewers = sorted(r['reviewer'] for r in yaml.safe_load(path.read_text())['papers'][0]['reviews'])
            self.assertEqual(reviewers, sorted(f'Reviewer{i}' for i in range(8)))
            self.assertEqual(json.loads((root / 'research/papers.json').read_text())['papers'],
                             yaml.safe_load(path.read_text())['papers'])


if __name__ == '__main__':
    unittest.main()

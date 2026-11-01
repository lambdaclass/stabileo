import importlib.util
from pathlib import Path
import unittest
import subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('trigger', Path(__file__).with_name('snapshot_trigger.py'))
trigger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trigger)


class TriggerTests(unittest.TestCase):
    def test_catalog_introduction(self):
        with patch.object(trigger.subprocess, 'check_call'), patch.object(trigger.subprocess, 'check_output', return_value='') as read:
            before = trigger.read('valid-previous', missing_ok=True)
            self.assertTrue(trigger.changed(before, 'papers: [{id: one, version: 1}]'))
            self.assertEqual(read.call_count, 1)

    def test_invalid_history_and_catalog_fail(self):
        with patch.object(trigger.subprocess, 'check_call', side_effect=subprocess.CalledProcessError(1, 'git')):
            with self.assertRaises(subprocess.CalledProcessError):
                trigger.read('invalid', missing_ok=True)
        with self.assertRaises((KeyError, TypeError)):
            trigger.changed('{}', 'papers: []')

    def test_parsed_versions(self):
        before = 'papers: [{id: one, version: 1, title: old}]'
        self.assertFalse(trigger.changed(before, 'papers:\n- title: new\n  version: 1\n  id: one\n'))
        self.assertTrue(trigger.changed(before, 'papers: [{id: one, version: 2}]'))
        self.assertTrue(trigger.changed(before, 'papers: [{id: one, version: 1}, {id: two, version: 1}]'))
        self.assertFalse(trigger.changed(before, 'papers: [{id: one, version: 1}, {id: two}]'))
        self.assertFalse(trigger.changed(before, before + '\n# comment'))

    def test_catalog_versions_match_each_experiments_versions_file(self):
        import json
        import yaml
        research = Path(__file__).resolve().parents[1]
        papers = yaml.safe_load((research / 'papers.yaml').read_text())['papers']
        files = {f.parent.name: f for f in research.glob('*/*/versions.json')}
        for paper in papers:
            with self.subTest(paper=paper['id']):
                file = files.pop(paper['id'], None)
                if 'version' not in paper:
                    self.assertIsNone(file, 'versions.json without a catalog version')
                    continue
                self.assertIsNotNone(file, 'catalog version without versions.json')
                self.assertEqual(paper['version'], json.loads(file.read_text())['versions'][-1]['version'])
        self.assertEqual(files, {}, 'versions.json for an experiment not in papers.yaml')


if __name__ == '__main__':
    unittest.main()

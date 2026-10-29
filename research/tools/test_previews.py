import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('check_previews', Path(__file__).with_name('check_previews.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreviewsTest(unittest.TestCase):
    def test_missing_current_changed_and_missing_asset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = root / 'web/src/components/research/preview-config.json'
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps([{'paperId': 'other', 'path': '/research/area/other', 'replay': 'replay.bin'}]))
            public = root / 'web/public'
            assets = public / 'research/area/other'
            assets.mkdir(parents=True)
            replay = public / 'replay.bin'
            replay.write_bytes(b'abc')
            self.assertTrue(module.check(root))
            for name in ['preview.png', 'thumb.png', 'preview.webm', 'preview.mp4']:
                (assets / name).write_bytes(b'asset')
            (public / 'research/previews.json').write_text(json.dumps({'other': {'replay': 'replay.bin', 'sha256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}}))
            self.assertEqual(module.check(root), [])
            replay.write_bytes(b'abd')
            self.assertIn('research:previews', module.check(root)[0])
            replay.write_bytes(b'abc')
            (assets / 'thumb.png').unlink()
            self.assertIn('thumb.png', module.check(root)[0])


if __name__ == '__main__':
    unittest.main()

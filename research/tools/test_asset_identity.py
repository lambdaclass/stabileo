import importlib.util
import gzip
import json
import struct
import sys
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('asset_identity', Path(__file__).with_name('asset_identity.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.modules['asset_identity'] = module
publish_spec = importlib.util.spec_from_file_location('publish_assets', Path(__file__).with_name('publish_assets.py'))
publisher = importlib.util.module_from_spec(publish_spec)
publish_spec.loader.exec_module(publisher)


class IdentityTests(unittest.TestCase):
    def test_solver_reference_and_viewer_changes_get_distinct_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / 'web/public/research-wasm/shauer-2025'
            paths = [out / 'phasefield.js', out / 'phasefield_bg.wasm', out.parent / 'viewer/viewer.js', root / 'research/fracture/shauer-2025/reference-results/ex2_steps.csv']
            for p in paths:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('old')
            previous = module.identity(root, out)
            self.assertEqual(previous, module.identity(root, out))
            for p in paths:
                p.write_text('new')
                current = module.identity(root, out)
                self.assertNotEqual(previous, current)
                previous = current

    def test_publish_binds_replay_and_keeps_old_build_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / 'web/public/research-wasm/shauer-2025'
            out.mkdir(parents=True)
            viewer = out.parent / 'viewer'
            viewer.mkdir()
            (viewer / 'viewer.js').write_text('old viewer')
            for name in ['phasefield.js', 'phasefield_bg.wasm', 'reference_ex2_steps.csv']:
                (out / name).write_text('old')
            config = {'e': 30}
            header = json.dumps({'build_id': 'unbound', 'config': config}).encode()
            prefix = b'SRPL' + struct.pack('<II', 1, len(header)) + header
            prefix += b' ' * (-len(prefix) % 4)
            (out / 'replay.srpl').write_bytes(gzip.compress(prefix + b'payload'))
            old = publisher.publish(root, out)
            frozen = out.parent / 'builds' / old
            old_replay = (frozen / 'shauer-2025/replay.srpl').read_bytes()
            self.assertEqual(module.identity(root, out), old)
            self.assertEqual(publisher.publish(root, out), old)
            raw = gzip.decompress(old_replay)
            length = struct.unpack_from('<I', raw, 8)[0]
            self.assertEqual(json.loads(raw[12:12 + length]), {'build_id': old, 'config': config})
            self.assertEqual(raw[(12 + length + 3) // 4 * 4:], b'payload')
            (out / 'phasefield.js').write_text('new solver')
            new = publisher.publish(root, out)
            self.assertNotEqual(old, new)
            self.assertEqual((frozen / 'shauer-2025/replay.srpl').read_bytes(), old_replay)
            self.assertEqual((frozen / 'shauer-2025/phasefield.js').read_text(), 'old')


if __name__ == '__main__':
    unittest.main()

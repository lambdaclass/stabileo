import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('store', Path(__file__).with_name('snapshot_store.py'))
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'store'
        self.root.mkdir()
        self.source = Path(self.tmp.name) / 'source'
        (self.source / 'assets').mkdir(parents=True)
        (self.source / 'assets/app-123.js').write_text('asset')
        (self.source / 'index.html').write_text('original')
        self.meta('a' * 40)

    def meta(self, commit):
        self.commit = commit
        (self.source / 'SNAPSHOT.json').write_text(json.dumps({
            'commit': commit, 'short': commit[:7], 'prefix': f'/@{commit[:7]}/',
            'date': '2026-10-29T00:00:00+00:00',
            'assets': {'app-123.js': store.digest(self.source / 'assets/app-123.js')},
        }))

    def install(self):
        store.install(self.source, self.root, self.commit, 0)

    def test_shared_identical_and_never_overwrite(self):
        self.install()
        asset = self.root / 'assets/app-123.js'
        inode = asset.stat().st_ino
        (self.source / 'index.html').write_text('replacement')
        self.install()
        self.assertEqual((self.root / 'aaaaaaa/index.html').read_text(), 'original')
        self.meta('b' * 40)
        self.install()
        self.assertEqual(asset.stat().st_ino, inode)
        self.assertFalse((self.root / 'bbbbbbb/assets').exists())
        self.assertEqual(len(json.loads((self.root / 'index.json').read_text())['snapshots']), 2)

    def test_mismatch_refused_before_publish(self):
        self.install()
        (self.source / 'assets/app-123.js').write_text('different')
        self.meta('b' * 40)
        with self.assertRaisesRegex(ValueError, 'collision'):
            self.install()
        self.assertFalse((self.root / 'bbbbbbb').exists())
        self.assertEqual((self.root / 'assets/app-123.js').read_text(), 'asset')

    def test_free_disk_guard(self):
        with patch.object(store.shutil, 'disk_usage') as usage:
            usage.return_value.free = 0
            with self.assertRaisesRegex(ValueError, 'free disk'):
                self.install()
        self.assertFalse((self.root / 'aaaaaaa').exists())

    def test_reserve_is_preserved(self):
        needed = sum(p.stat().st_size for p in self.source.rglob('*') if p.is_file())
        with patch.object(store.shutil, 'disk_usage') as usage:
            usage.return_value.free = needed + 1024 * 1024 - 1
            with self.assertRaisesRegex(ValueError, 'free disk'):
                store.install(self.source, self.root, self.commit, 1)
        self.assertFalse((self.root / 'aaaaaaa').exists())

    def test_prefix_collision(self):
        self.install()
        self.meta('a' * 7 + 'b' * 33)
        with self.assertRaisesRegex(ValueError, 'commit collision'):
            self.install()

    def test_prune_dry_run_and_references(self):
        self.install()
        unused = self.root / 'assets/unused-123.js'
        unused.write_text('unused')
        self.assertEqual(store.prune(self.root), [unused])
        self.assertTrue(unused.exists())
        store.prune(self.root, True)
        self.assertFalse(unused.exists())
        self.assertTrue((self.root / 'assets/app-123.js').exists())

    def test_prune_keeps_assets_from_every_snapshot(self):
        self.install()
        first = self.root / 'assets/app-123.js'
        (self.source / 'assets/app-123.js').rename(self.source / 'assets/second-456.js')
        meta = json.loads((self.source / 'SNAPSHOT.json').read_text())
        meta.update(commit='b' * 40, short='bbbbbbb', prefix='/@bbbbbbb/',
                    assets={'second-456.js': store.digest(self.source / 'assets/second-456.js')})
        (self.source / 'SNAPSHOT.json').write_text(json.dumps(meta))
        self.commit = 'b' * 40
        self.install()
        self.assertEqual(store.prune(self.root, True), [])
        self.assertTrue(first.exists())
        self.assertTrue((self.root / 'assets/second-456.js').exists())

    def test_interrupted_asset_write_can_be_retried(self):
        def interrupted(source, output):
            output.write(b'as')
            output.flush()
            self.assertFalse((self.root / 'assets/app-123.js').exists())
            raise OSError('interrupted write')

        with patch.object(store.shutil, 'copyfileobj', side_effect=interrupted):
            with self.assertRaisesRegex(OSError, 'interrupted'):
                self.install()
        self.assertFalse((self.root / 'assets/app-123.js').exists())
        self.assertFalse((self.root / 'aaaaaaa').exists())
        self.install()
        self.assertEqual((self.root / 'assets/app-123.js').read_text(), 'asset')

    def test_process_exit_during_write_leaves_no_final_asset(self):
        code = """
import importlib.util, os, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('store', sys.argv[1])
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)
def die(source, output):
    output.write(b'as')
    output.flush()
    os._exit(17)
store.shutil.copyfileobj = die
with store.locked(Path(sys.argv[3])):
    store.install(Path(sys.argv[2]), Path(sys.argv[3]), 'a' * 40, 0)
"""
        result = subprocess.run([sys.executable, '-I', '-c', code, str(Path(store.__file__)), str(self.source), str(self.root)])
        self.assertEqual(result.returncode, 17)
        self.assertFalse((self.root / 'assets/app-123.js').exists())
        self.install()
        self.assertEqual((self.root / 'assets/app-123.js').read_text(), 'asset')

    def test_flush_failure_never_publishes_asset(self):
        with patch.object(store.os, 'fsync', side_effect=OSError('interrupted fsync')):
            with self.assertRaises(OSError):
                self.install()
        self.assertFalse((self.root / 'assets/app-123.js').exists())
        self.install()

    def test_store_lock_serializes_processes(self):
        code = "import fcntl, sys; f = open(sys.argv[1], 'a'); fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)"
        def acquire():
            return subprocess.run([sys.executable, '-I', '-c', code, str(self.root / '.store.lock')], capture_output=True)
        with store.locked(self.root):
            self.assertNotEqual(acquire().returncode, 0)
        self.assertEqual(acquire().returncode, 0)

    def test_manifest_mismatch(self):
        (self.source / 'assets/app-123.js').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'manifest mismatch'):
            self.install()

    def test_prune_fails_closed_without_manifest(self):
        self.install()
        (self.root / 'bbbbbbb').mkdir()
        (self.root / 'bbbbbbb/SNAPSHOT.json').write_text('{}')
        with self.assertRaises(KeyError):
            store.prune(self.root, True)


if __name__ == '__main__':
    unittest.main()

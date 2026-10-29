import importlib.util
import json
from pathlib import Path
import tempfile
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

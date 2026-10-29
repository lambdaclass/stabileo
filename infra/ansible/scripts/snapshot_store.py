import argparse
from contextlib import contextmanager
from datetime import datetime
import fcntl
import filecmp
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile


NAME = re.compile(r'[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*')
SHORT = re.compile(r'[0-9a-f]{7}')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def asset_names(meta):
    assets = meta['assets']
    if not isinstance(assets, dict) or any(not NAME.fullmatch(n) or not re.fullmatch(r'[0-9a-f]{64}', h) for n, h in assets.items()):
        raise ValueError('invalid asset manifest')
    return assets


@contextmanager
def locked(root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / '.store.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def write_index(root):
    items = []
    for directory in sorted(root.iterdir()):
        if SHORT.fullmatch(directory.name):
            meta = json.loads((directory / 'SNAPSHOT.json').read_text())
            items.append({**meta, 'url': meta['prefix']})
    items.sort(key=lambda m: datetime.fromisoformat(m['date']), reverse=True)
    tmp = root / '.index.json.tmp'
    tmp.write_text(json.dumps({'snapshots': items}, indent=1) + '\n')
    tmp.chmod(0o644)
    tmp.replace(root / 'index.json')


def install(source, root, commit, reserve_mb=2048):
    if reserve_mb < 0:
        raise ValueError('negative disk reserve')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('expected full commit')
    meta = json.loads((source / 'SNAPSHOT.json').read_text())
    short = commit[:7]
    if (meta['commit'], meta['short'], meta['prefix']) != (commit, short, f'/@{short}/'):
        raise ValueError('snapshot identity mismatch')
    assets = asset_names(meta)
    for path in source.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError('snapshot contains a special file')
    actual = {p.name: digest(p) for p in (source / 'assets').iterdir() if p.is_file()}
    if actual != assets or any(not p.is_file() for p in (source / 'assets').iterdir()):
        raise ValueError('asset manifest mismatch')
    shared = root / 'assets'
    shared.mkdir(exist_ok=True)
    for name, sha in assets.items():
        target = shared / name
        if target.is_symlink() or (target.exists() and not filecmp.cmp(target, source / 'assets' / name, shallow=False)):
            raise ValueError(f'shared asset collision: {name}')
    dest = root / short
    if dest.exists():
        if json.loads((dest / 'SNAPSHOT.json').read_text())['commit'] != commit:
            raise ValueError('short commit collision')
        write_index(root)
        return
    needed = sum(p.stat().st_size for p in source.rglob('*') if p.is_file())
    if shutil.disk_usage(root).free < needed + reserve_mb * 1024 * 1024:
        raise ValueError('insufficient free disk including reserve')
    stage = Path(tempfile.mkdtemp(prefix='.install-', dir=root))
    try:
        for name in assets:
            target = shared / name
            if not target.exists():
                with target.open('xb') as output:
                    output.write((source / 'assets' / name).read_bytes())
                target.chmod(0o444)
        for path in source.iterdir():
            if path.name != 'assets':
                if path.is_dir():
                    shutil.copytree(path, stage / path.name)
                else:
                    shutil.copyfile(path, stage / path.name)
        for path in stage.rglob('*'):
            path.chmod(0o555 if path.is_dir() else 0o444)
        stage.chmod(0o555)
        stage.rename(dest)
    finally:
        if stage.exists():
            for path in stage.rglob('*'):
                if path.is_dir():
                    path.chmod(0o755)
            stage.chmod(0o755)
            shutil.rmtree(stage)
    write_index(root)


def prune(root, apply=False):
    keep = set()
    for directory in root.iterdir():
        if SHORT.fullmatch(directory.name):
            meta = json.loads((directory / 'SNAPSHOT.json').read_text())
            keep.update(asset_names(meta))
    candidates = []
    for path in sorted((root / 'assets').iterdir()):
        if path.is_symlink() or not path.is_file() or not NAME.fullmatch(path.name):
            raise ValueError('unexpected shared asset entry')
        if path.name not in keep:
            candidates.append(path)
    for path in candidates:
        print(('delete ' if apply else 'would delete ') + path.name)
        if apply:
            path.unlink()
    return candidates


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['install', 'index', 'prune'])
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--commit')
    parser.add_argument('--reserve-mb', type=int, default=2048)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with locked(args.root):
        if args.command == 'install':
            install(args.source, args.root, args.commit, args.reserve_mb)
        elif args.command == 'index':
            write_index(args.root)
        else:
            prune(args.root, args.apply)

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
FLAGS = 'web/config/features.json'
LEGACY_OVERLAY = 'web/config/pro-plates-off.json'
SOLVER_RUNTIME = ('web/src/lib/wasm/dedaliano_engine.js', 'web/src/lib/wasm/dedaliano_engine_bg.wasm')
ENGINE_INPUTS = ('engine/src', 'engine/build.rs', 'engine/Cargo.toml', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'scripts/wasm-cached.sh',
                 '.github/scripts/build-research-wasm.sh', 'flake.nix', 'flake.lock')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def trailers(base, key):
    values = git('log', f'--format=%(trailers:key={key},valueonly)', f'{base}..HEAD')
    return set(values.decode().splitlines()) - {''}


def profiles_enable_off_switch(before, after):
    return any(not after['production'][key] and profile[key]
               and not before.get(mode, {}).get(key, False)
               for mode, profile in after.items() if mode != 'production' for key in profile)


def changed_paths(base, *paths):
    return set(os.fsdecode(path) for path in
               git('diff', '--name-only', '--no-renames', '-z', base, '--', *paths).split(b'\0') if path)


def snapshot(base, target, intended):
    objects = git('rev-list', '--objects', '--no-object-names', '--missing=print', f'{base}^{{tree}}')
    missing = [line[1:] for line in objects.splitlines() if line.startswith(b'?')]
    if missing:
        fetched = subprocess.run(['git', 'cat-file', '--batch-check=%(objectname) %(objecttype)'],
                                 cwd=ROOT, input=b'\n'.join(missing) + b'\n', stdout=subprocess.PIPE)
        if fetched.returncode or fetched.stdout.splitlines() != [oid + b' blob' for oid in missing]:
            raise RuntimeError(f'Production parity could not fetch all tracked blobs for {base}')
    subprocess.run(['git', 'clone', '--quiet', '--shared', '--no-checkout', str(ROOT), str(target)], check=True)
    subprocess.run(['git', 'checkout', '--quiet', '--detach', base], cwd=target, check=True)
    if intended:
        patch = git('diff', '--binary', base, '--', *(f':(literal){p}' for p in sorted(intended)))
        subprocess.run(['git', 'apply', '--index', '--binary', '-'], cwd=target, input=patch, check=True)


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').digest()


def inventory(directory):
    files = {path.relative_to(directory).as_posix(): digest(path)
             for path in directory.rglob('*') if path.is_file()}
    if 'index.html' not in files:
        raise RuntimeError(f'Production build at {directory} did not emit index.html')
    return files


def differences(reference, candidate):
    return sorted(path for path in reference.keys() | candidate.keys() if reference.get(path) != candidate.get(path))


def build(checkout, env):
    wasm_env = {**env, 'STABILEO_GIT_COMMIT': env['GITHUB_SHA'], 'STABILEO_WASM_CACHE': '0',
                'CARGO_TARGET_DIR': str(checkout / 'target')}
    for key in ('MAKEFLAGS', 'MFLAGS', 'MAKEOVERRIDES'):
        wasm_env.pop(key, None)
    subprocess.run(['make', 'wasm'], cwd=checkout, env=wasm_env, check=True)
    runtime = {}
    for name in SOLVER_RUNTIME:
        artifact = checkout / name
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f'WASM build at {checkout} did not emit {name}')
        runtime[name] = digest(artifact)

    web = checkout / 'web'
    if (ROOT / 'web/package-lock.json').read_bytes() == (web / 'package-lock.json').read_bytes():
        (web / 'node_modules').symlink_to(ROOT / 'web/node_modules', target_is_directory=True)
    else:
        subprocess.run(['make', 'web.deps', 'NIX_RUN='], cwd=checkout, check=True)
    subprocess.run(['make', '--assume-old=web.deps', 'research.wasm'], cwd=checkout,
                   env={**wasm_env, 'RESEARCH_SKIP_VIEWER': '0'}, check=True)
    git_dir = git('rev-parse', '--absolute-git-dir').decode().strip()
    subprocess.run(['npm', 'run', 'build'], cwd=web,
                   env={**env, 'GIT_DIR': git_dir, 'GIT_WORK_TREE': str(checkout)}, check=True)
    site = {f'web/dist/{name}': checksum for name, checksum in inventory(web / 'dist').items()}
    return runtime | site


def parity_required(base, paths):
    before = json.loads(git('show', f'{base}:{FLAGS}'))
    after = json.loads((ROOT / FLAGS).read_text())
    return ('required' in trailers(base, 'Production-Parity') or LEGACY_OVERLAY in paths
            or profiles_enable_off_switch(before, after))


def build_side(side, checkout, head, base, intended, env):
    started = time.monotonic()
    if side == 'reference':
        snapshot(base, checkout, intended)
    else:
        snapshot(head, checkout, changed_paths(head))
    result = build(checkout, env)
    print(f'Production parity: {side} built and inventoried in {time.monotonic() - started:.1f}s', flush=True)
    return result


def write_inventory(path, side, head, base, files):
    path.write_text(json.dumps({
        'side': side, 'head': head, 'base': base,
        'files': {name: checksum.hex() for name, checksum in files.items()},
    }, sort_keys=True))


def read_inventory(path, side, head, base):
    try:
        data = json.loads(path.read_text())
        if (data['side'], data['head'], data['base']) != (side, head, base):
            raise ValueError('wrong snapshot identity')
        files = {name: bytes.fromhex(checksum) for name, checksum in data['files'].items()}
        if not {*SOLVER_RUNTIME, 'web/dist/index.html'} <= files.keys() or any(len(digest) != 32 for digest in files.values()):
            raise ValueError('missing outputs or invalid checksums')
    except (OSError, ValueError, AttributeError, KeyError, TypeError) as error:
        raise RuntimeError(f'Invalid production parity inventory {path}: {error}') from error
    return files


def compare(reference, candidate, base):
    changed = differences(reference, candidate)
    if changed:
        artifacts = '\n  '.join(changed[:20])
        raise SystemExit(f'Switch-off production differs from {base[:12]} plus declared production changes '
                         f'({len(changed)} output files):\n  {artifacts}\n'
                         'Keep feature-only changes behind the switch and declare intentional production paths with '
                         'Production-Change trailers.')
    print(f'Production parity: all built files match {base[:12]} plus declared production changes.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base', nargs='?', default='origin/main')
    parser.add_argument('--required', action='store_true')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true')
    mode.add_argument('--side', choices=('reference', 'candidate'))
    mode.add_argument('--compare', type=Path)
    parser.add_argument('--inventory', type=Path)
    parser.add_argument('--scratch', type=Path)
    args = parser.parse_args()
    if bool(args.side) != bool(args.inventory) or (args.scratch and not args.side):
        parser.error('--side and --inventory must be used together; --scratch requires --side')

    head = git('rev-parse', 'HEAD').decode().strip()
    base = git('merge-base', args.base, head).decode().strip()
    paths = changed_paths(base)
    required = parity_required(base, paths) or args.required
    if args.plan:
        print(str(required).lower())
        return
    if not required:
        if args.side or args.compare:
            raise SystemExit('Production parity was scheduled without an active switch-off check.')
        print('Production parity: no switch-only changes declared and no newly enabled off switch.')
        return
    if args.compare:
        compare(read_inventory(args.compare / 'reference.json', 'reference', head, base),
                read_inventory(args.compare / 'candidate.json', 'candidate', head, base), base)
        return

    intended = trailers(base, 'Production-Change')
    if intended - paths or any(p.startswith('-') or p == LEGACY_OVERLAY for p in intended):
        raise SystemExit('Production-Change trailers must name actual changed paths outside the legacy overlay.')
    engine_paths = changed_paths(base, *ENGINE_INPUTS) - intended
    engine_paths -= changed_paths(base, 'engine/src', 'engine/Cargo.toml')
    if engine_paths:
        raise SystemExit('Switch-off production engine inputs differ from the reference:\n  ' + '\n  '.join(sorted(engine_paths)))
    timestamp = int(git('show', '-s', '--format=%ct', head))
    date = datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat()
    env = {**os.environ, 'GITHUB_SHA': base, 'PRERENDER_GITHUB_STARS': 'none', 'PRERENDER_BUILD_DATE': date}
    for key in ('VITE_E2E', 'VITE_APP_TYPE', 'STABILEO_E2E_PROFILE', 'PRERENDER_ONLY', 'PRERENDER_OUT'):
        env.pop(key, None)

    def run(directory):
        checkout = directory / 'checkout'
        if args.side:
            write_inventory(args.inventory, args.side, head, base,
                            build_side(args.side, checkout, head, base, intended, env))
        else:
            reference = build_side('reference', checkout, head, base, intended, env)
            shutil.rmtree(checkout)
            candidate = build_side('candidate', checkout, head, base, intended, env)
            compare(reference, candidate, base)

    if args.scratch:
        directory = args.scratch.resolve()
        directory.mkdir()
        try:
            run(directory)
        finally:
            shutil.rmtree(directory)
    else:
        with tempfile.TemporaryDirectory(prefix='.production-parity-', dir=ROOT) as directory:
            run(Path(directory))


if __name__ == '__main__':
    main()

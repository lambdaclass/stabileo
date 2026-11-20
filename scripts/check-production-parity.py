import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FLAGS = 'web/config/features.json'
LEGACY_OVERLAY = 'web/config/pro-plates-off.json'
WASM_DIRS = ('web/src/lib/wasm', 'web/public/research-wasm')
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
    with subprocess.Popen(['git', 'archive', base], cwd=ROOT, stdout=subprocess.PIPE) as archive:
        with tarfile.open(fileobj=archive.stdout, mode='r|') as tree:
            tree.extractall(target, filter='data')
        if archive.wait():
            raise RuntimeError(f'Cannot extract the production reference at {base}')
    if intended:
        patch = git('diff', '--binary', base, '--', *(f':(literal){p}' for p in sorted(intended)))
        subprocess.run(['git', 'apply', '--binary', '-'], cwd=target, input=patch, check=True,
                       env={**os.environ, 'GIT_CEILING_DIRECTORIES': str(ROOT)})


def inventory(directory):
    files = {}
    for path in directory.rglob('*'):
        if path.is_file():
            with path.open('rb') as source:
                files[path.relative_to(directory).as_posix()] = hashlib.file_digest(source, 'sha256').digest()
    if 'index.html' not in files:
        raise RuntimeError(f'Production build at {directory} did not emit index.html')
    return files


def differences(reference, candidate):
    return sorted(path for path in reference.keys() | candidate.keys() if reference.get(path) != candidate.get(path))


def build(checkout, env):
    web = checkout / 'web'
    for runtime in WASM_DIRS:
        path = ROOT / runtime
        if path.is_dir():
            shutil.copytree(path, checkout / runtime, dirs_exist_ok=True)
    if (ROOT / 'web/package-lock.json').read_bytes() == (web / 'package-lock.json').read_bytes():
        (web / 'node_modules').symlink_to(ROOT / 'web/node_modules', target_is_directory=True)
    else:
        subprocess.run(['make', 'web.deps', 'NIX_RUN='], cwd=checkout, check=True)
    git_dir = git('rev-parse', '--absolute-git-dir').decode().strip()
    subprocess.run(['npm', 'run', 'build'], cwd=web,
                   env={**env, 'GIT_DIR': git_dir, 'GIT_WORK_TREE': str(checkout)}, check=True)
    return inventory(web / 'dist')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base', nargs='?', default='origin/main')
    parser.add_argument('--required', action='store_true')
    args = parser.parse_args()
    base = git('merge-base', args.base, 'HEAD').decode().strip()
    paths = changed_paths(base)
    before = json.loads(git('show', f'{base}:{FLAGS}'))
    after = json.loads((ROOT / FLAGS).read_text())
    required = args.required or 'required' in trailers(base, 'Production-Parity')
    if not (required or LEGACY_OVERLAY in paths or profiles_enable_off_switch(before, after)):
        print('Production parity: no switch-only changes declared and no newly enabled off switch.')
        return
    intended = trailers(base, 'Production-Change')
    if intended - paths or any(p.startswith('-') or p == LEGACY_OVERLAY for p in intended):
        raise SystemExit('Production-Change trailers must name actual changed paths outside the legacy overlay.')
    engine_paths = changed_paths(base, *ENGINE_INPUTS) - intended
    if engine_paths:
        raise SystemExit('Switch-off production engine inputs differ from the reference:\n  ' + '\n  '.join(sorted(engine_paths)))
    env = {**os.environ, 'GITHUB_SHA': base, 'PRERENDER_GITHUB_STARS': 'none'}
    for key in ('VITE_E2E', 'VITE_APP_TYPE', 'STABILEO_E2E_PROFILE', 'PRERENDER_ONLY', 'PRERENDER_OUT'):
        env.pop(key, None)
    with tempfile.TemporaryDirectory(prefix='.production-parity-', dir=ROOT) as directory:
        work = Path(directory)
        reference, candidate = work / 'reference', work / 'candidate'
        snapshot(base, reference, intended)
        snapshot(base, candidate, paths)
        changed = differences(build(reference, env), build(candidate, env))
    if changed:
        artifacts = '\n  '.join(changed[:20])
        raise SystemExit(f'Switch-off production differs from {base[:12]} plus declared production changes '
                         f'({len(changed)} output files):\n  {artifacts}\n'
                         'Keep feature-only changes behind the switch and declare intentional production paths with '
                         'Production-Change trailers.')
    print(f'Production parity: all built files match {base[:12]} plus declared production changes.')


if __name__ == '__main__':
    main()

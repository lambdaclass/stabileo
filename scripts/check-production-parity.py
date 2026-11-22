import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FLAGS = 'web/config/features.json'
LEGACY_OVERLAY = 'web/config/pro-plates-off.json'
SOLVER_RUNTIME = ('web/src/lib/wasm/dedaliano_engine.js', 'web/src/lib/wasm/dedaliano_engine_bg.wasm')
ENGINE_BUILD_INPUTS = ('engine/build.rs', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'scripts/wasm-cached.sh',
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base', nargs='?', default='origin/main')
    parser.add_argument('--required', action='store_true')
    args = parser.parse_args()
    head = git('rev-parse', 'HEAD').decode().strip()
    base = git('merge-base', args.base, head).decode().strip()
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
    engine_paths = changed_paths(base, *ENGINE_BUILD_INPUTS) - intended
    if engine_paths:
        raise SystemExit('Switch-off production engine inputs differ from the reference:\n  ' + '\n  '.join(sorted(engine_paths)))
    env = {**os.environ, 'GITHUB_SHA': base, 'PRERENDER_GITHUB_STARS': 'none'}
    for key in ('VITE_E2E', 'VITE_APP_TYPE', 'STABILEO_E2E_PROFILE', 'PRERENDER_ONLY', 'PRERENDER_OUT'):
        env.pop(key, None)
    with tempfile.TemporaryDirectory(prefix='.production-parity-', dir=ROOT) as directory:
        checkout = Path(directory) / 'checkout'
        snapshot(base, checkout, intended)
        reference = build(checkout, env)
        shutil.rmtree(checkout)
        snapshot(head, checkout, changed_paths(head))
        changed = differences(reference, build(checkout, env))
    if changed:
        artifacts = '\n  '.join(changed[:20])
        raise SystemExit(f'Switch-off production differs from {base[:12]} plus declared production changes '
                         f'({len(changed)} output files):\n  {artifacts}\n'
                         'Keep feature-only changes behind the switch and declare intentional production paths with '
                         'Production-Change trailers.')
    print(f'Production parity: all built files match {base[:12]} plus declared production changes.')


if __name__ == '__main__':
    main()

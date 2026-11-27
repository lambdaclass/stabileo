import argparse
from contextlib import contextmanager
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
RESEARCH_WASM = 'web/public/research-wasm'
RESEARCH_INPUTS = ('research', 'engine', 'web', 'Makefile', 'Cargo.toml', 'Cargo.lock', '.cargo',
                   'flake.nix', 'flake.lock', 'rust-toolchain.toml', 'scripts', '.github/scripts',
                   '.gitattributes', '.gitignore')
SOLVER_RUNTIME = ('web/src/lib/wasm/dedaliano_engine.js', 'web/src/lib/wasm/dedaliano_engine_bg.wasm')
ENGINE_INPUTS = ('engine/src', 'engine/build.rs', 'engine/Cargo.toml', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'scripts/wasm-cached.sh',
                 '.github/scripts/build-research-wasm.sh', 'flake.nix', 'flake.lock')


def git(source, *args):
    return subprocess.check_output(['git', *args], cwd=source)


def trailers(source, base, key):
    values = git(source, 'log', f'--format=%(trailers:key={key},valueonly)', f'{base}..HEAD')
    return set(values.decode().splitlines()) - {''}


def profiles_enable_off_switch(before, after):
    return any(not after['production'][key] and profile[key]
               and not before.get(mode, {}).get(key, False)
               for mode, profile in after.items() if mode != 'production' for key in profile)


def changed_paths(source, base, *paths):
    return set(os.fsdecode(path) for path in
               git(source, 'diff', '--name-only', '--no-renames', '-z', base, '--', *paths).split(b'\0') if path)


def snapshot(source, base, target, intended):
    objects = git(source, 'rev-list', '--objects', '--no-object-names', '--missing=print', f'{base}^{{tree}}')
    missing = [line[1:] for line in objects.splitlines() if line.startswith(b'?')]
    if missing:
        fetched = subprocess.run(['git', 'cat-file', '--batch-check=%(objectname) %(objecttype)'],
                                 cwd=source, input=b'\n'.join(missing) + b'\n', stdout=subprocess.PIPE)
        if fetched.returncode or fetched.stdout.splitlines() != [oid + b' blob' for oid in missing]:
            raise RuntimeError(f'Production parity could not fetch all tracked blobs for {base}')
    subprocess.run(['git', 'clone', '--quiet', '--shared', '--no-checkout', str(source), str(target)], check=True)
    subprocess.run(['git', 'checkout', '--quiet', '--detach', base], cwd=target, check=True)
    if intended:
        patch = git(source, 'diff', '--binary', base, '--', *(f':(literal){p}' for p in sorted(intended)))
        subprocess.run(['git', 'apply', '--index', '--binary', '-'], cwd=target, input=patch, check=True)


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').digest()


def file_inventory(directory):
    return {path.relative_to(directory).as_posix(): digest(path)
            for path in directory.rglob('*') if path.is_file()}


def inventory(directory):
    files = file_inventory(directory)
    if 'index.html' not in files:
        raise RuntimeError(f'Production build at {directory} did not emit index.html')
    return files


def differences(reference, candidate):
    return sorted(path for path in reference.keys() | candidate.keys() if reference.get(path) != candidate.get(path))


def research_inputs(checkout, tree):
    entries = subprocess.check_output(
        ['git', 'ls-tree', '-r', '-z', tree, '--', *RESEARCH_INPUTS], cwd=checkout)
    return hashlib.sha256(entries).hexdigest()


def research_sides(source, base, head):
    if research_inputs(source, base) == research_inputs(source, head):
        return ['reference']
    return ['reference', 'candidate']


def research_key(checkout, base, head):
    tree = subprocess.check_output(['git', 'write-tree'], cwd=checkout).decode().strip()
    return {'base': base, 'head': head, 'inputs': research_inputs(checkout, tree)}


def research_checksums(directory):
    return {name: checksum.hex() for name, checksum in file_inventory(directory).items()}


def stage_research(output, artifact, key):
    files = research_checksums(output)
    if not files:
        raise RuntimeError(f'Production parity research build at {output} did not emit any files')
    artifact.mkdir()
    shutil.copytree(output, artifact / 'assets')
    (artifact / 'manifest.json').write_text(json.dumps({'snapshot': key, 'files': files}, sort_keys=True))


def restore_research(artifact, output, key):
    try:
        manifest = json.loads((artifact / 'manifest.json').read_text())
    except (OSError, ValueError) as error:
        raise RuntimeError(f'Invalid production parity research artifact manifest at {artifact}') from error
    if not isinstance(manifest, dict) or manifest.get('snapshot') != key:
        raise RuntimeError(f'Production parity research artifact {artifact} has the wrong snapshot inputs')
    assets = artifact / 'assets'
    files = research_checksums(assets)
    if not files or files != manifest.get('files'):
        raise RuntimeError(f'Production parity research artifact {artifact} has incomplete or modified contents')
    shutil.copytree(assets, output)


def wasm_environment(checkout, env):
    wasm_env = {**env, 'STABILEO_GIT_COMMIT': env['GITHUB_SHA'], 'STABILEO_WASM_CACHE': '0',
                'CARGO_TARGET_DIR': str(checkout / 'target')}
    for key in ('MAKEFLAGS', 'MFLAGS', 'MAKEOVERRIDES'):
        wasm_env.pop(key, None)
    return wasm_env


def prepare_web(checkout):
    web = checkout / 'web'
    if (ROOT / 'web/package-lock.json').read_bytes() == (web / 'package-lock.json').read_bytes():
        (web / 'node_modules').symlink_to(ROOT / 'web/node_modules', target_is_directory=True)
    else:
        subprocess.run(['make', 'web.deps', 'NIX_RUN='], cwd=checkout, check=True)


def build_research(checkout, wasm_env):
    subprocess.run(['make', '--assume-old=web.deps', 'research.wasm'], cwd=checkout,
                   env={**wasm_env, 'RESEARCH_SKIP_VIEWER': '0'}, check=True)


def build(source, checkout, env, research=None):
    wasm_env = wasm_environment(checkout, env)
    subprocess.run(['make', 'wasm'], cwd=checkout, env=wasm_env, check=True)
    runtime = {}
    for name in SOLVER_RUNTIME:
        artifact = checkout / name
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f'WASM build at {checkout} did not emit {name}')
        runtime[name] = digest(artifact)

    prepare_web(checkout)
    if research is None:
        build_research(checkout, wasm_env)
    else:
        artifact, identity = research
        restore_research(artifact, checkout / RESEARCH_WASM, identity)
    web = checkout / 'web'
    git_dir = git(source, 'rev-parse', '--absolute-git-dir').decode().strip()
    subprocess.run(['npm', 'run', 'build'], cwd=web,
                   env={**env, 'GIT_DIR': git_dir, 'GIT_WORK_TREE': str(checkout)}, check=True)
    site = {f'web/dist/{name}': checksum for name, checksum in inventory(web / 'dist').items()}
    return runtime | site


def parity_required(source, base, paths):
    before = json.loads(git(source, 'show', f'{base}:{FLAGS}'))
    after = json.loads((source / FLAGS).read_text())
    return ('required' in trailers(source, base, 'Production-Parity') or LEGACY_OVERLAY in paths
            or profiles_enable_off_switch(before, after))


def snapshot_side(source, side, checkout, head, base, intended):
    if side == 'reference':
        snapshot(source, base, checkout, intended)
    else:
        snapshot(source, head, checkout, changed_paths(source, head))


def build_side(source, side, checkout, head, base, intended, env, research_artifact=None):
    started = time.monotonic()
    snapshot_side(source, side, checkout, head, base, intended)
    research = None
    if research_artifact is not None:
        research = (research_artifact, research_key(checkout, base, head))
    result = build(source, checkout, env, research)
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
    parser.add_argument('--candidate')
    parser.add_argument('--required', action='store_true')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true')
    mode.add_argument('--plan-research', action='store_true')
    mode.add_argument('--side', choices=('reference', 'candidate'))
    mode.add_argument('--compare', type=Path)
    parser.add_argument('--inventory', type=Path)
    parser.add_argument('--scratch', type=Path)
    parser.add_argument('--research-out', type=Path)
    parser.add_argument('--research-in', type=Path)
    args = parser.parse_args()
    if args.side and bool(args.inventory) == bool(args.research_out):
        parser.error('--side requires exactly one of --inventory or --research-out')
    if not args.side and any((args.inventory, args.research_out, args.scratch, args.research_in)):
        parser.error('--inventory, --research-out, --research-in and --scratch require --side')
    if args.research_in and not args.inventory:
        parser.error('--research-in requires --inventory')

    with candidate_source(args.candidate) as source:
        check(args, source)


@contextmanager
def candidate_source(candidate):
    if candidate is None:
        yield ROOT
        return

    with tempfile.TemporaryDirectory(prefix='.production-parity-', dir=ROOT) as directory:
        source = Path(directory) / 'candidate'
        git(ROOT, 'worktree', 'add', '--quiet', '--detach', str(source), candidate)
        try:
            yield source
        finally:
            git(ROOT, 'worktree', 'remove', str(source))


def check(args, source):
    head = git(source, 'rev-parse', 'HEAD').decode().strip()
    if args.candidate is None:
        base = git(source, 'merge-base', args.base, head).decode().strip()
    else:
        base = git(source, 'rev-parse', '--verify', f'{args.base}^{{commit}}').decode().strip()
    paths = changed_paths(source, base)
    required = parity_required(source, base, paths) or args.required
    if args.plan:
        print(str(required).lower())
        return
    if not required:
        if args.side or args.compare:
            raise SystemExit('Production parity was scheduled without an active switch-off check.')
        print('Production parity: no switch-only changes declared and no newly enabled off switch.')
        return
    if args.plan_research:
        print(json.dumps(research_sides(source, base, head)))
        return
    if args.compare:
        compare(read_inventory(args.compare / 'reference.json', 'reference', head, base),
                read_inventory(args.compare / 'candidate.json', 'candidate', head, base), base)
        return

    intended = trailers(source, base, 'Production-Change')
    if intended - paths or any(p.startswith('-') or p == LEGACY_OVERLAY for p in intended):
        raise SystemExit('Production-Change trailers must name actual changed paths outside the legacy overlay.')
    engine_paths = changed_paths(source, base, *ENGINE_INPUTS) - intended
    engine_paths -= changed_paths(source, base, 'engine/src', 'engine/Cargo.toml')
    if engine_paths:
        raise SystemExit('Switch-off production engine inputs differ from the reference:\n  ' + '\n  '.join(sorted(engine_paths)))
    timestamp = int(git(source, 'show', '-s', '--format=%ct', head))
    date = datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat()
    env = {**os.environ, 'GITHUB_SHA': base, 'PRERENDER_GITHUB_STARS': 'none', 'PRERENDER_BUILD_DATE': date}
    for key in ('VITE_E2E', 'VITE_APP_TYPE', 'STABILEO_E2E_PROFILE', 'PRERENDER_ONLY', 'PRERENDER_OUT'):
        env.pop(key, None)

    def run(directory):
        checkout = directory / 'checkout'
        if args.research_out:
            started = time.monotonic()
            snapshot_side(source, args.side, checkout, head, base, intended)
            key = research_key(checkout, base, head)
            prepare_web(checkout)
            build_research(checkout, wasm_environment(checkout, env))
            stage_research(checkout / RESEARCH_WASM, args.research_out, key)
            print(f'Production parity: {args.side} research assets built in {time.monotonic() - started:.1f}s',
                  flush=True)
        elif args.side:
            write_inventory(args.inventory, args.side, head, base,
                            build_side(source, args.side, checkout, head, base, intended, env, args.research_in))
        else:
            reference = build_side(source, 'reference', checkout, head, base, intended, env)
            shutil.rmtree(checkout)
            candidate = build_side(source, 'candidate', checkout, head, base, intended, env)
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

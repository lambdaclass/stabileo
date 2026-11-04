import hashlib
import os
import pathlib
import re
import subprocess
import tempfile
import yaml

root = pathlib.Path(__file__).resolve().parents[2]
workflow = yaml.safe_load((root / '.github/workflows/ci.yml').read_text())
research = yaml.safe_load((root / '.github/workflows/research.yml').read_text())
jobs = workflow['jobs']
assert 'research' in jobs['ci-ok']['needs']
assert jobs['ci-ok']['if'] == 'always()'
assert jobs['research']['uses'] == './.github/workflows/research.yml'
assert jobs['research']['needs'] == 'changes'
assert jobs['research']['if'] == "needs.changes.outputs.research == 'true'"
filters = yaml.safe_load(jobs['changes']['steps'][1]['with']['filters'])
assert {'research/**', 'web/**', '.github/workflows/research.yml'} <= set(x for x in filters['research'] if isinstance(x, str))
triggers = research.get('on', research.get(True))
assert 'workflow_call' in triggers
assert triggers['push']['branches'] == ['main']
assert set(triggers['push']['paths']) == {
    'research/**', '.github/workflows/research.yml', 'engine/**', 'web/**',
    'Cargo.lock', 'Cargo.toml', 'flake.*', 'rust-toolchain*', 'Makefile',
}
assert '.github/workflows/research.yml' in filters['ci_scripts']
assert 'actionlint .github/workflows/ci.yml .github/workflows/research.yml' in (root / 'Makefile').read_text()
assert 'pkgs.actionlint' in (root / 'flake.nix').read_text()
for job in research['jobs'].values():
    assert job['runs-on'] == 'ubuntu-24.04' or job['runs-on'].endswith("|| 'ubuntu-24.04' }}")
assert {'phasefield', 'catalog', 'isolation', 'route-size'} <= research['jobs'].keys()
# Network checks never run inside the required CI OK (the caller's workflow name is CI there).
assert workflow['name'] == 'CI'
for name, job in research['jobs'].items():
    online = any('--online' in step.get('run', '') or '--links' in step.get('run', '') for step in job['steps'])
    assert not online or job.get('if') == "github.workflow == 'Research'", name
    # A catalogue check without --offline contacts Crossref, so it counts as online too.
    for step in job['steps']:
        run = step.get('run', '')
        if 'catalog.py check' in run and job.get('if') != "github.workflow == 'Research'":
            assert '--offline' in run, (name, run)
for job, tests in {
    'isolation': ['test_asset_identity.py', 'test_docker_context.py'],
    'catalog': ['test_grossman_catalog.py'],
}.items():
    assert research['jobs'][job]['if'] == "${{ !inputs.route_only && (github.workflow != 'Research' || github.event_name != 'pull_request') }}"
    commands = [step.get('run', '') for step in research['jobs'][job]['steps']]
    for test in tests:
        assert any(f'-I research/tools/{test}' in command for command in commands), (job, test)
# Research changes use isolation; other changes use the separate product budget.
route = research['jobs']['route-size']['steps']
scope = next(step for step in route if step.get('id') == 'scope')
shipped = re.compile(scope['env']['RESEARCH_PATHS'])
not_shipped = re.compile(scope['env']['NOT_SHIPPED'])
class pattern:
    search = staticmethod(lambda path: shipped.search(path) and not not_shipped.search(path))
for path in ['research/papers.json', 'research/fracture/shauer-2025/reference-results/ex2_steps.csv', 'web/src/components/research/ResearchPage.svelte', 'web/public/research-wasm/x.wasm',
             'web/vite.research-viewer.config.ts']:
    assert pattern.search(path), path
for path in ['web/src/components/blog/ChangelogView.svelte', 'web/src/lib/changelog/index.ts', 'web/scripts/prerender.ts',
             'web/src/components/site/site-nav.ts', 'engine/src/lib.rs', 'research/tools/test_required_ci.py', 'research/README.md', 'research/CLAUDE.md',
             '.github/workflows/research.yml']:
    assert not pattern.search(path), path
assert '[ -z "$BASE" ]' in scope['run']
main_checkout = next(step for step in route if step.get('with', {}).get('path') == 'route-main')
assert route.index(main_checkout) < route.index(scope)
assert main_checkout['with']['ref'] == "${{ github.event.merge_group.base_sha || 'main' }}"
assert main_checkout['with']['fetch-depth'] == 0
assert 'if' not in main_checkout
assert scope['env']['CANDIDATE'] == '${{ github.event.pull_request.head.sha || github.sha }}'

assert scope['shell'] == 'bash'

def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@t', 'GIT_COMMITTER_NAME': 't',
                               'GIT_COMMITTER_EMAIL': 't@t', 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}).stdout.strip()

def commit(repo, paths, message):
    for path in paths:
        file = repo / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(message)
    git(repo, 'add', '-A')
    git(repo, 'commit', '--quiet', '--allow-empty', '-m', message)
    return git(repo, 'rev-parse', 'HEAD')

def check_scope(paths, expected, base='stale-event-base', main_checkout=True):
    with tempfile.TemporaryDirectory() as directory:
        directory = pathlib.Path(directory)
        origin = directory / 'origin'
        origin.mkdir()
        git(origin, 'init', '--quiet', '--initial-branch=main')
        commit(origin, ['README.md'], 'base')
        git(origin, 'checkout', '--quiet', '-b', 'pr')
        candidate = commit(origin, paths, 'pr')
        primary = directory / 'primary'
        git(directory, 'clone', '--quiet', str(origin), str(primary))
        git(origin, 'checkout', '--quiet', 'main')
        commit(origin, ['engine/src/lib.rs'], 'main moved after the PR checkout')
        if main_checkout:
            git(directory, 'clone', '--quiet', '--branch', 'main', str(origin), str(primary / 'route-main'))
        output = directory / 'output'
        run = subprocess.run(['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', scope['run']], cwd=primary,
                             env={**os.environ, **scope['env'], 'BASE': base, 'CANDIDATE': candidate,
                                  'GITHUB_OUTPUT': str(output)}, capture_output=True, text=True)
        if expected is None:
            assert run.returncode != 0, run
            assert '::error::' in run.stderr, run
            assert not output.exists(), run
        else:
            assert run.returncode == 0, (run.stdout, run.stderr)
            assert output.read_text() == f'research={expected}\n', output.read_text()

check_scope(['web/src/lib/provenance/result-changes.json'], 'false')
check_scope(['web/src/components/research/ResearchPage.svelte'], 'true')
check_scope(['research/papers.json'], 'true')
check_scope(['research/tools/fixture.json'], 'false')
check_scope([], 'false')
check_scope([], 'true', base='')
check_scope(['research/papers.json'], None, main_checkout=False)
check_scope([f'web/src/components/research/page{i}.svelte' for i in range(2000)], 'true')

def check_stacked_group(paths, expected):
    with tempfile.TemporaryDirectory() as directory:
        directory = pathlib.Path(directory)
        origin = directory / 'origin'
        origin.mkdir()
        git(origin, 'init', '--quiet', '--initial-branch=main')
        commit(origin, ['README.md'], 'main')
        git(origin, 'checkout', '--quiet', '-b', 'group-ahead')
        group_base = commit(origin, ['research/papers.json'], 'the group queued ahead touches research')
        git(origin, 'checkout', '--quiet', '-b', 'group')
        candidate = commit(origin, paths, 'this group')
        primary = directory / 'primary'
        git(directory, 'clone', '--quiet', str(origin), str(primary))
        git(directory, 'clone', '--quiet', str(origin), str(primary / 'route-main'))
        git(primary / 'route-main', 'checkout', '--quiet', group_base)
        output = directory / 'output'
        run = subprocess.run(['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', scope['run']], cwd=primary,
                             env={**os.environ, **scope['env'], 'BASE': group_base, 'CANDIDATE': candidate,
                                  'GITHUB_OUTPUT': str(output)}, capture_output=True, text=True)
        assert run.returncode == 0, (run.stdout, run.stderr)
        assert output.read_text() == f'research={expected}\n', output.read_text()

check_stacked_group(['web/src/lib/provenance/result-changes.json'], 'false')
check_stacked_group(['research/papers.json'], 'true')

measured = [step for step in route if 'check-research-route-size.mjs' in step.get('run', '')]
assert measured and all('if' not in step for step in measured)
assert measured[0]['env']['RESEARCH_ISOLATION'] == '${{ steps.scope.outputs.research }}'
copy = next(line for line in measured[0]['run'].splitlines() if line.startswith('cp '))
assert 'web/scripts/product-route-growth-budgets.json' in copy.split()
assert copy.split()[-1] == 'route-main/web/scripts/'
assert 'force_routes' not in jobs['research'].get('with', {})
assert 'FORCE_ROUTES' not in scope['env']
triggers = research.get('on', research.get(True))
assert set(triggers['pull_request']['paths']) == {
    'research/**', 'web/src/components/research/**', '.github/workflows/research.yml'}
for name, job in research['jobs'].items():
    if name != 'catalog-online':
        assert "github.workflow != 'Research' || github.event_name != 'pull_request'" in job['if'], name
script = jobs['ci-ok']['steps'][0]['run']
for result, expected in [('success', 0), ('skipped', 0), ('failure', 1), ('cancelled', 1)]:
    run = subprocess.run(['sh', '-c', script], env={'RESULTS': f'success skipped {result}'}, capture_output=True)
    assert run.returncode == expected, (result, run.stdout)
print('ok required research CI propagates failures and accepts skipped jobs')

koiter = research["jobs"]["koiter"]
assert koiter["runs-on"].endswith("|| 'ubuntu-24.04' }}") and koiter["if"] == "${{ !inputs.route_only && (github.workflow != 'Research' || github.event_name != 'pull_request') }}"
assert any("cargo test --release --locked" in step.get("run", "") for step in koiter["steps"])

assert set(triggers['pull_request']['paths']) == {'research/**', 'web/src/components/research/**', '.github/workflows/research.yml'}
for caller, event, route_only, expected in [
    ('Research', 'pull_request', False, {'catalog-online'}),
    ('CI', 'pull_request', False, set(research['jobs']) - {'catalog-online'}),
    ('CI', 'merge_group', False, set(research['jobs']) - {'catalog-online'}),
    ('CI', 'pull_request', True, {'route-size'}),
    ('Research', 'push', False, set(research['jobs'])),
    ('Research', 'schedule', False, set(research['jobs'])),
]:
    selected = set()
    for name, job in research['jobs'].items():
        condition = job.get('if', 'True').removeprefix('${{').removesuffix('}}').strip()
        condition = condition.replace('github.workflow', repr(caller)).replace('github.event_name', repr(event))
        condition = condition.replace('inputs.route_only', repr(route_only))
        condition = condition.replace('&&', ' and ').replace('||', ' or ')
        condition = re.sub(r'!(?!=)', 'not ', condition)
        if eval(condition, {'__builtins__': {}}, {}):
            selected.add(name)
    assert selected == expected, (caller, event, route_only, selected)
print('ok online audit runs on research PRs without duplicating required jobs')

steps = jobs['research-wasm']['steps']
caches = {step['id'].removeprefix('research-'): step for step in steps if step.get('id', '').startswith('research-')}
assert set(caches) == {'shauer-2025', 'andreassen-2011', 'biggins-2026', 'grossman-2026', 'pastrana-2026', 'fairclough-2026'}, sorted(caches)
for name, cache in caches.items():
    assert cache['with']['path'] == f'web/public/research-wasm/{name}', name
build = next(step for step in steps if step.get('name') == 'Build research WASM (cache misses, in parallel)')
assert 'if' not in build and build['id'] == 'build-research'
assert build['timeout-minutes'] + 10 <= jobs['research-wasm']['timeout-minutes'], 'the build step must stop early enough for the saves to run'
assert re.findall(r"steps\.research-([\w-]+)\.outputs\.cache-hit != 'true' && steps\.retry-([\w-]+)\.outputs\.cache-hit != 'true' && '([\w-]+)'", build['run']) == [(name, name, name) for name in caches], build['run']
listed = subprocess.run(['.github/scripts/build-research-wasm.sh', '--list'], capture_output=True, text=True, check=True).stdout.split('\n')
assert sorted(line.split()[0] for line in listed if line) == sorted(caches)
for name, cache in caches.items():
    retry = next(step for step in steps if step.get('id') == f'retry-{name}')
    assert retry['if'] == f"steps.research-{name}.outputs.cache-hit != 'true'" and retry['with'] == cache['with'], name
    saves = [step for step in steps if step.get('name') == f'Save research compiled assets ({name})']
    assert len(saves) == 1 and saves[0]['if'] == f"always() && steps.build-research.outputs.{name} == 'ok'", name
    assert saves[0]['with']['path'] == cache['with']['path'], name
    assert saves[0]['with']['key'] == f"${{{{ steps.research-{name}.outputs.cache-primary-key || steps.retry-{name}.outputs.cache-primary-key }}}}", name
    assert steps.index(build) < steps.index(saves[0]), name
    for step in (cache, retry):
        assert step['uses'].startswith('actions/cache/restore@') and step.get('continue-on-error') is True, name
    assert saves[0]['uses'].startswith('actions/cache/save@') and saves[0].get('continue-on-error') is True, name
print('ok each research bundle is cached on its own, rebuilt only on its own miss, and saved as soon as the parallel build finishes it')

def patterns_of(cache):
    return re.findall(r"'([^']+)'", re.search(r'hashFiles\((.*?)\)', cache['with']['key']).group(1))

with tempfile.TemporaryDirectory() as directory:
    checkout = pathlib.Path(directory)
    def cache_digest(patterns):
        files = set()
        for glob in patterns:
            matched = checkout.glob(glob + '/*' if glob.endswith('/**') else glob)
            files.update(path for path in matched if path.is_file())
        return hashlib.sha256(b''.join(hashlib.sha256(path.read_bytes()).digest() for path in sorted(files))).hexdigest()

    def invalidated(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        before = {name: cache_digest(patterns_of(cache)) for name, cache in caches.items()}
        path.write_text('changed input')
        after = {name: cache_digest(patterns_of(cache)) for name, cache in caches.items()}
        path.unlink()
        assert {name: cache_digest(patterns_of(cache)) for name, cache in caches.items()} == before, path
        return {name for name in caches if after[name] != before[name]}

    engine = set(caches)
    for relative in ['engine/src/lib.rs', 'engine/Cargo.toml', 'engine/build.rs', 'engine/.cargo/config.toml']:
        assert invalidated(checkout / relative) == engine, relative
    for crate in ['research/fracture/shauer-2025', 'research/optimization/andreassen-2011', 'research/mechanics/biggins-2026',
                  'research/metamaterials/grossman-2026', 'research/form-finding/pastrana-2026', 'research/optimisation/fairclough-2026']:
        assert 'dedaliano-engine' in pathlib.Path(crate, 'Cargo.toml').read_text(), crate
    for relative in ['flake.lock', 'Cargo.lock', 'rust-toolchain.toml', 'research/tools/asset_identity.py']:
        assert invalidated(checkout / relative) == set(caches), relative
    assert invalidated(checkout / 'research/fracture/shauer-2025/wasm/trim_exports.py') == {'shauer-2025', 'biggins-2026'}
    for name, crate in [('shauer-2025', 'research/fracture/shauer-2025'), ('grossman-2026', 'research/metamaterials/grossman-2026'),
                        ('andreassen-2011', 'research/optimization/andreassen-2011'), ('pastrana-2026', 'research/form-finding/pastrana-2026'),
                        ('biggins-2026', 'research/mechanics/biggins-2026'), ('fairclough-2026', 'research/optimisation/fairclough-2026')]:
        for relative in ['build.rs', 'wasm/build.rs', 'build/linker.ld', 'wasm/build/memory-limits.json', '.cargo/config.toml', 'wasm/build.sh']:
            assert invalidated(checkout / crate / relative) == {name}, (crate, relative)
print('ok research caches invalidate for their own inputs, and every engine change for all of them')

import os
import tempfile
import pathlib
import subprocess
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
assert 'workflow_call' in research.get('on', research.get(True))
for job in research['jobs'].values():
    assert job['runs-on'] == 'ubuntu-latest'
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
    assert 'if' not in research['jobs'][job]
    commands = [step.get('run', '') for step in research['jobs'][job]['steps']]
    for test in tests:
        assert any(f'-I research/tools/{test}' in command for command in commands), (job, test)
# The route budget measures a change that touches research code, and every push to main.
import re
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
assert main_checkout['with']['ref'] == 'main'
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

measured = [step for step in route if 'check-research-route-size.mjs' in step.get('run', '')]
assert measured and all(step.get('if') == "steps.scope.outputs.research == 'true'" for step in measured)
script = jobs['ci-ok']['steps'][0]['run']
for result, expected in [('success', 0), ('skipped', 0), ('failure', 1), ('cancelled', 1)]:
    run = subprocess.run(['sh', '-c', script], env={'RESULTS': f'success skipped {result}'}, capture_output=True)
    assert run.returncode == expected, (result, run.stdout)
print('ok required research CI propagates failures and accepts skipped jobs')

koiter = research["jobs"]["koiter"]
assert koiter["runs-on"] == "ubuntu-latest" and "if" not in koiter
assert any("cargo test --release --locked" in step.get("run", "") for step in koiter["steps"])

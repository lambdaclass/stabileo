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
    assert research['jobs'][job]['if'] == "${{ !inputs.route_only && (github.workflow != 'Research' || github.event_name != 'pull_request') }}"
    commands = [step.get('run', '') for step in research['jobs'][job]['steps']]
    for test in tests:
        assert any(f'-I research/tools/{test}' in command for command in commands), (job, test)
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
measured = [step for step in route if 'check-research-route-size.mjs' in step.get('run', '')]
assert measured and all('if' not in step for step in measured)
assert measured[0]['env']['RESEARCH_ISOLATION'] == '${{ steps.scope.outputs.research }}'
assert 'force_routes' not in jobs['research'].get('with', {})
assert 'FORCE_ROUTES' not in scope['env']
assert 'github.event.merge_group.base_sha' in scope['env']['BASE']
assert 'github.event.before' in scope['env']['BASE']
import tempfile
for paths, expected in [
    ('web/src/App.svelte', 'false'),
    ('web/package-lock.json', 'false'),
    ('web/src/components/research/ResearchPage.svelte', 'true'),
    ('web/src/App.svelte\nresearch/papers.json', 'true'),
    ('research/tools/catalog.py', 'false'),
]:
    with tempfile.NamedTemporaryFile() as out:
        script = scope['run'].replace('git diff --no-renames --name-only "$BASE" HEAD', 'printf "%s\\n" "$TEST_PATHS"')
        script = script.replace('/tmp/route-changed-paths', out.name + '.paths')
        try:
            subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script], check=True,
                           env={**scope['env'], 'BASE': 'base', 'TEST_PATHS': paths, 'GITHUB_OUTPUT': out.name})
            assert pathlib.Path(out.name).read_text().strip() == f'research={expected}'
        finally:
            pathlib.Path(out.name + '.paths').unlink(missing_ok=True)
with tempfile.NamedTemporaryFile() as out:
    subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', scope['run']], check=True,
                   env={**scope['env'], 'BASE': '', 'GITHUB_OUTPUT': out.name})
    assert pathlib.Path(out.name).read_text().strip() == 'research=true'
    failed_diff = scope['run'].replace('git diff --no-renames --name-only "$BASE" HEAD', 'false')
    result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', failed_diff.replace('/tmp/route-changed-paths', out.name)],
                            env={**scope['env'], 'BASE': 'missing', 'GITHUB_OUTPUT': out.name})
    assert result.returncode != 0
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
assert koiter["runs-on"] == "ubuntu-latest" and koiter["if"] == "${{ !inputs.route_only && (github.workflow != 'Research' || github.event_name != 'pull_request') }}"
assert any("cargo test --release --locked" in step.get("run", "") for step in koiter["steps"])

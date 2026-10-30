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

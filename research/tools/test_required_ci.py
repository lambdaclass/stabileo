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
script = jobs['ci-ok']['steps'][0]['run']
for result, expected in [('success', 0), ('skipped', 0), ('failure', 1), ('cancelled', 1)]:
    run = subprocess.run(['sh', '-c', script], env={'RESULTS': f'success skipped {result}'}, capture_output=True)
    assert run.returncode == expected, (result, run.stdout)
print('ok required research CI propagates failures and accepts skipped jobs')

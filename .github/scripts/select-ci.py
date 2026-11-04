"""Conservative PR path -> jobs/spec globs. No paths or unknown/mixed areas mean full.

The merge queue runs the full set minus the heavy jobs that combining PRs rarely breaks
(slow E2E, visual baselines, Docker smoke, Determinism, quarantined E2E, research validation
beyond route budgets); pushes to main and the scheduled run add them back.
"""
import json
import os
import re
from pathlib import Path
import subprocess

SPECS = {
    'research': ['research*.spec.ts'],
    'tools': ['tools*.spec.ts'],
    'engine': ['certificate-end-to-end.spec.ts', 'basic-pdelta.spec.ts', 'engine-i18n.spec.ts'],
}


POST_MERGE_EVENTS = ('push', 'schedule', 'workflow_dispatch')


def area(path):
    if not isinstance(path, str) or path.startswith('/') or '..' in path.split('/'):
        return 'full'
    if path.startswith(('docs/', 'changelog.d/')) or ('/' not in path and path.endswith('.md')):
        return 'docs'
    if path.startswith(('research/', 'web/src/components/research/')) or re.fullmatch(r'web/e2e/research[^/]*\.spec\.ts', path):
        return 'research'
    if path.startswith('web/src/components/tools/') or re.fullmatch(r'web/e2e/tools[^/]*\.spec\.ts', path):
        return 'tools'
    if path.startswith('engine/'):
        return 'engine'
    return 'full'


def select(event, paths, root=None, force_full=False, tested=False):
    scope = 'full'
    if event == 'pull_request' and isinstance(paths, list) and paths and not force_full:
        areas = {area(path) for path in paths} - {'docs'}
        scope = next(iter(areas)) if len(areas) == 1 else ('docs' if not areas else 'full')
    # An area without unit tests or matching specs is not safe to narrow (tools is
    # reserved for that component directory, which does not exist on every branch).
    if root is not None and scope in ('research', 'tools'):
        units = root / 'web/src/components' / scope
        if not any(units.rglob('*.test.ts')) or not all(list((root / 'web/e2e').glob(g)) for g in SPECS[scope]):
            scope = 'full'
    full = scope == 'full'
    queue = event == 'merge_group'
    outputs = {key: full for key in ('backend', 'ci_scripts')}
    outputs.update(docker=scope != 'docs' and not queue, web_build=scope != 'docs', ai_backend=full or scope == 'engine',
                   engine=full or scope == 'engine', web=scope != 'docs',
                   research=full or scope in ('research', 'tools', 'engine'),
                   research_route_only=queue or scope == 'tools',
                   determinism=(full or scope == 'engine') and not queue, results=full or scope == 'engine',
                   flaky=full and not queue, slow_e2e=event in POST_MERGE_EVENTS, retest=True)
    if event == 'push' and tested:
        outputs.update(backend=False, ci_scripts=False, ai_backend=False, engine=False, results=False, retest=False)
    outputs = {key: str(value).lower() for key, value in outputs.items()}
    outputs.update(scope=scope, unit_area=scope if scope in ('research', 'tools') else '',
                   e2e_specs=json.dumps(SPECS.get(scope, [])),
                   e2e_shards=json.dumps(list(range(1, 11)) if full else [1]),
                   e2e_total='10' if full else '1')
    return outputs


if __name__ == '__main__':
    try:
        paths = json.loads(os.environ.get('CHANGED_FILES', 'null'))
    except (ValueError, TypeError):
        paths = None
    # Include both sides of renames: an app file moved into docs is still an
    # app deletion. Diff the PR's merge base, so stacked PRs stay relative to
    # their actual base. Any missing history fails open to the full pipeline.
    if os.environ.get('GITHUB_EVENT_NAME') == 'pull_request':
        try:
            base = subprocess.check_output(['git', 'merge-base', os.environ['BASE_SHA'],
                                            os.environ['HEAD_SHA']], text=True).strip()
            names = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only',
                                             '-z', base, os.environ['HEAD_SHA']], text=True)
            if not isinstance(paths, list):
                raise ValueError('missing path-filter result')
            paths += names.rstrip('\0').split('\0') if names else []
        except (KeyError, ValueError, subprocess.CalledProcessError):
            paths = None
    outputs = select(os.environ.get('GITHUB_EVENT_NAME'), paths,
                     Path(__file__).resolve().parents[2], os.environ.get('FORCE_FULL') == 'true',
                     os.environ.get('TESTED') == 'true')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        for key, value in outputs.items():
            print(f'{key}={value}', file=out)
    print(json.dumps(outputs, indent=2))

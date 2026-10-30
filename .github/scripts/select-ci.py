"""Conservative PR path -> jobs/spec globs. No paths or unknown/mixed areas mean full."""
import json
import os
from pathlib import Path
import subprocess

SPECS = {
    'research': ['research*.spec.ts'],
    'tools': ['tools*.spec.ts'],
    'engine': ['certificate-end-to-end.spec.ts', 'basic-pdelta.spec.ts', 'engine-i18n.spec.ts'],
}


def area(path):
    if not isinstance(path, str) or path.startswith('/') or '..' in path.split('/'):
        return 'full'
    if path.startswith(('docs/', 'changelog.d/')) or ('/' not in path and path.endswith('.md')):
        return 'docs'
    if path.startswith(('research/', 'web/src/components/research/')) or (path.startswith('web/e2e/research') and path.endswith('.spec.ts')):
        return 'research'
    if path.startswith('web/src/components/tools/') or (path.startswith('web/e2e/tools') and path.endswith('.spec.ts')):
        return 'tools'
    if path.startswith('engine/'):
        return 'engine'
    return 'full'


def select(event, paths, root=None, force_full=False):
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
    outputs = {key: full for key in ('backend', 'ci_scripts', 'flaky')}
    outputs.update(docker=scope != 'docs', web_build=scope != 'docs', ai_backend=full or scope == 'engine',
                   engine=full or scope == 'engine', web=scope != 'docs',
                   research=full or scope in ('research', 'tools', 'engine'),
                   determinism=full or scope == 'engine', results=full or scope == 'engine')
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
                     Path(__file__).resolve().parents[2], os.environ.get('FORCE_FULL') == 'true')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        for key, value in outputs.items():
            print(f'{key}={value}', file=out)
    print(json.dumps(outputs, indent=2))

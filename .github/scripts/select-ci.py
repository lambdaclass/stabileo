"""Conservative PR and merge-group path -> jobs/spec globs. No paths or unknown/mixed areas mean full.

A merge group narrows only to docs, to the Elixir backend, or to site (no engine path); the merge queue otherwise runs the full set minus the heavy jobs that combining PRs rarely breaks
(slow E2E, visual baselines, Docker smoke, Determinism, quarantined E2E, research validation
beyond route budgets); pushes to main and the scheduled run add them back. A pull request builds
the Docker image from source only when the Dockerfile's recipe or a toolchain or dependency pin it
reads changes; otherwise it builds the image around the tested site, and main builds both.
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
E2E_SHARDS = 14
DOCKER_SOURCE_INPUTS = re.compile(
    r'Dockerfile|\.dockerignore|rust-toolchain(\.toml)?|\.nvmrc|(.*/)?Cargo\.(toml|lock)|engine/\.cargo/.*'
    r'|web/package(-lock)?\.json|web/scripts/check-research-springs\.mjs|web/vite\.research-viewer\.config\.ts'
    r'|research/.*/wasm/.*|research/tools/publish_assets\.py')


SITE_EXCLUDED = ('web/package.json', 'web/package-lock.json', 'web/src/lib/wasm/', 'web/public/research-wasm',
                 'web/vite.research-viewer.config.ts', 'web/Dockerfile')
REPO_ROOT = Path(__file__).resolve().parents[2]


SLOW_TAG = re.compile(r'@slow\b')
IMPORT = re.compile(r'''(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]''')


def _resolve(base, spec):
    target = (base.parent / spec).resolve()
    for candidate in (target, target.with_name(target.name + '.ts'), target.with_name(target.name + '.mjs'),
                      target.with_name(target.name + '.js'), target / 'index.ts'):
        if candidate.is_file():
            return candidate
    return None


def _reaches_slow(path, seen):
    if path in seen:
        return False
    seen.add(path)
    source = path.read_text(errors='replace')
    if SLOW_TAG.search(source):
        return True
    for spec in IMPORT.findall(source):
        target = _resolve(path, spec)
        if target is not None and target.suffix in ('.ts', '.mjs', '.js') and _reaches_slow(target, seen):
            return True
    return False


def discover_slow_specs(e2e_dir):
    return tuple(p.name for p in sorted(e2e_dir.glob('*.spec.ts'))
                 if p.name != 'rc-design-visual.spec.ts' and _reaches_slow(p.resolve(), set()))


ALL_SLOW_SPECS = discover_slow_specs(REPO_ROOT / 'web/e2e')
ALL_SLOW_SET = frozenset(ALL_SLOW_SPECS)
RESEARCH_SLOW_SPECS = ('research-dadeppo.spec.ts', 'research-ferrari.spec.ts')


def slow_specs_for_path(path):
    if not isinstance(path, str) or not path or path.startswith('/') or '..' in path.split('/'):
        return ALL_SLOW_SPECS
    if path.startswith(('docs/', 'changelog.d/', 'specs/', 'backend/', 'verify/', 'tools/', 'ai-backend/',
                        'engine/tests/', 'engine/benches/', 'scripts/tests/')):
        return ()
    if '/' not in path and path.endswith('.md'):
        return ()
    if path.startswith('research/') and path.endswith('.md') and not path.startswith('research/tools/'):
        return ()
    if path.startswith(('web/src/components/tools/', 'web/src/components/paper/', 'web/src/lib/paper/',
                        'web/src/admin/', 'web/src/components/account/')):
        return ()
    if path.startswith('web/src/') and (path.endswith('.test.ts') or '/__tests__/' in path):
        return ()
    if path in ('web/scripts/e2e-shard.mjs', 'web/playwright.config.ts') or path.startswith('web/e2e/shard-timings'):
        return ALL_SLOW_SPECS
    if path.startswith('web/scripts/') and re.search(r'(^|/)(__tests__/|[^/]+\.test\.(m?js|ts)$)', path):
        return ()
    if path.startswith(('research/', 'web/src/components/research/', 'web/public/research-wasm')):
        return RESEARCH_SLOW_SPECS
    if re.fullmatch(r'web/e2e/[^/]+\.spec\.ts', path):
        name = path.rsplit('/', 1)[1]
        return (name,) if name in ALL_SLOW_SET else ()
    return ALL_SLOW_SPECS


def select_slow_specs(paths):
    try:
        if not isinstance(paths, list) or not paths:
            return list(ALL_SLOW_SPECS)
        selected = set()
        for path in paths:
            specs = slow_specs_for_path(path)
            if specs is ALL_SLOW_SPECS:
                return list(ALL_SLOW_SPECS)
            selected.update(s for s in specs if s in ALL_SLOW_SET)
        return sorted(selected)
    except Exception:
        return list(ALL_SLOW_SPECS)


def area(path):
    if not isinstance(path, str) or path.startswith('/') or '..' in path.split('/'):
        return 'full'
    if path.startswith(('docs/', 'changelog.d/')) or ('/' not in path and path.endswith('.md')):
        return 'docs'
    if path.startswith('specs/') and path.endswith('.md'):
        return 'docs'
    if path.startswith('backend/'):
        return 'backend'
    if path.startswith('research/') and path.endswith('.md') and not path.startswith('research/tools/'):
        return 'prose'
    if path.startswith(('research/', 'web/src/components/research/')) or re.fullmatch(r'web/e2e/research[^/]*\.spec\.ts', path):
        return 'research'
    if path.startswith('web/src/components/tools/') or re.fullmatch(r'web/e2e/tools[^/]*\.spec\.ts', path):
        return 'tools'
    if path.startswith('engine/'):
        return 'engine'
    if path.startswith('web/') and not path.startswith(SITE_EXCLUDED):
        return 'site'
    return 'full'


def narrow(areas, queue):
    if not areas - {'docs', 'prose'}:
        return 'prose' if 'prose' in areas else 'docs'
    if areas - {'docs'} == {'backend'}:
        return 'backend'
    if 'backend' in areas:
        return 'full'
    areas = areas - {'docs', 'prose'}
    if queue:
        return 'site' if areas <= {'site', 'research', 'tools'} else 'full'
    return next(iter(areas)) if len(areas) == 1 else 'full'


def select(event, paths, root=None, force_full=False, tested=False):
    scope = 'full'
    queue = event == 'merge_group'
    if event in ('pull_request', 'merge_group') and isinstance(paths, list) and paths and not force_full:
        scope = narrow({area(path) for path in paths}, queue)
    # An area without unit tests or matching specs is not safe to narrow (tools is
    # reserved for that component directory, which does not exist on every branch).
    if root is not None and scope in ('research', 'tools'):
        units = root / 'web/src/components' / scope
        if not any(units.rglob('*.test.ts')) or not all(list((root / 'web/e2e').glob(g)) for g in SPECS[scope]):
            scope = 'full'
    full = scope == 'full'
    text = scope in ('docs', 'prose', 'backend')
    if event == 'pull_request':
        slow = list(ALL_SLOW_SPECS) if force_full else []
        slow_e2e = False
    elif queue:
        slow = list(ALL_SLOW_SPECS) if force_full else select_slow_specs(paths)
        slow_e2e = bool(slow)
    else:
        slow = list(ALL_SLOW_SPECS)
        slow_e2e = True
    outputs = {'backend': full or scope == 'backend', 'ci_scripts': full or scope == 'site'}
    outputs.update(docker=not text and not queue, web_build=not text or slow_e2e, ai_backend=full or scope == 'engine',
                   engine=full or scope == 'engine', web=not text or slow_e2e,
                   research=full or scope in ('research', 'tools', 'engine', 'site', 'prose'),
                   research_route_only=queue or scope in ('tools', 'site'),
                   determinism=(full or scope in ('engine', 'site')) and not queue, results=full or scope in ('engine', 'site'),
                   flaky=(full or scope == 'site') and not queue, slow_e2e=slow_e2e, retest=True)
    outputs['docker_source'] = outputs['docker'] and (
        event != 'pull_request' or force_full or not isinstance(paths, list) or not paths
        or any(not isinstance(path, str) or DOCKER_SOURCE_INPUTS.fullmatch(path) for path in paths))
    if event == 'push' and tested:
        outputs.update(backend=False, ci_scripts=False, ai_backend=False, engine=False, results=False, retest=False)
    outputs = {key: str(value).lower() for key, value in outputs.items()}
    sharded = full or scope == 'site' or slow_e2e
    outputs.update(scope=scope, unit_area=scope if scope in ('research', 'tools') else '',
                   e2e_specs=json.dumps(SPECS.get(scope, [])),
                   slow_specs=json.dumps(slow),
                   e2e_shards=json.dumps(list(range(1, E2E_SHARDS + 1)) if sharded else [1]),
                   e2e_total=str(E2E_SHARDS) if sharded else '1')
    return outputs


if __name__ == '__main__':
    try:
        paths = json.loads(os.environ.get('CHANGED_FILES', 'null'))
    except (ValueError, TypeError):
        paths = None
    # Include both sides of renames: an app file moved into docs is still an
    # app deletion. Diff the PR's merge base, so stacked PRs stay relative to
    # their actual base. A merge-queue entry diffs against the entry ahead of it (its merge
    # commit's first parent), which ALLGREEN requires to pass before this one merges.
    # Any missing history fails open to the full pipeline.
    event = os.environ.get('GITHUB_EVENT_NAME')
    if event in ('pull_request', 'merge_group'):
        try:
            base = subprocess.check_output(['git', 'merge-base', os.environ['BASE_SHA'],
                                            os.environ['HEAD_SHA']], text=True).strip()
            if event == 'merge_group':
                parents = subprocess.check_output(['git', 'rev-list', '--parents', '-n', '1',
                                                   os.environ['HEAD_SHA']], text=True).split()[1:]
                if len(parents) == 2:
                    base = parents[0]
            names = subprocess.check_output(['git', 'diff', '--no-renames', '--name-only',
                                             '-z', base, os.environ['HEAD_SHA']], text=True)
            if event == 'merge_group':
                paths = []
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

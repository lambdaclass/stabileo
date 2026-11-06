"""Conservative PR and merge-group path -> jobs/spec globs. No paths or unknown/mixed areas mean full.

A merge group narrows only to docs or to site (no engine path); the merge queue otherwise runs the full set minus the heavy jobs that combining PRs rarely breaks
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


def strip_ts_comments(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


def discover_slow_specs(e2e_dir):
    helpers = {
        p.stem for p in e2e_dir.glob('*.ts')
        if not p.name.endswith('.spec.ts') and '@slow' in strip_ts_comments(p.read_text())
    }
    specs = []
    for p in sorted(e2e_dir.glob('*.spec.ts')):
        if p.name == 'rc-design-visual.spec.ts':
            continue
        code = strip_ts_comments(p.read_text())
        imports = set(re.findall(r'''from\s+['"]\./([^'"]+)['"]''', code))
        if '@slow' in code or (imports & helpers):
            specs.append(p.name)
    return tuple(specs)


ALL_SLOW_SPECS = discover_slow_specs(REPO_ROOT / 'web/e2e')
ALL_SLOW_SET = frozenset(ALL_SLOW_SPECS)
SWEEP_SPECS = tuple(s for s in ALL_SLOW_SPECS if s.startswith('basic-advanced-sweep-'))
RESEARCH_SLOW_SPECS = ('research-dadeppo.spec.ts', 'research-ferrari.spec.ts')
NON_SOLVING_SLOW_SPECS = frozenset({
    'basic-draw-members.spec.ts',
    'basic-mobile-delete.spec.ts',
    'excel-import.spec.ts',
    'loads-progress.spec.ts',
    'plan-navigation.spec.ts',
    'pro-example-gallery.spec.ts',
    'pro-large-model-tables.spec.ts',
    'pro-load-generator-areas.spec.ts',
    'pro-panel-consistency.spec.ts',
    'public-shared-link.spec.ts',
    'research-dadeppo.spec.ts',
    'research-ferrari.spec.ts',
    'share-link-fidelity.spec.ts',
})
SOLVE_SLOW_SPECS = tuple(s for s in ALL_SLOW_SPECS if s not in NON_SOLVING_SLOW_SPECS)
BASIC_SLOW_SPECS = (
    *SWEEP_SPECS,
    'basic-course-dynamics.spec.ts',
    'basic-demos.spec.ts',
    'basic-draw-members.spec.ts',
    'basic-influence-course.spec.ts',
    'basic-mobile-delete.spec.ts',
    'basic-mobile-modelling.spec.ts',
    'basic-plastic-course.spec.ts',
    'basic-second-order.spec.ts',
    'basic-whatif.spec.ts',
    'blog.spec.ts',
    'cirsoc-flex.spec.ts',
    'course-kinematics.spec.ts',
    'excel-import.spec.ts',
    'explained-steps.spec.ts',
    'export-empty-and-drawings.spec.ts',
    'force-method-fundamental.spec.ts',
    'force-method-wizard.spec.ts',
    'frame-editor-detail.spec.ts',
    'other-materials.spec.ts',
    'physical-geometry.spec.ts',
    'pro-project-files.spec.ts',
    'public-shared-link.spec.ts',
    'rc-cad-production-download.spec.ts',
    'section-analysis.spec.ts',
    'share-link-fidelity.spec.ts',
)
SHARED_BASIC_PRO_SPECS = frozenset({
    'export-empty-and-drawings.spec.ts',
    'frame-editor-detail.spec.ts',
    'other-materials.spec.ts',
    'physical-geometry.spec.ts',
    'pro-project-files.spec.ts',
    'rc-cad-production-download.spec.ts',
})
PRO_SLOW_SPECS = tuple(
    s for s in ALL_SLOW_SPECS
    if s not in (set(BASIC_SLOW_SPECS) - SHARED_BASIC_PRO_SPECS) | set(RESEARCH_SLOW_SPECS)
)


def slow_specs_for_path(path):
    if not isinstance(path, str) or not path or path.startswith('/') or '..' in path.split('/'):
        return ALL_SLOW_SPECS
    if path.startswith(('docs/', 'changelog.d/', 'backend/', 'verify/', 'tools/', 'ai-backend/',
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
    if path.startswith('web/scripts/') and not path.startswith(('web/scripts/prerender', 'web/scripts/translation-gate')):
        return ()
    if path.startswith(('research/', 'web/src/components/research/', 'web/public/research-wasm')):
        return RESEARCH_SLOW_SPECS
    if path == 'web/e2e/basic-advanced-sweep.ts':
        return SWEEP_SPECS
    if path == 'web/e2e/prepared-building.ts':
        return ('ded-roundtrip.spec.ts', 'rebar-workspace-notices.spec.ts', 'tab-return-latency.spec.ts')
    if path == 'web/e2e/footing-project.ts':
        return ('rc-cad-handoff.spec.ts',)
    if path == 'web/e2e/large-model.ts':
        return ('pro-large-model-tables.spec.ts',)
    if re.fullmatch(r'web/e2e/[^/]+\.spec\.ts', path):
        name = path.rsplit('/', 1)[1]
        return (name,) if name in ALL_SLOW_SET else ()
    if path.startswith('web/e2e/'):
        return ALL_SLOW_SPECS
    if path.startswith(('engine/', 'web/src/lib/wasm/', 'web/src/lib/engine/', 'web/src/lib/store/',
                        'web/src/lib/model/')) or path in ('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'):
        return SOLVE_SLOW_SPECS
    if path.startswith(('web/src/components/landing/', 'web/src/components/site/',
                        'web/scripts/prerender', 'web/scripts/translation-gate')) or path == 'web/src/components/LandingPage.svelte':
        return ('blog.spec.ts', 'i18n-languages.spec.ts', 'public-shared-link.spec.ts')
    if path.startswith(('web/src/components/blog/', 'web/src/lib/blog/', 'web/src/lib/changelog/')):
        return ('blog.spec.ts',)
    if path.startswith(('web/src/components/steps/', 'web/src/components/edu/', 'web/src/lib/course/')):
        return ('basic-course-dynamics.spec.ts', 'basic-influence-course.spec.ts', 'basic-plastic-course.spec.ts',
                'basic-second-order.spec.ts', 'course-kinematics.spec.ts', 'explained-steps.spec.ts',
                'force-method-fundamental.spec.ts', 'force-method-wizard.spec.ts')
    if path.startswith('web/src/components/dsm/'):
        return (*SWEEP_SPECS, 'course-kinematics.spec.ts', 'explained-steps.spec.ts')
    if path.startswith('web/src/components/fm/'):
        return (*SWEEP_SPECS, 'explained-steps.spec.ts', 'force-method-fundamental.spec.ts', 'force-method-wizard.spec.ts')
    if path.startswith('web/src/components/flex/') or path == 'web/src/components/CirsocFlexPanel.svelte':
        return ('cirsoc-flex.spec.ts',)
    if path.startswith('web/src/lib/excel-import/') or path == 'web/src/components/ExcelImportReport.svelte':
        return ('excel-import.spec.ts',)
    if path.startswith(('web/src/components/stress/', 'web/src/lib/section/', 'web/src/components/Section')):
        return (*SWEEP_SPECS, 'blog.spec.ts', 'frame-editor-detail.spec.ts', 'other-materials.spec.ts', 'section-analysis.spec.ts')
    if path.startswith('web/src/lib/tour/') or path in ('web/src/components/TourOverlay.svelte', 'web/src/components/DemoMenu.svelte'):
        return ('basic-demos.spec.ts',)
    if path == 'web/src/components/WhatIfPanel.svelte':
        return ('basic-whatif.spec.ts',)
    if path == 'web/src/components/KinematicPanel.svelte':
        return (*SWEEP_SPECS, 'blog.spec.ts', 'course-kinematics.spec.ts')
    if path.startswith(('web/src/components/floating-tools/', 'web/src/lib/viewport/', 'web/src/lib/canvas/')) or path in (
        'web/src/components/MovePanel.svelte', 'web/src/components/MobileResultsPanel.svelte'
    ):
        return ('basic-demos.spec.ts', 'basic-draw-members.spec.ts', 'basic-mobile-delete.spec.ts',
                'basic-mobile-modelling.spec.ts', 'basic-whatif.spec.ts', 'export-empty-and-drawings.spec.ts',
                'public-shared-link.spec.ts', 'section-analysis.spec.ts', 'share-link-fidelity.spec.ts')
    if path.startswith(('web/src/components/advanced/', 'web/src/components/toolbar/', 'web/src/components/ribbon/',
                        'web/src/components/property/', 'web/src/components/charts/')):
        return BASIC_SLOW_SPECS
    if path.startswith(('web/src/lib/cad/', 'web/src/components/cad/', 'web/src/components/Cad',
                        'web/src/lib/dxf/', 'web/src/lib/ifc/', 'web/src/components/Ifc')) or path == 'web/src/components/DxfImportDialog.svelte':
        return ('coordination.spec.ts', 'ded-roundtrip.spec.ts', 'exchange.spec.ts', 'export-empty-and-drawings.spec.ts',
                'physical-geometry.spec.ts', 'rc-cad-handoff.spec.ts', 'rc-cad-production-download.spec.ts')
    if path.startswith('web/src/lib/connection/') or path == 'web/src/components/ConnectionPrompt.svelte':
        return ('acceptance-journeys.spec.ts', 'design-desk.spec.ts', 'joint-typologies.spec.ts',
                'm2-joint-design.spec.ts', 'm2-joint-persistence.spec.ts')
    if path.startswith('web/src/lib/sheets/') or path == 'web/src/components/SheetGrab.svelte':
        return ('design-desk.spec.ts', 'detailing-sheet-fieldset.spec.ts', 'f3-bar-labels.spec.ts',
                'f3-bending-schedule.spec.ts', 'f3-export-log.spec.ts', 'f3-product-decisions.spec.ts',
                'f3-selection-from-viewer.spec.ts', 'f3-selection-to-viewer.spec.ts', 'f3-sheet-geometry.spec.ts',
                'h1c-documents-flow.spec.ts', 'sheet-set-list.spec.ts', 'sheets.spec.ts')
    if path.startswith('web/src/lib/listings/'):
        return ('design-desk.spec.ts', 'f3-bending-schedule.spec.ts', 'h1c-documents-flow.spec.ts', 'listings.spec.ts')
    if path.startswith('web/src/lib/report/') or path == 'web/src/components/CalcReportDialog.svelte':
        return ('design-desk.spec.ts', 'export-empty-and-drawings.spec.ts', 'foreign-codes.spec.ts',
                'h1c-documents-flow.spec.ts', 'memoria.spec.ts', 'pro-report-docx.spec.ts')
    if path.startswith(('web/src/lib/export/', 'web/src/components/export/')):
        return ('ded-roundtrip.spec.ts', 'exchange.spec.ts', 'export-empty-and-drawings.spec.ts',
                'f3-export-log.spec.ts', 'h1c-documents-flow.spec.ts', 'listings.spec.ts', 'memoria.spec.ts',
                'pro-project-files.spec.ts', 'pro-project-workbook.spec.ts', 'pro-report-docx.spec.ts',
                'rc-cad-handoff.spec.ts', 'rc-cad-production-download.spec.ts', 'sheet-set-list.spec.ts', 'sheets.spec.ts')
    if path.startswith(('web/src/lib/provenance/', 'web/src/lib/legacy-projects/', 'web/src/lib/results-snapshot/',
                        'web/results-snapshots/', 'web/legacy-projects/')) or path == 'web/src/components/RecheckNotice.svelte':
        return ('ded-roundtrip.spec.ts', 'pro-project-files.spec.ts', 'project-restore.spec.ts',
                'rc-cad-handoff.spec.ts', 'recheck-provenance.spec.ts')
    if path.startswith('web/src/lib/i18n/') or path == 'web/src/components/LocaleSelect.svelte':
        return ('basic-plastic-course.spec.ts', 'blog.spec.ts', 'design-desk.spec.ts', 'explained-steps.spec.ts',
                'f3-member-list.spec.ts', 'i18n-languages.spec.ts', 'pro-design-workflow.spec.ts',
                'pro-panel-consistency.spec.ts', 'public-shared-link.spec.ts', 'recheck-provenance.spec.ts',
                'research-dadeppo.spec.ts', 'research-ferrari.spec.ts')
    if path.startswith('web/src/components/tables/'):
        return ('batch-copy.spec.ts', 'design-desk.spec.ts', 'pro-large-model-tables.spec.ts',
                'pro-modelling-flow.spec.ts', 'pro-panel-consistency.spec.ts')
    if path.startswith(('web/src/components/pro/', 'web/src/lib/pro/', 'web/src/lib/flow/',
                        'web/src/lib/design-contract/', 'web/src/lib/codes/', 'web/src/lib/profiles/',
                        'web/src/lib/grades/', 'web/src/lib/material/', 'web/src/lib/data/', 'web/src/lib/three/',
                        'web/src/lib/viewport3d/', 'web/src/lib/geometry/', 'web/src/components/viewport/',
                        'web/src/styles/')) or path == 'web/src/components/Viewport3D.svelte':
        return PRO_SLOW_SPECS
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
    text = scope in ('docs', 'prose')
    if event == 'pull_request':
        slow = list(ALL_SLOW_SPECS) if force_full else []
        slow_e2e = False
    elif queue:
        slow = list(ALL_SLOW_SPECS) if force_full else select_slow_specs(paths)
        slow_e2e = bool(slow)
    else:
        slow = list(ALL_SLOW_SPECS)
        slow_e2e = True
    outputs = {'backend': full, 'ci_scripts': full or scope == 'site'}
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

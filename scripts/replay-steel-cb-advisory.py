import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MAIN = 'b6f13f2500d700adecc48a974d7298f527e3388b'
FIX = '8a28989f34e11bc7fe7118471e4027d51a50bfeb'
INTRODUCTION = 'bb15c29416539c95c05ec1f478993eff577e2dc1'
SOURCE = 'web/src/lib/engine/verification-service.ts'
TEST = 'src/lib/engine/__tests__/concurrent-steel-boundaries.test.ts'
EXPOSED_TAGS = ('desktop-v0.1.0-alpha.1', 'desktop-v0.1.0-alpha.2', 'desktop-v0.1.0-alpha.3',
                'v0.2.0', 'v0.3.0', 'v0.4.0', 'v0.5.0')
BEFORE_RATIOS = {0.5: 0.6864197530864198, 0.7: 0.812}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def observe(destination, expected_status):
    env = dict(os.environ, SA_064_RECORD=str(destination))
    result = subprocess.run(['make', 'test.web.unit', f'FILE={TEST}',
                             'FILTER=steel interaction uses its own Cb', 'VITEST_WORKERS=1'],
                            cwd=ROOT, env=env)
    if (result.returncode == 0) != (expected_status == 0):
        raise RuntimeError(f'Unexpected replay test status: {result.returncode}')
    rows = [json.loads(line) for line in destination.read_text().splitlines()]
    if sorted(row['fraction'] for row in rows) != [0.5, 0.7]:
        raise RuntimeError('Missing or duplicate steel witnesses')
    for row in rows:
        oracle = row['oracle']
        utilization = oracle['axialFraction'] + (8 / 9) * oracle['momentFraction']
        result = row['result']
        if utilization != oracle['utilization'] or row['fraction'] != oracle['momentFraction']:
            raise RuntimeError('Independent oracle does not match the witness')
        if row['singleCombinationControls'][0]['interaction']['ratio'] != utilization:
            raise RuntimeError('Single-combination control does not match the independent oracle')
        ratio = result['interaction']['ratio']
        if expected_status == 0:
            if ratio != utilization or result['overallStatus'] != ('fail' if utilization > 1 else 'ok'):
                raise RuntimeError('Fixed witness does not match its independent oracle')
            if result['governingCombos']['flexure']['comboId'] != 1:
                raise RuntimeError('Fixed flexure attribution does not match its utilization')
        elif ratio != BEFORE_RATIOS[row['fraction']] or not 0 < ratio < utilization or result['overallStatus'] != 'ok':
            raise RuntimeError('Before witness does not reproduce the recorded oracle understatement')
        if expected_status != 0:
            diagnostics = result.get('diagnostics', [])
            if row['fraction'] == 0.5 and (diagnostics or result['engineRecheck']['certifiedOk'] is not True):
                raise RuntimeError('Silent witness no longer reproduces a certified pass without diagnostics')
            if row['fraction'] == 0.7 and not any(d['code'] == 'VERIF_STEEL_FAIL_INTERACTION' for d in diagnostics):
                raise RuntimeError('Failure-side witness lost its recorded warning')
    return sorted(rows, key=lambda row: row['fraction'])


def main():
    if Path.cwd().resolve() != ROOT:
        raise RuntimeError('Run from this worktree root')
    changed = git('diff', '--name-only', MAIN, '--', 'web/src/lib/engine').decode().splitlines()
    paths = [name for name in changed if '/__tests__/' not in name and name.endswith('.ts')]
    originals = {name: (ROOT / name).read_bytes() if (ROOT / name).exists() else None for name in paths}
    source_hashes = {name: hashlib.sha256(content).hexdigest() for name, content in originals.items() if content is not None}
    with tempfile.TemporaryDirectory(prefix='.sa-064-', dir=ROOT) as temporary:
        temporary = Path(temporary)
        after = observe(temporary / 'after.jsonl', 0)
        try:
            for name in paths:
                old = subprocess.run(['git', 'show', f'{MAIN}:{name}'], cwd=ROOT, capture_output=True)
                if old.returncode == 0:
                    (ROOT / name).write_bytes(old.stdout)
                elif git('cat-file', '-t', MAIN).strip() == b'commit' and not git('ls-tree', MAIN, '--', name):
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    raise RuntimeError(f'Cannot read parent source: {name}')
            before = observe(temporary / 'before.jsonl', 1)
        finally:
            for name, content in originals.items():
                if content is None:
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    (ROOT / name).write_bytes(content)
    tags = []
    for tag in EXPOSED_TAGS:
        source = git('show', f'{tag}:{SOURCE}').decode().splitlines()
        needles = ['stations ? stationMomentEnvelope(stations)', 'for (const combo of stations.comboResults)',
                   'stations: segment?.stations ?? diagram', 'Cb: grad.cb']
        evidence = {needle: [{'line': i + 1, 'source': line.strip()} for i, line in enumerate(source) if needle in line]
                    for needle in needles}
        contains = subprocess.run(['git', 'merge-base', '--is-ancestor', INTRODUCTION, tag], cwd=ROOT).returncode
        if contains != 0 or not all(evidence.values()):
            raise RuntimeError(f'Tag no longer matches documented exposure: {tag}')
        tags.append({'tag': tag, 'commit': git('rev-parse', tag + '^{}').decode().strip(),
                     'containsIntroduction': True, 'source': SOURCE, 'sourceEvidence': evidence})
    records = []
    for old, new in zip(before, after, strict=True):
        if old['input'] != new['input'] or old['oracle'] != new['oracle']:
            raise RuntimeError('Replay inputs or independent oracle changed between sources')
        records.append({'id': f'uniform-moment-{old["fraction"]}', 'input': old['input'], 'oracle': old['oracle'],
                        'before': old['result'], 'after': new['result'],
                        'singleCombinationControls': {'before': old['singleCombinationControls'],
                                                      'after': new['singleCombinationControls']}})
    output = {'advisory': 'SA-2026-064', 'date': '2026-11-13', 'fixingPr': 2080,
              'mainSource': MAIN, 'fixedSource': FIX, 'fixedSourceFilesSha256': source_hashes, 'introductionCommit': INTRODUCTION,
              'introductionHistory': git('show', '-s', '--format=%H %as %s', INTRODUCTION).decode().strip(),
              'generator': 'make replay.advisory.steel-cb',
              'scope': 'Main-source and current fixed-source design replay through WASM. fixedSource identifies the initial Cb fix; fixedSourceFilesSha256 identifies the source files used for this replay including review corrections. Release exposure is source/tag inspection, not a historical binary replay.',
              'releaseTags': tags, 'records': records}
    destination = ROOT / 'docs/advisories/replays/SA-2026-064.json'
    destination.write_text(json.dumps(output, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
    print(f'Generated {destination.relative_to(ROOT)} from two failing parent and two passing fixed witnesses')


if __name__ == '__main__':
    main()

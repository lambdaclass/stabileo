import argparse
import collections
import json
import pathlib
import re

parser = argparse.ArgumentParser()
parser.add_argument('--regenerate', action='store_true')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[2]
data = json.loads((root / 'docs/verification/cause-c-replay-2026-11-11.json').read_text())
markdown = (root / 'docs/verification/cause-c-replay-2026-11-11.md').read_text()
issues = {i['issue']: i for i in data['issues']}
errors = []
checks = 0

def check(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)

def witnesses(number, predicate=lambda w: True):
    selected = [w for w in issues[number]['witnesses'] if predicate(w)]
    check(bool(selected), f'#{number}: empty claim scope')
    return selected

def passed(number, predicate=lambda w: True):
    for w in witnesses(number, predicate):
        r = w['observed'].get('relation', {})
        check(r.get('pass') == 1 and not any(r.get(k) for k in ('failures', 'refused', 'same_refusal', 'inconclusive')), f"#{number}: pass claim contradicts {w['key']}: {r}")

def solved(number, predicate=lambda w: True):
    for w in witnesses(number, predicate):
        o = w['observed']
        check(o.get('base', o).get('status') == 'solved', f"#{number}: solve claim contradicts {w['key']}")

for n, i in issues.items():
    rows = [line for line in markdown.splitlines() if line.startswith(f'| [#{n}](')]
    check(len(rows) == 1, f'#{n}: missing/duplicate table row')
    if len(rows) == 1:
        cells = rows[0].split(' | ')
        check(cells[2] == i['class'], f'#{n}: table/JSON class mismatch')
        check(cells[3] == i['evidence'], f'#{n}: table/JSON summary mismatch')
    for w in i['witnesses']:
        r = w.get('observed', {}).get('relation', {})
        if r.get('pass'):
            check(not any(r.get(k) for k in ('failures', 'refused', 'same_refusal', 'inconclusive')), f"#{n}: mixed pass verdict {w['key']}")

for n in (1766, 982):
    passed(n)
for n in (1653, 1101, 1097, 1086, 956):
    passed(n, lambda w: w['source'] == 'body')
passed(762, lambda w: '/20840' in w['source'])
check(collections.Counter('pass' if w['observed']['relation'].get('pass') else 'refused' if w['observed']['relation'].get('refused') else 'other' for w in issues[762]['witnesses']) == {'pass': 3, 'refused': 15}, '#762: selected verdict counts')
passed(758, lambda w: w['key'] == '758-legacy-68')
for n in (1647, 1635, 1352, 1090, 1029, 761):
    solved(n)
for n in (1536, 1535, 1534, 1532, 1531, 1530):
    solved(n, lambda w: w['source'] == 'body')
solved(1357, lambda w: w['source'] == 'body' or w['test'].endswith('/reversal'))
check(data['batch1_checks']['connectors']['1751']['aligned'] == 'solved', '#1751: aligned solve')
check(data['batch1_checks']['1930_1653']['copies'] == 19, '#1930/#1653: reference copies')
for name in ('existing_1896', 'existing_1496', 'existing_1496_final'):
    check(all(v == 'ok' for v in data['batch1_checks'][name]['tests'].values()), f'{name}: positive test claim')
check(data['batch1_checks']['1930_1653']['worst_normalized_error'] <= data['batch1_checks']['1930_1653']['ceiling'], '#1891/#1930/#1653: reference comparison')

summary = issues[761]['evidence']
if 'Fiber and corotational comparisons pass' in summary:
    passed(761, lambda w: '/fiber nonlinear/' in w['test'] or '/corotational/' in w['test'])
else:
    expected = {'761-legacy-22': ('random-29', '/mirror'), '761-legacy-39': ('random-41', '/rotation')}
    for key, (source, relation) in expected.items():
        w = next(w for w in issues[761]['witnesses'] if w['key'] == key)
        check(key in summary and source in summary and relation[1:] in summary, f'#761: missing fiber refusal {key}')
        check(source in w['source'] and w['test'].endswith(relation) and any('did not converge' in x for x in w['observed']['relation'].get('failures', [])), f'#761: unsupported fiber refusal {key}')
    passed(761, lambda w: '/fiber nonlinear/' in w['test'] and w['key'] not in expected)
    passed(761, lambda w: '/corotational/' in w['test'])
    check('remaining 10' in summary, '#761: remaining fiber count missing')
check(issues[761]['class'] == 'FALSE-REFUSAL', '#761: classification changed')
check(collections.Counter(i['class'] for i in issues.values()) == data['classification_counts'], 'classification counts changed')
check(len(issues) == 65, 'issue count changed')
flag_name = 'near_mechanism_warning'
model_booleans = {'hingeEnd', 'hingeStart', 'rx', 'ry', 'rz', 'rrx', 'rry', 'rrz', 'releaseMyStart', 'releaseMyEnd', 'releaseMzStart', 'releaseMzEnd', 'releaseTStart', 'releaseTEnd'}
followups = {w['key']: w for w in data['batch2_followups']['harmonic_warnings']}
flag_checks = []

def derived(diagnostics):
    if diagnostics is None:
        return None
    return any(d['code'] == 'stiffness_not_positive_definite' or (d['code'] == 'known_issue' and d.get('phase') == 'NUM-INVARIANCE') for d in diagnostics)

def flags(value, path=(), inherited=None):
    if isinstance(value, dict):
        diagnostics = value.get('warnings', value.get('structuredDiagnostics', inherited))
        if flag_name in value:
            flag_checks.append((path, value, derived(diagnostics)))
        for key, child in value.items():
            if isinstance(child, bool) and key != flag_name:
                check('constructed_inputs' in path and key in model_booleans, f'unclassified boolean at {path + (key,)}')
            child_diagnostics = diagnostics if key == 'summary' else None
            if key == 'base' and 'observed' in path:
                witness = data['issues'][path[1]]['witnesses'][path[3]]
                if witness['key'] in followups:
                    child_diagnostics = followups[witness['key']]['runs'][0]['warnings']
            flags(child, path + (key,), child_diagnostics)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            flags(child, path + (index,))

flags(data)
mismatches = [(path, owner, expected) for path, owner, expected in flag_checks if owner[flag_name] is not expected]
contradictions = sum(expected is not None for _, _, expected in mismatches)
unknown = sum(expected is None for _, _, expected in flag_checks)
print(f'Flags: {len(flag_checks)} checked; {len(mismatches)} mismatches before ({contradictions} contradictions, {len(mismatches) - contradictions} unsupported booleans); {unknown} lack matching retained diagnostics')
for path, owner, expected in mismatches:
    if expected is not None:
        print(f'{path}: {owner[flag_name]} -> {expected}')
if args.regenerate:
    for _, owner, expected in flag_checks:
        owner[flag_name] = expected
    archive = root / 'docs/verification/cause-c-replay-2026-11-11.json'
    source = archive.read_text()
    tokens = iter(owner[flag_name] for _, owner, _ in flag_checks)
    source, count = re.subn(r'("near_mechanism_warning"\s*:\s*)(?:true|false|null)', lambda match: match[1] + json.dumps(next(tokens)), source)
    assert count == len(flag_checks)
    archive.write_text(source)
remaining = sum(owner[flag_name] is not expected for _, owner, expected in flag_checks)
print(f'Flags: {remaining} mismatches after' if args.regenerate else f'Flags: {remaining} current mismatches')
check(remaining == 0, 'derived warning flags disagree with retained diagnostic provenance')
print(f'{checks} summary/model/flag checks; {len(errors)} mismatches')
for error in errors:
    print(error)
raise SystemExit(bool(errors))

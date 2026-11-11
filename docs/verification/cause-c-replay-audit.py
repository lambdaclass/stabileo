import argparse
import collections
import hashlib
import math
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

def audit_candidates():
    archive = root / 'docs/verification/candidate-replay-2026-11-11.json'
    report = root / 'docs/verification/candidate-replay-2026-11-11.md'
    candidate = json.loads(archive.read_text())
    doc = report.read_text()
    fixture_path = 'engine/tests/fixtures/candidate-replay.json'
    fixtures = json.loads((root / fixture_path).read_text())
    source = (root / 'engine/tests/metamorphic/candidate_replay.rs').read_text()
    registration = (root / 'engine/tests/metamorphic/main.rs').read_text()
    entries = candidate['issues']
    numbers = [i['issue'] for i in entries]
    skipped = [i['issue'] for i in candidate['skipped_issues']]
    snapshot = [i['number'] for i in candidate['issue_snapshot']]
    classes = {'FIXED-REFUSED', 'FIXED-CORRECT', 'STILL-WRONG', 'FALSE-REFUSAL', 'CANNOT-REPRODUCE', 'NEEDS-INFO'}
    causes = set('ABCDEFGH') | {'harness'}
    check(len(numbers) == len(set(numbers)) == candidate['replayed_issue_count'] == 94, 'candidate: issue inventory')
    check(len(skipped) == len(set(skipped)) == candidate['skipped_issue_count'] == 14, 'candidate: exclusions')
    check(len(snapshot) == len(set(snapshot)) == candidate['open_issue_count'] == 108, 'candidate: open-label snapshot')
    check(set(numbers).isdisjoint(skipped) and set(numbers) | set(skipped) == set(snapshot), 'candidate: snapshot partition')
    check(set(skipped) == set(snapshot) & issues.keys(), 'candidate: cause-C exclusions differ')
    for old in candidate['skipped_issues']:
        check(old['prior_class'] == issues[old['issue']]['class'], f"candidate: stale prior class #{old['issue']}")
    check(all(i['class'] in classes and i['cause'] in causes for i in entries), 'candidate: unknown class/cause')
    check({c: sum(i['class'] == c for i in entries) for c in classes} == candidate['classification_counts'], 'candidate: class counts')
    check({c: sum(i['cause'] == c for i in entries) for c in causes} == candidate['cause_counts'], 'candidate: cause counts')
    check(dict(collections.Counter(i['cause_status'] for i in entries)) == candidate['cause_status_counts'], 'candidate: cause certainty counts')
    check(candidate['tested_main'] in doc and candidate['branch_base'] in doc, 'candidate: missing tested revisions')
    check('mod candidate_replay;' in registration, 'candidate: unregistered active test module')
    check('#[ignore' not in source, 'candidate: regression module has ignored tests')
    fixture_keys = set()

    def model_ref(owner):
        reference = owner['input_ref']
        path, key = reference.split('#', 1)
        check(path == fixture_path and key in fixtures, f'candidate: missing fixture {reference}')
        if key in fixtures:
            actual = hashlib.sha256(json.dumps(fixtures[key], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            check(actual == owner['input_sha256'], f'candidate: input hash {key}')
            fixture_keys.add(key)
        return key

    def finite(value, path='candidate'):
        if isinstance(value, float):
            check(math.isfinite(value), f'{path}: nonfinite retained evidence')
        elif isinstance(value, dict):
            for key, item in value.items():
                finite(item, f'{path}.{key}')
        elif isinstance(value, list):
            for k, item in enumerate(value):
                finite(item, f'{path}[{k}]')

    finite(candidate)
    finite(fixtures, 'fixtures')
    test_names = set(re.findall(r'fn (issue_[a-zA-Z0-9_]+)\(', source))
    fixed = set()
    cell_count = 0
    inline_count = 0
    energy_count = 0
    verified_energy_count = 0
    by_number = {i['issue']: i for i in entries}
    parents = candidate['historical_parent_checks']
    support_parent = next(p for p in parents if p['revision'] == '4f9b69cad12cb4bed43703bb7e52366ff77c70dd')
    conditioning_parent = next(p for p in parents if p['revision'] == 'cb671ed319d14ee4d4505a3c43fe233b9607cd27')
    for entry in entries:
        n = entry['issue']
        table = [line for line in doc.splitlines() if line.startswith(f'| [#{n}](')]
        check(len(table) == 1, f'candidate #{n}: table row count')
        if len(table) == 1:
            cells = table[0].split(' | ')
            check(cells[2] == entry['class'], f'candidate #{n}: table class')
            tag = entry['cause'] + ('?' if entry['cause_status'] == 'provisional' else '')
            check(cells[3] == tag, f'candidate #{n}: table cause')
            check(cells[4] == entry['evidence'], f'candidate #{n}: table evidence')
            check(cells[5] == f"`{candidate['tested_main']}` |", f'candidate #{n}: table SHA')
        check(bool(entry['cause_basis']) and entry['cause_status'] in ('confirmed', 'provisional'), f'candidate #{n}: unsupported cause status')
        check(entry['classification_scope'] == 'reported body witness', f'candidate #{n}: classification scope changed')
        body = None
        for w in entry['witnesses']:
            inline_count += 1
            model_ref(w)
            if w['source'] == 'body':
                check(body is None, f'candidate #{n}: duplicate body witness')
                body = w
            base = w['observed'].get('base')
            if base is not None:
                calls = base['diagnostic_calls']
                expected = any(derived(ds) for ds in calls) if calls else None
                check(base['near_mechanism_warning'] is expected, f"candidate {w['key']}: derived warning provenance")
                relations = w['observed']['relations']
                check(len(relations) == 1, f"candidate {w['key']}: selected cell count")
                cell_count += 1
                if relations:
                    r = relations[0]
                    check(w['test'] == f"metamorphic/{r['analysis']}/{r['invariant']}", f"candidate {w['key']}: relation scope")
                    check(w['seed'] is not None, f"candidate {w['key']}: missing reported seed")
                    check(not (r['pass'] and r['inconclusive']), f"candidate {w['key']}: inconclusive pass")
            if 'energy_followup' in w:
                energy_count += 1
                e = w['energy_followup']
                model_ref(e)
                difference = abs(e['external_work'] - e['reported_internal_work'] - e['omitted_inclined_spring_work'])
                check(difference == e['corrected_difference'], f"candidate {w['key']}: energy arithmetic")
                if e['omitted_inclined_spring_work'] > 0.0:
                    verified_energy_count += 1
                    check(difference <= e['tolerance'], f"candidate {w['key']}: unsupported omitted-work explanation")
        functions = sorted(name for name in test_names if name.startswith(f'issue_{n}_'))
        expected_regression = f'engine/tests/metamorphic/candidate_replay.rs#{functions[0]}' if len(functions) == 1 else None
        check(entry['regression'] == expected_regression, f'candidate #{n}: regression symbol mismatch')
        if entry['class'].startswith('FIXED-'):
            fixed.add(n)
            check(body is not None and body['observed']['base']['status'] == 'refused', f'candidate #{n}: fixed-refusal evidence')
            check(len(functions) == 1, f'candidate #{n}: missing active regression')
            if len(functions) == 1:
                check(support_parent['tests'].get(functions[0]) == 'FAILED', f'candidate #{n}: test did not fail on main parent')
        elif body and body['observed'].get('base') and entry['class'] == 'CANNOT-REPRODUCE':
            rs = body['observed']['relations']
            check(any(r['pass'] for r in rs) and not any(r['failures'] or r['refused'] or r['same_refusal'] or r['inconclusive'] for r in rs), f'candidate #{n}: passing relation claim')
        if body and body['observed'].get('relations') and entry['class'] == 'STILL-WRONG':
            check(any(r['failures'] for r in body['observed']['relations']), f'candidate #{n}: missing reproduced discrepancy')
    for parent in parents:
        check(set(parent['tests']) == test_names, f"candidate: historical-parent test symbols differ at {parent['revision']}")
        check(set(parent['tests'].values()) <= {'ok', 'FAILED'}, f"candidate: unknown historical-parent outcome at {parent['revision']}")
    check(len(fixed) == 28, 'candidate: refusal regression count')
    check(len(re.findall(r'^#\[test\]', source, re.M)) == 29, 'candidate: active test count')
    check(sum(v == 'FAILED' for v in support_parent['tests'].values()) == 28, 'candidate: support-parent failures')
    check(sum(v == 'FAILED' for v in conditioning_parent['tests'].values()) == 15, 'candidate: conditioning-parent failures')
    check(inline_count == 197 and cell_count == 182, 'candidate: inline/cell inventory')
    check(energy_count == 19 and verified_energy_count == 18, 'candidate: energy coverage')
    artifact = candidate['artifact_1775']
    check(artifact['metadata']['id'] == 13621790862 and not artifact['metadata']['expired'], 'candidate: #1775 artifact provenance')
    check(len(artifact['witnesses']) == 8, 'candidate: #1775 model count')
    for w in artifact['witnesses']:
        model_ref(w)
        check(w['native']['status'] == 'solved' and w['tolerance'] == 1e-6, f"candidate {w['key']}: differential scope")
    for r in candidate['staged_followups']:
        model_ref(r)
        check(r['native_staged']['displacements'] == r['public_wasm_staged']['displacements'], f"candidate #{r['issue']} {r['side']}: native/WASM discrepancy")
        check(r['native_staged']['diagnostics'] == r['public_wasm_staged']['diagnostics'], f"candidate #{r['issue']} {r['side']}: warning discrepancy")
        check(max(r['reference_comparison'].values()) <= r['reference_tolerance'] == 1e-6, f"candidate #{r['issue']} {r['side']}: independent reference check")
    check(len(candidate['staged_followups']) == 4, 'candidate: staged follow-up coverage')
    silent = next(r for r in candidate['staged_followups'] if r['issue'] == 1846 and r['side'] == 'transformed')
    staged_d = next(x for x in silent['native_staged']['displacements'] if x['nodeId'] == 2)
    linear_d = next(x for x in silent['regular_linear']['displacements'] if x['nodeId'] == 2)
    check(abs(staged_d['rx'] - linear_d['rx']) > 1.689e-8, 'candidate: #1846 silent discrepancy missing')
    check(not silent['native_staged']['diagnostics'] and not silent['public_wasm_staged']['diagnostics'], 'candidate: #1846 silence contradicts diagnostics')
    check(candidate['advisory_escalation']['issue'] == 1846 and candidate['advisory_escalation']['main_silently_wrong'], 'candidate: missing coordinator escalation')
    related = candidate['advisory_escalation'].get('related_witnesses', [])
    check(set(related) == {'1085-6760749658-0', '1011-6730900141-0', '1846-6760758840-0'} and len(related) == 3, 'candidate: staged escalation witness coverage')
    for key in related:
        entry = by_number[int(key.split('-')[0])]
        matches = [w for w in entry['witnesses'] if w['key'] == key]
        check(len(matches) == 1, f'candidate: missing escalation witness {key}')
        check(key in entry['evidence'] and key in doc and key in candidate['advisory_escalation']['evidence'], f'candidate: unlinked escalation witness {key}')
        if len(matches) == 1:
            observed = matches[0]['observed']
            check(observed['base']['status'] == 'solved' and observed['base']['diagnostic_calls'] == [[]] and observed['base']['near_mechanism_warning'] is False, f'candidate: escalation silence unsupported for {key}')
            check(any(r['analysis'].startswith('staged (') and r['invariant'] == 'units' and r['failures'] for r in observed['relations']), f'candidate: escalation discrepancy missing for {key}')
    check(fixture_keys == fixtures.keys(), 'candidate: orphan/missing fixture references')
    check(sum(c['embedded_model_count'] for i in candidate['source_inventory'] for c in i['comments']) == sum(w['source'] != 'body' for i in entries for w in i['witnesses']), 'candidate: comment inventory')
    for klass, count in candidate['classification_counts'].items():
        check(f'| {klass} | {count} |' in doc, f'candidate: {klass} count table')
    for cause, count in candidate['cause_counts'].items():
        check(f'| {cause} | {count} |' in doc, f'candidate: cause {cause} count table')
    print(f"Candidate archive: {len(entries)} issues, {inline_count} inline witnesses, {cell_count} selected cells, {len(fixed)} historical-parent regressions")


audit_candidates()

print(f'{checks} summary/model/flag checks; {len(errors)} mismatches')
for error in errors:
    print(error)
raise SystemExit(bool(errors))

#!/usr/bin/env python3
import argparse
import fnmatch
import json
import math
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REGISTRY = 'engine/tests/benchmarks/registry.json'
LABEL = 'tolerance-change'
EXEMPTIONS = {'single-reference', 'unaudited'}
PATTERNS = {'error-threshold': r'\b\w*(?:err|error|diff|dev|drift)\w*\s*<=?\s*(\d[\d_.]*(?:[eE][+-]?\d+)?)'}
NUMBER = re.compile(r'^-?(?:\d[\d_]*)(?:\.[\d_]*)?(?:[eE][+-]?\d+)?(?:_?f64)?$')


class Gate(Exception):
    pass


def number(text):
    text = text.strip()
    if not NUMBER.match(text):
        return None
    return float(text.replace('_f64', '').replace('f64', '').replace('_', ''))


def pointer(document, path):
    nodes = [document]
    for part in [p for p in path.split('/') if p]:
        found = []
        for node in nodes:
            if part == '*':
                found.extend(node.values() if isinstance(node, dict) else node if isinstance(node, list) else [])
            elif isinstance(node, dict) and part in node:
                found.append(node[part])
            elif isinstance(node, list) and part.isdigit() and int(part) < len(node):
                found.append(node[int(part)])
        nodes = found
    return nodes


def strip_rust(text):
    out, i, n = [], 0, len(text)
    while i < n:
        if text.startswith('//', i):
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = n if j < 0 else j + 2
        elif text[i] == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == '\\' else 1
            out.append('""')
            i = j + 1
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)


def call_arguments(text, name):
    calls = []
    for match in re.finditer(rf'(?<![\w.:]){re.escape(name)}\s*\(', text):
        if re.search(r'\bfn\s+$', text[:match.start()]):
            continue
        depth, start, args, i = 0, match.end(), [], match.end()
        while i < len(text):
            c = text[i]
            if c in '([{':
                depth += 1
            elif c in ')]}':
                if depth == 0:
                    args.append(text[start:i].strip())
                    break
                depth -= 1
            elif c == ',' and depth == 0:
                args.append(text[start:i].strip())
                start = i + 1
            i += 1
        calls.append([a for a in args if a])
    return calls


def resolve(text, expression):
    value = number(expression)
    if value is not None:
        return [value]
    if not re.fullmatch(r'[A-Za-z_]\w*', expression):
        return None
    values = [number(m) for m in re.findall(
        rf'\b(?:const|let)\s+(?:mut\s+)?{expression}\s*(?::\s*f64\s*)?=\s*([^;]+);', text)]
    return values if values and None not in values else None


def extract(locator, read):
    text = read(locator['file'])
    if text is None:
        raise Gate(f"{locator['file']}: test tolerance file does not exist")
    if 'pointer' in locator:
        found = pointer(json.loads(text), locator['pointer'])
        if locator.get('transform') == 'ratio-bounds':
            found = [max(1 - b[0], b[1] - 1) for b in found]
        elif locator.get('transform') == 'ratio-floor':
            found = [1 - v for v in found]
        if not found or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in found):
            raise Gate(f"{locator['file']}{locator['pointer']}: no numeric test tolerance")
        return [float(v) for v in found]
    code = strip_rust(text)
    if 'pattern' in locator:
        values = [number(m) for m in re.findall(PATTERNS.get(locator['pattern'], locator['pattern']), code)]
        if not values or None in values:
            raise Gate(f"{locator['file']}: pattern {locator['pattern']!r} matched no numeric tolerance")
        return values
    values, unresolved = [], []
    for name in locator['calls']:
        for args in call_arguments(code, name):
            if len(args) < locator['argument']:
                continue
            resolved = resolve(code, args[locator['argument'] - 1])
            if resolved is None:
                unresolved.append(f'{name}(…{args[locator["argument"] - 1]}…)')
            else:
                values.extend(resolved)
    if len(unresolved) > locator.get('unresolved', 0):
        raise Gate(f"{locator['file']}: {len(unresolved)} tolerance arguments are not literals or constants "
                   f"({', '.join(unresolved[:3])}); declared unresolved: {locator.get('unresolved', 0)}")
    if not values:
        raise Gate(f"{locator['file']}: no {'/'.join(locator['calls'])} tolerance found")
    return values


def protocol_quantity(entry, read):
    spec = json.loads(read(entry['protocol']))
    admitted = [r for r in spec['references'] if r['pass_fail'] and not r['provisional']]
    return {
        'quantity': entry.get('quantity') or spec['id'],
        'unit': entry.get('unit'),
        'references': [dict(source=r['citation'], location=r['location'], value=r['value'], unit=entry.get('unit'))
                       for r in admitted],
        'tolerance': dict(relative=spec['tolerance']['relative'], justification=spec['tolerance']['justification'],
                          evidence=entry.get('evidence')),
        'test_tolerances': [dict(file=entry['protocol'], pointer='/tolerance/relative')],
        'independent_of_derivation': entry.get('independent_of_derivation'),
        'independence_note': entry.get('independence_note'),
        'exemption': entry.get('exemption'),
    }


def quantities(entry, read):
    if 'protocol' in entry:
        return [protocol_quantity(entry, read)]
    return entry.get('quantities', [])


def tolerance_of(q):
    t = q.get('tolerance') or {}
    kinds = [k for k in ('relative', 'absolute') if k in t]
    return (kinds[0], t[kinds[0]]) if len(kinds) == 1 else (None, None)


def check_exemption(where, q, errors):
    e = q.get('exemption')
    count = len(q.get('references') or [])
    if not e:
        if count < 2:
            errors.append(f'{where}: {count} reference(s); two independent references or a reviewed exemption required')
        return
    if e.get('kind') not in EXEMPTIONS:
        errors.append(f"{where}: exemption kind must be one of {sorted(EXEMPTIONS)}")
    if not str(e.get('reason', '')).strip():
        errors.append(f'{where}: exemption needs a reason')
    if not isinstance(e.get('issue'), int) or isinstance(e.get('issue'), bool) or e['issue'] <= 0:
        errors.append(f'{where}: exemption needs a tracking issue number')
    if not str(e.get('reviewed', '')).strip():
        errors.append(f'{where}: exemption needs a review record (reviewed)')
    if count >= 2:
        errors.append(f'{where}: has {count} references; remove the stale {e.get("kind")} exemption')
    if e.get('kind') == 'single-reference' and count != 1:
        errors.append(f'{where}: a single-reference exemption needs exactly one reference')
    if e.get('kind') == 'unaudited' and count:
        errors.append(f'{where}: an unaudited exemption lists no references; audit them and drop the exemption')


def check_quantity(where, q, read, errors):
    unaudited = (q.get('exemption') or {}).get('kind') == 'unaudited'
    for field in ('quantity', 'unit', 'independence_note'):
        if not str(q.get(field) or '').strip():
            errors.append(f'{where}: missing {field}')
    if not isinstance(q.get('independent_of_derivation'), bool):
        errors.append(f'{where}: independent_of_derivation must be true or false')
    check_exemption(where, q, errors)
    for i, r in enumerate(q.get('references') or []):
        for field in ('source', 'location', 'unit'):
            if not str(r.get(field) or '').strip():
                errors.append(f'{where}: reference {i + 1} missing {field}')
        value = r.get('value')
        if not (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)):
            errors.append(f'{where}: reference {i + 1} needs a finite value')
    kind, limit = tolerance_of(q)
    t = q.get('tolerance') or {}
    if kind is None:
        errors.append(f'{where}: tolerance needs exactly one of relative or absolute')
    elif limit is None and unaudited and not q.get('test_tolerances'):
        pass
    elif not (isinstance(limit, (int, float)) and not isinstance(limit, bool) and math.isfinite(limit) and limit > 0):
        errors.append(f'{where}: tolerance must be a positive number')
    if not str(t.get('justification') or '').strip():
        errors.append(f'{where}: tolerance has no justification')
    evidence = t.get('evidence')
    if evidence and not evidence.startswith('https://') and read(evidence.split('#')[0]) is None:
        errors.append(f'{where}: tolerance evidence {evidence} does not exist')
    locators = q.get('test_tolerances') or []
    if not locators and not unaudited:
        errors.append(f'{where}: no test tolerance locator')
    for locator in locators:
        try:
            values = extract(locator, read)
        except Gate as e:
            errors.append(f'{where}: {e}')
            continue
        if kind and locator.get('kind', kind) != kind:
            errors.append(f'{where}: {locator["file"]} tolerance is {locator.get("kind")}, the spec is {kind}')
        elif kind and isinstance(limit, (int, float)) and max(values) > limit * (1 + 1e-12):
            errors.append(f'{where}: {locator["file"]} uses tolerance {max(values):g}, looser than the spec {limit:g}')


def scoped_files(registry, files):
    excluded = set(registry.get('excluded', {}))
    return sorted(f for f in files if f not in excluded and any(fnmatch.fnmatch(f, g) for g in registry['scope']))


def check(registry, read, files):
    errors = []
    ids, covered = set(), set()
    for entry in registry.get('benchmarks', []):
        bid = entry.get('id')
        if not bid or bid in ids:
            errors.append(f'benchmark id {bid!r} is missing or duplicated')
        ids.add(bid)
        for f in entry.get('files', []) + ([entry['protocol']] if 'protocol' in entry else []):
            if read(f) is None:
                errors.append(f'{bid}: {f} does not exist')
            covered.add(f)
        qs = quantities(entry, read) if 'protocol' not in entry or read(entry['protocol']) is not None else []
        if not qs:
            errors.append(f'{bid}: no quantities')
        names = [q.get('quantity') for q in qs]
        if len(names) != len(set(names)):
            errors.append(f'{bid}: duplicated quantity names')
        for q in qs:
            check_quantity(f"{bid} / {q.get('quantity')}", q, read, errors)
    for f in scoped_files(registry, files):
        if f not in covered:
            errors.append(f'{f}: benchmark has no spec in {REGISTRY}')
    for f in registry.get('excluded', {}):
        if not str(registry['excluded'][f]).strip():
            errors.append(f'{f}: exclusion needs a reason')
    return errors


def spec_tolerances(registry, read):
    out = {}
    for entry in registry.get('benchmarks', []):
        if 'protocol' in entry and read(entry['protocol']) is None:
            continue
        for q in quantities(entry, read):
            out[(entry.get('id'), q.get('quantity'))] = tolerance_of(q)
    return out


def loosened(base, head):
    found = []
    for key, (kind, value) in base.items():
        if key not in head:
            found.append(f'{key[0]} / {key[1]}: spec removed')
            continue
        new_kind, new_value = head[key]
        if new_kind != kind:
            found.append(f'{key[0]} / {key[1]}: tolerance changed from {kind} to {new_kind}')
        elif isinstance(value, (int, float)) and not isinstance(new_value, (int, float)):
            found.append(f'{key[0]} / {key[1]}: {kind} tolerance {value:g} removed')
        elif isinstance(value, (int, float)) and new_value > value:
            found.append(f'{key[0]} / {key[1]}: {kind} tolerance loosened from {value:g} to {new_value:g}')
    return found


def label_check(base, base_read, head, head_read, labels):
    changes = loosened(spec_tolerances(base, base_read), spec_tolerances(head, head_read))
    if changes and LABEL not in labels:
        return [f'{c} (needs the {LABEL} label)' for c in changes], None
    return [], changes and f'{len(changes)} loosened tolerance(s) accepted by the {LABEL} label'


def git(*args):
    r = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def git_reader(rev):
    return lambda path: git('show', f'{rev}:{path}')


def disk_reader(path):
    p = ROOT / path
    return p.read_text() if p.is_file() else None


def event_context(env):
    path = env.get('GITHUB_EVENT_PATH')
    name = env.get('GITHUB_EVENT_NAME')
    if not path or not name:
        return None
    event = json.loads(pathlib.Path(path).read_text())
    if name != 'pull_request':
        return dict(skip=f'{name} event: the label check runs on the pull request')
    pr = event['pull_request']
    return dict(base=pr['base']['sha'], labels=[label['name'] for label in pr.get('labels', [])])


def base_revision(sha):
    if git('cat-file', '-e', f'{sha}^{{commit}}') is None:
        git('fetch', '--no-tags', '--depth=1', 'origin', sha)
    return sha if git('cat-file', '-e', f'{sha}^{{commit}}') is not None else None


def main(argv=None, env=None):
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser()
    parser.add_argument('--base')
    parser.add_argument('--label', action='append', default=[])
    a = parser.parse_args(argv)
    registry = json.loads(disk_reader(REGISTRY))
    files = (git('ls-files', '--cached', '--others', '--exclude-standard') or '').split('\n')
    errors = check(registry, disk_reader, files)
    context = event_context(env) if not a.base else None
    labels = set(a.label) | set(filter(None, env.get('BENCHMARK_GATE_LABELS', '').split(',')))
    note = None
    if context and 'skip' in context:
        note = context['skip']
    else:
        rev = a.base or (context and context['base']) or (git('merge-base', 'HEAD', 'origin/main') or '').strip()
        labels |= set(context['labels']) if context else set()
        rev = rev and base_revision(rev)
        base_text = rev and git_reader(rev)(REGISTRY)
        if not rev:
            note = 'no base revision: the tolerance-change check did not run'
        elif base_text is None:
            note = f'{REGISTRY} is new at {rev[:12]}: nothing to compare'
        else:
            found, note = label_check(json.loads(base_text), git_reader(rev), registry, disk_reader, labels)
            errors += found
    if note:
        print(f'benchmark-gate: {note}')
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    count = len(registry['benchmarks'])
    print(f'benchmark-gate: {count} benchmarks, every one with a spec, references and a justified tolerance')
    return 0


if __name__ == '__main__':
    sys.exit(main())

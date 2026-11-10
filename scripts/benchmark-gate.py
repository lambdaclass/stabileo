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
    nodes = [('', document)]
    for part in [p for p in path.split('/') if p]:
        found = []
        for where, node in nodes:
            if part == '*' and isinstance(node, dict):
                found.extend((f'{where}/{k}', v) for k, v in node.items())
            elif part == '*' and isinstance(node, list):
                found.extend((f'{where}/{i}', v) for i, v in enumerate(node))
            elif isinstance(node, dict) and part in node:
                found.append((f'{where}/{part}', node[part]))
            elif isinstance(node, list) and part.isdigit() and int(part) < len(node):
                found.append((f'{where}/{part}', node[int(part)]))
        nodes = found
    return nodes


def strip_rust(text, strings=False):
    out, i, n = [], 0, len(text)
    while i < n:
        if text.startswith('//', i):
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif text.startswith('/*', i):
            depth, i = 1, i + 2
            while i < n and depth:
                if text.startswith('/*', i):
                    depth, i = depth + 1, i + 2
                elif text.startswith('*/', i):
                    depth, i = depth - 1, i + 2
                else:
                    i += 1
        elif text[i] == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == '\\' else 1
            out.append(text[i:j + 1] if strings else '""')
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
            if c == '"':
                i += 1
                while i < len(text) and text[i] != '"':
                    i += 2 if text[i] == '\\' else 1
            elif c in '([{':
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
        calls.append((match.start(), [a for a in args if a]))
    return calls


def rebound(text, expression):
    name = re.escape(expression)
    return bool(re.search(rf'\b(?:const|let)\s+(?:mut\s+)?{name}\b', text)
                or re.search(rf'(?<![\w.])(?<!let )(?<!mut ){name}\s*[-+*/]?=(?!=)', text))


def resolve(text, expression):
    value = number(expression)
    if value is not None:
        return [value]
    if not re.fullmatch(r'[A-Za-z_]\w*', expression):
        return None
    if re.search(rf'(?<![\w.])(?<!let )(?<!mut ){expression}\s*[-+*/]?=(?!=)', text):
        return None
    if re.search(rf'\bfn\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\b{expression}\s*:', text):
        return None
    values = [number(m) for m in re.findall(
        rf'\b(?:const|let)\s+(?:mut\s+)?{expression}\s*(?::\s*f64\s*)?=\s*([^;]+);', text)]
    return values if values and None not in values and len(set(values)) == 1 else None


def enclosing(code, position):
    names = re.findall(r'\bfn\s+(\w+)', code[:position])
    return names[-1] if names else ''


def keyed(code, found):
    counts, out = {}, []
    for position, subject, value in sorted(found, key=lambda f: f[0]):
        key = f'{enclosing(code, position)}:{subject}'
        counts[key] = counts.get(key, 0) + 1
        out.append((f'{key}#{counts[key]}', value))
    return out


def rust_functions(text):
    code = strip_rust(text)
    functions = []
    for match in re.finditer(r'((?:#\[[^\]]*\]\s*)*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)[^{;]*\{', code):
        depth, end = 1, match.end()
        while end < len(code) and depth:
            depth += (code[end] == '{') - (code[end] == '}')
            end += 1
        attrs, name = match.group(1), match.group(2)
        enabled = bool(re.search(r'#\[\s*test\s*\]', attrs)) and not re.search(r'\b(?:ignore|cfg|cfg_attr)\b', attrs)
        functions.append((name, code[match.end():end - 1], enabled))
    return functions


def enabled_coverage(registry, read):
    out = set()
    for entry in registry.get('benchmarks', []):
        files = set(entry.get('files', []))
        for q in quantities(entry, read):
            for locator in q.get('test_tolerances') or []:
                files.add(locator['file'])
                files.update(c['file'] for c in locator.get('consumers', []))
        for file in sorted(files):
            if not file.endswith('.rs') or read(file) is None:
                continue
            functions = rust_functions(read(file))
            active = {name for name, _, enabled in functions if enabled}
            while True:
                reached = active | {callee for name, body, _ in functions if name in active
                                    for callee, _, _ in functions if call_arguments(body, callee)}
                if reached == active:
                    break
                active = reached
            out.update((entry['id'], file, name) for name in active)
    return out


def check_consumers(locator, read):
    for consumer in locator.get('consumers', []):
        if not consumer.get('assertions') and not consumer.get('statements'):
            raise Gate(f"{consumer['file']}: empty case-file consumer contract")
        source = read(consumer['file'])
        if source is None:
            raise Gate(f"{consumer['file']}: case-file consumer does not exist")
        code = strip_rust(source, strings=True)
        compact = lambda value: re.sub(r'\s+', '', value)
        for binding, lookup in consumer.get('bindings', {}).items():
            initializers = re.findall(rf'\blet\s+(?:mut\s+)?{re.escape(binding)}\s*(?::[^=;]+)?=\s*([^;]+);', code)
            if len(initializers) != 1 or compact(initializers[0]) != compact(lookup):
                raise Gate(f"{consumer['file']}: {binding} must be the plain case-file lookup {lookup}")
            blank = strip_rust(source)
            name = re.escape(binding)
            shadowed = (len(re.findall(rf'\blet\s+[^;=]*\b{name}\b[^;=]*=', blank)) != 1
                        or re.search(rf'\bfn\s+\w+\s*\([^)]*\b{name}\s*:', blank)
                        or re.search(rf'\|[^|;]*\b{name}\s*(?::[^|]*)?\|', blank)
                        or re.search(rf'\bfor\s+[^;{{]*\b{name}\b[^;{{]*\bin\b', blank))
            without_binding = re.sub(rf'\blet\s+{re.escape(binding)}\s*=.*?;', '', code)
            if shadowed or rebound(without_binding, binding):
                raise Gate(f"{consumer['file']}: case-file binding {binding} is reassigned")
        actual = [compact(args[0]) for _, args in call_arguments(code, 'assert!') if args]
        for statement in consumer.get('statements', []):
            if compact(code).count(compact(statement)) != 1:
                raise Gate(f"{consumer['file']}: case-file consumer must remain {statement}")
        for expression in consumer.get('assertions', []):
            expected_count = consumer['assertions'][expression] if isinstance(consumer['assertions'], dict) else 1
            if actual.count(compact(expression)) != expected_count:
                raise Gate(f"{consumer['file']}: case-file tolerance assertion must remain {expression}")


def items(locator, read):
    text = read(locator['file'])
    if text is None:
        raise Gate(f"{locator['file']}: test tolerance file does not exist")
    if 'pointer' in locator:
        check_consumers(locator, read)
        found = pointer(json.loads(text), locator['pointer'])
        if locator.get('transform') == 'ratio-bounds':
            found = [(w, max(1 - b[0], b[1] - 1)) for w, b in found]
        elif locator.get('transform') == 'ratio-floor':
            found = [(w, 1 - v) for w, v in found]
        if not found or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for _, v in found):
            raise Gate(f"{locator['file']}{locator['pointer']}: no numeric test tolerance")
        return [(w, float(v)) for w, v in found]
    code = strip_rust(text)
    if 'pattern' in locator:
        found = []
        for m in re.finditer(PATTERNS.get(locator['pattern'], locator['pattern']), code):
            rest = code[m.end(1):].lstrip()
            if number(m.group(1)) is None or (rest and rest[0] not in ',;)}{&|\n'):
                raise Gate(f"{locator['file']}: pattern {locator['pattern']!r} matched {m.group(1)!r} "
                           f"followed by {rest[:12]!r}, not a complete literal threshold")
            value = number(m.group(1))
            found.append((m.start(1), re.sub(r'\s+', '', code[m.start(0):m.start(1)]), value - 1 if locator.get('transform') == 'ratio-ceiling' else value))
        if not found:
            raise Gate(f"{locator['file']}: pattern {locator['pattern']!r} matched no numeric tolerance")
        return keyed(code, found)
    blank, code = code, strip_rust(text, strings=True)
    found, unresolved = [], []
    aliases = locator.get('aliases', {})
    for name in locator['calls']:
        for position, args in call_arguments(code, name):
            if len(args) < locator['argument']:
                continue
            argument = args[locator['argument'] - 1]
            resolved = resolve(blank, argument)
            if resolved is None and argument in aliases and not rebound(blank, argument):
                resolved = extract(aliases[argument], read)
            if resolved is None:
                unresolved.append(f'{name}(…{argument}…)')
            else:
                found.extend((position, re.sub(r'\s+', '', f'{name}({args[0]})'), v) for v in resolved)
    if unresolved:
        raise Gate(f"{locator['file']}: tolerance arguments that are neither literals, constants nor aliases "
                   f"of a case-file tolerance: {', '.join(unresolved[:3])}")
    if not found:
        raise Gate(f"{locator['file']}: no {'/'.join(locator['calls'])} tolerance found")
    return keyed(code, found)


def extract(locator, read):
    return [v for _, v in items(locator, read)]


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
    cited = [(str(r.get('source')).strip(), str(r.get('location')).strip()) for r in q.get('references') or []]
    if len(cited) != len(set(cited)):
        errors.append(f'{where}: the same reference is listed twice')
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
    if not locators and not (unaudited and limit is None):
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
            if 'protocol' not in entry and any(file.endswith('.rs') for file in entry.get('files', [])):
                for locator in q.get('test_tolerances') or []:
                    if 'pointer' in locator and not locator.get('consumers'):
                        errors.append(f"{bid}: {locator['file']}{locator['pointer']} needs its Rust consumers")
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


def test_tolerances(registry, read):
    out = {}
    for entry in registry.get('benchmarks', []):
        if 'protocol' in entry and read(entry['protocol']) is None:
            continue
        for q in quantities(entry, read):
            for locator in q.get('test_tolerances') or []:
                try:
                    found = items(locator, read)
                except Gate:
                    continue
                for where, value in found:
                    key = (entry.get('id'), q.get('quantity'), locator['file'], json.dumps({k: v for k, v in locator.items() if k != 'consumers'}, sort_keys=True), where)
                    out[key] = max(value, out.get(key, value))
    return out


def tests_loosened(base, head):
    found = []
    for key, old in base.items():
        new = head.get(key)
        where = f'{key[0]} / {key[1]}: test tolerance {key[2]} {key[4]}'
        if new is None:
            found.append(f'{where} ({old:g}) removed or moved')
        elif new > old:
            found.append(f'{where} loosened from {old:g} to {new:g}')
    return found


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


def consumer_contracts(registry, read):
    out = set()
    for entry in registry.get('benchmarks', []):
        for q in quantities(entry, read):
            for locator in q.get('test_tolerances') or []:
                for consumer in locator.get('consumers', []):
                    out.add((entry['id'], q['quantity'], locator['file'], locator.get('pointer', ''), json.dumps(consumer, sort_keys=True)))
    return out


def label_check(base, base_read, head, head_read, labels, reason=None):
    changes = (loosened(spec_tolerances(base, base_read), spec_tolerances(head, head_read))
               + tests_loosened(test_tolerances(base, base_read), test_tolerances(head, head_read))
               + [f'{bid}: enabled benchmark {file} {name} removed or disabled'
                  for bid, file, name in sorted(enabled_coverage(base, base_read) - enabled_coverage(head, head_read))]
               + [f'{bid} / {quantity}: case-file consumer contract for {file}{pointer} removed or changed'
                  for bid, quantity, file, pointer, _ in sorted(consumer_contracts(base, base_read) - consumer_contracts(head, head_read))])
    if changes and LABEL not in labels:
        return [f'{c} (needs the {LABEL} label)' for c in changes], None
    if changes and not str(reason or '').strip():
        return [f'{c} (needs a non-empty tolerance-change reason)' for c in changes], None
    return [], changes and f'{len(changes)} loosened tolerance(s) accepted by the {LABEL} label: {reason.strip()}'


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
    return dict(base=pr['base']['sha'], labels=[label['name'] for label in pr.get('labels', [])], body=pr.get('body') or '')


def base_revision(sha):
    if git('cat-file', '-e', f'{sha}^{{commit}}') is None:
        git('fetch', '--no-tags', '--depth=1', 'origin', sha)
    return sha if git('cat-file', '-e', f'{sha}^{{commit}}') is not None else None


def main(argv=None, env=None):
    env = os.environ if env is None else env
    parser = argparse.ArgumentParser()
    parser.add_argument('--base')
    parser.add_argument('--reason')
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
        if context and 'BENCHMARK_GATE_LABELS' not in env:
            labels |= set(context['labels'])
        rev = rev and base_revision(rev)
        base_text = rev and git_reader(rev)(REGISTRY)
        if not rev and context:
            errors.append(f"cannot read the pull request base {context['base']}: the tolerance-change check cannot run")
        elif not rev:
            note = 'no base revision: the tolerance-change check did not run'
        elif base_text is None:
            note = f'{REGISTRY} is new at {rev[:12]}: nothing to compare'
        else:
            reason = a.reason or env.get('BENCHMARK_GATE_REASON')
            if not reason and context:
                match = re.search(r'^Tolerance-change reason:[ \t]*([^\r\n]*)', context.get('body', ''), re.MULTILINE | re.IGNORECASE)
                reason = match.group(1).strip() if match else None
            found, note = label_check(json.loads(base_text), git_reader(rev), registry, disk_reader, labels, reason=reason)
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

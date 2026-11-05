#!/usr/bin/env python3
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REGISTRY = 'engine/tests/metamorphic/entry_points.json'
SOURCES = 'engine/src'
DOC = 'docs/verification/METAMORPHIC.md'
ANALYSES = {'pr_2d': 'engine/tests/metamorphic/ana2.rs', 'pr_3d': 'engine/tests/metamorphic/ana3.rs'}
INVARIANCES = {
    'units': 'units',
    'relabel': 'relabel',
    'reversal': 'reversal',
    'rotation': 'rotation',
    'mirror': 'mirror',
    'planes': None,
    'prepared': 'linear agreement',
}


def strip_rust(text):
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
            out.append('""')
            i = j + 1
        elif text[i] == "'" and re.match(r"'(?:[^'\\]|\\.[^']*)'", text[i:]):
            j = re.match(r"'(?:[^'\\]|\\.[^']*)'", text[i:]).end()
            out.append("' '")
            i += j
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)


def block(code, start):
    i = code.find('{', start)
    depth = 0
    for j in range(i, len(code)):
        if code[j] == '{':
            depth += 1
        elif code[j] == '}':
            depth -= 1
            if depth == 0:
                return i, j + 1
    return i, len(code)


ATTRIBUTE = re.compile(r'#\[(?:wasm_bindgen\b|cfg_attr\s*\([^\]]*\bwasm_bindgen\b)[^\]]*\]')
ITEM = re.compile(r'(?:\s*#\[[^\]]*\])*\s*(?:(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)|impl\s+(\w+)\s*\{)')


def exports(sources):
    found = {}
    for path, text in sources.items():
        code = strip_rust(text)
        impls = []
        for attribute in ATTRIBUTE.finditer(code):
            if any(a <= attribute.start() < b for a, b in impls):
                continue
            item = ITEM.match(code, attribute.end())
            if not item:
                continue
            if item.group(2):
                a, b = block(code, item.start(2))
                impls.append((a, b))
                body = code[a + 1:b - 1]
                methods = {}
                for method in re.finditer(r'((?:#\[[^\]]*\]\s*)*)\bpub\s+(?:async\s+)?fn\s+(\w+)', body):
                    if depth_at(body, method.start()) == 0:
                        start = a + 1 + method.start(2)
                        methods[method.group(2)] = (code[slice(*block(code, start))], 'constructor' in method.group(1))
                constructors = ''.join(text for text, constructor in methods.values() if constructor)
                for method, (text, constructor) in methods.items():
                    found[f'{item.group(2)}::{method}'] = (path, text if constructor else text + constructors, code)
            else:
                found[item.group(1)] = (path, code[slice(*block(code, item.start(1)))], code)
    return found


def depth_at(code, position):
    return code.count('{', 0, position) - code.count('}', 0, position)


def table(doc, section):
    begin, end = f'<!-- BEGIN {section} -->', f'<!-- END {section} -->'
    if begin not in doc or end not in doc:
        return None
    rows = [r.strip().strip('|').split('|') for r in doc[doc.index(begin) + len(begin):doc.index(end)].strip().splitlines()]
    header = [c.strip() for c in rows[0]]
    return {r[0].strip(): dict(zip(header[1:], (c.strip() for c in r[1:]))) for r in rows[2:]}


def analysis_rows(code):
    rows = {}
    for start in re.finditer(r'\bAna[23]\s*\{', code):
        a, b = block(code, start.start())
        name = re.search(r'\bname:\s*"([^"]*)"', code[a:b])
        if name:
            rows.setdefault(name.group(1), code[a:b])
    return rows


def functions(code):
    return {m.group(1): code[slice(*block(code, m.end()))] for m in re.finditer(r'\bfn\s+(\w+)\s*(?:<[^>{]*>)?\s*\(', code)}


def reaches(code, targets, helpers, context):
    return all(calls(code, t, context) or any(calls(code, name) and calls(body, t, context) for name, body in helpers.items()) for t in targets)


def calls(code, target, context=''):
    qualifier, _, name = target.rpartition('::')
    call = r'\s*(?:::<[^>]*>\s*)?\('
    if not qualifier:
        return re.search(rf'(?<![\w]){re.escape(name)}{call}', code) is not None
    owner = re.escape(qualifier.rpartition('::')[2])
    if re.search(rf'(?<![\w]){owner}::{re.escape(name)}{call}', code):
        return True
    imported = re.search(rf'\buse\s+[^;]*\b{owner}::(?:{re.escape(name)}\b|\*|\{{[^;]*\b{re.escape(name)}\b)', context)
    return bool(imported) and re.search(rf'(?<![\w:.]){re.escape(name)}{call}', code) is not None


def targets_of(entry):
    value = entry.get('calls')
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list) or not values or not all(isinstance(v, str) and re.fullmatch(r'\w+(?:::\w+)*', v) for v in values):
        return None
    return values


def check(registry, sources, read):
    errors = []
    found = exports(sources)
    entries = registry.get('entry_points', {})
    scopes = registry.get('scopes', {})
    for name in sorted(set(found) - set(entries)):
        errors.append(f'{name} ({found[name][0]}): a WASM export with no row in {REGISTRY}; add it with its scope, and for a solve entry point every invariance')
    for name in sorted(set(entries) - set(found)):
        errors.append(f'{name}: a registry row for a WASM export that no longer exists')
    doc = read(DOC) or ''
    tables, rows, helpers = {}, {}, {}
    for name in sorted(set(entries) & set(found)):
        entry, (path, body, context) = entries[name], found[name]
        scope = entry.get('scope')
        if scope != 'solve':
            if scope not in scopes or not str(scopes[scope]).strip():
                errors.append(f'{name}: scope {scope!r} is neither "solve" nor one of the described scopes {sorted(scopes)}')
            if 'invariances' in entry:
                errors.append(f'{name}: only a solve entry point lists invariances')
            continue
        target = targets_of(entry)
        if target is None:
            errors.append(f'{name}: a solve entry point names the function or functions it calls ("calls": a path like "linear::solve_2d", or a list of them)')
            continue
        for t in target:
            if not calls(body, t, context):
                errors.append(f'{name}: its wrapper in {path} does not call {t}')
        statuses = entry.get('invariances', {})
        for key in sorted(set(INVARIANCES) - set(statuses)):
            errors.append(f'{name}: invariance {key!r} has no status (covered by a test, exempt with a reason, or tracked by an issue)')
        for key in sorted(set(statuses) - set(INVARIANCES)):
            errors.append(f'{name}: unknown invariance {key!r}')
        for key in sorted(set(statuses) & set(INVARIANCES)):
            errors.extend(f'{name} {key}: {e}' for e in status(statuses[key], key, target, doc, tables, rows, helpers, read))
        claims = {}
        for key, value in sorted(statuses.items()):
            if isinstance(value, dict) and set(value) == {'test'}:
                claims.setdefault(str(value['test']), []).append(key)
        for test, keys in sorted(claims.items()):
            if len(keys) > 1:
                errors.append(f'{name}: {test} claims {", ".join(keys)}; each invariance needs its own test, with its own comparison')
    return errors


def status(value, key, target, doc, tables, rows, helpers, read):
    if not isinstance(value, dict) or len(value) not in (1, 2):
        return [f'status must be one of {{"metamorphic", "analysis"}}, {{"test"}}, {{"exempt"}} or {{"tracked"}}, not {value!r}']
    if set(value) == {'exempt'}:
        return [] if isinstance(value['exempt'], str) and value['exempt'].strip() else ['an exemption needs a reason']
    if set(value) == {'tracked'}:
        return [] if isinstance(value['tracked'], int) and not isinstance(value['tracked'], bool) and value['tracked'] > 0 else ['"tracked" is an issue number']
    if set(value) == {'test'}:
        file, _, test = str(value['test']).partition('::')
        text = read(file) if file.startswith('engine/tests/') else None
        if text is None:
            return [f'{value["test"]}: no such test file under engine/tests/']
        code = strip_rust(text)
        match = re.search(rf'\bfn\s+{re.escape(test)}\s*\(', code) if test else None
        attributes = outer_attributes(code, match.start()) if match else ''
        if not re.search(r'#\[test\]', attributes):
            return [f'{value["test"]}: no #[test] fn {test!r} in {file}']
        if disabled(attributes):
            return [f'{value["test"]}: an ignored or conditionally compiled test does not run in the PR tier']
        hidden = enclosing_cfg(code, match.start())
        if hidden:
            return [f'{value["test"]}: {hidden}, so the test does not run in the PR tier']
        if file not in compiled_tests(read):
            return [f'{value["test"]}: {file} is not compiled into any test target (engine/Cargo.toml [[test]] and their unconditional mod declarations)']
        body = code[slice(*block(code, match.end()))]
        missing = [t for t in target if not calls(body, t, code)]
        if missing:
            return [f'{value["test"]}: the test does not call {", ".join(missing)}, so it does not cover this entry point']
        if not compares_result(body, target, code):
            return [f'{value["test"]}: no assertion uses what {", ".join(target)} returned, so the test checks no invariance']
        return []
    if set(value) == {'metamorphic', 'analysis'}:
        section, analysis = value['metamorphic'], value['analysis']
        column = INVARIANCES[key]
        if column is None:
            return [f'the metamorphic tier has no {key!r} check; cover it with a test, exempt it or track it']
        if section not in ANALYSES:
            return [f'unknown metamorphic tier {section!r}; one of {sorted(ANALYSES)}']
        if section not in tables:
            tables[section] = table(doc, section)
            code = strip_rust_keep_names(read(ANALYSES[section]) or '')
            rows[section] = analysis_rows(code)
            helpers[section] = (functions(code), code)
        if tables[section] is None:
            return [f'{DOC} has no {section} table']
        if analysis not in rows[section]:
            return [f'{ANALYSES[section]} has no analysis {analysis!r}']
        if not reaches(rows[section][analysis], target, *helpers[section]):
            return [f'the metamorphic analysis {analysis!r} does not call {" and ".join(target)}, so it does not cover this entry point']
        cell = tables[section].get(analysis, {}).get(column)
        if cell != '✓':
            return [f'{DOC} ({section}) shows {cell or "nothing"!s} for {analysis!r} × {column!r}, not ✓']
        return []
    return [f'status must be one of {{"metamorphic", "analysis"}}, {{"test"}}, {{"exempt"}} or {{"tracked"}}, not {value!r}']


DISABLING = re.compile(r'#!?\[\s*(?:ignore|cfg_attr|cfg(?!\s*\(\s*test\s*\)\s*\]))\b')


def disabled(attributes):
    return DISABLING.search(attributes) is not None


def outer_attributes(code, position):
    return re.search(r'(?:#\[[^\]]*\]\s*)*$', code[:position]).group(0)


def inner_attributes(code, position):
    return re.match(r'\s*((?:#!\[[^\]]*\]\s*)*)', code[position:]).group(1)


def enclosing_cfg(code, position):
    if disabled(inner_attributes(code, 0)):
        return 'its file is conditionally compiled'
    for m in re.finditer(r'\b(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*\{', code):
        a, b = block(code, m.start())
        if a < position < b and (disabled(outer_attributes(code, m.start())) or disabled(inner_attributes(code, a + 1))):
            return 'an enclosing module is ignored or conditionally compiled'
    return None


def compiled_tests(read):
    cargo = read('engine/Cargo.toml') or ''
    roots = {f'engine/{p}' for p in re.findall(r'\[\[test\]\][^\[]*?\bpath\s*=\s*"([^"]+)"', cargo)}
    seen, queue = set(), sorted(roots)
    while queue:
        file = queue.pop()
        text = read(file)
        if file in seen or text is None:
            continue
        seen.add(file)
        code = strip_rust_keep(text, r'#\[\s*path\s*=\s*"([^"\\]*)"\s*\]')
        if disabled(inner_attributes(code, 0)):
            continue
        folder = pathlib.PurePosixPath(file).parent
        if pathlib.PurePosixPath(file).name not in ('main.rs', 'mod.rs', 'lib.rs'):
            folder = folder / pathlib.PurePosixPath(file).stem
        for m in re.finditer(r'\b(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;', code):
            attributes = outer_attributes(code, m.start())
            if disabled(attributes) or enclosing_cfg(code, m.start()):
                continue
            path = re.search(r'#\[\s*path\s*=\s*"([^"]*)"', attributes)
            if path:
                queue.append(normalize(pathlib.PurePosixPath(file).parent / path.group(1)))
            else:
                queue += [(folder / f'{m.group(1)}.rs').as_posix(), (folder / m.group(1) / 'mod.rs').as_posix()]
    return seen


def normalize(path):
    parts = []
    for part in path.parts:
        if part == '..' and parts:
            parts.pop()
        elif part != '.':
            parts.append(part)
    return '/'.join(parts)


def bracketed(code, start):
    pairs = {'(': ')', '[': ']', '{': '}'}
    close, depth = pairs[code[start]], 0
    for j in range(start, len(code)):
        if code[j] == code[start]:
            depth += 1
        elif code[j] == close:
            depth -= 1
            if depth == 0:
                return code[start + 1:j]
    return code[start + 1:]


def bindings(body):
    found = []
    for m in re.finditer(r'\b(?:let|for)\s+(.*?)(?:\s+in\s+|\s*(?::[^=;]*)?=(?!=))', body):
        depth, end = 0, m.end()
        while end < len(body) and not (depth == 0 and body[end] in ';{'):
            depth += 1 if body[end] in '([' else -1 if body[end] in ')]' else 0
            end += 1
        names = set(re.findall(r'\b[a-z_]\w*\b', m.group(1))) - {'mut', 'ref', '_', 'in'}
        found.append((names, body[m.end():end]))
    return found


def compares_result(body, targets, context):
    uses = lambda text, names: any(re.search(rf'(?<![\w.]){re.escape(n)}\b', text) for n in names)
    from_target = lambda text: any(calls(text, t, context) for t in targets)
    tainted, changed = set(), True
    while changed:
        changed = False
        for names, value in bindings(body):
            if not names <= tainted and (from_target(value) or uses(value, tainted)):
                tainted |= names
                changed = True
    asserting = {name for name, b in functions(context).items() if re.search(r'\bassert\w*!', b)}
    for m in re.finditer(r'\b(assert\w*!|\w+)\s*(?:::<[^>]*>\s*)?([(\[{])', body):
        if m.group(1).endswith('!') or m.group(1) in asserting:
            arguments = bracketed(body, m.end(2) - 1)
            if from_target(arguments) or uses(arguments, tainted):
                return True
    return False


def strip_rust_keep(text, pattern):
    kept = []

    def keep(m):
        kept.append(m.group(1))
        return m.group(0).replace(f'"{m.group(1)}"', f'K{len(kept) - 1}K')
    code = strip_rust(re.sub(pattern, keep, text))
    return re.sub(r'K(\d+)K', lambda m: f'"{kept[int(m.group(1))]}"', code)


def strip_rust_keep_names(text):
    names = {}

    def keep(m):
        names[len(names)] = m.group(1)
        return f'name: N{len(names) - 1}N'
    code = strip_rust(re.sub(r'\bname:\s*"([^"\\]*)"', keep, text))
    return re.sub(r'name: N(\d+)N', lambda m: f'name: "{names[int(m.group(1))]}"', code)


def read_file(relative):
    path = ROOT / relative
    return path.read_text() if path.is_file() else None


def main():
    sources = {p.relative_to(ROOT).as_posix(): p.read_text() for p in sorted((ROOT / SOURCES).rglob('*.rs'))}
    text = read_file(REGISTRY)
    if text is None:
        print(f'invariance gate: {REGISTRY} is missing', file=sys.stderr)
        return 1
    errors = check(json.loads(text), sources, read_file)
    for error in errors:
        print(f'invariance gate: {error}', file=sys.stderr)
    if errors:
        return 1
    print(f'invariance gate: every WASM export has a registry row ({REGISTRY})')
    return 0


if __name__ == '__main__':
    sys.exit(main())

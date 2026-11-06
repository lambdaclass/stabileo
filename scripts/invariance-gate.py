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
    'planes': 'planes',
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
    return any(re.search(rf'(?<![\w:.]){re.escape(b)}{call}', code) for b in imported_as(context, qualifier.rpartition('::')[2], name))


def imported_as(context, owner, name):
    names = set()
    for use in re.findall(r'\buse\s+([^;]*);', context):
        for m in re.finditer(rf'\b{re.escape(owner)}::', use):
            rest = use[m.end():].lstrip()
            items = arguments(bracketed(rest, 0)) if rest.startswith('{') else [re.match(r'[\w*]+(?:\s+as\s+\w+)?', rest).group(0)] if re.match(r'[\w*]', rest) else []
            for item in items:
                item = item.strip()
                if item == '*':
                    names.add(name)
                parts = re.fullmatch(rf'{re.escape(name)}(?:\s+as\s+(\w+))?', item)
                if parts and parts.group(1) != '_':
                    names.add(parts.group(1) or name)
    return names


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
        if not compares_result(body, target[-1:], code):
            return [f'{value["test"]}: no assertion uses what {target[-1]} returned, so the test checks no invariance']
        return []
    if set(value) == {'metamorphic', 'analysis'}:
        section, analysis = value['metamorphic'], value['analysis']
        column = INVARIANCES[key]
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
    default = re.search(r'^\[features\][^\[]*?^default\s*=\s*\[([^\]]*)\]', cargo, re.M | re.S)
    enabled = set(re.findall(r'"([^"]+)"', default.group(1))) if default else set()
    roots = set()
    for target in re.split(r'^\[\[test\]\]\s*$', cargo, flags=re.M)[1:]:
        target = re.split(r'^\[', target, flags=re.M)[0]
        path = re.search(r'^path\s*=\s*"([^"]+)"', target, re.M)
        required = re.search(r'^required-features\s*=\s*\[([^\]]*)\]', target, re.M)
        if path and set(re.findall(r'"([^"]+)"', required.group(1) if required else '')) <= enabled:
            roots.add(f'engine/{path.group(1)}')
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
        if file not in roots and pathlib.PurePosixPath(file).name not in ('main.rs', 'mod.rs', 'lib.rs'):
            folder = folder / pathlib.PurePosixPath(file).stem
        for m in re.finditer(r'\b(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;', code):
            attributes = outer_attributes(code, m.start())
            if disabled(attributes) or enclosing_cfg(code, m.start()):
                continue
            inline = [n.group(1) for n in re.finditer(r'\bmod\s+(\w+)\s*\{', code) if block(code, n.start())[0] < m.start() < block(code, n.start())[1]]
            here = folder.joinpath(*inline)
            path = re.search(r'#\[\s*path\s*=\s*"([^"]*)"', attributes)
            if path:
                queue.append(normalize((here if inline else pathlib.PurePosixPath(file).parent) / path.group(1)))
            else:
                queue += [(here / f'{m.group(1)}.rs').as_posix(), (here / m.group(1) / 'mod.rs').as_posix()]
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


def statement_end(body, start):
    depth, end = 0, start
    while end < len(body) and not (depth == 0 and body[end] in ';{'):
        depth += 1 if body[end] in '([' else -1 if body[end] in ')]' else 0
        end += 1
    return end


def disabled_spans(body):
    spans = []
    for m in re.finditer(r'#\[[^\]]*\]', body):
        if disabled(m.group(0)):
            start = m.end() + len(re.match(r'(?:\s*#\[[^\]]*\])*\s*', body[m.end():]).group(0))
            end = statement_end(body, start)
            if end < len(body) and body[end] == '{':
                end = block(body, end)[1]
            spans.append((m.start(), end))
    return spans


def events(body):
    found = []
    for m in re.finditer(r'\b(?:let|for)\s+(.*?)(?:\s+in\s+|\s*(?::[^=;]*)?=(?!=))', body):
        names = set(re.findall(r'\b[a-z_]\w*\b', m.group(1))) - {'mut', 'ref', '_', 'in'}
        found.append((m.start(), 'bind', names, body[m.end():statement_end(body, m.end())]))
    for m in re.finditer(r'(?<![\w.])([a-z_]\w*)\s*[-+*/]?=(?![=>])', body):
        if not re.search(r'\b(?:let|for|mut|ref)\s*(?:\([^;=]*)?$', body[:m.start()].rsplit(';', 1)[-1].rsplit('{', 1)[-1]):
            found.append((m.start(), 'bind' if body[m.end(1):m.end()].strip() == '=' else 'update', {m.group(1)}, body[m.end():statement_end(body, m.end())]))
    for m in re.finditer(r'\b(assert\w*!|\w+)\s*(?:::<[^>]*>\s*)?([(\[{])', body):
        found.append((m.start(), 'call', m.group(1), bracketed(body, m.end(2) - 1)))
    spans = disabled_spans(body)
    return sorted((e for e in found if not any(a <= e[0] < b for a, b in spans)), key=lambda e: e[0])


def arguments(text):
    parts, depth, current = [], 0, ''
    for ch in text:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(current)
            current = ''
        else:
            current += ch
    if current.strip():
        parts.append(current)
    return parts


def parameters(context, name):
    m = re.search(rf'\bfn\s+{re.escape(name)}\s*(?:<[^>{{]*>)?\s*\(', context)
    return [re.match(r'\s*(?:mut\s+)?([a-z_]\w*)', p).group(1) if re.match(r'\s*(?:mut\s+)?[a-z_]\w*\s*:', p) else None for p in arguments(bracketed(context, m.end() - 1))]


def asserts_on(body, seed, targets, context, depth=0):
    uses = lambda text, names: any(re.search(rf'(?<![\w.]){re.escape(n)}\b', text) for n in names)
    derived = lambda text, tainted: any(calls(text, t, context) for t in targets) or uses(text, tainted)
    helpers = functions(context)
    tainted = set(seed)
    for _, kind, what, text in events(body):
        if kind == 'bind':
            tainted = tainted | what if derived(text, tainted) else tainted - what
        elif kind == 'update' and derived(text, tainted):
            tainted |= what
        elif kind == 'call' and what.endswith('!'):
            operands = arguments(text)[:1 if what in ('assert!', 'debug_assert!') else 2]
            if any(derived(o, tainted) for o in operands):
                return True
        elif kind == 'call' and what in helpers and depth < 2:
            names = parameters(context, what)
            seeded = {n for n, a in zip(names, arguments(text)) if n and derived(a, tainted)}
            if seeded and asserts_on(helpers[what], seeded, [], context, depth + 1):
                return True
    return False


def compares_result(body, targets, context):
    return asserts_on(body, set(), targets, context)


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

"""Fail on an engine #[test] that asserts on elapsed wall-clock time and could run in the shared
engine suite. Such a test must be #[ignore] and named in the Makefile's GATE_TIMED_IGNORED (run
alone in Engine Gates), or live in a module Engine Gates runs (GATE_MODULES, GATE_TIMED_MODULES)."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TIMING = re.compile(r'\.elapsed\(\)|Instant::now\(\)|\.duration_since\(')


def makefile_var(text, name):
    m = re.search(rf'^{name} = (.*)$', text, re.MULTILINE)
    return m[1] if m else ''


def inline_mods(lines):
    stack, depth, mods = [], 0, []
    for line in lines:
        code = re.sub(r'//.*', '', line)
        m = re.match(r'\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*\{', code)
        if m:
            stack.append((m[1], depth))
        depth += code.count('{') - code.count('}')
        while stack and depth <= stack[-1][1]:
            stack.pop()
        mods.append([name for name, _ in stack])
    return mods


def module_of(relative):
    parts = list(relative.parts)
    if parts[:2] == ['engine', 'src']:
        parts = parts[2:]
    elif parts[:2] == ['engine', 'tests']:
        parts = parts[-1:]
    stem = parts[-1][:-3]
    parts = parts[:-1] + ([] if stem in ('lib', 'main', 'mod') else [stem])
    return parts


def tests(source):
    lines = source.split('\n')
    mods = inline_mods(lines)
    i = 0
    while i < len(lines):
        if re.match(r'\s*#\[test\]', lines[i]):
            attrs = []
            j = i - 1
            while j >= 0 and re.match(r'\s*(#\[|///|//)', lines[j]):
                attrs.append(lines[j].strip())
                j -= 1
            k = i + 1
            while k < len(lines) and re.match(r'\s*(#\[|///|//)', lines[k]):
                attrs.append(lines[k].strip())
                k += 1
            m = re.search(r'\bfn\s+(\w+)', lines[k]) if k < len(lines) else None
            depth, started, body = 0, False, []
            for line in lines[k:]:
                code = re.sub(r'//.*', '', line)
                body.append(code)
                depth += code.count('{') - code.count('}')
                started = started or '{' in code
                if started and depth <= 0:
                    break
            if m:
                yield '::'.join(mods[i] + [m[1]]), any(a.startswith('#[ignore') for a in attrs), body, k + 1
            i = k
        i += 1


def uses(text, tainted):
    return bool(re.search(r'\.elapsed\(\)|\.duration_since\(', text)) or any(re.search(rf'\b{re.escape(t)}\b', text) for t in tainted)


def macro_calls(text, name):
    for m in re.finditer(rf'\b{name}!\s*\(', text):
        depth, i = 0, m.end() - 1
        while i < len(text):
            depth += {'(': 1, ')': -1}.get(text[i], 0)
            if depth == 0:
                yield text[m.start():i + 1]
                break
            i += 1


def asserts_on_time(body):
    text = '\n'.join(body)
    if not TIMING.search(text):
        return []
    statements = text.split(';')
    tainted = set()
    changed = True
    while changed:
        changed = False
        for st in statements:
            let = re.search(r'\blet\s+(?:mut\s+)?(.+?)(?::[^=]+)?=(.*)', st, re.DOTALL)
            if let:
                names, rhs = set(re.findall(r'\b[a-z_]\w*\b', let[1])) - {'mut', '_'}, let[2]
            else:
                target = re.match(r'\s*([a-z_]\w*)\s*(?:\.(?:push|extend|insert)\s*\(|[+\-*/]?=[^=])', st)
                if not target:
                    continue
                names, rhs = {target[1]}, st[target.end():]
            if uses(rhs, tainted) and not names <= tainted:
                tainted |= names
                changed = True
    hits = []
    for name in ('assert', 'assert_eq', 'assert_ne', 'debug_assert', 'debug_assert_eq', 'debug_assert_ne'):
        hits += [' '.join(call.split()) for call in macro_calls(text, name) if uses(call, tainted)]
    return hits


def violations(root=ROOT):
    makefile = (root / 'Makefile').read_text()
    listed = set(re.findall(r'test\(=([\w:]+)\)', makefile_var(makefile, 'GATE_TIMED_IGNORED')))
    gate_files = {root / 'engine/tests' / f'{m}.rs'
                  for m in (makefile_var(makefile, 'GATE_MODULES') + ' ' + makefile_var(makefile, 'GATE_TIMED_MODULES')).split()}
    out = []
    for path in sorted((root / 'engine').rglob('*.rs')):
        if 'target' in path.relative_to(root).parts or path in gate_files:
            continue
        module = module_of(path.relative_to(root))
        for inner, ignored, body, line in tests(path.read_text()):
            name = '::'.join(module + [inner])
            hits = asserts_on_time(body)
            if hits and not (ignored and name in listed):
                out.append(f'{path.relative_to(root)}:{line} {name}: asserts on wall-clock time ({hits[0]}); '
                           'count the work instead, or #[ignore] it and add it to GATE_TIMED_IGNORED')
    return out


if __name__ == '__main__':
    found = violations()
    for v in found:
        print(f'::error::{v}')
    sys.exit(1 if found else 0)

"""Fail on an engine #[test] that asserts on elapsed wall-clock time with an assert macro: the
budget goes through wall_clock::budget, which pull-request and merge-queue runs report instead
of failing on. A test with a budget must be #[ignore] and named in the Makefile's
GATE_TIMED_IGNORED (run alone in Engine Gates), or live in a module Engine Gates runs
(GATE_MODULES, GATE_TIMED_MODULES). A watchdog test, whose timing is the contract under test
rather than a performance budget, keeps a hard assert but must still be ignored and listed."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
WATCHDOGS = {'fuzz_regressions::a_blocking_child_is_killed_at_its_timeout'}
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


def balanced(text, start):
    depth = 0
    for i in range(start, len(text)):
        depth += {'(': 1, '{': 1, '[': 1, ')': -1, '}': -1, ']': -1}.get(text[i], 0)
        if depth == 0:
            return text[start:i + 1]
    return text[start:]


def checked_args(call):
    inner = call[call.index('(') + 1:-1]
    args, depth, current = [], 0, ''
    for ch in inner:
        depth += {'(': 1, '{': 1, '[': 1, ')': -1, '}': -1, ']': -1}.get(ch, 0)
        if ch == ',' and depth == 0:
            args.append(current)
            current = ''
        else:
            current += ch
    args.append(current)
    return args[:2] if re.match(r'(debug_)?assert_(eq|ne)!', call) else args[:1]


def asserts_on_time(body):
    text = '\n'.join(body)
    if not TIMING.search(text):
        return []
    statements = text.split(';')
    tainted = {m[1] for m in re.finditer(r'\blet\s+(?:mut\s+)?(\w+)[^=;]*=\s*(?=\{)', text)
               if uses(balanced(text, m.end()), set())}
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
        hits += [' '.join(call.split()) for call in macro_calls(text, name)
                 if any(uses(arg, tainted) for arg in checked_args(call))]
    return hits


def budget_calls(body):
    text = '\n'.join(body)
    return [' '.join(('wall_clock::budget' + balanced(text, m.end() - 1)).split()) for m in re.finditer(r'\bwall_clock::budget\s*\(', text)]


def violations(root=ROOT):
    makefile = (root / 'Makefile').read_text()
    listed = set(re.findall(r'test\(=([\w:]+)\)', makefile_var(makefile, 'GATE_TIMED_IGNORED')))
    gate_files = {root / 'engine/tests' / f'{m}.rs'
                  for m in (makefile_var(makefile, 'GATE_MODULES') + ' ' + makefile_var(makefile, 'GATE_TIMED_MODULES')).split()}
    out = []
    for path in sorted((root / 'engine').rglob('*.rs')):
        if 'target' in path.relative_to(root).parts:
            continue
        module = module_of(path.relative_to(root))
        for inner, ignored, body, line in tests(path.read_text()):
            name = '::'.join(module + [inner])
            where = f'{path.relative_to(root)}:{line} {name}'
            raw = asserts_on_time(body)
            if raw and name in WATCHDOGS:
                if not (ignored and name in listed):
                    out.append(f'{where}: a watchdog test asserts on wall-clock time; #[ignore] it and add it to GATE_TIMED_IGNORED')
            elif raw:
                out.append(f'{where}: asserts on wall-clock time ({raw[0]}); count the work instead, '
                           'or use wall_clock::budget so pull-request runs report the overrun instead of failing')
            elif budget_calls(body) and path not in gate_files and not (ignored and name in listed):
                out.append(f'{where}: has a wall-clock budget ({budget_calls(body)[0]}); '
                           '#[ignore] it and add it to GATE_TIMED_IGNORED')
    return out


if __name__ == '__main__':
    found = violations()
    for v in found:
        print(f'::error::{v}')
    sys.exit(1 if found else 0)

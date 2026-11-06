"""Fail on a numeric fallback that can turn a failed check into 0 or a pass in the engine's design,
certify and postprocess code: `else { 0 }`, `unwrap_or(0)` and `.max(0.0)`. A demand/capacity
ratio goes through `crate::check`; any other use is listed in scripts/fail-closed-allow.txt under a
`## reason` line, one line per occurrence."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIRS = ('engine/src/design', 'engine/src/certify', 'engine/src/postprocess')
ALLOW = ROOT / 'scripts/fail-closed-allow.txt'
ZERO = r'0(?:\.0*)?(?:_?(?:f64|f32|usize|u32|u64|i32|i64|isize))?'
PATTERNS = (
    ('else { 0 }', re.compile(rf'\belse\s*\{{\s*{ZERO}\s*\}}')),
    ('unwrap_or(0)', re.compile(rf'\.unwrap_or\(\s*{ZERO}\s*\)')),
    ('.max(0.0)', re.compile(rf'\.max\(\s*0\.0*(?:_?(?:f64|f32))?\s*\)')),
)


def blank(text):
    """The source with comments and string/char literal contents replaced by spaces, newlines kept."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if text.startswith('//', i):
            j = text.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
        elif text.startswith('/*', i):
            depth, j = 1, i + 2
            while j < n and depth:
                if text.startswith('/*', j):
                    depth, j = depth + 1, j + 2
                elif text.startswith('*/', j):
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
        elif c == 'r' and re.match(r'r#*"', text[i:]) and (i == 0 or not (text[i - 1].isalnum() or text[i - 1] == '_')):
            hashes = re.match(r'r(#*)"', text[i:])[1]
            end = text.find('"' + hashes, i + 2 + len(hashes))
            j = n if end < 0 else end + 1 + len(hashes)
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == '\\' else 1
            j = min(j + 1, n)
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
        elif c == "'" and re.match(r"'(?:[^'\\\n]|\\[^\n]+?)'", text[i:]):
            m = re.match(r"'(?:[^'\\\n]|\\[^\n]+?)'", text[i:])
            out.append(' ' * len(m[0]))
            i += len(m[0])
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def without_tests(code):
    """`code` with every `#[cfg(test)]` item blanked."""
    chars = list(code)
    for m in re.finditer(r'#\[cfg\(test\)\]', code):
        open_at = code.find('{', m.end())
        semi = code.find(';', m.end())
        if open_at < 0 or (0 <= semi < open_at):
            continue
        depth, j = 0, open_at
        while j < len(code):
            if code[j] == '{':
                depth += 1
            elif code[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        for k in range(m.start(), min(j + 1, len(code))):
            if chars[k] != '\n':
                chars[k] = ' '
    return ''.join(chars)


def hits_in(text):
    """(line number, pattern name, source line stripped) for every fallback outside tests."""
    code = without_tests(blank(text))
    lines = text.split('\n')
    found = []
    for name, pattern in PATTERNS:
        for m in pattern.finditer(code):
            line = code.count('\n', 0, m.start())
            found.append((line + 1, name, lines[line].strip()))
    return sorted(found)


def parse_allow(text):
    """{(path, line): count}, and the problems with the file."""
    entries, problems, reason = {}, [], None
    for number, raw in enumerate(text.split('\n'), 1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith('## '):
            reason = line[3:].strip() or None
            continue
        if line.startswith('#'):
            continue
        path, sep, source = line.partition(': ')
        if not sep or not source.strip():
            problems.append(f'allow-list line {number}: expected "<path>: <source line>"')
            continue
        if reason is None:
            problems.append(f'allow-list line {number}: no "## reason" line above it')
            continue
        key = (path.strip(), source.strip())
        entries[key] = entries.get(key, 0) + 1
    return entries, problems


def check(root, allow_text, dirs=DIRS):
    allowed, problems = parse_allow(allow_text)
    seen = {}
    for d in dirs:
        for p in sorted((root / d).rglob('*.rs')):
            rel = p.relative_to(root).as_posix()
            for number, name, source in hits_in(p.read_text()):
                key = (rel, source)
                seen[key] = seen.get(key, 0) + 1
                if seen[key] > allowed.get(key, 0):
                    problems.append(f'{rel}:{number}: `{name}` fallback: route a ratio through crate::check, '
                                    f'or list the line in {ALLOW.relative_to(ROOT)} with a reason')
    for key, count in sorted(allowed.items()):
        if seen.get(key, 0) < count:
            problems.append(f'allow-list entry no longer matches: {key[0]}: {key[1]}')
    return problems


def main():
    problems = check(ROOT, ALLOW.read_text())
    for p in problems:
        print(p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())

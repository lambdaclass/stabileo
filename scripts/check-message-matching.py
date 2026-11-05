"""Fail on code that matches the text of an error or diagnostic message: when the wording changes the
match stops, silently. Branch on a DiagnosticCode or a known-issue id. Engine code may not match a
string literal at all; web and script code may not match a message-named value or a literal that
spells prose or a code. Existing lines are listed in scripts/message-match-allow.txt under a reason."""
import bisect
import importlib.util
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ALLOW = ROOT / 'scripts/message-match-allow.txt'
_spec = importlib.util.spec_from_file_location('check_fail_closed', ROOT / 'scripts/check-fail-closed.py')
_rust = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rust)

SOURCES = (
    ('engine/src', ('.rs',)),
    ('web/src', ('.ts', '.svelte', '.js', '.mjs', '.cjs')),
    ('web/scripts', ('.ts', '.js', '.mjs', '.cjs')),
    ('scripts', ('.py', '.js', '.mjs', '.cjs')),
    ('.github/scripts', ('.py', '.js', '.mjs', '.cjs')),
)
SKIP = re.compile(r'(^|/)(__tests__|tests|e2e|node_modules)/|\.(test|spec)\.[a-z]+$|^web/src/lib/wasm/')

MESSAGE_PARTS = {'err', 'errs', 'error', 'errors', 'msg', 'msgs', 'message', 'messages', 'reason', 'reasons',
                 'warning', 'warnings', 'diag', 'diags', 'diagnostic', 'diagnostics', 'refusal', 'refusals',
                 'stderr', 'failure', 'failures', 'problem', 'problems'}
CODE = re.compile(r'\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]{2,})+\b|known issue #')
QUOTED = re.compile(r"""'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\\n])*`|(?<![\w$)\]])/(?![/*\s])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/""")
PROSE = re.compile(r'[A-Za-z]{2,}(?: |\\s)[+*]?[A-Za-z]{2,}')
LITERAL = r"""'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\\n])*`"""
HINT = re.compile(r'(?i)err|msg|message|reason|warn|diag|refus|std|fail|problem|String\(')
STRING_OF_E = re.compile(r'\bString\(\s*\(?\s*e\b')


def parts(expr):
    for word in re.findall(r'[A-Za-z_$][A-Za-z0-9_$]*', expr):
        yield from (w.lower() for w in re.findall(r'[A-Z]{2,}(?![a-z])|[A-Z]?[a-z]+|[A-Z]', word))


def message_like(expr, aliases=frozenset()):
    """Whether an expression names an error or diagnostic message, or a local copied from one."""
    if HINT.search(expr) and (any(w in MESSAGE_PARTS for w in parts(expr)) or STRING_OF_E.search(expr)):
        return True
    if not aliases:
        return False
    return any(name in aliases for name in re.findall(r'[A-Za-z_$][\w$]*', expr))


ALIAS = re.compile(r'(?:\b(?:const|let|var)\s+(?:mut\s+)?|^\s*)([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=(?![=>])\s*([^;\n]+)', re.M)


def aliases_in(code):
    """Names assigned from a message-like expression in `code`, e.g. `lc` in `const lc = msg.toLowerCase()`."""
    found = set()
    for _ in range(2):
        found |= {m[1] for m in ALIAS.finditer(code) if message_like(m[2], found)}
    return frozenset(found)


def spells_text(literal):
    """Whether a string or regex literal spells message prose ("no compressed elements") or a code (`TH-NONFINITE`)."""
    return any(CODE.search(q) or PROSE.search(q) for q in QUOTED.findall(literal))


def receiver(prefix):
    """The expression a method is called on: the trailing chain of `prefix`."""
    depth, i = 0, len(prefix)
    while i > 0:
        c = prefix[i - 1]
        if c in ')]':
            depth += 1
        elif c in '([':
            if depth == 0:
                break
            depth -= 1
        elif depth == 0 and not (c.isalnum() or c in '_$.?&*!'):
            break
        i -= 1
    return prefix[i:]


REGEX_AT = re.compile(r'/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/')


def call_arg(text, at):
    """The first argument of the call whose `(` ends just before `at`, as source."""
    depth, j = 0, at
    while j < len(text):
        c = text[j]
        if c in '\'"`':
            k = j + 1
            while k < len(text) and text[k] != c and (c == '`' or text[k] != '\n'):
                k += 2 if text[k] == '\\' else 1
            j = k
        elif c == '/' and (text[at:j].rstrip()[-1:] or '(') in '(,=:[!&|?{};' and REGEX_AT.match(text, j):
            j = REGEX_AT.match(text, j).end() - 1
        elif c in '([{':
            depth += 1
        elif c in ')]}':
            if depth == 0:
                break
            depth -= 1
        elif c == ',' and depth == 0:
            break
        j += 1
        if j - at > 400:
            break
    return text[at:j]


RUST_CALL = re.compile(r'\.(contains|starts_with|ends_with|find|rfind|strip_prefix|strip_suffix|split_once|rsplit_once|'
                       r'matches|match_indices|trim_start_matches|trim_end_matches)\(')
RUST_LITERAL = re.compile(r'\s*&?\s*(?:"|r#*"|format!)')
RUST_EQ = re.compile(r'(==|!=)')
RUST_MATCH = re.compile(r'\bmatch\s+([^{};]*?(?:\.as_str\(\)|\.as_ref\(\)|&\*)[^{};]*)\{')


def rust_hits(text):
    code = _rust.without_tests(_rust.blank(text))
    lines, code_lines = text.split('\n'), code.split('\n')
    starts = [0]
    for line in code_lines[:-1]:
        starts.append(starts[-1] + len(line) + 1)
    found = []
    for m in RUST_CALL.finditer(code):
        line = code.count('\n', 0, m.start())
        recv = receiver(code[starts[line]:m.start()])
        closure = text[m.end():m.end() + 40].lstrip().startswith(('|', 'move |'))
        if RUST_LITERAL.match(text, m.end()) or (message_like(recv) and not closure):
            found.append((line + 1, f'.{m[1]}('))
    for m in RUST_MATCH.finditer(code):
        if message_like(m[1]):
            found.append((code.count('\n', 0, m.start()) + 1, 'match'))
    for m in RUST_EQ.finditer(code):
        if not text[m.end():m.end() + 40].lstrip().startswith('"'):
            continue
        line = code.count('\n', 0, m.start())
        if message_like(receiver(code[starts[line]:m.start()].rstrip())):
            found.append((line + 1, m[1]))
    for m in re.finditer(r'\bRegex::new\(', code):
        found.append((code.count('\n', 0, m.start()) + 1, 'Regex::new'))
    return [(n, name, lines[n - 1].strip()) for n, name in sorted(set(found))]


JS_CALL = re.compile(r'\??\.(includes|startsWith|endsWith|indexOf|lastIndexOf|match|matchAll|search|replace|replaceAll|split)\(')
JS_TRANSFORM = {'replace', 'replaceAll', 'split'}
JS_SWITCH = re.compile(r'\bswitch\s*\(([^)]*)\)')
JS_REGEX_LITERAL = r'/(?![/*\s])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/[dgimsuyv]*'
JS_REGEX_CALL = re.compile(rf'({JS_REGEX_LITERAL}|\b[A-Za-z_$][\w$]*)\.(test|exec)\(')
JS_REGEX = re.compile(rf'(?<![\w$)\]])\s*{JS_REGEX_LITERAL}')
JS_EQ = re.compile(r'(?<![<>=!])(===?|!==?)(?!=)')
JS_LITERAL_AFTER = re.compile(rf'\s*({LITERAL})')
JS_LITERAL_BEFORE = re.compile(rf'({LITERAL})\s*$')


def lines_of(text, comment):
    """A function from an offset in `text` to (line number, stripped line), or None on a comment line."""
    lines = text.split('\n')
    starts = [0]
    for line in lines[:-1]:
        starts.append(starts[-1] + len(line) + 1)

    def at(offset):
        n = bisect.bisect_right(starts, offset)
        s = lines[n - 1].strip()
        return None if s.startswith(comment) else (n, s)
    return at


def before(text, at):
    return receiver(text[max(0, at - 400):at].rstrip())


EXPLICIT_MESSAGE = {'message', 'msg', 'stderr'}


def explicit_message(value):
    """Whether `value` ends in a message field, like `error.message`: any string compared to it is message text."""
    words = re.findall(r'[A-Za-z_$][\w$]*', value)
    return bool(words) and words[-1].lower() in EXPLICIT_MESSAGE


JS_TEXT_REGEX = re.compile(rf'\b([A-Za-z_$][\w$]*)\s*=\s*({JS_REGEX_LITERAL}|new RegExp\(\s*(?:{LITERAL}))')


def js_hits(text):
    found, aliases, line = [], aliases_in(text), lines_of(text, ('//', '*', '/*'))
    text_regexes = {m[1] for m in JS_TEXT_REGEX.finditer(text) if spells_text(m[2])}

    def hit(offset, name):
        where = line(offset)
        if where:
            found.append((where[0], name, where[1]))

    for m in JS_CALL.finditer(text):
        arg = call_arg(text, m.end())
        on_message = message_like(before(text, m.start()), aliases) and m[1] not in JS_TRANSFORM
        if on_message or spells_text(arg) or arg.strip() in text_regexes:
            hit(m.start(), f'.{m[1]}(')
    for m in JS_SWITCH.finditer(text):
        if message_like(m[1], aliases):
            hit(m.start(), 'switch')
    for m in JS_REGEX_CALL.finditer(text):
        literal = m[1].startswith('/') and spells_text(m[1])
        if message_like(call_arg(text, m.end()), aliases) or literal or m[1] in text_regexes:
            hit(m.start(), f'.{m[2]}(')
    for m in JS_REGEX.finditer(text):
        if CODE.search(m[0]):
            hit(m.start(), 'regex')
    for m in JS_EQ.finditer(text):
        after = JS_LITERAL_AFTER.match(text, m.end())
        left = text[max(0, m.start() - 400):m.start()]
        before_literal = None if after else JS_LITERAL_BEFORE.search(left)
        if after:
            value, literal = receiver(left.rstrip()), after[1]
        elif before_literal:
            value, literal = re.match(r'\s*([\w$.?\[\]()]*)', text[m.end():m.end() + 200])[1], before_literal[1]
        else:
            continue
        typeof = after and re.search(r'\btypeof\s*$', left.rstrip()[:len(left.rstrip()) - len(value)])
        if message_like(value, aliases) and (spells_text(literal) or (explicit_message(value) and not typeof)):
            hit(m.start(), m[1])
    return sorted(set(found))


PY_CALL = re.compile(r'\.(startswith|endswith|find|rfind|index|rindex|count)\(')
PY_RE = re.compile(r'\b(?:re\.(search|match|fullmatch|findall|finditer)\(|([A-Za-z_]\w*)\.(search|match|fullmatch|findall|finditer)\()')
PY_LITERAL = r"""[rbfu]{0,2}(?:'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")"""
PY_IN = re.compile(rf'({PY_LITERAL})\s+(?:not\s+)?in\s+([\w.\[\]()\'"]+)')
PY_EQ = re.compile(rf'([\w.\[\]()\'"]+)\s*(==|!=)\s*({PY_LITERAL})')


def py_hits(text):
    found, aliases, line = [], aliases_in(text), lines_of(text, '#')

    def hit(offset, name):
        where = line(offset)
        if where:
            found.append((where[0], name, where[1]))

    for m in PY_CALL.finditer(text):
        if message_like(before(text, m.start()), aliases) or spells_text(call_arg(text, m.end())):
            hit(m.start(), f'.{m[1]}(')
    for m in PY_RE.finditer(text):
        first = call_arg(text, m.end())
        target = call_arg(text, m.end() + len(first) + 1) if m[1] else first
        if message_like(target, aliases) or (m[1] and spells_text(first)):
            hit(m.start(), f'.{m[1] or m[3]}(')
    for m in PY_IN.finditer(text):
        if message_like(m[2], aliases) or spells_text(m[1]):
            hit(m.start(), 'in')
    for m in PY_EQ.finditer(text):
        if message_like(m[1], aliases) and (spells_text(m[3]) or explicit_message(m[1])):
            hit(m.start(), m[2])
    return sorted(set(found))


def hits_in(rel, text):
    """(line number, pattern, source line stripped) for every match on message text in `rel`."""
    if rel.endswith('.rs'):
        return rust_hits(text)
    if rel.endswith('.py'):
        return py_hits(text)
    return js_hits(text)


def files(root, sources=SOURCES):
    for d, suffixes in sources:
        base = root / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob('*')):
            rel = p.relative_to(root).as_posix()
            if p.is_file() and p.suffix in suffixes and not SKIP.search(rel):
                yield rel, p


def scan(root, sources=SOURCES):
    return [(rel, n, name, src) for rel, p in files(root, sources)
            for n, name, src in hits_in(rel, p.read_text(errors='replace'))]


def check(root, allow_text, sources=SOURCES):
    allowed, problems = _rust.parse_allow(allow_text)
    seen = {}
    for rel, number, name, source in scan(root, sources):
        key = (rel, source)
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > allowed.get(key, 0):
            problems.append(f'{rel}:{number}: `{name}` matches message text: branch on a DiagnosticCode or a '
                            f'known-issue id instead, or list the line in {ALLOW.relative_to(ROOT)} with a reason')
    for key, count in sorted(allowed.items()):
        if seen.get(key, 0) < count:
            problems.append(f'allow-list entry no longer matches: {key[0]}: {key[1]}')
    return problems


def main(argv):
    if argv[1:] == ['--list']:
        for rel, number, name, source in scan(ROOT):
            print(f'{rel}:{number}: {name}: {source}')
        return 0
    problems = check(ROOT, ALLOW.read_text())
    for p in problems:
        print(p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))

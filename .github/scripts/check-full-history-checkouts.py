"""Every workflow job that builds or tests the web app checks this repository out with its whole history.

The web build numbers results versions from the order their registry entries reached main
(web/scripts/result-changes/registry.mjs), so a shallow checkout cannot build it.
"""
from pathlib import Path
import re
import sys

WEB = re.compile(
    r'make\s+(?:-C\s+\S+\s+)?(?:web\.(?:build|run)\b|test\.web\b|test\.web\.|e2e\.web\.|typecheck\.web\b'
    r'|check\.results-snapshot-gate\b|result-changes\.order\b)'
    r'|\bnpx\s|\bnpm\s+(?:run|test|exec)\b|\bvitest\b|\bvite\s'
)


def jobs(text):
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if re.match(r'jobs:\s*$', l))
    except StopIteration:
        return []
    out = []
    for i in range(start + 1, len(lines)):
        m = re.match(r'  ([A-Za-z0-9_-]+):\s*$', lines[i])
        if m:
            out.append([m.group(1), i + 1, []])
        elif out and (lines[i].startswith('   ') or not lines[i].strip()):
            out[-1][2].append(lines[i])
        elif lines[i].strip() and not lines[i].startswith(' '):
            break
    return [(name, line, body) for name, line, body in out]


def checkouts(body):
    found = []
    for i, line in enumerate(body):
        m = re.match(r'(\s*)(?:- )?uses:\s*actions/checkout@', line)
        if not m:
            continue
        dash = len(re.match(r'\s*', body[i - 1] if not line.lstrip().startswith('- ') and i else line).group(0))
        keys = {}
        for nxt in body[i + 1:]:
            if not nxt.strip() or nxt.lstrip().startswith('#'):
                continue
            indent = len(nxt) - len(nxt.lstrip())
            if indent <= dash:
                break
            kv = re.match(r'\s*(?:- )?([A-Za-z_-]+):\s*(.*?)\s*(?:#.*)?$', nxt)
            if kv:
                keys[kv.group(1)] = kv.group(2).strip('\'"')
        found.append(keys)
    return found


def violations(root):
    root = Path(root)
    out = []
    for wf in sorted((root / '.github/workflows').glob('*.y*ml')):
        for name, line, body in jobs(wf.read_text()):
            if not WEB.search('\n'.join(body)):
                continue
            for keys in checkouts(body):
                if keys.get('repository') not in (None, '', '${{ github.repository }}'):
                    continue
                if keys.get('fetch-depth') != '0':
                    out.append(f'{wf.relative_to(root).as_posix()}:{line} job {name}: checks out without fetch-depth: 0 but builds or tests the web app')
    return out


if __name__ == '__main__':
    found = violations(Path(__file__).resolve().parents[2])
    for v in found:
        print(v)
    if found:
        print('the web build reads results versions from main\'s history: give these checkouts fetch-depth: 0 and filter: blob:none')
        sys.exit(1)

#!/usr/bin/env python3
"""resolve-second-round.py <worktree>: gallery-content.test.ts conflicts where both sides added papers
to SECOND_ROUND: keep main's wording and the union of ids."""
import re, sys
p = sys.argv[1] + "/web/src/components/research/__tests__/gallery-content.test.ts"; s = open(p).read()
pat = re.compile(r"<<<<<<< [^\n]*\n(.*?)(?:\|\|\|\|\|\|\| [^\n]*\n.*?)?=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
def fix(m):
    ours, theirs = m.group(1), m.group(2)
    ids = []
    for side in (theirs, ours):
        for g in re.findall(r"SECOND_ROUND = new Set\(\[(.*?)\]\)", side):
            ids += [i for i in re.findall(r"'([^']+)'", g) if i not in ids]
    if not ids: raise SystemExit("unhandled conflict:\n" + m.group(0))
    return re.sub(r"SECOND_ROUND = new Set\(\[.*?\]\)", "SECOND_ROUND = new Set([" + ", ".join(f"'{i}'" for i in ids) + "])", theirs)
s = pat.sub(fix, s); assert "<<<<<<<" not in s
decls = list(re.finditer(r"^(?:/\*\*[^\n]*\*/\n)?const SECOND_ROUND = new Set\(\[(.*?)\]\);\n", s, re.M))
if len(decls) > 1:
    ids = []
    for d in decls:
        ids += [i for i in re.findall(r"'([^']+)'", d.group(1)) if i not in ids]
    for d in reversed(decls[:-1]): s = s[:d.start()] + s[d.end():]
    s = re.sub(r"const SECOND_ROUND = new Set\(\[.*?\]\)", "const SECOND_ROUND = new Set([" + ", ".join(f"'{i}'" for i in ids) + "])", s)
open(p, "w").write(s); print("resolved", p)

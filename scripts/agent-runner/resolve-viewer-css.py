#!/usr/bin/env python3
"""resolve-viewer-css.py <worktree>: ScalarFieldViewer.svelte style conflicts after main made viewer
controls 44 px / 12 px: rule blocks -> union (ours, then main's); the editor-button font block ->
main's min-height plus the larger of the two fonts (12px)."""
import re, sys
p = sys.argv[1] + "/web/src/components/viewport/ScalarFieldViewer.svelte"; s = open(p).read()
pat = re.compile(r"<<<<<<< [^\n]*\n(.*?)\|\|\|\|\|\|\| [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
def fix(m):
    ours, base, theirs = m.groups()
    if "font:" in base or "font:" in theirs:
        return "    min-height: 44px;\n    font: 12px var(--st-sans);\n"
    if base.strip() == "" and "{" in ours + theirs:
        return ours + theirs
    raise SystemExit("unhandled block:\n" + m.group(0))
s = pat.sub(fix, s); assert "<<<<<<<" not in s
open(p, "w").write(s); print("resolved", p)

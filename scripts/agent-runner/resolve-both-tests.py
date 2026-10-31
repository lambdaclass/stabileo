#!/usr/bin/env python3
"""resolve-both-tests.py <file>: conflicts where each side added a different new test at the same spot
(empty base): keep both, ours first, each closed."""
import re, sys
p = sys.argv[1]; s = open(p).read()
pat = re.compile(r"<<<<<<< [^\n]*\n(.*?)\|\|\|\|\|\|\| [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
def fix(m):
    ours, base, theirs = m.groups()
    if base.strip(): raise SystemExit("base not empty: not a both-added-tests conflict")
    return ours + "});\n\n" + theirs
s = pat.sub(fix, s); assert "<<<<<<<" not in s
open(p, "w").write(s); print("resolved", p)

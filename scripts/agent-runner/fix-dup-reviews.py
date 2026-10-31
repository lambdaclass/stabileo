#!/usr/bin/env python3
"""fix-dup-reviews.py <papers.yaml>: a merge of main can leave a paper with two `reviews:` keys
(main's round-1 list and the branch's list). Merge them into one list: the later block's items
(main's) first, then the earlier block's."""
import re, sys
path = sys.argv[1]
lines = open(path).read().split("\n")
def block_end(i):  # i = index of "  reviews:"; items are lines indented deeper than 2 spaces
    j = i + 1
    while j < len(lines) and (lines[j].startswith("  - ") or lines[j].startswith("    ")): j += 1
    return j
out, i, fixed = [], 0, []
while i < len(lines):
    if re.match(r"- id: ", lines[i]):
        j = i + 1
        while j < len(lines) and not re.match(r"- id: ", lines[j]) and lines[j].strip() != "" or (j < len(lines) and lines[j].startswith("  ")): j += 1
        sec = lines[i:j]
        idx = [k for k, l in enumerate(sec) if l == "  reviews:"]
        if len(idx) == 2:
            a, b = idx
            ea = a + 1
            while ea < len(sec) and (sec[ea].startswith("  - ") or sec[ea].startswith("    ")): ea += 1
            eb = b + 1
            while eb < len(sec) and (sec[eb].startswith("  - ") or sec[eb].startswith("    ")): eb += 1
            first, second = sec[a + 1:ea], sec[b + 1:eb]
            sec = sec[:a] + sec[ea:b] + ["  reviews:"] + second + first + sec[eb:]
            fixed.append(lines[i][6:])
        out += sec; i = j
    else:
        out.append(lines[i]); i += 1
open(path, "w").write("\n".join(out))
print("merged duplicate reviews for:", fixed)

#!/usr/bin/env python3
"""Equivalent mutants in constant index arithmetic (scripts/mutants.sh).

    cargo mutants --list --json ... | scripts/mutants-equivalent.py [--regex] [--explain]

Prints, one per line, the names (with --regex: anchored, escaped regexes for
cargo-mutants' --exclude-re) of the mutants that provably cannot change
the program: a binary operator inside an index made only of integer literals
(`k[0 * 6 + 0]`, the row-major indexing of the element kernels) whose
mutated index has the same value (`0 * 6 - 0`, `0 / 6 + 0`). No test can
catch such a mutant, so mutants.sh excludes it instead of letting it fail
the run.

The check is exact and is redone on every run from the current source: the
original and the mutated index are both evaluated (Rust integer semantics)
and the mutant is excluded only when they are equal. A mutant that changes
the index (`0 * 6 + 3` -> `0 * 6 - 3`, `1 * 6 + 3` -> `1 * 6 - 3`) is not
excluded: it reads or writes another matrix entry, and the tests must catch it.
"""
import ast
import json
import re
import sys

LITERAL_INDEX = re.compile(r"^[0-9_\s+\-*/%()]+$")
OPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b}


def rust_eval(expr):
    """Value of an integer-literal expression with Rust's operators, or None
    if it is not one, divides by zero or goes negative (usize indices)."""
    try:
        tree = ast.parse(expr.replace("_", ""), mode="eval").body
    except SyntaxError:
        return None

    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, int):
            return n.value
        if isinstance(n, ast.BinOp):
            a, b = ev(n.left), ev(n.right)
            if a is None or b is None:
                return None
            if type(n.op) in OPS:
                v = OPS[type(n.op)](a, b)
            elif isinstance(n.op, (ast.Div, ast.FloorDiv, ast.Mod)):
                if b == 0:
                    return None
                v = a // b if not isinstance(n.op, ast.Mod) else a % b  # operands are >= 0
            else:
                return None
            return v if v >= 0 else None
        return None

    return ev(tree)


def enclosing_index(line, col):
    """(start, end) of the [...] around 0-based column col, or None."""
    depth, start = 0, None
    for i in range(col, -1, -1):
        if line[i] == "]":
            depth += 1
        elif line[i] == "[":
            if depth == 0:
                start = i
                break
            depth -= 1
    if start is None:
        return None
    depth = 0
    for j in range(start + 1, len(line)):
        if line[j] == "[":
            depth += 1
        elif line[j] == "]":
            if depth == 0:
                return start + 1, j
            depth -= 1
    return None


def equivalent(m, sources):
    if m.get("genre") != "BinaryOperator":
        return False
    sp = m["span"]
    if sp["start"]["line"] != sp["end"]["line"]:
        return False
    lines = sources.setdefault(m["file"], open(m["file"], encoding="utf-8").read().split("\n"))
    line = lines[sp["start"]["line"] - 1]
    c0, c1 = sp["start"]["column"] - 1, sp["end"]["column"] - 1  # 1-based columns, end exclusive
    rng = enclosing_index(line, c0)
    if rng is None:
        return False
    a, b = rng
    inner = line[a:b]
    if not LITERAL_INDEX.match(inner) or not inner.strip():
        return False
    original = rust_eval(inner)
    mutated = rust_eval(line[a:c0] + m["replacement"] + line[c1:b])
    return original is not None and mutated is not None and original == mutated


def main():
    sources = {}
    explain = "--explain" in sys.argv
    as_regex = "--regex" in sys.argv
    for m in json.load(sys.stdin):
        if equivalent(m, sources):
            print("^" + re.escape(m["name"]) + "$" if as_regex else m["name"])
            if explain:
                sp = m["span"]["start"]
                print("    " + sources[m["file"]][sp["line"] - 1].strip(), file=sys.stderr)


if __name__ == "__main__":
    main()

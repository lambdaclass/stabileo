#!/usr/bin/env python3
"""Every engine test file is compiled into exactly one test binary.

engine/Cargo.toml sets `autotests = false` and lists its test binaries: the top-level
engine/tests/*.rs files are modules of a few binaries (engine/tests/<binary>/main.rs,
`#[path = "../<file>.rs"] mod <file>;`) instead of 100+ binaries that each link the engine.
Without discovery, a new tests/*.rs that nobody adds to a main.rs would never be compiled, and
its tests would silently never run. This check fails on that, on a file included twice (its
tests would run twice), on a [[test]] whose path does not exist, and on a tests/*/main.rs that
no [[test]] builds.

Run from anywhere: python3 -I scripts/check-test-targets.py
"""
import pathlib
import re
import sys
import tomllib

root = pathlib.Path(__file__).resolve().parent.parent / "engine"
tests = root / "tests"
errors = []

manifest = tomllib.loads((root / "Cargo.toml").read_text())
if manifest["package"].get("autotests", True):
    errors.append("engine/Cargo.toml: expected autotests = false (the binaries are listed)")
targets = {t["name"]: t["path"] for t in manifest.get("test", [])}

for name, path in targets.items():
    if not (root / path).is_file():
        errors.append(f"[[test]] {name}: {path} does not exist")
listed = {(root / p).resolve() for p in targets.values()}
for main in sorted(tests.glob("*/main.rs")):
    if main.resolve() not in listed:
        errors.append(f"{main.relative_to(root)} is not a [[test]] in engine/Cargo.toml: it never runs")

included = {}
path_mod = re.compile(r'^#\[path = "\.\./([A-Za-z0-9_]+)\.rs"\]\s*\nmod ([A-Za-z0-9_]+);', re.M)
for name, path in targets.items():
    for file, module in path_mod.findall((root / path).read_text()):
        if file != module:
            errors.append(f"{path}: module {module} includes {file}.rs (name them the same)")
        included.setdefault(file, []).append(name)

for f in sorted(tests.glob("*.rs")):
    bins = included.get(f.stem, [])
    if not bins:
        errors.append(f"tests/{f.name} is in no test binary: add it to one tests/<binary>/main.rs")
    elif len(bins) > 1:
        errors.append(f"tests/{f.name} is in {len(bins)} binaries ({', '.join(bins)}): its tests run twice")
for file in sorted(set(included) - {f.stem for f in tests.glob("*.rs")}):
    errors.append(f"tests/{file}.rs is included by {', '.join(included[file])} but does not exist")

if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"{len(targets)} test binaries; {len(included)} top-level test files, each in exactly one")

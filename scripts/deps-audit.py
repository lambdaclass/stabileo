#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HELD = re.compile(r"Unchanged (\S+) v(\S+) \(available: v(\S+)\)")


def compatible_key(version):
    parts = [int(p) if p.isdigit() else 0 for p in re.split(r"[.+-]", version)[:3]]
    parts += [0] * (3 - len(parts))
    major, minor, patch = parts
    return (major,) if major else (0, minor) if minor else (0, 0, patch)


def rust_rows(text):
    rows = set()
    for name, cur, new in HELD.findall(text):
        if compatible_key(cur) != compatible_key(new):
            rows.add((name, cur, new))
    return sorted(rows)


def npm_rows(data):
    rows = []
    for name, entries in sorted(data.items()):
        for v in entries if isinstance(entries, list) else [entries]:
            cur, latest = v.get("current"), v.get("latest")
            if cur and latest and compatible_key(cur) != compatible_key(latest):
                rows.append((name, v.get("dependent") or v.get("location") or "", cur, v.get("wanted", ""), latest))
    return sorted(set(rows))


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(r) + " |" for r in rows] or ["| (none) |" + " |" * (len(header) - 1)]
    return "\n".join(lines)


def main(out):
    cargo = subprocess.run(["cargo", "update", "--workspace", "--dry-run", "--verbose"], cwd=ROOT, capture_output=True, text=True)
    if cargo.returncode != 0:
        raise SystemExit(f"deps-audit: cargo update --dry-run failed:\n{cargo.stderr}")
    npm = subprocess.run(["npm", "outdated", "--json"], cwd=ROOT / "web", capture_output=True, text=True)
    if npm.returncode not in (0, 1):
        raise SystemExit(f"deps-audit: npm outdated failed:\n{npm.stderr}")
    try:
        outdated = json.loads(npm.stdout or "{}")
    except ValueError as e:
        raise SystemExit(f"deps-audit: npm outdated gave no JSON ({e})")
    if not isinstance(outdated, dict) or "error" in outdated:
        raise SystemExit(f"deps-audit: npm outdated failed: {outdated}")
    report = "\n\n".join([
        "## Rust: releases the lockfile cannot take without a semver-incompatible bump",
        table(["crate", "locked", "latest"], rust_rows(cargo.stderr + cargo.stdout)),
        "## Web: packages behind a semver-incompatible release",
        table(["package", "workspace", "current", "wanted", "latest"], npm_rows(outdated)),
    ]) + "\n"
    Path(out).write_text(report)
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "deps-audit.md"))

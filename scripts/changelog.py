#!/usr/bin/env python3
"""Unreleased changes live one per file in changelog.d/, and go into CHANGELOG.md at release.

Every PR used to add its entry under "## Unreleased" in CHANGELOG.md, at the same place, so
parallel PRs conflicted there on nearly every merge. Now each adds its own file:

    changelog.d/<short-slug>.md
        ### Fixed                      <- the section: one of SECTIONS below
        #### What changed (2026-10-22)  <- the entry's title, as before
        The body, as before.

    scripts/changelog.py --check                   # CI: every fragment is well formed
    scripts/changelog.py --release 0.3.1 2026-10-23  # move them under "## 0.3.1 (2026-10-23)"
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRAGMENTS = ROOT / "changelog.d"
CHANGELOG = ROOT / "CHANGELOG.md"
# The order a release lists them in.
SECTIONS = ["BREAKING (results)", "Security", "Added", "Changed", "Fixed", "Performance"]
UNRELEASED = "## Unreleased\n\nOne file per change in [`changelog.d/`](changelog.d/README.md); `scripts/changelog.py --release` moves them here.\n"


def fragments():
    return sorted(p for p in FRAGMENTS.glob("*.md") if p.name != "README.md")


def parse(path):
    text = path.read_text().strip() + "\n"
    first, _, rest = text.partition("\n")
    m = re.fullmatch(r"### (.+)", first.strip())
    problems = []
    if not m or m.group(1) not in SECTIONS:
        problems.append(f"{path.name}: the first line must be '### <section>', one of {SECTIONS}")
    if not re.search(r"^#### .+", rest, re.M):
        problems.append(f"{path.name}: needs a '#### <title>' line")
    if re.search(r"^##? ", rest, re.M) or re.search(r"^### ", rest, re.M):
        problems.append(f"{path.name}: only one '### <section>' line, at the top")
    return (m.group(1) if m else None), rest.strip() + "\n", problems


def check():
    problems = [p for f in fragments() for p in parse(f)[2]]
    for p in problems:
        print(p, file=sys.stderr)
    return 1 if problems else 0


def release(version, date):
    if check():
        return 1
    by_section = {s: [] for s in SECTIONS}
    for f in fragments():
        section, body, _ = parse(f)
        by_section[section].append(body)
    block = f"## {version} ({date})\n"
    for s in SECTIONS:
        if by_section[s]:
            block += f"\n### {s}\n\n" + "\n".join(by_section[s])
    log = CHANGELOG.read_text()
    start = log.index("## Unreleased")
    end = log.index("\n## ", start + 1) + 1
    CHANGELOG.write_text(log[:start] + UNRELEASED + "\n" + block + "\n" + log[end:])
    for f in fragments():
        f.unlink()
    print(f"CHANGELOG.md: {version} with {sum(map(len, by_section.values()))} entries")
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        sys.exit(check())
    if len(sys.argv) == 4 and sys.argv[1] == "--release":
        sys.exit(release(sys.argv[2], sys.argv[3]))
    print(__doc__)
    sys.exit(2)

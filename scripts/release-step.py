#!/usr/bin/env python3
"""The release step: changelog.d/ into CHANGELOG.md, and everything that has to follow it.

    make release.step VERSION=0.5.0 DATE=2026-11-06

1. scripts/changelog.py --release moves every fragment under "## VERSION (DATE)".
2. The release-notes line is added under that heading when docs/releases/vVERSION.md exists.
3. Links in the moved text are rebased from changelog.d/ to the repository root.
4. Result-change entries that linked a fragment link CHANGELOG.md, under the same heading.
5. Every tracked Cargo.lock that pins dedaliano-engine is relocked to engine/Cargo.toml's version.

It fails if a moved link still climbs out of the root, a registry entry still names changelog.d/,
or a lock pins another engine version.
"""
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "web/src/lib/provenance/result-changes"
LANGUAGES = [("es", "Spanish"), ("pt", "Portuguese"), ("de", "German"), ("fr", "French"), ("tr", "Turkish")]
ENGINE = "dedaliano-engine"
INLINE = re.compile(r"(\]\(\s*<?)\.\./")
REFERENCE = re.compile(r"^( {0,3}\[[^\]]+\]:\s*<?)\.\./", re.M)
CLIMBING = re.compile(INLINE.pattern + "|" + REFERENCE.pattern, re.M)


def section_bounds(log, version, date):
    heading = f"## {version} ({date})\n"
    start = log.index(heading)
    end = log.find("\n## ", start + len(heading))
    return start, len(log) if end < 0 else end + 1


def notes_line(version, root=ROOT):
    english = root / f"docs/releases/v{version}.md"
    if not english.exists():
        return ""
    others = [f"[{name}](docs/releases/v{version}.{code}.md)" for code, name in LANGUAGES
              if (root / f"docs/releases/v{version}.{code}.md").exists()]
    also = ""
    if others:
        also = " (also in " + (", ".join(others[:-1]) + " and " + others[-1] if len(others) > 1 else others[0]) + ")"
    return f"Release notes: [`docs/releases/v{version}.md`](docs/releases/v{version}.md){also}.\n\n"


def rebase_section(log, version, date, line=""):
    start, end = section_bounds(log, version, date)
    heading = f"## {version} ({date})\n\n"
    body = changelog_module().rebase_fragment_links(log[start + len(heading):end])
    return log[:start] + heading + line + body + log[end:]


def climbing_links(log, version, date):
    start, end = section_bounds(log, version, date)
    return [m.group(0) for m in CLIMBING.finditer(log[start:end])]


def links_fragment(entry):
    if "changes" in entry:
        return any(links_fragment(change) for change in entry["changes"])
    return str(entry.get("changelog", {}).get("file", "")).startswith("changelog.d/")


def repoint_registry(directory=REGISTRY):
    changed = []
    for path in sorted(directory.glob("*.json")):
        text = path.read_text()
        if not links_fragment(json.loads(text)):
            continue
        new = re.sub(r'"changelog\.d(?:/|\\/)[^"]*"', '"CHANGELOG.md"', text)
        if links_fragment(json.loads(new)):
            entry = json.loads(text)
            for change in entry.get("changes", [entry]):
                if links_fragment(change):
                    change["changelog"]["file"] = "CHANGELOG.md"
            new = json.dumps(entry, indent=2, ensure_ascii=False) + "\n"
        path.write_text(new)
        changed.append(path.name)
    return changed


def registry_fragment_links(directory=REGISTRY):
    return [p.name for p in sorted(directory.glob("*.json")) if links_fragment(json.loads(p.read_text()))]


def engine_version(root=ROOT):
    m = re.search(r'^version\s*=\s*"([^"]+)"', (root / "engine/Cargo.toml").read_text(), re.M)
    return m.group(1)


def locked_engine(lock_text):
    m = re.search(rf'^name = "{ENGINE}"\nversion = "([^"]+)"', lock_text, re.M)
    return m.group(1) if m else None


def stale_locks(locks, version):
    stale = []
    for path, text in locks:
        pinned = locked_engine(text)
        if pinned is not None and pinned != version:
            stale.append(f"{path} pins {ENGINE} {pinned}, not {version}")
    return stale


def tracked_locks(root=ROOT):
    out = subprocess.run(["git", "ls-files", "*Cargo.lock"], cwd=root, capture_output=True, text=True, check=True).stdout
    return [p for p in out.split() if p]


def relock(root=ROOT):
    for lock in tracked_locks(root):
        if locked_engine((root / lock).read_text()) is not None:
            subprocess.run(["cargo", "update", "-p", ENGINE, "--offline", "-q"], cwd=root / pathlib.Path(lock).parent, check=True)


def changelog_module():
    spec = importlib.util.spec_from_file_location("changelog", ROOT / "scripts/changelog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(version, date):
    if changelog_module().release(version, date):
        return 1
    log_path = ROOT / "CHANGELOG.md"
    log = rebase_section(log_path.read_text(), version, date, notes_line(version))
    log_path.write_text(log)
    repoint_registry()
    relock()
    problems = [f"CHANGELOG.md {version} still links {link}" for link in climbing_links(log, version, date)]
    problems += [f"{name} still links changelog.d/" for name in registry_fragment_links()]
    problems += stale_locks([(p, (ROOT / p).read_text()) for p in tracked_locks()], engine_version())
    for p in problems:
        print(f"release-step: {p}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
